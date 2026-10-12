// Input Controller for Centered Hole.io Controls (Dynamic Floating Joystick + Keyboard + Mouse Drag + Haptics)
class InputController {
    constructor() {
        this.inputVector = { x: 0, z: 0 };
        this.isTouchActive = false;
        this.touchStart = { x: 0, y: 0 };
        this.maxJoyRadius = 55;

        // Mouse drag controls for desktop
        this.isMouseDown = false;
        this.mouseStart = { x: 0, y: 0 };

        this.keys = {
            KeyW: false, ArrowUp: false,
            KeyS: false, ArrowDown: false,
            KeyA: false, ArrowLeft: false,
            KeyD: false, ArrowRight: false,
            Space: false
        };

        this.joyBase = document.getElementById('joy-base');
        this.joyKnob = document.getElementById('joy-knob');
        this.surface = document.getElementById('touch-surface');

        this.onAbility = null;
        this.init();
    }

    triggerHaptic(pattern = 15) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try {
                navigator.vibrate(pattern);
            } catch (e) {
                // Silently ignore if disabled or unsupported
            }
        }
    }

    init() {
        // Keyboard controls
        window.addEventListener('keydown', (e) => {
            if (e.code in this.keys) {
                this.keys[e.code] = true;
                if (e.code === 'Space' && !e.repeat && this.onAbility) {
                    this.onAbility();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code in this.keys) {
                this.keys[e.code] = false;
            }
        });

        // Touch surface listeners (Dynamic Floating Joystick anywhere on screen)
        if (this.surface) {
            this.surface.addEventListener('touchstart', (e) => {
                if (e.cancelable) e.preventDefault();
                const t = e.touches[0];
                this.isTouchActive = true;
                this.touchStart = { x: t.clientX, y: t.clientY };

                if (this.joyBase) {
                    this.joyBase.style.left = `${t.clientX}px`;
                    this.joyBase.style.top = `${t.clientY}px`;
                    this.joyBase.classList.remove('hidden');
                }
                this.updateKnob(0, 0);

                window.audioManager.init();
            }, { passive: false });

            window.addEventListener('touchmove', (e) => {
                if (!this.isTouchActive) return;
                if (e.cancelable) e.preventDefault();
                const t = e.touches[0];

                let dx = t.clientX - this.touchStart.x;
                let dy = t.clientY - this.touchStart.y;
                const dist = Math.hypot(dx, dy);

                if (dist > this.maxJoyRadius) {
                    dx = (dx / dist) * this.maxJoyRadius;
                    dy = (dy / dist) * this.maxJoyRadius;
                }

                this.updateKnob(dx, dy);
                this.inputVector.x = dx / this.maxJoyRadius;
                this.inputVector.z = dy / this.maxJoyRadius;
            }, { passive: false });

            const endTouch = () => {
                this.isTouchActive = false;
                this.inputVector.x = 0;
                this.inputVector.z = 0;
                if (this.joyBase) this.joyBase.classList.add('hidden');
            };

            window.addEventListener('touchend', endTouch);
            window.addEventListener('touchcancel', endTouch);

            // Optional Mouse Drag on Canvas
            this.surface.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                this.isMouseDown = true;
                this.mouseStart = { x: e.clientX, y: e.clientY };
                if (this.joyBase) {
                    this.joyBase.style.left = `${e.clientX}px`;
                    this.joyBase.style.top = `${e.clientY}px`;
                    this.joyBase.classList.remove('hidden');
                }
                this.updateKnob(0, 0);
            });

            window.addEventListener('mousemove', (e) => {
                if (!this.isMouseDown) return;
                let dx = e.clientX - this.mouseStart.x;
                let dy = e.clientY - this.mouseStart.y;
                const dist = Math.hypot(dx, dy);

                if (dist > this.maxJoyRadius) {
                    dx = (dx / dist) * this.maxJoyRadius;
                    dy = (dy / dist) * this.maxJoyRadius;
                }

                this.updateKnob(dx, dy);
                this.inputVector.x = dx / this.maxJoyRadius;
                this.inputVector.z = dy / this.maxJoyRadius;
            });

            window.addEventListener('mouseup', () => {
                if (this.isMouseDown) {
                    this.isMouseDown = false;
                    this.inputVector.x = 0;
                    this.inputVector.z = 0;
                    if (this.joyBase) this.joyBase.classList.add('hidden');
                }
            });
        }

        // Ability button listener
        const btn = document.getElementById('btn-singularity');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onAbility) this.onAbility();
            });
            btn.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                if (this.onAbility) this.onAbility();
            }, { passive: true });
        }
    }

    updateKnob(dx, dy) {
        if (this.joyKnob) {
            this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
        }
    }

    getVector() {
        if (this.isTouchActive || this.isMouseDown) {
            return this.inputVector;
        }

        let kx = 0;
        let kz = 0;
        if (this.keys.KeyW || this.keys.ArrowUp) kz -= 1;
        if (this.keys.KeyS || this.keys.ArrowDown) kz += 1;
        if (this.keys.KeyA || this.keys.ArrowLeft) kx -= 1;
        if (this.keys.KeyD || this.keys.ArrowRight) kx += 1;

        if (kx !== 0 && kz !== 0) {
            kx /= Math.SQRT2;
            kz /= Math.SQRT2;
        }

        return { x: kx, z: kz };
    }
}
