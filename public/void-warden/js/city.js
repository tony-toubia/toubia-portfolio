// 3D City & Prop Generator for Void Warden
class CityManager {
    constructor(scene, particleManager) {
        this.scene = scene;
        this.pm = particleManager;
        this.props = []; // All devourable static objects (cars, hydrants, trees, etc.)
        this.mapSize = 140; // 140x140 meters world
        this.blockCount = 4; // 4x4 block grid

        this.initMaterials();
        this.buildGroundAndRoads();
        this.buildBuildingsAndBlocks();
        this.populateCityProps();
    }

    initMaterials() {
        this.mats = {
            asphalt: new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.9 }),
            roadMarking: new THREE.MeshBasicMaterial({ color: 0xffd166 }),
            crosswalk: new THREE.MeshBasicMaterial({ color: 0xffffff }),
            sidewalk: new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.8 }),
            buildingDark: new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.6 }),
            buildingGlass: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.8 }),
            windowGlow: new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.35 }),
            curb: new THREE.MeshStandardMaterial({ color: 0x4a5568 }),
            coneOrange: new THREE.MeshStandardMaterial({ color: 0xff6b35, roughness: 0.5 }),
            coneWhite: new THREE.MeshBasicMaterial({ color: 0xffffff }),
            hydrantRed: new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.4 }),
            metalGrey: new THREE.MeshStandardMaterial({ color: 0x4a5568, metalness: 0.6, roughness: 0.4 }),
            woodBrown: new THREE.MeshStandardMaterial({ color: 0x7f5539, roughness: 0.9 }),
            foliageGreen: new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.7 }),
            trunkBrown: new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 }),
            carRed: new THREE.MeshStandardMaterial({ color: 0xd90429, metalness: 0.5, roughness: 0.3 }),
            carBlue: new THREE.MeshStandardMaterial({ color: 0x0077b6, metalness: 0.5, roughness: 0.3 }),
            carYellow: new THREE.MeshStandardMaterial({ color: 0xffb703, metalness: 0.5, roughness: 0.3 }),
            policeWhite: new THREE.MeshStandardMaterial({ color: 0xf8f9fa, metalness: 0.3, roughness: 0.4 }),
            policeBlack: new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.4, roughness: 0.4 }),
            sirenBlue: new THREE.MeshBasicMaterial({ color: 0x00f3ff }),
            sirenRed: new THREE.MeshBasicMaterial({ color: 0xff0055 }),
            barrierConcrete: new THREE.MeshStandardMaterial({ color: 0x718096, roughness: 0.9 })
        };
    }

    buildGroundAndRoads() {
        // Base ground
        const groundGeom = new THREE.PlaneGeometry(this.mapSize * 1.3, this.mapSize * 1.3);
        groundGeom.rotateX(-Math.PI / 2);
        const ground = new THREE.Mesh(groundGeom, this.mats.asphalt);
        ground.position.y = -0.02;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Grid road markings (Dashed yellow center lines)
        const blockSize = 28;
        const streetWidth = 10;
        const halfMap = this.mapSize / 2;

        for (let x = -halfMap + 14; x <= halfMap - 14; x += blockSize + streetWidth) {
            const lineGeom = new THREE.PlaneGeometry(0.35, this.mapSize);
            lineGeom.rotateX(-Math.PI / 2);
            const line = new THREE.Mesh(lineGeom, this.mats.roadMarking);
            line.position.set(x, 0.01, 0);
            this.scene.add(line);
        }

        for (let z = -halfMap + 14; z <= halfMap - 14; z += blockSize + streetWidth) {
            const lineGeom = new THREE.PlaneGeometry(this.mapSize, 0.35);
            lineGeom.rotateX(-Math.PI / 2);
            const line = new THREE.Mesh(lineGeom, this.mats.roadMarking);
            line.position.set(0, 0.01, z);
            this.scene.add(line);
        }
    }

    buildBuildingsAndBlocks() {
        const blockSize = 26;
        const step = 38;
        const half = 57;

        for (let bx = -half; bx <= half; bx += step) {
            for (let bz = -half; bz <= half; bz += step) {
                // Sidewalk Base
                const swGeom = new THREE.BoxGeometry(blockSize, 0.25, blockSize);
                const sw = new THREE.Mesh(swGeom, this.mats.sidewalk);
                sw.position.set(bx, 0.12, bz);
                sw.receiveShadow = true;
                this.scene.add(sw);

                // Cluster of buildings inside each block
                this.createBuildingBlock(bx, bz, blockSize);
            }
        }
    }

    createBuildingBlock(centerX, centerZ, size) {
        // 2 to 3 buildings per block
        const offsets = [
            { x: -5, z: -5, w: 12, d: 12, h: 22 + Math.random() * 25 },
            { x: 6, z: -4, w: 10, d: 14, h: 18 + Math.random() * 20 },
            { x: 0, z: 7, w: 20, d: 8, h: 14 + Math.random() * 16 }
        ];

        offsets.forEach(b => {
            const posX = centerX + b.x;
            const posZ = centerZ + b.z;

            // Main Building Mass
            const bGeom = new THREE.BoxGeometry(b.w, b.h, b.d);
            const bMesh = new THREE.Mesh(bGeom, this.mats.buildingDark);
            bMesh.position.set(posX, b.h / 2 + 0.25, posZ);
            bMesh.castShadow = true;
            bMesh.receiveShadow = true;
            this.scene.add(bMesh);

            // Glowing Windows Grid
            const winCols = Math.floor(b.w / 2.5);
            const winRows = Math.floor(b.h / 4);
            for (let r = 1; r < winRows; r++) {
                if (Math.random() > 0.4) {
                    const winGeom = new THREE.PlaneGeometry(b.w * 0.8, 0.6);
                    const win = new THREE.Mesh(winGeom, this.mats.windowGlow);
                    win.position.set(posX, r * 3.5, posZ + b.d / 2 + 0.05);
                    this.scene.add(win);
                }
            }

            // Rooftop detail (HVAC unit)
            const hvac = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 3), this.mats.metalGrey);
            hvac.position.set(posX + 1, b.h + 1.1, posZ - 1);
            this.scene.add(hvac);
        });
    }

    populateCityProps() {
        // Scattered interactive objects on streets and sidewalks
        const positions = [];

        // Distribute props along sidewalks and road edges
        for (let i = 0; i < 90; i++) {
            const x = (Math.random() - 0.5) * (this.mapSize - 20);
            const z = (Math.random() - 0.5) * (this.mapSize - 20);

            // Pick random prop type
            const rand = Math.random();
            if (rand < 0.25) {
                this.spawnProp('cone', x, z);
            } else if (rand < 0.45) {
                this.spawnProp('hydrant', x, z);
            } else if (rand < 0.65) {
                this.spawnProp('barrier', x, z);
            } else if (rand < 0.85) {
                this.spawnProp('car', x, z);
            } else {
                this.spawnProp('policeCar', x, z);
            }
        }

        // Additional large trucks / buses
        for (let i = 0; i < 10; i++) {
            const x = (Math.random() - 0.5) * (this.mapSize - 30);
            const z = (Math.random() - 0.5) * (this.mapSize - 30);
            this.spawnProp('bus', x, z);
        }
    }

    spawnProp(type, x, z) {
        const group = new THREE.Group();
        let massValue = 10;
        let requiredLevel = 1;
        let radius = 0.5;

        if (type === 'cone') {
            // Level 1: Traffic Cone
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 8), this.mats.coneOrange);
            cone.position.y = 0.4;
            const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.2, 8), this.mats.coneWhite);
            stripe.position.y = 0.4;
            const base = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.65), this.mats.coneOrange);
            base.position.y = 0.04;
            group.add(cone, stripe, base);

            massValue = 8;
            requiredLevel = 1;
            radius = 0.5;

        } else if (type === 'hydrant') {
            // Level 1: Fire Hydrant
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.9, 10), this.mats.hydrantRed);
            body.position.y = 0.45;
            const top = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), this.mats.hydrantRed);
            top.position.y = 0.9;
            const nozzle1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 8), this.mats.metalGrey);
            nozzle1.rotation.z = Math.PI / 2;
            nozzle1.position.set(0.2, 0.55, 0);
            group.add(body, top, nozzle1);

            massValue = 15;
            requiredLevel = 1;
            radius = 0.6;

        } else if (type === 'barrier') {
            // Level 2: Concrete Jersey Barrier
            const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.6), this.mats.barrierConcrete);
            b.position.y = 0.5;
            group.add(b);

            massValue = 35;
            requiredLevel = 2;
            radius = 1.3;

        } else if (type === 'car' || type === 'policeCar') {
            // Level 3: Parked Sedan or Police Cruiser
            const isPolice = type === 'policeCar';
            const bodyMat = isPolice ? this.mats.policeWhite : [this.mats.carRed, this.mats.carBlue, this.mats.carYellow][Math.floor(Math.random() * 3)];

            // Chassis
            const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 4.4), bodyMat);
            chassis.position.y = 0.65;
            chassis.castShadow = true;

            // Cabin / Roof
            const cabinMat = isPolice ? this.mats.policeBlack : this.mats.metalGrey;
            const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 2.3), cabinMat);
            cabin.position.set(0, 1.25, -0.2);

            // Wheels
            const wheelGeom = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 10);
            wheelGeom.rotateZ(Math.PI / 2);
            const w1 = new THREE.Mesh(wheelGeom, this.mats.metalGrey);
            w1.position.set(-1.05, 0.38, 1.4);
            const w2 = new THREE.Mesh(wheelGeom, this.mats.metalGrey);
            w2.position.set(1.05, 0.38, 1.4);
            const w3 = new THREE.Mesh(wheelGeom, this.mats.metalGrey);
            w3.position.set(-1.05, 0.38, -1.4);
            const w4 = new THREE.Mesh(wheelGeom, this.mats.metalGrey);
            w4.position.set(1.05, 0.38, -1.4);
            group.add(chassis, cabin, w1, w2, w3, w4);

            if (isPolice) {
                // Siren lightbar on roof
                const sirenR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.3), this.mats.sirenRed);
                sirenR.position.set(-0.35, 1.65, -0.2);
                const sirenB = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.3), this.mats.sirenBlue);
                sirenB.position.set(0.35, 1.65, -0.2);
                group.add(sirenR, sirenB);
            }

            group.rotation.y = Math.random() * Math.PI;
            massValue = isPolice ? 90 : 75;
            requiredLevel = 3;
            radius = 2.2;

        } else if (type === 'bus') {
            // Level 4: Heavy City Bus
            const busBody = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.4, 8.5), this.mats.carYellow);
            busBody.position.y = 1.6;
            busBody.castShadow = true;

            const windows = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.9, 7.8), this.mats.buildingGlass);
            windows.position.y = 1.9;
            group.add(busBody, windows);

            group.rotation.y = (Math.random() > 0.5 ? 0 : Math.PI / 2);
            massValue = 220;
            requiredLevel = 4;
            radius = 3.8;
        }

        group.position.set(x, 0, z);
        this.scene.add(group);

        const propObj = {
            type,
            mesh: group,
            x,
            y: 0,
            z,
            radius,
            massValue,
            requiredLevel,
            falling: false,
            fallProgress: 0,
            fallCenter: { x: 0, z: 0 },
            dead: false
        };

        this.props.push(propObj);
        return propObj;
    }

    update(dt, hole, onSwallow) {
        for (let i = this.props.length - 1; i >= 0; i--) {
            const p = this.props[i];
            if (p.dead) continue;

            if (p.falling) {
                p.fallProgress += dt * 3.5;
                const prog = Math.min(p.fallProgress, 1);

                // Pull into hole center and tumble down
                const dx = p.fallCenter.x - p.x;
                const dz = p.fallCenter.z - p.z;
                p.mesh.position.x += dx * dt * 7.5;
                p.mesh.position.z += dz * dt * 7.5;
                p.mesh.position.y = -Math.sin(prog * Math.PI / 2) * 4.0;

                p.mesh.rotation.x += dt * 6;
                p.mesh.rotation.z += dt * 7;

                const scale = Math.max(0.01, 1 - prog * 0.95);
                p.mesh.scale.set(scale, scale, scale);

                if (prog >= 1) {
                    this.scene.remove(p.mesh);
                    p.dead = true;
                    this.props.splice(i, 1);
                    onSwallow(p);
                }
                continue;
            }

            // Proximity to hole
            const dist = Math.hypot(p.x - hole.x, p.z - hole.z);
            const holeRadius = hole.currentRadius;

            // Must satisfy Level gating rule
            if (dist < holeRadius * 0.75) {
                if (hole.level >= p.requiredLevel) {
                    p.falling = true;
                    p.fallCenter = { x: hole.x, z: hole.z };
                    this.pm.spawnBurst(p.x, 0.4, p.z, 0x00f3ff, 12);
                } else {
                    // Too small! Bump/nudge prop away
                    const angle = Math.atan2(p.z - hole.z, p.x - hole.x);
                    p.x += Math.cos(angle) * 1.5 * dt;
                    p.z += Math.sin(angle) * 1.5 * dt;
                    p.mesh.position.set(p.x, 0, p.z);
                }
            } else if (dist < holeRadius * hole.suctionMultiplier && hole.level >= p.requiredLevel) {
                // Suction pull
                const angle = Math.atan2(hole.z - p.z, hole.x - p.x);
                const force = (1 - dist / (holeRadius * hole.suctionMultiplier)) * hole.suctionForce * 0.5;
                p.x += Math.cos(angle) * force * dt;
                p.z += Math.sin(angle) * force * dt;
                p.mesh.position.set(p.x, 0, p.z);
                // Slight tilt toward hole
                p.mesh.rotation.z = Math.sin(angle) * 0.25;
            }
        }
    }
}
