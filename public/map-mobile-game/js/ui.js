/**
 * Primal Hunt - screens, HUD and input.
 *
 * Two rules learned from the previous version of this game:
 *  - Input lives on one full-screen surface (#touch) that nothing renders on
 *    top of during play. The old joystick sat underneath the 3D canvas and
 *    never received a single touch.
 *  - The HUD is never rebuilt per frame. The old ability bar was torn down
 *    and recreated sixty times a second, so the button under your thumb was
 *    replaced before the tap completed. Here values are written only when
 *    they change, and the loadout is rebuilt only when the loadout changes.
 */
window.PH = window.PH || {};

(() => {
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ph.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ph.' + k, JSON.stringify(v)); } catch { /* private mode: fine */ } },
  };
  const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  class UI {
    constructor(game, render, monster, hunt) {
      this.game = game;              // whichever mode is running; main.js steps this one
      this.survival = game;
      this.monster = monster;
      this.hunt = hunt;
      this.pickFor = 'survival';
      this.bestHunt = store.get('bestHunt', null);
      this.render = render;
      this.screens = ['menu', 'modes', 'classes', 'monsters', 'choice', 'pause', 'over', 'nogl'];
      this.selectedMonster = store.get('monster', null);
      this.bestMonster = store.get('bestMonster', null);
      this.selectedClass = store.get('class', null);
      this.muted = store.get('muted', false);
      this.best = store.get('best', null);

      this.pointerId = null;
      this.stick = { x: 0, z: 0 };
      this.keys = new Set();
      this.cache = {};
      this.tmp = { x: 0, y: 0, on: true };
      this.numIdx = 0;
      this.lastNum = 0;

      this.el = {
        hud: $('hud'), xpfill: $('xpfill'), lvl: $('lvl'), timer: $('timer'), kills: $('kills'),
        hpbar: $('hpbar'), hpfill: $('hpfill'), bossbar: $('bossbar'), bossname: $('bossname'), bossfill: $('bossfill'),
        banner: $('banner'), numbers: $('numbers'), hurt: $('hurt'), loadout: $('loadout'),
        joy: $('joy'), knob: $('joy-knob'), touch: $('touch'),
        ability: $('btn-ability'), abilityIcon: $('ability-icon'), dodge: $('btn-dodge'),
        mstage: $('mstage'), marmor: $('marmorfill'), mhp: $('mhpfill'), mfood: $('mfood'), mfoodfill: $('mfoodfill'),
        mfoodlabel: $('mfoodlabel'), mstatus: $('mstatus'), squad: $('squad'), radar: $('radar'), hbars: $('hbars'),
        evolve: $('btn-evolve'), toast: $('toast'),
      };
      this.radarCtx = this.el.radar.getContext('2d');
      this.hbars = [];
      for (let i = 0; i < 4; i++) {
        const b = document.createElement('div');
        b.className = 'hb'; b.innerHTML = '<i></i>';
        this.el.hbars.appendChild(b);
        this.hbars.push(b);
      }
      this.taught = store.get('taughtAbility', false);
      this.nums = [];
      for (let i = 0; i < 24; i++) {
        const n = document.createElement('div');
        n.className = 'n';
        this.el.numbers.appendChild(n);
        this.nums.push(n);
      }

      this.bindScreens();
      this.bindInput();
      this.applyMute();
      this.refreshBest();
    }

    /* ── Screens ────────────────────────────────────────────── */

    show(id) {
      for (const s of this.screens) $(s).classList.toggle('active', s === id);
    }

    hideScreens() { for (const s of this.screens) $(s).classList.remove('active'); }

    bindScreens() {
      const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); this.sfx('click'); fn(); });
      tap('btn-play', () => this.show('modes'));
      tap('btn-modes-back', () => this.show('menu'));
      tap('mode-survival', () => { this.pickFor = 'survival'; this.buildClassGrid(); this.show('classes'); });
      tap('mode-hunt', () => { this.pickFor = 'hunt'; this.buildClassGrid(); this.show('classes'); });
      tap('mode-monster', () => { this.buildMonsterGrid(); this.show('monsters'); });
      tap('btn-classes-back', () => this.show('modes'));
      tap('btn-monsters-back', () => this.show('modes'));
      tap('btn-monster-go', () => this.startMonsterRun(this.selectedMonster));
      tap('btn-hunt', () => (this.pickFor === 'hunt' ? this.startHuntRun(this.selectedClass) : this.startRun(this.selectedClass)));
      tap('btn-pause', () => this.pause());
      tap('btn-resume', () => this.resume());
      tap('btn-quit', () => this.toMenu());
      tap('btn-again', () => {
        const g = this.game;
        if (g.mode === 'monster') this.startMonsterRun(g.monsterType);
        else if (g.mode === 'hunt') this.startHuntRun(g.myClass);
        else this.startRun(g.classId);
      });
      tap('btn-menu', () => this.toMenu());
      tap('btn-mute', () => this.toggleMute());
      tap('btn-pause-mute', () => this.toggleMute());
    }

    buildClassGrid() {
      const grid = $('class-grid');
      grid.innerHTML = '';
      for (const [id, c] of Object.entries(PH.CLASSES)) {
        const w = PH.WEAPONS[c.weapon];
        const hunt = this.pickFor === 'hunt';
        const card = document.createElement('button');
        card.className = 'class-card' + (id === this.selectedClass ? ' selected' : '');
        card.style.setProperty('--accent', c.color);
        const ab = hunt ? PH.HUNT_MODE.abilities[id] : PH.ABILITIES[c.ability];
        card.innerHTML = hunt
          ? `<div class="ci">${c.icon}</div><div class="cn">${c.name.toUpperCase()}</div><div class="cr">${c.role}</div>
             <div class="ca">${ab.icon} ${ab.name}</div><div class="cp">${ab.desc}</div>`
          : `<div class="ci">${c.icon}</div><div class="cn">${c.name.toUpperCase()}</div>
          <div class="cr">${c.role}</div><div class="cw">${w.icon} ${w.name}</div><div class="ca">${ab.icon} ${ab.name}</div><div class="cp">${c.perkText}</div>`;
        card.title = ab.desc;
        card.addEventListener('click', () => {
          this.sfx('click');
          this.selectedClass = id;
          for (const el of grid.children) el.classList.remove('selected');
          card.classList.add('selected');
          $('btn-hunt').disabled = false;
        });
        grid.appendChild(card);
      }
      $('btn-hunt').disabled = !this.selectedClass;
      $('hunt-hint').hidden = this.pickFor !== 'hunt';
    }

    buildMonsterGrid() {
      const grid = $('monster-grid');
      grid.innerHTML = '';
      const colors = { goliath: '#ff6b35', kraken: '#4ecdc4', wraith: '#b06cff', behemoth: '#c9a227' };
      for (const [id, m] of Object.entries(PH.MONSTERS)) {
        const card = document.createElement('button');
        card.className = 'class-card' + (id === this.selectedMonster ? ' selected' : '');
        card.style.setProperty('--accent', colors[id]);
        card.innerHTML = `<div class="ci">${m.icon}</div><div class="cn">${m.name.toUpperCase()}</div>
          <div class="cr">${m.role}</div><div class="ca">${m.ability.icon} ${m.ability.name}</div><div class="cp">${m.blurb}</div>`;
        card.addEventListener('click', () => {
          this.sfx('click');
          this.selectedMonster = id;
          for (const el of grid.children) el.classList.remove('selected');
          card.classList.add('selected');
          $('btn-monster-go').disabled = false;
        });
        grid.appendChild(card);
      }
      $('btn-monster-go').disabled = !this.selectedMonster;
    }

    /** Shared by both modes: point the UI and main loop at a game, reset the HUD. */
    enterMode(game) {
      this.game = game;
      document.body.classList.toggle('mode-monster', game.mode === 'monster');
      document.body.classList.toggle('mode-hunt', game.mode === 'hunt');
      this.releaseStick();
      this.cache = {};
      this.hintsShown = 0;
      this.el.hpbar.style.display = '';   // hunter mode hides it while you are down
    }

    startMonsterRun(type) {
      if (!type) return;
      store.set('monster', type);
      this.selectedMonster = type;
      this.enterMode(this.monster);
      this.monster.newRun(type);
      this.hideScreens();
      this.el.hud.hidden = false;
      this.el.bossbar.hidden = true;
      this.el.hud.classList.remove('has-boss');
      const m = PH.MONSTERS[type];
      this.el.ability.style.setProperty('--accent', '#b06cff');
      this.el.abilityIcon.textContent = m.ability.icon;
      this.el.ability.setAttribute('aria-label', m.ability.name);
      this.el.dodge.querySelector('.ai').textContent = '🐾';
      this.el.dodge.setAttribute('aria-label', 'Pounce');
      this.buildSquad();
    }

    buildSquad() {
      const icons = { assault: '🔫', trapper: '🪤', medic: '💉', support: '🛡️' };
      const hs = this.game.hunters;
      this.el.squad.innerHTML = hs.map((h) =>
        `<div class="sq${h.controlled ? ' you' : ''}" style="--c:${PH.CLASSES[h.cls].color}"><span>${icons[h.cls]}</span><span class="sb"><i></i></span><span class="st"></span></div>`).join('');
      this.squadEls = [...this.el.squad.children];
      this.hbars.forEach((b, i) => { const h = hs[i]; if (h) b.style.setProperty('--c', PH.CLASSES[h.cls].color); });
    }

    startHuntRun(cls) {
      if (!cls) return;
      store.set('class', cls);
      this.selectedClass = cls;
      this.enterMode(this.hunt);
      this.hunt.newRun(cls);
      this.hideScreens();
      this.el.hud.hidden = false;
      this.el.bossbar.hidden = true;
      this.el.hud.classList.remove('has-boss');
      const ab = PH.HUNT_MODE.abilities[cls];
      this.el.ability.style.setProperty('--accent', PH.CLASSES[cls].color);
      this.el.abilityIcon.textContent = ab.icon;
      this.el.ability.setAttribute('aria-label', ab.name);
      this.el.dodge.querySelector('.ai').textContent = '💨';
      this.el.dodge.setAttribute('aria-label', 'Jetpack');
      this.buildSquad();
    }

    startRun(classId) {
      if (!classId) return;
      this.enterMode(this.survival);
      this.el.dodge.querySelector('.ai').textContent = '💨';
      this.el.dodge.setAttribute('aria-label', 'Dodge roll');
      store.set('class', classId);
      this.selectedClass = classId;
      this.releaseStick();
      this.cache = {};
      this.game.newRun(classId);
      this.hideScreens();
      this.el.hud.hidden = false;
      this.el.bossbar.hidden = true;
      this.el.hud.classList.remove('has-boss');
      const cls = PH.CLASSES[classId];
      this.el.ability.style.setProperty('--accent', cls.color);
      this.el.abilityIcon.textContent = PH.ABILITIES[cls.ability].icon;
      this.el.ability.setAttribute('aria-label', PH.ABILITIES[cls.ability].name);
      this.buildLoadout();
    }

    toMenu() {
      this.game.state = 'menu';
      this.enterMode(this.survival);
      this.el.hud.hidden = true;
      this.refreshBest();
      this.show('menu');
      this.survival.attract(this.selectedClass || 'assault');
    }

    pause() {
      if (this.game.state !== 'playing') return;
      this.game.state = 'paused';
      this.releaseStick();
      const pl = $('pause-loadout');
      if (this.game.mode === 'hunt') {
        const g = this.game, ab = PH.HUNT_MODE.abilities[g.myClass];
        pl.innerHTML = `<div class="lo">${PH.CLASSES[g.myClass].icon}</div><div class="lo">${ab.icon}</div>`
          + `<div class="lo">${g.revealed ? PH.MONSTERS[g.monsterType].icon : '❓'}<i>${g.stage}</i></div>`;
      } else if (this.game.mode === 'monster') {
        // The monster has no loadout; show what it is and how the run is going.
        const g = this.game, m = PH.MONSTERS[g.monsterType];
        pl.innerHTML = `<div class="lo">${m.icon}<i>${g.stage}</i></div><div class="lo">${m.ability.icon}</div>`
          + `<div class="lo">💀<i>${g.huntersKilled}</i></div><div class="lo">🍖<i>${g.eaten}</i></div>`;
      } else pl.innerHTML = this.loadoutHTML();
      this.show('pause');
    }

    resume() {
      if (this.game.state !== 'paused') return;
      this.hideScreens();
      this.game.state = 'playing';
    }

    toggleMute() {
      this.muted = !this.muted;
      store.set('muted', this.muted);
      this.applyMute();
    }

    applyMute() {
      if (window.Sfx) window.Sfx.setMuted(this.muted);
      const label = this.muted ? '🔇 Sound off' : '🔊 Sound on';
      $('btn-mute').textContent = label;
      $('btn-pause-mute').textContent = label;
    }

    refreshBest() {
      const b = this.best, m = this.bestMonster;
      const parts = [];
      if (b) parts.push(`Survival best ${b.score.toLocaleString()}${b.victory ? ' 👑' : ''}`);
      if (this.bestHunt) parts.push(`Squad best ${this.bestHunt.score.toLocaleString()}${this.bestHunt.victory ? ' 👑' : ''}`);
      if (m) parts.push(`Monster best ${m.score.toLocaleString()}${m.victory ? ' 👑' : ''}`);
      $('best-line').textContent = parts.join('  ·  ');
    }

    sfx(name) { if (window.Sfx && !this.muted) window.Sfx.play(name); }

    /* ── Hooks from the game ────────────────────────────────── */

    hooks() {
      return {
        sfx: (n) => this.sfx(n),
        onBanner: (text, kind) => this.banner(text, kind),
        onPlayerHit: () => {
          this.el.hurt.classList.add('on');
          requestAnimationFrame(() => this.el.hurt.classList.remove('on'));
          if (navigator.vibrate) { try { navigator.vibrate(30); } catch { /* not allowed in iframes */ } }
        },
        onDamage: (x, y, z, amount, crit) => this.damageNumber(x, y, z, amount, crit),
        onBoss: (bosses) => {
          this.el.bossbar.hidden = bosses.length === 0;
          this.el.hud.classList.toggle('has-boss', bosses.length > 0);
          this.cache.bossKey = null;
        },
        onChoice: (choices, kind) => this.openChoice(choices, kind),
        onLoadout: () => this.buildLoadout(),
        onEnd: (r) => (r.mode === 'monster' ? this.monsterOver(r) : r.mode === 'hunt' ? this.huntOver(r) : this.gameOver(r)),
        onToast: (text) => this.toast(text),
        onEvolveReady: () => { if (navigator.vibrate) { try { navigator.vibrate([40, 60, 40]); } catch { /* iframe */ } } },
      };
    }

    toast(text) {
      const t = this.el.toast;
      t.textContent = text;
      t.classList.add('show');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
    }

    huntOver(r) {
      this.releaseStick();
      const m = PH.MONSTERS[r.monsterType];
      const title = $('over-title');
      title.textContent = r.victory ? 'MONSTER SLAIN' : r.how === 'apex' ? 'SQUAD WIPED OUT' : 'IT GOT AWAY';
      title.className = r.victory ? 'win' : 'lose';
      $('over-sub').textContent = r.victory
        ? `The squad brought down the ${m.name} at stage ${r.stage}.`
        : r.how === 'apex' ? `The ${m.name} reached stage ${r.stage} and took down the whole squad.` : `The ${m.name} outlasted the dropship's clock.`;
      $('over-stats').innerHTML = [
        [fmtTime(r.time), 'TIME'], [`${r.stage}/3`, 'MONSTER STAGE'], [r.downs, 'TIMES DOWNED'], [r.huntersLost, 'HUNTERS LOST'],
      ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
      const isBest = !this.bestHunt || r.score > this.bestHunt.score;
      if (isBest) { this.bestHunt = { score: r.score, victory: r.victory }; store.set('bestHunt', this.bestHunt); }
      $('over-score').innerHTML = `Score ${r.score.toLocaleString()}` + (isBest ? ' <span class="newbest">· NEW BEST</span>' : '');
      this.sfx(r.victory ? 'victory' : 'defeat');
      setTimeout(() => this.show('over'), r.victory ? 700 : 900);
    }

    monsterOver(r) {
      this.releaseStick();
      const m = PH.MONSTERS[r.monsterType];
      const title = $('over-title');
      title.textContent = r.victory ? (r.how === 'apex' ? 'APEX PREDATOR' : 'YOU SURVIVED') : 'YOU WERE HUNTED';
      title.className = r.victory ? 'win' : 'lose';
      $('over-sub').textContent = r.victory
        ? (r.how === 'apex' ? `The ${m.name} wiped out the whole squad.` : 'The dropship left without its prey.')
        : `The hunters brought down the ${m.name} at stage ${r.stage}.`;
      $('over-stats').innerHTML = [
        [fmtTime(r.time), 'TIME'], [`${r.stage}/3`, 'STAGE'], [r.huntersKilled, 'HUNTERS KILLED'], [r.eaten, 'PREY EATEN'],
      ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
      const isBest = !this.bestMonster || r.score > this.bestMonster.score;
      if (isBest) { this.bestMonster = { score: r.score, victory: r.victory }; store.set('bestMonster', this.bestMonster); }
      $('over-score').innerHTML = `Score ${r.score.toLocaleString()}` + (isBest ? ' <span class="newbest">· NEW BEST</span>' : '');
      this.sfx(r.victory ? 'victory' : 'defeat');
      setTimeout(() => this.show('over'), r.victory ? 700 : 900);
    }

    banner(text, kind = 'warn') {
      const b = this.el.banner;
      b.textContent = text;
      b.className = kind;
      void b.offsetWidth;            // restart the animation even for back-to-back banners
      b.classList.add('show');
    }

    damageNumber(x, y, z, amount, crit) {
      const now = performance.now();
      if (!crit && now - this.lastNum < 90) return;   // a field ticking a boss would otherwise be a blizzard
      this.lastNum = now;
      const p = this.render.project(x, y, z, this.tmp);
      if (!p.on) return;
      const n = this.nums[this.numIdx++ % this.nums.length];
      n.textContent = Math.round(amount);
      n.className = 'n' + (crit ? ' crit' : '');
      n.style.transform = `translate(${p.x + (Math.random() - 0.5) * 24}px, ${p.y}px)`;
      void n.offsetWidth;
      n.classList.add('go');
    }

    openChoice(choices, kind) {
      this.releaseStick();
      const chest = kind === 'chest';
      $('choice-title').textContent = chest ? '🎁 SUPPLY DROP' : `LEVEL ${this.game.level}`;
      $('choice-sub').textContent = chest ? 'A free upgrade - choose one' : 'Choose an upgrade';
      const wrap = $('choice-cards');
      wrap.innerHTML = '';
      // Ignore taps for a moment: you are usually mid-swipe when a level lands,
      // and the finger that was steering should not pick a card unread.
      const armedAt = performance.now() + 450;
      for (const c of choices) {
        const card = document.createElement('button');
        card.className = 'card' + (chest ? ' chest' : '');
        let icon, name, desc, tag;
        if (c.type === 'evolve') {
          const ev = PH.EVOLUTIONS[c.id];
          icon = ev.icon; name = ev.name; desc = `${PH.WEAPONS[c.id].name} evolves. ${ev.desc}`;
          tag = '<span class="kt evo">EVOLVE</span>';
          card.classList.add('evo');
        } else if (c.type === 'weapon') {
          const w = PH.WEAPONS[c.id];
          icon = w.icon; name = w.name; desc = w.levels[c.level - 1].desc;
          tag = c.level === 1 ? '<span class="kt new">NEW</span>' : `<span class="kt lv">LV ${c.level}</span>`;
        } else if (c.type === 'passive') {
          const p = PH.PASSIVES[c.id];
          icon = p.icon; name = p.name; desc = p.text;
          tag = c.level === 1 ? '<span class="kt new">NEW</span>' : `<span class="kt lv">LV ${c.level}</span>`;
        } else if (c.type === 'heal') {
          icon = '❤️'; name = 'Field Ration'; desc = 'Restore all health.'; tag = '';
        } else {
          icon = '⭐'; name = 'Trophy'; desc = '+250 score.'; tag = '';
        }
        card.innerHTML = `<div class="ki">${icon}</div><div class="kb"><div class="kn">${name}${tag}</div><div class="kd">${desc}</div></div>`;
        card.addEventListener('click', () => {
          if (performance.now() < armedAt) return;
          this.sfx('click');
          this.hideScreens();
          this.game.choose(c);
        });
        wrap.appendChild(card);
      }
      setTimeout(() => { for (const el of wrap.children) el.classList.add('armed'); }, 450);
      this.show('choice');
    }

    loadoutHTML() {
      const g = this.game;
      const w = g.weapons.map((x) => (x.level > 5
        ? `<div class="lo evo">${PH.EVOLUTIONS[x.id].icon}<i>★</i></div>`
        : `<div class="lo">${PH.WEAPONS[x.id].icon}<i>${x.level}</i></div>`)).join('');
      const p = g.passives.map((x) => `<div class="lo p">${PH.PASSIVES[x.id].icon}<i>${x.level}</i></div>`).join('');
      return `<div class="lrow">${w}</div><div class="lrow">${p}</div>`;
    }

    buildLoadout() { this.el.loadout.innerHTML = this.loadoutHTML(); }

    gameOver(r) {
      this.releaseStick();
      const title = $('over-title');
      title.textContent = r.victory ? 'VICTORY' : 'YOU FELL';
      title.className = r.victory ? 'win' : 'lose';
      $('over-sub').textContent = r.victory
        ? (r.bossKills >= 3 ? 'All three monsters slain. The hunt is over.' : 'The final monster is slain. The hunt is over.')
        : r.bossKills ? `${r.bossKills} of 3 monsters slain.` : 'The swarm got you.';
      $('over-stats').innerHTML = [
        [fmtTime(r.time), 'TIME'], [r.level, 'LEVEL'], [r.kills.toLocaleString(), 'KILLS'], [`${r.bossKills}/3`, 'MONSTERS'],
      ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
      const isBest = !this.best || r.score > this.best.score;
      if (isBest) { this.best = { score: r.score, victory: r.victory, time: r.time }; store.set('best', this.best); }
      $('over-score').innerHTML = `Score ${r.score.toLocaleString()}` + (isBest ? ' <span class="newbest">· NEW BEST</span>' : '');
      this.sfx(r.victory ? 'victory' : 'defeat');
      setTimeout(() => this.show('over'), r.victory ? 600 : 900);
    }

    /* ── Input ──────────────────────────────────────────────── */

    bindInput() {
      const t = this.el.touch;
      const R = 56;
      const move = (x, y) => {
        let dx = x - this.ox, dy = y - this.oy;
        const d = Math.hypot(dx, dy);
        if (d > R) {
          // Drag the base along behind the thumb, so reversing is instant
          // instead of first travelling back across the whole stick.
          this.ox += dx * (1 - R / d); this.oy += dy * (1 - R / d);
          dx = x - this.ox; dy = y - this.oy;
        }
        // Direction from the base, and a strength that reaches full speed at
        // half the stick's travel: small thumb movements should really move you.
        const len = Math.hypot(dx, dy);
        const m = Math.min(1, len / R);
        const strength = Math.max(0, Math.min(1, (m - 0.1) / 0.4));
        this.stick.x = len ? (dx / len) * strength : 0;
        this.stick.z = len ? (dy / len) * strength : 0;
        this.el.joy.style.left = this.ox + 'px';
        this.el.joy.style.top = this.oy + 'px';
        this.el.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      };
      t.addEventListener('pointerdown', (e) => {
        if (this.game.state !== 'playing' || this.pointerId !== null) return;
        this.pointerId = e.pointerId;
        try { t.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
        this.ox = e.clientX; this.oy = e.clientY;
        move(e.clientX, e.clientY);
        this.el.joy.classList.add('on');
        e.preventDefault();
      });
      t.addEventListener('pointermove', (e) => { if (e.pointerId === this.pointerId) move(e.clientX, e.clientY); });
      const end = (e) => { if (e.pointerId === this.pointerId) this.releaseStick(); };
      t.addEventListener('pointerup', end);
      t.addEventListener('pointercancel', end);
      t.addEventListener('lostpointercapture', end);
      t.addEventListener('contextmenu', (e) => e.preventDefault());

      const press = (el, fn) => el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        fn();
      });
      press(this.el.ability, () => this.useAbility());
      press(this.el.dodge, () => this.game.dodge());
      press(this.el.evolve, () => { if (this.game.evolve && this.game.evolve()) this.el.evolve.hidden = true; });

      const KEYS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
      this.KEYS = KEYS;
      window.addEventListener('keydown', (e) => {
        if (KEYS[e.code]) { this.keys.add(e.code); e.preventDefault(); }
        // Only claim Space and Shift in play, so they still work on the menus.
        if (this.game.state === 'playing' && !e.repeat) {
          if (e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); this.useAbility(); }
          if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyQ') { e.preventDefault(); this.game.dodge(); }
          if (e.code === 'KeyF' && this.game.evolve) { e.preventDefault(); this.game.evolve(); }
        }
        if (e.code === 'Escape' || e.code === 'KeyP') { if (this.game.state === 'playing') this.pause(); else if (this.game.state === 'paused') this.resume(); }
      });
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
      window.addEventListener('blur', () => { this.keys.clear(); this.pause(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    }

    useAbility() {
      if (this.game.useAbility()) {
        const b = this.el.ability;
        b.classList.remove('ping'); void b.offsetWidth; b.classList.add('ping');
      }
    }

    releaseStick() {
      this.pointerId = null;
      this.stick.x = this.stick.z = 0;
      this.el.joy.classList.remove('on');
    }

    applyInput() {
      let kx = 0, kz = 0;
      for (const k of this.keys) { const v = this.KEYS[k]; kx += v[0]; kz += v[1]; }
      const g = this.game.input;
      if (kx || kz) { const m = Math.hypot(kx, kz); g.x = kx / m; g.z = kz / m; }
      else { g.x = this.stick.x; g.z = this.stick.z; }
    }

    /* ── Per-frame HUD: write only what changed ─────────────── */

    set(key, value, write) {
      if (this.cache[key] === value) return;
      this.cache[key] = value;
      write(value);
    }

    frame() {
      const g = this.game;
      if (g.state === 'menu' || !g.player) return;
      if (g.mode === 'monster') return this.frameMonster();
      if (g.mode === 'hunt') return this.frameHunt();
      const pl = g.player, E = this.el;
      this.set('xp', Math.round((g.xp / g.xpNeed) * 200), (v) => { E.xpfill.style.width = (v / 2) + '%'; });
      this.set('lvl', g.level, (v) => { E.lvl.textContent = `LV ${v}`; });
      this.set('t', Math.floor(g.time), (v) => { E.timer.textContent = fmtTime(v); });
      this.set('k', g.kills, (v) => { E.kills.textContent = v.toLocaleString(); });
      const hp = Math.max(0, Math.round((pl.hp / pl.maxHp) * 100));
      this.set('hp', hp, (v) => { E.hpfill.style.width = v + '%'; E.hpfill.classList.toggle('low', v < 30); });
      const ac = g.abilityMax ? g.abilityCd / g.abilityMax : 0;
      this.set('acd', Math.ceil(ac * 60), (v) => { E.ability.style.setProperty('--cd', v / 60); });
      this.set('aready', ac <= 0, (v) => {
        E.ability.classList.toggle('ready', v);
        // The first time a new player's special charges, tell them about it.
        if (v && !this.taught && g.state === 'playing') {
          this.taught = true; store.set('taughtAbility', true);
          const desktop = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
          this.banner(desktop ? 'SPECIAL READY - PRESS SPACE' : 'SPECIAL READY - TAP THE BUTTON', 'win');
        }
      });
      this.set('dcd', Math.ceil((g.dodgeCd / PH.DODGE.cd) * 30), (v) => { E.dodge.style.setProperty('--cd', v / 30); });
      const p = this.render.project(pl.x, 0, pl.z, this.tmp);
      E.hpbar.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y + 14)}px)`;
      if (g.bosses.length) {
        const b = g.bosses[0];
        this.set('bossKey', b.id, () => { E.bossname.textContent = `${b.icon} ${b.name.toUpperCase()}  ·  STAGE ${b.stage}`; });
        this.set('bossHp', Math.round((b.hp / b.maxHp) * 200), (v) => { E.bossfill.style.width = Math.max(0, v / 2) + '%'; });
      }
    }
  }

  const SQUAD_STATE = { up: '', down: 'DOWN', dead: '', waiting: '' };

  UI.prototype.frameMonster = function frameMonster() {
    const g = this.game, pl = g.player, E = this.el, M = PH.MONSTER_MODE, m = PH.MONSTERS[g.monsterType];
    const S = g.stageDef();
    this.set('mstage', `${g.stage}`, () => { E.mstage.textContent = `${m.icon} ${m.name.toUpperCase()}  ·  STAGE ${g.stage}`; });
    this.set('mhp', Math.max(0, Math.round((pl.hp / pl.maxHp) * 200)), (v) => { E.mhp.style.width = (v / 2) + '%'; });
    this.set('marmor', Math.round((pl.armor / pl.maxArmor) * 200), (v) => { E.marmor.style.width = (v / 2) + '%'; });
    const food = g.stage >= 3 ? 1 : g.food / S.food;
    this.set('mfood', Math.round(food * 200), (v) => { E.mfoodfill.style.width = (v / 2) + '%'; });
    const ready = g.canEvolve();
    this.set('mfoodfull', g.stage < 3 && food >= 1, (v) => { E.mfood.classList.toggle('full', v); });
    this.set('mfoodlabel', g.stage >= 3 ? 'APEX' : food >= 1 ? 'READY TO EVOLVE' : 'EVOLUTION', (v) => { E.mfoodlabel.textContent = v; });
    this.set('evolve', ready, (v) => { E.evolve.hidden = !v; });
    const left = Math.max(0, M.duration - g.time);
    this.set('t', Math.ceil(left), (v) => { E.timer.textContent = fmtTime(v); });
    const status = pl.evolveT > 0 ? 'evolving' : g.spotted ? 'spotted' : pl.hidden ? 'hidden' : 'unseen';
    this.set('mstatus', status, (v) => { E.mstatus.className = v; E.mstatus.textContent = v.toUpperCase(); });

    // Specials and pounce share the survival buttons.
    const ac = g.abilityMax ? g.abilityCd / g.abilityMax : 0;
    this.set('acd', Math.ceil(ac * 60), (v) => { E.ability.style.setProperty('--cd', v / 60); });
    this.set('aready', ac <= 0, (v) => { E.ability.classList.toggle('ready', v); });
    this.set('dcd', Math.ceil((g.dodgeCd / M.pounce.cd) * 30), (v) => { E.dodge.style.setProperty('--cd', v / 30); });

    // Squad roster.
    g.hunters.forEach((h, i) => {
      const el = this.squadEls && this.squadEls[i];
      if (!el) return;
      const respawn = h.state === 'dead' && g.team.respawnAt ? Math.ceil(g.team.respawnAt - g.time) : 0;
      this.set('sqs' + i, h.state + respawn, () => {
        el.className = 'sq ' + h.state;
        el.querySelector('.st').textContent = h.state === 'dead' ? (respawn ? `${respawn}s` : '💀') : SQUAD_STATE[h.state];
      });
      this.set('sqh' + i, Math.round((h.hp / h.maxHp) * 50), (v) => { el.querySelector('.sb i').style.width = (v * 2) + '%'; });
    });

    // Health bars over the hunters' heads.
    g.hunters.forEach((h, i) => {
      const b = this.hbars[i];
      if (h.state !== 'up') { b.style.display = 'none'; return; }
      const p = this.render.project(h.x, 2.3, h.z, this.tmp);
      if (!p.on) { b.style.display = 'none'; return; }
      b.style.display = 'block';
      b.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      b.firstChild.style.width = Math.round((h.hp / h.maxHp) * 100) + '%';
      b.classList.toggle('shield', h.shieldT > 0);
    });

    // First-run pointers.
    if (!this.hintsShown && g.time > 0.6) { this.hintsShown = 1; this.toast('Eat wildlife to evolve. Tall grass hides you.'); }

    const now = performance.now();
    if (!this.radarAt || now - this.radarAt > 80) { this.radarAt = now; this.drawRadar(g); }
  };

  const HUNT_STATUS = { spotted: 'MONSTER SPOTTED', tracking: 'TRACKING', searching: 'SEARCHING', evolving: 'IT IS EVOLVING' };

  UI.prototype.frameHunt = function frameHunt() {
    const g = this.game, me = g.me, mon = g.mon, E = this.el, M = PH.MONSTER_MODE, md = PH.MONSTERS[g.monsterType];
    const S = g.stageDef();
    // The bars are the monster's: what the squad knows about it.
    this.set('mstage', `${g.stage}${g.revealed}`, () => {
      E.mstage.textContent = g.revealed ? `${md.icon} ${md.name.toUpperCase()}  ·  STAGE ${g.stage}` : `❓ UNKNOWN MONSTER  ·  STAGE ${g.stage}`;
    });
    this.set('mhp', Math.max(0, Math.round((mon.hp / mon.maxHp) * 200)), (v) => { E.mhp.style.width = (v / 2) + '%'; });
    this.set('marmor', Math.round((mon.armor / mon.maxArmor) * 200), (v) => { E.marmor.style.width = (v / 2) + '%'; });
    const food = g.stage >= 3 ? 1 : g.food / S.food;
    this.set('mfood', Math.round(food * 200), (v) => { E.mfoodfill.style.width = (v / 2) + '%'; });
    this.set('mfoodfull', g.stage < 3 && food >= 1, (v) => { E.mfood.classList.toggle('full', v); });
    this.set('mfoodlabel', g.stage >= 3 ? 'FULLY EVOLVED' : 'MONSTER EVOLUTION', (v) => { E.mfoodlabel.textContent = v; });
    this.set('evolve', false, (v) => { E.evolve.hidden = !v; });
    this.set('t', Math.ceil(Math.max(0, M.duration - g.time)), (v) => { E.timer.textContent = fmtTime(v); });
    const status = mon.evolveT > 0 ? 'evolving' : !g.monView.hidden ? 'spotted' : g.team.known ? 'tracking' : 'searching';
    this.set('mstatus', status, (v) => { E.mstatus.className = v; E.mstatus.textContent = HUNT_STATUS[v]; });

    const ac = g.abilityMax ? g.abilityCd / g.abilityMax : 0;
    this.set('acd', Math.ceil(ac * 60), (v) => { E.ability.style.setProperty('--cd', v / 60); });
    this.set('aready', ac <= 0 && me.state === 'up', (v) => {
      E.ability.classList.toggle('ready', v);
      if (v && !this.taught && g.state === 'playing') {
        this.taught = true; store.set('taughtAbility', true);
        const desktop = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
        this.banner(desktop ? 'SPECIAL READY - PRESS SPACE' : 'SPECIAL READY - TAP THE BUTTON', 'win');
      }
    });
    this.set('dcd', Math.ceil((g.dodgeCd / PH.HUNT_MODE.dodge.cd) * 30), (v) => { E.dodge.style.setProperty('--cd', v / 30); });

    // Your health under your hunter.
    const hp = Math.max(0, Math.round((me.hp / me.maxHp) * 100));
    this.set('hp', hp, (v) => { E.hpfill.style.width = v + '%'; E.hpfill.classList.toggle('low', v < 30); });
    const p = this.render.project(me.x, 0, me.z, this.tmp);
    E.hpbar.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y + 14)}px)`;
    E.hpbar.style.display = me.state === 'up' ? 'block' : 'none';

    // Squad roster, with you outlined.
    g.hunters.forEach((h, i) => {
      const el = this.squadEls && this.squadEls[i];
      if (!el) return;
      const respawn = h.state === 'dead' && g.team.respawnAt ? Math.ceil(g.team.respawnAt - g.time) : 0;
      this.set('sqs' + i, h.state + respawn, () => {
        el.className = 'sq ' + h.state + (h.controlled ? ' you' : '');
        el.querySelector('.st').textContent = h.state === 'dead' ? (respawn ? `${respawn}s` : '💀') : h.state === 'down' ? 'DOWN' : h.controlled ? 'YOU' : '';
      });
      this.set('sqh' + i, Math.round((h.hp / h.maxHp) * 50), (v) => { el.querySelector('.sb i').style.width = (v * 2) + '%'; });
    });
    // Health bars over your teammates.
    g.hunters.forEach((h, i) => {
      const b = this.hbars[i];
      if (h.controlled || h.state !== 'up') { b.style.display = 'none'; return; }
      const q = this.render.project(h.x, 2.3, h.z, this.tmp);
      if (!q.on) { b.style.display = 'none'; return; }
      b.style.display = 'block';
      b.style.transform = `translate(${Math.round(q.x)}px, ${Math.round(q.y)}px)`;
      b.firstChild.style.width = Math.round((h.hp / h.maxHp) * 100) + '%';
      b.classList.toggle('shield', h.shieldT > 0);
    });

    if (!this.hintsShown && g.time > 0.6) { this.hintsShown = 1; this.toast('Find it: follow the footprints, watch for birds.'); }
    const now = performance.now();
    if (!this.radarAt || now - this.radarAt > 80) { this.radarAt = now; this.drawRadar(g); }
  };

  /** A small map: the arena, grass, the trapper's dome, you, and the squad (a monster can smell them). */
  UI.prototype.drawRadar = function drawRadar(g) {
    const c = this.radarCtx, W = 180, R = 84, A = PH.MONSTER_MODE.arena, k = R / A, cx = W / 2, cz = W / 2;
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath(); c.arc(cx, cz, R, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(70, 150, 70, 0.35)';
    for (const p of g.grass) { c.beginPath(); c.arc(cx + p.x * k, cz + p.z * k, p.r * k, 0, Math.PI * 2); c.fill(); }
    for (const z of g.zones) {
      if (z.kind !== 'arena') continue;
      c.strokeStyle = 'rgba(255, 170, 60, 0.9)'; c.lineWidth = 3;
      c.beginPath(); c.arc(cx + z.x * k, cz + z.z * k, z.r * k, 0, Math.PI * 2); c.stroke();
    }
    const blink = Math.floor(performance.now() / 300) % 2;
    for (const h of g.hunters) {
      if ((h.state !== 'up' && h.state !== 'down') || h.controlled) continue;
      c.fillStyle = PH.CLASSES[h.cls].color;
      c.beginPath(); c.arc(cx + h.x * k, cz + h.z * k, h.state === 'down' ? (blink ? 7 : 4) : 6, 0, Math.PI * 2);
      if (h.state === 'down') { c.strokeStyle = c.fillStyle; c.lineWidth = 2; c.stroke(); } else c.fill();
    }
    if (g.mode === 'hunt') {
      // The monster: a red dot while seen, else a ring where it was last known.
      const mon = g.mon, kn = g.team.known;
      if (!g.monView.hidden) {
        c.fillStyle = '#ff3b3b';
        c.beginPath(); c.arc(cx + mon.x * k, cz + mon.z * k, 9, 0, Math.PI * 2); c.fill();
      } else if (kn) {
        c.strokeStyle = blink ? 'rgba(255, 80, 80, 0.95)' : 'rgba(255, 80, 80, 0.45)'; c.lineWidth = 3;
        c.beginPath(); c.arc(cx + kn.x * k, cz + kn.z * k, 10, 0, Math.PI * 2); c.stroke();
      }
    }
    const pl = g.player;
    c.translate(cx + pl.x * k, cz + pl.z * k);
    c.rotate(-pl.facing + Math.PI);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 8); c.lineTo(-8, 8); c.closePath(); c.fill();
    c.restore();
    c.strokeStyle = 'rgba(255, 255, 255, 0.25)'; c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cz, R, 0, Math.PI * 2); c.stroke();
  };

  PH.UI = UI;
})();
