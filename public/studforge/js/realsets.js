// StudForge Learn: "How LEGO builds a <subject>", from the open set data (data/knowledge.json, via
// knowledge.js) for the current model's subject, next to what this model actually did.
//
// Sections in the workbench's LEARN tab (showPanel('realsets') opens it):
//   realsets          the subject, how many real sets stand behind the numbers, a few key facts
//                     (or a short empty state when the subject is unknown: try a subject, or build a real set)
//   realsets-palette  THEIR COLOURS: the mean palette of real sets
//   realsets-size     TYPICAL SIZE: the p25–p75 piece band and median, with this model marked on it
//   realsets-parts    PARTS THEY USE MOST (✓ in this model / ○ stocked but unused here / ✗ not stocked yet)
//   realsets-missing  PARTS WE DON'T STOCK YET
//   realsets-built    HOW THEY'RE BUILT: sections other features add (construction.js) through
//                     studForgeRealSets.addSection(fn), fn(model) → Element | null
// reference.js adds the real-set card (when the model is a real set) and BUILD A REAL ONE.
//
// The generator attaches `model.knowledge` ({ subject, key, n, pieces, palette, wanted,
// calibration }) to every forge; the full parts list is read from FORGE.knowledge by subject.
(() => {
    const PRE = 'sfr';
    const CSS = `
.${PRE}-kicker { font-family: var(--font-heading); font-size: 9px; font-weight: 700; letter-spacing: 1.4px; color: var(--text-muted); margin: 0 0 4px; }
.${PRE}-subject { display: flex; align-items: center; gap: 8px; font-family: var(--font-heading); font-size: 16px; font-weight: 800; letter-spacing: 0.6px; color: #fff; margin: 0 0 8px; line-height: 1.25; }
.${PRE}-subject .ico { font-size: 22px; line-height: 1; }
.${PRE}-lead { font-size: 14px; color: #e2e8f0; line-height: 1.45; margin: 0 0 12px; }
.${PRE}-lead b { color: var(--lego-yellow); font-weight: 700; }
.${PRE}-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.${PRE}-fact { background: var(--bg-main); border: 1px solid var(--border-main); border-radius: 8px; padding: 8px 9px; min-width: 0; }
.${PRE}-fact b { display: block; font-family: var(--font-mono); font-size: 14px; font-weight: 700; color: var(--lego-yellow); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.${PRE}-fact span { display: block; font-size: 11px; color: var(--text-muted); line-height: 1.25; margin-top: 2px; }
.${PRE}-hint { font-size: 13px; color: var(--text-secondary); line-height: 1.45; margin: 0 0 8px; }
.${PRE}-hint b { color: #e2e8f0; }
.${PRE}-meta { font-family: var(--font-heading); font-size: 8px; letter-spacing: 0.8px; color: var(--text-muted); text-transform: uppercase; margin: 8px 0 0; line-height: 1.5; }
.${PRE}-strip { display: flex; height: 26px; border-radius: 7px; overflow: hidden; border: 1px solid var(--border-main); }
.${PRE}-strip span { display: block; min-width: 3px; }
.${PRE}-strip span.trans { background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 3px, transparent 3px 6px); }
.${PRE}-swatches { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 8px; }
.${PRE}-sw { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-secondary); }
.${PRE}-dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); box-shadow: inset 0 -2px 0 rgba(0,0,0,0.18); flex-shrink: 0; }
.${PRE}-dot.trans { border-style: dashed; }
.${PRE}-sw i { font-style: normal; font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); }
.${PRE}-bar { position: relative; height: 14px; margin: 10px 0 4px; border-radius: 7px; background: rgba(255,255,255,0.06); border: 1px solid var(--border-main); }
.${PRE}-band { position: absolute; top: 0; bottom: 0; background: rgba(242, 205, 55, 0.22); border-left: 1px solid rgba(242, 205, 55, 0.5); border-right: 1px solid rgba(242, 205, 55, 0.5); }
.${PRE}-median { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--lego-yellow); }
.${PRE}-you { position: absolute; top: -5px; width: 10px; height: 22px; margin-left: -5px; border-radius: 5px; background: #fff; border: 2px solid var(--bg-card); box-shadow: 0 0 0 1px rgba(255,255,255,0.4); }
.${PRE}-axis { display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); }
.${PRE}-verdict { font-size: 13px; color: #e2e8f0; margin: 8px 0 0; line-height: 1.45; }
.${PRE}-verdict b { color: var(--lego-yellow); }
.${PRE}-parts { list-style: none; margin: 0; padding: 0; }
.${PRE}-part { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px; }
.${PRE}-part:last-child { border-bottom: 0; }
.${PRE}-mark { font-family: var(--font-mono); font-size: 12px; text-align: center; }
.${PRE}-part.used .${PRE}-mark { color: #4ade80; }
.${PRE}-part.unused .${PRE}-mark { color: var(--text-muted); }
.${PRE}-part.missing .${PRE}-mark { color: #f87171; }
.${PRE}-pname { color: #e2e8f0; line-height: 1.25; overflow-wrap: anywhere; }
.${PRE}-part.missing .${PRE}-pname { color: var(--text-secondary); }
.${PRE}-pname small { display: block; font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); }
.${PRE}-share { font-family: var(--font-mono); font-size: 10px; color: var(--text-secondary); white-space: nowrap; }
.${PRE}-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: var(--text-muted); margin-top: 8px; }
.${PRE}-legend b { font-family: var(--font-mono); font-weight: 600; }
.${PRE}-legend .u { color: #4ade80; } .${PRE}-legend .m { color: #f87171; }
.${PRE}-try { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 12px; }
.${PRE}-try .tool-chip { min-height: 32px; font-size: 13px; }
.${PRE}-empty .action-btn { min-height: 38px; }
#panel-realsets-built .sfc-sec { margin: 0; padding: 0; border: 0; }
#panel-realsets-built .sfc-sec > h4:first-child { display: none; }
#panel-realsets-built .${PRE}-extra + .${PRE}-extra { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-main); }
`;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const colors = () => window.LEGO_COLORS || {};
    const parts = () => window.LEGO_PARTS || {};
    const pct = (s) => `${Math.round(s * 100)}%`;
    // "fireTruck" → "fire truck", "themeCity" → "City-theme"
    const subjectLabel = (id, key) => {
        if (String(id).startsWith('theme')) return `${String(id).slice(5).replace(/([a-z])([A-Z])/g, '$1 $2')}-theme`;
        return key || String(id).replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    };
    const ICONS = {
        fireTruck: '🚒', policeCar: '🚓', ambulance: '🚑', car: '🚗', truck: '🚚', monsterTruck: '🛻', garbageTruck: '🚛', bus: '🚌', tractor: '🚜',
        construction: '🏗️', motorcycle: '🏍️', train: '🚂', plane: '✈️', helicopter: '🚁', boat: '🚤', ship: '🚢', pirateShip: '🏴‍☠️', submarine: '🤿',
        spaceship: '🛸', rocket: '🚀', rover: '🛰️', spaceStation: '🛰️', robot: '🤖', tank: '🪖', house: '🏠', castle: '🏰', tower: '🗼', lighthouse: '🗼',
        windmill: '🌬️', bridge: '🌉', shop: '🏪', station: '🏢', farm: '🌾', tree: '🌳', flower: '🌸', dragon: '🐉', dinosaur: '🦖', animal: '🐾', bird: '🦜',
        seaCreature: '🐋', insect: '🐝', food: '🍽️', skyline: '🏙️',
    };
    const subjectIcon = (id) => ICONS[id] || (String(id).startsWith('theme') ? '🏷️' : '🧱');
    // Subjects with real sets to build here: the empty state's suggestions.
    const TRY = [['fire truck', '🚒'], ['castle', '🏰'], ['rocket', '🚀'], ['train', '🚂'], ['pirate ship', '🏴‍☠️'], ['house', '🏠'], ['helicopter', '🚁'], ['tractor', '🚜']];

    function init() {
        const sf = window.studForge;
        if (!sf || !sf.registerPanel) return;
        const style = document.createElement('style'); style.id = `${PRE}-style`; style.textContent = CSS; document.head.appendChild(style);

        const reg = (id, title, order) => sf.registerPanel({ id, title, group: 'learn', order });
        const P = {
            intro: reg('realsets', null, 10),
            palette: reg('realsets-palette', 'THEIR COLOURS', 12),
            size: reg('realsets-size', 'TYPICAL SIZE', 14),
            parts: reg('realsets-parts', 'PARTS THEY USE MOST', 16),
            missing: reg('realsets-missing', "PARTS WE DON'T STOCK YET", 18),
            built: reg('realsets-built', "HOW THEY'RE BUILT", 20),
        };
        /** Fill a section, or hide it when there is nothing to say. */
        const fill = (p, html) => { p.section.hidden = !html; p.body.innerHTML = html || ''; };

        const K = () => (window.FORGE && window.FORGE.knowledge) || null;
        const entryOf = (id) => { const k = K(); return k && k.data && k.data.subjects[id] ? k.data.subjects[id] : null; };
        const isRef = (m) => !!(m && m.kind === 'reference');

        // Other features add their own blocks to HOW THEY'RE BUILT: fn(model) → Element | null.
        const sections = [];
        function render() {
            const model = sf.model;
            renderOwn(model);
            P.built.body.innerHTML = '';
            const k = model && model.knowledge;
            if (k) {
                for (const s of sections) {
                    let node = null;
                    try { node = s.fn(model); } catch (e) { console.error('studForge real sets section', e); }
                    if (!node) continue;
                    node.classList.add(`${PRE}-extra`);
                    if (s.first) P.built.body.insertBefore(node, P.built.body.firstChild); else P.built.body.appendChild(node);
                }
            }
            P.built.section.hidden = !P.built.body.firstChild;
        }

        function emptyState(model) {
            const what = model && model.kind === 'mosaic'
                ? '<p class="sfr-hint">A mosaic is flat art, so there is no real set to compare it with.</p>'
                : !(K() && K().ready)
                    ? '<p class="sfr-hint">Loading what real sets are made of…</p>'
                    : `<p class="sfr-hint">We have no real-set data for ${model && model.name ? `<b>${esc(model.name)}</b>` : 'this idea'} yet. Learn works for subjects real LEGO sets cover: their colours, size, parts and how they are put together.</p>`;
            return `<div class="${PRE}-empty"><p class="${PRE}-kicker">HOW LEGO BUILDS IT</p>${what}`
                + `<p class="${PRE}-kicker" style="margin-top:12px">TRY ONE OF THESE</p><div class="${PRE}-try">${TRY.map(([w, i]) => `<button type="button" class="tool-chip" data-try="${esc(w)}">${i} ${esc(w)}</button>`).join('')}</div>`
                + `<button type="button" class="action-btn secondary" data-browse>🧱 BROWSE LIBRARY</button></div>`;
        }

        function renderOwn(model) {
            const k = model && model.knowledge;
            if (!k) {
                fill(P.intro, emptyState(model));
                for (const p of [P.palette, P.size, P.parts, P.missing]) fill(p, '');
                return;
            }
            const entry = entryOf(k.subject) || {};
            const label = subjectLabel(k.subject, k.key);
            const theme = String(k.subject).startsWith('theme');
            const pieces = k.pieces || entry.pieces || null;
            const ref = isRef(model);
            const n = model.bricks.reduce((a, b) => a + (b.segment ? 0 : 1), 0);   // hose segments are one piece
            const thisOne = ref ? 'This set' : 'This model';

            /* the subject and the key facts */
            const title = theme ? `${label.replace(/-theme$/, '')} sets` : label.charAt(0).toUpperCase() + label.slice(1);
            const article = theme ? '' : /^[aeiou]/i.test(label) ? 'AN ' : 'A ';
            let html = `<p class="${PRE}-kicker">HOW LEGO BUILDS ${article}</p><h3 class="${PRE}-subject"><span class="ico">${subjectIcon(k.subject)}</span>${esc(title)}</h3>`
                + `<p class="${PRE}-lead">From <b>${k.n}</b> real ${esc(label)} sets${entry.years ? ` (${entry.years[0]}–${entry.years[1]})` : ''}${entry.themes && entry.themes.length ? `, mostly ${esc(entry.themes.slice(0, 2).join(' and '))}` : ''}: what they have in common, and how ${ref ? 'this set' : 'this model'} compares.</p>`;
            const facts = [[k.n, 'real sets studied']];
            if (pieces) facts.push([`${pieces.p25}–${pieces.p75}`, 'pieces in most sets']);
            facts.push([n, ref ? 'pieces in this set' : 'pieces in this model']);
            html += `<div class="${PRE}-facts">${facts.map(([v, l]) => `<div class="${PRE}-fact"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
            html += `<p class="${PRE}-meta">Mined from open Rebrickable inventories (CC BY 4.0)</p>`;
            fill(P.intro, html);

            /* their colours */
            const pal = (k.palette || []).filter(([c]) => colors()[c]);
            if (pal.length) {
                const total = pal.reduce((a, [, s]) => a + s, 0) || 1;
                fill(P.palette, `<div class="${PRE}-strip" role="img" aria-label="${esc(pal.map(([c, s]) => `${colors()[c].name} ${pct(s)}`).join(', '))}">`
                    + pal.map(([c, s]) => `<span class="${/^TRANS_/.test(c) ? 'trans' : ''}" style="width:${(s / total * 100).toFixed(1)}%;background:${colors()[c].hex}" title="${esc(colors()[c].name)} ${pct(s)}"></span>`).join('')
                    + `</div><div class="${PRE}-swatches">`
                    + pal.map(([c, s]) => `<span class="${PRE}-sw"><span class="${PRE}-dot${/^TRANS_/.test(c) ? ' trans' : ''}" style="background:${colors()[c].hex}"></span>${esc(colors()[c].name)} <i>${pct(s)}</i></span>`).join('')
                    + `</div><p class="${PRE}-meta">Mean share of the pieces in a set${model.palette && model.palette.explicit ? ' · this forge used the colours you named instead' : ''}</p>`);
            } else fill(P.palette, '');

            /* typical size and where this model sits */
            if (pieces) {
                const max = Math.max(pieces.p75 * 1.25, n * 1.1, 10);
                const x = (v) => `${Math.min(100, v / max * 100).toFixed(1)}%`;
                const where = n < pieces.p25 ? 'smaller than most' : n > pieces.p75 ? 'bigger than most' : n < pieces.p50 * 0.8 ? 'on the small side of typical' : n > pieces.p50 * 1.25 ? 'on the large side of typical' : 'right around the median';
                const cal = !ref && k.calibration;
                fill(P.size, `<p class="${PRE}-hint">Real ${esc(label)} sets run <b>${pieces.p25}–${pieces.p75}</b> pieces (the middle half), median <b>${pieces.p50}</b>.</p>`
                    + `<div class="${PRE}-bar" role="img" aria-label="Real sets ${pieces.p25} to ${pieces.p75} pieces, median ${pieces.p50}; ${thisOne.toLowerCase()} ${n}"><div class="${PRE}-band" style="left:${x(pieces.p25)};width:${(Math.min(100, pieces.p75 / max * 100) - Math.min(100, pieces.p25 / max * 100)).toFixed(1)}%"></div><div class="${PRE}-median" style="left:${x(pieces.p50)}"></div><div class="${PRE}-you" style="left:${x(n)}" title="${thisOne}: ${n} pieces"></div></div>`
                    + `<div class="${PRE}-axis"><span>0</span><span>${Math.round(max)} pcs</span></div>`
                    + `<p class="${PRE}-verdict">${thisOne}: <b>${n} pieces</b>, ${where}.${cal ? (cal.kept ? ` Forged once at the usual size (${cal.from} pieces), then again ${cal.scale[1] > cal.scale[0] ? 'bigger' : 'smaller'} to land nearer the real median.` : ` A ${cal.scale[1] > cal.scale[0] ? 'bigger' : 'smaller'} forge did not change the count, so the usual size stands.`) : ''}</p>`
                    + (entry.examples && entry.examples.length ? `<p class="${PRE}-meta">Nearest the median: ${entry.examples.map(([num, name]) => `${esc(name)} (${esc(num)})`).join(' · ')}</p>` : ''));
            } else fill(P.size, '');

            /* the parts real sets use most */
            const ours = (entry.parts || []).map(([id, share, qty]) => ({ id, share, qty, stocked: true }));
            const missing = (entry.wanted || []).map(([id, name, share]) => ({ id, name, share, stocked: false }));
            const top = ours.concat(missing).sort((a, b) => b.share - a.share).slice(0, 12);
            if (top.length) {
                const used = new Set(model.bricks.map((b) => String(b.catalogId || b.partId)).concat(model.bricks.map((b) => String(b.partId))));
                let h = `<ul class="${PRE}-parts">`;
                for (const p of top) {
                    const cls = !p.stocked ? 'missing' : used.has(String(p.id)) ? 'used' : 'unused';
                    const mark = cls === 'used' ? '✓' : cls === 'unused' ? '○' : '✗';
                    const name = p.stocked ? (parts()[p.id] || { name: `Element ${p.id}` }).name : p.name;
                    h += `<li class="${PRE}-part ${cls}"><span class="${PRE}-mark" aria-label="${cls}">${mark}</span><span class="${PRE}-pname">${esc(name)}<small>#${esc(p.id)}${p.qty ? ` · ~${p.qty} per set` : ''}</small></span><span class="${PRE}-share">${pct(p.share)} of sets</span></li>`;
                }
                h += `</ul><div class="${PRE}-legend"><span><b class="u">✓</b> in ${thisOne.toLowerCase()}</span><span><b>○</b> we stock it, unused here</span><span><b class="m">✗</b> not in our catalog</span></div>`;
                fill(P.parts, h);
            } else fill(P.parts, '');

            /* parts we're missing */
            const wanted = (k.wanted || []).length ? k.wanted : missing.slice(0, 5).map((p) => [p.id, p.name, p.share]);
            fill(P.missing, wanted.length ? `<p class="${PRE}-hint">Common in real ${esc(label)} sets, not in StudForge's catalog yet:</p><ul class="${PRE}-parts">`
                + wanted.map(([id, name, share]) => `<li class="${PRE}-part missing"><span class="${PRE}-mark">✗</span><span class="${PRE}-pname">${esc(name)}<small>#${esc(id)}</small></span><span class="${PRE}-share">${pct(share)} of sets</span></li>`).join('')
                + `</ul>` : '');
        }

        // The empty state's actions: forge a suggested subject, or open the real-set browser.
        P.intro.body.addEventListener('click', (e) => {
            const t = e.target.closest('[data-try]');
            if (t) { const w = t.dataset.try; if (sf.setPrompt) sf.setPrompt(w); sf.forge(w, 0, {}); return; }
            if (e.target.closest('[data-browse]')) sf.showPanel(sf.reference && sf.reference.sourceId ? sf.reference.sourceId : 'library');
        });

        sf.on('model', render);
        render();
        // The first idea may be forged before the knowledge file arrives: forge it again once, so it
        // gets the real-set palette and size like every later forge (only when nothing else loaded a model).
        const k = K();
        if (k && k.onReady) k.onReady(() => {
            const m = sf.model;
            if (m && !m.knowledge && m.prompt && m.prompt === sf.state.prompt && m.kind !== 'mosaic' && m.kind !== 'reference') sf.reforge({});
            else render();
        });

        window.studForgeRealSets = { render, subjectLabel, subjectIcon, addSection(fn, opts = {}) { sections.push({ fn, first: !!opts.first }); render(); } };
    }

    if (window.studForge) init();
    else document.addEventListener('studforge:ready', init, { once: true });
})();
