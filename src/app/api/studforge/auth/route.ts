import { NextResponse, type NextRequest } from 'next/server';
import { AI_COOKIE, cookieAttributes, gateConfigured, issueToken, passwordMatches, requestIsSecure, tokenValid } from '@/lib/studforge/gate';

/**
 * Unlocks the StudForge Claude routes with the shared password.
 *
 *   GET            { configured, unlocked }          is this browser already in?
 *   POST { password }  200 { ok, expires } + cookie    or 401 wrong / 429 too many tries / 503 not configured
 *   DELETE         clears the cookie
 *
 * Guessing is throttled per IP (a handful of tries, then a quarter-hour wait)
 * on top of the password being long; the limiter is per server instance, which
 * is enough to make brute force impractical against a decent passphrase.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const TRIES = 6, LOCKOUT_MS = 15 * 60 * 1000;

const attempts = new Map<string, number[]>();
function throttled(ip: string): boolean {
  const now = Date.now();
  if (attempts.size > 5000) attempts.clear();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < LOCKOUT_MS);
  attempts.set(ip, recent);
  return recent.length >= TRIES;
}
function noteFailure(ip: string) {
  attempts.set(ip, [...(attempts.get(ip) ?? []), Date.now()]);
}

const ipOf = (req: NextRequest) => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';

export async function GET(req: NextRequest) {
  const unlocked = tokenValid(req.cookies.get(AI_COOKIE)?.value);
  return NextResponse.json({ configured: gateConfigured(), unlocked }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  if (!gateConfigured()) return NextResponse.json({ error: 'not configured' }, { status: 503, headers: NO_STORE });
  const ip = ipOf(req);
  if (throttled(ip)) return NextResponse.json({ error: 'too many tries' }, { status: 429, headers: NO_STORE });
  let password: unknown;
  try { password = ((await req.json()) as { password?: unknown }).password; } catch { password = undefined; }
  if (!passwordMatches(password)) {
    noteFailure(ip);
    return NextResponse.json({ error: 'wrong password' }, { status: 401, headers: NO_STORE });
  }
  const token = issueToken();
  const res = NextResponse.json({ ok: true, expires: Number(token.split('.')[0]) }, { headers: NO_STORE });
  res.cookies.set(AI_COOKIE, token, cookieAttributes(requestIsSecure(req.headers, req.url)));
  return res;
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true }, { headers: NO_STORE });
  res.cookies.set(AI_COOKIE, '', { ...cookieAttributes(requestIsSecure(req.headers, req.url)), maxAge: 0 });
  return res;
}
