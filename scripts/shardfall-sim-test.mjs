#!/usr/bin/env node
/**
 * Headless tests and balance runs for Shardfall's simulation.
 *
 * config.js, map.js, sim.js and ai.js are plain scripts with no THREE or DOM dependency, so they are loaded
 * into a vm context with a minimal `window` and run at many times real speed.
 *
 *   node scripts/shardfall-sim-test.mjs                  # everything: commands, perf, AI-vs-AI at every difficulty
 *   node scripts/shardfall-sim-test.mjs --games 12       # games per difficulty (default 8)
 *   node scripts/shardfall-sim-test.mjs --diff normal    # only one difficulty
 *   node scripts/shardfall-sim-test.mjs --only commands  # commands | perf | games | mixed
 *   node scripts/shardfall-sim-test.mjs --cap 1800       # game-time cap per game, seconds (default 1800)
 *   node scripts/shardfall-sim-test.mjs --verbose        # build orders and waves for every game
 *
 * Exit code 1 when any assertion fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i > -1 ? argv[i + 1] : d; };
const has = (f) => argv.includes(f);
const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public/shardfall/js');

function load() {
  const ctx = { console, Math, Object, Array, Set, Map, JSON, Number, isFinite, Uint8Array, Int8Array, Int32Array, Uint32Array, Float32Array, Float64Array };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['config.js', 'map.js', 'sim.js', 'ai.js']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
const ctx = load();
const SF = ctx.SF, CFG = ctx.SF_CONFIG;

let failures = 0, passes = 0;
function check(cond, msg) {
  if (cond) { passes++; return true; }
  failures++; console.log('  FAIL', msg); return false;
}
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------------------------------------
// invariants checked every tick
function invariants(sim) {
  const w = sim.map.w;
  for (const tm of sim.teams) {
    if (!(tm.credits >= 0) || !isFinite(tm.credits)) return `team ${tm.id} credits ${tm.credits}`;
  }
  for (const e of sim.entities.values()) {
    if (e.dead) continue;
    if (!isFinite(e.x) || !isFinite(e.z) || !isFinite(e.hp) || !isFinite(e.angle) || !isFinite(e.turret)) return `entity ${e.id} ${e.type} has NaN (${e.x}, ${e.z}, hp ${e.hp}, angle ${e.angle})`;
    if (e.kind === 'unit') {
      if (e.x < 0 || e.z < 0 || e.x >= w || e.z >= sim.map.h) return `unit ${e.id} out of bounds (${e.x}, ${e.z})`;
      const b = sim.block[(e.z | 0) * w + (e.x | 0)];
      if (b !== 0) return `unit ${e.id} ${e.type} inside ${['', 'rock', 'spire', 'building'][b]} at (${e.x.toFixed(2)}, ${e.z.toFixed(2)})`;
      if (e.carry < 0 || e.carry > (CFG.UNITS[e.type].capacity || 0) + 1e-6) return `unit ${e.id} carry ${e.carry}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// 1. command validation
function newSim(opts) { return new SF.Sim(Object.assign({ seed: 7, difficulty: 'normal', playerTeam: 0, aiTeams: [] }, opts || {})); }
function run(sim, secs) { const n = Math.round(secs / CFG.TICK); for (let i = 0; i < n; i++) sim.step(); }
function findSpot(sim, team, type) {
  const ai = new SF.AI(sim, team, 'normal'); ai.scan();
  return ai.findSpot(type);
}
function buildNow(sim, team, type) {
  const tm = sim.teams[team];
  tm.credits += CFG.BUILDINGS[type].cost;
  if (!sim.command(team, { type: 'queue', item: type })) return null;
  let guard = 0;
  while (tm.ready !== type && guard++ < 2000) sim.step();
  const sp = findSpot(sim, team, type);
  if (!sp || !sim.command(team, { type: 'place', item: type, tx: sp.tx, tz: sp.tz })) return null;
  run(sim, 4);
  for (const e of sim.entities.values()) if (e.team === team && e.type === type && e.tx === sp.tx && e.tz === sp.tz) return e;
  return null;
}

function commandTests() {
  console.log('\n== command validation ==');
  // map determinism + symmetry
  {
    const a = SF.generateMap({ seed: 99, size: 64 }), b = SF.generateMap({ seed: 99, size: 64 });
    check(a.tiles.every((v, i) => v === b.tiles[i]) && a.decor.length === b.decor.length, 'map generation is deterministic');
    let sym = true;
    for (let z = 0; z < a.h; z++) for (let x = 0; x < a.w; x++) {
      const i = z * a.w + x, j = (a.h - 1 - z) * a.w + (a.w - 1 - x);
      if (a.tiles[i] !== a.tiles[j] || Math.abs(a.shards[i] - a.shards[j]) > 1e-3) sym = false;
    }
    check(sym, 'map is point-symmetric (tiles and shard amounts)');
    const sp = new Set(a.spires.map((s) => `${s.tx},${s.tz}`));
    check(a.spires.every((s) => sp.has(`${a.w - 1 - s.tx},${a.h - 1 - s.tz}`)), 'spires are symmetric');
    check(a.starts[1].tx === a.w - 3 - a.starts[0].tx && a.starts[1].tz === a.h - 3 - a.starts[0].tz, 'starts are mirrored');
    const types = new Set(a.decor.map((d) => d.type));
    check(['rock', 'tree', 'boulder', 'crystal'].every((t) => types.has(t)), `decor has every type (${[...types].join(', ')})`);
    for (let seed = 1; seed <= 40; seed++) {
      const m = SF.generateMap({ seed, size: 64 });
      if (!check(m.spires.length >= 6 && m.fields.length >= 7, `seed ${seed}: generated map has fields and spires (${m.fields.length}, ${m.spires.length})`)) break;
    }
  }
  const sim = newSim();
  const tm = sim.teams[0], W = sim.map.w;
  const core = [...sim.entities.values()].find((e) => e.team === 0 && e.type === 'core');
  check(core && core.built === 1, 'each team starts with a finished core');
  check([...sim.entities.values()].filter((e) => e.team === 0 && e.kind === 'unit').length === 4, 'each team starts with four units');
  // options
  const opts = sim.options(0);
  const ref = opts.find((o) => o.type === 'refinery');
  check(ref && ref.locked && ref.reason === 'Needs Reactor', `refinery locked with reason 'Needs Reactor' (got ${ref && ref.reason})`);
  check(opts.find((o) => o.type === 'rifleman').reason === 'Needs Barracks', 'rifleman needs barracks');
  check(opts.find((o) => o.type === 'artillery').reason === 'Needs War Factory', 'artillery needs a factory first');
  check(!opts.some((o) => o.type === 'core'), 'core is not buildable');
  check(opts.map((o) => o.type).join() === 'reactor,refinery,barracks,factory,radar,turret,techlab,rifleman,rocketeer,harvester,buggy,tank,artillery', 'options in sidebar order');
  check(sim.command(0, { type: 'queue', item: 'refinery' }) === false, 'cannot queue a locked building');
  check(sim.command(0, { type: 'queue', item: 'nonsense' }) === false, 'unknown item rejected');
  check(sim.command(0, { type: 'queue', item: 'core' }) === false, 'core cannot be queued');
  check(sim.command(1, { type: 'sell', id: core.id }) === false, 'cannot sell an enemy building');
  check(sim.command(0, { type: 'move', ids: [999999], x: 10, z: 10 }) === false, 'move with no valid units rejected');
  const enemyUnit = [...sim.entities.values()].find((e) => e.team === 1 && e.kind === 'unit');
  check(sim.command(0, { type: 'move', ids: [enemyUnit.id], x: 10, z: 10 }) === false, 'cannot order enemy units');
  check(sim.command(0, { type: 'attack', ids: [[...sim.entities.values()].find((e) => e.team === 0 && e.type === 'rifleman').id], targetId: enemyUnit.id }) === false, 'cannot attack an unseen enemy');

  // gradual payment + placement rules
  const c0 = tm.credits;
  check(sim.command(0, { type: 'queue', item: 'reactor' }), 'queue reactor');
  run(sim, 4);
  const it = tm.queues.building[0];
  check(it && Math.abs(tm.credits - (c0 - it.paid)) < 1e-6 && Math.abs(it.paid - CFG.BUILDINGS.reactor.cost * it.progress) < 1, `credits are spent gradually (paid ${it && it.paid.toFixed(1)} at progress ${it && it.progress.toFixed(2)})`);
  run(sim, 5);
  check(tm.ready === 'reactor' && tm.queues.building.length === 0, 'finished building waits in team.ready');
  check(Math.abs(tm.credits - (c0 - 300)) < 1e-6, 'full cost paid once finished');
  // place on rock / shards / out of radius / overlapping
  let rockT = null, shardT = null;
  for (let i = 0; i < W * W && (!rockT || !shardT); i++) {
    if (!rockT && sim.map.tiles[i] === 1) rockT = { tx: i % W, tz: (i / W) | 0 };
    if (!shardT && sim.map.tiles[i] === 2) shardT = { tx: i % W, tz: (i / W) | 0 };
  }
  check(!sim.canPlace(0, 'reactor', rockT.tx, rockT.tz), 'canPlace rejects rock');
  check(sim.command(0, { type: 'place', item: 'reactor', tx: rockT.tx, tz: rockT.tz }) === false, 'place on rock rejected');
  check(!sim.canPlace(0, 'reactor', shardT.tx, shardT.tz), 'canPlace rejects shards');
  check(!sim.canPlace(0, 'reactor', core.tx + 1, core.tz), 'canPlace rejects overlap with a building');
  check(!sim.canPlace(0, 'reactor', core.tx + 12, core.tz - 12), 'canPlace rejects out of build radius');
  check(sim.command(0, { type: 'place', item: 'reactor', tx: core.tx + 12, tz: core.tz - 12 }) === false, 'place out of radius rejected');
  check(!sim.canPlace(0, 'reactor', W - 1, 5), 'canPlace rejects off the map edge');
  check(!sim.canPlace(1, 'reactor', core.tx + 4, core.tz), "canPlace rejects placing near someone else's base");
  check(sim.command(0, { type: 'place', item: 'barracks', tx: core.tx + 4, tz: core.tz }) === false, 'place a type that is not ready rejected');
  // place a unit standing on the footprint gets pushed out
  const spot = findSpot(sim, 0, 'reactor');
  const rifle = [...sim.entities.values()].find((e) => e.team === 0 && e.type === 'rifleman');
  rifle.x = spot.tx + 0.5; rifle.z = spot.tz + 0.5;
  check(sim.command(0, { type: 'place', item: 'reactor', tx: spot.tx, tz: spot.tz }), 'place reactor on a valid spot');
  check(tm.ready === null, 'ready cleared after placing');
  check(!sim.passable(spot.tx, spot.tz) && sim.buildingAt(spot.tx, spot.tz).type === 'reactor', 'footprint is blocked and buildingAt finds it');
  check(sim.passable(rifle.x | 0, rifle.z | 0), 'unit standing on the footprint was pushed out');
  const reactor = sim.buildingAt(spot.tx, spot.tz);
  check(reactor.built === 0, 'new building starts rising (built = 0)');
  run(sim, 4);
  check(reactor.built === 1, 'rise-up finishes');
  check(tm.power.made === 110 && tm.power.used === 0, `power counted (${tm.power.made}/${tm.power.used})`);

  // cancel refunds
  {
    const before = tm.credits;
    sim.command(0, { type: 'queue', item: 'barracks' });
    run(sim, 3);
    const paid = tm.queues.building[0].paid;
    check(paid > 0 && tm.credits < before, 'barracks being paid for');
    check(sim.command(0, { type: 'cancel', item: 'barracks' }), 'cancel accepted');
    check(Math.abs(tm.credits - before) < 1e-6 && tm.queues.building.length === 0, `cancel refunds what was paid (${paid.toFixed(1)})`);
    check(sim.command(0, { type: 'cancel', item: 'barracks' }) === false, 'cancel with nothing queued rejected');
    // cancel a ready building refunds its full cost
    sim.command(0, { type: 'queue', item: 'barracks' });
    run(sim, 10);
    check(tm.ready === 'barracks', 'barracks ready');
    const b2 = tm.credits;
    sim.command(0, { type: 'cancel', item: 'barracks' });
    check(tm.ready === null && Math.abs(tm.credits - b2 - CFG.BUILDINGS.barracks.cost) < 1e-6, 'cancelling a ready building refunds it in full');
  }
  // queue without credits pauses, then resumes
  {
    tm.credits = 50;
    sim.command(0, { type: 'queue', item: 'barracks' });
    run(sim, 3);
    const q = tm.queues.building[0];
    check(tm.credits === 0 && q && Math.abs(q.paid - 50) < 1e-6 && q.progress < 0.2, `production paused at 0 credits (progress ${q && q.progress.toFixed(3)})`);
    const p0 = q.progress;
    run(sim, 3);
    check(q.progress === p0, 'no progress while broke');
    const o = sim.options(0).find((x) => x.type === 'barracks');
    check(o.paused && o.queued === 1, 'options() reports the item paused');
    tm.credits = 1000;
    run(sim, 12);
    check(tm.ready === 'barracks' && Math.abs(tm.credits - (1000 - (400 - 50))) < 1e-6, `resumes and finishes when credits arrive (credits ${tm.credits.toFixed(2)})`);
    const sp = findSpot(sim, 0, 'barracks');
    sim.command(0, { type: 'place', item: 'barracks', tx: sp.tx, tz: sp.tz });
    run(sim, 3);
  }
  // queue limit
  {
    tm.credits = 0;
    let n = 0;
    for (let i = 0; i < 8; i++) if (sim.command(0, { type: 'queue', item: 'rifleman' })) n++;
    check(n === CFG.ECONOMY.queueMax, `queue holds at most ${CFG.ECONOMY.queueMax} (${n})`);
    const o = sim.options(0).find((x) => x.type === 'rifleman');
    check(o.queued === CFG.ECONOMY.queueMax && o.full, 'options() reports queued count and full');
    for (let i = 0; i < 8; i++) sim.command(0, { type: 'cancel', item: 'rifleman' });
    check(tm.queues.infantry.length === 0, 'cancel empties the queue');
  }
  // infantry production + rally
  {
    tm.credits = 1000;
    sim.command(0, { type: 'rally', cat: 'infantry', x: core.x + 6, z: core.z - 8 });
    sim.command(0, { type: 'queue', item: 'rifleman' });
    const ev = [];
    for (let i = 0; i < 20 * 6; i++) { sim.step(); ev.push(...sim.drainEvents()); }
    const sp = ev.find((e) => e.type === 'spawn' && e.what === 'rifleman');
    check(ev.some((e) => e.type === 'complete' && e.what === 'rifleman' && e.cat === 'infantry'), 'complete event for the rifleman');
    check(sp, 'spawn event for the rifleman');
    run(sim, 15);
    const u = sim.entities.get(sp.id);
    check(u && Math.hypot(u.x - (core.x + 6), u.z - (core.z - 8)) < 1.6, `new unit walks to the rally point (${u && u.x.toFixed(1)}, ${u && u.z.toFixed(1)})`);
  }
  // sell refunds
  {
    const bar = [...sim.entities.values()].find((e) => e.team === 0 && e.type === 'barracks');
    const before = tm.credits;
    bar.hp = bar.maxHp * 0.5;
    check(sim.command(0, { type: 'sell', id: bar.id }), 'sell accepted');
    check(Math.abs(tm.credits - before - Math.floor(400 * CFG.ECONOMY.sellRefund * 0.5)) < 1e-6, `sell refunds cost × ${CFG.ECONOMY.sellRefund} × hp fraction (+${(tm.credits - before).toFixed(0)})`);
    const ev = sim.drainEvents();
    check(ev.some((e) => e.type === 'death' && e.id === bar.id && e.sold), 'death event with sold flag');
    run(sim, 0.2);
    check(!sim.entities.has(bar.id) && sim.passable(bar.tx, bar.tz), 'sold building removed and its tiles freed');
    check(sim.options(0).find((o) => o.type === 'rifleman').locked, 'infantry locked again without a barracks');
    check(sim.command(0, { type: 'sell', id: bar.id }) === false, 'selling twice rejected');
  }
  // harvesters deliver credits
  {
    const s2 = newSim({ seed: 11 });
    const t2 = s2.teams[0];
    const r1 = buildNow(s2, 0, 'reactor');
    const rf = buildNow(s2, 0, 'refinery');
    check(r1 && rf, 'reactor + refinery built');
    run(s2, 3);
    const h = [...s2.entities.values()].find((e) => e.team === 0 && e.type === 'harvester');
    check(h, 'refinery comes with a free harvester');
    const c1 = t2.credits;
    let mined = false, unloaded = false;
    for (let i = 0; i < 20 * 90; i++) {
      s2.step();
      for (const e of s2.drainEvents()) if (e.type === 'harvest' && e.id === h.id) mined = true;
      if (h.state === 'unload') unloaded = true;
      const bad = invariants(s2); if (bad) { check(false, bad); break; }
    }
    check(mined, 'harvester mines (harvest event)');
    check(unloaded, 'harvester reaches the dock and unloads');
    check(t2.credits >= c1 + 900, `harvester delivered credits over 90 s (+${(t2.credits - c1).toFixed(0)}, stats ${t2.stats.creditsHarvested.toFixed(0)})`);
    // manual harvest order to a specific field, stop, and resume
    const far = s2.map.fields.map((f) => ({ f, d: Math.hypot(f.x - rf.x, f.z - rf.z) })).sort((a, b) => a.d - b.d)[1].f;
    check(s2.command(0, { type: 'harvest', ids: [h.id], tx: far.x | 0, tz: far.z | 0 }), 'harvest command accepted');
    let near = false;
    for (let i = 0; i < 20 * 60 && !near; i++) { s2.step(); if (h.state === 'harvest' && h._h === 'mine' && Math.hypot(h.x - far.x, h.z - far.z) < far.r + 2) near = true; }
    check(near, 'harvester goes to the ordered field');
    check(s2.command(0, { type: 'stop', ids: [h.id] }) && h.state === 'idle', 'harvester stops');
    run(s2, 5);
    check(h.state === 'idle', 'stopped harvester stays idle');
    // no refinery: harvester idles
    s2.command(0, { type: 'sell', id: rf.id });
    s2.command(0, { type: 'harvest', ids: [h.id] });
    run(s2, 40);
    check(h.state === 'idle', `without a refinery the harvester idles (${h.state} ${h._h})`);
    check(s2.command(0, { type: 'harvest', ids: [r1.id] }) === false, 'harvest with no harvesters rejected');
  }
  // low power: slower production, turrets and radar off
  {
    const s3 = newSim({ seed: 5 });
    const t3 = s3.teams[0];
    buildNow(s3, 0, 'reactor');
    buildNow(s3, 0, 'refinery');
    buildNow(s3, 0, 'barracks');
    const rad = buildNow(s3, 0, 'radar');
    const tur = buildNow(s3, 0, 'turret');
    check(rad && tur, 'radar + turret built');
    run(s3, 1);
    check(!t3.lowPower && t3.radar, `radar on with enough power (${t3.power.made}/${t3.power.used})`);
    // an enemy tank in range of the turret
    const tank = s3.spawnUnit(1, 'tank', tur.x + 3, tur.z + 0.01);
    run(s3, 3);
    check(tank.hp < tank.maxHp, `powered turret fires (tank hp ${tank.hp.toFixed(0)})`);
    // sell the reactor → low power
    const rx = [...s3.entities.values()].find((e) => e.team === 0 && e.type === 'reactor');
    s3.command(0, { type: 'sell', id: rx.id });
    run(s3, 0.5);
    check(t3.lowPower && !t3.radar, `low power: radar off (${t3.power.made}/${t3.power.used})`);
    const ev = s3.drainEvents();
    check(ev.some((e) => e.type === 'alert' && e.team === 0 && e.text === 'Low power'), "'Low power' alert");
    tank.hp = tank.maxHp;
    s3.drainEvents();
    run(s3, 4);
    check(tank.hp === tank.maxHp && !s3.drainEvents().some((e) => e.type === 'shot' && e.from === tur.id), 'turret is silent on low power');
    // production speed halves
    t3.credits = 5000;
    s3.command(0, { type: 'queue', item: 'rifleman' });
    run(s3, 2);
    const p = t3.queues.infantry[0].progress;
    const expect = 2 / CFG.UNITS.rifleman.time * CFG.ECONOMY.lowPowerSlowdown;
    check(Math.abs(p - expect) < 0.03, `low power slows production (progress ${p.toFixed(3)} vs ${expect.toFixed(3)})`);
    // power back
    buildNow(s3, 0, 'reactor');
    run(s3, 1);
    check(!t3.lowPower && t3.radar, 'power restored: radar back on');
  }
  // combat basics: damage multipliers, projectile travel, splash, death + defeat
  {
    const s4 = newSim({ seed: 3, startUnits: [] });
    const c = s4.map.starts[0];
    const x0 = c.tx + 8, z0 = c.tz - 6;
    const tank = s4.spawnUnit(0, 'tank', x0, z0);
    const ri = s4.spawnUnit(1, 'rifleman', x0 + 4, z0);
    run(s4, 0.2);
    const ev = [];
    let hitTime = null, shotTime = null;
    for (let i = 0; i < 20 * 6; i++) {
      s4.step();
      for (const e of s4.drainEvents()) {
        ev.push(e);
        if (e.type === 'shot' && e.from === tank.id && shotTime === null) shotTime = s4.time;
        if (e.type === 'impact' && e.weapon === 'cannon' && hitTime === null) hitTime = s4.time;
      }
    }
    check(shotTime !== null && hitTime !== null && hitTime > shotTime, `shells travel (shot ${shotTime && shotTime.toFixed(2)} → impact ${hitTime && hitTime.toFixed(2)})`);
    const shot = ev.find((e) => e.type === 'shot' && e.weapon === 'cannon');
    check(shot && shot.dur > 0 && shot.pid > 0, 'shot event carries flight time and projectile id');
    const rshot = ev.find((e) => e.type === 'shot' && e.weapon === 'rifle');
    check(rshot && rshot.dur === 0, 'rifle bullets are instant');
    check(ri.dead || ri.hp < ri.maxHp, 'units auto-acquire targets in range');
    check(tank.hp < tank.maxHp, 'the rifleman fired back');
    const rifleShots = ev.filter((e) => e.type === 'shot' && e.weapon === 'rifle').length;
    check(Math.abs((tank.maxHp - tank.hp) - rifleShots * 9 * 0.2) < 0.01, 'damage = weapon damage × vs[armor]');
    // artillery splash hits a cluster
    const art = s4.spawnUnit(0, 'artillery', x0, z0 + 6);
    const pack = [0, 1, 2].map((k) => s4.spawnUnit(1, 'rifleman', x0 + 5 + k * 0.4, z0 + 6.3));
    run(s4, 9);
    const hurt = pack.filter((p) => p.dead || p.hp < p.maxHp).length;
    check(hurt >= 2, `artillery splash hurts a group (${hurt}/3 hit)`);
    // defeat: kill team 1's only building
    const core1 = [...s4.entities.values()].find((e) => e.team === 1 && e.type === 'core');
    for (const e of s4.entities.values()) if (e.team === 1 && e.kind === 'unit') e.hp = 0.01;
    s4._damage(core1, 99999, tank.id, 0);
    run(s4, 0.2);
    const ev2 = s4.drainEvents();
    check(s4.winner === 0 && s4.teams[1].defeated && ev2.some((e) => e.type === 'gameover' && e.winner === 0), 'losing all buildings = defeat, gameover event');
  }
  // movement: group move spreads into a formation, nobody stacks or enters rock
  {
    const s5 = newSim({ seed: 21, startUnits: [] });
    const c = s5.map.starts[0];
    const ids = [];
    for (let k = 0; k < 16; k++) ids.push(s5.spawnUnit(0, k % 2 ? 'rifleman' : 'tank', c.tx + 5 + (k % 4), c.tz - 3 - (k >> 2)).id);
    const goal = { x: s5.map.w / 2, z: s5.map.h / 2 + 6 };
    check(s5.command(0, { type: 'move', ids, x: goal.x, z: goal.z }), 'group move accepted');
    let bad = null;
    for (let i = 0; i < 20 * 50 && !bad; i++) { s5.step(); bad = invariants(s5); }
    check(!bad, bad || 'no invariant broken during the move');
    const us = ids.map((id) => s5.entities.get(id));
    const arrived = us.filter((u) => Math.hypot(u.x - goal.x, u.z - goal.z) < 6).length;
    check(arrived === ids.length, `group arrives (${arrived}/${ids.length} within 6 tiles)`);
    let minD = Infinity;
    for (let a = 0; a < us.length; a++) for (let b = a + 1; b < us.length; b++) minD = Math.min(minD, Math.hypot(us[a].x - us[b].x, us[a].z - us[b].z) / (us[a].radius + us[b].radius));
    check(minD > 0.6, `units spread out instead of stacking (closest pair at ${minD.toFixed(2)} × combined radius)`);
    check(us.every((u) => u.state === 'idle'), 'units idle after arriving');
    // stop
    s5.command(0, { type: 'move', ids, x: c.tx, z: c.tz - 4 });
    run(s5, 1);
    s5.command(0, { type: 'stop', ids });
    run(s5, 1);
    check(us.every((u) => u.state === 'idle' && !u._path), 'stop halts the group');
  }
  // fog: enemies hidden until seen; visible() and team.vis
  {
    const s6 = newSim({ seed: 8 });
    const t0 = s6.teams[0];
    const enemyCore = [...s6.entities.values()].find((e) => e.team === 1 && e.type === 'core');
    check(!s6.visible(0, enemyCore.x, enemyCore.z) && t0.vis[(enemyCore.z | 0) * s6.map.w + (enemyCore.x | 0)] === 0, 'enemy base starts unexplored');
    const own = [...s6.entities.values()].find((e) => e.team === 0 && e.type === 'core');
    check(s6.visible(0, own.x, own.z), 'own base visible');
    const scout = [...s6.entities.values()].find((e) => e.team === 0 && e.type === 'buggy');
    s6.command(0, { type: 'move', ids: [scout.id], x: enemyCore.x - 6, z: enemyCore.z + 6 });
    let seen = false;
    for (let i = 0; i < 20 * 60 && !seen; i++) { s6.step(); seen = s6.isVisible(0, enemyCore); }
    check(seen, 'scouting reveals the enemy base');
    check(s6.command(0, { type: 'attack', ids: [scout.id], targetId: enemyCore.id }), 'attack a visible enemy building');
    // move away: the core stays known (explored) but not visible
    s6.command(0, { type: 'move', ids: [scout.id], x: own.x + 3, z: own.z - 3 });
    run(s6, 30);
    check(!s6.isVisible(0, enemyCore) && s6.isKnown(0, enemyCore), 'explored but not visible after leaving');
  }
}

// ---------------------------------------------------------------------------------------------
// 2. pathfinding perf
function perfTest() {
  console.log('\n== pathfinding perf ==');
  const sim = newSim({ seed: 4242, startUnits: [] });
  const c = sim.map.starts[0];
  const ids = [];
  const types = ['rifleman', 'rifleman', 'rocketeer', 'tank', 'buggy', 'artillery'];
  for (let k = 0; k < 120; k++) {
    const x = c.tx + 4 + (k % 12) * 0.9, z = c.tz - 2 - Math.floor(k / 12) * 0.9;
    ids.push(sim.spawnUnit(0, types[k % types.length], x, z).id);
  }
  run(sim, 0.5);
  const goal = sim.map.starts[1];
  const t0 = process.hrtime.bigint();
  sim.command(0, { type: 'move', ids, x: goal.tx - 4, z: goal.tz + 6 });
  const cmdMs = Number(process.hrtime.bigint() - t0) / 1e6;
  let max = 0, sum = 0, n = 0, bad = null;
  for (let i = 0; i < 20 * 75; i++) {
    const a = process.hrtime.bigint();
    sim.step();
    const ms = Number(process.hrtime.bigint() - a) / 1e6;
    max = Math.max(max, ms); sum += ms; n++;
    if (!bad && i % 5 === 0) bad = invariants(sim);
  }
  const us = ids.map((id) => sim.entities.get(id));
  const gx = goal.tx - 4, gz = goal.tz + 6;
  const arrived = us.filter((u) => Math.hypot(u.x - gx, u.z - gz) < 9).length;
  console.log(`  120 units across the map: command ${cmdMs.toFixed(1)} ms, tick avg ${(sum / n).toFixed(3)} ms, max ${max.toFixed(2)} ms; ${arrived}/120 arrived within 75 s`);
  check(!bad, bad || 'no invariant broken');
  check(cmdMs < 60, `group order computes fast (${cmdMs.toFixed(1)} ms)`);
  check(sum / n < 3, `average tick under 3 ms (${(sum / n).toFixed(3)})`);
  check(max < 30, `worst tick under 30 ms (${max.toFixed(2)})`);
  check(arrived >= 110, `most of the group arrives (${arrived}/120)`);
  // a big battle: 75 a side, attack-moving into each other
  const s2 = newSim({ seed: 77, startUnits: [] });
  const a0 = s2.map.starts[0], a1 = s2.map.starts[1];
  const g0 = [], g1 = [];
  for (let k = 0; k < 75; k++) {
    g0.push(s2.spawnUnit(0, types[k % 6], a0.tx + 6 + (k % 10), a0.tz - 4 - Math.floor(k / 10)).id);
    g1.push(s2.spawnUnit(1, types[k % 6], a1.tx - 4 - (k % 10), a1.tz + 6 + Math.floor(k / 10)).id);
  }
  s2.command(0, { type: 'attackMove', ids: g0, x: a1.tx, z: a1.tz });
  s2.command(1, { type: 'attackMove', ids: g1, x: a0.tx, z: a0.tz });
  max = 0; sum = 0; n = 0; bad = null;
  for (let i = 0; i < 20 * 90; i++) {
    const a = process.hrtime.bigint();
    s2.step(); s2.drainEvents();
    const ms = Number(process.hrtime.bigint() - a) / 1e6;
    max = Math.max(max, ms); sum += ms; n++;
    if (!bad) bad = invariants(s2);
  }
  const left = [0, 1].map((t) => [...s2.entities.values()].filter((e) => e.team === t && e.kind === 'unit' && !e.dead).length);
  console.log(`  150-unit battle: tick avg ${(sum / n).toFixed(3)} ms, max ${max.toFixed(2)} ms; survivors ${left[0]} vs ${left[1]}`);
  check(!bad, bad || 'no invariant broken in battle');
  check(sum / n < 4, `battle average tick under 4 ms (${(sum / n).toFixed(3)})`);
  check(left[0] + left[1] < 150, 'the armies actually fought');
}

// ---------------------------------------------------------------------------------------------
// 3. AI vs AI
function playGame(seed, diffs, cap) {
  const sim = new SF.Sim({ seed, difficulty: diffs[0], playerTeam: null, aiTeams: [0, 1], aiDifficulty: { 0: diffs[0], 1: diffs[1] } });
  const r = { seed, diffs, winner: null, time: 0, error: null, peak: [0, 0], ticks: 0, maxTick: 0 };
  let tsum = 0;
  try {
    while (sim.winner === null && sim.time < cap) {
      const a = process.hrtime.bigint();
      sim.step();
      const ms = Number(process.hrtime.bigint() - a) / 1e6;
      tsum += ms; r.maxTick = Math.max(r.maxTick, ms); r.ticks++;
      sim.drainEvents();
      const bad = invariants(sim);
      if (bad) { r.error = `t=${sim.time.toFixed(1)} ${bad}`; break; }
    }
  } catch (err) { r.error = `exception at t=${sim.time.toFixed(1)}: ${err.stack}`; }
  r.winner = sim.winner; r.time = sim.time; r.avgTick = tsum / Math.max(1, r.ticks);
  r.ais = sim.ais.map((ai) => ({ team: ai.team, peak: ai.peakArmy, log: ai.log, waves: ai.waves, style: ai.style }));
  r.stats = sim.teams.map((t) => t.stats);
  return r;
}
function gamesTest(diffList, games, cap) {
  console.log('\n== AI vs AI ==');
  const summary = {};
  for (const diff of diffList) {
    const res = [];
    for (let g = 0; g < games; g++) res.push(playGame(1000 + g * 17, [diff, diff], cap));
    const done = res.filter((r) => r.winner !== null);
    const wins = [0, 1].map((t) => res.filter((r) => r.winner === t).length);
    const avg = done.length ? done.reduce((a, r) => a + r.time, 0) / done.length : 0;
    const lens = done.map((r) => r.time).sort((a, b) => a - b);
    console.log(`\n  ${diff}: ${games} games, winners T0 ${wins[0]} / T1 ${wins[1]}, timeouts ${games - done.length}; avg length ${fmtT(avg)} (min ${fmtT(lens[0] || 0)}, max ${fmtT(lens[lens.length - 1] || 0)})`);
    for (const r of res) {
      const s = r.stats;
      console.log(`    seed ${r.seed}: ${r.winner === null ? 'timeout' : 'T' + r.winner + ' wins'} at ${fmtT(r.time)}; ${r.ais[0].style} vs ${r.ais[1].style}; peak army ${r.ais[0].peak}/${r.ais[1].peak}; waves ${r.ais[0].waves.length}/${r.ais[1].waves.length}; harvested ${Math.round(s[0].creditsHarvested)}/${Math.round(s[1].creditsHarvested)}; units built ${s[0].unitsBuilt}/${s[1].unitsBuilt}; tick avg ${r.avgTick.toFixed(3)} ms max ${r.maxTick.toFixed(1)} ms${r.error ? '\n      ERROR ' + r.error : ''}`);
      if (has('--verbose')) for (const a of r.ais) console.log(`      T${a.team} build: ${a.log.map(([t, b]) => `${fmtT(t)} ${b}`).join(', ')}\n      T${a.team} waves: ${a.waves.map((w) => `${fmtT(w.t)}×${w.size}`).join(', ')}`);
      check(!r.error, `${diff} seed ${r.seed}: ${r.error || 'ok'}`);
    }
    const ex = res[0].ais[1];
    console.log(`    build order (seed ${res[0].seed}, T1): ${ex.log.slice(0, 14).map(([t, b]) => `${fmtT(t)} ${b}`).join(', ')}`);
    console.log(`    waves (seed ${res[0].seed}, T1): ${ex.waves.map((w) => `${fmtT(w.t)}×${w.size}`).join(', ')}`);
    // Mirror matches between equal computer players are the slowest case; normal must almost always finish.
    const need = diff === 'normal' ? 0.85 : 0.7;
    check(done.length >= Math.ceil(games * need), `${diff}: games end with a winner within ${fmtT(cap)} (${done.length}/${games})`);
    check(Math.min(wins[0], wins[1]) >= Math.floor(done.length * 0.2), `${diff}: neither side dominates (${wins[0]}/${wins[1]})`);
    const peaks = res.flatMap((r) => r.ais.map((a) => a.peak));
    check(peaks.filter((p) => p >= 6).length >= peaks.length * 0.75, `${diff}: AIs build real armies (peaks ${peaks.join(',')})`);
    const plan = SF.AI.PLANS[diff].slice(0, 5).map((p) => p[0]);
    check(res.every((r) => r.ais.every((a) => plan.every((b) => a.log.some((l) => l[1] === b)))), `${diff}: every AI built ${plan.join(', ')}`);
    summary[diff] = { wins, timeouts: games - done.length, avg };
  }
  return summary;
}
function mixedTest(games, cap) {
  const pair = (strong, weak, base, minShare) => {
    console.log(`\n== ${strong} vs ${weak} (sides alternate) ==`);
    let wins = 0, total = 0, len = 0;
    for (let g = 0; g < games; g++) {
      const st = g % 2;
      const diffs = st ? [weak, strong] : [strong, weak];
      const r = playGame(base + g * 13, diffs, cap);
      check(!r.error, r.error || 'ok');
      if (r.winner === st) wins++;
      total++; len += r.time;
      console.log(`    seed ${r.seed}: ${strong} is T${st}; ${r.winner === null ? 'timeout' : (r.winner === st ? strong : weak) + ' wins'} at ${fmtT(r.time)}; peak army ${strong} ${r.ais[st].peak} ${weak} ${r.ais[1 - st].peak}`);
    }
    console.log(`    ${strong} won ${wins}/${total}, average length ${fmtT(len / total)}`);
    check(wins >= Math.ceil(total * minShare), `${strong} beats ${weak} most of the time (${wins}/${total})`);
  };
  pair('hard', 'easy', 2000, 0.75);
  pair('normal', 'easy', 3000, 0.6);
  pair('hard', 'normal', 4000, 0.5);
}

// ---------------------------------------------------------------------------------------------
const only = arg('--only');
const cap = +arg('--cap', 1800);
const games = +arg('--games', 8);
const diffs = arg('--diff') ? [arg('--diff')] : ['easy', 'normal', 'hard'];
const t0 = Date.now();
if (!only || only === 'commands') commandTests();
if (!only || only === 'perf') perfTest();
if (!only || only === 'games') gamesTest(diffs, games, cap);
if (!only || only === 'mixed') mixedTest(Math.max(4, Math.round(games / 2)), cap);
console.log(`\n${passes} passed, ${failures} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failures ? 1 : 0);
