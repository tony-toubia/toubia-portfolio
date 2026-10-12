// Procedural 3D Entity Models & Logic for Void Warden
class EntityManager {
    constructor(scene, particleManager) {
        this.scene = scene;
        this.pm = particleManager;
        this.entities = [];
        this.gateZ = 22; // Sanctuary line at the bottom

        // Reusable shared materials to maximize mobile performance
        this.materials = {
            zombieGreen: new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.6 }),
            zombieClothes: new THREE.MeshStandardMaterial({ color: 0x1f3160, roughness: 0.8 }),
            zombieEyes: new THREE.MeshBasicMaterial({ color: 0xff0055 }),

            sprinterRed: new THREE.MeshStandardMaterial({ color: 0xff3366, roughness: 0.5 }),
            sprinterClothes: new THREE.MeshStandardMaterial({ color: 0x3a0ca3, roughness: 0.7 }),

            bloaterYellow: new THREE.MeshStandardMaterial({ color: 0xccff00, roughness: 0.4, emissive: 0x446600, emissiveIntensity: 0.6 }),
            bloaterPustule: new THREE.MeshStandardMaterial({ color: 0xffb703, roughness: 0.3, emissive: 0xff9900, emissiveIntensity: 0.8 }),

            bruteSkin: new THREE.MeshStandardMaterial({ color: 0x7209b7, roughness: 0.6, metalness: 0.2 }),
            bruteSpikes: new THREE.MeshStandardMaterial({ color: 0x3f37c9, roughness: 0.4 }),

            civilianSkin: new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.6 }),
            civilianClothes: new THREE.MeshStandardMaterial({ color: 0x00b4d8, roughness: 0.7 }),
            civilianCross: new THREE.MeshBasicMaterial({ color: 0xffffff })
        };
    }

    createCharacterMesh(type) {
        const group = new THREE.Group();

        if (type === 'shambler' || type === 'sprinter') {
            const isSprinter = type === 'sprinter';
            const skinMat = isSprinter ? this.materials.sprinterRed : this.materials.zombieGreen;
            const clothesMat = isSprinter ? this.materials.sprinterClothes : this.materials.zombieClothes;

            // Torso
            const torsoGeom = new THREE.BoxGeometry(0.5, 0.7, 0.3);
            const torso = new THREE.Mesh(torsoGeom, clothesMat);
            torso.position.y = 0.8;
            group.add(torso);

            // Head
            const headGeom = new THREE.BoxGeometry(0.38, 0.38, 0.38);
            const head = new THREE.Mesh(headGeom, skinMat);
            head.position.set(0, 1.35, 0.05);
            group.add(head);

            // Glowing Eyes
            const eyeGeom = new THREE.BoxGeometry(0.08, 0.06, 0.05);
            const leftEye = new THREE.Mesh(eyeGeom, this.materials.zombieEyes);
            leftEye.position.set(-0.1, 1.38, 0.24);
            const rightEye = new THREE.Mesh(eyeGeom, this.materials.zombieEyes);
            rightEye.position.set(0.1, 1.38, 0.24);
            group.add(leftEye, rightEye);

            // Arms (reaching forward)
            const armGeom = new THREE.BoxGeometry(0.15, 0.6, 0.15);
            const leftArm = new THREE.Mesh(armGeom, skinMat);
            leftArm.position.set(-0.35, 0.8, 0.2);
            leftArm.rotation.x = -Math.PI / 3;
            const rightArm = new THREE.Mesh(armGeom, skinMat);
            rightArm.position.set(0.35, 0.8, 0.2);
            rightArm.rotation.x = -Math.PI / 2.8;
            group.add(leftArm, rightArm);

            // Legs
            const legGeom = new THREE.BoxGeometry(0.18, 0.65, 0.18);
            const leftLeg = new THREE.Mesh(legGeom, clothesMat);
            leftLeg.position.set(-0.16, 0.33, 0);
            const rightLeg = new THREE.Mesh(legGeom, clothesMat);
            rightLeg.position.set(0.16, 0.33, 0);
            group.add(leftLeg, rightLeg);

            group.userData = { leftLeg, rightLeg, leftArm, rightArm, head };

        } else if (type === 'bloater') {
            // Acid Bloater: Round, bulky, bulging with glowing sacs
            const bodyGeom = new THREE.SphereGeometry(0.55, 12, 10);
            bodyGeom.scale(1, 0.9, 1.1);
            const body = new THREE.Mesh(bodyGeom, this.materials.bloaterYellow);
            body.position.y = 0.75;
            group.add(body);

            // Head (sunken into shoulders)
            const headGeom = new THREE.BoxGeometry(0.35, 0.35, 0.35);
            const head = new THREE.Mesh(headGeom, this.materials.bloaterYellow);
            head.position.set(0, 1.15, 0.2);
            group.add(head);

            // Glowing Pustules
            const pustuleGeom = new THREE.SphereGeometry(0.18, 8, 8);
            const p1 = new THREE.Mesh(pustuleGeom, this.materials.bloaterPustule);
            p1.position.set(0.35, 0.95, -0.1);
            const p2 = new THREE.Mesh(pustuleGeom, this.materials.bloaterPustule);
            p2.position.set(-0.3, 0.8, 0.3);
            const p3 = new THREE.Mesh(pustuleGeom, this.materials.bloaterPustule);
            p3.position.set(0, 1.05, -0.3);
            group.add(p1, p2, p3);

            // Stubby Legs
            const legGeom = new THREE.BoxGeometry(0.22, 0.45, 0.22);
            const leftLeg = new THREE.Mesh(legGeom, this.materials.bloaterYellow);
            leftLeg.position.set(-0.25, 0.22, 0);
            const rightLeg = new THREE.Mesh(legGeom, this.materials.bloaterYellow);
            rightLeg.position.set(0.25, 0.22, 0);
            group.add(leftLeg, rightLeg);

            group.userData = { leftLeg, rightLeg, pustules: [p1, p2, p3] };

        } else if (type === 'brute') {
            // Goliath Mutated Brute: Massive scale (2.5x size)
            const torsoGeom = new THREE.BoxGeometry(1.2, 1.4, 0.8);
            const torso = new THREE.Mesh(torsoGeom, this.materials.bruteSkin);
            torso.position.y = 1.6;
            group.add(torso);

            // Horns / Spikes on shoulders
            const spikeGeom = new THREE.ConeGeometry(0.2, 0.7, 5);
            const s1 = new THREE.Mesh(spikeGeom, this.materials.bruteSpikes);
            s1.position.set(-0.7, 2.1, 0);
            s1.rotation.z = Math.PI / 4;
            const s2 = new THREE.Mesh(spikeGeom, this.materials.bruteSpikes);
            s2.position.set(0.7, 2.1, 0);
            s2.rotation.z = -Math.PI / 4;
            group.add(s1, s2);

            // Head
            const headGeom = new THREE.BoxGeometry(0.6, 0.6, 0.6);
            const head = new THREE.Mesh(headGeom, this.materials.bruteSkin);
            head.position.set(0, 2.4, 0.2);
            group.add(head);

            // Massive Arms
            const armGeom = new THREE.BoxGeometry(0.45, 1.3, 0.45);
            const leftArm = new THREE.Mesh(armGeom, this.materials.bruteSkin);
            leftArm.position.set(-0.85, 1.4, 0.1);
            const rightArm = new THREE.Mesh(armGeom, this.materials.bruteSkin);
            rightArm.position.set(0.85, 1.4, 0.1);
            group.add(leftArm, rightArm);

            // Thick Legs
            const legGeom = new THREE.BoxGeometry(0.45, 1.0, 0.45);
            const leftLeg = new THREE.Mesh(legGeom, this.materials.bruteSkin);
            leftLeg.position.set(-0.4, 0.5, 0);
            const rightLeg = new THREE.Mesh(legGeom, this.materials.bruteSkin);
            rightLeg.position.set(0.4, 0.5, 0);
            group.add(leftLeg, rightLeg);

            group.userData = { leftLeg, rightLeg, leftArm, rightArm };

        } else if (type === 'civilian') {
            // Panicked Civilian: Blue jacket, backpack, medical / bio-hazard tag
            const torsoGeom = new THREE.BoxGeometry(0.45, 0.65, 0.28);
            const torso = new THREE.Mesh(torsoGeom, this.materials.civilianClothes);
            torso.position.y = 0.75;
            group.add(torso);

            // Backpack
            const packGeom = new THREE.BoxGeometry(0.35, 0.45, 0.2);
            const backpack = new THREE.Mesh(packGeom, new THREE.MeshStandardMaterial({ color: 0x111111 }));
            backpack.position.set(0, 0.8, -0.22);
            group.add(backpack);

            // Head
            const headGeom = new THREE.BoxGeometry(0.35, 0.35, 0.35);
            const head = new THREE.Mesh(headGeom, this.materials.civilianSkin);
            head.position.set(0, 1.25, 0);
            group.add(head);

            // White Cross on chest
            const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.02), this.materials.civilianCross);
            crossH.position.set(0, 0.85, 0.15);
            const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.02), this.materials.civilianCross);
            crossV.position.set(0, 0.85, 0.15);
            group.add(crossH, crossV);

            // Arms (flailing / running)
            const armGeom = new THREE.BoxGeometry(0.12, 0.55, 0.12);
            const leftArm = new THREE.Mesh(armGeom, this.materials.civilianClothes);
            leftArm.position.set(-0.3, 0.75, 0);
            const rightArm = new THREE.Mesh(armGeom, this.materials.civilianClothes);
            rightArm.position.set(0.3, 0.75, 0);
            group.add(leftArm, rightArm);

            // Legs
            const legGeom = new THREE.BoxGeometry(0.15, 0.55, 0.15);
            const leftLeg = new THREE.Mesh(legGeom, new THREE.MeshStandardMaterial({ color: 0x222222 }));
            leftLeg.position.set(-0.14, 0.28, 0);
            const rightLeg = new THREE.Mesh(legGeom, new THREE.MeshStandardMaterial({ color: 0x222222 }));
            rightLeg.position.set(0.14, 0.28, 0);
            group.add(leftLeg, rightLeg);

            group.userData = { leftLeg, rightLeg, leftArm, rightArm };
        }

        return group;
    }

    spawnEntity(type, x, z) {
        const mesh = this.createCharacterMesh(type);
        mesh.position.set(x, 0, z);
        this.scene.add(mesh);

        let speed = 2.0;
        let massValue = 10;
        let requiredTier = 1;
        let isZombie = true;
        let isHazard = false;
        let radius = 0.6;

        if (type === 'shambler') {
            speed = 1.6 + Math.random() * 0.4;
            massValue = 10;
            radius = 0.5;
        } else if (type === 'sprinter') {
            speed = 3.6 + Math.random() * 0.6;
            massValue = 15;
            radius = 0.5;
        } else if (type === 'bloater') {
            speed = 1.4;
            massValue = 25;
            isHazard = true;
            radius = 0.7;
        } else if (type === 'brute') {
            speed = 1.0;
            massValue = 100;
            requiredTier = 3;
            radius = 1.3;
        } else if (type === 'civilian') {
            speed = 2.4 + Math.random() * 0.4;
            massValue = -50; // Penalty
            isZombie = false;
            radius = 0.5;
        }

        const entity = {
            type,
            mesh,
            x,
            y: 0,
            z,
            speed,
            massValue,
            requiredTier,
            isZombie,
            isHazard,
            radius,
            falling: false,
            fallProgress: 0,
            fallCenter: { x: 0, z: 0 },
            walkPhase: Math.random() * Math.PI * 2,
            dead: false
        };

        this.entities.push(entity);
        return entity;
    }

    update(dt, hole, onSwallow, onGateDamage, onCivilianSaved) {
        for (let i = this.entities.length - 1; i >= 0; i--) {
            const e = this.entities[i];
            if (e.dead) continue;

            // 1. If currently falling into the void hole
            if (e.falling) {
                e.fallProgress += dt * 3.5;
                const p = Math.min(e.fallProgress, 1);

                // Spaghettification & tumble into center
                const dx = e.fallCenter.x - e.x;
                const dz = e.fallCenter.z - e.z;
                e.mesh.position.x += dx * dt * 8;
                e.mesh.position.z += dz * dt * 8;
                e.mesh.position.y = -Math.sin(p * Math.PI / 2) * 2.5;

                e.mesh.rotation.x += dt * 10;
                e.mesh.rotation.y += dt * 12;
                e.mesh.rotation.z += dt * 8;

                const s = Math.max(0.01, 1 - p * 0.9);
                e.mesh.scale.set(s, s * 1.5, s);

                if (p >= 1) {
                    this.scene.remove(e.mesh);
                    e.dead = true;
                    this.entities.splice(i, 1);
                    onSwallow(e);
                }
                continue;
            }

            // 2. Normal movement toward Sanctuary Gate (bottom z)
            const targetZ = this.gateZ;
            const targetX = e.x; // Head mostly straight down with gentle wander
            const dirZ = 1;
            const dirX = Math.sin(e.walkPhase * 0.5) * 0.15;

            e.z += dirZ * e.speed * dt;
            e.x += dirX * e.speed * dt;
            e.mesh.position.set(e.x, 0, e.z);

            // Orient facing movement direction
            e.mesh.rotation.y = Math.atan2(dirX, dirZ);

            // Animated leg/arm walk cycle
            e.walkPhase += dt * e.speed * 6;
            if (e.mesh.userData.leftLeg && e.mesh.userData.rightLeg) {
                e.mesh.userData.leftLeg.rotation.x = Math.sin(e.walkPhase) * 0.6;
                e.mesh.userData.rightLeg.rotation.x = -Math.sin(e.walkPhase) * 0.6;
            }
            if (e.mesh.userData.leftArm && e.mesh.userData.rightArm) {
                e.mesh.userData.leftArm.rotation.x = -Math.PI / 3 + Math.sin(e.walkPhase) * 0.3;
                e.mesh.userData.rightArm.rotation.x = -Math.PI / 3 - Math.sin(e.walkPhase) * 0.3;
            }

            // 3. Reached Sanctuary Gate (at gateZ)
            if (e.z >= this.gateZ - 0.5) {
                this.scene.remove(e.mesh);
                e.dead = true;
                this.entities.splice(i, 1);

                if (e.isZombie) {
                    // Attack gate!
                    const dmg = e.type === 'brute' ? 30 : (e.type === 'bloater' ? 20 : 10);
                    onGateDamage(dmg, e);
                    this.pm.spawnBurst(e.x, 0.5, this.gateZ, 0xff0055, 20);
                } else {
                    // Saved civilian!
                    onCivilianSaved(e);
                    this.pm.spawnBurst(e.x, 0.5, this.gateZ, 0x00ff88, 15);
                }
                continue;
            }

            // 4. Hole Suction & Collision check
            const distToHole = Math.hypot(e.x - hole.x, e.z - hole.z);
            const holeRadius = hole.currentRadius;

            // Gravitational suction within pull perimeter
            if (distToHole < holeRadius * hole.suctionMultiplier && distToHole > holeRadius * 0.4) {
                const pullAngle = Math.atan2(hole.z - e.z, hole.x - e.x);
                const pullPower = (1 - distToHole / (holeRadius * hole.suctionMultiplier)) * hole.suctionForce;

                // Repulsor perk or ability check for civilians
                if (!e.isZombie && hole.hasCivilianRepulsor) {
                    // Repel civilian AWAY from hole!
                    e.x -= Math.cos(pullAngle) * pullPower * 2.0 * dt;
                    e.z -= Math.sin(pullAngle) * pullPower * 2.0 * dt;
                } else {
                    // Pull toward hole center
                    e.x += Math.cos(pullAngle) * pullPower * dt;
                    e.z += Math.sin(pullAngle) * pullPower * dt;
                }
            }

            // Plunge into hole check
            if (distToHole < holeRadius * 0.75) {
                // Tier Gating for Brute
                if (e.type === 'brute' && hole.tier < e.requiredTier) {
                    // Brute is too big! Stomp player and bounce hole
                    hole.stumble(e.x, e.z);
                    this.pm.spawnShockwave(e.x, e.z, 4, 0x9d4edd);
                    continue;
                }

                // Begin plunging into void!
                e.falling = true;
                e.fallCenter = { x: hole.x, z: hole.z };
                this.pm.spawnBurst(e.x, 0.1, e.z, e.isZombie ? (e.isHazard ? 0xccff00 : 0x00f3ff) : 0xff3366, 10);
            }
        }
    }

    clear() {
        this.entities.forEach(e => {
            this.scene.remove(e.mesh);
        });
        this.entities = [];
    }
}
