// Shardfall: input. Desktop mouse + keyboard and phone touch, all through pointer events on the stage.
//   mouse: left click select (Shift adds), left drag box, double-click = all of type on screen, right click smart
//          order, right/middle drag pans, wheel zoom, edge scroll, WASD/arrows, A attack-move, S stop, Q army,
//          H home, Z superweapon targeting (click fires, right click cancels), Ctrl/Shift+1..9 groups,
//          Esc cancel/deselect/pause.
//   touch: one-finger drag pans (with inertia), tap selects / smart-orders, press-and-hold then drag box-selects,
//          double-tap a unit selects all of that type on screen, pinch zooms (and pans with the midpoint);
//          superweapon targeting: the first tap places the reticle, a tap inside it (or the Fire button) launches.
(function () {
    'use strict';
    const SF = window.SF = window.SF || {};
    const C = window.SF_CONFIG;
    const TAP_SLOP = 10;          // px a finger may wander and still count as a tap
    const LONG_PRESS = 420;       // ms before a still finger turns into box-select
    const DOUBLE = 330;           // ms for double tap / double click
    const DRAG_SLOP = 6;          // px before a mouse press becomes a drag

    class Input {
        constructor(game) {
            this.G = game;
            this.stage = game.stageEl;
            this.touches = new Map();
            this.state = 'idle';          // touch: idle | pending | pan | box | pinch
            this.mouse = null;            // { button, x, y, sx, sy, dragging }
            this.keys = new Set();
            this.inertia = { vx: 0, vy: 0 };
            this.lastTap = null;          // { t, id, x, y }
            this.lastClick = null;
            this.hoverPos = null;         // mouse position over the stage (for hover + edge scroll)
            this.edgeT = 0;
            this.box = document.createElement('div'); this.box.className = 'sf-box'; this.stage.appendChild(this.box);
            this.press = document.createElement('div'); this.press.className = 'sf-press'; this.stage.appendChild(this.press);
            this.bind();
        }
        get R() { return this.G.render; }
        rel(e) { const r = this.stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
        bind() {
            const s = this.stage;
            s.addEventListener('pointerdown', (e) => this.down(e));
            s.addEventListener('pointermove', (e) => this.move(e));
            s.addEventListener('pointerup', (e) => this.up(e));
            s.addEventListener('pointercancel', (e) => this.up(e, true));
            s.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.hoverPos = null; this.R.setHover(null); } });
            s.addEventListener('contextmenu', (e) => e.preventDefault());
            s.addEventListener('wheel', (e) => { e.preventDefault(); if (!this.G.canInteract()) return; const p = this.rel(e); const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; this.R.zoomAt(Math.exp(dy * 0.0016), p.x, p.y); }, { passive: false });
            // stop the browser from scrolling/zooming the page on touch
            s.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
            s.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
            document.addEventListener('gesturestart', (e) => e.preventDefault());
            document.addEventListener('dblclick', (e) => { if (e.target === s || s.contains(e.target)) e.preventDefault(); });
            window.addEventListener('keydown', (e) => this.keydown(e));
            window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
            window.addEventListener('blur', () => { this.keys.clear(); this.hoverPos = null; });
        }

        // ------------------------------------------------------------ pointer routing
        down(e) {
            this.G.audio.unlock();
            if (!this.G.canInteract()) return;
            if (e.pointerType === 'mouse') return this.mouseDown(e);
            e.preventDefault();
            try { this.stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            const p = this.rel(e);
            this.touches.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), ts: e.timeStamp });
            this.inertia.vx = this.inertia.vy = 0;
            if (this.touches.size === 1) {
                this.state = 'pending';
                this.vel = [];
                clearTimeout(this.lpTimer);
                this.lpTimer = setTimeout(() => requestAnimationFrame(() => this.longPress()), LONG_PRESS); // rAF: let queued moves land first
                this.pressStart(p.x, p.y);
            } else if (this.touches.size === 2) {
                clearTimeout(this.lpTimer); this.pressEnd();
                if (this.state === 'box') this.hideBox();
                this.state = 'pinch';
                this.pinch = this.pinchInfo();
            }
        }
        move(e) {
            const p = this.rel(e);
            if (e.pointerType === 'mouse') return this.mouseMove(e, p);
            const t = this.touches.get(e.pointerId); if (!t) return;
            const dx = p.x - t.x, dy = p.y - t.y;
            t.x = p.x; t.y = p.y;
            if (this.state === 'pending') {
                if (Math.hypot(p.x - t.sx, p.y - t.sy) > TAP_SLOP) {
                    clearTimeout(this.lpTimer); this.pressEnd();
                    this.state = 'pan';
                    this.R.panScreen(p.x - t.sx, p.y - t.sy);     // catch up the slop so the map stays under the finger
                    this.trackVel(p.x - t.sx, p.y - t.sy);
                }
            } else if (this.state === 'pan') {
                this.R.panScreen(dx, dy); this.trackVel(dx, dy);
            } else if (this.state === 'box' && e.timeStamp - t.ts < LONG_PRESS - 40 && Math.hypot(p.x - t.sx, p.y - t.sy) > TAP_SLOP) {
                // the move really happened before the hold threshold (late delivery): it is a pan
                this.hideBox(); this.state = 'pan'; this.R.panScreen(p.x - t.sx, p.y - t.sy);
            } else if (this.state === 'box') {
                this.drawBox(t.sx, t.sy, p.x, p.y);
            } else if (this.state === 'pinch' && this.touches.size >= 2) {
                const n = this.pinchInfo(), o = this.pinch;
                if (n.d > 4 && o.d > 4) this.R.zoomAt(o.d / n.d, n.x, n.y);
                this.R.panScreen(n.x - o.x, n.y - o.y);
                this.pinch = n;
            }
        }
        up(e, cancelled) {
            const p = this.rel(e);
            if (e.pointerType === 'mouse') return this.mouseUp(e, p, cancelled);
            const t = this.touches.get(e.pointerId); if (!t) return;
            this.touches.delete(e.pointerId);
            clearTimeout(this.lpTimer); this.pressEnd();
            const held = e.timeStamp - t.ts, moved = Math.hypot(p.x - t.sx, p.y - t.sy);
            // a slow frame can coalesce every move into the pointerup, or let the long-press timer fire before a
            // queued pointerup is handled: classify from the event's own position and timestamp
            if (this.state === 'box' && held < LONG_PRESS - 40 && this.touches.size === 0) { this.hideBox(); this.state = moved > TAP_SLOP ? 'pan' : 'pending'; }
            if (this.state === 'pending' && moved > TAP_SLOP) { this.R.panScreen(p.x - t.x, p.y - t.y); this.state = this.touches.size ? 'pan' : 'idle'; }
            else if (this.state === 'pending' && !cancelled) { this.state = 'idle'; if (held >= LONG_PRESS) this.selectAt(p.x, p.y, true); else this.tap(p.x, p.y, e.timeStamp); }
            else if (this.state === 'pan') {
                if (p.x !== t.x || p.y !== t.y) { this.R.panScreen(p.x - t.x, p.y - t.y); this.trackVel(p.x - t.x, p.y - t.y); }
                if (this.touches.size === 0) { this.startInertia(); this.state = 'idle'; }
            } else if (this.state === 'box') {
                this.hideBox();
                if (!cancelled) this.finishBox(t.sx, t.sy, p.x, p.y, true);
                this.state = 'idle';
            } else if (this.state === 'pinch') {
                // one finger left: keep panning with it, never a tap
                if (this.touches.size === 1) { this.state = 'pan'; this.vel = []; }
                else if (this.touches.size === 0) this.state = 'idle';
                else this.pinch = this.pinchInfo();
            }
            if (this.touches.size === 0 && this.state !== 'idle') this.state = 'idle';
        }
        pinchInfo() {
            const a = Array.from(this.touches.values());
            return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) };
        }
        trackVel(dx, dy) {
            const now = performance.now();
            this.vel.push({ dx, dy, t: now });
            while (this.vel.length && now - this.vel[0].t > 100) this.vel.shift();
        }
        startInertia() {
            const v = this.vel || []; if (v.length < 2) return;
            const dt = (v[v.length - 1].t - v[0].t) / 1000; if (dt <= 0.008) return;
            let sx = 0, sy = 0; for (let i = 1; i < v.length; i++) { sx += v[i].dx; sy += v[i].dy; }
            if (performance.now() - v[v.length - 1].t > 60) return; // finger stopped before lifting
            this.inertia.vx = sx / dt; this.inertia.vy = sy / dt;
            const sp = Math.hypot(this.inertia.vx, this.inertia.vy); if (sp > 3000) { this.inertia.vx *= 3000 / sp; this.inertia.vy *= 3000 / sp; }
        }
        pressStart(x, y) {
            this.press.style.left = x + 'px'; this.press.style.top = y + 'px';
            this.pressT0 = performance.now(); this.pressOn = true;
        }
        pressEnd() { this.pressOn = false; this.press.classList.remove('on'); }
        longPress() {
            if (this.state !== 'pending' || this.touches.size !== 1) return;
            this.pressEnd();
            if (this.G.placing || this.G.mode === 'super') return; // no box-select while placing or targeting
            const t = Array.from(this.touches.values())[0];
            this.state = 'box';
            this.drawBox(t.sx, t.sy, t.x, t.y);
            if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) { /* not allowed */ }
            this.G.audio.play('click');
        }
        drawBox(x0, y0, x1, y1) {
            const b = this.box.style;
            b.display = 'block'; b.left = Math.min(x0, x1) + 'px'; b.top = Math.min(y0, y1) + 'px';
            b.width = Math.abs(x1 - x0) + 'px'; b.height = Math.abs(y1 - y0) + 'px';
        }
        hideBox() { this.box.style.display = 'none'; }
        finishBox(x0, y0, x1, y1, touch, add) {
            const G = this.G;
            if (Math.abs(x1 - x0) < 8 && Math.abs(y1 - y0) < 8) { this.selectAt(x1, y1, touch, add); return; }
            const ids = this.R.unitsInRect(x0, y0, x1, y1, G.team);
            if (!ids.length) { if (!touch && !add) G.select([]); return; }
            // prefer fighters: drop harvesters if the box also caught combat units
            const fighters = ids.filter((id) => { const e = G.sim.entities.get(id); return e && e.type !== 'harvester'; });
            G.select(fighters.length ? fighters : ids, add ? 'add' : 'replace');
        }

        // ------------------------------------------------------------ touch tap
        tap(x, y, ts) {
            const G = this.G, now = ts || performance.now();
            if (G.placing) { this.placeTap(x, y); return; }
            if (G.mode === 'super') { this.superTap(x, y); return; }
            const id = this.R.pick(x, y, true), ent = id != null ? G.sim.entities.get(id) : null;
            const dbl = this.lastTap && now - this.lastTap.t < DOUBLE && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 40;
            this.lastTap = { t: now, x, y, id };
            if (G.mode === 'rally') { this.rallyAt(x, y); return; }
            if (G.mode === 'attackMove') { this.smartOrder(x, y, true, true); return; }
            const units = G.selUnits();
            if (ent && ent.team === G.team) {
                if (dbl && ent.kind === 'unit') { this.selectType(ent.type); return; }
                // a selection of only healers tapping a hurt ally: heal / repair it rather than select it
                if (units.length && this.healers(units, ent).length === units.length) { this.smartOrder(x, y, true); return; }
                G.select([id]); return;
            }
            if (units.length) { this.smartOrder(x, y, true); return; }
            if (ent) { G.select([id]); return; }
            if (G.sel.length) G.select([]);
        }
        // touch: first tap aims, a second tap inside the reticle fires
        superTap(x, y) {
            const G = this.G, g = this.R.screenToGround(x, y); if (!g) return;
            const a = G.superAim, d = G.superDef();
            if (a && a.ok && Math.hypot(g.x - a.x, g.z - a.z) <= Math.max(1.2, (d ? d.radius : 2) * 0.9)) { G.fireSuper(a.x, a.z); return; }
            G.aimSuper(g.x, g.z);
            G.audio.play(G.superAim && G.superAim.ok ? 'click' : 'error');
        }
        placeTap(x, y) {
            const G = this.G, g = this.R.screenToGround(x, y); if (!g) return;
            const b = C.BUILDINGS[G.placing];
            const tx = Math.round(g.x - b.w / 2), tz = Math.round(g.z - b.d / 2);
            // walls: every tap builds one there (no confirm step); the Done button leaves wall mode
            if (G.wall) { G.moveGhost(tx, tz); G.wallAdd([{ tx, tz }]); return; }
            const gh = G.ghost;
            const inside = gh && g.x >= gh.tx && g.x < gh.tx + b.w && g.z >= gh.tz && g.z < gh.tz + b.d;
            if (inside && G.canPlaceGhost()) { G.placeAt(gh.tx, gh.tz); return; }
            G.moveGhost(tx, tz);
        }

        // ------------------------------------------------------------ mouse
        mouseDown(e) {
            const p = this.rel(e);
            this.mouse = { button: e.button, x: p.x, y: p.y, sx: p.x, sy: p.y, dragging: false, shift: e.shiftKey };
            try { this.stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            this.inertia.vx = this.inertia.vy = 0;
            if (e.button === 1) e.preventDefault();
        }
        mouseMove(e, p) {
            this.hoverPos = p;
            const m = this.mouse;
            if (m) {
                const far = Math.hypot(p.x - m.sx, p.y - m.sy) > DRAG_SLOP;
                if (m.button === 0 && this.G.wall) {
                    // hold-drag in wall mode: preview a line of walls from the press point
                    if (far) m.wallDrag = true;
                    if (m.wallDrag) { const a = this.tileAt(m.sx, m.sy), b = this.tileAt(p.x, p.y); if (a && b) this.G.setWallPreview(this.G.wallLine(a, b)); }
                } else if (m.button === 0 && !this.G.placing && !this.G.mode) {
                    if (far) m.dragging = true;
                    if (m.dragging) this.drawBox(m.sx, m.sy, p.x, p.y);
                } else if (m.button === 1 || m.button === 2) {
                    if (far) m.dragging = true;
                    if (m.dragging) { this.R.panScreen(p.x - m.x, p.y - m.y); this.stage.classList.add('cur-pan'); }
                }
                m.x = p.x; m.y = p.y;
            }
            this.updateHover(p);
        }
        mouseUp(e, p, cancelled) {
            const m = this.mouse; this.mouse = null;
            this.stage.classList.remove('cur-pan');
            if (!m || cancelled) { this.hideBox(); if (this.G.wall) this.G.setWallPreview([]); return; }
            const G = this.G;
            if (m.button === 0) {
                if (G.wall) {
                    const b = this.tileAt(p.x, p.y);
                    if (m.wallDrag) { const a = this.tileAt(m.sx, m.sy); G.setWallPreview([]); if (a && b) G.wallAdd(G.wallLine(a, b)); }
                    else if (b && (e.shiftKey || m.shift) && G.wall.anchor) { const line = G.wallLine(G.wall.anchor, b); if (line.length > 1) line.shift(); G.wallAdd(line); }
                    else if (b) G.wallAdd([b]);
                    return;
                }
                if (G.placing) { this.placeClick(p.x, p.y); return; }
                if (G.mode === 'super') { const g = this.R.screenToGround(p.x, p.y); if (g) G.fireSuper(g.x, g.z); return; }
                if (m.dragging) { this.hideBox(); this.finishBox(m.sx, m.sy, p.x, p.y, false, e.shiftKey); return; }
                if (G.mode === 'attackMove') { this.smartOrder(p.x, p.y, false, true); return; }
                if (G.mode === 'rally') { this.rallyAt(p.x, p.y); return; }
                const now = performance.now(), id = this.R.pick(p.x, p.y, false), ent = id != null ? G.sim.entities.get(id) : null;
                const dbl = this.lastClick && now - this.lastClick.t < DOUBLE && Math.hypot(p.x - this.lastClick.x, p.y - this.lastClick.y) < 12;
                this.lastClick = { t: now, x: p.x, y: p.y };
                if (dbl && ent && ent.team === G.team && ent.kind === 'unit') { this.selectType(ent.type, e.shiftKey); return; }
                this.selectAt(p.x, p.y, false, e.shiftKey);
            } else if (m.button === 2 && !m.dragging) {
                if (G.placing) { G.cancelPlacing(); return; }
                if (G.mode) { G.setMode(null); return; }
                this.smartOrder(p.x, p.y, false);
            }
        }
        placeClick(x, y) {
            const G = this.G;
            this.updateGhostFromMouse(x, y);
            if (G.canPlaceGhost()) G.placeAt(G.ghost.tx, G.ghost.tz);
            else G.denied("Can't build there");
        }
        updateGhostFromMouse(x, y) {
            const G = this.G, g = this.R.screenToGround(x, y); if (!g || !G.placing) return;
            const b = C.BUILDINGS[G.placing];
            G.moveGhost(Math.round(g.x - b.w / 2), Math.round(g.z - b.d / 2));
        }
        // the footprint origin tile under a screen point for the building being placed
        tileAt(x, y) {
            const G = this.G, g = this.R.screenToGround(x, y), b = C.BUILDINGS[G.placing] || { w: 1, d: 1 };
            return g ? { tx: Math.round(g.x - b.w / 2), tz: Math.round(g.z - b.d / 2) } : null;
        }
        updateHover(p) {
            const G = this.G;
            if (G.placing) {
                this.updateGhostFromMouse(p.x, p.y); this.setCursor('cur-place'); this.R.setHover(null);
                // wall mode with Shift held: preview the line from the last wall
                if (G.wall && !(this.mouse && this.mouse.wallDrag)) {
                    const t = this.tileAt(p.x, p.y), a = G.wall.anchor;
                    if (this.keys.has('shift') && a && t) { const line = G.wallLine(a, t); if (line.length > 1) line.shift(); G.setWallPreview(line); }
                    else if (G.wall.preview.length) G.setWallPreview([]);
                }
                return;
            }
            if (G.mode === 'super') {
                const g = this.R.screenToGround(p.x, p.y); if (g) G.aimSuper(g.x, g.z);
                this.setCursor(G.superAim && !G.superAim.ok ? 'cur-noaim' : 'cur-target'); this.R.setHover(null); return;
            }
            if (this.mouse && this.mouse.dragging) return;
            const id = this.R.pick(p.x, p.y, false), ent = id != null ? G.sim.entities.get(id) : null;
            this.R.setHover(id);
            const units = G.selUnits();
            let cur = '';
            if (G.mode === 'attackMove') cur = 'cur-amove';
            else if (G.mode === 'rally') cur = 'cur-move';
            else if (ent && ent.team !== G.team && units.length) cur = 'cur-attack';
            else if (ent) cur = 'cur-select';
            else if (units.length) {
                const g = this.R.screenToGround(p.x, p.y);
                cur = g && units.some((u) => u.type === 'harvester') && this.isShardAt(g.x, g.z) ? 'cur-harvest' : 'cur-move';
            }
            this.setCursor(cur);
        }
        setCursor(c) {
            if (this.cursor === c) return;
            if (this.cursor) this.stage.classList.remove(this.cursor);
            if (c) this.stage.classList.add(c);
            this.cursor = c;
        }

        // ------------------------------------------------------------ selection + orders
        selectAt(x, y, touch, add) {
            const G = this.G, id = this.R.pick(x, y, touch), ent = id != null ? G.sim.entities.get(id) : null;
            if (!ent) { if (!add) G.select([]); return; }
            if (add && ent.team === G.team && ent.kind === 'unit') { G.select([id], 'toggle'); return; }
            G.select([id]);
        }
        selectType(type, add) {
            const G = this.G;
            const ids = this.R.onScreen((e) => e.team === G.team && e.type === type && e.kind === 'unit');
            if (ids.length) G.select(ids, add ? 'add' : 'replace');
        }
        isShardAt(x, z) {
            const m = this.G.sim.map, tx = Math.floor(x), tz = Math.floor(z);
            if (tx < 0 || tz < 0 || tx >= m.w || tz >= m.h) return false;
            const i = tz * m.w + tx;
            return m.tiles[i] === 2 && m.shards[i] > 0;
        }
        smartOrder(x, y, touch, forceAttackMove) {
            const G = this.G, sim = G.sim, team = G.team;
            const g = this.R.screenToGround(x, y); if (!g) return false;
            const units = G.selUnits();
            if (!units.length) {
                const b = G.selBuilding();
                if (b && (b.type === 'barracks' || b.type === 'factory' || C.BUILDINGS[b.type].makes === 'infantry' || C.BUILDINGS[b.type].makes === 'vehicle')) return this.rallyAt(x, y);
                return false;
            }
            const id = this.R.pick(x, y, touch), target = id != null ? sim.entities.get(id) : null;
            const ids = units.map((u) => u.id);
            const armed = units.filter((u) => C.UNITS[u.type] && C.UNITS[u.type].weapon).map((u) => u.id);
            if (this.healOrder(units, target)) return true;
            if (target && target.team !== team && !target.dead) {
                if (!armed.length) { G.denied('No weapons'); return false; }
                sim.command(team, { type: 'attack', ids: armed, targetId: target.id });
                this.R.marker(target.x, target.z, 'attack'); G.audio.play('order'); G.setMode(null);
                return true;
            }
            if (forceAttackMove) {
                sim.command(team, { type: 'attackMove', ids, x: g.x, z: g.z });
                this.R.marker(g.x, g.z, 'attackMove'); G.audio.play('order'); G.setMode(null);
                return true;
            }
            const harv = units.filter((u) => u.type === 'harvester').map((u) => u.id);
            if (harv.length && this.isShardAt(g.x, g.z)) {
                sim.command(team, { type: 'harvest', ids: harv, tx: Math.floor(g.x), tz: Math.floor(g.z) });
                const rest = ids.filter((i) => harv.indexOf(i) < 0);
                if (rest.length) sim.command(team, { type: 'move', ids: rest, x: g.x, z: g.z });
                this.R.marker(g.x, g.z, 'harvest'); G.audio.play('order');
                return true;
            }
            sim.command(team, { type: 'move', ids, x: g.x, z: g.z });
            this.R.marker(g.x, g.z, 'move'); G.audio.play('order');
            return true;
        }
        // healers (medic / acolyte → infantry, engineer → structures) ordered onto a damaged friendly target
        healers(units, target) {
            if (!target || target.dead || target.team !== this.G.team || !(target.hp < target.maxHp)) return [];
            const tu = target.kind === 'unit' ? C.UNITS[target.type] : null;
            return units.filter((u) => {
                const h = C.UNITS[u.type] && C.UNITS[u.type].heal; if (!h || u.id === target.id) return false;
                if (h.targets === 'bld') return target.kind === 'building';
                if (h.targets === 'inf') return !!tu && tu.armor === 'inf';
                return !!tu && tu.armor !== 'inf';
            });
        }
        healOrder(units, target) {
            const G = this.G, sim = G.sim, team = G.team, hs = this.healers(units, target);
            if (!hs.length) return false;
            const hid = hs.map((u) => u.id), bld = target.kind === 'building';
            // the simulation may take an explicit order; otherwise walk next to the target (healers work on idle allies in reach)
            let ok = false;
            for (const type of bld ? ['repair', 'heal'] : ['heal', 'repair']) { try { ok = sim.command(team, { type, ids: hid, targetId: target.id }); } catch (e) { ok = false; } if (ok) break; }
            if (!ok) {
                let gx = target.x, gz = target.z;
                if (bld) {
                    let cx = 0, cz = 0; for (const u of hs) { cx += u.x; cz += u.z; } cx /= hs.length; cz /= hs.length;
                    gx = Math.max(target.tx - 0.6, Math.min(target.tx + target.w + 0.6, cx)); gz = Math.max(target.tz - 0.6, Math.min(target.tz + target.d + 0.6, cz));
                    if (gx > target.tx - 0.6 && gx < target.tx + target.w + 0.6 && gz > target.tz - 0.6 && gz < target.tz + target.d + 0.6) gz = target.tz + target.d + 0.6;
                }
                sim.command(team, { type: 'move', ids: hid, x: gx, z: gz });
            }
            const rest = units.filter((u) => hid.indexOf(u.id) < 0).map((u) => u.id);
            if (rest.length) sim.command(team, { type: 'move', ids: rest, x: target.x, z: target.z });
            this.R.marker(target.x, target.z, bld ? 'repair' : 'heal'); G.audio.play('order'); G.setMode(null);
            return true;
        }
        rallyAt(x, y) {
            const G = this.G, b = G.selBuilding(); const g = this.R.screenToGround(x, y);
            G.setMode(null);
            if (!b || !g) return false;
            const cat = C.BUILDINGS[b.type].makes; if (cat !== 'infantry' && cat !== 'vehicle') return false;
            G.sim.command(G.team, { type: 'rally', cat, x: g.x, z: g.z });
            this.R.marker(g.x, g.z, 'rally'); G.audio.play('order');
            return true;
        }

        // ------------------------------------------------------------ keyboard
        keydown(e) {
            const G = this.G;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
            const k = e.key.toLowerCase();
            G.audio.unlock();
            if (k === 'escape') { e.preventDefault(); G.escape(); return; }
            if (!G.canInteract()) { if ((k === 'p') && G.state === 'playing') G.togglePause(); return; }
            this.keys.add(k);
            const digit = /^[1-9]$/.test(e.key) ? +e.key : (/^Digit[1-9]$/.test(e.code) ? +e.code.slice(5) : 0);
            if (digit) {
                e.preventDefault();
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) G.setGroup(digit); else G.recallGroup(digit);
                return;
            }
            if (e.ctrlKey && k === 'a') { e.preventDefault(); G.selectArmy(); return; }
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const hasUnits = G.selUnits().length > 0;
            switch (k) {
                case 'a': if (hasUnits) { e.preventDefault(); G.setMode(G.mode === 'attackMove' ? null : 'attackMove'); } break;
                case 's': if (hasUnits) { e.preventDefault(); G.stop(); } break;
                case 'q': G.selectArmy(); break;
                case 'h': case 'home': G.home(); break;
                case 'z': e.preventDefault(); G.superClick(); break;
                case 'p': G.togglePause(); break;
                case 'f': G.focusSelection(); break;
                case 'delete': break;
            }
        }

        // ------------------------------------------------------------ per frame: edge scroll, keys, inertia, press ring
        update(dt) {
            const G = this.G, R = this.R;
            if (!G.canInteract()) { this.inertia.vx = this.inertia.vy = 0; return; }
            const speed = R.cam.dist * 1.15 * dt;
            let px = 0, pz = 0;
            const k = this.keys, noSel = G.selUnits().length === 0;
            if (k.has('arrowleft') || (noSel && k.has('a'))) px -= 1;
            if (k.has('arrowright') || k.has('d')) px += 1;
            if (k.has('arrowup') || k.has('w')) pz -= 1;
            if (k.has('arrowdown') || (noSel && k.has('s'))) pz += 1;
            const h = this.hoverPos;
            if (h && !this.mouse && document.hasFocus()) {
                const E = 14, w = R.width, ht = R.height;
                let ex = 0, ez = 0;
                if (h.x < E) ex = -1; else if (h.x > w - E) ex = 1;
                if (h.y < E) ez = -1; else if (h.y > ht - E) ez = 1;
                if (ex || ez) { this.edgeT += dt; if (this.edgeT > 0.12) { px += ex; pz += ez; } } else this.edgeT = 0;
            }
            if (px || pz) { const n = Math.hypot(px, pz); R.panWorld(px / n * speed, pz / n * speed); }
            const iv = this.inertia;
            if (Math.abs(iv.vx) + Math.abs(iv.vy) > 15 && this.state === 'idle') {
                R.panScreen(iv.vx * dt, iv.vy * dt);
                const f = Math.exp(-dt * 5); iv.vx *= f; iv.vy *= f;
            } else { iv.vx = iv.vy = 0; }
            if (this.pressOn) {
                const t = (performance.now() - this.pressT0) / LONG_PRESS;
                if (t > 0.3) { this.press.classList.add('on'); this.press.style.setProperty('--p', Math.min(100, (t - 0.3) / 0.7 * 100) + '%'); }
            }
            if (this.hoverPos && !this.mouse && G.placing) this.updateGhostFromMouse(this.hoverPos.x, this.hoverPos.y);
            if (this.hoverPos && (px || pz) && G.mode === 'super' && !G.ui.touch) { const g = R.screenToGround(this.hoverPos.x, this.hoverPos.y); if (g) G.aimSuper(g.x, g.z); }
        }
        reset() {
            this.touches.clear(); this.state = 'idle'; this.mouse = null; this.hideBox(); this.pressEnd(); clearTimeout(this.lpTimer);
            this.inertia.vx = this.inertia.vy = 0; this.lastTap = this.lastClick = null; this.setCursor('');
        }
    }
    SF.Input = Input;
})();
