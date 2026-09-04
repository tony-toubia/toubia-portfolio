-- ============================================================
-- WRTT - do-not-contact, in the two halves it actually has.
--
-- The federal Do Not Call Registry is not something a script can reach.
-- Access runs through a Subscription Account Number issued by the FTC to
-- the SELLER making the calls - City Lifestyle, or SLT - after an annual
-- certification of a legitimate telemarketing purpose. It cannot be
-- delegated to a database. So the registry check happens outside here and
-- wrtt.record_dnc_scrub records what came back.
--
-- The other half is entirely ours and is required regardless: anyone who
-- tells US to stop goes on an internal list, honoured for five years,
-- across every channel. That obligation exists whether or not the number
-- is on the federal registry, and it is the half most likely to be
-- forgotten because no vendor invoices for it.
--
-- wrtt.contactable now consults both, and still withholds every phone
-- that has not been checked against the registry. Note what it does NOT
-- accept as clearance: line_checked_at. Knowing that a line rings, and
-- that it is a mobile rather than a front desk, says nothing whatsoever
-- about whether you are permitted to ring it.
-- ============================================================

create table if not exists wrtt.dnc_suppression (
  id           uuid primary key default gen_random_uuid(),
  phone        text,
  email        text,
  person_id    uuid references wrtt.person(id) on delete set null,
  scope        text not null default 'all',
  reason       text not null,
  requested_at timestamptz not null default now(),
  recorded_by  text,
  note         text,
  constraint dnc_has_a_target check (phone is not null or email is not null or person_id is not null),
  constraint dnc_scope_check check (scope in ('all','phone','email','mail'))
);

create unique index if not exists dnc_phone_uidx on wrtt.dnc_suppression (phone) where phone is not null;
create unique index if not exists dnc_email_uidx on wrtt.dnc_suppression (lower(email)) where email is not null;
create index if not exists dnc_person_idx on wrtt.dnc_suppression (person_id) where person_id is not null;

-- Suppression is checked on three keys, because the same human can reach us
-- as a phone number, an address, or a row id, and honouring only one of
-- those is how an opt-out gets quietly lost.
create or replace view wrtt.contactable as
  select c.id, c.person_id, p.display_name, m.name as market, m.state,
         c.channel, c.value, c.source, c.confidence, c.verified_at, c.status,
         c.line_type, c.line_status
    from wrtt.contact c
    join wrtt.person p on p.id = c.person_id
    join wrtt.market m on m.id = p.market_id
   where c.status = any (array['unverified','active'])
     and not p.suppressed
     and (c.channel <> 'phone' or (c.dnc_checked_at is not null and c.dnc_listed is not true))
     and not exists (
       select 1 from wrtt.dnc_suppression d
        where (d.scope = 'all' or d.scope = c.channel)
          and (d.person_id = c.person_id
               or (d.phone is not null and c.channel = 'phone' and d.phone = c.value)
               or (d.email is not null and c.channel = 'email' and lower(d.email) = lower(c.value)))
     );

create or replace function wrtt.record_dnc_scrub(p_submitted text[], p_listed text[])
returns table (checked int, listed int)
language plpgsql
as $$
declare n_checked int := 0; n_listed int := 0;
begin
  update wrtt.contact c
     set dnc_checked_at = now(),
         dnc_listed = (c.value = any (p_listed))
   where c.channel = 'phone' and c.value = any (p_submitted);
  get diagnostics n_checked = row_count;

  select count(*) into n_listed from wrtt.contact
   where channel = 'phone' and value = any (p_listed) and dnc_listed;

  return query select n_checked, n_listed;
end;
$$;
