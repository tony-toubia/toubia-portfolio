// Void Warden: Game Engine & Orchestrator
class VoidWardenGame {
    constructor() {
        this.state = 'MENU'; // 'MENU' | 'PLAYING' | 'PAUSED' | 'PERKS' | 'GAMEOVER'
        this.mode = 'rush'; // 'rush' (2:00 Time Attack) or 'endless'
        this.rushDuration = 120.0;
        this.rushTimeRemaining = 120.0;

        // Statistics & Scoring
        this.score = 0;
        this.zombiesKilled = 0;
        this.vehiclesEaten = 0;
        this.bossesSlain = 0;
        this.runTimer = 0;
        this.frenzyCombo = 0;
        this.frenzyTimer = 0;
        this.freezeTimer = 0;

        // Screen Shake
        this.shakeDuration = 0;
        this.shakeIntensity = 0;

        // Supernova Ability Cooldown
        this.abilityCD = 14.0;
        this.abilityTimer = 0;

        // Local Storage Best
        this.highScore = parseInt(localStorage.getItem('void_warden_highscore') || '0', 10);
        this.bestLevel = parseInt(localStorage.getItem('void_warden_bestlevel') || '1', 10);

        this.initThree();
        this.initManagers();
        this.initHUD();
        this.initControls();
        this.initEvents();

        this.clock = new THREE.Clock();
        requestAnimationFrame((t) => this.render(t));
    }

    initThree() {
        this.container = document.getElementById('canvas-container');

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x06080e);
        this.scene.fog = new THREE.FogExp2(0x06080e, 0.012);

        // Camera
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(aspect < 1.0 ? 64 : 50, aspect, 0.1, 350);
        this.camera.position.set(0, 22, 16);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xd0e8ff, 0.7);
        this.scene.add(ambientLight);

        // Directional moonlight with soft shadows
        this.dirLight = new THREE.DirectionalLight(0xa5c9eb, 1.1);
        this.dirLight.position.set(35, 55, 30);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 1024;
        this.dirLight.shadow.mapSize.height = 1024;
        this.dirLight.shadow.camera.near = 10;
        this.dirLight.shadow.camera.far = 140;
        this.dirLight.shadow.camera.left = -45;
        this.dirLight.shadow.camera.right = 45;
        this.dirLight.shadow.camera.top = 45;
        this.dirLight.shadow.camera.bottom = -45;
        this.scene.add(this.dirLight);

        // Neon atmosphere accent lights
        const cyanPillarLight = new THREE.PointLight(0x00f3ff, 1.2, 50);
        cyanPillarLight.position.set(0, 15, 0);
        this.scene.add(cyanPillarLight);
    }

    initManagers() {
        this.pm = new ParticleManager(this.scene);
        this.hole = new VoidHole(this.scene, this.pm);
        this.city = new CityManager(this.scene, this.pm);
        this.zm = new ZombieManager(this.scene, this.pm);
    }

    initHUD() {
        this.hud = document.getElementById('hud');
        this.hudLevel = document.getElementById('hud-level');
        this.hudTierName = document.getElementById('hud-tier-name');
        this.hudMassText = document.getElementById('hud-mass-text');
        this.hudMassBar = document.getElementById('hud-mass-bar');
        this.hudScore = document.getElementById('hud-score');
        this.frenzyBadge = document.getElementById('frenzy-badge');
        this.frenzyText = document.getElementById('frenzy-text');
        this.cdOverlay = document.getElementById('cd-overlay');
        this.floatLayer = document.getElementById('float-text-layer');
        this.radarCanvas = document.getElementById('radar-canvas');
        this.radarCtx = this.radarCanvas ? this.radarCanvas.getContext('2d') : null;

        // Timer and Powerup banner
        this.hudTimer = document.getElementById('hud-timer');
        this.powerUpBanner = document.getElementById('powerup-banner');
        this.powerUpText = document.getElementById('powerup-text');
        this.highScoreDisplay = document.getElementById('menu-best-score');

        if (this.highScoreDisplay) {
            this.highScoreDisplay.innerText = this.highScore.toLocaleString();
        }
    }

    initControls() {
        this.input = new InputController();

        this.input.onAbility = () => {
            if (this.state !== 'PLAYING') return;
            if (this.abilityTimer <= 0) {
                this.hole.triggerSupernova();
                this.abilityTimer = this.abilityCD;
                this.triggerScreenShake(0.6, 1.0);
                this.input.triggerHaptic([40, 30, 70]);
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
        const playRush = document.getElementById('btn-play-rush');
        if (playRush) {
            playRush.addEventListener('click', () => {
                this.mode = 'rush';
                this.startPlay();
            });
        }

        const playEndless = document.getElementById('btn-play-endless');
        if (playEndless) {
            playEndless.addEventListener('click', () => {
                this.mode = 'endless';
                this.startPlay();
            });
        }

        // Fallback main play button
        const btnPlay = document.getElementById('btn-play-now');
        if (btnPlay) {
            btnPlay.addEventListener('click', () => {
                this.mode = 'rush';
                this.startPlay();
            });
        }

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
        this.rushTimeRemaining = this.rushDuration;
        this.frenzyCombo = 0;
        this.frenzyTimer = 0;
        this.freezeTimer = 0;
        this.abilityTimer = 0;
        this.shakeDuration = 0;

        this.hole.reset();
        this.pm.clear();

        document.querySelectorAll('.screen-modal').forEach(s => s.classList.add('hidden'));
        this.hud.classList.remove('hidden');
        document.getElementById('ability-btn-wrap').classList.remove('hidden');

        this.updateHUD();
    }

    triggerScreenShake(duration = 0.4, intensity = 0.8) {
        this.shakeDuration = duration;
        this.shakeIntensity = intensity;
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

    returnMenu() {
        this.state = 'MENU';
        document.querySelectorAll('.screen-modal').forEach(s => s.classList.add('hidden'));
        document.getElementById('screen-main').classList.remove('hidden');
        this.hud.classList.add('hidden');
        document.getElementById('ability-btn-wrap').classList.add('hidden');

        if (this.highScoreDisplay) {
            this.highScoreDisplay.innerText = this.highScore.toLocaleString();
        }
    }

    spawnFloatingText(text, color = '#00f3ff') {
        const div = document.createElement('div');
        div.className = 'float-txt';
        div.innerText = text;
        div.style.color = color;
        div.style.left = `${window.innerWidth / 2 + (Math.random() - 0.5) * 120}px`;
        div.style.top = `${window.innerHeight / 2 - 40 + (Math.random() - 0.5) * 50}px`;
        this.floatLayer.appendChild(div);

        setTimeout(() => div.remove(), 900);
    }

    onDevourZombie(z) {
        this.zombiesKilled++;
        const isBoss = z.type === 'boss';
        if (isBoss) this.bossesSlain++;

        // Haptic feedback
        if (isBoss) {
            this.input.triggerHaptic([70, 50, 100]);
            this.triggerScreenShake(0.65, 1.2);
            window.audioManager.playBossRoar();
        } else {
            this.input.triggerHaptic(18);
        }

        // Frenzy Combo Streak
        this.frenzyCombo++;
        this.frenzyTimer = 2.4;
        const multiplier = 1.0 + Math.min(this.frenzyCombo * 0.1, 2.5);

        const earnedPoints = Math.round(z.massXP * multiplier * 10);
        this.score += earnedPoints;

        window.audioManager.playSwallow(z.type);
        this.spawnFloatingText(`+${earnedPoints}`, isBoss ? '#ff007f' : (z.type === 'bloater' ? '#ccff00' : '#00f3ff'));

        const { leveledUp, newLevel } = this.hole.addMass(z.massXP);
        this.updateHUD();

        if (leveledUp) {
            this.onLevelUp(newLevel);
        }
    }

    onDevourProp(p) {
        // Red Explosive Fuel Barrel
        if (p.isExplosive) {
            window.audioManager.playExplosion();
            this.triggerScreenShake(0.6, 1.5);
            this.input.triggerHaptic([60, 40, 90]);

            // Detonate nearby zombies in 14m radius
            const vaporized = this.zm.obliterateZombiesInRadius(p.x, p.z, 14, (z) => this.onDevourZombie(z));
            const bonus = 150 + vaporized * 50;
            this.score += bonus;
            this.spawnFloatingText(`💥 CHAIN DETONATION! +${bonus}`, '#ff3b30');
            this.hole.addMass(p.massValue + vaporized * 10);
            this.updateHUD();
            return;
        }

        // Golden Supply Crate Power-up
        if (p.isSupplyCrate && p.supplyType) {
            window.audioManager.playPowerUp();
            this.triggerScreenShake(0.35, 0.7);
            this.input.triggerHaptic([50, 40, 80]);

            if (p.supplyType === 'mega_vacuum') {
                this.hole.applyPowerUp('mega_vacuum');
                this.spawnFloatingText('⚡ MEGA VACUUM ACTIVE! (10s)', '#00f3ff');
            } else if (p.supplyType === 'speed_boost') {
                this.hole.applyPowerUp('speed_boost');
                this.spawnFloatingText('🚀 SPEED DEMON ACTIVE! (10s)', '#ffd60a');
            } else if (p.supplyType === 'time_freeze') {
                this.freezeTimer = 8.0;
                this.spawnFloatingText('❄️ BLIZZARD FREEZE! (8s)', '#a0ecff');
            }

            this.score += 250;
            this.hole.addMass(p.massValue);
            this.updateHUD();
            return;
        }

        const isVehicle = p.type === 'car' || p.type === 'policeCar' || p.type === 'bus';
        if (isVehicle) {
            this.vehiclesEaten++;
            window.audioManager.playCarCrunch();
            this.triggerScreenShake(0.4, 0.9);
            this.input.triggerHaptic([40, 30, 60]);
        } else {
            window.audioManager.playCrunch();
            this.input.triggerHaptic(15);
        }

        const pts = Math.round(p.massValue * 12);
        this.score += pts;
        this.spawnFloatingText(`+${pts}`, isVehicle ? '#ffd166' : '#94a3b8');

        const { leveledUp, newLevel } = this.hole.addMass(p.massValue);
        this.updateHUD();

        if (leveledUp) {
            this.onLevelUp(newLevel);
        }
    }

    onLevelUp(newLevel) {
        window.audioManager.playTierUp();
        this.pm.spawnLevelUpHalo(this.hole.x, this.hole.z, this.hole.currentRadius);
        this.triggerScreenShake(0.5, 1.1);
        this.input.triggerHaptic([50, 40, 80]);
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
            { id: 'shockwave', name: 'KINETIC DETONATION', desc: 'Devouring large objects triggers kinetic pulses that pull zombies', icon: '💥' }
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

        // Frenzy Indicator
        if (this.frenzyCombo >= 3) {
            this.frenzyBadge.classList.remove('hidden');
            this.frenzyText.innerText = `🔥 SWARM FRENZY x${Math.min(this.frenzyCombo, 10)}!`;
        } else {
            this.frenzyBadge.classList.add('hidden');
        }

        // Active Power-up indicator
        if (this.powerUpBanner && this.powerUpText) {
            if (this.hole.vacuumBoostTimer > 0) {
                this.powerUpBanner.classList.remove('hidden');
                this.powerUpText.innerText = `⚡ MEGA VACUUM (${Math.ceil(this.hole.vacuumBoostTimer)}s)`;
            } else if (this.hole.speedBoostTimer > 0) {
                this.powerUpBanner.classList.remove('hidden');
                this.powerUpText.innerText = `🚀 SPEED DEMON (${Math.ceil(this.hole.speedBoostTimer)}s)`;
            } else if (this.freezeTimer > 0) {
                this.powerUpBanner.classList.remove('hidden');
                this.powerUpText.innerText = `❄️ TIME FREEZE (${Math.ceil(this.freezeTimer)}s)`;
            } else {
                this.powerUpBanner.classList.add('hidden');
            }
        }

        // Timer Display
        if (this.hudTimer) {
            if (this.mode === 'rush') {
                const mins = Math.floor(Math.max(0, this.rushTimeRemaining) / 60);
                const secs = Math.floor(Math.max(0, this.rushTimeRemaining) % 60);
                this.hudTimer.innerText = `⏱️ ${mins}:${secs < 10 ? '0' : ''}${secs}`;
                if (this.rushTimeRemaining < 20) {
                    this.hudTimer.style.color = '#ff3b30';
                } else {
                    this.hudTimer.style.color = '#00f3ff';
                }
            } else {
                const mins = Math.floor(this.runTimer / 60);
                const secs = Math.floor(this.runTimer % 60);
                this.hudTimer.innerText = `⏱️ ${mins}:${secs < 10 ? '0' : ''}${secs}`;
                this.hudTimer.style.color = '#00ff88';
            }
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

    gameOver() {
        this.state = 'GAMEOVER';
        this.hud.classList.add('hidden');
        document.getElementById('ability-btn-wrap').classList.add('hidden');

        // Check and save High Score
        const isNewBest = this.score > this.highScore;
        if (isNewBest) {
            this.highScore = this.score;
            localStorage.setItem('void_warden_highscore', this.highScore.toString());
        }
        if (this.hole.level > this.bestLevel) {
            this.bestLevel = this.hole.level;
            localStorage.setItem('void_warden_bestlevel', this.bestLevel.toString());
        }

        // Populate Game Over stats
        document.getElementById('res-score').innerText = this.score.toLocaleString() + (isNewBest ? ' 🏆 NEW RECORD!' : '');
        document.getElementById('res-level').innerText = `LVL ${this.hole.level}`;
        document.getElementById('res-zombies').innerText = this.zombiesKilled.toLocaleString();
        document.getElementById('res-vehicles').innerText = this.vehiclesEaten.toLocaleString();
        document.getElementById('res-bosses').innerText = this.bossesSlain.toLocaleString();

        const mins = Math.floor(this.runTimer / 60);
        const secs = Math.floor(this.runTimer % 60);
        document.getElementById('res-time').innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

        document.getElementById('screen-gameover').classList.remove('hidden');
    }

    render(time) {
        requestAnimationFrame((t) => this.render(t));

        const dt = Math.min(this.clock.getDelta(), 0.1);

        if (this.state === 'PLAYING') {
            this.runTimer += dt;

            // Rush mode countdown
            if (this.mode === 'rush') {
                this.rushTimeRemaining -= dt;
                if (this.rushTimeRemaining <= 0) {
                    this.gameOver();
                    return;
                }
            }

            // Blizzard Freeze timer
            if (this.freezeTimer > 0) {
                this.freezeTimer -= dt;
            }

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
            this.zm.update(dt, this.hole, (z) => this.onDevourZombie(z), this.freezeTimer > 0);
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
            let targetCamX = this.hole.x;
            let targetCamZ = this.hole.z + camPitchOffset;

            // Apply Dynamic Screen Shake if active
            if (this.shakeDuration > 0) {
                this.shakeDuration -= dt;
                const shakeX = (Math.random() - 0.5) * this.shakeIntensity;
                const shakeY = (Math.random() - 0.5) * this.shakeIntensity;
                const shakeZ = (Math.random() - 0.5) * this.shakeIntensity;
                targetCamX += shakeX;
                targetCamZ += shakeZ;
                this.camera.position.y += shakeY;
            }

            this.camera.position.x = targetCamX;
            this.camera.position.y += (camElevation - this.camera.position.y) * dt * 5.0;
            this.camera.position.z = targetCamZ;
            this.camera.lookAt(this.hole.x, 0, this.hole.z);

            // Update HUD elements & Radar
            this.updateHUD();
            this.drawRadar();
        }

        // Render WebGL
        this.renderer.render(this.scene, this.camera);
    }
window.VoidWardenGame = VoidWardenGame;
window.Game = VoidWardenGame;
