/**
 * Primal Hunt - online co-op Hunter Squad.
 *
 * Up to four friends, each a hunter, against the AI monster (AI hunters fill
 * any empty places in the squad) - or one friend plays the monster against
 * the rest. The host's device runs the real game (HuntGame); everyone else
 * runs a mirror of it: CoopClient for a hunter, CoopMonsterClient for the
 * monster.
 *
 * Who decides what:
 *   - each player's device moves its own hunter, so steering feels instant,
 *     and sends where it is ~20 times a second. A player monster is the same
 *     while it walks or pounces; its specials (leap, roll, warp, dive) and
 *     evolving are the host's to run, and `mseq` counts each time the host
 *     moved it, so a stale position from the guest cannot undo a leap;
 *   - the host runs everything else - the monster, the AI hunters, damage,
 *     specials, deaths - and sends a snapshot ~15 times a second;
 *   - effects (bursts, explosions, lightning...) and messages (banners,
 *     toasts, damage numbers, sounds) are recorded as the host's game makes
 *     them and replayed on every guest.
 *
 * The guest's mirror (CoopClient) has the fields the renderer and the HUD
 * read from a HuntGame, so both work on it unchanged.
 */
window.PH = window.PH || {};

(() => {
  const SNAP_EVERY = 1 / 15, SEND_EVERY = 1 / 20;
  const r2 = (v) => Math.round(v * 100) / 100;
  const STATES = ['up', 'down', 'dead', 'waiting'];
  const VIS = ['bolt', 'pellet', 'harpoon', 'orb'];
  const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

  // The renderer's effect calls a guest should see too. Anything that sets up
  // the scene (players, bosses, the arena) is done by the guest itself.
  const FX = new Set(['burst', 'ring', 'explosion', 'shockwave', 'lightningChain', 'bossSlam', 'bossDeath', 'dashTrail', 'muzzle',
    'impact', 'birds', 'bossArrival', 'glow', 'strike', 'decal', 'zoomPunch']);

  /** Wrap the renderer: everything still draws locally, and effects are logged for the guests. */
  const recorder = (render, log) => new Proxy(render, {
    get(target, name) {
      const v = target[name];
      if (typeof v !== 'function') return v;
      if (FX.has(name)) return (...args) => { log.push([name, ...args.map((a) => (typeof a === 'number' ? r2(a) : a))]); return v.apply(target, args); };
      if (name === 'enemyDeath') return (e) => { log.push(['enemyDeath', { x: r2(e.x), z: r2(e.z), type: e.type, scale: e.scale, facing: r2(e.facing || 0), elite: e.elite }]); return v.call(target, e); };
      if (name === 'flashBoss') return (id) => { log.push(['flashMon']); return v.call(target, id); };
      return v.bind(target);
    },
  });

  /* ── Host ─────────────────────────────────────────────────── */

  class CoopHunt extends PH.HuntGame {
    constructor(render, hooks, room) {
      super(render, hooks);
      this.coop = true;
      this.room = room;
      this.fxLog = [];
      this.evLog = [];
      this.fx = recorder(render, this.fxLog);
      this.snapT = 0;
      this.trackSent = 0;
      this.onRemoteHurt = (h, dmg) => this.room.send(h.remote, { t: 'hurt', dmg: r2(dmg) });
    }

    /**
     * players: [{ pid, name, cls, host }] - the host's own entry has host: true.
     * AI hunters fill the squad up to four from the classes nobody picked.
     */
    startCoop(players, seed) {
      const me = players.find((p) => p.host);
      const beast = players.find((p) => p.cls === 'monster' && !p.host);
      const hunters = players.filter((p) => p !== beast);
      const taken = hunters.map((p) => p.cls);
      const fill = ['assault', 'trapper', 'medic', 'support', 'ranger'].filter((c) => !taken.includes(c));
      const squad = [...taken, ...fill].slice(0, 4);
      this.players = players;
      // A friend playing the monster steers it; otherwise the AI does.
      this.monPid = beast ? beast.pid : null;
      this.aiMonster = !beast;
      this.monInput = { x: 0, z: 0 };
      this.mseq = 0;
      this.mutWait = null;
      this.newRun(me.cls, seed, { squad, name: me.name, humans: hunters.filter((p) => !p.host),
        monster: beast && PH.MONSTERS[beast.mtype] ? beast.mtype : undefined });
      if (beast) this.ownToast(`🦖 ${beast.name} is playing the monster`);
      // Tell everyone what this hunt is; each guest builds its own scene from it.
      for (const p of players) {
        if (p.host) continue;
        const mine = this.hunters.find((h) => h.remote === p.pid);
        this.room.send(p.pid, { t: 'start', setup: {
          seed, monsterType: this.monsterType, biome: this.biomeId, arena: PH.MONSTER_MODE.arena,
          grass: this.grass.map((g) => [r2(g.x), r2(g.z), r2(g.r)]),
          hunters: this.hunters.map((h) => ({ id: h.id, cls: h.cls, name: h.name || null, pid: h.remote || null, host: h === this.me })),
          me: mine ? mine.id : null,
          monster: p === beast, monName: beast ? beast.name : null,
          mon: [r2(this.mon.x), r2(this.mon.z), r2(this.mon.facing), r2(this.mon.radius)],
        } });
      }
      this.trackSent = 0;
    }

    banner(text, kind) { this.evLog.push(['banner', text, kind]); super.banner(text, kind); }
    toast(text) { this.evLog.push(['toast', text]); super.toast(text); }
    sfx(n) { if (n !== 'shoot' && n !== 'hit') this.evLog.push(['sfx', n]); super.sfx(n); }
    damageMonster(dmg) {
      const before = this.mon.hp + this.mon.armor;
      super.damageMonster(dmg);
      const dealt = before - (this.mon.hp + this.mon.armor);
      if (dealt > 0) this.evLog.push(['dmg', r2(this.mon.x), r2(this.mon.z), Math.round(dealt), dealt >= 40]);
    }

    /** A message from a guest. */
    onPeer(pid, m) {
      if (pid === this.monPid) return this.onMonsterPeer(m);
      const h = this.hunters.find((o) => o.remote === pid);
      if (!h) return;
      if (m.t === 'me') { h.netX = m.x; h.netZ = m.z; h.netF = m.f; }
      // Their button lights up a snapshot before ours reaches zero: allow for that.
      else if (m.t === 'ability') { if (h.abilityCd < 0.35) h.abilityCd = 0; this.useAbilityFor(h); }
      else if (m.t === 'dodge') { if (h.dodgeCd < 0.35) h.dodgeCd = 0; this.dodgeFor(h, { x: m.x || 0, z: m.z || 0 }); }
    }

    /** The player monster's moves. `x`/`z` with a special or a pounce is where it aims. */
    onMonsterPeer(m) {
      const pl = this.mon, inp = this.monInput;
      if (m.t === 'me') {
        if ((m.q | 0) >= this.mseq) { pl.netX = m.x; pl.netZ = m.z; pl.netF = m.f; }
      } else if (m.t === 'ability' || m.t === 'dodge') {
        inp.x = m.x || 0; inp.z = m.z || 0;
        if (m.t === 'ability') {
          if (this.monAbilityCd < 0.35) this.monAbilityCd = 0;
          // From here the host moves it, until the guest has seen where it ended up.
          if (this.monsterAbility()) { this.mseq++; pl.netX = null; }
        } else {
          if (this.monDodgeCd < 0.35) this.monDodgeCd = 0;
          this.monsterPounce();
        }
        inp.x = 0; inp.z = 0;
      } else if (m.t === 'evolve') this.monsterEvolve();
      else if (m.t === 'mut') this.pickMutation(m.id);
    }

    /** A player monster picks its own mutation, and the hunt does not wait long for it. */
    offerMutations() {
      if (!this.monPid) return super.offerMutations();
      const choices = this.mutationChoices();
      if (!choices.length) return;
      this.mutWait = { choices, until: this.time + 9 };
      this.room.send(this.monPid, { t: 'mut', choices });
    }

    pickMutation(id) {
      const W = this.mutWait;
      if (!W) return;
      this.mutWait = null;
      const c = W.choices.find((o) => o.id === id) || W.choices[Math.floor(Math.random() * W.choices.length)];
      this.applyMutation(c.id);
      this.toast(`🧬 It mutated: ${PH.MUTATIONS[c.id].name}`);
      this.fx.burst(this.mon.x, 1.5, this.mon.z, 30, 0x7dff9a, 3, 0.4, 0.8, -2, 0.8);
      if (this.monPid && c.id !== id) this.room.send(this.monPid, { t: 'mutdone', id: c.id });
    }

    /** A guest left: their hunter (or the monster) carries on under the AI. */
    dropPeer(pid) {
      if (pid === this.monPid) {
        this.monPid = null;
        this.aiMonster = true;
        this.mon.netX = null;
        if (this.mutWait) this.pickMutation(null);
        this.toast('The monster player left - the AI takes over');
        return;
      }
      const h = this.hunters.find((o) => o.remote === pid);
      if (!h) return;
      h.controlled = false; h.remote = null;
      this.toast(`${h.name || 'A hunter'} left - the AI takes over`);
    }

    update(dt) {
      super.update(dt);
      if (this.mutWait && this.time > this.mutWait.until) this.pickMutation(null);
      this.snapT -= dt;
      if (this.snapT <= 0) { this.snapT = SNAP_EVERY; this.sendSnap(); }
    }

    sendSnap() {
      const R = this.room;
      if (!R || !R.peers.size) { this.fxLog.length = 0; this.evLog.length = 0; return; }
      const mon = this.mon, T = this.team;
      const tracks = this.tracks.filter((k) => k.t > this.trackSent);
      if (tracks.length) this.trackSent = tracks[tracks.length - 1].t;
      R.broadcast({
        t: 's', time: r2(this.time), st: this.state, stage: this.stage, food: Math.round(this.food), rev: this.revealed ? 1 : 0,
        sp: this.spotted ? 1 : 0, tag: this.tagT > 0 ? 1 : 0, mcd: r2(this.monAbilityCd),
        mon: [r2(mon.x), r2(mon.z), r2(mon.facing), mon.moving ? 1 : 0, r2(mon.lift || 0), Math.round(mon.hp), Math.round(mon.maxHp), Math.round(mon.armor),
          Math.round(mon.maxArmor), r2(mon.radius), r2(mon.evolveT), r2(mon.attackT), r2(mon.leapT), r2(mon.rollT), r2(mon.diveT || 0), r2(mon.dashT)],
        team: [T.known ? [r2(T.known.x), r2(T.known.z), r2(T.known.t)] : 0, r2(T.respawnAt || 0)],
        H: this.hunters.map((h) => [h.id, r2(h.x), r2(h.z), r2(h.facing), h.moving ? 1 : 0, STATES.indexOf(h.state), Math.round(h.hp), h.maxHp,
          r2(h.flash || 0), r2(h.shieldT || 0), r2(h.downT || 0), r2(h.reviveT || 0), r2(h.abilityCd || 0), r2(h.abilityMax || 0), r2(h.overdrive || 0)]),
        E: this.enemies.filter((e) => e.alive).map((e) => [e.idx, e.type, r2(e.x), r2(e.z), r2(e.facing), r2(e.flash || 0)]),
        P: this.projectiles.filter((p) => p.alive).map((p) => [r2(p.x), r2(p.z), r2(p.vx), r2(p.vz), VIS.indexOf(p.vis)]),
        T: this.telegraphs.map((t) => [t.shape === 'rect' ? 1 : 0, r2(t.x), r2(t.z), r2(t.r || 0), r2(t.w || 0), r2(t.len || 0), r2(t.angle || 0), r2(t.t), r2(t.dur), t.color || 0, t.monster ? 1 : 0, t.strike ? 1 : 0]),
        Z: this.zones.map((z) => [z.kind, r2(z.x), r2(z.z), r2(z.r), r2(z.t), r2(z.dur)]),
        B: this.beams.map((b) => [r2(b.ax), r2(b.az), r2(b.bx), r2(b.bz)]),
        F: this.fireTrail.map((f) => [r2(f.x), r2(f.z), r2(f.life), r2(f.r || 1.1)]),
        K: tracks.map((k) => [r2(k.x), r2(k.z), r2(k.angle), r2(k.t)]),
        // What only the monster's own HUD needs.
        mx: this.monPid ? [r2(this.monDodgeCd), r2(this.monAbilityMax), mon.hidden ? 1 : 0, this.huntersKilled, this.eaten, r2(mon.slowT || 0), r2(mon.slowK || 0),
          this.mseq, [...this.muts]] : 0,
      }, true);
      if (this.fxLog.length || this.evLog.length) {
        R.broadcast({ t: 'ev', fx: this.fxLog.splice(0), ev: this.evLog.splice(0) });
      }
    }

    end(monsterWon, how) {
      const was = this.state;
      super.end(monsterWon, how);
      if (was === 'over' || !this.room) return;
      if (this.monPid) {
        const won = !!monsterWon, score = Math.round(this.eaten * 5 + this.huntersKilled * 400 + (this.stage - 1) * 500 + Math.floor(this.time) * 2
          + (won ? (how === 'apex' ? 3000 : 1500) : 0));
        this.room.send(this.monPid, { t: 'end', result: { mode: 'monster', victory: won, how, time: this.time, stage: this.stage, huntersKilled: this.huntersKilled,
          eaten: this.eaten, score, monsterType: this.monsterType, biome: this.biomeId, mutations: this.muts.size, coop: true } });
      }
      for (const h of this.hunters) {
        if (!h.remote) continue;
        this.room.send(h.remote, { t: 'end', result: { mode: 'hunt', victory: !monsterWon, how, time: this.time, stage: this.stage, monsterType: this.monsterType,
          cls: h.cls, downs: h.downs || 0, huntersLost: this.huntersKilled, score: this.score(), biome: this.biomeId, coop: true } });
      }
    }
  }

  /* ── Guest ────────────────────────────────────────────────── */

  /**
   * A mirror of the host's hunt. It moves its own hunter itself (and tells
   * the host), and eases everything else toward the host's latest snapshot.
   */
  class CoopClient {
    constructor(render, hooks, room) {
      this.mode = 'hunt';
      this.coop = true;
      this.fx = render;
      this.hooks = hooks;
      this.room = room;
      this.state = 'menu';
      this.input = { x: 0, z: 0 };
      this.gems = []; this.pickups = []; this.lobs = []; this.mines = []; this.droneHits = [];
      this.enemies = Array.from({ length: PH.MONSTER_MODE.wildlife.max }, (_, i) => ({ alive: false, idx: i }));
      this.projectiles = [];
      this.hunters = []; this.telegraphs = []; this.zones = []; this.beams = []; this.tracks = []; this.fireTrail = []; this.grass = [];
      this.stage = 1; this.time = 0; this.food = 0;
      this.team = { known: null, respawnAt: 0, landed: true };
    }

    // What the HUD and renderer read, as on a HuntGame.
    get player() { return this.me; }
    get abilityCd() { return this.me ? this.me.abilityCd : 0; }
    get abilityMax() { return this.me ? this.me.abilityMax || 1 : 1; }
    get dodgeCd() { return this.me ? this.me.dodgeCd : 0; }
    get bosses() { return this.monView && this.state !== 'menu' ? [this.monView] : []; }
    get overdrive() { return this.me ? this.me.overdrive : 0; }
    get bossKills() { return this.state === 'menu' ? 0 : this.stage - 1; }
    get monAbilityCd() { return this.mcd || 0; }
    get myClass() { return this.me ? this.me.cls : 'assault'; }
    fieldRadius() { return 0; }
    stageDef() { return PH.MONSTER_MODE.stages[this.stage - 1]; }
    def() { return PH.MONSTERS[this.monsterType]; }
    abilityReady() { return this.abilityCd <= 0; }
    evolve() { return false; }
    canEvolve() { return false; }

    /** The host's setup message: build the scene for this hunt. */
    start(S) {
      PH.World.set(S.biome);
      this.monsterType = S.monsterType;
      this.biomeId = S.biome;
      this.grass = S.grass.map(([x, z, r]) => ({ x, z, r }));
      this.stage = 1; this.time = 0; this.food = 0; this.revealed = false; this.spotted = false; this.tag = false;
      this.tracks = []; this.telegraphs = []; this.zones = []; this.beams = []; this.fireTrail = []; this.projectiles = [];
      for (const e of this.enemies) e.alive = false;
      this.hunters = S.hunters.map((h) => ({ id: h.id, cls: h.cls, name: h.name, pid: h.pid, host: h.host, controlled: h.id === S.me,
        x: 0, z: 0, tx: 0, tz: 0, facing: 0, moving: false, state: 'up', hp: 100, maxHp: 100, flash: 0, shieldT: 0, downT: 0, reviveT: 0,
        abilityCd: 3, abilityMax: PH.HUNT_MODE.abilities[h.cls].cd, dodgeCd: 0, overdrive: 0, dashT: 0, dashX: 0, dashZ: 1, iframes: 0, downs: 0, lastState: 'up' }));
      this.me = this.hunters.find((h) => h.id === S.me) || null;
      const [mx, mz, mf, mr] = S.mon || [0, 0, 0, 1];
      this.mon = { x: mx, z: mz, tx: mx, tz: mz, facing: mf, moving: false, lift: 0, hp: 1, maxHp: 1, armor: 0, maxArmor: 1, radius: mr, evolveT: 0,
        leapT: 0, rollT: 0, diveT: 0, dashT: 0, dashX: 0, dashZ: 1, attackT: 0, hidden: false };
      this.monView = { id: 1, x: mx, z: mz, facing: mf, moving: false, radius: mr, lift: 0, hidden: true };
      this.mvStage = 1;
      const F = this.fx;
      F.clearRun();
      F.setWorld && F.setWorld(S.biome);
      F.setMonsterMode(true, this.grass, S.arena);
      this.setupScene(S);
      this.sendT = 0;
      this.snapAt = 0;
      this.state = 'playing';
      if (S.monName && !S.monster) this.hooks.onToast && this.hooks.onToast(`🦖 ${S.monName} is playing the monster`);
    }

    setupScene() {
      const F = this.fx;
      F.setPlayer(this.me.cls);
      F.setHunters(this.hunters.filter((h) => h !== this.me));
      F.addBoss(1, this.monsterType, 1);
      F.setViewScale(1.2);
    }

    /** It evolved: swap in the new model. */
    onStage() {
      this.fx.removeBoss(this.monView.id);
      this.monView.id++;
      this.fx.addBoss(this.monView.id, this.monsterType, this.stage);
    }

    /** A snapshot from the host. */
    snap(s) {
      this.time = s.time; this.stage = s.stage; this.food = s.food; this.spotted = !!s.sp; this.tag = !!s.tag; this.mcd = s.mcd;
      if (s.rev && !this.revealed) this.revealed = true;
      const M = s.mon, mon = this.mon;
      Object.assign(mon, { tx: M[0], tz: M[1], facing: M[2], moving: !!M[3], lift: M[4], hp: M[5], maxHp: M[6], armor: M[7], maxArmor: M[8],
        radius: M[9], evolveT: M[10], attackT: M[11], leapT: M[12], rollT: M[13], diveT: M[14], dashT: M[15] });
      if (this.snapAt === 0) { mon.x = mon.tx; mon.z = mon.tz; }
      this.team.known = s.team[0] ? { x: s.team[0][0], z: s.team[0][1], t: s.team[0][2] } : null;
      this.team.respawnAt = s.team[1];
      for (const a of s.H) {
        const h = this.hunters.find((o) => o.id === a[0]);
        if (!h) continue;
        const was = h.state;
        h.state = STATES[a[5]]; h.hp = a[6]; h.maxHp = a[7]; h.flash = a[8]; h.shieldT = a[9]; h.downT = a[10]; h.reviveT = a[11];
        if (h === this.me) {
          // Our own hunter: the host decides health, state and the special's cooldown; we decide where we are.
          h.abilityCd = a[12]; h.abilityMax = a[13] || h.abilityMax; h.overdrive = a[14];
          if (h.state !== 'up' || this.snapAt === 0 || dist2(h.x, h.z, a[1], a[2]) > 36) { h.x = a[1]; h.z = a[2]; }   // downed, respawned or knocked far
          if (was !== h.state) this.ownState(was, h.state);
        } else {
          h.tx = a[1]; h.tz = a[2]; h.facing = a[3]; h.moving = !!a[4];
          if (this.snapAt === 0 || dist2(h.x, h.z, a[1], a[2]) > 64) { h.x = a[1]; h.z = a[2]; }
        }
      }
      const seen = new Set();
      for (const a of s.E) {
        const e = this.enemies[a[0]];
        if (!e) continue;
        seen.add(e);
        const def = PH.ENEMIES[a[1]];
        if (!e.alive || e.type !== a[1]) Object.assign(e, { alive: true, type: a[1], x: a[2], z: a[3], scale: 1, elite: false, radius: def.radius, phase: Math.random() * 6.3 });
        e.tx = a[2]; e.tz = a[3]; e.facing = a[4]; e.flash = a[5];
      }
      for (const e of this.enemies) if (e.alive && !seen.has(e)) e.alive = false;
      this.projectiles = s.P.map((p) => ({ alive: true, x: p[0], z: p[1], vx: p[2], vz: p[3], vis: VIS[p[4]] || 'bolt', r: 1, g: 1, b: 1 }));
      this.telegraphs = s.T.map((t) => ({ shape: t[0] ? 'rect' : 'circle', x: t[1], z: t[2], r: t[3], w: t[4], len: t[5], angle: t[6], t: t[7], dur: t[8], color: t[9] || undefined, monster: !!t[10], strike: !!t[11] }));
      this.zones = s.Z.map((z) => ({ kind: z[0], x: z[1], z: z[2], r: z[3], t: z[4], dur: z[5] }));
      this.beams = s.B.map((b) => ({ ax: b[0], az: b[1], bx: b[2], bz: b[3] }));
      this.fireTrail = s.F.map((f) => ({ x: f[0], z: f[1], life: f[2], r: f[3] }));
      for (const k of s.K) this.tracks.push({ x: k[0], z: k[1], angle: k[2], t: k[3] });
      while (this.tracks.length && this.time - this.tracks[0].t > PH.MONSTER_MODE.trackLife) this.tracks.shift();
      if (this.stage !== this.mvStage) { this.mvStage = this.stage; this.onStage(); }
      if (s.st === 'over' && this.state === 'playing') this.state = 'ending';
      this.snapAt = performance.now();
    }

    ownState(was, now) {
      const T = (t) => this.hooks.onToast && this.hooks.onToast(t);
      if (now === 'down') { this.me.downs++; T('You are down - a teammate is coming'); }
      if (now === 'up' && was === 'down') T('Back on your feet');
      if (now === 'dead') T('You died - the dropship will bring you back');
    }

    /** Effects and messages from the host. */
    events(m) {
      const F = this.fx;
      for (const c of m.fx || []) {
        const [name, ...args] = c;
        if (name === 'flashMon') { if (this.mode === 'monster') F.flashPlayer && F.flashPlayer(); else F.flashBoss && F.flashBoss(this.monView.id); }
        else if (typeof F[name] === 'function') { try { F[name](...args); } catch { /* an effect we cannot replay */ } }
      }
      for (const e of m.ev || []) {
        if (e[0] === 'banner') this.banner(e[1], e[2]);
        else if (e[0] === 'toast') this.toast(e[1]);
        else if (e[0] === 'sfx') this.hooks.sfx && this.hooks.sfx(e[1]);
        else if (e[0] === 'dmg' && this.mode !== 'monster' && !this.monView.hidden) this.hooks.onDamage && this.hooks.onDamage(e[1], 2.6, e[2], e[3], e[4]);
      }
    }

    // Banners and toasts read from the hunters' side, and "THE MEDIC IS DOWN" is "YOU" when it is you.
    banner(text, kind) {
      const me = this.myClass.toUpperCase();
      if (text.startsWith(me + ' ')) text = text.replace(me + ' IS DOWN', 'YOU ARE DOWN').replace(me + ' KILLED', 'YOU WERE KILLED').replace(me + ' BLED OUT', 'YOU BLED OUT');
      const t = PH.HuntGame.retell(text);
      if (t) this.hooks.onBanner && this.hooks.onBanner(t, kind);
    }
    toast(text) {
      const t = PH.HuntGame.retell(text);
      if (t && !/^You revived/.test(t)) this.hooks.onToast && this.hooks.onToast(t);
    }

    hurt(dmg) {
      if (this.hooks.onPlayerHit) this.hooks.onPlayerHit(dmg);
      this.fx.addShake(0.25);
    }

    monsterVisible() {
      const mon = this.mon, me = this.me;
      if (this.spotted || this.tag || mon.evolveT > 0 || this.zones.some((z) => z.kind === 'arena')) return true;
      return me && (me.state === 'up' || me.state === 'down') && dist2(me.x, me.z, mon.x, mon.z) < PH.HUNT_MODE.seeClose ** 2;
    }

    update(dt) {
      if (this.state !== 'playing' && this.state !== 'ending') return;
      this.moveOwn(dt);
      const k = 1 - Math.exp(-dt * 12);
      this.easeMonster(k);
      // Everything else eases toward the host's latest word.
      for (const h of this.hunters) if (h !== this.me) { h.x += (h.tx - h.x) * k; h.z += (h.tz - h.z) * k; if (h.flash > 0) h.flash -= dt; }
      for (const e of this.enemies) if (e.alive && e.tx !== undefined) { e.x += (e.tx - e.x) * k; e.z += (e.tz - e.z) * k; if (e.flash > 0) e.flash -= dt; }
      for (const p of this.projectiles) { p.x += p.vx * dt; p.z += p.vz * dt; }
      for (const t of this.telegraphs) t.t += dt;
      for (const z of this.zones) z.t += dt;
      for (const f of this.fireTrail) f.life -= dt;
      this.time += dt;
    }

    /** Our own hunter, moved here. */
    moveOwn(dt) {
      const me = this.me, H = PH.HUNT_MODE, inp = this.input, mon = this.mon;
      // Our own hunter, moved here.
      me.dodgeCd = Math.max(0, me.dodgeCd - dt);
      me.abilityCd = Math.max(0, me.abilityCd - dt);
      if (me.iframes > 0) me.iframes -= dt;
      const ox = me.x, oz = me.z;
      if (me.state === 'up') {
        if (me.dashT > 0) {
          const v = H.dodge.dist / H.dodge.dur;
          me.dashT -= dt;
          me.x += me.dashX * v * dt; me.z += me.dashZ * v * dt;
        } else {
          const mag = Math.min(1, Math.hypot(inp.x, inp.z));
          if (mag > 0.08) {
            const k = H.speed * mag / Math.hypot(inp.x, inp.z);
            me.x += inp.x * k * dt; me.z += inp.z * k * dt;
            me.facing = Math.atan2(inp.x, inp.z);
          }
        }
        const pd = Math.hypot(me.x - mon.x, me.z - mon.z) || 0.001, minD = mon.radius + 0.55;
        if (pd < minD) { me.x = mon.x + (me.x - mon.x) / pd * minD; me.z = mon.z + (me.z - mon.z) / pd * minD; }
        const R = PH.MONSTER_MODE.arena - 0.45, d = Math.hypot(me.x, me.z);
        if (d > R) { me.x *= R / d; me.z *= R / d; }
        for (const z of this.zones) {
          // The trapper's dome holds everyone in, hunters too.
          if (z.kind !== 'arena') continue;
          const dx = me.x - z.x, dz = me.z - z.z, dd = Math.hypot(dx, dz), RR = z.r - 0.45;
          if (dd > RR && dist2(ox, oz, z.x, z.z) <= RR * RR + 0.01) { me.x = z.x + dx / dd * RR; me.z = z.z + dz / dd * RR; }
        }
      }
      me.moving = Math.hypot(me.x - ox, me.z - oz) > 0.001;
      const visible = this.monsterVisible();
      if (!me.moving && visible) me.facing = Math.atan2(mon.x - me.x, mon.z - me.z);
      this.sendT -= dt;
      if (this.sendT <= 0) { this.sendT = SEND_EVERY; this.room.toHost({ t: 'me', x: r2(me.x), z: r2(me.z), f: r2(me.facing) }, true); }
    }

    /** The monster, as a boss that eases toward the host's word and shows when the squad can see it. */
    easeMonster(k) {
      const mon = this.mon, v = this.monView;
      mon.x += (mon.tx - mon.x) * k; mon.z += (mon.tz - mon.z) * k;
      Object.assign(v, { x: mon.x, z: mon.z, facing: mon.facing, moving: mon.moving || mon.evolveT > 0, radius: mon.radius, lift: mon.lift,
        attackT: mon.attackT, leapT: mon.leapT, rollT: mon.rollT, evolveT: mon.evolveT, dashT: mon.dashT, diveT: mon.diveT });
      v.hidden = !this.monsterVisible();
      if (!v.hidden && !this.shownName) {
        this.shownName = true;
        this.banner(`IT'S A ${PH.MONSTERS[this.monsterType].name.toUpperCase()}`, 'boss');
      }
    }

    useAbility() {
      const me = this.me;
      if (!me || me.state !== 'up' || me.abilityCd > 0) return false;
      this.room.toHost({ t: 'ability' });
      return true;
    }

    dodge() {
      const me = this.me, D = PH.HUNT_MODE.dodge;
      if (!me || me.state !== 'up' || me.dodgeCd > 0) return false;
      const inp = this.input, mon = this.mon;
      let dx = inp.x, dz = inp.z, m = Math.hypot(dx, dz);
      if (m < 0.08) {
        const ax = me.x - mon.x, az = me.z - mon.z, ad = Math.hypot(ax, az);
        if (ad < 10 && ad > 0.01) { dx = ax / ad; dz = az / ad; } else { dx = Math.sin(me.facing); dz = Math.cos(me.facing); }
        m = 1;
      }
      me.dashX = dx / m; me.dashZ = dz / m; me.dashT = D.dur; me.dodgeCd = D.cd; me.iframes = D.iframes;
      me.facing = Math.atan2(me.dashX, me.dashZ);
      this.fx.dashTrail(me.x, me.z, me.dashX, me.dashZ, D.dist);
      this.hooks.sfx && this.hooks.sfx('dash');
      this.room.toHost({ t: 'dodge', x: r2(me.dashX), z: r2(me.dashZ) });
      return true;
    }
  }

  /**
   * The mirror for the friend who plays the monster: monster mode's HUD and
   * camera, the hunters as the host has them. It walks and pounces the
   * monster itself; for a special or an evolution it hands the monster to the
   * host and follows it until it lands.
   */
  class CoopMonsterClient extends CoopClient {
    constructor(render, hooks, room) {
      super(render, hooks, room);
      this.mode = 'monster';
      this.muts = new Set();
      this.huntersKilled = 0; this.eaten = 0;
    }

    get player() { return this.mon; }
    get abilityCd() { return this.monCd || 0; }
    get abilityMax() { return this.monMax || 1; }
    get dodgeCd() { return this.monDodge || 0; }
    get bosses() { return []; }
    get overdrive() { return 0; }
    abilityReady() { return this.abilityCd <= 0; }
    mut(id) { return this.muts.has(id) ? PH.MUTATIONS[id] : null; }
    busy() { const m = this.mon; return m.evolveT > 0 || m.leapT > 0 || m.rollT > 0 || m.diveT > 0; }
    canEvolve() {
      return this.state === 'playing' && this.stage < 3 && this.food >= this.stageDef().food && !this.busy() && !(this.evolveAsk > 0);
    }

    start(S) {
      this.muts = new Set();
      this.huntersKilled = 0; this.eaten = 0;
      this.monCd = 2; this.monMax = PH.MONSTERS[S.monsterType].ability.cd; this.monDodge = 0;
      this.mseq = 0; this.followT = 0; this.driven = false; this.evolveAsk = 0; this.slowT = 0; this.slowK = 0;
      super.start(S);
    }

    setupScene() {
      const vis = this.fx.setPlayerMonster(this.monsterType, 1);
      this.mon.radius = Math.min(1.5, Math.max(0.8, vis.radius * 0.85));
      this.fx.setHunters(this.hunters);
      this.fx.setViewScale(this.stageDef().view);
    }

    onStage() {
      this.fx.setPlayerMonster(this.monsterType, this.stage);
      this.fx.setViewScale(this.stageDef().view);
    }

    snap(s) {
      const mon = this.mon, own = { x: mon.x, z: mon.z, facing: mon.facing, moving: mon.moving, dashT: mon.dashT };
      const first = this.snapAt === 0;
      super.snap(s);
      this.monCd = s.mcd;
      const X = s.mx;
      if (X) {
        this.monDodge = Math.max(this.monDodge, X[0]); this.monMax = X[1] || this.monMax; mon.hidden = !!X[2];
        this.huntersKilled = X[3]; this.eaten = X[4]; this.slowT = X[5]; this.slowK = X[6];
        if (X[7] !== this.mseq) { this.mseq = X[7]; this.followT = 0.2; }   // the host moved it: catch up first
        this.muts = new Set(X[8]);
      }
      // Walking, the monster is ours: keep where we have it, not where the host last heard.
      if (!first && !this.busy() && !(this.followT > 0) && !this.driven) Object.assign(mon, own);
    }

    moveOwn(dt) {
      const mon = this.mon, M = PH.MONSTER_MODE, inp = this.input;
      this.monCd = Math.max(0, this.monCd - dt);
      this.monDodge = Math.max(0, this.monDodge - dt);
      if (this.slowT > 0) this.slowT -= dt;
      if (this.evolveAsk > 0) this.evolveAsk -= dt;
      if (this.followT > 0) this.followT -= dt;
      const driven = this.busy() || this.followT > 0 || this.evolveAsk > 0;
      if (driven) {
        // The host has it: follow.
        const k = 1 - Math.exp(-dt * 14);
        mon.x += (mon.tx - mon.x) * k; mon.z += (mon.tz - mon.z) * k;
        this.driven = true;
        return;
      }
      if (this.driven) { this.driven = false; mon.x = mon.tx; mon.z = mon.tz; }   // landed: start from the host's spot
      const ox = mon.x, oz = mon.z;
      if (mon.dashT > 0) {
        const P = M.pounce, v = P.dist / P.dur;
        mon.dashT -= dt;
        mon.x += mon.dashX * v * dt; mon.z += mon.dashZ * v * dt;
      } else {
        const mag = Math.min(1, Math.hypot(inp.x, inp.z));
        if (mag > 0.08) {
          const slow = this.slowT > 0 ? 1 - this.slowK : 1, stride = this.mut('stride');
          const k = this.stageDef().speed * this.def().speed * slow * (stride ? stride.speed : 1) * mag / Math.hypot(inp.x, inp.z);
          mon.x += inp.x * k * dt; mon.z += inp.z * k * dt;
          mon.facing = Math.atan2(inp.x, inp.z);
        }
      }
      const R = M.arena - mon.radius, d = Math.hypot(mon.x, mon.z);
      if (d > R) { mon.x *= R / d; mon.z *= R / d; }
      const dome = this.zones.find((z) => z.kind === 'arena');
      if (dome) {
        const dx = mon.x - dome.x, dz = mon.z - dome.z, dd = Math.hypot(dx, dz), RR = dome.r - mon.radius;
        if (dd > RR) { mon.x = dome.x + dx / dd * RR; mon.z = dome.z + dz / dd * RR; }
      }
      mon.moving = Math.hypot(mon.x - ox, mon.z - oz) > 0.001;
      this.sendT -= dt;
      if (this.sendT <= 0) { this.sendT = SEND_EVERY; this.room.toHost({ t: 'me', x: r2(mon.x), z: r2(mon.z), f: r2(mon.facing), q: this.mseq }, true); }
    }

    easeMonster() { /* it is the player */ }

    aimDir() {
      const mon = this.mon, inp = this.input, m = Math.hypot(inp.x, inp.z);
      return m > 0.08 ? { x: inp.x / m, z: inp.z / m } : { x: Math.sin(mon.facing), z: Math.cos(mon.facing) };
    }

    useAbility() {
      if (this.state !== 'playing' || this.monCd > 0 || this.busy()) return false;
      const d = this.aimDir();
      this.mon.facing = Math.atan2(d.x, d.z);
      this.room.toHost({ t: 'ability', x: r2(d.x), z: r2(d.z) });
      this.followT = 0.3;     // hold still while the host starts it
      return true;
    }

    dodge() {
      const mon = this.mon, P = PH.MONSTER_MODE.pounce;
      if (this.state !== 'playing' || this.monDodge > 0 || this.busy() || this.followT > 0) return false;
      const d = this.aimDir(), stride = this.mut('stride');
      mon.dashX = d.x; mon.dashZ = d.z; mon.dashT = P.dur;
      mon.facing = Math.atan2(d.x, d.z);
      this.monDodge = P.cd * (stride ? stride.pounce : 1);
      this.room.toHost({ t: 'dodge', x: r2(d.x), z: r2(d.z) });
      return true;
    }

    evolve() {
      if (!this.canEvolve()) return false;
      this.evolveAsk = 0.6;
      this.room.toHost({ t: 'evolve' });
      return true;
    }

    /** The host offers mutations after an evolution. */
    offer(choices) {
      this.choosing = true;
      this.hooks.onChoice && this.hooks.onChoice(choices, 'mutation');
    }

    choose(c) {
      if (!this.choosing) return;
      this.choosing = false;
      this.room.toHost({ t: 'mut', id: c.id });
      this.hooks.sfx && this.hooks.sfx('levelup');
    }

    // The host's lines are written from the monster's side already.
    banner(text, kind) {
      if (/ IS THE MONSTER$|^IT'S A /.test(text)) return;
      this.hooks.onBanner && this.hooks.onBanner(text, kind);
    }
    toast(text) {
      if (/^You /.test(text)) return;
      this.hooks.onToast && this.hooks.onToast(text.replace(/^🧬 It mutated:/, '🧬 Mutated:'));
    }

    hurt() { /* the monster's flinch comes in with the effects */ }
    monsterVisible() { return true; }
  }

  PH.CoopHunt = CoopHunt;
  PH.CoopClient = CoopClient;
  PH.CoopMonsterClient = CoopMonsterClient;
})();
