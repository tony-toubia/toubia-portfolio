// StudForge "Remember & share": every forge gets a share link, a share-card
// image, and a local gallery of saved builds (plus a strip of recent ideas).
//
//   ?idea=<prompt>&v=<variant>[&o=<base64url JSON opts>]   addresses a forge; the URL
//   follows the current model (replaceState) and is honoured on load.
//
// Everything here degrades: no localStorage (private mode) → the gallery
// explains itself and share links still work; no clipboard → a text fallback.
(() => {
    const KEY_GALLERY = 'studforge.gallery.v1', KEY_RECENT = 'studforge.recent.v1';
    const MAX_SAVED = 40, MAX_RECENT = 8;
    const SITE = 'tonytoubia.com/studforge';

    /* ── storage (always guarded: private mode throws on access) ─── */
    const store = {
        get(key, dflt) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; } },
        set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } },
        available() { try { const k = '__sfg_probe__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } },
    };

    /* ── share links ──────────────────────────────────────────────── */
    const b64url = {
        encode(obj) { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
        decode(s) { try { s = s.replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(s + '='.repeat((4 - s.length % 4) % 4))))); } catch (e) { return null; } },
    };
    /** Only the parts of opts worth putting in a link (colours, scale, features); nothing empty. */
    const compactOpts = (opts) => {
        const o = {};
        if (!opts) return o;
        if (opts.colors && Object.keys(opts.colors).length) o.colors = opts.colors;
        if (typeof opts.scale === 'number') o.scale = opts.scale;
        if (opts.features && Object.keys(opts.features).length) o.features = opts.features;
        return o;
    };
    const shareQuery = (prompt, variant, opts) => {
        let q = `idea=${encodeURIComponent(prompt)}&v=${variant | 0}`;
        const o = compactOpts(opts);
        if (Object.keys(o).length) q += `&o=${b64url.encode(o)}`;
        return q;
    };
    /** The standalone app URL (works locally and at tonytoubia.com/studforge/index.html, also from inside the portfolio iframe). */
    const shareLink = (prompt, variant, opts) => `${location.origin}${location.pathname}?${shareQuery(prompt, variant, opts)}`;
    const parseShare = () => {
        const sp = new URLSearchParams(location.search);
        const prompt = (sp.get('idea') || '').trim();
        if (!prompt) return null;
        const variant = Math.max(0, parseInt(sp.get('v') || '0', 10) || 0);
        const opts = sp.get('o') ? (b64url.decode(sp.get('o')) || {}) : {};
        return { prompt: prompt.slice(0, 200), variant, opts: compactOpts(opts) };
    };
    /** Keep the address bar in step with the model, leaving other params alone and adding no history entries. */
    const syncUrl = (prompt, variant, opts) => {
        try {
            const sp = new URLSearchParams(location.search);
            sp.delete('idea'); sp.delete('v'); sp.delete('o');
            const rest = sp.toString();
            history.replaceState(history.state, '', `${location.pathname}?${rest ? rest + '&' : ''}${shareQuery(prompt, variant, opts)}${location.hash}`);
        } catch (e) { /* sandboxed iframe or file:// */ }
    };

    /* ── small UI helpers ─────────────────────────────────────────── */
    const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ago = (t) => { const s = Math.max(0, (Date.now() - t) / 1000); if (s < 60) return 'JUST NOW'; if (s < 3600) return `${Math.floor(s / 60)}M AGO`; if (s < 86400) return `${Math.floor(s / 3600)}H AGO`; if (s < 86400 * 14) return `${Math.floor(s / 86400)}D AGO`; return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase(); };
    let toastEl = null, toastTimer = 0;
    /** One toast at a time, bottom-centre; `action` adds a button (used for UNDO). */
    const toast = (msg, action) => {
        if (!toastEl) { toastEl = el('div', 'sfg-toast'); document.body.appendChild(toastEl); }
        toastEl.innerHTML = `<span>${esc(msg)}</span>`;
        if (action) { const b = el('button', 'sfg-toast-btn', esc(action.label)); b.addEventListener('click', () => { action.run(); hide(); }); toastEl.appendChild(b); }
        toastEl.classList.add('on');
        clearTimeout(toastTimer);
        const hide = () => toastEl.classList.remove('on');
        toastTimer = setTimeout(hide, action ? 6000 : 1800);
    };
    const flash = (btn, text, ms = 1800) => { const orig = btn.innerHTML; btn.innerHTML = text; btn.classList.add('on'); setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('on'); }, ms); };
    const copyText = async (text) => {
        try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
        try {
            const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'; ta.setAttribute('readonly', '');
            document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
        } catch (e) { return false; }
    };

    const CSS = `
/* ── gallery (share links, cards, saved builds) ── */
.sfg-toast { position: fixed; left: 50%; bottom: 22px; transform: translate(-50%, 16px); opacity: 0; pointer-events: none; z-index: 60; display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-radius: 20px; background: #131822; border: 1px solid rgba(242,205,55,.45); color: #fff; font-family: var(--font-heading); font-size: 10px; font-weight: 700; letter-spacing: .8px; box-shadow: 0 8px 24px rgba(0,0,0,.45); transition: opacity .18s ease, transform .18s ease; max-width: calc(100vw - 32px); }
.sfg-toast.on { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
.sfg-toast-btn { background: var(--lego-yellow); color: #0c0f17; border: none; border-radius: 12px; padding: 4px 10px; font-family: var(--font-heading); font-size: 9px; font-weight: 800; letter-spacing: .8px; cursor: pointer; }
.sfg-panel { display: flex; flex-direction: column; gap: 12px; }
.sfg-save { margin: 0; }
.sfg-save:disabled { opacity: .45; cursor: not-allowed; filter: none; }
.sfg-hint { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
.sfg-section { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.sfg-section h4 { margin: 0; }
.sfg-section small { font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); letter-spacing: .5px; }
.sfg-recent { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; margin: 0 -14px; padding-left: 14px; padding-right: 14px; scrollbar-width: none; }
.sfg-recent::-webkit-scrollbar { display: none; }
.sfg-recent-pill { flex: 0 0 auto; max-width: 180px; display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 14px; background: var(--bg-card); border: 1px solid var(--border-main); color: var(--text-secondary); font-family: var(--font-body); font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; overflow: hidden; }
.sfg-recent-pill span { overflow: hidden; text-overflow: ellipsis; }
.sfg-recent-pill b { font-family: var(--font-mono); font-size: 9px; color: var(--lego-yellow); flex: 0 0 auto; }
.sfg-recent-pill:hover, .sfg-recent-pill.on { border-color: var(--lego-yellow); color: #fff; }
.sfg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 8px; }
.sfg-card { position: relative; display: flex; flex-direction: column; background: var(--bg-card); border: 1px solid var(--border-main); border-radius: 8px; overflow: hidden; cursor: pointer; text-align: left; padding: 0; color: inherit; font: inherit; transition: border-color .15s ease, transform .15s ease; }
.sfg-card:hover, .sfg-card:focus-visible { border-color: var(--lego-yellow); transform: translateY(-1px); outline: none; }
.sfg-card.on { border-color: var(--lego-yellow); box-shadow: inset 0 0 0 1px var(--lego-yellow); }
.sfg-thumb { width: 100%; aspect-ratio: 4 / 3; background: #0e121a; display: flex; align-items: center; justify-content: center; font-size: 30px; }
.sfg-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sfg-card-body { padding: 7px 8px 8px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.sfg-card-name { font-family: var(--font-heading); font-size: 10px; font-weight: 700; color: #fff; letter-spacing: .3px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sfg-card-meta { font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); letter-spacing: .3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sfg-card-meta b { color: var(--lego-yellow); font-weight: 700; }
.sfg-card-actions { position: absolute; top: 4px; right: 4px; display: flex; gap: 3px; opacity: 0; transition: opacity .15s ease; }
.sfg-card:hover .sfg-card-actions, .sfg-card:focus-within .sfg-card-actions, .sfg-card.on .sfg-card-actions { opacity: 1; }
@media (hover: none) { .sfg-card-actions { opacity: 1; } }
.sfg-icon-btn { width: 24px; height: 24px; border-radius: 6px; border: 1px solid rgba(255,255,255,.12); background: rgba(12,15,23,.85); color: #fff; font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.sfg-icon-btn:hover { border-color: var(--lego-yellow); }
.sfg-icon-btn.danger:hover { border-color: var(--lego-red); color: #ff8a80; }
.sfg-empty { border: 1px dashed rgba(255,255,255,.14); border-radius: 8px; padding: 18px 14px; text-align: center; color: var(--text-muted); font-size: 12px; line-height: 1.5; }
.sfg-empty b { display: block; font-family: var(--font-heading); font-size: 10px; letter-spacing: 1px; color: var(--text-secondary); margin-bottom: 4px; }
.sfg-empty .sfg-empty-icon { font-size: 26px; display: block; margin-bottom: 6px; }
@media (max-width: 600px) { .sfg-grid { grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); } .sfg-toast { bottom: 14px; } }
/* Phones: the folded parts/panels drawer collapses to its borders because every child is a scroll container; give the open drawer real height so its tabs (ours included) are reachable. */
`;

    /* ── rendering the model to an image ──────────────────────────── */
    /**
     * A fresh iso render of the current model at the given size, on its own canvas.
     * The viewer's buffer is not preserved between frames, so render then copy in the same tick;
     * the renderer is sized to the requested shape for the shot and put back afterwards.
     */
    function snapshot(viewer, w, h) {
        const out = document.createElement('canvas'); out.width = w; out.height = h;
        const ctx = out.getContext('2d');
        const r = viewer.renderer, cam = viewer.camera, sp = viewer.spherical;
        const size = r.getSize(new THREE.Vector2()), pr = r.getPixelRatio();
        const saved = { theta: sp.theta, phi: sp.phi, radius: sp.radius, aspect: cam.aspect };
        try {
            // iso home view, a touch closer than the viewport's fit so the model fills the picture
            sp.theta = viewer.home.theta; sp.phi = viewer.home.phi; sp.radius = viewer.home.radius * 0.86;
            viewer.updateCameraPosition();
            r.setPixelRatio(1); r.setSize(w, h, false);
            cam.aspect = w / h; cam.updateProjectionMatrix();
            r.render(viewer.scene, cam);
            ctx.drawImage(r.domElement, 0, 0, w, h);
        } finally {
            sp.theta = saved.theta; sp.phi = saved.phi; sp.radius = saved.radius;
            viewer.updateCameraPosition();
            r.setPixelRatio(pr); r.setSize(size.x, size.y, false);
            cam.aspect = saved.aspect; cam.updateProjectionMatrix();
            r.render(viewer.scene, cam);
        }
        return out;
    }

    const wrapText = (ctx, text, maxWidth, maxLines) => {
        const words = String(text).split(/\s+/), lines = [];
        let line = '';
        for (const w of words) {
            const t = line ? `${line} ${w}` : w;
            if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = w; } else line = t;
            if (lines.length === maxLines) break;
        }
        if (lines.length < maxLines && line) lines.push(line);
        else if (lines.length === maxLines && line) { let last = lines[maxLines - 1]; while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1); lines[maxLines - 1] = last + '…'; }
        return lines;
    };

    /** The 1200×630 share card: model render on the right, name / stats / prompt on the left. */
    async function composeCard(sf) {
        const model = sf.model, viewer = sf.viewer;
        try { await document.fonts.ready; await Promise.all(['900 56px Orbitron', '700 22px Rajdhani', '500 26px Rajdhani', '500 16px "JetBrains Mono"'].map((f) => document.fonts.load(f).catch(() => null))); } catch (e) { /* fonts optional */ }
        const W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        const HEAD = "'Orbitron', -apple-system, 'Segoe UI', sans-serif", BODY = "'Rajdhani', -apple-system, 'Segoe UI', sans-serif", MONO = "'JetBrains Mono', Menlo, monospace";
        // backdrop: navy gradient with a faint stud grid
        const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0c0f17'); bg.addColorStop(1, '#161c2a');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,0.035)';
        for (let y = 24; y < H; y += 40) for (let x = 24; x < W; x += 40) { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
        // accent stripe along the top
        const stripe = ctx.createLinearGradient(0, 0, W, 0); stripe.addColorStop(0, '#f2cd37'); stripe.addColorStop(0.55, '#fe8a18'); stripe.addColorStop(1, '#c91a09');
        ctx.fillStyle = stripe; ctx.fillRect(0, 0, W, 8);
        // the model: rendered panel on the right
        const px = 620, py = 48, pw = 532, ph = 450, pr = 18;
        const round = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14; ctx.fillStyle = '#0e121a'; round(px, py, pw, ph, pr); ctx.fill(); ctx.restore();
        try { const shot = snapshot(viewer, pw, ph); ctx.save(); round(px, py, pw, ph, pr); ctx.clip(); ctx.drawImage(shot, px, py); ctx.restore(); } catch (e) { console.warn('StudForge card: render failed', e); }
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.5; round(px, py, pw, ph, pr); ctx.stroke();
        // left column: category pill, name, stats, prompt
        const lx = 56, lw = 520;
        ctx.textBaseline = 'alphabetic';
        ctx.font = `700 16px ${HEAD}`; ctx.fillStyle = '#f2cd37';
        ctx.fillText(`${model.icon || '🧱'}  ${String(model.category || 'BUILD').toUpperCase()}`, lx, 86);
        let size = 56, lines;
        do { ctx.font = `900 ${size}px ${HEAD}`; lines = wrapText(ctx, model.name, lw, 2); size -= 4; } while (size > 30 && lines.some((l) => l.endsWith('…')));
        ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,229,255,0.35)'; ctx.shadowBlur = 24;
        const nameTop = 120, lh = (size + 4) * 1.15;
        lines.forEach((l, i) => ctx.fillText(l, lx, nameTop + lh * (i + 1)));
        ctx.shadowBlur = 0;
        let y = nameTop + lh * lines.length + 46;
        ctx.font = `500 20px ${MONO}`; ctx.fillStyle = '#00e5ff';
        const dims = model.dims ? `${model.dims.w}×${model.dims.d}×${model.dims.h}` : '';
        ctx.fillText([`${model.bricks.length} PIECES`, dims, String(model.difficulty || '').toUpperCase()].filter(Boolean).join('  ·  '), lx, y);
        y += 56;
        ctx.font = `italic 500 27px ${BODY}`; ctx.fillStyle = '#cbd5e1';
        for (const l of wrapText(ctx, `“${model.prompt || model.name}”`, lw, 3)) { ctx.fillText(l, lx, y); y += 34; }
        // footer with the brick logo
        const fy = H - 56;
        ctx.fillStyle = '#c91a09'; round(lx, fy - 14, 34, 24, 4); ctx.fill();
        ctx.fillStyle = '#e8321c'; for (const [sx, sy] of [[7, -8], [21, -8]]) { ctx.beginPath(); ctx.arc(lx + sx + 3, fy - 14 + sy + 4, 4.5, 0, Math.PI * 2); ctx.fill(); }
        ctx.font = `800 18px ${HEAD}`; ctx.fillStyle = '#ffffff'; ctx.fillText('STUDFORGE', lx + 46, fy + 4);
        const tw = ctx.measureText('STUDFORGE').width;
        ctx.font = `600 18px ${BODY}`; ctx.fillStyle = '#94a3b8'; ctx.fillText(`·  ${SITE}`, lx + 46 + tw + 12, fy + 4);
        ctx.font = `600 15px ${BODY}`; ctx.fillStyle = '#64748b'; ctx.textAlign = 'right';
        ctx.fillText('3D LEGO® BLUEPRINT & IDEA MAKER  ·  FORGE YOUR OWN', W - 48, fy + 4); ctx.textAlign = 'left';
        return c;
    }
    const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob((b) => res(b), type, q));
    const cardFileName = (model) => `StudForge-${(model.id || 'build').replace(/[^\w-]/g, '')}.png`;
    const downloadBlob = (blob, name) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); };

    /* ── the feature ──────────────────────────────────────────────── */
    function init() {
        const sf = window.studForge;
        if (!sf || sf.__gallery) return;
        sf.__gallery = true;
        const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
        const canStore = store.available();

        // ── share link + card chips in the dock
        const shareBtn = el('button', 'tool-chip', '🔗 SHARE'); shareBtn.title = 'Copy a link to this build';
        const cardBtn = el('button', 'tool-chip', '🖼️ CARD'); cardBtn.title = 'Download a share card image (PNG)';
        sf.dock(shareBtn); sf.dock(cardBtn);
        const currentLink = () => shareLink(sf.state.prompt, sf.state.variant, sf.state.opts);
        const shareText = () => `${sf.model.name} — ${sf.model.bricks.length} pieces, forged from "${sf.state.prompt}" on StudForge`;
        let sharing = false;
        shareBtn.addEventListener('click', async () => {
            if (!sf.model || sharing) return;
            sharing = true;
            try {
                const url = currentLink();
                const copied = await copyText(url);
                flash(shareBtn, copied ? '✓ LINK COPIED' : '🔗 ' + url.slice(0, 24) + '…');
                if (!copied) toast(url);
                // Phones and tablets get the native share sheet too (with the card image when files are allowed).
                if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
                    const data = { title: `StudForge: ${sf.model.name}`, text: shareText(), url };
                    try {
                        const blob = await toBlob(await composeCard(sf), 'image/png');
                        const file = blob && new File([blob], cardFileName(sf.model), { type: 'image/png' });
                        if (file && navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
                    } catch (e) { /* share without the picture */ }
                    try { await navigator.share(data); } catch (e) { if (e && e.name !== 'AbortError') try { await navigator.share({ title: data.title, text: data.text, url }); } catch (e2) { /* the link is on the clipboard already */ } }
                }
            } finally { sharing = false; }
        });
        cardBtn.addEventListener('click', async () => {
            if (!sf.model) return;
            cardBtn.disabled = true; cardBtn.innerHTML = '⚙️ RENDERING…';
            try {
                const blob = await toBlob(await composeCard(sf), 'image/png');
                if (!blob) throw new Error('no blob');
                downloadBlob(blob, cardFileName(sf.model));
                cardBtn.innerHTML = '✓ CARD SAVED';
            } catch (e) { console.error('StudForge card', e); cardBtn.innerHTML = '✗ CARD FAILED'; }
            setTimeout(() => { cardBtn.innerHTML = '🖼️ CARD'; cardBtn.disabled = false; }, 1800);
        });

        // ── gallery data
        const sameBuild = (a, b) => a.prompt === b.prompt && (a.variant | 0) === (b.variant | 0) && JSON.stringify(compactOpts(a.opts)) === JSON.stringify(compactOpts(b.opts));
        let saved = canStore ? (store.get(KEY_GALLERY, []) || []).filter((e) => e && e.prompt) : [];
        let recent = canStore ? (store.get(KEY_RECENT, []) || []).filter((e) => e && e.prompt) : [];
        /** Persist the gallery; on a full quota, shed thumbnails then the oldest builds and try again. */
        const persistSaved = () => {
            if (!canStore) return false;
            if (store.set(KEY_GALLERY, saved)) return true;
            for (let i = saved.length - 1; i >= Math.floor(saved.length / 2); i--) delete saved[i].thumb;
            if (store.set(KEY_GALLERY, saved)) return true;
            while (saved.length > 1) { saved.pop(); if (store.set(KEY_GALLERY, saved)) return true; }
            for (const e of saved) delete e.thumb;
            return store.set(KEY_GALLERY, saved);
        };
        const thumbOf = () => { try { return snapshot(sf.viewer, 160, 120).toDataURL('image/jpeg', 0.7); } catch (e) { return null; } };
        const saveCurrent = () => {
            const m = sf.model; if (!m) return null;
            const entry = { id: m.id, name: m.name, prompt: sf.state.prompt, variant: sf.state.variant | 0, opts: compactOpts(sf.state.opts), pieces: m.bricks.length, dims: m.dims, category: m.category, icon: m.icon, savedAt: Date.now(), thumb: thumbOf() };
            saved = [entry, ...saved.filter((e) => !sameBuild(e, entry))].slice(0, MAX_SAVED);
            persistSaved();
            return entry;
        };
        const noteRecent = (prompt, variant) => {
            recent = [{ prompt, variant: variant | 0, at: Date.now() }, ...recent.filter((r) => !(r.prompt === prompt && (r.variant | 0) === (variant | 0)))].slice(0, MAX_RECENT);
            if (canStore) store.set(KEY_RECENT, recent);
        };

        // ── gallery panel
        const panel = sf.registerPanel({ id: 'gallery', title: '🗂️ GALLERY' });
        const body = panel.body; body.classList.add('sfg-panel');
        const saveBtn = el('button', 'action-btn primary sfg-save', '💾 SAVE TO GALLERY'); saveBtn.id = 'sfg-save';
        const hint = el('div', 'sfg-hint', canStore ? 'Saved builds live in this browser. Tap a card to forge it again; 🔗 copies its link.' : '⚠️ This browser blocks local storage (private mode?), so the gallery can\'t remember builds here. Share links and cards still work.');
        if (!canStore) saveBtn.disabled = true;
        const recentWrap = el('div'), savedWrap = el('div');
        body.append(saveBtn, hint, recentWrap, savedWrap);
        const isCurrent = (e) => sf.state.prompt === e.prompt && (sf.state.variant | 0) === (e.variant | 0) && (e.opts === undefined || JSON.stringify(compactOpts(sf.state.opts)) === JSON.stringify(compactOpts(e.opts)));
        const reforgeEntry = (e) => { sf.setPrompt(e.prompt); sf.forge(e.prompt, e.variant | 0, { ...compactOpts(e.opts) }); };
        function render() {
            recentWrap.innerHTML = '';
            if (recent.length) {
                recentWrap.appendChild(el('div', 'sfg-section', '<h4>⏱️ RECENT</h4><small>LAST 8 IDEAS</small>'));
                const strip = el('div', 'sfg-recent'); strip.id = 'sfg-recent';
                for (const r of recent) {
                    const pill = el('button', 'sfg-recent-pill' + (sf.state.prompt === r.prompt && (sf.state.variant | 0) === (r.variant | 0) ? ' on' : ''));
                    pill.innerHTML = `<span>${esc(r.prompt)}</span>${r.variant ? `<b>V${r.variant + 1}</b>` : ''}`; pill.title = r.prompt;
                    pill.addEventListener('click', () => reforgeEntry({ prompt: r.prompt, variant: r.variant, opts: {} }));
                    strip.appendChild(pill);
                }
                recentWrap.appendChild(strip);
            }
            savedWrap.innerHTML = '';
            savedWrap.appendChild(el('div', 'sfg-section', `<h4>💾 SAVED BUILDS</h4><small>${saved.length ? `${saved.length} / ${MAX_SAVED}` : ''}</small>`));
            if (!saved.length) {
                savedWrap.appendChild(el('div', 'sfg-empty', `<span class="sfg-empty-icon">🗂️</span><b>NOTHING SAVED YET</b>${canStore ? 'Forge something you love, then hit SAVE TO GALLERY to keep it here.' : 'Saving needs local storage, which this browser has switched off.'}`));
                return;
            }
            const grid = el('div', 'sfg-grid'); grid.id = 'sfg-grid';
            saved.forEach((e, idx) => {
                const card = el('div', 'sfg-card' + (isCurrent(e) ? ' on' : '')); card.tabIndex = 0; card.setAttribute('role', 'button'); card.dataset.id = e.id; card.title = `Forge "${e.prompt}" again`;
                card.innerHTML = `<div class="sfg-thumb">${e.thumb ? `<img alt="" src="${e.thumb}">` : `<span>${esc(e.icon || '🧱')}</span>`}</div><div class="sfg-card-body"><div class="sfg-card-name">${esc(e.name)}</div><div class="sfg-card-meta"><b>${e.pieces} PCS</b> · ${ago(e.savedAt)}</div></div>`;
                const actions = el('div', 'sfg-card-actions');
                const link = el('button', 'sfg-icon-btn', '🔗'); link.title = 'Copy share link';
                link.addEventListener('click', async (ev) => { ev.stopPropagation(); const ok = await copyText(shareLink(e.prompt, e.variant, e.opts)); toast(ok ? '✓ LINK COPIED' : shareLink(e.prompt, e.variant, e.opts)); });
                const del = el('button', 'sfg-icon-btn danger', '✕'); del.title = 'Remove from gallery';
                del.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    saved = saved.filter((x) => x !== e); persistSaved(); render();
                    toast('REMOVED FROM GALLERY', { label: 'UNDO', run: () => { saved.splice(Math.min(idx, saved.length), 0, e); persistSaved(); render(); } });
                });
                actions.append(link, del); card.appendChild(actions);
                const go = () => { reforgeEntry(e); if (window.studForgeAudio && window.studForgeAudio.playBrickSnap) try { window.studForgeAudio.playBrickSnap(); } catch (err) { /* muted */ } };
                card.addEventListener('click', go);
                card.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
                grid.appendChild(card);
            });
            savedWrap.appendChild(grid);
        }
        saveBtn.addEventListener('click', () => {
            if (!sf.model) return;
            const e = saveCurrent();
            if (!e) return;
            render();
            flash(saveBtn, '✓ SAVED');
            toast(`💾 ${e.name.toUpperCase()} SAVED`);
        });
        render();

        // ── follow every forge: URL, recent strip, highlight
        sf.on('model', () => {
            syncUrl(sf.state.prompt, sf.state.variant, sf.state.opts);
            noteRecent(sf.state.prompt, sf.state.variant);
            render();
        });
        // Save with Ctrl/Cmd+S while the app has focus (not in the prompt input).
        document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && document.activeElement !== sf.promptInput && canStore) { e.preventDefault(); saveBtn.click(); } });

        // On phones the drawer opens below the fold: bring it into view when it is toggled open.
        const bomToggle = document.getElementById('btn-bom-toggle'), bomCard = document.getElementById('bom-card');
        if (bomToggle && bomCard) bomToggle.addEventListener('click', () => { if (bomCard.classList.contains('open')) setTimeout(() => bomCard.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); });

        sf.gallery = { shareLink: currentLink, composeCard: () => composeCard(sf), save: saveCurrent, list: () => saved.slice(), recent: () => recent.slice(), refresh: render };
    }

    /** On load: a share link forges itself before main.js shows the default inspiration. */
    const onReady = (e) => {
        init();
        const sf = window.studForge, share = parseShare();
        if (!sf || !share) return;
        try {
            sf.setPrompt(share.prompt);
            sf.forge(share.prompt, share.variant, share.opts);
            if (e && e.detail && typeof e.detail === 'object') e.detail.handled = true;
        } catch (err) { console.error('StudForge share link', err); }
    };
    if (window.studForge) onReady(null);
    else document.addEventListener('studforge:ready', onReady, { once: true });
})();
