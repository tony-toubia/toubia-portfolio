// Hole Haul timer calibration: a bot plays every level (no rendering, fixed 1/30 s steps, no upgrades) and its clear
// time goes into BOT_SECONDS in public/hole-haul/js/levels.js, which sets each level's timer (with a margin for people).
// Re-run after changing the level generator, the hole's speed or its growth.
//
//   python3 -m http.server 8765 --directory public &
//   node scripts/hole-haul-calibrate.mjs [--base http://localhost:8765] [--chrome /path/to/chrome] [--dry]
//
// Needs playwright-core (resolvable from here or via PLAYWRIGHT_CORE=/path/to/playwright-core) and a Chromium.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const base = arg('base', 'http://localhost:8765');
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const browser = await chromium.launch({
    executablePath: arg('chrome', process.env.CHROME || undefined),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto(`${base}/hole-haul/index.html?t=${Date.now()}`);
await page.waitForFunction(() => window.hh && window.hh.game, null, { timeout: 60000 });

const rows = await page.evaluate(() => {
    const ui = window.hh, g = ui.game; g.renderer.render = () => {};
    const out = [];
    for (let n = 0; n < window.HH_LEVELS.count; n++) {
        ui.play(n); g.start(); g.timeLeft = 9999;
        const W = g.world; let t = 0; const dt = 1 / 30;
        // Items can be knocked out of reach (against a wall, onto something big): give up on one after 3 s for a while.
        const skip = new Map(); let aim = null, since = 0;
        while (g.mode === 'play' && t < 600) {
            // Greedy: the nearest wanted item that fits, else whatever fits and is worth eating to grow.
            let best = null, bs = -1e9;
            for (const i of W.items) {
                if (!i.alive || i.r >= g.holeR * 0.96 || (skip.get(i) || 0) > t) continue;
                const d = Math.hypot(i.x - g.hole.x, i.z - g.hole.z);
                const want = i.kind in W.need && W.got[i.kind] < W.need[i.kind];
                const s = (want ? 6 : 0.4 + i.xp * 0.15) - d * 0.6;
                if (s > bs) { bs = s; best = i; }
            }
            if (best !== aim) { aim = best; since = t; } else if (best && t - since > 3) { skip.set(best, t + 12); aim = null; }
            if (best) { const dx = best.x - g.hole.x, dz = best.z - g.hole.z, l = Math.hypot(dx, dz) || 1; g.setInput(dx / l, -dz / l); } else g.setInput(0, 0);
            g.frame(dt); t += dt;
        }
        out.push({ n, won: g.mode === 'won', t: Math.round(t * 10) / 10, diff: W.def.difficulty, theme: W.def.theme });
    }
    return out;
});
await browser.close();

for (const r of rows) console.log(String(r.n + 1).padStart(2), r.theme.padEnd(8), r.diff.padEnd(10), r.won ? `${r.t}s` : `NOT CLEARED in ${r.t}s`);
const failed = rows.filter((r) => !r.won);
if (failed.length) { console.error(`${failed.length} level(s) the bot could not clear: fix the generator before calibrating.`); process.exit(1); }
if (args.includes('--dry')) process.exit(0);
const file = path.join(ROOT, 'public/hole-haul/js/levels.js');
const src = fs.readFileSync(file, 'utf8');
const table = `const BOT_SECONDS = [${rows.map((r) => r.t).join(', ')}];`;
fs.writeFileSync(file, src.replace(/const BOT_SECONDS = \[[^\]]*\];/, table));
console.log(`wrote ${rows.length} bot times to ${path.relative(ROOT, file)}`);
