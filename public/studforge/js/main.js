// StudForge core: forging, the parts list, the canvas controls, the app shell, and the small
// platform feature modules plug into.
//
// The shell has a home screen, two places, and the canvas:
//   HOME       the kit library, full screen. Every visit without a share link opens on it; picking a kit (or forging
//              an idea from its "make your own" card) opens the kit view. ← LIBRARY in the header and the phone tab
//              bar's LIBRARY tab come back to it. Nothing is forged behind it: the viewer sleeps while it shows.
//   MAKE       the create bar (desktop) / the Make sheet (phones): the prompt, the engine picker, suggestions,
//              and the "start from" sources (the library and mosaics) features add.
//   WORKBENCH  four tabs about the current model: build, parts, style, learn. Features add sections to them.
//   CANVAS     view tools (views, reset, plus features' widgets) and the control dock: the step scrubber and the
//              explode slider, always in view. On phones the view tools join the dock as a labelled row.
//
// Features (instructions, tweaks, gallery, studio, buying help, the AI idea service...) live in their own
// files, loaded after this one. They use:
//
//   studForge.forge(prompt, variant, opts)   forge an idea (opts: see BrickGenerator.generateFromPrompt)
//   studForge.reforge(patch)                 the current idea again with changed opts, e.g. { colors: { roof: 'BLUE' } }
//   studForge.model / .state                 the current model and { prompt, variant, opts }
//   studForge.on(evt, fn)                    'model' | 'step' | 'explode' | 'forging' | 'panel' (tab id) | 'section'
//                                            (section id) | 'engine' (engine id) | 'source' (source id or null) | 'make' (open?)
//   studForge.registerPanel({ id, title, group, order, render(el) })
//                                            a section in a workbench tab (group: 'build' | 'parts' | 'style' | 'learn');
//                                            render fills `el` (class panel-body). Lower `order` comes first (the core
//                                            parts list is 50, the build tab's model header is 0). Returns { body, section, show }.
//   studForge.showPanel(id)                  open a tab ('build'...) or the tab holding section `id`, scrolled to it;
//                                            also 'make' or a source id
//   studForge.addSource({ id, icon, label, hint, order, render(el), open })
//                                            a "start from" source in Make (library, mosaic). Returns { body, show }.
//                                            With `open`, picking it calls open() instead of showing a panel in Make.
//   studForge.openHome() / .closeHome()      show / leave the home screen (the kit library); .isHome; #home-library
//                                            is where the library renders; 'home' event (open?)
//   studForge.showSource(id) / .closeMake()  open Make on a source's panel / close Make
//   studForge.registerEngine({ id, icon, label, hint, order })
//                                            a choice in the engine picker (the core has 'quick'). Returns { setLocked(bool) }.
//   studForge.engine / .setEngine(id)        the chosen engine (remembered on this browser)
//   studForge.shareItem({ id, icon, label, hint, order, onClick })   an item in the header Share menu
//   studForge.headerAction(el)               a button in the header next to Share (Save)
//   studForge.summarySlot(el)                an extra bit of the header's model summary (the price)
//   studForge.widget(el)                     a view tool on the canvas (spin, parts layout); on phones it joins the dock
//   studForge.dock(el)                       legacy: an item in the ⋯ menu
//   studForge.toast(text)                    a short status message
//   studForge.isPhone()                      the phone layout is showing
//   studForge.viewer / .generator / .bom     the 3D viewer, the generator, the current parts list
document.addEventListener('DOMContentLoaded', () => {
    // Capture shared links before gallery.js updates the address for the first model.
    const initialSearch = location.search;
    // Inside the portfolio's desktop window the window chrome carries the way back; the /studforge page embeds the app
    // full screen with ?standalone=1, so the app keeps its own back link (which leaves the frame: target _top).
    if (window.self !== window.top && !/[?&]standalone=1\b/.test(location.search)) document.body.classList.add('in-iframe');

    const viewer = new window.StudForgeViewer('viewport-3d');
    const generator = new window.BrickGenerator();
    const $ = (id) => document.getElementById(id);
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
    };

    let currentModel = null;
    let bomParts = [];
    const state = { prompt: '', variant: 0, opts: {} };
    const listeners = {};
    const on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); return () => { listeners[evt] = listeners[evt].filter((f) => f !== fn); }; };
    // emit returns true when any listener returned true ("handled"), so core fallbacks can step aside.
    const emit = (evt, ...args) => { let handled = false; for (const fn of listeners[evt] || []) { try { if (fn(...args) === true) handled = true; } catch (e) { console.error(`studForge ${evt} listener`, e); } } return handled; };

    const promptInput = $('input-prompt'), btnGenerate = $('btn-generate'), btnSurprise = $('btn-surprise'), inspoContainer = $('inspo-pills');
    const modelTitle = $('model-title'), modelDesc = $('model-desc'), modelBadge = $('model-badge'), modelPieceCount = $('model-piece-count'), modelStepCount = $('model-step-count'), modelEstTime = $('model-est-time'), modelDims = $('model-dims');
    const explodeSlider = $('slider-explode'), explodeVal = $('val-explode'), stepSlider = $('slider-step'), stepVal = $('val-step'), stepHint = $('val-step-hint');
    const bomTableBody = $('bom-table-body');
    const body = document.body;
    body.classList.add('no-model');   // until the first model shows: the kit-only controls stay hidden

    const SURPRISES = ['haunted lighthouse', 'giant purple octopus', 'cozy bakery with a garden', 'steampunk airship', 'neon cyberpunk arcade cabinet', 'red fire truck', 'medieval watchtower', 'tropical island with a hut', 'green t-rex', 'white space shuttle', 'pink cupcake', 'a knight with a shield', 'winter cabin in the snow', 'yellow school bus', 'blue whale', 'royal throne', 'pirate galleon', 'desert pyramid', 'moon lander', 'orange tractor', 'christmas tree', 'black police car', 'a cat', 'volcano', 'retro flying saucer', 'golden trophy', 'bonsai tree', 'tie fighter', 'a cheeseburger', 'pagoda shrine'];

    const phoneMQ = window.matchMedia('(max-width: 767px)');
    const drawerMQ = window.matchMedia('(min-width: 768px) and (max-width: 1100px)');
    const isPhone = () => phoneMQ.matches;
    const isDrawer = () => drawerMQ.matches;

    const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    /** Insert `node` into `parent` keeping children sorted by data-order. */
    const insertOrdered = (parent, node, order) => {
        node.dataset.order = String(order);
        const after = [...parent.children].find((c) => c.dataset.order != null && Number(c.dataset.order) > order);
        parent.insertBefore(node, after || null);
    };

    /* ── toast ────────────────────────────────────────────────── */
    let toastTimer = 0;
    const toast = (text, ms = 2200) => { const t = $('sf-toast'); t.textContent = text; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms); };

    /* ── menus (Share, ⋯, source, engine, view) ──────────────── */
    const menus = [...document.querySelectorAll('.sf-menu')];
    const closeMenus = (except) => { for (const m of menus) if (m !== except && m.classList.contains('open')) { m.classList.remove('open'); const b = m.querySelector(':scope > button'); if (b) b.setAttribute('aria-expanded', 'false'); } };
    for (const m of menus) {
        const btn = m.querySelector(':scope > button');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = !m.classList.contains('open');
            closeMenus(m);
            m.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open));
            if (open && m.id !== 'source-menu') closeCreatePop();
        });
        // Picking an item closes the menu (sliders and other controls inside a popover do not).
        m.querySelector('.sf-menu-list').addEventListener('click', (e) => { if (e.target.closest('.sf-menu-item')) closeMenus(); });
    }
    document.addEventListener('click', (e) => { if (!e.target.closest('.sf-menu')) closeMenus(); });

    const menuItem = ({ icon, label, hint }) => el('button', 'sf-menu-item', `<span class="mi-ico">${icon || ''}</span><span class="mi-text">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>`);

    /* ── workbench tabs and sections ──────────────────────────── */
    const TABS = ['build', 'parts', 'style', 'learn'];
    const tabs = $('side-tabs'), panels = $('side-panels'), bench = $('bom-card');
    let currentTab = TABS.includes(store.get('studforge.tab')) ? store.get('studforge.tab') : 'build';
    const tabScroll = (tab) => $(`tab-${tab}`).querySelector('.tab-scroll');
    const sectionTab = {};   // section id → tab

    // Phones: the workbench is a bottom sheet with three heights. Tablets: a drawer over the canvas.
    let sheet = 'peek';
    let homeOpen = false;
    const setSheet = (s) => {
        sheet = s; body.dataset.sheet = s;
        for (const b of document.querySelectorAll('#tabbar .tb')) b.classList.toggle('on', b.dataset.tab === (homeOpen ? 'library' : body.classList.contains('make-open') ? 'make' : s === 'peek' ? '' : currentTab));
        requestAnimationFrame(updateDockCover);
    };
    const setBenchOpen = (open) => { body.classList.toggle('bench-open', open); };

    const showTab = (tab, { reveal = true } = {}) => {
        if (!TABS.includes(tab)) return;
        currentTab = tab; store.set('studforge.tab', tab);
        for (const t of tabs.querySelectorAll('.side-tab')) { const onT = t.dataset.tab === tab; t.classList.toggle('on', onT); t.setAttribute('aria-selected', String(onT)); }
        for (const p of panels.querySelectorAll('.side-panel')) p.classList.toggle('on', p.dataset.tab === tab);
        if (reveal) {
            if (isPhone()) { closeMake(); if (sheet === 'peek') setSheet('half'); else setSheet(sheet); }
            else if (isDrawer()) setBenchOpen(true);
        }
        paintPeek();
        emit('panel', tab);
    };
    tabs.addEventListener('click', (e) => {
        const t = e.target.closest('.side-tab'); if (!t) return;
        // On a tablet, tapping the open tab closes the drawer.
        if (isDrawer() && body.classList.contains('bench-open') && t.dataset.tab === currentTab) { setBenchOpen(false); return; }
        showTab(t.dataset.tab);
    });
    $('btn-bench-close').addEventListener('click', () => { if (isPhone()) setSheet('peek'); else setBenchOpen(false); });

    // Legacy panels (registered without a group) land where the new layout puts them.
    const LEGACY_GROUP = { steps: 'build', instructions: 'build', buy: 'parts', parts: 'parts', tweaks: 'style', studio: 'style', realsets: 'learn', gallery: 'make', mosaic: 'make' };
    const registerPanel = ({ id, title, group, order, render }) => {
        group = group || LEGACY_GROUP[id] || 'learn';
        if (group === 'make') { const src = addSource({ id, label: String(title || id).replace(/^\S+\s/, ''), icon: String(title || '').split(' ')[0], render }); return { body: src.body, section: src.body, show: src.show }; }
        const sec = el('section', 'bench-sec'); sec.id = `panel-${id}`;
        if (title) sec.appendChild(el('h4', 'bench-h', esc(title)));
        const b = el('div', 'panel-body'); sec.appendChild(b);
        insertOrdered(tabScroll(group), sec, order == null ? 100 : order);
        sectionTab[id] = group;
        if (render) render(b);
        return { body: b, section: sec, show: () => showPanel(id) };
    };
    sectionTab.parts = 'parts';

    /** A tab, a section (opens its tab and scrolls to it), 'make', or a source. */
    function showPanel(id) {
        if (id === 'make') { openMake(); return; }
        if (sources[id]) { showSource(id); return; }
        if (TABS.includes(id)) { showTab(id); return; }
        const tab = sectionTab[id]; if (!tab) return;
        showTab(tab);
        const sec = $(`panel-${id}`);
        if (sec) {
            const sc = tabScroll(tab);
            requestAnimationFrame(() => { sc.scrollTo({ top: Math.max(0, sec.offsetTop - sc.offsetTop - 6), behavior: 'smooth' }); });
            sec.classList.remove('flash'); void sec.offsetWidth; sec.classList.add('flash');
        }
        emit('section', id);
    }

    /* ── header: Share menu, actions, summary, ⋯ ───────────────── */
    const shareItem = ({ id, icon, label, hint, order = 100, onClick }) => {
        const it = menuItem({ icon, label, hint }); if (id) it.id = `share-${id}`; it.type = 'button';
        it.addEventListener('click', (e) => { if (onClick) onClick(e); });
        insertOrdered($('share-list'), it, order);
        return it;
    };
    const headerAction = (node) => { $('head-actions').appendChild(node); return node; };
    const summarySlot = (node) => { $('summary-slot').appendChild(node); return node; };
    /** Legacy dock(): the control goes into the ⋯ menu instead of a chip row. */
    const dock = (node) => { $('more-extra').appendChild(node); node.classList.add('more-extra-item'); return node; };
    const widget = (node) => { $('viewport-widgets').appendChild(node); return node; };
    $('model-summary').addEventListener('click', () => showTab('build'));

    /* ── Make: sources, engines, suggestions ──────────────────── */
    const createBar = $('create-bar'), createPop = $('create-pop');
    const sources = {};
    let activeSource = null;
    const openCreatePop = () => { if (!isPhone()) createBar.classList.add('pop-open'); };
    const closeCreatePop = () => { createBar.classList.remove('pop-open'); if (!isPhone() && activeSource) setSource(null); };
    const setSource = (id) => {
        activeSource = id && sources[id] ? id : null;
        $('cp-home').hidden = !!activeSource; $('cp-source').hidden = !activeSource;
        for (const s of Object.values(sources)) s.body.hidden = s.id !== activeSource;
        if (activeSource) { const s = sources[activeSource]; $('cp-source-title').textContent = `${s.icon || ''} ${s.label}`; }
        createBar.classList.toggle('has-source', !!activeSource);
        emit('source', activeSource);
    };
    function openMake(source) {
        closeMenus();
        if (homeOpen) closeHome();
        if (!currentModel) modelTitle.innerText = 'Make something';
        if (isPhone()) { body.classList.add('make-open'); setSheet(sheet); }
        setSource(source || null);
        openCreatePop();
        emit('make', true);
    }
    function closeMake() {
        const was = body.classList.contains('make-open') || createBar.classList.contains('pop-open');
        body.classList.remove('make-open');
        createBar.classList.remove('pop-open');
        if (activeSource) setSource(null);
        if (isPhone()) setSheet(sheet);
        if (was) emit('make', false);
        // Nothing to look at yet (Make opened from the home screen and closed without forging): back home.
        if (was) setTimeout(() => { if (!currentModel && !homeOpen && !makeIsOpen() && !kitPending()) openHome(); }, 0);
    }
    const showSource = (id) => { if (sources[id] && sources[id].open) { closeMake(); sources[id].open(); return; } openMake(id); };
    const addSource = ({ id, icon = '•', label, hint = '', order = 100, render, open }) => {
        const b = el('div', 'source-body'); b.dataset.source = id; b.hidden = true;
        $('cp-source-body').appendChild(b);
        const tile = el('button', 'start-tile', `<span class="st-ico">${icon}</span><span class="st-label">${esc(label)}</span>${hint ? `<small>${esc(hint)}</small>` : ''}`); tile.type = 'button';
        tile.addEventListener('click', (e) => { e.stopPropagation(); showSource(id); });
        insertOrdered($('start-tiles'), tile, order);
        const item = menuItem({ icon, label, hint }); item.type = 'button';
        item.addEventListener('click', () => showSource(id));
        insertOrdered($('source-list'), item, order);
        sources[id] = { id, icon, label, body: b, open };
        if (render) render(b);
        return { body: b, show: () => showSource(id) };
    };
    // The built-in source: describing an idea is the bar itself.
    (() => {
        const item = menuItem({ icon: '✏️', label: 'Describe it', hint: 'Type an idea and forge it' }); item.type = 'button';
        item.addEventListener('click', () => { closeMake(); promptInput.focus(); });
        insertOrdered($('source-list'), item, 0);
    })();
    $('btn-source-back').addEventListener('click', (e) => { e.stopPropagation(); setSource(null); });
    $('btn-make-close').addEventListener('click', () => closeMake());
    $('btn-library-close').addEventListener('click', () => closeMake());
    // Suggestions open when the prompt is focused and empty or unchanged.
    promptInput.addEventListener('focus', () => { if (!isPhone() && (!promptInput.value.trim() || promptInput.value.trim() === state.prompt)) openCreatePop(); });
    promptInput.addEventListener('input', () => { if (!isPhone() && !activeSource) createBar.classList.toggle('pop-open', !promptInput.value.trim()); });
    document.addEventListener('pointerdown', (e) => { if (!isPhone() && createBar.classList.contains('pop-open') && !e.target.closest('#create-bar, .sfg-toast')) closeCreatePop(); });

    // Engines: who builds the idea. The core builds locally; the Claude client adds its own.
    const engines = {};
    let engine = store.get('studforge.engine') || 'quick';
    const paintEngine = () => {
        const e = engines[engine] || engines.quick;
        $('btn-engine').innerHTML = `<span class="en-ico">${e.icon}</span><span class="cs-label">${esc(e.short || e.label)}</span>${e.locked ? '<span class="lock">🔒</span>' : ''}<span class="car">▾</span>`;
        for (const it of $('engine-list').children) it.classList.toggle('on', it.dataset.engine === engine);
        createBar.dataset.engine = engine;
    };
    const registerEngine = ({ id, icon, label, short, hint, tiny, order = 100 }) => {
        // `tiny` is the hint on the phone's three-way switch, where there is room for two or three words.
        const it = el('button', 'sf-menu-item engine-item', `<span class="mi-ico">${icon}</span><span class="mi-text"><span class="en-name">${esc(short || label)}<span class="lock">🔒</span></span><span class="en-long">${esc(label)}<span class="lock">🔒</span></span>${hint ? `<small class="en-hint">${esc(hint)}</small>` : ''}${tiny ? `<small class="en-tiny">${esc(tiny)}</small>` : ''}</span>`);
        it.type = 'button'; it.dataset.engine = id;
        it.addEventListener('click', () => setEngine(id));
        insertOrdered($('engine-list'), it, order);
        engines[id] = { id, icon, label, short, hint, locked: false, item: it };
        paintEngine();
        return { setLocked(v) { engines[id].locked = !!v; it.classList.toggle('locked', !!v); paintEngine(); } };
    };
    function setEngine(id) {
        if (!engines[id]) id = 'quick';
        const changed = id !== engine;
        engine = id; store.set('studforge.engine', id); paintEngine();
        if (changed || id !== 'quick') emit('engine', id);
    }
    registerEngine({ id: 'quick', icon: '⚡', label: 'Quick', hint: 'The built-in engine · free · instant', tiny: 'free · instant', order: 0 });
    if (!engines[engine]) engine = 'quick';

    /* ── suggestions (the inspiration models) ─────────────────── */
    function populateInspirations() {
        inspoContainer.innerHTML = '';
        window.INSPIRATION_MODELS.forEach((m) => {
            const pill = el('button', 'inspo-pill', `<span>${m.icon}</span> <span>${esc(m.name)}</span>`); pill.type = 'button';
            pill.addEventListener('click', () => { promptInput.value = m.prompt; forge(m.prompt, 0, {}); pill.classList.add('active'); forgeLabel(); closeMake(); });
            inspoContainer.appendChild(pill);
        });
        const surprise = el('button', 'inspo-pill surprise-pill', '<span>🎲</span> <span>Surprise me</span>'); surprise.type = 'button';
        surprise.addEventListener('click', () => btnSurprise.click());
        inspoContainer.appendChild(surprise);
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
        stopPlay();
        if (homeOpen) closeHome();
        currentModel = model;
        body.classList.remove('no-model');
        viewer.loadModel(model);
        modelTitle.innerText = model.name;
        modelDesc.innerText = model.description;
        modelBadge.innerText = `${model.icon} ${model.category.toUpperCase()}`;
        modelPieceCount.innerText = `${pieceCount(model)} pcs`;
        modelStepCount.innerText = `${viewer.maxLayer + 1} ${model.stepKind === 'layers' ? 'layers' : 'steps'}`;
        $('btn-export-xml').textContent = model.kind === 'reference' ? '↓ EXPORT PARTS CSV' : '↓ BRICKLINK XML';
        $('btn-export-xml').title = model.kind === 'reference' ? 'Download this model’s parts using LDraw identifiers' : 'Download a BrickLink Wanted List to buy the bricks';
        modelEstTime.innerText = `⏱️ ${model.estTime}`;
        if (modelDims) modelDims.innerText = model.dims ? `${model.dims.w}×${model.dims.d}×${model.dims.h} · ${model.difficulty.toUpperCase()}` : model.difficulty.toUpperCase();
        document.title = `${model.name} | StudForge`;
        setExplode(0);
        stepSlider.max = viewer.maxLayer; stepSlider.value = viewer.maxLayer;
        showStep(viewer.maxLayer);
        computeBOM(model);
        emit('model', model);
        paintPeek();
    }

    function showStep(step) {
        stepVal.innerText = `${currentModel.stepKind === 'layers' ? 'LAYER' : 'STEP'} ${step + 1} / ${viewer.maxLayer + 1}`;
        if (stepHint) stepHint.innerText = `+${viewer.stepCount(step)} pcs`;
        const pct = viewer.maxLayer ? (step / viewer.maxLayer) * 100 : 100;
        stepSlider.style.setProperty('--fill', `${pct}%`);
    }

    // The one-line summary on the phone sheet at peek height.
    const peekers = [];
    function paintPeek() {
        const p = $('sheet-peek'); if (!currentModel) return;
        const names = { build: '🔨', parts: '🧱', style: '🎨', learn: '📚' };
        let custom = null;
        for (const fn of peekers) { try { custom = fn(currentTab); } catch { custom = null; } if (custom) break; }
        p.innerHTML = custom || `<span>${names[currentTab] || '🔨'}</span><span class="pk-main">Step ${viewer.currentStep + 1} of ${viewer.maxLayer + 1}</span><span class="pk-sub">+${viewer.stepCount(viewer.currentStep)} pieces · ${pieceCount(currentModel)} in all</span>`;
    }

    /* ── bill of materials ────────────────────────────────────── */
    // A real set's flexible hose is drawn as many short segments (`segment`), but it is one piece: they are not counted.
    const pieceCount = (model) => model.bricks.reduce((n, b) => n + (b.segment ? 0 : 1), 0);
    function computeBOM(model) {
        const partsMap = new Map();
        model.bricks.forEach((b) => {
            if (b.segment) return;
            const key = `${b.partId}_${b.color}`;
            const partInfo = (b.geometryId && window.BrickBuilder.partInfo(b.geometryId)) || window.LEGO_PARTS[b.partId] || window.BrickBuilder.partInfo(b.partId) || { name: b.partName || `Element ${b.partId}`, category: 'Standard' };
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
        $('total-pieces-count').innerText = `${pieceCount(currentModel)} total pieces`;
    }

    /* ── prompt handlers ──────────────────────────────────────── */
    const forgeLabel = () => { btnGenerate.innerHTML = promptInput.value.trim() === state.prompt && state.prompt ? `<span>🎲</span> RE-FORGE` : `<span>⚡</span> FORGE`; };
    function handleGenerate() {
        const query = promptInput.value.trim();
        if (!query) { promptInput.focus(); return; }
        // The same idea forged again gives a new variation; a new idea starts fresh.
        const same = query === state.prompt;
        const v = same ? state.variant + 1 : 0;
        btnGenerate.disabled = true;
        btnGenerate.innerHTML = `<span class="spin-icon">⚙️</span> FORGING…`;
        setTimeout(() => {
            try { forge(query, v, same ? state.opts : {}); }
            finally { btnGenerate.disabled = false; forgeLabel(); }
        }, 60);
    }
    // After any forge from Make, get Make out of the way so the new model shows.
    // (Re-forges from the workbench, like a colour tweak, leave everything where it is.)
    const makeIsOpen = () => body.classList.contains('make-open') || createBar.classList.contains('pop-open');
    on('forging', () => { if (!makeIsOpen() && document.activeElement !== promptInput) return; closeMake(); if (isPhone()) setSheet('peek'); promptInput.blur(); });
    btnGenerate.addEventListener('click', handleGenerate);
    promptInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGenerate(); if (e.key === 'Escape') { closeMake(); promptInput.blur(); } });
    promptInput.addEventListener('input', forgeLabel);
    btnSurprise.addEventListener('click', () => {
        const pick = SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
        promptInput.value = pick;
        forge(pick, Math.floor(Math.random() * 4), {});
        forgeLabel();
    });

    /* ── canvas tools ─────────────────────────────────────────── */
    function setExplode(val, { user = false } = {}) {
        explodeSlider.value = val;
        explodeVal.innerText = `${Math.round(val * 100)}%`;
        explodeSlider.style.setProperty('--fill', `${val * 100}%`);
        $('dock-explode').classList.toggle('on', val > 0);
        viewer.setExplode(val);
        if (user) { window.studForgeAudio.playRatchetClick(); emit('explode', val); }
    }
    explodeSlider.addEventListener('input', (e) => setExplode(parseFloat(e.target.value), { user: true }));

    const goStep = (step) => {
        step = Math.max(0, Math.min(viewer.maxLayer, step)); stepSlider.value = step; showStep(step); viewer.setStep(step);
        emit('step', step); paintPeek();
    };
    stepSlider.addEventListener('input', (e) => { stopPlay(); goStep(parseInt(e.target.value, 10)); });
    $('btn-prev-step').addEventListener('click', () => { stopPlay(); goStep(viewer.currentStep - 1); });
    // A model opens complete (the last step); NEXT from there starts the build at step 1.
    const nextStep = () => goStep(viewer.currentStep >= viewer.maxLayer ? 0 : viewer.currentStep + 1);
    $('btn-next-step').addEventListener('click', () => { stopPlay(); nextStep(); });
    // Play: step through the build from the start (or from where you are), one step at a time.
    let playTimer = 0;
    function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = 0; } const b = $('btn-play-step'); if (b) { b.textContent = '▶︎'; b.classList.remove('on'); b.title = 'Play the build'; } }
    $('btn-play-step').addEventListener('click', () => {
        if (playTimer) { stopPlay(); return; }
        if (viewer.currentStep >= viewer.maxLayer) goStep(0);
        const b = $('btn-play-step'); b.textContent = '❚❚'; b.classList.add('on'); b.title = 'Pause';
        playTimer = setInterval(() => { if (viewer.currentStep >= viewer.maxLayer) { stopPlay(); return; } goStep(viewer.currentStep + 1); }, 850);
    });

    for (const v of ['iso', 'front', 'top', 'side']) $(`btn-cam-${v}`).addEventListener('click', () => viewer.setPresetView(v));
    $('view-seg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-view]'); if (!b) return;
        viewer.setPresetView(b.dataset.view);
        for (const x of $('view-seg').children) x.classList.toggle('on', x === b);
    });
    // A preset stays marked until the camera is moved by hand.
    viewer.renderer.domElement.addEventListener('pointerdown', () => { for (const x of $('view-seg').children) x.classList.remove('on'); });
    $('btn-cam-reset').addEventListener('click', () => viewer.resetView());
    const paintAudio = (muted) => { $('btn-audio').innerHTML = `<span class="mi-ico">${muted ? '🔇' : '🔊'}</span><span class="mi-text">${muted ? 'Sound off' : 'Sound on'}<small>${muted ? 'Click to turn on' : 'Click to mute'}</small></span>`; };
    $('btn-audio').addEventListener('click', () => paintAudio(window.studForgeAudio.toggleMute()));
    $('btn-keys').addEventListener('click', () => toast('/ prompt · ← → steps · E explode · R reset · Esc close', 4200));

    /* ── keyboard ─────────────────────────────────────────────── */
    document.addEventListener('keydown', (e) => {
        const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
        if (e.key === 'Escape') { closeMenus(); closeMake(); return; }
        if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
        if (homeOpen) { if (e.key === '/') { e.preventDefault(); $('home-prompt').focus(); } return; }
        if (!currentModel) return;
        if (e.key === '/') { e.preventDefault(); promptInput.focus(); promptInput.select(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); stopPlay(); goStep(viewer.currentStep - 1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); stopPlay(); nextStep(); }
        else if (e.key === 'e' || e.key === 'E') setExplode(parseFloat(explodeSlider.value) > 0 ? 0 : 0.6, { user: true });
        else if (e.key === 'r' || e.key === 'R') viewer.resetView();
    });

    /* ── phone sheet: tab bar, handle drag ────────────────────── */
    $('tabbar').addEventListener('click', (e) => {
        const b = e.target.closest('.tb'); if (!b) return;
        const tab = b.dataset.tab;
        if (tab === 'library') { openHome(); return; }
        if (tab === 'make') { if (body.classList.contains('make-open')) closeMake(); else openMake(); return; }
        // Tapping the open tab again drops the sheet back to peek.
        if (!body.classList.contains('make-open') && sheet !== 'peek' && tab === currentTab) { setSheet('peek'); return; }
        showTab(tab);
    });
    (() => {
        const grip = [$('sheet-handle'), $('sheet-peek')];
        let startY = 0, startH = 0, dragging = false, moved = false;
        const heights = () => { const h = window.innerHeight; return { peek: 0, half: h * 0.46, full: h * 0.86 }; };
        const onDown = (e) => { if (!isPhone()) return; dragging = true; moved = false; startY = e.clientY; startH = bench.getBoundingClientRect().height; bench.style.transition = 'none'; e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); };
        const onMove = (e) => {
            if (!dragging) return;
            const dy = startY - e.clientY; if (Math.abs(dy) > 6) moved = true;
            if (moved) bench.style.height = `${Math.max(56, Math.min(window.innerHeight * 0.9, startH + dy))}px`;
        };
        const onUp = (e) => {
            if (!dragging) return; dragging = false; bench.style.transition = '';
            const h = bench.getBoundingClientRect().height; bench.style.height = '';
            if (!moved) { setSheet(sheet === 'peek' ? 'half' : 'peek'); return; }
            const H = heights(), dy = startY - e.clientY;
            // A flick goes one height in its direction; otherwise snap to the nearest height.
            let next;
            if (Math.abs(dy) > 40) next = dy > 0 ? (sheet === 'peek' ? 'half' : 'full') : (sheet === 'full' ? 'half' : 'peek');
            else next = Object.entries(H).sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0];
            setSheet(next);
        };
        for (const g of grip) { g.addEventListener('pointerdown', onDown); g.addEventListener('pointermove', onMove); g.addEventListener('pointerup', onUp); g.addEventListener('pointercancel', onUp); }
    })();
    const onLayout = () => {
        closeMenus();
        if (!isPhone()) { body.classList.remove('make-open'); }
        if (!isDrawer()) setBenchOpen(false);
        placeControls();
        setSheet(sheet);
    };
    phoneMQ.addEventListener('change', onLayout);
    drawerMQ.addEventListener('change', onLayout);

    /* ── the control dock: on phones the view tools join it ───── */
    const cluster = $('view-cluster'), ctlDock = $('ctl-dock'), dockTools = $('dock-tools'), vpCard = $('viewport-card');
    // How much of the canvas the dock (and, on phones, the sheet's peek line) covers from the bottom; the parts
    // layout frames itself above it and overlays (the joints hint) sit on top of it.
    function updateDockCover() {
        const r = vpCard.getBoundingClientRect(), d = ctlDock.getBoundingClientRect();
        if (!r.height || !d.height) return;
        const cover = Math.max(0, Math.round(r.bottom - d.top));
        viewer.bottomPad = cover + 12;
        viewer.viewShift = isPhone() ? Math.round(cover / 2) : 0;
        vpCard.style.setProperty('--dock-cover', `${cover}px`);
    }
    const resetBtn = $('btn-cam-reset');
    function placeControls() {
        // Phones: the views, parts layout and spin become the dock's tools row, and reset sits by the explode slider.
        if (isPhone()) {
            if (cluster.parentElement !== dockTools) dockTools.appendChild(cluster);
            if (resetBtn.parentElement !== $('dock-explode')) $('dock-explode').appendChild(resetBtn);
        } else {
            if (cluster.parentElement !== vpCard) vpCard.insertBefore(cluster, ctlDock);
            if (resetBtn.parentElement !== cluster) cluster.appendChild(resetBtn);
        }
        requestAnimationFrame(updateDockCover);
    }
    if (window.ResizeObserver) new ResizeObserver(() => updateDockCover()).observe(ctlDock);
    placeControls();

    /* ── home: the kit library ────────────────────────────────── */
    const home = $('sf-home'), homeScroll = $('home-scroll');
    let homeScrollTop = 0;
    const paintHomeChrome = () => { $('btn-to-kit').hidden = !(homeOpen && currentModel); };
    // A share link to a real set is still loading: the kit view waits for it instead of bouncing home.
    let kitPendingUntil = 0;
    const kitPending = () => Date.now() < kitPendingUntil;
    function openHome() {
        closeMenus();
        if (makeIsOpen()) { body.classList.remove('make-open'); createBar.classList.remove('pop-open'); if (activeSource) setSource(null); emit('make', false); }
        stopPlay();
        homeOpen = true; home.hidden = false; body.classList.add('home-open');
        homeScroll.scrollTop = homeScrollTop;
        viewer.paused = true;   // nothing to draw behind the library
        paintHomeChrome(); setSheet(sheet);
        document.title = 'Kit library | StudForge';
        emit('home', true);
    }
    function closeHome() {
        if (!homeOpen) return;
        homeScrollTop = homeScroll.scrollTop;
        homeOpen = false; home.hidden = true; body.classList.remove('home-open');
        viewer.paused = false;
        if (currentModel) document.title = `${currentModel.name} | StudForge`;
        paintHomeChrome(); setSheet(sheet); placeControls();
        emit('home', false);
    }
    $('btn-library').addEventListener('click', () => openHome());
    $('btn-to-kit').addEventListener('click', () => { if (currentModel) closeHome(); });
    // Make your own, from the home screen: the built-in engine forges at once; Make has the other ways.
    const homePrompt = $('home-prompt');
    $('home-make').addEventListener('submit', (e) => {
        e.preventDefault();
        const q = homePrompt.value.trim();
        if (!q) { homePrompt.focus(); return; }
        homePrompt.blur();
        promptInput.value = q;
        forge(q, 0, {});
        forgeLabel();
    });
    $('home-surprise').addEventListener('click', () => { homePrompt.blur(); btnSurprise.click(); });
    $('home-more').addEventListener('click', () => openMake());

    /* ── exports ──────────────────────────────────────────────── */
    $('btn-copy-bom').addEventListener('click', () => {
        if (!currentModel) return;
        let text = `📦 STUDFORGE PARTS MANIFEST: ${currentModel.name.toUpperCase()}\n${currentModel.description}\n`;
        text += `Total Pieces: ${pieceCount(currentModel)} | Unique Elements: ${bomParts.length}\n\n[ ] QTY | ELEMENT | DESIGN ID | COLOR\n----------------------------------------------------\n`;
        for (const p of bomParts) text += `[ ] ${p.quantity.toString().padEnd(4)} | ${p.partName.padEnd(34)} | #${p.partId.padEnd(6)} | ${p.colorName}\n`;
        text += `\nGenerated with StudForge 3D LEGO Idea Maker (https://tonytoubia.com/studforge) from the idea "${currentModel.prompt || currentModel.name}"`;
        const b = $('btn-copy-bom'), orig = b.innerHTML;
        navigator.clipboard.writeText(text).then(() => { b.innerHTML = `✓ COPIED!`; setTimeout(() => { b.innerHTML = orig; }, 1800); }).catch(() => toast('Copy was blocked by the browser'));
    });
    $('btn-export-xml').addEventListener('click', () => {
        if (!currentModel) return;
        if (currentModel.kind === 'reference') {
            const quote = value => `"${String(value).replace(/"/g, '""')}"`;
            const rows = [['LDraw part ID', 'Part name', 'LDraw color', 'Color name', 'Quantity'],
                ...bomParts.map(p => [p.partId, p.partName, window.LEGO_COLORS[p.colorKey]?.ldrawCode ?? p.colorKey, p.colorName, p.quantity])];
            const csv = rows.map(row => row.map(quote).join(',')).join('\r\n');
            const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
            const a = document.createElement('a'); a.href = url; a.download = `StudForge_${currentModel.id}_LDraw-parts.csv`; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return;
        }
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
        viewer, generator, forge, reforge, on, emit, registerPanel, dock, widget, showPanel, showTab, goStep, state,
        addSource, showSource, openMake, closeMake, openHome, closeHome, get isHome() { return homeOpen; }, registerEngine, setEngine, shareItem, headerAction, summarySlot, toast, isPhone,
        setExplode: (v) => setExplode(v, { user: true }),
        /** fn(tab) → HTML for the phone sheet's peek line, or null to pass. The first non-null answer wins; all null → the default step line. */
        setPeek(fn) { if (fn && !peekers.includes(fn)) peekers.push(fn); paintPeek(); },
        get engine() { return engines[engine] ? engine : 'quick'; },
        get model() { return currentModel; }, get bom() { return bomParts; }, promptInput,
        setPrompt(p) { promptInput.value = p; forgeLabel(); },
        load(model) { if (makeIsOpen()) { closeMake(); if (isPhone()) setSheet('peek'); } loadBlueprint(model); return model; },   // a model built outside the generator (mosaic, real sets) through the same pipeline
    };
    populateInspirations();
    showTab(currentTab, { reveal: false });
    setSheet('peek');
    // Every visit opens on the kit library unless the address names a model (a share link).
    const browseOnStart = window.StudForgeLibrary.shouldBrowseOnStart(initialSearch);
    const refLink = new URLSearchParams(initialSearch).has('ref');
    if (refLink) kitPendingUntil = Date.now() + 20000;
    document.dispatchEvent(new CustomEvent('studforge:ready'));
    // Features may have claimed the first model (an idea or local build link forges at once; a real-set link
    // loads in a moment). Otherwise: the library, with nothing forged behind it.
    if (!currentModel) {
        if (browseOnStart) openHome();
        else if (refLink) { modelTitle.innerText = 'Loading kit…'; modelPieceCount.innerText = ''; modelStepCount.innerText = ''; }
        else {
            // A link this build cannot open by itself: show the first idea rather than an empty canvas.
            const first = window.INSPIRATION_MODELS[0];
            promptInput.value = first.prompt;
            forge(first.prompt, 0, {});
            forgeLabel();
        }
    }
});
