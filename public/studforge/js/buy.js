// StudForge buying help: what the build would cost in real bricks, cheaper
// colour swaps, and "I own these bricks" so the parts list and the price only
// count what you still need. Everything is client-side; prices are rough
// marketplace ballparks kept in this file.
(() => {
    const PRE = 'sfb';                       // CSS / DOM prefix for this feature
    const STORE_KEY = 'studforge.owned.v1';

    /* ── price table (USD, typical new-part marketplace averages) ───── */
    // Per part id. Anything missing falls back to a category + stud-area estimate below.
    const PART_PRICE = {
        // bricks
        3005: 0.06, 3004: 0.07, 3622: 0.09, 3010: 0.10, 3009: 0.14, 3008: 0.20, 3003: 0.09, 3002: 0.13, 3001: 0.15, 2456: 0.25, 3007: 0.40,
        // plates
        3024: 0.04, 3023: 0.04, 3623: 0.05, 3710: 0.06, 3666: 0.09, 3460: 0.12, 4477: 0.15, 3022: 0.06, 3021: 0.08, 3020: 0.10, 3795: 0.14, 3034: 0.20, 3832: 0.30,
        3031: 0.25, 3032: 0.40, 3035: 0.60, 3958: 0.65, 3036: 0.95, 4073: 0.04, 4032: 0.08,
        // tiles
        3070: 0.05, 3069: 0.06, 2431: 0.10, 6636: 0.16, 3068: 0.10, 87079: 0.18, 98138: 0.05, 14769: 0.12,
        // slopes
        54200: 0.05, 85984: 0.07, 3040: 0.07, 3039: 0.12, 3038: 0.18, 3037: 0.25, 4286: 0.10, 3298: 0.16,
        // round, cones, domes, misc
        3062: 0.05, 3941: 0.09, 59900: 0.06, 3942: 0.18, 553: 0.20, 3957: 0.12,
    };
    // Fallback: a base price per category plus a little per stud of footprint.
    const CATEGORY_PRICE = { Bricks: [0.05, 0.025], Plates: [0.03, 0.02], Tiles: [0.04, 0.03], Slopes: [0.05, 0.04], Round: [0.06, 0.04], Misc: [0.10, 0.03] };
    // Colour rarity: common colours ×1, transparent ×1.4, metallic ×1.8, dark and fashion colours a bit more.
    const COLOR_MULT = { GOLD: 1.8, DARK_RED: 1.15, DARK_BLUE: 1.15, PURPLE: 1.25, PINK: 1.15, LIME: 1.1, BROWN: 1.1, DARK_GREY: 1.05 };
    // Cheaper colour in the same family, used by the swap finder.
    const CHEAPER = { GOLD: 'YELLOW', DARK_RED: 'RED', DARK_BLUE: 'BLUE', LIME: 'GREEN', TRANS_BLUE: 'BLUE', TRANS_ORANGE: 'ORANGE', TRANS_RED: 'RED', TRANS_CLEAR: 'WHITE' };
    // Roles where a transparent colour is the whole point: windows, water, lamps stay trans.
    const KEEP_TRANS_ROLES = new Set(['glass', 'water', 'light']);
    const RANGE = [0.75, 1.35];              // low–high band around the estimate

    const parts = () => window.LEGO_PARTS || {};
    const colors = () => window.LEGO_COLORS || {};
    const colorMult = (id) => { const c = colors()[id]; if (!c) return 1.2; if (c.category === 'Transparent' || /^TRANS_/.test(id)) return 1.4; return COLOR_MULT[id] || 1; };
    const unitPrice = (partId, colorId) => {
        let base = PART_PRICE[partId];
        if (base == null) {
            const p = parts()[partId] || {};
            const [b, per] = CATEGORY_PRICE[p.category] || CATEGORY_PRICE.Misc;
            base = b + per * ((p.width || 1) * (p.length || 1));
        }
        return base * colorMult(colorId);
    };
    const money = (n) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;

    /* ── "I own these bricks" parsing ───────────────────────────────── */
    // Lines like "10 x 3001 red", "3001 RED 10", "2x4 brick red 10", or the app's own
    // COPY LIST rows "[ ] 12   | Brick 2 x 4 | #3001 | Bright Red". A line without a
    // colour matches any colour; a name without a category ("2x4") matches any part of that size.
    const CATEGORY_WORDS = { brick: 'Bricks', bricks: 'Bricks', plate: 'Plates', plates: 'Plates', tile: 'Tiles', tiles: 'Tiles', slope: 'Slopes', slopes: 'Slopes', wedge: 'Slopes', cone: 'cone', cones: 'cone', dome: 'dome', antenna: 'antenna', cheese: 'cheese' };
    const STOP = new Set(['x', '×', 'of', 'pcs', 'pc', 'pieces', 'piece', 'qty', 'a', 'an', 'the', 'and', '-', '–', 'with', 'top', 'groove', 'lego', 'element', 'id']);
    const colorByName = (() => {
        // "Bright Red" → RED, "Tan" → TAN, "Trans-Light Blue" → TRANS_BLUE
        const m = {};
        for (const [id, c] of Object.entries(colors())) {
            m[c.name.toLowerCase()] = id;
            const paren = c.name.match(/\(([^)]+)\)/);
            if (paren) m[paren[1].toLowerCase()] = id; else m[c.name.toLowerCase()] = id;
            m[id.toLowerCase().replace(/_/g, ' ')] = id; m[id.toLowerCase().replace(/_/g, '-')] = id;
        }
        return m;
    })();
    const colorFromWords = (tokens) => {
        // Exact ids and two-word names first ("dark red", "trans clear"), then single colour words.
        const gen = window.studForge && window.studForge.generator;
        const resolve = (s) => { if (colorByName[s]) return colorByName[s]; return gen && gen.colorId ? gen.colorId(s) : (colors()[s.toUpperCase().replace(/[\s-]+/g, '_')] ? s.toUpperCase().replace(/[\s-]+/g, '_') : null); };
        for (let i = 0; i < tokens.length - 1; i++) { const two = `${tokens[i]} ${tokens[i + 1]}`; if (colorByName[two] || /^(dark|light|trans|bright|medium)/.test(tokens[i])) { const id = resolve(two); if (id && (colorByName[two] || id.includes('_'))) return { id, used: [i, i + 1] }; } }
        for (let i = 0; i < tokens.length; i++) { if (/^\d/.test(tokens[i])) continue; const id = resolve(tokens[i]); if (id) return { id, used: [i] }; }
        return null;
    };
    const partsByName = (tokens) => {
        // Category word + "WxL" + modifiers narrow the catalog to a set of ids.
        let cat = null, dims = null, round = false;
        const flags = new Set(), rest = [];
        for (const t of tokens) {
            const d = t.match(/^(\d{1,2})x(\d{1,2})$/);
            if (d) { dims = [+d[1], +d[2]]; continue; }
            const c = CATEGORY_WORDS[t];
            if (c) { if (['cone', 'dome', 'antenna', 'cheese'].includes(c)) flags.add(c); else cat = cat || c; continue; }
            if (t === 'round' || t === 'cylinder') { round = true; continue; }
            rest.push(t);
        }
        if (!cat && !dims && !flags.size) return [];
        let list = Object.values(parts());
        if (flags.has('cheese')) return list.filter((p) => /cheese/i.test(p.name)).map((p) => p.id);
        if (flags.has('antenna')) return list.filter((p) => p.isAntenna).map((p) => p.id);
        if (flags.has('dome')) list = list.filter((p) => p.isDome);
        else if (flags.has('cone')) list = list.filter((p) => p.isCone);
        else if (cat) list = list.filter((p) => p.category === cat || (cat === 'Bricks' && p.category === 'Round' && /^Brick/.test(p.name)));
        if (dims) list = list.filter((p) => (p.width === dims[0] && p.length === dims[1]) || (p.width === dims[1] && p.length === dims[0]));
        if (round && !flags.size) list = list.filter((p) => p.isRound);
        else if (!flags.size && list.some((p) => !p.isRound && !p.isCone && !p.isDome)) list = list.filter((p) => !p.isRound && !p.isCone && !p.isDome);
        // A slope angle narrows further ("slope 45 2x2", "33").
        const angle = rest.find((t) => /^(30|33|45)$/.test(t));
        if (angle && list.some((p) => p.name.includes(`Slope ${angle}`))) list = list.filter((p) => p.name.includes(`Slope ${angle}`));
        return list.map((p) => p.id);
    };
    function parseOwnedLine(raw) {
        let line = String(raw || '').trim();
        if (!line) return null;
        line = line.replace(/^\[\s*[xX✓✔ ]?\s*\]\s*/, '');          // checklist box
        if (/^[-=_\s]+$/.test(line) || /^(📦|total pieces|generated with|qty\s*\|)/i.test(line)) return null;  // list chrome
        const out = { raw, qty: 1, parts: [], color: null, ok: false };
        if (line.includes('|')) {
            // The app's COPY LIST row: qty | name | #id | colour
            const f = line.split('|').map((s) => s.trim()).filter(Boolean);
            const q = f.find((s) => /^\d+$/.test(s)); if (q) out.qty = +q;
            const idF = f.find((s) => /^#?\d{3,}$/.test(s)); if (idF && parts()[idF.replace('#', '')]) out.parts = [idF.replace('#', '')];
            const colF = f.slice().reverse().find((s) => colorByName[s.toLowerCase()]); if (colF) out.color = colorByName[colF.toLowerCase()];
            if (!out.color) { const c = colorFromWords(f.join(' ').toLowerCase().split(/\s+/)); if (c) out.color = c.id; }
            if (!out.parts.length) { const nameF = f.find((s) => /[a-z]/i.test(s) && !colorByName[s.toLowerCase()]); if (nameF) out.parts = partsByName(nameF.toLowerCase().replace(/(\d{1,2})\s*x\s*(\d{1,2})/g, '$1x$2').split(/\s+/)); }
            out.ok = out.parts.length > 0;
            return out;
        }
        const norm = line.toLowerCase().replace(/[,;#()]/g, ' ').replace(/\b(\d{1,2})\s*[x×]\s*(\d{1,2})\b/g, '$1x$2');
        let tokens = norm.split(/\s+/).filter((t) => t && !STOP.has(t));
        const ints = tokens.filter((t) => /^\d+$/.test(t));
        const ids = ints.filter((t) => parts()[t]);
        if (ids.length) {
            // "10 x 3001 red" / "3001 RED 10": the catalog id is the part, the other integer is the quantity.
            const id = ids.length > 1 && ints.length === ids.length ? ids[0] : ids.find((t) => t.length >= 3) || ids[0];
            out.parts = [id];
            const q = ints.find((t) => t !== id); if (q) out.qty = +q;
            tokens = tokens.filter((t) => t !== id && t !== q);
        } else if (ints.length) { out.qty = +ints[0]; tokens = tokens.filter((t) => t !== ints[0]); }
        const c = colorFromWords(tokens);
        if (c) { out.color = c.id; tokens = tokens.filter((_, i) => !c.used.includes(i)); }
        if (!out.parts.length) out.parts = partsByName(tokens);
        out.qty = Math.max(1, Math.min(9999, out.qty || 1));
        out.ok = out.parts.length > 0;
        return out;
    }
    const parseOwned = (text) => String(text || '').split(/\r?\n/).map(parseOwnedLine).filter(Boolean);

    /* ── pricing a model against what is owned ──────────────────────── */
    // Rows like studForge.bom, built from the bricks so dry runs can be priced too.
    function rowsOf(model) {
        const map = new Map();
        for (const b of model.bricks) {
            const k = `${b.partId}_${b.color}`;
            if (!map.has(k)) { const p = parts()[b.partId] || { name: `Element ${b.partId}`, category: 'Misc' }; const c = colors()[b.color] || { name: b.color, hex: '#ccc' }; map.set(k, { key: k, partId: String(b.partId), partName: p.name, colorKey: b.color, colorName: c.name, colorHex: c.hex, quantity: 0 }); }
            map.get(k).quantity++;
        }
        return [...map.values()].sort((a, b) => b.quantity - a.quantity);
    }
    // Hand owned pieces to rows: exact part+colour entries first, then colour-less, then size-only ones.
    function allocate(rows, entries) {
        const pool = entries.filter((e) => e.ok).map((e) => ({ parts: new Set(e.parts), color: e.color, left: e.qty }));
        const owned = new Map();
        for (const r of rows) {
            let need = r.quantity, got = 0;
            const fits = pool.filter((e) => e.left > 0 && e.parts.has(r.partId) && (!e.color || e.color === r.colorKey))
                .sort((a, b) => (a.color ? 0 : 2) + (a.parts.size > 1 ? 1 : 0) - ((b.color ? 0 : 2) + (b.parts.size > 1 ? 1 : 0)));
            for (const e of fits) { if (!need) break; const take = Math.min(need, e.left); e.left -= take; need -= take; got += take; }
            owned.set(r.key, got);
        }
        return owned;
    }
    function estimate(model, entries) {
        const rows = rowsOf(model);
        const owned = allocate(rows, entries || []);
        let total = 0, full = 0, ownedPieces = 0, ownedValue = 0;
        for (const r of rows) {
            r.unit = unitPrice(r.partId, r.colorKey);
            r.owned = owned.get(r.key) || 0;
            r.need = r.quantity - r.owned;
            r.line = r.need * r.unit;
            full += r.quantity * r.unit; total += r.line; ownedPieces += r.owned; ownedValue += r.owned * r.unit;
        }
        rows.sort((a, b) => b.line - a.line || b.quantity - a.quantity);
        return { rows, total, full, pieces: model.bricks.length, ownedPieces, ownedValue, low: total * RANGE[0], high: total * RANGE[1] };
    }

    /* ── UI ─────────────────────────────────────────────────────────── */
    const css = `
.${PRE}-total { font-family: var(--font-heading); font-size: 30px; font-weight: 900; color: var(--lego-yellow); line-height: 1; letter-spacing: 1px; }
.${PRE}-range { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); margin-top: 6px; }
.${PRE}-ownnote { font-family: var(--font-mono); font-size: 10px; color: #7ee787; margin-top: 4px; }
.${PRE}-note { font-size: 11px; color: var(--text-muted); margin: 8px 0 0; line-height: 1.4; }
.${PRE}-sec { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-main); }
.${PRE}-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
[class^='${PRE}-'] [hidden], .${PRE}-ownnote[hidden] { display: none !important; }
.${PRE}-dot { width: 9px; height: 9px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); display: inline-block; flex-shrink: 0; }
.${PRE}-row .action-btn { width: auto; flex: 1 1 auto; padding: 7px 10px; font-size: 10px; }
.${PRE}-status { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); margin-top: 6px; line-height: 1.5; }
.${PRE}-status .bad { color: #f87171; }
.${PRE}-ta { width: 100%; min-height: 84px; resize: vertical; box-sizing: border-box; background: rgba(9, 12, 19, 0.6); color: var(--text-primary); border: 1px solid var(--border-main); border-radius: 6px; padding: 8px; font-family: var(--font-mono); font-size: 11px; line-height: 1.5; margin-top: 8px; }
.${PRE}-ta:focus { outline: none; border-color: var(--lego-yellow); }
.${PRE}-swaps { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.${PRE}-swap { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--border-main); border-radius: 6px; background: rgba(255, 255, 255, 0.03); }
.${PRE}-swap-info { flex: 1; min-width: 0; }
.${PRE}-swap-roles { font-family: var(--font-heading); font-size: 9px; letter-spacing: 0.6px; color: var(--text-muted); text-transform: uppercase; }
.${PRE}-swap-colors { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; font-size: 12px; color: #e2e8f0; margin: 3px 0; }
.${PRE}-swap-colors span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.${PRE}-swap-save { font-family: var(--font-mono); font-size: 10px; color: #7ee787; }
.${PRE}-swap .action-btn { width: auto; padding: 6px 10px; font-size: 10px; flex-shrink: 0; }
.${PRE}-empty { font-size: 11px; color: var(--text-muted); margin-top: 8px; }
.${PRE}-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
.${PRE}-table th { text-align: left; font-family: var(--font-heading); font-size: 8px; letter-spacing: 0.5px; color: var(--text-muted); padding: 4px 4px; border-bottom: 1px solid var(--border-main); }
.${PRE}-table td { padding: 5px 4px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); vertical-align: top; }
.${PRE}-table .num { text-align: right; font-family: var(--font-mono); white-space: nowrap; }
.${PRE}-table .line { color: #fff; font-weight: 700; }
.${PRE}-table tr.owned td { opacity: 0.4; }
.${PRE}-pn { color: #e2e8f0; font-weight: 600; line-height: 1.2; }
.${PRE}-pc { font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
.${PRE}-pc i { width: 8px; height: 8px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.25); display: inline-block; }
.${PRE}-chip .${PRE}-chip-val { font-family: var(--font-mono); color: var(--lego-yellow); }
/* the parts table: owned rows fade, partial rows say what is still needed */
#bom-table-body tr.${PRE}-owned td { opacity: 0.45; }
#bom-table-body tr.${PRE}-owned .part-name { text-decoration: line-through; }
.${PRE}-tag { display: block; font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.3px; margin-top: 3px; color: #7ee787; white-space: nowrap; }
.${PRE}-tag.partial { color: var(--lego-yellow); }
@media (max-width: 600px) {
  .${PRE}-total { font-size: 26px; } .${PRE}-table { font-size: 10px; }
}
`;

    function init() {
        const sf = window.studForge;
        if (!sf || !sf.registerPanel) return;
        const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

        let ownedText = '';
        try { ownedText = localStorage.getItem(STORE_KEY) || ''; } catch (e) { /* private mode: fine, just not remembered */ }
        let entries = parseOwned(ownedText);
        let est = null;
        let lastSwap = null;          // { roles: { role: previousValueOrNull } } for UNDO
        let swapsOpen = false;

        /* the panel */
        const panel = sf.registerPanel({ id: 'buy', title: '🛒 BUY' });
        const body = panel.body;
        body.innerHTML = `
<h4>PRICE ESTIMATE</h4>
<div class="${PRE}-total" id="${PRE}-total">≈ $0.00</div>
<div class="${PRE}-range" id="${PRE}-range"></div>
<div class="${PRE}-ownnote" id="${PRE}-ownnote" hidden></div>
<p class="${PRE}-note">Rough new-part ballparks (USD, recent marketplace averages) – real prices vary by seller and colour. Buy the list on BrickLink or LEGO Pick-a-Brick.</p>
<div class="${PRE}-sec">
  <h4>💸 CHEAPER COLOURS</h4>
  <div class="${PRE}-row"><button class="action-btn secondary" id="${PRE}-find">💸 CHEAPER COLOURS</button><button class="action-btn tertiary" id="${PRE}-undo" hidden>↩ UNDO SWAP</button></div>
  <div class="${PRE}-swaps" id="${PRE}-swaps"></div>
</div>
<div class="${PRE}-sec">
  <h4>🧱 I OWN THESE BRICKS</h4>
  <p class="${PRE}-note" style="margin:0">One per line: <code>10 x 3001 red</code>, <code>2x4 brick red 10</code>, or paste the COPY LIST text. No colour = any colour.</p>
  <textarea class="${PRE}-ta" id="${PRE}-ta" placeholder="10 x 3001 red&#10;2x4 plate 6&#10;3024 white 20" spellcheck="false"></textarea>
  <div class="${PRE}-row"><button class="action-btn primary" id="${PRE}-save">✓ APPLY OWNED</button><button class="action-btn tertiary" id="${PRE}-clear">CLEAR</button></div>
  <div class="${PRE}-status" id="${PRE}-status"></div>
  <div class="${PRE}-row"><button class="action-btn secondary" id="${PRE}-copy">📋 COPY MISSING PARTS</button></div>
</div>
<div class="${PRE}-sec">
  <h4>BREAKDOWN</h4>
  <table class="${PRE}-table"><thead><tr><th>PART</th><th class="num">QTY</th><th class="num">UNIT</th><th class="num">LINE</th></tr></thead><tbody id="${PRE}-rows"></tbody></table>
</div>`;
        const $ = (id) => body.querySelector(`#${PRE}-${id}`);
        const ta = $('ta'); ta.value = ownedText;

        /* the dock chip */
        const chip = document.createElement('button');
        chip.className = `tool-chip ${PRE}-chip`; chip.type = 'button'; chip.title = 'What these bricks would cost';
        chip.innerHTML = `🛒 <span class="${PRE}-chip-val">≈ $0.00</span>`;
        chip.addEventListener('click', () => {
            // On phones the side panel is folded under the PARTS button: unfold it first.
            const card = document.getElementById('bom-card'), toggle = document.getElementById('btn-bom-toggle');
            if (card && toggle && getComputedStyle(card).display === 'none') toggle.click();
            panel.show();
            // Bring the card on screen when it sits below the fold (phones stack it under the viewport).
            if (card) { const r = card.getBoundingClientRect(); if (r.top > window.innerHeight - 120 || r.bottom < 0) card.scrollIntoView({ block: 'start' }); }
        });
        sf.dock(chip);

        const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const colorName = (id) => (colors()[id] || { name: id }).name;
        const colorHex = (id) => (colors()[id] || { hex: '#ccc' }).hex;

        function renderEstimate() {
            if (!sf.model) return;
            est = estimate(sf.model, entries);
            $('total').textContent = `≈ ${money(est.total)}`;
            $('range').textContent = `LOW ${money(est.low)} – HIGH ${money(est.high)} · ${est.pieces - est.ownedPieces} PIECES TO BUY`;
            const note = $('ownnote');
            note.hidden = !est.ownedPieces;
            if (est.ownedPieces) note.textContent = `YOU OWN ${est.ownedPieces} OF ${est.pieces} PIECES (−${money(est.ownedValue)})`;
            chip.querySelector(`.${PRE}-chip-val`).textContent = `≈ ${money(est.total)}`;
            $('rows').innerHTML = est.rows.map((r) => `<tr class="${r.need === 0 ? 'owned' : ''}"><td><div class="${PRE}-pn">${esc(r.partName)}</div><div class="${PRE}-pc"><i style="background:${r.colorHex}"></i>${esc(r.colorName)} · #${esc(r.partId)}</div></td><td class="num">${r.need < r.quantity ? `${r.need}<span style="color:var(--text-muted)">/${r.quantity}</span>` : r.quantity}</td><td class="num">${money(r.unit)}</td><td class="num line">${money(r.line)}</td></tr>`).join('');
            decorateParts();
            if (swapsOpen) findSwaps();
        }

        // Grey out owned rows in the PARTS table; main.js re-renders it on every model, so this runs after.
        function decorateParts() {
            const rows = document.querySelectorAll('#bom-table-body tr[data-part][data-color]');
            const byKey = new Map((est ? est.rows : []).map((r) => [r.key, r]));
            for (const tr of rows) {
                tr.classList.remove(`${PRE}-owned`);
                for (const t of tr.querySelectorAll(`.${PRE}-tag`)) t.remove();
                const r = byKey.get(`${tr.dataset.part}_${tr.dataset.color}`);
                if (!r || !r.owned) continue;
                const cell = tr.querySelector('td.text-right') || tr.lastElementChild;
                const tag = document.createElement('span');
                if (r.need === 0) { tr.classList.add(`${PRE}-owned`); tag.className = `${PRE}-tag`; tag.textContent = '✓ OWNED'; }
                else { tag.className = `${PRE}-tag partial`; tag.textContent = `${r.need} needed / ${r.owned} owned`; }
                cell.appendChild(tag);
            }
        }

        /* owned list */
        function applyOwned() {
            ownedText = ta.value;
            entries = parseOwned(ownedText);
            try { if (ownedText.trim()) localStorage.setItem(STORE_KEY, ownedText); else localStorage.removeItem(STORE_KEY); } catch (e) { /* not persisted */ }
            renderStatus();
            renderEstimate();
        }
        function renderStatus() {
            const good = entries.filter((e) => e.ok), bad = entries.filter((e) => !e.ok);
            const pieces = good.reduce((n, e) => n + e.qty, 0);
            $('status').innerHTML = !entries.length ? '' : `${good.length} LINE${good.length === 1 ? '' : 'S'} · ${pieces} PIECES OWNED` + (bad.length ? `<br><span class="bad">COULDN'T READ: ${bad.slice(0, 3).map((e) => esc(e.raw.trim())).join(' · ')}${bad.length > 3 ? ` (+${bad.length - 3})` : ''}</span>` : '');
        }
        $('save').addEventListener('click', applyOwned);
        ta.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') applyOwned(); });
        $('clear').addEventListener('click', () => { ta.value = ''; applyOwned(); });

        const flash = (btn, text) => { const orig = btn.innerHTML; btn.innerHTML = text; setTimeout(() => { btn.innerHTML = orig; }, 1800); };
        const copyText = (text) => (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : new Promise((res, rej) => { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); const ok = document.execCommand && document.execCommand('copy'); t.remove(); ok ? res() : rej(new Error('copy')); }));
        // Same text format as the core's COPY LIST, but only what is still needed.
        function missingText() {
            const m = sf.model; if (!m || !est) return '';
            const rows = est.rows.filter((r) => r.need > 0).sort((a, b) => b.need - a.need);
            const need = rows.reduce((n, r) => n + r.need, 0);
            let text = `📦 STUDFORGE MISSING PARTS: ${m.name.toUpperCase()}\n${m.description}\n`;
            text += `Still Needed: ${need} of ${m.bricks.length} pieces | Unique Elements: ${rows.length} | Est. ≈ ${money(est.total)}\n\n[ ] QTY | ELEMENT | DESIGN ID | COLOR\n----------------------------------------------------\n`;
            for (const r of rows) text += `[ ] ${String(r.need).padEnd(4)} | ${r.partName.padEnd(34)} | #${r.partId.padEnd(6)} | ${r.colorName}\n`;
            text += `\nGenerated with StudForge 3D LEGO Idea Maker (https://tonytoubia.com/studforge) from the idea "${m.prompt || m.name}"`;
            return text;
        }
        $('copy').addEventListener('click', () => { const b = $('copy'); copyText(missingText()).then(() => flash(b, '✓ COPIED!'), () => flash(b, '✗ COPY BLOCKED')); });

        /* cheaper colours: dry-run the forge with each swap to price the real saving */
        const mergedOpts = (patch) => {
            // The same merge reforge() does, without forging.
            const o = sf.state.opts || {};
            const colorsOpt = { ...(o.colors || {}), ...patch };
            for (const k of Object.keys(colorsOpt)) if (colorsOpt[k] == null) delete colorsOpt[k];
            return { ...o, colors: colorsOpt };
        };
        function findSwaps() {
            swapsOpen = true;
            const box = $('swaps'); box.innerHTML = '';
            const m = sf.model; if (!m || !est) return;
            const used = new Set(m.bricks.map((b) => b.color));
            // Group roles by the rare colour they share, so one APPLY swaps "gold" everywhere it appears.
            const groups = new Map();
            for (const [role, cid] of Object.entries(m.palette || {})) {
                if (typeof cid !== 'string' || !CHEAPER[cid] || !used.has(cid)) continue;
                if (/^TRANS_/.test(cid) && KEEP_TRANS_ROLES.has(role)) continue;
                if (!groups.has(cid)) groups.set(cid, []);
                groups.get(cid).push(role);
            }
            const found = [];
            for (const [from, roles] of groups) {
                const to = CHEAPER[from];
                const patch = {}; for (const r of roles) patch[r] = to;
                let dry;
                try { dry = sf.generator.generateFromPrompt(sf.state.prompt, sf.state.variant, mergedOpts(patch)); } catch (e) { continue; }
                const saving = est.total - estimate(dry, entries).total;
                if (saving > 0.005) found.push({ from, to, roles, saving, patch });
            }
            found.sort((a, b) => b.saving - a.saving);
            if (!found.length) { box.innerHTML = `<div class="${PRE}-empty">${groups.size ? 'The pricey colours here are baked into the design – a palette swap would not change them.' : 'No pricey colours in this build – it is already as cheap as it gets. 🎉'}</div>`; return; }
            for (const s of found) {
                const el = document.createElement('div'); el.className = `${PRE}-swap`;
                el.innerHTML = `<div class="${PRE}-swap-info"><div class="${PRE}-swap-roles">${esc(s.roles.join(' · '))}</div><div class="${PRE}-swap-colors"><span><i class="${PRE}-dot" style="background:${colorHex(s.from)}"></i>${esc(colorName(s.from))}</span><span>→</span><span><i class="${PRE}-dot" style="background:${colorHex(s.to)}"></i>${esc(colorName(s.to))}</span></div><div class="${PRE}-swap-save">SAVE ≈ ${money(s.saving)}</div></div><button class="action-btn primary" type="button">APPLY</button>`;
                el.querySelector('button').addEventListener('click', () => {
                    const prev = {}; const o = (sf.state.opts && sf.state.opts.colors) || {};
                    for (const r of s.roles) prev[r] = o[r] == null ? null : o[r];
                    lastSwap = { roles: prev };
                    $('undo').hidden = false;
                    sf.reforge({ colors: s.patch });
                    if (window.studForgeAudio && window.studForgeAudio.playRatchetClick) { try { window.studForgeAudio.playRatchetClick(); } catch (e) { /* silent */ } }
                });
                box.appendChild(el);
            }
        }
        $('find').addEventListener('click', findSwaps);
        $('undo').addEventListener('click', () => {
            if (!lastSwap) return;
            const colorsPatch = {}; for (const [r, v] of Object.entries(lastSwap.roles)) colorsPatch[r] = v;
            lastSwap = null; $('undo').hidden = true;
            sf.reforge({ colors: colorsPatch });
        });

        // A new idea: clear the undo stack (it belonged to the old idea) and recompute.
        let lastPrompt = null;
        sf.on('forging', ({ prompt }) => { if (prompt !== lastPrompt) { lastPrompt = prompt; lastSwap = null; $('undo').hidden = true; swapsOpen = false; $('swaps').innerHTML = ''; } });
        sf.on('model', renderEstimate);
        renderStatus();
        if (sf.model) renderEstimate();

        // Small API for other features and tests.
        window.studForgeBuy = { parseOwned, estimate: (m) => estimate(m || sf.model, entries), unitPrice, refresh: renderEstimate, get entries() { return entries; }, get estimate_() { return est; }, findSwaps };
    }

    if (window.studForge) init();
    else document.addEventListener('studforge:ready', init, { once: true });
})();
