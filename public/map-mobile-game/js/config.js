/**
 * Primal Hunt - every tunable number in one place.
 *
 * Units: distances are world units (a hunter is about one unit across),
 * times are seconds, rates are per second. Weapon levels are written out in
 * full rather than as deltas, so each level can be read and tuned on its own.
 */
window.PH = window.PH || {};

// Effects3D (reused from the previous engine) expects these two helpers on a
// global Utils. The rest of the old 364-line utils file is no longer needed.
window.Utils = window.Utils || {
  lerp: (a, b, t) => a + (b - a) * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
};

PH.CONFIG = {
  step: 1 / 60,             // fixed simulation step
  viewHalf: 8.5,            // half the shorter screen axis, in world units
  despawnRadius: 34,        // enemies further than this are recycled
  maxEnemies: 320,
  maxEnemiesLow: 200,       // used when the device looks weak
  maxGems: 260,             // beyond this, new XP merges into existing gems
  slots: { weapons: 5, passives: 5 },

  player: {
    hp: 100, speed: 4.4, radius: 0.42, pickup: 1.9,
    iframes: 0.5,           // after a hit; stops a swarm from deleting you in one frame
    regen: 0,
  },

  // XP needed to go from `level` to `level + 1`. Fast early, slower later.
  xpToNext: (level) => Math.round(4 + 4.5 * level + 0.55 * level * level),

  // Enemy health grows with run time so late waves stay a threat.
  hpScale: (t) => 1 + t / 120 + Math.pow(t / 240, 2),

  score: { kill: 1, second: 2, boss: 500, victory: 2000 },
};

/* ── Hunter classes ─────────────────────────────────────────────
   The four classes from the original game. Each now starts with one of the
   auto-firing weapons below and a small passive perk. */
PH.CLASSES = {
  assault: {
    name: 'Assault', icon: '🔫', color: '#ff4757', role: 'Damage dealer',
    weapon: 'rifle', perk: { damage: 0.20 }, perkText: '+20% damage',
  },
  trapper: {
    name: 'Trapper', icon: '🪤', color: '#ffa502', role: 'Area control',
    weapon: 'traps', perk: { area: 0.15 }, perkText: '+15% blast area',
  },
  medic: {
    name: 'Medic', icon: '💉', color: '#2ed573', role: 'Sustain',
    weapon: 'biofield', perk: { maxHp: 30, regen: 0.45 }, perkText: '+30 HP and regeneration',
  },
  support: {
    name: 'Support', icon: '🛡️', color: '#1e90ff', role: 'Utility',
    // Drones have no cooldown, so a cooldown perk did nothing for this class.
    weapon: 'drones', perk: { extra: 1 }, perkText: '+1 projectile on every weapon',
  },
};

/* ── Weapons ────────────────────────────────────────────────────
   Everything fires on its own; the player only steers. Names and icons come
   from the original game's ability list. `kind` selects the behaviour in
   game.js; the per-level objects are that behaviour's parameters. */
PH.WEAPONS = {
  rifle: {
    name: 'Assault Rifle', icon: '🔫', kind: 'bolt',
    blurb: 'Fires at the nearest creature.',
    levels: [
      { dmg: 12, cd: 0.52, count: 1, pierce: 0, speed: 17, desc: 'Fires at the nearest creature.' },
      { dmg: 15, cd: 0.47, count: 1, pierce: 0, speed: 17, desc: '+3 damage, faster fire.' },
      { dmg: 14, cd: 0.48, count: 2, pierce: 0, speed: 17, desc: 'Fires 2 rounds.' },
      { dmg: 17, cd: 0.45, count: 2, pierce: 1, speed: 18, desc: 'Rounds pierce one creature.' },
      { dmg: 22, cd: 0.40, count: 3, pierce: 2, speed: 19, desc: '3 rounds, pierce two.' },
    ],
  },
  shotgun: {
    name: 'Shotgun', icon: '🧨', kind: 'spread',
    blurb: 'A cone of pellets toward the nearest creature.',
    levels: [
      { dmg: 7,  cd: 1.10, pellets: 5, arc: 0.55, speed: 13, range: 6.5, desc: 'A cone of 5 pellets.' },
      { dmg: 9,  cd: 1.00, pellets: 6, arc: 0.60, speed: 13, range: 6.5, desc: '+1 pellet, +2 damage.' },
      { dmg: 9,  cd: 0.85, pellets: 7, arc: 0.70, speed: 14, range: 7.0, desc: 'Wider, faster cone.' },
      { dmg: 12, cd: 0.80, pellets: 8, arc: 0.75, speed: 14, range: 7.5, desc: '+3 damage, +1 pellet.' },
      { dmg: 15, cd: 0.70, pellets: 10, arc: 0.85, speed: 15, range: 8.0, desc: '10 pellets.' },
    ],
  },
  grenade: {
    name: 'Frag Grenade', icon: '💥', kind: 'lob',
    blurb: 'Lobs grenades into the thickest crowd.',
    levels: [
      { dmg: 26, cd: 2.4, count: 1, radius: 2.0, desc: 'Lobs a grenade into the crowd.' },
      { dmg: 32, cd: 2.2, count: 1, radius: 2.3, desc: 'Bigger, harder blasts.' },
      { dmg: 32, cd: 2.0, count: 2, radius: 2.3, desc: 'Throws 2 grenades.' },
      { dmg: 42, cd: 1.8, count: 2, radius: 2.6, desc: '+10 damage, wider blast.' },
      { dmg: 52, cd: 1.6, count: 3, radius: 2.9, desc: '3 grenades.' },
    ],
  },
  traps: {
    name: 'Bear Trap', icon: '🪤', kind: 'mine',
    blurb: 'Drops traps that snap shut on anything that steps near.',
    levels: [
      { dmg: 42, cd: 1.2, radius: 2.3, max: 5, desc: 'Drops a trap behind you.' },
      { dmg: 52, cd: 1.05, radius: 2.5, max: 6, desc: '+10 damage, faster drops.' },
      { dmg: 52, cd: 0.85, radius: 2.7, max: 7, desc: 'Drops more often.' },
      { dmg: 68, cd: 0.75, radius: 3.0, max: 8, desc: '+16 damage, wider snap.' },
      { dmg: 85, cd: 0.6, radius: 3.3, max: 10, desc: 'A minefield.' },
    ],
  },
  harpoon: {
    name: 'Harpoon', icon: '🎣', kind: 'bolt',
    blurb: 'A long-range spear that skewers a whole line.',
    levels: [
      { dmg: 22, cd: 1.5, count: 1, pierce: 4, speed: 22, desc: 'Skewers up to 5 in a line.' },
      { dmg: 28, cd: 1.4, count: 1, pierce: 5, speed: 22, desc: '+6 damage, +1 pierce.' },
      { dmg: 28, cd: 1.3, count: 2, pierce: 6, speed: 23, desc: 'Throws 2 harpoons.' },
      { dmg: 38, cd: 1.2, count: 2, pierce: 8, speed: 24, desc: '+10 damage, +2 pierce.' },
      { dmg: 50, cd: 1.0, count: 3, pierce: 12, speed: 26, desc: '3 harpoons, near-endless pierce.' },
    ],
  },
  biofield: {
    name: 'Bio Field', icon: '💚', kind: 'aura',
    blurb: 'A field around you that burns creatures and mends you.',
    levels: [
      { dps: 17, radius: 2.4,  heal: 0,    desc: 'Burns creatures close to you.' },
      { dps: 21, radius: 2.65, heal: 0.45, desc: 'Wider, and starts healing you.' },
      { dps: 24, radius: 2.8,  heal: 0.7,  desc: '+3 burn, more healing.' },
      { dps: 29, radius: 3.1,  heal: 1.0,  desc: 'Wider still.' },
      { dps: 39, radius: 3.5,  heal: 1.35, desc: 'A healing storm.' },
    ],
  },
  drones: {
    name: 'Shield Drones', icon: '🛡️', kind: 'orbit',
    blurb: 'Drones orbit you and shred whatever they touch.',
    levels: [
      { dmg: 13, count: 2, radius: 2.4, spin: 3.0, desc: '2 drones orbit you.' },
      { dmg: 16, count: 3, radius: 2.6, spin: 3.2, desc: '+1 drone.' },
      { dmg: 20, count: 3, radius: 2.9, spin: 3.5, desc: 'Faster, wider orbit.' },
      { dmg: 24, count: 4, radius: 3.1, spin: 3.7, desc: '+1 drone, +4 damage.' },
      { dmg: 30, count: 5, radius: 3.3, spin: 4.0, desc: '5 drones.' },
    ],
  },
  orbital: {
    name: 'Orbital Strike', icon: '☄️', kind: 'strike',
    blurb: 'Calls down strikes on creatures around you.',
    levels: [
      { dmg: 40, cd: 2.8, count: 1, radius: 1.8, delay: 0.7, desc: 'Calls down a strike.' },
      { dmg: 50, cd: 2.5, count: 2, radius: 1.9, delay: 0.7, desc: '2 strikes.' },
      { dmg: 60, cd: 2.3, count: 3, radius: 2.1, delay: 0.6, desc: '3 strikes, +10 damage.' },
      { dmg: 75, cd: 2.1, count: 4, radius: 2.3, delay: 0.6, desc: '4 strikes, wider.' },
      { dmg: 95, cd: 1.8, count: 6, radius: 2.5, delay: 0.5, desc: 'A barrage of 6.' },
    ],
  },
  arc: {
    name: 'Arc Caster', icon: '⚡', kind: 'chain',
    blurb: 'Lightning that leaps from creature to creature.',
    levels: [
      { dmg: 16, cd: 1.3, jumps: 3, range: 6.5, desc: 'Lightning leaps between 4 creatures.' },
      { dmg: 20, cd: 1.2, jumps: 4, range: 6.5, desc: '+1 leap, +4 damage.' },
      { dmg: 24, cd: 1.0, jumps: 5, range: 7.0, desc: 'Faster, +1 leap.' },
      { dmg: 30, cd: 0.9, jumps: 7, range: 7.5, desc: '+2 leaps, +6 damage.' },
      { dmg: 38, cd: 0.7, jumps: 10, range: 8.0, desc: 'A storm of 11 leaps.' },
    ],
  },
};

/* ── Passives ───────────────────────────────────────────────── */
PH.PASSIVES = {
  vitality:  { name: 'Vitality',   icon: '❤️', max: 5, per: { maxHp: 20 },       text: '+20 max health' },
  boots:     { name: 'Fleet Foot', icon: '👟', max: 5, per: { speed: 0.08 },     text: '+8% move speed' },
  power:     { name: 'Firepower',  icon: '💪', max: 5, per: { damage: 0.10 },    text: '+10% damage' },
  haste:     { name: 'Overclock',  icon: '⏱️', max: 5, per: { cooldown: 0.07 },  text: '-7% weapon cooldowns' },
  magnet:    { name: 'Magnet',     icon: '🧲', max: 5, per: { pickup: 0.30 },    text: '+30% pickup range' },
  regen:     { name: 'Field Kit',  icon: '🩹', max: 5, per: { regen: 0.5 },      text: '+0.5 health per second' },
  armor:     { name: 'Plating',    icon: '🦺', max: 5, per: { armor: 0.06 },     text: '-6% damage taken' },
  area:      { name: 'Payload',    icon: '🌀', max: 5, per: { area: 0.10 },      text: '+10% blast and field size' },
  multishot: { name: 'Twin Feed',  icon: '➕', max: 2, per: { extra: 1 },        text: '+1 projectile on every weapon' },
};

/* ── The swarm ──────────────────────────────────────────────────
   The monster's brood, drawn with the wildlife models from the original
   game (`geo`), recoloured. */
PH.ENEMIES = {
  critter:   { geo: 'small',  scale: 1.6, hp: 9,   speed: 2.5, dmg: 6,  xp: 1, radius: 0.34,
               colors: { primary: 0x6b3fa0, secondary: 0x3d2161, eye: 0xff2e63 } },
  swarmling: { geo: 'small',  scale: 1.1, hp: 4,   speed: 3.6, dmg: 4,  xp: 1, radius: 0.26,
               colors: { primary: 0x2bb5a0, secondary: 0x14574d, eye: 0xffe14d } },
  boar:      { geo: 'medium', scale: 1.6, hp: 30,  speed: 2.0, dmg: 9,  xp: 3, radius: 0.5,
               colors: { primary: 0x8a3b2e, secondary: 0x4a1e16, eye: 0xffb347 } },
  spitter:   { geo: 'medium', scale: 1.3, hp: 22,  speed: 1.7, dmg: 7,  xp: 4, radius: 0.44,
               colors: { primary: 0x5fa83a, secondary: 0x2f5a1b, eye: 0xd4ff3a },
               ranged: { range: 7.5, cd: 2.6, speed: 5.5, dmg: 8 } },
  brute:     { geo: 'large',  scale: 2.0, hp: 120, speed: 1.45, dmg: 16, xp: 10, radius: 0.85,
               colors: { primary: 0x3f4a6b, secondary: 0x1e2436, eye: 0xff4d4d } },
};

/* Spawn director. `rate` is creatures per second and is interpolated
   between rows; `mix` is the relative chance of each type. */
PH.WAVES = [
  { t: 0,   rate: 1.4, mix: { critter: 1 } },
  { t: 25,  rate: 2.2, mix: { critter: 3, swarmling: 1 } },
  { t: 55,  rate: 3.0, mix: { critter: 3, swarmling: 1, boar: 1 } },
  { t: 95,  rate: 4.0, mix: { critter: 2, swarmling: 1, boar: 2, spitter: 1 } },
  { t: 140, rate: 6.0, mix: { critter: 2, swarmling: 2, boar: 2, spitter: 1, brute: 1 } },
  { t: 190, rate: 8.0, mix: { critter: 1, swarmling: 3, boar: 3, spitter: 2, brute: 1 } },
  { t: 240, rate: 11,  mix: { swarmling: 4, boar: 3, spitter: 2, brute: 2 } },
  { t: 300, rate: 15,  mix: { swarmling: 4, boar: 3, spitter: 2, brute: 3 } },
];

/* Scripted moments. Bosses are three of the original four monsters, picked
   at random per run and met in rising evolution stages. */
PH.EVENTS = [
  { t: 22,  type: 'ring',     enemy: 'critter',   count: 26, text: 'THEY SURROUND YOU' },
  { t: 70,  type: 'boss',     stage: 1 },
  { t: 120, type: 'stampede', enemy: 'swarmling', count: 36, text: 'STAMPEDE' },
  { t: 155, type: 'boss',     stage: 2 },
  { t: 200, type: 'ring',     enemy: 'boar',      count: 22, text: 'THE PACK CLOSES IN' },
  { t: 235, type: 'boss',     stage: 3, final: true },
];
PH.ELITE_EVERY = 40;      // seconds between elite creatures, which drop a chest

/* Bosses run at 75-90% of your speed: you can open distance, not escape.
   If you do get away, they dash to close it (see `closeIn`).
   `attacks` is ordered: a boss knows one attack per evolution stage, so the
   first encounter is learnable and the last one uses everything. */
PH.BOSSES = {
  wraith:   { name: 'Wraith',   icon: '👻', hp: [850, 2500, 6000],  speed: 3.9, attacks: ['dash', 'burst'] },
  kraken:   { name: 'Kraken',   icon: '🐙', hp: [1000, 2900, 6800], speed: 3.3, attacks: ['slam', 'burst'] },
  behemoth: { name: 'Behemoth', icon: '🦖', hp: [1250, 3400, 7800], speed: 3.2, attacks: ['slam', 'dash'] },
  goliath:  { name: 'Goliath',  icon: '🦍', hp: [1100, 3100, 7200], speed: 3.5, attacks: ['dash', 'slam', 'burst'] },
};
PH.BOSS_ATTACKS = {
  dash:  { telegraph: 0.85, length: 10, speed: 15, dmg: 26 },
  slam:  { telegraph: 1.0,  radius: 4.2, dmg: 30 },
  burst: { telegraph: 0.6,  count: 14, speed: 5.5, dmg: 11 },
  contact: 18,
  closeIn: 11,              // beyond this distance a boss's next attack is always a dash at you
  restBetween: [1.6, 2.6],
  summonEvery: 9, summonCount: 8,
};
