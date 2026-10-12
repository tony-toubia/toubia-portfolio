// Particle System for Void Warden using Three.js Points and Instanced Mesh
class ParticleManager {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.shockwaves = [];

        // Pool of small burst particles
        this.maxBursts = 600;
        const geom = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.maxBursts * 3);
        this.colors = new Float32Array(this.maxBursts * 3);
        this.sizes = new Float32Array(this.maxBursts);

        geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 0.4,
            vertexColors: true,
            transparent: true,
            opacity: 0.95,
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
                x: 0, y: -1000, z: 0,
                vx: 0, vy: 0, vz: 0,
                r: 1, g: 1, b: 1,
                life: 0, maxLife: 1,
                drag: 0.96,
                gravity: 9.8
            });
            this.positions[i * 3 + 1] = -1000;
        }
    }

    spawnBurst(x, y, z, colorHex, count = 18, speed = 4.5, gravity = 9.8) {
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
                const spd = (0.4 + Math.random() * 0.9) * speed;
                p.vx = Math.cos(angle) * spd;
                p.vy = (Math.random() * 0.9 + 0.3) * speed;
                p.vz = Math.sin(angle) * spd;

                p.r = color.r;
                p.g = color.g;
                p.b = color.b;

                p.gravity = gravity;
                p.drag = 0.97;
                p.life = 0;
                p.maxLife = 0.4 + Math.random() * 0.4;
                spawned++;
            }
        }
    }

    spawnSparks(x, y, z, count = 25) {
        let spawned = 0;
        for (let i = 0; i < this.burstPool.length && spawned < count; i++) {
            const p = this.burstPool[i];
            if (!p.active) {
                p.active = true;
                p.x = x;
                p.y = y + 0.3;
                p.z = z;

                const angle = Math.random() * Math.PI * 2;
                const spd = 6 + Math.random() * 8;
                p.vx = Math.cos(angle) * spd;
                p.vy = (Math.random() * 0.8 + 0.5) * spd * 0.7;
                p.vz = Math.sin(angle) * spd;

                // Bright electric sparks: white-hot to yellow/cyan
                if (Math.random() > 0.4) {
                    p.r = 1.0; p.g = 0.9; p.b = 0.3; // yellow-hot
                } else {
                    p.r = 0.9; p.g = 1.0; p.b = 1.0; // electric white/cyan
                }

                p.gravity = 14;
                p.drag = 0.92;
                p.life = 0;
                p.maxLife = 0.25 + Math.random() * 0.25;
                spawned++;
            }
        }
    }

    spawnExplosion(x, y, z, maxRadius = 10) {
        // Multiple layered shocks
        this.spawnShockwave(x, z, maxRadius, 0xff3b30);
        this.spawnShockwave(x, z, maxRadius * 0.6, 0xff9500);

        // Fire & smoke bursts
        let spawned = 0;
        const count = 50;
        for (let i = 0; i < this.burstPool.length && spawned < count; i++) {
            const p = this.burstPool[i];
            if (!p.active) {
                p.active = true;
                p.x = x + (Math.random() - 0.5) * 0.8;
                p.y = y + 0.2;
                p.z = z + (Math.random() - 0.5) * 0.8;

                const angle = Math.random() * Math.PI * 2;
                const spd = 5 + Math.random() * 9;
                p.vx = Math.cos(angle) * spd;
                p.vy = (0.5 + Math.random() * 1.2) * spd;
                p.vz = Math.sin(angle) * spd;

                // Fire tones
                const pick = Math.random();
                if (pick < 0.4) {
                    p.r = 1.0; p.g = 0.2; p.b = 0.05; // crimson fire
                } else if (pick < 0.75) {
                    p.r = 1.0; p.g = 0.7; p.b = 0.1; // orange flame
                } else {
                    p.r = 1.0; p.g = 0.95; p.b = 0.4; // core bright yellow
                }

                p.gravity = 5.0; // rises slightly like smoke/fire
                p.drag = 0.93;
                p.life = 0;
                p.maxLife = 0.5 + Math.random() * 0.5;
                spawned++;
            }
        }
    }

    spawnToxicSplatter(x, y, z, count = 20) {
        let spawned = 0;
        for (let i = 0; i < this.burstPool.length && spawned < count; i++) {
            const p = this.burstPool[i];
            if (!p.active) {
                p.active = true;
                p.x = x;
                p.y = y + 0.15;
                p.z = z;

                const angle = Math.random() * Math.PI * 2;
                const spd = 2 + Math.random() * 5;
                p.vx = Math.cos(angle) * spd;
                p.vy = (0.3 + Math.random() * 0.8) * spd;
                p.vz = Math.sin(angle) * spd;

                p.r = 0.2; p.g = 0.95; p.b = 0.3; // neon toxic green
                p.gravity = 12.0;
                p.drag = 0.94;
                p.life = 0;
                p.maxLife = 0.4 + Math.random() * 0.4;
                spawned++;
            }
        }
    }

    spawnLevelUpHalo(x, z, radius) {
        this.spawnShockwave(x, z, radius * 2.8, 0x00f3ff);
        this.spawnShockwave(x, z, radius * 3.5, 0xffcc00);

        // Golden sparkles orbiting/rising around hole
        let spawned = 0;
        const count = 35;
        for (let i = 0; i < this.burstPool.length && spawned < count; i++) {
            const p = this.burstPool[i];
            if (!p.active) {
                p.active = true;
                const angle = Math.random() * Math.PI * 2;
                p.x = x + Math.cos(angle) * radius;
                p.y = 0.1;
                p.z = z + Math.sin(angle) * radius;

                p.vx = Math.cos(angle + Math.PI / 2) * 2;
                p.vy = 3 + Math.random() * 4;
                p.vz = Math.sin(angle + Math.PI / 2) * 2;

                p.r = 1.0; p.g = 0.85; p.b = 0.2;
                p.gravity = -1.0; // float upwards!
                p.drag = 0.96;
                p.life = 0;
                p.maxLife = 0.7 + Math.random() * 0.4;
                spawned++;
            }
        }
    }

    spawnShockwave(x, z, maxRadius = 5, colorHex = 0x00f3ff) {
        const ringGeom = new THREE.RingGeometry(0.15, 0.4, 32);
        ringGeom.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(ringGeom, ringMat);
        mesh.position.set(x, 0.06, z);
        this.scene.add(mesh);

        this.shockwaves.push({
            mesh: mesh,
            currentRadius: 0.5,
            maxRadius: maxRadius,
            life: 0,
            maxLife: 0.45
        });
    }

    update(dt) {
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
                p.vy -= p.gravity * dt;
                p.vx *= p.drag;
                p.vz *= p.drag;

                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.z += p.vz * dt;

                // Stop at floor if falling
                if (p.y < 0.05 && p.gravity > 0) {
                    p.y = 0.05;
                    p.vx *= 0.6;
                    p.vz *= 0.6;
                }

                const alpha = Math.max(0, 1 - (p.life / p.maxLife));
                this.positions[i * 3] = p.x;
                this.positions[i * 3 + 1] = p.y;
                this.positions[i * 3 + 2] = p.z;

                this.colors[i * 3] = p.r * alpha;
                this.colors[i * 3 + 1] = p.g * alpha;
                this.colors[i * 3 + 2] = p.b * alpha;
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
                sw.mesh.material.opacity = (1 - progress) * 0.9;
            }
        }
    }

    clear() {
        this.burstPool.forEach(p => {
            p.active = false;
            p.y = -1000;
        });
        const posAttr = this.pointsMesh.geometry.attributes.position;
        for (let i = 0; i < this.maxBursts; i++) {
            this.positions[i * 3 + 1] = -1000;
        }
        posAttr.needsUpdate = true;

        this.shockwaves.forEach(sw => {
            this.scene.remove(sw.mesh);
            sw.mesh.geometry.dispose();
            sw.mesh.material.dispose();
        });
        this.shockwaves = [];
    }
}
