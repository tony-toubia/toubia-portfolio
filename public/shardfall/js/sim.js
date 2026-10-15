// Shardfall: the simulation. Fixed-step, deterministic for a given seed and command stream, no THREE, no DOM.
// Everything balance-related comes from window.SF_CONFIG; map generation is in map.js, the computer player in ai.js.
(function () {
    'use strict';
    const SF = window.SF = window.SF || {};
    const SQ2 = Math.SQRT2;
    const DX8 = [1, -1, 0, 0, 1, 1, -1, -1];
    const DZ8 = [0, 0, 1, -1, 1, -1, 1, -1];
    const CATS = ['building', 'infantry', 'vehicle'];
    const PRODUCER = { infantry: 'barracks', vehicle: 'factory' };

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
            this.seed = (opts.seed === undefined ? 12345 : opts.seed) >>> 0;
            this.size = opts.size || 64;
            this.difficulty = cfg.AI[opts.difficulty] ? opts.difficulty : 'normal';
            this.playerTeam = opts.playerTeam === undefined ? 0 : opts.playerTeam;
            this.mirrorFronts = opts.mirrorFronts !== false;
            this.map = SF.generateMap({ seed: this.seed, size: this.size });
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
            const aiTeams = Array.isArray(opts.aiTeams) ? opts.aiTeams : (this.playerTeam === null ? [0, 1] : [1 - this.playerTeam]);
            this.teams = [0, 1].map((t) => {
                const diff = (opts.aiDifficulty && cfg.AI[opts.aiDifficulty[t]]) ? opts.aiDifficulty[t] : this.difficulty;
                const ai = aiTeams.indexOf(t) >= 0;
                return {
                    id: t, name: cfg.TEAMS[t].name, color: cfg.TEAMS[t].color,
                    credits: cfg.ECONOMY.startCredits, power: { made: 0, used: 0 }, lowPower: false, radar: false,
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
            const startUnits = opts.startUnits || ['buggy', 'rifleman', 'rifleman', 'rifleman'];
            for (let t = 0; t < 2; t++) {
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
            const pushOpt = (type, cat, def, reason) => {
                const q = tm.queues[cat];
                let queued = 0;
                for (const it of q) if (it.type === type) queued++;
                const head = q[0] && q[0].type === type ? q[0] : null;
                out.push({
                    type, name: def.name, cat, cost: def.cost, time: def.time, locked: !!reason, reason: reason || '',
                    queued, progress: head ? head.progress : 0, ready: cat === 'building' && tm.ready === type,
                    paused: !!(head && (tm.credits <= 0 || (cat === 'building' && tm.ready) || !this._hasProducer(team, cat))),
                    full: q.length >= C.ECONOMY.queueMax,
                });
            };
            for (const type in C.BUILDINGS) {
                const def = C.BUILDINGS[type];
                if (def.buildable === false) continue;
                pushOpt(type, 'building', def, this._lockReason(team, 'building', def, have));
            }
            for (const type in C.UNITS) {
                const def = C.UNITS[type];
                pushOpt(type, def.from, def, this._lockReason(team, def.from, def, have));
            }
            return out;
        }

        command(team, cmd) {
            const tm = this.teams[team];
            if (!tm || !cmd || tm.defeated) return false;
            try {
                switch (cmd.type) {
                    case 'move': return this._cmdMove(team, cmd.ids, cmd.x, cmd.z, 'move');
                    case 'attackMove': return this._cmdMove(team, cmd.ids, cmd.x, cmd.z, 'attackMove');
                    case 'attack': return this._cmdAttack(team, cmd.ids, cmd.targetId);
                    case 'stop': return this._cmdStop(team, cmd.ids);
                    case 'harvest': return this._cmdHarvest(team, cmd.ids, cmd.tx, cmd.tz);
                    case 'queue': return this._cmdQueue(team, cmd.item);
                    case 'cancel': return this._cmdCancel(team, cmd.item);
                    case 'place': return this._cmdPlace(team, cmd.item, cmd.tx, cmd.tz);
                    case 'sell': return this._cmdSell(team, cmd.id);
                    case 'rally': return this._cmdRally(team, cmd.cat, cmd.x, cmd.z);
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
            for (const b of this._buildings) if (!b.dead) this._updateBuilding(b);
            for (const u of this._units) if (!u.dead) this._updateUnit(u);
            this._separate();
            this._updateProjectiles();
            if (this.tick % 20 === 0) this._regrowShards();
            if (this.tick % 2 === 0) this._updateFog();
            this._checkDefeat();
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
            const type = cat === 'building' ? 'core' : PRODUCER[cat];
            for (const b of this._blds()) if (b.team === team && !b.dead && b.type === type && b.built >= 1) return true;
            return false;
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
            };
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
                if (def.freeUnit) {
                    const p = this._exitPoint(b);
                    const u = this.spawnUnit(b.team, def.freeUnit, p.x, p.z);
                    u.angle = u.turret = this.faceOf(b.team) * Math.PI / 2;
                    this.teams[b.team].stats.unitsBuilt++;
                }
            }
            if (!def.weapon) return;
            const tm = this.teams[b.team];
            if (tm.lowPower) { b.state = 'idle'; b.targetId = null; return; }
            const wpn = this.cfg.WEAPONS[def.weapon];
            if (b._cd > 0) b._cd -= T;
            let tgt = b.targetId ? this.entities.get(b.targetId) : null;
            if (tgt && (tgt.dead || !this.isVisible(b.team, tgt) || this._rangeTo(b, tgt) > wpn.range)) tgt = null;
            b._scan -= T;
            if (!tgt && b._scan <= 0) { b._scan = 0.3; tgt = this._acquire(b, wpn.range, 0); }
            b.targetId = tgt ? tgt.id : null;
            if (!tgt) { b.state = 'idle'; return; }
            b.state = 'attack';
            const ap = this._aimPoint(tgt, b);
            const want = Math.atan2(ap.z - b.z, ap.x - b.x);
            b.turret = turnToward(b.turret, want, 3.5 * T);
            if (Math.abs(angDiff(b.turret, want)) < 0.12 && b._cd <= 0) this._fire(b, def.weapon, wpn, tgt, ap);
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
                if (cat === 'building' && tm.ready) continue;
                if (!this._hasProducer(tm.id, cat)) continue;
                const it = q[0];
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
                if (it.progress >= 1 - 1e-7) {
                    q.shift();
                    this._ev({ type: 'complete', team: tm.id, what: it.type, cat });
                    if (cat === 'building') { tm.ready = it.type; tm.readyPaid = it.paid; }
                    else this._produceUnit(tm, it.type, cat);
                }
            }
        }
        _produceUnit(tm, type, cat) {
            // the producer nearest to the rally point (or the newest)
            const ptype = PRODUCER[cat];
            const rally = tm.rally[cat];
            let prod = null, bd = Infinity;
            for (const b of this._blds()) {
                if (b.team !== tm.id || b.dead || b.type !== ptype || b.built < 1) continue;
                const d = rally ? Math.hypot(b.x - rally.x, b.z - rally.z) : -b.id;
                if (d < bd) { bd = d; prod = b; }
            }
            if (!prod) return;
            const p = this._exitPoint(prod);
            const u = this.spawnUnit(tm.id, type, p.x, p.z);
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
            u.targetId = null; u._chaseX = NaN;
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
            this._resetStuck(u);
        }
        _repath(u) {
            if (!u._path || !u._path.length) return;
            const last = u._path[u._path.length - 1];
            this._requestPath(u, last.x, last.z);
        }
        _cmdAttack(team, ids, targetId) {
            const t = this.entities.get(targetId);
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
                u._order = null; u._path = null; u._need = null; u.targetId = null;
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
            if (this._lockReason(team, cat, def, this._haveMap(team))) return false;
            const q = tm.queues[cat];
            if (q.length >= C.ECONOMY.queueMax) return false;
            q.push({ type, progress: 0, paid: 0 });
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
                if (e.team === s.team || e.dead) return;
                const d = Math.hypot(e.x - s.x, e.z - s.z) - e.radius;
                if (d > r || d < minR) return;
                if (vis[(e.z | 0) * w + (e.x | 0)] !== 2) return;
                // armed units first (artillery above all: fragile and deadly), then harvesters, then the rest
                const sc = d + (U[e.type].weapon ? (e.type === 'artillery' ? -1.5 : 0) : (e.type === 'harvester' ? 1.2 : 2));
                if (sc < bs) { bs = sc; best = e; }
            });
            for (const b of this._blds()) {
                if (b.team === s.team || b.dead) continue;
                if (Math.abs(b.x - s.x) > r + 3 || Math.abs(b.z - s.z) > r + 3) continue;
                const d = this._rangeTo(s, b);
                if (d > r || d < minR) continue;
                if (!this.isVisible(s.team, b)) continue;
                const sc = d + (b.type === 'turret' ? 1 : 4);
                if (sc < bs) { bs = sc; best = b; }
            }
            return best;
        }
        _updateUnit(u) {
            const C = this.cfg, T = C.TICK, def = C.UNITS[u.type];
            u.firing += T;
            if (u._cd > 0) u._cd -= T;
            if (u._need && this._budget > 0) this._servicePath(u);
            if (u.type === 'harvester') { this._updateHarvester(u, def); return; }
            const wpn = def.weapon ? C.WEAPONS[def.weapon] : null;
            const minR = def.minRange || 0;
            let tgt = u.targetId ? this.entities.get(u.targetId) : null;
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
            // auto-acquire / retaliate
            if (wpn && !tgt && u._order !== 'move' && u._order !== 'attack') {
                u._scan -= T;
                if (u._scan <= 0) {
                    u._scan = 0.3;
                    const r = u._order === 'attackMove' ? Math.max(wpn.range, Math.min(def.sight, wpn.range + 2)) : wpn.range + 1;
                    let c = this._acquire(u, r, minR);
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
            if (u._path) {
                u.state = 'move';
                if (this._moveAlong(u, def)) {
                    if (u._order === 'move' || u._order === 'attackMove') { u._order = null; u._ax = u.x; u._az = u.z; }
                    u.state = 'idle'; u._vmax = 0;
                }
            } else if (u._need) {
                u.state = u._order ? 'move' : 'idle';
            } else {
                if (u._order === 'move' || u._order === 'attackMove') { u._order = null; u._ax = u.x; u._az = u.z; }
                u.state = 'idle';
                if (def.turret) u.turret = turnToward(u.turret, u.angle, 2 * T);
            }
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
            s._cd = wpn.cooldown * (0.95 + this.rng() * 0.1);
            s.firing = 0;
            const dist = Math.hypot(ap.x - s.x, ap.z - s.z);
            const bullet = wpn.projectile === 'bullet' || !wpn.speed;
            const dur = bullet ? 0 : dist / wpn.speed;
            const pid = bullet ? 0 : this._pid++;
            this._ev({ type: 'shot', from: s.id, team: s.team, x: s.x, z: s.z, tx: ap.x, tz: ap.z, weapon: key, dur, pid });
            if (bullet) { this._hit(s.team, s.id, key, wpn, tgt, ap.x, ap.z); return; }
            this.projectiles.push({
                id: pid, team: s.team, from: s.id, weapon: key, kind: wpn.projectile, sx: s.x, sz: s.z, x: s.x, z: s.z,
                tx: ap.x, tz: ap.z, targetId: tgt.id, homing: wpn.projectile !== 'arc', t: 0, dur: Math.max(0.05, dur), speed: wpn.speed,
            });
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
            this._ev({ type: 'impact', x: ix, z: iz, weapon: key, splash: wpn.splash || 0 });
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
                for (const e of victims) this._damage(e, 0.5 * wpn.damage * (wpn.vs[this._armor(e)] || 0), fromId, team);
            }
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
            const tm = this.teams[e.team], en = byTeam >= 0 ? this.teams[byTeam] : null;
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
            const spd = u._vmax && u.state !== 'attack' ? Math.min(def.speed, u._vmax) : def.speed;
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
