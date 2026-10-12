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
const rows = [];
for (const pr of prompts) {
    let m;
    try { m = gen.generateFromPrompt(pr); } catch (e) { console.log(`ERROR "${pr}": ${e.message}\n${e.stack.split('\n').slice(1, 3).join('\n')}`); bad++; continue; }
    const occ = new Map();
    let overlaps = 0;
    const fps = m.bricks.map(footprint);
    fps.forEach((f, i) => { for (let y = f.y0; y < f.y0 + f.hp; y++) for (let x = f.x0; x < f.x0 + f.w; x++) for (let z = f.z0; z < f.z0 + f.l; z++) { const k = `${x},${y},${z}`; if (occ.has(k)) overlaps++; else occ.set(k, i); } });
    let floating = 0;
    const minY = Math.min(...fps.map((f) => f.y0));
    fps.forEach((f, i) => {
        if (f.y0 === minY || m.bricks[i].rotX || m.bricks[i].rotZ) return;
        let ok = false;
        for (let x = f.x0; x < f.x0 + f.w && !ok; x++) for (let z = f.z0; z < f.z0 + f.l; z++) { const k = `${x},${f.y0 - 1},${z}`; if (occ.has(k) && occ.get(k) !== i) { ok = true; break; } }
        if (!ok) { for (let x = f.x0; x < f.x0 + f.w && !ok; x++) for (let z = f.z0; z < f.z0 + f.l; z++) { const k = `${x},${f.y0 + f.hp},${z}`; if (occ.has(k) && occ.get(k) !== i) { ok = true; break; } } }
        if (!ok) floating++;
    });
    totalPieces += m.bricks.length;
    if (overlaps || floating > 2) bad++;
    if (process.env.DETAIL && (overlaps || floating)) {
        // Name the offenders so the builder can be fixed.
        const seen = new Map(); const ovl = [], fl = [];
        fps.forEach((f, i) => { let hit = null; for (let y = f.y0; y < f.y0 + f.hp && !hit; y++) for (let x = f.x0; x < f.x0 + f.w && !hit; x++) for (let z = f.z0; z < f.z0 + f.l; z++) { const k = `${x},${y},${z}`; if (seen.has(k)) { hit = seen.get(k); break; } seen.set(k, i); } if (hit !== null) ovl.push(`${m.bricks[hit].partId}@(${fps[hit].x0},${fps[hit].y0},${fps[hit].z0}) x ${m.bricks[i].partId}@(${f.x0},${f.y0},${f.z0})`); });
        fps.forEach((f, i) => { if (f.y0 === minY || m.bricks[i].rotX || m.bricks[i].rotZ) return; let ok = false; for (let x = f.x0; x < f.x0 + f.w && !ok; x++) for (let z = f.z0; z < f.z0 + f.l; z++) { if (occ.has(`${x},${f.y0 - 1},${z}`) || occ.has(`${x},${f.y0 + f.hp},${z}`)) { ok = true; break; } } if (!ok) fl.push(`${m.bricks[i].partId}@(${f.x0},${f.y0},${f.z0})`); });
        console.log(`  "${pr}": overlaps ${ovl.slice(0, 4).join('; ')} | floating ${fl.slice(0, 6).join('; ')}`);
    }
    rows.push(`${String(m.bricks.length).padStart(4)} pcs ${String(m.steps).padStart(3)} steps  ${String(m.dims.w + 'x' + m.dims.d + 'x' + m.dims.h).padEnd(9)} ovl=${overlaps} float=${floating}  ${m.kind.padEnd(10)} ${m.name}  <- "${pr}"`);
}
console.log(rows.join('\n'));
console.log(`\n${prompts.length} prompts, mean ${(totalPieces / prompts.length).toFixed(0)} pieces, ${bad} flagged`);
