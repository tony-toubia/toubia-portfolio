#!/usr/bin/env node
// Bake LDraw parts into StudForge's compact geometry format.
//
//   node scripts/ldraw/bake.mjs --lib <ldraw dir> [--out public/studforge/data/ldraw/parts]
//        [--ids 3001,3039 | --ids-file list.txt | --catalog] [--cap 3000] [--skip-over-cap] [--manifest <path>] [--quiet]
//
// --ids        comma/space separated LDraw names ("3001", "3001.dat", "973c01", "s\3001s01.dat" all work)
// --ids-file   a text file of names, separated by whitespace or commas; "#" starts a comment
// --catalog    every part id in public/studforge/js/parts-catalog.js (written under the catalog id, following
//              "~Moved to" redirects for the geometry)
// The three can be combined. Each part is written to <out>/<bakedId>.json and merged into the manifest
// (default <out>/../manifest.json), so successive runs accumulate.
//
// Output (one file per part): { id, name, v: [x,y,z,...], i: [a,b,c,...], bbox, tris, licence, c? }
// v is in StudForge units and axes (1 stud = 1 = 20 LDU, +Y up), part-local (the LDraw origin), 4 decimals, with
// duplicate vertices merged; triangles are CCW from the front. `c` (per-triangle LDraw colour code, 16 = the
// brick's colour) is present only when the part has fixed-colour sub-geometry.
// Triangle budget: studs always use the low-res p/8 primitives; a part still above --cap is retried with every
// primitive low-res, and if it is still above, it is written anyway and reported (no lossy decimation), unless
// --skip-over-cap is given (big baseplates: a 32x32 is ~25k triangles / 650 KB). Parts whose description or sub-files
// mention a logo are never baked (no brand artwork in the repo).

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadPart, setLibrary, exists, bakedId } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
    const a = { ids: [], cap: 3000, quiet: false, catalog: false };
    for (let k = 0; k < argv.length; k++) {
        const s = argv[k];
        const val = () => { if (k + 1 >= argv.length) throw new Error(s + ' needs a value'); return argv[++k]; };
        if (s === '--lib') a.lib = val();
        else if (s === '--out') a.out = val();
        else if (s === '--ids') a.ids.push(...val().split(/[\s,]+/));
        else if (s === '--ids-file') a.idsFile = val();
        else if (s === '--catalog') a.catalog = true;
        else if (s === '--cap') a.cap = Number(val());
        else if (s === '--manifest') a.manifest = val();
        else if (s === '--quiet') a.quiet = true;
        else if (s === '--skip-over-cap') a.skipOverCap = true;
        else if (s === '-h' || s === '--help') a.help = true;
        else throw new Error('unknown argument ' + s);
    }
    return a;
}

/** The StudForge parts catalog, evaluated as the browser would (it only assigns window.LEGO_PARTS). */
export function loadCatalog(root = ROOT) {
    const src = fs.readFileSync(path.join(root, 'public/studforge/js/parts-catalog.js'), 'utf8');
    const ctx = { window: {} };
    vm.runInNewContext(src, ctx);
    return ctx.window.LEGO_PARTS;
}

const r4 = (x) => { const v = Math.round(x * 1e4) / 1e4; return v === 0 ? 0 : v; };   // no "-0"

/** Merge vertices on a 4-decimal key and drop triangles that collapse. Returns { v, i, c, bbox }. */
export function compact(part) {
    const P = part.positions, keyIdx = new Map(), v = [], i = [], c = part.colors ? [] : null;
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const vert = (k) => {
        const x = r4(P[k]), y = r4(P[k + 1]), z = r4(P[k + 2]);
        const key = x + ',' + y + ',' + z;
        let n = keyIdx.get(key);
        if (n === undefined) {
            n = v.length / 3; keyIdx.set(key, n); v.push(x, y, z);
            if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (z < bb[2]) bb[2] = z;
            if (x > bb[3]) bb[3] = x; if (y > bb[4]) bb[4] = y; if (z > bb[5]) bb[5] = z;
        }
        return n;
    };
    for (let t = 0; t < P.length / 9; t++) {
        const a = vert(t * 9), b = vert(t * 9 + 3), d = vert(t * 9 + 6);
        if (a === b || b === d || a === d) continue;
        i.push(a, b, d);
        if (c) c.push(part.colors[t]);
    }
    return { v, i, c: c && c.some(x => x !== 16) ? c : null, bbox: v.length ? bb : [0, 0, 0, 0, 0, 0] };
}

const licenceOf = (p) => {
    const m = /CC BY[- ]?(\d\.\d)/i.exec(p.license || '');
    return (m ? 'CC BY ' + m[1] : 'CC BY 2.0') + ' LDraw.org Parts Library';
};

/** Bake one part. Returns { id, json, tris, bytes, lowRes, overCap, src, name, missing } or null when not found. */
export function bakeOne(name, { cap = 3000, id = bakedId(name) } = {}) {
    let lowRes = 'studs';
    let p = loadPart(name, { lowRes });
    if (!p) return null;
    // Never ship brand artwork: parts printed with (or built from) a logo are skipped and reported.
    if (/\blogo\b/i.test(p.title) || p.logos.length) return { id, skipped: 'logo: ' + (p.logos[0] || p.title) };
    if (p.tris > cap) {
        const q = loadPart(name, { lowRes: true });
        if (q.tris < p.tris) { p = q; lowRes = true; }
    }
    const g = compact(p);
    const out = { id, name: p.title, v: g.v, i: g.i, bbox: g.bbox, tris: g.i.length / 3, licence: licenceOf(p) };
    if (g.c) out.c = g.c;
    const json = JSON.stringify(out);
    return {
        id, json, name: p.title, tris: out.tris, bytes: Buffer.byteLength(json), lowRes, overCap: out.tris > cap,
        src: p.file.replace(/^parts\//, '').replace(/\.dat$/i, ''), author: p.author, missing: p.missing,
    };
}

async function main() {
    const a = parseArgs(process.argv.slice(2));
    if (a.help) {
        const lines = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1);
        console.log(lines.slice(0, lines.findIndex(l => !l.startsWith('//'))).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
        return;
    }
    const lib = a.lib || process.env.LDRAW_LIB;
    if (!lib) throw new Error('--lib <ldraw dir> is required (or set LDRAW_LIB)');
    setLibrary(lib);
    const out = path.resolve(a.out || path.join(ROOT, 'public/studforge/data/ldraw/parts'));
    const manifestPath = path.resolve(a.manifest || path.join(out, '..', 'manifest.json'));
    fs.mkdirSync(out, { recursive: true });

    // name -> baked id. Catalog parts keep the catalog id even when LDraw has moved the file (3023 -> 3023b).
    const jobs = new Map();
    const add = (name, id = bakedId(name)) => { if (name && !jobs.has(id)) jobs.set(id, name); };
    a.ids.filter(Boolean).forEach(n => add(n));
    if (a.idsFile) {
        fs.readFileSync(a.idsFile, 'utf8').split('\n').map(l => l.replace(/#.*/, ''))
            .flatMap(l => l.split(/[\s,]+/)).filter(Boolean).forEach(n => add(n));
    }
    if (a.catalog) Object.keys(loadCatalog()).forEach(id => add(id, id));
    if (!jobs.size) throw new Error('nothing to bake: pass --ids, --ids-file or --catalog');

    let manifest = { generated: null, licence: '', parts: {} };
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { /* first run */ }
    manifest.parts = manifest.parts || {};

    const notFound = [], overCap = [], skipped = [], missingRefs = new Map();
    let bytes = 0, tris = 0, n = 0;
    for (const [id, name] of jobs) {
        const r = exists(name) ? bakeOne(name, { cap: a.cap, id }) : null;
        if (!r) { notFound.push(name); continue; }
        if (r.skipped) { skipped.push(`${id} (${r.skipped})`); continue; }
        if (r.overCap && a.skipOverCap) { overCap.push(id + ' (' + r.tris + ', not written)'); continue; }
        fs.writeFileSync(path.join(out, id + '.json'), r.json);
        const entry = { name: r.name, tris: r.tris, bytes: r.bytes };
        if (r.src !== id) entry.src = r.src;          // the LDraw file actually baked (redirects, sub-folders)
        if (r.lowRes === true) entry.lowRes = true;   // every primitive low-res to meet the budget
        if (r.overCap) { entry.overCap = true; overCap.push(id + ' (' + r.tris + ')'); }
        manifest.parts[id] = entry;
        for (const m of r.missing) missingRefs.set(m, (missingRefs.get(m) || []).concat(id));
        bytes += r.bytes; tris += r.tris; n++;
        if (!a.quiet) console.log(id.padEnd(12), String(r.tris).padStart(5), 'tris', String(r.bytes).padStart(7), 'B',
            r.src !== id ? '<- ' + r.src : '', r.lowRes === true ? '[all low-res]' : '', r.overCap ? '[OVER CAP]' : '', r.name);
    }

    manifest.generated = new Date().toISOString();
    manifest.licence = 'Part geometry derived from the LDraw.org Parts Library (www.ldraw.org), licensed CC BY 2.0 / CC BY 4.0. LEGO is a trademark of the LEGO Group, which does not sponsor or endorse this project.';
    manifest.parts = Object.fromEntries(Object.entries(manifest.parts).sort(([x], [y]) => x.localeCompare(y, 'en', { numeric: true })));
    // One part per line: small, readable diffs when later runs add parts.
    fs.writeFileSync(manifestPath, '{\n' + ['generated', 'licence'].map(k => ` ${JSON.stringify(k)}: ${JSON.stringify(manifest[k])},\n`).join('')
        + ' "parts": {\n' + Object.entries(manifest.parts).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n }\n}\n');

    const all = Object.values(manifest.parts);
    console.log(`\nbaked ${n} parts: ${tris} triangles, ${(bytes / 1024).toFixed(1)} KB` +
        ` (manifest now ${all.length} parts, ${(all.reduce((s, p) => s + p.bytes, 0) / 1024).toFixed(1)} KB)`);
    if (notFound.length) console.log('not in the LDraw library:', notFound.join(', '));
    if (skipped.length) console.log('skipped (logo artwork):', skipped.join(', '));
    if (overCap.length) console.log(`above the ${a.cap}-triangle cap (never decimated; written unless --skip-over-cap):`, overCap.join(', '));
    if (missingRefs.size) console.log('unresolved sub-files:', [...missingRefs].map(([f, ids]) => `${f} (in ${ids.join(' ')})`).join(', '));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(e => { console.error('bake:', e.message); process.exit(1); });
}
