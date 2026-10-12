// StudForge Main Orchestrator & UI Controller
document.addEventListener('DOMContentLoaded', () => {
    if (window.self !== window.top) document.body.classList.add('in-iframe');

    const viewer = new window.StudForgeViewer('viewport-3d');
    const generator = new window.BrickGenerator();

    let currentModel = null;
    let bomParts = [];
    let lastPrompt = '', variant = 0;

    const $ = (id) => document.getElementById(id);
    const promptInput = $('input-prompt'), btnGenerate = $('btn-generate'), btnSurprise = $('btn-surprise'), inspoContainer = $('inspo-pills');
    const modelTitle = $('model-title'), modelDesc = $('model-desc'), modelBadge = $('model-badge'), modelPieceCount = $('model-piece-count'), modelEstTime = $('model-est-time'), modelDims = $('model-dims');
    const explodeSlider = $('slider-explode'), explodeVal = $('val-explode'), stepSlider = $('slider-step'), stepVal = $('val-step'), stepHint = $('val-step-hint');
    const btnPrevStep = $('btn-prev-step'), btnNextStep = $('btn-next-step');
    const bomTableBody = $('bom-table-body'), btnCopyBOM = $('btn-copy-bom'), btnExportXML = $('btn-export-xml'), btnPrintCard = $('btn-print-card'), btnAudioToggle = $('btn-audio');
    const bomCard = $('bom-card'), btnBomToggle = $('btn-bom-toggle');

    const SURPRISES = ['haunted lighthouse', 'giant purple octopus', 'cozy bakery with a garden', 'steampunk airship', 'neon cyberpunk arcade cabinet', 'red fire truck', 'medieval watchtower', 'tropical island with a hut', 'green t-rex', 'white space shuttle', 'pink cupcake', 'a knight with a shield', 'winter cabin in the snow', 'yellow school bus', 'blue whale', 'royal throne', 'pirate galleon', 'desert pyramid', 'moon lander', 'orange tractor', 'christmas tree', 'black police car', 'a cat', 'volcano', 'retro flying saucer', 'golden trophy', 'bonsai tree', 'tie fighter', 'a cheeseburger', 'pagoda shrine'];

    /* ── inspiration pills ────────────────────────────────────── */
    function populateInspirations() {
        inspoContainer.innerHTML = '';
        window.INSPIRATION_MODELS.forEach((m) => {
            const pill = document.createElement('button');
            pill.className = 'inspo-pill';
            pill.innerHTML = `<span>${m.icon}</span> <span>${m.name}</span>`;
            pill.addEventListener('click', () => {
                document.querySelectorAll('.inspo-pill').forEach((p) => p.classList.remove('active'));
                pill.classList.add('active');
                promptInput.value = m.prompt;
                forge(m.prompt, 0);
            });
            inspoContainer.appendChild(pill);
        });
    }

    /* ── forging ──────────────────────────────────────────────── */
    function forge(prompt, v) {
        const model = generator.generateFromPrompt(prompt, v);
        lastPrompt = prompt; variant = v;
        loadBlueprint(model);
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

        explodeSlider.value = 0;
        explodeVal.innerText = '0%';
        stepSlider.max = viewer.maxLayer;
        stepSlider.value = viewer.maxLayer;
        showStep(viewer.maxLayer);
        computeBOM(model);
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
            tr.innerHTML = `<td><div class="part-preview-cell"><span class="color-dot" style="background-color: ${p.colorHex}"></span><div class="part-info"><span class="part-name">${p.partName}</span><span class="part-meta">ID: ${p.partId} | ${p.colorName}</span></div></div></td><td class="text-right"><span class="qty-badge">x${p.quantity}</span></td>`;
            bomTableBody.appendChild(tr);
        }
        $('total-unique-parts').innerText = `${parts.length} unique elements`;
        $('total-pieces-count').innerText = `${currentModel.bricks.length} total pieces`;
        if (btnBomToggle) btnBomToggle.innerText = `🧱 PARTS (${currentModel.bricks.length})`;
    }

    /* ── prompt handlers ──────────────────────────────────────── */
    function handleGenerate() {
        const query = promptInput.value.trim();
        if (!query) return;
        // The same idea forged again gives a new variation.
        const v = query === lastPrompt ? variant + 1 : 0;
        btnGenerate.disabled = true;
        btnGenerate.innerHTML = `<span class="spin-icon">⚙️</span> FORGING...`;
        document.querySelectorAll('.inspo-pill').forEach((p) => p.classList.remove('active'));
        setTimeout(() => {
            try { forge(query, v); }
            finally {
                btnGenerate.disabled = false;
                btnGenerate.innerHTML = v > 0 ? `<span>🎲</span> RE-FORGE` : `<span>⚡</span> FORGE IDEA`;
            }
        }, 60);
    }
    btnGenerate.addEventListener('click', handleGenerate);
    promptInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGenerate(); });
    promptInput.addEventListener('input', () => { btnGenerate.innerHTML = promptInput.value.trim() === lastPrompt ? `<span>🎲</span> RE-FORGE` : `<span>⚡</span> FORGE IDEA`; });
    if (btnSurprise) btnSurprise.addEventListener('click', () => {
        const pick = SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
        promptInput.value = pick;
        document.querySelectorAll('.inspo-pill').forEach((p) => p.classList.remove('active'));
        forge(pick, Math.floor(Math.random() * 4));
    });

    /* ── studio tools ─────────────────────────────────────────── */
    explodeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        explodeVal.innerText = `${Math.round(val * 100)}%`;
        viewer.setExplode(val);
        window.studForgeAudio.playRatchetClick();
    });
    const goStep = (step) => { step = Math.max(0, Math.min(viewer.maxLayer, step)); stepSlider.value = step; showStep(step); viewer.setStep(step); };
    stepSlider.addEventListener('input', (e) => goStep(parseInt(e.target.value, 10)));
    btnPrevStep.addEventListener('click', () => goStep(viewer.currentStep - 1));
    btnNextStep.addEventListener('click', () => goStep(viewer.currentStep + 1));

    $('btn-cam-iso').addEventListener('click', () => viewer.setPresetView('iso'));
    $('btn-cam-front').addEventListener('click', () => viewer.setPresetView('front'));
    $('btn-cam-top').addEventListener('click', () => viewer.setPresetView('top'));
    $('btn-cam-side').addEventListener('click', () => viewer.setPresetView('side'));
    $('btn-cam-reset').addEventListener('click', () => viewer.resetView());

    btnAudioToggle.addEventListener('click', () => { btnAudioToggle.innerText = window.studForgeAudio.toggleMute() ? '🔇' : '🔊'; });
    if (btnBomToggle) btnBomToggle.addEventListener('click', () => { bomCard.classList.toggle('open'); btnBomToggle.classList.toggle('on'); });

    /* ── exports ──────────────────────────────────────────────── */
    btnCopyBOM.addEventListener('click', () => {
        if (!currentModel) return;
        let text = `📦 STUDFORGE PARTS MANIFEST: ${currentModel.name.toUpperCase()}\n`;
        text += `${currentModel.description}\n`;
        text += `Total Pieces: ${currentModel.bricks.length} | Unique Elements: ${bomParts.length}\n\n[ ] QTY | ELEMENT | DESIGN ID | COLOR\n----------------------------------------------------\n`;
        for (const p of bomParts) text += `[ ] ${p.quantity.toString().padEnd(4)} | ${p.partName.padEnd(34)} | #${p.partId.padEnd(6)} | ${p.colorName}\n`;
        text += `\nGenerated with StudForge 3D LEGO Idea Maker (https://tonytoubia.com/studforge) from the idea "${currentModel.prompt || currentModel.name}"`;
        navigator.clipboard.writeText(text).then(() => {
            const orig = btnCopyBOM.innerHTML;
            btnCopyBOM.innerHTML = `✓ COPIED!`;
            setTimeout(() => { btnCopyBOM.innerHTML = orig; }, 1800);
        });
    });

    btnExportXML.addEventListener('click', () => {
        if (!currentModel) return;
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<INVENTORY>\n`;
        for (const p of bomParts) xml += `  <ITEM>\n    <ITEMTYPE>P</ITEMTYPE>\n    <ITEMID>${p.partId}</ITEMID>\n    <COLOR>${p.blColorId}</COLOR>\n    <MINQTY>${p.quantity}</MINQTY>\n    <CONDITION>N</CONDITION>\n  </ITEM>\n`;
        xml += `</INVENTORY>\n`;
        const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
        const a = document.createElement('a');
        a.href = url; a.download = `StudForge_${currentModel.id}_BrickLink.xml`; a.click();
        URL.revokeObjectURL(url);
    });

    btnPrintCard.addEventListener('click', () => window.print());

    /* ── start ────────────────────────────────────────────────── */
    populateInspirations();
    const first = window.INSPIRATION_MODELS[0];
    const firstPill = inspoContainer.firstChild;
    if (firstPill) firstPill.classList.add('active');
    promptInput.value = first.prompt;
    forge(first.prompt, 0);
    window.studForge = { viewer, generator, forge, get model() { return currentModel; } };
});
