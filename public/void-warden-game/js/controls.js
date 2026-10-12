// Input Controller for Void Warden (Mobile Floating Joystick + Keyboard + Mouse)
class InputController {
    constructor() {
        this.inputVector = { x: 0, z: 0 };
        this.isTouchActive = false;
        this.touchStartPos = { x: 0, y: 0 };
        this.currentTouchPos = { x: 0, y: 0 };
        this.maxJoystickRadius = 55;

        // Key states
        this.keys = {
            KeyW: false, ArrowUp: false,
            KeyS: false, ArrowDown: false,
            KeyA: false, ArrowLeft: false,
            KeyD: false, ArrowRight: false,
            Space: false
        };

        this.joystickBase = document.getElementById('joystick-base');
        this.joystickStick = document.getElementById('joystick-stick');
        this.joystickZone = document.getElementById('joystick-zone');

        this.onAbilityTrigger = null;

        this.initListeners();
    }

    initListeners() {
        // Keyboard listeners
        window.addEventListener('keydown', (e) => {
            if (e.code in this.keys) {
                this.keys[e.code] = true;
                if (e.code === 'Space' && !e.repeat) {
                    if (this.onAbilityTrigger) this.onAbilityTrigger();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code in this.keys) {
                this.keys[e.code] = false;
            }
        });

        // Touch Listeners (Dynamic Floating Joystick)
        if (this.joystickZone) {
            this.joystickZone.addEventListener('touchstart', (e) => {
                const touch = e.touches[0];
                this.isTouchActive = true;
                this.touchStartPos = { x: touch.clientX, y: touch.clientY };
                this.currentTouchPos = { x: touch.clientX, y: touch.clientY };

                // Anchor joystick visually to finger touch point
                this.joystickBase.style.left = `${touch.clientX}px`;
                this.joystickBase.style.top = `${touch.clientY}px`;
                this.joystickBase.classList.remove('hidden');
                this.updateJoystickStick(0, 0);

                window.audioManager.init(); // Audio unlock on touch
            }, { passive: false });

            window.addEventListener('touchmove', (e) => {
                if (!this.isTouchActive) return;
                const touch = e.touches[0];
                this.currentTouchPos = { x: touch.clientX, y: touch.clientY };

                let dx = this.currentTouchPos.x - this.touchStartPos.x;
                let dy = this.currentTouchPos.y - this.touchStartPos.y;
                const dist = Math.hypot(dx, dy);

                if (dist > this.maxJoystickRadius) {
                    dx = (dx / dist) * this.maxJoystickRadius;
                    dy = (dy / dist) * this.maxJoystickRadius;
                }

                this.updateJoystickStick(dx, dy);
                this.inputVector.x = dx / this.maxJoystickRadius;
                this.inputVector.z = dy / this.maxJoystickRadius;
            }, { passive: false });

            const endTouch = () => {
                this.isTouchActive = false;
                this.inputVector.x = 0;
                this.inputVector.z = 0;
                if (this.joystickBase) {
                    this.joystickBase.classList.add('hidden');
                }
            };

            window.addEventListener('touchend', endTouch);
            window.addEventListener('touchcancel', endTouch);
        }

        // Ability button click
        const abilityBtn = document.getElementById('btn-ability');
        if (abilityBtn) {
            abilityBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onAbilityTrigger) this.onAbilityTrigger();
            });
            abilityBtn.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                if (this.onAbilityTrigger) this.onAbilityTrigger();
            }, { passive: true });
        }
    }

    updateJoystickStick(dx, dy) {
        if (this.joystickStick) {
            this.joystickStick.style.transform = `translate(${dx}px, ${dy}px)`;
        }
    }

    getMovementVector() {
        if (this.isTouchActive) {
            return this.inputVector;
        }

        // Keyboard calculation
        let kx = 0;
        let kz = 0;
        if (this.keys.KeyW || this.keys.ArrowUp) kz -= 1;
        if (this.keys.KeyS || this.keys.ArrowDown) kz += 1;
        if (this.keys.KeyA || this.keys.ArrowLeft) kx -= 1;
        if (this.keys.KeyD || this.keys.ArrowRight) kx += 1;

        if (kx !== 0 && kz !== 0) {
            const length = Math.SQRT2;
            kx /= length;
            kz /= length;
        }

        return { x: kx, z: kz };
    }
}
