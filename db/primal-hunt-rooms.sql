-- Primal Hunt online co-op signalling (GAME_DATABASE_URL).
-- The API creates these itself on first use; this file is the same schema.
--
-- Only the WebRTC handshake passes through here (a guest's join request, the
-- host's offer, the guest's answer); the game itself runs peer to peer.
-- Rooms are kept three hours and messages ten minutes, pruned as new rooms open.

create table if not exists primal_hunt_rooms (
  code       text        primary key,
  host_id    uuid        not null,
  created_at timestamptz not null default now()
);

create table if not exists primal_hunt_signals (
  id         bigserial   primary key,
  code       text        not null,
  to_id      uuid        not null,
  from_id    uuid        not null,
  kind       text        not null,
  body       jsonb       not null,
  created_at timestamptz not null default now()
);

create index if not exists primal_hunt_signals_inbox on primal_hunt_signals (code, to_id, id);
