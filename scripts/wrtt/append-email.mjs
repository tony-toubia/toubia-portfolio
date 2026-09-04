#!/usr/bin/env node
/**
 * WRTT - find personal email by keying on the organization's street address.
 *
 * AtData's Email Append takes first, last, street, city, state, zip and
 * returns an email. The street is required, which is why this was blocked:
 * Form 990 Part VII carries no address for officers, so there was nothing to
 * send. The IRS Business Master File supplies the ORGANIZATION's address, and
 * that turns out to be the interesting key.
 *
 * WHY AN ORG ADDRESS IS A REASONABLE KEY FOR A PERSON
 *
 * A small nonprofit is frequently registered at a board member's house. So
 * for a soccer club run out of somebody's kitchen, the org address IS a home
 * address, and name-plus-address resolves the person who lives there. For a
 * hospital foundation in an office tower it resolves nobody.
 *
 * That failure mode is the useful one. Every method tried so far - Clay,
 * LinkedIn search, FEC employers - reaches the lawyer and misses the soccer
 * coach, because all three key on work identity. This one runs the other way:
 * the orgs whose address is a house are education (57% residential), cultural
 * (50%), arts and faith (43%), youth sports (38%), while economic development
 * (15%) and employers (0%) sit in real offices. It is the first mechanism
 * pointing at the people the index exists to find.
 *
 * And it self-selects usefully. Of a ten-person board registered at the
 * treasurer's house, nine will miss and the treasurer will hit - the person
 * most central to the organization, which is who we wanted anyway.
 *
 * MATCH TYPE IS NOT OPTIONAL READING
 *
 * "Individual" means the full name and the address matched. "Household" means
 * the address and the SURNAME matched - at a house, that is plausibly a
 * spouse or a child. Writing a household match as if it were the person is
 * the same error as accepting a LinkedIn profile on town alone, which put two
 * wrong people into this database earlier today. Household rows are stored at
 * low confidence, flagged in the note, and never presented as confirmed.
 *
 * Usage:
 *   node scripts/wrtt/append-email.mjs --dry              # costs nothing
 *   node scripts/wrtt/append-email.mjs --top 25 --limit 50
 *   node scripts/wrtt/append-email.mjs --top 25 --residential-only
 *
 * Flags:
 *   --top               only people ranked <= N in their market  (default 25)
 *   --limit             stop after N lookups   (default 50 - this bills per lookup)
 *   --residential-only  only try addresses flagged as a likely home
 *   --qps               requests per second    (default 5)
 *   --dry               print the queue, call nothing
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
    console.error('[wrtt-ea] no WRTT_DATABASE_URL in the environment or .env.local.');
    process.exit(1);
  }
  const { default: postgres } = await import('postgres');
  const open = (u) => postgres(u, { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 30 });
  try {
    const sql = open(url); await sql`select 1`; return sql;
  } catch (e) {
    const alt = url.includes('aws-0-') ? url.replace('aws-0-', 'aws-1-')
              : url.includes('aws-1-') ? url.replace('aws-1-', 'aws-0-') : null;
    if (!alt || !/tenant or user not found/i.test(String(e.message))) throw e;
    console.warn('[wrtt-ea] wrong pooler shard, not a bad password. Trying the other one...');
    const sql = open(alt); await sql`select 1`; return sql;
  }
}

/** Names are stored for display; the vendor wants the parts. */
const TITLES = new Set(['DR','MR','MRS','MS','MISS','REV','PROF','FR','HON','SIR',
                        'JR','SR','II','III','IV','MD','DDS','PHD','ESQ','CPA','RN','DO']);
function nameParts(display) {
  const t = String(display).toUpperCase().replace(/[^A-Z' -]/g, ' ')
    .split(/\s+/).filter((w) => w && !TITLES.has(w));
  if (t.length < 2) return null;
  return { first: t[0], last: t[t.length - 1] };
}

async function append({ first, last, street, city, state, zip }, key) {
  const q = new URLSearchParams({ first, last, street, city, state, zip, api_key: key });
  const res = await fetch(`https://api.atdata.com/v5/eppend?${q}`, { headers: { accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) throw new Error(`auth rejected (${res.status}) - check ATDATA_API_KEY`);
  if (res.status === 429) return { retry: true };
  if (!res.ok) return { error: `http ${res.status}` };
  const j = await res.json().catch(() => ({}));
  if (j.error_code) return { error: j.error_msg ?? `error ${j.error_code}` };
  const hit = Array.isArray(j.email_append) ? j.email_append[0] : null;
  if (!hit?.email) return { miss: true };
  return { email: hit.email, matchType: hit.email_match_type ?? 'Unknown' };
}

async function main() {
  const key = process.env.ATDATA_API_KEY;
  if (!key) {
    console.error('[wrtt-ea] set ATDATA_API_KEY in .env.local (it is gitignored) or the environment.');
    process.exit(1);
  }
  const top = Number(arg('--top', '25')) || 25;
  const limit = Number(arg('--limit', '50')) || 50;
  const residentialOnly = process.argv.includes('--residential-only');
  const dry = process.argv.includes('--dry');
  const gap = 1000 / (Number(arg('--qps', '5')) || 5);

  const sql = await connect();

  // One row per person-address. Residential-looking addresses first: those are
  // the ones where a person's name can actually match, and trying them first
  // means a capped run spends its budget where a hit is possible.
  const rows = await sql`
    with latest as (
      select distinct on (market_id) id, market_id from wrtt.score_run order by market_id, run_at desc
    )
    select distinct on (p.id, o.id)
           p.id as person_id, p.display_name, s.rank_in_market,
           o.name as org, o.street, o.city, o.state, o.zip, o.premises_type,
           case o.premises_type when 'residential' then 0 when 'likely_residential' then 1
                                when 'unknown' then 2 else 3 end as home_rank
      from wrtt.score s
      join latest l on l.id = s.score_run_id
      join wrtt.person p on p.id = s.person_id
      join wrtt.affiliation a on a.person_id = p.id
      join wrtt.organization o on o.id = a.organization_id
     where s.rank_in_market <= ${top}
       and o.street is not null and o.city is not null and o.zip is not null
       and not p.suppressed
       and not exists (select 1 from wrtt.contact c
                        where c.person_id = p.id and c.channel = 'email' and c.source = 'atdata_eappend')
       and (${residentialOnly}::boolean = false
            or o.premises_type in ('residential','likely_residential'))
     order by p.id, o.id, home_rank
  `;

  // Re-sort globally: every person's best shot before anybody's second.
  const queue = rows.sort((a, b) => a.home_rank - b.home_rank || a.rank_in_market - b.rank_in_market)
                    .slice(0, limit || undefined);

  console.log(`[wrtt-ea] ${rows.length} person-address pairs available; trying ${queue.length}` +
              (limit ? ` (capped at ${limit}; this bills per lookup)` : ''));
  if (!queue.length) { await sql.end(); return; }

  if (dry) {
    for (const r of queue.slice(0, 25)) {
      console.log(`  ${String(r.premises_type).padEnd(19)} rank ${String(r.rank_in_market).padStart(3)}  ` +
                  `${String(r.display_name).padEnd(26)} @ ${r.org}`);
    }
    console.log('[wrtt-ea] --dry: nothing called, nothing billed.');
    await sql.end();
    return;
  }

  const tally = { individual: 0, household: 0, miss: 0, errors: 0 };
  const done = new Set();

  for (const [i, r] of queue.entries()) {
    if (done.has(r.person_id)) continue;      // already resolved on a better address
    const nm = nameParts(r.display_name);
    if (!nm) continue;

    let out;
    try {
      const input = { first: nm.first, last: nm.last, street: r.street,
                      city: r.city, state: r.state, zip: String(r.zip).slice(0, 5) };
      out = await append(input, key);
      if (out.retry) { await sleep(2000); out = await append(input, key); }
    } catch (e) {
      console.error(`[wrtt-ea] ${e.message}`);
      break;                                  // auth failures will not fix themselves
    }

    if (out.error) { tally.errors++; continue; }
    if (out.miss)  { tally.miss++; await sleep(gap); continue; }

    const individual = out.matchType === 'Individual';
    if (individual) { tally.individual++; done.add(r.person_id); } else tally.household++;

    await sql`
      insert into wrtt.contact
        (person_id, channel, value, source, source_detail, confidence, status, notes)
      values (${r.person_id}, 'email', ${out.email}, 'atdata_eappend',
              ${`${out.matchType} match at ${r.org}'s address (${r.premises_type})`},
              ${individual ? 0.70 : 0.40}, 'unverified',
              ${individual
                ? 'Full name and address matched at the organization address. Not confirmed by the person.'
                : 'HOUSEHOLD match: the address and SURNAME matched, not the full name. At a residential '
                  + 'address this is plausibly a spouse or child, not the candidate. Do not contact without '
                  + 'confirming who this belongs to.'})
      on conflict (person_id, channel, value) do nothing
    `;

    if ((i + 1) % 25 === 0) {
      console.log(`[wrtt-ea] ${i + 1}/${queue.length}  individual=${tally.individual} ` +
                  `household=${tally.household} miss=${tally.miss}`);
    }
    await sleep(gap);
  }

  console.log(`[wrtt-ea] done - individual ${tally.individual}, household ${tally.household}, ` +
              `miss ${tally.miss}, errors ${tally.errors}`);
  console.log('[wrtt-ea] Only "individual" rows name the candidate. Household rows are stored at 0.40 and flagged.');
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
