-- ============================================================
-- WRTT Index — core schema
-- Follows the build spec, §5 (data model) and §8 (lifecycle).
--
-- Isolated in its own schema so it can be lifted into a dedicated
-- project later without colliding with anything in public.
-- ============================================================

create schema if not exists wrtt;

-- Verified available on the target instance.
create extension if not exists postgis       with schema extensions;  -- territory polygons
create extension if not exists fuzzystrmatch with schema extensions;  -- jaro-winkler, levenshtein
create extension if not exists pg_trgm       with schema extensions;  -- surname blocking
create extension if not exists pgcrypto      with schema extensions;  -- digests
create extension if not exists unaccent      with schema extensions;  -- name normalization

-- ── Territory ────────────────────────────────────────────────

create table wrtt.market (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  state           text not null,
  status          text not null default 'target'
                    check (status in ('open','active','target')),
  -- Polygon when we have one; the zip array is the practical fallback
  -- and is what the POC actually seeds from.
  boundary        extensions.geography(polygon, 4326),
  zips            text[] not null default '{}',
  household_count int,
  -- Validation markets carry a known-good publisher we suppress and
  -- then check for in the ranked output. See spec §9 success criteria.
  role            text not null default 'utility'
                    check (role in ('validation','utility','control')),
  created_at      timestamptz not null default now(),
  unique (name, state)
);

-- ── Provenance ───────────────────────────────────────────────

create table wrtt.source_document (
  id            uuid primary key default gen_random_uuid(),
  source_key    text not null,        -- irs_990 | propublica | municipal | chamber | runsignup | ...
  url           text,
  retrieved_at  timestamptz not null default now(),
  storage_path  text,
  content_hash  text not null,
  parse_status  text not null default 'pending'
                  check (parse_status in ('pending','parsed','failed','quarantined')),
  -- Conditional-request bookkeeping so a re-crawl mostly returns 304.
  http_etag     text,
  http_last_mod text,
  unique (source_key, content_hash)
);

create index on wrtt.source_document (source_key, retrieved_at desc);

-- ── Graph ────────────────────────────────────────────────────

create table wrtt.organization (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  name_normalized  text not null,
  ein              text,
  domains          text[] not null default '{}',
  market_id        uuid references wrtt.market(id) on delete set null,
  affiliation_domain text,             -- education | youth_sports | faith | arts | civic | health | business | philanthropy | neighborhood
  scale_revenue    numeric,
  scale_confidence real not null default 0.5,
  city             text,
  state            text,
  zip              text,
  created_at       timestamptz not null default now(),
  unique (ein)
);

create index on wrtt.organization (market_id);
create index on wrtt.organization using gin (name_normalized extensions.gin_trgm_ops);

create table wrtt.person (
  id                 uuid primary key default gen_random_uuid(),
  display_name       text not null,
  name_normalized    text not null,
  name_variants      text[] not null default '{}',
  surname_block      text,             -- normalized surname prefix, the blocking key
  market_id          uuid references wrtt.market(id) on delete set null,
  first_seen         date,
  last_seen          date,
  suppressed         boolean not null default false,
  suppression_reason text,
  resolution_confidence real not null default 1.0,
  created_at         timestamptz not null default now()
);

create index on wrtt.person (market_id) where not suppressed;
create index on wrtt.person (surname_block, market_id);
create index on wrtt.person using gin (name_normalized extensions.gin_trgm_ops);

-- The core edge: a time-bounded role at an organization.
create table wrtt.affiliation (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references wrtt.person(id) on delete cascade,
  organization_id uuid not null references wrtt.organization(id) on delete cascade,
  role_title      text not null,       -- verbatim from source
  role_class      text not null
                    check (role_class in ('founder','president','chair','officer','director',
                                          'board_member','committee_chair','coach_organizer',
                                          'staff','member','volunteer')),
  hours_per_week  numeric,
  start_date      date,
  end_date        date,
  confidence      real not null default 0.8,
  created_at      timestamptz not null default now(),
  unique (person_id, organization_id, role_title, start_date)
);

create index on wrtt.affiliation (person_id);
create index on wrtt.affiliation (organization_id);

-- Every claim traces to a source. No exceptions. (spec §2)
create table wrtt.evidence (
  id                 uuid primary key default gen_random_uuid(),
  subject_type       text not null check (subject_type in ('affiliation','person','organization','feature')),
  subject_id         uuid not null,
  source_document_id uuid not null references wrtt.source_document(id) on delete cascade,
  snippet            text not null,
  extracted_at       timestamptz not null default now(),
  extractor_version  text not null
);

create index on wrtt.evidence (subject_type, subject_id);

-- ── Scoring ──────────────────────────────────────────────────

create table wrtt.score_run (
  id            uuid primary key default gen_random_uuid(),
  market_id     uuid not null references wrtt.market(id) on delete cascade,
  model_version text not null,
  weights       jsonb not null,
  run_at        timestamptz not null default now(),
  notes         text
);

create table wrtt.score (
  id             uuid primary key default gen_random_uuid(),
  score_run_id   uuid not null references wrtt.score_run(id) on delete cascade,
  person_id      uuid not null references wrtt.person(id) on delete cascade,
  wrtt_score     real not null,        -- 0-100, in-market percentile
  components     jsonb not null,       -- M B R T A X, raw and weighted
  confidence     real not null,
  rank_in_market int not null,
  unique (score_run_id, person_id)
);

create index on wrtt.score (score_run_id, rank_in_market);

-- ── Human loop ───────────────────────────────────────────────

create table wrtt.feedback (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references wrtt.person(id) on delete cascade,
  actor_id   text not null,
  verdict    text not null
               check (verdict in ('confirm','reject','already_known','wrong_person','do_not_contact')),
  note       text,
  created_at timestamptz not null default now()
);

create index on wrtt.feedback (person_id);

create table wrtt.candidate_state (
  person_id      uuid primary key references wrtt.person(id) on delete cascade,
  state          text not null default 'new'
                   check (state in ('new','surfaced','reviewed','known_to_publisher',
                                    'not_a_fit','in_outreach','engaged','converted',
                                    'declined','suppressed')),
  state_since    timestamptz not null default now(),
  cooldown_until timestamptz,
  set_by         text,
  reason         text
);

create table wrtt.change_event (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references wrtt.person(id) on delete cascade,
  score_run_id uuid references wrtt.score_run(id) on delete set null,
  kind         text not null
                 check (kind in ('new_entrant','role_escalation','breadth_gain',
                                 'availability_change','score_move','decay_drop')),
  delta        jsonb not null,
  reason_text  text not null,        -- shown verbatim in the feed; mandatory (spec §8.5)
  created_at   timestamptz not null default now()
);

create index on wrtt.change_event (person_id, created_at desc);

-- ── Helpers ──────────────────────────────────────────────────

-- Normalization used consistently by ingestion and by resolution.
create or replace function wrtt.norm_name(raw text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           lower(extensions.unaccent(coalesce(raw, ''))),
           '[^a-z0-9 ]', '', 'g'
         )
$$;

-- Blocking key: normalized surname, first four characters.
create or replace function wrtt.surname_key(raw text)
returns text
language sql
immutable
as $$
  select substr(
    coalesce(
      nullif(regexp_replace(wrtt.norm_name(raw), '^.*\s', ''), ''),
      wrtt.norm_name(raw)
    ), 1, 4)
$$;

comment on schema wrtt is
  'Who Runs This Town Index. Scored graph of public community-leadership signal, per market.';
