// Hole Haul: themes and the level generator.
//
// HH_LEVELS.count                  how many levels there are
// HH_LEVELS.def(n)                 level n (0-based): { n, theme, w, d, time, difficulty, targets: [{ kind, count }],
//                                  items: [{ kind, x, z, rot }] } — deterministic, so a level is the same every time
// HH_LEVELS.themes[id]             board look: floor pattern and colours, rim, sky
// HH_LEVELS.packs                  [{ theme, name, first, last }] — five levels per pack, in map order
//
// Every level is built from the object library (HH_MODELS.kinds): targets are small enough to eat early or need a
// little growth first (later levels), fillers are the rest of the theme's kinds, and a few big pieces wait for a
// grown hole. The timer is worked out from what must be eaten, then tightened on hard levels.
(() => {
    const THEMES = {
        picnic: { name: 'Picnic Park', floor: 'grass', a: '#7cc957', b: '#6bb84a', rim: '#8b5a2b', sky: '#9fdcff', fog: '#cdeeff' },
        kitchen: { name: 'Kitchen Counter', floor: 'tiles', a: '#f4f1ea', b: '#dfe8ef', rim: '#c98b5a', sky: '#ffe2c4', fog: '#fff0e0' },
        toys: { name: 'Toy Room', floor: 'wood', a: '#e2b07a', b: '#d39e66', rim: '#8e5fbf', sky: '#d9c8ff', fog: '#eee6ff' },
        garden: { name: 'Back Garden', floor: 'soil', a: '#8ccf5a', b: '#7a5a3a', rim: '#f2f2f2', sky: '#b9e8ff', fog: '#e2f6ff' },
        beach: { name: 'Sunny Beach', floor: 'sand', a: '#f6dfa4', b: '#efd08a', rim: '#4fb3e8', sky: '#8fd8ff', fog: '#d8f3ff' },
        city: { name: 'Main Street', floor: 'asphalt', a: '#5d6470', b: '#f5f5f5', rim: '#b9bec7', sky: '#bcd4ee', fog: '#e4edf7' },
    };
    const ORDER = ['picnic', 'kitchen', 'toys', 'garden', 'beach', 'city'];
    const PER_PACK = 5, PACK_ROUNDS = 2;
    const COUNT = ORDER.length * PER_PACK * PACK_ROUNDS;   // 60 levels

    // Bot clear times per level (seconds), written by scripts/hole-haul-calibrate.mjs; regenerate after changing the
    // generator, the hole speed or growth.
    const BOT_SECONDS = [7.5, 3.2, 10.1, 6.4, 10.5, 13.1, 9, 8.6, 12.4, 14.6, 12.8, 13.7, 14.8, 13.2, 16.5, 19.3, 12.8, 28.1, 22, 18.1, 21.5, 17.7, 20.1, 20.3, 18.7, 18.2, 24.8, 29.5, 22.2, 19.4, 21.6, 27.3, 22.8, 22.8, 29.4, 26.1, 25.3, 26.1, 35, 20.7, 25.7, 22.1, 19.4, 22.2, 18.7, 23.5, 26.7, 20.9, 32, 25.5, 25.2, 28.7, 22.9, 31.5, 25.9, 21.8, 21.6, 26.2, 26.1, 31.2];

    const rngFor = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
    const shuffle = (rng, arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

    const kindsOf = (theme) => {
        const K = (window.HH_MODELS && window.HH_MODELS.kinds) || {};
        return Object.entries(K).filter(([id, k]) => id !== 'coin' && (k.themes || []).includes(theme)).map(([id, k]) => ({ id, ...k }));
    };

    function def(n) {
        n = Math.max(0, Math.min(COUNT - 1, n | 0));
        const rng = rngFor(n * 7919 + 1013);
        const pack = Math.floor(n / PER_PACK), theme = ORDER[pack % ORDER.length], round = Math.floor(pack / ORDER.length);
        const inPack = n % PER_PACK;
        // Difficulty: the last level of each pack is hard; every other pack's last level of round two is super hard.
        const difficulty = inPack === PER_PACK - 1 ? (round > 0 && pack % 2 ? 'Super hard' : 'Hard') : 'Normal';
        const all = kindsOf(theme);
        const small = all.filter((k) => k.r <= 0.36), medium = all.filter((k) => k.r > 0.36 && k.r <= 0.9);
        const large = all.filter((k) => k.r > 0.9 && k.r <= 1.6), huge = all.filter((k) => k.r > 1.6);

        // Board: grows a little through the game; portrait-ish so it suits a phone.
        const w = Math.round(14 + Math.min(n, 30) * 0.33), d = Math.round(w * 1.35);

        // Targets: one kind on the first levels, then two, then up to three; later ones may need some growth first.
        const nKinds = n < 2 ? 1 : n < 9 ? 2 : (rng() < 0.55 ? 3 : 2);
        const pool = shuffle(rng, small);
        const targets = [];
        for (let i = 0; i < nKinds && pool.length; i++) {
            let k = pool.shift();
            if (i === nKinds - 1 && n >= 6 && medium.length && rng() < 0.5) k = pick(rng, medium);
            if (i === nKinds - 1 && n >= 18 && large.length && rng() < 0.3) k = pick(rng, large);
            if (targets.some((t) => t.kind === k.id)) continue;
            const base = 6 + Math.min(n, 40) * 0.45 + (difficulty !== 'Normal' ? 3 : 0);
            const count = Math.max(3, Math.round(base * (k.r <= 0.36 ? 1 : k.r <= 0.9 ? 0.55 : 0.3) * (0.8 + rng() * 0.4)));
            targets.push({ kind: k.id, count, r: k.r });
        }

        const items = [];
        const placed = [];   // [x, z, r] for overlap checks
        const free = (x, z, r) => {
            if (Math.abs(x) > w / 2 - r - 0.2 || Math.abs(z) > d / 2 - r - 0.2) return false;
            if (x * x + (z - d * 0.22) ** 2 < 1.4) return false;   // keep the start spot clear
            for (const p of placed) { const dx = p[0] - x, dz = p[1] - z, m = (p[2] + r) * 0.92; if (dx * dx + dz * dz < m * m) return false; }
            return true;
        };
        const put = (kind, r, x, z) => { placed.push([x, z, r]); items.push({ kind, x: +x.toFixed(3), z: +z.toFixed(3), rot: +(rng() * Math.PI * 2).toFixed(3) }); };
        const scatter = (kind, r, tries = 40) => { for (let t = 0; t < tries; t++) { const x = (rng() - 0.5) * w, z = (rng() - 0.5) * d; if (free(x, z, r)) { put(kind, r, x, z); return true; } } return false; };
        const pileCentres = [];
        const cluster = (kind, r, count, spread = false) => {
            // A pile: items around a centre, spiralling out until they fit. Target piles are spread over the board
            // (the best of a few random centres, furthest from the piles already placed), so finding them takes a trip.
            const centre = () => {
                let best = null, bd = -1;
                for (let c = 0; c < (spread ? 8 : 1); c++) {
                    const x = (rng() - 0.5) * (w - 3), z = (rng() - 0.5) * (d - 3);
                    const md = pileCentres.length ? Math.min(...pileCentres.map(([px, pz]) => Math.hypot(px - x, pz - z))) : 99;
                    if (md > bd) { bd = md; best = [x, z]; }
                }
                if (spread) pileCentres.push(best);
                return best;
            };
            let [cx, cz] = centre(), done = 0;
            for (let t = 0; t < count * 30 && done < count; t++) {
                const a = rng() * Math.PI * 2, rad = r * (0.5 + Math.sqrt(t) * 0.75);
                const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
                if (free(x, z, r)) { put(kind, r, x, z); done++; }
                if (t % 60 === 59) [cx, cz] = centre();
            }
            return done;
        };

        // A few big pieces first (they need room), then the targets in piles, then fillers to fill the board.
        const nHuge = Math.min(huge.length ? 1 + Math.floor(n / 12) : 0, 3);
        for (let i = 0; i < nHuge; i++) { const k = pick(rng, huge); scatter(k.id, k.r, 60); }
        const nLarge = large.length ? 2 + Math.floor(rng() * 3) + Math.floor(n / 10) : 0;
        for (let i = 0; i < nLarge; i++) { const k = pick(rng, large); scatter(k.id, k.r, 50); }
        for (const t of targets) {
            const want = Math.ceil(t.count * 1.3) + 1;   // spares: some will be hard to reach
            let got = 0;
            const piles = Math.max(2, Math.round(want / (t.r <= 0.36 ? 4 : 2)));
            for (let p = 0; p < piles; p++) got += cluster(t.kind, t.r, Math.ceil((want - got) / (piles - p)), true);
            while (got < t.count + 1 && scatter(t.kind, t.r, 80)) got++;
            t.count = Math.min(t.count, got);
        }
        const fillers = [...small, ...small, ...medium, ...medium, ...medium].filter((k) => !targets.some((t) => t.kind === k.id));
        const area = w * d, budget = area * (0.16 + Math.min(n, 30) * 0.003);
        let used = 0;
        for (let guard = 0; used < budget && guard < 600 && fillers.length && items.length < 400; guard++) {   // ~420 items at most: phones stay smooth
            const k = pick(rng, fillers);
            const ok = rng() < 0.6 ? cluster(k.id, k.r, 2 + Math.floor(rng() * 4)) : (scatter(k.id, k.r) ? 1 : 0);
            used += ok * Math.PI * k.r * k.r;
        }
        for (let i = 0; i < 8; i++) scatter('coin', 0.14, 30);

        // Time: from the calibration table (a bot's clear time on this exact level, see scripts/hole-haul-calibrate.mjs),
        // times a margin for people (looser on normal levels, tighter on hard ones); a rough estimate if the table lacks it.
        const need = targets.reduce((s, t) => s + t.count * (t.r <= 0.36 ? 1.2 : t.r <= 0.9 ? 2 : 3), 0);
        const bot = BOT_SECONDS[n] || (8 + need + area * 0.02);
        const margin = difficulty === 'Super hard' ? 1.9 : difficulty === 'Hard' ? 2.2 : 2.8;
        const time = Math.max(40, Math.min(240, Math.round((bot * margin + 20) / 5) * 5));

        return { n, theme, round, w, d, time, difficulty, targets: targets.map(({ kind, count }) => ({ kind, count })), items };
    }

    const packs = [];
    for (let p = 0; p < COUNT / PER_PACK; p++) {
        const theme = ORDER[p % ORDER.length], round = Math.floor(p / ORDER.length);
        packs.push({ theme, name: THEMES[theme].name + (round ? ' II' : ''), first: p * PER_PACK, last: p * PER_PACK + PER_PACK - 1 });
    }

    window.HH_LEVELS = { count: COUNT, def, themes: THEMES, packs };
})();
