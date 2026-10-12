// StudForge feature: build instructions you can follow.
//
//  1. In step mode the pieces added by the current step glow and older ones dim a touch,
//     so the 3D view reads like an instruction page.
//  2. A "STEPS" side panel: the current step, the parts it adds, prev/next, and a compact
//     list of every step you can jump to.
//  3. A printable booklet (cover + one page per step with a render and a parts table),
//     opened from a dock chip or the PRINT button in the parts panel.
//
// Everything is prefixed `sfi-` and hangs off window.studForge; viewer.js is untouched.
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    /* ── theme ──────────────────────────────────────────────────── */
    const CSS = `
.sfi-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.sfi-step-num { font-family: var(--font-heading); font-size: 15px; font-weight: 800; color: #fff; letter-spacing: 1px; line-height: 1.1; }
.sfi-step-num small { display: block; font-family: var(--font-mono); font-size: 10px; color: var(--lego-yellow); font-weight: 700; letter-spacing: 0; margin-top: 3px; }
.sfi-nav { display: flex; gap: 4px; flex-shrink: 0; }
.sfi-btn { background: rgba(255,255,255,0.08); border: 1px solid var(--border-main); color: var(--text-primary); font-family: var(--font-heading); font-size: 9px; font-weight: 700; padding: 6px 9px; border-radius: 4px; cursor: pointer; white-space: nowrap; }
.sfi-btn:hover { background: rgba(255,255,255,0.15); border-color: var(--lego-yellow); }
.sfi-btn:disabled { opacity: 0.35; cursor: default; }
.sfi-btn.primary { background: linear-gradient(135deg, var(--lego-yellow) 0%, #d4a017 100%); color: #0c0f17; border: none; }
.sfi-progress { height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; margin-bottom: 10px; }
.sfi-progress i { display: block; height: 100%; background: var(--lego-yellow); transition: width 0.2s ease; }
.sfi-sub { font-family: var(--font-heading); font-size: 9px; letter-spacing: 1px; color: var(--text-muted); margin: 10px 0 4px; }
.sfi-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.sfi-table td { padding: 5px 4px; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: middle; }
.sfi-table td.q { text-align: right; width: 42px; }
.sfi-table .part-name { font-size: 12px; }
.sfi-table .part-meta { font-size: 9px; }
.sfi-empty { color: var(--text-muted); padding: 8px 2px; font-style: italic; }
.sfi-steps { display: flex; flex-direction: column; gap: 2px; }
.sfi-row { display: grid; grid-template-columns: 52px 1fr auto; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 4px; background: transparent; border: 1px solid transparent; color: var(--text-secondary); cursor: pointer; font-family: var(--font-body); font-size: 11px; font-weight: 600; text-align: left; width: 100%; }
.sfi-row:hover { background: rgba(255,255,255,0.06); color: #fff; }
.sfi-row.on { border-color: var(--lego-yellow); background: rgba(242,205,55,0.12); color: var(--lego-yellow); }
.sfi-row.done { color: var(--text-muted); }
.sfi-row b { font-family: var(--font-mono); font-size: 10px; }
.sfi-row i { height: 4px; background: rgba(255,255,255,0.12); border-radius: 2px; overflow: hidden; display: block; }
.sfi-row i b { display: block; height: 100%; background: currentColor; }
.sfi-row em { font-family: var(--font-mono); font-style: normal; font-size: 10px; }
.sfi-foot { margin-top: 12px; display: flex; gap: 6px; }
.sfi-foot .sfi-btn { flex: 1; padding: 8px; font-size: 10px; }

/* the booklet overlay: dark on white, so it prints as it looks */
.sfi-booklet { position: fixed; inset: 0; z-index: 10000; background: #e9ecf1; color: #111827; overflow-y: auto; -webkit-overflow-scrolling: touch; font-family: var(--font-body); display: none; }
.sfi-booklet.open { display: block; }
body.sfi-booklet-open { overflow: hidden; }
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
    .sfi-ptable td.m { display: none; }
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
    const partOf = (id) => window.LEGO_PARTS[id] || { name: `Element ${id}`, category: 'Standard' };

    /** Parts grouped per build step, from the viewer's meshes (their `layer` is the step index). */
    function stepParts(viewer) {
        const steps = [];
        for (let i = 0; i <= viewer.maxLayer; i++) steps.push({ index: i, count: 0, parts: new Map() });
        for (const m of viewer.brickMeshes) {
            const st = steps[m.userData.layer || 0];
            if (!st) continue;
            st.count++;
            const key = `${m.userData.partId}_${m.userData.colorKey}`;
            if (!st.parts.has(key)) {
                const c = colorOf(m.userData.colorKey), p = partOf(m.userData.partId);
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

        /* ── 2. the STEPS panel ────────────────────────────────────── */
        let steps = [];
        let current = 0;
        const panel = sf.registerPanel({ id: 'steps', title: '📋 STEPS' });
        const body = panel.body;
        body.innerHTML = `
            <div class="sfi-head">
                <div class="sfi-step-num"><span id="sfi-num">STEP 1 / 1</span><small id="sfi-added">+0 PIECES THIS STEP</small></div>
                <div class="sfi-nav"><button class="sfi-btn" id="sfi-prev" title="Previous step">◀ PREV</button><button class="sfi-btn" id="sfi-next" title="Next step">NEXT ▶</button></div>
            </div>
            <div class="sfi-progress"><i id="sfi-bar"></i></div>
            <div class="sfi-sub">PIECES ADDED THIS STEP</div>
            <table class="sfi-table"><tbody id="sfi-parts"></tbody></table>
            <div class="sfi-sub">ALL STEPS · TAP TO JUMP</div>
            <div class="sfi-steps" id="sfi-list"></div>
            <div class="sfi-foot"><button class="sfi-btn" id="sfi-first">⏮ START</button><button class="sfi-btn primary" id="sfi-booklet-btn">📘 BOOKLET</button></div>`;
        const numEl = body.querySelector('#sfi-num'), addedEl = body.querySelector('#sfi-added'), barEl = body.querySelector('#sfi-bar');
        const partsEl = body.querySelector('#sfi-parts'), listEl = body.querySelector('#sfi-list');
        const prevBtn = body.querySelector('#sfi-prev'), nextBtn = body.querySelector('#sfi-next');

        prevBtn.addEventListener('click', () => sf.goStep(current - 1));
        nextBtn.addEventListener('click', () => sf.goStep(current + 1));
        body.querySelector('#sfi-first').addEventListener('click', () => sf.goStep(0));
        body.querySelector('#sfi-booklet-btn').addEventListener('click', () => openBooklet());
        listEl.addEventListener('click', (e) => { const r = e.target.closest('.sfi-row'); if (r) sf.goStep(+r.dataset.step); });

        const partRows = (rows, cls) => rows.map((p) => `<tr><td><div class="part-preview-cell"><span class="color-dot" style="background-color:${p.colorHex}"></span><div class="part-info"><span class="part-name">${esc(p.partName)}</span><span class="part-meta">ID: ${esc(p.partId)} | ${esc(p.colorName)}</span></div></div></td><td class="q"><span class="qty-badge">x${p.quantity}</span></td></tr>`).join('');

        function renderList() {
            const total = steps.reduce((n, s) => n + s.count, 0) || 1;
            let run = 0;
            listEl.innerHTML = steps.map((s) => {
                run += s.count;
                return `<button class="sfi-row" data-step="${s.index}"><b>STEP ${s.index + 1}</b><i><b style="width:${Math.round((run / total) * 100)}%"></b></i><em>+${s.count}</em></button>`;
            }).join('');
        }
        function renderCurrent() {
            const st = steps[current] || { count: 0, rows: [] };
            const n = steps.length || 1;
            numEl.textContent = `STEP ${current + 1} / ${n}`;
            addedEl.textContent = `+${st.count} PIECES THIS STEP`;
            barEl.style.width = `${Math.round(((current + 1) / n) * 100)}%`;
            partsEl.innerHTML = st.rows.length ? partRows(st.rows) : '<tr><td class="sfi-empty">Nothing yet. Forge an idea first.</td></tr>';
            prevBtn.disabled = current <= 0;
            nextBtn.disabled = current >= n - 1;
            for (const r of listEl.querySelectorAll('.sfi-row')) {
                const i = +r.dataset.step;
                r.classList.toggle('on', i === current);
                r.classList.toggle('done', i < current);
            }
            const onRow = listEl.querySelector('.sfi-row.on');
            if (onRow && onRow.scrollIntoView && body.offsetParent) onRow.scrollIntoView({ block: 'nearest' });
        }

        function onModel() {
            steps = stepParts(viewer);
            current = viewer.maxLayer;
            hiCache.clear(); dimCache.clear(); printCache.clear();   // the builder may hand out new base materials
            restoreHighlight();
            renderList();
            renderCurrent();
        }
        function onStep(i) {
            current = i;
            applyHighlight(i);
            renderCurrent();
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
        }

        const ptable = (rows, withMeta = true) => `<table class="sfi-ptable"><thead><tr><th>PART</th>${withMeta ? '<th>ID</th>' : ''}<th class="q">QTY</th></tr></thead><tbody>${rows.map((p) => `<tr><td><span class="sfi-dot" style="background:${p.colorHex}"></span>${esc(p.partName)} <span style="color:#64748b">· ${esc(p.colorName)}</span></td>${withMeta ? `<td class="m">#${esc(p.partId)}</td>` : ''}<td class="q">x${p.quantity}</td></tr>`).join('')}</tbody></table>`;

        function buildBooklet(shots) {
            const model = sf.model, bom = sf.bom || [];
            const total = model.bricks.length;
            const dims = model.dims ? `${model.dims.w}×${model.dims.d}×${model.dims.h} STUDS` : '';
            let html = `<section class="sfi-page sfi-cover">
                <div class="sfi-cover-brand"><i class="sfi-logo"><s></s><s></s><s></s><s></s></i>STUDFORGE · BUILD INSTRUCTIONS</div>
                <h1>${esc(model.name)}</h1>
                <p class="sfi-desc">${esc(model.description)}</p>
                <div class="sfi-facts"><span class="sfi-fact">${esc(model.icon)} ${esc(String(model.category).toUpperCase())}</span><span class="sfi-fact hi">${total} PIECES</span><span class="sfi-fact">${steps.length} STEPS</span>${dims ? `<span class="sfi-fact">${dims}</span>` : ''}<span class="sfi-fact">${esc(String(model.difficulty || '').toUpperCase())}</span><span class="sfi-fact">⏱️ ${esc(model.estTime)}</span></div>
                <img class="sfi-img" src="${shots.hero}" alt="${esc(model.name)}">
                <h2>All the parts · ${bom.length} unique elements</h2>
                <div class="sfi-cols">${ptable(bom)}</div>
                <p class="sfi-foot-note">Forged from the idea “${esc(model.prompt || model.name)}” · tonytoubia.com/studforge</p>
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

        // The dock chip and the PRINT button in the parts panel both open the booklet.
        const chip = document.createElement('button');
        chip.className = 'tool-chip'; chip.id = 'sfi-booklet-chip'; chip.type = 'button';
        chip.title = 'Printable step-by-step instruction booklet';
        chip.innerHTML = '📘 BOOKLET';
        chip.addEventListener('click', () => openBooklet());
        sf.dock(chip);
        sf.on('print', () => { openBooklet(); return true; });

        // A small public surface, handy for tests and other features.
        sf.instructions = { openBooklet, closeBooklet, get steps() { return steps; }, get current() { return current; } };
    }

    if (window.studForge) init();
    else document.addEventListener('studforge:ready', init, { once: true });
})();
