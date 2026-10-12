// Procedural 3D LEGO Brick Geometry & Material Builder for Three.js
class BrickBuilder {
    constructor() {
        this.materialsCache = new Map();
        this.geometryCache = new Map();

        // Standard stud geometry (reused across all bricks with studs)
        this.studRadius = 0.28;
        this.studHeight = 0.18;
        this.studSegments = 16;
        this.baseStudGeom = new THREE.CylinderGeometry(
            this.studRadius,
            this.studRadius,
            this.studHeight,
            this.studSegments
        );
        this.baseStudGeom.translate(0, this.studHeight / 2, 0);
    }

    getMaterial(colorKey) {
        if (this.materialsCache.has(colorKey)) {
            return this.materialsCache.get(colorKey);
        }

        const colorDef = window.LEGO_COLORS[colorKey] || window.LEGO_COLORS.RED;
        const isTrans = colorDef.category === 'Transparent';
        const isMetallic = colorDef.category === 'Metallic';

        const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(colorDef.hex),
            roughness: isMetallic ? 0.35 : 0.22,
            metalness: isMetallic ? 0.75 : 0.04,
            transparent: isTrans,
            opacity: isTrans ? (colorDef.opacity || 0.65) : 1.0,
            depthWrite: !isTrans || (colorDef.opacity > 0.6),
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        });

        this.materialsCache.set(colorKey, mat);
        return mat;
    }

    createBrickMesh(partId, colorKey, options = {}) {
        const part = window.LEGO_PARTS[partId] || window.LEGO_PARTS['3001'];
        const mat = this.getMaterial(colorKey);

        const group = new THREE.Group();
        group.userData = {
            partId: part.id,
            partName: part.name,
            colorKey: colorKey,
            colorName: (window.LEGO_COLORS[colorKey] || {}).name,
            width: part.width,
            length: part.length,
            height: part.height,
            isPlate: part.isPlate,
            layer: options.layer || 0,
            originalPosition: options.position ? options.position.clone() : new THREE.Vector3()
        };

        // 1. Create Main Brick Body
        let bodyMesh;

        if (part.isRound) {
            // Round cylinder body
            const radius = (part.width * 0.5) * 0.96;
            const geom = new THREE.CylinderGeometry(radius, radius, part.height, 24);
            geom.translate(0, part.height / 2, 0);
            bodyMesh = new THREE.Mesh(geom, mat);
        } else if (part.isCone) {
            // Cone body
            const geom = new THREE.ConeGeometry(0.48, part.height, 24);
            geom.translate(0, part.height / 2, 0);
            bodyMesh = new THREE.Mesh(geom, mat);
        } else if (part.isSlope) {
            // Slope 45 or cheese slope
            bodyMesh = this.createSlopeMesh(part, mat);
        } else {
            // Standard Box Brick or Plate
            // LEGO bricks have a 0.1mm nominal clearance gap between neighboring bricks (0.02 units)
            const gap = 0.04;
            const bW = part.width - gap;
            const bL = part.length - gap;
            const bH = part.height;

            const boxGeom = new THREE.BoxGeometry(bW, bH, bL);
            boxGeom.translate(0, bH / 2, 0);
            bodyMesh = new THREE.Mesh(boxGeom, mat);
        }

        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        group.add(bodyMesh);

        // 2. Add Top Studs (if not a smooth tile or cone)
        if (part.hasStuds && !part.isTile) {
            this.addStudsToBrick(group, part, mat);
        }

        return group;
    }

    createSlopeMesh(part, mat) {
        // Sloped wedge geometry
        const gap = 0.04;
        const w = part.width - gap;
        const l = part.length - gap;
        const h = part.height;

        const shape = new THREE.Shape();
        // Profile along length and height
        shape.moveTo(-l / 2, 0);
        shape.lineTo(l / 2, 0);
        shape.lineTo(l / 2, h * 0.3); // front lip
        shape.lineTo(-l / 2 + (part.slopeStuds ? 1.0 : 0.2), h); // top slope
        shape.lineTo(-l / 2, h);
        shape.closePath();

        const extrudeSettings = {
            steps: 1,
            depth: w,
            bevelEnabled: true,
            bevelThickness: 0.02,
            bevelSize: 0.02,
            bevelSegments: 2
        };

        const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geom.rotateY(Math.PI / 2);
        geom.translate(0, 0, -w / 2);

        return new THREE.Mesh(geom, mat);
    }

    addStudsToBrick(group, part, mat) {
        // Compute stud positions across grid
        // Center of brick is at (0, 0, 0) in X/Z
        const halfW = (part.width - 1) / 2;
        const halfL = (part.length - 1) / 2;
        const topY = part.height;

        if (part.isRound && part.width === 1) {
            // Single center stud
            const stud = new THREE.Mesh(this.baseStudGeom, mat);
            stud.position.set(0, topY, 0);
            stud.castShadow = true;
            group.add(stud);
            return;
        }

        for (let x = 0; x < part.width; x++) {
            for (let z = 0; z < part.length; z++) {
                // If it's a slope, only place studs on the non-sloped top section
                if (part.isSlope && part.slopeStuds && z >= part.slopeStuds) {
                    continue;
                }

                const posX = x - halfW;
                const posZ = z - halfL;

                const stud = new THREE.Mesh(this.baseStudGeom, mat);
                stud.position.set(posX, topY, posZ);
                stud.castShadow = true;
                group.add(stud);
            }
        }
    }
}

window.BrickBuilder = BrickBuilder;
