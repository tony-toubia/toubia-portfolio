// Starwing 64: HUD, Animated N64 Comms Portrait Canvas, Lylat Sector Map, and Mission Debriefing UI.
(function () {
    'use strict';
    const SW = window.SW = window.SW || {};

    class UI {
        constructor() {
            this.game = null;
            this.commsTimer = null;
            this.commsAnimId = null;
            this.commsSpeaker = 'fox';
            this.commsStart = 0;
            this.portraitCanvas = document.getElementById('comms-portrait');
            this.pctx = this.portraitCanvas ? this.portraitCanvas.getContext('2d') : null;
        }

        bind(game) {
            this.game = game;

            const byId = (id) => document.getElementById(id);
            const on = (id, fn) => { const el = byId(id); if (el) el.addEventListener('click', () => { SW.Audio.unlock(); fn(); }); };

            on('btn-start-campaign', () => this.openSectorMap());
            on('btn-quick-launch', () => {
                this.hideAllScreens();
                this.game.startSector(0);
            });
            on('btn-map-back', () => {
                this.showScreen('scr-title');
                this.game.state = 'title';
            });
            on('btn-pause', () => {
                if (this.game.state === 'playing') this.togglePause(true);
                else if (this.game.state === 'paused') this.togglePause(false);
            });
            on('btn-sound', () => {
                SW.Audio.setMuted(!SW.Audio.isMuted());
                this.syncSoundBtn();
            });
            on('btn-resume', () => this.togglePause(false));
            on('btn-restart', () => {
                this.hideAllScreens();
                this.game.startSector(this.game.sectorIndex);
            });
            on('btn-to-map', () => this.openSectorMap());
            on('btn-next-sector', () => {
                const next = (this.game.sectorIndex + 1) % this.game.getSectors().length;
                this.hideAllScreens();
                this.game.startSector(next);
            });
            on('btn-victory-map', () => this.openSectorMap());
            on('btn-retry', () => {
                this.hideAllScreens();
                this.game.startSector(this.game.sectorIndex);
            });
            on('btn-gameover-map', () => this.openSectorMap());

            this.syncSoundBtn();
        }

        syncSoundBtn() {
            const btn = document.getElementById('btn-sound');
            if (btn) btn.textContent = SW.Audio.isMuted() ? '🔇 Muted' : '🔊 Audio';
        }

        hideAllScreens() {
            for (const id of ['scr-title', 'scr-map', 'scr-pause', 'scr-victory', 'scr-gameover']) {
                const el = document.getElementById(id);
                if (el) el.classList.remove('show');
            }
        }

        showScreen(id) {
            this.hideAllScreens();
            const el = document.getElementById(id);
            if (el) el.classList.add('show');
        }

        openSectorMap() {
            this.game.state = 'map';
            this.game.initTitleScene();
            SW.Audio.startMusic('map');
            this.renderSectorMap();
            this.showScreen('scr-map');
        }

        renderSectorMap() {
            const container = document.getElementById('sector-cards');
            if (!container || !this.game) return;
            const sectors = this.game.getSectors();
            container.innerHTML = '';
            sectors.forEach((sec, idx) => {
                const done = this.game.completedSectors.has(sec.id);
                const medal = this.game.medals.has(sec.id);
                const card = document.createElement('div');
                card.className = 'sector-card' + (done ? ' done' : '');
                card.innerHTML = `
                    <div class="sec-badge">SECTOR 0${idx + 1} ${medal ? '🏅 MEDAL' : done ? '✓ CLEARED' : ''}</div>
                    <h3>${sec.name}</h3>
                    <div class="sec-sub">${sec.subtitle}</div>
                    <p class="sec-desc">${sec.briefing}</p>
                    <div class="sec-meta">
                        <span>BOSS: <strong>${sec.bossName}</strong></span>
                        <span>MEDAL TARGET: <strong>${sec.medalHits} HITS</strong></span>
                    </div>
                    <button type="button" class="btn primary full">SCRAMBLE ARWINGS →</button>
                `;
                card.querySelector('button').addEventListener('click', () => {
                    SW.Audio.unlock();
                    this.hideAllScreens();
                    this.game.startSector(idx);
                });
                container.appendChild(card);
            });
        }

        togglePause(pause) {
            if (!this.game) return;
            if (pause && this.game.state === 'playing') {
                this.game.state = 'paused';
                this.showScreen('scr-pause');
            } else if (!pause && this.game.state === 'paused') {
                this.game.state = 'playing';
                this.hideAllScreens();
            }
        }

        updateHud(game) {
            const P = game.player;
            const sec = game.getSectors()[game.sectorIndex];

            const shieldFill = document.getElementById('bar-shield');
            const shieldText = document.getElementById('val-shield');
            if (shieldFill) {
                const pct = Math.round((P.hp / P.maxHp) * 100);
                shieldFill.style.width = pct + '%';
                shieldFill.style.background = pct > 50 ? 'linear-gradient(90deg,#1ec96b,#5eff9e)' : pct > 25 ? 'linear-gradient(90deg,#e09a1e,#ffd84d)' : 'linear-gradient(90deg,#d92b38,#ff5c6a)';
            }
            if (shieldText) shieldText.textContent = Math.ceil(P.hp) + (P.shieldExpanded ? '/150' : '');

            const boostFill = document.getElementById('bar-boost');
            if (boostFill) boostFill.style.width = Math.round((P.boost / P.maxBoost) * 100) + '%';

            const hitsEl = document.getElementById('val-hits');
            if (hitsEl) hitsEl.textContent = String(game.sectorHits || 0).padStart(3, '0');

            const bombsEl = document.getElementById('val-bombs');
            if (bombsEl) bombsEl.textContent = '💣'.repeat(Math.max(0, P.bombs)) || '0';

            const ringsEl = document.getElementById('val-rings');
            if (ringsEl) ringsEl.textContent = '🪙 ' + (P.goldRings % 3) + '/3';

            const laserEl = document.getElementById('val-laser');
            if (laserEl) {
                const intact = (P.wingL > 0 ? 1 : 0) + (P.wingR > 0 ? 1 : 0);
                const eff = intact === 0 ? 1 : Math.min(P.laserLevel, intact === 1 ? 2 : 3);
                laserEl.textContent = eff === 3 ? 'HYPER' : eff === 2 ? 'TWIN' : 'SINGLE';
                laserEl.style.color = eff === 3 ? '#45f2ff' : eff === 2 ? '#5eff9a' : '#d8e6f5';
            }

            const sectorEl = document.getElementById('val-sector');
            if (sectorEl && sec) sectorEl.textContent = sec.name;

            // Wingman status bars
            for (const key of ['falco', 'peppy', 'slippy']) {
                const w = game.wingmen[key];
                const bar = document.getElementById('wm-bar-' + key);
                const card = document.getElementById('wm-card-' + key);
                if (bar) bar.style.width = Math.max(0, Math.round(w.hp)) + '%';
                if (card) {
                    card.classList.toggle('danger', w.status === 'danger');
                    card.classList.toggle('retreat', w.status === 'retreat');
                }
            }

            // Boss shield bar
            const bossWrap = document.getElementById('boss-bar-wrap');
            const bossName = document.getElementById('boss-bar-name');
            const bossFill = document.getElementById('boss-bar-fill');
            if (bossWrap) {
                if (game.boss && !game.boss.dead) {
                    bossWrap.classList.add('show');
                    if (bossName) bossName.textContent = game.boss.name;
                    if (bossFill) bossFill.style.width = Math.max(0, Math.round((game.boss.hp / game.boss.maxHp) * 100)) + '%';
                } else {
                    bossWrap.classList.remove('show');
                }
            }
        }

        // ------------------------------------------------------------------ N64 Animated Radio Comms Box
        showComms(speakerId, speakerName, text) {
            const box = document.getElementById('comms-box');
            const nameEl = document.getElementById('comms-name');
            const textEl = document.getElementById('comms-text');
            if (!box || !nameEl || !textEl) return;

            this.commsSpeaker = speakerId || 'fox';
            this.commsStart = performance.now();
            nameEl.textContent = speakerName || 'COMMS';
            textEl.textContent = text || '';
            box.classList.add('show');

            if (this.commsTimer) clearTimeout(this.commsTimer);
            this.commsTimer = setTimeout(() => {
                box.classList.remove('show');
            }, 4100);

            if (!this.commsAnimId) {
                const loop = () => {
                    if (!box.classList.contains('show')) {
                        this.commsAnimId = null;
                        return;
                    }
                    this.drawPortrait(this.commsSpeaker, (performance.now() - this.commsStart) * 0.001);
                    this.commsAnimId = requestAnimationFrame(loop);
                };
                this.commsAnimId = requestAnimationFrame(loop);
            }
        }

        drawPortrait(who, t) {
            const g = this.pctx;
            if (!g) return;
            const w = 64, h = 64;
            g.clearRect(0, 0, w, h);

            // Background CRT Grid
            const palettes = {
                fox:    { bg: '#0c243d', fur: '#e07a28', muzzle: '#f5dec4', visor: '#3ef2ff', headset: '#9aa8b8' },
                falco:  { bg: '#0c1b3d', fur: '#1f4eb8', muzzle: '#ffd228', visor: '#ff4538', headset: '#cbd5e1' },
                peppy:  { bg: '#261818', fur: '#8c7e75', muzzle: '#e2d6ce', visor: '#5eff9a', headset: '#d93829' },
                slippy: { bg: '#0d2b1a', fur: '#28b84e', muzzle: '#88f29a', visor: '#38b6ff', headset: '#f5b82e' },
                pepper: { bg: '#2b1414', fur: '#b85438', muzzle: '#e8c4a8', visor: '#ffd838', headset: '#d92b38' },
                wolf:   { bg: '#1e0e29', fur: '#5e6472', muzzle: '#a8b0bf', visor: '#ff284e', headset: '#2a2e38' },
                andron: { bg: '#26081c', fur: '#7c8599', muzzle: '#52ffcb', visor: '#ff2845', headset: '#ff9a28' },
            };
            const P = palettes[who] || palettes.fox;
            g.fillStyle = P.bg;
            g.fillRect(0, 0, w, h);

            // Character Head Silhouette
            g.fillStyle = P.fur;
            g.beginPath();
            g.moveTo(14, 16);
            g.lineTo(22, 6);
            g.lineTo(28, 16);
            g.lineTo(36, 16);
            g.lineTo(42, 6);
            g.lineTo(50, 16);
            g.lineTo(52, 48);
            g.lineTo(12, 48);
            g.closePath();
            g.fill();

            // Visor / Eyes
            g.fillStyle = P.visor;
            g.fillRect(18, 22, 11, 6);
            g.fillRect(35, 22, 11, 6);

            // Animated Talking Mouth / Jaw (opens and closes to syllable rhythm!)
            const mouthOpen = t < 2.2 ? Math.abs(Math.sin(t * 24)) * 7 : 1;
            g.fillStyle = P.muzzle;
            g.fillRect(20, 33, 24, 9);
            g.fillStyle = '#12080c';
            g.fillRect(23, 37, 18, Math.max(1.5, mouthOpen));

            // Comms Headset Mic
            g.strokeStyle = P.headset;
            g.lineWidth = 2.5;
            g.beginPath();
            g.moveTo(11, 28);
            g.lineTo(11, 41);
            g.lineTo(25, 41);
            g.stroke();

            // CRT Scanlines
            g.fillStyle = 'rgba(0, 255, 180, 0.08)';
            for (let y = 0; y < h; y += 3) {
                g.fillRect(0, y, w, 1);
            }
        }

        showSectorComplete(game, sec, earnedMedal) {
            const titleEl = document.getElementById('vic-title');
            const statsEl = document.getElementById('vic-stats');
            if (titleEl) {
                titleEl.textContent = earnedMedal ? 'MISSION ACCOMPLISHED!' : 'MISSION COMPLETE';
                titleEl.style.color = earnedMedal ? '#ffd83b' : '#52f2ff';
            }
            if (statsEl) {
                statsEl.innerHTML = `
                    <div class="stat-row"><span>SECTOR CLEARED</span><strong>${sec.name}</strong></div>
                    <div class="stat-row"><span>ENEMIES DOWNED</span><strong>${game.sectorHits} HITS</strong></div>
                    <div class="stat-row"><span>MEDAL THRESHOLD</span><strong>${sec.medalHits} HITS ${earnedMedal ? '🏅 EARNED!' : ''}</strong></div>
                    <div class="stat-row"><span>TOTAL CAMPAIGN SCORE</span><strong>${game.totalHits} HITS</strong></div>
                    <div class="stat-row"><span>WINGMEN STATUS</span><strong>FALCO ${Math.round(game.wingmen.falco.hp)}% · PEPPY ${Math.round(game.wingmen.peppy.hp)}% · SLIPPY ${Math.round(game.wingmen.slippy.hp)}%</strong></div>
                `;
            }
            this.showScreen('scr-victory');
        }

        showGameOver(game) {
            const statsEl = document.getElementById('go-stats');
            if (statsEl) {
                statsEl.innerHTML = `
                    <div class="stat-row"><span>SECTOR</span><strong>${game.getSectors()[game.sectorIndex].name}</strong></div>
                    <div class="stat-row"><span>SECTOR HITS</span><strong>${game.sectorHits} HITS</strong></div>
                    <div class="stat-row"><span>TOTAL SCORE</span><strong>${game.totalHits} HITS</strong></div>
                `;
            }
            this.showScreen('scr-gameover');
        }
    }

    SW.UI = UI;
})();
