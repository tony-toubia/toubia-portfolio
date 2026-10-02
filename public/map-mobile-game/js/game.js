/**
 * Primal Hunt - game logic.
 *
 * Pure simulation: no three.js and no DOM. It reads input from `this.input`,
 * reports to the UI through `hooks`, and asks for visuals through `fx`
 * (PH.Render in the browser, PH.NullRender for headless balance runs). That
 * split is what lets the whole run be simulated at many times real speed to
 * check pacing, which is how the numbers in config.js were tuned.
 */
window.PH = window.PH || {};

(() => {
  const C = PH.CONFIG;
  const TAU = Math.PI * 2;
  const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

  /** Small seeded RNG so two balance runs with the same seed are comparable. */
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

  // Spatial grid: a counting-sort bucket grid centred on the player, rebuilt
  // every step. Cheap for a few hundred creatures and allocation-free.
  const CELL = 2.2, GW = 44;

  class Game {
    constructor(fx, hooks = {}) {
      this.fx = fx;
      this.hooks = hooks;
      this.mode = 'survival';
      this.input = { x: 0, z: 0 };
      this.state = 'menu';
      this.maxEnemies = C.maxEnemies;

      this.enemies = Array.from({ length: C.maxEnemies }, (_, i) => ({ alive: false, idx: i }));
      this.projectiles = Array.from({ length: 420 }, () => ({ alive: false, hits: [] }));
      this.gems = Array.from({ length: C.maxGems }, () => ({ alive: false }));
      this.pickups = Array.from({ length: 12 }, () => ({ alive: false }));

      this.gStart = new Int32Array(GW * GW + 1);
      this.gCursor = new Int32Array(GW * GW);
      this.gItems = new Int32Array(C.maxEnemies);
      this.gCell = new Int32Array(C.maxEnemies);
    }

    /* ── Run lifecycle ──────────────────────────────────────── */

    /** The menu backdrop: your hunter standing on the field, nothing else. */
    attract(classId) {
      this.state = 'menu';
      this.time = 0;
      for (const e of this.enemies) e.alive = false;
      for (const p of this.projectiles) p.alive = false;
      for (const g of this.gems) g.alive = false;
      for (const p of this.pickups) p.alive = false;
      this.lobs = []; this.mines = []; this.telegraphs = []; this.bosses = []; this.droneHits = []; this.zones = [];
      this.weapons = []; this.passives = [];
      this.overdrive = 0; this.hitstop = 0; this.bossKills = 0;
      this.player = { x: 0, z: 0, hp: 1, maxHp: 1, facing: Math.PI * 0.8, moving: false, iframes: 0, radius: 0.42 };
      this.fx.clearRun();
      this.fx.setMonsterMode(false);
      this.fx.setPlayer(classId);
    }

    /**
     * `starter` replaces the class's starting weapon (an unlock; never in the
     * Daily Hunt). The biome comes from the seed unless one is given.
     */
    newRun(classId, seed = (Math.random() * 1e9) | 0, starter = null, biome = null) {
      this.rand = mulberry32(seed);
      this.biomeId = biome && PH.World.BIOMES[biome] ? biome : PH.World.fromSeed(seed);
      PH.World.set(this.biomeId);
      this.poolList = null; this.poolT = 0; this.lavaT = 0; this.hazTick = 0; this.hazardDmg = 0;
      const rub = PH.World.biome.rubble;
      this.rubbleT = rub ? rub.every[0] + 6 : Infinity;
      this.classId = classId;
      this.time = 0;
      this.kills = 0;
      this.bossKills = 0;
      this.level = 1;
      this.xp = 0;
      this.xpNeed = C.xpToNext(1);
      this.pending = [];             // queued level-ups and chests
      this.spawnAcc = 0;
      this.eventIdx = 0;
      this.nextElite = PH.ELITE_EVERY;
      this.nextId = 1;
      this.victoryAt = 0;
      this.apex = null;
      this.timeScale = 1;
      this.slowmo = 0;
      this.hitstop = 0;
      // Signature ability and dodge. The ability starts part-charged so a new
      // player watches the button fill and learns what it is for.
      this.abilityId = PH.CLASSES[classId].ability;
      this.abilityMax = PH.ABILITIES[this.abilityId].cd;
      this.abilityCd = this.abilityMax * 0.4;
      this.dodgeCd = 0;
      this.overdrive = 0;
      this.zones = [];
      this.abilityUses = 0; this.dodges = 0;

      for (const e of this.enemies) e.alive = false;
      for (const p of this.projectiles) p.alive = false;
      for (const g of this.gems) g.alive = false;
      for (const p of this.pickups) p.alive = false;
      this.aliveEnemies = 0;
      this.lobs = [];
      this.mines = [];
      this.telegraphs = [];
      this.bosses = [];
      this.droneHits = [];
      this.dronePool = [];
      this.droneN = 0;
      this.gemMerge = 0;

      // Three of the four original monsters, met in rising evolution stages.
      const pool = Object.keys(PH.BOSSES);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      this.bossOrder = pool.slice(0, 3);

      const P = C.player;
      this.player = {
        x: 0, z: 0, hp: P.hp, maxHp: P.hp, speed: P.speed, radius: P.radius, pickup: P.pickup,
        regen: P.regen, armor: 0, iframes: 0, facing: Math.PI, moving: false, damageTaken: 0,
        dashT: 0, dashX: 0, dashZ: 0, vx: 0, vz: 0, onIce: false, inBog: false,
      };
      this.weapons = [];
      this.passives = [];
      this.addWeapon(starter && PH.WEAPONS[starter] ? starter : PH.CLASSES[classId].weapon);
      this.recompute();
      this.player.hp = this.player.maxHp;
      this.state = 'playing';
      this.fx.clearRun();
      this.fx.setWorld && this.fx.setWorld(this.biomeId);
      this.fx.setMonsterMode(false);
      this.fx.setPlayer(classId);
      const B = PH.World.biome;
      this.banner(`${B.icon} ${B.name.toUpperCase()}`, 'boss');
      if (B.blurb && this.biomeId !== 'meadow') this.hooks.onToast && this.hooks.onToast(`${B.icon} ${B.blurb}`);
      // Build this run's three monsters now, while the screen is changing,
      // rather than mid-fight when each one arrives.
      this.fx.prepareBosses(this.bossOrder.map((type, i) => ({ type, stage: i + 1 })));
    }

    /** Derived stats: base, class perk, then passives. */
    recompute() {
      const m = { damage: 0, cooldown: 0, area: 0, speed: 0, pickup: 0, regen: 0, armor: 0, maxHp: 0, extra: 0 };
      const perk = PH.CLASSES[this.classId].perk;
      for (const k in perk) m[k] += perk[k];
      for (const p of this.passives) {
        const per = PH.PASSIVES[p.id].per;
        for (const k in per) m[k] += per[k] * p.level;
      }
      const P = C.player, pl = this.player;
      const oldMax = pl.maxHp;
      pl.maxHp = P.hp + m.maxHp;
      if (pl.maxHp > oldMax) pl.hp += pl.maxHp - oldMax;   // new max health arrives filled
      pl.speed = P.speed * (1 + m.speed);
      pl.pickup = P.pickup * (1 + m.pickup);
      pl.regen = P.regen + m.regen;
      pl.armor = Math.min(0.6, m.armor);
      this.mods = {
        dmg: 1 + m.damage,
        cd: Math.max(0.45, 1 - m.cooldown),
        area: 1 + m.area,
        extra: m.extra,
      };
    }

    addWeapon(id) {
      const w = this.weapons.find((x) => x.id === id);
      if (w) { w.level = Math.min(5, w.level + 1); return; }
      this.weapons.push({ id, level: 1, timer: 0.4 + this.weapons.length * 0.15, tick: 0 });
    }

    addPassive(id) {
      const p = this.passives.find((x) => x.id === id);
      if (p) p.level = Math.min(PH.PASSIVES[id].max, p.level + 1);
      else this.passives.push({ id, level: 1 });
      this.recompute();
    }

    stats(w) { return w.level > 5 ? PH.EVOLUTIONS[w.id].stats : PH.WEAPONS[w.id].levels[w.level - 1]; }

    /** Level 5 weapon + its paired passive -> the evolved form (level 6). */
    canEvolve(w) {
      const evo = PH.EVOLUTIONS[w.id];
      return !!evo && w.level === 5 && this.passives.some((p) => p.id === evo.needs);
    }

    evolve(id) {
      const w = this.weapons.find((x) => x.id === id);
      if (!w || !this.canEvolve(w)) return;
      w.level = 6;
      const pl = this.player;
      this.fx.shockwave(pl.x, pl.z, 4.5, 0xffd700, 0.6);
      this.fx.burst(pl.x, 1, pl.z, 40, 0xffd700, 6, 0.4, 0.8, 3, 1);
      this.banner(`${PH.EVOLUTIONS[id].name.toUpperCase()} UNLOCKED`, 'win');
      this.sfx('evolve');
    }

    /* ── Main step ──────────────────────────────────────────── */

    update(dt) {
      if (this.state !== 'playing') return;
      // Hit-stop: a few frames of total stillness when something big lands.
      // It is what makes a hit feel like it connected.
      if (this.hitstop > 0) { this.hitstop -= dt; return; }
      if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.35; }
      this.time += dt;

      this.abilityCd = Math.max(0, this.abilityCd - dt);
      this.dodgeCd = Math.max(0, this.dodgeCd - dt);
      if (this.overdrive > 0) this.overdrive -= dt;
      this.updateHazards(dt);
      this.updatePlayer(dt);
      this.updateZones(dt);
      this.buildGrid();
      this.director(dt);
      this.updateEnemies(dt);
      this.updateBosses(dt);
      this.updateWeapons(dt);
      this.droneHits.length = this.droneN;
      for (let i = 0; i < this.droneN; i++) this.droneHits[i] = this.dronePool[i];
      this.updateProjectiles(dt);
      this.updateLobs(dt);
      this.updateMines(dt);
      this.updateTelegraphs(dt);
      this.updatePickups(dt);

      if (this.player.hp <= 0) return this.end(false);
      if (this.victoryAt && this.time >= this.victoryAt) return this.end(true);
      if (this.pending.length) this.openChoice();
    }

    updatePlayer(dt) {
      const pl = this.player, inp = this.input;
      const mag = Math.min(1, Math.hypot(inp.x, inp.z));
      pl.moving = mag > 0.08;
      if (pl.dashT > 0) {
        // Mid-roll: the dodge owns movement until it ends.
        const D = PH.DODGE, v = D.dist / D.dur;
        pl.dashT -= dt;
        pl.x += pl.dashX * v * dt; pl.z += pl.dashZ * v * dt;
        pl.moving = true;
        pl.vx = pl.dashX * pl.speed; pl.vz = pl.dashZ * pl.speed;   // a roll onto ice keeps sliding
      } else {
        let tx = 0, tz = 0;
        if (pl.moving) {
          const bog = pl.inBog ? 1 - PH.World.biome.pool.slow : 1;
          const k = pl.speed * bog * mag / Math.hypot(inp.x, inp.z);
          tx = inp.x * k; tz = inp.z * k;
          pl.facing = Math.atan2(inp.x, inp.z);
        } else {
          const t = this.nearest(pl.x, pl.z, 12);
          if (t) pl.facing = Math.atan2(t.x - pl.x, t.z - pl.z);
        }
        if (pl.onIce) {
          // On ice your speed only slowly follows the stick: you slide.
          const a = 1 - Math.exp(-dt * PH.World.biome.pool.grip);
          pl.vx = (pl.vx || 0) + (tx - (pl.vx || 0)) * a; pl.vz = (pl.vz || 0) + (tz - (pl.vz || 0)) * a;
          if (Math.hypot(pl.vx, pl.vz) > 0.4) pl.moving = true;
        } else { pl.vx = tx; pl.vz = tz; }
        pl.x += pl.vx * dt; pl.z += pl.vz * dt;
      }
      if (pl.iframes > 0) pl.iframes -= dt;
      if (pl.regen > 0) pl.hp = Math.min(pl.maxHp, pl.hp + pl.regen * dt);
    }

    /**
     * The biome's hazard. Pools near you are looked up twice a second; bog
     * slows whoever wades in, ice makes you slide (see updatePlayer), lava
     * burns, and in the ruins rubble falls near you every so often.
     */
    updateHazards(dt) {
      const W = PH.World, B = W.biome, P = B.pool, pl = this.player;
      if (P.kind !== 'water') {
        this.poolT -= dt;
        if (this.poolT <= 0 || !this.poolList) { this.poolT = 0.5; this.poolList = W.poolsNear(pl.x, pl.z, 24); }
        const pools = this.poolList;
        const here = pools.length && pl.dashT <= 0 ? W.inPool(pl.x, pl.z, pools) : null;
        pl.onIce = P.kind === 'ice' && !!here;
        pl.inBog = P.kind === 'bog' && !!here;
        if (P.kind === 'lava' && here) {
          this.lavaT -= dt;
          if (this.lavaT <= 0) {
            this.lavaT = 0.35;
            const d = P.dps * 0.35 * (1 - pl.armor);
            pl.hp -= d; pl.damageTaken += d; this.hazardDmg = (this.hazardDmg || 0) + d;
            this.hooks.onPlayerHit && this.hooks.onPlayerHit(d);
            this.fx.burst(pl.x, 0.3, pl.z, 6, 0xff7a1a, 2.5, 0.25, 0.45, -4, 0.8);
          }
        } else this.lavaT = 0;
        // Creatures: bog slows them, lava burns them.
        this.hazTick += dt;
        if (this.hazTick >= 0.25 && pools.length) {
          const k = this.hazTick;
          this.hazTick = 0;
          for (const e of this.enemies) {
            if (!e.alive || !W.inPool(e.x, e.z, pools)) continue;
            if (P.kind === 'bog') e.bogT = 0.3;
            else if (P.kind === 'lava') this.hitEnemy(e, P.enemyDps * k / this.mods.dmg, 0, 0, 0, false);
          }
        }
      }
      // Ruins: rubble falls around you, some of it on where you are heading.
      const R = B.rubble;
      if (R && (this.rubbleT -= dt) <= 0) {
        this.rubbleT = R.every[0] + this.rand() * (R.every[1] - R.every[0]);
        for (let i = 0; i < R.count; i++) {
          const lead = i === 0 ? 1.2 : 0;
          const a = this.rand() * Math.PI * 2, d = i === 0 ? 0.6 : 1.5 + this.rand() * R.near;
          const x = pl.x + (pl.vx || 0) * lead + Math.cos(a) * d, z = pl.z + (pl.vz || 0) * lead + Math.sin(a) * d;
          this.telegraphs.push({ shape: 'circle', x, z, r: R.r, t: 0, dur: R.delay + i * 0.18, color: 0xd9b27a, rubble: R.dmg, rubbleE: R.enemyDmg });
        }
      }
    }

    damagePlayer(amount) {
      const pl = this.player;
      if (pl.iframes > 0 || this.state !== 'playing') return;
      let d = amount * (1 - pl.armor);
      if (this.apex) d *= 1 + PH.APEX.dmg * this.apex.wave;      // the Apex Hunt hits harder every wave
      if (this.zones.some((z) => z.kind === 'dome')) d *= 1 - PH.ABILITIES.dome.guard;
      if (amount >= 20) this.hitstop = Math.max(this.hitstop, 0.07);   // boss attacks land hard
      pl.hp -= d;
      pl.damageTaken += d;
      pl.iframes = C.player.iframes;
      this.fx.addShake(0.35);
      this.hooks.onPlayerHit && this.hooks.onPlayerHit(d);
      this.sfx('damage');
    }

    sfx(name) { this.hooks.sfx && this.hooks.sfx(name); }

    /* ── Abilities and dodge ────────────────────────────────── */

    abilityReady() { return this.abilityCd <= 0; }

    useAbility() {
      if (this.state !== 'playing' || this.abilityCd > 0) return false;
      const id = this.abilityId, A = PH.ABILITIES[id], pl = this.player;
      this.abilityMax = A.cd * this.mods.cd;
      this.abilityCd = this.abilityMax;
      this.abilityUses++;
      this.hitstop = Math.max(this.hitstop, 0.05);
      if (id === 'overdrive') {
        this.overdrive = A.dur;
        this.fx.shockwave(pl.x, pl.z, 3, 0xff8a3d, 0.4);
        this.fx.burst(pl.x, 1, pl.z, 30, 0xffb347, 5, 0.35, 0.6, 2, 1);
        this.banner('OVERDRIVE', 'warn');
      } else if (id === 'snare') {
        const r = A.radius * this.mods.area;
        this.query(pl.x, pl.z, r, (e) => { e.rootT = A.dur; this.hitEnemy(e, A.dmg, 0, 0, 0); });
        for (const b of this.bosses) if (dist2(b.x, b.z, pl.x, pl.z) < (r + b.radius) ** 2) b.slowT = A.dur;
        this.zones.push({ kind: 'snare', x: pl.x, z: pl.z, r, t: 0, dur: A.dur });
        this.fx.shockwave(pl.x, pl.z, r, 0x4ecdc4, 0.35);
      } else if (id === 'pulse') {
        const r = A.radius * this.mods.area;
        pl.hp = Math.min(pl.maxHp, pl.hp + A.heal);
        this.query(pl.x, pl.z, r, (e) => {
          const dx = e.x - pl.x, dz = e.z - pl.z, d = Math.hypot(dx, dz) || 1;
          this.hitEnemy(e, A.dmg, dx / d, dz / d, A.knock);
        });
        for (const b of this.bosses) if (dist2(b.x, b.z, pl.x, pl.z) < (r + b.radius) ** 2) this.hitEnemy(b, A.dmg);
        this.fx.shockwave(pl.x, pl.z, r, 0xff6b9d, 0.45);
        this.fx.burst(pl.x, 1, pl.z, 26, 0x7dffb0, 4, 0.35, 0.7, -1, 0.8);
        this.sfx('heal');
      } else if (id === 'dome') {
        this.zones = this.zones.filter((z) => z.kind !== 'dome');
        this.zones.push({ kind: 'dome', x: pl.x, z: pl.z, r: A.radius * this.mods.area, t: 0, dur: A.dur });
        this.fx.shockwave(pl.x, pl.z, A.radius, 0x6fc3ff, 0.35);
      }
      this.fx.addShake(0.25);
      this.sfx('ability');
      return true;
    }

    dodge() {
      if (this.state !== 'playing' || this.dodgeCd > 0) return false;
      const pl = this.player, inp = this.input, D = PH.DODGE;
      let dx = inp.x, dz = inp.z, m = Math.hypot(dx, dz);
      if (m < 0.08) { dx = Math.sin(pl.facing); dz = Math.cos(pl.facing); m = 1; }
      pl.dashX = dx / m; pl.dashZ = dz / m;
      pl.dashT = D.dur;
      pl.facing = Math.atan2(pl.dashX, pl.dashZ);
      pl.iframes = Math.max(pl.iframes, D.iframes);
      this.dodgeCd = D.cd;
      this.dodges++;
      this.fx.dashTrail(pl.x, pl.z, pl.dashX, pl.dashZ, D.dist);
      this.sfx('dash');
      return true;
    }

    /** Snare webs sit where they were cast; the dome travels with you. */
    updateZones(dt) {
      const pl = this.player;
      for (let i = this.zones.length - 1; i >= 0; i--) {
        const z = this.zones[i];
        z.t += dt;
        if (z.kind === 'dome') { z.x = pl.x; z.z = pl.z; }
        if (z.t >= z.dur) this.zones.splice(i, 1);
      }
    }

    /* ── Spatial grid ───────────────────────────────────────── */

    buildGrid() {
      const ox = this.player.x - GW * CELL / 2, oz = this.player.z - GW * CELL / 2;
      this.gox = ox; this.goz = oz;
      const start = this.gStart, cellOf = this.gCell, E = this.enemies;
      start.fill(0);
      for (let i = 0; i < E.length; i++) {
        const e = E[i];
        if (!e.alive) { cellOf[i] = -1; continue; }
        const cx = Math.floor((e.x - ox) / CELL), cz = Math.floor((e.z - oz) / CELL);
        if (cx < 0 || cz < 0 || cx >= GW || cz >= GW) { cellOf[i] = -1; continue; }
        const c = cz * GW + cx;
        cellOf[i] = c;
        start[c + 1]++;
      }
      for (let c = 1; c <= GW * GW; c++) start[c] += start[c - 1];
      const cur = this.gCursor;
      cur.set(start.subarray(0, GW * GW));
      for (let i = 0; i < E.length; i++) {
        const c = cellOf[i];
        if (c >= 0) this.gItems[cur[c]++] = i;
      }
    }

    /** Call fn(enemy) for every live creature within r of (x, z). */
    query(x, z, r, fn) {
      const ox = this.gox, oz = this.goz;
      const x0 = Math.max(0, Math.floor((x - r - 1 - ox) / CELL)), x1 = Math.min(GW - 1, Math.floor((x + r + 1 - ox) / CELL));
      const z0 = Math.max(0, Math.floor((z - r - 1 - oz) / CELL)), z1 = Math.min(GW - 1, Math.floor((z + r + 1 - oz) / CELL));
      const E = this.enemies, start = this.gStart, items = this.gItems;
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          const c = cz * GW + cx;
          for (let k = start[c]; k < start[c + 1]; k++) {
            const e = E[items[k]];
            if (!e.alive) continue;
            const rr = r + e.radius;
            if (dist2(x, z, e.x, e.z) <= rr * rr && fn(e) === false) return;
          }
        }
      }
    }

    /** Nearest target - a creature or a boss - within range. */
    nearest(x, z, range, exclude) {
      let best = null, bd = range * range;
      for (const e of this.enemies) {
        if (!e.alive || (exclude && exclude.has(e))) continue;
        const d = dist2(x, z, e.x, e.z);
        if (d < bd) { bd = d; best = e; }
      }
      for (const b of this.bosses) {
        if (exclude && exclude.has(b)) continue;
        const d = dist2(x, z, b.x, b.z) - b.radius * b.radius;
        if (d < bd) { bd = d; best = b; }
      }
      return best;
    }

    /* ── Spawning ───────────────────────────────────────────── */

    waveAt(t) {
      const W = PH.WAVES;
      let i = 0;
      while (i < W.length - 1 && W[i + 1].t <= t) i++;
      const a = W[i], b = W[i + 1];
      if (!b) return { rate: a.rate + (t - a.t) * 0.03, mix: a.mix };
      const k = (t - a.t) / (b.t - a.t);
      return { rate: a.rate + (b.rate - a.rate) * k, mix: a.mix };
    }

    pickType(mix) {
      let total = 0;
      for (const k in mix) total += mix[k];
      let r = this.rand() * total;
      for (const k in mix) { r -= mix[k]; if (r <= 0) return k; }
      return Object.keys(mix)[0];
    }

    /** A point just off screen, so creatures walk in rather than pop in. */
    spawnPoint(bias = null) {
      const v = this.fx.view, pl = this.player, m = 1.8;
      const w = v.maxX - v.minX + m * 2, h = v.maxZ - v.minZ + m * 2;
      let side = this.rand() * (w * 2 + h * 2);
      if (bias) {
        // Prefer the edge the player is heading toward.
        if (Math.abs(bias.x) > Math.abs(bias.z)) side = bias.x > 0 ? w * 2 + h + this.rand() * h : w * 2 + this.rand() * h;
        else side = bias.z > 0 ? w + this.rand() * w : this.rand() * w;
      }
      let x, z;
      if (side < w) { x = v.minX - m + side; z = v.minZ - m; }
      else if (side < w * 2) { x = v.minX - m + (side - w); z = v.maxZ + m; }
      else if (side < w * 2 + h) { x = v.minX - m; z = v.minZ - m + (side - w * 2); }
      else { x = v.maxX + m; z = v.minZ - m + (side - w * 2 - h); }
      return { x: pl.x + x, z: pl.z + z };
    }

    spawnEnemy(type, x, z, opts = {}) {
      if (this.aliveEnemies >= this.cap()) return null;
      const e = this.enemies.find((q) => !q.alive);
      if (!e) return null;
      const def = PH.ENEMIES[type];
      const elite = !!opts.elite;
      const hp = def.hp * C.hpScale(this.time) * (elite ? 9 : 1);
      Object.assign(e, {
        alive: true, type, x, z, kx: 0, kz: 0, hp, maxHp: hp,
        speed: def.speed * (elite ? 0.9 : 1) * (0.92 + this.rand() * 0.16),
        dmg: def.dmg * (elite ? 1.6 : 1), radius: def.radius * (elite ? 1.5 : 1),
        scale: elite ? 1.5 : 1, elite, flash: 0, facing: 0, phase: this.rand() * TAU,
        spit: def.ranged ? def.ranged.cd * (0.5 + this.rand()) : 0,
        charge: opts.charge || null, chargeT: opts.chargeT || 0, rootT: 0,
      });
      // One timestamp per drone. A single shared one meant every drone after
      // the first bounced off whatever the first had just hit - six drones on
      // a boss dealt the damage of one.
      if (!e.droneT) e.droneT = new Float32Array(8);
      e.droneT.fill(-1);
      this.aliveEnemies++;
      return e;
    }

    cap() { return this.fx.qualityLevel > 0 ? C.maxEnemiesLow : this.maxEnemies; }

    director(dt) {
      const wave = this.waveAt(this.time);
      const bossUp = this.bosses.length > 0;
      const apexK = this.apex ? 1 + PH.APEX.swarm * this.apex.wave : 1;
      this.spawnAcc += wave.rate * apexK * (bossUp ? 0.55 : 1) * dt;
      if (this.apex) this.updateApex();
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        const p = this.spawnPoint();
        this.spawnEnemy(this.pickType(wave.mix), p.x, p.z);
      }

      if (this.time >= this.nextElite) {
        this.nextElite += PH.ELITE_EVERY;
        const p = this.spawnPoint();
        this.spawnEnemy(this.pickType(wave.mix), p.x, p.z, { elite: true });
      }

      while (this.eventIdx < PH.EVENTS.length && this.time >= PH.EVENTS[this.eventIdx].t) {
        this.runEvent(PH.EVENTS[this.eventIdx++]);
      }
    }

    runEvent(ev) {
      const pl = this.player, v = this.fx.view;
      const reach = Math.max(v.maxX - v.minX, v.maxZ - v.minZ) * 0.42 + 2;
      if (ev.type === 'ring') {
        for (let i = 0; i < ev.count; i++) {
          const a = (i / ev.count) * TAU;
          this.spawnEnemy(ev.enemy, pl.x + Math.cos(a) * reach, pl.z + Math.sin(a) * reach);
        }
        this.banner(ev.text);
      } else if (ev.type === 'stampede') {
        // A herd that runs straight across rather than homing: dodge it or eat it.
        const a = this.rand() * TAU, dx = Math.cos(a), dz = Math.sin(a);
        const ox = pl.x - dx * (reach + 6), oz = pl.z - dz * (reach + 6);
        for (let i = 0; i < ev.count; i++) {
          const side = (i - ev.count / 2) * 0.55, back = (i % 4) * 0.9;
          this.spawnEnemy(ev.enemy, ox - dz * side - dx * back, oz + dx * side - dz * back, { charge: { x: dx, z: dz }, chargeT: 7 });
        }
        this.banner(ev.text);
      } else if (ev.type === 'boss') {
        this.spawnBoss(this.bossOrder[ev.stage - 1], ev.stage, !!ev.final);
      }
    }

    banner(text, kind = 'warn') { this.hooks.onBanner && this.hooks.onBanner(text, kind); }

    /* ── Creatures ──────────────────────────────────────────── */

    updateEnemies(dt) {
      const pl = this.player, E = this.enemies;
      const despawn2 = C.despawnRadius * C.despawnRadius;
      for (let i = 0; i < E.length; i++) {
        const e = E[i];
        if (!e.alive) continue;
        const def = PH.ENEMIES[e.type];
        let dx = pl.x - e.x, dz = pl.z - e.z;
        const d = Math.hypot(dx, dz) || 0.001;
        dx /= d; dz /= d;

        let mvx = dx, mvz = dz, spd = e.speed;
        if (e.rootT > 0) {
          e.rootT -= dt;
          spd = 0;
        } else if (e.charge && e.chargeT > 0) {
          e.chargeT -= dt;
          mvx = e.charge.x; mvz = e.charge.z; spd = e.speed * 1.6;
        } else if (def.ranged) {
          // Spitters hold at range and lob; they back off if you rush them.
          const R = def.ranged;
          if (d < R.range * 0.7) { mvx = -dx; mvz = -dz; spd *= 0.6; }
          else if (d < R.range) { spd = 0; }
          e.spit -= dt;
          if (e.spit <= 0 && d < R.range + 1) {
            e.spit = R.cd;
            this.fireHostile(e.x, e.z, dx, dz, R.speed, R.dmg, 0.75, 0.92, 0.25);
          }
        }

        if (e.bogT > 0) { e.bogT -= dt; spd *= 1 - PH.World.biome.pool.slow; }
        e.x += (mvx * spd + e.kx) * dt;
        e.z += (mvz * spd + e.kz) * dt;
        const kd = Math.exp(-dt * 9);
        e.kx *= kd; e.kz *= kd;
        if (spd > 0) e.facing = Math.atan2(mvx, mvz);
        if (e.flash > 0) e.flash -= dt;

        // Push apart from neighbours so the swarm reads as a crowd, not one blob.
        // Written inline rather than through query(): this runs for every
        // creature every step, and a callback per creature was ~18k short-lived
        // allocations a second - garbage-collection pauses are what make a
        // phone game stutter.
        const c = this.gCell[i];
        if (c >= 0) {
          const r = e.radius;
          const cx = c % GW, cz = (c / GW) | 0;
          const start = this.gStart, items = this.gItems;
          for (let gz = Math.max(0, cz - 1); gz <= Math.min(GW - 1, cz + 1); gz++) {
            for (let gx = Math.max(0, cx - 1); gx <= Math.min(GW - 1, cx + 1); gx++) {
              const cell = gz * GW + gx;
              for (let k = start[cell]; k < start[cell + 1]; k++) {
                const o = E[items[k]];
                if (o === e || !o.alive) continue;
                const ox = e.x - o.x, oz = e.z - o.z;
                const dd = ox * ox + oz * oz, min = r + o.radius;
                if (dd > 0.0001 && dd < min * min) {
                  const dl = Math.sqrt(dd), push = (min - dl) * 0.5 / dl;
                  e.x += ox * push; e.z += oz * push;
                }
              }
            }
          }
        }

        // Shield dome: creatures cannot step inside it.
        for (let zi = 0; zi < this.zones.length; zi++) {
          const zn = this.zones[zi];
          if (zn.kind !== 'dome') continue;
          const ox = e.x - zn.x, oz = e.z - zn.z, rr = zn.r + e.radius, dd = ox * ox + oz * oz;
          if (dd < rr * rr) {
            const dl = Math.sqrt(dd) || 0.001;
            e.x = zn.x + ox / dl * rr; e.z = zn.z + oz / dl * rr;
            e.kx += ox / dl * 2; e.kz += oz / dl * 2;
          }
        }

        // Contact.
        const cr = e.radius + pl.radius;
        if (dist2(e.x, e.z, pl.x, pl.z) < cr * cr) {
          this.damagePlayer(e.dmg);
          e.kx -= dx * 5; e.kz -= dz * 5;
        }

        // Too far behind: recycle ahead of the player rather than delete,
        // so the density you are fighting stays the density the wave intends.
        if (dist2(e.x, e.z, pl.x, pl.z) > despawn2 && !e.elite) {
          const p = this.spawnPoint(this.input);
          e.x = p.x; e.z = p.z; e.charge = null;
        }
      }
    }

    hitEnemy(e, dmg, kx = 0, kz = 0, knock = 0, flash = true) {
      if (!e.alive) return;
      dmg *= this.mods.dmg * (this.overdrive > 0 ? 1 + PH.ABILITIES.overdrive.dmg : 1);
      const crit = this.rand() < 0.08;
      if (crit) dmg *= 2;
      if (e.boss) return this.hitBoss(e, dmg, crit);
      e.hp -= dmg;
      // Damage over time does not flash: a field ticks four times a second,
      // and flashing on every tick strobed everything inside it white.
      if (flash) e.flash = 0.08;
      if (knock) {
        const mass = e.elite ? 4 : PH.ENEMIES[e.type].geo === 'large' ? 3 : 1;
        e.kx += kx * knock / mass; e.kz += kz * knock / mass;
      }
      if (crit && this.hooks.onDamage) this.hooks.onDamage(e.x, 1.2, e.z, dmg, true);
      if (e.hp <= 0) this.killEnemy(e);
    }

    killEnemy(e) {
      e.alive = false;
      this.aliveEnemies--;
      this.kills++;
      const def = PH.ENEMIES[e.type];
      this.fx.enemyDeath(e);
      this.fx.burst(e.x, 0.5, e.z, e.elite ? 30 : 9, def.colors.primary, e.elite ? 6 : 3.5, 0.26, 0.45);
      this.fx.burst(e.x, 0.6, e.z, 3, def.colors.eye, 2.5, 0.2, 0.35);
      this.dropGem(e.x, e.z, def.xp * (e.elite ? 12 : 1));
      if (e.elite) {
        this.dropPickup('chest', e.x, e.z);
        this.fx.addShake(0.25);
        this.fx.shockwave(e.x, e.z, 2.5, 0xffc83d, 0.35);
        this.hitstop = Math.max(this.hitstop, 0.06);
        this.sfx('evolve');
      } else {
        const r = this.rand();
        if (r < 0.006) this.dropPickup('heart', e.x + 0.4, e.z);
        else if (r < 0.0085) this.dropPickup('magnet', e.x + 0.4, e.z);
      }
      this.sfx('hit');
    }

    fireHostile(x, z, dx, dz, speed, dmg, r, g, b) {
      const p = this.projectiles.find((q) => !q.alive);
      if (!p) return;
      Object.assign(p, {
        alive: true, hostile: true, vis: 'orb', x, z, vx: dx * speed, vz: dz * speed,
        dmg, life: 4, radius: 0.28, pierce: 0, r, g, b, aoe: 0,
      });
      p.hits.length = 0;
    }

    /* ── Bosses ─────────────────────────────────────────────── */

    /** `opts` (Apex Hunt): { hp: multiplier, affix: id, variant: colourway, quiet } */
    spawnBoss(type, stage, final, opts = {}) {
      const def = PH.BOSSES[type];
      const p = this.spawnPoint();
      const id = this.nextId++;
      const affix = opts.affix ? PH.APEX.affixes[opts.affix] : null;
      const vis = this.fx.addBoss(id, type, stage, opts.variant, affix && affix.size);
      const hp = def.hp[stage - 1] * (opts.hp || 1) * (affix && affix.hp ? affix.hp : 1);
      const b = {
        id, boss: true, alive: true, type, stage, final, name: affix ? `${affix.name} ${def.name}` : def.name, icon: def.icon,
        x: p.x, z: p.z, hp, maxHp: hp, radius: Math.max(1.1, vis.radius), facing: 0, moving: true,
        state: 'chase', timer: 2.2, attack: null, dash: null, summonT: PH.BOSS_ATTACKS.summonEvery,
        speed: def.speed * (1 + (stage - 1) * 0.12) * (affix && affix.speed ? affix.speed : 1), droneT: new Float32Array(8).fill(-1), slowT: 0,
        affix: opts.affix || null, apex: !!opts.apex, volT: affix && affix.every ? affix.every : 0,
      };
      this.bosses.push(b);
      this.fx.bossArrival(b.x, b.z, stage, type);
      this.fx.zoomPunch(0.18);
      this.fx.addShake(0.6);
      if (!opts.quiet) this.banner(`THE ${b.name.toUpperCase()} HAS EMERGED`, 'boss');
      this.sfx('roar');
      this.hooks.onBoss && this.hooks.onBoss(this.bosses);
    }

    updateBosses(dt) {
      const pl = this.player, A = PH.BOSS_ATTACKS;
      for (const b of this.bosses) {
        const dx = pl.x - b.x, dz = pl.z - b.z, d = Math.hypot(dx, dz) || 0.001;
        b.timer -= dt;
        b.moving = false;
        if (b.iframes > 0) b.iframes -= dt;
        if (b.volT > 0 && (b.volT -= dt) <= 0) {
          // Volatile: a ring of orbs every few seconds.
          const V = PH.APEX.affixes.volatile;
          b.volT = V.every;
          const off = this.rand() * TAU;
          for (let i = 0; i < V.orbs; i++) { const a = off + (i / V.orbs) * TAU; this.fireHostile(b.x, b.z, Math.cos(a), Math.sin(a), 4.5, V.dmg, 1, 0.45, 0.2); }
          this.fx.shockwave(b.x, b.z, 2.5, 0xff6a3d, 0.3);
        }
        let slow = 1;
        if (b.slowT > 0) { b.slowT -= dt; slow = PH.ABILITIES.snare.bossSlow; }

        if (b.state === 'chase') {
          b.moving = true;
          b.x += dx / d * b.speed * slow * dt; b.z += dz / d * b.speed * slow * dt;
          b.facing = Math.atan2(dx, dz);
          b.summonT -= dt;
          if (b.summonT <= 0) {
            const brood = b.affix === 'brood' ? PH.APEX.affixes.brood : null;
            b.summonT = A.summonEvery * (brood ? brood.summon : 1);
            const count = A.summonCount + b.stage * 2 + (brood ? brood.extra : 0);
            for (let i = 0; i < count; i++) {
              const a = (i / count) * TAU;
              this.spawnEnemy('critter', b.x + Math.cos(a) * 2.5, b.z + Math.sin(a) * 2.5);
            }
          }
          if (b.timer <= 0) this.beginAttack(b, dx / d, dz / d, d);
        } else if (b.state === 'tele') {
          if (b.timer <= 0) this.releaseAttack(b);
        } else if (b.state === 'dash') {
          b.moving = true;
          b.x += b.dash.x * A.dash.speed * slow * dt; b.z += b.dash.z * A.dash.speed * slow * dt;
          if (dist2(b.x, b.z, pl.x, pl.z) < (b.radius + pl.radius) ** 2) this.damagePlayer(A.dash.dmg);
          if (Math.floor(b.timer * 30) % 2 === 0) this.fx.burst(b.x, 0.3, b.z, 2, 0xc9b38f, 2, 0.35, 0.4, 2, 0.3);
          if (b.timer <= 0) this.restBoss(b);
        } else if (b.state === 'roll') {
          // Curled into a ball: barrel at you, steering a little, flattening the brood.
          const S = A.roll, want = Math.atan2(dx, dz), cur = Math.atan2(b.rollX, b.rollZ);
          let turn = want - cur;
          while (turn > Math.PI) turn -= TAU;
          while (turn < -Math.PI) turn += TAU;
          const na = cur + Math.max(-S.turn * dt, Math.min(S.turn * dt, turn));
          b.rollX = Math.sin(na); b.rollZ = Math.cos(na); b.facing = na;
          b.moving = true; b.rollT = b.timer;
          b.x += b.rollX * S.speed * slow * dt; b.z += b.rollZ * S.speed * slow * dt;
          if (!b.rollHit && dist2(b.x, b.z, pl.x, pl.z) < (b.radius + pl.radius) ** 2) { b.rollHit = true; this.damagePlayer(S.dmg); this.fx.addShake(0.6); }
          this.query(b.x, b.z, b.radius, (e) => this.hitEnemy(e, 40, b.rollX, b.rollZ, 6));
          if (Math.floor(b.timer * 30) % 2 === 0) this.fx.burst(b.x, 0.3, b.z, 3, 0xc9b38f, 2.5, 0.4, 0.4, 3, 0.4);
          if (b.timer <= 0) { b.rollT = 0; this.restBoss(b); }
        } else if (b.state === 'leap') {
          const S = A.leap, L = b.leap;
          b.leapT -= dt;
          const k = 1 - Math.max(0, b.leapT) / S.air;
          b.x = L.sx + (L.tx - L.sx) * k; b.z = L.sz + (L.tz - L.sz) * k;
          b.lift = Math.sin(k * Math.PI) * S.height;
          if (b.leapT <= 0) {
            b.lift = 0; b.leapT = 0;
            this.fx.bossSlam(b.x, b.z, L.r);
            this.fx.shockwave(b.x, b.z, L.r, 0xff5533, 0.45);
            this.fx.addShake(1.0);
            if (dist2(b.x, b.z, pl.x, pl.z) < (L.r + pl.radius) ** 2) this.damagePlayer(S.dmg);
            this.query(b.x, b.z, L.r, (e) => this.hitEnemy(e, 60, 0, 0, 0));
            this.restBoss(b);
          }
        } else if (b.state === 'rest') {
          if (b.timer <= 0) { b.state = 'chase'; b.timer = 0.6; }
        }

        if (b.state !== 'dash' && dist2(b.x, b.z, pl.x, pl.z) < (b.radius + pl.radius) ** 2) {
          this.damagePlayer(A.contact);
        }
        // Bosses never despawn, but they also never lose you.
        if (d > C.despawnRadius) { const p = this.spawnPoint(this.input); b.x = p.x; b.z = p.z; }
      }
    }

    beginAttack(b, dx, dz, d) {
      const A = PH.BOSS_ATTACKS, def = PH.BOSSES[b.type], pl = this.player;
      const options = def.attacks.slice(0, Math.max(1, b.stage));
      // Running away is answered with a charge, so kiting buys time, not safety.
      // A boss that cannot dash yet just keeps walking at you instead.
      const canDash = options.includes('dash') || b.stage >= 2;
      // The signature move doubles as the closer (the Kraken's lightning reaches you anyway).
      const closer = options.find((a) => a === 'roll' || a === 'leap' || a === 'warp' || a === 'lightning') || (canDash ? 'dash' : null);
      b.attack = d > A.closeIn && closer ? closer : options[Math.floor(this.rand() * options.length)];
      b.state = 'tele';
      b.facing = Math.atan2(dx, dz);
      const spec = A[b.attack];
      b.timer = spec.telegraph * (b.stage === 3 ? 0.85 : 1);
      if (b.attack === 'dash') {
        b.dash = { x: dx, z: dz };
        this.telegraphs.push({ shape: 'rect', x: b.x, z: b.z, angle: Math.atan2(dx, dz), w: b.radius * 1.8, len: A.dash.length, t: 0, dur: b.timer, owner: b });
      } else if (b.attack === 'slam') {
        const r = A.slam.radius * (1 + (b.stage - 1) * 0.18);
        b.slamR = r;
        this.telegraphs.push({ shape: 'circle', x: b.x, z: b.z, r, t: 0, dur: b.timer, owner: b });
      } else if (b.attack === 'roll') {
        this.telegraphs.push({ shape: 'rect', x: b.x, z: b.z, angle: Math.atan2(dx, dz), w: b.radius * 1.6, len: A.roll.speed * A.roll.dur * 0.55, t: 0, dur: b.timer, owner: b, color: 0xff8800 });
      } else if (b.attack === 'lightning') {
        this.telegraphs.push({ shape: 'circle', x: b.x, z: b.z, r: b.radius * 1.3, t: 0, dur: b.timer, owner: b, color: 0x6fb7ff });
      } else if (b.attack === 'warp') {
        this.telegraphs.push({ shape: 'circle', x: b.x, z: b.z, r: b.radius * 1.4, t: 0, dur: b.timer, owner: b, color: 0xb06cff });
      } else if (b.attack === 'leap') {
        // The landing follows you during the wind-up and locks when it jumps.
        this.telegraphs.push({ shape: 'circle', x: pl.x, z: pl.z, r: A.leap.r * (1 + (b.stage - 1) * 0.12), t: 0, dur: b.timer + A.leap.air, owner: b, follow: pl, color: 0xff5533 });
      } else {
        this.telegraphs.push({ shape: 'circle', x: b.x, z: b.z, r: b.radius * 1.6, t: 0, dur: b.timer, owner: b, color: 0xc77dff });
      }
      this.sfx('ability');
    }

    releaseAttack(b) {
      const A = PH.BOSS_ATTACKS, pl = this.player;
      const landing = this.telegraphs.find((t) => t.owner === b && t.follow);
      this.telegraphs = this.telegraphs.filter((t) => t.owner !== b);
      if (b.attack === 'roll') {
        b.state = 'roll';
        b.timer = A.roll.dur * (b.stage === 3 ? 1.2 : 1);
        b.rollX = Math.sin(b.facing); b.rollZ = Math.cos(b.facing); b.rollHit = false;
        this.sfx('roar');
        return;
      }
      if (b.attack === 'lightning') {
        // Bolts on you and around you, a beat apart: keep moving.
        const S = A.lightning, n = S.count + (b.stage - 1);
        for (let k = 0; k < n; k++) {
          const a = this.rand() * TAU, r = k === 0 ? 0 : S.spread * (0.5 + this.rand() * 0.5);
          this.telegraphs.push({ shape: 'circle', x: pl.x + Math.cos(a) * r, z: pl.z + Math.sin(a) * r, r: S.r, t: 0, dur: S.delay + k * S.stagger, color: 0x6fb7ff, bolt: S.dmg });
        }
        this.fx.lightningChain([{ x: b.x, z: b.z }, { x: b.x + 0.4, z: b.z - 3 }], 0x9be7ff);
        this.sfx('ability');
        this.restBoss(b);
        return;
      }
      if (b.attack === 'warp') {
        // Collapse to smoke, re-form beside you, then go off.
        const S = A.warp, a = this.rand() * TAU;
        this.fx.burst(b.x, 1, b.z, 24, 0xb06cff, 4, 0.35, 0.5, 0, 0.6);
        b.x = pl.x + Math.cos(a) * S.beside; b.z = pl.z + Math.sin(a) * S.beside;
        b.facing = Math.atan2(pl.x - b.x, pl.z - b.z);
        b.iframes = 0.35;
        this.fx.burst(b.x, 1, b.z, 18, 0xb06cff, 3, 0.35, 0.5, 0, 0.6);
        this.telegraphs.push({ shape: 'circle', x: b.x, z: b.z, r: S.r * (1 + (b.stage - 1) * 0.12), t: 0, dur: S.delay, color: 0xb06cff, blast: S.dmg, by: b });
        this.restBoss(b);
        b.timer += S.delay;
        return;
      }
      if (b.attack === 'leap') {
        const S = A.leap, tx = landing ? landing.x : pl.x, tz = landing ? landing.z : pl.z;
        b.state = 'leap';
        b.leap = { sx: b.x, sz: b.z, tx, tz, r: landing ? landing.r : S.r };
        b.leapT = S.air;
        b.facing = Math.atan2(tx - b.x, tz - b.z);
        // Keep showing where it will land while it is in the air.
        this.telegraphs.push({ shape: 'circle', x: tx, z: tz, r: b.leap.r, t: 0, dur: S.air, color: 0xff5533, by: b });
        this.sfx('roar');
        return;
      }
      if (b.attack === 'dash') {
        b.state = 'dash';
        b.timer = A.dash.length / A.dash.speed;
        this.sfx('roar');
      } else if (b.attack === 'slam') {
        this.fx.bossSlam(b.x, b.z, b.slamR);
        this.fx.shockwave(b.x, b.z, b.slamR, 0xff5544, 0.4);
        this.fx.addShake(0.9);
        if (dist2(b.x, b.z, pl.x, pl.z) < (b.slamR + pl.radius) ** 2) this.damagePlayer(A.slam.dmg);
        // The slam also flattens the bosses' own brood, which is a way to use it.
        this.query(b.x, b.z, b.slamR, (e) => this.hitEnemy(e, 60, 0, 0, 0));
        this.restBoss(b);
      } else {
        const n = A.burst.count + (b.stage - 1) * 4, rings = b.stage >= 2 ? 2 : 1;
        for (let k = 0; k < rings; k++) {
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + k * (Math.PI / n);
            this.fireHostile(b.x, b.z, Math.cos(a), Math.sin(a), A.burst.speed * (1 - k * 0.25), A.burst.dmg, 0.8, 0.45, 1);
          }
        }
        this.restBoss(b);
      }
    }

    restBoss(b) {
      const [lo, hi] = PH.BOSS_ATTACKS.restBetween;
      b.state = 'rest';
      b.timer = (lo + this.rand() * (hi - lo)) * (b.affix === 'swift' ? PH.APEX.affixes.swift.rest : 1);
      b.dash = null;
    }

    hitBoss(b, dmg, crit) {
      b.hp -= dmg;
      this.fx.flashBoss(b.id);
      if (this.hooks.onDamage) this.hooks.onDamage(b.x, 2.2, b.z, dmg, crit);
      if (b.hp <= 0 && b.alive) this.killBoss(b);
    }

    killBoss(b) {
      b.alive = false;
      this.bosses = this.bosses.filter((x) => x !== b);
      this.telegraphs = this.telegraphs.filter((t) => t.owner !== b);
      this.bossKills++;
      this.fx.bossDeath(b.x, b.z, b.radius * 2, 0xc77dff);
      this.fx.removeBoss(b.id);
      this.fx.addShake(1.2);
      this.fx.shockwave(b.x, b.z, 7, 0xffd700, 0.7);
      this.hitstop = Math.max(this.hitstop, 0.14);
      this.slowmo = 0.9;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        this.dropGem(b.x + Math.cos(a) * 1.5, b.z + Math.sin(a) * 1.5, 8 * b.stage);
      }
      this.dropPickup('chest', b.x, b.z);
      this.banner(`${b.name.toUpperCase()} SLAIN`, 'win');
      this.sfx('victory');
      if (b.affix === 'volatile') {
        // A volatile monster bursts as it dies: one last ring of orbs.
        const V = PH.APEX.affixes.volatile;
        for (let i = 0; i < V.deathOrbs; i++) { const a = (i / V.deathOrbs) * TAU; this.fireHostile(b.x, b.z, Math.cos(a), Math.sin(a), 5, V.dmg, 1, 0.45, 0.2); }
      }
      this.hooks.onBoss && this.hooks.onBoss(this.bosses);
      if (b.final && !this.apex) this.victoryAt = this.time + 3;
    }

    /* ── Apex Hunt ──────────────────────────────────────────── */

    /** After a win: carry on with the same build into endless waves of monsters. */
    continueApex() {
      if (this.state !== 'over' || !this.victory || this.apex) return false;
      this.apex = { wave: 0, next: this.time + PH.APEX.first, live: false, base: { score: this.score(), kills: this.kills, bosses: this.bossKills } };
      this.victoryAt = 0;
      this.player.hp = this.player.maxHp;
      this.state = 'playing';
      this.banner('THE APEX HUNT BEGINS', 'boss');
      this.sfx('roar');
      return true;
    }

    updateApex() {
      const A = this.apex, X = PH.APEX;
      if (A.live) {
        if (this.bosses.some((b) => b.apex)) return;
        A.live = false;
        A.cleared = A.wave;
        A.next = this.time + X.rest;
        this.banner(`WAVE ${A.wave} CLEARED`, 'win');
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.25);
        return;
      }
      if (this.time < A.next) return;
      A.wave++;
      A.live = true;
      const types = Object.keys(PH.BOSSES), affixes = Object.keys(X.affixes);
      const n = A.wave >= X.trioFrom ? 3 : A.wave >= X.pairFrom ? 2 : 1;
      const colors = PH.Progress ? PH.Progress.COLORS : [];
      for (let i = 0; i < n; i++) {
        const type = types[Math.floor(this.rand() * types.length)];
        const affix = affixes[Math.floor(this.rand() * affixes.length)];
        const looks = colors.filter((c) => c.for === type);
        const variant = looks.length ? looks[Math.floor(this.rand() * looks.length)].variant : null;
        this.spawnBoss(type, 3, false, { hp: X.hp[0] + X.hp[1] * A.wave, affix, variant, apex: true, quiet: true });
      }
      const names = this.bosses.filter((b) => b.apex).map((b) => b.name.toUpperCase());
      this.banner(`WAVE ${A.wave}: ${names.join(' + ')}`, 'boss');
    }


    /* ── Weapons ────────────────────────────────────────────── */

    updateWeapons(dt) {
      this.droneN = 0;
      const rate = this.overdrive > 0 ? PH.ABILITIES.overdrive.rate : 1;
      for (const w of this.weapons) {
        const def = PH.WEAPONS[w.id], s = this.stats(w);
        if (def.kind === 'aura') { this.tickAura(w, s, dt * rate); continue; }
        if (def.kind === 'orbit') { this.tickOrbit(w, s, dt * (rate > 1 ? 1.5 : 1)); continue; }
        w.timer -= dt * rate;
        if (w.timer > 0) continue;
        w.timer = s.cd * this.mods.cd;
        const fired = this[{ bolt: 'fireBolt', spread: 'fireSpread', lob: 'fireLob', mine: 'fireMine', strike: 'fireStrike', chain: 'fireChain' }[def.kind]](w, s);
        if (fired === false) w.timer = 0.15;   // nothing in range; check again soon
      }
    }

    shoot(x, z, dx, dz, s, vis, extra = {}) {
      const p = this.projectiles.find((q) => !q.alive);
      if (!p) return;
      Object.assign(p, {
        alive: true, hostile: false, vis, x, z, vx: dx * s.speed, vz: dz * s.speed,
        dmg: s.dmg, pierce: s.pierce || 0, life: (s.range || 15) / s.speed,
        radius: vis === 'harpoon' ? 0.32 : vis === 'pellet' ? 0.2 : 0.24, aoe: 0, ...extra,
      });
      p.hits.length = 0;
      this.fx.muzzle(x, z, dx, dz, vis);
    }

    fireBolt(w, s) {
      const pl = this.player;
      const n = s.count + this.mods.extra;
      const used = new Set();
      let first = null;
      for (let i = 0; i < n; i++) {
        const t = this.nearest(pl.x, pl.z, 15, used);
        let dx, dz;
        if (t) { used.add(t); first = first || t; dx = t.x - pl.x; dz = t.z - pl.z; }
        else if (first) { const a = Math.atan2(first.x - pl.x, first.z - pl.z) + (i - n / 2) * 0.18; dx = Math.sin(a); dz = Math.cos(a); }
        else return false;
        const d = Math.hypot(dx, dz) || 1;
        this.shoot(pl.x, pl.z, dx / d, dz / d, s, w.id === 'harpoon' ? 'harpoon' : 'bolt');
      }
      this.sfx('shoot');
    }

    fireSpread(w, s) {
      const pl = this.player;
      const t = this.nearest(pl.x, pl.z, s.range + 1);
      if (!t) return false;
      const base = Math.atan2(t.x - pl.x, t.z - pl.z);
      const n = s.pellets + this.mods.extra * 2;
      for (let i = 0; i < n; i++) {
        const a = base + (i / (n - 1) - 0.5) * s.arc + (this.rand() - 0.5) * 0.06;
        this.shoot(pl.x, pl.z, Math.sin(a), Math.cos(a), s, 'pellet');
      }
      this.sfx('shoot');
    }

    /** Where the crowd is thickest, among a few random candidates near you. */
    crowdPoint(range) {
      const pl = this.player;
      let best = null, bestN = -1;
      for (let k = 0; k < 7; k++) {
        const e = this.enemies[Math.floor(this.rand() * this.enemies.length)];
        if (!e.alive || dist2(e.x, e.z, pl.x, pl.z) > range * range) continue;
        let n = 0;
        this.query(e.x, e.z, 2.2, () => { n++; });
        if (n > bestN) { bestN = n; best = e; }
      }
      return best || this.nearest(pl.x, pl.z, range);
    }

    fireLob(w, s) {
      const pl = this.player;
      const n = s.count + this.mods.extra;
      let any = false;
      for (let i = 0; i < n; i++) {
        const t = this.crowdPoint(10);
        if (!t) break;
        any = true;
        const dist = Math.hypot(t.x - pl.x, t.z - pl.z);
        this.lobs.push({ sx: pl.x, sz: pl.z, tx: t.x + (this.rand() - 0.5), tz: t.z + (this.rand() - 0.5), t: 0, dur: 0.55 + dist * 0.025, dist, dmg: s.dmg, radius: s.radius * this.mods.area, cluster: s.cluster || 0 });
      }
      if (!any) return false;
    }

    fireMine(w, s) {
      const pl = this.player;
      if (this.mines.length >= s.max + this.mods.extra) {
        // Re-seat the oldest trap where you are now, so traps follow the fight.
        this.mines.shift();
      }
      this.mines.push({ x: pl.x, z: pl.z, arm: 0.35, dmg: s.dmg, radius: s.radius * this.mods.area, life: 30 });
    }

    fireStrike(w, s) {
      const pl = this.player;
      const n = s.count + this.mods.extra;
      const used = new Set();
      for (let i = 0; i < n; i++) {
        let t = null;
        for (let k = 0; k < 6 && !t; k++) {
          const e = this.enemies[Math.floor(this.rand() * this.enemies.length)];
          if (e.alive && !used.has(e) && dist2(e.x, e.z, pl.x, pl.z) < 121) t = e;
        }
        if (!t && this.bosses[0] && dist2(this.bosses[0].x, this.bosses[0].z, pl.x, pl.z) < 196) t = this.bosses[0];
        if (!t) { if (i === 0) return false; break; }
        used.add(t);
        // Friendly strikes are teal, never red - red always means "move".
        this.telegraphs.push({ shape: 'circle', x: t.x, z: t.z, r: s.radius * this.mods.area, t: 0, dur: s.delay, color: 0x4ecdc4, strike: s.dmg });
      }
    }

    fireChain(w, s) {
      const pl = this.player;
      let t = this.nearest(pl.x, pl.z, s.range);
      if (!t) return false;
      const hit = new Set();
      const pts = [{ x: pl.x, z: pl.z }];
      let jumps = s.jumps + this.mods.extra;
      while (t && jumps-- >= 0) {
        hit.add(t);
        pts.push({ x: t.x, z: t.z });
        this.hitEnemy(t, s.dmg);
        t = this.nearest(t.x, t.z, s.range * 0.6, hit);
      }
      this.fx.lightningChain(pts);
      this.sfx('ability');
    }

    tickAura(w, s, dt) {
      w.tick -= dt;
      if (w.tick > 0) return;
      w.tick = 0.25;
      const pl = this.player, r = s.radius * this.mods.area;
      this.query(pl.x, pl.z, r, (e) => this.hitEnemy(e, s.dps * 0.25, 0, 0, 0, false));
      for (const b of this.bosses) if (dist2(b.x, b.z, pl.x, pl.z) < (r + b.radius) ** 2) this.hitEnemy(b, s.dps * 0.25);
      if (s.heal) pl.hp = Math.min(pl.maxHp, pl.hp + s.heal * 0.25);
    }

    fieldRadius() {
      const w = this.weapons && this.weapons.find((x) => x.id === 'biofield');
      return w ? this.stats(w).radius * this.mods.area : 0;
    }

    tickOrbit(w, s, dt) {
      const pl = this.player, n = s.count + this.mods.extra, r = s.radius * this.mods.area;
      w.tick += dt * s.spin;
      for (let i = 0; i < n; i++) {
        const a = w.tick + (i / n) * TAU;
        const x = pl.x + Math.cos(a) * r, z = pl.z + Math.sin(a) * r;
        const slotObj = this.dronePool[this.droneN] || (this.dronePool[this.droneN] = { x: 0, z: 0 });
        slotObj.x = x; slotObj.z = z;
        this.droneN++;
        const slot = i & 7;
        this.query(x, z, 0.5, (e) => {
          if (this.time - e.droneT[slot] < 0.35) return;
          e.droneT[slot] = this.time;
          this.hitEnemy(e, s.dmg, e.x - pl.x, e.z - pl.z, 1.5);
        });
        for (const b of this.bosses) {
          if (this.time - b.droneT[slot] < 0.35) continue;
          if (dist2(b.x, b.z, x, z) < (b.radius + 0.5) ** 2) { b.droneT[slot] = this.time; this.hitEnemy(b, s.dmg); }
        }
      }
    }

    /* ── Things in flight ───────────────────────────────────── */

    updateProjectiles(dt) {
      const pl = this.player;
      for (const p of this.projectiles) {
        if (!p.alive) continue;
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.life -= dt;
        if (p.life <= 0) { p.alive = false; continue; }
        if (p.hostile) {
          const dome = this.zones.find((z) => z.kind === 'dome');
          if (dome && dist2(p.x, p.z, dome.x, dome.z) < dome.r * dome.r) {
            p.alive = false;
            this.fx.burst(p.x, 0.7, p.z, 5, 0x9fdcff, 2.5, 0.2, 0.25, 0, 0.3);
            continue;
          }
          if (dist2(p.x, p.z, pl.x, pl.z) < (p.radius + pl.radius) ** 2) { this.damagePlayer(p.dmg); p.alive = false; }
          continue;
        }
        const speed = Math.hypot(p.vx, p.vz) || 1;
        const kx = p.vx / speed, kz = p.vz / speed;
        this.query(p.x, p.z, p.radius, (e) => {
          if (p.hits.includes(e)) return;
          p.hits.push(e);
          this.hitEnemy(e, p.dmg, kx, kz, 3);
          this.fx.burst(p.x, 0.7, p.z, 2, 0xfff1a8, 2.5, 0.16, 0.18, 0, 0.2);
          this.fx.impact(p.x, p.z, 0xffd27a);
          if (p.pierce-- <= 0) { p.alive = false; return false; }
        });
        if (!p.alive) continue;
        for (const b of this.bosses) {
          if (p.hits.includes(b)) continue;
          if (dist2(p.x, p.z, b.x, b.z) < (p.radius + b.radius) ** 2) {
            p.hits.push(b);
            this.hitEnemy(b, p.dmg);
            if (p.pierce-- <= 0) { p.alive = false; break; }
          }
        }
      }
    }

    blast(x, z, r, dmg, color) {
      this.query(x, z, r, (e) => {
        const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz) || 1;
        this.hitEnemy(e, dmg, dx / d, dz / d, 6);
      });
      for (const b of this.bosses) if (dist2(b.x, b.z, x, z) < (r + b.radius) ** 2) this.hitEnemy(b, dmg);
      this.fx.explosion(x, z, r, color);
      this.fx.addShake(0.12);
      this.sfx('hit');
    }

    updateLobs(dt) {
      for (let i = this.lobs.length - 1; i >= 0; i--) {
        const n = this.lobs[i];
        n.t += dt;
        if (n.t >= n.dur) {
          this.blast(n.tx, n.tz, n.radius, n.dmg, 0xff8a3d);
          this.lobs.splice(i, 1);
          // Cluster Bomb: each blast throws smaller bomblets around itself.
          for (let k = 0; k < n.cluster; k++) {
            const a = (k / n.cluster) * TAU + this.rand(), r = n.radius * (0.9 + this.rand() * 0.5);
            this.lobs.push({ sx: n.tx, sz: n.tz, tx: n.tx + Math.cos(a) * r, tz: n.tz + Math.sin(a) * r, t: 0, dur: 0.32, dist: r * 0.4, dmg: n.dmg * 0.5, radius: n.radius * 0.55, cluster: 0 });
          }
        }
      }
    }

    updateMines(dt) {
      for (let i = this.mines.length - 1; i >= 0; i--) {
        const m = this.mines[i];
        m.life -= dt;
        if (m.arm > 0) { m.arm -= dt; continue; }
        let trig = false;
        this.query(m.x, m.z, 1.1, () => { trig = true; return false; });
        for (const b of this.bosses) if (dist2(b.x, b.z, m.x, m.z) < (b.radius + 1.1) ** 2) trig = true;
        if (trig || m.life <= 0) {
          if (trig) this.blast(m.x, m.z, m.radius, m.dmg, 0xffc145);
          this.mines.splice(i, 1);
        }
      }
    }

    updateTelegraphs(dt) {
      for (let i = this.telegraphs.length - 1; i >= 0; i--) {
        const t = this.telegraphs[i];
        t.t += dt;
        // Boss telegraphs follow the boss until they fire (the Goliath's landing follows you).
        if (t.follow) { t.x = t.follow.x; t.z = t.follow.z; }
        else if (t.owner) { t.x = t.owner.x; t.z = t.owner.z; }
        if ((t.bolt || t.blast) && t.t >= t.dur) {
          const pl = this.player;
          if (t.bolt) { this.fx.strike({ x: t.x, z: t.z }); this.fx.addShake(0.35); }
          else { this.fx.explosion(t.x, t.z, t.r, 0xb06cff); this.fx.shockwave(t.x, t.z, t.r, 0xb06cff, 0.4); this.fx.addShake(0.5); }
          if (dist2(t.x, t.z, pl.x, pl.z) < (t.r + pl.radius * 0.5) ** 2) this.damagePlayer(t.bolt || t.blast);
          this.telegraphs.splice(i, 1);
          continue;
        }
        if (t.by && t.t >= t.dur) { this.telegraphs.splice(i, 1); continue; }
        if (t.rubble && t.t >= t.dur) {
          // Falling masonry: hurts you if you are under it, and crushes creatures.
          const pl = this.player;
          if (dist2(t.x, t.z, pl.x, pl.z) < (t.r + pl.radius * 0.5) ** 2) this.damagePlayer(t.rubble);
          this.query(t.x, t.z, t.r, (e) => this.hitEnemy(e, t.rubbleE / this.mods.dmg, 0, 0, 0));
          this.fx.explosion(t.x, t.z, t.r, 0xb89466);
          this.fx.burst(t.x, 1.2, t.z, 16, 0x8a7656, 5, 0.35, 0.6, 10, 2);
          this.fx.addShake(0.25);
          this.sfx('hit');
          this.telegraphs.splice(i, 1);
          continue;
        }
        if (t.strike && t.t >= t.dur) {
          this.blast(t.x, t.z, t.r, t.strike, 0x4ecdc4);
          this.fx.burst(t.x, 3, t.z, 12, 0xbff8ff, 1, 0.5, 0.35, -8, -2);
          this.telegraphs.splice(i, 1);
        }
      }
    }

    /* ── Pickups and progression ────────────────────────────── */

    dropGem(x, z, value) {
      let g = this.gems.find((q) => !q.alive);
      if (!g) {
        // Too many on the floor: fold the XP into an existing gem instead.
        const host = this.gems[this.gemMerge++ % this.gems.length];
        host.value += value;
        return;
      }
      Object.assign(g, { alive: true, x, z, value, pull: false, vel: 0 });
    }

    dropPickup(kind, x, z) {
      const p = this.pickups.find((q) => !q.alive);
      if (!p) return;
      const icon = { heart: '❤️', magnet: '🧲', chest: '🎁' }[kind];
      Object.assign(p, { alive: true, kind, icon, x, z });
    }

    updatePickups(dt) {
      const pl = this.player, pr2 = pl.pickup * pl.pickup;
      for (const g of this.gems) {
        if (!g.alive) continue;
        const d2 = dist2(g.x, g.z, pl.x, pl.z);
        if (!g.pull && d2 < pr2) g.pull = true;
        if (g.pull) {
          g.vel = Math.min(22, g.vel + dt * 40);
          const d = Math.sqrt(d2) || 0.001;
          g.x += (pl.x - g.x) / d * g.vel * dt; g.z += (pl.z - g.z) / d * g.vel * dt;
          if (d < 0.5) {
            g.alive = false;
            this.addXp(g.value);
            this.sfx('gem');
          }
        }
      }
      for (const p of this.pickups) {
        if (!p.alive || dist2(p.x, p.z, pl.x, pl.z) > 1.0) continue;
        p.alive = false;
        if (p.kind === 'heart') {
          pl.hp = Math.min(pl.maxHp, pl.hp + 35);
          this.fx.burst(pl.x, 1, pl.z, 16, 0xff6b81, 3, 0.3, 0.6, -2, 0.6);
          this.sfx('heal');
        } else if (p.kind === 'magnet') {
          for (const g of this.gems) if (g.alive) g.pull = true;
          this.sfx('ability');
        } else {
          this.pending.push('chest');
          this.sfx('evolve');
        }
      }
    }

    addXp(v) {
      this.xp += v;
      while (this.xp >= this.xpNeed) {
        this.xp -= this.xpNeed;
        this.level++;
        this.xpNeed = C.xpToNext(this.level);
        this.pending.push('level');
      }
    }

    openChoice() {
      const kind = this.pending.shift();
      const choices = this.rollChoices(kind === 'chest');
      this.state = 'choice';
      this.choiceKind = kind;
      this.currentChoices = choices;
      if (kind === 'level') {
        this.fx.ring(this.player.x, this.player.z, 3, 40, 0xffd700, 0.35, 0.55);
        this.sfx('levelup');
      }
      this.hooks.onChoice && this.hooks.onChoice(choices, kind);
    }

    rollChoices(chest) {
      const pool = [];
      const S = C.slots;
      for (const w of this.weapons) if (w.level < 5) pool.push({ type: 'weapon', id: w.id, level: w.level + 1, weight: 3 });
      for (const p of this.passives) if (p.level < PH.PASSIVES[p.id].max) pool.push({ type: 'passive', id: p.id, level: p.level + 1, weight: 2 });
      if (this.weapons.length < S.weapons) {
        for (const id in PH.WEAPONS) {
          if (!this.weapons.some((w) => w.id === id)) pool.push({ type: 'weapon', id, level: 1, weight: this.level <= 4 ? 3.6 : 1.8 });
        }
      }
      if (this.passives.length < S.passives) {
        for (const id in PH.PASSIVES) {
          if (!this.passives.some((p) => p.id === id)) pool.push({ type: 'passive', id, level: 1, weight: 1.3 });
        }
      }
      const out = [];
      const evos = this.weapons.filter((w) => this.canEvolve(w)).map((w) => ({ type: 'evolve', id: w.id, level: 6 }));
      // A supply drop always offers an evolution when one is ready; a level-up
      // offers it often, but not always, so it still feels like a find.
      if (evos.length && (chest || this.rand() < 0.6)) out.push(evos[Math.floor(this.rand() * evos.length)]);
      // A chest always offers an upgrade to something you already own if it can.
      if (chest) {
        const owned = pool.filter((c) => c.level > 1);
        if (owned.length) out.push(owned[Math.floor(this.rand() * owned.length)]);
      }
      while (out.length < 3 && pool.length) {
        const avail = pool.filter((c) => !out.some((o) => o.id === c.id));
        if (!avail.length) break;
        let total = 0;
        for (const c of avail) total += c.weight;
        let r = this.rand() * total;
        let pick = avail[avail.length - 1];
        for (const c of avail) { r -= c.weight; if (r <= 0) { pick = c; break; } }
        out.push(pick);
      }
      if (!out.length || (out.length === 1 && out[0].type === 'evolve')) out.push({ type: 'heal', id: 'heal', level: 0 }, { type: 'score', id: 'score', level: 0 });
      return out;
    }

    choose(choice) {
      if (this.state !== 'choice') return;
      if (choice.type === 'evolve') this.evolve(choice.id);
      else if (choice.type === 'weapon') this.addWeapon(choice.id);
      else if (choice.type === 'passive') this.addPassive(choice.id);
      else if (choice.type === 'heal') this.player.hp = this.player.maxHp;
      else if (choice.type === 'score') this.bonusScore = (this.bonusScore || 0) + 250;
      this.state = 'playing';
      this.hooks.onLoadout && this.hooks.onLoadout(this.weapons, this.passives);
    }

    score() {
      const S = C.score;
      return Math.round(this.kills * S.kill + this.time * S.second + this.bossKills * S.boss
        + (this.victory ? S.victory : 0) + (this.bonusScore || 0));
    }

    end(victory) {
      this.state = 'over';
      // Falling in the Apex Hunt still counts the win that started it.
      this.victory = victory || !!this.apex;
      this.hooks.onEnd && this.hooks.onEnd({
        victory: this.victory, time: this.time, kills: this.kills, level: this.level,
        bossKills: this.bossKills, score: this.score(), classId: this.classId, bonus: this.bonusScore || 0,
        apex: this.apex ? { waves: this.apex.cleared || 0, ...this.apex.base } : null,
      });
    }
  }

  PH.Game = Game;
})();
