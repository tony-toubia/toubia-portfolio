/**
 * Primal Hunt - hunter mode.
 *
 * Monster mode turned around. You are one of the four hunters; the other
 * three are the same AI squad, and the monster is played by MonsterGame's AI
 * brain. It is the same world and the same rules, so this class only swaps
 * who is steered by the thumb:
 *   - `player` is your hunter, so the camera, HUD and buttons follow you;
 *   - the monster is drawn as a boss, and only while someone can see it -
 *     in tall grass you track it by its footprints, by birds, by your trapper's
 *     sound spikes, and by the red marker where it was last seen;
 *   - your weapon fires on its own; the special and jetpack are buttons.
 * You win by killing it. You lose if it downs the whole squad at once, or
 * survives until the dropship leaves.
 */
window.PH = window.PH || {};

(() => {
  const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

  // Monster-mode lines, retold from the hunters' side.
  const SAY = [
    [/^THE HUNTERS HAVE LANDED$/, 'DROPPING IN - FIND THE MONSTER'],
    [/^DROPSHIP: HUNTERS REDEPLOYED$/, 'DROPSHIP: REINFORCEMENTS LANDED'],
    [/^MOBILE ARENA - YOU ARE TRAPPED$/, 'MOBILE ARENA - IT CANNOT ESCAPE'],
    [/^EVOLVING\.\.\.$/, 'THE MONSTER IS EVOLVING!'],
    [/^STAGE 3 - HUNT THEM DOWN$/, 'STAGE 3 - IT IS HUNTING YOU NOW'],
    [/^STAGE (\d)$/, 'THE MONSTER REACHED STAGE $1'],
    [/^READY TO EVOLVE$/, null],
    [/Birds scattered - the hunters heard that/, '🐦 Birds scattered - the monster is close'],
    [/Sound spike - they have a rough fix on you/, '📡 Sound spike - rough fix on the monster'],
    [/^Eat wildlife.*$/, null],
    [/^STAGGERED$/, 'MONSTER STAGGERED - HIT IT NOW'],
    [/^SNARED - THEY KNOW WHERE YOU ARE$/, 'MONSTER SNARED!'],
    [/^📣 Roar unlocked.*$/, "📣 It can roar now - don't crowd it"],
  ];
  const retell = (text) => {
    for (const [re, out] of SAY) if (re.test(text)) return out === null ? null : text.replace(re, out);
    return text;
  };

  class HuntGame extends PH.MonsterGame {
    constructor(fx, hooks = {}) {
      super(fx, hooks);
      this.mode = 'hunt';
      this.aiMonster = true;
      this.monInput = { x: 0, z: 0 };   // the AI steers the monster; `input` is your thumb
      this.hunterNumbers = false;       // damage numbers go on the monster instead
      this.me = null;
      this.viewIds = 0;
    }

    // What the UI and renderer read: you, your cooldowns, the monster as a boss.
    get player() { return this.me || this.mon; }
    get abilityCd() { return this.me ? this.me.abilityCd : 0; }
    set abilityCd(v) { if (this.me) this.me.abilityCd = v; }
    get abilityMax() { return this.me ? this.me.abilityMax : 1; }
    get dodgeCd() { return this.me ? this.me.dodgeCd : 0; }
    get bosses() { return this.monView && this.state !== 'menu' ? [this.monView] : []; }
    set bosses(v) { /* the base constructor assigns an empty list; ours is derived */ }
    get overdrive() { return this.me ? this.me.overdrive : 0; }
    set overdrive(v) { /* likewise */ }
    abilityReady() { return this.abilityCd <= 0; }
    evolve() { return false; }
    roar() { return false; }              // the monster's roar is its AI's to use
    roarUnlocked() { return false; }

    banner(text, kind) {
      // Your own class's "IS DOWN" / "KILLED" lines are about you.
      const me = this.myClass && this.myClass.toUpperCase();
      if (me && text.startsWith(me + ' ')) {
        text = text.replace(me + ' IS DOWN', 'YOU ARE DOWN').replace(me + ' KILLED', 'YOU WERE KILLED').replace(me + ' BLED OUT', 'YOU BLED OUT');
      }
      const t = retell(text);
      if (t) super.banner(t, kind);
    }
    toast(text) { const t = retell(text); if (t) super.toast(t); }
    /** A line about you alone; co-op does not pass these on to the others. */
    ownToast(text) { HuntGame.prototype.toast.call(this, text); }

    /**
     * `opts` (co-op): `squad` is the four classes, in order; `humans` the
     * other players' hunters, [{ cls, pid, name }], steered over the network.
     */
    newRun(cls, seed = (Math.random() * 1e9) | 0, opts = {}) {
      const types = Object.keys(PH.MONSTERS);
      this.myClass = cls;
      this.revealed = false;
      this.tagT = 0;
      // A class outside the usual four takes the assault's place in the squad.
      this.squadOrder = opts.squad || (['assault', 'trapper', 'medic', 'support'].includes(cls) ? null : [cls, 'trapper', 'medic', 'support']);
      super.newRun(opts.monster || types[(seed >>> 3) % types.length], seed);   // the seed picks the monster too, so runs replay
      const steer = (h, extra) => Object.assign(h, {
        controlled: true, iframes: 0, dashT: 0, dashX: 0, dashZ: 1, overdrive: 0,
        abilityMax: PH.HUNT_MODE.abilities[h.cls].cd, abilityCd: 3, dodgeCd: 0, downs: 0, lastState: 'up', ...extra,
      });
      const me = steer(this.hunters.find((h) => h.cls === cls), { name: opts.name || 'You' });
      for (const hm of opts.humans || []) {
        const h = this.hunters.find((o) => o.cls === hm.cls);
        if (h && h !== me) steer(h, { remote: hm.pid, name: hm.name, netX: null, netZ: null });
      }
      this.me = me;
      // You start on the ground; the monster gets no free head start.
      this.team.landed = true;
      this.deploy(this.hunters, 'THE HUNTERS HAVE LANDED');
      this.syncView();
    }

    /** Your hunter as the player model, teammates as AI hunters, the monster as a boss. */
    setupRender() {
      this.fx.setPlayer(this.myClass);
      this.fx.setHunters(this.hunters.filter((h) => h.cls !== this.myClass));
      this.fx.prepareBosses([1, 2, 3].map((stage) => ({ type: this.monsterType, stage })));
      this.monView = { id: ++this.viewIds, x: this.mon.x, z: this.mon.z, facing: 0, moving: false, radius: 1, lift: 0, hidden: true };
      const vis = this.fx.addBoss(this.monView.id, this.monsterType, 1);
      this.mon.radius = Math.min(1.5, Math.max(0.8, vis.radius * 0.85));
      this.fx.setViewScale(1.2);
    }

    onMonsterStage() {
      this.fx.removeBoss(this.monView.id);
      this.monView.id = ++this.viewIds;
      const vis = this.fx.addBoss(this.monView.id, this.monsterType, this.stage);
      this.mon.radius = Math.min(1.7, Math.max(0.8, vis.radius * 0.85));
    }

    flashMonster() { this.fx.flashBoss(this.monView.id); }

    /** Can anyone on the squad see it right now? That is what you see too. */
    monsterVisible() {
      const mon = this.mon, me = this.me;
      if (this.spotted || this.tagT > 0 || mon.evolveT > 0 || this.zones.some((z) => z.kind === 'arena')) return true;
      return me && (me.state === 'up' || me.state === 'down') && dist2(me.x, me.z, mon.x, mon.z) < PH.HUNT_MODE.seeClose ** 2;
    }

    syncView() {
      const v = this.monView, mon = this.mon;
      if (!v) return;
      v.x = mon.x; v.z = mon.z; v.facing = mon.facing; v.moving = mon.moving || mon.evolveT > 0;
      v.radius = mon.radius; v.lift = mon.lift;
      v.attackT = mon.attackT; v.leapT = mon.leapT; v.rollT = mon.rollT; v.evolveT = mon.evolveT; v.dashT = mon.dashT; v.diveT = mon.diveT;
      v.hidden = !this.monsterVisible();
      if (!v.hidden && !this.revealed) {
        this.revealed = true;
        this.banner(`IT'S A ${PH.MONSTERS[this.monsterType].name.toUpperCase()}`, 'boss');
      }
    }

    update(dt) {
      if (this.state !== 'playing') return;
      const me = this.me;
      if (this.hitstop <= 0) {
        // Everyone a player steers: you, and in co-op your friends.
        for (const h of this.hunters) {
          if (!h.controlled) continue;
          h.abilityCd = Math.max(0, h.abilityCd - dt);
          h.dodgeCd = Math.max(0, h.dodgeCd - dt);
          if (h.iframes > 0) h.iframes -= dt;
          if (h.overdrive > 0) h.overdrive -= dt;
          if (h.remote && h.state !== h.lastState) { if (h.state === 'down') h.downs++; h.lastState = h.state; }
        }
      }
      if (this.tagT > 0) {
        // Tagged by the Ranger's dart: the squad always knows where it is.
        this.tagT -= dt;
        this.team.known = { x: this.mon.x, z: this.mon.z, t: this.time };
      }
      super.update(dt);
      if (me && me.state !== me.lastState) {
        if (me.state === 'down') { me.downs++; this.ownToast('You are down - a teammate is coming'); }
        if (me.state === 'up' && me.lastState === 'down') this.ownToast('Back on your feet');
        if (me.state === 'dead') this.ownToast('You died - the dropship will bring you back');
        me.lastState = me.state;
      }
      this.syncView();
    }

    /** Your hunter's step: thumb movement, jetpack, auto-fire, your class's passive job. */
    updateMe(h, dt, { seen, up, C, T }) {
      const H = PH.HUNT_MODE, mon = this.mon, inp = this.input;
      const ox = h.x, oz = h.z;
      if (h.remote) {
        // A friend's hunter: their device moves it, we take where it says it is.
        if (h.netX !== null) { h.x = h.netX; h.z = h.netZ; h.facing = h.netF; }
      } else if (h.dashT > 0) {
        const v = H.dodge.dist / H.dodge.dur;
        h.dashT -= dt;
        h.x += h.dashX * v * dt; h.z += h.dashZ * v * dt;
      } else {
        const mag = Math.min(1, Math.hypot(inp.x, inp.z));
        if (mag > 0.08) {
          const k = H.speed * mag / Math.hypot(inp.x, inp.z);
          h.x += inp.x * k * dt; h.z += inp.z * k * dt;
          h.facing = Math.atan2(inp.x, inp.z);
        }
      }
      h.moving = Math.hypot(h.x - ox, h.z - oz) > 0.001;
      const pd = Math.hypot(h.x - mon.x, h.z - mon.z) || 0.001, minD = mon.radius + 0.55;
      if (pd < minD) { h.x = mon.x + (h.x - mon.x) / pd * minD; h.z = mon.z + (h.z - mon.z) / pd * minD; }
      this.clampArena(h, 0.45);

      // Auto-fire at the monster whenever the squad can see it and it is in range.
      const visible = seen || pd < H.seeClose;
      if (visible) {
        if (!h.moving) h.facing = Math.atan2(mon.x - h.x, mon.z - h.z);
        if (h.shotT <= 0 && pd < C.range + 7) {
          const od = h.overdrive > 0 ? H.abilities.assault : null;
          h.shotT = C.shot.cd / (od ? od.rate : 1) * (0.9 + this.rand() * 0.2);
          this.fireAt(h, od ? { ...C.shot, dmg: C.shot.dmg * (1 + od.dmg) } : C.shot);
        }
      }

      // The medic's beam and the support's shield stay automatic for you too.
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
      } else if (h.cls === 'support' && T.shieldCd <= 0) {
        const hurt = up.find((o) => this.time - o.lastHit < 0.6 && o.shieldT <= 0);
        if (hurt) { hurt.shieldT = C.shield.dur; T.shieldCd = C.shield.cd; }
      }

      // Stand over a downed teammate to revive them.
      for (const o of this.hunters) {
        if (o.state !== 'down' || dist2(o.x, o.z, h.x, h.z) > 1.7 * 1.7) continue;
        o.reviveT += dt;
        if (o.reviveT >= PH.HUNTER_AI.reviveTime) {
          o.state = 'up'; o.hp = o.maxHp * PH.HUNTER_AI.reviveHp; o.reviveT = 0;
          this.toast(`${this.who(h)} revived the ${o.cls}`);
        }
      }
    }

    /** "You" for your hunter; a friend's name for theirs. */
    who(h) { return h === this.me ? 'You' : h.name || `The ${h.cls}`; }

    useAbility() { return this.useAbilityFor(this.me); }

    /** A hunter's special: yours from the button, a friend's over the network. */
    useAbilityFor(me) {
      if (!me || this.state !== 'playing' || me.state !== 'up' || me.abilityCd > 0) return false;
      const A = PH.HUNT_MODE.abilities[me.cls], mon = this.mon;
      if (me.cls === 'assault') {
        me.overdrive = A.dur;
        this.fx.shockwave(me.x, me.z, 3, 0xff8a3d, 0.4);
        this.fx.burst(me.x, 1, me.z, 30, 0xffb347, 5, 0.35, 0.6, 2, 1);
        this.banner('OVERDRIVE', 'warn');
      } else if (me.cls === 'trapper') {
        if (this.zones.some((z) => z.kind === 'arena')) return false;
        this.zones.push({ kind: 'arena', x: me.x, z: me.z, r: A.r, t: 0, dur: A.dur });
        this.team.arenaCd = Math.max(this.team.arenaCd, 20);
        this.fx.shockwave(me.x, me.z, A.r, 0xffb347, 0.6);
        const inside = dist2(mon.x, mon.z, me.x, me.z) < A.r * A.r;
        this.banner(inside ? 'MOBILE ARENA - IT CANNOT ESCAPE' : 'MOBILE ARENA', inside ? 'win' : 'warn');
        this.sfx('roar');
      } else if (me.cls === 'medic') {
        for (const o of this.hunters) {
          const d2 = dist2(o.x, o.z, me.x, me.z);
          if (o.state === 'up' && d2 < A.r * A.r) o.hp = Math.min(o.maxHp, o.hp + A.heal);
          else if (o.state === 'down' && d2 < 16) { o.state = 'up'; o.hp = o.maxHp * 0.5; o.reviveT = 0; this.toast(`${this.who(me)} revived the ${o.cls}`); }
        }
        this.fx.shockwave(me.x, me.z, A.r, 0x7dffb0, 0.5);
        this.fx.burst(me.x, 1, me.z, 30, 0x7dffb0, 4, 0.35, 0.7, -1, 0.8);
        this.sfx('heal');
      } else if (me.cls === 'ranger') {
        // A tracking dart: it has to be close enough to hit.
        const d = Math.hypot(mon.x - me.x, mon.z - me.z);
        if (d > A.range) { if (me === this.me) this.ownToast('Too far - get closer to tag it'); return false; }
        this.tagT = A.dur;
        this.fx.dashTrail(me.x, me.z, (mon.x - me.x) / (d || 1), (mon.z - me.z) / (d || 1), d);
        this.fx.shockwave(mon.x, mon.z, 2.5, 0xa55eea, 0.4);
        this.banner('MONSTER TAGGED', 'win');
      } else if (me.cls === 'support') {
        // On the monster if anyone can see it, else where it was last known.
        let x, z;
        const k = this.team.known;
        if (this.monsterVisible()) { x = mon.x; z = mon.z; }
        else if (k) { x = k.x; z = k.z; }
        else { x = me.x + Math.sin(me.facing) * 6; z = me.z + Math.cos(me.facing) * 6; }
        this.telegraphs.push({ shape: 'circle', x, z, r: A.r, t: 0, dur: A.delay, color: 0x4ecdc4, strike: A.dmg });
      }
      me.abilityMax = A.cd;
      me.abilityCd = A.cd;
      if (me === this.me) { this.abilityUses++; this.fx.addShake(0.2); }
      this.sfx('ability');
      return true;
    }

    /** Jetpack burst. */
    dodge() { return this.dodgeFor(this.me, this.input); }

    dodgeFor(me, inp) {
      const D = PH.HUNT_MODE.dodge;
      if (!me || this.state !== 'playing' || me.state !== 'up' || me.dodgeCd > 0) return false;
      const mon = this.mon;
      let dx = inp.x, dz = inp.z, m = Math.hypot(dx, dz);
      if (m < 0.08) {
        // Standing still you face the monster, so a plain tap bursts away from it.
        const ax = me.x - mon.x, az = me.z - mon.z, ad = Math.hypot(ax, az);
        if (ad < 10 && ad > 0.01) { dx = ax / ad; dz = az / ad; } else { dx = Math.sin(me.facing); dz = Math.cos(me.facing); }
        m = 1;
      }
      me.dashX = dx / m; me.dashZ = dz / m; me.dashT = D.dur;
      me.facing = Math.atan2(me.dashX, me.dashZ);
      me.iframes = Math.max(me.iframes, D.iframes);
      me.dodgeCd = D.cd;
      if (me === this.me) this.dodges++;
      if (me.remote) me.dashT = 0;      // their device flies the burst; we only grant the iframes
      this.fx.dashTrail(me.x, me.z, me.dashX, me.dashZ, D.dist);
      this.sfx('dash');
      return true;
    }

    /** A roar threw this hunter back and jammed their weapon. */
    onHunterKnock(h) {
      if (h === this.me) this.ownToast('😱 Its roar threw you back - weapon jammed');
    }

    onHunterHurt(h, dmg) {
      if (h.remote && this.onRemoteHurt) this.onRemoteHurt(h, dmg);
      if (h !== this.me) return;
      if (this.time - (this.lastHurtFx || -9) > 0.3) {
        this.lastHurtFx = this.time;
        this.hooks.onPlayerHit && this.hooks.onPlayerHit(dmg);
        this.fx.addShake(0.25);
      }
    }

    damageMonster(dmg) {
      const before = this.mon.hp + this.mon.armor;
      if (this.tagT > 0) dmg *= 1 + PH.HUNT_MODE.abilities.ranger.bonus;   // a tagged monster takes more
      super.damageMonster(dmg);
      const dealt = before - (this.mon.hp + this.mon.armor);
      if (dealt > 0 && this.hooks.onDamage && this.monsterVisible()) this.hooks.onDamage(this.mon.x, 2.6, this.mon.z, dealt, dealt >= 40);
    }

    score() {
      const M = PH.MONSTER_MODE;
      if (this.victory) return Math.round(2000 + (3 - this.stage) * 1000 + Math.max(0, M.duration - this.time) * 5);
      const hurt = 1 - Math.max(0, this.mon.hp) / this.mon.maxHp;
      return Math.round(this.time * 2 + hurt * 1000);
    }

    /** The base class reports from the monster's side; flip it. */
    end(monsterWon, how) {
      if (this.state === 'over') return;
      this.state = 'over';
      this.victory = !monsterWon;
      this.how = how;
      this.hooks.onEnd && this.hooks.onEnd({
        mode: 'hunt', victory: !monsterWon, how, time: this.time, stage: this.stage, monsterType: this.monsterType,
        cls: this.myClass, downs: this.me ? this.me.downs : 0, huntersLost: this.huntersKilled, score: this.score(),
        biome: this.biomeId,
      });
    }
  }

  HuntGame.retell = retell;     // the co-op guest retells the host's lines the same way
  PH.HuntGame = HuntGame;
})();
