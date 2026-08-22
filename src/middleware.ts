import { NextResponse, type NextRequest } from 'next/server';
import { GATE_COOKIE, GATE_TOKEN, GATE_MAX_AGE, passwordMatches } from '@/lib/wrtt/gate';

/**
 * A gate on the WRTT console, not a security boundary.
 *
 * It keeps the console from being stumbled into by anyone who finds the URL,
 * which matters because the sheets name real private individuals. It is a
 * single shared password with no rate limiting and no per-user identity, so
 * it should not be relied on for anything stronger than that.
 */
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // ?password= (or ?p=) signs you in and is then removed from the URL by a
  // redirect, so it does not sit in the address bar or travel onward in a
  // Referer header. It still passes through server and proxy logs on the way
  // in, which is the cost of a password in a query string.
  const given = searchParams.get('password') ?? searchParams.get('p');
  if (given && passwordMatches(given)) {
    const clean = req.nextUrl.clone();
    clean.searchParams.delete('password');
    clean.searchParams.delete('p');
    if (clean.pathname === '/slt/wrtt/enter') clean.pathname = '/slt/wrtt';

    const res = NextResponse.redirect(clean);
    res.cookies.set(GATE_COOKIE, GATE_TOKEN, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/slt/wrtt',
      maxAge: GATE_MAX_AGE,
    });
    return res;
  }

  // The gate itself has to stay reachable, or there is no way through it.
  if (pathname === '/slt/wrtt/enter') return NextResponse.next();

  if (req.cookies.get(GATE_COOKIE)?.value === GATE_TOKEN) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/slt/wrtt/enter';
  url.search = pathname === '/slt/wrtt' ? '' : `?from=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/slt/wrtt', '/slt/wrtt/:path*'],
};
