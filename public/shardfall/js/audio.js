// Shardfall: small synthesized WebAudio sounds (no samples, no voice). Weapons, explosions, production chimes,
// UI clicks, alert stings, energy weapons, superweapon launches/strikes, radio blips and objective chimes.
// Positional sounds are attenuated by distance from the camera's focus and panned.
(function () {
    'use strict';
    const SF = window.SF = window.SF || {};
    const KEY = 'shardfall.muted';
    let ctx = null, master = null, comp = null, noiseBuf = null;
    let muted = false;
    try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* storage blocked */ }
    const last = {};
    let voices = 0;
    const listener = { x: 0, z: 0, r: 14 };
    const GAP = { rifle: 0.045, mg: 0.04, rocket: 0.07, cannon: 0.06, turretGun: 0.06, artillery: 0.1, boom: 0.06, bigboom: 0.12, impact: 0.05, click: 0.03, select: 0.05, order: 0.06,
        pulse: 0.05, twinPulse: 0.05, shock: 0.07, beam: 0.06, phase: 0.07, spireBeam: 0.1, lance: 0.3, rift: 0.3, siren: 1.2, launch: 0.5, radio: 0.3, cloak: 0.15, decloak: 0.15,
        sniper: 0.12, bikeGun: 0.04, twinCannon: 0.07, salvo: 0.05, sentryGun: 0.035, howitzer: 0.12, stalkerBlade: 0.08, emp: 0.09, arc: 0.1, obliterate: 0.3, wispZap: 0.05,
        heal: 0.35, repair: 0.25, stun: 0.12, income: 2.5, wall: 0.05 };

    function ensure() {
        if (ctx) return ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (e) { return null; }
        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
        master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55;
        master.connect(comp); comp.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return ctx;
    }
    function unlock() {
        const c = ensure(); if (!c) return;
        if (c.state === 'suspended') c.resume().catch(() => {});
    }
    function out(vol, pan) {
        const g = ctx.createGain(); g.gain.value = vol;
        if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(master); }
        else g.connect(master);
        voices++; setTimeout(() => { voices--; try { g.disconnect(); } catch (e) { /* gone */ } }, 2500);
        return g;
    }
    function env(param, t, a, peak, dec, end) {
        param.cancelScheduledValues(t); param.setValueAtTime(0.0001, t);
        param.exponentialRampToValueAtTime(peak, t + a);
        param.exponentialRampToValueAtTime(end || 0.0001, t + a + dec);
    }
    function noise(dest, t, dur, type, f0, f1, q, peak, attack) {
        const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
        const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q || 1;
        f.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
        const g = ctx.createGain(); env(g.gain, t, attack || 0.004, peak, dur);
        s.connect(f); f.connect(g); g.connect(dest);
        s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    }
    function tone(dest, t, dur, type, f0, f1, peak, attack) {
        const o = ctx.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        const g = ctx.createGain(); env(g.gain, t, attack || 0.005, peak, dur);
        o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    }

    const SOUNDS = {
        rifle(d, t) { noise(d, t, 0.07, 'bandpass', 2600, 1400, 1.2, 0.5); tone(d, t, 0.04, 'square', 420, 160, 0.06); },
        mg(d, t) { noise(d, t, 0.045, 'bandpass', 3200, 2000, 1.4, 0.38); tone(d, t, 0.03, 'square', 300, 140, 0.05); },
        rocket(d, t) { noise(d, t, 0.42, 'bandpass', 700, 2600, 2.5, 0.35, 0.03); tone(d, t, 0.12, 'triangle', 160, 70, 0.18); },
        cannon(d, t) { tone(d, t, 0.22, 'sine', 140, 45, 0.7); noise(d, t, 0.2, 'lowpass', 1600, 300, 0.8, 0.5); },
        turretGun(d, t) { tone(d, t, 0.2, 'sine', 170, 55, 0.6); noise(d, t, 0.18, 'lowpass', 2200, 400, 0.8, 0.45); },
        artillery(d, t) { tone(d, t, 0.5, 'sine', 95, 32, 0.85); noise(d, t, 0.45, 'lowpass', 900, 150, 0.7, 0.6); },
        impact(d, t) { noise(d, t, 0.25, 'lowpass', 1400, 200, 0.7, 0.4); tone(d, t, 0.18, 'sine', 90, 40, 0.35); },
        boom(d, t) { noise(d, t, 0.7, 'lowpass', 1800, 120, 0.7, 0.8, 0.008); tone(d, t, 0.5, 'sine', 80, 28, 0.8); },
        bigboom(d, t) { noise(d, t, 1.3, 'lowpass', 1300, 70, 0.6, 1.0, 0.01); tone(d, t, 0.9, 'sine', 62, 22, 1.0); noise(d, t + 0.12, 0.8, 'bandpass', 600, 200, 0.8, 0.35); },
        click(d, t) { tone(d, t, 0.045, 'sine', 1900, 1300, 0.22, 0.002); },
        select(d, t) { tone(d, t, 0.06, 'triangle', 1250, 1500, 0.2, 0.003); },
        order(d, t) { tone(d, t, 0.05, 'triangle', 880, 1180, 0.2, 0.003); tone(d, t + 0.05, 0.05, 'triangle', 1180, 1180, 0.14, 0.003); },
        place(d, t) { tone(d, t, 0.25, 'sine', 190, 55, 0.7); noise(d, t, 0.22, 'lowpass', 900, 200, 0.7, 0.4); tone(d, t + 0.05, 0.16, 'triangle', 660, 990, 0.12); },
        build(d, t) { [523, 659, 784, 1047].forEach((f, i) => tone(d, t + i * 0.075, 0.22, 'triangle', f, f, 0.22, 0.004)); },
        unit(d, t) { tone(d, t, 0.07, 'square', 880, 880, 0.09, 0.003); tone(d, t + 0.085, 0.09, 'square', 1175, 1175, 0.09, 0.003); },
        sell(d, t) { [1568, 1319, 1760].forEach((f, i) => tone(d, t + i * 0.06, 0.12, 'triangle', f, f, 0.18, 0.003)); },
        error(d, t) { tone(d, t, 0.09, 'square', 150, 140, 0.16, 0.004); tone(d, t + 0.12, 0.12, 'square', 120, 110, 0.16, 0.004); },
        lowpower(d, t) { tone(d, t, 0.28, 'sawtooth', 520, 260, 0.15, 0.01); tone(d, t + 0.32, 0.36, 'sawtooth', 420, 180, 0.15, 0.01); },
        attack(d, t) { [0, 0.16, 0.32].forEach((o, i) => tone(d, t + o, 0.12, 'square', i === 2 ? 988 : 740, i === 2 ? 988 : 740, 0.14, 0.004)); },
        ready(d, t) { tone(d, t, 0.12, 'triangle', 988, 988, 0.2); tone(d, t + 0.12, 0.2, 'triangle', 1319, 1319, 0.2); },
        // Hegemony energy weapons
        pulse(d, t) { tone(d, t, 0.07, 'square', 1500, 520, 0.12, 0.002); noise(d, t, 0.05, 'bandpass', 4200, 2600, 2, 0.16); },
        twinPulse(d, t) { tone(d, t, 0.05, 'square', 1700, 700, 0.1, 0.002); tone(d, t + 0.045, 0.05, 'square', 1600, 650, 0.08, 0.002); },
        shock(d, t) { tone(d, t, 0.2, 'sawtooth', 700, 110, 0.22, 0.003); noise(d, t, 0.16, 'bandpass', 1800, 600, 1.5, 0.35); },
        beam(d, t) { tone(d, t, 0.17, 'sawtooth', 320, 290, 0.16, 0.004); tone(d, t, 0.17, 'square', 641, 600, 0.06, 0.004); noise(d, t, 0.15, 'highpass', 3000, 3000, 0.8, 0.12); },
        spireBeam(d, t) { tone(d, t, 0.32, 'sawtooth', 190, 130, 0.3, 0.004); tone(d, t, 0.28, 'sine', 1100, 420, 0.18, 0.004); noise(d, t, 0.3, 'bandpass', 2400, 900, 1.2, 0.22); },
        phase(d, t) { tone(d, t, 0.22, 'sine', 980, 180, 0.35, 0.003); noise(d, t, 0.2, 'lowpass', 2600, 500, 0.8, 0.3); },
        // roster expansion weapons
        sniper(d, t) { noise(d, t, 0.05, 'highpass', 5200, 3800, 0.9, 0.7, 0.001); tone(d, t, 0.05, 'square', 1800, 320, 0.16, 0.001); noise(d, t + 0.03, 0.55, 'bandpass', 1400, 380, 1.1, 0.16, 0.02); },
        bikeGun(d, t) { noise(d, t, 0.035, 'bandpass', 3600, 2400, 1.5, 0.3); tone(d, t, 0.025, 'square', 360, 180, 0.04); },
        twinCannon(d, t) { tone(d, t, 0.24, 'sine', 128, 40, 0.75); noise(d, t, 0.22, 'lowpass', 1500, 260, 0.8, 0.55); tone(d, t + 0.02, 0.1, 'triangle', 220, 90, 0.18); },
        salvo(d, t) { noise(d, t, 0.5, 'bandpass', 500, 3200, 2.2, 0.32, 0.02); noise(d, t, 0.12, 'lowpass', 900, 300, 0.7, 0.3); tone(d, t, 0.1, 'triangle', 140, 60, 0.14); },
        sentryGun(d, t) { noise(d, t, 0.03, 'bandpass', 3800, 2600, 1.6, 0.3); tone(d, t, 0.02, 'square', 420, 200, 0.04); },
        howitzer(d, t) { tone(d, t, 0.6, 'sine', 80, 26, 0.95); noise(d, t, 0.55, 'lowpass', 800, 110, 0.7, 0.7); noise(d, t + 0.05, 0.3, 'bandpass', 500, 160, 0.9, 0.25); },
        stalkerBlade(d, t) { tone(d, t, 0.14, 'sawtooth', 1200, 300, 0.14, 0.004); noise(d, t, 0.14, 'highpass', 4500, 2000, 0.8, 0.22, 0.01); },
        emp(d, t) { tone(d, t, 0.22, 'square', 2400, 160, 0.13, 0.002); tone(d, t + 0.02, 0.18, 'sine', 90, 50, 0.3, 0.004); noise(d, t, 0.2, 'bandpass', 3000, 700, 2.5, 0.22); },
        arc(d, t) { for (let i = 0; i < 5; i++) noise(d, t + i * 0.035 + Math.random() * 0.02, 0.05, 'bandpass', 2500 + Math.random() * 2500, 1800, 3, 0.3, 0.002); tone(d, t, 0.25, 'sawtooth', 110, 70, 0.14, 0.004); },
        obliterate(d, t) { tone(d, t, 0.32, 'sawtooth', 160, 1400, 0.12, 0.25); tone(d, t, 0.32, 'sine', 320, 2600, 0.08, 0.25); tone(d, t + 0.32, 0.6, 'sawtooth', 240, 60, 0.4, 0.004); noise(d, t + 0.32, 0.7, 'lowpass', 3400, 120, 0.7, 0.75, 0.005); tone(d, t + 0.32, 0.8, 'sine', 62, 24, 0.8, 0.01); },
        wispZap(d, t) { tone(d, t, 0.05, 'square', 2200, 900, 0.07, 0.002); },
        // support
        heal(d, t) { tone(d, t, 0.18, 'sine', 1320, 1320, 0.07, 0.01); tone(d, t + 0.07, 0.24, 'sine', 1760, 1760, 0.06, 0.01); tone(d, t, 0.3, 'triangle', 2640, 2640, 0.02, 0.02); },
        repair(d, t) { noise(d, t, 0.12, 'bandpass', 5200, 4200, 2.5, 0.12, 0.004); tone(d, t + 0.02, 0.04, 'square', 1500, 1500, 0.04, 0.002); tone(d, t + 0.09, 0.04, 'square', 1300, 1300, 0.04, 0.002); },
        stun(d, t) { tone(d, t, 0.35, 'square', 1600, 400, 0.08, 0.004); noise(d, t, 0.32, 'bandpass', 3800, 1200, 3, 0.16, 0.004); },
        income(d, t) { tone(d, t, 0.12, 'triangle', 1568, 1568, 0.07, 0.004); tone(d, t + 0.08, 0.18, 'triangle', 2093, 2093, 0.06, 0.004); },
        wall(d, t) { tone(d, t, 0.14, 'sine', 230, 80, 0.45); noise(d, t, 0.12, 'lowpass', 1400, 300, 0.8, 0.3); },
        // superweapons
        swready(d, t) { [660, 880, 1320, 1760].forEach((f, i) => tone(d, t + i * 0.09, 0.3, 'triangle', f, f, 0.22, 0.004)); tone(d, t + 0.36, 0.6, 'sine', 1760, 1760, 0.12, 0.01); },
        launch(d, t) { noise(d, t, 1.4, 'bandpass', 260, 2600, 1.4, 0.55, 0.25); tone(d, t, 1.2, 'sine', 70, 40, 0.6, 0.1); tone(d, t + 0.1, 0.9, 'sawtooth', 220, 880, 0.08, 0.3); },
        siren(d, t) { for (let i = 0; i < 4; i++) tone(d, t + i * 0.28, 0.26, 'square', i % 2 ? 620 : 860, i % 2 ? 620 : 860, 0.13, 0.01); },
        lance(d, t) { tone(d, t, 1.0, 'sine', 2600, 160, 0.45, 0.004); noise(d, t, 1.8, 'lowpass', 4200, 80, 0.6, 1.0, 0.01); tone(d, t, 1.4, 'sine', 58, 24, 1.0, 0.01); noise(d, t + 0.15, 1.0, 'bandpass', 900, 200, 0.7, 0.4); },
        rift(d, t) { tone(d, t, 0.75, 'sine', 40, 380, 0.5, 0.6); noise(d, t, 0.75, 'lowpass', 150, 3200, 0.9, 0.5, 0.6); noise(d, t + 0.78, 1.7, 'lowpass', 1500, 60, 0.6, 1.0, 0.01); tone(d, t + 0.78, 1.3, 'sine', 70, 22, 1.0, 0.01); },
        cloak(d, t) { tone(d, t, 0.25, 'triangle', 1900, 3600, 0.08, 0.02); noise(d, t, 0.25, 'highpass', 5000, 8000, 0.6, 0.05, 0.05); },
        decloak(d, t) { tone(d, t, 0.22, 'triangle', 3400, 1500, 0.08, 0.01); },
        // missions
        radio(d, t) { noise(d, t, 0.09, 'bandpass', 2400, 1800, 1.5, 0.12); tone(d, t + 0.02, 0.05, 'square', 1250, 1250, 0.07, 0.002); tone(d, t + 0.09, 0.06, 'square', 1650, 1650, 0.07, 0.002); },
        objective(d, t) { [784, 1175, 1568].forEach((f, i) => tone(d, t + i * 0.1, 0.32, 'triangle', f, f, 0.2, 0.004)); },
        objnew(d, t) { tone(d, t, 0.14, 'triangle', 660, 660, 0.18, 0.004); tone(d, t + 0.14, 0.24, 'triangle', 990, 990, 0.18, 0.004); },
        objfail(d, t) { [523, 415, 311].forEach((f, i) => tone(d, t + i * 0.16, 0.3, 'sawtooth', f, f * 0.97, 0.12, 0.01)); },
        win(d, t) { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(d, t + i * 0.12, 0.5, 'triangle', f, f, 0.24, 0.006)); },
        lose(d, t) { [440, 392, 349, 262].forEach((f, i) => tone(d, t + i * 0.2, 0.55, 'sawtooth', f, f * 0.98, 0.12, 0.01)); },
    };

    // play(name, { x, z, vol }) — x/z make it positional (quieter/panned away from the camera focus)
    function play(name, o) {
        if (muted || !ctx || ctx.state !== 'running') return;
        const fn = SOUNDS[name]; if (!fn) return;
        const now = ctx.currentTime;
        const gap = GAP[name] || 0.02;
        if (last[name] && now - last[name] < gap) return;
        if (voices > 28 && name !== 'attack' && name !== 'lowpower' && !(o && o.far)) return;
        last[name] = now;
        let vol = (o && o.vol) || 1, pan = 0;
        if (o && o.x != null) {
            const dx = o.x - listener.x, dz = o.z - listener.z, d = Math.hypot(dx, dz), r = listener.r;
            if (o.far) { vol *= d < r ? 1 : Math.max(0.35, 1 - (d - r) / (r * 4)); pan = Math.max(-0.6, Math.min(0.6, dx / (r * 2))); }
            else {
                if (d > r * 2.6) return;
                vol *= d < r ? 1 : Math.max(0, 1 - (d - r) / (r * 1.6));
                pan = dx / (r * 1.4);
                if (vol < 0.03) return;
            }
        }
        try { fn(out(vol, pan), now + 0.005); } catch (e) { /* audio graph failure is never fatal */ }
    }
    function setMuted(m) {
        muted = !!m;
        try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* storage blocked */ }
        if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.03);
    }
    function setListener(x, z, r) { listener.x = x; listener.z = z; listener.r = r || 14; }

    SF.Audio = { unlock, play, setMuted, isMuted: () => muted, setListener, sounds: Object.keys(SOUNDS) };
})();
