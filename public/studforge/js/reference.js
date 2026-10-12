// StudForge reference viewer: build a REAL set step by step.
//
// The LDraw community's Official Model Repository (OMR) rebuilds official sets part for part.
// A curated set of them is converted into StudForge models (data/omr/, loaded and expanded by
// FORGE.omr in omr.js) whose bricks carry their LDraw part id, a 3×3 rotation and their real
// instruction step. This feature adds, inside the 🏷️ REAL SETS panel:
//   - 🏷️ BUILD A REAL SET: the converted sets of the current idea's subject (cards: set number,
//     name, year, pieces), and a NOW BUILDING card while one is loaded (attribution, a
//     ⚒️ FORGE ONE LIKE THIS button that forges the same subject with the generator)
//   - 📚 BROWSE ALL REAL SETS: every converted set, searchable, grouped by theme
// Loading a set preloads its baked part geometry (BrickBuilder.preload) and then hands the model
// to studForge.load, opened at step 1 so the step slider, the STEPS panel and the booklet walk the
// real instruction steps. The step hint names the sub-assembly a step builds.
//
// A reference is not a forge, so the options that re-run the generator are rerouted while one is
// shown: studForge.reforge() rebuilds the set from its pristine colours (so colour swaps from
// TWEAKS and PARTS still apply as direct recolours), and scale or feature dials do nothing.
// `?ref=<setId>` opens a set on load; the gallery writes that link for a reference.
(() => {
    const PRE = 'sfref';
    const CSS = `
.${PRE}-sec { margin-bottom: 16px; }
.${PRE}-sec h4 { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.${PRE}-sec h4 small { font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); letter-spacing: 0.4px; font-weight: 500; }
.${PRE}-hint { font-size: 12px; color: var(--text-muted); line-height: 1.45; margin: 0 0 8px; }
.${PRE}-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.${PRE}-card { display: flex; flex-direction: column; gap: 3px; text-align: left; background: var(--bg-card); border: 1px solid var(--border-main); border-radius: 8px; padding: 8px 9px; cursor: pointer; color: inherit; font: inherit; min-width: 0; transition: border-color 0.15s ease, transform 0.15s ease; }
.${PRE}-card:hover, .${PRE}-card:focus-visible { border-color: var(--lego-yellow); transform: translateY(-1px); outline: none; }
.${PRE}-card.on { border-color: var(--lego-yellow); box-shadow: inset 0 0 0 1px var(--lego-yellow); }
.${PRE}-card.busy { opacity: 0.6; cursor: progress; }
.${PRE}-num { font-family: var(--font-mono); font-size: 10px; color: var(--lego-yellow); letter-spacing: 0.3px; }
.${PRE}-name { font-family: var(--font-heading); font-size: 10px; font-weight: 700; color: #fff; letter-spacing: 0.3px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.${PRE}-meta { font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); letter-spacing: 0.3px; }
.${PRE}-now { border: 1px solid rgba(242, 205, 55, 0.45); border-radius: 10px; padding: 10px 11px; background: rgba(242, 205, 55, 0.06); margin-bottom: 16px; }
.${PRE}-badge { display: inline-block; font-family: var(--font-heading); font-size: 8px; font-weight: 800; letter-spacing: 1px; color: #0c0f17; background: var(--lego-yellow); border-radius: 4px; padding: 2px 6px; margin-bottom: 6px; }
.${PRE}-now h5 { margin: 0 0 4px; font-family: var(--font-heading); font-size: 13px; color: #fff; letter-spacing: 0.4px; line-height: 1.3; }
.${PRE}-now p { margin: 0 0 6px; font-size: 12px; color: var(--text-secondary); line-height: 1.45; }
.${PRE}-attr { font-size: 10px !important; color: var(--text-muted) !important; line-height: 1.4; }
.${PRE}-attr a { color: var(--text-secondary); }
.${PRE}-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.${PRE}-row .action-btn { flex: 1 1 auto; margin: 0; }
.${PRE}-search { width: 100%; box-sizing: border-box; background: var(--bg-main, #0c0f17); border: 1px solid var(--border-main); border-radius: 8px; color: #fff; font-family: var(--font-body); font-size: 13px; padding: 7px 10px; outline: none; margin-bottom: 8px; user-select: text; -webkit-user-select: text; }
.${PRE}-search:focus { border-color: var(--border-active, var(--lego-yellow)); }
.${PRE}-theme { margin: 8px 0 4px; font-family: var(--font-heading); font-size: 9px; letter-spacing: 1px; color: var(--text-secondary); text-transform: uppercase; display: flex; justify-content: space-between; }
.${PRE}-theme small { font-family: var(--font-mono); color: var(--text-muted); }
.${PRE}-list { list-style: none; margin: 0; padding: 0; }
.${PRE}-browse-list { max-height: 340px; overflow-y: auto; overscroll-behavior: contain; }
.${PRE}-browse summary { cursor: pointer; }
.${PRE}-item { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; width: 100%; text-align: left; background: transparent; border: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding: 6px 2px; cursor: pointer; color: inherit; font: inherit; }
.${PRE}-item:hover, .${PRE}-item:focus-visible { background: rgba(255, 255, 255, 0.04); outline: none; }
.${PRE}-item.on .${PRE}-iname { color: var(--lego-yellow); }
.${PRE}-iname { font-size: 12px; color: #e2e8f0; line-height: 1.3; }
.${PRE}-iname small { font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); margin-left: 4px; }
.${PRE}-ipcs { font-family: var(--font-mono); font-size: 10px; color: var(--text-secondary); white-space: nowrap; }
.${PRE}-status { font-family: var(--font-heading); font-size: 9px; letter-spacing: 0.8px; color: var(--lego-yellow); min-height: 12px; margin-top: 6px; }
.${PRE}-status.err { color: #f87171; }
.${PRE}-vbadge { background: var(--lego-yellow) !important; color: #0c0f17 !important; border-color: var(--lego-yellow) !important; }
.active-model-desc + .${PRE}-vattr, .${PRE}-vattr { margin: 2px 0 0; font-size: 10px; color: var(--text-muted); line-height: 1.35; max-width: 520px; }
.${PRE}-vattr[hidden] { display: none; }
@media (max-width: 600px) { .${PRE}-cards { grid-template-columns: 1fr 1fr; } }
@media print { .${PRE}-now .${PRE}-row, .${PRE}-search { display: none !important; } }
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
        if (!sf || !sf.registerPanel || !window.BrickBuilder) return;
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
                // flags the expansion drops (parts[k][3]: 'baseplate' drawn procedurally, 'segment' = a flexible hose
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
                await window.BrickBuilder.preload(model.bricks.filter((b) => !window.BrickBuilder.isBaseplate(b)).map((b) => b.partId));
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
                sf.load(model);
                sf.goStep(0);   // build it from the first real step
                click();
            } catch (e) {
                if (my !== token) return;
                console.warn('StudForge real set', id, e);
                loading = null; status = '✗ COULD NOT LOAD THAT SET'; statusErr = true; refresh();
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

        /* ── the REAL SETS panel section ───────────────────────── */
        let query = '';
        let browseOpen = false;
        const setCard = (e, on) => {
            const b = el('button', `${PRE}-card${on ? ' on' : ''}${loading === e.id ? ' busy' : ''}`);
            b.type = 'button'; b.dataset.set = e.id; b.title = `Build ${e.name} (${e.id}) step by step`;
            b.innerHTML = `<span class="${PRE}-num">#${esc(e.id)}</span><span class="${PRE}-name">${esc(e.name)}</span><span class="${PRE}-meta">${esc(e.year || '')}${e.year ? ' · ' : ''}${esc(e.pieces || '?')} PCS${e.steps ? ` · ${esc(e.steps)} STEPS` : ''}</span>`;
            b.addEventListener('click', () => loadSet(e.id));
            return b;
        };
        function browseList(wrap, shownId) {
            wrap.innerHTML = '';
            const q = query.trim().toLowerCase();
            const hits = (index || []).filter((e) => !q || [e.name, e.id, e.theme, e.subject, e.year].some((f) => String(f || '').toLowerCase().includes(q)));
            if (!hits.length) { wrap.appendChild(el('p', `${PRE}-hint`, q ? `No real set matches “${esc(query)}”.` : 'No real sets yet.')); return; }
            const groups = new Map();
            for (const e of hits) { const t = String(e.theme || 'Other').split(' > ')[0];   // "Town > Classic Town" groups under Town
                if (!groups.has(t)) groups.set(t, []); groups.get(t).push(e); }
            for (const [theme, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
                wrap.appendChild(el('div', `${PRE}-theme`, `<span>${esc(theme)}</span><small>${list.length}</small>`));
                const ul = el('ul', `${PRE}-list`);
                for (const e of list.sort((a, b) => (a.year || 0) - (b.year || 0) || a.name.localeCompare(b.name))) {
                    const li = el('li');
                    const b = el('button', `${PRE}-item${e.id === shownId ? ' on' : ''}`); b.type = 'button'; b.dataset.set = e.id;
                    b.innerHTML = `<span class="${PRE}-iname">${esc(e.name)}<small>#${esc(e.id)}${e.year ? ` · ${esc(e.year)}` : ''}</small></span><span class="${PRE}-ipcs">${esc(e.pieces || '?')} PCS</span>`;
                    b.addEventListener('click', () => loadSet(e.id));
                    li.appendChild(b); ul.appendChild(li);
                }
                wrap.appendChild(ul);
            }
        }

        /** The section the REAL SETS panel shows first: now building, sets of this subject, browse all. */
        function section(model) {
            const wrap = el('div', `${PRE}-wrap`);
            const ref = isRef(model), shownId = ref ? model.reference.setId : null;
            if (ref) {
                const r = model.reference, steps = sf.viewer.maxLayer + 1;
                const now = el('div', `${PRE}-now`);
                now.innerHTML = `<span class="${PRE}-badge">🏷️ REFERENCE · REAL SET</span><h5>${esc(model.name)}</h5>`
                    + `<p>Set <b>#${esc(r.setId)}</b>${r.year ? ` · ${esc(r.year)}` : ''}${r.theme ? ` · ${esc(r.theme)}` : ''} · <b>${pieces(model)}</b> pieces · <b>${steps}</b> real steps. Walk the STEP slider to build it the way the instructions do.</p>`
                    + `<p class="${PRE}-attr">${attribution(model)}${r.url && /^https:\/\//.test(r.url) ? ` · <a href="${esc(r.url)}" target="_blank" rel="noopener">source</a>` : ''}</p>`;
                const row = el('div', `${PRE}-row`);
                const forgeBtn = el('button', 'action-btn primary', '⚒️ FORGE ONE LIKE THIS'); forgeBtn.type = 'button'; forgeBtn.id = `${PRE}-forge`;
                forgeBtn.title = `Forge a ${subjectOf(model) ? subjectWords(subjectOf(model)) : 'model'} of your own with the generator`;
                forgeBtn.addEventListener('click', forgeLikeThis);
                const restart = el('button', 'action-btn secondary', '⏮ STEP 1'); restart.type = 'button';
                restart.addEventListener('click', () => sf.goStep(0));
                row.append(forgeBtn, restart); now.appendChild(row);
                wrap.appendChild(now);
            }
            if (!index) { loadIndex().then(() => { if (realsets()) realsets().render(); }); return wrap; }
            if (!index.length) return wrap;   // no converted sets shipped: nothing to offer

            const subject = subjectOf(model);
            const sec = el('div', `${PRE}-sec`);
            sec.appendChild(el('h4', '', `<span>🏷️ BUILD A REAL SET</span><small>${index.length} SETS</small>`));
            const mine = subject ? index.filter((e) => e.subject === subject) : [];
            const cardsWrap = el('div', `${PRE}-cards`);
            if (subject) {
                sec.appendChild(el('p', `${PRE}-hint`, mine.length ? `Official ${esc(subjectWords(subject))} sets, rebuilt part for part. Pick one to build it step by step.` : `No rebuilt ${esc(subjectWords(subject))} set yet. Browse them all below.`));
                // forSubject may know better (aliases); refine the cards when it answers.
                setsFor(subject).then((list) => {
                    if (!list.length || !cardsWrap.isConnected) return;
                    cardsWrap.innerHTML = '';
                    for (const e of list) cardsWrap.appendChild(setCard(e, e.id === shownId));
                });
            } else sec.appendChild(el('p', `${PRE}-hint`, 'Official sets rebuilt part for part from their LDraw files. Pick one to build it step by step.'));
            for (const e of mine) cardsWrap.appendChild(setCard(e, e.id === shownId));
            sec.appendChild(cardsWrap);
            const st = el('div', `${PRE}-status${statusErr ? ' err' : ''}`, esc(status)); st.setAttribute('role', 'status');
            sec.appendChild(st);
            wrap.appendChild(sec);

            const browse = el('details', `${PRE}-sec ${PRE}-browse`);
            browse.open = browseOpen || !subject || !mine.length;
            const summary = el('summary', '', `<h4 style="display:inline">📚 BROWSE ALL REAL SETS</h4>`);
            summary.addEventListener('click', () => { browseOpen = !browse.open; });   // only the user's choice sticks
            browse.appendChild(summary);
            const search = el('input', `${PRE}-search`); search.type = 'search'; search.placeholder = 'Search sets: name, number, theme…'; search.value = query; search.setAttribute('aria-label', 'Search real sets');
            const list = el('div', `${PRE}-browse-list`);
            search.addEventListener('input', () => { query = search.value; browseList(list, shownId); });
            browse.append(search, list);
            browseList(list, shownId);
            wrap.appendChild(browse);
            return wrap;
        }
        function refresh() { if (realsets() && realsets().render) realsets().render(); }
        if (realsets() && realsets().addSection) realsets().addSection(section, { first: true });

        sf.on('model', () => {
            if (current && sf.model !== current.model) current = null;
            paintViewer();
        });
        sf.on('step', paintStep);
        paintViewer();
        loadIndex();

        // `?ref=<setId>` opens that real set (share links of a reference).
        let refParam = null;
        try { refParam = new URLSearchParams(location.search).get('ref'); } catch (e) { /* no URL */ }
        if (refParam && /^[\w.-]{1,40}$/.test(refParam)) loadSet(refParam);

        sf.reference = { load: loadSet, list: () => (index || []).slice(), get current() { return current ? current.model : null; }, forgeLikeThis, isReference: isRef };
    }

    if (window.studForge) init();
    else document.addEventListener('studforge:ready', init, { once: true });
})();
