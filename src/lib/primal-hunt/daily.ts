import 'server-only';
import { createHash } from 'node:crypto';
import { sql as getSql } from './db';

/**
 * Primal Hunt's daily challenge leaderboard.
 *
 * Its own database (GAME_DATABASE_URL), deliberately separate from WRTT's: a
 * public game should never hold a connection to data about private people.
 * With the variable unset, the leaderboard reports itself offline and the
 * game still runs the daily challenge locally.
 *
 * The game runs in the browser, so a score cannot be proven. What the server
 * can do is refuse the impossible: it recomputes the score from its parts
 * (kills, time, monsters slain, victory, bonus) and bounds each one, accepts
 * runs only for today (or yesterday, for a run that crossed midnight UTC),
 * keeps one best score per device per day, and caps how many devices one
 * address can enter. Enough to keep the board honest-looking; not proof.
 */

export { isConfigured } from './db';

let ready: Promise<unknown> | null = null;

async function db() {
  const client = getSql();
  if (!client) return null;
  // The table creates itself on first use (db/primal-hunt-daily.sql is the same schema).
  if (!ready) {
    const sql = client;
    ready = sql`
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
      )`.then(() => sql`create index if not exists primal_hunt_daily_board on primal_hunt_daily (day, score desc, updated_at)`)
      .catch((e) => { ready = null; throw e; });
  }
  await ready;
  return client;
}

/** Today's date in UTC, the day everyone shares. */
export const utcDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NAME = /^[A-Z0-9]{3}$/;
export const CLASSES = new Set(['assault', 'trapper', 'medic', 'support', 'ranger']);
// Three letters can still spell things; keep the obvious ones off the board.
export const BLOCKED = new Set(['ASS', 'FUK', 'FUC', 'FCK', 'CUM', 'COC', 'COK', 'DIK', 'DIC', 'FAG', 'GAY', 'JEW', 'KKK', 'NIG', 'NGR', 'SEX', 'TIT', 'VAG', 'WTF', 'SHT', 'CNT', 'KYS', 'POO', 'PEE', 'HOE', 'SUK', 'SUX', 'XXX', 'NAZ', 'GOD']);

export type Entry = { name: string; score: number; time: number; victory: boolean; classId: string };
export type Board = { day: string; total: number; top: Entry[]; me: { score: number; rank: number } | null };

export async function board(day: string, deviceId?: string): Promise<Board | null> {
  const sql = await db();
  if (!sql) return null;
  if (!DAY.test(day)) throw new BadRequest('bad day');
  const top = await sql<{ name: string; score: number; run_time: number; victory: boolean; class_id: string }[]>`
    select name, score, run_time, victory, class_id from primal_hunt_daily
    where day = ${day} order by score desc, updated_at asc limit 10`;
  const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from primal_hunt_daily where day = ${day}`;
  let me: Board['me'] = null;
  if (deviceId && UUID.test(deviceId)) {
    const [row] = await sql<{ score: number; rank: number }[]>`
      select score, (select count(*)::int from primal_hunt_daily o where o.day = m.day and o.score > m.score) + 1 as rank
      from primal_hunt_daily m where day = ${day} and device_id = ${deviceId}`;
    if (row) me = { score: row.score, rank: row.rank };
  }
  return {
    day, total, me,
    top: top.map((r) => ({ name: r.name, score: r.score, time: Math.round(r.run_time), victory: r.victory, classId: r.class_id })),
  };
}

export class BadRequest extends Error {}

export type Submission = {
  day: string; deviceId: string; name: string; classId: string;
  score: number; time: number; kills: number; level: number; bosses: number; victory: boolean; bonus: number;
};

export const int = (v: unknown, lo: number, hi: number, what: string) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new BadRequest(`bad ${what}`);
  return v;
};

/** Check a submission is a run the game could have produced. */
export function validate(body: unknown): Submission {
  if (!body || typeof body !== 'object') throw new BadRequest('bad body');
  const b = body as Record<string, unknown>;
  const day = String(b.day ?? '');
  if (day !== utcDay() && day !== utcDay(-1)) throw new BadRequest('that daily has closed');
  const deviceId = String(b.deviceId ?? '');
  if (!UUID.test(deviceId)) throw new BadRequest('bad device');
  const name = String(b.name ?? '').toUpperCase();
  if (!NAME.test(name)) throw new BadRequest('initials are three letters or digits');
  if (BLOCKED.has(name)) throw new BadRequest('pick other initials');
  const classId = String(b.classId ?? '');
  if (!CLASSES.has(classId)) throw new BadRequest('bad hunter');
  const time = int(b.time, 0, 900, 'time');
  const kills = Math.round(int(b.kills, 0, Math.max(60, time * 25), 'kills'));
  const level = Math.round(int(b.level, 1, 80, 'level'));
  const bosses = Math.round(int(b.bosses, 0, 3, 'bosses'));
  const victory = b.victory === true;
  if (victory && bosses < 1) throw new BadRequest('bad victory');
  const bonus = Math.round(int(b.bonus ?? 0, 0, 250 * level, 'bonus'));
  if (bonus % 250 !== 0) throw new BadRequest('bad bonus');
  // The game's own formula: kills + 2 per second + 500 per monster + 2000 for the win + bonus.
  const expected = Math.round(kills + time * 2 + bosses * 500 + (victory ? 2000 : 0) + bonus);
  const score = Math.round(int(b.score, 0, 1e6, 'score'));
  if (Math.abs(score - expected) > 2) throw new BadRequest('score does not add up');
  return { day, deviceId, name, classId, score, time, kills, level, bosses, victory, bonus };
}

const hashIp = (ip: string, day: string) =>
  createHash('sha256').update(`${process.env.GAME_HASH_SALT ?? 'primal-hunt'}:${day}:${ip}`).digest('hex').slice(0, 32);

/** Keep the device's best score for the day. Returns its standing afterwards. */
export async function submit(s: Submission, ip: string) {
  const sql = await db();
  if (!sql) return null;
  const ipHash = hashIp(ip || 'unknown', s.day);
  // One address, a handful of devices a day: a household, not a script.
  const [{ devices }] = await sql<{ devices: number }[]>`
    select count(*)::int as devices from primal_hunt_daily where day = ${s.day} and ip_hash = ${ipHash} and device_id <> ${s.deviceId}`;
  if (devices >= 8) throw new BadRequest('too many entries from here today');
  await sql`
    insert into primal_hunt_daily (day, device_id, name, score, run_time, kills, level, bosses, victory, class_id, ip_hash)
    values (${s.day}, ${s.deviceId}, ${s.name}, ${s.score}, ${s.time}, ${s.kills}, ${s.level}, ${s.bosses}, ${s.victory}, ${s.classId}, ${ipHash})
    on conflict (day, device_id) do update set
      name = excluded.name, score = excluded.score, run_time = excluded.run_time, kills = excluded.kills,
      level = excluded.level, bosses = excluded.bosses, victory = excluded.victory, ip_hash = excluded.ip_hash, updated_at = now()
    where excluded.score > primal_hunt_daily.score`;
  return board(s.day, s.deviceId);
}
