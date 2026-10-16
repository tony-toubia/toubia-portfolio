// Starwing 64: Web Audio API procedural SFX, N64-style synth soundtrack, and Lylat radio voice synthesizer.
(function () {
    'use strict';
    const SW = window.SW = window.SW || {};
    const MUTE_KEY = 'starwing.muted';

    const VOICE_PROFILES = {
        fox:    { base: 230, spread: 65, rate: 0.068, wave: 'sawtooth', filter: 1350 },
        peppy:  { base: 165, spread: 48, rate: 0.078, wave: 'triangle', filter: 1050 },
        slippy: { base: 340, spread: 95, rate: 0.062, wave: 'square',   filter: 1650 },
        falco:  { base: 255, spread: 80, rate: 0.060, wave: 'sawtooth', filter: 1500 },
        pepper: { base: 145, spread: 42, rate: 0.082, wave: 'sawtooth', filter: 980  },
        wolf:   { base: 135, spread: 55, rate: 0.075, wave: 'sawtooth', filter: 920  },
        andron: { base: 92,  spread: 35, rate: 0.095, wave: 'sawtooth', filter: 720  },
    };

    class AudioEngine {
        constructor() {
            this.ctx = null;
            this.muted = false;
            try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* ignore */ }
            this.musicTimer = null;
            this.musicTheme = null;
            this.step = 0;
            this.voiceTimers = [];
        }

        unlock() {
            if (!this.ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                this.ctx = new AC();
                this.master = this.ctx.createGain();
                this.master.gain.value = this.muted ? 0 : 0.42;
                this.master.connect(this.ctx.destination);
                this.sfxGain = this.ctx.createGain();
                this.sfxGain.gain.value = 0.85;
                this.sfxGain.connect(this.master);
                this.musicGain = this.ctx.createGain();
                this.musicGain.gain.value = 0.28;
                this.musicGain.connect(this.master);
                this.noiseBuf = this.makeNoise();
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
        }

        makeNoise() {
            const sr = this.ctx.sampleRate, len = sr * 1.5;
            const buf = this.ctx.createBuffer(1, len, sr);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
            return buf;
        }

        isMuted() { return this.muted; }
        setMuted(m) {
            this.muted = !!m;
            try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch (e) { /* ignore */ }
            if (this.master && this.ctx) {
                this.master.gain.setTargetAtTime(this.muted ? 0 : 0.42, this.ctx.currentTime, 0.03);
            }
        }

        tone(f0, f1, dur, type, vol, delay, dest) {
            if (this.muted || !this.ctx) return;
            const t = this.ctx.currentTime + (delay || 0);
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = type || 'sawtooth';
            osc.frequency.setValueAtTime(Math.max(20, f0), t);
            if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(vol || 0.2, t + Math.min(0.012, dur * 0.2));
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            osc.connect(g);
            g.connect(dest || this.sfxGain);
            osc.start(t);
            osc.stop(t + dur + 0.02);
        }

        noise(dur, filterFreq, q, vol, delay, filterType) {
            if (this.muted || !this.ctx || !this.noiseBuf) return;
            const t = this.ctx.currentTime + (delay || 0);
            const src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuf;
            const flt = this.ctx.createBiquadFilter();
            flt.type = filterType || 'bandpass';
            flt.frequency.setValueAtTime(filterFreq || 800, t);
            flt.Q.value = q || 1.2;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(vol || 0.2, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            src.connect(flt);
            flt.connect(g);
            g.connect(this.sfxGain);
            src.start(t, Math.random() * 0.4, dur + 0.02);
        }

        play(kind) {
            this.unlock();
            if (this.muted || !this.ctx) return;
            switch (kind) {
                case 'laser':
                    this.tone(920, 210, 0.09, 'sawtooth', 0.22);
                    break;
                case 'twinLaser':
                    this.tone(1120, 240, 0.095, 'sawtooth', 0.22);
                    this.tone(1480, 310, 0.085, 'square', 0.14, 0.012);
                    break;
                case 'hyperLaser':
                    this.tone(1520, 280, 0.11, 'sawtooth', 0.26);
                    this.tone(2150, 420, 0.10, 'square', 0.18, 0.01);
                    this.noise(0.06, 2600, 2.0, 0.1);
                    break;
                case 'chargeTick':
                    this.tone(540, 780, 0.05, 'sine', 0.12);
                    break;
                case 'lockOn':
                    this.tone(1280, 1680, 0.065, 'square', 0.25);
                    this.tone(1680, 2120, 0.075, 'square', 0.24, 0.065);
                    break;
                case 'chargeShot':
                    this.tone(680, 120, 0.32, 'sawtooth', 0.36);
                    this.tone(1360, 260, 0.26, 'square', 0.24);
                    this.noise(0.24, 900, 1.5, 0.24);
                    break;
                case 'barrelRoll':
                    this.tone(360, 940, 0.16, 'triangle', 0.24);
                    this.tone(640, 1280, 0.16, 'sine', 0.18, 0.06);
                    break;
                case 'deflect':
                    this.tone(1850, 2900, 0.08, 'triangle', 0.28);
                    this.tone(2600, 1400, 0.09, 'sine', 0.22, 0.03);
                    break;
                case 'hit':
                    this.tone(240, 90, 0.08, 'square', 0.2);
                    this.noise(0.07, 1100, 1.2, 0.16);
                    break;
                case 'explosion':
                    this.tone(140, 36, 0.34, 'sawtooth', 0.35);
                    this.noise(0.36, 480, 0.9, 0.35, 0, 'lowpass');
                    break;
                case 'bigBoom':
                    this.tone(110, 24, 0.68, 'sawtooth', 0.45);
                    this.tone(220, 40, 0.52, 'square', 0.32, 0.04);
                    this.noise(0.75, 420, 0.7, 0.48, 0, 'lowpass');
                    break;
                case 'bombLaunch':
                    this.tone(520, 180, 0.38, 'sawtooth', 0.3);
                    this.noise(0.25, 1400, 1.5, 0.2);
                    break;
                case 'ringSilver':
                    this.tone(660, 880, 0.1, 'sine', 0.24);
                    this.tone(990, 1320, 0.14, 'triangle', 0.24, 0.07);
                    break;
                case 'ringGold':
                    this.tone(587, 587, 0.08, 'triangle', 0.26);
                    this.tone(880, 880, 0.08, 'triangle', 0.26, 0.07);
                    this.tone(1174, 1568, 0.22, 'triangle', 0.3, 0.14);
                    break;
                case 'powerup':
                    this.tone(440, 660, 0.09, 'square', 0.22);
                    this.tone(660, 990, 0.09, 'square', 0.22, 0.08);
                    this.tone(990, 1480, 0.18, 'square', 0.25, 0.16);
                    break;
                case 'wingClip':
                    this.tone(190, 75, 0.15, 'sawtooth', 0.34);
                    this.noise(0.18, 950, 1.8, 0.32);
                    break;
                case 'wingBreak':
                    this.tone(310, 55, 0.45, 'sawtooth', 0.42);
                    this.noise(0.45, 650, 1.2, 0.42);
                    break;
                case 'boost':
                    this.tone(180, 520, 0.28, 'sawtooth', 0.24);
                    this.noise(0.32, 1200, 1.1, 0.26);
                    break;
                case 'brake':
                    this.tone(420, 140, 0.24, 'triangle', 0.2);
                    this.noise(0.22, 600, 1.4, 0.18);
                    break;
                case 'somersault':
                    this.tone(260, 880, 0.38, 'sine', 0.25);
                    this.noise(0.35, 1100, 1.3, 0.2);
                    break;
                case 'radioOpen':
                    this.noise(0.055, 2200, 2.5, 0.24);
                    this.tone(1420, 1860, 0.045, 'square', 0.16, 0.02);
                    break;
                case 'radioClose':
                    this.tone(1620, 1120, 0.04, 'square', 0.14);
                    this.noise(0.05, 1900, 2.5, 0.2, 0.03);
                    break;
                case 'bossAlert':
                    for (let i = 0; i < 3; i++) {
                        this.tone(440, 220, 0.22, 'sawtooth', 0.32, i * 0.28);
                        this.tone(880, 440, 0.22, 'square', 0.22, i * 0.28);
                    }
                    break;
            }
        }

        // Synthesize N64 Star Fox radio gibberish syllables for a speaker
        speakComms(speaker, text) {
            this.unlock();
            for (const id of this.voiceTimers) clearTimeout(id);
            this.voiceTimers.length = 0;
            if (this.muted || !this.ctx) return;
            this.play('radioOpen');
            const prof = VOICE_PROFILES[speaker] || VOICE_PROFILES.fox;
            const count = Math.min(18, Math.max(5, Math.ceil((text || '').length / 3.2)));
            let delay = 80;
            for (let i = 0; i < count; i++) {
                const d = delay;
                const tid = setTimeout(() => {
                    if (this.muted || !this.ctx) return;
                    const f0 = prof.base + (Math.random() - 0.35) * prof.spread;
                    const f1 = f0 + (Math.random() - 0.45) * prof.spread * 0.9;
                    this.tone(f0, f1, prof.rate * 0.88, prof.wave, 0.14);
                }, d);
                this.voiceTimers.push(tid);
                delay += (prof.rate * 1000) * (0.85 + Math.random() * 0.4);
            }
            const closeId = setTimeout(() => this.play('radioClose'), delay + 60);
            this.voiceTimers.push(closeId);
        }

        startMusic(theme) {
            this.unlock();
            if (this.musicTheme === theme && this.musicTimer) return;
            this.stopMusic();
            this.musicTheme = theme;
            this.step = 0;
            const tempo = theme === 'boss' ? 125 : theme === 'venom' ? 130 : theme === 'corneria' ? 138 : 112;
            const stepMs = Math.round((60 / tempo / 2) * 1000);

            const bassLines = {
                corneria: [110, 110, 130.8, 146.8, 164.8, 164.8, 146.8, 130.8],
                meteo:    [98,  123.5, 146.8, 123.5, 92.5, 110, 138.6, 110],
                venom:    [82.4, 82.4, 98, 87.3, 82.4, 110, 103.8, 98],
                boss:     [73.4, 77.8, 73.4, 87.3, 73.4, 77.8, 98, 92.5],
                map:      [65.4, 98, 130.8, 98, 73.4, 110, 146.8, 110],
            };
            const leadLines = {
                corneria: [440, 0, 523.2, 587.3, 659.2, 0, 784, 659.2, 587.3, 523.2, 440, 0, 392, 440, 523.2, 0],
                meteo:    [392, 493.9, 587.3, 0, 554.4, 440, 370, 0, 392, 493.9, 659.2, 0, 587.3, 493.9, 392, 0],
                venom:    [329.6, 329.6, 392, 349.2, 329.6, 0, 440, 415.3, 392, 0, 349.2, 329.6, 293.7, 329.6, 0, 0],
                boss:     [293.7, 311.1, 293.7, 349.2, 0, 440, 415.3, 392, 293.7, 311.1, 466.2, 440, 0, 349.2, 311.1, 293.7],
                map:      [261.6, 0, 329.6, 392, 0, 523.2, 392, 329.6, 293.7, 0, 349.2, 440, 0, 587.3, 440, 349.2],
            };

            const tick = () => {
                if (!this.ctx || this.muted) { this.step++; return; }
                const s = this.step++;
                const bass = bassLines[theme] || bassLines.corneria;
                const lead = leadLines[theme] || leadLines.corneria;
                const bf = bass[s % bass.length];
                if (bf) this.tone(bf, bf * 0.99, stepMs * 0.00075, 'sawtooth', 0.22, 0, this.musicGain);
                const lf = lead[s % lead.length];
                if (lf && (s % 2 === 0 || theme === 'boss')) {
                    this.tone(lf, lf, stepMs * 0.0011, theme === 'map' ? 'triangle' : 'square', 0.14, 0, this.musicGain);
                }
            };
            this.musicTimer = setInterval(tick, stepMs);
        }

        stopMusic() {
            if (this.musicTimer) {
                clearInterval(this.musicTimer);
                this.musicTimer = null;
            }
            this.musicTheme = null;
        }
    }

    SW.Audio = new AudioEngine();
})();
