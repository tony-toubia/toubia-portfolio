#!/usr/bin/env node
/**
 * WRTT – find candidates' LinkedIn profile URLs by searching the open web.
 *
 * A profile URL is the key that unlocks Clay. Every person-lookup path in its
 * toolset wants a LinkedIn URL, an email or an employer domain; we hold a
 * name, a town and a volunteer board seat, which is why searching Clay
 * directly returned 2 matches from 62 people. Given a URL, "Enrich Person and
 * Find Contact Details" returns a work email and a mobile in one call.
 *
 * So this does the one step Clay cannot: ask a search engine who this is.
 *
 * It never scrapes LinkedIn. It reads a search API's result list and keeps the
 * profile URLs, which is what a researcher does by hand, faster.
 *
 * Confidence is earned, not assumed. A hit only counts as strong when the
 * result text corroborates the person independently - their town, or one of
 * the organizations we already know they serve. Measured on a hand sample:
 * distinctive names with a professional footprint resolve cleanly, common
 * names return several plausible profiles and none of them provable, and
 * grassroots organizers frequently have no profile at all. Anything short of
 * corroborated is emitted for a human to judge, never auto-accepted.
 *
 * Usage:
 *   SERPER_API_KEY=... node scripts/wrtt/find-linkedin.mjs --from-db --top 25 --load
 *   SERPER_API_KEY=... node scripts/wrtt/find-linkedin.mjs --in cands.json --out found.ndjson
 *   BRAVE_API_KEY=...  node scripts/wrtt/find-linkedin.mjs --in cands.json --provider brave
 *
 * Input JSON: [{ id, name, market, state, orgs: [name, ...] }]
 *
 * Flags:
 *   --provider  serper | brave                    (default serper)
 *   --from-db   take candidates from the ranked sheets instead of --in
 *   --market    with --from-db, one market by name (default: every market)
 *   --top       with --from-db, ranks 1..N per market (default 25)
 *   --in        candidates JSON                   (default data/linkedin-candidates.json)
 *   --out       NDJSON of results                 (default data/linkedin-found.ndjson)
 *   --load      write corroborated URLs to wrtt.contact; needs WRTT_DATABASE_URL
 *   --limit     stop after N candidates
 *   --qps       queries per second                (default 2)
 *
 * Cost is about $1 per thousand people at two or three queries each; --top
 * keeps the spend at the part of the sheet anyone would actually work.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

// --from-db / --load want WRTT_DATABASE_URL; pick it up the way `next dev`
// does so neither flag needs --env-file. A real environment variable wins.
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(f); } catch { /* absent, or Node < 20.12 */ }
}

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Search providers ──────────────────────────────────────────
   Both return {title, link, snippet}. Serper is the cheapest per query;
   Brave has a free tier. Neither is required by the rest of the script. */

async function serper(query, key) {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: 10 }),
  });
  if (!res.ok) throw new Error(`serper ${res.status}`);
  const j = await res.json();
  return (j.organic ?? []).map((o) => ({ title: o.title ?? '', link: o.link ?? '', snippet: o.snippet ?? '' }));
}

async function brave(query, key) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '10');
  const res = await fetch(url, { headers: { 'X-Subscription-Token': key, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`brave ${res.status}`);
  const j = await res.json();
  return (j.web?.results ?? []).map((o) => ({
    title: o.title ?? '', link: o.url ?? '', snippet: o.description ?? '',
  }));
}

/**
 * A profile slug, from either a profile URL or a post URL - search results
 * often surface someone's activity rather than their profile, and the slug
 * sits in the path either way:
 *   /in/joechura                         -> joechura
 *   /posts/geoff-roehll-asla-clarb_x-...  -> geoff-roehll-asla-clarb
 */
function profileSlug(link) {
  try {
    const u = new URL(link);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    const inMatch = u.pathname.match(/^\/in\/([^/?#]+)/i);
    if (inMatch) return decodeURIComponent(inMatch[1]);
    const postMatch = u.pathname.match(/^\/posts\/([^/?#_]+)_/i);
    if (postMatch) return decodeURIComponent(postMatch[1]);
    return null;
  } catch { return null; }
}

/** Company and school pages are not people. */
const NOT_A_PERSON = /^\/(company|school|showcase|groups|pub\/dir|jobs)\b/i;

function isPersonLink(link) {
  try { return !NOT_A_PERSON.test(new URL(link).pathname); } catch { return false; }
}

const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3);

/**
 * Does this result independently place the person? A slug containing their
 * name proves only that the search worked. Corroboration is the town or an
 * organization we already know they serve appearing in the title or snippet.
 */
function corroboration(result, cand) {
  const hay = `${result.title} ${result.snippet}`.toLowerCase();
  const reasons = [];
  if (cand.market && hay.includes(cand.market.toLowerCase())) reasons.push(`town:${cand.market}`);
  for (const org of cand.orgs ?? []) {
    const distinctive = words(org).filter((w) => !['club','association','foundation','school','high','community','inc'].includes(w));
    if (distinctive.length && distinctive.every((w) => hay.includes(w))) { reasons.push(`org:${org}`); break; }
  }
  return reasons;
}

/**
 * People do not file their taxes under the name they use on LinkedIn.
 * "GEOFFREY ROEHLL" is geoff-roehll-asla-clarb; requiring the first name to
 * match verbatim rejected the one hand-verified match in the sample.
 *
 * So the surname carries the match and the forename only strengthens it.
 * Prefix agreement covers most of it (geoff/geoffrey, kim/kimberly,
 * chris/christopher); the map covers the ones where the nickname shares no
 * prefix at all.
 */
const NICKNAMES = new Map(Object.entries({
  robert: ['bob','rob','bobby'], william: ['bill','will','billy','liam'],
  richard: ['dick','rick','rich'], john: ['jack','johnny'],
  margaret: ['peggy','maggie','meg'], anthony: ['tony'],
  charles: ['chuck','charlie'], james: ['jim','jimmy'],
  edward: ['ed','ted','eddie'], henry: ['hank','harry'],
  lawrence: ['larry'], elizabeth: ['liz','beth','betsy','betty'],
  patricia: ['pat','patty','trish'], katherine: ['kate','kathy','katie','kat'],
  catherine: ['kate','cathy','katie'], susan: ['sue','suzy'],
  theodore: ['ted','teddy'], francis: ['frank'], joseph: ['joe','joey'],
  michael: ['mike','mickey'], thomas: ['tom','tommy'], daniel: ['dan','danny'],
  stephen: ['steve'], steven: ['steve'], deborah: ['debbie','deb'],
  jennifer: ['jen','jenny'], barbara: ['barb','babs'], sandra: ['sandy'],
  virginia: ['ginny'], eugene: ['gene'], albert: ['al'], alexander: ['alex'],
}));

function forenamesAgree(a, b) {
  if (!a || !b) return false;
  if (a === b || a.startsWith(b) || b.startsWith(a)) return true;
  for (const [formal, nicks] of NICKNAMES) {
    const set = new Set([formal, ...nicks]);
    if (set.has(a) && set.has(b)) return true;
  }
  return false;
}

/** { surname: did the slug carry it, forename: did it also agree } */
function nameMatchesSlug(slug, name) {
  const parts = String(name).toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { surname: false, forename: false };
  const s = slug.toLowerCase();
  const first = parts[0], last = parts[parts.length - 1];
  if (!s.includes(last)) return { surname: false, forename: false };
  const slugWords = s.split(/[^a-z]+/).filter(Boolean);
  return { surname: true, forename: slugWords.some((w) => forenamesAgree(w, first)) };
}

/* ── Database ends ─────────────────────────────────────
   Optional. With neither flag this is a pure file-in / file-out script. */

async function connect() {
  const url = process.env.WRTT_DATABASE_URL;
  if (!url) {
    console.error('[wrtt-li] no WRTT_DATABASE_URL in the environment or .env.local.');
    process.exit(1);
  }
  const { default: postgres } = await import('postgres');
  const open = (u) => postgres(u, { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 30 });
  try {
    const sql = open(url);
    await sql`select 1`;
    return sql;
  } catch (e) {
    // Supabase's session pooler lives behind a per-shard hostname and answers
    // "Tenant or user not found" for the wrong one, which reads like a bad
    // password and is not. Try the other shard rather than making it a puzzle.
    const alt = url.includes('aws-0-') ? url.replace('aws-0-', 'aws-1-')
              : url.includes('aws-1-') ? url.replace('aws-1-', 'aws-0-') : null;
    if (!alt || !/tenant or user not found/i.test(String(e.message))) throw e;
    console.warn('[wrtt-li] wrong pooler shard, not a bad password. Trying the other one...');
    const sql = open(alt);
    await sql`select 1`;
    return sql;
  }
}

/**
 * The people worth a query: ranked, not already dispositioned, and without a
 * LinkedIn URL on file. Ordering by rank means --limit spends the budget at
 * the top of the sheet, where a publisher would actually start.
 */
async function candidatesFromDb(sql, { market, top }) {
  const rows = await sql`
    with latest as (
      select distinct on (market_id) id, market_id
        from wrtt.score_run order by market_id, run_at desc
    ),
    ranked as (
      select s.person_id, s.rank_in_market, p.display_name, m.name as market, m.state
        from wrtt.score s
        join latest l on l.id = s.score_run_id
        join wrtt.market m on m.id = l.market_id
        join wrtt.person p on p.id = s.person_id
        left join wrtt.candidate_state cs on cs.person_id = p.id
       where coalesce(cs.state, 'new') not in ('known_to_publisher','not_a_fit','suppressed')
         and (${market}::text is null or lower(m.name) = lower(${market}))
         and s.rank_in_market <= ${top}
         and not exists (
               select 1 from wrtt.contact c
                where c.person_id = p.id and c.channel = 'linkedin')
    )
    select r.person_id as id, r.display_name as name, r.market, r.state,
           coalesce(
             -- One name per organization: a person often holds the same seat
             -- across filing years, and a repeat would waste a query slot.
             -- Regional bodies are dropped; they place nobody in a town.
             (select array_agg(d.name order by d.rev desc nulls last)
                from (select o.name, max(o.scale_revenue) as rev
                        from wrtt.affiliation a
                        join wrtt.organization o on o.id = a.organization_id
                       where a.person_id = r.person_id
                         and not coalesce(o.is_regional, false)
                       group by o.name) d),
             '{}') as orgs
      from ranked r
     order by r.market, r.rank_in_market
  `;
  // Slugs read better in a query than the stored all-caps display name.
  return rows.map((r) => ({ ...r, name: String(r.name), orgs: (r.orgs ?? []).slice(0, 3) }));
}

/**
 * Write corroborated URLs only. Anything less is a guess, and a guess written
 * to wrtt.contact becomes indistinguishable from a fact the next time someone
 * reads the table. Those rows stay in the NDJSON for a human to judge.
 */
async function loadFound(sql, results) {
  const rows = results
    .filter((r) => r.verdict === 'corroborated' && r.candidates[0])
    .map((r) => ({
      person_id: r.person_id,
      value: r.candidates[0].url,
      detail: r.candidates[0].reasons.join('; '),
    }));
  if (!rows.length) return 0;

  let n = 0;
  for (const row of rows) {
    const done = await sql`
      insert into wrtt.contact
        (person_id, channel, value, source, source_detail, confidence, status, notes)
      values (${row.person_id}, 'linkedin', ${row.value}, 'web_search', ${row.detail},
              0.85, 'unverified',
              'Search-result match, corroborated by town or a known affiliation. Not confirmed by the person.')
      on conflict do nothing
      returning id
    `;
    n += done.length;
  }
  return n;
}

async function findFor(cand, search) {
  const queries = [
    `"${cand.name}" ${cand.market} ${cand.state ?? ''}`.trim(),
    cand.orgs?.[0] ? `"${cand.name}" ${cand.orgs[0]}` : null,
  ].filter(Boolean);

  const seen = new Map();
  for (const q of queries) {
    let results = [];
    try { results = await search(`site:linkedin.com/in ${q}`); } catch { continue; }
    for (const r of results) {
      if (!isPersonLink(r.link)) continue;
      const slug = profileSlug(r.link);
      if (!slug) continue;
      const nm = nameMatchesSlug(slug, cand.name);
      if (!nm.surname) continue;
      const reasons = corroboration(r, cand);
      const prior = seen.get(slug);
      const score = reasons.length + (nm.forename ? 1 : 0);
      if (!prior || score > prior.score) {
        seen.set(slug, { slug, url: `https://www.linkedin.com/in/${slug}`, title: r.title,
                         snippet: r.snippet, reasons, forename_match: nm.forename, score, query: q });
      }
    }
    if ([...seen.values()].some((c) => c.reasons.length)) break;   // corroborated; stop paying
  }

  const cands = [...seen.values()].sort((a, b) => b.score - a.score);
  const best = cands[0];
  // Automatic accept needs three things at once: the surname in the slug, the
  // result independently placing the person, and no rival with equal standing.
  const rivals = cands.filter((c) => c.score === best?.score).length;
  const verdict = !best ? 'none'
    : best.reasons.length && rivals === 1 ? 'corroborated'
    : best.reasons.length ? 'ambiguous'
    : 'uncorroborated';

  return { person_id: cand.id, name: cand.name, market: cand.market, verdict, candidates: cands.slice(0, 4) };
}

async function main() {
  const provider = arg('--provider', 'serper');
  const key = provider === 'brave' ? process.env.BRAVE_API_KEY : process.env.SERPER_API_KEY;
  if (!key) {
    console.error(`[wrtt-li] set ${provider === 'brave' ? 'BRAVE_API_KEY' : 'SERPER_API_KEY'} in the environment.`);
    process.exit(1);
  }
  const search = (q) => (provider === 'brave' ? brave(q, key) : serper(q, key));

  const outFile = arg('--out', 'data/linkedin-found.ndjson');
  const limit = Number(arg('--limit', '0')) || 0;
  const gap = 1000 / (Number(arg('--qps', '2')) || 2);
  const fromDb = process.argv.includes('--from-db');
  const doLoad = process.argv.includes('--load');

  const sql = fromDb || doLoad ? await connect() : null;

  let cands;
  if (fromDb) {
    cands = await candidatesFromDb(sql, {
      market: arg('--market', null),
      top: Number(arg('--top', '25')) || 25,
    });
  } else {
    cands = JSON.parse(await fsp.readFile(arg('--in', 'data/linkedin-candidates.json'), 'utf8'));
  }
  if (limit) cands = cands.slice(0, limit);
  console.log(`[wrtt-li] ${cands.length} candidates via ${provider}`);
  if (!cands.length) { await sql?.end(); return; }

  await fsp.mkdir(path.dirname(outFile), { recursive: true });
  const out = fs.createWriteStream(outFile, { flags: 'w' });

  const tally = { corroborated: 0, ambiguous: 0, uncorroborated: 0, none: 0 };
  const found = [];
  for (const [i, c] of cands.entries()) {
    const r = await findFor(c, search).catch(() => ({ person_id: c.id, name: c.name, verdict: 'none', candidates: [] }));
    tally[r.verdict]++;
    found.push(r);
    out.write(JSON.stringify(r) + '\n');
    if ((i + 1) % 25 === 0) {
      console.log(`[wrtt-li] ${i + 1}/${cands.length}  corroborated=${tally.corroborated} ` +
                  `ambiguous=${tally.ambiguous} uncorroborated=${tally.uncorroborated} none=${tally.none}`);
    }
    await sleep(gap);
  }

  out.end();
  await new Promise((r) => out.on('finish', r));
  console.log(`[wrtt-li] done – corroborated ${tally.corroborated}, ambiguous ${tally.ambiguous}, ` +
              `uncorroborated ${tally.uncorroborated}, none ${tally.none}`);
  console.log(`[wrtt-li] -> ${outFile}`);

  if (doLoad) {
    const n = await loadFound(sql, found);
    console.log(`[wrtt-li] wrote ${n} linkedin rows to wrtt.contact (corroborated only)`);
  }
  await sql?.end();
  console.log('[wrtt-li] Only "corroborated" rows should be enriched without a human first.');
}

main().catch((e) => { console.error(e); process.exit(1); });
