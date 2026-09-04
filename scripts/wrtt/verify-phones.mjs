#!/usr/bin/env node
/**
 * WRTT - check line quality on the phone numbers we already hold.
 *
 * 1,854 numbers came out of the 990 headers and not one has been used. Two
 * things are unknown about each, and both matter before anybody dials:
 *
 *   Mobile or front desk? The books-in-care-of number reaches a named human,
 *   but that human may be picking up an office phone or a personal cell, and
 *   the outreach that suits each is not the same one.
 *
 *   Does it still ring? Some of these come from 2023 filings.
 *
 * This is the most valuable thing AtData can do for us, which was a surprise.
 * The plan was to test it as an identity vendor - phone in, person out. It
 * has no such endpoint: /pv returns line and carrier metadata and nothing
 * else, and the identity endpoint (/v5/eppend) requires a street address we
 * deliberately do not hold. So the vendor answers a different question than
 * the one we went in with, and it happens to be a question we needed answered
 * about the only contact asset we have at scale.
 *
 * THIS IS NOT A DNC SCRUB.
 *
 * A number can be a live mobile and sit on the National Do Not Call Registry,
 * and calling it would still be the violation. This writes line_checked_at and
 * never touches dnc_checked_at, so wrtt.contactable goes on withholding every
 * phone until something actually checks the registry. Verifying that a line
 * rings must not come to look like clearance to ring it.
 *
 * Usage:
 *   node scripts/wrtt/verify-phones.mjs --limit 50            # a costed sample
 *   node scripts/wrtt/verify-phones.mjs --top 25              # only ranked people
 *   node scripts/wrtt/verify-phones.mjs --all --qps 5
 *
 * Flags:
 *   --limit  stop after N numbers                    (default 50 - this bills per lookup)
 *   --top    only people ranked <= N in their market (default: no rank filter)
 *   --all    no limit; overrides --limit
 *   --qps    requests per second                     (default 5)
 *   --dry    print what would be checked, call nothing
 */

import { setTimeout as sleep } from 'node:timers/promises';

for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(f); } catch { /* absent, or Node < 20.12 */ }
}

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function connect() {
  const url = process.env.WRTT_DATABASE_URL;
  if (!url) {
    console.error('[wrtt-pv] no WRTT_DATABASE_URL in the environment or .env.local.');
    process.exit(1);
  }
  const { default: postgres } = await import('postgres');
  const open = (u) => postgres(u, { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 30 });
  try {
    const sql = open(url);
    await sql`select 1`;
    return sql;
  } catch (e) {
    const alt = url.includes('aws-0-') ? url.replace('aws-0-', 'aws-1-')
              : url.includes('aws-1-') ? url.replace('aws-1-', 'aws-0-') : null;
    if (!alt || !/tenant or user not found/i.test(String(e.message))) throw e;
    console.warn('[wrtt-pv] wrong pooler shard, not a bad password. Trying the other one...');
    const sql = open(alt);
    await sql`select 1`;
    return sql;
  }
}

/**
 * One lookup. A miss is a fact about the number, not an error - an empty
 * response means the vendor knows nothing, which is worth recording so the
 * same number is not paid for twice.
 */
async function verify(phone, key) {
  const url = `https://api.atdata.com/pv?api_key=${encodeURIComponent(key)}` +
              `&phone=${encodeURIComponent(phone)}&country=US`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) throw new Error(`auth rejected (${res.status}) - check ATDATA_API_KEY`);
  if (res.status === 429) return { retry: true };
  if (!res.ok) return { error: `http ${res.status}` };
  const j = await res.json().catch(() => ({}));
  return {
    line_type:  j.line_type  ?? null,
    status:     j.status     ?? null,
    carrier:    j.carrier    ?? null,
    score: Number.isFinite(j.connected_score) ? j.connected_score : null,
  };
}

async function main() {
  const key = process.env.ATDATA_API_KEY;
  if (!key) {
    console.error('[wrtt-pv] set ATDATA_API_KEY in .env.local (it is gitignored) or the environment.');
    process.exit(1);
  }

  const all = process.argv.includes('--all');
  const dry = process.argv.includes('--dry');
  const limit = all ? 0 : Number(arg('--limit', '50')) || 50;
  const top = Number(arg('--top', '0')) || 0;
  const gap = 1000 / (Number(arg('--qps', '5')) || 5);

  const sql = await connect();

  // Ranked people first, so a --limit spends the budget where a publisher
  // would actually start rather than on an arbitrary slice of the index.
  const rows = await sql`
    with latest as (
      select distinct on (market_id) id, market_id
        from wrtt.score_run order by market_id, run_at desc
    ),
    ranked as (
      select s.person_id, s.rank_in_market
        from wrtt.score s join latest l on l.id = s.score_run_id
    )
    select c.id, c.value as phone, p.display_name, m.name as market,
           coalesce(r.rank_in_market, 9999) as rank
      from wrtt.contact c
      join wrtt.person p on p.id = c.person_id
      join wrtt.market m on m.id = p.market_id
      left join ranked r on r.person_id = p.id
     where c.channel = 'phone'
       and c.line_checked_at is null
       and (${top}::int = 0 or coalesce(r.rank_in_market, 9999) <= ${top})
     order by coalesce(r.rank_in_market, 9999), m.name
     ${limit ? sql`limit ${limit}` : sql``}
  `;

  console.log(`[wrtt-pv] ${rows.length} numbers to check` + (limit ? ` (capped at ${limit}; this bills per lookup)` : ''));
  if (!rows.length) { await sql.end(); return; }

  if (dry) {
    for (const r of rows.slice(0, 20)) console.log(`  rank ${String(r.rank).padStart(4)}  ${r.market.padEnd(14)} ${r.display_name}`);
    console.log(`[wrtt-pv] --dry: nothing called, nothing billed.`);
    await sql.end();
    return;
  }

  const tally = { mobile: 0, landline: 0, voip: 0, unknown: 0, dead: 0, errors: 0 };

  for (const [i, r] of rows.entries()) {
    let out;
    try {
      out = await verify(r.phone, key);
      if (out.retry) { await sleep(2000); out = await verify(r.phone, key); }
    } catch (e) {
      console.error(`[wrtt-pv] ${e.message}`);
      break;                                   // auth failures will not fix themselves
    }
    if (out.error) { tally.errors++; continue; }

    const lt = (out.line_type ?? '').toLowerCase();
    if (lt === 'mobile') tally.mobile++;
    else if (lt === 'landline') tally.landline++;
    else if (lt === 'voip') tally.voip++;
    else tally.unknown++;
    if (['disconnected', 'invalid'].includes((out.status ?? '').toLowerCase())) tally.dead++;

    // line_checked_at only. dnc_checked_at stays null - see the header.
    await sql`
      update wrtt.contact
         set line_type = ${out.line_type}, line_status = ${out.status},
             line_carrier = ${out.carrier}, line_score = ${out.score},
             line_checked_at = now()
       where id = ${r.id}
    `;

    if ((i + 1) % 25 === 0) console.log(`[wrtt-pv] ${i + 1}/${rows.length}  mobile=${tally.mobile} landline=${tally.landline} dead=${tally.dead}`);
    await sleep(gap);
  }

  console.log(`[wrtt-pv] done - mobile ${tally.mobile}, landline ${tally.landline}, voip ${tally.voip}, ` +
              `unknown ${tally.unknown}, disconnected/invalid ${tally.dead}, errors ${tally.errors}`);
  console.log('[wrtt-pv] Line quality only. No number is DNC-checked, and wrtt.contactable still withholds all of them.');
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
