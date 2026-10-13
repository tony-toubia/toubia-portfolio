// StudForge feature: build instructions you can follow.
//
//  1. In step mode the pieces added by the current step glow and older ones dim a touch,
//     so the 3D view reads like an instruction page.
//  2. A "STEP BY STEP" section in the Build tab: the current step (synced with the canvas
//     scrubber, the one step control), the pieces it adds, and every step to jump to. A real
//     set's steps carry their sub-assembly names (also on the phone sheet's peek line).
//  3. A printable booklet (cover + one page per step with a render and a parts table),
//     opened from the section's "Instructions booklet" button or the PRINT LIST button.
//
// Everything is prefixed `sfi-` and hangs off window.studForge; viewer.js is untouched.
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    /* ── theme ──────────────────────────────────────────────────── */
    const CSS = `
/* the Build tab's STEP BY STEP section */
.sfi-cur-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.sfi-num { font-family: var(--font-heading); font-size: 17px; font-weight: 800; color: #fff; letter-spacing: 0.8px; white-space: nowrap; }
.sfi-num span { font-size: 11px; color: var(--text-muted); font-weight: 700; letter-spacing: 0.5px; }
.sfi-added { font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.sfi-added b { color: var(--lego-yellow); font-weight: 700; }
.sfi-name { margin-top: 4px; font-size: 14px; font-weight: 700; color: var(--lego-yellow); line-height: 1.25; }
.sfi-progress { height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; margin: 9px 0 12px; }
.sfi-progress i { display: block; height: 100%; background: var(--lego-yellow); transition: width 0.2s ease; }
.sfi-k { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-family: var(--font-heading); font-size: 9px; letter-spacing: 1.2px; color: var(--text-muted); font-weight: 700; margin: 0 0 7px; }
.sfi-k small { font-family: var(--font-body); font-size: 12px; letter-spacing: 0; font-weight: 500; }
.sfi-adds { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; }
.sfi-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 3px 8px 3px 6px; border-radius: 7px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-main); font-size: 13px; font-weight: 600; color: #e2e8f0; line-height: 1.3; }
.sfi-chip i { width: 11px; height: 11px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); flex: none; }
.sfi-chip span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sfi-chip b { font-family: var(--font-mono); font-size: 11px; color: var(--lego-yellow); flex: none; }
.sfi-empty { color: var(--text-muted); font-size: 13px; }
.sfi-booklet-btn { margin: 0 0 14px; min-height: 36px; font-size: 10px; }
.sfi-booklet-btn small { font-family: var(--font-body); font-size: 12px; font-weight: 500; letter-spacing: 0; color: var(--text-secondary); }
.sfi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 4px; }
.sfi-tile { position: relative; min-height: 38px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 3px 0; border-radius: 6px; border: 1px solid var(--border-main); background: rgba(255,255,255,0.03); color: var(--text-secondary); cursor: pointer; font-family: var(--font-mono); line-height: 1; }
.sfi-tile b { font-size: 12px; font-weight: 700; }
.sfi-tile em { font-style: normal; font-size: 9px; color: var(--text-muted); }
.sfi-tile:hover { border-color: rgba(242,205,55,0.5); color: #fff; }
.sfi-tile.done { background: rgba(242,205,55,0.07); color: #cbd5e1; }
.sfi-tile.done em { color: rgba(242,205,55,0.55); }
.sfi-tile.on { background: var(--lego-yellow); border-color: var(--lego-yellow); color: #0c0f17; box-shadow: 0 0 0 2px rgba(242,205,55,0.25); }
.sfi-tile.on em { color: rgba(12,15,23,0.7); }
.sfi-tile.named::after { content: ''; position: absolute; top: 3px; right: 3px; width: 4px; height: 4px; border-radius: 50%; background: #00e5ff; opacity: 0.7; }
.sfi-glabel { grid-column: 1 / -1; font-size: 12px; font-weight: 700; color: var(--text-secondary); margin: 6px 0 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sfi-glabel:first-child { margin-top: 0; }
@media (max-width: 767px) { .sfi-grid { grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); } .sfi-tile { min-height: 40px; } }
.sfi-btn { background: rgba(255,255,255,0.08); border: 1px solid var(--border-main); color: var(--text-primary); font-family: var(--font-heading); font-size: 9px; font-weight: 700; padding: 6px 9px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
.sfi-btn:hover { background: rgba(255,255,255,0.15); border-color: var(--lego-yellow); }
.sfi-btn.primary { background: linear-gradient(135deg, var(--lego-yellow) 0%, #d4a017 100%); color: #0c0f17; border: none; }

/* the booklet overlay: dark on white, so it prints as it looks */
.sfi-booklet { position: fixed; inset: 0; z-index: 10000; background: #e9ecf1; color: #111827; overflow-y: auto; -webkit-overflow-scrolling: touch; font-family: var(--font-body); display: none; }
.sfi-booklet.open { display: block; }
body.sfi-booklet-open { overflow: hidden; }
body.sfi-booklet-open .top-nav, body.sfi-booklet-open .app-layout { display: none !important; }
.sfi-bar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 14px; background: #0c0f17; color: #fff; border-bottom: 2px solid var(--lego-yellow); }
.sfi-bar .sfi-brand { display: flex; align-items: center; gap: 8px; font-family: var(--font-heading); font-size: 13px; font-weight: 900; letter-spacing: 1.5px; }
.sfi-bar .sfi-brand span { font-size: 9px; color: var(--lego-yellow); letter-spacing: 1px; font-weight: 600; display: block; }
.sfi-bar .sfi-actions { display: flex; gap: 6px; }
.sfi-bar .sfi-btn { padding: 7px 12px; font-size: 10px; }
.sfi-pages { max-width: 760px; margin: 0 auto; padding: 16px 12px 40px; }
.sfi-page { background: #fff; border: 1px solid #d6dae2; border-radius: 10px; padding: 24px 26px; margin-bottom: 16px; box-shadow: 0 4px 18px rgba(15,23,42,0.08); }
.sfi-logo { display: inline-grid; grid-template-columns: 1fr 1fr; gap: 2px; width: 22px; height: 22px; padding: 3px; background: var(--lego-red); border-radius: 3px; vertical-align: middle; }
.sfi-logo s { background: #e62310; border-radius: 50%; display: block; }
.sfi-cover-brand { font-family: var(--font-heading); font-size: 11px; font-weight: 900; letter-spacing: 2px; color: #334155; display: flex; align-items: center; gap: 8px; margin-bottom: 18px; }
.sfi-cover h1 { font-family: var(--font-heading); font-size: 28px; font-weight: 900; letter-spacing: 1px; color: #0c0f17; line-height: 1.15; margin: 0 0 6px; }
.sfi-cover p.sfi-desc { font-size: 16px; color: #475569; margin: 0 0 14px; }
.sfi-facts { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.sfi-fact { border: 1px solid #cbd5e1; border-radius: 12px; padding: 4px 10px; font-family: var(--font-heading); font-size: 10px; font-weight: 700; letter-spacing: 0.5px; color: #334155; }
.sfi-fact.hi { background: #fef3c7; border-color: #f2cd37; color: #78350f; }
.sfi-img { display: block; width: 100%; max-width: 560px; margin: 0 auto 14px; border-radius: 8px; border: 1px solid #d6dae2; background: #eef1f6; }
.sfi-page h2 { font-family: var(--font-heading); font-size: 11px; letter-spacing: 1.5px; color: #64748b; margin: 16px 0 6px; text-transform: uppercase; }
.sfi-step-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; border-bottom: 2px solid #0c0f17; padding-bottom: 6px; margin-bottom: 14px; }
.sfi-step-head h1 { font-family: var(--font-heading); font-size: 26px; font-weight: 900; color: #0c0f17; margin: 0; line-height: 1; }
.sfi-step-head span { font-family: var(--font-mono); font-size: 12px; color: #475569; font-weight: 700; white-space: nowrap; }
.sfi-ptable { width: 100%; border-collapse: collapse; font-size: 13px; }
.sfi-ptable th { text-align: left; font-family: var(--font-heading); font-size: 9px; letter-spacing: 1px; color: #64748b; padding: 6px 6px; border-bottom: 1px solid #cbd5e1; }
.sfi-ptable td { padding: 6px 6px; border-bottom: 1px solid #e2e8f0; color: #111827; vertical-align: middle; }
.sfi-ptable th.q { text-align: right; }
.sfi-ptable td.q { text-align: right; font-family: var(--font-mono); font-weight: 700; white-space: nowrap; }
.sfi-ptable td.m { font-family: var(--font-mono); font-size: 11px; color: #64748b; white-space: nowrap; }
.sfi-dot { display: inline-block; width: 13px; height: 13px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.3); vertical-align: -2px; margin-right: 7px; }
.sfi-cols { columns: 2; column-gap: 24px; }
.sfi-cols .sfi-ptable tr { break-inside: avoid; }
.sfi-foot-note { font-size: 11px; color: #94a3b8; text-align: center; margin-top: 10px; }
.sfi-busy { position: fixed; inset: 0; z-index: 10001; display: flex; align-items: center; justify-content: center; background: rgba(12,15,23,0.75); color: var(--lego-yellow); font-family: var(--font-heading); font-size: 13px; letter-spacing: 1.5px; }
.sfi-booklet:focus { outline: none; }
@media (max-width: 600px) {
    .sfi-page { padding: 16px 14px; border-radius: 8px; }
    .sfi-cover h1 { font-size: 22px; }
    .sfi-cols { columns: 1; }
    .sfi-ptable .m { display: none; }
    .sfi-pages { padding: 10px 8px 30px; }
}
@media print {
    body.sfi-booklet-open .top-nav, body.sfi-booklet-open .app-layout, body.sfi-booklet-open .back-to-home, body.sfi-booklet-open .sfi-bar { display: none !important; }
    html, body.sfi-booklet-open { overflow: visible !important; height: auto !important; }
    .sfi-booklet { position: static !important; display: block !important; overflow: visible !important; background: #fff !important; }
    .sfi-pages { max-width: none; padding: 0; }
    .sfi-page { border: none; box-shadow: none; border-radius: 0; padding: 0 0 20px; margin: 0; break-after: page; page-break-after: always; }
    .sfi-page:last-child { break-after: auto; page-break-after: auto; }
    .sfi-img { max-width: 480px; }
}
`;

    function injectCss() {
        const s = document.createElement('style');
        s.id = 'sfi-style';
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    /* ── helpers ────────────────────────────────────────────────── */
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const colorOf = (key) => window.LEGO_COLORS[key] || { name: key, hex: '#cccccc' };
    const partOf = (id) => window.LEGO_PARTS[id] || (window.BrickBuilder && window.BrickBuilder.partInfo(id)) || { name: `Element ${id}`, category: 'Standard' };

    /** Parts grouped per build step, from the viewer's meshes (their `layer` is the step index). */
    function stepParts(viewer) {
        const steps = [];
        for (let i = 0; i <= viewer.maxLayer; i++) steps.push({ index: i, count: 0, parts: new Map() });
        for (const m of viewer.brickMeshes) {
            if (m.userData.segment) continue;
            const st = steps[m.userData.layer || 0];
            if (!st) continue;
            st.count++;
            const key = `${m.userData.partId}_${m.userData.colorKey}`;
            if (!st.parts.has(key)) {
                const c = colorOf(m.userData.colorKey), p = partOf(m.userData.geometryId || m.userData.partId);
                st.parts.set(key, { partId: m.userData.partId, partName: p.name, colorKey: m.userData.colorKey, colorName: c.name, colorHex: c.hex, quantity: 0 });
            }
            st.parts.get(key).quantity++;
        }
        for (const st of steps) st.rows = [...st.parts.values()].sort((a, b) => b.quantity - a.quantity || a.partName.localeCompare(b.partName));
        return steps;
    }

    function init() {
        const sf = window.studForge;
        if (!sf || !sf.viewer || !window.THREE) return;
        const viewer = sf.viewer;
        injectCss();

        /* ── 1. highlight the current step's pieces ────────────────── */
        // Materials are shared per colour, so we swap in cloned variants and remember the original on the mesh.
        const hiCache = new Map(), dimCache = new Map(), printCache = new Map();
        const glowFor = (base) => {
            if (!hiCache.has(base)) {
                const m = base.clone();
                // A warm self-lit tint: the new pieces pop without losing their colour.
                m.emissive = base.color.clone().lerp(new THREE.Color(0xfff2a8), 0.35);
                m.emissiveIntensity = 0.55;
                m.userData.sfiGlow = true;
                hiCache.set(base, m);
            }
            return hiCache.get(base);
        };
        // On the booklet's light pages a glow is hard to see, so new pieces get a frank yellow tint there.
        const printGlowFor = (base) => {
            if (!printCache.has(base)) {
                const m = base.clone();
                m.emissive = new THREE.Color(0xffc400);
                m.emissiveIntensity = 0.25;
                m.userData.sfiGlow = true;
                printCache.set(base, m);
            }
            return printCache.get(base);
        };
        const dimFor = (base) => {
            if (!dimCache.has(base)) {
                const m = base.clone();
                m.color = base.color.clone().lerp(new THREE.Color(0x1a2030), 0.28);
                m.userData.sfiDim = true;
                dimCache.set(base, m);
            }
            return dimCache.get(base);
        };
        // ...and the pieces already placed are ghosted toward the page colour, so the new ones carry the colour.
        const printDimFor = (base) => {
            const key = 'dim:' + base.uuid;
            if (!printCache.has(key)) {
                const m = base.clone();
                m.color = base.color.clone().lerp(new THREE.Color(0xd9dee6), 0.4);
                m.userData.sfiDim = true;
                printCache.set(key, m);
            }
            return printCache.get(key);
        };
        const baseOf = (mesh) => mesh.userData.sfiBase || (mesh.userData.sfiBase = mesh.material);

        /** Apply the step look (step index, or null for the plain model); `print` picks the booklet variant. */
        function applyHighlight(step, print = false) {
            // The last step is the finished model in the viewer, but its page in the booklet still lights its pieces.
            const top = step == null || (!print && step >= viewer.maxLayer);
            for (const mesh of viewer.brickMeshes) {
                const base = baseOf(mesh), layer = mesh.userData.layer || 0;
                let mat = base, mark = false;
                if (!top) {
                    if (layer === step) { mat = print ? printGlowFor(base) : glowFor(base); mark = true; }
                    else if (layer < step) mat = print ? printDimFor(base) : dimFor(base);
                }
                if (mesh.material !== mat) mesh.material = mat;
                mesh.userData.sfiHighlighted = mark;
            }
        }
        const restoreHighlight = () => applyHighlight(null);

        /* ── 2. the STEP BY STEP section (Build tab) ───────────────── */
        // The canvas scrubber is the one step control; this section follows it, says what the
        // current step adds, and lists every step to jump to.
        let steps = [];
        let current = 0;
        let names = [];          // sub-assembly name per step (real sets), or null
        const panel = sf.registerPanel({ id: 'steps', title: 'STEP BY STEP', group: 'build', order: 10 });
        const body = panel.body;
        body.innerHTML = `
            <div class="sfi-cur">
                <div class="sfi-cur-top"><div class="sfi-num" id="sfi-num">Step 1 <span>of 1</span></div><div class="sfi-added" id="sfi-added"></div></div>
                <div class="sfi-name" id="sfi-name" hidden></div>
                <div class="sfi-progress"><i id="sfi-bar"></i></div>
            </div>
            <div class="sfi-k">THIS STEP ADDS</div>
            <div class="sfi-adds" id="sfi-parts"></div>
            <button class="action-btn secondary sfi-booklet-btn" id="sfi-booklet-btn" type="button" title="Every step on its own page, ready to print or save as a PDF">📘 Instructions booklet <small>print or PDF</small></button>
            <div class="sfi-k">ALL STEPS <small>tap one to jump to it</small></div>
            <div class="sfi-grid" id="sfi-list"></div>`;
        const numEl = body.querySelector('#sfi-num'), addedEl = body.querySelector('#sfi-added'), barEl = body.querySelector('#sfi-bar'), nameEl = body.querySelector('#sfi-name');
        const partsEl = body.querySelector('#sfi-parts'), listEl = body.querySelector('#sfi-list');

        body.querySelector('#sfi-booklet-btn').addEventListener('click', () => openBooklet());
        listEl.addEventListener('click', (e) => { const r = e.target.closest('.sfi-tile'); if (r) sf.goStep(+r.dataset.step); });

        /** Sub-assembly names per step for a real set (from its bricks' `sub`), null where it builds the main model. */
        const prettySub = (name) => {
            const parts = String(name).replace(/\.(ldr|dat|mpd)$/i, '').replace(/^\d+(-\d+)?\s*[-–]\s*/, '').split(/\s+[-–]\s+/);
            const s = (parts.length > 1 ? parts.slice(1) : parts).join(' ').replace(/[_-]+/g, ' ').replace(/([a-z])(\d+)$/i, '$1 $2').trim();
            return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
        };
        function stepNames(model) {
            if (!model || !model.bricks.some((b) => b.sub != null)) return [];
            const subs = Array.isArray(model.submodels) ? model.submodels : [];
            const layers = [...new Set(model.bricks.map((b) => b.layer || 0))].sort((a, b) => a - b);
            const at = new Map(layers.map((l, i) => [l, i]));
            const nameOf = (b) => (typeof b.sub === 'string' ? b.sub : subs[b.sub]);
            // A sub-model holding most of the set is the model itself: not worth naming.
            const size = new Map();
            for (const b of model.bricks) if (b.sub != null) size.set(nameOf(b), (size.get(nameOf(b)) || 0) + 1);
            const per = layers.map(() => new Map());
            for (const b of model.bricks) {
                if (b.sub == null) continue;
                const name = nameOf(b);
                if (!name || b.sub === 0 || name === subs[0] || /^main\b/i.test(name) || size.get(name) >= model.bricks.length * 0.5) continue;
                const m = per[at.get(b.layer || 0)];
                m.set(name, (m.get(name) || 0) + 1);
            }
            const out = per.map((m) => (m.size ? prettySub([...m.entries()].sort((a, b) => b[1] - a[1])[0][0]) || null : null));
            return out.some(Boolean) ? out : [];
        }
        const nameAt = (i) => names[i] || null;

        function renderList() {
            let html = '', last;
            const grouped = names.length > 0;
            steps.forEach((s) => {
                const n = nameAt(s.index);
                if (grouped && n !== last) { html += `<div class="sfi-glabel">${n ? `⚙️ ${esc(n)}` : '🏗️ Main model'}</div>`; last = n; }
                html += `<button class="sfi-tile${n ? ' named' : ''}" type="button" data-step="${s.index}" title="Step ${s.index + 1}${n ? ` · ${esc(n)}` : ''} · +${s.count} piece${s.count === 1 ? '' : 's'}" aria-label="Step ${s.index + 1}"><b>${s.index + 1}</b><em>+${s.count}</em></button>`;
            });
            listEl.innerHTML = html;
        }
        const chips = (rows) => rows.map((p) => `<span class="sfi-chip" title="${esc(p.partName)} · ${esc(p.colorName)} · #${esc(p.partId)}"><i style="background:${p.colorHex}"></i><span>${esc(p.partName)}</span><b>×${p.quantity}</b></span>`).join('');
        /** Keep the current tile in view, but only while the step list itself is on screen (never scroll the page). */
        function followTile(tile) {
            const sc = body.closest('.tab-scroll');
            if (!sc || !tile || !sc.offsetParent || !sc.clientHeight) return;
            const s = sc.getBoundingClientRect(), g = listEl.getBoundingClientRect(), r = tile.getBoundingClientRect();
            if (g.bottom < s.top || g.top > s.bottom) return;
            if (r.top < s.top) sc.scrollTop -= s.top - r.top + 8;
            else if (r.bottom > s.bottom) sc.scrollTop += r.bottom - s.bottom + 8;
        }
        function renderCurrent(follow) {
            const st = steps[current] || { count: 0, rows: [] };
            const n = steps.length || 1;
            const placed = steps.slice(0, current + 1).reduce((k, s) => k + s.count, 0), total = steps.reduce((k, s) => k + s.count, 0);
            numEl.innerHTML = `Step ${current + 1} <span>of ${n}</span>`;
            addedEl.innerHTML = `<b>+${st.count}</b> · ${placed} of ${total} placed`;
            const name = nameAt(current);
            nameEl.hidden = !name; nameEl.textContent = name ? `⚙️ ${name}` : '';
            barEl.style.width = `${Math.round(((current + 1) / n) * 100)}%`;
            partsEl.innerHTML = st.rows.length ? chips(st.rows) : '<span class="sfi-empty">Nothing in this step.</span>';
            let onTile = null;
            for (const r of listEl.querySelectorAll('.sfi-tile')) {
                const i = +r.dataset.step;
                r.classList.toggle('on', i === current);
                r.classList.toggle('done', i < current);
                if (i === current) { onTile = r; r.setAttribute('aria-current', 'step'); } else r.removeAttribute('aria-current');
            }
            if (follow) followTile(onTile);
        }

        // Phones: the sheet's peek line names the step's sub-assembly when it has one.
        if (sf.setPeek) {
            sf.setPeek((tab) => {
                if (tab !== 'build' || !sf.model) return null;
                const name = nameAt(current), st = steps[current];
                if (!name || !st) return null;
                return `<span>🔨</span><span class="pk-main">Step ${current + 1} of ${steps.length}</span><span class="pk-sub">· ${esc(name)} · +${st.count}</span>`;
            });
        }

        function onModel() {
            steps = stepParts(viewer);
            names = stepNames(sf.model);
            current = viewer.maxLayer;
            hiCache.clear(); dimCache.clear(); printCache.clear();   // the builder may hand out new base materials
            restoreHighlight();
            renderList();
            renderCurrent(false);
        }
        function onStep(i) {
            current = i;
            applyHighlight(i);
            renderCurrent(true);
        }
        sf.on('model', onModel);
        sf.on('step', onStep);
        if (sf.model) onModel();
        /* ── 3. the booklet ────────────────────────────────────────── */
        const CAP_W = 640, CAP_H = 480;
        /**
         * One render per step from a fixed iso camera on a light background, read back
         * from the canvas in the same tick (no preserveDrawingBuffer needed). Everything
         * the viewer owns is put back exactly as it was afterwards.
         */
        function captureSteps() {
            const r = viewer.renderer, cam = viewer.camera, scene = viewer.scene;
            const saved = {
                step: viewer.currentStep, stepMode: viewer.isStepMode, explode: viewer.explodeProgress,
                sph: { ...viewer.spherical }, pr: r.getPixelRatio(), bg: scene.background, fog: scene.fog,
                grid: viewer.grid ? viewer.grid.visible : true, aspect: cam.aspect, vis: viewer.brickMeshes.map((m) => m.visible),
            };
            const shots = [];
            try {
                r.setPixelRatio(1);
                r.setSize(CAP_W, CAP_H, false);
                cam.aspect = CAP_W / CAP_H; cam.updateProjectionMatrix();
                scene.background = new THREE.Color(0xeef1f6);
                scene.fog = null;
                if (viewer.grid) viewer.grid.visible = false;
                viewer.setExplode(0);
                viewer.setPresetView('iso');
                viewer.spherical.radius = viewer.home.radius * 1.12;   // a touch of air around the pedestal
                viewer.updateCameraPosition();
                for (let i = 0; i <= viewer.maxLayer; i++) {
                    for (const m of viewer.brickMeshes) m.visible = (m.userData.layer || 0) <= i;
                    applyHighlight(i, true);
                    const hulls = outlinesFor(i);
                    r.render(scene, cam);
                    for (const h of hulls) viewer.modelGroup.remove(h);
                    shots.push(r.domElement.toDataURL('image/jpeg', 0.85));
                }
                // The hero: the finished model, plain.
                for (const m of viewer.brickMeshes) m.visible = true;
                applyHighlight(null);
                r.render(scene, cam);
                shots.hero = r.domElement.toDataURL('image/jpeg', 0.88);
            } finally {
                scene.background = saved.bg; scene.fog = saved.fog;
                if (viewer.grid) viewer.grid.visible = saved.grid;
                viewer.brickMeshes.forEach((m, k) => { m.visible = saved.vis[k]; });
                viewer.currentStep = saved.step; viewer.isStepMode = saved.stepMode;
                viewer.setExplode(saved.explode);
                Object.assign(viewer.spherical, saved.sph); viewer.updateCameraPosition();
                r.setPixelRatio(saved.pr);
                cam.aspect = saved.aspect; cam.updateProjectionMatrix();
                viewer.resize();
                applyHighlight(saved.stepMode ? saved.step : null);
            }
            return shots;
        }

        /**
         * A yellow outline hull around the pieces a step adds: the same geometry drawn a little larger
         * with its back faces only, so it shows just around the silhouette. Works for every piece colour,
         * which a glow alone does not (white on a white page).
         */
        const OUTLINE = 0.16;   // studs of outline, so small plates get the same line as big bricks
        const outlineMat = new THREE.MeshBasicMaterial({ color: 0xffb300, side: THREE.BackSide });
        function outlinesFor(step) {
            const out = [];
            for (const m of viewer.brickMeshes) {
                if ((m.userData.layer || 0) !== step) continue;
                const h = new THREE.Mesh(m.geometry, outlineMat);
                h.position.copy(m.position); h.rotation.copy(m.rotation);
                const u = m.userData;
                h.scale.set(1 + OUTLINE / (u.width || 1), 1 + OUTLINE / (u.height || 1), 1 + OUTLINE / (u.length || 1));
                viewer.modelGroup.add(h); out.push(h);
            }
            return out;
        }

        let booklet = null;
        function bookletEl() {
            if (booklet) return booklet;
            booklet = document.createElement('div');
            booklet.className = 'sfi-booklet';
            booklet.id = 'sfi-booklet';
            booklet.tabIndex = -1;
            booklet.setAttribute('role', 'dialog');
            booklet.setAttribute('aria-label', 'Build instructions booklet');
            booklet.innerHTML = `
                <div class="sfi-bar">
                    <div class="sfi-brand"><i class="sfi-logo"><s></s><s></s><s></s><s></s></i><div>STUDFORGE<span>BUILD INSTRUCTIONS</span></div></div>
                    <div class="sfi-actions"><button class="sfi-btn primary" id="sfi-print">🖨️ PRINT / SAVE PDF</button><button class="sfi-btn" id="sfi-close">✕ CLOSE</button></div>
                </div>
                <div class="sfi-pages" id="sfi-pages"></div>`;
            document.body.appendChild(booklet);
            booklet.querySelector('#sfi-print').addEventListener('click', () => window.print());
            booklet.querySelector('#sfi-close').addEventListener('click', closeBooklet);
            booklet.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeBooklet(); });
            return booklet;
        }
        function closeBooklet() {
            if (!booklet) return;
            booklet.classList.remove('open');
            document.body.classList.remove('sfi-booklet-open');
            // The canvas was hidden behind the booklet: let the viewer pick its size up again.
            requestAnimationFrame(() => { try { viewer.resize(); } catch (e) { /* fine */ } });
        }

        const ptable = (rows, withMeta = true) => `<table class="sfi-ptable"><thead><tr><th>PART</th>${withMeta ? '<th class="m">ID</th>' : ''}<th class="q">QTY</th></tr></thead><tbody>${rows.map((p) => `<tr><td><span class="sfi-dot" style="background:${p.colorHex}"></span>${esc(p.partName)} <span style="color:#64748b">· ${esc(p.colorName)}</span></td>${withMeta ? `<td class="m">#${esc(p.partId)}</td>` : ''}<td class="q">x${p.quantity}</td></tr>`).join('')}</tbody></table>`;

        function buildBooklet(shots) {
            const model = sf.model, bom = sf.bom || [];
            const total = model.bricks.filter(b => !b.segment).length;
            const dims = model.dims ? `${model.dims.w}×${model.dims.d}×${model.dims.h} STUDS` : '';
            let html = `<section class="sfi-page sfi-cover">
                <div class="sfi-cover-brand"><i class="sfi-logo"><s></s><s></s><s></s><s></s></i>STUDFORGE · BUILD INSTRUCTIONS</div>
                <h1>${esc(model.name)}</h1>
                <p class="sfi-desc">${esc(model.description)}</p>
                <div class="sfi-facts"><span class="sfi-fact">${esc(model.icon)} ${esc(String(model.category).toUpperCase())}</span><span class="sfi-fact hi">${total} PIECES</span><span class="sfi-fact">${steps.length} STEPS</span>${dims ? `<span class="sfi-fact">${dims}</span>` : ''}<span class="sfi-fact">${esc(String(model.difficulty || '').toUpperCase())}</span><span class="sfi-fact">⏱️ ${esc(model.estTime)}</span></div>
                <img class="sfi-img" src="${shots.hero}" alt="${esc(model.name)}">
                <h2>All the parts · ${bom.length} unique elements</h2>
                <div class="sfi-cols">${ptable(bom)}</div>
                <p class="sfi-foot-note">${model.kind === 'reference' && model.reference ? `Real set ${esc(model.reference.setId)}, rebuilt from the LDraw OMR file by ${esc([].concat(model.reference.authors || []).join(', ') || 'the LDraw community')} · ${esc(model.reference.licence || 'CC BY')} · LDraw.org` : `Forged from the idea “${esc(model.prompt || model.name)}”`} · tonytoubia.com/studforge</p>
            </section>`;
            let run = 0;
            steps.forEach((st, i) => {
                run += st.count;
                html += `<section class="sfi-page sfi-step" data-step="${i}">
                    <div class="sfi-step-head"><h1>STEP ${i + 1} <small style="font-size:12px;color:#64748b;font-weight:700">of ${steps.length}</small></h1><span>+${st.count} pieces · ${run} / ${total} placed</span></div>
                    <img class="sfi-img" src="${shots[i]}" alt="Step ${i + 1}">
                    <h2>Add these ${st.count} pieces · outlined in yellow</h2>
                    ${st.rows.length ? ptable(st.rows) : '<p class="sfi-empty">Nothing to add.</p>'}
                </section>`;
            });
            return html;
        }

        let building = false;
        function openBooklet() {
            if (!sf.model || building) return;
            building = true;
            const busy = document.createElement('div');
            busy.className = 'sfi-busy'; busy.textContent = '📘 RENDERING YOUR BOOKLET…';
            document.body.appendChild(busy);
            // Let the "busy" frame paint before the synchronous capture loop.
            requestAnimationFrame(() => setTimeout(() => {
                try {
                    const shots = captureSteps();
                    const el = bookletEl();
                    el.querySelector('#sfi-pages').innerHTML = buildBooklet(shots);
                    el.classList.add('open');
                    document.body.classList.add('sfi-booklet-open');
                    el.scrollTop = 0;
                    el.focus();
                } catch (e) {
                    console.error('StudForge booklet', e);
                } finally {
                    busy.remove();
                    building = false;
                }
            }, 30));
        }

        // The booklet button in the section and the core's PRINT LIST button both open the booklet.
        sf.on('print', () => { openBooklet(); return true; });

        // A small public surface, handy for tests and other features.
        sf.instructions = { openBooklet, closeBooklet, get steps() { return steps; }, get current() { return current; } };
    }

    if (window.studForge) init();
    else document.addEventListener('studforge:ready', init, { once: true });
})();
