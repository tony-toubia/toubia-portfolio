// StudForge tweaks: swap any colour, dial the size, and flip the options a
// builder declares (garden, chimney, moat, wings...). Lives entirely on the
// studForge platform API:
//   - a size dial in the tool dock and a 🎛️ TWEAKS side panel,
//   - a colour picker that opens from a PARTS row or a palette-role swatch,
//   - every change is a studForge.reforge(...) with the changed opts, so the
//     same idea is built again instantly.
// Colours a builder hard-codes (wheels, roads, glass) have no palette role, so
// those are recoloured directly: viewer.loadModel is wrapped to patch the
// bricks before the viewer and the parts list see the model. The patches stay
// for the current idea, so they survive re-forges, and clear on a new idea.
(() => {
    const ROLES = ['primary', 'secondary', 'accent', 'trim', 'roof', 'glass', 'dark', 'metal', 'wood', 'ground', 'light', 'water', 'leaf'];
    const SCALES = [
        { id: 'micro', label: 'MICRO', scale: 0.7, title: 'A pocket-sized build' },
        { id: 'standard', label: 'STANDARD', scale: null, title: 'The size the idea asks for' },
        { id: 'big', label: 'BIG', scale: 1.45, title: 'A chunky display build' },
    ];
    const CSS = `
.sft-dock { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.sft-dock-label { font-family: var(--font-heading); font-size: 9px; letter-spacing: 1px; color: var(--text-muted); }
.sft-seg { display: inline-flex; border: 1px solid var(--border-main); border-radius: 14px; overflow: hidden; background: var(--bg-card); }
.sft-seg-btn { background: transparent; border: 0; border-right: 1px solid var(--border-main); color: var(--text-secondary); font-family: var(--font-heading); font-size: 9px; font-weight: 700; letter-spacing: 0.6px; padding: 6px 10px; cursor: pointer; white-space: nowrap; }
.sft-seg-btn:last-child { border-right: 0; }
.sft-seg-btn:hover { color: #fff; }
.sft-seg-btn.on { background: rgba(242, 205, 55, 0.14); color: var(--lego-yellow); }
.sft-seg-btn:focus-visible { outline: 2px solid var(--lego-yellow); outline-offset: -2px; }
.sft-seg-sm .sft-seg-btn { padding: 4px 8px; font-size: 8px; }
.sft-reset { border-color: rgba(242, 205, 55, 0.45); color: var(--lego-yellow); }
.sft-reset[hidden] { display: none; }
.sft-sec { margin-bottom: 16px; }
.sft-sec h4 { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.sft-sec h4 .sft-mini { font-size: 8px; color: var(--text-muted); letter-spacing: 0.5px; font-weight: 600; text-transform: uppercase; }
.sft-hint { font-size: 12px; color: var(--text-muted); line-height: 1.45; }
.sft-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.sft-swatch { background: var(--bg-card); border: 1px solid var(--border-main); border-radius: 8px; padding: 6px 8px 5px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; min-width: 60px; color: var(--text-secondary); }
.sft-swatch:hover, .sft-swatch:focus-visible { border-color: var(--lego-yellow); color: #fff; outline: none; }
.sft-swatch.mod { border-color: rgba(242, 205, 55, 0.45); }
.sft-dot { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.3); box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.18); }
.sft-dot.trans { border-style: dashed; }
.sft-swatch-label { font-family: var(--font-heading); font-size: 8px; letter-spacing: 0.6px; }
.sft-opt { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
.sft-opt:last-child { border-bottom: 0; }
.sft-opt-label { font-family: var(--font-heading); font-size: 9px; letter-spacing: 0.8px; color: #e2e8f0; text-transform: uppercase; }
.sft-opt.mod .sft-opt-label { color: var(--lego-yellow); }
.sft-switch { width: 38px; height: 20px; border-radius: 10px; border: 1px solid var(--border-main); background: rgba(255, 255, 255, 0.08); position: relative; cursor: pointer; flex-shrink: 0; padding: 0; }
.sft-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--text-muted); transition: left 0.15s, background 0.15s; }
.sft-switch[aria-checked="true"] { background: rgba(242, 205, 55, 0.2); border-color: var(--lego-yellow); }
.sft-switch[aria-checked="true"]::after { left: 20px; background: var(--lego-yellow); }
.sft-switch:focus-visible { outline: 2px solid var(--lego-yellow); outline-offset: 2px; }
.sft-select { background: var(--bg-card); color: #fff; border: 1px solid var(--border-main); border-radius: 8px; padding: 5px 8px; font-family: var(--font-heading); font-size: 9px; letter-spacing: 0.5px; }
.sft-pop { position: fixed; z-index: 9999; width: 280px; max-width: calc(100vw - 16px); background: var(--bg-card); border: 1px solid var(--border-active); border-radius: 10px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6); padding: 10px; }
.sft-pop[hidden] { display: none; }
.sft-pop-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; font-family: var(--font-heading); font-size: 9px; letter-spacing: 1px; color: var(--lego-yellow); }
.sft-pop-close { background: transparent; border: 0; color: var(--text-muted); font-size: 16px; line-height: 1; cursor: pointer; padding: 2px 4px; }
.sft-pop-close:hover { color: #fff; }
.sft-pick-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 7px; }
.sft-pick { width: 100%; aspect-ratio: 1; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.18); cursor: pointer; padding: 0; }
.sft-pick.on { border-color: var(--lego-yellow); box-shadow: 0 0 0 2px rgba(242, 205, 55, 0.35); }
.sft-pick:hover, .sft-pick:focus-visible { border-color: #fff; outline: none; transform: scale(1.12); }
.sft-pick.trans { border-style: dashed; }
.sft-pop-name { margin-top: 8px; font-size: 11px; color: var(--text-secondary); min-height: 14px; }
#bom-table-body tr[data-color] { cursor: pointer; }
#bom-table-body tr[data-color]:hover, #bom-table-body tr[data-color]:focus-visible { background: rgba(255, 255, 255, 0.04); outline: none; }
#bom-table-body tr[data-color]:focus-visible .color-dot { box-shadow: 0 0 0 2px var(--lego-yellow); }
.sft-bom-hint { padding: 6px 14px 0; font-family: var(--font-heading); font-size: 8px; letter-spacing: 0.8px; color: var(--text-muted); }
@media (max-width: 600px) {
    .sft-pop.sheet { left: 8px !important; right: 8px; bottom: 8px; top: auto !important; width: auto; }
    .sft-pick-grid { grid-template-columns: repeat(8, 1fr); }
}
@media print { .sft-pop, .sft-bom-hint { display: none !important; } }
`;

    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const colorOf = (id) => (window.LEGO_COLORS && window.LEGO_COLORS[id]) || { name: id, hex: '#cccccc' };
    const click = () => { try { if (window.studForgeAudio && window.studForgeAudio.playRatchetClick) window.studForgeAudio.playRatchetClick(); } catch (e) { /* sound is optional */ } };

    function init() {
        const sf = window.studForge;
        if (!sf || !sf.viewer || !sf.reforge || !sf.registerPanel) return;
        const style = el('style'); style.id = 'sft-style'; style.textContent = CSS; document.head.appendChild(style);

        /* ── direct recolours for hard-coded colours ───────────── */
        let patches = {}, patchPrompt = null;   // { fromId: toId } for the idea in patchPrompt
        const applyPatches = (model) => {
            if (!model || !model.bricks) return;
            if (model.prompt !== patchPrompt) { patches = {}; patchPrompt = model.prompt; }   // a new idea starts clean
            const keys = Object.keys(patches);
            if (!keys.length) return;
            for (const b of model.bricks) if (patches[b.color]) b.color = patches[b.color];
        };
        const origLoad = sf.viewer.loadModel.bind(sf.viewer);
        sf.viewer.loadModel = (model) => { applyPatches(model); return origLoad(model); };

        const opts = () => sf.state.opts || {};
        const colorOverrides = () => Object.keys(opts().colors || {});
        const featureOverrides = () => Object.keys(opts().features || {});
        const hasColorChanges = () => colorOverrides().length > 0 || Object.keys(patches).length > 0;

        /** Every brick showing `from` becomes `to`: palette roles via reforge, the rest patched directly. */
        function recolor(from, to) {
            if (!from || !to || from === to || !window.LEGO_COLORS[to]) return;
            const pal = (sf.model && sf.model.palette) || {};
            const roles = ROLES.filter((r) => pal[r] === from);
            for (const k of Object.keys(patches)) if (patches[k] === from) patches[k] = to;   // chained swaps follow
            patchPrompt = sf.state.prompt;
            const colors = {};
            for (const r of roles) colors[r] = to;
            let model = sf.reforge(roles.length ? { colors } : {});
            if (model && model.bricks.some((b) => b.color === from)) { patches[from] = to; model = sf.reforge({}); }
            click();
        }
        function resetColors() {
            const colors = {};
            for (const k of colorOverrides()) colors[k] = null;
            patches = {};
            sf.reforge({ colors });
            click();
        }
        function resetFeatures() {
            const features = {};
            for (const k of featureOverrides()) features[k] = null;
            sf.reforge({ features });
            click();
        }

        /* ── colour picker popover ─────────────────────────────── */
        const pop = el('div', 'sft-pop'); pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Pick a colour');
        document.body.appendChild(pop);
        let popAnchor = null, lastFocus = null;
        const closePop = () => { if (pop.hidden) return; pop.hidden = true; popAnchor = null; if (lastFocus && lastFocus.isConnected) lastFocus.focus(); };
        const placePop = () => {
            if (!popAnchor || !popAnchor.isConnected) return closePop();
            const phone = window.innerWidth <= 600;
            pop.classList.toggle('sheet', phone);
            if (phone) { pop.style.left = ''; pop.style.top = ''; return; }
            const r = popAnchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
            let left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
            let top = r.bottom + 6;
            if (top + h > window.innerHeight - 8) top = r.top - h - 6;
            if (top < 8) top = 8;
            pop.style.left = `${Math.round(left)}px`; pop.style.top = `${Math.round(top)}px`;
        };
        function openPicker(anchor, current, onPick) {
            lastFocus = document.activeElement;
            pop.innerHTML = '';
            const head = el('div', 'sft-pop-head');
            head.appendChild(el('span', '', `SWAP ${colorOf(current).name.toUpperCase()} FOR…`));
            const x = el('button', 'sft-pop-close', '✕'); x.type = 'button'; x.title = 'Close'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', closePop);
            head.appendChild(x); pop.appendChild(head);
            const grid = el('div', 'sft-pick-grid'), name = el('div', 'sft-pop-name', colorOf(current).name);
            let focusMe = null;
            for (const [id, c] of Object.entries(window.LEGO_COLORS || {})) {
                const b = el('button', 'sft-pick' + (id === current ? ' on' : '') + (c.trans || /^TRANS_/.test(id) ? ' trans' : ''));
                b.type = 'button'; b.style.background = c.hex; b.title = c.name; b.setAttribute('aria-label', c.name); b.dataset.color = id;
                b.addEventListener('mouseenter', () => { name.textContent = c.name; });
                b.addEventListener('focus', () => { name.textContent = c.name; });
                b.addEventListener('click', () => { closePop(); onPick(id); });
                if (id === current) focusMe = b;
                grid.appendChild(b);
            }
            pop.appendChild(grid); pop.appendChild(name);
            popAnchor = anchor; pop.hidden = false;
            placePop();
            (focusMe || grid.firstChild).focus({ preventScroll: true });
        }
        document.addEventListener('mousedown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !(popAnchor && popAnchor.contains(e.target))) closePop(); });
        document.addEventListener('touchstart', (e) => { if (!pop.hidden && !pop.contains(e.target) && !(popAnchor && popAnchor.contains(e.target))) closePop(); }, { passive: true });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { e.preventDefault(); closePop(); } });
        window.addEventListener('resize', placePop);
        window.addEventListener('scroll', closePop, true);

        /* ── size dial ─────────────────────────────────────────── */
        const dials = [];
        const scaleId = () => { const s = opts().scale; return s == null ? 'standard' : s <= 0.85 ? 'micro' : s >= 1.4 ? 'big' : 'standard'; };
        function makeScaleDial(small) {
            const wrap = el('div', 'sft-seg' + (small ? ' sft-seg-sm' : ''));
            wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', 'Model size');
            for (const s of SCALES) {
                const b = el('button', 'sft-seg-btn', s.label); b.type = 'button'; b.dataset.scale = s.id; b.title = s.title;
                b.addEventListener('click', () => { if (scaleId() === s.id) return; sf.reforge({ scale: s.scale }); click(); });
                wrap.appendChild(b);
            }
            dials.push(wrap);
            return wrap;
        }
        const syncDials = () => {
            const cur = scaleId();
            for (let i = dials.length - 1; i >= 0; i--) {
                if (!dials[i].isConnected) { dials.splice(i, 1); continue; }
                for (const b of dials[i].querySelectorAll('.sft-seg-btn')) { const on = b.dataset.scale === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
            }
        };

        /* ── the tool dock: size dial + reset chip ─────────────── */
        const dock = el('div', 'sft-dock');
        dock.appendChild(el('span', 'sft-dock-label', 'SIZE'));
        dock.appendChild(makeScaleDial(true));
        const resetChip = el('button', 'tool-chip sft-reset', '↺ RESET COLOURS'); resetChip.type = 'button'; resetChip.hidden = true; resetChip.title = 'Back to the idea\'s own colours';
        resetChip.addEventListener('click', resetColors);
        dock.appendChild(resetChip);
        sf.dock(dock);

        /* ── the TWEAKS panel ──────────────────────────────────── */
        let panelBody = null;
        sf.registerPanel({ id: 'tweaks', title: '🎛️ TWEAKS', render: (body) => { panelBody = body; } });
        const section = (title, mini) => {
            const sec = el('section', 'sft-sec'), h = el('h4');
            h.appendChild(el('span', '', title));
            if (mini) h.appendChild(mini);
            sec.appendChild(h);
            return sec;
        };
        const miniReset = (label, onClick) => { const b = el('button', 'tool-chip sft-reset', label); b.type = 'button'; b.addEventListener('click', onClick); return b; };
        const featureValue = (o) => { const f = opts().features || {}; return f[o.id] !== undefined ? f[o.id] : o.default; };
        const setFeature = (id, value) => { sf.reforge({ features: { [id]: value } }); click(); };

        function renderPanel() {
            if (!panelBody) return;
            panelBody.innerHTML = '';
            const model = sf.model;
            if (!model) return;

            // Size.
            const size = section('📐 SIZE');
            size.appendChild(makeScaleDial(false));
            panelBody.appendChild(size);

            // Colour roles the builder actually used, each opening the picker for that role only.
            const used = new Set(model.bricks.map((b) => b.color));
            const pal = model.palette || {};
            const roles = ROLES.filter((r) => pal[r] && used.has(pal[r]));
            const colours = section('🎨 COLOURS', hasColorChanges() ? miniReset('↺ RESET', resetColors) : null);
            if (roles.length) {
                const row = el('div', 'sft-row');
                const overridden = new Set(colorOverrides());
                for (const r of roles) {
                    const c = colorOf(pal[r]);
                    const b = el('button', 'sft-swatch' + (overridden.has(r) ? ' mod' : '')); b.type = 'button';
                    b.title = `${r[0].toUpperCase() + r.slice(1)}: ${c.name} — tap to swap`; b.dataset.role = r;
                    const dot = el('span', 'sft-dot' + (/^TRANS_/.test(pal[r]) ? ' trans' : '')); dot.style.background = c.hex;
                    b.appendChild(dot); b.appendChild(el('span', 'sft-swatch-label', r.toUpperCase()));
                    b.addEventListener('click', () => openPicker(b, pal[r], (to) => { sf.reforge({ colors: { [r]: to } }); click(); }));
                    row.appendChild(b);
                }
                colours.appendChild(row);
                colours.appendChild(el('p', 'sft-hint', 'Tap a role to swap it, or tap any row in PARTS to recolour that exact colour everywhere.'));
            } else colours.appendChild(el('p', 'sft-hint', 'This build picks its own colours — tap a row in PARTS to swap one.'));
            panelBody.appendChild(colours);

            // The dials this builder declared.
            const options = model.options || [];
            const dialsSec = section('🎛️ DIALS', featureOverrides().length ? miniReset('↺ RESET', resetFeatures) : null);
            if (!options.length) dialsSec.appendChild(el('p', 'sft-hint', 'This idea has no dials yet — try a house, tower or truck.'));
            for (const o of options) {
                const v = featureValue(o), modified = (opts().features || {})[o.id] !== undefined;
                const row = el('div', 'sft-opt' + (modified ? ' mod' : ''));
                const labelId = `sft-opt-${o.id}`;
                row.appendChild(el('span', 'sft-opt-label', o.label || o.id)).id = labelId;
                if (o.type === 'bool') {
                    const sw = el('button', 'sft-switch'); sw.type = 'button'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', v ? 'true' : 'false'); sw.setAttribute('aria-labelledby', labelId); sw.dataset.option = o.id;
                    sw.addEventListener('click', () => setFeature(o.id, !v));
                    row.appendChild(sw);
                } else if (Array.isArray(o.choices) && o.choices.length > 4) {
                    const sel = el('select', 'sft-select'); sel.setAttribute('aria-labelledby', labelId); sel.dataset.option = o.id;
                    for (const c of o.choices) { const op = el('option', '', String(c).toUpperCase()); op.value = String(c); op.selected = String(c) === String(v); sel.appendChild(op); }
                    sel.addEventListener('change', () => setFeature(o.id, sel.value));
                    row.appendChild(sel);
                } else {
                    const seg = el('div', 'sft-seg sft-seg-sm'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-labelledby', labelId); seg.dataset.option = o.id;
                    for (const c of o.choices || []) {
                        const on = String(c) === String(v);
                        const b = el('button', 'sft-seg-btn' + (on ? ' on' : ''), String(c).toUpperCase()); b.type = 'button'; b.dataset.value = String(c); b.setAttribute('aria-pressed', on ? 'true' : 'false');
                        b.addEventListener('click', () => { if (!on) setFeature(o.id, c); });
                        seg.appendChild(b);
                    }
                    row.appendChild(seg);
                }
                dialsSec.appendChild(row);
            }
            panelBody.appendChild(dialsSec);
            syncDials();
        }

        /* ── the PARTS rows open the picker too ────────────────── */
        const tbody = document.getElementById('bom-table-body');
        const rowPick = (tr) => { const from = tr.dataset.color; openPicker(tr.querySelector('.color-dot') || tr, from, (to) => recolor(from, to)); };
        if (tbody) {
            tbody.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-color]'); if (tr) rowPick(tr); });
            tbody.addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const tr = e.target.closest('tr[data-color]'); if (tr) { e.preventDefault(); rowPick(tr); } });
            const header = document.querySelector('#panel-parts .bom-header');
            if (header) header.insertAdjacentElement('afterend', el('div', 'sft-bom-hint', 'TAP A PART TO SWAP ITS COLOUR EVERYWHERE'));
        }
        const decorateRows = () => {
            if (!tbody) return;
            for (const tr of tbody.querySelectorAll('tr[data-color]')) { tr.tabIndex = 0; tr.setAttribute('role', 'button'); tr.title = `${colorOf(tr.dataset.color).name} — tap to swap this colour everywhere`; }
        };

        sf.on('model', () => { closePop(); syncDials(); renderPanel(); decorateRows(); resetChip.hidden = !hasColorChanges(); });
        if (sf.model) { syncDials(); renderPanel(); decorateRows(); resetChip.hidden = !hasColorChanges(); }

        // A small API for other features and the tests.
        sf.tweaks = { recolor, resetColors, resetFeatures, openPicker, get patches() { return { ...patches }; } };
    }

    if (window.studForge) init(); else document.addEventListener('studforge:ready', init, { once: true });
})();
