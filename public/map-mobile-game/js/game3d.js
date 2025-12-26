/**
 * 3D Game Extension for Primal Hunt
 * Extends the base Game class with 3D rendering
 */

class Game3D extends Game {
    constructor() {
        // Note: super() will create a 2D context, but we'll create a new canvas for 3D
        super();
        console.log('Game3D constructor called - 3D mode enabled');

        this.use3D = true;
        this.renderer3d = null;
        this.terrain3d = null;
        this.characters3d = null;
        this.effects3d = null;
        this.postProcessing = null;
        this.canvas3d = null;
    }

    init(role, characterData) {
        // Call parent init first
        super.init(role, characterData);

        // Initialize 3D systems
        if (this.use3D) {
            this.setup3DCanvas();
            this.init3D();
        }
    }

    setup3DCanvas() {
        // Create a separate canvas for 3D rendering
        this.canvas3d = document.createElement('canvas');
        this.canvas3d.id = 'game-canvas-3d';
        this.canvas3d.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1;
        `;

        // Insert 3D canvas into the game screen
        const gameScreen = document.getElementById('game-screen');
        gameScreen.insertBefore(this.canvas3d, gameScreen.firstChild);

        this.canvas3d.width = window.innerWidth;
        this.canvas3d.height = window.innerHeight;

        // Hide the 2D canvas when in 3D mode
        this.canvas.style.display = 'none';

        console.log('3D Canvas created and inserted');
    }

    init3D() {
        try {
            console.log('Initializing 3D engine...');

            // Check if Three.js is loaded
            if (typeof THREE === 'undefined') {
                console.error('Three.js is not loaded! 3D mode disabled.');
                this.use3D = false;
                this.canvas.style.display = '';
                return;
            }

            // Create 3D renderer using the dedicated 3D canvas
            console.log('Creating 3D renderer...');
            this.renderer3d = new Renderer3D(this.canvas3d);

            // Create 3D terrain from game map
            console.log('Creating 3D terrain...');
            this.terrain3d = new Terrain3D(this.renderer3d, this.map);

            // Create character manager
            console.log('Creating 3D characters...');
            this.characters3d = new Characters3D(this.renderer3d);

            // Create effects manager
            console.log('Creating 3D effects...');
            this.effects3d = new Effects3D(this.renderer3d);

            // Create post-processing
            console.log('Creating post-processing...');
            this.postProcessing = new PostProcessing(this.renderer3d);

            // Set camera initial position (matches cameraOffset)
            this.renderer3d.camera.position.set(0, 15, 12);

            console.log('3D engine initialized successfully!');
        } catch (error) {
            console.error('Failed to initialize 3D engine:', error);
            this.use3D = false;
            this.canvas.style.display = '';
            if (this.canvas3d && this.canvas3d.parentNode) {
                this.canvas3d.parentNode.removeChild(this.canvas3d);
            }
        }
    }

    resize() {
        super.resize();

        // Resize the 3D canvas
        if (this.canvas3d) {
            this.canvas3d.width = window.innerWidth;
            this.canvas3d.height = window.innerHeight;
        }

        if (this.renderer3d) {
            this.renderer3d.onResize();
        }
        if (this.postProcessing) {
            this.postProcessing.resize(window.innerWidth, window.innerHeight);
        }
    }

    update(dt) {
        // Call parent update (handles all game logic)
        super.update(dt);

        // Update 3D systems
        if (this.use3D && this.renderer3d) {
            this.update3D(dt);
        }
    }

    update3D(dt) {
        const time = this.renderer3d.clock.getElapsedTime();

        // Update camera to follow player
        if (this.player) {
            this.renderer3d.updateCamera(this.player.x, this.player.y, dt, this.map.width, this.map.height);
        }

        // Update terrain animations
        if (this.terrain3d) {
            this.terrain3d.update(time);
        }

        // Update character meshes
        if (this.characters3d) {
            for (const entity of this.entities) {
                if (entity.isAlive || entity.isDowned) {
                    this.characters3d.getOrCreateMesh(entity, this.map);
                    this.characters3d.updateMesh(entity, this.map, time);
                } else {
                    this.characters3d.removeMesh(entity.id);
                }
            }
        }

        // Update effects
        if (this.effects3d) {
            this.effects3d.update(dt);
        }

        // Update dynamic lights
        this.renderer3d.updateDynamicLights(dt);
    }

    render() {
        if (this.use3D && this.renderer3d) {
            this.render3D();
        } else {
            super.render();
        }
    }

    render3D() {
        const time = this.renderer3d.clock.getElapsedTime();

        // Render projectiles in 3D
        this.renderProjectiles3D();

        // Use post-processing if available
        if (this.postProcessing && this.postProcessing.enabled) {
            this.postProcessing.render(
                this.renderer3d.scene,
                this.renderer3d.camera,
                time
            );
        } else {
            this.renderer3d.render();
        }

        // Still render 2D minimap
        this.map.renderMinimap(
            this.minimapCtx,
            this.entities,
            this.player,
            120, 120
        );

        // Render FPS if enabled
        if (GameSettings.showFPS) {
            this.renderFPS(this.ctx);
        }
    }

    renderProjectiles3D() {
        // Create/update 3D projectile representations
        for (const proj of this.projectiles) {
            if (!proj.mesh3d && this.effects3d) {
                // Create projectile mesh
                const geometry = new THREE.SphereGeometry(proj.size * 0.01, 8, 8);
                const material = new THREE.MeshBasicMaterial({
                    color: new THREE.Color(proj.color),
                    transparent: true,
                    opacity: 0.9
                });
                const mesh = new THREE.Mesh(geometry, material);
                this.renderer3d.addToScene(mesh);
                proj.mesh3d = mesh;

                // Create trail effect
                proj.trail3d = this.effects3d.createProjectileTrail(proj);
            }

            if (proj.mesh3d) {
                const worldPos = this.renderer3d.gameToWorld(
                    proj.x - this.map.width / 2,
                    proj.y - this.map.height / 2
                );
                proj.mesh3d.position.set(worldPos.x * 20, 0.5, worldPos.z * 20);
            }
        }

        // Clean up dead projectile meshes
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            if (proj.life <= 0 && proj.mesh3d) {
                this.renderer3d.removeFromScene(proj.mesh3d);
                proj.mesh3d.geometry.dispose();
                proj.mesh3d.material.dispose();
                delete proj.mesh3d;
            }
        }
    }

    // Override effect creation methods to add 3D effects

    createExplosion(x, y, options) {
        // Call parent for game logic
        super.createExplosion(x, y, options);

        // Add 3D effect
        if (this.effects3d) {
            this.effects3d.createExplosion(x, y, options);
        }
    }

    createHitEffect(x, y, color) {
        // Parent doesn't need to do anything for pure visual
        if (this.effects3d) {
            this.effects3d.createHitEffect(x, y, color);
        }
    }

    createHealEffect(x, y, radius) {
        if (this.effects3d) {
            this.effects3d.createHealEffect(x, y, radius);
        }
    }

    createBeam(from, to, color) {
        if (this.effects3d) {
            this.effects3d.createBeam(from, to, color);
        }
    }

    createDome(x, y, options) {
        // Store dome for game logic
        this.dome = {
            x, y,
            radius: options.radius,
            remaining: options.duration,
            color: options.color
        };

        // Create 3D dome
        if (this.effects3d) {
            this.effects3d.createDome(x, y, options.radius, options.duration);
        }

        window.ui.showToast('Mobile Arena deployed!');
    }

    createConeAttack(user, target, options) {
        // Call parent for damage logic
        super.createConeAttack(user, target, options);

        // Add 3D fire effect
        if (this.effects3d) {
            const angle = Utils.angle(user.x, user.y, target.x, target.y);
            this.effects3d.createFireCone(user, angle, options.range, options.duration);
        }
    }

    createLightningStorm(x, y, options) {
        // Call parent for game logic
        super.createLightningStorm(x, y, options);

        // Lightning visual effects are created per-strike in the parent
    }

    createShockwave(entity, radius) {
        // Add shockwave effect
        if (this.effects3d) {
            this.effects3d.createExplosion(entity.x, entity.y, {
                color: entity.color || 0xffffff,
                radius: radius
            });
        }
    }

    stop() {
        super.stop();

        // Clean up 3D resources
        if (this.characters3d) {
            this.characters3d.clear();
        }
        if (this.effects3d) {
            this.effects3d.clear();
        }
        if (this.terrain3d) {
            this.terrain3d.dispose();
        }
        if (this.postProcessing) {
            this.postProcessing.dispose();
        }
        if (this.renderer3d) {
            this.renderer3d.dispose();
        }

        // Remove 3D canvas and show 2D canvas again
        if (this.canvas3d && this.canvas3d.parentNode) {
            this.canvas3d.parentNode.removeChild(this.canvas3d);
            this.canvas3d = null;
        }
        if (this.canvas) {
            this.canvas.style.display = '';
        }
    }
}

// Replace the default Game with Game3D
window.Game = Game3D;
window.Game3D = Game3D; // Also expose Game3D directly
console.log('Game3D loaded - Game class replaced with Game3D');
console.log('Verifying: window.Game is Game3D:', window.Game === Game3D);
console.log('window.Game.name:', window.Game.name);
