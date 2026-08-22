import 'server-only';
import postgres from 'postgres';

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

export type Candidate = {
  person_id: string;
  rank_in_market: number;
  display_name: string;
  wrtt_score: number;
  confidence: number;
  components: Record<string, { raw: number | null; norm: number | null; weight: number; status?: string }> & {
    affiliations?: number;
    organizations?: number;
    sources?: number;
  };
  state: string | null;
  affiliations: {
    org: string;
    role_title: string;
    role_class: string;
    domain: string | null;
    revenue: number | null;
    snippet: string | null;
    source_key: string | null;
    url: string | null;
    /* Organization contact, never personal: Part VII carries no personal
       address, phone or email. Reaching a candidate goes through the body
       they lead, or through a warm introduction. */
    phone: string | null;
    website: string | null;
  }[];
};

export async function getMarkets(): Promise<Market[]> {
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

/** Latest scored sheet for a market, with the evidence each score rests on. */
export async function getSheet(marketId: string, limit = 50): Promise<Candidate[]> {
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
      coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'org',        o.name,
                  'role_title', a.role_title,
                  'role_class', a.role_class,
                  'domain',     o.affiliation_domain,
                  'revenue',    o.scale_revenue,
                  'snippet',    ev.snippet,
                  'source_key', sd.source_key,
                  'url',        sd.url,
                  'phone',      o.phone,
                  'website',    o.website
                ) order by a.end_date desc nulls last)
           from wrtt.affiliation a
           join wrtt.organization o on o.id = a.organization_id
           left join wrtt.evidence ev on ev.subject_type = 'affiliation' and ev.subject_id = a.id
           left join wrtt.source_document sd on sd.id = ev.source_document_id
          where a.person_id = p.id),
        '[]'::jsonb
      ) as affiliations
    from wrtt.score s
    join latest on latest.id = s.score_run_id
    join wrtt.person p on p.id = s.person_id
    left join wrtt.candidate_state cs on cs.person_id = p.id
    where coalesce(cs.state, 'new') not in ('known_to_publisher','not_a_fit','suppressed')
    order by s.rank_in_market
    limit ${limit}
  `;
}

export async function getMarket(marketId: string): Promise<Market | null> {
  const all = await getMarkets();
  return all.find((m) => m.id === marketId) ?? null;
}

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
