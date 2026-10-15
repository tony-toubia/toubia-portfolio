// DEV STAND-IN ONLY (loaded with ?dev=1). A crude SF.Sim that follows the simulation contract closely enough to drive
// the renderer, input and UI: a generated map, both bases, units that move/fight/harvest, production queues, fog.
// It is NOT the game's simulation (no pathfinding, toy AI). The real js/map.js + js/sim.js + js/ai.js replace it.
(function () {
    const SF = window.SF = window.SF || {};
    const C = window.SF_CONFIG;
    function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    const ORDER_B = ['reactor', 'refinery', 'barracks', 'factory', 'radar', 'turret', 'techlab'];
    const ORDER_U = ['rifleman', 'rocketeer', 'harvester', 'buggy', 'tank', 'artillery'];

    class Sim {
        constructor(o) {
            o = o || {};
            this.rand = rng(o.seed || 1);
            this.size = o.size || 64; this.playerTeam = o.playerTeam || 0; this.difficulty = o.difficulty || 'normal';
            this.time = 0; this.alpha = 0; this.acc = 0; this.nextId = 1; this.events = []; this.winner = null; this.pending = [];
            this.entities = new Map();
            this.genMap();
            this.occ = new Int32Array(this.size * this.size);
            this.teams = [0, 1].map((t) => ({ id: t, credits: C.ECONOMY.startCredits, power: { made: 0, used: 0 }, lowPower: false, radar: false, ai: t !== this.playerTeam,
                queues: { building: [], infantry: [], vehicle: [] }, ready: null, rally: { infantry: null, vehicle: null },
                vis: new Uint8Array(this.size * this.size), defeated: false, lastAttackAlert: -99, stats: { unitsBuilt: 0, unitsLost: 0, buildingsBuilt: 0, buildingsLost: 0, kills: 0, buildingsDestroyed: 0, creditsHarvested: 0, creditsSpent: 0 } }));
            const mk = (team, base) => {
                const s = this.map.starts[team];
                this.addBuilding(team, 'core', s.tx, s.tz, 1);
                for (const [type, dx, dz] of base) this.addBuilding(team, type, s.tx + dx, s.tz + dz, 1);
            };
            mk(0, [['reactor', 4, 0], ['refinery', 0, 4], ['barracks', 4, 3], ['radar', -3, 0]]);
            mk(1, [['reactor', -3, 0], ['barracks', 0, -3], ['factory', -4, -4], ['turret', -2, 4], ['turret', 4, -2]]);
            const s0 = this.map.starts[0], s1 = this.map.starts[1];
            const spawn = (team, type, x, z) => this.addUnit(team, type, x, z);
            ['rifleman', 'rifleman', 'rifleman', 'rocketeer', 'tank', 'tank', 'buggy', 'artillery'].forEach((t, i) => spawn(0, t, s0.tx + 8 + (i % 4) * 0.9, s0.tz + 4 + Math.floor(i / 4) * 1.1));
            spawn(0, 'harvester', s0.tx + 1.5, s0.tz + 8);
            ['rifleman', 'rifleman', 'rocketeer', 'tank', 'buggy'].forEach((t, i) => spawn(1, t, s1.tx - 4 + i, s1.tz - 6));
            spawn(1, 'harvester', s1.tx + 1, s1.tz - 6);
            this.aiTimer = 25;
            this.updateVis(true);
            this.computePower();
        }
        genMap() {
            const N = this.size, r = this.rand;
            const tiles = new Uint8Array(N * N), shards = new Float32Array(N * N);
            const starts = [{ tx: 6, tz: 6 }, { tx: N - 9, tz: N - 9 }];
            for (let b = 0; b < 26; b++) {
                let x = Math.floor(r() * N), z = Math.floor(r() * N);
                for (let k = 0; k < 18; k++) { if (x >= 0 && z >= 0 && x < N && z < N) tiles[z * N + x] = 1; x += Math.floor(r() * 3) - 1; z += Math.floor(r() * 3) - 1; }
            }
            for (let i = 0; i < N; i++) { tiles[i] = tiles[(N - 1) * N + i] = tiles[i * N] = tiles[i * N + N - 1] = 1; }
            for (const s of starts) for (let z = s.tz - 5; z < s.tz + 12; z++) for (let x = s.tx - 5; x < s.tx + 12; x++) if (x > 0 && z > 0 && x < N - 1 && z < N - 1) tiles[z * N + x] = 0;
            const spires = [{ tx: 16, tz: 16 }, { tx: N - 17, tz: N - 17 }, { tx: 12, tz: N - 14 }, { tx: N - 13, tz: 13 }, { tx: N / 2, tz: N / 2 }];
            for (const sp of spires) {
                for (let z = sp.tz - 3; z <= sp.tz + 3; z++) for (let x = sp.tx - 3; x <= sp.tx + 3; x++) {
                    const d = Math.hypot(x - sp.tx, z - sp.tz);
                    if (d < 3.3 && r() < 0.85) { tiles[z * N + x] = 2; shards[z * N + x] = C.ECONOMY.shardPerTile * (0.4 + r() * 0.6); }
                }
                tiles[sp.tz * N + sp.tx] = 1; shards[sp.tz * N + sp.tx] = 0;
            }
            const decor = [], types = ['rock', 'crystal', 'tree', 'boulder'];
            for (let i = 0; i < 90; i++) {
                const x = 1 + r() * (N - 2), z = 1 + r() * (N - 2);
                if (tiles[Math.floor(z) * N + Math.floor(x)] !== 0) continue;
                decor.push({ type: types[Math.floor(r() * 4)], x, z, s: 0.6 + r() * 0.8, rot: r() * 6.28 });
            }
            this.map = { w: N, h: N, tiles, shards, spires, starts, decor };
        }
        idx(tx, tz) { return tz * this.size + tx; }
        inb(tx, tz) { return tx >= 0 && tz >= 0 && tx < this.size && tz < this.size; }
        passable(tx, tz) { if (!this.inb(tx, tz)) return false; const t = this.map.tiles[this.idx(tx, tz)]; return t !== 1 && !this.occ[this.idx(tx, tz)]; }
        visible(team, x, z) { const tx = Math.floor(x), tz = Math.floor(z); return this.inb(tx, tz) && this.teams[team].vis[this.idx(tx, tz)] === 2; }
        addBuilding(team, type, tx, tz, built) {
            const b = C.BUILDINGS[type];
            const e = { id: this.nextId++, team, kind: 'building', type, tx, tz, x: tx + b.w / 2, z: tz + b.d / 2, prevX: 0, prevZ: 0, angle: 0, turret: Math.PI * (team ? 0.75 : -0.25),
                hp: b.hp, maxHp: b.hp, dead: false, built: built || 0, state: 'idle', targetId: null, firing: 9, cd: 0 };
            e.prevX = e.x; e.prevZ = e.z;
            for (let z = tz; z < tz + b.d; z++) for (let x = tx; x < tx + b.w; x++) if (this.inb(x, z)) this.occ[this.idx(x, z)] = e.id;
            this.entities.set(e.id, e);
            return e;
        }
        addUnit(team, type, x, z) {
            const e = { id: this.nextId++, team, kind: 'unit', type, x, z, prevX: x, prevZ: z, angle: team ? Math.PI : 0, turret: team ? Math.PI : 0,
                hp: C.UNITS[type].hp, maxHp: C.UNITS[type].hp, dead: false, carry: 0, state: 'idle', targetId: null, firing: 9, cd: 0, goal: null };
            this.entities.set(e.id, e);
            this.events.push({ type: 'spawn', id: e.id, team, what: type });
            this.teams && this.teams[team] && this.teams[team].stats.unitsBuilt++;
            return e;
        }
        has(team, type) { for (const e of this.entities.values()) if (e.team === team && e.type === type && !e.dead && (e.kind !== 'building' || e.built >= 1)) return true; return false; }
        computePower() {
            for (const t of this.teams) { t.power.made = 0; t.power.used = 0; }
            for (const e of this.entities.values()) if (e.kind === 'building' && !e.dead) { const p = C.BUILDINGS[e.type].power; if (p > 0) this.teams[e.team].power.made += p; else this.teams[e.team].power.used -= p; }
            for (const t of this.teams) {
                const low = t.power.used > t.power.made;
                if (low && !t.lowPower) this.events.push({ type: 'alert', team: t.id, text: 'Low power' });
                t.lowPower = low; t.radar = !low && this.has(t.id, 'radar');
            }
        }
        options(team) {
            const T = this.teams[team], out = [];
            const lock = (req) => { for (const r of req) if (!this.has(team, r)) return 'Needs ' + (C.BUILDINGS[r] ? C.BUILDINGS[r].name : r); return null; };
            for (const type of ORDER_B) {
                const b = C.BUILDINGS[type], q = T.queues.building, reason = this.has(team, 'core') ? lock(b.requires) : 'Needs Command Core';
                const mine = q.filter((i) => i.type === type);
                out.push({ type, cat: 'building', cost: b.cost, time: b.time, locked: !!reason, reason, queued: mine.length, progress: q[0] && q[0].type === type ? q[0].progress : 0, ready: T.ready === type });
            }
            for (const type of ORDER_U) {
                const u = C.UNITS[type], cat = u.from, q = T.queues[cat];
                const reason = !this.has(team, cat === 'infantry' ? 'barracks' : 'factory') ? 'Needs ' + (cat === 'infantry' ? 'Barracks' : 'War Factory') : lock(u.requires);
                const mine = q.filter((i) => i.type === type);
                out.push({ type, cat, cost: u.cost, time: u.time, locked: !!reason, reason, queued: mine.length, progress: q[0] && q[0].type === type ? q[0].progress : 0, ready: false });
            }
            return out;
        }
        canPlace(team, type, tx, tz) {
            const b = C.BUILDINGS[type]; if (!b) return false;
            for (let z = tz; z < tz + b.d; z++) for (let x = tx; x < tx + b.w; x++) { if (!this.passable(x, z) || this.map.tiles[this.idx(x, z)] === 2) return false; }
            for (const e of this.entities.values()) {
                if (e.kind !== 'unit' || e.dead) continue;
                if (e.x > tx - 0.2 && e.x < tx + b.w + 0.2 && e.z > tz - 0.2 && e.z < tz + b.d + 0.2) return false;
            }
            const R = C.ECONOMY.buildRadius;
            for (const e of this.entities.values()) {
                if (e.kind !== 'building' || e.team !== team || e.dead) continue;
                const o = C.BUILDINGS[e.type];
                const dx = Math.max(e.tx - (tx + b.w - 1), tx - (e.tx + o.w - 1), 0), dz = Math.max(e.tz - (tz + b.d - 1), tz - (e.tz + o.d - 1), 0);
                if (Math.max(dx, dz) <= R) return true;
            }
            return false;
        }
        command(team, c) {
            const T = this.teams[team]; if (!T || !c) return false;
            const own = (ids) => (ids || []).map((i) => this.entities.get(i)).filter((e) => e && e.team === team && e.kind === 'unit' && !e.dead);
            switch (c.type) {
                case 'move': case 'attackMove': {
                    const us = own(c.ids); if (!us.length) return false;
                    const n = us.length, cols = Math.ceil(Math.sqrt(n));
                    us.forEach((e, i) => { e.goal = { x: c.x + ((i % cols) - (cols - 1) / 2) * 0.9, z: c.z + (Math.floor(i / cols) - (cols - 1) / 2) * 0.9 }; e.state = 'move'; e.amove = c.type === 'attackMove'; e.targetId = null; e.harv = null; });
                    return true;
                }
                case 'attack': { const t = this.entities.get(c.targetId); const us = own(c.ids); if (!t || t.team === team || !us.length) return false; us.forEach((e) => { e.state = 'attack'; e.targetId = t.id; e.harv = null; }); return true; }
                case 'stop': own(c.ids).forEach((e) => { e.state = 'idle'; e.goal = null; e.targetId = null; }); return true;
                case 'harvest': { const us = own(c.ids).filter((e) => e.type === 'harvester'); if (!us.length) return false; us.forEach((e) => { e.harv = { tx: c.tx, tz: c.tz }; e.state = 'harvest'; e.goal = { x: c.tx + 0.5, z: c.tz + 0.5 }; }); return true; }
                case 'queue': {
                    const opt = this.options(team).find((o) => o.type === c.item); if (!opt || opt.locked) return false;
                    const q = T.queues[opt.cat];
                    if (opt.cat === 'building' && (q.length || T.ready)) return false;
                    if (q.length >= C.ECONOMY.queueMax) return false;
                    q.push({ type: c.item, progress: 0, paid: 0 }); return true;
                }
                case 'cancel': {
                    for (const cat of ['building', 'infantry', 'vehicle']) {
                        const q = T.queues[cat];
                        for (let i = q.length - 1; i >= 0; i--) if (q[i].type === c.item) { T.credits += q[i].paid; q.splice(i, 1); return true; }
                    }
                    if (T.ready === c.item) { T.ready = null; T.credits += C.BUILDINGS[c.item].cost; return true; }
                    return false;
                }
                case 'place': {
                    if (T.ready !== c.item || !this.canPlace(team, c.item, c.tx, c.tz)) return false;
                    const e = this.addBuilding(team, c.item, c.tx, c.tz, 0); T.ready = null;
                    this.events.push({ type: 'placed', id: e.id, team, what: c.item });
                    if (C.BUILDINGS[c.item].freeUnit) this.addUnit(team, C.BUILDINGS[c.item].freeUnit, e.x, e.tz + C.BUILDINGS[c.item].d + 0.5);
                    this.computePower(); return true;
                }
                case 'sell': {
                    const e = this.entities.get(c.id); if (!e || e.team !== team || e.kind !== 'building' || e.type === 'core' && false) return false;
                    T.credits += Math.round(C.BUILDINGS[e.type].cost * C.ECONOMY.sellRefund); this.kill(e, true); return true;
                }
                case 'rally': T.rally[c.cat] = { x: c.x, z: c.z }; return true;
            }
            return false;
        }
        drainEvents() { const ev = this.events; this.events = []; return ev; }
        kill(e, sold) {
            if (e.dead) return; e.dead = true; e.hp = 0;
            this.events.push({ type: 'death', id: e.id, team: e.team, kind: e.kind, what: e.type, x: e.x, z: e.z, sold: !!sold });
            const st = this.teams[e.team].stats, en = this.teams[1 - e.team].stats;
            if (e.kind === 'unit') { st.unitsLost++; en.kills++; } else { st.buildingsLost++; if (!sold) en.buildingsDestroyed++; }
            if (e.type === 'harvester') this.events.push({ type: 'alert', team: e.team, text: 'Harvester lost', x: e.x, z: e.z });
        }
        weaponOf(e) { return e.kind === 'unit' ? C.UNITS[e.type].weapon : C.BUILDINGS[e.type].weapon; }
        fire(e, t) {
            const wn = this.weaponOf(e), w = C.WEAPONS[wn];
            e.firing = 0; e.cd = w.cooldown;
            const dist = Math.hypot(t.x - e.x, t.z - e.z);
            this.events.push({ type: 'shot', from: e.id, team: e.team, x: e.x, z: e.z, tx: t.x, tz: t.z, weapon: wn, dur: w.speed ? dist / w.speed : 0 });
            this.pending.push({ at: this.time + (w.speed ? dist / w.speed : 0.02), x: t.x, z: t.z, target: t.id, weapon: wn, team: e.team });
        }
        hit(p) {
            const w = C.WEAPONS[p.weapon];
            this.events.push({ type: 'impact', x: p.x, z: p.z, weapon: p.weapon, splash: w.splash });
            const dmg = (t, f) => {
                const arm = t.kind === 'unit' ? C.UNITS[t.type].armor : 'bld';
                t.hp -= w.damage * w.vs[arm] * f;
                if (t.kind === 'building' && t.team === this.playerTeam && this.time - this.teams[t.team].lastAttackAlert > 12) {
                    this.teams[t.team].lastAttackAlert = this.time; this.events.push({ type: 'alert', team: t.team, text: 'Base under attack', x: t.x, z: t.z });
                }
                if (t.hp <= 0) this.kill(t);
            };
            const t = this.entities.get(p.target);
            if (t && !t.dead) dmg(t, 1);
            if (w.splash) for (const o of this.entities.values()) if (o !== t && !o.dead && o.team !== p.team && Math.hypot(o.x - p.x, o.z - p.z) < w.splash) dmg(o, 0.5);
        }
        nearestEnemy(e, range) {
            let best = null, bd = range;
            for (const o of this.entities.values()) {
                if (o.team === e.team || o.dead) continue;
                const d = Math.hypot(o.x - e.x, o.z - e.z) - (o.kind === 'building' ? 1 : 0);
                if (d < bd && this.visible(e.team, o.x, o.z)) { bd = d; best = o; }
            }
            return best;
        }
        moveToward(e, gx, gz, dt) {
            const u = C.UNITS[e.type]; const dx = gx - e.x, dz = gz - e.z, d = Math.hypot(dx, dz);
            if (d < 0.08) return true;
            const want = Math.atan2(dz, dx);
            let da = want - e.angle; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
            e.angle += Math.max(-u.turn * dt, Math.min(u.turn * dt, da));
            if (Math.abs(da) < 1.2) {
                const step = Math.min(d, u.speed * dt);
                const nx = e.x + Math.cos(e.angle) * step, nz = e.z + Math.sin(e.angle) * step;
                if (this.passable(Math.floor(nx), Math.floor(nz)) || !this.passable(Math.floor(e.x), Math.floor(e.z))) { e.x = nx; e.z = nz; }
                else { const side = e.angle + Math.PI / 2; const sx = e.x + Math.cos(side) * step, sz = e.z + Math.sin(side) * step; if (this.passable(Math.floor(sx), Math.floor(sz))) { e.x = sx; e.z = sz; } }
            }
            return false;
        }
        tick(dt) {
            this.time += dt;
            for (const e of this.entities.values()) { e.prevX = e.x; e.prevZ = e.z; }
            for (const [id, e] of this.entities) if (e.dead) { if (e.kind === 'building') { const b = C.BUILDINGS[e.type]; for (let z = e.tz; z < e.tz + b.d; z++) for (let x = e.tx; x < e.tx + b.w; x++) if (this.inb(x, z) && this.occ[this.idx(x, z)] === id) this.occ[this.idx(x, z)] = 0; } this.entities.delete(id); this.computePower(); }
            this.pending = this.pending.filter((p) => { if (p.at <= this.time) { this.hit(p); return false; } return true; });
            for (const e of this.entities.values()) {
                if (e.dead) continue;
                e.firing += dt; e.cd -= dt;
                if (e.kind === 'building') {
                    if (e.built < 1) e.built = Math.min(1, e.built + dt / 2.5);
                    if (e.type === 'turret' && e.built >= 1 && !this.teams[e.team].lowPower) {
                        const t = this.nearestEnemy(e, C.WEAPONS.turretGun.range);
                        if (t) { e.turret = Math.atan2(t.z - e.z, t.x - e.x); if (e.cd <= 0) this.fire(e, t); }
                    }
                    continue;
                }
                const u = C.UNITS[e.type], w = u.weapon && C.WEAPONS[u.weapon];
                if (e.type === 'harvester') { this.harvester(e, dt); continue; }
                let target = e.targetId && this.entities.get(e.targetId);
                if (target && target.dead) target = null;
                if (!target && w && (e.state === 'idle' || e.amove)) { target = this.nearestEnemy(e, e.amove ? u.sight : w.range); if (target) e.targetId = target.id; }
                if (target && w) {
                    const d = Math.hypot(target.x - e.x, target.z - e.z) - (target.kind === 'building' ? 1 : 0);
                    const ang = Math.atan2(target.z - e.z, target.x - e.x);
                    e.turret = ang;
                    if (d <= w.range) { if (!u.turret) e.angle = ang; e.state = 'attack'; if (e.cd <= 0) this.fire(e, target); }
                    else if (e.state === 'attack' || e.amove) { this.moveToward(e, target.x, target.z, dt); }
                    continue;
                }
                e.targetId = null;
                if (e.state === 'attack') e.state = e.goal ? 'move' : 'idle';
                if (e.goal) { if (this.moveToward(e, e.goal.x, e.goal.z, dt)) { e.goal = null; e.state = 'idle'; e.amove = false; } }
                e.turret = e.angle;
            }
            this.produce(dt);
            if (Math.floor(this.time / 0.25) !== Math.floor((this.time - dt) / 0.25)) this.updateVis();
            this.regrow(dt);
            this.mockAI(dt);
            for (const t of this.teams) {
                if (t.defeated) continue;
                let any = false; for (const e of this.entities.values()) if (e.team === t.id && e.kind === 'building' && !e.dead) { any = true; break; }
                if (!any) { t.defeated = true; this.winner = 1 - t.id; this.events.push({ type: 'gameover', winner: this.winner }); }
            }
        }
        harvester(e, dt) {
            const u = C.UNITS.harvester, N = this.size;
            if (e.state === 'idle' && !e.harv) { e.harv = this.nearestShard(e.x, e.z); if (e.harv) e.state = 'harvest'; }
            if (e.state === 'move') { if (e.goal && this.moveToward(e, e.goal.x, e.goal.z, dt)) { e.goal = null; e.state = 'idle'; } return; }
            if (e.state === 'harvest' && e.harv) {
                const i = e.harv.tz * N + e.harv.tx;
                if (this.map.shards[i] <= 0) { e.harv = this.nearestShard(e.x, e.z); if (!e.harv) e.state = 'idle'; return; }
                if (this.moveToward(e, e.harv.tx + 0.5, e.harv.tz + 0.5, dt) || Math.hypot(e.harv.tx + 0.5 - e.x, e.harv.tz + 0.5 - e.z) < 0.5) {
                    if (!e.mining) { e.mining = true; this.events.push({ type: 'harvest', id: e.id }); }
                    const take = Math.min(u.harvestRate * dt, this.map.shards[i], u.capacity - e.carry);
                    this.map.shards[i] -= take; e.carry += take;
                    if (this.map.shards[i] <= 0) { this.map.shards[i] = 0; this.map.tiles[i] = 0; }
                    if (e.carry >= u.capacity - 0.01) { e.state = 'return'; e.mining = false; }
                }
                return;
            }
            if (e.state === 'return' || e.state === 'unload') {
                let ref = null, bd = 1e9;
                for (const o of this.entities.values()) if (o.team === e.team && o.type === 'refinery' && !o.dead) { const d = Math.hypot(o.x - e.x, o.z - e.z); if (d < bd) { bd = d; ref = o; } }
                if (!ref) { e.state = 'idle'; return; }
                const dock = { x: ref.x, z: ref.tz + 3.4 };
                if (e.state === 'return') { if (this.moveToward(e, dock.x, dock.z, dt)) e.state = 'unload'; return; }
                const amt = Math.min(e.carry, u.unloadRate * dt); e.carry -= amt;
                const T = this.teams[e.team]; T.credits += amt; T.stats.creditsHarvested += amt;
                if (e.carry <= 0) { e.carry = 0; e.state = 'harvest'; if (!e.harv || this.map.shards[e.harv.tz * N + e.harv.tx] <= 0) e.harv = this.nearestShard(e.x, e.z); }
            }
        }
        nearestShard(x, z) {
            const N = this.size; let best = null, bd = 1e9;
            for (let i = 0; i < N * N; i++) if (this.map.shards[i] > 5) { const tx = i % N, tz = (i / N) | 0; const d = Math.hypot(tx + 0.5 - x, tz + 0.5 - z); if (d < bd) { bd = d; best = { tx, tz }; } }
            return best;
        }
        regrow(dt) {
            const N = this.size;
            for (const sp of this.map.spires) for (let z = sp.tz - 2; z <= sp.tz + 2; z++) for (let x = sp.tx - 2; x <= sp.tx + 2; x++) {
                if (!this.inb(x, z)) continue; const i = z * N + x;
                if (this.map.tiles[i] === 1 || this.occ[i]) continue;
                this.map.shards[i] = Math.min(C.ECONOMY.shardPerTile, this.map.shards[i] + C.ECONOMY.shardRegrow * dt);
                if (this.map.shards[i] > 20) this.map.tiles[i] = 2;
            }
        }
        produce(dt) {
            for (const T of this.teams) {
                const slow = T.lowPower ? C.ECONOMY.lowPowerSlowdown : 1;
                for (const cat of ['building', 'infantry', 'vehicle']) {
                    const q = T.queues[cat]; if (!q.length) continue;
                    if (cat === 'building' && T.ready) continue;
                    const it = q[0], def = cat === 'building' ? C.BUILDINGS[it.type] : C.UNITS[it.type];
                    let dp = dt / def.time * slow * 3; // the mock builds 3× faster to make testing quicker
                    const cost = def.cost * dp;
                    if (T.credits < cost) { if (!T.noCash) { T.noCash = true; this.events.push({ type: 'alert', team: T.id, text: 'Not enough credits' }); } continue; }
                    T.noCash = false; T.credits -= cost; it.paid += cost; it.progress = Math.min(1, it.progress + dp);
                    if (it.progress >= 1) {
                        q.shift();
                        this.events.push({ type: 'complete', team: T.id, what: it.type, cat });
                        if (cat === 'building') {
                            T.ready = it.type;
                            if (T.ai) { this.aiPlace(T.id, it.type); }
                        } else {
                            const src = [...this.entities.values()].find((e) => e.team === T.id && e.type === (cat === 'infantry' ? 'barracks' : 'factory') && !e.dead);
                            if (!src) continue;
                            const b = C.BUILDINGS[src.type];
                            const u = this.addUnit(T.id, it.type, src.x, src.tz + b.d + 0.4);
                            const r = T.rally[cat]; if (r) { u.goal = { x: r.x, z: r.z }; u.state = 'move'; }
                        }
                    }
                }
            }
        }
        aiPlace(team, type) {
            const s = this.map.starts[team];
            for (let k = 0; k < 200; k++) { const tx = s.tx - 6 + Math.floor(this.rand() * 12), tz = s.tz - 6 + Math.floor(this.rand() * 12); if (this.command(team, { type: 'place', item: type, tx, tz })) return; }
            this.teams[team].ready = null;
        }
        mockAI(dt) {
            const T = this.teams[1]; if (T.defeated) return;
            if (T.queues.infantry.length < 2) this.command(1, { type: 'queue', item: this.rand() < 0.6 ? 'rifleman' : 'rocketeer' });
            if (T.queues.vehicle.length < 1) this.command(1, { type: 'queue', item: this.rand() < 0.6 ? 'tank' : 'buggy' });
            this.aiTimer -= dt;
            if (this.aiTimer <= 0) {
                this.aiTimer = 40;
                const ids = [...this.entities.values()].filter((e) => e.team === 1 && e.kind === 'unit' && e.type !== 'harvester').map((e) => e.id);
                const s = this.map.starts[0];
                this.command(1, { type: 'attackMove', ids, x: s.tx + 1.5, z: s.tz + 1.5 });
            }
        }
        updateVis() {
            const N = this.size;
            for (const T of this.teams) { const v = T.vis; for (let i = 0; i < v.length; i++) if (v[i] === 2) v[i] = 1; }
            for (const e of this.entities.values()) {
                if (e.dead) continue;
                const v = this.teams[e.team].vis;
                const sight = e.kind === 'unit' ? C.UNITS[e.type].sight : C.BUILDINGS[e.type].sight + 1;
                const r = Math.ceil(sight), cx = Math.floor(e.x), cz = Math.floor(e.z);
                for (let z = cz - r; z <= cz + r; z++) for (let x = cx - r; x <= cx + r; x++) {
                    if (x < 0 || z < 0 || x >= N || z >= N) continue;
                    if ((x + 0.5 - e.x) ** 2 + (z + 0.5 - e.z) ** 2 <= sight * sight) v[z * N + x] = 2;
                }
            }
        }
        update(dt) {
            if (this.winner !== null && this.time > 0 && this.stopped) return;
            const TICK = C.TICK;
            this.acc += Math.min(dt, TICK * 10);
            let n = 0;
            while (this.acc >= TICK && n < 10) { this.tick(TICK); this.acc -= TICK; n++; }
            this.alpha = this.acc / TICK;
        }
    }
    SF.Sim = Sim;
})();
