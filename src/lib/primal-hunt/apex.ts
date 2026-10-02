import 'server-only';
import { createHash } from 'node:crypto';
import { sql as getSql } from './db';
import { BadRequest, BLOCKED, CLASSES, NAME, UUID, int } from './daily';

/**
 * Primal Hunt's Apex Hunt leaderboard: all time, one best run per device.
 *
 * An Apex Hunt starts from a Survival win, so a run is only accepted if it
 * won (three monsters slain at least) and its score adds up by the game's
 * own formula, with the same kind of bounds as the daily board. As with the
 * daily board this keeps the impossible off; it is not proof.
 */
let ready: Promise<unknown> | null = null;

async function db() {
  const client = getSql();
  if (!client) return null;
  // The table creates itself on first use (db/primal-hunt-apex.sql is the same schema).
  if (!ready) {
    const sql = client;
    ready = sql`
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
      )`.then(() => sql`create index if not exists primal_hunt_apex_board on primal_hunt_apex (score desc, updated_at)`)
      .catch((e) => { ready = null; throw e; });
  }
  await ready;
  return client;
}

export type ApexEntry = { name: string; score: number; waves: number; time: number; classId: string };
export type ApexBoard = { total: number; top: ApexEntry[]; me: { score: number; waves: number; rank: number } | null };

export async function apexBoard(deviceId?: string): Promise<ApexBoard | null> {
  const sql = await db();
  if (!sql) return null;
  const top = await sql<{ name: string; score: number; waves: number; run_time: number; class_id: string }[]>`
    select name, score, waves, run_time, class_id from primal_hunt_apex order by score desc, updated_at asc limit 10`;
  const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from primal_hunt_apex`;
  let me: ApexBoard['me'] = null;
  if (deviceId && UUID.test(deviceId)) {
    const [row] = await sql<{ score: number; waves: number; rank: number }[]>`
      select score, waves, (select count(*)::int from primal_hunt_apex o where o.score > m.score) + 1 as rank
      from primal_hunt_apex m where device_id = ${deviceId}`;
    if (row) me = row;
  }
  return { total, me, top: top.map((r) => ({ name: r.name, score: r.score, waves: r.waves, time: Math.round(r.run_time), classId: r.class_id })) };
}

export type ApexSubmission = {
  deviceId: string; name: string; classId: string;
  score: number; time: number; kills: number; level: number; bosses: number; waves: number; bonus: number;
};

/** Check a submission is an Apex Hunt the game could have produced. */
export function validateApex(body: unknown): ApexSubmission {
  if (!body || typeof body !== 'object') throw new BadRequest('bad body');
  const b = body as Record<string, unknown>;
  const deviceId = String(b.deviceId ?? '');
  if (!UUID.test(deviceId)) throw new BadRequest('bad device');
  const name = String(b.name ?? '').toUpperCase();
  if (!NAME.test(name)) throw new BadRequest('initials are three letters or digits');
  if (BLOCKED.has(name)) throw new BadRequest('pick other initials');
  const classId = String(b.classId ?? '');
  if (!CLASSES.has(classId)) throw new BadRequest('bad hunter');
  const time = int(b.time, 200, 5400, 'time');                  // a win takes about four minutes at the least
  const kills = Math.round(int(b.kills, 0, Math.max(60, time * 25), 'kills'));
  const level = Math.round(int(b.level, 1, 150, 'level'));
  const bosses = Math.round(int(b.bosses, 3, 600, 'bosses'));   // the three of the win, then the Apex monsters
  const waves = Math.round(int(b.waves, 0, 300, 'waves'));
  if (bosses - 3 < waves) throw new BadRequest('bad waves');     // every cleared wave slew at least one
  const bonus = Math.round(int(b.bonus ?? 0, 0, 250 * level, 'bonus'));
  if (bonus % 250 !== 0) throw new BadRequest('bad bonus');
  // The game's formula: kills + 2 per second + 500 per monster + 2000 for the win + bonus.
  const expected = Math.round(kills + time * 2 + bosses * 500 + 2000 + bonus);
  const score = Math.round(int(b.score, 0, 1e7, 'score'));
  if (Math.abs(score - expected) > 2) throw new BadRequest('score does not add up');
  return { deviceId, name, classId, score, time, kills, level, bosses, waves, bonus };
}

const hashIp = (ip: string) =>
  createHash('sha256').update(`${process.env.GAME_HASH_SALT ?? 'primal-hunt'}:apex:${ip}`).digest('hex').slice(0, 32);

/** Keep the device's best Apex Hunt. Returns the board afterwards. */
export async function submitApex(s: ApexSubmission, ip: string) {
  const sql = await db();
  if (!sql) return null;
  const ipHash = hashIp(ip || 'unknown');
  // A handful of devices per address: a household, not a script.
  const [{ devices }] = await sql<{ devices: number }[]>`
    select count(*)::int as devices from primal_hunt_apex where ip_hash = ${ipHash} and device_id <> ${s.deviceId}`;
  if (devices >= 8) throw new BadRequest('too many entries from here');
  await sql`
    insert into primal_hunt_apex (device_id, name, score, waves, run_time, kills, level, bosses, class_id, ip_hash)
    values (${s.deviceId}, ${s.name}, ${s.score}, ${s.waves}, ${s.time}, ${s.kills}, ${s.level}, ${s.bosses}, ${s.classId}, ${ipHash})
    on conflict (device_id) do update set
      name = excluded.name, score = excluded.score, waves = excluded.waves, run_time = excluded.run_time, kills = excluded.kills,
      level = excluded.level, bosses = excluded.bosses, class_id = excluded.class_id, ip_hash = excluded.ip_hash, updated_at = now()
    where excluded.score > primal_hunt_apex.score`;
  return apexBoard(s.deviceId);
}
