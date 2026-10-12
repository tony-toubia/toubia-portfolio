// StudForge core: forging, the parts list, the studio controls, and the small
// platform feature modules plug into.
//
// Features (instructions, tweaks, gallery, studio, buying help, the AI idea
// service...) live in their own files, loaded after this one. They use:
//
//   studForge.forge(prompt, variant, opts)   forge an idea (opts: see BrickGenerator.generateFromPrompt)
//   studForge.reforge(patch)                 the current idea again with changed opts, e.g. { colors: { roof: 'BLUE' } }
//   studForge.model / .state                 the current model and { prompt, variant, opts }
//   studForge.on('model' | 'step' | 'explode' | 'forging', fn)
//   studForge.registerPanel({ id, title, render(el) })      a tab in the side panel; render fills `el` (class panel-body)
//   studForge.dock(element)                  a control in the row under the prompt
//   studForge.widget(element)                a floating control on the viewport
//   studForge.viewer / .generator / .bom     the 3D viewer, the generator, the current parts list
document.addEventListener('DOMContentLoaded', () => {
    if (window.self !== window.top) document.body.classList.add('in-iframe');

    const viewer = new window.StudForgeViewer('viewport-3d');
    const generator = new window.BrickGenerator();
    const $ = (id) => document.getElementById(id);

    let currentModel = null;
    let bomParts = [];
    const state = { prompt: '', variant: 0, opts: {} };
    const listeners = {};
    const on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); return () => { listeners[evt] = listeners[evt].filter((f) => f !== fn); }; };
    // emit returns true when any listener returned true ("handled"), so core fallbacks can step aside.
    const emit = (evt, ...args) => { let handled = false; for (const fn of listeners[evt] || []) { try { if (fn(...args) === true) handled = true; } catch (e) { console.error(`studForge ${evt} listener`, e); } } return handled; };

    const promptInput = $('input-prompt'), btnGenerate = $('btn-generate'), btnSurprise = $('btn-surprise'), inspoContainer = $('inspo-pills');
    const modelTitle = $('model-title'), modelDesc = $('model-desc'), modelBadge = $('model-badge'), modelPieceCount = $('model-piece-count'), modelEstTime = $('model-est-time'), modelDims = $('model-dims');
    const explodeSlider = $('slider-explode'), explodeVal = $('val-explode'), stepSlider = $('slider-step'), stepVal = $('val-step'), stepHint = $('val-step-hint');
    const bomTableBody = $('bom-table-body'), bomCard = $('bom-card'), btnBomToggle = $('btn-bom-toggle');

    const SURPRISES = ['haunted lighthouse', 'giant purple octopus', 'cozy bakery with a garden', 'steampunk airship', 'neon cyberpunk arcade cabinet', 'red fire truck', 'medieval watchtower', 'tropical island with a hut', 'green t-rex', 'white space shuttle', 'pink cupcake', 'a knight with a shield', 'winter cabin in the snow', 'yellow school bus', 'blue whale', 'royal throne', 'pirate galleon', 'desert pyramid', 'moon lander', 'orange tractor', 'christmas tree', 'black police car', 'a cat', 'volcano', 'retro flying saucer', 'golden trophy', 'bonsai tree', 'tie fighter', 'a cheeseburger', 'pagoda shrine'];

    /* ── side panels ──────────────────────────────────────────── */
    const tabs = $('side-tabs'), panels = $('side-panels');
    const showPanel = (id) => {
        for (const t of tabs.querySelectorAll('.side-tab')) t.classList.toggle('on', t.dataset.panel === id);
        for (const p of panels.querySelectorAll('.side-panel')) p.classList.toggle('on', p.id === `panel-${id}`);
        emit('panel', id);
    };
    tabs.addEventListener('click', (e) => { const t = e.target.closest('.side-tab'); if (t) showPanel(t.dataset.panel); });
    const registerPanel = ({ id, title, render }) => {
        const tab = document.createElement('button');
        tab.className = 'side-tab'; tab.dataset.panel = id; tab.textContent = title;
        tabs.appendChild(tab);
        const sec = document.createElement('section');
        sec.className = 'side-panel'; sec.id = `panel-${id}`;
        const body = document.createElement('div'); body.className = 'panel-body';
        sec.appendChild(body); panels.appendChild(sec);
        if (render) render(body);
        return { body, show: () => showPanel(id) };
    };
    const dock = (el) => { $('tool-dock').appendChild(el); return el; };
    const widget = (el) => { $('viewport-widgets').appendChild(el); return el; };

    /* ── inspiration pills ────────────────────────────────────── */
    function populateInspirations() {
        inspoContainer.innerHTML = '';
        window.INSPIRATION_MODELS.forEach((m) => {
            const pill = document.createElement('button');
            pill.className = 'inspo-pill';
            pill.innerHTML = `<span>${m.icon}</span> <span>${m.name}</span>`;
            pill.addEventListener('click', () => { promptInput.value = m.prompt; forge(m.prompt, 0, {}); pill.classList.add('active'); });
            inspoContainer.appendChild(pill);
        });
    }

    /* ── forging ──────────────────────────────────────────────── */
    function forge(prompt, v = 0, opts = {}) {
        document.querySelectorAll('.inspo-pill').forEach((p) => p.classList.remove('active'));
        emit('forging', { prompt, variant: v, opts });
        const model = generator.generateFromPrompt(prompt, v, opts);
        state.prompt = prompt; state.variant = v; state.opts = opts;
        loadBlueprint(model);
        return model;
    }
    /** The current idea again with some options changed (colours, scale, features); `null` clears a key. */
    function reforge(patch = {}) {
        const o = state.opts || {};
        const merged = {
            ...o,
            colors: { ...(o.colors || {}), ...(patch.colors || {}) },
            features: { ...(o.features || {}), ...(patch.features || {}) },
            scale: patch.scale === undefined ? o.scale : patch.scale,
            brief: patch.brief === undefined ? o.brief : patch.brief,
        };
        for (const k of Object.keys(merged.colors)) if (merged.colors[k] == null) delete merged.colors[k];
        for (const k of Object.keys(merged.features)) if (merged.features[k] == null) delete merged.features[k];
        if (merged.scale == null) delete merged.scale;
        if (merged.brief == null) delete merged.brief;
        return forge(state.prompt, state.variant, merged);
    }

    function loadBlueprint(model) {
        currentModel = model;
        viewer.loadModel(model);
        modelTitle.innerText = model.name;
        modelDesc.innerText = model.description;
        modelBadge.innerText = `${model.icon} ${model.category.toUpperCase()}`;
        modelPieceCount.innerText = `${model.bricks.length} BRICKS`;
        modelEstTime.innerText = `⏱️ ${model.estTime}`;
        if (modelDims) modelDims.innerText = model.dims ? `${model.dims.w}×${model.dims.d}×${model.dims.h} · ${model.difficulty.toUpperCase()}` : model.difficulty.toUpperCase();
        explodeSlider.value = 0; explodeVal.innerText = '0%';
        stepSlider.max = viewer.maxLayer; stepSlider.value = viewer.maxLayer;
        showStep(viewer.maxLayer);
        computeBOM(model);
        emit('model', model);
    }

    function showStep(step) {
        stepVal.innerText = `STEP ${step + 1} / ${viewer.maxLayer + 1}`;
        if (stepHint) stepHint.innerText = `+${viewer.stepCount(step)} pieces`;
    }

    /* ── bill of materials ────────────────────────────────────── */
    function computeBOM(model) {
        const partsMap = new Map();
        model.bricks.forEach((b) => {
            const key = `${b.partId}_${b.color}`;
            const partInfo = window.LEGO_PARTS[b.partId] || { name: `Element ${b.partId}`, category: 'Standard' };
            const colorInfo = window.LEGO_COLORS[b.color] || { name: b.color, hex: '#cccccc', blId: 0 };
            if (!partsMap.has(key)) partsMap.set(key, { partId: b.partId, partName: partInfo.name, category: partInfo.category, colorKey: b.color, colorName: colorInfo.name, colorHex: colorInfo.hex, blColorId: colorInfo.blId, quantity: 0 });
            partsMap.get(key).quantity++;
        });
        bomParts = Array.from(partsMap.values()).sort((a, b) => b.quantity - a.quantity);
        renderBOMTable(bomParts);
    }

    function renderBOMTable(parts) {
        bomTableBody.innerHTML = '';
        for (const p of parts) {
            const tr = document.createElement('tr');
            tr.dataset.part = p.partId; tr.dataset.color = p.colorKey;
            tr.innerHTML = `<td><div class="part-preview-cell"><span class="color-dot" style="background-color: ${p.colorHex}"></span><div class="part-info"><span class="part-name">${p.partName}</span><span class="part-meta">ID: ${p.partId} | ${p.colorName}</span></div></div></td><td class="text-right"><span class="qty-badge">x${p.quantity}</span></td>`;
            bomTableBody.appendChild(tr);
        }
        $('total-unique-parts').innerText = `${parts.length} unique elements`;
        $('total-pieces-count').innerText = `${currentModel.bricks.length} total pieces`;
        if (btnBomToggle) btnBomToggle.innerText = `🧱 PARTS (${currentModel.bricks.length})`;
    }

    /* ── prompt handlers ──────────────────────────────────────── */
    const forgeLabel = () => { btnGenerate.innerHTML = promptInput.value.trim() === state.prompt && state.prompt ? `<span>🎲</span> RE-FORGE` : `<span>⚡</span> FORGE IDEA`; };
    function handleGenerate() {
        const query = promptInput.value.trim();
        if (!query) return;
        // The same idea forged again gives a new variation; a new idea starts fresh.
        const same = query === state.prompt;
        const v = same ? state.variant + 1 : 0;
        btnGenerate.disabled = true;
        btnGenerate.innerHTML = `<span class="spin-icon">⚙️</span> FORGING...`;
        setTimeout(() => {
            try { forge(query, v, same ? state.opts : {}); }
            finally { btnGenerate.disabled = false; forgeLabel(); }
        }, 60);
    }
    btnGenerate.addEventListener('click', handleGenerate);
    promptInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGenerate(); });
    promptInput.addEventListener('input', forgeLabel);
    if (btnSurprise) btnSurprise.addEventListener('click', () => {
        const pick = SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
        promptInput.value = pick;
        forge(pick, Math.floor(Math.random() * 4), {});
        forgeLabel();
    });

    /* ── studio tools ─────────────────────────────────────────── */
    explodeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        explodeVal.innerText = `${Math.round(val * 100)}%`;
        viewer.setExplode(val);
        window.studForgeAudio.playRatchetClick();
        emit('explode', val);
    });
    const goStep = (step) => { step = Math.max(0, Math.min(viewer.maxLayer, step)); stepSlider.value = step; showStep(step); viewer.setStep(step); emit('step', step); };
    stepSlider.addEventListener('input', (e) => goStep(parseInt(e.target.value, 10)));
    $('btn-prev-step').addEventListener('click', () => goStep(viewer.currentStep - 1));
    $('btn-next-step').addEventListener('click', () => goStep(viewer.currentStep + 1));
    for (const v of ['iso', 'front', 'top', 'side']) $(`btn-cam-${v}`).addEventListener('click', () => viewer.setPresetView(v));
    $('btn-cam-reset').addEventListener('click', () => viewer.resetView());
    $('btn-audio').addEventListener('click', () => { $('btn-audio').innerText = window.studForgeAudio.toggleMute() ? '🔇' : '🔊'; });
    if (btnBomToggle) btnBomToggle.addEventListener('click', () => { bomCard.classList.toggle('open'); btnBomToggle.classList.toggle('on'); });

    /* ── exports ──────────────────────────────────────────────── */
    $('btn-copy-bom').addEventListener('click', () => {
        if (!currentModel) return;
        let text = `📦 STUDFORGE PARTS MANIFEST: ${currentModel.name.toUpperCase()}\n${currentModel.description}\n`;
        text += `Total Pieces: ${currentModel.bricks.length} | Unique Elements: ${bomParts.length}\n\n[ ] QTY | ELEMENT | DESIGN ID | COLOR\n----------------------------------------------------\n`;
        for (const p of bomParts) text += `[ ] ${p.quantity.toString().padEnd(4)} | ${p.partName.padEnd(34)} | #${p.partId.padEnd(6)} | ${p.colorName}\n`;
        text += `\nGenerated with StudForge 3D LEGO Idea Maker (https://tonytoubia.com/studforge) from the idea "${currentModel.prompt || currentModel.name}"`;
        navigator.clipboard.writeText(text).then(() => { const b = $('btn-copy-bom'), orig = b.innerHTML; b.innerHTML = `✓ COPIED!`; setTimeout(() => { b.innerHTML = orig; }, 1800); });
    });
    $('btn-export-xml').addEventListener('click', () => {
        if (!currentModel) return;
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<INVENTORY>\n`;
        for (const p of bomParts) xml += `  <ITEM>\n    <ITEMTYPE>P</ITEMTYPE>\n    <ITEMID>${p.partId}</ITEMID>\n    <COLOR>${p.blColorId}</COLOR>\n    <MINQTY>${p.quantity}</MINQTY>\n    <CONDITION>N</CONDITION>\n  </ITEM>\n`;
        xml += `</INVENTORY>\n`;
        const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
        const a = document.createElement('a'); a.href = url; a.download = `StudForge_${currentModel.id}_BrickLink.xml`; a.click();
        URL.revokeObjectURL(url);
    });
    $('btn-print-card').addEventListener('click', () => { if (!emit('print')) window.print(); });

    /* ── the platform object, then start ──────────────────────── */
    window.studForge = {
        viewer, generator, forge, reforge, on, emit, registerPanel, dock, widget, showPanel, goStep, state,
        get model() { return currentModel; }, get bom() { return bomParts; }, promptInput,
        setPrompt(p) { promptInput.value = p; forgeLabel(); },
    };
    populateInspirations();
    document.dispatchEvent(new CustomEvent('studforge:ready'));
    // Features may have claimed the first forge (e.g. a share link); otherwise show the first inspiration.
    if (!currentModel) {
        const first = window.INSPIRATION_MODELS[0];
        promptInput.value = first.prompt;
        forge(first.prompt, 0, {});
        if (inspoContainer.firstChild) inspoContainer.firstChild.classList.add('active');
    }
});
