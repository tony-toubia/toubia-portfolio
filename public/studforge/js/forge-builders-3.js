// StudForge builders, part 3: scene layout helpers (two ideas on one plate),
// minifig-scale buildings, and the train, race track, market stall, farm,
// castle siege, solar system and dinosaur skeleton families.
//
// Same idiom as parts 1 and 2: a builder paints ctx.g (a ForgeGrid) using the
// palette roles in ctx.P and ctx.sc(n) for scale, declares its options with
// ctx.declare, and returns { title, features }. Conventions: x runs
// left/right, z runs back(-)/front(+), y counts plates (3 per brick).
window.FORGE = window.FORGE || { builders: [], helpers: {} };

(() => {
    const H = window.FORGE.helpers;
    const PI = Math.PI;
    const PLATE = window.FORGE_PLATE || 0.4;
    const reg = (b) => window.FORGE.builders.push(b);
    const key = (x, y, z) => `${x},${y},${z}`;
    const unkey = (k) => k.split(',').map(Number);

    /* ── scene layout: one plate, several ideas ───────────────── */

    /** Copy every cell and explicit part of `src` into `dst`, shifted by (dx, dy, dz) studs/plates. */
    H.transplant = (dst, src, dx, dy, dz) => {
        for (const c of src.cells.values()) dst.set(c.x + dx, c.y + dy, c.z + dz, c.color, { noBrick: c.noBrick });
        for (const k of src.res) { const [x, y, z] = unkey(k); const kk = key(x + dx, y + dy, z + dz); dst.cells.delete(kk); dst.res.add(kk); }
        // Links (a wheel's axle pin, a clip's bar, a hinge top's base) name cells of other parts, so they move too.
        for (const p of src.parts) dst.parts.push({ ...p, x: p.x + dx, y: p.y + dy * PLATE, z: p.z + dz, layer: p.layer + dy, links: p.links && p.links.map(([x, y, z]) => [x + dx, y + dy, z + dz]), fp: { ...p.fp, x0: p.fp.x0 + dx, z0: p.fp.z0 + dz, y0: p.fp.y0 + dy } });
    };

    /** The colour of a grid's base plate (its corner cell), or `fallback`. */
    const baseColor = (g, b, fallback) => { const c = g.get(b.x0 + 1, b.y0, b.z0 + 1) || g.get(b.x0, b.y0, b.z0); return c ? c.color : fallback; };

    /**
     * A new grid with `a` and then `b` laid side by side along `axis` ('x' or
     * 'z'), centred on the other axis, `gap` studs apart; the gap in the base
     * is filled so both stand on one plate.
     */
    H.sideBySide = (a, b, axis, gap, ground) => {
        const A = a.bounds(), B = b.bounds(), g = new window.ForgeGrid();
        let dx, dz;
        if (axis === 'x') { dx = A.x1 - B.x0 + 1 + gap; dz = Math.round((A.z0 + A.z1 - B.z0 - B.z1) / 2); }
        else { dz = A.z1 - B.z0 + 1 + gap; dx = Math.round((A.x0 + A.x1 - B.x0 - B.x1) / 2); }
        H.transplant(g, a, 0, 0, 0);
        H.transplant(g, b, dx, A.y0 - B.y0, dz);
        const U = g.bounds();
        g.fillEmpty(U.x0, U.x1, U.z0, U.z1, U.y0, U.y0, baseColor(a, A, ground), { noBrick: true });
        return g;
    };

    /**
     * A new grid with `top` resting on `bottom` ("cat on a sofa"). The top
     * model loses its own base plate and any loose props, keeping its main
     * connected mass; that mass is placed where it needs the least packing
     * underneath, and the columns under its feet are built up in the colour
     * of whatever they stand on. Returns null when nothing is left to stack.
     */
    H.stackOn = (top, bottom) => {
        const T = top.bounds();
        // Voxels of the top model above its base layer, each tagged with its owner (a cell key, or a part index).
        const vox = new Map();
        for (const c of top.cells.values()) if (c.y > T.y0) vox.set(key(c.x, c.y, c.z), { owner: 'c' + key(c.x, c.y, c.z) });
        top.parts.forEach((p, i) => {
            if (p.fp.y0 <= T.y0) return;
            for (let y = p.fp.y0; y < p.fp.y0 + p.fp.hp; y++) for (let x = p.fp.x0; x < p.fp.x0 + p.fp.w; x++) for (let z = p.fp.z0; z < p.fp.z0 + p.fp.l; z++) vox.set(key(x, y, z), { owner: 'p' + i });
        });
        if (!vox.size) return null;
        // Union-find over voxels: a part is one blob, and face-adjacent voxels join.
        const parent = new Map();
        const find = (k) => { let r = k; while (parent.get(r) !== r) r = parent.get(r); let c = k; while (parent.get(c) !== r) { const n = parent.get(c); parent.set(c, r); c = n; } return r; };
        const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
        for (const k of vox.keys()) parent.set(k, k);
        const byOwner = new Map();
        for (const [k, v] of vox) { if (byOwner.has(v.owner)) union(k, byOwner.get(v.owner)); else byOwner.set(v.owner, k); }
        for (const k of vox.keys()) { const [x, y, z] = unkey(k); for (const n of [key(x + 1, y, z), key(x, y + 1, z), key(x, y, z + 1)]) if (vox.has(n)) union(k, n); }
        const size = new Map();
        for (const k of vox.keys()) { const r = find(k); size.set(r, (size.get(r) || 0) + 1); }
        let main = null, best = 0;
        for (const [r, n] of size) if (n > best) { best = n; main = r; }
        const keep = new Set([...vox.keys()].filter((k) => find(k) === main));
        // The kept mass as its own grid; its lowest level is what stands on the bottom model.
        const t = new window.ForgeGrid();
        for (const c of top.cells.values()) if (keep.has(key(c.x, c.y, c.z))) t.set(c.x, c.y, c.z, c.color, { noBrick: c.noBrick });
        top.parts.forEach((p, i) => { if (byOwner.has('p' + i) && keep.has(byOwner.get('p' + i))) { t.parts.push({ ...p, fp: { ...p.fp } }); for (let y = p.fp.y0; y < p.fp.y0 + p.fp.hp; y++) for (let x = p.fp.x0; x < p.fp.x0 + p.fp.w; x++) for (let z = p.fp.z0; z < p.fp.z0 + p.fp.l; z++) t.res.add(key(x, y, z)); } });
        const K = t.bounds();
        const lowest = new Map();   // column -> lowest kept plate in it
        for (const k of keep) { const [x, y, z] = unkey(k); const c = `${x},${z}`; if (!lowest.has(c) || y < lowest.get(c)) lowest.set(c, y); }
        const feet = [...lowest].filter(([, y]) => y === K.y0).map(([c]) => c.split(',').map(Number));
        if (!feet.length) return null;
        // The bottom model's skyline: highest voxel and its colour per column.
        const B = bottom.bounds(), sky = new Map();
        const raise = (x, z, y, color) => { const c = `${x},${z}`; const s = sky.get(c); if (!s || y > s.y) sky.set(c, { y, color }); };
        for (const c of bottom.cells.values()) raise(c.x, c.z, c.y, c.color);
        for (const p of bottom.parts) for (let x = p.fp.x0; x < p.fp.x0 + p.fp.w; x++) for (let z = p.fp.z0; z < p.fp.z0 + p.fp.l; z++) raise(x, z, p.fp.y0 + p.fp.hp - 1, p.color);
        const floor = baseColor(bottom, B, 'DARK_GREY');
        const skyAt = (x, z) => sky.get(`${x},${z}`) || { y: B.y0 - 1, color: floor };
        // Try placements around the bottom model's centre; pick the one that needs the least building up under the feet.
        const cx = Math.round((B.x0 + B.x1 - K.x0 - K.x1) / 2), cz = Math.round((B.z0 + B.z1 - K.z0 - K.z1) / 2);
        let pick = null;
        for (let ox = -3; ox <= 3; ox++) for (let oz = -3; oz <= 3; oz++) {
            const dx = cx + ox, dz = cz + oz;
            let dy = -Infinity;
            for (const [c, y] of lowest) { const [x, z] = c.split(',').map(Number); dy = Math.max(dy, skyAt(x + dx, z + dz).y + 1 - y); }
            let cost = 0;
            for (const [x, z] of feet) { const s = skyAt(x + dx, z + dz); cost += (K.y0 + dy - 1 - s.y) + (s.y < B.y0 ? 40 : 0); }
            cost += Math.abs(ox) + Math.abs(oz);   // all else equal, stay centred
            if (!pick || cost < pick.cost) pick = { dx, dz, dy, cost };
        }
        const g = new window.ForgeGrid();
        H.transplant(g, bottom, 0, 0, 0);
        H.transplant(g, t, pick.dx, pick.dy, pick.dz);
        // Build up under each foot: in the bottom model's colour where it stands on the model, and in the
        // top model's own colour where it only reaches the base plate (a pedestal rather than a lump of ground).
        for (const [x, z] of feet) {
            const s = skyAt(x + pick.dx, z + pick.dz), own = t.get(x, K.y0, z);
            const color = s.y > B.y0 || !own ? s.color : own.color;
            for (let y = Math.max(B.y0, s.y + 1); y < K.y0 + pick.dy; y++) g.set(x + pick.dx, y, z + pick.dz, color);
        }
        return g;
    };

    /* ── shared sub-assemblies ────────────────────────────────── */

    /**
     * A minifig-height door: a 1x4x6 door frame (60596) with its door (60623), four studs wide and 18 plates tall,
     * set into a wall the caller has painted. `face` 'front' runs it along X from x at row z; 'left'/'right' along Z
     * from z at column x. The frame takes the trim colour, the door `color`.
     */
    H.minifigDoor = (ctx, x, z, y, face, color) => {
        const { P } = ctx, frame = P.trim === color ? 'WHITE' : P.trim;
        const o = { face: face === 'back' ? 'back' : face === 'left' || face === 'right' ? face : 'front', frameColor: frame, doorColor: color };
        if (o.face === 'front') H.realDoor(ctx, x, z, y, o);
        else if (o.face === 'back') H.realDoor(ctx, x + 3, z, y, o);
        else if (o.face === 'left') H.realDoor(ctx, x, z, y, o);
        else H.realDoor(ctx, x, z + 3, y, o);
    };

    /** A real window two studs wide: 1x2x2 (six plates) or, for `bricks` 3, 1x2x3, with its glass pane, set into the wall. */
    H.minifigWindow = (ctx, x, z, y, face, bricks = 2) => {
        const { P } = ctx;
        const o = { size: bricks >= 3 ? '1x2x3' : '1x2x2', face, frameColor: P.trim, glassColor: P.glass };
        // The module's origin is the first cell along its own u axis, which runs -X on the back face and -Z on the right.
        if (face === 'back') H.realWindow(ctx, x + 1, z, y, o);
        else if (face === 'right') H.realWindow(ctx, x, z + 1, y, o);
        else H.realWindow(ctx, x, z, y, o);
    };
    /** A 1x4x3 shop window with its pane; `face` as above, the frame's first cell at (x, z). */
    H.shopWindow = (ctx, x, z, y, face) => {
        const { P } = ctx, o = { size: '1x4x3', face, frameColor: P.trim, glassColor: P.glass };
        if (face === 'back') H.realWindow(ctx, x + 3, z, y, o);
        else if (face === 'right') H.realWindow(ctx, x, z + 3, y, o);
        else H.realWindow(ctx, x, z, y, o);
    };

    /** A small truck or car, four studs wide and `L` long along Z, nose at +Z, on a real axle-plate chassis with wheels and tyres. */
    H.miniTruck = (ctx, x0, z0, y, L, color, o = {}) => {
        const { g, P } = ctx;
        const c = H.chassis(ctx, x0, z0, 4, L, y, { axles: [1, L - 3], size: 'small', color: 'BLACK' });
        const t = c.top;   // the first plate above the chassis
        g.box(x0, x0 + 3, z0, z0 + L - 1, t, t + 2, color);
        g.set(x0, t, z0 + L - 1, 'TRANS_CLEAR'); g.set(x0 + 3, t, z0 + L - 1, 'TRANS_CLEAR');
        // Cab at the nose with a glass windscreen, then whatever rides behind it.
        g.box(x0, x0 + 3, z0 + L - 4, z0 + L - 3, t + 3, t + 5, color);
        g.part('3039', P.glass, x0, z0 + L - 2, t + 3, { rotY: 0 }); g.part('3039', P.glass, x0 + 2, z0 + L - 2, t + 3, { rotY: 0 });
        g.box(x0, x0 + 3, z0 + L - 4, z0 + L - 3, t + 6, t + 6, color, { noBrick: true });
        if (o.box) {
            g.shell(x0, x0 + 3, z0, z0 + L - 5, t + 3, t + 8, o.box);
            H.ceiling(ctx, x0, x0 + 3, z0, z0 + L - 5, t + 9, 'LIGHT_GREY');
            if (o.ladder && L - 4 >= 6) g.part('3666', 'LIGHT_GREY', x0 + 1, z0, t + 10, { rotY: 0 });
            if (o.beacon) g.part('98138', o.beacon, x0 + 1, z0 + L - 4, t + 7);
        }
        return { top: t, chassis: c };
    };

    /** A fence of 1x4x2 panels (3185) on plate posts from (x0, z0) to (x1, z1) along one axis, standing on plate y. */
    H.fenceLine = (ctx, x0, z0, x1, z1, y, color) => {
        const alongX = z0 === z1;
        return H.fence(ctx, x0, z0, alongX ? x1 - x0 + 1 : z1 - z0 + 1, alongX ? 'x' : 'z', y, color || 'WHITE');
    };

    /** A blocky farm animal at stud (x, z) facing +Z, standing on plate y. */
    H.farmAnimal = (ctx, kind, x, z, y) => {
        const { g, chance } = ctx;
        if (kind === 'chicken') { g.part('3062', 'WHITE', x, z, y); g.part('54200', 'RED', x, z, y + 3, { rotY: PI }); return; }
        if (kind === 'pig') {
            g.box(x, x + 1, z, z + 2, y, y + 2, 'PINK'); g.box(x, x + 1, z + 3, z + 3, y, y + 2, 'PINK');   // the snout reaches the ground like the body
            g.part('98138', 'BLACK', x, z + 3, y + 3); g.part('98138', 'BLACK', x + 1, z + 3, y + 3); g.part('98138', 'PINK', x, z, y + 3);
            return;
        }
        if (kind === 'sheep') {
            for (const [lx, lz] of [[x, z], [x + 1, z], [x, z + 2], [x + 1, z + 2]]) g.part('4073', 'BLACK', lx, lz, y);
            g.box(x, x + 1, z, z + 2, y + 1, y + 4, 'WHITE'); g.part('3023', 'WHITE', x, z + 2, y + 2, { rotY: 0 }); g.part('3023', 'WHITE', x + 1, z + 2, y + 2, { rotY: 0 }); g.box(x, x + 1, z + 3, z + 3, y + 3, y + 4, 'BLACK');   // neck plates carry the head
            g.part('98138', 'WHITE', x, z + 3, y + 5); g.part('98138', 'WHITE', x + 1, z + 3, y + 5);
            return;
        }
        // Cow or horse: round-brick legs, a brick body, a head block on the front with eyes and ears.
        const col = kind === 'horse' ? 'BROWN' : 'WHITE';
        for (const [lx, lz] of [[x, z], [x + 1, z], [x, z + 3], [x + 1, z + 3]]) g.part('3062', col, lx, lz, y);
        g.box(x, x + 1, z, z + 3, y + 3, y + 6, col);
        if (kind === 'cow') for (const [sx, sz] of [[x, z + 1], [x + 1, z + 2], [x, z + 3]]) if (chance(0.7)) g.set(sx, y + 6, sz, 'BLACK');
        const hy = kind === 'horse' ? y + 10 : y + 7;
        if (kind === 'horse') { g.box(x, x + 1, z + 3, z + 3, y + 7, y + 9, col); g.part('54200', 'BLACK', x, z + 2, y + 7, { rotY: PI }); }
        g.part('3022', kind === 'cow' ? 'PINK' : col, x, z + 3, hy); g.box(x, x + 1, z + 3, z + 4, hy + 1, hy + 2, col);   // a head plate locked onto the body
        g.part('98138', 'BLACK', x, z + 4, hy + 3); g.part('98138', 'BLACK', x + 1, z + 4, hy + 3);
        g.part(kind === 'cow' ? '59900' : '54200', kind === 'cow' ? 'TAN' : col, x, z + 3, hy + 3, { rotY: PI }); g.part(kind === 'cow' ? '59900' : '54200', kind === 'cow' ? 'TAN' : col, x + 1, z + 3, hy + 3, { rotY: PI });
        g.part('3023', col, x, z - 1, y + 7, { rotY: 0 }); g.part('3062', col, x, z - 1, y + 4);   // the tail hangs off the rump
    };

    /* ── minifig-scale buildings ──────────────────────────────── */

    reg({
        kind: 'minifig-building', category: 'Architecture', icon: '🏬', minifig: true,
        keys: ['minifig house', 'minifig home', 'minifig cottage', 'minifig shop', 'minifig store', 'minifig cafe', 'minifig coffee shop', 'minifig bakery', 'minifig fire station', 'fire station', 'firehouse', 'minifig police station', 'police station', 'minifig building', 'minifig garage', 'minifig pizzeria', 'pizzeria', 'minifig diner', 'minifig pub', 'minifig school', 'minifig hotel', 'minifig restaurant'],
        build(ctx) {
            const { g, P, chance, pick } = ctx;
            const type = ctx.match.replace(/^minifig /, '');
            const house = ['house', 'home', 'cottage', 'building'].includes(type);
            const station = ['fire station', 'firehouse', 'garage'].includes(type);
            const police = type === 'police station';
            const feats = [];
            const W = (station ? 14 : 12) + (ctx.S > 1.4 ? 2 : 0), D = station ? 12 : 10;
            const upper = ctx.declare({ id: 'upper', label: 'Upper floor', type: 'bool', default: !['garage', 'cottage'].includes(type) });
            const awningOn = !house && !station && ctx.declare({ id: 'awning', label: 'Awning', type: 'bool', default: true });
            const wall = P.explicit ? P.primary : station && type !== 'garage' ? 'RED' : police ? 'WHITE' : house ? 'TAN' : pick(['WHITE', 'TAN', 'DARK_RED', 'BLUE']);
            const floorCol = house ? 'BROWN' : 'LIGHT_GREY';
            const FH = house ? 18 : 21;   // plates per floor: six bricks (the door frame's height), seven for a tall shopfront
            // Ground, pavement in front, the interior floor.
            g.box(-3, W + 2, -3, D + 2, 0, 0, P.ground, { noBrick: true });
            g.box(-3, W + 2, D, D + 2, 0, 0, 'LIGHT_GREY', { noBrick: true });
            g.box(1, W - 2, 1, D - 2, 1, 1, floorCol, { noBrick: true });
            g.shell(0, W - 1, 0, D - 1, 1, FH, wall);
            if (!house) g.box(0, W - 1, 0, D - 1, 1, 1, P.dark, { noBrick: true });   // stone footing
            const doorX = station ? 1 : Math.floor(W / 2) - 2;   // the four-stud door frame starts here
            const doorColor = police ? 'DARK_BLUE' : P.wood === wall ? P.accent : P.wood;
            if (station) {
                // An engine bay under a 1x8x2 arch with the engine rolling out of it, a side door and a hose tower.
                const gx = W - 9;
                H.archDoor(ctx, gx, D - 1, 1, { width: 8, height: 15, color: P.dark, face: 'front' });
                H.miniTruck(ctx, gx + 2, D - 7, 1, 10, type === 'garage' ? (P.explicit ? P.secondary : 'BLUE') : 'RED', type === 'garage' ? {} : { box: 'RED', ladder: true, beacon: 'TRANS_BLUE' });
                H.minifigDoor(ctx, doorX, D - 1, 1, 'front', doorColor);
                feats.push(type === 'garage' ? 'an arched roller-door bay with a car rolling out' : 'an arched engine bay with a fire engine rolling out', 'a side door in its frame');
            } else {
                H.minifigDoor(ctx, doorX, D - 1, 1, 'front', doorColor);
                g.part('3069', P.trim, doorX + 1, D, 1, { rotY: PI / 2, w: 2, l: 1 });   // doorstep
                feats.push('a 1x4x6 door in its frame that a minifigure walks through');
            }
            if (house) {
                // 1x2x2 windows either side of the door and along the sides, a house number on a bracket by the door.
                for (const x of [1, W - 3]) if (x + 1 < doorX || x > doorX + 3) H.minifigWindow(ctx, x, D - 1, 7, 'front');
                for (const z of [2, D - 4]) { H.minifigWindow(ctx, 0, z, 7, 'left'); H.minifigWindow(ctx, W - 1, z, 7, 'right'); }
                H.bracketMount(ctx, doorX + 4, D - 1, 14, { face: 'front', color: wall, part: '3069', partColor: P.trim });
                // Inside: a table with two chairs and a bed.
                g.part('3062', P.wood, 2, 2, 2); g.part('3068', 'TAN', 2, 2, 5, { w: 2, l: 2 });
                g.part('3005', P.wood, 4, 2, 2); g.part('3024', P.accent, 4, 2, 5); g.part('3005', P.wood, 2, 4, 2); g.part('3024', P.accent, 2, 4, 5);
                g.box(W - 4, W - 3, 1, 4, 2, 4, P.secondary === wall ? 'BLUE' : P.secondary); g.part('87079', 'WHITE', W - 4, 1, 5, { w: 2, l: 4 }); g.part('3069', P.accent, W - 4, 1, 6, { rotY: PI / 2, w: 2, l: 1 });
                feats.push('real windows with glass panes', 'a furnished ground floor');
            } else if (!station) {
                // A shopfront: 1x4x3 windows either side of the door (1x2x3 where the front is narrow), an awning and a
                // sign on a bracket over the door.
                for (const [x0, x1] of [[1, doorX - 1], [doorX + 4, W - 2]]) {
                    const n = x1 - x0 + 1;
                    if (n >= 4) H.shopWindow(ctx, x0 + Math.floor((n - 4) / 2), D - 1, 4, 'front');
                    else if (n >= 2) H.minifigWindow(ctx, x0 + Math.floor((n - 2) / 2), D - 1, 4, 'front', 3);
                }
                for (const z of [2, D - 4]) { H.minifigWindow(ctx, 0, z, 7, 'left', 3); H.minifigWindow(ctx, W - 1, z, 7, 'right', 3); }
                if (awningOn) { for (let x = 0; x + 1 <= W - 1; x += 2) g.part('3022', (x / 2) % 2 ? 'WHITE' : P.accent, x, D - 1, 19, { w: 2, l: 2 }); feats.push('a striped awning'); }
                g.box(1, W - 2, D - 1, D - 1, 20, 21, P.accent, { noBrick: true });   // the sign band
                H.bracketMount(ctx, doorX + 1, D - 1, 20, { face: 'front', color: P.accent, part: '3069', partColor: P.accent === 'WHITE' ? P.dark : 'WHITE', dir: 'up' });
                // Inside: a counter with a till, shelves of goods along the back wall, and two tables.
                g.box(2, W - 3, D - 4, D - 4, 2, 4, 'TAN'); g.box(2, W - 3, D - 4, D - 4, 5, 5, P.dark, { noBrick: true }); g.part('98138', 'LIGHT_GREY', W - 4, D - 4, 6);
                for (let x = 1; x <= W - 2; x += 2) { g.part('3005', P.wood, x, 1, 2); g.part('98138', pick(['RED', 'YELLOW', 'LIME', 'ORANGE', 'PINK']), x, 1, 5); }
                if (['cafe', 'coffee shop', 'restaurant', 'diner', 'pizzeria', 'pub'].includes(type)) { g.part('3062', P.wood, 3, 4, 2); g.part('3068', 'WHITE', 3, 4, 5, { w: 2, l: 2 }); g.part('98138', 'WHITE', 3, 4, 6); feats.push('a cafe table set for two'); }
                if (type === 'pizzeria' || type === 'bakery') { g.box(W - 4, W - 3, 1, 2, 2, 7, P.dark); g.part('3069', 'TRANS_ORANGE', W - 4, 1, 8, { rotY: PI / 2, w: 2, l: 1 }); feats.push('a stone oven'); }
                if (police) { H.lamp2(ctx, doorX - 2, D, 1, { color: P.dark, lens: 'TRANS_BLUE', face: 'front' }); feats.push('a blue lamp by the door'); }
                feats.push('a glazed shopfront with a bracket-mounted sign', 'a counter and shelves of goods');
            } else {
                for (const z of [2, D - 4]) { H.minifigWindow(ctx, 0, z, 7, 'left', 3); H.minifigWindow(ctx, W - 1, z, 7, 'right', 3); }
                g.box(1, W - 2, D - 1, D - 1, 20, 21, type === 'garage' ? P.accent : 'WHITE', { noBrick: true });
            }
            // Ceiling, then the upper floor or the roof.
            let top = FH + 1;
            H.ceiling(ctx, 0, W - 1, 0, D - 1, top, floorCol);
            if (upper) {
                const y0 = top + 1, UH = 18;
                if (house) {
                    // A balcony over the door: inverted slopes under a cross-bonded slab the upper wall stands on, with a railing.
                    H.overhang(ctx, doorX, D, y0 - 3, { width: 4, color: wall, face: 'front' });
                    H.slab(ctx, doorX, doorX + 3, D - 1, D + 1, y0, P.trim);
                    H.fence(ctx, doorX, D + 1, 4, 'x', y0 + 2, 'WHITE');
                    feats.push('a railed balcony on inverted slopes');
                }
                g.shell(0, W - 1, 0, D - 1, y0, y0 + UH - 1, wall);
                for (let x = 2; x + 1 <= W - 3; x += 4) { H.minifigWindow(ctx, x, D - 1, y0 + 6, 'front'); H.minifigWindow(ctx, x, 0, y0 + 6, 'back'); }
                for (const z of [2, D - 4]) { H.minifigWindow(ctx, 0, z, y0 + 6, 'left'); H.minifigWindow(ctx, W - 1, z, y0 + 6, 'right'); }
                top = y0 + UH;
                H.ceiling(ctx, 0, W - 1, 0, D - 1, top, floorCol);
                feats.push('an upper floor with real windows');
            }
            if (house) {
                g.box(-1, W, -1, D, top + 1, top + 1, P.roof, { noBrick: true });
                const r = H.gableRoof(ctx, -1, W, -1, D, top + 2, P.roof, 'x');
                const cz = Math.floor((r.a + r.b) / 2);
                g.box(W - 2, W - 2, cz, cz, r.y + 1, r.y + 6, P.dark); g.part('4073', P.metal, W - 2, cz, r.y + 7);
                feats.push(`a pitched ${window.LEGO_COLORS[P.roof].name.toLowerCase()} roof with a chimney`);
            } else {
                H.flatRoof(ctx, 0, W - 1, 0, D - 1, top + 1, P.dark);
                H.roundCorners(ctx, 0, W - 1, 0, D - 1, top + 2, P.dark);
                if (station) H.dish(ctx, W - 4, 1, top + 3, { size: 2, color: P.metal });
                feats.push(station ? 'a flat roof with a radio dish' : 'a flat roof with rounded corners and a rooftop hatch');
            }
            if (station && type !== 'garage') {
                // The hose tower at the back corner, with a bell and a flag on a bar pole.
                const tx = W, TH = 30;
                g.shell(tx, tx + 3, -3, 0, 1, TH, wall); H.ceiling(ctx, tx, tx + 3, -3, 0, TH + 1, P.dark);
                g.box(tx, tx + 3, -3, 0, TH + 2, TH + 2, P.dark, { noBrick: true });
                H.minifigWindow(ctx, tx + 1, 0, 13, 'front'); H.minifigWindow(ctx, tx + 1, 0, 22, 'front');
                g.part('59900', 'GOLD', tx + 1, -2, TH + 3); H.flagPole(ctx, tx + 2, -1, TH + 3, { height: 2, flag: P.accent });
                feats.push('a hose tower with a bell and a flag');
            }
            H.lamp2(ctx, W + 1, D + 1, 1, { color: P.dark, face: 'front' });
            if (chance(0.6)) H.tree(ctx, -2, -2, 1, 'round');
            const names = { house: 'Minifig House', home: 'Minifig Home', cottage: 'Minifig Cottage', building: 'Minifig Townhouse', shop: 'Minifig Shop', store: 'Corner Store', cafe: 'Minifig Café', 'coffee shop': 'Coffee Shop', bakery: 'Minifig Bakery', 'fire station': 'Fire Station', firehouse: 'Fire Station', 'police station': 'Police Station', garage: 'Minifig Garage', pizzeria: 'Pizzeria', diner: 'Minifig Diner', pub: 'Minifig Pub', school: 'Minifig School', hotel: 'Minifig Hotel', restaurant: 'Minifig Restaurant' };
            return { title: names[type] || 'Minifig Building', features: feats };
        }
    });

    /* ── train set ────────────────────────────────────────────── */

    reg({
        kind: 'trainset', category: 'Vehicles', icon: '🚂', priority: 1,
        keys: ['train', 'steam train', 'locomotive', 'steam engine', 'freight train', 'passenger train', 'train set', 'railway', 'railroad', 'choo choo', 'toy train', 'goods train', 'cargo train', 'express train', 'steam locomotive'],
        build(ctx) {
            const { g, P, sc, match, pick } = ctx;
            const n = Math.max(1, Math.min(3, parseInt(ctx.declare({ id: 'carriages', label: 'Carriages', type: 'choice', default: '2', choices: ['1', '2', '3'] }), 10) || 2));
            const freight = ['freight train', 'goods train', 'cargo train'].includes(match) || ctx.has('freight', 'goods', 'cargo');
            const LL = Math.max(10, sc(10)), CL = Math.max(7, sc(7)), T = LL + n * (CL + 1);
            const body = P.explicit ? P.primary : 'GREEN', trim = P.explicit && ctx.explicitColors.length > 1 ? P.secondary : 'RED';
            // Grass, a ballast strip, sleepers every other stud and two rails of tiles at gauge 6: the train wheels run on them.
            g.box(-4, 7, -3, T + 3, 0, 0, P.ground, { noBrick: true });
            g.box(-2, 5, -2, T + 2, 0, 0, 'TAN', { noBrick: true });
            for (let z = -1; z <= T + 1; z += 2) g.part('3666', 'BROWN', -1, z, 1, { rotY: PI / 2, w: 6, l: 1 });
            for (let z = -1; z <= T + 1;) { const l = Math.min(4, T + 2 - z); if (l < 2) break; const id = l >= 4 ? '2431' : '3069'; g.part(id, 'DARK_GREY', -1, z, 2, { rotY: 0, w: 1, l: l >= 4 ? 4 : 2 }); g.part(id, 'DARK_GREY', 4, z, 2, { rotY: 0, w: 1, l: l >= 4 ? 4 : 2 }); z += l >= 4 ? 4 : 2; }
            // Every vehicle: a 4-wide plate chassis on flanged train wheels (floor plate 3, on the rails), a locked slab, the body from B.
            const vehicle = (z0, len, axles, over) => { const ch = H.chassis(ctx, 0, z0, 4, len, 3, { axles, size: 'train', color: 'BLACK' }); H.slab(ctx, 0, 3, z0, z0 + len - 1 + (over || 0), ch.top, trim); return ch; };
            const B = 3 + H.axle.clearance('train') + 4;
            let wheels = 0;
            // The locomotive at the front: running board, boiler of lying round bricks laid from the smokebox back, cab, funnel, dome, cow-catcher.
            const z0 = T - LL, z1 = T - 1;
            wheels += vehicle(z0, LL, LL >= 11 ? [1, 4, LL - 3] : [1, LL - 3], 1).axles.length * 2;
            g.box(0, 3, z0 + 4, z1 - 1, B, B, 'BLACK', { noBrick: true });
            const segs = [];
            for (let z = z1 - 3; z >= z0 + 4; z -= 2) { g.part('3941', 'BLACK', 1, z, B + 1, { rotX: PI / 2, w: 2, l: 2, hp: 5, lie: true }); segs.push(z); }
            if ((z1 - 3 - (z0 + 4)) % 2 === 1) g.box(1, 2, z0 + 4, z0 + 4, B + 1, B + 3, 'BLACK');   // an odd gap by the cab
            g.part('3941', trim, 1, z1 - 1, B + 1, { rotX: PI / 2, w: 2, l: 2, hp: 5, lie: true });   // the smokebox door
            g.part('3062', 'BLACK', 1, segs[0], B + 6); g.part('59900', 'BLACK', 1, segs[0], B + 9);   // funnel
            if (segs.length > 1) { g.part('4032', 'GOLD', 1, segs[1], B + 6); g.part('553', body, 1, segs[1], B + 7); }   // steam dome
            g.part('98138', 'TRANS_ORANGE', 2, z1 - 1, B + 6);                                    // headlamp
            g.part('3040', 'DARK_GREY', 1, z1 + 1, B, { rotY: PI / 2, w: 2, l: 1 });               // cow-catcher on the slab's overhang
            g.shell(0, 3, z0, z0 + 3, B, B + 5, body);
            H.realWindow(ctx, 0, z0 + 1, B, { face: 'left', frameColor: 'BLACK', glassColor: P.glass }); H.realWindow(ctx, 3, z0 + 2, B, { face: 'right', frameColor: 'BLACK', glassColor: P.glass });
            g.box(0, 3, z0, z0 + 3, B + 6, B + 6, 'BLACK', { noBrick: true }); g.box(0, 3, z0, z0 + 3, B + 7, B + 7, trim, { noBrick: true });
            // Carriages behind, a one-stud gap and a plate coupling between each.
            const cargo = ['LIGHT_GREY', 'BROWN', 'TAN'];
            for (let i = 0; i < n; i++) {
                const c1 = z0 - 2 - i * (CL + 1), c0 = c1 - CL + 1;
                wheels += vehicle(c0, CL, [1, CL - 3]).axles.length * 2;
                g.part('3023', 'BLACK', 1, c1, B, { rotY: 0 });
                if (freight) {
                    if (i % 2 === 0) { g.shell(0, 3, c0, c1, B, B + 2, 'BROWN'); g.box(1, 2, c0 + 1, c1 - 1, B, B + 1, cargo[i % 3], { noBrick: true }); }
                    else { g.part('3022', 'DARK_GREY', 1, c0, B); g.part('3022', 'DARK_GREY', 1, c1 - 2, B); for (let z = c0 + 2; z + 1 <= c1 - 3; z += 2) g.part('3941', P.accent, 1, z, B, { rotX: PI / 2, w: 2, l: 2, hp: 5, lie: true }); }
                } else {
                    g.shell(0, 3, c0, c1, B, B + 5, body);
                    for (let z = c0 + 1; z + 1 <= c1 - 1; z += 3) { H.realWindow(ctx, 0, z, B, { face: 'left', frameColor: 'BLACK', glassColor: P.glass }); H.realWindow(ctx, 3, z + 1, B, { face: 'right', frameColor: 'BLACK', glassColor: P.glass }); }
                    H.ceiling(ctx, 0, 3, c0, c1, B + 6, 'DARK_GREY'); g.box(1, 2, c0 + 1, c1 - 1, B + 7, B + 7, 'DARK_GREY', { noBrick: true });
                }
            }
            // A signal at the lineside and a buffer stop at the end of the track.
            H.lamp2(ctx, 6, T - 2, 1, { height: 2, color: P.dark, lens: 'TRANS_RED', face: 'back' });
            g.part('3004', 'DARK_GREY', 1, -1, 2, { rotY: PI / 2, w: 2, l: 1 });
            return { title: freight ? 'Freight Train' : match === 'locomotive' || match === 'steam locomotive' || match === 'steam engine' ? 'Steam Locomotive' : 'Steam Train', features: ['a steam locomotive with a round boiler and funnel', `${['one', 'two', 'three'][n - 1]} ${freight ? 'freight wagons with loads' : 'passenger coaches with real windows'}`, `${wheels} flanged train wheels on axle plates`, 'a laid track of sleepers and rails', 'a lineside signal and a buffer stop'] };
        }
    });

    /* ── race track ───────────────────────────────────────────── */

    reg({
        kind: 'racetrack', category: 'Vehicles', icon: '🏁',
        keys: ['race track', 'racetrack', 'racing track', 'speedway', 'circuit', 'racing circuit', 'grand prix', 'f1 track', 'go-kart track', 'kart track', 'oval track', 'nascar', 'motor racing'],
        build(ctx) {
            const { g, P, sc, chance } = ctx;
            const W = sc(24), D = sc(16), r = 5, tw = 4;
            const grandstand = ctx.declare({ id: 'grandstand', label: 'Grandstand', type: 'bool', default: true });
            const cars = parseInt(ctx.declare({ id: 'cars', label: 'Cars', type: 'choice', default: '2', choices: ['1', '2', '3'] }), 10) || 2;
            // Grass, then an oval of tarmac: a rounded rectangle minus a smaller one.
            g.box(-2, W + 1, -2, D + (grandstand ? 6 : 1), 0, 0, P.ground, { noBrick: true });
            const inside = (x, z, x0, x1, z0, z1, rad) => {
                if (x < x0 || x > x1 || z < z0 || z > z1) return false;
                const cx = x < x0 + rad ? x0 + rad : x > x1 - rad ? x1 - rad : x, cz = z < z0 + rad ? z0 + rad : z > z1 - rad ? z1 - rad : z;
                return (x - cx) ** 2 + (z - cz) ** 2 <= rad * rad + 0.5;
            };
            for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) if (inside(x, z, 0, W - 1, 0, D - 1, r) && !inside(x, z, tw, W - 1 - tw, tw, D - 1 - tw, Math.max(1, r - tw))) g.set(x, 0, z, 'DARK_GREY', { noBrick: true });
            // Kerbs along the inside of the straights, a dashed centre line, a chequered start line.
            const tile = (x, z, col) => { if (g.top(x, z) === 0) g.part('3070', col, x, z, 1); };
            const sx = Math.floor(W / 2) + 2;
            /**
             * A little formula car six studs long along X, nose toward `dir`: two axle plates turned across the car
             * with small wheels and tyres pinned on, a 2x6 plate layer over them, a plate body, a cheese-slope nose,
             * a cockpit cowl with a helmet and a rear wing on two 1x1 plates.
             */
            const car = (x0, z, col, dir) => {
                const fx = (i, len = 1) => (dir > 0 ? x0 + i : x0 + 6 - i - len);   // the grid x of a piece `len` long starting `i` studs from the tail
                for (const i of [0, 4]) {
                    const ax = fx(i, 2);
                    g.part('4600', 'BLACK', ax, z, 3, { rotY: PI / 2 });
                    for (const [wz, pin] of [[z - 1, [ax, 3, z]], [z + 2, [ax + 1, 3, z + 1]]]) {
                        g.part('4624', 'LIGHT_GREY', ax, wz, 1, { rotY: PI / 2, w: 2, l: 1, hp: 5, dy: 1.25, links: [pin] });
                        g.part('3641', 'BLACK', ax, wz, 1, { rotY: PI / 2, w: 2, l: 1, hp: 5, links: [[ax, 3, wz]] });
                    }
                }
                g.part('3022', 'BLACK', fx(2, 2), z, 3);
                g.part('3795', col, x0, z, 4, { rotY: PI / 2, w: 6, l: 2 });
                g.part('3020', col, fx(1, 4), z, 5, { rotY: PI / 2, w: 4, l: 2 });
                const nr = dir > 0 ? -PI / 2 : PI / 2;
                g.part('54200', col, fx(5), z, 5, { rotY: nr }); g.part('54200', col, fx(5), z + 1, 5, { rotY: nr });
                g.part('3021', col, fx(1, 3), z, 6, { rotY: PI / 2, w: 3, l: 2 });
                g.part('98138', 'WHITE', fx(3), z, 7); g.part('3070', col, fx(2), z + 1, 7);
                g.part('3024', 'BLACK', fx(0), z, 5); g.part('3024', 'BLACK', fx(0), z + 1, 5); g.part('3023', 'BLACK', fx(0), z, 6, { rotY: 0 });
            };
            const cols = [P.primary, P.secondary === P.primary ? 'BLUE' : P.secondary, P.accent === P.primary ? 'YELLOW' : P.accent];
            // Cars sit on the straights (x within r .. W-1-r keeps all four wheels on tarmac; a micro track clamps to the grass edge).
            const clamp = (x) => Math.max(0, Math.min(W - 6, x));
            car(clamp(sx - 7), D - 3, cols[0], 1);
            if (cars > 1) car(clamp(r + 1), 1, cols[1], -1);
            if (cars > 2) car(r + 13 <= W - 1 - r ? r + 8 : clamp(sx + 2), r + 13 <= W - 1 - r ? 1 : D - 3, cols[2], r + 13 <= W - 1 - r ? -1 : 1);
            for (let z = D - tw + 1; z <= D - 1; z++) { tile(sx, z, z % 2 ? 'BLACK' : 'WHITE'); tile(sx + 1, z, z % 2 ? 'WHITE' : 'BLACK'); }
            for (let x = r; x <= W - 1 - r; x++) { tile(x, tw - 1, x % 2 ? 'RED' : 'WHITE'); tile(x, D - tw, x % 2 ? 'RED' : 'WHITE'); }
            for (let x = r + 1; x <= W - 2 - r; x += 3) { tile(x, 1, 'WHITE'); tile(x, D - 2, 'WHITE'); }
            const feats = ['an oval tarmac circuit with red and white kerbs', 'a chequered start line', `${['one', 'two', 'three'][cars - 1]} formula ${cars > 1 ? 'cars' : 'car'} on small wheels with rubber tyres`];
            if (grandstand) {
                // Three stepped tiers of seats under a plate roof on round-brick columns, flags at the ends.
                const gx0 = r, gx1 = W - 1 - r, gz = D + 1;
                for (let k = 0; k < 3; k++) { g.box(gx0, gx1, gz + k, gz + k, 1, 1 + k * 2, 'LIGHT_GREY'); for (let x = gx0; x <= gx1; x += 2) g.part('3070', k % 2 ? P.accent : P.primary, x, gz + k, 2 + k * 2); }
                for (let x = gx0; x <= gx1; x += 4) {
                    const l = Math.min(4, gx1 - x + 1);
                    if (l < 2) break;
                    for (let y = 1; y <= 10; y += 3) g.part('3062', 'DARK_GREY', x, gz + 3, y);
                    g.part({ 4: '3020', 3: '3021', 2: '3022' }[l], 'WHITE', x, gz + 2, 13, { rotY: l > 2 ? PI / 2 : 0, w: l, l: 2 });
                }
                H.flagPole(ctx, gx0 - 2, gz + 1, 1, { height: 3, color: P.dark, flag: P.accent }); H.flagPole(ctx, gx1 + 2, gz + 1, 1, { height: 3, color: P.dark, flag: P.primary });
                feats.push('a covered grandstand with tiered seats');
            } else { H.flagPole(ctx, -2, D, 1, { height: 3, color: P.dark, flag: P.accent }); H.flagPole(ctx, W + 1, D, 1, { height: 3, color: P.dark, flag: P.primary }); feats.push('trackside flags'); }
            if (chance(0.7)) H.tree(ctx, Math.floor(W / 2), Math.floor(D / 2), 1, 'round');
            feats.push('an infield of grass');
            return { title: ctx.match === 'nascar' || ctx.match === 'speedway' ? 'Speedway' : ctx.match === 'grand prix' ? 'Grand Prix Circuit' : 'Race Track', features: feats };
        }
    });

    /* ── market stall ─────────────────────────────────────────── */

    reg({
        kind: 'market', category: 'Architecture', icon: '🍎',
        keys: ['market stall', 'market', 'stall', 'fruit stall', 'farmers market', 'food stall', 'fruit stand', 'lemonade stand', 'bazaar', 'souk', 'vegetable stall', 'flower stall', 'kiosk', 'newsstand', 'hot dog stand', 'street market', 'produce stand', 'flower stand'],
        build(ctx) {
            const { g, P, sc, pick, chance, match } = ctx;
            const W = sc(8), D = 4;
            const kind = ctx.declare({ id: 'produce', label: 'Produce', type: 'choice', default: match.includes('flower') ? 'flowers' : match.includes('vegetable') ? 'vegetables' : match === 'lemonade stand' ? 'lemonade' : 'fruit', choices: ['fruit', 'vegetables', 'flowers', 'lemonade'] });
            const goods = { fruit: ['RED', 'ORANGE', 'YELLOW', 'LIME', 'GREEN'], vegetables: ['ORANGE', 'GREEN', 'LIME', 'PURPLE', 'RED'], flowers: ['PINK', 'YELLOW', 'WHITE', 'PURPLE', 'RED'], lemonade: ['YELLOW', 'YELLOW', 'LIME', 'WHITE', 'YELLOW'] }[kind];
            const stripe = P.explicit ? P.primary : pick(['RED', 'BLUE', 'GREEN', 'ORANGE']);
            // A cobbled square with a few darker setts.
            g.box(-4, W + 3, -4, D + 4, 0, 0, 'LIGHT_GREY', { noBrick: true });
            // The counter: a wooden block with a cloth top, heaped with round-plate produce in rows.
            g.box(0, W - 1, 1, D - 1, 1, 3, P.wood); g.box(0, W - 1, 1, D - 1, 4, 4, kind === 'flowers' ? 'GREEN' : 'TAN', { noBrick: true });
            for (let x = 0; x < W; x++) for (let z = 1; z < D; z++) {
                const col = goods[(x + z * 2) % goods.length];
                if (z === D - 1 && x <= 1) continue;   // the crates go here
                if (kind === 'lemonade' && x >= W - 2) continue;   // the jug goes here
                if (kind === 'flowers') { if ((x + z) % 2 === 0) H.flower(ctx, x, z, 5, col); }
                else if (kind === 'lemonade') { if (z === 1 && x % 2 === 0) { g.part('3062', 'TRANS_CLEAR', x, z, 5); } else if (z === D - 1 && x % 3 === 0) g.part('98138', col, x, z, 5); }
                else if (z === 1) { g.part('4073', col, x, z, 5); if (x % 2 === 0) g.part('98138', goods[(x + 1) % goods.length], x, z, 6); }
                else if (z === D - 1 && x % 2 === 0) g.part('98138', col, x, z, 5);
            }
            if (kind === 'lemonade') { g.part('3941', 'TRANS_CLEAR', W - 2, 1, 5); g.part('4032', 'YELLOW', W - 2, 1, 8); }
            // Crates on the counter's back half and a price board.
            g.box(0, 1, D - 1, D - 1, 5, 6, 'TAN'); g.part('3023', goods[0], 0, D - 1, 7, { rotY: PI / 2, w: 2, l: 1 });
            // Four round-brick posts, a wooden frame and a striped awning laid across it.
            const AW = 16;
            for (const [x, z] of [[-1, 0], [W, 0], [-1, D], [W, D]]) for (let y = 1; y < AW; y += 3) g.part('3062', P.wood, x, z, y);
            for (const z of [0, D]) for (let x = -1; x <= W;) { const l = Math.min(4, W + 1 - x); g.part({ 4: '3710', 3: '3623', 2: '3023', 1: '3024' }[l], P.wood, x, z, AW, { rotY: l > 1 ? PI / 2 : 0, w: l, l: 1 }); x += l; }
            for (let z = 1; z < D; z++) { g.part('3024', P.wood, -1, z, AW); g.part('3024', P.wood, W, z, AW); }
            // Each stripe is one 1x6 plate crossing both rails (with a stud of overhang at the back), and a ridge plate along
            // the back ties every stripe together, so the whole awning is one locked sheet on its four posts.
            for (let x = -1; x <= W; x++) g.part('3666', (x + 1) % 2 ? 'WHITE' : stripe, x, -1, AW + 1, { rotY: 0, w: 1, l: 6 });
            H.strip(ctx, -1, 0, W + 2, 'x', AW + 2, P.wood);
            for (let x = -1; x <= W; x += 2) g.part('54200', (x + 1) % 2 ? 'WHITE' : stripe, x, D, AW + 2);   // scalloped front edge
            // A pennant on a bar pole at the awning's front corner.
            H.flagPole(ctx, W, D, g.top(W, D) + 1, { height: 1, color: P.wood, flag: stripe });
            // Beside the stall: a barrel, a sack and a stack of crates; a chalkboard on a bracket post out front.
            g.part('3941', 'BROWN', W + 1, D - 1, 1); g.part('4032', 'DARK_GREY', W + 1, D - 1, 4);
            g.part('553', 'TAN', -3, D - 1, 1);
            g.box(-3, -2, 0, 1, 1, 2, 'TAN'); g.part('3022', goods[1], -3, 0, 3); g.box(-3, -2, 0, 1, 4, 5, 'TAN'); g.part('3022', goods[2], -3, 0, 6);
            const bx = Math.floor(W / 2) - 1;
            g.part('3004', 'BLACK', bx, D + 2, 1, { rotY: PI / 2, w: 2, l: 1 });
            H.bracketMount(ctx, bx, D + 2, 4, { face: 'front', color: 'BLACK', part: '3069', partColor: 'WHITE' });
            if (chance(0.5)) H.lamp2(ctx, W + 3, -3, 1, { color: P.dark, face: 'front' });
            for (let i = 0; i < 6; i++) { const x = -3 + Math.floor(ctx.rnd() * (W + 6)), z = D + 1 + Math.floor(ctx.rnd() * 3); if (g.top(x, z) === 0) g.part('3070', 'DARK_GREY', x, z, 1); }
            const names = { 'lemonade stand': 'Lemonade Stand', 'flower stall': 'Flower Stall', 'flower stand': 'Flower Stall', 'hot dog stand': 'Hot Dog Stand', kiosk: 'Kiosk', newsstand: 'Newsstand', bazaar: 'Bazaar Stall', souk: 'Souk Stall', 'vegetable stall': 'Veg Stall', 'farmers market': 'Farmers\' Market Stall' };
            return { title: names[match] || 'Market Stall', features: [`a ${window.LEGO_COLORS[stripe].name.toLowerCase().replace('bright ', '')} and white striped awning with a pennant`, `a wooden counter heaped with ${kind}`, 'crates, a barrel and a sack', 'a chalkboard on a bracket', 'a cobbled square'] };
        }
    });

    /* ── farm ─────────────────────────────────────────────────── */

    reg({
        kind: 'farm', category: 'Nature', icon: '🚜',
        keys: ['farm', 'farmyard', 'farm with animals', 'barnyard', 'ranch', 'homestead', 'smallholding', 'dairy farm', 'farm scene', 'petting zoo', 'paddock', 'pasture', 'farm animals'],
        build(ctx) {
            const { g, P, sc, pick, chance, match } = ctx;
            const W = Math.max(24, sc(24)), D = Math.max(16, sc(16));   // the paddock needs its room
            const field = ctx.declare({ id: 'field', label: 'Crop field', type: 'bool', default: true });
            const herd = ctx.declare({ id: 'animals', label: 'Animals', type: 'choice', default: 'mixed', choices: ['mixed', 'cows', 'sheep', 'horses', 'pigs'] });
            g.box(-2, W + 1, -2, D + 1, 0, 0, P.ground, { noBrick: true });
            // The barn at the back left: six bricks of red wall, a white 1x4x6 door in its frame, real windows, a grey gable roof.
            const BW = 8, BD = 8, BH = 18, red = P.explicit ? P.primary : 'DARK_RED';
            g.shell(0, BW - 1, 0, BD - 1, 1, BH, red);
            H.realDoor(ctx, 2, BD - 1, 1, { face: 'front', frameColor: 'WHITE', doorColor: 'WHITE' });
            for (const x of [2, 6]) H.realWindow(ctx, x, 0, 7, { size: '1x2x2', face: 'back', frameColor: 'WHITE', glassColor: P.glass });
            H.realWindow(ctx, 0, 3, 7, { size: '1x2x2', face: 'left', frameColor: 'WHITE', glassColor: P.glass });
            H.realWindow(ctx, BW - 1, 4, 7, { size: '1x2x2', face: 'right', frameColor: 'WHITE', glassColor: P.glass });
            H.ceiling(ctx, 0, BW - 1, 0, BD - 1, BH + 1, 'WHITE');
            const roof = H.gableRoof(ctx, 0, BW - 1, 0, BD - 1, BH + 2, P.roof === 'DARK_RED' ? 'DARK_GREY' : P.roof, 'x');
            g.part('59900', 'GOLD', 1, Math.floor((roof.a + roof.b) / 2), roof.y + 1);
            // The silo beside it.
            for (let i = 0; i < 7; i++) g.part('3941', 'LIGHT_GREY', BW + 1, 1, 1 + i * 3);
            g.part('553', 'LIGHT_GREY', BW + 1, 1, 22);
            // A fenced paddock in front of the barn with the animals: three panels along the front, one up each side,
            // leaving a gate by the barn.
            const px0 = 0, px1 = 11, pz0 = BD + 2, pz1 = D - 1;
            H.fence(ctx, px0, pz1, 12, 'x', 1, 'WHITE'); H.fence(ctx, px1, pz1 - 4, 4, 'z', 1, 'WHITE'); H.fence(ctx, px0, pz1 - 4, 4, 'z', 1, 'WHITE');
            const kinds = herd === 'mixed' ? [pick(['cow', 'horse']), 'sheep', 'pig'] : [herd.slice(0, -1), herd.slice(0, -1), herd.slice(0, -1)];
            H.farmAnimal(ctx, kinds[0], 2, pz0, 1); H.farmAnimal(ctx, kinds[1], 5, pz0, 1); H.farmAnimal(ctx, kinds[2], 8, pz0, 1);   // all inside the rails
            H.farmAnimal(ctx, 'chicken', BW + 1, BD, 1); H.farmAnimal(ctx, 'chicken', BW + 3, BD + 1, 1);
            // A water trough and a haystack.
            g.box(BW + 5, BW + 6, BD + 1, BD + 1, 1, 1, 'DARK_GREY', { noBrick: true }); g.part('3069', 'TRANS_BLUE', BW + 5, BD + 1, 2, { rotY: PI / 2, w: 2, l: 1 });
            g.part('553', 'TAN', BW + 3, 3, 1);
            // Rows of crops on the right, and a tree.
            const feats = ['a red barn with a white door in its frame and real windows', 'a tall silo', `a picket-fenced paddock with ${herd === 'mixed' ? 'a ' + kinds[0] + ', a sheep and a pig' : herd}`, 'two chickens, a trough and a haystack'];
            if (field) {
                const fx0 = BW + 6, fz0 = 0, fx1 = W - 1, fz1 = Math.max(fz0 + 3, D - 6);
                g.box(fx0, fx1, fz0, fz1, 0, 0, 'BROWN', { noBrick: true });
                for (let x = fx0 + 1; x <= fx1 - 1; x += 2) for (let z = fz0; z <= fz1; z++) g.part((x - fx0) % 4 === 1 ? '4073' : '3062', (x - fx0) % 4 === 1 ? 'LIME' : 'GREEN', x, z, 1);
                feats.push('rows of crops');
            }
            H.tree(ctx, W - 2, D - 2, 1, 'round');
            return { title: match === 'ranch' ? 'Ranch' : match === 'petting zoo' ? 'Petting Zoo' : match === 'dairy farm' ? 'Dairy Farm' : 'Farmyard', features: feats };
        }
    });

    /* ── castle siege ─────────────────────────────────────────── */

    reg({
        kind: 'siege', category: 'Castle & Fantasy', icon: '⚔️',
        keys: ['castle siege', 'siege', 'castle under siege', 'under siege', 'siege tower', 'catapult', 'trebuchet', 'battering ram', 'castle wall', 'city wall', 'rampart', 'ramparts', 'battlements', 'siege engine', 'besieged castle', 'castle attack'],
        build(ctx) {
            const { g, P, sc, chance } = ctx;
            const W = Math.max(26, sc(26)), D = Math.max(16, sc(16));   // room for the camp outside the wall
            const catapult = ctx.declare({ id: 'catapult', label: 'Catapult', type: 'bool', default: true });
            const stone = P.explicit ? P.primary : 'LIGHT_GREY', dark = 'DARK_GREY';
            g.box(-2, W + 1, -3, D + 1, 0, 0, P.ground, { noBrick: true });
            // The curtain wall along the back between two square towers with arched windows and flags on bar poles.
            const zW = 2, TW = 4, TH = 15;
            for (const tx of [0, W - TW]) {
                g.shell(tx, tx + TW - 1, zW - 1, zW + 2, 1, TH, stone); H.ceiling(ctx, tx, tx + TW - 1, zW - 1, zW + 2, TH + 1, dark);
                H.crenellate(ctx, tx, tx + TW - 1, zW - 1, zW + 2, TH + 2, stone);
                H.archWindow(ctx, tx, zW + 2, 6, { width: 4, height: 3, color: dark, glass: 'TRANS_ORANGE', face: 'front' });
                H.flagPole(ctx, tx + 1, zW, TH + 2, { height: 2, flag: P.accent });
            }
            g.box(TW, W - TW - 1, zW, zW + 1, 1, 9, stone);
            for (let x = TW; x <= W - TW - 1; x += 2) g.box(x, x, zW, zW, 10, 12, stone);
            for (let x = TW + 1; x <= W - TW - 1; x += 2) g.part('3070', dark, x, zW + 1, 10);
            // The gate: a 1x4 arch over the opening in the wall's outer face, a wooden door set back in the inner row,
            // torches either side.
            const gx = Math.floor(W / 2) - 1;
            H.archDoor(ctx, gx - 1, zW + 1, 1, { width: 4, height: 6, color: dark, face: 'front' });
            g.clear(gx, gx + 1, zW, zW, 1, 6); g.box(gx, gx + 1, zW, zW, 1, 6, P.wood);
            for (const x of [gx - 2, gx + 3]) { g.part('3062', dark, x, zW + 2, 1); g.part('3062', dark, x, zW + 2, 4); g.part('98138', 'TRANS_ORANGE', x, zW + 2, 7); }
            // The siege tower outside: a wooden box on axle plates with wooden wheels, a platform and a hinged drawbridge
            // toward the wall.
            const sx = 5, sz = zW + 6;
            g.box(sx, sx + 3, sz, sz + 3, 3, 3, P.wood, { noBrick: true });
            for (const z of [sz, sz + 2]) H.axle(ctx, sx, z, 3, { width: 4, size: 'small', color: P.wood, tyre: false, wheelColor: 'BROWN' });
            g.shell(sx, sx + 3, sz, sz + 3, 4, 15, P.wood);
            for (let y = 6; y <= 12; y += 3) g.box(sx, sx + 3, sz + 3, sz + 3, y, y, 'TAN', { noBrick: true });   // timber banding
            H.ceiling(ctx, sx, sx + 3, sz, sz + 3, 16, P.wood);
            H.crenellate(ctx, sx, sx + 3, sz, sz + 3, 17, P.wood);
            // Locking hinge plates on the platform's edge carry the bridge deck, which can swing down onto the wall.
            for (const x of [sx + 1, sx + 2]) { g.part('44302', 'TAN', x, sz, 17, { w: 1, l: 2 }); g.part('44301', 'TAN', x, sz - 2, 17, { w: 1, l: 2, links: [[x, 17, sz]] }); }
            g.part('3022', 'TAN', sx + 1, sz - 2, 18);
            // Camp: a catapult on a turntable with a boulder, a pile of boulders, a tent and a campfire.
            const feats = ['a crenellated curtain wall with an arched gate and torches', 'two square towers with arched windows flying flags', 'a wooden siege tower on wheels with a hinged drawbridge'];
            const cx = W - 9, cz = zW + 7;
            if (catapult) {
                g.part('3680', dark, cx, cz + 2, 1); g.part('3679', dark, cx, cz + 2, 2, { links: [[cx, 1, cz + 2]] });
                g.part('3795', P.wood, cx, cz, 3, { rotY: 0, w: 2, l: 6 });
                for (const x of [cx, cx + 1]) { g.part('3062', P.wood, x, cz + 2, 4); g.part('3062', P.wood, x, cz + 2, 7); }
                g.part('3666', P.wood, cx, cz, 10, { rotY: 0, w: 1, l: 6 });
                g.part('3005', dark, cx, cz, 11); g.part('4032', dark, cx, cz + 4, 11); g.part('553', 'LIGHT_GREY', cx, cz + 4, 12);
                for (const [bx, bz] of [[cx + 3, cz + 4], [cx + 4, cz + 5], [cx + 3, cz + 6]]) g.part('3062', 'LIGHT_GREY', bx, bz, 1);
                feats.push('a catapult on a turntable, loaded with a boulder');
            }
            const tx = W - 5, tz = zW + 5;
            g.part('3039', P.accent, tx, tz, 1, { rotY: PI }); g.part('3039', P.accent, tx, tz + 2, 1, { rotY: 0 });
            g.part('3039', P.accent, tx + 2, tz, 1, { rotY: PI }); g.part('3039', P.accent, tx + 2, tz + 2, 1, { rotY: 0 });
            g.part('3062', 'BROWN', tx - 1, tz + 4, 1); g.part('59900', 'TRANS_ORANGE', tx - 1, tz + 4, 4);
            feats.push('a besiegers\' camp with a tent and campfire');
            if (chance(0.6)) H.tree(ctx, 2, D - 2, 1, 'pine');
            return { title: ctx.match === 'catapult' || ctx.match === 'trebuchet' ? 'Catapult at the Walls' : 'Castle Siege', features: feats };
        }
    });

    /* ── solar system ─────────────────────────────────────────── */

    reg({
        kind: 'solar', category: 'Space & Sci-Fi', icon: '🪐',
        keys: ['solar system', 'orrery', 'planets', 'planet', 'saturn', 'jupiter', 'neptune', 'uranus', 'mercury', 'venus', 'mars', 'milky way', 'planetarium', 'the sun and planets'],
        build(ctx) {
            const { g, sc } = ctx;
            const W = Math.max(32, sc(30)), D = Math.max(20, sc(18)), cx = Math.floor(W / 2), cz = Math.floor(D / 2);
            const rings = ctx.declare({ id: 'orbits', label: 'Orbit rings', type: 'bool', default: true });
            const pluto = ctx.declare({ id: 'pluto', label: 'Include Pluto', type: 'bool', default: true });
            g.box(0, W - 1, 0, D - 1, 0, 0, 'BLACK', { noBrick: true });
            // The sun: two round bricks of orange and yellow under a dome, with cheese-slope flares.
            g.part('3941', 'ORANGE', cx - 1, cz - 1, 1); g.part('3941', 'YELLOW', cx - 1, cz - 1, 4); g.part('553', 'YELLOW', cx - 1, cz - 1, 7);
            for (const [fx, fz, rot] of [[cx - 2, cz - 1, PI / 2], [cx - 2, cz, PI / 2], [cx + 1, cz - 1, -PI / 2], [cx + 1, cz, -PI / 2], [cx - 1, cz - 2, PI], [cx, cz - 2, PI], [cx - 1, cz + 1, 0], [cx, cz + 1, 0]]) g.part('54200', 'TRANS_ORANGE', fx, fz, 1, { rotY: rot });
            // Planets, out from the sun: [name, orbit fraction, angle, build].
            const fr = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.08];
            const RX = cx - 2, RZ = cz - 2;
            // Each planet rises from the base on a stack of bars (`n` of them, the outer planets higher), the planet's
            // bottom part linked to the bar top: a round brick or plate on a bar, as an orrery would do it.
            const mast = (x, z, n) => { for (let i = 0; i < n; i++) g.part('30374', 'DARK_GREY', x, z, 1 + 4 * i, { w: 1, l: 1, hp: 4, links: [[x, 4 * i, z]] }); return 1 + 4 * n; };
            const small = (x, z, c1, c2, n) => { const y = mast(x, z, n); g.part('3062', c1, x, z, y, { links: [[x, y - 1, z]] }); g.part('98138', c2 || c1, x, z, y + 3); };
            const big = (x, z, c1, c2, band, n) => { const y = mast(x, z, n); g.part('4032', c1, x, z, y, { links: [[x, y - 1, z]] }); g.part('3941', c1, x, z, y + 1); if (band) { g.part('4032', band, x, z, y + 4); g.part('3941', c1, x, z, y + 5); g.part('553', c2 || c1, x, z, y + 8); } else g.part('553', c2 || c1, x, z, y + 4); };
            const planets = [
                ['Mercury', 0, 0.3, (x, z) => small(x, z, 'LIGHT_GREY', null, 1)], ['Venus', 1, 2.4, (x, z) => small(x, z, 'TAN', 'ORANGE', 1)], ['Earth', 2, 4.2, (x, z) => { const y = mast(x, z, 2); g.part('4032', 'BLUE', x, z, y, { links: [[x, y - 1, z]] }); g.part('3941', 'BLUE', x, z, y + 1); g.part('4032', 'GREEN', x, z, y + 4); g.part('98138', 'WHITE', x, z, y + 5); }],
                ['Mars', 3, 1.1, (x, z) => small(x, z, 'RED', 'DARK_RED', 1)], ['Jupiter', 4, 3.6, (x, z) => big(x, z, 'ORANGE', 'TAN', 'TAN', 2)], ['Saturn', 5, 5.5, (x, z) => { const y = mast(x, z, 2); g.part('4032', 'TAN', x, z, y, { links: [[x, y - 1, z]] }); g.part('3941', 'TAN', x, z, y + 1); g.part('3960', 'GOLD', x - 1, z - 1, y + 4, { w: 4, l: 4, hp: 2 }); g.part('3941', 'TAN', x, z, y + 6); g.part('553', 'TAN', x, z, y + 9); }],
                ['Uranus', 6, 0.9, (x, z) => big(x, z, 'TRANS_BLUE', 'TRANS_BLUE', null, 3)], ['Neptune', 7, 2.9, (x, z) => big(x, z, 'DARK_BLUE', 'BLUE', null, 3)],
            ];
            if (pluto) planets.push(['Pluto', 8, 4.8, (x, z) => { const y = mast(x, z, 2); g.part('4073', 'TAN', x, z, y, { links: [[x, y - 1, z]] }); g.part('98138', 'LIGHT_GREY', x, z, y + 1); }]);
            // Each planet claims its orbit spot plus a one-stud margin; one that would touch another is nudged along.
            const taken = new Set();
            const claim = (x, z, m) => { for (let ddx = -m; ddx <= 1 + m; ddx++) for (let ddz = -m; ddz <= 1 + m; ddz++) taken.add(`${x + ddx},${z + ddz}`); };
            const clear = (x, z, m) => { for (let ddx = -m; ddx <= 1 + m; ddx++) for (let ddz = -m; ddz <= 1 + m; ddz++) if (taken.has(`${x + ddx},${z + ddz}`)) return false; return true; };
            claim(cx - 1, cz - 1, 1);
            const spots = planets.map(([name, i, a]) => {
                const rx = RX * fr[i], rz = RZ * fr[i], m = name === 'Saturn' ? 1 : 0;
                let x = Math.round(cx + rx * Math.cos(a)), z = Math.round(cz + rz * Math.sin(a));
                x = Math.max(1 + m, Math.min(W - 3 - m, x)); z = Math.max(1 + m, Math.min(D - 3 - m, z));
                for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [3, 0], [-3, 0]]) if (clear(x + ox, z + oz, m) && x + ox >= 1 + m && x + ox <= W - 3 - m && z + oz >= 1 + m && z + oz <= D - 3 - m) { x += ox; z += oz; break; }
                claim(x, z, m + 1);
                return [x, z];
            });
            if (rings) {
                // Dashed orbit rings: a tile every couple of studs of arc, skipping the planets' own cells.
                for (let i = 0; i < 8; i++) {
                    const rx = RX * fr[i], rz = RZ * fr[i], seen = new Set();
                    for (let a = 0; a < 2 * PI; a += 2.2 / ((rx + rz) / 2)) {
                        const x = Math.round(cx + rx * Math.cos(a)), z = Math.round(cz + rz * Math.sin(a)), k = `${x},${z}`;
                        if (seen.has(k) || taken.has(k) || x < 0 || x >= W || z < 0 || z >= D || g.top(x, z) > 0) continue;
                        seen.add(k); g.part('3070', 'DARK_GREY', x, z, 1);
                    }
                }
            }
            planets.forEach(([, , , build], i) => build(spots[i][0], spots[i][1]));
            // A rim of tiles and a brass name plaque.
            g.part('3069', 'GOLD', cx - 1, D - 1, 1, { rotY: PI / 2, w: 2, l: 1 });
            return { title: 'Solar System', features: ['a blazing sun with cheese-slope flares', `${pluto ? 'nine' : 'eight'} planets on bar masts, sized and coloured to match`, 'dish-ringed Saturn and banded Jupiter', rings ? 'dashed orbit rings on a black base' : 'a black space base', 'a brass name plaque'] };
        }
    });

    /* ── dinosaur skeleton ────────────────────────────────────── */

    reg({
        kind: 'fossil', category: 'Nature', icon: '🦴',
        keys: ['dinosaur skeleton', 'dino skeleton', 't-rex skeleton', 'trex skeleton', 'fossil', 'fossils', 'skeleton of a dinosaur', 'museum dinosaur', 'dinosaur bones', 'dinosaur fossil', 'bones', 'sauropod skeleton', 'brontosaurus skeleton'],
        build(ctx) {
            const { g, P, sc, has } = ctx;
            const longneck = ctx.declare({ id: 'longneck', label: 'Long neck', type: 'bool', default: has('brontosaurus', 'diplodocus', 'brachiosaurus', 'sauropod', 'long neck') });
            const bone = P.explicit ? P.primary : 'WHITE';
            const L = sc(12), ribs = Math.floor((L - 4) / 2), tail = sc(6), neck = longneck ? sc(6) : 3;
            const z0 = -tail, z1 = L + neck + 4;
            // A museum floor, a dark plinth with a tile rim, a brass plaque and a spotlight.
            g.box(-5, 6, z0 - 3, z1 + 2, 0, 0, 'TAN', { noBrick: true });
            g.box(-3, 4, z0 - 1, z1, 1, 2, 'DARK_GREY');
            for (let z = z0 - 1; z <= z1; z += 2) { g.part('3070', 'LIGHT_GREY', -3, z, 3); g.part('3070', 'LIGHT_GREY', 4, z, 3); }
            g.part('3069', 'GOLD', 0, z1 + 1, 1, { rotY: PI / 2, w: 2, l: 1 });
            H.lamp(ctx, 6, z1 + 1, 1);
            // Legs on three-stud feet, a pelvis plate across them, the spine running along the top.
            const zHip = 2, ySp = 15;
            for (const x of [0, 2]) { g.part('3623', bone, x, zHip - 1, 3, { rotY: 0 }); for (let y = 4; y < ySp - 1; y += 3) { const h = Math.min(3, ySp - 1 - y); if (h === 3) g.part('3062', bone, x, zHip, y); else for (let k = 0; k < h; k++) g.part('4073', bone, x, zHip, y + k); } }
            g.part('3623', bone, 0, zHip, ySp - 1, { rotY: PI / 2, w: 3, l: 1 });
            // The spine: long plates with no 1-stud stubs, and a 1x2 bridge plate over every joint, so it is one beam.
            const spine = []; for (let rem = L; rem > 0;) { let l = [10, 8, 6, 4, 3, 2].find((v) => v <= rem && rem - v !== 1); if (!l) l = rem; spine.push(l); rem -= l; }
            for (let z = 0, i = 0; i < spine.length; z += spine[i++]) { const l = spine[i]; g.part({ 10: '4477', 8: '3460', 6: '3666', 4: '3710', 3: '3623', 2: '3023', 1: '3024' }[l], bone, 1, z, ySp, { rotY: 0, w: 1, l }); if (i > 0) g.part('3023', bone, 1, z - 1, ySp + 1, { rotY: 0 }); }
            // Ribs hang from the spine: a plate across under it and a round brick down from each end.
            for (let i = 0; i < ribs; i++) {
                const z = zHip + 2 + i * 2;
                if (z > L - 2) break;
                g.part('3623', bone, 0, z, ySp - 1, { rotY: PI / 2, w: 3, l: 1 });
                g.part('3062', bone, 0, z, ySp - 4); g.part('3062', bone, 2, z, ySp - 4);
            }
            // Tiny arms off the front rib.
            g.part('3023', bone, -1, zHip + 2, ySp, { rotY: PI / 2, w: 2, l: 1 }); g.part('3023', bone, 2, zHip + 2, ySp, { rotY: PI / 2, w: 2, l: 1 });
            // The neck steps up and forward, plate over plate; a hinged lower jaw stands on its last plate and carries
            // the skull (eye sockets, teeth on the jaw's tip under the snout).
            let ny = ySp, nz = L - 2;
            for (let i = 0; i < neck; i++) { ny += 1; nz += 1; g.part('3023', bone, 1, nz, ny, { rotY: 0 }); }
            const jaw = H.hingeJaw(ctx, 1, nz + 1, ny + 1, { length: 4, width: 1, color: bone, teeth: bone, open: 0.4, face: 'front' });
            const sz = nz, sy = ny + 6;
            H.slab(ctx, 0, 2, sz, sz + 3, sy, bone); g.box(0, 2, sz, sz + 3, sy + 2, sy + 2, bone);
            g.set(0, sy + 2, sz + 2, 'BLACK'); g.set(2, sy + 2, sz + 2, 'BLACK');
            // The tail steps down and back from the hip.
            for (let i = 1; i <= tail && ySp - i >= 3; i++) g.part('3023', bone, 1, -i, ySp - i, { rotY: 0 });
            return { title: longneck ? 'Sauropod Skeleton' : 'T-Rex Skeleton', features: ['a museum plinth with a brass plaque', 'a bony spine with hanging ribs', `a ${longneck ? 'long stepped' : 'stepped'} neck and a skull with ${jaw.feats[0]}`, 'a tapering tail', 'a spotlight'] };
        }
    });
})();
