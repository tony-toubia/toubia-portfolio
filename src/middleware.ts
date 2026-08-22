import { NextResponse, type NextRequest } from 'next/server';

/**
 * A gate on the WRTT console, not a security boundary.
 *
 * It keeps the console from being stumbled into by anyone who finds the URL,
 * which matters because the sheets name real private individuals. It is a
 * single shared password with no rate limiting and no per-user identity, so
 * it should not be relied on for anything stronger than that.
 */
export const GATE_COOKIE = 'wrtt_gate';
export const GATE_TOKEN = 'ok';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
