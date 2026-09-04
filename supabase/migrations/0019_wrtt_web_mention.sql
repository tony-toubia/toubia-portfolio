-- ============================================================
-- WRTT – where a candidate is named on their organization's
-- own website.
--
-- Not a contact channel, so not wrtt.contact: a board-page
-- listing is not a way to reach anyone. What it is worth is
-- confirmation and a pointer. A 990 can be two years stale, so
-- seeing someone named on the organization's current site says
-- the role is live, and the page URL sends a researcher straight
-- to the roster.
--
-- Leads, not facts. The scan matches on name, so a common name on
-- a busy page can be somebody else; the stored context lets a
-- human judge that at a glance.
--
-- Applied to the live database via the Supabase migration API;
-- this file is the record.
-- ============================================================

create table if not exists wrtt.web_mention (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references wrtt.person(id) on delete cascade,
  organization_id uuid references wrtt.organization(id) on delete set null,
  page_url text not null,
  matched_as text,
  context text,
  found_at timestamptz not null default now(),
  unique (person_id, page_url)
);

create index if not exists web_mention_person_idx on wrtt.web_mention (person_id);
