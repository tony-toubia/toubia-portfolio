// Shardfall: the computer player. Plays any team through sim.command() — the same API as the human — and only
// uses what its team can see (plus the enemy start position, which every player knows).
(function () {
    'use strict';
    const SF = window.SF = window.SF || {};

    // [type, how many we want] in priority order; the first unmet step is built next, so lost buildings are rebuilt.
    // (The computer doesn't need the minimap, so the radar only comes when the tech lab needs it.)
    const PLANS = {
        easy: [['reactor', 1], ['refinery', 1], ['barracks', 1], ['reactor', 2], ['factory', 1], ['turret', 1], ['radar', 1],
            ['reactor', 3], ['techlab', 1], ['turret', 2]],
        normal: [['reactor', 1], ['refinery', 1], ['barracks', 1], ['reactor', 2], ['factory', 1], ['turret', 1], ['refinery', 2],
            ['reactor', 3], ['radar', 1], ['turret', 2], ['techlab', 1], ['reactor', 4]],
        hard: [['reactor', 1], ['refinery', 1], ['barracks', 1], ['reactor', 2], ['factory', 1], ['refinery', 2], ['turret', 1],
            ['reactor', 3], ['radar', 1], ['techlab', 1], ['turret', 2], ['reactor', 4]],
    };
    // harvesters per refinery, and the cap
    const HARV = { easy: [1.5, 2], normal: [1.5, 3], hard: [2, 4] };
    const ARMY_CAP = { easy: 22, normal: 34, hard: 44 };
    // Each computer player picks a style per game, so matches play out differently:
    //   balanced: the plan as written; rush: fewer turrets, tech last, earlier and more frequent (smaller) waves,
    //   infantry-heavy; armor: tech lab early, tank/artillery-heavy, bigger and later waves.
    const STYLES = {
        balanced: { first: 0, every: 1, need: 1, rocket: 0.6, infQ: 1, vehQ: 1 },
        rush: { first: -35, every: 0.8, need: 0.8, rocket: 0.4, infQ: 2, vehQ: 1 },
        armor: { first: 25, every: 1.1, need: 1.15, rocket: 0.6, infQ: 1, vehQ: 2 },
    };
    function stylePlan(plan, style) {
        let p = plan.map((s) => s.slice());
        if (style === 'rush') {
            const i = p.findIndex((s) => s[0] === 'turret');
            if (i >= 0) p.splice(i, 1);
            p = p.map((s) => (s[0] === 'turret' ? [s[0], Math.max(1, s[1] - 1)] : s));
            const tech = p.filter((s) => s[0] === 'radar' || s[0] === 'techlab');
            p = p.filter((s) => s[0] !== 'radar' && s[0] !== 'techlab').concat(tech);
        } else if (style === 'armor') {
            const r = p.findIndex((s) => s[0] === 'radar'), t = p.findIndex((s) => s[0] === 'techlab');
            if (t > r + 1) { const [tl] = p.splice(t, 1); p.splice(r + 1, 0, tl); }
        }
        return p;
    }

    class AI {
        constructor(sim, team, difficulty) {
            this.sim = sim; this.team = team; this.enemy = 1 - team;
            this.diff = window.SF_CONFIG.AI[difficulty] ? difficulty : 'normal';
            this.cfg = window.SF_CONFIG.AI[this.diff];
            this.rng = SF.rng((sim.seed * 31 + team * 1013 + 7) >>> 0);
            const names = Object.keys(STYLES);
            this.style = (sim.aiStyles && sim.aiStyles[team]) || names[Math.floor(this.rng() * names.length)];
            this.st = STYLES[this.style] || STYLES.balanced;
            this.plan = stylePlan(PLANS[this.diff], this.style);
            this.t = 0; this.next = 0.25 + team * 0.25;
            this.readyAt = null;
            this.nextWave = this.cfg.firstWave + this.st.first; this.waveNo = 0;
            this.wave = new Set(); this.waveTarget = null; this.waveIssued = -99; this.lastThreat = undefined;
            this.known = new Map();
            this.skip = {};
            this.log = [];                 // build order: [time, type]
            this.peakArmy = 0; this.waves = [];
            const me = sim.map.starts[team], en = sim.map.starts[this.enemy];
            this.base = { x: me.tx + 1.5, z: me.tz + 1.5 };
            this.enemyStart = { x: en.tx + 1.5, z: en.tz + 1.5 };
            const dx = this.enemyStart.x - this.base.x, dz = this.enemyStart.z - this.base.z, dl = Math.hypot(dx, dz);
            this.fwd = { x: dx / dl, z: dz / dl };
            this.staging = sim._freePoint(this.base.x + this.fwd.x * 13, this.base.z + this.fwd.z * 13);
            this.defendUntil = 0; this.lastDefend = -99; this.lastStage = -99;
            this.scoutIdx = 0;
            this._reach = { ver: -1, count: 0 };
        }

        update(dt) {
            this.t += dt;
            if (this.t < this.next) return;
            this.next = this.t + 0.5;
            const tm = this.sim.teams[this.team];
            if (tm.defeated || this.sim.winner !== null) return;
            this.scan();
            this.economy(tm);
            this.placement(tm);
            this.military(tm);
        }

        // ---------- what do we have, what can we see ----------
        scan() {
            const sim = this.sim, me = this.team;
            const counts = {}, army = [], harvs = [], blds = [];
            const threats = [], enemyHarv = [];
            for (const e of sim.entities.values()) {
                if (e.dead) continue;
                if (e.team === me) {
                    counts[e.type] = (counts[e.type] || 0) + 1;
                    if (e.kind === 'building') blds.push(e);
                    else if (e.type === 'harvester') harvs.push(e);
                    else army.push(e);
                } else if (e.kind === 'building') {
                    if (sim.isVisible(me, e)) this.known.set(e.id, { id: e.id, x: e.x, z: e.z, type: e.type });
                } else if (sim.isVisible(me, e)) {
                    threats.push(e);
                    if (e.type === 'harvester') enemyHarv.push(e);
                    if (e.type === 'artillery') this.sawArtillery = sim.time;
                }
            }
            for (const [id, k] of this.known) {
                const e = sim.entities.get(id);
                if ((!e || e.dead) && sim.visible(me, k.x, k.z)) this.known.delete(id);
                else if (!e) { /* out of sight: keep the memory */ }
            }
            // enemies near our base or our harvesters
            let threat = null, td = Infinity, tn = 0;
            for (const e of threats) {
                let near = Infinity;
                for (const b of blds) near = Math.min(near, Math.hypot(b.x - e.x, b.z - e.z));
                for (const h of harvs) near = Math.min(near, Math.hypot(h.x - e.x, h.z - e.z) + 3);
                if (near < 11) { tn++; const d = Math.hypot(e.x - this.base.x, e.z - this.base.z); if (d < td) { td = d; threat = e; } }
            }
            // something shooting at us from the dark (artillery): the guns give its position away
            if (!threat) {
                for (const b of blds.concat(harvs)) {
                    if (sim.time - b._hitT < 2 && b._hitBy) {
                        const a = sim.entities.get(b._hitBy);
                        if (a && !a.dead && a.kind === 'unit') { threat = { x: a.x, z: a.z }; tn = 1; break; }
                    }
                }
            }
            this.counts = counts; this.army = army; this.harvs = harvs; this.blds = blds;
            this.threat = threat; this.threatN = tn; this.enemyHarv = enemyHarv;
            this.peakArmy = Math.max(this.peakArmy, army.length);
        }

        queued(tm, type) {
            let n = 0;
            for (const cat in tm.queues) for (const it of tm.queues[cat]) if (it.type === type) n++;
            if (tm.ready === type) n++;
            return n;
        }

        // ---------- production ----------
        economy(tm) {
            const sim = this.sim, B = window.SF_CONFIG.BUILDINGS, U = window.SF_CONFIG.UNITS, c = this.counts;
            const cmd = (item) => sim.command(this.team, { type: 'queue', item });
            // harvesters first
            const refs = c.refinery || 0;
            const [per, cap] = HARV[this.diff];
            const wantH = refs ? Math.min(cap, Math.floor(refs * per + 0.5)) : 0;
            const haveH = (c.harvester || 0) + this.queued(tm, 'harvester');
            const vq = tm.queues.vehicle;
            if (c.factory && haveH < wantH && vq.length < 2 && !vq.some((it) => it.type === 'harvester')) {
                cmd('harvester');
            }
            // next building
            let nextB = null;
            if (c.core && !tm.ready && tm.queues.building.length === 0) {
                nextB = this.nextBuilding(tm);
                if (nextB && cmd(nextB)) this.log.push([Math.round(sim.time), nextB]);
            }
            // no refinery left: everything goes into getting one back (sell what we can spare if broke)
            if (!refs) {
                if (!c.harvester && tm.credits + this.spareValue() >= 0 && tm.credits < B.refinery.cost && this.t - (this.lastSell || -99) > 3) this.sellSpare();
                if (sim.time > 30) return;
            }
            // army (keep the queues short so credits flow where they're needed)
            const pendingB = tm.queues.building.length > 0 || tm.ready;
            const ecoReady = c.factory && haveH >= wantH;
            const reserve = ecoReady ? (pendingB ? 200 : 0) : (pendingB ? 700 : 300);
            if (tm.credits < reserve || this.army.length >= ARMY_CAP[this.diff]) return;
            const inf = this.army.filter((u) => U[u.type].from === 'infantry');
            const veh = this.army.filter((u) => U[u.type].from === 'vehicle');
            const rich = tm.credits > 1500 ? 1 : 0;
            // enemy artillery shreds infantry: lean on vehicles once we've seen it
            const artThreat = c.factory && sim.time - (this.sawArtillery || -999) < 180 && inf.length > 0.3 * (this.army.length + 1);
            if (c.barracks && !artThreat && tm.queues.infantry.length < this.st.infQ + rich) {
                const rockets = inf.filter((u) => u.type === 'rocketeer').length;
                const wantRocket = c.factory ? this.st.rocket : 0.3;
                cmd(rockets < (inf.length + 1) * wantRocket ? 'rocketeer' : 'rifleman');
            }
            if (c.factory && vq.length < this.st.vehQ + rich && haveH >= wantH) {
                const n = veh.length + 1;
                const tanks = veh.filter((u) => u.type === 'tank').length;
                const arts = veh.filter((u) => u.type === 'artillery').length;
                const bugs = veh.filter((u) => u.type === 'buggy').length;
                let pick = 'tank';
                if (c.techlab && arts < n * 0.25) pick = 'artillery';
                else if (bugs < n * 0.15 && tanks >= 1) pick = 'buggy';
                cmd(pick);
            }
        }
        spareValue() {
            const B = window.SF_CONFIG.BUILDINGS, f = window.SF_CONFIG.ECONOMY.sellRefund;
            let v = 0;
            for (const b of this.blds) if (b.type === 'techlab' || b.type === 'radar' || b.type === 'turret') v += B[b.type].cost * f * b.hp / b.maxHp;
            return v;
        }
        sellSpare() {
            const order = ['techlab', 'radar', 'turret'];
            for (const type of order) {
                const b = this.blds.find((e) => e.type === type && !e.dead);
                if (b) { this.sim.command(this.team, { type: 'sell', id: b.id }); this.lastSell = this.t; return; }
            }
        }
        nextBuilding(tm) {
            const B = window.SF_CONFIG.BUILDINGS, c = this.counts;
            let pick = null;
            for (const [type, n] of this.plan) {
                if ((this.skip[type] || 0) > this.t) continue;
                if ((c[type] || 0) < n) { pick = type; break; }
            }
            if (!pick) return null;
            const p = tm.power, use = Math.max(0, -(B[pick].power || 0));
            if (pick !== 'reactor' && (tm.lowPower || p.made - p.used - use < 0)) pick = 'reactor';
            return pick;
        }

        // ---------- placing buildings ----------
        placement(tm) {
            if (!tm.ready) { this.readyAt = null; return; }
            if (this.readyAt === null) { this.readyAt = this.t + this.cfg.buildDelay; return; }
            if (this.t < this.readyAt) return;
            const type = tm.ready;
            const spot = this.findSpot(type);
            if (spot && this.sim.command(this.team, { type: 'place', item: type, tx: spot.tx, tz: spot.tz })) {
                this.readyAt = null;
                return;
            }
            this.sim.command(this.team, { type: 'cancel', item: type });
            this.skip[type] = this.t + 30;
            this.readyAt = null;
        }
        reachCount(exclude) {
            // passable tiles reachable from next to our core (optionally pretending a footprint is blocked)
            const sim = this.sim, w = sim.map.w, h = sim.map.h, block = sim.block;
            const P = sim.path, q = P.q, mark = P.mark;
            const cur = ++P.markCur;
            let s = sim._nearestFreeTile(this.base.x | 0, (this.base.z | 0) + 2, 6);
            if (s < 0) return 0;
            const ex = (i) => exclude && (i % w) >= exclude.tx && (i % w) < exclude.tx + exclude.w && ((i / w) | 0) >= exclude.tz && ((i / w) | 0) < exclude.tz + exclude.d;
            if (ex(s)) return -1;
            let qh = 0, qt = 0; q[qt++] = s; mark[s] = cur;
            while (qh < qt) {
                const i = q[qh++], x = i % w, z = (i / w) | 0;
                if (x > 0) { const j = i - 1; if (mark[j] !== cur && !block[j] && !ex(j)) { mark[j] = cur; q[qt++] = j; } }
                if (x < w - 1) { const j = i + 1; if (mark[j] !== cur && !block[j] && !ex(j)) { mark[j] = cur; q[qt++] = j; } }
                if (z > 0) { const j = i - w; if (mark[j] !== cur && !block[j] && !ex(j)) { mark[j] = cur; q[qt++] = j; } }
                if (z < h - 1) { const j = i + w; if (mark[j] !== cur && !block[j] && !ex(j)) { mark[j] = cur; q[qt++] = j; } }
            }
            return qt;
        }
        findSpot(type) {
            const sim = this.sim, C = window.SF_CONFIG, def = C.BUILDINGS[type], w = sim.map.w, h = sim.map.h;
            const R = C.ECONOMY.buildRadius;
            const mine = this.blds.filter((b) => !b.dead);
            if (!mine.length) return null;
            let x0 = w, z0 = h, x1 = 0, z1 = 0;
            for (const b of mine) { x0 = Math.min(x0, b.tx); z0 = Math.min(z0, b.tz); x1 = Math.max(x1, b.tx + b.w); z1 = Math.max(z1, b.tz + b.d); }
            x0 = Math.max(0, x0 - R - def.w); z0 = Math.max(0, z0 - R - def.d); x1 = Math.min(w - def.w, x1 + R); z1 = Math.min(h - def.d, z1 + R);
            const exitRow = type === 'refinery' || type === 'factory' || type === 'barracks';
            const turrets = mine.filter((b) => b.type === 'turret');
            const sh = sim.map.shards;
            // shard tiles we know about near the base, for refineries (the dock should sit right by a field)
            const shardPts = [];
            if (type === 'refinery') {
                const vis = sim.teams[this.team].vis;
                for (let i = 0; i < sh.length; i++) {
                    if (sh[i] <= 0 || !vis[i]) continue;
                    const fx = (i % w) + 0.5, fz = ((i / w) | 0) + 0.5;
                    if (Math.hypot(fx - this.base.x, fz - this.base.z) > 26) continue;
                    let served = false;
                    for (const b of mine) if (b.type === 'refinery' && Math.hypot(b.x - fx, b.z - fz) < 8) served = true;
                    shardPts.push({ x: fx, z: fz, pen: served ? 10 : 0 });
                }
            }
            const cands = [];
            for (let tz = z0; tz <= z1; tz++) for (let tx = x0; tx <= x1; tx++) {
                if (!sim.canPlace(this.team, type, tx, tz)) continue;
                // keep a one-tile lane around every building and away from shards
                let ok = true;
                for (let z = tz - 1; z <= tz + def.d && ok; z++) for (let x = tx - 1; x <= tx + def.w; x++) {
                    if (x < 0 || z < 0 || x >= w || z >= h) continue;
                    const i = z * w + x;
                    if (sim.block[i] === 3 || sh[i] > 0) { ok = false; break; }
                }
                if (!ok) continue;
                if (exitRow) {
                    // the exit / dock (south) side must be open, two tiles deep in the middle
                    const a = sim.frontTile(this.team, type, tx, tz, 0), b2 = sim.frontTile(this.team, type, tx, tz, 1);
                    if (!sim.passable(a.tx, a.tz) || !sim.passable(b2.tx, b2.tz)) continue;
                }
                // don't sit on anyone's exit lane (the two tiles below the middle of a producer's south side)
                let blocksExit = false;
                for (const b of mine) {
                    if (b.type !== 'refinery' && b.type !== 'factory' && b.type !== 'barracks') continue;
                    for (let k = 0; k < 3; k++) {
                        const e = sim.frontTile(this.team, b.type, b.tx, b.tz, k);
                        if (e.tx >= tx - 1 && e.tx <= tx + def.w && e.tz >= tz && e.tz < tz + def.d) blocksExit = true;
                    }
                }
                if (blocksExit) continue;
                const cx = tx + def.w / 2, cz = tz + def.d / 2;
                const dx = cx - this.base.x, dz = cz - this.base.z;
                const dCore = Math.hypot(dx, dz);
                const fwd = dx * this.fwd.x + dz * this.fwd.z;
                const lat = Math.abs(-dx * this.fwd.z + dz * this.fwd.x);
                let score;
                if (type === 'turret') {
                    score = -fwd * 1.2 + lat * 0.25 + Math.max(0, dCore - 11) * 3 + Math.max(0, 5 - dCore) * 2;
                    for (const t of turrets) { const d = Math.hypot(t.x - cx, t.z - cz); if (d < 4) score += (4 - d) * 3; }
                } else if (type === 'refinery' && shardPts.length) {
                    const dk = sim.frontTile(this.team, type, tx, tz, 0), dkx = dk.tx + 0.5, dkz = dk.tz + 0.5;
                    let df = Infinity;
                    for (const p of shardPts) df = Math.min(df, Math.hypot(p.x - dkx, p.z - dkz) + p.pen);
                    score = Math.max(0, df - 1.5) * 1.5 + dCore * 0.15;
                } else if (type === 'factory' || type === 'barracks') {
                    score = dCore + fwd * 0.05;
                } else {
                    score = dCore + fwd * 0.35;
                }
                score += this.rng() * 0.3;
                cands.push({ tx, tz, score });
            }
            cands.sort((a, b) => a.score - b.score);
            // must not cut off any part of the map we can currently reach
            if (this._reach.ver !== sim.gridVersion) this._reach = { ver: sim.gridVersion, count: this.reachCount(null) };
            const base = this._reach.count;
            for (let k = 0; k < Math.min(12, cands.length); k++) {
                const c = cands[k];
                const n = this.reachCount({ tx: c.tx, tz: c.tz, w: def.w, d: def.d });
                if (n >= base - def.w * def.d) return c;
            }
            return null;
        }

        // ---------- army ----------
        // The most valuable known enemy building, weighed against how far it is (from the wave, or our base).
        pickTarget(from) {
            from = from || this.base;
            const VALUE = { core: 14, factory: 10, refinery: 9, barracks: 6, reactor: 5, techlab: 5, radar: 4, turret: -2 };
            let best = null, bs = Infinity;
            for (const k of this.known.values()) {
                const sc = Math.hypot(k.x - from.x, k.z - from.z) - (VALUE[k.type] || 0);
                if (sc < bs) { bs = sc; best = k; }
            }
            if (best) return { x: best.x, z: best.z };
            const sim = this.sim;
            if (!sim.visible(this.team, this.enemyStart.x, this.enemyStart.z)) return { x: this.enemyStart.x, z: this.enemyStart.z };
            // nothing known: sweep the shard fields, then the map
            const f = sim.map.fields;
            const p = f[this.scoutIdx++ % f.length];
            return { x: p.x, z: p.z };
        }
        waveCentroid() {
            let x = 0, z = 0, n = 0;
            for (const id of this.wave) { const u = this.sim.entities.get(id); if (u) { x += u.x; z += u.z; n++; } }
            return n ? { x: x / n, z: z / n } : null;
        }
        launch(units, reason) {
            const sim = this.sim, t = this.t;
            const target = this.pickTarget();
            sim.command(this.team, { type: 'attackMove', ids: units.map((u) => u.id), x: target.x, z: target.z });
            for (const u of units) this.wave.add(u.id);
            this.waveTarget = target; this.waveIssued = t;
            this.waves.push({ t: Math.round(sim.time), size: units.length, why: reason });
            this.waveNo++;
            this.nextWave = t + this.cfg.waveEvery * this.st.every * this.late() * (0.85 + 0.3 * this.rng());
        }
        // Past the twelve-minute mark the computer gets impatient: smaller, more frequent waves.
        late() { return this.sim.time > 720 ? 0.6 : 1; }
        military(tm) {
            const sim = this.sim, t = this.t;
            for (const id of this.wave) { const e = sim.entities.get(id); if (!e || e.dead) this.wave.delete(id); }
            const home = this.army.filter((u) => !this.wave.has(u.id));
            const ids = (list) => list.map((u) => u.id);
            const easy = this.diff === 'easy';
            // defend
            if (this.threat) {
                this.defendUntil = t + 8;
                this.lastThreat = t;
                if (t - this.lastDefend > 2.5) {
                    this.lastDefend = t;
                    const near = this.army.filter((u) => this.wave.has(u.id) ? Math.hypot(u.x - this.base.x, u.z - this.base.z) < 22 : true);
                    const go = near.filter((u) => !(u.state === 'attack' && u.targetId));
                    if (go.length) sim.command(this.team, { type: 'attackMove', ids: ids(go), x: this.threat.x, z: this.threat.z });
                    for (const u of near) this.wave.delete(u.id);
                }
                return;
            }
            // regroup at the staging point
            if (t > this.defendUntil && t - this.lastStage > 6) {
                this.lastStage = t;
                const stray = home.filter((u) => !u._order && !u.targetId && Math.hypot(u.x - this.staging.x, u.z - this.staging.z) > 5);
                if (stray.length) sim.command(this.team, { type: 'move', ids: ids(stray), x: this.staging.x, z: this.staging.z });
            }
            // launch a wave on the timer, or counter-attack right after beating off an attack
            const cap = Math.min(22, Math.round(ARMY_CAP[this.diff] * 0.75));
            const need = Math.max(3, Math.round(Math.min(cap, this.cfg.waveSize + this.waveNo * this.cfg.waveGrowth) * this.st.need));
            const full = home.length >= ARMY_CAP[this.diff] * 0.85;
            const timer = full || t >= this.nextWave && (home.length >= need || (this.waveNo < 3 && t >= this.nextWave + 45 && home.length >= Math.max(3, Math.ceil(need * 0.6))));
            const counter = !easy && this.waveNo > 0 && this.lastThreat !== undefined && t - this.lastThreat > 4 && t - this.lastThreat < 15 &&
                this.wave.size === 0 && home.length >= Math.max(5, Math.ceil(need * 0.9)) && t - this.waveIssued > 40;
            if (timer || counter) { this.launch(home, timer ? 'timer' : 'counter'); return; }
            // reinforce a wave that is still fighting
            if (this.diff === 'hard' && this.wave.size >= 6 && home.length >= 8 && t - (this.lastReinforce || -99) > 12) {
                const c = this.waveCentroid();
                if (c) {
                    this.lastReinforce = t;
                    sim.command(this.team, { type: 'attackMove', ids: ids(home), x: c.x, z: c.z });
                    for (const u of home) this.wave.add(u.id);
                }
            }
            // artillery sieges: shell the nearest building we know about (turrets first) from outside its reach
            if (this.wave.size && this.known.size && t - (this.lastSiege || -99) > 2) {
                this.lastSiege = t;
                for (const id of this.wave) {
                    const u = sim.entities.get(id);
                    if (!u || u.type !== 'artillery' || u._order === 'attack') continue;
                    let best = null, bs = Infinity;
                    for (const k of this.known.values()) {
                        const e = sim.entities.get(k.id);
                        if (!e || e.dead) continue;
                        const d = Math.hypot(k.x - u.x, k.z - u.z) - (k.type === 'turret' ? 4 : 0);
                        if (d < bs) { bs = d; best = k; }
                    }
                    if (best && bs < 16) sim.command(this.team, { type: 'attack', ids: [u.id], targetId: best.id });
                }
            }
            // wave units that spot a harvester go for it (it hurts more than anything else)
            if (this.wave.size && this.enemyHarv.length) {
                const hunters = [];
                let prey = null;
                for (const id of this.wave) {
                    const u = sim.entities.get(id);
                    if (!u || u.targetId) continue;
                    for (const h of this.enemyHarv) if (Math.hypot(h.x - u.x, h.z - u.z) < 9) { hunters.push(u); prey = h; break; }
                }
                if (hunters.length && prey) sim.command(this.team, { type: 'attack', ids: ids(hunters), targetId: prey.id });
            }
            // keep the wave moving: wave units that are not fighting or attack-moving go for the next target
            if (this.wave.size && t - (this.lastNudge || -99) > 3) {
                this.lastNudge = t;
                const free = [];
                for (const id of this.wave) {
                    const u = sim.entities.get(id);
                    if (u && !u.targetId && u._order !== 'attackMove' && u._order !== 'attack') free.push(u);
                }
                if (free.length) {
                    const target = this.pickTarget(this.waveCentroid() || this.base);
                    sim.command(this.team, { type: 'attackMove', ids: ids(free), x: target.x, z: target.z });
                    this.waveTarget = target;
                }
            }
        }
    }

    SF.AI = AI;
    SF.AI.PLANS = PLANS;
    SF.AI.STYLES = STYLES;
})();
