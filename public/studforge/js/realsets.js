// StudForge real sets: what the open set data (data/knowledge.json, via knowledge.js) says
// about the current idea's subject, next to what this model actually did.
//
//   - a 🏷️ REAL SETS side panel: how many real sets stand behind the numbers, their palette,
//     the typical piece count (p25–p75, median) with this model marked on it, the parts real
//     sets use most (✓ in this model / ○ in our catalog but unused here / ✗ not stocked yet),
//     and the most wanted parts we do not stock
//   - a 🏷️ REAL SETS dock chip that opens the panel
//
// The generator attaches `model.knowledge` ({ subject, key, n, pieces, palette, wanted,
// calibration }) to every forge; the full parts list is read from FORGE.knowledge by subject.
(() => {
    const PRE = 'sfr';
    const CSS = `
.${PRE}-sec { margin-bottom: 16px; }
.${PRE}-lead { font-size: 13px; color: #e2e8f0; line-height: 1.4; margin-bottom: 10px; }
.${PRE}-lead b { color: var(--lego-yellow); font-family: var(--font-heading); font-size: 12px; }
.${PRE}-hint { font-size: 12px; color: var(--text-muted); line-height: 1.45; }
.${PRE}-meta { font-family: var(--font-heading); font-size: 8px; letter-spacing: 0.8px; color: var(--text-muted); text-transform: uppercase; margin-top: 6px; }
.${PRE}-strip { display: flex; height: 26px; border-radius: 7px; overflow: hidden; border: 1px solid var(--border-main); }
.${PRE}-strip span { display: block; min-width: 3px; }
.${PRE}-strip span.trans { background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 3px, transparent 3px 6px); }
.${PRE}-swatches { display: flex; flex-wrap: wrap; gap: 6px 10px; margin-top: 8px; }
.${PRE}-sw { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-secondary); }
.${PRE}-dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); box-shadow: inset 0 -2px 0 rgba(0,0,0,0.18); flex-shrink: 0; }
.${PRE}-dot.trans { border-style: dashed; }
.${PRE}-sw i { font-style: normal; font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); }
.${PRE}-bar { position: relative; height: 14px; margin: 10px 0 4px; border-radius: 7px; background: rgba(255,255,255,0.06); border: 1px solid var(--border-main); }
.${PRE}-band { position: absolute; top: 0; bottom: 0; background: rgba(242, 205, 55, 0.22); border-left: 1px solid rgba(242, 205, 55, 0.5); border-right: 1px solid rgba(242, 205, 55, 0.5); }
.${PRE}-median { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--lego-yellow); }
.${PRE}-you { position: absolute; top: -5px; width: 10px; height: 22px; margin-left: -5px; border-radius: 5px; background: #fff; border: 2px solid var(--bg-card); box-shadow: 0 0 0 1px rgba(255,255,255,0.4); }
.${PRE}-axis { display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); }
.${PRE}-verdict { font-size: 12px; color: #e2e8f0; margin-top: 8px; line-height: 1.45; }
.${PRE}-verdict b { color: var(--lego-yellow); }
.${PRE}-parts { list-style: none; margin: 0; padding: 0; }
.${PRE}-part { display: grid; grid-template-columns: 18px 1fr auto; gap: 8px; align-items: center; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px; }
.${PRE}-part:last-child { border-bottom: 0; }
.${PRE}-mark { font-family: var(--font-mono); font-size: 12px; text-align: center; }
.${PRE}-part.used .${PRE}-mark { color: #4ade80; }
.${PRE}-part.unused .${PRE}-mark { color: var(--text-muted); }
.${PRE}-part.missing .${PRE}-mark { color: #f87171; }
.${PRE}-part.missing .${PRE}-pname { color: var(--text-muted); }
.${PRE}-pname { color: #e2e8f0; line-height: 1.25; }
.${PRE}-pname small { display: block; font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); }
.${PRE}-share { font-family: var(--font-mono); font-size: 10px; color: var(--text-secondary); white-space: nowrap; }
.${PRE}-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 10px; color: var(--text-muted); margin-top: 6px; }
.${PRE}-legend b { font-family: var(--font-mono); font-weight: 600; }
.${PRE}-legend .u { color: #4ade80; } .${PRE}-legend .m { color: #f87171; }
.${PRE}-examples { font-size: 11px; color: var(--text-muted); line-height: 1.5; }
.${PRE}-examples b { color: var(--text-secondary); font-weight: 600; }
`;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const colors = () => window.LEGO_COLORS || {};
    const parts = () => window.LEGO_PARTS || {};
    const pct = (s) => `${Math.round(s * 100)}%`;
    // "fireTruck" → "fire truck", "themeCity" → "City-theme"
    const subjectLabel = (id, key) => {
        if (id.startsWith('theme')) return `${id.slice(5)}-theme`;
        return key || id.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    };

    function init() {
        const sf = window.studForge;
        if (!sf || !sf.registerPanel) return;
        const style = document.createElement('style'); style.id = `${PRE}-style`; style.textContent = CSS; document.head.appendChild(style);

        const panel = sf.registerPanel({ id: 'realsets', title: '🏷️ REAL SETS' });
        const body = panel.body;

        /* the dock chip */
        const chip = document.createElement('button');
        chip.className = `tool-chip ${PRE}-chip`; chip.type = 'button'; chip.title = 'What real sets of this subject are made of';
        chip.textContent = '🏷️ REAL SETS';
        chip.addEventListener('click', () => {
            // On phones the side panel is folded under the PARTS button: unfold it first.
            const card = document.getElementById('bom-card'), toggle = document.getElementById('btn-bom-toggle');
            if (card && toggle && getComputedStyle(card).display === 'none') toggle.click();
            panel.show();
            if (card) { const r = card.getBoundingClientRect(); if (r.top > window.innerHeight - 120 || r.bottom < 0) card.scrollIntoView({ block: 'start' }); }
        });
        sf.dock(chip);

        const K = () => (window.FORGE && window.FORGE.knowledge) || null;
        const entryOf = (id) => { const k = K(); return k && k.data && k.data.subjects[id] ? k.data.subjects[id] : null; };

        // Other features add their own sections (reference.js: BUILD A REAL SET): fn(model) → Element | null,
        // rendered after this panel's own content (or right under its title with `first`).
        const sections = [];
        function render() {
            renderOwn();
            for (const s of sections) {
                let node = null;
                try { node = s.fn(sf.model); } catch (e) { console.error('studForge real sets section', e); }
                if (node) body.insertBefore(node, s.first && body.firstElementChild ? body.firstElementChild.nextSibling : null);
            }
        }
        function renderOwn() {
            const model = sf.model;
            const k = model && model.knowledge;
            if (!k) {
                body.innerHTML = `<h4>🏷️ REAL SETS</h4><p class="${PRE}-hint">No real-set data for this idea yet.</p><p class="${PRE}-meta">Try a fire truck, a castle, a tree, a spaceship…</p>`;
                chip.title = 'No real-set data for this idea yet';
                return;
            }
            const entry = entryOf(k.subject) || {};
            const label = subjectLabel(k.subject, k.key);
            const pieces = k.pieces || entry.pieces || null;
            const n = model.bricks.length;
            chip.title = `Based on ${k.n} real ${label} sets`;
            let html = `<h4>🏷️ REAL SETS</h4><p class="${PRE}-lead">Based on <b>${k.n}</b> real <b>${esc(label)}</b> sets${entry.years ? ` (${entry.years[0]}–${entry.years[1]})` : ''}${entry.themes && entry.themes.length ? `, mostly ${esc(entry.themes.slice(0, 2).join(' and '))}` : ''}.</p>`;

            /* palette strip */
            const pal = (k.palette || []).filter(([c]) => colors()[c]);
            if (pal.length) {
                const total = pal.reduce((a, [, s]) => a + s, 0) || 1;
                html += `<div class="${PRE}-sec"><h4>🎨 THEIR PALETTE</h4><div class="${PRE}-strip" role="img" aria-label="${esc(pal.map(([c, s]) => `${colors()[c].name} ${pct(s)}`).join(', '))}">`
                    + pal.map(([c, s]) => `<span class="${/^TRANS_/.test(c) ? 'trans' : ''}" style="width:${(s / total * 100).toFixed(1)}%;background:${colors()[c].hex}" title="${esc(colors()[c].name)} ${pct(s)}"></span>`).join('')
                    + `</div><div class="${PRE}-swatches">`
                    + pal.map(([c, s]) => `<span class="${PRE}-sw"><span class="${PRE}-dot${/^TRANS_/.test(c) ? ' trans' : ''}" style="background:${colors()[c].hex}"></span>${esc(colors()[c].name)} <i>${pct(s)}</i></span>`).join('')
                    + `</div><p class="${PRE}-meta">Mean share of the pieces in a set${model.palette && model.palette.explicit ? ' · this forge used the colours you named instead' : ''}</p></div>`;
            }

            /* typical size and where this model sits */
            if (pieces) {
                const max = Math.max(pieces.p75 * 1.25, n * 1.1, 10);
                const x = (v) => `${Math.min(100, v / max * 100).toFixed(1)}%`;
                const where = n < pieces.p25 ? 'smaller than most' : n > pieces.p75 ? 'bigger than most' : n < pieces.p50 * 0.8 ? 'on the small side of typical' : n > pieces.p50 * 1.25 ? 'on the large side of typical' : 'right around the median';
                const cal = k.calibration;
                html += `<div class="${PRE}-sec"><h4>📏 TYPICAL SIZE</h4><p class="${PRE}-hint">Real ${esc(label)} sets run <b>${pieces.p25}–${pieces.p75}</b> pieces (middle half), median <b>${pieces.p50}</b>.</p>`
                    + `<div class="${PRE}-bar" role="img" aria-label="Real sets ${pieces.p25} to ${pieces.p75} pieces, median ${pieces.p50}; this model ${n}"><div class="${PRE}-band" style="left:${x(pieces.p25)};width:${(Math.min(100, pieces.p75 / max * 100) - Math.min(100, pieces.p25 / max * 100)).toFixed(1)}%"></div><div class="${PRE}-median" style="left:${x(pieces.p50)}"></div><div class="${PRE}-you" style="left:${x(n)}" title="This model: ${n} pieces"></div></div>`
                    + `<div class="${PRE}-axis"><span>0</span><span>${Math.round(max)} pcs</span></div>`
                    + `<p class="${PRE}-verdict">This model: <b>${n} pieces</b>, ${where}.${cal ? (cal.kept ? ` Forged once at the usual size (${cal.from} pieces), then again ${cal.scale[1] > cal.scale[0] ? 'bigger' : 'smaller'} to land nearer the real median.` : ` A ${cal.scale[1] > cal.scale[0] ? 'bigger' : 'smaller'} forge did not change the count, so the usual size stands.`) : ''}</p></div>`;
            }

            /* the parts real sets use most */
            const ours = (entry.parts || []).map(([id, share, qty]) => ({ id, share, qty, stocked: true }));
            const missing = (entry.wanted || []).map(([id, name, share]) => ({ id, name, share, stocked: false }));
            const top = ours.concat(missing).sort((a, b) => b.share - a.share).slice(0, 12);
            if (top.length) {
                const used = new Set(model.bricks.map((b) => String(b.partId)));
                html += `<div class="${PRE}-sec"><h4>🧱 PARTS THEY USE MOST</h4><ul class="${PRE}-parts">`;
                for (const p of top) {
                    const cls = !p.stocked ? 'missing' : used.has(String(p.id)) ? 'used' : 'unused';
                    const mark = cls === 'used' ? '✓' : cls === 'unused' ? '○' : '✗';
                    const name = p.stocked ? (parts()[p.id] || { name: `Element ${p.id}` }).name : p.name;
                    html += `<li class="${PRE}-part ${cls}"><span class="${PRE}-mark" aria-label="${cls}">${mark}</span><span class="${PRE}-pname">${esc(name)}<small>#${esc(p.id)}${p.qty ? ` · ~${p.qty} per set` : ''}</small></span><span class="${PRE}-share">${pct(p.share)} of sets</span></li>`;
                }
                html += `</ul><div class="${PRE}-legend"><span><b class="u">✓</b> in this model</span><span><b>○</b> we stock it, unused here</span><span><b class="m">✗</b> not in our catalog</span></div></div>`;
            }

            /* parts we're missing */
            const wanted = (k.wanted || []).length ? k.wanted : missing.slice(0, 5).map((p) => [p.id, p.name, p.share]);
            if (wanted.length) {
                html += `<div class="${PRE}-sec"><h4>🔍 PARTS WE'RE MISSING</h4><p class="${PRE}-hint">Common in real ${esc(label)} sets, not in StudForge's catalog yet:</p><ul class="${PRE}-parts">`
                    + wanted.map(([id, name, share]) => `<li class="${PRE}-part missing"><span class="${PRE}-mark">✗</span><span class="${PRE}-pname">${esc(name)}<small>#${esc(id)}</small></span><span class="${PRE}-share">${pct(share)} of sets</span></li>`).join('')
                    + `</ul></div>`;
            }

            if (entry.examples && entry.examples.length) html += `<p class="${PRE}-examples">Sets nearest the median size: ${entry.examples.map(([num, name]) => `<b>${esc(name)}</b> (${esc(num)})`).join(', ')}.</p>`;
            html += `<p class="${PRE}-meta">Mined from open Rebrickable inventories (CC BY 4.0)</p>`;
            body.innerHTML = html;
        }

        sf.on('model', render);
        render();
        // The first idea may be forged before the knowledge file arrives: forge it again once, so it
        // gets the real-set palette and size like every later forge (only when nothing else loaded a model).
        const k = K();
        if (k && k.onReady) k.onReady(() => {
            const m = sf.model;
            if (m && !m.knowledge && m.prompt && m.prompt === sf.state.prompt && m.kind !== 'mosaic') sf.reforge({});
            else render();
        });

        window.studForgeRealSets = { render, subjectLabel, addSection(fn, opts = {}) { sections.push({ fn, first: !!opts.first }); render(); } };
    }

    if (window.studForge) init();
    else document.addEventListener('studforge:ready', init, { once: true });
})();
