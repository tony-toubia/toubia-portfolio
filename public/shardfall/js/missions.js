// Shardfall: the campaign. Five missions over the shard fields of Kessar, as data the simulation interprets
// (see "Mission framework" in sim.js). Plain data, no THREE, no DOM; load it after config.js.
//
// Extra fields the simulation understands: map.clear [{x, z, r}] opens rock; autoTag { type: tag } tags every
// building of that type when it is placed; building `delay` (superweapons) postpones charging by that many seconds;
// unit `patrol` [{x, z}, ...] loops an attack-move; unit/spawn `hunt` keeps attacking the nearest enemy building.
//
// Coordinates are world units (1 = one tile) on the mission's own map; the player is always team 0 and starts
// bottom-left, the enemy's usual start is top-right. Building positions are the wanted footprint origin; the
// simulation moves a building to the nearest open spot if the ground there is taken.
//
// Speakers (message.from / portrait):
//   Vanguard: Commander Ilse Varga ('varga'), Lieutenant Teo Marsh, field engineer ('marsh')
//   Hegemony: Archon Sefa Vael ('vael'), Prefect Dorn Kesh ('kesh')
(function () {
    'use strict';
    const SF = window.SF = window.SF || {};

    const VARGA = 'Commander Varga', MARSH = 'Lt. Marsh', VAEL = 'Archon Vael', KESH = 'Prefect Kesh';
    const say = (from, text) => ({ message: { from, text, portrait: { [VARGA]: 'varga', [MARSH]: 'marsh', [VAEL]: 'vael', [KESH]: 'kesh' }[from] } });

    // ------------------------------------------------------------------------------------------------
    // 1. First Light (Vanguard tutorial)
    const m1 = {
        id: 'm1', title: 'First Light', faction: 'vanguard', enemyFaction: 'hegemony', difficulty: 'easy',
        summary: 'Land on Kessar, build a base, and learn to harvest, train and fight.',
        briefing: [
            'Kessar. A dead world, except for the shards: crystal that grows out of the rock around the old spires and powers everything we build. Whoever holds the fields holds the planet.',
            'Your landing group came down at dawn on the southern plateau with a Command Core and a handful of troops. The Hegemony claims these fields too, and their scouts are already out there.',
            'Lieutenant Marsh will walk you through it: power, a refinery, harvesters, barracks. Then we find out who else is on this plateau.',
        ],
        map: { seed: 101, size: 64 },
        player: { credits: 2500, start: true, allow: ['reactor', 'refinery', 'barracks', 'rifleman'] },
        enemy: {
            credits: 0, ai: null, start: false,
            buildings: [{ type: 'reactor', tx: 46, tz: 42, tag: 'outpost' }, { type: 'barracks', tx: 49, tz: 46, tag: 'outpost' }],
            units: [{ type: 'trooper', count: 3, x: 47.5, z: 49.5, tag: 'outpostGuard' }],
        },
        objectives: [
            { id: 'reactor', text: 'Build a Reactor', kind: 'build', type: 'reactor' },
            { id: 'refinery', text: 'Build a Refinery', kind: 'build', type: 'refinery', hidden: true },
            { id: 'harvest', text: 'Harvest 1500 credits of shards', kind: 'harvest', credits: 1500, hidden: true },
            { id: 'barracks', text: 'Build a Barracks', kind: 'build', type: 'barracks', hidden: true },
            { id: 'riflemen', text: 'Train 5 Riflemen', kind: 'army', type: 'rifleman', count: 5, hidden: true },
            { id: 'raid', text: 'Repel the Hegemony raid', kind: 'destroy', tag: 'raid', hidden: true },
            { id: 'outpost', text: 'Destroy the Hegemony outpost', kind: 'destroy', tag: 'outpost', hidden: true },
        ],
        triggers: [
            { at: 1, do: [say(VARGA, 'Commander, welcome to Kessar. The plateau is ours for now. Get the base running before the Hegemony notices us.')] },
            { at: 5, do: [say(MARSH, 'Everything starts with power. Pick the Reactor in the build menu; when it is finished, tap the ground near the Core to place it.')] },
            { at: { objective: 'reactor' }, do: [
                say(MARSH, 'Lights on. Now a Refinery: it turns shards into credits and comes with a harvester. Put it close to the shard field north of the Core.'),
                { objective: 'refinery' }] },
            { at: { objective: 'refinery' }, do: [
                say(MARSH, 'The harvester runs by itself: field, refinery, field. Watch the credits climb. You can also select it and tap a field to send it somewhere else.'),
                { objective: 'harvest' }] },
            { at: { objective: 'refinery' }, delay: 15, do: [
                say(MARSH, 'While it works, build a Barracks. Infantry come out of its door.'),
                { objective: 'barracks' }] },
            { at: { objective: 'barracks' }, do: [
                say(MARSH, 'Train five Riflemen. Tip: select the Barracks and tap the ground to set a rally point for new troops.'),
                { objective: 'riflemen' }] },
            { at: { all: ['riflemen', 'harvest'] }, do: [
                say(VARGA, 'Contact! Hegemony raiders coming in from the east, heading for the base. Select your troops (drag a box, or Select all) and meet them.'),
                { spawn: { team: 'enemy', units: ['trooper', 'trooper', 'trooper', 'skimmer'], at: { x: 40, z: 54 }, attackMove: 'base', tag: 'raid' } },
                { objective: 'raid' }] },
            { at: { objective: 'raid' }, do: [
                say(VARGA, 'Good work. Their raiders came from an outpost in the east. I am marking it on your map. Rocketeers are cleared for you: they crack buildings and armour.'),
                { reveal: { x: 48, z: 45, r: 7 } }, { allow: { team: 'player', add: ['rocketeer'] } }, { credits: { team: 'player', amount: 1000 } },
                { objective: 'outpost' }] },
            { at: { objective: 'raid' }, delay: 12, do: [say(MARSH, 'Gather a squad and attack-move onto the outpost: press A (or the Attack-move button) and tap the target area. They will fight everything on the way.')] },
            { at: { objective: 'outpost' }, do: [say(VARGA, 'The plateau is ours. First light on Kessar, Commander. It will not be the last fight.')] },
        ],
        win: 'objectives', lose: ['noBuildings'],
    };

    // ------------------------------------------------------------------------------------------------
    // 2. Hold the Ridge (Vanguard defence)
    const m2waves = [
        // [time, side, units]
        [40, 'north', ['skimmer', 'skimmer']],
        [75, 'east', ['trooper', 'trooper', 'trooper', 'trooper']],
        [115, 'north', ['trooper', 'trooper', 'shocktrooper', 'skimmer', 'skimmer']],
        [155, 'east', ['lancer', 'trooper', 'trooper', 'shocktrooper']],
        [195, 'north', ['lancer', 'lancer', 'skimmer', 'skimmer', 'trooper']],
        [235, 'east', ['lancer', 'shocktrooper', 'shocktrooper', 'trooper', 'trooper', 'skimmer']],
        [275, 'north', ['phantom', 'phantom', 'lancer', 'trooper', 'trooper']],
        [315, 'east', ['lancer', 'lancer', 'shocktrooper', 'shocktrooper', 'skimmer', 'skimmer']],
        [355, 'north', ['phantom', 'lancer', 'lancer', 'shocktrooper', 'trooper', 'trooper', 'trooper']],
        [395, 'east', ['phantom', 'phantom', 'lancer', 'lancer', 'skimmer', 'skimmer', 'shocktrooper']],
        [435, 'north', ['lancer', 'lancer', 'lancer', 'phantom', 'shocktrooper', 'shocktrooper', 'trooper', 'trooper']],
    ];
    const M2_GATE = { north: { x: 9, z: 22 }, east: { x: 42, z: 57 } };
    const m2 = {
        id: 'm2', title: 'Hold the Ridge', faction: 'vanguard', enemyFaction: 'hegemony', difficulty: 'normal',
        summary: 'Hold the ridge base for eight minutes against Hegemony waves from two directions.',
        briefing: [
            'The Hegemony did not take the loss of their outpost quietly. Their main force is moving on the ridge where we built our forward base, and the dropships carrying our reinforcements are eight minutes out.',
            'They will come from the north pass and along the eastern flats. Expect fast Skimmers first, then Lancer beam tanks, and — if our scouts are right — Phantoms, which you will not see until they are on top of you.',
            'Gun Turrets are your anchor, but they need power: watch the meter, and build Reactors before you build more guns. Hold the ridge, Commander.',
        ],
        map: { seed: 202, size: 64 },
        player: {
            credits: 3000, start: true,
            allow: ['reactor', 'refinery', 'barracks', 'factory', 'radar', 'turret', 'rifleman', 'rocketeer', 'harvester', 'buggy', 'tank'],
            buildings: [
                { type: 'reactor', tx: 10, tz: 57 }, { type: 'refinery', tx: 9, tz: 49 }, { type: 'barracks', tx: 13, tz: 54 },
                { type: 'turret', tx: 9, tz: 45 }, { type: 'turret', tx: 18, tz: 56 }, { type: 'radar', tx: 3, tz: 52, tag: 'comms' },
            ],
            units: [{ type: 'harvester', x: 10.5, z: 53.5 }, { type: 'tank', count: 2, x: 13, z: 50 }, { type: 'rocketeer', count: 2, x: 15, z: 52 }],
        },
        enemy: { credits: 0, ai: null, start: false },
        objectives: [
            { id: 'survive', text: 'Hold the base until the reinforcements land', kind: 'survive', seconds: 480 },
            { id: 'comms', text: 'Keep the Comms Array standing', kind: 'protect', tag: 'comms', optional: true },
        ],
        triggers: [
            { at: 1, do: [say(VARGA, 'Eight minutes, Commander. Waves from the north pass and from the east. Hold the ridge.')] },
            { at: 8, do: [say(MARSH, 'Gun Turrets are unlocked. Every turret drains power: if the meter goes red, turrets and the radar shut down. Reactor first, then guns.')] },
            { at: 30, do: [say(MARSH, 'Skimmers inbound from the north. They are fast and fragile; Riflemen and turrets chew them up.')] },
            ...m2waves.map(([t, side, units], k) => ({
                at: t, do: [{ spawn: { team: 'enemy', units, at: M2_GATE[side], attackMove: 'base', tag: 'wave' + k } }]
                    .concat(k === 3 ? [say(VARGA, 'Lancers in the next group: beam tanks, deadly against armour. Rocketeers and tank shells will stop them.')] : [])
                    .concat(k === 6 ? [say(MARSH, 'Phantoms! Cloaked tanks: you cannot see or target them until they fire or come close to one of ours. Keep turrets in depth.')] : []),
            })),
            { at: 240, do: [say(VARGA, 'Halfway there. The dropships have a fix on your position.'), { credits: { team: 'player', amount: 1500 } }] },
            { at: 420, do: [say(VARGA, 'One minute! Everything they have left is coming.')] },
            { at: { failed: 'comms' }, do: [say(MARSH, 'We lost the Comms Array. No minimap until we build another.')] },
            { at: { objective: 'survive' }, do: [say(VARGA, 'Dropships on the ridge. You held, Commander. Kessar will remember this.')] },
        ],
        win: 'objectives', lose: ['noBuildings'],
    };

    // ------------------------------------------------------------------------------------------------
    // 3. Ghost Protocol (Hegemony stealth)
    // The Vanguard's three outposts share one thin power grid: 3 Reactors (300) feed 3 Comms Arrays (120),
    // 3 Barracks (60) and 6 Gun Turrets (120). Destroy one Reactor and every turret on the map goes dark.
    const outpost = (tag, x, z) => [
        { type: 'radar', tx: x, tz: z, tag },
        { type: 'reactor', tx: x + 4, tz: z - 3, tag: tag + 'Power' },
        { type: 'barracks', tx: x - 5, tz: z - 3 },
        { type: 'turret', tx: x - 2, tz: z + 3 }, { type: 'turret', tx: x + 3, tz: z + 3 },
    ];
    const m3 = {
        id: 'm3', title: 'Ghost Protocol', faction: 'hegemony', enemyFaction: 'vanguard', difficulty: 'normal',
        summary: 'Lead a Phantom strike group across the map unseen and blind the Vanguard comms network.',
        briefing: [
            'Prefect Kesh, the Vanguard hold the southern plateau and the ridge, and they see everything we do through three comms arrays strung across the shard fields.',
            'You will take a Phantom strike group behind their lines. Phantoms are invisible to the enemy unless one of their units or buildings comes within a few paces, or for a moment after they fire. Move, do not attack-move: the cloak holds only while you stay quiet.',
            'Their outposts share one thin power grid. Cut a single reactor and their turrets go dark. Destroy all three arrays, then reach the extraction point in the northwest. The Archon is watching.',
        ],
        map: { seed: 303, size: 64, clear: [{ x: 29, z: 49, r: 5 }, { x: 50, z: 33, r: 5 }, { x: 34, z: 12, r: 5 }] },
        player: {
            credits: 0, start: false, allow: [],
            units: [{ type: 'phantom', count: 4, x: 6, z: 58, tag: 'ghost' }, { type: 'skimmer', count: 2, x: 9, z: 60, tag: 'skimmer' }],
        },
        enemy: {
            credits: 0, ai: null, start: false,
            buildings: [].concat(
                outpost('commsA', 28, 48),
                outpost('commsB', 49, 32),
                outpost('commsC', 33, 11)),
            units: [
                { type: 'rifleman', count: 3, x: 27, z: 46, tag: 'guard' }, { type: 'rocketeer', x: 31, z: 47, tag: 'guard' },
                { type: 'rifleman', count: 2, x: 48, z: 30, tag: 'guard' }, { type: 'rocketeer', x: 51, z: 36, tag: 'guard' },
                { type: 'rifleman', count: 2, x: 32, z: 9, tag: 'guard' }, { type: 'rocketeer', count: 2, x: 36, z: 10, tag: 'guard' }, { type: 'tank', x: 30, z: 14, tag: 'guard' },
                { type: 'buggy', x: 38, z: 40, tag: 'patrol', patrol: [{ x: 38, z: 40 }, { x: 44, z: 22 }, { x: 22, z: 28 }] },
            ],
        },
        objectives: [
            { id: 'commsA', text: 'Destroy the comms array in the south', kind: 'destroy', tag: 'commsA' },
            { id: 'commsB', text: 'Destroy the comms array in the east', kind: 'destroy', tag: 'commsB' },
            { id: 'commsC', text: 'Destroy the comms array in the north', kind: 'destroy', tag: 'commsC' },
            { id: 'extract', text: 'Reach the extraction point (northwest)', kind: 'reach', area: { x: 5, z: 5, r: 3.5 }, hidden: true },
            { id: 'ghosts', text: 'Lose no Phantoms', kind: 'protect', tag: 'ghost', optional: true },
        ],
        triggers: [
            { at: 1, do: [say(KESH, 'Strike group, this is Kesh. Cloaks up. We go in quiet.')] },
            { at: 6, do: [say(VAEL, 'Prefect. Phantoms are hidden while they move. The moment they fire, or an enemy comes within a few paces, they shimmer into view for a breath. Choose your moments.')] },
            { at: 14, do: [say(KESH, 'First array is due east-northeast, past the river of shards. Their reactors feed every turret on the plateau: kill one and the guns go silent. Keep the Skimmers back until we need speed.')] },
            { at: { spotted: 'ghost' }, do: [say(KESH, 'They see us! Break contact: pull back and the cloak returns.')] },
            { at: { destroyed: 'commsAPower' }, do: [say(KESH, 'Reactor down. Their grid is failing: turrets are dark across the plateau.')] },
            { at: { destroyed: 'commsBPower' }, do: [say(KESH, 'Another reactor gone. They are blind and powerless.')] },
            { at: { objective: 'commsA' }, do: [say(KESH, 'South array destroyed. On to the east.')] },
            { at: { objective: 'commsB' }, do: [say(KESH, 'East array is down. One left, in the north.')] },
            { at: { objective: 'commsC' }, do: [say(KESH, 'North array destroyed.')] },
            { at: { all: ['commsA', 'commsB', 'commsC'] }, do: [
                say(VAEL, 'The Vanguard is deaf and blind. Extraction is waiting in the northwest, Prefect. Their hunters are out: do not linger.'),
                { objective: 'extract' }, { reveal: { x: 5, z: 5, r: 5 } },
                { spawn: { team: 'enemy', units: ['buggy', 'buggy', 'tank', 'rocketeer', 'rocketeer'], at: { x: 22, z: 6 }, attackMove: { x: 30, z: 30 }, tag: 'hunters' } }] },
            { at: { lost: 'ghost' }, do: [say(KESH, 'We lost a Phantom. Stay out of their reach.')] },
            { at: { objective: 'extract' }, do: [say(VAEL, 'Well done, Prefect. Now the real offensive begins.')] },
        ],
        win: 'objectives', lose: ['noUnits'],
    };

    // ------------------------------------------------------------------------------------------------
    // 4. Breakthrough (Hegemony assault)
    const m4 = {
        id: 'm4', title: 'Breakthrough', faction: 'hegemony', enemyFaction: 'vanguard', difficulty: 'normal',
        summary: 'Build a base and break the fortified Vanguard stronghold before its Orbital Uplink fires.',
        briefing: [
            'With their comms down, the Vanguard have pulled back into a fortress on the northern shard fields: turrets on every approach, artillery behind the walls.',
            'Worse, they are bringing an Orbital Uplink online. When it charges it will call down the Orbital Lance, a beam from orbit that burns through anything under it. Our estimate: about eight minutes.',
            'Build your base, Prefect. Skimmers can reach the uplink early if you are bold; Phantoms can slip past the turrets. Then bring everything down on them.',
        ],
        map: { seed: 404, size: 64 },
        player: { credits: 5000, start: true },
        enemy: {
            credits: 4000, ai: 'normal', start: true,
            buildings: [
                { type: 'reactor', tx: 51, tz: 4 }, { type: 'reactor', tx: 51, tz: 10 }, { type: 'reactor', tx: 60, tz: 9 }, { type: 'refinery', tx: 46, tz: 8 },
                { type: 'barracks', tx: 55, tz: 11 }, { type: 'factory', tx: 59, tz: 12 }, { type: 'radar', tx: 61, tz: 3 },
                { type: 'techlab', tx: 47, tz: 3 }, { type: 'uplink', tx: 60, tz: 0, tag: 'uplink', delay: 240 },
                { type: 'turret', tx: 49, tz: 15 }, { type: 'turret', tx: 54, tz: 17 }, { type: 'turret', tx: 44, tz: 12 }, { type: 'turret', tx: 58, tz: 18 },
            ],
            units: [{ type: 'artillery', count: 2, x: 53, z: 8 }, { type: 'tank', count: 3, x: 50, z: 14 }, { type: 'harvester', x: 47, z: 13 }],
        },
        objectives: [
            { id: 'destroy', text: 'Destroy every Vanguard structure', kind: 'destroyAll' },
            { id: 'uplink', text: 'Destroy the Orbital Uplink before it fires', kind: 'destroy', tag: 'uplink', optional: true, failOn: 'enemySuperweapon' },
        ],
        triggers: [
            { at: 1, do: [say(KESH, 'Their fortress is in the northeast. Build fast; that uplink will not wait for us.')] },
            { at: 20, do: [say(VAEL, 'Lancers break armour, Shock Troopers break walls, Pulse Spires hold your ground. Phantoms need a Tech Lab.')] },
            { at: 240, do: [say(KESH, 'Their uplink has started charging. Four minutes, maybe less.')] },
            { at: 420, do: [say(KESH, 'The uplink is almost charged! Spread out your forces: one strike must not catch them all.')] },
            { at: { failed: 'uplink' }, do: [say(VAEL, 'The Lance has fired. It will fire again. End this, Prefect.')] },
            { at: { objective: 'uplink' }, do: [say(KESH, 'The uplink is burning! Their sky is closed.')] },
            { at: { objective: 'destroy' }, do: [say(VAEL, 'The northern fields are ours. Kessar bends.')] },
        ],
        win: 'objectives', lose: ['noBuildings'],
    };

    // ------------------------------------------------------------------------------------------------
    // 5. Shardfall (Vanguard finale)
    const m5 = {
        id: 'm5', title: 'Shardfall', faction: 'vanguard', enemyFaction: 'hegemony', difficulty: 'hard',
        summary: 'The final battle on a large map against the full Hegemony war machine and its Rift Silo.',
        briefing: [
            'The Hegemony broke through in the north. Now they are raising a Rift Silo over the great central field: a missile that collapses space itself. If it fires on the spires, the shard fields of Kessar die with them.',
            'This is everything, Commander. Every unit we have, an Orbital Uplink of our own, and the largest battlefield yet. Their Archon commands in person, and she does not make mistakes.',
            'Destroy every Hegemony structure on the map. Shardfall ends today, one way or the other.',
        ],
        map: { seed: 505, size: 80 },
        autoTag: { riftsilo: 'silo' },   // any Rift Silo the enemy builds gets the 'silo' tag
        player: { credits: 6000, start: true },
        enemy: { credits: 4000, ai: 'hard', start: true },
        objectives: [
            { id: 'destroy', text: 'Destroy every Hegemony structure', kind: 'destroyAll' },
            { id: 'uplink', text: 'Build an Orbital Uplink', kind: 'build', type: 'uplink', optional: true },
            { id: 'silo', text: 'Destroy the Rift Silo', kind: 'destroy', tag: 'silo', optional: true, hidden: true },
        ],
        triggers: [
            { at: 1, do: [say(VARGA, 'All units, this is Varga. This is the last field on Kessar. Make it count.')] },
            { at: 15, do: [say(MARSH, 'The Tech Lab unlocks the Orbital Uplink. It needs serious power, and it takes four minutes to charge once it is up.')] },
            { at: 240, do: [say(VARGA, 'Hegemony Skimmers are hunting our harvesters. Keep a squad near the fields.')] },
            { at: { superReady: 'player' }, do: [say(MARSH, 'The Orbital Lance is charged! Pick a target on ground we have explored.')] },
            { at: { superReady: 'enemy' }, do: [say(VARGA, 'Their Rift Bomb is armed. Do not bunch up!')] },
            { at: { objective: 'uplink' }, do: [say(MARSH, 'Uplink online. The Lance will be ready in four minutes.')] },
            { at: { seen: 'silo' }, do: [say(VARGA, 'There it is: the Rift Silo. Take it down and their worst weapon dies with it.'), { objective: 'silo' }] },
            { at: { objective: 'destroy' }, do: [say(VARGA, 'It is over. The shard fields are safe. Well done, Commander.')] },
        ],
        win: 'objectives', lose: ['noBuildings'],
    };

    SF.MISSIONS = [m1, m2, m3, m4, m5];
})();
