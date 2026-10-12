// Void Hole (Player) Mechanics & Rendering for Void Warden
class VoidHole {
    constructor(scene, particleManager) {
        this.scene = scene;
        this.pm = particleManager;

        // Position & physics
        this.x = 0;
        this.z = 10;
        this.vx = 0;
        this.vz = 0;
        this.baseSpeed = 16.0;
        this.currentSpeed = 16.0;
        this.friction = 0.88;

        // Growth & Tiers
        this.tier = 1;
        this.mass = 0;
        this.tierThresholds = [0, 250, 750]; // Tier 1, 2, 3
        this.baseRadius = 1.35;
        this.currentRadius = this.baseRadius;
        this.targetRadius = this.baseRadius;

        // Suction properties
        this.suctionMultiplier = 1.8;
        this.suctionForce = 7.5;
        this.hasCivilianRepulsor = false;

        // Status effects
        this.stunnedTimer = 0;
        this.acidTimer = 0;
        this.singularityActive = false;
        this.singularityTimer = 0;

        // Build 3D Visual Mesh
        this.group = new THREE.Group();
        this.buildMesh();
        this.scene.add(this.group);
    }

    buildMesh() {
        // 1. Dark Void Abyss Center
        const voidGeom = new THREE.CircleGeometry(1, 32);
        voidGeom.rotateX(-Math.PI / 2);
        const voidMat = new THREE.MeshBasicMaterial({
            color: 0x010206,
            depthWrite: true
        });
        this.voidDisc = new THREE.Mesh(voidGeom, voidMat);
        this.voidDisc.position.y = 0.02;
        this.group.add(this.voidDisc);

        // 2. Swirling Event Horizon Ring (Outer neon)
        const ringGeom = new THREE.RingGeometry(0.92, 1.15, 48);
        ringGeom.rotateX(-Math.PI / 2);
        this.ringMat = new THREE.MeshBasicMaterial({
            color: 0x00f3ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        });
        this.ringMesh = new THREE.Mesh(ringGeom, this.ringMat);
        this.ringMesh.position.y = 0.03;
        this.group.add(this.ringMesh);

        // 3. Counter-rotating inner purple ring
        const innerRingGeom = new THREE.RingGeometry(0.75, 0.95, 36);
        innerRingGeom.rotateX(-Math.PI / 2);
        this.innerRingMat = new THREE.MeshBasicMaterial({
            color: 0x9d4edd,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending
        });
        this.innerRingMesh = new THREE.Mesh(innerRingGeom, this.innerRingMat);
        this.innerRingMesh.position.y = 0.035;
        this.group.add(this.innerRingMesh);

        // 4. Inverted Under-Ground Cylinder (The deep 3D Pit)
        const pitGeom = new THREE.CylinderGeometry(1, 0.4, 2.5, 32, 1, true);
        const pitMat = new THREE.MeshBasicMaterial({
            color: 0x02030a,
            side: THREE.BackSide
        });
        this.pitMesh = new THREE.Mesh(pitGeom, pitMat);
        this.pitMesh.position.y = -1.25;
        this.group.add(this.pitMesh);

        // Update initial scale
        this.group.position.set(this.x, 0, this.z);
        this.updateMeshScale();
    }

    updateMeshScale() {
        const r = this.currentRadius;
        this.group.scale.set(r, 1, r);
    }

    addMass(amount) {
        this.mass = Math.max(0, this.mass + amount);

        // Check Tier Upgrades
        let newTier = 1;
        if (this.mass >= this.tierThresholds[2]) {
            newTier = 3;
        } else if (this.mass >= this.tierThresholds[1]) {
            newTier = 2;
        }

        const tierChanged = newTier !== this.tier;
        this.tier = newTier;

        // Dynamic Radius Calculation
        if (this.tier === 1) {
            this.targetRadius = this.baseRadius + (this.mass / this.tierThresholds[1]) * 0.55;
        } else if (this.tier === 2) {
            const t2Progress = (this.mass - this.tierThresholds[1]) / (this.tierThresholds[2] - this.tierThresholds[1]);
            this.targetRadius = 1.9 + t2Progress * 0.8;
        } else {
            const t3Progress = Math.min((this.mass - this.tierThresholds[2]) / 1000, 1.0);
            this.targetRadius = 2.7 + t3Progress * 0.8;
        }

        return tierChanged;
    }

    applyAcidIndigestion() {
        this.acidTimer = 3.0; // 3 seconds of acid indigestion
        this.mass = Math.max(0, this.mass - 40);
        this.targetRadius = Math.max(this.baseRadius, this.targetRadius * 0.85);
        this.pm.spawnShockwave(this.x, this.z, this.currentRadius * 2, 0xccff00);
    }

    stumble(hitX, hitZ) {
        this.stunnedTimer = 0.55;
        // Knockback away from collision
        const angle = Math.atan2(this.z - hitZ, this.x - hitX);
        this.vx = Math.cos(angle) * 12;
        this.vz = Math.sin(angle) * 12;
        window.audioManager.playBruteStomp();
    }

    triggerSingularity() {
        this.singularityActive = true;
        this.singularityTimer = 4.0;
        this.pm.spawnShockwave(this.x, this.z, this.currentRadius * 4, 0x00f3ff);
        window.audioManager.playSingularity();
    }

    move(inputX, inputZ, dt) {
        if (this.stunnedTimer > 0) return; // Stunned by brute

        let speed = this.baseSpeed;
        if (this.acidTimer > 0) speed *= 0.6; // Acid slow
        if (this.singularityActive) speed *= 1.25; // Speed boost during singularity

        this.vx += inputX * speed * 4.5 * dt;
        this.vz += inputZ * speed * 4.5 * dt;
    }

    update(dt) {
        // Handle Timers
        if (this.stunnedTimer > 0) {
            this.stunnedTimer -= dt;
        }

        if (this.acidTimer > 0) {
            this.acidTimer -= dt;
            // Corrosive flashing colors
            this.ringMat.color.setHex(0xccff00);
            this.innerRingMat.color.setHex(0xffb703);
        } else if (this.singularityActive) {
            // Singularity glowing blue/magenta
            this.ringMat.color.setHex(0xff007f);
            this.innerRingMat.color.setHex(0x00f3ff);
        } else {
            // Standard ethereal cyan/purple
            this.ringMat.color.setHex(0x00f3ff);
            this.innerRingMat.color.setHex(0x9d4edd);
        }

        if (this.singularityActive) {
            this.singularityTimer -= dt;
            this.suctionMultiplier = 2.8;
            this.suctionForce = 18.0;
            if (this.singularityTimer <= 0) {
                this.singularityActive = false;
                this.suctionMultiplier = 1.8;
                this.suctionForce = 7.5;
            }
        }

        // Physics velocity integration
        this.x += this.vx * dt;
        this.z += this.vz * dt;
        this.vx *= Math.pow(this.friction, dt * 60);
        this.vz *= Math.pow(this.friction, dt * 60);

        // Clamp to map boundaries
        const boundX = 17 - this.currentRadius;
        const boundZMin = -16;
        const boundZMax = 20.5; // Above sanctuary gate
        this.x = Math.max(-boundX, Math.min(boundX, this.x));
        this.z = Math.max(boundZMin, Math.min(boundZMax, this.z));

        // Smooth radius interpolation
        this.currentRadius += (this.targetRadius - this.currentRadius) * dt * 5.0;
        this.updateMeshScale();

        // Rotate event horizon rings
        const spinSpeed = this.singularityActive ? 8.0 : 2.5;
        this.ringMesh.rotation.z += spinSpeed * dt;
        this.innerRingMesh.rotation.z -= (spinSpeed * 1.4) * dt;

        // Sync mesh position
        this.group.position.set(this.x, 0, this.z);
    }

    reset() {
        this.x = 0;
        this.z = 10;
        this.vx = 0;
        this.vz = 0;
        this.mass = 0;
        this.tier = 1;
        this.targetRadius = this.baseRadius;
        this.currentRadius = this.baseRadius;
        this.stunnedTimer = 0;
        this.acidTimer = 0;
        this.singularityActive = false;
        this.group.position.set(this.x, 0, this.z);
        this.updateMeshScale();
    }
}
