// Shardfall: seeded skirmish map generation (no THREE, no DOM).
//
// The map is point-symmetric (180° rotation about the centre), so both players get exactly the same
// terrain: tile (x, z) mirrors to (W-1-x, H-1-z). Team 0 starts bottom-left (low x, high z), team 1 top-right.
// Layout: each base has two home shard fields (one with a spire that regrows it), an expansion field on its
// own flank, two corner fields equidistant from both bases, and one large contested field in the centre.
// Two long ridges with gaps split the map into a centre lane and two flank lanes; a pair of boulders in front
// of each base makes a chokepoint; random rock clusters add cover. The whole map is flood-checked so every
// field and both bases are reachable; sealed pockets are filled with rock.
(function () {
    'use strict';
    const SF = window.SF = window.SF || {};

    // mulberry32: small, fast, good enough, deterministic across engines.
    SF.rng = function (seed) {
        let a = (seed >>> 0) || 0x9e3779b9;
        return function () {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };

    function tryGenerate(seed, W, H, cfg) {
        const rnd = SF.rng(seed);
        const R = (a, b) => a + (b - a) * rnd();
        const n = W * H;
        const tiles = new Uint8Array(n);      // 0 ground, 1 rock, 2 shards
        const shards = new Float32Array(n);
        const spireMask = new Uint8Array(n);
        const reserved = new Uint8Array(n);   // no rock here (fields + margins, bases)
        const k = Math.min(W, H) / 64;
        const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
        const idx = (x, z) => z * W + x;
        const mx = (x) => W - 1 - x, mz = (z) => H - 1 - z;

        const sA = { tx: Math.round(5 * k), tz: H - 3 - Math.round(5 * k) };
        const sB = { tx: W - 3 - sA.tx, tz: H - 3 - sA.tz };
        const cA = { x: sA.tx + 1.5, z: sA.tz + 1.5 };
        const cB = { x: sB.tx + 1.5, z: sB.tz + 1.5 };
        const PER = cfg.ECONOMY.shardPerTile;

        // ---- shard fields (defined in team 0's frame, mirrored) ----
        const fields = [];
        const spires = [];
        function addSpire(x, z) {
            x = Math.floor(x); z = Math.floor(z);
            for (const [px, pz] of [[x, z], [mx(x), mz(z)]]) {
                if (!inb(px, pz) || spireMask[idx(px, pz)]) continue;
                spireMask[idx(px, pz)] = 1;
                tiles[idx(px, pz)] = 0; shards[idx(px, pz)] = 0;
                spires.push({ tx: px, tz: pz });
            }
        }
        function stampField(fx, fz, r, rich, mirror, noise) {
            const x0 = Math.floor(fx - r - 2), x1 = Math.ceil(fx + r + 2);
            const z0 = Math.floor(fz - r - 2), z1 = Math.ceil(fz + r + 2);
            for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
                if (!inb(x, z)) continue;
                const d = Math.hypot(x + 0.5 - fx, z + 0.5 - fz);
                const edge = r + (rnd() - 0.5) * (noise === undefined ? 1.3 : noise);
                const put = (px, pz, amt) => {
                    const i = idx(px, pz);
                    if (spireMask[i]) return;
                    tiles[i] = 2; shards[i] = Math.max(shards[i], amt);
                };
                const res = (px, pz) => { reserved[idx(px, pz)] = 1; };
                if (d < r + 2.2) { res(x, z); if (mirror) res(mx(x), mz(z)); }
                if (d < edge) {
                    const amt = Math.round(PER * (rich ? 0.85 + 0.15 * rnd() : 0.55 + 0.45 * (1 - d / Math.max(1, r))));
                    put(x, z, amt);
                    if (mirror) put(mx(x), mz(z), amt);
                }
            }
            fields.push({ x: fx, z: fz, r });
            if (mirror) fields.push({ x: W - fx, z: H - fz, r });
        }
        // Two identical home fields, each with a spire: one "north" of the base and one "east" of it. Refinery docks
        // always face +Z (south), so a field is easiest to serve from the north; with one field on each axis, each
        // team has exactly one dock-friendly home field (team 0: east, team 1: its south = the mirror of team 0's
        // north) and one awkward one, which keeps the economies even despite the fixed dock direction.
        stampField(cA.x, cA.z - 11 * k, 2.6, false, true, 0);
        addSpire(cA.x, cA.z - 11 * k);
        // (the east field hugs the bottom edge, so its mirror hugs the top edge and can't be docked from the north)
        stampField(cA.x + 11 * k, H - 3.5, 2.6, false, true, 0);
        addSpire(cA.x + 11 * k, H - 3.5);
        // flank expansion
        stampField(7.5 * k, 28.5 * k, 2.8, false, true);
        addSpire(7.5 * k, 28.5 * k);
        // corner fields (equidistant from both bases)
        stampField(13 * k, 13 * k, 3.0, true, true);
        addSpire(13 * k, 13 * k);
        // centre: one big rich field with two spires (self-symmetric because every tile is stamped with its mirror)
        stampField(W / 2, H / 2, 4.2 * Math.max(1, k * 0.9), true, true);
        fields.splice(fields.length - 1, 1); // the centre field's mirror is itself
        addSpire(W / 2 - 2, H / 2 + 1);

        // ---- protect the bases ----
        for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
            const dA = Math.hypot(x + 0.5 - cA.x, z + 0.5 - cA.z), dB = Math.hypot(x + 0.5 - cB.x, z + 0.5 - cB.z);
            if (dA < 11.5 * k || dB < 11.5 * k) reserved[idx(x, z)] = 1;
        }
        for (const s of spires) reserved[idx(s.tx, s.tz)] = 1;

        // ---- rock ----
        function rock(x, z) {
            if (!inb(x, z)) return;
            const i = idx(x, z), j = idx(mx(x), mz(z));
            if (reserved[i] || reserved[j]) return;
            tiles[i] = 1; tiles[j] = 1; shards[i] = 0; shards[j] = 0;
        }
        function blob(cx, cz, rx, rz, rot) {
            const ext = Math.ceil(Math.max(rx, rz) + 1.5);
            const c = Math.cos(rot), s = Math.sin(rot);
            for (let z = Math.floor(cz - ext); z <= Math.ceil(cz + ext); z++) for (let x = Math.floor(cx - ext); x <= Math.ceil(cx + ext); x++) {
                const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
                const u = (dx * c + dz * s) / rx, v = (-dx * s + dz * c) / rz;
                if (u * u + v * v < 1 + (rnd() - 0.5) * 0.5) rock(x, z);
            }
        }
        function ridge(x0, z0, x1, z1, thick, gaps) {
            const L = Math.hypot(x1 - x0, z1 - z0);
            for (let d = 0; d <= L; d += 0.5) {
                const t = d / L;
                if (gaps.some(([a, b]) => t > a && t < b)) continue;
                const r = thick * (0.75 + 0.5 * rnd());
                blob(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, r, r, 0);
            }
        }
        // Flank ridge, parallel to the base-to-base line (x + z = const), offset toward the top-left corner.
        const g1 = R(0.28, 0.4), g2 = R(0.6, 0.72);
        ridge(12 * k, 33 * k, 33 * k, 12 * k, 1.1, [[g1 - 0.06, g1 + 0.06], [g2 - 0.06, g2 + 0.06]]);
        // Gate in front of each base on the centre lane.
        {
            const px = cA.x + (W / 2 - cA.x) * 0.55, pz = cA.z + (H / 2 - cA.z) * 0.55;
            const off = R(3.2, 4.0) * k;
            blob(px + off * 0.7071, pz + off * 0.7071, R(1.3, 1.9), R(1.1, 1.6), rnd() * 3);
            blob(px - off * 0.7071, pz - off * 0.7071, R(1.3, 1.9), R(1.1, 1.6), rnd() * 3);
        }
        // Random clusters (each one is mirrored by rock()).
        const nb = Math.round((6 + rnd() * 4) * k * k);
        for (let b = 0; b < nb; b++) {
            const cx = R(3, W - 3), cz = R(3, H - 3);
            blob(cx, cz, R(0.9, 2.3), R(0.8, 1.8), rnd() * Math.PI);
        }
        // Cliffs along the edges.
        for (let b = 0; b < Math.round(5 * k); b++) {
            const side = Math.floor(rnd() * 4), t = R(4, W - 4);
            const cx = side === 0 ? 0 : side === 1 ? W - 1 : t;
            const cz = side === 2 ? 0 : side === 3 ? H - 1 : t;
            blob(cx, cz, R(1.5, 3.2), R(1.2, 2.4), rnd() * Math.PI);
        }

        // ---- connectivity ----
        const block = (i) => tiles[i] === 1 || spireMask[i] === 1;
        const seen = new Uint8Array(n);
        const q = new Int32Array(n);
        const start = idx(sA.tx + 1, sA.tz + 1);
        if (block(start)) return null;
        let qh = 0, qt = 0; q[qt++] = start; seen[start] = 1;
        while (qh < qt) {
            const i = q[qh++], x = i % W, z = (i / W) | 0;
            const nb4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (const [dx, dz] of nb4) {
                const nx = x + dx, nz = z + dz;
                if (!inb(nx, nz)) continue;
                const j = idx(nx, nz);
                if (seen[j] || block(j)) continue;
                seen[j] = 1; q[qt++] = j;
            }
        }
        if (!seen[idx(sB.tx + 1, sB.tz + 1)]) return null;
        for (const f of fields) {
            let ok = false;
            for (let z = Math.floor(f.z - f.r - 1); z <= f.z + f.r + 1 && !ok; z++) for (let x = Math.floor(f.x - f.r - 1); x <= f.x + f.r + 1; x++) {
                if (inb(x, z) && tiles[idx(x, z)] === 2 && seen[idx(x, z)]) { ok = true; break; }
            }
            if (!ok) return null;
        }
        // Fill sealed pockets (also shards that cannot be reached).
        for (let i = 0; i < n; i++) if (!seen[i] && !block(i)) { tiles[i] = 1; shards[i] = 0; }
        // Bases must have room to build: at least ~75% of the 9-tile disc around each core is open ground.
        for (const c of [cA, cB]) {
            let open = 0, tot = 0;
            for (let z = Math.floor(c.z - 9); z <= c.z + 9; z++) for (let x = Math.floor(c.x - 9); x <= c.x + 9; x++) {
                if (!inb(x, z) || Math.hypot(x + 0.5 - c.x, z + 0.5 - c.z) > 9) continue;
                tot++; if (tiles[idx(x, z)] === 0) open++;
            }
            if (open < tot * 0.6) return null;
        }

        // ---- cosmetic decor (deterministic; never affects gameplay) ----
        const decor = [];
        const nearBase = (x, z, r) => Math.hypot(x - cA.x, z - cA.z) < r || Math.hypot(x - cB.x, z - cB.z) < r;
        const pushMirrored = (d) => {
            decor.push(d);
            decor.push({ type: d.type, x: W - d.x, z: H - d.z, s: d.s, rot: d.rot + Math.PI });
        };
        for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
            const i = idx(x, z);
            if (i > idx(mx(x), mz(z))) continue;           // generate one half, mirror the other
            const fx = x + 0.5 + (rnd() - 0.5) * 0.5, fz = z + 0.5 + (rnd() - 0.5) * 0.5;
            if (tiles[i] === 1) {
                if (rnd() < 0.45) pushMirrored({ type: 'rock', x: fx, z: fz, s: R(0.7, 1.5), rot: rnd() * Math.PI * 2 });
            } else if (tiles[i] === 0 && !spireMask[i]) {
                const r = rnd();
                // Is this tile next to rock? Trees and boulders gather along the cliffs and edges.
                let nearRock = false;
                for (let dz = -1; dz <= 1 && !nearRock; dz++) for (let dx = -1; dx <= 1; dx++) {
                    const ax = x + dx, az = z + dz;
                    if (!inb(ax, az) || tiles[idx(ax, az)] === 1) { nearRock = true; break; }
                }
                if (nearBase(x + 0.5, z + 0.5, 15 * k)) continue;
                if (nearRock && r < 0.22) pushMirrored({ type: 'tree', x: fx, z: fz, s: R(0.6, 1.2), rot: rnd() * Math.PI * 2 });
                else if (nearRock && r < 0.3) pushMirrored({ type: 'boulder', x: fx, z: fz, s: R(0.3, 0.6), rot: rnd() * Math.PI * 2 });
                else if (r < 0.012) pushMirrored({ type: 'boulder', x: fx, z: fz, s: R(0.25, 0.5), rot: rnd() * Math.PI * 2 });
                else if (r < 0.02) pushMirrored({ type: 'tree', x: fx, z: fz, s: R(0.5, 0.9), rot: rnd() * Math.PI * 2 });
            }
        }
        // Small crystals around the spires.
        for (const s of spires) {
            if (idx(s.tx, s.tz) > idx(mx(s.tx), mz(s.tz))) continue;
            for (let c = 0; c < 4; c++) {
                const a = rnd() * Math.PI * 2, d = R(0.55, 1.3);
                pushMirrored({ type: 'crystal', x: s.tx + 0.5 + Math.cos(a) * d, z: s.tz + 0.5 + Math.sin(a) * d, s: R(0.25, 0.45), rot: rnd() * Math.PI * 2 });
            }
        }

        return { w: W, h: H, tiles, shards, spires, starts: [sA, sB], decor, fields, seed, shardVersion: 0 };
    }

    // Open fallback map (never expected to be needed).
    function openMap(seed, W, H, cfg) {
        const tiles = new Uint8Array(W * H), shards = new Float32Array(W * H);
        const sA = { tx: 5, tz: H - 8 }, sB = { tx: W - 8, tz: 5 };
        const fields = [];
        for (const f of [{ x: 7, z: H - 18 }, { x: W - 7, z: 18 }, { x: W / 2, z: H / 2 }]) {
            fields.push({ x: f.x, z: f.z, r: 3 });
            for (let z = Math.floor(f.z - 3); z <= f.z + 3; z++) for (let x = Math.floor(f.x - 3); x <= f.x + 3; x++) {
                if (x >= 0 && z >= 0 && x < W && z < H && Math.hypot(x + 0.5 - f.x, z + 0.5 - f.z) < 3) { tiles[z * W + x] = 2; shards[z * W + x] = cfg.ECONOMY.shardPerTile; }
            }
        }
        return { w: W, h: H, tiles, shards, spires: [], starts: [sA, sB], decor: [], fields, seed, shardVersion: 0 };
    }

    // SF.generateMap({ seed, size }) → map (see the simulation contract). Extra fields: `fields` [{x, z, r}]
    // (shard field centres, world units), `seed`, `shardVersion` (the sim bumps it whenever shard tiles appear
    // or disappear, so a renderer can rebuild its shard meshes lazily).
    SF.generateMap = function (opts) {
        const cfg = window.SF_CONFIG;
        const size = Math.max(40, Math.min(128, (opts && opts.size) || 64));
        const seed = ((opts && opts.seed) >>> 0) || 1;
        for (let attempt = 0; attempt < 40; attempt++) {
            const m = tryGenerate((seed + attempt * 7919) >>> 0, size, size, cfg);
            if (m) { m.seed = seed; return m; }
        }
        return openMap(seed, size, size, cfg);
    };
})();
