-- ============================================================
-- WRTT – server-side interaction log for the gated console.
--
-- Client analytics cannot see the deck (a PDF runs no script) and the
-- whole console sits behind a gate, so the server records what actually
-- matters: did the person the link was sent to get in, and what did
-- they read.
--
-- Deliberately no IP address column. Coarse geography comes from the
-- CDN's request headers (city/region/country) and that is as precise
-- as this gets - consistent with the privacy posture the Method page
-- promises.
--
-- Applied to the live database via the Supabase migration API; this
-- file is the record.
-- ============================================================

create table wrtt.page_hit (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  kind text not null check (kind in
    ('page','sheet','method','profile','deck','gate_view','gate_pass','gate_fail')),
  path text not null,
  host text,
  market text,
  referer text,
  user_agent text,
  city text,
  region text,
  country text
);

create index page_hit_ts_idx on wrtt.page_hit (ts desc);
create index page_hit_kind_ts_idx on wrtt.page_hit (kind, ts desc);
