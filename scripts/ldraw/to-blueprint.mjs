// Compress a brick model (a real set converted from the LDraw OMR, or a generated model) into a compact StudForge
// BLUEPRINT (public/studforge/js/blueprint.js) that keeps how it is constructed, so Claude can be shown "this is how
// a real fire truck is built" as a few-shot example in DESIGN mode (src/app/api/studforge/idea/route.ts).
//
// The source is a list of bricks with grid footprints (`fp: { x0, z0, y0, w, l, hp }`, studs/plates), a part id, a
// catalog id and a colour: the generator's `model.bricks` and the converted OMR models (public/studforge/data/omr/,
// format `studforge-omr-1`) both have that shape. Minifigures and hose segments are skipped, a flagged baseplate
// becomes the blueprint base, and the third of a real set's pieces that sit off the grid get an approximate
// footprint from their baked bounding box (data/ldraw/parts) so wheels and bodies stay whole. Vehicles are turned to
// drive toward +Z (windscreen at the front) like the engine's own. The encoder works on the occupied cells and parts:
//   1. modules first, where a part group matches one: wheels + axle plates -> `chassis`, window frame + glass ->
//      `realWindow`, door frame + door -> `realDoor`, headlight brick + lens -> `headlight`;
//   2. a gable `roof` where the slopes form one (tried along both axes, kept when it explains the cells);
//   3. boxes, greedily: each step adds the box (solid, or `hollow: true` where a layer ring is a 1-stud wall) that
//      explains the most cells that are still missing or the wrong colour, minus the empty cells it would fill.
//      A later box paints over an earlier one, so a big body in the main colour comes first and stripes, windows
//      and trim follow. Two-plate boxes become `slab`s (cross-bonded floors) when that changes nothing;
//   4. `part` ops for distinctive details (trans lights, grilles, round bricks, slopes) up to the op budget, each
//      only where it stands on something and touches no other part.
// Ops are then ordered bottom-up the way a builder works (chassis and floors, interior details, walls, windows,
// roof last), keeping the order of any two boxes that paint the same cells. The result is validated with
// FORGE.blueprint.validate and rebuilt through the engine for the fidelity report:
//   iou       occupied cells of the rebuild vs the source (|A∩B| / |A∪B|)
//   color     share of the shared cells with the same colour
//   pieces    rebuilt piece count / source piece count
//   hollow    share of empty cells under the top of each column (source vs rebuild: is the body hollow?)
//   struts    the engine's anchor struts (a design that needs more than 2 is not shipped)
//
// Usage:
//   node scripts/ldraw/to-blueprint.mjs --generated ["prompt" ...]         encode generated models, print fidelity
//   node scripts/ldraw/to-blueprint.mjs --omr <dir|file.json> ... [--out public/studforge/data/omr-blueprints]
//        [--per 2] [--per-minor 1] [--min-iou 0.6] [--max-ops 60] [--max-bytes 6200] [--cache <dir>] [--lib <ldraw>]
//        encode converted real models; with --out, write the best two per subject with 4+ real sets and the best
//        one for the rest (highest fidelity, no more than 2 struts, footprint within the 48-stud base) plus
//        index.json. --cache keeps each model's encoding, so shards can run in parallel and a re-run only selects.
// Shipped examples are checked by scripts/studforge-blueprint-test.mjs (validate, build, 0 overlaps/loose, <= 2 struts).
// Results (2026-10): 10 generated models mean IoU 0.88; 90 real OMR models that fit mean IoU 0.75, colour 0.88.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PI = Math.PI;

/* ══ the engine, headless ═════════════════════════════════════════════════════════════════════════════════════ */

/** Load the StudForge engine in a vm (like scripts/studforge-test.mjs). `quiet` drops the engine's console.warn. */
export function loadEngine(root = ROOT, { knowledge = true, quiet = true } = {}) {
    const dir = path.join(root, 'public/studforge/js') + '/';
    const con = quiet ? { ...console, warn: () => {}, info: () => {} } : console;
    const ctx = { console: con, Math, Object, Array, Set, Map, Number, JSON, String, Error };
    ctx.window = ctx;
    vm.createContext(ctx);
    const extra = fs.readdirSync(dir).filter((f) => /^forge-builders-\d+\.js$/.test(f) && f !== 'forge-builders-2.js').sort();
    for (const f of ['colors.js', 'parts-catalog.js', 'forge-grid.js', 'forge-modules.js', 'blueprint.js', 'forge-builders.js', 'forge-builders-2.js', ...extra, 'knowledge.js', 'generator.js']) vm.runInContext(fs.readFileSync(dir + f, 'utf8'), ctx, { filename: f });
    const kf = path.join(root, 'public/studforge/data/knowledge.json');
    if (knowledge && fs.existsSync(kf)) ctx.STUDFORGE_KNOWLEDGE = JSON.parse(fs.readFileSync(kf, 'utf8'));
    return { ctx, gen: new ctx.BrickGenerator(), B: ctx.FORGE.blueprint, M: ctx.FORGE.modules, H: ctx.FORGE.helpers, PARTS: ctx.LEGO_PARTS, COLORS: ctx.LEGO_COLORS, Grid: ctx.ForgeGrid };
}

/* ══ source models ════════════════════════════════════════════════════════════════════════════════════════════ */

/** A baked part's local bounding box (public/studforge/data/ldraw/parts/<id>.json, StudForge units and axes), or null. */
const bboxCache = new Map();
function bakedBox(id, root = ROOT) {
    if (bboxCache.has(id)) return bboxCache.get(id);
    let box = null;
    try { box = JSON.parse(fs.readFileSync(path.join(root, 'public/studforge/data/ldraw/parts', id + '.json'), 'utf8')).bbox || null; } catch { /* not baked */ }
    bboxCache.set(id, box);
    return box;
}

/** World axis-aligned box of a part: its baked local box through its 3x3 matrix, at its position. */
function worldBox(box, m, p) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const x of [box[0], box[3]]) for (const y of [box[1], box[4]]) for (const z of [box[2], box[5]]) {
        const w = [m[0] * x + m[1] * y + m[2] * z + p[0], m[3] * x + m[4] * y + m[5] * z + p[1], m[6] * x + m[7] * y + m[8] * z + p[2]];
        for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], w[i]); hi[i] = Math.max(hi[i], w[i]); }
    }
    return { lo, hi };
}

const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/**
 * Expand a converted OMR model (format studforge-omr-1) into generator-shaped bricks. Minifigure parts and hose
 * segments are left out. About a third of a real set's pieces sit off the grid (wheels on half-stud pins, jumpers,
 * SNOT, tilted parts): those get an APPROXIMATE footprint from their baked bounding box, snapped with the same offset
 * the converter used for the grid-aligned ones, so wheels and bodies stay whole; they never become `part` ops.
 */
export function expandOmr(j, root = ROOT) {
    const bricks = [];
    for (const r of j.bricks) {
        const [pi, ci, x, y, z, ...rest] = r;
        const matrix = rest.slice(0, 9), [step, sub, x0, z0, y0, w, l, hp] = rest.slice(9);
        const [ldrawId, catalogId, , flag] = j.parts[pi];
        if (flag === 'minifig' || flag === 'segment') continue;
        bricks.push({ partId: ldrawId, catalogId: catalogId || null, color: j.colors[ci], x, y, z, matrix, layer: step, sub, baseplate: flag === 'baseplate', fp: x0 === null || x0 === undefined ? null : { x0, z0, y0, w, l, hp } });
    }
    // The converter's snapping offset, measured on the grid-aligned parts.
    const off = [[], [], []];
    for (const b of bricks) {
        if (!b.fp) continue;
        const box = bakedBox(b.partId, root); if (!box) continue;
        const { lo } = worldBox(box, b.matrix, [b.x, b.y, b.z]);
        off[0].push(b.fp.x0 - lo[0]); off[1].push(b.fp.y0 - lo[1] / 0.4); off[2].push(b.fp.z0 - lo[2]);
    }
    const [ox, oy, oz] = off.map(median);
    let approx = 0;
    for (const b of bricks) {
        if (b.fp) continue;
        const box = bakedBox(b.partId, root); if (!box) continue;
        const { lo, hi } = worldBox(box, b.matrix, [b.x, b.y, b.z]);
        b.fp = { x0: Math.round(lo[0] + ox), z0: Math.round(lo[2] + oz), y0: Math.round(lo[1] / 0.4 + oy), w: Math.max(1, Math.round(hi[0] - lo[0])), l: Math.max(1, Math.round(hi[2] - lo[2])), hp: Math.max(1, Math.floor((hi[1] - lo[1]) / 0.4 + 0.3)) };
        b.approx = true; approx++;
    }
    return { id: j.id, name: j.name, year: j.year, theme: j.theme, subject: j.subject, source: j.source || {}, bricks, pieces: bricks.length, approx };
}

/** The LDraw part's description (first line of its .dat), for parts our catalog does not have. */
const nameCache = new Map();
let LDRAW_LIB = process.env.LDRAW_LIB || '/tmp/claude-0/-home-user-toubia-portfolio/b02fe282-5fb8-5220-8c33-9669ea216981/scratchpad/ldraw/ldraw';
export function ldrawName(id) {
    if (nameCache.has(id)) return nameCache.get(id);
    let name = '';
    for (const sub of ['parts', 'p']) {
        const f = path.join(LDRAW_LIB, sub, String(id).replace(/_/g, '/') + '.dat');
        try { const head = fs.readFileSync(f, 'utf8').slice(0, 200).split(/\r?\n/)[0]; name = head.replace(/^0\s+/, '').trim(); break; } catch { /* not there */ }
    }
    nameCache.set(id, name);
    return name;
}

/** What a part is, for module detection: from the catalog flags, or from the LDraw description. */
function classify(def, name) {
    if (def) {
        if (def.isWheel) return def.id === '55423' ? 'trainWheel' : 'wheel';
        if (def.isTire) return 'tyre';
        if (def.isAxlePlate) return 'axlePlate';
        if (def.isWindow) return 'window';
        if (def.isGlass) return 'glass';
        if (def.isDoorFrame) return 'doorFrame';
        if (def.isDoor) return 'door';
        if (def.isHeadlight) return 'headlight';
        if (def.isSlope && !def.curved) return 'slope';
        return 'part';
    }
    const n = name || '';
    if (/^Train Wheel/i.test(n)) return 'trainWheel';
    if (/^Wheel\b/i.test(n) && !/Arch|Cover|Holder|Bearing|Guard|Steering|Hub Cap/i.test(n)) return 'wheel';
    if (/^(Tyre|Tire)\b/i.test(n)) return 'tyre';
    if (/^Glass for|^Windscreen.*Glass/i.test(n)) return 'glass';
    if (/^Window\b/i.test(n)) return 'window';
    if (/^Door\b.*Frame/i.test(n)) return 'doorFrame';
    if (/^Door\b/i.test(n)) return 'door';
    if (/^Slope Brick|^Slope\b/i.test(n) && !/Curved|Inverted/i.test(n)) return 'slope';
    return 'part';
}

/** Quarter turns about Y of a source brick (generator rotY, or the converted 3x3 matrix). */
function quarterTurns(b) {
    let a = 0;
    if (Array.isArray(b.matrix) && b.matrix.length === 9) a = Math.atan2(b.matrix[2], b.matrix[0]);
    else if (typeof b.rotY === 'number') a = b.rotY;
    return ((Math.round(a / (PI / 2)) % 4) + 4) % 4;
}

/* ══ the voxel frame ══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Normalise a source model into the encoder's frame: footprint shifted to x, z >= 0; a source whose lowest layer is a
 * baseplate keeps it as the blueprint base, anything else is lifted one plate onto a base of its own. Vehicles
 * whose wheels face X are transposed so they drive along Z like the engine's chassis.
 */
function frameOf(E, model) {
    const items = [];
    for (const b of model.bricks) {
        if (b.strut || !b.fp) continue;
        const cid = b.catalogId !== undefined ? b.catalogId : (E.PARTS[b.partId] ? b.partId : null);
        const def = cid && E.PARTS[cid] ? E.PARTS[cid] : null;
        const kind = classify(def, def ? def.name : ldrawName(b.partId));
        const color = E.COLORS[b.color] ? b.color : 'LIGHT_GREY';
        items.push({ b, def, cid: def && !b.approx ? cid : null, kind, color, fp: { ...b.fp }, q: quarterTurns(b), ghost: !!(b.ghost || (def && def.ghost)) || ['tyre', 'glass', 'door'].includes(kind) });
    }
    if (!items.length) throw new Error('no grid-aligned bricks');
    // Wheels facing X (thin along Z): transpose x <-> z so the wheels stand like the engine's (thin along X).
    const wheels = items.filter((i) => i.kind === 'wheel' || i.kind === 'trainWheel' || i.kind === 'tyre');
    let transposed = false;
    const span = (k) => { let a = Infinity, z = -Infinity; for (const i of items) { const lo = k === 'x' ? i.fp.x0 : i.fp.z0, n = k === 'x' ? i.fp.w : i.fp.l; a = Math.min(a, lo); z = Math.max(z, lo + n); } return z - a; };
    const thinZ = wheels.filter((i) => i.fp.l < i.fp.w).length, thinX = wheels.filter((i) => i.fp.w < i.fp.l).length;
    if (wheels.length >= 2 && (thinZ > thinX || (thinZ === thinX && span('x') > span('z')))) transposed = true;
    else if (!wheels.length && span('x') > 48 && span('z') <= 48) transposed = true;
    if (transposed) for (const i of items) { const f = i.fp; i.fp = { x0: f.z0, z0: f.x0, y0: f.y0, w: f.l, l: f.w, hp: f.hp }; i.q = (5 - i.q) % 4; }
    let minX = Infinity, minZ = Infinity, minY = Infinity, maxX = -Infinity, maxZ = -Infinity, maxY = -Infinity;
    for (const { fp } of items) { minX = Math.min(minX, fp.x0); minZ = Math.min(minZ, fp.z0); minY = Math.min(minY, fp.y0); maxX = Math.max(maxX, fp.x0 + fp.w - 1); maxZ = Math.max(maxZ, fp.z0 + fp.l - 1); maxY = Math.max(maxY, fp.y0 + fp.hp - 1); }
    const W = maxX - minX + 1, D = maxZ - minZ + 1;
    if (Math.min(W, D) > 48 || Math.max(W, D) > 64) throw new Error(`too big for a blueprint (${W}x${D} studs)`);
    // A baseplate: the bottom layer is all plates and covers most of the footprint.
    const bottom = items.filter((i) => i.fp.y0 === minY);
    const cover = new Set(); for (const i of bottom) if (i.fp.hp === 1) for (let x = i.fp.x0; x < i.fp.x0 + i.fp.w; x++) for (let z = i.fp.z0; z < i.fp.z0 + i.fp.l; z++) cover.add(x + ',' + z);
    const hasBase = (bottom.some((i) => i.b.baseplate) || (bottom.every((i) => i.fp.hp === 1) && cover.size >= 0.6 * W * D)) && W <= 48 && D <= 48;
    const dy = hasBase ? -minY : 1 - minY;
    for (const i of items) { i.fp.x0 -= minX; i.fp.z0 -= minZ; i.fp.y0 += dy; }
    // Vehicles drive toward +Z in StudForge (front = z1, where modules face 'front'): turn one round whose
    // windscreen and lights (the trans parts) are at the back.
    let mirrored = false;
    if (wheels.length >= 2) {
        const trans = items.filter((i) => /^TRANS_/.test(i.color));
        const cz = trans.reduce((s, i) => s + i.fp.z0 + (i.fp.l - 1) / 2, 0) / Math.max(1, trans.length);
        if (trans.length && cz < (D - 1) / 2 - 0.5) { mirrored = true; for (const i of items) { i.fp.z0 = D - (i.fp.z0 + i.fp.l); i.q = (6 - i.q) % 4; } }
    }
    const NX = Math.min(64, W), NZ = Math.min(64, D), NY = Math.min(61, maxY + dy + 1);
    return { items, NX, NZ, NY, W, D, hasBase, transposed, mirrored };
}

/** Colour ids <-> small ints for the typed arrays. */
function palette(E) { const ids = Object.keys(E.COLORS); const ix = new Map(ids.map((c, i) => [c, i])); return { ids, ix }; }

/** The target: every cell the source occupies, coloured by its solid part (a ghost only fills what nothing else does). */
function targetOf(F, pal) {
    const { NX, NZ, NY } = F, N = NX * NZ * NY;
    const T = new Int8Array(N).fill(-1), solid = new Uint8Array(N);
    for (const i of F.items) {
        const f = i.fp, c = pal.ix.get(i.color);
        for (let y = f.y0; y < f.y0 + f.hp; y++) for (let z = f.z0; z < f.z0 + f.l; z++) for (let x = f.x0; x < f.x0 + f.w; x++) {
            if (x < 0 || z < 0 || y < 0 || x >= NX || z >= NZ || y >= NY) continue;
            const k = (y * NZ + z) * NX + x;
            if (i.ghost) { if (T[k] < 0) T[k] = c; }
            else if (!solid[k]) { T[k] = c; solid[k] = 1; }
        }
    }
    return T;
}

/* ══ building ops and reading the result ══════════════════════════════════════════════════════════════════════ */

/** Run a list of (validated-shape) ops on a fresh grid through the engine's own blueprint builder. */
function buildGrid(E, base, ops) {
    const g = new E.Grid();
    const bp = { name: 'x', description: '', base, ops };
    const r = E.B.build(bp, { g, P: { primary: 'RED', secondary: 'WHITE', accent: 'YELLOW', trim: 'WHITE', glass: 'TRANS_CLEAR', dark: 'DARK_GREY', metal: 'LIGHT_GREY' } });
    return { g, warnings: r.warnings };
}

/** Painted cells and explicit-part cells of a grid as typed arrays in the encoder frame (cells outside are ignored). */
function snapshot(F, pal, g) {
    const { NX, NZ, NY } = F, N = NX * NZ * NY;
    const paint = new Int8Array(N).fill(-1), res = new Int8Array(N).fill(-1);
    let outside = 0;
    for (const c of g.cells.values()) { if (c.x < 0 || c.z < 0 || c.y < 0 || c.x >= NX || c.z >= NZ || c.y >= NY) { outside++; continue; } paint[(c.y * NZ + c.z) * NX + c.x] = pal.ix.get(c.color); }
    for (const p of g.parts) {
        if (p.ghost) continue;
        const f = p.fp, ci = pal.ix.get(p.color);
        for (let y = f.y0; y < f.y0 + f.hp; y++) for (let z = f.z0; z < f.z0 + f.l; z++) for (let x = f.x0; x < f.x0 + f.w; x++) {
            if (x < 0 || z < 0 || y < 0 || x >= NX || z >= NZ || y >= NY) { outside++; continue; }
            res[(y * NZ + z) * NX + x] = ci;
        }
    }
    return { paint, res, outside };
}

/** Explicit (reserved) cells an op makes on its own, and whether it collides with reserved cells already there. */
function opCells(E, F, op) {
    const { g } = buildGrid(E, { w: 1, d: 1, color: 'BLACK' }, [op]);
    const cells = [];
    for (const p of g.parts) { if (p.ghost) continue; const f = p.fp; for (let y = f.y0; y < f.y0 + f.hp; y++) for (let z = f.z0; z < f.z0 + f.l; z++) for (let x = f.x0; x < f.x0 + f.w; x++) cells.push([x, y, z, p.color]); }
    const painted = [...g.cells.values()].filter((c) => !(c.x === 0 && c.z === 0 && c.y === 0)).map((c) => [c.x, c.y, c.z, c.color]);
    return { cells, painted };
}

/* ══ scoring ══════════════════════════════════════════════════════════════════════════════════════════════════ */

const ALPHA = 0.5;   // bonus for the right colour on an occupied cell
const BETA = 1.0;    // cost of filling a cell the source leaves empty

/** Score of one cell given what is there now (cur colour index or -1) and the target. */
const cellScore = (t, cur) => (t >= 0 ? (cur >= 0 ? 1 + (cur === t ? ALPHA : 0) : 0) : (cur >= 0 ? -BETA : 0));

function totalScore(F, T, st, skipY0) {
    let s = 0; const { paint, res } = st;
    for (let k = skipY0 ? F.NX * F.NZ : 0; k < T.length; k++) s += cellScore(T[k], res[k] >= 0 ? res[k] : paint[k]);
    return s;
}

/* ══ box candidates ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The largest all-true rectangle of a 2D mask (NX x NZ), histogram method. */
function maxRect(mask, NX, NZ) {
    const h = new Int16Array(NX);
    let best = null;
    for (let z = 0; z < NZ; z++) {
        for (let x = 0; x < NX; x++) h[x] = mask[z * NX + x] ? h[x] + 1 : 0;
        const st = [];
        for (let x = 0; x <= NX; x++) {
            const hx = x < NX ? h[x] : 0;
            let start = x;
            while (st.length && st[st.length - 1][1] >= hx) {
                const [s0, hs] = st.pop();
                const area = hs * (x - s0);
                if (hs > 0 && (!best || area > best.area)) best = { x0: s0, x1: x - 1, z0: z - hs + 1, z1: z, area };
                start = s0;
            }
            st.push([start, hx]);
        }
    }
    return best;
}

/** Connected components (4-neighbour) of a 2D mask, as bounding rectangles with their cell counts. */
function components(mask, NX, NZ) {
    const seen = new Uint8Array(NX * NZ), out = [];
    for (let s = 0; s < NX * NZ; s++) {
        if (!mask[s] || seen[s]) continue;
        let x0 = NX, x1 = -1, z0 = NZ, z1 = -1, n = 0; const q = [s]; seen[s] = 1;
        while (q.length) {
            const k = q.pop(), x = k % NX, z = (k / NX) | 0; n++;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
            for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) { if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) continue; const nk = nz * NX + nx; if (mask[nk] && !seen[nk]) { seen[nk] = 1; q.push(nk); } }
        }
        out.push({ x0, x1, z0, z1, n });
    }
    return out;
}

/** Visit the cells of a box (or just its walls when hollow). */
function eachCell(F, b, fn) {
    const { NX, NZ, NY } = F;
    for (let y = Math.max(0, b.y0); y <= Math.min(NY - 1, b.y1); y++) for (let z = Math.max(0, b.z0); z <= Math.min(NZ - 1, b.z1); z++) for (let x = Math.max(0, b.x0); x <= Math.min(NX - 1, b.x1); x++) {
        if (b.hollow && !(x === b.x0 || x === b.x1 || z === b.z0 || z === b.z1)) continue;
        fn((y * NZ + z) * NX + x);
    }
}

/** Score change if box `b` (colour index c) were painted now (painted cells never cover reserved ones). */
function boxGain(F, T, st, b, c, skipY0) {
    let gain = 0; const { paint, res } = st, lim = skipY0 ? F.NX * F.NZ : 0;
    eachCell(F, b, (k) => { if (res[k] >= 0 || k < lim) return; gain += cellScore(T[k], c) - cellScore(T[k], paint[k]); });
    return gain;
}

/** Majority target colour over a box's occupied cells (optionally only the cells not yet right). */
function majority(F, T, st, b) {
    const n = new Map();
    eachCell(F, b, (k) => { if (T[k] < 0) return; const cur = st.res[k] >= 0 ? st.res[k] : st.paint[k]; const w = cur === T[k] ? 0.25 : 1; n.set(T[k], (n.get(T[k]) || 0) + w); });
    let best = -1, bn = 0; for (const [c, v] of n) if (v > bn) { bn = v; best = c; }
    return best;
}

/** Share of a rectangle's cells at plate y that the target occupies (any colour, or colour c). */
function fill(F, T, r, y, c = -1, ring = false) {
    let n = 0, hit = 0;
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) {
        if (ring && !(x === r.x0 || x === r.x1 || z === r.z0 || z === r.z1)) continue;
        n++; const t = T[(y * F.NZ + z) * F.NX + x]; if (c < 0 ? t >= 0 : t === c) hit++;
    }
    return n ? hit / n : 0;
}

/** Grow a single-layer rectangle up and down while the target keeps filling it. */
function extend(F, T, r, y, c, ring, tau) {
    let y0 = y, y1 = y;
    while (y1 + 1 < F.NY && fill(F, T, r, y1 + 1, c, ring) >= tau) y1++;
    while (y0 - 1 >= 1 && fill(F, T, r, y0 - 1, c, ring) >= tau) y0--;
    return { y0, y1 };
}

/** Every candidate box for the next greedy step. */
function candidates(F, T, st, pal, skipY0) {
    const { NX, NZ, NY } = F, out = [];
    const cur = (k) => (st.res[k] >= 0 ? st.res[k] : st.paint[k]);
    for (let y = skipY0 ? 1 : 0; y < NY; y++) {
        const wrong = new Uint8Array(NX * NZ), byCol = new Map();
        let any = false;
        for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) {
            const k = (y * NZ + z) * NX + x, t = T[k];
            if (t < 0 || cur(k) === t || st.res[k] >= 0) continue;
            wrong[z * NX + x] = 1; any = true;
            if (!byCol.has(t)) byCol.set(t, new Uint8Array(NX * NZ));
            byCol.get(t)[z * NX + x] = 1;
        }
        if (!any) continue;
        const masks = [[wrong, -1], ...[...byCol].map(([c, m]) => [m, c])];
        for (const [m, c] of masks) {
            const r = maxRect(m, NX, NZ);
            if (!r || r.area < 2) continue;
            for (const tau of [0.85, 0.6]) {
                const { y0, y1 } = extend(F, T, r, y, c, false, tau);
                out.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0, y1, c });
            }
            out.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: y, y1: y, c });
        }
        // Hollow shells: a component whose bounding ring is mostly wall and whose inside is mostly empty.
        for (const comp of components(wrong, NX, NZ)) {
            if (comp.n < 8 || comp.x1 - comp.x0 < 2 || comp.z1 - comp.z0 < 2) continue;
            const ringFill = fill(F, T, comp, y, -1, true);
            const inner = { x0: comp.x0 + 1, x1: comp.x1 - 1, z0: comp.z0 + 1, z1: comp.z1 - 1 };
            if (ringFill < 0.7 || fill(F, T, inner, y) > 0.5) continue;
            const { y0, y1 } = extend(F, T, comp, y, -1, true, 0.6);
            out.push({ x0: comp.x0, x1: comp.x1, z0: comp.z0, z1: comp.z1, y0, y1, c: -1, hollow: true });
        }
    }
    // Colour and score every candidate; dedupe identical boxes.
    const seen = new Set(), scored = [];
    for (const b of out) {
        const key = [b.x0, b.x1, b.z0, b.z1, b.y0, b.y1, b.c, b.hollow ? 1 : 0].join(',');
        if (seen.has(key)) continue; seen.add(key);
        const c = b.c >= 0 ? b.c : majority(F, T, st, b);
        if (c < 0) continue;
        const gain = boxGain(F, T, st, b, c, skipY0);
        scored.push({ ...b, c, gain });
    }
    return scored;
}

/* ══ module detection ═════════════════════════════════════════════════════════════════════════════════════════ */

/** Score change of placing an explicit op (its reserved cells override whatever is painted). Null when it collides. */
function explicitGain(E, F, T, st, op, pal, skipY0) {
    let oc;
    try { oc = opCells(E, F, op); } catch { return null; }
    if (!oc.cells.length) return null;
    let gain = 0; const seen = new Set(); const lim = skipY0 ? F.NX * F.NZ : 0;
    for (const [x, y, z, col] of oc.cells) {
        if (x < 0 || z < 0 || y < 0 || x >= F.NX || z >= F.NZ || y >= F.NY) { gain -= BETA; continue; }
        const k = (y * F.NZ + z) * F.NX + x;
        if (seen.has(k)) return null; seen.add(k);
        if (st.res[k] >= 0) return null;   // two parts in one cell: an overlap
        if (k < lim) return null;           // into the base plate
        gain += cellScore(T[k], pal.ix.get(col)) - cellScore(T[k], st.paint[k]);
    }
    for (const [x, y, z, col] of oc.painted) {
        if (x < 0 || z < 0 || y < 0 || x >= F.NX || z >= F.NZ || y >= F.NY) continue;
        const k = (y * F.NZ + z) * F.NX + x; if (st.res[k] >= 0 || seen.has(k)) continue;
        gain += cellScore(T[k], pal.ix.get(col)) - cellScore(T[k], st.paint[k]);
    }
    return { gain, cells: oc.cells, painted: oc.painted };
}

/** Wheels + axles -> one `chassis` module (null when the wheels do not pair up into axles). */
function detectChassis(F, T, pal) {
    const tyres = F.items.filter((i) => i.kind === 'tyre');
    // A rim set half a stud off the grid has no footprint while its tyre does: then the tyre stands for the wheel.
    const meets = (a, b) => a.x0 <= b.x0 + b.w - 1 && b.x0 <= a.x0 + a.w - 1 && a.z0 <= b.z0 + b.l - 1 && b.z0 <= a.z0 + a.l - 1 && a.y0 <= b.y0 + b.hp - 1 && b.y0 <= a.y0 + a.hp - 1;
    const rims = F.items.filter((i) => i.kind === 'wheel' || i.kind === 'trainWheel');
    const W = [...rims, ...tyres.filter((t) => !rims.some((r) => meets(r.fp, t.fp)))];
    if (W.length < 2) return null;
    const env = W.map((w) => {
        let f = { ...w.fp };
        for (const t of tyres) { const g = t.fp; if (g.x0 <= f.x0 + f.w - 1 && g.x0 + g.w - 1 >= f.x0 && g.z0 <= f.z0 + f.l - 1 && g.z0 + g.l - 1 >= f.z0 && g.y0 <= f.y0 + f.hp - 1 && g.y0 + g.hp - 1 >= f.y0) { const x0 = Math.min(f.x0, g.x0), z0 = Math.min(f.z0, g.z0), y0 = Math.min(f.y0, g.y0); f = { x0, z0, y0, w: Math.max(f.x0 + f.w, g.x0 + g.w) - x0, l: Math.max(f.z0 + f.l, g.z0 + g.l) - z0, hp: Math.max(f.y0 + f.hp, g.y0 + g.hp) - y0 }; } }
        return { f, train: w.kind === 'trainWheel', color: w.color };
    });
    // Axles: wheels at the same z, the outermost two on either side of the body. Pairs that sit on another
    // track (a trailer beside the truck, a cart) are left to the boxes.
    const zc = (e) => e.f.z0 + (e.f.l - 1) / 2;
    const rows = [];
    for (const e of env.sort((a, b) => zc(a) - zc(b))) { const r = rows.find((r) => Math.abs(zc(r[0]) - zc(e)) <= 1); if (r) r.push(e); else rows.push([e]); }
    let pairs = rows.filter((r) => r.length >= 2).map((r) => { r.sort((a, b) => a.f.x0 - b.f.x0); return [r[0], r[r.length - 1]]; }).filter(([l, r]) => r.f.x0 > l.f.x0 + l.f.w);
    if (!pairs.length) return null;
    const track = (p) => `${p[0].f.x0 + p[0].f.w},${p[1].f.x0}`, tally = new Map();
    for (const p of pairs) tally.set(track(p), (tally.get(track(p)) || 0) + 1);
    const main = [...tally].sort((a, b) => b[1] - a[1])[0][0];
    pairs = pairs.filter((p) => { const [a, b] = track(p).split(',').map(Number), [ma, mb] = main.split(',').map(Number); return Math.abs(a - ma) <= 1 && Math.abs(b - mb) <= 1; });
    const hpMed = pairs.map(([l]) => l.f.hp).sort((a, b) => a - b)[Math.floor(pairs.length / 2)];
    const size = pairs[0][0].train ? 'train' : hpMed <= 5 ? 'small' : hpMed <= 9 ? 'medium' : 'large';
    const ENV = { small: { w: 1, l: 2, hp: 5 }, medium: { w: 1, l: 3, hp: 7 }, large: { w: 2, l: 5, hp: 14 }, train: { w: 1, l: 2, hp: 6 } }[size];
    const clearance = Math.floor(ENV.hp / 2);
    const xIn = Math.max(...pairs.map(([l]) => l.f.x0 + l.f.w)), xOut = Math.min(...pairs.map(([, r]) => r.f.x0));
    const width = xOut - xIn;
    if (width < 2 || width > 16) return null;
    const floor = Math.max(1, Math.min(...pairs.map(([l, r]) => Math.min(l.f.y0, r.f.y0))));
    // Axle rows: where the engine's wheel (ENV.l deep) is centred like the real one.
    let axleZ = [...new Set(pairs.map(([l, r]) => { const cz = ((l.f.z0 + (l.f.l - 1) / 2) + (r.f.z0 + (r.f.l - 1) / 2)) / 2; const zw = Math.round(cz - (ENV.l - 1) / 2); return zw + Math.floor((ENV.l - 2) / 2); }))].sort((a, b) => a - b);
    // Keep axles apart (the engine drops one that runs into the previous wheel).
    axleZ = axleZ.filter((z, i, a) => i === 0 || z - a[i - 1] >= ENV.l);
    // The chassis runs the length of the body at the chassis rows (or just past the wheels).
    const yA = floor + clearance;
    let z0 = Math.min(...axleZ) - 1, z1 = Math.max(...axleZ) + 2;
    for (let y = yA; y <= Math.min(F.NY - 1, yA + 1); y++) for (let z = 0; z < F.NZ; z++) for (let x = xIn; x < xOut; x++) if (T[(y * F.NZ + z) * F.NX + x] >= 0) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    z0 = Math.max(0, z0);
    const colorCount = new Map();
    for (let y = yA; y <= Math.min(F.NY - 1, yA + 1); y++) for (let z = z0; z <= z1; z++) for (let x = xIn; x < xOut; x++) { const t = T[(y * F.NZ + z) * F.NX + x]; if (t >= 0) colorCount.set(t, (colorCount.get(t) || 0) + 1); }
    const col = [...colorCount].sort((a, b) => b[1] - a[1])[0];
    const params = { x: xIn, z: z0, y: floor, width, length: z1 - z0 + 1, axles: axleZ.map((z) => z - z0), size, color: col ? pal.ids[col[0]] : 'DARK_GREY' };
    return { op: 'module', id: 'chassis', params };
}

const WINDOW_SIZES = { '2,6': '1x2x2', '2,9': '1x2x3', '4,9': '1x4x3' };
/** Frames set into walls -> realWindow / realDoor modules, facing out of the model. */
function detectFrames(F) {
    const out = [], cx = (F.NX - 1) / 2, cz = (F.NZ - 1) / 2;
    const panes = F.items.filter((i) => i.kind === 'glass' || i.kind === 'door');
    for (const it of F.items) {
        if (it.kind !== 'window' && it.kind !== 'doorFrame') continue;
        const f = it.fp, thinZ = f.l === 1, thinX = f.w === 1;
        if (!thinZ && !thinX) continue;
        const long = thinZ ? f.w : f.l;
        const size = it.kind === 'window' ? WINDOW_SIZES[long + ',' + f.hp] : (long === 4 && f.hp === 18 ? 'door' : null);
        if (!size) continue;
        let face, x, z;
        if (thinZ && thinX) continue;
        if (thinZ) { if (f.z0 >= cz) { face = 'front'; x = f.x0; } else { face = 'back'; x = f.x0 + long - 1; } z = f.z0; }
        else { if (f.x0 >= cx) { face = 'right'; z = f.z0 + long - 1; } else { face = 'left'; z = f.z0; } x = f.x0; }
        const pane = panes.find((p) => p.fp.x0 === f.x0 && p.fp.z0 === f.z0 && p.fp.y0 === f.y0);
        if (size === 'door') out.push({ op: 'module', id: 'realDoor', params: { x, z, y: f.y0, face, frameColor: it.color, doorColor: pane ? pane.color : 'RED' } });
        else out.push({ op: 'module', id: 'realWindow', params: { x, z, y: f.y0, size, face, frameColor: it.color, glassColor: pane ? pane.color : 'TRANS_CLEAR' } });
    }
    return out;
}

/** Headlight bricks -> headlight modules, facing the side where the source has a trans lens in front of them. */
function detectHeadlights(F, T, pal) {
    const out = [], V = { front: [0, 1], back: [0, -1], right: [1, 0], left: [-1, 0] };
    for (const i of F.items) {
        if (i.kind !== 'headlight' || i.fp.hp !== 3) continue;
        const faces = [];
        for (const [face, [dx, dz]] of Object.entries(V)) {
            const x = i.fp.x0 + dx, z = i.fp.z0 + dz, y = i.fp.y0 + 1;
            if (x < 0 || z < 0 || x >= F.NX || z >= F.NZ) continue;
            const t = T[(y * F.NZ + z) * F.NX + x];
            if (t >= 0 && /^TRANS_/.test(pal.ids[t])) faces.push({ op: 'module', id: 'headlight', params: { x: i.fp.x0, z: i.fp.z0, y: i.fp.y0, face, color: i.color, lens: pal.ids[t] } });
        }
        if (faces.length) out.push(faces);
    }
    return out;
}

/** Slopes forming a roof -> gable roof candidates over their footprint (both ridge axes). */
function detectRoofs(F) {
    const s = F.items.filter((i) => i.kind === 'slope');
    if (s.length < 4) return [];
    // The highest cluster of slopes: those whose bottom is within a brick and a half of the top slope layers.
    const ys = s.map((i) => i.fp.y0).sort((a, b) => a - b);
    const groups = [];
    for (const it of s) { let g = groups.find((g) => it.fp.x0 <= g.x1 + 1 && it.fp.x0 + it.fp.w - 1 >= g.x0 - 1 && it.fp.z0 <= g.z1 + 1 && it.fp.z0 + it.fp.l - 1 >= g.z0 - 1 && Math.abs(it.fp.y0 - g.y0) <= 9); if (!g) { g = { x0: it.fp.x0, x1: it.fp.x0 + it.fp.w - 1, z0: it.fp.z0, z1: it.fp.z0 + it.fp.l - 1, y0: it.fp.y0, n: 0, color: new Map() }; groups.push(g); } g.x0 = Math.min(g.x0, it.fp.x0); g.x1 = Math.max(g.x1, it.fp.x0 + it.fp.w - 1); g.z0 = Math.min(g.z0, it.fp.z0); g.z1 = Math.max(g.z1, it.fp.z0 + it.fp.l - 1); g.y0 = Math.min(g.y0, it.fp.y0); g.n++; g.color.set(it.color, (g.color.get(it.color) || 0) + 1); }
    void ys;
    const out = [];
    for (const g of groups.filter((g) => g.n >= 4).sort((a, b) => b.n - a.n).slice(0, 2)) {
        const color = [...g.color].sort((a, b) => b[1] - a[1])[0][0];
        for (const axis of ['x', 'z']) out.push({ op: 'roof', kind: 'gable', x0: g.x0, x1: g.x1, z0: g.z0, z1: g.z1, y: g.y0, color, axis });
    }
    return out;
}

/* ══ the encoder ══════════════════════════════════════════════════════════════════════════════════════════════ */

const DETAIL_IDS = new Set(['2412', '4070', '3062', '4073', '98138', '3070', '3069', '3024', '3023', '3039', '3040', '3038', '3037', '3298', '4286', '54200', '85984', '15068', '11477', '6091', '3941', '4032', '14769', '3957', '59900', '3942', '553', '25269', '87079', '3068', '2431', '3710', '3623', '3660', '3665', '3063', '4740', '3960', '2335']);

/**
 * Encode a source model. Returns { blueprint (format-shaped, validates), info, F } or throws.
 * opts: { maxOps = 60, name, description, category, partReserve = 6 }
 */
export function encode(E, model, opts = {}) {
    const maxOps = Math.min(60, opts.maxOps || 60);
    const pal = palette(E);
    const F = frameOf(E, model);
    const T = targetOf(F, pal);
    const skipY0 = !F.hasBase;
    let baseColor = 'LIGHT_GREY';
    if (F.hasBase) { const n = new Map(); for (let k = 0; k < F.NX * F.NZ; k++) if (T[k] >= 0) n.set(T[k], (n.get(T[k]) || 0) + 1); baseColor = pal.ids[[...n].sort((a, b) => b[1] - a[1])[0][0]]; }
    else { const n = new Map(); for (const i of F.items) n.set(i.color, (n.get(i.color) || 0) + 1); const top = [...n].sort((a, b) => b[1] - a[1])[0][0]; baseColor = top === 'LIGHT_GREY' ? 'DARK_GREY' : 'LIGHT_GREY'; }
    const base = { w: Math.min(48, F.W), d: Math.min(48, F.D), color: baseColor };
    const ops = [];
    let st = snapshot(F, pal, buildGrid(E, base, ops).g);
    const refresh = () => { st = snapshot(F, pal, buildGrid(E, base, ops).g); };
    /** Add an explicit op if it collides with nothing and explains more than it spoils. */
    const tryExplicit = (op, minGain = 0) => { const r = explicitGain(E, F, T, st, op, pal, skipY0); if (!r || r.gain <= minGain) return false; ops.push(op); refresh(); return true; };

    // 1. modules where part groups match them
    const modules = { chassis: 0, realWindow: 0, realDoor: 0, headlight: 0 };
    const ch = detectChassis(F, T, pal);
    if (ch && tryExplicit(ch, -1e9)) modules.chassis++;
    for (const op of detectFrames(F)) if (ops.length < 16 && tryExplicit(op)) modules[op.id]++;
    for (const faces of detectHeadlights(F, T, pal)) {
        if (ops.length >= 20) break;
        const best = faces.map((op) => ({ op, r: explicitGain(E, F, T, st, op, pal, skipY0) })).filter((x) => x.r).sort((a, b) => b.r.gain - a.r.gain)[0];
        if (best && best.r.gain > 0) { ops.push(best.op); refresh(); modules.headlight++; }
    }
    // 2. a gable roof where the slopes form one (kept only if it explains its cells)
    let roofs = 0;
    for (const cand of detectRoofs(F).map((op) => ({ op, r: explicitGain(E, F, T, st, op, pal, skipY0) })).filter((x) => x.r && x.r.gain > 4).sort((a, b) => b.r.gain - a.r.gain)) {
        if (roofs >= 1) break;
        if (tryExplicit(cand.op, 4)) roofs++;
    }

    // 3. boxes, greedily
    const partReserve = opts.partReserve ?? 6;
    const minGain = Math.max(3, 0.0015 * T.reduce((n, t) => n + (t >= 0 ? 1 : 0), 0));
    while (ops.length < maxOps - partReserve) {
        const cands = candidates(F, T, st, pal, skipY0);
        if (!cands.length) break;
        cands.sort((a, b) => b.gain - a.gain);
        const b = cands[0];
        if (b.gain < minGain) break;
        const op = { op: 'box', x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y0: b.y0, y1: b.y1, color: pal.ids[b.c] };
        if (b.hollow) op.hollow = true;
        ops.push(op);
        eachCell(F, b, (k) => { if (st.res[k] < 0) st.paint[k] = b.c; });
    }
    refresh();

    // 3b. two-plate boxes become slabs (stud-locked floors) when that costs nothing
    let score = totalScore(F, T, st, skipY0);
    for (let i = 0; i < ops.length; i++) {
        const o = ops[i];
        if (o.op !== 'box' || o.hollow || o.y1 !== o.y0 + 1 || (o.x1 - o.x0 + 1) * (o.z1 - o.z0 + 1) < 6 || o.x1 === o.x0 || o.z1 === o.z0) continue;
        const slab = { op: 'slab', x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, y: o.y0, color: o.color };
        const trial = ops.slice(); trial[i] = slab;
        let g; try { g = buildGrid(E, base, trial); } catch { continue; }
        if (g.warnings.length) continue;
        const s2 = snapshot(F, pal, g.g);
        if (collides(E, base, trial)) continue;
        const sc = totalScore(F, T, s2, skipY0);
        if (sc >= score - 0.5) { ops[i] = slab; st = s2; score = sc; }
    }

    // 4. distinctive parts, up to the budget
    const detail = [];
    for (const it of F.items) {
        if (!it.cid || it.ghost || it.kind !== 'part' && it.kind !== 'slope' && it.kind !== 'headlight') continue;
        if (!DETAIL_IDS.has(it.cid) && !/^TRANS_/.test(it.color)) continue;
        if (it.fp.y0 <= 1) continue;   // on the ground: dressing around the model, not part of it
        const d = it.def, hp = Math.max(1, Math.round(d.height / 0.4));
        if (it.fp.hp !== hp) continue;
        const q = it.q;
        const swap = q % 2 === 1, w = swap ? d.length : d.width, l = swap ? d.width : d.length;
        let rot = q;
        if (it.fp.w !== w || it.fp.l !== l) { if (it.fp.w === l && it.fp.l === w) rot = (q + 1) % 4; else continue; }
        const bonus = /^TRANS_/.test(it.color) ? 3 : (d.grille || d.isHeadlight || d.isRound || d.isCone || d.isAntenna || d.isDome || d.isSlope) ? 1.5 : 0.5;
        detail.push({ op: { op: 'part', id: it.cid, color: it.color, x: it.fp.x0, z: it.fp.z0, y: it.fp.y0, ...(rot ? { rotY: rot } : {}) }, bonus });
    }
    let parts = 0;
    while (ops.length < maxOps && detail.length) {
        let best = null;
        for (const dc of detail) {
            const r = explicitGain(E, F, T, st, dc.op, pal, skipY0);
            if (!r || r.gain < 0) continue;
            // It must stand on, or carry, something.
            const supported = r.cells.some(([x, y, z]) => { const below = y - 1 >= 0 && x < F.NX && z < F.NZ ? ((y - 1) * F.NZ + z) * F.NX + x : -1; const above = y + 1 < F.NY ? ((y + 1) * F.NZ + z) * F.NX + x : -1; return (below >= 0 && (st.res[below] >= 0 || st.paint[below] >= 0)) || (above >= 0 && (st.res[above] >= 0 || st.paint[above] >= 0)); }) || r.cells.some(([, y]) => y === 0);
            if (!supported) continue;
            const v = r.gain + dc.bonus;
            if (!best || v > best.v) best = { dc, v };
        }
        if (!best || best.v < 2.5) break;
        detail.splice(detail.indexOf(best.dc), 1);
        ops.push(best.dc.op); refresh(); parts++;
    }

    // 5. order like a builder works, then the format shape
    const ordered = order(E, base, ops);
    const blueprint = {
        name: (opts.name || model.name || 'Real set').slice(0, 60),
        description: (opts.description || `Compressed from a real set: ${model.name || ''}`).slice(0, 220),
        category: opts.category || undefined,
        base,
        ops: ordered.map(formatOp),
    };
    if (!blueprint.category) delete blueprint.category;
    return { blueprint, info: { modules, roofs, parts, boxes: ops.filter((o) => o.op === 'box').length, slabs: ops.filter((o) => o.op === 'slab').length, hasBase: F.hasBase, transposed: F.transposed, dims: [F.W, F.D, F.NY] }, F, T, pal };
}

/** Which op ends up owning each cell of the build ("x,y,z" -> op index): later boxes repaint, parts reserve. */
function ownerMap(E, ops) {
    const owner = new Map(), reserved = new Set();
    ops.forEach((o, i) => {
        if (o.op === 'box') {
            for (let y = o.y0; y <= o.y1; y++) for (let z = o.z0; z <= o.z1; z++) for (let x = o.x0; x <= o.x1; x++) {
                if (o.hollow && !(x === o.x0 || x === o.x1 || z === o.z0 || z === o.z1)) continue;
                const k = `${x},${y},${z}`; if (!reserved.has(k)) owner.set(k, i);
            }
            return;
        }
        let oc; try { oc = opCells(E, null, o); } catch { return; }
        for (const [x, y, z] of oc.cells) { const k = `${x},${y},${z}`; owner.set(k, i); reserved.add(k); }
        for (const [x, y, z] of oc.painted) { const k = `${x},${y},${z}`; if (!reserved.has(k)) owner.set(k, i); }
    });
    return owner;
}

/** True when two explicit parts of a build share a cell. */
function collides(E, base, ops) {
    const { g } = buildGrid(E, base, ops), seen = new Set();
    for (const p of g.parts) { if (p.ghost) continue; const f = p.fp; for (let y = f.y0; y < f.y0 + f.hp; y++) for (let z = f.z0; z < f.z0 + f.l; z++) for (let x = f.x0; x < f.x0 + f.w; x++) { const k = x + ',' + y + ',' + z; if (seen.has(k)) return true; seen.add(k); } }
    return false;
}

/** Bottom-up builder's order: chassis and floors, interior details, walls, windows and doors, roof; painters keep their order. */
function order(E, base, ops) {
    const RANK = { slab: 0, chassis: 1, part: 2, box: 3, module: 4, roof: 5 };
    const y0 = (o) => (o.op === 'box' ? o.y0 : o.op === 'slab' || o.op === 'roof' || o.op === 'part' ? o.y : o.params.y);
    const rank = (o) => (o.op === 'module' ? (o.id === 'chassis' ? RANK.chassis : RANK.module) : RANK[o.op]);
    // Painted extents (boxes and roofs paint cells: two that overlap must keep their relative order).
    const ext = ops.map((o) => (o.op === 'box' ? o : o.op === 'roof' ? { x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, y0: o.y, y1: o.y + 30 } : null));
    const meets = (a, b) => a && b && a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1 && a.y0 <= b.y1 && b.y0 <= a.y1;
    const preds = ops.map((_, i) => ops.map((_, j) => j).filter((j) => j < i && meets(ext[i], ext[j])));
    const done = new Set(), out = [];
    while (out.length < ops.length) {
        let best = -1;
        for (let i = 0; i < ops.length; i++) {
            if (done.has(i) || !preds[i].every((j) => done.has(j))) continue;
            if (best < 0) { best = i; continue; }
            const a = ops[i], b = ops[best];
            if (y0(a) < y0(b) || (y0(a) === y0(b) && (rank(a) < rank(b) || (rank(a) === rank(b) && i < best)))) best = i;
        }
        done.add(best); out.push(ops[best]);
    }
    return out;
}

/** The documented op shape (module x/z/y at the top level, like the fixtures). */
function formatOp(o) {
    if (o.op !== 'module') return o;
    const { x, z, y, ...params } = o.params;
    return { op: 'module', id: o.id, x, z, y, params };
}

/** The bounding box of a set of "x,y,z" cells grown by m (null when empty). */
function nearCells(cells, m) {
    if (!cells || !cells.size) return null;
    const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const k of cells) { const [x, y, z] = k.split(',').map(Number); b.x0 = Math.min(b.x0, x - m); b.x1 = Math.max(b.x1, x + m); b.y0 = Math.min(b.y0, y - 3 * m); b.y1 = Math.max(b.y1, y + 3 * m); b.z0 = Math.min(b.z0, z - m); b.z1 = Math.max(b.z1, z + m); }
    return b;
}
function opNear(o, b) {
    const r = o.op === 'box' ? o : o.op === 'slab' ? { ...o, y0: o.y, y1: o.y + 1 } : o.op === 'roof' ? { ...o, y0: o.y, y1: o.y + 30 } : o.op === 'part' || o.op === 'module' ? { x0: o.x - 2, x1: o.x + 2, z0: o.z - 2, z1: o.z + 2, y0: o.y - 6, y1: o.y + 6 } : null;
    return !!r && r.x0 <= b.x1 && b.x0 <= r.x1 && r.z0 <= b.z1 && b.z0 <= r.z1 && r.y0 <= b.y1 && b.y0 <= r.y1;
}

/* ══ fidelity ═════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Cells (key -> colour) of a brick list in the encoder frame. */
function cellsOfBricks(bricks, shift = { x: 0, y: 0, z: 0 }) {
    const solid = new Map(), ghost = new Map();
    for (const b of bricks) {
        if (b.strut || !b.fp) continue;
        const f = b.fp, into = b.ghost ? ghost : solid;
        for (let y = f.y0; y < f.y0 + f.hp; y++) for (let z = f.z0; z < f.z0 + f.l; z++) for (let x = f.x0; x < f.x0 + f.w; x++) { const k = `${x + shift.x},${y + shift.y},${z + shift.z}`; if (!into.has(k)) into.set(k, b.color); }
    }
    for (const [k, c] of ghost) if (!solid.has(k)) solid.set(k, c);
    return solid;
}

function hollowShare(cells) {
    const cols = new Map();
    for (const k of cells.keys()) { const [x, y, z] = k.split(',').map(Number); const c = x + ',' + z; const r = cols.get(c); if (!r) cols.set(c, { lo: y, hi: y, n: 1 }); else { r.lo = Math.min(r.lo, y); r.hi = Math.max(r.hi, y); r.n++; } }
    let span = 0, filled = 0; for (const r of cols.values()) { span += r.hi - r.lo + 1; filled += r.n; }
    return span ? 1 - filled / span : 0;
}

/** Rebuild the blueprint through the generator and compare it with the source (in the encoder frame). */
export function fidelity(E, enc, model) {
    const { F, T, pal } = enc;
    const m = E.gen.generateFromPrompt(enc.blueprint.name.toLowerCase(), 0, { blueprint: enc.blueprint });
    if (m.kind !== 'blueprint') throw new Error('blueprint did not build');
    const src = new Map();
    for (let k = 0; k < T.length; k++) if (T[k] >= 0) { const x = k % F.NX, z = ((k / F.NX) | 0) % F.NZ, y = (k / (F.NX * F.NZ)) | 0; src.set(`${x},${y},${z}`, pal.ids[T[k]]); }
    const reb = cellsOfBricks(m.bricks);
    if (!F.hasBase) for (const k of [...reb.keys()]) if (k.split(',')[1] === '0') reb.delete(k);
    let inter = 0, same = 0;
    for (const [k, c] of reb) if (src.has(k)) { inter++; if (src.get(k) === c) same++; }
    const union = src.size + reb.size - inter;
    const geo = geometry(m), held = geometry({ bricks: m.bricks.filter((b) => !b.strut) });
    return {
        looseComps: held.looseComps,
        iou: +(inter / union).toFixed(3), color: +(inter ? same / inter : 0).toFixed(3),
        pieces: +(m.bricks.length / Math.max(1, model.pieces || model.bricks.length)).toFixed(2), srcPieces: model.pieces || model.bricks.length, bpPieces: m.bricks.length,
        hollowSrc: +hollowShare(src).toFixed(3), hollowBp: +hollowShare(reb).toFixed(3),
        ops: enc.blueprint.ops.length, struts: (m.anchor && m.anchor.struts) || 0, overlaps: geo.overlaps, loose: geo.loose, warnings: (m.warnings || []).length,
        bytes: JSON.stringify(enc.blueprint).length,
    };
}

/** The blueprint test's geometry checks: overlapping cells and assemblies that never reach the ground. */
export function geometry(m) {
    const solids = m.bricks.filter((b) => !b.ghost), fps = solids.map((b) => b.fp), occ = new Map();
    let overlaps = 0;
    fps.forEach((f, i) => { for (let y = f.y0; y < f.y0 + f.hp; y++) for (let x = f.x0; x < f.x0 + f.w; x++) for (let z = f.z0; z < f.z0 + f.l; z++) { const k = `${x},${y},${z}`; if (occ.has(k)) overlaps++; else occ.set(k, i); } });
    const minY = Math.min(...fps.map((f) => f.y0));
    const parent = fps.map((_, i) => i); const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a]))); const union = (a, b) => { parent[find(a)] = find(b); };
    fps.forEach((f, i) => { for (let x = f.x0; x < f.x0 + f.w; x++) for (let z = f.z0; z < f.z0 + f.l; z++) { const d = occ.get(`${x},${f.y0 - 1},${z}`); if (d !== undefined) union(i, d); const u = occ.get(`${x},${f.y0 + f.hp},${z}`); if (u !== undefined) union(i, u); } });
    solids.forEach((b, i) => { if (!b.links) return; for (const [x, y, z] of b.links) { const o = occ.get(`${x},${y},${z}`); if (o !== undefined) union(i, o); } });
    const comps = new Map(); fps.forEach((f, i) => { const r = find(i); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(i); });
    const loose = [...comps.values()].filter((ids) => !ids.some((i) => fps[i].y0 === minY));
    const looseComps = loose.map((ids) => { const set = new Set(); for (const i of ids) { const f = fps[i]; for (let y = f.y0; y < f.y0 + f.hp; y++) for (let x = f.x0; x < f.x0 + f.w; x++) for (let z = f.z0; z < f.z0 + f.l; z++) set.add(`${x},${y},${z}`); } return set; });
    return { overlaps, loose: loose.reduce((n, ids) => n + ids.length, 0), looseComps };
}

/**
 * Encode, then repair what the engine would have to prop up: while the rebuild needs more than two struts, drop the
 * op whose removal lowers the strut count most (details first). Returns the encoding and its fidelity.
 */
export function encodeChecked(E, model, opts = {}) {
    let enc = encode(E, model, opts), fid = fidelity(E, enc, model);
    const maxStruts = opts.maxStruts ?? 2;
    const without = (e, drop) => ({ ...e, blueprint: { ...e.blueprint, ops: e.blueprint.ops.filter((_, j) => !drop.has(j)) } });
    const bad = (f) => f.struts * 10 + f.overlaps * 10;
    let guard = 0;
    while ((fid.struts > maxStruts || fid.overlaps) && guard++ < 20) {
        // Candidate removals: the ops that own each floating assembly (a wing or a tail the boxes could not attach),
        // all of them at once, or single ops near what floats; whichever fixes struts for the least fidelity.
        const ops = enc.blueprint.ops, owner = ownerMap(E, ops), tries = [], all = new Set();
        const keep = (j) => !(ops[j].op === 'module' && ops[j].id === 'chassis');
        for (const comp of fid.looseComps || []) {
            const g = new Set(); for (const k of comp) { const j = owner.get(k); if (j !== undefined && keep(j)) g.add(j); }
            if (g.size && g.size <= 12) { tries.push(g); for (const j of g) all.add(j); }
        }
        if (all.size > 1 && all.size < ops.length / 2) tries.push(all);
        const cells = new Set(); for (const c of fid.looseComps || []) for (const k of c) cells.add(k);
        const near = nearCells(cells, 3);
        const singles = ops.map((o, i) => i).filter((i) => keep(i) && (!near || opNear(ops[i], near)));
        for (const i of singles.slice(-16)) tries.push(new Set([i]));
        let best = null;
        for (const drop of tries) {
            const t = without(enc, drop);
            let f; try { f = fidelity(E, t, model); } catch { continue; }
            if (bad(f) >= bad(fid)) continue;
            const v = (bad(fid) - bad(f)) / 10 / Math.max(0.002, fid.iou - f.iou);   // struts saved per IoU lost
            if (!best || v > best.v) best = { trial: t, f, v };
        }
        if (!best) break;
        enc = best.trial; fid = best.f;
    }
    // A byte budget for the prompt: drop the smallest details until it fits.
    const maxBytes = opts.maxBytes || Infinity;
    while (JSON.stringify(enc.blueprint).length > maxBytes && enc.blueprint.ops.length > 10) {
        const idx = enc.blueprint.ops.map((o, i) => [o, i]).filter(([o]) => o.op === 'part').map(([, i]) => i).pop();
        const drop = idx !== undefined ? idx : enc.blueprint.ops.length - 1;
        enc = { ...enc, blueprint: { ...enc.blueprint, ops: enc.blueprint.ops.filter((_, j) => j !== drop) } };
        fid = fidelity(E, enc, model);
    }
    return { enc, fid };
}

/* ══ CLI ══════════════════════════════════════════════════════════════════════════════════════════════════════ */

const GENERATED = ['red fire truck', 'police car', 'cozy cottage with a garden', 'medieval castle with towers', 'airliner', 'tugboat', 'steam train', 'starfighter', 'red dragon', 'tractor'];

const plural = (s) => (/(s|x|ch|sh)$/.test(s) ? s + 'es' : /[^aeiou]y$/.test(s) ? s.slice(0, -1) + 'ies' : s + 's');
const fmt = (f) => `iou=${f.iou.toFixed(2)} col=${f.color.toFixed(2)} pcs=${f.bpPieces}/${f.srcPieces} (${f.pieces}) hollow=${f.hollowSrc.toFixed(2)}->${f.hollowBp.toFixed(2)} ops=${f.ops} struts=${f.struts} ovl=${f.overlaps} loose=${f.loose} ${f.bytes}B`;

function main(argv) {
    const args = argv.slice(2), flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
    if (flag('--lib')) LDRAW_LIB = flag('--lib');
    const maxOps = +flag('--max-ops', 60), maxBytes = +flag('--max-bytes', 6200);
    if (args[0] === '--generated') {
        const E = loadEngine();
        const prompts = args.slice(1).filter((a) => !a.startsWith('--')).length ? args.slice(1).filter((a) => !a.startsWith('--')) : GENERATED;
        const all = [];
        for (const p of prompts) {
            const m = E.gen.generateFromPrompt(p, 0, {});
            const t0 = Date.now();
            const { enc, fid } = encodeChecked(E, { name: m.name, bricks: m.bricks, pieces: m.bricks.length }, { maxOps, maxBytes, name: m.name });
            all.push(fid);
            console.log(`${p.padEnd(30)} ${fmt(fid)} mods=${JSON.stringify(enc.info.modules)} roof=${enc.info.roofs} parts=${enc.info.parts} ${Date.now() - t0}ms`);
            if (process.env.DUMP) fs.writeFileSync(path.join(process.env.DUMP, p.replace(/\W+/g, '-') + '.json'), JSON.stringify(enc.blueprint, null, 1));
        }
        const mean = (k) => (all.reduce((s, f) => s + f[k], 0) / all.length).toFixed(3);
        console.log(`\nmean iou ${mean('iou')}  colour ${mean('color')}  ops ${mean('ops')}  struts ${mean('struts')}`);
        return;
    }
    if (args[0] === '--omr') {
        const E = loadEngine(ROOT, { knowledge: false });
        const knowledge = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/studforge/data/knowledge.json'), 'utf8'));
        const files = [];
        for (const a of args.slice(1)) { if (a.startsWith('--')) break; const st = fs.statSync(a); if (st.isDirectory()) for (const f of fs.readdirSync(a)) { if (f.endsWith('.json') && f !== 'index.json') files.push(path.join(a, f)); } else files.push(a); }
        const results = [];
        for (const f of files) {
            const j = JSON.parse(fs.readFileSync(f, 'utf8'));
            if (j.format !== 'studforge-omr-1') continue;
            const model = expandOmr(j);
            const lic = String((j.source && j.source.licence) || '');
            if (lic && !/CC BY/i.test(lic)) { console.log(`${j.id} skipped: licence ${lic}`); continue; }
            const t0 = Date.now();
            const cacheDir = flag('--cache'), cached = cacheDir && path.join(cacheDir, j.id + '.json');
            try {
                let enc, fid;
                if (cached && fs.existsSync(cached)) ({ enc, fid } = JSON.parse(fs.readFileSync(cached, 'utf8')));
                else {
                    const desc = `How set ${j.id} ${j.name} (${j.year}) is built, compressed from its LDraw model.`;
                    ({ enc, fid } = encodeChecked(E, model, { maxOps, maxBytes, name: j.name, description: desc }));
                    delete fid.looseComps;
                    if (cached) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cached, JSON.stringify({ enc: { blueprint: enc.blueprint, info: enc.info }, fid })); }
                }
                delete fid.looseComps;
                results.push({ j, enc, fid });
                console.log(`${j.id.padEnd(10)} ${String(j.subject).padEnd(13)} ${fmt(fid)} mods=${JSON.stringify(enc.info.modules)} roof=${enc.info.roofs} parts=${enc.info.parts} dims=${enc.info.dims.join('x')}${enc.info.transposed ? ' T' : ''} ${Date.now() - t0}ms  ${j.name}`);
            } catch (e) { console.log(`${j.id} failed: ${e.message}`); }
        }
        const mean = (k) => (results.reduce((s, r) => s + r.fid[k], 0) / Math.max(1, results.length)).toFixed(3);
        console.log(`\n${results.length} models: mean iou ${mean('iou')}  colour ${mean('color')}  ops ${mean('ops')}`);
        const out = flag('--out');
        if (out) {
            // Two examples for the subjects with many real sets (variants rotate through them), one for the rest.
            const perMajor = +flag('--per', 2), perMinor = +flag('--per-minor', 1), minIou = +flag('--min-iou', 0.6);
            const count = new Map(); for (const r of results) count.set(r.j.subject, (count.get(r.j.subject) || 0) + 1);
            fs.mkdirSync(out, { recursive: true });
            const bySubject = new Map();
            for (const r of results) {
                if (!r.j.subject || r.fid.struts > 2 || r.fid.overlaps || r.fid.loose || r.fid.warnings || r.fid.iou < minIou || r.fid.bytes > maxBytes) continue;
                if (Math.max(r.enc.info.dims[0], r.enc.info.dims[1]) > 48) continue;   // the base plate must carry it all
                if (!bySubject.has(r.j.subject)) bySubject.set(r.j.subject, []);
                bySubject.get(r.j.subject).push(r);
            }
            const index = { generated: new Date().toISOString().slice(0, 10), licence: 'Derived from LDraw OMR models (CC BY 2.0/4.0, authors per file) and the LDraw.org Parts Library (CC BY 2.0/4.0).', format: 'studforge-omr-blueprint-1', examples: [] };
            for (const old of fs.readdirSync(out)) if (old.endsWith('.json')) fs.unlinkSync(path.join(out, old));
            for (const [subject, rs] of [...bySubject].sort()) {
                rs.sort((a, b) => b.fid.iou + 0.25 * b.fid.color - (a.fid.iou + 0.25 * a.fid.color));
                for (const r of rs.slice(0, (count.get(subject) || 0) >= 4 ? perMajor : perMinor)) {
                    const k = knowledge.subjects[subject], label = k && k.keys ? k.keys[0] : subject.replace(/([A-Z])/g, ' $1').toLowerCase();
                    const ex = { setId: r.j.id, name: r.j.name, year: r.j.year, theme: r.j.theme || null, subject, label, labelPlural: plural(label), authors: (r.j.source && r.j.source.authors) || [], licence: (r.j.source && r.j.source.licence) || 'CC BY 2.0', source: (r.j.source && r.j.source.url) || 'https://library.ldraw.org/omr', blueprint: r.enc.blueprint, fidelity: r.fid };
                    const file = r.j.id.replace(/[^\w.-]+/g, '_') + '.json';
                    fs.writeFileSync(path.join(out, file), JSON.stringify(ex, null, 0).replace(/,\{"op"/g, ',\n{"op"').replace(/"ops":\[\{/, '"ops":[\n{') + '\n');
                    index.examples.push({ setId: ex.setId, name: ex.name, year: ex.year, subject, label, file, ops: r.fid.ops, iou: r.fid.iou, color: r.fid.color, bytes: fs.statSync(path.join(out, file)).size });
                    console.log(`wrote ${file} (${subject}, iou ${r.fid.iou}, ${index.examples[index.examples.length - 1].bytes} B)`);
                }
            }
            fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 1) + '\n');
            console.log(`index: ${index.examples.length} examples for ${bySubject.size} subjects`);
        }
        return;
    }
    console.log('usage: to-blueprint.mjs --generated ["prompt" ...] | --omr <dir|file> ... [--out dir] [--per 2] [--max-ops 60] [--max-bytes 6200] [--lib ldraw]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv);
