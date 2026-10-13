// Hole Haul: screens (level map, level card, HUD, pause, win, out of time, shop), the save, and touch/keyboard input.
(() => {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /* ── the save (this browser only) ─────────────────────────── */
    const KEY = 'hh.save.v1';
    const fresh = () => ({ unlocked: 0, stars: {}, coins: 120, boosters: { freeze: 2, magnet: 2, compass: 2, grow: 2 }, upg: { size: 0, speed: 0, time: 0 } });
    let save = fresh();
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) save = { ...fresh(), ...s, boosters: { ...fresh().boosters, ...(s.boosters || {}) }, upg: { ...fresh().upg, ...(s.upg || {}) } }; } catch { /* private mode */ }
    const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ } };

    const BOOSTERS = [
        { id: 'freeze', icon: '⏱️', name: 'Freeze', what: 'Stops the clock for 10 seconds', cost: 60 },
        { id: 'magnet', icon: '🧲', name: 'Magnet', what: 'Pulls wanted items in for 8 seconds', cost: 60 },
        { id: 'compass', icon: '🧭', name: 'Finder', what: 'Points at every wanted item', cost: 40 },
        { id: 'grow', icon: '🚀', name: 'Grow', what: 'Makes the hole one size bigger', cost: 80 },
    ];
    const UPGRADES = [
        { id: 'size', icon: '⭕', name: 'Bigger start', what: 'Start each level one size up', max: 3 },
        { id: 'speed', icon: '💨', name: 'Faster hole', what: '+7% speed per level', max: 5 },
        { id: 'time', icon: '⏳', name: 'More time', what: '+5 seconds on every level', max: 5 },
    ];
    const upgCost = (lvl) => Math.round(150 * Math.pow(lvl + 1, 1.5) / 10) * 10;
    const CONTINUE_COST = 50, CONTINUE_SECONDS = 15;

    const K = () => window.HH_MODELS.kinds;
    const emoji = (kind) => (K()[kind] && K()[kind].emoji) || '•';
    const fmt = (s) => { s = Math.ceil(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    const starsFor = (left, total) => (left / total >= 0.45 ? 3 : left / total >= 0.2 ? 2 : 1);

    class HH_UI {
        constructor() {
            this.level = null; this.continued = false; this.coinsHere = 0;
            this.game = new window.HH_Game($('stage'), {
                onTarget: (kind, got, need) => this.paintTargets(kind),
                onAllTargets: (r) => setTimeout(() => this.win(r), 900),
                onXP: (lvl, frac, grew) => { $('hole-lvl').textContent = `LV ${lvl}`; $('xp-fill').style.width = `${Math.round(frac * 100)}%`; if (grew && this.game.mode === 'play') this.banner('Bigger!'); },
                onTime: (s, frozen) => { const t = $('timer'); const txt = fmt(s); if (t.textContent !== txt) t.textContent = txt; t.classList.toggle('low', s <= 10 && !frozen); t.classList.toggle('frozen', frozen); },
                onEat: (e) => { if (e.coin) { this.coinsHere++; $('hud-coins').textContent = save.coins + this.coinsHere; } if (e.target || e.coin) this.pop(e); },
                onFail: () => setTimeout(() => this.fail(), 500),
                onBooster: (name, secs) => { const b = BOOSTERS.find((x) => x.id === name); if (secs) this.banner(`${b.icon} ${b.name} ${secs}s`); },
            });
            this.bindInput();
            $('btn-pause').addEventListener('click', () => this.pauseMenu());
            $('btn-play').addEventListener('click', () => this.levelCard(Math.min(save.unlocked, window.HH_LEVELS.count - 1)));
            $('btn-shop').addEventListener('click', () => this.shop());
            $('btn-sound').addEventListener('click', () => { window.HH_AUDIO.setMuted(!window.HH_AUDIO.muted); this.paintSound(); });
            this.paintSound();
            document.addEventListener('pointerdown', () => window.HH_AUDIO.unlock(), { once: true });
        }

        paintSound() { $('btn-sound').textContent = window.HH_AUDIO.muted ? '🔇 Sound off' : '🔊 Sound on'; }

        /* ── level map ────────────────────────────────────────── */
        showMap() {
            this.hideModal(); $('hud').classList.add('hidden'); $('map').classList.remove('hidden');
            $('map-coins').textContent = save.coins;
            const path = $('map-path'); path.innerHTML = '';
            const L = window.HH_LEVELS;
            for (const p of L.packs) {
                const th = L.themes[p.theme];
                const pack = document.createElement('section'); pack.className = 'pack';
                pack.style.setProperty('--pack', th.a); pack.style.setProperty('--pack2', th.rim);
                const got = Array.from({ length: p.last - p.first + 1 }, (_, i) => save.stars[p.first + i] || 0).reduce((a, b) => a + b, 0);
                pack.innerHTML = `<div class="pack-head"><span class="pack-name">${esc(p.name)}</span><span class="pack-stars">★ ${got}/${(p.last - p.first + 1) * 3}</span></div><div class="nodes"></div>`;
                const nodes = pack.querySelector('.nodes');
                for (let n = p.first; n <= p.last; n++) {
                    const d = L.def(n), locked = n > save.unlocked, st = save.stars[n] || 0;
                    const b = document.createElement('button'); b.type = 'button';
                    b.className = `node${locked ? ' locked' : ''}${n === save.unlocked ? ' current' : ''}${d.difficulty !== 'Normal' ? ' hard' : ''}`;
                    b.innerHTML = `<span class="node-num">${locked ? '🔒' : n + 1}</span><span class="node-stars">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span>${d.difficulty !== 'Normal' ? `<span class="node-tag">${d.difficulty === 'Hard' ? 'HARD' : 'SUPER HARD'}</span>` : ''}`;
                    if (!locked) b.addEventListener('click', () => { window.HH_AUDIO.play('tap'); this.levelCard(n); });
                    nodes.appendChild(b);
                }
                path.appendChild(pack);
            }
            requestAnimationFrame(() => { const cur = path.querySelector('.node.current') || path.querySelector('.node:not(.locked):last-of-type'); if (cur) cur.scrollIntoView({ block: 'center' }); });
            this.game.attract(L.def(Math.min(save.unlocked, L.count - 1)));
        }

        levelCard(n) {
            const d = window.HH_LEVELS.def(n), th = window.HH_LEVELS.themes[d.theme];
            const time = d.time + save.upg.time * 5;
            this.modal(`
                <div class="card-kicker">${esc(th.name)}${d.difficulty !== 'Normal' ? ` · <b class="tag-hard">${d.difficulty}</b>` : ''}</div>
                <h2>Level ${n + 1}</h2>
                <p class="card-sub">Swallow these before the clock runs out</p>
                <div class="goal-row">${d.targets.map((t) => `<div class="goal"><span class="goal-ico">${emoji(t.kind)}</span><span class="goal-n">×${t.count}</span><span class="goal-name">${esc(K()[t.kind].name)}</span></div>`).join('')}</div>
                <div class="card-time">⏱️ ${fmt(time)}</div>
                <div class="card-actions"><button class="pill-btn ghost" data-act="close" type="button">Back</button><button class="pill-btn play" data-act="go" type="button">PLAY</button></div>`, {
                close: () => this.hideModal(),
                go: () => this.play(n),
            });
        }

        /* ── playing ──────────────────────────────────────────── */
        play(n) {
            this.hideModal();
            this.level = n; this.continued = false; this.coinsHere = 0;
            const d = window.HH_LEVELS.def(n);
            d.time += save.upg.time * 5;
            this.game.load(d, { startLevel: 1 + save.upg.size, speedMul: 1 + save.upg.speed * 0.07 });
            $('map').classList.add('hidden'); $('hud').classList.remove('hidden');
            $('hud-coins').textContent = save.coins;
            $('timer').textContent = fmt(d.time);
            this.paintTargets(); this.paintBoosters();
            $('hint').classList.toggle('on', n === 0);
            this.banner(`Level ${n + 1}`);
            setTimeout(() => this.game.start(), 350);
        }

        paintTargets(flash) {
            const W = this.game.world; if (!W) return;
            $('targets').innerHTML = Object.keys(W.need).map((k) => {
                const done = W.got[k] >= W.need[k];
                return `<div class="target${done ? ' done' : ''}${k === flash ? ' bump' : ''}"><span class="t-ico">${emoji(k)}</span><span class="t-n">${done ? '✓' : `${W.got[k]}/${W.need[k]}`}</span></div>`;
            }).join('');
        }

        paintBoosters() {
            const box = $('boosters'); box.innerHTML = '';
            for (const b of BOOSTERS) {
                const n = save.boosters[b.id] || 0;
                const el = document.createElement('button'); el.type = 'button'; el.className = `booster${n ? '' : ' empty'}`; el.title = `${b.name}: ${b.what}`;
                el.innerHTML = `<span class="b-ico">${b.icon}</span><span class="b-n">${n || `+${b.cost}`}</span>`;
                el.addEventListener('pointerdown', (e) => e.stopPropagation());
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!save.boosters[b.id]) {
                        if (save.coins < b.cost) { this.banner('Not enough coins'); return; }
                        save.coins -= b.cost; save.boosters[b.id] = 1; persist(); $('hud-coins').textContent = save.coins + this.coinsHere;
                    }
                    if (this.game.useBooster(b.id)) { save.boosters[b.id]--; persist(); }
                    this.paintBoosters();
                });
                box.appendChild(el);
            }
        }

        pauseMenu() {
            if (this.game.mode !== 'play') return;
            this.game.pause(true);
            this.modal(`<h2>Paused</h2><p class="card-sub">Level ${this.level + 1}</p>
                <div class="card-actions col"><button class="pill-btn play" data-act="resume" type="button">Resume</button><button class="pill-btn ghost" data-act="restart" type="button">Restart</button><button class="pill-btn ghost" data-act="map" type="button">Level map</button><button class="pill-btn ghost" data-act="sound" type="button">${window.HH_AUDIO.muted ? '🔇 Sound off' : '🔊 Sound on'}</button></div>`, {
                resume: () => { this.hideModal(); this.game.pause(false); },
                restart: () => this.play(this.level),
                map: () => this.showMap(),
                sound: (btn) => { window.HH_AUDIO.setMuted(!window.HH_AUDIO.muted); btn.textContent = window.HH_AUDIO.muted ? '🔇 Sound off' : '🔊 Sound on'; this.paintSound(); },
            });
        }

        win({ timeLeft, time }) {
            const n = this.level, stars = starsFor(timeLeft, time);
            const earned = 20 + stars * 10 + this.coinsHere;
            save.coins += earned; save.stars[n] = Math.max(save.stars[n] || 0, stars);
            save.unlocked = Math.max(save.unlocked, Math.min(n + 1, window.HH_LEVELS.count - 1));
            const last = n + 1 >= window.HH_LEVELS.count;
            persist();
            this.modal(`<div class="card-kicker">Level ${n + 1}</div><h2>Hole-y moly!</h2>
                <div class="stars">${[0, 1, 2].map((i) => `<span class="star${i < stars ? ' on' : ''}" style="--d:${i * 0.25}s">★</span>`).join('')}</div>
                <p class="card-sub">${fmt(timeLeft)} to spare</p>
                <div class="reward"><span class="coin-ico"></span>+${earned}</div>
                <div class="card-actions"><button class="pill-btn ghost" data-act="map" type="button">Map</button>${last ? '' : '<button class="pill-btn play" data-act="next" type="button">NEXT</button>'}</div>`, {
                map: () => this.showMap(),
                next: () => this.levelCard(n + 1),
            });
            [0, 1, 2].forEach((i) => { if (i < stars) setTimeout(() => window.HH_AUDIO.play('star', i), 300 + i * 250); });
            this.confetti();
        }

        fail() {
            const W = this.game.world;
            const left = Object.keys(W.need).filter((k) => W.got[k] < W.need[k]).map((k) => `<div class="goal"><span class="goal-ico">${emoji(k)}</span><span class="goal-n">${W.need[k] - W.got[k]} left</span></div>`).join('');
            const canContinue = !this.continued && save.coins >= CONTINUE_COST;
            this.modal(`<h2>Out of time!</h2><p class="card-sub">So close. Still to go:</p><div class="goal-row">${left}</div>
                <div class="card-actions col">${this.continued ? '' : `<button class="pill-btn play" data-act="more" type="button" ${canContinue ? '' : 'disabled'}>+${CONTINUE_SECONDS}s for <span class="coin-ico sm"></span>${CONTINUE_COST}</button>`}<button class="pill-btn ghost" data-act="retry" type="button">Try again</button><button class="pill-btn ghost" data-act="map" type="button">Level map</button></div>`, {
                more: () => { if (save.coins < CONTINUE_COST) return; save.coins -= CONTINUE_COST; persist(); this.continued = true; this.hideModal(); $('hud-coins').textContent = save.coins + this.coinsHere; this.game.addTime(CONTINUE_SECONDS); },
                retry: () => this.play(this.level),
                map: () => this.showMap(),
            });
        }

        shop() {
            const render = () => `<h2>Boosters &amp; upgrades</h2><div class="shop-coins"><span class="coin-ico"></span>${save.coins}</div>
                <div class="shop-h">UPGRADES · KEEP FOREVER</div>
                ${UPGRADES.map((u) => { const lv = save.upg[u.id], maxed = lv >= u.max, cost = upgCost(lv); return `<div class="shop-row"><span class="s-ico">${u.icon}</span><span class="s-text"><b>${u.name}</b><small>${u.what}</small><span class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span></span><button class="pill-btn buy" data-act="upg:${u.id}" type="button" ${maxed || save.coins < cost ? 'disabled' : ''}>${maxed ? 'MAX' : `<span class="coin-ico sm"></span>${cost}`}</button></div>`; }).join('')}
                <div class="shop-h">BOOSTERS · USE IN A LEVEL</div>
                ${BOOSTERS.map((b) => `<div class="shop-row"><span class="s-ico">${b.icon}</span><span class="s-text"><b>${b.name} <em>×${save.boosters[b.id] || 0}</em></b><small>${b.what}</small></span><button class="pill-btn buy" data-act="boost:${b.id}" type="button" ${save.coins < b.cost ? 'disabled' : ''}><span class="coin-ico sm"></span>${b.cost}</button></div>`).join('')}
                <div class="card-actions"><button class="pill-btn play" data-act="close" type="button">Done</button></div>`;
            const acts = {
                close: () => { this.hideModal(); $('map-coins').textContent = save.coins; },
                buy: (btn, arg) => {
                    const [kind, id] = arg.split(':');
                    if (kind === 'upg') { const cost = upgCost(save.upg[id]); if (save.coins < cost) return; save.coins -= cost; save.upg[id]++; }
                    else { const b = BOOSTERS.find((x) => x.id === id); if (save.coins < b.cost) return; save.coins -= b.cost; save.boosters[id] = (save.boosters[id] || 0) + 1; }
                    persist(); window.HH_AUDIO.play('coin'); this.modal(render(), acts); $('map-coins').textContent = save.coins;
                },
            };
            this.modal(render(), acts);
        }

        /* ── little UI bits ───────────────────────────────────── */
        modal(html, acts = {}) {
            const m = $('modal'), c = $('card');
            c.innerHTML = html; m.classList.remove('hidden');
            c.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
                window.HH_AUDIO.play('tap');
                const a = b.dataset.act, [name, ...rest] = a.split(':');
                if (acts[a]) acts[a](b); else if (rest.length && acts.buy) acts.buy(b, a); else if (acts[name]) acts[name](b, rest.join(':'));
            }));
        }
        confetti() {
            const box = document.createElement('div'); box.className = 'confetti';
            const cols = ['#ffcf33', '#ff5c8a', '#49d16b', '#6fd3ff', '#a77bff'];
            for (let i = 0; i < 70; i++) {
                const c = document.createElement('i');
                c.style.left = `${Math.random() * 100}%`; c.style.background = cols[i % cols.length];
                c.style.setProperty('--x', `${(Math.random() - 0.5) * 160}px`); c.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
                c.style.animationDelay = `${Math.random() * 0.4}s`; c.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
                box.appendChild(c);
            }
            document.body.appendChild(box); setTimeout(() => box.remove(), 3500);
        }
        hideModal() { $('modal').classList.add('hidden'); }
        banner(text) { const b = $('banner'); b.textContent = text; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); }
        pop(e) {
            const p = this.game.project(e.x, 0.5, e.z), el = document.createElement('div');
            el.className = 'pop'; el.textContent = e.coin ? '+1 🪙' : `+1 ${emoji(e.kind)}`;
            el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
            $('hud').appendChild(el); setTimeout(() => el.remove(), 900);
        }

        /* ── input: a floating joystick wherever you touch, or WASD/arrows ── */
        bindInput() {
            const joy = $('joy'), knob = $('joy-knob'), stage = document.body;
            let id = null, ox = 0, oy = 0;
            const R = 56;
            const set = (x, y) => this.game.setInput(x, y);
            stage.addEventListener('pointerdown', (e) => {
                if (this.game.mode !== 'play' || e.target.closest('button, .card, .modal, a')) return;
                id = e.pointerId; ox = e.clientX; oy = e.clientY;
                joy.style.left = `${ox}px`; joy.style.top = `${oy}px`; joy.classList.add('on'); knob.style.transform = 'translate(-50%, -50%)';
                $('hint').classList.remove('on');
            });
            stage.addEventListener('pointermove', (e) => {
                if (e.pointerId !== id) return;
                let dx = e.clientX - ox, dy = e.clientY - oy; const len = Math.hypot(dx, dy);
                if (len > R) { dx *= R / len; dy *= R / len; }
                knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
                const m = Math.min(1, len / R), a = Math.atan2(dy, dx);
                set(len > 4 ? Math.cos(a) * m : 0, len > 4 ? -Math.sin(a) * m : 0);
            });
            const end = (e) => { if (e.pointerId !== id) return; id = null; joy.classList.remove('on'); set(0, 0); };
            stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
            const keys = new Set();
            const fromKeys = () => {
                const x = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
                const y = (keys.has('ArrowUp') || keys.has('w') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('s') ? 1 : 0);
                const l = Math.hypot(x, y) || 1; set(x / l, y / l);
            };
            window.addEventListener('keydown', (e) => {
                const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
                if (k === 'Escape' || k === 'p') { if (this.game.mode === 'play') this.pauseMenu(); return; }
                if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(k)) return;
                e.preventDefault(); keys.add(k); fromKeys(); $('hint').classList.remove('on');
            });
            window.addEventListener('keyup', (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (keys.delete(k)) fromKeys(); });
            window.addEventListener('blur', () => { keys.clear(); set(0, 0); });
        }
    }

    window.HH_UI = HH_UI;
})();
