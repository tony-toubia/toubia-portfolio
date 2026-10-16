// Starwing 64: Unified Desktop (Keyboard + Mouse) and Mobile (Virtual Flight Stick + Action Cluster) Input.
(function () {
    'use strict';
    const SW = window.SW = window.SW || {};
    const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

    class InputController {
        constructor(game) {
            this.game = game;
            this.keys = new Set();
            this.mouseActive = false;
            this.mouseX = 0;
            this.mouseY = 0;
            this.mouseDown = false;

            // Touch virtual joystick state
            this.stickTouchId = null;
            this.stickOrigin = { x: 0, y: 0 };
            this.stickVec = { x: 0, y: 0 };

            // Touch buttons state
            this.touchFire = false;
            this.touchBoost = false;
            this.touchBrake = false;

            // Double-tap barrel roll detection
            this.lastTapKey = null;
            this.lastTapTime = 0;

            this.bindDesktop();
            this.bindTouch();
        }

        bindDesktop() {
            window.addEventListener('keydown', (e) => {
                if (e.repeat) return;
                const code = e.code;
                this.keys.add(code);

                if (code === 'Escape' || code === 'KeyP') {
                    if (this.game.state === 'playing') this.game.ui.togglePause(true);
                    else if (this.game.state === 'paused') this.game.ui.togglePause(false);
                    return;
                }

                if (this.game.state !== 'playing') return;

                // Double-tap A/D or Left/Right for Barrel Roll!
                const now = performance.now();
                if (code === 'KeyA' || code === 'ArrowLeft') {
                    if (this.lastTapKey === 'L' && now - this.lastTapTime < 280) {
                        this.game.triggerBarrelRoll(-1);
                    }
                    this.lastTapKey = 'L';
                    this.lastTapTime = now;
                } else if (code === 'KeyD' || code === 'ArrowRight') {
                    if (this.lastTapKey === 'R' && now - this.lastTapTime < 280) {
                        this.game.triggerBarrelRoll(1);
                    }
                    this.lastTapKey = 'R';
                    this.lastTapTime = now;
                }

                if (code === 'KeyQ' || code === 'KeyZ') this.game.triggerBarrelRoll(-1);
                if (code === 'KeyE') this.game.triggerBarrelRoll(1);
                if (code === 'KeyB' || code === 'Enter') this.game.triggerBomb();
                if (code === 'KeyC' || code === 'KeyX') this.game.triggerSomersault();
            });

            window.addEventListener('keyup', (e) => {
                this.keys.delete(e.code);
            });

            const stage = document.getElementById('stage');
            if (!stage) return;

            stage.addEventListener('mousemove', (e) => {
                if (this.stickTouchId !== null) return;
                const r = stage.getBoundingClientRect();
                const nx = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
                const ny = -(((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1);
                this.mouseX = clamp(nx * 1.25, -1, 1);
                this.mouseY = clamp(ny * 1.25, -1, 1);
                this.mouseActive = true;
            });

            stage.addEventListener('mousedown', (e) => {
                if (e.target.closest('button, .ui-layer')) return;
                SW.Audio.unlock();
                if (this.game.state !== 'playing') return;
                if (e.button === 0) {
                    this.mouseDown = true;
                } else if (e.button === 2) {
                    this.game.triggerBomb();
                }
            });

            window.addEventListener('mouseup', (e) => {
                if (e.button === 0) this.mouseDown = false;
            });

            stage.addEventListener('contextmenu', (e) => e.preventDefault());
        }

        bindTouch() {
            const stickZone = document.getElementById('touch-stick-zone');
            const stickBase = document.getElementById('stick-base');
            const stickNub = document.getElementById('stick-nub');
            const maxR = 54;

            if (stickZone) {
                stickZone.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    SW.Audio.unlock();
                    const t = e.changedTouches[0];
                    this.stickTouchId = t.identifier;
                    const r = stickZone.getBoundingClientRect();
                    this.stickOrigin.x = t.clientX;
                    this.stickOrigin.y = t.clientY;
                    this.stickVec.x = 0;
                    this.stickVec.y = 0;
                    if (stickBase) {
                        stickBase.style.left = (t.clientX - r.left) + 'px';
                        stickBase.style.top = (t.clientY - r.top) + 'px';
                        stickBase.classList.add('active');
                    }
                    if (stickNub) stickNub.style.transform = 'translate(-50%, -50%)';
                }, { passive: false });

                stickZone.addEventListener('touchmove', (e) => {
                    e.preventDefault();
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        const t = e.changedTouches[i];
                        if (t.identifier === this.stickTouchId) {
                            const dx = t.clientX - this.stickOrigin.x;
                            const dy = t.clientY - this.stickOrigin.y;
                            const dist = Math.hypot(dx, dy);
                            const clamped = Math.min(maxR, dist);
                            const ang = Math.atan2(dy, dx);
                            const nx = dist > 2 ? (Math.cos(ang) * clamped) / maxR : 0;
                            const ny = dist > 2 ? -(Math.sin(ang) * clamped) / maxR : 0;
                            this.stickVec.x = clamp(nx * 1.15, -1, 1);
                            this.stickVec.y = clamp(ny * 1.15, -1, 1);
                            if (stickNub) {
                                stickNub.style.transform = `translate(calc(-50% + ${Math.cos(ang) * clamped}px), calc(-50% + ${Math.sin(ang) * clamped}px))`;
                            }
                        }
                    }
                }, { passive: false });

                const endStick = (e) => {
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        if (e.changedTouches[i].identifier === this.stickTouchId) {
                            this.stickTouchId = null;
                            this.stickVec.x = 0;
                            this.stickVec.y = 0;
                            if (stickBase) stickBase.classList.remove('active');
                            if (stickNub) stickNub.style.transform = 'translate(-50%, -50%)';
                        }
                    }
                };
                stickZone.addEventListener('touchend', endStick);
                stickZone.addEventListener('touchcancel', endStick);
            }

            // Bind mobile action buttons
            const bindHold = (id, prop) => {
                const el = document.getElementById(id);
                if (!el) return;
                const on = (e) => { e.preventDefault(); SW.Audio.unlock(); this[prop] = true; el.classList.add('pressed'); };
                const off = (e) => { e.preventDefault(); this[prop] = false; el.classList.remove('pressed'); };
                el.addEventListener('touchstart', on, { passive: false });
                el.addEventListener('touchend', off, { passive: false });
                el.addEventListener('touchcancel', off, { passive: false });
                el.addEventListener('mousedown', on);
                el.addEventListener('mouseup', off);
                el.addEventListener('mouseleave', off);
            };
            bindHold('btn-fire', 'touchFire');
            bindHold('btn-boost', 'touchBoost');

            const bindTap = (id, fn) => {
                const el = document.getElementById(id);
                if (!el) return;
                const trig = (e) => { e.preventDefault(); SW.Audio.unlock(); fn(); };
                el.addEventListener('touchstart', trig, { passive: false });
                el.addEventListener('click', trig);
            };
            bindTap('btn-roll', () => this.game.triggerBarrelRoll(this.stickVec.x < -0.1 ? -1 : 1));
            bindTap('btn-bomb', () => this.game.triggerBomb());
            bindTap('btn-loop', () => this.game.triggerSomersault());
        }

        sample() {
            let kx = 0, ky = 0;
            if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
            if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
            if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky += 1;
            if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky -= 1;

            if (kx !== 0 || ky !== 0) this.mouseActive = false;

            let moveX = 0, moveY = 0;
            if (this.stickTouchId !== null) {
                moveX = this.stickVec.x;
                moveY = this.stickVec.y;
            } else if (kx !== 0 || ky !== 0) {
                moveX = kx;
                moveY = ky;
            } else if (this.mouseActive) {
                moveX = this.mouseX;
                moveY = this.mouseY;
            }

            const fire = this.mouseDown || this.touchFire || this.keys.has('Space');
            const boost = this.touchBoost || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
            const brake = this.touchBrake || this.keys.has('ControlLeft') || this.keys.has('KeyF');

            return { moveX, moveY, fire, boost, brake };
        }
    }

    SW.InputController = InputController;
})();
