// StudForge real sets: build a REAL set step by step.
//
// The LDraw community's Official Model Repository (OMR) rebuilds official sets part for part.
// A curated set of them is converted into StudForge models (data/omr/, loaded and expanded by
// FORGE.omr in omr.js) whose bricks carry their LDraw part id, a 3x3 rotation and their real
// instruction step. This feature adds:
//   - one unified Library source (showPanel('library')): every converted set and local build,
//     searchable, filtered by kind (vehicles, space, buildings...), as cards (name, set number, year, theme,
//     pieces, steps). Picking one loads it and closes Make.
//   - in the LEARN tab: the real-set card while one is shown (set, attribution, ⚒️ FORGE ONE LIKE THIS,
//     ⏮ STEP 1), and BUILD A REAL ONE: the converted sets of the current model's subject
//   - on the BUILD tab: a REFERENCE badge and the attribution line under #model-desc, and the step hint names
//     the sub-assembly a step builds
// Loading a set preloads its baked part geometry (BrickBuilder.preload) and then hands the model
// to studForge.load, opened at step 1 so the step slider, the steps list and the booklet walk the
// real instruction steps.
//
// A reference is not a forge, so the options that re-run the generator are rerouted while one is
// shown: studForge.reforge() rebuilds the set from its pristine colours (so colour swaps from
// Style and Parts still apply as direct recolours), and scale or feature dials do nothing.
// `?ref=<setId>` opens a set on load; the gallery writes that link for a reference.
(() => {
    const PRE = 'sfref';
    const storage = { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
    const CSS = `
.${PRE}-browser { display: flex; flex-direction: column; gap: 10px; }
.${PRE}-intro { margin: 0; font-size: 14px; color: var(--text-secondary); line-height: 1.4; }
.${PRE}-search { width: 100%; box-sizing: border-box; height: 40px; background: var(--bg-main); border: 1px solid var(--border-main); border-radius: 9px; color: #fff; font-family: var(--font-body); font-size: 16px; font-weight: 600; padding: 0 12px; outline: none; user-select: text; -webkit-user-select: text; }
.${PRE}-search::placeholder { color: var(--text-muted); font-weight: 500; }
.${PRE}-search:focus { border-color: var(--border-active); }
.${PRE}-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.${PRE}-chips .tool-chip { min-height: 32px; font-size: 13px; white-space: nowrap; }
.${PRE}-chips .tool-chip i { font-style: normal; font-family: var(--font-mono); font-size: 10px; font-weight: 500; color: var(--text-muted); }
.${PRE}-chips .tool-chip.on { background: rgba(242, 205, 55, 0.1); color: var(--lego-yellow); }
.${PRE}-bar { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-height: 14px; }
.${PRE}-count { font-family: var(--font-heading); font-size: 9px; font-weight: 700; letter-spacing: 1.2px; color: var(--text-muted); }
.${PRE}-status { font-family: var(--font-heading); font-size: 9px; font-weight: 700; letter-spacing: 0.8px; color: var(--lego-yellow); text-align: right; }
.${PRE}-status.err { color: #f87171; }
.${PRE}-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(160px, 100%), 1fr)); gap: 8px; }
.${PRE}-card { display: flex; flex-direction: column; gap: 3px; text-align: left; background: var(--bg-main); border: 1px solid var(--border-main); border-radius: 10px; padding: 10px 11px; cursor: pointer; color: inherit; font: inherit; min-width: 0; transition: border-color 0.15s ease, transform 0.15s ease; }
.${PRE}-card:hover, .${PRE}-card:focus-visible { border-color: var(--lego-yellow); transform: translateY(-1px); outline: none; }
.${PRE}-card.on { border-color: var(--lego-yellow); box-shadow: inset 0 0 0 1px var(--lego-yellow); }
.${PRE}-card.busy { opacity: 0.65; cursor: progress; }
.${PRE}-card.busy .${PRE}-meta::after { content: ' · LOADING…'; color: var(--lego-yellow); }
.${PRE}-tile { position: relative; min-width: 0; }
.${PRE}-tile .${PRE}-card { width: 100%; height: 100%; padding-top: 38px; }
.${PRE}-thumb { width: 100%; aspect-ratio: 4 / 3; object-fit: contain; border-radius: 8px; }
.${PRE}-favorite { position: absolute; top: 5px; right: 5px; width: 32px; height: 32px; border: 1px solid var(--border-main); border-radius: 8px; background: var(--bg-panel); color: var(--lego-yellow); cursor: pointer; font-size: 18px; }
.${PRE}-top { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 10px; color: var(--lego-yellow); letter-spacing: 0.3px; }
.${PRE}-top .ico { font-size: 15px; line-height: 1; }
.${PRE}-top .yr { color: var(--text-muted); margin-left: auto; }
.${PRE}-name { font-family: var(--font-body); font-size: 15px; font-weight: 700; color: #fff; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.${PRE}-theme { font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.${PRE}-meta { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); letter-spacing: 0.3px; }
.${PRE}-labels { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.${PRE}-labels > span { font-size: 11px; border-radius: 4px; background: rgba(242,205,55,.12); color: var(--lego-yellow); padding: 2px 5px; }
.${PRE}-filter-more > summary { cursor: pointer; font-size: 13px; color: var(--text-secondary); padding: 5px 0; }
.${PRE}-filter-more .${PRE}-chips { margin-top: 7px; }
.${PRE}-idea-icon { display: grid; place-items: center; aspect-ratio: 4 / 3; font-size: 52px; background: rgba(255,255,255,.03); border-radius: 8px; }
.${PRE}-saved-actions { display: flex; gap: 5px; padding: 6px; }
.${PRE}-saved-actions button { border: 1px solid var(--border-main); background: var(--bg-panel); color: var(--text-secondary); border-radius: 6px; min-width: 32px; min-height: 32px; cursor: pointer; }
.${PRE}-tile:has(.${PRE}-saved-actions) .${PRE}-card { height: calc(100% - 44px); }
.${PRE}-empty { grid-column: 1 / -1; font-size: 14px; color: var(--text-muted); padding: 14px 0; text-align: center; }
.${PRE}-foot { margin: 2px 0 0; font-size: 11px; color: var(--text-muted); line-height: 1.4; }
.${PRE}-hint { font-size: 13px; color: var(--text-secondary); line-height: 1.45; margin: 0 0 10px; }
.${PRE}-more { margin-top: 10px; }
.${PRE}-now { border: 1px solid rgba(242, 205, 55, 0.45); border-radius: 10px; padding: 12px; background: rgba(242, 205, 55, 0.06); }
.${PRE}-badge { display: inline-block; font-family: var(--font-heading); font-size: 8px; font-weight: 800; letter-spacing: 1px; color: #0c0f17; background: var(--lego-yellow); border-radius: 4px; padding: 2px 6px; margin-bottom: 6px; }
.${PRE}-now h5 { margin: 0 0 4px; font-family: var(--font-heading); font-size: 13px; color: #fff; letter-spacing: 0.4px; line-height: 1.3; }
.${PRE}-now p { margin: 0 0 6px; font-size: 13px; color: var(--text-secondary); line-height: 1.45; }
.${PRE}-now p b { color: #e2e8f0; }
.${PRE}-attr { font-size: 11px !important; color: var(--text-muted) !important; line-height: 1.4; }
.${PRE}-attr a { color: var(--text-secondary); }
.${PRE}-row { display: grid; grid-template-columns: 1fr auto; gap: 6px; margin-top: 10px; }
.${PRE}-row .action-btn { margin: 0; min-height: 36px; padding: 9px 12px; }
.${PRE}-vbadge { background: var(--lego-yellow) !important; color: #0c0f17 !important; border-color: var(--lego-yellow) !important; }
.${PRE}-vattr { margin: 4px 0 0; font-size: 11px; color: var(--text-muted); line-height: 1.35; }
.${PRE}-vattr[hidden] { display: none; }
@media (max-width: 767px) {
  .${PRE}-chips { flex-wrap: nowrap; overflow-x: auto; margin: 0 -12px; padding: 0 12px 2px; scrollbar-width: none; }
  .${PRE}-chips::-webkit-scrollbar { display: none; }
}
@media print { .${PRE}-now .${PRE}-row { display: none !important; } }
`;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
    const click = () => { try { if (window.studForgeAudio && window.studForgeAudio.playBrickSnap) window.studForgeAudio.playBrickSnap(); } catch (e) { /* sound is optional */ } };
    const authorsText = (a) => { const list = (Array.isArray(a) ? a : [a]).filter(Boolean).map((s) => String(s).replace(/\s*\[[^\]]*\]\s*$/, '').trim() || String(s)); return list.length ? list.join(', ') : 'the LDraw community'; };

    /* ── FORGE.omr: agent-made loader in omr.js; loaded on demand if the page does not include it ── */
    let omrP = null;
    function ensureOmr() {
        if (window.FORGE && window.FORGE.omr) return Promise.resolve(window.FORGE.omr);
        if (omrP) return omrP;
        omrP = new Promise((resolve) => {
            const done = () => resolve((window.FORGE && window.FORGE.omr) || null);
            let s = document.querySelector('script[src*="js/omr.js"]');
            if (!s) { s = document.createElement('script'); s.src = 'js/omr.js'; s.async = true; document.head.appendChild(s); }
            s.addEventListener('load', done, { once: true });
            s.addEventListener('error', done, { once: true });
            setTimeout(done, 8000);   // a tag that already ran without defining FORGE.omr
        });
        return omrP;
    }
    // The index (index.json entries). FORGE.omr.list() may be sync or async, and empty until its own fetch lands.
    let index = null, indexP = null;
    function loadIndex() {
        if (indexP) return indexP;
        indexP = (async () => {
            const omr = await ensureOmr();
            let list = null;
            try { if (omr && omr.ready) await (typeof omr.ready === 'function' ? omr.ready() : omr.ready); } catch (e) { /* fall through */ }
            try { list = omr && omr.list ? await omr.list() : null; } catch (e) { list = null; }
            if (!Array.isArray(list) || !list.length) {
                try { const r = await fetch('data/omr/index.json'); const j = r.ok ? await r.json() : null; list = j && Array.isArray(j.models) ? j.models : []; } catch (e) { list = []; }
            }
            index = list.filter((e) => e && e.id && e.name);
            return index;
        })();
        return indexP;
    }
    const entryOf = (id) => (index || []).find((e) => e.id === id) || null;
    async function setsFor(subject) {
        if (!subject) return [];
        const all = await loadIndex();
        let list = null;
        try { const omr = window.FORGE && window.FORGE.omr; list = omr && omr.forSubject ? await omr.forSubject(subject) : null; } catch (e) { list = null; }
        if (!Array.isArray(list) || !list.length) list = all.filter((e) => e.subject === subject);
        return list;
    }

    function init() {
        const sf = window.studForge;
        if (!sf || !sf.registerPanel || !sf.addSource || !window.BrickBuilder) return;
        const style = el('style'); style.id = `${PRE}-style`; style.textContent = CSS; document.head.appendChild(style);
        const K = () => (window.FORGE && window.FORGE.knowledge) || null;
        const pieces = (m) => m.bricks.reduce((n, b) => n + (b.segment ? 0 : 1), 0);   // hose segments are one piece
        const isRef = (m = sf.model) => !!(m && m.kind === 'reference' && m.reference);
        const realsets = () => window.studForgeRealSets;
        const subjectOf = (m) => (m ? (isRef(m) ? m.reference.subject : m.knowledge && m.knowledge.subject) : null) || null;
        const subjectWords = (subject) => {
            const e = K() && K().data && K().data.subjects[subject];
            if (e && e.keys && e.keys.length) return e.keys[0];
            const rs = realsets();
            return rs && rs.subjectLabel ? rs.subjectLabel(subject) : String(subject).replace(/([A-Z])/g, ' $1').toLowerCase().trim();
        };

        /* ── the current reference ─────────────────────────────── */
        let current = null;       // { model, pristine: [colours], stepSubs: [names per step index] }
        let loading = null;       // set id being fetched
        let token = 0;            // bumps when the user forges something else mid-load
        let status = '', statusErr = false;

        /** The real-set palette and size of the subject, in the shape the generator attaches, so the REAL SETS stats show for a reference too. */
        function knowledgeFor(subject) {
            const k = K(); const e = k && k.data && subject && k.data.subjects[subject];
            if (!e) return null;
            return { subject, key: (e.keys && e.keys[0]) || subject, n: e.n, pieces: e.pieces, palette: e.palette, wanted: (e.wanted || []).slice(0, 5) };
        }
        /** Sub-assembly names per viewer step index (null where the step builds the main model). */
        function stepSubsOf(model) {
            const names = Array.isArray(model.submodels) ? model.submodels : [];
            const layers = [...new Set(model.bricks.map((b) => b.layer || 0))].sort((a, b) => a - b);
            const at = new Map(layers.map((l, i) => [l, i]));
            const per = layers.map(() => new Map());
            const nameOf = (b) => (typeof b.sub === 'string' ? b.sub : names[b.sub]);
            // A sub-model holding most of the set is the model itself (a whole car placed next to a tree): not worth naming.
            const size = new Map();
            for (const b of model.bricks) if (b.sub != null) size.set(nameOf(b), (size.get(nameOf(b)) || 0) + 1);
            for (const b of model.bricks) {
                if (b.sub == null) continue;
                const name = nameOf(b);
                if (!name || b.sub === 0 || name === names[0] || /^main\b/i.test(name) || size.get(name) >= model.bricks.length * 0.5) continue;
                const m = per[at.get(b.layer || 0)];
                m.set(name, (m.get(name) || 0) + 1);
            }
            return per.map((m) => (m.size ? [...m.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n) : null));
        }
        // "car - water cannon - subpart" → "water cannon subpart", "minifig3" → "minifig 3"
        const prettySub = (name) => {
            const parts = String(name).replace(/\.(ldr|dat|mpd)$/i, '').replace(/^\d+(-\d+)?\s*[-–]\s*/, '').split(/\s+[-–]\s+/);
            return (parts.length > 1 ? parts.slice(1) : parts).join(' ').replace(/[_-]+/g, ' ').replace(/([a-z])(\d+)$/i, '$1 $2').trim();
        };

        async function loadSet(id) {
            if (!id || loading === id) return;
            const my = ++token;
            loading = id; status = 'LOADING THE REAL SET…'; statusErr = false; refresh();
            try {
                await loadIndex();
                const omr = await ensureOmr();
                if (!omr || !omr.load) throw new Error('real-set loader unavailable');
                const entry = entryOf(id) || {};
                // The converted file itself: omr.expand() turns it into a model, and its parts table carries the
                // flags (parts[k][3]: 'baseplate' drawn procedurally, 'segment' = supplemental geometry or a flexible hose
                // segment that is no piece of its own). Without the file (or expand), the loader's own fetch.
                let raw = null;
                if (entry.file) { try { const r = await fetch(`data/omr/${entry.file}`); raw = r.ok ? await r.json() : null; } catch (e) { raw = null; } }
                const model = raw && omr.expand ? omr.expand(raw) : await omr.load(id);
                if (!model || !Array.isArray(model.bricks) || !model.bricks.length) throw new Error('empty model');
                if (raw && Array.isArray(raw.parts)) {
                    const flags = new Map(raw.parts.filter((pt) => Array.isArray(pt) && pt[3]).map((pt) => [String(pt[0]), pt[3]]));
                    for (const b of model.bricks) {
                        const f = flags.get(String(b.partId));
                        if (f === 'baseplate') b.baseplate = true;
                        else if (f === 'segment') b.segment = true;
                    }
                    if (!Array.isArray(model.submodels) && Array.isArray(raw.submodels)) model.submodels = raw.submodels;
                }
                if (my !== token) return;
                status = `FETCHING ${new Set(model.bricks.map((b) => b.partId)).size} REAL PARTS…`; refresh();
                await window.BrickBuilder.preload(model.bricks.filter((b) => !window.BrickBuilder.isBaseplate(b)).map((b) => b.geometryId || b.partId));
                if (my !== token) return;   // the user forged something else meanwhile
                model.kind = 'reference';
                model.reference = Object.assign({ setId: id }, model.reference || {});
                model.reference.subject = model.reference.subject || model.subject || entry.subject || null;
                if (!model.reference.authors && entry.authors) model.reference.authors = entry.authors;
                model.prompt = `ref:${id}`;   // the tweaks colour patches and the gallery key off the prompt
                model.knowledge = model.knowledge || knowledgeFor(model.reference.subject);
                model.name = model.name || entry.name || id;
                model.category = model.category || model.reference.theme || 'Real set';
                model.icon = model.icon || '🏷️';
                model.difficulty = model.difficulty || 'Intermediate';
                model.estTime = model.estTime || `${Math.max(10, Math.round(pieces(model) / 4))} MIN`;
                model.description = model.description || `${model.name} (${id}), the real set, rebuilt part for part.`;
                for (const b of model.bricks) b.baked = b.baked !== false;
                current = { model, pristine: model.bricks.map((b) => b.color), stepSubs: stepSubsOf(model) };
                sf.state.prompt = model.prompt; sf.state.variant = 0; sf.state.opts = {};
                loading = null; status = '';
                sf.load(model);   // shown complete, like a forged idea; ◀ / ▶ step through the build from there
                click();
            } catch (e) {
                if (my !== token) return;
                console.warn('StudForge real set', id, e);
                loading = null; status = '✗ COULD NOT LOAD THAT SET'; statusErr = true; refresh();
                if (sf.toast) sf.toast('Could not load that real set');
            }
        }

        /** Rebuild the shown reference from its pristine colours: tweaks' loadModel hook reapplies its colour patches. */
        function reloadReference() {
            const c = current; if (!c || sf.model !== c.model) return sf.model;
            const v = sf.viewer, step = v.isStepMode ? v.currentStep : null;
            c.model.bricks.forEach((b, i) => { b.color = c.pristine[i]; });
            sf.load(c.model);
            if (step != null) sf.goStep(step);
            return c.model;
        }
        // Reforging means "the same idea with other options"; for a real set only colours can change.
        const coreReforge = sf.reforge;
        sf.reforge = (patch) => (isRef() ? reloadReference() : coreReforge(patch));
        // Forging a new idea mid-load wins ('forging' fires before the state changes, so a new idea is a prompt
        // other than the current one). Re-forges of the idea on show (the start-up forge picking up the knowledge
        // file, say) do not cancel, and the start-up forge itself comes before this listener.
        setTimeout(() => sf.on('forging', ({ prompt }) => { if (loading && prompt !== sf.state.prompt) { token++; loading = null; status = ''; } }), 0);

        function forgeLikeThis() {
            const m = sf.model; if (!isRef(m)) return;
            const subject = subjectOf(m);
            let words = subject ? subjectWords(subject) : m.name;
            // Lead with the set's main colour when it is a plain colour word the generator reads ("red fire truck").
            const counts = new Map();
            for (const b of m.bricks) if (!/^(BLACK|LIGHT_GREY|DARK_GREY|TRANS_)/.test(b.color)) counts.set(b.color, (counts.get(b.color) || 0) + 1);
            const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
            if (top && /^(RED|BLUE|YELLOW|GREEN|ORANGE|WHITE|TAN|LIME|PINK|PURPLE|BROWN)$/.test(top[0])) words = `${top[0].toLowerCase()} ${words}`;
            sf.setPrompt(words);
            sf.forge(words, 0, {});
            click();
        }

        /* ── the viewer: REFERENCE badge, attribution under the title, sub-assembly in the step hint ── */
        const badge = document.getElementById('model-badge'), desc = document.getElementById('model-desc'), stepHint = document.getElementById('val-step-hint');
        const vattr = el('p', `${PRE}-vattr`); vattr.hidden = true;
        if (desc && desc.parentNode) desc.parentNode.insertBefore(vattr, desc.nextSibling);
        const attribution = (m) => `Rebuilt from the LDraw OMR file by ${esc(authorsText(m.reference.authors))} · ${esc(m.reference.licence || 'CC BY')} · LDraw.org`;
        function paintViewer() {
            const m = sf.model, ref = isRef(m);
            if (badge) { badge.classList.toggle(`${PRE}-vbadge`, ref); if (ref) badge.innerText = `🏷️ REFERENCE · ${m.reference.setId}`; }
            vattr.hidden = !ref;
            vattr.innerHTML = ref ? attribution(m) : '';
            document.body.classList.toggle(`${PRE}-on`, ref);
        }
        function paintStep(step) {
            if (!stepHint || !isRef() || !current || sf.model !== current.model) return;
            const subs = current.stepSubs[step];
            if (subs && subs.length) stepHint.innerText = `${stepHint.innerText} · ⚙️ ${prettySub(subs[0]).toUpperCase()}`;
        }

        /* ── cards, shared by the browser and BUILD A REAL ONE ─── */
        const iconOf = (subject) => { const rs = realsets(); return rs && rs.subjectIcon ? rs.subjectIcon(subject) : '🏷️'; };
        const themeText = (t) => String(t || '').split(' > ').join(' · ');
        function previewFallback(button, icon) {
            const image = button.querySelector('img');
            image?.addEventListener('error', () => {
                const fallback = el('span', `${PRE}-idea-icon`, esc(icon || '🧱'));
                fallback.setAttribute('role', 'img'); fallback.setAttribute('aria-label', 'Preview unavailable');
                image.replaceWith(fallback);
            }, { once: true });
        }
        const shownId = () => (isRef() ? sf.model.reference.setId : null);
        const setCard = (e) => {
            const library = window.StudForgeLibraryState ||= window.StudForgeLibrary.readState(storage);
            const tile = el('div', `${PRE}-tile`);
            const b = el('button', `${PRE}-card${e.id === shownId() ? ' on' : ''}${loading === e.id ? ' busy' : ''}`); b.disabled = loading === e.id;
            b.type = 'button'; b.dataset.set = e.id; b.title = `Build ${e.name} (${e.id}) step by step`;
            b.innerHTML = (e.thumbnail ? `<img class="${PRE}-thumb" src="${esc(e.thumbnail)}" alt="" loading="lazy">` : '') + `<span class="${PRE}-top"><span class="ico" aria-hidden="true">${iconOf(e.subject)}</span>#${esc(e.id)}${e.year ? `<span class="yr">${esc(e.year)}</span>` : ''}</span>`
                + `<span class="${PRE}-name">${esc(e.name)}</span>`
                + (e.theme ? `<span class="${PRE}-theme">${esc(themeText(e.theme))}</span>` : '')
                + (e.missing && e.missing.length ? `<span class="${PRE}-meta">Source omits ${esc(e.missing.join(', ').toLowerCase())}</span>` : '')
                + `<span class="${PRE}-meta">${esc(e.pieces || '?')} PCS${e.steps ? ` · ${esc(e.steps)} ${e.stepKind === 'layers' ? 'LAYERS' : 'STEPS'}` : ''} · OPEN KIT →</span>`;
            b.addEventListener('click', () => loadSet(e.id));
            previewFallback(b, iconOf(e.subject));
            const favorite = el('button', `${PRE}-favorite`); favorite.type = 'button';
            const paintFavorite = () => {
                const on = library.favorites.includes(e.id) || library.favorites.includes(`set-${e.id}`);
                favorite.textContent = on ? '♥' : '♡'; favorite.setAttribute('aria-label', `Favorite ${e.name}`); favorite.setAttribute('aria-pressed', String(on));
            };
            paintFavorite();
            favorite.addEventListener('click', () => {
                const on = library.favorites.includes(e.id) || library.favorites.includes(`set-${e.id}`);
                library.favorites = library.favorites.filter(id => id !== e.id && id !== `set-${e.id}`);
                if (!on) library.favorites.push(e.id);
                window.StudForgeLibrary.saveState(storage, library);
                paintFavorite(); paintBrowser(); paintReal();
            });
            tile.append(b, favorite); return tile;
        };
        /** Loading and "now showing" marks on every card, and the status lines, without re-rendering. */
        function refresh() {
            const on = shownId();
            for (const c of document.querySelectorAll(`.${PRE}-card[data-set]`)) { c.classList.toggle('busy', c.dataset.set === loading); c.classList.toggle('on', c.dataset.set === on); c.disabled = c.dataset.set === loading; }
            for (const s of document.querySelectorAll(`.${PRE}-status`)) { s.textContent = status; s.classList.toggle('err', statusErr); }
        }

        /* ── One library: community sets, starter ideas, and local builds ── */
        const SOURCE = 'library';
        const KINDS = [
            ['Vehicles', ['fireTruck', 'policeCar', 'ambulance', 'car', 'truck', 'monsterTruck', 'garbageTruck', 'bus', 'tractor', 'construction', 'motorcycle', 'tank']],
            ['Trains', ['train']],
            ['Air & sea', ['plane', 'helicopter', 'boat', 'ship', 'pirateShip', 'submarine']],
            ['Space', ['rocket', 'spaceship', 'rover', 'spaceStation', 'robot']],
            ['Buildings', ['house', 'tower', 'lighthouse', 'windmill', 'bridge', 'shop', 'station', 'farm']],
            ['Castles & dragons', ['castle', 'dragon']],
            ['Animals & nature', ['animal', 'bird', 'seaCreature', 'dinosaur', 'tree', 'flower', 'insect']],
        ];
        const core = window.StudForgeLibrary;
        let query = '', selectedTags = [], entries = [];
        const src = sf.addSource({ id: SOURCE, icon: '🧱', label: 'Browse library', hint: 'Sets, starter ideas and your builds', order: 5 });
        const sb = src.body;
        sb.innerHTML = `<div class="${PRE}-browser">
  <p class="${PRE}-intro">Pick a kit and start building. Real sets, generated ideas and your saved builds, together.</p>
  <input type="search" class="${PRE}-search" placeholder="Search kits, themes, set numbers or ideas" aria-label="Search library" enterkeyhint="search" autocomplete="off" spellcheck="false">
  <div class="${PRE}-chips" role="group" aria-label="Filter library by labels"></div>
  <details class="${PRE}-filter-more"><summary>Themes & more labels</summary><div class="${PRE}-chips ${PRE}-themes" role="group" aria-label="Filter library by theme"></div></details>
  <div class="${PRE}-bar"><span class="${PRE}-count" role="status"></span><span class="${PRE}-status" role="status"></span></div>
  <div class="${PRE}-grid"><p class="${PRE}-empty">Loading the library…</p></div>
  <p class="${PRE}-foot">Your saved and recent builds stay in this browser. Community sets credit their LDraw OMR authors. <a href="models/ATTRIBUTION.md" target="_blank" rel="noopener">Model credits and licenses</a>. LEGO is a trademark of the LEGO Group, which does not sponsor or endorse this project.</p>
</div>`;
        const search = sb.querySelector(`.${PRE}-search`), chips = sb.querySelector(`.${PRE}-chips`), themes = sb.querySelector(`.${PRE}-themes`), grid = sb.querySelector(`.${PRE}-grid`), count = sb.querySelector(`.${PRE}-count`);
        function buildEntries() {
            const state = window.StudForgeLibraryState ||= core.readState(storage);
            entries = core.combineEntries(index || [], window.INSPIRATION_MODELS || [], sf.gallery?.list() || [], sf.gallery?.recent() || [], state.favorites);
            for (const entry of entries) {
                if (entry.ref && (entry.motionCount || window.StudForgeArticulation?.hasProfile(entry.ref))) entry.tags.push('Movable');
                if (!entry.ref && !entry.thumb && (window.INSPIRATION_MODELS || []).some(idea => idea.id === entry.id)) entry.thumb = `thumbnails/${entry.id}.png`;
                const theme = entry.category || String(entry.theme || '').split(' > ')[0];
                const kind = KINDS.find(([, subjects]) => subjects.includes(entry.subject))?.[0];
                for (const tag of [theme, kind].filter(Boolean)) if (!entry.tags.includes(tag)) entry.tags.push(tag);
            }
        }
        function paintChips() {
            const labels = ['Real set', 'Generated', 'Saved', 'Recent', 'Favorites', 'Popular picks', 'Starter idea'];
            const extra = [...new Set(entries.flatMap(e => e.tags).filter(tag => !labels.includes(tag)))].sort();
            const chip = ([tag, n]) => `<button type="button" class="tool-chip${(tag === 'All' ? !selectedTags.length : selectedTags.includes(tag)) ? ' on' : ''}" data-tag="${esc(tag)}" aria-pressed="${tag === 'All' ? !selectedTags.length : selectedTags.includes(tag)}">${esc(tag)} <i>${n}</i></button>`;
            chips.innerHTML = [['All', entries.length], ...labels.map(tag => [tag, entries.filter(e => e.tags.includes(tag)).length])].map(chip).join('');
            themes.innerHTML = [...new Set([...extra, ...selectedTags.filter(tag => !labels.includes(tag))])].map(tag => [tag, entries.filter(e => e.tags.includes(tag)).length]).map(chip).join('');
            sb.querySelector(`.${PRE}-filter-more summary`).textContent = selectedTags.some(tag => !labels.includes(tag)) ? `Themes & more labels · ${selectedTags.filter(tag => !labels.includes(tag)).join(', ')}` : 'Themes & more labels';
        }
        function libraryCard(e) {
            const tile = e.ref ? setCard(e) : el('div', `${PRE}-tile`);
            if (!e.ref) {
                const button = el('button', `${PRE}-card`); button.type = 'button'; button.dataset.build = e.key;
                button.title = `Open ${e.name || e.prompt}`;
                button.innerHTML = (e.thumb ? `<img class="${PRE}-thumb" alt="" src="${esc(e.thumb)}" loading="lazy">` : `<span class="${PRE}-idea-icon" aria-hidden="true">${esc(e.icon || '🧱')}</span>`)
                    + `<span class="${PRE}-name">${esc(e.name || e.prompt)}</span><span class="${PRE}-meta">${e.pieces ? `${esc(e.pieces)} PCS · ` : ''}OPEN BUILD →</span>`;
                button.addEventListener('click', () => sf.gallery.open(e.savedEntry || e)); previewFallback(button, e.icon); tile.appendChild(button);
                const favorite = el('button', `${PRE}-favorite`); favorite.type = 'button';
                const state = window.StudForgeLibraryState;
                const on = state.favorites.includes(e.key);
                favorite.textContent = on ? '♥' : '♡'; favorite.setAttribute('aria-label', `Favorite ${e.name || e.prompt}`); favorite.setAttribute('aria-pressed', String(on));
                favorite.addEventListener('click', () => { state.favorites = state.favorites.filter(key => key !== e.key); if (!on) state.favorites.push(e.key); core.saveState(storage, state); paintBrowser(); });
                tile.appendChild(favorite);
            }
            const button = tile.querySelector(`.${PRE}-card`);
            button.insertAdjacentHTML('beforeend', `<span class="${PRE}-labels">${e.tags.filter(tag => ['Real set', 'Generated', 'Saved', 'Recent', 'Starter idea', 'Movable'].includes(tag)).map(tag => `<span>${esc(tag)}</span>`).join('')}</span>`);
            if (e.savedEntry) {
                const actions = el('div', `${PRE}-saved-actions`);
                const copy = el('button', '', '🔗'); copy.type = 'button'; copy.setAttribute('aria-label', `Copy link to ${e.name || e.prompt}`); copy.addEventListener('click', () => sf.gallery.copy(e.savedEntry));
                const remove = el('button', '', '✕'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove saved ${e.name || e.prompt}`); remove.addEventListener('click', () => sf.gallery.remove(e.savedEntry));
                actions.append(copy, remove); tile.appendChild(actions);
            }
            return tile;
        }
        function paintGrid() {
            const hits = core.searchEntries(entries, query, selectedTags);
            grid.innerHTML = '';
            if (!hits.length) {
                const empty = el('div', `${PRE}-empty`, 'No kits match these labels and search.');
                const reset = el('button', 'tool-chip', 'Clear filters'); reset.type = 'button';
                reset.addEventListener('click', () => { selectedTags = []; query = ''; search.value = ''; paintBrowser(); }); empty.appendChild(reset); grid.appendChild(empty);
            }
            for (const e of hits) grid.appendChild(libraryCard(e));
            count.textContent = `${hits.length} OF ${entries.length} KITS & IDEAS`;
        }
        const paintBrowser = () => { if (!index) return; buildEntries(); paintChips(); paintGrid(); refresh(); };
        search.addEventListener('input', () => { query = search.value; paintGrid(); });
        sb.addEventListener('click', event => {
            const tag = event.target.closest('[data-tag]')?.dataset.tag; if (!tag) return;
            selectedTags = tag === 'All' ? [] : selectedTags.includes(tag) ? selectedTags.filter(t => t !== tag) : [...selectedTags, tag]; paintChips(); paintGrid();
        });
        sf.on('source', id => { if (id === SOURCE) paintBrowser(); });
        sf.on('library:change', paintBrowser);
        sf.library = { browse: () => sf.showSource(SOURCE), entries: () => entries.slice() };
        const browse = document.getElementById('btn-library');
        if (browse) browse.addEventListener('click', () => sf.library.browse());

        /* ── LEARN: the real set on show, and BUILD A REAL ONE ──── */
        const nowP = sf.registerPanel({ id: 'realsets-now', title: null, group: 'learn', order: 5 });
        const realP = sf.registerPanel({ id: 'realsets-real', title: 'BUILD A REAL ONE', group: 'learn', order: 30 });
        function paintNow() {
            const model = sf.model;
            nowP.section.hidden = !isRef(model);
            nowP.body.innerHTML = '';
            if (!isRef(model)) return;
            const r = model.reference, steps = sf.viewer.maxLayer + 1;
            const now = el('div', `${PRE}-now`);
            now.innerHTML = `<span class="${PRE}-badge">🏷️ REAL SET</span><h5>${esc(model.name)}</h5>`
                + `<p>Set <b>#${esc(r.setId)}</b>${r.year ? ` · ${esc(r.year)}` : ''}${r.theme ? ` · ${esc(themeText(r.theme))}` : ''} · <b>${pieces(model)}</b> pieces · <b>${steps}</b> ${model.stepKind === 'layers' ? 'inspection layers. Use the original instructions for assembly.' : 'source-file steps.'}</p>`
                + `<p class="${PRE}-attr">${attribution(model)}${r.url && /^https:\/\//.test(r.url) ? ` · <a href="${esc(r.url)}" target="_blank" rel="noopener">source</a>` : ''}</p>`;
            if (r.missing && r.missing.length) now.appendChild(el('p', `${PRE}-hint`, `The community author reports omitted ${esc(r.missing.join(', ').toLowerCase())}. Counts and inventories describe this recreation.`));
            const row = el('div', `${PRE}-row`);
            const forgeBtn = el('button', 'action-btn primary', '⚒️ FORGE ONE LIKE THIS'); forgeBtn.type = 'button'; forgeBtn.id = `${PRE}-forge`;
            forgeBtn.title = `Forge a ${subjectOf(model) ? subjectWords(subjectOf(model)) : 'model'} of your own with the generator`;
            forgeBtn.addEventListener('click', forgeLikeThis);
            const restart = el('button', 'action-btn secondary', '⏮ STEP 1'); restart.type = 'button'; restart.title = 'Back to the first step';
            restart.addEventListener('click', () => sf.goStep(0));
            row.append(forgeBtn, restart); now.appendChild(row);
            nowP.body.appendChild(now);
        }
        let realToken = 0;
        function paintReal() {
            const my = ++realToken;
            const subject = subjectOf(sf.model);
            if (!subject) { realP.section.hidden = true; realP.body.innerHTML = ''; return; }
            setsFor(subject).then((list) => {
                if (my !== realToken) return;
                if (!index || !index.length) { realP.section.hidden = true; return; }
                realP.section.hidden = false;
                const words = subjectWords(subject);
                const body = realP.body; body.innerHTML = '';
                body.appendChild(el('p', `${PRE}-hint`, list.length
                    ? `Official ${esc(words)} sets, rebuilt part for part. Pick one to build it with its real steps.`
                    : `No rebuilt ${esc(words)} set yet, but there are ${index.length} others to build.`));
                if (list.length) {
                    const g = el('div', `${PRE}-grid`);
                    for (const e of list) g.appendChild(setCard(e));
                    body.appendChild(g);
                    const st = el('div', `${PRE}-status`); st.setAttribute('role', 'status'); st.style.marginTop = '8px'; st.style.textAlign = 'left';
                    body.appendChild(st);
                }
                const more = el('button', `action-btn tertiary ${PRE}-more`, `🧱 BROWSE LIBRARY`); more.type = 'button';
                more.addEventListener('click', () => sf.showSource(SOURCE));
                body.appendChild(more);
                refresh();
            });
        }

        sf.on('model', () => {
            if (current && sf.model !== current.model) current = null;
            paintViewer();
            paintNow();
            paintReal();
            refresh();
        });
        sf.on('step', paintStep);
        paintViewer();
        paintNow();
        loadIndex().then(() => { paintReal(); paintBrowser(); });
        // The subject of the first idea is known once the knowledge file lands.
        if (K() && K().onReady) K().onReady(() => paintReal());

        // `?ref=<setId>` opens that real set (share links of a reference).
        let refParam = null;
        try { refParam = new URLSearchParams(location.search).get('ref'); } catch (e) { /* no URL */ }
        if (refParam && /^[\w.-]{1,40}$/.test(refParam)) loadSet(refParam);

        sf.reference = { load: loadSet, list: () => (index || []).slice(), get current() { return current ? current.model : null; }, forgeLikeThis, isReference: isRef, sourceId: SOURCE, browse: () => sf.showSource(SOURCE) };
    }

    if (window.studForge) init();
    else document.addEventListener('studforge:ready', init, { once: true });
})();
