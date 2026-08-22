-- ============================================================
-- WRTT — feature computation and scoring. Spec §6.4 / §6.5.
--
-- POC weights are an expert prior, versioned on every run so a
-- later supervised model can replace them without losing history.
-- ============================================================

-- Evidence of leading, not merely joining.
create or replace function wrtt.role_weight(rc text)
returns real language sql immutable as $$
  select case rc
    when 'founder' then 1.0 when 'president' then 1.0 when 'chair' then 1.0
    when 'officer' then 0.7 when 'committee_chair' then 0.6
    when 'director' then 0.5 when 'board_member' then 0.5 when 'coach_organizer' then 0.5
    when 'staff' then 0.3 when 'member' then 0.2 when 'volunteer' then 0.2
    else 0.2 end::real
$$;

-- Log-normalized organization scale, capped so one large filer cannot dominate.
create or replace function wrtt.org_scale(revenue numeric, confidence real)
returns real language sql immutable as $$
  select least(1.0, coalesce(ln(greatest(coalesce(revenue,0),1)) / 16.0, 0.3)
                    * greatest(coalesce(confidence,0.4), 0.3))::real
$$;

-- Exponential decay, three-year half-life on the affiliation end date. This is
-- what makes the ranking move between runs without a single new byte arriving.
create or replace function wrtt.recency_decay(end_date date)
returns real language sql stable as $$
  select power(0.5, greatest(extract(epoch from (now() - coalesce(end_date, current_date)))
                             / (365.25*86400) / 3.0, 0))::real
$$;

create or replace function wrtt.run_scoring(p_market uuid, p_model_version text default 'poc-expert-prior@1')
returns uuid
language plpgsql
as $$
declare
  v_run uuid;
  v_weights jsonb := '{"M":0.35,"B":0.20,"T":0.15,"R":0.12,"A":0.10,"X":0.08}'::jsonb;
begin
  insert into wrtt.score_run (market_id, model_version, weights, notes)
  values (p_market, p_model_version, v_weights,
          'Public sources only. R, A and X have no inputs in the POC and are excluded from the denominator rather than scored as zero.')
  returning id into v_run;

  with base as (
    select
      p.id as person_id,
      ln(1 + coalesce(sum(
            wrtt.role_weight(a.role_class)
            * wrtt.org_scale(o.scale_revenue, o.scale_confidence)
            * wrtt.recency_decay(a.end_date)
          ), 0)) as m_raw,
      count(distinct o.affiliation_domain)
        filter (where wrtt.role_weight(a.role_class) >= 0.5) as b_raw,
      least(15, greatest(0,
        extract(year from age(max(coalesce(a.end_date, current_date)),
                              min(coalesce(a.start_date, current_date)))))) as t_raw,
      count(a.id)                      as affiliation_count,
      count(distinct o.id)             as org_count,
      count(distinct sd.source_key)    as source_diversity,
      max(a.end_date)                  as most_recent,
      p.resolution_confidence
    from wrtt.person p
    join wrtt.affiliation a on a.person_id = p.id
    join wrtt.organization o on o.id = a.organization_id
    left join wrtt.evidence e on e.subject_type = 'affiliation' and e.subject_id = a.id
    left join wrtt.source_document sd on sd.id = e.source_document_id
    where p.market_id = p_market
      and not p.suppressed
    group by p.id, p.resolution_confidence
  ),
  normed as (
    select
      person_id, affiliation_count, org_count, source_diversity, resolution_confidence,
      m_raw, b_raw, t_raw,
      -- Percentile within market: a 12,000-household town and a 60,000-household
      -- one produce different absolute volumes, and the question is always local.
      case when max(m_raw) over () > min(m_raw) over ()
           then (m_raw - min(m_raw) over ()) / (max(m_raw) over () - min(m_raw) over ())
           else 0.5 end as m_n,
      case when max(b_raw) over () > 0 then b_raw::real / max(b_raw) over () else 0 end as b_n,
      case when max(t_raw) over () > 0 then t_raw::real / max(t_raw) over () else 0 end as t_n
    from base
  ),
  scored as (
    select *,
      ((0.35*m_n + 0.20*b_n + 0.15*t_n) / (0.35+0.20+0.15) * 100)::real as composite,
      least(1.0, (
        least(affiliation_count::real / 4.0, 1.0) * 0.4 +
        least(source_diversity::real / 2.0, 1.0)  * 0.2 +
        least(org_count::real / 3.0, 1.0)         * 0.2 +
        resolution_confidence                      * 0.2
      ))::real as conf
    from normed
  )
  insert into wrtt.score (score_run_id, person_id, wrtt_score, components, confidence, rank_in_market)
  select
    v_run, person_id, composite,
    jsonb_build_object(
      'M', jsonb_build_object('raw', round(m_raw::numeric,4), 'norm', round(m_n::numeric,4), 'weight', 0.35),
      'B', jsonb_build_object('raw', b_raw, 'norm', round(b_n::numeric,4), 'weight', 0.20),
      'T', jsonb_build_object('raw', t_raw, 'norm', round(t_n::numeric,4), 'weight', 0.15),
      'R', jsonb_build_object('raw', null, 'norm', null, 'weight', 0.12, 'status', 'no_input'),
      'A', jsonb_build_object('raw', null, 'norm', null, 'weight', 0.10, 'status', 'no_input'),
      'X', jsonb_build_object('raw', null, 'norm', null, 'weight', 0.08, 'status', 'no_input'),
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
