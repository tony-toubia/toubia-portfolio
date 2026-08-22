/**
 * Shared gate config. The middleware and the sign-in action have to agree on
 * the password, and the middleware cannot import a 'use server' module, so it
 * lives here.
 */
export const GATE_COOKIE = 'wrtt_gate';
export const GATE_TOKEN = 'ok';

/** Seven days. Long enough that a bookmark keeps working. */
export const GATE_MAX_AGE = 60 * 60 * 24 * 7;

/** Defaults to "success"; WRTT_GATE_PASSWORD overrides it. */
export function passwordMatches(given: string | null | undefined) {
  if (!given) return false;
  const expected = (process.env.WRTT_GATE_PASSWORD ?? 'success').trim().toLowerCase();
  return given.trim().toLowerCase() === expected;
}
