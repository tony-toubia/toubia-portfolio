// StudForge builders, part 1: shared sub-assemblies, architecture, vehicles,
// aircraft, ships, spacecraft and mechs.
//
// A builder paints a ForgeGrid (see forge-grid.js) from a context:
//   ctx.g      the grid            ctx.P     palette by role (primary, secondary, accent, trim, glass, dark, metal, wood, ground, light, roof, water)
//   ctx.rnd()  seeded random       ctx.pick  pick one of a list       ctx.chance(p)
//   ctx.sc(n)  scale a size        ctx.has('word', ...) is a word in the prompt?
//   ctx.match  the key that chose this builder (e.g. 'lighthouse')
// and returns { title, features: [...] } for the name and description.
// Conventions: x runs left/right, z runs back(-)/front(+), y counts plates (3 per brick).
window.FORGE = window.FORGE || { builders: [], helpers: {} };

(() => {
    const H = window.FORGE.helpers;
    const PI = Math.PI;
    const reg = (b) => window.FORGE.builders.push(b);

    /* ── shared sub-assemblies ────────────────────────────────── */

    /** A small tree at stud (x, z) standing on plate y. */
    H.tree = (ctx, x, z, y, kind) => {
        const { g, P } = ctx;
        kind = kind || ctx.pick(['round', 'round', 'pine']);
        if (kind === 'pine') {
            g.part('3062', P.wood, x, z, y);
            H.slab(ctx, x - 1, x + 1, z - 1, z + 1, y + 3, P.leaf);
            g.box(x, x, z, z, y + 5, y + 6, P.leaf);
            g.part('59900', P.leaf, x, z, y + 7);
            return;
        }
        g.part('3062', P.wood, x, z, y); g.part('3062', P.wood, x, z, y + 3);
        g.part('4032', P.leaf, x, z, y + 6);
        g.part('3941', P.leaf, x, z, y + 7);
        g.part('553', P.leaf, x, z, y + 10);
    };

    /** A flower: a green round plate with a coloured round tile. */
    H.flower = (ctx, x, z, y, color) => { ctx.g.part('4073', ctx.P.leaf, x, z, y); ctx.g.part('98138', color || ctx.pick([ 'PINK', 'YELLOW', 'RED', 'WHITE']), x, z, y + 1); };

    /** A lamp post. */
    H.lamp = (ctx, x, z, y) => { ctx.g.part('3062', ctx.P.dark, x, z, y); ctx.g.part('3062', ctx.P.dark, x, z, y + 3); ctx.g.part('98138', 'TRANS_ORANGE', x, z, y + 6); };

    /** A flag: a pole with a cheese-slope pennant. */
    H.flag = (ctx, x, z, y, color) => { ctx.g.part('3062', ctx.P.dark, x, z, y); ctx.g.part('3062', ctx.P.dark, x, z, y + 3); ctx.g.part('54200', color || ctx.P.accent, x, z, y + 6); };

    /**
     * Dress a base plate: a tile rim every other stud, and a few props (rocks,
     * grass tufts, flowers) on free cells. Called by the generator after the
     * builder, so every model gets a little diorama.
     */
    H.dress = (ctx) => {
        const { g, P, chance, rnd } = ctx, b = g.bounds();
        if (b.x1 - b.x0 < 6 || b.z1 - b.z0 < 6) return;
        const y = b.y0, free = (x, z) => g.top(x, z) === y;
        const base = g.get(b.x0 + 1, y, b.z0 + 1), ground = base ? base.color : null;
        if (!ground) return;
        const natural = ground === P.ground || ground === 'TAN' || ground === 'GREEN' || ground === 'WHITE';
        for (let x = b.x0; x <= b.x1; x += 2) { if (free(x, b.z0) && g.get(x, y, b.z0)) g.part('3070', natural ? ground : 'LIGHT_GREY', x, b.z0, y + 1); if (free(x, b.z1) && g.get(x, y, b.z1)) g.part('3070', natural ? ground : 'LIGHT_GREY', x, b.z1, y + 1); }
        let props = 0;
        for (let tries = 0; tries < 40 && props < 6; tries++) {
            const x = b.x0 + 1 + Math.floor(rnd() * (b.x1 - b.x0 - 1)), z = b.z0 + 1 + Math.floor(rnd() * (b.z1 - b.z0 - 1));
            if (!free(x, z) || !g.get(x, y, z) || g.top(x + 1, z) > y || g.top(x - 1, z) > y || g.top(x, z + 1) > y || g.top(x, z - 1) > y) continue;
            const r = rnd();
            if (natural && ground !== 'WHITE') { if (r < 0.4) H.flower(ctx, x, z, y + 1); else if (r < 0.7) g.part('4073', P.leaf, x, z, y + 1); else g.part('3062', 'LIGHT_GREY', x, z, y + 1); }
            else { if (r < 0.5) g.part('98138', P.accent, x, z, y + 1); else g.part('3070', 'DARK_GREY', x, z, y + 1); }
            props++;
        }
    };

    /** A transparent display stand under a flying model. */
    H.stand = (ctx, x, z, y, bricks) => { for (let i = 0; i < bricks; i++) ctx.g.part('3062', 'TRANS_CLEAR', x, z, y + i * 3); };

    /** A 1x2 window set into a wall. `face` is 'front'/'back' (window runs along X) or 'left'/'right' (along Z). */
    H.window = (ctx, x, z, y, face, color) => {
        ctx.g.part('3004', color || ctx.P.glass, x, z, y, { rotY: (face === 'front' || face === 'back') ? PI / 2 : 0 });
    };

    /** Crenellations: a 1x1 brick on every other stud of a rectangle's edge. */
    H.crenellate = (ctx, x0, x1, z0, z1, y, color) => {
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
            if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
            if ((x + z) % 2 === 0) ctx.g.box(x, x, z, z, y, y + 2, color);
        }
    };

    /**
     * A stepped 45° roof over x0..x1, z0..z1 starting at plate y. The ridge
     * runs along X (slopes face front and back) or along Z. Each level is a
     * brick tall: slopes at both edges, bricks filling the middle. Returns the
     * ridge cap's plate and row range.
     */
    H.gableRoof = (ctx, x0, x1, z0, z1, y, color, axis) => {
        const { g } = ctx;
        let a = axis === 'x' ? z0 : x0, b = axis === 'x' ? z1 : x1;
        const s0 = axis === 'x' ? x0 : z0, s1 = axis === 'x' ? x1 : z1;   // the ridge direction
        let yy = y;
        while (b - a + 1 >= 4) {
            for (let s = s0; s <= s1; s += 2) {
                const two = s + 1 <= s1;
                if (axis === 'x') {
                    if (two) { g.part('3039', color, s, b - 1, yy, { rotY: 0 }); g.part('3039', color, s, a, yy, { rotY: PI }); }
                    else { g.part('3040', color, s, b - 1, yy, { rotY: 0 }); g.part('3040', color, s, a, yy, { rotY: PI }); }
                } else {
                    if (two) { g.part('3039', color, b - 1, s, yy, { rotY: PI / 2 }); g.part('3039', color, a, s, yy, { rotY: -PI / 2 }); }
                    else { g.part('3040', color, b - 1, s, yy, { rotY: PI / 2 }); g.part('3040', color, a, s, yy, { rotY: -PI / 2 }); }
                }
            }
            if (b - 2 >= a + 2) {
                if (axis === 'x') g.box(s0, s1, a + 2, b - 2, yy, yy + 2, color); else g.box(a + 2, b - 2, s0, s1, yy, yy + 2, color);
            }
            a += 1; b -= 1; yy += 3;
        }
        if (axis === 'x') g.box(s0, s1, a, b, yy, yy, color, { noBrick: true }); else g.box(a, b, s0, s1, yy, yy, color, { noBrick: true });
        return { y: yy, a, b };
    };

    /**
     * A ceiling or deck over a hollow room: plates laid across the shorter
     * span, each one resting on a wall at an end, so nothing floats.
     */
    H.ceiling = (ctx, x0, x1, z0, z1, y, color) => {
        const { g } = ctx, LEN = [10, 8, 6, 4, 3, 2, 1];
        const alongX = (x1 - x0) <= (z1 - z0);
        const span = alongX ? x1 - x0 + 1 : z1 - z0 + 1, rows = alongX ? z1 - z0 + 1 : x1 - x0 + 1;
        let pieces = LEN.includes(span) ? [[0, span]] : null;
        if (!pieces) { let a = LEN.find((l) => l < span && LEN.includes(span - l)); if (a === undefined) a = 10; pieces = [[0, a], [a, span - a]]; }
        const one = { 1: '3024', 2: '3023', 3: '3623', 4: '3710', 6: '3666', 8: '3460', 10: '4477' }, two = { 2: '3022', 3: '3021', 4: '3020', 6: '3795', 8: '3034', 10: '3832' };
        for (let r = 0; r < rows; r += 2) {
            const dbl = r + 1 < rows;
            for (const [off, len] of pieces) {
                const id = dbl ? (len === 1 ? '3023' : two[len]) : one[len];
                if (!id) continue;
                const w = alongX ? len : (dbl ? 2 : 1), l = alongX ? (dbl ? 2 : 1) : len;
                const def = window.LEGO_PARTS[id], rotY = def.width === w && def.length === l ? 0 : PI / 2;
                g.part(id, color, alongX ? x0 + off : x0 + r, alongX ? z0 + r : z0 + off, y, { rotY, w, l });
            }
        }
    };

    /**
     * Two plate layers over a rectangle, laid across each other so that every
     * joint in one layer sits under a whole piece of the other. The result is
     * one stud-locked slab: a tiled block built on it, or a head cantilevered
     * off a neck through it, can never split into pieces that hang in the air.
     */
    const PLATES = {
        LEN: [10, 8, 6, 4, 3, 2, 1],
        one: { 1: '3024', 2: '3023', 3: '3623', 4: '3710', 6: '3666', 8: '3460', 10: '4477' },
        two: { 2: '3022', 3: '3021', 4: '3020', 6: '3795', 8: '3034', 10: '3832' },
        /** A run of n studs as [offset, length] pieces from the plate lengths we stock. */
        split(n) {
            if (this.LEN.includes(n)) return [[0, n]];
            let a = this.LEN.find((l) => l < n && this.LEN.includes(n - l)); if (a === undefined) a = 10;
            return [[0, a], ...this.split(n - a).map(([o, l]) => [a + o, l])];
        },
    };
    H.plateLen = (n) => !!PLATES.one[n];
    /** A single row of 1xN plates from (x0, z0) running `len` studs along 'x' or 'z'. */
    H.strip = (ctx, x0, z0, len, axis, y, color) => {
        if (len < 1) return;
        for (const [off, l] of PLATES.split(len)) {
            const id = PLATES.one[l];
            if (axis === 'x') ctx.g.part(id, color, x0 + off, z0, y, { rotY: l > 1 ? PI / 2 : 0, w: l, l: 1 });
            else ctx.g.part(id, color, x0, z0 + off, y, { rotY: 0, w: 1, l });
        }
    };
    /**
     * A round slab: one layer of plate columns along Z and one of rows along X,
     * clipped to the disc, so every chord is locked to the ones it crosses.
     */
    H.discSlab = (ctx, cx, cz, r, y, color) => {
        const inside = (x, z) => (x - cx) ** 2 + (z - cz) ** 2 <= r * r + 0.01;
        const chord = (fixed, c0, c1, test) => { let a = null, b = null; for (let v = c0; v <= c1; v++) if (test(v)) { if (a === null) a = v; b = v; } return a === null ? null : [a, b]; };
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { const c = chord(x, Math.floor(cz - r), Math.ceil(cz + r), (z) => inside(x, z)); if (c) H.strip(ctx, x, c[0], c[1] - c[0] + 1, 'z', y, color); }
        for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) { const c = chord(z, Math.floor(cx - r), Math.ceil(cx + r), (x) => inside(x, z)); if (c) H.strip(ctx, c[0], z, c[1] - c[0] + 1, 'x', y + 1, color); }
    };
    H.slab = (ctx, x0, x1, z0, z1, y, color) => {
        const { g } = ctx, { one, two } = PLATES, split = (n) => PLATES.split(n);
        const W = x1 - x0 + 1, D = z1 - z0 + 1, longX = W >= D;
        const lay = (yy, alongX, offset) => {
            const span = alongX ? W : D, rows = alongX ? D : W, pieces = split(span);
            for (let r = 0; r < rows;) {
                const dbl = !(r === 0 && offset) && r + 1 < rows;
                for (const [off, len] of pieces) {
                    const id = dbl ? (len === 1 ? '3023' : two[len]) : one[len];
                    const w = alongX ? len : (dbl ? 2 : 1), l = alongX ? (dbl ? 2 : 1) : len;
                    const def = window.LEGO_PARTS[id], rotY = def.width === w && def.length === l ? 0 : PI / 2;
                    g.part(id, color, alongX ? x0 + off : x0 + r, alongX ? z0 + r : z0 + off, yy, { rotY, w, l });
                }
                r += dbl ? 2 : 1;
            }
        };
        // A row pair starting on an even row bridges a joint at an odd index; start with a single row to bridge even joints.
        const joint = (n) => { const p = split(n); return p.length > 1 ? p[1][0] : -1; };
        const aJoint = joint(longX ? W : D), bJoint = joint(longX ? D : W);
        lay(y, longX, bJoint >= 0 && bJoint % 2 === 0 ? 1 : 0);
        lay(y + 1, !longX, aJoint >= 0 && aJoint % 2 === 0 ? 1 : 0);
    };

    /** A flat roof: a plate layer with a tile rim, plus a rooftop box. */
    H.flatRoof = (ctx, x0, x1, z0, z1, y, color) => {
        const { g, P } = ctx;
        g.box(x0, x1, z0, z1, y, y, color, { noBrick: true });
        g.box(x0 + 1, x1 - 1, z0 + 1, z1 - 1, y + 1, y + 1, color, { noBrick: true });
        const bx = x0 + 2, bz = z0 + 2;
        if (x1 - x0 >= 6 && z1 - z0 >= 6) { g.box(bx, bx + 1, bz, bz + 1, y + 2, y + 4, P.dark); g.part('3957', P.metal, x1 - 2, z1 - 2, y + 2); }
        return { y: y + 1 };
    };

    /** Four wheels (2x2 round plates on their sides) outside a body spanning x0..x1. */
    H.wheels = (ctx, x0, x1, zs, y, big) => {
        for (const z of zs) {
            if (big) { ctx.g.part('3941', 'BLACK', x0 - 2, z, y, { rotZ: PI / 2, w: 2, l: 2, hp: 5, lie: true }); ctx.g.part('3941', 'BLACK', x1 + 1, z, y, { rotZ: PI / 2, w: 2, l: 2, hp: 5, lie: true }); }
            else { ctx.g.part('4032', 'BLACK', x0 - 1, z, y, { rotZ: PI / 2, w: 1, l: 2, hp: 5, lie: true }); ctx.g.part('4032', 'BLACK', x1 + 1, z, y, { rotZ: PI / 2, w: 1, l: 2, hp: 5, lie: true }); }
        }
    };

    /** A garden around a footprint: trees in the corners, flowers at the front, a lamp. */
    H.garden = (ctx, x0, x1, z0, z1, m, y) => {
        const { g, P, chance } = ctx;
        g.box(x0 - m, x1 + m, z0 - m, z1 + m, y, y, P.ground);
        const feats = [];
        if (m >= 3) {
            H.tree(ctx, x0 - m, z0 - m, y + 1); H.tree(ctx, x1 + m - 1, z0 - m, y + 1, chance(0.5) ? 'pine' : 'round');
            feats.push('trees');
        }
        const avoid = ctx.avoidX || [];
        for (let x = x0; x <= x1; x += 2) if (chance(0.7) && !avoid.includes(x)) H.flower(ctx, x, z1 + 2, y + 1);
        if (m >= 2) { H.lamp(ctx, x1 + m - 1, z1 + m - 1, y + 1); feats.push('a lamp post'); }
        return feats;
    };

    /* ── architecture ─────────────────────────────────────────── */

    reg({
        kind: 'house', category: 'Architecture', icon: '🏡',
        keys: ['house', 'home', 'cottage', 'cabin', 'villa', 'mansion', 'bungalow', 'hut', 'shack', 'farmhouse', 'barn', 'shop', 'store', 'cafe', 'coffee shop', 'bakery', 'diner', 'pub', 'tavern', 'inn', 'school', 'office', 'garage', 'chalet', 'lodge', 'library', 'bookshop', 'hotel', 'motel', 'apartment', 'townhouse', 'warehouse', 'factory', 'workshop', 'stable', 'greenhouse', 'church', 'chapel', 'treehouse', 'tree house'],
        build(ctx) {
            const { g, P, sc, chance, pick, match, has, declare } = ctx;
            const big = ['mansion', 'villa', 'hotel', 'school', 'office', 'factory', 'warehouse', 'apartment', 'library'].includes(match);
            const tiny = ['hut', 'shack', 'cabin', 'garage', 'stable', 'greenhouse'].includes(match);
            const W = sc(big ? 12 : tiny ? 6 : 8 + (chance(0.5) ? 2 : 0));
            const D = sc(match === 'barn' ? 12 : big ? 12 : tiny ? 6 : 10 + (chance(0.4) ? 2 : 0));
            let stories = big ? (match === 'office' || match === 'apartment' || match === 'hotel' ? 3 : 2) : tiny || match === 'barn' ? 1 : (has('two-story', 'two story', '2 story', 'tall', 'two floor') || chance(0.4) ? 2 : 1);
            if (has('three story', '3 story', 'three-story')) stories = 3;
            // Tweakable dials: each defaults to what the prompt alone would build.
            const flatDflt = ctx.style === 'modern' || match === 'office' || match === 'garage' || match === 'warehouse' || match === 'factory' || match === 'apartment';
            const flat = declare({ id: 'roof', label: 'Roof', type: 'choice', choices: ['gable', 'flat'], default: flatDflt ? 'flat' : 'gable' }) === 'flat';
            stories = Math.max(1, Math.min(3, parseInt(declare({ id: 'stories', label: 'Stories', type: 'choice', choices: ['1', '2', '3'], default: String(stories) }), 10) || stories));
            const chimney = declare({ id: 'chimney', label: 'Chimney', type: 'bool', default: true });
            const garden = declare({ id: 'garden', label: 'Garden', type: 'bool', default: true });
            const SH = 7, m = 3;   // six plates of wall and a ceiling
            const doorX = Math.floor(W / 2) - 1;
            ctx.avoidX = [doorX - 1, doorX, doorX + 1, doorX + 2];
            let feats = [];
            if (garden) feats = H.garden(ctx, 0, W - 1, 0, D - 1, m, 0);
            else g.box(-1, W, -1, D - 1 + m, 0, 0, P.ground);   // just a lawn under the house and its path
            const wall = match === 'greenhouse' ? P.glass : match === 'barn' ? 'DARK_RED' : P.primary;
            const timber = ctx.style === 'cozy' || ctx.style === 'medieval' || match === 'cabin' || match === 'chalet' || match === 'lodge';
            // Stone footing, then the walls story by story.
            g.box(0, W - 1, 0, D - 1, 1, 1, P.dark, { noBrick: true });
            for (let s = 0; s < stories; s++) {
                const y0 = 2 + s * SH;
                g.shell(0, W - 1, 0, D - 1, y0, y0 + SH - 2, wall);
                H.ceiling(ctx, 0, W - 1, 0, D - 1, y0 + SH - 1, timber || s < stories - 1 ? P.trim : wall);
                if (timber) for (const [x, z] of [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1]]) g.box(x, x, z, z, y0, y0 + SH - 2, P.wood);
                // Windows: front and back every three studs, sides every three, skipping the door.
                for (let x = 1; x + 1 <= W - 2; x += 3) {
                    if (s === 0 && x + 1 >= doorX && x <= doorX + 1) continue;
                    H.window(ctx, x, D - 1, y0 + 2, 'front'); H.window(ctx, x, 0, y0 + 2, 'back');
                }
                for (let z = 2; z + 1 <= D - 3; z += 3) { H.window(ctx, 0, z, y0 + 2, 'left'); H.window(ctx, W - 1, z, y0 + 2, 'right'); }
                if (s === 0) {
                    // The door, with a step and a path to the garden's edge.
                    g.clear(doorX, doorX + 1, D - 1, D - 1, y0, y0 + 4);
                    g.box(doorX, doorX + 1, D - 1, D - 1, y0, y0 + 4, match === 'barn' ? 'DARK_RED' : P.wood);
                    g.box(doorX, doorX + 1, D, D, 1, 1, P.dark, { noBrick: true });
                    for (let z = D + 1; z <= D - 1 + m; z++) g.part('3069', P.trim, doorX, z, 1, { rotY: PI / 2 });
                }
            }
            const top = 2 + stories * SH;
            let roofDesc;
            if (flat) { H.flatRoof(ctx, 0, W - 1, 0, D - 1, top, P.roof === 'DARK_RED' ? P.dark : P.roof); roofDesc = 'a flat roof with rooftop plant'; }
            else {
                g.box(-1, W, -1, D, top, top, P.roof, { noBrick: true });   // eaves
                const axis = W >= D ? 'x' : 'z';
                const r = H.gableRoof(ctx, -1, W, -1, D, top + 1, P.roof, axis);
                // Chimney on the ridge.
                if (chimney) {
                    const cx = axis === 'x' ? W - 2 : Math.floor((r.a + r.b) / 2), cz = axis === 'x' ? Math.floor((r.a + r.b) / 2) : D - 2;
                    g.box(cx, cx, cz, cz, r.y + 1, r.y + 6, P.dark);
                    g.part('4073', P.metal, cx, cz, r.y + 7);
                }
                roofDesc = `a pitched ${window.LEGO_COLORS[P.roof].name.toLowerCase()} roof${chimney ? ' and a chimney' : ''}`;
            }
            if (match === 'church' || match === 'chapel') {
                // A bell tower at the back corner.
                g.shell(W, W + 3, -3, 0, 2, 2 + 6 * 4 - 1, wall); H.ceiling(ctx, W, W + 3, -3, 0, 2 + 6 * 4, wall);
                H.gableRoof(ctx, W, W + 3, -3, 0, 2 + 6 * 4 + 1, P.roof, 'x');
                g.part('59900', 'GOLD', W + 1, -2, 2 + 6 * 4 + 4);
                feats.push('a bell tower');
            }
            const names = { barn: 'Red Barn', cabin: 'Log Cabin', cottage: 'Cottage', villa: 'Villa', mansion: 'Manor House', hut: 'Hut', shack: 'Shack', cafe: 'Corner Café', 'coffee shop': 'Coffee Shop', bakery: 'Bakery', pub: 'Village Pub', tavern: 'Tavern', inn: 'Roadside Inn', church: 'Chapel', chapel: 'Chapel', office: 'Office Block', hotel: 'Boutique Hotel', library: 'Library', greenhouse: 'Greenhouse', garage: 'Garage', chalet: 'Chalet', lodge: 'Lodge', farmhouse: 'Farmhouse', treehouse: 'Treehouse', 'tree house': 'Treehouse', warehouse: 'Warehouse', factory: 'Factory', school: 'Schoolhouse' };
            return { title: names[match] || 'House', features: [`${stories === 1 ? 'a single story' : stories + ' stories'} of ${window.LEGO_COLORS[wall].name.toLowerCase()} walls`, roofDesc, 'a front door and path', ...feats] };
        }
    });

    reg({
        kind: 'castle', category: 'Castle & Fantasy', icon: '🏰',
        keys: ['castle', 'fortress', 'keep', 'citadel', 'stronghold', 'bastion', 'palace', 'fort'],
        build(ctx) {
            const { g, P, sc, chance, declare } = ctx;
            const W = sc(14), D = sc(14);
            const stone = P.primary === 'RED' || ctx.explicitColors.length === 0 ? 'LIGHT_GREY' : P.primary;
            const dark = 'DARK_GREY';
            // Dials: the moat is a coin toss by default (the toss is made either way, so the seed's other choices don't shift).
            const moat = declare({ id: 'moat', label: 'Moat', type: 'bool', default: chance(0.5) });
            const tallTowers = declare({ id: 'towers', label: 'Towers', type: 'choice', choices: ['standard', 'tall'], default: 'standard' }) === 'tall';
            const banner = declare({ id: 'flag', label: 'Banner', type: 'bool', default: true });
            g.box(-3, W + 2, -3, D + 2, 0, 0, moat ? P.water : P.ground);
            if (moat) { g.box(-1, W, -1, D, 1, 1, P.ground); g.part('3020', P.wood, Math.floor(W / 2) - 1, D + 1, 1, { rotY: PI / 2 }); }
            const base = moat ? 2 : 1;
            const wallH = 9, towerH = tallTowers ? 7 : 5;
            // Corner towers of round 2x2 bricks.
            const corners = [[0, 0], [W - 2, 0], [0, D - 2], [W - 2, D - 2]];
            for (const [tx, tz] of corners) {
                for (let i = 0; i < towerH; i++) g.part('3941', i === towerH - 1 ? dark : stone, tx, tz, base + i * 3);
                g.part('3022', dark, tx, tz, base + towerH * 3);
                g.box(tx, tx, tz, tz, base + towerH * 3 + 1, base + towerH * 3 + 3, stone);
                g.box(tx + 1, tx + 1, tz + 1, tz + 1, base + towerH * 3 + 1, base + towerH * 3 + 3, stone);
            }
            // Curtain walls between the towers, hollow inside.
            g.shell(1, W - 2, 1, D - 2, base, base + wallH - 1, stone);
            H.crenellate(ctx, 1, W - 2, 1, D - 2, base + wallH, stone);
            // Gatehouse: an opening in the front wall, a lintel brick across it, torches either side.
            const gx = Math.floor(W / 2) - 1;
            g.clear(gx, gx + 1, D - 2, D - 2, base, base + 5);
            g.part('3010', dark, gx - 1, D - 2, base + 6, { rotY: PI / 2 });
            for (const x of [gx - 2, gx + 3]) { g.part('3005', dark, x, D - 1, base); g.part('3062', 'TRANS_ORANGE', x, D - 1, base + 3); }
            for (const x of [gx - 3, gx + 4]) if (x > 1 && x < W - 2) g.part('54200', P.accent, x, D - 2, base + wallH);   // clear of the corner towers
            // Courtyard path and the keep.
            for (let z = Math.floor(D / 2) + 2; z <= D - 3; z += 2) g.part('3069', 'TAN', gx, z, base);
            const kx = Math.floor(W / 2) - 2, kz = Math.floor(D / 2) - 2, keepH = 18;
            g.shell(kx, kx + 3, kz, kz + 3, base, base + keepH - 1, stone);
            H.ceiling(ctx, kx, kx + 3, kz, kz + 3, base + keepH, dark);
            H.crenellate(ctx, kx, kx + 3, kz, kz + 3, base + keepH + 1, stone);
            H.window(ctx, kx + 1, kz + 3, base + 7, 'front', 'TRANS_ORANGE'); H.window(ctx, kx + 1, kz + 3, base + 13, 'front', 'TRANS_ORANGE');
            if (banner) H.flag(ctx, kx + 1, kz + 1, base + keepH + 1, P.accent);
            // A well and a tree in the courtyard.
            if (W >= 14) { g.part('3941', stone, 2, D - 5, base); g.part('4032', P.water, 2, D - 5, base + 3); H.tree(ctx, W - 4, 3, base, 'round'); }
            return { title: ctx.match === 'palace' ? 'Royal Palace' : 'Castle', features: [`four ${tallTowers ? 'tall ' : ''}round corner towers`, 'crenellated curtain walls', 'a gatehouse with torches', banner ? 'a central keep flying a banner' : 'a central keep', moat ? 'a moat and drawbridge' : 'a courtyard well'] };
        }
    });

    reg({
        kind: 'tower', category: 'Architecture', icon: '🗼',
        keys: ['tower', 'skyscraper', 'lighthouse', 'pagoda', 'windmill', 'obelisk', 'watchtower', 'clock tower', 'bell tower', 'minaret', 'water tower', 'spire', 'tall building', 'high-rise', 'highrise', 'office tower', 'eiffel tower', 'big ben', 'radio tower'],
        build(ctx) {
            const { g, P, sc, chance, match, declare } = ctx;
            const feats = [];
            if (match === 'lighthouse') {
                const R = sc(4.5);
                const cottage = declare({ id: 'cottage', label: "Keeper's cottage", type: 'bool', default: true });
                g.box(-R - 1, R + 2, -R - 1, R + 2, 0, 0, P.water);
                // Rocks: stacked, shrinking discs with a shelf for the keeper's cottage.
                g.disc(0.5, 0.5, R, 1, 1, 'DARK_GREY'); g.disc(0.5, 0.5, R - 1, 2, 2, 'DARK_GREY'); g.disc(0, 0, R - 2.4, 3, 3, 'LIGHT_GREY');
                g.box(2, 5, -1, 2, 1, 1, 'DARK_GREY');
                const bands = sc(6), yT = 4;
                const c1 = P.explicit ? P.primary : 'RED', c2 = P.explicit && ctx.explicitColors.length > 1 ? P.secondary : 'WHITE';
                for (let i = 0; i < bands; i++) g.part('3941', i % 2 ? c2 : c1, 0, 0, yT + i * 3);
                const yG = yT + bands * 3;
                g.part('3031', 'BLACK', -1, -1, yG);
                for (let x = -1; x <= 2; x++) for (let z = -1; z <= 2; z++) if ((x === -1 || x === 2 || z === -1 || z === 2) && (x + z) % 2 === 0) g.part('4073', 'BLACK', x, z, yG + 1);
                g.part('3941', 'TRANS_CLEAR', 0, 0, yG + 1);
                g.part('3022', 'BLACK', 0, 0, yG + 4);
                g.part('3942', c1, 0, 0, yG + 5);
                // Keeper's cottage on the shelf, and a little boat.
                if (cottage) { g.shell(3, 5, -1, 1, 2, 7, 'WHITE'); H.window(ctx, 4, 1, 4, 'front'); H.gableRoof(ctx, 3, 5, -1, 1, 8, 'DARK_RED', 'z'); }
                g.part('3020', P.accent, -R - 1, R - 1, 1); g.part('3004', 'WHITE', -R, R - 1, 2, { rotY: 0 });
                feats.push(`${bands} banded tiers`, 'a railed gallery and glass lantern room');
                if (cottage) feats.push("a keeper's cottage on the rocks");
                feats.push('a rowing boat');
                return { title: 'Lighthouse on a Rocky Shore', features: feats };
            }
            if (match === 'pagoda') {
                const tiersDflt = Math.max(3, Math.min(6, sc(4) + (chance(0.5) ? 1 : 0)));
                const tiers = Math.max(3, Math.min(6, parseInt(declare({ id: 'tiers', label: 'Tiers', type: 'choice', choices: ['3', '4', '5', '6'], default: String(tiersDflt) }), 10) || tiersDflt));
                g.box(-4, 7, -4, 7, 0, 0, P.ground);
                g.box(-2, 5, -2, 5, 1, 2, 'DARK_GREY'); g.part('3710', 'LIGHT_GREY', 0, 6, 1, { rotY: PI / 2 });
                let y = 3;
                for (let t = 0; t < tiers; t++) {
                    g.shell(0, 3, 0, 3, y, y + 5, 'WHITE');
                    if (t === 0) g.box(1, 2, 3, 3, y, y + 4, P.wood); else H.window(ctx, 1, 3, y + 2, 'front', 'TRANS_ORANGE');
                    // Ceiling, then eave plates one up that overlap the tier's edge and overhang it.
                    H.ceiling(ctx, 0, 3, 0, 3, y + 6, P.roof);
                    g.part('3795', P.roof, -1, -1, y + 7, { rotY: PI / 2, w: 6, l: 2 }); g.part('3795', P.roof, -1, 3, y + 7, { rotY: PI / 2, w: 6, l: 2 });
                    g.part('3022', P.roof, -1, 1, y + 7); g.part('3022', P.roof, 3, 1, y + 7);
                    g.part('54200', P.roof, -1, -1, y + 8, { rotY: PI * 1.25 }); g.part('54200', P.roof, 4, -1, y + 8, { rotY: PI * 0.75 });
                    g.part('54200', P.roof, -1, 4, y + 8, { rotY: -PI * 0.25 }); g.part('54200', P.roof, 4, 4, y + 8, { rotY: PI * 0.25 });
                    y += 8;
                }
                g.box(1, 2, 1, 2, y, y, 'GOLD', { noBrick: true });
                g.part('3062', 'GOLD', 1, 1, y + 1); g.part('59900', 'GOLD', 1, 1, y + 4);
                H.tree(ctx, -3, 5, 1, 'round'); g.part('3005', 'LIGHT_GREY', 6, -3, 1); g.part('4073', 'TRANS_ORANGE', 6, -3, 4);
                return { title: 'Pagoda Shrine', features: [`${tiers} tiers with sweeping ${window.LEGO_COLORS[P.roof].name.toLowerCase()} eaves`, 'a gold finial', 'a stone plinth with steps', 'a garden lantern and tree'] };
            }
            if (match === 'windmill') {
                g.box(-4, 9, -4, 9, 0, 0, P.ground);
                g.shell(0, 5, 0, 5, 1, 6, P.primary); H.ceiling(ctx, 0, 5, 0, 5, 7, P.primary); g.shell(1, 4, 1, 4, 8, 15, P.primary);
                g.box(1, 2, 5, 5, 1, 5, P.wood); H.window(ctx, 2, 4, 9, 'front');
                g.box(1, 4, 1, 4, 16, 16, P.roof, { noBrick: true }); g.box(2, 3, 2, 3, 17, 17, P.roof, { noBrick: true }); g.part('3942', P.roof, 2, 2, 18);
                // Sails: a mast in front, a horizontal plate and a vertical column crossing at the hub.
                const mx = 2, mz = 6;
                for (let i = 0; i < 4; i++) g.part('3062', P.wood, mx, mz, 1 + i * 3);
                g.part('3460', P.wood, mx - 3, mz, 13, { rotY: PI / 2 });
                g.part('3070', P.accent, mx - 3, mz, 14); g.part('3070', P.accent, mx + 4, mz, 14);
                g.box(mx, mx, mz, mz, 14, 22, P.wood);
                g.part('54200', P.accent, mx, mz, 23);
                H.flower(ctx, -2, 7, 1); H.flower(ctx, 7, 7, 1); H.tree(ctx, 8, -3, 1);
                return { title: 'Windmill', features: ['a tapered two-stage tower', 'four timber sails on a mast', 'a conical cap', 'a cottage door and window'] };
            }
            if (match === 'skyscraper' || match === 'tall building' || match === 'high-rise' || match === 'highrise' || match === 'office tower') {
                const W = sc(8);
                g.box(-3, W + 2, -3, W + 2, 0, 0, 'DARK_GREY');
                for (let x = 0; x <= W - 2; x += 2) { g.part('3069', 'LIGHT_GREY', x, -2, 1); g.part('3069', 'LIGHT_GREY', x, W + 1, 1); }
                const tiers = [[0, W - 1, 7], [1, W - 2, 6], [2, W - 3, 5]].filter((t) => t[1] - t[0] >= 2);
                let y = 1;
                for (const [a, b, rows] of tiers) {
                    for (let r = 0; r < rows; r++) { g.shell(a, b, a, b, y, y + 2, r % 2 ? P.glass : P.primary); y += 3; }
                    H.ceiling(ctx, a, b, a, b, y, P.dark); y += 1;
                }
                const last = tiers[tiers.length - 1];
                g.part('3957', P.metal, Math.floor((last[0] + last[1]) / 2), Math.floor((last[0] + last[1]) / 2), y);
                for (const [x, z] of [[last[0], last[0]], [last[1], last[1]]]) g.part('98138', 'TRANS_RED', x, z, y);
                H.tree(ctx, -2, W + 1, 1); H.tree(ctx, W + 1, -2, 1); H.lamp(ctx, W + 1, W + 1, 1);
                g.part('3941', 'LIGHT_GREY', -2, -2, 1); g.part('4032', P.water, -2, -2, 4);
                return { title: 'Skyscraper', features: [`${tiers.length} stepped setbacks`, 'alternating glass curtain-wall bands', 'a rooftop antenna with beacons', 'a plaza with trees and a fountain'] };
            }
            if (match === 'water tower') {
                g.box(-3, 6, -3, 6, 0, 0, P.ground);
                for (const [x, z] of [[0, 0], [3, 0], [0, 3], [3, 3]]) for (let i = 0; i < 4; i++) g.part('3062', P.metal, x, z, 1 + i * 3);
                g.part('3031', P.dark, 0, 0, 13);
                for (let i = 0; i < 3; i++) g.part('3941', P.primary, 1, 1, 14 + i * 3);
                g.part('3022', P.dark, 1, 1, 23); g.part('3942', P.roof, 1, 1, 24);
                return { title: 'Water Tower', features: ['four lattice legs', 'a round tank', 'a conical cap'] };
            }
            if (match === 'obelisk' || match === 'spire') {
                g.box(-3, 6, -3, 6, 0, 0, 'TAN'); g.box(-1, 4, -1, 4, 1, 2, 'TAN');
                g.box(0, 3, 0, 3, 3, 14, P.primary === 'RED' ? 'TAN' : P.primary);
                g.box(1, 2, 1, 2, 15, 26, P.primary === 'RED' ? 'TAN' : P.primary);
                g.part('3022', 'GOLD', 1, 1, 27); g.part('3942', 'GOLD', 1, 1, 28);
                return { title: 'Obelisk', features: ['a stepped plinth', 'a two-stage tapered shaft', 'a gold pyramidion'] };
            }
            if (match === 'eiffel tower' || match === 'radio tower') {
                g.box(-5, 12, -5, 12, 0, 0, P.ground);
                const iron = P.explicit ? P.primary : 'DARK_GREY';
                for (const [x, z] of [[0, 0], [6, 0], [0, 6], [6, 6]]) g.box(x, x + 1, z, z + 1, 1, 9, iron);
                H.ceiling(ctx, 0, 7, 0, 7, 10, iron); g.box(1, 6, 1, 6, 11, 11, iron, { noBrick: true });
                for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]]) g.box(x, x + 1, z, z + 1, 12, 17, iron);
                H.ceiling(ctx, 1, 6, 1, 6, 18, iron); g.box(2, 5, 2, 5, 19, 19, iron, { noBrick: true });
                g.shell(2, 5, 2, 5, 20, 28, iron); H.ceiling(ctx, 2, 5, 2, 5, 29, iron);
                g.box(3, 4, 3, 4, 30, 35, iron); g.part('3022', iron, 3, 3, 36); g.part('3957', P.metal, 3, 3, 37);
                g.part('98138', 'TRANS_RED', 4, 4, 37);
                H.tree(ctx, -4, 10, 1); H.tree(ctx, 10, -4, 1, 'pine'); H.lamp(ctx, 10, 10, 1);
                return { title: match === 'radio tower' ? 'Radio Mast' : 'Iron Lattice Tower', features: ['four splayed legs', 'three observation decks', 'a tapering lattice spire', 'a beacon and antenna'] };
            }
            // Generic stone tower: a watchtower, clock tower or bell tower.
            const clock = match === 'clock tower' || match === 'big ben', bell = match === 'bell tower' || match === 'minaret';
            const Hb = sc(6);
            g.box(-3, 6, -3, 6, 0, 0, P.ground);
            g.shell(0, 3, 0, 3, 1, Hb * 3, P.primary === 'RED' ? 'LIGHT_GREY' : P.primary);
            g.box(1, 2, 3, 3, 1, 5, P.wood);
            for (let i = 1; i < Hb; i += 2) H.window(ctx, 1, 3, 1 + i * 3, 'front', 'TRANS_BLUE');
            const yT = Hb * 3 + 1;
            H.slab(ctx, -1, 4, -1, 4, yT, clock || bell ? 'DARK_GREY' : P.wood);   // the overhanging top stage stands on one locked slab
            if (clock) { g.shell(-1, 4, -1, 4, yT + 2, yT + 6, 'DARK_GREY'); H.ceiling(ctx, -1, 4, -1, 4, yT + 7, 'DARK_GREY'); g.part('14769', 'WHITE', 1, 1, yT + 8); H.gableRoof(ctx, -1, 4, -1, 4, yT + 9, P.roof, 'x'); feats.push('a four-faced clock stage', 'a steep spire roof'); }
            else if (bell) { for (const [x, z] of [[-1, -1], [4, -1], [-1, 4], [4, 4]]) g.box(x, x, z, z, yT + 2, yT + 6, P.dark); H.ceiling(ctx, -1, 4, -1, 4, yT + 7, P.roof); g.part('59900', 'GOLD', 1, 1, yT + 2); g.part('3942', P.roof, 1, 1, yT + 8); feats.push('an open belfry with a gold bell', 'a conical roof'); }
            else {
                const banner = declare({ id: 'flag', label: 'Banner', type: 'bool', default: true });
                H.crenellate(ctx, -1, 4, -1, 4, yT + 2, P.primary === 'RED' ? 'LIGHT_GREY' : P.primary);
                if (banner) H.flag(ctx, 1, 1, yT + 2, P.accent);
                feats.push('an overhanging timber platform', banner ? 'crenellations and a banner' : 'crenellations');
            }
            H.tree(ctx, -2, 5, 1, 'pine');
            return { title: clock ? 'Clock Tower' : bell ? 'Bell Tower' : 'Watchtower', features: [`a ${Hb}-brick stone shaft`, ...feats] };
        }
    });

    reg({
        kind: 'monument', category: 'Architecture', icon: '🏛️',
        keys: ['pyramid', 'temple', 'bridge', 'arch', 'gate', 'fountain', 'statue', 'monument', 'colosseum', 'stadium', 'amphitheatre', 'ruins', 'ziggurat', 'tomb', 'mausoleum', 'parthenon', 'acropolis'],
        build(ctx) {
            const { g, P, sc, match } = ctx;
            if (match === 'pyramid' || match === 'ziggurat' || match === 'tomb') {
                const N = sc(10);
                g.box(-3, N + 2, -3, N + 2, 0, 0, 'TAN');
                const stone = P.explicit ? P.primary : 'TAN';
                let a = 0, b = N - 1, y = 1;
                while (b >= a) { g.box(a, b, a, b, y, y + (match === 'pyramid' ? 1 : 2), stone); a++; b--; y += match === 'pyramid' ? 2 : 3; }
                g.part('59900', 'GOLD', Math.floor(N / 2), Math.floor(N / 2), y);
                g.part('3004', P.dark, Math.floor(N / 2) - 1, N, 1, { rotY: PI / 2 });
                H.tree(ctx, N + 1, -2, 1, 'round');
                return { title: match === 'pyramid' ? 'Great Pyramid' : 'Ziggurat', features: [`${Math.ceil(N / 2)} stepped tiers`, 'a gold capstone', 'a sandstone entrance'] };
            }
            if (match === 'bridge') {
                const L = sc(16);
                g.box(-2, L + 1, -4, 5, 0, 0, P.water);
                for (const x of [0, L - 2]) { g.box(x - 1, x + 2, -2, 3, 1, 2, 'DARK_GREY'); g.shell(x, x + 1, -1, 2, 3, 14, P.primary); g.box(x, x + 1, -1, 2, 15, 15, P.dark, { noBrick: true }); g.part('98138', 'TRANS_RED', x, -1, 16); }
                g.box(-1, L, 0, 1, 8, 8, P.dark, { noBrick: true }); g.box(-1, L, 0, 1, 9, 9, P.secondary, { noBrick: true });
                for (let x = 2; x < L - 2; x += 4) g.part('3062', P.metal, x, 1, 10);
                for (let x = 1; x < L - 1; x += 2) g.part('3069', P.accent, x, 0, 10, { rotY: PI / 2 });
                return { title: 'Suspension Bridge', features: ['two masonry towers', 'a plated road deck over water', 'lamp posts and painted lane lines'] };
            }
            if (match === 'fountain') {
                g.box(-4, 5, -4, 5, 0, 0, 'LIGHT_GREY');
                g.disc(0.5, 0.5, 4, 1, 1, 'LIGHT_GREY'); g.ring(0.5, 0.5, 4, 2, 2, 'LIGHT_GREY'); g.disc(0.5, 0.5, 3, 2, 2, P.water);
                g.part('3941', 'LIGHT_GREY', 0, 0, 3); g.part('3031', P.water, -1, -1, 6); g.part('3062', 'LIGHT_GREY', 0, 0, 7); g.part('4032', P.water, 0, 0, 10); g.part('98138', 'TRANS_CLEAR', 0, 0, 11);
                for (const [x, z] of [[-4, -4], [5, -4], [-4, 5], [5, 5]]) H.lamp(ctx, x, z, 1);
                return { title: 'Plaza Fountain', features: ['a tiered basin', 'two spilling bowls', 'lamps on the plaza'] };
            }
            if (match === 'colosseum' || match === 'stadium' || match === 'amphitheatre') {
                const R = sc(7);
                g.box(-R - 2, R + 3, -R - 2, R + 3, 0, 0, P.ground);
                g.ring(0.5, 0.5, R, 1, 3, 'TAN'); g.ring(0.5, 0.5, R - 1, 1, 6, 'TAN'); g.ring(0.5, 0.5, R - 2, 1, 9, 'TAN');
                for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2, x = Math.round(0.5 + Math.cos(a) * R), z = Math.round(0.5 + Math.sin(a) * R); g.box(x, x, z, z, 4, 9, 'TAN'); }
                g.disc(0.5, 0.5, R - 3, 1, 1, P.ground);
                return { title: match === 'stadium' ? 'Stadium' : 'Colosseum', features: ['three stepped tiers of arcades', 'a ring of columns', 'an open arena floor'] };
            }
            if (match === 'arch' || match === 'gate') {
                g.box(-3, 8, -3, 4, 0, 0, P.ground);
                g.box(0, 1, 0, 1, 1, 15, P.primary === 'RED' ? 'LIGHT_GREY' : P.primary); g.box(4, 5, 0, 1, 1, 15, P.primary === 'RED' ? 'LIGHT_GREY' : P.primary);
                g.box(0, 5, 0, 1, 16, 21, P.primary === 'RED' ? 'LIGHT_GREY' : P.primary);
                for (const x of [2, 3]) g.part('54200', P.primary === 'RED' ? 'LIGHT_GREY' : P.primary, x, 0, 14, { rotY: PI }), g.part('54200', P.primary === 'RED' ? 'LIGHT_GREY' : P.primary, x, 1, 14);
                H.flag(ctx, 0, 0, 22, P.accent); H.flag(ctx, 5, 1, 22, P.accent);
                return { title: 'Triumphal Arch', features: ['two piers and a spanning attic', 'cheese-slope voussoirs', 'twin banners'] };
            }
            // Temple / statue / monument / ruins: a colonnaded hall on a stepped base.
            const W = sc(10), D = sc(6);
            g.box(-2, W + 1, -2, D + 1, 0, 1, 'TAN'); g.box(-1, W, -1, D, 2, 2, 'TAN');
            for (let x = 0; x <= W - 1; x += 2) for (const z of [0, D - 1]) for (let i = 0; i < 3; i++) g.part('3062', 'WHITE', x, z, 3 + i * 3);
            for (const x of [0, W - 1]) for (let z = 2; z <= D - 3; z += 2) for (let i = 0; i < 3; i++) g.part('3062', 'WHITE', x, z, 3 + i * 3);
            g.shell(1, W - 2, 1, D - 2, 3, 11, 'WHITE');
            g.box(-1, W, -1, D, 12, 12, 'WHITE', { noBrick: true });
            if (match !== 'ruins') H.gableRoof(ctx, -1, W, -1, D, 13, 'TAN', 'x');
            if (match === 'statue' || match === 'monument') { g.box(Math.floor(W / 2) - 1, Math.floor(W / 2), -1, 0, 3, 5, 'LIGHT_GREY'); g.part('3005', 'GOLD', Math.floor(W / 2), -1, 6); g.part('3005', 'GOLD', Math.floor(W / 2), -1, 9); g.part('98138', 'GOLD', Math.floor(W / 2), -1, 12); }
            return { title: match === 'ruins' ? 'Ancient Ruins' : 'Classical Temple', features: ['a stepped stylobate', 'a colonnade of round columns', match === 'ruins' ? 'a roofless cella' : 'a pedimented roof'] };
        }
    });

    /* ── vehicles ─────────────────────────────────────────────── */

    reg({
        kind: 'car', category: 'Vehicles', icon: '🚗',
        keys: ['car', 'coupe', 'sports car', 'race car', 'racing car', 'supercar', 'hot rod', 'sedan', 'taxi', 'cab', 'police car', 'hatchback', 'convertible', 'limo', 'limousine', 'van', 'truck', 'pickup', 'pickup truck', 'lorry', 'semi', 'fire truck', 'fire engine', 'ambulance', 'bus', 'school bus', 'jeep', 'suv', '4x4', 'monster truck', 'tractor', 'go-kart', 'kart', 'buggy', 'muscle car', 'roadster', 'camper', 'rv', 'ice cream truck', 'food truck', 'dump truck', 'garbage truck', 'tow truck', 'delivery van', 'vehicle', 'automobile', 'formula 1', 'f1 car', 'rally car'],
        build(ctx) {
            const { g, P, sc, chance, match, has, declare } = ctx;
            const truck = ['truck', 'lorry', 'semi', 'fire truck', 'fire engine', 'ambulance', 'pickup', 'pickup truck', 'dump truck', 'garbage truck', 'tow truck', 'ice cream truck', 'food truck', 'delivery van', 'van', 'camper', 'rv'].includes(match);
            const bus = ['bus', 'school bus', 'limo', 'limousine'].includes(match);
            const monster = match === 'monster truck', tractor = match === 'tractor', open = ['convertible', 'roadster', 'go-kart', 'kart', 'buggy', 'formula 1', 'f1 car', 'jeep'].includes(match);
            // Dial: monster wheels lift the chassis on any vehicle (the tractor keeps its own wheel set).
            const bigWheels = !tractor && declare({ id: 'wheels', label: 'Wheels', type: 'choice', choices: ['standard', 'monster'], default: monster ? 'monster' : 'standard' }) === 'monster';
            const W = 6, L = bus ? sc(14) : truck ? sc(12) : tractor ? sc(8) : sc(9);
            let body = P.primary;
            if (!P.explicit) body = { taxi: 'YELLOW', cab: 'YELLOW', 'police car': 'WHITE', ambulance: 'WHITE', 'fire truck': 'RED', 'fire engine': 'RED', 'school bus': 'YELLOW', tractor: 'GREEN', 'ice cream truck': 'WHITE', 'garbage truck': 'GREEN' }[match] || body;
            const feats = [];
            // A road plate with a centre line, so the model has a stage.
            g.box(-3, W + 2, -2, L + 1, 0, 0, 'DARK_GREY', { noBrick: true });
            for (let z = -1; z <= L; z += 3) g.part('3069', 'YELLOW', -3, z, 1, { rotY: 0 });
            const yC = bigWheels ? 5 : tractor ? 3 : 2;      // the chassis sits above the wheel hubs
            const wz = bus ? [1, L - 4] : truck ? (L - 3 >= 6 ? [1, 4, L - 3] : [1, L - 3]) : tractor ? [1, 5] : [1, L - 3];   // a micro truck has no room for a middle axle
            if (tractor) { g.part('3941', 'BLACK', -2, 0, 1, { rotZ: PI / 2, w: 2, l: 2, hp: 5, lie: true }); g.part('3941', 'BLACK', W, 0, 1, { rotZ: PI / 2, w: 2, l: 2, hp: 5, lie: true }); g.part('4032', 'BLACK', -1, L - 2, 1, { rotZ: PI / 2, w: 1, l: 2, hp: 5, lie: true }); g.part('4032', 'BLACK', W, L - 2, 1, { rotZ: PI / 2, w: 1, l: 2, hp: 5, lie: true }); }
            else H.wheels(ctx, 0, W - 1, wz, 1, bigWheels);
            g.box(0, W - 1, 0, L - 1, yC, yC, 'BLACK', { noBrick: true });
            // Trim plate: lights at the corners, a bumper front and back.
            g.box(0, W - 1, 0, L - 1, yC + 1, yC + 1, body, { noBrick: true });
            g.set(0, yC + 1, L - 1, 'TRANS_CLEAR', { noBrick: true }); g.set(W - 1, yC + 1, L - 1, 'TRANS_CLEAR', { noBrick: true });
            g.set(0, yC + 1, 0, 'TRANS_RED', { noBrick: true }); g.set(W - 1, yC + 1, 0, 'TRANS_RED', { noBrick: true });
            g.box(1, W - 2, L - 1, L - 1, yC + 1, yC + 1, 'DARK_GREY', { noBrick: true }); g.box(1, W - 2, 0, 0, yC + 1, yC + 1, 'DARK_GREY', { noBrick: true });
            const yB = yC + 2;   // body bricks start here
            if (bus) {
                g.box(0, W - 1, 0, L - 1, yB, yB + 2, body);
                g.shell(0, W - 1, 0, L - 1, yB + 3, yB + 5, body);
                for (let z = 1; z + 1 <= L - 3; z += 3) { H.window(ctx, 0, z, yB + 3, 'left'); H.window(ctx, W - 1, z, yB + 3, 'right'); }
                H.window(ctx, 1, L - 1, yB + 3, 'front'); H.window(ctx, 1, 0, yB + 3, 'back');
                H.ceiling(ctx, 0, W - 1, 0, L - 1, yB + 6, match === 'school bus' ? 'BLACK' : body);
                if (match === 'school bus') { g.part('98138', 'TRANS_RED', 0, L - 1, yB + 7); g.part('98138', 'TRANS_RED', W - 1, L - 1, yB + 7); }
                feats.push('a full row of side windows', 'a wraparound windscreen');
            } else if (truck) {
                const cabZ = L - 4;
                g.box(0, W - 1, cabZ, L - 1, yB, yB + 2, body);
                for (let x = 0; x < W; x += 2) { g.part('3039', body, x, L - 2, yB + 3, { rotY: 0 }); g.part('3039', P.glass, x, cabZ, yB + 3, { rotY: 0 }); }
                g.box(0, W - 1, cabZ, cabZ, yB + 6, yB + 6, body, { noBrick: true });
                const cargo = declare({ id: 'cargo', label: 'Cargo', type: 'choice', choices: ['box', 'bed', 'tow'], default: match === 'pickup' || match === 'pickup truck' ? 'bed' : match === 'tow truck' ? 'tow' : 'box' });
                if (cargo === 'box') {
                    g.shell(0, W - 1, 0, cabZ - 2, yB, yB + 8, match === 'ambulance' || match === 'ice cream truck' || match === 'delivery van' || match === 'van' || match === 'camper' || match === 'rv' ? 'WHITE' : P.secondary);
                    H.ceiling(ctx, 0, W - 1, 0, cabZ - 2, yB + 9, 'LIGHT_GREY');
                    if (match === 'ambulance') { g.part('3070', 'RED', 2, cabZ - 3, yB + 10); g.part('3070', 'RED', 3, cabZ - 3, yB + 10); g.part('98138', 'TRANS_BLUE', 2, cabZ, yB + 7); g.part('98138', 'TRANS_RED', 3, cabZ, yB + 7); feats.push('a red cross and emergency lights'); }
                    if (match === 'fire truck' || match === 'fire engine') { if (cabZ >= 5) { g.part('3005', 'LIGHT_GREY', 0, 1, yB + 10); g.part('3005', 'LIGHT_GREY', 0, cabZ - 3, yB + 10); g.part('3460', 'LIGHT_GREY', 0, 0, yB + 13, { rotY: 0, l: Math.min(8, cabZ - 2) }); feats.push('a roof-mounted ladder'); } g.part('98138', 'TRANS_BLUE', 2, cabZ, yB + 7); feats.push('a blue beacon'); }
                    if (match === 'ice cream truck' || match === 'food truck') { g.part('3069', P.accent, 2, cabZ - 3, yB + 10); g.part('59900', 'PINK', 1, 0, yB + 10); g.part('98138', 'WHITE', 2, 0, yB + 10); feats.push('a serving hatch and a giant ice cream'); }
                    feats.push('a tall cargo box');
                } else if (cargo === 'bed') {
                    g.shell(0, W - 1, 0, cabZ - 2, yB, yB + 2, body); g.box(1, W - 2, 1, cabZ - 3, yB, yB, 'BLACK', { noBrick: true });
                    g.part('3941', 'TAN', 1, 1, yB + 1); feats.push('an open cargo bed with a load');
                } else {
                    g.box(0, W - 1, 0, cabZ - 2, yB, yB + 2, body); g.box(1, 2, 0, 1, yB + 3, yB + 8, P.dark); g.part('3710', P.metal, 1, -2, yB + 9, { rotY: 0 }); g.part('4073', 'BLACK', 1, -2, yB + 10); feats.push('a tow boom and hook');
                }
                if (truck && L > 9) { g.part('98138', 'TRANS_ORANGE', 0, L - 2, yB + 6); g.part('98138', 'TRANS_ORANGE', W - 1, L - 2, yB + 6); }
            } else if (tractor) {
                g.box(0, W - 1, 2, L - 1, yB, yB + 2, body);
                g.box(2, 3, 4, L - 1, yB + 3, yB + 5, body);
                g.part('3062', 'LIGHT_GREY', 1, L - 2, yB + 3); g.part('3062', 'LIGHT_GREY', 1, L - 2, yB + 6);
                g.box(0, W - 1, 0, 1, yB, yB + 2, 'BLACK'); g.part('3070', 'BLACK', 2, 2, yB + 3); g.part('98138', 'BLACK', 3, 3, yB + 3);
                g.box(0, 0, 1, 1, yB + 3, yB + 8, 'BLACK'); g.box(W - 1, W - 1, 1, 1, yB + 3, yB + 8, 'BLACK'); g.part('3032', body, 0, 0, yB + 9, { w: 6, l: 4, rotY: PI / 2 });
                g.part('3023', 'YELLOW', 2, L - 1, yB + 6, { rotY: PI / 2 });
                feats.push('big rear wheels', 'an exhaust stack', 'a canopy cab');
            } else {
                // A car: hood slope, windscreen, cabin, roof, rear.
                const cabZ = L - 5;
                g.box(0, W - 1, 0, L - 1, yB, yB + 2, body);
                g.part('3037', body, 0, L - 2, yB + 3, { rotY: 0 }); g.part('3039', body, 4, L - 2, yB + 3, { rotY: 0 });
                for (let x = 0; x < W; x += 2) g.part('3039', P.glass, x, cabZ, yB + 3, { rotY: 0 });
                if (open) {
                    g.box(0, W - 1, 1, cabZ - 1, yB + 3, yB + 3, body, { noBrick: true });
                    g.part('3070', 'BLACK', 1, cabZ - 2, yB + 4); g.part('3070', 'BLACK', 2, cabZ - 2, yB + 4); g.part('3070', 'BLACK', 3, cabZ - 2, yB + 4); g.part('3070', 'BLACK', 4, cabZ - 2, yB + 4); g.part('98138', 'BLACK', 2, cabZ - 1, yB + 4);
                    if (match === 'formula 1' || match === 'f1 car') { g.part('3666', P.secondary, 0, 0, yB + 6, { rotY: PI / 2, w: 6, l: 1 }); g.box(0, 0, 0, 0, yB + 3, yB + 5, 'BLACK'); g.box(W - 1, W - 1, 0, 0, yB + 3, yB + 5, 'BLACK'); g.part('3666', P.secondary, 0, L - 1, yB + 3, { rotY: PI / 2, w: 6, l: 1 }); }
                    feats.push('an open cockpit with seats');
                } else {
                    g.box(0, W - 1, 0, cabZ - 1, yB + 3, yB + 5, body);
                    if (cabZ >= 3) { H.window(ctx, 0, 1, yB + 3, 'left'); H.window(ctx, W - 1, 1, yB + 3, 'right'); }   // a micro cab has no room beside the windscreen
                    g.box(0, W - 1, 0, cabZ, yB + 6, yB + 6, body, { noBrick: true });
                    const stripeDflt = has('stripe', 'stripes', 'racing', 'race') || match === 'sports car' || match === 'muscle car' || match === 'rally car';
                    if (declare({ id: 'stripe', label: 'Racing stripe', type: 'bool', default: stripeDflt })) { g.box(2, 3, 0, cabZ, yB + 6, yB + 6, P.secondary, { noBrick: true }); feats.push('a racing stripe'); }
                    const spoilerDflt = match === 'sports car' || match === 'supercar' || match === 'race car' || match === 'racing car' || match === 'muscle car' || match === 'rally car' || chance(0.4);
                    if (declare({ id: 'spoiler', label: 'Rear spoiler', type: 'bool', default: spoilerDflt })) {
                        g.part('3024', 'BLACK', 0, 0, yB + 7); g.part('3024', 'BLACK', W - 1, 0, yB + 7); g.part('3666', 'BLACK', 0, 0, yB + 8, { rotY: PI / 2, w: 6, l: 1 }); feats.push('a rear spoiler');
                    }
                    if (match === 'police car') { g.part('3069', 'TRANS_BLUE', 1, 2, yB + 7, { rotY: PI / 2 }); g.part('3069', 'TRANS_RED', 3, 2, yB + 7, { rotY: PI / 2 }); g.box(0, W - 1, 0, L - 1, yB, yB, 'BLACK', { noBrick: true }); feats.push('a blue light bar'); }
                    if (match === 'taxi' || match === 'cab') { g.part('3069', 'BLACK', 2, 2, yB + 7, { rotY: PI / 2 }); feats.push('a roof sign'); }
                }
                feats.push('a sloped hood and glass windscreen', 'headlights and tail lights');
            }
            const names = { 'sports car': 'Sports Car', supercar: 'Supercar', 'race car': 'Race Car', 'racing car': 'Race Car', 'hot rod': 'Hot Rod', taxi: 'City Taxi', cab: 'City Taxi', 'police car': 'Police Cruiser', 'fire truck': 'Fire Engine', 'fire engine': 'Fire Engine', ambulance: 'Ambulance', bus: 'City Bus', 'school bus': 'School Bus', 'monster truck': 'Monster Truck', tractor: 'Farm Tractor', pickup: 'Pickup Truck', 'pickup truck': 'Pickup Truck', truck: 'Box Truck', lorry: 'Lorry', semi: 'Semi Truck', jeep: 'Off-Road Jeep', suv: 'SUV', '4x4': 'Off-Roader', convertible: 'Convertible', roadster: 'Roadster', limo: 'Stretch Limo', limousine: 'Stretch Limo', 'muscle car': 'Muscle Car', 'go-kart': 'Go-Kart', kart: 'Go-Kart', buggy: 'Dune Buggy', camper: 'Camper Van', rv: 'Motorhome', 'ice cream truck': 'Ice Cream Truck', 'food truck': 'Food Truck', 'dump truck': 'Dump Truck', 'garbage truck': 'Garbage Truck', 'tow truck': 'Tow Truck', 'delivery van': 'Delivery Van', van: 'Panel Van', 'formula 1': 'Formula Racer', 'f1 car': 'Formula Racer', 'rally car': 'Rally Car' };
            return { title: names[match] || 'Coupe', features: [...feats, `${wz.length * 2} wheels`, 'a road base with lane markings'] };
        }
    });

    reg({
        kind: 'bike', category: 'Vehicles', icon: '🏍️',
        keys: ['motorcycle', 'motorbike', 'bike', 'bicycle', 'scooter', 'moped', 'chopper bike', 'dirt bike'],
        build(ctx) {
            const { g, P } = ctx;
            g.box(-2, 3, -2, 7, 0, 0, 'DARK_GREY', { noBrick: true });
            for (let x = -2; x <= 3; x++) g.part('3070', 'LIGHT_GREY', x, -2, 1);
            g.part('4032', 'BLACK', 0, 0, 1, { rotZ: PI / 2, w: 1, l: 2, hp: 5, lie: true }); g.part('4032', 'BLACK', 0, 4, 1, { rotZ: PI / 2, w: 1, l: 2, hp: 5, lie: true });
            g.part('3623', 'BLACK', 0, 1, 6, { rotY: 0, l: 3 });
            g.box(0, 0, 2, 3, 7, 9, P.primary);
            g.part('3070', 'BLACK', 0, 1, 7); g.part('3024', 'LIGHT_GREY', 0, 4, 7); g.part('98138', 'TRANS_CLEAR', 0, 4, 8);
            g.part('3023', 'BLACK', 0, 0, 6, { rotY: PI / 2, w: 2, l: 1 }); g.part('3062', 'LIGHT_GREY', 1, 0, 7, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true });   // the exhaust on a bracket over the front wheel
            g.part('3024', P.accent, 0, 2, 10);
            return { title: ctx.match === 'bicycle' ? 'Bicycle' : ctx.match === 'scooter' || ctx.match === 'moped' ? 'Scooter' : 'Motorcycle', features: ['two round-plate wheels', 'a fuel tank and saddle', 'a headlight and side exhaust', 'a tiled display plinth'] };
        }
    });

    reg({
        kind: 'train', category: 'Vehicles', icon: '🚂',
        keys: ['train', 'locomotive', 'steam train', 'steam engine', 'tram', 'streetcar', 'monorail', 'subway', 'metro', 'bullet train', 'freight train'],
        build(ctx) {
            const { g, P, sc, match } = ctx;
            const L = sc(12), modern = ['bullet train', 'monorail', 'subway', 'metro', 'tram', 'streetcar'].includes(match);
            // Track: sleepers and rails.
            g.box(-2, 5, -2, L + 3, 0, 0, 'TAN', { noBrick: true });
            for (let z = -1; z <= L + 2; z += 2) g.part('3710', 'BROWN', 0, z, 1, { rotY: PI / 2 });
            for (let z = -1; z <= L + 2; z += 4) { g.part('2431', 'DARK_GREY', 0, z, 2, { rotY: 0 }); g.part('2431', 'DARK_GREY', 3, z, 2, { rotY: 0 }); }
            const body = P.explicit ? P.primary : modern ? 'WHITE' : 'DARK_GREEN' in window.LEGO_COLORS ? 'DARK_GREEN' : 'GREEN';
            for (const z of [1, 4, L - 3]) { g.part('4032', 'BLACK', -1, z, 2, { rotZ: PI / 2, w: 1, l: 2, hp: 5, lie: true }); g.part('4032', 'BLACK', 4, z, 2, { rotZ: PI / 2, w: 1, l: 2, hp: 5, lie: true }); }
            g.box(0, 3, 0, L - 1, 3, 3, 'BLACK', { noBrick: true }); g.box(0, 3, 0, L - 1, 4, 4, body, { noBrick: true });
            if (modern) {
                g.shell(0, 3, 0, L - 1, 5, 10, body);
                for (let z = 2; z + 1 <= L - 4; z += 3) { H.window(ctx, 0, z, 7, 'left'); H.window(ctx, 3, z, 7, 'right'); }
                g.part('3039', P.glass, 0, L - 2, 5, { rotY: 0 }); g.part('3039', P.glass, 2, L - 2, 5, { rotY: 0 });
                H.ceiling(ctx, 0, 3, 0, L - 3, 11, P.secondary); g.shell(0, 3, 0, L - 1, 8, 8, P.accent, { noBrick: true });
                return { title: match === 'tram' || match === 'streetcar' ? 'City Tram' : 'Bullet Train', features: ['a streamlined glass nose', 'a row of windows', 'a livery stripe', 'rails and sleepers'] };
            }
            // Steam locomotive: boiler, cab, funnel, cow-catcher, tender.
            const cabZ = 2;
            g.box(0, 3, cabZ + 4, L - 1, 5, 5, body, { noBrick: true });
            for (let z = cabZ + 4; z <= L - 4; z += 2) g.part('3941', body, 1, z, 6, { rotX: PI / 2, w: 2, l: 2, hp: 5, lie: true });
            g.part('3941', 'BLACK', 1, L - 2, 6, { rotX: PI / 2, w: 2, l: 2, hp: 5, lie: true });
            g.part('3062', 'BLACK', 1, L - 3, 11); g.part('59900', 'BLACK', 1, L - 3, 14); g.part('3062', 'GOLD', 2, cabZ + 5, 11);
            g.part('3040', 'DARK_GREY', 1, L - 1, 3, { rotY: PI / 2, w: 2, l: 1 });
            g.shell(0, 3, cabZ, cabZ + 3, 5, 10, body); H.window(ctx, 0, cabZ + 1, 7, 'left'); H.window(ctx, 3, cabZ + 1, 7, 'right');
            g.box(0, 3, cabZ, cabZ + 3, 11, 11, 'BLACK', { noBrick: true });
            g.shell(0, 3, 0, cabZ - 1, 5, 7, body); g.box(1, 2, 0, 0, 5, 7, 'BLACK');
            return { title: 'Steam Locomotive', features: ['a round boiler with a smokestack', 'a driver\'s cab with windows', 'a coal tender', 'six wheels on laid track'] };
        }
    });

    reg({
        kind: 'tank', category: 'Vehicles', icon: '🪖',
        keys: ['tank', 'battle tank', 'apc', 'armored car', 'armoured car', 'artillery', 'howitzer', 'military truck', 'humvee'],
        build(ctx) {
            const { g, P, sc } = ctx;
            const L = sc(10), body = P.explicit ? P.primary : 'GREEN';
            g.box(-2, 7, -2, L + 1, 0, 0, 'TAN', { noBrick: true });
            // Tracks: dark plate blocks with tile tops either side of the hull.
            for (const x of [0, 5]) { g.box(x, x, 0, L - 1, 1, 4, 'DARK_GREY'); g.box(x, x, 0, L - 1, 5, 5, 'BLACK', { noBrick: true }); }
            g.box(1, 4, 0, L - 1, 3, 5, body);
            g.part('3037', body, 1, L - 2, 6, { rotY: 0 });
            g.box(1, 4, 0, L - 3, 6, 6, body, { noBrick: true });
            // Turret and barrel.
            g.part('3031', 'DARK_GREY', 1, 2, 7); g.box(2, 3, 3, 4, 8, 10, body); g.part('3068', body, 2, 3, 11);
            g.part('3710', 'DARK_GREY', 2, 5, 8, { rotY: 0, w: 1, l: 4 });   // the barrel's mount plate
            for (let i = 0; i < 2; i++) g.part('3062', 'DARK_GREY', 2, 5 + i * 2, 9, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true });
            g.part('3957', 'BLACK', 3, 2, 8); g.part('98138', 'TRANS_ORANGE', 2, 2, 8);
            return { title: 'Battle Tank', features: ['studded tracks either side', 'a sloped glacis plate', 'a rotating turret with a long barrel', 'a radio antenna'] };
        }
    });

    /* ── aircraft ─────────────────────────────────────────────── */

    reg({
        kind: 'aircraft', category: 'Vehicles', icon: '✈️',
        keys: ['plane', 'airplane', 'aeroplane', 'aircraft', 'jet', 'fighter', 'fighter jet', 'airliner', 'jumbo jet', 'biplane', 'bomber', 'glider', 'seaplane', 'drone', 'quadcopter', 'helicopter', 'chopper', 'gunship', 'stealth bomber', 'propeller plane', 'crop duster', 'spitfire', 'concorde', 'space shuttle', 'shuttle', 'cessna', 'airship', 'blimp', 'zeppelin', 'hot air balloon', 'balloon'],
        build(ctx) {
            const { g, P, sc, match } = ctx;
            const heli = ['helicopter', 'chopper', 'gunship'].includes(match), drone = match === 'drone' || match === 'quadcopter';
            const feats = [];
            if (match === 'airship' || match === 'blimp' || match === 'zeppelin' || match === 'hot air balloon' || match === 'balloon') {
                const L = sc(12), env = P.explicit ? P.primary : ctx.style === 'steampunk' ? 'TAN' : 'LIGHT_GREY';
                g.box(-4, 7, -3, L + 2, 0, 0, 'DARK_GREY', { noBrick: true });
                // Gondola on the ground, a clear cradle, the envelope resting on it.
                g.box(0, 3, 3, L - 5, 1, 1, P.wood, { noBrick: true }); g.shell(0, 3, 3, L - 5, 2, 4, P.wood); H.window(ctx, 1, L - 5, 2, 'front', 'TRANS_ORANGE');
                H.ceiling(ctx, 0, 3, 3, L - 5, 5, P.wood);
                g.box(1, 2, 0, L - 1, 6, 8, 'TRANS_CLEAR');   // a clear cradle the envelope rests on
                g.box(0, 3, 0, L - 1, 9, 9, env, { noBrick: true }); g.box(-1, 4, 1, L - 2, 10, 12, env); g.box(-1, 4, 2, L - 3, 13, 15, env); g.box(0, 3, 3, L - 4, 16, 16, env, { noBrick: true });
                g.part('3039', env, 0, L - 1, 10, { rotY: 0 }); g.part('3039', env, 2, L - 1, 10, { rotY: 0 }); g.part('3039', env, 0, -1, 10, { rotY: PI }); g.part('3039', env, 2, -1, 10, { rotY: PI });
                g.part('54200', P.accent, 1, 2, 16, { rotY: PI }); g.part('54200', P.accent, 2, 2, 16, { rotY: PI }); g.part('3023', P.accent, -2, 2, 13, { rotY: PI / 2, w: 2, l: 1 }); g.part('3023', P.accent, 4, 2, 13, { rotY: PI / 2, w: 2, l: 1 });
                g.part('4032', P.dark, 1, -2, 2, { rotX: PI / 2, w: 2, l: 1, hp: 5, lie: true });
                g.box(0, 3, 4, L - 6, 10, 10, P.accent, { noBrick: true });
                return { title: match === 'hot air balloon' || match === 'balloon' ? 'Hot Air Balloon' : 'Airship', features: ['a tapered envelope with tail fins', 'a timber gondola with a window', 'a stern propeller', 'clear rigging struts'] };
            }
            if (drone) {
                g.box(-5, 6, -5, 6, 0, 0, 'DARK_GREY', { noBrick: true });
                for (const [x, z] of [[0, 0], [1, 1]]) g.part('3062', P.dark, x, z, 1);
                g.part('3031', P.dark, -1, -1, 4); g.box(0, 1, 0, 1, 5, 7, P.primary); g.part('98138', 'TRANS_RED', 0, 0, 8); g.part('98138', 'TRANS_BLUE', 1, 1, 8);
                g.part('3710', P.primary, -5, 0, 4, { rotY: PI / 2 }); g.part('3710', P.primary, 3, 1, 4, { rotY: PI / 2 });
                g.part('3710', P.primary, 1, -5, 4, { rotY: 0 }); g.part('3710', P.primary, 0, 3, 4, { rotY: 0 });
                for (const [x, z] of [[-5, 0], [5, 1], [1, -5], [0, 5]]) { g.part('3062', P.dark, x, z, 5); g.part('4032', P.metal, x - (x < 0 ? 0 : 1), z - (z < 0 ? 0 : 1), 8); }
                g.part('98138', 'TRANS_CLEAR', 0, 2, 5);
                return { title: 'Quadcopter Drone', features: ['four rotor arms', 'spinning rotor discs', 'a camera gimbal', 'navigation lights'] };
            }
            if (heli) {
                const L = sc(6);
                g.box(-3, 4, -8, L + 1, 0, 0, 'DARK_GREY', { noBrick: true });
                g.part('3666', 'BLACK', -1, 0, 1, { rotY: 0, l: Math.min(6, L) }); g.part('3666', 'BLACK', 2, 0, 1, { rotY: 0, l: Math.min(6, L) });
                g.part('3032', 'BLACK', -1, 0, 2, { w: 4, l: 6 });
                g.box(0, 1, 0, L - 1, 3, 5, P.primary);
                g.part('3040', P.glass, 0, L - 2, 6, { rotY: 0 }); g.part('3040', P.glass, 1, L - 2, 6, { rotY: 0 });
                g.box(0, 1, 0, L - 3, 6, 8, P.primary);
                H.window(ctx, 0, 1, 6, 'left'); H.window(ctx, 1, 1, 6, 'right');
                g.box(0, 1, 0, L - 3, 9, 9, P.secondary, { noBrick: true });
                g.part('3062', P.dark, 0, 1, 10); g.part('4477', 'LIGHT_GREY', 0, -4, 13, { rotY: 0, l: 10 }); g.part('4477', 'LIGHT_GREY', -4, 1, 14, { rotY: PI / 2, w: 10, l: 1 });
                // Tail boom and rotor.
                g.part('4477', P.primary, 0, -9, 6, { rotY: 0, l: 10 }); g.part('3005', P.primary, 0, -9, 7); g.part('54200', P.accent, 0, -9, 10);
                g.part('3023', P.primary, 0, -8, 7, { rotY: PI / 2, w: 2, l: 1 });   // a bracket on the boom carries the tail rotor
                g.part('4032', P.metal, 1, -8, 8, { rotZ: PI / 2, w: 1, l: 2, hp: 5, lie: true });
                feats.push('a bubble canopy', 'a two-blade main rotor', 'a tail boom with fin and tail rotor', 'landing skids');
                return { title: match === 'gunship' ? 'Attack Helicopter' : 'Helicopter', features: feats };
            }
            const L = sc(match === 'airliner' || match === 'jumbo jet' || match === 'concorde' ? 16 : 12), Y = 4;
            const jet = ['jet', 'fighter', 'fighter jet', 'stealth bomber', 'concorde', 'space shuttle', 'shuttle'].includes(match);
            const span = sc(jet ? 5 : 6), wz = Math.floor(L / 2) - 1;
            const body = P.explicit ? P.primary : (match === 'airliner' || match === 'jumbo jet' || match === 'concorde' || match === 'space shuttle' || match === 'shuttle' ? 'WHITE' : match === 'stealth bomber' ? 'BLACK' : P.primary);
            g.box(-span - 2, span + 3, -3, L + 2, 0, 0, 'DARK_GREY', { noBrick: true });
            H.stand(ctx, 0, wz, 1, 1); H.stand(ctx, 1, wz, 1, 1);
            // Lower fuselage, then the wing layer through it, then the upper fuselage.
            g.box(0, 1, 0, L - 1, Y, Y + 2, body);
            g.box(0, 1, 0, L - 1, Y + 3, Y + 3, body, { noBrick: true });
            const swept = ctx.declare({ id: 'wings', label: 'Wings', type: 'choice', choices: ['straight', 'swept'], default: jet ? 'swept' : 'straight' }) === 'swept';
            if (swept) {
                // Swept wings: plates stepping back from root to tip.
                for (let i = 0; i < span; i += 2) { const yy = Y + 3 - (i % 4 === 2 ? 1 : 0), off = i === 0 ? 0 : i - 1; g.part('3020', body, -3 - off, wz - i / 2, yy, { rotY: PI / 2, w: 4, l: 2 }); g.part('3020', body, 1 + off, wz - i / 2, yy, { rotY: PI / 2, w: 4, l: 2 }); }   // each wing roots one stud onto the fuselage and steps outward
                g.part('3062', 'DARK_GREY', -1, wz - 1, Y + 4, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); g.part('3062', 'DARK_GREY', 2, wz - 1, Y + 4, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true });
                feats.push('swept delta wings', 'twin engine pods');
            } else {
                // Wings are real 2x4 / 2x6 / 2x8 plates, rooted one stud into the fuselage.
                const wl = span >= 8 ? 8 : span >= 6 ? 6 : 4, wid = { 8: '3034', 6: '3795', 4: '3020' }[wl];
                g.part(wid, body, -wl + 1, wz, Y + 3, { rotY: PI / 2, w: wl, l: 2 }); g.part(wid, body, 1, wz, Y + 3, { rotY: PI / 2, w: wl, l: 2 });
                if (match === 'biplane') { g.part(wid, body, -wl, wz, Y + 9, { rotY: PI / 2, w: wl, l: 2 }); g.part(wid, body, 1, wz, Y + 9, { rotY: PI / 2, w: wl, l: 2 }); g.part('3062', P.metal, -wl + 1, wz, Y + 4); g.part('3062', P.metal, wl, wz, Y + 4); for (const yy of [Y + 7, Y + 8]) { g.part('4073', P.metal, -wl + 1, wz, yy); g.part('4073', P.metal, wl, wz, yy); } feats.push('double wings with struts'); }
                else if (match === 'airliner' || match === 'jumbo jet' || jet) { g.part('3062', 'DARK_GREY', -3, wz, Y + 4, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); g.part('3062', 'DARK_GREY', 4, wz, Y + 4, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); feats.push('wing-mounted engines'); }   // a jet on straight wings borrows the airliner's engines, which also pin the wings down
                else feats.push('straight wings');
                g.part('3023', body, 0, L - 1, Y, { rotY: 0 }); g.part('3023', body, 1, L - 1, Y, { rotY: 0 });   // nose plates carry the propeller
                g.part('4032', P.dark, 0, L, Y + 1, { rotX: PI / 2, w: 2, l: 1, hp: 5, lie: true }); feats.push('a nose propeller');
            }
            // Tail: stabilisers in the plate layer, a fin on top.
            g.part('3710', body, -3, 0, Y + 3, { rotY: PI / 2, w: 4, l: 1 }); g.part('3710', body, 1, 0, Y + 3, { rotY: PI / 2, w: 4, l: 1 });
            g.box(0, 0, 1, 1, Y + 4, Y + 9, body); g.part('54200', P.accent, 0, 1, Y + 10, { rotY: 0 });
            // Upper fuselage, cockpit and nose.
            g.box(0, 1, 2, L - 5, Y + 4, Y + 6, body);
            g.part('3040', P.glass, 0, L - 4, Y + 4, { rotY: 0 }); g.part('3040', P.glass, 1, L - 4, Y + 4, { rotY: 0 });
            g.part('3039', body, 0, L - 2, Y + 4, { rotY: 0 });
            g.box(0, 1, 2, L - 5, Y + 7, Y + 7, P.secondary, { noBrick: true });
            if (match === 'space shuttle' || match === 'shuttle') { g.box(0, 1, 0, L - 1, Y, Y, 'BLACK', { noBrick: true }); for (const x of [0, 1]) { g.part('3623', 'BLACK', x, -2, Y, { rotY: 0, w: 1, l: 3 }); g.part('3062', 'DARK_GREY', x, -2, Y + 1, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); } feats.push('black heat-shield belly', 'main engine bells'); }   // engine mounts run into the belly
            feats.push('a glass cockpit', 'a tail fin and stabilisers', 'a display stand');
            const names = { airliner: 'Airliner', 'jumbo jet': 'Jumbo Jet', biplane: 'Biplane', fighter: 'Fighter Jet', 'fighter jet': 'Fighter Jet', jet: 'Jet', bomber: 'Bomber', 'stealth bomber': 'Stealth Bomber', glider: 'Glider', seaplane: 'Seaplane', concorde: 'Supersonic Airliner', 'space shuttle': 'Space Shuttle', shuttle: 'Space Shuttle', spitfire: 'Warbird', 'crop duster': 'Crop Duster', cessna: 'Light Aircraft', 'propeller plane': 'Propeller Plane' };
            return { title: names[match] || 'Aeroplane', features: feats };
        }
    });

    /* ── ships ────────────────────────────────────────────────── */

    reg({
        kind: 'boat', category: 'Vehicles', icon: '⛵',
        keys: ['boat', 'ship', 'yacht', 'sailboat', 'sailing ship', 'pirate ship', 'galleon', 'tugboat', 'tug', 'cruise ship', 'ferry', 'steamboat', 'steamship', 'cargo ship', 'container ship', 'battleship', 'destroyer', 'warship', 'aircraft carrier', 'canoe', 'kayak', 'speedboat', 'fishing boat', 'trawler', 'gondola', 'raft', 'submarine', 'sub', 'u-boat', 'viking ship', 'longship', 'frigate', 'schooner', 'catamaran', 'houseboat', 'lifeboat', 'rowboat', 'barge', 'ark'],
        build(ctx) {
            const { g, P, sc, match, chance } = ctx;
            const feats = [];
            if (match === 'submarine' || match === 'sub' || match === 'u-boat') {
                const L = sc(12), hull = P.explicit ? P.primary : match === 'u-boat' ? 'DARK_GREY' : 'YELLOW';
                g.box(-3, 5, -3, L + 2, 0, 0, P.water, { noBrick: true });
                g.box(0, 1, 1, L - 2, 1, 1, hull, { noBrick: true });
                g.box(0, 1, 0, L - 1, 2, 4, hull); g.box(-1, 2, 3, L - 4, 2, 4, hull);
                g.part('54200', hull, -1, 3, 5, { rotY: PI }); g.part('54200', hull, 2, 3, 5, { rotY: PI }); g.part('54200', hull, -1, L - 4, 5); g.part('54200', hull, 2, L - 4, 5);
                g.box(0, 1, 1, L - 2, 5, 7, hull);
                g.part('3039', hull, 0, L - 2, 5, { rotY: 0 }); g.part('3039', hull, 0, 0, 5, { rotY: PI });
                g.box(0, 1, 3, L - 4, 8, 8, hull, { noBrick: true });
                const tz = Math.floor(L / 2) - 1;
                g.box(0, 1, tz, tz + 1, 9, 11, hull); g.part('3022', P.dark, 0, tz, 12); g.part('3062', P.metal, 0, tz, 13); g.part('3062', P.metal, 0, tz, 16); g.part('4073', 'TRANS_BLUE', 0, tz, 19);
                g.part('4032', P.dark, 0, -1, 3, { rotX: PI / 2, w: 2, l: 1, hp: 5, lie: true });
                for (let z = 4; z <= L - 5; z += 3) g.part('98138', 'TRANS_BLUE', 1, z, 9);
                return { title: match === 'u-boat' ? 'U-Boat' : 'Submarine', features: ['a wide-beam hull with dive planes', 'a conning tower and periscope', 'portholes along the deck', 'a stern propeller'] };
            }
            const sail = ['sailboat', 'sailing ship', 'pirate ship', 'galleon', 'viking ship', 'longship', 'frigate', 'schooner', 'yacht', 'ark', 'catamaran'].includes(match);
            const small = ['canoe', 'kayak', 'rowboat', 'raft', 'gondola', 'lifeboat', 'speedboat'].includes(match);
            const W = small ? 2 : sc(4), L = small ? sc(8) : sc(14);
            const hull = P.explicit ? P.primary : match === 'pirate ship' ? 'BLACK' : match === 'battleship' || match === 'destroyer' || match === 'warship' || match === 'aircraft carrier' ? 'LIGHT_GREY' : match === 'viking ship' || match === 'longship' || match === 'canoe' || match === 'raft' || match === 'ark' ? 'BROWN' : P.primary;
            g.box(-4, W + 3, -3, L + 3, 0, 0, P.water, { noBrick: true });
            // Hull: a plate keel, a brick row, a tapered bow with slopes, a deck.
            g.box(0, W - 1, 1, L - 2, 1, 1, hull, { noBrick: true });
            g.box(0, W - 1, 1, L - 3, 2, 4, hull);
            if (W >= 4) { g.part('3039', hull, 0, L - 2, 2, { rotY: 0 }); g.part('3039', hull, W - 2, L - 2, 2, { rotY: 0 }); } else g.part('3039', hull, 0, L - 2, 2, { rotY: 0 });
            g.part('3040', hull, 0, -1, 2, { rotY: PI, w: 1, l: 2 }); g.part('3040', hull, W - 1, -1, 2, { rotY: PI, w: 1, l: 2 });
            const deck = small ? hull : 'TAN';
            g.box(0, W - 1, 0, L - 3, 5, 5, deck, { noBrick: true });
            const yD = 6;
            if (small) {
                g.part('3070', P.wood, 0, 2, yD); g.part('3070', P.wood, 1, 3, yD);
                if (match === 'speedboat') { g.part('3040', P.glass, 0, L - 4, yD, { rotY: 0 }); g.part('3040', P.glass, 1, L - 4, yD, { rotY: 0 }); g.part('3062', P.dark, 0, -3, 2, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); feats.push('a windscreen and outboard motor'); }
                else { g.part('3062', P.wood, 1, 1, yD); g.part('3710', P.wood, 1, -2, yD + 3, { rotY: 0 }); feats.push('a pair of oars'); }
                return { title: { canoe: 'Canoe', kayak: 'Kayak', rowboat: 'Rowing Boat', raft: 'River Raft', gondola: 'Venetian Gondola', lifeboat: 'Lifeboat', speedboat: 'Speedboat' }[match], features: [...feats, 'a planked hull', 'a tapered bow'] };
            }
            if (sail) {
                const sails = P.explicit && ctx.explicitColors.length > 1 ? P.secondary : match === 'pirate ship' ? 'DARK_RED' : match === 'viking ship' || match === 'longship' ? 'RED' : 'WHITE';
                const mastsDflt = match === 'galleon' || match === 'frigate' || match === 'schooner' || match === 'pirate ship' ? 2 : 1;
                const masts = parseInt(ctx.declare({ id: 'masts', label: 'Masts', type: 'choice', choices: ['1', '2'], default: String(mastsDflt) }), 10) === 2 ? 2 : 1;
                const sternFlag = ctx.declare({ id: 'flag', label: 'Stern flag', type: 'bool', default: true });
                // Longships and rafts never had a cabin, so only ships that do get the dial.
                const cabinDflt = !['viking ship', 'longship', 'ark', 'catamaran'].includes(match);
                const cabin = cabinDflt ? ctx.declare({ id: 'cabin', label: 'Stern cabin', type: 'bool', default: true }) : false;
                const mx = Math.floor(W / 2);
                for (let m = 0; m < masts; m++) {
                    const mz = masts === 1 ? Math.floor(L / 2) - 1 : m === 0 ? Math.floor(L / 3) : Math.floor(2 * L / 3);
                    g.part('3062', P.wood, mx, mz, yD); g.part('3062', P.wood, mx, mz, yD + 3);
                    g.box(mx - 2, mx + 1, mz, mz, yD + 6, yD + 11, sails);
                    g.part('3062', P.wood, mx, mz, yD + 12); g.part('3062', P.wood, mx, mz, yD + 15);
                    g.part('4032', P.wood, mx - 1, mz - 1, yD + 18);
                    if (match === 'pirate ship') g.part('98138', 'WHITE', mx + 1, mz, yD + 12);
                }
                // The flag stands on the cabin roof; with the cabin removed it drops to the deck.
                if (sternFlag) H.flag(ctx, mx, 1, cabinDflt && cabin ? yD + 4 : yD, match === 'pirate ship' ? 'BLACK' : P.accent);
                if (cabin) { g.shell(0, W - 1, 0, 2, yD, yD + 2, hull); g.box(0, W - 1, 0, 2, yD + 3, yD + 3, deck, { noBrick: true }); H.window(ctx, 1, 0, yD, 'back', 'TRANS_ORANGE'); feats.push('a raised stern cabin'); }
                if (match === 'viking ship' || match === 'longship') { for (let z = 2; z < L - 3; z += 2) { g.part('98138', P.accent, 0, z, yD); g.part('98138', P.secondary, W - 1, z, yD); } g.part('59900', 'GOLD', 0, L - 2, 5); feats.push('a row of shields along the gunwales', 'a dragon-head prow'); }
                feats.push(`${masts} mast${masts > 1 ? 's' : ''} with ${window.LEGO_COLORS[sails].name.toLowerCase()} sails`, "a crow's nest");
                if (sternFlag) feats.push('a stern flag');
                return { title: { 'pirate ship': 'Pirate Ship', galleon: 'Galleon', frigate: 'Frigate', schooner: 'Schooner', sailboat: 'Sailboat', 'sailing ship': 'Tall Ship', yacht: 'Sailing Yacht', 'viking ship': 'Viking Longship', longship: 'Viking Longship', ark: 'Wooden Ark', catamaran: 'Catamaran' }[match], features: feats };
            }
            // Motor ships: a superstructure, bridge and funnel(s); warships get turrets.
            const war = ['battleship', 'destroyer', 'warship', 'aircraft carrier'].includes(match);
            const sz = Math.floor(L / 2) - 2;
            if (match === 'aircraft carrier') { g.box(-1, W, 0, L - 3, yD, yD, 'DARK_GREY', { noBrick: true }); g.box(W, W, 4, 7, yD + 1, yD + 6, 'LIGHT_GREY'); g.part('3957', 'LIGHT_GREY', W, 5, yD + 7); for (let z = 2; z < L - 4; z += 4) g.part('3023', 'YELLOW', 0, z, yD + 1, { rotY: 0 }); feats.push('a flat flight deck with markings', 'an island superstructure'); }
            else {
                g.shell(1, W - 2, sz, sz + 3, yD, yD + 2, war ? 'LIGHT_GREY' : 'WHITE'); H.window(ctx, 1, sz + 3, yD, 'front'); g.box(1, W - 2, sz, sz + 3, yD + 3, yD + 3, war ? 'DARK_GREY' : 'WHITE', { noBrick: true });
                g.box(1, W - 2, sz + 1, sz + 2, yD + 4, yD + 6, war ? 'LIGHT_GREY' : 'WHITE'); g.part('3022', P.dark, 1, sz + 1, yD + 7);
                if (!war) { g.part('3062', P.accent, 1, sz - 1, yD); g.part('3062', 'BLACK', 1, sz - 1, yD + 3); }
                if (match === 'cruise ship' || match === 'ferry') { for (let z = 1; z + 1 <= L - 4; z += 3) { H.window(ctx, 0, z, 2, 'left'); H.window(ctx, W - 1, z, 2, 'right'); } g.part('3062', P.accent, W - 2, sz - 1, yD); g.part('3062', 'BLACK', W - 2, sz - 1, yD + 3); feats.push('rows of cabin portholes', 'twin funnels'); }
                if (war) { for (const z of [2, L - 5]) { g.part('3941', 'DARK_GREY', 1, z, yD); g.part('3062', 'DARK_GREY', 1, z + 2, yD + 1, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); } g.part('3957', 'LIGHT_GREY', 2, sz + 2, yD + 8); feats.push('fore and aft gun turrets', 'a radar mast'); }
                if (match === 'cargo ship' || match === 'container ship' || match === 'barge') { for (let z = 1; z < sz - 1; z += 3) { g.box(1, W - 2, z, z + 1, yD, yD + 2, ctx.pick(['RED', 'BLUE', 'GREEN', 'ORANGE'])); } feats.push('a deck stacked with containers'); }
                if (match === 'tugboat' || match === 'tug' || match === 'fishing boat' || match === 'trawler') { for (let z = 1; z < L - 3; z += 3) { g.part('98138', 'BLACK', 0, z, 2); } g.part('3062', P.wood, W - 2, 2, yD); g.part('3710', P.wood, W - 2, 0, yD + 3, { rotY: 0 }); feats.push('tyre fenders along the hull', 'a boom crane'); }
                feats.push('a wheelhouse with a bridge', 'a funnel');
            }
            return { title: { ship: 'Cargo Ship', boat: 'Motor Launch', tugboat: 'Harbour Tug', tug: 'Harbour Tug', 'cruise ship': 'Cruise Liner', ferry: 'Ferry', steamboat: 'Paddle Steamer', steamship: 'Steamship', 'cargo ship': 'Cargo Ship', 'container ship': 'Container Ship', battleship: 'Battleship', destroyer: 'Destroyer', warship: 'Warship', 'aircraft carrier': 'Aircraft Carrier', 'fishing boat': 'Fishing Boat', trawler: 'Trawler', houseboat: 'Houseboat', barge: 'River Barge' }[match] || 'Ship', features: feats };
        }
    });

    /* ── spacecraft ───────────────────────────────────────────── */

    reg({
        kind: 'space', category: 'Space & Sci-Fi', icon: '🚀',
        keys: ['rocket', 'spaceship', 'starship', 'spacecraft', 'lander', 'lunar lander', 'moon lander', 'capsule', 'probe', 'satellite', 'space station', 'starfighter', 'x-wing', 'tie fighter', 'cruiser', 'freighter', 'ufo', 'flying saucer', 'saucer', 'speeder', 'hover', 'hoverbike', 'hovercraft', 'podracer', 'pod racer', 'moon rocket', 'saturn v', 'spacex', 'falcon', 'space ship', 'alien ship', 'mothership', 'dropship', 'gunship', 'mars rover', 'rover', 'lunar rover', 'moon buggy', 'space'],
        build(ctx) {
            const { g, P, sc, match, chance } = ctx;
            const feats = [];
            if (['rocket', 'moon rocket', 'saturn v', 'spacex', 'falcon'].includes(match)) {
                const stagesDflt = sc(5), white = P.explicit ? P.primary : 'WHITE';
                const stages = Math.max(3, Math.min(9, parseInt(ctx.declare({ id: 'stages', label: 'Stages', type: 'choice', choices: ['3', '4', '5', '6', '7', '8', '9'], default: String(stagesDflt) }), 10) || stagesDflt));
                const gantry = ctx.declare({ id: 'gantry', label: 'Gantry tower', type: 'bool', default: true });
                g.box(-4, 6, -4, 5, 0, 0, 'DARK_GREY', { noBrick: true });
                g.box(-2, 3, -2, 3, 1, 1, 'DARK_GREY', { noBrick: true }); g.box(-1, 2, -1, 2, 2, 2, 'LIGHT_GREY', { noBrick: true });
                for (const [x, z] of [[-1, -1], [2, -1], [-1, 2], [2, 2]]) g.part('59900', 'DARK_GREY', x, z, 3);
                for (let i = 0; i < stages; i++) g.part('3941', i === 1 || i === stages - 2 ? 'BLACK' : white, 0, 0, 3 + i * 3);
                const yTop = 3 + stages * 3;
                // The 2x2 cone has one centre stud, so the escape tower sits half a stud in from the corner cell it occupies.
                g.part('3942', white, 0, 0, yTop); g.part('3062', 'LIGHT_GREY', 0, 0, yTop + 6, { dx: 0.5, dz: 0.5 }); g.part('59900', P.accent, 0, 0, yTop + 9, { dx: 0.5, dz: 0.5 });
                for (const [x, z, r] of [[-1, 0, -PI / 2], [2, 1, PI / 2], [0, -1, PI], [1, 2, 0]]) g.part('54200', P.accent, x, z, 3, { rotY: r });
                // Gantry tower with service arms.
                if (gantry) {
                    for (let i = 0; i < stages + 1; i++) g.box(-4, -3, -1, 0, 1 + i * 3, 3 + i * 3, 'RED');
                    for (let i = 1; i < stages; i += 2) g.part('3623', 'RED', -3, 0, 3 + i * 3, { rotY: PI / 2, w: 3, l: 1 });
                    g.part('3022', 'DARK_GREY', -4, -1, 4 + stages * 3); g.part('98138', 'TRANS_RED', -4, -1, 5 + stages * 3);
                }
                g.part('3062', 'TRANS_ORANGE', 4, 3, 1); g.part('59900', 'TRANS_ORANGE', 4, 3, 4);
                const title = (match === 'saturn v' || match === 'moon rocket' ? 'Moon Rocket' : 'Launch Rocket') + (gantry ? ' & Gantry' : '');
                return { title, features: [`a ${stages}-stage round-brick booster`, 'four engine bells and fins', 'a command capsule and escape tower', ...(gantry ? ['a red gantry with service arms'] : []), 'a flame deflector pad'] };
            }
            if (['ufo', 'flying saucer', 'saucer', 'alien ship', 'mothership'].includes(match)) {
                const R = sc(4.5), hull = P.explicit ? P.primary : 'LIGHT_GREY';
                g.box(-R - 2, R + 3, -R - 2, R + 3, 0, 0, 'DARK_GREY', { noBrick: true });
                for (const [x, z] of [[-2, 0], [3, 0], [0, 3]]) { g.part('3062', 'TRANS_CLEAR', x, z, 1); g.part('3062', 'TRANS_CLEAR', x, z, 4); }
                H.discSlab(ctx, 0.5, 0.5, R, 7, hull); g.disc(0.5, 0.5, R - 0.5, 9, 9, hull); g.disc(0.5, 0.5, R - 1.5, 10, 10, hull);
                for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2, x = Math.round(0.5 + Math.cos(a) * (R - 1.4)), z = Math.round(0.5 + Math.sin(a) * (R - 1.4)); g.part('98138', i % 2 ? 'TRANS_ORANGE' : 'TRANS_RED', x, z, 10); }
                g.part('3941', 'TRANS_BLUE', 0, 0, 11); g.part('553', 'TRANS_BLUE', 0, 0, 14);
                g.part('3957', P.metal, 0, -1, 11);
                return { title: match === 'mothership' ? 'Alien Mothership' : 'Flying Saucer', features: ['a stacked saucer hull', 'a ring of blinking rim lights', 'a transparent cockpit dome', 'three landing legs'] };
            }
            if (match === 'space station' || match === 'satellite' || match === 'probe') {
                g.box(-7, 8, -4, 5, 0, 0, 'DARK_GREY', { noBrick: true });
                H.stand(ctx, 0, 0, 1, 2);
                g.part('3941', 'WHITE', 0, 0, 7); g.part('3941', 'LIGHT_GREY', 0, 0, 11); g.part('3941', 'WHITE', 0, 0, 14);
                g.part('3031', 'DARK_GREY', -1, -1, 17); g.part('3062', 'WHITE', 0, 0, 18); g.part('4032', 'LIGHT_GREY', 0, 0, 21); g.part('3957', P.metal, 2, 2, 18);
                // Solar wings on booms that pass through the hull between two of its segments.
                g.part('3710', 'LIGHT_GREY', -3, 0, 10, { rotY: PI / 2, w: 4, l: 1 }); g.part('3710', 'LIGHT_GREY', 1, 0, 10, { rotY: PI / 2, w: 4, l: 1 });
                g.part('3795', 'TRANS_BLUE', -7, -1, 11, { rotY: PI / 2, w: 6, l: 2 }); g.part('3795', 'TRANS_BLUE', 2, -1, 11, { rotY: PI / 2, w: 6, l: 2 });
                g.part('98138', 'TRANS_RED', -7, -1, 12); g.part('98138', 'TRANS_RED', 7, 0, 12);
                return { title: match === 'space station' ? 'Orbital Station' : match === 'probe' ? 'Deep Space Probe' : 'Satellite', features: ['a stacked core module', 'twin solar arrays on booms', 'a dish antenna', 'a transparent orbit stand'] };
            }
            if (['lander', 'lunar lander', 'moon lander', 'capsule'].includes(match)) {
                g.box(-4, 5, -4, 5, 0, 0, 'LIGHT_GREY', { noBrick: true });
                for (const [x, z] of [[-3, -3], [4, -3], [-3, 4], [4, 4]]) { g.part('4032', 'GOLD', x - (x < 0 ? 0 : 1), z - (z < 0 ? 0 : 1), 1); g.part('3062', 'GOLD', x, z, 2); g.part('3062', 'GOLD', x, z, 5); }
                g.part('3035', 'GOLD', -3, -3, 8, { w: 4, l: 8 }); g.part('3035', 'GOLD', 1, -3, 8, { w: 4, l: 8 }); g.box(-1, 2, -1, 2, 9, 11, 'GOLD');   // the descent-stage deck reaches every leg
                g.box(0, 1, 0, 1, 12, 17, 'LIGHT_GREY'); g.part('553', 'LIGHT_GREY', 0, 0, 18); g.part('3957', P.metal, 2, -1, 12); g.part('4032', 'LIGHT_GREY', -1, 1, 12);
                H.flag(ctx, 5, 0, 1, 'WHITE');
                return { title: 'Lunar Lander', features: ['four gold landing legs with footpads', 'a gold descent stage', 'a domed ascent module', 'a planted flag'] };
            }
            if (['speeder', 'hover', 'hoverbike', 'hovercraft', 'podracer', 'pod racer'].includes(match)) {
                const L = sc(9), body = P.explicit ? P.primary : ctx.style === 'cyberpunk' ? 'BLACK' : P.primary;
                g.box(-4, 5, -2, L + 1, 0, 0, 'DARK_GREY', { noBrick: true });
                for (const z of [1, L - 3]) { H.stand(ctx, 0, z, 1, 1); H.stand(ctx, 1, z, 1, 1); }
                g.box(0, 1, 0, L - 1, 4, 4, 'BLACK', { noBrick: true });
                g.box(0, 1, 0, L - 1, 5, 7, body);
                g.part('3039', body, 0, L - 2, 8, { rotY: 0 }); g.part('3040', P.glass, 0, L - 4, 8, { rotY: 0 }); g.part('3040', P.glass, 1, L - 4, 8, { rotY: 0 });
                g.box(0, 1, 1, L - 5, 8, 8, P.accent, { noBrick: true });
                // Repulsor pods either side, engines behind.
                for (const x of [-2, 2]) { g.part('3023', body, x, 2, 5, { rotY: 0 }); g.part('3062', 'TRANS_BLUE', x, 2, 6, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); }
                g.part('3062', 'TRANS_ORANGE', 0, -1, 5, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); g.part('3062', 'TRANS_ORANGE', 1, -1, 5, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true });
                g.part('98138', 'TRANS_BLUE', 0, 0, 8); g.part('98138', 'TRANS_BLUE', 1, 0, 8); g.part('3070', P.accent, 0, L - 5, 9);
                return { title: match === 'hoverbike' ? 'Hover Bike' : match === 'podracer' || match === 'pod racer' ? 'Pod Racer' : 'Grav Speeder', features: ['a low wedge body', 'twin glowing repulsor pods', 'afterburner engines', 'a neon trim line', 'hovering on clear stands'] };
            }
            if (['mars rover', 'rover', 'lunar rover', 'moon buggy'].includes(match)) {
                g.box(-3, 6, -2, 8, 0, 0, 'TAN', { noBrick: true });
                for (const z of [0, 3, 6]) { g.part('4032', 'BLACK', -1, z, 1, { rotZ: PI / 2, w: 1, l: 2, hp: 5, lie: true }); g.part('4032', 'BLACK', 4, z, 1, { rotZ: PI / 2, w: 1, l: 2, hp: 5, lie: true }); }
                g.box(0, 3, 0, 7, 3, 3, 'LIGHT_GREY', { noBrick: true }); g.box(1, 2, 1, 6, 4, 6, 'WHITE');
                g.part('3795', 'TRANS_BLUE', 0, 1, 7, { rotY: 0, l: 6, w: 2 }); g.part('3795', 'TRANS_BLUE', 2, 1, 7, { rotY: 0, l: 6, w: 2 });
                g.part('3062', 'LIGHT_GREY', 1, 6, 8); g.part('3062', 'LIGHT_GREY', 1, 6, 11); g.part('4032', 'WHITE', 1, 6, 14); g.part('98138', 'TRANS_BLUE', 2, 6, 15); g.part('3957', P.metal, 2, 1, 8);
                return { title: 'Planetary Rover', features: ['six off-road wheels', 'a solar panel deck', 'a mast camera and antenna'] };
            }
            // Starfighters, cruisers, freighters.
            const L = sc(10), body = P.explicit ? P.primary : match === 'tie fighter' ? 'DARK_GREY' : 'LIGHT_GREY';
            g.box(-6, 7, -3, L + 2, 0, 0, 'DARK_GREY', { noBrick: true });
            H.stand(ctx, 0, 3, 1, 2); H.stand(ctx, 1, 3, 1, 2);
            g.box(0, 1, 0, L - 1, 7, 9, body);
            g.box(0, 1, 0, L - 1, 10, 10, body, { noBrick: true });
            if (match === 'tie fighter') {
                for (const x of [-3, 2]) { g.part('3795', 'BLACK', x, 1, 7, { rotY: 0, w: 2, l: 6 }); g.box(x, x + 1, 1, 6, 8, 11, 'BLACK'); }
                H.slab(ctx, 0, 1, 0, L - 1, 10, body);   // a locked spine over the hull bricks
                g.part('3020', body, -2, 1, 12, { rotY: PI / 2, w: 4, l: 2 }); g.part('3020', body, 0, 5, 12, { rotY: PI / 2, w: 4, l: 2 });   // wing spars from the spine onto each panel
                g.part('3022', body, 0, 3, 12); g.part('3941', body, 0, 3, 13); g.part('98138', 'TRANS_BLUE', 0, 3, 16);
                feats.push('two black solar wing panels', 'a round cockpit pod');
            } else {
                for (let i = 0; i < 3; i++) { g.part('3020', body, -4 + i, 2 + i, 10 - (i % 2), { rotY: PI / 2, w: 4, l: 2 }); g.part('3020', body, 1 + i, 2 + i, 10 - (i % 2), { rotY: PI / 2, w: 4, l: 2 }); }
                g.part('3062', P.metal, -4, 2, 11, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); g.part('3062', P.metal, 4, 2, 11, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true });
                g.box(0, 1, 1, L - 5, 11, 13, body); g.part('3040', P.glass, 0, L - 4, 11, { rotY: 0 }); g.part('3040', P.glass, 1, L - 4, 11, { rotY: 0 }); g.part('3039', body, 0, L - 2, 11, { rotY: 0 });
                g.box(0, 1, 1, L - 5, 14, 14, P.accent, { noBrick: true });
                g.part('3020', body, 0, -1, 7, { rotY: 0, w: 2, l: 4 });   // the engine mount plate runs into the hull
                g.part('3062', 'TRANS_BLUE', 0, -1, 8, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); g.part('3062', 'TRANS_BLUE', 1, -1, 8, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true });
                g.part('98138', 'TRANS_RED', 0, 0, 11); g.part('3957', P.metal, 1, 1, 15);
                feats.push('stepped swept wings with wingtip cannons', 'a glass cockpit canopy', 'twin ion engines', 'an accent stripe');
            }
            feats.push('a transparent flight stand');
            return { title: { starfighter: 'Starfighter', 'x-wing': 'Starfighter', 'tie fighter': 'Twin Ion Fighter', cruiser: 'Star Cruiser', freighter: 'Light Freighter', spaceship: 'Starship', starship: 'Starship', spacecraft: 'Spacecraft', 'space ship': 'Starship', dropship: 'Dropship', gunship: 'Gunship', space: 'Starship' }[match] || 'Starship', features: feats };
        }
    });

    /* ── mechs ────────────────────────────────────────────────── */

    reg({
        kind: 'mech', category: 'Space & Sci-Fi', icon: '🤖',
        keys: ['robot', 'mech', 'mecha', 'droid', 'android', 'bot', 'walker', 'golem', 'cyborg', 'gundam', 'exosuit', 'automaton', 'battle mech', 'iron giant', 'transformer', 'power loader'],
        build(ctx) {
            const { g, P, sc, chance, match, declare } = ctx;
            const big = ctx.S > 1.2 || match === 'iron giant' || match === 'gundam' || match === 'battle mech';
            // Dial: 'auto' keeps the seed's own claw-or-cannon toss per arm.
            const armsMode = declare({ id: 'arms', label: 'Arms', type: 'choice', choices: ['auto', 'claws', 'cannons'], default: 'auto' });
            const T = big ? 6 : 4;   // torso width
            const legX = big ? [0, T - 2] : [0, T - 2];
            g.box(-4, T + 3, -3, 5, 0, 0, 'DARK_GREY', { noBrick: true });
            // Feet, legs with piston detail, hips.
            for (const x of legX) { g.part('3021', P.dark, x, -1, 1, { rotY: 0, w: 2, l: 3 }); g.box(x, x + 1, 0, 1, 2, 7, P.secondary); g.part('3062', P.metal, x - 1, 0, 2); g.part('3062', P.metal, x + 2, 0, 2); g.part('3062', P.metal, x - 1, 0, 5); g.part('3062', P.metal, x + 2, 0, 5); }
            g.box(0, T - 1, 0, 1, 8, 8, P.dark, { noBrick: true });
            // Torso with a chest plate, head with visor, shoulders.
            g.box(0, T - 1, 0, 1, 9, 14, P.primary);
            g.part(T === 4 ? '3022' : '3020', P.primary, 1, 1, 10, { rotY: T === 4 ? 0 : PI / 2, w: T - 2, l: 2 });   // a plate through the torso carries the chest plate
            g.box(1, T - 2, 2, 2, 11, 13, P.accent);
            g.part('98138', 'TRANS_ORANGE', 1, 2, 14); g.part('98138', 'TRANS_ORANGE', T - 2, 2, 14);
            g.box(0, T - 1, 0, 1, 15, 15, P.dark, { noBrick: true });
            const hx = Math.floor(T / 2) - 1;
            g.box(hx, hx + 1, 0, 1, 16, 18, P.primary); H.window(ctx, hx, 1, 16, 'front', 'TRANS_BLUE'); g.part('3068', P.dark, hx, 0, 19); g.part('3957', P.metal, hx + 1, 0, 20);
            // Arms: round-brick columns hanging from the shoulder plates, with claw or cannon hands.
            for (const side of [-1, 1]) {
                const ax = side < 0 ? -2 : T + 1;
                g.part('3021', P.dark, side < 0 ? -2 : T - 1, 0, 15, { rotY: PI / 2, w: 3, l: 2 });   // the shoulder plate reaches one stud onto the torso
                g.box(side < 0 ? -2 : T, side < 0 ? -1 : T + 1, 0, 1, 16, 18, P.secondary);
                g.part('3062', P.metal, ax, 0, 12); g.part('3062', P.metal, ax, 0, 9); g.part('3062', P.metal, ax, 0, 6, { hp: 3 });
                const cannon = armsMode === 'auto' ? (chance(0.5) || match === 'battle mech') : armsMode === 'cannons';
                if (cannon) { g.part('3062', P.dark, ax, 0, 3, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); }   // a forearm cannon hangs under the arm
                else { g.part('3023', P.metal, ax, 0, 5, { rotY: 0 }); g.part('54200', P.dark, ax, 1, 6, { rotY: 0 }); }   // a wrist plate carries the claw
            }
            const guns = declare({ id: 'guns', label: 'Shoulder guns', type: 'bool', default: big || chance(0.5) });
            if (guns) { g.part('3062', P.dark, -1, 1, 19, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); g.part('3062', P.dark, T, 1, 19, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); }
            return { title: { robot: 'Robot', droid: 'Service Droid', android: 'Android', golem: 'Stone Golem', gundam: 'Battle Mech', 'battle mech': 'Battle Mech', walker: 'Assault Walker', exosuit: 'Exosuit', 'iron giant': 'Iron Giant', cyborg: 'Cyborg', automaton: 'Clockwork Automaton', 'power loader': 'Power Loader', transformer: 'Transforming Robot', bot: 'Bot' }[match] || 'Mech Walker', features: ['hydraulic legs on wide footpads', 'an armoured torso with a glowing chest plate', 'a visored head and antenna', armsMode === 'claws' ? 'piston arms with claws' : armsMode === 'cannons' ? 'piston arms with cannons' : 'piston arms with claws or cannons', guns ? 'shoulder-mounted guns' : 'a dark hip joint'] };
        }
    });
})();
