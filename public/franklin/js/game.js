// Franklin by Numbers: a colouring game. Pictures are vector puzzles built from photos and drawings by
// scripts/franklin/build_puzzles.py (see that file for the data format). One canvas, drawn on demand.
//
// Three ways to play, chosen in the gallery:
//   numbers    pick a colour, tap the areas with its number.
//   free       any colour on any area; the numbers are suggestions. Custom colours, eraser, eyedropper, undo.
//   challenge  by numbers against the clock: wrong taps cost time, a best time and stars are kept per picture.
// A palette (the picture's own colours, a preset, or a random one) recolours the numbered colours in any mode.
(function () {
    'use strict';
    if (window.self !== window.top && !/[?&]standalone=1\b/.test(location.search)) document.body.classList.add('in-iframe');

    const $ = (id) => document.getElementById(id);
    const KEY = 'franklin:v1:';
    const store = {
        get(k) { try { return localStorage.getItem(KEY + k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(KEY + k, v); } catch (e) { /* storage blocked or full */ } },
        del(k) { try { localStorage.removeItem(KEY + k); } catch (e) { /* storage blocked */ } },
    };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ── sound: tiny synthesized pops, no files ─────────────────── */
    const sound = {
        on: store.get('sound') !== '0', ctx: null,
        unlock() { if (!this.on || this.ctx) return; const AC = window.AudioContext || window.webkitAudioContext; if (AC) { try { this.ctx = new AC(); } catch (e) { this.ctx = null; } } },
        tone(freq, dur, when, vol, type) {
            if (!this.on || !this.ctx) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            const t = this.ctx.currentTime + (when || 0), o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 1.35, t + dur);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
        },
        pop(i, streak) { this.tone(420 + (i % 12) * 34 + Math.min(streak || 0, 24) * 14, 0.09, 0, 0.11, 'triangle'); },
        nope() { this.tone(170, 0.12, 0, 0.07, 'sine'); },
        tick() { this.tone(900, 0.05, 0, 0.05, 'sine'); },
        colourDone() { [660, 880].forEach((f, i) => this.tone(f, 0.16, i * 0.09, 0.1)); },
        fanfare() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.28, i * 0.11, 0.12, 'triangle')); },
    };

    /* ── modes ─────────────────── */
    const MODES = {
        numbers: { name: 'By Numbers', blurb: 'Relaxed. Pick a colour and tap the areas with its number.' },
        free: { name: 'Free Paint', blurb: 'Any colour, anywhere. The numbers are only suggestions, and you can mix your own colours.' },
        challenge: { name: 'Challenge', blurb: 'By numbers against the clock. A wrong tap costs 3 seconds. Chase three stars.' },
    };
    let mode = MODES[store.get('mode')] ? store.get('mode') : 'numbers';
    const PENALTY = 3000, HINT_COST = 5000;
    const par = (m) => Math.round(m.regions * 2.2 + m.colors * 5) * 1000;          // three stars at or under this
    const starsFor = (m, ms) => (ms <= par(m) ? 3 : ms <= par(m) * 1.6 ? 2 : 1);
    const fmt = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
    const starsHTML = (n) => '★'.repeat(n) + '<i>' + '★'.repeat(3 - n) + '</i>';

    /* ── colour maths and palettes ─────────────────── */
    const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
    const hexOf = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
    const luma = (hex) => { const [r, g, b] = rgbOf(hex); return 0.299 * r + 0.587 * g + 0.114 * b; };
    const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
    function hsl(h, s, l) {
        h = ((h % 360) + 360) % 360; const a = s * Math.min(l, 1 - l);
        const f = (n) => { const k = (n + h / 30) % 12; return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255; };
        return hexOf(f(0), f(8), f(4));
    }
    function toHsl(hex) {
        const [r, g, b] = rgbOf(hex).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
        if (!d) return [0, 0, l];
        const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [h * 60, d / (1 - Math.abs(2 * l - 1)), l];
    }
    function ramp(stops, t) {
        const x = clamp(t, 0, 1) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i, a = rgbOf(stops[i]), b = rgbOf(stops[i + 1]);
        return hexOf(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
    }
    // How dark each of a picture's colours is, 0 (lightest) to 1 (darkest). Half comes from its place in the order,
    // so two colours of the same brightness still land on different palette colours.
    function tones(orig) {
        const L = orig.map(luma), lo = Math.min(...L), hi = Math.max(...L), n = orig.length, rank = [];
        orig.map((_, i) => i).sort((a, b) => L[b] - L[a]).forEach((i, k) => { rank[i] = n > 1 ? k / (n - 1) : 0; });
        return orig.map((_, i) => 0.5 * (hi > lo ? (hi - L[i]) / (hi - lo) : 0) + 0.5 * rank[i]);
    }
    const gradient = (stops) => (orig) => tones(orig).map((t) => ramp(stops, t));
    // A palette maps the picture's own colours to new ones, light to dark, so the shading still reads.
    const PALETTES = [
        { id: 'original', name: 'True colours', make: (o) => o.slice() },
        { id: 'vivid', name: 'Extra bright', make: (o) => o.map((h) => { const [hh, s, l] = toHsl(h); return hsl(hh, s > 0.05 ? clamp(s * 1.6 + 0.1, 0, 1) : s, clamp(0.5 + (l - 0.5) * 1.1, 0.06, 0.95)); }) },
        { id: 'sunset', name: 'Sunset', make: gradient(['#fff3c4', '#ffc15e', '#f7733c', '#d43d6b', '#7b2a80', '#2d1b4e']) },
        { id: 'ocean', name: 'Ocean', make: gradient(['#f1fbf7', '#a8e6e0', '#4fb7c9', '#2c7fb8', '#224a94', '#131f4d']) },
        { id: 'forest', name: 'Forest', make: gradient(['#f6f7d4', '#cfe08a', '#86b85a', '#3f8a4e', '#1f5a45', '#10302b']) },
        { id: 'candy', name: 'Candy', make: gradient(['#fff0f6', '#ffc2dc', '#ff8fc0', '#c77dff', '#7b5cd6', '#3b2a7a']) },
        { id: 'popart', name: 'Pop Art', make: (o) => { const t = tones(o), out = []; o.map((_, i) => i).sort((a, b) => t[a] - t[b]).forEach((i, k) => { out[i] = hsl(k * 137.5 + 48, 0.86, 0.84 - 0.5 * t[i]); }); return out; } },
        { id: 'neon', name: 'Neon night', make: gradient(['#fbffb0', '#8dffb5', '#37e3ff', '#6f8cff', '#b657ff', '#f03cae', '#6b1a6e', '#170b30']) },
        { id: 'vintage', name: 'Vintage', make: gradient(['#fbf0d9', '#e3c79a', '#b98a5a', '#86573a', '#523223', '#2a1a14']) },
        { id: 'pencil', name: 'Pencil', make: gradient(['#fafafa', '#d6d6d6', '#a3a3a3', '#6e6e6e', '#444444', '#1f1f1f']) },
    ];
    function surprise(orig) {
        const h = Math.random() * 360, d = (40 + Math.random() * 80) * (Math.random() < 0.5 ? 1 : -1);
        return gradient([hsl(h, 0.55, 0.94), hsl(h + d * 0.4, 0.75, 0.78), hsl(h + d, 0.8, 0.6), hsl(h + d * 1.8, 0.7, 0.42), hsl(h + d * 2.4, 0.6, 0.24), hsl(h + d * 2.8, 0.5, 0.1)])(orig);
    }
    function coloursFor(pal, orig) {
        if (pal && Array.isArray(pal.colors) && pal.colors.length === orig.length && pal.colors.every(isHex)) return pal.colors.slice();
        return (PALETTES.find((q) => q.id === (pal && pal.id)) || PALETTES[0]).make(orig);
    }

    /* ── a puzzle: regions as Path2D, built from shared boundary chains ─────────────────── */
    function buildPuzzle(data) {
        const chains = data.chains.map((c) => {
            const pts = [[c[1], c[2]]];
            for (let i = 3; i < c.length; i += 2) { const p = pts[pts.length - 1]; pts.push([p[0] + c[i], p[1] + c[i + 1]]); }
            return { kind: c[0] & 3, strong: !!(c[0] & 4), pts, regs: [], path: null };   // strong: an element's outline
        });
        // Append one chain to a path. Smooth chains curve through the midpoints of their segments, which gives the
        // same curve in either direction, so the two regions sharing a chain meet exactly.
        function add(path, ch, rev, first) {
            const pts = rev ? ch.pts.slice().reverse() : ch.pts, n = pts.length - 1;
            if (ch.kind === 2) {                       // a closed loop on its own
                const q = pts.slice(0, n), m = q.length;
                const mid = (i) => [(q[i % m][0] + q[(i + 1) % m][0]) / 2, (q[i % m][1] + q[(i + 1) % m][1]) / 2];
                const s = mid(0); path.moveTo(s[0], s[1]);
                for (let i = 1; i <= m; i++) { const e = mid(i); path.quadraticCurveTo(q[i % m][0], q[i % m][1], e[0], e[1]); }
                return;
            }
            if (first) path.moveTo(pts[0][0], pts[0][1]); else path.lineTo(pts[0][0], pts[0][1]);
            if (ch.kind === 1 || n < 2) { for (let i = 1; i <= n; i++) path.lineTo(pts[i][0], pts[i][1]); return; }
            path.lineTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
            for (let i = 1; i < n; i++) path.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
            path.lineTo(pts[n][0], pts[n][1]);
        }
        const regions = data.regions.map((r, id) => {
            const path = new Path2D(), regs = [];
            let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            for (const loop of r[4]) {
                loop.forEach((ref, i) => {
                    const ch = chains[Math.abs(ref) - 1];
                    regs.push(ch);
                    add(path, ch, ref < 0, i === 0);
                    for (const p of ch.pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
                });
                path.closePath();
            }
            // c: the suggested colour (its number is c + 1). paint: null, a palette slot, or a '#rrggbb' of the player's own.
            const region = { id, c: r[0], x: r[1] / 10, y: r[2] / 10, r: r[3] / 10, path, x0, y0, x1, y1, paint: null, filled: false, anim: null };
            for (const ch of regs) ch.regs.push(region);
            return region;
        });
        // Each boundary line is drawn once, from its chain: heavier for an element's outline, lighter for shading.
        for (const ch of chains) { ch.path = new Path2D(); add(ch.path, ch, false, true); if (ch.kind === 2) ch.path.closePath(); }
        const perColour = data.palette.map(() => ({ total: 0, done: 0 }));
        for (const r of regions) perColour[r.c].total++;
        return { id: data.id, v: data.v, title: data.title, w: data.w, h: data.h, palette: data.palette, colors: data.palette.slice(), pal: { id: 'original' }, regions, chains, perColour, filledCount: 0, art: data.art || null, artImg: null, ref: data.ref || null };
    }
    const textOn = (hex) => { const n = parseInt(hex.slice(1), 16), l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); return l > 150 ? '#2b1d0e' : '#ffffff'; };

    // perColour[c].done counts the painted areas whose suggestion is c, whatever they were painted with.
    function setPaint(p, r, v) {
        const was = r.paint !== null, now = v !== null;
        r.paint = v; r.filled = now;
        if (was !== now) { p.filledCount += now ? 1 : -1; p.perColour[r.c].done += now ? 1 : -1; }
    }
    const colourOf = (p, v) => (typeof v === 'string' ? v : p.colors[v]);

    // Saved progress, per picture and mode. By Numbers: which areas are filled, as bits packed into base64 (key
    // <id>). Free Paint: what each area is painted with (key <id>:free). Challenge keeps only a best run (<id>:best).
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    function packFilled(p) { let s = ''; for (let i = 0; i < p.regions.length; i += 6) { let v = 0; for (let b = 0; b < 6; b++) if (p.regions[i + b] && p.regions[i + b].filled) v |= 1 << b; s += B64[v]; } return s; }
    function unpackFilled(p, s) {
        for (let i = 0; i < p.regions.length; i++) { const v = B64.indexOf(s[(i / 6) | 0] || 'A'); if (v > 0 && (v >> (i % 6)) & 1) setPaint(p, p.regions[i], p.regions[i].c); }
    }
    const saveKey = (id, m) => (m === 'free' ? id + ':free' : id);
    function readJSON(key, v) { try { const s = JSON.parse(store.get(key) || 'null'); return s && s.v === v ? s : null; } catch (e) { return null; } }
    const readSave = (meta, m) => ((m || mode) === 'challenge' ? null : readJSON(saveKey(meta.id, m || mode), meta.v));
    const readBest = (meta) => readJSON(meta.id + ':best', meta.v);
    function readCustom() { try { const a = JSON.parse(store.get('custom') || '[]'); return Array.isArray(a) ? a.filter(isHex).slice(0, 8) : []; } catch (e) { return []; } }

    /* ── drawing ─────────────────── */
    // Draw the picture into ctx, which already maps picture pixels to the target. px = picture pixels per target pixel⁻¹
    // (the scale), used to keep line widths constant on screen.
    function paint(ctx, p, scale, opts) {
        const { sel = -1, now = 0, clip = null, lines = true } = opts || {};
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, p.w, p.h);
        const vis = (r) => !clip || (r.x1 >= clip.x0 && r.x0 <= clip.x1 && r.y1 >= clip.y0 && r.y0 <= clip.y1);
        let animating = false;
        ctx.lineJoin = 'round';
        for (const r of p.regions) {
            if (!r.filled || !vis(r)) continue;
            const col = colourOf(p, r.paint);
            if (r.anim) {
                const t = Math.max(0, (now - r.anim.t0) / 380);
                if (t >= 1) r.anim = null;
                else {
                    animating = true;
                    const far = Math.max(Math.hypot(r.x0 - r.anim.x, r.y0 - r.anim.y), Math.hypot(r.x1 - r.anim.x, r.y0 - r.anim.y), Math.hypot(r.x0 - r.anim.x, r.y1 - r.anim.y), Math.hypot(r.x1 - r.anim.x, r.y1 - r.anim.y));
                    ctx.save(); ctx.clip(r.path, 'evenodd');
                    if (r.anim.from) { ctx.fillStyle = r.anim.from; ctx.fill(r.path, 'evenodd'); }
                    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(r.anim.x, r.anim.y, far * (1 - Math.pow(1 - t, 3)) + 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
                    continue;
                }
            }
            ctx.fillStyle = col; ctx.fill(r.path, 'evenodd');
            ctx.strokeStyle = col; ctx.lineWidth = 1.3 / scale; ctx.stroke(r.path);       // seals the hairline between neighbours
        }
        if (lines) {
            ctx.fillStyle = '#d9dee6';
            for (const r of p.regions) if (!r.filled && r.c === sel && vis(r)) ctx.fill(r.path, 'evenodd');
        }
        if (p.artImg) {
            // A picture made from a line drawing: the drawing sits on top of the paint, always.
            ctx.drawImage(p.artImg, 0, 0, p.w, p.h);
        } else {
            // Otherwise the lines come from the boundary chains: heavier for an element's outline, lighter for
            // shading. A shading line stays until the areas on both sides are painted; outlines stay for good.
            const open = (ch) => ch.regs.some((r) => !r.filled || r.anim);
            ctx.lineCap = 'round';
            if (lines) {
                ctx.strokeStyle = '#a89e8c'; ctx.lineWidth = 1 / scale;
                for (const ch of p.chains) if (!ch.strong && open(ch)) ctx.stroke(ch.path);
            }
            ctx.strokeStyle = '#4a3a28'; ctx.lineWidth = (lines ? 2.2 : 1.6) / scale;
            for (const ch of p.chains) if (ch.strong) ctx.stroke(ch.path);
        }
        return animating;
    }

    /* ── gallery ─────────────────── */
    let index = [];
    const cache = new Map();
    function loadPuzzle(id) {
        if (!cache.has(id)) cache.set(id, fetch('data/' + id + '.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }));
        return cache.get(id);
    }
    // Whether a picture counts as finished in the current mode (for "next picture").
    function finished(m) {
        if (mode === 'challenge') return !!readBest(m);
        const s = readSave(m); return !!(s && s.n >= m.regions);
    }
    function setMode(m) {
        if (!MODES[m]) return; mode = m; store.set('mode', m);
        if ($('play').hidden) showGallery();
    }
    function showGallery() {
        $('play').hidden = true; $('gallery').hidden = false; document.title = 'Franklin by Numbers';
        $('mode-seg').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
        $('mode-blurb').textContent = MODES[mode].blurb;
        const cards = $('cards'); cards.innerHTML = '';
        for (const m of index) {
            const b = document.createElement('button'); b.type = 'button'; b.dataset.id = m.id;
            let thumb = 'data/' + m.id + '-thumb.webp', badge = '', metaHTML, label = m.title, done = false;
            if (mode === 'challenge') {
                const best = readBest(m);
                metaHTML = best ? '<span class="card-stars">' + starsHTML(best.stars) + '</span><span>Best ' + fmt(best.t) + '</span>' : '<span>3 stars under ' + fmt(par(m)) + '</span>';
                label += best ? ', best ' + fmt(best.t) + ', ' + best.stars + ' of 3 stars' : ', no time yet';
            } else {
                const save = readSave(m), n = save ? (save.n || 0) : 0, pct = Math.round(n / m.regions * 100);
                done = n >= m.regions;
                thumb = (n && store.get(saveKey(m.id, mode) + ':thumb')) || thumb;
                if (done) badge = '<span class="card-badge"><svg><use href="#i-check"/></svg>' + (mode === 'free' ? 'Painted' : 'Done') + '</span>';
                metaHTML = '<span class="card-bar"><i style="width:' + pct + '%"></i></span><span>' + (done ? '100%' : n ? pct + '%' : m.regions + ' areas') + '</span>';
                label += done ? ', finished' : n ? ', ' + pct + '% coloured' : ', ' + m.regions + ' areas, ' + m.colors + ' colours';
            }
            b.className = 'card' + (done ? ' done' : '');
            b.innerHTML = '<span class="card-pic"><img alt="" src="' + thumb + '">' + badge + '</span>'
                + '<span><span class="card-name"></span><br><span class="card-blurb"></span></span><span class="card-meta">' + metaHTML + '</span>';
            b.querySelector('.card-name').textContent = m.title; b.querySelector('.card-blurb').textContent = m.blurb;
            b.setAttribute('aria-label', label);
            b.addEventListener('click', () => { sound.unlock(); openPuzzle(m.id); });
            cards.appendChild(b);
        }
    }
    $('mode-seg').addEventListener('click', (e) => { const b = e.target.closest('button[data-mode]'); if (b) { sound.unlock(); setMode(b.dataset.mode); } });

    /* ── play ─────────────────── */
    const cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage');
    const hit = document.createElement('canvas').getContext('2d');
    let P = null, meta = null, view = { s: 1, x: 0, y: 0 }, fit = 1, W = 0, H = 0, dpr = 1;
    let dirty = false, camAnim = null, pulse = null, photo = null, photoAlpha = 0, photoTarget = 0, saveTimer = 0;
    // The brush: a palette slot (sel ≥ 0) or, in Free Paint, one of the player's own colours (selHex).
    let sel = 0, selHex = null, tool = 'paint', custom = readCustom(), undo = [], redo = [], celebrated = false;
    // A Challenge run. acc + (now − since) + penalty is the time; since is null while the clock is stopped.
    let run = null, ticker = 0;
    const elapsed = () => (run ? run.acc + (run.since ? performance.now() - run.since : 0) + run.penalty : 0);
    const isDone = () => !!P && P.filledCount >= P.regions.length;

    function openPuzzle(id) {
        meta = index.find((m) => m.id === id); if (!meta) return;
        $('cards').querySelectorAll('.card').forEach((c) => { c.disabled = true; });
        loadPuzzle(id).then((data) => {
            P = buildPuzzle(data);
            if (P.art) { const p = P, im = new Image(); im.onload = () => { p.artImg = im; if (P === p) draw(); }; im.src = 'data/' + P.art; }
            const save = readSave(meta);
            if (save) {
                if (mode === 'numbers' && save.f) unpackFilled(P, save.f);
                if (mode === 'free' && Array.isArray(save.p)) P.regions.forEach((r, i) => { const v = save.p[i]; if (isHex(v) || (Number.isInteger(v) && v >= 0 && v < P.palette.length)) setPaint(P, r, v); });
                if (save.pal) { P.pal = save.pal; P.colors = coloursFor(save.pal, P.palette); }
            }
            sel = save && Number.isInteger(save.sel) && P.perColour[save.sel] ? save.sel : 0;
            selHex = mode === 'free' && save && isHex(save.hex) ? save.hex : null; if (selHex) sel = -1;
            tool = 'paint'; undo = []; redo = []; celebrated = isDone();
            photo = null; photoAlpha = 0; photoTarget = 0; pulse = null; camAnim = null;
            clearInterval(ticker); run = mode === 'challenge' ? { acc: 0, since: null, penalty: 0, mistakes: 0, streak: 0, best: 0, done: false } : null;
            $('gallery').hidden = true; $('play').hidden = false; $('play').dataset.mode = mode; $('confirm').hidden = true; closePals(); hideBubble();
            $('p-title').textContent = P.title; document.title = P.title + ' | Franklin by Numbers';
            $('btn-photo').setAttribute('aria-pressed', 'false'); $('btn-photo').textContent = 'See the real Franklin'; $('btn-photo').hidden = !P.ref;   // only pictures made from a photo have one
            $('tools').hidden = mode !== 'free'; $('p-time').hidden = mode !== 'challenge'; $('p-streak').hidden = true; $('btn-again').hidden = mode !== 'challenge';
            buildPalette(); resize(); fitView(); refreshProgress(false); refreshTools(); paintRun();
            if (mode !== 'free' && sel >= 0 && P.perColour[sel].done >= P.perColour[sel].total) nextColour();
            if (selHex) selectHex(selHex, false); else selectColour(sel, false);
            if (mode === 'challenge') toast('The clock starts with your first colour');
        }).catch((e) => { console.error(e); showGallery(); const c = $('cards'); const p = document.createElement('p'); p.className = 'loading err'; p.textContent = 'That picture would not load. Check your connection and try again.'; c.prepend(p); });
    }

    /* palette bar */
    function swatch(cls, hex, inner) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'sw ' + cls;
        b.style.setProperty('--c', hex); b.style.setProperty('--t', textOn(hex));
        b.innerHTML = '<svg class="ring" viewBox="0 0 54 54"><circle class="bg" cx="27" cy="27" r="25"/><circle class="fg" cx="27" cy="27" r="25" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg><span class="dot"></span>' + inner;
        return b;
    }
    function buildPalette() {
        const el = $('palette'), left = el.scrollLeft; el.innerHTML = '';
        P.colors.forEach((hex, i) => {
            const b = swatch('slot', hex, '<span class="num">' + (i + 1) + '</span><svg class="tick"><use href="#i-check"/></svg><span class="left"></span>'); b.dataset.c = i;
            b.addEventListener('click', () => { sound.unlock(); selectColour(i, true); });
            el.appendChild(b);
        });
        if (mode === 'free') {
            const gap = document.createElement('span'); gap.className = 'sw-gap'; el.appendChild(gap);
            for (const hex of custom) {
                const b = swatch('custom', hex, ''); b.dataset.hex = hex; b.setAttribute('aria-label', 'Your colour ' + hex);
                b.addEventListener('click', () => { sound.unlock(); selectHex(hex, true); });
                el.appendChild(b);
            }
            const add = document.createElement('label'); add.className = 'sw add'; add.title = 'Mix your own colour';
            add.innerHTML = '<span class="dot"></span><svg><use href="#i-plus"/></svg><input type="color" id="pick-colour" aria-label="Mix your own colour" value="' + (selHex || '#2f6fe4') + '">';
            add.querySelector('input').addEventListener('change', (e) => addCustom(e.target.value));
            el.appendChild(add);
        }
        el.scrollLeft = left; refreshPalette();
    }
    function refreshPalette() {
        $('palette').querySelectorAll('.sw.slot').forEach((b) => {
            const i = +b.dataset.c, pc = P.perColour[i], left = pc.total - pc.done;
            b.classList.toggle('on', i === sel); b.classList.toggle('complete', left === 0);
            b.querySelector('.left').textContent = left;
            b.querySelector('.fg').style.strokeDashoffset = String(100 - (pc.total ? pc.done / pc.total * 100 : 100));
            b.setAttribute('aria-label', 'Colour ' + (i + 1) + (left ? ', ' + left + (mode === 'free' ? ' suggested areas still blank' : ' left') : mode === 'free' ? '' : ', finished'));
            b.setAttribute('aria-pressed', String(i === sel));
        });
        $('palette').querySelectorAll('.sw.custom').forEach((b) => { const on = b.dataset.hex === selHex; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    }
    function scrollToSwatch(b, smooth) {
        if (!b) return;
        if (smooth && b.scrollIntoView) b.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
        else $('palette').scrollLeft = Math.max(0, b.offsetLeft - $('palette').clientWidth / 2 + 27);
    }
    function selectColour(i, scroll) {
        sel = i; selHex = null; setTool('paint'); refreshPalette(); hideBubble(); pulse = null; draw();
        scrollToSwatch($('palette').querySelector('.sw.slot[data-c="' + i + '"]'), scroll !== false);
        queueSave();
    }
    function selectHex(hex, scroll) {
        sel = -1; selHex = hex; setTool('paint'); refreshPalette(); hideBubble(); pulse = null; draw();
        scrollToSwatch($('palette').querySelector('.sw.custom[data-hex="' + hex + '"]'), scroll !== false);
        queueSave();
    }
    function addCustom(hex) {
        if (!isHex(hex)) return; hex = hex.toLowerCase();
        custom = [hex].concat(custom.filter((h) => h !== hex)).slice(0, 8); store.set('custom', JSON.stringify(custom));
        buildPalette(); selectHex(hex, true);
    }
    function nextColour() {
        for (let k = 1; k <= P.palette.length; k++) { const i = (sel + k) % P.palette.length; if (P.perColour[i].done < P.perColour[i].total) { sel = i; return true; } }
        return false;
    }

    /* palettes */
    function setPalette(pal) {
        if (!P) return; P.pal = pal; P.colors = coloursFor(pal, P.palette);
        if (!pal.colors && pal.id === 'surprise') pal.colors = P.colors.slice();
        buildPalette(); paintPals(); queueSave(); draw();
    }
    function paintPals() {
        const list = $('pals-list'); list.innerHTML = '';
        const items = PALETTES.map((q) => ({ id: q.id, name: q.name, colors: q.make(P.palette) }));
        if (P.pal.id === 'surprise') items.unshift({ id: 'surprise', name: 'Surprise', colors: P.colors });
        for (const it of items) {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'pal'; b.dataset.pal = it.id; b.setAttribute('aria-pressed', String(it.id === P.pal.id));
            b.innerHTML = '<span></span><span class="pal-strip">' + it.colors.map((c) => '<i style="background:' + c + '"></i>').join('') + '</span>';
            b.firstChild.textContent = it.name;
            b.addEventListener('click', () => { sound.unlock(); sound.tick(); if (it.id !== 'surprise') setPalette({ id: it.id }); });
            list.appendChild(b);
        }
    }
    function openPals() { if (!P) return; paintPals(); $('pals').hidden = false; $('btn-pal').setAttribute('aria-expanded', 'true'); hideBubble(); }
    function closePals() { $('pals').hidden = true; $('btn-pal').setAttribute('aria-expanded', 'false'); }

    /* progress and the finished state */
    function refreshProgress(celebrate) {
        const pct = P.filledCount / P.regions.length, done = isDone();
        $('p-pct').textContent = Math.floor(pct * 100) + '%'; $('prog-fill').style.width = (pct * 100) + '%';
        $('palette').hidden = done && mode !== 'free'; $('done').hidden = !done;
        $('btn-hint').disabled = done; $('btn-hint').style.opacity = done ? 0.4 : 1;
        if (!done) { celebrated = false; return; }
        const i = index.findIndex((m) => m.id === meta.id), rest = index.filter((m) => m.id !== meta.id && !finished(m));
        if (mode === 'challenge' && run && run.done) {
            $('done-title').innerHTML = '<span></span> <span class="stars">' + starsHTML(run.stars) + '</span>'; $('done-title').firstChild.textContent = P.title + ' in ' + fmt(run.time);
            $('done-sub').textContent = (run.mistakes ? run.mistakes + (run.mistakes === 1 ? ' slip' : ' slips') : 'No slips') + ', best streak ' + run.best + '. '
                + (run.newBest ? 'A new best!' : 'Your best is ' + fmt(run.bestTime) + '.') + (run.stars < 3 ? ' Three stars under ' + fmt(par(meta)) + '.' : '');
        } else if (mode === 'free') {
            $('done-title').textContent = 'A Franklin original!';
            $('done-sub').textContent = 'Keep painting, try a palette, or save it.';
        } else {
            $('done-title').textContent = P.title + ': finished!';
            $('done-sub').textContent = rest.length ? 'Franklin approves. ' + rest.length + ' more to colour.' : 'Every picture coloured. Franklin is very proud.';
        }
        $('btn-next').textContent = rest.length ? 'Next picture' : 'All pictures'; $('btn-next').dataset.id = rest.length ? (rest.find((m) => index.indexOf(m) > i) || rest[0]).id : '';
        if (celebrate && !celebrated) { celebrated = true; sound.fanfare(); confetti(); fitView(true); }
    }

    /* challenge clock */
    function paintRun() {
        if (!run) return;
        $('p-time').textContent = fmt(run.done ? run.time : elapsed());
        $('p-streak').hidden = run.streak < 3 || run.done; $('p-streak').textContent = '×' + run.streak;
    }
    function flashTime() { const c = $('p-time'); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); paintRun(); }
    function startRun() { run.since = performance.now(); clearInterval(ticker); ticker = setInterval(paintRun, 250); }
    function finishRun() {
        run.time = elapsed(); run.since = null; run.done = true; clearInterval(ticker);
        run.stars = starsFor(meta, run.time);
        const best = readBest(meta); run.newBest = !best || run.time < best.t; run.bestTime = run.newBest ? run.time : best.t;
        if (run.newBest) store.set(meta.id + ':best', JSON.stringify({ v: meta.v, t: Math.round(run.time), stars: run.stars, m: run.mistakes }));
        paintRun();
    }
    function wrongTap(r, p) {
        sound.nope();
        if (run && run.since) { run.mistakes++; run.streak = 0; run.penalty += PENALTY; flashTime(); bubble(p.x, p.y, '+3 s. That one is <i style="background:' + P.colors[r.c] + '"></i>' + (r.c + 1)); }
        else bubble(p.x, p.y, 'That one is <i style="background:' + P.colors[r.c] + '"></i>' + (r.c + 1));
    }

    /* view */
    function resize() {
        const r = stage.getBoundingClientRect(); if (!r.width || !r.height) return;
        dpr = Math.min(window.devicePixelRatio || 1, 2.5); W = r.width; H = r.height;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        if (P) { const was = fit; fit = Math.min((W - 24) / P.w, (H - 24) / P.h); if (was && Math.abs(view.s - was) < 1e-6) fitView(); else clampView(); }
        draw();
    }
    function maxScale() { return Math.max(fit * 2.5, 5); }
    function clampView() {
        view.s = clamp(view.s, fit * 0.85, maxScale());
        const pw = P.w * view.s, ph = P.h * view.s, mx = Math.min(W * 0.5, pw * 0.5), my = Math.min(H * 0.5, ph * 0.5);
        view.x = clamp(view.x, mx - pw, W - mx); view.y = clamp(view.y, my - ph, H - my);
    }
    function fitView(animate) {
        const t = { s: fit, x: (W - P.w * fit) / 2, y: (H - P.h * fit) / 2 };
        if (animate && !reduceMotion) flyTo(t); else { view = t; camAnim = null; draw(); }
    }
    function flyTo(t) { camAnim = { from: Object.assign({}, view), to: t, t0: performance.now(), dur: 420 }; draw(); }
    function zoomAt(cx, cy, factor) {
        const s = clamp(view.s * factor, fit * 0.85, maxScale()), k = s / view.s;
        view.x = cx - (cx - view.x) * k; view.y = cy - (cy - view.y) * k; view.s = s; clampView(); camAnim = null; hideBubble(); draw();
    }
    const toPic = (sx, sy) => ({ x: (sx - view.x) / view.s, y: (sy - view.y) / view.s });
    const toScreen = (x, y) => ({ x: x * view.s + view.x, y: y * view.s + view.y });
    function regionAt(x, y) {
        for (const r of P.regions) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1 && hit.isPointInPath(r.path, x, y, 'evenodd')) return r;
        return null;
    }
    // A forgiving tap: when the tap itself is not on an area the test accepts, try a ring of points a finger-width
    // around it. Small areas are hard to hit exactly, and a near miss on one should still count.
    const REACH = [[9, 0], [-9, 0], [0, 9], [0, -9], [6.5, 6.5], [-6.5, 6.5], [6.5, -6.5], [-6.5, -6.5], [16, 0], [-16, 0], [0, 16], [0, -16], [11.5, 11.5], [-11.5, 11.5], [11.5, -11.5], [-11.5, -11.5]];
    function regionNear(sx, sy, accept) {
        const q = toPic(sx, sy), r = regionAt(q.x, q.y);
        if (r && accept(r)) return r;
        for (const [dx, dy] of REACH) { const a = toPic(sx + dx, sy + dy), n = regionAt(a.x, a.y); if (n && n.r * view.s < 22 && accept(n)) return n; }
        return r;
    }

    function draw() { if (!dirty) { dirty = true; requestAnimationFrame(frame); } }
    function frame(now) {
        dirty = false; if (!P || $('play').hidden) return;
        let again = false;
        if (camAnim) {
            const t = clamp((now - camAnim.t0) / camAnim.dur, 0, 1), e = 1 - Math.pow(1 - t, 3), a = camAnim.from, b = camAnim.to;
            view = { s: a.s + (b.s - a.s) * e, x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
            if (t >= 1) camAnim = null; else again = true;
        }
        if (photoAlpha !== photoTarget) { photoAlpha = clamp(photoAlpha + (photoTarget > photoAlpha ? 0.06 : -0.06), 0, 1); if (Math.abs(photoAlpha - photoTarget) < 0.03) photoAlpha = photoTarget; again = true; }
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.x, dpr * view.y);
        ctx.shadowColor = 'rgba(74,46,14,0.22)'; ctx.shadowBlur = 18 * dpr; ctx.shadowOffsetY = 5 * dpr; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, P.w, P.h);
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, P.w, P.h); ctx.clip();
        const a = toPic(0, 0), b = toPic(W, H), done = isDone();
        if (paint(ctx, P, view.s, { sel, now, clip: { x0: a.x, y0: a.y, x1: b.x, y1: b.y }, lines: !done })) again = true;
        if (photo && photoAlpha > 0) { ctx.globalAlpha = photoAlpha; ctx.drawImage(photo, 0, 0, P.w, P.h); ctx.globalAlpha = 1; }
        ctx.restore();
        // Numbers, in screen space so they stay crisp. A number shows once its area has room for it.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (!done) for (const r of P.regions) {
            if (r.filled) continue;
            const room = r.r * view.s; if (room < 5.5) continue;
            const sx = r.x * view.s + view.x, sy = r.y * view.s + view.y; if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
            const size = clamp(room * 1.05, 9, 26), on = r.c === sel;
            ctx.font = (on ? '800 ' : '700 ') + size + 'px ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, sans-serif';
            ctx.fillStyle = on ? '#2b1d0e' : '#a79a86'; ctx.fillText(String(r.c + 1), sx, sy + size * 0.04);
        }
        if (pulse) {
            const t = (now - pulse.t0) / 1700;
            if (t >= 1) pulse = null;
            else if (t < 0) again = true;      // still flying there
            else {
                again = true; const r = pulse.r, sx = r.x * view.s + view.x, sy = r.y * view.s + view.y, k = (t * 3) % 1;
                ctx.strokeStyle = 'rgba(217,130,43,' + (1 - k) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(sx, sy, Math.max(14, r.r * view.s) + k * 26, 0, Math.PI * 2); ctx.stroke();
            }
        }
        if (again) draw();
    }

    /* painting */
    function buzz() { if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* not allowed */ } } }
    function animate(r, at, from) { r.anim = reduceMotion ? null : { t0: performance.now(), x: at.x, y: at.y, from: from || null }; }
    // By Numbers and Challenge: fill an area with its own number's colour, if that colour is the one selected.
    function tryFill(r, at) {
        if (!r || r.filled || r.c !== sel) return false;
        if (run) { if (!run.since) startRun(); run.streak++; run.best = Math.max(run.best, run.streak); }
        setPaint(P, r, r.c); animate(r, at);
        sound.pop(r.c, run ? run.streak : 0); buzz();
        const pc = P.perColour[r.c], all = isDone();
        if (run && run.streak % 5 === 0) { const s = toScreen(at.x, at.y); bubble(s.x, s.y, 'Streak ×' + run.streak); }
        if (all && run) finishRun();
        if (pc.done >= pc.total && !all) { sound.colourDone(); if (nextColour()) selectColour(sel, true); }
        refreshPalette(); refreshProgress(all); paintRun(); queueSave(); draw();
        return true;
    }
    // Free Paint: record a change so it can be undone. changes: [[region id, before, after], ...]
    function commit(changes) { if (!changes.length) return; undo.push(changes); if (undo.length > 200) undo.shift(); redo = []; afterEdit(true); }
    function afterEdit(celebrate) { refreshPalette(); refreshProgress(celebrate); refreshTools(); queueSave(); draw(); }
    function step(from, to, dir) {
        const ch = from.pop(); if (!ch) return; to.push(ch);
        for (const [id, before, after] of ch) setPaint(P, P.regions[id], dir < 0 ? before : after);
        sound.tick(); afterEdit(false);
    }
    function freeTap(r, at, p) {
        if (!r) return;
        if (tool === 'pick') {
            if (r.paint === null) selectColour(r.c, true); else if (typeof r.paint === 'string') { if (!custom.includes(r.paint)) addCustom(r.paint); else selectHex(r.paint, true); } else selectColour(r.paint, true);
            sound.tick(); bubble(p.x, p.y, 'Picked <i style="background:' + (selHex || P.colors[sel]) + '"></i>'); return;
        }
        const v = tool === 'erase' ? null : selHex || sel;
        if (v === -1 || r.paint === v) return;
        const before = r.paint, from = before === null ? null : colourOf(P, before);
        setPaint(P, r, v);
        if (v === null) sound.tick(); else { animate(r, at, from); sound.pop(typeof v === 'number' ? v : 5); }
        buzz(); commit([[r.id, before, v]]);
    }
    function fillRest() {
        const ch = []; for (const r of P.regions) if (r.paint === null) { ch.push([r.id, null, r.c]); setPaint(P, r, r.c); }
        if (ch.length) { sound.colourDone(); commit(ch); }
    }
    function setTool(t) {
        tool = mode === 'free' ? t : 'paint';
        cv.classList.toggle('erasing', tool === 'erase'); cv.classList.toggle('picking', tool === 'pick'); refreshTools();
    }
    function refreshTools() {
        if (!P || mode !== 'free') return;
        $('t-undo').disabled = !undo.length; $('t-redo').disabled = !redo.length; $('t-fill').disabled = isDone();
        $('t-erase').setAttribute('aria-pressed', String(tool === 'erase')); $('t-pick').setAttribute('aria-pressed', String(tool === 'pick'));
    }

    /* input */
    const pointers = new Map();
    let gesture = null;   // { mode: 'paint' | 'pan' | 'pinch', ... }
    function local(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    const wanted = (r) => !r.filled && r.c === sel;
    cv.addEventListener('pointerdown', (e) => {
        if (!P) return; sound.unlock(); cv.setPointerCapture(e.pointerId); const p = local(e); pointers.set(e.pointerId, p); hideBubble(); camAnim = null;
        if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            gesture = { mode: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
            cv.classList.remove('painting'); return;
        }
        if (pointers.size > 2) return;
        const q = toPic(p.x, p.y);
        // By Numbers and Challenge paint on press, so a drag keeps painting. Free Paint paints on release, so a
        // drag can pan (there every area accepts paint, and a press that painted would leave no way to move).
        if (mode !== 'free' && e.button === 0 && tryFill(regionNear(p.x, p.y, wanted), q)) { gesture = { mode: 'paint' }; cv.classList.add('painting'); }
        else gesture = { mode: 'pan', sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: 0, at: q, button: e.button };
    });
    cv.addEventListener('pointermove', (e) => {
        if (!pointers.has(e.pointerId) || !gesture) return; const p = local(e); pointers.set(e.pointerId, p);
        if (gesture.mode === 'pinch' && pointers.size >= 2) {
            const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
            view.x += cx - gesture.cx; view.y += cy - gesture.cy; gesture.cx = cx; gesture.cy = cy;
            zoomAt(cx, cy, d / gesture.d); gesture.d = d;
        } else if (gesture.mode === 'paint') { const q = toPic(p.x, p.y); tryFill(regionAt(q.x, q.y), q); }
        else if (gesture.mode === 'pan') {
            gesture.moved = Math.max(gesture.moved, Math.hypot(p.x - gesture.sx, p.y - gesture.sy));
            if (gesture.moved > 7) { view.x += p.x - gesture.lx; view.y += p.y - gesture.ly; clampView(); draw(); }
            gesture.lx = p.x; gesture.ly = p.y;
        }
    });
    function pointerEnd(e) {
        if (!pointers.has(e.pointerId)) return; const p = pointers.get(e.pointerId); pointers.delete(e.pointerId);
        if (gesture && gesture.mode === 'pan' && gesture.moved <= 7 && e.type === 'pointerup' && gesture.button === 0) {
            if (mode === 'free') {
                const v = tool === 'erase' ? null : selHex || sel;
                freeTap(regionNear(gesture.sx, gesture.sy, (r) => (tool === 'pick' ? true : tool === 'erase' ? r.filled : r.paint !== v)), gesture.at, p);
            } else { const r = regionAt(gesture.at.x, gesture.at.y); if (r && !r.filled && r.c !== sel) wrongTap(r, p); }
        }
        if (pointers.size === 1 && gesture && gesture.mode === 'pinch') { const q = [...pointers.values()][0]; gesture = { mode: 'pan', sx: q.x, sy: q.y, lx: q.x, ly: q.y, moved: 99, at: null, button: 0 }; }
        else if (pointers.size === 0) { gesture = null; cv.classList.remove('painting'); }
    }
    cv.addEventListener('pointerup', pointerEnd); cv.addEventListener('pointercancel', pointerEnd);
    cv.addEventListener('wheel', (e) => { if (!P) return; e.preventDefault(); const p = local(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0018))); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    let bubbleTimer = 0;
    function bubble(x, y, html) {
        const b = $('bubble'); b.innerHTML = html;
        b.style.left = clamp(x, 80, Math.max(80, W - 80)) + 'px'; b.style.top = Math.max(44, y - 12) + 'px'; b.hidden = false;
        clearTimeout(bubbleTimer); bubbleTimer = setTimeout(hideBubble, 1600);
    }
    function toast(text) { const b = $('bubble'); b.textContent = text; b.style.left = W / 2 + 'px'; b.style.top = '56px'; b.hidden = false; clearTimeout(bubbleTimer); bubbleTimer = setTimeout(hideBubble, 2600); }
    function hideBubble() { $('bubble').hidden = true; }

    // Hint: fly to the nearest blank area of the selected colour (any blank area when there is none) and ring it.
    function hint() {
        if (!P || isDone()) return;
        if (mode !== 'free' && P.perColour[sel].done >= P.perColour[sel].total && nextColour()) selectColour(sel, true);
        const c = toPic(W / 2, H / 2); let best = null, bd = 1e18;
        for (const own of [true, false]) {
            for (const r of P.regions) if (!r.filled && (!own || r.c === sel)) { const d = (r.x - c.x) ** 2 + (r.y - c.y) ** 2 - r.r * r.r * 4; if (d < bd) { bd = d; best = r; } }
            if (best) break;
        }
        if (!best) return;
        if (run && run.since) { run.penalty += HINT_COST; flashTime(); }
        const s = clamp(Math.max(view.s, 30 / best.r), fit, maxScale());
        const t = { s, x: W / 2 - best.x * s, y: H / 2 - best.y * s };
        if (reduceMotion) { view = t; clampView(); } else flyTo(t);
        pulse = { r: best, t0: performance.now() + (reduceMotion ? 0 : 300) }; draw();
    }

    /* saving */
    function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); }
    function saveNow() {
        clearTimeout(saveTimer); if (!P || mode === 'challenge') return;
        const key = saveKey(P.id, mode), plain = P.pal.id === 'original';
        if (!P.filledCount && plain) { store.del(key); store.del(key + ':thumb'); return; }
        const s = { v: P.v, n: P.filledCount, sel: Math.max(0, sel) };
        if (!plain) s.pal = P.pal;
        if (mode === 'free') { s.p = P.regions.map((r) => (r.paint === null ? -1 : r.paint)); if (selHex) s.hex = selHex; } else s.f = packFilled(P);
        store.set(key, JSON.stringify(s));
    }
    function renderImage(longSide, withLines) {
        const s = longSide / Math.max(P.w, P.h), c = document.createElement('canvas'); c.width = Math.round(P.w * s); c.height = Math.round(P.h * s);
        const g = c.getContext('2d'); g.setTransform(s, 0, 0, s, 0, 0);
        const anims = P.regions.map((r) => r.anim); P.regions.forEach((r) => { r.anim = null; });
        paint(g, P, s, { lines: withLines }); P.regions.forEach((r, i) => { r.anim = anims[i]; });
        return c;
    }
    function leave() {
        if (!P) return; saveNow(); clearInterval(ticker);
        if (P.filledCount && mode !== 'challenge') { try { store.set(saveKey(P.id, mode) + ':thumb', renderImage(360, !isDone()).toDataURL('image/jpeg', 0.72)); } catch (e) { /* tainted or blocked */ } }
        P = null; run = null; showGallery();
    }
    function restart() {
        const id = P.id;
        if (mode !== 'challenge') { store.del(saveKey(id, mode)); store.del(saveKey(id, mode) + ':thumb'); }
        clearInterval(ticker); P = null; openPuzzle(id);
    }

    /* confetti */
    function confetti() {
        if (reduceMotion) return;
        const c = $('confetti'), g = c.getContext('2d'), d = Math.min(window.devicePixelRatio || 1, 2); c.width = innerWidth * d; c.height = innerHeight * d;
        const cols = P.colors.concat(['#d9822b', '#3f9b5b', '#f2c94c', '#2f6fe4']);
        const parts = Array.from({ length: 140 }, () => ({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, r: 4 + Math.random() * 6, a: Math.random() * 6.3, va: (Math.random() - 0.5) * 0.3, c: cols[(Math.random() * cols.length) | 0] }));
        const t0 = performance.now();
        (function tick(now) {
            g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
            const t = (now - t0) / 1000; if (t > 3.2) return;
            g.globalAlpha = clamp(3.2 - t, 0, 1);
            for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.a += p.va; g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.c; g.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9); g.restore(); }
            requestAnimationFrame(tick);
        })(t0);
    }

    /* buttons */
    $('btn-back').addEventListener('click', leave);
    $('btn-hint').addEventListener('click', () => { sound.unlock(); hint(); });
    $('btn-fit').addEventListener('click', () => { if (P) fitView(true); });
    $('z-in').addEventListener('click', () => { if (P) zoomAt(W / 2, H / 2, 1.5); });
    $('z-out').addEventListener('click', () => { if (P) zoomAt(W / 2, H / 2, 1 / 1.5); });
    function paintSound() { $('sound-use').setAttribute('href', sound.on ? '#i-sound' : '#i-mute'); $('btn-sound').setAttribute('aria-pressed', String(sound.on)); }
    $('btn-sound').addEventListener('click', () => { sound.on = !sound.on; store.set('sound', sound.on ? '1' : '0'); paintSound(); if (sound.on) { sound.unlock(); sound.pop(3); } });
    paintSound();
    $('btn-pal').addEventListener('click', () => { sound.unlock(); if ($('pals').hidden) openPals(); else closePals(); });
    $('pals-close').addEventListener('click', closePals);
    $('pals-surprise').addEventListener('click', () => { sound.unlock(); sound.colourDone(); setPalette({ id: 'surprise', colors: surprise(P.palette) }); });
    $('t-undo').addEventListener('click', () => step(undo, redo, -1));
    $('t-redo').addEventListener('click', () => step(redo, undo, 1));
    $('t-erase').addEventListener('click', () => setTool(tool === 'erase' ? 'paint' : 'erase'));
    $('t-pick').addEventListener('click', () => setTool(tool === 'pick' ? 'paint' : 'pick'));
    $('t-fill').addEventListener('click', fillRest);
    $('btn-restart').addEventListener('click', () => {
        if (!P) return;
        if (mode === 'challenge') { if (!run.since && !run.done) return; }
        else if (!P.filledCount) return;
        const t = $('confirm-text'); t.textContent = '';
        const b = document.createElement('b'); b.textContent = P.title;
        if (mode === 'free') t.append('Clear your painting of ', b, '? This cannot be undone.');
        else if (mode === 'challenge') t.append('Restart the clock on ', b, '?');
        else t.append('Start ', b, ' again? Your colouring on this picture will be cleared.');
        $('confirm').hidden = false;
    });
    $('confirm-no').addEventListener('click', () => { $('confirm').hidden = true; });
    $('confirm-yes').addEventListener('click', restart);
    $('btn-again').addEventListener('click', restart);
    $('btn-photo').addEventListener('click', () => {
        const on = photoTarget === 0; photoTarget = on ? 1 : 0;
        $('btn-photo').setAttribute('aria-pressed', String(on)); $('btn-photo').textContent = on ? 'Back to my painting' : 'See the real Franklin';
        if (on && !photo) { const im = new Image(); im.onload = () => { photo = im; draw(); }; im.src = 'data/' + P.ref; }
        if (reduceMotion) photoAlpha = photoTarget; draw();
    });
    $('btn-save').addEventListener('click', () => {
        renderImage(2200, false).toBlob((blob) => {
            if (!blob) return; const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'franklin-' + P.id + '.png';
            document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        }, 'image/png');
    });
    $('btn-next').addEventListener('click', () => { const id = $('btn-next').dataset.id; leave(); if (id) openPuzzle(id); });
    window.addEventListener('keydown', (e) => {
        if (!P || $('play').hidden || e.altKey || (e.target && e.target.tagName === 'INPUT')) return;
        if (e.metaKey || e.ctrlKey) {
            if (mode === 'free' && (e.key === 'z' || e.key === 'Z')) { if (e.shiftKey) step(redo, undo, 1); else step(undo, redo, -1); e.preventDefault(); }
            else if (mode === 'free' && (e.key === 'y' || e.key === 'Y')) { step(redo, undo, 1); e.preventDefault(); }
            return;
        }
        const n = P.palette.length, k = e.key.toLowerCase();
        if (e.key === 'ArrowRight' || e.key === ']') { selectColour((Math.max(sel, -1) + 1) % n, true); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' || e.key === '[') { selectColour((Math.max(sel, 0) + n - 1) % n, true); e.preventDefault(); }
        else if (k === 'h') hint();
        else if (k === 'p') { if ($('pals').hidden) openPals(); else closePals(); }
        else if (k === 'e' && mode === 'free') setTool(tool === 'erase' ? 'paint' : 'erase');
        else if (k === 'i' && mode === 'free') setTool(tool === 'pick' ? 'paint' : 'pick');
        else if (e.key === '+' || e.key === '=') zoomAt(W / 2, H / 2, 1.5);
        else if (e.key === '-') zoomAt(W / 2, H / 2, 1 / 1.5);
        else if (e.key === '0') fitView(true);
        else if (e.key === 'Escape') { if (!$('confirm').hidden) $('confirm').hidden = true; else if (!$('pals').hidden) closePals(); else if (tool !== 'paint') setTool('paint'); else leave(); }
    });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);
    window.addEventListener('pagehide', () => { if (P) saveNow(); });
    document.addEventListener('visibilitychange', () => {
        if (!P) return;
        if (document.hidden) { saveNow(); if (run && run.since) { run.acc += performance.now() - run.since; run.since = null; run.paused = true; } }   // the clock stops while the page is hidden
        else if (run && run.paused && !run.done) { run.paused = false; run.since = performance.now(); }
    });

    /* start */
    fetch('data/index.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((list) => {
        index = list; showGallery();
        const want = (location.search.match(/[?&]pic=([\w-]+)/) || [])[1];
        if (want && index.some((m) => m.id === want)) openPuzzle(want);
    }).catch((e) => { console.error(e); const l = $('cards').querySelector('.loading'); if (l) { l.classList.add('err'); l.textContent = 'The pictures would not load. Check your connection and reload.'; } });

    window.franklin = {
        get puzzle() { return P; }, get view() { return view; }, get sel() { return sel; }, get selHex() { return selHex; }, get mode() { return mode; }, get run() { return run; }, get tool() { return tool; },
        get time() { return elapsed(); }, get undoCount() { return undo.length; }, palettes: PALETTES.map((q) => q.id), par,
        regionAt: (x, y) => regionAt(x, y), toScreen, hint, openPuzzle, leave, setMode, setPalette,
    };
})();
