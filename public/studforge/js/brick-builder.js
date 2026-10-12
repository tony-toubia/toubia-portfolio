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
class BrickBuilder {
    constructor() {
        this.materialsCache = new Map();
        this.geometryCache = new Map();
        this.studRadius = 0.28;
        this.studHeight = 0.18;
        this.gap = 0.04;   // visible seam between neighbouring parts
    }

    getMaterial(colorKey) {
        if (this.materialsCache.has(colorKey)) return this.materialsCache.get(colorKey);
        const colorDef = window.LEGO_COLORS[colorKey] || window.LEGO_COLORS.RED;
        const isTrans = colorDef.category === 'Transparent';
        const isMetallic = colorDef.category === 'Metallic';
        const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(colorDef.hex),
            roughness: isMetallic ? 0.35 : 0.3,
            metalness: isMetallic ? 0.75 : 0.03,
            transparent: isTrans,
            opacity: isTrans ? (colorDef.opacity || 0.65) : 1.0,
            depthWrite: !isTrans || (colorDef.opacity > 0.6)
        });
        this.materialsCache.set(colorKey, mat);
        return mat;
    }

    /** One mesh per part. `options.layer` is the build step; `options.position` its home position. */
    createBrickMesh(partId, colorKey, options = {}) {
        const part = window.LEGO_PARTS[partId] || window.LEGO_PARTS['3001'];
        const lying = !!(options.rotX || options.rotZ);
        const mesh = new THREE.Mesh(this.getGeometry(part, lying), this.getMaterial(colorKey));
        mesh.castShadow = true;
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

    /** The plain box every brick, plate and tile starts from. */
    plateBody(part, y0 = 0, y1 = part.height) {
        const g = this.gap / 2;
        return this.box(-part.width / 2 + g, part.width / 2 - g, y0, y1, -part.length / 2 + g, part.length / 2 - g);
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
            const g = new THREE.CylinderGeometry(r, r, this.studHeight, 14);
            g.translate(x, topY + this.studHeight / 2, z);
            return g;
        });
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
}

window.BrickBuilder = BrickBuilder;
