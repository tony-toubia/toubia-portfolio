-- ============================================================
-- WRTT – organizational families, and paid work told apart from
-- volunteering.
--
-- Both of these came out of reading a full sheet rather than a
-- schema, and both were suppressing exactly the people the index
-- exists to find.
--
-- 1. Related entities counted as separate worlds. Catholic Charities,
--    Catholic Charities Foundation and Catholic Neighborhood Outreach
--    are one family; so are four Cleveland University entities and
--    three Watson golf foundations. Breadth is meant to measure how
--    many different crowds someone reaches, and three seats inside one
--    institution is one crowd.
--
-- 2. Paid staff outranking volunteers. A CFO or a VP of Marketing was
--    scoring above a PTO vice-president, which inverts the premise:
--    the thesis is about people organizing things nobody pays them to
--    organize. Form 990 Part VII reports compensation, and a volunteer
--    director reads 0, so this needs no inference at all.
-- ============================================================

alter table wrtt.affiliation add column if not exists compensation numeric;
alter table wrtt.affiliation add column if not exists officer_kind  text;

comment on column wrtt.affiliation.compensation is
  'Total reported compensation for this role, from Part VII. 0 means the filing reported zero; NULL means the filing did not report the field at all. The difference matters - do not coalesce it.';
comment on column wrtt.affiliation.officer_kind is
  'Part VII checkbox: trustee_or_director, officer, key_employee, highest_compensated, former, institutional_trustee. Absent on 990-EZ style filings.';

alter table wrtt.organization add column if not exists family_id uuid;
comment on column wrtt.organization.family_id is
  'Groups legally distinct organizations that are one institution for reach purposes. Recomputed by wrtt.rebuild_org_families().';

create index if not exists organization_family_idx on wrtt.organization (family_id);

-- ── Family detection ─────────────────────────────────────────

/**
 * Two organizations in the same market are one family when they share a
 * real phone number, or when their names are close enough.
 *
 * Both halves need care. Placeholder phones (all one digit, 555 numbers)
 * would otherwise merge a city band with a church, and the name threshold
 * sits at 0.75 deliberately: it keeps "Blue Valley North Booster Club" and
 * "Blue Valley Northwest Booster Club" apart at 0.71 - different schools -
 * while still merging the Catholic, Cleveland and Watson families.
 */
create or replace function wrtt.rebuild_org_families()
returns int
language plpgsql
as $$
declare
  n_changed int;
  n_families int;
begin
  -- Everyone starts in their own family.
  update wrtt.organization set family_id = id where family_id is distinct from id;

  create temporary table org_edge as
  select a.id as lo, b.id as hi
    from wrtt.organization a
    join wrtt.organization b
      on b.market_id = a.market_id
     and b.id > a.id
   where (
           a.phone is not null and a.phone = b.phone
           and a.phone !~ '^(\d)\1{9}$'
           and a.phone !~ '^555'
         )
      or extensions.similarity(a.name_normalized, b.name_normalized) >= 0.75;

  -- Label propagation to connected components. The graph is tiny and very
  -- shallow, so this settles in a handful of passes.
  loop
    with prop as (
      select o.id,
             -- Postgres has no min(uuid); the canonical hex form sorts
             -- identically to the uuid itself, so text is a safe detour.
             least(
               o.family_id,
               coalesce(min(peer.family_id::text)::uuid, o.family_id)
             ) as target
        from wrtt.organization o
        left join (
          select lo as a, hi as b from org_edge
          union all
          select hi as a, lo as b from org_edge
        ) e on e.a = o.id
        left join wrtt.organization peer on peer.id = e.b
       group by o.id, o.family_id
    )
    update wrtt.organization o
       set family_id = prop.target
      from prop
     where prop.id = o.id and o.family_id <> prop.target;

    get diagnostics n_changed = row_count;
    exit when n_changed = 0;
  end loop;

  drop table org_edge;

  select count(distinct family_id) into n_families from wrtt.organization;
  return n_families;
end;
$$;

select wrtt.rebuild_org_families();
