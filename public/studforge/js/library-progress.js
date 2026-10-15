// Local assembly progress for community reference models.
(() => {
    function init() {
        const sf = window.studForge, core = window.StudForgeLibrary;
        if (!sf || !core || sf.libraryProgress) return;
        sf.libraryProgress = true;
        const storage = { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
        const state = window.StudForgeLibraryState ||= core.readState(storage);
        const panel = sf.registerPanel({ id: 'library-progress', title: 'YOUR BUILD PROGRESS', group: 'build', order: 5 });
        const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        let model = null, saved = null;
        const persist = () => { if (!core.saveState(storage, state)) sf.toast('Browser storage is unavailable; progress lasts for this visit'); };
        function paint() {
            panel.section.hidden = !model;
            if (!model) return;
            const step = sf.viewer.currentStep, noun = model.stepKind === 'layers' ? 'Layer' : 'Step';
            const rows = core.inventory(model.bricks.filter(b => !b.segment && b.layer === step));
            const completed = saved.checked || {};
            panel.body.innerHTML = `<p class="sfref-hint">${noun} ${step + 1} of ${sf.viewer.maxLayer + 1} · saved on this device.</p>`
                + (model.reference.missing?.length ? `<p class="sfref-hint">Source omissions: ${esc(model.reference.missing.join(', ').toLowerCase())}. This checklist covers the community recreation.</p>` : '')
                + (model.stepKind === 'layers' ? '<p class="sfref-hint">These are inspection layers. Use the original instructions for the assembly sequence.</p>' : '')
                + '<div class="sfref-row"><button type="button" class="action-btn secondary" data-progress="start">⏮ START OVER</button><button type="button" class="action-btn secondary" data-progress="full">SHOW ALL</button></div>'
                + rows.map(b => {
                    const key = `${step}|${b.partId}|${b.color}`;
                    const info = window.BrickBuilder.partInfo(b.geometryId || b.partId);
                    return `<label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13px"><input type="checkbox" data-check="${esc(key)}" ${completed[key] ? 'checked' : ''}><span>${b.quantity} × ${esc(info?.name || b.partName || b.partId)} · ${esc(window.LEGO_COLORS[b.color]?.name || b.color)}</span></label>`;
                }).join('')
                + `<p class="sfref-foot"><a href="${esc(model.reference.instructionsUrl || `https://www.lego.com/en-us/service/building-instructions/${model.reference.setId.split('-')[0]}`)}" target="_blank" rel="noopener">Original building instructions ↗</a></p>`;
        }
        panel.body.addEventListener('click', e => {
            const action = e.target.closest('[data-progress]')?.dataset.progress;
            if (!action || !model) return;
            if (action === 'start') { saved.checked = {}; sf.goStep(0); }
            else sf.goStep(sf.viewer.maxLayer);
        });
        panel.body.addEventListener('change', e => {
            if (!model || !e.target.matches('[data-check]')) return;
            (saved.checked ||= {})[e.target.dataset.check] = e.target.checked;
            persist();
        });
        sf.on('model', m => {
            model = m.kind === 'reference' ? m : null;
            if (model) {
                const id = m.reference.setId;
                saved = state.progress[id] || state.progress[`set-${id}`];
                if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
                if (!saved.checked || typeof saved.checked !== 'object' || Array.isArray(saved.checked)) saved.checked = {};
                state.progress[id] = saved; state.lastModel = id;
                const step = core.resumeStep(saved.step, sf.viewer.maxLayer);
                if (step !== null) sf.goStep(step);
                persist();
            }
            paint();
        });
        sf.on('step', step => { if (model) { saved.step = step; persist(); paint(); } });
        paint();
        // The last kit opened here is offered as "resume" on the home screen (reference.js), not reopened unasked.
    }
    if (window.studForge) init(); else document.addEventListener('studforge:ready', init, { once: true });
})();
