// Hole Haul: small synthesized sounds (no audio files). HH_AUDIO.play(name, size) after a user gesture.
(() => {
    let ctx = null, master = null, muted = false;
    try { muted = localStorage.getItem('hh.muted') === '1'; } catch { /* private mode */ }
    const ensure = () => {
        if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
        return ctx;
    };
    const tone = (freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0 } = {}) => {
        const c = ensure(); if (!c || muted) return;
        const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    };
    let lastGulp = 0;
    const sounds = {
        // A swallow: bigger things are lower; rapid gulps are thinned out so a pile does not turn into noise.
        gulp(size = 0.3) {
            const now = performance.now(); if (now - lastGulp < 45) return; lastGulp = now;
            const f = 620 / (0.6 + size * 1.6);
            tone(f * (0.92 + Math.random() * 0.16), 0.16, { type: 'sine', vol: 0.32, slide: 0.45 });
        },
        target() { tone(880, 0.09, { type: 'triangle', vol: 0.25 }); tone(1320, 0.12, { type: 'triangle', vol: 0.22, delay: 0.06 }); },
        done() { [660, 880, 1100].forEach((f, i) => tone(f, 0.14, { type: 'triangle', vol: 0.24, delay: i * 0.07 })); },
        coin() { tone(1250, 0.07, { type: 'square', vol: 0.12 }); tone(1660, 0.12, { type: 'square', vol: 0.1, delay: 0.05 }); },
        grow() { tone(330, 0.3, { type: 'sawtooth', vol: 0.12, slide: 2.2 }); tone(495, 0.3, { type: 'triangle', vol: 0.16, slide: 2.2 }); },
        booster() { tone(520, 0.18, { type: 'triangle', vol: 0.22, slide: 1.8 }); },
        tick() { tone(1000, 0.05, { type: 'square', vol: 0.08 }); },
        win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.26, delay: i * 0.1 })); },
        fail() { [440, 370, 311, 262].forEach((f, i) => tone(f, 0.25, { type: 'sawtooth', vol: 0.1, delay: i * 0.13 })); },
        tap() { tone(700, 0.05, { type: 'triangle', vol: 0.15 }); },
        star(i = 0) { tone(990 + i * 220, 0.18, { type: 'triangle', vol: 0.25 }); },
    };
    window.HH_AUDIO = {
        unlock: ensure,
        play(name, arg) { try { if (sounds[name]) sounds[name](arg); } catch { /* audio is best-effort */ } },
        get muted() { return muted; },
        setMuted(m) { muted = !!m; try { localStorage.setItem('hh.muted', muted ? '1' : '0'); } catch { /* private mode */ } },
    };
})();
