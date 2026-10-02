/**
 * Primal Hunt - biomes.
 *
 * Each run takes place in one of five biomes. A biome sets the look (ground,
 * scenery mix, light at each time of day, weather) and, in Survival, a hazard:
 *   meadow    the original grassland; ponds are only scenery
 *   swamp     bog pools slow everything that wades in
 *   tundra    frozen ponds: you slide on the ice
 *   volcanic  lava pools burn whatever stands in them
 *   ruins     old colonnades shed rubble near you every so often
 *
 * The pools are placed from a hash of fixed world cells, so the game logic
 * (which runs headless in the balance sim) and the renderer agree on where
 * every pool is without talking to each other.
 */
window.PH = window.PH || {};

(() => {
  function hash2(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  /** How much a point sits on one of the worn paths (0 = not at all). */
  const pathAt = (x, z) => Math.max(0, ((1 - Math.abs(noise2(x * 0.028 + 7, z * 0.028 - 3) * 2 - 1)) - 0.86) / 0.14);

  // Light at each time of day (day, dusk, night - one step per monster slain).
  // The meadow's values are the game's original ones.
  const S = (bg, amb, ambI, sky, gnd, hemiI, sun, sunI, tint, tuft, mote, mist, mistA, sunDir) =>
    ({ bg, amb, ambI, sky, gnd, hemiI, sun, sunI, tint, tuft, mote, mist, mistA, sunDir });
  const DAY = [-0.45, 1, 0.55], DUSK = [-1, 0.42, 0.3], NIGHT = [0.85, 0.62, -0.35];

  /*
   * `decor`: the share of scenery cells given to each prop. `pond` and `dead`
   * (dead trees) are taken from the top of the hash, the rest from the
   * bottom, in this order. `grass`: how much of the ground is meadow (lower
   * is lusher). `pool`: what the ponds are and what they do.
   */
  const BIOMES = {
    meadow: {
      name: 'Meadow', icon: '🌿', blurb: 'Rolling grassland',
      decor: { rock: 0.05, bush: 0.03, ruin: 0.006, log: 0.014, stump: 0.01, stone: 0.006, bone: 0.006, mush: 0.038, crystal: 0, pebble: 0.1, pond: 0.015, dead: 0.013 },
      flowers: 0.1, grass: 0.36, pool: { kind: 'water' }, weather: 'rain',
      bush: [0.27, 0.08, 0.6, 0.05, 0.035], pebble: [0.08, 0.08, 0.32, 0.25],
      rock: 0x262931, ruin: 0x2c2f37, stone: 0x3a3e49, dead: 0x2b2019, wood: 0x3b2718, bone: 0xd8ccb0,
      stages: [
        S(0x14182a, 0x404060, 0.40, 0x87ceeb, 0x2d5016, 0.30, 0xfff5e0, 1.00, [1, 1, 1], 0x1c4417, 0xd8ff6a, 0xd8ecff, 0.08, DAY),
        S(0x22132e, 0x4a3560, 0.40, 0xc07aa0, 0x2a2016, 0.30, 0xffa070, 0.72, [1.12, 0.7, 1.3], 0x2a2a26, 0xffb35c, 0xd6b8ff, 0.12, DUSK),
        S(0x12050a, 0x3a1a2a, 0.42, 0x9a2a3a, 0x200808, 0.30, 0xff5040, 0.52, [1.08, 0.55, 0.62], 0x341216, 0xff4a2a, 0xff8a7a, 0.14, NIGHT),
      ],
    },
    swamp: {
      name: 'Swamp', icon: '🐸', blurb: 'Bog pools slow you down',
      decor: { rock: 0.02, bush: 0.04, ruin: 0.003, log: 0.03, stump: 0.025, stone: 0.004, bone: 0.006, mush: 0.07, crystal: 0, pebble: 0.03, pond: 0.06, dead: 0.04 },
      flowers: 0.035, grass: 0.3, pool: { kind: 'bog', slow: 0.4 }, weather: 'rain',
      bush: [0.2, 0.06, 0.45, 0.035, 0.03], pebble: [0.15, 0.1, 0.22, 0.15],
      rock: 0x283026, ruin: 0x2a3028, stone: 0x343c34, dead: 0x241e16, wood: 0x2e2216, bone: 0xc4c0a0,
      stages: [
        S(0x0f170f, 0x3a4a40, 0.42, 0x9ab88a, 0x1e2a12, 0.30, 0xe8f0c8, 0.85, [0.88, 1.0, 0.82], 0x1a3a14, 0xb8ff6a, 0xc8e0b0, 0.2, DAY),
        S(0x1a1424, 0x3e3a50, 0.40, 0x8a7a9a, 0x1a1a10, 0.30, 0xffb070, 0.64, [0.98, 0.82, 1.0], 0x22301c, 0xd0ff8a, 0xc0b8e0, 0.22, DUSK),
        S(0x070c0a, 0x1e3028, 0.44, 0x3a6a5a, 0x0a120a, 0.30, 0x70c0a0, 0.46, [0.72, 0.95, 0.86], 0x10261a, 0x7affc8, 0x8adcc0, 0.22, NIGHT),
      ],
    },
    tundra: {
      name: 'Tundra', icon: '❄️', blurb: 'Frozen ponds - you slide on the ice',
      decor: { rock: 0.07, bush: 0.008, ruin: 0.004, log: 0.006, stump: 0.006, stone: 0.008, bone: 0.01, mush: 0, crystal: 0.03, pebble: 0.08, pond: 0.035, dead: 0.02 },
      flowers: 0, grass: 0.56, pool: { kind: 'ice', grip: 1.6 }, weather: 'snow',
      bush: [0.42, 0.06, 0.12, 0.2, 0.05], pebble: [0.6, 0.06, 0.45, 0.25],
      rock: 0x5a6474, ruin: 0x6a7280, stone: 0x5e6878, dead: 0x5c6068, wood: 0x4a4038, bone: 0xe0e4ea,
      stages: [
        S(0x1a2232, 0x5a6a80, 0.48, 0xcfe8ff, 0x8a98a8, 0.34, 0xfff8f0, 0.92, [1, 1, 1], 0x8a907a, 0xffffff, 0xeaf4ff, 0.14, DAY),
        S(0x261c34, 0x5a4a70, 0.44, 0xd0a0c0, 0x706070, 0.32, 0xffa880, 0.7, [1.04, 0.86, 1.1], 0x7a6a76, 0xffd0e0, 0xe0c8ff, 0.16, DUSK),
        S(0x0a1020, 0x30406a, 0.46, 0x5a7ac0, 0x303a5a, 0.32, 0x9ab8ff, 0.5, [0.76, 0.86, 1.15], 0x40506a, 0xbfe0ff, 0xa8c8ff, 0.16, NIGHT),
      ],
    },
    volcanic: {
      name: 'Volcanic Wastes', icon: '🌋', blurb: 'Lava pools burn',
      decor: { rock: 0.09, bush: 0, ruin: 0.004, log: 0, stump: 0.008, stone: 0.006, bone: 0.02, mush: 0, crystal: 0.03, pebble: 0.12, pond: 0.02, dead: 0.025 },
      flowers: 0, grass: 0.78, pool: { kind: 'lava', dps: 7, enemyDps: 14 }, weather: 'ash',
      bush: [0.08, 0.2, 0.2, 0.03, 0.02], pebble: [0.02, 0.12, 0.06, 0.12],
      rock: 0x17141a, ruin: 0x24201e, stone: 0x221e20, dead: 0x120e0c, wood: 0x1a1210, bone: 0xc8b8a0,
      stages: [
        S(0x1a1210, 0x4a3a34, 0.42, 0xc8a088, 0x2a1a12, 0.30, 0xffd8b0, 0.9, [1, 1, 1], 0x2a2418, 0xff8a3a, 0x8a7a70, 0.14, DAY),
        S(0x200c0c, 0x4a2a2a, 0.42, 0xc06048, 0x2a1008, 0.30, 0xff7a40, 0.7, [1.1, 0.8, 0.75], 0x2a1a12, 0xff6a2a, 0xa06050, 0.16, DUSK),
        S(0x0e0404, 0x3a1414, 0.45, 0xa02a1a, 0x200604, 0.30, 0xff4020, 0.5, [1.1, 0.6, 0.55], 0x2a0e0a, 0xff3a1a, 0xc05040, 0.18, NIGHT),
      ],
    },
    ruins: {
      name: 'Old Ruins', icon: '🏛️', blurb: 'Falling rubble - watch for the shadows',
      decor: { rock: 0.04, bush: 0.025, ruin: 0.085, log: 0.006, stump: 0.006, stone: 0.03, bone: 0.008, mush: 0.015, crystal: 0, pebble: 0.1, pond: 0.01, dead: 0.008 },
      flowers: 0.07, grass: 0.42, pool: { kind: 'water' }, weather: 'rain',
      rubble: { every: [10, 15], count: 3, near: 6, r: 1.9, delay: 1.3, dmg: 13, enemyDmg: 70 },
      bush: [0.18, 0.08, 0.5, 0.05, 0.035], pebble: [0.1, 0.25, 0.4, 0.2],
      rock: 0x5a4c3a, ruin: 0x8a7656, stone: 0x6e6050, dead: 0x2e241a, wood: 0x3b2a1a, bone: 0xe0d4b8,
      stages: [
        S(0x1a1a22, 0x50483e, 0.42, 0xe8d8b0, 0x4a3e26, 0.30, 0xfff0d0, 1.0, [1, 1, 1], 0x3a4418, 0xffe8a0, 0xf0e0c0, 0.08, DAY),
        S(0x24142a, 0x4a3560, 0.40, 0xd08a80, 0x3a2416, 0.30, 0xff9a60, 0.74, [1.12, 0.76, 1.1], 0x3a2e1e, 0xffb35c, 0xe0b8d0, 0.12, DUSK),
        S(0x0c0814, 0x2a2448, 0.42, 0x6a5aa0, 0x1a1426, 0.30, 0x9a8aff, 0.5, [0.8, 0.76, 1.1], 0x26203a, 0xb8a0ff, 0xa898e0, 0.12, NIGHT),
      ],
    },
  };
  const ORDER = Object.keys(BIOMES);
  // Monster mode and Hunter Squad: no hazards there, so no lava either.
  const ARENA_ORDER = ['meadow', 'swamp', 'tundra', 'ruins'];

  const CELL = 2.5;            // the scenery grid (render.js uses the same one)

  const World = {
    BIOMES, ORDER, ARENA_ORDER, CELL, hash2, noise2, pathAt,
    current: 'meadow',
    get biome() { return BIOMES[this.current]; },
    set(id) { this.current = BIOMES[id] ? id : 'meadow'; return this.biome; },
    /** A biome picked from a run's seed, so the Daily Hunt is the same for everyone. */
    fromSeed(seed, list = ORDER) { return list[((seed >>> 7) ^ (seed >>> 19)) % list.length]; },

    /** The share of each kind of scenery, as cumulative cut points of the cell hash. */
    cuts(id = this.current) {
      const d = BIOMES[id].decor, low = [];
      let acc = 0;
      for (const k of ['rock', 'bush', 'ruin', 'log', 'stump', 'stone', 'bone', 'mush', 'crystal', 'pebble']) { acc += d[k]; low.push([k, acc]); }
      return { low, pond: 1 - d.pond, dead: 1 - d.pond - d.dead };
    },

    /** The pool in a scenery cell (cell corner gx, gz), or null. */
    poolIn(gx, gz, id = this.current) {
      const h = hash2(gx * 0.37, gz * 0.53);
      if (h <= 1 - BIOMES[id].decor.pond) return null;
      const x = gx + hash2(gx, gz + 7) * CELL, z = gz + hash2(gx + 3, gz) * CELL;
      if (pathAt(x, z) > 0.1 || Math.hypot(x, z) < 7) return null;     // never on a path, never on the start
      const sc = 1.3 + hash2(gx + 2, gz + 8) * 1.4, rot = hash2(gx, gz + 2) * 6.3;
      return { x, z, sc, rot, h };
    },

    /** Pools within `R` of a point. */
    poolsNear(x, z, R, id = this.current) {
      const out = [];
      if (!BIOMES[id].decor.pond) return out;
      const n = Math.ceil(R / CELL);
      const bx = Math.round(x / CELL), bz = Math.round(z / CELL);
      for (let dx = -n; dx <= n; dx++) {
        for (let dz = -n; dz <= n; dz++) {
          const p = this.poolIn((bx + dx) * CELL, (bz + dz) * CELL, id);
          if (p && Math.hypot(p.x - x, p.z - z) < R + p.sc) out.push(p);
        }
      }
      return out;
    },

    /** Is the point in one of these pools? The water is an ellipse, sc by sc * 0.8. */
    inPool(x, z, pools) {
      for (const p of pools) {
        const dx = x - p.x, dz = z - p.z, c = Math.cos(p.rot), s = Math.sin(p.rot);
        // Into the pool's own frame (rotated about y, like the instance matrix).
        const u = dx * c - dz * s, v = dx * s + dz * c;
        const a = p.sc * 0.92, b = p.sc * 0.8 * 0.92;
        if ((u * u) / (a * a) + (v * v) / (b * b) < 1) return p;
      }
      return null;
    },
  };

  PH.World = World;
})();
