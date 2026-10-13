/**
 * 3D Character Models for Primal Hunt
 * Creates stylized 3D representations of hunters and monsters
 * Enhanced with detailed procedural meshes and improved visuals
 */

class Characters3D {
    constructor(renderer) {
        this.renderer = renderer;
        this.scale = 0.02; // Coordinate scaling (game units to 3D units)
        this.modelScale = 1.5; // Make models larger and more visible
        this.characterMeshes = new Map();
        this.animationTime = 0;

        // Pre-create geometries
        this.createGeometries();
        this.createMaterials();
    }

    createGeometries() {
        // Hunter body parts - enhanced with more detail
        this.hunterGeometries = {
            torso: new THREE.CylinderGeometry(0.28, 0.32, 0.6, 12),
            chest: new THREE.SphereGeometry(0.32, 12, 8),
            head: new THREE.SphereGeometry(0.18, 12, 10),
            helmet: new THREE.SphereGeometry(0.21, 12, 10),
            visor: new THREE.BoxGeometry(0.28, 0.08, 0.1),
            shoulder: new THREE.SphereGeometry(0.12, 8, 6),
            upperArm: new THREE.CylinderGeometry(0.07, 0.08, 0.35, 8),
            forearm: new THREE.CylinderGeometry(0.06, 0.07, 0.3, 8),
            hand: new THREE.SphereGeometry(0.06, 6, 6),
            upperLeg: new THREE.CylinderGeometry(0.1, 0.09, 0.4, 8),
            lowerLeg: new THREE.CylinderGeometry(0.08, 0.07, 0.35, 8),
            boot: new THREE.BoxGeometry(0.12, 0.1, 0.2),
            backpack: new THREE.BoxGeometry(0.25, 0.3, 0.15)
        };

        // Monster geometries by type - significantly enhanced
        this.monsterGeometries = {
            goliath: this.createGoliathGeometries(),
            kraken: this.createKrakenGeometries(),
            wraith: this.createWraithGeometries(),
            behemoth: this.createBehemothGeometries()
        };

        // Wildlife geometries - more organic
        this.wildlifeGeometries = {
            small: this.createSmallWildlifeGeometry(),
            medium: this.createMediumWildlifeGeometry(),
            large: this.createLargeWildlifeGeometry()
        };
    }

    createGoliathGeometries() {
        return {
            torso: new THREE.DodecahedronGeometry(0.7, 1),
            chest: new THREE.SphereGeometry(0.55, 12, 10),
            head: new THREE.DodecahedronGeometry(0.35, 1),
            jaw: new THREE.BoxGeometry(0.3, 0.15, 0.25),
            shoulder: new THREE.IcosahedronGeometry(0.25, 0),
            upperArm: new THREE.CylinderGeometry(0.18, 0.22, 0.5, 8),
            forearm: new THREE.CylinderGeometry(0.15, 0.2, 0.45, 8),
            fist: new THREE.DodecahedronGeometry(0.2, 0),
            upperLeg: new THREE.CylinderGeometry(0.2, 0.18, 0.5, 8),
            lowerLeg: new THREE.CylinderGeometry(0.15, 0.18, 0.45, 8),
            foot: new THREE.BoxGeometry(0.25, 0.12, 0.35),
            spike: new THREE.ConeGeometry(0.08, 0.35, 5),
            horn: new THREE.ConeGeometry(0.06, 0.25, 5)
        };
    }

    createKrakenGeometries() {
        // Create curved tentacle using TubeGeometry
        const tentacleCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0.1, -0.2, 0.05),
            new THREE.Vector3(0.15, -0.5, 0.1),
            new THREE.Vector3(0.1, -0.8, 0.05)
        ]);

        return {
            body: new THREE.OctahedronGeometry(0.5, 2),
            mantle: new THREE.ConeGeometry(0.45, 0.7, 12),
            head: new THREE.SphereGeometry(0.4, 12, 10),
            eye: new THREE.SphereGeometry(0.12, 10, 8),
            pupil: new THREE.SphereGeometry(0.06, 8, 6),
            tentacle: new THREE.TubeGeometry(tentacleCurve, 12, 0.06, 8, false),
            tentacleTip: new THREE.ConeGeometry(0.04, 0.15, 6),
            wing: new THREE.PlaneGeometry(1.2, 0.7),
            wingBone: new THREE.CylinderGeometry(0.02, 0.01, 0.8, 6)
        };
    }

    createWraithGeometries() {
        // Ethereal flowing shape
        const bodyShape = new THREE.Shape();
        bodyShape.moveTo(0, 0);
        bodyShape.bezierCurveTo(0.4, 0.2, 0.3, 0.8, 0, 1.2);
        bodyShape.bezierCurveTo(-0.3, 0.8, -0.4, 0.2, 0, 0);

        const extrudeSettings = {
            steps: 1,
            depth: 0.3,
            bevelEnabled: true,
            bevelThickness: 0.1,
            bevelSize: 0.1,
            bevelSegments: 3
        };

        return {
            body: new THREE.ExtrudeGeometry(bodyShape, extrudeSettings),
            head: new THREE.OctahedronGeometry(0.22, 1),
            skull: new THREE.SphereGeometry(0.18, 10, 8),
            blade: this.createBladeGeometry(),
            bladeEdge: new THREE.BoxGeometry(0.02, 0.7, 0.08),
            cloak: new THREE.ConeGeometry(0.5, 1.0, 8),
            wisp: new THREE.SphereGeometry(0.05, 6, 6)
        };
    }

    createBladeGeometry() {
        // Create scythe blade shape
        const bladeShape = new THREE.Shape();
        bladeShape.moveTo(0, 0);
        bladeShape.lineTo(0.02, 0);
        bladeShape.lineTo(0.15, 0.5);
        bladeShape.lineTo(0.12, 0.6);
        bladeShape.lineTo(0, 0.55);
        bladeShape.lineTo(0, 0);

        return new THREE.ExtrudeGeometry(bladeShape, {
            steps: 1,
            depth: 0.02,
            bevelEnabled: false
        });
    }

    createBehemothGeometries() {
        return {
            body: new THREE.IcosahedronGeometry(0.9, 1),
            shell: new THREE.DodecahedronGeometry(1.0, 0),
            head: new THREE.BoxGeometry(0.5, 0.35, 0.45),
            snout: new THREE.BoxGeometry(0.25, 0.2, 0.3),
            eye: new THREE.SphereGeometry(0.06, 8, 6),
            leg: new THREE.CylinderGeometry(0.22, 0.28, 0.5, 8),
            foot: new THREE.CylinderGeometry(0.28, 0.3, 0.15, 8),
            claw: new THREE.ConeGeometry(0.05, 0.15, 4),
            plate: new THREE.DodecahedronGeometry(0.2, 0),
            spike: new THREE.ConeGeometry(0.1, 0.4, 5),
            tail: new THREE.CylinderGeometry(0.15, 0.05, 0.8, 8)
        };
    }

    createSmallWildlifeGeometry() {
        // Small critter - like a rabbit/rodent
        return {
            body: new THREE.SphereGeometry(0.12, 8, 6),
            head: new THREE.SphereGeometry(0.08, 8, 6),
            ear: new THREE.ConeGeometry(0.02, 0.06, 4),
            leg: new THREE.CylinderGeometry(0.015, 0.02, 0.06, 4)
        };
    }

    createMediumWildlifeGeometry() {
        // Medium creature - like a boar/deer
        return {
            body: new THREE.CylinderGeometry(0.15, 0.18, 0.35, 8),
            head: new THREE.BoxGeometry(0.12, 0.1, 0.15),
            snout: new THREE.BoxGeometry(0.06, 0.05, 0.08),
            leg: new THREE.CylinderGeometry(0.025, 0.03, 0.15, 6),
            ear: new THREE.ConeGeometry(0.02, 0.05, 4),
            tail: new THREE.CylinderGeometry(0.01, 0.02, 0.1, 4)
        };
    }

    createLargeWildlifeGeometry() {
        // Large creature - like a tyrant/rex
        return {
            body: new THREE.DodecahedronGeometry(0.3, 1),
            head: new THREE.BoxGeometry(0.2, 0.15, 0.25),
            jaw: new THREE.BoxGeometry(0.15, 0.08, 0.2),
            leg: new THREE.CylinderGeometry(0.06, 0.08, 0.25, 6),
            arm: new THREE.CylinderGeometry(0.02, 0.03, 0.1, 4),
            tail: new THREE.ConeGeometry(0.08, 0.4, 6),
            spike: new THREE.ConeGeometry(0.03, 0.1, 4)
        };
    }

    createMaterials() {
        // Hunter class materials with better shading
        this.hunterMaterials = {
            assault: {
                primary: new THREE.MeshStandardMaterial({
                    color: 0xcc3333,
                    roughness: 0.5,
                    metalness: 0.4,
                    flatShading: true
                }),
                secondary: new THREE.MeshStandardMaterial({
                    color: 0x222222,
                    roughness: 0.3,
                    metalness: 0.6
                }),
                accent: new THREE.MeshStandardMaterial({
                    color: 0xff6600,
                    roughness: 0.4,
                    metalness: 0.3,
                    emissive: 0xff3300,
                    emissiveIntensity: 0.2
                })
            },
            trapper: {
                primary: new THREE.MeshStandardMaterial({
                    color: 0x33aa33,
                    roughness: 0.6,
                    metalness: 0.2,
                    flatShading: true
                }),
                secondary: new THREE.MeshStandardMaterial({
                    color: 0x2a5a2a,
                    roughness: 0.7,
                    metalness: 0.1
                }),
                accent: new THREE.MeshStandardMaterial({
                    color: 0x66ff66,
                    roughness: 0.4,
                    metalness: 0.3,
                    emissive: 0x33ff33,
                    emissiveIntensity: 0.15
                })
            },
            medic: {
                primary: new THREE.MeshStandardMaterial({
                    color: 0x3366cc,
                    roughness: 0.5,
                    metalness: 0.3,
                    flatShading: true
                }),
                secondary: new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    roughness: 0.4,
                    metalness: 0.2
                }),
                accent: new THREE.MeshStandardMaterial({
                    color: 0x66ccff,
                    roughness: 0.3,
                    metalness: 0.4,
                    emissive: 0x3399ff,
                    emissiveIntensity: 0.2
                })
            },
            support: {
                primary: new THREE.MeshStandardMaterial({
                    color: 0xccaa33,
                    roughness: 0.5,
                    metalness: 0.4,
                    flatShading: true
                }),
                secondary: new THREE.MeshStandardMaterial({
                    color: 0x444444,
                    roughness: 0.4,
                    metalness: 0.5
                }),
                accent: new THREE.MeshStandardMaterial({
                    color: 0xffdd00,
                    roughness: 0.3,
                    metalness: 0.5,
                    emissive: 0xffaa00,
                    emissiveIntensity: 0.15
                })
            }
        };

        // Skin material for exposed areas
        this.skinMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac,
            roughness: 0.8,
            metalness: 0
        });

        // Weapon/metal material
        this.metalMaterial = new THREE.MeshStandardMaterial({
            color: 0x555555,
            roughness: 0.2,
            metalness: 0.9
        });

        // Monster materials with evolution glow capability
        this.monsterBaseMaterials = {
            goliath: {
                primary: 0x8b0000,
                secondary: 0x4a0000,
                accent: 0xff4400
            },
            kraken: {
                primary: 0x4b0082,
                secondary: 0x2a004a,
                accent: 0x9966ff
            },
            wraith: {
                primary: 0x2d1b4e,
                secondary: 0x1a0a2e,
                accent: 0xcc66ff
            },
            behemoth: {
                primary: 0x5a4a3a,
                secondary: 0x3a2a1a,
                accent: 0xff8800
            }
        };
    }

    /**
     * Create or update a hunter mesh - enhanced with full body detail
     */
    createHunterMesh(entity) {
        const group = new THREE.Group();
        const hunterClass = (entity.hunterClass || 'assault').toLowerCase();
        const materials = this.hunterMaterials[hunterClass] || this.hunterMaterials.assault;
        const geom = this.hunterGeometries;

        // === TORSO ===
        const torso = new THREE.Mesh(geom.torso, materials.primary);
        torso.position.y = 0.55;
        torso.castShadow = true;
        group.add(torso);

        // Chest armor
        const chest = new THREE.Mesh(geom.chest, materials.secondary);
        chest.position.set(0, 0.65, 0.08);
        chest.scale.set(1, 0.7, 0.6);
        chest.castShadow = true;
        group.add(chest);

        // Backpack
        const backpack = new THREE.Mesh(geom.backpack, materials.secondary);
        backpack.position.set(0, 0.6, -0.22);
        backpack.castShadow = true;
        group.add(backpack);

        // === HEAD ===
        const head = new THREE.Mesh(geom.head, this.skinMaterial);
        head.position.y = 1.05;
        head.castShadow = true;
        group.add(head);

        // Helmet
        const helmet = new THREE.Mesh(geom.helmet, materials.primary);
        helmet.position.set(0, 1.08, -0.02);
        helmet.scale.set(1, 0.9, 1);
        helmet.castShadow = true;
        group.add(helmet);

        // Visor
        const visor = new THREE.Mesh(geom.visor, materials.accent);
        visor.position.set(0, 1.02, 0.15);
        visor.castShadow = true;
        group.add(visor);

        // === ARMS ===
        // Left arm
        const leftShoulder = new THREE.Mesh(geom.shoulder, materials.primary);
        leftShoulder.position.set(-0.38, 0.85, 0);
        leftShoulder.castShadow = true;
        group.add(leftShoulder);

        const leftUpperArm = new THREE.Mesh(geom.upperArm, materials.primary);
        leftUpperArm.position.set(-0.42, 0.6, 0);
        leftUpperArm.rotation.z = 0.25;
        leftUpperArm.castShadow = true;
        group.add(leftUpperArm);

        const leftForearm = new THREE.Mesh(geom.forearm, materials.secondary);
        leftForearm.position.set(-0.48, 0.35, 0.05);
        leftForearm.rotation.z = 0.15;
        leftForearm.castShadow = true;
        group.add(leftForearm);

        const leftHand = new THREE.Mesh(geom.hand, this.skinMaterial);
        leftHand.position.set(-0.5, 0.18, 0.08);
        leftHand.castShadow = true;
        group.add(leftHand);

        // Right arm
        const rightShoulder = new THREE.Mesh(geom.shoulder, materials.primary);
        rightShoulder.position.set(0.38, 0.85, 0);
        rightShoulder.castShadow = true;
        group.add(rightShoulder);

        const rightUpperArm = new THREE.Mesh(geom.upperArm, materials.primary);
        rightUpperArm.position.set(0.42, 0.6, 0);
        rightUpperArm.rotation.z = -0.25;
        rightUpperArm.castShadow = true;
        group.add(rightUpperArm);

        const rightForearm = new THREE.Mesh(geom.forearm, materials.secondary);
        rightForearm.position.set(0.48, 0.35, 0.1);
        rightForearm.rotation.z = -0.15;
        rightForearm.rotation.x = -0.3;
        rightForearm.castShadow = true;
        group.add(rightForearm);

        const rightHand = new THREE.Mesh(geom.hand, this.skinMaterial);
        rightHand.position.set(0.5, 0.2, 0.18);
        rightHand.castShadow = true;
        group.add(rightHand);

        // === LEGS ===
        // Left leg
        const leftUpperLeg = new THREE.Mesh(geom.upperLeg, materials.secondary);
        leftUpperLeg.position.set(-0.15, 0.22, 0);
        leftUpperLeg.castShadow = true;
        group.add(leftUpperLeg);

        const leftLowerLeg = new THREE.Mesh(geom.lowerLeg, materials.secondary);
        leftLowerLeg.position.set(-0.15, -0.12, 0.02);
        leftLowerLeg.castShadow = true;
        group.add(leftLowerLeg);

        const leftBoot = new THREE.Mesh(geom.boot, materials.primary);
        leftBoot.position.set(-0.15, -0.32, 0.04);
        leftBoot.castShadow = true;
        group.add(leftBoot);

        // Right leg
        const rightUpperLeg = new THREE.Mesh(geom.upperLeg, materials.secondary);
        rightUpperLeg.position.set(0.15, 0.22, 0);
        rightUpperLeg.castShadow = true;
        group.add(rightUpperLeg);

        const rightLowerLeg = new THREE.Mesh(geom.lowerLeg, materials.secondary);
        rightLowerLeg.position.set(0.15, -0.12, 0.02);
        rightLowerLeg.castShadow = true;
        group.add(rightLowerLeg);

        const rightBoot = new THREE.Mesh(geom.boot, materials.primary);
        rightBoot.position.set(0.15, -0.32, 0.04);
        rightBoot.castShadow = true;
        group.add(rightBoot);

        // === WEAPON ===
        const weapon = this.createHunterWeapon(hunterClass, materials);
        weapon.position.set(0.55, 0.25, 0.25);
        group.add(weapon);

        // === CLASS INDICATOR ===
        const ringGeometry = new THREE.RingGeometry(0.5, 0.55, 20);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: materials.accent.color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -0.35;
        group.add(ring);

        // Store animated parts for later
        group.userData = {
            entity,
            type: 'hunter',
            animParts: {
                leftArm: leftUpperArm,
                rightArm: rightUpperArm,
                leftLeg: leftUpperLeg,
                rightLeg: rightUpperLeg
            }
        };

        // Scale to game size
        const gameScale = this.modelScale;
        group.scale.set(gameScale, gameScale, gameScale);

        return group;
    }

    /**
     * Create class-specific weapon
     */
    createHunterWeapon(hunterClass, materials) {
        const weaponGroup = new THREE.Group();

        switch (hunterClass) {
            case 'assault':
                // Assault rifle
                const rifleBody = new THREE.Mesh(
                    new THREE.BoxGeometry(0.08, 0.08, 0.45),
                    this.metalMaterial
                );
                rifleBody.castShadow = true;
                weaponGroup.add(rifleBody);

                const rifleStock = new THREE.Mesh(
                    new THREE.BoxGeometry(0.06, 0.12, 0.15),
                    materials.secondary
                );
                rifleStock.position.set(0, -0.02, -0.25);
                rifleStock.castShadow = true;
                weaponGroup.add(rifleStock);

                const rifleBarrel = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.02, 0.025, 0.2, 8),
                    this.metalMaterial
                );
                rifleBarrel.rotation.x = Math.PI / 2;
                rifleBarrel.position.set(0, 0, 0.3);
                rifleBarrel.castShadow = true;
                weaponGroup.add(rifleBarrel);
                break;

            case 'trapper':
                // Net/trap launcher
                const launcherBody = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.06, 0.08, 0.35, 8),
                    materials.primary
                );
                launcherBody.rotation.x = Math.PI / 2;
                launcherBody.castShadow = true;
                weaponGroup.add(launcherBody);

                const launcherMuzzle = new THREE.Mesh(
                    new THREE.TorusGeometry(0.08, 0.02, 6, 12),
                    materials.accent
                );
                launcherMuzzle.position.z = 0.2;
                weaponGroup.add(launcherMuzzle);
                break;

            case 'medic':
                // Healing device
                const healDevice = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, 0.15, 0.25),
                    materials.secondary
                );
                healDevice.castShadow = true;
                weaponGroup.add(healDevice);

                const healEmitter = new THREE.Mesh(
                    new THREE.SphereGeometry(0.05, 8, 6),
                    materials.accent
                );
                healEmitter.position.set(0, 0, 0.15);
                weaponGroup.add(healEmitter);

                // Cross symbol
                const crossH = new THREE.Mesh(
                    new THREE.BoxGeometry(0.08, 0.02, 0.02),
                    new THREE.MeshBasicMaterial({ color: 0xff0000 })
                );
                crossH.position.set(0, 0.08, 0.02);
                weaponGroup.add(crossH);

                const crossV = new THREE.Mesh(
                    new THREE.BoxGeometry(0.02, 0.08, 0.02),
                    new THREE.MeshBasicMaterial({ color: 0xff0000 })
                );
                crossV.position.set(0, 0.08, 0.02);
                weaponGroup.add(crossV);
                break;

            case 'support':
                // Shield generator
                const shieldGen = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.08, 0.1, 0.3, 8),
                    materials.primary
                );
                shieldGen.rotation.x = Math.PI / 2;
                shieldGen.castShadow = true;
                weaponGroup.add(shieldGen);

                const shieldCore = new THREE.Mesh(
                    new THREE.SphereGeometry(0.06, 8, 8),
                    materials.accent
                );
                shieldCore.position.z = 0.18;
                weaponGroup.add(shieldCore);
                break;
        }

        return weaponGroup;
    }

    /**
     * Create a monster mesh - dramatically enhanced with detailed procedural models
     */
    createMonsterMesh(entity) {
        const group = new THREE.Group();
        const monsterType = (entity.monsterType || 'goliath').toLowerCase();
        const baseMats = this.monsterBaseMaterials[monsterType] || this.monsterBaseMaterials.goliath;
        const evolutionStage = entity.evolutionStage || 1;

        // Create evolution-aware materials
        const primaryMaterial = new THREE.MeshStandardMaterial({
            color: baseMats.primary,
            roughness: 0.6,
            metalness: 0.3,
            flatShading: true,
            emissive: baseMats.accent,
            emissiveIntensity: 0.1 + (evolutionStage - 1) * 0.15
        });

        const secondaryMaterial = new THREE.MeshStandardMaterial({
            color: baseMats.secondary,
            roughness: 0.7,
            metalness: 0.2,
            flatShading: true
        });

        const accentMaterial = new THREE.MeshStandardMaterial({
            color: baseMats.accent,
            roughness: 0.3,
            metalness: 0.5,
            emissive: baseMats.accent,
            emissiveIntensity: 0.3 + (evolutionStage - 1) * 0.2
        });

        // Build monster based on type
        let animParts = {};
        switch (monsterType) {
            case 'goliath':
                animParts = this.buildGoliathModel(group, primaryMaterial, secondaryMaterial, accentMaterial);
                break;
            case 'kraken':
                animParts = this.buildKrakenModel(group, primaryMaterial, secondaryMaterial, accentMaterial);
                break;
            case 'wraith':
                animParts = this.buildWraithModel(group, primaryMaterial, secondaryMaterial, accentMaterial);
                break;
            case 'behemoth':
                animParts = this.buildBehemothModel(group, primaryMaterial, secondaryMaterial, accentMaterial);
                break;
            default:
                animParts = this.buildGoliathModel(group, primaryMaterial, secondaryMaterial, accentMaterial);
        }

        // Evolution aura
        const auraGeometry = new THREE.SphereGeometry(1.5, 20, 16);
        const auraMaterial = new THREE.MeshBasicMaterial({
            color: baseMats.accent,
            transparent: true,
            opacity: 0.08 * evolutionStage,
            side: THREE.BackSide
        });
        const aura = new THREE.Mesh(auraGeometry, auraMaterial);
        aura.position.y = 0.8;
        group.add(aura);

        // Inner glow layer
        const innerAuraGeometry = new THREE.SphereGeometry(1.2, 16, 12);
        const innerAuraMaterial = new THREE.MeshBasicMaterial({
            color: baseMats.accent,
            transparent: true,
            opacity: 0.05 * evolutionStage,
            side: THREE.BackSide
        });
        const innerAura = new THREE.Mesh(innerAuraGeometry, innerAuraMaterial);
        innerAura.position.y = 0.8;
        group.add(innerAura);

        // Scale based on evolution
        const baseScale = this.modelScale * 1.6;
        const evolutionScale = 1 + (evolutionStage - 1) * 0.35;
        group.scale.set(baseScale * evolutionScale, baseScale * evolutionScale, baseScale * evolutionScale);

        group.userData = {
            entity,
            type: 'monster',
            monsterType,
            aura,
            innerAura,
            animParts,
            primaryMaterial,
            accentMaterial
        };

        return group;
    }

    /**
     * Build detailed Goliath model - muscular brute with spikes
     */
    buildGoliathModel(group, primaryMat, secondaryMat, accentMat) {
        const geom = this.monsterGeometries.goliath;

        // === TORSO ===
        const torso = new THREE.Mesh(geom.torso, primaryMat);
        torso.position.y = 0.7;
        torso.scale.set(1, 0.9, 0.8);
        torso.castShadow = true;
        group.add(torso);

        // Chest muscles
        const chest = new THREE.Mesh(geom.chest, primaryMat);
        chest.position.set(0, 0.85, 0.25);
        chest.scale.set(1.1, 0.8, 0.7);
        chest.castShadow = true;
        group.add(chest);

        // === HEAD ===
        const head = new THREE.Mesh(geom.head, primaryMat);
        head.position.set(0, 1.35, 0.2);
        head.castShadow = true;
        group.add(head);

        // Jaw
        const jaw = new THREE.Mesh(geom.jaw, secondaryMat);
        jaw.position.set(0, 1.2, 0.35);
        jaw.castShadow = true;
        group.add(jaw);

        // Horns
        const hornMat = accentMat.clone();
        for (let side = -1; side <= 1; side += 2) {
            const horn = new THREE.Mesh(geom.horn, hornMat);
            horn.position.set(side * 0.25, 1.5, 0.1);
            horn.rotation.z = side * 0.4;
            horn.rotation.x = -0.3;
            horn.castShadow = true;
            group.add(horn);
        }

        // Eyes
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
        const eyeGeom = new THREE.SphereGeometry(0.06, 8, 6);
        const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
        leftEye.position.set(-0.12, 1.4, 0.4);
        group.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
        rightEye.position.set(0.12, 1.4, 0.4);
        group.add(rightEye);

        // === ARMS ===
        const arms = { left: [], right: [] };

        // Left arm
        const leftShoulder = new THREE.Mesh(geom.shoulder, primaryMat);
        leftShoulder.position.set(-0.65, 0.95, 0);
        leftShoulder.castShadow = true;
        group.add(leftShoulder);

        const leftUpperArm = new THREE.Mesh(geom.upperArm, primaryMat);
        leftUpperArm.position.set(-0.75, 0.6, 0);
        leftUpperArm.rotation.z = 0.4;
        leftUpperArm.castShadow = true;
        group.add(leftUpperArm);
        arms.left.push(leftUpperArm);

        const leftForearm = new THREE.Mesh(geom.forearm, primaryMat);
        leftForearm.position.set(-0.9, 0.25, 0.1);
        leftForearm.rotation.z = 0.2;
        leftForearm.castShadow = true;
        group.add(leftForearm);

        const leftFist = new THREE.Mesh(geom.fist, secondaryMat);
        leftFist.position.set(-1.0, 0, 0.15);
        leftFist.castShadow = true;
        group.add(leftFist);

        // Right arm
        const rightShoulder = new THREE.Mesh(geom.shoulder, primaryMat);
        rightShoulder.position.set(0.65, 0.95, 0);
        rightShoulder.castShadow = true;
        group.add(rightShoulder);

        const rightUpperArm = new THREE.Mesh(geom.upperArm, primaryMat);
        rightUpperArm.position.set(0.75, 0.6, 0);
        rightUpperArm.rotation.z = -0.4;
        rightUpperArm.castShadow = true;
        group.add(rightUpperArm);
        arms.right.push(rightUpperArm);

        const rightForearm = new THREE.Mesh(geom.forearm, primaryMat);
        rightForearm.position.set(0.9, 0.25, 0.1);
        rightForearm.rotation.z = -0.2;
        rightForearm.castShadow = true;
        group.add(rightForearm);

        const rightFist = new THREE.Mesh(geom.fist, secondaryMat);
        rightFist.position.set(1.0, 0, 0.15);
        rightFist.castShadow = true;
        group.add(rightFist);

        // === LEGS ===
        for (let side = -1; side <= 1; side += 2) {
            const upperLeg = new THREE.Mesh(geom.upperLeg, primaryMat);
            upperLeg.position.set(side * 0.3, 0.25, 0);
            upperLeg.castShadow = true;
            group.add(upperLeg);

            const lowerLeg = new THREE.Mesh(geom.lowerLeg, primaryMat);
            lowerLeg.position.set(side * 0.32, -0.15, 0.05);
            lowerLeg.castShadow = true;
            group.add(lowerLeg);

            const foot = new THREE.Mesh(geom.foot, secondaryMat);
            foot.position.set(side * 0.32, -0.42, 0.1);
            foot.castShadow = true;
            group.add(foot);
        }

        // === SPIKES (back) ===
        const spikeMat = accentMat.clone();
        for (let i = 0; i < 7; i++) {
            const spike = new THREE.Mesh(geom.spike, spikeMat);
            const yOffset = 0.9 + i * 0.12;
            const zOffset = -0.3 - i * 0.04;
            const scale = 1 - i * 0.08;
            spike.position.set(0, yOffset, zOffset);
            spike.rotation.x = -0.4;
            spike.scale.set(scale, scale, scale);
            spike.castShadow = true;
            group.add(spike);
        }

        // Side spikes
        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < 3; i++) {
                const spike = new THREE.Mesh(geom.spike, spikeMat);
                spike.position.set(side * (0.5 + i * 0.1), 0.8 + i * 0.1, -0.2);
                spike.rotation.z = side * (0.5 + i * 0.1);
                spike.rotation.x = -0.2;
                spike.scale.set(0.6, 0.6, 0.6);
                spike.castShadow = true;
                group.add(spike);
            }
        }

        return { arms, torso };
    }

    /**
     * Build detailed Kraken model - floating squid with tentacles and wings
     */
    buildKrakenModel(group, primaryMat, secondaryMat, accentMat) {
        const geom = this.monsterGeometries.kraken;

        // === BODY ===
        const body = new THREE.Mesh(geom.body, primaryMat);
        body.position.y = 0.9;
        body.scale.set(1, 1.2, 0.9);
        body.castShadow = true;
        group.add(body);

        // Mantle (upper body)
        const mantle = new THREE.Mesh(geom.mantle, primaryMat);
        mantle.position.set(0, 1.4, 0);
        mantle.rotation.x = Math.PI;
        mantle.castShadow = true;
        group.add(mantle);

        // Head
        const head = new THREE.Mesh(geom.head, primaryMat);
        head.position.set(0, 0.7, 0.2);
        head.scale.set(1, 0.8, 0.9);
        head.castShadow = true;
        group.add(head);

        // === EYES (large, squid-like) ===
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

        for (let side = -1; side <= 1; side += 2) {
            const eye = new THREE.Mesh(geom.eye, eyeMat);
            eye.position.set(side * 0.25, 0.75, 0.35);
            group.add(eye);

            const pupil = new THREE.Mesh(geom.pupil, pupilMat);
            pupil.position.set(side * 0.25, 0.75, 0.42);
            group.add(pupil);
        }

        // === TENTACLES ===
        const tentacles = [];
        const tentacleMat = secondaryMat.clone();

        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const tentacleGroup = new THREE.Group();

            // Create segmented tentacle
            for (let seg = 0; seg < 4; seg++) {
                const segGeom = new THREE.CylinderGeometry(
                    0.06 - seg * 0.012,
                    0.08 - seg * 0.012,
                    0.25,
                    8
                );
                const segment = new THREE.Mesh(segGeom, tentacleMat);
                segment.position.y = -seg * 0.22;
                segment.rotation.x = 0.15 * seg;
                segment.castShadow = true;
                tentacleGroup.add(segment);
            }

            // Tip
            const tip = new THREE.Mesh(geom.tentacleTip, accentMat);
            tip.position.y = -0.9;
            tip.rotation.x = Math.PI;
            tentacleGroup.add(tip);

            tentacleGroup.position.set(
                Math.cos(angle) * 0.4,
                0.3,
                Math.sin(angle) * 0.4
            );
            tentacleGroup.rotation.x = Math.PI * 0.1;
            tentacleGroup.rotation.z = Math.cos(angle) * 0.2;

            group.add(tentacleGroup);
            tentacles.push(tentacleGroup);
        }

        // === WINGS ===
        const wingMat = new THREE.MeshStandardMaterial({
            color: 0x6633aa,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide,
            emissive: 0x330066,
            emissiveIntensity: 0.2
        });

        const wings = [];
        for (let side = -1; side <= 1; side += 2) {
            const wingGroup = new THREE.Group();

            // Wing membrane
            const wing = new THREE.Mesh(geom.wing, wingMat);
            wing.rotation.y = side * 0.3;
            wingGroup.add(wing);

            // Wing bones
            for (let b = 0; b < 3; b++) {
                const bone = new THREE.Mesh(geom.wingBone, secondaryMat);
                bone.position.set(side * (0.2 + b * 0.3), 0.1 - b * 0.05, 0);
                bone.rotation.z = side * (0.1 + b * 0.15);
                bone.castShadow = true;
                wingGroup.add(bone);
            }

            wingGroup.position.set(side * 0.6, 1.1, -0.1);
            group.add(wingGroup);
            wings.push(wingGroup);
        }

        // Bioluminescent spots
        const spotMat = new THREE.MeshBasicMaterial({
            color: 0x66ffff,
            transparent: true,
            opacity: 0.8
        });
        const spotGeom = new THREE.SphereGeometry(0.03, 6, 4);

        for (let i = 0; i < 12; i++) {
            const spot = new THREE.Mesh(spotGeom, spotMat);
            const angle = (i / 12) * Math.PI * 2;
            const radius = 0.35 + Math.random() * 0.15;
            spot.position.set(
                Math.cos(angle) * radius,
                0.7 + Math.random() * 0.4,
                Math.sin(angle) * radius * 0.8
            );
            group.add(spot);
        }

        return { tentacles, wings, body };
    }

    /**
     * Build detailed Wraith model - ethereal assassin with scythes
     */
    buildWraithModel(group, primaryMat, secondaryMat, accentMat) {
        const geom = this.monsterGeometries.wraith;

        // === ETHEREAL BODY ===
        const bodyMat = primaryMat.clone();
        bodyMat.transparent = true;
        bodyMat.opacity = 0.85;

        const body = new THREE.Mesh(geom.body, bodyMat);
        body.position.set(0, 0.6, -0.1);
        body.rotation.y = Math.PI;
        body.castShadow = true;
        group.add(body);

        // Cloak
        const cloakMat = new THREE.MeshStandardMaterial({
            color: 0x1a0a2e,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        const cloak = new THREE.Mesh(geom.cloak, cloakMat);
        cloak.position.set(0, 0.5, -0.2);
        cloak.rotation.x = Math.PI;
        group.add(cloak);

        // === HEAD ===
        const head = new THREE.Mesh(geom.head, primaryMat);
        head.position.set(0, 1.25, 0.15);
        head.castShadow = true;
        group.add(head);

        // Skull features
        const skull = new THREE.Mesh(geom.skull, secondaryMat);
        skull.position.set(0, 1.2, 0.22);
        skull.scale.set(0.9, 0.8, 0.8);
        group.add(skull);

        // Glowing eyes
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
        const eyeGeom = new THREE.SphereGeometry(0.04, 6, 4);
        const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
        leftEye.position.set(-0.08, 1.25, 0.35);
        group.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
        rightEye.position.set(0.08, 1.25, 0.35);
        group.add(rightEye);

        // === SCYTHE ARMS ===
        const bladeMat = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            metalness: 0.95,
            roughness: 0.05,
            emissive: 0x660066,
            emissiveIntensity: 0.1
        });

        const arms = { left: null, right: null };

        for (let side = -1; side <= 1; side += 2) {
            const armGroup = new THREE.Group();

            // Upper arm (thin, elongated)
            const upperArm = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.05, 0.5, 6),
                secondaryMat
            );
            upperArm.position.y = 0.85;
            upperArm.rotation.z = side * 0.3;
            upperArm.castShadow = true;
            armGroup.add(upperArm);

            // Forearm
            const forearm = new THREE.Mesh(
                new THREE.CylinderGeometry(0.03, 0.04, 0.45, 6),
                secondaryMat
            );
            forearm.position.set(side * 0.15, 0.55, 0.1);
            forearm.rotation.z = side * 0.15;
            forearm.castShadow = true;
            armGroup.add(forearm);

            // Blade
            const blade = new THREE.Mesh(geom.blade, bladeMat);
            blade.position.set(side * 0.25, 0.3, 0.2);
            blade.rotation.z = side * -0.3;
            blade.castShadow = true;
            armGroup.add(blade);

            // Blade edge glow
            const edgeMat = accentMat.clone();
            const edge = new THREE.Mesh(geom.bladeEdge, edgeMat);
            edge.position.set(side * 0.28, 0.3, 0.22);
            edge.rotation.z = side * -0.3;
            armGroup.add(edge);

            armGroup.position.set(side * 0.35, 0, 0);
            group.add(armGroup);

            if (side < 0) arms.left = armGroup;
            else arms.right = armGroup;
        }

        // === ETHEREAL WISPS ===
        const wisps = [];
        const wispMat = new THREE.MeshBasicMaterial({
            color: 0xaa66ff,
            transparent: true,
            opacity: 0.6
        });

        for (let i = 0; i < 6; i++) {
            const wisp = new THREE.Mesh(geom.wisp, wispMat);
            wisp.position.set(
                (Math.random() - 0.5) * 0.8,
                0.3 + Math.random() * 0.8,
                (Math.random() - 0.5) * 0.6
            );
            wisp.scale.setScalar(0.5 + Math.random() * 0.5);
            group.add(wisp);
            wisps.push(wisp);
        }

        // Trail effect
        const trailMat = new THREE.MeshBasicMaterial({
            color: 0x660066,
            transparent: true,
            opacity: 0.25
        });
        const trail = new THREE.Mesh(
            new THREE.ConeGeometry(0.4, 1.2, 8),
            trailMat
        );
        trail.position.set(0, 0.4, -0.5);
        trail.rotation.x = Math.PI / 2;
        group.add(trail);

        return { arms, wisps, body, trail };
    }

    /**
     * Build detailed Behemoth model - massive armored tank
     */
    buildBehemothModel(group, primaryMat, secondaryMat, accentMat) {
        const geom = this.monsterGeometries.behemoth;

        // === MAIN BODY (shell-like) ===
        const body = new THREE.Mesh(geom.body, primaryMat);
        body.position.y = 0.7;
        body.scale.set(1.1, 0.8, 1);
        body.castShadow = true;
        group.add(body);

        // Shell plates on top
        const shellMat = new THREE.MeshStandardMaterial({
            color: 0x3a2a1a,
            roughness: 0.9,
            metalness: 0.1,
            flatShading: true
        });

        const plates = [];
        for (let i = 0; i < 10; i++) {
            const plate = new THREE.Mesh(geom.plate, shellMat);
            const angle = (i / 10) * Math.PI * 2;
            const radius = 0.6 + (Math.random() - 0.5) * 0.2;
            plate.position.set(
                Math.cos(angle) * radius,
                0.9 + Math.random() * 0.25,
                Math.sin(angle) * radius
            );
            plate.rotation.set(
                (Math.random() - 0.5) * 0.4,
                angle,
                (Math.random() - 0.5) * 0.3
            );
            plate.scale.setScalar(0.8 + Math.random() * 0.4);
            plate.castShadow = true;
            group.add(plate);
            plates.push(plate);
        }

        // === HEAD ===
        const head = new THREE.Mesh(geom.head, primaryMat);
        head.position.set(0, 0.6, 0.7);
        head.castShadow = true;
        group.add(head);

        // Snout
        const snout = new THREE.Mesh(geom.snout, secondaryMat);
        snout.position.set(0, 0.5, 0.95);
        snout.castShadow = true;
        group.add(snout);

        // Eyes (small, armored)
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
        for (let side = -1; side <= 1; side += 2) {
            const eye = new THREE.Mesh(geom.eye, eyeMat);
            eye.position.set(side * 0.15, 0.7, 0.8);
            group.add(eye);
        }

        // === LEGS (thick, armored) ===
        const legs = [];
        const legPositions = [
            { x: -0.55, z: 0.4 },
            { x: 0.55, z: 0.4 },
            { x: -0.55, z: -0.4 },
            { x: 0.55, z: -0.4 }
        ];

        for (const pos of legPositions) {
            const legGroup = new THREE.Group();

            const leg = new THREE.Mesh(geom.leg, primaryMat);
            leg.position.y = 0.25;
            leg.castShadow = true;
            legGroup.add(leg);

            const foot = new THREE.Mesh(geom.foot, secondaryMat);
            foot.position.y = -0.05;
            foot.castShadow = true;
            legGroup.add(foot);

            // Claws
            for (let c = 0; c < 3; c++) {
                const claw = new THREE.Mesh(geom.claw, shellMat);
                const clawAngle = ((c - 1) / 3) * Math.PI * 0.5;
                claw.position.set(
                    Math.cos(clawAngle) * 0.2,
                    -0.1,
                    Math.sin(clawAngle) * 0.15 + 0.15
                );
                claw.rotation.x = -0.5;
                claw.rotation.z = clawAngle * 0.5;
                claw.castShadow = true;
                legGroup.add(claw);
            }

            legGroup.position.set(pos.x, 0.2, pos.z);
            group.add(legGroup);
            legs.push(legGroup);
        }

        // === SPIKES (on back) ===
        const spikes = [];
        for (let i = 0; i < 5; i++) {
            const spike = new THREE.Mesh(geom.spike, accentMat);
            spike.position.set(
                (Math.random() - 0.5) * 0.4,
                1.1 + Math.random() * 0.2,
                (Math.random() - 0.5) * 0.6
            );
            spike.rotation.set(
                (Math.random() - 0.5) * 0.3,
                Math.random() * Math.PI,
                (Math.random() - 0.5) * 0.3
            );
            spike.scale.setScalar(0.7 + Math.random() * 0.5);
            spike.castShadow = true;
            group.add(spike);
            spikes.push(spike);
        }

        // === TAIL ===
        const tail = new THREE.Mesh(geom.tail, primaryMat);
        tail.position.set(0, 0.5, -0.8);
        tail.rotation.x = 0.3;
        tail.castShadow = true;
        group.add(tail);

        // Tail spikes
        for (let i = 0; i < 3; i++) {
            const tailSpike = new THREE.Mesh(geom.spike, accentMat);
            tailSpike.position.set(0, 0.5 + i * 0.05, -0.9 - i * 0.2);
            tailSpike.rotation.x = 0.5 + i * 0.15;
            tailSpike.scale.setScalar(0.5 - i * 0.1);
            tailSpike.castShadow = true;
            group.add(tailSpike);
        }

        // Lava cracks (glowing lines on shell)
        const crackMat = new THREE.MeshBasicMaterial({
            color: 0xff4400,
            transparent: true,
            opacity: 0.8
        });
        for (let i = 0; i < 5; i++) {
            const crack = new THREE.Mesh(
                new THREE.BoxGeometry(0.02, 0.15, 0.3),
                crackMat
            );
            const angle = (i / 5) * Math.PI * 2 + 0.3;
            crack.position.set(
                Math.cos(angle) * 0.65,
                0.85,
                Math.sin(angle) * 0.65
            );
            crack.rotation.y = angle;
            group.add(crack);
        }

        return { legs, plates, spikes, tail, body };
    }

    /**
     * Create wildlife mesh - enhanced with organic detail
     */
    createWildlifeMesh(entity) {
        const group = new THREE.Group();
        const wildlifeType = entity.wildlifeType || entity.type || 'small';
        const color = new THREE.Color(entity.color || 0x8B4513);

        const primaryMat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.8,
            metalness: 0,
            flatShading: true
        });

        const secondaryMat = new THREE.MeshStandardMaterial({
            color: color.clone().multiplyScalar(0.7),
            roughness: 0.9,
            metalness: 0
        });

        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

        switch (wildlifeType) {
            case 'small':
                this.buildSmallWildlife(group, primaryMat, secondaryMat, eyeMat);
                break;
            case 'medium':
                this.buildMediumWildlife(group, primaryMat, secondaryMat, eyeMat);
                break;
            case 'large':
                this.buildLargeWildlife(group, primaryMat, secondaryMat, eyeMat);
                break;
            default:
                this.buildSmallWildlife(group, primaryMat, secondaryMat, eyeMat);
        }

        const gameScale = this.modelScale * 0.9;
        group.scale.set(gameScale, gameScale, gameScale);

        group.userData = { entity, type: 'wildlife', wildlifeType };

        return group;
    }

    buildSmallWildlife(group, primaryMat, secondaryMat, eyeMat) {
        const geom = this.wildlifeGeometries.small;

        // Body
        const body = new THREE.Mesh(geom.body, primaryMat);
        body.position.y = 0.12;
        body.scale.set(1, 0.8, 1.2);
        body.castShadow = true;
        group.add(body);

        // Head
        const head = new THREE.Mesh(geom.head, primaryMat);
        head.position.set(0, 0.15, 0.12);
        head.castShadow = true;
        group.add(head);

        // Ears
        for (let side = -1; side <= 1; side += 2) {
            const ear = new THREE.Mesh(geom.ear, secondaryMat);
            ear.position.set(side * 0.04, 0.22, 0.1);
            ear.rotation.z = side * 0.3;
            group.add(ear);
        }

        // Eyes
        const eyeGeom = new THREE.SphereGeometry(0.015, 4, 4);
        for (let side = -1; side <= 1; side += 2) {
            const eye = new THREE.Mesh(eyeGeom, eyeMat);
            eye.position.set(side * 0.03, 0.17, 0.18);
            group.add(eye);
        }

        // Legs
        for (let i = 0; i < 4; i++) {
            const leg = new THREE.Mesh(geom.leg, secondaryMat);
            const xPos = (i % 2 === 0 ? -1 : 1) * 0.05;
            const zPos = (i < 2 ? 1 : -1) * 0.06;
            leg.position.set(xPos, 0.03, zPos);
            leg.castShadow = true;
            group.add(leg);
        }

        // Fluffy tail
        const tailGeom = new THREE.SphereGeometry(0.04, 6, 4);
        const tail = new THREE.Mesh(tailGeom, primaryMat);
        tail.position.set(0, 0.12, -0.14);
        group.add(tail);
    }

    buildMediumWildlife(group, primaryMat, secondaryMat, eyeMat) {
        const geom = this.wildlifeGeometries.medium;

        // Body
        const body = new THREE.Mesh(geom.body, primaryMat);
        body.position.y = 0.18;
        body.rotation.x = Math.PI / 2;
        body.castShadow = true;
        group.add(body);

        // Head
        const head = new THREE.Mesh(geom.head, primaryMat);
        head.position.set(0, 0.2, 0.2);
        head.castShadow = true;
        group.add(head);

        // Snout
        const snout = new THREE.Mesh(geom.snout, secondaryMat);
        snout.position.set(0, 0.17, 0.28);
        group.add(snout);

        // Ears
        for (let side = -1; side <= 1; side += 2) {
            const ear = new THREE.Mesh(geom.ear, secondaryMat);
            ear.position.set(side * 0.06, 0.28, 0.18);
            ear.rotation.z = side * 0.2;
            group.add(ear);
        }

        // Eyes
        const eyeGeom = new THREE.SphereGeometry(0.02, 6, 4);
        for (let side = -1; side <= 1; side += 2) {
            const eye = new THREE.Mesh(eyeGeom, eyeMat);
            eye.position.set(side * 0.04, 0.22, 0.26);
            group.add(eye);
        }

        // Legs
        for (let i = 0; i < 4; i++) {
            const leg = new THREE.Mesh(geom.leg, secondaryMat);
            const xPos = (i % 2 === 0 ? -1 : 1) * 0.08;
            const zPos = (i < 2 ? 1 : -1) * 0.1;
            leg.position.set(xPos, 0.08, zPos);
            leg.castShadow = true;
            group.add(leg);
        }

        // Tail
        const tail = new THREE.Mesh(geom.tail, secondaryMat);
        tail.position.set(0, 0.22, -0.2);
        tail.rotation.x = 0.5;
        group.add(tail);
    }

    buildLargeWildlife(group, primaryMat, secondaryMat, eyeMat) {
        const geom = this.wildlifeGeometries.large;

        // Body
        const body = new THREE.Mesh(geom.body, primaryMat);
        body.position.y = 0.35;
        body.scale.set(1, 0.8, 1.2);
        body.castShadow = true;
        group.add(body);

        // Head
        const head = new THREE.Mesh(geom.head, primaryMat);
        head.position.set(0, 0.4, 0.3);
        head.castShadow = true;
        group.add(head);

        // Jaw
        const jaw = new THREE.Mesh(geom.jaw, secondaryMat);
        jaw.position.set(0, 0.33, 0.38);
        group.add(jaw);

        // Eyes
        const eyeGeom = new THREE.SphereGeometry(0.025, 6, 4);
        for (let side = -1; side <= 1; side += 2) {
            const eye = new THREE.Mesh(eyeGeom, eyeMat);
            eye.position.set(side * 0.06, 0.42, 0.4);
            group.add(eye);
        }

        // Legs
        for (let i = 0; i < 2; i++) {
            const leg = new THREE.Mesh(geom.leg, secondaryMat);
            const xPos = (i === 0 ? -1 : 1) * 0.15;
            leg.position.set(xPos, 0.12, 0);
            leg.castShadow = true;
            group.add(leg);
        }

        // Small arms
        for (let side = -1; side <= 1; side += 2) {
            const arm = new THREE.Mesh(geom.arm, secondaryMat);
            arm.position.set(side * 0.2, 0.35, 0.15);
            arm.rotation.z = side * 0.5;
            group.add(arm);
        }

        // Tail
        const tail = new THREE.Mesh(geom.tail, primaryMat);
        tail.position.set(0, 0.25, -0.35);
        tail.rotation.x = 0.4;
        tail.castShadow = true;
        group.add(tail);

        // Back spikes
        for (let i = 0; i < 4; i++) {
            const spike = new THREE.Mesh(geom.spike, secondaryMat);
            spike.position.set(0, 0.45 + i * 0.05, -0.1 - i * 0.08);
            spike.rotation.x = -0.3;
            spike.scale.setScalar(0.8 - i * 0.15);
            group.add(spike);
        }
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
     * Update mesh position and state with enhanced animations
     */
    updateMesh(entity, gameMap, time) {
        const mesh = this.characterMeshes.get(entity.id);
        if (!mesh) return;

        // Convert game coords to 3D
        const x = (entity.x - gameMap.width / 2) * this.scale;
        const z = (entity.y - gameMap.height / 2) * this.scale;

        // Calculate movement speed for animations
        const prevX = mesh.position.x;
        const prevZ = mesh.position.z;

        // Update position with smooth interpolation
        mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, x, 0.2);
        mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, z, 0.2);

        const moveSpeed = Math.sqrt(
            Math.pow(mesh.position.x - prevX, 2) +
            Math.pow(mesh.position.z - prevZ, 2)
        );
        const isMoving = moveSpeed > 0.001;

        // Base bob animation (varies by entity type)
        let bobAmount = 0.02;
        let bobSpeed = 5;

        if (mesh.userData.type === 'monster') {
            bobAmount = 0.03;
            bobSpeed = 3;
        } else if (mesh.userData.type === 'wildlife') {
            bobAmount = 0.015;
            bobSpeed = 8;
        }

        mesh.position.y = Math.sin(time * bobSpeed + entity.id.charCodeAt(0)) * bobAmount;

        // Update rotation to face movement direction
        if (entity.facingAngle !== undefined) {
            const targetRotation = -entity.facingAngle + Math.PI / 2;
            mesh.rotation.y = THREE.MathUtils.lerp(
                mesh.rotation.y,
                targetRotation,
                0.15
            );
        }

        // === TYPE-SPECIFIC ANIMATIONS ===
        if (mesh.userData.type === 'hunter' && mesh.userData.animParts) {
            this.animateHunter(mesh, time, isMoving);
        } else if (mesh.userData.type === 'monster' && mesh.userData.animParts) {
            this.animateMonster(mesh, time, isMoving, entity);
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
                if (child.material && child.material.opacity !== undefined && !child.material.userData?.keepOpacity) {
                    // Don't reset opacity for intentionally transparent materials
                    if (child.material.opacity < 1 && !mesh.userData.type === 'monster') {
                        child.material.opacity = 1;
                    }
                }
            });
        }

        // Update monster evolution visuals
        if (entity instanceof Monster) {
            if (mesh.userData.aura) {
                mesh.userData.aura.material.opacity = 0.08 * entity.evolutionStage;
                mesh.userData.aura.scale.setScalar(1 + Math.sin(time * 2) * 0.08);
            }
            if (mesh.userData.innerAura) {
                mesh.userData.innerAura.material.opacity = 0.05 * entity.evolutionStage;
                mesh.userData.innerAura.scale.setScalar(1 + Math.sin(time * 3 + 1) * 0.05);
            }

            // Update emissive intensity based on evolution
            if (mesh.userData.primaryMaterial) {
                mesh.userData.primaryMaterial.emissiveIntensity = 0.1 + (entity.evolutionStage - 1) * 0.15;
            }
            if (mesh.userData.accentMaterial) {
                mesh.userData.accentMaterial.emissiveIntensity = 0.3 + (entity.evolutionStage - 1) * 0.2 + Math.sin(time * 4) * 0.1;
            }
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
     * Animate hunter model
     */
    animateHunter(mesh, time, isMoving) {
        const parts = mesh.userData.animParts;
        if (!parts) return;

        const walkCycle = time * 8;
        const walkAmplitude = isMoving ? 0.3 : 0.05;

        // Arm swing
        if (parts.leftArm) {
            parts.leftArm.rotation.x = Math.sin(walkCycle) * walkAmplitude;
        }
        if (parts.rightArm) {
            parts.rightArm.rotation.x = -Math.sin(walkCycle) * walkAmplitude;
        }

        // Leg movement
        if (parts.leftLeg) {
            parts.leftLeg.rotation.x = -Math.sin(walkCycle) * walkAmplitude * 0.5;
        }
        if (parts.rightLeg) {
            parts.rightLeg.rotation.x = Math.sin(walkCycle) * walkAmplitude * 0.5;
        }
    }

    /**
     * Animate monster model based on type
     */
    animateMonster(mesh, time, isMoving, entity) {
        const parts = mesh.userData.animParts;
        const monsterType = mesh.userData.monsterType;
        if (!parts) return;

        switch (monsterType) {
            case 'goliath':
                this.animateGoliath(parts, time, isMoving);
                break;
            case 'kraken':
                this.animateKraken(parts, time, isMoving);
                break;
            case 'wraith':
                this.animateWraith(parts, time, isMoving);
                break;
            case 'behemoth':
                this.animateBehemoth(parts, time, isMoving);
                break;
        }
    }

    animateGoliath(parts, time, isMoving) {
        if (parts.arms) {
            const swingSpeed = isMoving ? 6 : 2;
            const swingAmount = isMoving ? 0.4 : 0.1;

            if (parts.arms.left && parts.arms.left[0]) {
                parts.arms.left[0].rotation.x = Math.sin(time * swingSpeed) * swingAmount;
            }
            if (parts.arms.right && parts.arms.right[0]) {
                parts.arms.right[0].rotation.x = -Math.sin(time * swingSpeed) * swingAmount;
            }
        }
    }

    animateKraken(parts, time, isMoving) {
        // Tentacle wave animation
        if (parts.tentacles) {
            parts.tentacles.forEach((tentacle, i) => {
                const offset = (i / parts.tentacles.length) * Math.PI * 2;
                tentacle.rotation.x = Math.PI * 0.1 + Math.sin(time * 3 + offset) * 0.2;
                tentacle.rotation.z = Math.cos(time * 2 + offset) * 0.15;
            });
        }

        // Wing flap
        if (parts.wings) {
            parts.wings.forEach((wing, i) => {
                const side = i === 0 ? 1 : -1;
                wing.rotation.z = side * (0.1 + Math.sin(time * 4) * 0.15);
            });
        }
    }

    animateWraith(parts, time, isMoving) {
        // Ethereal float
        if (parts.wisps) {
            parts.wisps.forEach((wisp, i) => {
                const offset = i * 1.5;
                wisp.position.y = 0.3 + Math.sin(time * 2 + offset) * 0.15 + Math.random() * 0.02;
                wisp.position.x = (Math.random() - 0.5) * 0.01 + wisp.position.x * 0.99;
            });
        }

        // Arm sway
        if (parts.arms) {
            if (parts.arms.left) {
                parts.arms.left.rotation.z = -0.3 + Math.sin(time * 2) * 0.1;
            }
            if (parts.arms.right) {
                parts.arms.right.rotation.z = 0.3 - Math.sin(time * 2) * 0.1;
            }
        }

        // Trail pulse
        if (parts.trail) {
            parts.trail.scale.x = 1 + Math.sin(time * 3) * 0.1;
            parts.trail.scale.y = 1 + Math.sin(time * 3) * 0.05;
        }
    }

    animateBehemoth(parts, time, isMoving) {
        // Leg stomp animation
        if (parts.legs && isMoving) {
            parts.legs.forEach((leg, i) => {
                const offset = (i / parts.legs.length) * Math.PI;
                leg.position.y = 0.2 + Math.abs(Math.sin(time * 4 + offset)) * 0.05;
            });
        }

        // Tail sway
        if (parts.tail) {
            parts.tail.rotation.y = Math.sin(time * 2) * 0.2;
        }

        // Shell plate subtle movement
        if (parts.plates) {
            parts.plates.forEach((plate, i) => {
                const offset = i * 0.5;
                plate.rotation.x += Math.sin(time + offset) * 0.001;
            });
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
