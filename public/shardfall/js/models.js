// Shardfall: procedural low-poly models (window.SF_MODELS).
//
// Every model is built once per type (+ team colour), its static parts merged into one mesh per material so a
// unit costs only a handful of draw calls, and each call returns a clone that shares geometry and materials.
//
// Conventions (1 world unit = 1 tile, y up, ground at y = 0):
//   - units face +X, origin at the ground centre, fit inside a (2 × radius) square;
//   - buildings have their origin at the footprint centre on the ground, fit inside w × d tiles, "south" is +Z
//     (refinery dock pad, factory hangar door and barracks door are on the +Z side);
//   - the renderer turns a model to a sim angle with group.rotation.y = -angle (sim angle 0 = +X, towards +Z).
// Named children the renderer may animate:
//   'turret'  rotate .rotation.y (relative to the hull)          tank, turret building
//   'barrel'  .rotation.z = elevation (+ up), .position.x recoil  tank, artillery, turret building
//   'muzzle'  empty Object3D at the barrel tip (flash origin)     every armed unit and the turret building
//   userData.wheels  Object3Ds to spin: .rotation.z -= distance / userData.wheelRadius (rolling towards +X)
//   'arm'     harvester scoop, .rotation.z (0 rest, negative = lowered to dig, about -0.35 max)
//   'cargo'   harvester load, .scale.y = carry / capacity (0..1)
//   'rotor'   radar dish, .rotation.y += speed * dt
//   'flag'    core flag, pivots at the pole: wave .rotation.y a little
//   'crane'   core crane, may slowly swing .rotation.y
//   'dock'    refinery: empty Object3D at the unload pad centre (local, on the +Z edge)
//   'exit'    factory / barracks: empty Object3D at the door, just inside the +Z edge
//   userData.height = top of the main body (health bars / selection rings).
window.SF_MODELS = (() => {
    'use strict';
    const T = THREE;
    const CFG = window.SF_CONFIG || { UNITS: {}, BUILDINGS: {} };

    // ---------------------------------------------------------------- colours & materials
    const PAL = {
        shard: 0x40f0c8, shardDeep: 0x1aa88e, energy: 0x8ffcff, tech: 0xc29bff, warn: 0xffb52e,
        rock: 0x7d746a, ground: 0x5c5446,
    };
    const lin = (hex) => new T.Color(hex).convertSRGBToLinear();
    const lighten = (hex, k) => {
        const c = new T.Color(hex);
        c.lerp(new T.Color(0xffffff), k);
        return c.getHex();
    };
    const darken = (hex, k) => {
        const c = new T.Color(hex);
        c.multiplyScalar(1 - k);
        return c.getHex();
    };

    // Part colours. Every model uses just two shared materials: a lit "body" material and a "glow" material, both
    // driven by vertex colours, so a model costs one or two draw calls per animated node. Glow parts store their
    // emission colour (times intensity) in the vertex colour.
    //   key: [sRGB colour, glow intensity (0 = lit body part)]
    const COLORS = {
        hull:      [0x737d89, 0],
        hullDark:  [0x3e4550, 0],
        metal:     [0xb3bcc6, 0],
        dark:      [0x1d2127, 0],
        tread:     [0x2b2e33, 0],
        concrete:  [0x8f918b, 0],
        pad:       [0x4a4d50, 0],
        suit:      [0x3b4149, 0],
        hazard:    [0xe2a72a, 0],
        dish:      [0xd5dce3, 0],
        rock:      [0x7d746a, 0],
        rockDark:  [0x575048, 0],
        rockLight: [0x9d9387, 0],
        amethyst:  [0x7a5cc8, 0],
        trunk:     [0x5b4262, 0],
        canopy:    [0x3a8c72, 0],
        glass:     [0x6fe8ff, 0.9],
        warn:      [PAL.warn, 1.1],
        redLight:  [0xff3b30, 1.3],
        energy:    [PAL.energy, 1.4],
        tech:      [PAL.tech, 1.0],
        shard:     [PAL.shard, 0.95],
        shardDeep: [PAL.shardDeep, 0.6],
        pod:       [0xffb347, 1.2],
    };
    function colorOf(key, team) {
        if (key === 'team') return [darken(team, 0.08), 0];   // a touch darker so bright sun does not wash it out
        if (key === 'teamDark') return [darken(team, 0.45), 0];
        if (key === 'teamGlow') return [lighten(team, 0.45), 1.0];
        return COLORS[key] || COLORS.hull;
    }
    const isGlow = (key) => colorOf(key, 0)[1] > 0;
    const MATERIALS = {
        body: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.22, flatShading: true }),
        glow: new T.MeshStandardMaterial({ vertexColors: true, color: 0x3a3a3a, roughness: 0.4, metalness: 0.0, flatShading: true,
            emissive: 0xffffff, emissiveIntensity: 1 }),
    };
    MATERIALS.body.name = 'sf-body';
    MATERIALS.glow.name = 'sf-glow';
    // emission = vertex colour (r128 chunk names)
    MATERIALS.glow.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor;');
    };
    MATERIALS.glow.customProgramCacheKey = () => 'sf-glow-vcolor-emissive';

    // ---------------------------------------------------------------- geometry primitives (cached)
    // Vertical primitives sit on y = 0 (base) so parts stack by their base height.
    const geoCache = new Map();
    function cached(key, make) {
        let g = geoCache.get(key);
        if (!g) { g = make(); geoCache.set(key, g); }
        return g;
    }
    const box = (w, h, d) => cached(`box${w},${h},${d}`, () => new T.BoxGeometry(w, h, d).translate(0, h / 2, 0));
    const cyl = (rt, rb, h, s = 8) => cached(`cyl${rt},${rb},${h},${s}`, () => new T.CylinderGeometry(rt, rb, h, s).translate(0, h / 2, 0));
    // A rod along +X from x = 0 to x = len (barrels, tubes).
    const rodX = (rt, rb, len, s = 6) => cached(`rod${rt},${rb},${len},${s}`, () =>
        new T.CylinderGeometry(rt, rb, len, s).rotateZ(-Math.PI / 2).translate(len / 2, 0, 0));
    // A rod along Z centred at the origin (axles, drums).
    const rodZ = (r, len, s = 8) => cached(`rodz${r},${len},${s}`, () => new T.CylinderGeometry(r, r, len, s).rotateX(Math.PI / 2));
    const wheel = (r, w, s = 8) => cached(`whl${r},${w},${s}`, () => new T.CylinderGeometry(r, r, w, s).rotateX(Math.PI / 2));
    const sph = (r, ws = 8, hs = 6) => cached(`sph${r},${ws},${hs}`, () => new T.SphereGeometry(r, ws, hs));
    const ico = (r, det = 0) => cached(`ico${r},${det}`, () => new T.IcosahedronGeometry(r, det));
    const dome = (r, ws = 10, hs = 4) => cached(`dome${r},${ws},${hs}`, () => new T.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2));
    const cone = (r, h, s = 6) => cached(`cone${r},${h},${s}`, () => new T.ConeGeometry(r, h, s).translate(0, h / 2, 0));
    const lathe = (key, pts, s = 10) => cached(`lathe${key}`, () => new T.LatheGeometry(pts.map(([x, y]) => new T.Vector2(x, y)), s));
    // Octagonal slab with flats facing the axes; `w` is the width across flats.
    const octo = (w, h) => cached(`oct${w},${h}`, () => new T.CylinderGeometry(w / 2 / Math.cos(Math.PI / 8), w / 2 / Math.cos(Math.PI / 8), h, 8)
        .rotateY(Math.PI / 8).translate(0, h / 2, 0));

    // A six-faced block from a bottom rectangle (bw × bd at y = 0) to a top rectangle (tw × td at y = h) whose
    // centre is shifted by (ox, oz): tapered hulls, wedges, sloped roofs. Faces are wound outwards automatically.
    function hexa(bw, bd, tw, td, h, ox = 0, oz = 0) {
        return cached(`hexa${bw},${bd},${tw},${td},${h},${ox},${oz}`, () => {
            const b = [[-bw / 2, 0, -bd / 2], [bw / 2, 0, -bd / 2], [bw / 2, 0, bd / 2], [-bw / 2, 0, bd / 2]];
            const t = [[ox - tw / 2, h, oz - td / 2], [ox + tw / 2, h, oz - td / 2], [ox + tw / 2, h, oz + td / 2], [ox - tw / 2, h, oz + td / 2]];
            return quadsGeometry([[b[0], b[1], b[2], b[3]], [t[0], t[1], t[2], t[3]],
                [b[0], b[1], t[1], t[0]], [b[1], b[2], t[2], t[1]], [b[2], b[3], t[3], t[2]], [b[3], b[0], t[0], t[3]]]);
        });
    }
    function quadsGeometry(quads) {
        const cen = new T.Vector3();
        let n = 0;
        for (const q of quads) for (const p of q) { cen.x += p[0]; cen.y += p[1]; cen.z += p[2]; n++; }
        cen.divideScalar(n);
        const pos = [];
        const A = new T.Vector3(), B = new T.Vector3(), C = new T.Vector3(), N = new T.Vector3(), M = new T.Vector3();
        for (const q0 of quads) {
            let q = q0;
            A.fromArray(q[0]); B.fromArray(q[1]); C.fromArray(q[2]);
            N.subVectors(B, A).cross(C.sub(A));
            M.set(0, 0, 0);
            for (const p of q) { M.x += p[0] / q.length; M.y += p[1] / q.length; M.z += p[2] / q.length; }
            if (N.dot(M.sub(cen)) < 0) q = q.slice().reverse();
            pos.push(...q[0], ...q[1], ...q[2]);
            if (q.length === 4) pos.push(...q[0], ...q[2], ...q[3]);
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        g.computeVertexNormals();
        return g;
    }
    // A low-poly crystal: an n-sided prism with a pointed top (and a short point below ground).
    const crystalGeo = (r, h, s = 5) => cached(`cry${r},${h},${s}`, () => {
        const pts = [[0, -0.05 * h], [r * 0.7, 0], [r, h * 0.62], [0, h]];
        return new T.LatheGeometry(pts.map(([x, y]) => new T.Vector2(x, y)), s);
    });
    // Both faces of an open surface (the radar dish), so no double-sided material is needed.
    function doubleSided(g) {
        const a = (g.index ? g.toNonIndexed() : g).attributes.position.array;
        const out = new Float32Array(a.length * 2);
        out.set(a);
        for (let i = 0; i < a.length; i += 9) {
            out.set(a.subarray(i, i + 3), a.length + i);
            out.set(a.subarray(i + 6, i + 9), a.length + i + 3);
            out.set(a.subarray(i + 3, i + 6), a.length + i + 6);
        }
        const r = new T.BufferGeometry();
        r.setAttribute('position', new T.BufferAttribute(out, 3));
        r.computeVertexNormals();
        return r;
    }
    // Deterministic pseudo random (decor variety without breaking the cache).
    function rng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    // An icosahedron rock with jittered vertices (welded so the faces stay closed).
    const rockGeo = (key, r, seed, sx = 1, sy = 1, sz = 1) => cached(`rock${key}`, () => {
        const base = new T.IcosahedronGeometry(r, 0);
        const p = base.attributes.position;
        const rand = rng(seed);
        const jit = new Map();
        for (let i = 0; i < p.count; i++) {
            const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
            if (!jit.has(k)) jit.set(k, 0.78 + rand() * 0.4);
            const f = jit.get(k);
            p.setXYZ(i, p.getX(i) * f * sx, p.getY(i) * f * sy, p.getZ(i) * f * sz);
        }
        base.computeVertexNormals();
        return base;
    });

    // ---------------------------------------------------------------- builder: parts → merged meshes per node
    const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();
    class Builder {
        constructor() {
            this.root = new T.Group();
            this.parts = new Map([[this.root, new Map()]]);
        }
        // An animatable pivot. rot = [rx, ry, rz].
        node(name, parent, x = 0, y = 0, z = 0, rot, scl) {
            const o = new T.Group();
            o.name = name;
            o.position.set(x, y, z);
            if (rot) o.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
            if (scl) o.scale.set(scl[0], scl[1], scl[2]);
            (parent || this.cur || this.root).add(o);
            this.parts.set(o, new Map());
            return o;
        }
        // An empty marker (muzzle, dock, exit).
        marker(name, parent, x, y, z) {
            const o = new T.Object3D();
            o.name = name;
            o.position.set(x, y, z);
            (parent || this.cur || this.root).add(o);
            return o;
        }
        // Adds geometry `g` with material key `mk` at (x, y, z), rotation [rx, ry, rz], scale [sx, sy, sz] to node.
        add(g, mk, x = 0, y = 0, z = 0, rot, scl, node) {
            const n = node || this.cur || this.root;
            _e.set(rot ? rot[0] || 0 : 0, rot ? rot[1] || 0 : 0, rot ? rot[2] || 0 : 0);
            _q.setFromEuler(_e);
            _s.set(scl ? scl[0] : 1, scl ? scl[1] : 1, scl ? scl[2] : 1);
            _m.compose(_v.set(x, y, z), _q, _s);
            const byMat = this.parts.get(n);
            if (!byMat.has(mk)) byMat.set(mk, []);
            byMat.get(mk).push([g, _m.clone()]);
            return this;
        }
        // The same part mirrored across z = 0 (left/right pairs).
        pair(g, mk, x, y, z, rot, scl, node) {
            this.add(g, mk, x, y, z, rot, scl, node);
            const r2 = rot ? [-(rot[0] || 0), -(rot[1] || 0), rot[2] || 0] : undefined;
            return this.add(g, mk, x, y, -z, r2, scl, node);
        }
        build(userData) {
            const team = Builder.team;
            for (const [node, byMat] of this.parts) {
                const body = [], glow = [];
                for (const [mk, list] of byMat) {
                    const [hex, k] = colorOf(mk, team);
                    const c = lin(hex);
                    if (k > 0) c.multiplyScalar(k);
                    for (const [g, m] of list) (k > 0 ? glow : body).push([g, m, c]);
                }
                for (const [list, mat] of [[body, MATERIALS.body], [glow, MATERIALS.glow]]) {
                    if (!list.length) continue;
                    const mesh = new T.Mesh(mergeParts(list), mat);
                    if (mat === MATERIALS.glow) mesh.userData.glow = true;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    node.add(mesh);
                }
            }
            Object.assign(this.root.userData, userData);
            return this.root;
        }
    }
    Builder.team = 0x888888;
    function mergeParts(list) {
        const geos = list.map(([g, m]) => {
            const c = g.index ? g.toNonIndexed() : g.clone();
            c.applyMatrix4(m);
            // a mirrored (negative-determinant) transform flips the winding: flip it back
            if (m.determinant() < 0) {
                const p = c.attributes.position.array;
                for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) {
                    const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t;
                }
            }
            return c;
        });
        let n = 0;
        for (const g of geos) n += g.attributes.position.count;
        const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
        let o = 0;
        geos.forEach((g, i) => {
            const a = g.attributes.position.array, c = list[i][2];
            pos.set(a, o);
            for (let j = o; j < o + a.length; j += 3) { col[j] = c.r; col[j + 1] = c.g; col[j + 2] = c.b; }
            o += a.length;
            g.dispose();
        });
        const out = new T.BufferGeometry();
        out.setAttribute('position', new T.BufferAttribute(pos, 3));
        out.setAttribute('color', new T.BufferAttribute(col, 3));
        out.computeVertexNormals();
        out.computeBoundingSphere();
        return out;
    }

    // ---------------------------------------------------------------- shared vehicle bits
    function addWheel(b, wheels, x, y, z, r, w, hubMk = 'metal') {
        const n = b.node('wheel', null, x, y, z);
        b.add(wheel(r, w, 8), 'tread', 0, 0, 0, null, null, n);
        b.add(wheel(r * 0.5, w * 1.08, 6), hubMk, 0, 0, 0, null, null, n);
        wheels.push(n);
        return n;
    }

    // ---------------------------------------------------------------- units
    // Infantry are modelled at human-ish proportions inside the footprint, then stretched a little (a 'body' node)
    // so they stay readable from the RTS camera.
    function infantryBody(b, helmetRound) {
        b.cur = b.node('body', b.root, 0, 0, 0, null, [1.1, 1.18, 1.1]);
        // legs (a small stride), hips, armoured torso, shoulder pads, arms, head
        b.add(box(0.075, 0.17, 0.07), 'suit', 0.025, 0, 0.05);
        b.add(box(0.075, 0.17, 0.07), 'suit', -0.02, 0, -0.05);
        b.add(box(0.06, 0.03, 0.075), 'dark', 0.035, 0, 0.05);
        b.add(box(0.06, 0.03, 0.075), 'dark', -0.01, 0, -0.05);
        b.add(box(0.1, 0.05, 0.17), 'suit', 0, 0.15, 0);
        b.add(hexa(0.11, 0.18, 0.14, 0.23, 0.15), 'team', 0, 0.19, 0);
        b.add(box(0.03, 0.05, 0.07), 'teamGlow', 0.065, 0.24, 0);   // chest light
        b.pair(box(0.09, 0.055, 0.075), 'team', 0, 0.305, 0.12);
        b.add(box(0.07, 0.12, 0.13), 'hullDark', -0.1, 0.18, 0);     // backpack
        if (helmetRound) {
            b.add(ico(0.068, 0), 'team', 0, 0.395, 0);
            b.add(box(0.035, 0.03, 0.1), 'glass', 0.05, 0.375, 0);
        } else {
            b.add(hexa(0.12, 0.12, 0.09, 0.1, 0.1), 'team', 0, 0.335, 0);
            b.add(box(0.03, 0.035, 0.1), 'warn', 0.055, 0.375, 0);
            b.add(cyl(0.006, 0.006, 0.12, 3), 'metal', -0.04, 0.42, -0.04);
        }
    }

    function makeRifleman() {
        const b = new Builder();
        infantryBody(b, true);
        b.pair(box(0.05, 0.12, 0.05), 'suit', 0.03, 0.19, 0.125);       // arms
        b.add(box(0.24, 0.04, 0.035), 'dark', 0.08, 0.235, 0.105);     // rifle
        b.add(box(0.07, 0.025, 0.02), 'metal', 0.07, 0.275, 0.105);
        b.add(box(0.02, 0.02, 0.02), 'glass', 0.04, 0.29, 0.105);
        b.marker('muzzle', null, 0.2, 0.255, 0.105);
        return b.build({ height: 0.55 });
    }

    function makeRocketeer() {
        const b = new Builder();
        infantryBody(b, false);
        b.add(box(0.05, 0.12, 0.05), 'suit', 0.03, 0.19, -0.125);
        b.add(box(0.11, 0.05, 0.05), 'suit', 0.05, 0.27, 0.125);       // raised arm holding the tube
        // shoulder launcher: a fat tube over the right shoulder, team band, glowing warhead
        b.add(rodX(0.05, 0.05, 0.3, 8), 'metal', -0.16, 0.36, 0.115);
        b.add(rodX(0.056, 0.056, 0.08, 8), 'team', -0.08, 0.36, 0.115);
        b.add(rodX(0.06, 0.06, 0.03, 8), 'hullDark', 0.12, 0.36, 0.115);
        b.add(rodX(0.04, 0.0, 0.05, 6), 'warn', 0.145, 0.36, 0.115);
        b.add(rodX(0.06, 0.06, 0.03, 8), 'hullDark', -0.17, 0.36, 0.115);
        b.add(box(0.04, 0.06, 0.03), 'dark', 0.0, 0.3, 0.115);
        // rocket pack on the back
        b.add(box(0.06, 0.06, 0.15), 'teamDark', -0.11, 0.3, 0);
        b.pair(cyl(0.022, 0.022, 0.08, 5), 'metal', -0.11, 0.33, 0.04);
        b.pair(cone(0.022, 0.035, 5), 'warn', -0.11, 0.41, 0.04);
        b.marker('muzzle', null, 0.195, 0.36, 0.115);
        return b.build({ height: 0.55 });
    }

    function makeTank() {
        const b = new Builder();
        // treads with sloped ends, road-wheel hubs on the outside, fenders in team colour
        b.pair(hexa(0.82, 0.2, 1.02, 0.2, 0.2), 'tread', 0, 0, 0.31);
        for (const x of [-0.3, -0.1, 0.1, 0.3]) b.pair(wheel(0.07, 0.02, 6), 'hullDark', x, 0.08, 0.415);
        b.pair(box(1.04, 0.04, 0.24), 'teamDark', 0, 0.2, 0.31);
        b.pair(box(0.08, 0.05, 0.24), 'hullDark', 0.48, 0.17, 0.31, [0, 0, 0.5]);
        // hull: sloped glacis at the front (+X)
        b.add(hexa(0.92, 0.44, 0.72, 0.4, 0.2, -0.09, 0), 'hull', 0, 0.1, 0);
        b.add(box(0.26, 0.03, 0.38), 'hullDark', -0.33, 0.3, 0);         // engine deck
        b.pair(box(0.08, 0.03, 0.06), 'dark', -0.42, 0.33, 0.1);         // exhausts
        b.pair(box(0.04, 0.03, 0.05), 'warn', 0.41, 0.16, 0.15);          // headlights
        // turret (team colour), hatch, sensor light; barrel with muzzle brake
        const tur = b.node('turret', null, 0, 0.3, 0);
        b.add(hexa(0.5, 0.42, 0.36, 0.32, 0.17, -0.02, 0), 'team', 0, 0, 0, null, null, tur);
        b.add(box(0.14, 0.05, 0.4), 'hullDark', -0.22, 0.02, 0, null, null, tur);     // rear bustle
        b.add(cyl(0.07, 0.08, 0.04, 6), 'hullDark', -0.06, 0.17, 0.06, null, null, tur);
        b.add(box(0.04, 0.04, 0.2), 'teamGlow', 0.13, 0.1, 0, null, null, tur);
        b.add(cyl(0.008, 0.008, 0.18, 3), 'metal', -0.2, 0.17, -0.12, null, null, tur);
        const bar = b.node('barrel', tur, 0.17, 0.09, 0);
        b.add(rodX(0.055, 0.06, 0.08, 6), 'hullDark', 0, 0, 0, null, null, bar);    // mantlet
        b.add(rodX(0.032, 0.036, 0.3, 6), 'metal', 0.06, 0, 0, null, null, bar);
        b.add(rodX(0.045, 0.045, 0.06, 6), 'hullDark', 0.32, 0, 0, null, null, bar);
        b.marker('muzzle', bar, 0.39, 0, 0);
        return b.build({ height: 0.6, wheels: [] });
    }

    function makeArtillery() {
        const b = new Builder();
        const wheels = [];
        // light, low chassis on six wheels
        b.add(hexa(0.86, 0.34, 0.74, 0.3, 0.12, -0.02, 0), 'hull', 0, 0.12, 0);
        b.pair(box(0.84, 0.03, 0.12), 'team', -0.02, 0.24, 0.17);          // side plates (team)
        b.add(box(0.26, 0.14, 0.3), 'hullDark', 0.25, 0.24, 0);             // driver cab at the front
        b.add(box(0.03, 0.05, 0.24), 'glass', 0.385, 0.31, 0);
        b.add(box(0.2, 0.025, 0.3), 'team', 0.25, 0.38, 0);
        for (const x of [-0.3, 0.0, 0.28]) {
            addWheel(b, wheels, x, 0.105, 0.24, 0.105, 0.08);
            addWheel(b, wheels, x, 0.105, -0.24, 0.105, 0.08);
        }
        // stabiliser legs splayed at the rear
        b.pair(box(0.24, 0.035, 0.04), 'hullDark', -0.42, 0.06, 0.2, [0, 0.6, -0.25]);
        b.pair(box(0.06, 0.02, 0.07), 'dark', -0.5, 0, 0.27);
        // gun mount + long elevated barrel
        b.add(cyl(0.12, 0.14, 0.08, 8), 'hullDark', -0.16, 0.24, 0);
        b.pair(box(0.2, 0.16, 0.025), 'team', -0.14, 0.3, 0.085);           // trunnion cheeks (team)
        const bar = b.node('barrel', null, -0.16, 0.4, 0, [0, 0, 0.38]);
        b.add(rodX(0.06, 0.06, 0.22, 6), 'hullDark', -0.1, 0, 0, null, null, bar);  // breech + recoil cylinder
        b.add(rodX(0.03, 0.034, 0.62, 6), 'metal', 0.1, 0, 0, null, null, bar);
        b.add(rodX(0.042, 0.042, 0.05, 6), 'hullDark', 0.66, 0, 0, null, null, bar);
        b.add(box(0.03, 0.03, 0.03), 'warn', 0.0, 0.06, 0, null, null, bar);
        b.marker('muzzle', bar, 0.72, 0, 0);
        return b.build({ height: 0.62, wheels, wheelRadius: 0.105 });
    }

    function makeBuggy() {
        const b = new Builder();
        const wheels = [];
        // low wedge chassis, team hood and rear deck, roll cage, twin MG on a post
        b.add(hexa(0.68, 0.32, 0.6, 0.3, 0.1, -0.03, 0), 'hullDark', 0, 0.1, 0);
        b.add(hexa(0.3, 0.34, 0.18, 0.28, 0.07, -0.05, 0), 'team', 0.2, 0.2, 0);     // hood
        b.add(box(0.2, 0.06, 0.36), 'team', -0.24, 0.2, 0);                          // rear deck
        b.pair(box(0.04, 0.03, 0.06), 'warn', 0.34, 0.16, 0.1);                       // headlights
        b.add(box(0.12, 0.08, 0.2), 'dark', -0.03, 0.2, 0);                           // seat
        b.pair(box(0.03, 0.16, 0.03), 'metal', -0.12, 0.2, 0.13);                     // roll cage
        b.pair(box(0.03, 0.03, 0.03), 'metal', 0.06, 0.2, 0.13);
        b.pair(box(0.21, 0.03, 0.03), 'metal', -0.03, 0.35, 0.13, [0, 0, 0.7]);
        b.add(box(0.03, 0.03, 0.29), 'metal', -0.12, 0.35, 0);
        b.pair(box(0.06, 0.03, 0.04), 'redLight', -0.345, 0.22, 0.13);                // tail lights
        b.add(cyl(0.022, 0.022, 0.1, 5), 'metal', -0.12, 0.36, 0);                    // MG post
        b.add(box(0.12, 0.06, 0.07), 'hullDark', -0.1, 0.44, 0);
        b.pair(rodX(0.013, 0.013, 0.22, 5), 'dark', -0.06, 0.47, 0.022);
        b.marker('muzzle', null, 0.17, 0.47, 0);
        for (const x of [0.22, -0.22]) {
            addWheel(b, wheels, x, 0.13, 0.27, 0.13, 0.11);
            addWheel(b, wheels, x, 0.13, -0.27, 0.13, 0.11);
        }
        return b.build({ height: 0.5, wheels, wheelRadius: 0.13 });
    }

    function makeHarvester() {
        const b = new Builder();
        const wheels = [];
        // heavy chassis on six big wheels
        b.add(box(1.0, 0.13, 0.5), 'hullDark', -0.05, 0.11, 0);
        for (const x of [-0.37, -0.05, 0.27]) {
            addWheel(b, wheels, x, 0.14, 0.33, 0.14, 0.12, 'hazard');
            addWheel(b, wheels, x, 0.14, -0.33, 0.14, 0.12, 'hazard');
        }
        b.pair(box(0.96, 0.03, 0.15), 'team', -0.05, 0.24, 0.33);       // fenders (team)
        // cab at the front, glass on three sides, beacon
        b.add(hexa(0.3, 0.46, 0.24, 0.42, 0.24, -0.02, 0), 'team', 0.24, 0.24, 0);
        b.add(box(0.03, 0.09, 0.36), 'glass', 0.365, 0.35, 0);
        b.pair(box(0.16, 0.08, 0.02), 'glass', 0.24, 0.36, 0.215);
        b.add(box(0.26, 0.03, 0.42), 'hullDark', 0.22, 0.48, 0);
        b.add(cyl(0.035, 0.035, 0.05, 6), 'warn', 0.18, 0.51, -0.14);
        // hopper (cargo bed): open box with team walls and a glowing shard load that scales with carry
        b.add(box(0.6, 0.04, 0.5), 'hull', -0.27, 0.24, 0);
        b.pair(hexa(0.6, 0.05, 0.64, 0.05, 0.26), 'team', -0.27, 0.28, 0.235);
        b.add(hexa(0.05, 0.5, 0.05, 0.52, 0.26), 'hull', -0.565, 0.28, 0);
        b.add(hexa(0.05, 0.5, 0.05, 0.52, 0.26), 'hull', 0.025, 0.28, 0);
        b.pair(box(0.62, 0.03, 0.03), 'hazard', -0.27, 0.53, 0.25);
        const cargo = b.node('cargo', null, -0.27, 0.28, 0);
        b.add(box(0.54, 0.16, 0.42), 'shardDeep', 0, 0, 0, null, null, cargo);
        b.add(crystalGeo(0.07, 0.16, 5), 'shard', -0.12, 0.13, -0.08, [0.2, 0, 0.3], null, cargo);
        b.add(crystalGeo(0.06, 0.13, 5), 'shard', 0.1, 0.13, 0.09, [-0.3, 0, -0.2], null, cargo);
        b.add(crystalGeo(0.05, 0.11, 5), 'shard', 0.05, 0.13, -0.1, [0.1, 0, 0.4], null, cargo);
        // scoop arm hinged at the cab, a toothed cutter drum at the front
        const arm = b.node('arm', null, 0.36, 0.26, 0);
        b.pair(box(0.2, 0.05, 0.04), 'hullDark', 0.09, -0.05, 0.19, [0, 0, -0.45], null, arm);
        b.add(rodZ(0.075, 0.5, 8), 'hazard', 0.16, -0.13, 0, null, null, arm);
        for (const z of [-0.18, -0.06, 0.06, 0.18]) b.add(box(0.06, 0.03, 0.05), 'metal', 0.2, -0.12, z, [0, 0, 0.6], null, arm);
        b.add(box(0.03, 0.02, 0.4), 'warn', 0.1, 0.0, 0, null, null, arm);
        return b.build({ height: 0.6, wheels, wheelRadius: 0.14 });
    }

    // ---------------------------------------------------------------- buildings
    // Every building stands on a slab a little smaller than its footprint so neighbours read as separate.
    function slab(b, w, d, mk = 'hullDark', h = 0.08) {
        b.add(hexa(w - 0.06, d - 0.06, w - 0.14, d - 0.14, h), mk, 0, 0, 0);
    }

    function makeCore() {
        const b = new Builder();
        b.add(octo(2.9, 0.1), 'hullDark', 0, 0, 0);
        b.add(octo(2.7, 0.05), 'concrete', 0, 0.1, 0);
        // main block with a sloped skirt and a big team-coloured roof
        b.add(hexa(2.0, 1.9, 1.7, 1.6, 0.5), 'hull', -0.1, 0.15, -0.1);
        b.add(box(1.76, 0.08, 1.66), 'team', -0.1, 0.65, -0.1);
        b.add(hexa(1.5, 1.4, 1.2, 1.1, 0.18), 'hull', -0.1, 0.73, -0.1);
        b.add(box(1.1, 0.05, 1.0), 'teamDark', -0.1, 0.91, -0.1);
        // command tower with a glass band
        b.add(box(0.6, 0.38, 0.6), 'hull', -0.35, 0.96, -0.35);
        b.add(box(0.64, 0.1, 0.64), 'glass', -0.35, 1.18, -0.35);
        b.add(box(0.68, 0.06, 0.68), 'team', -0.35, 1.34, -0.35);
        // antenna mast with a light
        b.add(cyl(0.03, 0.05, 1.0, 5), 'metal', -0.5, 1.4, -0.5);
        b.add(sph(0.06, 6, 4), 'redLight', -0.5, 2.4, -0.5);
        b.add(box(0.3, 0.02, 0.02), 'metal', -0.5, 2.1, -0.5);
        b.add(box(0.02, 0.02, 0.3), 'metal', -0.5, 1.85, -0.5);
        // big entrance on the south (+Z) face with lights
        b.add(box(0.8, 0.36, 0.06), 'dark', -0.1, 0.15, 0.77);
        b.add(box(0.9, 0.05, 0.08), 'warn', -0.1, 0.52, 0.77);
        b.add(box(0.6, 0.02, 0.4), 'hazard', -0.1, 0.15, 1.05);
        // side annex with team roof (east)
        b.add(box(0.5, 0.42, 1.2), 'hull', 1.03, 0.15, -0.25);
        b.add(box(0.54, 0.05, 1.24), 'team', 1.03, 0.57, -0.25);
        b.add(box(0.04, 0.06, 0.8), 'teamGlow', 1.3, 0.4, -0.25);
        // corner pylons with lights
        for (const [x, z] of [[-1.15, 1.15], [1.15, 1.15], [-1.15, -1.15]]) {
            b.add(cyl(0.07, 0.09, 0.4, 6), 'hullDark', x, 0.15, z);
            b.add(cyl(0.075, 0.075, 0.05, 6), 'teamGlow', x, 0.55, z);
        }
        // crane on the south-east corner (may swing)
        const crane = b.node('crane', null, 1.1, 0.15, 0.95);
        b.add(box(0.12, 1.05, 0.12), 'hazard', 0, 0, 0, null, null, crane);
        b.add(box(0.2, 0.12, 0.2), 'hullDark', 0, 1.0, 0, null, null, crane);
        b.add(box(1.25, 0.07, 0.08), 'hazard', -0.48, 1.12, 0, null, null, crane);
        b.add(box(0.22, 0.12, 0.14), 'hullDark', 0.2, 1.07, 0, null, null, crane);
        b.add(cyl(0.006, 0.006, 0.42, 3), 'metal', -0.9, 0.7, 0, null, null, crane);
        b.add(box(0.1, 0.08, 0.1), 'metal', -0.9, 0.63, 0, null, null, crane);
        // flag pole at the south-west corner, team flag pivoting at the pole
        b.add(cyl(0.02, 0.025, 1.15, 5), 'metal', -1.25, 0.15, 0.95);
        const flag = b.node('flag', null, -1.25, 1.1, 0.95);
        b.add(box(0.4, 0.22, 0.015), 'team', 0.2, 0, 0, null, null, flag);
        b.add(box(0.1, 0.06, 0.02), 'teamGlow', 0.22, 0.08, 0, null, null, flag);
        return b.build({ height: 1.4 });
    }

    function makeReactor() {
        const b = new Builder();
        slab(b, 2, 2);
        // two cooling towers (hyperboloids) with team bands
        const tower = lathe('tower', [[0, 0], [0.4, 0], [0.33, 0.35], [0.28, 0.7], [0.31, 1.0], [0.27, 1.0], [0.25, 0.75], [0, 0.75]], 10);
        for (const z of [-0.43, 0.43]) {
            b.add(tower, 'concrete', -0.45, 0.08, z);
            b.add(cyl(0.355, 0.375, 0.1, 10), 'team', -0.45, 0.3, z);
            b.add(cyl(0.255, 0.255, 0.02, 10), 'energy', -0.45, 0.85, z);
        }
        // reactor drum (team) with a glowing core cage on top
        b.add(cyl(0.36, 0.4, 0.42, 10), 'team', 0.5, 0.08, 0);
        b.add(cyl(0.38, 0.38, 0.05, 10), 'hullDark', 0.5, 0.5, 0);
        b.add(cyl(0.2, 0.2, 0.42, 8), 'energy', 0.5, 0.55, 0);
        for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2;
            b.add(box(0.04, 0.46, 0.04), 'metal', 0.5 + Math.cos(a) * 0.27, 0.55, Math.sin(a) * 0.27);
        }
        b.add(cyl(0.3, 0.3, 0.06, 8), 'hullDark', 0.5, 1.0, 0);
        b.add(cyl(0.08, 0.08, 0.04, 6), 'teamGlow', 0.5, 1.06, 0);
        // pipes from the drum to the towers
        b.add(box(0.5, 0.08, 0.08), 'metal', 0.05, 0.25, 0.2, [0, -0.5, 0]);
        b.add(box(0.5, 0.08, 0.08), 'metal', 0.05, 0.25, -0.2, [0, 0.5, 0]);
        b.add(box(0.56, 0.03, 0.34), 'pad', 0.5, 0.08, 0.66);
        for (const x of [0.32, 0.5, 0.68]) b.add(box(0.07, 0.012, 0.28), 'hazard', x, 0.11, 0.66, [0, 0.5, 0]);
        return b.build({ height: 1.08 });
    }

    function makeRefinery() {
        const b = new Builder();
        slab(b, 3, 3);
        // processing hall (north-west) with a team roof and lit windows
        b.add(hexa(1.6, 1.2, 1.5, 1.1, 0.62), 'hull', -0.55, 0.08, -0.65);
        b.add(box(1.54, 0.08, 1.14), 'team', -0.55, 0.7, -0.65);
        b.add(box(1.0, 0.18, 0.6), 'hull', -0.75, 0.78, -0.75);
        b.add(box(1.04, 0.04, 0.64), 'teamDark', -0.75, 0.96, -0.75);
        b.add(box(1.2, 0.06, 0.04), 'glass', -0.55, 0.45, -0.08);
        b.add(cyl(0.08, 0.1, 0.55, 6), 'hullDark', -1.15, 0.78, -1.0);
        b.add(cyl(0.085, 0.085, 0.05, 6), 'warn', -1.15, 1.3, -1.0);
        // two silos (east) with team bands and domed caps
        for (const z of [-0.95, -0.15]) {
            b.add(cyl(0.34, 0.34, 1.0, 10), 'metal', 0.95, 0.08, z);
            b.add(cyl(0.355, 0.355, 0.16, 10), 'team', 0.95, 0.55, z);
            b.add(dome(0.34, 10, 3), 'hull', 0.95, 1.08, z);
            b.add(box(0.04, 0.5, 0.04), 'shard', 0.95 - 0.35, 0.3, z);
        }
        b.add(box(0.12, 0.12, 0.8), 'hullDark', 0.95, 0.9, -0.55);   // bridge between silos
        // unload hopper over the dock pad + pipe to the silos
        b.add(cone(0.32, 0.36, 6), 'hull', 0.0, 0.38, 0.2, [Math.PI, 0, 0]);
        b.add(cyl(0.33, 0.33, 0.1, 6), 'team', 0.0, 0.38, 0.2);
        b.add(cyl(0.26, 0.26, 0.02, 6), 'shard', 0.0, 0.48, 0.2);
        b.add(box(0.16, 0.38, 0.16), 'hullDark', 0.0, 0.0, 0.2);
        b.add(box(0.8, 0.1, 0.1), 'metal', 0.45, 0.42, 0.0, [0, 0.4, 0]);
        // dock pad on the south (+Z) edge: harvesters unload here
        b.add(box(2.1, 0.04, 0.9), 'pad', 0, 0.06, 0.95);
        b.add(box(2.1, 0.02, 0.06), 'warn', 0, 0.1, 1.38);
        for (const x of [-1.02, 1.02]) b.add(box(0.06, 0.02, 0.86), 'warn', x, 0.1, 0.95);
        for (const x of [-0.6, -0.2, 0.2, 0.6]) b.add(box(0.16, 0.012, 0.3), 'hazard', x, 0.1, 0.95, [0, 0.6, 0]);
        b.marker('dock', null, 0, 0.1, 0.95);
        return b.build({ height: 1.1 });
    }

    function makeBarracks() {
        const b = new Builder();
        slab(b, 2, 2);
        // armoured bunker with a sloped team roof
        b.add(hexa(1.7, 1.5, 1.5, 1.3, 0.3), 'hull', 0, 0.08, -0.12);
        b.add(hexa(1.54, 1.34, 1.1, 0.9, 0.26), 'team', 0, 0.38, -0.12);
        b.add(box(1.0, 0.06, 0.8), 'teamDark', 0, 0.64, -0.12);
        b.add(box(0.3, 0.12, 0.3), 'hullDark', -0.25, 0.7, -0.2);
        b.add(box(0.32, 0.03, 0.32), 'warn', -0.25, 0.82, -0.2);
        // firing slits
        b.add(box(1.2, 0.05, 0.03), 'glass', 0, 0.28, -0.88);
        for (const x of [-0.79, 0.79]) b.add(box(0.03, 0.05, 0.8), 'glass', x, 0.28, -0.12);
        // door on the south (+Z) face, lit frame, step
        b.add(box(0.5, 0.36, 0.2), 'hull', 0.25, 0.08, 0.68);
        b.add(box(0.36, 0.28, 0.02), 'dark', 0.25, 0.08, 0.785);
        b.add(box(0.44, 0.04, 0.03), 'warn', 0.25, 0.37, 0.79);
        b.add(box(0.5, 0.02, 0.18), 'hazard', 0.25, 0.08, 0.88);
        // radio mast and a team pennant
        b.add(cyl(0.015, 0.02, 0.55, 4), 'metal', 0.6, 0.64, -0.55);
        b.add(box(0.16, 0.1, 0.01), 'teamGlow', 0.68, 1.08, -0.55);
        // sandbag-ish barrier on the west side
        b.add(hexa(0.18, 0.9, 0.12, 0.84, 0.16), 'concrete', -0.82, 0.08, 0.4);
        b.add(hexa(0.5, 0.16, 0.44, 0.1, 0.14), 'concrete', -0.45, 0.08, 0.84);
        // roof vents and a team chevron on the south slope
        b.pair(box(0.16, 0.08, 0.12), 'hullDark', 0.35, 0.64, 0.2);
        b.add(box(0.12, 0.012, 0.12), 'warn', 0.35, 0.72, -0.2);
        b.add(box(0.36, 0.03, 0.08), 'teamGlow', -0.12, 0.53, 0.42, [0.5, 0.55, 0]);
        b.add(box(0.36, 0.03, 0.08), 'teamGlow', -0.38, 0.53, 0.42, [0.5, -0.55, 0]);
        b.marker('exit', null, 0.25, 0, 0.9);
        return b.build({ height: 0.7 });
    }

    function makeFactory() {
        const b = new Builder();
        slab(b, 3, 3);
        // hangar: walls + a barrel-vault roof in team colour, axis along Z, open to the south
        for (const x of [-1.12, 1.12]) b.add(box(0.14, 0.5, 2.26), 'hull', x, 0.08, -0.07);
        b.add(box(2.26, 0.5, 0.14), 'hull', 0, 0.08, -1.15);
        const vault = cached('vault', () => new T.CylinderGeometry(1.2, 1.2, 2.3, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2));
        b.add(vault, 'team', 0, 0.58, -0.07, null, [1, 0.55, 1]);
        for (const z of [-0.8, -0.1, 0.6]) b.add(box(2.42, 0.06, 0.08), 'hullDark', 0, 0.58, z);
        b.add(box(0.2, 0.05, 2.0), 'teamGlow', 0, 1.24, -0.07);
        // the big hangar door on the south face: dark opening, hazard frame, half-raised shutter, lights
        b.add(box(1.7, 0.85, 0.05), 'dark', 0, 0.08, 1.07);
        b.add(box(1.7, 0.36, 0.08), 'hullDark', 0, 0.6, 1.08);
        for (const x of [-0.9, 0.9]) b.add(box(0.1, 0.94, 0.1), 'hazard', x, 0.08, 1.1);
        b.add(box(1.9, 0.08, 0.1), 'hazard', 0, 0.98, 1.1);
        b.add(box(1.6, 0.04, 0.04), 'warn', 0, 0.92, 1.14);
        // apron with chevrons in front of the door
        b.add(box(1.7, 0.02, 0.3), 'pad', 0, 0.08, 1.3);
        for (const x of [-0.55, 0, 0.55]) b.add(box(0.3, 0.012, 0.08), 'hazard', x, 0.1, 1.3, [0, 0.5, 0]);
        // stacks at the back
        for (const x of [-0.8, 0.8]) {
            b.add(cyl(0.1, 0.13, 0.95, 6), 'hullDark', x, 0.58, -1.22);
            b.add(cyl(0.105, 0.105, 0.05, 6), 'warn', x, 1.53, -1.22);
        }
        b.marker('exit', null, 0, 0, 1.3);
        return b.build({ height: 1.25 });
    }

    function makeRadar() {
        const b = new Builder();
        slab(b, 2, 2);
        // control hut with a team roof (south-west), lattice mast in the middle
        b.add(box(0.8, 0.4, 0.6), 'hull', -0.45, 0.08, 0.5);
        b.add(box(0.86, 0.05, 0.66), 'team', -0.45, 0.48, 0.5);
        b.add(box(0.5, 0.05, 0.03), 'glass', -0.45, 0.3, 0.81);
        b.add(box(0.5, 0.25, 0.5), 'teamDark', 0.45, 0.08, -0.5);
        b.add(box(0.2, 0.03, 0.2), 'warn', 0.45, 0.33, -0.5);
        b.add(hexa(0.5, 0.5, 0.18, 0.18, 0.86), 'hullDark', 0, 0.08, 0);
        b.add(cyl(0.12, 0.12, 0.06, 8), 'teamGlow', 0, 0.94, 0);
        // dish (rotor) at the top: a shallow bowl facing +X tilted up, feed horn, team back plate
        const rotor = b.node('rotor', null, 0, 1.0, 0);
        // bowl: a spherical cap whose apex sits at the pivot and whose opening faces +X, tilted 26° up
        const bowl = cached('dish', () => doubleSided(new T.SphereGeometry(0.66, 12, 3, 0, Math.PI * 2, 0, 0.78).rotateZ(Math.PI / 2).translate(0.66, 0, 0)));
        const tilt = [0, 0, 0.45];
        const dish = b.node('dishTilt', rotor, 0, 0.12, 0, tilt);
        b.add(bowl, 'dish', -0.06, 0, 0, null, null, dish);
        b.add(cyl(0.24, 0.12, 0.08, 8), 'team', -0.1, 0, 0, [0, 0, Math.PI / 2], null, dish);
        b.add(rodX(0.016, 0.016, 0.42, 4), 'metal', -0.04, 0, 0, null, null, dish);
        b.add(sph(0.045, 6, 4), 'redLight', 0.4, 0, 0, null, null, dish);
        b.add(box(0.16, 0.14, 0.12), 'hullDark', 0, -0.05, 0, null, null, rotor);
        return b.build({ height: 1.3 });
    }

    function makeTurret() {
        const b = new Builder();
        b.add(octo(0.92, 0.12), 'hullDark', 0, 0, 0);
        b.add(octo(0.76, 0.14), 'hull', 0, 0.12, 0);
        b.add(cyl(0.3, 0.3, 0.04, 8), 'teamGlow', 0, 0.26, 0);
        const tur = b.node('turret', null, 0, 0.3, 0);
        b.add(hexa(0.5, 0.44, 0.36, 0.34, 0.2, -0.03, 0), 'team', -0.03, 0, 0, null, null, tur);
        b.add(box(0.18, 0.12, 0.38), 'hullDark', -0.22, 0.02, 0, null, null, tur);
        b.add(box(0.03, 0.05, 0.12), 'redLight', 0.2, 0.12, 0, null, null, tur);
        const bar = b.node('barrel', tur, 0.18, 0.09, 0);
        b.pair(rodX(0.03, 0.034, 0.24, 6), 'metal', 0, 0, 0.06, null, null, bar);
        b.add(box(0.07, 0.08, 0.2), 'hullDark', 0.0, -0.04, 0, null, null, bar);
        b.pair(rodX(0.04, 0.04, 0.04, 6), 'hullDark', 0.24, 0, 0.06, null, null, bar);
        b.marker('muzzle', bar, 0.29, 0, 0);
        return b.build({ height: 0.6 });
    }

    function makeTechlab() {
        const b = new Builder();
        slab(b, 2, 2);
        // lab block with team panels, two glowing domes on team rings, antenna array
        b.add(hexa(1.0, 1.7, 0.9, 1.6, 0.45), 'hull', 0.38, 0.08, 0);
        b.add(box(0.94, 0.06, 1.64), 'team', 0.38, 0.53, 0);
        b.add(box(0.04, 0.06, 1.2), 'tech', 0.88, 0.35, 0);
        b.add(cyl(0.5, 0.52, 0.16, 12), 'team', -0.42, 0.08, -0.35);
        b.add(dome(0.46, 12, 4), 'tech', -0.42, 0.24, -0.35);
        b.add(cyl(0.34, 0.36, 0.14, 10), 'team', -0.45, 0.08, 0.5);
        b.add(dome(0.3, 10, 3), 'tech', -0.45, 0.22, 0.5);
        b.add(cyl(0.02, 0.02, 0.5, 4), 'metal', 0.6, 0.59, -0.5);
        b.add(sph(0.06, 6, 4), 'tech', 0.6, 1.1, -0.5);
        b.add(cyl(0.02, 0.02, 0.35, 4), 'metal', 0.6, 0.59, 0.5);
        b.add(sph(0.05, 6, 4), 'tech', 0.6, 0.95, 0.5);
        b.add(box(0.4, 0.12, 0.5), 'hullDark', 0.25, 0.59, 0);
        return b.build({ height: 0.8 });
    }

    // ---------------------------------------------------------------- decor, shards, spire (no team)
    function makeRock() {
        const b = new Builder();
        b.add(rockGeo('r1', 0.32, 11, 1.1, 0.7, 0.9), 'rock', -0.06, 0.12, -0.04);
        b.add(rockGeo('r2', 0.2, 23, 1, 0.8, 1), 'rockDark', 0.2, 0.08, 0.16);
        b.add(rockGeo('r3', 0.13, 37, 1, 0.7, 1), 'rockLight', -0.26, 0.05, 0.24);
        return b.build({ height: 0.36 });
    }
    function makeBoulder() {
        const b = new Builder();
        b.add(rockGeo('b1', 0.4, 5, 1, 0.9, 0.95), 'rockDark', 0, 0.3, 0);
        b.add(rockGeo('b2', 0.14, 41, 1, 0.7, 1), 'rock', 0.33, 0.06, -0.24);
        return b.build({ height: 0.65 });
    }
    function makeCrystal() {
        const b = new Builder();
        b.add(rockGeo('c0', 0.2, 9, 1.2, 0.5, 1.2), 'rockDark', 0, 0.04, 0);
        b.add(crystalGeo(0.11, 0.62, 6), 'amethyst', 0, 0.02, 0, [0.12, 0, -0.08]);
        b.add(crystalGeo(0.08, 0.42, 6), 'amethyst', 0.17, 0.02, 0.1, [0.3, 0, -0.45]);
        b.add(crystalGeo(0.07, 0.36, 6), 'amethyst', -0.15, 0.02, -0.12, [-0.35, 0, 0.4]);
        b.add(crystalGeo(0.05, 0.24, 5), 'amethyst', -0.1, 0.02, 0.2, [0.5, 0, 0.3]);
        return b.build({ height: 0.62 });
    }
    function makeTree() {
        // An alien tree: a leaning segmented stalk, two mushroom canopies, glowing seed pods.
        const b = new Builder();
        b.add(cyl(0.07, 0.11, 0.4, 6), 'trunk', 0, 0, 0, [0, 0, 0.12]);
        b.add(cyl(0.05, 0.07, 0.35, 6), 'trunk', 0.05, 0.38, 0, [0, 0, -0.1]);
        b.add(cyl(0.04, 0.05, 0.25, 5), 'trunk', 0.02, 0.4, 0, [0.7, 0, 0]);
        b.add(dome(0.38, 9, 3), 'canopy', 0.02, 0.7, 0, null, [1, 0.45, 1]);
        b.add(cyl(0.38, 0.3, 0.06, 9), 'trunk', 0.02, 0.66, 0);
        b.add(dome(0.2, 8, 2), 'canopy', 0.02, 0.55, -0.27, null, [1, 0.5, 1]);
        b.add(cyl(0.2, 0.16, 0.04, 8), 'trunk', 0.02, 0.52, -0.27);
        for (const [x, z, y] of [[0.3, 0.1, 0.62], [-0.22, 0.24, 0.62], [0.08, -0.33, 0.48], [-0.12, -0.08, 0.86], [0.2, -0.2, 0.62]]) {
            b.add(sph(0.045, 5, 3), 'pod', x, y, z);
        }
        b.add(rockGeo('t0', 0.12, 3, 1.4, 0.4, 1.4), 'rockDark', 0, 0.02, 0);
        return b.build({ height: 0.9 });
    }
    function makeShardCluster() {
        const b = new Builder();
        const rand = rng(77);
        b.add(rockGeo('s0', 0.2, 13, 1.6, 0.35, 1.6), 'shardDeep', 0, 0.02, 0);
        const spots = [[0, 0, 0.5, 0.11], [0.2, 0.14, 0.36, 0.08], [-0.2, 0.12, 0.32, 0.08], [0.12, -0.22, 0.3, 0.07],
            [-0.18, -0.16, 0.38, 0.08], [0.3, -0.05, 0.22, 0.06], [-0.05, 0.3, 0.22, 0.06]];
        for (const [x, z, h, r] of spots) {
            const tilt = 0.15 + rand() * 0.35, dir = Math.atan2(z, x) || rand() * 6;
            b.add(crystalGeo(r, h, 5), 'shard', x, 0, z, [Math.sin(dir) * tilt, rand() * 3, -Math.cos(dir) * tilt]);
        }
        return b.build({ height: 0.5 });
    }
    function makeSpire() {
        const b = new Builder();
        b.add(rockGeo('p0', 0.45, 19, 1.05, 0.45, 1.05), 'rockDark', 0, 0.12, 0);
        b.add(rockGeo('p1', 0.18, 29, 1, 0.8, 1), 'rock', 0.28, 0.1, 0.24);
        b.add(crystalGeo(0.2, 1.9, 6), 'shard', 0, 0.1, 0, [0.04, 0.3, 0.03]);
        b.add(crystalGeo(0.11, 1.0, 5), 'shard', 0.16, 0.15, -0.12, [-0.25, 0, -0.3]);
        b.add(crystalGeo(0.1, 0.8, 5), 'shard', -0.17, 0.15, 0.08, [0.3, 1, 0.3]);
        b.add(crystalGeo(0.08, 0.55, 5), 'shardDeep', -0.05, 0.15, 0.22, [0.45, 0, 0.1]);
        b.add(crystalGeo(0.07, 0.45, 5), 'shard', 0.22, 0.12, 0.12, [0.35, 0, -0.4]);
        // floating ring of fragments
        const ring = b.node('ring', null, 0, 1.15, 0);
        for (let i = 0; i < 5; i++) {
            const a = i / 5 * Math.PI * 2;
            b.add(crystalGeo(0.035, 0.14, 4), 'shard', Math.cos(a) * 0.34, 0, Math.sin(a) * 0.34, [0.3, a, 0], null, ring);
        }
        return b.build({ height: 2.0 });
    }

    // ---------------------------------------------------------------- registry, caching, cloning
    const MAKERS = {
        unit: { rifleman: makeRifleman, rocketeer: makeRocketeer, harvester: makeHarvester, buggy: makeBuggy, tank: makeTank, artillery: makeArtillery },
        building: { core: makeCore, reactor: makeReactor, refinery: makeRefinery, barracks: makeBarracks, factory: makeFactory,
            radar: makeRadar, turret: makeTurret, techlab: makeTechlab },
        decor: { rock: makeRock, boulder: makeBoulder, crystal: makeCrystal, tree: makeTree },
        misc: { shardCluster: makeShardCluster, spire: makeSpire },
    };
    const templates = new Map();   // kind:type:team → built template (geometry has the team colour baked in)

    function fallback(kind, type) {
        console.warn('SF_MODELS: no model for', kind, type);
        const b = new Builder();
        b.add(box(0.5, 0.5, 0.5), 'team', 0, 0, 0);
        return b.build({ height: 0.5 });
    }
    function template(kind, type, team) {
        const key = `${kind}:${type}:${team}`;
        let t = templates.get(key);
        if (t) return t;
        const make = MAKERS[kind] && MAKERS[kind][type];
        Builder.team = team;
        t = make ? make() : fallback(kind, type);
        t.userData.kind = kind;
        t.userData.type = type;
        t.userData.team = team;
        if (kind === 'unit' && CFG.UNITS[type]) t.userData.radius = CFG.UNITS[type].radius;
        if (kind === 'building' && CFG.BUILDINGS[type]) { t.userData.w = CFG.BUILDINGS[type].w; t.userData.d = CFG.BUILDINGS[type].d; }
        delete t.userData.wheels;     // rebuilt per instance (clone() JSON-copies userData)
        templates.set(key, t);
        return t;
    }
    function instance(kind, type, team) {
        const g = template(kind, type, team).clone(true);
        const wheels = [];
        g.traverse((o) => { if (o.name === 'wheel') wheels.push(o); });
        g.userData.wheels = wheels;
        return g;
    }
    const teamOf = (c) => (typeof c === 'number' ? c : (CFG.TEAMS && CFG.TEAMS[0] ? CFG.TEAMS[0].color : 0x2f8fff));

    function triangles(obj) {
        let n = 0;
        obj.traverse((o) => {
            if (!o.isMesh) return;
            const g = o.geometry;
            n += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        });
        return n;
    }

    return {
        unit: (type, teamColor) => instance('unit', type, teamOf(teamColor)),
        building: (type, teamColor) => instance('building', type, teamOf(teamColor)),
        decor: (type) => instance('decor', type, 0x888888),
        shardCluster: () => instance('misc', 'shardCluster', 0x888888),
        spire: () => instance('misc', 'spire', 0x888888),
        // extras for the renderer / UI / preview
        types: { unit: Object.keys(MAKERS.unit), building: Object.keys(MAKERS.building), decor: Object.keys(MAKERS.decor) },
        colors: { shard: PAL.shard, energy: PAL.energy, tech: PAL.tech, warn: PAL.warn, rock: PAL.rock, ground: PAL.ground },
        materials: MATERIALS,   // { body, glow }: shared by every model; clone before changing one per entity
        triangles,      // triangles(object3d) → triangle count
    };
})();
