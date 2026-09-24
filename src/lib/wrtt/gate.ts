/**
 * Shared gate config. The middleware and the sign-in action have to agree on
 * the password, and the middleware cannot import a 'use server' module, so it
 * lives here.
 */
export const GATE_COOKIE = 'wrtt_gate';
export const GATE_TOKEN = 'ok';

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
