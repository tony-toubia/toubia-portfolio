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
  hpScale: (t) => 1 + t / 110 + Math.pow(t / 220, 2),

  score: { kill: 1, second: 2, boss: 500, victory: 2000 },
};

/* ── Hunter classes ─────────────────────────────────────────────
   The four classes from the original game. Each now starts with one of the
   auto-firing weapons below and a small passive perk. */
PH.CLASSES = {
  assault: {
    name: 'Assault', icon: '🔫', color: '#ff4757', role: 'Damage dealer',
    weapon: 'rifle', ability: 'overdrive', perk: { damage: 0.20 }, perkText: '+20% damage',
  },
  trapper: {
    name: 'Trapper', icon: '🪤', color: '#ffa502', role: 'Area control',
    weapon: 'traps', ability: 'snare', perk: { area: 0.15 }, perkText: '+15% blast area',
  },
  medic: {
    name: 'Medic', icon: '💉', color: '#2ed573', role: 'Sustain',
    weapon: 'biofield', ability: 'pulse', perk: { maxHp: 30, regen: 0.3 }, perkText: '+30 HP and regeneration',
  },
  support: {
    name: 'Support', icon: '🛡️', color: '#1e90ff', role: 'Utility',
    // Drones have no cooldown, so a cooldown perk did nothing for this class.
    weapon: 'drones', ability: 'dome', perk: { extra: 1 }, perkText: '+1 projectile on every weapon',
  },
};

/* ── Signature abilities ────────────────────────────────────────
   One per class, fired with Space or the round button. Cooldowns shrink
   with the Overclock passive, like weapon cooldowns. */
PH.ABILITIES = {
  overdrive: { name: 'Overdrive', icon: '🔥', cd: 20, dur: 5, rate: 1.75, dmg: 0.15,
               desc: 'Weapons fire 75% faster and hit 15% harder for 5s.' },
  snare:     { name: 'Snare Net', icon: '🕸️', cd: 14, dur: 3.5, radius: 4.6, dmg: 35, bossSlow: 0.5,
               desc: 'Roots every creature nearby for 3.5s; slows monsters.' },
  pulse:     { name: 'Life Pulse', icon: '💖', cd: 18, heal: 18, radius: 4.2, dmg: 32, knock: 10,
               desc: 'Heals 18 and blasts creatures away from you.' },
  dome:      { name: 'Shield Dome', icon: '🔰', cd: 18, dur: 4.5, radius: 3.4, guard: 0.5,
               desc: 'A dome that stops shots, repels creatures and halves damage taken.' },
};

/* Dodge roll, on Shift or the small button: a short burst with invulnerability. */
PH.DODGE = { cd: 2.4, dist: 3.8, dur: 0.2, iframes: 0.32 };

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
      { dps: 21, radius: 2.65, heal: 0.35, desc: 'Wider, and starts healing you.' },
      { dps: 24, radius: 2.8,  heal: 0.55, desc: '+3 burn, more healing.' },
      { dps: 29, radius: 3.1,  heal: 0.8,  desc: 'Wider still.' },
      { dps: 39, radius: 3.5,  heal: 1.1,  desc: 'A healing storm.' },
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

/* ── Evolutions ─────────────────────────────────────────────────
   A level 5 weapon plus the paired passive (any level) can evolve into a
   stronger form, offered as an upgrade card - always on a supply drop. The
   stats replace level 5's; extra keys switch on behaviour in game.js. */
PH.EVOLUTIONS = {
  rifle:    { needs: 'haste',     name: 'Minigun',         icon: '🌪️',
              stats: { dmg: 19, cd: 0.13, count: 2, pierce: 2, speed: 23 }, desc: 'A torrent of piercing rounds.' },
  shotgun:  { needs: 'vitality',  name: "Dragon's Breath", icon: '🐉',
              stats: { dmg: 17, cd: 0.55, pellets: 14, arc: 1.15, speed: 15, range: 9, pierce: 2 }, desc: 'A wide cone of piercing fire.' },
  grenade:  { needs: 'area',      name: 'Cluster Bomb',    icon: '🎆',
              stats: { dmg: 60, cd: 1.4, count: 3, radius: 3.1, cluster: 4 }, desc: 'Each blast scatters four more.' },
  traps:    { needs: 'armor',     name: 'Claymore Field',  icon: '💣',
              stats: { dmg: 115, cd: 0.45, radius: 3.6, max: 12 }, desc: 'Twelve traps, huge blasts.' },
  harpoon:  { needs: 'boots',     name: 'Leviathan Lance', icon: '🔱',
              stats: { dmg: 72, cd: 0.85, count: 4, pierce: 99, speed: 28 }, desc: 'Four lances that pierce everything.' },
  biofield: { needs: 'regen',     name: 'Life Bloom',      icon: '🌸',
              stats: { dps: 56, radius: 4.3, heal: 1.6 }, desc: 'A vast field that burns and heals.' },
  drones:   { needs: 'multishot', name: 'Drone Swarm',     icon: '🛸',
              stats: { dmg: 36, count: 8, radius: 3.7, spin: 4.6 }, desc: 'Eight drones in a wide ring.' },
  orbital:  { needs: 'magnet',    name: 'Meteor Storm',    icon: '🌠',
              stats: { dmg: 130, cd: 1.5, count: 8, radius: 2.9, delay: 0.45 }, desc: 'Eight meteors at a time.' },
  arc:      { needs: 'power',     name: 'Storm Caller',    icon: '🌩️',
              stats: { dmg: 48, cd: 0.55, jumps: 14, range: 9 }, desc: 'Lightning that never stops leaping.' },
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

  // Monster mode's prey. `food` fills the evolution meter, `armor` refills armour.
  deer:      { geo: 'small',  scale: 2.4, hp: 14,  speed: 3.7, dmg: 0,  xp: 0, radius: 0.38, food: 9,  armor: 14,
               colors: { primary: 0x8b5a2b, secondary: 0x4a2e14, eye: 0x111111 } },
  hog:       { geo: 'medium', scale: 1.9, hp: 45, speed: 2.7, dmg: 0,  xp: 0, radius: 0.5,  food: 17, armor: 28,
               colors: { primary: 0x5e4436, secondary: 0x2e2018, eye: 0x221111 } },
  megabeast: { geo: 'large',  scale: 2.5, hp: 170, speed: 2.0, dmg: 10, xp: 0, radius: 0.85, food: 36, armor: 60,
               colors: { primary: 0x56634a, secondary: 0x2a3122, eye: 0xffb347 } },
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
  wraith:   { name: 'Wraith',   icon: '👻', hp: [980, 2900, 6900],  speed: 3.9, attacks: ['dash', 'burst'] },
  kraken:   { name: 'Kraken',   icon: '🐙', hp: [1150, 3350, 7800], speed: 3.3, attacks: ['slam', 'burst'] },
  behemoth: { name: 'Behemoth', icon: '🦖', hp: [1440, 3900, 9000], speed: 3.2, attacks: ['slam', 'dash'] },
  goliath:  { name: 'Goliath',  icon: '🦍', hp: [1260, 3550, 8300], speed: 3.5, attacks: ['dash', 'slam', 'burst'] },
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

/* ── Monster mode ───────────────────────────────────────────────
   You are the monster. Eat to fill the evolution meter, evolve twice, and
   either wipe out the four AI hunters or outlast their dropship's clock. */
PH.MONSTER_MODE = {
  arena: 34,                // radius of the playable area
  duration: 360,            // seconds until the hunters' dropship leaves
  hunterArrival: 6,         // the squad lands a few seconds in
  hunterRespawn: 75,        // dead hunters are redeployed together after this
  sight: 8.5,               // how far a hunter sees you in the open...
  sightHidden: 2.6,         // ...and in tall grass, standing still
  sightRustle: 4.2,         // ...and in tall grass while moving
  trackEvery: 1.4,          // a footprint every this many units walked in the open
  trackLife: 40,
  birds: { feed: 0.5, feedHidden: 0.1, pounce: 0.55, noise: 3 },
  wildlife: { max: 26, respawn: 0.6, mix: { deer: 6, hog: 3, megabeast: 1 } },
  grass: { patches: 24, minR: 2.6, maxR: 5.4, density: 2.6 },
  attackCd: 0.55,
  armorRegenHidden: 9,      // armour per second while hidden and out of combat
  outOfCombat: 4,
  evolveTime: 3,
  pounce: { cd: 3.5, dist: 5, dur: 0.22, iframes: 0.25 },
  stages: [
    { hp: 640,  armor: 300, dmg: 16, reach: 2.0, speed: 4.7, food: 220, view: 1.4 },
    { hp: 1000, armor: 460, dmg: 25, reach: 2.4, speed: 4.85, food: 360, view: 1.6 },
    { hp: 1350, armor: 560, dmg: 32, reach: 2.9, speed: 5.0, food: 0,   view: 1.85 },
  ],
};

/* The four monsters from the original game, each with one signature attack.
   Ability damage grows 35% per evolution stage. */
PH.MONSTERS = {
  goliath:  { name: 'Goliath',  icon: '🦍', role: 'Brawler',  blurb: 'Leaps into the fight.', hp: 1.08, speed: 0.97,
              ability: { id: 'leap', name: 'Leap Smash', icon: '💥', cd: 8, dist: 7, r: 3.2, dmg: 40, air: 0.45 } },
  kraken:   { name: 'Kraken',   icon: '🐙', role: 'Caster',   blurb: 'Calls lightning from range.', hp: 0.95, speed: 1.0,
              ability: { id: 'lightning', name: 'Lightning Strike', icon: '⚡', cd: 5.5, range: 12, r: 2.6, dmg: 38, delay: 0.5 } },
  wraith:   { name: 'Wraith',   icon: '👻', role: 'Assassin', blurb: 'Warps in and explodes.', hp: 0.8, speed: 1.05,
              ability: { id: 'warp', name: 'Warp Blast', icon: '🌀', cd: 6.5, dist: 7, r: 3.0, dmg: 34 } },
  behemoth: { name: 'Behemoth', icon: '🦖', role: 'Tank',     blurb: 'Rolls through everything.', hp: 1.35, speed: 0.93,
              ability: { id: 'roll', name: 'Rolling Charge', icon: '🪨', cd: 7, dur: 1.1, speed: 13, dmg: 32, knock: 9 } },
};

/* The AI squad. Ranges are where each one prefers to stand while fighting. */
PH.HUNTER_AI = {
  speed: 4.0, jet: { cd: 6, dist: 4, chance: 0.5, chase: 5 },   // `chase`: jet cooldown when closing on a fleeing monster
  // Sound spikes: if the squad has lost you for a while, the trapper gets a rough fix.
  scan: { every: 25, late: 10, range: 26, noise: 4 },   // `late`: the interval by the final minute
  sweep: { time: 9, r: 5 },  // how long they comb an area where the trail went cold
  bleedOut: 20, reviveTime: 3, reviveHp: 0.4,
  assault: { hp: 160, range: 5, shot: { vis: 'bolt',    dmg: 5, cd: 0.3, speed: 17 } },
  trapper: { hp: 140, range: 7, shot: { vis: 'harpoon', dmg: 9, cd: 3.2, speed: 20, slow: 0.35, slowT: 1.1 },
             arena: { cd: 40, first: 40, r: 13, dur: 16 } },
  medic:   { hp: 125, range: 8, shot: { vis: 'pellet',  dmg: 4, cd: 0.9, speed: 15 }, heal: { hps: 10, range: 9 } },
  support: { hp: 150, range: 7, shot: { vis: 'bolt',    dmg: 6, cd: 0.6, speed: 16 },
             shield: { cd: 9, dur: 3, guard: 0.7 }, strike: { cd: 13, delay: 1.6, r: 3, dmg: 45 } },
};

/* ── Hunter mode ────────────────────────────────────────────────
   Monster mode turned around: you are one of the four hunters, the other
   three are the AI squad, and the monster is played by its AI. Kill it
   before it wipes out the squad or outlasts the dropship's clock. Your
   weapon fires on its own; each class has one special for this mode. */
PH.HUNT_MODE = {
  speed: 4.3,               // a little quicker than the AI squad, so you can lead
  dodge: { cd: 2.6, dist: 4.2, dur: 0.2, iframes: 0.3 },   // jetpack burst
  seeClose: 5,              // you always see the monster this close, grass or not
  abilities: {
    assault: { name: 'Overdrive', icon: '🔥', cd: 16, dur: 5, rate: 2, dmg: 0.25,
               desc: 'Fire twice as fast and 25% harder for 5s.' },
    trapper: { name: 'Mobile Arena', icon: '🔶', cd: 40, r: 13, dur: 14,
               desc: 'Drop a dome around you. A monster inside cannot get out.' },
    medic:   { name: 'Healing Burst', icon: '💖', cd: 16, heal: 60, r: 10,
               desc: 'Heal everyone nearby by 60 and revive the downed close to you.' },
    support: { name: 'Orbital Strike', icon: '☄️', cd: 10, r: 3.4, dmg: 90, delay: 1.2,
               desc: 'Call a strike on the monster - or where it was last seen.' },
  },
};
