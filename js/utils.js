/**
 * Utility functions for Primal Hunt
 */

const Utils = {
    /**
     * Generate a unique ID
     */
    generateId() {
        return Math.random().toString(36).substr(2, 9);
    },

    /**
     * Clamp a value between min and max
     */
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },

    /**
     * Linear interpolation
     */
    lerp(start, end, t) {
        return start + (end - start) * t;
    },

    /**
     * Calculate distance between two points
     */
    distance(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /**
     * Calculate angle between two points in radians
     */
    angle(x1, y1, x2, y2) {
        return Math.atan2(y2 - y1, x2 - x1);
    },

    /**
     * Normalize a vector
     */
    normalize(x, y) {
        const len = Math.sqrt(x * x + y * y);
        if (len === 0) return { x: 0, y: 0 };
        return { x: x / len, y: y / len };
    },

    /**
     * Check collision between two circles
     */
    circleCollision(x1, y1, r1, x2, y2, r2) {
        return this.distance(x1, y1, x2, y2) < r1 + r2;
    },

    /**
     * Check collision between two rectangles
     */
    rectCollision(r1, r2) {
        return r1.x < r2.x + r2.width &&
               r1.x + r1.width > r2.x &&
               r1.y < r2.y + r2.height &&
               r1.y + r1.height > r2.y;
    },

    /**
     * Check if point is inside rectangle
     */
    pointInRect(px, py, rect) {
        return px >= rect.x && px <= rect.x + rect.width &&
               py >= rect.y && py <= rect.y + rect.height;
    },

    /**
     * Check if point is inside circle
     */
    pointInCircle(px, py, cx, cy, radius) {
        return this.distance(px, py, cx, cy) <= radius;
    },

    /**
     * Random number between min and max
     */
    random(min, max) {
        return Math.random() * (max - min) + min;
    },

    /**
     * Random integer between min and max (inclusive)
     */
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    /**
     * Pick random element from array
     */
    randomPick(array) {
        return array[Math.floor(Math.random() * array.length)];
    },

    /**
     * Shuffle array in place
     */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    },

    /**
     * Format time as MM:SS
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    },

    /**
     * Deep clone an object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Ease-in-out function
     */
    easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    },

    /**
     * Ease-out function
     */
    easeOut(t) {
        return 1 - Math.pow(1 - t, 3);
    },

    /**
     * Convert degrees to radians
     */
    degToRad(degrees) {
        return degrees * (Math.PI / 180);
    },

    /**
     * Convert radians to degrees
     */
    radToDeg(radians) {
        return radians * (180 / Math.PI);
    },

    /**
     * Get direction vector from angle
     */
    angleToVector(angle) {
        return {
            x: Math.cos(angle),
            y: Math.sin(angle)
        };
    },

    /**
     * Wrap value within range (for circular values like angles)
     */
    wrap(value, min, max) {
        const range = max - min;
        return ((value - min) % range + range) % range + min;
    },

    /**
     * Check if device is mobile
     */
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    /**
     * Request fullscreen
     */
    requestFullscreen(element) {
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
        }
    },

    /**
     * Trigger device vibration
     */
    vibrate(pattern) {
        if (navigator.vibrate && GameSettings.vibration) {
            navigator.vibrate(pattern);
        }
    },

    /**
     * Create a particle effect object
     */
    createParticle(x, y, options = {}) {
        return {
            x,
            y,
            vx: options.vx || Utils.random(-2, 2),
            vy: options.vy || Utils.random(-2, 2),
            life: options.life || 1,
            maxLife: options.life || 1,
            size: options.size || 5,
            color: options.color || '#ffffff',
            gravity: options.gravity || 0,
            friction: options.friction || 0.98
        };
    }
};

/**
 * Game settings object
 */
const GameSettings = {
    sfxVolume: 0.8,
    musicVolume: 0.6,
    vibration: true,
    showFPS: false,
    difficulty: 'normal',

    load() {
        const saved = localStorage.getItem('primalHuntSettings');
        if (saved) {
            Object.assign(this, JSON.parse(saved));
        }
    },

    save() {
        localStorage.setItem('primalHuntSettings', JSON.stringify({
            sfxVolume: this.sfxVolume,
            musicVolume: this.musicVolume,
            vibration: this.vibration,
            showFPS: this.showFPS,
            difficulty: this.difficulty
        }));
    }
};

/**
 * Simple event emitter
 */
class EventEmitter {
    constructor() {
        this.events = {};
    }

    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }

    off(event, callback) {
        if (this.events[event]) {
            this.events[event] = this.events[event].filter(cb => cb !== callback);
        }
    }

    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(callback => callback(data));
        }
    }
}

/**
 * Object pool for performance
 */
class ObjectPool {
    constructor(createFn, resetFn, initialSize = 10) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.pool = [];
        this.active = [];

        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
        }
    }

    get() {
        let obj = this.pool.pop();
        if (!obj) {
            obj = this.createFn();
        }
        this.active.push(obj);
        return obj;
    }

    release(obj) {
        const index = this.active.indexOf(obj);
        if (index !== -1) {
            this.active.splice(index, 1);
            this.resetFn(obj);
            this.pool.push(obj);
        }
    }

    releaseAll() {
        while (this.active.length > 0) {
            this.release(this.active[0]);
        }
    }
}

/**
 * Simple tweening
 */
class Tween {
    constructor(target, properties, duration, easing = Utils.easeOut, onComplete = null) {
        this.target = target;
        this.properties = properties;
        this.duration = duration;
        this.easing = easing;
        this.onComplete = onComplete;
        this.startValues = {};
        this.elapsed = 0;
        this.active = true;

        for (const prop in properties) {
            this.startValues[prop] = target[prop];
        }
    }

    update(dt) {
        if (!this.active) return;

        this.elapsed += dt;
        const t = Math.min(this.elapsed / this.duration, 1);
        const easedT = this.easing(t);

        for (const prop in this.properties) {
            this.target[prop] = Utils.lerp(this.startValues[prop], this.properties[prop], easedT);
        }

        if (t >= 1) {
            this.active = false;
            if (this.onComplete) this.onComplete();
        }
    }
}

// Export for use in other modules
window.Utils = Utils;
window.GameSettings = GameSettings;
window.EventEmitter = EventEmitter;
window.ObjectPool = ObjectPool;
window.Tween = Tween;
