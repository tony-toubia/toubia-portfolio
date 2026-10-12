// Void Hole (Player) with Dynamic 3D Abyss and Level Scaling
class VoidHole {
    constructor(scene, particleManager) {
        this.scene = scene;
        this.pm = particleManager;

        // Position & Kinematics
        this.x = 0;
        this.z = 0;
        this.vx = 0;
        this.vz = 0;
        this.baseSpeed = 19.0;
        this.currentSpeed = 19.0;
        this.friction = 0.88;

        // Level & Mass Progression
        this.level = 1;
        this.maxLevel = 5;
        this.massXP = 0;
        // XP thresholds for levels 1 to 5
        this.levelThresholds = [0, 80, 260, 650, 1500, 99999];
        this.levelRadii = [1.15, 1.85, 2.9, 4.3, 6.2];
        this.currentRadius = this.levelRadii[0];
        this.targetRadius = this.levelRadii[0];

        // Suction properties
        this.suctionMultiplier = 1.9;
        this.suctionForce = 9.0;
        this.massMultiplier = 1.0;

        // Status effects & Power-ups
        this.stunTimer = 0;
        this.supernovaActive = false;
        this.supernovaTimer = 0;
        this.speedBoostTimer = 0;
        this.vacuumBoostTimer = 0;

        // Build 3D Mesh
        this.group = new THREE.Group();
        this.buildMesh();
        this.scene.add(this.group);
    }

    buildMesh() {
        // 1. Deep Pitch-Black Hole Center (Event Horizon Disc)
        const voidGeom = new THREE.CircleGeometry(1, 48);
        voidGeom.rotateX(-Math.PI / 2);
        const voidMat = new THREE.MeshBasicMaterial({
            color: 0x010204,
            depthWrite: true
        });
        this.voidDisc = new THREE.Mesh(voidGeom, voidMat);
        this.voidDisc.position.y = 0.02;
        this.group.add(this.voidDisc);

        // 2. Glowing Event Horizon Accretion Disk (Outer ring)
        const outerRingGeom = new THREE.RingGeometry(0.92, 1.22, 64);
        outerRingGeom.rotateX(-Math.PI / 2);
        this.outerRingMat = new THREE.MeshBasicMaterial({
            color: 0x00f3ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.88,
            blending: THREE.AdditiveBlending
        });
        this.outerRing = new THREE.Mesh(outerRingGeom, this.outerRingMat);
        this.outerRing.position.y = 0.03;
        this.group.add(this.outerRing);

        // 3. Counter-rotating inner vortex ring
        const innerRingGeom = new THREE.RingGeometry(0.72, 0.95, 48);
        innerRingGeom.rotateX(-Math.PI / 2);
        this.innerRingMat = new THREE.MeshBasicMaterial({
            color: 0x9d4edd,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.80,
            blending: THREE.AdditiveBlending
        });
        this.innerRing = new THREE.Mesh(innerRingGeom, this.innerRingMat);
        this.innerRing.position.y = 0.035;
        this.group.add(this.innerRing);

        // 4. Inverted Volumetric 3D Cylinder Pit (Visible depth into the floor)
        const pitGeom = new THREE.CylinderGeometry(1, 0.3, 4.2, 36, 1, true);
        const pitMat = new THREE.MeshBasicMaterial({
            color: 0x010206,
            side: THREE.BackSide
        });
        this.pitMesh = new THREE.Mesh(pitGeom, pitMat);
        this.pitMesh.position.y = -2.1;
        this.group.add(this.pitMesh);

        this.updateScale();
    }

    updateScale() {
        const r = this.currentRadius;
        this.group.scale.set(r, 1, r);
    }

    addMass(amount) {
        const earned = Math.round(amount * this.massMultiplier);
        this.massXP += earned;

        // Check Level-Up
        let leveledUp = false;
        while (this.level < this.maxLevel && this.massXP >= this.levelThresholds[this.level]) {
            this.level++;
            leveledUp = true;
            this.targetRadius = this.levelRadii[this.level - 1];
            this.suctionMultiplier = 1.9 + (this.level - 1) * 0.18;
            this.suctionForce = 9.0 + (this.level - 1) * 2.4;
        }

        // Sub-level smooth expansion
        if (!leveledUp && this.level < this.maxLevel) {
            const prevXP = this.levelThresholds[this.level - 1];
            const nextXP = this.levelThresholds[this.level];
            const progress = (this.massXP - prevXP) / (nextXP - prevXP);
            const baseR = this.levelRadii[this.level - 1];
            const nextR = this.levelRadii[this.level];
            this.targetRadius = baseR + progress * (nextR - baseR) * 0.45;
        }

        return { leveledUp, newLevel: this.level, earnedXP: earned };
    }

    stumble(hitX, hitZ) {
        this.stunTimer = 0.45;
        const angle = Math.atan2(this.z - hitZ, this.x - hitX);
        this.vx = Math.cos(angle) * 16;
        this.vz = Math.sin(angle) * 16;
        window.audioManager.playBruteStomp();
    }

    triggerSupernova() {
        this.supernovaActive = true;
        this.supernovaTimer = 4.5;
        this.pm.spawnShockwave(this.x, this.z, this.currentRadius * 4.5, 0x00f3ff);
        window.audioManager.playSingularity();
    }

    applyPowerUp(type) {
        if (type === 'mega_vacuum') {
            this.vacuumBoostTimer = 10.0;
            this.pm.spawnShockwave(this.x, this.z, this.currentRadius * 3, 0x00f3ff);
        } else if (type === 'speed_boost') {
            this.speedBoostTimer = 10.0;
            this.pm.spawnShockwave(this.x, this.z, this.currentRadius * 3, 0xffd60a);
        }
    }

    move(inputX, inputZ, dt) {
        if (this.stunTimer > 0) return;

        let speed = this.baseSpeed;
        if (this.supernovaActive) speed *= 1.35;
        if (this.speedBoostTimer > 0) speed *= 1.7;

        this.vx += inputX * speed * 5.2 * dt;
        this.vz += inputZ * speed * 5.2 * dt;
    }

    update(dt) {
        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
        }

        // Active timers
        if (this.speedBoostTimer > 0) {
            this.speedBoostTimer -= dt;
        }
        if (this.vacuumBoostTimer > 0) {
            this.vacuumBoostTimer -= dt;
        }

        // Color and suction force calculations
        if (this.supernovaActive) {
            this.supernovaTimer -= dt;
            this.suctionMultiplier = 3.4;
            this.suctionForce = 24.0;
            this.outerRingMat.color.setHex(0xff007f);
            this.innerRingMat.color.setHex(0x00f3ff);
            if (this.supernovaTimer <= 0) {
                this.supernovaActive = false;
                this.suctionMultiplier = 1.9 + (this.level - 1) * 0.18;
                this.suctionForce = 9.0 + (this.level - 1) * 2.4;
            }
        } else if (this.vacuumBoostTimer > 0) {
            this.suctionMultiplier = 3.0;
            this.suctionForce = 20.0;
            this.outerRingMat.color.setHex(0x00f3ff);
            this.innerRingMat.color.setHex(0x00ff88);
        } else if (this.speedBoostTimer > 0) {
            this.outerRingMat.color.setHex(0xffd60a);
            this.innerRingMat.color.setHex(0xff9100);
        } else {
            this.suctionMultiplier = 1.9 + (this.level - 1) * 0.18;
            this.suctionForce = 9.0 + (this.level - 1) * 2.4;
            this.outerRingMat.color.setHex(0x00f3ff);
            this.innerRingMat.color.setHex(0x9d4edd);
        }

        // Velocity integration
        this.x += this.vx * dt;
        this.z += this.vz * dt;
        this.vx *= Math.pow(this.friction, dt * 60);
        this.vz *= Math.pow(this.friction, dt * 60);

        // Clamp strictly to city boundaries inside laser fence (-62 to +62)
        const bound = 62;
        this.x = Math.max(-bound, Math.min(bound, this.x));
        this.z = Math.max(-bound, Math.min(bound, this.z));

        // Smooth radius transition
        this.currentRadius += (this.targetRadius - this.currentRadius) * dt * 5.5;
        this.updateScale();

        // Rotate vortex rings
        const spin = this.supernovaActive ? 9.5 : (this.vacuumBoostTimer > 0 ? 7.0 : 3.2);
        this.outerRing.rotation.z += spin * dt;
        this.innerRing.rotation.z -= (spin * 1.5) * dt;

        this.group.position.set(this.x, 0, this.z);
    }

    reset() {
        this.x = 0;
        this.z = 0;
        this.vx = 0;
        this.vz = 0;
        this.level = 1;
        this.massXP = 0;
        this.targetRadius = this.levelRadii[0];
        this.currentRadius = this.levelRadii[0];
        this.stunTimer = 0;
        this.supernovaActive = false;
        this.speedBoostTimer = 0;
        this.vacuumBoostTimer = 0;
        this.massMultiplier = 1.0;
        this.suctionMultiplier = 1.9;
        this.suctionForce = 9.0;
        this.updateScale();
    }
}
