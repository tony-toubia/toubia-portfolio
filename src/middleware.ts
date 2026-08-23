import { NextResponse, type NextRequest } from 'next/server';
import { GATE_COOKIE, GATE_TOKEN, GATE_MAX_AGE, passwordMatches } from '@/lib/wrtt/gate';

/**
 * Two jobs, in order.
 *
 * 1. Serve the SLT work on its own domain. slt.ventures points at this same
 *    deployment, and requests arriving on that host are rewritten into /slt -
 *    so slt.ventures/wrtt is /slt/wrtt with the prefix off the address bar.
 *    The /slt paths keep working on the primary domain, and an internal link
 *    to /slt/... followed on slt.ventures redirects to the short form rather
 *    than doubling the prefix.
 *
 * 2. Gate the WRTT console. Not a security boundary: it keeps the console
 *    from being stumbled into by anyone who finds the URL, which matters
 *    because the sheets name real private individuals. A single shared
 *    password, no rate limiting, no per-user identity - rely on it for
 *    nothing stronger than that.
 */

const SLT_HOST = /(^|\.)slt\.ventures$/i;

export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').split(':')[0];
  const onSlt = SLT_HOST.test(host);
  const { pathname } = req.nextUrl;

  // Long form on the short domain: canonicalize instead of serving the same
  // page at two paths (and instead of rewriting /slt/slt/... into a 404).
  if (onSlt && (pathname === '/slt' || pathname.startsWith('/slt/'))) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice('/slt'.length) || '/';
    return NextResponse.redirect(url, 308);
  }

  // No /slt landing page exists yet; on this domain the console is the site.
  // A temporary redirect on purpose - when a landing page arrives, the root
  // should start serving it without every visitor's cache disagreeing.
  if (onSlt && pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/wrtt';
    return NextResponse.redirect(url, 307);
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
    const given = req.nextUrl.searchParams.get('password') ?? req.nextUrl.searchParams.get('p');
    if (given && passwordMatches(given)) {
      const clean = req.nextUrl.clone();
      clean.searchParams.delete('password');
      clean.searchParams.delete('p');
      if (clean.pathname === pass.enter) clean.pathname = pass.home;

      const res = NextResponse.redirect(clean);
      res.cookies.set(GATE_COOKIE, GATE_TOKEN, {
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

    const open =
      pathname === pass.enter || // the gate itself has to stay reachable
      req.cookies.get(GATE_COOKIE)?.value === GATE_TOKEN;
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
  // on slt.ventures every path needs the rewrite. Static assets and files
  // with extensions are excluded; everything else falls through untouched
  // on the primary domain.
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};
