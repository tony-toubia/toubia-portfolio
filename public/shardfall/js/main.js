// Shardfall: boot + game controller. Owns the frame loop, the selection, placement and command glue between the
// simulation (SF.Sim), the renderer, input, UI and audio. Exposed as window.SF.game for debugging and tests.
(function () {
    'use strict';
    const SF = window.SF = window.SF || {};
    const C = window.SF_CONFIG;

    const G = {
        team: 0, sim: null, render: null, input: null, ui: null, audio: SF.Audio,
        sel: [], selSet: new Set(), mode: null, placing: null, ghost: null,
        state: 'boot', paused: false, difficulty: 'normal', groups: {}, stats: null, overAt: 0,
        stageEl: null,

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
            if (changed && next.length) this.audio.play('select');
            this.ui.updateSelection(true);
        },
        setMode(m) {
            if (m === 'attackMove' && !this.selUnits().length) { this.denied('Select units first'); return; }
            if (m === 'rally' && !this.selBuilding()) return;
            this.mode = m;
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

        // ------------------------------------------------------------ production / placement
        buildClick(type) {
            if (!this.canInteract()) return;
            const T = this.sim.teams[this.team];
            const o = this.sim.options(this.team).find((x) => x.type === type); if (!o) return;
            if (o.locked) { this.denied(o.reason || 'Locked'); return; }
            if (o.cat === 'building') {
                if (this.placing === type) { this.cancelPlacing(); return; }
                if (T.ready === type) { this.startPlacing(type); return; }
                if (T.ready) { this.denied('Place the ' + C.BUILDINGS[T.ready].name + ' first'); return; }
                if (T.queues.building.length) { const cur = T.queues.building[0].type; this.denied(cur === type ? 'Already constructing' : 'Busy constructing ' + C.BUILDINGS[cur].name); return; }
            } else if (o.queued >= C.ECONOMY.queueMax) { this.denied('Queue full'); return; }
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
            this.moveGhost(tx, tz);
            this.audio.play('click');
            this.ui.placeBar(); this.ui.modeBar();
        },
        cancelPlacing() { this.placing = null; this.ghost = null; this.render.setGhost(null); this.ui.placeBar(); },
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
        start(diff) {
            this.difficulty = diff || this.difficulty;
            this.ui.loading(true, 'Deploying…');
            setTimeout(() => {
                let sim;
                try { sim = new SF.Sim({ seed: (Math.random() * 1e9) | 0, size: 64, difficulty: this.difficulty, playerTeam: this.team }); }
                catch (e) { console.error(e); this.ui.loading(true, 'The battlefield failed to load: ' + e.message, true); return; }
                this.sim = sim;
                this.render.attract = false; this.render.reveal = false;
                this.render.setSim(sim, this.team);
                this.sel = []; this.selSet = new Set(); this.mode = null; this.placing = null; this.ghost = null; this.groups = {};
                this.render.setSelection([]); this.render.setGhost(null);
                this.stats = { unitsBuilt: 0, unitsLost: 0, kills: 0, buildingsDestroyed: 0, buildingsLost: 0, harvested: 0, time: 0 };
                this.lastCredits = sim.teams[this.team].credits;
                this.state = 'playing'; this.paused = false; this.overAt = 0;
                document.body.classList.add('playing');
                this.ui.hideAll();
                this.ui.startGame();
                this.input.reset();
                this.defaultZoom();
                this.home(); this.render.cam.anim = null;
                const c = this.render.cam; const s = sim.map.starts[this.team]; c.x = s.tx + 1.5; c.z = s.tz + 3; this.render.placeCamera();
                this.ui.loading(false);
                this.ui.toast('Build a Reactor, then a Refinery', 'info');
            }, 30);
        },
        restart() { this.ui.hideAll(); this.start(this.difficulty); },
        quit() {
            this.state = 'title'; this.paused = false;
            document.body.classList.remove('playing', 'has-sel', 'placing', 'mode-on');
            this.ui.hideAll(); this.ui.clearToasts();
            this.showTitle();
        },
        showTitle() {
            try {
                const sim = new SF.Sim({ seed: 20261015, size: 64, difficulty: 'normal', playerTeam: this.team });
                this.sim = sim; this.render.setSim(sim, this.team);
            } catch (e) { console.error(e); }
            this.render.attract = true; this.render.reveal = true;
            this.render.setSelection([]); this.render.setGhost(null);
            this.render.setZoomLimits(9, 50); this.render.cam.dist = 30;
            this.ui.show('start');
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
                    case 'gameover': this.gameOver(ev.winner); break;
                }
            }
        },
        gameOver(winner) {
            if (this.overAt) return;
            this.overAt = performance.now();
            this.cancelPlacing(); this.setMode(null);
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
                const win = winner === this.team;
                this.audio.play(win ? 'win' : 'lose');
                this.ui.showEnd(win, this.stats);
            }, 2400);
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
                if (this.sim.winner != null && !this.overAt) this.gameOver(this.sim.winner);
                // harvested credits fallback when the sim keeps no stats: count income (positive deltas)
                const T = this.sim.teams[this.team];
                if (this.stats && T) { const d = T.credits - this.lastCredits; if (d > 0) this.stats.harvested += d; this.lastCredits = T.credits; }
            }
            if (this.state === 'playing' && this.sim) {
                this.pruneSelection();
                const T = this.sim.teams[this.team];
                if (this.placing && T.ready !== this.placing) this.cancelPlacing();
                if (this.placing && this.ghost) this.moveGhost(this.ghost.tx, this.ghost.tz);
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
