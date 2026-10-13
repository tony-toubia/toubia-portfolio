// StudForge buying help: what the build would cost in real bricks, cheaper
// colour swaps, and "I own these bricks" so the parts list and the price only
// count what you still need. Everything is client-side; prices are rough
// marketplace ballparks kept in this file. It sits at the top of the Parts tab, above
// the core parts list, and puts the estimate in the header summary.
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
    // `area` (studs) sizes a part the catalog does not know, e.g. a real set's LDraw part (its grid footprint).
    const unitPrice = (partId, colorId, area) => {
        let base = PART_PRICE[partId];
        if (base == null) {
            const p = parts()[partId] || {};
            const [b, per] = CATEGORY_PRICE[p.category] || CATEGORY_PRICE.Misc;
            base = b + per * (parts()[partId] || !area ? (p.width || 1) * (p.length || 1) : area);
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
            if (b.segment) continue;   // a real set's hose segments: the hose is one piece, counted elsewhere
            const k = `${b.partId}_${b.color}`;
            if (!map.has(k)) {
                // A real set's bricks are LDraw parts: price them by their catalog twin, else by footprint.
                const p = (b.geometryId && window.BrickBuilder.partInfo(b.geometryId)) || parts()[b.partId] || (window.BrickBuilder && window.BrickBuilder.partInfo(b.partId)) || { name: b.partName || `Element ${b.partId}`, category: 'Misc' };
                const c = colors()[b.color] || { name: b.color, hex: '#ccc' };
                map.set(k, { key: k, partId: String(b.partId), priceId: b.catalogId ? String(b.catalogId) : String(b.partId), area: b.fp && b.fp.w ? b.fp.w * b.fp.l : null, partName: p.name, colorKey: b.color, colorName: c.name, colorHex: c.hex, quantity: 0 });
            }
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
        let total = 0, full = 0, ownedPieces = 0, ownedValue = 0, pieces = 0;
        for (const r of rows) {
            pieces += r.quantity;
            r.unit = unitPrice(r.priceId || r.partId, r.colorKey, r.area);
            r.owned = owned.get(r.key) || 0;
            r.need = r.quantity - r.owned;
            r.line = r.need * r.unit;
            full += r.quantity * r.unit; total += r.line; ownedPieces += r.owned; ownedValue += r.owned * r.unit;
        }
        rows.sort((a, b) => b.line - a.line || b.quantity - a.quantity);
        return { rows, total, full, pieces, ownedPieces, ownedValue, low: total * RANGE[0], high: total * RANGE[1] };
    }

    /* ── UI ─────────────────────────────────────────────────────────── */
    const css = `
.${PRE}-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.${PRE}-k { font-family: var(--font-heading); font-size: 9px; letter-spacing: 1.2px; color: var(--text-muted); font-weight: 700; margin-bottom: 5px; }
.${PRE}-total { font-family: var(--font-heading); font-size: 26px; font-weight: 900; color: var(--lego-yellow); line-height: 1; letter-spacing: 0.5px; white-space: nowrap; }
.${PRE}-pcs { text-align: right; flex: none; }
.${PRE}-pcs b { display: block; font-family: var(--font-mono); font-size: 17px; font-weight: 700; color: #fff; line-height: 1.1; }
.${PRE}-pcs span { font-family: var(--font-heading); font-size: 8px; letter-spacing: 1px; color: var(--text-muted); font-weight: 700; }
.${PRE}-range { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); margin-top: 7px; line-height: 1.5; }
.${PRE}-ownnote { font-family: var(--font-mono); font-size: 10px; color: #7ee787; margin-top: 3px; }
.${PRE}-note { font-size: 12px; color: var(--text-muted); margin: 6px 0 0; line-height: 1.4; }
.${PRE}-note code { font-family: var(--font-mono); font-size: 10px; color: var(--text-secondary); background: rgba(255,255,255,0.06); padding: 0 4px; border-radius: 3px; }
.${PRE}-block { margin-top: 12px; }
.${PRE}-toggle { width: 100%; display: flex; align-items: center; gap: 8px; padding: 0 10px; min-height: 34px; border-radius: 7px; border: 1px solid var(--border-main); background: rgba(255,255,255,0.03); color: var(--text-primary); font-family: var(--font-body); font-size: 14px; font-weight: 700; cursor: pointer; text-align: left; }
.${PRE}-toggle:hover, .${PRE}-toggle[aria-expanded="true"] { border-color: rgba(242,205,55,0.45); }
.${PRE}-toggle .t-main { flex: 1; min-width: 0; }
.${PRE}-toggle .t-badge { font-family: var(--font-mono); font-size: 10px; color: #7ee787; white-space: nowrap; }
.${PRE}-toggle .t-car { font-size: 9px; color: var(--text-muted); transition: transform 0.15s ease; }
.${PRE}-toggle[aria-expanded="true"] .t-car { transform: rotate(180deg); }
.${PRE}-own { padding: 2px 0 0; }
.${PRE}-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.${PRE}-row .action-btn { width: auto; flex: 1 1 auto; padding: 0 10px; min-height: 32px; font-size: 10px; }
.${PRE}-status { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); margin-top: 6px; line-height: 1.5; }
.${PRE}-status:empty { display: none; }
.${PRE}-status .bad { color: #f87171; }
.${PRE}-ta { width: 100%; min-height: 84px; resize: vertical; box-sizing: border-box; background: rgba(9, 12, 19, 0.6); color: var(--text-primary); border: 1px solid var(--border-main); border-radius: 7px; padding: 8px; font-family: var(--font-mono); font-size: 12px; line-height: 1.5; margin-top: 8px; }
.${PRE}-ta:focus { outline: none; border-color: var(--lego-yellow); }
.${PRE}-tip { display: flex; flex-direction: column; gap: 6px; }
.${PRE}-tip-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.${PRE}-tip-h .${PRE}-k { margin: 0; }
.${PRE}-undo { background: none; border: 1px solid var(--border-main); color: var(--text-secondary); border-radius: 6px; min-height: 26px; padding: 0 9px; font-family: var(--font-heading); font-size: 9px; font-weight: 700; letter-spacing: 0.8px; cursor: pointer; }
.${PRE}-undo:hover { color: #fff; border-color: var(--lego-yellow); }
.${PRE}-dot { width: 9px; height: 9px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); display: inline-block; flex-shrink: 0; }
.${PRE}-swap { display: flex; align-items: center; gap: 8px; padding: 7px 8px 7px 10px; border: 1px solid rgba(126,231,135,0.22); border-radius: 7px; background: rgba(126,231,135,0.05); }
.${PRE}-swap-info { flex: 1; min-width: 0; }
.${PRE}-swap-colors { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; font-size: 13px; font-weight: 600; color: #e2e8f0; }
.${PRE}-swap-colors span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.${PRE}-swap-meta { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.${PRE}-swap-meta b { color: #7ee787; font-weight: 700; }
.${PRE}-swap .action-btn { width: auto; padding: 0 12px; min-height: 30px; font-size: 10px; flex-shrink: 0; }
.${PRE}-empty { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
.${PRE}-bd { margin-top: 12px; border-top: 1px solid var(--border-main); }
.${PRE}-bd > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; min-height: 34px; padding-top: 8px; }
.${PRE}-bd > summary::-webkit-details-marker { display: none; }
.${PRE}-bd > summary .${PRE}-k { margin: 0; flex: 1; }
.${PRE}-bd > summary small { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); }
.${PRE}-bd > summary i { font-style: normal; font-size: 9px; color: var(--text-muted); transition: transform 0.15s ease; }
.${PRE}-bd[open] > summary i { transform: rotate(180deg); }
.${PRE}-bd > summary:hover .${PRE}-k { color: #fff; }
.${PRE}-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 2px; table-layout: fixed; }
.${PRE}-table th { text-align: left; font-family: var(--font-heading); font-size: 8px; letter-spacing: 0.5px; color: var(--text-muted); padding: 4px 4px; border-bottom: 1px solid var(--border-main); }
.${PRE}-table th:first-child { width: auto; } .${PRE}-table th.num { width: 52px; } .${PRE}-table th.q { width: 40px; }
.${PRE}-table td { padding: 5px 4px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); vertical-align: top; }
.${PRE}-table .num { text-align: right; font-family: var(--font-mono); white-space: nowrap; }
.${PRE}-table .line { color: #fff; font-weight: 700; }
.${PRE}-table tr.owned td { opacity: 0.4; }
.${PRE}-pn { color: #e2e8f0; font-weight: 600; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${PRE}-pc { font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; overflow: hidden; white-space: nowrap; }
.${PRE}-pc i { width: 8px; height: 8px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.25); display: inline-block; flex: none; }
.${PRE}-src { font-size: 11px; color: var(--text-muted); margin-top: 8px; line-height: 1.4; }
/* the header summary's price */
.${PRE}-price { color: var(--lego-yellow); cursor: pointer; border-radius: 4px; }
.${PRE}-price:hover { text-decoration: underline; text-underline-offset: 3px; }
.${PRE}-price:focus-visible { outline: 2px solid var(--lego-yellow); outline-offset: 2px; }
/* the parts table: owned rows fade, partial rows say what is still needed */
#bom-table-body tr.${PRE}-owned td { opacity: 0.45; }
#bom-table-body tr.${PRE}-owned .part-name { text-decoration: line-through; }
.${PRE}-tag { display: block; font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.3px; margin-top: 3px; color: #7ee787; white-space: nowrap; }
.${PRE}-tag.partial { color: var(--lego-yellow); }
#panel-buy { background: linear-gradient(180deg, rgba(242,205,55,0.035), transparent 70%); }
`;

    function init() {
        const sf = window.studForge;
        if (!sf || !sf.registerPanel || sf.buy) return;
        const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

        let ownedText = '';
        try { ownedText = localStorage.getItem(STORE_KEY) || ''; } catch (e) { /* private mode: fine, just not remembered */ }
        let entries = parseOwned(ownedText);
        let est = null;
        let lastSwap = null;          // { roles: { role: previousValueOrNull } } for UNDO
        let swapsFor = null;          // the model the tip was worked out for
        let breakdownTouched = false; // once someone opens or closes the breakdown, it stays how they left it

        /* the section: top of the Parts tab, above the core parts list (order 50) */
        const panel = sf.registerPanel({ id: 'buy', title: null, group: 'parts', order: 20 });
        const body = panel.body;
        body.innerHTML = `
<div class="${PRE}-head">
  <div><div class="${PRE}-k">ESTIMATED PRICE</div><div class="${PRE}-total" id="${PRE}-total">≈ $0.00</div></div>
  <div class="${PRE}-pcs"><b id="${PRE}-pieces">0</b><span id="${PRE}-pieces-l">PIECES</span></div>
</div>
<div class="${PRE}-range" id="${PRE}-range"></div>
<div class="${PRE}-ownnote" id="${PRE}-ownnote" hidden></div>
<div class="${PRE}-block">
  <button class="${PRE}-toggle" id="${PRE}-own-toggle" type="button" aria-expanded="false" aria-controls="${PRE}-own"><span>🧱</span><span class="t-main">I own some of these bricks</span><span class="t-badge" id="${PRE}-own-badge"></span><span class="t-car">▾</span></button>
  <div class="${PRE}-own" id="${PRE}-own" hidden>
    <p class="${PRE}-note">One per line, like <code>10 x 3001 red</code> or <code>2x4 brick red 10</code>, or paste a copied parts list. No colour means any colour.</p>
    <textarea class="${PRE}-ta" id="${PRE}-ta" placeholder="10 x 3001 red&#10;2x4 plate 6&#10;3024 white 20" spellcheck="false" aria-label="Bricks you own"></textarea>
    <div class="${PRE}-row"><button class="action-btn primary" id="${PRE}-save" type="button">✓ Count what I own</button><button class="action-btn tertiary" id="${PRE}-clear" type="button">Clear</button></div>
    <div class="${PRE}-status" id="${PRE}-status"></div>
    <div class="${PRE}-row"><button class="action-btn secondary" id="${PRE}-copy" type="button">📋 Copy what I still need</button></div>
  </div>
</div>
<div class="${PRE}-block ${PRE}-tip" id="${PRE}-tip">
  <div class="${PRE}-tip-h"><div class="${PRE}-k">💸 CHEAPER COLOURS</div><button class="${PRE}-undo" id="${PRE}-undo" type="button" hidden>↩ UNDO SWAP</button></div>
  <div id="${PRE}-swaps"><div class="${PRE}-empty">Checking for pricey colours…</div></div>
</div>
<details class="${PRE}-bd" id="${PRE}-bd">
  <summary><span class="${PRE}-k">PRICE BREAKDOWN</span><small id="${PRE}-bd-n"></small><i>▾</i></summary>
  <table class="${PRE}-table"><thead><tr><th>PART</th><th class="num q">QTY</th><th class="num">EACH</th><th class="num">TOTAL</th></tr></thead><tbody id="${PRE}-rows"></tbody></table>
  <p class="${PRE}-src">Rough new-part prices (USD, recent marketplace averages); real prices vary by seller and colour. Buy the list on BrickLink or LEGO Pick a Brick.</p>
</details>`;
        const $ = (id) => body.querySelector(`#${PRE}-${id}`);
        const ta = $('ta'); ta.value = ownedText;

        /* the price in the header summary: "≈ $6.68", opens this section */
        // The summary is itself a button (it opens the Build tab), so this is a span with button behaviour.
        const price = document.createElement('span');
        price.className = `${PRE}-price`; price.setAttribute('role', 'button'); price.tabIndex = 0;
        price.title = 'What these bricks would cost'; price.textContent = '≈ $0.00';
        const openBuy = (e) => { e.stopPropagation(); e.preventDefault(); sf.showPanel('buy'); };
        price.addEventListener('click', openBuy);
        price.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openBuy(e); });
        if (sf.summarySlot) sf.summarySlot(price);

        const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const colorName = (id) => (colors()[id] || { name: id }).name;
        const colorHex = (id) => (colors()[id] || { hex: '#ccc' }).hex;

        function renderEstimate() {
            if (!sf.model) return;
            est = estimate(sf.model, entries);
            const toBuy = est.pieces - est.ownedPieces;
            $('total').textContent = `≈ ${money(est.total)}`;
            $('pieces').textContent = String(toBuy);
            $('pieces-l').textContent = est.ownedPieces ? 'PIECES TO BUY' : 'PIECES';
            $('range').textContent = `Likely ${money(est.low)} to ${money(est.high)} · ${est.rows.length} kinds of part`;
            const note = $('ownnote');
            note.hidden = !est.ownedPieces;
            if (est.ownedPieces) note.textContent = `You own ${est.ownedPieces} of ${est.pieces} pieces (−${money(est.ownedValue)})`;
            price.textContent = `≈ ${money(est.total)}`;
            $('rows').innerHTML = est.rows.map((r) => `<tr class="${r.need === 0 ? 'owned' : ''}"><td><div class="${PRE}-pn" title="${esc(r.partName)}">${esc(r.partName)}</div><div class="${PRE}-pc"><i style="background:${r.colorHex}"></i>${esc(r.colorName)} · #${esc(r.partId)}</div></td><td class="num">${r.need < r.quantity ? `${r.need}<span style="color:var(--text-muted)">/${r.quantity}</span>` : r.quantity}</td><td class="num">${money(r.unit)}</td><td class="num line">${money(r.line)}</td></tr>`).join('');
            $('bd-n').textContent = `${est.rows.length} line${est.rows.length === 1 ? '' : 's'}`;
            // Short breakdowns show open; long ones fold away until asked for.
            if (!breakdownTouched) $('bd').open = est.rows.length <= 6;
            decorateParts();
            scheduleSwaps();
        }
        $('bd').querySelector('summary').addEventListener('click', () => { breakdownTouched = true; });

        // Grey out owned rows in the core parts table; main.js re-renders it on every model, so this runs after.
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
        const ownToggle = $('own-toggle'), ownBox = $('own');
        const setOwnOpen = (open) => { ownBox.hidden = !open; ownToggle.setAttribute('aria-expanded', String(open)); if (open && !(sf.isPhone && sf.isPhone())) ta.focus({ preventScroll: true }); };   // no surprise keyboard on phones
        ownToggle.addEventListener('click', () => setOwnOpen(ownBox.hidden));
        function applyOwned() {
            ownedText = ta.value;
            entries = parseOwned(ownedText);
            try { if (ownedText.trim()) localStorage.setItem(STORE_KEY, ownedText); else localStorage.removeItem(STORE_KEY); } catch (e) { /* not persisted */ }
            renderStatus();
            swapsFor = null;     // savings depend on what is owned
            renderEstimate();
        }
        function renderStatus() {
            const good = entries.filter((e) => e.ok), bad = entries.filter((e) => !e.ok);
            const pieces = good.reduce((n, e) => n + e.qty, 0);
            $('own-badge').textContent = pieces ? `${pieces} owned` : '';
            $('status').innerHTML = !entries.length ? '' : `Read ${good.length} line${good.length === 1 ? '' : 's'}: ${pieces} piece${pieces === 1 ? '' : 's'} owned` + (bad.length ? `<br><span class="bad">Couldn't read: ${bad.slice(0, 3).map((e) => esc(e.raw.trim())).join(' · ')}${bad.length > 3 ? ` (+${bad.length - 3})` : ''}</span>` : '');
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
            text += `Still Needed: ${need} of ${est.pieces} pieces | Unique Elements: ${rows.length} | Est. ≈ ${money(est.total)}\n\n[ ] QTY | ELEMENT | DESIGN ID | COLOR\n----------------------------------------------------\n`;
            for (const r of rows) text += `[ ] ${String(r.need).padEnd(4)} | ${r.partName.padEnd(34)} | #${r.partId.padEnd(6)} | ${r.colorName}\n`;
            text += `\nGenerated with StudForge 3D LEGO Idea Maker (https://tonytoubia.com/studforge) from the idea "${m.prompt || m.name}"`;
            return text;
        }
        $('copy').addEventListener('click', () => { const b = $('copy'); copyText(missingText()).then(() => { flash(b, '✓ Copied'); if (sf.toast) sf.toast('Missing parts copied'); }, () => flash(b, '✗ Copy blocked')); });

        /* cheaper colours: dry-run the forge with each swap to price the real saving */
        const mergedOpts = (patch) => {
            // The same merge reforge() does, without forging.
            const o = sf.state.opts || {};
            const colorsOpt = { ...(o.colors || {}), ...patch };
            for (const k of Object.keys(colorsOpt)) if (colorsOpt[k] == null) delete colorsOpt[k];
            return { ...o, colors: colorsOpt };
        };
        // Only a model the generator made from the current idea can be re-forged with other colours
        // (a real set, a mosaic or a Claude design is not the prompt in the bar).
        const swappable = (m) => m && m.palette && m.kind !== 'reference' && m.kind !== 'mosaic' && (m.prompt || '') === (sf.state.prompt || '') && (m.variant | 0) === (sf.state.variant | 0);
        function findSwaps() {
            const box = $('swaps'); box.innerHTML = '';
            const m = sf.model; if (!m || !est) return [];
            swapsFor = m;
            if (!swappable(m)) { box.innerHTML = `<div class="${PRE}-empty">The colours of this model are fixed, so there is no swap to suggest.</div>`; return []; }
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
            if (!found.length) { box.innerHTML = `<div class="${PRE}-empty">${groups.size ? 'The pricey colours here are part of the design; a swap would not change them.' : 'No pricey colours in this build. It is already as cheap as it gets.'}</div>`; return found; }
            for (const s of found) {
                const el = document.createElement('div'); el.className = `${PRE}-swap`;
                el.innerHTML = `<div class="${PRE}-swap-info"><div class="${PRE}-swap-colors"><span><i class="${PRE}-dot" style="background:${colorHex(s.from)}"></i>${esc(colorName(s.from))}</span><span>→</span><span><i class="${PRE}-dot" style="background:${colorHex(s.to)}"></i>${esc(colorName(s.to))}</span></div><div class="${PRE}-swap-meta"><b>Save ≈ ${money(s.saving)}</b> · ${esc(s.roles.join(', '))}</div></div><button class="action-btn primary" type="button">Swap</button>`;
                el.querySelector('button').addEventListener('click', () => {
                    const prev = {}; const o = (sf.state.opts && sf.state.opts.colors) || {};
                    for (const r of s.roles) prev[r] = o[r] == null ? null : o[r];
                    lastSwap = { roles: prev };
                    $('undo').hidden = false;
                    sf.reforge({ colors: s.patch });
                    if (window.studForgeAudio && window.studForgeAudio.playRatchetClick) { try { window.studForgeAudio.playRatchetClick(); } catch (e) { /* silent */ } }
                    if (sf.toast) sf.toast(`Swapped ${colorName(s.from)} for ${colorName(s.to)}`);
                });
                box.appendChild(el);
            }
            return found;
        }
        // The tip is worked out lazily (it dry-runs a forge per pricey colour): only while the Parts tab is showing.
        let swapTimer = 0;
        const partsShowing = () => { const t = document.getElementById('tab-parts'); return !!(t && t.classList.contains('on')); };
        function scheduleSwaps() {
            clearTimeout(swapTimer);
            if (swapsFor === sf.model) return;
            $('swaps').innerHTML = `<div class="${PRE}-empty">Checking for pricey colours…</div>`;
            if (partsShowing()) swapTimer = setTimeout(() => { if (swapsFor !== sf.model) findSwaps(); }, 60);
        }
        sf.on('panel', (tab) => { if (tab === 'parts' && swapsFor !== sf.model) { clearTimeout(swapTimer); swapTimer = setTimeout(findSwaps, 30); } });
        $('undo').addEventListener('click', () => {
            if (!lastSwap) return;
            const colorsPatch = {}; for (const [r, v] of Object.entries(lastSwap.roles)) colorsPatch[r] = v;
            lastSwap = null; $('undo').hidden = true;
            sf.reforge({ colors: colorsPatch });
        });

        // A new idea: clear the undo (it belonged to the old idea) and recompute.
        let lastPrompt = null;
        sf.on('forging', ({ prompt }) => { if (prompt !== lastPrompt) { lastPrompt = prompt; lastSwap = null; $('undo').hidden = true; } });
        sf.on('model', renderEstimate);
        renderStatus();
        if (sf.model) renderEstimate();

        // Small API for other features and tests.
        const api = { parseOwned, estimate: (m) => estimate(m || sf.model, entries), unitPrice, refresh: renderEstimate, get entries() { return entries; }, get estimate_() { return est; }, findSwaps, show: () => sf.showPanel('buy') };
        sf.buy = api;
        window.studForgeBuy = api;
    }

    if (window.studForge) init();
    else document.addEventListener('studforge:ready', init, { once: true });
})();
