#!/usr/bin/env node
// Work out how each baked LDraw part sits in StudForge's catalog frame, and check its size against the catalog.
//
//   node scripts/ldraw/catalog-frames.mjs --lib <ldraw dir> [--parts public/studforge/data/ldraw/parts]
//        [--out public/studforge/data/ldraw/catalog-frames.json] [--verbose]
//
// Writes { partId: { rotY, offset: [dx, dy, dz], mismatch? } } for every catalog part that has a baked file.
// Meaning: in a catalog part's own frame (origin = bottom centre of its footprint, X = width, Z = length, Y up; the
// frame brick-builder's procedural meshes use), a baked vertex v lands at  RotY(rotY°) · v + offset, where RotY is
// three.js' rotation about +Y (mesh.rotation.y = rotY * PI / 180). So `offset` is where the LDraw origin sits in our
// frame. To show a catalog brick with baked geometry: a child mesh with rotation.y = rotY° and position = offset,
// inside a group placed and rotated exactly as the procedural mesh would be. `mismatch` says where the real part's
// size differs from the catalog's footprint (wheels, clips, bars...), or that a quarter turn about Y cannot express it;
// `note` explains the known disagreements between the real part and our catalog/engine model.
//
// How the turn is chosen:
// 1. Orientation rules taken from brick-builder's documented conventions (slopes high at -Z, wheel axles along X, hinge
//    knuckles at +Z, clips at +Z, bracket studs +X, side studs -Z / -X, wedge and corner sides, door hinge at -Z...)
//    keep only the quarter turns that satisfy them; they are tested on the real geometry (studs, extents, profiles).
// 2. Among those, the turn whose baked surface best matches brick-builder's procedural mesh wins (a robust chamfer
//    distance; near-ties go to the smaller turn).
// The offset: with exposed top studs, their bases sit at the catalog height and their centres on our stud lattice
// (half-stud steps, so centre studs on jumpers work), choosing the lattice shift that fits best; without studs, bounding
// boxes are aligned (plus a short ICP), snapped to 1 LDU (0.05). Glass panes and doors follow their frames, because
// LDraw places a window's glass at the frame's own origin and a door 32 LDU off the frame's centre at its hinge holes.
// NOTE: frames are fitted against FULL part geometry (studs included: the stud grid pins the offsets). Since the
// baker now strips studs and tubes from the baked files, this script must rebuild the full geometry itself; until it
// does, keep the committed catalog-frames.json (fitted before the stud split; the LDraw origins are unchanged).

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadPart, setLibrary } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PARTS = path.resolve(opt('--parts', path.join(ROOT, 'public/studforge/data/ldraw/parts')));
const OUT = path.resolve(opt('--out', path.join(ROOT, 'public/studforge/data/ldraw/catalog-frames.json')));
const VERBOSE = args.includes('--verbose');
const LIB = opt('--lib', process.env.LDRAW_LIB);
if (!LIB) { console.error('catalog-frames: --lib <ldraw dir> is required (or set LDRAW_LIB)'); process.exit(1); }
setLibrary(LIB);
const manifest = JSON.parse(fs.readFileSync(path.join(PARTS, '..', 'manifest.json'), 'utf8'));

// three.js + the catalog + brick-builder in a sandbox: only geometry is used, no WebGL.
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['vendor/three.min.js', 'js/parts-catalog.js', 'js/brick-builder.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/studforge', f), 'utf8'), ctx, { filename: f });
}
const { LEGO_PARTS } = ctx;
const builder = new ctx.BrickBuilder();

/* ── geometry helpers ─────────────────────────────────────── */

// Deterministic area-weighted surface sampling of a triangle soup (flat [x,y,z]*3 per triangle).
function sample(tri, n, seed = 1) {
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const areas = [], T = tri.length / 9;
    let total = 0;
    for (let t = 0; t < T; t++) {
        const o = t * 9;
        const ux = tri[o + 3] - tri[o], uy = tri[o + 4] - tri[o + 1], uz = tri[o + 5] - tri[o + 2];
        const vx = tri[o + 6] - tri[o], vy = tri[o + 7] - tri[o + 1], vz = tri[o + 8] - tri[o + 2];
        total += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
        areas.push(total);
    }
    const pts = new Float64Array(n * 3);
    for (let k = 0; k < n; k++) {
        const r = rnd() * total;
        let lo = 0, hi = T - 1;
        while (lo < hi) { const m = (lo + hi) >> 1; if (areas[m] < r) lo = m + 1; else hi = m; }
        let a = rnd(), b = rnd();
        if (a + b > 1) { a = 1 - a; b = 1 - b; }
        const o = lo * 9;
        for (let d = 0; d < 3; d++) pts[k * 3 + d] = tri[o + d] + a * (tri[o + 3 + d] - tri[o + d]) + b * (tri[o + 6 + d] - tri[o + d]);
    }
    return pts;
}

const bboxOf = (P) => {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let k = 0; k < P.length; k += 3) for (let d = 0; d < 3; d++) {
        if (P[k + d] < b[d]) b[d] = P[k + d];
        if (P[k + d] > b[d + 3]) b[d + 3] = P[k + d];
    }
    return b;
};

// three.js rotation about +Y by `deg` (quarter turns are exact): (x, z) -> (x cos + z sin, -x sin + z cos).
const rotY = (P, deg) => {
    const c = Math.round(Math.cos(deg * Math.PI / 180)), s = Math.round(Math.sin(deg * Math.PI / 180));
    const out = new Float64Array(P.length);
    for (let k = 0; k < P.length; k += 3) {
        out[k] = c * P[k] + s * P[k + 2];
        out[k + 1] = P[k + 1];
        out[k + 2] = -s * P[k] + c * P[k + 2];
    }
    return out;
};

// Mean nearest-neighbour displacement from A (shifted by t) to B (for ICP).
function nnMean(A, B, t) {
    const mean = [0, 0, 0];
    for (let i = 0; i < A.length; i += 3) {
        const ax = A[i] + t[0], ay = A[i + 1] + t[1], az = A[i + 2] + t[2];
        let best = Infinity, bj = 0;
        for (let j = 0; j < B.length; j += 3) {
            const dx = B[j] - ax, dy = B[j + 1] - ay, dz = B[j + 2] - az;
            const d = dx * dx + dy * dy + dz * dz;
            if (d < best) { best = d; bj = j; }
        }
        mean[0] += B[bj] - ax; mean[1] += B[bj + 1] - ay; mean[2] += B[bj + 2] - az;
    }
    return mean.map(m => m / (A.length / 3));
}

// Robust symmetric distance: mean nearest-neighbour distance plus its 90th percentile, both ways, so a small but
// misplaced feature counts even when the bodies overlap.
function score(A, B, t) {
    const one = (P, Q, s) => {
        const d = [];
        for (let i = 0; i < P.length; i += 3) {
            const ax = P[i] + s[0], ay = P[i + 1] + s[1], az = P[i + 2] + s[2];
            let best = Infinity;
            for (let j = 0; j < Q.length; j += 3) {
                const dx = Q[j] - ax, dy = Q[j + 1] - ay, dz = Q[j + 2] - az;
                const e = dx * dx + dy * dy + dz * dz;
                if (e < best) best = e;
            }
            d.push(Math.sqrt(best));
        }
        d.sort((x, y) => x - y);
        return d.reduce((a, x) => a + x, 0) / d.length + d[Math.floor(d.length * 0.9)];
    };
    return (one(A, B, t) + one(B, A, t.map(x => -x))) / 2;
}

const snap = (x) => { const v = Math.round(x * 20) / 20; return v === 0 ? 0 : +v.toFixed(2); };

/* ── orientation rules (from brick-builder's header conventions) ── */

// Each rule sees the part turned by the candidate rotation (before the offset): V = unique vertices, B = their bbox,
// S = all studs [x,y,z,dx,dy,dz] and ST = the exposed top studs [x,y,z], turned the same way. It returns true when the turn honours our convention.
const centre = (B, d) => (B[d] + B[d + 3]) / 2;
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const pick = (V, f) => { const out = []; for (let k = 0; k < V.length; k += 3) if (f(V[k], V[k + 1], V[k + 2])) out.push([V[k], V[k + 1], V[k + 2]]); return out; };
const topStuds = (S) => S.filter(s => s[4] > 0.9);
const sideStuds = (S) => S.filter(s => Math.abs(s[4]) < 0.1);

// The wheel's axle: the horizontal axis about which its outline is round. Perpendicular to it the outline is a disc,
// so the corners of the square around that disc are empty.
function axleAlongX(V, B) {
    const corners = (a) => {   // a = 0: axle along X (disc in Z-Y); a = 2: axle along Z (disc in X-Y)
        const u = a === 0 ? 2 : 0, cu = centre(B, u), cy = centre(B, 1);
        const Ru = (B[u + 3] - B[u]) / 2, Ry = (B[4] - B[1]) / 2;
        return pick(V, (x, y, z) => { const p = [x, y, z]; return Math.abs(p[u] - cu) > 0.8 * Ru && Math.abs(y - cy) > 0.8 * Ry; }).length;
    };
    const c0 = corners(0), c2 = corners(2);
    if (c0 !== c2) return c0 < c2;
    // Both outlines look round (a thin disc): the axle is the axis across which the outline is square to Y.
    const ey = B[4] - B[1];
    return Math.abs(ey - (B[5] - B[2])) < Math.abs(ey - (B[3] - B[0]));
}

function rulesFor(id, part) {
    const rules = [];
    if (Math.abs(part.width - part.length) >= 1) {
        // The long side of the footprint: only enforced when the real part is clearly longer one way.
        rules.push(['long side along ' + (part.length > part.width ? 'Z' : 'X'), (V, B) => {
            const ex = B[3] - B[0], ez = B[5] - B[2];
            return Math.abs(ex - ez) < 0.3 || (ez > ex) === (part.length > part.width);
        }]);
    }
    if (part.isSlope || (part.isArch && part.round)) {
        // (6005 is really a one-sided arch: a studded high end and a curve falling to the other; it follows the slopes.)
        // Studded slopes: the studs mark the high end (6091's curve peaks past its stud, so a height test would not do).
        // Stud-less ones: the top band of the part sits on the -Z side.
        rules.push(['high end at -Z', (V, B, S, ST) => ST.length
            ? mean(ST.map(s => s[2])) < centre(B, 2) - 0.05
            : mean(pick(V, (x, y) => y > B[4] - 0.12 * (B[4] - B[1])).map(p => p[2])) < centre(B, 2)]);
    }
    if (part.isWheel || part.isTire) rules.push(['axle along X', (V, B) => axleAlongX(V, B)]);
    if (id === '55423') {
        // The train wheel's flange (its largest radius) is on its -X side.
        rules.push(['flange at -X', (V, B) => {
            const cy = centre(B, 1), cz = centre(B, 2), r = (x, y, z) => Math.hypot(y - cy, z - cz);
            let R = 0; for (let k = 0; k < V.length; k += 3) R = Math.max(R, r(V[k], V[k + 1], V[k + 2]));
            return mean(pick(V, (x, y, z) => r(x, y, z) > R - 0.05).map(p => p[0])) < centre(B, 0);
        }]);
    }
    if (part.isBar && part.length > part.height) rules.push(['bar along Z', (V, B) => B[5] - B[2] > B[3] - B[0]]);
    if (part.isPin) rules.push(['pin along X', (V, B) => B[3] - B[0] > B[5] - B[2]]);
    if (part.isHinge === 'base' && part.height > 0.4) {
        rules.push(['knuckles at +Z', (V, B) => mean(pick(V, (x, y) => y > B[4] - 0.15).map(p => p[2])) > centre(B, 2)]);
    } else if (part.isHinge === 'base') {
        rules.push(['plate at -Z, tongue at +Z', (V, B, S) => mean(topStuds(S).map(s => s[2])) < centre(B, 2)]);
    } else if (part.isHinge === 'top' && part.length === 4) {
        rules.push(['tongue at -Z, plate at +Z', (V, B, S) => mean(topStuds(S).map(s => s[2])) > centre(B, 2)]);
    } else if (part.isHinge === 'top') {
        rules.push(['finger at -Z', (V, B) => mean(pick(V, (x, y) => y < B[1] + 0.15).map(p => p[2])) < centre(B, 2)]);
    } else if (part.isHinge) {
        rules.push(['fingers at +Z', (V, B, S) => mean(topStuds(S).map(s => s[2])) < centre(B, 2)]);
    }
    if (part.isClip === 'vertical' || part.isClip === 'end' || part.isBarHandle) {
        rules.push(['clip at +Z', (V, B, S) => mean(topStuds(S).map(s => s[2])) < centre(B, 2) - 0.05]);
    }
    if (part.isClip === 'horizontal') {
        rules.push(['prongs apart along Z', (V, B) => {
            const top = pick(V, (x, y) => y > B[4] - 0.25);
            const ex = Math.max(...top.map(p => p[0])) - Math.min(...top.map(p => p[0]));
            const ez = Math.max(...top.map(p => p[2])) - Math.min(...top.map(p => p[2]));
            return ez >= ex;
        }]);
    }
    if (part.isFlag) {
        rules.push(['panel in Z-Y, clip rings at -Z', (V, B) => B[3] - B[0] < B[5] - B[2]
            && mean(pick(V, (x) => Math.abs(x - centre(B, 0)) > 0.15).map(p => p[2])) < centre(B, 2)]);
    }
    if (part.isBracket) rules.push(['side studs point +X', (V, B, S) => sideStuds(S).length > 0 && mean(sideStuds(S).map(s => s[3])) > 0.5]);
    if (part.sideStuds === 2) rules.push(['side studs point -X', (V, B, S) => mean(sideStuds(S).map(s => s[3])) < -0.5]);
    if (part.sideStuds === 1 || part.isHeadlight) {
        rules.push(['side stud points -Z', (V, B, S) => sideStuds(S).length ? mean(sideStuds(S).map(s => s[5])) < -0.5 : true]);
    }
    if (part.isWedge) {
        // Narrow end at +Z (hard); `right` keeps the -X edge straight, so that end leans to -X (`left`: +X). The lean is
        // only checked: a turn cannot mirror a part, so a wedge drawn the other way round in our convention is reported.
        const ends = (V, B) => {
            const band = (lo, hi) => pick(V, (x, y, z) => z >= lo && z <= hi).map(p => p[0]);
            const a = band(B[5] - 0.3, B[5]), b = band(B[2], B[2] + 0.3);
            return { a: [Math.min(...a), Math.max(...a)], b: [Math.min(...b), Math.max(...b)] };
        };
        rules.push(['narrow end at +Z', (V, B) => { const e = ends(V, B); return e.a[1] - e.a[0] < e.b[1] - e.b[0] - 0.2; }]);
        rules.push([`'${part.isWedge}' lean (straight edge at ${part.isWedge === 'right' ? '-X' : '+X'})`, (V, B) => {
            const e = ends(V, B), m = (e.a[0] + e.a[1]) / 2;
            return part.isWedge === 'right' ? m < centre(B, 0) : m > centre(B, 0);
        }, 'soft']);
    }
    if (part.quarterRound || part.isRoundCorner) {
        // The square corner is at (-X, -Z): that corner of the bbox is filled, the opposite one is rounded away.
        rules.push(['square corner at -X-Z', (V, B) => {
            const cx = centre(B, 0), cz = centre(B, 2);
            let lo = Infinity, hi = -Infinity;
            for (let k = 0; k < V.length; k += 3) { const s = (V[k] - cx) + (V[k + 2] - cz); lo = Math.min(lo, s); hi = Math.max(hi, s); }
            return -lo > hi + 0.05;
        }]);
    }
    return rules;
}

/* ── fitting ──────────────────────────────────────────────── */

// Offsets along one horizontal axis. With exposed top studs, the stud lattice must land on half-stud positions
// relative to our cell centres (-size/2 + 0.5 + k/2: a jumper's centre stud sits between cells), which fixes the
// offset modulo 0.5; the candidates are the lattice values around the bbox estimate. Without studs: the bbox estimate
// and its ICP refinement, snapped to 1 LDU.
function axisCandidates(est, studCoords, size, icp) {
    if (studCoords.length) {
        const fr = studCoords.map(sx => ((0.5 - size / 2 - sx) % 0.5 + 0.5) % 0.5);
        const ok = fr.every(f => Math.min(Math.abs(f - fr[0]), 0.5 - Math.abs(f - fr[0])) < 0.04);
        if (ok) {
            const out = [];
            for (let k = Math.floor((est - fr[0]) / 0.5) - 1; k <= Math.ceil((est - fr[0]) / 0.5) + 1; k++) out.push(+(fr[0] + k * 0.5).toFixed(4));
            return out.filter(v => Math.abs(v - est) <= 0.76);
        }
    }
    return [...new Set([snap(est), snap(icp)])];
}

// Exposed top studs: pointing up with no surface of the part above them (an "up" stud inside a cavity, such as the
// one under 6091's curved top, does not count). A vertical ray from just above the stud is tested against every triangle.
function exposedTopStuds(studs, baked) {
    const v = baked.v, idx = baked.i;
    const covered = (sx, sy, sz) => {
        for (let t = 0; t < idx.length; t += 3) {
            const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
            const x1 = v[a], z1 = v[a + 2], x2 = v[b], z2 = v[b + 2], x3 = v[c], z3 = v[c + 2];
            const den = (z2 - z3) * (x1 - x3) + (x3 - x2) * (z1 - z3);
            if (Math.abs(den) < 1e-9) continue;
            const l1 = ((z2 - z3) * (sx - x3) + (x3 - x2) * (sz - z3)) / den;
            const l2 = ((z3 - z1) * (sx - x3) + (x1 - x3) * (sz - z3)) / den;
            const l3 = 1 - l1 - l2;
            if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
            if (l1 * v[a + 1] + l2 * v[b + 1] + l3 * v[c + 1] > sy + 0.25) return true;
        }
        return false;
    };
    return studs.filter(s => s[4] > 0.9 && !covered(s[0], s[1], s[2]));
}

function bestOffset(deg, R, proc, studsTop, part) {
    const pb = bboxOf(proc), rb = bboxOf(R);
    const S = rotY(Float64Array.from(studsTop.flatMap(s => s.slice(0, 3))), deg);
    const est = [(pb[0] + pb[3]) / 2 - (rb[0] + rb[3]) / 2, pb[1] - rb[1], (pb[2] + pb[5]) / 2 - (rb[2] + rb[5]) / 2];
    // y: when exposed top studs are the part's highest feature, they stand on the catalog height (this keeps a hinge
    // finger hanging below its plate where it belongs); otherwise the bottoms align (6091's stud sits on a lower step).
    let ty = est[1];
    if (S.length) {
        let top = -Infinity; for (let k = 1; k < S.length; k += 3) top = Math.max(top, S[k]);
        const tyStud = part.height - top;
        if (Math.abs(top + 0.2 - rb[4]) < 0.03 || Math.abs(rb[1] + tyStud - pb[1]) < 0.15) ty = tyStud;
    }
    let t = [est[0], ty, est[2]];
    for (let it = 0; it < 4; it++) {   // a short translation-only ICP: a better guess than the bbox centre for odd shapes
        const f = nnMean(R, proc, t), g = nnMean(proc, R, t.map(x => -x));
        t = [t[0] + (f[0] - g[0]) / 2, ty, t[2] + (f[2] - g[2]) / 2];
    }
    const sx = [], sz = [];
    for (let k = 0; k < S.length; k += 3) { sx.push(S[k]); sz.push(S[k + 2]); }
    let best = null;
    for (const ox of axisCandidates(est[0], sx, part.width, t[0])) {
        for (const oz of axisCandidates(est[2], sz, part.length, t[2])) {
            const off = [ox, snap(ty), oz];
            const d = score(R, proc, off);
            if (!best || d < best.d) best = { deg, off, d };
        }
    }
    return best;
}

function frameFor(id, part, baked, lp) {
    const soup = new Float64Array(baked.i.length * 3);
    baked.i.forEach((vi, k) => { for (let d = 0; d < 3; d++) soup[k * 3 + d] = baked.v[vi * 3 + d]; });
    const proc = sample(builder.getGeometry(part, false).attributes.position.array, 450, 7);
    const bp = sample(soup, 450, 11);
    const V = Float64Array.from(baked.v);
    const studs = lp ? lp.studs : [];
    const studsTop = exposedTopStuds(studs, baked);

    const rules = rulesFor(id, part);
    const results = [];
    for (const deg of [0, 90, 180, 270]) {
        const RV = rotY(V, deg), RB = bboxOf(RV);
        const RS = studs.map(s => { const p = rotY(Float64Array.from([s[0], s[1], s[2]]), deg), d = rotY(Float64Array.from([s[3], s[4], s[5]]), deg); return [...p, ...d]; });
        const RT = studsTop.map(s => [...rotY(Float64Array.from([s[0], s[1], s[2]]), deg)]);
        const failed = rules.filter(([, f, soft]) => !soft && !f(RV, RB, RS, RT)).map(([name]) => name);
        const softFailed = rules.filter(([, f, soft]) => soft && !f(RV, RB, RS, RT)).map(([name]) => name);
        const r = bestOffset(deg, rotY(bp, deg), proc, studsTop, part);
        r.failed = failed;
        r.softFailed = softFailed;
        if (process.env.FRAMES_DEBUG === id) console.log(id, deg, 'failed:', failed, 'score', r.d.toFixed(3), 'off', r.off, 'bbox', RB.map(v => v.toFixed(2)).join(','));
        results.push(r);
    }
    const hard = rules.filter(r => !r[2]);
    const allowed = hard.length ? results.filter(r => !r.failed.length) : results;
    const pool = allowed.length ? allowed : results;
    pool.sort((a, b) => a.d - b.d);
    const tied = pool.filter(r => r.d <= pool[0].d * 1.03).sort((a, b) => a.deg - b.deg);
    return { pick: tied[0], results, rules: rules.map(r => r[0]), ruleless: !allowed.length && hard.length > 0 };
}

/* ── run ──────────────────────────────────────────────────── */

// Parts whose frame is derived from another part's (LDraw places them relative to it).
const FOLLOW = {
    '60601': { frame: '60592', ldu: [0, 0, 0] },     // glass shares the window's origin (see 60592c01.dat)
    '60602': { frame: '60593', ldu: [0, 0, 0] },     // (60593c01.dat)
    '3855': { frame: '3853', ldu: [0, 0, 0] },
    '60623': { frame: '60596', ldu: [-32, 0, 5] },   // door hinge pins in the frame's holes at x = -32, z = 5
};
// The door frame is symmetric; turn it so its hinge holes (LDraw -X) land on our -Z side, where the door hinges.
const FORCE = { '60596': 270 };
// What a reader of the frames must know where the real part and our catalog/engine model disagree (seen in renders).
const NOTES = {
    '3937': 'real hinge axis runs along the 2-stud length at the top of one long side; the real 3938 sits on the same footprint, not in the next cells along +Z',
    '3938': 'real finger runs along the 2-stud length (see 3937)',
    '2429': 'real halves are a 1x2 plate plus a pivot tongue; the offset puts both pivots together when the top sits 2 studs along +Z (engine rule), so the plate fills the middle 2 cells of the 1x4 footprint',
    '2430': 'see 2429',
    '4617': 'stands upright in LDraw (disc in the X-Y plane, axle along Z): lying flat needs a 90° tilt about X',
    '48729': 'stands upright in LDraw (bar along Y, clip on top): lying along Z needs a 90° tilt about X',
    '3957': 'the real antenna is 4 bricks (4.8) tall; the catalog height is 2.4',
    '30374': 'the real bar is 4 studs (4.0) long; the catalog height is 1.6',
    '6005': 'real 6005 is a one-sided arch: a studded high end and a curve falling to the far end; turned like a slope (high end at -Z)',
    '6091': 'real 6091 has its stud on a 1-brick step at -Z; the curve peaks at the middle and falls to +Z',
    '43722': 'real right-hand wedge: drawn with the engine\'s left shape (catalog flags swapped to match the real parts)',
    '43723': 'real left-hand wedge (see 43722)', '41769': 'real right-hand wedge (see 43722)', '41770': 'real left-hand wedge (see 43722)',
};

const frames = {}, report = [];
const bakedOf = (id) => JSON.parse(fs.readFileSync(path.join(PARTS, id + '.json'), 'utf8'));
for (const id of Object.keys(LEGO_PARTS)) {
    if (!fs.existsSync(path.join(PARTS, id + '.json'))) { report.push({ id, missing: true }); continue; }
    const part = LEGO_PARTS[id];
    const baked = bakedOf(id);
    const lp = loadPart((manifest.parts[id] && manifest.parts[id].src) || id, { lowRes: 'studs' });
    let pick, results = [], rules = [], ruleless = false, note = '';
    if (FOLLOW[id]) {
        const f = frames[FOLLOW[id].frame];
        const [lx, ly, lz] = FOLLOW[id].ldu, b = [lx / 20, -ly / 20, -lz / 20];   // LDraw offset -> baked axes
        const t = rotY(Float64Array.from(b), f.rotY);
        pick = { deg: f.rotY, off: f.offset.map((o, d) => snap(o + t[d])), d: NaN };
        note = 'follows ' + FOLLOW[id].frame;
    } else {
        const r = frameFor(id, part, baked, lp);
        ({ results, rules, ruleless } = r);
        pick = FORCE[id] != null ? results.find(x => x.deg === FORCE[id]) : r.pick;
        if (FORCE[id] != null) note = 'turn fixed for the door';
    }
    const offset = pick.off.map(v => +(+v).toFixed(2) || 0);
    // Size check in our frame, from the exact baked bbox turned by the chosen rotation.
    const b = baked.bbox, swap = pick.deg % 180 !== 0;
    const ex = swap ? b[5] - b[2] : b[3] - b[0], ez = swap ? b[3] - b[0] : b[5] - b[2], ey = b[4] - b[1];
    const near = (a, x) => Math.abs(a - x) <= 0.1;
    const issues = [];
    if (!near(ex, part.width)) issues.push(`X ${ex.toFixed(2)} vs width ${part.width}`);
    if (!near(ez, part.length)) issues.push(`Z ${ez.toFixed(2)} vs length ${part.length}`);
    if (!near(ey, part.height) && !near(ey, part.height + 0.2)) issues.push(`Y ${ey.toFixed(2)} vs height ${part.height}`);
    if (ruleless) issues.unshift('no quarter turn satisfies: ' + rules.join(', ') + ' (needs a tilt)');
    if (pick.softFailed && pick.softFailed.length) issues.unshift('mirror image of our convention: ' + pick.softFailed.join(', '));
    frames[id] = { rotY: pick.deg, offset };
    if (issues.length) frames[id].mismatch = issues.join('; ');
    if (NOTES[id]) frames[id].note = NOTES[id];
    const others = results.filter(x => x.deg !== pick.deg).sort((x, y) => x.d - y.d);
    report.push({ id, name: part.name, ldraw: baked.name || (manifest.parts[id] && manifest.parts[id].name), rotY: pick.deg, offset, d: pick.d, next: others[0], rules, issues, note });
}

fs.writeFileSync(OUT, '{\n' + Object.entries(frames).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n}\n');

for (const r of report) {
    if (r.missing) { console.log(r.id.padEnd(7), 'NOT BAKED'); continue; }
    const next = r.next ? `next ${r.next.deg}@${r.next.d.toFixed(3)}${r.next.failed.length ? '(rule)' : ''}` : '';
    console.log(r.id.padEnd(7), ('rotY ' + r.rotY).padEnd(9), ('[' + r.offset.join(', ') + ']').padEnd(20),
        isNaN(r.d) ? ''.padEnd(10) : ('fit ' + r.d.toFixed(3)).padEnd(10), next.padEnd(22), r.note,
        r.rules.length ? ' rules: ' + r.rules.join(', ') : '',
        r.issues.length ? '  SIZE: ' + r.issues.join('; ') : '', VERBOSE ? ' | ' + r.name + ' / ' + r.ldraw : '');
}
const n = report.filter(r => !r.missing).length, bad = report.filter(r => r.issues && r.issues.length);
console.log(`\n${n} catalog parts framed, ${bad.length} with a size note, written ${path.relative(ROOT, OUT)}`);
