-- ============================================================
-- WRTT – scoring that knows the difference between a job and
-- volunteering, and between three boards and three boards at the
-- same institution.
-- ============================================================

/**
 * Compensation weight. The premise of the whole index is people who
 * organize things nobody pays them to organize, so what someone was paid
 * for a role is the most direct evidence there is about which kind of
 * role it was.
 *
 * NULL is not zero. A filing that omitted the field tells us nothing, and
 * treating that as "volunteer" would promote every 990-EZ filer's paid
 * staff into the exact population we are trying to isolate.
 */
create or replace function wrtt.pay_weight(comp numeric, kind text, prof jsonb)
returns real language sql immutable as $$
  select case
    -- The form's own checkboxes for staff override any amount.
    when kind in ('key_employee','highest_compensated')
      then coalesce((prof->'compensation'->>'paid')::real, 0.15)
    when comp is null
      then coalesce((prof->'compensation'->>'unknown')::real, 0.85)
    when comp <= 0
      then coalesce((prof->'compensation'->>'unpaid')::real, 1.0)
    when comp < coalesce((prof->>'compensation_nominal_max')::numeric, 20000)
      then coalesce((prof->'compensation'->>'nominal')::real, 0.5)
    else coalesce((prof->'compensation'->>'paid')::real, 0.15)
  end::real
$$;

comment on function wrtt.pay_weight(numeric, text, jsonb) is
  'Weight for a role by what it paid. NULL compensation is unknown, not zero.';

create or replace function wrtt.run_scoring(
  p_market  uuid,
  p_profile text default null,
  p_notes   text default null
)
returns uuid
language plpgsql
as $$
declare
  v_run   uuid;
  v_prof  jsonb;
  v_name  text;
  v_hl    real;
  v_div   real;
  v_rep   real;
  w_m real; w_b real; w_t real;
  v_denom real;
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
  v_rep := coalesce((v_prof->>'same_family_repeat')::real, 0.35);
  w_m   := coalesce((v_prof->'components'->>'M')::real, 0.35);
  w_b   := coalesce((v_prof->'components'->>'B')::real, 0.20);
  w_t   := coalesce((v_prof->'components'->>'T')::real, 0.15);
  v_denom := greatest(w_m + w_b + w_t, 0.0001);

  insert into wrtt.score_run (market_id, model_version, weights, notes)
  values (p_market, 'profile:' || v_name, v_prof,
          coalesce(p_notes,
            'Public sources only. R, A and X have no inputs and are excluded from the denominator rather than scored as zero.'))
  returning id into v_run;

  with aff as (
    select
      p.id as person_id,
      p.resolution_confidence,
      a.id as affiliation_id,
      coalesce(o.family_id, o.id) as family_id,
      o.affiliation_domain,
      a.start_date, a.end_date,
      -- Counted here rather than joined, so evidence rows do not multiply
      -- the affiliation back out into one row per supporting filing.
      (select count(distinct sd.source_key)
         from wrtt.evidence e
         join wrtt.source_document sd on sd.id = e.source_document_id
        where e.subject_type = 'affiliation' and e.subject_id = a.id) as src,
      wrtt.role_weight(a.role_class, v_prof)
        * wrtt.domain_weight(o.affiliation_domain, v_prof)
        * wrtt.org_scale(o.scale_revenue, o.scale_confidence, v_div)
        * wrtt.recency_decay(a.end_date, v_hl)
        * wrtt.pay_weight(a.compensation, a.officer_kind, v_prof) as w,
      wrtt.role_weight(a.role_class, v_prof) as role_w
    from wrtt.person p
    join wrtt.affiliation a on a.person_id = p.id
    join wrtt.organization o on o.id = a.organization_id
    where p.market_id = p_market and not p.suppressed
  ),
  fam as (
    select *,
           row_number() over (partition by person_id, family_id order by w desc, affiliation_id) as fam_rank
      from aff
  ),
  base as (
    select
      person_id,
      resolution_confidence,
      ln(1 + coalesce(sum(w * case when fam_rank = 1 then 1.0 else v_rep end), 0)) as m_raw,
      -- Breadth counts each family once, which is the whole point of it.
      count(distinct affiliation_domain) filter (where role_w >= 0.5 and fam_rank = 1) as b_raw,
      least(15, greatest(0,
        extract(year from age(max(coalesce(end_date, current_date)),
                              min(coalesce(start_date, current_date)))))) as t_raw,
      count(*)                     as affiliation_count,
      count(distinct family_id)    as org_count,
      coalesce(max(src), 0)        as source_diversity
    from fam
    group by person_id, resolution_confidence
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

-- ── Default profile gains the two new levers ─────────────────

update wrtt.scoring_profile
   set profile = profile
     || jsonb_build_object(
          'compensation', jsonb_build_object(
            'unpaid',  1.00,   -- the population the thesis is about
            'nominal', 0.50,   -- a stipend, not a living
            'paid',    0.15,   -- doing a job, however well
            'unknown', 0.85),  -- filing did not say; do not punish for that
          'compensation_nominal_max', 20000,
          'same_family_repeat', 0.35),
       notes = 'Favours unpaid local community organizing over paid staff roles, professional bodies and corporate seats. Repeat seats inside one organizational family count once at full weight. Domain and pay weights are an expert prior, not a fitted model.',
       updated_at = now()
 where is_default;
