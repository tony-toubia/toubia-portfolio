// StudForge "Remember & share": every forge gets a share link, a share-card
// image, and a local gallery of saved builds (plus a list of recent ideas).
//
//   Header:  ♡ SAVE (a header action) keeps the current build; the Share menu has
//            "Copy link" and "Download card".
//   Make:    the "My builds" source shows saved builds and recent ideas; opening one
//            loads it and closes Make.
//
//   ?idea=<prompt>&v=<variant>[&o=<base64url JSON opts>]   addresses a forge; the URL
//   follows the current model (replaceState) and is honoured on load.
//   ?ref=<setId>   addresses a real set (reference.js opens it on load).
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
    // A real set shown by reference.js has no idea to re-forge: its address is the set number.
    const refOf = () => { const m = window.studForge && window.studForge.model; return m && m.kind === 'reference' && m.reference ? String(m.reference.setId) : null; };
    const shareQuery = (prompt, variant, opts, ref = null) => {
        if (ref) return `ref=${encodeURIComponent(ref)}`;
        let q = `idea=${encodeURIComponent(prompt)}&v=${variant | 0}`;
        const o = compactOpts(opts);
        if (Object.keys(o).length) q += `&o=${b64url.encode(o)}`;
        return q;
    };
    /** The standalone app URL (works locally and at tonytoubia.com/studforge/index.html, also from inside the portfolio iframe). */
    const shareLink = (prompt, variant, opts, ref) => `${location.origin}${location.pathname}?${shareQuery(prompt, variant, opts, ref)}`;
    const parseShare = () => {
        const sp = new URLSearchParams(location.search);
        const prompt = (sp.get('idea') || '').trim();
        if (!prompt) return null;
        const variant = Math.max(0, parseInt(sp.get('v') || '0', 10) || 0);
        const opts = sp.get('o') ? (b64url.decode(sp.get('o')) || {}) : {};
        return { prompt: prompt.slice(0, 200), variant, opts: compactOpts(opts) };
    };
    /** Keep the address bar in step with the model, leaving other params alone and adding no history entries. */
    const syncUrl = (prompt, variant, opts, ref) => {
        try {
            const sp = new URLSearchParams(location.search);
            sp.delete('idea'); sp.delete('v'); sp.delete('o'); sp.delete('ref');
            const rest = sp.toString();
            history.replaceState(history.state, '', `${location.pathname}?${rest ? rest + '&' : ''}${shareQuery(prompt, variant, opts, ref)}${location.hash}`);
        } catch (e) { /* sandboxed iframe or file:// */ }
    };

    /* ── small UI helpers ─────────────────────────────────────────── */
    const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ago = (t) => { if (!t) return ''; const s = Math.max(0, (Date.now() - t) / 1000); if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; if (s < 86400 * 14) return `${Math.floor(s / 86400)}d ago`; return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
    let toastEl = null, toastTimer = 0;
    /** A toast with a button (UNDO) or a long text (a link the clipboard refused); plain messages use studForge.toast. */
    const toast = (msg, action) => {
        if (!toastEl) { toastEl = el('div', 'sfg-toast'); document.body.appendChild(toastEl); }
        toastEl.innerHTML = `<span>${esc(msg)}</span>`;
        if (action) { const b = el('button', 'sfg-toast-btn', esc(action.label)); b.addEventListener('click', () => { action.run(); hide(); }); toastEl.appendChild(b); }
        toastEl.classList.add('on');
        clearTimeout(toastTimer);
        const hide = () => toastEl.classList.remove('on');
        toastTimer = setTimeout(hide, action ? 6000 : 1800);
    };
    const copyText = async (text) => {
        try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
        try {
            const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'; ta.setAttribute('readonly', '');
            document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
        } catch (e) { return false; }
    };

    const CSS = `
/* ── gallery: Save in the header, Share menu items, the "My builds" source ── */
.sfg-toast { position: fixed; left: 50%; bottom: 24px; z-index: 10061; transform: translate(-50%, 20px); opacity: 0; pointer-events: none; display: flex; align-items: center; gap: 12px; padding: 6px 8px 6px 16px; border-radius: 999px; background: #1b2231; border: 1px solid var(--border-active); color: #fff; font-family: var(--font-body); font-size: 14px; font-weight: 600; transition: opacity .2s, transform .2s; max-width: calc(100vw - 32px); }
.sfg-toast span { min-width: 0; overflow-wrap: anywhere; }
.sfg-toast.on { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
.sfg-toast-btn { background: var(--lego-yellow); color: #0c0f17; border: none; border-radius: 999px; min-height: 28px; padding: 0 12px; font-family: var(--font-heading); font-size: 9px; font-weight: 800; letter-spacing: .8px; cursor: pointer; }
#sfg-save .nb-ico { font-size: 14px; line-height: 1; }
#sfg-save.on { border-color: rgba(242,205,55,.55); color: var(--lego-yellow); }
#sfg-save.on .nb-ico { color: var(--lego-yellow); }
#sfg-save:disabled { opacity: .45; cursor: not-allowed; }
#sfg-save.pop .nb-ico { animation: sfg-pop .35s ease; }
@keyframes sfg-pop { 40% { transform: scale(1.45); } }
.sfg-src { display: flex; flex-direction: column; gap: 14px; }
.sfg-h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.sfg-h b { font-family: var(--font-heading); font-size: 9px; letter-spacing: 1.3px; color: var(--text-muted); font-weight: 700; }
.sfg-h small { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); }
.sfg-hint { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
.sfg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.sfg-card { position: relative; display: flex; flex-direction: column; background: var(--bg-main); border: 1px solid var(--border-main); border-radius: 10px; overflow: hidden; cursor: pointer; text-align: left; padding: 0; color: inherit; font: inherit; transition: border-color .15s ease; min-width: 0; }
.sfg-card:hover, .sfg-card:focus-visible { border-color: var(--lego-yellow); outline: none; }
.sfg-card.on { border-color: rgba(242,205,55,.6); }
.sfg-thumb { width: 100%; aspect-ratio: 4 / 3; background: #0e121a; display: flex; align-items: center; justify-content: center; font-size: 30px; }
.sfg-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sfg-card-body { padding: 7px 9px 8px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sfg-card-name { font-family: var(--font-body); font-size: 14px; font-weight: 700; color: #fff; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sfg-card-meta { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sfg-card-meta b { color: var(--lego-yellow); font-weight: 700; }
.sfg-card-cur { position: absolute; top: 6px; left: 6px; background: var(--lego-yellow); color: #0c0f17; font-family: var(--font-heading); font-size: 8px; font-weight: 800; letter-spacing: .8px; padding: 2px 6px; border-radius: 999px; }
.sfg-card-actions { position: absolute; top: 5px; right: 5px; display: flex; gap: 4px; opacity: 0; transition: opacity .15s ease; }
.sfg-card:hover .sfg-card-actions, .sfg-card:focus-within .sfg-card-actions { opacity: 1; }
@media (hover: none) { .sfg-card-actions { opacity: 1; } }
.sfg-icon-btn { width: 28px; height: 28px; border-radius: 7px; border: 1px solid rgba(255,255,255,.14); background: rgba(12,15,23,.85); color: #fff; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.sfg-icon-btn:hover { border-color: var(--lego-yellow); }
.sfg-icon-btn.danger:hover { border-color: var(--lego-red); color: #ff8a80; }
.sfg-recent { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px; }
.sfg-recent-item { display: flex; align-items: center; gap: 9px; min-height: 38px; padding: 6px 10px; border-radius: 9px; border: 1px solid var(--border-main); background: var(--bg-main); color: var(--text-primary); cursor: pointer; text-align: left; font-family: var(--font-body); min-width: 0; }
.sfg-recent-item:hover { border-color: var(--lego-yellow); }
.sfg-recent-item.on { border-color: rgba(242,205,55,.6); }
.sfg-recent-item .ri-ico { flex: none; font-size: 13px; opacity: .7; }
.sfg-recent-item .ri-main { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sfg-recent-item .ri-meta { flex: none; font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); white-space: nowrap; }
.sfg-recent-item .ri-meta b { color: var(--lego-yellow); font-weight: 700; margin-right: 5px; }
.sfg-empty { border: 1px dashed rgba(255,255,255,.14); border-radius: 10px; padding: 16px 14px; text-align: center; color: var(--text-muted); font-size: 13px; line-height: 1.45; }
.sfg-empty b { display: block; font-family: var(--font-heading); font-size: 10px; letter-spacing: 1px; color: var(--text-secondary); margin-bottom: 4px; }
.sfg-empty .sfg-empty-icon { font-size: 24px; display: block; margin-bottom: 4px; }
@media (max-width: 767px) {
  .sfg-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sfg-recent { grid-template-columns: 1fr; }
  .sfg-toast { bottom: calc(var(--tabbar-h, 58px) + env(safe-area-inset-bottom, 0px) + 76px); }
}
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
        const quote = model.kind === 'reference' && model.reference ? `Real set ${model.reference.setId}, rebuilt from its LDraw OMR file (CC BY, LDraw.org)` : `“${model.prompt || model.name}”`;
        for (const l of wrapText(ctx, quote, lw, 3)) { ctx.fillText(l, lx, y); y += 34; }
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
        const say = (msg) => (sf.toast ? sf.toast(msg) : toast(msg));

        // ── Share menu: copy the link, download the card
        const currentLink = () => shareLink(sf.state.prompt, sf.state.variant, sf.state.opts, refOf());
        const shareText = () => (refOf() ? `${sf.model.name} (set ${refOf()}) — ${sf.model.bricks.length} pieces, a real set to build step by step on StudForge` : `${sf.model.name} — ${sf.model.bricks.length} pieces, forged from "${sf.state.prompt}" on StudForge`);
        let sharing = false;
        const copyLink = async () => {
            if (!sf.model || sharing) return;
            sharing = true;
            try {
                const url = currentLink();
                const copied = await copyText(url);
                if (copied) say('Link copied. Anyone can open this build.'); else toast(url);
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
        };
        let rendering = false;
        const downloadCard = async () => {
            if (!sf.model || rendering) return;
            rendering = true;
            say('Rendering the card…');
            try {
                const blob = await toBlob(await composeCard(sf), 'image/png');
                if (!blob) throw new Error('no blob');
                downloadBlob(blob, cardFileName(sf.model));
                say('Card downloaded');
            } catch (e) { console.error('StudForge card', e); say('The card could not be made in this browser'); }
            finally { rendering = false; }
        };
        if (sf.shareItem) {
            sf.shareItem({ id: 'copy-link', icon: '🔗', label: 'Copy link', hint: 'Anyone can open this build', order: 10, onClick: copyLink });
            sf.shareItem({ id: 'card', icon: '🖼️', label: 'Download card', hint: 'A PNG to post', order: 20, onClick: downloadCard });
        }

        // ── gallery data
        // A real set is addressed by its set number alone; an idea by its prompt, variant and options.
        const sameBuild = (a, b) => ((a.ref || b.ref) ? (a.ref || null) === (b.ref || null) : a.prompt === b.prompt && (a.variant | 0) === (b.variant | 0) && JSON.stringify(compactOpts(a.opts)) === JSON.stringify(compactOpts(b.opts)));
        let saved = canStore ? (store.get(KEY_GALLERY, []) || []).filter((e) => e && (e.prompt || e.ref)) : [];
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
        const thumbOf = () => { try { return snapshot(sf.viewer, 200, 150).toDataURL('image/jpeg', 0.72); } catch (e) { return null; } };
        const pieceCount = (m) => m.bricks.reduce((n, b) => n + (b.segment ? 0 : 1), 0);
        const currentKey = () => ({ prompt: sf.state.prompt, variant: sf.state.variant | 0, opts: compactOpts(sf.state.opts), ref: refOf() || undefined });
        const isCurrent = (e) => !!sf.model && sameBuild(e, currentKey());
        const savedIndex = () => saved.findIndex(isCurrent);
        const saveCurrent = () => {
            const m = sf.model; if (!m) return null;
            const entry = { id: m.id, name: m.name, prompt: sf.state.prompt, variant: sf.state.variant | 0, opts: compactOpts(sf.state.opts), pieces: pieceCount(m), dims: m.dims, category: m.category, icon: m.icon, savedAt: Date.now(), thumb: thumbOf() };
            if (refOf()) entry.ref = refOf();
            saved = [entry, ...saved.filter((e) => !sameBuild(e, entry))].slice(0, MAX_SAVED);
            persistSaved();
            return entry;
        };
        const noteRecent = () => {
            if (refOf() || !sf.state.prompt) return;   // recent is ideas; a real set lives in Real sets
            const m = sf.model, prompt = sf.state.prompt, variant = sf.state.variant | 0;
            recent = [{ prompt, variant, at: Date.now(), name: m && m.name, icon: m && m.icon }, ...recent.filter((r) => !(r.prompt === prompt && (r.variant | 0) === variant))].slice(0, MAX_RECENT);
            if (canStore) store.set(KEY_RECENT, recent);
        };

        // ── ♡ SAVE in the header
        const saveBtn = el('button', '', '<span class="nb-ico">♡</span><span class="nb-label">SAVE</span>');
        saveBtn.id = 'sfg-save'; saveBtn.type = 'button';
        const paintSave = () => {
            const on = savedIndex() >= 0;
            saveBtn.classList.toggle('on', on);
            saveBtn.innerHTML = `<span class="nb-ico">${on ? '♥' : '♡'}</span><span class="nb-label">${on ? 'SAVED' : 'SAVE'}</span>`;
            saveBtn.title = !canStore ? 'Saving needs local storage, which this browser has switched off' : on ? 'Saved in My builds' : 'Save to My builds (Ctrl+S)';
            saveBtn.setAttribute('aria-pressed', String(on));
        };
        if (!canStore) saveBtn.disabled = true;
        const doSave = () => {
            if (!sf.model || !canStore) return;
            if (savedIndex() >= 0) { say('Already saved in My builds'); return; }
            const e = saveCurrent(); if (!e) return;
            paintSave();
            saveBtn.classList.remove('pop'); void saveBtn.offsetWidth; saveBtn.classList.add('pop');
            say('Saved to My builds');
            if (window.studForgeAudio && window.studForgeAudio.playBrickSnap) try { window.studForgeAudio.playBrickSnap(); } catch (err) { /* muted */ }
            if (showing()) render();
        };
        saveBtn.addEventListener('click', doSave);
        if (sf.headerAction) sf.headerAction(saveBtn);
        paintSave();

        // ── the "My builds" source in Make
        const src = sf.addSource({ id: 'gallery', icon: '🗂️', label: 'My builds', hint: 'Recent and saved', order: 30 });
        const body = src.body; body.classList.add('sfg-src');
        const showing = () => !body.hidden;
        const openEntry = (e) => {
            if (e.ref && sf.reference) sf.reference.load(e.ref);
            else { sf.setPrompt(e.prompt); sf.forge(e.prompt, e.variant | 0, { ...compactOpts(e.opts) }); }
            if (sf.closeMake) sf.closeMake();
            if (window.studForgeAudio && window.studForgeAudio.playBrickSnap) try { window.studForgeAudio.playBrickSnap(); } catch (err) { /* muted */ }
        };
        function render() {
            body.innerHTML = '';
            // Saved builds first: they are what people come back for.
            const savedWrap = el('div');
            savedWrap.appendChild(el('div', 'sfg-h', `<b>♥ SAVED</b><small>${saved.length ? `${saved.length} of ${MAX_SAVED}` : ''}</small>`));
            if (!saved.length) {
                savedWrap.appendChild(el('div', 'sfg-empty', `<span class="sfg-empty-icon">🗂️</span><b>NOTHING SAVED YET</b>${canStore ? 'When you like a build, tap ♡ SAVE at the top to keep it here.' : 'Saving needs local storage, which this browser has switched off. Share links still work.'}`));
            } else {
                const grid = el('div', 'sfg-grid'); grid.id = 'sfg-grid';
                saved.forEach((e, idx) => {
                    const cur = isCurrent(e);
                    const card = el('div', 'sfg-card' + (cur ? ' on' : '')); card.tabIndex = 0; card.setAttribute('role', 'button'); card.dataset.id = e.id || '';
                    card.title = e.ref ? `Build the real set ${e.ref} again` : `Open "${e.prompt}"`;
                    card.innerHTML = `<div class="sfg-thumb">${e.thumb ? `<img alt="" src="${e.thumb}">` : `<span>${esc(e.icon || '🧱')}</span>`}</div><div class="sfg-card-body"><div class="sfg-card-name">${esc(e.name || e.prompt)}</div><div class="sfg-card-meta"><b>${e.pieces | 0} pcs</b> · ${ago(e.savedAt)}</div></div>${cur ? '<span class="sfg-card-cur">OPEN</span>' : ''}`;
                    const actions = el('div', 'sfg-card-actions');
                    const link = el('button', 'sfg-icon-btn', '🔗'); link.type = 'button'; link.title = 'Copy link'; link.setAttribute('aria-label', 'Copy link');
                    link.addEventListener('click', async (ev) => { ev.stopPropagation(); const url = shareLink(e.prompt, e.variant, e.opts, e.ref); const ok = await copyText(url); if (ok) say('Link copied'); else toast(url); });
                    const del = el('button', 'sfg-icon-btn danger', '✕'); del.type = 'button'; del.title = 'Remove from My builds'; del.setAttribute('aria-label', 'Remove');
                    del.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        saved = saved.filter((x) => x !== e); persistSaved(); render(); paintSave();
                        toast('Removed from My builds', { label: 'UNDO', run: () => { saved.splice(Math.min(idx, saved.length), 0, e); persistSaved(); render(); paintSave(); } });
                    });
                    actions.append(link, del); card.appendChild(actions);
                    card.addEventListener('click', () => openEntry(e));
                    card.addEventListener('keydown', (ev) => { if (ev.target === card && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openEntry(e); } });
                    grid.appendChild(card);
                });
                savedWrap.appendChild(grid);
            }
            body.appendChild(savedWrap);
            if (recent.length) {
                const recentWrap = el('div');
                recentWrap.appendChild(el('div', 'sfg-h', `<b>🕘 RECENT</b><small>last ${MAX_RECENT} ideas</small>`));
                const list = el('div', 'sfg-recent'); list.id = 'sfg-recent';
                for (const r of recent) {
                    const on = sf.state.prompt === r.prompt && (sf.state.variant | 0) === (r.variant | 0) && !refOf();
                    const item = el('button', 'sfg-recent-item' + (on ? ' on' : '')); item.type = 'button'; item.title = r.prompt;
                    item.innerHTML = `<span class="ri-ico">${esc(r.icon || '🕘')}</span><span class="ri-main">${esc(r.name || r.prompt)}</span><span class="ri-meta">${r.variant ? `<b>v${(r.variant | 0) + 1}</b>` : ''}${ago(r.at)}</span>`;
                    item.addEventListener('click', () => openEntry({ prompt: r.prompt, variant: r.variant, opts: {} }));
                    list.appendChild(item);
                }
                recentWrap.appendChild(list);
                body.appendChild(recentWrap);
            }
            body.appendChild(el('div', 'sfg-hint', canStore ? 'Builds are kept in this browser. 🔗 copies a link anyone can open.' : 'This browser blocks local storage (private mode?), so builds are not remembered here.'));
        }
        sf.on('source', (id) => { if (id === 'gallery') render(); });

        // ── follow every model: the address bar, recent, the Save heart
        sf.on('model', () => {
            syncUrl(sf.state.prompt, sf.state.variant, sf.state.opts, refOf());
            noteRecent();
            paintSave();
            if (showing()) render();
        });
        // Save with Ctrl/Cmd+S while the app has focus (not while typing in the prompt).
        document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && document.activeElement !== sf.promptInput && canStore) { e.preventDefault(); doSave(); } });

        sf.gallery = { shareLink: currentLink, composeCard: () => composeCard(sf), save: saveCurrent, list: () => saved.slice(), recent: () => recent.slice(), refresh: () => { paintSave(); render(); }, copyLink, downloadCard, show: () => sf.showPanel('gallery'), isSaved: () => savedIndex() >= 0 };
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
