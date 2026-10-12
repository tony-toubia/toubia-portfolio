// Headless check of the StudForge generator: piece counts, overlaps and floating parts.
// Usage: node scripts/studforge-test.mjs            (136 built-in prompts)
//        node scripts/studforge-test.mjs "a red barn" "pirate ship"
//        DETAIL=1 node scripts/studforge-test.mjs    (names the offending parts)
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public/studforge/js/') + '/';
const ctx = { console, Math, Object, Array, Set, Map, Number, JSON, String, Error };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['colors.js', 'parts-catalog.js', 'forge-grid.js', 'forge-builders.js', 'forge-builders-2.js', ...fs.readdirSync(dir).filter((f) => /^forge-builders-\d+\.js$/.test(f) && !['forge-builders-2.js'].includes(f)).sort(), 'generator.js']) vm.runInContext(fs.readFileSync(dir + f, 'utf8'), ctx, { filename: f });
const gen = new ctx.BrickGenerator();

const footprint = (b) => b.fp;

const prompts = process.argv.slice(2).length ? process.argv.slice(2) : [
    'cozy alpine cottage with a garden and chimney', 'medieval stone castle with four towers', 'red and white lighthouse on a rocky shore', 'tall modern glass skyscraper', 'five-tier japanese pagoda', 'windmill', 'clock tower', 'water tower', 'obelisk',
    'yellow sports car with a racing stripe', 'fire truck', 'school bus', 'monster truck', 'tractor', 'police car', 'pickup truck', 'convertible', 'motorcycle', 'steam train', 'bullet train', 'tank',
    'airliner', 'fighter jet', 'biplane', 'helicopter', 'drone', 'space shuttle',
    'pirate ship', 'cruise ship', 'submarine', 'battleship', 'speedboat', 'viking longship', 'tugboat',
    'apollo rocket on a launch pad', 'flying saucer', 'space station', 'lunar lander', 'cyberpunk neon hover speeder', 'starfighter', 'tie fighter', 'mars rover',
    'orange recon mech with cannons', 'giant robot',
    'a giraffe', 'red dragon breathing fire', 'elephant', 'cat', 'horse', 'turtle', 'frog', 'dog', 'cow', 'triceratops',
    'parrot', 'penguin', 'flamingo', 'shark', 'blue whale', 'octopus', 'snake', 'bee', 'butterfly', 'spider', 'crab', 't-rex', 'kangaroo',
    'cherry blossom tree', 'pine tree', 'palm tree', 'bonsai', 'sunflower', 'cactus', 'mushroom', 'snow mountain', 'volcano', 'tropical island', 'lily pond', 'christmas tree', 'forest',
    'birthday cake', 'cheeseburger', 'donut', 'pizza', 'coffee mug', 'vintage red espresso machine', 'camera', 'laptop', 'retro tv', 'purple arcade cabinet', 'grand piano', 'guitar', 'table lamp', 'throne', 'sofa', 'treasure chest', 'gift box', 'pumpkin', 'snowman', 'telescope', 'sword', 'shield', 'crown', 'trophy', 'diamond ring', 'headphones',
    'pixel heart', 'space invader', 'skull', 'smiley face', 'lightning bolt',
    'knight', 'wizard', 'astronaut', 'santa', 'superhero', 'pirate captain figure', 'batman', 'mario',
    'bridge', 'fountain', 'pyramid', 'temple', 'colosseum', 'arch',
    'gizmo', 'the eiffel tower', 'my dog max', 'tony', 'a cup of tea', 'haunted mansion', 'steampunk airship', 'micro yellow submarine', 'giant blue whale', 'huge castle', 'tiny cottage',
];
let totalPieces = 0, bad = 0;
const rows = [], struts = [];
for (const pr of prompts) {
    let m;
    try { m = gen.generateFromPrompt(pr); } catch (e) { console.log(`ERROR "${pr}": ${e.message}\n${e.stack.split('\n').slice(1, 3).join('\n')}`); bad++; continue; }
    const occ = new Map();
    let overlaps = 0;
    // Ghost parts (tyres, panes, doors) live inside a host part and are left out of the geometry checks.
    const solids = m.bricks.filter((b) => !b.ghost);
    const fps = solids.map(footprint);
    fps.forEach((f, i) => { for (let y = f.y0; y < f.y0 + f.hp; y++) for (let x = f.x0; x < f.x0 + f.w; x++) for (let z = f.z0; z < f.z0 + f.l; z++) { const k = `${x},${y},${z}`; if (occ.has(k)) overlaps++; else occ.set(k, i); } });
    // Connectivity: parts join only top-to-bottom (studs into tubes). Every assembly must reach the ground.
    const minY = Math.min(...fps.map((f) => f.y0));
    const parent = fps.map((_, i) => i); const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a]))); const union = (a, b) => { parent[find(a)] = find(b); };
    fps.forEach((f, i) => { for (let x = f.x0; x < f.x0 + f.w; x++) for (let z = f.z0; z < f.z0 + f.l; z++) { const d = occ.get(`${x},${f.y0 - 1},${z}`); if (d !== undefined) union(i, d); const u = occ.get(`${x},${f.y0 + f.hp},${z}`); if (u !== undefined) union(i, u); } });
    solids.forEach((b, i) => { if (!b.links) return; for (const [x, y, z] of b.links) { const o = occ.get(`${x},${y},${z}`); if (o !== undefined) union(i, o); } });
    const comps = new Map(); fps.forEach((f, i) => { const r = find(i); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(i); });
    const loose = [...comps.values()].filter((ids) => !ids.some((i) => fps[i].y0 === minY));
    const floating = loose.reduce((n, ids) => n + ids.length, 0);
    const an = m.anchor || { struts: 0, maxStrut: 0, dropped: 0 };
    if (an.struts) struts.push({ kind: m.kind, prompt: pr, struts: an.struts, max: an.maxStrut, pieces: an.strutPieces });
    if (overlaps || floating) bad++;
    if (process.env.DETAIL && (overlaps || floating || an.struts)) {
        const seen = new Map(); const ovl = [];
        fps.forEach((f, i) => { let hit = null; for (let y = f.y0; y < f.y0 + f.hp && !hit; y++) for (let x = f.x0; x < f.x0 + f.w && !hit; x++) for (let z = f.z0; z < f.z0 + f.l; z++) { const k = `${x},${y},${z}`; if (seen.has(k)) { hit = seen.get(k); break; } seen.set(k, i); } if (hit !== null) ovl.push(`${solids[hit].partId}@(${fps[hit].x0},${fps[hit].y0},${fps[hit].z0}) x ${solids[i].partId}@(${f.x0},${f.y0},${f.z0})`); });
        const fl = loose.map((ids) => ids.slice(0, 4).map((i) => `${solids[i].partId}/${solids[i].color}@(${fps[i].x0},${fps[i].y0},${fps[i].z0})`).join('+') + (ids.length > 4 ? `+${ids.length - 4} more` : ''));
        const st = m.bricks.filter((b) => b.strut).map((b) => `${b.color}@(${b.fp.x0},${b.fp.y0},${b.fp.z0})x${b.fp.hp}`);
        console.log(`  "${pr}": overlaps ${ovl.slice(0, 4).join('; ')} | loose ${fl.slice(0, 6).join('; ')} | struts ${st.slice(0, 8).join(' ')}`);
    }
    totalPieces += m.bricks.length;
    rows.push(`${String(m.bricks.length).padStart(4)} pcs ${String(m.steps).padStart(3)} steps  ${String(m.dims.w + 'x' + m.dims.d + 'x' + m.dims.h).padEnd(9)} ovl=${overlaps} loose=${floating} struts=${an.struts}${an.maxStrut ? '/' + an.maxStrut + 'p' : ''}  ${m.kind.padEnd(10)} ${m.name}  <- "${pr}"`);
}
console.log(rows.join('\n'));
console.log(`\n${prompts.length} prompts, mean ${(totalPieces / prompts.length).toFixed(0)} pieces, ${bad} flagged`);
// Struts are the safety net; a builder that leans on tall ones wants a hand-fix.
if (struts.length) {
    const byKind = new Map();
    for (const s of struts) { const k = byKind.get(s.kind) || { n: 0, max: 0, worst: '' }; k.n++; if (s.max > k.max) { k.max = s.max; k.worst = s.prompt; } byKind.set(s.kind, k); }
    console.log(`${struts.length} forges needed struts: ` + [...byKind.entries()].sort((a, b) => b[1].max - a[1].max).map(([k, v]) => `${k} ×${v.n} (tallest ${v.max}p: "${v.worst}")`).join(', '));
}
