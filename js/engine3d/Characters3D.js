/**
 * 3D Character Models for Primal Hunt
 * Creates stylized 3D representations of hunters and monsters
 */

class Characters3D {
    constructor(renderer) {
        this.renderer = renderer;
        this.scale = 0.05;
        this.characterMeshes = new Map();

        // Pre-create geometries
        this.createGeometries();
    }

    createGeometries() {
        // Hunter body parts
        this.hunterGeometries = {
            body: new THREE.CapsuleGeometry(0.3, 0.6, 4, 8),
            head: new THREE.SphereGeometry(0.2, 8, 8),
            arm: new THREE.CapsuleGeometry(0.08, 0.4, 4, 6),
            leg: new THREE.CapsuleGeometry(0.1, 0.4, 4, 6),
            weapon: new THREE.BoxGeometry(0.1, 0.1, 0.5)
        };

        // Monster geometries by type
        this.monsterGeometries = {
            goliath: {
                body: new THREE.DodecahedronGeometry(0.8, 1),
                arm: new THREE.ConeGeometry(0.3, 0.8, 5),
                head: new THREE.DodecahedronGeometry(0.4, 0)
            },
            kraken: {
                body: new THREE.OctahedronGeometry(0.6, 1),
                tentacle: new THREE.ConeGeometry(0.1, 0.8, 6),
                head: new THREE.SphereGeometry(0.4, 8, 6)
            },
            wraith: {
                body: new THREE.ConeGeometry(0.4, 1.2, 6),
                blade: new THREE.BoxGeometry(0.05, 0.6, 0.1),
                head: new THREE.OctahedronGeometry(0.25, 0)
            },
            behemoth: {
                body: new THREE.DodecahedronGeometry(1.2, 0),
                shell: new THREE.IcosahedronGeometry(1.0, 0),
                head: new THREE.BoxGeometry(0.6, 0.4, 0.5)
            }
        };

        // Wildlife geometries
        this.wildlifeGeometries = {
            small: new THREE.SphereGeometry(0.15, 6, 6),
            medium: new THREE.CapsuleGeometry(0.2, 0.3, 4, 6),
            large: new THREE.DodecahedronGeometry(0.4, 0)
        };
    }

    /**
     * Create or update a hunter mesh
     */
    createHunterMesh(entity) {
        const group = new THREE.Group();
        const color = new THREE.Color(entity.color);

        // Body material
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.7,
            metalness: 0.2,
            flatShading: true
        });

        // Body
        const body = new THREE.Mesh(this.hunterGeometries.body, bodyMaterial);
        body.position.y = 0.5;
        body.castShadow = true;
        group.add(body);

        // Head
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac,
            roughness: 0.8
        });
        const head = new THREE.Mesh(this.hunterGeometries.head, headMaterial);
        head.position.y = 1.1;
        head.castShadow = true;
        group.add(head);

        // Arms
        const armMaterial = bodyMaterial.clone();
        const leftArm = new THREE.Mesh(this.hunterGeometries.arm, armMaterial);
        leftArm.position.set(-0.4, 0.6, 0);
        leftArm.rotation.z = 0.3;
        leftArm.castShadow = true;
        group.add(leftArm);

        const rightArm = new THREE.Mesh(this.hunterGeometries.arm, armMaterial);
        rightArm.position.set(0.4, 0.6, 0);
        rightArm.rotation.z = -0.3;
        rightArm.castShadow = true;
        group.add(rightArm);

        // Weapon
        const weaponMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.3,
            metalness: 0.8
        });
        const weapon = new THREE.Mesh(this.hunterGeometries.weapon, weaponMaterial);
        weapon.position.set(0.5, 0.5, 0.3);
        weapon.castShadow = true;
        group.add(weapon);

        // Class-specific indicator (glowing ring)
        const ringGeometry = new THREE.RingGeometry(0.5, 0.55, 16);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        group.add(ring);

        // Scale to game size
        const gameScale = entity.radius * this.scale * 0.08;
        group.scale.set(gameScale, gameScale, gameScale);

        // Store reference
        group.userData = { entity, type: 'hunter' };

        return group;
    }

    /**
     * Create a monster mesh
     */
    createMonsterMesh(entity) {
        const group = new THREE.Group();
        const color = new THREE.Color(entity.color);
        const monsterType = entity.monsterType || 'goliath';
        const geometries = this.monsterGeometries[monsterType] || this.monsterGeometries.goliath;

        // Body material with emissive for evolution glow
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.6,
            metalness: 0.3,
            flatShading: true,
            emissive: color,
            emissiveIntensity: 0.1 * entity.evolutionStage
        });

        // Main body
        const body = new THREE.Mesh(geometries.body, bodyMaterial);
        body.position.y = 0.8;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Head
        const headMaterial = bodyMaterial.clone();
        headMaterial.emissiveIntensity = 0.2 * entity.evolutionStage;
        const head = new THREE.Mesh(geometries.head, headMaterial);
        head.position.y = 1.4;
        head.position.z = 0.3;
        head.castShadow = true;
        group.add(head);

        // Eyes (glowing)
        const eyeMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            emissive: 0xff0000
        });
        const eyeGeometry = new THREE.SphereGeometry(0.08, 6, 6);
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.15, 1.5, 0.5);
        group.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.15, 1.5, 0.5);
        group.add(rightEye);

        // Monster-specific features
        if (monsterType === 'goliath') {
            this.addGoliathFeatures(group, bodyMaterial);
        } else if (monsterType === 'kraken') {
            this.addKrakenFeatures(group, bodyMaterial);
        } else if (monsterType === 'wraith') {
            this.addWraithFeatures(group, bodyMaterial);
        } else if (monsterType === 'behemoth') {
            this.addBehemothFeatures(group, bodyMaterial);
        }

        // Evolution stage indicator (glowing aura)
        const auraGeometry = new THREE.SphereGeometry(1.2, 16, 16);
        const auraMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.1 * entity.evolutionStage,
            side: THREE.BackSide
        });
        const aura = new THREE.Mesh(auraGeometry, auraMaterial);
        aura.position.y = 0.8;
        group.add(aura);
        group.userData.aura = aura;

        // Scale based on evolution stage
        const baseScale = entity.radius * this.scale * 0.05;
        const evolutionScale = 1 + (entity.evolutionStage - 1) * 0.2;
        group.scale.set(baseScale * evolutionScale, baseScale * evolutionScale, baseScale * evolutionScale);

        group.userData = { entity, type: 'monster' };

        return group;
    }

    addGoliathFeatures(group, material) {
        // Spikes on back
        const spikeMaterial = material.clone();
        spikeMaterial.color.setHex(0x660000);
        const spikeGeometry = new THREE.ConeGeometry(0.1, 0.4, 4);

        for (let i = 0; i < 5; i++) {
            const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
            spike.position.set(0, 1.2 + i * 0.15, -0.3 - i * 0.05);
            spike.rotation.x = -0.3;
            spike.castShadow = true;
            group.add(spike);
        }

        // Large arms
        const armGeometry = new THREE.CapsuleGeometry(0.25, 0.6, 4, 6);
        const leftArm = new THREE.Mesh(armGeometry, material);
        leftArm.position.set(-0.7, 0.5, 0);
        leftArm.rotation.z = 0.5;
        leftArm.castShadow = true;
        group.add(leftArm);

        const rightArm = new THREE.Mesh(armGeometry, material);
        rightArm.position.set(0.7, 0.5, 0);
        rightArm.rotation.z = -0.5;
        rightArm.castShadow = true;
        group.add(rightArm);
    }

    addKrakenFeatures(group, material) {
        // Tentacles
        const tentacleMaterial = material.clone();
        const tentacleGeometry = new THREE.ConeGeometry(0.08, 0.6, 6);

        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const tentacle = new THREE.Mesh(tentacleGeometry, tentacleMaterial);
            tentacle.position.set(
                Math.cos(angle) * 0.5,
                0.2,
                Math.sin(angle) * 0.5
            );
            tentacle.rotation.x = Math.PI;
            tentacle.rotation.z = Math.cos(angle) * 0.3;
            tentacle.castShadow = true;
            group.add(tentacle);
        }

        // Wings
        const wingMaterial = new THREE.MeshStandardMaterial({
            color: 0x4B0082,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        const wingGeometry = new THREE.PlaneGeometry(1.5, 0.8);
        const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
        leftWing.position.set(-0.8, 1.0, 0);
        leftWing.rotation.y = -0.3;
        group.add(leftWing);

        const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
        rightWing.position.set(0.8, 1.0, 0);
        rightWing.rotation.y = 0.3;
        group.add(rightWing);
    }

    addWraithFeatures(group, material) {
        // Scythe blades
        const bladeMaterial = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            metalness: 0.9,
            roughness: 0.1
        });
        const bladeGeometry = new THREE.BoxGeometry(0.05, 0.8, 0.15);

        const leftBlade = new THREE.Mesh(bladeGeometry, bladeMaterial);
        leftBlade.position.set(-0.5, 0.6, 0.2);
        leftBlade.rotation.z = 0.3;
        leftBlade.castShadow = true;
        group.add(leftBlade);

        const rightBlade = new THREE.Mesh(bladeGeometry, bladeMaterial);
        rightBlade.position.set(0.5, 0.6, 0.2);
        rightBlade.rotation.z = -0.3;
        rightBlade.castShadow = true;
        group.add(rightBlade);

        // Ethereal trail
        const trailMaterial = new THREE.MeshBasicMaterial({
            color: 0x800080,
            transparent: true,
            opacity: 0.3
        });
        const trailGeometry = new THREE.ConeGeometry(0.3, 1, 6);
        const trail = new THREE.Mesh(trailGeometry, trailMaterial);
        trail.position.set(0, 0.5, -0.5);
        trail.rotation.x = Math.PI / 2;
        group.add(trail);
    }

    addBehemothFeatures(group, material) {
        // Rocky shell plates
        const shellMaterial = material.clone();
        shellMaterial.color.setHex(0x4a3728);
        const plateGeometry = new THREE.BoxGeometry(0.4, 0.2, 0.4);

        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const plate = new THREE.Mesh(plateGeometry, shellMaterial);
            plate.position.set(
                Math.cos(angle) * 0.7,
                1.0 + Math.random() * 0.3,
                Math.sin(angle) * 0.7
            );
            plate.rotation.set(Math.random() * 0.3, angle, Math.random() * 0.3);
            plate.castShadow = true;
            group.add(plate);
        }

        // Legs
        const legGeometry = new THREE.CylinderGeometry(0.2, 0.25, 0.5, 6);
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
            const leg = new THREE.Mesh(legGeometry, shellMaterial);
            leg.position.set(
                Math.cos(angle) * 0.6,
                0.25,
                Math.sin(angle) * 0.6
            );
            leg.castShadow = true;
            group.add(leg);
        }
    }

    /**
     * Create wildlife mesh
     */
    createWildlifeMesh(entity) {
        const group = new THREE.Group();
        const type = entity.type || 'small';
        const geometry = this.wildlifeGeometries[type];

        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(entity.color),
            roughness: 0.8,
            flatShading: true
        });

        const body = new THREE.Mesh(geometry, material);
        body.position.y = 0.2;
        body.castShadow = true;
        group.add(body);

        // Simple eyes
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const eyeGeometry = new THREE.SphereGeometry(0.03, 4, 4);
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.08, 0.25, 0.12);
        group.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.08, 0.25, 0.12);
        group.add(rightEye);

        const gameScale = entity.radius * this.scale * 0.1;
        group.scale.set(gameScale, gameScale, gameScale);

        group.userData = { entity, type: 'wildlife' };

        return group;
    }

    /**
     * Get or create mesh for entity
     */
    getOrCreateMesh(entity, gameMap) {
        if (this.characterMeshes.has(entity.id)) {
            return this.characterMeshes.get(entity.id);
        }

        let mesh;
        if (entity instanceof Hunter) {
            mesh = this.createHunterMesh(entity);
        } else if (entity instanceof Monster) {
            mesh = this.createMonsterMesh(entity);
        } else if (entity instanceof Wildlife) {
            mesh = this.createWildlifeMesh(entity);
        } else {
            // Generic entity
            const geometry = new THREE.SphereGeometry(0.3, 8, 8);
            const material = new THREE.MeshStandardMaterial({
                color: entity.color || 0xffffff
            });
            mesh = new THREE.Mesh(geometry, material);
            mesh.userData = { entity, type: 'generic' };
        }

        this.renderer.addToScene(mesh);
        this.characterMeshes.set(entity.id, mesh);

        return mesh;
    }

    /**
     * Update mesh position and state
     */
    updateMesh(entity, gameMap, time) {
        const mesh = this.characterMeshes.get(entity.id);
        if (!mesh) return;

        // Convert game coords to 3D
        const x = (entity.x - gameMap.width / 2) * this.scale;
        const z = (entity.y - gameMap.height / 2) * this.scale;

        // Update position with smooth interpolation
        mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, x, 0.2);
        mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, z, 0.2);

        // Bob animation
        mesh.position.y = Math.sin(time * 5 + entity.id.charCodeAt(0)) * 0.02;

        // Update rotation to face movement direction
        if (entity.facingAngle !== undefined) {
            const targetRotation = -entity.facingAngle + Math.PI / 2;
            mesh.rotation.y = THREE.MathUtils.lerp(
                mesh.rotation.y,
                targetRotation,
                0.15
            );
        }

        // Handle visibility for invisible entities
        if (entity.isInvisible && entity.isInvisible()) {
            mesh.visible = entity.isPlayer;
            if (mesh.visible) {
                mesh.traverse(child => {
                    if (child.material) {
                        child.material.transparent = true;
                        child.material.opacity = 0.3;
                    }
                });
            }
        } else {
            mesh.visible = entity.isAlive || entity.isDowned;
            mesh.traverse(child => {
                if (child.material && child.material.opacity !== undefined) {
                    child.material.opacity = 1;
                }
            });
        }

        // Update monster evolution visuals
        if (entity instanceof Monster && mesh.userData.aura) {
            mesh.userData.aura.material.opacity = 0.1 * entity.evolutionStage;
            mesh.userData.aura.scale.setScalar(1 + Math.sin(time * 2) * 0.05);
        }

        // Downed state
        if (entity.isDowned) {
            mesh.rotation.x = Math.PI / 2;
            mesh.position.y = 0.1;
        } else {
            mesh.rotation.x = 0;
        }
    }

    /**
     * Remove mesh for entity
     */
    removeMesh(entityId) {
        const mesh = this.characterMeshes.get(entityId);
        if (mesh) {
            this.renderer.removeFromScene(mesh);
            this.characterMeshes.delete(entityId);
        }
    }

    /**
     * Clear all character meshes
     */
    clear() {
        for (const [id, mesh] of this.characterMeshes) {
            this.renderer.removeFromScene(mesh);
        }
        this.characterMeshes.clear();
    }
}

// Export
window.Characters3D = Characters3D;
