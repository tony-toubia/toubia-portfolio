// 3D Zombie Swarm & Titan Boss Manager for Void Warden
class ZombieManager {
    constructor(scene, particleManager) {
        this.scene = scene;
        this.pm = particleManager;
        this.zombies = [];
        this.maxZombies = 160; // 160 active wandering zombies across the city
        this.mapSize = 130;

        // Slime trail interval
        this.slimeTimer = 0;

        this.initMaterials();
        this.populateInitialSwarms();
    }

    initMaterials() {
        this.mats = {
            crawlerSkin: new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.8 }),
            walkerSkin: new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.6 }),
            walkerClothes: new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 }),
            sprinterSkin: new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.5 }),
            bloaterSkin: new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.4, emissive: 0x365314, emissiveIntensity: 0.4 }),
            bossSkin: new THREE.MeshStandardMaterial({ color: 0x6b21a8, roughness: 0.5, metalness: 0.3 }),
            bossHorns: new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.3 }),
            eyesRed: new THREE.MeshBasicMaterial({ color: 0xff0055 }),
            eyesFreeze: new THREE.MeshBasicMaterial({ color: 0x00f3ff })
        };
    }

    createZombieMesh(type) {
        const group = new THREE.Group();

        if (type === 'crawler') {
            // Level 1: Flat crawler dragging itself
            const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.6), this.mats.crawlerSkin);
            torso.position.y = 0.15;
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), this.mats.crawlerSkin);
            head.position.set(0, 0.22, 0.4);
            const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.45), this.mats.crawlerSkin);
            armL.position.set(-0.3, 0.1, 0.2);
            const armR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.45), this.mats.crawlerSkin);
            armR.position.set(0.3, 0.1, 0.2);
            group.add(torso, head, armL, armR);
            group.userData = { armL, armR };

        } else if (type === 'walker' || type === 'sprinter') {
            const isSprinter = type === 'sprinter';
            const skin = isSprinter ? this.mats.sprinterSkin : this.mats.walkerSkin;

            // Torso
            const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), this.mats.walkerClothes);
            torso.position.y = 0.8;

            // Head & Eyes
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skin);
            head.position.set(0, 1.35, 0.05);
            const eye1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.05), this.mats.eyesRed);
            eye1.position.set(-0.1, 1.38, 0.24);
            const eye2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.05), this.mats.eyesRed);
            eye2.position.set(0.1, 1.38, 0.24);

            // Reaching Arms
            const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), skin);
            armL.position.set(-0.35, 0.8, 0.2);
            armL.rotation.x = -Math.PI / 2.8;
            const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), skin);
            armR.position.set(0.35, 0.8, 0.2);
            armR.rotation.x = -Math.PI / 2.6;

            // Legs
            const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.18), this.mats.walkerClothes);
            legL.position.set(-0.16, 0.33, 0);
            const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.18), this.mats.walkerClothes);
            legR.position.set(0.16, 0.33, 0);

            group.add(torso, head, eye1, eye2, armL, armR, legL, legR);
            group.userData = { legL, legR, armL, armR };

        } else if (type === 'bloater') {
            // Level 3: Fat Toxic Bloater
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 8), this.mats.bloaterSkin);
            body.scale.set(1.1, 0.9, 1.1);
            body.position.y = 0.8;

            const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), this.mats.bloaterSkin);
            head.position.set(0, 1.25, 0.2);

            const legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.45, 0.25), this.mats.bloaterSkin);
            legL.position.set(-0.25, 0.22, 0);
            const legR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.45, 0.25), this.mats.bloaterSkin);
            legR.position.set(0.25, 0.22, 0);

            group.add(body, head, legL, legR);
            group.userData = { legL, legR };

        } else if (type === 'boss') {
            // Level 4: Goliath Abomination Titan (2.8x scale)
            const torso = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1.1), this.mats.bossSkin);
            torso.position.y = 1.9;

            // Spikes/Horns
            const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.9, 6), this.mats.bossHorns);
            hornL.position.set(-0.9, 2.7, 0);
            hornL.rotation.z = Math.PI / 4;
            const hornR = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.9, 6), this.mats.bossHorns);
            hornR.position.set(0.9, 2.7, 0);
            hornR.rotation.z = -Math.PI / 4;

            const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), this.mats.bossSkin);
            head.position.set(0, 2.9, 0.2);

            const armL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.5), this.mats.bossSkin);
            armL.position.set(-1.1, 1.7, 0.2);
            const armR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.5), this.mats.bossSkin);
            armR.position.set(1.1, 1.7, 0.2);

            const legL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), this.mats.bossSkin);
            legL.position.set(-0.5, 0.6, 0);
            const legR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), this.mats.bossSkin);
            legR.position.set(0.5, 0.6, 0);

            group.add(torso, head, hornL, hornR, armL, armR, legL, legR);
            group.userData = { legL, legR, armL, armR };
        }

        return group;
    }

    spawnZombie(type, x, z) {
        const mesh = this.createZombieMesh(type);
        mesh.position.set(x, 0, z);
        this.scene.add(mesh);

        let speed = 1.5;
        let massXP = 10;
        let requiredLevel = 1;
        let radius = 0.5;

        if (type === 'crawler') {
            speed = 0.9;
            massXP = 8;
            requiredLevel = 1;
            radius = 0.45;
        } else if (type === 'walker') {
            speed = 1.6 + Math.random() * 0.5;
            massXP = 15;
            requiredLevel = 2;
            radius = 0.6;
        } else if (type === 'sprinter') {
            speed = 3.8 + Math.random() * 0.8;
            massXP = 25;
            requiredLevel = 2;
            radius = 0.6;
        } else if (type === 'bloater') {
            speed = 1.2;
            massXP = 45;
            requiredLevel = 3;
            radius = 1.1;
        } else if (type === 'boss') {
            speed = 1.1;
            massXP = 300;
            requiredLevel = 4;
            radius = 2.4;
        }

        const zombie = {
            type,
            mesh,
            x,
            y: 0,
            z,
            speed,
            massXP,
            requiredLevel,
            radius,
            moveAngle: Math.random() * Math.PI * 2,
            animPhase: Math.random() * 10,
            falling: false,
            fallProgress: 0,
            fallCenter: { x: 0, z: 0 },
            vortexAngle: 0,
            dead: false
        };

        this.zombies.push(zombie);
        return zombie;
    }

    populateInitialSwarms() {
        for (let i = 0; i < 40; i++) {
            const x = (Math.random() - 0.5) * this.mapSize;
            const z = (Math.random() - 0.5) * this.mapSize;
            this.spawnZombie('crawler', x, z);
        }

        for (let i = 0; i < 70; i++) {
            const x = (Math.random() - 0.5) * this.mapSize;
            const z = (Math.random() - 0.5) * this.mapSize;
            this.spawnZombie('walker', x, z);
        }

        for (let i = 0; i < 30; i++) {
            const x = (Math.random() - 0.5) * this.mapSize;
            const z = (Math.random() - 0.5) * this.mapSize;
            this.spawnZombie('sprinter', x, z);
        }

        for (let i = 0; i < 15; i++) {
            const x = (Math.random() - 0.5) * this.mapSize;
            const z = (Math.random() - 0.5) * this.mapSize;
            this.spawnZombie('bloater', x, z);
        }

        // Spawn 3 wandering Goliath Titans
        this.spawnZombie('boss', -25, -20);
        this.spawnZombie('boss', 35, 15);
        this.spawnZombie('boss', 10, -45);
    }

    obliterateZombiesInRadius(originX, originZ, radius, onSwallow) {
        let count = 0;
        for (let i = this.zombies.length - 1; i >= 0; i--) {
            const z = this.zombies[i];
            if (z.dead || z.falling) continue;

            const dist = Math.hypot(z.x - originX, z.z - originZ);
            if (dist <= radius) {
                // If boss, deal partial damage or devour if low
                if (z.type === 'boss' && dist > radius * 0.5) {
                    continue;
                }
                z.falling = true;
                z.fallCenter = { x: originX, z: originZ };
                z.vortexAngle = Math.atan2(z.z - originZ, z.x - originX);
                this.pm.spawnBurst(z.x, 0.4, z.z, 0xff3b30, 16);
                count++;
            }
        }
        return count;
    }

    update(dt, hole, onSwallow, isFrozen = false) {
        // Crawler toxic slime trail
        this.slimeTimer += dt;
        if (this.slimeTimer > 0.4) {
            this.slimeTimer = 0;
            for (let i = 0; i < this.zombies.length; i += 4) {
                const z = this.zombies[i];
                if (z.type === 'crawler' && !z.falling && !z.dead) {
                    this.pm.spawnToxicSplatter(z.x, 0.05, z.z, 2);
                }
            }
        }

        // Respawn if count is low
        if (this.zombies.length < this.maxZombies) {
            const spawnAngle = Math.random() * Math.PI * 2;
            const spawnDist = 35 + Math.random() * 25;
            const sx = hole.x + Math.cos(spawnAngle) * spawnDist;
            const sz = hole.z + Math.sin(spawnAngle) * spawnDist;

            const rand = Math.random();
            const type = rand < 0.3 ? 'crawler' : (rand < 0.7 ? 'walker' : (rand < 0.9 ? 'sprinter' : 'bloater'));
            this.spawnZombie(type, sx, sz);
        }

        for (let i = this.zombies.length - 1; i >= 0; i--) {
            const z = this.zombies[i];
            if (z.dead) continue;

            // 1. Tangential Whirlpool Vortex Physics:
            if (z.falling) {
                z.fallProgress += dt * 3.8;
                const prog = Math.min(z.fallProgress, 1);

                // Spiraling inward toward center
                z.vortexAngle += (12.0 + prog * 18.0) * dt;
                const distToCenter = Math.max(0.04, (1 - prog) * (z.radius * 0.9));
                z.x = z.fallCenter.x + Math.cos(z.vortexAngle) * distToCenter;
                z.z = z.fallCenter.z + Math.sin(z.vortexAngle) * distToCenter;

                z.mesh.position.x = z.x;
                z.mesh.position.z = z.z;
                z.mesh.position.y = -Math.pow(prog, 1.8) * 4.0;

                z.mesh.rotation.y += dt * 20;
                z.mesh.rotation.x += dt * 8;
                z.mesh.rotation.z += dt * 10;

                // Spaghettification stretching effect into the singularity
                const scale = Math.max(0.01, 1 - prog * 0.95);
                z.mesh.scale.set(scale * 0.7, scale * 1.6, scale * 0.7);

                if (prog >= 1) {
                    this.scene.remove(z.mesh);
                    z.dead = true;
                    this.zombies.splice(i, 1);
                    onSwallow(z);
                }
                continue;
            }

            // 2. Swarm movement / AI wander
            const distToHole = Math.hypot(z.x - hole.x, z.z - hole.z);
            const holeRadius = hole.currentRadius;

            if (!isFrozen) {
                if (distToHole < 18) {
                    if (hole.level >= z.requiredLevel) {
                        // Zombie flees from expanding singularity
                        z.moveAngle = Math.atan2(z.z - hole.z, z.x - hole.x);
                    } else if (z.type === 'boss' || z.type === 'sprinter') {
                        // Aggressive zombie hunts the small hole
                        z.moveAngle = Math.atan2(hole.z - z.z, hole.x - z.x);
                    }
                } else {
                    if (Math.random() < 0.02) {
                        z.moveAngle += (Math.random() - 0.5) * 1.5;
                    }
                }

                // Move zombie
                z.x += Math.cos(z.moveAngle) * z.speed * dt;
                z.z += Math.sin(z.moveAngle) * z.speed * dt;
                z.mesh.position.set(z.x, 0, z.z);
                z.mesh.rotation.y = -z.moveAngle + Math.PI / 2;

                // Walk animation
                z.animPhase += dt * z.speed * 6;
                if (z.mesh.userData.legL && z.mesh.userData.legR) {
                    z.mesh.userData.legL.rotation.x = Math.sin(z.animPhase) * 0.7;
                    z.mesh.userData.legR.rotation.x = -Math.sin(z.animPhase) * 0.7;
                }
            } else {
                // Frozen in ice! Tremble slightly
                z.mesh.position.set(z.x + (Math.random() - 0.5) * 0.02, 0, z.z + (Math.random() - 0.5) * 0.02);
            }

            // 3. Suction & Devour check
            if (distToHole < holeRadius * 0.78) {
                if (hole.level >= z.requiredLevel) {
                    z.falling = true;
                    z.fallCenter = { x: hole.x, z: hole.z };
                    z.vortexAngle = Math.atan2(z.z - hole.z, z.x - hole.x);

                    if (z.type === 'bloater') {
                        this.pm.spawnToxicSplatter(z.x, 0.4, z.z, 20);
                        this.pm.spawnShockwave(z.x, z.z, 5, 0x84cc16);
                    } else if (z.type === 'boss') {
                        this.pm.spawnBurst(z.x, 0.6, z.z, 0x9d4edd, 40, 7);
                        this.pm.spawnShockwave(z.x, z.z, 14, 0x9d4edd);
                    } else {
                        this.pm.spawnBurst(z.x, 0.4, z.z, 0x00f3ff, 12);
                    }
                } else {
                    // Too small! Boss titan stomps back
                    if (z.type === 'boss') {
                        hole.stumble(z.x, z.z);
                        this.pm.spawnShockwave(z.x, z.z, 6, 0x9d4edd);
                        window.audioManager.playBossRoar();
                    }
                }
            } else if (distToHole < holeRadius * hole.suctionMultiplier && hole.level >= z.requiredLevel) {
                // Gravitational whirlpool suction
                const pullAngle = Math.atan2(hole.z - z.z, hole.x - z.x);
                const tangentAngle = pullAngle + Math.PI / 2.3;
                const pullPower = (1 - distToHole / (holeRadius * hole.suctionMultiplier)) * hole.suctionForce;

                z.x += (Math.cos(pullAngle) * 0.85 + Math.cos(tangentAngle) * 0.35) * pullPower * dt;
                z.z += (Math.sin(pullAngle) * 0.85 + Math.sin(tangentAngle) * 0.35) * pullPower * dt;
                z.mesh.position.set(z.x, 0, z.z);
                z.mesh.rotation.x = Math.sin(pullAngle) * 0.35;
            }
        }
    }
}
