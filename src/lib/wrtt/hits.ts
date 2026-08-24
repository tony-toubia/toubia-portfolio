import 'server-only';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { db, isConfigured } from './db';

/**
 * One row per meaningful request into the gated console. The read of the
 * request headers happens during render (it has to); the insert is deferred
 * with after(), so a slow or unreachable database never delays a page, and
 * a failed insert never breaks one.
 */

export type HitKind =
  | 'page'       // the markets index
  | 'sheet'      // a market's ranked sheet
  | 'method'     // the long-form method page
  | 'profile'    // the scoring profile
  | 'deck'       // the concepts deck PDF - the strongest engagement signal
  | 'gate_view'  // landed on the password gate: the link was opened
  | 'gate_pass'  // entered through the form
  | 'gate_fail'; // tried a wrong password

const trim = (v: string | null, n: number) => (v ? v.slice(0, n) : null);

export async function recordHit(kind: HitKind, opts: { market?: string; path?: string } = {}) {
  if (!isConfigured) return;
  const h = await headers();

  const row = {
    kind,
    path: trim(opts.path ?? h.get('x-invoke-path'), 300) ?? kind,
    host: trim(h.get('host'), 120),
    market: opts.market ?? null,
    referer: trim(h.get('referer'), 500),
    user_agent: trim(h.get('user-agent'), 300),
    // Vercel's edge fills these in; locally they are simply absent.
    city: trim(decodeSafe(h.get('x-vercel-ip-city')), 120),
    region: trim(h.get('x-vercel-ip-country-region'), 60),
    country: trim(h.get('x-vercel-ip-country'), 8),
  };

  after(async () => {
    try {
      const sql = await db();
      await sql`insert into wrtt.page_hit ${sql(row)}`;
    } catch (e) {
      console.warn('[wrtt] page_hit insert failed:', (e as Error).message);
    }
  });
}

/** The city header arrives URL-encoded ("S%C3%A3o%20Paulo"). */
function decodeSafe(v: string | null) {
  if (!v) return null;
  try { return decodeURIComponent(v); } catch { return v; }
}
