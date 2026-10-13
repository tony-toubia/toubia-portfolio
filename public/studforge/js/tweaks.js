// StudForge tweaks: swap any colour, dial the size, and flip the options a
// builder declares (garden, chimney, moat, wings...). Lives entirely on the
// studForge platform API, as three sections of the workbench's Style tab:
//   SIZE     Micro / Standard / Big                    (section id 'tweaks')
//   COLOURS  the palette roles the build uses           (section id 'tweaks-colours')
//   SHAPE    the dials the builder declared             (section id 'tweaks-shape')
// A colour picker opens from a COLOURS swatch or from any row of the core parts
// list (Parts tab), and every change is a studForge.reforge(...) with the changed
// opts, so the same idea is built again instantly.
// Colours a builder hard-codes (wheels, roads, glass) have no palette role, so
// those are recoloured directly: viewer.loadModel is wrapped to patch the
// bricks before the viewer and the parts list see the model. The patches stay
// for the current idea, so they survive re-forges, and clear on a new idea.
(() => {
    const ROLES = ['primary', 'secondary', 'accent', 'trim', 'roof', 'glass', 'dark', 'metal', 'wood', 'ground', 'light', 'water', 'leaf'];
    const SCALES = [
        { id: 'micro', label: 'Micro', hint: 'pocket-sized', scale: 0.7, title: 'A pocket-sized build' },
        { id: 'standard', label: 'Standard', hint: 'as designed', scale: null, title: 'The size the idea asks for' },
        { id: 'big', label: 'Big', hint: 'for display', scale: 1.45, title: 'A chunky display build' },
    ];
    const CSS = `
/* section headings carry a reset action on the right */
#panel-tweaks-colours > .bench-h, #panel-tweaks-shape > .bench-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sft-reset { margin: -7px 0; background: none; border: 1px solid rgba(242, 205, 55, 0.4); color: var(--lego-yellow); border-radius: 999px; padding: 0 10px; height: 26px; font-family: var(--font-body); font-size: 12px; font-weight: 700; letter-spacing: 0.2px; cursor: pointer; white-space: nowrap; text-transform: none; }
.sft-reset:hover, .sft-reset:focus-visible { background: rgba(242, 205, 55, 0.12); outline: none; }
.sft-reset[hidden] { display: none; }
.sft-hint { font-size: 13px; color: var(--text-muted); line-height: 1.4; margin: 0; }
.sft-hint + .sft-hint, .sft-grid + .sft-hint { margin-top: 10px; }
.sft-link { background: none; border: 0; padding: 0; color: var(--lego-yellow); font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }

/* size: a full-width segmented control */
.sft-size { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--border-main); border-radius: 10px; overflow: hidden; background: rgba(9, 12, 19, 0.5); }
.sft-size-btn { background: none; border: 0; border-left: 1px solid var(--border-main); color: var(--text-secondary); cursor: pointer; padding: 7px 4px 6px; display: flex; flex-direction: column; align-items: center; gap: 1px; min-height: 44px; justify-content: center; }
.sft-size-btn:first-child { border-left: 0; }
.sft-size-btn b { font-family: var(--font-heading); font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
.sft-size-btn small { font-size: 11px; color: var(--text-muted); font-weight: 600; }
.sft-size-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.03); }
.sft-size-btn.on { background: rgba(242, 205, 55, 0.12); color: var(--lego-yellow); box-shadow: inset 0 0 0 1px rgba(242, 205, 55, 0.55); }
.sft-size-btn.on small { color: rgba(242, 205, 55, 0.75); }
.sft-size-btn:focus-visible { outline: 2px solid var(--lego-yellow); outline-offset: -2px; }

/* colours: a grid of role tiles */
.sft-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 6px; }
.sft-swatch { background: rgba(9, 12, 19, 0.5); border: 1px solid var(--border-main); border-radius: 9px; padding: 6px 8px; min-height: 44px; display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-secondary); text-align: left; min-width: 0; }
.sft-swatch:hover, .sft-swatch:focus-visible { border-color: var(--lego-yellow); outline: none; }
.sft-swatch.mod { border-color: rgba(242, 205, 55, 0.45); }
.sft-dot { width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.3); box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.18); flex: none; }
.sft-dot.trans { border-style: dashed; }
.sft-sw-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
.sft-sw-role { font-size: 14px; font-weight: 700; color: #e2e8f0; }
.sft-swatch.mod .sft-sw-role { color: var(--lego-yellow); }
.sft-sw-name { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* shape: one row per dial */
.sft-opt { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 42px; padding: 4px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
.sft-opt:first-child { padding-top: 0; }
.sft-opt:last-child { border-bottom: 0; padding-bottom: 0; }
.sft-opt-label { font-size: 15px; font-weight: 700; color: #e2e8f0; }
.sft-opt.mod .sft-opt-label { color: var(--lego-yellow); }
.sft-seg { display: inline-flex; border: 1px solid var(--border-main); border-radius: 8px; overflow: hidden; background: rgba(9, 12, 19, 0.5); flex: none; max-width: 70%; }
.sft-seg-btn { background: transparent; border: 0; border-left: 1px solid var(--border-main); color: var(--text-secondary); font-family: var(--font-body); font-size: 13px; font-weight: 700; padding: 0 11px; height: 30px; cursor: pointer; white-space: nowrap; }
.sft-seg-btn:first-child { border-left: 0; }
.sft-seg-btn:hover { color: #fff; }
.sft-seg-btn.on { background: rgba(242, 205, 55, 0.14); color: var(--lego-yellow); }
.sft-seg-btn:focus-visible { outline: 2px solid var(--lego-yellow); outline-offset: -2px; }
.sft-switch { width: 42px; height: 24px; border-radius: 12px; border: 1px solid var(--border-main); background: rgba(255, 255, 255, 0.08); position: relative; cursor: pointer; flex-shrink: 0; padding: 0; }
.sft-switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--text-muted); transition: left 0.15s, background 0.15s; }
.sft-switch[aria-checked="true"] { background: rgba(242, 205, 55, 0.2); border-color: var(--lego-yellow); }
.sft-switch[aria-checked="true"]::after { left: 21px; background: var(--lego-yellow); }
.sft-switch:focus-visible { outline: 2px solid var(--lego-yellow); outline-offset: 2px; }
.sft-select { background: rgba(9, 12, 19, 0.5); color: #fff; border: 1px solid var(--border-main); border-radius: 8px; height: 30px; padding: 0 8px; font-family: var(--font-body); font-size: 13px; font-weight: 700; max-width: 60%; }

/* the colour picker */
.sft-pop { position: fixed; z-index: 9999; width: 288px; max-width: calc(100vw - 16px); background: var(--bg-card); border: 1px solid var(--border-active); border-radius: 12px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6); padding: 10px 12px 12px; }
.sft-pop[hidden] { display: none; }
.sft-pop-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; font-family: var(--font-heading); font-size: 9px; letter-spacing: 1px; color: var(--lego-yellow); }
.sft-pop-close { background: transparent; border: 0; color: var(--text-muted); font-size: 16px; line-height: 1; cursor: pointer; width: 30px; height: 30px; margin: -6px -6px -6px 0; }
.sft-pop-close:hover { color: #fff; }
.sft-pick-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 7px; }
.sft-pick { width: 100%; aspect-ratio: 1; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.18); cursor: pointer; padding: 0; }
.sft-pick.on { border-color: var(--lego-yellow); box-shadow: 0 0 0 2px rgba(242, 205, 55, 0.35); }
.sft-pick:hover, .sft-pick:focus-visible { border-color: #fff; outline: none; transform: scale(1.12); }
.sft-pick.trans { border-style: dashed; }
.sft-pop-name { margin-top: 8px; font-size: 13px; color: var(--text-secondary); min-height: 16px; }

/* the core parts list: each row opens the picker */
#bom-table-body tr[data-color] { cursor: pointer; }
#bom-table-body tr[data-color]:hover, #bom-table-body tr[data-color]:focus-visible { background: rgba(255, 255, 255, 0.04); outline: none; }
#bom-table-body tr[data-color]:focus-visible .color-dot { box-shadow: 0 0 0 2px var(--lego-yellow); }

@media (max-width: 767px) {
    .sft-reset { height: 32px; margin: -10px 0; }
    .sft-seg-btn, .sft-select { height: 34px; }
    /* the picker is a sheet just above the tab bar */
    .sft-pop.sheet { left: 8px !important; right: 8px; top: auto !important; bottom: calc(var(--tabbar-h, 58px) + var(--safe-b, 0px) + 8px); width: auto; max-width: none; }
    .sft-pick-grid { grid-template-columns: repeat(8, 1fr); }
}
@media print { .sft-pop { display: none !important; } }
`;

    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const colorOf = (id) => (window.LEGO_COLORS && window.LEGO_COLORS[id]) || { name: id, hex: '#cccccc' };
    const cap = (s) => { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); };
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
        // A real set (reference.js) is not forged, so it has no size or shape dials: only colours.
        const isReference = () => !!(sf.model && sf.model.kind === 'reference');

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
        const closePop = () => { if (pop.hidden) return; pop.hidden = true; popAnchor = null; if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true }); };
        const placePop = () => {
            if (!popAnchor || !popAnchor.isConnected) return closePop();
            const phone = sf.isPhone ? sf.isPhone() : window.innerWidth <= 767;
            pop.classList.toggle('sheet', phone);
            if (phone) { pop.style.left = ''; pop.style.top = ''; return; }
            const r = popAnchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
            // Beside the workbench when there is room (it hugs the right edge), else under the anchor.
            let left = r.left - w - 10, top = r.top - 8;
            if (left < 8) { left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)); top = r.bottom + 6; if (top + h > window.innerHeight - 8) top = r.top - h - 6; }
            top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
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
        window.addEventListener('scroll', (e) => { if (!pop.contains(e.target)) closePop(); }, true);
        sf.on('panel', closePop);

        /* ── the three Style sections ──────────────────────────── */
        const sizeSec = sf.registerPanel({ id: 'tweaks', title: 'SIZE', group: 'style', order: 10 });
        const colSec = sf.registerPanel({ id: 'tweaks-colours', title: 'COLOURS', group: 'style', order: 20 });
        const shapeSec = sf.registerPanel({ id: 'tweaks-shape', title: 'SHAPE', group: 'style', order: 30 });
        const headReset = (sec, label, title, onClick) => {
            const b = el('button', 'sft-reset', label); b.type = 'button'; b.title = title; b.hidden = true;
            b.addEventListener('click', onClick);
            const h = sec.section.querySelector('.bench-h'); if (h) h.appendChild(b);
            return b;
        };
        const colReset = headReset(colSec, '↺ Reset colours', 'Back to the idea\'s own colours', resetColors);
        const shapeReset = headReset(shapeSec, '↺ Reset shape', 'Back to the idea\'s own options', resetFeatures);

        // Size.
        const scaleId = () => { const s = opts().scale; return s == null ? 'standard' : s <= 0.85 ? 'micro' : s >= 1.4 ? 'big' : 'standard'; };
        const sizeCtl = el('div', 'sft-size'); sizeCtl.setAttribute('role', 'group'); sizeCtl.setAttribute('aria-label', 'Model size');
        for (const s of SCALES) {
            const b = el('button', 'sft-size-btn'); b.type = 'button'; b.dataset.scale = s.id; b.title = s.title;
            b.appendChild(el('b', '', s.label)); b.appendChild(el('small', '', s.hint));
            b.addEventListener('click', () => { if (scaleId() === s.id) return; sf.reforge({ scale: s.scale }); click(); });
            sizeCtl.appendChild(b);
        }
        const sizeNote = el('p', 'sft-hint', 'A real set is built at its own size.');
        sizeSec.body.append(sizeCtl, sizeNote);
        function renderSize() {
            const ref = isReference(), cur = scaleId();
            sizeCtl.hidden = ref; sizeNote.hidden = !ref;
            for (const b of sizeCtl.children) { const on = b.dataset.scale === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
        }

        // Colour roles the builder actually used, each opening the picker for that role only.
        const partsLink = (before, after) => {
            const p = el('p', 'sft-hint'); p.appendChild(document.createTextNode(before));
            const a = el('button', 'sft-link', 'Parts'); a.type = 'button'; a.addEventListener('click', () => sf.showPanel('parts'));
            p.appendChild(a); p.appendChild(document.createTextNode(after));
            return p;
        };
        function renderColours() {
            const body = colSec.body, model = sf.model;
            body.innerHTML = '';
            colReset.hidden = !hasColorChanges();
            if (!model) return;
            const used = new Set(model.bricks.map((b) => b.color));
            const pal = model.palette || {};
            const roles = ROLES.filter((r) => pal[r] && used.has(pal[r]));
            if (roles.length) {
                const grid = el('div', 'sft-grid');
                const overridden = new Set(colorOverrides());
                for (const r of roles) {
                    const c = colorOf(pal[r]);
                    const b = el('button', 'sft-swatch' + (overridden.has(r) ? ' mod' : '')); b.type = 'button';
                    b.title = `${cap(r)}: ${c.name}. Tap to swap it`; b.dataset.role = r;
                    const dot = el('span', 'sft-dot' + (/^TRANS_/.test(pal[r]) ? ' trans' : '')); dot.style.background = c.hex;
                    const text = el('span', 'sft-sw-text');
                    text.appendChild(el('span', 'sft-sw-role', cap(r)));
                    text.appendChild(el('span', 'sft-sw-name', c.name));
                    b.append(dot, text);
                    b.addEventListener('click', () => openPicker(b, pal[r], (to) => { sf.reforge({ colors: { [r]: to } }); click(); }));
                    grid.appendChild(b);
                }
                body.appendChild(grid);
                body.appendChild(partsLink('Tap a colour to swap it. In ', ', tap any part to recolour that exact colour everywhere.'));
            } else {
                body.appendChild(partsLink(isReference() ? 'A real set keeps its own design. In ' : 'This build picks its own colours. In ', ', tap any part to recolour that colour everywhere.'));
            }
        }

        // The dials this builder declared.
        const featureValue = (o) => { const f = opts().features || {}; return f[o.id] !== undefined ? f[o.id] : o.default; };
        const setFeature = (id, value) => { sf.reforge({ features: { [id]: value } }); click(); };
        function renderShape() {
            const body = shapeSec.body, model = sf.model;
            body.innerHTML = '';
            const ref = isReference();
            shapeSec.section.hidden = ref || !model;
            shapeReset.hidden = !featureOverrides().length;
            if (!model || ref) return;
            const options = model.options || [];
            if (!options.length) { body.appendChild(el('p', 'sft-hint', 'This idea has no shape options yet. Try a house, a tower or a truck.')); return; }
            for (const o of options) {
                const v = featureValue(o), modified = (opts().features || {})[o.id] !== undefined;
                const row = el('div', 'sft-opt' + (modified ? ' mod' : ''));
                const labelId = `sft-opt-${o.id}`;
                row.appendChild(el('span', 'sft-opt-label', o.label || cap(o.id))).id = labelId;
                if (o.type === 'bool') {
                    const sw = el('button', 'sft-switch'); sw.type = 'button'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', v ? 'true' : 'false'); sw.setAttribute('aria-labelledby', labelId); sw.dataset.option = o.id;
                    sw.addEventListener('click', () => setFeature(o.id, !v));
                    row.appendChild(sw);
                } else if (Array.isArray(o.choices) && o.choices.length > 4) {
                    const sel = el('select', 'sft-select'); sel.setAttribute('aria-labelledby', labelId); sel.dataset.option = o.id;
                    for (const c of o.choices) { const op = el('option', '', cap(c)); op.value = String(c); op.selected = String(c) === String(v); sel.appendChild(op); }
                    sel.addEventListener('change', () => setFeature(o.id, sel.value));
                    row.appendChild(sel);
                } else {
                    const seg = el('div', 'sft-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-labelledby', labelId); seg.dataset.option = o.id;
                    for (const c of o.choices || []) {
                        const on = String(c) === String(v);
                        const b = el('button', 'sft-seg-btn' + (on ? ' on' : ''), cap(c)); b.type = 'button'; b.dataset.value = String(c); b.setAttribute('aria-pressed', on ? 'true' : 'false');
                        b.addEventListener('click', () => { if (!on) setFeature(o.id, c); });
                        seg.appendChild(b);
                    }
                    row.appendChild(seg);
                }
                body.appendChild(row);
            }
        }

        /* ── the core parts list rows open the picker too ──────── */
        const tbody = document.getElementById('bom-table-body');
        const rowPick = (tr) => { const from = tr.dataset.color; openPicker(tr.querySelector('.color-dot') || tr, from, (to) => recolor(from, to)); };
        if (tbody) {
            tbody.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-color]'); if (tr) rowPick(tr); });
            tbody.addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const tr = e.target.closest('tr[data-color]'); if (tr) { e.preventDefault(); rowPick(tr); } });
        }
        const decorateRows = () => {
            if (!tbody) return;
            for (const tr of tbody.querySelectorAll('tr[data-color]')) { tr.tabIndex = 0; tr.setAttribute('role', 'button'); tr.title = `${colorOf(tr.dataset.color).name}: tap to swap this colour everywhere`; }
        };

        const renderAll = () => { renderSize(); renderColours(); renderShape(); decorateRows(); };
        sf.on('model', () => { closePop(); renderAll(); });
        if (sf.model) renderAll();

        // A small API for other features and the tests.
        sf.tweaks = {
            recolor, resetColors, resetFeatures, openPicker,
            setScale(id) { const s = SCALES.find((x) => x.id === id); if (s && scaleId() !== id) sf.reforge({ scale: s.scale }); },
            get scale() { return scaleId(); },
            get patches() { return { ...patches }; },
        };
    }

    if (window.studForge) init(); else document.addEventListener('studforge:ready', init, { once: true });
})();
