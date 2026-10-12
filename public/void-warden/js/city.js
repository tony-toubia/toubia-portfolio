// 3D City & Prop Generator for Void Warden
class CityManager {
    constructor(scene, particleManager) {
        this.scene = scene;
        this.pm = particleManager;
        this.props = []; // All devourable static objects (cars, hydrants, barrels, crates, trees, etc.)
        this.mapSize = 140; // 140x140 meters world
        this.blockCount = 4; // 4x4 block grid

        // Periodic supply drop timer
        this.supplyDropTimer = 25.0;

        // Siren animation timer
        this.sirenTimer = 0;
        this.policeCruisers = [];

        this.initMaterials();
        this.buildGroundAndRoads();
        this.buildBuildingsAndBlocks();
        this.buildPerimeterLaserFence();
        this.populateCityProps();
    }

    initMaterials() {
        this.mats = {
            asphalt: new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.92 }),
            roadMarking: new THREE.MeshBasicMaterial({ color: 0xffd166 }),
            crosswalk: new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }),
            sidewalk: new THREE.MeshStandardMaterial({ color: 0x242d3d, roughness: 0.8 }),
            curb: new THREE.MeshStandardMaterial({ color: 0x4a5568 }),
            
            // Buildings
            buildingDark: new THREE.MeshStandardMaterial({ color: 0x161c28, roughness: 0.6 }),
            buildingGlass: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.8 }),
            windowGlow: new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.4 }),
            windowGlowWarm: new THREE.MeshBasicMaterial({ color: 0xffb703, transparent: true, opacity: 0.45 }),

            // Props
            coneOrange: new THREE.MeshStandardMaterial({ color: 0xff6b35, roughness: 0.5 }),
            coneWhite: new THREE.MeshBasicMaterial({ color: 0xffffff }),
            hydrantRed: new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.4 }),
            metalGrey: new THREE.MeshStandardMaterial({ color: 0x4a5568, metalness: 0.6, roughness: 0.4 }),
            woodBrown: new THREE.MeshStandardMaterial({ color: 0x7f5539, roughness: 0.9 }),
            foliageGreen: new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.7 }),
            trunkBrown: new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.9 }),
            
            // Vehicles
            carRed: new THREE.MeshStandardMaterial({ color: 0xd90429, metalness: 0.5, roughness: 0.3 }),
            carBlue: new THREE.MeshStandardMaterial({ color: 0x0077b6, metalness: 0.5, roughness: 0.3 }),
            carYellow: new THREE.MeshStandardMaterial({ color: 0xffb703, metalness: 0.5, roughness: 0.3 }),
            policeWhite: new THREE.MeshStandardMaterial({ color: 0xf8f9fa, metalness: 0.3, roughness: 0.4 }),
            policeBlack: new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.4, roughness: 0.4 }),
            sirenBlue: new THREE.MeshBasicMaterial({ color: 0x00f3ff }),
            sirenRed: new THREE.MeshBasicMaterial({ color: 0xff0055 }),
            barrierConcrete: new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9 }),

            // Red Explosive Barrel
            barrelRed: new THREE.MeshStandardMaterial({ color: 0xd90429, roughness: 0.4, metalness: 0.2 }),
            barrelStripe: new THREE.MeshBasicMaterial({ color: 0xffd60a }),

            // Golden Supply Crate
            crateGold: new THREE.MeshStandardMaterial({ color: 0xffb703, metalness: 0.8, roughness: 0.2, emissive: 0x664d00, emissiveIntensity: 0.5 }),
            crateTrim: new THREE.MeshStandardMaterial({ color: 0x00f3ff, metalness: 0.5, roughness: 0.3 }),

            // Streetlamp light cone
            lampGlow: new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
            
            // Boundary Laser Fence
            laserFence: new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
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
            const winRows = Math.floor(b.h / 4);
            const useWarm = Math.random() > 0.5;
            const winMat = useWarm ? this.mats.windowGlowWarm : this.mats.windowGlow;

            for (let r = 1; r < winRows; r++) {
                if (Math.random() > 0.35) {
                    const winGeom = new THREE.PlaneGeometry(b.w * 0.8, 0.65);
                    const win = new THREE.Mesh(winGeom, winMat);
                    win.position.set(posX, r * 3.5, posZ + b.d / 2 + 0.05);
                    this.scene.add(win);
                }
            }

            // Rooftop HVAC unit
            const hvac = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 3), this.mats.metalGrey);
            hvac.position.set(posX + 1, b.h + 1.1, posZ - 1);
            this.scene.add(hvac);
        });
    }

    buildPerimeterLaserFence() {
        // High-tech laser perimeter fence at map boundary (-63 to +63)
        const b = 64;
        const postGeom = new THREE.BoxGeometry(1.2, 4.0, 1.2);
        const fenceY = 2.0;

        const corners = [
            [-b, -b], [b, -b], [b, b], [-b, b],
            [0, -b], [0, b], [-b, 0], [b, 0]
        ];

        corners.forEach(([px, pz]) => {
            const post = new THREE.Mesh(postGeom, this.mats.metalGrey);
            post.position.set(px, 2.0, pz);
            this.scene.add(post);

            // Glowing top beacon
            const beaconGeom = new THREE.SphereGeometry(0.4, 8, 8);
            const beacon = new THREE.Mesh(beaconGeom, this.mats.sirenBlue);
            beacon.position.set(px, 4.2, pz);
            this.scene.add(beacon);
        });

        // 4 Laser Walls
        const createWall = (w, h, d, x, y, z) => {
            const wallGeom = new THREE.BoxGeometry(w, h, d);
            const wall = new THREE.Mesh(wallGeom, this.mats.laserFence);
            wall.position.set(x, y, z);
            this.scene.add(wall);
        };

        createWall(b * 2, 2.5, 0.2, 0, fenceY, -b);
        createWall(b * 2, 2.5, 0.2, 0, fenceY, b);
        createWall(0.2, 2.5, b * 2, -b, fenceY, 0);
        createWall(0.2, 2.5, b * 2, b, fenceY, 0);
    }

    populateCityProps() {
        // 1. Scattered standard street props
        for (let i = 0; i < 90; i++) {
            const x = (Math.random() - 0.5) * (this.mapSize - 24);
            const z = (Math.random() - 0.5) * (this.mapSize - 24);

            const rand = Math.random();
            if (rand < 0.22) {
                this.spawnProp('cone', x, z);
            } else if (rand < 0.38) {
                this.spawnProp('hydrant', x, z);
            } else if (rand < 0.52) {
                this.spawnProp('barrier', x, z);
            } else if (rand < 0.72) {
                this.spawnProp('car', x, z);
            } else {
                this.spawnProp('policeCar', x, z);
            }
        }

        // 2. High-value Red Explosive Fuel Barrels (18 across the city)
        for (let i = 0; i < 18; i++) {
            const x = (Math.random() - 0.5) * (this.mapSize - 28);
            const z = (Math.random() - 0.5) * (this.mapSize - 28);
            this.spawnProp('barrel', x, z);
        }

        // 3. Golden Supply Crates (Power-up drops)
        this.spawnSupplyDrop(-18, -12, 'mega_vacuum');
        this.spawnSupplyDrop(24, 18, 'speed_boost');
        this.spawnSupplyDrop(8, -32, 'time_freeze');

        // 4. Urban street trees along sidewalk avenues
        for (let i = 0; i < 24; i++) {
            const x = (Math.random() - 0.5) * (this.mapSize - 24);
            const z = (Math.random() - 0.5) * (this.mapSize - 24);
            this.spawnProp('tree', x, z);
        }

        // 5. Streetlamps with ground light cones
        for (let i = 0; i < 16; i++) {
            const x = (Math.random() - 0.5) * (this.mapSize - 24);
            const z = (Math.random() - 0.5) * (this.mapSize - 24);
            this.spawnProp('streetLamp', x, z);
        }

        // 6. Large City Buses (10 buses)
        for (let i = 0; i < 10; i++) {
            const x = (Math.random() - 0.5) * (this.mapSize - 32);
            const z = (Math.random() - 0.5) * (this.mapSize - 32);
            this.spawnProp('bus', x, z);
        }
    }

    spawnSupplyDrop(x, z, supplyType = 'mega_vacuum') {
        return this.spawnProp('supplyCrate', x, z, { supplyType });
    }

    spawnProp(type, x, z, extraData = {}) {
        const group = new THREE.Group();
        let massValue = 10;
        let requiredLevel = 1;
        let radius = 0.5;
        let isExplosive = false;
        let isSupplyCrate = false;
        let supplyType = extraData.supplyType || null;

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

        } else if (type === 'barrel') {
            // Level 1: Red Explosive Fuel Barrel (Chain Reaction!)
            const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.05, 12), this.mats.barrelRed);
            drum.position.y = 0.52;
            drum.castShadow = true;

            const ring1 = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.12, 12), this.mats.barrelStripe);
            ring1.position.y = 0.75;
            const ring2 = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.12, 12), this.mats.barrelStripe);
            ring2.position.y = 0.3;
            group.add(drum, ring1, ring2);

            massValue = 35;
            requiredLevel = 1;
            radius = 0.65;
            isExplosive = true;

        } else if (type === 'supplyCrate') {
            // Level 1: Golden Supply Crate (Power-Up!)
            const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), this.mats.crateGold);
            crate.position.y = 0.6;
            crate.castShadow = true;

            const trim = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.2, 1.25), this.mats.crateTrim);
            trim.position.y = 0.6;

            // Beacon pulsing sphere
            const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), this.mats.sirenBlue);
            beacon.position.y = 1.45;
            group.add(crate, trim, beacon);

            massValue = 60;
            requiredLevel = 1;
            radius = 0.85;
            isSupplyCrate = true;

        } else if (type === 'tree') {
            // Level 2: Urban Shade Tree
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.8, 8), this.mats.trunkBrown);
            trunk.position.y = 0.9;
            const foliage = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.2, 8), this.mats.foliageGreen);
            foliage.position.y = 2.8;
            foliage.castShadow = true;
            group.add(trunk, foliage);

            massValue = 40;
            requiredLevel = 2;
            radius = 1.3;

        } else if (type === 'streetLamp') {
            // Level 2: Street Lamp Post with Ground Light Cone
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.2, 8), this.mats.metalGrey);
            pole.position.y = 2.1;
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.2), this.mats.metalGrey);
            arm.position.set(0, 4.15, 0.5);

            // Light cone on ground
            const coneGeom = new THREE.ConeGeometry(2.5, 4.0, 16, 1, true);
            coneGeom.rotateX(Math.PI);
            const lightCone = new THREE.Mesh(coneGeom, this.mats.lampGlow);
            lightCone.position.set(0, 2.0, 1.0);
            group.add(pole, arm, lightCone);

            massValue = 30;
            requiredLevel = 2;
            radius = 1.1;

        } else if (type === 'barrier') {
            // Level 2: Concrete Jersey Barrier
            const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.6), this.mats.barrierConcrete);
            b.position.y = 0.5;
            b.castShadow = true;
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
                this.policeCruisers.push({ sirenR, sirenB });
            }

            group.rotation.y = Math.random() * Math.PI;
            massValue = isPolice ? 95 : 75;
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
            isExplosive,
            isSupplyCrate,
            supplyType,
            falling: false,
            fallProgress: 0,
            fallCenter: { x: 0, z: 0 },
            vortexAngle: 0,
            dead: false
        };

        this.props.push(propObj);
        return propObj;
    }

    update(dt, hole, onSwallow) {
        // 1. Flash police sirens
        this.sirenTimer += dt * 8.0;
        const flashPhase = Math.sin(this.sirenTimer) > 0;
        for (let i = 0; i < this.policeCruisers.length; i++) {
            const pc = this.policeCruisers[i];
            pc.sirenR.visible = flashPhase;
            pc.sirenB.visible = !flashPhase;
        }

        // 2. Periodic supply drop parachute respawn
        this.supplyDropTimer -= dt;
        if (this.supplyDropTimer <= 0) {
            this.supplyDropTimer = 35.0 + Math.random() * 20;
            const dropTypes = ['mega_vacuum', 'speed_boost', 'time_freeze'];
            const chosen = dropTypes[Math.floor(Math.random() * dropTypes.length)];
            const dx = (Math.random() - 0.5) * (this.mapSize - 40);
            const dz = (Math.random() - 0.5) * (this.mapSize - 40);
            this.spawnSupplyDrop(dx, dz, chosen);
            this.pm.spawnShockwave(dx, dz, 8, 0xffd60a);
        }

        // 3. Update all devourable props
        for (let i = this.props.length - 1; i >= 0; i--) {
            const p = this.props[i];
            if (p.dead) continue;

            if (p.falling) {
                p.fallProgress += dt * 3.6;
                const prog = Math.min(p.fallProgress, 1);

                // Tangential Whirlpool Vortex Physics:
                // Spiral inward toward hole center with accelerating angular velocity
                p.vortexAngle += (10.0 + prog * 15.0) * dt;
                const distToCenter = Math.max(0.05, (1 - prog) * (p.radius * 0.8));
                p.x = p.fallCenter.x + Math.cos(p.vortexAngle) * distToCenter;
                p.z = p.fallCenter.z + Math.sin(p.vortexAngle) * distToCenter;

                p.mesh.position.x = p.x;
                p.mesh.position.z = p.z;
                p.mesh.position.y = -Math.pow(prog, 1.8) * 4.2;

                p.mesh.rotation.x += dt * 8;
                p.mesh.rotation.y += dt * 10;
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

            // Proximity check to centered hole
            const dist = Math.hypot(p.x - hole.x, p.z - hole.z);
            const holeRadius = hole.currentRadius;

            // Level gate check
            if (dist < holeRadius * 0.78) {
                if (hole.level >= p.requiredLevel) {
                    p.falling = true;
                    p.fallCenter = { x: hole.x, z: hole.z };
                    p.vortexAngle = Math.atan2(p.z - hole.z, p.x - hole.x);

                    if (p.isExplosive) {
                        this.pm.spawnExplosion(p.x, 0.4, p.z, 12);
                    } else if (p.type === 'car' || p.type === 'policeCar') {
                        this.pm.spawnSparks(p.x, 0.4, p.z, 30);
                    } else if (p.isSupplyCrate) {
                        this.pm.spawnShockwave(p.x, p.z, 6, 0xffd60a);
                    } else {
                        this.pm.spawnBurst(p.x, 0.4, p.z, 0x00f3ff, 12);
                    }
                } else {
                    // Too small! Nudge prop outward
                    const angle = Math.atan2(p.z - hole.z, p.x - hole.x);
                    p.x += Math.cos(angle) * 1.5 * dt;
                    p.z += Math.sin(angle) * 1.5 * dt;
                    p.mesh.position.set(p.x, 0, p.z);
                }
            } else if (dist < holeRadius * hole.suctionMultiplier && hole.level >= p.requiredLevel) {
                // Gravitational suction vortex pull
                const angle = Math.atan2(hole.z - p.z, hole.x - p.x);
                const force = (1 - dist / (holeRadius * hole.suctionMultiplier)) * hole.suctionForce * 0.6;
                
                // Whirlpool tangential drift
                const tangentAngle = angle + Math.PI / 2.5;
                p.x += (Math.cos(angle) * 0.85 + Math.cos(tangentAngle) * 0.35) * force * dt;
                p.z += (Math.sin(angle) * 0.85 + Math.sin(tangentAngle) * 0.35) * force * dt;
                p.mesh.position.set(p.x, 0, p.z);
                p.mesh.rotation.z = Math.sin(angle) * 0.25;
            }
        }
    }
}
