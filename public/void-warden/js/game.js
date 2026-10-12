// Main Game Loop for Void Warden: Hole Devourer
class Game {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.state = 'MENU'; // MENU, PLAYING, PERKS, PAUSED, GAMEOVER

        // Stats
        this.score = 0;
        this.zombiesKilled = 0;
        this.vehiclesEaten = 0;
        this.bossesSlain = 0;
        this.runTimer = 0;
        this.frenzyCombo = 0;
        this.frenzyTimer = 0;

        // Ability
        this.abilityCD = 10.0;
        this.abilityTimer = 0;

        // Three.js Core
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();

        // Subsystems
        this.pm = null;
        this.city = null;
        this.zm = null;
        this.hole = null;
        this.input = null;

        // DOM elements
        this.hud = document.getElementById('hud');
        this.hudLevel = document.getElementById('hud-level');
        this.hudTierName = document.getElementById('hud-tier-name');
        this.hudMassText = document.getElementById('hud-mass-text');
        this.hudMassBar = document.getElementById('hud-mass-bar');
        this.hudScore = document.getElementById('hud-score');
        this.frenzyBadge = document.getElementById('frenzy-badge');
        this.frenzyText = document.getElementById('frenzy-text');
        this.abilityBtnWrap = document.getElementById('ability-btn-wrap');
        this.cdOverlay = document.getElementById('cd-overlay');
        this.floatLayer = document.getElementById('float-text-layer');
        this.radarCanvas = document.getElementById('radar-canvas');
        this.radarCtx = this.radarCanvas ? this.radarCanvas.getContext('2d') : null;

        this.initGraphics();
        this.initSubsystems();
        this.initEvents();

        // Start render loop
        requestAnimationFrame((t) => this.render(t));
    }

    initGraphics() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x060913);
        this.scene.fog = new THREE.FogExp2(0x060913, 0.015);

        // Perspective Camera angled down, center-locked to hole
        const aspect = window.innerWidth / window.innerHeight;
        const fov = aspect < 1.0 ? 64 : 50;
        this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
        this.camera.position.set(0, 26, 20);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Ambient & Directional Lighting
        const amb = new THREE.AmbientLight(0x334466, 1.1);
        this.scene.add(amb);

        const sun = new THREE.DirectionalLight(0xe0f2fe, 1.4);
        sun.position.set(30, 60, 30);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 1024;
        sun.shadow.mapSize.height = 1024;
        this.scene.add(sun);

        // Neon atmospheric accent lights
        const cyanLight = new THREE.PointLight(0x00f3ff, 2.5, 70);
        cyanLight.position.set(-30, 15, -20);
        const purpleLight = new THREE.PointLight(0x9d4edd, 2.5, 70);
        purpleLight.position.set(30, 15, 20);
        this.scene.add(cyanLight, purpleLight);
    }

    initSubsystems() {
        this.pm = new ParticleManager(this.scene);
        this.city = new CityManager(this.scene, this.pm);
        this.zm = new ZombieManager(this.scene, this.pm);
        this.hole = new VoidHole(this.scene, this.pm);
        this.input = new InputController();

        this.input.onAbility = () => {
            if (this.state !== 'PLAYING') return;
            if (this.abilityTimer <= 0) {
                this.hole.triggerSupernova();
                this.abilityTimer = this.abilityCD;
            }
        };
    }

    initEvents() {
        window.addEventListener('resize', () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            this.camera.aspect = w / h;
            this.camera.fov = (w / h) < 1.0 ? 64 : 50;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        });

        // UI buttons
        document.getElementById('btn-play-now').addEventListener('click', () => this.startPlay());
        document.getElementById('btn-instructions').addEventListener('click', () => {
            document.getElementById('screen-info').classList.remove('hidden');
        });
        document.getElementById('btn-back-menu').addEventListener('click', () => {
            document.getElementById('screen-info').classList.add('hidden');
        });

        document.getElementById('btn-audio-toggle').addEventListener('click', () => {
            const muted = window.audioManager.toggleMute();
            document.getElementById('btn-audio-toggle').innerText = muted ? '🔇' : '🔊';
        });

        document.getElementById('btn-pause-toggle').addEventListener('click', () => this.togglePause());
        document.getElementById('btn-unpause').addEventListener('click', () => this.togglePause());
        document.getElementById('btn-restart').addEventListener('click', () => this.startPlay());
        document.getElementById('btn-exit').addEventListener('click', () => this.returnMenu());

        document.getElementById('btn-retry').addEventListener('click', () => this.startPlay());
        document.getElementById('btn-over-menu').addEventListener('click', () => this.returnMenu());
    }

    startPlay() {
        window.audioManager.init();
        this.state = 'PLAYING';

        this.score = 0;
        this.zombiesKilled = 0;
        this.vehiclesEaten = 0;
        this.bossesSlain = 0;
        this.runTimer = 0;
        this.frenzyCombo = 0;
        this.frenzyTimer = 0;
        this.abilityTimer = 0;

        this.hole.reset();
        this.pm.clear();

        document.querySelectorAll('.screen-modal').forEach(s => s.classList.add('hidden'));
        this.hud.classList.remove('hidden');
        this.abilityBtnWrap.classList.remove('hidden');

        this.updateHUD();
    }

    returnMenu() {
        this.state = 'MENU';
        document.querySelectorAll('.screen-modal').forEach(s => s.classList.add('hidden'));
        document.getElementById('screen-main').classList.remove('hidden');
        this.hud.classList.add('hidden');
        this.abilityBtnWrap.classList.add('hidden');
    }

    togglePause() {
        if (this.state === 'PLAYING') {
            this.state = 'PAUSED';
            document.getElementById('screen-pause').classList.remove('hidden');
        } else if (this.state === 'PAUSED') {
            this.state = 'PLAYING';
            document.getElementById('screen-pause').classList.add('hidden');
        }
    }

    spawnFloatingText(text, color = '#ffd60a') {
        if (!this.floatLayer) return;
        const msg = document.createElement('div');
        msg.className = 'float-msg';
        msg.innerText = text;
        msg.style.color = color;
        // Position at screen center with random offset
        const randX = window.innerWidth / 2 + (Math.random() - 0.5) * 120;
        const randY = window.innerHeight / 2 - 30 + (Math.random() - 0.5) * 60;
        msg.style.left = `${randX}px`;
        msg.style.top = `${randY}px`;
        this.floatLayer.appendChild(msg);

        setTimeout(() => {
            if (msg.parentNode) msg.parentNode.removeChild(msg);
        }, 850);
    }

    onDevourZombie(z) {
        this.zombiesKilled++;
        if (z.type === 'boss') this.bossesSlain++;

        const { leveledUp, newLevel, earnedXP } = this.hole.addMass(z.massXP);
        this.score += earnedXP * 10;

        // Frenzy increment
        this.frenzyCombo++;
        this.frenzyTimer = 1.6;

        this.spawnFloatingText(`+${earnedXP} XP`, z.type === 'boss' ? '#ff007f' : '#00f3ff');
        window.audioManager.playSwallow(Math.min(this.frenzyCombo, 10));

        if (z.type === 'boss') {
            this.pm.spawnShockwave(this.hole.x, this.hole.z, this.hole.currentRadius * 3, 0xff007f);
            this.spawnFloatingText('TITAN SLAIN! +3000', '#ffd60a');
        }

        this.updateHUD();

        if (leveledUp) {
            this.onLevelUp(newLevel);
        }
    }

    onDevourProp(p) {
        if (p.type === 'car' || p.type === 'policeCar' || p.type === 'bus') {
            this.vehiclesEaten++;
        }

        const { leveledUp, newLevel, earnedXP } = this.hole.addMass(p.massValue);
        this.score += earnedXP * 10;

        this.spawnFloatingText(`+${earnedXP} XP`, '#ffd60a');
        window.audioManager.playSwallow(2);

        this.updateHUD();

        if (leveledUp) {
            this.onLevelUp(newLevel);
        }
    }

    onLevelUp(newLevel) {
        window.audioManager.playTierUp();
        this.pm.spawnShockwave(this.hole.x, this.hole.z, this.hole.currentRadius * 3, 0x00f3ff);
        this.spawnFloatingText(`LEVEL UP! LVL ${newLevel}`, '#00ff88');

        // Present Vampire Survivors Perk Selection
        this.state = 'PERKS';
        this.showPerkSelection(newLevel);
    }

    showPerkSelection(level) {
        const perkPool = [
            { id: 'gravity', name: 'GRAVITATIONAL REACH', desc: '+35% Event Horizon suction radius and pull force', icon: '🌌' },
            { id: 'speed', name: 'WARP OVERDRIVE', desc: '+25% Void movement and gliding speed', icon: '⚡' },
            { id: 'mass', name: 'DARK MATTER HARVEST', desc: '+40% bonus Mass XP from all devoured zombies and cars', icon: '🌀' },
            { id: 'supernova', name: 'SUPERNOVA RECHARGE', desc: '-35% Supernova ability cooldown timer', icon: '⏳' },
            { id: 'shockwave', name: 'KINETIC DETONATION', desc: 'Devouring large objects sends a shockwave pulling nearby zombies', icon: '💥' }
        ];

        const picks = perkPool.sort(() => 0.5 - Math.random()).slice(0, 3);
        const container = document.getElementById('perk-items-box');
        container.innerHTML = '';

        document.getElementById('perk-level-title').innerText = `LEVEL ${level} MUTATION`;

        picks.forEach(p => {
            const el = document.createElement('div');
            el.className = 'perk-item';
            el.innerHTML = `
                <div class="perk-icon-slot">${p.icon}</div>
                <div>
                    <div class="perk-header">${p.name}</div>
                    <div class="perk-detail">${p.desc}</div>
                </div>
            `;
            el.addEventListener('click', () => this.applyPerk(p));
            container.appendChild(el);
        });

        document.getElementById('screen-perks').classList.remove('hidden');
    }

    applyPerk(perk) {
        if (perk.id === 'gravity') {
            this.hole.suctionMultiplier *= 1.35;
            this.hole.suctionForce *= 1.35;
        } else if (perk.id === 'speed') {
            this.hole.baseSpeed *= 1.25;
        } else if (perk.id === 'mass') {
            this.hole.massMultiplier *= 1.4;
        } else if (perk.id === 'supernova') {
            this.abilityCD *= 0.65;
        } else if (perk.id === 'shockwave') {
            this.pm.spawnShockwave(this.hole.x, this.hole.z, this.hole.currentRadius * 4, 0x00f3ff);
        }

        document.getElementById('screen-perks').classList.add('hidden');
        this.state = 'PLAYING';
    }

    updateHUD() {
        this.hudLevel.innerText = this.hole.level;
        this.hudScore.innerText = this.score.toLocaleString();

        const tierNames = ['TINY RIFT', 'EXPANDING VORTEX', 'BLACK HOLE', 'GARGANTUAN ABYSS', 'CITY DEVOURER'];
        this.hudTierName.innerText = tierNames[Math.min(this.hole.level - 1, 4)];

        const currXP = this.hole.massXP;
        const prevXP = this.hole.levelThresholds[this.hole.level - 1];
        const nextXP = this.hole.levelThresholds[this.hole.level];
        const pct = Math.min(100, Math.max(0, ((currXP - prevXP) / (nextXP - prevXP)) * 100));

        this.hudMassBar.style.width = `${pct}%`;
        this.hudMassText.innerText = `${currXP} / ${nextXP} XP`;

        // Frenzy
        if (this.frenzyCombo >= 3) {
            this.frenzyBadge.classList.remove('hidden');
            this.frenzyText.innerText = `🔥 SWARM FRENZY x${Math.min(this.frenzyCombo, 10)}!`;
        } else {
            this.frenzyBadge.classList.add('hidden');
        }
    }

    drawRadar() {
        if (!this.radarCtx) return;
        const ctx = this.radarCtx;
        const size = 90;
        const half = size / 2;
        const scale = size / 140; // 140m city

        ctx.clearRect(0, 0, size, size);

        // Circular background & scan grid
        ctx.fillStyle = 'rgba(4, 8, 16, 0.85)';
        ctx.beginPath();
        ctx.arc(half, half, half - 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 243, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(half, half, half * 0.5, 0, Math.PI * 2);
        ctx.stroke();

        // Draw Zombies as green dots
        ctx.fillStyle = '#00ff88';
        for (let i = 0; i < this.zm.zombies.length; i += 2) {
            const z = this.zm.zombies[i];
            const rx = half + (z.x - this.hole.x) * scale;
            const ry = half + (z.z - this.hole.z) * scale;
            if (Math.hypot(rx - half, ry - half) < half - 4) {
                ctx.fillRect(rx - 1, ry - 1, 2, 2);
            }
        }

        // Draw Bosses as flashing pink dots
        ctx.fillStyle = '#ff007f';
        this.zm.zombies.forEach(z => {
            if (z.type === 'boss') {
                const rx = half + (z.x - this.hole.x) * scale;
                const ry = half + (z.z - this.hole.z) * scale;
                if (Math.hypot(rx - half, ry - half) < half - 4) {
                    ctx.beginPath();
                    ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        });

        // Center player hole
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(half, half, Math.max(3, this.hole.currentRadius * scale * 1.5), 0, Math.PI * 2);
        ctx.stroke();
    }

    render(time) {
        requestAnimationFrame((t) => this.render(t));

        const dt = Math.min(this.clock.getDelta(), 0.1);

        if (this.state === 'PLAYING') {
            this.runTimer += dt;

            // Frenzy timer decay
            if (this.frenzyTimer > 0) {
                this.frenzyTimer -= dt;
                if (this.frenzyTimer <= 0) {
                    this.frenzyCombo = 0;
                    this.updateHUD();
                }
            }

            // Ability CD
            if (this.abilityTimer > 0) {
                this.abilityTimer -= dt;
                const pct = (this.abilityTimer / this.abilityCD) * 100;
                this.cdOverlay.style.height = `${pct}%`;
            } else {
                this.cdOverlay.style.height = '0%';
            }

            // Move Hole based on Joystick / Keyboard
            const vec = this.input.getVector();
            let speedBoost = 1.0 + Math.min(this.frenzyCombo * 0.04, 0.4);
            this.hole.move(vec.x * speedBoost, vec.z * speedBoost, dt);
            this.hole.update(dt);

            // Update City Props & Zombies
            this.city.update(dt, this.hole, (p) => this.onDevourProp(p));
            this.zm.update(dt, this.hole, (z) => this.onDevourZombie(z));
            this.pm.update(dt);

            // Absolute Center-Lock & Dynamic Continuous Zoom-Out:
            // The hole is mathematically locked dead-center in the mobile viewport.
            // As the hole expands in radius, the camera smoothly zooms out proportionally,
            // preventing the hole from dominating the screen and revealing more of the city!
            const isPortrait = this.camera.aspect < 1.0;
            const baseElevation = isPortrait ? 22.0 : 17.0;
            const dynamicZoom = this.hole.currentRadius * 5.2;
            const camElevation = baseElevation + dynamicZoom;
            const camPitchOffset = camElevation * 0.72;

            // Zero lag on X and Z camera tracking so hole NEVER drifts off-screen:
            this.camera.position.x = this.hole.x;
            this.camera.position.y += (camElevation - this.camera.position.y) * dt * 5.0;
            this.camera.position.z = this.hole.z + camPitchOffset;
            this.camera.lookAt(this.hole.x, 0, this.hole.z);

            // Draw radar
            this.drawRadar();
        }

        // Render WebGL
        this.renderer.render(this.scene, this.camera);
    }
}
