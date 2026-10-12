#!/usr/bin/env node
/**
 * StudForge knowledge miner: turns the open Rebrickable database dumps into
 * `public/studforge/data/knowledge.json`, the design knowledge base the
 * generator and the Claude idea route can consult ("what parts and colours does
 * a real fire truck use, and how big is one?").
 *
 * Usage
 *   node scripts/studforge-mine-knowledge.mjs --data <dir> [--out public/studforge/data/knowledge.json] [--check] [--dump file]
 *
 *   <dir> must hold the gzipped CSV dumps from https://rebrickable.com/downloads/
 *   (sets, inventories, inventory_parts, parts, colors, themes, part_categories).
 *   They are NOT kept in the repo; download them to a scratch directory:
 *     for f in sets inventories inventory_parts parts colors themes part_categories; do
 *       curl -sSL -o $f.csv.gz https://cdn.rebrickable.com/media/downloads/$f.csv.gz; done
 *   --check also prints, for every id in our parts catalog, the Rebrickable name,
 *   so naming or id mix-ups in parts-catalog.js show up. --dump writes the set
 *   names each subject matched, to audit the name regexes below.
 *
 * Only open inventory data is used (which parts, in which colours, in which
 * sets). No instructions or images are read or copied. The downloads are
 * treated as untrusted text: they are parsed, never executed.
 *
 * Output schema (public/studforge/data/knowledge.json)
 *   {
 *     generated: ISO timestamp, sources: note, setsUsed: n,
 *     subjects: {
 *       fireTruck: {
 *         keys:     ['fire truck', 'fire engine', ...]      prompt keywords the loader matches on
 *         n:        number of real sets behind the numbers
 *         themes:   ['City', 'Town', ...]                    top root themes of those sets
 *         years:    [first, last]
 *         parts:    [[ourPartId, setShare, medianQty], ...] top 50 parts of OUR catalog, by share of sets using them
 *         wanted:   [[partNum, name, setShare], ...]        top 20 common parts we do NOT have (what to add next)
 *         palette:  [[colorId, share], ...]                 top 8 of our colour ids, mean share of pieces per set
 *         pieces:   { p25, p50, p75 }                       piece-count percentiles (set size calibration)
 *         longest:  median of the longest brick/plate in a set (studs), a footprint hint
 *         examples: [[setNum, name], ...]                   three real sets, for the docs
 *       }, ...
 *     },
 *     pairings:  [[idA, idB, lift, sets], ...]   catalog parts that co-occur in inventories far more than chance
 *     wheelTyre: [[wheelPartNum, tyrePartNum, share, sets], ...]  which tyre goes on which wheel, from real sets
 *     names:     { partNum: name }               names for the wheel/tyre part numbers above
 *   }
 *   Shares are rounded to 2–3 decimals; "setShare" = fraction of the subject's sets whose inventory holds the part.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import readline from 'node:readline';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dataDir = opt('--data', null);
const outFile = path.resolve(root, opt('--out', 'public/studforge/data/knowledge.json'));
const doCheck = args.includes('--check');
const dumpFile = opt('--dump', null);
if (!dataDir) { console.error('usage: node scripts/studforge-mine-knowledge.mjs --data <dir with rebrickable *.csv.gz> [--out file] [--check]'); process.exit(2); }

/* ── our catalog and colours ─────────────────────────────────────────── */
const jsDir = path.join(root, 'public/studforge/js/');
const ctx = { console, Math, Object, Array, Set, Map, Number, JSON, String, Error };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['colors.js', 'parts-catalog.js']) vm.runInContext(fs.readFileSync(jsDir + f, 'utf8'), ctx, { filename: f });
const CATALOG = ctx.LEGO_PARTS;
const OUR_IDS = new Set(Object.keys(CATALOG));
// Our catalog uses BrickLink design ids where Rebrickable keys the same mould differently, and one id per
// shape where Rebrickable separates old and current moulds (cone with/without top groove, jumper, clips).
const ALIAS = { 6141: '4073', 85861: '4073', 38340: '55423', 2879: '55423', 59900: '59900', 3794: '15573', 60897: '4085', 15712: '2555', 87697: '6015', 60700: '6015' };

// Rebrickable colour id → our LEGO_COLORS key. Shades we do not stock map to the nearest we do;
// anything not listed is left out of the palettes (it still counts in the denominator).
const COLOR_MAP = {
    0: 'BLACK', 15: 'WHITE', 71: 'LIGHT_GREY', 7: 'LIGHT_GREY', 179: 'LIGHT_GREY', 80: 'LIGHT_GREY', 135: 'LIGHT_GREY',
    72: 'DARK_GREY', 8: 'DARK_GREY', 1103: 'DARK_GREY', 148: 'DARK_GREY',
    4: 'RED', 1050: 'RED', 14: 'YELLOW', 226: 'YELLOW', 191: 'YELLOW',
    1: 'BLUE', 73: 'BLUE', 212: 'BLUE', 322: 'BLUE', 321: 'BLUE', 3: 'BLUE', 323: 'BLUE',
    272: 'DARK_BLUE', 379: 'DARK_BLUE',
    2: 'GREEN', 288: 'GREEN', 10: 'GREEN', 378: 'GREEN', 326: 'GREEN',
    27: 'LIME', 25: 'ORANGE', 484: 'ORANGE',
    70: 'BROWN', 308: 'BROWN', 6: 'BROWN',
    19: 'TAN', 28: 'TAN', 84: 'TAN', 78: 'TAN',
    320: 'DARK_RED', 29: 'PINK', 5: 'PINK', 31: 'PINK', 26: 'PURPLE', 85: 'PURPLE', 30: 'PURPLE',
    297: 'GOLD', 297.1: 'GOLD',
    47: 'TRANS_CLEAR', 40: 'TRANS_CLEAR', 41: 'TRANS_BLUE', 33: 'TRANS_BLUE', 36: 'TRANS_RED',
    182: 'TRANS_ORANGE', 46: 'TRANS_ORANGE', 57: 'TRANS_ORANGE',
};
for (const key of Object.values(COLOR_MAP)) if (!ctx.LEGO_COLORS[key]) throw new Error('unknown colour key ' + key);

/* ── subjects: how a real set's name maps to a prompt subject ────────────── */
// `must`: every regex has to match the lowercased set name; `not`: none may; `themes`: the set must sit
// under one of these Rebrickable theme ids (any ancestor), `notThemes`: must not; `solo`: skip "X with Y"
// playset names so the set IS the subject; `keys`: the prompt words the browser loader uses.
const R = (s) => new RegExp(s, 'i');
const SUBJECTS = {
    fireTruck: { keys: ['fire truck', 'fire engine', 'firetruck', 'ladder truck', 'fire brigade'], must: [R('\\bfire\\b'), R('\\b(truck|engine|ladder|tanker|lorry|unit|response|4x4|rescue vehicle|utility|hazard)\\b')], not: [R('station|plane|helicopter|chopper|boat|ship|headquarters|\\bhq\\b|dragon|temple|camp|balloon|jet|nation|bike|motorcycle|atv|quad|robot|mech|stunt|ring of fire|pizza|race car|rides|challenge|vs\\.')] },
    policeCar: { keys: ['police car', 'police', 'cop car', 'patrol car', 'squad car'], must: [R('\\bpolice\\b'), R('\\b(car|cruiser|pursuit|patrol|interceptor|chase|4x4|suv|vehicle|getaway|escape)\\b')], not: [R('station|helicopter|chopper|plane|boat|truck|van\\b|\\bhq\\b|headquarters|dog|motorcycle|bike|prison|command|space|hover|mobile|crane|train|sky|jet|drone|driller|bank|garage|buggy|monster')], notThemes: [363] },
    ambulance: { keys: ['ambulance', 'medic'], must: [R('\\bambulance\\b')], not: [R('helicopter|plane|station|hospital')] },
    car: { keys: ['car', 'sports car', 'race car', 'racing car', 'racer', 'roadster', 'supercar', 'convertible', 'coupe', 'hot rod', 'muscle car', 'sedan', 'taxi', 'limousine', 'limo'], must: [R('\\b(sports car|race car|racer|racing car|roadster|supercar|hot rod|muscle car|convertible|coupe|coup\u00e9|speedster|dragster|cabriolet|gt\\b|rally car|formula|f1|stock car|taxi|limousine|sedan)')], not: [R('truck|bus\\b|train|plane|boat|carrier|transporter|duplo|racers? pack|space|star|ninjago|pull back|pull-back|monster|kart|speed boat|jet')] },
    truck: { keys: ['truck', 'lorry', 'pickup', 'pickup truck', 'semi', 'tow truck', 'dump truck', 'big rig', 'delivery truck', 'van'], must: [R('\\b(truck|lorry|pickup|pick-up|semi|hauler|transporter|tow truck|dump truck|tipper|big rig|delivery van|camper van|\\bvan\\b)')], not: [R('fire|police|monster|ice cream|food|garbage|recycling|space|duplo|tank\\b|ninjago|chima|star wars|stunt|racing truck|tow truck trouble|train|wagon|hulk|vs\\.|santa|showdown|spidey|spider')] },
    monsterTruck: { keys: ['monster truck', 'stunt truck', 'big wheels', 'off-roader', 'offroader', '4x4'], must: [R('monster truck|stunt truck|big wheel|4 ?x ?4 off-?roader|off-?roader')], not: [R('duplo')] },
    garbageTruck: { keys: ['garbage truck', 'recycling truck', 'trash truck', 'bin lorry'], must: [R('garbage|recycling|refuse|rubbish|trash')], not: [R('duplo')] },
    bus: { keys: ['bus', 'school bus', 'coach', 'double decker', 'double-decker', 'minibus', 'camper'], must: [R('\\bbus\\b|\\bcoach\\b|double-?decker|\\bcamper\\b')], not: [R('bus stop|duplo|space|station')] },
    tractor: { keys: ['tractor', 'farm vehicle', 'combine', 'harvester'], must: [R('\\btractor\\b|\\bharvester\\b|\\bcombine\\b')], not: [R('duplo|pull|technic')] },
    construction: { keys: ['excavator', 'digger', 'bulldozer', 'crane', 'loader', 'cement mixer', 'forklift', 'backhoe', 'steamroller', 'construction vehicle', 'construction'], must: [R('\\b(excavator|digger|bulldozer|crane|loader|dozer|cement mixer|forklift|backhoe|roller|construction)\\b')], not: [R('duplo|ninjago|chima|crane truck\\b.*fire|space|train crane')] },
    motorcycle: { keys: ['motorcycle', 'motorbike', 'bike', 'scooter', 'chopper', 'dirt bike', 'quad bike', 'atv'], must: [R('\\b(motorcycle|motorbike|motor ?bike|scooter|quad bike|atv|dirt bike|bike)\\b')], not: [R('helicopter|duplo|bmx|mountain bike|bike shop|speeder|space|hover|ninja|chima|water|jet')] },
    train: { keys: ['train', 'locomotive', 'steam train', 'steam engine', 'freight train', 'passenger train', 'railway', 'tram', 'monorail', 'bullet train', 'engine'], must: [R('\\b(train|locomotive|loco|steam engine|freight|railway|tram|monorail|express|railroad)\\b')], not: [R('track|station|crossing|straight|curved|switch|rails|duplo|trainer|training|signal|wagon only|level|tunnel|bridge')] },
    plane: { keys: ['plane', 'airplane', 'aeroplane', 'jet', 'airliner', 'aircraft', 'biplane', 'seaplane', 'glider', 'fighter jet', 'cargo plane', 'bomber', 'stunt plane', 'jumbo jet'], must: [R('\\b(plane|airplane|aeroplane|jet|airliner|aircraft|biplane|seaplane|glider|cargo plane|bomber|stunt plane|airbus|boeing|cessna|propeller plane|air racer)\\b')], not: [R('jet ?ski|jet-?ski|jetpack|jet-?pack|space|star|starfighter|tie|x-wing|duplo|hover|ninja|chima|plane crazy|airport|hangar|jet boat|water')] },
    helicopter: { keys: ['helicopter', 'chopper', 'heli', 'copter', 'gyrocopter', 'quadcopter', 'drone'], must: [R('\\b(helicopter|heli|copter|gyrocopter|quadcopter|chopper|rotorcraft)\\b')], not: [R('motorcycle|motorbike|duplo|space|chima|ninja')] },
    boat: { keys: ['boat', 'speedboat', 'yacht', 'ferry', 'tugboat', 'tug', 'dinghy', 'sailboat', 'fishing boat', 'lifeboat', 'catamaran', 'hovercraft', 'raft', 'jet ski'], must: [R('\\b(boat|yacht|ferry|tug|tugboat|dinghy|speedboat|lifeboat|catamaran|sailboat|hovercraft|raft|jet ?ski|jetski|watercraft|sailing)\\b')], not: [R('space|star|pirat|duplo|ninja|chima|boat (shop|house|shed)|house ?boat|galleon|rowboat only')] },
    ship: { keys: ['ship', 'cargo ship', 'cruise ship', 'ocean liner', 'freighter', 'warship', 'battleship', 'frigate', 'container ship', 'vessel', 'steamship'], must: [R('\\b(ship|galleon|liner|freighter|cargo ship|vessel|frigate|warship|battleship|steamship|container ship|icebreaker)\\b')], not: [R('space|star|airship|spaceship|starship|friendship|duplo|ninja|chima|pirat|shipwreck|shipment|flagship|championship|ship(ping|yard)|dragon|drop ship|troop|mothership|command ship|gunship')], notThemes: [158, 126] },
    pirateShip: { keys: ['pirate ship', 'pirate', 'galleon', 'buccaneer', 'corsair', 'privateer'], must: [R('pirat|galleon|buccaneer|corsair|black seas|brick bounty|barracuda|skull'), R('ship|galleon|boat|sloop|bounty|barracuda|flagship|brig|schooner|cutter|clipper')], not: [R('space|duplo|ninja|chima|caribbean|starship|spaceship')] },
    submarine: { keys: ['submarine', 'sub', 'u-boat', 'deep sea', 'bathyscaphe'], must: [R('\\b(submarine|sub|u-boat|submersible)\\b')], not: [R('duplo|ninja|chima|sub-?zero|subway|substation|sandwich')] },
    spaceship: { keys: ['spaceship', 'space ship', 'starship', 'starfighter', 'star fighter', 'space fighter', 'space shuttle', 'shuttle', 'space cruiser', 'speeder', 'tie fighter', 'x-wing', 'flying saucer', 'ufo', 'space'], must: [R('\\b(spaceship|space ship|starship|starfighter|star fighter|shuttle|cruiser|fighter|interceptor|x-wing|tie|y-wing|a-wing|falcon|speeder|explorer|galaxy|cosmic|saucer|ufo|space craft|spacecraft|scout|transport|destroyer|frigate|corvette|gunship|bomber|microfighter|starfighter)\\b')], not: [R('rover|lander|base|station|crawler|walker|at-?at|at-?st|duplo|ninja|chima|airport|police car|dinosaur|jurassic|tank\\b|bike')], themes: [126, 158, 793, 302, 389, 146, 137, 127] },
    rocket: { keys: ['rocket', 'launch pad', 'space rocket', 'moon rocket', 'saturn v', 'spaceport', 'launch'], must: [R('\\b(rocket|launch|spaceport|space port|saturn v|launchpad|launch pad)\\b')], not: [R('duplo|rocket racer|fire ?work|pocket|rocket ride|rocket car|rocket boy|sprocket|bike|ski|kart|sled|pack')] },
    rover: { keys: ['rover', 'moon buggy', 'mars rover', 'lunar rover', 'buggy', 'crawler'], must: [R('\\b(rover|buggy|crawler|moon buggy|mars)\\b')], not: [R('duplo|land rover|range rover|dune buggy|beach buggy')] },
    spaceStation: { keys: ['space station', 'moon base', 'lunar base', 'space base', 'outpost', 'orbital station'], must: [R('space station|moon base|lunar base|lunar space station|space base|outpost|space centre|space center|mars base|orbital')], not: [R('duplo')] },
    robot: { keys: ['robot', 'mech', 'mecha', 'droid', 'walker', 'exo-suit', 'exosuit', 'battle mech', 'giant robot', 'android', 'bot'], must: [R('\\b(robot|mech|mecha|droid|walker|exo-?suit|exosuit|battle suit|robo|bot)\\b')], not: [R('duplo|droid fighter|droid gunship|droid starfighter|droideka|tank|ninjago?.{0,40}dragon|robot chicken|robot arm|tie|at-?at|at-?st')] },
    tank: { keys: ['tank', 'armored vehicle', 'armoured vehicle', 'apc', 'artillery', 'military vehicle'], must: [R('\\btank\\b|\\bapc\\b|artillery|armou?red vehicle|battle tank')], not: [R('tank engine|tanker|fish tank|water tank|gas tank|tank truck|tank top|oil tank|fuel tank|duplo|shark tank|dunk')] },
    house: { keys: ['house', 'cottage', 'villa', 'home', 'bungalow', 'cabin', 'mansion', 'townhouse', 'apartment', 'chalet', 'hut', 'log cabin', 'farmhouse', 'beach house'], must: [R('\\b(house|cottage|villa|home|bungalow|cabin|mansion|townhouse|town house|apartment|chalet|farmhouse|hut|lodge|residence|bungalow)\\b')], not: [R('treehouse|tree house|doll|lighthouse|haunted|ghost|playhouse|warehouse|clubhouse|greenhouse|courthouse|boathouse|duplo|dog ?house|bird ?house|doghouse|coffee house|house boat|houseboat|house of|brick house \\(|nightmare|holiday home\\b.*vote|power house|home alone|homer|cabin crew|hut hut|pizza hut|home office|mobile home|fire house|firehouse|monster|lighthouse|frighthouse|opera|creel|gabby|bluey|dollhouse|doll house|white house|parliament')], notThemes: [252] },
    castle: { keys: ['castle', 'fortress', 'fort', 'stronghold', 'citadel', 'palace', 'chateau', 'keep', 'medieval', 'knight'], must: [R('\\b(castle|fortress|fort|stronghold|citadel|chateau|palace|keep|outpost)\\b'), R('castle|fortress|fort|stronghold|citadel|chateau|palace|keep|outpost')], not: [R('space|bouncy|sand ?castle|nexo|duplo|elves|disney|frozen|ice castle|princess|cinderella|ariel|belle|castle tower bridge|fort knox|comfort|fortune|effort|forty|fortress of solitude|bowser|cinema|mickey|defenders|siege|attack|ambush|battle|chase|escape')], notThemes: [252] },
    tower: { keys: ['tower', 'skyscraper', 'clock tower', 'bell tower', 'watchtower', 'water tower', 'obelisk', 'tall building', 'high-rise'], must: [R('\\b(tower|skyscraper|watchtower|water tower|clock tower|high-?rise|obelisk|minaret|pagoda)\\b')], not: [R('duplo|tower bridge|tower crane|tow truck|power|towering|control tower|air traffic|shower')] },
    lighthouse: { keys: ['lighthouse', 'light house', 'beacon'], must: [R('lighthouse|light house')], not: [R('duplo')] },
    windmill: { keys: ['windmill', 'wind mill', 'wind turbine', 'mill'], must: [R('windmill|wind mill|wind turbine|watermill|water mill|\\bmill\\b')], not: [R('duplo|million|miller')] },
    bridge: { keys: ['bridge', 'viaduct', 'footbridge', 'drawbridge'], must: [R('\\bbridge\\b|viaduct|drawbridge')], not: [R('duplo|star trek|captain|command bridge|abridged')] },
    shop: { keys: ['shop', 'store', 'bakery', 'cafe', 'café', 'restaurant', 'pizzeria', 'diner', 'market', 'kiosk', 'stand', 'grocery', 'boutique', 'hotel', 'supermarket', 'pub', 'bar', 'coffee shop', 'ice cream shop', 'pet shop', 'toy store', 'book shop'], must: [R('\\b(shop|store|bakery|cafe|caf\u00e9|restaurant|pizzeria|diner|market|kiosk|grocery|boutique|hotel|supermarket|pub|bistro|parlou?r|salon|pharmacy|bookshop|book shop|newsstand|food stand|food cart|food truck|ice cream (shop|parlou?r|stand|cart|truck)|burger|pizza|donut|coffee)\\b')], not: [R('workshop|bus stop|duplo|ninja|chima|store room|shopping bag|brick store|lego store|accessory|shopping cart|tool store|hand cart')] },
    station: { keys: ['fire station', 'police station', 'headquarters', 'hq', 'garage', 'workshop', 'depot', 'firehouse', 'station', 'hangar', 'airport'], must: [R('fire station|police station|headquarters|\\bhq\\b|garage|workshop|depot|firehouse|fire house|fire hq|police hq|hangar|airport|train station|railway station|bus station|gas station|petrol station|service station')], not: [R('duplo|space station|ninja|chima|mini|micro|spidey|spider|mobile|container truck|security squad|tree house')] },
    farm: { keys: ['farm', 'barn', 'stable', 'ranch', 'cowshed', 'hay', 'farmyard', 'chicken coop', 'pigsty'], must: [R('\\b(farm|barn|stable|ranch|cowshed|hay|farmyard|coop|pigsty|pigpen|orchard|vineyard|greenhouse)\\b')], not: [R('duplo|farmhouse|stable boy|farm tractor|farm vehicle|windmill|animal farm pack')] },
    tree: { keys: ['tree', 'trees', 'forest', 'woods', 'treehouse', 'tree house', 'oak', 'pine', 'palm', 'pine tree', 'palm tree', 'cherry tree', 'bonsai', 'christmas tree', 'jungle'], must: [R('\\btrees?\\b|\\bforest\\b|treehouse|tree house|\\bbonsai\\b|\\boak\\b|\\bpine\\b|\\bpalm\\b|\\borchard\\b')], not: [R('duplo|street|freestyle|three|treebeard|ent\\b|cruiser|boat|atv|dragster|camp|playground|forbidden|\\bhq\\b|buggy|truck|car\\b|plane|helicopter|bike|racer|chase|rescue|explorer|mech|dragon|temple|ruins|battle|escape|hideout|lair|fortress|spidey|spider')] },
    flower: { keys: ['flower', 'flowers', 'bouquet', 'rose', 'roses', 'tulip', 'orchid', 'plant', 'cactus', 'succulent', 'lily', 'sunflower', 'daisy', 'blossom', 'wreath', 'bonsai', 'garden'], must: [R('\\b(flower|flowers|bouquet|rose|roses|tulip|tulips|orchid|plant|plants|cactus|succulent|lily|lilies|sunflower|daisy|daisies|blossom|wreath|bonsai|lotus|poppy|hibiscus|chrysanthemum|dahlia|peony|lavender|garden)\\b')], not: [R('duplo|planet|power plant|plant guy|plants vs|rosebud|rose(tta|wood)|rosie|flower girl|garden shed|garden house|gardening')] },
    dragon: { keys: ['dragon', 'wyvern', 'drake', 'wyrm', 'fire dragon'], must: [R('\\bdragons?\\b|wyvern|\\bdrake\\b')], not: [R('duplo|dragon ?fly|snapdragon|komodo|dragon ball|dragon boat|chariot|hunter|vehicles|dungeons|dragon (racer|car|bike|truck|ship|boat|rider|pit|cave|den)')] },
    dinosaur: { keys: ['dinosaur', 'dino', 't-rex', 't rex', 'tyrannosaurus', 'raptor', 'velociraptor', 'triceratops', 'stegosaurus', 'pterodactyl', 'pteranodon', 'brachiosaurus', 'spinosaurus', 'ankylosaurus', 'jurassic'], must: [R('\\b(dinosaurs?|dino|t\\.? ?rex|t-rex|tyrannosaurus|raptor|velociraptor|triceratops|stegosaurus|pterodactyl|pteranodon|brachiosaurus|indominus|spinosaurus|ankylosaurus|dilophosaurus|carnotaurus|baryonyx|giganotosaurus|therizinosaurus|quetzalcoatlus|mosasaurus|dimorphodon|atrociraptor|pyroraptor|allosaurus|apatosaurus|brontosaurus|diplodocus|indoraptor|fossil)\\b')], not: [R('duplo|ninja|chima|raptor squad|dino ?trux|dinotrux|chase|rescue|battle|robo|hunter|trapper|\\bhq\\b|tracker|buggy|atv|defense|escape|breakout|transport|truck|helicopter|attack|ambush|rampage|lab\\b|outpost|mission|exhibition|spidey|spider|vehicle|crawler|mech|jet|boat|car\\b|racer|island|park')], notThemes: [602, 722, 620, 274, 481, 385] },
    animal: { solo: true, keys: ['animal', 'dog', 'cat', 'horse', 'pony', 'puppy', 'kitten', 'lion', 'tiger', 'elephant', 'giraffe', 'bear', 'panda', 'monkey', 'rabbit', 'bunny', 'fox', 'wolf', 'deer', 'zebra', 'hippo', 'rhino', 'koala', 'kangaroo', 'sloth', 'pig', 'cow', 'sheep', 'goat', 'hamster', 'squirrel', 'hedgehog', 'turtle', 'tortoise', 'frog', 'snake', 'crocodile', 'alligator', 'lizard', 'gecko', 'unicorn', 'camel', 'donkey', 'llama', 'alpaca', 'mouse', 'pet'], must: [R('\\b(dog|dogs|cat|cats|horse|horses|pony|ponies|puppy|puppies|kitten|lion|tiger|elephant|giraffe|bear|bears|panda|monkey|rabbit|bunny|fox|wolf|wolves|deer|zebra|hippo|rhino|koala|kangaroo|sloth|pig|piglet|cow|sheep|lamb|goat|hamster|squirrel|hedgehog|turtle|tortoise|frog|snake|crocodile|alligator|lizard|gecko|unicorn|camel|donkey|llama|alpaca|mouse|chameleon|gorilla|leopard|cheetah|jaguar|polar bear|penguin|otter|beaver|raccoon|reindeer|moose|yak|ox|bull|axolotl)\\b')], not: [R('duplo|hot dog|dog house|doghouse|cat ?walk|catapult|catamaran|cat burglar|bear(ing)?s? (grylls)|teddy|horsepower|horse box|pig(ment|eon)|cow(boy|girl)|the lego movie|ninjago|chima|batman|catwoman|wolverine|black panther|rocket|fox (news)|robin|bat\\b|lion king|bear hug|iron horse|dark horse|bull ?dozer|zoo ?keeper|animal crossing|minecraft|mighty|puppy pals|catapult|wolf pack|cat eye|lion knights|wolfpack|black ?cat|tiger shark|iron|cat cafe|cat caf\u00e9|pet shop|pet store|vet clinic|veterinary|horse trailer|horse transporter|stable|farm|ranch|rescue|chase|carriage|police|fire|unit|truck|van\\b|trailer|transport|hospital|clinic|cafe|caf\u00e9|shop|hotel|camper|holiday|safari|zoo|park|race|racer|ride|show|club|academy|house|room|bedroom|camp|mech|plane|locomotive|jet|motor|car\\b|bike|dragster|cruiser|sopwith|e-type|jaguar e|mickey|minnie|witch|zone|target|practice|warrior|monkey king|king\\b|hero|hedgehog –|sonic|mech|knight|express|flyer|wagon|coach|boat|ship|sub\\b')] },
    bird: { solo: true, keys: ['bird', 'parrot', 'owl', 'eagle', 'penguin', 'flamingo', 'duck', 'chicken', 'hen', 'rooster', 'swan', 'toucan', 'peacock', 'hummingbird', 'macaw', 'pigeon', 'seagull', 'crow', 'raven', 'hawk', 'robin', 'sparrow', 'blue jay', 'kingfisher', 'kiwi', 'ostrich', 'puffin'], must: [R('\\b(bird|birds|parrot|owl|eagle|penguin|flamingo|duck|ducks|chicken|hen|rooster|swan|toucan|peacock|hummingbird|macaw|pigeon|seagull|crow|raven|hawk|sparrow|blue jay|kingfisher|kiwi|ostrich|puffin|pelican|stork|crane bird|cockatoo|budgie|parakeet|goose|turkey|vulture|condor|woodpecker)\\b')], not: [R('duplo|birdhouse|bird house|angry birds|hawk(eye|moth)|falcon|owl(et)?s? post|black hawk|star wars|batman|robin\\b|crow(bar|n)|eagle(s)? (nest|squad)|duck ?tales|nighthawk|seahawk|mighty eagle|turkey (sandwich|dinner)|chicken (coop|run|shop|house|truck|nugget|suit|wing)|pet shop|penguin (gift|king|patrol)|\'s\\b|droid|star hawk|boat|ship|try bird|jet|plane|racer|car\\b|mech')] },
    seaCreature: { solo: true, keys: ['shark', 'whale', 'dolphin', 'octopus', 'squid', 'fish', 'crab', 'lobster', 'seahorse', 'jellyfish', 'stingray', 'manta ray', 'orca', 'narwhal', 'seal', 'walrus', 'sea creature', 'sea turtle', 'clownfish', 'goldfish', 'koi', 'angler fish', 'piranha'], must: [R('\\b(shark|sharks|whale|whales|dolphin|octopus|squid|fish|crab|lobster|seahorse|jellyfish|stingray|manta|orca|narwhal|seal|walrus|sea creature|sea turtle|clownfish|goldfish|koi|anglerfish|angler fish|piranha|kraken|sea monster|starfish|eel|swordfish|marlin|nemo|dory)\\b')], not: [R('duplo|fishing|fish ?and ?chips|catfish|fisherman|jellyfish (lamp)|shark (tank|attack|rescue|cage|boat|ship)|seal(ed|ing)|navy seal|sharknado|land shark|crab(by)?s? (claw|cake)|fish (shop|market|store|stand|tank|bowl|truck|van)|sealed|seashell|dolphin (cruiser|rescue)|\\bsub\\b|scout|spy|cave|stormer|point|dark shark|sky|bomber|attack|strike|dr\\.|doctor|ride|rock|cove|venom|ogel|mutant|mech|bike|car\\b|jet|boat|ship|racer|chase|rescue')] },
    insect: { solo: true, keys: ['bee', 'butterfly', 'spider', 'beetle', 'ant', 'ladybug', 'ladybird', 'dragonfly', 'scorpion', 'moth', 'caterpillar', 'bug', 'wasp', 'grasshopper', 'mantis', 'insect', 'firefly', 'snail', 'worm'], must: [R('\\b(bee|bees|butterfly|butterflies|spider|spiders|beetle|ant|ants|ladybug|ladybird|dragonfly|scorpion|moth|caterpillar|bug|bugs|wasp|grasshopper|mantis|insect|insects|firefly|snail|worm|cricket|hornet|tarantula|bumblebee|honeybee|cockroach|centipede|millipede)\\b')], not: [R('duplo|spider-?man|spidey|spider man|ant-?man|antman|bumblebee transformer|beetlejuice|worm hole|wormhole|bookworm|bee(hive)? (house)|bugatti|hornet (jet|plane)|moth(er)|crickets? (bat)|the bug|bug catcher|ladybug house|insect house|bee house|scorpion (king|car|tank|bike|mech|stinger)|black widow|spider (tank|mech|bike|crawler|droid|suit)|wasp (jet|plane)|bee (hive|house|car|racer|farm|keeper|truck)|volkswagen|\\bvw\\b|^bumblebee$|detector|scout|water spider|shop|beauty|mech|jet|car\\b|racer|bike|tank')] },
    food: { solo: true, keys: ['food', 'cake', 'birthday cake', 'burger', 'hamburger', 'cheeseburger', 'pizza', 'donut', 'doughnut', 'ice cream', 'hot dog', 'cupcake', 'sushi', 'taco', 'coffee', 'fruit', 'apple', 'banana', 'sandwich', 'popcorn', 'candy', 'cookie', 'pretzel', 'croissant', 'mug', 'cup'], must: [R('\\b(cake|burger|hamburger|cheeseburger|pizza|donut|doughnut|ice cream|hot dog|cupcake|sushi|taco|coffee|fruit|apple|banana|sandwich|popcorn|candy|cookie|pretzel|croissant|cupcakes|bread|toast|pancake|waffle|lollipop|strawberry|watermelon|pineapple|avocado|lemon|cherry|mushroom|pumpkin|carrot)\\b')], not: [R('duplo|shop|store|stand|cart|truck|van|parlou?r|cafe|caf\u00e9|restaurant|diner|bakery|kiosk|stall|bar\\b|pizzeria|place|planet|ninja|chima|apple (tree|store)|cherry (blossom|tree|picker)|banana (boat|split)|cat|dog\\b.*(house)|mushroom (house|cottage|home)|pumpkin (house|carriage|coach)|carriage|tree|house|bike|machine|kitchen|car\\b|booth|big apple|krusty|garden|seller|to go|decorating|delivery|lantern|pack')] },
    skyline: { keys: ['skyline', 'landmark', 'monument', 'eiffel tower', 'big ben', 'statue of liberty', 'colosseum', 'pyramid', 'temple', 'architecture', 'cathedral', 'stadium', 'taj mahal', 'arch'], must: [R('skyline|eiffel|big ben|statue of liberty|colosseum|pyramid|temple|cathedral|taj mahal|empire state|louvre|white house|parthenon|acropolis|pantheon|sagrada|landmark|arc de triomphe|monument|capitol|opera house|burj|golden gate|brandenburg|stonehenge|sphinx|great wall|himeji|notre|dome|chapel|church|mosque|shrine|tokyo|london|paris|new york|dubai|singapore|venice|berlin|sydney|chicago|san francisco|shanghai|las vegas|edinburgh|great pyramid|tower of pisa|trafalgar|buckingham')], not: [R('duplo|ninja|chima|star wars|jurassic|temple run|lost temple|temple of|escape|ghost|pyramid pack|cursed|dino|minecraft|marvel|batman|disney|elves|hidden side|monkie|friends|city|technic|arctic|adventurers|pharaoh|atlantis|indiana|mummy|temple of doom|airjitzu|skybound|dragon|raid|snake|jungle')] },
    // Theme-level subjects: whole LEGO themes as a style reference ("a City set", "a Friends-style cafe").
    themeCity: { keys: ['city', 'town', 'lego city'], themes: [52, 50] },
    themeCreator: { keys: ['creator', '3-in-1', 'three in one'], themes: [22] },
    themeCastle: { keys: ['castle theme', 'knights', 'kingdom', 'lion knights', 'black falcons', 'forestmen'], themes: [186] },
    themeSpace: { keys: ['classic space', 'blacktron', 'futuron', 'm-tron', 'ice planet', 'space police', 'galaxy squad', 'space theme'], themes: [126] },
    themeFriends: { keys: ['friends', 'heartlake', 'friends style', 'girly', 'pastel'], themes: [494] },
    themeNinjago: { keys: ['ninjago', 'ninja', 'ninja mech', 'ninjago city'], themes: [435] },
    themeSpeedChampions: { keys: ['speed champions', 'ferrari', 'porsche', 'lamborghini', 'mclaren', 'bugatti', 'aston martin', 'ford gt', 'mustang', 'corvette', 'nissan', 'toyota', 'audi', 'mercedes', 'bmw', 'koenigsegg', 'pagani', 'lotus'], themes: [601] },
    themePirates: { keys: ['pirates theme', 'imperial', 'soldiers', 'buccaneers', 'islanders', 'treasure island'], themes: [147] },
    themeTrains: { keys: ['trains theme', '9v', '12v', 'model railway'], themes: [233] },
    themeIcons: { keys: ['creator expert', 'icons', 'modular', 'modular building', 'display model', 'adult', 'detailed', 'realistic'], themes: [673, 721, 155] },
    themeArchitecture: { keys: ['architecture', 'micro scale', 'microscale', 'micro'], themes: [252] },
    themeIdeas: { keys: ['ideas', 'fan design', 'cuusoo', 'display piece'], themes: [576] },
};
for (const s of Object.values(SUBJECTS)) { s.must = s.must || []; s.not = s.not || []; }

// Root themes whose sets are not brick-built models of a subject (figures, buckets, gear, big-brick lines).
const DENY_THEME = R('duplo|^technic$|mindstorms|bionicle|hero factory|constraction|minifigures|^gear|books|bulk|service|educational|dacta|dimensions|^games|key chain|magnet|belville|scala|clikits|primo|quatro|^dots|^art$|modulex|brickheadz|value pack|universal building|freestyle|bricks & more|make & create|samsonite|serious play|sculptures|znap|galidor|fabuland|4 juniors|^juniors|mixels|unikitty|super mario|minecraft|^classic$|basic|homemaker|promotional|lego brand store|legoland|power functions|spybotics|jack stone|baby|explore|xtra|accessories|supplemental|stickers|ben 10|hobby|sports|speedorz|large figure|buildable|big fig|vidiyo|trolls|forma|^studios|fusion|^other$|^pick a|monthly|mosaic|brick sketches|primo|^quatro|slizer|roboriders|ninjago movie minifig|the lego movie 2.{0,5}minifig|collectible|series \\d+|^racers$|pen & watch|watch|clock|discovery|^factory|master builder|^inventor|^agents?$|^x-?pod|advent|^promotional|^lego exclusive|^value|^bricklink designer|dreamzzz');
// Set names that mark packs, gear or figure-only products rather than a buildable model.
const DENY_SET = R('sticker|minifig pack|polybag|promotional|key ?chain|keychain|magnet|accessory pack|accessories|blister|foil pack|\\bcoin\\b|trading|\\bcard\\b|poster|battle pack|minifigure|figure pack|\\bpen\\b|build-?a-?minifigure|brick pack|supplementary|spare parts|bag charm|magnet set|\\bbag\\b|lanyard|pack of|parts pack|bricks? (set|box|bucket|tub)|bucket|storage|tube|box of|starter pack|\\bset of\\b|assortment|calendar|puzzle|display stand|stand for|sorting|badge|wallet|notebook|pencil|lunch|backpack|plush');
const MINIFIG_CATS = new Set([13, 27, 59, 60, 61, 62, 63, 64, 65, 70, 71, 72, 73, 74, 75, 41, 58, 77, 4, 42, 48, 57, 17, 45, 78]);

/* ── CSV reading ─────────────────────────────────────────────────────── */
function parseLine(line) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
        else if (c === '"') q = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
    }
    out.push(cur);
    return out;
}
async function readCsv(name, onRow) {
    const file = path.join(dataDir, name + '.csv.gz');
    if (!fs.existsSync(file)) throw new Error('missing ' + file);
    const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
    let header = null, n = 0;
    for await (const line of rl) {
        if (!line) continue;
        const row = parseLine(line.replace(/\r$/, ''));
        if (!header) { header = row; continue; }
        const o = {}; header.forEach((h, i) => { o[h] = row[i]; });
        onRow(o); n++;
    }
    return n;
}
// A Rebrickable part number minus mould/print suffixes ("3068b", "3005pr0001", "4085c") → the design id we use.
const baseOf = (pn) => { const m = /^(\d+)(?:[a-z].*)?$/.exec(pn); const b = m ? m[1] : pn; return ALIAS[b] || b; };
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;

/* ── load ────────────────────────────────────────────────────────────── */
const t0 = Date.now();
const themes = new Map(); await readCsv('themes', (r) => themes.set(+r.id, { name: r.name, parent: r.parent_id ? +r.parent_id : null }));
const themeChain = (id) => { const out = []; let cur = id, guard = 0; while (cur != null && themes.has(cur) && guard++ < 10) { out.push(cur); cur = themes.get(cur).parent; } return out; };
const rootName = (id) => { const c = themeChain(id); return c.length ? themes.get(c[c.length - 1]).name : '?'; };
const cats = new Map(); await readCsv('part_categories', (r) => cats.set(+r.id, r.name));
const parts = new Map(); await readCsv('parts', (r) => parts.set(r.part_num, { name: r.name, cat: +r.part_cat_id }));
const colors = new Map(); await readCsv('colors', (r) => colors.set(+r.id, { name: r.name, trans: r.is_trans === 'True' }));

const sets = new Map();
await readCsv('sets', (r) => {
    const n = +r.num_parts; if (!(n >= 15)) return;
    const chain = themeChain(+r.theme_id);
    if (chain.some((t) => DENY_THEME.test(themes.get(t).name))) return;
    if (DENY_SET.test(r.name)) return;
    sets.set(r.set_num, { num: r.set_num, name: r.name, lname: r.name.toLowerCase(), year: +r.year, theme: +r.theme_id, chain, root: rootName(+r.theme_id), pieces: n });
});
// Latest inventory version per set.
const invOf = new Map();
await readCsv('inventories', (r) => { if (!sets.has(r.set_num)) return; const v = +r.version, prev = invOf.get(r.set_num); if (!prev || v > prev.v) invOf.set(r.set_num, { id: +r.id, v }); });
const invToSet = new Map(); for (const [s, inv] of invOf) invToSet.set(inv.id, s);

// inventory id → { parts: Map<base, qty>, colors: Map<colorId, qty>, total, figParts }
const inv = new Map();
const partName = (base) => { const p = parts.get(base); if (p) return p; for (const sfx of ['a', 'b', 'c', 'c01']) { const q = parts.get(base + sfx); if (q) return q; } return null; };
const partMeta = new Map();   // base → { name, cat } resolved once
const metaOf = (pn) => { const b = baseOf(pn); let m = partMeta.get(b); if (!m) { m = parts.get(pn) || partName(b) || (CATALOG[b] ? { name: CATALOG[b].name, cat: 24 } : { name: pn, cat: 24 }); partMeta.set(b, m); } return m; };
const rows = await readCsv('inventory_parts', (r) => {
    const sid = invToSet.get(+r.inventory_id); if (!sid) return;
    if (r.is_spare === 'True') return;
    let e = inv.get(sid); if (!e) { e = { parts: new Map(), colors: new Map(), total: 0, fig: 0, longest: 0 }; inv.set(sid, e); }
    const base = baseOf(r.part_num), meta = metaOf(r.part_num), qty = +r.quantity || 0;
    e.total += qty;
    if (MINIFIG_CATS.has(meta.cat)) { e.fig += qty; return; }
    e.parts.set(base, (e.parts.get(base) || 0) + qty);
    const cid = +r.color_id; e.colors.set(cid, (e.colors.get(cid) || 0) + qty);
    if (OUR_IDS.has(base)) { const p = CATALOG[base]; if (!p.isTile && (p.category === 'Bricks' || p.category === 'Plates')) e.longest = Math.max(e.longest, p.width, p.length); }
});
// Keep sets with a real inventory that is mostly bricks, not figures.
const usable = [...sets.values()].filter((s) => { const e = inv.get(s.num); return e && e.total >= 15 && e.fig / e.total < 0.5; });
console.error(`loaded ${themes.size} themes, ${parts.size} parts, ${sets.size} candidate sets, ${rows} inventory rows → ${usable.length} usable sets in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

/* ── catalog check ───────────────────────────────────────────────────── */
if (doCheck) {
    console.log('\n# catalog id → Rebrickable name (mismatches to look at)');
    for (const id of Object.keys(CATALOG)) {
        const m = parts.get(id) || partName(id);
        console.log(`${id.padEnd(7)} ours: ${CATALOG[id].name.padEnd(46)} rb: ${m ? m.name : '(not found)'}`);
    }
}

/* ── per-subject mining ──────────────────────────────────────────────── */
function matchSubject(s, set) {
    if (s.themes && !s.themes.some((t) => set.chain.includes(t))) return false;
    if (s.notThemes && s.notThemes.some((t) => set.chain.includes(t))) return false;
    if (s.solo && /\b(with|and|vs|versus)\b|&/.test(set.lname)) return false;   // "Wild Lion", not "Police Station with Dog"
    if (!s.must.every((re) => re.test(set.lname))) return false;
    if (s.not.some((re) => re.test(set.lname))) return false;
    return true;
}
const subjectsOut = {};
if (dumpFile) fs.writeFileSync(dumpFile, '# sets matched per subject\n');
const PARTS_TOP = 50, WANTED_TOP = 20, PALETTE_TOP = 8;
for (const [sid, s] of Object.entries(SUBJECTS)) {
    const mine = usable.filter((set) => matchSubject(s, set));
    const n = mine.length;
    if (n < 5) { console.error(`subject ${sid}: only ${n} sets, skipped`); continue; }
    const setsWith = new Map(), qtys = new Map(), colShare = new Map();
    for (const set of mine) {
        const e = inv.get(set.num);
        for (const [base, q] of e.parts) { setsWith.set(base, (setsWith.get(base) || 0) + 1); if (!qtys.has(base)) qtys.set(base, []); qtys.get(base).push(q); }
        const tot = [...e.colors.values()].reduce((a, b) => a + b, 0) || 1;
        for (const [cid, q] of e.colors) { const key = COLOR_MAP[cid]; if (!key) continue; colShare.set(key, (colShare.get(key) || 0) + q / tot / n); }
    }
    const ranked = [...setsWith.entries()].sort((a, b) => b[1] - a[1] || median(qtys.get(b[0])) - median(qtys.get(a[0])));
    const ours = ranked.filter(([b]) => OUR_IDS.has(b)).slice(0, PARTS_TOP).map(([b, c]) => [b, r2(c / n), median(qtys.get(b))]);
    const wanted = ranked.filter(([b]) => !OUR_IDS.has(b)).slice(0, WANTED_TOP).map(([b, c]) => [b, (partMeta.get(b) || { name: b }).name.slice(0, 70), r2(c / n)]);
    const palette = [...colShare.entries()].sort((a, b) => b[1] - a[1]).slice(0, PALETTE_TOP).map(([k, v]) => [k, r3(v)]);
    const pieces = mine.map((x) => x.pieces);
    const rootCount = new Map(); for (const set of mine) rootCount.set(set.root, (rootCount.get(set.root) || 0) + 1);
    const themesTop = [...rootCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
    const years = [Math.min(...mine.map((x) => x.year)), Math.max(...mine.map((x) => x.year))];
    // Examples: the three most "typical" sets (closest to the median piece count), newest first on ties.
    const p50 = pct(pieces, 0.5);
    const examples = [...mine].sort((a, b) => Math.abs(a.pieces - p50) - Math.abs(b.pieces - p50) || b.year - a.year).slice(0, 3).map((x) => [x.num, x.name]);
    if (dumpFile) fs.appendFileSync(dumpFile, `\n## ${sid} (${n})\n` + mine.map((x) => `${x.num} ${x.year} ${x.root} | ${x.name} (${x.pieces})`).join('\n') + '\n');
    subjectsOut[sid] = { keys: s.keys, n, themes: themesTop, years, parts: ours, wanted, palette, pieces: { p25: pct(pieces, 0.25), p50, p75: pct(pieces, 0.75) }, longest: median(mine.map((x) => inv.get(x.num).longest).filter(Boolean)), examples };
    console.error(`subject ${sid.padEnd(20)} ${String(n).padStart(5)} sets  pieces p50 ${String(p50).padStart(5)}  palette ${palette.slice(0, 4).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')}`);
}

/* ── pairings (lift) among our catalog parts ─────────────────────────── */
const N = usable.length;
const single = new Map(), pair = new Map();
for (const set of usable) {
    const e = inv.get(set.num);
    const have = [...e.parts.keys()].filter((b) => OUR_IDS.has(b)).sort();
    for (const b of have) single.set(b, (single.get(b) || 0) + 1);
    for (let i = 0; i < have.length; i++) for (let j = i + 1; j < have.length; j++) { const k = have[i] + '|' + have[j]; pair.set(k, (pair.get(k) || 0) + 1); }
}
const MIN_SUPPORT = 25;
const pairings = [...pair.entries()].filter(([, c]) => c >= MIN_SUPPORT).map(([k, c]) => { const [a, b] = k.split('|'); return [a, b, r2((c * N) / (single.get(a) * single.get(b))), c]; })
    .filter((p) => p[2] >= 1.5).sort((a, b) => b[2] - a[2]).slice(0, 150);

/* ── wheel ↔ tyre pairings ───────────────────────────────────────────── */
const WHEEL_CAT = [...cats.entries()].find(([, name]) => /wheels and tyres/i.test(name))[0];
const isWheel = (m) => m.cat === WHEEL_CAT && /^wheel\b/i.test(m.name) && !/cover|hub ?cap|with tyre|with tire|with fixed|^wheels? holder|axle only|\[complete/i.test(m.name);
const isTyre = (m) => m.cat === WHEEL_CAT && /^(tyre|tire)\b/i.test(m.name);
const wheelSets = new Map(), wt = new Map();
for (const set of usable) {
    const e = inv.get(set.num);
    const wheels = [], tyres = [];
    for (const [base, q] of e.parts) { const m = partMeta.get(base); if (!m) continue; if (isWheel(m)) wheels.push([base, q]); else if (isTyre(m)) tyres.push([base, q]); }
    for (const [w, qw] of wheels) {
        wheelSets.set(w, (wheelSets.get(w) || 0) + 1);
        for (const [t, qt] of tyres) { const k = w + '|' + t; const cur = wt.get(k) || { score: 0, n: 0 }; cur.score += qw === qt ? 1 : 0.3; cur.n++; wt.set(k, cur); }
    }
}
const byWheel = new Map();
for (const [k, v] of wt) { const [w, t] = k.split('|'); if (!byWheel.has(w)) byWheel.set(w, []); byWheel.get(w).push([t, v]); }
const wheelTyre = [], names = {};
const ourWheels = new Set(Object.values(CATALOG).filter((p) => p.isWheel).map((p) => p.id));
for (const [w, list] of [...byWheel.entries()].sort((a, b) => (wheelSets.get(b[0]) || 0) - (wheelSets.get(a[0]) || 0))) {
    const ws = wheelSets.get(w) || 0;
    if (ws < 15 && !ourWheels.has(w)) continue;
    if (wheelTyre.length > 160 && !ourWheels.has(w)) break;
    list.sort((a, b) => b[1].score - a[1].score);
    for (const [t, v] of list.slice(0, 3)) { const share = r2(v.score / ws); if (share < 0.05 && !ourWheels.has(w)) continue; wheelTyre.push([w, t, share, v.n]); names[w] = (partMeta.get(w) || {}).name; names[t] = (partMeta.get(t) || {}).name; }
}
if (doCheck) {
    console.log('\n# our wheels: what real sets put on them');
    for (const w of ourWheels) { console.log(`${w} ${(partMeta.get(w) || { name: '?' }).name} (${wheelSets.get(w) || 0} sets): ` + (byWheel.get(w) || []).sort((a, b) => b[1].score - a[1].score).slice(0, 4).map(([t, v]) => `${t} ${(partMeta.get(t) || { name: '?' }).name} ×${v.n}`).join(' | ')); }
}

/* ── write ───────────────────────────────────────────────────────────── */
const out = {
    generated: new Date().toISOString(),
    sources: 'Mined from the Rebrickable database downloads (https://rebrickable.com/downloads/, set inventories, CC BY 4.0). Set names and part names are Rebrickable data; no LEGO instructions were used. Built by scripts/studforge-mine-knowledge.mjs.',
    setsUsed: N,
    subjects: subjectsOut,
    pairings,
    wheelTyre,
    names,
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const json = JSON.stringify(out);
fs.writeFileSync(outFile, json);
console.error(`wrote ${outFile} (${(json.length / 1024).toFixed(1)} KB, ${Object.keys(subjectsOut).length} subjects, ${pairings.length} pairings, ${wheelTyre.length} wheel/tyre rows) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
