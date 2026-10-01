#!/usr/bin/env node
/**
 * Headless balance runs for Primal Hunt.
 *
 * game.js has no DOM or three.js dependency, so a whole run can be simulated
 * in Node at many times real speed. A simple bot kites away from the nearest
 * crowd and picks upgrades by a fixed preference, which is a fair stand-in
 * for a casual player: it moves constantly and never dodges on purpose.
 *
 *   node scripts/primal-hunt-sim.mjs                 # every class, 5 seeds each
 *   node scripts/primal-hunt-sim.mjs --class medic --seeds 20
 *   node scripts/primal-hunt-sim.mjs --idle          # a player who never moves
 *   node scripts/primal-hunt-sim.mjs --no-abilities  # never uses the special or dodge
 *   node scripts/primal-hunt-sim.mjs --monster       # monster mode, every monster
 *   node scripts/primal-hunt-sim.mjs --monster kraken --seeds 20
 *
 * By default the bot fires its special when it is crowded or near a monster,
 * and dodges about half of the boss attacks it is standing in - roughly how a
 * player who has found the buttons plays.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : d; };
const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public/map-mobile-game/js');

const ctx = { console, Math, Object, Array, Set, Map, Float32Array, Int32Array, Number, JSON };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['config.js', 'render.js', 'game.js', 'monster.js']) {
  // render.js defines PH.NullRender; its three.js parts are never touched.
  let src = fs.readFileSync(path.join(dir, f), 'utf8');
  if (f === 'render.js') src = 'var THREE = new Proxy({}, { get: () => function () {} });\n' + src;
  vm.runInContext(src, ctx, { filename: f });
}
const PH = ctx.PH;

function run(classId, seed, idle) {
  const log = { levels: [], bosses: [], events: [] };
  let ended = null;
  const g = new PH.Game(new PH.NullRender(), {
    onEnd: (r) => { ended = r; },
    onChoice: (choices) => {
      // Prefer: owned weapon upgrades, new weapons, damage/cooldown passives.
      const rank = (c) => (c.type === 'evolve' ? -1 : c.type === 'weapon' && c.level > 1 ? 0 : c.type === 'weapon' ? 1
        : ['power', 'haste', 'multishot', 'area'].includes(c.id) ? 2 : 3);
      choices.sort((a, b) => rank(a) - rank(b));
      log.levels.push({ t: Math.round(g.time), level: g.level, pick: `${choices[0].id}${choices[0].level ? ' L' + choices[0].level : ''}` });
      g.choose(choices[0]);
    },
    onBoss: (bs) => log.bosses.push({ t: Math.round(g.time), alive: bs.map((b) => `${b.name}:${Math.round(b.hp)}`) }),
    onBanner: (text) => log.events.push(`${Math.round(g.time)}s ${text}`),
  });
  g.newRun(classId, seed);
  const dt = PH.CONFIG.step;
  let orbit = 0, maxAlive = 0;
  while (g.state !== 'over' && g.time < 420) {
    if (!idle) {
      // A casual player: drift toward gems, step away from anything close,
      // hold a boss at mid range. No deliberate dodging of telegraphs.
      const pl = g.player;
      let ix = 0, iz = 0;
      for (const e of g.enemies) {
        if (!e.alive) continue;
        const dx = e.x - pl.x, dz = e.z - pl.z, d2 = dx * dx + dz * dz;
        if (d2 < 12) { const w = 1 / (d2 + 0.3); ix -= dx * w; iz -= dz * w; }
      }
      let best = null, bd = 81;
      for (const gm of g.gems) {
        if (!gm.alive) continue;
        const d2 = (gm.x - pl.x) ** 2 + (gm.z - pl.z) ** 2;
        if (d2 < bd) { bd = d2; best = gm; }
      }
      if (best) { const d = Math.sqrt(bd) || 1; ix += (best.x - pl.x) / d * 0.6; iz += (best.z - pl.z) / d * 0.6; }
      for (const pk of g.pickups) if (pk.alive) { const dx = pk.x - pl.x, dz = pk.z - pl.z, d = Math.hypot(dx, dz) || 1; if (d < 12) { ix += dx / d; iz += dz / d; } }
      for (const b of g.bosses) {
        const dx = b.x - pl.x, dz = b.z - pl.z, d = Math.hypot(dx, dz) || 1;
        const want = d < 6 ? -1.5 : d > 9 ? 0.5 : 0;
        ix += dx / d * want; iz += dz / d * want;
        ix += -dz / d * 0.5; iz += dx / d * 0.5;   // strafe around it
      }
      orbit += dt * 0.4;
      ix += Math.cos(orbit) * 0.15; iz += Math.sin(orbit) * 0.15;
      const m = Math.hypot(ix, iz);
      g.input.x = m > 0.05 ? ix / m : 0; g.input.z = m > 0.05 ? iz / m : 0;

      if (abilities) {
        let near = 0;
        for (const e of g.enemies) if (e.alive && (e.x - pl.x) ** 2 + (e.z - pl.z) ** 2 < 16) near++;
        const bossNear = g.bosses.some((b) => Math.hypot(b.x - pl.x, b.z - pl.z) < 8);
        const hurt = pl.hp < pl.maxHp * 0.5;
        if (g.abilityReady() && (near >= 8 || bossNear || (g.abilityId === 'pulse' && hurt))) g.useAbility();
        // Dodge a boss attack that is about to land on us - about half the time.
        if (g.dodgeCd <= 0 && Math.floor(g.time * 10) % 2 === 0) {
          for (const t of g.telegraphs) {
            if (!t.owner || t.t / t.dur < 0.6) continue;
            let inside, ax = pl.x - t.x, az = pl.z - t.z;
            if (t.shape === 'circle') inside = Math.hypot(ax, az) < t.r + 0.5;
            else {
              const fx = Math.sin(t.angle), fz = Math.cos(t.angle), along = ax * fx + az * fz, side = Math.abs(ax * fz - az * fx);
              inside = along > -1 && along < t.len && side < t.w / 2 + 0.6;
              if (inside) { ax = fz * Math.sign(ax * fz - az * fx || 1); az = -fx * Math.sign(ax * fz - az * fx || 1); }
            }
            if (inside) {
              const am = Math.hypot(ax, az) || 1;
              g.input.x = ax / am; g.input.z = az / am;
              g.dodge();
              break;
            }
          }
        }
      }
    }
    g.update(dt);
    maxAlive = Math.max(maxAlive, g.aliveEnemies);
    if (g.state === 'choice') { /* handled synchronously in onChoice */ }
  }
  return { classId, seed, bossOrder: g.bossOrder.join('>'), uses: g.abilityUses, dodges: g.dodges, evos: g.weapons.filter((w) => w.level > 5).length, ...(ended || { victory: false, time: g.time, kills: g.kills, level: g.level, bossKills: g.bossKills, score: g.score() }), maxAlive, dmgTaken: Math.round(g.player.damageTaken), log };
}

/**
 * Monster-mode bot: eats, hides in grass and flees the squad until it is
 * strong (stage 3, or a healthy stage 2 against a split squad), evolves
 * when nobody is watching, then hunts the hunters with its claws and special.
 */
function runMonster(type, seed) {
  let ended = null;
  const g = new PH.MonsterGame(new PH.NullRender(), { onEnd: (r) => { ended = r; } });
  g.newRun(type, seed);
  const dt = PH.CONFIG.step;
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  let firstSeen = null;
  while (g.state !== 'over' && g.time < 400) {
    const pl = g.player;
    const ups = g.hunters.filter((h) => h.state === 'up');
    const downs = g.hunters.filter((h) => h.state === 'down');
    const near = ups.filter((h) => d(h, pl) < 11);
    const strong = g.stage === 3 || (g.stage === 2 && pl.hp > pl.maxHp * 0.55 && near.length <= 2);
    if (g.spotted && firstSeen === null) firstSeen = g.time;
    let ix = 0, iz = 0;
    if (g.canEvolve() && near.length === 0) g.evolve();
    if (strong && (ups.length || downs.length)) {
      const targets = downs.length && downs.some((h) => d(h, pl) < 8) ? downs : ups.length ? ups : downs;
      let t = targets[0];
      for (const h of targets) if (d(h, pl) < d(t, pl)) t = h;
      ix = t.x - pl.x; iz = t.z - pl.z;
      if (d(t, pl) < 7) g.useAbility();
    } else if (near.length) {
      // Run for the grass patch that is furthest from the squad, relative to us.
      let away = { x: 0, z: 0 };
      for (const h of near) { const dd = d(h, pl) || 1; away.x -= (h.x - pl.x) / dd; away.z -= (h.z - pl.z) / dd; }
      let best = null, bs = -Infinity;
      for (const gr of g.grass) {
        const dd = d(gr, pl) || 1, dir = ((gr.x - pl.x) * away.x + (gr.z - pl.z) * away.z) / dd;
        const score = dir * 2 - dd * 0.15;
        if (score > bs) { bs = score; best = gr; }
      }
      ix = away.x; iz = away.z;
      if (best) { const dd = d(best, pl) || 1; ix += (best.x - pl.x) / dd * 1.2; iz += (best.z - pl.z) / dd * 1.2; }
      if (near.some((h) => d(h, pl) < 3.5)) g.useAbility();
      if (near.some((h) => d(h, pl) < 5)) g.dodge();
    } else if (pl.armor < pl.maxArmor * 0.6 && g.stage < 3) {
      // Armour stripped and unseen: lie low in grass until it grows back.
      let best = null;
      for (const gr of g.grass) if (!best || d(gr, pl) < d(best, pl)) best = gr;
      if (best && d(best, pl) > best.r * 0.5) { ix = best.x - pl.x; iz = best.z - pl.z; }
    } else {
      let best = null;
      for (const e of g.enemies) if (e.alive && (!best || d(e, pl) < d(best, pl))) best = e;
      if (best) { ix = best.x - pl.x; iz = best.z - pl.z; }
    }
    // Keep off the wall.
    const r = Math.hypot(pl.x, pl.z);
    if (r > PH.MONSTER_MODE.arena - 4) { ix -= pl.x / r * 0.6; iz -= pl.z / r * 0.6; }
    const m = Math.hypot(ix, iz);
    g.input.x = m > 0.001 ? ix / m : 0; g.input.z = m > 0.001 ? iz / m : 0;
    g.update(dt);
    if (process.env.TRACE && Math.floor(g.time * 2) !== Math.floor((g.time - dt) * 2)) {
      const c = ups.reduce((a, h) => ({ x: a.x + h.x / ups.length, z: a.z + h.z / ups.length }), { x: 0, z: 0 });
      const k = g.team.known;
      console.log(`t=${g.time.toFixed(1).padStart(5)} st${g.stage} hid=${pl.hidden ? 1 : 0} near=${near.length} dist=${Math.hypot(c.x - pl.x, c.z - pl.z).toFixed(1)} seen=${g.spotted ? 1 : 0} known=${k ? (g.time - k.t).toFixed(1) : '-'} hp=${pl.hp.toFixed(0)} ar=${pl.armor.toFixed(0)} slow=${pl.slowT > 0 ? 1 : 0} dome=${g.zones.length} in=(${g.input.x.toFixed(1)},${g.input.z.toFixed(1)})`);
    }
  }
  return { type, seed, ...(ended || { victory: false, how: 'timeout', time: g.time, stage: g.stage, huntersKilled: g.huntersKilled, eaten: g.eaten }),
    firstSeen, armorLeft: Math.round(g.player.armor), hpLeft: Math.round(g.player.hp) };
}

if (process.argv.includes('--monster')) {
  const which = arg('--monster');
  const types = which && PH.MONSTERS[which] ? [which] : Object.keys(PH.MONSTERS);
  const seeds = Number(arg('--seeds', 5));
  const t0 = Date.now();
  const rows = [];
  for (const t of types) for (let s = 1; s <= seeds; s++) rows.push(runMonster(t, s * 7919));
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  console.log(`${rows.length} monster runs in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  console.log('monster    seed   result      time  stage  kills  eaten  first-seen  hp-left');
  for (const r of rows) {
    console.log(`${r.type.padEnd(9)} ${String(r.seed).padStart(6)}   ${(r.victory ? 'WIN ' + r.how : 'died').padEnd(10)} ${fmt(r.time).padStart(5)}    ${r.stage}     ${String(r.huntersKilled).padStart(2)}    ${String(r.eaten).padStart(3)}     ${r.firstSeen === null ? '  -' : fmt(r.firstSeen).padStart(5)}     ${String(Math.max(0, r.hpLeft)).padStart(5)}`);
  }
  for (const t of types) {
    const rs = rows.filter((r) => r.type === t);
    const w = rs.filter((r) => r.victory);
    console.log(`  ${t.padEnd(9)} win ${w.length}/${rs.length} (apex ${w.filter((r) => r.how === 'apex').length}, survived ${w.filter((r) => r.how === 'survived').length}), mean stage ${(rs.reduce((a, r) => a + r.stage, 0) / rs.length).toFixed(1)}, mean kills ${(rs.reduce((a, r) => a + r.huntersKilled, 0) / rs.length).toFixed(1)}`);
  }
  process.exit(0);
}

const classes = arg('--class') ? [arg('--class')] : Object.keys(PH.CLASSES);
const seeds = Number(arg('--seeds', 5));
const idle = process.argv.includes('--idle');
const abilities = !process.argv.includes('--no-abilities');
const verbose = process.argv.includes('--verbose');
const t0 = Date.now();
const rows = [];
for (const c of classes) for (let s = 1; s <= seeds; s++) rows.push(run(c, s * 7919, idle));

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
console.log(`${rows.length} runs in ${((Date.now() - t0) / 1000).toFixed(1)}s${idle ? '  (idle player)' : ''}\n`);
console.log('class     seed   result   time   lvl  kills  bosses  peak-alive  dmg-taken  specials  dodges  evos');
for (const r of rows) {
  console.log(`${r.classId.padEnd(9)} ${String(r.seed).padStart(5)}   ${(r.victory ? 'WIN' : 'died').padEnd(6)}  ${fmt(r.time).padStart(5)}   ${String(r.level).padStart(3)}  ${String(r.kills).padStart(5)}   ${r.bossKills}/3     ${String(r.maxAlive).padStart(5)}     ${String(r.dmgTaken).padStart(6)}   ${String(r.uses).padStart(6)}  ${String(r.dodges).padStart(6)}  ${String(r.evos).padStart(4)}   ${r.victory ? '' : r.bossOrder}`);
}
for (const c of classes) {
  const rs = rows.filter((r) => r.classId === c);
  const wins = rs.filter((r) => r.victory).length;
  const avgT = rs.reduce((a, r) => a + r.time, 0) / rs.length;
  console.log(`  ${c.padEnd(9)} win ${wins}/${rs.length}, mean run ${fmt(avgT)}, mean bosses ${(rs.reduce((a, r) => a + r.bossKills, 0) / rs.length).toFixed(1)}`);
}
if (verbose) {
  const r = rows[0];
  console.log(`\n--- ${r.classId} seed ${r.seed} timeline ---`);
  console.log('level-ups:', r.log.levels.map((l) => `${fmt(l.t)} L${l.level} ${l.pick}`).join(' | '));
  console.log('events:', r.log.events.join(' | '));
  console.log('bosses:', JSON.stringify(r.log.bosses));
}
