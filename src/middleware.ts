import { NextResponse, type NextRequest } from 'next/server';
import { GATE_COOKIE, GATE_MAX_AGE, gateToken, passwordMatches } from '@/lib/wrtt/gate';

/**
 * Three jobs, in order.
 *
 * 1. Make paths case-insensitive. People type /StudForge and paste
 *    /Studforge/, and the router answers 404 to both where /studforge works.
 *    Any path with an uppercase ASCII letter is redirected, permanently, to
 *    its lowercase spelling - the path only, never the query string, whose
 *    values (?from=, ?password=) mean exactly what they say. This runs
 *    first so the host and gate rules below only ever see lowercase.
 *
 * 2. Serve the SLT work on its own domain. slt.ventures points at this same
 *    deployment, and requests arriving on that host are rewritten into /slt -
 *    so slt.ventures/wrtt is /slt/wrtt with the prefix off the address bar.
 *    The /slt paths keep working on the primary domain, and an internal link
 *    to /slt/... followed on slt.ventures redirects to the short form rather
 *    than doubling the prefix.
 *
 * 3. Gate the WRTT console. Not a security boundary: it keeps the console
 *    from being stumbled into by anyone who finds the URL, which matters
 *    because the sheets name real private individuals. A single shared
 *    password, no rate limiting, no per-user identity - rely on it for
 *    nothing stronger than that.
 */

/** Paths the case rule leaves as spelled. /_next and /api are Next's own,
 *  and the API routes are case-sensitive by design. The other two are
 *  third-party drops inside the Primal Hunt build - the vendored three.js
 *  loaders, and Kenney's models, whose .glb files reference
 *  Textures/colormap.png by that spelling - so their mixed-case names are
 *  not ours to flatten. Everything else on disk is already lowercase. */
const CASE_SENSITIVE = /^\/(_next\/|api\/|map-mobile-game\/(vendor|models)\/)/;

/** A path ending in a file extension. The matcher admits files so the case
 *  rule can reach them; the host and gate rules were written for page
 *  paths and never see them. */
const HAS_EXTENSION = /\.[a-z0-9]+$/i;

const SLT_HOST = /(^|\.)slt\.ventures$/i;

/** Static pages that live at the domain root on slt.ventures. Rewritten
 *  straight to their files, like the landing page - a middleware rewrite
 *  does not reliably pass through next.config rewrites afterwards. */
const SLT_STATIC = new Set(['/growth-advisors', '/platforms', '/capital']);

export async function middleware(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').split(':')[0];
  const onSlt = SLT_HOST.test(host);
  const { pathname } = req.nextUrl;

  // Lowercase is canonical. A 308 keeps the method, so a mis-cased POST is
  // replayed rather than turned into a GET, and only the path changes.
  if (/[A-Z]/.test(pathname) && !CASE_SENSITIVE.test(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.toLowerCase();
    return NextResponse.redirect(url, 308);
  }

  // Files fall through here exactly as they did when the matcher excluded
  // them: /slt/site.css on slt.ventures is served as-is, not rewritten.
  if (HAS_EXTENSION.test(pathname)) return NextResponse.next();

  // Long form on the short domain: canonicalize instead of serving the same
  // page at two paths (and instead of rewriting /slt/slt/... into a 404).
  if (onSlt && (pathname === '/slt' || pathname.startsWith('/slt/'))) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice('/slt'.length) || '/';
    return NextResponse.redirect(url, 308);
  }

  // The domain root is the SLT Ventures landing page, which exists as a
  // static file. Rewritten straight to the file rather than to /slt, so it
  // does not depend on next.config rewrites applying after middleware.
  if (onSlt && pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/slt/index.html';
    return NextResponse.rewrite(url);
  }

  if (onSlt && SLT_STATIC.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = `/slt${pathname}.html`;
    return NextResponse.rewrite(url);
  }

  // The path the router will see, and the spellings this host shows the user.
  const internal = onSlt ? `/slt${pathname}` : pathname;
  const gated = internal === '/slt/wrtt' || internal.startsWith('/slt/wrtt/');
  const pass = onSlt
    ? { enter: '/wrtt/enter', home: '/wrtt' }
    : { enter: '/slt/wrtt/enter', home: '/slt/wrtt' };

  if (gated) {
    // ?password= (or ?p=) signs you in and is then removed from the URL by a
    // redirect, so it does not sit in the address bar or travel onward in a
    // Referer header. It still passes through server and proxy logs on the
    // way in, which is the cost of a password in a query string.
    const token = await gateToken();
    const given = req.nextUrl.searchParams.get('password') ?? req.nextUrl.searchParams.get('p');
    if (given && token && passwordMatches(given)) {
      const clean = req.nextUrl.clone();
      clean.searchParams.delete('password');
      clean.searchParams.delete('p');
      if (clean.pathname === pass.enter) clean.pathname = pass.home;

      const res = NextResponse.redirect(clean);
      res.cookies.set(GATE_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        // '/' rather than '/slt/wrtt': the console now lives at /wrtt on the
        // dedicated domain, and a cookie scoped to the long path would never
        // be sent there.
        path: '/',
        maxAge: GATE_MAX_AGE,
      });
      return res;
    }

    // token is null when WRTT_GATE_PASSWORD is unset, and then no cookie can
    // match - the console is closed rather than open, which is the way round
    // it should fail.
    const open =
      pathname === pass.enter || // the gate itself has to stay reachable
      (token !== null && req.cookies.get(GATE_COOKIE)?.value === token);
    if (!open) {
      const url = req.nextUrl.clone();
      url.pathname = pass.enter;
      url.search = pathname === pass.home ? '' : `?from=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
  }

  if (onSlt) {
    const url = req.nextUrl.clone();
    url.pathname = internal;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  // Host-based routing means the matcher cannot stay scoped to /slt/wrtt:
  // on slt.ventures every path needs the rewrite, and the case rule needs
  // files too, so /StudForge/index.html finds its way to the lowercase
  // file. Only Next's own /_next and the API routes are excluded here; the
  // function returns early for files, so on the primary domain everything
  // else falls through untouched.
  matcher: ['/((?!_next/|api/).*)'],
};
