/**
 * 3D Terrain System for Primal Hunt
 * Procedurally generated terrain with height mapping
 */

class Terrain3D {
    constructor(renderer, gameMap) {
        this.renderer = renderer;
        this.gameMap = gameMap;
        this.meshes = [];

        // Scale factor: game units to 3D units
        this.scale = 0.05;

        // Create terrain
        this.createTerrain();
        this.createObstacles();
        this.createWater();
        this.createVegetation();
    }

    createTerrain() {
        const width = this.gameMap.width * this.scale;
        const height = this.gameMap.height * this.scale;

        // Create heightmap-based terrain
        const resolution = 128;
        const geometry = new THREE.PlaneGeometry(width, height, resolution, resolution);

        // Generate height data
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 1]; // Note: PlaneGeometry is XY, we rotate to XZ

            // Convert to game coordinates
            const gameX = (x / this.scale) + this.gameMap.width / 2;
            const gameY = (z / this.scale) + this.gameMap.height / 2;

            // Get terrain type
            const tileX = Math.floor(gameX / this.gameMap.tileSize);
            const tileY = Math.floor(gameY / this.gameMap.tileSize);

            let height = 0;

            if (this.gameMap.isValidTile(tileX, tileY)) {
                const tile = this.gameMap.terrain[tileY]?.[tileX];
                switch (tile) {
                    case TerrainType.WATER:
                        height = -0.5;
                        break;
                    case TerrainType.FOREST:
                        height = 0.1 + Math.random() * 0.1;
                        break;
                    case TerrainType.ROCK:
                        height = 1.0 + Math.random() * 0.5;
                        break;
                    case TerrainType.CAVE:
                        height = -0.2;
                        break;
                    default:
                        // Add some noise for natural variation
                        height = this.noise(x * 2, z * 2) * 0.3;
                }
            }

            positions[i + 2] = height;
        }

        geometry.computeVertexNormals();

        // Create shader material for terrain
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.9,
            metalness: 0.0,
            flatShading: false
        });

        // Add vertex colors based on terrain type
        const colors = [];
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 1];
            const y = positions[i + 2];

            let color;
            if (y < -0.3) {
                // Water-adjacent
                color = new THREE.Color(0x1a4d7a);
            } else if (y < 0) {
                // Low ground
                color = new THREE.Color(0x2d5016).lerp(new THREE.Color(0x1a4d7a), Math.abs(y) / 0.3);
            } else if (y < 0.2) {
                // Normal ground
                color = new THREE.Color(0x2d5016).lerp(new THREE.Color(0x3d7020), Math.random() * 0.3);
            } else if (y < 0.5) {
                // Forest/elevated
                color = new THREE.Color(0x1a3d0c);
            } else {
                // Rocky
                color = new THREE.Color(0x4a4a4a).lerp(new THREE.Color(0x6a6a6a), Math.random() * 0.3);
            }

            colors.push(color.r, color.g, color.b);
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        // Create mesh
        this.terrainMesh = new THREE.Mesh(geometry, material);
        this.terrainMesh.rotation.x = -Math.PI / 2; // Rotate to XZ plane
        this.terrainMesh.receiveShadow = true;

        this.renderer.addToScene(this.terrainMesh);
        this.meshes.push(this.terrainMesh);
    }

    createWater() {
        const width = this.gameMap.width * this.scale;
        const height = this.gameMap.height * this.scale;

        // Simple animated water plane
        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshStandardMaterial({
            color: 0x1a6090,
            transparent: true,
            opacity: 0.8,
            roughness: 0.1,
            metalness: 0.3
        });

        this.waterMesh = new THREE.Mesh(geometry, material);
        this.waterMesh.rotation.x = -Math.PI / 2;
        this.waterMesh.position.y = -0.4;
        this.waterMesh.receiveShadow = true;

        this.renderer.addToScene(this.waterMesh);
        this.meshes.push(this.waterMesh);
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
     * Update water animation
     */
    update(time) {
        if (this.waterMesh) {
            // Gentle wave motion
            this.waterMesh.position.y = -0.4 + Math.sin(time * 0.5) * 0.02;
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
