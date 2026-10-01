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
    constructor(game, render) {
      this.game = game;
      this.render = render;
      this.screens = ['menu', 'classes', 'choice', 'pause', 'over', 'nogl'];
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
      };
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
      tap('btn-play', () => { this.buildClassGrid(); this.show('classes'); });
      tap('btn-classes-back', () => this.show('menu'));
      tap('btn-hunt', () => this.startRun(this.selectedClass));
      tap('btn-pause', () => this.pause());
      tap('btn-resume', () => this.resume());
      tap('btn-quit', () => this.toMenu());
      tap('btn-again', () => this.startRun(this.game.classId));
      tap('btn-menu', () => this.toMenu());
      tap('btn-mute', () => this.toggleMute());
      tap('btn-pause-mute', () => this.toggleMute());
    }

    buildClassGrid() {
      const grid = $('class-grid');
      grid.innerHTML = '';
      for (const [id, c] of Object.entries(PH.CLASSES)) {
        const w = PH.WEAPONS[c.weapon];
        const card = document.createElement('button');
        card.className = 'class-card' + (id === this.selectedClass ? ' selected' : '');
        card.style.setProperty('--accent', c.color);
        const ab = PH.ABILITIES[c.ability];
        card.innerHTML = `<div class="ci">${c.icon}</div><div class="cn">${c.name.toUpperCase()}</div>
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
    }

    startRun(classId) {
      if (!classId) return;
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
      this.releaseStick();
      this.el.hud.hidden = true;
      this.refreshBest();
      this.show('menu');
      this.game.attract();
    }

    pause() {
      if (this.game.state !== 'playing') return;
      this.game.state = 'paused';
      this.releaseStick();
      const pl = $('pause-loadout');
      pl.innerHTML = this.loadoutHTML();
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
      const b = this.best;
      $('best-line').textContent = b ? `Best: ${b.score.toLocaleString()}${b.victory ? '  ·  👑 victory' : `  ·  ${fmtTime(b.time)}`}` : '';
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
        onEnd: (r) => this.gameOver(r),
      };
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

      const KEYS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
      this.KEYS = KEYS;
      window.addEventListener('keydown', (e) => {
        if (KEYS[e.code]) { this.keys.add(e.code); e.preventDefault(); }
        // Only claim Space and Shift in play, so they still work on the menus.
        if (this.game.state === 'playing' && !e.repeat) {
          if (e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); this.useAbility(); }
          if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyQ') { e.preventDefault(); this.game.dodge(); }
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

  PH.UI = UI;
})();
