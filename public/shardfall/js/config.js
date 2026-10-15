// Shardfall: the rules as data. Everything balance-related lives here, so tuning never touches the simulation.
//
// Units of measure: 1 world unit = 1 map tile. Time in seconds. Speeds in tiles per second. Ranges in tiles.
// Armor classes: 'inf' (infantry), 'light' (light vehicles), 'heavy' (tanks, harvesters), 'bld' (buildings).
// Each weapon has a damage multiplier per armor class (vs).
window.SF_CONFIG = (() => {
    const TICK = 1 / 20;   // the simulation's fixed step

    const WEAPONS = {
        rifle:   { range: 4.5, damage: 9,   cooldown: 0.8, projectile: 'bullet', speed: 0,  splash: 0,   vs: { inf: 1.0, light: 0.45, heavy: 0.2, bld: 0.25 } },
        rocket:  { range: 5.5, damage: 32,  cooldown: 2.2, projectile: 'rocket', speed: 12, splash: 0.4, vs: { inf: 0.35, light: 1.0, heavy: 1.0, bld: 0.7 } },
        mg:      { range: 4.5, damage: 7,   cooldown: 0.35, projectile: 'bullet', speed: 0, splash: 0,   vs: { inf: 1.0, light: 0.6, heavy: 0.25, bld: 0.2 } },
        cannon:  { range: 5,   damage: 38,  cooldown: 1.6, projectile: 'shell',  speed: 18, splash: 0.5, vs: { inf: 0.45, light: 0.9, heavy: 1.0, bld: 0.8 } },
        artillery: { range: 10, damage: 60, cooldown: 4.5, projectile: 'arc',    speed: 9,  splash: 1.6, vs: { inf: 1.0, light: 0.7, heavy: 0.6, bld: 1.0 } },
        turretGun: { range: 6.5, damage: 34, cooldown: 1.4, projectile: 'shell', speed: 20, splash: 0.4, vs: { inf: 0.5, light: 1.0, heavy: 1.0, bld: 0.5 } },
    };

    // Buildings: footprint in tiles (w × d), power (+ makes, − uses), build time, cost, what must exist first.
    const BUILDINGS = {
        core:     { name: 'Command Core',  w: 3, d: 3, hp: 1600, armor: 'bld', cost: 0,    time: 0,  power: 10,  requires: [], sight: 7, buildable: false,
                    makes: 'building', desc: 'Builds every other structure. Lose it and you can only build what is queued.' },
        reactor:  { name: 'Reactor',       w: 2, d: 2, hp: 500,  armor: 'bld', cost: 300,  time: 8,  power: 100, requires: [], sight: 4,
                    desc: 'Power for the base. Low power slows production and switches off turrets and the radar.' },
        refinery: { name: 'Refinery',      w: 3, d: 3, hp: 900,  armor: 'bld', cost: 1400, time: 14, power: -30, requires: ['reactor'], sight: 5,
                    freeUnit: 'harvester', desc: 'Turns shards into credits. Comes with one harvester.' },
        barracks: { name: 'Barracks',      w: 2, d: 2, hp: 600,  armor: 'bld', cost: 400,  time: 9,  power: -20, requires: ['reactor'], sight: 4,
                    makes: 'infantry', desc: 'Trains infantry.' },
        factory:  { name: 'War Factory',   w: 3, d: 3, hp: 1100, armor: 'bld', cost: 1600, time: 16, power: -30, requires: ['refinery'], sight: 5,
                    makes: 'vehicle', desc: 'Builds vehicles, including harvesters.' },
        radar:    { name: 'Comms Array',   w: 2, d: 2, hp: 600,  armor: 'bld', cost: 800,  time: 10, power: -40, requires: ['refinery'], sight: 8,
                    desc: 'Turns on the minimap while powered.' },
        turret:   { name: 'Gun Turret',    w: 1, d: 1, hp: 450,  armor: 'bld', cost: 600,  time: 8,  power: -20, requires: ['barracks'], sight: 7,
                    weapon: 'turretGun', desc: 'Defends the base. Needs power.' },
        techlab:  { name: 'Tech Lab',      w: 2, d: 2, hp: 700,  armor: 'bld', cost: 1500, time: 15, power: -60, requires: ['factory', 'radar'], sight: 4,
                    desc: 'Unlocks artillery and rocket troopers’ upgrades.' },
    };

    // Units: where they are made, cost, time, hit points, armor class, speed, weapon, sight; radius for spacing.
    const UNITS = {
        rifleman:  { name: 'Rifleman',    from: 'infantry', cost: 100,  time: 4,  hp: 55,  armor: 'inf',   speed: 1.6, turn: 10, weapon: 'rifle',  sight: 5,   radius: 0.22, requires: [] },
        rocketeer: { name: 'Rocketeer',   from: 'infantry', cost: 300,  time: 6,  hp: 50,  armor: 'inf',   speed: 1.4, turn: 10, weapon: 'rocket', sight: 5,   radius: 0.22, requires: [] },
        harvester: { name: 'Harvester',   from: 'vehicle',  cost: 1000, time: 12, hp: 650, armor: 'heavy', speed: 1.5, turn: 3,  weapon: null,     sight: 4,   radius: 0.6,  requires: [],
                     capacity: 500, harvestRate: 40, unloadRate: 160 },
        buggy:     { name: 'Scout Buggy', from: 'vehicle',  cost: 450,  time: 6,  hp: 160, armor: 'light', speed: 3.6, turn: 6,  weapon: 'mg',     sight: 7,   radius: 0.45, requires: [] },
        tank:      { name: 'Battle Tank', from: 'vehicle',  cost: 800,  time: 9,  hp: 420, armor: 'heavy', speed: 2.0, turn: 3,  weapon: 'cannon', sight: 5.5, radius: 0.55, requires: [], turret: true },
        artillery: { name: 'Artillery',   from: 'vehicle',  cost: 950,  time: 11, hp: 180, armor: 'light', speed: 1.6, turn: 2.5, weapon: 'artillery', sight: 6, radius: 0.55, requires: ['techlab'], minRange: 3 },
    };

    const ECONOMY = {
        startCredits: 2500,
        shardPerTile: 400,      // a fresh shard tile
        shardRegrow: 6,         // per second, per tile next to a shard spire, up to shardPerTile
        lowPowerSlowdown: 0.5,  // production speed when power used > power made
        buildRadius: 5,         // a new building must be within this many tiles of one of yours
        sellRefund: 0.5,
        queueMax: 5,
    };

    const AI = {
        // Income multiplier and how big/often attack waves get, per difficulty.
        easy:   { income: 0.75, firstWave: 210, waveEvery: 120, waveSize: 4, waveGrowth: 1, buildDelay: 1.6 },
        normal: { income: 1.0,  firstWave: 160, waveEvery: 95,  waveSize: 6, waveGrowth: 2, buildDelay: 1.0 },
        hard:   { income: 1.3,  firstWave: 120, waveEvery: 75,  waveSize: 8, waveGrowth: 3, buildDelay: 0.7 },
    };

    const TEAMS = [
        { name: 'Vanguard',  color: 0x2f8fff, accent: 0x9fd4ff },
        { name: 'Hegemony',  color: 0xe8432e, accent: 0xffb39f },
    ];

    return { TICK, WEAPONS, BUILDINGS, UNITS, ECONOMY, AI, TEAMS };
})();
