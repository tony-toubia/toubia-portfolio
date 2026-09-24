/**
 * Shared gate config. The middleware and the sign-in action have to agree on
 * the password, and the middleware cannot import a 'use server' module, so it
 * lives here.
 */
export const GATE_COOKIE = 'wrtt_gate';

/** Seven days. Long enough that a bookmark keeps working. */
export const GATE_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * The password lives only in WRTT_GATE_PASSWORD, and there is no fallback.
 *
 * There used to be one - it defaulted to "success" - and this repository is
 * public, so the default was not a default, it was a published password. Any
 * deploy where the variable went missing would have silently accepted it.
 *
 * So this fails closed instead. With no variable set, nothing matches and the
 * console is unreachable, including locally; that is the right way round for a
 * page listing real private individuals. A local run needs the variable in
 * .env.local, which is gitignored.
 *
 * Comparison stays case- and whitespace-insensitive. This is a shared password
 * read off a slide and typed by people on calls, and a capital letter is not
 * the thing standing between a stranger and the sheets.
 */
export function passwordMatches(given: string | null | undefined) {
  const expected = process.env.WRTT_GATE_PASSWORD?.trim().toLowerCase();
  if (!given || !expected) return false;
  return given.trim().toLowerCase() === expected;
}

/**
 * The value of the session cookie, derived from the password rather than
 * written down.
 *
 * This used to be the constant string 'ok', in a public repository, and the
 * middleware's whole test for an existing session was whether the cookie
 * equalled it. So the password was never the only way in: anyone who read the
 * source could set wrtt_gate=ok in their browser and skip the gate entirely.
 * Rotating that constant to a different published string would have changed
 * nothing - it would still have been printed in the repository.
 *
 * A digest of the password cannot be forged from anything public, and it has
 * the property we actually want on a rotation: changing WRTT_GATE_PASSWORD
 * changes every valid cookie, so everyone who signed in with the old one is
 * signed out at the same moment. There is nothing separate to remember to
 * rotate.
 *
 * Not a signed session, no expiry inside the value, no per-user identity - the
 * cookie's Max-Age is the only lifetime. Still the shared-password gate it
 * always was; it just no longer ships with the key in the lock.
 */
export async function gateToken(): Promise<string | null> {
  const secret = process.env.WRTT_GATE_PASSWORD?.trim().toLowerCase();
  if (!secret) return null;
  const bytes = new TextEncoder().encode(`wrtt-gate-v1|${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
