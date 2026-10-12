#!/usr/bin/env node
// OMR converter: turn LDraw Official Model Repository files (.mpd/.ldr) into StudForge's "studforge-omr-1" format.
//
//   node scripts/ldraw/omr-convert.mjs --lib <ldraw dir> --cache <omr cache dir> --out public/studforge/data/omr
//        [--only 6285-1,60061-1] [--verify 6285-1,...] [--parts-used <file>]
//
// Reads <cache>/selection.json (written by omr-fetch.mjs) and <cache>/files/<file>. For each model:
//  1. parse the multi-file MPD (0 FILE / 0 NOFILE / 0 !DATA sections, 0 STEP / 0 ROTSTEP), case-insensitive refs;
//  2. flatten it to world transforms in real build order: a submodel's own steps are laid out where the parent first
//     places it (before that parent step), repeat placements drop all their parts into the placing parent step;
//  3. resolve every reference: submodel, library part, embedded part (.dat inside the MPD: stickered parts are
//     unwrapped to their library base part, pure stickers dropped), or unknown (dropped and counted);
//  4. map LDraw part ids to the StudForge catalog and LDraw colours to window.LEGO_COLORS;
//  5. compute each part's world bounding box from the library geometry (own minimal recursive bbox) and snap the
//     grid-aligned ones (upright, 90° lattice about Y) to a stud/plate footprint; shift the model to start at 0,0,0.
// Downloads are untrusted data: they are only parsed as text, never executed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const LIB = path.resolve(arg('lib', 'ldraw'));
const CACHE = path.resolve(arg('cache', 'omr-cache'));
const OUT = path.resolve(arg('out', path.join(ROOT, 'public/studforge/data/omr')));
const ONLY = arg('only', '') ? new Set(arg('only').split(',')) : null;
const VERIFY = new Set((arg('verify', '') || '').split(',').filter(Boolean));
const PARTS_USED = arg('parts-used', path.join(CACHE, 'parts-used.txt'));

// ------------------------------------------------------------------ StudForge vocabulary (catalog + colours)
function loadBrowserGlobal(file, expr) {
  const src = fs.readFileSync(path.join(ROOT, 'public/studforge/js', file), 'utf8');
  const window = {};
  return new Function('window', `${src}\n;return ${expr};`)(window);
}
const CATALOG = loadBrowserGlobal('parts-catalog.js', 'window.LEGO_PARTS');
const COLORS = loadBrowserGlobal('colors.js', 'LEGO_COLORS');

// ------------------------------------------------------------------ LDraw library access
const norm = (s) => s.trim().toLowerCase().replace(/\\/g, '/');
const libCache = new Map();
// Parse one library file: title line, ~Moved to target, category, geometry vertices and sub-file references.
function parseDat(text) {
  const out = { title: '', category: '', moved: null, verts: [], refs: [] };
  let first = true;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const t = line[0];
    if (t === '0') {
      if (first) { out.title = line.slice(1).trim(); first = false; const m = out.title.match(/^~Moved to\s+(\S+)/i); if (m) out.moved = norm(m[1]).replace(/\.dat$/, ''); }
      const c = line.match(/^0\s+!CATEGORY\s+(.*)$/i); if (c) out.category = c[1].trim();
      continue;
    }
    first = false;
    const f = line.split(/\s+/);
    if (t === '1') {
      const n = f.slice(2, 14).map(Number);
      out.refs.push({ color: f[1], m: [n[3], n[4], n[5], n[6], n[7], n[8], n[9], n[10], n[11]], t: [n[0], n[1], n[2]], file: norm(f.slice(14).join(' ')) });
    } else if (t === '3' || t === '4') {
      const k = t === '3' ? 3 : 4;
      for (let i = 0; i < k; i++) out.verts.push(+f[2 + i * 3], +f[3 + i * 3], +f[4 + i * 3]);
    }
  }
  return out;
}
function libPath(name) {
  name = norm(name);
  for (const dir of ['parts', 'p']) {
    const p = path.join(LIB, dir, name);
    if (fs.existsSync(p)) return { path: p, isPart: dir === 'parts' && !name.startsWith('s/') };
  }
  return null;
}
function libFile(name) {
  name = norm(name);
  if (libCache.has(name)) return libCache.get(name);
  const lp = libPath(name);
  const v = lp ? { ...parseDat(fs.readFileSync(lp.path, 'latin1')), isPart: lp.isPart, name } : null;
  libCache.set(name, v);
  return v;
}
const partExists = (id) => !!libPath(id + '.dat') && libPath(id + '.dat').isPart;
// Follow "~Moved to" chains (old ids still appear in older OMR files).
function canonical(id) {
  const seen = new Set();
  while (!seen.has(id)) { seen.add(id); const f = libFile(id + '.dat'); if (f && f.moved) id = f.moved; else break; }
  return id;
}

// ------------------------------------------------------------------ bounding boxes (own minimal implementation)
// A 3x3 matrix is "monomial" when every row has exactly one non-zero entry (a signed axis permutation, maybe scaled):
// the transformed bbox corners are then exact. Otherwise we transform the child's actual vertices.
const isMonomial = (m) => { for (let r = 0; r < 3; r++) { let nz = 0; for (let c = 0; c < 3; c++) if (Math.abs(m[r * 3 + c]) > 1e-6) nz++; if (nz !== 1) return false; } return true; };
const apply = (m, t, x, y, z) => [m[0] * x + m[1] * y + m[2] * z + t[0], m[3] * x + m[4] * y + m[5] * z + t[1], m[6] * x + m[7] * y + m[8] * z + t[2]];
const bboxMemo = new Map(), vertMemo = new Map();
function getFile(name, embedded) { return (embedded && embedded.get(name)) || libFile(name); }
function fileBBox(name, embedded, depth = 0) {
  const key = (embedded && embedded.has(name) ? embedded.tag + '|' : '') + name;
  if (bboxMemo.has(key)) return bboxMemo.get(key);
  const f = getFile(name, embedded);
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const add = (x, y, z) => { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (z < b[2]) b[2] = z; if (x > b[3]) b[3] = x; if (y > b[4]) b[4] = y; if (z > b[5]) b[5] = z; };
  if (f && depth < 40) {
    for (let i = 0; i < f.verts.length; i += 3) add(f.verts[i], f.verts[i + 1], f.verts[i + 2]);
    for (const r of f.refs) {
      if (isMonomial(r.m)) {
        const cb = fileBBox(r.file, embedded, depth + 1);
        if (!isFinite(cb[0])) continue;
        for (const x of [cb[0], cb[3]]) for (const y of [cb[1], cb[4]]) for (const z of [cb[2], cb[5]]) add(...apply(r.m, r.t, x, y, z));
      } else {
        const v = fileVerts(r.file, embedded, depth + 1);
        for (let i = 0; i < v.length; i += 3) add(...apply(r.m, r.t, v[i], v[i + 1], v[i + 2]));
      }
    }
  }
  bboxMemo.set(key, b);
  return b;
}
function fileVerts(name, embedded, depth = 0) {
  const key = (embedded && embedded.has(name) ? embedded.tag + '|' : '') + name;
  if (vertMemo.has(key)) return vertMemo.get(key);
  const f = getFile(name, embedded);
  const out = [];
  if (f && depth < 40) {
    out.push(...f.verts);
    for (const r of f.refs) { const v = fileVerts(r.file, embedded, depth + 1); for (let i = 0; i < v.length; i += 3) out.push(...apply(r.m, r.t, v[i], v[i + 1], v[i + 2])); }
  }
  vertMemo.set(key, out);
  return out;
}

// ------------------------------------------------------------------ colours: LDConfig -> LEGO_COLORS
const LDCONFIG = (() => {
  const map = new Map(); let legoId = null;
  for (const line of fs.readFileSync(path.join(LIB, 'LDConfig.ldr'), 'utf8').split(/\r?\n/)) {
    const l = line.match(/LEGOID\s+(\d+)/); if (l) { legoId = +l[1]; continue; }
    const m = line.match(/!COLOUR\s+(\S+)\s+CODE\s+(\d+)\s+VALUE\s+#([0-9A-Fa-f]{6})(.*)$/);
    if (!m) continue;
    map.set(+m[2], { name: m[1], hex: m[3], trans: /ALPHA\s+\d+/.test(m[4]), legoId });
    legoId = null;
  }
  return map;
})();
const rgb = (hex) => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
function lab([r, g, b]) {
  const f = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const [R, G, B] = [f(r), f(g), f(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))];
}
const OUR = Object.entries(COLORS).map(([k, v]) => ({ key: k, legoId: v.id, name: v.name.toLowerCase(), trans: v.category === 'Transparent', lab: lab(rgb(v.hex.slice(1))) }));
// Where nearest-in-Lab picks the wrong family for our 21-colour palette (metallics read as grey, pale blues as blue).
const COLOUR_OVERRIDE = { Chrome_Silver: 'LIGHT_GREY', Metallic_Silver: 'LIGHT_GREY', Pearl_Silver: 'LIGHT_GREY', Flat_Silver: 'LIGHT_GREY',
  Pearl_Light_Grey: 'LIGHT_GREY', Trans_Brown: 'TRANS_CLEAR', Trans_Black: 'TRANS_CLEAR', Medium_Blue: 'BLUE', Light_Blue: 'BLUE',
  Sky_Blue: 'BLUE', Medium_Azure: 'BLUE', Dark_Azure: 'BLUE', Dark_Tan: 'TAN' };
const colourMemo = new Map(), colourHow = new Map(), colourUse = new Map();
function ourColour(code, hexOverride) {
  const key = hexOverride || code;
  if (colourMemo.has(key)) return colourMemo.get(key);
  let res;
  const c = hexOverride ? { hex: hexOverride, trans: false, name: '', legoId: null } : LDCONFIG.get(code);
  if (!c) res = 'LIGHT_GREY';
  else {
    const pool = OUR.filter(o => o.trans === c.trans);
    const nm = c.name.toLowerCase().replace(/_/g, ' ');
    const manual = COLOUR_OVERRIDE[c.name];
    const exact = manual ? { key: manual, legoId: null } : pool.find(o => c.legoId != null && o.legoId === c.legoId) || pool.find(o => o.name === nm || o.name.replace(/-/g, ' ') === nm || o.key.toLowerCase().replace(/_/g, ' ') === nm);
    if (exact) { res = exact.key; colourHow.set(key, manual ? 'override' : c.legoId != null && exact.legoId === c.legoId ? 'LEGO id' : 'name'); }
    else {
      const L = lab(rgb(c.hex)); let best = null, bd = Infinity;
      for (const o of pool) { const d = (o.lab[0] - L[0]) ** 2 + (o.lab[1] - L[1]) ** 2 + (o.lab[2] - L[2]) ** 2; if (d < bd) { bd = d; best = o.key; } }
      res = best; colourHow.set(key, 'nearest');
    }
  }
  colourMemo.set(key, res);
  return res;
}

// ------------------------------------------------------------------ part ids: LDraw -> render id + catalog id
// Pattern / sticker-shortcut suffixes: 3069bp01, 3626bpr0001, 973p11, 3001pat0001, 3068bd01 (only when the base exists).
const PATTERN_RES = [/^(.+?)pr\d{3,}[a-z]?$/, /^(.+?)pat\d{3,}[a-z]?$/, /^(.+?)p[0-9a-z]{2,4}$/, /^(.+?)d\d{2,3}[a-z]?$/];
// Known shape equivalents between LDraw ids and our catalog ids (older moulds / renumbered parts).
const EQUIV = { '3794a': '15573', '3794b': '15573', '3794': '15573', '6141': '4073', '3065': '3004', '3066': '3010', '3067': '3009',
  '6143': '3941', '4150': '14769', '4589': '59900', '4589b': '59900', '87994': '30374', '3957a': '3957', '4085a': '4085', '4085b': '4085',
  '4085c': '4085', '2412a': '2412', '2412b': '2412', '30039': '3070', '4073': '4073', '3070a': '3070', '3070b': '3070',
  '60601': '60601', '60602': '60602', '4276b': '44302', '4275b': '44301', '4276a': '44302', '4275a': '44301' };
function depattern(id) {
  for (const re of PATTERN_RES) { const m = id.match(re); if (m && partExists(m[1])) return m[1]; }
  return null;
}
const renderMemo = new Map();
// The id the viewer renders with baked geometry: canonical (moved-to) and de-patterned when the plain base exists
// (we render one colour per part, so print detail is lost anyway and the baker has far fewer parts to bake).
function renderId(id) {
  if (renderMemo.has(id)) return renderMemo.get(id);
  let r = canonical(id);
  const b = depattern(r); if (b) r = canonical(b);
  renderMemo.set(id, r);
  return r;
}
// Reverse "moved" map for catalog ids: our 4073 is LDraw's "~Moved to 6141", so LDraw 6141 -> our 4073.
const REVERSE = new Map();
for (const cid of Object.keys(CATALOG)) { const c = canonical(cid); if (c !== cid) REVERSE.set(c, cid); }
const catMemo = new Map();
function catalogId(id) {
  if (catMemo.has(id)) return catMemo.get(id);
  const tried = []; const queue = [id, canonical(id), renderId(id)];
  let found = null;
  while (queue.length && !found) {
    const c = queue.shift();
    if (!c || tried.includes(c)) continue;
    tried.push(c);
    if (CATALOG[c]) { found = c; break; }
    if (c in EQUIV) { if (EQUIV[c] && CATALOG[EQUIV[c]]) { found = EQUIV[c]; break; } }
    if (REVERSE.has(c)) { found = REVERSE.get(c); break; }
    const strip = c.match(/^(\d+)[a-z]$/); if (strip) queue.push(strip[1]);
    for (const re of PATTERN_RES) { const m = c.match(re); if (m) queue.push(m[1]); }
    const comp = c.match(/^(.+?)c\d{2}$/); if (comp) queue.push(comp[1]);
  }
  catMemo.set(id, found);
  return found;
}
const isMinifigPart = (f) => !!f && (/^_?minifig/i.test(f.title) || /^minifig/i.test(f.category));
const isSticker = (f) => !!f && (/^_?sticker/i.test(f.title) || /^sticker/i.test(f.category));

// ------------------------------------------------------------------ MPD parsing
function parseMPD(src) {
  const files = new Map(); const order = []; let cur = null;
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^0\s+FILE\s+(.+)$/i))) { cur = norm(m[1]); if (!files.has(cur)) { files.set(cur, []); order.push(cur); } else files.set(cur, []); continue; }
    if (/^0\s+NOFILE\b/i.test(line)) { cur = null; continue; }
    if (/^0\s+!DATA\b/i.test(line)) { cur = '__data__'; continue; }
    if (cur === '__data__') continue;
    if (cur === null) { if (!order.length) { cur = '__main__'; files.set(cur, []); order.push(cur); } else continue; }
    files.get(cur).push(line);
  }
  return { files, main: order[0] };
}
// A section of the MPD is a model (submodel) unless it declares itself a part or is named *.dat with geometry.
function sectionKind(lines, name) {
  const org = lines.find(l => /^0\s+!LDRAW_ORG\b/i.test(l)) || '';
  if (/model/i.test(org)) return 'model';
  if (/part|shortcut|subpart|primitive/i.test(org)) return 'part';
  return /\.dat$/.test(name) ? 'part' : 'model';
}
// Steps of a model section: groups of reference lines separated by 0 STEP / 0 ROTSTEP; empty groups are skipped.
function stepGroups(lines) {
  const groups = []; let cur = []; let raw = 0;
  for (const l of lines) {
    if (/^0\s+(STEP|ROTSTEP)\b/i.test(l)) { raw++; if (cur.length) groups.push(cur); cur = []; continue; }
    if (l.startsWith('1 ')) cur.push(l);
  }
  if (cur.length) groups.push(cur);
  return { groups, raw };
}
const parseRef = (l) => { const f = l.split(/\s+/); const n = f.slice(2, 14).map(Number); return { color: f[1], t: [n[0], n[1], n[2]], m: [n[3], n[4], n[5], n[6], n[7], n[8], n[9], n[10], n[11]], file: norm(f.slice(14).join(' ')) }; };
// "6285 - 4081b.dat" -> "4081b.dat", "s/6285 - 2528s01.dat" -> "s/2528s01.dat": MPD-embedded files carry the set prefix.
const stripSet = (f) => f.replace(/^(s\/)?[\w-]*\d[\w-]*\s+-\s+/, '$1');
const mul = (A, B) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]));
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const det3 = (m) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
// The 24 proper rotations of the cube (signed permutation matrices with determinant +1).
const LATTICE = (() => {
  const out = [];
  for (const perm of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) for (let sgn = 0; sgn < 8; sgn++) {
    const m = new Array(9).fill(0);
    perm.forEach((c, r) => { m[r * 3 + c] = (sgn >> r) & 1 ? -1 : 1; });
    if (det3(m) > 0) out.push(m);
  }
  return out;
})();
// Snap an upright placement's rotation about Y to the 90° lattice and its X/Z position to half studs; true if changed.
function squareY(r) {
  const m = r.m, near = (a, b) => Math.abs(a - b) < 0.01;
  if (!near(m[4], 1) || !near(m[1], 0) || !near(m[3], 0) || !near(m[5], 0) || !near(m[7], 0)) return false;
  const ang = Math.atan2(m[2], m[0]);
  const q = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
  if (Math.abs(ang - q) < 0.01) return false;
  const c = Math.round(Math.cos(q)), s = Math.round(Math.sin(q));
  r.m = [c, 0, s, 0, 1, 0, -s, 0, c];
  r.t = [Math.round(r.t[0] / 10) * 10, r.t[1], Math.round(r.t[2] / 10) * 10];
  return true;
}

// ------------------------------------------------------------------ one model
function convertModel(sel) {
  const buf = fs.readFileSync(path.join(CACHE, 'files', sel.file.replace(/[^\w.\- ]/g, '_')));
  let text = buf.toString('utf8');
  if (text.includes('\uFFFD')) text = buf.toString('latin1'); // older files are Latin-1
  const { files, main } = parseMPD(text);
  // Embedded parts become a lookup for the bbox code (their geometry may reference library primitives).
  const embedded = new Map(); embedded.tag = sel.id;
  for (const [name, lines] of files) if (sectionKind(lines, name) === 'part') embedded.set(name, { ...parseDat(lines.join('\n')), isPart: true, name });
  const isModel = (name) => files.has(name) && !embedded.has(name);

  const subNames = []; const subIdx = new Map();
  const subOf = (name) => {
    if (!subIdx.has(name)) {
      let label = name === main ? 'main' : name.replace(/\.(ldr|mpd|dat)$/, '').replace(/^[\w-]*\d[\w-]*\s+-\s+/, '').trim() || name;
      subIdx.set(name, subNames.length); subNames.push(label);
    }
    return subIdx.get(name);
  };
  const raw = []; // { id, color, M, t, step, sub, minifig }
  const dropped = {}; let stickers = 0, embeddedOfficial = 0, lsynth = 0;
  const minifigSubs = (name) => /minifig|figure|\bfig\b|\bman\b|\bdriver\b|\bpilot\b/i.test(name);
  let gstep = 0; let expectedSteps = 0, rawStepLines = 0, squared = 0;
  const expanded = new Set();
  // Which top-level placement a part descends from: separate display items (vehicle, minifigs, base) each get their own
  // grid phase, since the main file puts them down at arbitrary half-stud / plate offsets.
  let curGroup = 'main';
  const angledTop = files.get(main).filter(l => l.startsWith('1 ')).map(parseRef).filter(r => isModel(r.file) && squareY({ ...r })).length;
  const resolveCol = (c, parent) => {
    if (c === '16' || c === '24') return parent;
    if (/^0x2[0-9a-f]{6}$/i.test(c)) return { hex: c.slice(3).toUpperCase() };
    return +c;
  };
  // Emit a part-ish reference; embedded parts are unwrapped to their library parts when they have any.
  function emitPart(ref, M, t, col, step, sub, inFig, depth = 0) {
    let file = ref.file;
    // MPDs often embed copies of official parts (LDCad writes its own header, sometimes with a non-CC licence):
    // reference the official library part instead, so nothing from the embedded copy is used.
    if (embedded.has(file)) { const st = stripSet(file); const lf = libFile(st); if (lf && lf.isPart) { file = st; embeddedOfficial++; } }
    const e = embedded.get(file);
    if (e) {
      if (isSticker(e)) { stickers++; return; }
      // LSynth hose/string segments: one flexible part drawn as dozens of generated segments; not a piece.
      if (/^~?lsynth/i.test(e.title) || /^ls\d+$/.test(stripSet(file).replace(/\.dat$/, ''))) { lsynth++; return; }
      const libRefs = e.refs.filter(r => { const lf = libFile(r.file); return lf && lf.isPart; });
      if (libRefs.length && depth < 4) {
        for (const r of libRefs) {
          const lf = libFile(r.file);
          if (isSticker(lf)) { stickers++; continue; }
          emitPart(r, mul(M, r.m), apply(M, t, ...r.t), resolveCol(r.color, col), step, sub, inFig, depth + 1);
        }
        return;
      }
      // A true embedded unofficial part: keep it under its own name (stripped of the set prefix).
      const id = stripSet(file).replace(/\.dat$/, '');
      raw.push({ id, file, embedded: true, color: col, M, t, step, sub, grp: curGroup, minifig: inFig || isMinifigPart(e) });
      return;
    }
    const lf = libFile(file);
    if (!lf || !lf.isPart) { const k = file; dropped[k] = (dropped[k] || 0) + 1; return; }
    if (isSticker(lf)) { stickers++; return; }
    raw.push({ id: file.replace(/\.dat$/, ''), file, color: col, M, t, step, sub, grp: curGroup, minifig: inFig || isMinifigPart(lf) });
  }
  // Place a model section. mode 'expand': lay out its own steps; otherwise mode is the fixed step number for all parts.
  function place(name, M, t, col, mode, inFig, depth = 0) {
    if (depth > 30) return;
    const lines = files.get(name);
    const sub = subOf(name);
    const fig = inFig || minifigSubs(name);
    const { groups, raw: rawCount } = stepGroups(lines);
    if (mode === 'expand') { expectedSteps += groups.length; rawStepLines += rawCount; }
    groups.forEach((g, gi) => {
      const refs = g.map(parseRef);
      // OMR main files often stand the finished vehicle at a display angle next to its minifigs ("1 14 127.9 -24 53
      // 0.866 0 -0.5 ..."). Square such top-level sub-assembly placements to the nearest 90° and half stud so the grid
      // footprint stays meaningful; the sub-assembly itself is untouched.
      // Only when a single item is posed that way: several angled items are a deliberate arrangement (a train on curved
      // track) that squaring would pile into each other.
      if (depth === 0 && angledTop <= 1) for (const r of refs) if (isModel(r.file) && squareY(r)) squared++;
      const firstHere = new Set();
      if (mode === 'expand') {
        // Sub-assemblies first placed in this step are built (their own steps) before this step.
        refs.forEach((r, i) => {
          if (isModel(r.file) && !expanded.has(r.file)) {
            expanded.add(r.file); firstHere.add(i);
            if (depth === 0) curGroup = `${gi}:${i}`;
            place(r.file, mul(M, r.m), apply(M, t, ...r.t), resolveCol(r.color, col), 'expand', fig, depth + 1);
          }
        });
      }
      const step = mode === 'expand' ? gstep++ : mode;
      refs.forEach((r, i) => {
        if (firstHere.has(i)) return;
        if (depth === 0) curGroup = isModel(r.file) ? `${gi}:${i}` : 'main';
        const M2 = mul(M, r.m), t2 = apply(M, t, ...r.t), c2 = resolveCol(r.color, col);
        if (isModel(r.file)) place(r.file, M2, t2, c2, step, fig, depth + 1);
        else emitPart(r, M2, t2, c2, step, sub, fig);
      });
    });
  }
  expanded.add(main);
  place(main, I3, [0, 0, 0], 7, 'expand', false);

  // Some older OMR files pose the whole model at a display tilt (every part carries e.g. a 17° rotation about X).
  // Find the most common "global" rotation G (each part R = G·L with L on the 90° lattice) and undo it.
  let untilted = null;
  {
    const votes = new Map();
    for (const p of raw) {
      let best = null, bt = -Infinity;
      for (const L of LATTICE) { let tr = 0; for (let k = 0; k < 9; k++) tr += p.M[k] * L[k]; if (tr > bt) { bt = tr; best = L; } }
      const G = mul(p.M, transpose(best));
      const key = G.map(v => Math.round(v * 50) / 50).join(',');
      const e = votes.get(key) || { n: 0, G }; e.n++; votes.set(key, e);
    }
    const top = [...votes.values()].sort((a, b) => b.n - a.n)[0];
    const idKey = I3.join(',');
    const idVotes = (votes.get(idKey) || { n: 0 }).n;
    if (top && top.n >= raw.length * 0.25 && top.n > idVotes && Math.abs(top.G[0] + top.G[4] + top.G[8] - 3) > 0.002) {
      const Gt = transpose(top.G);
      for (const p of raw) { p.M = mul(Gt, p.M); p.t = apply(Gt, [0, 0, 0], ...p.t); }
      untilted = top.G.map(v => Math.round(v * 1000) / 1000);
    }
  }

  // --- per part: ids, colour, world transform (our axes), world bbox, footprint
  const C = (v) => [v[0] / 20, -v[1] / 20, -v[2] / 20];
  const rotOurs = (M) => [M[0], -M[1], -M[2], -M[3], M[4], M[5], -M[6], M[7], M[8]]; // C·M·C with C = diag(1,-1,-1)
  const parts = []; const partIdx = new Map(); const colors = []; const colorIdx = new Map(); const minifigParts = new Set();
  const items = raw.map(p => {
    const rid = p.embedded ? (depattern(p.id) ? renderId(depattern(p.id)) : p.id) : renderId(p.id);
    const cid = catalogId(p.embedded ? rid : p.id);
    // parts[k] = [renderId, catalogId, originalId (when the file used a printed/old id), flag ('baseplate'|'minifig')]
    const orig = p.id !== rid ? p.id : null;
    const key = rid + '|' + (cid || '') + '|' + (orig || '');
    if (!partIdx.has(key)) {
      partIdx.set(key, parts.length);
      const lf = libFile(rid + '.dat');
      // Flags: baseplates (huge to bake: drawn procedurally) and flexible-hose segments (one real hose = many segments,
      // so they are not counted as pieces).
      const flag = !lf ? null : /^_?baseplate/i.test(lf.title) ? 'baseplate' : /^~.*\b(segment|section)\b/i.test(lf.title) ? 'segment' : null;
      parts.push([rid, cid, orig, flag]);
    }
    const pi = partIdx.get(key);
    if (p.minifig) minifigParts.add(pi);
    const ck = typeof p.color === 'object' ? ourColour(null, p.color.hex) : ourColour(p.color);
    const ckey = typeof p.color === 'object' ? p.color.hex : p.color; colourUse.set(ckey, (colourUse.get(ckey) || 0) + 1);
    if (!colorIdx.has(ck)) { colorIdx.set(ck, colors.length); colors.push(ck); }
    const lb = fileBBox(p.file, embedded);
    const R = rotOurs(p.M);
    const pos = C(p.t);
    // World bbox in our units: transform the 8 local corners (exact for lattice rotations, conservative otherwise).
    const wb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    if (isFinite(lb[0])) for (const x of [lb[0], lb[3]]) for (const y of [lb[1], lb[4]]) for (const z of [lb[2], lb[5]]) {
      const w = C(apply(p.M, p.t, x, y, z));
      for (let k = 0; k < 3; k++) { if (w[k] < wb[k]) wb[k] = w[k]; if (w[k] > wb[k + 3]) wb[k + 3] = w[k]; }
    } else { for (let k = 0; k < 3; k++) { wb[k] = pos[k]; wb[k + 3] = pos[k]; } }
    // Upright on the 90° lattice about Y: R maps Y to +Y and is a signed permutation with unit entries.
    const near = (a, b) => Math.abs(a - b) < 0.01;
    const lattice = near(R[4], 1) && near(R[1], 0) && near(R[3], 0) && near(R[5], 0) && near(R[7], 0) && R.every(v => near(v, 0) || near(Math.abs(v), 1));
    return { pi, ci: colorIdx.get(ck), pos, R, wb, lattice, step: p.step, sub: p.sub, grp: p.grp, minifig: p.minifig };
  });

  // --- grid phase: the model's own half-stud / plate offset, from the most common fraction among lattice parts
  const mode = (vals, period) => {
    const h = new Map();
    for (const v of vals) { const f = Math.round((((v % period) + period) % period) / period * 20) % 20; h.set(f, (h.get(f) || 0) + 1); }
    let best = 0, bc = -1; for (const [f, c] of h) if (c > bc) { bc = c; best = f; }
    return best / 20 * period;
  };
  const latt = items.filter(i => i.lattice && !i.minifig && isFinite(i.wb[0]));
  const phX = mode(latt.map(i => i.wb[0]), 1), phZ = mode(latt.map(i => i.wb[2]), 1), phY = mode(latt.map(i => i.wb[1]), 0.4);
  const snap = (v, ph, unit) => (v - ph) / unit;
  const groupPhase = new Map();
  for (const g of new Set(latt.map(i => i.grp))) {
    const gl = latt.filter(i => i.grp === g);
    if (gl.length < 4) continue;
    groupPhase.set(g, [mode(gl.map(i => i.wb[0]), 1), mode(gl.map(i => i.wb[1]), 0.4), mode(gl.map(i => i.wb[2]), 1)]);
  }
  for (const it of items) {
    it.fp = null;
    if (!it.lattice || !isFinite(it.wb[0])) continue;
    // Snap in the group's own phase, then express the result on the model's grid (whole-stud / whole-plate offset).
    const [gx, gy, gz] = groupPhase.get(it.grp) || [phX, phY, phZ];
    const ox = Math.round(gx - phX), oy = Math.round((gy - phY) / 0.4), oz = Math.round(gz - phZ);
    const ax0 = snap(it.wb[0], gx, 1) + ox, ax1 = snap(it.wb[3], gx, 1) + ox, az0 = snap(it.wb[2], gz, 1) + oz, az1 = snap(it.wb[5], gz, 1) + oz;
    const ay0 = snap(it.wb[1], gy, 0.4) + oy, ay1 = snap(it.wb[4], gy, 0.4) + oy;
    const x0 = Math.round(ax0), x1 = Math.round(ax1), z0 = Math.round(az0), z1 = Math.round(az1), y0 = Math.round(ay0);
    // Studs on top add half a plate of height that is not part of the footprint: floor the top edge (with tolerance).
    const y1 = Math.floor(ay1 + 0.15);
    // A part whose both X (or Z) edges sit half a stud off the grid (jumper offsets) cannot be snapped honestly.
    const off = (a, b) => Math.abs(a - Math.round(a)) > 0.26 && Math.abs(b - Math.round(b)) > 0.26;
    // Baseplates are thinner than a plate: give them the one plate layer just under their top surface.
    if (parts[it.pi][3] === 'baseplate') {
      const top = Math.round(ay1 - 0.5);
      if (!off(ax0, ax1) && !off(az0, az1)) it.fp = [x0, z0, top - 1, Math.max(1, x1 - x0), Math.max(1, z1 - z0), 1];
      continue;
    }
    if (off(ax0, ax1) || off(az0, az1) || Math.abs(ay0 - y0) > 0.3) continue;
    it.fp = [x0, z0, y0, Math.max(1, x1 - x0), Math.max(1, z1 - z0), Math.max(1, y1 - y0)];
  }
  // --- shift so the grid footprint starts at 0,0,0 (lowest plate)
  const gp = items.filter(i => i.fp && !i.minifig);
  const mx = gp.length ? Math.min(...gp.map(i => i.fp[0])) : 0, mz = gp.length ? Math.min(...gp.map(i => i.fp[1])) : 0, my = gp.length ? Math.min(...gp.map(i => i.fp[2])) : 0;
  const sx = -(phX + mx), sz = -(phZ + mz), sy = -(phY + my * 0.4);
  for (const it of items) {
    it.pos = [it.pos[0] + sx, it.pos[1] + sy, it.pos[2] + sz];
    it.wb = [it.wb[0] + sx, it.wb[1] + sy, it.wb[2] + sz, it.wb[3] + sx, it.wb[4] + sy, it.wb[5] + sz];
    if (it.fp) { it.fp[0] -= mx; it.fp[1] -= mz; it.fp[2] -= my; }
  }
  // --- dims from the whole model (non-minifig) bbox, like the generator: studs x studs x bricks
  const body = items.filter(i => !i.minifig && isFinite(i.wb[0]));
  const ext = [0, 1, 2].map(k => [Math.min(...body.map(i => i.wb[k])), Math.max(...body.map(i => i.wb[k + 3]))]);
  const dims = { w: Math.round(ext[0][1] - ext[0][0]), d: Math.round(ext[2][1] - ext[2][0]), h: Math.max(1, Math.round((ext[1][1] - ext[1][0]) / 1.2)) };

  for (const [k, pt] of parts.entries()) {
    if (!pt[3] && minifigParts.has(k)) pt[3] = 'minifig';
    while (pt.length > 2 && pt[pt.length - 1] == null) pt.pop(); // trim trailing nulls: [rid, cid] stays the common case
  }
  const r4 = (v) => { const r = Math.round(v * 10000) / 10000; return Object.is(r, -0) ? 0 : r; };
  const r3 = (v) => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? 0 : r; };
  const bricks = items.map(it => [it.pi, it.ci, r3(it.pos[0]), r3(it.pos[1]), r3(it.pos[2]), ...it.R.map(r4), it.step, it.sub, ...(it.fp || [null, null, null, null, null, null])]);
  const isSeg = (i) => parts[i.pi][3] === 'segment';
  const nonFig = items.filter(i => !i.minifig && !isSeg(i));
  const catalogShare = nonFig.length ? nonFig.filter(i => parts[i.pi][1]).length / nonFig.length : 0;
  const offGridShare = nonFig.length ? nonFig.filter(i => !i.fp).length / nonFig.length : 0;

  // --- overlap sanity check: grid cells claimed by two or more grid-aligned (non-minifig) parts
  const cells = new Map(); const pairs = new Set();
  items.forEach((it, idx) => {
    if (!it.fp || it.minifig) return;
    const [x0, z0, y0, w, l, hp] = it.fp;
    for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + l; z++) for (let y = y0; y < y0 + hp; y++) {
      const k = x + ',' + y + ',' + z;
      if (cells.has(k)) pairs.add(cells.get(k) + '-' + idx); else cells.set(k, idx);
    }
  });
  const overlapParts = new Set([...pairs].flatMap(p => p.split('-').map(Number)));

  const model = {
    id: sel.id, name: sel.name, year: sel.year, theme: sel.theme, subject: sel.subject,
    source: { url: sel.setPage, download: sel.url, file: sel.file, authors: sel.authors, licence: sel.licenceNorm, licenceLine: sel.licence },
    format: 'studforge-omr-1', steps: gstep, pieces: items.filter(i => !isSeg(i)).length, dims, submodels: subNames, parts, colors, bricks,
    minifigParts: [...minifigParts].sort((a, b) => a - b),
    stats: { catalogShare: r3(catalogShare), offGridShare: r3(offGridShare), minifigPieces: items.filter(i => i.minifig && !isSeg(i)).length, hoseSegments: items.filter(isSeg).length, stickersDropped: stickers, lsynthSegmentsDropped: lsynth, embeddedOfficial,
      droppedRefs: Object.values(dropped).reduce((a, b) => a + b, 0), overlapPairs: pairs.size, overlapParts: overlapParts.size },
  };
  const diag = { expectedSteps, rawStepLines, squared, untilted, dropped, phase: [phX, phY, phZ], overlapSamples: [...pairs].slice(0, 8).map(p => p.split('-').map(i => parts[items[+i].pi][0] + '@' + (items[+i].fp || []).join(','))) };
  return { model, diag, rawIds: raw.map(r => r.id), items };
}

// ------------------------------------------------------------------ main
// --bbox 3001,6091: print part-local bounding boxes in StudForge units and axes (a check against baked geometry).
if (arg('bbox', '')) {
  for (const id of arg('bbox').split(',')) {
    const b = fileBBox(norm(id) + '.dat', null);
    console.log(id, JSON.stringify([b[0] / 20, -b[4] / 20, -b[5] / 20, b[3] / 20, -b[1] / 20, -b[2] / 20].map(v => Math.round(v * 1e4) / 1e4)));
  }
  process.exit(0);
}
const selection = JSON.parse(fs.readFileSync(path.join(CACHE, 'selection.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const index = [];
const usedParts = new Set();
const unmapped = new Map(); let totalPieces = 0, mappedPieces = 0;
const normLicence = (l) => (/CC BY 4\.0/i.test(l || '') ? 'CC BY 4.0' : /CC BY 2\.0|CCAL version 2\.0/i.test(l || '') ? 'CC BY 2.0' : null);
let bytes = 0;
for (const sel of selection) {
  if (ONLY && !ONLY.has(sel.id)) continue;
  sel.licenceNorm = normLicence(sel.licence);
  if (!sel.licenceNorm) { console.warn('skip (licence)', sel.id, sel.licence); continue; }
  let res;
  try { res = convertModel(sel); } catch (e) { console.warn('FAILED', sel.id, e.stack); continue; }
  const { model, diag } = res;
  const json = JSON.stringify(model);
  fs.writeFileSync(path.join(OUT, `${model.id}.json`), json);
  bytes += json.length;
  for (const [rid] of model.parts) usedParts.add(rid);
  model.bricks.forEach(b => {
    if (model.minifigParts.includes(b[0]) || model.parts[b[0]][3] === 'segment') return;
    totalPieces++;
    const [rid, cid] = model.parts[b[0]];
    if (cid) mappedPieces++; else unmapped.set(rid, (unmapped.get(rid) || 0) + 1);
  });
  index.push({ id: model.id, name: model.name, year: model.year, theme: model.theme, subject: model.subject, pieces: model.pieces, steps: model.steps,
    file: `${model.id}.json`, authors: model.source.authors, licence: model.source.licence, url: model.source.url, dims: model.dims });
  const flag = diag.expectedSteps === model.steps ? '' : `  STEP MISMATCH expected ${diag.expectedSteps}`;
  console.log(`${model.id.padEnd(12)} ${model.subject.padEnd(12)} ${String(model.pieces).padStart(5)}pc ${String(model.steps).padStart(4)} steps  cat ${(model.stats.catalogShare * 100).toFixed(0)}%  off ${(model.stats.offGridShare * 100).toFixed(0)}%  ovl ${model.stats.overlapPairs}  ${(json.length / 1024).toFixed(0)}KB  ${model.name}${flag}`);
  if (VERIFY.has(model.id)) {
    console.log('  VERIFY', JSON.stringify({ dims: model.dims, submodels: model.submodels.length, subNames: model.submodels.slice(0, 12), colors: model.colors, minifig: model.stats.minifigPieces,
      stickers: model.stats.stickersDropped, dropped: diag.dropped, stepLinesInFile: diag.rawStepLines, stepGroups: diag.expectedSteps, steps: model.steps, phase: diag.phase,
      overlapPairs: model.stats.overlapPairs, overlapParts: model.stats.overlapParts, overlapSamples: diag.overlapSamples }));
  }
}
if (!ONLY) {
  index.sort((a, b) => a.subject.localeCompare(b.subject) || a.year - b.year);
  const idx = { generated: new Date().toISOString().slice(0, 10), format: 'studforge-omr-1',
    licence: 'Models from the LDraw.org Official Model Repository (https://library.ldraw.org/omr), each by the authors named in its entry, licensed CC BY 2.0 or CC BY 4.0; part geometry from the LDraw.org Parts Library (CC BY 2.0/4.0). Converted for StudForge. LEGO is a trademark of the LEGO Group, which does not sponsor or endorse this project.',
    models: index };
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(idx));
  fs.writeFileSync(PARTS_USED, [...usedParts].sort().join('\n') + '\n');
  const top = [...unmapped].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([id, n]) => `${id}:${n}:${(libFile(id + '.dat') || { title: '?' }).title}`);
  fs.writeFileSync(path.join(CACHE, 'coverage.json'), JSON.stringify({ models: index.length, totalPieces, mappedPieces, share: mappedPieces / totalPieces, distinctParts: usedParts.size, bytes, top,
    colours: [...colourUse].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${(LDCONFIG.get(c) || { name: '#' + c }).name}(${c}) -> ${colourMemo.get(c)} [${colourHow.get(c) || 'default'}] x${n}`) }, null, 1));
  console.log(`\n${index.length} models, ${(bytes / 1024 / 1024).toFixed(2)} MB, ${usedParts.size} distinct LDraw parts -> ${PARTS_USED}`);
  console.log(`catalog coverage: ${mappedPieces}/${totalPieces} = ${(100 * mappedPieces / totalPieces).toFixed(1)}% of non-minifig pieces`);
  console.log('top unmapped:', top.slice(0, 25).join(' | '));
}
