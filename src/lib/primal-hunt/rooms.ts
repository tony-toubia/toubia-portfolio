import 'server-only';
import { randomInt } from 'node:crypto';
import { sql as getSql } from './db';
import { BadRequest, UUID } from './daily';

/**
 * Primal Hunt co-op: the meeting point, not the game. Players connect to
 * each other directly (WebRTC); this only carries the few messages it takes
 * to set that up - a guest asking to join, the host's offer, the guest's
 * answer - through two small tables. Nothing about the game itself passes
 * through here. Rooms last three hours; messages ten minutes.
 */
let ready: Promise<unknown> | null = null;

async function db() {
  const client = getSql();
  if (!client) return null;
  if (!ready) {
    const sql = client;
    ready = sql`
      create table if not exists primal_hunt_rooms (
        code       text        primary key,
        host_id    uuid        not null,
        created_at timestamptz not null default now()
      )`.then(() => sql`
      create table if not exists primal_hunt_signals (
        id         bigserial   primary key,
        code       text        not null,
        to_id      uuid        not null,
        from_id    uuid        not null,
        kind       text        not null,
        body       jsonb       not null,
        created_at timestamptz not null default now()
      )`).then(() => sql`create index if not exists primal_hunt_signals_inbox on primal_hunt_signals (code, to_id, id)`)
      .catch((e) => { ready = null; throw e; });
  }
  await ready;
  return client;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O: codes are read aloud and typed
const CODE = /^[A-HJ-NP-Z]{4}$/;
const KINDS = new Set(['join', 'offer', 'answer', 'bye']);
export const MAX_GUESTS = 3;

/** The ICE servers clients should use: STUN, plus TURN if it is configured. */
export function iceServers() {
  const list: { urls: string | string[]; username?: string; credential?: string }[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  ];
  if (process.env.GAME_TURN_URL) {
    list.push({ urls: process.env.GAME_TURN_URL.split(','), username: process.env.GAME_TURN_USER, credential: process.env.GAME_TURN_PASS });
  }
  return list;
}

export async function createRoom(hostId: string) {
  const sql = await db();
  if (!sql) return null;
  if (!UUID.test(hostId)) throw new BadRequest('bad id');
  // Tidy up as we go: old rooms and old messages.
  await sql`delete from primal_hunt_rooms where created_at < now() - interval '3 hours'`;
  await sql`delete from primal_hunt_signals where created_at < now() - interval '10 minutes'`;
  for (let tries = 0; tries < 8; tries++) {
    const code = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const rows = await sql`insert into primal_hunt_rooms (code, host_id) values (${code}, ${hostId}) on conflict (code) do nothing returning code`;
    if (rows.length) return { code, iceServers: iceServers() };
  }
  throw new BadRequest('no free room codes, try again');
}

export async function joinRoom(code: string, guestId: string, name: string) {
  const sql = await db();
  if (!sql) return null;
  code = code.toUpperCase();
  if (!CODE.test(code)) throw new BadRequest('room codes are four letters');
  if (!UUID.test(guestId)) throw new BadRequest('bad id');
  const [room] = await sql<{ host_id: string }[]>`
    select host_id from primal_hunt_rooms where code = ${code} and created_at > now() - interval '3 hours'`;
  if (!room) throw new BadRequest('no hunt with that code');
  const [{ joins }] = await sql<{ joins: number }[]>`
    select count(distinct from_id)::int as joins from primal_hunt_signals where code = ${code} and kind = 'join' and from_id <> ${guestId}`;
  if (joins >= 12) throw new BadRequest('too many people tried this room');
  await sql`insert into primal_hunt_signals (code, to_id, from_id, kind, body)
    values (${code}, ${room.host_id}, ${guestId}, 'join', ${sql.json({ name: name.slice(0, 16) })})`;
  return { hostId: room.host_id, iceServers: iceServers() };
}

export async function sendSignal(code: string, from: string, to: string, kind: string, body: unknown) {
  const sql = await db();
  if (!sql) return null;
  code = code.toUpperCase();
  if (!CODE.test(code) || !UUID.test(from) || !UUID.test(to)) throw new BadRequest('bad signal');
  if (!KINDS.has(kind) || kind === 'join') throw new BadRequest('bad kind');
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from primal_hunt_signals where code = ${code}`;
  if (n > 300) throw new BadRequest('too many messages in this room');
  await sql`insert into primal_hunt_signals (code, to_id, from_id, kind, body) values (${code}, ${to}, ${from}, ${kind}, ${sql.json(body as never)})`;
  return { ok: true };
}

/** Messages for `id` in a room, after the last one it has seen. */
export async function inbox(code: string, id: string, after: number) {
  const sql = await db();
  if (!sql) return null;
  code = code.toUpperCase();
  if (!CODE.test(code) || !UUID.test(id)) throw new BadRequest('bad inbox');
  const rows = await sql<{ id: string; from_id: string; kind: string; body: unknown }[]>`
    select id, from_id, kind, body from primal_hunt_signals
    where code = ${code} and to_id = ${id} and id > ${Math.max(0, Math.floor(after) || 0)} order by id limit 20`;
  return { messages: rows.map((r) => ({ id: Number(r.id), from: r.from_id, kind: r.kind, body: r.body })) };
}
