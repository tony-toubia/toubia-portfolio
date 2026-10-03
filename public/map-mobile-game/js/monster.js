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
    roar() { return this.monsterRoar(); }
    get roarCd() { return this.monRoarCd; }
    roarUnlocked() { return this.stage >= PH.MONSTER_MODE.roar.stage; }

    /** The renderer darkens the world by monsters slain; here, by evolution. */
    get bossKills() { return this.state === 'menu' ? 0 : this.stage - 1; }
    fieldRadius() { return 0; }
    stageDef() { return PH.MONSTER_MODE.stages[this.stage - 1]; }
    def() { return PH.MONSTERS[this.monsterType]; }
    /** A mutation's numbers if the monster has it, else null. */
    mut(id) { return this.muts && this.muts.has(id) ? PH.MUTATIONS[id] : null; }
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
      this.muts = new Set();
      this.brain = null;
      this.fireTrail = []; this.fireFx = 0;

      const def = this.def();
      this.monAbilityMax = def.ability.cd;
      this.monAbilityCd = 2;
      this.monDodgeCd = 0;
      this.monRoarCd = 0;
      this.revealT = 0;
      this.kit = { roars: 0, staggers: 0, snares: 0 };     // how often the fight kit came into play (the sim reads it)
      this.abilityUses = 0; this.dodges = 0;

      this.grass = this.makeGrass();
      const a = this.rand() * TAU, r = M.arena * 0.55;
      const S = this.stageDef();
      this.mon = {
        x: Math.cos(a) * r, z: Math.sin(a) * r, facing: a + Math.PI, moving: false, iframes: 0, radius: 1,
        hp: S.hp * def.hp, maxHp: S.hp * def.hp, armor: S.armor * def.hp, maxArmor: S.armor * def.hp,
        dashT: 0, dashX: 0, dashZ: 0, lift: 0, slowT: 0, slowK: 0, rollT: 0, rollX: 0, rollZ: 0, leap: null, leapT: 0,
        evolveT: 0, lastHit: -99, attackT: 0.5, trackAcc: 0, hidden: false, damageTaken: 0, lastHurtFx: -9,
        phantomT: 0, trailT: 0, diveT: 0, staggerT: 0, staggerAcc: 0, staggerImmune: 0, staggerFx: 0, rootT: 0,
      };
      this.team = { landed: false, known: null, waypoint: null, respawnAt: 0, arenaCd: PH.HUNTER_AI.trapper.arena.first, strikeCd: 8, shieldCd: 0, snareCd: 15,
        scanT: PH.HUNTER_AI.scan.every, sweep: null };
      // Hunter Squad swaps in your class if it is not one of the usual four.
      this.hunters = (this.squadOrder || HUNTER_ORDER).map((cls, id) => {
        const hp = PH.HUNTER_AI[cls].hp;
        return { id, cls, state: 'waiting', x: 0, z: 0, hp, maxHp: hp, facing: 0, moving: false, shotT: 0.5 + this.rand(),
          jetCd: 0, shieldT: 0, reviveT: 0, downT: 0, lastHit: -99, flash: 0 };
      });
      for (let i = 0; i < M.wildlife.max; i++) this.spawnPrey(true);

      this.state = 'playing';
      this.fx.clearRun();
      // A biome for the look only: hazards are a Survival thing, so no lava here.
      this.biomeId = PH.World.fromSeed(seed, PH.World.ARENA_ORDER);
      PH.World.set(this.biomeId);
      this.fx.setWorld && this.fx.setWorld(this.biomeId);
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
      this.monRoarCd = Math.max(0, this.monRoarCd - dt);
      if (this.revealT > 0) this.revealT -= dt;
      this.mon.staggerAcc *= Math.exp(-dt / PH.MONSTER_MODE.stagger.window);
      if (this.aiMonster) this.aiControl();

      this.updateMonster(dt);
      if (this.state !== 'playing') return;
      this.updatePrey(dt);
      this.updateHunters(dt);
      this.updateProjectiles(dt);
      this.updateTelegraphs(dt);
      this.updateFireTrail(dt);
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
      if (pl.rootT > 0) pl.rootT -= dt;
      pl.moving = false;

      if (pl.staggerT > 0) {
        // Staggered: reeling, with stars over its head.
        pl.staggerT -= dt;
        if ((pl.staggerFx -= dt) <= 0) { pl.staggerFx = 0.22; this.fx.burst(pl.x, 2.2 + pl.radius, pl.z, 5, 0xffe066, 2.2, 0.3, 0.45, -1, 0.6); }
      } else if (pl.evolveT > 0) {
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
          const Q = this.mut('aftershock');
          if (Q) this.telegraphs.push({ shape: 'circle', x: L.tx, z: L.tz, r: A.r * Q.r, t: 0, dur: Q.delay, color: 0xff6a3d, monster: true, quake: A.dmg * this.abilityMult() * Q.dmg });
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
        const F = this.mut('scorched');
        if (F && (pl.trailT -= dt) <= 0) {
          pl.trailT = 0.1;
          this.fireTrail.push({ x: pl.x, z: pl.z, life: F.life, r: F.r, dps: F.dps });
          if (this.fireTrail.length > 80) this.fireTrail.shift();
        }
      } else if (pl.diveT > 0) {
        // Fire Dive: a low, fast swoop that scorches the ground and anyone under it.
        const A = def.ability, D = pl.dive;
        pl.diveT -= dt;
        const k = 1 - Math.max(0, pl.diveT) / A.dur;
        pl.x += D.x * D.v * dt; pl.z += D.z * D.v * dt;
        pl.lift = Math.sin(k * Math.PI) * 1.4;
        pl.moving = true;
        const reach = pl.radius + 0.5, dmg = A.dmg * this.abilityMult();
        for (const h of this.hunters) {
          if (h.state !== 'up' || D.hit.has(h) || dist2(h.x, h.z, pl.x, pl.z) > (reach + HUNTER_R) ** 2) continue;
          D.hit.add(h); this.damageHunter(h, dmg);
        }
        for (const e of this.enemies) if (e.alive && !D.hit.has(e) && dist2(e.x, e.z, pl.x, pl.z) < (reach + e.radius) ** 2) { D.hit.add(e); this.damagePrey(e, dmg); }
        if ((pl.trailT -= dt) <= 0) {
          pl.trailT = 0.05;
          const inf = this.mut('inferno');
          this.fireTrail.push({ x: pl.x, z: pl.z, life: A.fire.life * (inf ? inf.life : 1), r: A.fire.r * (inf ? inf.r : 1), dps: A.fire.dps });
          if (this.fireTrail.length > 120) this.fireTrail.shift();
        }
        if (pl.diveT <= 0) pl.lift = 0;
      } else if (pl.rootT > 0) {
        // Snared: held fast where it stands.
        pl.dashT = 0;
      } else if (pl.netX != null) {
        // Co-op: a friend plays the monster. Their device walks it (and flies
        // its pounce); we take where it says it is.
        if (pl.dashT > 0) pl.dashT -= dt;
        pl.x = pl.netX; pl.z = pl.netZ; pl.facing = pl.netF;
        pl.moving = Math.hypot(pl.x - ox, pl.z - oz) > 0.001;
      } else if (pl.dashT > 0) {
        const P = M.pounce, v = P.dist / P.dur;
        pl.dashT -= dt;
        pl.x += pl.dashX * v * dt; pl.z += pl.dashZ * v * dt;
        pl.moving = true;
      } else {
        const mag = Math.min(1, Math.hypot(inp.x, inp.z));
        if (mag > 0.08) {
          const slow = pl.slowT > 0 ? 1 - pl.slowK : 1;
          const stride = this.mut('stride');
          const k = S.speed * def.speed * slow * (stride ? stride.speed : 1) * mag / Math.hypot(inp.x, inp.z);
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

      if (pl.phantomT > 0) pl.phantomT -= dt;
      pl.hidden = !dome && (pl.phantomT > 0 || this.inGrass(pl.x, pl.z));
      const moved = Math.hypot(pl.x - ox, pl.z - oz);
      if (!pl.hidden && moved > 0 && pl.lift === 0 && !this.mut('silent')) {
        pl.trackAcc += moved;
        if (pl.trackAcc >= M.trackEvery) {
          pl.trackAcc = 0;
          this.tracks.push({ x: pl.x, z: pl.z, angle: pl.facing, t: this.time });
          if (this.tracks.length > 160) this.tracks.shift();
        }
      }
      const calm = this.time - pl.lastHit > M.outOfCombat;
      if (pl.hidden && calm) {
        const hide = this.mut('thickhide');
        pl.armor = Math.min(pl.maxArmor, pl.armor + M.armorRegenHidden * (hide ? hide.regen : 1) * dt);
      }
      const regen = this.mut('regen');
      if (regen && calm && pl.evolveT <= 0) pl.hp = Math.min(pl.maxHp, pl.hp + regen.hps * dt);

      this.checkSnares();

      // Claws: automatic, like the hunters' weapons in survival.
      if (pl.evolveT <= 0 && pl.leapT <= 0 && pl.rollT <= 0 && pl.diveT <= 0 && pl.staggerT <= 0) {
        pl.attackT -= dt;
        if (pl.attackT <= 0) {
          const t = this.clawTarget();
          const rend = this.mut('rending');
          if (t) { this.claw(t); pl.attackT = M.attackCd * (rend ? rend.rate : 1); } else pl.attackT = 0.1;
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
      const pl = this.mon, rend = this.mut('rending'), lust = this.mut('bloodlust');
      const dmg = this.stageDef().dmg * (rend ? rend.dmg : 1) * (lust ? lust.dmg : 1);
      if (!pl.moving) pl.facing = Math.atan2(t.x - pl.x, t.z - pl.z);
      if (t.cls) {
        this.damageHunter(t, dmg);
        if (lust) pl.hp = Math.min(pl.maxHp, pl.hp + dmg * lust.leech);
      } else this.damagePrey(t, dmg);
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
      if (this.state !== 'playing' || this.monAbilityCd > 0 || pl.evolveT > 0 || pl.leapT > 0 || pl.rollT > 0 || pl.diveT > 0 || pl.staggerT > 0) return false;
      const A = this.def().ability, d = this.aimDir(), mult = this.abilityMult();
      if (pl.rootT > 0 && A.id !== 'lightning') return false;      // snared: no leaping, warping, diving or rolling out
      const meteor = this.mut('meteor');
      if (A.id === 'leap') {
        const reach = A.dist * (meteor ? meteor.dist : 1);
        const t = { x: pl.x + d.x * reach, z: pl.z + d.z * reach };
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
        const chain = !!this.mut('chain'), cell = this.mut('stormcell');
        this.telegraphs.push({ shape: 'circle', x, z, r: A.r, t: 0, dur: A.delay, color: 0x6fb7ff, monster: true, bolt: A.dmg * mult, chain });
        if (cell) {
          for (let i = 0; i < cell.extra; i++) {
            const a = this.rand() * TAU, rr = cell.spread * (0.6 + this.rand() * 0.4);
            const b = { x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr };
            this.clampArena(b, 1);
            this.telegraphs.push({ shape: 'circle', x: b.x, z: b.z, r: A.r * 0.85, t: 0, dur: A.delay + cell.stagger * (i + 1), color: 0x6fb7ff, monster: true, bolt: A.dmg * mult * cell.dmg, chain });
          }
        }
      } else if (A.id === 'warp') {
        this.fx.burst(pl.x, 1, pl.z, 24, 0xb06cff, 4, 0.35, 0.5, 0, 0.6);
        const echo = this.mut('echo'), ghost = this.mut('phantom');
        if (echo) this.aoe(pl.x, pl.z, A.r, A.dmg * mult * echo.dmg, 3, 0xb06cff);
        if (ghost) pl.phantomT = ghost.dur;
        const t = { x: pl.x + d.x * A.dist, z: pl.z + d.z * A.dist };
        this.clampArena(t, pl.radius);
        pl.x = t.x; pl.z = t.z; pl.facing = Math.atan2(d.x, d.z);
        pl.iframes = Math.max(pl.iframes, 0.3);
        this.aoe(pl.x, pl.z, A.r, A.dmg * mult, 5, 0xb06cff);
      } else if (A.id === 'dive') {
        const sky = this.mut('skyborne'), dist = A.dist * (sky ? sky.dist : 1);
        pl.diveT = A.dur; pl.dive = { x: d.x, z: d.z, v: dist / A.dur, hit: new Set() }; pl.trailT = 0;
        pl.iframes = Math.max(pl.iframes, A.dur);
        pl.facing = Math.atan2(d.x, d.z);
      } else if (A.id === 'roll') {
        const jug = this.mut('juggernaut');
        pl.rollT = A.dur * (jug ? jug.dur : 1); pl.rollX = d.x; pl.rollZ = d.z; pl.rollHit = new Set(); pl.trailT = 0;
        pl.facing = Math.atan2(d.x, d.z);
      }
      const sky = this.mut('skyborne');
      const cd = A.cd * (meteor ? meteor.cd : 1) * (A.id === 'dive' && sky ? sky.cd : 1);
      this.monAbilityMax = cd;
      this.monAbilityCd = cd;
      this.abilityUses++;
      this.fx.addShake(0.2);
      this.sfx('ability');
      return true;
    }

    /** Pounce: a quick lunge. Out in the open, it can send birds up. */
    monsterPounce() {
      const pl = this.mon, P = PH.MONSTER_MODE.pounce;
      if (this.state !== 'playing' || this.monDodgeCd > 0 || pl.evolveT > 0 || pl.leapT > 0 || pl.rollT > 0 || pl.diveT > 0 || pl.staggerT > 0 || pl.rootT > 0) return false;
      const d = this.aimDir();
      pl.dashX = d.x; pl.dashZ = d.z; pl.dashT = P.dur;
      pl.facing = Math.atan2(d.x, d.z);
      pl.iframes = Math.max(pl.iframes, P.iframes);
      const stride = this.mut('stride');
      this.monDodgeCd = P.cd * (stride ? stride.pounce : 1);
      this.dodges++;
      this.fx.dashTrail(pl.x, pl.z, d.x, d.z, P.dist);
      this.sfx('dash');
      if (!pl.hidden) this.maybeBirds(pl.x, pl.z, PH.MONSTER_MODE.birds.pounce);
      return true;
    }

    /** Roar: shove back everyone close, jam their weapons, break their revives. Loud. */
    monsterRoar() {
      const pl = this.mon, R = PH.MONSTER_MODE.roar;
      if (this.state !== 'playing' || this.stage < R.stage || this.monRoarCd > 0 || pl.evolveT > 0 || pl.leapT > 0 || pl.diveT > 0 || pl.staggerT > 0) return false;
      this.monRoarCd = R.cd;
      this.kit.roars++;
      this.team.known = { x: pl.x, z: pl.z, t: this.time };
      for (const h of this.hunters) {
        const dx = h.x - pl.x, dz = h.z - pl.z, d = Math.hypot(dx, dz) || 0.01;
        if (d > R.r + HUNTER_R) continue;
        if (h.state === 'down') { h.reviveT = 0; continue; }
        if (h.state !== 'up') continue;
        this.damageHunter(h, R.dmg);
        const push = R.knock * (1 - 0.4 * d / R.r);
        h.x += dx / d * push; h.z += dz / d * push;
        this.clampArena(h, HUNTER_R);
        h.shotT = Math.max(h.shotT || 0, R.jam);
        h.shieldT = 0;
        for (const o of this.hunters) if (o.state === 'down' && dist2(o.x, o.z, h.x, h.z) < 9) o.reviveT = 0;
        if (this.onHunterKnock) this.onHunterKnock(h);
      }
      this.fx.shockwave(pl.x, pl.z, R.r, 0xffc94d, 0.5);
      this.fx.shockwave(pl.x, pl.z, R.r * 0.6, 0xff8a3d, 0.35);
      this.fx.burst(pl.x, 1.6, pl.z, 26, 0xffd27a, 6, 0.35, 0.6, 0, 1);
      this.fx.addShake(0.5);
      this.fx.zoomPunch(0.06);
      this.sfx('roar');
      return true;
    }

    /** Enough damage in a burst knocks it reeling. */
    stagger() {
      const pl = this.mon, G = PH.MONSTER_MODE.stagger;
      pl.staggerT = G.dur;
      pl.staggerImmune = this.time + G.dur + G.immune;
      pl.staggerAcc = 0;
      pl.rollT = 0; pl.dashT = 0; pl.staggerFx = 0;
      this.kit.staggers++;
      this.fx.shockwave(pl.x, pl.z, 3, 0xffe066, 0.4);
      this.fx.burst(pl.x, 2, pl.z, 24, 0xffe066, 4, 0.35, 0.6, -2, 0.8);
      this.fx.addShake(0.4);
      this.banner('STAGGERED', 'warn');
      this.sfx('damage');
      // Punished mid-fight, the AI often thinks better of it.
      const B = this.brain;
      if (B && B.mode === 'fight' && this.rand() < 0.6) { this.endFight(); this.setMode('flee'); }
    }

    /** Snares on the ground: stepping in one roots it, hurts it, and shows it to the squad. */
    checkSnares() {
      const pl = this.mon;
      if (pl.lift > 0 || pl.leapT > 0 || pl.diveT > 0) return;
      for (let i = this.zones.length - 1; i >= 0; i--) {
        const z = this.zones[i];
        if (z.kind !== 'snare' || z.t < 0.5 || dist2(z.x, z.z, pl.x, pl.z) > (z.r + pl.radius * 0.5) ** 2) continue;
        const SN = PH.HUNTER_AI.trapper.snare;
        this.zones.splice(i, 1);
        this.kit.snares++;
        pl.rootT = SN.root; pl.dashT = 0; pl.rollT = 0; pl.phantomT = 0;
        this.revealT = SN.reveal;
        this.team.known = { x: pl.x, z: pl.z, t: this.time };
        this.fx.shockwave(z.x, z.z, 2.2, 0x4ecdc4, 0.4);
        this.fx.burst(z.x, 0.6, z.z, 18, 0x4ecdc4, 3, 0.3, 0.5, 0, 0.6);
        this.banner('SNARED - THEY KNOW WHERE YOU ARE', 'warn');
        this.sfx('hit');
        this.damageMonster(SN.dmg);
        return;
      }
    }

    canEvolve() {
      const pl = this.mon;
      return this.state === 'playing' && this.stage < 3 && this.food >= this.stageDef().food && pl.evolveT <= 0 && pl.leapT <= 0 && pl.rollT <= 0 && pl.diveT <= 0 && pl.staggerT <= 0;
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
      const hide = this.mut('thickhide');
      pl.maxArmor = S.armor * def.hp * (hide ? hide.armor : 1);
      pl.armor = pl.maxArmor;
      this.onMonsterStage();
      this.fx.bossArrival(pl.x, pl.z, this.stage, this.monsterType);
      this.fx.zoomPunch(0.15);
      this.fx.addShake(0.8);
      this.hitstop = 0.12;
      this.banner(this.stage === 3 ? 'STAGE 3 - HUNT THEM DOWN' : `STAGE ${this.stage}`, 'win');
      this.sfx('roar');
      if (this.stage === PH.MONSTER_MODE.roar.stage) this.toast('📣 Roar unlocked: knock back the hunters around you');
      this.offerMutations();
    }

    /**
     * Each evolution offers three mutations: one for this monster's signature
     * move and two general ones. The player picks; an AI monster picks at random.
     */
    offerMutations() {
      const choices = this.mutationChoices();
      if (!choices.length) return;
      if (this.aiMonster) {
        const c = choices[Math.floor(this.rand() * choices.length)];
        this.applyMutation(c.id);
        this.toast(`🧬 It mutated: ${PH.MUTATIONS[c.id].name}`);
        return;
      }
      this.state = 'choice';
      this.currentChoices = choices;
      this.hooks.onChoice && this.hooks.onChoice(choices, 'mutation');
    }

    mutationChoices() {
      const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
      const open = Object.keys(PH.MUTATIONS).filter((id) => !this.muts.has(id));
      const sig = shuffle(open.filter((id) => PH.MUTATIONS[id].for === this.monsterType));
      const gen = shuffle(open.filter((id) => !PH.MUTATIONS[id].for));
      return [sig[0], gen[0], gen[1]].filter(Boolean).map((id) => ({ type: 'mutation', id, signature: !!PH.MUTATIONS[id].for }));
    }

    applyMutation(id) {
      const m = PH.MUTATIONS[id];
      if (!m || this.muts.has(id)) return;
      this.muts.add(id);
      const pl = this.mon;
      if (id === 'thickhide') { pl.maxArmor *= m.armor; pl.armor = pl.maxArmor; }
    }

    choose(c) {
      if (this.state !== 'choice') return;
      this.applyMutation(c.id);
      this.state = 'playing';
      this.fx.burst(this.mon.x, 1.5, this.mon.z, 30, 0x7dff9a, 3, 0.4, 0.8, -2, 0.8);
      this.sfx('levelup');
    }

    /** Scorched Earth and Fire Dive: the fire burns hunters who stand in it. */
    updateFireTrail(dt) {
      if (!this.fireTrail.length) return;
      const mult = this.abilityMult();
      for (let i = this.fireTrail.length - 1; i >= 0; i--) { const f = this.fireTrail[i]; f.life -= dt; if (f.life <= 0) this.fireTrail.splice(i, 1); }
      for (const h of this.hunters) {
        if (h.state !== 'up') continue;
        const f = this.fireTrail.find((q) => dist2(q.x, q.z, h.x, h.z) < (q.r + HUNTER_R) ** 2);
        if (f) {
          h.burn = (h.burn || 0) + f.dps * mult * dt;
          if (h.burn >= 6) { const b = h.burn; h.burn = 0; this.damageHunter(h, b); }
        }
      }
      if ((this.fireFx -= dt) <= 0) {
        this.fireFx = 0.08;
        const f = this.fireTrail[Math.floor(this.rand() * this.fireTrail.length)];
        if (f) this.fx.burst(f.x + (this.rand() - 0.5) * 0.8, 0.2, f.z + (this.rand() - 0.5) * 0.8, 3, this.rand() < 0.5 ? 0xff7a1a : 0xffc23a, 1.2, 0.35, 0.5, -3, 0.4);
      }
    }

    damageMonster(dmg) {
      const pl = this.mon;
      if (pl.iframes > 0 || this.state !== 'playing') return;
      if (pl.evolveT > 0) dmg *= 1.25;           // caught mid-evolution
      if (pl.staggerT > 0) dmg *= 1 + PH.MONSTER_MODE.stagger.vuln;
      const jug = this.mut('juggernaut');
      if (jug && pl.rollT > 0) dmg *= 1 - jug.guard;
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
      if (pl.hp <= 0) return this.end(false, 'slain');
      pl.staggerAcc += dmg;
      this.kit.peak = Math.max(this.kit.peak || 0, pl.staggerAcc / (this.stageDef().stagger * this.def().hp));
      if (pl.staggerAcc >= this.stageDef().stagger * this.def().hp && this.time >= pl.staggerImmune && pl.staggerT <= 0
        && pl.evolveT <= 0 && pl.leapT <= 0 && pl.diveT <= 0) this.stagger();
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
     * The monster's brain, for Hunter Squad and the balance sim. It can smell
     * the squad (like the radar in monster mode). A few times a second it
     * weighs what it could do and commits to the best plan for a while:
     *   feed    eat wildlife to grow, away from where the squad is;
     *   hide    sit in grass far from them while its armour grows back;
     *   ambush  hidden and unseen with hunters walking closer: keep still,
     *           then spring on the first one in reach;
     *   fight   go after one hunter - the hurt, the isolated, the medic, a
     *           downed one nobody is guarding - with its special and pounce,
     *           until that hunter drops or the fight has cost too much;
     *   flee    break away toward grass, using its special to escape.
     * A trapped monster fights, and a lone hunter who runs ahead of the squad
     * gets turned on. How eager it is depends on the monster (config `ai`),
     * its stage, its health and how many hunters are close, with a little
     * chance in every choice, so no two hunts play out the same.
     */
    aiControl() {
      const pl = this.mon, inp = this.monInput, P = this.def().ai, A = this.def().ability;
      if (!this.brain) {
        this.brain = { mode: 'feed', think: 0, lock: 0, target: null, start: 0, startTough: 1, fightCd: this.time + 8, at: this.time,
          stats: { fights: 0, downs: 0, time: {} } };
      }
      const B = this.brain;
      B.stats.time[B.mode] = (B.stats.time[B.mode] || 0) + (this.time - B.at);
      B.at = this.time;
      const d = (a, b = pl) => Math.hypot(a.x - b.x, a.z - b.z);
      const ups = this.hunters.filter((h) => h.state === 'up');
      if (this.time >= B.think) { B.think = this.time + 0.3 + this.rand() * 0.2; this.aiThink(ups); }

      // Evolving is loud and leaves it rooted: only with nobody close.
      if (this.canEvolve() && !ups.some((h) => d(h) < 13)) this.monsterEvolve();

      const aim = (x, z) => { const m = Math.hypot(x, z) || 1; inp.x = x / m; inp.z = z / m; };
      const dome = this.zones.find((z) => z.kind === 'arena');
      let ix = 0, iz = 0;
      let nearest = null;
      for (const h of ups) if (!nearest || d(h) < d(nearest)) nearest = h;

      if (B.mode === 'fight' || B.mode === 'ambush') {
        const t = B.target;
        const valid = t && (t.state === 'up' || t.state === 'down');
        if (!valid) { B.think = 0; }
        if (B.mode === 'ambush') {
          // Hold still in the grass; spring when one walks into reach.
          const reach = this.stageDef().reach + pl.radius + 2.2;
          if (nearest && (d(nearest) < reach || (this.monAbilityCd <= 0 && this.inAbilityRange(nearest, d(nearest))))) {
            this.startFight(nearest, true);
          }
        }
        if (B.mode === 'fight' && valid) {
          const dist = d(t), dx = (t.x - pl.x) / (dist || 1), dz = (t.z - pl.z) / (dist || 1);
          const keep = P.keep && t.state === 'up' && !dome && this.stage < 3 ? P.keep : 0;
          if (keep && dist < keep - 1.5) { ix = -dx - dz * 0.6; iz = -dz + dx * 0.6; }        // a caster backs off, circling
          else if (keep && dist < keep + 1) { ix = -dz; iz = dx; }
          else { ix = dx; iz = dz; }
          if (this.monAbilityCd <= 0 && t.state === 'up' && this.inAbilityRange(t, dist)) { aim(dx, dz); this.monsterAbility(); }
          const reach = this.stageDef().reach + pl.radius;
          if (!keep && this.monDodgeCd <= 0 && dist > reach + 0.8 && dist < 6.5) { aim(dx, dz); this.monsterPounce(); }
        }
      }

      if (B.mode === 'flee' || B.mode === 'hide') {
        // Head for the grass patch furthest from the squad, relative to us.
        const away = { x: 0, z: 0 };
        for (const h of ups) { const dd = d(h) || 1, w = 1 / Math.max(3, dd); away.x -= (h.x - pl.x) / dd * w; away.z -= (h.z - pl.z) / dd * w; }
        let best = null, bs = -Infinity;
        for (const gr of this.grass) {
          let threat = 0;
          for (const h of ups) threat += 1 / Math.max(2, d(gr, h));
          const dd = d(gr) || 1, dir = ((gr.x - pl.x) * away.x + (gr.z - pl.z) * away.z) / dd;
          const score = (B.mode === 'flee' ? dir * 6 : 0) - dd * (B.mode === 'flee' ? 0.12 : 0.06) - threat * 9;
          if (score > bs) { bs = score; best = gr; }
        }
        if (best && d(best) > best.r * 0.45) { ix = best.x - pl.x; iz = best.z - pl.z; }
        if (B.mode === 'flee') {
          const am = Math.hypot(away.x, away.z);
          if (am > 0.001) { const m = Math.hypot(ix, iz) || 1; ix = ix / m + away.x / am * 1.2; iz = iz / m + away.z / am * 1.2; }
          const nd = nearest ? d(nearest) : 99;
          if (nd < 4.5 && this.monDodgeCd <= 0) { aim(ix, iz); this.monsterPounce(); }
          // Its special as a way out: jump, warp, dive or roll clear - or a bolt at whoever is closest.
          if (nd < 5.5 && this.monAbilityCd <= 0 && (pl.hp + pl.armor) / (pl.maxHp + pl.maxArmor) < 0.3) {
            if (A.id === 'lightning') this.monsterAbility();
            else { aim(ix, iz); this.monsterAbility(); }
          }
        }
      } else if (B.mode === 'feed') {
        // The nearest prey, but not if the squad is standing around it.
        let best = null, bs = Infinity;
        for (const e of this.enemies) {
          if (!e.alive) continue;
          let risk = 0;
          for (const h of ups) risk += Math.max(0, 14 - d(e, h));
          const s = d(e) + risk * 1.5;
          if (s < bs) { bs = s; best = e; }
        }
        if (best) { ix = best.x - pl.x; iz = best.z - pl.z; }
      }

      // Roar when crowded, when someone is reviving a hunter it downed, or to shake off a chaser.
      const R = PH.MONSTER_MODE.roar;
      if (this.stage >= R.stage && this.monRoarCd <= 0) {
        const inRoar = ups.filter((h) => d(h) < R.r);
        const reviving = inRoar.some((h) => this.hunters.some((o) => o.state === 'down' && o.reviveT > 0.4 && d(o, h) < 2));
        if (inRoar.length >= 2 || reviving || (B.mode === 'flee' && nearest && d(nearest) < 3.5)) this.monsterRoar();
      }

      // Snares: it notices some as it comes near (about half), and steps around those.
      for (const z of this.zones) {
        if (z.kind !== 'snare') continue;
        const zd = d(z);
        if (zd > 4) continue;
        if (z.noticed === undefined) z.noticed = this.rand() < 0.5;
        if (!z.noticed || zd < 0.01) continue;
        const m = Math.hypot(ix, iz) || 1, w = (4 - zd) / 4 * 1.6;
        ix = ix / m + (pl.x - z.x) / zd * w; iz = iz / m + (pl.z - z.z) / zd * w;
      }

      const r = Math.hypot(pl.x, pl.z);
      if (r > PH.MONSTER_MODE.arena - 4 && !(B.mode === 'fight' && dome)) { const m = Math.hypot(ix, iz) || 1; ix = ix / m - pl.x / r * 0.6; iz = iz / m - pl.z / r * 0.6; }
      const m = Math.hypot(ix, iz);
      inp.x = m > 0.001 ? ix / m : 0; inp.z = m > 0.001 ? iz / m : 0;
    }

    /** Would its special land on a hunter this far away, aimed straight at them? */
    inAbilityRange(t, dist) {
      const A = this.def().ability;
      if (A.id === 'lightning') return dist < A.range;
      if (A.id === 'leap') { const meteor = this.mut('meteor'), reach = A.dist * (meteor ? meteor.dist : 1); return Math.abs(dist - reach) < A.r * 0.9; }
      if (A.id === 'warp') return Math.abs(dist - A.dist) < A.r * 0.9;
      if (A.id === 'dive') { const sky = this.mut('skyborne'); return dist < A.dist * (sky ? sky.dist : 1) * 0.85; }
      if (A.id === 'roll') return dist < A.dur * A.speed * 0.6;
      return false;
    }

    startFight(t, fromAmbush) {
      const B = this.brain, pl = this.mon;
      if (B.mode !== 'fight') { B.start = this.time; B.startTough = (pl.hp + pl.armor) / (pl.maxHp + pl.maxArmor); B.stats.fights++; }
      this.setMode('fight');
      B.target = t;
      B.ambushed = !!fromAmbush;
    }

    /** The planner: score each plan, keep the current one unless another is clearly better. */
    aiThink(ups) {
      const B = this.brain, pl = this.mon, P = this.def().ai, M = PH.MONSTER_MODE;
      const d = (a, b = pl) => Math.hypot(a.x - b.x, a.z - b.z);
      const tough = (pl.hp + pl.armor) / (pl.maxHp + pl.maxArmor);
      const downs = this.hunters.filter((h) => h.state === 'down');
      const near = ups.filter((h) => d(h) < 10), close = ups.filter((h) => d(h) < 6);
      const dome = this.zones.find((z) => z.kind === 'arena');
      const trapped = !!dome && d(dome) < dome.r;
      const endgame = this.time > M.duration - 50 && this.stage < 3;
      const ready = this.monAbilityCd <= 0;
      const noise = () => (this.rand() - 0.5) * 0.18;
      const S = this.stage - 1;

      // A fight that has cost too much, or dragged on, ends (unless there is no way out).
      if (B.mode === 'fight') {
        const lost = B.startTough - tough;
        const budget = P.burst * [0.16, 0.2, 0.4][S];
        const long = this.time - B.start > [6, 7, 18][S];
        const finishing = B.target && B.target.state === 'up' && B.target.hp / B.target.maxHp < 0.25;
        if ((lost > budget || long) && !finishing) { this.endFight(); this.setMode(near.length || trapped ? 'flee' : 'hide'); return; }
        // Hit and run: before stage 3 it usually takes the down and gets out.
        const dropped = B.target && B.target.state === 'down' && B.target !== B.finishing;
        if (dropped && this.stage < 3 && !trapped && this.rand() < 0.65) { this.endFight(); this.setMode('flee'); return; }
      }
      // A plan, once made, holds for a moment - unless its target is gone or a dome just closed on it.
      const targetGone = B.mode === 'fight' && !(B.target && (B.target.state === 'up' || (B.target.state === 'down' && B.target === B.finishing)));
      if (this.time < B.lock && !targetGone && !(trapped && B.mode !== 'fight' && B.mode !== 'flee')) return;

      // Who is worth going after: hurt, alone, a healer or the trapper, or downed and unguarded.
      const PRIORITY = { medic: 0.3, trapper: dome ? 0.3 : 0.15, support: 0.1, ranger: 0.08, assault: 0 };
      let best = null, bs = -Infinity;
      for (const h of [...ups, ...downs]) {
        if (trapped && d(h, dome) > dome.r) continue;     // it cannot get at anyone outside the dome
        let s;
        if (h.state === 'down') {
          const guards = ups.filter((o) => d(o, h) < 5).length;
          s = 0.7 - d(h) / 14 - guards * 0.5;
        } else {
          let iso = 20;
          for (const o of ups) if (o !== h) iso = Math.min(iso, d(o, h));
          s = (1 - h.hp / h.maxHp) * 0.6 + Math.min(1, iso / 12) * 0.55 + PRIORITY[h.cls] - d(h) / 18;
        }
        if (h === B.target) s += 0.15;
        if (s > bs) { bs = s; best = h; }
      }
      B.finishing = best && best.state === 'down' ? best : null;    // a downed target was chosen, not inherited
      let danger = 0;
      for (const h of near) danger += h.hp / h.maxHp;
      const lone = !trapped && close.length === 1 && near.length === 1;     // one hunter ran ahead of the rest
      const strike = best && best.state === 'up' && ready && this.inAbilityRange(best, d(best));
      const stageAggro = [0, 0.06, 0.5][S];
      let nearestD = 99;
      for (const h of ups) nearestD = Math.min(nearestD, d(h));

      const sc = {
        fight: best ? P.aggro + stageAggro + bs * 0.45 + (ready ? 0.12 : 0) + (strike ? 0.2 : 0) + (trapped ? 0.45 : 0) + (lone ? 0.35 : 0)
          - Math.max(0, danger - 1.5) * 0.12 - Math.max(0, 0.45 - tough) * 2.2 - (endgame ? 0.25 : 0)
          - (this.time < B.fightCd && !trapped && !lone ? 0.55 : 0) + noise() : -9,
        // Trapped, fleeing is only keeping away from them inside the dome.
        flee: near.length ? 0.32 + danger * 0.12 + (1 - tough) * 0.7 + (endgame ? 0.2 : 0) - (trapped ? 0.35 : 0) + noise() : -9,
        hide: !near.length ? 0.15 + (1 - pl.armor / pl.maxArmor) * 0.5 + (endgame ? 0.35 : 0) - (this.spotted ? 0.3 : 0) + noise() : -9,
        feed: !near.length && this.stage < 3 ? 0.5 + noise() : -9,
        ambush: pl.hidden && !this.spotted && !trapped && nearestD < 11 && tough > 0.4
          ? 0.5 + P.aggro * 0.5 + stageAggro + (downs.some((h) => d(h) < 10) ? 0.25 : 0) - (endgame ? 0.2 : 0)
            - (this.time < B.fightCd ? 0.5 : 0) + noise() : -9,
      };
      if (sc[B.mode] > -9) sc[B.mode] += 0.15;          // stick with a plan unless another is clearly better
      let mode = 'feed', top = -Infinity;
      for (const k in sc) if (sc[k] > top) { top = sc[k]; mode = k; }
      if (top <= -9) mode = this.stage < 3 ? 'feed' : 'hide';
      if (mode === 'fight') this.startFight(best, false);
      else {
        if (B.mode === 'fight') this.endFight();
        this.setMode(mode);
      }
    }

    setMode(mode) {
      const B = this.brain;
      if (B.mode !== mode) B.lock = this.time + ({ fight: 3, flee: 2.5, hide: 3, feed: 2, ambush: 2 })[mode];
      B.mode = mode;
      if (mode === 'ambush') B.target = null;
    }

    endFight() {
      const B = this.brain;
      B.fightCd = this.time + 9 + this.rand() * 9;
      B.target = null;
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
      const fr = this.mut('frenzy'), k = fr ? fr.food : 1;
      if (this.stage < 3) this.food = Math.min(this.stageDef().food, this.food + def.food * k);
      // Armour first; what does not fit heals at half rate.
      const room = pl.maxArmor - pl.armor, gain = def.armor * k;
      pl.armor = Math.min(pl.maxArmor, pl.armor + gain);
      if (gain > room) pl.hp = Math.min(pl.maxHp, pl.hp + (gain - room) * 0.5);
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
      const quiet = this.mut('silent');
      if (quiet) chance *= quiet.birds;
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
        let range = dome || this.revealT > 0 ? 99 : pl.hidden ? (pl.moving ? M.sightRustle : M.sightHidden) : M.sight;
        if (pl.evolveT > 0) range *= 1.6;
        h.sees = dist2(h.x, h.z, pl.x, pl.z) < (range + pl.radius) ** 2;
        if (h.sees) seen = true;
      }
      if (seen) T.known = { x: pl.x, z: pl.z, t: this.time };
      this.spotted = seen;
      const age = T.known ? this.time - T.known.t : Infinity;
      const engage = age < 2.5;
      this.laySnares(dt, engage, up);

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

    /** The trapper lays a snare on the trail while the squad is tracking (not fighting). */
    laySnares(dt, engage, up) {
      const T = this.team, SN = PH.HUNTER_AI.trapper.snare;
      if ((T.snareCd -= dt) > 0) return;
      const trapper = up.find((h) => h.cls === 'trapper');
      if (!trapper || engage) { T.snareCd = 2; return; }
      const traps = this.zones.filter((z) => z.kind === 'snare');
      if (traps.length >= SN.max) { T.snareCd = 3; return; }
      // The freshest footprint within throwing range, else at its feet if the trail is warm.
      let spot = null;
      for (let i = this.tracks.length - 1; i >= Math.max(0, this.tracks.length - 14); i--) {
        const k = this.tracks[i];
        if (dist2(k.x, k.z, trapper.x, trapper.z) < 100) { spot = k; break; }
      }
      if (!spot && T.known && dist2(T.known.x, T.known.z, trapper.x, trapper.z) < 225) spot = trapper;
      if (!spot || traps.some((z) => dist2(z.x, z.z, spot.x, spot.z) < 25)) { T.snareCd = 2; return; }
      this.zones.push({ kind: 'snare', x: spot.x, z: spot.z, r: SN.r, t: 0, dur: SN.life });
      T.snareCd = SN.cd;
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
      this.fx.muzzle(h.x, h.z, ux, uz, shot.vis);
      this.sfx('shoot');
    }

    damageHunter(h, dmg) {
      if (h.iframes > 0) return;
      if (h.state === 'up') {
        if (h.shieldT > 0) dmg *= 1 - PH.HUNTER_AI.support.shield.guard;
        if (this.aiMonster) dmg *= PH.HUNT_MODE.aiDamage * (this.def().ai.dmg || 1);     // the AI monster fights, so it hits a little softer
        h.hp -= dmg;
        h.lastHit = this.time;
        h.flash = 0.1;
        // Getting hit tells the squad exactly where you are.
        this.team.known = { x: this.mon.x, z: this.mon.z, t: this.time };
        if (this.hunterNumbers !== false && this.hooks.onDamage) this.hooks.onDamage(h.x, 2, h.z, dmg, false);
        if (this.onHunterHurt) this.onHunterHurt(h, dmg);
        if (h.hp <= 0) {
          h.hp = 0; h.state = 'down'; h.downT = PH.HUNTER_AI.bleedOut; h.reviveT = 0;
          if (this.brain) this.brain.stats.downs++;
          this.banner(`${h.cls.toUpperCase()} IS DOWN`, 'win');
          this.fx.burst(h.x, 1, h.z, 20, 0xff4757, 4, 0.3, 0.6);
          this.sfx('defeat');
        }
      } else if (h.state === 'down') {
        // Against the AI monster (Hunter Squad), finishing a downed hunter takes
        // a few hits, so the squad has a moment to save them. A player monster
        // finishes them with one.
        if (this.aiMonster) {
          h.downT -= PH.HUNT_MODE.execute;
          h.flash = 0.1;
          if (h.downT <= 0) this.killHunter(h, 'killed');
        } else this.killHunter(h, 'killed');
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
          this.fx.impact(p.x, p.z, 0xffd27a);
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
          if (t.chain) this.chainLightning(t);
        } else if (t.quake) {
          this.aoe(t.x, t.z, t.r, t.quake, 4, 0xff6a3d);
          this.fx.bossSlam(t.x, t.z, t.r);
        }
      }
    }

    /** Chain Lightning: the bolt arcs on to the nearest hunters outside its circle. */
    chainLightning(t) {
      const C = PH.MUTATIONS.chain;
      const outside = this.hunters.filter((h) => h.state === 'up' && dist2(h.x, h.z, t.x, t.z) > (t.r + HUNTER_R) ** 2
        && dist2(h.x, h.z, t.x, t.z) < C.range * C.range);
      outside.sort((a, b) => dist2(a.x, a.z, t.x, t.z) - dist2(b.x, b.z, t.x, t.z));
      const pts = [{ x: t.x, z: t.z }];
      for (const h of outside.slice(0, C.jumps)) {
        pts.push({ x: h.x, z: h.z });
        this.damageHunter(h, t.bolt * C.dmg);
      }
      if (pts.length > 1) this.fx.lightningChain(pts, 0x9be7ff);
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
        biome: this.biomeId, mutations: this.muts ? this.muts.size : 0,
      });
    }
  }

  PH.MonsterGame = MonsterGame;
})();
