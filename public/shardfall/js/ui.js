// Shardfall: HUD and menus. Top bar (credits, power, clock), build sidebar / phone bottom sheet, minimap,
// selection panel + action buttons, superweapon button, mission objectives + radio messages, toasts, title (skirmish
// setup + campaign mission list), briefing / how-to / pause / end screens. Reads the sim; issues commands only through
// the game controller (main.js).
(function () {
    'use strict';
    const SF = window.SF = window.SF || {};
    const C = window.SF_CONFIG;
    const $ = (id) => document.getElementById(id);
    const svg = (id) => '<svg><use href="#' + id + '"/></svg>';
    const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60), r = s % 60; return m >= 60 ? Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + ':' + String(r).padStart(2, '0') : m + ':' + String(r).padStart(2, '0'); };
    const nameOf = (type) => (C.BUILDINGS[type] || C.UNITS[type] || { name: type }).name;
    const STATE_TEXT = { idle: 'Standing by', move: 'Moving', attack: 'Engaging', harvest: 'Harvesting', return: 'Returning to refinery', unload: 'Unloading' };
    const FACTIONS = C.FACTIONS || {};
    const SUPERS = C.SUPERWEAPONS || {};
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const facName = (f) => (FACTIONS[f] && FACTIONS[f].name) || (f ? f[0].toUpperCase() + f.slice(1) : '');
    const otherFac = (f) => (f === 'hegemony' ? 'vanguard' : 'hegemony');
    const superOf = (f) => { const b = FACTIONS[f] && C.BUILDINGS[FACTIONS[f].superweapon]; return b && SUPERS[b.superweapon]; };

    class UI {
        constructor(G) {
            this.G = G;
            this.tab = 'building';
            this.credShown = 0; this.credTarget = 0;
            this.items = new Map();
            this.toasts = [];
            this.recent = new Map();
            this.tick = 0; this.mmTick = 0; this.selKey = ''; this.objTick = 0; this.objKey = '';
            this.radioQ = []; this.radioCur = null; this.speakers = new Map(); this.swReady = false;
            this.touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
            document.body.classList.toggle('touch', this.touch);
            this.mm = $('minimap'); this.mmCtx = this.mm.getContext('2d');
            this.bind();
            if (window.ResizeObserver) new ResizeObserver(() => { this.measureSheet(); this.sizeMinimap(); }).observe(document.querySelector('.sheet'));
            if (window.ResizeObserver) new ResizeObserver(() => this.measureHud()).observe($('mhud'));
            this.layout();
        }

        // ------------------------------------------------------------ static wiring
        bind() {
            const G = this.G, click = (id, fn) => $(id).addEventListener('click', (e) => { G.audio.unlock(); G.audio.play('click'); fn(e); });
            click('btn-pause', () => G.togglePause());
            click('btn-sound', () => G.toggleSound());
            click('btn-sound2', () => G.toggleSound());
            click('btn-resume', () => G.togglePause(false));
            click('btn-restart', () => G.restart());
            click('btn-quit', () => G.quit());
            click('btn-again', () => G.restart());
            click('btn-title', () => G.quit());
            click('btn-next', () => G.nextMission());
            click('btn-start', () => G.start({ kind: 'skirmish', faction: this.faction(), difficulty: this.difficulty() }));
            click('btn-mode-skirmish', () => this.showPane('skirmish'));
            click('btn-mode-campaign', () => { if (G.missions().length) this.showPane('campaign'); else this.toast('The campaign is not available in this build', 'warn'); });
            document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { G.audio.unlock(); G.audio.play('click'); this.showPane(b.dataset.go); }));
            click('btn-brief-start', () => G.start({ kind: 'mission', index: this.briefIndex }));
            click('btn-brief-back', () => this.showTitle('campaign'));
            $('sw-btn').addEventListener('click', () => { G.audio.unlock(); G.superClick(); });
            click('mode-fire', () => G.fireSuper());
            $('obj-toggle').addEventListener('click', () => { G.audio.play('click'); this.setObjCollapsed(!this.objCollapsed); });
            $('radio').addEventListener('click', () => { G.audio.play('click'); this.nextRadio(); });
            document.querySelectorAll('#fac-seg button').forEach((b) => b.addEventListener('click', () => {
                G.audio.unlock(); G.audio.play('select');
                this.setFaction(b.dataset.fac);
                try { localStorage.setItem('shardfall.faction', b.dataset.fac); } catch (e) { /* blocked */ }
            }));
            document.querySelectorAll('#fac-seg button').forEach((b) => {
                const f = FACTIONS[b.dataset.fac] || {}, sw = superOf(b.dataset.fac);
                b.querySelector('.fac-tag').textContent = f.tagline || '';
                b.querySelector('.fac-sw').textContent = sw ? 'Superweapon: ' + sw.name : '';
            });
            try { const f = localStorage.getItem('shardfall.faction'); if (f === 'vanguard' || f === 'hegemony') this.setFaction(f); } catch (e) { /* blocked */ }
            click('btn-howto', () => this.show('howto', true));
            click('btn-howto2', () => this.show('howto', true));
            document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { G.audio.play('click'); this.hide('howto'); }));
            $('scr-howto').addEventListener('click', (e) => { if (e.target.id === 'scr-howto') this.hide('howto'); });
            document.querySelectorAll('#diff-seg button').forEach((b) => b.addEventListener('click', () => {
                G.audio.unlock(); G.audio.play('select');
                document.querySelectorAll('#diff-seg button').forEach((o) => { o.classList.toggle('on', o === b); o.setAttribute('aria-checked', o === b); });
                try { localStorage.setItem('shardfall.diff', b.dataset.diff); } catch (e) { /* blocked */ }
            }));
            try { const d = localStorage.getItem('shardfall.diff'); const b = d && document.querySelector('#diff-seg [data-diff="' + d + '"]'); if (b) b.click(); } catch (e) { /* blocked */ }
            document.querySelectorAll('.tab[data-tab]').forEach((b) => b.addEventListener('click', () => { G.audio.play('click'); this.setTab(b.dataset.tab); if (this.collapsed) this.toggleSheet(false); }));
            $('sheet-toggle').addEventListener('click', () => { G.audio.play('click'); this.toggleSheet(); });
            click('act-army', () => G.selectArmy());
            click('act-amove', () => G.setMode(G.mode === 'attackMove' ? null : 'attackMove'));
            click('act-stop', () => G.stop());
            click('act-rally', () => G.setMode(G.mode === 'rally' ? null : 'rally'));
            click('act-deselect', () => { G.setMode(null); G.select([]); });
            $('act-sell').addEventListener('click', () => this.sellClick());
            click('pb-ok', () => { if (G.ghost && G.canPlaceGhost()) G.placeAt(G.ghost.tx, G.ghost.tz); else G.denied("Can't build there"); });
            click('pb-cancel', () => G.cancelPlacing());
            click('mode-cancel', () => G.setMode(null));
            // minimap: tap/drag moves the camera; right click orders selected units there
            const mw = $('mm-wrap');
            const mmPos = (e) => { const r = this.mm.getBoundingClientRect(); const m = G.sim.map; return { x: (e.clientX - r.left) / r.width * m.w, z: (e.clientY - r.top) / r.height * m.h }; };
            mw.addEventListener('pointerdown', (e) => {
                if (!G.sim || mw.classList.contains('off')) return;
                e.preventDefault();
                const p = mmPos(e);
                if (e.button === 2) {
                    const units = G.selUnits();
                    if (units.length) { G.sim.command(G.team, { type: G.mode === 'attackMove' ? 'attackMove' : 'move', ids: units.map((u) => u.id), x: p.x, z: p.z }); G.render.marker(p.x, p.z, 'move'); G.audio.play('order'); G.setMode(null); }
                    return;
                }
                this.mmDrag = true; try { mw.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
                G.render.centerOn(p.x, p.z, true);
            });
            mw.addEventListener('pointermove', (e) => { if (this.mmDrag && G.sim) { const p = mmPos(e); G.render.centerOn(p.x, p.z, true); } });
            const endDrag = () => { this.mmDrag = false; };
            mw.addEventListener('pointerup', endDrag); mw.addEventListener('pointercancel', endDrag);
            mw.addEventListener('contextmenu', (e) => e.preventDefault());
            window.addEventListener('resize', () => this.layout());
            window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 200));
            if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.layout());
            if (window.self !== window.top && !/[?&]standalone=1\b/.test(location.search)) document.body.classList.add('in-iframe');
        }
        difficulty() { const b = document.querySelector('#diff-seg button.on'); return b ? b.dataset.diff : 'normal'; }
        faction() { const b = document.querySelector('#fac-seg button.on'); return b ? b.dataset.fac : 'vanguard'; }
        setFaction(f) {
            document.querySelectorAll('#fac-seg button').forEach((o) => { o.classList.toggle('on', o.dataset.fac === f); o.setAttribute('aria-checked', o.dataset.fac === f); });
            $('diff-h').textContent = 'Opponent: the ' + facName(otherFac(f));
            document.body.classList.toggle('pick-hegemony', f === 'hegemony');
        }

        layout() {
            const w = window.innerWidth, h = window.innerHeight, B = document.body;
            const side = (w >= 760 && w >= h * 1.05) || w >= 1000;
            B.classList.toggle('L-side', side); B.classList.toggle('L-bottom', !side);
            B.classList.toggle('short', side && h < 560);
            const sideW = side ? Math.round(Math.max(h < 560 ? 228 : 256, Math.min(304, w * 0.22))) : 0;
            document.documentElement.style.setProperty('--side-w', sideW + 'px');
            B.classList.toggle('narrow', side && sideW < 230 && h >= 560);
            B.classList.toggle('tabs-short', side && sideW < 280);
            B.classList.toggle('cramped', side && (w - sideW) < 900);
            this.side = side;
            requestAnimationFrame(() => {
                this.measureSheet();
                this.sizeMinimap();
                if (this.G.render) this.G.render.resize();
                this.G.onLayout && this.G.onLayout(side);
            });
            this.refreshReadyLabels();
        }
        measureSheet() {
            const sheet = document.querySelector('.sheet');
            if (!sheet) return;
            const h = this.side ? 0 : Math.round(sheet.getBoundingClientRect().height);
            if (h !== this.sheetH) { this.sheetH = h; document.documentElement.style.setProperty('--sheet-h', h + 'px'); }
        }
        sizeMinimap() {
            const r = this.mm.getBoundingClientRect(), pr = Math.min(2, window.devicePixelRatio || 1);
            const s = Math.max(32, Math.round(Math.min(r.width, r.height) * pr));
            if (this.mm.width !== s) { this.mm.width = s; this.mm.height = s; }
        }
        toggleSheet(force) {
            this.collapsed = force != null ? force : !this.collapsed;
            document.querySelector('.sheet').classList.toggle('collapsed', this.collapsed);
            this.layout();
        }
        setTab(t) {
            this.tab = t;
            document.querySelectorAll('.tab[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
            for (const [, it] of this.items) it.el.style.display = it.cat === t ? '' : 'none';
            const g = $('build-grid'); g.scrollLeft = 0; g.scrollTop = 0;
        }

        // ------------------------------------------------------------ screens
        show(name, on) { $('scr-' + name).classList.toggle('show', on !== false); }
        hide(name) { $('scr-' + name).classList.remove('show'); }
        hideAll() { ['start', 'brief', 'howto', 'pause', 'end'].forEach((n) => this.hide(n)); }

        // ------------------------------------------------------------ title: home / skirmish / campaign + briefing
        showTitle(pane) { this.hide('brief'); this.show('start'); this.showPane(pane || 'home'); }
        showPane(p) {
            const scr = $('scr-start');
            scr.dataset.pane = p; scr.scrollTop = 0;
            if (p === 'campaign') this.renderMissions();
            const L = this.G.missions(), n = L.filter((m) => this.G.missionDone(m.id)).length;
            $('camp-prog').textContent = L.length ? n + '/' + L.length : '';
            $('btn-mode-campaign').classList.toggle('unavailable', !L.length);
            $('camp-sub').textContent = L.length ? L.length + ' missions: the war for Kessar' : 'Not available in this build';
        }
        escapeTitle() {
            if ($('scr-brief').classList.contains('show')) { this.showTitle('campaign'); return true; }
            const scr = $('scr-start');
            if (scr.classList.contains('show') && scr.dataset.pane !== 'home') { this.showPane('home'); return true; }
            return false;
        }
        renderMissions() {
            const G = this.G, list = $('mission-list'), L = G.missions();
            list.innerHTML = '';
            L.forEach((m, i) => {
                const done = G.missionDone(m.id), open = G.missionUnlocked(i), f = m.faction || 'vanguard';
                const li = document.createElement('li');
                const b = document.createElement('button');
                b.type = 'button'; b.className = 'mission ' + f + (done ? ' done' : '') + (open ? '' : ' locked');
                b.dataset.index = i;
                const state = done ? svg('i-check') + '<span>Complete</span>' : open ? '<svg class="go"><use href="#i-back"/></svg><span>Ready</span>' : svg('i-lock') + '<span>Locked</span>';
                b.innerHTML = '<span class="ms-n">' + String(i + 1).padStart(2, '0') + '</span>' +
                    '<span class="ms-txt"><b>' + esc(m.title) + '</b><small>' + esc(m.summary || '') + '</small><em>' + svg(f === 'hegemony' ? 'i-hegemony' : 'i-vanguard') + 'Play as the ' + esc(facName(f)) + '</em></span>' +
                    '<span class="ms-state">' + state + '</span>';
                b.setAttribute('aria-label', 'Mission ' + (i + 1) + ': ' + m.title + (done ? ', complete' : open ? '' : ', locked'));
                b.addEventListener('click', () => {
                    G.audio.unlock();
                    if (!open) { G.audio.play('error'); this.toast('Complete mission ' + i + ' first', 'warn'); return; }
                    G.audio.play('click'); this.showBriefing(i);
                });
                li.appendChild(b); list.appendChild(li);
            });
        }
        showBriefing(i) {
            const G = this.G, m = G.missions()[i]; if (!m) return;
            this.briefIndex = i;
            const f = m.faction || 'vanguard', ef = m.enemyFaction || otherFac(f);
            $('scr-brief').className = 'screen modal brief show ' + f;
            $('brief-kicker').innerHTML = svg(f === 'hegemony' ? 'i-hegemony' : 'i-vanguard') + 'Mission ' + (i + 1) + ' · ' + esc(facName(f)) + ' vs ' + esc(facName(ef));
            $('brief-title').textContent = m.title;
            const paras = Array.isArray(m.briefing) ? m.briefing : (m.briefing ? [m.briefing] : [m.summary || '']);
            $('brief-body').innerHTML = paras.map((t) => '<p>' + esc(t) + '</p>').join('');
            $('brief-obj').innerHTML = (m.objectives || []).filter((o) => !o.hidden).map((o) => '<li' + (o.optional ? ' class="opt"' : '') + '><i></i><span>' + esc(o.text) + (o.optional ? ' <small>optional</small>' : '') + '</span></li>').join('') || '<li><i></i><span>Destroy every enemy structure</span></li>';
            $('btn-brief-start').textContent = G.missionDone(m.id) ? 'Replay mission' : 'Start mission';
            this.hide('start');
            $('scr-brief').scrollTop = 0;
        }
        loading(on, text, err) {
            const L = $('loading');
            if (text) $('loading-text').textContent = text;
            L.classList.toggle('err', !!err);
            L.classList.toggle('hide', !on);
        }
        setSound(muted) {
            $('btn-sound').innerHTML = svg(muted ? 'i-mute' : 'i-sound');
            $('btn-sound2').textContent = 'Sound: ' + (muted ? 'Off' : 'On');
        }
        showEnd(win, stats, mi) {
            const G = this.G, s = $('scr-end'); s.classList.toggle('lose', !win);
            const enemy = G.factionName(1 - G.team);
            $('end-title').classList.toggle('long', !!mi);
            $('btn-next').hidden = !(mi && win && mi.hasNext);
            if (mi) {
                $('end-title').textContent = win ? 'Mission complete' : 'Mission failed';
                const last = win && !mi.hasNext;
                $('end-sub').textContent = (mi.reason ? mi.reason + '. ' : '') + (last ? 'The war for Kessar is won. Campaign complete.' : 'Mission ' + (mi.index + 1) + ': ' + mi.mission.title + (win ? ' complete.' : ' failed.'));
                $('btn-again').textContent = win ? 'Replay' : 'Retry';
                $('btn-again').classList.toggle('primary', !win || !mi.hasNext);
                $('btn-title').textContent = 'Campaign';
            } else {
                $('end-title').textContent = win ? 'Victory' : 'Defeat';
                $('end-sub').textContent = win ? 'The ' + enemy + ' has fallen. The shard fields are yours.' : 'Your last structure has fallen. The ' + enemy + ' holds the field.';
                $('btn-again').textContent = 'Play again'; $('btn-again').classList.add('primary');
                $('btn-title').textContent = 'Title';
            }
            const rows = [['Time', fmtTime(stats.time)], ['Units built', stats.unitsBuilt], ['Units lost', stats.unitsLost], ['Enemy units destroyed', stats.kills], ['Structures destroyed', stats.buildingsDestroyed], ['Credits harvested', Math.round(stats.harvested).toLocaleString('en-US')]];
            $('end-stats').innerHTML = rows.map((r) => '<div class="stat"><b>' + r[1] + '</b><span>' + r[0] + '</span></div>').join('');
            this.show('end');
        }

        // ------------------------------------------------------------ per game
        startGame() {
            const G = this.G;
            this.credShown = this.credTarget = G.sim.teams[G.team].credits;
            document.body.classList.toggle('fac-hegemony', G.factionOf(G.team) === 'hegemony');
            $('btn-restart').textContent = G.mission ? 'Restart mission' : 'Restart skirmish';
            $('btn-quit').textContent = G.mission ? 'Quit to campaign' : 'Quit to title';
            this.swReady = false; this.lastSw = '';
            this.clearRadio(); this.speakers.clear();
            this.objKey = ''; this.objFlash = {};
            this.setObjCollapsed(!this.side);
            this.buildSidebar();
            this.clearToasts();
            this.selKey = '';
            this.mmBase = null;
            this.sizeMinimap();
            requestAnimationFrame(() => { this.measureSheet(); this.sizeMinimap(); });
            this.update(0, true);
        }
        buildSidebar() {
            const G = this.G, grid = $('build-grid');
            grid.innerHTML = ''; this.items.clear();
            const opts = this.sideOptions();
            this.itemsKey = opts.map((o) => o.type).join(',');
            const fac = G.factionOf(G.team);
            for (const o of opts) {
                const el = document.createElement('button');
                el.type = 'button'; el.className = 'build-item'; el.dataset.type = o.type;
                el.setAttribute('aria-label', nameOf(o.type) + ', ' + o.cost + ' credits');
                el.innerHTML = '<span class="thumb"></span><span class="lock">' + svg('i-lock') + '</span><span class="why"></span>' +
                    '<span class="sweep"></span><span class="cost">' + svg('i-shard') + o.cost + '</span><span class="qn"></span><span class="tag"></span>' +
                    '<span class="x" role="button" aria-label="Cancel">' + svg('i-close') + '</span><span class="nm">' + nameOf(o.type) + '</span><span class="pbar2"><i></i></span>';
                const thumb = G.render.thumbnail(o.cat === 'building' ? 'building' : 'unit', o.type, G.team, fac);
                if (thumb) el.querySelector('.thumb').style.backgroundImage = 'url(' + thumb + ')';
                const it = { el, type: o.type, cat: o.cat, last: {} };
                this.items.set(o.type, it);
                this.bindItem(it);
                grid.appendChild(el);
            }
            this.setTab(this.tab);
        }
        // the build options for the player's side: only shared types and the player's faction's own
        sideOptions() {
            const G = this.G, f = G.factionOf(G.team);
            return G.sim.options(G.team).filter((o) => { const d = C.BUILDINGS[o.type] || C.UNITS[o.type]; return !d || !d.faction || !f || d.faction === f; });
        }
        bindItem(it) {
            const G = this.G, el = it.el;
            let lp = null, suppress = false;
            el.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); G.audio.play('click'); G.buildCancel(it.type); });
            el.addEventListener('click', () => { if (suppress) { suppress = false; return; } G.audio.unlock(); G.buildClick(it.type); });
            el.addEventListener('contextmenu', (e) => { e.preventDefault(); G.buildCancel(it.type); });
            el.addEventListener('pointerdown', (e) => {
                if (e.pointerType === 'mouse') return;
                clearTimeout(lp);
                lp = setTimeout(() => { suppress = true; G.buildCancel(it.type); if (navigator.vibrate) try { navigator.vibrate(10); } catch (err) { /* ignore */ } }, 600);
            });
            const stop = () => clearTimeout(lp);
            el.addEventListener('pointerup', stop); el.addEventListener('pointercancel', stop); el.addEventListener('pointerleave', stop);
        }
        refreshReadyLabels() { for (const [, it] of this.items) it.last.tag = null; }
        updateSidebar() {
            const G = this.G, T = G.sim.teams[G.team], opts = this.sideOptions();
            const key = opts.map((o) => o.type).join(',');
            if (key !== this.itemsKey) this.buildSidebar();
            const bBusy = T.queues.building.length > 0 || !!T.ready;
            const badges = { building: '', infantry: '', vehicle: '' };
            const readyLabel = this.touch ? 'tap to place' : 'click to place';
            for (const o of opts) {
                const it = this.items.get(o.type); if (!it) continue;
                const el = it.el, L = it.last;
                const placing = G.placing === o.type;
                const ready = !!o.ready && !placing;
                const busy = !ready && !placing && o.progress > 0;
                const dim = o.cat === 'building' && bBusy && !o.ready && !o.queued && !o.locked;
                const hold = busy && T.credits < 1;
                const set = (cls, on) => { if (L[cls] !== on) { el.classList.toggle(cls, on); L[cls] = on; } };
                set('locked', !!o.locked); set('queued', o.queued > 0); set('ready', ready); set('placing', placing); set('busy', busy); set('dim', dim); set('hold', hold);
                if (o.locked && L.why !== o.reason) { el.querySelector('.why').textContent = o.reason || 'Locked'; L.why = o.reason; }
                const qn = o.queued > 1 || o.cat !== 'building' ? String(o.queued) : '';
                if (L.qn !== qn) { el.querySelector('.qn').textContent = qn; L.qn = qn; if (!qn) el.classList.remove('queued'), L.queued = false; }
                const p = Math.round((o.progress || 0) * 100);
                if (L.p !== p) { el.style.setProperty('--p', p + '%'); el.querySelector('.pbar2 i').style.width = (busy ? p : 0) + '%'; L.p = p; }
                const tag = placing ? 'PLACING' : ready ? 'READY<small style="display:block;font-size:10.5px;letter-spacing:.04em;font-weight:700">' + readyLabel + '</small>' : busy ? (hold ? 'ON HOLD' : p + '%') : '';
                if (L.tag !== tag) { el.querySelector('.tag').innerHTML = tag; L.tag = tag; }
                if (ready || placing) badges[o.cat] = 'ready';
                else if ((busy || o.queued) && !badges[o.cat]) badges[o.cat] = 'busy';
            }
            document.querySelectorAll('.tab[data-tab]').forEach((b) => {
                const i = b.querySelector('.badge'), v = badges[b.dataset.tab];
                if (i.dataset.v !== v) { i.className = 'badge' + (v ? ' ' + v : ''); i.dataset.v = v; }
            });
        }

        // ------------------------------------------------------------ top bar
        updateTop(dt) {
            const G = this.G, T = G.sim.teams[G.team];
            this.credTarget = T.credits;
            const diff = this.credTarget - this.credShown;
            if (Math.abs(diff) < 1) this.credShown = this.credTarget;
            else this.credShown += diff * Math.min(1, dt * 7) + Math.sign(diff) * Math.min(Math.abs(diff), dt * 60);
            const shown = Math.floor(this.credShown);
            if (shown !== this.lastCred) {
                $('credits').textContent = shown.toLocaleString('en-US');
                const box = $('credits-box');
                box.classList.toggle('up', diff > 2); box.classList.toggle('down', diff < -2);
                this.lastCred = shown;
            }
            const p = T.power, key = p.made + '/' + p.used + (T.lowPower ? 'L' : '');
            if (key !== this.lastPow) {
                $('power-text').textContent = p.used + '/' + p.made;
                $('power-fill').style.width = (p.made > 0 ? Math.min(100, p.used / p.made * 100) : (p.used > 0 ? 100 : 0)) + '%';
                $('power-box').classList.toggle('low', !!T.lowPower);
                $('power-box').title = 'Power: ' + p.used + ' used of ' + p.made + ' made' + (T.lowPower ? ' (LOW)' : '');
                this.lastPow = key;
            }
            const tt = fmtTime(G.sim.time); if (tt !== this.lastTime) { $('clock').textContent = tt; this.lastTime = tt; }
        }

        // ------------------------------------------------------------ minimap
        drawMinimap() {
            const G = this.G, sim = G.sim, T = sim.teams[G.team], wrap = $('mm-wrap');
            const on = !!T.radar;
            wrap.classList.toggle('off', !on);
            if (!on) return;
            const m = sim.map, W = m.w, H = m.h;
            if (!this.mmImg || this.mmImg.width !== W) { this.mmCanvas = document.createElement('canvas'); this.mmCanvas.width = W; this.mmCanvas.height = H; this.mmImg = this.mmCanvas.getContext('2d').createImageData(W, H); }
            const d = this.mmImg.data, vis = T.vis;
            for (let i = 0; i < W * H; i++) {
                const t = m.tiles[i], v = vis ? vis[i] : 2;
                let r, g, b;
                if (t === 1) { r = 92; g = 86; b = 78; }
                else if (t === 2 && m.shards[i] > 0) { const a = Math.min(1, m.shards[i] / C.ECONOMY.shardPerTile); r = 40; g = 150 + 80 * a; b = 130 + 50 * a; }
                else { r = 70; g = 66; b = 54; }
                const f = v === 2 ? 1 : v === 1 ? 0.45 : 0;
                d[i * 4] = r * f; d[i * 4 + 1] = g * f; d[i * 4 + 2] = b * f; d[i * 4 + 3] = 255;
            }
            for (const s of m.spires) { const i = (s.tz * W + s.tx) * 4; if (vis[s.tz * W + s.tx]) { d[i] = 150; d[i + 1] = 255; d[i + 2] = 230; } }
            this.mmCanvas.getContext('2d').putImageData(this.mmImg, 0, 0);
            const g = this.mmCtx, S = this.mm.width, k = S / W;
            g.imageSmoothingEnabled = false;
            g.drawImage(this.mmCanvas, 0, 0, S, S);
            const blue = '#4aa6ff', red = '#ff5a44';
            for (const e of sim.entities.values()) {
                if (e.dead) continue;
                const own = e.team === G.team;
                if (e.kind === 'building') {
                    const b = C.BUILDINGS[e.type];
                    const seen = own || G.render.isShown(e.id);
                    if (!seen) continue;
                    g.fillStyle = own ? blue : red;
                    g.fillRect(e.tx * k, e.tz * k, b.w * k, b.d * k);
                    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1; g.strokeRect(e.tx * k + 0.5, e.tz * k + 0.5, b.w * k - 1, b.d * k - 1);
                } else {
                    if (!own && !G.render.isShown(e.id)) continue;
                    const sel = G.selSet.has(e.id);
                    g.fillStyle = sel ? '#ffffff' : own ? '#8fd0ff' : '#ff7a62';
                    const s = Math.max(2, k * (e.type === 'harvester' ? 1.4 : 1));
                    g.fillRect(e.x * k - s / 2, e.z * k - s / 2, s, s);
                }
            }
            // superweapon strike warnings (everyone sees them)
            const strikes = sim.strikes || [];
            for (const st of strikes) {
                const d = SUPERS[st.kind] || { radius: 3 }, pulse = 0.6 + 0.4 * Math.sin(performance.now() / 120);
                g.strokeStyle = st.kind === 'rift' ? 'rgba(214,110,255,' + pulse + ')' : 'rgba(255,90,70,' + pulse + ')';
                g.lineWidth = Math.max(1.5, S / 90);
                g.beginPath(); g.arc(st.x * k, st.z * k, Math.max(4, d.radius * k), 0, Math.PI * 2); g.stroke();
            }
            // camera footprint
            const c = G.render.viewCorners();
            g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = Math.max(1, S / 160);
            g.beginPath(); c.forEach((p, i) => { const x = Math.max(0, Math.min(S, p.x * k)), y = Math.max(0, Math.min(S, p.z * k)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); g.stroke();
        }

        // ------------------------------------------------------------ selection panel + actions
        updateSelection(force) {
            const G = this.G, sel = G.selEntities();
            const B = document.body;
            B.classList.toggle('has-sel', sel.length > 0);
            const units = sel.filter((e) => e.kind === 'unit' && e.team === G.team);
            const bld = sel.length === 1 && sel[0].kind === 'building' && sel[0].team === G.team ? sel[0] : null;
            const makes = bld && C.BUILDINGS[bld.type].makes;
            $('act-amove').hidden = !units.length; $('act-stop').hidden = !units.length;
            $('act-deselect').hidden = !sel.length;
            $('act-rally').hidden = !(bld && (makes === 'infantry' || makes === 'vehicle'));
            $('act-sell').hidden = !(bld && bld.type !== 'core');
            $('act-amove').classList.toggle('on', G.mode === 'attackMove');
            $('act-rally').classList.toggle('on', G.mode === 'rally');
            if (!sel.length) { this.selKey = ''; return; }
            const panel = $('selpanel');
            if (sel.length === 1) {
                panel.classList.remove('multi');
                const e = sel[0], own = e.team === G.team, def = C.UNITS[e.type] || C.BUILDINGS[e.type] || {};
                const key = 's' + e.id;
                if (key !== this.selKey || force) {
                    this.selKey = key;
                    const th = G.render.thumbnail(e.kind === 'unit' ? 'unit' : 'building', e.type, e.team, G.factionOf(e.team));
                    $('sel-portrait').className = 'portrait' + (own ? '' : ' enemy');
                    $('sel-portrait').innerHTML = th ? '<i style="background-image:url(' + th + ')"></i>' : '';
                    $('sel-name').innerHTML = esc(def.name) + '<span class="tm ' + (own ? 'blue' : 'red') + '">' + esc(G.factionName(e.team)) + '</span>';
                }
                const hp = Math.max(0, Math.ceil(e.hp)), f = Math.max(0, Math.min(1, e.hp / e.maxHp));
                $('sel-hpfill').style.width = (f * 100) + '%';
                $('sel-hpfill').style.background = f > 0.6 ? 'var(--ok)' : f > 0.3 ? 'var(--warn)' : 'var(--danger)';
                $('sel-hptext').textContent = hp + ' / ' + e.maxHp;
                let sub = '';
                if (e.kind === 'unit') {
                    sub = '<b>' + (STATE_TEXT[e.state] || 'Standing by') + '</b>';
                    if (e.type === 'harvester' && own) sub += ' · <span class="cy">' + Math.round(e.carry || 0) + ' / ' + (def.capacity || 500) + '</span> shards';
                    else if (e.cloaked && own) sub += ' · <span class="cy">cloaked</span>';
                    else if (def.cloak && own) sub += ' · <span class="warn">revealed</span>';
                    else if (def.weapon) sub += ' · ' + def.weapon.replace(/([A-Z])/g, ' $1').toLowerCase();
                } else {
                    const pw = def.power || 0;
                    sub = (e.built != null && e.built < 1) ? '<b>Constructing ' + Math.round(e.built * 100) + '%</b>' : '<b>' + (pw >= 0 ? '+' : '') + pw + ' power</b>';
                    const sw = def.superweapon && G.sim.teams[e.team].super;
                    if (sw && sw.building === e.id && (e.built == null || e.built >= 1)) sub += ' · <span class="cy">' + (sw.ready ? 'READY' : 'charging ' + Math.floor(sw.charge * 100) + '%') + '</span>';
                    else if (own) {
                        if (makes === 'infantry' || makes === 'vehicle') sub += ' · ' + (this.touch ? 'Rally button: set rally' : 'Right-click: set rally');
                        else if (e.type !== 'core') sub += ' · sells for ' + Math.round(def.cost * C.ECONOMY.sellRefund);
                    }
                }
                if ($('sel-sub').innerHTML !== sub) $('sel-sub').innerHTML = sub;
            } else {
                panel.classList.add('multi');
                const by = new Map();
                for (const e of sel) { const k = e.team + ':' + e.type; if (!by.has(k)) by.set(k, { type: e.type, team: e.team, n: 0, hp: 0, max: 0, kind: e.kind }); const r = by.get(k); r.n++; r.hp += e.hp; r.max += e.maxHp; }
                const key = 'm' + Array.from(by.values()).map((r) => r.type + r.n).join(',');
                const rows = Array.from(by.values());
                if (key !== this.selKey || force) {
                    this.selKey = key;
                    const box = $('sel-multi'); box.innerHTML = '';
                    for (const r of rows) {
                        const th = G.render.thumbnail(r.kind === 'unit' ? 'unit' : 'building', r.type, r.team, G.factionOf(r.team));
                        const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.title = nameOf(r.type) + ' — tap to select only these';
                        c.innerHTML = (th ? '<i style="background-image:url(' + th + ')"></i>' : '') + '<b>' + r.n + '</b><span class="hp"><u></u></span>';
                        c.addEventListener('click', (ev) => { G.audio.play('select'); const ids = G.selEntities().filter((e) => e.type === r.type && e.team === r.team).map((e) => e.id); if (ev.shiftKey) G.select(G.sel.filter((i) => ids.indexOf(i) < 0)); else G.select(ids); });
                        c.dataset.k = r.team + ':' + r.type;
                        box.appendChild(c);
                    }
                }
                for (const r of rows) { const c = $('sel-multi').querySelector('[data-k="' + r.team + ':' + r.type + '"] .hp u'); if (c) c.style.width = Math.round(r.hp / r.max * 100) + '%'; }
            }
        }
        sellClick() {
            const G = this.G, b = G.selBuilding(), btn = $('act-sell');
            if (!b) return;
            if (!btn.classList.contains('confirm')) {
                G.audio.play('click');
                btn.classList.add('confirm'); btn.querySelector('span').textContent = 'Sure?';
                clearTimeout(this.sellT); this.sellT = setTimeout(() => { btn.classList.remove('confirm'); btn.querySelector('span').textContent = 'Sell'; }, 2200);
                return;
            }
            clearTimeout(this.sellT); btn.classList.remove('confirm'); btn.querySelector('span').textContent = 'Sell';
            G.sell(b.id);
        }

        // ------------------------------------------------------------ toasts
        toast(text, kind, x, z) {
            const now = performance.now();
            const last = this.recent.get(text);
            if (last && now - last < 3500) return;
            this.recent.set(text, now);
            const icons = { danger: 'i-amove', warn: 'i-bolt', good: 'i-check', info: 'i-logo' };
            const el = document.createElement('div');
            el.className = 'toast ' + (kind || 'info') + (x != null ? ' jump' : '');
            el.innerHTML = svg(icons[kind] || 'i-logo') + '<span></span>' + (x != null ? '<small>' + (this.touch ? 'tap' : 'click') + ' to view</small>' : '');
            el.querySelector('span').textContent = text;
            if (x != null) el.addEventListener('click', () => { this.G.render.centerOn(x, z); el.remove(); });
            const box = $('toasts'); box.appendChild(el);
            this.toasts.push(el);
            while (this.toasts.length > 4) { const o = this.toasts.shift(); o.remove(); }
            setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); this.toasts = this.toasts.filter((t) => t !== el); }, 400); }, kind === 'danger' ? 4200 : 3000);
        }
        clearToasts() { $('toasts').innerHTML = ''; this.toasts = []; this.recent.clear(); }

        // ------------------------------------------------------------ events
        onEvents(events) {
            const G = this.G;
            for (const ev of events) {
                if (ev.type === 'alert' && ev.team === G.team) {
                    const t = String(ev.text || ''), low = t.toLowerCase();
                    let kind = 'info', snd = null;
                    if (/superweapon|lance|rift/.test(low)) { kind = /enemy/.test(low) ? 'danger' : /ready/.test(low) ? 'good' : 'warn'; snd = /enemy/.test(low) ? 'attack' : null; }
                    else if (/attack|lost|destroy/.test(low)) { kind = 'danger'; snd = /attack/.test(low) ? 'attack' : 'error'; }
                    else if (/restored|online|complete|ready/.test(low)) { kind = 'good'; }
                    else if (/power/.test(low)) { kind = 'warn'; snd = 'lowpower'; }
                    else if (/credit|funds|cash/.test(low)) { kind = 'warn'; snd = 'error'; }
                    const fresh = !(this.recent.get(t) && performance.now() - this.recent.get(t) < 3500);
                    this.toast(t, kind, ev.x, ev.z);
                    if (snd && fresh) G.audio.play(snd);
                } else if (ev.type === 'objective') {
                    this.onObjective(ev);
                } else if (ev.type === 'message') {
                    this.pushRadio(ev);
                } else if (ev.type === 'complete' && ev.team === G.team) {
                    if (ev.cat === 'building') { this.toast(nameOf(ev.what) + ' ready — ' + (this.touch ? 'tap' : 'click') + ' it to place', 'good'); G.audio.play('build'); if (!this.side) this.setTab('building'); }
                    else G.audio.play('unit');
                }
            }
        }
        modeBar() {
            const G = this.G, bar = $('modebar');
            const sup = G.mode === 'super';
            const on = G.mode === 'attackMove' || G.mode === 'rally' || sup;
            bar.classList.toggle('show', on); document.body.classList.toggle('mode-on', on);
            bar.classList.toggle('super', sup);
            const st = sup && G.superState();
            bar.classList.toggle('rift', !!(st && st.type === 'rift'));
            const aim = G.superAim, fire = $('mode-fire');
            fire.hidden = !(sup && this.touch);
            fire.disabled = !(aim && aim.ok);
            bar.classList.toggle('bad', !!(sup && aim && !aim.ok));
            if (!on) return;
            let t;
            if (sup) {
                const d = G.superDef() || { name: 'Superweapon' };
                if (aim && !aim.ok) t = 'Not explored: pick another spot';
                else if (this.touch) t = aim ? d.name + ': tap again to fire' : d.name + ': tap a target';
                else t = d.name + ': click to fire';
            } else t = G.mode === 'rally' ? (this.touch ? 'Rally: tap the ground' : 'Rally: click the ground') : (this.touch ? 'Attack-move: tap a target' : 'Attack-move: click a target');
            if ($('mode-text').textContent !== t) $('mode-text').textContent = t;
        }

        // ------------------------------------------------------------ superweapon button
        updateSuper() {
            const G = this.G, T = G.sim.teams[G.team], s = T && T.super, btn = $('sw-btn');
            const show = !!s;
            if (btn.hidden === show) { btn.hidden = !show; document.body.classList.toggle('has-sw', show); }
            if (!s) { this.swReady = false; return; }
            const d = SUPERS[s.type] || { name: 'Superweapon' };
            const pct = Math.max(0, Math.min(100, Math.floor((s.charge || 0) * 100)));
            const paused = !s.ready && !!T.lowPower;
            const key = s.type + pct + (s.ready ? 'R' : '') + (paused ? 'P' : '') + (G.mode === 'super' ? 'M' : '');
            if (key !== this.lastSw) {
                this.lastSw = key;
                $('sw-fg').style.strokeDashoffset = String(100 - (s.ready ? 100 : pct));
                btn.classList.toggle('ready', !!s.ready); btn.classList.toggle('paused', paused); btn.classList.toggle('on', G.mode === 'super');
                btn.classList.toggle('rift', s.type === 'rift');
                $('sw-ico').innerHTML = '<use href="#' + (s.type === 'rift' ? 'i-rift' : 'i-lance') + '"/>';
                $('sw-lbl').textContent = s.ready ? 'READY' : paused ? 'NO POWER' : pct + '%';
                const tip = d.name + (s.ready ? ': ready, ' + (this.touch ? 'tap' : 'click (Z)') + ' to target' : paused ? ': charging paused (low power)' : ': charging ' + pct + '%');
                btn.title = tip; btn.setAttribute('aria-label', tip);
            }
            if (s.ready && !this.swReady) G.audio.play('swready');
            this.swReady = !!s.ready;
        }

        // ------------------------------------------------------------ mission objectives
        setObjCollapsed(c) {
            this.objCollapsed = !!c;
            $('objectives').classList.toggle('collapsed', this.objCollapsed);
            $('obj-toggle').setAttribute('aria-expanded', String(!this.objCollapsed));
        }
        missionObjectives() {
            const G = this.G, M = G.sim && G.sim.mission;
            if (M && Array.isArray(M.objectives)) return M.objectives;
            const def = G.mission;
            return def ? (def.objectives || []).map((o) => ({ id: o.id, text: o.text, done: false, failed: false, progress: '', optional: !!o.optional, hidden: !!o.hidden })) : [];
        }
        updateObjectives(force) {
            const G = this.G; if (!G.mission) return;
            const objs = this.missionObjectives().filter((o) => !o.hidden);
            const key = objs.map((o) => o.id + (o.done ? 'D' : '') + (o.failed ? 'F' : '') + '|' + (o.progress || '') + '|' + (this.objFlash[o.id] ? 'X' : '')).join(';');
            if (key === this.objKey && !force) return;
            this.objKey = key;
            const req = objs.filter((o) => !o.optional), done = req.filter((o) => o.done).length;
            $('obj-count').textContent = done + '/' + req.length;
            const cur = req.find((o) => !o.done && !o.failed) || objs.find((o) => !o.done && !o.failed);
            $('obj-cur').textContent = cur ? cur.text : (req.length && done === req.length ? 'All objectives complete' : '');
            $('obj-list').innerHTML = objs.map((o) => '<li class="' + (o.done ? 'done' : o.failed ? 'failed' : '') + (o.optional ? ' opt' : '') + (this.objFlash[o.id] ? ' flash' : '') + '">' +
                '<i>' + (o.done ? svg('i-check') : o.failed ? svg('i-close') : '') + '</i><span>' + esc(o.text) + (o.optional ? ' <small>optional</small>' : '') + '</span>' +
                (o.progress && !o.done && !o.failed ? '<b>' + esc(o.progress) + '</b>' : '') + '</li>').join('');
        }
        onObjective(ev) {
            const G = this.G, text = ev.text || '';
            if (ev.failed) { this.toast('Objective failed: ' + text, 'danger'); G.audio.play('objfail'); }
            else if (ev.done) { this.toast('Objective complete: ' + text, 'good'); G.audio.play('objective'); }
            else if (text) { this.toast('New objective: ' + text, 'info'); G.audio.play('objnew'); }
            if (ev.id != null) {
                this.objFlash[ev.id] = true; this.updateObjectives(true);
                setTimeout(() => { delete this.objFlash[ev.id]; this.updateObjectives(true); }, 1600);
            }
            if (!ev.done && !ev.failed && this.objCollapsed && !this.side) { /* phone: the header line shows the new one */ }
        }

        // ------------------------------------------------------------ radio messages (queued, ~5-7 s each, tap to skip)
        pushRadio(m) {
            if (!m || !m.text) return;
            this.radioQ.push({ from: m.from || 'Command', text: String(m.text), portrait: m.portrait });
            if (this.radioQ.length > 8) this.radioQ.splice(0, this.radioQ.length - 8);
            if (!this.radioCur) this.nextRadio(); else this.radioMore();
        }
        speakerSide(m) {
            if (m.portrait && FACTIONS[m.portrait]) return m.portrait;
            const G = this.G, me = G.factionOf(G.team);
            if (!this.speakers.has(m.from)) this.speakers.set(m.from, this.speakers.size === 0 ? me : otherFac(me));
            return this.speakers.get(m.from);
        }
        nextRadio() {
            const box = $('radio'), m = this.radioQ.shift();
            this.radioCur = m || null;
            if (!m) { box.hidden = true; box.classList.remove('show'); return; }
            const side = this.speakerSide(m);
            const initials = m.from.replace(/^(cmdr|commander|overseer|lt|lieutenant|capt|captain|gen|general|col|colonel|maj|major|sgt)\.?\s+/i, '').split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
            box.className = 'radio show ' + side;
            $('r-portrait').innerHTML = svg(side === 'hegemony' ? 'i-hegemony' : 'i-vanguard') + '<b>' + esc(initials) + '</b>';
            $('r-from').textContent = m.from;
            $('r-text').textContent = m.text;
            this.radioDur = Math.max(5, Math.min(7.5, 3.6 + m.text.length * 0.035));
            this.radioLeft = this.radioDur;
            const t = $('r-timer'); t.style.animation = 'none'; void t.offsetWidth; t.style.animation = 'radiotimer ' + this.radioDur + 's linear forwards';
            box.hidden = false;
            this.radioMore();
            this.G.audio.play('radio');
        }
        radioMore() { $('r-more').textContent = this.radioQ.length ? '+' + this.radioQ.length : ''; }
        clearRadio() { this.radioQ = []; this.radioCur = null; const b = $('radio'); b.hidden = true; b.classList.remove('show'); }
        measureHud() {
            const h = document.body.classList.contains('mission') ? Math.round($('mhud').getBoundingClientRect().height) : 0;
            if (h !== this.mhudH) { this.mhudH = h; document.documentElement.style.setProperty('--mhud-h', h + 'px'); }
        }
        placeBar() {
            const G = this.G, bar = $('placebar');
            bar.classList.toggle('show', !!G.placing);
            document.body.classList.toggle('placing', !!G.placing);
            if (G.placing) {
                $('pb-ok').disabled = !G.canPlaceGhost();
                $('pb-hint').textContent = (this.touch ? 'Tap the map to position, tap again to build' : 'Click to build · right-click / Esc to cancel') + ' — ' + nameOf(G.placing);
            }
        }

        // ------------------------------------------------------------ frame
        update(dt, force) {
            const G = this.G; if (!G.sim) return;
            this.updateTop(dt);
            this.tick += dt; this.mmTick += dt; this.objTick += dt;
            if (this.tick > 0.1 || force) { this.tick = 0; this.updateSidebar(); this.updateSelection(force); this.modeBar(); this.placeBar(); this.updateSuper(); }
            if (this.objTick > 0.25 || force) { this.objTick = 0; this.updateObjectives(force); this.measureHud(); }
            if (this.radioCur && !G.paused) { this.radioLeft -= dt; if (this.radioLeft <= 0) this.nextRadio(); }
            if (this.mmTick > 0.15 || force) { this.mmTick = 0; this.drawMinimap(); }
        }
    }
    SF.UI = UI;
})();
