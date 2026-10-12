import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The password gate in front of the StudForge Claude routes.
 *
 * Every call to /api/studforge/idea spends real API credit, so the route is
 * closed until the visitor has unlocked it with the shared password in
 * STUDFORGE_AI_PASSWORD. Unlocking sets an HttpOnly cookie holding a token
 * signed with that password; the idea route accepts the cookie, not the
 * password, so the password itself crosses the wire once.
 *
 * Fails closed: with no password configured (or one shorter than 8
 * characters) nothing unlocks, locally included. This repository is public, so
 * there is no fallback phrase in the code to publish.
 *
 * The token is `<expiry seconds>.<HMAC-SHA256(expiry) keyed by the password>`,
 * so a cookie cannot be forged from anything in the repository, it expires on
 * its own, and changing the password invalidates every cookie at once.
 * Comparisons are constant-time.
 */
export const AI_COOKIE = 'sf_ai';

/** Thirty days: long enough that the owner is not asked again every visit. */
export const AI_MAX_AGE = 60 * 60 * 24 * 30;

const MIN_LENGTH = 8;

function secret(): string {
  return (process.env.STUDFORGE_AI_PASSWORD ?? '').trim();
}

export function gateConfigured(): boolean {
  return secret().length >= MIN_LENGTH;
}

/** Constant-time equality on fixed-length digests, so length and content leak nothing. */
function same(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

export function passwordMatches(given: unknown): boolean {
  if (!gateConfigured() || typeof given !== 'string') return false;
  const candidate = given.trim();
  if (!candidate || candidate.length > 200) return false;
  return same(candidate, secret());
}

function sign(exp: number): string {
  return createHmac('sha256', `studforge-ai:${secret()}`).update(String(exp)).digest('base64url');
}

/** A fresh token, valid for AI_MAX_AGE from now. */
export function issueToken(now = Date.now()): string {
  const exp = Math.floor(now / 1000) + AI_MAX_AGE;
  return `${exp}.${sign(exp)}`;
}

export function tokenValid(token: string | null | undefined, now = Date.now()): boolean {
  if (!gateConfigured() || !token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot)), sig = token.slice(dot + 1);
  if (!Number.isFinite(exp) || exp * 1000 < now || !sig) return false;
  return same(sig, sign(exp));
}

/** Cookie attributes for the token: HttpOnly, scoped to the StudForge API, Secure wherever the page is https. */
export function cookieAttributes(secure: boolean) {
  return { httpOnly: true, sameSite: 'lax' as const, secure, path: '/api/studforge', maxAge: AI_MAX_AGE };
}

export function requestIsSecure(headers: Headers, url: string): boolean {
  const proto = (headers.get('x-forwarded-proto') ?? '').split(',')[0].trim();
  return proto ? proto === 'https' : url.startsWith('https:');
}
