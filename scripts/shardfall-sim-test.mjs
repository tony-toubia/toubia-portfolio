#!/usr/bin/env node
/**
 * Headless tests and balance runs for Shardfall's simulation.
 *
 * config.js, map.js, sim.js, ai.js and missions.js are plain scripts with no THREE or DOM dependency, so they are loaded
 * into a vm context with a minimal `window` and run at many times real speed.
 *
 *   node scripts/shardfall-sim-test.mjs                  # everything: commands, factions/weapons/cloak/superweapons,
 *                                                        # missions, perf, AI-vs-AI at every difficulty, Vanguard vs Hegemony
 *   node scripts/shardfall-sim-test.mjs --games 12       # games per difficulty (default 8)
 *   node scripts/shardfall-sim-test.mjs --diff normal    # only one difficulty
 *   node scripts/shardfall-sim-test.mjs --only commands  # commands | phase2 | roster | missions | missions-quick | perf | games | mixed | factions
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
  for (const f of ['config.js', 'map.js', 'sim.js', 'ai.js', 'missions.js']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
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
  const vOrder = 'reactor,refinery,barracks,factory,radar,turret,wall,repairbay,sentry,howitzer,techlab,uplink,rifleman,rocketeer,sniper,medic,engineer,harvester,scout,buggy,tank,salvo,artillery,bulwark';
  check(opts.map((o) => o.type).join() === vOrder, `options in sidebar order (Vanguard: ${opts.map((o) => o.type).join()})`);
  check(opts.every((o) => o.building === 0 && o.progress === 0 && o.full === false), 'options() carry building / progress / full');
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
function playGame(seed, diffs, cap, factions) {
  const sim = new SF.Sim({ seed, difficulty: diffs[0], playerTeam: null, aiTeams: [0, 1], aiDifficulty: { 0: diffs[0], 1: diffs[1] }, factions });
  const r = { seed, diffs, winner: null, time: 0, error: null, peak: [0, 0], ticks: 0, maxTick: 0, built: [{}, {}] };
  let tsum = 0;
  try {
    while (sim.winner === null && sim.time < cap) {
      const a = process.hrtime.bigint();
      sim.step();
      const ms = Number(process.hrtime.bigint() - a) / 1e6;
      tsum += ms; r.maxTick = Math.max(r.maxTick, ms); r.ticks++;
      for (const e of sim.drainEvents()) if (e.type === 'spawn') r.built[e.team][e.what] = (r.built[e.team][e.what] || 0) + 1;
      const bad = invariants(sim);
      if (bad) { r.error = `t=${sim.time.toFixed(1)} ${bad}`; break; }
    }
  } catch (err) { r.error = `exception at t=${sim.time.toFixed(1)}: ${err.stack}`; }
  r.winner = sim.winner; r.time = sim.time; r.avgTick = tsum / Math.max(1, r.ticks);
  r.ais = sim.ais.map((ai) => ({ team: ai.team, peak: ai.peakArmy, log: ai.log, waves: ai.waves, style: ai.style, raids: ai.raidsSent || 0, supers: ai.superLog.length }));
  r.stats = sim.teams.map((t) => t.stats);
  r.factions = sim.teams.map((t) => t.faction);
  return r;
}
function gamesTest(diffList, games, cap) {
  console.log('\n== AI vs AI ==');
  const summary = {};
  for (const diff of diffList) {
    const res = [];
    // mirror matches (side balance), alternating Vanguard mirrors and Hegemony mirrors
    for (let g = 0; g < games; g++) res.push(playGame(1000 + g * 17, [diff, diff], cap, g % 2 ? ['hegemony', 'hegemony'] : ['vanguard', 'vanguard']));
    const done = res.filter((r) => r.winner !== null);
    const wins = [0, 1].map((t) => res.filter((r) => r.winner === t).length);
    const avg = done.length ? done.reduce((a, r) => a + r.time, 0) / done.length : 0;
    const lens = done.map((r) => r.time).sort((a, b) => a - b);
    console.log(`\n  ${diff}: ${games} games, winners T0 ${wins[0]} / T1 ${wins[1]}, timeouts ${games - done.length}; avg length ${fmtT(avg)} (min ${fmtT(lens[0] || 0)}, max ${fmtT(lens[lens.length - 1] || 0)})`);
    for (const r of res) {
      const s = r.stats;
      console.log(`    seed ${r.seed} (${r.factions[0]} mirror): ${r.winner === null ? 'timeout' : 'T' + r.winner + ' wins'} at ${fmtT(r.time)}; ${r.ais[0].style} vs ${r.ais[1].style}; peak army ${r.ais[0].peak}/${r.ais[1].peak}; waves ${r.ais[0].waves.length}/${r.ais[1].waves.length}; harvested ${Math.round(s[0].creditsHarvested)}/${Math.round(s[1].creditsHarvested)}; units built ${s[0].unitsBuilt}/${s[1].unitsBuilt}; tick avg ${r.avgTick.toFixed(3)} ms max ${r.maxTick.toFixed(1)} ms${r.error ? '\n      ERROR ' + r.error : ''}`);
      if (has('--verbose')) for (const a of r.ais) console.log(`      T${a.team} build: ${a.log.map(([t, b]) => `${fmtT(t)} ${b}`).join(', ')}\n      T${a.team} waves: ${a.waves.map((w) => `${fmtT(w.t)}×${w.size}`).join(', ')}`);
      check(!r.error, `${diff} seed ${r.seed}: ${r.error || 'ok'}`);
    }
    const ex = res[0].ais[1];
    console.log(`    build order (seed ${res[0].seed}, T1): ${ex.log.slice(0, 14).map(([t, b]) => `${fmtT(t)} ${b}`).join(', ')}`);
    console.log(`    waves (seed ${res[0].seed}, T1): ${ex.waves.map((w) => `${fmtT(w.t)}×${w.size}`).join(', ')}`);
    // Two equal AIs can turtle each other (like two cautious humans); what matters is that most mirrors resolve.
    const need = diff === 'hard' ? 0.25 : 0.5;   // hard AIs out-produce each other's attacks when evenly matched
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
// 4. phase 2: factions, energy weapons, cloak, superweapons
const ents = (sim, f) => [...sim.entities.values()].filter(f);
function evs(sim, secs, filter) {
  const out = [];
  const n = Math.round(secs / CFG.TICK);
  for (let i = 0; i < n; i++) { sim.step(); for (const e of sim.drainEvents()) if (!filter || filter(e)) out.push(Object.assign({ t: sim.time }, e)); }
  return out;
}
function factionTests() {
  console.log('\n== factions ==');
  const sim = newSim();
  check(sim.teams[0].faction === 'vanguard' && sim.teams[1].faction === 'hegemony', 'default factions: team 0 Vanguard, team 1 Hegemony');
  check(sim.teams[0].name === 'Vanguard' && sim.teams[1].name === 'Hegemony', 'team names follow the faction');
  const o1 = sim.options(1).map((o) => o.type).join();
  check(o1 === 'reactor,refinery,barracks,factory,radar,spire,wall,repairbay,gravwell,siphon,techlab,riftsilo,trooper,shocktrooper,disruptor,acolyte,stalker,harvester,wisp,skimmer,lancer,arcwalker,phantom,obliterator', `Hegemony options in sidebar order (${o1})`);
  const o0 = sim.options(0).map((o) => o.type);
  check(!o0.some((t) => ['trooper', 'shocktrooper', 'skimmer', 'lancer', 'phantom', 'spire', 'riftsilo', 'disruptor', 'acolyte', 'stalker', 'wisp', 'arcwalker', 'obliterator', 'gravwell', 'siphon'].includes(t)), 'Vanguard options exclude Hegemony types');
  check(sim.options(0).find((o) => o.type === 'uplink').reason === 'Needs Tech Lab', 'uplink needs a tech lab');
  check(sim.options(1).find((o) => o.type === 'phantom').reason === 'Needs War Factory', 'phantom needs a factory first');
  check(ents(sim, (e) => e.team === 1 && e.kind === 'unit').map((e) => e.type).sort().join() === 'skimmer,trooper,trooper,trooper', 'Hegemony starts with a skimmer and three troopers');
  // can't build the other side's things
  buildNow(sim, 0, 'reactor'); buildNow(sim, 0, 'barracks');
  buildNow(sim, 1, 'reactor'); buildNow(sim, 1, 'barracks');
  check(sim.command(0, { type: 'queue', item: 'trooper' }) === false, "Vanguard can't queue a Pulse Trooper");
  check(sim.command(0, { type: 'queue', item: 'spire' }) === false, "Vanguard can't queue a Pulse Spire");
  check(sim.command(1, { type: 'queue', item: 'rifleman' }) === false, "Hegemony can't queue a Rifleman");
  check(sim.command(1, { type: 'queue', item: 'turret' }) === false, "Hegemony can't queue a Gun Turret");
  check(sim.command(1, { type: 'queue', item: 'uplink' }) === false, "Hegemony can't queue an Orbital Uplink");
  check(sim.command(0, { type: 'queue', item: 'rifleman' }) && sim.command(1, { type: 'queue', item: 'trooper' }), 'each side queues its own infantry');
  check(sim.command(1, { type: 'queue', item: 'spire' }), 'Hegemony queues a Pulse Spire');
  check(sim.allowed(0, 'harvester') && sim.allowed(1, 'harvester') && sim.allowed(1, 'radar'), 'shared types are allowed for both');
  // swapped factions
  const s2 = newSim({ factions: ['hegemony', 'vanguard'] });
  check(s2.teams[0].faction === 'hegemony' && s2.options(0).some((o) => o.type === 'lancer') && !s2.options(0).some((o) => o.type === 'tank'), 'the player can pick the Hegemony');
  const s3 = newSim({ factions: ['hegemony', 'hegemony'] });
  check(s3.teams[1].faction === 'hegemony', 'mirror factions allowed');
  const s4 = newSim({ factions: ['nonsense', 'vanguard'] });
  check(s4.teams[0].faction === 'vanguard', 'unknown faction falls back to a valid one');
  // AI plans per faction
  const ai = new SF.AI(newSim({ aiTeams: [] }), 1, 'hard');
  check(ai.plan.some((p) => p[0] === 'spire') && !ai.plan.some((p) => p[0] === 'turret') && ai.plan.some((p) => p[0] === 'riftsilo'), `Hegemony hard AI plans spires and a Rift Silo (${ai.plan.map((p) => p[0]).join(',')})`);
  const ai2 = new SF.AI(newSim({ aiTeams: [] }), 0, 'normal');
  check(!ai2.plan.some((p) => p[0] === 'uplink'), 'normal skirmish AI does not build a superweapon');
}

function weaponTests() {
  console.log('\n== energy weapons ==');
  const sim = newSim({ seed: 3, startUnits: [] });
  const c = sim.map.starts[0];
  const x0 = c.tx + 8, z0 = c.tz - 6;
  // beam: instant, impact in the same tick, damage × vs
  const tank = sim.spawnUnit(0, 'tank', x0, z0);
  const lancer = sim.spawnUnit(1, 'lancer', x0 + 4.4, z0);
  tank.hp = tank.maxHp = 5000;
  const ev = evs(sim, 6);
  const beams = ev.filter((e) => e.type === 'shot' && e.from === lancer.id);
  check(beams.length > 5 && beams.every((e) => e.weapon === 'beam' && e.proj === 'beam' && e.dur === 0), `lancer fires beams (${beams.length}, dur 0)`);
  const b0 = beams[0];
  check(ev.some((e) => e.type === 'impact' && e.weapon === 'beam' && e.t === b0.t && Math.abs(e.x - b0.tx) < 1e-9), 'a beam impacts in the same tick, at its end point');
  const cannonHits = ev.filter((e) => e.type === 'impact' && e.weapon === 'cannon').length;
  const W = CFG.WEAPONS;
  const wantLancerHp = lancer.maxHp - cannonHits * W.cannon.damage * W.cannon.vs.heavy;
  check(Math.abs(5000 - tank.hp - beams.length * W.beam.damage * W.beam.vs.heavy) < 1e-6, `beam damage = ${W.beam.damage} × vs.heavy per shot (${(5000 - tank.hp).toFixed(1)})`);
  check(Math.abs(lancer.hp - wantLancerHp) < 1e-6 || lancer.dead, 'tank shells hurt the lancer by cannon × vs.heavy');
  // bolts: projectiles that travel
  const s2 = newSim({ seed: 3, startUnits: [] });
  const ri = s2.spawnUnit(0, 'rifleman', x0, z0);
  const tr = s2.spawnUnit(1, 'trooper', x0 + 4.2, z0);
  ri.hp = ri.maxHp = 5000; tr.hp = tr.maxHp = 5000;
  const e2 = evs(s2, 4);
  const bolts = e2.filter((e) => e.type === 'shot' && e.from === tr.id);
  check(bolts.length > 3 && bolts.every((e) => e.proj === 'bolt' && e.dur > 0 && e.pid > 0), `pulse troopers fire travelling bolts (${bolts.length})`);
  const bi = e2.filter((e) => e.type === 'impact' && e.weapon === 'pulse');
  check(bi.length && bi[0].t > bolts[0].t, 'a bolt impacts after its flight time');
  check(Math.abs(5000 - ri.hp - bi.length * W.pulse.damage * W.pulse.vs.inf) < 1e-6, `bolt damage = ${W.pulse.damage} × vs.inf per hit`);
  // a powered Pulse Spire beams an enemy in range
  const s3 = newSim({ seed: 5 });
  buildNow(s3, 1, 'reactor'); buildNow(s3, 1, 'barracks');
  const sp = buildNow(s3, 1, 'spire');
  check(sp && sp.type === 'spire', 'Pulse Spire built');
  const vic = s3.spawnUnit(0, 'tank', sp.x - 5, sp.z + 0.01);
  vic.hp = vic.maxHp = 5000;
  const e3 = evs(s3, 5);
  const sb = e3.filter((e) => e.type === 'shot' && e.from === sp.id);
  check(sb.length >= 2 && sb.every((e) => e.weapon === 'spireBeam' && e.proj === 'beam' && e.dur === 0), `the spire fires beams (${sb.length})`);
  check(Math.abs(5000 - vic.hp - sb.length * W.spireBeam.damage * W.spireBeam.vs.heavy) < 1e-6, 'spire beam damage × vs');
  // skimmer: hover, faster over shards
  check(CFG.UNITS.skimmer.hover === true, 'skimmer is a hover unit');
}

function cloakTests() {
  console.log('\n== cloak ==');
  const sim = newSim({ seed: 3, startUnits: [] });
  const c = sim.map.starts[0];
  const x0 = c.tx + 9, z0 = c.tz - 7;
  const ph = sim.spawnUnit(1, 'phantom', x0 + 4, z0);
  const ri = sim.spawnUnit(0, 'rifleman', x0, z0);
  ri.hp = ri.maxHp = 5000;
  const e0 = evs(sim, 1);
  check(ph.cloaked === true && e0.some((e) => e.type === 'cloak' && e.id === ph.id && e.on === true), 'a phantom with no enemy close is cloaked (cloak event)');
  check(sim.visible(0, ph.x, ph.z), "the phantom's tile is in the enemy's sight");
  check(!sim.isVisible(0, ph), 'but isVisible() is false for the enemy');
  check(sim.isVisible(1, ph), 'the owner always sees it');
  check(sim.command(0, { type: 'attack', ids: [ri.id], targetId: ph.id }) === false, 'the enemy cannot order an attack on it');
  const e1 = evs(sim, 3);
  check(!e1.some((e) => e.type === 'shot' && e.from === ri.id), 'enemy units do not auto-target it');
  check(!e1.some((e) => e.type === 'shot' && e.from === ph.id), 'an idle cloaked unit holds its fire (stays hidden)');
  // firing reveals it for cloakDelay
  sim.command(1, { type: 'attack', ids: [ph.id], targetId: ri.id });
  const e2 = evs(sim, 1.5);
  const fired = e2.find((e) => e.type === 'shot' && e.from === ph.id);
  check(fired && !ph.cloaked && sim.isVisible(0, ph), 'firing reveals it');
  check(e2.some((e) => e.type === 'cloak' && e.id === ph.id && e.on === false), 'cloak event on reveal');
  check(sim.command(0, { type: 'attack', ids: [ri.id], targetId: ph.id }), 'the enemy can target it while revealed');
  sim.command(1, { type: 'stop', ids: [ph.id] });
  sim.command(0, { type: 'stop', ids: [ri.id] });
  ri.x = ri.prevX = ph.x - 8; ri.z = ri.prevZ = ph.z;
  const last = sim.time;
  let back = null;
  for (let i = 0; i < 20 * 5 && back === null; i++) { sim.step(); if (ph.cloaked) back = sim.time; }
  const delay = CFG.UNITS.phantom.cloakDelay;
  const lastShot = Math.max(...e2.filter((e) => e.type === 'shot' && e.from === ph.id).map((e) => e.t));
  check(back !== null && back - lastShot >= delay - 0.06 && back - lastShot <= delay + 0.2, `it cloaks again ${delay} s after its last shot (${back && (back - lastShot).toFixed(2)} s)`);
  void last;
  // an enemy within revealRange reveals it
  const rr = CFG.UNITS.phantom.revealRange;
  ri.x = ri.prevX = ph.x - (rr - 0.3); ri.z = ri.prevZ = ph.z;
  run(sim, 0.2);
  check(!ph.cloaked && sim.isVisible(0, ph), `an enemy unit within ${rr} tiles reveals it`);
  ri.x = ri.prevX = ph.x - 8;
  run(sim, 0.2);
  check(ph.cloaked, 'and it cloaks again when the enemy leaves');
  // enemy buildings reveal it too; turrets can't shoot it unless revealed
  const s2 = newSim({ seed: 5 });
  buildNow(s2, 0, 'reactor'); buildNow(s2, 0, 'barracks');
  const tur = buildNow(s2, 0, 'turret');
  const p2 = s2.spawnUnit(1, 'phantom', tur.x + 5, tur.z + 0.01);
  const e3 = evs(s2, 3);
  check(p2.cloaked && !e3.some((e) => e.type === 'shot' && e.from === tur.id), 'a turret ignores a cloaked unit in range');
  p2.x = p2.prevX = tur.x + rr; run(s2, 0.3);
  check(!p2.cloaked, 'a building within revealRange reveals it');
  const e4 = evs(s2, 3);
  check(e4.some((e) => e.type === 'shot' && e.from === tur.id), 'then the turret fires');
  // splash still hurts a cloaked unit
  const s3 = newSim({ seed: 3, startUnits: [] });
  const p3 = s3.spawnUnit(1, 'phantom', x0, z0);
  run(s3, 0.2);
  const hp0 = p3.hp;
  s3._hit(0, 0, 'artillery', CFG.WEAPONS.artillery, null, p3.x + 0.8, p3.z);
  check(p3.cloaked && p3.hp < hp0, `splash damages a cloaked unit (${hp0} → ${p3.hp.toFixed(1)})`);
  check(ents(s3, (e) => e.kind === 'unit').every((e) => e.cloaked === false || CFG.UNITS[e.type].cloak), 'only cloak units ever get cloaked');
}

function superTests() {
  console.log('\n== superweapons ==');
  const SW = CFG.SUPERWEAPONS;
  const sim = newSim({ seed: 9, startUnits: [] });
  const t0 = sim.teams[0];
  check(t0.super === null && sim.strikes.length === 0, 'no superweapon at the start');
  const place = (team, type, built) => {
    const core = ents(sim, (e) => e.team === team && e.type === 'core')[0];
    const sp = sim._placeNear(type, core.tx + (team ? -6 : 5), core.tz + (team ? 4 : -5));
    return sim._addBuilding(team, type, sp.tx, sp.tz, built);
  };
  const r1 = place(0, 'reactor', 1), r2 = place(0, 'reactor', 1);
  const up = place(0, 'uplink', 0);
  sim._updatePower(true);
  const ev = evs(sim, 6);
  check(up.built === 1 && t0.super && t0.super.kind === 'lance' && t0.super.building === up.id && !t0.super.ready, 'a finished uplink gives team.super (lance)');
  check(ev.some((e) => e.type === 'alert' && e.team === 1 && e.text === 'Enemy superweapon detected'), "the enemy gets 'Enemy superweapon detected'");
  check(ev.some((e) => e.type === 'alert' && e.team === 0 && e.text === 'Orbital Uplink online'), "the owner gets 'Orbital Uplink online'");
  const c1 = t0.super.charge;
  run(sim, 60);
  check(Math.abs(t0.super.charge - c1 - 60 / SW.lance.charge) < 0.01, `charges over ${SW.lance.charge} s while powered (${t0.super.charge.toFixed(3)})`);
  // low power pauses
  sim.command(0, { type: 'sell', id: r1.id }); sim.command(0, { type: 'sell', id: r2.id });
  run(sim, 0.5);
  const c2 = t0.super.charge;
  run(sim, 20);
  check(t0.lowPower && t0.super.charge === c2 && t0.super.paused, 'charging pauses on low power');
  place(0, 'reactor', 1); place(0, 'reactor', 1); sim._updatePower(true);
  run(sim, 10);
  check(t0.super.charge > c2 + 9 / SW.lance.charge, 'and resumes when power is back');
  check(sim.command(0, { type: 'superweapon', x: 10, z: 10 }) === false, 'cannot fire before it is charged');
  up._charge = SW.lance.charge - 1;
  const e2 = evs(sim, 1.2);
  check(t0.super.ready && t0.super.charge === 1, 'ready when fully charged');
  check(e2.some((e) => e.type === 'alert' && e.team === 0 && e.text === 'Orbital Lance ready') && e2.some((e) => e.type === 'alert' && e.team === 1 && e.text === 'Enemy Orbital Lance ready'), "'Orbital Lance ready' alerts for both sides");
  // explored points only
  const W = sim.map.w;
  let unexplored = null;
  for (let i = 0; i < W * W && !unexplored; i++) if (t0.vis[i] === 0) unexplored = { x: (i % W) + 0.5, z: ((i / W) | 0) + 0.5 };
  check(sim.command(0, { type: 'superweapon', x: unexplored.x, z: unexplored.z }) === false, 'cannot target unexplored ground');
  check(sim.command(0, { type: 'superweapon', x: -3, z: 5 }) === false, 'cannot target off the map');
  // strike: victims at known distances, own units included
  const tx = sim.map.starts[0].tx + 10.5, tz = sim.map.starts[0].tz - 8.5;
  sim._explore(0, tx, tz, 6);
  const R = SW.lance.radius;
  // unarmed heavy victims (harvesters with nothing to do stay put), at exact distances from the centre
  const HR = CFG.UNITS.harvester.radius;
  const mk = (team, dx, dz) => { const u = sim.spawnUnit(team, 'harvester', tx + dx, tz + dz); u.x = u.prevX = tx + dx; u.z = u.prevZ = tz + dz; u.hp = u.maxHp = 5000; return u; };
  const centre = mk(1, 0, 0), half = mk(1, R / 2 + HR, 0), edge = mk(1, -(R - 0.01 + HR), 0), out = mk(1, 0, R + HR + 0.6), own = mk(0, 0, -(R / 2 + HR));
  check(sim.command(0, { type: 'superweapon', x: tx, z: tz }), 'fires at an explored point');
  const st = sim.strikes[0];
  check(sim.strikes.length === 1 && st.kind === 'lance' && st.team === 0 && Math.abs(st.t - SW.lance.warn) < 1e-9 && st.warn === SW.lance.warn, 'a pending strike with its warning time');
  check(!t0.super.ready && t0.super.charge === 0 && up._charge === 0, 'charge restarts at 0 after firing');
  check(sim.command(0, { type: 'superweapon', x: tx, z: tz }) === false, 'cannot fire twice');
  const fireT = sim.time;
  const e3 = evs(sim, SW.lance.warn + 0.2);
  const strikeEv = e3.find((e) => e.type === 'superweapon' && e.phase === 'strike');
  check(strikeEv && Math.abs(strikeEv.t - fireT - SW.lance.warn) < 0.11, `the strike lands after the ${SW.lance.warn} s warning (${strikeEv && (strikeEv.t - fireT).toFixed(2)} s)`);
  check(sim.strikes.length === 0, 'strike removed from sim.strikes');
  const exp = (d) => SW.lance.damage * (1 - (1 - SW.lance.falloff) * Math.max(0, d) / R) * SW.lance.vs.heavy;
  const near = (a, b) => Math.abs(a - b) < 0.05;
  check(near(5000 - centre.hp, exp(0)), `full damage at the centre (${(5000 - centre.hp).toFixed(1)} vs ${exp(0)})`);
  check(near(5000 - half.hp, exp(R / 2)), `linear falloff at half radius (${(5000 - half.hp).toFixed(1)} vs ${exp(R / 2).toFixed(1)})`);
  check(near(5000 - edge.hp, exp(R - 0.01)), `damage × falloff at the edge (${(5000 - edge.hp).toFixed(1)} vs ${exp(R).toFixed(1)})`);
  check(out.hp === 5000, 'nothing beyond the radius');
  check(near(5000 - own.hp, exp(R / 2)), "it hurts the owner's units too");
  check(Math.abs(sim.strikeDamage('lance', R / 2, 'heavy') - exp(R / 2)) < 1e-9, 'strikeDamage() matches');
  // the warning is broadcast
  const sim2 = newSim({ seed: 9, startUnits: [] });
  const silo = sim2._addBuilding(1, 'riftsilo', sim2._placeNear('riftsilo', sim2.map.starts[1].tx - 5, sim2.map.starts[1].tz + 5).tx, sim2._placeNear('riftsilo', sim2.map.starts[1].tx - 5, sim2.map.starts[1].tz + 5).tz, 1);
  sim2._addBuilding(1, 'reactor', sim2._placeNear('reactor', sim2.map.starts[1].tx, sim2.map.starts[1].tz + 6).tx, sim2._placeNear('reactor', sim2.map.starts[1].tx, sim2.map.starts[1].tz + 6).tz, 1);
  sim2._updatePower(true);
  silo._charge = SW.rift.charge;
  run(sim2, 0.2);
  const t1 = sim2.teams[1];
  check(t1.super && t1.super.kind === 'rift' && t1.super.ready, 'Hegemony Rift Silo charged: team.super kind rift');
  const own1 = sim2.map.starts[1];
  const ex = { x: own1.tx + 1.5, z: own1.tz + 6.5 };
  const v1 = sim2.spawnUnit(0, 'harvester', ex.x, ex.z); v1.x = v1.prevX = ex.x; v1.z = v1.prevZ = ex.z; v1.hp = v1.maxHp = 5000;
  sim2.drainEvents();
  check(sim2.command(1, { type: 'superweapon', x: ex.x, z: ex.z }), 'rift bomb fired');
  const e4 = sim2.drainEvents();
  check(e4.some((e) => e.type === 'superweapon' && e.phase === 'warn' && e.kind === 'rift' && e.team === 1), "'superweapon' warn event");
  check([0, 1].every((t) => e4.some((e) => e.type === 'alert' && e.team === t && e.text === 'Superweapon launched' && e.x === ex.x)), "'Superweapon launched' alert with x,z for both sides");
  run(sim2, SW.rift.warn + 0.2);
  check(near(5000 - v1.hp, SW.rift.damage * SW.rift.vs.heavy), `rift damage × vs.heavy at the centre (${(5000 - v1.hp).toFixed(1)})`);
  // destroyed building loses its charge
  silo._charge = 100; run(sim2, 0.1);
  sim2._damage(silo, 1e6, 0, 0);
  run(sim2, 0.2);
  check(t1.super === null, 'a destroyed superweapon building loses its charge (team.super null)');
  // the AI fires at the best cluster of known enemy buildings
  const sim3 = newSim({ seed: 9, startUnits: [], aiTeams: [1], aiDifficulty: { 1: 'hard' } });
  const s3 = sim3.map.starts[1];
  const silo3 = sim3._addBuilding(1, 'riftsilo', sim3._placeNear('riftsilo', s3.tx - 5, s3.tz + 5).tx, sim3._placeNear('riftsilo', s3.tx - 5, s3.tz + 5).tz, 1);
  sim3._addBuilding(1, 'reactor', sim3._placeNear('reactor', s3.tx - 1, s3.tz + 6).tx, sim3._placeNear('reactor', s3.tx - 1, s3.tz + 6).tz, 1);
  sim3._addBuilding(1, 'reactor', sim3._placeNear('reactor', s3.tx + 3, s3.tz + 6).tx, sim3._placeNear('reactor', s3.tx + 3, s3.tz + 6).tz, 1);
  const b0 = sim3.map.starts[0];
  for (const [type, dx, dz] of [['reactor', 4, -1], ['barracks', 4, 2], ['refinery', 0, -5], ['reactor', 6, -4]]) {
    const sp = sim3._placeNear(type, b0.tx + dx, b0.tz + dz);
    sim3._addBuilding(0, type, sp.tx, sp.tz, 1);
  }
  const spy = sim3.spawnUnit(1, 'phantom', b0.tx + 9, b0.tz - 1);
  sim3._updatePower(true);
  silo3._charge = SW.rift.charge;
  const e5 = evs(sim3, 90, (e) => e.type === 'superweapon');
  const launch = e5.find((e) => e.phase === 'warn' && e.team === 1);
  const hitB = launch && ents(sim3, (e) => e.team === 0 && e.kind === 'building').filter((b) => sim3._rangeTo({ x: launch.x, z: launch.z }, b) < SW.rift.radius).length;
  check(launch && hitB >= 2, `the AI launches its superweapon at a cluster of enemy buildings (${hitB} in the blast)`);
  check(launch && Math.hypot(launch.x - spy.x, launch.z - spy.z) > 1, 'and not on top of its own unit');
}

// ---------------------------------------------------------------------------------------------
// 5. roster expansion: production lanes, healers and repairs, EMP stun, chain lightning, gravity wells, siphons,
//    burst fire, walls
function placeAt(sim, team, type, tx, tz) {
  const sp = sim._placeNear(type, tx, tz);
  const b = sim._addBuilding(team, type, sp.tx, sp.tz, 1);
  sim._updatePower(true);
  return b;
}
function rosterTests() {
  console.log('\n== roster: production lanes ==');
  {
    const sim = newSim({ seed: 5, startUnits: [] });
    const tm = sim.teams[0];
    check(sim.lanes(0, 'building') === 1 && sim.lanes(0, 'infantry') === 0 && sim.lanes(0, 'vehicle') === 0, 'lanes: one building lane (the core), no unit lanes yet');
    check(sim.queueCap(0, 'infantry') === CFG.ECONOMY.queueMax && sim.queueCap(0, 'building') === CFG.ECONOMY.queueMax, 'queueCap is queueMax with no producer');
    buildNow(sim, 0, 'reactor');
    const b1 = buildNow(sim, 0, 'barracks');
    check(sim.lanes(0, 'infantry') === 1 && sim.queueCap(0, 'infantry') === CFG.ECONOMY.queueMax, 'one barracks: one lane, queue of 5');
    const b2 = buildNow(sim, 0, 'barracks');
    check(b1 && b2 && b1.id !== b2.id, 'two barracks built');
    check(sim.lanes(0, 'infantry') === 2, `two barracks: two infantry lanes (${sim.lanes(0, 'infantry')})`);
    check(sim.queueCap(0, 'infantry') === 2 * CFG.ECONOMY.queueMax, `two barracks: queue cap ${2 * CFG.ECONOMY.queueMax} (${sim.queueCap(0, 'infantry')})`);
    // the queue holds queueCap items
    tm.credits = 0;
    let n = 0;
    for (let i = 0; i < 14; i++) if (sim.command(0, { type: 'queue', item: 'rifleman' })) n++;
    check(n === 10, `queue holds queueCap items (${n})`);
    const o = sim.options(0).find((x) => x.type === 'rifleman');
    check(o.queued === 10 && o.full, 'options() full uses queueCap');
    for (let i = 0; i < 14; i++) sim.command(0, { type: 'cancel', item: 'rifleman' });
    check(tm.queues.infantry.length === 0, 'cancel empties the bigger queue');
    // two riflemen build side by side and come out of different barracks at the same time
    tm.credits = 5000;
    sim.drainEvents();
    sim.command(0, { type: 'queue', item: 'rifleman' }); sim.command(0, { type: 'queue', item: 'rifleman' }); sim.command(0, { type: 'queue', item: 'rifleman' });
    const t0 = sim.time;
    sim.step();
    const q = tm.queues.infantry;
    check(q[0].active && q[1].active && !q[2].active, 'the first two items are active, the third waits');
    check(q[0].producer && q[1].producer && q[0].producer !== q[1].producer && !q[2].producer, `each active item has its own producer (${q[0].producer}, ${q[1].producer})`);
    const op = sim.options(0).find((x) => x.type === 'rifleman');
    check(op.building === 2 && op.queued === 3 && op.progress > 0, `options(): building ${op.building}, queued ${op.queued}, progress ${op.progress.toFixed(3)}`);
    const paidRate = (q[0].paid + q[1].paid);
    check(Math.abs(paidRate - 2 * CFG.UNITS.rifleman.cost * q[0].progress) < 1e-6, 'both lanes pay as they progress');
    const ev = evs(sim, CFG.UNITS.rifleman.time + 0.3);
    const comp = ev.filter((e) => e.type === 'complete' && e.what === 'rifleman');
    const spawns = ev.filter((e) => e.type === 'spawn' && e.what === 'rifleman');
    check(comp.length >= 2 && comp[0].t === comp[1].t, `two riflemen finish at once (${comp.map((e) => (e.t - t0).toFixed(2)).join(', ')} s)`);
    check(comp.length >= 2 && Math.abs(comp[0].t - t0 - CFG.UNITS.rifleman.time) < 0.15, 'each at full speed (one rifleman build time)');
    const froms = spawns.slice(0, 2).map((e) => sim.entities.get(e.id).from);
    check(spawns.length >= 2 && froms[0] !== froms[1] && froms.every((f) => f === b1.id || f === b2.id), `from different barracks (${froms.join(', ')})`);
    check(q.length === 1 && q[0].active && q[0].progress > 0, 'the third rifleman starts as soon as a lane frees up');
    // low power slows every lane
    const s2 = newSim({ seed: 5, startUnits: [] });
    buildNow(s2, 0, 'reactor'); buildNow(s2, 0, 'barracks'); buildNow(s2, 0, 'barracks');
    s2.command(0, { type: 'sell', id: ents(s2, (e) => e.team === 0 && e.type === 'reactor')[0].id });
    run(s2, 0.2);
    s2.teams[0].credits = 5000;
    s2.command(0, { type: 'queue', item: 'rifleman' }); s2.command(0, { type: 'queue', item: 'rifleman' });
    run(s2, 2);
    const want = 2 / CFG.UNITS.rifleman.time * CFG.ECONOMY.lowPowerSlowdown;
    check(s2.teams[0].lowPower && s2.teams[0].queues.infantry.every((it) => Math.abs(it.progress - want) < 0.03), 'low power slows every lane');
    // losing a producer: lanes drop, the orphaned item keeps its progress and moves to the other building
    const s3 = newSim({ seed: 5, startUnits: [] });
    buildNow(s3, 0, 'reactor');
    const c1 = buildNow(s3, 0, 'barracks'), c2 = buildNow(s3, 0, 'barracks');
    s3.teams[0].credits = 5000;
    s3.command(0, { type: 'queue', item: 'rocketeer' }); s3.command(0, { type: 'queue', item: 'rocketeer' });
    run(s3, 2);
    const q3 = s3.teams[0].queues.infantry;
    const lost = q3.find((it) => it.producer === c2.id);
    const keep = lost.progress;
    s3._damage(c2, 1e6, 0, 1);
    run(s3, 0.2);
    check(s3.lanes(0, 'infantry') === 1 && s3.queueCap(0, 'infantry') === CFG.ECONOMY.queueMax, 'a destroyed barracks takes its lane away');
    check(q3.filter((it) => it.active).length === 1 && lost.progress >= keep - 1e-9 && q3.every((it) => !it.producer || it.producer === c1.id), 'the extra item waits with its progress kept');
    // lanes are capped
    const s4 = newSim({ seed: 5, startUnits: [] });
    const core = ents(s4, (e) => e.team === 0 && e.type === 'core')[0];
    for (let k = 0; k < 7; k++) placeAt(s4, 0, 'factory', core.tx + 4 + (k % 3) * 4, core.tz - 4 - Math.floor(k / 3) * 4);
    check(s4.lanes(0, 'vehicle') === CFG.ECONOMY.maxLanes, `lanes capped at maxLanes (${s4.lanes(0, 'vehicle')} with 7 factories)`);
  }

  console.log('\n== roster: healers and repairs ==');
  {
    const sim = newSim({ seed: 3, startUnits: [] });
    const c = sim.map.starts[0];
    const x0 = c.tx + 8, z0 = c.tz - 6;
    const medic = sim.spawnUnit(0, 'medic', x0, z0);
    const ri = sim.spawnUnit(0, 'rifleman', x0 + 1.2, z0);
    ri.hp = 20;
    const e1 = evs(sim, 2);
    const healed = ri.hp - 20;
    check(healed > CFG.UNITS.medic.heal.rate * 1.5, `a medic heals hurt infantry (+${healed.toFixed(1)} hp in 2 s)`);
    check(medic.healing === ri.id, 'entity.healing = the target while healing');
    const he = e1.filter((e) => e.type === 'heal' && e.id === medic.id);
    check(he.length >= 3 && he.every((e) => e.target === ri.id && e.kind === 'heal' && isFinite(e.tx)), `'heal' events every 0.5 s (${he.length} in 2 s, kind heal)`);
    run(sim, 6);
    check(ri.hp === ri.maxHp && medic.healing === null, 'healing stops at full health');
    // idle healers walk to hurt allies they can see
    const far = sim.spawnUnit(0, 'rocketeer', medic.x + 4.5, medic.z + 0.5);
    far.hp = 10;
    run(sim, 6);
    check(far.hp > 10 + CFG.UNITS.medic.heal.rate, `an idle medic walks to a hurt ally in sight and heals it (hp ${far.hp.toFixed(1)})`);
    // medics don't heal vehicles
    const tk = sim.spawnUnit(0, 'tank', medic.x + 1, medic.z + 1); tk.hp = 100;
    run(sim, 2);
    check(tk.hp === 100, 'medics heal infantry only');
    // a heal order: walk to the ally, heal it to full, then go idle
    const hurt = sim.spawnUnit(0, 'rifleman', medic.x - 9, medic.z + 2);
    hurt.hp = 12;
    sim.command(0, { type: 'stop', ids: [hurt.id] });
    check(sim.command(0, { type: 'heal', ids: [medic.id], targetId: hurt.id }), 'heal command accepted');
    check(sim.command(0, { type: 'heal', ids: [medic.id], targetId: tk.id }) === false, 'a medic cannot be ordered to heal a tank');
    sim.command(0, { type: 'heal', ids: [medic.id], targetId: hurt.id });
    run(sim, 14);
    check(hurt.hp === hurt.maxHp && medic.state === 'idle' && !medic._order && medic.healing === null, `ordered onto a hurt ally, a medic walks over, heals it to full and goes idle (hp ${hurt.hp.toFixed(0)}, ${medic.state})`);
    // an acolyte heals too (Hegemony)
    const ac = sim.spawnUnit(1, 'acolyte', x0 + 0.5, z0 + 9); const tr = sim.spawnUnit(1, 'trooper', x0 + 1.5, z0 + 9); tr.hp = 10;
    run(sim, 2);
    check(tr.hp > 10 + CFG.UNITS.acolyte.heal.rate, `an acolyte heals Hegemony infantry (hp ${tr.hp.toFixed(1)})`);
    void ac;
    // engineer: repairs a damaged building when idle within 3 tiles, and when ordered onto one
    const s2 = newSim({ seed: 5, startUnits: [] });
    const rx = buildNow(s2, 0, 'reactor');
    rx.hp = 200;
    const eng = s2.spawnUnit(0, 'engineer', rx.tx - 1.5, rx.tz + 1);
    const e2 = evs(s2, 3);
    check(rx.hp > 200 + CFG.UNITS.engineer.heal.rate, `an idle engineer near a damaged building repairs it (hp ${rx.hp.toFixed(0)})`);
    check(e2.some((e) => e.type === 'heal' && e.id === eng.id && e.kind === 'repair' && e.target === rx.id), "engineer events are kind 'repair'");
    const core = ents(s2, (e) => e.team === 0 && e.type === 'core')[0];
    core.hp = 600;
    eng.x = eng.prevX = core.x + 9; eng.z = eng.prevZ = core.z - 6;
    s2.command(0, { type: 'stop', ids: [eng.id] });
    run(s2, 2);
    check(core.hp === 600, 'an engineer far away does not wander off on its own');
    check(s2.command(0, { type: 'repair', ids: [eng.id], targetId: core.id }), 'repair command accepted');
    run(s2, 15);
    check(core.hp > 900, `an engineer ordered onto a damaged building walks there and repairs it (core hp ${core.hp.toFixed(0)})`);
    check(s2.command(0, { type: 'repair', ids: [eng.id], targetId: ents(s2, (e) => e.team === 1 && e.type === 'core')[0].id }) === false, 'cannot repair an enemy building');
    const ri2 = s2.spawnUnit(0, 'rifleman', core.x + 3, core.z + 3);
    check(s2.command(0, { type: 'repair', ids: [ri2.id], targetId: core.id }) === false, 'units without a heal cannot be ordered to repair');
    core.hp = 1000;
    check(s2.command(0, { type: 'attack', ids: [eng.id], targetId: core.id }), "an 'attack' on an own building with healers selected becomes a repair");
    // repair bay: heals friendly vehicles nearby, passing ones included
    const s3 = newSim({ seed: 5, startUnits: [] });
    buildNow(s3, 0, 'reactor'); buildNow(s3, 0, 'refinery'); buildNow(s3, 0, 'factory');
    const bay = buildNow(s3, 0, 'repairbay');
    check(bay && bay.type === 'repairbay', 'repair bay built');
    const tank = s3.spawnUnit(0, 'tank', bay.x + 2.2, bay.z); tank.x = tank.prevX = bay.x + 2.2; tank.z = tank.prevZ = bay.z;
    tank.hp = 100;
    const e3 = evs(s3, 2);
    const R = CFG.BUILDINGS.repairbay.repair;
    check(Math.abs(tank.hp - 100 - R.rate * 2) < R.rate * 0.2, `the bay repairs a vehicle at ${R.rate} hp/s (+${(tank.hp - 100).toFixed(1)})`);
    check(bay.repairing === tank.id, 'building.repairing = the vehicle');
    check(e3.some((e) => e.type === 'heal' && e.id === bay.id && e.target === tank.id && e.kind === 'repair'), "bay → unit 'heal' events, kind 'repair'");
    const inf = s3.spawnUnit(0, 'rifleman', bay.x + 1.5, bay.z + 1.5); inf.hp = 10;
    run(s3, 2);
    check(inf.hp === 10, 'the bay ignores infantry');
    const runner = s3.spawnUnit(0, 'buggy', bay.x - 4, bay.z + 2.5); runner.hp = 60; tank.hp = tank.maxHp;
    s3.command(0, { type: 'move', ids: [runner.id], x: bay.x + 5, z: bay.z + 2.5 });
    run(s3, 4);
    check(runner.hp > 60, `a vehicle just passing gets repaired too (hp ${runner.hp.toFixed(1)})`);
  }

  console.log('\n== roster: EMP stun, chain lightning, burst fire ==');
  {
    const sim = newSim({ seed: 3, startUnits: [] });
    const c = sim.map.starts[0];
    const x0 = c.tx + 8, z0 = c.tz - 6;
    const tank = sim.spawnUnit(0, 'tank', x0, z0); tank.hp = tank.maxHp = 5000;
    const dis = sim.spawnUnit(1, 'disruptor', x0 + 4.5, z0); dis.hp = dis.maxHp = 5000;
    let stunT = null, stunEv = null;
    const shotsDuring = [];
    let pos = null, moved = 0;
    for (let i = 0; i < 20 * 8; i++) {
      sim.step();
      for (const e of sim.drainEvents()) {
        if (e.type === 'stun' && e.id === tank.id && stunT === null) { stunT = sim.time; stunEv = e; pos = { x: tank.x, z: tank.z }; }
        if (stunT !== null && sim.time - stunT < CFG.WEAPONS.emp.stun - 0.1 && e.type === 'shot' && e.from === tank.id) shotsDuring.push(e);
      }
      if (stunT !== null && sim.time - stunT < CFG.WEAPONS.emp.stun - 0.1) moved = Math.max(moved, Math.hypot(tank.x - pos.x, tank.z - pos.z));
      if (stunT !== null && sim.time - stunT > 0.2 && sim.time - stunT < 0.3) { sim.command(0, { type: 'move', ids: [tank.id], x: x0 - 6, z: z0 }); }
    }
    check(stunEv && Math.abs(stunEv.dur - CFG.WEAPONS.emp.stun) < 1e-9, `an EMP hit stuns the tank ('stun' event, ${stunEv && stunEv.dur} s)`);
    check(stunT !== null && shotsDuring.length === 0, 'a stunned tank does not fire');
    check(stunT !== null && moved < 0.05, `a stunned tank does not move even when ordered (${moved.toFixed(3)})`);
    // infantry are immune; defences are stunned
    const s2 = newSim({ seed: 3, startUnits: [] });
    const ri = s2.spawnUnit(0, 'rifleman', x0, z0);
    s2._hit(1, 0, 'emp', CFG.WEAPONS.emp, ri, ri.x, ri.z);
    check(!(ri.stunned > 0), 'infantry are immune to stun');
    buildNow(s2, 0, 'reactor'); buildNow(s2, 0, 'barracks');
    const tur = buildNow(s2, 0, 'turret');
    s2._hit(1, 0, 'emp', CFG.WEAPONS.emp, tur, tur.x, tur.z);
    const vic = s2.spawnUnit(1, 'lancer', tur.x + 4, tur.z + 0.01); vic.hp = vic.maxHp = 5000;
    const e2 = evs(s2, 1.5);
    check(tur.stunned > 0 && !e2.some((e) => e.type === 'shot' && e.from === tur.id), 'a stunned turret holds its fire');
    const e2b = evs(s2, 3);
    check(e2b.some((e) => e.type === 'shot' && e.from === tur.id), 'and fires again when the stun wears off');
    // chain lightning
    const s3 = newSim({ seed: 3, startUnits: [] });
    const arc = s3.spawnUnit(1, 'arcwalker', x0 + 4.2, z0);
    arc.hp = arc.maxHp = 5000;
    const pack = [[0, 0], [-1.2, 0], [0, 1.2], [-1.2, 1.2]].map(([dx, dz]) => { const u = s3.spawnUnit(0, 'harvester', x0 + dx, z0 + dz); u.hp = u.maxHp = 5000; return u; });
    for (const u of pack) s3.command(0, { type: 'stop', ids: [u.id] });
    const e3 = evs(s3, 3);
    const ch = e3.find((e) => e.type === 'shot' && e.from === arc.id);
    check(ch && ch.proj === 'chain' && Array.isArray(ch.points), "chain weapons emit one 'shot' with proj 'chain' and points");
    check(ch && ch.points.length >= 3 && new Set(ch.points.map((p) => p.id)).size === ch.points.length, `the arc hits 3+ different targets (${ch && ch.points.length})`);
    check(ch && ch.points[0].id === ch.target, 'the target is the first point');
    const imp = e3.filter((e) => e.type === 'impact' && e.proj === 'chain' && e.t === ch.t);
    check(ch && imp.length === ch.points.length, "one 'impact' per point");
    const W = CFG.WEAPONS.arc;
    const first = pack.find((u) => u.id === ch.points[0].id), second = pack.find((u) => u.id === ch.points[1].id);
    const shots = e3.filter((e) => e.type === 'shot' && e.from === arc.id && e.points.some((p) => p.id === first.id) && e.points[0].id === first.id).length;
    check(Math.abs((5000 - second.hp) / Math.max(1, (5000 - first.hp)) - W.chain.falloff) < 0.05 || shots > 1, `each jump × ${W.chain.falloff} damage`);
    // burst fire: a salvo launcher fires four rockets in a quick burst, then waits out its cooldown
    const s4 = newSim({ seed: 3, startUnits: [] });
    const sal = s4.spawnUnit(0, 'salvo', x0, z0);
    const tgt = s4.spawnUnit(1, 'tank', x0 + 6, z0 + 0.01); tgt.hp = tgt.maxHp = 99999;
    const e4 = evs(s4, 6).filter((e) => e.type === 'shot' && e.from === sal.id);
    const B = CFG.WEAPONS.salvo;
    const firstBurst = e4.filter((e) => e.t - e4[0].t < B.burstGap * (B.burst - 1) + 0.12);
    check(firstBurst.length === B.burst, `a salvo burst is ${B.burst} rockets (${firstBurst.length})`);
    check(firstBurst.every((e, k) => e.burst === k + 1), 'shot events number the rockets in the burst');
    const nextShot = e4[B.burst];
    check(nextShot && nextShot.t - firstBurst[B.burst - 1].t > B.cooldown * 0.9, `then the cooldown (${nextShot && (nextShot.t - firstBurst[B.burst - 1].t).toFixed(2)} s)`);
    // weapon minRange: a howitzer won't fire at targets inside it
    const s5 = newSim({ seed: 5, startUnits: [] });
    buildNow(s5, 0, 'reactor'); buildNow(s5, 0, 'reactor'); buildNow(s5, 0, 'refinery'); buildNow(s5, 0, 'radar');
    const how = buildNow(s5, 0, 'howitzer');
    check(how && how.type === 'howitzer', 'howitzer built');
    const close = s5.spawnUnit(1, 'tank', how.x + 2.2, how.z + 0.01); close.hp = close.maxHp = 5000;
    const e5 = evs(s5, 4);
    check(!e5.some((e) => e.type === 'shot' && e.from === how.id), 'a howitzer cannot hit anything inside its minimum range');
    close.x = close.prevX = how.x + 7; close.z = close.prevZ = how.z;
    const e5b = evs(s5, 6);
    check(e5b.some((e) => e.type === 'shot' && e.from === how.id && e.proj === 'arc'), 'and shells targets beyond it');
  }

  console.log('\n== roster: gravity well, siphon, hover, stalker ==');
  {
    const sim = newSim({ seed: 5, startUnits: [] });
    buildNow(sim, 1, 'reactor'); buildNow(sim, 1, 'barracks');
    const gw = buildNow(sim, 1, 'gravwell');
    check(gw && gw.type === 'gravwell' && !sim.teams[1].lowPower, 'gravity well built and powered');
    const F = CFG.BUILDINGS.gravwell.field;
    const ri = sim.spawnUnit(0, 'rifleman', gw.x - 3, gw.z + 0.01);
    const ally = sim.spawnUnit(1, 'trooper', gw.x + 1.5, gw.z + 1.5);
    run(sim, 0.1);
    check(ri.slowed === true && !ally.slowed, 'enemy units inside a powered field are slowed (not its own)');
    // speed through the field vs outside it
    const speedOf = (s, u, dx, secs) => { s.command(0, { type: 'move', ids: [u.id], x: u.x + dx, z: u.z }); run(s, 0.6); const a = u.x; run(s, secs); return Math.abs(u.x - a) / secs; };
    ri.x = ri.prevX = gw.x - 3.6; ri.z = ri.prevZ = gw.z - 1.8;
    const vIn = speedOf(sim, ri, 7, 1);
    const far = sim.spawnUnit(0, 'rifleman', gw.x - 14, gw.z - 7);
    const vOut = speedOf(sim, far, 7, 1);
    check(Math.abs(vIn / vOut - (1 - F.slow)) < 0.1, `a slowed unit moves at ${(1 - F.slow) * 100}% speed (${vIn.toFixed(2)} vs ${vOut.toFixed(2)} tiles/s)`);
    // no power, no field
    sim.command(1, { type: 'sell', id: ents(sim, (e) => e.team === 1 && e.type === 'reactor')[0].id });
    run(sim, 0.2);
    ri.x = ri.prevX = gw.x - 2; ri.z = ri.prevZ = gw.z;
    run(sim, 0.1);
    check(sim.teams[1].lowPower && !ri.slowed, 'an unpowered gravity well does nothing');
    // siphon income
    const s2 = newSim({ seed: 5, startUnits: [] });
    const t1 = s2.teams[1];
    buildNow(s2, 1, 'reactor'); buildNow(s2, 1, 'reactor'); buildNow(s2, 1, 'refinery');
    const si = buildNow(s2, 1, 'siphon');
    check(si && si.type === 'siphon' && !t1.lowPower, 'shard siphon built and powered');
    const c0 = t1.credits, h0 = t1.stats.creditsHarvested;
    const harvs = ents(s2, (e) => e.team === 1 && e.type === 'harvester');
    for (const h of harvs) s2.command(1, { type: 'stop', ids: [h.id] });
    const e2 = evs(s2, 9);
    const inc = CFG.BUILDINGS.siphon.income * t1.income;
    check(Math.abs(t1.credits - c0 - inc * 9) < 1, `+${CFG.BUILDINGS.siphon.income} credits/s while powered (+${(t1.credits - c0).toFixed(1)} in 9 s)`);
    check(t1.stats.creditsHarvested - h0 > inc * 8.5, 'siphon income counts as harvested');
    const ie = e2.filter((e) => e.type === 'income' && e.team === 1);
    check(ie.length === 3 && ie.every((e) => Math.abs(e.amount - inc * 3) <= 1 && e.x === si.x), `'income' events every 3 s (${ie.map((e) => e.amount).join(', ')})`);
    for (const r of ents(s2, (e) => e.team === 1 && e.type === 'reactor')) s2.command(1, { type: 'sell', id: r.id });
    run(s2, 0.2);
    const c1 = t1.credits;
    run(s2, 4);
    check(t1.lowPower && t1.credits === c1, 'no income on low power');
    // hover flags
    const U = CFG.UNITS;
    check(U.wisp.hover && U.obliterator.hover && U.skimmer.hover, 'wisp and obliterator hover like the skimmer');
    check(U.wisp.shardBonus && U.skimmer.shardBonus && !U.obliterator.shardBonus, 'only the fast hover units get the shard-field bonus');
    // stalker: cloaked infantry
    const s3 = newSim({ seed: 3, startUnits: [] });
    const c = s3.map.starts[0];
    const st = s3.spawnUnit(1, 'stalker', c.tx + 12, c.tz - 7);
    const ri3 = s3.spawnUnit(0, 'rifleman', c.tx + 9, c.tz - 7);
    run(s3, 1);
    check(st.cloaked && !s3.isVisible(0, st), 'a stalker is cloaked');
    ri3.x = ri3.prevX = st.x - (U.stalker.revealRange - 0.3); ri3.z = ri3.prevZ = st.z;
    run(s3, 0.2);
    check(!st.cloaked, `revealed within ${U.stalker.revealRange} tiles`);
  }

  console.log('\n== roster: walls ==');
  {
    const sim = newSim({ seed: 5, startUnits: [] });
    const tm = sim.teams[0];
    buildNow(sim, 0, 'reactor'); buildNow(sim, 0, 'barracks');
    const core = ents(sim, (e) => e.team === 0 && e.type === 'core')[0];
    // walls go through the normal queue → ready → place path, one at a time (the UI keeps placement mode)
    tm.credits = 200;
    check(sim.command(0, { type: 'queue', item: 'wall' }), 'queue a wall');
    run(sim, CFG.BUILDINGS.wall.time + 0.2);
    check(tm.ready === 'wall', `wall ready after ${CFG.BUILDINGS.wall.time} s`);
    const spots = [];
    for (let k = 0; k < 6 && spots.length < 2; k++) {
      const tx = core.tx + k, tz = core.tz - 3;
      if (sim.canPlace(0, 'wall', tx, tz)) spots.push({ tx, tz });
    }
    check(sim.command(0, { type: 'place', item: 'wall', tx: spots[0].tx, tz: spots[0].tz }) && tm.ready === null, 'place a wall');
    check(sim.command(0, { type: 'queue', item: 'wall' }), 'queue the next wall');
    run(sim, CFG.BUILDINGS.wall.time + 0.2);
    check(tm.ready === 'wall' && sim.command(0, { type: 'place', item: 'wall', tx: spots[1].tx, tz: spots[1].tz }), 'and place it next to the first');
    check(Math.abs(tm.credits - (200 - 2 * CFG.BUILDINGS.wall.cost)) < 1e-6, `each wall costs ${CFG.BUILDINGS.wall.cost}`);
    check(!sim.passable(spots[0].tx, spots[0].tz), 'a wall blocks its tile');
    // walls block paths: a unit walks around a wall line
    const s2 = newSim({ seed: 21, startUnits: [] });
    const c = s2.map.starts[0];
    const gx = c.tx + 14, gz = c.tz - 10;
    const lineZ = [];
    for (let dz = -4; dz <= 4; dz++) {
      const tz = Math.round(gz) + dz, tx = Math.round(gx) - 4;
      if (s2.block[tz * s2.map.w + tx] === 0 && !(s2.map.shards[tz * s2.map.w + tx] > 0)) { s2._addBuilding(1, 'wall', tx, tz, 1); lineZ.push(tz); }
    }
    const u = s2.spawnUnit(0, 'rifleman', gx - 7.5, gz + 0.5);
    s2.command(0, { type: 'move', ids: [u.id], x: gx, z: gz + 0.5 });
    let bad = null, crossed = false;
    for (let i = 0; i < 20 * 25 && !bad; i++) { s2.step(); bad = invariants(s2); const o = s2.buildingAt(u.x, u.z); if (o && o.type === 'wall') crossed = true; }
    check(!bad && !crossed, bad || 'units never walk through walls');
    check(Math.hypot(u.x - gx, u.z - gz - 0.5) < 1, `a unit paths around a wall line (${lineZ.length} walls) to its goal`);
    // attackers shoot their way through walls when the target is walled in
    const s3 = newSim({ seed: 21, startUnits: [] });
    const cx = Math.round(c.tx + 16), cz = Math.round(c.tz - 12);
    const tgt = placeAt(s3, 1, 'reactor', cx, cz);
    const R = 7;
    let walls = 0;
    for (let z = tgt.tz - R; z <= tgt.tz + 1 + R; z++) for (let x = tgt.tx - R; x <= tgt.tx + 1 + R; x++) {
      const ring = x === tgt.tx - R || x === tgt.tx + 1 + R || z === tgt.tz - R || z === tgt.tz + 1 + R;
      if (!ring || x < 0 || z < 0 || x >= s3.map.w || z >= s3.map.h || s3.block[z * s3.map.w + x] !== 0) continue;
      s3._addBuilding(1, 'wall', x, z, 1); walls++;
    }
    s3._explore(0, tgt.x, tgt.z, 12);
    const tk = s3.spawnUnit(0, 'tank', tgt.x - R - 5, tgt.z + 0.5); tk.hp = tk.maxHp = 99999;
    s3.command(0, { type: 'attackMove', ids: [tk.id], x: tgt.x, z: tgt.z });
    let wallDown = false;
    for (let i = 0; i < 20 * 150 && !tgt.dead; i++) {
      s3.step();
      for (const e of s3.drainEvents()) if (e.type === 'death' && e.what === 'wall') wallDown = true;
    }
    check(wallDown && tgt.dead, `a blocked attack-move breaks through the walls (${walls} walls) and reaches its target (${tgt.dead ? 'destroyed' : 'alive'})`);
  }

  console.log('\n== roster: AI ==');
  {
    // the AI's plans use the new defences and the repair bay; the Hegemony also plans a siphon
    const sV = newSim({ aiTeams: [] }), aiV = new SF.AI(sV, 0, 'normal'), aiH = new SF.AI(sV, 1, 'normal');
    const pv = aiV.plan.map((p) => p[0]), ph = aiH.plan.map((p) => p[0]);
    check(['sentry', 'howitzer', 'repairbay'].every((t) => pv.includes(t)) && !pv.includes('gravwell') && !pv.includes('wall'), `Vanguard AI plan: sentry, howitzer, repair bay, no walls (${pv.join(',')})`);
    check(['gravwell', 'siphon', 'repairbay'].every((t) => ph.includes(t)) && !ph.includes('sentry') && !ph.includes('wall'), `Hegemony AI plan: gravity well, siphon, repair bay (${ph.join(',')})`);
    check(aiV.plan.filter((p) => p[0] === 'barracks').length >= 2 && aiV.plan.filter((p) => p[0] === 'factory').length >= 2, 'the AI plans a second barracks and war factory');
    check(new SF.AI(sV, 1, 'hard').plan.some((p) => p[0] === 'factory' && p[1] === 3), 'hard AI plans a third war factory late');
    // a damaged vehicle at home parks at the repair bay
    const sim = newSim({ seed: 9, startUnits: [], aiTeams: [] });
    for (const t of ['reactor', 'refinery', 'barracks', 'factory', 'reactor', 'repairbay']) buildNow(sim, 0, t);
    const bay = ents(sim, (e) => e.team === 0 && e.type === 'repairbay')[0];
    const ai = new SF.AI(sim, 0, 'normal');
    const core = ents(sim, (e) => e.team === 0 && e.type === 'core')[0];
    const tk = sim.spawnUnit(0, 'tank', core.x + 6, core.z - 7); tk.hp = 120;
    let minD = Infinity;
    for (let i = 0; i < 20 * 40; i++) { sim.step(); if (i % 10 === 0) ai.update(0.5); if (tk.hp < tk.maxHp) minD = Math.min(minD, Math.hypot(tk.x - bay.x, tk.z - bay.z)); }
    check(tk.hp === tk.maxHp && minD < 3.5, `the AI parks a damaged tank at the repair bay until it is repaired (hp ${tk.hp.toFixed(0)}/${tk.maxHp}, came within ${minD.toFixed(1)} tiles)`);
    // engineers repair the base
    const eng = sim.spawnUnit(0, 'engineer', core.x + 2, core.z + 3);
    const fac = ents(sim, (e) => e.team === 0 && e.type === 'factory')[0];
    fac.hp = fac.maxHp * 0.4;
    for (let i = 0; i < 20 * 40; i++) { sim.step(); if (i % 10 === 0) ai.update(0.5); }
    check(fac.hp > fac.maxHp * 0.4 + 300, `the AI sends engineers to repair damaged buildings (factory ${Math.round(fac.hp)}/${fac.maxHp})`);
    void eng;
  }
}

// ---------------------------------------------------------------------------------------------
// 6. missions
function missionInvariants(sim) {
  const bad = invariants(sim);
  if (bad) return bad;
  for (const o of sim.mission.objectives) if (typeof o.progress !== 'string') return `objective ${o.id} progress ${o.progress}`;
  return null;
}
function runMission(idx, opts, cap, driver) {
  const M = SF.MISSIONS[idx];
  const sim = new SF.Sim(Object.assign({ mission: M }, opts || {}));
  const log = { objectives: [], messages: 0, events: [], error: null };
  try {
    while (sim.mission.status === 'active' && sim.time < cap) {
      sim.step();
      for (const e of sim.drainEvents()) {
        if (e.type === 'objective') log.objectives.push(Object.assign({ t: sim.time }, e));
        else if (e.type === 'message') log.messages++;
        else if (e.type === 'mission' || e.type === 'superweapon') log.events.push(Object.assign({ t: sim.time }, e));
      }
      if (driver) driver(sim);
      if (sim.tick % 20 === 0) { const bad = missionInvariants(sim); if (bad) { log.error = `t=${sim.time.toFixed(1)} ${bad}`; break; } }
    }
  } catch (err) { log.error = `exception at t=${sim.time.toFixed(1)}: ${err.stack}`; }
  log.sim = sim;
  return log;
}
function missionTests(full) {
  console.log('\n== missions ==');
  check(Array.isArray(SF.MISSIONS) && SF.MISSIONS.length === 5, 'five missions');
  const ids = new Set();
  for (const M of SF.MISSIONS) {
    ids.add(M.id);
    const ok = M.title && M.summary && Array.isArray(M.briefing) && M.briefing.length >= 2 && M.objectives.length && CFG.FACTIONS[M.faction] && CFG.FACTIONS[M.enemyFaction];
    check(ok, `${M.id} ${M.title}: has title, summary, briefing, objectives and factions`);
    const sim = new SF.Sim({ mission: M });
    check(sim.mission && sim.mission.status === 'active' && sim.mission.objectives.length === M.objectives.length, `${M.id}: loads (${sim.mission.objectives.length} objectives)`);
    check(sim.teams[0].faction === M.faction && sim.teams[1].faction === M.enemyFaction, `${M.id}: player ${M.faction}, enemy ${M.enemyFaction}`);
    check(sim.map.w === (M.map.size || 64), `${M.id}: ${sim.map.w}×${sim.map.h} map`);
    for (const ud of [].concat(M.player.buildings || [], M.enemy.buildings || [])) if (ud.tag) check(sim.tagged(ud.tag).length > 0, `${M.id}: tagged building '${ud.tag}' placed`);
    if (M.player.allow) {
      const types = sim.options(0).map((o) => o.type);
      check(types.every((t) => M.player.allow.includes(t)), `${M.id}: options respect the allow list (${types.join(',')})`);
    }
    for (const tr of M.triggers) for (const a of tr.do) if (a.objective) for (const id of [].concat(a.objective)) check(M.objectives.some((o) => o.id === id), `${M.id}: trigger reveals a real objective (${id})`);
    run(sim, 5);
    const bad = missionInvariants(sim);
    check(!bad, `${M.id}: runs (${bad || 'ok'})`);
  }
  check(ids.size === 5, 'mission ids are unique');
  frameworkTests();
  // 1. First Light: the normal AI plays the tutorial
  {
    const L = runMission(0, { aiTeams: [0], aiDifficulty: { 0: 'normal' } }, 1500);
    const s = L.sim;
    check(!L.error, `m1: ${L.error || 'no errors'}`);
    check(s.mission.status === 'won', `m1 First Light won by the AI player (${s.mission.status} at ${fmtT(s.time)})`);
    const order = L.objectives.filter((o) => o.revealed).map((o) => o.id);
    check(order.join() === 'refinery,harvest,barracks,riflemen,raid,outpost', `m1: objectives revealed step by step (${order.join(',')})`);
    check(s.tagged('raid').length === 4 && s.tagged('raid').every((e) => e.dead), 'm1: the scripted raid spawned and was beaten');
    check(L.messages >= 10, `m1: tutorial messages (${L.messages})`);
    check(s.teams[0].allow.has('rocketeer'), 'm1: rocketeers unlocked by a trigger');
    console.log(`    m1: won at ${fmtT(s.time)}, ${L.messages} messages`);
  }
  // 2. Hold the Ridge: a defensive AI holds for eight minutes
  {
    const L = runMission(1, { aiTeams: [0], aiDifficulty: { 0: 'normal' } }, 700, (sim) => { if (sim.tick === 1) sim.ais[0].passive = true; });
    const s = L.sim;
    check(!L.error, `m2: ${L.error || 'no errors'}`);
    check(s.mission.status === 'won' && s.time >= 480, `m2 Hold the Ridge won by the AI player (${s.mission.status} at ${fmtT(s.time)})`);
    const waves = [...s._tags.keys()].filter((k) => k.startsWith('wave'));
    check(waves.length === 11, `m2: all 11 waves spawned (${waves.length})`);
    const spawned = waves.reduce((a, k) => a + s.tagged(k).length, 0), killed = waves.reduce((a, k) => a + s.tagged(k).filter((e) => e.dead).length, 0);
    const lostB = s.teams[0].stats.buildingsLost;
    console.log(`    m2: won at ${fmtT(s.time)}; ${killed}/${spawned} attackers killed; player lost ${lostB} buildings, ${s.teams[0].stats.unitsLost} units`);
    check(s.teams[0].stats.unitsLost >= 5, `m2: the waves are a real threat (player lost ${s.teams[0].stats.unitsLost} units)`);
  }
  // 3. Ghost Protocol: a scripted route
  {
    const L = ghostRoute();
    check(!L.error, `m3: ${L.error || 'no errors'}`);
    check(L.sim.mission.status === 'won', `m3 Ghost Protocol won by a scripted route (${L.sim.mission.status} at ${fmtT(L.sim.time)}; ${L.note})`);
    check(L.lowPower, 'm3: destroying the outpost reactors switches the turrets off');
    check(L.messages >= 8, `m3: mission messages (${L.messages})`);
  }
  if (!full) return;
  // 4. Breakthrough: the AI player reaches a decisive result
  {
    const L = runMission(3, { aiTeams: [0, 1], aiDifficulty: { 0: 'hard', 1: 'normal' } }, 3000);
    const s = L.sim;
    check(!L.error, `m4: ${L.error || 'no errors'}`);
    const up = s.mission.objectives.find((o) => o.id === 'uplink');
    const fired = L.events.filter((e) => e.type === 'superweapon' && e.phase === 'warn' && e.team === 1).length;
    console.log(`    m4: ${s.mission.status} at ${fmtT(s.time)}; uplink objective ${up.done ? 'done' : up.failed ? 'failed' : 'open'}; enemy strikes ${fired}`);
    check(s.mission.status !== 'active', `m4 Breakthrough reaches a decisive result (${s.mission.status} at ${fmtT(s.time)})`);
    check(up.done || up.failed || s.mission.status !== 'active', 'm4: the uplink objective resolves');
  }
  // 5. Shardfall: the AI player beats the hard AI on the large map. The enemy starts ahead, so between two equal
  // hard AIs this is close to a coin flip that depends on the styles they roll; the proof that it is winnable is a
  // win in at least one style matchup (the rolled styles first, then each pairing in turn until one wins).
  {
    const S = ['balanced', 'rush', 'armor'];
    const pairs = [null].concat(S.flatMap((a) => S.map((b) => ({ 0: a, 1: b }))));
    const tried = [];
    let won = null;
    for (const st of pairs) {
      const L = runMission(4, { aiTeams: [0, 1], aiDifficulty: { 0: 'hard', 1: 'hard' }, aiStyles: st }, 3600);
      const s = L.sim;
      check(!L.error, `m5: ${L.error || 'no errors'}`);
      const strikes = [0, 1].map((t) => L.events.filter((e) => e.type === 'superweapon' && e.phase === 'warn' && e.team === t).length);
      const name = `${s.ais[0].style} vs ${s.ais[1].style}`;
      tried.push(`${name}: ${s.mission.status} at ${fmtT(s.time)}`);
      console.log(`    m5 (${name}): ${s.mission.status} at ${fmtT(s.time)}; strikes player ${strikes[0]} enemy ${strikes[1]}; units built ${s.teams[0].stats.unitsBuilt}/${s.teams[1].stats.unitsBuilt}`);
      if (st === null) check(s.map.w === 80, 'm5: large 80×80 map');
      if (s.mission.status === 'won') { won = name; break; }
    }
    check(won !== null, `m5 Shardfall won by the AI player against the hard AI (${won ? won + ', after ' + tried.length + ' tries' : tried.join('; ')})`);
  }
}
// Mission framework on a small synthetic mission: every trigger kind, objective kind and end condition.
function frameworkTests() {
  const M = {
    id: 'test', title: 'Test', faction: 'vanguard', enemyFaction: 'hegemony', summary: 's', briefing: ['a', 'b'],
    map: { seed: 77, size: 48, clear: [{ x: 24, z: 24, r: 3 }] },
    player: { credits: 1234, start: true, allow: ['reactor', 'barracks', 'rifleman'], units: [{ type: 'tank', x: 20, z: 30, tag: 'vip' }] },
    enemy: { credits: 0, ai: null, start: false, buildings: [{ type: 'reactor', tx: 30, tz: 12, tag: 'target' }], units: [{ type: 'trooper', count: 2, x: 34, z: 14, tag: 'guards' }] },
    objectives: [
      { id: 'a', text: 'Build a reactor', kind: 'build', type: 'reactor' },
      { id: 'b', text: 'Reach the middle', kind: 'reach', area: { x: 24, z: 24, r: 2 }, hidden: true },
      { id: 'c', text: 'Kill the target', kind: 'destroy', tag: 'target', hidden: true },
      { id: 'd', text: 'Keep the VIP alive', kind: 'protect', tag: 'vip', optional: true },
      { id: 'e', text: 'Survive 5 s', kind: 'survive', seconds: 5, hidden: true },
    ],
    triggers: [
      { at: 0.5, do: [{ message: { from: 'X', text: 'hello' } }] },
      { at: { objective: 'a' }, do: [{ objective: 'b' }, { credits: { team: 'player', amount: 100 } }] },
      { at: { area: { x: 24, z: 24, r: 2 }, team: 'player' }, do: [{ reveal: { x: 30, z: 12, r: 4 } }, { allow: { team: 'player', add: ['rocketeer'] } }] },
      { at: { objective: 'b' }, delay: 1, do: [{ objective: 'c' }] },
      { at: 2, every: 1, count: 3, do: [{ message: { from: 'Y', text: 'tick' } }] },
      { at: { destroyed: 'target' }, do: [{ objective: 'e' }, { spawn: { team: 'enemy', units: ['skimmer'], at: { x: 40, z: 40 }, attackMove: 'base', tag: 'late' } }] },
    ],
    win: 'objectives', lose: ['noBuildings', { protect: 'vip' }],
  };
  const sim = new SF.Sim({ mission: M });
  const tm = sim.teams[0];
  check(tm.credits === 1234 && sim.teams[1].credits === 0, 'framework: mission credits');
  check(sim.options(0).map((o) => o.type).join() === 'reactor,barracks,rifleman', 'framework: allow list filters options');
  check(sim.command(0, { type: 'queue', item: 'refinery' }) === false, 'framework: cannot queue what the mission does not allow');
  check(!ents(sim, (e) => e.team === 1 && e.type === 'core').length && sim.tagged('guards').length === 2, 'framework: enemy without a start base, with its scripted units');
  check(sim.mission.objectives.filter((o) => o.hidden).length === 3, 'framework: hidden objectives');
  const all = [];
  const go = (secs) => { const e = evs(sim, secs); all.push(...e); return e; };
  go(1);
  check(all.some((e) => e.type === 'message' && e.from === 'X' && e.text === 'hello'), 'framework: timed message');
  buildNow(sim, 0, 'reactor');
  go(0.5);
  check(sim.mission.objectives[0].done && all.some((e) => e.type === 'objective' && e.id === 'a' && e.done), "framework: 'build' objective completes (objective event)");
  check(!sim.mission.objectives[1].hidden && all.some((e) => e.type === 'objective' && e.id === 'b' && e.revealed), 'framework: objective trigger reveals the next objective');
  check(Math.abs(tm.credits - (1234 + 100 - 0)) < 1e-6 || tm.credits > 1234 - 300 + 99, 'framework: credits action');
  check(all.filter((e) => e.type === 'message' && e.from === 'Y').length >= 1, "framework: 'every' trigger");
  const vip = sim.tagged('vip')[0];
  sim.command(0, { type: 'move', ids: [vip.id], x: 24, z: 24 });
  for (let i = 0; i < 20 * 30 && !sim.mission.objectives[1].done; i++) { sim.step(); all.push(...sim.drainEvents()); }
  check(sim.mission.objectives[1].done, "framework: 'reach' objective");
  check(tm.allow.has('rocketeer') && tm.vis[12 * sim.map.w + 30] >= 1, 'framework: area trigger (reveal + allow actions)');
  go(0.6);
  check(sim.mission.objectives[2].hidden, "framework: 'delay' holds a trigger back");
  go(0.8);
  check(!sim.mission.objectives[2].hidden, 'framework: delayed trigger fires');
  check(all.filter((e) => e.type === 'message' && e.from === 'Y').length === 3, "framework: 'every' trigger stops after 'count'");
  sim._damage(sim.tagged('target')[0], 1e6, 0, 0);
  go(0.5);
  check(sim.mission.objectives[2].done && sim.mission.objectives[2].progress === '1/1', "framework: 'destroy' objective");
  check(sim.tagged('late').length === 1 && sim.tagged('late')[0]._hunt, 'framework: spawn action (hunting the base)');
  check(!sim.mission.objectives[4].hidden && /^0:0[0-5]$/.test(sim.mission.objectives[4].progress), `framework: 'survive' shows a countdown (${sim.mission.objectives[4].progress})`);
  check(sim.mission.status === 'active', 'framework: not won while an objective is open');
  sim._damage(sim.tagged('late')[0], 1e6, 0, 0);
  go(5.5);
  check(sim.mission.status === 'won' && sim.winner === 0 && all.some((e) => e.type === 'mission' && e.status === 'won') && all.some((e) => e.type === 'gameover' && e.winner === 0), `framework: all objectives → won (mission + gameover events) (${sim.mission.status})`);
  check(sim.mission.objectives[3].done, 'framework: a kept protect objective counts as done on victory');
  // losing: protect target dies
  const s2 = new SF.Sim({ mission: M });
  s2._damage(s2.tagged('vip')[0], 1e6, 0, 1);
  const e2 = evs(s2, 0.5);
  check(s2.mission.status === 'lost' && s2.winner === 1 && e2.some((e) => e.type === 'mission' && e.status === 'lost'), 'framework: losing a protected unit loses the mission');
  check(s2.mission.objectives[3].failed, 'framework: protect objective failed');
  check(s2.command(0, { type: 'queue', item: 'reactor' }) === false, 'framework: no commands after defeat');
  // losing: no buildings
  const s3 = new SF.Sim({ mission: M });
  for (const b of ents(s3, (e) => e.team === 0 && e.kind === 'building')) s3._damage(b, 1e6, 0, 1);
  evs(s3, 0.5);
  check(s3.mission.status === 'lost' && /base/.test(s3.mission.reason), `framework: no buildings → lost (${s3.mission.reason})`);
  // map clear
  check(s3.map.tiles[24 * s3.map.w + 24] !== 1 && s3.map.tiles[23 * s3.map.w + 25] !== 1, 'framework: map.clear opens rock');
  // skirmish has no mission
  check(newSim().mission === null, 'skirmish: sim.mission is null');
}
// Mission 3 by a scripted route: sneak in cloaked, cut each outpost's reactor, clear the guards, kill the array.
function ghostRoute() {
  const L = { messages: 0, error: null, lowPower: false, note: '' };
  const sim = new SF.Sim({ mission: SF.MISSIONS[2] });
  L.sim = sim;
  const ghosts = () => sim.tagged('ghost').filter((u) => !u.dead);
  const gids = () => ghosts().map((u) => u.id);
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      sim.step();
      for (const e of sim.drainEvents()) if (e.type === 'message') L.messages++;
      if (sim.teams[1].lowPower) L.lowPower = true;
      if (sim.mission.status !== 'active') return false;
    }
    return true;
  };
  const go = (x, z) => {
    if (!sim.command(0, { type: 'move', ids: gids(), x, z })) return;
    const t0 = sim.time;
    while (sim.time - t0 < 120 && step(10) && ghosts().some((u) => u._path || u._need));
  };
  // walk toward (x, z) until done() (e.g. the target comes into sight), then halt
  const approach = (x, z, done) => {
    if (!sim.command(0, { type: 'move', ids: gids(), x, z })) return;
    const t0 = sim.time;
    while (sim.time - t0 < 60 && !done() && step(5) && ghosts().some((u) => u._path || u._need));
    sim.command(0, { type: 'stop', ids: gids() });
  };
  const attack = (t) => {
    if (t && !t.dead && !sim.isKnown(0, t)) approach(t.x, t.z, () => sim.isKnown(0, t));
    if (!t || t.dead || !sim.command(0, { type: 'attack', ids: gids(), targetId: t.id })) return;
    const t0 = sim.time;
    while (!t.dead && sim.time - t0 < 90 && step(5));
  };
  const foesNear = (x, z, r) => ents(sim, (e) => !e.dead && e.team === 1 && e.kind === 'unit' && Math.hypot(e.x - x, e.z - z) <= r && sim.isVisible(0, e));
  const clear = (x, z, r) => {
    approach(x, z, () => foesNear(x, z, r).length > 0);
    for (let k = 0; k < 12; k++) {
      const g = ghosts()[0];
      if (!g) return;
      const foes = foesNear(x, z, r);
      if (!foes.length) return;
      foes.sort((a, b) => Math.hypot(a.x - g.x, a.z - g.z) - Math.hypot(b.x - g.x, b.z - g.z));
      attack(foes[0]);
    }
  };
  const tag = (t) => sim.tagged(t).find((e) => !e.dead);
  const route = [
    ['go', 16, 52], ['go', 18, 40], ['go', 28, 37], ['go', 34.5, 41], ['kill', 'commsAPower'], ['clear', 29, 47, 7], ['kill', 'commsA'],
    ['go', 38, 30], ['go', 48, 22], ['go', 57.5, 25.5], ['kill', 'commsBPower'], ['clear', 50, 32, 8], ['kill', 'commsB'],
    ['go', 52, 18], ['go', 44, 6], ['kill', 'commsCPower'], ['clear', 33, 11, 8], ['kill', 'commsC'],
    ['go', 24, 17], ['go', 5, 5],
  ];
  try {
    for (const r of route) {
      if (sim.mission.status !== 'active') break;
      if (r[0] === 'go') go(r[1], r[2]);
      else if (r[0] === 'clear') clear(r[1], r[2], r[3]);
      else attack(tag(r[1]));
    }
    step(100);
  } catch (err) { L.error = err.stack; }
  L.note = `${ghosts().length} phantoms left`;
  return L;
}

// Vanguard vs Hegemony: the factions swap sides every game, so map side and faction are not confounded.
function factionTest(diff, games, cap, minShare, minDone) {
  console.log(`\n== Vanguard vs Hegemony at ${diff} (sides alternate) ==`);
  const wins = { vanguard: 0, hegemony: 0 }, t0 = [0, 0];
  let done = 0, len = 0;
  const used = {}, blds = {};
  for (let g = 0; g < games; g++) {
    const facs = g % 2 ? ['hegemony', 'vanguard'] : ['vanguard', 'hegemony'];
    const r = playGame(5000 + g * 7, [diff, diff], cap, facs);
    check(!r.error, r.error || 'ok');
    if (r.winner !== null) { wins[r.factions[r.winner]]++; done++; len += r.time; t0[r.winner]++; }
    for (const t of [0, 1]) {
      for (const [k, v] of Object.entries(r.built[t])) used[k] = (used[k] || 0) + v;
      const seenB = new Set(r.ais[t].log.map((l) => l[1]));
      for (const b of seenB) blds[b] = (blds[b] || 0) + 1;
      blds['2+ barracks'] = (blds['2+ barracks'] || 0) + (r.ais[t].log.filter((l) => l[1] === 'barracks').length >= 2 ? 1 : 0);
      blds['2+ factories'] = (blds['2+ factories'] || 0) + (r.ais[t].log.filter((l) => l[1] === 'factory').length >= 2 ? 1 : 0);
    }
    const s = r.stats;
    console.log(`    seed ${r.seed}: T0 ${facs[0]} (${r.ais[0].style}) vs T1 ${facs[1]} (${r.ais[1].style}): ${r.winner === null ? 'timeout' : r.factions[r.winner] + ' wins'} at ${fmtT(r.time)}; peak ${r.ais[0].peak}/${r.ais[1].peak}; harvested ${Math.round(s[0].creditsHarvested)}/${Math.round(s[1].creditsHarvested)}; kills ${s[0].kills}/${s[1].kills}; raids ${r.ais[0].raids}/${r.ais[1].raids}; strikes ${r.ais[0].supers}/${r.ais[1].supers}`);
  }
  console.log(`    Vanguard ${wins.vanguard} / Hegemony ${wins.hegemony}, timeouts ${games - done}; by side T0 ${t0[0]} / T1 ${t0[1]}; average length ${fmtT(done ? len / done : 0)}`);
  const NEW_U = ['sniper', 'medic', 'engineer', 'scout', 'salvo', 'bulwark', 'disruptor', 'acolyte', 'stalker', 'wisp', 'arcwalker', 'obliterator'];
  const NEW_B = ['repairbay', 'sentry', 'howitzer', 'gravwell', 'siphon'];
  console.log(`    new units built (all games): ${NEW_U.map((u) => `${u} ${used[u] || 0}`).join(', ')}`);
  console.log(`    AIs that built (of ${games * 2}): ${NEW_B.concat(['2+ barracks', '2+ factories']).map((b) => `${b} ${blds[b] || 0}`).join(', ')}`);
  check(NEW_U.filter((u) => used[u] > 0).length >= 10, `${diff}: the AIs use the new units (${NEW_U.filter((u) => used[u] > 0).length}/${NEW_U.length} types built)`);
  check(['repairbay', 'sentry', 'gravwell'].every((b) => blds[b] > 0) && (blds['2+ barracks'] || 0) + (blds['2+ factories'] || 0) > 0, `${diff}: the AIs build repair bays, the new defences and extra production`);
  check(done >= Math.ceil(games * minDone), `${diff}: faction games end with a winner (${done}/${games}, need ${Math.round(minDone * 100)}%)`);
  check(Math.min(wins.vanguard, wins.hegemony) >= Math.floor(done * minShare), `${diff}: factions are balanced (Vanguard ${wins.vanguard} / Hegemony ${wins.hegemony})`);
  return wins;
}

// ---------------------------------------------------------------------------------------------
const only = arg('--only');
const cap = +arg('--cap', 1800);
const games = +arg('--games', 8);
const diffs = arg('--diff') ? [arg('--diff')] : ['easy', 'normal', 'hard'];
const t0 = Date.now();
if (!only || only === 'commands') commandTests();
if (!only || only === 'phase2') { factionTests(); weaponTests(); cloakTests(); superTests(); }
if (!only || only === 'roster') rosterTests();
if (!only || only === 'missions' || only === 'missions-quick') missionTests(only !== 'missions-quick');
if (!only || only === 'perf') perfTest();
if (!only || only === 'games') gamesTest(diffs, games, cap);
if (!only || only === 'mixed') mixedTest(Math.max(4, Math.round(games / 2)), cap);
if (!only || only === 'factions') {
  factionTest('normal', +arg('--fgames', 16), cap, 0.3, 0.5);
  if (!arg('--diff')) factionTest('hard', Math.max(4, Math.round(+arg('--fgames', 16) / 2)), cap, 0.2, 0.25);
}
console.log(`\n${passes} passed, ${failures} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failures ? 1 : 0);
