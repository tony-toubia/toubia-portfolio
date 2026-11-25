// Franklin by Numbers: a colour-by-numbers game. Pictures are vector puzzles built from photos by
// scripts/franklin/build_puzzles.py (see that file for the data format). One canvas, drawn on demand.
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
        pop(i) { this.tone(420 + (i % 12) * 34, 0.09, 0, 0.11, 'triangle'); },
        nope() { this.tone(170, 0.12, 0, 0.07, 'sine'); },
        colourDone() { [660, 880].forEach((f, i) => this.tone(f, 0.16, i * 0.09, 0.1)); },
        fanfare() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.28, i * 0.11, 0.12, 'triangle')); },
    };

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
            const region = { id, c: r[0], x: r[1] / 10, y: r[2] / 10, r: r[3] / 10, path, x0, y0, x1, y1, filled: false, anim: null };
            for (const ch of regs) ch.regs.push(region);
            return region;
        });
        // Each boundary line is drawn once, from its chain: heavier for an element's outline, lighter for shading.
        for (const ch of chains) { ch.path = new Path2D(); add(ch.path, ch, false, true); if (ch.kind === 2) ch.path.closePath(); }
        const perColour = data.palette.map(() => ({ total: 0, done: 0 }));
        for (const r of regions) perColour[r.c].total++;
        return { id: data.id, v: data.v, title: data.title, w: data.w, h: data.h, palette: data.palette, regions, chains, perColour, filledCount: 0, art: data.art || null, artImg: null, ref: data.ref || null };
    }
    const textOn = (hex) => { const n = parseInt(hex.slice(1), 16), l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); return l > 150 ? '#2b1d0e' : '#ffffff'; };

    // Saved progress: which regions are filled, as a string of 0/1 packed into base64.
    function packFilled(p) { let s = ''; for (let i = 0; i < p.regions.length; i += 6) { let v = 0; for (let b = 0; b < 6; b++) if (p.regions[i + b] && p.regions[i + b].filled) v |= 1 << b; s += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[v]; } return s; }
    function unpackFilled(p, s) {
        const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        for (let i = 0; i < p.regions.length; i++) { const v = A.indexOf(s[(i / 6) | 0] || 'A'); if (v > 0 && (v >> (i % 6)) & 1) fillRegion(p, p.regions[i]); }
    }
    function fillRegion(p, r) { if (r.filled) return false; r.filled = true; p.filledCount++; p.perColour[r.c].done++; return true; }
    function readSave(meta) { try { const s = JSON.parse(store.get(meta.id) || 'null'); return s && s.v === meta.v ? s : null; } catch (e) { return null; } }

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
            const col = p.palette[r.c];
            if (r.anim) {
                const t = Math.max(0, (now - r.anim.t0) / 380);
                if (t >= 1) r.anim = null;
                else {
                    animating = true;
                    const far = Math.max(Math.hypot(r.x0 - r.anim.x, r.y0 - r.anim.y), Math.hypot(r.x1 - r.anim.x, r.y0 - r.anim.y), Math.hypot(r.x0 - r.anim.x, r.y1 - r.anim.y), Math.hypot(r.x1 - r.anim.x, r.y1 - r.anim.y));
                    ctx.save(); ctx.clip(r.path, 'evenodd'); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(r.anim.x, r.anim.y, far * (1 - Math.pow(1 - t, 3)) + 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
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
    function showGallery() {
        $('play').hidden = true; $('gallery').hidden = false; document.title = 'Franklin by Numbers';
        const cards = $('cards'); cards.innerHTML = '';
        for (const m of index) {
            const save = readSave(m), n = save ? (save.n || 0) : 0, pct = Math.round(n / m.regions * 100), done = n >= m.regions;
            const b = document.createElement('button'); b.type = 'button'; b.className = 'card' + (done ? ' done' : ''); b.dataset.id = m.id;
            const thumb = (save && store.get(m.id + ':thumb')) || ('data/' + m.id + '-thumb.webp');
            b.innerHTML = '<span class="card-pic"><img alt="" src="' + thumb + '">' + (done ? '<span class="card-badge"><svg><use href="#i-check"/></svg>Done</span>' : '') + '</span>'
                + '<span><span class="card-name"></span><br><span class="card-blurb"></span></span>'
                + '<span class="card-meta"><span class="card-bar"><i style="width:' + pct + '%"></i></span><span>' + (done ? '100%' : n ? pct + '%' : m.colors + ' colours') + '</span></span>';
            b.querySelector('.card-name').textContent = m.title; b.querySelector('.card-blurb').textContent = m.blurb;
            b.setAttribute('aria-label', m.title + (done ? ', finished' : n ? ', ' + pct + '% coloured' : ', ' + m.colors + ' colours'));
            b.addEventListener('click', () => { sound.unlock(); openPuzzle(m.id); });
            cards.appendChild(b);
        }
    }

    /* ── play ─────────────────── */
    const cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage');
    const hit = document.createElement('canvas').getContext('2d');
    let P = null, meta = null, sel = 0, view = { s: 1, x: 0, y: 0 }, fit = 1, W = 0, H = 0, dpr = 1;
    let dirty = false, camAnim = null, pulse = null, photo = null, photoAlpha = 0, photoTarget = 0, saveTimer = 0;

    function openPuzzle(id) {
        meta = index.find((m) => m.id === id); if (!meta) return;
        $('cards').querySelectorAll('.card').forEach((c) => { c.disabled = true; });
        loadPuzzle(id).then((data) => {
            P = buildPuzzle(data);
            if (P.art) { const p = P, im = new Image(); im.onload = () => { p.artImg = im; if (P === p) draw(); }; im.src = 'data/' + P.art; }
            const save = readSave(meta);
            if (save && save.f) unpackFilled(P, save.f);
            sel = save && save.sel != null && P.perColour[save.sel] ? save.sel : 0;
            photo = null; photoAlpha = 0; photoTarget = 0; pulse = null; camAnim = null;
            $('gallery').hidden = true; $('play').hidden = false; $('confirm').hidden = true; hideBubble();
            $('p-title').textContent = P.title; document.title = P.title + ' | Franklin by Numbers';
            $('btn-photo').setAttribute('aria-pressed', 'false'); $('btn-photo').textContent = 'See the real Franklin'; $('btn-photo').hidden = !P.ref;   // only pictures made from a photo have one
            buildPalette(); resize(); fitView(); refreshProgress(false);
            if (P.perColour[sel].done >= P.perColour[sel].total) nextColour();
            selectColour(sel, false);
        }).catch((e) => { console.error(e); showGallery(); const c = $('cards'); const p = document.createElement('p'); p.className = 'loading err'; p.textContent = 'That picture would not load. Check your connection and try again.'; c.prepend(p); });
    }

    function buildPalette() {
        const el = $('palette'); el.innerHTML = '';
        P.palette.forEach((hex, i) => {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.dataset.c = i;
            b.style.setProperty('--c', hex); b.style.setProperty('--t', textOn(hex));
            b.innerHTML = '<svg class="ring" viewBox="0 0 54 54"><circle class="bg" cx="27" cy="27" r="25"/><circle class="fg" cx="27" cy="27" r="25" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg>'
                + '<span class="dot"></span><span class="num">' + (i + 1) + '</span><svg class="tick"><use href="#i-check"/></svg><span class="left"></span>';
            b.addEventListener('click', () => { sound.unlock(); selectColour(i, true); });
            el.appendChild(b);
        });
        refreshPalette();
    }
    function refreshPalette() {
        $('palette').querySelectorAll('.sw').forEach((b) => {
            const i = +b.dataset.c, pc = P.perColour[i], left = pc.total - pc.done;
            b.classList.toggle('on', i === sel); b.classList.toggle('complete', left === 0);
            b.querySelector('.left').textContent = left;
            b.querySelector('.fg').style.strokeDashoffset = String(100 - (pc.total ? pc.done / pc.total * 100 : 100));
            b.setAttribute('aria-label', 'Colour ' + (i + 1) + (left ? ', ' + left + ' left' : ', finished'));
            b.setAttribute('aria-pressed', String(i === sel));
        });
    }
    function selectColour(i, scroll) {
        sel = i; refreshPalette(); hideBubble(); pulse = null; draw();
        const b = $('palette').querySelector('.sw[data-c="' + i + '"]');
        if (b && scroll !== false && b.scrollIntoView) b.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
        else if (b) $('palette').scrollLeft = Math.max(0, b.offsetLeft - $('palette').clientWidth / 2 + 27);
        queueSave();
    }
    function nextColour() {
        for (let k = 1; k <= P.palette.length; k++) { const i = (sel + k) % P.palette.length; if (P.perColour[i].done < P.perColour[i].total) { sel = i; return true; } }
        return false;
    }
    function refreshProgress(celebrate) {
        const pct = P.filledCount / P.regions.length, done = P.filledCount >= P.regions.length;
        $('p-pct').textContent = Math.floor(pct * 100) + '%'; $('prog-fill').style.width = (pct * 100) + '%';
        $('palette').hidden = done; $('done').hidden = !done; $('btn-hint').disabled = done; $('btn-hint').style.opacity = done ? 0.4 : 1;
        if (done) {
            const i = index.findIndex((m) => m.id === meta.id), rest = index.filter((m) => { const s = readSave(m); return m.id !== meta.id && !(s && s.n >= m.regions); });
            $('done-title').textContent = P.title + ': finished!';
            $('done-sub').textContent = rest.length ? 'Franklin approves. ' + rest.length + ' more to colour.' : 'Every picture coloured. Franklin is very proud.';
            $('btn-next').textContent = rest.length ? 'Next picture' : 'All pictures'; $('btn-next').dataset.id = rest.length ? (rest.find((m) => index.indexOf(m) > i) || rest[0]).id : '';
            if (celebrate) { sound.fanfare(); confetti(); fitView(true); }
        }
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
    function regionAt(x, y) {
        for (const r of P.regions) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1 && hit.isPointInPath(r.path, x, y, 'evenodd')) return r;
        return null;
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
        const a = toPic(0, 0), b = toPic(W, H), done = P.filledCount >= P.regions.length;
        if (paint(ctx, P, view.s, { sel, now, clip: { x0: a.x, y0: a.y, x1: b.x, y1: b.y }, lines: !done })) again = true;
        if (photo && photoAlpha > 0) { ctx.globalAlpha = photoAlpha; ctx.drawImage(photo, 0, 0, P.w, P.h); ctx.globalAlpha = 1; }
        ctx.restore();
        // Numbers, in screen space so they stay crisp. A number shows once its area has room for it.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (!done) for (const r of P.regions) {
            if (r.filled) continue;
            const room = r.r * view.s; if (room < 6.5) continue;
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

    /* input */
    const pointers = new Map();
    let gesture = null;   // { mode: 'paint' | 'pan' | 'pinch', ... }
    function local(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function tryFill(r, at) {
        if (!r || r.filled || r.c !== sel) return false;
        fillRegion(P, r); r.anim = reduceMotion ? null : { t0: performance.now(), x: at.x, y: at.y };
        sound.pop(r.c); if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* not allowed */ } }
        const pc = P.perColour[r.c], all = P.filledCount >= P.regions.length;
        if (pc.done >= pc.total && !all) { sound.colourDone(); if (nextColour()) { refreshPalette(); selectColour(sel, true); } }
        refreshPalette(); refreshProgress(all); queueSave(); draw();
        return true;
    }
    cv.addEventListener('pointerdown', (e) => {
        if (!P) return; sound.unlock(); cv.setPointerCapture(e.pointerId); const p = local(e); pointers.set(e.pointerId, p); hideBubble(); camAnim = null;
        if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            gesture = { mode: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
            cv.classList.remove('painting'); return;
        }
        if (pointers.size > 2) return;
        const q = toPic(p.x, p.y), r = regionAt(q.x, q.y);
        if (e.button === 0 && tryFill(r, q)) { gesture = { mode: 'paint' }; cv.classList.add('painting'); }
        else gesture = { mode: 'pan', sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: 0, region: r };
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
        if (gesture && gesture.mode === 'pan' && gesture.moved <= 7 && e.type === 'pointerup') {
            const r = gesture.region;
            if (r && !r.filled && r.c !== sel) { sound.nope(); showBubble(p.x, p.y, r.c); }
            else if (!r || r.filled) { /* a tap on paint or the table: nothing to do */ }
        }
        if (pointers.size === 1 && gesture && gesture.mode === 'pinch') { const q = [...pointers.values()][0]; gesture = { mode: 'pan', sx: q.x, sy: q.y, lx: q.x, ly: q.y, moved: 99, region: null }; }
        else if (pointers.size === 0) { gesture = null; cv.classList.remove('painting'); }
    }
    cv.addEventListener('pointerup', pointerEnd); cv.addEventListener('pointercancel', pointerEnd);
    cv.addEventListener('wheel', (e) => { if (!P) return; e.preventDefault(); const p = local(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0018))); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    let bubbleTimer = 0;
    function showBubble(x, y, c) {
        const b = $('bubble'); b.innerHTML = 'That one is <i style="background:' + P.palette[c] + '"></i>' + (c + 1);
        b.style.left = clamp(x, 70, W - 70) + 'px'; b.style.top = Math.max(44, y - 12) + 'px'; b.hidden = false;
        clearTimeout(bubbleTimer); bubbleTimer = setTimeout(hideBubble, 1600);
    }
    function hideBubble() { $('bubble').hidden = true; }

    // Hint: fly to the nearest unfilled area of the selected colour and ring it.
    function hint() {
        if (!P || P.filledCount >= P.regions.length) return;
        if (P.perColour[sel].done >= P.perColour[sel].total && nextColour()) selectColour(sel, true);
        const c = toPic(W / 2, H / 2); let best = null, bd = 1e18;
        for (const r of P.regions) if (!r.filled && r.c === sel) { const d = (r.x - c.x) ** 2 + (r.y - c.y) ** 2 - r.r * r.r * 4; if (d < bd) { bd = d; best = r; } }
        if (!best) return;
        const s = clamp(Math.max(view.s, 30 / best.r), fit, maxScale());
        const t = { s, x: W / 2 - best.x * s, y: H / 2 - best.y * s };
        if (reduceMotion) { view = t; clampView(); } else flyTo(t);
        pulse = { r: best, t0: performance.now() + (reduceMotion ? 0 : 300) }; draw();
    }

    /* saving */
    function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); }
    function saveNow() {
        clearTimeout(saveTimer); if (!P) return;
        if (!P.filledCount) { store.del(P.id); store.del(P.id + ':thumb'); return; }
        store.set(P.id, JSON.stringify({ v: P.v, f: packFilled(P), n: P.filledCount, sel }));
    }
    function renderImage(longSide, withLines) {
        const s = longSide / Math.max(P.w, P.h), c = document.createElement('canvas'); c.width = Math.round(P.w * s); c.height = Math.round(P.h * s);
        const g = c.getContext('2d'); g.setTransform(s, 0, 0, s, 0, 0);
        const anims = P.regions.map((r) => r.anim); P.regions.forEach((r) => { r.anim = null; });
        paint(g, P, s, { lines: withLines }); P.regions.forEach((r, i) => { r.anim = anims[i]; });
        return c;
    }
    function leave() {
        if (!P) return; saveNow();
        if (P.filledCount) { try { store.set(P.id + ':thumb', renderImage(360, P.filledCount < P.regions.length).toDataURL('image/jpeg', 0.72)); } catch (e) { /* tainted or blocked */ } }
        P = null; showGallery();
    }

    /* confetti */
    function confetti() {
        if (reduceMotion) return;
        const c = $('confetti'), g = c.getContext('2d'), d = Math.min(window.devicePixelRatio || 1, 2); c.width = innerWidth * d; c.height = innerHeight * d;
        const cols = P.palette.concat(['#d9822b', '#3f9b5b', '#f2c94c', '#2f6fe4']);
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
    $('btn-restart').addEventListener('click', () => { if (!P || !P.filledCount) return; $('confirm-title').textContent = P.title; $('confirm').hidden = false; });
    $('confirm-no').addEventListener('click', () => { $('confirm').hidden = true; });
    $('confirm-yes').addEventListener('click', () => { const id = P.id; store.del(id); store.del(id + ':thumb'); P = null; openPuzzle(id); });
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
        if (!P || $('play').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
        const n = P.palette.length;
        if (e.key === 'ArrowRight' || e.key === ']') { selectColour((sel + 1) % n, true); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' || e.key === '[') { selectColour((sel + n - 1) % n, true); e.preventDefault(); }
        else if (e.key === 'h' || e.key === 'H') hint();
        else if (e.key === '+' || e.key === '=') zoomAt(W / 2, H / 2, 1.5);
        else if (e.key === '-') zoomAt(W / 2, H / 2, 1 / 1.5);
        else if (e.key === '0') fitView(true);
        else if (e.key === 'Escape') { if (!$('confirm').hidden) $('confirm').hidden = true; else leave(); }
    });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);
    window.addEventListener('pagehide', () => { if (P) saveNow(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && P) saveNow(); });

    /* start */
    fetch('data/index.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((list) => {
        index = list; showGallery();
        const want = (location.search.match(/[?&]pic=([\w-]+)/) || [])[1];
        if (want && index.some((m) => m.id === want)) openPuzzle(want);
    }).catch((e) => { console.error(e); const l = $('cards').querySelector('.loading'); if (l) { l.classList.add('err'); l.textContent = 'The pictures would not load. Check your connection and reload.'; } });

    window.franklin = { get puzzle() { return P; }, get view() { return view; }, get sel() { return sel; }, regionAt: (x, y) => regionAt(x, y), toScreen: (x, y) => ({ x: x * view.s + view.x, y: y * view.s + view.y }), hint, openPuzzle, leave };
})();
