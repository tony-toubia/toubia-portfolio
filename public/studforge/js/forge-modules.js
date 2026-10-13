// StudForge modules: reusable building techniques made from real parts.
//
// A module is a small sub-assembly a good builder reaches for again and again: wheels on an axle plate,
// a hinged jaw, a wing on a hinge plate, a clip-and-bar tail, a turntable turret, an arch over a doorway,
// a real window or door, a propeller on a pin, a bracket with a sideways tile. The part pairs are the ones real
// sets use (4600 + 4624 + 3641 axles, 60592 + 60601 windows, 60596 + 60623 doors, 3937 + 3938 hinges, 3680 + 3679
// turntables, left/right wedge plate pairs). Every module places explicit
// parts with `g.part`, declares `links` for every fastening that is not a stud (wheel -> axle pin, clip -> bar,
// hinge top -> base, flag -> bar, propeller -> stud/pin, turntable top -> base), marks tyres/panes/doors as
// ghosts (the catalog does) and never leaves a part floating: the harness (`scripts/studforge-test.mjs`) must
// still say `0 flagged` with a module in a model.
//
// Two ways in:
//   window.FORGE.helpers.<name>(ctx, ...)            for builders (`H.axle`, `H.chassis`, `H.hingeJaw`, ...)
//   window.FORGE.modules[id].build(ctx, params)      the same technique with named params, for blueprints
// `ctx` is the builder context ({ g, P, sc, pick, chance, rnd, ... }); modules only use `ctx.g`, `ctx.P` and
// `ctx.sc`. All sizes are in studs, `y` in plates (3 per brick). Every module returns an object with
// `feats` (strings for the model description) plus the anchors a caller needs (top plate, wheel cells, ...).
//
// ── Orientation ────────────────────────────────────────────────────────────────────────────────────────────────
// Modules with a `face` work in a local frame: u runs across (to the right when looking along +v) and v runs
// forward, both from the origin stud (x, z). `face` maps the frame onto the grid:
//   'front' (default)  +v = +Z   +u = +X          'back'   +v = -Z   +u = -X
//   'right'            +v = +X   +u = -Z          'left'   +v = -X   +u = +Z
// The cells each module occupies are given below in that frame, relative to the origin, so a caller can keep
// its own cells away from them. A module placed over painted cells REPLACES them (that is how windows, arches
// and noses are set into a wall or body): never place one over another explicit part.
//
// ── Catalogue (signature / cells / returns / example) ─────────────────────────────────────────────────────────
//
// H.axle(ctx, x0, z, y, { width = 2, size = 'small', color, tyre = true, tyreColor = 'BLACK' })
//   An axle plate inside a chassis that is `width` studs wide (x0..x0+width-1) at plate y, with a wheel (+ tyre)
//   on each side outside the chassis, centred on the pin height. size: 'small' (4624 + 3641, 5 plates tall),
//   'medium' (6014 + 6015, 3 studs long, 7 plates), 'large' (56904 + 56898, 2 studs thick, 14 plates: monster trucks, tractors),
//   'train' (55423, no tyre, 6 plates). Width 2 uses 4600, width 4 a rotated 2926, wider chassis two 4600s with
//   plates between.
//   Cells: plate x0..x0+width-1, z..z+1, plate y. Wheels: x0-ww..x0-1 and x0+width..x0+width+ww-1 (ww = wheel
//   thickness: 1, or 2 for 'large'), z..z+1 (z..z+2 for 'medium', z-1..z+3 for 'large'), plates y-clearance ..
//   y-clearance+hp-1. Returns { feats, clearance, plateCells, wheelCells, hp, ww }.
//   H.axle.clearance(size) = plates between the floor and the axle plate (small 2, medium 3, large 7, train 3).
//   H.axle.envelope(size) = { w, l, hp } of one wheel's footprint.
//   e.g. H.axle(ctx, 0, 1, 3, { width: 4, size: 'medium', color: 'DARK_GREY' })
//
// H.chassis(ctx, x0, z0, width, length, y, { axles = [...z], size = 'small', color })
//   A two-layer plate chassis (x0..x0+width-1, z0..z0+length-1) raised so the wheels stand on plate y (the
//   floor: the plate index the tyres touch, e.g. ground + 1 when the model stands on a base plate). Axle plates
//   are at the z's in `axles` (each 2 deep, relative to z0, default front and back), layer two is cross-bonded.
//   Cells: the chassis at plates y+clearance .. y+clearance+1, wheels as in H.axle (bottom at y).
//   Returns { feats, top (first free plate above the chassis: build the body from here), clearance, yAxle,
//   x0, x1, z0, z1, xLeft, xRight (outermost wheel columns), axles: [axle results] }.
//   e.g. const c = H.chassis(ctx, 0, 0, 4, 10, 1, { axles: [1, 7], size: 'medium' }); g.box(0, 3, 0, 9, c.top, c.top + 2, P.primary);
//
// H.hingeJaw(ctx, x, z, y, { length = 4, width = 2, color, teeth = 'WHITE', open = 0.25, face })
//   A lower jaw: hinge brick base(s) 3937 (plates y..y+2) with a hinge top plate 3938/6134 (y+3) linked to
//   them, a plate jaw on the top plate reaching `length` studs forward, and cheese-slope teeth on its tip. The
//   footprint is the CLOSED jaw; `open` (0..1) only tilts the rendering about the hinge (front/back faces only).
//   Cells: u=0..width-1: v=0..1 at y..y+3 (hinge), v=0..length-1 at y+4 (jaw, length 3..10), v=length-1 at y+5 (teeth).
//   Returns { feats, hingeCells, top (= y+4, the plate the jaw is at), tip: [x, z] }.
//   e.g. H.hingeJaw(ctx, 3, 8, 6, { length: 5, color: P.primary, open: 0.3 })
//
// H.hingedWing(ctx, x, z, y, { span = 6, side = 1, color, sweep = 0, face })
//   A wing on a swivel hinge plate pair: base 2429 inside the body (4 studs, ending at the origin column), top
//   2430 outside linked to it, 2-wide wing plates on the top and a 4x2 wedge plate at the tip, a 1-wide spar
//   plate tying the joints. `sweep` (radians, render only) swings the wing about the swivel.
//   side = 1: the wing runs +X from x+1 to x+span; side = -1: it runs -X from x-1 to x-span. (face rotates that.)
//   The base needs 4 studs of body behind the root: on a body narrower than 8, put opposite wings on different rows.
//   Cells (side 1): base x-3..x, row z, plate y (inside the body: the caller's cells there are replaced);
//   wing x+1..x+span, rows z..z+1, plates y..y+2 (the spar x+2..x+span-2 at y+2).
//   Returns { feats, root: [x, z], tip: [x, z] }.
//   e.g. H.hingedWing(ctx, 5, 4, 7, { span: 8, side: 1, color: P.primary }); H.hingedWing(ctx, 0, 4, 7, { span: 8, side: -1, color: P.primary })
//
// H.clipTail(ctx, x, z, y, { segments = 3, color, tip = 'slope', tipColor, face })
//   A drooping tail: bar-handle plates 60478 chained with clip plates 63868 (each clip grabs the bar before it),
//   dropping two plates and advancing three studs per segment, ending in a cheese slope or a flag on the last
//   bar. The root plate (v=0..1 at plate y) must sit under or on the caller's body.
//   Cells (1 wide, u=0): segment i: bar plate v=3i..3i+2 at plate y-2i; clip v=3i+2..3i+4 at y-2i-1;
//   tip 'slope': v=3n+1 at y-2n+2 (after a last clip); 'flag': v=3n..3n+1, plates y-2n+1..y-2n+4.
//   Needs 2*segments plates of room under the root. Returns { feats, root: [x, z], end: [x, z], lowest }.
//   e.g. H.clipTail(ctx, 2, 0, 9, { segments: 3, color: P.primary, face: 'back' })
//
// H.turret(ctx, x, z, y, { size = 2, color, barrel = true, barrelColor, face })
//   A turntable (3680 base at plate y, 3679 top at y+1, linked) carrying a 2x2 (size 2) or 2x4 (size 4) brick
//   block three plates tall with a lying bar barrel pointing forward.
//   Cells: u=0..1, v=0..1 at y..y+4 (size 4: v=-1..2 at y+2..y+4); barrel v=2..5 (size 4: 3..6) at y+3.
//   Returns { feats, top (= y+5), center: [x, z] }.
//   e.g. H.turret(ctx, 2, 3, c.top + 3, { size: 4, color: P.secondary })
//
// H.archDoor(ctx, x, z, y, { width = 4, height = 6, color, face })
//   A doorway cut into a 1-stud wall the caller has already painted (the wall must span u=0..width-1 from
//   plate y up past the arch), with an arch part across the top: 6005 (width 3, 6 plates tall), 3659 (4),
//   3455 (6), 3308 (8, 6 plates tall). The jambs (u=0 and u=width-1) stay the caller's wall.
//   Cells: opening u=1..width-2, v=0, plates y..y+height-1 (cleared); arch u=0..width-1, v=0, y+height ..
//   y+height+archPlates-1. Returns { feats, top (first plate above the arch) }.
// H.archWindow(ctx, x, z, y, { width = 4, height = 3, color, glass, face })
//   The same with the opening glazed (trans cells).
//   e.g. H.archDoor(ctx, 4, 0, 1, { width: 4, height: 6, color: P.trim, face: 'front' })
//
// H.realWindow(ctx, x, z, y, { size = '1x2x2', face, frameColor, glassColor })
//   A window frame (60592 1x2x2, 60593 1x2x3, 3853 1x4x3) with its glass pane (ghost) set into a wall: the
//   frame replaces the wall cells, the wall below and above keeps it fastened.
//   Cells: u=0..W-1, v=0, plates y..y+hp-1 (hp 6 or 9). Returns { feats, top }.
// H.realDoor(ctx, x, z, y, { face, frameColor, doorColor })
//   A door frame 60596 (1x4x6: 18 plates) with its door 60623 (ghost).
//   Cells: u=0..3, v=0, plates y..y+17. Returns { feats, top }.
//   e.g. H.realWindow(ctx, 2, 0, 4, { size: '1x4x3', face: 'front', frameColor: 'WHITE', glassColor: 'TRANS_CLEAR' })
//
// H.propeller(ctx, x, z, y, { face, color = 'BLACK', mount = 'headlight', hubColor, blades = 'auto' })
//   A propeller 4617 (3 blades, 5.5 studs across; footprint kept to 4) on the nose cell (x, z) of a body facing `face`. mount 'headlight': a 4070 headlight brick
//   replaces the nose cell (plates y..y+2) and the propeller hangs on its side stud; 'pin': a Technic pin 2780
//   pokes out of the nose (v=1 at plate y+1) and the propeller sits on it at v=2. blades 'vertical' reserve a
//   10-plate column (y-3..y+6) one stud in front of the hub, 'horizontal' a 4-stud row (u=-2..1) one plate
//   tall; 'auto' stands them up when there is room below (floor option, default 0).
//   Returns { feats, hub: [x, z], top }.
// H.rotorMast(ctx, x, z, y, { color = 'BLACK', bladeColor, blades = 4 })
//   A bar 30374 (4 plates) standing on the roof with a 4617 rotor across its top (two crossed for 4 blades).
//   Cells: x, z at y..y+3 (bar); rotor x-2..x+1 at y+4 (and z-2..z+1 at y+5). Returns { feats, top }.
//   e.g. H.propeller(ctx, 2, 11, 7, { face: 'front', color: 'DARK_GREY' }); H.rotorMast(ctx, 3, 5, 12, {})
//
// H.bracketMount(ctx, x, z, y, { face, color, part = '3069', partColor, dir = 'down' })
//   A bracket 99781 (dir 'down': the face hangs below the plate) or 99780 (inverted, 'up') whose plate sits in the body
//   at u=0..1, v=0, plate y, with a 1x2 tile/plate/grille (`part`) on its sideways studs, one stud in front.
//   Cells: bracket u=0..1, v=0, y; mounted part u=0..1, v=1, plates y-2..y ('down') or y..y+2 ('up').
//   Returns { feats, cells }.
// H.headlight(ctx, x, z, y, { face, color, lens = 'TRANS_CLEAR' })
//   A headlight brick 4070 replacing the body cell (x, z) at plates y..y+2 with a trans round tile on its side
//   stud (u=0, v=1, plates y..y+2, linked). Returns { feats }.
// H.lamp2(ctx, x, z, y, { color = 'BLACK', height = 2, lens = 'TRANS_ORANGE', face })
//   A street lamp: `height` bars 30374 stacked (4 plates each), a headlight brick on top, lens on its side.
//   Cells: x, z at y..y+4*height+2; lens at v=1 of the top brick. Returns { feats, top }.
//   e.g. H.headlight(ctx, 0, 9, c.top + 1, { face: 'front' }); H.bracketMount(ctx, 1, 9, c.top + 1, { face: 'front', part: '2412', partColor: 'DARK_GREY' })
//
// H.fence(ctx, x0, z0, length, axis, y, color = 'WHITE')
//   Fence panels 3185 (4 studs, 6 plates tall) on 1x1 plate posts at their ends; a remainder shorter than 4 is
//   a run of 1x1 bricks on posts. Cells: the run (along 'x' or 'z') at plates y..y+6. Returns { feats }.
// H.flagPole(ctx, x, z, y, { height = 2, color = 'DARK_GREY', flag })
//   `height` bars 30374 stacked at (x, z) from plate y, with a flag 2335 clipped to the top bar
//   (cells x, z+1..z+2, the top bar's 4 plates). Returns { feats, top }.
//   e.g. H.fence(ctx, 0, 12, 8, 'x', 1, 'WHITE'); H.flagPole(ctx, 9, 9, 1, { height: 3, flag: P.accent })
//
// H.wedgeNose(ctx, x, z, y, { width = 4, color, face, overlap = 1, length })
//   A tapered nose from wedge plates: 2x3 (43723 left / 43722 right) at the outer columns, 2-wide plates
//   between for wider bodies (6, 8, ...). The back `overlap` rows sit inside the body (replacing the caller's
//   cells at plate y) so the body above/below holds the nose.
//   Cells: u=0..width-1, v=-overlap .. length-1-overlap (length 3) at plate y. Returns { feats, tip: [x, z] }.
//   e.g. H.wedgeNose(ctx, 0, 10, c.top, { width: 4, color: P.primary, face: 'front' })
//
// H.curvedRoof(ctx, x, z, y, { width = 2, color, face })
//   Curved slopes (15068 2x2 pairs, 11477 1x2 for an odd stud) along an edge, sloping down toward +v.
//   Cells: u=0..width-1, v=0..1, plates y..y+1. Returns { feats }.
// H.overhang(ctx, x, z, y, { width = 2, color, face, deep = false })
//   Inverted slopes (3660 2x2 / 3665 1x2, or 3747 2x3 when `deep`) under a balcony or wing edge; the plate the
//   caller lays on top (at y+3) holds them, so lay that balcony with H.slab (two cross-bonded layers), not g.box:
//   a single tiled layer can seam exactly over the joint and leave the overhang hanging on its own plate.
//   Cells: u=0..width-1, v=0..1 (0..2 deep), plates y..y+2.
//   Returns { feats, top (= y+3) }.
// H.dish(ctx, x, z, y, { size = 2, color = 'LIGHT_GREY', mastColor })
//   A radar dish 4740 (2x2) or 3960 (4x4) on a 1x1 round brick mast at (x, z): dish at y+3 covering x..x+1,
//   z..z+1 (4x4: x-1..x+2, z-1..z+2). Returns { feats, top }.
// H.grilleBumper(ctx, x, z, y, { width = 2, color = 'DARK_GREY', face })
//   Grille tiles 2412 along a bumper row: u=0..width-1, v=0, plate y (on the caller's plate below).
//   Returns { feats }.
// H.roundCorners(ctx, x0, x1, z0, z1, y, color)
//   Quarter-round tiles 25269 on the four corners of a rectangle at plate y. Returns { feats }.
//
// ── Rendering notes ───────────────────────────────────────────────────────────────────────────────────────────
// Footprints are always axis-aligned and closed. Where a part is shown tilted (an open jaw, a swept wing) only
// its render pose changes (rotX/rotY plus dx/dz/dy shifts); the footprint is the part at rest, so the overlap and
// connectivity checks see a buildable model. Wheels and standing propellers keep a footprint the size of their
// tyre/blade envelope and are centred in it with `dy`.
window.FORGE = window.FORGE || { builders: [], helpers: {} };
window.FORGE.modules = window.FORGE.modules || {};

(() => {
    const H = window.FORGE.helpers, M = window.FORGE.modules;
    const PI = Math.PI, PLATE = 0.4;
    const def = (id) => window.LEGO_PARTS[id];

    /* ── plates we stock, for filling runs ───────────────────── */
    const PLATES = {
        LEN: [10, 8, 6, 4, 3, 2, 1],
        one: { 1: '3024', 2: '3023', 3: '3623', 4: '3710', 6: '3666', 8: '3460', 10: '4477' },
        two: { 2: '3022', 3: '3021', 4: '3020', 6: '3795', 8: '3034', 10: '3832' },
        split(n) {
            if (this.LEN.includes(n)) return [[0, n]];
            let a = this.LEN.find((l) => l < n && this.LEN.includes(n - l)); if (a === undefined) a = 10;
            return [[0, a], ...this.split(n - a).map(([o, l]) => [a + o, l])];
        },
    };

    /* ── local frames: u across, v forward, mapped onto the grid by `face` ── */
    const FACES = {
        front: { a: 1, b: 0, c: 0, d: 1, r: 0 },
        back: { a: -1, b: 0, c: 0, d: -1, r: PI },
        right: { a: 0, b: 1, c: -1, d: 0, r: PI / 2 },
        left: { a: 0, b: -1, c: 1, d: 0, r: -PI / 2 },
    };
    const frame = (g, x0, z0, face) => {
        const F = FACES[face] || FACES.front;
        const map = (u, v) => [x0 + F.a * u + F.b * v, z0 + F.c * u + F.d * v];
        return {
            face: F === FACES.front ? 'front' : face, rotY: F.r,
            /** The grid cell of local (u, v). */
            cell: (u, v) => map(u, v),
            /** The grid box of a local box at corner (u, v) with w studs along u and l along v. */
            box(u, v, w, l) {
                const [xa, za] = map(u, v), [xb, zb] = map(u + w - 1, v + l - 1);
                return { x0: Math.min(xa, xb), z0: Math.min(za, zb), w: Math.abs(xb - xa) + 1, l: Math.abs(zb - za) + 1 };
            },
            /**
             * Place a part at local corner (u, v), plate y. `o.w`/`o.l` are its local extent along u/v (defaults
             * from the catalog: width along u, length along v), `o.rotY` its local rotation, `o.du`/`o.dv` local
             * render shifts, `o.links` local cells [u, y, v].
             */
            part(id, color, u, v, y, o = {}) {
                const d = def(id), swap = Math.abs(Math.sin(o.rotY || 0)) > 0.5;
                const w = o.w || (swap ? d.length : d.width), l = o.l || (swap ? d.width : d.length);
                const b = this.box(u, v, w, l);
                const opts = { ...o, rotY: o.abs ? (o.rotY || 0) : (o.rotY || 0) + F.r, w: b.w, l: b.l, dx: F.a * (o.du || 0) + F.b * (o.dv || 0), dz: F.c * (o.du || 0) + F.d * (o.dv || 0), links: o.links && o.links.map(([lu, ly, lv]) => { const [lx, lz] = map(lu, lv); return [lx, ly, lz]; }) };
                delete opts.du; delete opts.dv; delete opts.abs;
                g.part(id, color, b.x0, b.z0, y, opts);
                return b;
            },
            /** A run of 1xN plates along u from (u, v), `len` studs. */
            strip(color, u, v, y, len) {
                for (const [off, n] of PLATES.split(len)) this.part(PLATES.one[n], color, u + off, v, y, { rotY: n > 1 ? PI / 2 : 0, w: n, l: 1 });
            },
            /** Clear painted cells of a local box. */
            clear(u, v, w, l, y0, y1) { const b = this.box(u, v, w, l); g.clear(b.x0, b.x0 + b.w - 1, b.z0, b.z0 + b.l - 1, y0, y1); },
            set(u, v, y, color, opts) { const [x, z] = map(u, v); g.set(x, y, z, color, opts); },
        };
    };

    /*
     * Render poses for parts that do not sit flat. The viewer applies rotations as Rx·Ry·Rz (world X last), so a
     * part standing on its side needs a different combination per face; these are absolute (`abs`), the frame's
     * own rotY is not added. All three mark the part as lying for the viewer (geometry centred, raised by width/2),
     * which the callers compensate with `dy`.
     */
    const fb = (fr) => fr.face === 'front' || fr.face === 'back';
    /** A 1xN tile/plate standing on its side, its length along u, its face toward +v. */
    const sideways = (fr) => ({ abs: true, lie: true, ...(fb(fr) ? { rotY: PI / 2, rotX: fr.face === 'front' ? PI / 2 : -PI / 2 } : { rotY: 0, rotZ: fr.face === 'right' ? -PI / 2 : PI / 2 }) });
    /** A bar (vertical in the catalog) lying along v. */
    const alongV = (fr) => ({ abs: true, lie: true, ...(fb(fr) ? { rotY: 0, rotX: fr.face === 'front' ? PI / 2 : -PI / 2 } : { rotY: 0, rotZ: fr.face === 'right' ? -PI / 2 : PI / 2 }) });
    /** A flat part (a propeller) stood upright with its length vertical and its face toward +v. */
    const upright = (fr) => ({ abs: true, lie: true, rotY: 0, rotX: fb(fr) ? (fr.face === 'front' ? PI / 2 : -PI / 2) : PI / 2, rotZ: fb(fr) ? 0 : (fr.face === 'right' ? -PI / 2 : PI / 2) });

    /**
     * Render options for a part shown tilted about a horizontal hinge while its footprint stays at rest.
     * The viewer treats any rotX as "lying" (geometry centred on the body, raised by width/2), so the shift
     * puts the body centre back where it belongs: `dist`/`rise` are the part centre's offset from the hinge
     * axis (studs forward, units up); `angle` > 0 drops the far end.
     */
    const tilt = (id, angle, dist, rise, back) => {
        const d = def(id), s = Math.sin(angle), c = Math.cos(angle);
        const nz = dist * c + rise * s, ny = -dist * s + rise * c;   // the centre after rotating about the axis
        return { rotX: back ? -angle : angle, dv: nz - dist, dy: (d.height / 2 - 0.48 * d.width + (ny - rise)) / PLATE };
    };

    /** A layer of plates over a box, 2-wide pieces along one axis (the chassis and wing layers). */
    const layer = (g, x0, x1, z0, z1, y, color, alongX) => {
        const W = x1 - x0 + 1, D = z1 - z0 + 1;
        const span = alongX ? W : D, rows = alongX ? D : W, pieces = PLATES.split(span);
        for (let r = 0; r < rows;) {
            const dbl = r + 1 < rows;
            for (const [off, len] of pieces) {
                const id = dbl ? (len === 1 ? '3023' : PLATES.two[len]) : PLATES.one[len];
                const w = alongX ? len : (dbl ? 2 : 1), l = alongX ? (dbl ? 2 : 1) : len;
                const d = def(id), rotY = d.width === w && d.length === l ? 0 : PI / 2;
                g.part(id, color, alongX ? x0 + off : x0 + r, alongX ? z0 + r : z0 + off, y, { rotY, w, l });
            }
            r += dbl ? 2 : 1;
        }
    };

    /* ── 1. axles and wheels ─────────────────────────────────── */
    const WHEELS = {
        small: { wheel: '4624', tyre: '3641' },
        medium: { wheel: '6014', tyre: '6015' },
        large: { wheel: '56904', tyre: '56898' },
        train: { wheel: '55423', tyre: null },
    };
    /**
     * The footprint one wheel (with its tyre) takes, from the real tyre sizes (w = thickness along X, l = studs
     * along Z, hp = plates tall), so nothing is built through it: 15 mm (small), 21 mm (medium), 43 mm (large),
     * a 2-stud train wheel.
     */
    const ENVELOPE = { small: { w: 1, l: 2, hp: 5 }, medium: { w: 1, l: 3, hp: 7 }, large: { w: 2, l: 5, hp: 14 }, train: { w: 1, l: 2, hp: 6 } };
    const envelope = (size) => ENVELOPE[size] || ENVELOPE.small;
    const clearance = (size) => Math.floor(envelope(size).hp / 2);

    H.axle = (ctx, x0, z, y, o = {}) => {
        const { g, P } = ctx;
        const width = Math.max(2, o.width || 2), size = WHEELS[o.size] ? o.size : 'small', color = o.color || P.dark || 'DARK_GREY';
        const s = WHEELS[size], env = envelope(size), tyre = o.tyre !== false && !!s.tyre;
        const plateCells = [];
        // The axle plate(s): pins at both outer ends of the chassis.
        if (width === 2) { g.part('4600', color, x0, z, y); }
        else if (width === 4) { g.part('2926', color, x0, z, y, { rotY: PI / 2, w: 4, l: 1 }); g.part('3710', color, x0, z + 1, y, { rotY: PI / 2, w: 4, l: 1 }); }
        else if (width === 3) { g.part('4600', color, x0, z, y); g.part('3023', color, x0 + 2, z, y); }
        else {
            g.part('4600', color, x0, z, y); g.part('4600', color, x0 + width - 2, z, y);
            for (let zz = z; zz <= z + 1; zz++) for (const [off, n] of PLATES.split(width - 4)) g.part(PLATES.one[n], color, x0 + 2 + off, zz, y, { rotY: n > 1 ? PI / 2 : 0, w: n, l: 1 });
        }
        for (let x = x0; x < x0 + width; x++) plateCells.push([x, y, z]);
        // Wheels: the footprint is the tyre's envelope, centred on the pin (half a plate up when it is even).
        const y0 = y - Math.floor(env.hp / 2), even = env.hp % 2 === 0 ? 0.5 : 0;
        const z0 = z - Math.floor((env.l - 2) / 2);
        const wheelCells = [];
        for (const [wx, pin] of [[x0 - env.w, [x0, y, z]], [x0 + width, [x0 + width - 1, y, z]]]) {
            const wd = def(s.wheel);
            g.part(s.wheel, o.wheelColor || 'LIGHT_GREY', wx, z0, y0, { w: env.w, l: env.l, hp: env.hp, dy: (env.hp - wd.height / PLATE) / 2 + even, links: [pin] });
            if (tyre) { const td = def(s.tyre); g.part(s.tyre, o.tyreColor || 'BLACK', wx, z0, y0, { w: env.w, l: env.l, hp: env.hp, dy: (env.hp - td.height / PLATE) / 2 + even, links: [[wx, y0 + Math.floor(env.hp / 2), z]] }); }
            wheelCells.push([wx, y0, z0]);
        }
        const feats = [size === 'large' ? 'big rubber-tyred wheels on axle plates' : size === 'train' ? 'flanged train wheels on axle plates' : 'wheels with rubber tyres on axle plates'];
        return { feats, clearance: clearance(size), plateCells, wheelCells, hp: env.hp, ww: env.w, y0 };
    };
    H.axle.clearance = clearance;
    H.axle.envelope = envelope;

    /* ── 2. chassis ──────────────────────────────────────────── */
    H.chassis = (ctx, x0, z0, width, length, y, o = {}) => {
        const { g, P } = ctx;
        const size = WHEELS[o.size] ? o.size : 'small', color = o.color || P.dark || 'DARK_GREY';
        const env = envelope(size), cl = clearance(size), yA = y + cl;
        const x1 = x0 + width - 1, z1 = z0 + length - 1;
        const axles = (o.axles && o.axles.length ? o.axles : [1, length - 3]).map((z) => z0 + z).filter((z) => z >= z0 && z + 1 <= z1);
        // Big wheels are 5 deep: keep neighbouring axles from running into each other.
        const taken = new Set(), results = [];
        for (const z of axles) {
            const zl = z - Math.floor((env.l - 2) / 2), zr = zl + env.l - 1;
            let ok = true; for (let zz = zl; zz <= zr; zz++) if (taken.has(zz)) ok = false;
            if (!ok) continue;
            for (let zz = zl; zz <= zr; zz++) taken.add(zz);
            results.push(H.axle(ctx, x0, z, yA, { width, size, color, tyre: o.tyre, tyreColor: o.tyreColor, wheelColor: o.wheelColor }));
        }
        // Layer one: the rows between the axle plates, as 1xN plates across the width.
        const axleRows = new Set(); for (const z of axles) { axleRows.add(z); axleRows.add(z + 1); }
        for (let z = z0; z <= z1; z++) if (!axleRows.has(z)) for (const [off, n] of PLATES.split(width)) g.part(PLATES.one[n], color, x0 + off, z, yA, { rotY: n > 1 ? PI / 2 : 0, w: n, l: 1 });
        // Layer two runs the other way, so the chassis is one stud-locked slab.
        layer(g, x0, x1, z0, z1, yA + 1, o.color2 || color, false);
        const feats = results.length ? results[0].feats.slice() : [];
        feats.push('a plate chassis');
        return { feats, top: yA + 2, clearance: cl, yAxle: yA, x0, x1, z0, z1, xLeft: x0 - env.w, xRight: x1 + env.w, axles: results };
    };

    /* ── 3. hinged jaw ───────────────────────────────────────── */
    H.hingeJaw = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx, fr = frame(g, x, z, o.face);
        const width = o.width === 1 ? 1 : 2, length = Math.min(10, Math.max(3, o.length || 4)), color = o.color || P.primary, teeth = o.teeth === null ? null : (o.teeth || 'WHITE');
        const open = Math.max(0, Math.min(1, o.open === undefined ? 0.25 : o.open)), angle = open * 0.45;
        const tiltable = angle > 0 && (fr.face === 'front' || fr.face === 'back'), back = fr.face === 'back';
        // Hinge bricks: a base per column, one top plate linked to them.
        const hingeCells = [];
        for (let u = 0; u < width; u++) { fr.part('3937', color, u, 0, y, { w: 1, l: 2 }); hingeCells.push(fr.cell(u, 0)); }
        const links = []; for (let u = 0; u < width; u++) links.push([u, y + 2, 0]);
        const topOpts = { w: width, l: 2, links };
        if (tiltable) Object.assign(topOpts, tilt(width === 2 ? '6134' : '3938', angle, 0.5, 0.2, back));
        fr.part(width === 2 ? '6134' : '3938', color, 0, 0, y + 3, topOpts);
        // The jaw plate on the hinge top, cantilevering forward, with teeth on its tip. When the length needs two
        // plates the short one goes at the hinge, so the long one still reaches the hinge top's studs.
        const pieces = PLATES.split(length);
        if (pieces.length > 1) { const [a, b] = pieces; pieces[0] = [0, b[1]]; pieces[1] = [b[1], a[1]]; }
        for (const [off, n] of pieces) {
            const id = width === 2 ? (n === 1 ? '3023' : PLATES.two[n]) : PLATES.one[n];
            const opts = { w: width, l: n, rotY: width === 2 && n === 1 ? PI / 2 : 0 };
            if (tiltable) Object.assign(opts, tilt(id, angle, off + (n - 1) / 2 - 0.5, 0.4, back));
            fr.part(id, color, 0, off, y + 4, opts);
        }
        if (teeth) for (let u = 0; u < width; u++) {
            const opts = { w: 1, l: 1, rotY: PI };
            if (tiltable) Object.assign(opts, tilt('54200', angle, length - 1.5, 1.0, back));
            fr.part('54200', teeth, u, length - 1, y + 5, opts);
        }
        return { feats: [open > 0 ? 'a hinged lower jaw, shown open' : 'a hinged lower jaw'], hingeCells, top: y + 4, tip: fr.cell(0, length - 1) };
    };

    /* ── 4. hinged wing ──────────────────────────────────────── */
    H.hingedWing = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx, fr = frame(g, x, z, o.face);
        const span = Math.max(4, o.span || 6), side = o.side === -1 ? -1 : 1, color = o.color || P.primary, sweep = o.sweep || 0;
        // s runs outward along the wing from the root column (s = 0); side -1 mirrors it onto -u.
        const box = (s0, s1, v, l) => ({ u: Math.min(side * s0, side * s1), v, w: Math.abs(s1 - s0) + 1, l });
        // Render only: swing a piece about the swivel pin (at s = 0.5, v = 0.5) by `sweep`, keeping its footprint.
        const swung = (s0, s1, v0, l) => {
            if (!sweep) return {};
            const t = side * sweep, cu = side * ((s0 + s1) / 2 - 0.5), cv = v0 + (l - 1) / 2 - 0.5;
            return { rot: t, du: cu * Math.cos(t) + cv * Math.sin(t) - cu, dv: -cu * Math.sin(t) + cv * Math.cos(t) - cv };
        };
        const put = (id, s0, s1, v0, l, yy, rotY, extra = {}) => {
            const b = box(s0, s1, v0, l), sw = swung(s0, s1, v0, l);
            fr.part(id, color, b.u, b.v, yy, { rotY: rotY + (sw.rot || 0), w: b.w, l: b.l, du: sw.du, dv: sw.dv, ...extra });
        };
        // Swivel base inside the body (its pin at the root column), swivel top outside, linked to the base's end.
        fr.part('2429', color, box(-3, 0, 0, 1).u, 0, y, { rotY: PI / 2, w: 4, l: 1 });
        put('2430', 1, 4, 0, 1, y, PI / 2, { links: [[0, y, 0]] });
        // Wing plates over the swivel top, a wedge plate at the tip, a spar on top bridging the joints.
        for (const [off, n] of (span > 4 ? PLATES.split(span - 4) : [])) put(n === 1 ? '3023' : PLATES.two[n], 1 + off, off + n, 0, 2, y + 1, n === 1 ? 0 : PI / 2);
        put(side === 1 ? '41770' : '41769', span - 3, span, 0, 2, y + 1, side === 1 ? PI / 2 : -PI / 2);
        const sparColor = o.sparColor || P.trim || color;
        for (const [off, n] of PLATES.split(span - 3)) {
            const b = box(2 + off, 1 + off + n, 0, 1), sw = swung(2 + off, 1 + off + n, 0, 1);
            fr.part(PLATES.one[n], sparColor, b.u, b.v, y + 2, { rotY: (n > 1 ? PI / 2 : 0) + (sw.rot || 0), w: b.w, l: b.l, du: sw.du, dv: sw.dv });
        }
        return { feats: [sweep ? 'swept wings on swivel hinges' : 'wings on hinge plates with wedge tips'], root: fr.cell(0, 0), tip: fr.cell(side * span, 0) };
    };

    /* ── 5. clip-and-bar tail ────────────────────────────────── */
    H.clipTail = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx, fr = frame(g, x, z, o.face || o.direction);
        const n = Math.max(1, o.segments || 3), color = o.color || P.primary, tip = o.tip || 'slope', tipColor = o.tipColor || P.accent || color;
        let lowest = y;
        for (let i = 0; i < n; i++) {
            const yb = y - 2 * i, v = 3 * i;
            // Bar-handle plate: studs at v, v+1, the bar at v+2. The first one sits under/on the caller's body.
            fr.part('60478', color, 0, v, yb, { w: 1, l: 3 });
            // Clip plate grabbing that bar, one plate lower (the droop), its studs carrying the next bar plate.
            if (i < n - 1 || tip === 'slope') { fr.part('63868', color, 0, v + 2, yb - 1, { w: 1, l: 3, links: [[0, yb, v + 2]] }); lowest = yb - 1; }
        }
        const feats = ['a clip-and-bar tail'];
        const last = 3 * (n - 1), yl = y - 2 * (n - 1);
        if (tip === 'slope') { fr.part('54200', tipColor, 0, last + 4, yl, { w: 1, l: 1, rotY: 0 }); }
        else if (tip === 'flag') { fr.part('2335', tipColor, 0, last + 3, yl - 1, { w: 1, l: 2, hp: 4, links: [[0, yl, last + 2]] }); feats[0] = 'a clip-and-bar tail with a flag tip'; lowest = Math.min(lowest, yl - 1); }
        return { feats, root: fr.cell(0, 0), end: fr.cell(0, tip === 'slope' ? last + 4 : last + 3), lowest };
    };

    /* ── 6. turntable turret ─────────────────────────────────── */
    H.turret = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx, fr = frame(g, x, z, o.face);
        const size = o.size === 4 ? 4 : 2, color = o.color || P.primary;
        fr.part('3680', o.baseColor || P.dark || 'DARK_GREY', 0, 0, y, { w: 2, l: 2 });
        fr.part('3679', o.baseColor || P.dark || 'DARK_GREY', 0, 0, y + 1, { w: 2, l: 2, links: [[0, y, 0]] });
        // The turret block: 2x2 bricks, or a 2x4 brick lying across the turntable (one stud over each end).
        const v0 = size === 4 ? -1 : 0;
        if (size === 4) fr.part('3001', color, 0, v0, y + 2, { w: 2, l: 4 }); else fr.part('3003', color, 0, 0, y + 2, { w: 2, l: 2 });
        const feats = ['a turntable turret'];
        if (o.barrel !== false) {
            // A lying bar as the barrel, fastened into the block's front face.
            fr.part('30374', o.barrelColor || P.dark || 'DARK_GREY', 0, v0 + size, y + 3, { ...alongV(fr), w: 1, l: 4, hp: 1, dy: -0.7, links: [[0, y + 3, v0 + size - 1]] });
            feats[0] = 'a rotating turret with a barrel';
        }
        return { feats, top: y + 5, center: fr.cell(0, 0) };
    };

    /* ── 7. arches ───────────────────────────────────────────── */
    const ARCH = { 3: '6005', 4: '3659', 6: '3455', 8: '3308' };
    const archway = (ctx, x, z, y, o, glazed) => {
        const { g, P } = ctx, fr = frame(g, x, z, o.face);
        const width = ARCH[o.width] ? o.width : 4, id = ARCH[width], hp = Math.round(def(id).height / PLATE);
        const height = Math.max(1, o.height === undefined ? (glazed ? 3 : 6) : o.height), color = o.color || P.trim || P.primary;
        fr.clear(1, 0, width - 2, 1, y, y + height - 1);
        if (glazed) for (let u = 1; u <= width - 2; u++) for (let yy = y; yy < y + height; yy++) fr.set(u, 0, yy, o.glass || P.glass, { noBrick: true });
        fr.part(id, color, 0, 0, y + height, { rotY: PI / 2, w: width, l: 1, hp });
        return { feats: [glazed ? 'arched windows' : 'an arched doorway'], top: y + height + hp };
    };
    H.archDoor = (ctx, x, z, y, o = {}) => archway(ctx, x, z, y, o, false);
    H.archWindow = (ctx, x, z, y, o = {}) => archway(ctx, x, z, y, o, true);

    /* ── 8. real windows and doors ───────────────────────────── */
    const WINDOWS = { '1x2x2': ['60592', '60601'], '1x2x3': ['60593', '60602'], '1x4x3': ['3853', '3855'] };
    H.realWindow = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx, fr = frame(g, x, z, o.face);
        const [frameId, glassId] = WINDOWS[o.size] || WINDOWS['1x2x2'], d = def(frameId), hp = Math.round(d.height / PLATE);
        fr.part(frameId, o.frameColor || P.trim || 'WHITE', 0, 0, y, { rotY: PI / 2, w: d.length, l: 1, hp });
        fr.part(glassId, o.glassColor || P.glass || 'TRANS_CLEAR', 0, 0, y, { rotY: PI / 2, w: d.length, l: 1, hp, ghost: true });
        return { feats: ['real windows with glass panes'], top: y + hp };
    };
    H.realDoor = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx, fr = frame(g, x, z, o.face);
        fr.part('60596', o.frameColor || P.trim || 'WHITE', 0, 0, y, { rotY: PI / 2, w: 4, l: 1, hp: 18 });
        fr.part('60623', o.doorColor || P.accent || 'RED', 0, 0, y, { rotY: PI / 2, w: 4, l: 1, hp: 18, ghost: true });
        return { feats: ['a real door in its frame'], top: y + 18 };
    };

    /* ── 9. propellers ───────────────────────────────────────── */
    H.propeller = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx, fr = frame(g, x, z, o.face);
        const color = o.color || 'BLACK', floor = o.floor === undefined ? 0 : o.floor;
        let hubV, hubY, hubLink;
        if (o.mount === 'pin') {
            // A Technic pin pushed into the nose, the propeller on its end.
            fr.part('2780', o.hubColor || 'DARK_GREY', 0, 1, y + 1, { w: 1, l: 1, hp: 1, links: [[0, y + 1, 0]] });
            hubV = 2; hubY = y + 1; hubLink = [0, y + 1, 1];
        } else {
            // A headlight brick replaces the nose cell; its side stud carries the propeller.
            fr.part('4070', o.hubColor || P.primary, 0, 0, y, { w: 1, l: 1, hp: 3 });
            hubV = 1; hubY = y + 1; hubLink = [0, y + 1, 0];
        }
        const vertical = o.blades === 'vertical' || (o.blades !== 'horizontal' && hubY - 4 >= floor);
        if (vertical) {
            // Standing blades: a 10-plate column centred on the hub (the hub's centre is half a plate up).
            const y0 = hubY - 4;
            const dy = ((hubY + 0.5) * PLATE - 0.48 * def('4617').width) / PLATE - y0;
            fr.part('4617', color, 0, hubV, y0, { ...upright(fr), w: 1, l: 1, hp: 10, dy, links: [hubLink] });
        } else {
            fr.part('4617', color, -2, hubV, hubY, { w: 4, l: 1, hp: 1, rotY: PI / 2, du: 0.5, links: [hubLink] });
        }
        return { feats: ['a propeller on the nose'], hub: fr.cell(0, hubV), top: y + 3 };
    };
    H.rotorMast = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx;
        g.part('30374', o.color || 'BLACK', x, z, y, { w: 1, l: 1, hp: 4 });
        const bc = o.bladeColor || o.color || 'BLACK';
        g.part('4617', bc, x - 2, z, y + 4, { rotY: PI / 2, w: 4, l: 1, dx: 0.5, links: [[x, y + 3, z]] });
        let top = y + 5;
        if ((o.blades || 4) >= 4) { g.part('4617', bc, x, z - 2, y + 5, { w: 1, l: 4, dz: 0.5, links: [[x, y + 4, z]] }); top = y + 6; }
        return { feats: ['a rotor on a bar mast'], top };
    };

    /* ── 10. brackets and sideways detail ────────────────────── */
    H.bracketMount = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx, fr = frame(g, x, z, o.face);
        const down = o.dir !== 'up', part = o.part || '3069', pd = def(part);
        // 99781 is the regular bracket (its face hangs below the plate), 99780 the inverted one (the face rises).
        fr.part(down ? '99781' : '99780', o.color || P.primary, 0, 0, y, { rotY: PI / 2, w: 2, l: 1 });
        // The mounted 1x2 part stands on the flange's side studs, flush with the plate's top (down) or bottom (up).
        const y0 = down ? y - 2 : y, centre = down ? y - 0.25 : y + 1.25;
        const dy = (centre * PLATE - 0.48 * pd.width) / PLATE - y0;
        fr.part(part, o.partColor || P.accent, 0, 1, y0, { ...sideways(fr), w: 2, l: 1, hp: 3, dy, links: [[0, y, 0], [1, y, 0]] });
        return { feats: [part === '2412' ? 'a grille on a bracket' : 'bracket-mounted detail'], cells: [fr.cell(0, 1), fr.cell(1, 1)] };
    };
    H.headlight = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx, fr = frame(g, x, z, o.face);
        fr.part('4070', o.color || P.primary, 0, 0, y, { w: 1, l: 1, hp: 3 });
        const dy = ((y + 1.5) * PLATE - 0.48) / PLATE - y;
        fr.part('98138', o.lens || 'TRANS_CLEAR', 0, 1, y, { ...sideways(fr), w: 1, l: 1, hp: 3, dy, links: [[0, y + 1, 0]] });
        return { feats: ['headlights on headlight bricks'] };
    };
    H.lamp2 = (ctx, x, z, y, o = {}) => {
        const { g } = ctx, h = Math.max(1, o.height || 2), color = o.color || 'BLACK';
        for (let i = 0; i < h; i++) g.part('30374', color, x, z, y + 4 * i, { w: 1, l: 1, hp: 4 });
        H.headlight(ctx, x, z, y + 4 * h, { face: o.face, color, lens: o.lens || 'TRANS_ORANGE' });
        return { feats: ['a lamp post with a bar stem'], top: y + 4 * h + 3 };
    };

    /* ── 11. fences, flag poles ──────────────────────────────── */
    H.fence = (ctx, x0, z0, length, axis, y, color) => {
        const { g, P } = ctx, c = color || 'WHITE', alongX = axis === 'x';
        const at = (i) => (alongX ? [x0 + i, z0] : [x0, z0 + i]);
        let i = 0;
        for (; i + 4 <= length; i += 4) {
            const [ax, az] = at(i), [bx, bz] = at(i + 3);
            g.part('3024', c, ax, az, y); g.part('3024', c, bx, bz, y);
            g.part('3185', c, ax, az, y + 1, { rotY: alongX ? PI / 2 : 0, w: alongX ? 4 : 1, l: alongX ? 1 : 4, hp: 6 });
        }
        for (; i < length; i++) { const [ax, az] = at(i); g.part('3024', c, ax, az, y); g.part('3005', c, ax, az, y + 1); }
        return { feats: ['a picket fence'] };
    };
    H.flagPole = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx, h = Math.max(1, o.height || 2), color = o.color || 'DARK_GREY';
        for (let i = 0; i < h; i++) g.part('30374', color, x, z, y + 4 * i, { w: 1, l: 1, hp: 4 });
        const yt = y + 4 * (h - 1);
        g.part('2335', o.flag || P.accent || 'RED', x, z + 1, yt, { w: 1, l: 2, hp: 4, links: [[x, yt, z]] });
        return { feats: ['a flag on a bar pole'], top: y + 4 * h };
    };

    /* ── 12. wedge nose ──────────────────────────────────────── */
    H.wedgeNose = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx, fr = frame(g, x, z, o.face);
        const width = Math.max(4, (o.width || 4) - ((o.width || 4) % 2)), color = o.color || P.primary, back = o.overlap === undefined ? 1 : o.overlap;
        const v0 = -back, L = 3;
        fr.part('43722', color, 0, v0, y, { w: 2, l: L });
        fr.part('43723', color, width - 2, v0, y, { w: 2, l: L });
        for (let u = 2; u < width - 2; u += 2) fr.part('3021', color, u, v0, y, { w: 2, l: L });
        return { feats: ['a tapered wedge-plate nose'], tip: fr.cell(width / 2 - 1, v0 + L - 1) };
    };

    /* ── extras: curved roofs, overhangs, dishes, grilles, corners ── */
    H.curvedRoof = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx, fr = frame(g, x, z, o.face), width = Math.max(1, o.width || 2), color = o.color || P.primary;
        let u = 0;
        for (; u + 2 <= width; u += 2) fr.part('15068', color, u, 0, y, { w: 2, l: 2, hp: 2 });
        if (u < width) fr.part('11477', color, u, 0, y, { w: 1, l: 2, hp: 2 });
        return { feats: ['curved slopes'] };
    };
    H.overhang = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx, fr = frame(g, x, z, o.face), width = Math.max(1, o.width || 2), color = o.color || P.primary;
        let u = 0;
        if (o.deep) { for (; u + 2 <= width; u += 2) fr.part('3747', color, u, 0, y, { w: 2, l: 3, hp: 3 }); }
        else for (; u + 2 <= width; u += 2) fr.part('3660', color, u, 0, y, { w: 2, l: 2, hp: 3 });
        for (; u < width; u++) fr.part('3665', color, u, 0, y, { w: 1, l: 2, hp: 3 });
        return { feats: ['inverted slopes under the overhang'], top: y + 3 };
    };
    H.dish = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx, big = o.size === 4, color = o.color || 'LIGHT_GREY';
        g.part('3062', o.mastColor || P.dark || 'DARK_GREY', x, z, y);
        if (big) g.part('3960', color, x - 1, z - 1, y + 3, { w: 4, l: 4, hp: 2 }); else g.part('4740', color, x, z, y + 3, { w: 2, l: 2, hp: 1 });
        return { feats: ['a radar dish'], top: y + 3 + (big ? 2 : 1) };
    };
    H.grilleBumper = (ctx, x, z, y, o = {}) => {
        const { g, P } = ctx, fr = frame(g, x, z, o.face), width = Math.max(1, o.width || 2), color = o.color || 'DARK_GREY';
        let u = 0;
        for (; u + 2 <= width; u += 2) fr.part('2412', color, u, 0, y, { w: 2, l: 1, rotY: PI / 2 });
        if (u < width) fr.part('3070', color, u, 0, y, { w: 1, l: 1 });
        return { feats: ['a grille bumper'] };
    };
    H.roundCorners = (ctx, x0, x1, z0, z1, y, color) => {
        const { g, P } = ctx, c = color || P.primary;
        g.part('25269', c, x0, z0, y, { rotY: PI }); g.part('25269', c, x1, z0, y, { rotY: PI / 2 });
        g.part('25269', c, x0, z1, y, { rotY: -PI / 2 }); g.part('25269', c, x1, z1, y, { rotY: 0 });
        return { feats: ['rounded corners'] };
    };

    /* ── the module registry (for blueprints and the Claude route) ── */
    const place = (id, title, describe, params, fn) => { M[id] = { id, title, describe, params, build: fn }; };
    const base = [{ id: 'x', type: 'int' }, { id: 'z', type: 'int' }, { id: 'y', type: 'int', note: 'plates' }];
    const faced = [{ id: 'face', type: 'choice', choices: ['front', 'back', 'left', 'right'], default: 'front' }];
    place('axle', 'Axle with wheels', 'An axle plate inside a chassis with a wheel and tyre on each side.', [...base, { id: 'width', type: 'int', default: 2 }, { id: 'size', type: 'choice', choices: ['small', 'medium', 'large', 'train'], default: 'small' }, { id: 'color', type: 'color' }], (ctx, p) => H.axle(ctx, p.x, p.z, p.y, p));
    place('chassis', 'Wheeled chassis', 'A two-layer plate chassis on axles; build the body on `top`.', [...base, { id: 'width', type: 'int', default: 4 }, { id: 'length', type: 'int', default: 10 }, { id: 'axles', type: 'int[]' }, { id: 'size', type: 'choice', choices: ['small', 'medium', 'large', 'train'], default: 'small' }, { id: 'color', type: 'color' }], (ctx, p) => H.chassis(ctx, p.x, p.z, p.width || 4, p.length || 10, p.y, p));
    place('hingeJaw', 'Hinged jaw', 'A lower jaw on hinge bricks with teeth, shown slightly open.', [...base, { id: 'length', type: 'int', default: 4 }, { id: 'width', type: 'int', default: 2 }, { id: 'open', type: 'number', default: 0.25 }, { id: 'color', type: 'color' }, ...faced], (ctx, p) => H.hingeJaw(ctx, p.x, p.z, p.y, p));
    place('hingedWing', 'Hinged wing', 'A wing on a swivel hinge plate pair with a wedge tip.', [...base, { id: 'span', type: 'int', default: 6 }, { id: 'side', type: 'choice', choices: [1, -1], default: 1 }, { id: 'sweep', type: 'number', default: 0 }, { id: 'color', type: 'color' }, ...faced], (ctx, p) => H.hingedWing(ctx, p.x, p.z, p.y, p));
    place('clipTail', 'Clip-and-bar tail', 'A drooping tail of bar-handle and clip plates.', [...base, { id: 'segments', type: 'int', default: 3 }, { id: 'tip', type: 'choice', choices: ['slope', 'flag'], default: 'slope' }, { id: 'color', type: 'color' }, ...faced], (ctx, p) => H.clipTail(ctx, p.x, p.z, p.y, p));
    place('turret', 'Turntable turret', 'A turntable with a brick turret and a bar barrel.', [...base, { id: 'size', type: 'choice', choices: [2, 4], default: 2 }, { id: 'barrel', type: 'bool', default: true }, { id: 'color', type: 'color' }, ...faced], (ctx, p) => H.turret(ctx, p.x, p.z, p.y, p));
    place('archDoor', 'Arched doorway', 'A doorway cut into a painted wall with an arch across its top.', [...base, { id: 'width', type: 'choice', choices: [3, 4, 6, 8], default: 4 }, { id: 'height', type: 'int', default: 6 }, { id: 'color', type: 'color' }, ...faced], (ctx, p) => H.archDoor(ctx, p.x, p.z, p.y, p));
    place('archWindow', 'Arched window', 'A glazed arched opening in a painted wall.', [...base, { id: 'width', type: 'choice', choices: [3, 4, 6, 8], default: 4 }, { id: 'height', type: 'int', default: 3 }, { id: 'color', type: 'color' }, ...faced], (ctx, p) => H.archWindow(ctx, p.x, p.z, p.y, p));
    place('realWindow', 'Window with glass', 'A window frame and pane set into a painted wall.', [...base, { id: 'size', type: 'choice', choices: ['1x2x2', '1x2x3', '1x4x3'], default: '1x2x2' }, { id: 'frameColor', type: 'color' }, { id: 'glassColor', type: 'color' }, ...faced], (ctx, p) => H.realWindow(ctx, p.x, p.z, p.y, p));
    place('realDoor', 'Door in a frame', 'A door frame with its door set into a painted wall.', [...base, { id: 'frameColor', type: 'color' }, { id: 'doorColor', type: 'color' }, ...faced], (ctx, p) => H.realDoor(ctx, p.x, p.z, p.y, p));
    place('propeller', 'Nose propeller', 'A propeller on a headlight-brick stud or a Technic pin at a nose cell.', [...base, { id: 'mount', type: 'choice', choices: ['headlight', 'pin'], default: 'headlight' }, { id: 'blades', type: 'choice', choices: ['auto', 'vertical', 'horizontal'], default: 'auto' }, { id: 'color', type: 'color' }, ...faced], (ctx, p) => H.propeller(ctx, p.x, p.z, p.y, p));
    place('rotorMast', 'Rotor mast', 'A bar mast with crossed rotor blades for a helicopter.', [...base, { id: 'blades', type: 'choice', choices: [2, 4], default: 4 }, { id: 'color', type: 'color' }], (ctx, p) => H.rotorMast(ctx, p.x, p.z, p.y, p));
    place('bracketMount', 'Bracket detail', 'A bracket with a sideways tile, plate or grille on its face.', [...base, { id: 'part', type: 'choice', choices: ['3069', '3023', '2412'], default: '3069' }, { id: 'dir', type: 'choice', choices: ['down', 'up'], default: 'down' }, { id: 'color', type: 'color' }, { id: 'partColor', type: 'color' }, ...faced], (ctx, p) => H.bracketMount(ctx, p.x, p.z, p.y, p));
    place('headlight', 'Headlight', 'A headlight brick with a trans round tile on its side stud.', [...base, { id: 'color', type: 'color' }, { id: 'lens', type: 'color', default: 'TRANS_CLEAR' }, ...faced], (ctx, p) => H.headlight(ctx, p.x, p.z, p.y, p));
    place('lamp2', 'Lamp post', 'A bar-stem lamp post with a headlight-brick lantern.', [...base, { id: 'height', type: 'int', default: 2 }, { id: 'color', type: 'color' }, { id: 'lens', type: 'color', default: 'TRANS_ORANGE' }, ...faced], (ctx, p) => H.lamp2(ctx, p.x, p.z, p.y, p));
    place('fence', 'Fence', 'Fence panels on plate posts along one axis.', [...base, { id: 'length', type: 'int', default: 8 }, { id: 'axis', type: 'choice', choices: ['x', 'z'], default: 'x' }, { id: 'color', type: 'color' }], (ctx, p) => H.fence(ctx, p.x, p.z, p.length || 8, p.axis || 'x', p.y, p.color));
    place('flagPole', 'Flag pole', 'Stacked bars with a flag clipped on top.', [...base, { id: 'height', type: 'int', default: 2 }, { id: 'color', type: 'color' }, { id: 'flag', type: 'color' }], (ctx, p) => H.flagPole(ctx, p.x, p.z, p.y, p));
    place('wedgeNose', 'Wedge nose', 'A tapered nose or bow from wedge plates.', [...base, { id: 'width', type: 'int', default: 4 }, { id: 'overlap', type: 'int', default: 1 }, { id: 'color', type: 'color' }, ...faced], (ctx, p) => H.wedgeNose(ctx, p.x, p.z, p.y, p));
    place('curvedRoof', 'Curved roof edge', 'Curved slopes along an edge, sloping forward.', [...base, { id: 'width', type: 'int', default: 2 }, { id: 'color', type: 'color' }, ...faced], (ctx, p) => H.curvedRoof(ctx, p.x, p.z, p.y, p));
    place('overhang', 'Inverted-slope overhang', 'Inverted slopes under a balcony or wing edge.', [...base, { id: 'width', type: 'int', default: 2 }, { id: 'deep', type: 'bool', default: false }, { id: 'color', type: 'color' }, ...faced], (ctx, p) => H.overhang(ctx, p.x, p.z, p.y, p));
    place('dish', 'Radar dish', 'A dish on a round-brick mast.', [...base, { id: 'size', type: 'choice', choices: [2, 4], default: 2 }, { id: 'color', type: 'color' }], (ctx, p) => H.dish(ctx, p.x, p.z, p.y, p));
    place('grilleBumper', 'Grille bumper', 'Grille tiles along a bumper row.', [...base, { id: 'width', type: 'int', default: 2 }, { id: 'color', type: 'color' }, ...faced], (ctx, p) => H.grilleBumper(ctx, p.x, p.z, p.y, p));
    place('roundCorners', 'Rounded corners', 'Quarter-round tiles on the four corners of a rectangle.', [{ id: 'x0', type: 'int' }, { id: 'x1', type: 'int' }, { id: 'z0', type: 'int' }, { id: 'z1', type: 'int' }, { id: 'y', type: 'int' }, { id: 'color', type: 'color' }], (ctx, p) => H.roundCorners(ctx, p.x0, p.x1, p.z0, p.z1, p.y, p.color));
})();
