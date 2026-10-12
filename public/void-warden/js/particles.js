// Particle System for Void Warden using Three.js Points and Instanced Mesh
class ParticleManager {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.shockwaves = [];

        // Pool of small burst particles
        this.maxBursts = 300;
        const geom = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.maxBursts * 3);
        this.colors = new Float32Array(this.maxBursts * 3);
        this.sizes = new Float32Array(this.maxBursts);

        geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 0.35,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.pointsMesh = new THREE.Points(geom, mat);
        this.scene.add(this.pointsMesh);

        // Individual burst particle data
        this.burstPool = [];
        for (let i = 0; i < this.maxBursts; i++) {
            this.burstPool.push({
                active: false,
                x: 0, y: 0, z: 0,
                vx: 0, vy: 0, vz: 0,
                r: 1, g: 1, b: 1,
                life: 0, maxLife: 1
            });
        }
    }

    spawnBurst(x, y, z, colorHex, count = 15, speed = 4) {
        const color = new THREE.Color(colorHex);
        let spawned = 0;

        for (let i = 0; i < this.burstPool.length && spawned < count; i++) {
            const p = this.burstPool[i];
            if (!p.active) {
                p.active = true;
                p.x = x;
                p.y = y + 0.2;
                p.z = z;

                const angle = Math.random() * Math.PI * 2;
                const spd = (0.5 + Math.random() * 0.8) * speed;
                p.vx = Math.cos(angle) * spd;
                p.vy = (Math.random() * 0.8 + 0.3) * speed;
                p.vz = Math.sin(angle) * spd;

                p.r = color.r;
                p.g = color.g;
                p.b = color.b;

                p.life = 0;
                p.maxLife = 0.4 + Math.random() * 0.3;
                spawned++;
            }
        }
    }

    spawnShockwave(x, z, maxRadius = 5, colorHex = 0x00f3ff) {
        const ringGeom = new THREE.RingGeometry(0.1, 0.3, 32);
        ringGeom.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(ringGeom, ringMat);
        mesh.position.set(x, 0.05, z);
        this.scene.add(mesh);

        this.shockwaves.push({
            mesh: mesh,
            currentRadius: 0.5,
            maxRadius: maxRadius,
            life: 0,
            maxLife: 0.5
        });
    }

    update(dt) {
        let activeCount = 0;
        const posAttr = this.pointsMesh.geometry.attributes.position;
        const colAttr = this.pointsMesh.geometry.attributes.color;

        for (let i = 0; i < this.burstPool.length; i++) {
            const p = this.burstPool[i];
            if (p.active) {
                p.life += dt;
                if (p.life >= p.maxLife) {
                    p.active = false;
                    this.positions[i * 3 + 1] = -1000;
                    continue;
                }

                // Gravity & velocity
                p.vy -= 9.8 * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.z += p.vz * dt;

                // Stop at floor
                if (p.y < 0.05) {
                    p.y = 0.05;
                    p.vx *= 0.6;
                    p.vz *= 0.6;
                }

                const alpha = 1 - (p.life / p.maxLife);
                this.positions[i * 3] = p.x;
                this.positions[i * 3 + 1] = p.y;
                this.positions[i * 3 + 2] = p.z;

                this.colors[i * 3] = p.r * alpha;
                this.colors[i * 3 + 1] = p.g * alpha;
                this.colors[i * 3 + 2] = p.b * alpha;
                activeCount++;
            } else {
                this.positions[i * 3 + 1] = -1000;
            }
        }

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;

        // Update shockwaves
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const sw = this.shockwaves[i];
            sw.life += dt;
            const progress = sw.life / sw.maxLife;
            if (progress >= 1) {
                this.scene.remove(sw.mesh);
                sw.mesh.geometry.dispose();
                sw.mesh.material.dispose();
                this.shockwaves.splice(i, 1);
            } else {
                const scale = 1 + progress * (sw.maxRadius * 3);
                sw.mesh.scale.set(scale, scale, scale);
                sw.mesh.material.opacity = (1 - progress) * 0.8;
            }
        }
    }

    clear() {
        this.burstPool.forEach(p => p.active = false);
        this.shockwaves.forEach(sw => {
            this.scene.remove(sw.mesh);
            sw.mesh.geometry.dispose();
            sw.mesh.material.dispose();
        });
        this.shockwaves = [];
    }
}
