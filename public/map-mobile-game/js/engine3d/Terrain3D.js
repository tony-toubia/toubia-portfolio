/**
 * 3D Terrain System for Primal Hunt
 * Procedurally generated terrain with enhanced textures and details
 */

class Terrain3D {
    constructor(renderer, gameMap) {
        this.renderer = renderer;
        this.gameMap = gameMap;
        this.meshes = [];

        // Scale factor: game units to 3D units
        this.scale = 0.05;

        // Procedural textures
        this.textures = {};
        this.createProceduralTextures();

        // Create terrain
        this.createTerrain();
        this.createObstacles();
        this.createWater();
        this.createVegetation();
        this.createAtmosphericEffects();
    }

    /**
     * Create procedural textures for terrain
     */
    createProceduralTextures() {
        // Grass texture
        this.textures.grass = this.createGrassTexture();
        // Rock texture
        this.textures.rock = this.createRockTexture();
        // Dirt texture
        this.textures.dirt = this.createDirtTexture();
        // Sand texture (for water edges)
        this.textures.sand = this.createSandTexture();
    }

    createGrassTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Base green
        ctx.fillStyle = '#2d5016';
        ctx.fillRect(0, 0, 256, 256);

        // Add grass blade patterns
        for (let i = 0; i < 1000; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            const shade = Math.floor(Math.random() * 40) - 20;

            ctx.strokeStyle = `rgb(${45 + shade}, ${80 + shade}, ${22 + shade})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (Math.random() - 0.5) * 4, y - Math.random() * 8);
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(20, 20);
        return texture;
    }

    createRockTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Base gray
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(0, 0, 256, 256);

        // Add rock patterns
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            const size = Math.random() * 20 + 5;
            const shade = Math.floor(Math.random() * 60) - 30;

            ctx.fillStyle = `rgb(${90 + shade}, ${90 + shade}, ${90 + shade})`;
            ctx.beginPath();
            ctx.ellipse(x, y, size, size * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }

        // Add cracks
        for (let i = 0; i < 30; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;

            ctx.strokeStyle = '#3a3a3a';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y);

            let cx = x, cy = y;
            for (let j = 0; j < 5; j++) {
                cx += (Math.random() - 0.5) * 30;
                cy += Math.random() * 20;
                ctx.lineTo(cx, cy);
            }
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(15, 15);
        return texture;
    }

    createDirtTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Base brown
        ctx.fillStyle = '#5a4030';
        ctx.fillRect(0, 0, 256, 256);

        // Add dirt speckles
        for (let i = 0; i < 2000; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            const size = Math.random() * 3 + 1;
            const shade = Math.floor(Math.random() * 40) - 20;

            ctx.fillStyle = `rgb(${90 + shade}, ${64 + shade}, ${48 + shade})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(25, 25);
        return texture;
    }

    createSandTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Base sand color
        ctx.fillStyle = '#c4a060';
        ctx.fillRect(0, 0, 256, 256);

        // Add sand grains
        for (let i = 0; i < 3000; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            const size = Math.random() * 2 + 0.5;
            const shade = Math.floor(Math.random() * 30) - 15;

            ctx.fillStyle = `rgb(${196 + shade}, ${160 + shade}, ${96 + shade})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(30, 30);
        return texture;
    }

    createTerrain() {
        const width = this.gameMap.width * this.scale;
        const height = this.gameMap.height * this.scale;

        // Create heightmap-based terrain with higher resolution
        const resolution = 192;
        const geometry = new THREE.PlaneGeometry(width, height, resolution, resolution);

        // Generate height data with improved noise
        const positions = geometry.attributes.position.array;
        const uvs = geometry.attributes.uv.array;

        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 1]; // Note: PlaneGeometry is XY, we rotate to XZ

            // Convert to game coordinates
            const gameX = (x / this.scale) + this.gameMap.width / 2;
            const gameY = (z / this.scale) + this.gameMap.height / 2;

            // Get terrain type
            const tileX = Math.floor(gameX / this.gameMap.tileSize);
            const tileY = Math.floor(gameY / this.gameMap.tileSize);

            let heightVal = 0;

            if (this.gameMap.isValidTile(tileX, tileY)) {
                const tile = this.gameMap.terrain[tileY]?.[tileX];
                switch (tile) {
                    case TerrainType.WATER:
                        heightVal = -0.5;
                        break;
                    case TerrainType.FOREST:
                        heightVal = 0.1 + this.fbmNoise(x * 3, z * 3) * 0.15;
                        break;
                    case TerrainType.ROCK:
                        heightVal = 0.8 + this.fbmNoise(x * 2, z * 2) * 0.6;
                        break;
                    case TerrainType.CAVE:
                        heightVal = -0.2 + this.noise(x * 5, z * 5) * 0.1;
                        break;
                    default:
                        // Multi-octave noise for natural variation
                        heightVal = this.fbmNoise(x * 2, z * 2) * 0.3;
                }
            }

            positions[i + 2] = heightVal;
        }

        geometry.computeVertexNormals();

        // Create splat map for texture blending
        const colors = [];
        const terrainTypes = []; // Store terrain type per vertex for texture splatting

        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 1];
            const y = positions[i + 2];

            // Calculate slope from normal
            const idx = i / 3;
            const nx = geometry.attributes.normal.array[i];
            const ny = geometry.attributes.normal.array[i + 1];
            const nz = geometry.attributes.normal.array[i + 2];
            const slope = 1.0 - Math.abs(ny);

            let color;
            let terrainType = 0; // 0=grass, 1=rock, 2=dirt, 3=sand

            if (y < -0.35) {
                // Deep water edge - sand
                color = new THREE.Color(0xc4a060);
                terrainType = 3;
            } else if (y < -0.1) {
                // Near water - sandy dirt
                const blend = (y + 0.35) / 0.25;
                color = new THREE.Color(0xc4a060).lerp(new THREE.Color(0x5a4030), blend);
                terrainType = blend > 0.5 ? 2 : 3;
            } else if (slope > 0.5) {
                // Steep slopes - rock
                color = new THREE.Color(0x5a5a5a).lerp(new THREE.Color(0x7a7a7a), this.noise(x * 10, z * 10) * 0.3);
                terrainType = 1;
            } else if (y > 0.6) {
                // High ground - rock/dirt mix
                const blend = this.noise(x * 5, z * 5);
                color = new THREE.Color(0x5a5a5a).lerp(new THREE.Color(0x5a4030), blend);
                terrainType = blend > 0.5 ? 2 : 1;
            } else if (y < 0.15) {
                // Low ground - mix of grass and dirt
                const blend = this.noise(x * 8, z * 8);
                color = new THREE.Color(0x2d5016).lerp(new THREE.Color(0x5a4030), blend * 0.4);
                terrainType = blend > 0.7 ? 2 : 0;
            } else {
                // Normal ground - lush grass with variation
                const variation = this.noise(x * 15, z * 15) * 0.3;
                color = new THREE.Color(0x2d5016).lerp(new THREE.Color(0x3d7020), variation);
                terrainType = 0;
            }

            colors.push(color.r, color.g, color.b);
            terrainTypes.push(terrainType);
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('terrainType', new THREE.Float32BufferAttribute(terrainTypes, 1));

        // Create enhanced material with procedural blending
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.85,
            metalness: 0.0,
            flatShading: false,
            map: this.textures.grass
        });

        // Create mesh
        this.terrainMesh = new THREE.Mesh(geometry, material);
        this.terrainMesh.rotation.x = -Math.PI / 2; // Rotate to XZ plane
        this.terrainMesh.receiveShadow = true;
        this.terrainMesh.castShadow = false;

        this.renderer.addToScene(this.terrainMesh);
        this.meshes.push(this.terrainMesh);
    }

    createWater() {
        const width = this.gameMap.width * this.scale;
        const height = this.gameMap.height * this.scale;

        // Enhanced water with multiple layers
        const resolution = 64;
        const geometry = new THREE.PlaneGeometry(width, height, resolution, resolution);

        // Create animated water material
        const material = new THREE.MeshStandardMaterial({
            color: 0x1a7090,
            transparent: true,
            opacity: 0.75,
            roughness: 0.05,
            metalness: 0.4,
            envMapIntensity: 1.0
        });

        this.waterMesh = new THREE.Mesh(geometry, material);
        this.waterMesh.rotation.x = -Math.PI / 2;
        this.waterMesh.position.y = -0.4;
        this.waterMesh.receiveShadow = true;

        // Store geometry reference for wave animation
        this.waterGeometry = geometry;
        this.waterBasePositions = Float32Array.from(geometry.attributes.position.array);

        this.renderer.addToScene(this.waterMesh);
        this.meshes.push(this.waterMesh);

        // Add foam layer
        this.createWaterFoam(width, height);

        // Add underwater caustics effect
        this.createCaustics(width, height);
    }

    createWaterFoam(width, height) {
        const foamGeometry = new THREE.PlaneGeometry(width, height);
        const foamMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.15,
            blending: THREE.AdditiveBlending
        });

        this.foamMesh = new THREE.Mesh(foamGeometry, foamMaterial);
        this.foamMesh.rotation.x = -Math.PI / 2;
        this.foamMesh.position.y = -0.38;

        this.renderer.addToScene(this.foamMesh);
        this.meshes.push(this.foamMesh);
    }

    createCaustics(width, height) {
        // Create caustic pattern texture
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 256, 256);

        // Caustic pattern
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            const size = Math.random() * 30 + 10;

            const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
            gradient.addColorStop(0, 'rgba(100, 200, 255, 0.3)');
            gradient.addColorStop(0.5, 'rgba(50, 150, 255, 0.1)');
            gradient.addColorStop(1, 'rgba(0, 100, 200, 0)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        const causticTexture = new THREE.CanvasTexture(canvas);
        causticTexture.wrapS = THREE.RepeatWrapping;
        causticTexture.wrapT = THREE.RepeatWrapping;
        causticTexture.repeat.set(10, 10);

        const causticGeometry = new THREE.PlaneGeometry(width * 0.8, height * 0.8);
        const causticMaterial = new THREE.MeshBasicMaterial({
            map: causticTexture,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending
        });

        this.causticMesh = new THREE.Mesh(causticGeometry, causticMaterial);
        this.causticMesh.rotation.x = -Math.PI / 2;
        this.causticMesh.position.y = -0.55;

        this.renderer.addToScene(this.causticMesh);
        this.meshes.push(this.causticMesh);

        this.causticTexture = causticTexture;
    }

    createAtmosphericEffects() {
        // Add fog particles
        this.createFogParticles();

        // Add ambient dust motes
        this.createDustMotes();
    }

    createFogParticles() {
        const fogCount = 100;
        const fogGeometry = new THREE.BufferGeometry();
        const fogPositions = new Float32Array(fogCount * 3);
        const fogSizes = new Float32Array(fogCount);

        for (let i = 0; i < fogCount; i++) {
            fogPositions[i * 3] = (Math.random() - 0.5) * this.gameMap.width * this.scale;
            fogPositions[i * 3 + 1] = Math.random() * 2 + 0.5;
            fogPositions[i * 3 + 2] = (Math.random() - 0.5) * this.gameMap.height * this.scale;
            fogSizes[i] = Math.random() * 2 + 1;
        }

        fogGeometry.setAttribute('position', new THREE.BufferAttribute(fogPositions, 3));
        fogGeometry.setAttribute('size', new THREE.BufferAttribute(fogSizes, 1));

        const fogMaterial = new THREE.PointsMaterial({
            color: 0xaaccdd,
            size: 3,
            transparent: true,
            opacity: 0.15,
            sizeAttenuation: true,
            blending: THREE.AdditiveBlending
        });

        this.fogParticles = new THREE.Points(fogGeometry, fogMaterial);
        this.renderer.addToScene(this.fogParticles);
        this.meshes.push(this.fogParticles);
    }

    createDustMotes() {
        const dustCount = 200;
        const dustGeometry = new THREE.BufferGeometry();
        const dustPositions = new Float32Array(dustCount * 3);

        for (let i = 0; i < dustCount; i++) {
            dustPositions[i * 3] = (Math.random() - 0.5) * this.gameMap.width * this.scale * 0.5;
            dustPositions[i * 3 + 1] = Math.random() * 3;
            dustPositions[i * 3 + 2] = (Math.random() - 0.5) * this.gameMap.height * this.scale * 0.5;
        }

        dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));

        const dustMaterial = new THREE.PointsMaterial({
            color: 0xffffee,
            size: 0.05,
            transparent: true,
            opacity: 0.4,
            sizeAttenuation: true
        });

        this.dustMotes = new THREE.Points(dustGeometry, dustMaterial);
        this.dustPositions = dustPositions;
        this.renderer.addToScene(this.dustMotes);
        this.meshes.push(this.dustMotes);
    }

    createObstacles() {
        const rockGeometry = new THREE.DodecahedronGeometry(1, 1);
        const rockMaterial = new THREE.MeshStandardMaterial({
            color: 0x5a5a5a,
            roughness: 0.9,
            metalness: 0.1,
            flatShading: true
        });

        for (const obs of this.gameMap.obstacles) {
            if (obs.type === 'rock') {
                const mesh = new THREE.Mesh(rockGeometry.clone(), rockMaterial.clone());
                const scale = obs.radius * this.scale * 0.8;
                mesh.scale.set(scale, scale * 0.7, scale);

                // Random rotation for variety
                mesh.rotation.x = Math.random() * Math.PI;
                mesh.rotation.y = Math.random() * Math.PI * 2;

                mesh.position.set(
                    (obs.x - this.gameMap.width / 2) * this.scale,
                    scale * 0.3,
                    (obs.y - this.gameMap.height / 2) * this.scale
                );

                mesh.castShadow = true;
                mesh.receiveShadow = true;

                this.renderer.addToScene(mesh);
                this.meshes.push(mesh);
            }
        }
    }

    createVegetation() {
        // Tree trunk geometry
        const trunkGeometry = new THREE.CylinderGeometry(0.1, 0.15, 1, 6);
        const trunkMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a3728,
            roughness: 0.9
        });

        // Foliage geometry (low-poly cone/sphere)
        const foliageGeometry = new THREE.ConeGeometry(0.5, 1.2, 6);
        const foliageMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d5a1e,
            roughness: 0.8,
            flatShading: true
        });

        // Create trees from obstacles
        for (const obs of this.gameMap.obstacles) {
            if (obs.type === 'tree') {
                const treeGroup = new THREE.Group();

                // Trunk
                const trunk = new THREE.Mesh(trunkGeometry.clone(), trunkMaterial.clone());
                trunk.position.y = 0.5;
                trunk.castShadow = true;
                treeGroup.add(trunk);

                // Foliage layers
                for (let i = 0; i < 3; i++) {
                    const foliage = new THREE.Mesh(foliageGeometry.clone(), foliageMaterial.clone());
                    foliage.material.color.setHex(
                        i === 0 ? 0x2d5a1e : (i === 1 ? 0x3d7a2e : 0x4d8a3e)
                    );
                    foliage.position.y = 1.0 + i * 0.4;
                    foliage.scale.set(1 - i * 0.2, 1 - i * 0.15, 1 - i * 0.2);
                    foliage.castShadow = true;
                    treeGroup.add(foliage);
                }

                // Scale and position
                const scale = obs.radius * this.scale * 0.1;
                treeGroup.scale.set(scale, scale * 1.5, scale);
                treeGroup.position.set(
                    (obs.x - this.gameMap.width / 2) * this.scale,
                    0,
                    (obs.y - this.gameMap.height / 2) * this.scale
                );

                // Random rotation
                treeGroup.rotation.y = Math.random() * Math.PI * 2;

                this.renderer.addToScene(treeGroup);
                this.meshes.push(treeGroup);
            }
        }

        // Add grass patches (instanced for performance)
        this.createGrass();
    }

    createGrass() {
        const grassCount = 500;
        const grassGeometry = new THREE.ConeGeometry(0.05, 0.2, 4);
        const grassMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a8030,
            roughness: 0.9,
            flatShading: true
        });

        const dummy = new THREE.Object3D();
        const instancedMesh = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCount);

        for (let i = 0; i < grassCount; i++) {
            const x = (Math.random() - 0.5) * this.gameMap.width * this.scale;
            const z = (Math.random() - 0.5) * this.gameMap.height * this.scale;

            dummy.position.set(x, 0.1, z);
            dummy.rotation.y = Math.random() * Math.PI * 2;
            dummy.scale.setScalar(0.5 + Math.random() * 0.5);
            dummy.updateMatrix();

            instancedMesh.setMatrixAt(i, dummy.matrix);
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        this.renderer.addToScene(instancedMesh);
        this.meshes.push(instancedMesh);
    }

    /**
     * Simple noise function for terrain variation
     */
    noise(x, y) {
        const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        return n - Math.floor(n);
    }

    /**
     * Fractal Brownian Motion noise for more natural terrain
     */
    fbmNoise(x, y, octaves = 4) {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            value += this.noise(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= 0.5;
            frequency *= 2;
        }

        return value / maxValue;
    }

    /**
     * Update terrain animations
     */
    update(time) {
        // Animate water waves
        if (this.waterMesh && this.waterGeometry && this.waterBasePositions) {
            const positions = this.waterGeometry.attributes.position.array;

            for (let i = 0; i < positions.length; i += 3) {
                const baseX = this.waterBasePositions[i];
                const baseZ = this.waterBasePositions[i + 1];

                // Multi-frequency wave animation
                const wave1 = Math.sin(baseX * 3 + time * 1.5) * 0.02;
                const wave2 = Math.sin(baseZ * 2 + time * 1.2) * 0.015;
                const wave3 = Math.sin((baseX + baseZ) * 4 + time * 2) * 0.01;

                positions[i + 2] = wave1 + wave2 + wave3;
            }

            this.waterGeometry.attributes.position.needsUpdate = true;
            this.waterGeometry.computeVertexNormals();

            // Subtle vertical motion
            this.waterMesh.position.y = -0.4 + Math.sin(time * 0.3) * 0.01;
        }

        // Animate foam
        if (this.foamMesh) {
            this.foamMesh.position.y = -0.38 + Math.sin(time * 0.4) * 0.01;
            this.foamMesh.material.opacity = 0.1 + Math.sin(time * 0.5) * 0.05;
        }

        // Animate caustics
        if (this.causticMesh && this.causticTexture) {
            // Scroll caustic texture
            this.causticTexture.offset.x = Math.sin(time * 0.2) * 0.1;
            this.causticTexture.offset.y = Math.cos(time * 0.15) * 0.1;
            this.causticMesh.material.opacity = 0.3 + Math.sin(time * 0.8) * 0.1;
        }

        // Animate fog particles
        if (this.fogParticles) {
            const positions = this.fogParticles.geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                // Slow drift
                positions[i] += Math.sin(time * 0.1 + i) * 0.001;
                positions[i + 2] += Math.cos(time * 0.08 + i) * 0.001;
                positions[i + 1] = 0.5 + Math.sin(time * 0.2 + i * 0.1) * 0.5 + 1;
            }
            this.fogParticles.geometry.attributes.position.needsUpdate = true;
        }

        // Animate dust motes
        if (this.dustMotes && this.dustPositions) {
            const positions = this.dustMotes.geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                // Gentle floating motion
                positions[i] = this.dustPositions[i] + Math.sin(time * 0.5 + i * 0.3) * 0.1;
                positions[i + 1] = this.dustPositions[i + 1] + Math.sin(time * 0.3 + i * 0.2) * 0.2;
                positions[i + 2] = this.dustPositions[i + 2] + Math.cos(time * 0.4 + i * 0.25) * 0.1;
            }
            this.dustMotes.geometry.attributes.position.needsUpdate = true;
        }
    }

    /**
     * Dispose of all terrain meshes
     */
    dispose() {
        for (const mesh of this.meshes) {
            this.renderer.removeFromScene(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
        }
        this.meshes = [];
    }
}

// Export
window.Terrain3D = Terrain3D;
