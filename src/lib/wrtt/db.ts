import 'server-only';
import postgres from 'postgres';
import { unstable_cache } from 'next/cache';

/**
 * WRTT reads go direct to Postgres rather than through PostgREST, because the
 * index lives in its own `wrtt` schema and this keeps it out of the public API
 * surface entirely. One connection string, no schema exposure to configure.
 *
 * Set WRTT_DATABASE_URL to the Supabase session-pooler URI.
 */
const url = process.env.WRTT_DATABASE_URL;

export const isConfigured = Boolean(url);

let client: ReturnType<typeof postgres> | null = null;

function open(u: string) {
  // Serverless invocations are short-lived; a small pool with a prompt idle
  // timeout avoids holding connections the pooler wants back.
  return postgres(u, { max: 3, idle_timeout: 20, prepare: false });
}

/**
 * The session pooler lives behind a per-shard hostname – aws-0-<region> or
 * aws-1-<region> – and which one a project sits on is not derivable from the
 * project ref. Get it wrong and Supavisor answers "Tenant or user not found",
 * which reads like a bad password and takes the whole console down. Fall back
 * to the other shard once and keep the connection that worked.
 */
export async function db() {
  if (!url) throw new Error('WRTT_DATABASE_URL is not set');
  if (client) return client;

  const first = open(url);
  try {
    await first`select 1`;
    client = first;
    return client;
  } catch (e) {
    const alt = url.includes('aws-0-') ? url.replace('aws-0-', 'aws-1-')
              : url.includes('aws-1-') ? url.replace('aws-1-', 'aws-0-')
              : null;
    if (!alt || !/tenant or user not found/i.test(String((e as Error).message))) throw e;

    console.warn('[wrtt] wrong pooler shard in WRTT_DATABASE_URL; falling back to the other one');
    const second = open(alt);
    await second`select 1`;
    client = second;
    return client;
  }
}

export type Market = {
  id: string;
  name: string;
  state: string;
  status: 'open' | 'active' | 'target';
  role: 'validation' | 'utility' | 'control';
  zips: string[];
  people: number;
  orgs: number;
  last_run: string | null;
};

export type ComponentKey = 'M' | 'B' | 'T' | 'R' | 'A' | 'X';

export type Component = {
  raw: number | null;
  norm: number | null;
  weight: number;
  status?: string;
};

export type Candidate = {
  person_id: string;
  rank_in_market: number;
  display_name: string;
  wrtt_score: number;
  confidence: number;
  /* An index signature intersected with numeric members is not a type any
     value can satisfy; naming the six component keys makes it one. */
  components: Partial<Record<ComponentKey, Component>> & {
    affiliations?: number;
    organizations?: number;
    sources?: number;
  };
  state: string | null;
  /* Latest human verdict on this card, if any. */
  verdict: string | null;
  verdict_note: string | null;
  verdict_by: string | null;
  affiliations: {
    org: string;
    role_title: string;
    role_class: string;
    domain: string | null;
    is_regional: boolean;
    revenue: number | null;
    snippet: string | null;
    source_key: string | null;
    url: string | null;
    /* Organization contact, never personal: Part VII carries no personal
       address, phone or email. Reaching a candidate goes through the body
       they lead, or through a warm introduction. */
    phone: string | null;
    website: string | null;
    /* The tenure this role covers, and how many filings attest to it.
       One entry per role held, never one per filing. */
    start_date: string | null;
    end_date: string | null;
    sources: number;
  }[];
};

/* ── Read caching ──────────────────────────────────────────────
   Measured before touching anything: the sheet query runs in ~50ms and the
   markets query in ~6ms, but a cold function spends ~300ms opening its
   Postgres connection before either can start. Caching the reads takes the
   database off the critical path: a warm load never touches it, and a cold
   load renders from cache while the connection opens in the background for
   the hit log. Two minutes of staleness after a rescore is the price;
   verdicts invalidate their market's sheet immediately. */
const CACHE_SECONDS = 120;
export const MARKETS_TAG = 'wrtt:markets';
export const sheetTag = (marketId: string) => `wrtt:sheet:${marketId}`;

async function queryMarkets(): Promise<Market[]> {
  const sql = await db();
  return sql<Market[]>`
    select m.id, m.name, m.state, m.status, m.role, m.zips,
           (select count(*)::int from wrtt.person p where p.market_id = m.id and not p.suppressed) as people,
           (select count(*)::int from wrtt.organization o where o.market_id = m.id) as orgs,
           (select max(r.run_at)::text from wrtt.score_run r where r.market_id = m.id) as last_run
      from wrtt.market m
     order by m.role, m.name
  `;
}

export const getMarkets = unstable_cache(queryMarkets, ['wrtt-markets'], {
  tags: [MARKETS_TAG], revalidate: CACHE_SECONDS,
});

/** Latest scored sheet for a market, with the evidence each score rests on. */
async function querySheet(marketId: string, limit = 50): Promise<Candidate[]> {
  const sql = await db();
  return sql<Candidate[]>`
    with latest as (
      select id from wrtt.score_run
       where market_id = ${marketId}
       order by run_at desc limit 1
    )
    select
      s.person_id,
      s.rank_in_market,
      p.display_name,
      s.wrtt_score,
      s.confidence,
      s.components,
      cs.state,
      fb.verdict,
      fb.note      as verdict_note,
      fb.actor_id  as verdict_by,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'org',        t.org,
                  'role_title', t.role_title,
                  'role_class', t.role_class,
                  'domain',     t.domain,
                  'is_regional',t.is_regional,
                  'revenue',    t.revenue,
                  'snippet',    t.snippet,
                  'source_key', t.source_key,
                  'url',        t.url,
                  'phone',      t.phone,
                  'website',    t.website,
                  'start_date', t.start_date,
                  'end_date',   t.end_date,
                  'sources',    t.sources
                ) order by t.end_date desc nulls last, t.org)
           from (
             select o.name                 as org,
                    a.role_title,
                    a.role_class,
                    o.affiliation_domain   as domain,
                    o.is_regional,
                    o.scale_revenue        as revenue,
                    o.phone,
                    o.website,
                    a.start_date,
                    a.end_date,
                    count(ev.id)::int      as sources,
                    min(ev.snippet)        as snippet,
                    min(sd.source_key)     as source_key,
                    min(sd.url)            as url
               from wrtt.affiliation a
               join wrtt.organization o on o.id = a.organization_id
               left join wrtt.evidence ev
                 on ev.subject_type = 'affiliation' and ev.subject_id = a.id
               left join wrtt.source_document sd on sd.id = ev.source_document_id
              where a.person_id = p.id
              group by a.id, o.name, a.role_title, a.role_class, o.affiliation_domain, o.is_regional,
                       o.scale_revenue, o.phone, o.website, a.start_date, a.end_date
           ) t),
        '[]'::jsonb
      ) as affiliations
    from wrtt.score s
    join latest on latest.id = s.score_run_id
    join wrtt.person p on p.id = s.person_id
    left join wrtt.candidate_state cs on cs.person_id = p.id
    -- Verdicts are append-only; the card shows the most recent one.
    left join lateral (
      select f.verdict, f.note, f.actor_id
        from wrtt.feedback f
       where f.person_id = p.id
       order by f.created_at desc
       limit 1
    ) fb on true
    where coalesce(cs.state, 'new') not in ('known_to_publisher','not_a_fit','suppressed')
    order by s.rank_in_market
    limit ${limit}
  `;
}

/* Tags are fixed when unstable_cache wraps a function, and the sheet needs a
   tag per market so a verdict on one sheet does not evict the other nine -
   so the wrap happens per market and is remembered. */
const sheetReaders = new Map<string, (marketId: string, limit?: number) => Promise<Candidate[]>>();
export function getSheet(marketId: string, limit = 50): Promise<Candidate[]> {
  let reader = sheetReaders.get(marketId);
  if (!reader) {
    reader = unstable_cache(querySheet, ['wrtt-sheet', marketId], {
      tags: [MARKETS_TAG, sheetTag(marketId)], revalidate: CACHE_SECONDS,
    });
    sheetReaders.set(marketId, reader);
  }
  return reader(marketId, limit);
}

/**
 * One market by id. This used to fetch every market with three aggregate
 * subqueries each, then pick one out of the array - thirty aggregates to
 * learn a name. The row is now read directly, and the counts the index page
 * needs are not computed here at all.
 */
async function queryMarket(marketId: string): Promise<Market | null> {
  const sql = await db();
  const [row] = await sql<Market[]>`
    select m.id, m.name, m.state, m.status, m.role, m.zips,
           (select count(*)::int from wrtt.person p where p.market_id = m.id and not p.suppressed) as people,
           0::int as orgs,
           null::text as last_run
      from wrtt.market m
     where m.id = ${marketId}
     limit 1
  `;
  return row ?? null;
}

export const getMarket = unstable_cache(queryMarket, ['wrtt-market'], {
  tags: [MARKETS_TAG], revalidate: CACHE_SECONDS,
}) as typeof queryMarket;

/* ── Scoring profile ───────────────────────────────────────────
   The weights are a row, not a constant, so the shape of candidate the
   index favours can be changed. Every score_run stores the profile that
   produced it, which is what keeps a tuned ranking auditable. */

export type Profile = {
  name: string;
  label: string | null;
  notes: string | null;
  updated_at: string;
  profile: {
    components: Record<string, number>;
    roles: Record<string, number>;
    domains: Record<string, number>;
    /* unpaid / nominal / paid / unknown - the lever that separates
       volunteering from employment. */
    compensation: Record<string, number>;
    compensation_nominal_max: number;
    same_family_repeat: number;
    half_life_years: number;
    org_scale_divisor: number;
  };
};

export async function getProfile(): Promise<Profile | null> {
  const sql = await db();
  const [row] = await sql<Profile[]>`
    select name, label, notes, updated_at::text, profile
      from wrtt.scoring_profile
     where is_default
     limit 1
  `;
  return row ?? null;
}

/** Save the levers and re-rank every market, so the page never shows a
 *  profile that does not match the sheets beside it. */
export async function saveProfileAndRescore(next: Profile['profile']): Promise<number> {
  const sql = await db();
  await sql`
    update wrtt.scoring_profile
       set profile = ${sql.json(next)}, updated_at = now()
     where is_default
  `;
  const markets = await sql<{ id: string }[]>`select id from wrtt.market`;
  for (const m of markets) await sql`select wrtt.run_scoring(${m.id})`;
  return markets.length;
}

/** Which profile produced the sheet currently on screen. */
export async function getRunProfile(marketId: string): Promise<{ model_version: string; run_at: string } | null> {
  const sql = await db();
  const [row] = await sql<{ model_version: string; run_at: string }[]>`
    select model_version, run_at::text
      from wrtt.score_run
     where market_id = ${marketId}
     order by run_at desc
     limit 1
  `;
  return row ?? null;
}

export type ResearchRow = {
  person_id: string;
  rank_in_market: number;
  display_name: string;
  wrtt_score: number;
  confidence: number;
  market: string;
  state: string;
  roles: string | null;
  org_phones: string | null;
  org_sites: string | null;
  domains: string | null;
  tenure: string | null;
  regional_only: boolean;
  regional_orgs: string | null;
  found_on: string | null;
};

/**
 * The worksheet a researcher actually works from.
 *
 * Everything here is already public - it is the filing record, rolled up per
 * person. The point is the starting context: which boards someone sits on and
 * what those organizations publish as their own contact details is what makes
 * the right individual findable, and what makes it obvious when a search has
 * turned up the wrong one. The index knows a name and a town and nothing else,
 * so distinguishing two people with the same name is the researcher's job and
 * this gives them what they need to do it.
 */
export async function getResearchRows(marketId: string, limit = 25): Promise<ResearchRow[]> {
  const sql = await db();
  return sql<ResearchRow[]>`
    with latest as (
      select id from wrtt.score_run
       where market_id = ${marketId}
       order by run_at desc limit 1
    )
    select
      p.id as person_id,
      s.rank_in_market,
      p.display_name,
      round(s.wrtt_score::numeric, 0)::float8 as wrtt_score,
      round(s.confidence::numeric, 2)::float8 as confidence,
      m.name as market,
      m.state,
      (select string_agg(distinct a.role_title || ' – ' || o.name, ' | ')
         from wrtt.affiliation a join wrtt.organization o on o.id = a.organization_id
        where a.person_id = p.id) as roles,
      (select string_agg(distinct o.phone, ' | ')
         from wrtt.affiliation a join wrtt.organization o on o.id = a.organization_id
        where a.person_id = p.id and o.phone is not null) as org_phones,
      (select string_agg(distinct o.website, ' | ')
         from wrtt.affiliation a join wrtt.organization o on o.id = a.organization_id
        where a.person_id = p.id and o.website is not null) as org_sites,
      (select string_agg(distinct o.affiliation_domain, ', ')
         from wrtt.affiliation a join wrtt.organization o on o.id = a.organization_id
        where a.person_id = p.id) as domains,
      to_char(p.first_seen, 'YYYY') || '–' || to_char(p.last_seen, 'YYYY') as tenure,
      coalesce((s.components->'locality'->>'regional_only')::boolean, false) as regional_only,
      (select string_agg(distinct o.name, ' | ')
         from wrtt.affiliation a join wrtt.organization o on o.id = a.organization_id
        where a.person_id = p.id and o.is_regional) as regional_orgs,
      -- Pages where this person is already named on an organization's own
      -- site. Confirms the role is current and sends the researcher straight
      -- to the roster instead of hunting for it.
      (select string_agg(distinct wm.page_url, ' | ')
         from wrtt.web_mention wm where wm.person_id = p.id) as found_on
    from latest l
    join wrtt.score s on s.score_run_id = l.id
    join wrtt.person p on p.id = s.person_id
    join wrtt.market m on m.id = p.market_id
    where not p.suppressed
    order by s.rank_in_market
    limit ${limit}
  `;
}
