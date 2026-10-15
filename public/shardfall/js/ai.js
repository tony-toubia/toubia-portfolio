// Shardfall: the computer player. Plays any team through sim.command() — the same API as the human — and only
// uses what its team can see (plus the enemy start position, which every player knows).
(function () {
    'use strict';
    const SF = window.SF = window.SF || {};

    // [type, how many we want] in priority order; the first unmet step is built next, so lost buildings are rebuilt.
    // (The computer doesn't need the minimap, so the radar only comes when the tech lab needs it.)
    // 'turret' stands for the faction's base defence (Gun Turret / Pulse Spire); the superweapon building is added
    // after the tech lab on hard, and in missions that allow it.
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
    // Late game the caps grow (from minute 10, up to +60% by minute 20) and waves may use the whole army, so two
    // turtled bases cannot hold each other off forever.
    const lateness = (t) => Math.min(1, Math.max(0, (t - 600) / 600));
    const armyCap = (diff, t) => Math.round(ARMY_CAP[diff] * (1 + 0.6 * lateness(t)));
    // Each computer player picks a style per game, so matches play out differently:
    //   balanced: the plan as written; rush: fewer turrets, tech last, earlier and more frequent (smaller) waves,
    //   fewer anti-armour troops; armor: tech lab early, tank/artillery-heavy, bigger and later waves.
    const STYLES = {
        balanced: { first: 0, every: 1, need: 1, rocket: 0.6, infQ: 1, vehQ: 1 },
        rush: { first: -20, every: 0.9, need: 0.95, rocket: 0.4, infQ: 1, vehQ: 1 },
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

    // Unit roles per faction: cheap infantry, anti-armour infantry, main battle vehicle, fast raider, tech unit.
    const ROLES = {
        vanguard: { inf: 'rifleman', at: 'rocketeer', main: 'tank', fast: 'buggy', tech: 'artillery' },
        hegemony: { inf: 'trooper', at: 'shocktrooper', main: 'lancer', fast: 'skimmer', tech: 'phantom' },
    };
    // Vehicle mix: share of tech units, share of fast units (at least fastMin, at most fastMax of them).
    const MIX = {
        vanguard: { tech: 0.25, fast: 0.15, fastMin: 0, fastMax: 99 },
        hegemony: { tech: 0.25, fast: 0.25, fastMin: 2, fastMax: 4 },
    };
    function factionPlan(plan, sim, team, diff) {
        const C = window.SF_CONFIG, tm = sim.teams[team];
        const F = (C.FACTIONS && C.FACTIONS[tm.faction]) || { defense: 'turret', superweapon: null };
        const p = plan.map(([t, n]) => [t === 'turret' ? F.defense : t, n]);
        const sw = F.superweapon;
        if (sw && C.BUILDINGS[sw] && sim.allowed(team, sw) && (diff === 'hard' || sim.mission)) {
            const i = p.findIndex((s) => s[0] === 'techlab');
            const reactors = p.filter((s) => s[0] === 'reactor').reduce((m, s) => Math.max(m, s[1]), 0);
            p.splice(i < 0 ? p.length : i + 1, 0, ['reactor', reactors + 1], [sw, 1]);
        }
        return p.filter(([t]) => sim.allowed(team, t));
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
            const tm = sim.teams[team];
            this.faction = ROLES[tm.faction] ? tm.faction : 'vanguard';
            this.roles = ROLES[this.faction];
            const F = window.SF_CONFIG.FACTIONS && window.SF_CONFIG.FACTIONS[this.faction];
            this.defense = F ? F.defense : 'turret';
            this.plan = factionPlan(stylePlan(PLANS[this.diff], this.style), sim, team, this.diff);
            this.passive = false;          // true: never sends attack waves (defends only), e.g. a survival mission
            this.raid = new Set(); this.raidStart = -99; this.lastRaid = -99; this.harvSeen = new Map();
            this.flank = new Map(); this.lastSuper = -99; this.superLog = [];
            this.seen = new Map();         // enemy units seen recently (id → armor class), to adapt the infantry mix
            this.t = 0; this.next = 0.25 + team * 0.25;
            this.readyAt = null;
            this.nextWave = this.cfg.firstWave + this.st.first; this.waveNo = 0;
            // missions can hold the first attack back (side.aiWaveDelay seconds)
            const md = sim.missionDef, sd = md && (team === sim.playerTeam ? md.player : md.enemy);
            if (sd && sd.aiWaveDelay) this.nextWave += sd.aiWaveDelay;
            this.wave = new Set(); this.waveTarget = null; this.waveIssued = -99; this.lastThreat = undefined;
            this.known = new Map();
            this.skip = {};
            this.log = [];                 // build order: [time, type]
            this.peakArmy = 0; this.waves = [];
            // home = our core (or the middle of our buildings, or the map start); the enemy's start likewise (every
            // player knows where the enemy starts, missions included)
            this.base = this.homeOf(team);
            this.enemyStart = this.homeOf(this.enemy);
            const dx = this.enemyStart.x - this.base.x, dz = this.enemyStart.z - this.base.z, dl = Math.hypot(dx, dz);
            this.fwd = { x: dx / dl, z: dz / dl };
            this.staging = sim._freePoint(this.base.x + this.fwd.x * 13, this.base.z + this.fwd.z * 13);
            this.defendUntil = 0; this.lastDefend = -99; this.lastStage = -99;
            this.scoutIdx = 0;
            this._reach = { ver: -1, count: 0 };
        }

        homeOf(team) {
            const sim = this.sim;
            let core = null, x = 0, z = 0, n = 0;
            for (const e of sim.entities.values()) {
                if (e.team !== team || e.dead || e.kind !== 'building') continue;
                if (e.type === 'core' && !core) core = e;
                x += e.x; z += e.z; n++;
            }
            if (core) return { x: core.x, z: core.z };
            if (n) return sim._freePoint(x / n, z / n);
            const s = sim.map.starts[team];
            return { x: s.tx + 1.5, z: s.tz + 1.5 };
        }
        isDefense(type) { const d = window.SF_CONFIG.BUILDINGS[type]; return !!(d && d.weapon); }
        ok(type) { return this.sim.allowed(this.team, type); }

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
            this.useSuper(tm);
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
                    if (e.type === 'harvester') { enemyHarv.push(e); this.harvSeen.set(e.id, { x: e.x, z: e.z, t: sim.time }); }
                    if (e.type === 'artillery') this.sawArtillery = sim.time;
                    this.seen.set(e.id, { armor: window.SF_CONFIG.UNITS[e.type].armor, t: sim.time });
                }
            }
            for (const [id, k] of this.seen) { const e = sim.entities.get(id); if (!e || e.dead || sim.time - k.t > 150) this.seen.delete(id); }
            for (const [id, h] of this.harvSeen) {
                const e = sim.entities.get(id);
                if (!e || e.dead || sim.time - h.t > 90) this.harvSeen.delete(id);
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
            this.threat = threat; this.threatN = tn; this.enemyHarv = enemyHarv; this.visEnemies = threats;
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
            if (tm.credits < reserve || this.army.length >= armyCap(this.diff, sim.time)) return;
            const inf = this.army.filter((u) => U[u.type].from === 'infantry');
            const veh = this.army.filter((u) => U[u.type].from === 'vehicle');
            const rich = tm.credits > 1500 ? 1 : 0;
            // enemy artillery shreds infantry: lean on vehicles once we've seen it
            const artThreat = c.factory && sim.time - (this.sawArtillery || -999) < 180 && inf.length > 0.3 * (this.army.length + 1);
            const R = this.roles, ok = (t) => this.ok(t);
            const first = (...list) => list.find(ok) || null;
            if (c.barracks && (!artThreat || (tm.credits > 700 && vq.length >= this.st.vehQ)) && tm.queues.infantry.length < this.st.infQ + rich) {
                const rockets = inf.filter((u) => u.type === R.at).length;
                // anti-armour share: the style's default, pulled toward what the enemy actually fields
                let wantRocket = c.factory ? this.st.rocket : 0.3;
                if (this.seen.size >= 4) {
                    let inf = 0;
                    for (const k of this.seen.values()) if (k.armor === 'inf') inf++;
                    const armour = 1 - inf / this.seen.size;
                    wantRocket = Math.max(0.2, Math.min(0.8, 0.5 * wantRocket + 0.5 * (armour * 0.9 + 0.1)));
                }
                const pick = rockets < (inf.length + 1) * wantRocket ? first(R.at, R.inf) : first(R.inf, R.at);
                if (pick) cmd(pick);
            }
            if (c.factory && vq.length < this.st.vehQ + rich && haveH >= wantH) {
                const n = veh.length + 1;
                const count = (t) => veh.filter((u) => u.type === t).length;
                const mains = count(R.main), techs = count(R.tech), fasts = count(R.fast);
                let pick = R.main;
                // Vanguard: tanks, a few buggies, artillery once the tech lab is up. Hegemony: lancers hold the line,
                // a pack of skimmers raids, phantoms flank and hunt harvesters.
                const mix = MIX[this.faction];
                if (c.techlab && techs < n * mix.tech) pick = R.tech;
                else if (mains >= 1 && fasts < Math.min(mix.fastMax, Math.max(mix.fastMin, n * mix.fast))) pick = R.fast;
                pick = first(pick, R.main, R.fast);
                if (pick && sim._lockReason(this.team, 'vehicle', U[pick], c)) pick = first(R.main, R.fast);
                if (pick) cmd(pick);
            }
        }
        spareValue() {
            const B = window.SF_CONFIG.BUILDINGS, f = window.SF_CONFIG.ECONOMY.sellRefund;
            let v = 0;
            for (const b of this.blds) if (b.type === 'techlab' || b.type === 'radar' || this.isDefense(b.type)) v += B[b.type].cost * f * b.hp / b.maxHp;
            return v;
        }
        sellSpare() {
            const order = ['techlab', 'radar', this.defense];
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
            const defense = this.isDefense(type);
            const turrets = mine.filter((b) => this.isDefense(b.type));
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
                if (defense) {
                    score = -fwd * 1.2 + lat * 0.25 + Math.max(0, dCore - 11) * 3 + Math.max(0, 5 - dCore) * 2;
                    for (const t of turrets) { const d = Math.hypot(t.x - cx, t.z - cz); if (d < 4) score += (4 - d) * 3; }
                } else if (type === 'refinery' && shardPts.length) {
                    const dk = sim.frontTile(this.team, type, tx, tz, 0), dkx = dk.tx + 0.5, dkz = dk.tz + 0.5;
                    let df = Infinity;
                    for (const p of shardPts) df = Math.min(df, Math.hypot(p.x - dkx, p.z - dkz) + p.pen);
                    score = Math.max(0, df - 1.5) * 1.5 + dCore * 0.15;
                } else if (def.superweapon) {
                    // tucked in behind the base, away from the enemy
                    score = dCore * 0.4 + fwd * 0.8 + Math.max(0, 4 - dCore) * 2;
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
            const VALUE = { core: 14, uplink: 12, riftsilo: 12, factory: 10, refinery: 9, barracks: 6, reactor: 5, techlab: 5, radar: 4, turret: -2, spire: -2 };
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
        waveCentroidOf(list) {
            let x = 0, z = 0, n = 0;
            for (const u of list) if (u && !u.dead) { x += u.x; z += u.z; n++; }
            return n ? { x: x / n, z: z / n } : null;
        }
        waveCentroid() {
            let x = 0, z = 0, n = 0;
            for (const id of this.wave) { const u = this.sim.entities.get(id); if (u) { x += u.x; z += u.z; n++; } }
            return n ? { x: x / n, z: z / n } : null;
        }
        launch(units, reason) {
            const sim = this.sim, t = this.t;
            const target = this.pickTarget();
            // cloaked units swing wide and come in from the side; they move (not attack-move) so they stay hidden
            const flankers = units.filter((u) => window.SF_CONFIG.UNITS[u.type].cloak);
            const main = flankers.length >= 2 ? units.filter((u) => flankers.indexOf(u) < 0) : units;
            if (main !== units) {
                const c = this.waveCentroidOf(flankers) || this.base;
                const dx = target.x - c.x, dz = target.z - c.z, dl = Math.hypot(dx, dz) || 1;
                const side = this.rng() < 0.5 ? 1 : -1, off = Math.min(9, dl * 0.4);
                const p = sim._freePoint(target.x - dx / dl * 3 + (-dz / dl) * side * off, target.z - dz / dl * 3 + (dx / dl) * side * off);
                sim.command(this.team, { type: 'move', ids: flankers.map((u) => u.id), x: p.x, z: p.z });
                for (const u of flankers) this.flank.set(u.id, t + 60);
            }
            if (main.length) sim.command(this.team, { type: 'attackMove', ids: main.map((u) => u.id), x: target.x, z: target.z });
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
            for (const id of this.raid) { const e = sim.entities.get(id); if (!e || e.dead) this.raid.delete(id); }
            for (const [id, until] of this.flank) { const e = sim.entities.get(id); if (!e || e.dead || t > until || (!e._order && !e._path)) this.flank.delete(id); }
            const home = this.army.filter((u) => !this.wave.has(u.id) && !this.raid.has(u.id));
            const ids = (list) => list.map((u) => u.id);
            const easy = this.diff === 'easy';
            // defend
            if (this.threat) {
                this.defendUntil = t + 8;
                this.lastThreat = t;
                if (t - this.lastDefend > 2.5) {
                    this.lastDefend = t;
                    const near = this.army.filter((u) => (this.wave.has(u.id) || this.raid.has(u.id)) ? Math.hypot(u.x - this.base.x, u.z - this.base.z) < 22 : true);
                    const go = near.filter((u) => !(u.state === 'attack' && u.targetId));
                    if (go.length) sim.command(this.team, { type: 'attackMove', ids: ids(go), x: this.threat.x, z: this.threat.z });
                    for (const u of near) { this.wave.delete(u.id); this.raid.delete(u.id); }
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
            const late = lateness(t), cap = Math.round(Math.min(22 + 30 * late, armyCap(this.diff, t) * (0.75 + 0.25 * late)));
            const need = Math.max(3, Math.round(Math.min(cap, this.cfg.waveSize + this.waveNo * this.cfg.waveGrowth) * this.st.need));
            const full = home.length >= armyCap(this.diff, t) * 0.85;
            const timer = full || t >= this.nextWave && (home.length >= need || (this.waveNo < 3 && t >= this.nextWave + 45 && home.length >= Math.max(3, Math.ceil(need * 0.6))));
            const counter = !easy && this.waveNo > 0 && this.lastThreat !== undefined && t - this.lastThreat > 4 && t - this.lastThreat < 15 &&
                this.wave.size === 0 && home.length >= Math.max(5, Math.ceil(need * 0.9)) && t - this.waveIssued > 40;
            if (!this.passive && (timer || counter)) { this.launch(home, timer ? 'timer' : 'counter'); return; }
            if (!this.passive) this.raids(home);
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
                        const d = Math.hypot(k.x - u.x, k.z - u.z) - (this.isDefense(k.type) ? 4 : 0);
                        if (d < bs) { bs = d; best = k; }
                    }
                    if (best && bs < 16) sim.command(this.team, { type: 'attack', ids: [u.id], targetId: best.id });
                }
            }
            // fast units and cloaked units dive on enemy artillery they can see (it can't hit them up close)
            this.huntSiege();
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
                    if (u && !u.targetId && u._order !== 'attackMove' && u._order !== 'attack' && !this.flank.has(id)) free.push(u);
                }
                if (free.length) {
                    const target = this.pickTarget(this.waveCentroid() || this.base);
                    sim.command(this.team, { type: 'attackMove', ids: ids(free), x: target.x, z: target.z });
                    this.waveTarget = target;
                }
            }
        }
        huntSiege() {
            const sim = this.sim, U = window.SF_CONFIG.UNITS, R = this.roles;
            if (this.t - (this.lastHunt || -99) < 1) return;
            this.lastHunt = this.t;
            const siege = (this.visEnemies || []).filter((e) => !e.dead && U[e.type].minRange);
            if (!siege.length) return;
            const hunters = this.army.filter((u) => (u.type === R.fast || U[u.type].cloak) && !this.raid.has(u.id));
            const byTarget = new Map();
            for (const u of hunters) {
                const cur = u.targetId && sim.entities.get(u.targetId);
                if (cur && !cur.dead && U[cur.type] && U[cur.type].minRange) continue;
                let best = null, bd = 14;
                for (const s of siege) { const d = Math.hypot(s.x - u.x, s.z - u.z); if (d < bd) { bd = d; best = s; } }
                if (!best) continue;
                if (!byTarget.has(best.id)) byTarget.set(best.id, []);
                byTarget.get(best.id).push(u.id);
            }
            for (const [id, ids] of byTarget) sim.command(this.team, { type: 'attack', ids, targetId: id });
        }

        // ---------- raids (Hegemony): skimmer packs and cloaked phantom pairs hunt harvesters ----------
        raidTarget(from) {
            const sim = this.sim;
            from = from || this.base;
            let best = null, bs = Infinity;
            for (const h of this.harvSeen.values()) {
                if (sim.time - h.t > 60) continue;
                const d = Math.hypot(h.x - from.x, h.z - from.z) + (sim.time - h.t) * 0.2;
                if (d < bs) { bs = d; best = { x: h.x, z: h.z }; }
            }
            if (best) return best;
            // the shard fields the enemy mines: near their known refineries, else the ones closest to their start
            const refs = [...this.known.values()].filter((k) => k.type === 'refinery');
            const f = sim.map.fields.filter((fd) => {
                const dMe = Math.hypot(fd.x - this.base.x, fd.z - this.base.z), dEn = Math.hypot(fd.x - this.enemyStart.x, fd.z - this.enemyStart.z);
                return refs.length ? refs.some((r) => Math.hypot(r.x - fd.x, r.z - fd.z) < 12) : dEn < dMe * 0.8;
            });
            if (!f.length) return null;
            f.sort((a, b) => Math.hypot(a.x - this.enemyStart.x, a.z - this.enemyStart.z) - Math.hypot(b.x - this.enemyStart.x, b.z - this.enemyStart.z));
            const p = f[(this.raidIdx = (this.raidIdx || 0) + 1) % f.length];
            return sim._freePoint(p.x, p.z);
        }
        raidOrder(units, p) {
            const U = window.SF_CONFIG.UNITS;
            const ghosts = units.filter((u) => U[u.type].cloak), loud = units.filter((u) => !U[u.type].cloak);
            if (ghosts.length) this.sim.command(this.team, { type: 'move', ids: ghosts.map((u) => u.id), x: p.x, z: p.z });
            if (loud.length) this.sim.command(this.team, { type: 'attackMove', ids: loud.map((u) => u.id), x: p.x, z: p.z });
        }
        raids(home) {
            if (this.faction !== 'hegemony') return;
            const sim = this.sim, t = this.t, R = this.roles;
            if (!this.raid.size) {
                if (t - this.lastRaid < 40 || sim.time < 150) return;
                const fast = home.filter((u) => u.type === R.fast && !u.targetId);
                const ghosts = home.filter((u) => u.type === R.tech && !u.targetId);
                let group = null;
                if (fast.length >= 3) group = fast.slice(0, 4);
                else if (ghosts.length >= 3 && this.harvSeen.size) group = ghosts.slice(0, 2);
                if (!group) return;
                const p = this.raidTarget();
                if (!p) return;
                this.raidOrder(group, p);
                for (const u of group) this.raid.add(u.id);
                this.raidStart = t; this.lastRaid = t;
                this.raidsSent = (this.raidsSent || 0) + 1;
                return;
            }
            const units = [...this.raid].map((id) => sim.entities.get(id)).filter((u) => u && !u.dead);
            let hp = 0, max = 0;
            for (const u of units) { hp += u.hp; max += u.maxHp; }
            if (!units.length || hp < max * 0.45 || t - this.raidStart > 100) {
                if (units.length) sim.command(this.team, { type: 'move', ids: units.map((u) => u.id), x: this.staging.x, z: this.staging.z });
                this.raid.clear(); this.lastRaid = t;
                return;
            }
            // prey in sight: everyone on it
            for (const h of this.enemyHarv) {
                const close = units.filter((u) => Math.hypot(h.x - u.x, h.z - u.z) < 10);
                if (!close.length) continue;
                const go = units.filter((u) => u.targetId !== h.id);
                if (go.length) sim.command(this.team, { type: 'attack', ids: go.map((u) => u.id), targetId: h.id });
                return;
            }
            if (units.every((u) => !u._order && !u.targetId && !u._path && !u._need)) {
                const p = this.raidTarget(this.waveCentroidOf(units));
                if (p) this.raidOrder(units, p);
            }
        }

        // ---------- superweapon: the best-value cluster of known enemy buildings and units ----------
        useSuper(tm) {
            const s = tm.super;
            if (!s || !s.ready) { this.superReadyAt = null; return; }
            if (this.superReadyAt == null) this.superReadyAt = this.t;
            if (this.t - this.lastSuper < 3) return;
            this.lastSuper = this.t;
            const sim = this.sim, C = window.SF_CONFIG, B = C.BUILDINGS, U = C.UNITS, R = s.radius;
            const items = [];
            for (const k of this.known.values()) {
                const d = B[k.type], e = sim.entities.get(k.id);
                if (!d) continue;
                const hp = e && !e.dead && sim.isVisible(this.team, e) ? e.hp : d.hp;
                items.push({ x: k.x, z: k.z, ext: Math.min(d.w, d.d) / 2, worth: k.type === 'core' ? 3000 : d.cost, hp, armor: d.armor, own: false });
            }
            for (const e of this.visEnemies || []) {
                if (e.dead) continue;
                items.push({ x: e.x, z: e.z, ext: e.radius, worth: U[e.type].cost, hp: e.hp, armor: U[e.type].armor, own: false });
            }
            if (!items.length) return;
            for (const e of sim.entities.values()) {
                if (e.dead || e.team !== this.team) continue;
                const d = e.kind === 'building' ? B[e.type] : U[e.type];
                items.push({ x: e.x, z: e.z, ext: e.kind === 'building' ? Math.min(e.w, e.d) / 2 : e.radius, worth: e.type === 'core' ? 3000 : d.cost, hp: e.hp, armor: d.armor, own: true });
            }
            const score = (cx, cz) => {
                let v = 0;
                for (const it of items) {
                    const dist = Math.max(0, Math.hypot(it.x - cx, it.z - cz) - it.ext);
                    if (dist > R) continue;
                    const dmg = sim.strikeDamage(s.kind, dist, it.armor);
                    v += (it.own ? -1.5 : 1) * it.worth * Math.min(1, dmg / Math.max(1, it.hp));
                }
                return v;
            };
            let best = null, bs = -Infinity;
            const enemyItems = items.filter((it) => !it.own);
            for (const it of enemyItems) {
                const cands = [{ x: it.x, z: it.z }];
                let mx = 0, mz = 0, n = 0;
                for (const o of enemyItems) if (Math.hypot(o.x - it.x, o.z - it.z) < R * 1.2) { mx += o.x; mz += o.z; n++; }
                if (n > 1) cands.push({ x: mx / n, z: mz / n });
                for (const c of cands) {
                    if (!(sim.teams[this.team].vis[(c.z | 0) * sim.map.w + (c.x | 0)] >= 1)) continue;
                    const v = score(c.x, c.z);
                    if (v > bs) { bs = v; best = c; }
                }
            }
            const waited = this.t - this.superReadyAt;
            const need = waited > 60 ? 300 : waited > 20 ? 700 : 1400;
            if (best && bs >= need && sim.command(this.team, { type: 'superweapon', x: best.x, z: best.z })) {
                this.superLog.push({ t: Math.round(sim.time), x: +best.x.toFixed(1), z: +best.z.toFixed(1), value: Math.round(bs) });
                this.superReadyAt = null;
            }
        }
    }

    SF.AI = AI;
    SF.AI.ROLES = ROLES;
    SF.AI.MIX = MIX;
    SF.AI.PLANS = PLANS;
    SF.AI.STYLES = STYLES;
})();
