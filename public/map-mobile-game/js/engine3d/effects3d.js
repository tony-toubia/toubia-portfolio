/**
 * 3D Effects System for Primal Hunt
 * GPU-accelerated particle systems and enhanced visual effects
 */

class Effects3D {
    constructor(renderer) {
        this.renderer = renderer;
        this.scale = 0.05;
        this.effects = [];
        this.particleSystems = [];
        this.persistentEffects = new Map(); // Long-running effects by ID

        // Pre-create reusable geometries and materials
        this.createSharedAssets();
    }

    createSharedAssets() {
        // Create multiple particle textures for variety
        this.particleTextures = {
            soft: this.createSoftParticleTexture(),
            spark: this.createSparkTexture(),
            smoke: this.createSmokeTexture(),
            star: this.createStarTexture()
        };
        this.particleTexture = this.particleTextures.soft;

        // Shared geometries
        this.sphereGeometry = new THREE.SphereGeometry(1, 16, 16);
        this.ringGeometry = new THREE.RingGeometry(0.8, 1, 32);
        this.planeGeometry = new THREE.PlaneGeometry(1, 1);
        this.torusGeometry = new THREE.TorusGeometry(1, 0.1, 8, 32);
    }

    createSoftParticleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);

        return new THREE.CanvasTexture(canvas);
    }

    createSparkTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 32, 32);

        // Create spark shape
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 8);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.5, 'rgba(255, 200, 100, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(16, 16, 12, 0, Math.PI * 2);
        ctx.fill();

        return new THREE.CanvasTexture(canvas);
    }

    createSmokeTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Soft cloudy texture
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 64, 64);

        for (let i = 0; i < 8; i++) {
            const x = 20 + Math.random() * 24;
            const y = 20 + Math.random() * 24;
            const r = 10 + Math.random() * 15;

            const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        return new THREE.CanvasTexture(canvas);
    }

    createStarTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 32, 32);

        // 4-pointed star
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(16, 4);
        ctx.lineTo(18, 14);
        ctx.lineTo(28, 16);
        ctx.lineTo(18, 18);
        ctx.lineTo(16, 28);
        ctx.lineTo(14, 18);
        ctx.lineTo(4, 16);
        ctx.lineTo(14, 14);
        ctx.closePath();
        ctx.fill();

        // Center glow
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 8);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(16, 16, 8, 0, Math.PI * 2);
        ctx.fill();

        return new THREE.CanvasTexture(canvas);
    }

    /**
     * Create explosion effect
     */
    createExplosion(x, y, options = {}) {
        const worldPos = this.toWorldPos(x, y);
        const color = new THREE.Color(options.color || 0xff6600);
        const radius = (options.radius || 50) * this.scale;

        // Core flash
        const flashMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1
        });
        const flash = new THREE.Mesh(this.sphereGeometry, flashMaterial);
        flash.position.copy(worldPos);
        flash.position.y = 0.5;
        flash.scale.setScalar(0.1);
        this.renderer.addToScene(flash);

        // Expanding ring
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(this.ringGeometry, ringMaterial);
        ring.position.copy(worldPos);
        ring.position.y = 0.1;
        ring.rotation.x = -Math.PI / 2;
        ring.scale.setScalar(0.1);
        this.renderer.addToScene(ring);

        // Particles
        const particles = this.createParticleSystem(worldPos, {
            count: 50,
            color: color,
            size: 0.3,
            speed: 3,
            life: 0.8,
            spread: Math.PI * 2
        });

        // Dynamic light
        const light = this.renderer.requestDynamicLight(x, y, color.getHex(), 2, 0.5);

        // Animation
        const effect = {
            flash,
            ring,
            particles,
            light,
            life: 0.5,
            maxLife: 0.5,
            radius,
            update: (dt) => {
                const t = 1 - effect.life / effect.maxLife;

                // Flash expands and fades
                flash.scale.setScalar(Utils.lerp(0.1, radius * 0.5, Utils.easeOut(t)));
                flash.material.opacity = 1 - t;

                // Ring expands
                ring.scale.setScalar(Utils.lerp(0.1, radius, Utils.easeOut(t)));
                ring.material.opacity = 0.8 * (1 - t);

                effect.life -= dt;
                return effect.life > 0;
            },
            dispose: () => {
                this.renderer.removeFromScene(flash);
                this.renderer.removeFromScene(ring);
                flash.material.dispose();
                ring.material.dispose();
                this.disposeParticleSystem(particles);
            }
        };

        this.effects.push(effect);
        return effect;
    }

    /**
     * Create hit effect
     */
    createHitEffect(x, y, color = 0xffffff) {
        const worldPos = this.toWorldPos(x, y);
        const col = new THREE.Color(color);

        // Small burst of particles
        const particles = this.createParticleSystem(worldPos, {
            count: 15,
            color: col,
            size: 0.15,
            speed: 2,
            life: 0.3,
            spread: Math.PI * 2
        });

        // Small flash
        const flashMaterial = new THREE.MeshBasicMaterial({
            color: col,
            transparent: true,
            opacity: 1
        });
        const flash = new THREE.Mesh(this.sphereGeometry, flashMaterial);
        flash.position.copy(worldPos);
        flash.position.y = 0.5;
        flash.scale.setScalar(0.1);
        this.renderer.addToScene(flash);

        const effect = {
            flash,
            particles,
            life: 0.2,
            maxLife: 0.2,
            update: (dt) => {
                const t = 1 - effect.life / effect.maxLife;
                flash.scale.setScalar(Utils.lerp(0.1, 0.5, t));
                flash.material.opacity = 1 - t;
                effect.life -= dt;
                return effect.life > 0;
            },
            dispose: () => {
                this.renderer.removeFromScene(flash);
                flash.material.dispose();
                this.disposeParticleSystem(particles);
            }
        };

        this.effects.push(effect);
    }

    /**
     * Create projectile trail
     */
    createProjectileTrail(projectile) {
        const trail = {
            projectile,
            points: [],
            maxPoints: 10,
            line: null,
            update: (dt) => {
                if (!projectile || projectile.life <= 0) return false;

                const pos = this.toWorldPos(projectile.x, projectile.y);
                pos.y = 0.5;

                trail.points.unshift(pos.clone());
                if (trail.points.length > trail.maxPoints) {
                    trail.points.pop();
                }

                if (trail.points.length >= 2) {
                    if (trail.line) {
                        this.renderer.removeFromScene(trail.line);
                        trail.line.geometry.dispose();
                    }

                    const positions = [];
                    trail.points.forEach(p => positions.push(p.x, p.y, p.z));

                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

                    const material = new THREE.LineBasicMaterial({
                        color: new THREE.Color(projectile.color),
                        transparent: true,
                        opacity: 0.6
                    });

                    trail.line = new THREE.Line(geometry, material);
                    this.renderer.addToScene(trail.line);
                }

                return true;
            },
            dispose: () => {
                if (trail.line) {
                    this.renderer.removeFromScene(trail.line);
                    trail.line.geometry.dispose();
                    trail.line.material.dispose();
                }
            }
        };

        this.effects.push(trail);
        return trail;
    }

    /**
     * Create beam effect
     */
    createBeam(from, to, color) {
        const fromPos = this.toWorldPos(from.x, from.y);
        const toPos = this.toWorldPos(to.x, to.y);
        fromPos.y = 0.5;
        toPos.y = 0.5;

        const direction = toPos.clone().sub(fromPos);
        const length = direction.length();

        // Beam cylinder
        const geometry = new THREE.CylinderGeometry(0.05, 0.05, length, 8);
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(color),
            transparent: true,
            opacity: 0.8
        });

        const beam = new THREE.Mesh(geometry, material);
        beam.position.copy(fromPos.clone().add(toPos).multiplyScalar(0.5));
        beam.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction.normalize()
        );

        this.renderer.addToScene(beam);

        // Glow
        const glowGeometry = new THREE.CylinderGeometry(0.1, 0.1, length, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color(color),
            transparent: true,
            opacity: 0.3
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.copy(beam.position);
        glow.quaternion.copy(beam.quaternion);
        this.renderer.addToScene(glow);

        const effect = {
            beam,
            glow,
            life: 0.1,
            update: (dt) => {
                effect.life -= dt;
                const t = effect.life / 0.1;
                beam.material.opacity = 0.8 * t;
                glow.material.opacity = 0.3 * t;
                return effect.life > 0;
            },
            dispose: () => {
                this.renderer.removeFromScene(beam);
                this.renderer.removeFromScene(glow);
                beam.geometry.dispose();
                beam.material.dispose();
                glow.geometry.dispose();
                glow.material.dispose();
            }
        };

        this.effects.push(effect);
    }

    /**
     * Create heal effect (rising particles)
     */
    createHealEffect(x, y, radius) {
        const worldPos = this.toWorldPos(x, y);

        const particles = this.createParticleSystem(worldPos, {
            count: 30,
            color: new THREE.Color(0x00ff00),
            size: 0.2,
            speed: 1,
            life: 1,
            spread: 0.5,
            direction: new THREE.Vector3(0, 1, 0),
            gravity: -0.5 // Float upward
        });

        // Healing ring
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(this.ringGeometry, ringMaterial);
        ring.position.copy(worldPos);
        ring.position.y = 0.1;
        ring.rotation.x = -Math.PI / 2;
        ring.scale.setScalar(0.1);
        this.renderer.addToScene(ring);

        const effect = {
            ring,
            particles,
            life: 0.5,
            maxLife: 0.5,
            targetRadius: (radius || 50) * this.scale,
            update: (dt) => {
                const t = 1 - effect.life / effect.maxLife;
                ring.scale.setScalar(Utils.lerp(0.1, effect.targetRadius, t));
                ring.material.opacity = 0.5 * (1 - t);
                effect.life -= dt;
                return effect.life > 0;
            },
            dispose: () => {
                this.renderer.removeFromScene(ring);
                ring.material.dispose();
                this.disposeParticleSystem(particles);
            }
        };

        this.effects.push(effect);
    }

    /**
     * Create fire breath cone effect
     */
    createFireCone(user, angle, range, duration) {
        const worldPos = this.toWorldPos(user.x, user.y);
        worldPos.y = 0.5;

        // Create cone geometry oriented forward
        const coneGeometry = new THREE.ConeGeometry(range * this.scale * 0.5, range * this.scale, 16, 1, true);
        const coneMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4400,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });

        const cone = new THREE.Mesh(coneGeometry, coneMaterial);
        cone.position.copy(worldPos);
        cone.rotation.x = Math.PI / 2;
        cone.rotation.z = -angle;
        this.renderer.addToScene(cone);

        // Fire particles
        const particles = this.createParticleSystem(worldPos, {
            count: 100,
            color: new THREE.Color(0xff6600),
            size: 0.3,
            speed: 5,
            life: duration,
            spread: 0.5,
            direction: new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
        });

        // Dynamic light
        const light = this.renderer.requestDynamicLight(user.x, user.y, 0xff4400, 3, duration);

        const effect = {
            cone,
            particles,
            light,
            life: duration,
            maxLife: duration,
            update: (dt) => {
                const t = effect.life / effect.maxLife;
                cone.material.opacity = 0.5 * t;
                effect.life -= dt;
                return effect.life > 0;
            },
            dispose: () => {
                this.renderer.removeFromScene(cone);
                cone.geometry.dispose();
                cone.material.dispose();
                this.disposeParticleSystem(particles);
            }
        };

        this.effects.push(effect);
    }

    /**
     * Create lightning effect
     */
    createLightning(fromX, fromY, toX, toY) {
        const from = this.toWorldPos(fromX, fromY);
        const to = this.toWorldPos(toX, toY);
        from.y = 5;
        to.y = 0.5;

        // Create jagged line
        const segments = 8;
        const points = [from.clone()];

        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const pos = from.clone().lerp(to, t);
            pos.x += (Math.random() - 0.5) * 0.5;
            pos.z += (Math.random() - 0.5) * 0.5;
            points.push(pos);
        }
        points.push(to.clone());

        const positions = [];
        points.forEach(p => positions.push(p.x, p.y, p.z));

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const material = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            linewidth: 3
        });

        const lightning = new THREE.Line(geometry, material);
        this.renderer.addToScene(lightning);

        // Flash at impact point
        this.createExplosion(toX, toY, { color: 0x00ffff, radius: 30 });

        // Dynamic light
        this.renderer.requestDynamicLight(toX, toY, 0x00ffff, 5, 0.2);

        const effect = {
            lightning,
            life: 0.15,
            update: (dt) => {
                effect.life -= dt;
                lightning.material.opacity = effect.life / 0.15;
                return effect.life > 0;
            },
            dispose: () => {
                this.renderer.removeFromScene(lightning);
                geometry.dispose();
                material.dispose();
            }
        };

        this.effects.push(effect);
    }

    /**
     * Create dome effect
     */
    createDome(x, y, radius, duration) {
        const worldPos = this.toWorldPos(x, y);
        const worldRadius = radius * this.scale;

        // Dome mesh
        const geometry = new THREE.SphereGeometry(worldRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00c8ff,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            wireframe: false
        });

        const dome = new THREE.Mesh(geometry, material);
        dome.position.copy(worldPos);
        this.renderer.addToScene(dome);

        // Wireframe overlay
        const wireMaterial = new THREE.MeshBasicMaterial({
            color: 0x00c8ff,
            transparent: true,
            opacity: 0.5,
            wireframe: true
        });
        const wireframe = new THREE.Mesh(geometry.clone(), wireMaterial);
        wireframe.position.copy(worldPos);
        this.renderer.addToScene(wireframe);

        const effect = {
            dome,
            wireframe,
            life: duration,
            maxLife: duration,
            update: (dt) => {
                // Pulse effect
                const pulse = Math.sin(Date.now() * 0.01) * 0.1 + 1;
                dome.scale.setScalar(pulse);
                wireframe.scale.setScalar(pulse);

                effect.life -= dt;
                if (effect.life < 2) {
                    // Fade out in last 2 seconds
                    const fade = effect.life / 2;
                    dome.material.opacity = 0.2 * fade;
                    wireframe.material.opacity = 0.5 * fade;
                }
                return effect.life > 0;
            },
            dispose: () => {
                this.renderer.removeFromScene(dome);
                this.renderer.removeFromScene(wireframe);
                dome.geometry.dispose();
                dome.material.dispose();
                wireframe.geometry.dispose();
                wireframe.material.dispose();
            }
        };

        this.effects.push(effect);
    }

    /**
     * Create particle system
     */
    createParticleSystem(position, options) {
        const count = options.count || 50;
        const geometry = new THREE.BufferGeometry();

        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const lifetimes = new Float32Array(count);

        const color = options.color || new THREE.Color(0xffffff);
        const speed = options.speed || 2;
        const spread = options.spread || Math.PI;
        const direction = options.direction || new THREE.Vector3(0, 1, 0);

        for (let i = 0; i < count; i++) {
            // Position at origin
            positions[i * 3] = position.x;
            positions[i * 3 + 1] = position.y + 0.5;
            positions[i * 3 + 2] = position.z;

            // Random velocity
            const angle = Math.random() * spread - spread / 2;
            const elevation = Math.random() * Math.PI / 2;
            velocities[i * 3] = direction.x * speed + Math.sin(angle) * Math.cos(elevation) * speed;
            velocities[i * 3 + 1] = direction.y * speed + Math.sin(elevation) * speed;
            velocities[i * 3 + 2] = direction.z * speed + Math.cos(angle) * Math.cos(elevation) * speed;

            // Color
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            // Size
            sizes[i] = options.size || 0.2;

            // Lifetime
            lifetimes[i] = options.life * (0.5 + Math.random() * 0.5);
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            size: options.size || 0.2,
            map: this.particleTexture,
            vertexColors: true,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const points = new THREE.Points(geometry, material);
        this.renderer.addToScene(points);

        const system = {
            points,
            velocities,
            lifetimes,
            maxLife: options.life,
            gravity: options.gravity || 0.5,
            age: 0,
            update: (dt) => {
                system.age += dt;

                const positions = points.geometry.attributes.position.array;
                let alive = false;

                for (let i = 0; i < count; i++) {
                    if (lifetimes[i] > 0) {
                        alive = true;
                        lifetimes[i] -= dt;

                        // Apply velocity
                        positions[i * 3] += velocities[i * 3] * dt;
                        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
                        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;

                        // Apply gravity
                        velocities[i * 3 + 1] -= system.gravity * dt;

                        // Damping
                        velocities[i * 3] *= 0.98;
                        velocities[i * 3 + 1] *= 0.98;
                        velocities[i * 3 + 2] *= 0.98;
                    }
                }

                points.geometry.attributes.position.needsUpdate = true;
                points.material.opacity = Math.max(0, 1 - system.age / system.maxLife);

                return alive;
            }
        };

        this.particleSystems.push(system);
        return system;
    }

    /**
     * Dispose particle system
     */
    disposeParticleSystem(system) {
        if (!system) return;
        this.renderer.removeFromScene(system.points);
        system.points.geometry.dispose();
        system.points.material.dispose();

        const index = this.particleSystems.indexOf(system);
        if (index !== -1) {
            this.particleSystems.splice(index, 1);
        }
    }

    /**
     * Convert game coords to world position
     */
    toWorldPos(x, y) {
        return new THREE.Vector3(
            (x - 1000) * this.scale,
            0,
            (y - 1000) * this.scale
        );
    }

    /**
     * Update all effects
     */
    update(dt) {
        // Update effects
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            if (!effect.update(dt)) {
                effect.dispose();
                this.effects.splice(i, 1);
            }
        }

        // Update particle systems
        for (let i = this.particleSystems.length - 1; i >= 0; i--) {
            const system = this.particleSystems[i];
            if (!system.update(dt)) {
                this.disposeParticleSystem(system);
            }
        }
    }

    /**
     * Clear all effects
     */
    clear() {
        for (const effect of this.effects) {
            effect.dispose();
        }
        this.effects = [];

        for (const system of this.particleSystems) {
            this.renderer.removeFromScene(system.points);
            system.points.geometry.dispose();
            system.points.material.dispose();
        }
        this.particleSystems = [];

        // Clear persistent effects
        for (const [id, effect] of this.persistentEffects) {
            effect.dispose();
        }
        this.persistentEffects.clear();
    }

    /**
     * Create evolution transformation effect
     */
    createEvolutionEffect(x, y, stage, monsterType) {
        const worldPos = this.toWorldPos(x, y);

        // Color based on monster type
        const colors = {
            goliath: { primary: 0xff4400, secondary: 0xffaa00 },
            kraken: { primary: 0x9966ff, secondary: 0x66ffff },
            wraith: { primary: 0xcc66ff, secondary: 0xff66cc },
            behemoth: { primary: 0xff8800, secondary: 0xffcc00 }
        };
        const typeColors = colors[monsterType] || colors.goliath;

        // Expanding energy sphere
        const sphereMaterial = new THREE.MeshBasicMaterial({
            color: typeColors.primary,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const sphere = new THREE.Mesh(this.sphereGeometry, sphereMaterial);
        sphere.position.copy(worldPos);
        sphere.position.y = 1;
        sphere.scale.setScalar(0.1);
        this.renderer.addToScene(sphere);

        // Energy rings
        const rings = [];
        for (let i = 0; i < 3; i++) {
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: typeColors.secondary,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(this.ringGeometry, ringMaterial);
            ring.position.copy(worldPos);
            ring.position.y = 0.5 + i * 0.5;
            ring.rotation.x = Math.PI / 2;
            ring.scale.setScalar(0.1);
            this.renderer.addToScene(ring);
            rings.push(ring);
        }

        // Spiral particles
        const spiralParticles = this.createSpiralParticles(worldPos, {
            count: 80,
            color: new THREE.Color(typeColors.primary),
            secondaryColor: new THREE.Color(typeColors.secondary),
            size: 0.25,
            radius: 1.5,
            height: 3,
            life: 2.5
        });

        // Rising energy pillars
        const pillars = [];
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const pillarGeom = new THREE.CylinderGeometry(0.05, 0.15, 3, 6);
            const pillarMat = new THREE.MeshBasicMaterial({
                color: typeColors.secondary,
                transparent: true,
                opacity: 0.7
            });
            const pillar = new THREE.Mesh(pillarGeom, pillarMat);
            pillar.position.set(
                worldPos.x + Math.cos(angle) * 1,
                -1,
                worldPos.z + Math.sin(angle) * 1
            );
            this.renderer.addToScene(pillar);
            pillars.push(pillar);
        }

        // Dynamic light
        const light = this.renderer.requestDynamicLight(x, y, typeColors.primary, 5, 2.5);

        const effect = {
            sphere,
            rings,
            spiralParticles,
            pillars,
            light,
            life: 2.5,
            maxLife: 2.5,
            stage,
            update: (dt) => {
                const t = 1 - effect.life / effect.maxLife;

                // Phase 1: Build up (0-0.4)
                // Phase 2: Peak explosion (0.4-0.6)
                // Phase 3: Fade out (0.6-1.0)

                if (t < 0.4) {
                    // Build up phase
                    const buildT = t / 0.4;
                    sphere.scale.setScalar(0.1 + buildT * 1.5);
                    sphere.material.opacity = 0.3 + buildT * 0.4;

                    rings.forEach((ring, i) => {
                        ring.scale.setScalar(0.1 + buildT * (1 + i * 0.3));
                        ring.rotation.z += dt * (2 + i);
                        ring.position.y = 0.5 + i * 0.5 + Math.sin(buildT * Math.PI * 2 + i) * 0.2;
                    });

                    pillars.forEach((pillar, i) => {
                        pillar.position.y = Utils.lerp(-1, 1.5, Utils.easeOut(buildT));
                    });

                } else if (t < 0.6) {
                    // Peak explosion
                    const peakT = (t - 0.4) / 0.2;
                    sphere.scale.setScalar(1.5 + peakT * 2);
                    sphere.material.opacity = 0.7 - peakT * 0.3;

                    rings.forEach((ring, i) => {
                        ring.scale.setScalar(1.5 + i * 0.3 + peakT * 2);
                        ring.material.opacity = 0.8 - peakT * 0.3;
                    });

                } else {
                    // Fade out
                    const fadeT = (t - 0.6) / 0.4;
                    sphere.scale.setScalar(3.5 + fadeT * 0.5);
                    sphere.material.opacity = 0.4 * (1 - fadeT);

                    rings.forEach((ring, i) => {
                        ring.scale.setScalar(3.5 + i * 0.3 + fadeT);
                        ring.material.opacity = 0.5 * (1 - fadeT);
                    });

                    pillars.forEach(pillar => {
                        pillar.material.opacity = 0.7 * (1 - fadeT);
                    });
                }

                effect.life -= dt;
                return effect.life > 0;
            },
            dispose: () => {
                this.renderer.removeFromScene(sphere);
                sphere.material.dispose();

                rings.forEach(ring => {
                    this.renderer.removeFromScene(ring);
                    ring.material.dispose();
                });

                pillars.forEach(pillar => {
                    this.renderer.removeFromScene(pillar);
                    pillar.geometry.dispose();
                    pillar.material.dispose();
                });

                this.disposeParticleSystem(spiralParticles);
            }
        };

        this.effects.push(effect);
        return effect;
    }

    /**
     * Create spiral particles for evolution effect
     */
    createSpiralParticles(position, options) {
        const count = options.count || 50;
        const geometry = new THREE.BufferGeometry();

        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const phases = new Float32Array(count);

        const color = options.color || new THREE.Color(0xffffff);
        const secondaryColor = options.secondaryColor || color;

        for (let i = 0; i < count; i++) {
            const phase = Math.random() * Math.PI * 2;
            phases[i] = phase;

            positions[i * 3] = position.x;
            positions[i * 3 + 1] = position.y + Math.random() * options.height;
            positions[i * 3 + 2] = position.z;

            const colorMix = Math.random();
            const mixedColor = color.clone().lerp(secondaryColor, colorMix);
            colors[i * 3] = mixedColor.r;
            colors[i * 3 + 1] = mixedColor.g;
            colors[i * 3 + 2] = mixedColor.b;

            sizes[i] = options.size * (0.5 + Math.random() * 0.5);
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            size: options.size,
            map: this.particleTextures.star,
            vertexColors: true,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const points = new THREE.Points(geometry, material);
        this.renderer.addToScene(points);

        const system = {
            points,
            phases,
            basePosition: position.clone(),
            radius: options.radius,
            height: options.height,
            age: 0,
            maxLife: options.life,
            update: (dt) => {
                system.age += dt;
                const t = system.age / system.maxLife;

                const posArray = points.geometry.attributes.position.array;

                for (let i = 0; i < count; i++) {
                    const phase = phases[i];
                    const spiralT = (system.age * 2 + phase) % (Math.PI * 2);
                    const heightT = (phase / (Math.PI * 2) + t * 2) % 1;

                    const radius = system.radius * (0.5 + heightT * 0.5) * (1 + Math.sin(system.age * 3) * 0.1);

                    posArray[i * 3] = system.basePosition.x + Math.cos(spiralT) * radius;
                    posArray[i * 3 + 1] = system.basePosition.y + heightT * system.height;
                    posArray[i * 3 + 2] = system.basePosition.z + Math.sin(spiralT) * radius;
                }

                points.geometry.attributes.position.needsUpdate = true;
                points.material.opacity = t > 0.7 ? (1 - t) / 0.3 : 1;

                return system.age < system.maxLife;
            }
        };

        this.particleSystems.push(system);
        return system;
    }

    /**
     * Create status effect aura (poison, burning, etc.)
     */
    createStatusAura(entityId, x, y, type) {
        // Remove existing aura for this entity
        if (this.persistentEffects.has(`aura_${entityId}`)) {
            const existing = this.persistentEffects.get(`aura_${entityId}`);
            existing.dispose();
            this.persistentEffects.delete(`aura_${entityId}`);
        }

        const worldPos = this.toWorldPos(x, y);

        const auraColors = {
            poison: 0x00ff00,
            burning: 0xff4400,
            frozen: 0x00ffff,
            stunned: 0xffff00,
            weakened: 0xff00ff
        };

        const color = new THREE.Color(auraColors[type] || 0xffffff);

        // Create swirling particles around entity
        const count = 20;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const phases = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            phases[i] = (i / count) * Math.PI * 2;
            positions[i * 3] = worldPos.x;
            positions[i * 3 + 1] = 0.5;
            positions[i * 3 + 2] = worldPos.z;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const texture = type === 'burning' ? this.particleTextures.spark : this.particleTextures.soft;
        const material = new THREE.PointsMaterial({
            size: 0.15,
            map: texture,
            color: color,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const points = new THREE.Points(geometry, material);
        this.renderer.addToScene(points);

        const aura = {
            points,
            phases,
            entityId,
            type,
            basePos: worldPos.clone(),
            age: 0,
            update: (dt, newX, newY) => {
                aura.age += dt;

                // Update base position if entity moved
                if (newX !== undefined && newY !== undefined) {
                    aura.basePos = this.toWorldPos(newX, newY);
                }

                const posArray = points.geometry.attributes.position.array;
                const radius = 0.5 + Math.sin(aura.age * 2) * 0.1;

                for (let i = 0; i < count; i++) {
                    const phase = phases[i] + aura.age * 3;
                    const verticalOffset = Math.sin(aura.age * 4 + phases[i]) * 0.3;

                    posArray[i * 3] = aura.basePos.x + Math.cos(phase) * radius;
                    posArray[i * 3 + 1] = 0.5 + verticalOffset + (i / count) * 0.8;
                    posArray[i * 3 + 2] = aura.basePos.z + Math.sin(phase) * radius;
                }

                points.geometry.attributes.position.needsUpdate = true;
                points.material.opacity = 0.4 + Math.sin(aura.age * 5) * 0.2;

                return true; // Persistent until manually removed
            },
            dispose: () => {
                this.renderer.removeFromScene(points);
                geometry.dispose();
                material.dispose();
            }
        };

        this.persistentEffects.set(`aura_${entityId}`, aura);
        return aura;
    }

    /**
     * Remove status aura
     */
    removeStatusAura(entityId) {
        const key = `aura_${entityId}`;
        if (this.persistentEffects.has(key)) {
            const aura = this.persistentEffects.get(key);
            aura.dispose();
            this.persistentEffects.delete(key);
        }
    }

    /**
     * Create ground slam effect
     */
    createGroundSlam(x, y, radius) {
        const worldPos = this.toWorldPos(x, y);
        const worldRadius = radius * this.scale;

        // Shockwave ring
        const ringGeometry = new THREE.RingGeometry(0.1, 0.2, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xaa8855,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.copy(worldPos);
        ring.position.y = 0.05;
        ring.rotation.x = -Math.PI / 2;
        this.renderer.addToScene(ring);

        // Debris particles
        const debrisParticles = this.createParticleSystem(worldPos, {
            count: 60,
            color: new THREE.Color(0x8b7355),
            size: 0.2,
            speed: 4,
            life: 0.8,
            spread: Math.PI * 2,
            gravity: 3
        });

        // Dust cloud
        const dustParticles = this.createParticleSystem(worldPos, {
            count: 40,
            color: new THREE.Color(0xccbb99),
            size: 0.5,
            speed: 1.5,
            life: 1.5,
            spread: Math.PI * 2,
            gravity: -0.2,
            texture: 'smoke'
        });

        // Crack lines (visual only)
        const cracks = [];
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const crackGeom = new THREE.BoxGeometry(0.02, 0.02, worldRadius * 0.8);
            const crackMat = new THREE.MeshBasicMaterial({
                color: 0x333333,
                transparent: true,
                opacity: 0.7
            });
            const crack = new THREE.Mesh(crackGeom, crackMat);
            crack.position.copy(worldPos);
            crack.position.y = 0.01;
            crack.rotation.y = angle;
            crack.scale.z = 0.1;
            this.renderer.addToScene(crack);
            cracks.push(crack);
        }

        const effect = {
            ring,
            debrisParticles,
            dustParticles,
            cracks,
            life: 1.0,
            maxLife: 1.0,
            worldRadius,
            update: (dt) => {
                const t = 1 - effect.life / effect.maxLife;

                // Expanding shockwave
                const ringScale = Utils.easeOut(t) * worldRadius * 2;
                ring.scale.set(ringScale, ringScale, 1);
                ring.material.opacity = 0.8 * (1 - t);

                // Expanding cracks
                cracks.forEach((crack, i) => {
                    if (t < 0.3) {
                        crack.scale.z = Utils.easeOut(t / 0.3);
                    }
                    crack.material.opacity = 0.7 * (1 - t);
                });

                effect.life -= dt;
                return effect.life > 0;
            },
            dispose: () => {
                this.renderer.removeFromScene(ring);
                ring.geometry.dispose();
                ring.material.dispose();

                cracks.forEach(crack => {
                    this.renderer.removeFromScene(crack);
                    crack.geometry.dispose();
                    crack.material.dispose();
                });

                this.disposeParticleSystem(debrisParticles);
                this.disposeParticleSystem(dustParticles);
            }
        };

        this.effects.push(effect);
    }

    /**
     * Create teleport/warp effect
     */
    createWarpEffect(x, y, isArrival = false) {
        const worldPos = this.toWorldPos(x, y);

        // Warp distortion sphere
        const sphereMaterial = new THREE.MeshBasicMaterial({
            color: 0x9900ff,
            transparent: true,
            opacity: isArrival ? 0 : 0.7,
            side: THREE.BackSide
        });
        const sphere = new THREE.Mesh(this.sphereGeometry, sphereMaterial);
        sphere.position.copy(worldPos);
        sphere.position.y = 1;
        sphere.scale.setScalar(isArrival ? 2 : 0.1);
        this.renderer.addToScene(sphere);

        // Sparkle particles
        const sparkles = this.createParticleSystem(worldPos, {
            count: 50,
            color: new THREE.Color(0xcc66ff),
            size: 0.15,
            speed: isArrival ? 2 : 0.5,
            life: 0.6,
            spread: Math.PI,
            gravity: isArrival ? 0.5 : -2,
            texture: 'star'
        });

        const effect = {
            sphere,
            sparkles,
            life: 0.5,
            maxLife: 0.5,
            isArrival,
            update: (dt) => {
                const t = 1 - effect.life / effect.maxLife;

                if (isArrival) {
                    // Arrival: sphere shrinks, opacity increases then fades
                    sphere.scale.setScalar(2 - t * 1.9);
                    sphere.material.opacity = t < 0.5 ? t * 1.4 : 0.7 * (1 - (t - 0.5) * 2);
                } else {
                    // Departure: sphere expands and fades
                    sphere.scale.setScalar(0.1 + t * 1.9);
                    sphere.material.opacity = 0.7 * (1 - t);
                }

                effect.life -= dt;
                return effect.life > 0;
            },
            dispose: () => {
                this.renderer.removeFromScene(sphere);
                sphere.material.dispose();
                this.disposeParticleSystem(sparkles);
            }
        };

        this.effects.push(effect);
    }

    /**
     * Update persistent effects with entity positions
     */
    updatePersistentEffect(entityId, x, y) {
        const key = `aura_${entityId}`;
        if (this.persistentEffects.has(key)) {
            const aura = this.persistentEffects.get(key);
            aura.update(0.016, x, y); // Assume ~60fps
        }
    }
}

// Export
window.Effects3D = Effects3D;
