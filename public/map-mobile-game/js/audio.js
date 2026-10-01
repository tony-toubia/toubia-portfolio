/**
 * Audio Manager for Primal Hunt
 * Handles sound effects and music with Web Audio API
 */

class AudioManager {
    constructor() {
        this.context = null;
        this.sounds = {};
        this.music = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.initialized = false;
    }

    /**
     * Initialize audio context (must be called after user interaction)
     */
    init() {
        if (this.initialized) return;

        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();

            // Create gain nodes for volume control
            this.musicGain = this.context.createGain();
            this.sfxGain = this.context.createGain();

            this.musicGain.connect(this.context.destination);
            this.sfxGain.connect(this.context.destination);

            // Self-contained defaults: this used to read a GameSettings global
            // from the old engine's utils.js, and without it init() threw into
            // the catch below and the game ran silently.
            this.setMusicVolume(0);
            this.setSFXVolume(this.muted ? 0 : 0.45);

            this.initialized = true;
            this.generateSounds();
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
        }
    }

    /**
     * Generate procedural sound effects
     */
    generateSounds() {
        // Hit sound
        this.sounds.hit = this.createSound((ctx, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + duration);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            osc.connect(gain);
            return { oscillators: [osc], gain };
        }, 0.15);

        // Shoot sound
        this.sounds.shoot = this.createSound((ctx, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + duration);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            osc.connect(gain);
            return { oscillators: [osc], gain };
        }, 0.1);

        // Ability sound
        this.sounds.ability = this.createSound((ctx, duration) => {
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();
            osc1.type = 'sine';
            osc2.type = 'sine';
            osc1.frequency.setValueAtTime(440, ctx.currentTime);
            osc2.frequency.setValueAtTime(550, ctx.currentTime);
            osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + duration);
            osc2.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + duration);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            osc1.connect(gain);
            osc2.connect(gain);
            return { oscillators: [osc1, osc2], gain };
        }, 0.3);

        // Evolution sound
        this.sounds.evolve = this.createSound((ctx, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(200, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + duration * 0.5);
            osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + duration);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + duration * 0.5);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            osc.connect(gain);
            return { oscillators: [osc], gain };
        }, 0.8);

        // Damage sound
        this.sounds.damage = this.createSound((ctx, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + duration);
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            osc.connect(gain);
            return { oscillators: [osc], gain };
        }, 0.2);

        // Heal sound
        this.sounds.heal = this.createSound((ctx, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + duration);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            osc.connect(gain);
            return { oscillators: [osc], gain };
        }, 0.4);

        // Footstep sound
        this.sounds.step = this.createSound((ctx, duration) => {
            const noise = ctx.createBufferSource();
            const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            noise.buffer = buffer;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 500;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            noise.connect(filter);
            filter.connect(gain);
            return { noise, gain };
        }, 0.08);

        // Gem pickup: a quick rising chime.
        this.sounds.gem = this.createSound((ctx, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(880 + Math.random() * 120, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + duration);
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + duration);
            osc.connect(gain);
            return { oscillators: [osc], gain };
        }, 0.08);

        // Level up: a bright arpeggio.
        this.sounds.levelup = this.createSound((ctx, duration) => {
            const gain = ctx.createGain();
            const oscs = [];
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
                const o = ctx.createOscillator();
                o.type = 'square';
                o.frequency.setValueAtTime(f, ctx.currentTime + i * 0.06);
                o.connect(gain);
                oscs.push(o);
            });
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + duration);
            return { oscillators: oscs, gain };
        }, 0.45);

        // Dodge roll: a short filtered-noise whoosh that sweeps upward.
        this.sounds.dash = this.createSound((ctx, duration) => {
            const noise = ctx.createBufferSource();
            const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            noise.buffer = buffer;
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.Q.value = 1.4;
            filter.frequency.setValueAtTime(500, ctx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(2600, ctx.currentTime + duration);
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + duration * 0.3);
            gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + duration);
            noise.connect(filter);
            filter.connect(gain);
            return { noise, gain };
        }, 0.2);

        // Click sound
        this.sounds.click =this.createSound((ctx, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 600;
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            osc.connect(gain);
            return { oscillators: [osc], gain };
        }, 0.05);

        // Victory sound
        this.sounds.victory = this.createSound((ctx, duration) => {
            const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
            const oscillators = [];
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.2, ctx.currentTime);

            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
                osc.connect(gain);
                oscillators.push(osc);
            });

            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + duration);
            return { oscillators, gain };
        }, 0.8);

        // Defeat sound
        this.sounds.defeat = this.createSound((ctx, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + duration);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            osc.connect(gain);
            return { oscillators: [osc], gain };
        }, 0.6);

        // Monster roar
        this.sounds.roar = this.createSound((ctx, duration) => {
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();
            osc1.type = 'sawtooth';
            osc2.type = 'sawtooth';
            osc1.frequency.setValueAtTime(80, ctx.currentTime);
            osc2.frequency.setValueAtTime(82, ctx.currentTime);
            osc1.frequency.linearRampToValueAtTime(120, ctx.currentTime + duration * 0.3);
            osc2.frequency.linearRampToValueAtTime(123, ctx.currentTime + duration * 0.3);
            osc1.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + duration);
            osc2.frequency.exponentialRampToValueAtTime(62, ctx.currentTime + duration);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + duration * 0.3);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            osc1.connect(gain);
            osc2.connect(gain);
            return { oscillators: [osc1, osc2], gain };
        }, 0.5);
    }

    /**
     * Create a sound generator function
     */
    createSound(generator, duration) {
        return () => {
            if (!this.initialized || !this.context) return;

            const result = generator(this.context, duration);
            result.gain.connect(this.sfxGain);

            if (result.oscillators) {
                result.oscillators.forEach(osc => {
                    osc.start();
                    osc.stop(this.context.currentTime + duration);
                });
            }

            if (result.noise) {
                result.noise.start();
                result.noise.stop(this.context.currentTime + duration);
            }
        };
    }

    /**
     * Play a sound effect
     */
    /**
     * Play a sound, at most once per `gap` ms. A swarm game can ask for the
     * same hit sound forty times in a second; stacked oscillators turn that
     * into a clipping buzz rather than feedback.
     */
    play(soundName) {
        const gaps = { hit: 45, shoot: 70, gem: 35, damage: 120, ability: 90, dash: 120 };
        const now = performance.now();
        this.lastPlayed = this.lastPlayed || {};
        if (now - (this.lastPlayed[soundName] || 0) < (gaps[soundName] || 0)) return;
        this.lastPlayed[soundName] = now;
        if (this.sounds[soundName]) {
            this.sounds[soundName]();
        }
    }

    setMuted(muted) {
        this.muted = muted;
        if (this.sfxGain) this.setSFXVolume(muted ? 0 : 0.45);
    }

    /**
     * Start background music (procedurally generated ambient)
     */
    startMusic() {
        if (!this.initialized || !this.context || this.music) return;

        // Create ambient drone
        const osc1 = this.context.createOscillator();
        const osc2 = this.context.createOscillator();
        const osc3 = this.context.createOscillator();
        const filter = this.context.createBiquadFilter();
        const gain = this.context.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc3.type = 'triangle';

        osc1.frequency.value = 55; // A1
        osc2.frequency.value = 82.41; // E2
        osc3.frequency.value = 110; // A2

        filter.type = 'lowpass';
        filter.frequency.value = 300;

        gain.gain.value = 0.1;

        osc1.connect(filter);
        osc2.connect(filter);
        osc3.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);

        // Add LFO for subtle movement
        const lfo = this.context.createOscillator();
        const lfoGain = this.context.createGain();
        lfo.frequency.value = 0.1;
        lfoGain.gain.value = 20;
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        osc1.start();
        osc2.start();
        osc3.start();
        lfo.start();

        this.music = { oscillators: [osc1, osc2, osc3, lfo], gain };
    }

    /**
     * Stop background music
     */
    stopMusic() {
        if (this.music) {
            this.music.oscillators.forEach(osc => osc.stop());
            this.music = null;
        }
    }

    /**
     * Set music volume
     */
    setMusicVolume(volume) {
        if (this.musicGain) {
            this.musicGain.gain.value = volume;
        }
    }

    /**
     * Set SFX volume
     */
    setSFXVolume(volume) {
        if (this.sfxGain) {
            this.sfxGain.gain.value = volume;
        }
    }

    /**
     * Resume audio context (needed after user interaction on some browsers)
     */
    resume() {
        if (this.context && this.context.state === 'suspended') {
            this.context.resume();
        }
    }
}

// Global audio manager instance. Deliberately not window.Audio - that name is
// the browser's own HTMLAudioElement constructor, and assigning over it broke
// anything that later tried `new Audio()`.
window.Sfx = new AudioManager();
