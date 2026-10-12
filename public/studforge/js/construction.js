// StudForge construction profiles: HOW real sets of a subject are built.
//
// Loads `data/construction.json` (written by scripts/ldraw/analyse.mjs from LDraw reconstructions of
// official sets) into `window.STUDFORGE_CONSTRUCTION` and exposes `window.FORGE.construction`:
//   profile(subjectId)   → the subject's profile ({ n, source, proportions, hollow, layers, buildOrder,
//                          interiors, techniques, examples, ours }) or null
//   normalize(model)     → a model's bricks in the analysis shape (see below)
//   measure(norm)        → the per-model metrics the profiles aggregate (also used live by the panel)
//   finishTops(bricks, profile) → the generator's tile-finishing post-pass (see there)
//   section(model)       → the "HOW REAL SETS ARE BUILT" block for the REAL SETS panel
// The SAME measure() runs in the analysis script (node vm) and in the browser, so the numbers the panel
// shows for the current model are directly comparable with the real-set profile.
//
// Analysis brick shape: { cat, part, color, fp: {x0,z0,y0,w,l,hp} | null, y (plates, for off-grid parts),
//   side (the part's up axis is not vertical), step, sub, interior: type | null, figure, top: 'tile'|'studs'|'slope'|'none' }
(function () {
    window.STUDFORGE_CONSTRUCTION = window.STUDFORGE_CONSTRUCTION || null;
    window.FORGE = window.FORGE || { builders: [], helpers: {} };

    const data = () => window.STUDFORGE_CONSTRUCTION;
    const CATS = ['plate', 'brick', 'tile', 'slope', 'round', 'snot', 'wheel', 'window', 'hinge', 'interior', 'special'];
    // Minifig-scale interior elements by LDraw id (the analysis also reads part names; these cover the live panel).
    const INTERIOR_IDS = { 4079: 'seat', '4079a': 'seat', '4079b': 'seat', '3829c01': 'steering', 3829: 'steering', 30663: 'steering', '3069bp68': 'panel' };

    /** Category of a catalog part (window.LEGO_PARTS entry). */
    function catOfDef(d) {
        if (!d) return 'special';
        if (d.isWheel || d.isTire || d.isAxlePlate) return 'wheel';
        if (d.isWindow || d.isGlass || d.isDoor || d.isDoorFrame || d.isFence) return 'window';
        if (d.isHinge || d.isTurntable || d.isClip || d.isBar || d.isBarHandle || d.isPin || d.isFlag || d.isPropeller) return 'hinge';
        if (d.isBracket || d.sideStuds || d.isHeadlight) return 'snot';
        if (d.isTile) return 'tile';
        if (d.isSlope || d.isInvertedSlope) return 'slope';
        if (d.isRound || d.isCone || d.isDome || d.isDish || d.isRoundCorner) return 'round';
        if (d.category === 'Plates') return 'plate';
        if (d.category === 'Bricks' || d.isArch) return 'brick';
        return 'special';
    }
    /** What the top of a catalog part offers: studs to build on, a smooth tile, a slope, or nothing. */
    function topOfDef(d) {
        if (!d) return 'none';
        if (d.isTile) return 'tile';
        if (d.isSlope) return 'slope';
        return d.hasStuds ? 'studs' : 'none';
    }
    const sideways = (b) => {
        if (Array.isArray(b.matrix) && b.matrix.length === 9) return Math.abs(b.matrix[4]) < 0.5;
        return Math.abs(Math.sin(b.rotX || 0)) > 0.5 || Math.abs(Math.sin(b.rotZ || 0)) > 0.5;
    };

    /** A generator model (or an expanded reference model) → analysis bricks. Generated steps are the layers. */
    function normalize(model) {
        const P = window.LEGO_PARTS || {};
        return (model.bricks || []).filter((b) => !b.ghost).map((b) => {
            const id = String(b.catalogId || b.partId);
            const d = P[id];
            const interior = INTERIOR_IDS[b.partId] || INTERIOR_IDS[id] || null;
            return { cat: interior ? 'interior' : catOfDef(d), part: String(b.partId), color: b.color, fp: b.fp || null, y: (b.y || 0) / 0.4, px: b.x, pz: b.z, side: sideways(b), step: b.layer || 0, sub: b.sub || 0, interior, figure: false, top: d ? topOfDef(d) : 'none' };
        });
    }

    /* ── measuring one model ─────────────────────────────────── */

    const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
    const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const shares = (counts, total, top) => { const out = {}; const e = Object.entries(counts).sort((a, b) => b[1] - a[1]); for (const [k, v] of (top ? e.slice(0, top) : e)) if (v) out[k] = r2(v / (total || 1)); return out; };
    const colorShares = (list, top) => { const c = {}; for (const b of list) c[b.color] = (c[b.color] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => [k, r2(v / list.length)]); };
    const ROLE_WORDS = [['cab', /cab|cockpit|driver|bridge/], ['engine', /engine|motor|thruster|exhaust/], ['wing', /wing|fin/], ['roof', /roof|top|canopy|lid/], ['ladder', /ladder/], ['wheels', /wheel|axle|tyre|tire|bogie|chassis wheel/], ['door', /door|gate|hatch/], ['tower', /tower|turret|spire/], ['mast', /mast|sail|rig/], ['arm', /arm|boom|crane|claw/], ['tail', /tail|rudder/], ['chassis', /chassis|base|frame|hull|floor|deck/], ['wall', /wall|facade|side/], ['figure', /minifig|fig|driver|pilot|crew|figure/], ['weapon', /cannon|gun|weapon|launcher|catapult/], ['interior', /interior|seat|kitchen|bed|room/]];
    function roleOf(name, pos) {
        const n = String(name || '').toLowerCase();
        for (const [role, re] of ROLE_WORDS) if (re.test(n)) return role;
        if (pos.h > 0.7) return 'upper';
        if (pos.along < 0.2 || pos.along > 0.8) return 'end';
        return 'body';
    }

    /**
     * Per-model construction metrics. `norm` = analysis bricks; `names` = submodel names (real models).
     * Figures (minifigs, accessories) are left out of the structure: they stand beside or inside the model.
     */
    function measure(norm, names) {
        const kept = norm.filter((b) => !b.figure);
        const grid0 = kept.filter((b) => b.fp);
        if (!grid0.length) return null;
        // A display base or baseplate (one plate layer under most of the footprint, something on it) is
        // measured apart: proportions, hollowness and walls describe what stands on it.
        let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity, by0 = Infinity;
        for (const b of grid0) { const f = b.fp; bx0 = Math.min(bx0, f.x0); bx1 = Math.max(bx1, f.x0 + f.w - 1); bz0 = Math.min(bz0, f.z0); bz1 = Math.max(bz1, f.z0 + f.l - 1); by0 = Math.min(by0, f.y0); }
        const baseParts = new Set(grid0.filter((b) => b.fp.y0 === by0 && b.fp.hp === 1 && b.cat === 'plate'));
        const baseCells = [...baseParts].reduce((a, b) => a + b.fp.w * b.fp.l, 0);
        const baseCov = baseCells / ((bx1 - bx0 + 1) * (bz1 - bz0 + 1));
        const onBase = baseCov >= 0.6 && grid0.length > baseParts.size + 2;
        let all = onBase ? kept.filter((b) => !baseParts.has(b)) : kept;
        // Face-touching groups of grid parts (what stands apart from what).
        const groupsOf = (list) => {
            const rest = list.filter((b) => b.fp), at = new Map(), k3 = (x, y, z) => `${x},${y},${z}`;
            rest.forEach((b, i) => { const f = b.fp; for (let y = f.y0; y < f.y0 + f.hp; y++) for (let x = f.x0; x < f.x0 + f.w; x++) for (let z = f.z0; z < f.z0 + f.l; z++) at.set(k3(x, y, z), i); });
            const par = rest.map((_, i) => i), find = (a) => (par[a] === a ? a : (par[a] = find(par[a])));
            for (const [k, i] of at) { const [x, y, z] = k.split(',').map(Number); for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) { const j = at.get(k3(x + dx, y + dy, z + dz)); if (j !== undefined) par[find(i)] = find(j); } }
            const groups = new Map(); rest.forEach((b, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(b); });
            return [...groups.values()].map((g) => ({ g, x0: Math.min(...g.map((b) => b.fp.x0)), x1: Math.max(...g.map((b) => b.fp.x0 + b.fp.w - 1)), z0: Math.min(...g.map((b) => b.fp.z0)), z1: Math.max(...g.map((b) => b.fp.z0 + b.fp.l - 1)), lo: Math.min(...g.map((b) => b.fp.y0)), hi: Math.max(...g.map((b) => b.fp.y0 + b.fp.hp)) }));
        };
        const groups = groupsOf(all);
        let apart = 0;
        if (onBase) {
            // What sits on a base apart from the subject itself: flat decoration (road markings, paths, tiles),
            // i.e. groups at most 2 plates tall holding under 10% of the pieces.
            const n = groups.reduce((a, g) => a + g.g.length, 0), deco = new Set();
            for (const g of groups) if (g.hi - g.lo <= 2 && g.g.length < 0.1 * n) for (const b of g.g) deco.add(b);
            if (deco.size < n) all = all.filter((b) => !deco.has(b));
        } else if (groups.length > 1) {
            // No base: the subject is the biggest group plus whatever overlaps its footprint (a roof on off-grid
            // hinges, a trailer hitched to it). Other vehicles, track, scenery and spare parts laid out beside
            // the model are left out.
            groups.sort((a, b) => b.g.length - a.g.length);
            const box = { x0: groups[0].x0 - 1, x1: groups[0].x1 + 1, z0: groups[0].z0 - 1, z1: groups[0].z1 + 1 };
            const keep = new Set([groups[0]]);
            for (let grew = true; grew;) {
                grew = false;
                for (const g of groups) if (!keep.has(g) && g.x0 <= box.x1 && g.x1 >= box.x0 && g.z0 <= box.z1 && g.z1 >= box.z0) { keep.add(g); grew = true; box.x0 = Math.min(box.x0, g.x0 - 1); box.x1 = Math.max(box.x1, g.x1 + 1); box.z0 = Math.min(box.z0, g.z0 - 1); box.z1 = Math.max(box.z1, g.z1 + 1); }
            }
            const kept = new Set(); for (const g of keep) for (const b of g.g) kept.add(b);
            const inBox = (b) => b.px == null || (b.px >= box.x0 - 1 && b.px <= box.x1 + 1 && b.pz >= box.z0 - 1 && b.pz <= box.z1 + 1);
            const before = all.length;
            all = all.filter((b) => (b.fp ? kept.has(b) : inBox(b)));
            apart = before - all.length;
        }
        const grid = all.filter((b) => b.fp);
        const occ = new Map(), key = (x, y, z) => `${x},${y},${z}`;
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        grid.forEach((b, i) => { const f = b.fp; for (let y = f.y0; y < f.y0 + f.hp; y++) for (let x = f.x0; x < f.x0 + f.w; x++) for (let z = f.z0; z < f.z0 + f.l; z++) occ.set(key(x, y, z), i); x0 = Math.min(x0, f.x0); x1 = Math.max(x1, f.x0 + f.w - 1); z0 = Math.min(z0, f.z0); z1 = Math.max(z1, f.z0 + f.l - 1); y0 = Math.min(y0, f.y0); y1 = Math.max(y1, f.y0 + f.hp - 1); });
        const W = x1 - x0 + 1, D = z1 - z0 + 1, H = y1 - y0 + 1;
        const alongX = W >= D, len = Math.max(W, D), wid = Math.min(W, D);
        // Columns: lowest and highest occupied plate.
        const cols = new Map();
        for (const k of occ.keys()) { const [x, y, z] = k.split(',').map(Number); const c = cols.get(x + ',' + z); if (!c) cols.set(x + ',' + z, { lo: y, hi: y }); else { if (y < c.lo) c.lo = y; if (y > c.hi) c.hi = y; } }
        // Columns enclosed by walls: empty columns a 2D flood from outside the bounding box cannot reach.
        const seen = new Set(), stack = [];
        for (let x = x0 - 1; x <= x1 + 1; x++) { stack.push([x, z0 - 1], [x, z1 + 1]); }
        for (let z = z0 - 1; z <= z1 + 1; z++) { stack.push([x0 - 1, z], [x1 + 1, z]); }
        while (stack.length) {
            const [x, z] = stack.pop(), k = x + ',' + z;
            if (seen.has(k) || x < x0 - 1 || x > x1 + 1 || z < z0 - 1 || z > z1 + 1 || cols.has(k)) continue;
            seen.add(k); stack.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
        }
        const enclosed = new Map();   // "x,z" → { lo, hi } borrowed from the bordering walls
        const groupSeen = new Set();
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
            const k = x + ',' + z;
            if (cols.has(k) || seen.has(k) || groupSeen.has(k)) continue;
            const group = [], los = [], his = [], st = [[x, z]];
            while (st.length) {
                const [a, c] = st.pop(), kk = a + ',' + c;
                if (groupSeen.has(kk)) continue;
                const col = cols.get(kk);
                if (col) { los.push(col.lo); his.push(col.hi); continue; }
                groupSeen.add(kk); group.push(kk); st.push([a + 1, c], [a - 1, c], [a, c + 1], [a, c - 1]);
            }
            const lo = median(los), hi = median(his);
            for (const g of group) enclosed.set(g, { lo: Math.round(lo), hi: Math.round(hi) });
        }
        // Interior air: empty cells strictly between a column's lowest and highest plate, plus enclosed columns.
        let air = 0;
        for (const [k, c] of cols) { const [x, z] = k.split(',').map(Number); for (let y = c.lo + 1; y < c.hi; y++) if (!occ.has(key(x, y, z))) air++; }
        for (const c of enclosed.values()) air += Math.max(0, c.hi - c.lo + 1);
        const solid = occ.size;
        const isAir = (x, y, z) => {
            if (occ.has(key(x, y, z))) return false;
            const c = cols.get(x + ',' + z); if (c) return y > c.lo && y < c.hi;
            const e = enclosed.get(x + ',' + z); return !!e && y >= e.lo && y <= e.hi;
        };
        // Wall thickness: in the middle of the height, runs of solid cells with interior air on one side
        // and the outside on the other.
        const walls = [];
        const yA = y0 + Math.floor(H * 0.15), yB = y0 + Math.ceil(H * 0.8);
        const state = (x, y, z) => (occ.has(key(x, y, z)) ? 'O' : isAir(x, y, z) ? 'A' : 'E');
        for (let y = yA; y <= yB; y++) {
            const scan = (n, cell) => {
                let run = 0, before = 'E';
                for (let i = -1; i <= n; i++) {
                    const s = i < 0 || i >= n ? 'E' : cell(i);
                    if (s === 'O') { run++; continue; }
                    if (run && ((before === 'A' && s === 'E') || (before === 'E' && s === 'A'))) walls.push(run);
                    run = 0; before = s;
                }
            };
            for (let z = z0; z <= z1; z++) scan(W, (i) => state(x0 + i, y, z));
            for (let x = x0; x <= x1; x++) scan(D, (i) => state(x, y, z0 + i));
        }
        const wallMed = median(walls);
        const wall = walls.length ? { median: wallMed, s1: r2(walls.filter((v) => v === 1).length / walls.length), s2: r2(walls.filter((v) => v === 2).length / walls.length), s3: r2(walls.filter((v) => v >= 3).length / walls.length) } : null;

        // Height of every part, 0 (bottom) … 1 (top), from its grid footprint or its origin.
        // Bands go by where a part starts (its lowest plate), so the wheels and chassis plates of a low model are its bottom band.
        const yb = (b) => { const v = b.fp ? b.fp.y0 : b.y; return H > 1 ? Math.max(0, Math.min(1, (v - y0) / H)) : 0.5; };
        const yc = (b) => { const v = b.fp ? b.fp.y0 + b.fp.hp / 2 : b.y; return H > 1 ? Math.max(0, Math.min(1, (v - y0) / H)) : 0.5; };
        const alongOf = (b) => { const f = b.fp; if (!f) return 0.5; const c = alongX ? f.x0 + f.w / 2 - x0 : f.z0 + f.l / 2 - z0; return Math.max(0, Math.min(1, c / len)); };

        // Base: a building stands on a plate covering most of its footprint; a vehicle stands on its own (wheels).
        const wheels = all.filter((b) => b.cat === 'wheel').length;
        const base = onBase ? { kind: 'plate', coverage: r2(baseCov), w: bx1 - bx0 + 1, d: bz1 - bz0 + 1 } : { kind: wheels ? 'wheels' : 'self' };

        // Layer recipe: bottom 15%, middle, top 20%.
        const bands = [['bottom', 0, 0.15], ['middle', 0.15, 0.8], ['top', 0.8, 1.01]].map(([name, a, b]) => {
            const list = all.filter((p) => { const h = yb(p); return h >= a && h < b; });
            const c = {}; for (const p of list) c[p.cat] = (c[p.cat] || 0) + 1;
            return { band: name, share: r2(list.length / all.length), cats: shares(c, list.length), colors: colorShares(list, 4) };
        });

        // Build order: progress through the real steps (0 … 1) against height and part kind.
        const stepIds = [...new Set(all.map((b) => b.step))].sort((a, b) => a - b);
        const rank = new Map(stepIds.map((s, i) => [s, stepIds.length > 1 ? i / (stepIds.length - 1) : 0]));
        const prog = (b) => rank.get(b.step);
        const phases = [0, 1, 2, 3, 4].map((i) => {
            const list = all.filter((b) => { const p = prog(b); return i === 4 ? p >= 0.8 : p >= i / 5 && p < (i + 1) / 5; });
            const c = {}; for (const p of list) c[p.cat] = (c[p.cat] || 0) + 1;
            return { share: r2(list.length / all.length), h: r2(list.length ? list.reduce((a, b) => a + yc(b), 0) / list.length : null), cats: shares(c, list.length, 3) };
        });
        const ps = all.map(prog), hs = all.map(yc);
        const mp = ps.reduce((a, b) => a + b, 0) / ps.length, mh = hs.reduce((a, b) => a + b, 0) / hs.length;
        let cov = 0, vp = 0, vh = 0; for (let i = 0; i < ps.length; i++) { cov += (ps[i] - mp) * (hs[i] - mh); vp += (ps[i] - mp) ** 2; vh += (hs[i] - mh) ** 2; }
        const heightCorr = vp && vh ? cov / Math.sqrt(vp * vh) : 1;
        const medProg = (list) => r2(median(list.map(prog)));
        const interiorItems = all.filter((b) => b.interior);
        const wallParts = all.filter((b) => (b.cat === 'brick' || b.cat === 'window') && yb(b) >= 0.15 && yb(b) < 0.8);
        const roofParts = all.filter((b) => yb(b) >= 0.8);
        // Sub-assemblies: what the instructions build apart and attach (real models name them).
        // The submodel holding most of the structure is the model itself (often 'main' only places submodels);
        // every other submodel is a sub-assembly. Submodels of 1 piece are references, not assemblies.
        const subCount = new Map(); for (const b of all) subCount.set(b.sub, (subCount.get(b.sub) || 0) + 1);
        const primary = [...subCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const subIds = [...subCount.keys()].filter((s) => s !== primary && subCount.get(s) > 1);
        const subs = subIds.map((s) => {
            const list = all.filter((b) => b.sub === s);
            const pos = { h: r2(list.reduce((a, b) => a + yc(b), 0) / list.length), along: r2(list.reduce((a, b) => a + alongOf(b), 0) / list.length) };
            const name = names && names[s] ? String(names[s]) : `sub ${s}`;
            return { name: name.replace(/\.(ldr|dat)$/i, '').slice(0, 40), n: list.length, role: roleOf(name, pos), h: pos.h, along: pos.along };
        });
        const buildOrder = {
            steps: stepIds.length, perStep: r2(all.length / stepIds.length), per100: r2(stepIds.length / all.length * 100), heightCorr: r2(heightCorr),
            phases, interiorAt: interiorItems.length ? medProg(interiorItems) : null, wallsAt: wallParts.length ? medProg(wallParts) : null, roofAt: roofParts.length ? medProg(roofParts) : null,
            subShare: r2(subs.reduce((a, x) => a + x.n, 0) / all.length), primary: names && names[primary] ? String(names[primary]).slice(0, 40) : null, subs,
        };

        // Interiors: which minifig-scale elements, how high, how far along, and whether walls surround them.
        const interiors = {};
        for (const b of interiorItems) {
            const e = interiors[b.interior] || (interiors[b.interior] = { count: 0, h: [], along: [], inside: 0 });
            e.count++; e.h.push(yc(b)); e.along.push(alongOf(b));
            if (b.fp) {
                const f = b.fp, y = f.y0;
                const hit = (dx, dz) => { for (let s = 1; s <= len; s++) { const x = f.x0 + dx * s, z = f.z0 + dz * s; if (x < x0 || x > x1 || z < z0 || z > z1) return false; for (let dy = 0; dy < 4; dy++) if (occ.has(key(x, y + dy, z))) return true; } return false; };
                if ([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, c]) => hit(a, c)).length >= 3) e.inside++;
            }
        }
        for (const e of Object.values(interiors)) { e.h = r2(median(e.h)); e.along = r2(median(e.along)); e.inside = r2(e.inside / e.count); }

        // Techniques, and how the top surfaces are finished (the part seen from above in each column).
        const c = {}; for (const b of all) c[b.cat] = (c[b.cat] || 0) + 1;
        const tops = { tile: 0, studs: 0, slope: 0, none: 0 };
        for (const [k, col] of cols) { const [x, z] = k.split(',').map(Number); const b = grid[occ.get(key(x, col.hi, z))]; tops[b.top || 'none']++; }
        const topN = tops.tile + tops.studs + tops.slope + tops.none || 1;
        const techniques = {
            offGrid: r2(all.filter((b) => !b.fp).length / all.length), sideways: r2(all.filter((b) => b.side).length / all.length),
            snot: r2((c.snot || 0) / all.length), hinge: r2((c.hinge || 0) / all.length), window: r2((c.window || 0) / all.length), wheel: r2((c.wheel || 0) / all.length),
            tileTop: r2(tops.tile / ((tops.tile + tops.studs) || 1)), topTile: r2(tops.tile / topN), topStuds: r2(tops.studs / topN), topSlope: r2(tops.slope / topN),
            cats: shares(c, all.length),
        };
        return {
            pieces: all.length, figures: norm.length - kept.length, baseAndDeco: onBase ? kept.length - all.length : 0, apart,
            proportions: { w: W, d: D, hp: H, len, wid, hb: r2(H / 3), wl: r2(wid / len), hl: r2(H / 3 / len), axis: alongX ? 'x' : 'z', base },
            hollow: { share: r2(air / (air + solid)), interior: r2(air / (W * D * H)), enclosedCols: enclosed.size, wall },
            layers: bands, buildOrder, interiors, techniques,
        };
    }

    /* ── the generator's tile-finishing post-pass ────────────── */

    // Plates that have a tile of the same footprint in the catalog, and the tiles a longer plate splits into.
    const TILE_FOR = { 3024: '3070', 3023: '3069', 3710: '2431', 3666: '6636', 3022: '3068', 3020: '87079' };
    const TILE_SIZES = [[2, 4, '87079'], [1, 6, '6636'], [1, 4, '2431'], [2, 2, '3068'], [1, 2, '3069'], [1, 1, '3070']];

    /** Cover a w×l rectangle with catalog tiles, largest first, both orientations: [[dx, dz, w, l, id]]. */
    function tileCover(w, l) {
        const taken = new Set(), out = [];
        const sizes = []; for (const [a, b, id] of TILE_SIZES) { sizes.push([a, b, id]); if (a !== b) sizes.push([b, a, id]); }
        for (let x = 0; x < w; x++) for (let z = 0; z < l; z++) {
            if (taken.has(x + ',' + z)) continue;
            for (const [a, b, id] of sizes) {
                if (x + a > w || z + b > l) continue;
                let ok = true; for (let i = 0; i < a && ok; i++) for (let j = 0; j < b; j++) if (taken.has((x + i) + ',' + (z + j))) { ok = false; break; }
                if (!ok) continue;
                for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) taken.add((x + i) + ',' + (z + j));
                out.push([x, z, a, b, id]); break;
            }
        }
        return out;
    }

    /**
     * Real sets smooth many of their top surfaces (bonnets, decks, roofs) with tiles. Turn exposed top
     * plates into tiles until the model's tile share of its stud-or-tile tops reaches the subject's real
     * share: first plates that have a tile of the same size (a straight swap), then longer plates split into
     * tiles covering the same cells. Only plates nothing touches from above (no part, ghost or not, on any
     * cell over them, nothing linked into them), never the two lowest layers, never struts or linked parts. The
     * footprint is unchanged, so no overlap is possible; nothing is above, so nothing loses its studs; a split
     * is undone when it would leave any part unconnected to the ground (a tile segment over air, or a plate
     * that was the only bridge between two parts below). Deterministic. Mutates `bricks` (splits are spliced
     * in place). Returns { from, to, target, tiled, split } or null when there is nothing to do.
     */
    function finishTops(bricks, prof) {
        const target = prof && prof.techniques && prof.techniques.tileTop;
        if (!(target > 0) || !bricks.length) return null;
        const P = window.LEGO_PARTS || {};
        const key = (x, y, z) => `${x},${y},${z}`;
        const cells = (f, fn) => { for (let y = f.y0; y < f.y0 + f.hp; y++) for (let x = f.x0; x < f.x0 + f.w; x++) for (let z = f.z0; z < f.z0 + f.l; z++) fn(x, y, z); };
        const occAll = new Set(), linked = new Set(), colTop = new Map();
        let minY = Infinity;
        for (const b of bricks) {
            const f = b.fp; if (!f) continue;
            if (!b.ghost) minY = Math.min(minY, f.y0);
            cells(f, (x, y, z) => { occAll.add(key(x, y, z)); const c = x + ',' + z; if (!b.ghost && !(colTop.get(c) >= y)) colTop.set(c, y); });
            if (b.links) for (const l of b.links) linked.add(key(l[0], l[1], l[2]));
        }
        // Current finish of the tops, by column (the part seen from above).
        const solidAt = new Map();
        bricks.forEach((b, i) => { if (b.fp && !b.ghost) cells(b.fp, (x, y, z) => solidAt.set(key(x, y, z), i)); });
        let tiles = 0, studs = 0;
        // Bare base or ground columns do not count: the profiles measure what stands on the base.
        for (const [c, y] of colTop) { if (y <= minY) continue; const [x, z] = c.split(',').map(Number); const t = topOfDef(P[bricks[solidAt.get(key(x, y, z))].partId]); if (t === 'tile') tiles++; else if (t === 'studs') studs++; }
        const from = tiles / ((tiles + studs) || 1);
        let need = Math.round(target * (tiles + studs)) - tiles;
        if (need <= 0) return { from: r2(from), to: r2(from), target, tiled: 0, split: 0 };
        const free = (b) => {
            const f = b.fp; let ok = true;
            for (let x = f.x0; x < f.x0 + f.w && ok; x++) for (let z = f.z0; z < f.z0 + f.l; z++) {
                if (occAll.has(key(x, f.y0 + f.hp, z))) { ok = false; break; }
                for (let y = f.y0; y < f.y0 + f.hp; y++) if (linked.has(key(x, y, z))) { ok = false; break; }
            }
            return ok;
        };
        const topCells = (f) => { let n = 0; for (let x = f.x0; x < f.x0 + f.w; x++) for (let z = f.z0; z < f.z0 + f.l; z++) if (colTop.get(x + ',' + z) === f.y0) n++; return n; };
        const plain = (b) => { const d = P[b.partId]; return d && d.category === 'Plates' && d.isPlate && d.hasStuds && !d.isRound && !d.isWedge && !d.isJumper && !d.isHinge && !d.isAxlePlate && !d.isBracket && !d.isClip && !d.isBarHandle && !d.isTurntable && b.fp.hp === 1; };
        // Not the first plate above the base or ground either: that is floor and paving, where figures stand.
        const cands = bricks.filter((b) => !b.ghost && !b.strut && !b.links && b.fp && b.fp.y0 > minY + 1 && plain(b) && free(b) && topCells(b.fp));
        // Highest (most visible) first, then a fixed order by position.
        cands.sort((a, b) => (b.fp.y0 - a.fp.y0) || (a.fp.x0 - b.fp.x0) || (a.fp.z0 - b.fp.z0));
        let tiled = 0, split = 0;
        const count = (b) => { const n = topCells(b.fp); need -= n; tiles += n; studs -= n; tiled++; };
        for (const b of cands) {
            if (need <= 0) break;
            if (!TILE_FOR[b.partId]) continue;
            b.partId = TILE_FOR[b.partId]; b.tiled = true; count(b);
        }
        // Every solid part reaches the lowest plate through stud contacts or links (the harness rule).
        const allGrounded = () => {
            const at = new Map(), solids = bricks.filter((b) => !b.ghost && b.fp);
            solids.forEach((b, i) => cells(b.fp, (x, y, z) => at.set(key(x, y, z), i)));
            const par = solids.map((_, i) => i), find = (a) => (par[a] === a ? a : (par[a] = find(par[a])));
            solids.forEach((b, i) => {
                const f = b.fp;
                for (let x = f.x0; x < f.x0 + f.w; x++) for (let z = f.z0; z < f.z0 + f.l; z++) { const d = at.get(key(x, f.y0 - 1, z)); if (d !== undefined) par[find(i)] = find(d); }
                if (b.links) for (const l of b.links) { const o = at.get(key(l[0], l[1], l[2])); if (o !== undefined) par[find(i)] = find(o); }
            });
            const ok = new Set(); solids.forEach((b, i) => { if (b.fp.y0 === minY) ok.add(find(i)); });
            return solids.every((_, i) => ok.has(find(i)));
        };
        for (const b of cands) {
            if (need <= 0) break;
            if (b.tiled || TILE_FOR[b.partId]) continue;
            const f = b.fp, at = bricks.indexOf(b);
            const parts = tileCover(f.w, f.l).map(([dx, dz, w, l, id]) => {
                const d = P[id], rotY = d.width === w ? 0 : Math.PI / 2;
                return Object.assign({}, b, { partId: id, x: f.x0 + dx + (w - 1) / 2, z: f.z0 + dz + (l - 1) / 2, rotY, tiled: true, fp: { x0: f.x0 + dx, z0: f.z0 + dz, y0: f.y0, w, l, hp: 1 } });
            });
            bricks.splice(at, 1, ...parts);
            if (!allGrounded()) { bricks.splice(at, parts.length, b); continue; }
            count(parts[0]); split++;
        }
        return { from: r2(from), to: r2(tiles / ((tiles + studs) || 1)), target, tiled, split };
    }

    /* ── the REAL SETS panel section ─────────────────────────── */

    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
    const INTERIOR_LABEL = { seat: 'seats', steering: 'steering wheels', table: 'tables', bed: 'beds', panel: 'control panels', furniture: 'furniture', kitchen: 'kitchen units' };
    const CAT_LABEL = { plate: 'plates', brick: 'bricks', tile: 'tiles', slope: 'slopes', round: 'round parts', snot: 'brackets', wheel: 'wheels', window: 'windows/doors', hinge: 'hinges/clips', interior: 'interior items', special: 'special parts' };
    function phaseText(ph) {
        const top = (p) => Object.keys(p.cats || {})[0];
        const where = (h) => (h == null ? '' : h < 0.3 ? 'low' : h > 0.65 ? 'high' : 'mid-height');
        return ph.filter((p) => p.share).map((p, i) => `${['start', 'then', 'then', 'then', 'finish'][i]}: ${where(p.h)} ${CAT_LABEL[top(p)] || top(p) || ''}`).join(' → ');
    }
    let cssDone = false;
    function css() {
        if (cssDone || typeof document === 'undefined') return; cssDone = true;
        const s = document.createElement('style'); s.id = 'sfc-style';
        s.textContent = `.sfc-sec { margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); }
.sfc-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 4px 10px; margin-top: 8px; font-size: 12px; align-items: baseline; }
.sfc-grid .h { font-family: var(--font-heading); font-size: 8px; letter-spacing: 0.8px; color: var(--text-muted); text-transform: uppercase; }
.sfc-grid .k { color: var(--text-secondary); } .sfc-grid .v { font-family: var(--font-mono); font-size: 11px; color: #e2e8f0; text-align: right; white-space: nowrap; }
.sfc-grid .v.off { color: #fbbf24; }
.sfc-note { font-size: 12px; color: #e2e8f0; line-height: 1.45; margin: 8px 0 0; }
.sfc-note b { color: var(--lego-yellow); }`;
        document.head.appendChild(s);
    }
    function section(model) {
        const k = model && model.knowledge, prof = k && profile(k.subject);
        if (!prof) return '';
        css();
        const real = prof.source !== 'generated';
        let mine = null;
        try { mine = measure(normalize(model)); } catch (e) { mine = null; }
        const p = prof.proportions || {}, h = prof.hollow || {}, t = prof.techniques || {}, bo = prof.buildOrder || {};
        const rng = (a) => { if (!a) return '–'; const lo = Math.round(a[0]), hi = Math.round(a[2]); return lo === hi ? `${lo}` : `${lo}–${hi}`; };
        const one = (v) => Math.round(v * 10) / 10;
        const size = p.len ? `${rng(p.wid)} × ${rng(p.len)} studs, ${rng(p.hb)} bricks` : '–';
        const mp = mine && mine.proportions;
        const off = (a, v) => (a && v != null && (v < a[0] * 0.8 || v > a[2] * 1.25) ? ' off' : '');
        const rows = [
            ['Hollow inside', pct(h.share), mine ? pct(mine.hollow.share) : '–', mine && h.share != null && Math.abs(mine.hollow.share - h.share) > 0.15 ? ' off' : ''],
            ['Wall thickness', h.wall ? `${h.wall.median} stud${h.wall.median === 1 ? '' : 's'}` : '–', mine && mine.hollow.wall ? `${mine.hollow.wall.median}` : 'solid', ''],
            ['Tiled tops', pct(t.tileTop), mine ? pct(mine.techniques.tileTop) : '–', mine && t.tileTop != null && Math.abs(mine.techniques.tileTop - t.tileTop) > 0.2 ? ' off' : ''],
            ['Brackets / hinges', `${pct(t.snot)} / ${pct(t.hinge)}`, mine ? `${pct(mine.techniques.snot)} / ${pct(mine.techniques.hinge)}` : '–', ''],
            ['Pieces per step', bo.perStep != null ? `${bo.perStep}` : '–', mine ? `${mine.buildOrder.perStep}` : '–', ''],
        ];
        let html = `<div class="sfr-sec sfc-sec"><h4>🔧 HOW REAL SETS ARE BUILT</h4>`;
        html += `<p class="sfr-hint">${real ? `From <b>${prof.n}</b> real set${prof.n === 1 ? '' : 's'} rebuilt part by part in LDraw${prof.examples && prof.examples.length ? ` (${esc(prof.examples.slice(0, 3).join(', '))})` : ''}.` : 'Profile from our own forges (real reconstructions not analysed yet).'}</p>`;
        const sizeOff = mp && (off(p.wid, mp.wid) || off(p.len, mp.len) || off(p.hb, mp.hb));
        html += `<p class="sfc-note">Typical size: <b>${esc(size)}</b> tall${p.base ? `, ${p.base === 'plate' ? 'on a base plate' : p.base === 'wheels' ? 'standing on its wheels' : 'standing on its own'}` : ''}. This model: ${mp ? `${mp.wid} × ${mp.len} studs, ${one(mp.hb)} bricks${sizeOff ? ' <b>(off)</b>' : ''}` : '–'}.</p>`;
        html += `<div class="sfc-grid"><span class="h"></span><span class="h">${real ? 'real' : 'profile'}</span><span class="h">this model</span>`
            + rows.map(([a, b, c, o]) => `<span class="k">${a}</span><span class="v">${esc(b)}</span><span class="v${o}">${esc(c)}</span>`).join('') + `</div>`;
        const ints = Object.entries(prof.interiors || {}).sort((a, b) => b[1].freq - a[1].freq).filter(([, e]) => e.freq >= 0.2).slice(0, 4);
        if (ints.length) html += `<p class="sfc-note">Inside: ${ints.map(([id, e]) => `<b>${esc(INTERIOR_LABEL[id] || id)}</b> in ${pct(e.freq)} of sets`).join(', ')}${mine && Object.keys(mine.interiors).length ? '' : '; this model has none'}.</p>`;
        if (bo.phases) html += `<p class="sfc-note">Build order: ${esc(phaseText(bo.phases))}.${bo.subFreq ? ` ${pct(bo.subFreq)} of sets build sub-assemblies apart${bo.roles && bo.roles.length ? ` (${esc(bo.roles.slice(0, 3).map((r) => r[0]).join(', '))})` : ''}.` : ''}</p>`;
        if (model.construction && model.construction.tops && model.construction.tops.tiled) html += `<p class="sfr-meta">${model.construction.tops.tiled} top plates swapped for tiles to match real sets</p>`;
        html += `<p class="sfr-meta">${real ? 'Analysed from the LDraw Official Model Repository (CC BY)' : 'Generated-model baseline'}</p></div>`;
        return html;
    }

    function profile(id) { const d = data(); return d && d.subjects && id && d.subjects[id] ? Object.assign({ id, source: d.source }, d.subjects[id]) : null; }

    window.FORGE.construction = {
        get ready() { return !!data(); },
        get data() { return data(); },
        CATS, catOfDef, topOfDef, normalize, measure, finishTops, section, profile,
        onReady(fn) { if (data()) fn(data()); else if (typeof document !== 'undefined') document.addEventListener('studforge:construction', () => fn(data()), { once: true }); },
    };
    // The REAL SETS panel (realsets.js) renders sections registered with studForgeRealSets.addSection(fn), fn(model) →
    // Element | null. It initialises on studforge:ready, after this file has loaded, so register once it exists.
    const sectionEl = (model) => { const html = section(model); if (!html) return null; const div = document.createElement('div'); div.innerHTML = html; return div.firstElementChild; };
    let hooked = false;
    const hook = (tries) => {
        if (hooked || typeof document === 'undefined') return;
        const rs = window.studForgeRealSets;
        if (rs && rs.addSection) { hooked = true; rs.addSection(sectionEl); return; }
        if (tries > 0) setTimeout(() => hook(tries - 1), 250);
    };
    if (typeof document !== 'undefined') {
        if (window.studForge) setTimeout(() => hook(40), 0);
        else document.addEventListener('studforge:ready', () => setTimeout(() => hook(40), 0), { once: true });
    }

    if (typeof fetch !== 'function' || typeof document === 'undefined') return;
    fetch('data/construction.json', { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
            if (!j || typeof j !== 'object' || !j.subjects) return;
            window.STUDFORGE_CONSTRUCTION = j;
            document.dispatchEvent(new CustomEvent('studforge:construction', { detail: j }));
            if (window.studForgeRealSets && window.studForgeRealSets.render) window.studForgeRealSets.render();
        })
        .catch(() => { /* no construction file: builders get ctx.construction = null */ });
})();
