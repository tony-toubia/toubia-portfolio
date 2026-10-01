/**
 * Primal Hunt - monster mode.
 *
 * You are the monster. Four AI hunters land a few seconds in and hunt you:
 * they search, follow your footprints, react to birds you scatter, and fight
 * as a squad - the medic heals, the support shields and calls strikes, the
 * trapper drops a dome that stops you escaping. You eat wildlife to fill an
 * evolution meter, evolve twice, and win by downing the whole squad at once
 * or by surviving until their dropship leaves.
 *
 * Same contract as game.js: no three.js and no DOM, visuals through `fx`,
 * UI through `hooks`. It exposes the fields the renderer already draws
 * (player, enemies, projectiles, telegraphs, zones...) so the survival
 * renderer works unchanged; prey are `enemies`, the monster is `player`.
 */
window.PH = window.PH || {};

(() => {
  const TAU = Math.PI * 2;
  const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
  const HUNTER_ORDER = ['assault', 'trapper', 'medic', 'support'];
  const HUNTER_R = 0.45;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class MonsterGame {
    constructor(fx, hooks = {}) {
      this.mode = 'monster';
      this.fx = fx;
      this.hooks = hooks;
      this.input = { x: 0, z: 0 };
      this.monInput = this.input;   // the monster is steered by the player here; hunter mode gives it its own
      this.state = 'menu';
      const M = PH.MONSTER_MODE;
      this.enemies = Array.from({ length: M.wildlife.max }, (_, i) => ({ alive: false, idx: i }));
      this.projectiles = Array.from({ length: 160 }, () => ({ alive: false }));
      // Survival-mode fields the renderer reads; always empty here.
      this.gems = []; this.pickups = []; this.lobs = []; this.mines = []; this.bosses = []; this.droneHits = [];
      this.overdrive = 0;
      this.telegraphs = []; this.zones = []; this.hunters = []; this.tracks = []; this.grass = []; this.beams = [];
      this.stage = 1;
    }

    // In monster mode the player is the monster: these are what the UI and
    // renderer read and call. Hunter mode overrides them for your hunter.
    get player() { return this.mon; }
    get abilityCd() { return this.monAbilityCd; }
    set abilityCd(v) { this.monAbilityCd = v; }
    get abilityMax() { return this.monAbilityMax; }
    get dodgeCd() { return this.monDodgeCd; }
    abilityReady() { return this.monsterReady(); }
    useAbility() { return this.monsterAbility(); }
    dodge() { return this.monsterPounce(); }
    evolve() { return this.monsterEvolve(); }

    /** The renderer darkens the world by monsters slain; here, by evolution. */
    get bossKills() { return this.state === 'menu' ? 0 : this.stage - 1; }
    fieldRadius() { return 0; }
    stageDef() { return PH.MONSTER_MODE.stages[this.stage - 1]; }
    def() { return PH.MONSTERS[this.monsterType]; }
    sfx(n) { this.hooks.sfx && this.hooks.sfx(n); }
    banner(text, kind = 'warn') { this.hooks.onBanner && this.hooks.onBanner(text, kind); }
    toast(text) { (this.hooks.onToast || this.hooks.onBanner || (() => {}))(text, 'info'); }

    /* ── Run lifecycle ──────────────────────────────────────── */

    newRun(type, seed = (Math.random() * 1e9) | 0) {
      const M = PH.MONSTER_MODE;
      this.rand = mulberry32(seed);
      this.monsterType = type;
      this.time = 0;
      this.stage = 1;
      this.food = 0;
      this.eaten = 0;
      this.huntersKilled = 0;
      this.hitstop = 0;
      this.slowmo = 0;
      this.telegraphs = []; this.zones = []; this.tracks = []; this.beams = [];
      for (const p of this.projectiles) p.alive = false;
      for (const e of this.enemies) e.alive = false;
      this.aliveEnemies = 0;
      this.spotted = false;
      this.evolveNotified = false;

      const def = this.def();
      this.monAbilityMax = def.ability.cd;
      this.monAbilityCd = 2;
      this.monDodgeCd = 0;
      this.abilityUses = 0; this.dodges = 0;

      this.grass = this.makeGrass();
      const a = this.rand() * TAU, r = M.arena * 0.55;
      const S = this.stageDef();
      this.mon = {
        x: Math.cos(a) * r, z: Math.sin(a) * r, facing: a + Math.PI, moving: false, iframes: 0, radius: 1,
        hp: S.hp * def.hp, maxHp: S.hp * def.hp, armor: S.armor * def.hp, maxArmor: S.armor * def.hp,
        dashT: 0, dashX: 0, dashZ: 0, lift: 0, slowT: 0, slowK: 0, rollT: 0, rollX: 0, rollZ: 0, leap: null, leapT: 0,
        evolveT: 0, lastHit: -99, attackT: 0.5, trackAcc: 0, hidden: false, damageTaken: 0, lastHurtFx: -9,
      };
      this.team = { landed: false, known: null, waypoint: null, respawnAt: 0, arenaCd: PH.HUNTER_AI.trapper.arena.first, strikeCd: 8, shieldCd: 0,
        scanT: PH.HUNTER_AI.scan.every, sweep: null };
      this.hunters = HUNTER_ORDER.map((cls, id) => {
        const hp = PH.HUNTER_AI[cls].hp;
        return { id, cls, state: 'waiting', x: 0, z: 0, hp, maxHp: hp, facing: 0, moving: false, shotT: 0.5 + this.rand(),
          jetCd: 0, shieldT: 0, reviveT: 0, downT: 0, lastHit: -99, flash: 0 };
      });
      for (let i = 0; i < M.wildlife.max; i++) this.spawnPrey(true);

      this.state = 'playing';
      this.fx.clearRun();
      this.fx.setMonsterMode(true, this.grass, M.arena);
      this.setupRender();
    }

    /** Monster mode: you are the monster, and the camera widens as it grows. */
    setupRender() {
      const vis = this.fx.setPlayerMonster(this.monsterType, 1);
      this.mon.radius = Math.min(1.5, Math.max(0.8, vis.radius * 0.85));
      this.fx.setHunters(this.hunters);
      this.fx.setViewScale(this.stageDef().view);
    }

    onMonsterStage() {
      const vis = this.fx.setPlayerMonster(this.monsterType, this.stage);
      this.mon.radius = Math.min(1.7, Math.max(0.8, vis.radius * 0.85));
      this.fx.setViewScale(this.stageDef().view);
    }

    flashMonster() { this.fx.flashPlayer && this.fx.flashPlayer(); }

    makeGrass() {
      const M = PH.MONSTER_MODE, G = M.grass, out = [];
      let tries = 0;
      while (out.length < G.patches && tries++ < 400) {
        const a = this.rand() * TAU, d = Math.sqrt(this.rand()) * (M.arena - 4);
        const p = { x: Math.cos(a) * d, z: Math.sin(a) * d, r: G.minR + this.rand() * (G.maxR - G.minR) };
        if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < (q.r + p.r) * 0.75)) continue;
        out.push(p);
      }
      return out;
    }

    inGrass(x, z) {
      for (const g of this.grass) if (dist2(x, z, g.x, g.z) < g.r * g.r) return true;
      return false;
    }

    clampArena(o, r) {
      const R = PH.MONSTER_MODE.arena - r, d = Math.hypot(o.x, o.z);
      if (d > R) { o.x *= R / d; o.z *= R / d; }
    }

    /* ── Main step ──────────────────────────────────────────── */

    update(dt) {
      if (this.state !== 'playing') return;
      if (this.hitstop > 0) { this.hitstop -= dt; return; }
      if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.35; }
      this.time += dt;
      this.monAbilityCd = Math.max(0, this.monAbilityCd - dt);
      this.monDodgeCd = Math.max(0, this.monDodgeCd - dt);
      if (this.aiMonster) this.aiControl();

      this.updateMonster(dt);
      if (this.state !== 'playing') return;
      this.updatePrey(dt);
      this.updateHunters(dt);
      this.updateProjectiles(dt);
      this.updateTelegraphs(dt);
      if (this.state !== 'playing') return;
      for (let i = this.zones.length - 1; i >= 0; i--) { const z = this.zones[i]; z.t += dt; if (z.t >= z.dur) this.zones.splice(i, 1); }
      const life = PH.MONSTER_MODE.trackLife;
      while (this.tracks.length && this.time - this.tracks[0].t > life) this.tracks.shift();

      if (this.team.landed && this.hunters.every((h) => h.state === 'down' || h.state === 'dead')) return this.end(true, 'apex');
      if (this.time >= PH.MONSTER_MODE.duration) return this.end(true, 'survived');
    }

    /* ── The monster ────────────────────────────────────────── */

    updateMonster(dt) {
      const M = PH.MONSTER_MODE, pl = this.mon, S = this.stageDef(), def = this.def(), inp = this.monInput;
      const ox = pl.x, oz = pl.z;
      if (pl.iframes > 0) pl.iframes -= dt;
      if (pl.slowT > 0) pl.slowT -= dt;
      pl.moving = false;

      if (pl.evolveT > 0) {
        // Evolving: rooted in place and loud, the most dangerous three seconds of a run.
        pl.evolveT -= dt;
        if (pl.evolveT <= 0) this.finishEvolve();
      } else if (pl.leapT > 0) {
        const A = def.ability, L = pl.leap;
        pl.leapT -= dt;
        const k = 1 - Math.max(0, pl.leapT) / A.air;
        pl.x = L.sx + (L.tx - L.sx) * k; pl.z = L.sz + (L.tz - L.sz) * k;
        pl.lift = Math.sin(k * Math.PI) * (2 + this.stage * 0.4);
        pl.moving = true;
        if (pl.leapT <= 0) {
          pl.lift = 0;
          this.aoe(L.tx, L.tz, A.r, A.dmg * this.abilityMult(), 7, 0xff9f43);
          this.fx.bossSlam(L.tx, L.tz, A.r);
        }
      } else if (pl.rollT > 0) {
        const A = def.ability;
        pl.rollT -= dt;
        pl.x += pl.rollX * A.speed * dt; pl.z += pl.rollZ * A.speed * dt;
        pl.moving = true;
        const reach = pl.radius + 0.4, dmg = A.dmg * this.abilityMult();
        for (const h of this.hunters) {
          if (h.state !== 'up' || pl.rollHit.has(h) || dist2(h.x, h.z, pl.x, pl.z) > (reach + HUNTER_R) ** 2) continue;
          pl.rollHit.add(h);
          this.damageHunter(h, dmg);
          const d = Math.hypot(h.x - pl.x, h.z - pl.z) || 1;
          h.x += (h.x - pl.x) / d * A.knock * 0.3; h.z += (h.z - pl.z) / d * A.knock * 0.3;
        }
        for (const e of this.enemies) {
          if (!e.alive || pl.rollHit.has(e) || dist2(e.x, e.z, pl.x, pl.z) > (reach + e.radius) ** 2) continue;
          pl.rollHit.add(e);
          this.damagePrey(e, dmg);
        }
        if (Math.floor(pl.rollT * 30) % 2 === 0) this.fx.burst(pl.x, 0.3, pl.z, 3, 0xc9b38f, 2.5, 0.4, 0.4, 3, 0.4);
      } else if (pl.dashT > 0) {
        const P = M.pounce, v = P.dist / P.dur;
        pl.dashT -= dt;
        pl.x += pl.dashX * v * dt; pl.z += pl.dashZ * v * dt;
        pl.moving = true;
      } else {
        const mag = Math.min(1, Math.hypot(inp.x, inp.z));
        if (mag > 0.08) {
          const slow = pl.slowT > 0 ? 1 - pl.slowK : 1;
          const k = S.speed * def.speed * slow * mag / Math.hypot(inp.x, inp.z);
          pl.x += inp.x * k * dt; pl.z += inp.z * k * dt;
          pl.facing = Math.atan2(inp.x, inp.z);
          pl.moving = true;
        }
      }

      // Walls: the arena edge, and the trapper's dome while it stands.
      this.clampArena(pl, pl.radius);
      const dome = this.zones.find((z) => z.kind === 'arena');
      if (dome) {
        const dx = pl.x - dome.x, dz = pl.z - dome.z, d = Math.hypot(dx, dz), R = dome.r - pl.radius;
        if (d > R) { pl.x = dome.x + dx / d * R; pl.z = dome.z + dz / d * R; }
      }

      pl.hidden = !dome && this.inGrass(pl.x, pl.z);
      const moved = Math.hypot(pl.x - ox, pl.z - oz);
      if (!pl.hidden && moved > 0 && pl.lift === 0) {
        pl.trackAcc += moved;
        if (pl.trackAcc >= M.trackEvery) {
          pl.trackAcc = 0;
          this.tracks.push({ x: pl.x, z: pl.z, angle: pl.facing, t: this.time });
          if (this.tracks.length > 160) this.tracks.shift();
        }
      }
      if (pl.hidden && this.time - pl.lastHit > M.outOfCombat) {
        pl.armor = Math.min(pl.maxArmor, pl.armor + M.armorRegenHidden * dt);
      }

      // Claws: automatic, like the hunters' weapons in survival.
      if (pl.evolveT <= 0 && pl.leapT <= 0 && pl.rollT <= 0) {
        pl.attackT -= dt;
        if (pl.attackT <= 0) {
          const t = this.clawTarget();
          if (t) { this.claw(t); pl.attackT = M.attackCd; } else pl.attackT = 0.1;
        }
      }
    }

    clawTarget() {
      const pl = this.mon, reach = this.stageDef().reach + pl.radius;
      let best = null, bd = Infinity;
      for (const pass of ['up', 'down']) {
        for (const h of this.hunters) {
          if (h.state !== pass) continue;
          const d = dist2(h.x, h.z, pl.x, pl.z);
          if (d < (reach + HUNTER_R) ** 2 && d < bd) { bd = d; best = h; }
        }
        if (best) return best;
      }
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = dist2(e.x, e.z, pl.x, pl.z);
        if (d < (reach + e.radius) ** 2 && d < bd) { bd = d; best = e; }
      }
      return best;
    }

    claw(t) {
      const pl = this.mon, dmg = this.stageDef().dmg;
      if (!pl.moving) pl.facing = Math.atan2(t.x - pl.x, t.z - pl.z);
      if (t.cls) this.damageHunter(t, dmg); else this.damagePrey(t, dmg);
      // A little splash, so a swipe into a huddle hits more than one.
      for (const e of this.enemies) if (e.alive && e !== t && dist2(e.x, e.z, t.x, t.z) < 1.7) this.damagePrey(e, dmg * 0.5);
      for (const h of this.hunters) if (h !== t && h.state === 'up' && dist2(h.x, h.z, t.x, t.z) < 1.7) this.damageHunter(h, dmg * 0.5);
      this.fx.burst(t.x, 0.8, t.z, 8, 0xff3b3b, 3.5, 0.28, 0.3, 4, 0.5);
      this.fx.shockwave(t.x, t.z, 1.1, 0xff6b6b, 0.18);
      this.sfx('hit');
    }

    abilityMult() { return 1 + 0.35 * (this.stage - 1); }
    monsterReady() { return this.monAbilityCd <= 0; }

    aimDir() {
      const pl = this.mon, inp = this.monInput;
      const m = Math.hypot(inp.x, inp.z);
      return m > 0.08 ? { x: inp.x / m, z: inp.z / m } : { x: Math.sin(pl.facing), z: Math.cos(pl.facing) };
    }

    monsterAbility() {
      const pl = this.mon;
      if (this.state !== 'playing' || this.monAbilityCd > 0 || pl.evolveT > 0 || pl.leapT > 0 || pl.rollT > 0) return false;
      const A = this.def().ability, d = this.aimDir(), mult = this.abilityMult();
      if (A.id === 'leap') {
        const t = { x: pl.x + d.x * A.dist, z: pl.z + d.z * A.dist };
        this.clampArena(t, pl.radius);
        pl.leap = { sx: pl.x, sz: pl.z, tx: t.x, tz: t.z };
        pl.leapT = A.air; pl.iframes = Math.max(pl.iframes, A.air);
        pl.facing = Math.atan2(d.x, d.z);
        this.telegraphs.push({ shape: 'circle', x: t.x, z: t.z, r: A.r, t: 0, dur: A.air, color: 0xff9f43, monster: true });
      } else if (A.id === 'lightning') {
        let target = null, bd = A.range * A.range;
        for (const h of this.hunters) {
          if (h.state !== 'up') continue;
          const dd = dist2(h.x, h.z, pl.x, pl.z);
          if (dd < bd) { bd = dd; target = h; }
        }
        const x = target ? target.x : pl.x + d.x * 6, z = target ? target.z : pl.z + d.z * 6;
        this.telegraphs.push({ shape: 'circle', x, z, r: A.r, t: 0, dur: A.delay, color: 0x6fb7ff, monster: true, bolt: A.dmg * mult });
      } else if (A.id === 'warp') {
        this.fx.burst(pl.x, 1, pl.z, 24, 0xb06cff, 4, 0.35, 0.5, 0, 0.6);
        const t = { x: pl.x + d.x * A.dist, z: pl.z + d.z * A.dist };
        this.clampArena(t, pl.radius);
        pl.x = t.x; pl.z = t.z; pl.facing = Math.atan2(d.x, d.z);
        pl.iframes = Math.max(pl.iframes, 0.3);
        this.aoe(pl.x, pl.z, A.r, A.dmg * mult, 5, 0xb06cff);
      } else if (A.id === 'roll') {
        pl.rollT = A.dur; pl.rollX = d.x; pl.rollZ = d.z; pl.rollHit = new Set();
        pl.facing = Math.atan2(d.x, d.z);
      }
      this.monAbilityMax = A.cd;
      this.monAbilityCd = A.cd;
      this.abilityUses++;
      this.fx.addShake(0.2);
      this.sfx('ability');
      return true;
    }

    /** Pounce: a quick lunge. Out in the open, it can send birds up. */
    monsterPounce() {
      const pl = this.mon, P = PH.MONSTER_MODE.pounce;
      if (this.state !== 'playing' || this.monDodgeCd > 0 || pl.evolveT > 0 || pl.leapT > 0 || pl.rollT > 0) return false;
      const d = this.aimDir();
      pl.dashX = d.x; pl.dashZ = d.z; pl.dashT = P.dur;
      pl.facing = Math.atan2(d.x, d.z);
      pl.iframes = Math.max(pl.iframes, P.iframes);
      this.monDodgeCd = P.cd;
      this.dodges++;
      this.fx.dashTrail(pl.x, pl.z, d.x, d.z, P.dist);
      this.sfx('dash');
      if (!pl.hidden) this.maybeBirds(pl.x, pl.z, PH.MONSTER_MODE.birds.pounce);
      return true;
    }

    canEvolve() {
      const pl = this.mon;
      return this.state === 'playing' && this.stage < 3 && this.food >= this.stageDef().food && pl.evolveT <= 0 && pl.leapT <= 0 && pl.rollT <= 0;
    }

    monsterEvolve() {
      if (!this.canEvolve()) return false;
      const pl = this.mon;
      pl.evolveT = PH.MONSTER_MODE.evolveTime;
      // Evolving is loud: every hunter learns where you are.
      this.team.known = { x: pl.x, z: pl.z, t: this.time };
      this.fx.shockwave(pl.x, pl.z, 3, 0xffd700, 0.6);
      this.fx.burst(pl.x, 1.5, pl.z, 40, 0xffd700, 3, 0.4, 1.2, -2, 1);
      this.banner('EVOLVING...', 'boss');
      this.sfx('evolve');
      return true;
    }

    finishEvolve() {
      const pl = this.mon, def = this.def();
      const old = this.stageDef();
      this.stage++;
      const S = this.stageDef();
      this.food = 0;
      this.evolveNotified = false;
      pl.maxHp = S.hp * def.hp;
      pl.hp = Math.min(pl.maxHp, pl.hp + (S.hp - old.hp) * def.hp);
      pl.maxArmor = S.armor * def.hp;
      pl.armor = pl.maxArmor;
      this.onMonsterStage();
      this.fx.bossArrival(pl.x, pl.z, this.stage, this.monsterType);
      this.fx.zoomPunch(0.15);
      this.fx.addShake(0.8);
      this.hitstop = 0.12;
      this.banner(this.stage === 3 ? 'STAGE 3 - HUNT THEM DOWN' : `STAGE ${this.stage}`, 'win');
      this.sfx('roar');
    }

    damageMonster(dmg) {
      const pl = this.mon;
      if (pl.iframes > 0 || this.state !== 'playing') return;
      if (pl.evolveT > 0) dmg *= 1.25;           // caught mid-evolution
      pl.lastHit = this.time;
      const absorbed = Math.min(pl.armor, dmg);
      pl.armor -= absorbed;
      pl.hp -= dmg - absorbed;
      pl.damageTaken += dmg;
      this.flashMonster();
      if (dmg - absorbed > 0 && this.time - pl.lastHurtFx > 0.4) {
        pl.lastHurtFx = this.time;
        this.hooks.onPlayerHit && this.hooks.onPlayerHit(dmg - absorbed);
      }
      if (dmg >= 20) { this.hitstop = Math.max(this.hitstop, 0.06); this.fx.addShake(0.3); }
      if (pl.hp <= 0) this.end(false, 'slain');
    }

    aoe(x, z, r, dmg, shake, color) {
      for (const h of this.hunters) {
        if ((h.state === 'up' || h.state === 'down') && dist2(h.x, h.z, x, z) < (r + HUNTER_R) ** 2) this.damageHunter(h, dmg);
      }
      for (const e of this.enemies) if (e.alive && dist2(e.x, e.z, x, z) < (r + e.radius) ** 2) this.damagePrey(e, dmg);
      this.fx.explosion(x, z, r, color);
      this.fx.shockwave(x, z, r, color, 0.4);
      this.fx.addShake(shake * 0.06);
      this.hitstop = Math.max(this.hitstop, 0.05);
      this.sfx('hit');
    }

    /**
     * The monster's brain, for hunter mode and the balance sim. It can smell
     * the squad (like the radar in monster mode): it eats and lies low while
     * weak, flees toward grass away from hunters, evolves when nobody is near,
     * and turns on the squad once it is strong.
     */
    aiControl() {
      const pl = this.mon, inp = this.monInput;
      const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
      const ups = this.hunters.filter((h) => h.state === 'up');
      const downs = this.hunters.filter((h) => h.state === 'down');
      const near = ups.filter((h) => d(h, pl) < 11);
      const strong = this.stage === 3 || (this.stage === 2 && pl.hp > pl.maxHp * 0.55 && near.length <= 2);
      let ix = 0, iz = 0;
      if (this.canEvolve() && near.length === 0) this.monsterEvolve();
      if (strong && (ups.length || downs.length)) {
        const targets = downs.length && downs.some((h) => d(h, pl) < 8) ? downs : ups.length ? ups : downs;
        let t = targets[0];
        for (const h of targets) if (d(h, pl) < d(t, pl)) t = h;
        ix = t.x - pl.x; iz = t.z - pl.z;
        if (d(t, pl) < 7) this.monsterAbility();
      } else if (near.length) {
        // Run for the grass patch that is furthest from the squad, relative to us.
        const away = { x: 0, z: 0 };
        for (const h of near) { const dd = d(h, pl) || 1; away.x -= (h.x - pl.x) / dd; away.z -= (h.z - pl.z) / dd; }
        let best = null, bs = -Infinity;
        for (const gr of this.grass) {
          const dd = d(gr, pl) || 1, dir = ((gr.x - pl.x) * away.x + (gr.z - pl.z) * away.z) / dd;
          const score = dir * 2 - dd * 0.15;
          if (score > bs) { bs = score; best = gr; }
        }
        ix = away.x; iz = away.z;
        if (best) { const dd = d(best, pl) || 1; ix += (best.x - pl.x) / dd * 1.2; iz += (best.z - pl.z) / dd * 1.2; }
        if (near.some((h) => d(h, pl) < 3.5)) this.monsterAbility();
        if (near.some((h) => d(h, pl) < 5)) this.monsterPounce();
      } else if (pl.armor < pl.maxArmor * 0.6 && this.stage < 3) {
        // Armour stripped and unseen: lie low in grass until it grows back.
        let best = null;
        for (const gr of this.grass) if (!best || d(gr, pl) < d(best, pl)) best = gr;
        if (best && d(best, pl) > best.r * 0.5) { ix = best.x - pl.x; iz = best.z - pl.z; }
      } else {
        let best = null;
        for (const e of this.enemies) if (e.alive && (!best || d(e, pl) < d(best, pl))) best = e;
        if (best) { ix = best.x - pl.x; iz = best.z - pl.z; }
      }
      const r = Math.hypot(pl.x, pl.z);
      if (r > PH.MONSTER_MODE.arena - 4) { ix -= pl.x / r * 0.6; iz -= pl.z / r * 0.6; }
      const m = Math.hypot(ix, iz);
      inp.x = m > 0.001 ? ix / m : 0; inp.z = m > 0.001 ? iz / m : 0;
    }

    /* ── Prey ───────────────────────────────────────────────── */

    pickPreyType() {
      const mix = PH.MONSTER_MODE.wildlife.mix;
      let total = 0;
      for (const k in mix) total += mix[k];
      let r = this.rand() * total;
      for (const k in mix) { r -= mix[k]; if (r <= 0) return k; }
      return 'deer';
    }

    spawnPrey(initial) {
      const e = this.enemies.find((q) => !q.alive);
      if (!e) return;
      const M = PH.MONSTER_MODE, pl = this.mon;
      let x = 0, z = 0;
      for (let k = 0; k < 12; k++) {
        const a = this.rand() * TAU, d = Math.sqrt(this.rand()) * (M.arena - 2);
        x = Math.cos(a) * d; z = Math.sin(a) * d;
        if (initial || !pl || dist2(x, z, pl.x, pl.z) > 196) break;
      }
      const type = this.pickPreyType(), def = PH.ENEMIES[type];
      Object.assign(e, {
        alive: true, type, x, z, hp: def.hp, maxHp: def.hp, radius: def.radius, speed: def.speed * (0.9 + this.rand() * 0.2),
        scale: 1, elite: false, flash: 0, facing: this.rand() * TAU, phase: this.rand() * TAU,
        wander: this.rand() * TAU, wanderT: this.rand() * 3, attackT: 0, aggro: 0,
      });
      this.aliveEnemies++;
    }

    updatePrey(dt) {
      const pl = this.mon, M = PH.MONSTER_MODE;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e.flash > 0) e.flash -= dt;
        const def = PH.ENEMIES[e.type];
        let dx = pl.x - e.x, dz = pl.z - e.z;
        const d = Math.hypot(dx, dz) || 0.001;
        dx /= d; dz /= d;
        let mx = 0, mz = 0, spd = 0;
        if (e.aggro > 0) e.aggro -= dt;
        if (def.dmg > 0 && (d < 5 || e.aggro > 0)) {
          // A megabeast stands its ground and charges.
          mx = dx; mz = dz; spd = e.speed;
          e.attackT -= dt;
          if (d < e.radius + pl.radius + 0.3 && e.attackT <= 0) { e.attackT = 1.2; this.damageMonster(def.dmg); }
        } else if (d < 7) {
          mx = -dx; mz = -dz; spd = e.speed;
        } else {
          e.wanderT -= dt;
          if (e.wanderT <= 0) { e.wander = this.rand() * TAU; e.wanderT = 2 + this.rand() * 3; }
          mx = Math.cos(e.wander); mz = Math.sin(e.wander); spd = e.speed * 0.3;
        }
        e.x += mx * spd * dt; e.z += mz * spd * dt;
        if (spd > 0) e.facing = Math.atan2(mx, mz);
        const R = M.arena - e.radius, r = Math.hypot(e.x, e.z);
        if (r > R) { e.x *= R / r; e.z *= R / r; e.wander += Math.PI; }
      }
      if (this.aliveEnemies < M.wildlife.max && this.rand() < dt * M.wildlife.respawn) this.spawnPrey(false);
    }

    damagePrey(e, dmg) {
      if (!e.alive) return;
      e.hp -= dmg;
      e.flash = 0.08;
      e.aggro = 6;
      if (e.hp <= 0) this.eat(e);
    }

    eat(e) {
      const pl = this.mon, def = PH.ENEMIES[e.type], M = PH.MONSTER_MODE;
      e.alive = false;
      this.aliveEnemies--;
      this.eaten++;
      if (this.stage < 3) this.food = Math.min(this.stageDef().food, this.food + def.food);
      // Armour first; what does not fit heals at half rate.
      const room = pl.maxArmor - pl.armor;
      pl.armor = Math.min(pl.maxArmor, pl.armor + def.armor);
      if (def.armor > room) pl.hp = Math.min(pl.maxHp, pl.hp + (def.armor - room) * 0.5);
      this.fx.enemyDeath(e);
      this.fx.burst(e.x, 0.5, e.z, 12, 0x9b1b1b, 3, 0.3, 0.5);
      this.sfx('gem');
      this.maybeBirds(e.x, e.z, pl.hidden ? M.birds.feedHidden : M.birds.feed);
      if (this.stage < 3 && this.food >= this.stageDef().food && !this.evolveNotified) {
        this.evolveNotified = true;
        this.banner('READY TO EVOLVE', 'win');
        this.hooks.onEvolveReady && this.hooks.onEvolveReady();
      }
    }

    /** Scattered birds tell the hunters roughly where you are. */
    maybeBirds(x, z, chance) {
      if (!this.team.landed || this.rand() >= chance) return;
      const n = PH.MONSTER_MODE.birds.noise;
      const T = this.team;
      if (!T.known || this.time - T.known.t > 2.5) {
        T.known = { x: x + (this.rand() - 0.5) * n * 2, z: z + (this.rand() - 0.5) * n * 2, t: this.time - 2.6 };
      }
      this.fx.birds && this.fx.birds(x, z);
      this.toast('🐦 Birds scattered - the hunters heard that');
    }

    /* ── The hunters ────────────────────────────────────────── */

    dropPoint() {
      const M = PH.MONSTER_MODE, pl = this.mon;
      let best = { x: 0, z: 0 }, bd = -1;
      for (let k = 0; k < 10; k++) {
        const a = this.rand() * TAU, d = M.arena * (0.5 + this.rand() * 0.35);
        const x = Math.cos(a) * d, z = Math.sin(a) * d, dd = dist2(x, z, pl.x, pl.z);
        if (dd > 24 * 24) return { x, z };
        if (dd > bd) { bd = dd; best = { x, z }; }
      }
      return best;
    }

    deploy(list, banner) {
      const p = this.dropPoint();
      list.forEach((h, i) => {
        const a = (i / list.length) * TAU;
        h.x = p.x + Math.cos(a) * 1.6; h.z = p.z + Math.sin(a) * 1.6;
        h.state = 'up'; h.hp = h.maxHp; h.downT = 0; h.reviveT = 0; h.shieldT = 0;
      });
      this.fx.shockwave(p.x, p.z, 4, 0x8fd3ff, 0.6);
      this.fx.burst(p.x, 2, p.z, 40, 0xbfe3ff, 5, 0.4, 0.8, 4, 1);
      this.banner(banner, 'boss');
      this.sfx('roar');
      this.team.waypoint = null;
    }

    pickWaypoint() {
      const M = PH.MONSTER_MODE;
      if (this.grass.length && this.rand() < 0.6) {
        const g = this.grass[Math.floor(this.rand() * this.grass.length)];
        return { x: g.x, z: g.z, r: g.r };
      }
      const a = this.rand() * TAU, d = Math.sqrt(this.rand()) * (M.arena - 5);
      return { x: Math.cos(a) * d, z: Math.sin(a) * d };
    }

    updateHunters(dt) {
      const M = PH.MONSTER_MODE, A = PH.HUNTER_AI, T = this.team, pl = this.mon;
      this.beams.length = 0;
      if (!T.landed) {
        if (this.time >= M.hunterArrival) { T.landed = true; this.deploy(this.hunters, 'THE HUNTERS HAVE LANDED'); }
        return;
      }
      const dead = this.hunters.filter((h) => h.state === 'dead');
      if (dead.length) {
        if (!T.respawnAt) T.respawnAt = this.time + M.hunterRespawn;
        else if (this.time >= T.respawnAt) { T.respawnAt = 0; this.deploy(dead, 'DROPSHIP: HUNTERS REDEPLOYED'); }
      }
      T.arenaCd -= dt; T.strikeCd -= dt; T.shieldCd -= dt;

      // What the squad knows. Sight is shared over the radio.
      const dome = this.zones.find((z) => z.kind === 'arena');
      const up = this.hunters.filter((h) => h.state === 'up');
      let seen = false;
      for (const h of up) {
        let range = dome ? 99 : pl.hidden ? (pl.moving ? M.sightRustle : M.sightHidden) : M.sight;
        if (pl.evolveT > 0) range *= 1.6;
        h.sees = dist2(h.x, h.z, pl.x, pl.z) < (range + pl.radius) ** 2;
        if (h.sees) seen = true;
      }
      if (seen) T.known = { x: pl.x, z: pl.z, t: this.time };
      this.spotted = seen;
      const age = T.known ? this.time - T.known.t : Infinity;
      const engage = age < 2.5;

      // Sound spikes: no sighting for a while, and the trapper gets a rough fix.
      T.scanT -= dt;
      if (engage) T.scanT = Math.max(T.scanT, 12);
      else if (T.scanT <= 0) {
        const S = A.scan, trapper = this.hunters.find((h) => h.cls === 'trapper' && h.state === 'up');
        if (trapper && dist2(trapper.x, trapper.z, pl.x, pl.z) < S.range * S.range) {
          // Spikes come faster as the clock runs down: hiding buys time, not safety.
          const k = Math.min(1, this.time / (M.duration - 60));
          T.scanT = S.every + (S.late - S.every) * k;
          T.known = { x: pl.x + (this.rand() - 0.5) * S.noise * 2, z: pl.z + (this.rand() - 0.5) * S.noise * 2, t: this.time - 2.6 };
          this.toast('📡 Sound spike - they have a rough fix on you');
          this.sfx('ability');
        } else T.scanT = 8;
      }

      let cx = 0, cz = 0;
      for (const h of up) { cx += h.x; cz += h.z; }
      if (up.length) { cx /= up.length; cz /= up.length; }

      // Where the squad is heading when it is not fighting.
      let goal = null;
      if (!engage) {
        if (T.known) {
          goal = T.known;
          if (dist2(cx, cz, T.known.x, T.known.z) < 9) {
            // At the last sighting: pick up the trail.
            let tr = null;
            const since = T.known.trail || T.known.t;
            for (let i = this.tracks.length - 1; i >= 0; i--) {
              const k = this.tracks[i];
              if (k.t <= since) break;
              if (dist2(k.x, k.z, T.known.x, T.known.z) < 49) { tr = k; break; }
            }
            if (tr) T.known = { x: tr.x, z: tr.z, t: this.time - 3, trail: tr.t };
            else {
              // The trail is cold here: comb the area before moving on.
              T.sweep = { x: T.known.x, z: T.known.z, until: this.time + A.sweep.time, r: A.sweep.r };
              T.known = null;
            }
          }
        }
        if (!goal || !T.known) {
          if (T.sweep && this.time < T.sweep.until) goal = T.sweep;
          else {
            T.sweep = null;
            if (!T.waypoint || dist2(cx, cz, T.waypoint.x, T.waypoint.z) < 9) T.waypoint = this.pickWaypoint();
            goal = T.known || T.waypoint;
          }
        }
      }

      for (const h of this.hunters) {
        if (h.flash > 0) h.flash -= dt;
        if (h.state === 'down') {
          h.downT -= dt;
          if (h.downT <= 0) this.killHunter(h, 'bled out');
          continue;
        }
        if (h.state !== 'up') continue;
        const C = A[h.cls];
        h.shotT -= dt; h.jetCd -= dt; if (h.shieldT > 0) h.shieldT -= dt;
        // In hunter mode one of the squad is you.
        if (h.controlled) { this.updateMe(h, dt, { engage, seen, up, C, T }); continue; }

        // Revive a downed teammate if the monster is not standing over them.
        let tx = null, tz = null;
        const downed = this.hunters.find((o) => o.state === 'down' && dist2(o.x, o.z, pl.x, pl.z) > 25);
        if (downed) {
          let nearest = null, nd = Infinity;
          for (const o of up) { if (o.controlled) continue; const dd = dist2(o.x, o.z, downed.x, downed.z); if (dd < nd) { nd = dd; nearest = o; } }
          if (nearest === h) {
            tx = downed.x; tz = downed.z;
            if (nd < 1.7) {
              downed.reviveT += dt;
              if (downed.reviveT >= A.reviveTime) {
                downed.state = 'up'; downed.hp = downed.maxHp * A.reviveHp; downed.reviveT = 0;
                this.toast(`${downed.cls.toUpperCase()} WAS REVIVED`);
              }
            }
          }
        }
        if (tx === null) {
          if (engage) {
            // Hold this hunter's range from the monster, circling slowly.
            const mx = T.known.x, mz = T.known.z;
            const ang = Math.atan2(h.z - mz, h.x - mx) + (h.id % 2 ? 0.35 : -0.35) * dt * 2;
            tx = mx + Math.cos(ang) * C.range; tz = mz + Math.sin(ang) * C.range;
          } else {
            // Searching a grass patch: fan out through it rather than walk its middle.
            const sweeping = goal === T.sweep;
            const a = (h.id / 4) * TAU + this.time * (sweeping ? 0.6 : 0.25);
            const spread = sweeping ? goal.r * (0.5 + 0.5 * Math.abs(Math.sin(this.time * 0.7 + h.id))) : goal.r ? Math.min(4, goal.r * 0.7) : 1.8;
            tx = goal.x + Math.cos(a) * spread; tz = goal.z + Math.sin(a) * spread;
          }
        }
        // Keep apart from each other and out of the monster's reach while moving.
        for (const o of up) {
          if (o === h) continue;
          const ox = h.x - o.x, oz = h.z - o.z, dd = ox * ox + oz * oz;
          if (dd < 4 && dd > 0.0001) { const dl = Math.sqrt(dd); tx += ox / dl * 1.5; tz += oz / dl * 1.5; }
        }
        let mvx = tx - h.x, mvz = tz - h.z;
        const md = Math.hypot(mvx, mvz);
        h.moving = md > 0.35;
        if (h.moving) {
          const spd = A.speed * (engage ? 0.9 : 1);
          h.x += mvx / md * spd * dt; h.z += mvz / md * spd * dt;
          h.facing = Math.atan2(mvx, mvz);
        }
        const pd = Math.hypot(h.x - pl.x, h.z - pl.z) || 0.001;
        const minD = pl.radius + HUNTER_R + 0.1;
        if (pd < minD) { h.x = pl.x + (h.x - pl.x) / pd * minD; h.z = pl.z + (h.z - pl.z) / pd * minD; }
        this.clampArena(h, HUNTER_R);

        // Jetpack away from an attack that is about to land on them.
        if (h.jetCd <= 0) {
          for (const t of this.telegraphs) {
            if (!t.monster || t.t < t.dur * 0.35 || dist2(h.x, h.z, t.x, t.z) > (t.r + HUNTER_R) ** 2) continue;
            h.jetCd = A.jet.cd;
            if (this.rand() < A.jet.chance) {
              const jx = h.x - t.x, jz = h.z - t.z, jd = Math.hypot(jx, jz) || 1;
              this.fx.dashTrail(h.x, h.z, jx / jd, jz / jd, A.jet.dist);
              h.x += jx / jd * A.jet.dist; h.z += jz / jd * A.jet.dist;
              this.clampArena(h, HUNTER_R);
            }
            break;
          }
        }

        // Jet after a monster that is getting away.
        if (engage && h.jetCd <= 0 && pd > C.range + 4 && h.sees) {
          h.jetCd = A.jet.chase;
          const jx = (pl.x - h.x) / pd, jz = (pl.z - h.z) / pd;
          this.fx.dashTrail(h.x, h.z, jx, jz, A.jet.dist);
          h.x += jx * A.jet.dist; h.z += jz * A.jet.dist;
          this.clampArena(h, HUNTER_R);
        }

        if (engage) {
          h.facing = Math.atan2(pl.x - h.x, pl.z - h.z);
          if (h.shotT <= 0 && (h.sees || seen) && pd < C.range + 6) {
            h.shotT = C.shot.cd * (0.85 + this.rand() * 0.3);
            this.fireAt(h, C.shot);
          }
        }

        // Class jobs.
        if (h.cls === 'medic') {
          let target = null, worst = 0.999;
          for (const o of up) {
            const f = o.hp / o.maxHp;
            if (f < worst && dist2(o.x, o.z, h.x, h.z) < C.heal.range ** 2) { worst = f; target = o; }
          }
          if (target) {
            target.hp = Math.min(target.maxHp, target.hp + C.heal.hps * dt);
            this.beams.push({ ax: h.x, az: h.z, bx: target.x, bz: target.z });
          }
        } else if (h.cls === 'support') {
          if (T.shieldCd <= 0) {
            const hurt = up.find((o) => this.time - o.lastHit < 0.6 && o.shieldT <= 0);
            if (hurt) { hurt.shieldT = C.shield.dur; T.shieldCd = C.shield.cd; }
          }
          if (engage && seen && T.strikeCd <= 0) {
            T.strikeCd = C.strike.cd;
            this.telegraphs.push({ shape: 'circle', x: pl.x, z: pl.z, r: C.strike.r, t: 0, dur: C.strike.delay, color: 0xff3344, strike: C.strike.dmg });
          }
        } else if (h.cls === 'trapper') {
          if (engage && seen && !dome && T.arenaCd <= 0 && pd < 10) {
            T.arenaCd = C.arena.cd;
            this.zones.push({ kind: 'arena', x: (pl.x + h.x) / 2, z: (pl.z + h.z) / 2, r: C.arena.r, t: 0, dur: C.arena.dur });
            this.banner('MOBILE ARENA - YOU ARE TRAPPED', 'boss');
            this.sfx('roar');
          }
        }
      }
    }

    fireAt(h, shot) {
      const p = this.projectiles.find((q) => !q.alive);
      if (!p) return;
      const pl = this.mon;
      const dx = pl.x - h.x, dz = pl.z - h.z, d = Math.hypot(dx, dz) || 1;
      const spread = (this.rand() - 0.5) * 0.12;
      const c = Math.cos(spread), s = Math.sin(spread);
      const ux = (dx / d) * c - (dz / d) * s, uz = (dx / d) * s + (dz / d) * c;
      Object.assign(p, {
        alive: true, hostile: true, vis: shot.vis, x: h.x, z: h.z, vx: ux * shot.speed, vz: uz * shot.speed,
        dmg: shot.dmg, life: 1.4, radius: 0.25, slow: shot.slow || 0, slowT: shot.slowT || 0, r: 1, g: 1, b: 1,
      });
      this.sfx('shoot');
    }

    damageHunter(h, dmg) {
      if (h.iframes > 0) return;
      if (h.state === 'up') {
        if (h.shieldT > 0) dmg *= 1 - PH.HUNTER_AI.support.shield.guard;
        h.hp -= dmg;
        h.lastHit = this.time;
        h.flash = 0.1;
        // Getting hit tells the squad exactly where you are.
        this.team.known = { x: this.mon.x, z: this.mon.z, t: this.time };
        if (this.hunterNumbers !== false && this.hooks.onDamage) this.hooks.onDamage(h.x, 2, h.z, dmg, false);
        if (this.onHunterHurt) this.onHunterHurt(h, dmg);
        if (h.hp <= 0) {
          h.hp = 0; h.state = 'down'; h.downT = PH.HUNTER_AI.bleedOut; h.reviveT = 0;
          this.banner(`${h.cls.toUpperCase()} IS DOWN`, 'win');
          this.fx.burst(h.x, 1, h.z, 20, 0xff4757, 4, 0.3, 0.6);
          this.sfx('defeat');
        }
      } else if (h.state === 'down') {
        this.killHunter(h, 'killed');
      }
    }

    killHunter(h, how) {
      h.state = 'dead';
      this.huntersKilled++;
      this.fx.burst(h.x, 1, h.z, 30, 0xff2e2e, 5, 0.35, 0.8);
      this.fx.shockwave(h.x, h.z, 2.5, 0xff4757, 0.4);
      this.banner(`${h.cls.toUpperCase()} ${how === 'bled out' ? 'BLED OUT' : 'KILLED'}`, 'win');
      this.hitstop = Math.max(this.hitstop, 0.08);
      this.sfx('roar');
    }

    updateProjectiles(dt) {
      const pl = this.mon;
      for (const p of this.projectiles) {
        if (!p.alive) continue;
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.life -= dt;
        if (p.life <= 0) { p.alive = false; continue; }
        if (pl.lift < 1 && dist2(p.x, p.z, pl.x, pl.z) < (p.radius + pl.radius) ** 2) {
          p.alive = false;
          this.damageMonster(p.dmg);
          if (p.slow) { pl.slowT = p.slowT; pl.slowK = p.slow; }
          this.fx.burst(p.x, 0.9, p.z, 3, 0xfff1a8, 2, 0.16, 0.18, 0, 0.2);
        }
      }
    }

    updateTelegraphs(dt) {
      const pl = this.mon;
      for (let i = this.telegraphs.length - 1; i >= 0; i--) {
        const t = this.telegraphs[i];
        t.t += dt;
        if (t.t < t.dur) continue;
        this.telegraphs.splice(i, 1);
        if (t.strike) {
          // The support's orbital strike: step out of the red circle.
          this.fx.explosion(t.x, t.z, t.r, 0xff6a3d);
          this.fx.burst(t.x, 4, t.z, 14, 0xffd0a0, 1, 0.5, 0.35, -8, -2);
          this.fx.addShake(0.3);
          if (dist2(pl.x, pl.z, t.x, t.z) < (t.r + pl.radius * 0.5) ** 2) this.damageMonster(t.strike);
        } else if (t.bolt) {
          this.fx.lightningChain([{ x: t.x + 0.5, z: t.z - 3 }, { x: t.x, z: t.z }], 0x9be7ff);
          this.aoe(t.x, t.z, t.r, t.bolt, 5, 0x6fb7ff);
        }
      }
    }

    score() {
      return Math.round(this.eaten * 5 + this.huntersKilled * 400 + (this.stage - 1) * 500 + Math.floor(this.time) * 2
        + (this.victory ? (this.how === 'apex' ? 3000 : 1500) : 0));
    }

    end(victory, how) {
      if (this.state === 'over') return;
      this.state = 'over';
      this.victory = victory;
      this.how = how;
      this.hooks.onEnd && this.hooks.onEnd({
        mode: 'monster', victory, how, time: this.time, stage: this.stage, huntersKilled: this.huntersKilled,
        eaten: this.eaten, score: this.score(), monsterType: this.monsterType,
      });
    }
  }

  PH.MonsterGame = MonsterGame;
})();
