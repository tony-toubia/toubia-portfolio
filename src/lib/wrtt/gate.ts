/**
 * Shared gate config. The middleware and the sign-in action have to agree on
 * the password, and the middleware cannot import a 'use server' module, so it
 * lives here.
 */
export const GATE_COOKIE = 'wrtt_gate';

/** Seven days. Long enough that a bookmark keeps working. */
export const GATE_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * The passwords live only in WRTT_GATE_PASSWORD, and there is no fallback.
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
 * The variable holds a comma-separated list, so more than one phrase can be
 * live at once - a long form on the deck and a short one for saying out loud,
 * or an old phrase kept working for a week while people move to a new one.
 * Every entry is equal; there is no primary.
 *
 * Comparison stays case- and whitespace-insensitive. These are shared
 * passwords read off a slide and typed by people on calls, and a capital
 * letter is not the thing standing between a stranger and the sheets.
 */
export function acceptedPasswords(): string[] {
  return (process.env.WRTT_GATE_PASSWORD ?? '')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
}

export function passwordMatches(given: string | null | undefined) {
  if (!given) return false;
  const candidate = given.trim().toLowerCase();
  if (!candidate) return false;
  return acceptedPasswords().includes(candidate);
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
 * It hashes the whole configured value rather than whichever phrase the
 * visitor typed, so every accepted password yields the same cookie and a
 * session does not remember which one opened it. The cost is that editing the
 * list at all - adding a phrase as much as removing one - signs everybody out.
 * That is the safer direction to err in, and it keeps one rule rather than
 * two: the cookie is valid exactly while the configuration that made it is.
 *
 * Not a signed session, no expiry inside the value, no per-user identity - the
 * cookie's Max-Age is the only lifetime. Still the shared-password gate it
 * always was; it just no longer ships with the key in the lock.
 */
export async function gateToken(): Promise<string | null> {
  // Sorted and normalized, so the token depends on the set of passwords and
  // not on how the variable happens to be typed. Reordering the list or
  // tidying the spacing in Vercel then does not sign everybody out; only
  // actually adding or removing a phrase does.
  const accepted = acceptedPasswords();
  if (!accepted.length) return null;
  const secret = [...accepted].sort().join('|');
  const bytes = new TextEncoder().encode(`wrtt-gate-v1|${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
