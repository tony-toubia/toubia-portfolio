-- ============================================================
-- WRTT – outreach details, with the audit trail built in rather
-- than retrofitted.
--
-- Three things this schema insists on, because each is expensive
-- to add after the first vendor batch has landed:
--
--   provenance   source is NOT NULL. Every value knows where it
--                came from, so a vendor batch that turns out to be
--                junk can be found and deleted by source alone.
--
--   wrong_person a first-class status, not a note. The index
--                matches on name plus city and nothing else, so a
--                bad match is the expected failure rather than an
--                edge case, and recording it stops the same wrong
--                person being re-appended on the next run.
--
--   opt-out      a column, not a spreadsheet. Once someone asks not
--                to be contacted that has to survive every later
--                append.
--
-- wrtt.contactable is the only view outreach should read: it drops
-- opted-out records and bad matches, drops suppressed people
-- entirely, and refuses to hand over a phone number that has not
-- been scrubbed against the Do Not Call registry.
--
-- Applied to the live database via the Supabase migration API; this
-- file is the record.
-- ============================================================

create table wrtt.contact (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references wrtt.person(id) on delete cascade,

  channel text not null check (channel in ('email','phone','linkedin','mailing')),
  value text not null,

  source text not null,
  source_detail text,
  acquired_at timestamptz not null default now(),
  confidence real check (confidence between 0 and 1),
  verified_at timestamptz,
  verified_by text,

  status text not null default 'unverified'
    check (status in ('unverified','active','bounced','opted_out','wrong_person','stale')),
  opted_out_at timestamptz,
  opt_out_note text,

  dnc_checked_at timestamptz,
  dnc_listed boolean,

  notes text,
  created_at timestamptz not null default now(),
  unique (person_id, channel, value)
);

create index contact_person_idx on wrtt.contact (person_id);
create index contact_status_idx on wrtt.contact (status) where status in ('unverified','active');
create index contact_source_idx on wrtt.contact (source);

create or replace view wrtt.contactable as
select c.id, c.person_id, p.display_name, m.name as market, m.state,
       c.channel, c.value, c.source, c.confidence, c.verified_at, c.status
from wrtt.contact c
join wrtt.person p on p.id = c.person_id
join wrtt.market m on m.id = p.market_id
where c.status in ('unverified','active')
  and not p.suppressed
  and (c.channel <> 'phone' or (c.dnc_checked_at is not null and c.dnc_listed is not true));
