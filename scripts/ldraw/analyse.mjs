// How are real sets built? Per-subject construction profiles from LDraw reconstructions of official sets.
//
//   node scripts/ldraw/analyse.mjs [--omr public/studforge/data/omr] [--lib <ldraw dir>]
//        reads the converted real models (format: docs/studforge-ldraw.md, "studforge-omr-1"), measures each one,
//        aggregates per knowledge subject, forges OUR models of the same subjects and measures them the same way,
//        then writes public/studforge/data/construction.json and the comparison in docs/studforge-construction.md
//   node scripts/ldraw/analyse.mjs --generated
//        no real models: profiles from our own forges only (source "generated"), to exercise the pipeline
//   options: --out <json> --doc <md> --subjects fireTruck,castle --prompts-per 4 --variants 2
//
// The metrics themselves live in public/studforge/js/construction.js (measure), loaded here in a vm, so the
// REAL SETS panel computes exactly the same numbers for the model on screen. This script only adds what the
// browser does not need: LDraw part names → categories, the aggregation and the report.
// LDraw part names come from the parts library (--lib or $LDRAW_LIB, the folder holding parts/); without it,
// parts are categorised by their StudForge catalog id only.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const JS = path.join(ROOT, 'public/studforge/js') + '/';
const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt; };
const GENERATED_ONLY = args.includes('--generated');
const OMR = path.resolve(arg('--omr', path.join(ROOT, 'public/studforge/data/omr')));
const LIB = arg('--lib', process.env.LDRAW_LIB || '');
const OUT = path.resolve(arg('--out', path.join(ROOT, 'public/studforge/data/construction.json')));
const DOC = path.resolve(arg('--doc', path.join(ROOT, 'docs/studforge-construction.md')));
const ONLY = arg('--subjects', '') ? new Set(arg('--subjects').split(',')) : null;
const PER = +arg('--prompts-per', 4), VARIANTS = +arg('--variants', 2);

/* ── the engine, as the harness loads it ─────────────────────── */
const ctx = { console: { log() {}, warn() {}, error: console.error }, Math, Object, Array, Set, Map, Number, JSON, String, Error };
ctx.window = ctx;
vm.createContext(ctx);
const files = ['colors.js', 'parts-catalog.js', 'forge-grid.js', 'forge-modules.js', 'blueprint.js', 'forge-builders.js', 'forge-builders-2.js',
    ...fs.readdirSync(JS).filter((f) => /^forge-builders-\d+\.js$/.test(f) && f !== 'forge-builders-2.js').sort(), 'knowledge.js', 'construction.js', 'generator.js'];
for (const f of files) vm.runInContext(fs.readFileSync(JS + f, 'utf8'), ctx, { filename: f });
const knowledge = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/studforge/data/knowledge.json'), 'utf8'));
ctx.STUDFORGE_KNOWLEDGE = knowledge;
// Our models are measured WITHOUT the construction post-passes, so the comparison shows what the builders make.
ctx.STUDFORGE_CONSTRUCTION = null;
const C = ctx.FORGE.construction;
const gen = new ctx.BrickGenerator();

/* ── LDraw part names → analysis categories ──────────────────── */
const nameCache = new Map();
function ldName(id, depth = 0) {
    if (nameCache.has(id)) return nameCache.get(id);
    let name = null;
    if (LIB) {
        for (const sub of ['parts', 'parts/s', 'p']) {
            const f = path.join(LIB, sub, id.replace(/_/g, '/') + '.dat');
            if (!fs.existsSync(f)) continue;
            const text = fs.readFileSync(f, 'utf8');
            const first = (text.split('\n')[0] || '').replace(/^0\s+/, '').trim();
            const moved = first.match(/^~Moved to\s+(\S+)/i);
            if (moved && depth < 4) name = ldName(moved[1].toLowerCase().replace(/\.dat$/, ''), depth + 1);
            else name = first.replace(/^~/, '').replace(/\s+/g, ' ');
            break;
        }
    }
    nameCache.set(id, name);
    return name;
}
const INTERIOR_RE = [['seat', /\bSeat\b|\bChair\b|Throne|\bBench\b|Sofa|Couch/i], ['steering', /Steering/i], ['table', /\bTable\b/], ['bed', /\bBed\b|Bunk|Stretcher/i],
    ['panel', /Controls?\b.*Pattern|Control Panel|Computer|Keyboard|Gauges?\b|Dials?\b.*Pattern|Screen.*Pattern|Monitor/i],
    ['furniture', /Stove|Oven|Sink|Fridge|Refrigerator|Cupboard|Wardrobe|Bookcase|Shel(f|ves)|Toilet|Cabinet|Dresser|Fireplace/i]];
function classifyReal(ldId, catId, name) {
    const P = ctx.LEGO_PARTS;
    const n = name || '';
    for (const [type, re] of INTERIOR_RE) if (re.test(n)) return { cat: 'interior', interior: type, figure: false, top: 'none' };
    if (/^(Minifig|Animal|Figure|Horse|Electric,? Minifig|Bird|Dog|Cat|Fish)\b/i.test(n) && !/Seat/i.test(n)) return { cat: 'special', interior: null, figure: true, top: 'none' };
    // Track and road plates are the layout the model stands on, not the model: left out like the figures.
    if (/Train Track|Track\b|Monorail|\bRails?\b|Road ?plate|Baseplate.*(Road|Curve|Crossroad|T-Junction)/i.test(n)) return { cat: 'special', interior: null, figure: true, top: 'none' };
    const d = catId ? P[catId] : null;
    if (d) return { cat: C.catOfDef(d), interior: null, figure: false, top: C.topOfDef(d) };
    let cat = 'special';
    if (/Wheel|Tyre|Tire|\bRim\b/i.test(n)) cat = 'wheel';
    else if (/Window|Windscreen|Glass|\bDoor\b|Fence|Shutter|\bGate\b/i.test(n)) cat = 'window';
    else if (/Hinge|Turntable|Clip|\bBar\b|Lever|Handle|Tow ?Ball/i.test(n)) cat = 'hinge';
    else if (/Bracket|Studs? on Sides?|Headlight|Side Studs?/i.test(n)) cat = 'snot';
    else if (/^Tile/i.test(n)) cat = 'tile';
    else if (/^Slope|^Wedge(?! Plate)|Roof Tile|Slope Brick/i.test(n)) cat = 'slope';
    else if (/Round|Cylinder|Cone|Dish|Dome|Barrel|Radar/i.test(n)) cat = 'round';
    else if (/^Technic/i.test(n)) cat = 'special';
    else if (/^Plate|Wedge Plate|^Baseplate/i.test(n)) cat = 'plate';
    else if (/^Brick|^Panel|^Arch|^Support|^Column|^Pillar/i.test(n)) cat = 'brick';
    const top = cat === 'tile' ? 'tile' : cat === 'slope' ? 'slope' : ['plate', 'brick', 'round', 'snot'].includes(cat) || (cat === 'hinge' && /Plate|Brick/i.test(n)) ? 'studs' : 'none';
    return { cat, interior: null, figure: false, top };
}

/** A converted real model ("studforge-omr-1") → analysis bricks. */
function normalizeReal(m) {
    return m.bricks.map((r) => {
        const [pi, ci, x, y, z] = r;
        const [ldId, catId] = m.parts[pi];
        const mat = r.slice(5, 14), step = r[14], sub = r[15];
        const fp = r[16] === null || r[16] === undefined ? null : { x0: r[16], z0: r[17], y0: r[18], w: r[19], l: r[20], hp: r[21] };
        const k = classifyReal(String(ldId), catId, ldName(String(ldId)));
        return { cat: k.cat, part: String(ldId), color: m.colors[ci], fp, y: y / 0.4 - 0.5, px: x, pz: z, side: Math.abs(mat[4]) < 0.5, step, sub, interior: k.interior, figure: k.figure, top: k.top };
    });
}

/* ── aggregation across the models of a subject ──────────────── */
const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const med = (a) => r2(q(a.filter((v) => v != null), 0.5));
const mean = (a) => { const b = a.filter((v) => v != null); return b.length ? r2(b.reduce((x, y) => x + y, 0) / b.length) : null; };
const trio = (a) => { const b = a.filter((v) => v != null); return b.length ? [Math.round(q(b, 0.25) * 10) / 10, Math.round(q(b, 0.5) * 10) / 10, Math.round(q(b, 0.75) * 10) / 10] : null; };
const meanShares = (list, top) => { const acc = {}; for (const o of list) for (const [k, v] of Object.entries(o || {})) acc[k] = (acc[k] || 0) + v; return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, r2(v / list.length)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, top || 99)); };
const meanColors = (list, top) => { const acc = {}; for (const cs of list) for (const [c, v] of cs || []) acc[c] = (acc[c] || 0) + v; return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, top).map(([c, v]) => [c, r2(v / list.length)]); };

function aggregate(ms) {
    const P = ms.map((m) => m.metrics.proportions), Hh = ms.map((m) => m.metrics.hollow), T = ms.map((m) => m.metrics.techniques), B = ms.map((m) => m.metrics.buildOrder);
    const bases = {}; for (const p of P) bases[p.base.kind] = (bases[p.base.kind] || 0) + 1;
    const walls = Hh.map((h) => h.wall).filter(Boolean);
    const layers = ['bottom', 'middle', 'top'].map((band, i) => ({ band, share: mean(ms.map((m) => m.metrics.layers[i].share)), cats: meanShares(ms.map((m) => m.metrics.layers[i].cats), 6), colors: meanColors(ms.map((m) => m.metrics.layers[i].colors), 4) }));
    const phases = [0, 1, 2, 3, 4].map((i) => ({ h: mean(B.map((b) => b.phases[i].h)), cats: meanShares(B.map((b) => b.phases[i].cats), 3), share: mean(B.map((b) => b.phases[i].share)) }));
    const roles = {}; const subNames = [];
    for (const b of B) for (const s of b.subs) { roles[s.role] = (roles[s.role] || 0) + 1; if (subNames.length < 12 && !subNames.includes(s.name)) subNames.push(s.name); }
    const interiors = {};
    const types = new Set(ms.flatMap((m) => Object.keys(m.metrics.interiors)));
    for (const t of types) {
        const has = ms.filter((m) => m.metrics.interiors[t]).map((m) => m.metrics.interiors[t]);
        interiors[t] = { freq: r2(has.length / ms.length), count: mean(has.map((e) => e.count)), h: med(has.map((e) => e.h)), along: med(has.map((e) => e.along)), inside: mean(has.map((e) => e.inside)) };
    }
    return {
        n: ms.length,
        proportions: { wid: trio(P.map((p) => p.wid)), len: trio(P.map((p) => p.len)), hb: trio(P.map((p) => p.hb)), wl: med(P.map((p) => p.wl)), hl: med(P.map((p) => p.hl)), base: Object.entries(bases).sort((a, b) => b[1] - a[1])[0][0], baseShare: Object.fromEntries(Object.entries(bases).map(([k, v]) => [k, r2(v / ms.length)])), pieces: trio(ms.map((m) => m.metrics.pieces)) },
        hollow: { share: med(Hh.map((h) => h.share)), interior: med(Hh.map((h) => h.interior)), wall: walls.length ? { median: med(walls.map((w) => w.median)), s1: mean(walls.map((w) => w.s1)), s2: mean(walls.map((w) => w.s2)), s3: mean(walls.map((w) => w.s3)) } : null, solidShare: r2(1 - walls.length / ms.length) },
        layers,
        buildOrder: { steps: med(B.map((b) => b.steps)), perStep: med(B.map((b) => b.perStep)), per100: med(B.map((b) => b.per100)), heightCorr: med(B.map((b) => b.heightCorr)), phases, interiorAt: med(B.map((b) => b.interiorAt)), wallsAt: med(B.map((b) => b.wallsAt)), roofAt: med(B.map((b) => b.roofAt)), subFreq: r2(B.filter((b) => b.subs.length).length / B.length), subsPer: mean(B.map((b) => b.subs.length)), subShare: mean(B.map((b) => b.subShare)), roles: Object.entries(roles).sort((a, b) => b[1] - a[1]).slice(0, 8), subNames },
        interiors,
        techniques: { offGrid: mean(T.map((t) => t.offGrid)), sideways: mean(T.map((t) => t.sideways)), snot: mean(T.map((t) => t.snot)), hinge: mean(T.map((t) => t.hinge)), window: mean(T.map((t) => t.window)), wheel: mean(T.map((t) => t.wheel)), tileTop: med(T.map((t) => t.tileTop)), topTile: mean(T.map((t) => t.topTile)), topStuds: mean(T.map((t) => t.topStuds)), topSlope: mean(T.map((t) => t.topSlope)), cats: meanShares(T.map((t) => t.cats), 11) },
    };
}
// The compact block kept in the JSON for our own forges (the panel measures the live model itself).
const compactOurs = (a, prompts) => ({ n: a.n, prompts: prompts.slice(0, 4), proportions: { wid: a.proportions.wid, len: a.proportions.len, hb: a.proportions.hb, base: a.proportions.base, pieces: a.proportions.pieces }, hollow: { share: a.hollow.share, wall: a.hollow.wall && a.hollow.wall.median, solidShare: a.hollow.solidShare }, techniques: { tileTop: a.techniques.tileTop, snot: a.techniques.snot, hinge: a.techniques.hinge, sideways: a.techniques.sideways, window: a.techniques.window }, buildOrder: { perStep: a.buildOrder.perStep, heightCorr: a.buildOrder.heightCorr }, interiors: Object.keys(a.interiors) });

/* ── our forges of a subject ─────────────────────────────────── */
const HARNESS = fs.readFileSync(path.join(ROOT, 'scripts/studforge-test.mjs'), 'utf8');
const harnessPrompts = (HARNESS.match(/const prompts = [\s\S]*?\[([\s\S]*?)\];/) || [])[1] || '';
const extraPrompts = [...harnessPrompts.matchAll(/'([^']+)'/g)].map((m) => m[1]).concat(['red fire truck', 'medieval castle', 'police car', 'ambulance', 'garbage truck', 'excavator', 'race car', 'lunar rover', 'fire station', 'farm with a barn', 'bakery', 'house']);
function forgeSubject(id) {
    const e = knowledge.subjects[id];
    const prompts = [];
    for (const p of extraPrompts) { const k = ctx.FORGE.knowledge.subjectFor(p); if (k && k.id === id && !prompts.includes(p)) prompts.push(p); }
    for (const k of e.keys) if (prompts.length < PER && !prompts.includes(k)) prompts.push(k);
    const ms = [];
    for (const p of prompts.slice(0, PER + 2)) for (let v = 0; v < VARIANTS; v++) {
        let m; try { m = gen.generateFromPrompt(p, v, {}); } catch (err) { continue; }
        if (!m || !m.knowledge || m.knowledge.subject !== id || m.kind === 'scene' || m.kind === 'monogram') continue;
        const metrics = C.measure(C.normalize(m));
        if (metrics) ms.push({ id: `${p}#${v}`, prompt: p, kind: m.kind, metrics });
    }
    // "knight" is a castle-theme word but a figure: keep the builder kind most forges of the subject used.
    const kinds = {}; for (const m of ms) kinds[m.kind] = (kinds[m.kind] || 0) + 1;
    const kind = Object.entries(kinds).sort((a, b) => b[1] - a[1])[0];
    const keep = kind ? ms.filter((m) => m.kind === kind[0]) : [];
    return { ms: keep, prompts: [...new Set(keep.map((m) => m.prompt))], kind: kind && kind[0] };
}

/* ── run ─────────────────────────────────────────────────────── */
const real = new Map();   // subject → [{ id, name, metrics }]
let index = null;
if (!GENERATED_ONLY) {
    const idxFile = path.join(OMR, 'index.json');
    if (!fs.existsSync(idxFile)) { console.error(`No ${idxFile}; run with --generated or point --omr at the converted models.`); process.exit(1); }
    index = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
    if (!LIB) console.warn('No --lib / $LDRAW_LIB: LDraw-only parts are categorised as "special" and interiors are found by id only.');
    for (const ent of index.models) {
        if (!ent.subject || (ONLY && !ONLY.has(ent.subject))) continue;
        const f = path.join(OMR, ent.file || `${ent.id}.json`);
        if (!fs.existsSync(f)) continue;
        const m = JSON.parse(fs.readFileSync(f, 'utf8'));
        const metrics = C.measure(normalizeReal(m), m.submodels || []);
        if (!metrics) continue;
        if (!real.has(ent.subject)) real.set(ent.subject, []);
        real.get(ent.subject).push({ id: m.id, name: m.name, metrics });
        process.stderr.write(`  ${m.id.padEnd(10)} ${ent.subject.padEnd(12)} ${metrics.pieces} pcs (${metrics.apart} apart, ${metrics.baseAndDeco} base) ${metrics.proportions.base.kind} ${metrics.proportions.wid}x${metrics.proportions.len}x${metrics.proportions.hb} hollow ${metrics.hollow.share} tiles ${metrics.techniques.tileTop}\n`);
    }
}
const subjectIds = (GENERATED_ONLY ? Object.keys(knowledge.subjects).filter((id) => !id.startsWith('theme')) : [...real.keys()]).filter((id) => !ONLY || ONLY.has(id));
const out = { generated: new Date().toISOString().slice(0, 10), source: GENERATED_ONLY ? 'generated' : 'omr', licence: GENERATED_ONLY ? null : 'Derived from LDraw OMR models (CC BY 2.0/4.0, authors per model in data/omr/index.json) and the LDraw parts library (LDraw.org, CC BY)', bands: 'bottom <15%, middle, top >=80% of the height', subjects: {} };
const report = [];
for (const id of subjectIds) {
    const ours = forgeSubject(id);
    const oursAgg = ours.ms.length ? aggregate(ours.ms) : null;
    const realMs = real.get(id) || [];
    const main = GENERATED_ONLY ? oursAgg : aggregate(realMs);
    if (!main) continue;
    out.subjects[id] = Object.assign(main, { examples: GENERATED_ONLY ? ours.prompts.slice(0, 4) : realMs.slice(0, 6).map((m) => m.id) }, oursAgg ? { ours: compactOurs(oursAgg, ours.prompts) } : {});
    report.push({ id, real: GENERATED_ONLY ? null : main, realModels: realMs, ours: oursAgg, prompts: ours.prompts });
    process.stderr.write(`${id}: ${GENERATED_ONLY ? '' : realMs.length + ' real, '}${ours.ms.length} forged\n`);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const json = JSON.stringify(out);
fs.writeFileSync(OUT, json);
console.log(`${OUT}: ${Object.keys(out.subjects).length} subjects, ${(json.length / 1024).toFixed(1)} KB`);

/* ── the report: everything between the AUTO markers is rewritten, the rest of the doc is kept ── */
const pc = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
const tr = (a) => (a ? `${a[1]} (${a[0]}–${a[2]})` : '–');
const top3 = (o) => Object.entries(o || {}).slice(0, 3).map(([k, v]) => `${k} ${pc(v)}`).join(', ') || '–';
const lines = [];
lines.push(`_Generated ${out.generated} by \`node scripts/ldraw/analyse.mjs${GENERATED_ONLY ? ' --generated' : ''}\`; source: ${out.source === 'omr' ? `${[...real.values()].reduce((a, b) => a + b.length, 0)} converted LDraw OMR models` : 'our own forges only (no real models yet)'}._`, '');
if (!GENERATED_ONLY) {
    lines.push('### At a glance: real sets vs our forges', '', '| subject | real n | real w × l × h (studs, bricks) | ours w × l × h | real hollow | ours hollow | real wall | ours wall | real tiled tops | ours tiled tops | real pcs/step | ours pcs/step | real interiors | ours interiors |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of report) {
        const a = r.real, o = r.ours;
        const dims = (x) => (x ? `${x.proportions.wid ? x.proportions.wid[1] : '–'} × ${x.proportions.len ? x.proportions.len[1] : '–'} × ${x.proportions.hb ? x.proportions.hb[1] : '–'}` : '–');
        const ints = (x) => (x ? Object.entries(x.interiors).map(([k, v]) => `${k} ${pc(v.freq)}`).join(', ') || 'none' : '–');
        lines.push(`| ${r.id} | ${a.n} | ${dims(a)} | ${dims(o)} | ${pc(a.hollow.share)} | ${o ? pc(o.hollow.share) : '–'} | ${a.hollow.wall ? a.hollow.wall.median : 'solid'} | ${o && o.hollow.wall ? o.hollow.wall.median : 'solid'} | ${pc(a.techniques.tileTop)} | ${o ? pc(o.techniques.tileTop) : '–'} | ${a.buildOrder.perStep} | ${o ? o.buildOrder.perStep : '–'} | ${ints(a)} | ${ints(o)} |`);
    }
    lines.push('');
}
for (const r of report) {
    const a = r.real || r.ours, o = r.ours;
    lines.push(`### ${r.id}${r.real ? ` (${r.real.n} real: ${r.realModels.map((m) => `${m.id} ${m.name}`).join('; ')})` : ''}`, '');
    lines.push(`| metric | ${r.real ? 'real sets' : 'profile'} | ours (${o ? o.n : 0} forges: ${r.prompts.slice(0, 3).map((p) => `"${p}"`).join(', ')}) |`, '|---|---|---|');
    const row = (k, f) => lines.push(`| ${k} | ${f(a)} | ${o ? f(o) : '–'} |`);
    row('width × length (studs)', (x) => `${tr(x.proportions.wid)} × ${tr(x.proportions.len)}`);
    row('height (bricks)', (x) => tr(x.proportions.hb));
    row('pieces (structure)', (x) => tr(x.proportions.pieces));
    row('w:l, h:l', (x) => `${x.proportions.wl}, ${x.proportions.hl}`);
    row('base', (x) => `${x.proportions.base} (${Object.entries(x.proportions.baseShare).map(([k, v]) => `${k} ${pc(v)}`).join(', ')})`);
    row('hollow (air in envelope)', (x) => `${pc(x.hollow.share)} (interior ${pc(x.hollow.interior)} of the box)`);
    row('wall thickness', (x) => (x.hollow.wall ? `${x.hollow.wall.median} stud (1: ${pc(x.hollow.wall.s1)}, 2: ${pc(x.hollow.wall.s2)}, 3+: ${pc(x.hollow.wall.s3)})` : 'solid'));
    for (let i = 0; i < 3; i++) row(`${a.layers[i].band} band mix`, (x) => `${top3(x.layers[i].cats)}; ${x.layers[i].colors.slice(0, 3).map(([c, v]) => `${c} ${pc(v)}`).join(', ')}`);
    row('steps, pcs/step, steps/100 pcs', (x) => `${x.buildOrder.steps}, ${x.buildOrder.perStep}, ${x.buildOrder.per100}`);
    row('step vs height correlation', (x) => `${x.buildOrder.heightCorr}`);
    row('build phases (mean height, top parts)', (x) => x.buildOrder.phases.map((p) => `${p.h ?? '–'} ${Object.keys(p.cats)[0] || ''}`).join(' → '));
    row('interior / walls / roof at (progress)', (x) => `${x.buildOrder.interiorAt ?? '–'} / ${x.buildOrder.wallsAt ?? '–'} / ${x.buildOrder.roofAt ?? '–'}`);
    row('sub-assemblies', (x) => `${pc(x.buildOrder.subFreq)} of models, ${x.buildOrder.subsPer} per model, ${pc(x.buildOrder.subShare)} of pieces; roles ${x.buildOrder.roles.map(([k, v]) => `${k}×${v}`).join(', ') || '–'}`);
    row('interiors (freq, height, inside)', (x) => Object.entries(x.interiors).map(([k, v]) => `${k} ${pc(v.freq)} h${v.h} in${pc(v.inside)}`).join('; ') || 'none');
    row('tiled tops (tile / tile+studs)', (x) => `${pc(x.techniques.tileTop)} (tops: tile ${pc(x.techniques.topTile)}, studs ${pc(x.techniques.topStuds)}, slope ${pc(x.techniques.topSlope)})`);
    row('off-grid, sideways, brackets, hinges', (x) => `${pc(x.techniques.offGrid)}, ${pc(x.techniques.sideways)}, ${pc(x.techniques.snot)}, ${pc(x.techniques.hinge)}`);
    row('part mix', (x) => top3(x.techniques.cats) + ', ' + Object.entries(x.techniques.cats).slice(3, 7).map(([k, v]) => `${k} ${pc(v)}`).join(', '));
    lines.push('');
}
const auto = `<!-- AUTO:BEGIN (scripts/ldraw/analyse.mjs rewrites this block) -->\n${lines.join('\n')}\n<!-- AUTO:END -->`;
let doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '# How real sets are built (StudForge construction analysis)\n\n';
doc = /<!-- AUTO:BEGIN[\s\S]*<!-- AUTO:END -->/.test(doc) ? doc.replace(/<!-- AUTO:BEGIN[\s\S]*<!-- AUTO:END -->/, () => auto) : doc.trimEnd() + '\n\n## Per-subject numbers\n\n' + auto + '\n';
fs.mkdirSync(path.dirname(DOC), { recursive: true });
fs.writeFileSync(DOC, doc);
console.log(`${DOC} updated`);
