-- Primal Hunt weekly mutator leaderboard (GAME_DATABASE_URL).
-- The API creates this itself on first use; this file is the same schema.
--
-- One row per device per week (Monday-start weeks, UTC, numbered by
-- floor((days since 1970 + 3) / 7)), holding that device's best score.
-- ip_hash is a salted, per-week SHA-256, used only to cap devices per address.

create table if not exists primal_hunt_weekly (
  id         bigserial primary key,
  week       integer     not null,
  device_id  uuid        not null,
  name       text        not null check (name ~ '^[A-Z0-9]{3}$'),
  score      integer     not null check (score >= 0),
  run_time   real        not null,
  kills      integer     not null,
  level      integer     not null,
  bosses     smallint    not null,
  victory    boolean     not null,
  class_id   text        not null,
  mutator    text        not null,
  ip_hash    text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week, device_id)
);

create index if not exists primal_hunt_weekly_board on primal_hunt_weekly (week, score desc, updated_at);
