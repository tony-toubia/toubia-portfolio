// Shardfall: boot + game controller. Owns the frame loop, the selection, placement and command glue between the
// simulation (SF.Sim), the renderer, input, UI and audio; skirmish and campaign flow, campaign progress and the
// superweapon targeting mode. Exposed as window.SF.game for debugging and tests.
(function () {
    'use strict';
    const SF = window.SF = window.SF || {};
    const C = window.SF_CONFIG;
    const PROGRESS_KEY = 'shardfall.campaign.v1';
    const otherFaction = (f) => (f === 'hegemony' ? 'vanguard' : 'hegemony');
    const FACTIONS = (C && C.FACTIONS) || { vanguard: { name: 'Vanguard', superweapon: 'uplink' }, hegemony: { name: 'Hegemony', superweapon: 'riftsilo' } };

    const G = {
        team: 0, sim: null, render: null, input: null, ui: null, audio: SF.Audio,
        sel: [], selSet: new Set(), mode: null, placing: null, ghost: null,
        state: 'boot', paused: false, difficulty: 'normal', groups: {}, stats: null, overAt: 0,
        stageEl: null, faction: 'vanguard', mission: null, missionIndex: -1, lastStart: null, superAim: null,

        // ------------------------------------------------------------ factions, missions, campaign progress
        missions() { return Array.isArray(SF.MISSIONS) ? SF.MISSIONS : []; },
        factionOf(team) { const T = this.sim && this.sim.teams[team]; return (T && T.faction) || (team === this.team ? this.faction : otherFaction(this.faction)); },
        factionName(team) { const f = FACTIONS[this.factionOf(team)]; return f ? f.name : (C.TEAMS[team] || {}).name; },
        progress() {
            let p = null;
            try { p = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null'); } catch (e) { p = null; }
            return p && typeof p === 'object' && p.done && typeof p.done === 'object' ? p : { done: {} };
        },
        saveProgress(p) { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) { /* storage blocked */ } },
        missionDone(id) { return !!(id && this.progress().done[id]); },
        missionUnlocked(i) { const L = this.missions(); if (i < 0 || i >= L.length) return false; return i === 0 || this.missionDone(L[i - 1].id) || this.missionDone(L[i].id); },
        markMissionDone(m) {
            const p = this.progress(), prev = p.done[m.id], t = Math.round(this.sim ? this.sim.time : 0);
            p.done[m.id] = { t, best: prev && prev.best ? Math.min(prev.best, t) : t };
            this.saveProgress(p);
        },

        // ------------------------------------------------------------ superweapon
        superState() { const T = this.sim && this.sim.teams[this.team]; return (T && T.super) || null; },
        superDef(s) { s = s || this.superState(); return s && C.SUPERWEAPONS ? C.SUPERWEAPONS[s.type] : null; },
        superClick() {
            if (!this.canInteract()) return;
            const s = this.superState(); if (!s) return;
            const d = this.superDef(s) || { name: 'Superweapon' };
            if (!s.ready) { this.ui.toast(d.name + ' charging: ' + Math.floor((s.charge || 0) * 100) + '%', 'info'); this.audio.play('error'); return; }
            this.setMode(this.mode === 'super' ? null : 'super');
        },
        // where the strike would land: { x, z, ok } (ok = explored ground on the map)
        aimSuper(x, z) {
            if (this.mode !== 'super' || !this.sim) return;
            const T = this.sim.teams[this.team], m = this.sim.map;
            const tx = Math.floor(x), tz = Math.floor(z);
            const inside = tx >= 0 && tz >= 0 && tx < m.w && tz < m.h;
            const ok = inside && (!T.vis || T.vis[tz * m.w + tx] >= 1);
            this.superAim = { x: Math.max(0, Math.min(m.w, x)), z: Math.max(0, Math.min(m.h, z)), ok };
            const d = this.superDef();
            this.render.setAim({ x: this.superAim.x, z: this.superAim.z, r: d ? d.radius : 3, ok, kind: (this.superState() || {}).type });
            this.ui.modeBar();
        },
        fireSuper(x, z) {
            const s = this.superState();
            if (!s || !s.ready) { this.setMode(null); return false; }
            if (x == null) { if (!this.superAim) { this.denied('Pick a target first'); return false; } x = this.superAim.x; z = this.superAim.z; }
            this.aimSuper(x, z);
            if (!this.superAim || !this.superAim.ok) { this.denied('Target must be on explored ground'); return false; }
            if (this.sim.command(this.team, { type: 'superweapon', x, z })) {
                this.setMode(null);
                return true;
            }
            this.denied('Cannot fire there');
            return false;
        },

        canInteract() { return this.state === 'playing' && !this.paused; },
        ent(id) { return this.sim && this.sim.entities.get(id); },
        selEntities() { const out = []; for (const id of this.sel) { const e = this.ent(id); if (e && !e.dead) out.push(e); } return out; },
        selUnits() { return this.selEntities().filter((e) => e.kind === 'unit' && e.team === this.team); },
        selBuilding() { const s = this.selEntities(); return s.length === 1 && s[0].kind === 'building' && s[0].team === this.team ? s[0] : null; },

        // mode: 'replace' | 'add' | 'toggle'
        select(ids, mode) {
            let next;
            if (mode === 'add') next = Array.from(new Set(this.sel.concat(ids)));
            else if (mode === 'toggle') { const s = new Set(this.sel); for (const id of ids) { if (s.has(id)) s.delete(id); else s.add(id); } next = Array.from(s); }
            else next = ids.slice();
            // never mix own buildings with units, nor own with enemy entities
            const ents = next.map((id) => this.ent(id)).filter(Boolean);
            const ownUnits = ents.filter((e) => e.team === this.team && e.kind === 'unit');
            if (ownUnits.length && ents.length !== ownUnits.length) next = ownUnits.map((e) => e.id);
            else if (ents.length > 1 && ents.some((e) => e.kind === 'building' || e.team !== this.team)) next = [ents[ents.length - 1].id];
            const changed = next.length !== this.sel.length || next.some((id, i) => id !== this.sel[i]);
            this.sel = next; this.selSet = new Set(next);
            this.render.setSelection(next);
            if (this.mode === 'attackMove' && !this.selUnits().length) this.mode = null;
            if (this.mode === 'rally' && !this.selBuilding()) this.mode = null;
            if (this.mode !== 'super' && this.superAim) { this.superAim = null; this.render.setAim(null); }
            if (changed && next.length) this.audio.play('select');
            this.ui.updateSelection(true);
        },
        setMode(m) {
            if (m === 'attackMove' && !this.selUnits().length) { this.denied('Select units first'); return; }
            if (m === 'rally' && !this.selBuilding()) return;
            if (m === 'super') { const s = this.superState(); if (!s || !s.ready) return; if (this.placing) this.cancelPlacing(); }
            this.mode = m;
            this.superAim = null; this.render.setAim(null);
            if (m === 'super') {
                this.audio.play('click');
                // desktop: start the reticle under the mouse; touch: wait for the first tap
                const h = this.input && this.input.hoverPos, g = h && this.render.screenToGround(h.x, h.y);
                if (g && !this.ui.touch) this.aimSuper(g.x, g.z);
            }
            this.ui.modeBar(); this.ui.updateSelection();
        },
        stop() { const ids = this.selUnits().map((u) => u.id); if (ids.length) { this.sim.command(this.team, { type: 'stop', ids }); this.audio.play('order'); } this.setMode(null); },
        selectArmy() {
            const ids = []; for (const e of this.sim.entities.values()) if (e.team === this.team && e.kind === 'unit' && !e.dead && e.type !== 'harvester') ids.push(e.id);
            if (!ids.length) { this.ui.toast('No combat units', 'info'); return; }
            this.select(ids);
        },
        home() {
            let core = null; for (const e of this.sim.entities.values()) if (e.team === this.team && e.type === 'core' && !e.dead) { core = e; break; }
            if (!core) for (const e of this.sim.entities.values()) if (e.team === this.team && e.kind === 'building' && !e.dead) { core = e; break; }
            if (core) this.render.centerOn(core.x, core.z + 1); else { const s = this.sim.map.starts[this.team]; this.render.centerOn(s.tx + 1.5, s.tz + 2.5); }
        },
        focusSelection() {
            const s = this.selEntities(); if (!s.length) return;
            let x = 0, z = 0; for (const e of s) { x += e.x; z += e.z; }
            this.render.centerOn(x / s.length, z / s.length);
        },
        setGroup(n) {
            const ids = this.selUnits().map((u) => u.id);
            if (!ids.length) return;
            this.groups[n] = ids; this.ui.toast('Group ' + n + ' set (' + ids.length + ')', 'info');
        },
        recallGroup(n) {
            const g = (this.groups[n] || []).filter((id) => { const e = this.ent(id); return e && !e.dead; });
            this.groups[n] = g; if (!g.length) return;
            const now = performance.now();
            if (this.lastGroup === n && now - this.lastGroupT < 400) this.focusSelection();
            this.lastGroup = n; this.lastGroupT = now;
            this.select(g);
        },

        // ------------------------------------------------------------ production lanes
        // lanes: how many items of a category build at once (one per finished barracks / war factory, up to
        // ECONOMY.maxLanes); 1 when the simulation predates lanes. queueCap: queue size for the category.
        lanes(cat, team) {
            const s = this.sim; team = team == null ? this.team : team;
            if (s && typeof s.lanes === 'function') { try { const n = s.lanes(team, cat); if (n >= 0) return n | 0; } catch (e) { /* fall through */ } }
            return 1;
        },
        queueCap(cat) {
            const s = this.sim;
            if (s && typeof s.queueCap === 'function') { try { const n = s.queueCap(this.team, cat); if (n > 0) return n; } catch (e) { /* fall through */ } }
            return C.ECONOMY.queueMax * (cat === 'building' ? 1 : Math.max(1, this.lanes(cat)));
        },
        // the live, finished producers of a category for a team, oldest first (lane order)
        producers(team, cat) {
            const out = [];
            for (const e of this.sim.entities.values()) {
                if (e.kind !== 'building' || e.team !== team || e.dead || (e.built != null && e.built < 1)) continue;
                const d = C.BUILDINGS[e.type]; if (d && d.makes === cat && e.type !== 'core') out.push(e);
            }
            return out.sort((a, b) => a.id - b.id);
        },

        // ------------------------------------------------------------ production / placement
        buildClick(type) {
            if (!this.canInteract()) return;
            const T = this.sim.teams[this.team];
            const o = this.sim.options(this.team).find((x) => x.type === type); if (!o) return;
            if (o.locked) { this.denied(o.reason || 'Locked'); return; }
            if (o.cat === 'building') {
                if (this.placing === type) { this.cancelPlacing(); return; }
                if (this.wall) this.cancelPlacing();   // done with walls: free the build lane for this
                if (T.ready === type) { this.startPlacing(type); return; }
                if (T.ready) { this.denied('Place the ' + C.BUILDINGS[T.ready].name + ' first'); return; }
                if (T.queues.building.length) { const cur = T.queues.building[0].type; this.denied(cur === type ? 'Already constructing' : 'Busy constructing ' + C.BUILDINGS[cur].name); return; }
            } else {
                const q = (T.queues && T.queues[o.cat]) || [];
                if (o.full || q.length >= this.queueCap(o.cat)) { this.denied('Queue full'); return; }
            }
            if (this.sim.command(this.team, { type: 'queue', item: type })) this.audio.play('click');
            else this.denied(T.credits < 1 ? 'Not enough credits' : 'Cannot build that now');
        },
        buildCancel(type) {
            if (!this.canInteract()) return;
            if (this.placing === type) this.cancelPlacing();
            if (this.sim.command(this.team, { type: 'cancel', item: type })) { this.audio.play('sell'); this.ui.toast('Cancelled ' + (C.BUILDINGS[type] || C.UNITS[type]).name, 'info'); }
        },
        startPlacing(type) {
            this.placing = type; this.mode = null;
            const R = this.render, b = C.BUILDINGS[type];
            const g = (this.input.hoverPos && R.screenToGround(this.input.hoverPos.x, this.input.hoverPos.y)) || R.screenToGround(R.width / 2, R.height * 0.45) || { x: R.cam.x, z: R.cam.z };
            let tx = Math.round(g.x - b.w / 2), tz = Math.round(g.z - b.d / 2);
            // on touch, start from the nearest valid spot around the screen centre so a tap on Place just works
            if (!this.sim.canPlace(this.team, type, tx, tz)) {
                outer: for (let r = 1; r <= 8; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    if (this.sim.canPlace(this.team, type, tx + dx, tz + dz)) { tx += dx; tz += dz; break outer; }
                }
            }
            // walls: stay in placement mode while affordable; clicks/taps queue tiles that are built as walls come off the line
            this.wall = b.wall ? { placed: 0, plan: [], preview: [], anchor: null } : null;
            this.moveGhost(tx, tz);
            this.audio.play('click');
            this.ui.placeBar(); this.ui.modeBar();
        },
        cancelPlacing() {
            if (this.wall) this.finishWalls();
            this.placing = null; this.ghost = null; this.render.setGhost(null); this.ui.placeBar();
        },

        // ------------------------------------------------------------ wall placement (multi-place, lines)
        isWall(type) { const d = C.BUILDINGS[type]; return !!(d && d.wall); },
        wallInQueue(T) { return T.queues.building.some((q) => q.type === this.placing); },
        // leave wall mode: walls the UI lined up after the first one are refunded so the build lane is free again
        finishWalls() {
            const W = this.wall; this.wall = null;
            this.render.setWallPlan(null);
            if (!W || !W.placed || !this.sim) return;
            const T = this.sim.teams[this.team];
            for (let i = 0; i < 6; i++) {
                const has = T.ready === W.type || T.queues.building.some((q) => q.type === W.type);
                if (!has || !this.sim.command(this.team, { type: 'cancel', item: W.type })) break;
            }
        },
        // 4-connected tile line (walls join N/S/E/W, so a diagonal becomes a staircase)
        wallLine(a, b) {
            const out = [{ tx: a.tx, tz: a.tz }];
            const dx = Math.abs(b.tx - a.tx), dz = Math.abs(b.tz - a.tz), sx = Math.sign(b.tx - a.tx), sz = Math.sign(b.tz - a.tz);
            let ix = 0, iz = 0, x = a.tx, z = a.tz;
            while ((ix < dx || iz < dz) && out.length < 32) {
                if (ix < dx && (iz >= dz || (ix + 0.5) / dx < (iz + 0.5) / dz)) { ix++; x += sx; } else { iz++; z += sz; }
                out.push({ tx: x, tz: z });
            }
            return out;
        },
        // can a wall go here, counting walls already lined up (they extend the build radius once built)?
        wallTileOk(tx, tz, extra) {
            const sim = this.sim, m = sim.map;
            if (tx < 0 || tz < 0 || tx >= m.w || tz >= m.h) return false;
            if (sim.canPlace(this.team, this.placing, tx, tz)) return true;
            if (!sim.passable(tx, tz) || m.tiles[tz * m.w + tx] === 2 || m.shards[tz * m.w + tx] > 0) return false;
            const near = (p) => Math.max(Math.abs(p.tx - tx), Math.abs(p.tz - tz)) <= C.ECONOMY.buildRadius;
            return this.wall.plan.some(near) || (extra || []).some(near);
        },
        wallAfford() {
            const T = this.sim.teams[this.team], d = C.BUILDINGS[this.placing], cost = Math.max(1, d.cost || 1);
            return Math.floor(T.credits / cost) + (T.ready === this.placing ? 1 : 0) + (this.wallInQueue(T) ? 1 : 0);
        },
        // add tiles to the plan (a click, a tap, or a line); returns how many were accepted
        wallAdd(tiles) {
            const W = this.wall; if (!W) return 0;
            let added = 0, poor = false, bad = false;
            const taken = (t) => W.plan.some((p) => p.tx === t.tx && p.tz === t.tz);
            for (const t of tiles) {
                if (taken(t)) continue;
                if (W.plan.length >= this.wallAfford()) { poor = true; break; }
                if (W.plan.length >= 40) break;
                if (!this.wallTileOk(t.tx, t.tz)) { bad = true; continue; }
                W.plan.push({ tx: t.tx, tz: t.tz }); added++;
            }
            if (tiles.length) W.anchor = { tx: tiles[tiles.length - 1].tx, tz: tiles[tiles.length - 1].tz };
            if (poor && !added) this.denied('Not enough credits');
            else if (bad && !added) this.denied("Can't build there");
            if (added) this.audio.play('click');
            this.drainWalls();
            this.showWallPlan();
            return added;
        },
        setWallPreview(tiles) { if (this.wall) { this.wall.preview = tiles || []; this.showWallPlan(); } },
        showWallPlan() {
            const W = this.wall; if (!W) { this.render.setWallPlan(null); return; }
            const list = W.plan.map((p) => ({ tx: p.tx, tz: p.tz, kind: 'pending' }));
            const acc = [];
            for (const t of W.preview) { const ok = this.wallTileOk(t.tx, t.tz, acc); if (ok) acc.push(t); list.push({ tx: t.tx, tz: t.tz, kind: ok ? 'ok' : 'bad' }); }
            this.render.setWallPlan(list);
        },
        // per frame in wall mode: place the next planned tile whenever a wall is ready, keep one wall in production
        // while affordable, and leave wall mode once nothing is left to build or pay for
        drainWalls() {
            const W = this.wall, sim = this.sim; if (!W || !this.placing) return;
            W.type = this.placing;
            const T = sim.teams[this.team], type = this.placing, d = C.BUILDINGS[type];
            let guard = 0, changed = false;
            while (T.ready === type && W.plan.length && guard++ < 8) {
                const t = W.plan.shift(); changed = true;
                if (sim.canPlace(this.team, type, t.tx, t.tz) && sim.command(this.team, { type: 'place', item: type, tx: t.tx, tz: t.tz })) {
                    W.placed++; this.render.marker(t.tx + 0.5, t.tz + 0.5, 'place'); this.audio.play('wall', { x: t.tx + 0.5, z: t.tz + 0.5 });
                } else this.denied("Can't build there");
            }
            if (changed) this.showWallPlan();
            if (T.ready !== type && !this.wallInQueue(T)) {
                if (T.ready || T.queues.building.length) { this.cancelPlacing(); return; }   // something else took the build lane
                if (T.credits >= (d.cost || 0) && sim.command(this.team, { type: 'queue', item: type })) return;
                if (W.placed) this.ui.toast('Out of credits for walls', 'warn');
                this.cancelPlacing();
            }
        },
        moveGhost(tx, tz) {
            if (!this.placing) return;
            const ok = this.sim.canPlace(this.team, this.placing, tx, tz);
            if (!this.ghost || this.ghost.tx !== tx || this.ghost.tz !== tz) this.ghost = { tx, tz, ok };
            else this.ghost.ok = ok;
            this.render.setGhost(this.placing, tx, tz, ok);
        },
        canPlaceGhost() { return !!(this.placing && this.ghost && this.sim.canPlace(this.team, this.placing, this.ghost.tx, this.ghost.tz)); },
        placeAt(tx, tz) {
            const type = this.placing; if (!type) return;
            if (this.wall) { this.wallAdd([{ tx, tz }]); return; }
            if (this.sim.command(this.team, { type: 'place', item: type, tx, tz })) {
                const b = C.BUILDINGS[type];
                this.render.marker(tx + b.w / 2, tz + b.d / 2, 'place');
                this.audio.play('place');
                this.cancelPlacing();
            } else this.denied("Can't build there");
        },
        sell(id) {
            if (this.sim.command(this.team, { type: 'sell', id })) { this.audio.play('sell'); this.select([]); }
            else this.denied('Cannot sell that');
        },
        denied(text) { this.ui.toast(text, 'warn'); this.audio.play('error'); },

        // ------------------------------------------------------------ flow
        escape() {
            if (this.ui && document.getElementById('scr-howto').classList.contains('show')) { this.ui.hide('howto'); return; }
            if (this.ui && this.ui.escapeTitle && this.state === 'title' && this.ui.escapeTitle()) return;
            if (this.state !== 'playing') return;
            if (this.paused) { this.togglePause(false); return; }
            if (this.placing) { this.cancelPlacing(); return; }
            if (this.mode) { this.setMode(null); return; }
            if (this.sel.length) { this.select([]); return; }
            this.togglePause(true);
        },
        togglePause(force) {
            if (this.state !== 'playing') return;
            this.paused = force != null ? !!force : !this.paused;
            this.ui.show('pause', this.paused);
            if (this.paused) this.input.reset();
        },
        toggleSound() { this.audio.unlock(); this.audio.setMuted(!this.audio.isMuted()); this.ui.setSound(this.audio.isMuted()); },
        // opts: { kind: 'skirmish', faction, difficulty } | { kind: 'mission', index }
        start(opts) {
            opts = opts || this.lastStart || { kind: 'skirmish' };
            if (typeof opts === 'string') opts = { kind: 'skirmish', difficulty: opts };
            this.lastStart = opts;
            const mission = opts.kind === 'mission' ? this.missions()[opts.index] : null;
            if (opts.kind === 'mission' && !mission) { this.ui.toast('Mission not available', 'warn'); return; }
            this.mission = mission; this.missionIndex = mission ? opts.index : -1;
            if (!mission) { this.difficulty = opts.difficulty || this.difficulty; this.faction = opts.faction || this.faction; }
            else this.faction = mission.faction || 'vanguard';
            const enemyF = mission ? (mission.enemyFaction || otherFaction(this.faction)) : otherFaction(this.faction);
            this.ui.loading(true, mission ? 'Mission ' + (opts.index + 1) + ': ' + mission.title + '\u2026' : 'Deploying\u2026');
            setTimeout(() => {
                let sim;
                const facs = this.team === 0 ? [this.faction, enemyF] : [enemyF, this.faction];
                const so = { seed: (Math.random() * 1e9) | 0, size: 64, difficulty: this.difficulty, playerTeam: this.team, factions: facs };
                if (mission) {
                    so.mission = mission;
                    if (mission.map && mission.map.seed != null) so.seed = mission.map.seed;
                    if (mission.map && mission.map.size) so.size = mission.map.size;
                    so.difficulty = (mission.enemy && mission.enemy.ai) || 'normal';
                }
                try { sim = new SF.Sim(so); }
                catch (e) { console.error(e); this.ui.loading(true, 'The battlefield failed to load: ' + e.message, true); return; }
                this.sim = sim;
                const myT = sim.teams[this.team]; if (myT && myT.faction) this.faction = myT.faction;
                this.render.attract = false; this.render.reveal = false;
                this.render.setSim(sim, this.team);
                this.sel = []; this.selSet = new Set(); this.mode = null; this.placing = null; this.ghost = null; this.wall = null; this.groups = {}; this.superAim = null;
                this.render.setSelection([]); this.render.setGhost(null); this.render.setAim(null);
                this.stats = { unitsBuilt: 0, unitsLost: 0, kills: 0, buildingsDestroyed: 0, buildingsLost: 0, harvested: 0, time: 0 };
                this.lastCredits = sim.teams[this.team].credits;
                this.state = 'playing'; this.paused = false; this.overAt = 0;
                document.body.classList.add('playing');
                document.body.classList.toggle('mission', !!mission);
                this.ui.hideAll();
                this.ui.startGame();
                this.input.reset();
                this.defaultZoom();
                this.home(); this.render.cam.anim = null;
                // open on the core, or on the strike group when a mission starts without a base
                const c = this.render.cam; let core = null;
                for (const e of sim.entities.values()) if (e.team === this.team && e.kind === 'building' && !e.dead) { core = e; if (e.type === 'core') break; }
                if (core) { c.x = core.x; c.z = core.z + 1.5; }
                else {
                    let n = 0, x = 0, z = 0;
                    for (const e of sim.entities.values()) if (e.team === this.team && !e.dead) { x += e.x; z += e.z; n++; }
                    if (n) { c.x = x / n; c.z = z / n; } else { const st = sim.map.starts[this.team]; c.x = st.tx + 1.5; c.z = st.tz + 3; }
                }
                this.render.placeCamera();
                this.ui.loading(false);
                if (!mission) this.ui.toast('Build a Reactor, then a Refinery', 'info');
            }, 30);
        },
        restart() { this.ui.hideAll(); this.ui.clearRadio(); this.start(this.lastStart); },
        nextMission() {
            const i = this.missionIndex + 1;
            if (i < this.missions().length && this.missionUnlocked(i)) { this.quit('campaign'); this.ui.showBriefing(i); } else this.quit('campaign');
        },
        quit(pane) {
            const wasMission = !!this.mission;
            this.state = 'title'; this.paused = false; this.mode = null; this.superAim = null;
            document.body.classList.remove('playing', 'has-sel', 'placing', 'mode-on', 'mission');
            this.ui.hideAll(); this.ui.clearToasts(); this.ui.clearRadio();
            this.showTitle(pane || (wasMission ? 'campaign' : 'home'));
        },
        showTitle(pane) {
            try {
                const sim = new SF.Sim({ seed: 20261015, size: 64, difficulty: 'normal', playerTeam: this.team, factions: ['vanguard', 'hegemony'] });
                this.sim = sim; this.render.setSim(sim, this.team);
            } catch (e) { console.error(e); }
            this.mission = null; this.missionIndex = -1;
            this.render.attract = true; this.render.reveal = true;
            this.render.setSelection([]); this.render.setGhost(null); this.render.setAim(null);
            this.render.setZoomLimits(9, 50); this.render.cam.dist = 30;
            this.ui.showTitle(pane || 'home');
        },
        defaultZoom() {
            const R = this.render;
            if (this.ui.side) { R.setZoomLimits(8, 40); R.fitWidth(Math.max(16, Math.min(28, R.width / 46))); }
            else { R.setZoomLimits(8, 52); R.fitWidth(12); }
        },
        onLayout(side) {
            if (!this.render || this.state !== 'playing') return;
            if (this.lastSide !== side) { this.lastSide = side; this.defaultZoom(); }
        },

        // ------------------------------------------------------------ events + frame
        handleEvents(events) {
            const R = this.render, A = this.audio, st = this.stats;
            for (const ev of events) {
                switch (ev.type) {
                    case 'shot': if (R.seenAt(ev.x, ev.z) || R.seenAt(ev.tx, ev.tz)) A.play(ev.weapon, { x: ev.x, z: ev.z, vol: 0.55 }); break;
                    case 'impact': { const w = C.WEAPONS[ev.weapon]; if (w && w.projectile !== 'bullet' && R.seenAt(ev.x, ev.z)) A.play('impact', { x: ev.x, z: ev.z, vol: 0.6 }); break; }
                    case 'death':
                        if (R.seenAt(ev.x, ev.z) && !ev.sold) { const u = C.UNITS[ev.what || ev.unitType]; A.play(ev.kind === 'building' ? 'bigboom' : (u && u.from === 'infantry' ? 'impact' : 'boom'), { x: ev.x, z: ev.z }); }
                        if (ev.team === this.team) { if (ev.kind === 'unit') st.unitsLost++; else st.buildingsLost++; }
                        else { if (ev.kind === 'unit') st.kills++; else if (!ev.sold) st.buildingsDestroyed++; }
                        break;
                    case 'spawn': if (ev.team === this.team) st.unitsBuilt++; break;
                    case 'placed': if (ev.team !== this.team) break; break;
                    case 'superweapon':
                        if (ev.phase === 'warn') A.play(ev.team === this.team ? 'launch' : 'siren');
                        else if (ev.phase === 'strike') A.play(ev.kind === 'rift' ? 'rift' : 'lance', { x: ev.x, z: ev.z, far: true });
                        break;
                    case 'cloak': { const e = this.sim.entities.get(ev.id); if (e && e.team === this.team) A.play(ev.on ? 'cloak' : 'decloak', { x: e.x, z: e.z, vol: 0.6 }); break; }
                    case 'heal': { const x = ev.tx != null ? ev.tx : ev.x, z = ev.tz != null ? ev.tz : ev.z; if (x != null && R.seenAt(x, z)) A.play(ev.kind === 'repair' ? 'repair' : 'heal', { x, z, vol: 0.5 }); break; }
                    case 'stun': { const e = this.sim.entities.get(ev.id); if (e && R.isShown(e.id)) A.play('stun', { x: e.x, z: e.z, vol: 0.7 }); break; }
                    case 'income': if (ev.team === this.team) A.play('income', { x: ev.x, z: ev.z, vol: 0.4 }); break;
                    case 'mission': if (ev.status === 'won' || ev.status === 'lost') this.endGame(ev.status === 'won', ev.reason); break;
                    case 'gameover': if (!this.mission || !this.sim.mission) this.endGame(ev.winner === this.team, null); break;
                }
            }
        },
        gameOver(winner) { this.endGame(winner === this.team, null); },
        // win: bool; reason: optional text (missions)
        endGame(win, reason) {
            if (this.overAt || this.state !== 'playing') return;
            this.overAt = performance.now();
            this.cancelPlacing(); this.setMode(null);
            const mission = this.mission;
            if (mission && win) this.markMissionDone(mission);
            setTimeout(() => {
                if (this.state !== 'playing') return;
                this.state = 'over';
                document.body.classList.remove('playing', 'has-sel', 'placing', 'mode-on');
                const T = this.sim.teams[this.team];
                this.stats.time = this.sim.time;
                // prefer the simulation's own per-team stats when it keeps them
                const S = T.stats;
                if (S) for (const k of ['unitsBuilt', 'unitsLost', 'kills', 'buildingsDestroyed', 'buildingsLost']) if (typeof S[k] === 'number') this.stats[k] = S[k];
                if (S && typeof S.creditsHarvested === 'number') this.stats.harvested = S.creditsHarvested;
                this.audio.play(win ? 'win' : 'lose');
                this.ui.clearRadio();
                this.ui.showEnd(win, this.stats, mission ? { mission, index: this.missionIndex, reason, hasNext: this.missionIndex + 1 < this.missions().length } : null);
            }, mission ? 2000 : 2400);
        },
        pruneSelection() {
            if (!this.sel.length) return;
            const keep = this.sel.filter((id) => { const e = this.ent(id); return e && !e.dead && (e.team === this.team || this.render.isShown(id)); });
            if (keep.length !== this.sel.length) { this.sel = keep; this.selSet = new Set(keep); this.render.setSelection(keep); if (!keep.length) this.mode = null; this.ui.updateSelection(true); }
        },
        frame(dt) {
            const R = this.render;
            const live = this.state === 'playing' || this.state === 'over';
            if (live && !this.paused && this.sim) {
                this.sim.update(dt);
                const ev = this.sim.drainEvents ? this.sim.drainEvents() : [];
                if (ev.length) { R.onEvents(ev); this.ui.onEvents(ev); this.handleEvents(ev); }
                const M = this.sim.mission;
                if (this.mission && M && (M.status === 'won' || M.status === 'lost')) { if (!this.overAt) this.endGame(M.status === 'won', M.reason || null); }
                else if (this.sim.winner != null && !this.overAt && !(this.mission && M)) this.endGame(this.sim.winner === this.team, null);
                // harvested credits fallback when the sim keeps no stats: count income (positive deltas)
                const T = this.sim.teams[this.team];
                if (this.stats && T) { const d = T.credits - this.lastCredits; if (d > 0) this.stats.harvested += d; this.lastCredits = T.credits; }
            }
            if (this.state === 'playing' && this.sim) {
                this.pruneSelection();
                const T = this.sim.teams[this.team];
                if (this.placing && this.wall) this.drainWalls();
                else if (this.placing && T.ready !== this.placing) this.cancelPlacing();
                if (this.placing && this.ghost) this.moveGhost(this.ghost.tx, this.ghost.tz);
                if (this.mode === 'super' && !(T.super && T.super.ready)) this.setMode(null);
                const b = this.selBuilding(), cat = b && C.BUILDINGS[b.type].makes;
                const r = cat && T.rally && T.rally[cat];
                R.setRallies(r ? [{ x: r.x, z: r.z, fromX: b.x, fromZ: b.z }] : []);
                this.input.update(dt);
            }
            this.audio.setListener(R.cam.x, R.cam.z, R.viewWidthAt(R.cam.dist) * 0.6);
            R.update(this.paused ? 0 : dt);
            if (this.state === 'playing') this.ui.update(dt);
        },
    };

    function boot() {
        const missing = [];
        if (!window.THREE) missing.push('three.js');
        if (!window.SF_CONFIG) missing.push('config');
        if (!window.SF_MODELS) missing.push('models');
        if (!SF.Sim) missing.push('simulation');
        const fail = (msg) => { const L = document.getElementById('loading'); L.classList.add('err'); document.getElementById('loading-text').textContent = msg; };
        if (missing.length) { fail('Shardfall could not start: missing ' + missing.join(', ') + ((window.SF_BOOT && SF_BOOT.failed.length) ? ' (failed: ' + SF_BOOT.failed.join(', ') + ')' : '') + '.'); return; }
        G.stageEl = document.getElementById('stage');
        const q = (location.search.match(/[?&]q=(low|high)\b/) || [])[1];
        try { G.render = new SF.Renderer(G.stageEl, { quality: q }); }
        catch (e) { console.error(e); fail('Shardfall needs WebGL, which this browser could not start.'); return; }
        if (window.ResizeObserver) new ResizeObserver(() => G.render.resize()).observe(G.stageEl);
        G.ui = new SF.UI(G);
        G.input = new SF.Input(G);
        G.ui.setSound(G.audio.isMuted());
        G.state = 'title';
        G.showTitle();
        document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing' && !G.paused) G.togglePause(true); });
        const unlock = () => G.audio.unlock();
        window.addEventListener('pointerdown', unlock, { capture: true });
        window.addEventListener('keydown', unlock, { capture: true });
        let last = performance.now();
        const loop = (t) => {
            const dt = Math.min(0.1, Math.max(0, (t - last) / 1000)); last = t;
            try { G.frame(dt); } catch (e) { console.error(e); }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
        setTimeout(() => G.ui.loading(false), 60);
    }
    SF.game = G;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
