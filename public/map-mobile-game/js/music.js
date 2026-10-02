/**
 * Primal Hunt - adaptive music.
 *
 * A small procedural score, played with Web Audio and no files. A lookahead
 * scheduler steps through sixteenth notes at a fixed tempo, so every layer
 * stays on the beat, and each layer has its own gain that follows the game:
 *
 *   pad        always: the chords, darker with every stage (day, dusk, night)
 *   arp        exploring: a plucked arpeggio through an echo
 *   bass       once things are moving
 *   drums      as the swarm thickens: kick and hats, then snare and faster hats
 *   boss       a monster on the field: taiko toms, four-on-the-floor, brass stabs
 *   heartbeat  nearly dead: a heartbeat, and the whole score goes muffled
 *
 * Notes are only scheduled for layers that can be heard, so a quiet scene
 * costs next to nothing. `update(mood)` is called every frame with a mood
 * worked out from the game by `Music.mood(game)`.
 */
window.PH = window.PH || {};

(() => {
  const BPM = 92;
  const STEP = 60 / BPM / 4;             // one sixteenth
  const AHEAD = 0.14;                    // schedule this far ahead (s)
  const VOLUME = 0.17;                   // the score's level, under the effects
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Chords as MIDI notes (root, third, fifth), two bars each.
  const C = {
    Am: [57, 60, 64], F: [53, 57, 60], C: [48, 52, 55], G: [55, 59, 62],
    Dm: [50, 53, 57], E: [52, 56, 59], Bb: [58, 62, 65], Em: [52, 55, 59],
  };
  const PROGRESSIONS = [
    [C.Am, C.F, C.C, C.G],     // day: wide open, a little hopeful
    [C.Am, C.Dm, C.F, C.E],    // dusk: the leading tone pulls tighter
    [C.Am, C.Am, C.Bb, C.Am],  // the final night: Phrygian dread
  ];

  class Music {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.mood = { scene: 'menu', threat: 0, boss: 0, hp: 1, stage: 0, muffle: 0 };
      this.levels = {};
      this.step = 0;
      this.next = 0;
      this.timer = null;
      this.prevBoss = 0;
    }

    /** Hook into the effects' AudioContext once the browser has allowed sound. */
    attach(sfx) {
      if (this.ctx || !sfx || !sfx.context) return;
      const ctx = this.ctx = sfx.context;
      // master -> muffle filter -> the effects' music bus
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 16000;
      // A gentle compressor keeps the boss drums from clipping and the score
      // sitting under the sound effects, which share the same output.
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -20; this.comp.knee.value = 12; this.comp.ratio.value = 4;
      this.comp.attack.value = 0.008; this.comp.release.value = 0.25;
      this.master.connect(this.comp);
      this.comp.connect(this.filter);
      this.filter.connect(sfx.musicGain);
      sfx.setMusicVolume(1);

      // A soft room for everything, and an echo for the arpeggio.
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(2.6);
      const wet = ctx.createGain(); wet.gain.value = 0.32;
      this.reverb.connect(wet); wet.connect(this.master);
      this.echo = ctx.createDelay(1); this.echo.delayTime.value = STEP * 3;
      const fb = ctx.createGain(); fb.gain.value = 0.32;
      this.echo.connect(fb); fb.connect(this.echo); this.echo.connect(this.reverb);
      const echoOut = ctx.createGain(); echoOut.gain.value = 0.35; this.echo.connect(echoOut); echoOut.connect(this.master);

      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      this.bus = {};
      for (const k of ['pad', 'arp', 'bass', 'drums', 'drums2', 'boss', 'heart']) {
        const g = ctx.createGain(); g.gain.value = 0;
        g.connect(this.master);
        if (k === 'pad' || k === 'arp' || k === 'boss') g.connect(this.reverb);
        this.bus[k] = g;
        this.levels[k] = 0;
      }
      this.next = ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 25);
      this.setEnabled(this.enabled);
    }

    impulse(seconds) {
      const ctx = this.ctx, n = Math.floor(ctx.sampleRate * seconds);
      const b = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      }
      return b;
    }

    setEnabled(on) {
      this.enabled = on;
      if (!this.ctx) return;
      this.master.gain.setTargetAtTime(on ? VOLUME : 0, this.ctx.currentTime, 0.4);
    }

    /** The layers' levels for a mood, eased toward every frame. */
    update(mood, dt, at) {
      this.mood = mood;
      if (!this.ctx) return;
      const m = mood, t = at !== undefined ? at : this.ctx.currentTime;   // `at`: offline renders
      const playing = m.scene === 'play';
      const want = {
        pad: m.scene === 'over' ? 0.35 : 0.55,
        arp: m.scene === 'menu' ? 0.32 : playing ? Math.max(0.08, 0.34 - m.threat * 0.3 - m.boss * 0.2) : 0.12,
        bass: playing ? Math.min(0.5, 0.12 + m.threat * 0.6 + m.boss * 0.4) : 0,
        drums: playing ? Math.min(0.75, Math.max(0, m.threat - 0.18) * 1.6 + m.boss * 0.5) : 0,
        drums2: playing ? Math.min(0.6, Math.max(0, m.threat - 0.55) * 2) : 0,
        boss: playing ? m.boss * 0.8 : 0,
        heart: playing ? Math.max(0, (0.32 - m.hp) / 0.32) * 0.9 : 0,
      };
      for (const k in want) {
        this.levels[k] = want[k];
        this.bus[k].gain.setTargetAtTime(want[k], t, k === 'boss' || k === 'drums' ? 0.6 : 0.9);
      }
      // Muffled when nearly dead, paused, or hiding; brighter as it heats up.
      const muffle = Math.max(m.muffle || 0, playing ? Math.max(0, (0.32 - m.hp) / 0.32) * 0.85 : 0, m.scene === 'paused' ? 0.8 : 0);
      this.filter.frequency.setTargetAtTime(16000 * Math.pow(1 - muffle, 3) + 450, t, 0.25);
      // A monster arriving gets a drum fill into the next bar.
      if (m.boss > 0.5 && this.prevBoss <= 0.5) this.fillAt = this.step - (this.step % 16) + 12;
      this.prevBoss = m.boss;
    }

    schedule() {
      if (!this.ctx || this.ctx.state !== 'running') { if (this.ctx) this.next = this.ctx.currentTime + 0.05; return; }
      while (this.next < this.ctx.currentTime + AHEAD) {
        this.playStep(this.step, this.next);
        this.step++;
        this.next += STEP;
      }
    }

    playStep(step, t) {
      const L = this.levels, m = this.mood;
      const s = step % 16, bar = Math.floor(step / 16);
      const prog = PROGRESSIONS[Math.max(0, Math.min(2, m.stage | 0))];
      const chord = prog[Math.floor(bar / 2) % prog.length];
      const heat = Math.min(1, m.threat + m.boss);

      // Pad: a new chord every two bars, held across them.
      if (s === 0 && bar % 2 === 0 && L.pad > 0.01) this.pad(chord, t, STEP * 32, heat);
      // Arpeggio: up and back through the chord, an octave or two up.
      if (L.arp > 0.01) {
        const pat = [0, 1, 2, 3, 2, 1, 0, 2];
        const k = pat[s % 8], n = (k === 3 ? chord[0] + 12 : chord[k]) + 24;
        if (s % (heat > 0.6 ? 1 : 2) === 0) this.pluck(n, t, s % 4 === 0 ? 1 : 0.6);
      }
      // Bass: the root, pushing harder as it heats up.
      if (L.bass > 0.01) {
        const hits = heat > 0.55 ? [0, 2, 4, 6, 8, 10, 12, 14] : [0, 6, 8, 14];
        if (hits.includes(s)) this.bass(chord[0] - 12, t, s % 8 === 0 ? 1 : 0.7);
      }
      // Drums.
      const fill = this.fillAt !== undefined && step >= this.fillAt && step < this.fillAt + 4;
      if (fill) { this.tom(s % 2 ? 98 : 130, t, 1); if (step === this.fillAt + 3) this.fillAt = undefined; }
      if (L.drums > 0.01) {
        if (s === 0 || s === 8 || (s === 10 && heat > 0.5)) this.kick(t, 'drums');
        if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.7 : 0.4, 'drums');
      }
      if (L.drums2 > 0.01) {
        if (s === 4 || s === 12) this.snare(t);
        if (s % 2 === 1) this.hat(t, 0.3, 'drums2');
      }
      // Boss: four on the floor, taiko toms, a brass stab on each chord.
      if (L.boss > 0.01) {
        if (s % 4 === 0) this.kick(t, 'boss');
        if ([0, 3, 6, 10, 12, 14].includes(s)) this.tom(s < 8 ? 82 : 73, t, s === 0 ? 1 : 0.7, 'boss');
        if (s === 0 && bar % 2 === 0) this.brass(chord, t);
      }
      // Heartbeat: lub-dub on every beat.
      if (L.heart > 0.01 && (s % 4 === 0 || s % 4 === 1)) this.heart(t, s % 4 === 0 ? 1 : 0.6);
    }

    /* ── Instruments ───────────────────────────────────────── */

    env(gain, t, a, peak, d) {
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + a);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }

    pad(chord, t, dur, heat) {
      const ctx = this.ctx, f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = 500 + heat * 1300; f.Q.value = 0.7;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 1.2);
      g.gain.setValueAtTime(0.11, t + dur - 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.0);
      f.connect(g); g.connect(this.bus.pad);
      for (const n of [...chord, chord[0] - 12]) {
        for (const det of [-7, 7]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det;
          o.connect(f); o.start(t); o.stop(t + dur + 1.1);
        }
      }
    }

    pluck(n, t, vel) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = hz(n);
      this.env(g, t, 0.005, 0.12 * vel, 0.35);
      o.connect(g); g.connect(this.bus.arp); g.connect(this.echo);
      o.start(t); o.stop(t + 0.4);
    }

    bass(n, t, vel) {
      const ctx = this.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = hz(n);
      f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(160, t + 0.25);
      this.env(g, t, 0.01, 0.32 * vel, STEP * 1.8);
      o.connect(f); f.connect(g); g.connect(this.bus.bass);
      o.start(t); o.stop(t + STEP * 2);
    }

    kick(t, bus) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      this.env(g, t, 0.003, 0.9, 0.28);
      o.connect(g); g.connect(this.bus[bus]);
      o.start(t); o.stop(t + 0.32);
    }

    noiseHit(t, type, freq, q, peak, dur, bus) {
      const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.noise;
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      this.env(g, t, 0.002, peak, dur);
      src.connect(f); f.connect(g); g.connect(this.bus[bus]);
      src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    }

    hat(t, vel, bus) { this.noiseHit(t, 'highpass', 7500, 0.8, 0.14 * vel, 0.05, bus); }
    snare(t) {
      this.noiseHit(t, 'bandpass', 1900, 0.9, 0.42, 0.16, 'drums2');
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
      this.env(g, t, 0.002, 0.2, 0.1); o.connect(g); g.connect(this.bus.drums2); o.start(t); o.stop(t + 0.14);
    }

    tom(freq, t, vel, bus = 'drums') {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(freq * 1.6, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
      this.env(g, t, 0.004, 0.7 * vel, 0.45);
      o.connect(g); g.connect(this.bus[bus === 'drums' && this.levels.drums < 0.05 ? 'boss' : bus]);
      o.start(t); o.stop(t + 0.5);
      this.noiseHit(t, 'lowpass', 900, 0.5, 0.25 * vel, 0.12, bus === 'drums' && this.levels.drums < 0.05 ? 'boss' : bus);
    }

    brass(chord, t) {
      const ctx = this.ctx, f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.08); f.frequency.exponentialRampToValueAtTime(500, t + 0.9);
      this.env(g, t, 0.03, 0.16, 1.1);
      f.connect(g); g.connect(this.bus.boss);
      for (const n of [chord[0] - 12, chord[0], chord[2]]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n);
        o.connect(f); o.start(t); o.stop(t + 1.2);
      }
    }

    heart(t, vel) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
      this.env(g, t, 0.004, 0.9 * vel, 0.18);
      o.connect(g); g.connect(this.bus.heart);
      o.start(t); o.stop(t + 0.22);
    }
  }

  /**
   * How the game feels right now, for the score: the scene, how threatening
   * it is (0..1), whether a monster is on the field, your health, the stage
   * (which picks the harmony) and how muffled it should sound.
   */
  Music.mood = (game) => {
    const st = game.state;
    const m = { scene: 'menu', threat: 0, boss: 0, hp: 1, stage: 0, muffle: 0 };
    if (st === 'menu') return m;
    m.scene = st === 'paused' ? 'paused' : st === 'over' ? 'over' : 'play';
    if (game.mode === 'monster') {
      // You are the monster: the hunters are the threat.
      const pl = game.player;
      m.hp = pl ? pl.hp / pl.maxHp : 1;
      m.stage = Math.max(0, (game.stage || 1) - 1);
      let near = Infinity;
      for (const h of game.hunters || []) if (h.state === 'up') near = Math.min(near, Math.hypot(h.x - pl.x, h.z - pl.z));
      m.threat = Math.min(1, (game.spotted ? 0.55 : 0.1) + Math.max(0, 1 - near / 18) * 0.45);
      m.boss = game.spotted && near < 12 ? 0.7 : 0;
      m.muffle = pl && pl.hidden ? 0.55 : 0;
    } else if (game.mode === 'hunt') {
      const me = game.me, mon = game.mon;
      m.hp = me ? Math.max(0, me.hp / me.maxHp) : 1;
      m.stage = Math.max(0, (game.stage || 1) - 1);
      const visible = game.monView && !game.monView.hidden;
      const d = me && mon ? Math.hypot(mon.x - me.x, mon.z - me.z) : 99;
      m.threat = Math.min(1, (visible ? 0.5 : 0.15) + Math.max(0, 1 - d / 20) * 0.4);
      m.boss = visible ? 1 : 0;
    } else {
      const pl = game.player;
      m.hp = pl ? pl.hp / pl.maxHp : 1;
      m.stage = Math.min(2, game.bossKills || 0);
      m.threat = Math.min(1, (game.aliveEnemies || 0) / 140);
      m.boss = (game.bosses && game.bosses.length) ? 1 : 0;
    }
    return m;
  };

  PH.Music = new Music();
  PH.MusicEngine = Music;
})();
