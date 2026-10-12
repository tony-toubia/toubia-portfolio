// Offline check of StudForge blueprints: the fixture designs in public/studforge/data/blueprints/*.json must
// validate, build through the generator (kind 'blueprint') with no overlapping or floating parts and at most two
// struts, and the validator must reject the malformed shapes the route guards against. The real-set examples in
// public/studforge/data/omr-blueprints/*.json (scripts/ldraw/to-blueprint.mjs) must validate and build the same way,
// and the DESIGN-mode user message (src/lib/studforge/omr-examples.ts) must carry the example for a subject that has
// one ("red fire truck") and nothing for an idea that has none.
// Usage: node scripts/studforge-blueprint-test.mjs          DETAIL=1 names offending parts
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = path.join(root, 'public/studforge/js') + '/';
const ctx = { console, Math, Object, Array, Set, Map, Number, JSON, String, Error };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['colors.js', 'parts-catalog.js', 'forge-grid.js', 'forge-modules.js', 'blueprint.js', 'forge-builders.js', 'forge-builders-2.js', ...fs.readdirSync(dir).filter((f) => /^forge-builders-\d+\.js$/.test(f) && !['forge-builders-2.js'].includes(f)).sort(), 'knowledge.js', 'generator.js']) vm.runInContext(fs.readFileSync(dir + f, 'utf8'), ctx, { filename: f });
const gen = new ctx.BrickGenerator(), B = ctx.FORGE.blueprint;
const MAX_STRUTS = 2;
let failed = 0;
const fail = (m) => { failed++; console.log('FAIL ' + m); };

/** The harness's geometry checks: overlapping cells and assemblies that never reach the ground. */
function geometry(m) {
    const solids = m.bricks.filter((b) => !b.ghost), fps = solids.map((b) => b.fp), occ = new Map();
    let overlaps = 0;
    const ovl = [];
    fps.forEach((f, i) => { for (let y = f.y0; y < f.y0 + f.hp; y++) for (let x = f.x0; x < f.x0 + f.w; x++) for (let z = f.z0; z < f.z0 + f.l; z++) { const k = `${x},${y},${z}`; if (occ.has(k)) { overlaps++; if (ovl.length < 6) ovl.push(`${solids[occ.get(k)].partId}@(${fps[occ.get(k)].x0},${fps[occ.get(k)].y0},${fps[occ.get(k)].z0}) x ${solids[i].partId}@(${f.x0},${f.y0},${f.z0})`); } else occ.set(k, i); } });
    const minY = Math.min(...fps.map((f) => f.y0));
    const parent = fps.map((_, i) => i); const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a]))); const union = (a, b) => { parent[find(a)] = find(b); };
    fps.forEach((f, i) => { for (let x = f.x0; x < f.x0 + f.w; x++) for (let z = f.z0; z < f.z0 + f.l; z++) { const d = occ.get(`${x},${f.y0 - 1},${z}`); if (d !== undefined) union(i, d); const u = occ.get(`${x},${f.y0 + f.hp},${z}`); if (u !== undefined) union(i, u); } });
    solids.forEach((b, i) => { if (!b.links) return; for (const [x, y, z] of b.links) { const o = occ.get(`${x},${y},${z}`); if (o !== undefined) union(i, o); } });
    const comps = new Map(); fps.forEach((f, i) => { const r = find(i); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(i); });
    const loose = [...comps.values()].filter((ids) => !ids.some((i) => fps[i].y0 === minY));
    const looseText = loose.map((ids) => ids.slice(0, 4).map((i) => `${solids[i].partId}/${solids[i].color}@(${fps[i].x0},${fps[i].y0},${fps[i].z0})`).join('+')).slice(0, 6);
    const struts = m.bricks.filter((b) => b.strut).map((b) => `${b.color}@(${b.fp.x0},${b.fp.y0},${b.fp.z0})x${b.fp.hp}`);
    return { overlaps, loose: loose.reduce((n, ids) => n + ids.length, 0), ovl, looseText, struts };
}

/* ── the fixtures ── */
const fixtures = path.join(root, 'public/studforge/data/blueprints');
const files = fs.readdirSync(fixtures).filter((f) => f.endsWith('.json')).sort();
if (!files.length) fail('no fixtures found');
for (const f of files) {
    const bp = JSON.parse(fs.readFileSync(path.join(fixtures, f), 'utf8'));
    const v = B.validate(bp);
    if (!v.ok) { fail(`${f}: does not validate: ${v.errors.join('; ')}`); continue; }
    if (v.bp.ops.length < 10 || v.bp.ops.length > 40) fail(`${f}: ${v.bp.ops.length} ops (want 10-40)`);
    // The route hands the client a cleaned blueprint (module x/z/y inside params): it must validate again as-is.
    const again = B.validate(v.bp);
    if (!again.ok || JSON.stringify(again.bp) !== JSON.stringify(v.bp)) fail(`${f}: a cleaned blueprint does not re-validate unchanged: ${again.errors.join('; ')}`);
    let m;
    try { m = gen.generateFromPrompt(bp.name.toLowerCase(), 0, { blueprint: bp }); } catch (e) { fail(`${f}: build threw ${e.message}\n${e.stack.split('\n').slice(1, 3).join('\n')}`); continue; }
    const g = geometry(m), an = m.anchor || { struts: 0, maxStrut: 0 };
    const ok = m.kind === 'blueprint' && m.name === bp.name && !g.overlaps && !g.loose && an.struts <= MAX_STRUTS && !(m.warnings || []).length;
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${f.padEnd(16)} ${String(m.bricks.length).padStart(4)} pcs ${String(m.dims.w + 'x' + m.dims.d + 'x' + m.dims.h).padEnd(9)} ovl=${g.overlaps} loose=${g.loose} struts=${an.struts}${an.maxStrut ? '/' + an.maxStrut + 'p' : ''} kind=${m.kind} "${m.name}"${(m.warnings || []).length ? ' warnings: ' + m.warnings.join('; ') : ''}`);
    if (process.env.DETAIL || !ok) { if (g.ovl.length) console.log('     overlaps: ' + g.ovl.join('; ')); if (g.looseText.length) console.log('     loose: ' + g.looseText.join('; ')); if (g.struts.length) console.log('     struts: ' + g.struts.join(' ')); }
}

/* ── the real-set examples the route puts in front of Claude ── */
const exDir = path.join(root, 'public/studforge/data/omr-blueprints');
const exIndex = fs.existsSync(path.join(exDir, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(exDir, 'index.json'), 'utf8')) : { examples: [] };
if (!exIndex.examples.length) console.log('--   no real-set examples shipped (public/studforge/data/omr-blueprints)');
for (const e of exIndex.examples) {
    const file = path.join(exDir, e.file);
    if (!fs.existsSync(file)) { fail(`example ${e.file} listed in the index is missing`); continue; }
    const raw = fs.readFileSync(file, 'utf8'), ex = JSON.parse(raw);
    const meta = ['setId', 'name', 'year', 'subject', 'authors', 'licence', 'blueprint', 'fidelity'].filter((k) => ex[k] === undefined);
    if (meta.length) fail(`${e.file}: missing ${meta.join(', ')}`);
    if (!/CC BY/.test(ex.licence || '')) fail(`${e.file}: licence ${ex.licence} is not CC BY`);
    if (raw.length > 7000) fail(`${e.file}: ${raw.length} bytes (keep an example under ~6 KB: it goes into the prompt)`);
    const v = B.validate(ex.blueprint);
    if (!v.ok) { fail(`${e.file}: does not validate: ${v.errors.join('; ')}`); continue; }
    let m;
    try { m = gen.generateFromPrompt(ex.name.toLowerCase(), 0, { blueprint: ex.blueprint }); } catch (err) { fail(`${e.file}: build threw ${err.message}`); continue; }
    const g = geometry(m), an = m.anchor || { struts: 0, maxStrut: 0 };
    const ok = m.kind === 'blueprint' && !g.overlaps && !g.loose && an.struts <= MAX_STRUTS && !(m.warnings || []).length;
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} example ${ex.setId.padEnd(9)} ${String(ex.subject).padEnd(12)} ${String(v.bp.ops.length).padStart(2)} ops ${String(m.bricks.length).padStart(4)} pcs ovl=${g.overlaps} loose=${g.loose} struts=${an.struts} iou=${ex.fidelity && ex.fidelity.iou} ${raw.length}B "${ex.name}"${(m.warnings || []).length ? ' warnings: ' + m.warnings.join('; ') : ''}`);
    if (process.env.DETAIL || !ok) { if (g.ovl.length) console.log('     overlaps: ' + g.ovl.join('; ')); if (g.looseText.length) console.log('     loose: ' + g.looseText.join('; ')); if (g.struts.length) console.log('     struts: ' + g.struts.join(' ')); }
}

/* ── the composed DESIGN-mode user message: the example for "red fire truck", none for nonsense ── */
{
    ctx.STUDFORGE_KNOWLEDGE = JSON.parse(fs.readFileSync(path.join(root, 'public/studforge/data/knowledge.json'), 'utf8'));
    const lib = await import(path.join(root, 'src/lib/studforge/omr-examples.ts'));
    // The route reads the shipped examples; when none is for fire trucks yet, a stand-in example (a fixture) proves the wiring.
    let dirUsed = exDir;
    if (!lib.exampleFor('fireTruck', 0, exDir)) {
        dirUsed = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'sf-omr-'));
        const bp = JSON.parse(fs.readFileSync(path.join(fixtures, 'fire-truck.json'), 'utf8'));
        fs.writeFileSync(path.join(dirUsed, 'test-1.json'), JSON.stringify({ setId: 'test-1', name: 'Test Fire Truck', year: 2000, subject: 'fireTruck', label: 'fire truck', labelPlural: 'fire trucks', authors: ['test'], licence: 'CC BY 2.0', blueprint: bp, fidelity: {} }));
        fs.writeFileSync(path.join(dirUsed, 'index.json'), JSON.stringify({ examples: [{ file: 'test-1.json' }] }));
    }
    const subjectOf = (p) => { const s = ctx.FORGE.knowledge.subjectFor(p); return s ? { id: s.id, n: s.n, palette: (s.palette || []).slice(0, 8), pieces: s.pieces || null, parts: (s.parts || []).slice(0, 12).map((x) => [x[0], x[1]]) } : null; };
    const compose = (p) => { const s = subjectOf(p); return { s, msg: lib.blueprintUserMessage(p, 0, s, lib.exampleFor(s && s.id, 0, dirUsed)) }; };
    const truck = compose('red fire truck'), junk = compose('zxqv plorb');
    const ex = lib.exampleFor('fireTruck', 0, dirUsed);
    if (!truck.s || truck.s.id !== 'fireTruck') fail(`"red fire truck" resolved to subject ${truck.s && truck.s.id}`);
    else if (!truck.msg.includes(`Here is how a real fire truck set (${ex.setId} ${ex.name}`) || !truck.msg.includes('"ops": [') || !truck.msg.includes('not a copy')) fail('the fire truck message does not carry the real-set example:\n' + truck.msg.slice(0, 400));
    else console.log(`OK   "red fire truck" message carries example ${ex.setId} (${truck.msg.length} chars${dirUsed === exDir ? '' : ', stand-in example'})`);
    if (junk.s) fail(`nonsense prompt resolved to subject ${junk.s.id}`);
    else if (junk.msg.includes('Here is how a real') || junk.msg !== 'Idea: zxqv plorb') fail('the nonsense message is not the plain idea: ' + junk.msg);
    else console.log('OK   a nonsense idea gets the plain message, no example');
    const credited = lib.withCredit('A'.repeat(230), ex);
    if (credited.length > 220 || !credited.includes(`set ${ex.setId}`)) fail(`credit does not fit: ${credited.length} chars`); else console.log(`OK   credit fits the description limit: "...${credited.slice(-70)}"`);
    if (dirUsed !== exDir) fs.rmSync(dirUsed, { recursive: true, force: true });
}

/* ── validation discipline: the shapes the route must refuse ── */
const good = JSON.parse(fs.readFileSync(path.join(fixtures, files[0]), 'utf8'));
const expectBad = (label, bp) => { const v = B.validate(bp); if (v.ok) fail(`validate accepted ${label}`); else console.log(`OK   rejects ${label}: ${v.errors[0]}`); };
expectBad('a non-object', 'nope');
expectBad('a missing base', { name: 'x', ops: good.ops });
expectBad('an unknown base colour', { ...good, base: { w: 8, d: 8, color: 'MAUVE' } });
expectBad('empty ops', { ...good, ops: [] });
expectBad('too many ops', { ...good, ops: Array.from({ length: 61 }, () => good.ops[1]) });
expectBad('an unknown op', { ...good, ops: [{ op: 'sphere', x: 1 }] });
expectBad('an unknown module', { ...good, ops: [{ op: 'module', id: 'warpDrive', x: 1, z: 1, y: 1 }] });
expectBad('an unknown part', { ...good, ops: [{ op: 'part', id: '00000', color: 'RED', x: 1, z: 1, y: 1 }] });
expectBad('an unknown colour', { ...good, ops: [{ op: 'box', x0: 0, x1: 1, z0: 0, z1: 1, y0: 1, y1: 2, color: 'MAUVE' }] });
expectBad('a module missing y', { ...good, ops: [{ op: 'module', id: 'headlight', x: 1, z: 1 }] });
expectBad('a roof of unknown kind', { ...good, ops: [{ op: 'roof', kind: 'dome', x0: 0, x1: 4, z0: 0, z1: 4, y: 3, color: 'RED' }] });
// Clamping: a box reaching past the ceiling is kept but clipped, unknown params and bad choices are dropped.
const clamped = B.validate({ ...good, base: { w: 80, d: 10, color: 'RED' }, ops: [{ op: 'box', x0: 0, x1: 200, z0: 0, z1: 1, y0: 1, y1: 999, color: 'RED' }, { op: 'module', id: 'realWindow', x: 1, z: 1, y: 1, params: { size: '9x9', face: 'front', bogus: 1 } }] });
if (!clamped.ok) fail('clamping rejected a clampable blueprint: ' + clamped.errors.join('; '));
else {
    const [box, win] = clamped.bp.ops;
    if (clamped.bp.base.w !== B.LIMITS.base) fail(`base not clamped: ${JSON.stringify(clamped.bp.base)}`);
    if (box.x1 !== B.LIMITS.xz[1] || box.y1 !== B.LIMITS.y) fail(`box not clamped: ${JSON.stringify(box)}`);
    else if ('size' in win.params || 'bogus' in win.params || win.params.face !== 'front') fail(`module params not cleaned: ${JSON.stringify(win.params)}`);
    else console.log('OK   clamps out-of-range sizes and drops unknown params');
}
// The generator falls through to an ordinary forge when the blueprint is bad, so the page always gets a model.
const fallthrough = gen.generateFromPrompt('red fire truck', 0, { blueprint: { nope: true } });
if (fallthrough.kind === 'blueprint') fail('generator built a bad blueprint'); else console.log(`OK   bad blueprint falls through to a ${fallthrough.kind} forge`);

console.log(failed ? `\n${failed} FAILED` : '\nall blueprint checks passed');
process.exit(failed ? 1 : 0);
