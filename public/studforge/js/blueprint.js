// StudForge blueprints: a model DESIGNED by Claude (or by hand), assembled by the engine.
//
// A brief only picks an existing builder and some colours. A blueprint is the design itself: a short list of
// operations on the same primitives and modules the builders use, so Claude can lay out a fire truck or a dragon
// that no builder knows. The engine executes the ops on a fresh ForgeGrid, tiles the cells into bricks and plates,
// then anchors the result (generator.js `assemble`), so nothing floats even when the geometry is a little off; the
// anchor stats (`model.anchor.struts`) say how much the engine had to prop up.
//
// ── Blueprint format (JSON) ───────────────────────────────────────────────────────────────────────────────────
// {
//   name: string (≤ 60), description: string (≤ 220), tagline?: string (≤ 120), category?: string (≤ 32),
//   base: { w, d, color }          one base plate at plate 0 covering x 0..w-1, z 0..d-1 (w, d ≤ 48)
//   ops: [ ... ]                   10–40 ops is the sweet spot; 60 is the hard limit
// }
// Units are the engine's: x and z in studs (x runs left/right, z back(-)/front(+)), y in plates (3 per brick),
// every range inclusive. Colours are the colour ids of colors.js (RED, DARK_GREY, TRANS_BLUE, ...). Ops run in
// order; a later op overwrites the cells of an earlier one, and a module placed over painted cells replaces them
// (that is how windows and jaws are set into a wall or a head). Parts only ever connect to the parts directly
// above and below them (studs into tubes), so stack things: every block on a slab, a plate or a block below.
//
//   { op: 'box',  x0, x1, z0, z1, y0, y1, color, hollow?: true }   a solid block of cells, or just its walls (a shell)
//   { op: 'slab', x0, x1, z0, z1, y, color }                       two cross-bonded plate layers at y and y+1: the
//                                                                  floor every tiled block, cantilever or roof
//                                                                  should stand on (it never splits)
//   { op: 'roof', kind: 'gable'|'flat'|'curved', x0, x1, z0, z1, y, color, axis?: 'x'|'z' }
//                                                                  'gable': stepped 45° slopes, ridge along `axis`;
//                                                                  'flat': a plate with a tile rim and a rooftop
//                                                                  box; 'curved': curved slopes along both edges.
//                                                                  Lay a `slab` over hollow walls first.
//   { op: 'part', id, color, x, z, y, rotY?: 0|1|2|3, links?: [[x, y, z], ...] }
//                                                                  one catalog part (parts-catalog.js) at stud
//                                                                  corner (x, z), plate y; rotY in quarter turns;
//                                                                  `links` = cells of other parts it is pinned or
//                                                                  clipped to (needed for anything not on studs)
//   { op: 'module', id, x, z, y, params?: { ... } }                a module of forge-modules.js (chassis, axle,
//                                                                  hingeJaw, hingedWing, clipTail, turret, archDoor,
//                                                                  archWindow, realWindow, realDoor, propeller,
//                                                                  rotorMast, bracketMount, headlight, lamp2, fence,
//                                                                  flagPole, wedgeNose, curvedRoof, overhang, dish,
//                                                                  grilleBumper, roundCorners); `params` are that
//                                                                  module's named params (FORGE.modules[id].params)
//
// ── API ────────────────────────────────────────────────────────────────────────────────────────────────────────
//   FORGE.blueprint.validate(bp) → { ok, errors: [...], bp }   clamps numbers, drops unknown ops/ids/colours/params,
//                                                              rejects a missing base, > 60 ops or sizes out of range;
//                                                              `bp` is the cleaned copy to build from
//   FORGE.blueprint.build(bp, ctx) → { g, feats, warnings }    executes the (validated) ops on ctx.g (a fresh
//                                                              ForgeGrid when absent); ctx is a builder context
//                                                              ({ g, P, sc, rnd, pick, chance })
//   FORGE.blueprint.vocab() → { modules, colors, parts, limits }  the engine vocabulary the client sends the route
//   FORGE.blueprint.LIMITS                                      { base: 48, ops: 60, y: 60, xz: [-16, 63] }
// The generator uses it when a forge is given `opts.blueprint` (kind 'blueprint', `model.blueprint` = the design).
window.FORGE = window.FORGE || { builders: [], helpers: {} };

(() => {
    const LIMITS = { base: 48, ops: 60, y: 60, xz: [-16, 63], minOps: 1 };
    const OPS = ['box', 'slab', 'roof', 'part', 'module'];
    const ROOFS = ['gable', 'flat', 'curved'];
    const PI = Math.PI;

    /* ── validation ─────────────────────────────────────────── */
    const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
    const int = (v, lo, hi, dflt) => { if (!isNum(v)) return dflt; return Math.max(lo, Math.min(hi, Math.round(v))); };
    const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max) : '');
    const colorOk = (c) => typeof c === 'string' && !!(window.LEGO_COLORS && window.LEGO_COLORS[c]);
    const partOk = (id) => typeof id === 'string' && !!(window.LEGO_PARTS && window.LEGO_PARTS[id]);
    const moduleOk = (id) => typeof id === 'string' && !!(window.FORGE.modules && window.FORGE.modules[id]);
    /** An inclusive range a..b, clamped and ordered. */
    const range = (a, b, lo, hi) => { let x0 = int(a, lo, hi, null), x1 = int(b, lo, hi, null); if (x0 === null || x1 === null) return null; if (x1 < x0) [x0, x1] = [x1, x0]; return [x0, x1]; };
    const [XZ0, XZ1] = LIMITS.xz;

    /** Coerce one module param by its declared schema; undefined = drop it (the module default applies). */
    function param(spec, v) {
        switch (spec.type) {
            case 'int': return isNum(v) ? int(v, spec.id === 'y' ? 0 : XZ0, spec.id === 'y' ? LIMITS.y : 128, undefined) : undefined;
            case 'number': return isNum(v) ? Math.max(-10, Math.min(10, v)) : undefined;
            case 'bool': return typeof v === 'boolean' ? v : undefined;
            case 'color': return colorOk(v) ? v : undefined;
            case 'choice': return spec.choices.includes(v) ? v : (spec.choices.includes(Number(v)) ? Number(v) : undefined);
            case 'int[]': return Array.isArray(v) ? v.filter(isNum).map((n) => int(n, 0, 128, 0)).slice(0, 8) : undefined;
            default: return undefined;
        }
    }

    function validateOp(raw, i, errors) {
        if (!raw || typeof raw !== 'object' || !OPS.includes(raw.op)) { errors.push(`op ${i}: unknown op ${raw && raw.op}`); return null; }
        const bad = (m) => { errors.push(`op ${i} (${raw.op}): ${m}`); return null; };
        if (raw.op === 'box' || raw.op === 'slab' || raw.op === 'roof') {
            const xs = range(raw.x0, raw.x1, XZ0, XZ1), zs = range(raw.z0, raw.z1, XZ0, XZ1);
            if (!xs || !zs) return bad('x0/x1/z0/z1 must be numbers');
            if (!colorOk(raw.color)) return bad(`unknown colour ${raw.color}`);
            const op = { op: raw.op, x0: xs[0], x1: xs[1], z0: zs[0], z1: zs[1], color: raw.color };
            if (raw.op === 'box') {
                const ys = range(raw.y0, raw.y1, 0, LIMITS.y); if (!ys) return bad('y0/y1 must be numbers');
                op.y0 = ys[0]; op.y1 = ys[1]; if (raw.hollow === true) op.hollow = true;
            } else {
                const y = int(raw.y, 0, LIMITS.y, null); if (y === null) return bad('y must be a number');
                op.y = y;
                if (raw.op === 'roof') {
                    if (!ROOFS.includes(raw.kind)) return bad(`unknown roof kind ${raw.kind}`);
                    op.kind = raw.kind; op.axis = raw.axis === 'z' ? 'z' : 'x';
                }
            }
            return op;
        }
        if (raw.op === 'part') {
            if (!partOk(raw.id)) return bad(`unknown part ${raw.id}`);
            if (!colorOk(raw.color)) return bad(`unknown colour ${raw.color}`);
            const x = int(raw.x, XZ0, XZ1, null), z = int(raw.z, XZ0, XZ1, null), y = int(raw.y, 0, LIMITS.y, null);
            if (x === null || z === null || y === null) return bad('x/z/y must be numbers');
            const op = { op: 'part', id: raw.id, color: raw.color, x, z, y };
            const r = int(raw.rotY, 0, 3, 0); if (r) op.rotY = r;
            if (Array.isArray(raw.links)) {
                const links = raw.links.filter((l) => Array.isArray(l) && l.length === 3 && l.every(isNum)).map((l) => [Math.round(l[0]), Math.round(l[1]), Math.round(l[2])]).slice(0, 8);
                if (links.length) op.links = links;
            }
            return op;
        }
        // module
        if (!moduleOk(raw.id)) return bad(`unknown module ${raw.id}`);
        // x/z/y may come at the top level (the format) or inside params (an already-cleaned blueprint).
        const m = window.FORGE.modules[raw.id], src = Object.assign({}, raw.params && typeof raw.params === 'object' ? raw.params : {});
        for (const k of ['x', 'z', 'y']) if (raw[k] !== undefined) src[k] = raw[k];
        const params = {};
        for (const spec of m.params) {
            const v = param(spec, src[spec.id]);
            if (v !== undefined) params[spec.id] = v;
            else if (spec.default === undefined && (spec.id === 'x' || spec.id === 'z' || spec.id === 'y' || /^[xz][01]$/.test(spec.id))) return bad(`${spec.id} is required`);
        }
        // Sizes a module reads straight from its params: keep them to what a model can hold.
        for (const k of ['width', 'length', 'span', 'height', 'segments']) if (isNum(params[k])) params[k] = Math.max(1, Math.min(k === 'segments' ? 6 : k === 'height' ? 20 : 48, params[k]));
        return { op: 'module', id: raw.id, params };
    }

    function validate(raw) {
        const errors = [];
        if (!raw || typeof raw !== 'object') return { ok: false, errors: ['blueprint must be an object'], bp: null };
        const base = raw.base && typeof raw.base === 'object' ? raw.base : null;
        if (!base) errors.push('base is required');
        const w = base ? int(base.w, 1, LIMITS.base, null) : null, d = base ? int(base.d, 1, LIMITS.base, null) : null;
        if (base && (w === null || d === null)) errors.push('base.w and base.d must be numbers (1..48)');
        if (base && !colorOk(base.color)) errors.push(`base.color: unknown colour ${base.color}`);
        const rawOps = Array.isArray(raw.ops) ? raw.ops : null;
        if (!rawOps) errors.push('ops must be an array');
        else if (rawOps.length > LIMITS.ops) errors.push(`too many ops (${rawOps.length} > ${LIMITS.ops})`);
        else if (rawOps.length < LIMITS.minOps) errors.push('ops is empty');
        if (errors.length) return { ok: false, errors, bp: null };
        const ops = [];
        rawOps.forEach((o, i) => { const v = validateOp(o, i, errors); if (v) ops.push(v); });
        if (errors.length) return { ok: false, errors, bp: null };
        const bp = { name: str(raw.name, 60) || 'Custom Creation', description: str(raw.description, 220), base: { w, d, color: base.color }, ops };
        const tagline = str(raw.tagline, 120); if (tagline) bp.tagline = tagline;
        const category = str(raw.category, 32); if (category) bp.category = category;
        return { ok: true, errors, bp };
    }

    /* ── building ───────────────────────────────────────────── */
    function roof(ctx, op) {
        const H = window.FORGE.helpers, { g } = ctx;
        if (op.kind === 'gable') return H.gableRoof(ctx, op.x0, op.x1, op.z0, op.z1, op.y, op.color, op.axis);
        if (op.kind === 'flat') return H.flatRoof(ctx, op.x0, op.x1, op.z0, op.z1, op.y, op.color);
        // Curved: a row of curved slopes along each long edge, sloping outward, plates between them.
        const alongX = op.axis === 'x', W = op.x1 - op.x0 + 1, D = op.z1 - op.z0 + 1;
        const span = alongX ? W : D, depth = alongX ? D : W;
        if (alongX) { H.curvedRoof(ctx, op.x0, op.z1 - 1, op.y, { width: span, color: op.color, face: 'front' }); if (depth >= 4) H.curvedRoof(ctx, op.x1, op.z0 + 1, op.y, { width: span, color: op.color, face: 'back' }); }
        else { H.curvedRoof(ctx, op.x1 - 1, op.z1, op.y, { width: span, color: op.color, face: 'right' }); if (depth >= 4) H.curvedRoof(ctx, op.x0 + 1, op.z0, op.y, { width: span, color: op.color, face: 'left' }); }
        if (depth > 4) { if (alongX) g.box(op.x0, op.x1, op.z0 + 2, op.z1 - 2, op.y, op.y + 1, op.color, { noBrick: true }); else g.box(op.x0 + 2, op.x1 - 2, op.z0, op.z1, op.y, op.y + 1, op.color, { noBrick: true }); }
        return { feats: ['curved slopes'] };
    }

    /**
     * Execute a validated blueprint. `ctx` is a builder context; `ctx.g` is used when given (so a feature can
     * build into its own grid), otherwise a fresh grid. Every op is run on its own, so one bad op (a module that
     * throws on its params) costs that op, not the model; `warnings` lists them.
     */
    function build(bp, ctx) {
        const H = window.FORGE.helpers, M = window.FORGE.modules;
        ctx = ctx || {};
        const g = ctx.g || new window.ForgeGrid();
        const c = Object.assign({ P: {}, rnd: () => 0.5, pick: (a) => a[0], chance: () => false, S: 1, sc: (n) => Math.max(1, Math.round(n)) }, ctx, { g });
        const feats = [], warnings = [];
        g.box(0, bp.base.w - 1, 0, bp.base.d - 1, 0, 0, bp.base.color);
        bp.ops.forEach((op, i) => {
            try {
                let r = null;
                if (op.op === 'box') { if (op.hollow) g.shell(op.x0, op.x1, op.z0, op.z1, op.y0, op.y1, op.color); else g.box(op.x0, op.x1, op.z0, op.z1, op.y0, op.y1, op.color); }
                else if (op.op === 'slab') H.slab(c, op.x0, op.x1, op.z0, op.z1, op.y, op.color);
                else if (op.op === 'roof') { r = roof(c, op); if (op.kind !== 'curved') feats.push(op.kind === 'gable' ? 'a gabled slope roof' : 'a flat tiled roof'); }
                else if (op.op === 'part') g.part(op.id, op.color, op.x, op.z, op.y, { rotY: (op.rotY || 0) * PI / 2, links: op.links });
                else if (op.op === 'module') r = M[op.id].build(c, Object.assign({}, op.params));
                if (r && Array.isArray(r.feats)) for (const f of r.feats) if (!feats.includes(f)) feats.push(f);
            } catch (e) { warnings.push(`op ${i} (${op.op}${op.id ? ' ' + op.id : ''}): ${e && e.message}`); }
        });
        return { g, feats, warnings };
    }

    /* ── the vocabulary the route teaches Claude ────────────── */
    function vocab() {
        const M = window.FORGE.modules || {}, parts = window.LEGO_PARTS || {};
        return {
            modules: Object.values(M).map((m) => ({ id: m.id, title: m.title, describe: m.describe, params: m.params.map((p) => ({ id: p.id, type: p.type, choices: p.choices, default: p.default, note: p.note })) })),
            colors: Object.keys(window.LEGO_COLORS || {}),
            parts: Object.values(parts).map((p) => ({ id: p.id, name: p.name, w: p.width, l: p.length, hp: Math.max(1, Math.round(p.height / 0.4)), ghost: p.ghost || undefined })),
            limits: { base: LIMITS.base, ops: LIMITS.ops, y: LIMITS.y },
        };
    }

    window.FORGE.blueprint = { LIMITS, OPS, ROOFS, validate, build, vocab };
})();
