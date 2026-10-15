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
//   'hover'   skimmer: the whole craft; the renderer may bob .position.y (rest 0) — userData.hover = true
//   'charge'  orbital uplink: glow parts with a per-instance material; pulse its .emissiveIntensity by the charge
//             (or call SF_MODELS.setCharge(obj, charge01, time))
//   'doorL' / 'doorR'  rift silo hatch doors (west / east), hinged at their outer edges: open k (0..1) =
//             doorL.rotation.z = +k * userData.doorOpen, doorR.rotation.z = -k * userData.doorOpen
//             (or call SF_MODELS.setDoors(obj, k))
//   'missile' rift silo missile standing in the shaft (pivot at its base); raise .position.y to launch it
// Roster expansion:
//   'turret' + 'muzzle'       salvo (the rocket pod; it also has a static tilted 'pod' child), arc walker (the tesla
//                             coil), sentry; 'barrel' too on the howitzer (elevated) and the obliterator (the lance)
//   'barrel2' / 'muzzle2'     bulwark: the second (port, -Z) cannon; recoil it like 'barrel' (the two can alternate)
//   'hover'                   wisp and obliterator, like the skimmer (userData.hover, userData.hoverHeight)
//   'body'                    arc walker: hips, thighs, hull and turret; bob .position.y (rest 0) while it walks,
//                             the shins and feet stay planted (userData.walker = true)
//   'ring'                    floating rings: gravity well (3), wisp (1), arc walker coil crown (1); spin about Y
//   'drill'                   shard siphon drill: spin about Y
//   'arm'                     repair bay crane (userData.craneArm): .rotation.y, rest = boom towards +X; aim it at
//                             the vehicle with .rotation.y = -atan2(dz, dx) (or aimArm); a 'muzzle' marker at its
//                             welding head is the repair-beam origin
//   'post' + 'armN'/'armS'/'armE'/'armW'  wall: arms hidden by default; setWallArms(obj, { n, s, e, w })
//   'muzzle' on the healers (medic injector, engineer torch, acolyte staff crystal): the heal-beam origin
//   SF_MODELS.spin(obj, t, { powered, arm }) animates rings, the drill and the crane idle in one call.
//   userData.height = top of the main body (health bars / selection rings).
// Factions: SF_MODELS.unit/building(type, teamColor, faction). The Hegemony look ('hegemony') swaps the neutral
// palette for violet graphite and pearl with magenta energy glows, and shared buildings get swept fins and floating
// crystals; team colour stays on the big panels either way. Default faction = the type's own (config) or 'vanguard'.
window.SF_MODELS = (() => {
    'use strict';
    const T = THREE;
    const CFG = window.SF_CONFIG || { UNITS: {}, BUILDINGS: {} };

    // ---------------------------------------------------------------- colours & materials
    const PAL = {
        shard: 0x40f0c8, shardDeep: 0x1aa88e, energy: 0x8ffcff, tech: 0xc29bff, warn: 0xffb52e,
        rock: 0x7d746a, ground: 0x5c5446,
        hegemonyGlow: 0xff4fd8, violet: 0xa070ff,
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
        hglow:     [PAL.hegemonyGlow, 1.45],   // Hegemony energy (magenta), whatever the faction palette
        violet:    [PAL.violet, 1.25],
        // roster expansion
        ghillie:     [0x5f6e3a, 0],     // sniper camouflage
        ghillieDark: [0x414a27, 0],
        medic:       [0xe6ecee, 0],     // medic white
        medGreen:    [0x2e9e55, 0],
        plus:        [0x3dff7e, 1.2],   // the medic's green plus (glowing so it reads at any zoom)
        toolbox:     [0xd2552a, 0],
        hazardDark:  [0xa8781a, 0],
        weld:        [0xbff4ff, 1.6],   // a welding torch's hot tip
        heal:        [0xffd2f6, 1.5],   // the acolyte's pale healing crystal
    };
    // The Hegemony palette: the same part keys, re-coloured (lavender-grey armour, violet-black under-structure,
    // pearl metal, magenta lights instead of amber, violet glass and energy).
    const HEGEMONY = {
        hull:      [0xaca6c2, 0],
        hullDark:  [0x2c2838, 0],
        metal:     [0xd9d5ea, 0],
        dark:      [0x15121c, 0],
        tread:     [0x221f2a, 0],
        concrete:  [0x77728a, 0],
        pad:       [0x3c3946, 0],
        suit:      [0x2a2634, 0],
        hazard:    [0xc8c2dc, 0],
        dish:      [0xd9d5ea, 0],
        glass:     [0xc77bff, 1.0],
        warn:      [PAL.hegemonyGlow, 1.3],
        redLight:  [PAL.hegemonyGlow, 1.3],
        energy:    [0xe070ff, 1.4],
        tech:      [PAL.violet, 1.15],
    };
    function colorOf(key, team, faction) {
        if (key === 'team') return [darken(team, 0.08), 0];   // a touch darker so bright sun does not wash it out
        if (key === 'teamDark') return [darken(team, 0.45), 0];
        if (key === 'teamGlow') return [lighten(team, 0.45), 1.0];
        if (faction === 'hegemony' && HEGEMONY[key]) return HEGEMONY[key];
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
    // A convex faceted solid: bottom polygon `bot` at y = 0, top polygon `top` (same vertex count) at y = h, both
    // as [[x, z], ...] in order around the shape. Sharp-edged hulls, wedges and blades.
    function loft(bot, top, h) {
        return cached(`loft${bot.join(';')}|${top.join(';')}|${h}`, () => {
            const n = bot.length;
            const B = bot.map(([x, z]) => [x, 0, z]), U = top.map(([x, z]) => [x, h, z]);
            const faces = [];
            for (let i = 0; i < n; i++) faces.push([B[i], B[(i + 1) % n], U[(i + 1) % n], U[i]]);
            for (let i = 1; i < n - 1; i++) { faces.push([B[0], B[i], B[i + 1]]); faces.push([U[0], U[i], U[i + 1]]); }
            return quadsGeometry(faces);
        });
    }
    const scalePts = (pts, sx, sz = sx, dx = 0) => pts.map(([x, z]) => [+(x * sx + dx).toFixed(4), +(z * sz).toFixed(4)]);
    // Regular n-gon of circumradius r in the XZ plane, first vertex at angle a0.
    const ngon = (n, r, a0 = 0) => Array.from({ length: n }, (_, i) => {
        const a = a0 + i / n * Math.PI * 2;
        return [+(Math.cos(a) * r).toFixed(4), +(Math.sin(a) * r).toFixed(4)];
    });
    // A double-pointed crystal (energy emitters), centred on its middle.
    const prismGem = (r, h, s = 4) => cached(`gem${r},${h},${s}`, () =>
        new T.LatheGeometry([new T.Vector2(0, -h / 2), new T.Vector2(r, 0), new T.Vector2(0, h / 2)], s));

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
        // Like pair(), but the copy is a true mirror image (for parts that are not symmetric about their own z = 0).
        mirror(g, mk, x, y, z, rot, scl, node) {
            this.add(g, mk, x, y, z, rot, scl, node);
            const r2 = [-(rot ? rot[0] || 0 : 0), -(rot ? rot[1] || 0 : 0), rot ? rot[2] || 0 : 0];
            const s2 = scl ? [scl[0], scl[1], -scl[2]] : [1, 1, -1];
            return this.add(g, mk, x, y, -z, r2, s2, node);
        }
        build(userData) {
            const team = Builder.team, faction = Builder.faction;
            if (Builder.trim) { this.cur = null; Builder.trim(this); }
            for (const [node, byMat] of this.parts) {
                const body = [], glow = [];
                for (const [mk, list] of byMat) {
                    const [hex, k] = colorOf(mk, team, faction);
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
    Builder.faction = 'vanguard';
    Builder.trim = null;     // optional extra parts (faction trim) added just before a template is built
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
    function infantryBody(b, helmetRound, opts = {}) {
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
        if (!opts.noPack) b.add(box(0.07, 0.12, 0.13), 'hullDark', -0.1, 0.18, 0);     // backpack
        if (helmetRound === null) return;     // the caller adds its own headgear
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

    // ---------------------------------------------------------------- Hegemony units
    // Design language: tall, slim and angular, swept fins instead of boxes, magenta energy glows ('hglow'),
    // hover pads and four-pod running gear instead of wheels and treads. Built with the Hegemony palette.
    function hegInfantryBody(b, heavy, opts = {}) {
        b.cur = b.node('body', b.root, 0, 0, 0, null, [1.1, 1.2, 1.1]);
        // slim armoured legs with team knee plates, small feet
        b.add(hexa(0.06, 0.06, 0.05, 0.05, 0.17), 'suit', 0.025, 0, 0.045);
        b.add(hexa(0.06, 0.06, 0.05, 0.05, 0.17), 'suit', -0.02, 0, -0.045);
        b.add(box(0.03, 0.05, 0.05), 'teamDark', 0.052, 0.07, 0.045);
        b.add(box(0.03, 0.05, 0.05), 'teamDark', 0.007, 0.07, -0.045);
        b.add(box(0.07, 0.025, 0.06), 'dark', 0.035, 0, 0.045);
        b.add(box(0.07, 0.025, 0.06), 'dark', -0.01, 0, -0.045);
        b.add(box(0.075, 0.04, 0.12), 'suit', 0, 0.16, 0);
        // torso: an inverted wedge (narrow waist, broad chest), glowing diamond on the chest
        const tx = heavy ? 0.15 : 0.12, tz = heavy ? 0.29 : 0.235;
        b.add(hexa(0.085, 0.12, tx, tz, 0.16), 'team', 0, 0.195, 0);
        b.add(box(0.02, 0.045, 0.045), 'hglow', tx / 2, 0.29, 0, [Math.PI / 4, 0, 0]);
        // shoulder plates sweeping up and out
        b.mirror(hexa(0.08, 0.07, 0.04, 0.03, heavy ? 0.06 : 0.07, -0.01, 0.035), 'team', 0, 0.33, tz / 2 - 0.02);
        // back vanes with glowing tips (no backpack box: the Hegemony silhouette)
        if (!opts.noVanes) {
            b.mirror(hexa(0.05, 0.02, 0.02, 0.012, 0.2, -0.04, 0.035), 'hullDark', -0.065, 0.26, 0.045);
            b.mirror(box(0.025, 0.04, 0.025), 'hglow', -0.105, 0.45, 0.08);
        }
        // helmet: a tapered wedge with a wrap-around glowing visor and a crest fin
        const hw = heavy ? 0.1 : 0.088;
        b.add(hexa(hw, hw * 0.9, hw * 0.62, hw * 0.55, 0.1, -0.012, 0), 'team', 0, 0.355, 0);
        b.add(box(0.025, 0.024, hw * 0.86), 'hglow', hw / 2 - 0.006, 0.385, 0);
        b.add(box(0.11, 0.035, 0.012), 'hullDark', -0.025, 0.445, 0, [0, 0, -0.32]);
    }

    function makeTrooper() {
        const b = new Builder();
        hegInfantryBody(b, false);
        b.pair(box(0.045, 0.11, 0.045), 'suit', 0.03, 0.2, 0.125);           // arms
        // long slim pulse rifle: dark stock, two glowing coils, split prongs at the tip
        b.add(box(0.25, 0.03, 0.03), 'hullDark', 0.065, 0.235, 0.11);
        b.add(box(0.2, 0.014, 0.036), 'hglow', 0.08, 0.262, 0.11);
        b.add(box(0.02, 0.045, 0.045), 'hglow', 0.05, 0.228, 0.11);
        b.add(box(0.02, 0.045, 0.045), 'hglow', 0.11, 0.228, 0.11);
        b.add(box(0.05, 0.012, 0.01), 'metal', 0.165, 0.244, 0.098);
        b.add(box(0.05, 0.012, 0.01), 'metal', 0.165, 0.244, 0.122);
        b.add(box(0.02, 0.012, 0.012), 'hglow', 0.18, 0.244, 0.11);
        b.marker('muzzle', null, 0.195, 0.25, 0.11);
        return b.build({ height: 0.56 });
    }

    function makeShocktrooper() {
        const b = new Builder();
        hegInfantryBody(b, true);
        b.add(box(0.05, 0.12, 0.05), 'suit', 0.03, 0.19, -0.14);
        // shoulder pylons: two prongs carrying glowing orbs (the shock trooper's signature at a distance)
        b.pair(cyl(0.012, 0.018, 0.14, 4), 'metal', -0.03, 0.36, 0.145);
        b.pair(sph(0.046, 6, 4), 'hglow', -0.03, 0.52, 0.145);
        // heavy arm cannon on the right: a team-coloured barrel, a glow ring and a charged orb at the front
        b.add(box(0.07, 0.07, 0.07), 'hullDark', 0.0, 0.2, 0.14);
        b.add(rodX(0.042, 0.05, 0.15, 6), 'teamDark', -0.01, 0.235, 0.14);
        b.add(rodX(0.054, 0.054, 0.02, 6), 'hglow', 0.07, 0.235, 0.14);
        b.add(rodX(0.03, 0.045, 0.04, 6), 'metal', 0.105, 0.235, 0.14);
        b.add(sph(0.042, 6, 4), 'hglow', 0.15, 0.235, 0.14);
        // power cell on the back
        b.add(hexa(0.06, 0.12, 0.04, 0.09, 0.12), 'hullDark', -0.1, 0.22, 0);
        b.add(box(0.015, 0.03, 0.08), 'hglow', -0.13, 0.28, 0);
        b.marker('muzzle', null, 0.19, 0.235, 0.14);
        return b.build({ height: 0.6 });
    }

    function makeSkimmer() {
        const b = new Builder();
        b.cur = b.node('hover', b.root, 0, 0, 0);
        const Y = 0.13;    // underside height above the ground
        // delta hull: a dark under-plate flaring out to the edge, then a team-coloured faceted deck
        const E = [[0.4, 0], [-0.06, 0.33], [-0.34, 0.29], [-0.34, -0.29], [-0.06, -0.33]];
        b.add(loft(scalePts(E, 0.82, 0.8), E, 0.05), 'hullDark', 0, Y, 0);
        b.add(loft(E, [[0.28, 0], [-0.1, 0.2], [-0.3, 0.16], [-0.3, -0.16], [-0.1, -0.2]], 0.09), 'team', 0, Y + 0.05, 0);
        // glowing leading and trailing edges (the hover glow)
        const ang = Math.atan2(0.33, 0.46);
        b.mirror(box(0.56, 0.02, 0.025), 'hglow', 0.17, Y + 0.035, 0.165, [0, ang, 0]);
        b.add(box(0.025, 0.02, 0.5), 'hglow', -0.345, Y + 0.035, 0);
        // hover pads under the nose and the wingtips: glowing discs in dark housings
        for (const [x, z] of [[0.16, 0], [-0.2, 0.21], [-0.2, -0.21]]) {
            b.add(cyl(0.1, 0.085, 0.04, 8), 'hullDark', x, Y - 0.035, z);
            b.add(cyl(0.075, 0.075, 0.02, 8), 'hglow', x, Y - 0.05, z);
        }
        // canopy, twin pulse guns, swept tail fins, engine glow
        b.add(loft([[0.16, 0], [0.0, 0.08], [-0.1, 0.06], [-0.1, -0.06], [0.0, -0.08]],
            [[0.08, 0], [-0.01, 0.04], [-0.07, 0.03], [-0.07, -0.03], [-0.01, -0.04]], 0.06), 'glass', 0.03, Y + 0.14, 0);
        b.pair(box(0.12, 0.05, 0.06), 'hullDark', 0.1, Y + 0.08, 0.14);
        b.pair(rodX(0.018, 0.018, 0.17, 5), 'metal', 0.16, Y + 0.105, 0.14);
        b.pair(box(0.025, 0.03, 0.03), 'hglow', 0.33, Y + 0.09, 0.14);
        b.mirror(hexa(0.16, 0.02, 0.05, 0.015, 0.15, -0.06, 0), 'teamDark', -0.24, Y + 0.13, 0.12, [0.45, 0, 0]);
        b.mirror(box(0.04, 0.03, 0.02), 'hglow', -0.3, Y + 0.255, 0.185, [0.45, 0, 0]);
        b.add(box(0.05, 0.05, 0.16), 'hullDark', -0.31, Y + 0.12, 0);
        b.add(box(0.02, 0.035, 0.12), 'hglow', -0.34, Y + 0.13, 0);
        b.marker('muzzle', null, 0.36, Y + 0.105, 0);
        b.cur = null;
        return b.build({ height: 0.42, hover: true, hoverHeight: Y, wheels: [] });
    }

    function makeLancer() {
        const b = new Builder();
        // four armoured running pods at the corners, with glowing strips on the outside
        for (const x of [0.27, -0.27]) for (const z of [0.31, -0.31]) {
            b.add(hexa(0.34, 0.16, 0.24, 0.16, 0.13), 'tread', x, 0, z);
            b.add(hexa(0.36, 0.19, 0.22, 0.13, 0.08), 'hullDark', x, 0.12, z);
            b.add(box(0.18, 0.025, 0.02), 'hglow', x, 0.1, z + Math.sign(z) * 0.085);
        }
        b.pair(box(0.12, 0.06, 0.2), 'hullDark', 0.27, 0.12, 0.2);
        b.pair(box(0.12, 0.06, 0.2), 'hullDark', -0.27, 0.12, 0.2);
        // hull: a long faceted hexagon, team-coloured upper facets, pearl deck
        const H0 = [[0.44, 0], [0.22, 0.25], [-0.32, 0.25], [-0.44, 0], [-0.32, -0.25], [0.22, -0.25]];
        const H1 = [[0.32, 0], [0.15, 0.19], [-0.27, 0.19], [-0.36, 0], [-0.27, -0.19], [0.15, -0.19]];
        b.add(loft(scalePts(H0, 0.9, 0.85), H0, 0.06), 'hullDark', 0, 0.12, 0);
        b.add(loft(H0, H1, 0.12), 'team', 0, 0.18, 0);
        b.add(loft(H1, scalePts(H1, 0.85), 0.02), 'hull', 0, 0.3, 0);
        b.mirror(box(0.03, 0.02, 0.12), 'hglow', 0.3, 0.215, 0.115, [0, -0.72, 0]);
        // turret: a tall faceted pentagon with swept fins and a floating focus crystal
        const tur = b.node('turret', null, -0.06, 0.32, 0);
        const T0 = [[0.2, 0], [0.05, 0.16], [-0.2, 0.14], [-0.24, 0], [-0.2, -0.14], [0.05, -0.16]];
        const T1 = scalePts(T0, 0.62, 0.6, -0.03);
        b.add(loft(T0, T1, 0.15), 'team', 0, 0, 0, null, null, tur);
        b.add(loft(T1, scalePts(T0, 0.45, 0.42, -0.04), 0.02), 'team', 0, 0.15, 0, null, null, tur);
        b.add(box(0.16, 0.012, 0.02), 'hull', -0.04, 0.17, 0.05, null, null, tur);
        b.add(box(0.16, 0.012, 0.02), 'hull', -0.04, 0.17, -0.05, null, null, tur);
        b.mirror(hexa(0.2, 0.02, 0.05, 0.015, 0.17, -0.09, 0), 'teamDark', -0.15, 0.06, 0.12, [0.4, 0, 0], null, tur);
        b.mirror(box(0.04, 0.03, 0.02), 'hglow', -0.24, 0.215, 0.19, [0.4, 0, 0], null, tur);
        b.add(prismGem(0.045, 0.12, 4), 'violet', -0.06, 0.26, 0, null, null, tur);
        // beam emitter: twin rails with a glowing core between them, focusing rings and a lens at the tip
        const bar = b.node('barrel', tur, 0.12, 0.08, 0);
        b.add(box(0.1, 0.09, 0.15), 'hullDark', 0.0, -0.045, 0, null, null, bar);
        b.pair(box(0.3, 0.035, 0.028), 'hullDark', 0.17, -0.0175, 0.045, null, null, bar);
        b.add(rodX(0.016, 0.016, 0.3, 5), 'hglow', 0.03, 0, 0, null, null, bar);
        for (const x of [0.12, 0.22]) b.add(box(0.025, 0.075, 0.13), 'metal', x, -0.0375, 0, null, null, bar);
        b.add(prismGem(0.035, 0.07, 4), 'hglow', 0.335, 0, 0, [0, 0, Math.PI / 2], null, bar);
        b.marker('muzzle', bar, 0.36, 0, 0);
        return b.build({ height: 0.55, wheels: [] });
    }

    function makePhantom() {
        const b = new Builder();
        // low tread skirts, mostly hidden under the hull
        b.pair(box(0.78, 0.07, 0.15), 'tread', -0.02, 0, 0.26);
        // flat faceted stealth hull: a dark under-bevel, team-coloured upper facets, a dark spine deck
        const P0 = [[0.53, 0], [0.12, 0.44], [-0.44, 0.4], [-0.52, 0], [-0.44, -0.4], [0.12, -0.44]];
        const P1 = scalePts(P0, 0.86, 0.84);
        const P2 = scalePts(P0, 0.62, 0.48, -0.03);
        b.add(loft(P1, P0, 0.06), 'hullDark', 0, 0.04, 0);
        b.add(loft(P0, P2, 0.1), 'team', 0, 0.1, 0);
        b.add(loft(P2, scalePts(P2, 0.85, 0.8), 0.025), 'hullDark', 0, 0.2, 0);
        // glowing seams along the hull outline (the Phantom's signature, also visible when ghosted)
        for (let i = 0; i < P0.length; i++) {
            const [x1, z1] = P0[i], [x2, z2] = P0[(i + 1) % P0.length];
            const len = Math.hypot(x2 - x1, z2 - z1);
            b.add(box(len * 0.96, 0.014, 0.018), 'hglow', (x1 + x2) / 2 * 0.985, 0.098, (z1 + z2) / 2 * 0.985, [0, -Math.atan2(z2 - z1, x2 - x1), 0]);
        }
        b.mirror(box(0.05, 0.02, 0.12), 'hglow', -0.38, 0.17, 0.2, [0, 0.3, 0]);
        // flat faceted turret and a short twin-prong phase gun with a glowing slit
        const tur = b.node('turret', null, -0.05, 0.22, 0);
        const Q0 = [[0.22, 0], [0.07, 0.15], [-0.15, 0.14], [-0.2, 0], [-0.15, -0.14], [0.07, -0.15]];
        const Q1 = scalePts(Q0, 0.7, 0.62, -0.02);
        b.add(loft(Q0, Q1, 0.07), 'hullDark', 0, 0, 0, null, null, tur);
        b.add(loft(Q1, scalePts(Q0, 0.5, 0.42, -0.03), 0.015), 'team', 0, 0.07, 0, null, null, tur);
        b.add(box(0.1, 0.012, 0.03), 'hglow', 0.02, 0.085, 0, null, null, tur);
        const bar = b.node('barrel', tur, 0.17, 0.035, 0);
        b.pair(box(0.21, 0.028, 0.026), 'metal', 0.1, -0.014, 0.034, null, null, bar);
        b.add(box(0.17, 0.012, 0.03), 'hglow', 0.1, -0.006, 0, null, null, bar);
        b.pair(box(0.03, 0.034, 0.034), 'hglow', 0.21, -0.017, 0.034, null, null, bar);
        b.marker('muzzle', bar, 0.24, 0, 0);
        return b.build({ height: 0.36, wheels: [] });
    }

    // ---------------------------------------------------------------- roster expansion: shared helpers
    // A strut between two points (legs, braces, crane cables): an n-sided rod from p0 to p1.
    const _up = new T.Vector3(0, 1, 0), _sq = new T.Quaternion(), _se = new T.Euler();
    function strut(b, mk, p0, p1, r, sides = 4, node, r1 = r) {
        const a = new T.Vector3(p0[0], p0[1], p0[2]), d = new T.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
        const len = +d.length().toFixed(4);
        _sq.setFromUnitVectors(_up, d.normalize());
        _se.setFromQuaternion(_sq);
        b.add(cyl(r1, r, len, sides), mk, a.x, a.y, a.z, [_se.x, _se.y, _se.z], null, node);
    }
    // A flat ring (torus) lying in the XZ plane.
    const ringGeo = (r, tube, seg = 14, rad = 3) => cached(`ring${r},${tube},${seg},${rad}`, () => new T.TorusGeometry(r, tube, rad, seg).rotateX(Math.PI / 2));
    // A plus sign lying flat (y up) or standing on a face whose normal is +X / -X (axis 'x').
    function plus(b, mk, x, y, z, s, axis = 'y', node) {
        const t = s * 0.3, th = 0.012;
        if (axis === 'y') { b.add(box(s, th, t), mk, x, y, z, null, null, node); b.add(box(t, th, s), mk, x, y, z, null, null, node); }
        else { b.add(box(th, s, t), mk, x, y - s / 2, z, null, null, node); b.add(box(th, t, s), mk, x, y - t / 2, z, null, null, node); }
    }

    // ---------------------------------------------------------------- roster expansion: Vanguard infantry
    function makeSniper() {
        // A ghillie-hooded marksman with a long scoped rifle raised to the cheek.
        const b = new Builder();
        infantryBody(b, null, { noPack: true });
        // the ghillie: a draped hood, a shawl over the shoulders, a ragged cape down the back, tufts
        b.add(ico(0.074, 0), 'ghillie', -0.008, 0.39, 0, null, [1.05, 1, 1.05]);
        b.add(box(0.025, 0.035, 0.075), 'dark', 0.058, 0.375, 0);                     // face in the hood's shadow
        b.add(hexa(0.2, 0.25, 0.1, 0.13, 0.09, -0.02, 0), 'ghillie', -0.025, 0.3, 0);  // shawl
        b.add(box(0.05, 0.03, 0.26), 'team', -0.05, 0.345, 0, [0, 0, 0.35]);         // team scarf across the shawl
        b.add(box(0.056, 0.03, 0.056), 'team', 0.03, 0.27, -0.125);                   // arm band
        b.add(hexa(0.05, 0.24, 0.04, 0.17, 0.27), 'ghillieDark', -0.1, 0.08, 0, [0, 0, -0.12]);   // cape
        for (const [x, y, z, r] of [[-0.04, 0.42, 0.05, 0.5], [-0.06, 0.41, -0.05, -0.6], [-0.1, 0.32, 0.1, 0.9], [-0.1, 0.32, -0.1, -0.9],
            [-0.13, 0.18, 0.07, 1.1], [-0.13, 0.18, -0.07, -1.1]]) {
            b.add(cone(0.035, 0.045, 4), r > 0 ? 'ghillie' : 'ghillieDark', x, y, z, [r, 0.4, 0.6]);
        }
        // arms brought up to the rifle
        b.add(box(0.12, 0.05, 0.05), 'suit', 0.03, 0.27, 0.11, [0, 0.3, 0]);
        b.add(box(0.1, 0.05, 0.05), 'suit', 0.05, 0.27, -0.03, [0, -0.5, 0]);
        // the long rifle: wrapped stock, receiver, long barrel with a muzzle brake, big scope, bipod
        const RY = 0.31, RZ = 0.07;
        b.add(box(0.12, 0.045, 0.035), 'ghillieDark', -0.1, RY - 0.03, RZ);
        b.add(box(0.12, 0.04, 0.035), 'hullDark', 0.01, RY - 0.025, RZ);
        b.add(rodX(0.011, 0.013, 0.13, 5), 'metal', 0.06, RY, RZ);
        b.add(rodX(0.018, 0.018, 0.025, 5), 'hullDark', 0.17, RY, RZ);
        b.add(rodX(0.02, 0.02, 0.1, 6), 'hullDark', -0.04, RY + 0.035, RZ);            // scope
        b.add(rodX(0.024, 0.024, 0.02, 6), 'hullDark', 0.06, RY + 0.035, RZ);
        b.add(box(0.006, 0.03, 0.03), 'glass', 0.081, RY + 0.035, RZ);                // lens glint
        b.add(cyl(0.005, 0.005, 0.09, 3), 'metal', 0.13, RY - 0.09, RZ + 0.035, [-0.3, 0, 0]);
        b.add(cyl(0.005, 0.005, 0.09, 3), 'metal', 0.13, RY - 0.09, RZ - 0.035, [0.3, 0, 0]);
        b.marker('muzzle', null, 0.195, RY, RZ);
        return b.build({ height: 0.55 });
    }

    function makeMedic() {
        // White helmet and a big white med pack, both marked with a green plus; a glowing injector in hand.
        const b = new Builder();
        infantryBody(b, null, { noPack: true });
        b.add(ico(0.07, 0), 'medic', 0, 0.395, 0);
        b.add(box(0.035, 0.03, 0.1), 'glass', 0.05, 0.375, 0);
        plus(b, 'plus', 0, 0.458, 0, 0.07);                                           // on the helmet, seen from above
        // the pack: white box with a green band, a green plus on its back and its lid
        b.add(box(0.1, 0.17, 0.19), 'medic', -0.12, 0.16, 0);
        b.add(box(0.105, 0.03, 0.195), 'medGreen', -0.12, 0.17, 0);
        b.add(box(0.11, 0.03, 0.2), 'medic', -0.12, 0.3, 0);
        plus(b, 'plus', -0.12, 0.332, 0, 0.11);
        plus(b, 'plus', -0.172, 0.255, 0, 0.08, 'x');
        b.add(box(0.03, 0.06, 0.05), 'medGreen', -0.08, 0.13, 0.11);                   // side pouch
        // arm band, arms, the injector held forward with a green glow at its tip
        b.add(box(0.056, 0.03, 0.056), 'medGreen', 0.0, 0.28, -0.125);
        b.add(box(0.05, 0.12, 0.05), 'suit', 0.03, 0.19, -0.125);
        b.add(box(0.12, 0.05, 0.05), 'suit', 0.06, 0.25, 0.12, [0, 0, -0.35]);
        b.add(box(0.07, 0.035, 0.035), 'medic', 0.125, 0.27, 0.12);
        b.add(box(0.03, 0.025, 0.025), 'plus', 0.17, 0.275, 0.12);
        b.marker('muzzle', null, 0.185, 0.287, 0.12);
        return b.build({ height: 0.55 });
    }

    function makeEngineer() {
        // Yellow hard hat with a lamp, twin gas tanks, a toolbox in one hand and a welding torch in the other.
        const b = new Builder();
        infantryBody(b, null, { noPack: true });
        b.add(ico(0.06, 0), 'suit', 0, 0.38, 0);
        b.add(box(0.03, 0.028, 0.09), 'glass', 0.05, 0.375, 0);                         // goggles
        b.add(cyl(0.1, 0.1, 0.016, 8), 'hazard', 0, 0.41, 0);                            // hat brim
        b.add(dome(0.072, 8, 3), 'hazard', 0, 0.418, 0);
        b.add(box(0.11, 0.02, 0.02), 'hazardDark', 0, 0.46, 0);                          // ridge
        b.add(box(0.02, 0.025, 0.03), 'warn', 0.07, 0.435, 0);                           // lamp
        // twin gas tanks on the back
        b.pair(cyl(0.034, 0.034, 0.17, 6), 'team', -0.115, 0.15, 0.045);
        b.pair(dome(0.034, 6, 2), 'metal', -0.115, 0.32, 0.045);
        b.add(box(0.03, 0.06, 0.14), 'hullDark', -0.085, 0.2, 0);
        // toolbox in the left hand
        b.add(box(0.05, 0.12, 0.05), 'suit', 0.0, 0.17, -0.13);
        b.add(box(0.14, 0.075, 0.06), 'toolbox', 0.01, 0.06, -0.16);
        b.add(box(0.06, 0.015, 0.012), 'metal', 0.01, 0.14, -0.16);
        b.add(box(0.144, 0.012, 0.064), 'dark', 0.01, 0.105, -0.16);
        // welding torch in the right hand, hose to the tanks, a hot blue tip
        b.add(box(0.12, 0.05, 0.05), 'suit', 0.06, 0.24, 0.12, [0, 0, -0.3]);
        b.add(rodX(0.014, 0.016, 0.09, 5), 'metal', 0.08, 0.26, 0.12);
        b.add(rodX(0.022, 0.022, 0.03, 5), 'hullDark', 0.06, 0.26, 0.12);
        b.add(box(0.025, 0.025, 0.025), 'weld', 0.18, 0.2475, 0.12);
        strut(b, 'dark', [-0.1, 0.2, 0.08], [0.08, 0.25, 0.12], 0.008, 3);
        b.marker('muzzle', null, 0.19, 0.26, 0.12);
        return b.build({ height: 0.55 });
    }

    // ---------------------------------------------------------------- roster expansion: Hegemony infantry
    function makeDisruptor() {
        // A trooper carrying a tall coil backpack (stacked glowing rings and a crackling orb) and an EMP gauntlet.
        const b = new Builder();
        hegInfantryBody(b, false, { noVanes: true });
        b.add(hexa(0.07, 0.14, 0.06, 0.12, 0.14), 'hullDark', -0.11, 0.17, 0);
        b.add(cyl(0.022, 0.03, 0.34, 5), 'metal', -0.13, 0.22, 0);
        for (const [y, r] of [[0.3, 0.062], [0.37, 0.055], [0.44, 0.047]]) {
            b.add(cyl(r, r, 0.024, 8), 'violet', -0.13, y, 0);
            b.add(cyl(r * 0.7, r * 0.7, 0.03, 8), 'hullDark', -0.13, y + 0.024, 0);
        }
        b.add(sph(0.04, 6, 4), 'hglow', -0.13, 0.57, 0);
        b.mirror(cyl(0.006, 0.006, 0.09, 3), 'metal', -0.13, 0.5, 0.02, [0.5, 0, 0]);
        // EMP gauntlet on the right arm: a dark block with a glowing emitter disc
        b.add(box(0.045, 0.11, 0.045), 'suit', 0.03, 0.2, -0.125);
        b.add(box(0.13, 0.05, 0.05), 'suit', 0.05, 0.25, 0.125, [0, 0, -0.3]);
        b.add(box(0.08, 0.07, 0.07), 'teamDark', 0.12, 0.26, 0.125);
        b.add(cyl(0.035, 0.035, 0.015, 6), 'violet', 0.165, 0.26, 0.125, [0, 0, Math.PI / 2]);
        strut(b, 'hglow', [-0.1, 0.3, 0.05], [0.1, 0.28, 0.12], 0.006, 3);
        b.marker('muzzle', null, 0.18, 0.26, 0.125);
        return b.build({ height: 0.6 });
    }

    function makeAcolyte() {
        // A robed healer: flared team-coloured robe, pointed hood, a tall staff topped with a pale glowing crystal.
        const b = new Builder();
        b.cur = b.node('body', b.root, 0, 0, 0, null, [1.1, 1.2, 1.1]);
        const R0 = ngon(6, 0.16, Math.PI / 6), R1 = ngon(6, 0.085, Math.PI / 6);
        b.add(loft(scalePts(R0, 1.04), R0, 0.03), 'hullDark', 0, 0, 0);                 // hem
        b.add(loft(R0, R1, 0.29), 'team', 0, 0.03, 0);                                   // robe
        b.add(box(0.012, 0.25, 0.03), 'hglow', 0.112, 0.04, 0, [0, 0, 0.255]);           // glowing front seam
        b.add(loft(scalePts(R1, 1.25), scalePts(R1, 0.8), 0.07), 'hull', 0, 0.3, 0);    // pearl mantle
        b.mirror(hexa(0.08, 0.06, 0.05, 0.03, 0.05, 0, 0.02), 'teamDark', 0, 0.33, 0.085);
        // hood: a tall pointed cowl leaning back, dark opening, two glowing eyes
        b.add(hexa(0.11, 0.11, 0.025, 0.03, 0.16, -0.045, 0), 'teamDark', -0.005, 0.355, 0);
        b.add(box(0.02, 0.06, 0.06), 'dark', 0.047, 0.37, 0);
        b.pair(box(0.012, 0.012, 0.012), 'hglow', 0.058, 0.39, 0.015);
        // sash, arms
        b.add(box(0.13, 0.03, 0.13), 'hullDark', 0, 0.2, 0);
        b.add(box(0.045, 0.12, 0.045), 'teamDark', 0.0, 0.2, -0.1);
        b.add(box(0.1, 0.045, 0.045), 'teamDark', 0.03, 0.29, 0.1, [0, 0, -0.4]);
        // the staff (held at the side, leaning forward a touch), crystal, halo
        b.add(cyl(0.009, 0.011, 0.5, 4), 'metal', 0.07, 0.02, 0.13);
        b.add(cone(0.02, 0.05, 4), 'metal', 0.07, 0.5, 0.13);
        b.add(prismGem(0.032, 0.1, 4), 'heal', 0.07, 0.6, 0.13);
        b.add(ringGeo(0.045, 0.006, 10, 3), 'hglow', 0.07, 0.6, 0.13);
        b.marker('muzzle', null, 0.08, 0.6, 0.13);
        return b.build({ height: 0.6 });
    }

    function makeStalker() {
        // Slim and hooded, crouched to strike: a long magenta energy blade in the right hand, a short one in the left.
        const b = new Builder();
        b.cur = b.node('body', b.root, 0, 0, 0, null, [1.05, 1.22, 1.0]);
        // wide crouched stance
        for (const [hip, knee, foot] of [[[0.02, 0.16, 0.05], [0.09, 0.09, 0.055], [0.075, 0.0, 0.06]],
            [[-0.02, 0.16, -0.05], [-0.03, 0.07, -0.055], [-0.11, 0.015, -0.06]]]) {
            strut(b, 'suit', hip, knee, 0.026, 4, null, 0.022);
            strut(b, 'suit', knee, foot, 0.022, 4, null, 0.02);
            b.add(box(0.03, 0.04, 0.045), 'teamDark', knee[0] + 0.01, knee[1] - 0.02, knee[2]);
        }
        b.add(box(0.07, 0.022, 0.05), 'dark', 0.09, 0, 0.06);
        b.add(box(0.06, 0.022, 0.05), 'dark', -0.12, 0, -0.06, [0, 0, 0.3]);
        b.add(box(0.06, 0.04, 0.11), 'suit', 0, 0.14, 0);
        // slim torso leaning forward, a glowing spine line, a swept shoulder plate on the blade arm
        b.add(hexa(0.08, 0.11, 0.11, 0.19, 0.15, 0.03, 0), 'team', 0, 0.17, 0, [0, 0, -0.25]);
        b.add(hexa(0.08, 0.06, 0.04, 0.03, 0.06, -0.01, 0.03), 'team', 0.04, 0.3, 0.085);
        b.add(box(0.015, 0.12, 0.02), 'hglow', -0.05, 0.2, 0, [0, 0, -0.25]);
        // the hood: a sharp cowl swept back into a trailing scarf
        b.add(hexa(0.085, 0.08, 0.02, 0.025, 0.12, -0.05, 0), 'hullDark', 0.055, 0.3, 0);
        b.add(box(0.015, 0.012, 0.05), 'hglow', 0.08, 0.335, 0);
        strut(b, 'hullDark', [-0.02, 0.33, 0], [-0.17, 0.17, 0.02], 0.016, 4, null, 0.04);   // trailing scarf
        // right arm raised forward: the long blade
        strut(b, 'suit', [0.02, 0.31, 0.1], [0.1, 0.24, 0.125], 0.022, 4);
        b.add(box(0.035, 0.035, 0.035), 'hullDark', 0.1, 0.225, 0.125);
        strut(b, 'hglow', [0.1, 0.24, 0.125], [0.2, 0.45, 0.165], 0.013, 4, null, 0.004);
        // left arm low: a short reversed blade
        strut(b, 'suit', [0.0, 0.3, -0.1], [0.01, 0.17, -0.12], 0.022, 4);
        strut(b, 'hglow', [0.01, 0.17, -0.12], [-0.1, 0.09, -0.14], 0.011, 4, null, 0.004);
        b.marker('muzzle', null, 0.2, 0.45, 0.165);
        return b.build({ height: 0.48 });
    }

    // ---------------------------------------------------------------- roster expansion: Vanguard vehicles
    function makeScout() {
        // Recon Bike: two fat wheels, a team-coloured tank and fairing, a hunched rider, a small gun on the nose.
        const b = new Builder();
        const wheels = [], R = 0.105;
        addWheel(b, wheels, 0.215, R, 0, R, 0.085);
        addWheel(b, wheels, -0.215, R, 0, R, 0.095);
        b.pair(box(0.03, 0.17, 0.02), 'metal', 0.2, 0.09, 0.055, [0, 0, 0.4]);           // fork
        b.pair(box(0.2, 0.03, 0.02), 'hullDark', -0.12, 0.11, 0.055, [0, 0, 0.1]);       // swing arm
        b.add(box(0.18, 0.1, 0.1), 'hullDark', -0.02, 0.1, 0);                          // engine
        b.pair(rodX(0.014, 0.014, 0.16, 5), 'metal', -0.3, 0.13, 0.065);                // exhausts
        b.add(hexa(0.22, 0.15, 0.15, 0.12, 0.07, -0.02, 0), 'team', 0.04, 0.19, 0);       // tank
        b.add(hexa(0.1, 0.17, 0.05, 0.14, 0.1, -0.03, 0), 'team', 0.19, 0.21, 0, [0, 0, 0.35]);   // fairing
        b.add(box(0.02, 0.04, 0.06), 'warn', 0.255, 0.26, 0);                             // headlight
        b.add(box(0.13, 0.04, 0.11), 'dark', -0.1, 0.2, 0);                               // seat
        b.add(box(0.1, 0.025, 0.12), 'team', -0.22, 0.22, 0);                             // tail
        b.add(box(0.02, 0.025, 0.08), 'redLight', -0.27, 0.23, 0);
        b.pair(box(0.11, 0.07, 0.035), 'teamDark', -0.18, 0.15, 0.085);                   // panniers
        // the rider, leaning forward over the tank
        b.pair(box(0.11, 0.035, 0.035), 'suit', -0.06, 0.22, 0.06, [0, 0, 0.5]);
        b.add(hexa(0.11, 0.14, 0.1, 0.16, 0.13, 0.04, 0), 'suit', -0.08, 0.23, 0, [0, 0, -0.6]);
        b.add(box(0.12, 0.03, 0.15), 'team', -0.04, 0.33, 0, [0, 0, -0.6]);              // back armour
        b.pair(box(0.13, 0.03, 0.03), 'suit', 0.03, 0.31, 0.06, [0, 0, -0.3]);           // arms to the bars
        b.add(box(0.02, 0.02, 0.16), 'metal', 0.1, 0.3, 0);                               // handlebar
        b.add(ico(0.055, 0), 'team', 0.03, 0.38, 0);                                      // helmet
        b.add(box(0.03, 0.025, 0.07), 'glass', 0.075, 0.38, 0);
        b.add(cyl(0.004, 0.004, 0.14, 3), 'metal', -0.2, 0.24, -0.05);                    // whip antenna
        b.pair(rodX(0.009, 0.009, 0.08, 4), 'dark', 0.23, 0.29, 0.025);                   // nose guns
        b.marker('muzzle', null, 0.31, 0.29, 0);
        return b.build({ height: 0.44, wheels, wheelRadius: R });
    }

    function makeSalvo() {
        // Salvo Launcher: a six-wheel truck with a team-coloured box rocket pod (2 × 3 warheads) on a turntable.
        const b = new Builder();
        const wheels = [], R = 0.11;
        b.add(box(0.98, 0.1, 0.4), 'hullDark', 0, 0.09, 0);
        for (const x of [0.3, -0.1, -0.33]) {
            addWheel(b, wheels, x, R, 0.23, R, 0.09);
            addWheel(b, wheels, x, R, -0.23, R, 0.09);
        }
        b.pair(box(0.24, 0.025, 0.12), 'teamDark', 0.3, 0.22, 0.23);                      // front fenders
        b.pair(box(0.5, 0.025, 0.12), 'teamDark', -0.215, 0.22, 0.23);
        // cab
        b.add(hexa(0.26, 0.44, 0.2, 0.38, 0.22, -0.03, 0), 'team', 0.35, 0.19, 0);
        b.add(box(0.03, 0.08, 0.32), 'glass', 0.455, 0.3, 0);
        b.pair(box(0.12, 0.06, 0.02), 'glass', 0.33, 0.31, 0.2);
        b.add(box(0.2, 0.03, 0.36), 'hullDark', 0.33, 0.41, 0);
        b.pair(box(0.02, 0.04, 0.06), 'warn', 0.47, 0.17, 0.14);
        b.pair(cyl(0.02, 0.02, 0.05, 5), 'warn', 0.3, 0.44, 0.12);
        // bed, stabiliser jacks, ammo lockers
        b.add(box(0.62, 0.05, 0.44), 'hull', -0.17, 0.19, 0);
        b.pair(box(0.05, 0.16, 0.05), 'hazard', -0.44, 0.04, 0.2);
        b.pair(box(0.09, 0.02, 0.09), 'dark', -0.44, 0.0, 0.2);
        b.add(box(0.12, 0.09, 0.4), 'hullDark', 0.13, 0.24, 0);
        // the pod on its turntable; tilted up, tubes facing +X
        b.add(cyl(0.15, 0.17, 0.05, 8), 'hullDark', -0.16, 0.24, 0);
        const tur = b.node('turret', null, -0.16, 0.29, 0);
        b.add(cyl(0.12, 0.12, 0.04, 8), 'team', 0, 0, 0, null, null, tur);
        b.pair(box(0.16, 0.12, 0.03), 'hullDark', 0, 0.03, 0.12, null, null, tur);       // yoke
        const pod = b.node('pod', tur, 0, 0.18, 0, [0, 0, 0.32]);
        b.add(box(0.42, 0.2, 0.3), 'team', -0.03, -0.1, 0, null, null, pod);
        b.add(box(0.43, 0.02, 0.31), 'team', -0.03, 0.1, 0, null, null, pod);
        for (const z of [-0.07, 0.07]) b.add(box(0.36, 0.012, 0.03), 'hullDark', -0.05, 0.12, z, null, null, pod);
        b.pair(box(0.44, 0.03, 0.012), 'hazard', -0.03, -0.03, 0.156, null, null, pod);
        b.add(box(0.03, 0.21, 0.31), 'dark', 0.185, -0.105, 0, null, null, pod);
        for (const y of [-0.05, 0.04]) for (const z of [-0.09, 0, 0.09]) {
            b.add(rodX(0.026, 0.0, 0.05, 5), 'warn', 0.2, y, z, null, null, pod);
        }
        b.marker('muzzle', pod, 0.26, 0, 0);
        return b.build({ height: 0.55, wheels, wheelRadius: R });
    }

    function makeBulwark() {
        // Bulwark: a super-heavy, very wide twin-cannon tank with double treads, side armour and a cupola gun.
        const b = new Builder();
        b.pair(hexa(1.12, 0.3, 1.38, 0.3, 0.24), 'tread', 0, 0, 0.46);
        for (const x of [-0.48, -0.24, 0, 0.24, 0.48]) b.pair(wheel(0.085, 0.02, 6), 'hullDark', x, 0.1, 0.615);
        b.pair(box(1.4, 0.05, 0.32), 'teamDark', 0, 0.24, 0.46);                      // fenders
        b.pair(box(1.0, 0.12, 0.04), 'team', 0.02, 0.15, 0.62);                        // side skirts
        b.pair(box(0.1, 0.06, 0.32), 'hullDark', 0.66, 0.2, 0.46, [0, 0, 0.5]);
        // hull: sloped glacis, raised centre, engine deck with grilles
        b.add(hexa(1.24, 0.68, 0.98, 0.62, 0.22, -0.1, 0), 'hull', 0, 0.12, 0);
        b.add(box(0.34, 0.04, 0.56), 'hullDark', -0.46, 0.34, 0);
        for (const z of [-0.16, 0, 0.16]) b.add(box(0.28, 0.012, 0.06), 'dark', -0.46, 0.38, z);
        b.pair(box(0.1, 0.05, 0.08), 'dark', -0.62, 0.36, 0.2);
        b.pair(box(0.05, 0.035, 0.07), 'warn', 0.6, 0.24, 0.2);
        // the turret: big faceted block in team colour, rear bustle, cupola with a small gun, sensor bar
        const tur = b.node('turret', null, -0.04, 0.36, 0);
        b.add(hexa(0.64, 0.6, 0.48, 0.48, 0.22, -0.03, 0), 'team', 0, 0, 0, null, null, tur);
        b.add(box(0.18, 0.16, 0.56), 'hullDark', -0.34, 0.02, 0, null, null, tur);
        b.add(box(0.5, 0.03, 0.04), 'teamGlow', 0.0, 0.22, 0, null, null, tur);
        b.add(cyl(0.09, 0.1, 0.06, 6), 'hullDark', -0.12, 0.22, 0.13, null, null, tur);
        b.add(rodX(0.012, 0.012, 0.16, 4), 'dark', -0.1, 0.3, 0.13, null, null, tur);
        b.add(box(0.06, 0.04, 0.12), 'hullDark', 0.22, 0.17, -0.17, null, null, tur);   // sight
        b.add(box(0.012, 0.03, 0.08), 'glass', 0.25, 0.18, -0.17, null, null, tur);
        b.add(cyl(0.008, 0.008, 0.24, 3), 'metal', -0.3, 0.2, -0.22, null, null, tur);
        b.add(box(0.12, 0.14, 0.38), 'hullDark', 0.25, 0.04, 0, null, null, tur);       // twin mantlet
        for (const [name, mz, z] of [['barrel', 'muzzle', 0.1], ['barrel2', 'muzzle2', -0.1]]) {
            const bar = b.node(name, tur, 0.28, 0.11, z);
            b.add(rodX(0.038, 0.042, 0.3, 6), 'metal', 0.02, 0, 0, null, null, bar);
            b.add(rodX(0.05, 0.05, 0.07, 6), 'hullDark', 0.13, 0, 0, null, null, bar);    // fume extractor
            b.add(rodX(0.05, 0.05, 0.06, 6), 'hullDark', 0.31, 0, 0, null, null, bar);    // muzzle brake
            b.marker(mz, bar, 0.38, 0, 0);
        }
        return b.build({ height: 0.65, wheels: [] });
    }

    // ---------------------------------------------------------------- roster expansion: Hegemony vehicles
    function makeWisp() {
        // Wisp Drone: a small faceted orb with one glowing eye, swept fins and a spinning ring, floating high.
        const b = new Builder();
        const Y = 0.32;
        b.cur = b.node('hover', b.root, 0, 0, 0);
        b.add(prismGem(0.12, 0.24, 6), 'team', 0, Y, 0, [0, Math.PI / 6, 0]);
        b.add(cyl(0.122, 0.122, 0.03, 6), 'hullDark', 0, Y - 0.015, 0, [0, Math.PI / 6, 0]);
        b.add(box(0.04, 0.045, 0.06), 'hglow', 0.095, Y + 0.01, 0);                     // the eye
        b.add(cone(0.05, 0.08, 6), 'hullDark', 0, Y - 0.09, 0, [Math.PI, 0, 0]);
        b.add(sph(0.026, 6, 4), 'hglow', 0, Y - 0.175, 0);                               // the lift glow underneath
        b.mirror(hexa(0.14, 0.02, 0.04, 0.012, 0.1, -0.06, 0), 'teamDark', -0.02, Y, 0.1, [0.9, 0, 0]);
        b.mirror(box(0.035, 0.025, 0.02), 'hglow', -0.07, Y + 0.075, 0.175, [0.9, 0, 0]);
        b.pair(rodX(0.007, 0.007, 0.1, 3), 'metal', 0.08, Y - 0.04, 0.03);              // zapper prongs
        b.add(box(0.02, 0.02, 0.02), 'hglow', 0.18, Y - 0.04, 0);
        b.marker('muzzle', null, 0.19, Y - 0.04, 0);
        // the ring (spins; tilted a little so the spin reads)
        const ring = b.node('ring', null, 0, Y, 0);
        b.add(ringGeo(0.22, 0.016, 14, 3), 'violet', 0, 0, 0, [0.28, 0, 0], null, ring);
        for (let i = 0; i < 3; i++) {
            const a = i / 3 * Math.PI * 2;
            b.add(box(0.04, 0.03, 0.03), 'hullDark', Math.cos(a) * 0.22, -Math.sin(a) * 0.22 * Math.sin(0.28), Math.sin(a) * 0.22 * Math.cos(0.28), [0.28, -a, 0], null, ring);
        }
        b.cur = null;
        return b.build({ height: 0.5, hover: true, hoverHeight: Y, wheels: [] });
    }

    function makeArcwalker() {
        // Arc Walker: a team-coloured faceted body on four spider legs, a tesla coil on top (the turret).
        // Hips and thighs ride on the 'body' node (the renderer may bob it); the shins and feet stay planted.
        const b = new Builder();
        const body = b.node('body', b.root, 0, 0, 0);
        for (const sx of [1, -1]) for (const sz of [1, -1]) {
            const hip = [0.15 * sx, 0.3, 0.14 * sz], knee = [0.34 * sx, 0.44, 0.34 * sz], foot = [0.43 * sx, 0.02, 0.43 * sz];
            strut(b, 'hullDark', hip, knee, 0.04, 4, body, 0.032);
            b.add(box(0.12, 0.03, 0.07), 'team', (hip[0] + knee[0]) / 2, (hip[1] + knee[1]) / 2 + 0.035, (hip[2] + knee[2]) / 2, [0, -Math.atan2(sz, sx), 0.47], null, body);
            b.add(sph(0.045, 6, 4), 'metal', knee[0], knee[1], knee[2], null, null, body);
            strut(b, 'hullDark', [knee[0], knee[1] - 0.03, knee[2]], foot, 0.02, 4, null, 0.028);
            b.add(box(0.02, 0.06, 0.02), 'hglow', knee[0] * 1.06, knee[1] - 0.12, knee[2] * 1.06);
            b.add(hexa(0.12, 0.12, 0.07, 0.07, 0.04), 'tread', foot[0], 0, foot[2], [0, Math.PI / 4, 0]);
        }
        // body: dark under-hull, faceted team hull, glowing seams
        const H0 = [[0.3, 0], [0.12, 0.23], [-0.2, 0.23], [-0.3, 0], [-0.2, -0.23], [0.12, -0.23]];
        const H1 = scalePts(H0, 0.7, 0.68);
        b.add(loft(scalePts(H0, 0.7, 0.7), H0, 0.07), 'hullDark', 0, 0.24, 0, null, null, body);
        b.add(loft(H0, H1, 0.13), 'team', 0, 0.31, 0, null, null, body);
        b.mirror(box(0.18, 0.015, 0.02), 'hglow', 0.17, 0.32, 0.16, [0, 0.9, 0], null, body);
        b.add(box(0.06, 0.04, 0.16), 'hglow', 0.265, 0.33, 0, null, null, body);         // sensor band at the front
        // the tesla coil (turret): collar, column, stacked discs, crown ring and a forward discharge prong
        const tur = b.node('turret', body, -0.02, 0.44, 0);
        b.add(cyl(0.13, 0.15, 0.05, 6), 'hullDark', 0, 0, 0, null, null, tur);
        b.add(cyl(0.035, 0.05, 0.3, 6), 'metal', 0, 0.05, 0, null, null, tur);
        for (const [y, r] of [[0.1, 0.11], [0.17, 0.09], [0.24, 0.07]]) {
            b.add(cyl(r, r, 0.022, 8), 'violet', 0, y, 0, null, null, tur);
            b.add(cyl(r * 0.6, r * 0.6, 0.04, 6), 'teamDark', 0, y + 0.022, 0, null, null, tur);
        }
        b.add(sph(0.07, 8, 5), 'hglow', 0, 0.38, 0, null, null, tur);
        b.add(rodX(0.012, 0.004, 0.13, 4), 'metal', 0.05, 0.38, 0, null, null, tur);
        b.mirror(rodX(0.008, 0.003, 0.08, 3), 'metal', 0.03, 0.34, 0.03, [0, 0.9, 0.4], null, tur);
        b.marker('muzzle', tur, 0.19, 0.38, 0);
        const ring = b.node('ring', tur, 0, 0.38, 0);
        b.add(ringGeo(0.12, 0.01, 12, 3), 'hglow', 0, 0, 0, [0.35, 0, 0], null, ring);
        return b.build({ height: 0.75, wheels: [], walker: true });
    }

    function makeObliterator() {
        // Obliterator: a big faceted hover platform with glowing pads, side pylons and a long beam lance.
        const b = new Builder();
        const Y = 0.13;
        b.cur = b.node('hover', b.root, 0, 0, 0);
        const P0 = [[0.72, 0], [0.42, 0.55], [-0.5, 0.58], [-0.72, 0.3], [-0.72, -0.3], [-0.5, -0.58], [0.42, -0.55]];
        const P1 = scalePts(P0, 0.84, 0.8);
        const P2 = scalePts(P0, 0.6, 0.52, -0.04);
        b.add(loft(scalePts(P0, 0.82, 0.8), P0, 0.06), 'hullDark', 0, Y, 0);
        b.add(loft(P0, P1, 0.1), 'team', 0, Y + 0.06, 0);
        b.add(loft(P1, P2, 0.06), 'team', 0, Y + 0.16, 0);
        b.add(loft(P2, scalePts(P2, 0.8, 0.75), 0.012), 'hull', 0, Y + 0.22, 0);
        // glowing seams along the outline
        for (let i = 0; i < P0.length; i++) {
            const [x1, z1] = P0[i], [x2, z2] = P0[(i + 1) % P0.length];
            const len = Math.hypot(x2 - x1, z2 - z1);
            b.add(box(len * 0.9, 0.016, 0.02), 'hglow', (x1 + x2) / 2 * 0.985, Y + 0.058, (z1 + z2) / 2 * 0.985, [0, -Math.atan2(z2 - z1, x2 - x1), 0]);
        }
        // hover pads: four corner discs and a big central one
        for (const [x, z, r] of [[0.36, 0.34, 0.12], [0.36, -0.34, 0.12], [-0.46, 0.36, 0.12], [-0.46, -0.36, 0.12], [-0.05, 0, 0.2]]) {
            b.add(cyl(r, r * 0.85, 0.05, 8), 'hullDark', x, Y - 0.05, z);
            b.add(cyl(r * 0.78, r * 0.78, 0.02, 8), 'hglow', x, Y - 0.065, z);
        }
        // side pylons with floating crystals
        b.mirror(hexa(0.3, 0.06, 0.06, 0.03, 0.26, -0.12, 0), 'teamDark', -0.4, Y + 0.16, 0.42, [0.25, 0, 0]);
        b.mirror(box(0.06, 0.04, 0.04), 'hglow', -0.52, Y + 0.41, 0.484, [0.25, 0, 0]);
        b.pair(prismGem(0.035, 0.12, 4), 'violet', 0.3, Y + 0.32, 0.4);
        b.pair(box(0.08, 0.06, 0.08), 'hullDark', 0.3, Y + 0.16, 0.4);
        // turret: a faceted block with a capacitor bank behind it
        const tur = b.node('turret', null, -0.06, Y + 0.22, 0);
        const T0 = [[0.22, 0], [0.08, 0.2], [-0.24, 0.2], [-0.3, 0], [-0.24, -0.2], [0.08, -0.2]];
        b.add(loft(T0, scalePts(T0, 0.7, 0.65, -0.03), 0.16), 'team', 0, 0, 0, null, null, tur);
        b.add(loft(scalePts(T0, 0.7, 0.65, -0.03), scalePts(T0, 0.5, 0.45, -0.05), 0.03), 'hullDark', 0, 0.16, 0, null, null, tur);
        for (const z of [-0.12, 0, 0.12]) {
            b.add(cyl(0.04, 0.04, 0.16, 6), 'violet', -0.27, 0.04, z, null, null, tur);
            b.add(cyl(0.045, 0.045, 0.03, 6), 'hullDark', -0.27, 0.2, z, null, null, tur);
        }
        // the lance: long twin rails, a glowing core, focusing rings and a crystal at the tip
        const bar = b.node('barrel', tur, 0.1, 0.09, 0);
        b.add(box(0.14, 0.13, 0.2), 'hullDark', 0.02, -0.065, 0, null, null, bar);
        b.pair(box(0.48, 0.04, 0.035), 'hullDark', 0.28, -0.02, 0.055, null, null, bar);
        b.pair(box(0.4, 0.012, 0.012), 'hglow', 0.28, 0.022, 0.055, null, null, bar);
        b.add(rodX(0.02, 0.02, 0.44, 5), 'hglow', 0.06, 0, 0, null, null, bar);
        for (const x of [0.18, 0.31, 0.43]) b.add(box(0.03, 0.1, 0.16), 'metal', x, -0.05, 0, null, null, bar);
        b.add(prismGem(0.04, 0.1, 4), 'hglow', 0.52, 0, 0, [0, 0, Math.PI / 2], null, bar);
        b.marker('muzzle', bar, 0.56, 0, 0);
        b.cur = null;
        return b.build({ height: 0.6, hover: true, hoverHeight: Y, wheels: [] });
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

    // ---------------------------------------------------------------- faction buildings
    // A swept blade (Hegemony motif): its base runs along local X, the top leans back towards -X; glowing tip.
    function fin(b, x, y, z, ry, h = 0.6, len = 0.36, mk = 'teamDark') {
        const back = -len * 0.42;
        b.add(hexa(len, 0.05, 0.06, 0.03, h, back, 0), mk, x, y, z, [0, ry, 0]);
        b.add(box(0.07, 0.05, 0.045), 'hglow', x + Math.cos(ry) * back, y + h, z - Math.sin(ry) * back, [0, ry, 0]);
    }
    // A fin at (x, z) whose top leans away from the building centre.
    const cornerFin = (b, x, z, y, h, len) => fin(b, x, y, z, Math.PI - Math.atan2(z, x), h, len);
    // A floating energy crystal over a small pedestal.
    function floatGem(b, x, y, z, s = 1) {
        b.add(cone(0.1 * s, 0.1 * s, 6), 'hullDark', x, y, z);
        b.add(cyl(0.11 * s, 0.11 * s, 0.02, 6), 'hglow', x, y, z);
        b.add(prismGem(0.075 * s, 0.24 * s, 4), 'violet', x, y + 0.27 * s, z);
    }

    function makePulseSpire() {
        // Not a solid tower: three team-coloured claws on a faceted plinth hold a floating, turning emitter crystal.
        const b = new Builder();
        b.add(octo(0.92, 0.1), 'hullDark', 0, 0, 0);
        b.add(loft(ngon(6, 0.42, Math.PI / 6), ngon(6, 0.33, Math.PI / 6), 0.18), 'hull', 0, 0.1, 0);
        b.add(cyl(0.3, 0.3, 0.035, 6), 'team', 0, 0.28, 0);
        b.add(cyl(0.12, 0.12, 0.03, 6), 'hglow', 0, 0.3, 0);
        for (let i = 0; i < 3; i++) {
            const a = Math.PI / 2 + i / 3 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
            const r0 = 0.27, r1 = 0.2;
            // lower claw leans in, upper claw flicks back out; a glowing tip on each
            b.add(hexa(0.14, 0.09, 0.08, 0.06, 0.5, -(r0 - r1), 0), 'team', c * r0, 0.3, s * r0, [0, -a, 0]);
            b.add(hexa(0.08, 0.06, 0.025, 0.035, 0.34, 0.06, 0), 'hull', c * r1, 0.8, s * r1, [0, -a, 0]);
            b.add(box(0.035, 0.07, 0.035), 'hglow', c * (r1 + 0.06), 1.12, s * (r1 + 0.06), [0, -a, 0]);
            b.add(box(0.02, 0.3, 0.05), 'hglow', c * (r0 + 0.06), 0.38, s * (r0 + 0.06), [0, -a, 0.2]);
        }
        // the emitter head (turret): a collar, the crystal and a short spike pointing +X with the muzzle at its tip
        const tur = b.node('turret', null, 0, 1.24, 0);
        b.add(cyl(0.12, 0.12, 0.035, 6), 'hullDark', 0, -0.06, 0, null, null, tur);
        b.add(prismGem(0.13, 0.42, 4), 'hglow', 0, 0.04, 0, [0, Math.PI / 4, 0], null, tur);
        b.add(rodX(0.022, 0.032, 0.2, 4), 'metal', 0.07, -0.04, 0, null, null, tur);
        b.add(box(0.05, 0.05, 0.05), 'hglow', 0.28, -0.04, 0, null, null, tur);
        b.marker('muzzle', tur, 0.31, -0.04, 0);
        return b.build({ height: 1.3 });
    }

    function makeUplink() {
        // Vanguard: a heavy armoured base, a big dish pointing at the sky, the focus glows as the Lance charges.
        const b = new Builder();
        slab(b, 2, 2);
        b.add(octo(1.56, 0.24), 'hull', 0, 0.08, 0);
        b.add(octo(1.62, 0.07), 'team', 0, 0.3, 0);
        b.add(octo(1.3, 0.1), 'hullDark', 0, 0.37, 0);
        b.add(box(0.9, 0.05, 0.03), 'hazard', 0, 0.16, 0.79);
        b.add(box(0.03, 0.05, 0.9), 'hazard', 0.79, 0.16, 0);
        // corner pylons with lights, a generator block and a control hut with a lit window
        for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) {
            b.add(box(0.2, 0.5, 0.2), 'hullDark', x, 0.08, z);
            b.add(box(0.22, 0.06, 0.22), 'team', x, 0.4, z);
            b.add(cyl(0.05, 0.05, 0.06, 6), 'warn', x, 0.58, z);
        }
        b.add(box(0.4, 0.26, 0.3), 'hull', -0.45, 0.08, 0.66);
        b.add(box(0.3, 0.05, 0.02), 'glass', -0.45, 0.22, 0.815);
        b.add(box(0.44, 0.04, 0.34), 'team', -0.45, 0.34, 0.66);
        // pedestal and yoke
        b.add(cyl(0.2, 0.3, 0.32, 8), 'hullDark', 0, 0.47, 0);
        for (const x of [-0.24, 0.24]) b.add(box(0.08, 0.26, 0.14), 'team', x, 0.62, 0);
        // the dish (tilted a little south so the RTS camera looks into it)
        const dish = b.node('dish', null, 0, 0.8, 0, [0.28, 0, 0]);
        const R = 1.0, CAP = 0.8;
        const bowl = cached('upbowl', () => doubleSided(new T.SphereGeometry(R, 14, 3, 0, Math.PI * 2, Math.PI - CAP, CAP).translate(0, R, 0)));
        b.add(bowl, 'dish', 0, 0, 0, null, null, dish);
        const rimR = R * Math.sin(CAP), rimY = R * (1 - Math.cos(CAP));
        b.add(cached('uprim', () => new T.TorusGeometry(rimR, 0.04, 3, 16).rotateX(Math.PI / 2)), 'team', 0, rimY, 0, null, null, dish);
        b.add(cyl(0.12, 0.22, 0.12, 8), 'team', 0, -0.1, 0, null, null, dish);
        // three struts from the rim to the focus
        const F = 0.62, up = new T.Vector3(0, 1, 0), q = new T.Quaternion(), eu = new T.Euler();
        for (let i = 0; i < 3; i++) {
            const a = Math.PI / 2 + i / 3 * Math.PI * 2;
            const p0 = new T.Vector3(Math.cos(a) * rimR * 0.97, rimY, Math.sin(a) * rimR * 0.97), p1 = new T.Vector3(0, F, 0);
            const d = p1.clone().sub(p0), len = d.length();
            q.setFromUnitVectors(up, d.normalize());
            eu.setFromQuaternion(q);
            b.add(cyl(0.018, 0.018, len, 4), 'metal', p0.x, p0.y, p0.z, [eu.x, eu.y, eu.z], null, dish);
        }
        b.add(cyl(0.05, 0.08, 0.12, 6), 'hullDark', 0, F + 0.04, 0, null, null, dish);
        // the charge glow: focus orb, a ring around it and a glowing plate at the bottom of the bowl
        const charge = b.node('charge', dish, 0, F, 0);
        b.add(sph(0.085, 8, 6), 'energy', 0, 0, 0, null, null, charge);
        b.add(cached('upring', () => new T.TorusGeometry(0.15, 0.02, 3, 12).rotateX(Math.PI / 2)), 'energy', 0, -0.02, 0, null, null, charge);
        b.add(cyl(0.2, 0.2, 0.02, 10), 'energy', 0, -F + 0.005, 0, null, null, charge);
        return b.build({ height: 1.4 });
    }

    function makeRiftsilo() {
        // Hegemony: a faceted octagonal silo with team-coloured hatch doors over a missile, swept corner fins.
        const b = new Builder();
        slab(b, 2, 2);
        const O0 = ngon(8, 0.92, Math.PI / 8), O1 = ngon(8, 0.84, Math.PI / 8), O2 = ngon(8, 0.72, Math.PI / 8);
        b.add(loft(O0, O1, 0.3), 'hull', 0, 0.08, 0);
        b.add(loft(O1, O2, 0.26), 'team', 0, 0.38, 0);
        b.add(loft(O2, scalePts(O2, 0.95), 0.03), 'hullDark', 0, 0.64, 0);
        b.add(box(0.94, 0.012, 0.88), 'dark', 0, 0.67, 0);
        // glowing conduits on the diagonal faces
        for (let i = 0; i < 4; i++) {
            const a = Math.PI / 4 + i * Math.PI / 2;
            b.add(box(0.03, 0.22, 0.12), 'hglow', Math.cos(a) * 0.79, 0.12, Math.sin(a) * 0.79, [0, -a, 0]);
        }
        // swept fins on the four corners
        for (const [x, z] of [[-0.74, -0.74], [0.74, -0.74], [0.74, 0.74], [-0.74, 0.74]]) cornerFin(b, x, z, 0.08, 0.72, 0.34);
        // control pod (south-west) with a violet window
        b.add(hexa(0.3, 0.26, 0.2, 0.18, 0.2), 'hull', -0.5, 0.36, 0.55);
        b.add(box(0.16, 0.04, 0.02), 'glass', -0.5, 0.46, 0.67);
        // the missile, standing in the shaft (its glowing nose shows when the doors open)
        const mis = b.node('missile', null, 0, 0.24, 0);
        b.add(cyl(0.085, 0.085, 0.36, 8), 'metal', 0, 0, 0, null, null, mis);
        b.add(cyl(0.09, 0.09, 0.06, 8), 'team', 0, 0.22, 0, null, null, mis);
        b.add(cone(0.085, 0.16, 8), 'hglow', 0, 0.36, 0, null, null, mis);
        for (let i = 0; i < 2; i++) b.add(box(0.24, 0.12, 0.02), 'team', 0, 0, 0, [0, i * Math.PI / 2 + Math.PI / 4, 0], null, mis);
        // hatch doors hinged at their outer (west / east) edges so they swing open to the sides as seen from the RTS
        // camera; closed they form a shallow gable over the missile's nose
        const OPEN = 1.9;
        const dl = b.node('doorL', null, -0.46, 0.67, 0);
        const dr = b.node('doorR', null, 0.46, 0.67, 0);
        for (const [n, s] of [[dl, 1], [dr, -1]]) {
            const rz = 0.25 * s, lift = Math.sin(0.25);
            b.add(box(0.46, 0.05, 0.88), 'team', 0.23 * s, 0.23 * lift, 0, [0, 0, rz], null, n);
            b.add(box(0.2, 0.012, 0.5), 'hullDark', 0.2 * s, 0.2 * lift + 0.047, 0, [0, 0, rz], null, n);
            b.add(box(0.03, 0.025, 0.82), 'hglow', 0.43 * s, 0.43 * lift + 0.035, 0, [0, 0, rz], null, n);
        }
        return b.build({ height: 0.9, doorOpen: OPEN });
    }

    // ---------------------------------------------------------------- roster expansion: shared buildings
    // Wall: a post plus four half-tile arms (armE +X, armW -X, armN -Z, armS +Z) that reach the tile edge, so the
    // arms of two neighbouring walls meet. All arms start hidden (a lone post); SF_MODELS.setWallArms toggles them.
    const WALL_ARMS = { armE: 0, armN: Math.PI / 2, armW: Math.PI, armS: -Math.PI / 2 };
    function makeWall() {
        const b = new Builder();
        const heg = Builder.faction === 'hegemony';
        const post = b.node('post', b.root, 0, 0, 0);
        if (!heg) {
            // Vanguard: a chunky concrete pillar with a team band, a dark cap and an amber marker light
            b.add(hexa(0.62, 0.62, 0.56, 0.56, 0.08), 'hullDark', 0, 0, 0, null, null, post);
            b.add(hexa(0.52, 0.52, 0.46, 0.46, 0.5), 'concrete', 0, 0.08, 0, null, null, post);
            b.add(box(0.5, 0.06, 0.5), 'hullDark', 0, 0.38, 0, null, null, post);
            b.add(hexa(0.5, 0.5, 0.4, 0.4, 0.06), 'team', 0, 0.58, 0, null, null, post);
            b.add(box(0.1, 0.04, 0.1), 'warn', 0, 0.64, 0, null, null, post);
        } else {
            // Hegemony: a faceted octagonal pylon with a team band, a pointed cap and a glowing tip
            const O0 = ngon(8, 0.3, Math.PI / 8), O1 = ngon(8, 0.24, Math.PI / 8);
            b.add(loft(scalePts(O0, 1.08), O0, 0.08), 'hullDark', 0, 0, 0, null, null, post);
            b.add(loft(O0, O1, 0.5), 'hull', 0, 0.08, 0, null, null, post);
            b.add(loft(scalePts(O0, 0.92), scalePts(O1, 1.05), 0.1), 'team', 0, 0.32, 0, null, null, post);
            b.add(cone(0.24, 0.14, 4), 'team', 0, 0.58, 0, [0, Math.PI / 4, 0], null, post);
            b.add(prismGem(0.035, 0.08, 4), 'hglow', 0, 0.75, 0, null, null, post);
        }
        for (const [name, ry] of Object.entries(WALL_ARMS)) {
            // each arm runs along its node's +X from inside the post (x 0.18) to the tile edge (x 0.5)
            const n = b.node(name, b.root, 0, 0, 0, [0, ry, 0]);
            if (!heg) {
                b.add(box(0.32, 0.06, 0.44), 'hullDark', 0.34, 0, 0, null, null, n);
                b.add(hexa(0.32, 0.36, 0.32, 0.3, 0.42), 'concrete', 0.34, 0.06, 0, null, null, n);
                b.add(box(0.32, 0.04, 0.31), 'hullDark', 0.34, 0.34, 0, null, null, n);
                b.add(box(0.32, 0.04, 0.3), 'team', 0.34, 0.48, 0, null, null, n);
            } else {
                b.add(box(0.32, 0.06, 0.44), 'hullDark', 0.34, 0, 0, null, null, n);
                b.add(hexa(0.32, 0.36, 0.32, 0.12, 0.44), 'hull', 0.34, 0.06, 0, null, null, n);
                b.add(hexa(0.32, 0.25, 0.32, 0.17, 0.1), 'team', 0.34, 0.28, 0, null, null, n);
            }
        }
        const g = b.build({ height: 0.64 });
        for (const name of Object.keys(WALL_ARMS)) g.getObjectByName(name).visible = false;
        return g;
    }

    function makeRepairbay() {
        // A hazard-striped service pad with a turning crane: its 'arm' (mast, boom, trolley and a welding head)
        // rests pointing +X and turns about Y to face the vehicle being repaired.
        const b = new Builder();
        slab(b, 2, 2);
        b.add(box(1.8, 0.03, 1.8), 'pad', 0, 0.08, 0);
        // hazard border with dark chevrons, team corner brackets, corner lights
        for (const s of [1, -1]) {
            b.add(box(1.7, 0.012, 0.09), 'hazard', 0, 0.11, 0.83 * s);
            b.add(box(0.09, 0.012, 1.7), 'hazard', 0.83 * s, 0.11, 0);
            for (let i = -3; i <= 3; i++) {
                b.add(box(0.05, 0.014, 0.1), 'dark', i * 0.22, 0.111, 0.83 * s, [0, 0.6, 0]);
                b.add(box(0.1, 0.014, 0.05), 'dark', 0.83 * s, 0.111, i * 0.22, [0, 0.6, 0]);
            }
        }
        for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            b.add(box(0.4, 0.05, 0.1), 'team', 0.7 * x, 0.11, 0.86 * z);
            b.add(box(0.1, 0.05, 0.4), 'team', 0.86 * x, 0.11, 0.7 * z);
            b.add(cyl(0.035, 0.035, 0.06, 6), 'warn', 0.86 * x, 0.16, 0.86 * z);
        }
        // service gear: a control booth (south-west), a parts rack (north-west), drums (north-east)
        b.add(box(0.34, 0.28, 0.3), 'hull', -0.58, 0.11, 0.56);
        b.add(box(0.38, 0.04, 0.34), 'team', -0.58, 0.39, 0.56);
        b.add(box(0.24, 0.06, 0.02), 'glass', -0.58, 0.28, 0.715);
        b.add(box(0.5, 0.18, 0.16), 'hullDark', -0.45, 0.11, -0.62);
        for (const x of [-0.6, -0.42, -0.26]) b.add(box(0.12, 0.08, 0.12), 'hazard', x, 0.29, -0.62);
        for (const [x, z] of [[0.6, -0.6], [0.44, -0.66], [0.62, -0.42]]) {
            b.add(cyl(0.065, 0.065, 0.18, 7), 'teamDark', x, 0.11, z);
            b.add(cyl(0.067, 0.067, 0.02, 7), 'metal', x, 0.25, z);
        }
        // a painted team service ring around the turntable, then the turntable: a dark drum with a glowing team ring
        b.add(ringGeo(0.6, 0.05, 20, 3), 'team', 0, 0.105, 0, null, [1, 0.25, 1]);
        for (let i = 0; i < 4; i++) {
            const a = Math.PI / 4 + i * Math.PI / 2;
            b.add(hexa(0.12, 0.1, 0.0, 0.1, 0.012, 0.06, 0), 'hazard', Math.cos(a) * 0.43, 0.108, Math.sin(a) * 0.43, [0, Math.PI - a, Math.PI / 2 * 0], null);
        }
        b.add(cyl(0.3, 0.34, 0.07, 10), 'hullDark', 0, 0.11, 0);
        b.add(ringGeo(0.31, 0.018, 16, 3), 'teamGlow', 0, 0.18, 0);
        // the crane
        const arm = b.node('arm', null, 0, 0.18, 0);
        b.add(cyl(0.22, 0.24, 0.06, 8), 'team', 0, 0, 0, null, null, arm);
        b.add(box(0.2, 0.16, 0.2), 'hull', -0.1, 0.06, 0.12, null, null, arm);              // operator cab
        b.add(box(0.02, 0.07, 0.16), 'glass', 0.005, 0.13, 0.12, null, null, arm);
        b.add(box(0.12, 0.66, 0.12), 'hazard', 0, 0.06, 0, null, null, arm);              // mast
        for (const y of [0.2, 0.36, 0.52]) b.add(box(0.125, 0.03, 0.125), 'dark', 0, y, 0, null, null, arm);
        b.add(box(1.02, 0.07, 0.1), 'hazard', 0.31, 0.68, 0, null, null, arm);            // boom
        b.add(box(1.0, 0.012, 0.11), 'dark', 0.31, 0.75, 0, null, null, arm);
        strut(b, 'metal', [0, 0.72, 0], [0.04, 0.92, 0], 0.02, 4, arm);
        strut(b, 'metal', [0.04, 0.92, 0], [0.74, 0.75, 0], 0.01, 3, arm);
        strut(b, 'metal', [0.04, 0.92, 0], [-0.18, 0.75, 0], 0.01, 3, arm);
        b.add(box(0.18, 0.14, 0.16), 'hullDark', -0.17, 0.58, 0, null, null, arm);        // counterweight
        b.add(box(0.1, 0.06, 0.12), 'hullDark', 0.72, 0.62, 0, null, null, arm);          // trolley
        b.add(cyl(0.006, 0.006, 0.3, 3), 'metal', 0.72, 0.33, 0, null, null, arm);        // cable
        b.add(box(0.1, 0.07, 0.1), 'hullDark', 0.72, 0.26, 0, null, null, arm);           // welding head
        b.pair(box(0.02, 0.08, 0.02), 'metal', 0.72, 0.19, 0.035, null, null, arm);
        b.add(box(0.03, 0.03, 0.03), 'weld', 0.72, 0.18, 0, null, null, arm);
        b.add(box(0.03, 0.03, 0.03), 'warn', 0.84, 0.69, 0, null, null, arm);
        b.marker('muzzle', arm, 0.72, 0.18, 0);
        return b.build({ height: 0.95, craneArm: true });
    }

    // ---------------------------------------------------------------- roster expansion: Vanguard defences
    function makeSentry() {
        // Sentry Post: a raised gun platform on four splayed legs, a rotary machine gun behind a team shield.
        const b = new Builder();
        b.add(octo(0.9, 0.08), 'hullDark', 0, 0, 0);
        b.add(octo(0.7, 0.03), 'pad', 0, 0.08, 0);
        for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            strut(b, 'hullDark', [0.3 * x, 0.1, 0.3 * z], [0.2 * x, 0.42, 0.2 * z], 0.035, 4);
            b.add(box(0.1, 0.03, 0.1), 'dark', 0.3 * x, 0.1, 0.3 * z);
        }
        for (const s of [1, -1]) {
            strut(b, 'metal', [0.27 * s, 0.14, 0.27], [-0.22 * s, 0.38, 0.22], 0.008, 3);
            strut(b, 'metal', [0.27 * s, 0.14, -0.27], [-0.22 * s, 0.38, -0.22], 0.008, 3);
        }
        // platform, parapet plates, ladder on the south face
        b.add(box(0.56, 0.04, 0.56), 'hullDark', 0, 0.4, 0);
        b.add(box(0.6, 0.05, 0.6), 'team', 0, 0.44, 0);
        for (const s of [1, -1]) {
            b.add(box(0.6, 0.08, 0.04), 'concrete', 0, 0.49, 0.28 * s);
            b.add(box(0.04, 0.08, 0.52), 'concrete', 0.28 * s, 0.49, 0);
        }
        for (const x of [-0.06, 0.06]) b.add(box(0.015, 0.4, 0.015), 'metal', x, 0.08, 0.315);
        for (const y of [0.16, 0.26, 0.36]) b.add(box(0.12, 0.012, 0.015), 'metal', 0, y, 0.315);
        b.add(box(0.1, 0.012, 0.012), 'hazard', 0, 0.535, 0.3);
        // the gun
        const tur = b.node('turret', null, 0, 0.49, 0);
        b.add(cyl(0.11, 0.12, 0.06, 8), 'hullDark', 0, 0, 0, null, null, tur);
        b.add(box(0.2, 0.1, 0.12), 'hullDark', 0.0, 0.06, 0, null, null, tur);
        b.add(hexa(0.05, 0.32, 0.04, 0.24, 0.2), 'team', 0.12, 0.03, 0, [0, 0, 0.18], null, tur);
        b.add(box(0.012, 0.035, 0.08), 'glass', 0.115, 0.17, 0, [0, 0, 0.18], null, tur);
        b.add(cyl(0.05, 0.05, 0.06, 7), 'teamDark', -0.02, 0.06, -0.11, [Math.PI / 2, 0, 0], null, tur);   // ammo drum
        for (let i = 0; i < 3; i++) {
            const a = i / 3 * Math.PI * 2;
            b.add(rodX(0.013, 0.013, 0.26, 4), 'dark', 0.1, 0.11 + Math.cos(a) * 0.022, Math.sin(a) * 0.022, null, null, tur);
        }
        b.add(rodX(0.038, 0.038, 0.03, 6), 'hullDark', 0.13, 0.11, 0, null, null, tur);
        b.add(rodX(0.034, 0.034, 0.025, 6), 'hullDark', 0.33, 0.11, 0, null, null, tur);
        b.add(box(0.03, 0.025, 0.03), 'redLight', -0.08, 0.13, 0, null, null, tur);
        b.marker('muzzle', tur, 0.37, 0.11, 0);
        return b.build({ height: 0.72 });
    }

    function makeHowitzer() {
        // Howitzer: a revetted gun pit (team-capped concrete walls, open to the south for the ammo track) with a
        // heavy gun on a turntable, its long barrel elevated for indirect fire.
        const b = new Builder();
        slab(b, 2, 2);
        b.add(octo(1.7, 0.03), 'pad', 0, 0.08, 0);
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            if (Math.abs(a - Math.PI / 2) < 0.1) continue;        // the south gap
            const x = Math.cos(a) * 0.8, z = Math.sin(a) * 0.8, ry = Math.PI / 2 - a;
            b.add(hexa(0.62, 0.16, 0.6, 0.12, 0.22), 'concrete', x, 0.08, z, [0, ry, 0]);
            b.add(box(0.6, 0.05, 0.13), 'team', x, 0.3, z, [0, ry, 0]);
        }
        // ammo at the gap: crates and a shell rack
        b.add(box(0.2, 0.12, 0.14), 'hazard', -0.22, 0.11, 0.8);
        b.add(box(0.2, 0.012, 0.145), 'dark', -0.22, 0.2, 0.8);
        b.add(box(0.16, 0.1, 0.14), 'teamDark', 0.24, 0.11, 0.82);
        for (const x of [0.18, 0.24, 0.3]) b.add(cyl(0.022, 0.022, 0.08, 5), 'warn', x, 0.21, 0.82);
        // turntable and gun
        b.add(cyl(0.5, 0.54, 0.07, 12), 'hullDark', 0, 0.08, 0);
        b.add(cyl(0.44, 0.44, 0.02, 12), 'metal', 0, 0.15, 0);
        const tur = b.node('turret', null, 0, 0.17, 0);
        b.add(box(0.56, 0.12, 0.46), 'hullDark', -0.06, 0, 0, null, null, tur);
        b.pair(hexa(0.4, 0.06, 0.22, 0.06, 0.32, 0.04, 0), 'team', 0.02, 0.12, 0.17, null, null, tur);   // trunnion cheeks
        b.add(box(0.06, 0.2, 0.42), 'team', 0.22, 0.1, 0, [0, 0, -0.35], null, tur);            // crew shield
        b.add(box(0.2, 0.06, 0.3), 'metal', -0.28, 0.12, 0, null, null, tur);                    // loading tray
        b.add(box(0.04, 0.05, 0.12), 'redLight', -0.33, 0.18, -0.12, null, null, tur);
        const bar = b.node('barrel', tur, 0.04, 0.32, 0, [0, 0, 0.5]);
        b.add(rodX(0.085, 0.085, 0.26, 7), 'hullDark', -0.18, 0, 0, null, null, bar);           // breech
        b.pair(rodX(0.024, 0.024, 0.34, 5), 'metal', -0.05, 0.075, 0.045, null, null, bar);      // recoil cylinders
        b.add(rodX(0.046, 0.054, 0.66, 7), 'metal', 0.08, 0, 0, null, null, bar);
        b.add(rodX(0.058, 0.058, 0.03, 7), 'team', 0.4, 0, 0, null, null, bar);
        b.add(rodX(0.068, 0.068, 0.09, 7), 'hullDark', 0.74, 0, 0, null, null, bar);           // muzzle brake
        b.marker('muzzle', bar, 0.84, 0, 0);
        return b.build({ height: 0.85 });
    }

    // ---------------------------------------------------------------- roster expansion: Hegemony buildings
    function makeGravwell() {
        // Gravity Well: a slim pylon held by three team claws, with three floating violet rings that spin.
        const b = new Builder();
        b.add(octo(0.9, 0.08), 'hullDark', 0, 0, 0);
        b.add(loft(ngon(6, 0.4, Math.PI / 6), ngon(6, 0.3, Math.PI / 6), 0.14), 'hull', 0, 0.08, 0);
        b.add(cyl(0.28, 0.28, 0.03, 6), 'team', 0, 0.22, 0);
        b.add(cyl(0.12, 0.12, 0.03, 6), 'hglow', 0, 0.24, 0);
        for (let i = 0; i < 3; i++) {
            const a = Math.PI / 2 + i / 3 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
            strut(b, 'team', [c * 0.3, 0.22, s * 0.3], [c * 0.09, 0.7, s * 0.09], 0.05, 4, null, 0.025);
            b.add(box(0.03, 0.03, 0.03), 'hglow', c * 0.22, 0.4, s * 0.22, [0, -a, 0]);
        }
        const P = ngon(4, 0.08, Math.PI / 4);
        b.add(loft(P, scalePts(P, 0.5), 0.86), 'hullDark', 0, 0.24, 0);
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2;
            b.add(box(0.012, 0.6, 0.025), 'hglow', Math.cos(a) * 0.058, 0.3, Math.sin(a) * 0.058, [0, -a, 0.033]);
        }
        b.add(prismGem(0.06, 0.18, 4), 'violet', 0, 1.2, 0);
        // the rings: [height, radius, tube, tilt, spin speed]
        for (const [y, r, tube, tilt, sp] of [[0.42, 0.4, 0.024, 0.22, 1.5], [0.68, 0.32, 0.021, -0.26, -1.1], [0.92, 0.23, 0.018, 0.2, 2.0]]) {
            const ring = b.node('ring', null, 0, y, 0);
            ring.userData.restY = y; ring.userData.spin = sp; ring.userData.drop = 0.06;
            b.add(ringGeo(r, tube, 16, 3), 'violet', 0, 0, 0, [tilt, 0, 0], null, ring);
            for (let i = 0; i < 3; i++) {
                const a = i / 3 * Math.PI * 2 + y;
                b.add(box(0.05, 0.035, 0.035), 'hglow', Math.cos(a) * r, -Math.sin(a) * r * Math.sin(tilt), Math.sin(a) * r * Math.cos(tilt), [tilt, -a, 0], null, ring);
            }
        }
        return b.build({ height: 1.2 });
    }

    function makeSiphon() {
        // Shard Siphon: a faceted platform over a bore hole, four swept struts holding a spinning drill (a hub
        // with spokes you can see turn from above, a fluted shaft) and pipes to two glowing shard tanks.
        const b = new Builder();
        slab(b, 2, 2);
        const O0 = ngon(8, 0.92, Math.PI / 8), O1 = ngon(8, 0.84, Math.PI / 8), O2 = ngon(8, 0.74, Math.PI / 8);
        b.add(loft(O0, O1, 0.16), 'hull', 0, 0.08, 0);
        b.add(loft(O1, O2, 0.1), 'team', 0, 0.24, 0);
        b.add(loft(O2, scalePts(O2, 0.96), 0.02), 'hullDark', 0, 0.34, 0);
        // bore collar with a glowing shard ring
        b.add(cyl(0.22, 0.27, 0.1, 8), 'hullDark', 0, 0.36, 0);
        b.add(ringGeo(0.19, 0.022, 12, 3), 'shard', 0, 0.46, 0);
        b.add(cyl(0.16, 0.16, 0.01, 8), 'dark', 0, 0.455, 0);
        // the derrick: four swept struts to a top collar with a glowing crown
        for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            strut(b, 'teamDark', [0.58 * x, 0.36, 0.58 * z], [0.12 * x, 1.32, 0.12 * z], 0.05, 4, null, 0.03);
            b.add(hexa(0.14, 0.14, 0.1, 0.1, 0.06), 'hullDark', 0.58 * x, 0.34, 0.58 * z, [0, Math.PI / 4, 0]);
            b.add(box(0.03, 0.12, 0.03), 'hglow', 0.42 * x, 0.66, 0.42 * z, [0, -Math.atan2(z, x), -0.45]);
        }
        b.add(cyl(0.13, 0.16, 0.08, 8), 'hullDark', 0, 1.3, 0);
        b.add(cyl(0.09, 0.09, 0.02, 8), 'hglow', 0, 1.38, 0);
        b.add(prismGem(0.05, 0.14, 4), 'violet', 0, 1.5, 0);
        // shard tanks on the south side, piped to the collar
        for (const s of [1, -1]) {
            b.add(cyl(0.14, 0.14, 0.04, 8), 'hullDark', 0.5 * s, 0.34, 0.5);
            b.add(cyl(0.11, 0.11, 0.3, 8), 'shard', 0.5 * s, 0.38, 0.5);
            for (const y of [0.38, 0.52, 0.66]) b.add(cyl(0.125, 0.125, 0.03, 8), 'metal', 0.5 * s, y, 0.5);
            b.add(dome(0.125, 8, 2), 'hullDark', 0.5 * s, 0.69, 0.5);
            strut(b, 'metal', [0.5 * s, 0.6, 0.5], [0.16 * s, 0.42, 0.14], 0.025, 5);
        }
        // condenser block on the north side with violet vents and a fin
        b.add(box(0.5, 0.2, 0.26), 'hullDark', 0, 0.34, -0.56);
        for (const x of [-0.15, 0, 0.15]) b.add(box(0.08, 0.14, 0.012), 'violet', x, 0.37, -0.42);
        fin(b, 0, 0.54, -0.56, -Math.PI / 2, 0.24, 0.3);
        // the drill (spins about Y; rests at its node's y)
        const drill = b.node('drill', null, 0, 0.42, 0);
        drill.userData.restY = 0.42; drill.userData.spin = 4.5;
        b.add(cyl(0.045, 0.05, 0.86, 6), 'metal', 0, -0.06, 0, null, null, drill);
        for (let i = 0; i < 7; i++) {
            const a = i * 0.95, y = 0.04 + i * 0.07;
            b.add(box(0.05, 0.025, 0.15), 'hullDark', Math.cos(a) * 0.05, y, Math.sin(a) * 0.05, [0, -a, 0.35], null, drill);
        }
        b.add(cyl(0.25, 0.25, 0.06, 8), 'team', 0, 0.55, 0, null, null, drill);
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2;
            b.add(box(0.36, 0.04, 0.06), 'hullDark', Math.cos(a) * 0.15, 0.61, Math.sin(a) * 0.15, [0, -a, 0], null, drill);
            b.add(box(0.06, 0.05, 0.06), i ? 'hglow' : 'shard', Math.cos(a) * 0.33, 0.6, Math.sin(a) * 0.33, [0, -a, 0], null, drill);
        }
        b.add(cyl(0.06, 0.06, 0.1, 6), 'hullDark', 0, 0.62, 0, null, null, drill);
        return b.build({ height: 1.4 });
    }

    // Hegemony trim for the shared buildings (added on top of the re-coloured model).
    const HEG_TRIM = {
        core: (b) => { cornerFin(b, -1.2, -1.2, 0.15, 0.95, 0.5); cornerFin(b, 1.22, -1.22, 0.15, 0.95, 0.5); floatGem(b, 0.32, 0.96, 0.18, 1.2); },
        reactor: (b) => { cornerFin(b, 0.84, -0.84, 0.08, 0.6, 0.3); cornerFin(b, 0.84, 0.84, 0.08, 0.6, 0.3); },
        refinery: (b) => { cornerFin(b, -1.28, -1.28, 0.08, 0.8, 0.4); cornerFin(b, 1.3, 0.32, 0.08, 0.7, 0.34); floatGem(b, -0.2, 0.78, -0.4, 1); },
        barracks: (b) => { cornerFin(b, -0.8, -0.82, 0.08, 0.75, 0.34); cornerFin(b, 0.8, -0.82, 0.08, 0.75, 0.34); },
        factory: (b) => {
            fin(b, 0, 1.2, -0.62, -Math.PI / 2, 0.32, 0.5); fin(b, 0, 1.2, 0.3, -Math.PI / 2, 0.26, 0.42);
            cornerFin(b, -1.28, -1.3, 0.08, 0.8, 0.4); cornerFin(b, 1.28, -1.3, 0.08, 0.8, 0.4);
        },
        radar: (b) => { cornerFin(b, 0.8, 0.8, 0.08, 0.6, 0.32); cornerFin(b, -0.82, -0.82, 0.08, 0.6, 0.32); },
        techlab: (b) => { fin(b, 0.7, 0.59, -0.7, Math.PI / 2, 0.42, 0.34); fin(b, 0.7, 0.59, 0.7, Math.PI / 2, 0.42, 0.34); floatGem(b, -0.42, 0.7, -0.35, 0.9); },
        repairbay: (b) => { cornerFin(b, 0.84, 0.84, 0.11, 0.5, 0.28); cornerFin(b, -0.84, -0.84, 0.11, 0.5, 0.28); floatGem(b, 0.62, 0.36, -0.62, 0.7); },
        // the wall's Hegemony look is built into makeWall (a trim would end up on the post, not the arms)
    };

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
        unit: { rifleman: makeRifleman, rocketeer: makeRocketeer, harvester: makeHarvester, buggy: makeBuggy, tank: makeTank, artillery: makeArtillery,
            trooper: makeTrooper, shocktrooper: makeShocktrooper, skimmer: makeSkimmer, lancer: makeLancer, phantom: makePhantom,
            sniper: makeSniper, medic: makeMedic, engineer: makeEngineer, scout: makeScout, salvo: makeSalvo, bulwark: makeBulwark,
            disruptor: makeDisruptor, acolyte: makeAcolyte, stalker: makeStalker, wisp: makeWisp, arcwalker: makeArcwalker, obliterator: makeObliterator },
        building: { core: makeCore, reactor: makeReactor, refinery: makeRefinery, barracks: makeBarracks, factory: makeFactory,
            radar: makeRadar, turret: makeTurret, techlab: makeTechlab, spire: makePulseSpire, uplink: makeUplink, riftsilo: makeRiftsilo,
            wall: makeWall, repairbay: makeRepairbay, sentry: makeSentry, howitzer: makeHowitzer, gravwell: makeGravwell, siphon: makeSiphon },
        decor: { rock: makeRock, boulder: makeBoulder, crystal: makeCrystal, tree: makeTree },
        misc: { shardCluster: makeShardCluster, spire: makeSpire },
    };
    const templates = new Map();   // kind:type:team:faction → built template (geometry has the team colour baked in)
    const FACTIONS = ['vanguard', 'hegemony'];
    const OWN_FACTION = { trooper: 'hegemony', shocktrooper: 'hegemony', skimmer: 'hegemony', lancer: 'hegemony', phantom: 'hegemony',
        spire: 'hegemony', riftsilo: 'hegemony',
        sniper: 'vanguard', medic: 'vanguard', engineer: 'vanguard', scout: 'vanguard', salvo: 'vanguard', bulwark: 'vanguard', sentry: 'vanguard', howitzer: 'vanguard',
        disruptor: 'hegemony', acolyte: 'hegemony', stalker: 'hegemony', wisp: 'hegemony', arcwalker: 'hegemony', obliterator: 'hegemony',
        gravwell: 'hegemony', siphon: 'hegemony' };
    // The faction look for a model: the one asked for, else the type's own (config `faction`), else Vanguard.
    function factionFor(kind, type, f) {
        if (FACTIONS.includes(f)) return f;
        const def = kind === 'unit' ? CFG.UNITS[type] : kind === 'building' ? CFG.BUILDINGS[type] : null;
        return (def && def.faction) || OWN_FACTION[type] || 'vanguard';
    }

    function fallback(kind, type) {
        console.warn('SF_MODELS: no model for', kind, type);
        const b = new Builder();
        b.add(box(0.5, 0.5, 0.5), 'team', 0, 0, 0);
        return b.build({ height: 0.5 });
    }
    function template(kind, type, team, faction = 'vanguard') {
        const key = `${kind}:${type}:${team}:${faction}`;
        let t = templates.get(key);
        if (t) return t;
        const make = MAKERS[kind] && MAKERS[kind][type];
        Builder.team = team;
        Builder.faction = faction;
        Builder.trim = kind === 'building' && faction === 'hegemony' ? HEG_TRIM[type] || null : null;
        try { t = make ? make() : fallback(kind, type); } finally { Builder.faction = 'vanguard'; Builder.trim = null; }
        t.userData.kind = kind;
        t.userData.faction = faction;
        t.userData.type = type;
        t.userData.team = team;
        if (kind === 'unit' && CFG.UNITS[type]) t.userData.radius = CFG.UNITS[type].radius;
        if (kind === 'building' && CFG.BUILDINGS[type]) { t.userData.w = CFG.BUILDINGS[type].w; t.userData.d = CFG.BUILDINGS[type].d; }
        delete t.userData.wheels;     // rebuilt per instance (clone() JSON-copies userData)
        templates.set(key, t);
        return t;
    }
    // A glow material of its own (same shader program), for parts the renderer drives per entity ('charge').
    function ownGlowMaterial() {
        const m = MATERIALS.glow.clone();
        m.name = 'sf-glow-own';
        m.onBeforeCompile = MATERIALS.glow.onBeforeCompile;
        m.customProgramCacheKey = MATERIALS.glow.customProgramCacheKey;
        return m;
    }
    function instance(kind, type, team, faction) {
        const g = template(kind, type, team, faction).clone(true);
        const wheels = [];
        g.traverse((o) => {
            if (o.name === 'wheel') wheels.push(o);
            if (o.name === 'charge') o.traverse((m) => { if (m.isMesh) { m.material = ownGlowMaterial(); m.userData.ownMaterial = true; } });
        });
        g.userData.wheels = wheels;
        return g;
    }
    // Translucent twins of the two shared materials (a cloaked unit as its owner sees it). Shared and cached:
    // swap mesh.material = SF_MODELS.ghostMaterial(mesh.material) while cloaked, and back when it decloaks.
    const ghosts = new Map();
    function ghostMaterial(mat) {
        if (!mat) return mat;
        if (mat.userData && mat.userData.ghost) return mat;
        let g = ghosts.get(mat);
        if (!g) {
            g = mat.clone();
            g.name = (mat.name || 'sf') + '-ghost';
            g.onBeforeCompile = mat.onBeforeCompile;
            if (mat.customProgramCacheKey !== T.Material.prototype.customProgramCacheKey) g.customProgramCacheKey = mat.customProgramCacheKey;
            g.transparent = true;
            g.opacity = 0.38;
            g.depthWrite = false;
            g.userData = { ghost: true };
            ghosts.set(mat, g);
        }
        return g;
    }
    // Pose helpers for the animated parts (the raw conventions are in the header).
    function setDoors(obj, k) {
        const open = (obj.userData.doorOpen || 1.9) * Math.max(0, Math.min(1, k));
        const l = obj.getObjectByName('doorL'), r = obj.getObjectByName('doorR');
        if (l) l.rotation.z = open;
        if (r) r.rotation.z = -open;
    }
    function setCharge(obj, k, time = 0) {
        const c = obj.getObjectByName('charge');
        if (!c) return;
        k = Math.max(0, Math.min(1, k));
        // dim while empty, brighter as it fills, a quick throb once ready
        const v = k >= 1 ? 2.2 + Math.sin(time * 6) * 0.6 : 0.25 + k * 1.4 + Math.sin(time * (2 + k * 4)) * 0.12 * k;
        c.traverse((m) => { if (m.isMesh && m.userData.ownMaterial) m.material.emissiveIntensity = v; });
        c.scale.setScalar(0.85 + 0.25 * k);
    }
    // Roster expansion helpers.
    // Wall connectors: show the arm towards each neighbouring wall (n = -Z, s = +Z, e = +X, w = -X).
    function setWallArms(obj, arms = {}) {
        for (const [k, name] of [['n', 'armN'], ['s', 'armS'], ['e', 'armE'], ['w', 'armW']]) {
            const a = obj.getObjectByName(name);
            if (a) a.visible = !!arms[k];
        }
        return obj;
    }
    // Turns a repair bay's crane arm to face a point at (dx, dz) from the building centre (world axes; buildings
    // are never rotated). k (0..1) eases towards it per call, 1 = snap.
    function aimArm(obj, dx, dz, k = 1) {
        const a = obj.getObjectByName('arm');
        if (!a || !obj.userData.craneArm) return obj;
        const want = -Math.atan2(dz, dx);
        let d = want - a.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        a.rotation.y += d * Math.max(0, Math.min(1, k));
        return obj;
    }
    // Idle animation by absolute time t (seconds), cheap enough to call every frame for every model:
    //   'ring'  nodes (gravity well, wisp, arc walker coil, shard spire) spin about Y and bob around userData.restY;
    //   'drill' (shard siphon) spins and pumps a little;
    //   'arm'   of a repair bay (userData.craneArm) sways slowly while idle.
    // opts.powered = false stops the rings and drill (the well's rings sink a little); opts.arm = false leaves the
    // crane to the caller (aimArm while repairing). Models without these nodes are left untouched.
    function spin(obj, t, opts = {}) {
        let list = obj.userData.spinners;
        if (!list) {
            list = [];
            obj.traverse((o) => { if (o.name === 'ring' || o.name === 'drill' || (o.name === 'arm' && obj.userData.craneArm)) list.push(o); });
            Object.defineProperty(obj.userData, 'spinners', { value: list, enumerable: false, configurable: true, writable: true });
        }
        const on = opts.powered !== false;
        let k = 0;
        for (const n of list) {
            const ud = n.userData;
            if (ud.restY == null) ud.restY = n.position.y;
            if (n.name === 'ring') {
                if (on) {
                    n.rotation.y = t * (ud.spin || (k % 2 ? -1.4 : 1.8));
                    n.position.y = ud.restY + Math.sin(t * 1.7 + k * 2.1) * (ud.bob != null ? ud.bob : 0.025);
                } else n.position.y = ud.restY - (ud.drop || 0);
                k++;
            } else if (n.name === 'drill') {
                if (on) {
                    n.rotation.y = t * (ud.spin || 4);
                    n.position.y = ud.restY + Math.sin(t * 2.3) * 0.03;
                }
            } else if (opts.arm !== false) {
                n.rotation.y = Math.sin(t * 0.35) * 0.8 + Math.sin(t * 0.93) * 0.15;
            }
        }
        return obj;
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
        unit: (type, teamColor, faction) => instance('unit', type, teamOf(teamColor), factionFor('unit', type, faction)),
        building: (type, teamColor, faction) => instance('building', type, teamOf(teamColor), factionFor('building', type, faction)),
        decor: (type) => instance('decor', type, 0x888888),
        shardCluster: () => instance('misc', 'shardCluster', 0x888888),
        spire: () => instance('misc', 'spire', 0x888888),
        // extras for the renderer / UI / preview
        types: { unit: Object.keys(MAKERS.unit), building: Object.keys(MAKERS.building), decor: Object.keys(MAKERS.decor), factions: FACTIONS.slice() },
        colors: { shard: PAL.shard, energy: PAL.energy, tech: PAL.tech, warn: PAL.warn, rock: PAL.rock, ground: PAL.ground,
            hegemonyGlow: PAL.hegemonyGlow, violet: PAL.violet },
        factionOf: (kind, type) => factionFor(kind, type),   // the default look of a type ('vanguard' | 'hegemony')
        setDoors,       // setDoors(riftsiloObj, open01)
        setCharge,      // setCharge(uplinkObj, charge01, timeSeconds)
        setWallArms,    // setWallArms(wallObj, { n, s, e, w }) → shows the arm towards each neighbouring wall
        aimArm,         // aimArm(repairbayObj, dx, dz, ease01) → turns the crane arm towards a vehicle
        spin,           // spin(obj, timeSeconds, { powered, arm }) → rings, drill and crane idle
        ghostMaterial,  // ghostMaterial(material) → its shared translucent twin (cloak)
        materials: MATERIALS,   // { body, glow }: shared by every model; clone before changing one per entity
        triangles,      // triangles(object3d) → triangle count
    };
})();
