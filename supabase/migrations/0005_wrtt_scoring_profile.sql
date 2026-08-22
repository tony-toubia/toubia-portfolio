-- ============================================================
-- WRTT – scoring profiles.
--
-- The weights were a hard-coded expert prior. They are now a row,
-- so the shape of candidate the index favours can be changed and,
-- crucially, recorded: every score_run already stores the weights
-- that produced it, so a tuned run is auditable rather than an
-- unexplained reshuffle. That matters because a lever that moves
-- the ranking is also a lever that can manufacture a preferred
-- answer, and the evidence trail has to survive that.
--
-- The profile carries five things:
--   components        relative weight of M / B / T / R / A / X
--   roles             seniority weight per role_class
--   domains           how much each kind of organization counts
--   half_life_years   how fast old activity fades
--   org_scale_divisor how steeply organization size counts
-- ============================================================

create table if not exists wrtt.scoring_profile (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  label      text,
  notes      text,
  profile    jsonb not null,
  is_default boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Exactly one default, enforced rather than agreed by convention.
create unique index if not exists scoring_profile_one_default
  on wrtt.scoring_profile ((is_default)) where is_default;

insert into wrtt.scoring_profile (name, label, notes, is_default, profile)
values (
  'local-organizer',
  'Local organizer (default)',
  'Favours unpaid local community organizing over professional, corporate and social board seats. Domain weights are the expert prior, not a fitted model.',
  true,
  jsonb_build_object(
    'components', jsonb_build_object('M',0.35,'B',0.20,'T',0.15,'R',0.12,'A',0.10,'X',0.08),
    'roles', jsonb_build_object(
      'founder',1.0,'president',1.0,'chair',1.0,
      'officer',0.7,'committee_chair',0.6,
      'director',0.5,'board_member',0.5,'coach_organizer',0.5,
      'staff',0.3,'member',0.2,'volunteer',0.2),
    -- The finding that motivated this: a seat on a national trade body or an
    -- employee benefit trust is not the same signal as chairing a PTA, and
    -- before this they were worth identical points.
    'domains', jsonb_build_object(
      'youth_sports',1.30,'education',1.25,'neighborhood',1.25,'civic',1.20,
      'faith',1.10,'arts',1.10,'human_services',1.10,'cultural',1.10,
      'animal_welfare',1.00,'health',0.90,'philanthropy',0.90,
      'unclassified',0.80,'social_club',0.80,'fraternal',0.80,
      'professional',0.50,'employer',0.20),
    'half_life_years', 3.0,
    'org_scale_divisor', 16.0
  )
)
on conflict (name) do nothing;

-- ── Profile-aware feature helpers ────────────────────────────

create or replace function wrtt.role_weight(rc text, prof jsonb)
returns real language sql immutable as $$
  select coalesce((prof->'roles'->>rc)::real, 0.2)
$$;

create or replace function wrtt.domain_weight(dom text, prof jsonb)
returns real language sql immutable as $$
  select coalesce((prof->'domains'->>coalesce(dom,'unclassified'))::real, 1.0)
$$;

create or replace function wrtt.org_scale(revenue numeric, confidence real, divisor real)
returns real language sql immutable as $$
  select least(1.0, coalesce(ln(greatest(coalesce(revenue,0),1)) / greatest(divisor, 1.0), 0.3)
                    * greatest(coalesce(confidence,0.4), 0.3))::real
$$;

create or replace function wrtt.recency_decay(end_date date, half_life real)
returns real language sql stable as $$
  select power(0.5, greatest(extract(epoch from (now() - coalesce(end_date, current_date)))
                             / (365.25*86400) / greatest(half_life, 0.25), 0))::real
$$;

-- ── Scoring ──────────────────────────────────────────────────

drop function if exists wrtt.run_scoring(uuid, text);

create or replace function wrtt.run_scoring(
  p_market  uuid,
  p_profile text default null,          -- profile name; null uses the default
  p_notes   text default null
)
returns uuid
language plpgsql
as $$
declare
  v_run     uuid;
  v_prof    jsonb;
  v_name    text;
  v_hl      real;
  v_div     real;
  w_m real; w_b real; w_t real;
  v_denom   real;
begin
  select sp.profile, sp.name into v_prof, v_name
    from wrtt.scoring_profile sp
   where (p_profile is null and sp.is_default) or sp.name = p_profile
   limit 1;

  if v_prof is null then
    raise exception 'No scoring profile % (and no default is set)', coalesce(p_profile, '<default>');
  end if;

  v_hl  := coalesce((v_prof->>'half_life_years')::real, 3.0);
  v_div := coalesce((v_prof->>'org_scale_divisor')::real, 16.0);
  w_m   := coalesce((v_prof->'components'->>'M')::real, 0.35);
  w_b   := coalesce((v_prof->'components'->>'B')::real, 0.20);
  w_t   := coalesce((v_prof->'components'->>'T')::real, 0.15);
  v_denom := greatest(w_m + w_b + w_t, 0.0001);

  insert into wrtt.score_run (market_id, model_version, weights, notes)
  values (p_market, 'profile:' || v_name, v_prof,
          coalesce(p_notes,
            'Public sources only. R, A and X have no inputs and are excluded from the denominator rather than scored as zero.'))
  returning id into v_run;

  with base as (
    select
      p.id as person_id,
      ln(1 + coalesce(sum(
            wrtt.role_weight(a.role_class, v_prof)
            * wrtt.domain_weight(o.affiliation_domain, v_prof)
            * wrtt.org_scale(o.scale_revenue, o.scale_confidence, v_div)
            * wrtt.recency_decay(a.end_date, v_hl)
          ), 0)) as m_raw,
      count(distinct o.affiliation_domain)
        filter (where wrtt.role_weight(a.role_class, v_prof) >= 0.5) as b_raw,
      least(15, greatest(0,
        extract(year from age(max(coalesce(a.end_date, current_date)),
                              min(coalesce(a.start_date, current_date)))))) as t_raw,
      count(a.id)                   as affiliation_count,
      count(distinct o.id)          as org_count,
      count(distinct sd.source_key) as source_diversity,
      p.resolution_confidence
    from wrtt.person p
    join wrtt.affiliation a on a.person_id = p.id
    join wrtt.organization o on o.id = a.organization_id
    left join wrtt.evidence e on e.subject_type = 'affiliation' and e.subject_id = a.id
    left join wrtt.source_document sd on sd.id = e.source_document_id
    where p.market_id = p_market and not p.suppressed
    group by p.id, p.resolution_confidence
  ),
  normed as (
    select person_id, affiliation_count, org_count, source_diversity, resolution_confidence,
           m_raw, b_raw, t_raw,
           case when max(m_raw) over () > min(m_raw) over ()
                then (m_raw - min(m_raw) over ()) / (max(m_raw) over () - min(m_raw) over ())
                else 0.5 end as m_n,
           case when max(b_raw) over () > 0 then b_raw::real / max(b_raw) over () else 0 end as b_n,
           case when max(t_raw) over () > 0 then t_raw::real / max(t_raw) over () else 0 end as t_n
      from base
  ),
  scored as (
    select *,
      ((w_m*m_n + w_b*b_n + w_t*t_n) / v_denom * 100)::real as composite,
      least(1.0, (
        least(affiliation_count::real / 4.0, 1.0) * 0.4 +
        least(source_diversity::real / 2.0, 1.0)  * 0.2 +
        least(org_count::real / 3.0, 1.0)         * 0.2 +
        resolution_confidence                     * 0.2
      ))::real as conf
    from normed
  )
  insert into wrtt.score (score_run_id, person_id, wrtt_score, components, confidence, rank_in_market)
  select v_run, person_id, composite,
    jsonb_build_object(
      'M', jsonb_build_object('raw', round(m_raw::numeric,4), 'norm', round(m_n::numeric,4), 'weight', w_m),
      'B', jsonb_build_object('raw', b_raw, 'norm', round(b_n::numeric,4), 'weight', w_b),
      'T', jsonb_build_object('raw', t_raw, 'norm', round(t_n::numeric,4), 'weight', w_t),
      'R', jsonb_build_object('raw', null, 'norm', null,
             'weight', (v_prof->'components'->>'R')::real, 'status', 'no_input'),
      'A', jsonb_build_object('raw', null, 'norm', null,
             'weight', (v_prof->'components'->>'A')::real, 'status', 'no_input'),
      'X', jsonb_build_object('raw', null, 'norm', null,
             'weight', (v_prof->'components'->>'X')::real, 'status', 'no_input'),
      'affiliations', affiliation_count, 'organizations', org_count, 'sources', source_diversity
    ),
    conf,
    row_number() over (order by composite desc, affiliation_count desc)
  from scored;

  insert into wrtt.candidate_state (person_id, state, reason)
  select s.person_id, 'new', 'First score above floor'
  from wrtt.score s where s.score_run_id = v_run
  on conflict (person_id) do nothing;

  return v_run;
end;
$$;
