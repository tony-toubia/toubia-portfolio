// Procedural 3D LEGO Brick Geometry & Material Builder for Three.js
//
// Every part becomes ONE mesh: the body and its studs are merged into a single
// geometry that is cached per part, so a 300-piece model is 300 draw calls,
// not 2,000. Geometry is centred on the part's footprint with its base at y=0:
// X runs along the catalog `width`, Z along `length`, Y up along `height`.
//
// Orientation conventions for the special parts (modules rotate with `rotY`):
// - Wheels and tyres: the axle runs along X; `width` is the thickness, `diameter` the
//   size in Z/Y. A train wheel's flange is on its -X side.
// - Axle plate 4600: pin stubs out of its ±X faces; 2926: out of its ±Z ends. Both at
//   the plate's mid-height (y = 0.2), which is where a wheel's hub should sit.
// - Technic pin: lies along X (through a Technic brick's holes, which pierce the X faces).
// - Bars: vertical when the part is taller than it is long, else along the longer axis.
// - Hinges: the base's knuckle is at its +Z end, a top plate's finger at its -Z end, so a
//   top placed in the next cells along +Z (one brick up for 3937/3938) meets the base.
//   Swivel plates 2429/2430: base = plate at -Z + lower tongue at +Z; top = upper tongue
//   at -Z + plate at +Z; the pivots coincide when the top sits 2 studs along +Z of the base.
// - Clips all grip a bar running along X: 4085's C-clip is on its +Z side, 2555's prongs
//   on top, 63868's jaws and 60478's bar at the +Z end, 48729's claw at +Z. The flag's
//   clip rings are on its -Z edge (a vertical bar); the propeller's three blades lie flat, one along +Z.
// - Brackets (keyed on `isBracket`, not ids): the vertical face hangs off the +X long edge and
//   its studs point +X. The `down` face spans y -0.6..0.4 (44728: -1.6..0.4), the `up` face 0..0.98.
// - Side studs: 87087 and the headlight 4070 on the -Z face; 11211 on the -X (long) face.
// - Wedge plates: `right` keeps the -X edge straight (the slant runs from +X at -Z to the
//   middle at +Z); `left` is the mirror. Quarter-round tile and round-corner brick keep
//   their square corner at (-X, -Z). Slopes and arches run along Z, high end at -Z.
// - The door is rendered 12° ajar, swung toward -X around its -Z (hinge) edge.
//
// Materials are MeshPhysicalMaterial, one per colour (and per finish: a tyre is rubber, not ABS),
// cached in `materialsCache` so other modules can clone, tint and restore them. Colour hexes are
// sRGB, so they are converted to linear for the renderer's sRGB output. `quality` is 'high' or
// 'lite' (phones): lite drops the clearcoat and the glass transmission and uses coarser studs.
class BrickBuilder {
    constructor(options = {}) {
        this.materialsCache = new Map();
        this.geometryCache = new Map();
        this.studRadius = 0.28;
        this.studHeight = 0.18;
        this.gap = 0.04;       // visible seam between neighbouring parts
        this.chamfer = 0.03;   // the tiny edge bevel of a moulded part
        this.quality = options.quality || 'high';
    }

    /** The cache key of a colour + finish; plain plastic keeps the bare colour key (other modules rely on it). */
    materialKey(colorKey, finish = 'plastic') { return finish === 'plastic' ? colorKey : `${colorKey}:${finish}`; }

    /**
     * A material per colour and finish: ABS = low roughness under a clearcoat, trans colours =
     * tinted glass (transmission keeps the specular while the body goes see-through), rubber for
     * tyres, a metallic lobe for pearl gold. `material.color`/`emissive` stay plain properties.
     */
    getMaterial(colorKey, finish = 'plastic') {
        const key = this.materialKey(colorKey, finish);
        if (this.materialsCache.has(key)) return this.materialsCache.get(key);
        const colorDef = window.LEGO_COLORS[colorKey] || window.LEGO_COLORS.RED;
        const lite = this.quality === 'lite';
        const isTrans = colorDef.category === 'Transparent';
        const isMetallic = colorDef.category === 'Metallic';
        const color = new THREE.Color(colorDef.hex).convertSRGBToLinear();
        const hint = colorDef.finish || {};
        let params;
        if (finish === 'rubber') {
            // A tyre: matte, a touch darker than the plastic of the same colour, barely any reflection.
            params = { color: color.multiplyScalar(0.72), roughness: 0.92, metalness: 0, clearcoat: 0, envMapIntensity: 0.35 };
        } else if (isTrans) {
            // Coloured glass: the body is mostly transmitted, the surface keeps a sharp specular.
            const t = hint.transmission != null ? hint.transmission : (colorKey === 'TRANS_CLEAR' ? 0.92 : 0.68);
            params = lite
                ? { color, roughness: 0.1, metalness: 0, transparent: true, opacity: colorDef.opacity || 0.65, depthWrite: false, envMapIntensity: 1.3 }
                : { color, roughness: 0.08, metalness: 0, transmission: t, ior: 1.5, clearcoat: 0.4, clearcoatRoughness: 0.08, transparent: true, opacity: 1, depthWrite: false, envMapIntensity: 1.3 };
        } else if (isMetallic) {
            params = { color, roughness: hint.roughness != null ? hint.roughness : 0.35, metalness: hint.metalness != null ? hint.metalness : 0.6, clearcoat: lite ? 0 : 0.25, clearcoatRoughness: 0.2, envMapIntensity: 1.25 };
        } else {
            // Injection-moulded ABS: a smooth body under a glossy clearcoat; dark colours read glossier.
            const lum = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
            const rough = hint.roughness != null ? hint.roughness : (lum < 0.05 ? 0.26 : 0.32);
            params = { color, roughness: rough, metalness: 0, clearcoat: lite ? 0 : 0.55, clearcoatRoughness: 0.2, envMapIntensity: 0.9 };
        }
        const mat = new THREE.MeshPhysicalMaterial(params);
        mat.userData.colorKey = colorKey;
        mat.userData.finish = finish;
        mat.userData.transmission = mat.transmission;     // so a night-time glow can dial the glass back
        mat.userData.envBase = mat.envMapIntensity;       // so lighting moods can scale the environment
        this.materialsCache.set(key, mat);
        return mat;
    }

    /** One mesh per part. `options.layer` is the build step; `options.position` its home position. */
    createBrickMesh(partId, colorKey, options = {}) {
        if (BrickBuilder.isBaked(partId, options.baked)) return this.createBakedMesh(partId, colorKey, options);
        const part = window.LEGO_PARTS[partId] || window.LEGO_PARTS['3001'];
        const lying = !!(options.rotX || options.rotZ);
        const colorDef = window.LEGO_COLORS[colorKey];
        const isTrans = !!(colorDef && colorDef.category === 'Transparent');
        const mesh = new THREE.Mesh(this.getGeometry(part, lying), this.getMaterial(colorKey, part.isTire ? 'rubber' : 'plastic'));
        mesh.castShadow = !isTrans;   // glass throws a faint shadow at most; a solid one looks wrong
        mesh.receiveShadow = true;
        mesh.userData = {
            partId: part.id, partName: part.name, colorKey,
            width: part.width, length: part.length, height: part.height,
            layer: options.layer || 0,
            originalPosition: options.position ? options.position.clone() : new THREE.Vector3()
        };
        return mesh;
    }

    /** Merged body + studs, cached per part. `centered` puts the pivot at the body's centre, for parts lying on their side. */
    getGeometry(part, centered) {
        const key = part.id + (centered ? ':c' : '');
        if (this.geometryCache.has(key)) return this.geometryCache.get(key);
        const pieces = [this.bodyGeometry(part)];
        if (part.hasStuds && !part.isTile) pieces.push(...this.studGeometries(part));
        const geom = this.merge(pieces);
        if (centered) geom.translate(0, -part.height / 2, 0);
        geom.computeBoundingSphere();
        this.geometryCache.set(key, geom);
        return geom;
    }

    /* ── primitive helpers ───────────────────────────────────── */

    /** An axis-aligned box from its min/max corners. */
    box(x0, x1, y0, y1, z0, z1) {
        const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
        g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        return g;
    }

    /** A cylinder of radius `r` and length `len` whose axis runs along `axis` ('x', 'y' or 'z'), centred at (cx, cy, cz). */
    cyl(r, len, axis, cx, cy, cz, seg = 16, rTop = r) {
        const g = new THREE.CylinderGeometry(rTop, r, len, seg);
        if (axis === 'x') g.rotateZ(-Math.PI / 2);       // +Y (rTop end) -> +X
        else if (axis === 'z') g.rotateX(Math.PI / 2);   // +Y -> +Z
        g.translate(cx, cy, cz);
        return g;
    }

    /** A profile drawn in the Z–Y plane (shape x = z, shape y = y) extruded along X by `depth`, centred on X. */
    extrudeZY(shape, depth, curveSegments = 12) {
        const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments });
        g.rotateY(-Math.PI / 2);           // shape x -> world z, extrusion -> -X
        g.translate(depth / 2, 0, 0);
        return g;
    }

    /** A footprint drawn in the X–Z plane (shape x = x, shape y = z) extruded up from y=0 by `height`. */
    extrudeXZ(shape, height, curveSegments = 12) {
        const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments });
        g.rotateX(Math.PI / 2);            // shape y -> world z, extrusion -> -Y
        g.translate(0, height, 0);
        return g;
    }

    /**
     * A surface of revolution from a closed [radius, axial] polygon (listed counter-clockwise in the
     * r–t plane: along the bottom outward, up the outside, back along the top, down the bore), flat
     * shaded so the profile's corners stay crisp. `axis` 'y' (default) or 'x'.
     */
    lathe(profile, seg, axis = 'y') {
        const pts = profile.map(([r, t]) => new THREE.Vector2(Math.max(r, 0.01), t));
        pts.push(pts[0].clone());
        const g = new THREE.LatheGeometry(pts, seg).toNonIndexed();
        g.computeVertexNormals();
        if (axis === 'x') g.rotateZ(-Math.PI / 2);
        return g;
    }

    /** A C-clip (two jaws, open toward +Z) drawn in the Z–Y plane and extruded `wide` along X. */
    clipC(z0, z1, y0, y1, wide, wall = 0.1, jaw = 0.08) {
        const s = new THREE.Shape();
        s.moveTo(z0, y0); s.lineTo(z1, y0); s.lineTo(z1, y0 + jaw); s.lineTo(z1 - 0.05, y0 + jaw + 0.03);
        s.lineTo(z0 + wall, y0 + jaw + 0.03); s.lineTo(z0 + wall, y1 - jaw - 0.03); s.lineTo(z1 - 0.05, y1 - jaw - 0.03);
        s.lineTo(z1, y1 - jaw); s.lineTo(z1, y1); s.lineTo(z0, y1); s.closePath();
        return this.extrudeZY(s, wide, 4);
    }

    /** A plain stud-shaped peg pointing along `axis` from (x, y, z) outward (its base is at that point). */
    peg(axis, x, y, z, r = this.studRadius, len = this.studHeight) {
        const d = { x: [len / 2, 0, 0], y: [0, len / 2, 0], z: [0, 0, len / 2] }[axis.replace('-', '')];
        const sgn = axis.startsWith('-') ? -1 : 1;
        return this.cyl(r, len, axis.replace('-', ''), x + sgn * d[0], y + sgn * d[1], z + sgn * d[2], 14);
    }

    /* ── bodies ───────────────────────────────────────────────── */

    bodyGeometry(part) {
        const gap = this.gap, h = part.height, w = part.width, l = part.length;
        if (part.isAntenna) {
            const base = this.box(-0.5 + gap / 2, 0.5 - gap / 2, 0, 0.4, -0.5 + gap / 2, 0.5 - gap / 2);
            const shaft = new THREE.CylinderGeometry(0.1, 0.13, h - 0.4, 10); shaft.translate(0, 0.4 + (h - 0.4) / 2, 0);
            const tip = new THREE.CylinderGeometry(0.16, 0.16, 0.15, 10); tip.translate(0, h - 0.07, 0);
            return this.merge([base, shaft, tip]);
        }
        if (part.isDome) {
            const r = w * 0.5 * 0.96;
            const stem = new THREE.CylinderGeometry(r, r, 0.5, 28); stem.translate(0, 0.25, 0);
            const dome = new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
            dome.scale(1, (h - 0.5) / r, 1); dome.translate(0, 0.5, 0);
            return this.merge([stem, dome]);
        }
        if (part.isCone) {
            const rb = w * 0.5 * 0.96, rt = w === 1 ? 0.2 : 0.42;
            const g = new THREE.CylinderGeometry(rt, rb, h, 28); g.translate(0, h / 2, 0);
            return g;
        }
        if (part.isWheel) return this.wheelGeometry(part);
        if (part.isTire) return this.tireGeometry(part);
        if (part.isAxlePlate) return this.axlePlateGeometry(part);
        if (part.isBar) return this.barGeometry(part);
        if (part.isPin) return this.pinGeometry(part);
        if (part.pinHoles) return this.technicBrickGeometry(part);
        if (part.isHinge) return this.hingeGeometry(part);
        if (part.isTurntable) return this.turntableGeometry(part);
        if (part.isClip) return this.clipGeometry(part);
        if (part.isBarHandle) return this.barHandleGeometry(part);
        if (part.isFlag) return this.flagGeometry(part);
        if (part.isPropeller) return this.propellerGeometry(part);
        if (part.isBracket) return this.bracketGeometry(part);
        if (part.sideStuds || part.isHeadlight) return this.sideStudBrickGeometry(part);
        if (part.isArch) return this.archGeometry(part);
        if (part.isWindow || part.isDoorFrame) return this.frameGeometry(part);
        if (part.isGlass) return this.glassGeometry(part);
        if (part.isDoor) return this.doorGeometry(part);
        if (part.isFence) return this.fenceGeometry(part);
        if (part.isWedge) return this.wedgeGeometry(part);
        if (part.curved) return this.curvedSlopeGeometry(part);
        if (part.isInvertedSlope) return this.invertedSlopeGeometry(part);
        if (part.quarterRound) return this.quarterRoundGeometry(part);
        if (part.isRoundCorner) return this.roundCornerGeometry(part);
        if (part.isDish) return this.dishGeometry(part);
        if (part.grille) return this.grilleGeometry(part);
        if (part.isRound) {
            const r = w * 0.5 * 0.96;
            const g = new THREE.CylinderGeometry(r, r, h, w === 1 ? 20 : 28); g.translate(0, h / 2, 0);
            return g;
        }
        if (part.isSlope) return this.slopeGeometry(w - gap, l - gap, h, part.flat, part.lip);
        return this.plateBody(part);
    }

    /** The plain box every brick, plate and tile starts from, with the moulded edge bevel. */
    plateBody(part, y0 = 0, y1 = part.height) {
        const g = this.gap / 2;
        return this.chamferBox(-part.width / 2 + g, part.width / 2 - g, y0, y1, -part.length / 2 + g, part.length / 2 - g);
    }

    /**
     * A box with every edge chamfered by `c` (26 flat faces, 44 triangles): the bevel catches the
     * key light along each edge, which is what makes a moulded part read as plastic instead of a cube.
     */
    chamferBox(x0, x1, y0, y1, z0, z1, c = this.chamfer) {
        c = Math.min(c, (x1 - x0) / 3, (y1 - y0) / 3, (z1 - z0) / 3);
        const pos = [], nrm = [];
        // Each corner (sx, sy, sz) has three vertices, one pulled inward along each axis.
        const C = {};
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
            const x = sx > 0 ? x1 : x0, y = sy > 0 ? y1 : y0, z = sz > 0 ? z1 : z0;
            C[`${sx},${sy},${sz}`] = { x: [x - sx * c, y, z], y: [x, y - sy * c, z], z: [x, y, z - sz * c] };
        }
        const k = (sx, sy, sz) => C[`${sx},${sy},${sz}`];
        const poly = (pts, n) => {   // a convex polygon as a fan, wound so it faces along n
            const len = Math.hypot(...n), nn = n.map((v) => v / len);
            const a = pts[0], b = pts[1], d = pts[2];
            const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ad = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
            const cross = [ab[1] * ad[2] - ab[2] * ad[1], ab[2] * ad[0] - ab[0] * ad[2], ab[0] * ad[1] - ab[1] * ad[0]];
            if (cross[0] * nn[0] + cross[1] * nn[1] + cross[2] * nn[2] < 0) pts = pts.slice().reverse();
            for (let i = 1; i < pts.length - 1; i++) { pos.push(...pts[0], ...pts[i], ...pts[i + 1]); nrm.push(...nn, ...nn, ...nn); }
        };
        // The six faces.
        for (const s of [-1, 1]) {
            poly([k(s, -1, -1).x, k(s, 1, -1).x, k(s, 1, 1).x, k(s, -1, 1).x], [s, 0, 0]);
            poly([k(-1, s, -1).y, k(1, s, -1).y, k(1, s, 1).y, k(-1, s, 1).y], [0, s, 0]);
            poly([k(-1, -1, s).z, k(1, -1, s).z, k(1, 1, s).z, k(-1, 1, s).z], [0, 0, s]);
        }
        // The twelve edge bevels: four along each axis.
        for (const a of [-1, 1]) for (const b of [-1, 1]) {
            poly([k(-1, a, b).y, k(-1, a, b).z, k(1, a, b).z, k(1, a, b).y], [0, a, b]);     // along X
            poly([k(a, -1, b).x, k(a, -1, b).z, k(a, 1, b).z, k(a, 1, b).x], [a, 0, b]);     // along Y
            poly([k(a, b, -1).x, k(a, b, -1).y, k(a, b, 1).y, k(a, b, 1).x], [a, b, 0]);     // along Z
        }
        // The eight corner facets.
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const v = k(sx, sy, sz); poly([v.x, v.y, v.z], [sx, sy, sz]); }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geom.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        return geom;
    }

    /* ── wheels, axles & Technic ─────────────────────────────── */

    /** A wheel standing on edge, axle along X: a rim ring, a recessed dished face and a protruding hub boss. */
    wheelGeometry(part) {
        const R = (part.diameter || part.height) / 2, t = (part.width - this.gap) / 2, hub = R * 0.38, bore = Math.min(0.12, R * 0.15);
        let profile;
        if (part.id === '55423' || /train/i.test(part.name)) {
            // Train wheel: a flange (full radius) on the -X side, a narrower tread, a hub boss.
            const tread = R * 0.85;
            profile = [[bore, -t - 0.05], [hub, -t - 0.05], [hub, -t], [R, -t], [R, -t + 0.15], [tread, -t + 0.15], [tread, t], [hub, t], [hub, t + 0.05], [bore, t + 0.05]];
        } else {
            const rim = R * 0.82, inset = Math.min(0.08, t * 0.4);
            profile = [[bore, -t - 0.06], [hub, -t - 0.06], [hub, -t + inset], [rim, -t + inset], [rim, -t], [R, -t], [R, t], [rim, t], [rim, t - inset], [hub, t - inset], [hub, t + 0.06], [bore, t + 0.06]];
        }
        const g = this.lathe(profile, R > 1 ? 24 : 20, 'x');
        g.translate(0, part.height / 2, 0);
        return g;
    }

    /** A tyre: a ring around the matching wheel (`rim` = that wheel's diameter, `thick` = its width along X, else a little wider than the part), with a tread groove. */
    tireGeometry(part) {
        const R = (part.diameter || part.height) / 2, r = ((part.rim || part.diameter * 0.6) / 2) * 0.9, t = (part.thick || part.width + 0.2) / 2;
        const shoulder = R * 0.88, groove = R * 0.96, gw = Math.min(0.08, t * 0.2);
        const profile = [[r, -t], [shoulder, -t], [R, -t * 0.55], [R, -gw], [groove, -gw], [groove, gw], [R, gw], [R, t * 0.55], [shoulder, t], [r, t]];
        const g = this.lathe(profile, R > 2 ? 28 : 24, 'x');
        g.translate(0, part.height / 2, 0);
        return g;
    }

    /** A plate with a pin stub at mid-height out of each wheel face: ±X for 4600, ±Z for 2926. */
    axlePlateGeometry(part) {
        const pieces = [this.plateBody(part)], y = 0.2, stub = 0.3;
        const alongZ = part.length > part.width;
        const half = (alongZ ? part.length : part.width) / 2;
        for (const s of [-1, 1]) {
            const c = s * (half - this.gap / 2);
            if (alongZ) {
                pieces.push(this.cyl(0.26, 0.08, 'z', 0, y, c + s * 0.04, 14));                    // holder boss
                pieces.push(this.cyl(0.16, stub, 'z', 0, y, c + s * (0.08 + stub / 2), 12));     // pin
            } else {
                pieces.push(this.cyl(0.26, 0.08, 'x', c + s * 0.04, y, 0, 14));
                pieces.push(this.cyl(0.16, stub, 'x', c + s * (0.08 + stub / 2), y, 0, 12));
            }
        }
        return this.merge(pieces);
    }

    /** A bar: vertical when the part is taller than it is long, otherwise along its long axis (Technic axles get a + cross-section). */
    barGeometry(part) {
        const h = part.height, w = part.width, l = part.length;
        if (h > Math.max(w, l)) return this.cyl(0.16, h, 'y', 0, h / 2, 0, 12);
        const alongZ = l >= w, len = (alongZ ? l : w) - 0.1, y = h / 2;
        if (part.category === 'Technic') {
            const a = alongZ ? this.box(-0.15, 0.15, y - 0.05, y + 0.05, -len / 2, len / 2) : this.box(-len / 2, len / 2, y - 0.05, y + 0.05, -0.15, 0.15);
            const b = alongZ ? this.box(-0.05, 0.05, y - 0.15, y + 0.15, -len / 2, len / 2) : this.box(-len / 2, len / 2, y - 0.15, y + 0.15, -0.05, 0.05);
            return this.merge([a, b]);
        }
        return this.cyl(0.16, len, alongZ ? 'z' : 'x', 0, y, 0, 12);
    }

    /** A Technic friction pin lying along X, with its centre collar. */
    pinGeometry(part) {
        const y = part.height / 2;
        return this.merge([this.cyl(0.16, part.width - this.gap, 'x', 0, y, 0, 12), this.cyl(0.22, 0.12, 'x', 0, y, 0, 12)]);
    }

    /** A brick with round holes through its X faces, one between each pair of studs. */
    technicBrickGeometry(part) {
        const g = this.gap / 2, l = part.length, h = part.height;
        const s = new THREE.Shape();
        s.moveTo(-l / 2 + g, 0); s.lineTo(l / 2 - g, 0); s.lineTo(l / 2 - g, h); s.lineTo(-l / 2 + g, h); s.closePath();
        for (let i = 0; i < l - 1; i++) {
            const hole = new THREE.Path();
            hole.absarc(i - (l - 2) / 2, 0.7, 0.3, 0, Math.PI * 2, true);
            s.holes.push(hole);
        }
        return this.extrudeZY(s, part.width - this.gap, 14);
    }

    /* ── hinges & turntables ─────────────────────────────────── */

    hingeGeometry(part) {
        const g = this.gap / 2, h = part.height, w = part.width, l = part.length, pieces = [];
        const knuckle = (xc, thick, zAxis, yAxis, zEnd, yBase) => {   // a rounded ear: box up to the axis, then a cylinder along X
            pieces.push(this.box(xc - thick / 2, xc + thick / 2, yBase, yAxis, Math.min(zAxis, zEnd), Math.max(zAxis, zEnd)));
            pieces.push(this.cyl(0.2, thick, 'x', xc, yAxis, zAxis, 12));
        };
        if (part.isHinge === 'base' && h > 0.4) {
            // 3937: a 1x2 brick with two ears rising over its +Z end; the top plate's finger sits between them.
            pieces.push(this.plateBody(part));
            for (const s of [-1, 1]) knuckle(s * 0.39, 0.18, l / 2 - 0.2, h + 0.2, l / 2 - g, h);
        } else if (part.isHinge === 'base') {
            // 2429: a 1x2 plate at -Z plus a half-thick round-ended tongue at +Z carrying the pivot pin.
            pieces.push(this.box(-w / 2 + g, w / 2 - g, 0, h, -l / 2 + g, 0));
            pieces.push(this.box(-w / 2 + g, w / 2 - g, 0, h / 2, 0, l / 4 + 0.5));
            pieces.push(this.cyl(w / 2 - g, h / 2, 'y', 0, h / 4, l / 4 + 0.5, 16));
            pieces.push(this.cyl(0.14, h / 2, 'y', 0, h * 0.75, l / 4, 12));
        } else if (part.isHinge === 'top' && l === 4) {
            // 2430: the mirror of 2429 — upper tongue at -Z (with the pivot socket), full plate at +Z.
            pieces.push(this.box(-w / 2 + g, w / 2 - g, 0, h, 0, l / 2 - g));
            pieces.push(this.box(-w / 2 + g, w / 2 - g, h / 2, h, -l / 4 - 0.5, 0));
            pieces.push(this.cyl(w / 2 - g, h / 2, 'y', 0, h * 0.75, -l / 4 - 0.5, 16));
            pieces.push(this.cyl(0.2, 0.06, 'y', 0, h + 0.03, -l / 4, 12));
        } else if (part.isHinge === 'top') {
            // 3938 / 6134: a plate whose -Z end is a finger (one per stud column) that pivots in the base's ears.
            pieces.push(this.box(-w / 2 + g, w / 2 - g, 0, h, -l / 2 + 0.4, l / 2 - g));
            for (let x = 0; x < w; x++) knuckle(x - (w - 1) / 2, 0.5, -l / 2 + 0.2, h / 2, -l / 2 + 0.4, 0);
        } else {
            // 44301 / 44302: locking hinge plate, one or two finger stubs on the +Z end.
            pieces.push(this.box(-w / 2 + g, w / 2 - g, 0, h, -l / 2 + g, l / 2 - 0.25));
            const xs = part.isHinge === 'fingers' ? [-0.3, 0.3] : [0];
            for (const xc of xs) knuckle(xc, part.isHinge === 'fingers' ? 0.2 : 0.4, l / 2 - 0.2, h / 2, l / 2 - 0.25, 0);
        }
        return this.merge(pieces);
    }

    turntableGeometry(part) {
        const h = part.height, r = part.width / 2 * 0.96;
        if (part.isTurntable === 'base') {
            // A thinner plate with a raised ring that the top disc sits in.
            const ring = this.lathe([[r * 0.55, h - 0.1], [r * 0.78, h - 0.1], [r * 0.78, h], [r * 0.55, h]], 24);
            return this.merge([this.plateBody(part, 0, h - 0.1), ring]);
        }
        // The top: a round plate with a shallow recessed underside (hidden) and a lip.
        const disc = this.cyl(r, h, 'y', 0, h / 2, 0, 28);
        return disc;
    }

    /* ── clips, bars, flag & propeller ───────────────────────── */

    clipGeometry(part) {
        const g = this.gap / 2, h = part.height, l = part.length, pieces = [];
        if (part.isClip === 'vertical') {
            // 4085: a 1x1 plate with a C-clip on its +Z side.
            pieces.push(this.box(-0.5 + g, 0.5 - g, 0, h, -0.5 + g, 0.2));
            pieces.push(this.clipC(0.2, 0.5, 0.02, h - 0.02, 0.5));
        } else if (part.isClip === 'horizontal') {
            // 2555: a tile with two upright prongs on top; the bar lies along X between them.
            pieces.push(this.plateBody(part));
            for (const s of [-1, 1]) {
                const zi = s * 0.18, zo = s * 0.30;                                      // prong: inner / outer z
                pieces.push(this.box(-0.25, 0.25, h, h + 0.45, Math.min(zi, zo), Math.max(zi, zo)));
                pieces.push(this.box(-0.25, 0.25, h + 0.35, h + 0.45, Math.min(zi, s * 0.12), Math.max(zi, s * 0.12)));   // lip
            }
        } else if (part.isClip === 'end') {
            // 63868: a 1x2 plate whose third cell is a pair of flat jaws (open toward +Z).
            pieces.push(this.box(-0.5 + g, 0.5 - g, 0, h, -l / 2 + g, l / 2 - 1));
            pieces.push(this.clipC(l / 2 - 1, l / 2 - 0.2, 0.02, h - 0.02, 0.6, 0.12));
        } else {
            // 48729: a short bar along Z ending in a claw at +Z.
            pieces.push(this.cyl(0.16, 0.55, 'z', 0, h / 2, -0.22, 12));
            pieces.push(this.clipC(0.0, 0.48, 0.0, h, 0.44, 0.12, 0.1));
        }
        return this.merge(pieces);
    }

    /** 60478: a 1x2 plate with two short arms holding a bar along X at its +Z end. */
    barHandleGeometry(part) {
        const g = this.gap / 2, h = part.height, l = part.length, zEnd = l / 2 - 1;
        return this.merge([
            this.box(-0.5 + g, 0.5 - g, 0, h, -l / 2 + g, zEnd),
            this.box(-0.48, -0.33, 0.06, h - 0.06, zEnd, zEnd + 0.5), this.box(0.33, 0.48, 0.06, h - 0.06, zEnd, zEnd + 0.5),
            this.cyl(0.16, 0.96, 'x', 0, h / 2, zEnd + 0.5, 12)
        ]);
    }

    /** 2335: a thin square panel standing in the Z–Y plane, two clip rings on its -Z edge for a vertical bar. */
    flagGeometry(part) {
        const h = part.height, l = part.length, zClip = -l / 2 + 0.22, pieces = [];
        pieces.push(this.box(-0.06, 0.06, 0, h, -l / 2 + 0.36, l / 2 - 0.02));
        for (const yc of [h * 0.16, h * 0.84]) {
            const ring = this.lathe([[0.17, yc - 0.15], [0.26, yc - 0.15], [0.26, yc + 0.15], [0.17, yc + 0.15]], 16);
            ring.translate(0, 0, zClip);
            pieces.push(ring, this.box(-0.06, 0.06, yc - 0.15, yc + 0.15, zClip, -l / 2 + 0.36));
        }
        return this.merge(pieces);
    }

    /** 4617: a hub with `blades` (3) tapered blades lying flat, pitched 20° for a propeller look; the blade span matches the 4-stud length. */
    propellerGeometry(part) {
        const h = part.height, l = part.length, y = h / 2, n = part.blades || 3;
        const s = new THREE.Shape();
        s.moveTo(-0.16, 0.3); s.lineTo(0.16, 0.3); s.lineTo(0.3, l / 2 * 0.65); s.lineTo(0.16, l / 2 - 0.05); s.lineTo(-0.16, l / 2 - 0.05); s.lineTo(-0.3, l / 2 * 0.65); s.closePath();
        const blade = this.extrudeXZ(s, 0.08, 4);
        blade.translate(0, -0.04, 0); blade.rotateZ(0.35); blade.translate(0, h - 0.08, 0);   // blades flush with the hub top, clear of studs below
        const pieces = [this.cyl(0.35, h, 'y', 0, y, 0, 20), this.cyl(0.14, h + 0.1, 'y', 0, y + 0.05, 0, 10)];
        for (let i = 0; i < n; i++) { const b = blade.clone(); b.rotateY(i * Math.PI * 2 / n); pieces.push(b); }
        return this.merge(pieces);
    }

    /* ── brackets & sideways studs ───────────────────────────── */

    /** An L: a plate plus a studded vertical face off its +X long edge, hanging down (`down`, `down2`) or rising (`up`). */
    bracketGeometry(part) {
        const g = this.gap / 2, h = part.height, l = part.length, pieces = [];
        // The 2x2 bracket's plate is its -X half; the face and its studs live in the +X stud column.
        const edge = part.isBracket === 'down2' ? 0 : part.width / 2 - g;
        pieces.push(this.box(-part.width / 2 + g, edge, 0, h, -l / 2 + g, l / 2 - g));
        const faceX0 = part.isBracket === 'down2' ? edge : edge - 0.12, faceX1 = faceX0 + 0.12;
        const rows = part.isBracket === 'down2' ? [-0.1, -1.1] : part.isBracket === 'up' ? [0.68] : [-0.1];
        const y0 = part.isBracket === 'up' ? 0 : Math.min(...rows) - 0.5, y1 = part.isBracket === 'up' ? 0.98 : h;
        pieces.push(this.box(faceX0, faceX1, y0, y1, -l / 2 + g, l / 2 - g));
        for (const ry of rows) for (let z = 0; z < l; z++) pieces.push(this.peg('x', faceX1, ry, z - (l - 1) / 2));
        return this.merge(pieces);
    }

    /** A brick with studs on one face: 1x1 parts on -Z, the 1x2 on its -X long face; the headlight has its back-top notch. */
    sideStudBrickGeometry(part) {
        const g = this.gap / 2, h = part.height, w = part.width, l = part.length, pieces = [];
        if (part.isHeadlight) {
            pieces.push(this.box(-w / 2 + g, w / 2 - g, 0, h - 0.2, -l / 2 + g, l / 2 - g));
            pieces.push(this.box(-w / 2 + g, w / 2 - g, h - 0.2, h, -l / 2 + g, l / 2 - 0.22));
        } else pieces.push(this.plateBody(part));
        const y = h / 2;
        if (l > w) for (let z = 0; z < l; z++) pieces.push(this.peg('-x', -w / 2 + g, y, z - (l - 1) / 2));
        else pieces.push(this.peg('-z', 0, y, -l / 2 + g));
        return this.merge(pieces);
    }

    /* ── arches, windows, doors & fence ─────────────────────── */

    /** A 1-wide arch along Z: 1-stud legs and an elliptical opening; 6005 is a round-topped arch over a 1-stud opening. */
    archGeometry(part) {
        const g = this.gap / 2, h = part.height, l = part.length, s = new THREE.Shape();
        if (part.round) {
            const R = l / 2 - g, yc = h - R;
            s.moveTo(-R, 0); s.lineTo(-0.5, 0); s.lineTo(-0.5, 1.1); s.absarc(0, 1.1, 0.5, Math.PI, 0, true);
            s.lineTo(0.5, 0); s.lineTo(R, 0); s.lineTo(R, yc); s.absarc(0, yc, R, 0, Math.PI, false); s.closePath();
        } else {
            const rx = l / 2 - 1, apex = h - 0.4, ry = Math.min(rx * 0.5, apex - 0.25, 1.0), ys = apex - ry;
            s.moveTo(-l / 2 + g, 0); s.lineTo(-rx, 0); s.lineTo(-rx, ys); s.absellipse(0, ys, rx, ry, Math.PI, 0, true);
            s.lineTo(rx, 0); s.lineTo(l / 2 - g, 0); s.lineTo(l / 2 - g, h); s.lineTo(-l / 2 + g, h); s.closePath();
        }
        return this.extrudeZY(s, part.width - this.gap, 16);
    }

    /** The opening inside a window or door frame: [z0, z1, y0, y1]. Glass and door panes use the same numbers. */
    frameOpening(part) {
        const l = part.length, h = part.height, g = this.gap / 2;
        return part.isDoorFrame || part.isDoor ? [-l / 2 + 0.3, l / 2 - 0.3, 0.15, h - 0.45] : [-l / 2 + 0.25 + g, l / 2 - 0.25 - g, 0.3, h - 0.35];
    }

    /** A rectangular frame (four rails) the full stud deep; studs go on its top rail. */
    frameGeometry(part) {
        const g = this.gap / 2, h = part.height, l = part.length, [z0, z1, y0, y1] = this.frameOpening(part);
        const s = new THREE.Shape();
        s.moveTo(-l / 2 + g, 0); s.lineTo(l / 2 - g, 0); s.lineTo(l / 2 - g, h); s.lineTo(-l / 2 + g, h); s.closePath();
        const hole = new THREE.Path();
        hole.moveTo(z0, y0); hole.lineTo(z0, y1); hole.lineTo(z1, y1); hole.lineTo(z1, y0); hole.closePath();
        s.holes.push(hole);
        return this.extrudeZY(s, part.width - this.gap, 4);
    }

    /** A thin pane filling the matching frame's opening (ghost part, usually a trans colour). */
    glassGeometry(part) {
        const [z0, z1, y0, y1] = this.frameOpening(part);
        return this.box(-0.05, 0.05, y0 + 0.02, y1 - 0.02, z0 + 0.02, z1 - 0.02);
    }

    /** A door panel with two raised panels and a stud handle, hinged on its -Z edge and left 12° ajar toward -X. */
    doorGeometry(part) {
        const [z0, z1, y0, y1] = this.frameOpening(part), zh = z0 + 0.03;
        const pieces = [this.box(-0.08, 0.08, y0 + 0.02, y1 - 0.02, zh, z1 - 0.03)];
        const span = y1 - y0, zc = (z0 + z1) / 2, pw = (z1 - z0) * 0.7;
        pieces.push(this.box(-0.11, -0.08, y0 + span * 0.08, y0 + span * 0.44, zc - pw / 2, zc + pw / 2));
        pieces.push(this.box(-0.11, -0.08, y0 + span * 0.53, y0 + span * 0.92, zc - pw / 2, zc + pw / 2));
        pieces.push(this.peg('-x', -0.08, y0 + span * 0.48, z1 - 0.45, 0.2));
        const door = this.merge(pieces);
        door.translate(0, 0, -zh); door.rotateY(-12 * Math.PI / 180); door.translate(0, 0, zh);
        return door;
    }

    /** 3185: a plate-thick base, two rails and seven pickets, all thin in X. */
    fenceGeometry(part) {
        const g = this.gap / 2, h = part.height, l = part.length, pieces = [this.plateBody(part, 0, 0.4)];
        pieces.push(this.box(-0.1, 0.1, h - 0.25, h, -l / 2 + g, l / 2 - g));
        pieces.push(this.box(-0.08, 0.08, h * 0.5, h * 0.5 + 0.14, -l / 2 + g, l / 2 - g));
        const n = l * 2 - 1;
        for (let i = 0; i < n; i++) { const z = -l / 2 + 0.5 + i * 0.5; pieces.push(this.box(-0.08, 0.08, 0.4, h - 0.25, z - 0.08, z + 0.08)); }
        return this.merge(pieces);
    }

    /* ── wedges, curves & rounds ─────────────────────────────── */

    /** The X of a wedge plate's slanted edge at depth z (its -X edge is straight for `right`; mirrored for `left`). */
    wedgeEdge(part, z) {
        const w = part.width, l = part.length;
        return w / 2 - (w - 1) * (z + l / 2) / l;
    }

    wedgeGeometry(part) {
        const g = this.gap / 2, w = part.width, l = part.length, m = part.isWedge === 'left' ? -1 : 1, s = new THREE.Shape();
        const pts = [[-w / 2 + g, -l / 2 + g], [w / 2 - g, -l / 2 + g], [-w / 2 + 1 - g, l / 2 - g], [-w / 2 + g, l / 2 - g]].map(([x, z]) => [m * x, z]);
        if (m < 0) pts.reverse();
        s.moveTo(pts[0][0], pts[0][1]); for (const [x, z] of pts.slice(1)) s.lineTo(x, z); s.closePath();
        return this.extrudeXZ(s, part.height, 2);
    }

    /** A quarter-ellipse profile: flat at the high -Z end, falling to a small lip at +Z (6091 keeps a 1-stud flat top). */
    curvedSlopeGeometry(part) {
        const g = this.gap / 2, h = part.height, l = part.length, s = new THREE.Shape();
        if (part.slopeStuds) {
            const flatEnd = -l / 2 + part.slopeStuds, lip = h - 1.0;
            s.moveTo(-l / 2 + g, 0); s.lineTo(l / 2 - g, 0); s.lineTo(l / 2 - g, lip);
            s.absellipse(flatEnd, lip, l / 2 - g - flatEnd, h - lip, 0, Math.PI / 2, false); s.lineTo(-l / 2 + g, h); s.closePath();
        } else {
            s.moveTo(-l / 2 + g, 0); s.lineTo(l / 2 - g, 0); s.lineTo(l / 2 - g, 0.1);
            s.absellipse(-l / 2 + g, 0.1, l - 2 * g, h - 0.1, 0, Math.PI / 2, false); s.closePath();
        }
        return this.extrudeZY(s, part.width - this.gap, 14);
    }

    /** Full top, 1-stud foot at -Z, the underside sloping out to a lip at +Z. */
    invertedSlopeGeometry(part) {
        const g = this.gap / 2, h = part.height, l = part.length, s = new THREE.Shape();
        s.moveTo(-l / 2 + g, 0); s.lineTo(-l / 2 + 1, 0); s.lineTo(l / 2 - g, h - 0.3); s.lineTo(l / 2 - g, h); s.lineTo(-l / 2 + g, h); s.closePath();
        return this.extrudeZY(s, part.width - this.gap, 2);
    }

    /** A pie slice keeping its square corner at (-X, -Z). */
    quarterRoundGeometry(part) {
        const r = part.width - this.gap, c = -part.width / 2 + this.gap / 2, s = new THREE.Shape();
        s.moveTo(c, c); s.lineTo(c + r, c); s.absarc(c, c, r, 0, Math.PI / 2, false); s.closePath();
        return this.extrudeXZ(s, part.height, part.width > 1 ? 16 : 10);
    }

    roundCornerGeometry(part) { return this.quarterRoundGeometry(part); }

    /** An inverted dish: a shallow dome cap with a hollow underside, rim at y=0 (lathe). */
    dishGeometry(part) {
        const R = part.width / 2 * 0.96, h = part.height, top = (r) => 0.1 + (h - 0.1) * Math.sqrt(Math.max(0, 1 - (r / R) ** 2));
        const profile = [];
        for (let i = 0; i <= 6; i++) { const r = 0.01 + (R - 0.1 - 0.01) * i / 6; profile.push([r, Math.max(0.02, top(r) - 0.1)]); }
        profile.push([R - 0.1, 0], [R, 0]);
        for (let i = 0; i <= 8; i++) { const r = R - (R - 0.01) * i / 8; profile.push([r, top(r)]); }
        return this.lathe(profile, 28);
    }

    /** A tile with three ridges running along its length. */
    grilleGeometry(part) {
        const g = this.gap / 2, l = part.length, h = part.height, pieces = [this.plateBody(part, 0, h - 0.1)];
        for (const x of [-0.3, 0, 0.3]) pieces.push(this.box(x - 0.09, x + 0.09, h - 0.1, h, -l / 2 + g, l / 2 - g));
        return this.merge(pieces);
    }

    /* ── slopes (legacy wedge builder) ───────────────────────── */

    /** A wedge: full height at -Z (the studded end), sloping down to a small lip at +Z. */
    slopeGeometry(w, l, h, flat, lip) {
        const p = [[-l / 2, 0], [l / 2, 0], [l / 2, lip], [-l / 2 + Math.min(flat, l * 0.9), h], [-l / 2, h]];  // (z, y), counter-clockwise
        const pos = [], nrm = [];
        const tri = (a, b, c, want) => {
            const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            let n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
            const len = Math.hypot(...n) || 1; n = n.map((v) => v / len);
            if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) { [b, c] = [c, b]; n = n.map((v) => -v); }
            pos.push(...a, ...b, ...c); nrm.push(...n, ...n, ...n);
        };
        // Side faces, one quad per profile edge.
        for (let i = 0; i < p.length; i++) {
            const q = p[i], r = p[(i + 1) % p.length];
            const dz = r[0] - q[0], dy = r[1] - q[1], want = [0, dy, -dz];     // outward for a CCW profile
            const A = [-w / 2, q[1], q[0]], B = [w / 2, q[1], q[0]], C = [w / 2, r[1], r[0]], D = [-w / 2, r[1], r[0]];
            tri(A, B, C, want); tri(A, C, D, want);
        }
        // End caps.
        for (const [x, want] of [[w / 2, [1, 0, 0]], [-w / 2, [-1, 0, 0]]]) {
            for (let i = 1; i < p.length - 1; i++) tri([x, p[0][1], p[0][0]], [x, p[i][1], p[i][0]], [x, p[i + 1][1], p[i + 1][0]], want);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        return g;
    }

    /* ── studs ───────────────────────────────────────────────── */

    /** Where a part's top studs go, as [x, z, radius?] in part space. */
    studSpots(part) {
        const R = this.studRadius;
        if (part.isCone) return [[0, 0, part.width === 1 ? 0.14 : 0.28]];
        if ((part.isRound && part.width === 1) || part.isJumper || part.isDish || (part.isArch && part.round)) return [[0, 0]];
        if (part.isTurntable === 'base') return [];                                   // the ring takes the top
        if (part.isBracket === 'down2') return [[-0.5, -0.5], [-0.5, 0.5]];           // only the -X half is plate
        const halfW = (part.width - 1) / 2, halfL = (part.length - 1) / 2, out = [];
        const cells = (part.isClip === 'end' || part.isBarHandle) ? part.length - 1 : part.length;   // the last cell is the clip / bar
        for (let x = 0; x < part.width; x++) {
            for (let z = 0; z < cells; z++) {
                if (part.isSlope && z >= (part.slopeStuds || 0)) continue;   // only the flat top of a slope has studs
                const sx = x - halfW, sz = z - halfL;
                if (part.isWedge) {
                    const m = part.isWedge === 'left' ? -1 : 1;
                    if (m * sx + R > this.wedgeEdge(part, sz)) continue;          // cut by the slanted edge
                }
                if (part.isRoundCorner && Math.hypot(sx + part.width / 2, sz + part.length / 2) > part.width - R) continue;
                out.push([sx, sz]);
            }
        }
        return out;
    }

    studGeometries(part) {
        const topY = part.height;
        return this.studSpots(part).map(([x, z, r = this.studRadius]) => {
            const g = this.studGeometry(r);
            g.translate(x, topY, z);
            return g;
        });
    }

    /**
     * A stud standing on y=0: an open-bottomed cylinder (the base is buried in the body) and a top
     * with a faint ring at 60% radius, a hair lower with tilted normals, so the top shows the soft
     * concentric highlight of a moulded stud instead of a flat disc. 12 segments, 60 triangles,
     * which keeps a 2x4 brick near 520 triangles. Lite quality uses a plain 10-segment stud.
     */
    studGeometry(r) {
        const h = this.studHeight, lite = this.quality === 'lite', seg = lite ? 10 : 12;
        const pos = [], nrm = [];
        const V = (p, n) => { pos.push(...p); nrm.push(...n); };
        const ring = r * 0.6, dip = 0.012, up = [0, 1, 0];
        for (let i = 0; i < seg; i++) {
            const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
            const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
            const n0 = [c0, 0, s0], n1 = [c1, 0, s1];
            const o0 = [r * c0, h, r * s0], o1 = [r * c1, h, r * s1];
            // Side wall, smooth radial normals (counter-clockwise seen from outside).
            V([r * c0, 0, r * s0], n0); V(o1, n1); V([r * c1, 0, r * s1], n1);
            V([r * c0, 0, r * s0], n0); V(o0, n0); V(o1, n1);
            if (lite) { V([0, h, 0], up); V(o1, up); V(o0, up); continue; }
            // Outer annulus down to the ring, then the inner disc back up to the centre.
            const t0 = [-c0 * 0.45, 1, -s0 * 0.45], t1 = [-c1 * 0.45, 1, -s1 * 0.45];
            const i0 = [ring * c0, h - dip, ring * s0], i1 = [ring * c1, h - dip, ring * s1];
            V(o0, up); V(i1, t1); V(o1, up);
            V(o0, up); V(i0, t0); V(i1, t1);
            V([0, h, 0], up); V(i1, t1); V(i0, t0);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        return g;
    }

    /** Concatenate geometries (positions + normals) into one non-indexed BufferGeometry. */
    merge(geoms) {
        const chunks = geoms.map((g) => (g.index ? g.toNonIndexed() : g));
        let n = 0;
        for (const g of chunks) n += g.attributes.position.count;
        const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
        let o = 0;
        for (const g of chunks) {
            pos.set(g.attributes.position.array, o); nrm.set(g.attributes.normal.array, o);
            o += g.attributes.position.count * 3;
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        return out;
    }

    /* ── baked LDraw geometry (real sets) ─────────────────────── */
    //
    // A reference model (a real set rebuilt from its LDraw file) renders every part with geometry
    // baked from the LDraw parts library into data/ldraw/parts/<partId>.json: StudForge units and
    // axes, part-local around the LDraw origin (a brick's origin is the centre of its top face, not
    // its base). Each file is fetched once (BrickBuilder.preload) into one shared geometry, so 40
    // copies of a 1x2 plate are 40 meshes over one buffer. The viewer applies the brick's `matrix`.
    // LDraw winding is only reliable in BFC-certified files, so baked meshes use double-sided twins
    // of the colour materials, kept in materialsCache so lighting moods and quality switches reach them.

    /** A mesh for a baked part, pivot at its LDraw origin. Falls back to a box until (or unless) the geometry arrives. */
    createBakedMesh(partId, colorKey, options = {}) {
        const id = BrickBuilder.bakedId(options.geometryId || partId);
        const plate = !!options.baseplate;   // baseplates are drawn here, not fetched (their files are huge and plain)
        const entry = plate ? null : BrickBuilder.bakedCache.get(id);
        const colorDef = window.LEGO_COLORS[colorKey];
        const isTrans = !!(colorDef && colorDef.category === 'Transparent');
        // A part over the triangle cap is drawn in full on phones too, while the model's heavy-part budget lasts; past it, a box.
        const lite = !!(entry && entry.heavy && this.quality === 'lite' && !this.spendHeavy(entry));
        const geom = entry ? (lite ? this.heavyBox(entry) : this.quality === 'lite' ? entry.liteGeometry : entry.geometry) : plate ? this.baseplateGeometry(options) : this.bakedFallback(options);
        const mesh = new THREE.Mesh(geom, this.bakedMaterial(colorKey, entry && entry.rubber ? 'rubber' : 'plastic'));
        mesh.castShadow = !isTrans;
        mesh.receiveShadow = true;
        mesh.userData = {
            partId: String(partId), partName: entry ? entry.name : plate ? 'Baseplate' : `LDraw part ${partId}`, colorKey,
            width: entry ? entry.size[0] : 1, length: entry ? entry.size[2] : 1, height: entry ? entry.size[1] : 1.2,
            layer: options.layer || 0, baked: true,
            originalPosition: options.position ? options.position.clone() : new THREE.Vector3()
        };
        if (entry && !lite) this.addBakedDetails(mesh, entry);
        else if (!entry && !plate && !BrickBuilder.bakedCache.has(id)) {
            // Not preloaded (a caller skipped BrickBuilder.preload): swap the real geometry in when it lands.
            BrickBuilder.preload([options.geometryId || partId]).then(() => {
                const e = BrickBuilder.bakedCache.get(id);
                if (!e || mesh.geometry !== geom) return;
                const box = e.heavy && this.quality === 'lite' && !this.spendHeavy(e);
                mesh.geometry = box ? this.heavyBox(e) : this.quality === 'lite' ? e.liteGeometry : e.geometry;
                if (e.rubber) mesh.material = this.bakedMaterial(colorKey, 'rubber');
                Object.assign(mesh.userData, { partName: e.name, width: e.size[0], length: e.size[2], height: e.size[1] });
                if (!box) this.addBakedDetails(mesh, e);
            });
        }
        return mesh;
    }

    /**
     * A baseplate in the part's own frame: LDraw baseplates have their origin at the centre of the top
     * face, so a thin slab (y −0.2..0) under a grid of simple 8-sided studs. Its size comes from the
     * brick's grid footprint turned into the part's frame (a baseplate is always on the grid), else 16×16.
     */
    baseplateGeometry(options) {
        let w = 16, l = 16;
        const fp = options.fp, R = Array.isArray(options.matrix) && options.matrix.length === 9 ? options.matrix : [1, 0, 0, 0, 1, 0, 0, 0, 1];
        if (fp && fp.w > 0 && fp.l > 0) {
            // |Rᵀ| maps the world extents onto the part's axes (exact for 90° turns).
            w = Math.round(Math.abs(R[0]) * fp.w + Math.abs(R[3]) * 0 + Math.abs(R[6]) * fp.l);
            l = Math.round(Math.abs(R[2]) * fp.w + Math.abs(R[8]) * fp.l);
            w = Math.max(1, Math.min(64, w)); l = Math.max(1, Math.min(64, l));
        }
        const key = `ldraw:baseplate:${w}x${l}`;
        if (this.geometryCache.has(key)) return this.geometryCache.get(key);
        const slab = this.box(-w / 2 + 0.01, w / 2 - 0.01, -0.2, 0, -l / 2 + 0.01, l / 2 - 0.01).toNonIndexed();
        const pos = [], nrm = [], seg = 8, r = this.studRadius, h = this.studHeight;
        for (let i = 0; i < w; i++) for (let k = 0; k < l; k++) {
            const cx = -w / 2 + i + 0.5, cz = -l / 2 + k + 0.5;
            for (let s = 0; s < seg; s++) {
                const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
                const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
                const p00 = [cx + r * c0, 0, cz + r * s0], p01 = [cx + r * c0, h, cz + r * s0], p10 = [cx + r * c1, 0, cz + r * s1], p11 = [cx + r * c1, h, cz + r * s1];
                pos.push(...p00, ...p11, ...p10, ...p00, ...p01, ...p11, cx, h, cz, ...p11, ...p01);
                nrm.push(c0, 0, s0, c1, 0, s1, c1, 0, s1, c0, 0, s0, c0, 0, s0, c1, 0, s1, 0, 1, 0, 0, 1, 0, 0, 1, 0);
            }
        }
        const studs = new THREE.BufferGeometry();
        studs.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        studs.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        const geom = this.merge([slab, studs]);
        geom.computeBoundingBox(); geom.computeBoundingSphere();
        this.geometryCache.set(key, geom);
        return geom;
    }

    /**
     * The lite tier's allowance for heavy parts (horses, dragons, big hulls: 3–12k triangles each), per model: the viewer
     * resets it on every load. Every converted real set fits (the most is about 150k), so a phone only falls back to boxes
     * on something bigger. Returns true when the part may be drawn in full.
     */
    spendHeavy(entry) {
        if (this.heavyLeft == null) this.heavyLeft = BrickBuilder.HEAVY_BUDGET;
        const t = entry.tris || 0;
        if (t > this.heavyLeft) return false;
        this.heavyLeft -= t;
        return true;
    }

    /** The lite-tier stand-in for a heavy part past the budget: its bounding box, shared per part. */
    heavyBox(entry) {
        if (!entry.liteBox) { const b = entry.bbox, g = this.gap / 2; entry.liteBox = this.box(b[0] + g, b[3] - g, b[1], b[4], b[2] + g, b[5] - g); }
        return entry.liteBox;
    }

    /** Fixed-colour pieces of a multi-colour part (prints, a tyre moulded onto its rim) ride along as child meshes. */
    addBakedDetails(mesh, entry) {
        for (const d of entry.details) {
            const child = new THREE.Mesh(d.geometry, this.bakedMaterial(d.colorKey));
            const c = window.LEGO_COLORS[d.colorKey];
            child.castShadow = !(c && c.category === 'Transparent');
            child.receiveShadow = true;
            child.userData = { detail: true, colorKey: d.colorKey };
            mesh.add(child);
        }
    }

    /** The double-sided twin of a colour's material (same look, both faces drawn), shared per colour and finish. */
    bakedMaterial(colorKey, finish = 'plastic') {
        const key = `${this.materialKey(colorKey, finish)}:2s`;
        if (this.materialsCache.has(key)) return this.materialsCache.get(key);
        const base = this.getMaterial(colorKey, finish);
        const mat = base.clone();
        mat.side = THREE.DoubleSide;
        mat.userData = Object.assign({}, base.userData);
        this.materialsCache.set(key, mat);
        return mat;
    }

    /**
     * A stand-in for a part with no baked file: its grid footprint as a box (`options.fp` in world
     * studs/plates, moved into the part's frame through `position` and `matrix`), else a 1x1 brick
     * hanging below the origin like an LDraw brick.
     */
    bakedFallback(options) {
        const fp = options.fp, p = options.position, m = options.matrix;
        if (fp && p && fp.w > 0 && fp.l > 0 && fp.hp > 0) {
            const g = this.gap / 2, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
            const R = Array.isArray(m) && m.length === 9 ? m : [1, 0, 0, 0, 1, 0, 0, 0, 1];
            for (const wx of [fp.x0 + g, fp.x0 + fp.w - g]) for (const wy of [fp.y0 * 0.4, (fp.y0 + fp.hp) * 0.4 - 0.01]) for (const wz of [fp.z0 + g, fp.z0 + fp.l - g]) {
                const d = [wx - p.x, wy - p.y, wz - p.z];
                // local = Rᵀ · (world − position)
                const q = [R[0] * d[0] + R[3] * d[1] + R[6] * d[2], R[1] * d[0] + R[4] * d[1] + R[7] * d[2], R[2] * d[0] + R[5] * d[1] + R[8] * d[2]];
                for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], q[a]); hi[a] = Math.max(hi[a], q[a]); }
            }
            return this.box(lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]);
        }
        if (!this.geometryCache.has('ldraw:fallback')) {
            const g = this.getGeometry(window.LEGO_PARTS['3005'] || window.LEGO_PARTS['3001']).clone();
            g.translate(0, -1.2, 0);
            this.geometryCache.set('ldraw:fallback', g);
        }
        return this.geometryCache.get('ldraw:fallback');
    }
}

/* ── the shared baked-part cache ─────────────────────────────── */
BrickBuilder.bakedBase = 'data/ldraw/parts/';   // relative to the page, like data/knowledge.json
BrickBuilder.HEAVY_BUDGET = 200000;            // triangles of heavy parts a lite-tier model may draw in full
BrickBuilder.bakedCache = new Map();            // id → { geometry, details, name, size, rubber } | null (no file)
BrickBuilder.bakedPending = new Map();          // id → Promise, so concurrent requests share one fetch
/** LDraw file name → baked id: lower case, no `.dat`, `/` → `_` (matches the baker). */
BrickBuilder.bakedId = (partId) => String(partId).trim().toLowerCase().replace(/\.dat$/, '').replace(/[\\/]/g, '_');
/** Real-set bricks say `baked: true`; anything our catalog does not know is baked too. */
BrickBuilder.isBaked = (partId, flag) => !!flag || !(window.LEGO_PARTS && window.LEGO_PARTS[partId]);
/** A real-set brick the converter flagged as a baseplate (drawn procedurally, never fetched). */
BrickBuilder.isBaseplate = (b) => !!(b && (b.baseplate === true || b.flag === 'baseplate' || b.kind === 'baseplate' || b.partKind === 'baseplate'));
/** Catalog entry, else what the baked file says (name and size), else null. For parts lists and inspectors. */
BrickBuilder.partInfo = (partId) => {
    const cat = window.LEGO_PARTS && window.LEGO_PARTS[partId];
    if (cat) return cat;
    const e = BrickBuilder.bakedCache.get(BrickBuilder.bakedId(partId));
    return e ? { id: String(partId), name: e.name, category: 'LDraw', width: e.size[0], length: e.size[2], height: e.size[1] } : null;
};

/** Fetch and build the baked geometry of these parts; resolves (never rejects) once every one is ready or known missing. */
/**
 * The baker's manifest (data/ldraw/manifest.json: { parts: { id: { name, tris, ... } } }), loaded once: it names
 * the parts (the part files carry geometry only) and says which ids exist, so a part that was never baked
 * goes straight to its fallback box instead of a 404. Resolves null when there is no manifest.
 */
BrickBuilder.manifest = null;
BrickBuilder.loadManifest = () => BrickBuilder.manifestP || (BrickBuilder.manifestP = (typeof fetch !== 'function' ? Promise.resolve(null)
    : fetch(BrickBuilder.bakedBase.replace(/parts\/?$/, 'manifest.json')).then((r) => (r.ok ? r.json() : null)).catch(() => null))
    .then((m) => { BrickBuilder.manifest = m && m.parts && typeof m.parts === 'object' ? m : null; return BrickBuilder.manifest; }));

/** Fetch and build the baked geometry of these parts; resolves (never rejects) once every one is ready or known missing. */
BrickBuilder.preload = (partIds) => {
    const ids = [...new Set((partIds || []).map(BrickBuilder.bakedId))];
    return BrickBuilder.loadManifest().then((manifest) => Promise.all(ids.map((id) => {
        if (BrickBuilder.bakedCache.has(id)) return null;
        if (BrickBuilder.bakedPending.has(id)) return BrickBuilder.bakedPending.get(id);
        const known = manifest ? manifest.parts[id] : undefined;
        if (!/^[a-z0-9][a-z0-9_.-]*$/.test(id) || typeof fetch !== 'function' || (manifest && !known)) { BrickBuilder.bakedCache.set(id, null); return null; }
        const p = fetch(`${BrickBuilder.bakedBase}${encodeURIComponent(id)}.json`)
            .then((r) => (r.ok ? r.json() : null))
            .then((doc) => { BrickBuilder.bakedCache.set(id, doc ? BrickBuilder.buildBaked(doc, known && known.name) : null); })
            .catch(() => { BrickBuilder.bakedCache.set(id, null); })
            .then(() => { BrickBuilder.bakedPending.delete(id); });
        BrickBuilder.bakedPending.set(id, p);
        return p;
    }))).then(() => undefined);
};

// LDraw colour codes a baked file may give individual triangles (`c`), mapped to our palette.
// 16 (main) and 24 (edge) follow the brick's own colour; anything unknown does too.
BrickBuilder.LDRAW_COLORS = {
    0: 'BLACK', 1: 'BLUE', 2: 'GREEN', 4: 'RED', 5: 'PINK', 6: 'BROWN', 7: 'LIGHT_GREY', 8: 'DARK_GREY', 10: 'LIME', 13: 'PINK', 14: 'YELLOW', 15: 'WHITE',
    19: 'TAN', 22: 'PURPLE', 25: 'ORANGE', 27: 'LIME', 28: 'TAN', 70: 'BROWN', 71: 'LIGHT_GREY', 72: 'DARK_GREY', 272: 'DARK_BLUE', 288: 'GREEN', 320: 'DARK_RED',
    297: 'GOLD', 334: 'GOLD', 33: 'TRANS_BLUE', 43: 'TRANS_BLUE', 36: 'TRANS_RED', 46: 'TRANS_ORANGE', 57: 'TRANS_ORANGE', 47: 'TRANS_CLEAR', 40: 'TRANS_CLEAR',
};

/**
 * A baked file → { geometry (main colour, studs included), details: [{ colorKey, geometry }], name, size, bbox,
 * rubber, heavy }, or null if malformed. `name` comes from the manifest (newer files carry geometry only).
 */
BrickBuilder.buildBaked = (doc, name) => {
    const v = doc && doc.v, idx = doc && doc.i;
    if (!Array.isArray(v) || !Array.isArray(idx) || v.length % 3 || idx.length % 3 || !idx.length) return null;
    const nv = v.length / 3;
    for (let k = 0; k < idx.length; k++) if (!(idx[k] >= 0 && idx[k] < nv)) return null;
    const T = idx.length / 3;
    // Split the triangles by colour: the main colour (16/24/unknown) and any fixed colours.
    const byColor = new Map([['', []]]);
    const c = Array.isArray(doc.c) && doc.c.length === T ? doc.c : null;
    for (let t = 0; t < T; t++) {
        let key = '';
        if (c && c[t] != null && c[t] !== 16 && c[t] !== 24 && c[t] !== '16' && c[t] !== '24') {
            key = (typeof c[t] === 'string' && window.LEGO_COLORS && window.LEGO_COLORS[c[t]]) ? c[t] : (BrickBuilder.LDRAW_COLORS[+c[t]] || '');
        }
        if (!byColor.has(key)) byColor.set(key, []);
        byColor.get(key).push(t);
    }
    let bb = Array.isArray(doc.bbox) && doc.bbox.length === 6 ? doc.bbox : null;
    if (!bb) {
        bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
        for (let k = 0; k < nv; k++) for (let a = 0; a < 3; a++) { bb[a] = Math.min(bb[a], v[k * 3 + a]); bb[a + 3] = Math.max(bb[a + 3], v[k * 3 + a]); }
    }
    // LDraw marks aliases and moved parts with a leading = or ~ in the title: not part of the name.
    name = String(name || doc.name || doc.id || 'LDraw part').replace(/^[=~_|]+\s*/, '').replace(/\s+/g, ' ').trim();
    const details = [];
    for (const [key, tris] of byColor) if (key && tris.length) details.push({ colorKey: key, geometry: BrickBuilder.creaseGeometry(v, idx, tris) });
    // Studs always; the underside tubes and posts only on the high tier (nobody sees them on a phone).
    const body = BrickBuilder.withStuds(BrickBuilder.creaseGeometry(v, idx, byColor.get('')), doc.studs);
    const tubes = BrickBuilder.tubeGeometry(doc.tubes);
    return {
        geometry: tubes ? BrickBuilder.bounded(BrickBuilder.protos().helper.merge([body, tubes])) : body,
        liteGeometry: body,
        details, name, bbox: bb, heavy: !!doc.heavy, tris: doc.tris || idx.length / 3,
        size: [bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]],
        rubber: /\b(tyre|tire)\b/i.test(name),
    };
};

/**
 * Newer baked files list their studs instead of meshing them: `studs: [[x, y, z, dx, dy, dz, type], ...]` (base
 * centre and outward direction, StudForge units; type 0 solid, 1 hollow, 2 other). One shared low-poly stud in
 * brick-builder's own look (LDraw's 6 LDU radius) is placed at each, aimed along its direction, and merged into
 * the part's geometry, so a brick stays one mesh and one draw call.
 */
BrickBuilder.bounded = (g) => { g.computeBoundingBox(); g.computeBoundingSphere(); return g; };
/** The shared stud shapes and a helper builder (for merge), made once. */
BrickBuilder.protos = () => {
    if (!BrickBuilder.studProtos) {
        const h = new BrickBuilder({ quality: 'lite' }), r = 0.3, inner = 0.2;
        const hollow = h.lathe([[inner, 0], [r, 0], [r, h.studHeight], [inner, h.studHeight]], 10);
        BrickBuilder.studProtos = { solid: h.studGeometry(r), hollow, helper: h };
    }
    return BrickBuilder.studProtos;
};
BrickBuilder.withStuds = (geom, studs) => {
    if (!Array.isArray(studs) || !studs.length) return geom;
    const { solid, hollow, helper } = BrickBuilder.protos();
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), at = new THREE.Vector3();
    const pieces = [geom];
    for (const s of studs) {
        if (!Array.isArray(s) || s.length < 6 || !s.slice(0, 6).every(Number.isFinite)) continue;
        dir.set(s[3], s[4], s[5]);
        if (dir.lengthSq() < 1e-9) dir.copy(up); else dir.normalize();
        q.setFromUnitVectors(up, dir);
        m.compose(at.set(s[0], s[1], s[2]), q, one);
        pieces.push((s[6] === 1 ? hollow : solid).clone().applyMatrix4(m));
    }
    const out = helper.merge(pieces);
    out.computeBoundingBox();
    out.computeBoundingSphere();
    return out;
};

/**
 * The underside tubes and posts a baked file lists (`tubes: [[x1, y1, z1, x2, y2, z2, radius, kind], ...]`, kind 3
 * a solid post, 4 an open tube) as plain 8-sided cylinders: a post gets a bottom cap, a tube an inner wall at 3/4
 * of its radius and a bottom ring. Null when there are none.
 */
BrickBuilder.tubeGeometry = (tubes) => {
    if (!Array.isArray(tubes) || !tubes.length) return null;
    const pos = [], nrm = [], seg = 8;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), axis = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3();
    const P = (p) => pos.push(p.x, p.y, p.z), N = (n) => nrm.push(n.x, n.y, n.z);
    for (const t of tubes) {
        if (!Array.isArray(t) || t.length < 7 || !t.slice(0, 7).every(Number.isFinite)) continue;
        a.set(t[0], t[1], t[2]); b.set(t[3], t[4], t[5]);
        axis.subVectors(b, a); if (axis.lengthSq() < 1e-8) continue;
        axis.normalize();
        u.set(Math.abs(axis.y) < 0.9 ? 0 : 1, Math.abs(axis.y) < 0.9 ? 1 : 0, 0).cross(axis).normalize(); w.crossVectors(axis, u);
        // the end nearer the part's underside (lower y) gets the cap or ring
        const lo = a.y <= b.y ? a : b, down = a.y <= b.y ? axis.clone().negate() : axis.clone();
        const ring = (r, k) => { const ang = (k / seg) * Math.PI * 2; return u.clone().multiplyScalar(Math.cos(ang) * r).addScaledVector(w, Math.sin(ang) * r); };
        const wall = (r, inward) => {
            for (let k = 0; k < seg; k++) {
                const d0 = ring(r, k), d1 = ring(r, k + 1), n0 = d0.clone().normalize(), n1 = d1.clone().normalize();
                if (inward) { n0.negate(); n1.negate(); }
                const a0 = a.clone().add(d0), a1 = a.clone().add(d1), b0 = b.clone().add(d0), b1 = b.clone().add(d1);
                P(a0); P(b1); P(a1); P(a0); P(b0); P(b1);
                N(n0); N(n1); N(n1); N(n0); N(n0); N(n1);
            }
        };
        const r = t[6];
        wall(r, false);
        if (t[7] === 4) {
            const ri = r * 0.75;
            wall(ri, true);
            for (let k = 0; k < seg; k++) {   // the bottom ring between the walls
                const o0 = lo.clone().add(ring(r, k)), o1 = lo.clone().add(ring(r, k + 1)), i0 = lo.clone().add(ring(ri, k)), i1 = lo.clone().add(ring(ri, k + 1));
                P(o0); P(o1); P(i1); P(o0); P(i1); P(i0);
                for (let q = 0; q < 6; q++) N(down);
            }
        } else {
            for (let k = 0; k < seg; k++) { P(lo); P(lo.clone().add(ring(r, k))); P(lo.clone().add(ring(r, k + 1))); N(down); N(down); N(down); }
        }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    return g;
};

/**
 * Non-indexed geometry for some triangles of an indexed mesh, with crease-angle normals: corners
 * that share a position average the normals of the faces meeting there within the crease angle,
 * so a wheel or a round brick shades smooth while box edges and slope ridges stay crisp. Faces are
 * compared by |dot| and sign-aligned, so mixed winding still averages correctly. Vertical faces
 * (stud and round-brick walls, 8 or 16 facets) smooth up to 50°, everything else up to 40°.
 */
BrickBuilder.creaseGeometry = (v, idx, tris) => {
    const T = tris.length, COS_WALL = Math.cos(50 * Math.PI / 180), COS_ANY = Math.cos(40 * Math.PI / 180);
    const pos = new Float32Array(T * 9), nrm = new Float32Array(T * 9), fn = new Float32Array(T * 3), fa = new Float32Array(T);
    const groups = new Map();
    for (let t = 0; t < T; t++) {
        const ti = tris[t];
        for (let k = 0; k < 3; k++) {
            const vi = idx[ti * 3 + k], o = t * 9 + k * 3;
            pos[o] = v[vi * 3]; pos[o + 1] = v[vi * 3 + 1]; pos[o + 2] = v[vi * 3 + 2];
            const key = `${Math.round(pos[o] * 1000)},${Math.round(pos[o + 1] * 1000)},${Math.round(pos[o + 2] * 1000)}`;
            let g = groups.get(key); if (!g) groups.set(key, g = []);
            g.push(t * 3 + k);
        }
        const o = t * 9;
        const ax = pos[o + 3] - pos[o], ay = pos[o + 4] - pos[o + 1], az = pos[o + 5] - pos[o + 2];
        const bx = pos[o + 6] - pos[o], by = pos[o + 7] - pos[o + 1], bz = pos[o + 8] - pos[o + 2];
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, len = Math.hypot(nx, ny, nz);
        fa[t] = len / 2;
        if (len > 1e-12) { fn[t * 3] = nx / len; fn[t * 3 + 1] = ny / len; fn[t * 3 + 2] = nz / len; }
    }
    for (const g of groups.values()) {
        for (const a of g) {
            const ta = (a / 3) | 0, ax = fn[ta * 3], ay = fn[ta * 3 + 1], az = fn[ta * 3 + 2];
            let sx = 0, sy = 0, sz = 0;
            for (const b of g) {
                const tb = (b / 3) | 0, bx = fn[tb * 3], by = fn[tb * 3 + 1], bz = fn[tb * 3 + 2];
                const d = ax * bx + ay * by + az * bz;
                const lim = Math.abs(ay) < 0.15 && Math.abs(by) < 0.15 ? COS_WALL : COS_ANY;
                if (Math.abs(d) < lim) continue;
                const w = (d < 0 ? -1 : 1) * fa[tb];
                sx += bx * w; sy += by * w; sz += bz * w;
            }
            const l = Math.hypot(sx, sy, sz);
            if (l > 1e-12) { sx /= l; sy /= l; sz /= l; } else { sx = ax; sy = ay; sz = az; }
            nrm[a * 3] = sx; nrm[a * 3 + 1] = sy; nrm[a * 3 + 2] = sz;
        }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    return geom;
};

window.BrickBuilder = BrickBuilder;
