import 'server-only';
import postgres from 'postgres';

/**
 * The game's own database (GAME_DATABASE_URL), shared by the daily and Apex
 * Hunt leaderboards. Deliberately separate from WRTT's: a public game should
 * never hold a connection to data about private people. Null when unset.
 */
const url = process.env.GAME_DATABASE_URL;
export const isConfigured = Boolean(url);

let client: ReturnType<typeof postgres> | null = null;

export function sql() {
  if (!url) return null;
  if (!client) client = postgres(url, { max: 2, idle_timeout: 20, prepare: false });
  return client;
}
