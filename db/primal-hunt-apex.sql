-- Primal Hunt Apex Hunt leaderboard (GAME_DATABASE_URL).
-- The API creates this itself on first use; this file is the same schema,
-- for setting the database up by hand or reading what it holds.
--
-- All time, one row per device, holding that device's best Apex Hunt.
-- No raw IP addresses: ip_hash is a salted SHA-256, used only to cap how
-- many devices one address can enter.

create table if not exists primal_hunt_apex (
  id         bigserial primary key,
  device_id  uuid        not null unique,
  name       text        not null check (name ~ '^[A-Z0-9]{3}$'),
  score      integer     not null check (score >= 0),
  waves      smallint    not null,
  run_time   real        not null,
  kills      integer     not null,
  level      integer     not null,
  bosses     smallint    not null,
  class_id   text        not null,
  ip_hash    text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists primal_hunt_apex_board on primal_hunt_apex (score desc, updated_at);
