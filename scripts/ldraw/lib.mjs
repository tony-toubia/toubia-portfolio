// LDraw geometry library: loads parts from an extracted LDraw parts library and flattens them into triangles
// in StudForge units and axes. Dependency-free (Node built-ins only).
//
//   import { loadPart, bbox, triangles, setLibrary } from './lib.mjs';
//   setLibrary('/path/to/ldraw');               // or pass { lib } in opts, or set LDRAW_LIB
//   const p = loadPart('3001', { lowRes: 'studs' });
//   // p.positions: flat [x,y,z, x,y,z, x,y,z, ...] (9 numbers per triangle, CCW = front face)
//   // p.colors: per-triangle LDraw colour code, or null when every triangle takes the brick's colour
//   // p.bbox: [minX,minY,minZ,maxX,maxY,maxZ]
//
// Conversion: LDraw is -Y up and 1 stud = 20 LDU; StudForge is +Y up and 1 stud = 1 unit. A 180° rotation about X
// keeps handedness (and so triangle winding): ours = C · ldraw / 20 with C = diag(1, -1, -1).
//
// What is handled: sub-file references (type 1) with accumulated 3x4 transforms, triangles (3), quads (4, split in two),
// colour 16 (inherit) and 24 (edge colour, treated as inherit), BFC winding (CERTIFY CW/CCW, CW/CCW switches,
// INVERTNEXT, mirrored matrices with a negative determinant), "~Moved to" redirect files, case-insensitive names with
// "\" separators. Ignored: lines (2), optional lines (5), texture-mapped geometry ("0 !:" lines; the plain fallback
// geometry is used instead).

import fs from 'node:fs';
import path from 'node:path';

let defaultLib = process.env.LDRAW_LIB || null;
const libraries = new Map();   // library dir -> { index, files, flat }

/** Set the default LDraw library directory (the folder holding parts/ and p/). */
export function setLibrary(dir) { defaultLib = dir; }

// Lower-cased relative path -> absolute path, per search root, built once per library (the library is ~35k files).
function indexDir(root, prefix, out) {
    let entries;
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        const rel = prefix ? prefix + '/' + e.name : e.name;
        if (e.isDirectory()) indexDir(path.join(root, e.name), rel, out);
        else if (/\.(dat|ldr)$/i.test(e.name)) out.set(rel.toLowerCase(), path.join(root, e.name));
    }
    return out;
}

function library(dir) {
    dir = dir || defaultLib;
    if (!dir) throw new Error('LDraw library directory not set: pass { lib }, call setLibrary(dir) or set LDRAW_LIB');
    let L = libraries.get(dir);
    if (!L) {
        L = {
            dir,
            parts: indexDir(path.join(dir, 'parts'), '', new Map()),   // includes s/ (and textures/, never matched)
            prims: indexDir(path.join(dir, 'p'), '', new Map()),       // includes 8/ and 48/
            files: new Map(),                                         // absolute path -> parsed file
            flat: new Map(),                                          // cache key -> flattened part
        };
        libraries.set(dir, L);
    }
    return L;
}

const normName = (name) => {
    let n = String(name).trim().replace(/\\/g, '/').toLowerCase();
    if (!/\.(dat|ldr)$/.test(n)) n += '.dat';
    return n;
};

/** Resolve a reference name to an absolute path: parts/, parts/s/, p/8/ (low-res), p/. `lowRes`: false | 'studs' | true. */
function resolve(L, name, lowRes) {
    const n = normName(name);
    const base = n.slice(n.lastIndexOf('/') + 1);
    const useLow = lowRes === true || (lowRes === 'studs' && /^stud/.test(base) && !n.includes('/'));
    // Fully low-res: explicit hi-res references (48\...) fall back to the 8- or 16-segment version when one exists.
    if (lowRes === true && n.startsWith('48/')) {
        const sub = L.prims.get('8/' + base) || L.prims.get(base);
        if (sub) return sub;
    }
    return L.parts.get(n) || L.parts.get('s/' + n)
        || (useLow && L.prims.get('8/' + n))
        || L.prims.get(n) || null;
}

// Parse one file into compact records. Kept per absolute path: the same primitive is shared by thousands of parts.
function parseFile(L, abs) {
    let f = L.files.get(abs);
    if (f) return f;
    const text = fs.readFileSync(abs, 'latin1');
    const lines = text.split(/\r?\n/);
    const recs = [];
    let title = null, name = null, movedTo = null, license = null, author = null;
    let certified = null;   // null = unknown, 'CCW' | 'CW'
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        const t = line.split(/\s+/);
        const type = t[0];
        if (type === '0') {
            if (title === null) {
                title = line.slice(1).trim();
                const m = /^~Moved to\s+(\S+)/i.exec(title);
                if (m) movedTo = m[1];
                continue;
            }
            if (t[1] === 'Name:' && !name) { name = t.slice(2).join(' '); continue; }
            if (t[1] === '!LICENSE' && !license) { license = t.slice(2).join(' '); continue; }
            if (t[1] === 'Author:' && !author) { author = t.slice(2).join(' '); continue; }
            if (t[1] === 'BFC') {
                const w = t.slice(2).map(s => s.toUpperCase());
                if (w[0] === 'CERTIFY') { certified = w[1] === 'CW' ? 'CW' : 'CCW'; recs.push({ k: 'w', cw: certified === 'CW' }); }
                else if (w[0] === 'NOCERTIFY') certified = null;
                else if (w.includes('INVERTNEXT')) recs.push({ k: 'inv' });
                else if (w.includes('CW')) recs.push({ k: 'w', cw: true });
                else if (w.includes('CCW')) recs.push({ k: 'w', cw: false });
            }
            continue;   // other meta (incl. "0 !:" texture geometry) is ignored
        }
        if (type === '1' && t.length >= 15) {
            const n = t.slice(2, 14).map(Number);
            if (n.some(Number.isNaN)) continue;
            // The file name is the rest of the line after 14 tokens (names may contain spaces).
            const file = line.replace(/^(\S+\s+){14}/, '');
            recs.push({ k: 1, c: t[1], m: n, file });
        } else if (type === '3' && t.length >= 11) {
            recs.push({ k: 3, c: t[1], p: t.slice(2, 11).map(Number) });
        } else if (type === '4' && t.length >= 14) {
            recs.push({ k: 4, c: t[1], p: t.slice(2, 14).map(Number) });
        }
        // 2 (lines) and 5 (optional lines) carry no surface.
    }
    f = { abs, title: title || '', name, movedTo, license, author, certified, recs };
    L.files.set(abs, f);
    return f;
}

// 3x4 transforms as [x, y, z, a, b, c, d, e, f, g, h, i] (LDraw order): p' = (a b c; d e f; g h i) p + (x y z).
const IDENT = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
function mul(P, C) {   // P · C
    const [px, py, pz, a, b, c, d, e, f, g, h, i] = P;
    const [cx, cy, cz, A, B, Cc, D, E, F, G, H, I] = C;
    return [
        a * cx + b * cy + c * cz + px, d * cx + e * cy + f * cz + py, g * cx + h * cy + i * cz + pz,
        a * A + b * D + c * G, a * B + b * E + c * H, a * Cc + b * F + c * I,
        d * A + e * D + f * G, d * B + e * E + f * H, d * Cc + e * F + f * I,
        g * A + h * D + i * G, g * B + h * E + i * H, g * Cc + h * F + i * I,
    ];
}
const det = (M) => M[3] * (M[7] * M[11] - M[8] * M[10]) - M[4] * (M[6] * M[11] - M[8] * M[9]) + M[5] * (M[6] * M[10] - M[7] * M[9]);

// Top-stud primitives (solid, hollow, round-part and cross studs; not the underside tubes stud3/stud4/...).
const STUD_RE = /(^|[\\/])(stud|studa|stud2|stud2a|stud6|stud6a|stud9|stud10|stud15|stud17|stud17a|stud26|studp01|studel|studh|studx|studxa)\.dat$/i;

// Stud kinds for the baked `studs` list: 0 solid, 1 hollow (open) stud, 2 anything else (cross, technic, round-part).
const STUD_HOLLOW_RE = /(^|[\\/])(stud2|stud2a|stud6|stud6a)\.dat$/i;
const STUD_SOLID_RE = /(^|[\\/])(stud|studa|stud15|stud17|stud17a|stud9|stud10|stud26)\.dat$/i;
const studKind = (file) => (STUD_HOLLOW_RE.test(file) ? 1 : STUD_SOLID_RE.test(file) ? 0 : 2);
// Underside tubes and posts. With `skipStuds` they are listed in `tubes` as a segment (both ends, StudForge axes) plus
// an outer radius and a kind (3 solid post, 4 open tube), instead of being triangulated: on a big plate they are most
// of the triangles and nobody sees them from above.
const TUBE_RE = /(^|[\\/])(stud3|stud3a|stud4|stud4a|stud4o|stud4f\w*|stud4h|stud12|stud16|stud16a|stud16od)\.dat$/i;
const tubeKind = (file) => (/(^|[\\/])stud3a?\.dat$/i.test(file) ? 3 : 4);
const TUBE_R = { 3: 4, 4: 8 };   // outer radius in LDU before scaling

// Colour codes: 16 = inherit, 24 = edge colour (only meaningful on lines; treated as inherit on surfaces).
const inheritColour = (code, parent) => (code === '16' || code === '24') ? parent : code;

/**
 * Load and flatten a part. `id`: an LDraw file name with or without ".dat" ("3001", "s\\3001s01.dat"), or a baked
 * part id ("/" written as "_" is accepted when the plain name does not resolve).
 * opts: { lib, lowRes: false | 'studs' | true, skipStuds, stripLogos }. With `stripLogos`, sub-files whose name mentions
 * a logo (the small brand logo embossed on some moulded parts) are left out of the geometry; they are still listed in `logos`.
 * With `skipStuds`, top-stud primitives are listed in
 * `studs` (with a kind: 0 solid, 1 hollow, 2 other) but left out of the triangles, so a renderer can instance them.
 * Returns { id, file, title, name, license, author, movedTo, positions, colors, bbox, tris, studs, logos, missing }, or
 * null when the file is unknown. `studs`: [x, y, z, dx, dy, dz] per stud primitive (base centre and the direction it
 * points, StudForge axes). `logos`: referenced sub-files whose name mentions a logo. `title` is the description line ("Brick  2 x  4"), after following "~Moved to" redirects.
 */
export function loadPart(id, opts = {}) {
    const L = library(opts.lib);
    const lowRes = opts.lowRes ?? false;
    const skipStuds = !!opts.skipStuds;
    const stripLogos = !!opts.stripLogos;
    const key = String(id).toLowerCase() + '|' + lowRes + (skipStuds ? '|nostuds' : '') + (stripLogos ? '|nologos' : '');
    if (L.flat.has(key)) return L.flat.get(key);

    let abs = resolve(L, id, lowRes);
    if (!abs && String(id).includes('_')) abs = resolve(L, String(id).replace(/_/g, '/'), lowRes);
    if (!abs) { L.flat.set(key, null); return null; }

    // Follow "~Moved to" redirects for the title (the redirect file also references the target, so geometry is the same).
    let top = parseFile(L, abs);
    const movedChain = [];
    for (let hop = 0; top.movedTo && hop < 8; hop++) {
        const next = resolve(L, top.movedTo, lowRes);
        if (!next) break;
        movedChain.push(top.movedTo);
        top = parseFile(L, next);
        abs = next;
    }

    const positions = [];
    const colors = [];
    let fixedColour = false;
    const missing = new Set();
    const studs = [];
    const tubes = [];
    // A tube primitive's extent along its own Y axis (LDraw units), measured once per primitive.
    const tubeSpan = (file) => {
        const k = 'span|' + file.toLowerCase();
        if (L.flat.has(k)) return L.flat.get(k);
        const q = loadPart(file, { lib: opts.lib, lowRes: true });
        let lo = 0, hi = 0;
        if (q && q.positions.length) { lo = Infinity; hi = -Infinity; for (let n = 1; n < q.positions.length; n += 3) { const y = -q.positions[n] * 20; if (y < lo) lo = y; if (y > hi) hi = y; } }
        const span = [lo, hi]; L.flat.set(k, span); return span;
    };
    const logos = new Set();   // referenced files with "logo" in the name (brand logo primitives/patterns)
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];

    // Emit a triangle in LDraw space (already transformed); `flip` reverses the winding so the front face is CCW.
    const emit = (M, p, ia, ib, ic, flip, colour) => {
        const idx = flip ? [ia, ic, ib] : [ia, ib, ic];
        for (const k of idx) {
            const x = p[k * 3], y = p[k * 3 + 1], z = p[k * 3 + 2];
            const wx = M[3] * x + M[4] * y + M[5] * z + M[0];
            const wy = M[6] * x + M[7] * y + M[8] * z + M[1];
            const wz = M[9] * x + M[10] * y + M[11] * z + M[2];
            // ours = C · ldraw / 20, C = diag(1, -1, -1)
            const ox = wx / 20, oy = -wy / 20, oz = -wz / 20;
            positions.push(ox, oy, oz);
            if (ox < bb[0]) bb[0] = ox; if (oy < bb[1]) bb[1] = oy; if (oz < bb[2]) bb[2] = oz;
            if (ox > bb[3]) bb[3] = ox; if (oy > bb[4]) bb[4] = oy; if (oz > bb[5]) bb[5] = oz;
        }
        colors.push(colour);
        if (colour !== '16') fixedColour = true;
    };

    // Recursive walk. `inv`: accumulated INVERTNEXT parity; the determinant of M covers mirrored matrices.
    const walk = (file, M, colour, inv, depth) => {
        if (depth > 64) return;
        const mirrored = det(M) < 0;
        let cw = file.certified === 'CW';
        let invertNext = false;
        for (const r of file.recs) {
            if (r.k === 'w') { cw = r.cw; continue; }
            if (r.k === 'inv') { invertNext = true; continue; }
            if (r.k === 1) {
                const sub = resolve(L, r.file, lowRes);
                if (!sub) { missing.add(r.file); invertNext = false; continue; }
                const W = mul(M, r.m);
                if (/logo/i.test(r.file)) { logos.add(r.file); if (stripLogos) { invertNext = false; continue; } }
                if (STUD_RE.test(r.file)) {
                    // A stud's origin is the centre of its base and it rises along local -Y: record base + direction.
                    const len = Math.hypot(W[4], W[7], W[10]) || 1;
                    studs.push([W[0] / 20, -W[1] / 20, -W[2] / 20, -W[4] / len, W[7] / len, W[10] / len].map(v => Math.round(v * 1e4) / 1e4 || 0).concat(studKind(r.file)));
                    if (skipStuds) { invertNext = false; continue; }
                }
                if (skipStuds && TUBE_RE.test(r.file)) {
                    const [lo, hi] = tubeSpan(r.file), pt = (y) => [W[3 + 1] * y + W[0], W[6 + 1] * y + W[1], W[9 + 1] * y + W[2]];
                    const a = pt(lo), b = pt(hi), kind = tubeKind(r.file);
                    const rad = TUBE_R[kind] * Math.hypot(W[3], W[6], W[9]) / 20;
                    tubes.push([a[0] / 20, -a[1] / 20, -a[2] / 20, b[0] / 20, -b[1] / 20, -b[2] / 20, rad].map(v => Math.round(v * 1e3) / 1e3 || 0).concat(kind));
                    invertNext = false; continue;
                }
                walk(parseFile(L, sub), W, inheritColour(r.c, colour), inv !== invertNext, depth + 1);
                invertNext = false;
                continue;
            }
            const flip = cw !== (inv !== mirrored);
            const c = inheritColour(r.c, colour);
            if (r.k === 3) emit(M, r.p, 0, 1, 2, flip, c);
            else { emit(M, r.p, 0, 1, 2, flip, c); emit(M, r.p, 0, 2, 3, flip, c); }
        }
    };
    walk(top, IDENT, '16', false, 0);

    const tris = colors.length;
    const out = {
        id: String(id),
        file: path.relative(L.dir, abs).replace(/\\/g, '/'),
        title: top.title,
        name: top.name,
        license: top.license,
        author: top.author,
        movedTo: movedChain.length ? movedChain[movedChain.length - 1] : null,
        positions,
        colors: fixedColour ? colors.map(c => (/^\d+$/.test(c) ? Number(c) : c)) : null,
        bbox: tris ? bb : [0, 0, 0, 0, 0, 0],
        tris,
        studs,
        tubes,
        logos: [...logos],
        missing: [...missing],
    };
    L.flat.set(key, out);
    return out;
}

/** Bounding box [minX,minY,minZ,maxX,maxY,maxZ] in StudForge units/axes, or null when the part is unknown. */
export function bbox(id, opts = {}) {
    const p = loadPart(id, opts);
    return p ? p.bbox : null;
}

/** Flat triangle positions (9 numbers per triangle, StudForge units/axes, CCW front faces), or null. */
export function triangles(id, opts = {}) {
    const p = loadPart(id, opts);
    return p ? p.positions : null;
}

/** True when the id resolves to a file in the library. */
export function exists(id, opts = {}) {
    const L = library(opts.lib);
    return !!(resolve(L, id, false) || (String(id).includes('_') && resolve(L, String(id).replace(/_/g, '/'), false)));
}

/** Baked part id for an LDraw file name: no ".dat", lower-case, "/" and "\" -> "_". */
export const bakedId = (name) => String(name).trim().replace(/\.(dat|ldr)$/i, '').replace(/[\\/]/g, '_').toLowerCase();
