#!/usr/bin/env node
// OMR acquisition: list the LDraw Official Model Repository, pick ~100 real sets across StudForge's knowledge subjects,
// download their .mpd/.ldr files into a scratch cache (never into the repo) and write a selection file for the converter.
//
//   node scripts/ldraw/omr-fetch.mjs --cache <dir> [--stage list|candidates|fetch|select|all] [--max-per-subject 6]
//
// How the OMR is served (inspected 2026-10): https://library.ldraw.org/omr/sets is a paginated table (25 rows a page,
// ?page=N) of every set: number, name, theme, year, model count, each row linking to /omr/sets/<id>. A set page lists
// its models (main model plus alternates), each with author, "missing parts/patterns/stickers" flags and a download
// link https://library.ldraw.org/library/omr/<file>.mpd. There is no JSON API, so we parse the HTML.
//
// Politeness: strictly sequential requests, a delay between them, a descriptive User-Agent, every response cached in
// <cache>/html or <cache>/files and never fetched twice. Downloads are untrusted data: we only parse them as text.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const CACHE = path.resolve(arg('cache', 'omr-cache'));
const STAGE = arg('stage', 'all');
const MAX_PER_SUBJECT = +arg('max-per-subject', 6);
// How many models to keep per subject (~110 in all): more for the subjects people forge most and that vary most.
const QUOTA = { fireTruck: 4, policeCar: 3, ambulance: 2, car: 5, truck: 4, monsterTruck: 2, garbageTruck: 2, bus: 2, tractor: 2,
  construction: 4, motorcycle: 2, train: 5, plane: 5, helicopter: 4, boat: 4, ship: 2, pirateShip: 3, submarine: 3, rocket: 4,
  spaceship: 5, rover: 2, spaceStation: 2, robot: 2, tank: 1, house: 5, castle: 5, tower: 2, lighthouse: 2, windmill: 1, bridge: 1,
  shop: 4, station: 4, farm: 2, dragon: 2, dinosaur: 2, animal: 2, bird: 2, seaCreature: 2 };
const quota = (s) => Math.min(MAX_PER_SUBJECT, QUOTA[s] ?? 2);
const DELAY_MS = +arg('delay', 1200);
// Optional LDraw library: lets the piece count skip primitives (rigging strings are hundreds of 4-4cyli.dat).
const LIB = arg('lib', '') ? path.resolve(arg('lib')) : null;
const BASE = 'https://library.ldraw.org';
const UA = 'StudForge-OMR-fetch/1.0 (StudForge open-source portfolio project; sequential, cached, about 1 request/s)';

fs.mkdirSync(path.join(CACHE, 'html'), { recursive: true });
fs.mkdirSync(path.join(CACHE, 'files'), { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let lastFetch = 0;
// curl (not Node fetch) so the standard proxy/CA environment applies everywhere.
async function get(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return fs.readFileSync(dest, 'utf8');
  const wait = lastFetch + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();
  const tmp = dest + '.part';
  const code = execFileSync('curl', ['-sS', '-L', '-A', UA, '-o', tmp, '-w', '%{http_code}', url], { encoding: 'utf8' }).trim();
  if (code !== '200') { try { fs.unlinkSync(tmp); } catch {} throw new Error(`HTTP ${code} for ${url}`); }
  fs.renameSync(tmp, dest);
  return fs.readFileSync(dest, 'utf8');
}

const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&gt;/g, '>');
const text = (h) => unescape(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- stage 1: the full set list
async function stageList() {
  const sets = [];
  for (let page = 1; page < 200; page++) {
    const html = await get(`${BASE}/omr/sets?page=${page}`, path.join(CACHE, 'html', `sets-p${page}.html`));
    const rows = html.split(/<tr\s+wire:key="[^"]*\.table\.records\./).slice(1);
    for (const row of rows) {
      const omrId = +row.match(/^(\d+)/)[1];
      const col = (name) => { const m = row.match(new RegExp(`column\\.${name}"[\\s\\S]*?<div class="fi-ta-text[^"]*">([\\s\\S]*?)</div>`)); return m ? text(m[1]) : ''; };
      sets.push({ omrId, number: col('number'), name: col('name'), theme: col('theme.name') || themeFallback(row), year: +col('year') || null, models: +(col('models_count') || 0) });
    }
    const m = html.match(/Showing\s+([\d,]+)\s+to\s+([\d,]+)\s+of\s+([\d,]+)/);
    if (!m || m[2] === m[3]) break;
  }
  fs.writeFileSync(path.join(CACHE, 'sets.json'), JSON.stringify(sets));
  console.log(`listed ${sets.length} sets`);
  return sets;
}
// The theme column key differs between table versions; fall back to the 4th text cell.
function themeFallback(row) {
  const cells = [...row.matchAll(/<div class="fi-ta-text[^"]*">([\s\S]*?)<\/div>/g)].map(m => text(m[1]));
  return cells[2] || '';
}

// ---------------------------------------------------------------- stage 2: classify into knowledge subjects
// Ordered: the first matching subject wins, so specific subjects (fire truck, pirate ship, fire station) come before
// the general ones (truck, ship, station). Patterns are tested against the set or model name, word-bounded.
export const SUBJECTS = [
  ['fireTruck', /\bfire ?(truck|engine|tender|pumper|ladder)|ladder truck|fire ?fighter.*truck|fire (rescue|response|chief)|fire command|fire squad|airport fire/],
  ['station', /\bfire (station|house)|firehouse|police (station|headquarters|hq)|\bgarage\b|\bdepot\b|\bhangar\b|\bairport\b|train station|railway station|gas station|service station|petrol|\bheadquarters\b|\bcommand (center|centre|base)\b/],
  ['policeCar', /\bpolice (car|cruiser|patrol|interceptor|pursuit|van|truck|chase)|patrol car|squad car|\bcop\b/],
  ['ambulance', /\bambulance|paramedic|rescue van|emergency (vehicle|van)/],
  ['garbageTruck', /garbage|recycling truck|refuse|sanitation/],
  ['monsterTruck', /monster truck|stunt truck|off.?road(er)?|4\s?x\s?4/],
  ['tractor', /\btractor|combine|harvester|farm vehicle/],
  ['construction', /excavator|digger|bulldozer|\bcrane\b|front loader|wheel loader|cement mixer|forklift|backhoe|steamroller|road roller|dump truck|tipper/],
  ['bus', /\bbus\b|school bus|\bcoach\b|double.?decker|minibus|camper/],
  ['pirateShip', /pirate ship|galleon|\bbrig\b|black seas barracuda|caribbean clipper|skull'?s eye schooner|sea serpent|red beard runner|renegade runner|flagship|\bschooner\b|pirate.*(boat|raider|sloop)|(imperial|soldiers).*(ship|flagship)/],
  ['submarine', /submarine|u-boat|aquanaut|aqua ?(raider|shark|zone)|nautilus|\bsub\b(?! orbital)/],
  ['ship', /\bship\b|cargo ship|\bcruise\b|ocean liner|freighter|warship|frigate|container ship|steamship|paddle steamer|\bliner\b/],
  ['boat', /\bboat|speedboat|yacht|ferry|tugboat|\btug\b|dinghy|sailboat|lifeboat|catamaran|hovercraft|\braft\b|jet ski|coast guard (cutter|patrol)|harbou?r/],
  ['helicopter', /helicopter|\bheli|copter|gyrocopter|chopper(?! bike)/],
  ['rocket', /\brocket|launch pad|launch(er| site| command)|space ?port|saturn v|space shuttle|shuttle launch/],
  ['spaceStation', /space station|moon base|lunar base|space base|planetary|outpost|\bmonorail transport\b|command (station|center)|research (station|lab)|crater|surface (base|station)/],
  ['rover', /\brover|moon buggy|lunar|buggy|crawler|\bscout\b|land ?(speeder|cruiser)|exploration vehicle|surveyor/],
  ['spaceship', /space ?ship|starship|starfighter|star fighter|space fighter|space cruiser|transporter|\bcruiser\b|\bspeeder\b|\bcraft\b|galaxy|\bufo\b|\bsaucer|interceptor|explorer|\bhawk\b|\bfalcon\b|\bbird\b(?=.*space)|stealth|invader/],
  ['plane', /\bplanes?\b|sopwith|airplane|aeroplane|\bjet\b|airliner|aircraft|biplane|seaplane|glider|\bbomber|wright flyer|\bflyer\b|sky ?(lab|shark)|flying (machine|ace)|air ?(show|ace|port shuttle)/],
  ['train', /\btrains?\b|locomotive|steam engine|\bwagon|caboose|tanker car|hopper|freight|passenger car|\bcar(riage)?s? - set|railway|\btram\b|monorail|\bloco\b|club car|super chief|emerald night|crocodile|santa fe|metroliner|intermodal|maersk train|level crossing|shunter|switcher/],
  ['motorcycle', /motorcycle|motorbike|motor ?bike|scooter|dirt bike|quad bike|\batv\b/],
  ['tank', /\btank\b(?! car| truck| wagon)|armou?red|artillery|\bapc\b/],
  ['robot', /\brobot|\bmech\b|mecha|\bdroid|\bwalker\b|exo.?suit|android|\bcyborg/],
  ['dragon', /dragon|wyvern/],
  ['dinosaur', /dinosaur|\bdino\b|t-?rex|tyrannosaurus|raptor|triceratops|stegosaurus|pterodactyl|pteranodon|brachiosaurus|spinosaurus|ankylosaurus|jurassic/],
  ['lighthouse', /lighthouse|light house|beacon/],
  ['windmill', /windmill|wind mill|wind turbine|\bmill\b/],
  ['castle', /castle|fortress|\bfort\b|stronghold|citadel|chateau|\bkeep\b|king'?s castle|knight'?s|\bmanor\b|guarded inn|blacksmith|jousting|siege|forestmen|hideout|black falcon|\bcrusader|\bwolfpack/],
  ['tower', /\btower|skyscraper|watchtower|obelisk|lookout/],
  ['bridge', /\bbridge|viaduct|drawbridge/],
  ['farm', /\bfarm|\bbarn|stable|ranch|cowshed|chicken coop|pigsty|cottage farm/],
  ['house', /\bhouse|cottage|villa|\bhome\b|bungalow|cabin|mansion|townhouse|apartment|chalet|\bhut\b|lodge|retreat|residence|hideaway/],
  ['shop', /\bshop|store|bakery|\bcaf[eé]|restaurant|pizza|diner|market|kiosk|grocery|boutique|hotel|supermarket|\bpub\b|\binn\b|ice cream|snack|burger|\bbank\b|\bpost office|cinema|\bmall\b|town ?hall|corner|parisian|\bdetective|cinema/],
  ['truck', /\btruck|lorry|pickup|tow ?truck|big rig|delivery|\bvan\b|tanker|transporter|semi|hauler|wrecker|\btow\b/],
  ['car', /\bcar\b|sports car|race car|racing|racer|roadster|supercar|convertible|coupe|hot rod|muscle car|sedan|taxi|limo|\bjeep\b|cruiser|\bgt\b|\bmini cooper\b|beetle|\bvw\b|ferrari|porsche|lamborghini|mustang|\bf1\b|formula|bugatti|mclaren|corvette|dodge|chevrolet|audi|cadillac|rolls|caterham|vintage|model t\b/],
  ['animal', /\banimal|\bdog\b|\bcat\b|horse|pony|puppy|kitten|lion|tiger|elephant|giraffe|\bbear\b|panda|monkey|rabbit|bunny|\bfox\b|\bwolf\b|\bdeer\b|zebra|hippo|rhino|koala|\bpig\b|\bcow\b|sheep|goat|squirrel|turtle|frog|snake|crocodile|lizard|unicorn|camel|\bpet\b/],
  ['bird', /\bbird|parrot|\bowl\b|eagle|penguin|flamingo|\bduck\b|chicken|swan|toucan|peacock/],
  ['seaCreature', /shark|creature|whale|dolphin|octopus|squid|\bfish\b|\bcrab\b|lobster|seahorse|orca|\bseal\b/],
];
// Themes that are studded System building (what StudForge models); Technic/Duplo/Bionicle/Mindstorms are excluded.
const GOOD_THEME = /^(Modular Buildings|Boat|Friends|Hobby Sets|Sports|Elves|City|Town|Creator|Castle|Space|Pirates|Train|Classic|Seasonal|Racers|Adventurers|Aquazone|Alpha Team|Dino|Dinosaurs|Island Xtreme Stunts|Studios|Model Team|System|Basic|Exploriens|Rock Raiders|Agents|Power Miners|World Racers|Monster Fighters|Atlantis|Vikings|Western|Ninja|Time Cruisers|Pharaoh|Insectoids|UFO|Spyrius|Ice Planet|Unitron|Blacktron|M-Tron|Futuron|Space Police|Robo|Mars Mission|Galaxy Squad|Collectible|Promotional|Legoland|LEGO Ideas|Ideas|Icons|Make & Create|Juniors|4 Juniors|Speed Champions|Discovery|Hobby)/i;
const BAD_THEME = /Technic|Duplo|Bionicle|Mindstorms|Hero Factory|Znap|Primo|Clikits|Belville|Scala|Fabuland|Galidor|Dimensions|Gear|Books|Key Chain|Magnets|Bulk|Education|Dacta|Bricks and More|Service Packs|Supplemental|Universal Building Set|Mini|Quatro|Baby/i;
const PREFERRED = /^(City|Town|Creator|Castle|Space|Pirates|Train)/i;

// Space-craft subjects only make sense in a space theme (or when the name says "space"): "Dino Explorer" is a jeep and
// "Black Falcon's Fortress" a castle. Castle-themed sets that name a structure default to castle.
const SPACE_SUBJECTS = new Set(['spaceship', 'rover', 'spaceStation']);
const SPACE_THEME = /Space|Exploriens|UFO|Insectoids|Mars|Galaxy|Spyrius|Blacktron|Futuron|M-Tron|Unitron|Ice Planet|Robo|Life on Mars/i;
// Hand corrections where a set's name misleads the keyword classifier (checked against the set pages).
const OVERRIDES = { '6679-1': 'boat' /* Dark Shark: a speedboat */, '6537-1': 'boat' /* Hydro Racer */, '5934-1': 'car' /* Dino Explorer: a jeep */ };
export function classify(name, theme) {
  const n = (name || '').toLowerCase();
  const th = theme || '';
  if (/^Castle/i.test(th)) {
    if (/dragon/.test(n)) return 'dragon';
    if (/castle|fortress|stronghold|keep|tower|outpost|crossing|hideout|guard|inn|shop|blacksmith|treasure|siege/.test(n)) return /tower/.test(n) && !/castle/.test(n) ? 'tower' : 'castle';
  }
  if (/^Train/i.test(th) && !/station|crossing|bridge/.test(n)) return 'train';
  for (const [s, re] of SUBJECTS) {
    if (!re.test(n)) continue;
    if (SPACE_SUBJECTS.has(s) && !SPACE_THEME.test(th) && !/\bspace/.test(n)) continue;
    if (s === 'station' && /plane|truck|shuttle|\bcar\b|\bvan\b/.test(n)) continue;
    if (s === 'train' && /wagon|hopper/.test(n) && !/train|rail/i.test(n + th)) continue;
    return s;
  }
  return null;
}

function stageCandidates() {
  const sets = JSON.parse(fs.readFileSync(path.join(CACHE, 'sets.json'), 'utf8'));
  const out = [];
  for (const s of sets) {
    if (!s.number || BAD_THEME.test(s.theme) || !GOOD_THEME.test(s.theme)) continue;
    let subject = OVERRIDES[s.number] || classify(s.name, s.theme);
    // Classic Space sets are mostly named after their craft ("Galaxy Explorer"): treat unclassified ones as spaceships.
    if (!subject && /^Space/i.test(s.theme)) subject = 'spaceship';
    if (!subject) continue;
    out.push({ ...s, subject, preferred: PREFERRED.test(s.theme) });
  }
  fs.writeFileSync(path.join(CACHE, 'candidates.json'), JSON.stringify(out));
  const by = {};
  for (const c of out) by[c.subject] = (by[c.subject] || 0) + 1;
  console.log(`${out.length} candidate sets`, by);
  return out;
}

// ---------------------------------------------------------------- stage 3: set pages + model downloads
function parseSetPage(html) {
  const models = [];
  // Each model block: name, "Author:" name, three missing flags, then a download link.
  const re = /href="(https:\/\/library\.ldraw\.org\/library\/omr\/[^"]+\.(?:mpd|ldr|zip))"/gi;
  const t = html.replace(/<script[\s\S]*?<\/script>/g, '');
  let last = 0, m;
  const links = [];
  while ((m = re.exec(t))) links.push({ url: m[1], at: m.index });
  for (const l of links) {
    const seg = text(t.slice(last, l.at)).replace(/^Download\s+/, ''); last = t.indexOf('>', l.at) + 1;
    const mm = seg.match(/([^]*?)\s*Author:\s*(.*?)\s*Missing Parts\s*(Yes|No)\s*Missing Patterns\s*(Yes|No)\s*Missing Stickers\s*(Yes|No)/);
    let name = '', author = '', mp = null, mpat = null, mst = null;
    if (mm) {
      const words = mm[1].split(/\s+(?:Download|3D View|Models)\s+/); name = words[words.length - 1].trim();
      name = name.replace(/^.*\bModels\s+/, '').replace(/^.*\b3D View\s+/, '').trim();
      author = mm[2]; mp = mm[3] === 'Yes'; mpat = mm[4] === 'Yes'; mst = mm[5] === 'Yes';
    }
    if (!models.find(x => x.url === l.url)) models.push({ url: l.url, name, author, missingParts: mp, missingPatterns: mpat, missingStickers: mst });
  }
  return models;
}

const fileName = (url) => decodeURIComponent(url.split('/').pop());
const PRIMITIVE = /^(s\/|48\/|8\/)|^\d+-\d+[a-z]+\d*\.dat$|^(rect|box|tri|stud|edge|ring|con|disc|ndis|chrd|cyl|axl|peg|bump|tooth|logo)[\w-]*\.dat$/;
const pieceMemo = new Map();
function isPieceRef(ref) {
  if (pieceMemo.has(ref)) return pieceMemo.get(ref);
  const v = LIB ? fs.existsSync(path.join(LIB, 'parts', ref)) && !ref.startsWith('s/') : !PRIMITIVE.test(ref);
  pieceMemo.set(ref, v); return v;
}
// Count pieces (part references, flattened through submodels) and read the header, without the parts library.
export function scanModel(src) {
  const files = new Map(); let cur = null, first = null;
  const lines = src.split(/\r?\n/);
  const header = { license: null, authors: [] };
  for (const raw of lines) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^0\s+FILE\s+(.+)$/i))) { cur = m[1].trim().toLowerCase(); files.set(cur, []); if (!first) first = cur; continue; }
    if (/^0\s+NOFILE/i.test(line)) { cur = null; continue; }
    if (!cur) { if (!first) { cur = '__main'; first = cur; files.set(cur, []); } else continue; }
    files.get(cur).push(line);
    if ((m = line.match(/^0\s+!LICENSE\s+(.*)$/i)) && !header.license) header.license = m[1].trim();
    // Model authors only: embedded part copies (*.dat sections) carry the part authors, and LDCad helper files say "LDCad".
    if ((m = line.match(/^0\s+Author:\s*(.*)$/i)) && !/\.dat$/.test(cur)) { const a = m[1].trim(); const bare = (x) => x.replace(/\s*\[[^\]]*\]\s*$/, '').toLowerCase();
      if (a && !/^(ldcad|mlcad|leocad|bricksmith|ldd|studio|bricklink.*|lpub.*)$/i.test(a) && !header.authors.some(x => bare(x) === bare(a))) header.authors.push(a); }
  }
  const memo = new Map();
  const count = (f, depth = 0) => {
    if (memo.has(f)) return memo.get(f);
    if (depth > 30) return 0;
    let n = 0;
    for (const l of files.get(f) || []) {
      if (!l.startsWith('1 ')) continue;
      const ref = l.split(/\s+/).slice(14).join(' ').toLowerCase().replace(/\\/g, '/');
      if (files.has(ref)) {
        // An embedded unofficial PART (has geometry, no sub-references to other files of the MPD) counts as one piece.
        const sub = files.get(ref);
        if (sub.some(x => /^0\s+!LDRAW_ORG\s+(Unofficial_)?(Part|Shortcut)/i.test(x))) n += 1; else n += count(ref, depth + 1);
      } else if (isPieceRef(ref)) n += 1;
    }
    memo.set(f, n); return n;
  };
  return { pieces: first ? count(first) : 0, files: files.size, ...header };
}

async function stageFetch() {
  const cands = JSON.parse(fs.readFileSync(path.join(CACHE, 'candidates.json'), 'utf8'));
  const scanPath = path.join(CACHE, 'scanned.json');
  const scanned = fs.existsSync(scanPath) ? JSON.parse(fs.readFileSync(scanPath, 'utf8')) : {};
  // Per subject: preferred themes first, then spread over years (round-robin over decades) so one era does not dominate.
  const bySubj = {};
  for (const c of cands) (bySubj[c.subject] ||= []).push(c);
  const queue = [];
  for (const [subj, list] of Object.entries(bySubj)) {
    const decades = {};
    for (const c of list.sort((a, b) => (b.preferred - a.preferred) || (a.year - b.year))) (decades[Math.floor((c.year || 2000) / 10)] ||= []).push(c);
    const keys = Object.keys(decades).sort();
    const ordered = [];
    for (let round = 0; ordered.length < list.length; round++) for (const k of keys) if (decades[k][round]) ordered.push(decades[k][round]);
    // Fetch a pool of ~2.5x what we keep: some files fail the licence/piece filters.
    queue.push({ subj, ordered });
  }
  // Walk each subject's list until enough models qualify (CC BY, 50-1200 pieces, nothing missing) or the pool is spent:
  // piece counts are only known after download, and many classic sets are tiny or huge.
  const qualifies = (e) => !e.error && e.file && isCCBY(e.license) && e.pieces >= 50 && e.pieces <= 1250 && !e.missingParts;
  for (const { subj, ordered } of queue) {
    let ok = 0, tried = 0;
    for (const c of ordered) {
      if (ok >= quota(subj) + 1 || tried >= quota(subj) * 6 + 4) break;
      tried++;
      const key = `${c.number}`;
      if (scanned[key]) { ok += scanned[key].entries.filter(e => e.subject === subj && qualifies(e)).length; continue; }
      await fetchSet(c, scanned, scanPath);
      ok += scanned[key] ? scanned[key].entries.filter(e => e.subject === subj && qualifies(e)).length : 0;
    }
    console.log(`# ${subj}: ${ok} qualifying after ${tried} sets`);
  }
}
async function fetchSet(c, scanned, scanPath) {
  const key = `${c.number}`;
  {
    let models;
    try { models = parseSetPage(await get(`${BASE}/omr/sets/${c.omrId}`, path.join(CACHE, 'html', `set-${c.omrId}.html`))); }
    catch (e) { console.warn('set page failed', c.number, e.message); return; }
    // Main model = the file named after the set itself or the first listed; keep alternates only if they classify.
    const entries = [];
    models.forEach((m, i) => {
      const altSubject = classify(m.name, c.theme);
      if (i === 0 || (altSubject && altSubject !== c.subject)) entries.push({ ...m, subject: i === 0 ? c.subject : altSubject, alt: i > 0 });
    });
    for (const m of entries) {
      if (/\.zip$/i.test(m.url)) continue;
      const fn = fileName(m.url);
      try {
        const src = await get(m.url, path.join(CACHE, 'files', fn.replace(/[^\w.\- ]/g, '_')));
        Object.assign(m, scanModel(src), { file: fn });
      } catch (e) { console.warn('download failed', m.url, e.message); m.error = e.message; }
    }
    scanned[key] = { ...c, entries };
    fs.writeFileSync(scanPath, JSON.stringify(scanned));
    console.log(c.number, c.subject, c.name, entries.map(e => `${e.name}:${e.pieces}:${e.license}`).join(' | '));
  }
}
// Recount pieces of every downloaded file (after a counting change) without touching the network.
function stageRescan() {
  const scanPath = path.join(CACHE, 'scanned.json');
  const scanned = JSON.parse(fs.readFileSync(scanPath, 'utf8'));
  for (const s of Object.values(scanned)) for (const e of s.entries) {
    if (!e.file) continue;
    const f = path.join(CACHE, 'files', e.file.replace(/[^\w.\- ]/g, '_'));
    if (fs.existsSync(f)) Object.assign(e, scanModel(fs.readFileSync(f, 'utf8')));
  }
  fs.writeFileSync(scanPath, JSON.stringify(scanned));
}

// ---------------------------------------------------------------- stage 4: final selection
// "Redistributable under CCAL version 2.0" is the LDraw wording for the Creative Commons Attribution License 2.0, i.e.
// CC BY 2.0 (older OMR files); newer files say "Licensed under CC BY 2.0/4.0 and ...". Anything NC/ND/SA is refused.
export function normLicence(l) {
  l = l || '';
  if (/\b(NC|ND|SA)\b|NonCommercial|NoDeriv|ShareAlike/i.test(l)) return null;
  if (/CC BY 4\.0/i.test(l)) return 'CC BY 4.0';
  if (/CC BY 2\.0|CCAL version 2\.0/i.test(l)) return 'CC BY 2.0';
  return null;
}
const isCCBY = (l) => !!normLicence(l);
// File header authors first, then the author the OMR set page credits (often who prepared the OMR version).
const bareName = (x) => (x.replace(/\s*\[[^\]]*\]\s*$/, '') || x.replace(/[[\]]/g, '')).trim().toLowerCase();
function mergeAuthors(fileAuthors, pageAuthor) {
  const out = [];
  for (const a of [...(fileAuthors || []), pageAuthor]) if (a && !out.some(x => bareName(x) === bareName(a))) out.push(a);
  return out;
}
function stageSelect() {
  const scanned = JSON.parse(fs.readFileSync(path.join(CACHE, 'scanned.json'), 'utf8'));
  // Subjects come from the current classifier (it may have been refined since the files were scanned).
  const cands = new Map(JSON.parse(fs.readFileSync(path.join(CACHE, 'candidates.json'), 'utf8')).map(c => [c.number, c]));
  const pool = [];
  for (const s of Object.values(scanned)) for (const e of s.entries) {
    const cand = cands.get(s.number);
    if (!cand) continue;
    e.subject = e.alt ? classify(e.name, s.theme) : cand.subject;
    if (!e.subject) continue;
    if (e.error || !e.file || !isCCBY(e.license)) continue;
    if (e.pieces < 50 || e.pieces > 1250) continue;
    if (e.missingParts) continue;
    const id = e.alt ? `${s.number}-${e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : s.number;
    pool.push({ id, setNumber: s.number, name: e.alt ? `${s.name} (${e.name})` : s.name, modelName: e.name, year: s.year, theme: s.theme,
      subject: e.subject, pieces: e.pieces, file: e.file, url: e.url, setPage: `${BASE}/omr/sets/${s.omrId}`, authors: mergeAuthors(e.authors, e.author),
      licence: e.license, preferred: s.preferred, missingPatterns: e.missingPatterns, missingStickers: e.missingStickers });
  }
  const bySubj = {};
  for (const p of pool) (bySubj[p.subject] ||= []).push(p);
  const chosen = [];
  for (const [subj, list] of Object.entries(bySubj)) {
    // Spread over decades, preferred themes first within a decade.
    const decades = {};
    for (const p of list.sort((a, b) => (b.preferred - a.preferred) || (a.year - b.year))) (decades[Math.floor(p.year / 10)] ||= []).push(p);
    const keys = Object.keys(decades).sort();
    const picked = [];
    const q = quota(subj);
    for (let r = 0; picked.length < Math.min(q, list.length); r++) for (const k of keys) if (decades[k][r] && picked.length < q) picked.push(decades[k][r]);
    chosen.push(...picked);
  }
  chosen.sort((a, b) => a.subject.localeCompare(b.subject) || a.year - b.year);
  fs.writeFileSync(path.join(CACHE, 'selection.json'), JSON.stringify(chosen, null, 1));
  const by = {};
  for (const c of chosen) by[c.subject] = (by[c.subject] || 0) + 1;
  console.log(`selected ${chosen.length} models (pool ${pool.length})`, by);
}

if (STAGE === 'list' || STAGE === 'all') await stageList();
if (STAGE === 'candidates' || STAGE === 'all') stageCandidates();
if (STAGE === 'rescan') stageRescan();
if (STAGE === 'fetch' || STAGE === 'all') await stageFetch();
if (STAGE === 'select' || STAGE === 'all') stageSelect();
