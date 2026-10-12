// StudForge Main Orchestrator & UI Controller
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Core Systems
    const viewer = new window.StudForgeViewer('viewport-3d');
    const generator = new window.BrickGenerator();

    let currentModel = null;
    let bomParts = [];

    // DOM Elements
    const promptInput = document.getElementById('input-prompt');
    const btnGenerate = document.getElementById('btn-generate');
    const inspoContainer = document.getElementById('inspo-pills');
    const modelTitle = document.getElementById('model-title');
    const modelDesc = document.getElementById('model-desc');
    const modelBadge = document.getElementById('model-badge');
    const modelPieceCount = document.getElementById('model-piece-count');
    const modelEstTime = document.getElementById('model-est-time');

    // Controls
    const explodeSlider = document.getElementById('slider-explode');
    const explodeVal = document.getElementById('val-explode');
    const stepSlider = document.getElementById('slider-step');
    const stepVal = document.getElementById('val-step');
    const btnPrevStep = document.getElementById('btn-prev-step');
    const btnNextStep = document.getElementById('btn-next-step');

    // BOM Elements
    const bomTableBody = document.getElementById('bom-table-body');
    const btnCopyBOM = document.getElementById('btn-copy-bom');
    const btnExportXML = document.getElementById('btn-export-xml');
    const btnPrintCard = document.getElementById('btn-print-card');
    const btnAudioToggle = document.getElementById('btn-audio');

    // Check if in iframe
    if (window.self !== window.top) {
        document.body.classList.add('in-iframe');
    }

    // 2. Populate Inspiration Pills
    function populateInspirations() {
        inspoContainer.innerHTML = '';
        window.INSPIRATION_MODELS.forEach((m, idx) => {
            const pill = document.createElement('button');
            pill.className = `inspo-pill ${idx === 0 ? 'active' : ''}`;
            pill.innerHTML = `<span>${m.icon}</span> <span>${m.name}</span>`;
            pill.addEventListener('click', () => {
                document.querySelectorAll('.inspo-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                promptInput.value = m.name;
                loadBlueprint(m);
            });
            inspoContainer.appendChild(pill);
        });
    }

    // 3. Load Model into Viewer & Update BOM
    function loadBlueprint(model) {
        currentModel = model;
        viewer.loadModel(model);

        // Update Header Info
        modelTitle.innerText = model.name;
        modelDesc.innerText = model.description;
        modelBadge.innerText = `${model.icon} ${model.category.toUpperCase()}`;
        modelPieceCount.innerText = `${model.bricks.length} BRICKS`;
        modelEstTime.innerText = `⏱️ ${model.estTime}`;

        // Reset Sliders
        explodeSlider.value = 0;
        explodeVal.innerText = '0%';
        stepSlider.max = viewer.maxLayer;
        stepSlider.value = viewer.maxLayer;
        stepVal.innerText = `STEP ${viewer.maxLayer + 1} / ${viewer.maxLayer + 1}`;

        // Calculate and Render BOM
        computeBOM(model);
    }

    // 4. Compute Bill of Materials (BOM)
    function computeBOM(model) {
        const partsMap = new Map();

        model.bricks.forEach(b => {
            const key = `${b.partId}_${b.color}`;
            const partInfo = window.LEGO_PARTS[b.partId] || { name: `Element ${b.partId}`, category: 'Standard' };
            const colorInfo = window.LEGO_COLORS[b.color] || { name: b.color, hex: '#cccccc', blId: 0 };

            if (!partsMap.has(key)) {
                partsMap.set(key, {
                    partId: b.partId,
                    partName: partInfo.name,
                    category: partInfo.category,
                    colorKey: b.color,
                    colorName: colorInfo.name,
                    colorHex: colorInfo.hex,
                    blColorId: colorInfo.blId,
                    quantity: 0
                });
            }
            partsMap.get(key).quantity++;
        });

        bomParts = Array.from(partsMap.values()).sort((a, b) => b.quantity - a.quantity);
        renderBOMTable(bomParts);
    }

    // 5. Render BOM Table in DOM
    function renderBOMTable(parts) {
        bomTableBody.innerHTML = '';

        parts.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="part-preview-cell">
                        <span class="color-dot" style="background-color: ${p.colorHex}"></span>
                        <div class="part-info">
                            <span class="part-name">${p.partName}</span>
                            <span class="part-meta">ID: ${p.partId} | ${p.colorName}</span>
                        </div>
                    </div>
                </td>
                <td class="text-right">
                    <span class="qty-badge">x${p.quantity}</span>
                </td>
            `;
            bomTableBody.appendChild(tr);
        });

        document.getElementById('total-unique-parts').innerText = `${parts.length} unique elements`;
        document.getElementById('total-pieces-count').innerText = `${currentModel.bricks.length} total pieces`;
    }

    // 6. User Prompt Generation Handler
    function handleGenerate() {
        const query = promptInput.value.trim();
        if (!query) return;

        btnGenerate.disabled = true;
        btnGenerate.innerHTML = `<span class="spin-icon">⚙️</span> FORGING...`;

        setTimeout(() => {
            const generated = generator.generateFromPrompt(query);
            loadBlueprint(generated);

            btnGenerate.disabled = false;
            btnGenerate.innerHTML = `<span>⚡</span> FORGE IDEA`;
        }, 300);
    }

    btnGenerate.addEventListener('click', handleGenerate);
    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleGenerate();
    });

    // 7. Exploded View Slider
    explodeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        explodeVal.innerText = `${Math.round(val * 100)}%`;
        viewer.setExplode(val);
        window.studForgeAudio.playRatchetClick();
    });

    // 8. Step-by-Step Assembly Stepper
    stepSlider.addEventListener('input', (e) => {
        const step = parseInt(e.target.value, 10);
        stepVal.innerText = `STEP ${step + 1} / ${viewer.maxLayer + 1}`;
        viewer.setStep(step);
    });

    btnPrevStep.addEventListener('click', () => {
        const newStep = Math.max(0, viewer.currentStep - 1);
        stepSlider.value = newStep;
        stepVal.innerText = `STEP ${newStep + 1} / ${viewer.maxLayer + 1}`;
        viewer.setStep(newStep);
    });

    btnNextStep.addEventListener('click', () => {
        const newStep = Math.min(viewer.maxLayer, viewer.currentStep + 1);
        stepSlider.value = newStep;
        stepVal.innerText = `STEP ${newStep + 1} / ${viewer.maxLayer + 1}`;
        viewer.setStep(newStep);
    });

    // 9. Camera Presets
    document.getElementById('btn-cam-iso').addEventListener('click', () => viewer.setPresetView('iso'));
    document.getElementById('btn-cam-front').addEventListener('click', () => viewer.setPresetView('front'));
    document.getElementById('btn-cam-top').addEventListener('click', () => viewer.setPresetView('top'));
    document.getElementById('btn-cam-side').addEventListener('click', () => viewer.setPresetView('side'));
    document.getElementById('btn-cam-reset').addEventListener('click', () => viewer.resetView());

    // 10. Audio Mute Toggle
    btnAudioToggle.addEventListener('click', () => {
        const muted = window.studForgeAudio.toggleMute();
        btnAudioToggle.innerText = muted ? '🔇' : '🔊';
    });

    // 11. Export: Copy Parts List
    btnCopyBOM.addEventListener('click', () => {
        if (!currentModel) return;
        let text = `📦 STUDFORGE PARTS MANIFEST: ${currentModel.name.toUpperCase()}\n`;
        text += `Total Pieces: ${currentModel.bricks.length} | Unique Elements: ${bomParts.length}\n\n`;
        text += `[ ] QTY | ELEMENT | DESIGN ID | COLOR\n`;
        text += `----------------------------------------------------\n`;

        bomParts.forEach(p => {
            text += `[ ] ${p.quantity.toString().padEnd(4)} | ${p.partName.padEnd(26)} | #${p.partId.padEnd(6)} | ${p.colorName}\n`;
        });

        text += `\nGenerated with StudForge 3D LEGO Idea Maker (https://tonytoubia.com/studforge)`;

        navigator.clipboard.writeText(text).then(() => {
            const orig = btnCopyBOM.innerHTML;
            btnCopyBOM.innerHTML = `✓ COPIED!`;
            setTimeout(() => btnCopyBOM.innerHTML = orig, 1800);
        });
    });

    // 12. Export: BrickLink Wanted List XML
    btnExportXML.addEventListener('click', () => {
        if (!currentModel) return;
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<INVENTORY>\n`;

        bomParts.forEach(p => {
            xml += `  <ITEM>\n`;
            xml += `    <ITEMTYPE>P</ITEMTYPE>\n`;
            xml += `    <ITEMID>${p.partId}</ITEMID>\n`;
            xml += `    <COLOR>${p.blColorId}</COLOR>\n`;
            xml += `    <MINQTY>${p.quantity}</MINQTY>\n`;
            xml += `    <CONDITION>N</CONDITION>\n`;
            xml += `  </ITEM>\n`;
        });

        xml += `</INVENTORY>\n`;

        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `StudForge_${currentModel.id}_BrickLink.xml`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // 13. Print / Blueprint Sheet
    btnPrintCard.addEventListener('click', () => {
        window.print();
    });

    // Initial Load
    populateInspirations();
    loadBlueprint(window.INSPIRATION_MODELS[0]);
});
