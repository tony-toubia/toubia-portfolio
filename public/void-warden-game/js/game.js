// Main Game Engine & Loop for Void Warden: Zombie Swarm
class Game {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.state = 'MENU'; // MENU, PLAYING, PERKS, PAUSED, GAMEOVER, VICTORY

        // Game Stats
        this.score = 0;
        this.totalZombiesKilled = 0;
        this.totalCiviliansSaved = 0;
        this.totalCiviliansLost = 0;
        this.maxCombo = 1;
        this.currentCombo = 1;
        this.comboTimer = 0;
        this.gateHealth = 100;

        // Ability
        this.abilityCooldown = 12.0;
        this.abilityTimer = 0;

        // Perks Applied
        this.perks = [];

        // Three.js Core
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();

        // Subsystems
        this.pm = null;
        this.em = null;
        this.hole = null;
        this.wm = null;
        this.input = null;

        // DOM Elements
        this.hud = document.getElementById('hud');
        this.scoreVal = document.getElementById('score-val');
        this.gateBar = document.getElementById('gate-hp-bar');
        this.gateText = document.getElementById('gate-hp-text');
        this.tierBar = document.getElementById('tier-bar');
        this.tierName = document.getElementById('tier-name');
        this.tierProgressText = document.getElementById('tier-progress-text');
        this.waveDisplay = document.getElementById('wave-display');
        this.comboBadge = document.getElementById('combo-badge');
        this.comboText = document.getElementById('combo-text');
        this.alertBanner = document.getElementById('alert-banner');
        this.abilityCdOverlay = document.getElementById('ability-cd-overlay');
        this.abilityControls = document.getElementById('ability-controls');

        this.initGraphics();
        this.initEnvironment();
        this.initSubsystems();
        this.initEvents();

        // Start render loop
        requestAnimationFrame((t) => this.render(t));
    }

    initGraphics() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x060913);
        this.scene.fog = new THREE.FogExp2(0x060913, 0.022);

        // Perspective Camera angled slightly down (Isometric view)
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
        this.camera.position.set(0, 32, 28);
        this.camera.lookAt(0, 0, 4);

        // WebGL Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Lights
        const ambientLight = new THREE.AmbientLight(0x223355, 0.9);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xddeeff, 1.2);
        dirLight.position.set(15, 40, 20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        this.scene.add(dirLight);

        // Neon side rim lights
        const cyanLight = new THREE.PointLight(0x00f3ff, 2.0, 50);
        cyanLight.position.set(-18, 5, 5);
        const magentaLight = new THREE.PointLight(0xff007f, 2.0, 50);
        magentaLight.position.set(18, 5, 5);
        this.scene.add(cyanLight, magentaLight);
    }

    initEnvironment() {
        // Floor Plane
        const floorGeom = new THREE.PlaneGeometry(36, 45);
        floorGeom.rotateX(-Math.PI / 2);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x0a0f1d,
            roughness: 0.85,
            metalness: 0.15
        });
        const floor = new THREE.Mesh(floorGeom, floorMat);
        floor.position.set(0, 0, 2.5);
        floor.receiveShadow = true;
        this.scene.add(floor);

        // Subtle Grid Overlay on Floor
        const grid = new THREE.GridHelper(45, 45, 0x00f3ff, 0x1a2639);
        grid.position.set(0, 0.01, 2.5);
        grid.material.opacity = 0.25;
        grid.material.transparent = true;
        this.scene.add(grid);

        // Side Walls (Containment Laser Barricades)
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x111928, roughness: 0.5 });
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, 45), wallMat);
        leftWall.position.set(-18, 1.5, 2.5);
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, 45), wallMat);
        rightWall.position.set(18, 1.5, 2.5);
        this.scene.add(leftWall, rightWall);

        // Glowing Laser Beams on side walls
        const laserMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
        const leftLaser = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 45), laserMat);
        leftLaser.rotation.x = Math.PI / 2;
        leftLaser.position.set(-17.2, 2.5, 2.5);
        const rightLaser = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 45), laserMat);
        rightLaser.rotation.x = Math.PI / 2;
        rightLaser.position.set(17.2, 2.5, 2.5);
        this.scene.add(leftLaser, rightLaser);

        // Sanctuary Gate (Fortress Wall at bottom)
        const gateGroup = new THREE.Group();
        const gateWall = new THREE.Mesh(new THREE.BoxGeometry(34, 4, 2), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
        gateWall.position.set(0, 2, 22.5);
        gateGroup.add(gateWall);

        // Glowing Shield Doorway in center
        const shieldDoor = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.5), new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        }));
        shieldDoor.position.set(0, 1.8, 21.6);
        gateGroup.add(shieldDoor);

        // Sanctuary Defense Turrets
        const turretMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
        const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 2, 12), turretMat);
        t1.position.set(-8, 4.5, 22.5);
        const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 2, 12), turretMat);
        t2.position.set(8, 4.5, 22.5);
        gateGroup.add(t1, t2);

        this.gateGroup = gateGroup;
        this.shieldDoor = shieldDoor;
        this.scene.add(gateGroup);
    }

    initSubsystems() {
        this.pm = new ParticleManager(this.scene);
        this.em = new EntityManager(this.scene, this.pm);
        this.hole = new VoidHole(this.scene, this.pm);
        this.wm = new WaveManager(this.em);
        this.input = new InputController();

        // Connect ability trigger
        this.input.onAbilityTrigger = () => {
            if (this.state !== 'PLAYING') return;
            if (this.abilityTimer <= 0) {
                this.hole.triggerSingularity();
                this.abilityTimer = this.abilityCooldown;
            }
        };
    }

    initEvents() {
        window.addEventListener('resize', () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        });

        // UI Button Events
        document.getElementById('btn-start-game').addEventListener('click', () => this.startGame());
        document.getElementById('btn-how-to-play').addEventListener('click', () => {
            document.getElementById('screen-guide').classList.remove('hidden');
        });
        document.getElementById('btn-close-guide').addEventListener('click', () => {
            document.getElementById('screen-guide').classList.add('hidden');
        });

        document.getElementById('btn-sound-toggle').addEventListener('click', () => {
            const muted = window.audioManager.toggleMute();
            document.getElementById('btn-sound-toggle').innerText = muted ? '🔇' : '🔊';
        });

        document.getElementById('btn-pause').addEventListener('click', () => this.togglePause());
        document.getElementById('btn-resume').addEventListener('click', () => this.togglePause());
        document.getElementById('btn-restart').addEventListener('click', () => this.startGame());
        document.getElementById('btn-quit').addEventListener('click', () => this.returnToMenu());

        document.getElementById('btn-retry').addEventListener('click', () => this.startGame());
        document.getElementById('btn-gameover-menu').addEventListener('click', () => this.returnToMenu());

        document.getElementById('btn-endless').addEventListener('click', () => this.startEndless());
        document.getElementById('btn-victory-menu').addEventListener('click', () => this.returnToMenu());
    }

    startGame() {
        window.audioManager.init();
        this.state = 'PLAYING';

        // Reset Stats
        this.score = 0;
        this.totalZombiesKilled = 0;
        this.totalCiviliansSaved = 0;
        this.totalCiviliansLost = 0;
        this.maxCombo = 1;
        this.currentCombo = 1;
        this.comboTimer = 0;
        this.gateHealth = 100;
        this.abilityTimer = 0;
        this.perks = [];

        // Reset Subsystems
        this.em.clear();
        this.pm.clear();
        this.hole.reset();

        // Hide screens, show HUD
        document.querySelectorAll('.screen-modal').forEach(s => s.classList.add('hidden'));
        this.hud.classList.remove('hidden');
        this.abilityControls.classList.remove('hidden');

        // Start Wave 1
        this.wm.startWave(1, false);
        this.updateHUD();
        this.showAlert('DEFEND THE SANCTUARY!');
    }

    startEndless() {
        this.state = 'PLAYING';
        document.querySelectorAll('.screen-modal').forEach(s => s.classList.add('hidden'));
        this.hud.classList.remove('hidden');
        this.abilityControls.classList.remove('hidden');

        this.wm.startWave(6, true);
        this.showAlert('ENTERING ENDLESS HORDE!');
    }

    returnToMenu() {
        this.state = 'MENU';
        document.querySelectorAll('.screen-modal').forEach(s => s.classList.add('hidden'));
        document.getElementById('screen-menu').classList.remove('hidden');
        this.hud.classList.add('hidden');
        this.abilityControls.classList.add('hidden');
        this.em.clear();
        this.pm.clear();
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

    showAlert(text, isDanger = false) {
        if (!this.alertBanner) return;
        this.alertBanner.innerText = text;
        this.alertBanner.style.background = isDanger ? 'rgba(255, 51, 102, 0.9)' : 'rgba(0, 243, 255, 0.9)';
        this.alertBanner.style.color = isDanger ? '#fff' : '#040810';
        this.alertBanner.classList.remove('hidden');

        if (this.alertTimeout) clearTimeout(this.alertTimeout);
        this.alertTimeout = setTimeout(() => {
            this.alertBanner.classList.add('hidden');
        }, 2200);
    }

    onSwallow(entity) {
        if (entity.isZombie) {
            this.totalZombiesKilled++;
            if (entity.isHazard) {
                // Bloater swallowed: Acid indigestion!
                this.hole.applyAcidIndigestion();
                window.audioManager.playAcid();
                this.showAlert('ACID INDIGESTION! (-15% SIZE)', true);
                this.currentCombo = 1;
            } else {
                // Standard zombie or brute
                const tierChanged = this.hole.addMass(entity.massValue);
                if (tierChanged) {
                    window.audioManager.playTierUp();
                    this.showAlert(`VOID ASCENSION: TIER ${this.hole.tier}!`);
                    this.pm.spawnShockwave(this.hole.x, this.hole.z, this.hole.currentRadius * 3, 0x00f3ff);
                }

                // Combo calculation
                this.comboTimer = 1.6;
                this.currentCombo++;
                if (this.currentCombo > this.maxCombo) this.maxCombo = this.currentCombo;

                const pts = entity.massValue * 10 * this.currentCombo;
                this.score += pts;
                window.audioManager.playSwallow(this.currentCombo);
            }
        } else {
            // Civilian swallowed: Tragedy!
            this.totalCiviliansLost++;
            this.score = Math.max(0, this.score - 500);
            this.currentCombo = 1;
            window.audioManager.playCivilianLost();
            this.showAlert('CIVILIAN CASUALTY! (-500 PTS)', true);
        }

        this.updateHUD();
    }

    onGateDamage(amount, entity) {
        this.gateHealth = Math.max(0, this.gateHealth - amount);
        this.shieldDoor.material.opacity = Math.max(0.1, this.gateHealth / 100);
        window.audioManager.playGateHit();
        this.showAlert(`SANCTUARY BREACHED! -${amount}%`, true);
        this.updateHUD();

        if (this.gateHealth <= 0) {
            this.gameOver();
        }
    }

    onCivilianSaved(entity) {
        this.totalCiviliansSaved++;
        this.score += 250;
        this.gateHealth = Math.min(100, this.gateHealth + 5);
        window.audioManager.playCivilianSaved();
        this.showAlert('SURVIVOR SECURED! (+5% GATE HP)');
        this.updateHUD();
    }

    updateHUD() {
        this.scoreVal.innerText = this.score.toLocaleString();
        this.gateText.innerText = `${Math.ceil(this.gateHealth)}%`;
        this.gateBar.style.width = `${Math.max(0, this.gateHealth)}%`;

        // Tier progress
        const t = this.hole.tier;
        this.tierName.innerText = `TIER ${t} RIFT`;
        const curr = this.hole.mass;
        const target = t === 1 ? this.hole.tierThresholds[1] : (t === 2 ? this.hole.tierThresholds[2] : 1500);
        const prev = t === 1 ? 0 : this.hole.tierThresholds[t - 1];
        const pct = Math.min(100, Math.max(0, ((curr - prev) / (target - prev)) * 100));

        this.tierBar.style.width = `${pct}%`;
        this.tierProgressText.innerText = `${curr} / ${target}`;

        // Wave text
        if (this.wm.isEndless) {
            this.waveDisplay.innerText = `ENDLESS #${this.wm.currentWave - 5}`;
        } else {
            this.waveDisplay.innerText = `WAVE ${this.wm.currentWave} / 5`;
        }

        // Combo badge
        if (this.currentCombo >= 2) {
            this.comboBadge.classList.remove('hidden');
            this.comboText.innerText = `x${this.currentCombo} COMBO!`;
        } else {
            this.comboBadge.classList.add('hidden');
        }
    }

    onWaveComplete() {
        if (!this.wm.isEndless && this.wm.currentWave === this.wm.maxCampaignWaves) {
            // Completed all 5 campaign waves!
            this.victory();
            return;
        }

        // Show Roguelite Perk Screen
        this.state = 'PERKS';
        this.presentPerks();
    }

    presentPerks() {
        const perkPool = [
            { id: 'size', title: 'EVENT HORIZON EXPANSION', desc: '+25% Base Hole Diameter permanently', icon: '🌌' },
            { id: 'suction', title: 'GRAVITON SINGULARITY', desc: '+40% Suction Pull Strength', icon: '🌀' },
            { id: 'speed', title: 'WARP PROPULSION', desc: '+25% Void Movement & Drift Speed', icon: '⚡' },
            { id: 'repair', title: 'NANITE REPAIR SWARM', desc: 'Restores +40% Sanctuary Gate Health', icon: '🛡️' },
            { id: 'repulsor', title: 'AEGIS HUMAN WARD', desc: 'Repels Civilians safely away from the rift rim', icon: '🕊️' },
            { id: 'cooldown', title: 'SINGULARITY OVERCHARGE', desc: 'Reduces Singularity Ability cooldown by 30%', icon: '⏳' }
        ];

        // Pick 3 random perks
        const shuffled = perkPool.sort(() => 0.5 - Math.random()).slice(0, 3);
        const container = document.getElementById('perk-cards-container');
        container.innerHTML = '';

        shuffled.forEach(perk => {
            const card = document.createElement('div');
            card.className = 'perk-card';
            card.innerHTML = `
                <div class="perk-icon-wrap">${perk.icon}</div>
                <div>
                    <div class="perk-title">${perk.title}</div>
                    <div class="perk-desc">${perk.desc}</div>
                </div>
            `;
            card.addEventListener('click', () => this.applyPerk(perk));
            container.appendChild(card);
        });

        document.getElementById('screen-perks').classList.remove('hidden');
    }

    applyPerk(perk) {
        this.perks.push(perk.id);

        if (perk.id === 'size') {
            this.hole.baseRadius *= 1.25;
            this.hole.targetRadius *= 1.25;
        } else if (perk.id === 'suction') {
            this.hole.suctionForce *= 1.4;
            this.hole.suctionMultiplier *= 1.15;
        } else if (perk.id === 'speed') {
            this.hole.baseSpeed *= 1.25;
        } else if (perk.id === 'repair') {
            this.gateHealth = Math.min(100, this.gateHealth + 40);
        } else if (perk.id === 'repulsor') {
            this.hole.hasCivilianRepulsor = true;
        } else if (perk.id === 'cooldown') {
            this.abilityCooldown *= 0.7;
        }

        document.getElementById('screen-perks').classList.add('hidden');
        this.state = 'PLAYING';

        // Proceed to next wave
        this.wm.startWave(this.wm.currentWave + 1, this.wm.isEndless);
        this.updateHUD();
        this.showAlert(`WAVE ${this.wm.currentWave} INCOMING!`);
    }

    gameOver() {
        this.state = 'GAMEOVER';
        this.hud.classList.add('hidden');
        this.abilityControls.classList.add('hidden');

        document.getElementById('stat-mass').innerText = this.score.toLocaleString();
        document.getElementById('stat-zombies').innerText = this.totalZombiesKilled;
        document.getElementById('stat-civilians-saved').innerText = this.totalCiviliansSaved;
        document.getElementById('stat-civilians-lost').innerText = this.totalCiviliansLost;
        document.getElementById('stat-combo').innerText = `x${this.maxCombo}`;
        document.getElementById('stat-tier').innerText = `Tier ${this.hole.tier}`;

        document.getElementById('screen-gameover').classList.remove('hidden');
    }

    victory() {
        this.state = 'VICTORY';
        this.hud.classList.add('hidden');
        this.abilityControls.classList.add('hidden');

        document.getElementById('vic-score').innerText = this.score.toLocaleString();
        document.getElementById('vic-gate').innerText = `${Math.ceil(this.gateHealth)}%`;
        document.getElementById('vic-kills').innerText = this.totalZombiesKilled;
        document.getElementById('vic-survivors').innerText = this.totalCiviliansSaved;

        document.getElementById('screen-victory').classList.remove('hidden');
    }

    render(time) {
        requestAnimationFrame((t) => this.render(t));

        const dt = Math.min(this.clock.getDelta(), 0.1);

        if (this.state === 'PLAYING') {
            // Update Combo timer
            if (this.comboTimer > 0) {
                this.comboTimer -= dt;
                if (this.comboTimer <= 0) {
                    this.currentCombo = 1;
                    this.updateHUD();
                }
            }

            // Update Ability Cooldown UI
            if (this.abilityTimer > 0) {
                this.abilityTimer -= dt;
                const cdPct = (this.abilityTimer / this.abilityCooldown) * 100;
                this.abilityCdOverlay.style.height = `${cdPct}%`;
            } else {
                this.abilityCdOverlay.style.height = '0%';
            }

            // Update Controls & Hole Movement
            const moveVec = this.input.getMovementVector();
            this.hole.move(moveVec.x, moveVec.z, dt);
            this.hole.update(dt);

            // Update Entities and check collisions
            this.em.update(
                dt,
                this.hole,
                (e) => this.onSwallow(e),
                (dmg, e) => this.onGateDamage(dmg, e),
                (e) => this.onCivilianSaved(e)
            );

            // Update Particles
            this.pm.update(dt);

            // Update Wave Progression
            const waveFinished = this.wm.update(dt);
            if (waveFinished) {
                this.onWaveComplete();
            }

            // Smooth Camera Follow (focuses on midpoint between Hole and Sanctuary Gate)
            const targetCamX = this.hole.x * 0.35;
            this.camera.position.x += (targetCamX - this.camera.position.x) * dt * 3.0;
        }

        // Render Scene
        this.renderer.render(this.scene, this.camera);
    }
}
