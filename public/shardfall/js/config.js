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
        // Hegemony: energy weapons. 'bolt' is a fast projectile; 'beam' is instant and drawn as a beam while it fires.
        // (Phase 2 balance pass, from AI-vs-AI runs: shock range 4.2→4.8, beam range 4.6→5, phase 46→70 damage,
        // range 5→6, splash 0.4→0.8; Lancer hp 340→360, Phantom hp 260→380. Without a Phantom that is worth its
        // slot the Hegemony has no answer to Vanguard artillery and loses about 3 games in 4.)
        pulse:   { range: 4.5, damage: 8,   cooldown: 0.55, projectile: 'bolt',  speed: 22, splash: 0,   vs: { inf: 1.0, light: 0.55, heavy: 0.22, bld: 0.22 } },
        shock:   { range: 4.8, damage: 30,  cooldown: 1.9, projectile: 'bolt',   speed: 16, splash: 0.5, vs: { inf: 0.4, light: 1.0, heavy: 0.9, bld: 0.6 } },
        twinPulse: { range: 4.5, damage: 7, cooldown: 0.3, projectile: 'bolt',   speed: 24, splash: 0,   vs: { inf: 1.0, light: 0.65, heavy: 0.25, bld: 0.2 } },
        beam:    { range: 5,   damage: 13,  cooldown: 0.35, projectile: 'beam',  speed: 0,  splash: 0,   vs: { inf: 0.5, light: 0.9, heavy: 1.1, bld: 0.7 } },
        phase:   { range: 6,   damage: 70,  cooldown: 2.0, projectile: 'bolt',   speed: 20, splash: 0.8, vs: { inf: 0.5, light: 1.0, heavy: 1.0, bld: 0.9 } },
        spireBeam: { range: 7, damage: 58,  cooldown: 2.2, projectile: 'beam',   speed: 0,  splash: 0,   vs: { inf: 1.0, light: 1.0, heavy: 0.9, bld: 0.5 } },
        // Roster expansion. New keys a weapon can carry:
        //   stun: seconds a hit vehicle/defence is disabled (no move, no fire; infantry immune).
        //   chain: { jumps, range, falloff }: the hit arcs to the nearest other enemies within range, each jump × falloff.
        //   minRange: cannot fire at targets closer than this (also on the unit for artillery).
        sniper:  { range: 7.5, damage: 45,  cooldown: 2.6, projectile: 'bullet', speed: 0,  splash: 0,   vs: { inf: 1.0, light: 0.2, heavy: 0.08, bld: 0.08 } },
        bikeGun: { range: 4.2, damage: 6,   cooldown: 0.3, projectile: 'bullet', speed: 0,  splash: 0,   vs: { inf: 1.0, light: 0.55, heavy: 0.2, bld: 0.15 } },
        twinCannon: { range: 5.5, damage: 34, cooldown: 1.1, projectile: 'shell', speed: 18, splash: 0.6, vs: { inf: 0.5, light: 0.9, heavy: 1.0, bld: 0.9 } },
        salvo:   { range: 8,   damage: 22,  cooldown: 3.6, projectile: 'rocket', speed: 11, splash: 1.0, burst: 4, burstGap: 0.18, vs: { inf: 0.8, light: 0.8, heavy: 0.5, bld: 1.1 } },
        sentryGun: { range: 6, damage: 8,   cooldown: 0.25, projectile: 'bullet', speed: 0, splash: 0,   vs: { inf: 1.0, light: 0.5, heavy: 0.15, bld: 0.1 } },
        howitzer: { range: 11, damage: 70,  cooldown: 5,   projectile: 'arc',    speed: 9,  splash: 1.5, minRange: 3, vs: { inf: 1.0, light: 0.7, heavy: 0.6, bld: 0.9 } },
        stalkerBlade: { range: 1.6, damage: 34, cooldown: 1.0, projectile: 'beam', speed: 0, splash: 0, vs: { inf: 1.0, light: 0.6, heavy: 0.35, bld: 0.4 } },
        emp:     { range: 4.8, damage: 6,   cooldown: 2.4, projectile: 'bolt',   speed: 18, splash: 0.6, stun: 2.2, vs: { inf: 0.2, light: 1.0, heavy: 1.0, bld: 0.6 } },
        arc:     { range: 4.6, damage: 30,  cooldown: 1.5, projectile: 'chain',  speed: 0,  splash: 0,   chain: { jumps: 3, range: 2.4, falloff: 0.7 }, vs: { inf: 1.0, light: 0.9, heavy: 0.6, bld: 0.4 } },
        obliterate: { range: 9, damage: 160, cooldown: 4.5, projectile: 'beam',  speed: 0,  splash: 0.7, vs: { inf: 0.4, light: 0.8, heavy: 1.0, bld: 1.4 } },
        wispZap: { range: 3.8, damage: 5,   cooldown: 0.4, projectile: 'bolt',   speed: 26, splash: 0,   vs: { inf: 1.0, light: 0.5, heavy: 0.2, bld: 0.15 } },
    };

    // The two sides. Shared buildings (no `faction` field) are the same for both; each side has its own units,
    // base defence and superweapon. The Vanguard is armoured and long-ranged; the Hegemony is fast, uses energy
    // weapons and fields a stealth tank.
    const FACTIONS = {
        vanguard: { name: 'Vanguard', color: 0x2f8fff, accent: 0x9fd4ff, tagline: 'Armour, artillery and orbital fire',
                    units: ['rifleman', 'rocketeer', 'sniper', 'medic', 'engineer', 'harvester', 'scout', 'buggy', 'tank', 'salvo', 'artillery', 'bulwark'],
                    defense: 'turret', superweapon: 'uplink' },
        hegemony: { name: 'Hegemony', color: 0xe8432e, accent: 0xffb39f, tagline: 'Speed, energy beams and stealth',
                    units: ['trooper', 'shocktrooper', 'disruptor', 'acolyte', 'stalker', 'harvester', 'wisp', 'skimmer', 'lancer', 'arcwalker', 'phantom', 'obliterator'],
                    defense: 'spire', superweapon: 'riftsilo' },
    };

    // Superweapons: built like any building, then charge while powered (charging pauses on low power). When charged,
    // the owner targets any explored point; a warning shows there first, then the strike lands.
    const SUPERWEAPONS = {
        lance: { name: 'Orbital Lance', building: 'uplink', charge: 240, warn: 2.5, radius: 2.6, damage: 650, falloff: 0.5, vs: { inf: 1.0, light: 1.0, heavy: 1.0, bld: 1.0 } },
        rift:  { name: 'Rift Bomb', building: 'riftsilo', charge: 300, warn: 4.0, radius: 3.6, damage: 520, falloff: 0.6, vs: { inf: 1.0, light: 1.0, heavy: 0.9, bld: 1.0 } },
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
        turret:   { name: 'Gun Turret',    faction: 'vanguard',    w: 1, d: 1, hp: 450,  armor: 'bld', cost: 700,  time: 8,  power: -20, requires: ['barracks'], sight: 7,
                    weapon: 'turretGun', desc: 'Defends the base. Needs power.' },
        spire:    { name: 'Pulse Spire',   faction: 'hegemony', w: 1, d: 1, hp: 400,  armor: 'bld', cost: 800,  time: 9,  power: -40, requires: ['barracks'], sight: 7,
                    weapon: 'spireBeam', desc: 'An energy beam tower: hits hard, needs plenty of power.' },
        uplink:   { name: 'Orbital Uplink', faction: 'vanguard', w: 2, d: 2, hp: 900, armor: 'bld', cost: 2500, time: 24, power: -100, requires: ['techlab'], sight: 4,
                    superweapon: 'lance', desc: 'Charges the Orbital Lance: a beam from orbit that wrecks anything under it.' },
        riftsilo: { name: 'Rift Silo',     faction: 'hegemony', w: 2, d: 2, hp: 900,  armor: 'bld', cost: 2500, time: 24, power: -100, requires: ['techlab'], sight: 4,
                    superweapon: 'rift', desc: 'Launches the Rift Bomb: a missile that collapses space over a wide area.' },
        // Roster expansion. New keys a building can carry:
        //   wall: true: cheap 1×1 block; units path around it; stays in placement mode after placing while affordable.
        //   repair: { radius, rate, targets: 'vehicle' }: heals friendly units of that class nearby (hp/s), free.
        //   field: { radius, slow }: enemy units inside move at speed × (1 − slow) (needs power).
        //   income: credits per second while powered.
        wall:     { name: 'Wall',          w: 1, d: 1, hp: 700,  armor: 'bld', cost: 60,   time: 1.5, power: 0,  requires: ['barracks'], sight: 1,
                    wall: true, desc: 'A cheap barrier. Units path around walls; place several in a row.' },
        repairbay: { name: 'Repair Bay',   w: 2, d: 2, hp: 700,  armor: 'bld', cost: 900,  time: 12, power: -30, requires: ['factory'], sight: 4,
                    repair: { radius: 3, rate: 22, targets: 'vehicle' }, desc: 'Repairs your vehicles parked nearby, for free.' },
        sentry:   { name: 'Sentry Post',   faction: 'vanguard', w: 1, d: 1, hp: 380, armor: 'bld', cost: 450, time: 6, power: -10, requires: ['barracks'], sight: 7,
                    weapon: 'sentryGun', desc: 'A machine-gun post that shreds infantry. Weak against vehicles.' },
        howitzer: { name: 'Howitzer',      faction: 'vanguard', w: 2, d: 2, hp: 650, armor: 'bld', cost: 1300, time: 14, power: -40, requires: ['radar'], sight: 6,
                    weapon: 'howitzer', desc: 'Long-range artillery emplacement. Cannot hit anything closer than 3 tiles.' },
        gravwell: { name: 'Gravity Well',  faction: 'hegemony', w: 1, d: 1, hp: 420, armor: 'bld', cost: 700, time: 8, power: -35, requires: ['barracks'], sight: 6,
                    field: { radius: 4, slow: 0.5 }, desc: 'Halves the speed of enemy units around it. Needs power.' },
        siphon:   { name: 'Shard Siphon',  faction: 'hegemony', w: 2, d: 2, hp: 600, armor: 'bld', cost: 1500, time: 14, power: -30, requires: ['refinery'], sight: 4,
                    income: 7, desc: 'Draws shard energy from deep below: a slow, steady trickle of credits.' },
        techlab:  { name: 'Tech Lab',      w: 2, d: 2, hp: 700,  armor: 'bld', cost: 1500, time: 15, power: -60, requires: ['factory', 'radar'], sight: 4,
                    desc: 'Unlocks artillery and rocket troopers’ upgrades.' },
    };

    // Units: where they are made, cost, time, hit points, armor class, speed, weapon, sight; radius for spacing.
    const UNITS = {
        rifleman:  { name: 'Rifleman',    faction: 'vanguard', from: 'infantry', cost: 100,  time: 4,  hp: 55,  armor: 'inf',   speed: 1.6, turn: 10, weapon: 'rifle',  sight: 5,   radius: 0.22, requires: [] },
        rocketeer: { name: 'Rocketeer',   faction: 'vanguard', from: 'infantry', cost: 300,  time: 6,  hp: 50,  armor: 'inf',   speed: 1.4, turn: 10, weapon: 'rocket', sight: 5,   radius: 0.22, requires: [] },
        harvester: { name: 'Harvester',   from: 'vehicle',  cost: 1000, time: 12, hp: 650, armor: 'heavy', speed: 1.5, turn: 3,  weapon: null,     sight: 4,   radius: 0.6,  requires: [],
                     capacity: 500, harvestRate: 45, unloadRate: 180 },
        buggy:     { name: 'Scout Buggy', faction: 'vanguard', from: 'vehicle',  cost: 450,  time: 6,  hp: 160, armor: 'light', speed: 3.6, turn: 6,  weapon: 'mg',     sight: 7,   radius: 0.45, requires: [] },
        tank:      { name: 'Battle Tank', faction: 'vanguard', from: 'vehicle',  cost: 800,  time: 9,  hp: 420, armor: 'heavy', speed: 2.0, turn: 3,  weapon: 'cannon', sight: 5.5, radius: 0.55, requires: [], turret: true },
        trooper:      { name: 'Pulse Trooper', faction: 'hegemony', from: 'infantry', cost: 120, time: 4, hp: 50, armor: 'inf', speed: 1.9, turn: 10, weapon: 'pulse', sight: 5, radius: 0.22, requires: [] },
        shocktrooper: { name: 'Shock Trooper', faction: 'hegemony', from: 'infantry', cost: 320, time: 6, hp: 55, armor: 'inf', speed: 1.5, turn: 10, weapon: 'shock', sight: 5, radius: 0.22, requires: [] },
        skimmer:      { name: 'Skimmer',       faction: 'hegemony', from: 'vehicle', cost: 420, time: 6, hp: 130, armor: 'light', speed: 4.3, turn: 7, weapon: 'twinPulse', sight: 7, radius: 0.45, requires: [], hover: true },
        lancer:       { name: 'Lancer',        faction: 'hegemony', from: 'vehicle', cost: 850, time: 9, hp: 360, armor: 'heavy', speed: 2.4, turn: 3.5, weapon: 'beam', sight: 5.5, radius: 0.55, requires: [], turret: true },
        // Cloaked: enemies cannot see or target it unless one of their units or buildings is within `revealRange`,
        // or it fired in the last `cloakDelay` seconds.
        phantom:      { name: 'Phantom',       faction: 'hegemony', from: 'vehicle', cost: 1000, time: 11, hp: 380, armor: 'heavy', speed: 2.6, turn: 4, weapon: 'phase', sight: 6, radius: 0.55, requires: ['techlab'],
                        turret: true, cloak: true, revealRange: 2.5, cloakDelay: 2.5 },
        // Roster expansion. New keys a unit can carry:
        //   heal: { radius, rate, targets: 'inf' | 'vehicle' | 'bld' }: restores hp of the nearest damaged friendly
        //     target of that class in radius (hp/s), walking towards hurt allies when idle. No weapon.
        //   stunImmune (infantry are always immune to stun).
        sniper:    { name: 'Sniper',      faction: 'vanguard', from: 'infantry', cost: 450, time: 7, hp: 45, armor: 'inf', speed: 1.4, turn: 10, weapon: 'sniper', sight: 8, radius: 0.22, requires: ['radar'] },
        medic:     { name: 'Field Medic', faction: 'vanguard', from: 'infantry', cost: 250, time: 5, hp: 60, armor: 'inf', speed: 1.7, turn: 10, weapon: null, sight: 5, radius: 0.22, requires: [],
                     heal: { radius: 2.5, rate: 9, targets: 'inf' } },
        engineer:  { name: 'Engineer',    faction: 'vanguard', from: 'infantry', cost: 350, time: 6, hp: 55, armor: 'inf', speed: 1.6, turn: 10, weapon: null, sight: 5, radius: 0.22, requires: [],
                     heal: { radius: 1.8, rate: 30, targets: 'bld' } },
        scout:     { name: 'Recon Bike',  faction: 'vanguard', from: 'vehicle', cost: 300, time: 4, hp: 95, armor: 'light', speed: 4.6, turn: 8, weapon: 'bikeGun', sight: 9, radius: 0.35, requires: [] },
        salvo:     { name: 'Salvo Launcher', faction: 'vanguard', from: 'vehicle', cost: 1100, time: 12, hp: 220, armor: 'light', speed: 1.9, turn: 3, weapon: 'salvo', sight: 6, radius: 0.55, requires: ['radar'], turret: true, minRange: 2.5 },
        bulwark:   { name: 'Bulwark',     faction: 'vanguard', from: 'vehicle', cost: 1800, time: 18, hp: 1100, armor: 'heavy', speed: 1.3, turn: 2, weapon: 'twinCannon', sight: 6, radius: 0.75, requires: ['techlab'], turret: true },
        disruptor: { name: 'Disruptor',   faction: 'hegemony', from: 'infantry', cost: 380, time: 6, hp: 55, armor: 'inf', speed: 1.6, turn: 10, weapon: 'emp', sight: 5, radius: 0.22, requires: ['radar'] },
        acolyte:   { name: 'Acolyte',     faction: 'hegemony', from: 'infantry', cost: 280, time: 5, hp: 60, armor: 'inf', speed: 1.8, turn: 10, weapon: null, sight: 5, radius: 0.22, requires: [],
                     heal: { radius: 2.5, rate: 9, targets: 'inf' } },
        stalker:   { name: 'Stalker',     faction: 'hegemony', from: 'infantry', cost: 500, time: 7, hp: 80, armor: 'inf', speed: 2.2, turn: 10, weapon: 'stalkerBlade', sight: 5, radius: 0.22, requires: ['techlab'],
                     cloak: true, revealRange: 1.8, cloakDelay: 2 },
        wisp:      { name: 'Wisp Drone',  faction: 'hegemony', from: 'vehicle', cost: 250, time: 3.5, hp: 70, armor: 'light', speed: 5.2, turn: 9, weapon: 'wispZap', sight: 9, radius: 0.3, requires: [], hover: true },
        arcwalker: { name: 'Arc Walker',  faction: 'hegemony', from: 'vehicle', cost: 1000, time: 11, hp: 300, armor: 'heavy', speed: 2.1, turn: 3.5, weapon: 'arc', sight: 5.5, radius: 0.55, requires: ['radar'], turret: true },
        obliterator: { name: 'Obliterator', faction: 'hegemony', from: 'vehicle', cost: 1900, time: 18, hp: 700, armor: 'heavy', speed: 1.5, turn: 2, weapon: 'obliterate', sight: 7, radius: 0.75, requires: ['techlab'], turret: true, hover: true },
        artillery: { name: 'Artillery',   faction: 'vanguard', from: 'vehicle',  cost: 950,  time: 11, hp: 180, armor: 'light', speed: 1.6, turn: 2.5, weapon: 'artillery', sight: 6, radius: 0.55, requires: ['techlab'], minRange: 3 },
    };

    const ECONOMY = {
        startCredits: 3000,
        shardPerTile: 400,      // a fresh shard tile
        shardRegrow: 6,         // per second, per tile next to a shard spire, up to shardPerTile
        lowPowerSlowdown: 0.5,  // production speed when power used > power made
        buildRadius: 5,         // a new building must be within this many tiles of one of yours
        sellRefund: 0.5,
        queueMax: 5,            // queue slots per production lane
        // Production lanes: every finished barracks (infantry) or war factory (vehicles) adds a lane, up to maxLanes;
        // that many items of the category are built at the same time, each from its own building.
        maxLanes: 5,
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

    return { TICK, WEAPONS, FACTIONS, SUPERWEAPONS, BUILDINGS, UNITS, ECONOMY, AI, TEAMS };
})();
