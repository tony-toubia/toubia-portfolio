// Procedural 3D LEGO Brick Geometry & Material Builder for Three.js
//
// Every part becomes ONE mesh: the body and its studs are merged into a single
// geometry that is cached per part, so a 300-piece model is 300 draw calls,
// not 2,000. Geometry is centred on the part's footprint with its base at y=0.
class BrickBuilder {
    constructor() {
        this.materialsCache = new Map();
        this.geometryCache = new Map();
        this.studRadius = 0.28;
        this.studHeight = 0.18;
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

    bodyGeometry(part) {
        const gap = 0.04, h = part.height;
        if (part.isAntenna) {
            const base = new THREE.BoxGeometry(1 - gap, 0.4, 1 - gap); base.translate(0, 0.2, 0);
            const shaft = new THREE.CylinderGeometry(0.1, 0.13, h - 0.4, 10); shaft.translate(0, 0.4 + (h - 0.4) / 2, 0);
            const tip = new THREE.CylinderGeometry(0.16, 0.16, 0.15, 10); tip.translate(0, h - 0.07, 0);
            return this.merge([base, shaft, tip]);
        }
        if (part.isDome) {
            const r = part.width * 0.5 * 0.96;
            const stem = new THREE.CylinderGeometry(r, r, 0.5, 28); stem.translate(0, 0.25, 0);
            const dome = new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
            dome.scale(1, (h - 0.5) / r, 1); dome.translate(0, 0.5, 0);
            return this.merge([stem, dome]);
        }
        if (part.isCone) {
            const rb = part.width * 0.5 * 0.96, rt = part.width === 1 ? 0.2 : 0.42;
            const g = new THREE.CylinderGeometry(rt, rb, h, 28); g.translate(0, h / 2, 0);
            return g;
        }
        if (part.isRound) {
            const r = part.width * 0.5 * 0.96;
            const g = new THREE.CylinderGeometry(r, r, h, part.width === 1 ? 20 : 28); g.translate(0, h / 2, 0);
            return g;
        }
        if (part.isSlope) return this.slopeGeometry(part.width - gap, part.length - gap, h, part.flat, part.lip);
        const g = new THREE.BoxGeometry(part.width - gap, h, part.length - gap); g.translate(0, h / 2, 0);
        return g;
    }

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

    studGeometries(part) {
        const out = [], topY = part.height;
        const stud = (x, z, r = this.studRadius) => {
            const g = new THREE.CylinderGeometry(r, r, this.studHeight, 14);
            g.translate(x, topY + this.studHeight / 2, z);
            out.push(g);
        };
        if (part.isCone) { stud(0, 0, part.width === 1 ? 0.14 : 0.28); return out; }
        if (part.isRound && part.width === 1) { stud(0, 0); return out; }
        const halfW = (part.width - 1) / 2, halfL = (part.length - 1) / 2;
        for (let x = 0; x < part.width; x++) {
            for (let z = 0; z < part.length; z++) {
                if (part.isSlope && z >= (part.slopeStuds || 0)) continue;   // only the flat top of a slope has studs
                stud(x - halfW, z - halfL);
            }
        }
        return out;
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
