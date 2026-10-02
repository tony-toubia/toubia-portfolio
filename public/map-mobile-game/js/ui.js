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
  // What each sound feels like. Frequent ones (shots, kills, gems) stay silent.
  const HAPTICS = {
    damage: 45, dash: 18, heal: 12, click: 8, ability: 15, roar: 30, thunder: 22,
    levelup: [25, 40, 25], evolve: [30, 50, 70], victory: [60, 60, 140], defeat: [220],
  };
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
      this.screens = ['menu', 'modes', 'classes', 'monsters', 'daily', 'lodge', 'settings', 'choice', 'pause', 'over', 'nogl'];
      this.lodgeTab = 'skin';
      this.selectedMonster = store.get('monster', null);
      this.bestMonster = store.get('bestMonster', null);
      this.selectedClass = store.get('class', null);
      this.muted = store.get('muted', false);
      this.musicOn = store.get('music', true);
      // Vibration on phones that support it (iOS Safari does not, so the toggle hides there).
      this.haptics = store.get('haptics', true);
      this.canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
      this.hapticUntil = 0; this.hapticLen = 0;
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
      this.applyHaptics();
      this.applySettings();
      this.refreshBest();
    }

    /* ── Screens ────────────────────────────────────────────── */

    show(id) {
      for (const s of this.screens) $(s).classList.toggle('active', s === id);
    }

    hideScreens() { for (const s of this.screens) $(s).classList.remove('active'); }

    bindScreens() {
      const tap = (id, fn) => (typeof id === 'string' ? $(id) : id).addEventListener('click', (e) => { e.preventDefault(); this.sfx('click'); fn(); });
      tap('btn-play', () => { this.refreshWeeklyCard(); this.show('modes'); });
      tap('mode-weekly', () => this.openDaily('weekly'));
      tap('tab-weekly', () => this.boardTab('weekly'));
      tap('btn-weekly-go', () => { this.pickFor = 'weekly'; this.buildClassGrid(); this.show('classes'); });
      tap('btn-modes-back', () => this.show('menu'));
      tap('mode-survival', () => { this.pickFor = 'survival'; this.buildClassGrid(); this.show('classes'); });
      tap('mode-hunt', () => { this.pickFor = 'hunt'; this.buildClassGrid(); this.show('classes'); });
      tap('mode-monster', () => { this.buildMonsterGrid(); this.show('monsters'); });
      tap('btn-classes-back', () => this.show('modes'));
      tap('btn-monsters-back', () => this.show('modes'));
      tap('btn-monster-go', () => this.startMonsterRun(this.selectedMonster));
      tap('btn-hunt', () => (this.pickFor === 'hunt' ? this.startHuntRun(this.selectedClass)
        : this.pickFor === 'weekly' ? this.startRun(this.selectedClass, PH.Weekly.current()) : this.startRun(this.selectedClass)));
      tap('btn-pause', () => this.pause());
      tap('btn-resume', () => this.resume());
      tap('btn-quit', () => this.toMenu());
      tap('btn-daily', () => this.openDaily());
      tap('btn-daily-back', () => this.show('menu'));
      tap('btn-daily-go', () => this.startDaily());
      tap('btn-lodge', () => this.openLodge());
      tap('btn-settings', () => this.openSettings('menu'));
      tap('btn-pause-settings', () => this.openSettings('pause'));
      tap('btn-settings-back', () => this.show(this.settingsFrom || 'menu'));
      tap('btn-share', () => this.shareResult());
      tap('btn-coach-skip', () => { if (this.game.skipTutorial) this.game.skipTutorial(); });
      tap('btn-replay-tutorial', () => { store.set('tutorialDone', false); this.toast('The tutorial will run on your next Survival hunt'); });
      for (const b of document.querySelectorAll('#set-quality button')) tap(b, () => { PH.Settings.set('quality', b.dataset.v); this.applySettings(); this.render.applyQualitySetting(); });
      for (const b of document.querySelectorAll('.set-toggle')) tap(b, () => { PH.Settings.set(b.dataset.k, !PH.Settings.v[b.dataset.k]); this.applySettings(); });
      tap('btn-apex', () => this.startApex());
      tap('tab-daily', () => this.boardTab('daily'));
      tap('tab-apex', () => this.boardTab('apex'));
      $('apex-form').addEventListener('submit', (e) => { e.preventDefault(); this.submitApex(); });
      $('apex-initials').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3); });
      tap('btn-lodge-back', () => this.toMenu());
      for (const b of document.querySelectorAll('.lodge-tabs .lt')) tap(b, () => { this.lodgeTab = b.dataset.tab; this.renderLodge(); });
      $('daily-form').addEventListener('submit', (e) => { e.preventDefault(); this.submitDaily(); });
      $('daily-initials').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3); });
      tap('btn-again', () => {
        const g = this.game;
        if (this.daily) (this.daily.kind === 'weekly' ? this.startRun(g.classId, PH.Weekly.current()) : this.startDaily());
        else if (g.mode === 'monster') this.startMonsterRun(g.monsterType);
        else if (g.mode === 'hunt') this.startHuntRun(g.myClass);
        else this.startRun(g.classId);
      });
      tap('btn-menu', () => this.toMenu());
      tap('btn-mute', () => this.toggleMute());
      tap('btn-pause-mute', () => this.toggleMute());
      tap('btn-music', () => this.toggleMusic());
      tap('btn-pause-music', () => this.toggleMusic());
      tap('btn-haptics', () => this.toggleHaptics());
      tap('btn-pause-haptics', () => this.toggleHaptics());
    }

    buildClassGrid() {
      const grid = $('class-grid');
      grid.innerHTML = '';
      const P = PH.Progress;
      for (const [id, c] of Object.entries(PH.CLASSES)) {
        const w = PH.WEAPONS[P && this.pickFor !== 'weekly' ? P.starter(id) : c.weapon];   // the weekly uses standard weapons
        const hunt = this.pickFor === 'hunt';
        const skin = P && P.equipped('skin', id);
        const card = document.createElement('button');
        card.className = 'class-card' + (id === this.selectedClass ? ' selected' : '');
        card.style.setProperty('--accent', c.color);
        const ab = hunt ? PH.HUNT_MODE.abilities[id] : PH.ABILITIES[c.ability];
        card.innerHTML = hunt
          ? `<div class="ci">${c.icon}</div><div class="cn">${c.name.toUpperCase()}</div><div class="cr">${c.role}${skin ? ' · ' + skin.name : ''}</div>
             <div class="ca">${ab.icon} ${ab.name}</div><div class="cp">${ab.desc}</div>`
          : `<div class="ci">${c.icon}</div><div class="cn">${c.name.toUpperCase()}</div>
          <div class="cr">${c.role}${skin ? ' · ' + skin.name : ''}</div><div class="cw">${w.icon} ${w.name}</div><div class="ca">${ab.icon} ${ab.name}</div><div class="cp">${c.perkText}</div>`;
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
        const look = PH.Progress && PH.Progress.equipped('color', id);
        card.innerHTML = `<div class="ci">${m.icon}</div><div class="cn">${m.name.toUpperCase()}</div>
          <div class="cr">${m.role}${look ? ' · ' + look.name : ''}</div><div class="ca">${m.ability.icon} ${m.ability.name}</div><div class="cp">${m.blurb}</div>`;
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
      $('apex-chip').hidden = true;
      this.coach(null);
      document.body.classList.toggle('mode-monster', game.mode === 'monster');
      document.body.classList.toggle('mode-hunt', game.mode === 'hunt');
      this.releaseStick();
      this.cache = {};
      this.hintsShown = 0;
      this.el.hpbar.style.display = '';   // hunter mode hides it while you are down
    }

    startMonsterRun(type) {
      this.daily = null; $('daily-chip').hidden = true;
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
      this.daily = null; $('daily-chip').hidden = true;
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

    startRun(classId, daily = null) {
      if (!classId) return;
      this.daily = daily;
      $('daily-chip').hidden = !daily;
      if (daily) $('daily-chip').textContent = daily.kind === 'weekly' ? `${PH.MUTATORS[daily.mutator].icon} WEEKLY` : '📅 DAILY';
      this.enterMode(this.survival);
      this.el.dodge.querySelector('.ai').textContent = '💨';
      this.el.dodge.setAttribute('aria-label', 'Dodge roll');
      if (!daily) { store.set('class', classId); this.selectedClass = classId; }
      this.releaseStick();
      this.cache = {};
      // Unlocked starting weapons, except in the daily: everyone starts alike there.
      // A first Survival run teaches the controls, in the meadow.
      const tutorial = !daily && !store.get('tutorialDone', false);
      this.game.newRun(classId, daily ? daily.seed : undefined, daily || !PH.Progress ? null : PH.Progress.starter(classId),
        tutorial ? 'meadow' : null, { tutorial, mutator: daily && daily.mutator });
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

    /* ── Daily challenge ────────────────────────────────────── */

    /** The daily screen: today's hunter, the board, your standing. */
    openDaily(tab = 'daily') {
      this.boardTab(tab);
      const t = PH.Daily.today(), cls = PH.CLASSES[t.classId];
      if (tab === 'daily') $('daily-title').textContent = `DAILY HUNT #${t.number}`;
      const date = new Date(t.day + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
      const hunter = $('daily-hunter');
      hunter.style.setProperty('--accent', cls.color);
      const biome = PH.World.BIOMES[PH.World.fromSeed(t.seed)];
      hunter.innerHTML = `<div class="ci">${cls.icon}</div><div><div class="cn">${cls.name.toUpperCase()}</div><div class="cr">Today's hunter · ${date}</div>`
        + `<div class="cr">${biome.icon} ${biome.name}${biome.blurb && biome !== PH.World.BIOMES.meadow ? ' · ' + biome.blurb : ''}</div></div>`;
      $('daily-board').innerHTML = '<div class="empty">Loading the board…</div>';
      $('daily-me').textContent = '';
      this.show('daily');
      PH.Daily.board(t.day).then((b) => {
        this.renderBoard($('daily-board'), b, 10);
        const mine = PH.Daily.best(t.day);
        $('daily-me').textContent = b.me ? `Your best today: ${b.me.score.toLocaleString()} · #${b.me.rank} of ${b.total}`
          : mine ? `Your best today: ${mine.score.toLocaleString()}${mine.submitted ? '' : ' (not on the board yet)'}` : '';
      });
    }

    renderBoard(el, b, limit) {
      if (b.offline) { el.innerHTML = '<div class="empty">The leaderboard is offline right now. Your best is still saved on this device.</div>'; return; }
      if (b.error) { el.innerHTML = `<div class="empty">Could not load the board (${b.error}).</div>`; return; }
      if (!b.top || !b.top.length) { el.innerHTML = '<div class="empty">No scores yet today. Be the first.</div>'; return; }
      const meIdx = b.me ? b.me.rank - 1 : -1;
      el.innerHTML = b.top.slice(0, limit).map((r, i) => `<div class="row${i === meIdx ? ' me' : ''}"><span class="rk">${i + 1}</span>`
        + `<span class="nm">${r.name}</span><span class="tm">${PH.CLASSES[r.classId] ? PH.CLASSES[r.classId].icon : ''} ${fmtTime(r.time)}${r.victory ? ' 👑' : ''}</span>`
        + `<span class="sc">${r.score.toLocaleString()}</span></div>`).join('')
        + (b.me && b.me.rank > limit ? `<div class="row me"><span class="rk">${b.me.rank}</span><span class="nm">YOU</span><span class="tm"></span><span class="sc">${b.me.score.toLocaleString()}</span></div>` : '');
    }

    startDaily() {
      const t = PH.Daily.today();
      this.startRun(t.classId, t);
    }

    /** After a daily run: keep the best, offer to put it on the board. */
    showDailyResult(r) {
      const d = this.daily, box = $('over-daily');
      // The same block serves the weekly mutator.
      const C = d.kind === 'weekly' ? PH.Weekly : PH.Daily, id = d.kind === 'weekly' ? d.week : d.day;
      box.hidden = false;
      const prev = C.best(id);
      const improved = !prev || r.score > prev.score;
      if (improved) C.setBest(id, { score: r.score, submitted: false, run: r });
      const best = C.best(id);
      const canSubmit = !best.submitted;
      $('daily-form').hidden = !canSubmit;
      $('daily-initials').value = PH.Daily.initials();
      $('btn-daily-submit').disabled = false;
      const st = $('daily-status');
      st.className = 'daily-status';
      st.textContent = improved ? (prev ? `New daily best: ${r.score.toLocaleString()}` : '') : `Your best today is ${best.score.toLocaleString()}.`;
      $('over-board').innerHTML = '<div class="empty">Loading the board…</div>';
      C.board(id).then((b) => this.renderBoard($('over-board'), b, 5));
    }

    async submitDaily() {
      const d = this.daily;
      if (!d) return;
      const name = $('daily-initials').value.toUpperCase();
      const st = $('daily-status');
      if (!/^[A-Z0-9]{3}$/.test(name)) { st.className = 'daily-status err'; st.textContent = 'Three letters or digits, please.'; return; }
      PH.Daily.setInitials(name);
      const weekly = d.kind === 'weekly', C = weekly ? PH.Weekly : PH.Daily, id = weekly ? d.week : d.day;
      const best = C.best(id), r = best.run;
      $('btn-daily-submit').disabled = true;
      st.className = 'daily-status'; st.textContent = 'Submitting…';
      const res = await C.submit({ ...(weekly ? { week: d.week, mutator: d.mutator } : { day: d.day }), name, classId: r.classId, score: r.score,
        time: Math.round(r.time * 100) / 100, kills: r.kills, level: r.level, bosses: r.bossKills, victory: !!r.victory, bonus: r.bonus || 0 });
      if (res.offline) { st.className = 'daily-status err'; st.textContent = 'The leaderboard is offline. Your best is saved on this device.'; $('btn-daily-submit').disabled = false; return; }
      if (res.error) { st.className = 'daily-status err'; st.textContent = `Not accepted: ${res.error}.`; $('btn-daily-submit').disabled = false; return; }
      C.setBest(id, { submitted: true, name });
      if (!weekly && res.me && res.me.rank <= 10 && PH.Progress) this.noted(PH.Progress.note('dailyTop'));
      $('daily-form').hidden = true;
      st.className = 'daily-status ok';
      st.textContent = res.me ? `You're #${res.me.rank} of ${res.total} ${weekly ? 'this week' : 'today'}!` : 'Submitted.';
      this.renderBoard($('over-board'), res, 5);
      this.sfx('levelup');
    }

    /* ── Rank and unlocks ───────────────────────────────────── */

    /** The menu's rank strip: rank, title, progress, and a flag for new unlocks. */
    refreshRank() {
      const P = PH.Progress;
      if (!P) { $('btn-lodge').hidden = true; return; }
      const r = P.rank();
      $('rank-badge').textContent = r.rank;
      $('rank-title').textContent = `${r.title.toUpperCase()} · RANK ${r.rank}`;
      $('rank-fill').style.width = (r.max ? 100 : Math.round((r.into / Math.max(1, r.need)) * 100)) + '%';
      $('rank-new').hidden = P.unseen().length === 0 && P.unseenAchievements().length === 0;
    }

    /** XP, rank and anything unlocked, on the results screen. */
    showProgress(r, daily = null) {
      const P = PH.Progress, box = $('over-xp');
      if (!P) { box.hidden = true; return; }
      const res = P.record(r, daily);
      box.hidden = false;
      const pct = (k) => (k.max ? 100 : Math.round((k.into / Math.max(1, k.need)) * 100));
      $('xp-gain').innerHTML = `+${res.xp.toLocaleString()} XP` + (res.daily ? ` <small>×${P.DAILY_BONUS} ${res.daily}</small>` : '');
      $('xp-rank').textContent = res.rankUp ? `RANK UP! ${res.after.rank} · ${res.after.title.toUpperCase()}` : `RANK ${res.after.rank} · ${res.after.title.toUpperCase()}`;
      $('xp-rank').classList.toggle('up', res.rankUp);
      const fill = $('xp-fill');
      // Fill from where the bar was to where it is now (from empty after a rank up).
      fill.style.transition = 'none';
      fill.style.width = (res.rankUp ? 0 : pct(res.before)) + '%';
      void fill.offsetWidth;
      fill.style.transition = '';
      setTimeout(() => { fill.style.width = pct(res.after) + '%'; }, 950);
      const list = $('xp-unlocks');
      list.innerHTML = '';
      for (const u of res.unlocks) {
        const chip = document.createElement('button');
        chip.className = 'unlock-chip';
        const what = u.kind === 'skin' ? `${PH.CLASSES[u.for].name} skin` : u.kind === 'color' ? `${PH.MONSTERS[u.for].name} colours` : `${PH.CLASSES[u.for].name} starting weapon`;
        chip.innerHTML = `<span class="ui">${u.icon}</span><span class="ub"><b>UNLOCKED: ${u.name.toUpperCase()}</b><small>${what}</small></span><span class="ue">EQUIP</span>`;
        chip.addEventListener('click', (e) => {
          e.preventDefault();
          if (chip.classList.contains('on')) return;
          this.sfx('click');
          P.equip(u.kind, u.for, u.id);
          chip.classList.add('on');
          chip.querySelector('.ue').textContent = 'EQUIPPED';
        });
        list.appendChild(chip);
      }
      for (const a of res.achievements || []) {
        const chip = document.createElement('div');
        chip.className = 'unlock-chip award';
        chip.innerHTML = `<span class="ui">${a.icon}</span><span class="ub"><b>ACHIEVEMENT: ${a.name.toUpperCase()}</b><small>${a.desc}</small></span>`;
        list.appendChild(chip);
      }
      if (res.rankUp || res.unlocks.length || (res.achievements || []).length) setTimeout(() => this.sfx('levelup'), 1200);
    }

    /** The Lodge's awards tab: every achievement, earned or with how close you are. */
    renderAwards() {
      const P = PH.Progress, p = P.profile, all = P.ACHIEVEMENTS, got = all.filter((a) => p.ach[a.id]).length;
      const fresh = new Set(P.unseenAchievements().map((a) => a.id));
      $('lodge-note').textContent = `${got} of ${all.length} earned`;
      const list = $('lodge-list');
      list.innerHTML = '<div class="ach-grid"></div>';
      const grid = list.firstChild;
      // Earned first (newest first), then the rest in order.
      const order = [...all].sort((a, b) => (p.ach[b.id] || 0) - (p.ach[a.id] || 0));
      for (const a of order) {
        const el = document.createElement('div');
        const has = !!p.ach[a.id];
        el.className = 'ach' + (has ? ' got' : '') + (fresh.has(a.id) ? ' fresh' : '');
        let bar = '';
        if (!has && a.progress) { const [x, n] = a.progress(p); bar = `<span class="lp"><i style="width:${Math.round((x / n) * 100)}%"></i></span><small>${x.toLocaleString()} / ${n.toLocaleString()}</small>`; }
        el.innerHTML = `<span class="ai">${a.icon}</span><span class="ab"><b>${a.name}</b><small>${a.desc}</small>${bar}</span>`;
        grid.appendChild(el);
      }
      P.markAchievementsSeen();
    }

    /** Achievements earned outside a run (a board placing, a share): a toast each. */
    noted(list) { list.forEach((a, i) => setTimeout(() => { this.toast(`${a.icon} Achievement: ${a.name}`); this.sfx('levelup'); }, i * 2800)); }

    /** The tutorial's coach card; `null` hides it. */
    coach(step) {
      const el = $('coach'), desktop = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
      for (const b of [this.el.ability, this.el.dodge]) b.classList.remove('coach-ring');
      if (!step) { el.hidden = true; return; }
      if (step === 'done') {
        el.hidden = true;
        store.set('tutorialDone', true);
        this.toast('Survive the swarm and slay three monsters. Good luck!');
        return;
      }
      const T = {
        move: desktop ? '⌨️ Move with WASD or the arrow keys<small>(or drag anywhere)</small>' : '👆 Drag anywhere on the screen to move',
        kill: '🔫 Your weapon fires on its own<small>Get close to the creatures</small>',
        gems: '💎 Pick up the gems they drop<small>Fill the bar at the top to level up</small>',
        special: desktop ? '⚡ Your special is charged<small>Press Space</small>' : '⚡ Your special is charged<small>Tap the big button</small>',
        dodge: desktop ? '💨 Dodge roll with Shift<small>Nothing can hit you mid-roll</small>' : '💨 Tap the small button to dodge roll<small>Nothing can hit you mid-roll</small>',
      };
      $('coach-text').innerHTML = T[step];
      el.hidden = false;
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      if (step === 'special') this.el.ability.classList.add('coach-ring');
      if (step === 'dodge') this.el.dodge.classList.add('coach-ring');
      this.sfx('click');
    }

    openLodge() {
      this.renderLodge();
      this.show('lodge');
    }

    renderLodge() {
      const P = PH.Progress, p = P.profile, r = P.rank();
      const pct = r.max ? 100 : Math.round((r.into / Math.max(1, r.need)) * 100);
      $('lodge-rank').innerHTML = `<div class="rk-badge big">${r.rank}</div><div class="lr-body"><div class="lr-title">${r.title.toUpperCase()}</div>`
        + `<div class="rk-bar"><i style="width:${pct}%"></i></div>`
        + `<div class="lr-sub">${r.max ? 'Top rank reached' : `${r.into.toLocaleString()} / ${r.need.toLocaleString()} XP to rank ${r.rank + 1}`}</div></div>`;
      const wins = Object.values(p.survivalWins).reduce((a, b) => a + b, 0);
      const mwins = Object.values(p.monsterWins).reduce((a, b) => a + b, 0);
      $('lodge-records').innerHTML = [
        [p.runs, 'HUNTS'], [p.kills.toLocaleString(), 'KILLS'], [p.slain, 'MONSTERS SLAIN'],
        [wins + p.huntWins, 'HUNTER WINS'], [mwins, 'MONSTER WINS'], [p.dailyDays.length, 'DAILY HUNTS'],
      ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
      for (const b of document.querySelectorAll('.lodge-tabs .lt')) b.classList.toggle('active', b.dataset.tab === this.lodgeTab);
      const tab = this.lodgeTab;
      if (tab === 'ach') { this.renderAwards(); P.markSeen(); return; }
      $('lodge-note').textContent = tab === 'skin' ? 'Your look in Survival and Hunter Squad, the Daily Hunt included.'
        : tab === 'color' ? 'Your monster\'s colours in Monster mode.' : 'Your first weapon in Survival. The Daily Hunt always uses the standard one.';
      const groups = tab === 'color' ? Object.keys(PH.MONSTERS) : Object.keys(PH.CLASSES);
      const list = $('lodge-list');
      list.innerHTML = '';
      const unseen = new Set(P.unseen().map((u) => u.id));
      for (const g of groups) {
        const isMon = tab === 'color', def = isMon ? PH.MONSTERS[g] : PH.CLASSES[g];
        const row = document.createElement('div');
        row.className = 'lodge-row';
        row.innerHTML = `<div class="lh">${def.icon} ${def.name.toUpperCase()}</div><div class="lo-grid"></div>`;
        const grid = row.lastChild;
        const options = [{ id: null, name: 'Standard' }, ...P.UNLOCKS.filter((u) => u.kind === tab && u.for === g)];
        const cur = P.equipped(tab, g);
        for (const o of options) {
          const owned = !o.id || P.unlocked(o.id);
          const on = (cur ? cur.id : null) === o.id;
          const tile = document.createElement('button');
          tile.className = 'lodge-tile' + (owned ? '' : ' locked') + (on ? ' on' : '') + (o.id && unseen.has(o.id) ? ' fresh' : '');
          let art;
          if (tab === 'skin') {
            const file = o.model || PH.Models.HUNTERS[g].file;
            art = `<img src="/map-mobile-game/img/lodge/${file.split('/').pop().replace('.glb', '')}.webp" alt="" loading="lazy">`;
          } else if (tab === 'color') {
            art = `<img src="/map-mobile-game/img/lodge/${g}-${o.id ? o.id.split('-').pop() : 'standard'}.webp" alt="" loading="lazy">`;
          } else {
            const w = PH.WEAPONS[o.weapon || def.weapon];
            art = `<span class="lw">${w.icon}</span>`;
          }
          const label = tab === 'starter' ? PH.WEAPONS[o.weapon || def.weapon].name : o.name;
          let foot;
          if (owned) foot = `<span class="lf">${on ? 'EQUIPPED' : 'EQUIP'}</span>`;
          else {
            const [a, b] = o.progress(p);
            foot = `<span class="lq">🔒 ${o.text}</span>` + (b > 1 ? `<span class="lp"><i style="width:${Math.min(100, Math.round((a / b) * 100))}%"></i></span><span class="lpn">${Math.min(a, b).toLocaleString()} / ${b.toLocaleString()}</span>` : '');
          }
          tile.innerHTML = `<span class="la">${art}</span><span class="ln">${label}</span>${foot}`;
          const img = tile.querySelector('img');
          if (img) img.addEventListener('error', () => { img.replaceWith(Object.assign(document.createElement('span'), { className: 'lw', textContent: o.icon || def.icon })); });
          tile.addEventListener('click', () => {
            if (!owned || on) return;
            this.sfx('click');
            P.equip(tab, g, o.id);
            if (tab === 'skin') { this.selectedClass = g; store.set('class', g); }
            if (tab === 'color') { this.selectedMonster = g; store.set('monster', g); }
            this.renderLodge();
          });
          grid.appendChild(tile);
        }
        list.appendChild(row);
      }
      P.markSeen();
    }

    /* ── Weekly mutator ─────────────────────────────────────── */

    /** The mode screen's weekly card says what this week's twist is. */
    refreshWeeklyCard() {
      const w = PH.Weekly.current(), M = PH.MUTATORS[w.mutator];
      $('weekly-icon').textContent = M.icon;
      $('weekly-blurb').textContent = `This week: ${M.name}. ${M.desc}`;
    }

    showWeekly() {
      const w = PH.Weekly.current(), M = PH.MUTATORS[w.mutator];
      const biome = PH.World.BIOMES[M.biome || PH.World.fromSeed(w.seed)];
      const d = Math.floor(w.endsIn / 86400000), h = Math.floor((w.endsIn % 86400000) / 3600000);
      $('daily-title').textContent = `WEEKLY #${w.number}`;
      $('weekly-card').innerHTML = `<div class="ci">${M.icon}</div><div><div class="cn">${M.name.toUpperCase()}</div><div class="cr">${M.desc}</div>`
        + `<div class="cr">${biome.icon} ${biome.name} · ends in ${d ? `${d}d ` : ''}${h}h</div></div>`;
      $('weekly-board').innerHTML = '<div class="empty">Loading the board…</div>';
      $('weekly-me').textContent = '';
      PH.Weekly.board(w.week).then((b) => {
        this.renderBoard($('weekly-board'), b, 10);
        const mine = PH.Weekly.best(w.week);
        $('weekly-me').textContent = b.me ? `Your best this week: ${b.me.score.toLocaleString()} · #${b.me.rank} of ${b.total}`
          : mine ? `Your best this week: ${mine.score.toLocaleString()}${mine.submitted ? '' : ' (not on the board yet)'}` : '';
        if (b.top && !b.top.length && !b.offline && !b.error) $('weekly-board').innerHTML = '<div class="empty">No scores yet this week. Be the first.</div>';
      });
    }

    /* ── Apex Hunt ──────────────────────────────────────────── */

    startApex() {
      if (!this.survival.continueApex()) return;
      $('btn-apex').hidden = true;
      this.hideScreens();
      this.el.hud.hidden = false;
      this.cache = {};
      this.buildLoadout();
    }

    /** The results of an Apex Hunt: waves cleared, the board, a form to join it. */
    apexOver(r) {
      $('over-daily').hidden = true;
      $('btn-apex').hidden = true;
      const w = r.apex.waves;
      const title = $('over-title');
      title.textContent = 'APEX HUNT OVER';
      title.className = 'win';
      $('over-sub').textContent = w ? `You cleared ${w} wave${w === 1 ? '' : 's'} of the Apex Hunt.` : 'The Apex Hunt was too much this time.';
      $('over-stats').innerHTML = [
        [fmtTime(r.time), 'TIME'], [r.level, 'LEVEL'], [r.kills.toLocaleString(), 'KILLS'], [w, 'WAVES CLEARED'],
      ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
      const isBest = !this.best || r.score > this.best.score;
      if (isBest) { this.best = { score: r.score, victory: true, time: r.time }; store.set('best', this.best); }
      $('over-score').innerHTML = `Score ${r.score.toLocaleString()}` + (isBest ? ' <span class="newbest">· NEW BEST</span>' : '');
      // Only the Apex part of the run earns XP now; the win was booked already.
      const a = r.apex;
      this.showProgress({ mode: 'apex', score: r.score - a.score, kills: r.kills - a.kills, bossKills: r.bossKills - a.bosses, waves: w, classId: r.classId });
      const prev = PH.Daily.apexBest();
      const improved = !prev || r.score > prev.score;
      if (improved) PH.Daily.setApexBest({ score: r.score, waves: w, submitted: false, run: r });
      const best = PH.Daily.apexBest();
      $('over-apex').hidden = false;
      $('apex-form').hidden = !!best.submitted;
      $('apex-initials').value = PH.Daily.initials();
      $('btn-apex-submit').disabled = false;
      const st = $('apex-status');
      st.className = 'daily-status';
      st.textContent = improved ? (prev ? `New Apex best: ${r.score.toLocaleString()}` : '') : `Your Apex best is ${best.score.toLocaleString()} (${best.waves} wave${best.waves === 1 ? '' : 's'}).`;
      $('over-apex-board').innerHTML = '<div class="empty">Loading the board…</div>';
      PH.Daily.apexBoard().then((b) => this.renderApexBoard($('over-apex-board'), b, 5));
      this.sfx('defeat');
      setTimeout(() => this.show('over'), 900);
    }

    async submitApex() {
      const name = $('apex-initials').value.toUpperCase();
      const st = $('apex-status');
      if (!/^[A-Z0-9]{3}$/.test(name)) { st.className = 'daily-status err'; st.textContent = 'Three letters or digits, please.'; return; }
      PH.Daily.setInitials(name);
      const r = PH.Daily.apexBest().run;
      $('btn-apex-submit').disabled = true;
      st.className = 'daily-status'; st.textContent = 'Submitting…';
      const res = await PH.Daily.apexSubmit({ name, classId: r.classId, score: r.score, time: Math.round(r.time * 100) / 100,
        kills: r.kills, level: r.level, bosses: r.bossKills, waves: r.apex.waves, bonus: r.bonus || 0 });
      if (res.offline) { st.className = 'daily-status err'; st.textContent = 'The leaderboard is offline. Your best is saved on this device.'; $('btn-apex-submit').disabled = false; return; }
      if (res.error) { st.className = 'daily-status err'; st.textContent = `Not accepted: ${res.error}.`; $('btn-apex-submit').disabled = false; return; }
      PH.Daily.setApexBest({ submitted: true, name });
      if (PH.Progress) this.noted(PH.Progress.note('apexBoard'));
      $('apex-form').hidden = true;
      st.className = 'daily-status ok';
      st.textContent = res.me ? `You're #${res.me.rank} of ${res.total} all time!` : 'Submitted.';
      this.renderApexBoard($('over-apex-board'), res, 5);
      this.sfx('levelup');
    }

    renderApexBoard(el, b, limit) {
      if (b.offline) { el.innerHTML = '<div class="empty">The leaderboard is offline right now. Your best is still saved on this device.</div>'; return; }
      if (b.error) { el.innerHTML = `<div class="empty">Could not load the board (${b.error}).</div>`; return; }
      if (!b.top || !b.top.length) { el.innerHTML = '<div class="empty">Nobody has made it onto the Apex board yet. Be the first.</div>'; return; }
      const meIdx = b.me ? b.me.rank - 1 : -1;
      el.innerHTML = b.top.slice(0, limit).map((r, i) => `<div class="row${i === meIdx ? ' me' : ''}"><span class="rk">${i + 1}</span>`
        + `<span class="nm">${r.name}</span><span class="tm">${PH.CLASSES[r.classId] ? PH.CLASSES[r.classId].icon : ''} ⚔️ ${r.waves}</span>`
        + `<span class="sc">${r.score.toLocaleString()}</span></div>`).join('')
        + (b.me && b.me.rank > limit ? `<div class="row me"><span class="rk">${b.me.rank}</span><span class="nm">YOU</span><span class="tm">⚔️ ${b.me.waves}</span><span class="sc">${b.me.score.toLocaleString()}</span></div>` : '');
    }

    /** The leaderboard screen's two tabs: today's daily, and the all-time Apex board. */
    boardTab(which) {
      for (const t of ['daily', 'weekly', 'apex']) { $('tab-' + t).classList.toggle('active', which === t); }
      $('daily-today').hidden = which !== 'daily';
      $('daily-weekly').hidden = which !== 'weekly';
      $('daily-apex').hidden = which !== 'apex';
      if (which === 'weekly') return this.showWeekly();
      if (which === 'daily') { const t = PH.Daily.today(); $('daily-title').textContent = `DAILY HUNT #${t.number}`; }
      if (which !== 'apex') return;
      $('daily-title').textContent = 'APEX HUNT';
      $('apex-board').innerHTML = '<div class="empty">Loading the board…</div>';
      const mine = PH.Daily.apexBest();
      $('apex-me').textContent = '';
      PH.Daily.apexBoard().then((b) => {
        this.renderApexBoard($('apex-board'), b, 10);
        const waves = (n) => `${n} wave${n === 1 ? '' : 's'}`;
        $('apex-me').textContent = b.me ? `Your best: ${b.me.score.toLocaleString()} · ${waves(b.me.waves)} · #${b.me.rank} of ${b.total}`
          : mine ? `Your best: ${mine.score.toLocaleString()} · ${waves(mine.waves)}${mine.submitted ? '' : ' (not on the board yet)'}` : 'Win a Survival run to enter the Apex Hunt.';
      });
    }

    /* ── Settings ───────────────────────────────────────────── */

    openSettings(from) {
      this.settingsFrom = from;
      this.applySettings();
      this.show('settings');
    }

    applySettings() {
      const v = PH.Settings.v;
      for (const b of document.querySelectorAll('#set-quality button')) { b.classList.toggle('on', b.dataset.v === v.quality); b.setAttribute('aria-checked', b.dataset.v === v.quality); }
      for (const b of document.querySelectorAll('.set-toggle')) { b.classList.toggle('on', !!v[b.dataset.k]); b.setAttribute('aria-checked', !!v[b.dataset.k]); }
      document.body.classList.toggle('big-hud', !!v.bigHud);
    }

    /** A monster's arrival: its name, and what it does (or its Apex mutation). */
    bossCard(b, wave) {
      const el = $('boss-card'), A = b.affix && PH.APEX ? PH.APEX.affixes[b.affix] : null, ab = PH.MONSTERS[b.type] && PH.MONSTERS[b.type].ability;
      el.querySelector('.bc-name').textContent = `THE ${b.name.toUpperCase()}`;
      el.querySelector('.bc-sub').textContent = A ? `${A.icon} ${A.name.toUpperCase()} · APEX WAVE ${wave}` : `STAGE ${b.stage}${ab ? ` · ${ab.icon} ${ab.name.toUpperCase()}` : ''}`;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    }

    /* ── Share card ─────────────────────────────────────────── */

    /** Draw the result as an image and hand it to the phone's share sheet (or save it). */
    async shareResult() {
      const r = this.lastResult;
      if (!r) return;
      const btn = $('btn-share');
      btn.disabled = true;
      try {
        const { blob, text } = await this.shareCard(r);
        const url = location.origin + location.pathname;
        const file = new File([blob], 'primal-hunt.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Primal Hunt', text: `${text} ${url}` });
          if (PH.Progress) this.noted(PH.Progress.note('shared'));
        } else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = 'primal-hunt.png';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          try { await navigator.clipboard.writeText(`${text} ${url}`); this.toast('Image saved, and the message copied'); } catch { this.toast('Image saved'); }
          if (PH.Progress) this.noted(PH.Progress.note('shared'));
        }
      } catch (e) {
        if (!(e && e.name === 'AbortError')) this.toast('Could not share that');
      } finally { btn.disabled = false; }
    }

    async shareCard(r) {
      const W = 1080, H = 1350, c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#1b2038'); bg.addColorStop(1, '#090b14');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // The last moment of the run, behind the top of the card.
      const shot = this.render.snapshot();
      if (shot) {
        const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = shot; });
        if (img) {
          const k = Math.max(W / img.width, 760 / img.height), w = img.width * k, h = img.height * k;
          g.drawImage(img, (W - w) / 2, (760 - h) / 2, w, h);
          const fade = g.createLinearGradient(0, 380, 0, 780);
          fade.addColorStop(0, 'rgba(9,11,20,0)'); fade.addColorStop(1, 'rgba(14,16,30,1)');
          g.fillStyle = fade; g.fillRect(0, 380, W, 400);
        }
      }
      const font = (px, w = 900) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      g.textBaseline = 'alphabetic';
      // Header
      const title = g.createLinearGradient(0, 40, 0, 120);
      title.addColorStop(0, '#ffd27a'); title.addColorStop(1, '#ff6b35');
      g.fillStyle = title; g.font = font(64); g.textAlign = 'left';
      g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 18;
      g.fillText('PRIMAL HUNT', 60, 110);
      g.shadowBlur = 0;
      // What happened
      const T = this.game, biome = PH.World && T.biomeId ? PH.World.BIOMES[T.biomeId] : null;
      const who = r.mode === 'monster' ? `${PH.MONSTERS[r.monsterType].icon} ${PH.MONSTERS[r.monsterType].name}`
        : r.mode === 'hunt' ? `${PH.CLASSES[r.cls].icon} ${PH.CLASSES[r.cls].name}` : `${PH.CLASSES[r.classId].icon} ${PH.CLASSES[r.classId].name}`;
      const wk = this.daily && this.daily.kind === 'weekly' ? PH.MUTATORS[this.daily.mutator] : null;
      const mode = r.mode === 'monster' ? 'Monster' : r.mode === 'hunt' ? 'Hunter Squad' : r.apex ? 'Apex Hunt'
        : wk ? `Weekly: ${wk.name}` : this.daily ? `Daily Hunt #${this.daily.number}` : 'Survival';
      const head = $('over-title').textContent, win = $('over-title').classList.contains('win');
      g.textAlign = 'center';
      g.fillStyle = win ? '#ffd700' : '#ff5a6a'; g.font = font(110);
      g.shadowColor = win ? 'rgba(255,215,0,0.45)' : 'rgba(255,70,90,0.4)'; g.shadowBlur = 30;
      g.fillText(head, W / 2, 860);
      g.shadowBlur = 0;
      g.fillStyle = '#c8cde0'; g.font = font(40, 700);
      g.fillText([mode, who, biome ? `${biome.icon} ${biome.name}` : null].filter(Boolean).join('  ·  '), W / 2, 930);
      g.fillStyle = '#ffffff'; g.font = font(92);
      g.fillText(`${r.score.toLocaleString()}`, W / 2, 1050);
      g.fillStyle = '#9aa0b8'; g.font = font(30, 700);
      g.fillText('SCORE', W / 2, 1092);
      // The four stats from the results screen
      const stats = [...document.querySelectorAll('#over-stats .stat')].map((el) => [el.querySelector('b').textContent, el.querySelector('span').textContent]);
      const bw = 225, gap = 20, x0 = (W - (bw * 4 + gap * 3)) / 2;
      stats.slice(0, 4).forEach(([v, l], i) => {
        const x = x0 + i * (bw + gap);
        g.fillStyle = 'rgba(255,255,255,0.07)'; g.beginPath(); g.roundRect ? g.roundRect(x, 1130, bw, 120, 18) : g.rect(x, 1130, bw, 120); g.fill();
        g.fillStyle = '#ffffff'; g.font = font(48); g.fillText(v, x + bw / 2, 1195);
        g.fillStyle = '#9aa0b8'; g.font = font(22, 700); g.fillText(l, x + bw / 2, 1232);
      });
      g.fillStyle = '#4ecdc4'; g.font = font(30, 700);
      g.fillText(location.host + location.pathname.replace(/\/$/, ''), W / 2, 1310);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      const text = r.apex ? `I cleared ${r.apex.waves} Apex Hunt waves in Primal Hunt - ${r.score.toLocaleString()} points. Can you go deeper?`
        : wk ? `This week's Primal Hunt mutator is ${wk.name} - I scored ${r.score.toLocaleString()}. Beat it?`
        : this.daily ? `Daily Hunt #${this.daily.number}: ${r.score.toLocaleString()} in Primal Hunt. Beat it?`
          : `${head} in Primal Hunt (${mode}, ${who.replace(/^\S+ /, '')}) - ${r.score.toLocaleString()} points. Can you beat it?`;
      return { blob, text };
    }

    toMenu() {
      this.daily = null;
      $('daily-chip').hidden = true;
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
          + `<div class="lo">💀<i>${g.huntersKilled}</i></div><div class="lo">🍖<i>${g.eaten}</i></div>`
          + [...g.muts].map((id) => `<div class="lo evo" title="${PH.MUTATIONS[id].name}">${PH.MUTATIONS[id].icon}</div>`).join('');
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

    toggleHaptics() {
      this.haptics = !this.haptics;
      store.set('haptics', this.haptics);
      this.applyHaptics();
      if (this.haptics) this.haptic(30);
    }

    applyHaptics() {
      const label = this.haptics ? '📳 Vibration on' : '📴 Vibration off';
      for (const id of ['btn-haptics', 'btn-pause-haptics']) {
        const b = $(id);
        if (!b) continue;
        b.textContent = label;
        b.hidden = !this.canVibrate;
      }
    }

    /**
     * A buzz, in ms or a [on, off, on...] pattern. A weaker buzz never cuts
     * off a stronger one still playing, so a slam is not swallowed by a hit.
     */
    haptic(pattern) {
      if (!this.haptics || !this.canVibrate) return;
      const len = Array.isArray(pattern) ? pattern.reduce((a, b) => a + b, 0) : pattern;
      const now = performance.now();
      if (now < this.hapticUntil && len <= this.hapticLen) return;
      try { navigator.vibrate(pattern); } catch { /* not allowed yet (no tap so far) */ }
      this.hapticUntil = now + len + 40;
      this.hapticLen = len;
    }

    toggleMusic() {
      this.musicOn = !this.musicOn;
      store.set('music', this.musicOn);
      this.applyMute();
    }

    /** Sound off silences everything; Music off just the score. */
    applyMute() {
      if (window.Sfx) window.Sfx.setMuted(this.muted);
      if (PH.Music) PH.Music.setEnabled(!this.muted && this.musicOn);
      const label = this.muted ? '🔇 Sound off' : '🔊 Sound on';
      $('btn-mute').textContent = label;
      $('btn-pause-mute').textContent = label;
      const ml = this.musicOn ? '🎵 Music on' : '🎵 Music off';
      $('btn-music').textContent = ml;
      $('btn-pause-music').textContent = ml;
      $('btn-music').classList.toggle('off', !this.musicOn || this.muted);
    }

    refreshBest() {
      const b = this.best, m = this.bestMonster;
      const parts = [];
      if (b) parts.push(`Survival best ${b.score.toLocaleString()}${b.victory ? ' 👑' : ''}`);
      if (this.bestHunt) parts.push(`Squad best ${this.bestHunt.score.toLocaleString()}${this.bestHunt.victory ? ' 👑' : ''}`);
      if (m) parts.push(`Monster best ${m.score.toLocaleString()}${m.victory ? ' 👑' : ''}`);
      const ab = PH.Daily && PH.Daily.apexBest();
      if (ab) parts.push(`Apex best ${ab.waves} wave${ab.waves === 1 ? '' : 's'}`);
      $('best-line').textContent = parts.join('  ·  ');
      this.refreshRank();
      if (PH.Daily) {
        const t = PH.Daily.today(), mine = PH.Daily.best(t.day);
        const biome = PH.World.BIOMES[PH.World.fromSeed(t.seed)];
        $('daily-tag').textContent = `#${t.number} · ${PH.CLASSES[t.classId].name} · ${biome.icon} ${biome.name}` + (mine ? ` · your best ${mine.score.toLocaleString()}` : ' · new today');
      }
    }

    sfx(name) {
      if (window.Sfx && !this.muted) window.Sfx.play(name);
      const h = HAPTICS[name];
      if (h) this.haptic(h);
    }

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
        onEnd: (r) => { this.lastResult = r; return r.mode === 'monster' ? this.monsterOver(r) : r.mode === 'hunt' ? this.huntOver(r) : this.gameOver(r); },
        onBossIntro: (b, wave) => this.bossCard(b, wave),
        onTutorial: (step) => this.coach(step),
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
      $('over-daily').hidden = true; $('over-apex').hidden = true; $('btn-apex').hidden = true;
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
      this.showProgress(r);
      this.sfx(r.victory ? 'victory' : 'defeat');
      setTimeout(() => this.show('over'), r.victory ? 700 : 900);
    }

    monsterOver(r) {
      this.releaseStick();
      $('over-daily').hidden = true; $('over-apex').hidden = true; $('btn-apex').hidden = true;
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
      this.showProgress(r);
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
      const chest = kind === 'chest', mutation = kind === 'mutation';
      if (this.game.tutorial && !$('coach').hidden) $('coach-text').innerHTML = '⬆️ Level up!<small>Pick an upgrade - your build grows every level</small>';
      $('choice-title').textContent = mutation ? '🧬 MUTATION' : chest ? '🎁 SUPPLY DROP' : `LEVEL ${this.game.level}`;
      $('choice-sub').textContent = mutation ? `Stage ${this.game.stage}: choose how you evolve` : chest ? 'A free upgrade - choose one' : 'Choose an upgrade';
      const wrap = $('choice-cards');
      wrap.innerHTML = '';
      // Ignore taps for a moment: you are usually mid-swipe when a level lands,
      // and the finger that was steering should not pick a card unread.
      const armedAt = performance.now() + 450;
      for (const c of choices) {
        const card = document.createElement('button');
        card.className = 'card' + (chest ? ' chest' : '');
        let icon, name, desc, tag;
        if (c.type === 'mutation') {
          const m = PH.MUTATIONS[c.id];
          icon = m.icon; name = m.name; desc = m.desc;
          tag = c.signature ? '<span class="kt evo">SIGNATURE</span>' : '<span class="kt mut">MUTATION</span>';
          card.classList.add(c.signature ? 'evo' : 'mut');
        } else if (c.type === 'evolve') {
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
      this.coach(null);
      if (r.apex) return this.apexOver(r);
      $('over-apex').hidden = true;
      // A win (outside the daily) can carry on into the Apex Hunt.
      $('btn-apex').hidden = !(r.victory && !this.daily);
      const title = $('over-title');
      title.textContent = r.victory ? 'VICTORY' : 'YOU FELL';
      title.className = r.victory ? 'win' : 'lose';
      $('over-sub').textContent = r.victory
        ? (r.bossKills >= 3 ? `All ${r.mutator === 'twins' ? 'six' : 'three'} monsters slain. The hunt is over${this.daily ? '.' : ' - unless you keep going.'}` : 'The final monster is slain. The hunt is over.')
        : r.bossKills ? `${r.bossKills} of ${r.mutator === 'twins' ? 6 : 3} monsters slain.` : 'The swarm got you.';
      $('over-stats').innerHTML = [
        [fmtTime(r.time), 'TIME'], [r.level, 'LEVEL'], [r.kills.toLocaleString(), 'KILLS'], [`${r.bossKills}/${r.mutator === 'twins' ? 6 : 3}`, 'MONSTERS'],
      ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
      const isBest = !this.best || r.score > this.best.score;
      if (isBest) { this.best = { score: r.score, victory: r.victory, time: r.time }; store.set('best', this.best); }
      $('over-score').innerHTML = `Score ${r.score.toLocaleString()}` + (isBest ? ' <span class="newbest">· NEW BEST</span>' : '');
      if (this.daily) this.showDailyResult(r);
      else $('over-daily').hidden = true;
      this.showProgress(r, this.daily);
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
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;   // typing initials
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
      // Night Hunt: you only see what is close.
      this.set('veil', !!g.forceNight, (v) => { $('night-veil').hidden = !v; });
      if (g.forceNight) {
        const q = this.render.project(pl.x, 0.5, pl.z, this.tmp);
        $('night-veil').style.setProperty('--vx', `${Math.round(q.x)}px`); $('night-veil').style.setProperty('--vy', `${Math.round(q.y)}px`);
      }
      this.set('apex', g.apex ? g.apex.wave : -1, (v) => { const c = $('apex-chip'); c.hidden = v < 0; c.textContent = v > 0 ? `⚔️ WAVE ${v}` : '⚔️ APEX'; });
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
