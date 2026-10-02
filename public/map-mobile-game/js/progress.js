/**
 * Primal Hunt - Hunter Rank and unlocks.
 *
 * Every run, in any mode, turns its score into XP (a quarter of it, half as
 * much again for the Daily Hunt). XP builds a Hunter Rank, and the profile
 * keeps lifetime records alongside it. Ranks and records unlock things to
 * equip in the Hunter's Lodge:
 *   - hunter skins: other Kenney Mini Characters, two per class
 *   - monster colourways: two per monster, earned playing that monster
 *   - alternate starting weapons for Survival, one per class
 * None of them changes the balance except the starting weapons, and the
 * Daily Hunt always uses the standard ones so everyone starts alike.
 *
 * Everything lives on this device, in localStorage ('ph.profile').
 */
window.PH = window.PH || {};

(() => {
  const KEY = 'ph.profile';
  const MAX_RANK = 30;
  const TITLES = [[1, 'Rookie'], [3, 'Tracker'], [5, 'Hunter'], [8, 'Veteran'], [12, 'Elite'], [16, 'Master'], [20, 'Apex'], [25, 'Legend']];
  const DAILY_BONUS = 1.5;

  /** Total XP needed to reach a rank. */
  const xpFor = (r) => Math.round(300 * Math.pow(Math.max(0, r - 1), 1.5));
  const titleOf = (r) => { let t = TITLES[0][1]; for (const [n, name] of TITLES) if (r >= n) t = name; return t; };

  const fresh = () => ({
    v: 1, xp: 0, runs: 0, kills: 0, slain: 0, huntersKilled: 0,
    survivalWins: {}, monsterWins: {}, apexWins: {}, huntWins: 0, dailyDays: [],
    unlocked: {}, seen: {}, equip: { skin: {}, color: {}, starter: {} },
    ach: {}, achSeen: {}, survivalBiomes: {}, huntClasses: {}, apexBest: 0, dailyTop: false, apexBoard: false, shared: 0,
  });

  let profile = null;
  const load = () => {
    if (profile) return profile;
    try { profile = JSON.parse(localStorage.getItem(KEY)); } catch { profile = null; }
    const base = fresh();
    if (!profile || typeof profile !== 'object') profile = base;
    // Fill in anything a newer version added.
    for (const k in base) if (profile[k] === undefined) profile[k] = base[k];
    for (const k in base.equip) if (!profile.equip[k]) profile.equip[k] = {};
    return profile;
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* private mode */ } };

  const rankOf = (xp) => {
    let r = 1;
    while (r < MAX_RANK && xp >= xpFor(r + 1)) r++;
    const lo = xpFor(r), hi = r < MAX_RANK ? xpFor(r + 1) : lo;
    return { rank: r, title: titleOf(r), into: xp - lo, need: hi - lo, max: r >= MAX_RANK };
  };

  const count = (o) => Object.keys(o).length;
  const rankReq = (n) => ({ text: `Reach Hunter Rank ${n}`, progress: (p) => [rankOf(p.xp).rank, n] });

  /* ── What can be unlocked ───────────────────────────────────── */

  const C = 'kenney/characters/character-';
  const SKINS = [
    { id: 'skin-assault-agent',     for: 'assault', name: 'Agent',     model: C + 'male-d.glb',   icon: '🕶️', text: 'Get 1,000 kills in Survival', progress: (p) => [p.kills, 1000] },
    { id: 'skin-assault-ranger',    for: 'assault', name: 'Ranger',    model: C + 'female-c.glb', icon: '🎖️', ...rankReq(6) },
    { id: 'skin-trapper-scout',     for: 'trapper', name: 'Scout',     model: C + 'male-f.glb',   icon: '🧭', text: 'Slay 5 monsters', progress: (p) => [p.slain, 5] },
    { id: 'skin-trapper-tracker',   for: 'trapper', name: 'Tracker',   model: C + 'female-b.glb', icon: '🐾', text: 'Win a Hunter Squad hunt', progress: (p) => [p.huntWins, 1] },
    { id: 'skin-medic-fielddoc',    for: 'medic',   name: 'Field Doc', model: C + 'male-e.glb',   icon: '🩺', ...rankReq(3) },
    { id: 'skin-medic-botanist',    for: 'medic',   name: 'Botanist',  model: C + 'male-a.glb',   icon: '🌿', text: 'Play the Daily Hunt on 3 days', progress: (p) => [p.dailyDays.length, 3] },
    { id: 'skin-support-engineer',  for: 'support', name: 'Engineer',  model: C + 'female-f.glb', icon: '🔧', ...rankReq(4) },
    { id: 'skin-support-operative', for: 'support', name: 'Operative', model: C + 'female-d.glb', icon: '📡', text: 'Win a Survival run', progress: (p) => [count(p.survivalWins) ? 1 : 0, 1] },
    { id: 'skin-ranger-stalker',    for: 'ranger',  name: 'Stalker',   model: C + 'male-f.glb',   icon: '🦉', portrait: 'ranger-stalker', ...rankReq(8) },
    { id: 'skin-ranger-warden',     for: 'ranger',  name: 'Warden',    model: C + 'female-b.glb', icon: '🌲', portrait: 'ranger-warden', text: 'Slay 15 monsters', progress: (p) => [p.slain, 15] },
  ].map((u) => ({ ...u, kind: 'skin' }));

  // Colourways for the custom monsters: a body tint (luminance kept, so the
  // dark and light parts stay dark and light), the glow colour in linear RGB,
  // and the emissive colour that builds up as it evolves.
  const COLORS = [
    { id: 'color-behemoth-frost',    for: 'behemoth', name: 'Frost',       swatch: ['#6f8fa8', '#33bbff'], variant: { tint: { color: 0x7fa6c4, amount: 0.75 }, glow: [0.2, 0.75, 1.0], emissive: 0x33aaff } },
    { id: 'color-behemoth-obsidian', for: 'behemoth', name: 'Obsidian',    swatch: ['#1e1b24', '#ff2233'], variant: { tint: { color: 0x26252b, amount: 0.9, lum: 0.4 }, glow: [1.0, 0.06, 0.12], emissive: 0xff1133 } },
    { id: 'color-wraith-ember',      for: 'wraith',   name: 'Ember',       swatch: ['#5a2a1a', '#ff7a1a'], variant: { tint: { color: 0x7a3a22, amount: 0.8 }, glow: [1.0, 0.4, 0.05], emissive: 0xff6611 } },
    { id: 'color-wraith-spectral',   for: 'wraith',   name: 'Spectral',    swatch: ['#bfd6dd', '#33ffc0'], variant: { tint: { color: 0xa9d2d6, amount: 0.8, lum: 2.8 }, glow: [0.2, 1.0, 0.7], emissive: 0x33ffbb } },
    { id: 'color-kraken-abyssal',    for: 'kraken',   name: 'Abyssal',     swatch: ['#1d4a4a', '#22ffb0'], variant: { tint: { color: 0x1f5c5a, amount: 0.8 }, glow: [0.1, 1.0, 0.65], arc: [0.6, 1.0, 0.85], emissive: 0x22ffaa } },
    { id: 'color-kraken-crimson',    for: 'kraken',   name: 'Crimson Tide', swatch: ['#5a1a2a', '#ff3355'], variant: { tint: { color: 0x6e1f33, amount: 0.8 }, glow: [1.0, 0.12, 0.25], arc: [1.0, 0.75, 0.4], emissive: 0xff2244 } },
    { id: 'color-goliath-storm',     for: 'goliath',  name: 'Storm',       swatch: ['#3e4152', '#a066ff'], variant: { tint: { color: 0x4a4d66, amount: 0.75 }, glow: [0.6, 0.35, 1.0], emissive: 0x9955ff } },
    { id: 'color-goliath-venom',     for: 'goliath',  name: 'Venom',       swatch: ['#2f3d22', '#9dff1a'], variant: { tint: { color: 0x3d5229, amount: 0.8 }, glow: [0.55, 1.0, 0.08], emissive: 0x88ff11 } },
    { id: 'color-wyvern-glacial',    for: 'wyvern',   name: 'Glacial',     swatch: ['#9fb8d0', '#44ccff'], variant: { tint: { color: 0x8fb0cc, amount: 0.75 }, glow: [0.3, 0.85, 1.0], emissive: 0x44ccff } },
    { id: 'color-wyvern-void',       for: 'wyvern',   name: 'Void',        swatch: ['#1a1424', '#9933ff'], variant: { tint: { color: 0x241c30, amount: 0.85, lum: 0.5 }, glow: [0.7, 0.2, 1.0], emissive: 0x9933ff } },
  ].map((u, i) => {
    const name = () => (PH.MONSTERS && PH.MONSTERS[u.for] ? PH.MONSTERS[u.for].name : u.for);
    const apex = i % 2 === 1;
    return {
      ...u, kind: 'color', icon: '🎨',
      get text() { return apex ? `Wipe out the squad as the ${name()}` : `Win Monster mode as the ${name()}`; },
      progress: (p) => [(apex ? p.apexWins : p.monsterWins)[u.for] ? 1 : 0, 1],
    };
  });

  const STARTERS = [
    { id: 'starter-assault', for: 'assault', weapon: 'shotgun' },
    { id: 'starter-trapper', for: 'trapper', weapon: 'harpoon' },
    { id: 'starter-medic',   for: 'medic',   weapon: 'arc' },
    { id: 'starter-support', for: 'support', weapon: 'grenade' },
    { id: 'starter-ranger',  for: 'ranger',  weapon: 'harpoon' },
  ].map((u) => {
    const cls = () => (PH.CLASSES && PH.CLASSES[u.for] ? PH.CLASSES[u.for].name : u.for);
    return {
      ...u, kind: 'starter',
      get name() { return PH.WEAPONS ? PH.WEAPONS[u.weapon].name : u.weapon; },
      get icon() { return PH.WEAPONS ? PH.WEAPONS[u.weapon].icon : '🔫'; },
      get text() { return `Win a Survival run as the ${cls()}`; },
      progress: (p) => [p.survivalWins[u.for] ? 1 : 0, 1],
    };
  });

  const UNLOCKS = [...SKINS, ...COLORS, ...STARTERS];
  const byId = Object.fromEntries(UNLOCKS.map((u) => [u.id, u]));
  const done = (u, p) => { const [a, b] = u.progress(p); return a >= b; };

  /* ── Achievements ─────────────────────────────────────────── */

  // `test(p, r)` sees the profile and, for the run just finished, its result
  // (r.mode: undefined for Survival, 'apex', 'monster' or 'hunt'). Ones with
  // `progress` show how close you are.
  const surv = (r) => !!r && !r.mode;
  const winS = (r) => surv(r) && r.victory;
  const prog = (f, n) => (p) => [Math.min(n, f(p)), n];
  const ACHIEVEMENTS = [
    ['first_win', '🏆', 'First Blood', 'Win a Survival run.', (p) => count(p.survivalWins) > 0],
    ['all_classes', '🎖️', 'Jack of All Trades', 'Win Survival with every class.', null, prog((p) => count(p.survivalWins), Object.keys(PH.CLASSES).length)],
    ['biomes', '🗺️', 'World Traveller', 'Win Survival in every biome.', null, prog((p) => count(p.survivalBiomes), 5)],
    ['volcano', '🌋', 'Trial by Fire', 'Win Survival in the Volcanic Wastes.', (p) => !!p.survivalBiomes.volcanic],
    ['untouchable', '🕊️', 'Untouchable', 'Win a Survival run without dodging once.', (p, r) => winS(r) && r.dodges === 0],
    ['iron', '🛡️', 'Iron Hide', 'Win a Survival run taking less than 150 damage.', (p, r) => winS(r) && r.damageTaken < 150],
    ['swift', '⏱️', 'Swift Hunt', 'Win a Survival run in under 4:30.', (p, r) => winS(r) && r.time < 270],
    ['evolve', '✨', 'Evolution', 'Evolve a weapon.', (p, r) => surv(r) && r.evolved >= 1],
    ['twin_evo', '🌟', 'Double Evolution', 'Evolve two weapons in one run.', (p, r) => surv(r) && r.evolved >= 2],
    ['reaper', '💀', 'Reaper', 'Get 1,000 kills in one Survival run.', (p, r) => surv(r) && r.kills >= 1000],
    ['exterminator', '☠️', 'Exterminator', 'Get 10,000 kills in all.', null, prog((p) => p.kills, 10000)],
    ['slayer', '🗡️', 'Monster Slayer', 'Slay 25 monsters.', null, prog((p) => p.slain, 25)],
    ['apex1', '⚔️', 'Into the Apex', 'Clear a wave of the Apex Hunt.', null, prog((p) => p.apexBest, 1)],
    ['apex5', '🔥', 'Apex Hunter', 'Clear 5 waves of the Apex Hunt in one run.', null, prog((p) => p.apexBest, 5)],
    ['apex10', '👑', 'Apex Legend', 'Clear 10 waves of the Apex Hunt in one run.', null, prog((p) => p.apexBest, 10)],
    ['daily7', '📅', 'Regular', 'Play the Daily Hunt on 7 days.', null, prog((p) => p.dailyDays.length, 7)],
    ['daily_top', '🥇', 'Top Ten', 'Make the top 10 of a Daily Hunt board.', (p) => p.dailyTop],
    ['apex_board', '🏅', 'On the Board', 'Put an Apex Hunt on the all-time board.', (p) => p.apexBoard],
    ['weekly_win', '🧪', 'Mutant Hunter', 'Win a Weekly Mutator hunt.', (p, r) => winS(r) && !!r.mutator],
    ['weekly4', '🔬', 'Lab Rat', 'Play four different weekly mutators.', null, prog((p) => count(p.mutatorsPlayed || {}), 4)],
    ['monster_win', '👹', 'It Got Away', 'Win Monster mode.', (p) => count(p.monsterWins) > 0],
    ['apex_pred', '🦖', 'Apex Predator', 'Wipe out the whole squad in Monster mode.', (p) => count(p.apexWins) > 0],
    ['all_apex', '🐉', 'Every Shape of Fear', 'Wipe out the squad with every monster.', null, prog((p) => count(p.apexWins), Object.keys(PH.MONSTERS).length)],
    ['mutant', '🧬', 'Fully Mutated', 'Reach stage 3 with two mutations.', (p, r) => !!r && r.mode === 'monster' && r.mutations >= 2],
    ['feast', '🍖', 'Feast', 'Eat 50 prey in one Monster run.', (p, r) => !!r && r.mode === 'monster' && r.eaten >= 50],
    ['squad_win', '🎯', 'Squad Goals', 'Win a Hunter Squad hunt.', (p) => p.huntWins > 0],
    ['squad_clean', '💪', 'No One Left Behind', 'Win Hunter Squad without going down.', (p, r) => !!r && r.mode === 'hunt' && r.victory && r.downs === 0],
    ['squad_early', '🪤', 'Nipped in the Bud', 'Kill the monster in Hunter Squad before it evolves.', (p, r) => !!r && r.mode === 'hunt' && r.victory && r.stage === 1],
    ['squad_all', '🤝', 'Every Role', 'Win Hunter Squad with every class.', null, prog((p) => count(p.huntClasses), Object.keys(PH.CLASSES).length)],
    ['rank10', '⭐', 'Veteran', 'Reach Hunter Rank 10.', null, prog((p) => rankOf(p.xp).rank, 10)],
    ['rank20', '🌠', 'Legend in the Making', 'Reach Hunter Rank 20.', null, prog((p) => rankOf(p.xp).rank, 20)],
    ['collector', '🎨', 'Collector', 'Unlock 10 things in the Lodge.', null, prog((p) => count(p.unlocked), 10)],
    ['complete', '🏛️', 'Completionist', 'Unlock everything in the Lodge.', null, prog((p) => count(p.unlocked), UNLOCKS.length)],
    ['sharer', '📤', 'Word of Mouth', 'Share a result.', (p) => p.shared > 0],
  ].map(([id, icon, name, desc, test, progress]) => ({ id, icon, name, desc, test: test || ((p) => { const [a, b] = progress(p); return a >= b; }), progress }));

  /** Award whatever the profile (and the run just finished) now qualifies for; returns the new ones. */
  const award = (p, r = null) => {
    const fresh = [];
    for (const a of ACHIEVEMENTS) if (!p.ach[a.id] && a.test(p, r)) { p.ach[a.id] = Date.now(); fresh.push(a); }
    return fresh;
  };

  /** Unlock whatever the profile now qualifies for; returns the new ones. */
  const check = (p) => {
    const fresh = [];
    for (const u of UNLOCKS) if (!p.unlocked[u.id] && done(u, p)) { p.unlocked[u.id] = Date.now(); fresh.push(u); }
    return fresh;
  };

  const Progress = {
    UNLOCKS, SKINS, COLORS, STARTERS, MAX_RANK, DAILY_BONUS, ACHIEVEMENTS,
    xpFor, rankOf,
    get profile() { return load(); },
    rank() { return rankOf(load().xp); },

    /** XP a result is worth. */
    xpOf(r, daily) { return Math.round(Math.max(10, Math.round((r.score || 0) / 4)) * (daily ? DAILY_BONUS : 1)); },

    /**
     * Book a finished run. `r` is the game's end payload; `daily` the daily
     * challenge it was, if any. Returns what changed, for the results screen.
     */
    record(r, daily = null) {
      const p = load();
      const before = rankOf(p.xp);
      const xp = this.xpOf(r, daily);
      p.xp += xp;
      p.runs++;
      if (r.mode === 'monster') {
        p.huntersKilled += r.huntersKilled || 0;
        if (r.victory) p.monsterWins[r.monsterType] = (p.monsterWins[r.monsterType] || 0) + 1;
        if (r.victory && r.how === 'apex') p.apexWins[r.monsterType] = (p.apexWins[r.monsterType] || 0) + 1;
      } else if (r.mode === 'apex') {
        // The Apex Hunt after a win: its own kills and monsters, and the deepest run.
        p.kills += r.kills || 0;
        p.slain += r.bossKills || 0;
        p.apexBest = Math.max(p.apexBest || 0, r.waves || 0);
      } else if (r.mode === 'hunt') {
        if (r.victory) { p.huntWins++; p.slain++; if (r.cls) p.huntClasses[r.cls] = 1; }
      } else {
        p.kills += r.kills || 0;
        p.slain += r.bossKills || 0;
        if (r.victory) p.survivalWins[r.classId] = (p.survivalWins[r.classId] || 0) + 1;
        if (r.victory && r.biome) p.survivalBiomes[r.biome] = 1;
      }
      if (daily && daily.kind !== 'weekly' && !p.dailyDays.includes(daily.day)) p.dailyDays = [...p.dailyDays, daily.day].slice(-60);
      if (r.mutator) p.mutatorsPlayed = { ...(p.mutatorsPlayed || {}), [r.mutator]: 1 };
      const unlocks = check(p);
      const achievements = award(p, r);
      save();
      const after = rankOf(p.xp);
      return { xp, daily: daily ? daily.kind || 'daily' : false, before, after, rankUp: after.rank > before.rank, unlocks, achievements };
    },

    /** Note something that happens outside a run (a board placing, a share). Returns new achievements. */
    note(key) {
      const p = load();
      if (key === 'shared') p.shared = (p.shared || 0) + 1; else p[key] = true;
      const fresh = award(p);
      save();
      return fresh;
    },
    achieved(id) { return !!load().ach[id]; },
    unseenAchievements() { const p = load(); return ACHIEVEMENTS.filter((a) => p.ach[a.id] && !p.achSeen[a.id]); },
    markAchievementsSeen() { const p = load(); for (const id in p.ach) p.achSeen[id] = 1; save(); },

    unlocked(id) { return !!load().unlocked[id]; },
    /** Unlocks not yet looked at in the Lodge. */
    unseen() { const p = load(); return UNLOCKS.filter((u) => p.unlocked[u.id] && !p.seen[u.id]); },
    markSeen() { const p = load(); for (const id in p.unlocked) p.seen[id] = 1; save(); },
    get(id) { return byId[id]; },

    /** Equip an unlock (or null for the standard one) in its slot. */
    equip(kind, forId, id) {
      const p = load();
      if (id && (!byId[id] || !p.unlocked[id] || byId[id].for !== forId)) return false;
      if (id) p.equip[kind][forId] = id; else delete p.equip[kind][forId];
      save();
      return true;
    },
    equipped(kind, forId) {
      const p = load(), id = p.equip[kind] && p.equip[kind][forId];
      return id && p.unlocked[id] && byId[id] ? byId[id] : null;
    },

    /** The character model file to use for a class (null: the standard one). */
    skinModel(cls) { const u = this.equipped('skin', cls); return u ? u.model : null; },
    /** The colourway for a monster (null: its own colours). */
    colorVariant(type) { const u = this.equipped('color', type); return u ? u.variant : null; },
    /** A class's Survival starting weapon. */
    starter(cls) { const u = this.equipped('starter', cls); return u ? u.weapon : PH.CLASSES[cls].weapon; },

    /** Wipe the profile (for testing from the console). */
    reset() { profile = fresh(); save(); },
  };

  PH.Progress = Progress;
})();
