// Starwing 64: Core Flight Simulation, Corridor & All-Range Modes, Wingmen, Comms, Weapons & Multi-Phase Bosses.
(function () {
    'use strict';
    const SW = window.SW = window.SW || {};
    const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
    const lerp = (a, b, t) => a + (b - a) * t;
    const TAU = Math.PI * 2;

    const SECTORS = [
        {
            id: 'corneria',
            name: 'CORNERIA',
            subtitle: 'Fourth Planet of the Lylat System',
            briefing: 'General Pepper: "Andron\'s armada has invaded Corneria City! Skim the ocean, clear the defense arches, and destroy the Attack Carrier GORGON!"',
            medalHits: 80,
            length: 115, // seconds before boss phase
            bossName: 'ATTACK CARRIER GORGON',
            bossHp: 420,
        },
        {
            id: 'meteo',
            name: 'METEO BELT',
            subtitle: 'Dense Asteroid Field — Sector X',
            briefing: 'Peppy: "Stay sharp, Fox! We\'re entering the Meteo asteroid belt. Watch out for Stealth Strikers and the Crusher Dreadnought METORA!"',
            medalHits: 100,
            length: 120,
            bossName: 'CRUSHER DREADNOUGHT METORA',
            bossHp: 540,
        },
        {
            id: 'venom',
            name: 'VENOM CORE',
            subtitle: 'Supreme Commander Andron\'s Sanctum',
            briefing: 'Fox: "All aircraft report! Break through Venom\'s defense trench, defeat Star Wolf, and end Andron\'s threat once and for all!"',
            medalHits: 120,
            length: 125,
            bossName: 'BIO-BRAIN EMPEROR ANDRON',
            bossHp: 680,
        },
    ];

    class Game {
        constructor(renderer, ui) {
            this.r = renderer;
            this.ui = ui;
            this.audio = SW.Audio;

            this.state = 'title'; // 'title' | 'map' | 'playing' | 'paused' | 'victory' | 'gameover'
            this.sectorIndex = 0;
            this.completedSectors = new Set();
            this.medals = new Set();
            this.totalHits = 0;

            // Player Arwing state
            this.player = {
                x: 0, y: 0, z: 0,
                vx: 0, vy: 0,
                aimX: 0, aimY: 0,
                bank: 0, pitch: 0,
                hp: 100, maxHp: 100,
                shieldExpanded: false,
                boost: 100, maxBoost: 100,
                boosting: false, braking: false,
                laserLevel: 1, // 1 = single green, 2 = twin green, 3 = hyper blue
                bombs: 3,
                goldRings: 0,
                wingL: 2, wingR: 2, // 2 = intact, 1 = damaged, 0 = broken off
                rollT: 0, rollDir: 1,
                loopT: 0,
                invulnT: 0,
                chargeT: 0,
                lockedTarget: null,
                fireCooldown: 0,
                mesh: null,
            };

            this.wingmen = {
                falco:  { name: 'FALCO',  hp: 100, status: 'ok', trim: 0x1e56e0 },
                peppy:  { name: 'PEPPY',  hp: 100, status: 'ok', trim: 0xd93829 },
                slippy: { name: 'SLIPPY', hp: 100, status: 'ok', trim: 0x26b856 },
            };

            this.entities = [];
            this.projectiles = [];
            this.pickups = [];
            this.floatTexts = [];
            this.boss = null;
            this.activeBomb = null;

            this.scrollZ = 0;
            this.stageTime = 0;
            this.waveStep = 0;
            this.allRange = false;
            this.allRangeAngle = 0;
            this.bossScanned = false;
            this.warpChain = 0;

            this.initTitleScene();
        }

        getSectors() { return SECTORS; }

        clearEntities() {
            for (const e of this.entities) if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
            for (const p of this.projectiles) if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
            for (const pk of this.pickups) if (pk.mesh && pk.mesh.parent) pk.mesh.parent.remove(pk.mesh);
            if (this.activeBomb && this.activeBomb.mesh && this.activeBomb.mesh.parent) {
                this.activeBomb.mesh.parent.remove(this.activeBomb.mesh);
            }
            if (this.boss && this.boss.mesh && this.boss.mesh.parent) {
                this.boss.mesh.parent.remove(this.boss.mesh);
            }
            if (this.wingmanActor && this.wingmanActor.mesh && this.wingmanActor.mesh.parent) {
                this.wingmanActor.mesh.parent.remove(this.wingmanActor.mesh);
            }
            this.entities.length = 0;
            this.projectiles.length = 0;
            this.pickups.length = 0;
            this.floatTexts.length = 0;
            this.boss = null;
            this.activeBomb = null;
            this.wingmanActor = null;
        }

        initTitleScene() {
            this.clearEntities();
            this.r.setupSectorEnv('meteo');
            if (!this.player.mesh) {
                this.player.mesh = SW.Models.arwing(0x2668e8);
                this.r.worldGroup.add(this.player.mesh);
            }
            this.player.mesh.visible = true;
            this.player.mesh.position.set(0, 0, 0);
            this.player.userData = this.player.mesh.userData;
            this.player.mesh.userData.wingL.visible = true;
            this.player.mesh.userData.wingR.visible = true;
            this.player.mesh.userData.barrelShield.visible = false;
        }

        startSector(index) {
            this.sectorIndex = clamp(index | 0, 0, SECTORS.length - 1);
            const sec = SECTORS[this.sectorIndex];
            this.clearEntities();
            this.r.setupSectorEnv(sec.id);
            if (SW.instance && SW.instance.input && SW.instance.input.reset) {
                SW.instance.input.reset();
            }

            const P = this.player;
            P.x = 0; P.y = 0; P.z = 0;
            P.vx = 0; P.vy = 0;
            P.aimX = 0; P.aimY = 0;
            P.bank = 0; P.pitch = 0;
            P.maxHp = P.shieldExpanded ? 150 : 100;
            P.hp = P.maxHp;
            P.boost = 100;
            P.boosting = false; P.braking = false;
            P.wingL = 2; P.wingR = 2;
            P.rollT = 0; P.loopT = 0; P.invulnT = 1.5;
            P.chargeT = 0; P.lockedTarget = null;
            if (P.bombs < 3) P.bombs = 3;

            if (!P.mesh) {
                P.mesh = SW.Models.arwing(0x1e5ce6);
                this.r.worldGroup.add(P.mesh);
            }
            P.mesh.visible = true;
            P.mesh.userData.wingL.visible = true;
            P.mesh.userData.wingR.visible = true;
            P.mesh.userData.barrelShield.visible = false;

            for (const k of Object.keys(this.wingmen)) {
                this.wingmen[k].hp = 100;
                this.wingmen[k].status = 'ok';
            }

            this.scrollZ = 0;
            this.stageTime = 0;
            this.waveStep = 0;
            this.sectorHits = 0;
            this.allRange = false;
            this.allRangeAngle = 0;
            this.bossScanned = true;
            this.warpChain = 0;
            this.state = 'playing';

            this.audio.startMusic(sec.id);
            this.ui.updateHud(this);

            // Opening radio chatter
            if (sec.id === 'corneria') {
                this.comms('fox', 'FOX McCLOUD', 'All aircraft report! Engage G-Diffuser system!');
                setTimeout(() => { if (this.state === 'playing') this.comms('peppy', 'PEPPY HARE', 'Do a barrel roll (Q/E or ROLL) to deflect enemy lasers!'); }, 4800);
            } else if (sec.id === 'meteo') {
                this.comms('peppy', 'PEPPY HARE', 'Entering Meteo Asteroid Belt! Hold FIRE to lock onto targets!');
            } else {
                this.comms('pepper', 'GEN. PEPPER', 'This is it, Fox! Break through Venom\'s trench and stop Andron!');
            }
        }

        comms(id, name, text) {
            this.audio.speakComms(id, text);
            if (this.ui && this.ui.showComms) {
                this.ui.showComms(id, name, text);
            }
        }

        addHits(n, x, y, z) {
            const count = Math.max(1, n | 0);
            this.sectorHits += count;
            this.totalHits += count;
            if (x != null) {
                const label = count > 1 ? 'HIT +' + count : 'HIT +1';
                const col = count >= 3 ? '#ffe44d' : '#65ff9a';
                this.floatTexts.push({ x, y: y + 1.2, z, text: label, color: col, t: 0, life: 1.1 });
            }
            this.ui.updateHud(this);
        }

        // ------------------------------------------------------------------ Actions: Fire, Charge, Barrel Roll, Bomb, Loop
        fireLaser() {
            if (this.state !== 'playing') return;
            const P = this.player;
            if (P.fireCooldown > 0) return;
            P.fireCooldown = 0.13;

            // Broken wings downgrade effective laser level
            const intactWings = (P.wingL > 0 ? 1 : 0) + (P.wingR > 0 ? 1 : 0);
            const effLevel = intactWings === 0 ? 1 : Math.min(P.laserLevel, intactWings === 1 ? 2 : 3);

            const dir = new THREE.Vector3(P.aimX * 0.36, P.aimY * 0.36, -1).normalize();
            const speed = 142;
            const col = effLevel === 3 ? 0x3ef2ff : 0x48ff7a;
            const dmg = effLevel === 3 ? 16 : effLevel === 2 ? 11 : 10;

            const spawnBolt = (ox, oy) => {
                const m = new THREE.Group();
                const sheathGeo = new THREE.CylinderGeometry(0.14, 0.14, 3.2, 6);
                sheathGeo.rotateX(Math.PI / 2);
                const sheathMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
                const coreGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.4, 5);
                coreGeo.rotateX(Math.PI / 2);
                const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
                m.add(new THREE.Mesh(sheathGeo, sheathMat), new THREE.Mesh(coreGeo, coreMat));
                m.position.set(P.x + ox, P.y + oy, P.z - 1.5);
                m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
                this.r.fxGroup.add(m);
                this.r.emitSpark(P.x + ox, P.y + oy, P.z - 1.5, 0, 0, -12, 0.12, 0.45, 0.05, col, 0);
                this.projectiles.push({
                    team: 0,
                    kind: 'laser',
                    mesh: m,
                    x: m.position.x, y: m.position.y, z: m.position.z,
                    vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed,
                    dmg,
                    radius: 0.95,
                    life: 1.35,
                    t: 0,
                    color: col,
                });
            };

            if (effLevel === 1) {
                spawnBolt(0, -0.1);
                this.audio.play('laser');
            } else if (effLevel === 2) {
                spawnBolt(-0.95, -0.1);
                spawnBolt(0.95, -0.1);
                this.audio.play('twinLaser');
            } else {
                spawnBolt(-1.05, -0.08);
                spawnBolt(1.05, -0.08);
                spawnBolt(0, 0.12);
                this.audio.play('hyperLaser');
            }
        }

        releaseChargeShot() {
            const P = this.player;
            if (P.chargeT < 0.65) { P.chargeT = 0; P.lockedTarget = null; return false; }
            const target = (P.lockedTarget && !P.lockedTarget.dead) ? P.lockedTarget : null;
            P.chargeT = 0;
            P.lockedTarget = null;

            const dir = new THREE.Vector3(P.aimX * 0.42, P.aimY * 0.42, -1).normalize();
            const speed = 105;
            const grp = new THREE.Group();
            const outer = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3b56, transparent: true, opacity: 0.85, toneMapped: false }));
            const inner = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
            grp.add(outer, inner);
            grp.position.set(P.x, P.y, P.z - 1.8);
            this.r.fxGroup.add(grp);

            this.projectiles.push({
                team: 0,
                kind: 'charge',
                mesh: grp,
                x: grp.position.x, y: grp.position.y, z: grp.position.z,
                vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed,
                target,
                dmg: 68,
                splash: 9.5,
                radius: 1.8,
                life: 2.2,
                t: 0,
                color: 0xff4560,
            });
            this.audio.play('chargeShot');
            return true;
        }

        triggerBarrelRoll(dir) {
            if (this.state !== 'playing') return;
            const P = this.player;
            if (P.rollT > 0.15) return;
            P.rollT = 0.52;
            P.rollDir = dir || (P.vx < -0.1 ? -1 : 1);
            this.audio.play('barrelRoll');
        }

        triggerSomersault() {
            if (this.state !== 'playing') return;
            const P = this.player;
            if (P.loopT > 0 || P.boost < 35) return;
            P.boost = Math.max(0, P.boost - 35);
            P.loopT = 0.95;
            P.invulnT = Math.max(P.invulnT, 0.95);
            this.audio.play('somersault');
        }

        triggerBomb() {
            if (this.state !== 'playing') return;
            // If a bomb is already in flight, detonate it immediately!
            if (this.activeBomb && !this.activeBomb.detonated) {
                this.detonateBomb(this.activeBomb);
                return;
            }
            const P = this.player;
            if (P.bombs <= 0) return;
            P.bombs--;
            const dir = new THREE.Vector3(P.aimX * 0.35, P.aimY * 0.35, -1).normalize();
            const m = SW.Models.pickup('bomb');
            m.scale.setScalar(0.8);
            m.position.set(P.x, P.y, P.z - 1.6);
            this.r.fxGroup.add(m);
            this.activeBomb = {
                mesh: m,
                x: m.position.x, y: m.position.y, z: m.position.z,
                vx: dir.x * 72, vy: dir.y * 72, vz: dir.z * 72,
                t: 0,
                detonated: false,
                blastT: 0,
            };
            this.audio.play('bombLaunch');
            this.ui.updateHud(this);
        }

        detonateBomb(b) {
            if (!b || b.detonated) return;
            b.detonated = true;
            b.blastT = 0;
            this.audio.play('bigBoom');
            this.r.explosion(b.x, b.y, b.z, 2.8, 0x52e8ff, true);
            this.r.addRipple(b.x, b.y, b.z, 22, 0.036, 0.72);

            // Replace bomb mesh with expanding plasma nova sphere
            if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh);
            const sph = new THREE.Mesh(
                new THREE.SphereGeometry(1, 20, 14),
                new THREE.MeshBasicMaterial({ color: 0x62f2ff, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
            );
            sph.position.set(b.x, b.y, b.z);
            this.r.fxGroup.add(sph);
            b.mesh = sph;

            // Damage all enemies in blast radius
            let kills = 0;
            for (const e of this.entities) {
                if (e.dead || e.indestructible) continue;
                const d = Math.hypot(e.x - b.x, e.y - b.y, e.z - b.z);
                if (d < 28) {
                    e.hp -= 120;
                    if (e.hp <= 0) {
                        this.killEntity(e, false);
                        kills++;
                    }
                }
            }
            if (this.boss && !this.boss.dead) {
                const d = Math.hypot(this.boss.x - b.x, this.boss.y - b.y, this.boss.z - b.z);
                if (d < 34) this.damageBoss(85, b.x, b.y, b.z);
            }
            if (kills > 0) {
                this.addHits(kills + (kills >= 3 ? 2 : 0), b.x, b.y, b.z);
            }
        }

        // ------------------------------------------------------------------ Spawning Waves, Wingman Events & Bosses
        spawnSquadron(kind, count, pattern, zDist) {
            const group = { remaining: count, kind };
            for (let i = 0; i < count; i++) {
                const mesh = kind === 'stealth' ? SW.Models.stealthFighter() : SW.Models.enemyFighter(count >= 4 ? 'gold' : 'normal');
                const x0 = pattern === 'v' ? (i - (count - 1) / 2) * 3.6 : Math.cos((i / count) * TAU) * 6.5;
                const y0 = pattern === 'v' ? Math.abs(i - (count - 1) / 2) * 1.4 + 1.5 : Math.sin((i / count) * TAU) * 4.5 + 1.0;
                const z0 = (zDist || -115) - i * 6.5;
                mesh.position.set(x0, y0, z0);
                this.r.worldGroup.add(mesh);
                this.entities.push({
                    kind: kind || 'fighter',
                    mesh,
                    x: x0, y: y0, z: z0,
                    baseX: x0, baseY: y0,
                    vx: 0, vy: 0, vz: 26,
                    hp: kind === 'stealth' ? 28 : 18,
                    maxHp: kind === 'stealth' ? 28 : 18,
                    radius: 2.1,
                    fireT: 1.1 + i * 0.35,
                    phase: i * 0.9,
                    pattern,
                    squad: group,
                    dead: false,
                });
            }
        }

        spawnWalkerOrTurret(kind, x, zDist) {
            const mesh = kind === 'walker' ? SW.Models.mechWalker() : SW.Models.turret();
            const y = -5.9;
            const z = zDist || -120;
            mesh.position.set(x, y, z);
            this.r.worldGroup.add(mesh);
            this.entities.push({
                kind,
                mesh,
                x, y: y + (kind === 'walker' ? 2.0 : 1.0), z,
                vx: 0, vy: 0, vz: 32,
                hp: kind === 'walker' ? 45 : 30,
                maxHp: kind === 'walker' ? 45 : 30,
                radius: kind === 'walker' ? 2.6 : 2.1,
                fireT: 1.3 + Math.random(),
                phase: Math.random() * 6,
                dead: false,
            });
        }

        spawnArchOrAsteroid(kind, x, y, zDist) {
            const sec = SECTORS[this.sectorIndex];
            if (kind === 'arch') {
                const mesh = SW.Models.archway(sec.id);
                mesh.position.set(x, -6.0, zDist || -125);
                this.r.worldGroup.add(mesh);
                this.entities.push({
                    kind: 'arch',
                    mesh,
                    x, y: -2.0, z: zDist || -125,
                    vx: 0, vy: 0, vz: 34,
                    hp: 9999,
                    indestructible: true,
                    dead: false,
                });
            } else {
                const rad = 2.0 + Math.random() * 2.2;
                const mesh = SW.Models.asteroid(rad, (Math.random() * 1000) | 0);
                mesh.position.set(x, y, zDist || -130);
                this.r.worldGroup.add(mesh);
                this.entities.push({
                    kind: 'asteroid',
                    mesh,
                    x, y, z: zDist || -130,
                    vx: (Math.random() - 0.5) * 2.5,
                    vy: (Math.random() - 0.5) * 2.5,
                    vz: 34,
                    rx: Math.random(), ry: Math.random(),
                    hp: 32,
                    maxHp: 32,
                    radius: rad * 1.05,
                    dead: false,
                });
            }
        }

        spawnPickup(kind, x, y, z) {
            const isRing = kind === 'silver' || kind === 'gold' || kind === 'warp';
            const mesh = isRing ? SW.Models.ring(kind) : SW.Models.pickup(kind);
            mesh.position.set(x, y, z);
            this.r.worldGroup.add(mesh);
            this.pickups.push({
                kind,
                mesh,
                x, y, z,
                vz: 30,
                radius: isRing ? 2.9 : 2.2,
                dead: false,
            });
        }

        spawnWingmanEncounter(who) {
            const w = this.wingmen[who] || this.wingmen.slippy;
            w.status = 'danger';
            const mesh = SW.Models.arwing(w.trim);
            mesh.position.set(-12, 2.5, -55);
            this.r.worldGroup.add(mesh);
            this.wingmanActor = {
                who,
                mesh,
                x: -12, y: 2.5, z: -55,
                t: 0,
                chaserCount: 2,
            };

            if (who === 'slippy') {
                this.comms('slippy', 'SLIPPY TOAD', 'Fox! Get this guy off me!!');
            } else if (who === 'falco') {
                this.comms('falco', 'FALCO LOMBARDI', 'I\'ve got two bogeys on my tail! Little help here?');
            } else {
                this.comms('peppy', 'PEPPY HARE', 'Taking fire! Clear my six, Fox!');
            }

            // Spawn 2 chasers right behind the wingman
            for (let i = 0; i < 2; i++) {
                const em = SW.Models.enemyFighter('ace');
                const ex = -12 - i * 3.2, ey = 2.5 + (i - 0.5) * 1.5, ez = -46 + i * 3.5;
                em.position.set(ex, ey, ez);
                this.r.worldGroup.add(em);
                this.entities.push({
                    kind: 'chaser',
                    chasingWingman: true,
                    mesh: em,
                    x: ex, y: ey, z: ez,
                    offsetX: (i - 0.5) * 3.0,
                    offsetY: (i - 0.5) * 1.4,
                    vx: 0, vy: 0, vz: 0,
                    hp: 26, maxHp: 26,
                    radius: 2.2,
                    fireT: 0.9,
                    phase: i * 1.5,
                    dead: false,
                });
            }
            this.ui.updateHud(this);
        }

        spawnStarWolfDuel() {
            this.comms('wolf', 'WOLF O\'DONNELL', 'Can\'t let you do that, Star Fox! Playtime is over!');
            const mesh = SW.Models.wolfFighter();
            mesh.position.set(0, 4, -75);
            this.r.worldGroup.add(mesh);
            this.entities.push({
                kind: 'wolf',
                mesh,
                x: 0, y: 4, z: -75,
                vx: 0, vy: 0, vz: 0,
                hp: 145, maxHp: 145,
                radius: 2.8,
                fireT: 0.85,
                rollT: 0,
                phase: 0,
                dead: false,
            });
        }

        spawnBoss() {
            const sec = SECTORS[this.sectorIndex];
            this.allRange = true;
            this.audio.play('bossAlert');
            this.audio.startMusic('boss');

            let mesh;
            if (sec.id === 'corneria') {
                mesh = SW.Models.bossGorgon();
                this.comms('slippy', 'SLIPPY TOAD', 'Boss shield gauge analyzed! Aim for the central cyan plasma core!');
            } else if (sec.id === 'meteo') {
                mesh = SW.Models.bossMetora();
                this.comms('peppy', 'PEPPY HARE', 'Watch out for its spinning crusher blades! Hit the thermal core!');
            } else {
                mesh = SW.Models.bossAndron();
                this.comms('andron', 'EMPEROR ANDRON', 'Foolish McCloud! You will never leave Venom alive!');
            }
            mesh.position.set(0, 2.5, -52);
            this.r.worldGroup.add(mesh);

            this.boss = {
                id: sec.id,
                name: sec.bossName,
                mesh,
                x: 0, y: 2.5, z: -52,
                hp: sec.bossHp,
                maxHp: sec.bossHp,
                t: 0,
                fireT: 1.4,
                flashT: 0,
                dead: false,
            };
            this.ui.updateHud(this);
        }

        damageBoss(dmg, hx, hy, hz) {
            const B = this.boss;
            if (!B || B.dead) return;
            B.hp = Math.max(0, B.hp - dmg);
            B.flashT = 0.12;
            this.audio.play('hit');
            this.r.emitSpark(hx || B.x, hy || B.y, (hz || B.z) + 3, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 8, 0.25, 0.65, 0.08, 0x52f2ff, 0);

            if (B.hp <= 0) {
                B.dead = true;
                this.audio.play('bigBoom');
                this.r.explosion(B.x, B.y, B.z, 4.2, 0xff8a28, true);
                this.r.addRipple(B.x, B.y, B.z, 30, 0.045, 0.9);
                if (B.mesh && B.mesh.parent) B.mesh.parent.remove(B.mesh);
                this.addHits(15, B.x, B.y, B.z);
                this.completeSector();
            }
            this.ui.updateHud(this);
        }

        completeSector() {
            const sec = SECTORS[this.sectorIndex];
            this.completedSectors.add(sec.id);
            const earnedMedal = this.sectorHits >= sec.medalHits;
            if (earnedMedal) this.medals.add(sec.id);

            this.comms(
                'fox',
                'FOX McCLOUD',
                earnedMedal
                    ? 'MISSION ACCOMPLISHED! Medal earned! All units return to Great Fox!'
                    : 'Mission Complete! Returning to Great Fox for debriefing.'
            );

            setTimeout(() => {
                if (this.state !== 'playing') return;
                this.state = 'victory';
                this.ui.showSectorComplete(this, sec, earnedMedal);
            }, 3400);
        }

        killEntity(e, byLaser) {
            if (e.dead) return;
            e.dead = true;
            if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
            this.audio.play(e.kind === 'wolf' || e.kind === 'walker' ? 'bigBoom' : 'explosion');
            this.r.explosion(e.x, e.y, e.z, e.kind === 'wolf' ? 2.2 : 1.15, e.kind === 'stealth' ? 0xc864ff : 0xff8a28, e.kind === 'wolf' || e.kind === 'walker');
            this.addHits(e.kind === 'wolf' ? 10 : e.kind === 'walker' ? 3 : 1, e.x, e.y, e.z);

            if (e.squad) {
                e.squad.remaining--;
                if (e.squad.remaining === 0) {
                    // Wiping out an entire squadron drops a Gold Ring or Laser Upgrade!
                    const drop = this.player.laserLevel < 3 && Math.random() < 0.45 ? 'laser' : 'gold';
                    this.spawnPickup(drop, e.x, clamp(e.y, -2.5, 4.5), Math.max(-75, e.z));
                }
            } else if (e.chasingWingman && this.wingmanActor) {
                this.wingmanActor.chaserCount--;
                if (this.wingmanActor.chaserCount <= 0) {
                    const who = this.wingmanActor.who;
                    this.wingmen[who].status = 'ok';
                    this.wingmen[who].hp = Math.min(100, this.wingmen[who].hp + 25);
                    const drop = who === 'falco' ? 'laser' : who === 'peppy' ? 'gold' : 'silver';
                    this.spawnPickup(drop, this.wingmanActor.x, this.wingmanActor.y, this.wingmanActor.z);
                    this.comms(
                        who,
                        this.wingmen[who].name,
                        who === 'falco' ? 'Heh, I guess I owe you one, Fox! Catch this Laser Upgrade!' : 'Thanks, Fox! I thought they had me!'
                    );
                    this.ui.updateHud(this);
                }
            } else if (e.kind === 'wolf') {
                this.comms('wolf', 'WOLF O\'DONNELL', 'What?! Impossible! My ship is going down!!');
                this.spawnPickup('gold', e.x, clamp(e.y, -2, 4), Math.max(-65, e.z));
            } else if (Math.random() < 0.25) {
                this.spawnPickup(Math.random() < 0.25 ? 'bomb' : 'silver', e.x, clamp(e.y, -2.5, 4.5), e.z);
            }
        }

        damagePlayer(dmg, isObstacle, side) {
            const P = this.player;
            if (P.invulnT > 0 || this.state !== 'playing') return;

            // Barrel roll reflects laser projectiles!
            if (!isObstacle && P.rollT > 0) {
                this.audio.play('deflect');
                this.r.emitSpark(P.x, P.y, P.z - 1.2, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, -25, 0.3, 0.7, 0.1, 0x62f2ff, 0);
                return;
            }

            P.hp = Math.max(0, P.hp - dmg);
            P.invulnT = 0.55;
            this.r.addRipple(P.x, P.y, P.z, 6, 0.018, 0.35);

            if (isObstacle) {
                const hitLeft = side != null ? side < 0 : P.x < 0;
                const key = hitLeft ? 'wingL' : 'wingR';
                if (P[key] > 0) {
                    P[key]--;
                    if (P[key] === 0) {
                        this.audio.play('wingBreak');
                        P.mesh.userData[key].visible = false;
                        this.r.debrisBurst(P.x + (hitLeft ? -1.4 : 1.4), P.y, P.z, 14, 14, 0xe8edf5, 0x2668e8);
                        if (P.laserLevel > 1) P.laserLevel--;
                        this.comms('peppy', 'PEPPY HARE', 'Your wing is broken! Fly through a Silver Ring to repair it!');
                    } else {
                        this.audio.play('wingClip');
                    }
                } else {
                    this.audio.play('wingClip');
                }
            } else {
                this.audio.play('hit');
            }

            this.ui.updateHud(this);

            if (P.hp <= 0) {
                this.audio.play('bigBoom');
                this.r.explosion(P.x, P.y, P.z, 2.5, 0xff5a28, true);
                P.mesh.visible = false;
                this.state = 'gameover';
                this.comms('pepper', 'GEN. PEPPER', 'Fox!! Respond, Fox! We\'ve lost contact with the Arwing!');
                this.ui.showGameOver(this);
            }
        }

        // ------------------------------------------------------------------ Per-Frame Update
        update(dt, input) {
            if (this.state === 'title' || this.state === 'map') {
                // Heroic high-speed flyby animation on title screen
                if (this.player.mesh) {
                    const t = this.r.time;
                    const ax = Math.sin(t * 0.85) * 3.8;
                    const ay = 0.6 + Math.cos(t * 1.15) * 1.1;
                    this.player.mesh.position.set(ax, ay, 0);
                    this.player.mesh.rotation.set(
                        -Math.sin(t * 1.15) * 0.14,
                        -Math.cos(t * 0.85) * 0.16,
                        -Math.cos(t * 0.85) * 0.44
                    );
                    this.r.camera.position.set(Math.sin(t * 0.42) * 3.2, 2.3, 8.8);
                    this.r.camera.lookAt(ax * 0.45, ay * 0.5, -18);

                    // Emit wingtip contrails during attract mode
                    for (const s of [-1, 1]) {
                        this.r.emitSpark(
                            ax + s * 2.85, ay - 0.1, 1.0,
                            0, 0, 36,
                            0.28, 0.24, 0.04, 0xd8f4ff, 0
                        );
                    }
                }
                this.r.updateVfx(dt, new THREE.Vector3(0, 0, -this.r.time * 42));
                this.r.renderFrame(dt);
                return;
            }

            if (this.state !== 'playing') {
                this.r.updateVfx(dt);
                this.r.renderFrame(dt);
                return;
            }

            const P = this.player;
            const sec = SECTORS[this.sectorIndex];
            this.stageTime += dt;

            // 1. Boost & Brake energy
            P.boosting = !!(input.boost && P.boost > 8 && !input.brake);
            P.braking = !!(input.brake && !P.boosting && P.boost > 5);
            if (P.boosting) {
                P.boost = Math.max(0, P.boost - dt * 36);
            } else if (P.braking) {
                P.boost = Math.max(0, P.boost - dt * 22);
            } else {
                P.boost = Math.min(P.maxBoost, P.boost + dt * 24);
            }
            const speedMul = P.boosting ? 1.65 : P.braking ? 0.52 : 1.0;
            this.r.boostK = lerp(this.r.boostK, P.boosting ? 1 : 0, dt * 8);
            this.scrollZ += dt * 34 * speedMul;

            // 2. Steer Arwing within corridor bounds — flies straight & level by default!
            const maxX = 11.5, minY = -4.3, maxY = 6.2;
            const moveSpd = 19.5;
            const brokenTilt = (P.wingL === 0 ? -0.18 : 0) + (P.wingR === 0 ? 0.18 : 0);

            let steerX = 0, steerY = 0;
            let aimTargetX = 0, aimTargetY = 0;

            if (input.mode === 'mouse') {
                // Cursor position tracking: ship flies smoothly TO the mouse position,
                // then levels out straight once it reaches the cursor!
                const targetX = clamp(input.moveX * maxX, -maxX, maxX);
                const targetY = clamp(lerp(minY, maxY, (input.moveY + 1) * 0.5), minY, maxY);
                const dx = targetX - P.x;
                const dy = targetY - P.y;
                steerX = clamp(dx / 2.8 + brokenTilt * Math.sin(this.stageTime * 5), -1, 1);
                steerY = clamp(dy / 2.2, -1, 1);
                if (Math.abs(dx) < 0.08 && brokenTilt === 0) steerX = 0;
                if (Math.abs(dy) < 0.08) steerY = 0;
                aimTargetX = clamp(input.moveX * 0.65 + steerX * 0.35, -1, 1);
                aimTargetY = clamp(input.moveY * 0.65 + steerY * 0.35, -1, 1);
            } else {
                // Keyboard (WASD/Arrows), Touch Stick, or Idle:
                // Flies straight ahead whenever no directional input is held!
                steerX = clamp(input.moveX + brokenTilt * Math.sin(this.stageTime * 5), -1, 1);
                steerY = clamp(input.moveY, -1, 1);
                aimTargetX = clamp(P.x / maxX * 0.45 + steerX * 0.65, -1, 1);
                aimTargetY = clamp((P.y / maxY) * 0.45 + steerY * 0.65, -1, 1);
            }

            P.vx = lerp(P.vx, steerX * moveSpd, dt * 12);
            P.vy = lerp(P.vy, steerY * moveSpd, dt * 12);
            if (Math.abs(steerX) < 0.01 && Math.abs(P.vx) < 0.15) P.vx = 0;
            if (Math.abs(steerY) < 0.01 && Math.abs(P.vy) < 0.15) P.vy = 0;

            P.x = clamp(P.x + P.vx * dt, -maxX, maxX);
            P.y = clamp(P.y + P.vy * dt, minY, maxY);

            P.aimX = lerp(P.aimX, aimTargetX, dt * 14);
            P.aimY = lerp(P.aimY, aimTargetY, dt * 14);

            // Somersault loop animation
            let loopOffsetY = 0, loopOffsetZ = 0, loopPitch = 0;
            if (P.loopT > 0) {
                P.loopT = Math.max(0, P.loopT - dt);
                const prog = 1 - P.loopT / 0.95;
                const ang = prog * TAU;
                loopOffsetY = Math.sin(ang) * 4.2;
                loopOffsetZ = (1 - Math.cos(ang)) * 3.5;
                loopPitch = ang;
            }

            // Barrel roll spin
            if (P.rollT > 0) {
                P.rollT = Math.max(0, P.rollT - dt);
            }
            if (P.invulnT > 0) P.invulnT = Math.max(0, P.invulnT - dt);
            if (P.fireCooldown > 0) P.fireCooldown = Math.max(0, P.fireCooldown - dt);

            const bankFactor = clamp(P.vx / moveSpd, -1, 1);
            const pitchFactor = clamp(P.vy / moveSpd, -1, 1);
            const targetBank = -bankFactor * 0.72 + (P.rollT > 0 ? (P.rollT / 0.52) * TAU * P.rollDir : 0);
            P.bank = lerp(P.bank, targetBank, P.rollT > 0 ? 0.45 : dt * 12);
            P.pitch = lerp(P.pitch, pitchFactor * 0.36, dt * 11);

            P.mesh.position.set(P.x, P.y + loopOffsetY, P.z + loopOffsetZ);
            P.mesh.rotation.set(P.pitch + loopPitch, -bankFactor * 0.20, P.bank);

            // Thruster scale & barrel shield visibility
            const thrScale = P.boosting ? 1.95 : P.braking ? 0.45 : 1.0 + Math.sin(this.stageTime * 28) * 0.12;
            P.mesh.userData.thruster.scale.set(thrScale * 0.9, thrScale * 0.9, thrScale * 1.3);
            P.mesh.userData.barrelShield.visible = P.rollT > 0;
            if (P.rollT > 0) P.mesh.userData.barrelShield.rotation.z += dt * 18 * P.rollDir;

            // Continuous 3D Wingtip Contrail Ribbons & G-Diffuser Plasma Exhaust
            if (P.loopT <= 0) {
                const cosB = Math.cos(P.bank), sinB = Math.sin(P.bank);
                for (const s of [-1, 1]) {
                    if ((s < 0 && P.wingL > 0) || (s > 0 && P.wingR > 0)) {
                        const wx = P.x + s * 2.9 * cosB;
                        const wy = P.y + s * 2.9 * sinB - 0.06;
                        this.r.emitSpark(
                            wx, wy, P.z + 1.0,
                            P.vx * 0.1, P.vy * 0.1, 42 * speedMul,
                            0.24, P.boosting ? 0.32 : 0.20, 0.03,
                            P.boosting ? 0x52f6ff : 0xd8f2ff, 0
                        );
                    }
                }
                if (P.boosting || Math.random() < 0.65) {
                    this.r.emitSpark(
                        P.x + (Math.random() - 0.5) * 0.25,
                        P.y + (Math.random() - 0.5) * 0.25,
                        P.z + 1.8,
                        (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 46 * speedMul,
                        0.18, P.boosting ? 0.42 : 0.25, 0.04,
                        P.boosting ? 0x3ef2ff : 0xff8a28, 0
                    );
                }
            }

            // Water wake spray on Corneria when skimming low over the ocean!
            if (sec.id === 'corneria' && P.y < -3.0 && P.loopT <= 0) {
                for (const s of [-1, 1]) {
                    this.r.emitSpark(
                        P.x + s * 1.3, -5.75, P.z + 0.5,
                        s * (4 + Math.random() * 5), 3.0 + Math.random() * 3.5, 18,
                        0.34, 0.58, 0.1, 0xd8f6ff, 8
                    );
                }
            }

            // 3. Camera follow + FOV kick on Boost / Brake
            const targetFov = P.boosting ? 68 : P.braking ? 50 : 58;
            this.r.camera.fov = lerp(this.r.camera.fov, targetFov, dt * 7);
            this.r.camera.updateProjectionMatrix();
            this.r.camera.position.x = lerp(this.r.camera.position.x, P.x * 0.52, dt * 6);
            this.r.camera.position.y = lerp(this.r.camera.position.y, P.y * 0.44 + 2.35, dt * 6);
            this.r.camera.position.z = lerp(this.r.camera.position.z, P.boosting ? 11.0 : P.braking ? 8.2 : 9.4, dt * 6);
            this.r.camera.lookAt(P.x * 0.68, P.y * 0.58 + 0.35, -24);

            // 4. Weapons: Fire + Automatic Homing Charge Lock-On
            if (input.fire) {
                this.fireLaser();
                P.chargeT += dt;
                if (P.chargeT >= 0.45) {
                    // Find closest enemy to reticle line of sight
                    const best = this.findLockCandidate();
                    if (best && P.lockedTarget !== best) {
                        P.lockedTarget = best;
                        this.audio.play('lockOn');
                    }
                }
            } else if (P.chargeT > 0) {
                this.releaseChargeShot();
            }

            // 5. Sector Wave Script & Boss Spawning
            this.updateWaveScript(dt);

            // 6. Update Wingman Encounter Actor
            if (this.wingmanActor) {
                const wa = this.wingmanActor;
                wa.t += dt;
                wa.x = Math.sin(wa.t * 1.3) * 8.5;
                wa.y = 1.5 + Math.cos(wa.t * 1.7) * 2.5;
                wa.z = -38 + Math.sin(wa.t * 0.7) * 6;
                wa.mesh.position.set(wa.x, wa.y, wa.z);
                wa.mesh.rotation.z = -Math.cos(wa.t * 1.3) * 0.45;
                if (wa.chaserCount > 0) {
                    this.wingmen[wa.who].hp = Math.max(12, this.wingmen[wa.who].hp - dt * 3.8);
                }
                if (wa.t > 14 || wa.chaserCount <= 0) {
                    if (wa.t > 14 && wa.chaserCount > 0) {
                        this.wingmen[wa.who].status = 'retreat';
                        this.comms(wa.who, this.wingmen[wa.who].name, 'My shield is critical! Pulling back to Great Fox for repairs!');
                    }
                    if (wa.mesh.parent) wa.mesh.parent.remove(wa.mesh);
                    this.wingmanActor = null;
                    this.ui.updateHud(this);
                }
            }

            // 7. Update Entities (Enemies & Obstacles)
            for (let i = this.entities.length - 1; i >= 0; i--) {
                const e = this.entities[i];
                if (e.dead) { this.entities.splice(i, 1); continue; }

                if (e.chasingWingman && this.wingmanActor) {
                    e.x = lerp(e.x, this.wingmanActor.x + e.offsetX, dt * 5);
                    e.y = lerp(e.y, this.wingmanActor.y + e.offsetY, dt * 5);
                    e.z = lerp(e.z, this.wingmanActor.z + 6.5, dt * 5);
                    e.mesh.position.set(e.x, e.y, e.z);
                } else if (e.kind === 'wolf') {
                    e.phase += dt;
                    e.x = Math.sin(e.phase * 1.45) * 9.5;
                    e.y = 1.8 + Math.cos(e.phase * 1.9) * 3.2;
                    e.z = -42 + Math.sin(e.phase * 0.8) * 10;
                    e.mesh.position.set(e.x, e.y, e.z);
                    e.mesh.rotation.z = -Math.cos(e.phase * 1.45) * 0.55;
                } else {
                    e.z += e.vz * speedMul * dt;
                    if (e.kind === 'fighter' || e.kind === 'stealth') {
                        e.phase += dt * 2.4;
                        e.x = e.baseX + Math.sin(e.phase) * 2.8;
                        e.y = e.baseY + Math.cos(e.phase * 0.8) * 1.4;
                        e.mesh.rotation.z = -Math.cos(e.phase) * 0.35;
                    } else if (e.kind === 'asteroid') {
                        e.x += e.vx * dt; e.y += e.vy * dt;
                        e.mesh.rotation.x += dt * 0.9;
                        e.mesh.rotation.y += dt * 1.2;
                    } else if (e.kind === 'walker' && e.mesh.userData.legL) {
                        e.phase += dt * 5;
                        e.mesh.userData.legL.rotation.x = Math.sin(e.phase) * 0.45;
                        e.mesh.userData.legR.rotation.x = -Math.sin(e.phase) * 0.45;
                    }
                    e.mesh.position.set(e.x, e.kind === 'arch' ? -6.0 : (e.kind === 'walker' || e.kind === 'turret' ? -5.9 : e.y), e.z);
                }

                // Enemy firing at player
                if (!e.indestructible && e.kind !== 'asteroid' && e.z < -8 && e.z > -95) {
                    e.fireT -= dt;
                    if (e.fireT <= 0) {
                        e.fireT = e.kind === 'wolf' ? 0.95 : 1.85 + Math.random();
                        this.spawnEnemyShot(e.x, e.y, e.z, P.x, P.y, P.z, e.kind === 'wolf' ? 0xff2e55 : 0xffaa28);
                    }
                }

                // Collision with player Arwing
                if (Math.abs(e.z - P.z) < 2.2) {
                    if (e.kind === 'arch') {
                        // Pillar collision check (pillars at x = e.x ± 6.5, lintel at y > 1.2)
                        const dx = P.x - e.x;
                        const hitLeftPillar = Math.abs(dx + 6.5) < 1.9 && P.y < 2.2;
                        const hitRightPillar = Math.abs(dx - 6.5) < 1.9 && P.y < 2.2;
                        const hitLintel = Math.abs(dx) < 7.5 && Math.abs(P.y - 1.8) < 1.3;
                        if (hitLeftPillar || hitRightPillar || hitLintel) {
                            this.damagePlayer(18, true, hitLeftPillar ? -1 : 1);
                        }
                    } else {
                        const dist = Math.hypot(e.x - P.x, e.y - P.y);
                        if (dist < e.radius + 1.3) {
                            this.damagePlayer(16, e.kind === 'asteroid', P.x < e.x ? 1 : -1);
                            if (!e.indestructible && e.kind !== 'wolf') this.killEntity(e, false);
                        }
                    }
                }

                if (e.z > 16) {
                    if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
                    this.entities.splice(i, 1);
                }
            }

            // 8. Update Boss
            if (this.boss && !this.boss.dead) {
                const B = this.boss;
                B.t += dt;
                B.x = Math.sin(B.t * 0.75) * 7.5;
                B.y = 2.0 + Math.cos(B.t * 1.1) * 2.2;
                B.z = -46 + Math.sin(B.t * 0.45) * 6;
                B.mesh.position.set(B.x, B.y, B.z);
                if (B.mesh.userData.ringOuter) B.mesh.userData.ringOuter.rotation.z += dt * 1.8;
                if (B.mesh.userData.handL && B.mesh.userData.handR) {
                    B.mesh.userData.handL.position.y = -1.2 + Math.sin(B.t * 2.4) * 1.8;
                    B.mesh.userData.handR.position.y = -1.2 - Math.sin(B.t * 2.4) * 1.8;
                }
                B.fireT -= dt;
                if (B.fireT <= 0) {
                    B.fireT = 1.15;
                    this.spawnEnemyShot(B.x - 3.5, B.y, B.z + 3, P.x, P.y, P.z, 0xff3b6b);
                    this.spawnEnemyShot(B.x + 3.5, B.y, B.z + 3, P.x, P.y, P.z, 0xff3b6b);
                }
            }

            // 9. Update Projectiles
            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const p = this.projectiles[i];
                p.t += dt;
                if (p.t >= p.life) {
                    if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
                    this.projectiles.splice(i, 1);
                    continue;
                }

                if (p.kind === 'charge' && p.target && !p.target.dead) {
                    const tx = p.target.x - p.x, ty = p.target.y - p.y, tz = p.target.z - p.z;
                    const len = Math.max(0.01, Math.hypot(tx, ty, tz));
                    const spd = 110;
                    p.vx = lerp(p.vx, (tx / len) * spd, dt * 9);
                    p.vy = lerp(p.vy, (ty / len) * spd, dt * 9);
                    p.vz = lerp(p.vz, (tz / len) * spd, dt * 9);
                }

                p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
                p.mesh.position.set(p.x, p.y, p.z);

                if (p.team === 0) {
                    let hit = false;
                    for (const e of this.entities) {
                        if (e.dead || e.indestructible) continue;
                        const d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
                        if (d < e.radius + p.radius) {
                            e.hp -= p.dmg;
                            this.r.emitSpark(p.x, p.y, p.z, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, 8, 0.22, 0.55, 0.05, p.color, 0);
                            if (p.kind === 'charge') {
                                this.r.explosion(p.x, p.y, p.z, 1.8, 0xff4560, true);
                                let splashKills = 0;
                                for (const o of this.entities) {
                                    if (!o.dead && !o.indestructible && Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z) < p.splash) {
                                        o.hp -= p.dmg;
                                        if (o.hp <= 0) { this.killEntity(o, true); splashKills++; }
                                    }
                                }
                                if (splashKills > 1) this.addHits(splashKills, p.x, p.y, p.z);
                            } else if (e.hp <= 0) {
                                this.killEntity(e, true);
                            } else {
                                this.audio.play('hit');
                            }
                            hit = true;
                            break;
                        }
                    }
                    if (!hit && this.boss && !this.boss.dead) {
                        const B = this.boss;
                        const d = Math.hypot(B.x - p.x, B.y - p.y, (B.z + 2) - p.z);
                        if (d < 5.2 + p.radius) {
                            this.damageBoss(p.dmg, p.x, p.y, p.z);
                            hit = true;
                        }
                    }
                    if (hit) {
                        if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
                        this.projectiles.splice(i, 1);
                    }
                } else {
                    // Enemy projectile vs Player
                    const d = Math.hypot(p.x - P.x, p.y - P.y, p.z - P.z);
                    if (d < 1.65) {
                        if (P.rollT > 0) {
                            // Reflect back!
                            p.team = 0;
                            p.vx = -p.vx * 1.6; p.vy = -p.vy * 1.6; p.vz = -110;
                            p.dmg = 35;
                            p.t = 0;
                            this.audio.play('deflect');
                        } else {
                            this.damagePlayer(12, false);
                            if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
                            this.projectiles.splice(i, 1);
                        }
                    }
                }
            }

            // 10. Update Active Smart Bomb
            if (this.activeBomb) {
                const b = this.activeBomb;
                if (!b.detonated) {
                    b.t += dt;
                    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
                    b.mesh.position.set(b.x, b.y, b.z);
                    b.mesh.rotation.y += dt * 8;
                    if (b.t >= 0.72 || b.z < -62) {
                        this.detonateBomb(b);
                    }
                } else {
                    b.blastT += dt;
                    const k = b.blastT / 0.55;
                    if (k >= 1) {
                        if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh);
                        this.activeBomb = null;
                    } else {
                        b.mesh.scale.setScalar(1 + k * 24);
                        b.mesh.material.opacity = (1 - k) * 0.65;
                    }
                }
            }

            // 11. Update Pickups & Supply Rings
            for (let i = this.pickups.length - 1; i >= 0; i--) {
                const pk = this.pickups[i];
                pk.z += pk.vz * speedMul * dt;
                pk.mesh.position.set(pk.x, pk.y, pk.z);
                pk.mesh.rotation.z += dt * 1.8;

                if (Math.abs(pk.z - P.z) < 2.2 && Math.hypot(pk.x - P.x, pk.y - P.y) < pk.radius + 1.4) {
                    this.collectPickup(pk);
                    if (pk.mesh && pk.mesh.parent) pk.mesh.parent.remove(pk.mesh);
                    this.pickups.splice(i, 1);
                    continue;
                }
                if (pk.z > 14) {
                    if (pk.mesh && pk.mesh.parent) pk.mesh.parent.remove(pk.mesh);
                    this.pickups.splice(i, 1);
                }
            }

            // 12. Update Floating Text
            for (let i = this.floatTexts.length - 1; i >= 0; i--) {
                const f = this.floatTexts[i];
                f.t += dt;
                f.y += dt * 2.2;
                if (f.t >= f.life) this.floatTexts.splice(i, 1);
            }

            // 13. Update Contact Shadows on Ground
            this.updateContactShadows();

            // 14. Render 3D Scene + 2D Reticles/HUD Overlay
            this.r.updateVfx(dt, new THREE.Vector3(0, 0, -this.scrollZ));
            this.r.renderFrame(dt);
            this.drawReticlesAndOverlays();
        }

        collectPickup(pk) {
            const P = this.player;
            if (pk.kind === 'silver') {
                P.hp = Math.min(P.maxHp, P.hp + 28);
                if (P.wingL < 2 || P.wingR < 2) {
                    P.wingL = 2; P.wingR = 2;
                    P.mesh.userData.wingL.visible = true;
                    P.mesh.userData.wingR.visible = true;
                    this.floatTexts.push({ x: P.x, y: P.y + 1.5, z: P.z, text: 'WINGS REPAIRED!', color: '#62f2ff', t: 0, life: 1.3 });
                } else {
                    this.floatTexts.push({ x: P.x, y: P.y + 1.3, z: P.z, text: 'SHIELD +28%', color: '#c8e6ff', t: 0, life: 1.0 });
                }
                this.audio.play('ringSilver');
            } else if (pk.kind === 'gold') {
                P.goldRings++;
                P.hp = Math.min(P.maxHp, P.hp + 35);
                P.wingL = 2; P.wingR = 2;
                P.mesh.userData.wingL.visible = true;
                P.mesh.userData.wingR.visible = true;
                if (P.goldRings === 3 && !P.shieldExpanded) {
                    P.shieldExpanded = true;
                    P.maxHp = 150;
                    P.hp = 150;
                    this.comms('peppy', 'PEPPY HARE', 'Three Gold Rings collected! Maximum Shield Gauge expanded!');
                } else {
                    this.floatTexts.push({ x: P.x, y: P.y + 1.4, z: P.z, text: 'GOLD RING (' + P.goldRings + '/3)', color: '#ffd83b', t: 0, life: 1.2 });
                }
                this.audio.play('ringGold');
            } else if (pk.kind === 'warp') {
                this.warpChain++;
                P.boost = P.maxBoost;
                this.addHits(3, P.x, P.y, P.z);
                this.audio.play('ringGold');
            } else if (pk.kind === 'laser') {
                P.laserLevel = Math.min(3, P.laserLevel + 1);
                P.wingL = 2; P.wingR = 2;
                P.mesh.userData.wingL.visible = true;
                P.mesh.userData.wingR.visible = true;
                this.floatTexts.push({ x: P.x, y: P.y + 1.5, z: P.z, text: P.laserLevel === 3 ? 'HYPER LASERS!' : 'TWIN LASERS!', color: '#45f2ff', t: 0, life: 1.3 });
                this.audio.play('powerup');
            } else if (pk.kind === 'bomb') {
                P.bombs = Math.min(9, P.bombs + 1);
                this.floatTexts.push({ x: P.x, y: P.y + 1.5, z: P.z, text: 'SMART BOMB +1', color: '#ff6448', t: 0, life: 1.2 });
                this.audio.play('powerup');
            }
            this.ui.updateHud(this);
        }

        spawnEnemyShot(sx, sy, sz, tx, ty, tz, hex) {
            const dx = tx - sx, dy = ty - sy, dz = tz - sz;
            const len = Math.max(0.1, Math.hypot(dx, dy, dz));
            const speed = 58;
            const m = new THREE.Mesh(
                new THREE.SphereGeometry(0.36, 6, 5),
                new THREE.MeshBasicMaterial({ color: hex || 0xff9a28, toneMapped: false })
            );
            m.position.set(sx, sy, sz);
            this.r.fxGroup.add(m);
            this.projectiles.push({
                team: 1,
                kind: 'enemyBolt',
                mesh: m,
                x: sx, y: sy, z: sz,
                vx: (dx / len) * speed,
                vy: (dy / len) * speed,
                vz: (dz / len) * speed,
                dmg: 12,
                radius: 0.7,
                life: 3.0,
                t: 0,
                color: hex || 0xff9a28,
            });
        }

        findLockCandidate() {
            const P = this.player;
            const aimX = P.x + P.aimX * 14, aimY = P.y + P.aimY * 14;
            let best = null, bestD = 14;
            for (const e of this.entities) {
                if (e.dead || e.indestructible || e.z > -6) continue;
                const d = Math.hypot(e.x - aimX, e.y - aimY);
                if (d < bestD) { bestD = d; best = e; }
            }
            if (!best && this.boss && !this.boss.dead) return this.boss;
            return best;
        }

        updateWaveScript(dt) {
            if (this.boss) return;
            const sec = SECTORS[this.sectorIndex];
            const step = Math.floor(this.stageTime / 4.2);
            if (step <= this.waveStep) return;
            this.waveStep = step;

            if (this.stageTime >= sec.length) {
                this.spawnBoss();
                return;
            }

            if (sec.id === 'corneria') {
                if (step % 3 === 1) this.spawnSquadron('fighter', 5, step % 2 ? 'v' : 'ring', -120);
                if (step % 2 === 0) this.spawnArchOrAsteroid('arch', (Math.random() - 0.5) * 6, 0, -125);
                if (step % 4 === 2) this.spawnWalkerOrTurret(step % 8 === 2 ? 'walker' : 'turret', (Math.random() - 0.5) * 14, -120);
                if (step === 6) this.spawnWingmanEncounter('slippy');
                if (step === 14) this.spawnWingmanEncounter('falco');
                if (step === 20) this.spawnWingmanEncounter('peppy');
            } else if (sec.id === 'meteo') {
                for (let k = 0; k < 3; k++) {
                    this.spawnArchOrAsteroid('asteroid', (Math.random() - 0.5) * 22, (Math.random() - 0.4) * 11, -120 - k * 14);
                }
                if (step % 2 === 1) this.spawnSquadron(step % 4 === 1 ? 'stealth' : 'fighter', 4, 'ring', -115);
                if (step % 5 === 0) this.spawnPickup('warp', (Math.random() - 0.5) * 10, (Math.random() - 0.3) * 5, -110);
                if (step === 8) this.spawnWingmanEncounter('falco');
                if (step === 17) this.spawnWingmanEncounter('peppy');
            } else {
                // Venom Trench
                if (step % 2 === 1) this.spawnArchOrAsteroid('arch', (Math.random() - 0.5) * 5, 0, -125);
                if (step % 3 === 0) this.spawnSquadron('stealth', 5, 'v', -118);
                if (step % 3 === 2) this.spawnWalkerOrTurret('walker', (Math.random() - 0.5) * 12, -120);
                if (step === 9) this.spawnWingmanEncounter('slippy');
                if (step === 15) this.spawnStarWolfDuel();
            }
        }

        updateContactShadows() {
            const sh = this.r.shadowMesh;
            if (!this.r.groundPlane) { sh.count = 0; return; }
            let idx = 0;
            const tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
            const addSh = (x, z, r) => {
                if (idx >= 80) return;
                tmpV.set(x, -5.92, z); tmpQ.identity(); tmpS.set(r, 1, r);
                tmpM.compose(tmpV, tmpQ, tmpS);
                sh.setMatrixAt(idx++, tmpM);
            };
            addSh(this.player.x, this.player.z, 3.4);
            for (const e of this.entities) {
                if (!e.dead && e.kind !== 'arch') addSh(e.x, e.z, e.radius * 1.9);
            }
            if (this.boss && !this.boss.dead) addSh(this.boss.x, this.boss.z, 12);
            sh.count = idx;
            if (idx > 0) sh.instanceMatrix.needsUpdate = true;
        }

        // ------------------------------------------------------------------ 2D Canvas Overlay: Dual Reticles, Lock-On Box & Floating Hit Text
        drawReticlesAndOverlays() {
            const g = this.r.hctx, pr = this.r.hudPr, w = this.r.width, h = this.r.height;
            g.setTransform(pr, 0, 0, pr, 0, 0);
            g.clearRect(0, 0, w, h);

            const P = this.player;
            const tmpV = new THREE.Vector3();
            const project = (wx, wy, wz) => {
                tmpV.set(wx, wy, wz).project(this.r.camera);
                return { x: (tmpV.x + 1) * 0.5 * w, y: (1 - tmpV.y) * 0.5 * h, behind: tmpV.z > 1 };
            };

            // 1. Far Reticle (-32 Z) & Near Reticle (-14 Z)
            const dirX = P.aimX * 0.42, dirY = P.aimY * 0.42;
            const nearP = project(P.x + dirX * 14, P.y + dirY * 14, P.z - 14);
            const farP = project(P.x + dirX * 32, P.y + dirY * 32, P.z - 32);

            // Far reticle (cyan/yellow corner brackets)
            if (!farP.behind) {
                g.strokeStyle = 'rgba(94, 242, 255, 0.85)';
                g.lineWidth = 2;
                const s = 14;
                g.strokeRect(farP.x - s, farP.y - s, s * 2, s * 2);
            }

            // Near reticle (classic Star Fox green crosshair box)
            if (!nearP.behind) {
                const charging = P.chargeT > 0.25;
                g.strokeStyle = charging ? '#ff4560' : '#4eff7a';
                g.lineWidth = 2.4;
                const s = charging ? 18 + Math.sin(this.stageTime * 22) * 3 : 20;
                g.beginPath();
                // 4 corner brackets
                const L = 7;
                for (const sx of [-1, 1]) {
                    for (const sy of [-1, 1]) {
                        g.moveTo(nearP.x + sx * s, nearP.y + sy * (s - L));
                        g.lineTo(nearP.x + sx * s, nearP.y + sy * s);
                        g.lineTo(nearP.x + sx * (s - L), nearP.y + sy * s);
                    }
                }
                g.stroke();
            }

            // 2. Red Octagonal Lock-On Reticle over locked target
            if (P.lockedTarget && !P.lockedTarget.dead) {
                const lp = project(P.lockedTarget.x, P.lockedTarget.y, P.lockedTarget.z);
                if (!lp.behind) {
                    g.save();
                    g.translate(lp.x, lp.y);
                    g.rotate(this.stageTime * 5);
                    g.strokeStyle = '#ff2e4c';
                    g.lineWidth = 3;
                    const r = 26 + Math.sin(this.stageTime * 18) * 4;
                    g.beginPath();
                    for (let i = 0; i < 8; i++) {
                        const a = (i / 8) * TAU;
                        const px = Math.cos(a) * r, py = Math.sin(a) * r;
                        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
                    }
                    g.closePath();
                    g.stroke();
                    g.restore();

                    g.font = '800 11px "Orbitron", monospace';
                    g.fillStyle = '#ff4b66';
                    g.textAlign = 'center';
                    g.fillText('LOCK ON', lp.x, lp.y - 32);
                }
            }

            // 3. Wingman "HELP!" indicator when chased
            if (this.wingmanActor && this.wingmanActor.chaserCount > 0) {
                const wp = project(this.wingmanActor.x, this.wingmanActor.y + 1.8, this.wingmanActor.z);
                if (!wp.behind) {
                    g.font = '800 13px "Orbitron", sans-serif';
                    g.textAlign = 'center';
                    g.fillStyle = '#ffcf38';
                    g.fillText('▼ ' + this.wingmen[this.wingmanActor.who].name + ' — HELP! ▼', wp.x, wp.y);
                }
            }

            // 4. Floating Hit Bonus Texts ("HIT +3", "SHIELD +28%", etc.)
            g.textAlign = 'center';
            for (const f of this.floatTexts) {
                const fp = project(f.x, f.y, f.z);
                if (fp.behind) continue;
                const k = f.t / f.life;
                g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
                g.font = '900 16px "Orbitron", sans-serif';
                g.lineWidth = 4;
                g.strokeStyle = 'rgba(0,0,0,0.85)';
                g.strokeText(f.text, fp.x, fp.y);
                g.fillStyle = f.color;
                g.fillText(f.text, fp.x, fp.y);
            }
            g.globalAlpha = 1;
        }
    }

    SW.Game = Game;
})();
