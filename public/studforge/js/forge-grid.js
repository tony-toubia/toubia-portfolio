// StudForge grid: a stud-aligned voxel canvas that becomes real LEGO parts.
//
// Builders paint coloured cells into the grid (x, z in studs; y in plates) and
// drop explicit detail parts (slopes, cones, windows, wheels) where they want
// them. `tile()` then turns the painted cells into actual bricks and plates:
//   - where three plates of the same colour stack, it uses a brick;
//   - it tiles each layer greedily with the largest part that fits, alternating
//     the preferred orientation and scan direction every brick row so the
//     seams stagger like a real wall (a running bond) instead of stacking;
//   - whatever is left becomes plates.
// The result is a plain list of placements the viewer and the parts list read.
(() => {
    const PLATE = 0.4;
    const key = (x, y, z) => `${x},${y},${z}`;

    // The tiler builds like a real set: nothing bigger than a 2x4 brick or a
    // 2x6 plate in the body of a model. Only the lowest layer may use the big
    // base plates.
    let BRICK_SIZES = null, PLATE_SIZES = null, BASE_SIZES = null;
    const sizes = (category, maxArea) => {
        const out = [];
        for (const p of Object.values(window.LEGO_PARTS)) {
            if (p.category !== category || p.isRound || p.width * p.length > maxArea) continue;
            out.push({ dx: p.width, dz: p.length, id: p.id, rotY: 0 });
            if (p.width !== p.length) out.push({ dx: p.length, dz: p.width, id: p.id, rotY: Math.PI / 2 });
        }
        return out;
    };

    class ForgeGrid {
        constructor() {
            this.cells = new Map();
            this.res = new Set();      // cells taken by explicit parts
            this.parts = [];
            if (!BRICK_SIZES) { BRICK_SIZES = sizes('Bricks', 8); PLATE_SIZES = sizes('Plates', 12); BASE_SIZES = sizes('Plates', 48); }
        }

        /* ── painting ─────────────────────────────────────────── */

        set(x, y, z, color, opts) {
            if (!color) return;
            const k = key(x, y, z);
            if (this.res.has(k)) return;
            this.cells.set(k, { x, y, z, color, noBrick: !!(opts && opts.noBrick) });
        }
        get(x, y, z) { return this.cells.get(key(x, y, z)) || null; }
        has(x, y, z) { return this.cells.has(key(x, y, z)) || this.res.has(key(x, y, z)); }
        del(x, y, z) { this.cells.delete(key(x, y, z)); }

        /** Solid box, inclusive on every axis. */
        box(x0, x1, z0, z1, y0, y1, color, opts) {
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) this.set(x, y, z, color, opts);
        }
        /** Just the walls of a box (hollow inside, like a real building). */
        shell(x0, x1, z0, z1, y0, y1, color, opts) {
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
                if (x === x0 || x === x1 || z === z0 || z === z1) this.set(x, y, z, color, opts);
            }
        }
        /** A filled circle of cells around a stud centre. */
        disc(cx, cz, r, y0, y1, color, opts) {
            for (let y = y0; y <= y1; y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
                if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r + 0.01) this.set(x, y, z, color, opts);
            }
        }
        /** A ring: the cells of disc(r) not in disc(r - 1). */
        ring(cx, cz, r, y0, y1, color, opts) {
            for (let y = y0; y <= y1; y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
                const d = (x - cx) ** 2 + (z - cz) ** 2;
                if (d <= r * r + 0.01 && d > (r - 1) ** 2 + 0.01) this.set(x, y, z, color, opts);
            }
        }
        clear(x0, x1, z0, z1, y0, y1) {
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) this.del(x, y, z);
        }
        /** Paint only where nothing is yet. */
        fillEmpty(x0, x1, z0, z1, y0, y1, color, opts) {
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (!this.has(x, y, z)) this.set(x, y, z, color, opts);
        }

        /**
         * An explicit part at stud corner (x0, z0) and plate y0. `w`/`l` are its
         * footprint along X/Z after rotation (default from the catalog), `hp` how
         * many plates tall it is. The cells it covers are cleared and reserved.
         */
        part(partId, color, x0, z0, y0, o = {}) {
            const def = window.LEGO_PARTS[partId];
            if (!def) throw new Error('unknown part ' + partId);
            const rotY = o.rotY || 0;
            const swap = Math.abs(Math.sin(rotY)) > 0.5;
            const w = o.w || (swap ? def.length : def.width), l = o.l || (swap ? def.width : def.length);
            const hp = o.hp || Math.max(1, Math.round((o.lie ? def.width : def.height) / PLATE));
            for (let y = y0; y < y0 + hp; y++) for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + l; z++) {
                this.del(x, y, z); this.res.add(key(x, y, z));
            }
            // dx/dz shift the rendered part by a fraction of a stud (a 1x1 on a 2x2 cone's single centre stud); the footprint stays put.
            this.parts.push({ partId, color, x: x0 + (w - 1) / 2 + (o.dx || 0), y: y0 * PLATE, z: z0 + (l - 1) / 2 + (o.dz || 0), rotY, rotX: o.rotX || 0, rotZ: o.rotZ || 0, layer: y0, dx: o.dx || 0, dz: o.dz || 0, fp: { x0, z0, y0, w, l, hp } });
        }

        /* ── reading ──────────────────────────────────────────── */

        bounds() {
            let b = null;
            const grow = (x, y, z) => {
                if (!b) b = { x0: x, x1: x, y0: y, y1: y, z0: z, z1: z };
                b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z);
            };
            for (const c of this.cells.values()) grow(c.x, c.y, c.z);
            for (const k of this.res) { const [x, y, z] = k.split(',').map(Number); grow(x, y, z); }
            return b || { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 };
        }
        /** The highest filled plate at a stud, or -1. */
        top(x, z) {
            let t = -1;
            for (const c of this.cells.values()) if (c.x === x && c.z === z && c.y > t) t = c.y;
            for (const k of this.res) { const [kx, ky, kz] = k.split(',').map(Number); if (kx === x && kz === z && ky > t) t = ky; }
            return t;
        }

        /* ── tiling ───────────────────────────────────────────── */

        tile() {
            const out = [], used = new Set();
            const byY = new Map();
            for (const c of this.cells.values()) { if (!byY.has(c.y)) byY.set(c.y, []); byY.get(c.y).push(c); }
            const avail = (x, y, z) => { const k = key(x, y, z); return used.has(k) ? null : (this.cells.get(k) || null); };
            const place = (sz, x0, z0, y0, color, hp) => {
                for (let d = 0; d < hp; d++) for (let x = x0; x < x0 + sz.dx; x++) for (let z = z0; z < z0 + sz.dz; z++) used.add(key(x, y0 + d, z));
                out.push({ partId: sz.id, color, x: x0 + (sz.dx - 1) / 2, y: y0 * PLATE, z: z0 + (sz.dz - 1) / 2, rotY: sz.rotY, layer: y0, fp: { x0, z0, y0, w: sz.dx, l: sz.dz, hp } });
            };
            const greedy = (cells, y, preferX, flip, list, ok, hp) => {
                const sorted = list.slice().sort((a, b) => (b.dx * b.dz - a.dx * a.dz) || ((preferX ? b.dx - b.dz : b.dz - b.dx) - (preferX ? a.dx - a.dz : a.dz - a.dx)));
                const order = cells.slice().sort((a, b) => flip ? (b.x - a.x || b.z - a.z) : (a.x - b.x || a.z - b.z));
                for (const c of order) {
                    if (!avail(c.x, y, c.z)) continue;
                    for (const sz of sorted) {
                        const sx = flip ? c.x - sz.dx + 1 : c.x, sz0 = flip ? c.z - sz.dz + 1 : c.z;
                        let fits = true;
                        for (let x = sx; x < sx + sz.dx && fits; x++) for (let z = sz0; z < sz0 + sz.dz; z++) if (!ok(x, z, c.color)) { fits = false; break; }
                        if (fits) { place(sz, sx, sz0, y, c.color, hp); break; }
                    }
                }
            };
            const ys = [...byY.keys()].sort((a, b) => a - b);
            const baseY = ys[0];
            for (const y of ys) {
                const row = Math.floor(y / 3), preferX = row % 2 === 0, flip = row % 2 === 1;
                const brickOK = (x, z, color) => {
                    for (let d = 0; d < 3; d++) { const c = avail(x, y + d, z); if (!c || c.color !== color || c.noBrick) return false; }
                    return true;
                };
                greedy(byY.get(y), y, preferX, flip, BRICK_SIZES, brickOK, 3);
                const plateOK = (x, z, color) => { const c = avail(x, y, z); return !!c && c.color === color; };
                greedy(byY.get(y), y, !preferX, flip, y === baseY ? BASE_SIZES : PLATE_SIZES, plateOK, 1);
            }
            return out.concat(this.parts);
        }
    }

    window.ForgeGrid = ForgeGrid;
    window.FORGE_PLATE = PLATE;
})();
