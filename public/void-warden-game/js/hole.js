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
        this.baseSpeed = 18.0;
        this.currentSpeed = 18.0;
        this.friction = 0.88;

        // Level & Mass Progression
        this.level = 1;
        this.maxLevel = 5;
        this.massXP = 0;
        // XP required for each level
        this.levelThresholds = [0, 80, 260, 650, 1500, 99999];
        this.levelRadii = [1.15, 1.85, 2.9, 4.3, 6.2];
        this.currentRadius = this.levelRadii[0];
        this.targetRadius = this.levelRadii[0];

        // Suction properties
        this.suctionMultiplier = 1.9;
        this.suctionForce = 8.5;
        this.massMultiplier = 1.0;

        // Status effects
        this.stunTimer = 0;
        this.supernovaActive = false;
        this.supernovaTimer = 0;

        // Build 3D Mesh
        this.group = new THREE.Group();
        this.buildMesh();
        this.scene.add(this.group);
    }

    buildMesh() {
        // 1. Deep Pitch-Black Hole Center
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
        const outerRingGeom = new THREE.RingGeometry(0.92, 1.18, 64);
        outerRingGeom.rotateX(-Math.PI / 2);
        this.outerRingMat = new THREE.MeshBasicMaterial({
            color: 0x00f3ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        });
        this.outerRing = new THREE.Mesh(outerRingGeom, this.outerRingMat);
        this.outerRing.position.y = 0.03;
        this.group.add(this.outerRing);

        // 3. Counter-rotating inner purple vortex ring
        const innerRingGeom = new THREE.RingGeometry(0.75, 0.95, 48);
        innerRingGeom.rotateX(-Math.PI / 2);
        this.innerRingMat = new THREE.MeshBasicMaterial({
            color: 0x9d4edd,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending
        });
        this.innerRing = new THREE.Mesh(innerRingGeom, this.innerRingMat);
        this.innerRing.position.y = 0.035;
        this.group.add(this.innerRing);

        // 4. Inverted Volumetric 3D Cylinder Pit (Visible depth into the floor)
        const pitGeom = new THREE.CylinderGeometry(1, 0.35, 3.5, 36, 1, true);
        const pitMat = new THREE.MeshBasicMaterial({
            color: 0x02030a,
            side: THREE.BackSide
        });
        this.pitMesh = new THREE.Mesh(pitGeom, pitMat);
        this.pitMesh.position.y = -1.75;
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
            this.suctionMultiplier = 1.9 + (this.level - 1) * 0.15;
            this.suctionForce = 8.5 + (this.level - 1) * 2.2;
        }

        // Sub-level smooth expansion
        if (!leveledUp && this.level < this.maxLevel) {
            const prevXP = this.levelThresholds[this.level - 1];
            const nextXP = this.levelThresholds[this.level];
            const progress = (this.massXP - prevXP) / (nextXP - prevXP);
            const baseR = this.levelRadii[this.level - 1];
            const nextR = this.levelRadii[this.level];
            this.targetRadius = baseR + progress * (nextR - baseR) * 0.4;
        }

        return { leveledUp, newLevel: this.level, earnedXP: earned };
    }

    stumble(hitX, hitZ) {
        this.stunTimer = 0.45;
        const angle = Math.atan2(this.z - hitZ, this.x - hitX);
        this.vx = Math.cos(angle) * 14;
        this.vz = Math.sin(angle) * 14;
        window.audioManager.playBruteStomp();
    }

    triggerSupernova() {
        this.supernovaActive = true;
        this.supernovaTimer = 4.0;
        this.pm.spawnShockwave(this.x, this.z, this.currentRadius * 4, 0x00f3ff);
        window.audioManager.playSingularity();
    }

    move(inputX, inputZ, dt) {
        if (this.stunTimer > 0) return;

        let speed = this.baseSpeed;
        if (this.supernovaActive) speed *= 1.3;

        this.vx += inputX * speed * 5.0 * dt;
        this.vz += inputZ * speed * 5.0 * dt;
    }

    update(dt) {
        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
        }

        if (this.supernovaActive) {
            this.supernovaTimer -= dt;
            this.suctionMultiplier = 3.2;
            this.suctionForce = 22.0;
            this.outerRingMat.color.setHex(0xff007f);
            this.innerRingMat.color.setHex(0x00f3ff);
            if (this.supernovaTimer <= 0) {
                this.supernovaActive = false;
                this.suctionMultiplier = 1.9 + (this.level - 1) * 0.15;
                this.suctionForce = 8.5 + (this.level - 1) * 2.2;
            }
        } else {
            this.outerRingMat.color.setHex(0x00f3ff);
            this.innerRingMat.color.setHex(0x9d4edd);
        }

        // Velocity integration
        this.x += this.vx * dt;
        this.z += this.vz * dt;
        this.vx *= Math.pow(this.friction, dt * 60);
        this.vz *= Math.pow(this.friction, dt * 60);

        // Clamp to city boundaries
        const bound = 62;
        this.x = Math.max(-bound, Math.min(bound, this.x));
        this.z = Math.max(-bound, Math.min(bound, this.z));

        // Smooth radius transition
        this.currentRadius += (this.targetRadius - this.currentRadius) * dt * 5.5;
        this.updateScale();

        // Rotate rings
        const spin = this.supernovaActive ? 9.0 : 3.0;
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
        this.massMultiplier = 1.0;
        this.suctionMultiplier = 1.9;
        this.suctionForce = 8.5;
        this.updateScale();
    }
}
