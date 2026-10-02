-- Primal Hunt daily challenge leaderboard (GAME_DATABASE_URL).
-- The API creates this itself on first use; this file is the same schema,
-- for setting the database up by hand or reading what it holds.
--
-- One row per device per UTC day, holding that device's best score.
-- No raw IP addresses: ip_hash is a salted, per-day SHA-256, used only to
-- cap how many devices one address can enter in a day.

create table if not exists primal_hunt_daily (
  id         bigserial primary key,
  day        date        not null,
  device_id  uuid        not null,
  name       text        not null check (name ~ '^[A-Z0-9]{3}$'),
  score      integer     not null check (score >= 0),
  run_time   real        not null,
  kills      integer     not null,
  level      integer     not null,
  bosses     smallint    not null,
  victory    boolean     not null,
  class_id   text        not null,
  ip_hash    text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (day, device_id)
);

create index if not exists primal_hunt_daily_board on primal_hunt_daily (day, score desc, updated_at);
