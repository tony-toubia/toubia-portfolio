import 'server-only';
import { createHash } from 'node:crypto';
import { sql as getSql } from './db';
import { BadRequest, BLOCKED, CLASSES, NAME, UUID, int } from './daily';

/**
 * Primal Hunt's weekly mutator leaderboard: one Survival rule-change a week
 * (see PH.MUTATORS in the game), one best score per device per week. Weeks
 * start on Monday, UTC, and are numbered by days since 1970 (a Thursday):
 * floor((days + 3) / 7). Checked like the daily board; not proof.
 */
let ready: Promise<unknown> | null = null;

async function db() {
  const client = getSql();
  if (!client) return null;
  // The table creates itself on first use (db/primal-hunt-weekly.sql is the same schema).
  if (!ready) {
    const sql = client;
    ready = sql`
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
      )`.then(() => sql`create index if not exists primal_hunt_weekly_board on primal_hunt_weekly (week, score desc, updated_at)`)
      .catch((e) => { ready = null; throw e; });
  }
  await ready;
  return client;
}

/** This week's number (Monday-start weeks, UTC). */
export const utcWeek = (offset = 0) => Math.floor((Date.now() / 86400000 + 3) / 7) + offset;
const MUTATORS = new Set(['twins', 'night', 'glass', 'surge', 'lava', 'giants', 'hyper', 'vampire']);

export type WeeklyEntry = { name: string; score: number; time: number; victory: boolean; classId: string };
export type WeeklyBoard = { week: number; total: number; top: WeeklyEntry[]; me: { score: number; rank: number } | null };

export async function weeklyBoard(week: number, deviceId?: string): Promise<WeeklyBoard | null> {
  const sql = await db();
  if (!sql) return null;
  if (!Number.isInteger(week) || week < 2900 || week > 9999) throw new BadRequest('bad week');
  const top = await sql<{ name: string; score: number; run_time: number; victory: boolean; class_id: string }[]>`
    select name, score, run_time, victory, class_id from primal_hunt_weekly
    where week = ${week} order by score desc, updated_at asc limit 10`;
  const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from primal_hunt_weekly where week = ${week}`;
  let me: WeeklyBoard['me'] = null;
  if (deviceId && UUID.test(deviceId)) {
    const [row] = await sql<{ score: number; rank: number }[]>`
      select score, (select count(*)::int from primal_hunt_weekly o where o.week = m.week and o.score > m.score) + 1 as rank
      from primal_hunt_weekly m where week = ${week} and device_id = ${deviceId}`;
    if (row) me = row;
  }
  return { week, total, me, top: top.map((r) => ({ name: r.name, score: r.score, time: Math.round(r.run_time), victory: r.victory, classId: r.class_id })) };
}

export type WeeklySubmission = {
  week: number; deviceId: string; name: string; classId: string; mutator: string;
  score: number; time: number; kills: number; level: number; bosses: number; victory: boolean; bonus: number;
};

export function validateWeekly(body: unknown): WeeklySubmission {
  if (!body || typeof body !== 'object') throw new BadRequest('bad body');
  const b = body as Record<string, unknown>;
  const week = Number(b.week);
  if (week !== utcWeek() && week !== utcWeek(-1)) throw new BadRequest('that week has closed');
  const deviceId = String(b.deviceId ?? '');
  if (!UUID.test(deviceId)) throw new BadRequest('bad device');
  const name = String(b.name ?? '').toUpperCase();
  if (!NAME.test(name)) throw new BadRequest('initials are three letters or digits');
  if (BLOCKED.has(name)) throw new BadRequest('pick other initials');
  const classId = String(b.classId ?? '');
  if (!CLASSES.has(classId)) throw new BadRequest('bad hunter');
  const mutator = String(b.mutator ?? '');
  if (!MUTATORS.has(mutator)) throw new BadRequest('bad mutator');
  const time = int(b.time, 0, 900, 'time');
  const kills = Math.round(int(b.kills, 0, Math.max(60, time * 25), 'kills'));
  const level = Math.round(int(b.level, 1, 80, 'level'));
  const bosses = Math.round(int(b.bosses, 0, 6, 'bosses'));       // Double Trouble brings twins
  const victory = b.victory === true;
  if (victory && bosses < 1) throw new BadRequest('bad victory');
  const bonus = Math.round(int(b.bonus ?? 0, 0, 250 * level, 'bonus'));
  if (bonus % 250 !== 0) throw new BadRequest('bad bonus');
  const expected = Math.round(kills + time * 2 + bosses * 500 + (victory ? 2000 : 0) + bonus);
  const score = Math.round(int(b.score, 0, 1e6, 'score'));
  if (Math.abs(score - expected) > 2) throw new BadRequest('score does not add up');
  return { week, deviceId, name, classId, mutator, score, time, kills, level, bosses, victory, bonus };
}

const hashIp = (ip: string, week: number) =>
  createHash('sha256').update(`${process.env.GAME_HASH_SALT ?? 'primal-hunt'}:week:${week}:${ip}`).digest('hex').slice(0, 32);

export async function submitWeekly(s: WeeklySubmission, ip: string) {
  const sql = await db();
  if (!sql) return null;
  const ipHash = hashIp(ip || 'unknown', s.week);
  const [{ devices }] = await sql<{ devices: number }[]>`
    select count(*)::int as devices from primal_hunt_weekly where week = ${s.week} and ip_hash = ${ipHash} and device_id <> ${s.deviceId}`;
  if (devices >= 8) throw new BadRequest('too many entries from here this week');
  await sql`
    insert into primal_hunt_weekly (week, device_id, name, score, run_time, kills, level, bosses, victory, class_id, mutator, ip_hash)
    values (${s.week}, ${s.deviceId}, ${s.name}, ${s.score}, ${s.time}, ${s.kills}, ${s.level}, ${s.bosses}, ${s.victory}, ${s.classId}, ${s.mutator}, ${ipHash})
    on conflict (week, device_id) do update set
      name = excluded.name, score = excluded.score, run_time = excluded.run_time, kills = excluded.kills, level = excluded.level,
      bosses = excluded.bosses, victory = excluded.victory, class_id = excluded.class_id, ip_hash = excluded.ip_hash, updated_at = now()
    where excluded.score > primal_hunt_weekly.score`;
  return weeklyBoard(s.week, s.deviceId);
}
