// Shardfall: the simulation. Fixed-step, deterministic for a given seed and command stream, no THREE, no DOM.
// Everything balance-related comes from window.SF_CONFIG; map generation is in map.js, the computer player in ai.js.
(function () {
    'use strict';
    const SF = window.SF = window.SF || {};
    const SQ2 = Math.SQRT2;
    const DX8 = [1, -1, 0, 0, 1, 1, -1, -1];
    const DZ8 = [0, 0, 1, -1, 1, -1, 1, -1];
    const CATS = ['building', 'infantry', 'vehicle'];
    const PRODUCER = { building: 'core', infantry: 'barracks', vehicle: 'factory' };
    const HOVER_SHARD_BOOST = 1.15;   // hover units with `shardBonus` skim over shard fields this much faster
    const HEAL_EVENT_EVERY = 0.5;     // seconds between 'heal' events while a healer / repair bay works
    const INCOME_EVENT_EVERY = 3;     // seconds between 'income' events from a Shard Siphon

    function angDiff(a, b) {
        let d = (b - a) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
        return d;
    }
    function norm(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
    function turnToward(a, b, max) {
        const d = angDiff(a, b);
        return Math.abs(d) <= max ? norm(b) : norm(a + Math.sign(d) * max);
    }

    // ---------- binary min-heap (lazy deletion) ----------
    class Heap {
        constructor(cap) { this.it = new Int32Array(cap); this.k = new Float64Array(cap); this.size = 0; }
        clear() { this.size = 0; }
        push(item, key) {
            if (this.size >= this.it.length) {
                const it = new Int32Array(this.it.length * 2), k = new Float64Array(this.k.length * 2);
                it.set(this.it); k.set(this.k); this.it = it; this.k = k;
            }
            let i = this.size++;
            const IT = this.it, K = this.k;
            while (i > 0) {
                const p = (i - 1) >> 1;
                if (K[p] <= key) break;
                IT[i] = IT[p]; K[i] = K[p]; i = p;
            }
            IT[i] = item; K[i] = key;
        }
        pop() {
            const IT = this.it, K = this.k;
            const top = IT[0];
            const n = --this.size;
            if (n > 0) {
                const item = IT[n], key = K[n];
                let i = 0;
                for (;;) {
                    let c = 2 * i + 1;
                    if (c >= n) break;
                    if (c + 1 < n && K[c + 1] < K[c]) c++;
                    if (K[c] >= key) break;
                    IT[i] = IT[c]; K[i] = K[c]; i = c;
                }
                IT[i] = item; K[i] = key;
            }
            return top;
        }
    }

    // ---------- pathfinding: A* (8-way, no corner cutting), cached Dijkstra fields for groups, smoothing ----------
    class Pathing {
        constructor(sim) {
            this.sim = sim;
            this.w = sim.map.w; this.h = sim.map.h; this.n = this.w * this.h;
            this.g = new Float32Array(this.n);
            this.par = new Int32Array(this.n);
            this.stamp = new Uint32Array(this.n);
            this.closed = new Uint32Array(this.n);
            this.cur = 0;
            this.heap = new Heap(this.n * 2);
            this.fields = new Map();
            this.q = new Int32Array(this.n);
            this.mark = new Uint32Array(this.n);
            this.markCur = 0;
            this.depth = new Int32Array(this.n);
            this.stats = { astar: 0, fields: 0, expanded: 0 };
        }
        free(x, z) {
            return x >= 0 && z >= 0 && x < this.w && z < this.h && this.sim.block[(z | 0) * this.w + (x | 0)] === 0;
        }
        // Returns tile indices from s to goal, or to the reachable tile closest to goal when goal can't be reached.
        astar(s, goal) {
            const w = this.w, h = this.h, block = this.sim.block, g = this.g, par = this.par;
            const stamp = this.stamp, closed = this.closed, heap = this.heap;
            const cur = ++this.cur;
            const gx = goal % w, gz = (goal / w) | 0;
            const H = (i) => {
                const dx = Math.abs(i % w - gx), dz = Math.abs(((i / w) | 0) - gz);
                return dx > dz ? dx + 0.41421356 * dz : dz + 0.41421356 * dx;
            };
            heap.clear();
            g[s] = 0; par[s] = -1; stamp[s] = cur;
            heap.push(s, H(s));
            let best = s, bestH = H(s), exp = 0;
            while (heap.size) {
                const i = heap.pop();
                if (closed[i] === cur) continue;
                closed[i] = cur; exp++;
                if (i === goal) { best = i; break; }
                const hi = H(i);
                if (hi < bestH) { bestH = hi; best = i; }
                const x = i % w, z = (i / w) | 0, gi = g[i];
                for (let k = 0; k < 8; k++) {
                    const nx = x + DX8[k], nz = z + DZ8[k];
                    if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
                    const j = nz * w + nx;
                    if (block[j] || closed[j] === cur) continue;
                    if (k >= 4 && (block[z * w + nx] || block[nz * w + x])) continue;
                    const ng = gi + (k < 4 ? 1 : SQ2);
                    if (stamp[j] !== cur || ng < g[j]) {
                        stamp[j] = cur; g[j] = ng; par[j] = i;
                        heap.push(j, ng + H(j) * 1.001);
                    }
                }
            }
            this.stats.astar++; this.stats.expanded += exp;
            const out = [];
            for (let i = best; i !== -1; i = par[i]) out.push(i);
            out.reverse();
            return out;
        }
        // Distance-to-goal field (cached per goal tile until the grid changes).
        field(goal) {
            const ver = this.sim.gridVersion;
            let f = this.fields.get(goal);
            if (f && f.ver === ver) { f.used = this.sim.tick; return f.d; }
            if (!f) {
                if (this.fields.size >= 16) {
                    let oldK = -1, oldT = Infinity;
                    for (const [key, v] of this.fields) if (v.used < oldT) { oldT = v.used; oldK = key; }
                    f = this.fields.get(oldK); this.fields.delete(oldK);
                } else f = { d: new Float32Array(this.n) };
                this.fields.set(goal, f);
            }
            f.ver = ver; f.used = this.sim.tick;
            const d = f.d, w = this.w, h = this.h, block = this.sim.block, heap = this.heap;
            d.fill(Infinity);
            const cur = ++this.cur, closed = this.closed;
            heap.clear();
            d[goal] = 0; heap.push(goal, 0);
            while (heap.size) {
                const i = heap.pop();
                if (closed[i] === cur) continue;
                closed[i] = cur;
                const x = i % w, z = (i / w) | 0, di = d[i];
                for (let k = 0; k < 8; k++) {
                    const nx = x + DX8[k], nz = z + DZ8[k];
                    if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
                    const j = nz * w + nx;
                    if (block[j] || closed[j] === cur) continue;
                    if (k >= 4 && (block[z * w + nx] || block[nz * w + x])) continue;
                    const nd = di + (k < 4 ? 1 : SQ2);
                    if (nd < d[j]) { d[j] = nd; heap.push(j, nd); }
                }
            }
            this.stats.fields++;
            return d;
        }
        descend(d, s) {
            if (!isFinite(d[s])) return null;
            const w = this.w, h = this.h, block = this.sim.block;
            const out = [s];
            let i = s, guard = 0;
            while (d[i] > 0 && guard++ < this.n) {
                const x = i % w, z = (i / w) | 0;
                let best = -1, bv = d[i];
                for (let k = 0; k < 8; k++) {
                    const nx = x + DX8[k], nz = z + DZ8[k];
                    if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
                    const j = nz * w + nx;
                    if (block[j]) continue;
                    if (k >= 4 && (block[z * w + nx] || block[nz * w + x])) continue;
                    if (d[j] < bv) { bv = d[j]; best = j; }
                }
                if (best < 0) break;
                out.push(best); i = best;
            }
            return out;
        }
        // Thick line-of-sight test (clearance c on both sides of the segment).
        los(x0, z0, x1, z1, c) {
            const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
            if (L < 1e-6) return this.free(x0, z0);
            const steps = Math.ceil(L / 0.3);
            const px = -dz / L * c, pz = dx / L * c;
            for (let s = 0; s <= steps; s++) {
                const t = s / steps, x = x0 + dx * t, z = z0 + dz * t;
                if (!this.free(x, z) || !this.free(x + px, z + pz) || !this.free(x - px, z - pz)) return false;
            }
            return true;
        }
        // Tile list → world waypoints, string-pulled from (sx, sz); ends exactly at (gx, gz) when that is reachable.
        smooth(tilesList, sx, sz, gx, gz) {
            const w = this.w;
            const pts = [];
            for (let k = 1; k < tilesList.length; k++) {
                const i = tilesList[k];
                pts.push({ x: (i % w) + 0.5, z: ((i / w) | 0) + 0.5 });
            }
            if (gx !== undefined && this.free(gx, gz)) {
                const last = tilesList[tilesList.length - 1];
                const gi = (gz | 0) * w + (gx | 0);
                if (gi === last) {
                    if (pts.length) pts[pts.length - 1] = { x: gx, z: gz }; else pts.push({ x: gx, z: gz });
                } else {
                    const lp = pts.length ? pts[pts.length - 1] : { x: sx, z: sz };
                    if (this.los(lp.x, lp.z, gx, gz, 0.1)) pts.push({ x: gx, z: gz });
                }
            }
            if (!pts.length) return [];
            const out = [];
            let ax = sx, az = sz, k = 0;
            while (k < pts.length) {
                let j = k;
                while (j + 1 < pts.length && this.los(ax, az, pts[j + 1].x, pts[j + 1].z, 0.3)) j++;
                out.push(pts[j]); ax = pts[j].x; az = pts[j].z; k = j + 1;
            }
            return out;
        }
        // BFS over passable tiles from s, calling fn(i) until it returns true; returns that tile or -1.
        bfs(s, limit, fn) {
            const w = this.w, h = this.h, block = this.sim.block, q = this.q, mark = this.mark;
            const cur = ++this.markCur;
            let qh = 0, qt = 0;
            q[qt++] = s; mark[s] = cur;
            while (qh < qt && qh < limit) {
                const i = q[qh++];
                if (fn(i)) return i;
                const x = i % w, z = (i / w) | 0;
                for (let k = 0; k < 8; k++) {
                    const nx = x + DX8[k], nz = z + DZ8[k];
                    if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
                    const j = nz * w + nx;
                    if (mark[j] === cur || block[j]) continue;
                    if (k >= 4 && (block[z * w + nx] || block[nz * w + x])) continue;
                    mark[j] = cur; q[qt++] = j;
                }
            }
            return -1;
        }
    }

    // ---------- the simulation ----------
    class Sim {
        constructor(opts) {
            opts = opts || {};
            const cfg = this.cfg = window.SF_CONFIG;
            // A mission (js/missions.js) fixes the map, the sides and the starting forces; the player is team 0.
            const M = this.missionDef = opts.mission || null;
            const mm = (M && M.map) || {};
            this.seed = ((M && mm.seed !== undefined) ? mm.seed : (opts.seed === undefined ? 12345 : opts.seed)) >>> 0;
            this.size = (M && mm.size) || opts.size || 64;
            this.difficulty = cfg.AI[opts.difficulty] ? opts.difficulty : 'normal';
            this.playerTeam = M ? 0 : (opts.playerTeam === undefined ? 0 : opts.playerTeam);
            this.mirrorFronts = opts.mirrorFronts !== false;
            this.map = SF.generateMap({ seed: this.seed, size: this.size, clear: mm.clear });
            const FAC = cfg.FACTIONS || {};
            let facs = M ? [M.faction, M.enemyFaction] : (Array.isArray(opts.factions) ? opts.factions.slice(0, 2) : ['vanguard', 'hegemony']);
            facs = [0, 1].map((t) => (FAC[facs[t]] ? facs[t] : (t === 0 ? 'vanguard' : 'hegemony')));
            const side = M ? [M.player || {}, M.enemy || {}] : [{}, {}];
            const w = this.map.w, h = this.map.h, n = w * h;
            this.block = new Uint8Array(n);    // 0 free, 1 rock, 2 spire, 3 building
            this.occ = new Int32Array(n);      // building id per tile
            this.claim = new Int32Array(n);    // harvester id that has claimed a shard tile
            for (let i = 0; i < n; i++) if (this.map.tiles[i] === 1) this.block[i] = 1;
            for (const s of this.map.spires) this.block[s.tz * w + s.tx] = 2;
            this.gridVersion = 0;
            this.time = 0; this.tick = 0; this.alpha = 0; this._acc = 0;
            this.entities = new Map();
            this.nextId = 1;
            this.events = [];
            this.projectiles = [];
            this._pid = 1;
            this.winner = null;
            this.rng = SF.rng((this.seed ^ 0x5bd1e995) >>> 0);
            this.strikes = [];          // pending superweapon strikes: { id, team, kind, x, z, t (seconds left), warn, at, radius }
            this._sid = 1;
            this._tags = new Map();     // mission tag → entities (kept after death, for objectives)
            this.mission = null;
            const aiTeams = Array.isArray(opts.aiTeams) ? opts.aiTeams
                : M ? (cfg.AI[side[1].ai] ? [1] : []) : (this.playerTeam === null ? [0, 1] : [1 - this.playerTeam]);
            this.teams = [0, 1].map((t) => {
                let diff = (opts.aiDifficulty && cfg.AI[opts.aiDifficulty[t]]) ? opts.aiDifficulty[t] : this.difficulty;
                if (M && t === 1 && cfg.AI[side[1].ai] && !(opts.aiDifficulty && cfg.AI[opts.aiDifficulty[1]])) diff = side[1].ai;
                const ai = aiTeams.indexOf(t) >= 0;
                const f = facs[t];
                return {
                    id: t, name: FAC[f] ? FAC[f].name : cfg.TEAMS[t].name, color: cfg.TEAMS[t].color, faction: f,
                    credits: side[t].credits !== undefined ? side[t].credits : cfg.ECONOMY.startCredits,
                    power: { made: 0, used: 0 }, lowPower: false, radar: false,
                    allow: Array.isArray(side[t].allow) ? new Set(side[t].allow) : null, super: null,
                    ai, difficulty: diff, income: ai ? cfg.AI[diff].income : 1,
                    queues: { building: [], infantry: [], vehicle: [] }, ready: null, readyPaid: 0,
                    rally: { infantry: null, vehicle: null },
                    vis: new Uint8Array(n), defeated: false,
                    stats: { unitsBuilt: 0, unitsLost: 0, buildingsBuilt: 0, buildingsLost: 0, kills: 0, buildingsDestroyed: 0, creditsHarvested: 0, creditsSpent: 0 },
                    _alertT: {},
                };
            });
            this.path = new Pathing(this);
            this._budget = 0;
            // spatial hash for units (2×2-tile cells)
            this._cs = 2; this._hw = Math.ceil(w / 2); this._hh = Math.ceil(h / 2);
            this._buckets = [];
            for (let i = 0; i < this._hw * this._hh; i++) this._buckets.push([]);
            this._units = []; this._buildings = []; this._dirty = true;
            this._discs = new Map();
            // shard regrowth tiles: the eight tiles next to each spire (ECONOMY.shardRegrow per second each)
            this._regrow = [];
            for (const s of this.map.spires) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
                const x = s.tx + dx, z = s.tz + dz;
                if (x < 0 || z < 0 || x >= w || z >= h) continue;
                const i = z * w + x;
                if (this.map.tiles[i] !== 1 && this.block[i] !== 2 && this._regrow.indexOf(i) < 0) this._regrow.push(i);
            }
            // starting bases
            const START_UNITS = { vanguard: ['buggy', 'rifleman', 'rifleman', 'rifleman'], hegemony: ['skimmer', 'trooper', 'trooper', 'trooper'] };
            for (let t = 0; t < 2; t++) {
                if (side[t].start === false) continue;
                const startUnits = opts.startUnits || START_UNITS[facs[t]] || START_UNITS.vanguard;
                const s = this.map.starts[t];
                this._addBuilding(t, 'core', s.tx, s.tz, 1);
                const cx = s.tx + 1.5, cz = s.tz + 1.5;
                const dirX = t === 0 ? 1 : -1, dirZ = t === 0 ? -1 : 1;
                startUnits.forEach((type, k) => {
                    const ang = Math.atan2(dirZ, dirX) + (k - (startUnits.length - 1) / 2) * 0.45;
                    const p = this._freePoint(cx + Math.cos(ang) * 3.2, cz + Math.sin(ang) * 3.2);
                    const u = this.spawnUnit(t, type, p.x, p.z, true);
                    u.angle = u.turret = Math.atan2(dirZ, dirX);
                });
                this._explore(t, cx, cz, 13);
            }
            if (M) this._missionSetup(M, side);
            this._refreshLists();
            this._updatePower(true);
            this._updateFog();
            this.aiStyles = opts.aiStyles || null;   // optional { team: 'balanced'|'rush'|'armor' }
            this.ais = [];
            if (SF.AI) for (const tm of this.teams) if (tm.ai) this.ais.push(new SF.AI(this, tm.id, tm.difficulty));
            this.events.length = 0;
        }

        // ================= public API =================
        update(dt) {
            if (!(dt > 0)) return;
            const T = this.cfg.TICK;
            this._acc += Math.min(dt, 1);
            let steps = 0;
            while (this._acc >= T && steps < 10) { this.step(); this._acc -= T; steps++; }
            if (this._acc >= T) this._acc = T * 0.999;   // drop what we can't catch up on
            this.alpha = this._acc / T;
        }
        drainEvents() { const e = this.events; this.events = []; return e; }
        passable(tx, tz) {
            tx |= 0; tz |= 0;
            return tx >= 0 && tz >= 0 && tx < this.map.w && tz < this.map.h && this.block[tz * this.map.w + tx] === 0;
        }
        buildingAt(tx, tz) {
            tx |= 0; tz |= 0;
            if (tx < 0 || tz < 0 || tx >= this.map.w || tz >= this.map.h) return null;
            const id = this.occ[tz * this.map.w + tx];
            return id ? this.entities.get(id) || null : null;
        }
        visible(team, x, z) {
            const w = this.map.w, tx = x | 0, tz = z | 0;
            if (tx < 0 || tz < 0 || tx >= w || tz >= this.map.h) return false;
            return this.teams[team].vis[tz * w + tx] === 2;
        }
        // Is the entity visible to the team right now (units: its tile; buildings: any footprint tile)?
        isVisible(team, e) {
            if (e.team === team) return true;
            if (e.cloaked) return false;   // a cloaked unit is hidden from its enemies whatever the fog says
            const vis = this.teams[team].vis, w = this.map.w;
            if (e.kind === 'unit') return vis[(e.z | 0) * w + (e.x | 0)] === 2;
            for (let z = e.tz; z < e.tz + e.d; z++) for (let x = e.tx; x < e.tx + e.w; x++) if (vis[z * w + x] === 2) return true;
            return false;
        }
        // Visible, or (buildings) on explored ground: what a player may target with an explicit order.
        isKnown(team, e) {
            if (e.kind === 'unit') return this.isVisible(team, e);
            const vis = this.teams[team].vis, w = this.map.w;
            for (let z = e.tz; z < e.tz + e.d; z++) for (let x = e.tx; x < e.tx + e.w; x++) if (vis[z * w + x] >= 1) return true;
            return false;
        }

        canPlace(team, type, tx, tz) {
            const def = this.cfg.BUILDINGS[type];
            if (!def || def.buildable === false || !this.teams[team]) return false;
            tx |= 0; tz |= 0;
            const w = this.map.w, h = this.map.h;
            if (tx < 0 || tz < 0 || tx + def.w > w || tz + def.d > h) return false;
            for (let z = tz; z < tz + def.d; z++) for (let x = tx; x < tx + def.w; x++) {
                const i = z * w + x;
                if (this.block[i] !== 0 || this.map.tiles[i] === 2 || this.map.shards[i] > 0) return false;
            }
            const R = this.cfg.ECONOMY.buildRadius;
            for (const b of this._blds()) {
                if (b.team !== team || b.dead) continue;
                const gx = Math.max(0, b.tx - (tx + def.w), tx - (b.tx + b.w));
                const gz = Math.max(0, b.tz - (tz + def.d), tz - (b.tz + b.d));
                if (Math.max(gx, gz) <= R) return true;
            }
            return false;
        }

        options(team) {
            const tm = this.teams[team];
            if (!tm) return [];
            const C = this.cfg, out = [];
            const have = this._haveMap(team);
            const FAC = C.FACTIONS && C.FACTIONS[tm.faction];
            const lanes = {}, caps = {};
            for (const cat of CATS) { lanes[cat] = this.lanes(team, cat); caps[cat] = C.ECONOMY.queueMax * Math.max(1, lanes[cat]); }
            const pushOpt = (type, cat, def, reason) => {
                const q = tm.queues[cat];
                // queued: how many of this type wait or build; building: how many are in production right now;
                // progress: the most advanced one of them (0..1)
                let queued = 0, building = 0, progress = 0, stalled = false;
                for (const it of q) {
                    if (it.type !== type) continue;
                    queued++;
                    if (it.active) { building++; if (it.stalled) stalled = true; }
                    if (it.progress > progress) progress = it.progress;
                }
                out.push({
                    type, name: def.name, cat, cost: def.cost, time: def.time, locked: !!reason, reason: reason || '',
                    queued, building, progress, ready: cat === 'building' && tm.ready === type,
                    paused: !!(queued && (tm.credits <= 0 || stalled || (cat === 'building' && tm.ready) || !lanes[cat])),
                    full: q.length >= caps[cat],
                });
            };
            // buildings in config order with the superweapon last; units in the faction's roster order
            const blds = Object.keys(C.BUILDINGS).filter((type) => C.BUILDINGS[type].buildable !== false && this.allowed(team, type));
            blds.sort((a, b) => (C.BUILDINGS[a].superweapon ? 1 : 0) - (C.BUILDINGS[b].superweapon ? 1 : 0));
            for (const type of blds) pushOpt(type, 'building', C.BUILDINGS[type], this._lockReason(team, 'building', C.BUILDINGS[type], have));
            const units = FAC ? FAC.units : Object.keys(C.UNITS);
            for (const type of units) {
                const def = C.UNITS[type];
                if (!def || !this.allowed(team, type)) continue;
                pushOpt(type, def.from, def, this._lockReason(team, def.from, def, have));
            }
            return out;
        }
        // Production lanes: one per finished, live producer (barracks → infantry, war factory → vehicles), up to
        // ECONOMY.maxLanes; the first `lanes` items of the queue build at the same time. Buildings keep one lane.
        lanes(team, cat) {
            if (!this.teams[team] || !PRODUCER[cat]) return 0;
            const n = this._producers(team, cat).length;
            return cat === 'building' ? Math.min(1, n) : Math.min(this.cfg.ECONOMY.maxLanes || 1, n);
        }
        // How many items the category's queue holds: ECONOMY.queueMax per lane (at least one lane's worth).
        queueCap(team, cat) {
            return this.cfg.ECONOMY.queueMax * Math.max(1, this.lanes(team, cat));
        }
        // May this team ever build this type (its faction's or shared, and on the mission's list)?
        allowed(team, type) {
            const C = this.cfg, tm = this.teams[team];
            const def = C.BUILDINGS[type] || C.UNITS[type];
            if (!tm || !def) return false;
            if (def.faction && def.faction !== tm.faction) return false;
            if (tm.allow && !tm.allow.has(type)) return false;
            return true;
        }

        command(team, cmd) {
            const tm = this.teams[team];
            if (!tm || !cmd || tm.defeated) return false;
            try {
                switch (cmd.type) {
                    case 'move': return this._cmdMove(team, cmd.ids, cmd.x, cmd.z, 'move');
                    case 'attackMove': return this._cmdMove(team, cmd.ids, cmd.x, cmd.z, 'attackMove');
                    case 'attack': return this._cmdAttack(team, cmd.ids, cmd.targetId);
                    case 'heal': case 'repair': return this._cmdHeal(team, cmd.ids, cmd.targetId);
                    case 'stop': return this._cmdStop(team, cmd.ids);
                    case 'harvest': return this._cmdHarvest(team, cmd.ids, cmd.tx, cmd.tz);
                    case 'queue': return this._cmdQueue(team, cmd.item);
                    case 'cancel': return this._cmdCancel(team, cmd.item);
                    case 'place': return this._cmdPlace(team, cmd.item, cmd.tx, cmd.tz);
                    case 'sell': return this._cmdSell(team, cmd.id);
                    case 'rally': return this._cmdRally(team, cmd.cat, cmd.x, cmd.z);
                    case 'superweapon': return this._cmdSuper(team, cmd.x, cmd.z);
                }
            } catch (err) {
                if (typeof console !== 'undefined') console.error('Shardfall command failed', cmd, err);
            }
            return false;
        }

        // Test/debug helper: create a unit right now (no cost).
        spawnUnit(team, type, x, z, silent) {
            const def = this.cfg.UNITS[type];
            const p = this._freePoint(x, z);
            const a = team === 0 ? -Math.PI / 4 : Math.PI * 0.75;
            const u = {
                id: this.nextId++, team, kind: 'unit', type, x: p.x, z: p.z, prevX: p.x, prevZ: p.z, angle: a, turret: a,
                hp: def.hp, maxHp: def.hp, dead: false, carry: 0, state: 'idle', targetId: null, firing: 99, radius: def.radius,
                _order: null, _path: null, _pi: 0, _gx: p.x, _gz: p.z, _need: null, _cd: 0, _scan: (this.nextId % 6) * 0.05,
                _ax: p.x, _az: p.z, _stuck: 0, _stuckT: 0, _sx: p.x, _sz: p.z, _chaseX: NaN, _chaseZ: NaN, _repT: 0,
                _hitBy: 0, _hitT: -99, _h: type === 'harvester' ? 'seek' : null, _tile: -1, _wait: 0, _refId: 0,
                _prefX: NaN, _prefZ: NaN, _dock: null, _px: 0, _pz: 0,
                cloaked: false, _cloak: !!def.cloak, _hunt: false, _patrol: null, _pk: 0,
                stunned: 0, slowed: false, _slow: 0, healing: null, _healTgt: 0, _healEv: 0, _burstLeft: 0, _blocked: false,
            };
            this.entities.set(u.id, u);
            this._dirty = true;
            if (!silent) this._ev({ type: 'spawn', id: u.id, team, what: type });
            return u;
        }

        // ================= the tick =================
        step() {
            const T = this.cfg.TICK;
            // remove the dead of the previous tick
            for (const e of this.entities.values()) {
                if (e.dead && e._deadTick < this.tick) { this.entities.delete(e.id); this._dirty = true; }
            }
            if (this._dirty) this._refreshLists();
            for (const u of this._units) { u.prevX = u.x; u.prevZ = u.z; }
            this._budget = 30;
            this._rebuildHash();
            for (const ai of this.ais) ai.update(T);
            this._updatePower(false);
            for (const tm of this.teams) if (!tm.defeated) this._updateProduction(tm);
            this._updateFields();
            for (const b of this._buildings) if (!b.dead) this._updateBuilding(b);
            for (const u of this._units) if (!u.dead) this._updateUnit(u);
            this._separate();
            this._updateProjectiles();
            this._updateCloak();
            this._updateStrikes();
            this._updateSuper();
            if (this.tick % 20 === 0) this._regrowShards();
            if (this.tick % 2 === 0) this._updateFog();
            if (this.tick % 20 === 10) this._updateScripted();
            if (this.mission) { if (this.tick % 5 === 0) this._missionUpdate(); }
            else this._checkDefeat();
            this.time += T;
            this.tick++;
        }

        // ================= internals: bookkeeping =================
        _ev(e) { this.events.push(e); if (this.events.length > 5000) this.events.splice(0, 1000); }
        _alert(team, text, x, z, key, every) {
            const tm = this.teams[team];
            key = key || text;
            if (every && tm._alertT[key] !== undefined && this.time - tm._alertT[key] < every) return;
            tm._alertT[key] = this.time;
            this._ev({ type: 'alert', team, text, x: x === undefined ? null : x, z: z === undefined ? null : z });
        }
        // New arrays each time, so loops already iterating the old ones are unaffected.
        _refreshLists() {
            const units = [], blds = [];
            for (const e of this.entities.values()) (e.kind === 'unit' ? units : blds).push(e);
            this._units = units; this._buildings = blds;
            this._dirty = false;
        }
        _blds() { if (this._dirty) this._refreshLists(); return this._buildings; }
        _rebuildHash() {
            const B = this._buckets;
            for (let i = 0; i < B.length; i++) B[i].length = 0;
            for (const u of this._units) {
                if (u.dead) continue;
                const cx = Math.min(this._hw - 1, Math.max(0, (u.x / 2) | 0)), cz = Math.min(this._hh - 1, Math.max(0, (u.z / 2) | 0));
                B[cz * this._hw + cx].push(u);
            }
        }
        _near(x, z, r, fn) {
            const x0 = Math.max(0, ((x - r) / 2) | 0), x1 = Math.min(this._hw - 1, ((x + r) / 2) | 0);
            const z0 = Math.max(0, ((z - r) / 2) | 0), z1 = Math.min(this._hh - 1, ((z + r) / 2) | 0);
            for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
                const b = this._buckets[cz * this._hw + cx];
                for (let k = 0; k < b.length; k++) fn(b[k]);
            }
        }
        _haveMap(team) {
            const have = {};
            for (const b of this._blds()) if (b.team === team && !b.dead) have[b.type] = (have[b.type] || 0) + 1;
            return have;
        }
        _hasProducer(team, cat) {
            const type = PRODUCER[cat];
            for (const b of this._blds()) if (b.team === team && !b.dead && b.type === type && b.built >= 1) return true;
            return false;
        }
        // Finished, live buildings that produce this category (cores for 'building').
        _producers(team, cat) {
            const type = PRODUCER[cat], out = [];
            for (const b of this._blds()) if (b.team === team && !b.dead && b.type === type && b.built >= 1) out.push(b);
            return out;
        }
        _lockReason(team, cat, def, have) {
            const B = this.cfg.BUILDINGS;
            const prod = cat === 'building' ? 'core' : PRODUCER[cat];
            if (!have[prod]) return 'Needs ' + B[prod].name;
            for (const r of def.requires || []) if (!have[r]) return 'Needs ' + B[r].name;
            return '';
        }
        _tileFree(i) { return this.block[i] === 0; }
        // Nearest open tile to (tx, tz). Optional (gx, gz): the exact goal point to measure from; (fx, fz): who is
        // asking — ties go to the side facing them (so an attack on a building ends on the near side of it).
        _nearestFreeTile(tx, tz, maxR, gx, gz, fx, fz) {
            const w = this.map.w, h = this.map.h;
            tx = Math.max(0, Math.min(w - 1, tx | 0)); tz = Math.max(0, Math.min(h - 1, tz | 0));
            if (this.block[tz * w + tx] === 0) return tz * w + tx;
            maxR = maxR || 16;
            if (gx === undefined) { gx = tx + 0.5; gz = tz + 0.5; }
            const hasF = fx !== undefined && isFinite(fx);
            for (let r = 1; r <= maxR; r++) {
                let best = -1, bd = Infinity;
                for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const x = tx + dx, z = tz + dz;
                    if (x < 0 || z < 0 || x >= w || z >= h || this.block[z * w + x] !== 0) continue;
                    let d = (x + 0.5 - gx) * (x + 0.5 - gx) + (z + 0.5 - gz) * (z + 0.5 - gz);
                    if (hasF) d += 0.02 * Math.hypot(x + 0.5 - fx, z + 0.5 - fz);
                    if (d < bd) { bd = d; best = z * w + x; }
                }
                if (best >= 0) return best;
            }
            return -1;
        }
        _freePoint(x, z) {
            const w = this.map.w;
            x = Math.max(0.05, Math.min(w - 0.05, x)); z = Math.max(0.05, Math.min(this.map.h - 0.05, z));
            if (this.block[(z | 0) * w + (x | 0)] === 0) return { x, z };
            const i = this._nearestFreeTile(x | 0, z | 0, 30);
            if (i < 0) return { x, z };
            return { x: (i % w) + 0.5, z: ((i / w) | 0) + 0.5 };
        }
        _explore(team, x, z, r) {
            const vis = this.teams[team].vis, w = this.map.w, h = this.map.h;
            for (let tz = Math.floor(z - r); tz <= z + r; tz++) for (let tx = Math.floor(x - r); tx <= x + r; tx++) {
                if (tx < 0 || tz < 0 || tx >= w || tz >= h) continue;
                if (Math.hypot(tx + 0.5 - x, tz + 0.5 - z) <= r && vis[tz * w + tx] === 0) vis[tz * w + tx] = 1;
            }
        }

        // ================= buildings =================
        _addBuilding(team, type, tx, tz, built) {
            const def = this.cfg.BUILDINGS[type];
            const enemy = this.map.starts[1 - team];
            const x = tx + def.w / 2, z = tz + def.d / 2;
            const face = Math.atan2(enemy.tz + 1.5 - z, enemy.tx + 1.5 - x);
            const b = {
                id: this.nextId++, team, kind: 'building', type, tx, tz, w: def.w, d: def.d, x, z, prevX: x, prevZ: z,
                angle: this.faceOf(team) > 0 ? 0 : Math.PI, face: this.faceOf(team), turret: face, hp: def.hp, maxHp: def.hp, dead: false, built, state: 'idle', targetId: null,
                firing: 99, carry: 0, radius: Math.max(def.w, def.d) / 2,
                _cd: 0, _scan: 0, _rise: 1.2 + def.w * def.d * 0.15, _done: built >= 1,
                stunned: 0, repairing: null, _healEv: 0, _burstLeft: 0, _inc: 0, _incT: 0,
            };
            if (def.superweapon) { b.charge = 0; b.ready = false; b._charge = 0; }
            const at = this.missionDef && this.missionDef.autoTag;
            if (at && at[type] && this._tags) this._tag(b, at[type]);
            this.entities.set(b.id, b);
            const w = this.map.w;
            for (let z2 = tz; z2 < tz + def.d; z2++) for (let x2 = tx; x2 < tx + def.w; x2++) {
                this.block[z2 * w + x2] = 3; this.occ[z2 * w + x2] = b.id;
            }
            this.gridVersion++;
            this._dirty = true;
            // push any units standing on the footprint out of it
            for (const u of this.entities.values()) {
                if (u.kind !== 'unit' || u.dead) continue;
                if (u.x >= tx && u.x < tx + def.w && u.z >= tz && u.z < tz + def.d) {
                    const p = this._freePoint(u.x, u.z);
                    u.x = u.prevX = p.x; u.z = u.prevZ = p.z;
                    if (u._path) this._repath(u);
                }
            }
            // moving units whose path crosses the footprint re-plan
            for (const u of this.entities.values()) {
                if (u.kind !== 'unit' || u.dead || !u._path) continue;
                for (let k = u._pi; k < u._path.length; k++) {
                    const p = u._path[k];
                    if (p.x > tx - 1.5 && p.x < tx + def.w + 1.5 && p.z > tz - 1.5 && p.z < tz + def.d + 1.5) { this._repath(u); break; }
                }
            }
            return b;
        }
        _removeBuildingTiles(b) {
            const w = this.map.w;
            for (let z = b.tz; z < b.tz + b.d; z++) for (let x = b.tx; x < b.tx + b.w; x++) {
                if (this.occ[z * w + x] === b.id) { this.block[z * w + x] = 0; this.occ[z * w + x] = 0; }
            }
            this.gridVersion++;
        }
        // Which way a team's building fronts (doors, factory exits, refinery docks) face: +1 = south (+Z),
        // -1 = north (-Z). With mirrored fronts (the default) team 1's buildings are turned 180°, so the whole
        // game, docks included, is point-symmetric and neither side gets the better base layout.
        faceOf(team) { return this.mirrorFronts && team === 1 ? -1 : 1; }
        // The k-th tile straight out of a building's front door (k = 0 is the tile touching the footprint),
        // for a building of `type` with its footprint origin at (tx, tz).
        frontTile(team, type, tx, tz, k) {
            const def = this.cfg.BUILDINGS[type];
            if (this.faceOf(team) > 0) return { tx: tx + (def.w >> 1), tz: tz + def.d + (k || 0) };
            return { tx: tx + def.w - 1 - (def.w >> 1), tz: tz - 1 - (k || 0) };
        }
        // Where a building's units come out / harvesters unload: just outside the middle of its front edge
        // (even widths: the barracks door is a quarter tile off centre), or the nearest open tile around it.
        _exitPoint(b) {
            const w = this.map.w, h = this.map.h, f = this.faceOf(b.team);
            const ft = this.frontTile(b.team, b.type, b.tx, b.tz, 0);
            const ex = ft.tx, ez = ft.tz;
            if (ex >= 0 && ez >= 0 && ex < w && ez < h && this.block[ez * w + ex] === 0) {
                const x = b.w % 2 ? ex + 0.5 : (f > 0 ? ex + 0.25 : ex + 0.75);
                return { x, z: f > 0 ? ez + 0.4 : ez + 0.6, tile: ez * w + ex };
            }
            let best = null, bd = Infinity;
            for (let z = b.tz - 1; z <= b.tz + b.d; z++) for (let x = b.tx - 1; x <= b.tx + b.w; x++) {
                if (x < 0 || z < 0 || x >= w || z >= h || this.block[z * w + x] !== 0) continue;
                const d = (x - ex) * (x - ex) + (z - ez) * (z - ez);
                if (d < bd) { bd = d; best = { x: x + 0.5, z: z + 0.5, tile: z * w + x }; }
            }
            if (best) return best;
            return this._freePoint(b.x, b.z + f * (b.d / 2 + 0.5));
        }
        _updateBuilding(b) {
            const T = this.cfg.TICK, def = this.cfg.BUILDINGS[b.type];
            b.firing += T;
            if (b.built < 1) {
                b.built = Math.min(1, b.built + T / b._rise);
                if (b.built < 1) return;
            }
            if (!b._done) {
                b._done = true;
                if (def.superweapon) {
                    const sw = this.cfg.SUPERWEAPONS[def.superweapon];
                    this._alert(b.team, def.name + ' online', b.x, b.z, 'swon' + b.id);
                    this._alert(1 - b.team, 'Enemy superweapon detected', b.x, b.z, 'swdet' + b.id);
                    b.charge = Math.max(0, b._charge) / sw.charge;
                }
                if (def.freeUnit) {
                    const p = this._exitPoint(b);
                    const u = this.spawnUnit(b.team, def.freeUnit, p.x, p.z);
                    u.angle = u.turret = this.faceOf(b.team) * Math.PI / 2;
                    this.teams[b.team].stats.unitsBuilt++;
                }
            }
            const tm = this.teams[b.team];
            if (b.stunned > 0) {
                b.stunned = Math.max(0, b.stunned - T);
                if (def.weapon || def.repair) { b.state = 'idle'; b.targetId = null; b.repairing = null; return; }
            }
            if (def.income && !tm.lowPower) this._siphon(b, def, tm);
            if (def.repair) this._repairBay(b, def);
            if (!def.weapon) return;
            if (tm.lowPower) { b.state = 'idle'; b.targetId = null; return; }
            const wpn = this.cfg.WEAPONS[def.weapon];
            const minR = wpn.minRange || 0;
            if (b._cd > 0) b._cd -= T;
            let tgt = b.targetId ? this.entities.get(b.targetId) : null;
            if (tgt) { const d = tgt.dead ? 0 : this._rangeTo(b, tgt); if (tgt.dead || !this.isVisible(b.team, tgt) || d > wpn.range || d < minR) tgt = null; }
            b._scan -= T;
            if (!tgt && b._scan <= 0) { b._scan = 0.3; tgt = this._acquire(b, wpn.range, minR); }
            b.targetId = tgt ? tgt.id : null;
            if (!tgt) { b.state = 'idle'; return; }
            b.state = 'attack';
            const ap = this._aimPoint(tgt, b);
            const want = Math.atan2(ap.z - b.z, ap.x - b.x);
            b.turret = turnToward(b.turret, want, 3.5 * T);
            if (Math.abs(angDiff(b.turret, want)) < 0.12 && b._cd <= 0) this._fire(b, def.weapon, wpn, tgt, ap);
        }

        // Shard Siphon: credits per second while powered (× the team's income rate, like harvesting), with an
        // 'income' event every few seconds for floating text.
        _siphon(b, def, tm) {
            const T = this.cfg.TICK, gain = def.income * T * tm.income;
            tm.credits += gain; tm.stats.creditsHarvested += gain;
            b._inc += gain; b._incT += T;
            if (b._incT >= INCOME_EVENT_EVERY - 1e-9) {
                this._ev({ type: 'income', team: b.team, id: b.id, amount: Math.round(b._inc), x: b.x, z: b.z });
                b._inc = 0; b._incT = 0;
            }
        }
        // Repair Bay: heals the most damaged friendly unit of its class (vehicles) in range, passing units included.
        _repairBay(b, def) {
            const T = this.cfg.TICK, R = def.repair;
            const tgt = this._healTarget(b, R.targets, R.radius, true);
            if (!tgt) { b.repairing = null; b._healEv = 0; return; }
            if (b.repairing !== tgt.id) b._healEv = 0;
            b.repairing = tgt.id;
            this._applyHeal(b, tgt, R.rate * T, 'repair');
        }
        // Gravity Wells: enemy units inside a powered, working field are slowed (e.slowed, e._slow = the fraction).
        _updateFields() {
            for (const u of this._units) { u.slowed = false; u._slow = 0; }
            const B = this.cfg.BUILDINGS;
            for (const b of this._buildings) {
                if (b.dead || b.built < 1 || b.stunned > 0) continue;
                const f = B[b.type].field;
                if (!f || this.teams[b.team].lowPower) continue;
                this._near(b.x, b.z, f.radius + 1, (u) => {
                    if (u.dead || u.team === b.team) return;
                    if (Math.hypot(u.x - b.x, u.z - b.z) > f.radius) return;
                    u.slowed = true; u._slow = Math.max(u._slow, f.slow);
                });
            }
        }

        // ================= power, production =================
        _updatePower(silent) {
            for (const tm of this.teams) { tm.power.made = 0; tm.power.used = 0; }
            const radarOn = [false, false];
            for (const b of this._blds()) {
                if (b.dead) continue;
                const p = this.cfg.BUILDINGS[b.type].power || 0;
                const tm = this.teams[b.team];
                if (p > 0) tm.power.made += p; else tm.power.used -= p;
                if (b.type === 'radar' && b.built >= 1) radarOn[b.team] = true;
            }
            for (const tm of this.teams) {
                const low = tm.power.used > tm.power.made;
                if (low !== tm.lowPower && !silent && !tm.defeated) this._alert(tm.id, low ? 'Low power' : 'Power restored');
                tm.lowPower = low;
                tm.radar = radarOn[tm.id] && !low;
            }
        }
        _updateProduction(tm) {
            const C = this.cfg, T = C.TICK;
            const slow = tm.lowPower ? C.ECONOMY.lowPowerSlowdown : 1;
            for (const cat of CATS) {
                const q = tm.queues[cat];
                if (!q.length) continue;
                const prods = this._producers(tm.id, cat);
                const lanes = cat === 'building' ? Math.min(1, prods.length) : Math.min(C.ECONOMY.maxLanes || 1, prods.length);
                this._assignLanes(tm, cat, q, prods, lanes);
                if (!lanes || (cat === 'building' && tm.ready)) continue;
                const done = [];
                // the first `lanes` items build side by side, each at full speed and each paying as it goes;
                // when credits run short the oldest item is served first
                for (let k = 0; k < lanes && k < q.length; k++) {
                    const it = q[k];
                    const def = cat === 'building' ? C.BUILDINGS[it.type] : C.UNITS[it.type];
                    let dp = Math.min(slow * T / Math.max(0.1, def.time), 1 - it.progress);
                    let want = def.cost * (it.progress + dp) - it.paid;
                    if (want > tm.credits + 1e-9) {
                        if (tm.credits <= 1e-9) {
                            it.stalled = true;
                            if (tm.ai === false) this._alert(tm.id, 'Not enough credits', undefined, undefined, 'credits', 12);
                            continue;
                        }
                        dp *= tm.credits / want; want = tm.credits;
                    }
                    it.stalled = false;
                    want = Math.max(0, want);
                    tm.credits = Math.max(0, tm.credits - want);
                    it.paid += want; it.progress += dp;
                    tm.stats.creditsSpent += want;
                    if (it.progress >= 1 - 1e-7) done.push(it);
                }
                for (const it of done) {
                    q.splice(q.indexOf(it), 1);
                    this._ev({ type: 'complete', team: tm.id, what: it.type, cat, producer: it.producer || 0 });
                    if (cat === 'building') { tm.ready = it.type; tm.readyPaid = it.paid; }
                    else this._produceUnit(tm, it.type, cat, it.producer);
                }
                if (done.length) this._assignLanes(tm, cat, q, prods, lanes);
            }
        }
        // Mark the first `lanes` queue items active and give each its own producer: an item keeps the building it
        // started in while that stands; a new one takes the free producer nearest the rally point (or the newest).
        _assignLanes(tm, cat, q, prods, lanes) {
            const used = new Set();
            const ok = (id) => prods.some((b) => b.id === id);
            for (let k = 0; k < q.length; k++) {
                const it = q[k];
                if (k < lanes) {
                    it.active = true;
                    if (it.producer && ok(it.producer) && !used.has(it.producer)) used.add(it.producer);
                    else it.producer = 0;
                } else { it.active = false; it.producer = 0; }
            }
            const rally = cat === 'building' ? null : tm.rally[cat];
            for (let k = 0; k < lanes && k < q.length; k++) {
                const it = q[k];
                if (it.producer) continue;
                let best = null, bd = Infinity;
                for (const b of prods) {
                    if (used.has(b.id)) continue;
                    const d = rally ? Math.hypot(b.x - rally.x, b.z - rally.z) : -b.id;
                    if (d < bd) { bd = d; best = b; }
                }
                if (best) { it.producer = best.id; used.add(best.id); }
            }
        }
        _produceUnit(tm, type, cat, producerId) {
            // the item's own producer; if that is gone, the one nearest to the rally point (or the newest)
            const ptype = PRODUCER[cat];
            const rally = tm.rally[cat];
            let prod = producerId ? this.entities.get(producerId) : null;
            if (prod && (prod.dead || prod.built < 1 || prod.team !== tm.id || prod.type !== ptype)) prod = null;
            if (!prod) {
                let bd = Infinity;
                for (const b of this._blds()) {
                    if (b.team !== tm.id || b.dead || b.type !== ptype || b.built < 1) continue;
                    const d = rally ? Math.hypot(b.x - rally.x, b.z - rally.z) : -b.id;
                    if (d < bd) { bd = d; prod = b; }
                }
            }
            if (!prod) return;
            const p = this._exitPoint(prod);
            const u = this.spawnUnit(tm.id, type, p.x, p.z);
            u.from = prod.id;
            const f = this.faceOf(tm.id);
            u.angle = u.turret = f * Math.PI / 2;
            tm.stats.unitsBuilt++;
            if (type === 'harvester') return;   // starts in 'seek'
            if (rally) this._orderSingle(u, rally.x, rally.z, 'move');
            else {
                const q = this._freePoint(p.x + (this.rng() - 0.5) * 2, p.z + f * (1.6 + this.rng()));
                this._orderSingle(u, q.x, q.z, 'move');
            }
        }

        // ================= commands =================
        _ownUnits(team, ids) {
            const out = [];
            if (!Array.isArray(ids)) return out;
            const seen = new Set();
            for (const id of ids) {
                if (seen.has(id)) continue;
                seen.add(id);
                const e = this.entities.get(id);
                if (e && !e.dead && e.kind === 'unit' && e.team === team) out.push(e);
            }
            return out;
        }
        _cmdMove(team, ids, x, z, order) {
            if (!isFinite(x) || !isFinite(z)) return false;
            const units = this._ownUnits(team, ids);
            if (!units.length) return false;
            const harv = units.filter((u) => u.type === 'harvester');
            const army = units.filter((u) => u.type !== 'harvester');
            for (const u of harv) { this._releaseClaim(u); u._h = 'move'; }
            this._groupMove(harv.length && !army.length ? harv : units, x, z, order);
            return true;
        }
        _groupMove(units, x, z, order) {
            const w = this.map.w, h = this.map.h;
            x = Math.max(0.05, Math.min(w - 0.05, x)); z = Math.max(0.05, Math.min(h - 0.05, z));
            let mx = 0, mz = 0;
            for (const u of units) { mx += u.x; mz += u.z; }
            mx /= units.length; mz /= units.length;
            const gt = this._nearestFreeTile(x | 0, z | 0, 30, x, z, mx, mz);
            if (gt < 0) return;
            const gfree = this.block[(z | 0) * w + (x | 0)] === 0;
            const gx = gfree ? x : (gt % w) + 0.5, gz = gfree ? z : ((gt / w) | 0) + 0.5;
            if (units.length === 1) { this._orderSingle(units[0], gx, gz, order); return; }
            // the group keeps the pace of its slowest member
            let vmax = Infinity;
            for (const u of units) vmax = Math.min(vmax, this.cfg.UNITS[u.type].speed);
            const field = this.path.field(gt);
            // formation: rows facing the direction of travel, centred on the goal
            let cx = 0, cz = 0, maxR = 0;
            for (const u of units) { cx += u.x; cz += u.z; maxR = Math.max(maxR, u.radius); }
            cx /= units.length; cz /= units.length;
            let fx = gx - cx, fz = gz - cz;
            const fl = Math.hypot(fx, fz);
            if (fl < 0.5) { fx = 1; fz = 0; } else { fx /= fl; fz /= fl; }
            const rx = -fz, rz = fx;
            // about one unit per tile: loose enough that one artillery shell can't catch half the group
            const n = units.length, sp = Math.max(1.0, maxR * 2 + 0.25);
            const cols = Math.ceil(Math.sqrt(n * 1.3)), rows = Math.ceil(n / cols);
            const slots = new Array(n);
            const bad = [];
            for (let s = 0; s < n; s++) {
                const r = Math.floor(s / cols), c = s % cols;
                const inRow = r === rows - 1 ? n - r * cols : cols;
                const ox = (c - (inRow - 1) / 2) * sp, oz = (r - (rows - 1) / 2) * sp;
                const px = gx + rx * ox - fx * oz, pz = gz + rz * ox - fz * oz;
                const tx = px | 0, tz = pz | 0;
                const ok = px > 0.3 && pz > 0.3 && px < w - 0.3 && pz < h - 0.3 && this.block[tz * w + tx] === 0 &&
                    field[tz * w + tx] <= Math.hypot(ox, oz) * 1.6 + 1.5;
                if (ok) slots[s] = { x: px, z: pz }; else bad.push(s);
            }
            if (bad.length) {
                let bi = 0;
                this.path.bfs(gt, this.path.n, (i) => {
                    const px = (i % w) + 0.5, pz = ((i / w) | 0) + 0.5;
                    for (const s of slots) if (s && Math.hypot(s.x - px, s.z - pz) < sp * 0.85) return false;
                    slots[bad[bi++]] = { x: px, z: pz };
                    return bi >= bad.length;
                });
                for (let s = 0; s < n; s++) if (!slots[s]) slots[s] = { x: gx, z: gz };
            }
            // assign: front-most units to the front row, left-to-right within rows
            const sorted = units.slice().sort((a, b) => ((b.x - cx) * fx + (b.z - cz) * fz) - ((a.x - cx) * fx + (a.z - cz) * fz));
            for (let r = 0; r < rows; r++) {
                const chunk = sorted.slice(r * cols, r * cols + cols).sort((a, b) => ((a.x * rx + a.z * rz) - (b.x * rx + b.z * rz)));
                chunk.forEach((u, c) => {
                    const slot = slots[r * cols + c];
                    this._setOrder(u, order, slot.x, slot.z);
                    u._vmax = vmax;
                    const st = this._tileOf(u);
                    const ut = this.path.descend(field, st);
                    if (!ut) { this._requestPath(u, slot.x, slot.z); return; }
                    // join the unit's path to the slot's path where they first meet
                    const slt = this.path.descend(field, (slot.z | 0) * w + (slot.x | 0)) || [gt];
                    const mark = this.path.mark, cur = ++this.path.markCur;
                    const pos = new Map();
                    slt.forEach((t, k) => { mark[t] = cur; pos.set(t, k); });
                    let joined = ut;
                    for (let k = 0; k < ut.length; k++) {
                        if (mark[ut[k]] === cur) {
                            const m = pos.get(ut[k]);
                            joined = ut.slice(0, k + 1).concat(slt.slice(0, m).reverse());
                            break;
                        }
                    }
                    u._path = this.path.smooth(joined, u.x, u.z, slot.x, slot.z);
                    u._pi = 0; u._need = null; this._resetStuck(u);
                    if (!u._path.length) u._path = null;
                });
            }
        }
        _setOrder(u, order, gx, gz) {
            u._order = order; u._gx = gx; u._gz = gz; u._vmax = 0;
            u.targetId = null; u._chaseX = NaN; u._blocked = false; u._healTgt = 0;
            if (u.type === 'harvester') u._h = 'move';
            u._stuck = 0;
        }
        _orderSingle(u, x, z, order) {
            this._setOrder(u, order, x, z);
            this._requestPath(u, x, z);
        }
        _tileOf(u) {
            const w = this.map.w;
            const i = (u.z | 0) * w + (u.x | 0);
            if (this.block[i] === 0) return i;
            const j = this._nearestFreeTile(u.x | 0, u.z | 0, 8);
            return j < 0 ? i : j;
        }
        _resetStuck(u) { u._stuck = 0; u._stuckT = 0; u._sx = u.x; u._sz = u.z; }
        _requestPath(u, x, z) {
            u._path = null; u._pi = 0;
            u._need = { x, z };
            if (this._budget > 0) this._servicePath(u);
        }
        _servicePath(u) {
            const nd = u._need;
            if (!nd) return;
            this._budget--;
            u._need = null;
            const w = this.map.w;
            const gt = this._nearestFreeTile(nd.x | 0, nd.z | 0, 30, nd.x, nd.z, u.x, u.z);
            if (gt < 0) { u._path = null; return; }
            const tl = this.path.astar(this._tileOf(u), gt);
            const gfree = this.block[(nd.z | 0) * w + (nd.x | 0)] === 0;
            const reached = tl[tl.length - 1] === gt;
            const ex = reached ? (gfree ? nd.x : (gt % w) + 0.5) : undefined;
            const ez = reached ? (gfree ? nd.z : ((gt / w) | 0) + 0.5) : undefined;
            const p = this.path.smooth(tl, u.x, u.z, ex, ez);
            u._path = p.length ? p : null; u._pi = 0;
            u._blocked = !reached && u._order === 'attackMove' && Math.hypot(nd.x - (tl[tl.length - 1] % w + 0.5), nd.z - ((tl[tl.length - 1] / w) | 0) - 0.5) > 2;
            this._resetStuck(u);
        }
        _repath(u) {
            if (!u._path || !u._path.length) return;
            const last = u._path[u._path.length - 1];
            this._requestPath(u, last.x, last.z);
        }
        _cmdAttack(team, ids, targetId) {
            const t = this.entities.get(targetId);
            if (t && !t.dead && t.team === team) return this._cmdHeal(team, ids, targetId);   // healers onto an ally
            if (!t || t.dead || t.team === team || !this.isKnown(team, t)) return false;
            const units = this._ownUnits(team, ids).filter((u) => this.cfg.UNITS[u.type].weapon);
            if (!units.length) return false;
            for (const u of units) {
                this._setOrder(u, 'attack', t.x, t.z);
                u.targetId = t.id; u._path = null; u._need = null; u._chaseX = NaN; u._repT = 0;
            }
            return true;
        }
        _cmdStop(team, ids) {
            const units = this._ownUnits(team, ids);
            if (!units.length) return false;
            for (const u of units) {
                u._order = null; u._path = null; u._need = null; u.targetId = null; u._healTgt = 0; u._blocked = false;
                u._ax = u.x; u._az = u.z; u.state = 'idle';
                if (u.type === 'harvester') { this._releaseClaim(u); u._h = 'idle'; }
            }
            return true;
        }
        _cmdHarvest(team, ids, tx, tz) {
            const units = this._ownUnits(team, ids).filter((u) => u.type === 'harvester');
            if (!units.length) return false;
            for (const u of units) {
                this._releaseClaim(u);
                u._order = null; u._path = null; u._need = null;
                u._h = 'seek'; u._wait = 0;
                u._prefX = isFinite(tx) ? (tx | 0) + 0.5 : NaN; u._prefZ = isFinite(tz) ? (tz | 0) + 0.5 : NaN;
            }
            return true;
        }
        _cmdQueue(team, type) {
            const C = this.cfg, tm = this.teams[team];
            let def = C.BUILDINGS[type], cat = 'building';
            if (def) { if (def.buildable === false) return false; }
            else { def = C.UNITS[type]; if (!def) return false; cat = def.from; }
            if (!this.allowed(team, type)) return false;
            if (this._lockReason(team, cat, def, this._haveMap(team))) return false;
            const q = tm.queues[cat];
            if (q.length >= this.queueCap(team, cat)) return false;
            q.push({ type, progress: 0, paid: 0, active: false, producer: 0 });
            return true;
        }
        _cmdCancel(team, type) {
            const tm = this.teams[team];
            for (const cat of CATS) {
                const q = tm.queues[cat];
                for (let i = q.length - 1; i >= 0; i--) {
                    if (q[i].type === type) {
                        tm.credits += q[i].paid; tm.stats.creditsSpent -= q[i].paid;
                        q.splice(i, 1);
                        return true;
                    }
                }
            }
            if (tm.ready === type) {
                tm.credits += tm.readyPaid; tm.stats.creditsSpent -= tm.readyPaid;
                tm.ready = null; tm.readyPaid = 0;
                return true;
            }
            return false;
        }
        _cmdPlace(team, type, tx, tz) {
            const tm = this.teams[team];
            if (!tm.ready || tm.ready !== type || !this.canPlace(team, type, tx, tz)) return false;
            const b = this._addBuilding(team, type, tx | 0, tz | 0, 0);
            tm.ready = null; tm.readyPaid = 0;
            tm.stats.buildingsBuilt++;
            this._ev({ type: 'placed', id: b.id, team, what: type });
            this._updatePower(false);
            return true;
        }
        _cmdSell(team, id) {
            const b = this.entities.get(id);
            if (!b || b.dead || b.kind !== 'building' || b.team !== team) return false;
            const def = this.cfg.BUILDINGS[b.type];
            const refund = Math.floor(def.cost * this.cfg.ECONOMY.sellRefund * Math.max(0, b.hp / b.maxHp));
            this.teams[team].credits += refund;
            this._kill(b, -1, true);
            this._updatePower(false);
            return true;
        }
        _cmdRally(team, cat, x, z) {
            if (cat !== 'infantry' && cat !== 'vehicle') return false;
            if (x === null || x === undefined) { this.teams[team].rally[cat] = null; return true; }
            if (!isFinite(x) || !isFinite(z)) return false;
            this.teams[team].rally[cat] = { x: Math.max(0.5, Math.min(this.map.w - 0.5, x)), z: Math.max(0.5, Math.min(this.map.h - 0.5, z)) };
            return true;
        }

        // ================= units =================
        _rangeTo(a, t) {
            if (t.kind === 'building') {
                const cx = Math.max(t.tx, Math.min(t.tx + t.w, a.x)), cz = Math.max(t.tz, Math.min(t.tz + t.d, a.z));
                return Math.hypot(a.x - cx, a.z - cz);
            }
            return Math.max(0, Math.hypot(a.x - t.x, a.z - t.z) - t.radius);
        }
        _aimPoint(t, from) {
            if (t.kind !== 'building') return { x: t.x, z: t.z };
            const cx = Math.max(t.tx, Math.min(t.tx + t.w, from.x)), cz = Math.max(t.tz, Math.min(t.tz + t.d, from.z));
            // a little inside the footprint, toward its centre
            const dx = t.x - cx, dz = t.z - cz, d = Math.hypot(dx, dz) || 1, k = Math.min(0.35, d);
            return { x: cx + dx / d * k, z: cz + dz / d * k };
        }
        _acquire(s, r, minR) {
            const vis = this.teams[s.team].vis, w = this.map.w;
            let best = null, bs = Infinity;
            const U = this.cfg.UNITS;
            this._near(s.x, s.z, r + 1, (e) => {
                if (e.team === s.team || e.dead || e.cloaked) return;
                const d = Math.hypot(e.x - s.x, e.z - s.z) - e.radius;
                if (d > r || d < minR) return;
                if (vis[(e.z | 0) * w + (e.x | 0)] !== 2) return;
                // armed units first (artillery above all: fragile and deadly), then harvesters, then the rest
                const sc = d + (U[e.type].weapon ? (U[e.type].minRange ? -1.5 : 0) : (e.type === 'harvester' ? 1.2 : 2));
                if (sc < bs) { bs = sc; best = e; }
            });
            const B = this.cfg.BUILDINGS;
            for (const b of this._blds()) {
                if (b.team === s.team || b.dead) continue;
                // walls are never picked on sight (units walk around them); a blocked attack-move or an explicit
                // attack order targets them
                if (B[b.type].wall) continue;
                if (Math.abs(b.x - s.x) > r + 3 || Math.abs(b.z - s.z) > r + 3) continue;
                const d = this._rangeTo(s, b);
                if (d > r || d < minR) continue;
                if (!this.isVisible(s.team, b)) continue;
                const sc = d + (this.cfg.BUILDINGS[b.type].weapon ? 1 : 4);
                if (sc < bs) { bs = sc; best = b; }
            }
            return best;
        }
        _updateUnit(u) {
            const C = this.cfg, T = C.TICK, def = C.UNITS[u.type];
            u.firing += T;
            // stunned (EMP): no moving, no firing, until it wears off
            if (u.stunned > 0) {
                u.stunned = Math.max(0, u.stunned - T);
                return;
            }
            if (u._cd > 0) u._cd -= T;
            if (u._need && this._budget > 0) this._servicePath(u);
            if (u.type === 'harvester') { this._updateHarvester(u, def); return; }
            if (def.heal) { this._updateHealer(u, def); return; }
            const wpn = def.weapon ? C.WEAPONS[def.weapon] : null;
            const minR = Math.max(def.minRange || 0, (wpn && wpn.minRange) || 0);
            let tgt = u.targetId ? this.entities.get(u.targetId) : null;
            if (u.targetId && !tgt) {
                // the target is already gone (a projectile killed it last tick): carry on with the attack-move
                u.targetId = null;
                if (u._order === 'attackMove') this._requestPath(u, u._gx, u._gz);
            }
            if (tgt && (tgt.dead || !(u._order === 'attack' ? this.isKnown(u.team, tgt) : this.isVisible(u.team, tgt)))) {
                if (u._order === 'attack') {
                    // lost it: walk to where it was last seen
                    const lx = tgt.x, lz = tgt.z, gone = tgt.dead;
                    u.targetId = null;
                    if (gone) { u._order = null; u._ax = u.x; u._az = u.z; u._path = null; }
                    else this._orderSingle(u, lx, lz, 'move');
                } else {
                    u.targetId = null;
                    if (u._order === 'attackMove') this._requestPath(u, u._gx, u._gz);
                }
                tgt = null;
            }
            // auto-acquire / retaliate (an idle cloaked unit holds its fire, so it stays hidden: an ambush stance)
            if (wpn && !tgt && u._order !== 'move' && u._order !== 'attack') {
                u._scan -= T;
                if (u._scan <= 0) {
                    u._scan = 0.3;
                    const r = u._order === 'attackMove' ? Math.max(wpn.range, Math.min(def.sight, wpn.range + 2)) : wpn.range + 1;
                    let c = (u._cloak && !u._order) ? null : this._acquire(u, r, minR);
                    if (!c && u._hitBy && this.time - u._hitT < 3 && !u._order) {
                        const a = this.entities.get(u._hitBy);
                        if (a && !a.dead && this.isVisible(u.team, a) && Math.hypot(a.x - u.x, a.z - u.z) < def.sight + 2) c = a;
                        u._hitBy = 0;
                    }
                    if (c) { u.targetId = c.id; tgt = c; u._chaseX = NaN; }
                }
            }
            if (tgt && wpn) {
                const d = this._rangeTo(u, tgt);
                if (d <= wpn.range && d >= minR) {
                    u.state = 'attack';
                    this._aimAndFire(u, def, wpn, tgt);
                    return;
                }
                // out of range: chase (explicit attack always; otherwise within a leash)
                const leash = u._order === 'attackMove' ? def.sight + 2 : 5;
                const fromAnchor = u._order === 'attackMove' ? 0 : Math.hypot(u.x - u._ax, u.z - u._az);
                if (u._order === 'attack' || (d < def.sight + 1 && fromAnchor < leash)) {
                    u.state = 'attack';
                    if (d < minR) {
                        // too close (artillery): back off
                        const ax = u.x - tgt.x, az = u.z - tgt.z, al = Math.hypot(ax, az) || 1;
                        if (!u._path || u._repT <= 0) { u._repT = 1; this._requestPath(u, u.x + ax / al * 2.5, u.z + az / al * 2.5); }
                    } else {
                        u._repT -= T;
                        const ap = tgt.kind === 'building' ? this._aimPoint(tgt, u) : tgt;
                        if ((!u._path && !u._need) || (u._repT <= 0 && Math.hypot(ap.x - u._chaseX, ap.z - u._chaseZ) > 1.5)) {
                            u._repT = 0.6; u._chaseX = ap.x; u._chaseZ = ap.z;
                            this._requestPath(u, ap.x, ap.z);
                        }
                    }
                    if (u._path) this._moveAlong(u, def);
                    return;
                }
                // give up the chase
                u.targetId = null; tgt = null;
                if (u._order === 'attackMove') this._requestPath(u, u._gx, u._gz);
                else if (!u._order) this._requestPath(u, u._ax, u._az);
            }
            if (u._order === 'attack' && !tgt) { u._order = null; u._ax = u.x; u._az = u.z; }
            // an attack-move that could not reach its goal (walled off): break through the nearest enemy building
            if (wpn && u._blocked && u._order === 'attackMove' && !u._path && !u._need) {
                u._blocked = false;
                const wall = this._blockingBuilding(u, def.sight + 3);
                if (wall) { u.targetId = wall.id; u._chaseX = NaN; u._repT = 0; return; }
            }
            this._moveTail(u, def);
        }
        // Path following / arrival / idle, shared by every kind of unit.
        _moveTail(u, def) {
            const T = this.cfg.TICK;
            // a blocked attack-move stays an attack-move on arrival, so the unit then breaks through (see above)
            const ends = (o) => o === 'move' || (o === 'attackMove' && !u._blocked);
            if (u._path) {
                u.state = 'move';
                if (this._moveAlong(u, def)) {
                    if (ends(u._order)) { u._order = null; u._ax = u.x; u._az = u.z; }
                    u.state = 'idle'; u._vmax = 0;
                }
            } else if (u._need) {
                u.state = u._order ? 'move' : 'idle';
            } else {
                if (ends(u._order)) { u._order = null; u._ax = u.x; u._az = u.z; }
                u.state = 'idle';
                if (def.turret) u.turret = turnToward(u.turret, u.angle, 2 * T);
            }
        }
        // The nearest known enemy building (walls first) for a unit whose attack-move was blocked.
        _blockingBuilding(u, r) {
            let best = null, bs = Infinity;
            for (const b of this._blds()) {
                if (b.team === u.team || b.dead) continue;
                if (Math.abs(b.x - u.x) > r + 2 || Math.abs(b.z - u.z) > r + 2) continue;
                const d = this._rangeTo(u, b);
                if (d > r || !this.isKnown(u.team, b)) continue;
                const sc = d - (this.cfg.BUILDINGS[b.type].wall ? 1.5 : 0);
                if (sc < bs) { bs = sc; best = b; }
            }
            return best;
        }

        // ================= healers: medics, acolytes (infantry), engineers (buildings) =================
        // The most damaged friendly target of a class ('inf' | 'vehicle' | 'bld') within r of src (not src itself).
        _healTarget(src, cls, r, fromFootprint) {
            let best = null, bs = 0.9999;
            const U = this.cfg.UNITS;
            if (cls === 'bld') {
                for (const b of this._blds()) {
                    if (b.team !== src.team || b.dead || b === src || b.built < 1 || b.hp >= b.maxHp) continue;
                    if (Math.abs(b.x - src.x) > r + 3 || Math.abs(b.z - src.z) > r + 3) continue;
                    if (this._rangeTo(src, b) > r) continue;
                    const f = b.hp / b.maxHp;
                    if (f < bs) { bs = f; best = b; }
                }
                return best;
            }
            this._near(src.x, src.z, r + 2, (e) => {
                if (e.team !== src.team || e.dead || e === src || e.hp >= e.maxHp) return;
                const d = U[e.type];
                if (cls === 'inf' ? d.armor !== 'inf' : d.from !== cls) return;
                const dist = fromFootprint ? this._rangeTo(e, src) : this._rangeTo(src, e);
                if (dist > r) return;
                const f = e.hp / e.maxHp;
                if (f < bs || (f === bs && best && e.id < best.id)) { bs = f; best = e; }
            });
            return best;
        }
        _applyHeal(src, tgt, amt, kind) {
            tgt.hp = Math.min(tgt.maxHp, tgt.hp + amt);
            src._healEv -= this.cfg.TICK;
            if (src._healEv <= 0) {
                src._healEv = HEAL_EVENT_EVERY;
                this._ev({ type: 'heal', id: src.id, team: src.team, target: tgt.id, x: src.x, z: src.z, tx: tgt.x, tz: tgt.z, kind });
            }
        }
        // A healer has no weapon. It heals the most damaged ally of its class in reach (stopping to do so unless
        // it was told to move), walks to an ally it was ordered onto ('heal'/'repair' command), and when idle
        // goes to hurt allies it can see (engineers: damaged buildings within 3 tiles).
        _updateHealer(u, def) {
            const T = this.cfg.TICK, H = def.heal, kind = H.targets === 'bld' ? 'repair' : 'heal';
            let tgt = null;
            if (u._order === 'heal') {
                const o = this.entities.get(u._healTgt);
                if (!o || o.dead || o.team !== u.team || o.hp >= o.maxHp) {
                    u._order = null; u._healTgt = 0; u._path = null; u._need = null; u._ax = u.x; u._az = u.z;
                } else if (this._rangeTo(u, o) <= H.radius) {
                    tgt = o; u._path = null; u._need = null;
                } else {
                    u._repT -= T;
                    const ap = o.kind === 'building' ? this._aimPoint(o, u) : o;
                    if ((!u._path && !u._need) || (u._repT <= 0 && Math.hypot(ap.x - u._chaseX, ap.z - u._chaseZ) > 1)) {
                        u._repT = 0.8; u._chaseX = ap.x; u._chaseZ = ap.z;
                        this._requestPath(u, ap.x, ap.z);
                    }
                    u.healing = null; u.state = 'move';
                    // the path ended but the ally is still out of reach (blocked off): give up
                    if (u._path && this._moveAlong(u, def) && this._rangeTo(u, o) > H.radius + 1.5) { u._order = null; u._healTgt = 0; }
                    return;
                }
            }
            if (!tgt && u._order !== 'move') {
                tgt = this._healTarget(u, H.targets, H.radius, false);
                // on an attack-move, only stop for allies that are really hurt (else keep up with the group)
                if (tgt && u._order === 'attackMove' && tgt.hp > tgt.maxHp * 0.85 && u._path) tgt = null;
            }
            if (tgt) {
                if (u.healing !== tgt.id) u._healEv = 0;
                u.healing = tgt.id; u.state = 'heal';
                u.angle = turnToward(u.angle, Math.atan2(tgt.z - u.z, tgt.x - u.x), def.turn * T);
                u.turret = u.angle;
                this._applyHeal(u, tgt, H.rate * T, kind);
                if (u._order === 'attackMove' && u._path) this._resetStuck(u);
                return;
            }
            u.healing = null;
            if (!u._order && !u._path && !u._need) {
                u._scan -= T;
                if (u._scan <= 0) {
                    u._scan = 1;
                    const far = this._healTarget(u, H.targets, H.targets === 'bld' ? 3 : def.sight, false);
                    if (far) { u._order = 'heal'; u._healTgt = far.id; u._chaseX = NaN; u._repT = 0; return; }
                }
            }
            this._moveTail(u, def);
        }
        _cmdHeal(team, ids, targetId) {
            const t = this.entities.get(targetId);
            if (!t || t.dead || t.team !== team) return false;
            const U = this.cfg.UNITS;
            const cls = t.kind === 'building' ? 'bld' : (U[t.type].armor === 'inf' ? 'inf' : U[t.type].from);
            const units = this._ownUnits(team, ids).filter((u) => U[u.type].heal && U[u.type].heal.targets === cls && u !== t);
            if (!units.length) return false;
            for (const u of units) {
                this._setOrder(u, 'heal', t.x, t.z);
                u._healTgt = t.id; u._path = null; u._need = null; u._chaseX = NaN; u._repT = 0;
            }
            return true;
        }
        _aimAndFire(u, def, wpn, tgt) {
            const T = this.cfg.TICK;
            const ap = this._aimPoint(tgt, u);
            const want = Math.atan2(ap.z - u.z, ap.x - u.x);
            let aimed;
            if (def.turret) {
                u.turret = turnToward(u.turret, want, 5 * T);
                aimed = Math.abs(angDiff(u.turret, want)) < 0.12;
            } else {
                u.angle = turnToward(u.angle, want, def.turn * T);
                u.turret = u.angle;
                aimed = Math.abs(angDiff(u.angle, want)) < 0.15;
            }
            if (aimed && u._cd <= 0) this._fire(u, def.weapon, wpn, tgt, ap);
        }
        _fire(s, key, wpn, tgt, ap) {
            // a burst weapon fires `burst` shots `burstGap` apart, then the cooldown starts (an interrupted burst
            // finishes on the next target)
            let burst = 0;
            if (wpn.burst > 1) {
                if (s._burstLeft > 0) s._burstLeft--; else s._burstLeft = wpn.burst - 1;
                burst = wpn.burst - s._burstLeft;   // 1-based shot number within the burst
            }
            s._cd = burst && s._burstLeft > 0 ? wpn.burstGap : wpn.cooldown * (0.95 + this.rng() * 0.1);
            s.firing = 0;
            if (wpn.chain) { this._fireChain(s, key, wpn, tgt, ap); return; }
            const dist = Math.hypot(ap.x - s.x, ap.z - s.z);
            const bullet = wpn.projectile === 'bullet' || !wpn.speed;
            const dur = bullet ? 0 : dist / wpn.speed;
            const pid = bullet ? 0 : this._pid++;
            const ev = { type: 'shot', from: s.id, team: s.team, x: s.x, z: s.z, tx: ap.x, tz: ap.z, weapon: key, proj: wpn.projectile, dur, pid, target: tgt.id };
            if (burst) ev.burst = burst;
            this._ev(ev);
            if (bullet) { this._hit(s.team, s.id, key, wpn, tgt, ap.x, ap.z); return; }
            this.projectiles.push({
                id: pid, team: s.team, from: s.id, weapon: key, kind: wpn.projectile, sx: s.x, sz: s.z, x: s.x, z: s.z,
                tx: ap.x, tz: ap.z, targetId: tgt.id, homing: wpn.projectile !== 'arc', t: 0, dur: Math.max(0.05, dur), speed: wpn.speed,
            });
        }
        // Chain lightning: hits the target, then jumps to the nearest other (uncloaked) enemy unit within chain.range of
        // the last one hit, up to chain.jumps times, damage × falloff per jump. Instant: one 'shot' event with
        // proj 'chain' and points [{x, z, id}] (target first), and one 'impact' per point.
        _fireChain(s, key, wpn, tgt, ap) {
            const ch = wpn.chain;
            const hit = [tgt], ids = new Set([tgt.id]);
            let cur = tgt;
            for (let j = 0; j < (ch.jumps || 0); j++) {
                let best = null, bd = Infinity;
                this._near(cur.x, cur.z, ch.range + 1, (e) => {
                    if (e.team === s.team || e.dead || e.cloaked || ids.has(e.id)) return;
                    const d = Math.hypot(e.x - cur.x, e.z - cur.z) - e.radius;
                    if (d <= ch.range && d < bd) { bd = d; best = e; }
                });
                if (!best) break;
                hit.push(best); ids.add(best.id); cur = best;
            }
            const points = hit.map((e, k) => (k === 0 ? { x: ap.x, z: ap.z, id: e.id } : { x: e.x, z: e.z, id: e.id }));
            this._ev({ type: 'shot', from: s.id, team: s.team, x: s.x, z: s.z, tx: ap.x, tz: ap.z, weapon: key, proj: 'chain', dur: 0, pid: 0, target: tgt.id, points });
            let dmg = wpn.damage;
            hit.forEach((e, k) => {
                this._ev({ type: 'impact', x: points[k].x, z: points[k].z, weapon: key, proj: 'chain', splash: 0, id: e.id });
                if (!e.dead) this._damage(e, dmg * (wpn.vs[this._armor(e)] || 0), s.id, s.team);
                if (wpn.stun) this._stun(e, wpn.stun);
                dmg *= ch.falloff === undefined ? 1 : ch.falloff;
            });
        }
        // EMP: vehicles and defences (buildings with a weapon, field or repair bay) stop for `dur` seconds;
        // infantry are immune.
        _stun(e, dur) {
            if (!e || e.dead || !(dur > 0)) return;
            if (e.kind === 'unit') {
                const d = this.cfg.UNITS[e.type];
                if (d.armor === 'inf' || d.stunImmune) return;
            } else {
                const d = this.cfg.BUILDINGS[e.type];
                if (!d.weapon && !d.field && !d.repair) return;
            }
            const was = e.stunned > 0;
            e.stunned = Math.max(e.stunned || 0, dur);
            if (e.kind === 'unit' && !was) { e.state = 'idle'; }
            this._ev({ type: 'stun', id: e.id, team: e.team, dur, x: e.x, z: e.z });
        }
        _updateProjectiles() {
            const T = this.cfg.TICK, W = this.cfg.WEAPONS;
            const P = this.projectiles;
            let k = 0;
            for (let i = 0; i < P.length; i++) {
                const p = P[i];
                const wpn = W[p.weapon];
                let done = false;
                if (p.homing) {
                    const t = this.entities.get(p.targetId);
                    if (t && !t.dead) { const ap = this._aimPoint(t, p); p.tx = ap.x; p.tz = ap.z; }
                    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz), st = p.speed * T;
                    if (d <= st) { p.x = p.tx; p.z = p.tz; done = true; }
                    else { p.x += dx / d * st; p.z += dz / d * st; }
                    p.t += T;
                } else {
                    p.t += T;
                    const f = Math.min(1, p.t / p.dur);
                    p.x = p.sx + (p.tx - p.sx) * f; p.z = p.sz + (p.tz - p.sz) * f;
                    done = f >= 1;
                }
                if (done) {
                    let t = this.entities.get(p.targetId);
                    if (t && (t.dead || (!p.homing && this._rangeTo({ x: p.x, z: p.z }, t) > 0.35))) t = null;
                    this._hit(p.team, p.from, p.weapon, wpn, t, p.x, p.z);
                } else P[k++] = p;
            }
            P.length = k;
        }
        _armor(e) { return e.kind === 'building' ? this.cfg.BUILDINGS[e.type].armor : this.cfg.UNITS[e.type].armor; }
        _hit(team, fromId, key, wpn, direct, ix, iz) {
            this._ev({ type: 'impact', x: ix, z: iz, weapon: key, proj: wpn.projectile, splash: wpn.splash || 0 });
            if (direct && !direct.dead) this._damage(direct, wpn.damage * (wpn.vs[this._armor(direct)] || 0), fromId, team);
            if (wpn.splash > 0) {
                const r = wpn.splash;
                const victims = [];
                this._near(ix, iz, r + 1, (e) => {
                    if (e.team === team || e.dead || e === direct) return;
                    if (Math.hypot(e.x - ix, e.z - iz) - e.radius <= r) victims.push(e);
                });
                for (const b of this._blds()) {
                    if (b.team === team || b.dead || b === direct) continue;
                    if (this._rangeTo({ x: ix, z: iz }, b) <= r) victims.push(b);
                }
                for (const e of victims) {
                    this._damage(e, 0.5 * wpn.damage * (wpn.vs[this._armor(e)] || 0), fromId, team);
                    if (wpn.stun) this._stun(e, wpn.stun);
                }
            }
            if (wpn.stun && direct) this._stun(direct, wpn.stun);
        }
        _damage(e, amt, fromId, fromTeam) {
            if (e.dead || !(amt > 0)) return;
            e.hp -= amt;
            e._hitBy = fromId; e._hitT = this.time;
            if (e.kind === 'building') this._alert(e.team, 'Base under attack', e.x, e.z, 'base', 20);
            else if (e.type === 'harvester') this._alert(e.team, 'Harvester under attack', e.x, e.z, 'harv', 20);
            if (e.hp <= 0) this._kill(e, fromTeam, false);
        }
        _kill(e, byTeam, sold) {
            if (e.dead) return;
            e.dead = true; e.hp = 0; e._deadTick = this.tick; e.state = 'idle';
            this._ev({ type: 'death', id: e.id, team: e.team, kind: e.kind, what: e.type, x: e.x, z: e.z, sold: !!sold });
            const tm = this.teams[e.team], en = byTeam >= 0 && byTeam !== e.team ? this.teams[byTeam] : null;
            if (e.kind === 'building') {
                this._removeBuildingTiles(e);
                this._dirty = true;
                if (!sold) {
                    tm.stats.buildingsLost++;
                    if (en) en.stats.buildingsDestroyed++;
                    this._alert(e.team, 'Structure lost', e.x, e.z, 'lost', 4);
                }
            } else {
                tm.stats.unitsLost++;
                if (en) en.stats.kills++;
                if (e.type === 'harvester') { this._releaseClaim(e); this._alert(e.team, 'Harvester lost', e.x, e.z, 'harvlost', 3); }
            }
        }
        _okPos(x, z, strict) {
            const w = this.map.w, h = this.map.h;
            if (x < 0.02 || z < 0.02 || x > w - 0.02 || z > h - 0.02) return false;
            const B = this.block;
            if (B[(z | 0) * w + (x | 0)] !== 0) return false;
            if (!strict) return true;
            const c = 0.18;
            return B[((z - c) | 0) * w + ((x - c) | 0)] === 0 && B[((z - c) | 0) * w + ((x + c) | 0)] === 0 &&
                B[((z + c) | 0) * w + ((x - c) | 0)] === 0 && B[((z + c) | 0) * w + ((x + c) | 0)] === 0;
        }
        _tryMove(u, nx, nz) {
            const strict = this._okPos(u.x, u.z, true);
            if (this._okPos(nx, nz, strict)) { u.x = nx; u.z = nz; return true; }
            if (this._okPos(nx, u.z, strict)) { u.x = nx; return true; }
            if (this._okPos(u.x, nz, strict)) { u.z = nz; return true; }
            return false;
        }
        // Follow the path; returns true when the last waypoint is reached (or the unit gives up).
        _moveAlong(u, def) {
            const T = this.cfg.TICK;
            const p = u._path;
            if (!p || !p.length) { u._path = null; return true; }
            let wp = p[u._pi];
            let last = u._pi === p.length - 1;
            let dx = wp.x - u.x, dz = wp.z - u.z, d = Math.hypot(dx, dz);
            const reach = last ? 0.12 : Math.max(0.3, def.radius * 0.8);
            if (d <= reach) {
                u._pi++;
                if (u._pi >= p.length) { u._path = null; return true; }
                wp = p[u._pi]; last = u._pi === p.length - 1;
                dx = wp.x - u.x; dz = wp.z - u.z; d = Math.hypot(dx, dz);
            }
            const want = Math.atan2(dz, dx);
            u.angle = turnToward(u.angle, want, def.turn * T);
            const diff = Math.abs(angDiff(u.angle, want));
            let f = 1;
            if (def.turn < 8) f = diff > 1.3 ? 0 : Math.max(0.2, Math.cos(diff));
            if (!def.turret) u.turret = u.angle;
            else if (!u.targetId) u.turret = turnToward(u.turret, u.angle, 2.5 * T);
            let spd = u._vmax && u.state !== 'attack' ? Math.min(def.speed, u._vmax) : def.speed;
            // fast hover units (shardBonus) skim over shard fields a little faster; gravity wells slow enemies
            if (def.hover && def.shardBonus && this.map.tiles[(u.z | 0) * this.map.w + (u.x | 0)] === 2) spd *= HOVER_SHARD_BOOST;
            if (u.slowed) spd *= 1 - u._slow;
            const stp = Math.min(d, spd * f * T);
            if (stp > 1e-4) this._tryMove(u, u.x + dx / d * stp, u.z + dz / d * stp);
            // stuck detection (only while we should be making headway)
            if (f > 0.5) {
                u._stuckT += T;
                if (u._stuckT >= 0.8) {
                    const moved = Math.hypot(u.x - u._sx, u.z - u._sz);
                    if (moved < def.speed * 0.8 * 0.15) {
                        u._stuck++;
                        const fin = p[p.length - 1];
                        const dg = Math.hypot(fin.x - u.x, fin.z - u.z);
                        if ((u._stuck >= 2 && dg < 2.5) || u._stuck >= 6) { u._path = null; u._stuck = 0; return true; }
                        if (u._stuck === 2 || u._stuck === 4) { this._requestPath(u, fin.x, fin.z); }
                    } else u._stuck = 0;
                    u._stuckT = 0; u._sx = u.x; u._sz = u.z;
                }
            }
            return false;
        }
        _separate() {
            const units = this._units;
            for (const u of units) { u._px = 0; u._pz = 0; }
            const mass = (u) => {
                const a = this.cfg.UNITS[u.type].armor;
                let m = a === 'inf' ? 1 : a === 'light' ? 2.5 : 4;
                if (u.type === 'harvester') m = (u._h === 'mine' || u._h === 'unload') ? 20 : 5;
                if (u.state === 'attack' && !u._path) m *= 2.5;
                else if (!u._path) m *= 0.6;
                return m;
            };
            for (const a of units) {
                if (a.dead) continue;
                const ra = a.radius;
                this._near(a.x, a.z, ra + 0.7, (b) => {
                    if (b.id <= a.id || b.dead) return;
                    const minD = (ra + b.radius) * 0.95;
                    let dx = b.x - a.x, dz = b.z - a.z;
                    const d2 = dx * dx + dz * dz;
                    if (d2 >= minD * minD) return;
                    let d = Math.sqrt(d2);
                    if (d < 1e-4) { const ang = ((a.id * 7919 + b.id * 104729) % 628) / 100; dx = Math.cos(ang); dz = Math.sin(ang); d = 1; }
                    else { dx /= d; dz /= d; }
                    const ov = (minD - Math.min(d, minD)) * 0.5;
                    const ma = mass(a), mb = mass(b), s = ma + mb;
                    a._px -= dx * ov * mb / s; a._pz -= dz * ov * mb / s;
                    b._px += dx * ov * ma / s; b._pz += dz * ov * ma / s;
                });
            }
            for (const u of units) {
                if (u.dead || (u._px === 0 && u._pz === 0)) continue;
                let px = u._px, pz = u._pz;
                const l = Math.hypot(px, pz);
                if (l > 0.12) { px *= 0.12 / l; pz *= 0.12 / l; }
                this._tryMove(u, u.x + px, u.z + pz);
            }
        }

        // ================= harvesters =================
        _releaseClaim(u) {
            if (u._tile >= 0 && this.claim[u._tile] === u.id) this.claim[u._tile] = 0;
            u._tile = -1;
        }
        // Pick the next shard tile: among the nearest few (by walking distance from the start), the one that keeps
        // the round trip to the refinery short and has the most shards. Scored, not first-found, so the choice
        // doesn't depend on neighbour order (which would favour one side of the map).
        _findShard(u, px, pz) {
            const w = this.map.w, h = this.map.h, sh = this.map.shards, claim = this.claim, block = this.block;
            const P = this.path, q = P.q, mark = P.mark, depth = P.depth;
            const ref = this._nearestRefinery(u);
            const dock = ref ? this._exitPoint(ref) : null;
            const search = (s, limit) => {
                const cur = ++P.markCur;
                let qh = 0, qt = 0, best = -1, bs = Infinity, firstD = -1;
                q[qt++] = s; mark[s] = cur; depth[s] = 0;
                while (qh < qt && qh < limit) {
                    const i = q[qh++], di = depth[i];
                    if (firstD >= 0 && di > firstD + 3) break;
                    if (sh[i] > 25 && (claim[i] === 0 || claim[i] === u.id)) {
                        if (firstD < 0) firstD = di;
                        const cx = (i % w) + 0.5, cz = ((i / w) | 0) + 0.5;
                        const sc = di + (dock ? 0.6 * Math.hypot(cx - dock.x, cz - dock.z) : 0) - 1.5 * sh[i] / 400;
                        if (sc < bs) { bs = sc; best = i; }
                    }
                    const x = i % w, z = (i / w) | 0;
                    for (let k = 0; k < 8; k++) {
                        const nx = x + DX8[k], nz = z + DZ8[k];
                        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
                        const j = nz * w + nx;
                        if (mark[j] === cur || block[j]) continue;
                        if (k >= 4 && (block[z * w + nx] || block[nz * w + x])) continue;
                        mark[j] = cur; depth[j] = di + 1; q[qt++] = j;
                    }
                }
                return best;
            };
            let res = -1;
            if (isFinite(px)) {
                const s = this._nearestFreeTile(px | 0, pz | 0, 8);
                if (s >= 0) res = search(s, 400);
            }
            if (res < 0) res = search(this._tileOf(u), P.n);
            return res;
        }
        _nearestRefinery(u) {
            let best = null, bd = Infinity;
            for (const b of this._blds()) {
                if (b.team !== u.team || b.dead || b.type !== 'refinery' || b.built < 1) continue;
                const d = Math.hypot(b.x - u.x, b.z - u.z);
                if (d < bd) { bd = d; best = b; }
            }
            return best;
        }
        _updateHarvester(u, def) {
            const T = this.cfg.TICK, map = this.map, w = map.w, tm = this.teams[u.team];
            switch (u._h) {
                case 'move':
                    if (u._path) { u.state = 'move'; if (this._moveAlong(u, def)) { u._h = 'idle'; u.state = 'idle'; } }
                    else if (!u._need) { u._h = 'idle'; u.state = 'idle'; }
                    return;
                case 'seek': {
                    u.state = 'harvest';
                    if (u._wait > 0) { u._wait -= T; if (u._wait > 0) { u.state = 'idle'; return; } }
                    if (!this._nearestRefinery(u) && u.carry <= 0) { u._wait = 2; u.state = 'idle'; return; }
                    if (u.carry >= def.capacity) { u._h = 'toRef'; u._refId = 0; return; }
                    const tile = this._findShard(u, u._prefX, u._prefZ);
                    if (tile < 0) {
                        if (u.carry > 0) { u._h = 'toRef'; u._refId = 0; } else { u._wait = 3; u.state = 'idle'; }
                        return;
                    }
                    u._tile = tile; this.claim[tile] = u.id;
                    u._prefX = (tile % w) + 0.5; u._prefZ = ((tile / w) | 0) + 0.5;
                    u._h = 'toField';
                    this._requestPath(u, u._prefX, u._prefZ);
                    return;
                }
                case 'toField': {
                    u.state = 'harvest';
                    const i = u._tile;
                    if (i < 0 || map.shards[i] <= 0) { this._releaseClaim(u); u._h = 'seek'; return; }
                    const cx = (i % w) + 0.5, cz = ((i / w) | 0) + 0.5;
                    const onTile = (u.x | 0) === (i % w) && (u.z | 0) === ((i / w) | 0);
                    if (onTile && (Math.hypot(u.x - cx, u.z - cz) < 0.45 || !u._path)) {
                        u._path = null; u._need = null; u._h = 'mine';
                        this._ev({ type: 'harvest', id: u.id });
                        return;
                    }
                    if (u._path) this._moveAlong(u, def);
                    else if (!u._need) {
                        // ended next to it (crowded) — mine from an adjacent spot is fine if we're touching the tile
                        if (Math.hypot(u.x - cx, u.z - cz) < 1.0) { u._h = 'mine'; this._ev({ type: 'harvest', id: u.id }); }
                        else { this._releaseClaim(u); u._h = 'seek'; u._wait = 0.5; }
                    }
                    return;
                }
                case 'mine': {
                    u.state = 'harvest';
                    const i = u._tile;
                    if (i < 0) { u._h = 'seek'; return; }
                    const cx = (i % w) + 0.5, cz = ((i / w) | 0) + 0.5;
                    if (Math.hypot(cx - u.x, cz - u.z) > 0.15) u.angle = turnToward(u.angle, Math.atan2(cz - u.z, cx - u.x), def.turn * T);
                    const a = Math.min(def.harvestRate * T, map.shards[i], def.capacity - u.carry);
                    map.shards[i] -= a; u.carry += a;
                    if (map.shards[i] <= 0.5) {
                        map.shards[i] = 0; map.tiles[i] = 0; map.shardVersion++;
                        this._releaseClaim(u);
                        u._h = u.carry >= def.capacity - 1e-6 ? 'toRef' : 'seek'; u._refId = 0;
                    } else if (u.carry >= def.capacity - 1e-6) {
                        u.carry = def.capacity;
                        this._releaseClaim(u);
                        u._h = 'toRef'; u._refId = 0;
                    }
                    return;
                }
                case 'toRef': {
                    u.state = 'return';
                    let ref = u._refId ? this.entities.get(u._refId) : null;
                    if (!ref || ref.dead) {
                        if (u._wait > 0) { u._wait -= T; u.state = 'idle'; return; }
                        ref = this._nearestRefinery(u);
                        if (!ref) { u._wait = 2; u.state = 'idle'; return; }
                        u._refId = ref.id;
                        u._dock = this._exitPoint(ref);
                        this._requestPath(u, u._dock.x, u._dock.z);
                    }
                    const dk = u._dock, dd = Math.hypot(dk.x - u.x, dk.z - u.z);
                    if (dd < 0.6 || (!u._path && !u._need && dd < 1.6)) {
                        u._path = null; u._need = null; u._h = 'unload'; u.state = 'unload';
                        return;
                    }
                    if (u._path) this._moveAlong(u, def);
                    else if (!u._need) this._requestPath(u, dk.x, dk.z);
                    return;
                }
                case 'unload': {
                    u.state = 'unload';
                    const ref = this.entities.get(u._refId);
                    if (!ref || ref.dead) { u._h = 'toRef'; u._refId = 0; return; }
                    u.angle = turnToward(u.angle, -this.faceOf(u.team) * Math.PI / 2, def.turn * T);
                    const a = Math.min(def.unloadRate * T, u.carry);
                    u.carry -= a;
                    const gain = a * tm.income;
                    tm.credits += gain; tm.stats.creditsHarvested += gain;
                    if (u.carry <= 1e-6) { u.carry = 0; u._h = 'seek'; u._wait = 0; }
                    return;
                }
                default:
                    u.state = 'idle';
                    if (u._path) this._moveAlong(u, def);
            }
        }
        _regrowShards() {
            const map = this.map, max = this.cfg.ECONOMY.shardPerTile, g = this.cfg.ECONOMY.shardRegrow;
            for (const i of this._regrow) {
                if (this.block[i] !== 0 || map.shards[i] >= max) continue;
                const was = map.shards[i];
                map.shards[i] = Math.min(max, was + g);
                if (map.tiles[i] !== 2) { map.tiles[i] = 2; map.shardVersion++; }
            }
        }

        // ================= cloak =================
        // A cloaked unit (Phantom) is hidden from the enemy unless it fired in the last `cloakDelay` seconds or one
        // of the enemy's units or buildings is within `revealRange` tiles. `entity.cloaked` is true while hidden.
        _updateCloak() {
            const U = this.cfg.UNITS;
            for (const u of this._units) {
                if (!u._cloak || u.dead) continue;
                const def = U[u.type];
                let seen = u.firing < def.cloakDelay;
                if (!seen) seen = this._enemyWithin(u, def.revealRange);
                const hidden = !seen;
                if (hidden !== u.cloaked) {
                    u.cloaked = hidden;
                    this._ev({ type: 'cloak', id: u.id, team: u.team, on: hidden });
                }
            }
        }
        _enemyWithin(u, r) {
            let found = false;
            this._near(u.x, u.z, r + 1, (e) => {
                if (found || e.team === u.team || e.dead) return;
                if (Math.hypot(e.x - u.x, e.z - u.z) <= r) found = true;
            });
            if (found) return true;
            for (const b of this._buildings) {
                if (b.team === u.team || b.dead) continue;
                if (Math.abs(b.x - u.x) > r + 3 || Math.abs(b.z - u.z) > r + 3) continue;
                if (this._rangeTo(u, b) <= r) return true;
            }
            return false;
        }

        // ================= superweapons =================
        // Each superweapon building charges for SUPERWEAPONS[kind].charge seconds while powered; team.super shows
        // the most charged one. A destroyed building loses its charge; firing restarts it at 0.
        _updateSuper() {
            const T = this.cfg.TICK, B = this.cfg.BUILDINGS, SW = this.cfg.SUPERWEAPONS;
            const best = [null, null];
            for (const b of this._buildings) {
                if (b.dead || !b._done) continue;
                const def = B[b.type];
                if (!def.superweapon) continue;
                const sw = SW[def.superweapon], tm = this.teams[b.team];
                if (!b.ready && !tm.lowPower && !tm.defeated) {
                    b._charge = Math.min(sw.charge, b._charge + T);
                    if (b._charge >= sw.charge) {
                        b.ready = true;
                        this._alert(b.team, sw.name + ' ready', b.x, b.z, 'swready' + b.id);
                        this._alert(1 - b.team, 'Enemy ' + sw.name + ' ready', b.x, b.z, 'swenemy' + b.id);
                    }
                }
                b.charge = Math.max(0, b._charge) / sw.charge;
                const cur = best[b.team];
                if (!cur || b._charge > cur._charge || (b._charge === cur._charge && b.id < cur.id)) best[b.team] = b;
            }
            for (const tm of this.teams) {
                const b = best[tm.id];
                if (!b) { tm.super = null; continue; }
                const kind = B[b.type].superweapon;
                const s = tm.super || (tm.super = {});
                s.type = kind; s.kind = kind; s.name = SW[kind].name; s.building = b.id;
                s.charge = b.charge; s.ready = b.ready; s.radius = SW[kind].radius; s.paused = !b.ready && tm.lowPower;
                s.eta = b.ready ? 0 : (SW[kind].charge - Math.max(0, b._charge));
            }
        }
        _cmdSuper(team, x, z) {
            const tm = this.teams[team];
            if (!tm.super) this._updateSuper();
            const s = tm.super;
            if (!s || !s.ready || !isFinite(x) || !isFinite(z)) return false;
            const w = this.map.w, h = this.map.h;
            if (x < 0 || z < 0 || x >= w || z >= h) return false;
            if (tm.vis[(z | 0) * w + (x | 0)] < 1) return false;           // explored ground only
            const b = this.entities.get(s.building);
            if (!b || b.dead || !b.ready) return false;
            const sw = this.cfg.SUPERWEAPONS[s.kind];
            b.ready = false; b._charge = 0; b.charge = 0;
            const st = { id: this._sid++, team, kind: s.kind, x, z, t: sw.warn, warn: sw.warn, at: this.time + sw.warn, radius: sw.radius, from: b.id };
            this.strikes.push(st);
            this._ev({ type: 'superweapon', team, kind: s.kind, x, z, phase: 'warn', warn: sw.warn, radius: sw.radius, id: st.id, from: b.id });
            for (const t of [0, 1]) this._ev({ type: 'alert', team: t, text: 'Superweapon launched', x, z });
            s.ready = false; s.charge = 0; s.eta = sw.charge;
            if (this.mission) this._missionOnSuper(team);
            return true;
        }
        _updateStrikes() {
            if (!this.strikes.length) return;
            const T = this.cfg.TICK;
            const keep = [];
            for (const st of this.strikes) {
                st.t -= T;
                if (st.t > 1e-9) { keep.push(st); continue; }
                this._strike(st);
            }
            this.strikes = keep;
        }
        // Damage × vs[armor], falling off linearly from the centre to damage × falloff at the edge of the radius.
        // It hurts everything under it, the owner's own units included.
        _strike(st) {
            const sw = this.cfg.SUPERWEAPONS[st.kind], R = sw.radius;
            this._ev({ type: 'superweapon', team: st.team, kind: st.kind, x: st.x, z: st.z, phase: 'strike', radius: R, id: st.id });
            const hits = [];
            for (const e of this.entities.values()) {
                if (e.dead) continue;
                const d = e.kind === 'building' ? this._rangeTo({ x: st.x, z: st.z }, e) : Math.max(0, Math.hypot(e.x - st.x, e.z - st.z) - e.radius);
                if (d > R) continue;
                hits.push([e, this.strikeDamage(st.kind, d, this._armor(e))]);
            }
            for (const [e, amt] of hits) this._damage(e, amt, 0, st.team);
            this._explore(st.team, st.x, st.z, R + 1);
        }
        // Strike damage at distance d from the centre against an armor class (also used by the AI and the tests).
        strikeDamage(kind, d, armor) {
            const sw = this.cfg.SUPERWEAPONS[kind];
            if (!sw || d > sw.radius) return 0;
            return sw.damage * (1 - (1 - sw.falloff) * Math.max(0, d) / sw.radius) * (sw.vs[armor] || 0);
        }

        // ================= scripted units (missions) =================
        // Hunters keep attack-moving at the nearest enemy building (then unit); patrols walk their loop.
        _updateScripted() {
            for (const u of this._units) {
                if (u.dead || (!u._hunt && !u._patrol)) continue;
                if (u._order || u.targetId || u._path || u._need) continue;
                if (u._patrol) {
                    const p = u._patrol[u._pk++ % u._patrol.length];
                    this._orderSingle(u, p.x, p.z, 'attackMove');
                    continue;
                }
                let best = null, bd = Infinity;
                for (const b of this._buildings) {
                    if (b.dead || b.team === u.team) continue;
                    const d = Math.hypot(b.x - u.x, b.z - u.z);
                    if (d < bd) { bd = d; best = b; }
                }
                if (!best) for (const e of this._units) {
                    if (e.dead || e.team === u.team || e.cloaked) continue;
                    const d = Math.hypot(e.x - u.x, e.z - u.z);
                    if (d < bd) { bd = d; best = e; }
                }
                if (best) {
                    const ap = best.kind === 'building' ? this._aimPoint(best, u) : best;
                    this._orderSingle(u, ap.x, ap.z, 'attackMove');
                }
            }
        }

        // ================= missions =================
        _side(t) { return t === 'player' || t === undefined ? this.playerTeam : t === 'enemy' ? 1 - this.playerTeam : (t | 0); }
        _tag(e, tag) {
            if (!tag) return;
            e.tag = tag;
            let l = this._tags.get(tag);
            if (!l) this._tags.set(tag, l = []);
            l.push(e);
        }
        // Every entity ever given this mission tag (dead ones included).
        tagged(tag) { return this._tags.get(tag) || []; }
        // Nearest spot to (tx, tz) where a building of `type` fits (open ground, no shards), ignoring build radius.
        _placeNear(type, tx, tz) {
            const def = this.cfg.BUILDINGS[type], w = this.map.w, h = this.map.h;
            const fits = (x0, z0) => {
                if (x0 < 0 || z0 < 0 || x0 + def.w > w || z0 + def.d > h) return false;
                for (let z = z0; z < z0 + def.d; z++) for (let x = x0; x < x0 + def.w; x++) {
                    const i = z * w + x;
                    if (this.block[i] !== 0 || this.map.shards[i] > 0) return false;
                }
                return true;
            };
            tx |= 0; tz |= 0;
            for (let r = 0; r < 20; r++) {
                let best = null, bd = Infinity;
                for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || !fits(tx + dx, tz + dz)) continue;
                    const d = dx * dx + dz * dz;
                    if (d < bd) { bd = d; best = { tx: tx + dx, tz: tz + dz }; }
                }
                if (best) return best;
            }
            return null;
        }
        _spawnGroup(team, list, at, spread) {
            const out = [];
            const n = list.length;
            list.forEach((type, k) => {
                if (!this.cfg.UNITS[type]) return;
                const a = k * 2.399963, r = n > 1 ? (spread || 0.8) * Math.sqrt(k + 0.5) : 0;
                const u = this.spawnUnit(team, type, at.x + Math.cos(a) * r, at.z + Math.sin(a) * r, true);
                const face = Math.atan2(this.map.h / 2 - u.z, this.map.w / 2 - u.x);
                u.angle = u.turret = face;
                out.push(u);
            });
            return out;
        }
        _missionSetup(M, side) {
            for (let t = 0; t < 2; t++) {
                const sd = side[t];
                for (const bd of sd.buildings || []) {
                    if (!this.cfg.BUILDINGS[bd.type]) continue;
                    const sp = this._placeNear(bd.type, bd.tx, bd.tz);
                    if (!sp) continue;
                    const b = this._addBuilding(t, bd.type, sp.tx, sp.tz, 1);
                    this._tag(b, bd.tag);
                    if (b._charge !== undefined && bd.delay) b._charge = -bd.delay;   // superweapon: starts charging later
                    this.teams[t].stats.buildingsBuilt++;
                }
                for (const ud of sd.units || []) {
                    const types = Array.isArray(ud.type) ? ud.type : new Array(ud.count || 1).fill(ud.type);
                    for (const u of this._spawnGroup(t, types, ud, ud.spread)) {
                        this._tag(u, ud.tag);
                        if (ud.patrol) u._patrol = ud.patrol.map((p) => ({ x: p.x, z: p.z }));
                        if (ud.hunt) u._hunt = true;
                        if (ud.angle !== undefined) u.angle = u.turret = ud.angle;
                    }
                }
                // explore around everything this side starts with
                for (const e of this.entities.values()) if (e.team === t) this._explore(t, e.x, e.z, e.kind === 'building' ? 8 : 6);
            }
            this.mission = {
                id: M.id, title: M.title, status: 'active', time: 0, reason: '',
                objectives: (M.objectives || []).map((o) => ({
                    id: o.id, text: o.text, kind: o.kind, done: false, failed: false, progress: '', optional: !!o.optional, hidden: !!o.hidden,
                })),
            };
            this._mObj = new Map();
            (M.objectives || []).forEach((o, k) => this._mObj.set(o.id, { def: o, pub: this.mission.objectives[k], since: o.hidden ? null : 0 }));
            this._mTrig = (M.triggers || []).map((tr) => ({ def: tr, fired: 0, next: null, pending: [] }));
        }
        _missionOnSuper(team) {
            if (team === this.playerTeam || this.mission.status !== 'active') return;
            for (const o of this._mObj.values()) {
                if (o.def.failOn === 'enemySuperweapon' && !o.pub.done && !o.pub.failed) this._setObj(o, false, true);
            }
        }
        _setObj(o, done, failed) {
            if (o.pub.done === done && o.pub.failed === failed) return;
            o.pub.done = done; o.pub.failed = failed;
            this._ev({ type: 'objective', id: o.pub.id, done, failed, text: o.pub.text, optional: o.pub.optional, progress: o.pub.progress });
        }
        _revealObj(id) {
            const o = this._mObj.get(id);
            if (!o || o.since !== null) return;
            o.since = this.time; o.pub.hidden = false;
            this._evalObj(o);
            this._ev({ type: 'objective', id, done: false, failed: false, text: o.pub.text, optional: o.pub.optional, revealed: true, progress: o.pub.progress });
        }
        _inArea(team, a, types) {
            let n = 0;
            for (const u of this._units) {
                if (u.dead || u.team !== team || (types && types.indexOf(u.type) < 0)) continue;
                if (Math.hypot(u.x - a.x, u.z - a.z) <= a.r) n++;
            }
            return n;
        }
        _evalObj(o) {
            const d = o.def, me = this.playerTeam, en = 1 - me, pub = o.pub;
            const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
            const types = d.type ? (Array.isArray(d.type) ? d.type : [d.type]) : null;
            switch (d.kind) {
                case 'build': {
                    let n = 0;
                    for (const b of this._buildings) if (!b.dead && b.team === me && b.built >= 1 && (!types || types.indexOf(b.type) >= 0)) n++;
                    const need = d.count || 1;
                    pub.progress = `${Math.min(n, need)}/${need}`;
                    return n >= need;
                }
                case 'harvest': {
                    const got = this.teams[me].stats.creditsHarvested;
                    pub.progress = `${Math.min(d.credits, Math.floor(got))}/${d.credits}`;
                    return got >= d.credits;
                }
                case 'army': {
                    let n = 0;
                    for (const u of this._units) if (!u.dead && u.team === me && u.type !== 'harvester' && (!types || types.indexOf(u.type) >= 0)) n++;
                    const need = d.count || 1;
                    pub.progress = `${Math.min(n, need)}/${need}`;
                    return n >= need;
                }
                case 'survive': {
                    const left = Math.max(0, d.seconds - (this.time - (o.since || 0)));
                    pub.progress = fmt(Math.ceil(left));
                    return left <= 0;
                }
                case 'destroyAll': {
                    let n = 0;
                    for (const b of this._buildings) if (!b.dead && b.team === en) n++;
                    pub.progress = n ? `${n} left` : '';
                    return n === 0;
                }
                case 'destroy': {
                    const list = d.tag ? this.tagged(d.tag) : (d.ids || []).map((id) => this.entities.get(id)).filter(Boolean);
                    const dead = list.filter((e) => e.dead).length;
                    const need = d.count || list.length;
                    pub.progress = `${Math.min(dead, need)}/${need}`;
                    return list.length > 0 && dead >= need;
                }
                case 'reach': {
                    const n = this._inArea(me, d.area, types);
                    const need = d.count || 1;
                    if (need > 1) pub.progress = `${Math.min(n, need)}/${need}`;
                    return n >= need;
                }
                case 'protect': {
                    const list = this.tagged(d.tag);
                    const alive = list.filter((e) => !e.dead).length;
                    const need = d.count || list.length;
                    pub.progress = `${alive}/${list.length}`;
                    return alive < need ? 'fail' : false;
                }
            }
            return false;
        }
        _trigCond(at) {
            if (typeof at === 'number') return this.time >= at;
            if (!at) return false;
            if (at.objective) { const o = this._mObj.get(at.objective); return !!(o && o.pub.done); }
            if (at.all) return at.all.every((id) => { const o = this._mObj.get(id); return !!(o && o.pub.done); });
            if (at.failed) { const o = this._mObj.get(at.failed); return !!(o && o.pub.failed); }
            if (at.area) return this._inArea(this._side(at.team), at.area, at.types) >= (at.count || 1);
            if (at.destroyed) { const l = this.tagged(at.destroyed); return l.length > 0 && l.every((e) => e.dead); }
            if (at.lost) return this.tagged(at.lost).some((e) => e.dead);    // any tagged entity died
            if (at.seen) return this.tagged(at.seen).some((e) => !e.dead && this.isVisible(this.playerTeam, e));
            if (at.spotted) {   // the enemy can see one of the player's units (tagged ones, if a tag is given)
                const list = at.spotted === true ? this._units.filter((u) => u.team === this.playerTeam) : this.tagged(at.spotted);
                return list.some((u) => !u.dead && u.kind === 'unit' && this.isVisible(1 - this.playerTeam, u));
            }
            if (at.superReady) { const s = this.teams[this._side(at.superReady)].super; return !!(s && s.ready); }
            return false;
        }
        _trigDo(actions) {
            for (const a of actions || []) {
                if (a.message) this._ev({ type: 'message', from: a.message.from, text: a.message.text, portrait: a.message.portrait || null, side: a.message.side || null });
                if (a.objective) for (const id of [].concat(a.objective)) this._revealObj(id);
                if (a.credits) { const tm = this.teams[this._side(a.credits.team)]; tm.credits += a.credits.amount || 0; }
                if (a.reveal) this._explore(this._side(a.reveal.team), a.reveal.x, a.reveal.z, a.reveal.r || 6);
                if (a.allow) {
                    const tm = this.teams[this._side(a.allow.team)];
                    if (tm.allow) for (const ty of a.allow.add || []) tm.allow.add(ty);
                }
                if (a.alert) this._alert(this.playerTeam, a.alert.text || a.alert, a.alert.x, a.alert.z, 'mission' + this.time);
                if (a.spawn) {
                    const sp = a.spawn, team = this._side(sp.team === undefined ? 'enemy' : sp.team);
                    const units = this._spawnGroup(team, sp.units || [], sp.at, sp.spread);
                    for (const u of units) {
                        this._tag(u, sp.tag);
                        this._ev({ type: 'spawn', id: u.id, team, what: u.type });
                    }
                    let goal = sp.attackMove || sp.move;
                    if (goal === 'base') goal = this._baseOf(1 - team);
                    if (goal && units.length) this._groupMove(units, goal.x, goal.z, sp.move ? 'move' : 'attackMove');
                    if (sp.hunt !== false && sp.attackMove) for (const u of units) u._hunt = true;
                }
                if (a.end) this._missionEnd(a.end.status || 'won', a.end.reason || '');
            }
        }
        _baseOf(team) {
            let core = null, any = null;
            for (const b of this._blds()) {
                if (b.dead || b.team !== team) continue;
                if (b.type === 'core') core = b; else if (!any) any = b;
            }
            const b = core || any;
            if (b) return { x: b.x, z: b.z };
            const s = this.map.starts[team];
            return { x: s.tx + 1.5, z: s.tz + 1.5 };
        }
        _missionUpdate() {
            const m = this.mission;
            m.time = this.time;
            if (m.status !== 'active') return;
            if (this._dirty) this._refreshLists();
            // objectives
            for (const o of this._mObj.values()) {
                if (o.since === null || o.pub.failed || o.pub.done) continue;
                const r = this._evalObj(o);
                if (r === 'fail') this._setObj(o, false, true);
                else if (r === true) this._setObj(o, true, false);
            }
            // triggers: each fires once (or every `every` s from `at` while under `until`/`count`); `delay` postpones it
            for (const tr of this._mTrig) {
                const d = tr.def;
                if (tr.pending.length) tr.pending = tr.pending.filter((at) => { if (this.time >= at) { this._trigDo(d.do); return false; } return true; });
                if (d.every) {
                    if (tr.next === null) { if (this._trigCond(d.at === undefined ? 0 : d.at)) tr.next = this.time; else continue; }
                    if ((d.until !== undefined && this.time > d.until) || (d.count && tr.fired >= d.count)) continue;
                    if (this.time >= tr.next) { tr.fired++; tr.next += d.every; this._trigDo(d.do); }
                    continue;
                }
                if (tr.fired || !this._trigCond(d.at)) continue;
                tr.fired = 1;
                if (d.delay) tr.pending.push(this.time + d.delay); else this._trigDo(d.do);
                if (m.status !== 'active') return;
            }
            // win / lose
            const me = this.playerTeam, M = this.missionDef;
            for (const o of this._mObj.values()) {
                if (!o.pub.optional && o.pub.failed) { this._missionEnd('lost', 'Objective failed: ' + o.pub.text); return; }
            }
            for (const c of M.lose || ['noBuildings']) {
                if (c === 'noBuildings' && !this._buildings.some((b) => !b.dead && b.team === me)) { this._missionEnd('lost', 'Your base was destroyed'); return; }
                if (c === 'noUnits' && !this._units.some((u) => !u.dead && u.team === me)) { this._missionEnd('lost', 'Your forces were wiped out'); return; }
                if (c && c.protect) {
                    const list = this.tagged(c.protect);
                    if (list.length && list.filter((e) => !e.dead).length < (c.min || 1)) { this._missionEnd('lost', c.reason || 'A unit you had to protect was lost'); return; }
                }
            }
            const req = [...this._mObj.values()].filter((o) => !o.pub.optional);
            const met = (o) => (o.def.kind === 'protect' ? !o.pub.failed : o.pub.done);
            if ((M.win || 'objectives') === 'objectives' && req.some((o) => o.def.kind !== 'protect') && req.every(met)) {
                this._missionEnd('won', 'All objectives complete');
            }
        }
        _missionEnd(status, reason) {
            const m = this.mission;
            if (!m || m.status !== 'active') return;
            m.status = status; m.reason = reason; m.time = this.time;
            const me = this.playerTeam;
            if (status === 'won') for (const o of this._mObj.values()) if (o.def.kind === 'protect' && !o.pub.failed && o.since !== null) this._setObj(o, true, false);
            this._ev({ type: 'mission', status, reason });
            this.winner = status === 'won' ? me : 1 - me;
            this.teams[1 - this.winner].defeated = true;
            this._alert(this.winner, 'Victory');
            this._alert(1 - this.winner, 'Defeat');
            this._ev({ type: 'gameover', winner: this.winner });
        }

        // ================= fog of war =================
        _disc(r) {
            const key = Math.round(r * 2);
            let d = this._discs.get(key);
            if (d) return d;
            const rr = key / 2, out = [];
            const R = Math.ceil(rr);
            for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dz * dz <= rr * rr + 0.25) out.push(dx, dz);
            d = new Int8Array(out);
            this._discs.set(key, d);
            return d;
        }
        _updateFog() {
            const w = this.map.w, h = this.map.h, n = w * h;
            for (const tm of this.teams) { const v = tm.vis; for (let i = 0; i < n; i++) if (v[i] === 2) v[i] = 1; }
            const C = this.cfg;
            for (const e of this.entities.values()) {
                if (e.dead) continue;
                const v = this.teams[e.team].vis;
                const sight = e.kind === 'unit' ? C.UNITS[e.type].sight : C.BUILDINGS[e.type].sight + Math.max(e.w, e.d) / 2 - 0.5;
                const d = this._disc(sight);
                const cx = e.x | 0, cz = e.z | 0;
                for (let k = 0; k < d.length; k += 2) {
                    const x = cx + d[k], z = cz + d[k + 1];
                    if (x >= 0 && z >= 0 && x < w && z < h) v[z * w + x] = 2;
                }
            }
        }

        _checkDefeat() {
            if (this.winner !== null) return;
            const alive = [0, 0];
            for (const b of this._blds()) if (!b.dead) alive[b.team]++;
            // buildings killed this tick are still in the list but flagged dead — counted correctly above
            let lost = -1;
            for (const tm of this.teams) {
                if (!tm.defeated && alive[tm.id] === 0) {
                    tm.defeated = true; lost = tm.id;
                    this._alert(tm.id, 'Defeat');
                }
            }
            if (lost >= 0) {
                const live = this.teams.filter((t) => !t.defeated);
                this.winner = live.length === 1 ? live[0].id : (live.length ? null : 1 - lost);
                if (this.winner !== null) {
                    this._alert(this.winner, 'Victory');
                    this._ev({ type: 'gameover', winner: this.winner });
                }
            }
        }
    }

    SF.Sim = Sim;
    SF.util = { angDiff, turnToward, norm };
})();
