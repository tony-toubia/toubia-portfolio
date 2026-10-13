/*
 * Hole Haul - procedural low-poly item library.
 *
 * Plain script (no modules). Load after three.js r128 (global THREE).
 * Exposes window.HH_MODELS:
 *   kinds[id] = { name, emoji, themes, r, h, xp, build() }
 *     build() -> non-indexed BufferGeometry (position, normal, color), origin at the
 *     item's bottom centre, resting on y = 0, inside the XZ circle of radius r and
 *     height h. Built once per kind and cached (the same geometry is returned on
 *     every call, so share it between meshes and never mutate it).
 *     Vertex colours are linear (hex colours converted from sRGB), meant for
 *     MeshStandardMaterial({ vertexColors: true }) with renderer.outputEncoding = sRGBEncoding.
 *   mergeParts(parts) - [{ geo, color, matrix? }] -> one non-indexed BufferGeometry.
 *   themes[theme] = [kind ids] (convenience index; 'coin' is listed under every theme).
 * Long items lie along X; items with a face look toward +Z.
 */
(function () {
  'use strict';
  const T = window.THREE;
  if (!T) { console.error('[HH_MODELS] THREE is not loaded'); return; }
  const D2R = Math.PI / 180;

  // ---------------------------------------------------------------- colours
  const linCache = new Map();
  function lin(hex) {
    let c = linCache.get(hex);
    if (!c) { c = new T.Color(hex).convertSRGBToLinear(); linCache.set(hex, c); }
    return c;
  }

  // ---------------------------------------------------------------- transforms
  const _Y = new T.Vector3(0, 1, 0);
  // o: { p:[x,y,z], r:[degX,degY,degZ], ro:'XYZ', s:n|[x,y,z], up:[x,y,z] (aligns local +Y) }
  function mat(o) {
    const m = new T.Matrix4();
    if (!o) return m;
    const p = o.p || [0, 0, 0];
    const s = o.s == null ? [1, 1, 1] : (typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s);
    const q = new T.Quaternion();
    if (o.up) q.setFromUnitVectors(_Y, new T.Vector3(o.up[0], o.up[1], o.up[2]).normalize());
    if (o.r) {
      const qe = new T.Quaternion().setFromEuler(new T.Euler(o.r[0] * D2R, o.r[1] * D2R, o.r[2] * D2R, o.ro || 'XYZ'));
      q.premultiply(qe);
    }
    m.compose(new T.Vector3(p[0], p[1], p[2]), q, new T.Vector3(s[0], s[1], s[2]));
    return m;
  }
  const P = (geo, color, o) => ({ geo, color, matrix: o ? mat(o) : null });
  // group: apply a transform on top of already-placed parts
  function G(parts, o) {
    const m = mat(o);
    return parts.map((p) => ({ geo: p.geo, color: p.color, matrix: p.matrix ? m.clone().multiply(p.matrix) : m.clone() }));
  }

  // ---------------------------------------------------------------- merge
  function mergeParts(parts) {
    const prepped = [];
    let total = 0;
    for (const part of parts) {
      let g = part.geo;
      if (g.index) g = g.toNonIndexed();
      if (!g.attributes.normal) { if (g === part.geo) g = g.clone(); g.computeVertexNormals(); }
      const cnt = g.attributes.position.count - (g.attributes.position.count % 3);
      prepped.push([g, cnt]);
      total += cnt;
    }
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    const vs = [new T.Vector3(), new T.Vector3(), new T.Vector3()], ns = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
    const e1 = new T.Vector3(), e2 = new T.Vector3(), nm = new T.Matrix3();
    let o = 0;
    parts.forEach((part, k) => {
      const [g, cnt] = prepped[k];
      const pa = g.attributes.position, na = g.attributes.normal;
      const m = part.matrix || null;
      let flip = false;
      if (m) { nm.getNormalMatrix(m); flip = m.determinant() < 0; }
      const c = lin(part.color == null ? 0xffffff : part.color);
      for (let i = 0; i < cnt; i += 3) {
        for (let j = 0; j < 3; j++) {
          const idx = i + (flip ? (3 - j) % 3 : j);
          vs[j].fromBufferAttribute(pa, idx);
          ns[j].fromBufferAttribute(na, idx);
          if (m) { vs[j].applyMatrix4(m); ns[j].applyMatrix3(nm); }
          ns[j].normalize();
        }
        // drop degenerate (zero-area) triangles: lathe poles, cone tips, zero-length profile steps
        e1.subVectors(vs[1], vs[0]); e2.subVectors(vs[2], vs[0]);
        if (e1.cross(e2).lengthSq() < 1e-14) continue;
        for (let j = 0; j < 3; j++) {
          const b = o * 3, v = vs[j], n = ns[j];
          pos[b] = v.x; pos[b + 1] = v.y; pos[b + 2] = v.z;
          nor[b] = n.x; nor[b + 1] = n.y; nor[b + 2] = n.z;
          col[b] = c.r; col[b + 1] = c.g; col[b + 2] = c.b;
          o++;
        }
      }
    });
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos.slice(0, o * 3), 3));
    out.setAttribute('normal', new T.BufferAttribute(nor.slice(0, o * 3), 3));
    out.setAttribute('color', new T.BufferAttribute(col.slice(0, o * 3), 3));
    out.computeBoundingBox();
    out.computeBoundingSphere();
    return out;
  }

  // centre in XZ (bbox centre) and rest on y = 0
  function finalize(g) {
    g.computeBoundingBox();
    const b = g.boundingBox;
    g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  // ---------------------------------------------------------------- primitives
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  // chunky rounded box: 2-step bevel, 108 triangles
  function rbox(w, h, d, rad) {
    rad = Math.min(rad, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    const g = new T.BoxGeometry(1, 1, 1, 3, 3, 3).toNonIndexed();
    g.deleteAttribute('uv');
    const p = g.attributes.position, n = g.attributes.normal;
    const bx = w / 2 - rad, by = h / 2 - rad, bz = d / 2 - rad, hs = 0.5 / 3;
    const v = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const sx = Math.sign(x), sy = Math.sign(y), sz = Math.sign(z);
      v.set(x - sx * hs, y - sy * hs, z - sz * hs).normalize();
      p.setXYZ(i, bx * sx + v.x * rad, by * sy + v.y * rad, bz * sz + v.z * rad);
      n.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  }
  const cyl = (rt, rb, h, seg = 12, open = false) => new T.CylinderGeometry(rt, rb, h, seg, 1, open);
  const sph = (r, ws = 10, hs = 7) => new T.SphereGeometry(r, ws, hs);
  const hemi = (r, ws = 12, hs = 4) => new T.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2);
  const cone = (r, h, seg = 10) => new T.ConeGeometry(r, h, seg);
  const tor = (R, t, rs = 6, ts = 12, arc = Math.PI * 2) => new T.TorusGeometry(R, t, rs, ts, arc);
  const ico = (r, d = 1) => new T.IcosahedronGeometry(r, d);
  // lathe from a flat [r0,y0, r1,y1, ...] profile listed bottom -> top (outward normals).
  // Corners sharper than `hard` degrees get a duplicated point so they shade crisp.
  function lathe(arr, seg = 12, hard = 50) {
    const pts = [], n = arr.length / 2;
    for (let i = 0; i < n; i++) {
      const v = new T.Vector2(arr[2 * i], arr[2 * i + 1]);
      pts.push(v);
      if (hard && i > 0 && i < n - 1) {
        const a = Math.atan2(v.y - arr[2 * i - 1], v.x - arr[2 * i - 2]);
        const b = Math.atan2(arr[2 * i + 3] - v.y, arr[2 * i + 2] - v.x);
        let d = Math.abs(b - a) / D2R;
        if (d > 180) d = 360 - d;
        if (d > hard) pts.push(v.clone());
      }
    }
    return new T.LatheGeometry(pts, seg);
  }
  // radius of a lathe profile at height y (profile listed bottom -> top)
  function rAt(arr, y) {
    for (let i = 0; i < arr.length - 2; i += 2) {
      const y0 = arr[i + 1], y1 = arr[i + 3];
      if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) {
        const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
        return arr[i] + (arr[i + 2] - arr[i]) * t;
      }
    }
    return 0;
  }
  // faceted copy (flat normals)
  function flat(geo) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.computeVertexNormals();
    return g;
  }
  // inside-out copy (for single-sided shells seen from below)
  function flip(geo) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i += 3) {
      for (const a of [p, n]) {
        const x = a.getX(i + 1), y = a.getY(i + 1), z = a.getZ(i + 1);
        a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
        a.setXYZ(i + 2, x, y, z);
      }
    }
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    return g;
  }
  // extrude a 2D shape along +Z, centred on z = 0 (shape stays in the XY plane)
  function extZ(shape, depth, bevel = 0, bseg = 1, cseg = 6) {
    const g = new T.ExtrudeGeometry(shape, {
      depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bseg, curveSegments: cseg,
    });
    g.translate(0, 0, -depth / 2);
    return g;
  }
  // extrude upward: shape (sx, sy) lands at world (sx, -sy); spans y 0 .. depth + 2*bevel
  function ext(shape, depth, bevel = 0, bseg = 1, cseg = 6) {
    const g = new T.ExtrudeGeometry(shape, {
      depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bseg, curveSegments: cseg,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, bevel, 0);
    return g;
  }
  function poly(pts, holes) {
    const s = new T.Shape();
    pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
    s.closePath();
    (holes || []).forEach((h) => {
      const path = new T.Path();
      h.forEach((p, i) => (i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1])));
      path.closePath();
      s.holes.push(path);
    });
    return s;
  }
  function star(n, ro, ri, a0 = Math.PI / 2) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = a0 + (i * Math.PI) / n, r = i % 2 ? ri : ro;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return poly(pts);
  }
  function sector(r0, r1, a0, a1, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([Math.cos(a) * r1, Math.sin(a) * r1]); }
    if (r0 <= 0) pts.push([0, 0]);
    else for (let i = n; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n; pts.push([Math.cos(a) * r0, Math.sin(a) * r0]); }
    return poly(pts);
  }
  // cylinder between two points (radius r at a, r2 at b)
  function rod(a, b, r, color, seg = 6, r2) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L = Math.hypot(d[0], d[1], d[2]);
    return P(cyl(r2 == null ? r : r2, r, L, seg), color, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], up: d });
  }
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // jittered, flat-bottomed low-poly rock
  function rockGeo(seed, r, sy, floor = -0.55) {
    const g = new T.IcosahedronGeometry(1, 1);
    const p = g.attributes.position, rnd = rng(seed), map = new Map();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const key = Math.round(x * 1e3) + ',' + Math.round(y * 1e3) + ',' + Math.round(z * 1e3);
      if (!map.has(key)) map.set(key, 0.82 + rnd() * 0.3);
      const k = map.get(key);
      p.setXYZ(i, x * k * r, Math.max(y * k, floor) * r * sy, z * k * r);
    }
    g.computeVertexNormals();
    return g;
  }

  // ---------------------------------------------------------------- palette
  const C = {
    red: 0xef3b42, red2: 0xd62828, tomato: 0xe63946, orange: 0xff8c1a, coral: 0xff7b54,
    yellow: 0xffd23f, sun: 0xffd60a, gold: 0xffc93c, gold2: 0xf0a500, goldL: 0xffe680,
    green: 0x5cc94f, leaf: 0x52b788, leaf2: 0x40916c, leaf3: 0x74c69d, dkgreen: 0x2d6a4f, lime: 0x80b918,
    blue: 0x3a86ff, sky: 0x4cc9f0, ice: 0x9bd1e5, navy: 0x1d3557, purple: 0x9b5de5, pink: 0xff70a6, pink2: 0xff8fc7,
    white: 0xf8f9fa, cream: 0xfff1d6, tan: 0xe0a458, wood: 0xc68642, wood2: 0xb07d48, brown: 0x8d5524, dkbrown: 0x5a3a1e,
    grey: 0xadb5bd, grey2: 0x6c757d, dark: 0x2b2d42, black: 0x22222a, skin: 0xffcba4, sand: 0xf2cc8f,
  };

  // ---------------------------------------------------------------- registry
  const kinds = {};
  function def(id, name, emoji, themes, r, h, xp, fn) {
    let cache = null;
    kinds[id] = {
      name, emoji, themes, r, h, xp,
      build() { if (!cache) cache = finalize(mergeParts(fn())); return cache; },
    };
  }

  // ================================================================ shared
  def('coin', 'Coin', '🪙', ['all'], 0.14, 0.28, 1, () => {
    const y = 0.14;
    return [
      P(cyl(0.125, 0.125, 0.045, 18), C.gold, { p: [0, y, 0], r: [90, 0, 0] }),
      P(tor(0.12, 0.018, 5, 18), C.gold2, { p: [0, y, 0] }),
      P(extZ(star(5, 0.065, 0.028), 0.064), C.goldL, { p: [0, y, 0] }),
    ];
  });

  // ================================================================ picnic
  def('apple', 'Apple', '🍎', ['picnic'], 0.16, 0.36, 1, () => {
    const prof = [0, 0.03, 0.06, 0, 0.12, 0.03, 0.155, 0.11, 0.15, 0.2, 0.12, 0.27, 0.06, 0.3, 0.025, 0.292, 0, 0.268];
    return [
      P(lathe(prof, 12), 0xe5383b),
      P(cyl(0.011, 0.014, 0.09, 5), C.dkbrown, { p: [0.008, 0.31, 0], r: [0, 0, -12] }),
      P(sph(0.05, 6, 4), C.green, { p: [0.05, 0.315, 0], r: [0, 0, 25], s: [1, 0.22, 0.5] }),
    ];
  });

  def('orange', 'Orange', '🍊', ['picnic'], 0.16, 0.31, 1, () => [
    P(sph(0.15, 12, 9), C.orange, { p: [0, 0.14, 0], s: [1, 0.93, 1] }),
    P(cyl(0.018, 0.02, 0.025, 6), C.dkgreen, { p: [0, 0.28, 0] }),
    P(sph(0.05, 6, 4), C.green, { p: [0.045, 0.285, 0.01], r: [0, 20, 20], s: [1, 0.22, 0.5] }),
  ]);

  def('banana', 'Banana', '🍌', ['picnic'], 0.25, 0.11, 1, () => {
    const R = 0.19, t = 0.055, arc = 110 * D2R;
    const ex = R * Math.cos(arc), ey = R * Math.sin(arc);
    const tx = -Math.sin(arc), ty = Math.cos(arc);
    const parts = [
      P(tor(R, t, 7, 10, arc), 0xffd93d),
      P(sph(t, 7, 4), 0xffd93d, { p: [R, 0, 0] }),
      P(sph(t, 7, 4), 0xffd93d, { p: [ex, ey, 0] }),
      P(cone(0.026, 0.05, 5), C.dkbrown, { p: [R, -t - 0.012, 0], r: [0, 0, 180] }),
      P(cyl(0.018, 0.026, 0.07, 6), 0x9c7a3c, { p: [ex + tx * (t + 0.02), ey + ty * (t + 0.02), 0], r: [0, 0, arc / D2R] }),
    ];
    return G(parts, { r: [-90, -arc / 2 / D2R - 90, 0], ro: 'YXZ' });
  });

  def('strawberry', 'Strawberry', '🍓', ['picnic'], 0.16, 0.22, 1, () => {
    const prof = [0, 0, 0.03, 0.025, 0.07, 0.08, 0.1, 0.15, 0.108, 0.2, 0.09, 0.245, 0, 0.258];
    const parts = [P(lathe(prof, 10), 0xff3b4e)];
    const rings = [[0.07, 5, 0], [0.13, 6, 30], [0.19, 7, 10]];
    for (const [y, n, off] of rings) {
      const rr = rAt(prof, y) - 0.001;
      for (let i = 0; i < n; i++) {
        const a = off + (i * 360) / n;
        parts.push(P(box(0.014, 0.019, 0.006), 0xfff3b0, { p: [Math.cos(a * D2R) * rr, y, Math.sin(a * D2R) * rr], r: [0, 90 - a, 0] }));
      }
    }
    parts.push(P(ext(star(6, 0.085, 0.032), 0.016), C.green, { p: [0, 0.24, 0] }));
    parts.push(P(cyl(0.012, 0.015, 0.05, 5), C.dkgreen, { p: [0, 0.27, 0] }));
    // lying on its side so the cone shape reads from above
    return G(G(parts, { r: [0, 0, -78] }), { r: [0, -30, 0] });
  });

  def('sandwich', 'Sandwich', '🥪', ['picnic'], 0.32, 0.22, 2, () => {
    const tri = (s) => poly([[0, s], [-s * 0.866, -s * 0.5], [s * 0.866, -s * 0.5]]);
    return [
      P(ext(tri(0.25), 0.045, 0.02, 2), 0xd9a054),
      P(ext(tri(0.275), 0.012, 0.006), C.lime, { p: [0, 0.084, 0] }),
      P(cyl(0.065, 0.065, 0.022, 10), C.tomato, { p: [0.1, 0.11, 0.12] }),
      P(cyl(0.065, 0.065, 0.022, 10), C.tomato, { p: [-0.16, 0.11, 0.0] }),
      P(ext(tri(0.27), 0.01, 0.004), C.yellow, { p: [0, 0.1, 0], r: [0, 28, 0] }),
      P(ext(tri(0.25), 0.045, 0.02, 2), 0xd9a054, { p: [0, 0.122, 0] }),
      P(ext(tri(0.215), 0.006), 0xffe3a3, { p: [0, 0.205, 0] }),
    ];
  });

  def('juice_box', 'Juice Box', '🧃', ['picnic'], 0.12, 0.48, 1, () => [
    P(rbox(0.2, 0.3, 0.14, 0.022), C.sky, { p: [0, 0.15, 0] }),
    P(box(0.16, 0.15, 0.006), C.white, { p: [0, 0.15, 0.07] }),
    P(cyl(0.045, 0.045, 0.008, 12), C.orange, { p: [0, 0.145, 0.074], r: [90, 0, 0] }),
    P(box(0.03, 0.02, 0.008), C.green, { p: [0.015, 0.195, 0.075], r: [0, 0, 30] }),
    P(cyl(0.012, 0.012, 0.13, 6), C.pink, { p: [0.05, 0.36, 0.03] }),
    P(cyl(0.012, 0.012, 0.06, 6), C.pink, { p: [0.068, 0.44, 0.03], r: [0, 0, -40] }),
  ]);

  def('cupcake', 'Cupcake', '🧁', ['picnic', 'kitchen'], 0.16, 0.43, 1, () => {
    const parts = [
      P(flat(cyl(0.15, 0.115, 0.15, 12)), C.sky, { p: [0, 0.075, 0] }),
      P(sph(0.148, 10, 4), 0xc68b59, { p: [0, 0.15, 0], s: [1, 0.4, 1] }),
      P(tor(0.1, 0.055, 6, 10), C.pink2, { p: [0, 0.19, 0], r: [90, 0, 0] }),
      P(tor(0.056, 0.046, 5, 8), C.pink2, { p: [0, 0.255, 0], r: [90, 0, 0] }),
      P(sph(0.045, 6, 4), C.pink2, { p: [0, 0.295, 0], s: [1, 1.15, 1] }),
      P(sph(0.034, 6, 4), 0xe5383b, { p: [0, 0.355, 0] }),
      P(cyl(0.005, 0.005, 0.05, 4), C.dkgreen, { p: [0.012, 0.395, 0], r: [0, 0, -20] }),
    ];
    const cols = [C.sun, C.white, C.sky, C.lime];
    for (let i = 0; i < 4; i++) {
      const a = (i * 90 + 20) * D2R;
      parts.push(P(box(0.032, 0.011, 0.011), cols[i], { p: [Math.cos(a) * 0.1, 0.243, Math.sin(a) * 0.1], r: [0, i * 47, 0] }));
    }
    return parts;
  });

  def('watermelon', 'Watermelon', '🍉', ['picnic'], 0.39, 0.17, 2, () => {
    const a0 = -124 * D2R, a1 = -56 * D2R, d = 0.13, bv = 0.012;
    const parts = [
      P(ext(sector(0, 0.47, a0, a1, 8), d, bv), 0xff4d6d),
      P(ext(sector(0.47, 0.5, a0, a1, 8), d, bv), 0xd8f3dc),
      P(ext(sector(0.5, 0.56, a0, a1, 8), d, bv), C.dkgreen),
    ];
    const seeds = [[0.2, -90], [0.3, -103], [0.3, -77], [0.39, -112], [0.39, -90], [0.39, -68]];
    for (const [rr, deg] of seeds) {
      const a = deg * D2R;
      parts.push(P(sph(0.02, 6, 3), C.black, { p: [Math.cos(a) * rr, d + 2 * bv, -Math.sin(a) * rr], r: [0, deg, 0], s: [1.6, 0.4, 1] }));
    }
    return parts;
  });

  def('basket', 'Picnic Basket', '🧺', ['picnic'], 0.64, 0.92, 7, () => [
    P(rbox(1.0, 0.5, 0.66, 0.06), 0xd4a373, { p: [0, 0.25, 0] }),
    P(box(1.012, 0.05, 0.672), 0xa47148, { p: [0, 0.12, 0] }),
    P(box(1.012, 0.05, 0.672), 0xa47148, { p: [0, 0.33, 0] }),
    P(rbox(1.06, 0.08, 0.72, 0.03), 0xbc6c25, { p: [0, 0.54, 0] }),
    P(box(0.5, 0.13, 0.02), C.red, { p: [-0.1, 0.44, 0.335] }),
    P(box(0.09, 0.05, 0.024), C.white, { p: [-0.26, 0.47, 0.336] }),
    P(box(0.09, 0.05, 0.024), C.white, { p: [-0.08, 0.41, 0.336] }),
    P(box(0.09, 0.05, 0.024), C.white, { p: [0.1, 0.47, 0.336] }),
    P(box(0.1, 0.07, 0.03), C.gold, { p: [0.3, 0.5, 0.36] }),
    P(tor(0.3, 0.035, 5, 10, Math.PI), 0x7f4f24, { p: [0, 0.58, 0] }),
    P(box(0.08, 0.05, 0.1), 0x7f4f24, { p: [0.3, 0.6, 0] }),
    P(box(0.08, 0.05, 0.1), 0x7f4f24, { p: [-0.3, 0.6, 0] }),
  ]);

  def('ball', 'Football', '⚽', ['picnic', 'toys'], 0.25, 0.49, 2, () => {
    const R = 0.24, f = (1 + Math.sqrt(5)) / 2;
    const parts = [P(sph(R, 14, 9), C.white, { p: [0, R, 0] })];
    // pentagon patches sit on the 12 icosahedron vertex directions
    const dirs = [];
    for (const a of [-1, 1]) for (const b of [-f, f]) dirs.push([0, a, b], [a, b, 0], [b, 0, a]);
    for (const d of dirs) {
      const v = new T.Vector3(d[0], d[1], d[2]).normalize();
      parts.push(P(cyl(0.074, 0.074, 0.02, 5), C.black, { p: [v.x * (R - 0.004), R + v.y * (R - 0.004), v.z * (R - 0.004)], up: [v.x, v.y, v.z] }));
    }
    return parts;
  });

  def('bench', 'Bench', '🪑', ['picnic', 'city'], 1.16, 1, 12, () => {
    const slat = 0xd68c45, iron = 0x2f3e46;
    const parts = [];
    for (const x of [-1.0, 1.0]) {
      parts.push(P(box(0.07, 0.68, 0.07), iron, { p: [x, 0.34, 0.24] }));
      parts.push(P(box(0.07, 1.0, 0.07), iron, { p: [x, 0.5, -0.27], r: [-10, 0, 0] }));
      parts.push(P(box(0.07, 0.06, 0.6), iron, { p: [x, 0.42, -0.01] }));
      parts.push(P(box(0.09, 0.05, 0.5), iron, { p: [x, 0.69, 0.03] }));
    }
    for (const z of [0.2, 0.02, -0.16]) parts.push(P(box(2.2, 0.05, 0.16), slat, { p: [0, 0.47, z] }));
    for (const y of [0.66, 0.86]) parts.push(P(box(2.2, 0.14, 0.045), slat, { p: [0, y, -0.27 - (y - 0.5) * 0.176 - 0.03], r: [-10, 0, 0] }));
    return parts;
  });

  def('tree', 'Tree', '🌳', ['picnic', 'garden'], 1.89, 4.21, 60, () => [
    P(flat(cyl(0.22, 0.34, 2.0, 8)), C.brown, { p: [0, 1.0, 0] }),
    P(flat(ico(1.25, 1)), C.leaf, { p: [0, 2.6, 0] }),
    P(flat(ico(0.95, 1)), C.leaf2, { p: [0.95, 2.2, 0.15] }),
    P(flat(ico(0.9, 1)), C.leaf3, { p: [-0.92, 2.3, -0.1] }),
    P(flat(ico(0.8, 1)), C.leaf3, { p: [0.15, 3.4, 0.1] }),
    P(flat(ico(0.8, 1)), C.leaf2, { p: [-0.1, 2.1, 0.8] }),
  ]);

  // ================================================================ kitchen
  def('donut', 'Donut', '🍩', ['kitchen'], 0.2, 0.14, 1, () => {
    const parts = [
      P(tor(0.12, 0.065, 6, 12), 0xe9a65c, { p: [0, 0.065, 0], r: [90, 0, 0] }),
      P(tor(0.12, 0.068, 6, 12), C.pink, { p: [0, 0.093, 0], r: [90, 0, 0], s: [1, 1, 0.55] }),
    ];
    const cols = [C.white, C.sun, C.sky, 0x80ed99];
    const rnd = rng(7);
    for (let i = 0; i < 8; i++) {
      const a = (i * 45 + rnd() * 20) * D2R, rr = 0.12 + (rnd() - 0.5) * 0.06;
      parts.push(P(box(0.034, 0.012, 0.012), cols[i % 4], { p: [Math.cos(a) * rr, 0.133, Math.sin(a) * rr], r: [0, rnd() * 180, 0] }));
    }
    return parts;
  });

  def('cookie', 'Cookie', '🍪', ['kitchen'], 0.16, 0.07, 1, () => {
    const parts = [P(lathe([0, 0, 0.135, 0, 0.155, 0.02, 0.155, 0.035, 0.135, 0.055, 0, 0.056], 12), 0xd9a05b)];
    const chips = [[0, 0], [0.07, 0.04], [-0.06, 0.06], [-0.07, -0.05], [0.05, -0.07], [0.1, -0.01], [-0.01, 0.1]];
    for (const [x, z] of chips) parts.push(P(sph(0.022, 5, 3), 0x4a2c1d, { p: [x, 0.056, z], s: [1, 0.6, 1] }));
    return parts;
  });

  def('mug', 'Mug', '☕', ['kitchen'], 0.19, 0.28, 1, () => [
    P(lathe([0, 0, 0.12, 0, 0.14, 0.02, 0.14, 0.27, 0.118, 0.27], 14), C.tomato),
    P(lathe([0.118, 0.27, 0.118, 0.05, 0, 0.05], 14), 0xfff8f0),
    P(cyl(0.117, 0.117, 0.01, 14), 0x6f4518, { p: [0, 0.22, 0] }),
    P(tor(0.07, 0.022, 5, 8, Math.PI), C.tomato, { p: [0.135, 0.14, 0], r: [0, 0, -90] }),
  ]);

  def('teacup', 'Teacup', '🍵', ['kitchen'], 0.2, 0.16, 1, () => [
    P(lathe([0, 0, 0.1, 0, 0.19, 0.025, 0.195, 0.035, 0.18, 0.04, 0.1, 0.022, 0, 0.022], 14), C.white),
    P(lathe([0, 0.022, 0.055, 0.022, 0.085, 0.04, 0.12, 0.09, 0.135, 0.15, 0.12, 0.15], 14), 0x90e0ef),
    P(lathe([0.12, 0.15, 0.1, 0.085, 0.05, 0.05, 0, 0.05], 14), C.white),
    P(cyl(0.111, 0.111, 0.008, 14), 0xc97c3c, { p: [0, 0.125, 0] }),
    P(tor(0.13, 0.006, 3, 18), C.gold, { p: [0, 0.15, 0], r: [90, 0, 0] }),
    P(tor(0.035, 0.012, 4, 8, Math.PI * 1.2), 0x90e0ef, { p: [0.13, 0.1, 0], r: [0, 0, -108] }),
  ]);

  def('plates', 'Plate Stack', '🍽️', ['kitchen'], 0.27, 0.18, 1, () => {
    const prof = [0, 0, 0.15, 0, 0.25, 0.032, 0.245, 0.04, 0, 0.018];
    const parts = [];
    const rnd = rng(3);
    for (let i = 0; i < 5; i++) {
      parts.push(P(lathe(prof, 12), i % 2 ? 0x9ad8f5 : C.white, { p: [(rnd() - 0.5) * 0.024, i * 0.034, (rnd() - 0.5) * 0.024] }));
    }
    parts.push(P(tor(0.2, 0.007, 3, 18), C.blue, { p: [0, 4 * 0.034 + 0.034, 0], r: [90, 0, 0] }));
    return parts;
  });

  def('egg', 'Egg', '🥚', ['kitchen'], 0.11, 0.24, 1, () => [
    P(lathe([0, 0, 0.055, 0.008, 0.09, 0.045, 0.1, 0.1, 0.092, 0.155, 0.065, 0.205, 0.03, 0.23, 0, 0.237], 12), 0xf6e3c6),
  ]);

  def('cheese', 'Cheese', '🧀', ['kitchen'], 0.27, 0.18, 1, () => {
    const top = 0.15 + 0.024, hole = 0xe9a400;
    const n = new T.Vector3(0.13, 0, 0.42).normalize();
    return [
      P(ext(poly([[-0.2, -0.13], [0.22, 0], [-0.2, 0.13]]), 0.15, 0.012), C.gold),
      P(cyl(0.035, 0.035, 0.006, 10), hole, { p: [-0.1, top, 0.02] }),
      P(cyl(0.025, 0.025, 0.006, 10), hole, { p: [0.03, top, -0.02] }),
      P(cyl(0.02, 0.02, 0.006, 8), hole, { p: [-0.14, top, -0.07] }),
      P(cyl(0.03, 0.03, 0.006, 10), hole, { p: [-0.213, 0.07, 0.05], r: [0, 0, 90] }),
      P(cyl(0.022, 0.022, 0.006, 8), hole, { p: [-0.213, 0.12, -0.06], r: [0, 0, 90] }),
      P(cyl(0.03, 0.03, 0.006, 10), hole, { p: [-0.02 + n.x * 0.013, 0.08, 0.072 + n.z * 0.013], up: [n.x, n.y, n.z] }),
    ];
  });

  def('milk', 'Milk Carton', '🥛', ['kitchen'], 0.2, 0.54, 2, () => {
    const sl = new T.Vector3(0.11, 0.13, 0).normalize();
    return [
      P(rbox(0.26, 0.38, 0.26, 0.015), C.white, { p: [0, 0.19, 0] }),
      P(box(0.268, 0.13, 0.268), C.blue, { p: [0, 0.2, 0] }),
      P(cyl(0.05, 0.05, 0.004, 12), C.white, { p: [0, 0.2, 0.135], r: [90, 0, 0] }),
      P(extZ(poly([[-0.13, 0], [0.13, 0], [0, 0.11]]), 0.26), 0x90e0ef, { p: [0, 0.38, 0] }),
      P(box(0.025, 0.05, 0.27), 0x90e0ef, { p: [0, 0.505, 0] }),
      P(cyl(0.03, 0.03, 0.025, 8), C.orange, { p: [0.065 + sl.x * 0.012, 0.38 + 0.055 + sl.y * 0.012, 0.06], up: [sl.x, sl.y, 0] }),
    ];
  });

  def('pan', 'Frying Pan', '🍳', ['kitchen'], 0.45, 0.14, 2, () => [
    P(lathe([0, 0, 0.22, 0, 0.27, 0.1, 0.255, 0.1], 16), C.tomato),
    P(lathe([0.255, 0.1, 0.215, 0.02, 0, 0.02], 16), 0x343a40),
    P(rbox(0.36, 0.05, 0.065, 0.022), C.black, { p: [0.44, 0.088, 0], r: [0, 0, 8] }),
    P(cyl(0.02, 0.02, 0.07, 6), C.grey, { p: [0.28, 0.08, 0], r: [0, 0, 90] }),
  ]);

  def('toaster', 'Toaster', '🍞', ['kitchen'], 0.29, 0.45, 2, () => {
    const parts = [
      P(rbox(0.5, 0.32, 0.3, 0.08), 0x56cfe1, { p: [0, 0.16, 0] }),
      P(box(0.36, 0.012, 0.05), C.dark, { p: [0, 0.321, 0.065] }),
      P(box(0.36, 0.012, 0.05), C.dark, { p: [0, 0.321, -0.065] }),
      P(box(0.04, 0.03, 0.08), C.black, { p: [0.265, 0.22, 0] }),
      P(cyl(0.025, 0.025, 0.02, 8), C.white, { p: [-0.13, 0.1, 0.152], r: [90, 0, 0] }),
    ];
    for (const z of [0.065, -0.065]) {
      parts.push(P(rbox(0.3, 0.2, 0.045, 0.035), 0xc8813a, { p: [0, 0.34, z] }));
      parts.push(P(box(0.24, 0.15, 0.05), 0xf5d491, { p: [0, 0.335, z] }));
    }
    return parts;
  });

  def('stool', 'Stool', '🪑', ['kitchen'], 0.38, 0.88, 4, () => {
    const parts = [
      P(lathe([0, 0, 0.33, 0, 0.37, 0.03, 0.37, 0.06, 0.33, 0.09, 0, 0.09], 14), C.tomato, { p: [0, 0.78, 0] }),
      P(tor(0.3, 0.022, 5, 16), C.wood2, { p: [0, 0.3, 0], r: [90, 0, 0] }),
    ];
    for (let i = 0; i < 4; i++) {
      const a = (45 + i * 90) * D2R, c = Math.cos(a), s = Math.sin(a);
      parts.push(rod([c * 0.34, 0, s * 0.34], [c * 0.24, 0.79, s * 0.24], 0.03, C.wood2, 6));
    }
    return parts;
  });

  def('fridge', 'Fridge', '🧊', ['kitchen'], 0.72, 2.21, 14, () => [
    P(rbox(1.1, 2.2, 0.95, 0.12), 0xbfe8ef, { p: [0, 1.1, 0] }),
    P(box(1.08, 0.025, 0.02), C.grey2, { p: [0, 1.45, 0.47] }),
    P(box(0.9, 0.08, 0.02), C.grey2, { p: [0, 0.12, 0.47] }),
    P(rbox(0.07, 0.34, 0.06, 0.025), C.grey, { p: [0.42, 1.75, 0.49] }),
    P(rbox(0.07, 0.55, 0.06, 0.025), C.grey, { p: [0.42, 1.05, 0.49] }),
    P(box(0.2, 0.25, 0.012), C.white, { p: [-0.2, 1.1, 0.477], r: [0, 0, 6] }),
    P(cyl(0.035, 0.035, 0.02, 8), C.red, { p: [-0.2, 1.21, 0.485], r: [90, 0, 0] }),
    P(cyl(0.045, 0.045, 0.02, 8), C.sun, { p: [-0.05, 0.75, 0.48], r: [90, 0, 0] }),
    P(box(0.09, 0.09, 0.02), C.blue, { p: [-0.32, 0.6, 0.48], r: [0, 0, 15] }),
    P(box(0.12, 0.08, 0.02), C.green, { p: [-0.25, 1.75, 0.48] }),
  ]);

  // ================================================================ toys
  const GLYPH_A = poly(
    [[-0.07, -0.08], [-0.022, 0.08], [0.022, 0.08], [0.07, -0.08], [0.036, -0.08], [0.024, -0.04], [-0.024, -0.04], [-0.036, -0.08]],
    [[[-0.014, -0.012], [0.014, -0.012], [0, 0.038]]]
  );
  const GLYPH_B = poly(
    [[-0.055, -0.08], [0.03, -0.08], [0.065, -0.05], [0.065, -0.015], [0.045, 0], [0.06, 0.02], [0.06, 0.05], [0.03, 0.08], [-0.055, 0.08]],
    [[[-0.022, -0.052], [0.028, -0.052], [0.028, -0.018], [-0.022, -0.018]], [[-0.022, 0.016], [0.024, 0.016], [0.024, 0.052], [-0.022, 0.052]]]
  );
  function block(body, panel, letter, glyph) {
    const s = 0.28, h = s / 2;
    const face = [
      P(box(0.2, 0.2, 0.012), panel, { p: [0, 0, h] }),
      P(extZ(glyph, 0.012), letter, { p: [0, 0, h + 0.008] }),
    ];
    const parts = [P(rbox(s, s, s, 0.035), body, { p: [0, h, 0] })];
    const rots = [[0, 0, 0], [0, 90, 0], [0, -90, 0], [0, 180, 0], [-90, 0, 0]];
    for (const r of rots) parts.push(...G(face, { p: [0, h, 0], r }));
    return parts;
  }
  def('block_red', 'Red Block', '🅰️', ['toys'], 0.19, 0.3, 1, () => block(0xef476f, C.yellow, 0xd62839, GLYPH_A));
  def('block_blue', 'Blue Block', '🅱️', ['toys'], 0.19, 0.3, 1, () => block(C.blue, C.white, 0x1f5fd1, GLYPH_B));

  def('duck', 'Rubber Duck', '🦆', ['toys'], 0.27, 0.4, 2, () => G([
    P(sph(0.15, 10, 7), C.sun, { p: [0, 0.12, 0], s: [1.3, 0.8, 1.05] }),
    P(sph(0.105, 10, 7), C.sun, { p: [0.1, 0.29, 0] }),
    P(sph(0.055, 8, 5), 0xff8c00, { p: [0.205, 0.27, 0], s: [1.3, 0.45, 1] }),
    P(sph(0.022, 6, 4), C.black, { p: [0.165, 0.32, 0.055] }),
    P(sph(0.022, 6, 4), C.black, { p: [0.165, 0.32, -0.055] }),
    P(cone(0.06, 0.1, 6), C.sun, { p: [-0.2, 0.2, 0], r: [0, 0, 60] }),
    P(sph(0.08, 7, 5), 0xffc300, { p: [-0.01, 0.15, 0.135], s: [1.3, 0.6, 0.5] }),
    P(sph(0.08, 7, 5), 0xffc300, { p: [-0.01, 0.15, -0.135], s: [1.3, 0.6, 0.5] }),
  ], { r: [0, -35, 0] }));

  def('toy_car', 'Toy Car', '🚗', ['toys'], 0.3, 0.34, 2, () => {
    const parts = [
      P(rbox(0.52, 0.14, 0.28, 0.05), C.red, { p: [0, 0.135, 0] }),
      P(rbox(0.28, 0.13, 0.25, 0.05), C.ice, { p: [-0.04, 0.25, 0] }),
      P(box(0.26, 0.03, 0.235), C.white, { p: [-0.04, 0.315, 0] }),
      P(box(0.02, 0.035, 0.05), C.sun, { p: [0.262, 0.15, 0.08] }),
      P(box(0.02, 0.035, 0.05), C.sun, { p: [0.262, 0.15, -0.08] }),
    ];
    for (const x of [-0.16, 0.16]) for (const z of [-0.135, 0.135]) {
      parts.push(P(cyl(0.075, 0.075, 0.06, 8), C.black, { p: [x, 0.075, z], r: [90, 0, 0] }));
      parts.push(P(cyl(0.035, 0.035, 0.065, 6), C.white, { p: [x, 0.075, z], r: [90, 0, 0] }));
    }
    return parts;
  });

  def('robot', 'Robot', '🤖', ['toys'], 0.26, 0.68, 2, () => [
    P(box(0.09, 0.14, 0.12), C.dark, { p: [-0.065, 0.07, 0.01] }),
    P(box(0.09, 0.14, 0.12), C.dark, { p: [0.065, 0.07, 0.01] }),
    P(rbox(0.28, 0.24, 0.2, 0.04), 0x4361ee, { p: [0, 0.26, 0] }),
    P(box(0.14, 0.08, 0.01), C.sun, { p: [0, 0.28, 0.1] }),
    P(box(0.03, 0.03, 0.012), C.red, { p: [-0.035, 0.28, 0.106] }),
    P(box(0.03, 0.03, 0.012), C.green, { p: [0.035, 0.28, 0.106] }),
    rod([-0.15, 0.34, 0], [-0.2, 0.2, 0.02], 0.03, C.grey, 6),
    rod([0.15, 0.34, 0], [0.2, 0.2, 0.02], 0.03, C.grey, 6),
    P(sph(0.045, 6, 4), C.red, { p: [-0.205, 0.18, 0.02] }),
    P(sph(0.045, 6, 4), C.red, { p: [0.205, 0.18, 0.02] }),
    P(rbox(0.22, 0.16, 0.17, 0.04), 0xdee2e6, { p: [0, 0.46, 0] }),
    P(cyl(0.03, 0.03, 0.015, 8), C.sky, { p: [-0.05, 0.475, 0.086], r: [90, 0, 0] }),
    P(cyl(0.03, 0.03, 0.015, 8), C.sky, { p: [0.05, 0.475, 0.086], r: [90, 0, 0] }),
    P(box(0.09, 0.015, 0.01), C.dark, { p: [0, 0.425, 0.086] }),
    P(cyl(0.03, 0.03, 0.03, 6), C.red, { p: [-0.12, 0.46, 0], r: [0, 0, 90] }),
    P(cyl(0.03, 0.03, 0.03, 6), C.red, { p: [0.12, 0.46, 0], r: [0, 0, 90] }),
    P(cyl(0.012, 0.012, 0.09, 5), C.grey2, { p: [0, 0.585, 0] }),
    P(sph(0.032, 6, 4), C.red, { p: [0, 0.645, 0] }),
  ]);

  def('rocket', 'Rocket', '🚀', ['toys'], 0.29, 0.77, 3, () => {
    const fin = extZ(poly([[0.11, 0.32], [0.11, 0.1], [0.24, 0], [0.24, 0.1], [0.16, 0.22]]), 0.03, 0.008);
    const parts = [
      P(lathe([0, 0.1, 0.1, 0.1, 0.125, 0.2, 0.132, 0.36, 0.115, 0.52, 0.088, 0.6, 0, 0.6], 10), C.white),
      P(lathe([0, 0.595, 0.09, 0.595, 0.075, 0.66, 0.045, 0.72, 0, 0.75], 10), C.red),
      P(lathe([0, 0.008, 0.075, 0.008, 0.06, 0.11, 0, 0.11], 10), C.grey2),
      P(cyl(0.062, 0.062, 0.02, 12), C.grey, { p: [0, 0.42, 0.124], r: [90, 0, 0] }),
      P(cyl(0.048, 0.048, 0.022, 12), C.sky, { p: [0, 0.42, 0.13], r: [90, 0, 0] }),
    ];
    for (let i = 0; i < 3; i++) parts.push(P(fin, C.red, { r: [0, 90 + i * 120, 0] }));
    return parts;
  });

  def('teddy', 'Teddy Bear', '🧸', ['toys'], 0.44, 1.15, 6, () => {
    const fur = 0xc68642, lt = 0xf3d2a2, dk = C.dark;
    return G([
      P(sph(0.25, 8, 6), fur, { p: [0, 0.3, 0], s: [1, 1.1, 0.9] }),
      P(sph(0.11, 6, 5), fur, { p: [-0.14, 0.11, 0.16], s: [1, 0.9, 1.5] }),
      P(sph(0.11, 6, 5), fur, { p: [0.14, 0.11, 0.16], s: [1, 0.9, 1.5] }),
      P(sph(0.075, 5, 3), lt, { p: [-0.14, 0.11, 0.315], s: [1, 1, 0.4] }),
      P(sph(0.075, 5, 3), lt, { p: [0.14, 0.11, 0.315], s: [1, 1, 0.4] }),
      P(sph(0.09, 6, 5), fur, { p: [-0.25, 0.36, 0.06], r: [0, 0, -25], s: [1, 1.6, 1] }),
      P(sph(0.09, 6, 5), fur, { p: [0.25, 0.36, 0.06], r: [0, 0, 25], s: [1, 1.6, 1] }),
      P(sph(0.2, 8, 7), fur, { p: [0, 0.69, 0.02] }),
      P(sph(0.075, 5, 3), fur, { p: [-0.15, 0.85, 0], s: [1, 1, 0.6] }),
      P(sph(0.075, 5, 3), fur, { p: [0.15, 0.85, 0], s: [1, 1, 0.6] }),
      P(sph(0.085, 6, 4), lt, { p: [0, 0.64, 0.19], s: [1, 0.75, 0.8] }),
      P(sph(0.032, 5, 3), dk, { p: [0, 0.67, 0.255] }),
      P(sph(0.026, 5, 3), dk, { p: [-0.075, 0.75, 0.18] }),
      P(sph(0.026, 5, 3), dk, { p: [0.075, 0.75, 0.18] }),
      P(cone(0.06, 0.09, 4), C.red, { p: [0.05, 0.5, 0.2], r: [0, 0, 90] }),
      P(cone(0.06, 0.09, 4), C.red, { p: [-0.05, 0.5, 0.2], r: [0, 0, -90] }),
      P(sph(0.03, 5, 3), C.red, { p: [0, 0.5, 0.21] }),
    ], { s: 1.25 });
  });

  def('drum', 'Drum', '🥁', ['toys'], 0.27, 0.34, 2, () => {
    const parts = [
      P(cyl(0.24, 0.24, 0.18, 14), C.red, { p: [0, 0.13, 0] }),
      P(cyl(0.258, 0.258, 0.045, 14), C.sun, { p: [0, 0.0225, 0] }),
      P(cyl(0.258, 0.258, 0.045, 14), C.sun, { p: [0, 0.2375, 0] }),
      P(cyl(0.235, 0.235, 0.012, 14), 0xfff8e7, { p: [0, 0.262, 0] }),
    ];
    const pt = (i) => { const a = i * 36 * D2R; return [Math.cos(a) * 0.25, i % 2 ? 0.215 : 0.045, Math.sin(a) * 0.25]; };
    for (let i = 0; i < 10; i++) parts.push(rod(pt(i), pt(i + 1), 0.008, C.white, 4));
    const stick = (a, b, y) => [rod([a[0], y, a[1]], [b[0], y, b[1]], 0.014, 0xe9c46a, 6), P(sph(0.024, 5, 3), 0xe9c46a, { p: [b[0], y, b[1]] })];
    parts.push(...stick([-0.2, -0.08], [0.17, 0.12], 0.283), ...stick([-0.18, 0.12], [0.19, -0.07], 0.305));
    return parts;
  });

  def('train', 'Toy Train', '🚂', ['toys'], 0.63, 0.73, 7, () => {
    const parts = [
      P(box(1.0, 0.1, 0.38), C.dark, { p: [0, 0.17, 0] }),
      P(cyl(0.17, 0.17, 0.5, 12), C.red, { p: [0.2, 0.39, 0], r: [0, 0, 90] }),
      P(cyl(0.15, 0.15, 0.04, 12), C.dark, { p: [0.46, 0.39, 0], r: [0, 0, 90] }),
      P(cyl(0.176, 0.176, 0.04, 12), C.sun, { p: [0.2, 0.39, 0], r: [0, 0, 90] }),
      P(cyl(0.085, 0.05, 0.2, 10), C.dark, { p: [0.36, 0.62, 0] }),
      P(sph(0.07, 8, 5), C.sun, { p: [0.1, 0.55, 0] }),
      P(box(0.36, 0.42, 0.4), C.blue, { p: [-0.3, 0.43, 0] }),
      P(box(0.2, 0.13, 0.41), 0xcaf0f8, { p: [-0.3, 0.5, 0] }),
      P(box(0.46, 0.06, 0.48), C.red, { p: [-0.3, 0.67, 0] }),
      P(extZ(poly([[0, 0], [0.12, 0], [0, 0.14]]), 0.34), C.sun, { p: [0.5, 0.02, 0] }),
    ];
    for (const z of [-0.2, 0.2]) {
      parts.push(P(cyl(0.13, 0.13, 0.06, 8), C.sun, { p: [-0.3, 0.13, z], r: [90, 0, 0] }));
      parts.push(P(cyl(0.09, 0.09, 0.06, 8), C.sun, { p: [0.12, 0.09, z], r: [90, 0, 0] }));
      parts.push(P(cyl(0.09, 0.09, 0.06, 8), C.sun, { p: [0.36, 0.09, z], r: [90, 0, 0] }));
    }
    return parts;
  });

  def('toy_box', 'Toy Box', '🎁', ['toys'], 0.84, 1.46, 12, () => {
    const th = -110 * D2R, hingeY = 0.7, hingeZ = -0.41;
    const ax = [0, -Math.sin(th), Math.cos(th)], nl = [0, Math.cos(th), Math.sin(th)];
    const lid = [0, hingeY + ax[1] * 0.41 + nl[1] * 0.04, hingeZ + ax[2] * 0.41 + nl[2] * 0.04];
    return [
      P(rbox(1.2, 0.7, 0.8, 0.06), 0x4895ef, { p: [0, 0.35, 0] }),
      P(box(1.215, 0.08, 0.815), C.yellow, { p: [0, 0.06, 0] }),
      P(box(1.215, 0.08, 0.815), C.yellow, { p: [0, 0.62, 0] }),
      P(extZ(star(5, 0.13, 0.055), 0.02), C.yellow, { p: [0, 0.34, 0.405] }),
      P(box(1.08, 0.01, 0.68), C.navy, { p: [0, 0.703, 0] }),
      P(rbox(1.22, 0.08, 0.82, 0.04), 0xef476f, { p: lid, r: [th / D2R, 0, 0] }),
      P(sph(0.17, 10, 7), C.pink, { p: [-0.3, 0.76, 0.05] }),
      P(box(0.22, 0.22, 0.22), 0x80ed99, { p: [0.12, 0.76, 0.1], r: [15, 30, 10] }),
      P(sph(0.1, 8, 6), C.sun, { p: [0.38, 0.74, -0.1] }),
    ];
  });

  def('rocking_horse', 'Rocking Horse', '🐴', ['toys'], 0.95, 1.51, 12, () => {
    const R = 1.1, t = 0.045, cy = R + t, half = 35;
    const body = 0xfdf0d5, mane = 0x6f4518;
    const parts = [];
    for (const z of [-0.2, 0.2]) {
      parts.push(P(tor(R, t, 5, 7, 2 * half * D2R), C.red2, { p: [0, cy, z], r: [0, 0, -90 - half] }));
      for (const s of [-1, 1]) {
        const a = (-90 + s * half) * D2R;
        parts.push(P(sph(t, 4, 2), C.red2, { p: [Math.cos(a) * R, cy + Math.sin(a) * R, z] }));
      }
    }
    const yOn = (x) => cy - Math.sqrt(R * R - x * x);
    for (const x of [-0.5, 0.5]) parts.push(P(box(0.06, 0.06, 0.46), C.red2, { p: [x, yOn(x) + 0.03, 0] }));
    for (const x of [-0.36, 0.36]) for (const z of [-0.2, 0.2]) parts.push(rod([x, yOn(x) + 0.02, z], [x * 0.8, 0.52, z * 0.6], 0.04, body, 5));
    parts.push(
      P(sph(0.2, 8, 6), body, { p: [0, 0.6, 0], s: [2.0, 1, 0.85] }),
      P(sph(0.12, 6, 5), body, { p: [0.36, 0.82, 0], r: [0, 0, -35], s: [1, 1.9, 1] }),
      P(sph(0.13, 7, 5), body, { p: [0.55, 1.0, 0], r: [0, 0, -20], s: [1.5, 0.85, 0.8] }),
      P(box(0.06, 0.38, 0.05), mane, { p: [0.28, 0.9, 0], r: [0, 0, -35] }),
      P(cone(0.035, 0.08, 4), body, { p: [0.5, 1.12, 0.05] }),
      P(cone(0.035, 0.08, 4), body, { p: [0.5, 1.12, -0.05] }),
      P(sph(0.02, 4, 2), C.dark, { p: [0.6, 1.04, 0.09] }),
      P(sph(0.02, 4, 2), C.dark, { p: [0.6, 1.04, -0.09] }),
      P(cone(0.06, 0.25, 5), mane, { p: [-0.46, 0.51, 0], r: [0, 0, 150] }),
      P(sph(0.14, 6, 4), C.blue, { p: [0, 0.79, 0], s: [1, 0.35, 1.1] }),
      rod([0.52, 1.02, -0.17], [0.52, 1.02, 0.17], 0.02, C.gold, 5),
    );
    return G(parts, { s: 1.3 });
  });

  // ================================================================ garden
  function stemLeaves(h, col = C.leaf2) {
    return [
      P(cyl(0.015, 0.018, h, 6), col, { p: [0, h / 2, 0] }),
      P(sph(1, 6, 4), C.leaf, { p: [0.045, 0.11, 0], r: [0, 0, -22], s: [0.045, 0.16, 0.016] }),
      P(sph(1, 6, 4), C.leaf, { p: [-0.045, 0.1, 0], r: [0, 0, 22], s: [0.045, 0.15, 0.016] }),
    ];
  }

  def('tulip', 'Tulip', '🌷', ['garden'], 0.14, 0.57, 1, () => {
    const parts = stemLeaves(0.34);
    for (let i = 0; i < 3; i++) {
      const a = (i * 120 + 30) * D2R, c = Math.cos(a), s = Math.sin(a);
      parts.push(P(sph(0.06, 8, 5), C.tomato, { p: [c * 0.03, 0.38, s * 0.03], up: [c * 0.2, 1, s * 0.2], s: [0.78, 1.25, 0.78] }));
    }
    parts.push(P(sph(0.045, 6, 4), 0xc9184a, { p: [0, 0.39, 0] }));
    return G(parts, { s: 1.15 });
  });

  def('daisy', 'Daisy', '🌼', ['garden'], 0.15, 0.49, 1, () => {
    const head = [P(sph(0.045, 8, 5), C.sun, { s: [1, 0.55, 1] })];
    for (let i = 0; i < 8; i++) {
      const a = i * 45;
      head.push(P(sph(1, 6, 3), C.white, { p: [Math.cos(a * D2R) * 0.075, -0.004, Math.sin(a * D2R) * 0.075], r: [0, -a, 0], s: [0.075, 0.016, 0.034] }));
    }
    return [...stemLeaves(0.37), ...G(head, { p: [0, 0.38, 0.02], r: [25, 0, 0] })];
  });

  def('mushroom', 'Mushroom', '🍄', ['garden'], 0.22, 0.32, 1, () => {
    const parts = [
      P(lathe([0, 0, 0.075, 0, 0.06, 0.08, 0.055, 0.15, 0, 0.15], 10), 0xfdf0d5),
      P(lathe([0, 0.12, 0.17, 0.12, 0.21, 0.14, 0.2, 0.2, 0.14, 0.27, 0.07, 0.3, 0, 0.31], 12), C.tomato),
    ];
    const a = 0.205, b = 0.175, cy = 0.13;
    const spots = [[0, 0], [50, 20], [50, 140], [50, 260], [72, 80], [72, 200], [72, 320]];
    for (const [th, ph] of spots) {
      const t = th * D2R, f = ph * D2R;
      const p = [a * Math.sin(t) * Math.cos(f), cy + b * Math.cos(t), a * Math.sin(t) * Math.sin(f)];
      const n = [Math.sin(t) * Math.cos(f) / a, Math.cos(t) / b, Math.sin(t) * Math.sin(f) / a];
      parts.push(P(sph(0.034, 6, 3), C.white, { p, up: n, s: [1, 0.35, 1] }));
    }
    return parts;
  });

  def('flower_pot', 'Potted Plant', '🪴', ['garden'], 0.21, 0.6, 2, () => {
    const parts = [
      P(lathe([0, 0, 0.13, 0, 0.16, 0.24, 0.195, 0.245, 0.2, 0.3, 0.17, 0.3, 0.163, 0.26, 0, 0.26], 12), 0xe07a5f),
      P(cyl(0.167, 0.167, 0.02, 12), 0x6b4f3a, { p: [0, 0.272, 0] }),
      P(sph(1, 6, 4), C.leaf2, { p: [0, 0.43, 0], s: [0.05, 0.16, 0.025] }),
    ];
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 + 15) * D2R, c = Math.cos(a), s = Math.sin(a);
      const up = new T.Vector3(c * 0.75, 1, s * 0.75).normalize();
      parts.push(P(sph(1, 6, 4), i % 2 ? C.leaf : C.dkgreen, { p: [c * 0.02 + up.x * 0.14, 0.28 + up.y * 0.14, s * 0.02 + up.z * 0.14], up: [up.x, up.y, up.z], s: [0.06, 0.16, 0.022] }));
    }
    return parts;
  });

  def('watering_can', 'Watering Can', '🫖', ['garden'], 0.3, 0.37, 2, () => {
    const a = [0.1, 0.07, 0], b = [0.36, 0.3, 0];
    const d = new T.Vector3(b[0] - a[0], b[1] - a[1], 0).normalize();
    return [
      P(cyl(0.14, 0.14, 0.24, 12), C.leaf, { p: [0, 0.12, 0] }),
      P(cyl(0.1, 0.11, 0.03, 12), C.leaf3, { p: [-0.02, 0.255, 0] }),
      P(cyl(0.075, 0.075, 0.032, 10), C.dkgreen, { p: [-0.02, 0.257, 0] }),
      rod(a, b, 0.03, C.leaf, 6, 0.018),
      P(cyl(0.05, 0.03, 0.045, 8), C.dkgreen, { p: [b[0] + d.x * 0.02, b[1] + d.y * 0.02, 0], up: [d.x, d.y, 0] }),
      P(tor(0.1, 0.022, 5, 10, Math.PI), C.leaf, { p: [-0.03, 0.24, 0] }),
    ];
  });

  def('gnome', 'Garden Gnome', '🧙', ['garden'], 0.15, 0.74, 1, () => G([
    P(sph(0.045, 6, 4), 0x6f4518, { p: [-0.045, 0.03, 0.02], s: [1, 0.7, 1.4] }),
    P(sph(0.045, 6, 4), 0x6f4518, { p: [0.045, 0.03, 0.02], s: [1, 0.7, 1.4] }),
    P(lathe([0, 0.03, 0.1, 0.03, 0.11, 0.06, 0.085, 0.2, 0.06, 0.26, 0, 0.27], 10), C.blue),
    P(cyl(0.102, 0.102, 0.025, 10), C.dark, { p: [0, 0.12, 0] }),
    P(box(0.04, 0.03, 0.01), C.gold, { p: [0, 0.12, 0.102] }),
    P(sph(0.06, 8, 6), C.skin, { p: [0, 0.3, 0.015] }),
    P(cone(0.075, 0.16, 8), C.white, { p: [0, 0.225, 0.05], r: [180, 0, 0], s: [1, 1, 0.65] }),
    P(sph(0.022, 5, 3), 0xffa07a, { p: [0, 0.3, 0.075] }),
    P(sph(0.01, 4, 2), C.dark, { p: [-0.025, 0.32, 0.068] }),
    P(sph(0.01, 4, 2), C.dark, { p: [0.025, 0.32, 0.068] }),
    P(cone(0.08, 0.26, 8), C.tomato, { p: [0, 0.46, -0.01], r: [-8, 0, 0] }),
  ], { s: 1.25 }));

  def('bucket', 'Bucket', '🪣', ['garden'], 0.19, 0.41, 1, () => {
    const prof = [0, 0, 0.13, 0, 0.165, 0.28, 0.175, 0.285, 0.175, 0.3, 0.162, 0.3, 0.13, 0.04, 0, 0.04];
    return [
      P(lathe(prof, 12), C.grey),
      P(cyl(0.146, 0.144, 0.02, 12), 0x8d99ae, { p: [0, 0.1, 0] }),
      P(cyl(0.162, 0.159, 0.02, 12), 0x8d99ae, { p: [0, 0.22, 0] }),
      P(cyl(0.154, 0.154, 0.01, 12), 0x48cae4, { p: [0, 0.24, 0] }),
      P(tor(0.172, 0.01, 3, 10, Math.PI), C.grey2, { p: [0, 0.29, 0], r: [-50, 0, 0] }),
    ];
  });

  def('rock', 'Rock', '🪨', ['garden'], 0.45, 0.39, 3, () => [
    P(rockGeo(11, 0.32, 0.8), 0x9aa5b1, { p: [0, 0.18, 0] }),
    P(rockGeo(23, 0.15, 0.75), 0x8d99ae, { p: [0.33, 0.08, 0.12] }),
  ]);

  def('bush', 'Bush', '🌿', ['garden'], 0.9, 1.11, 13, () => {
    const blobs = [[0, 0.52, 0, 0.55, C.leaf], [0.47, 0.4, 0.08, 0.42, C.leaf2], [-0.46, 0.4, 0.1, 0.42, C.leaf3], [0.08, 0.4, 0.42, 0.4, C.leaf2], [-0.1, 0.43, -0.38, 0.42, C.leaf3]];
    const parts = blobs.map(([x, y, z, r, c]) => P(flat(ico(r, 1)), c, { p: [x, y, z] }));
    const berries = [[0, 0.3, 0.9], [1, 0.4, 0.6], [2, -0.3, 0.8], [3, 0.4, 0.7], [0, -0.5, 0.6], [4, 0.2, 0.9], [3, -0.4, 0.5]];
    for (const [k, dx, dy] of berries) {
      const [x, y, z, r] = blobs[k];
      const d = new T.Vector3(dx, dy, k === 4 ? -0.6 : 0.6).normalize();
      parts.push(P(sph(0.055, 5, 3), C.pink, { p: [x + d.x * r * 0.95, y + d.y * r * 0.95, z + d.z * r * 0.95] }));
    }
    return parts;
  });

  def('wheelbarrow', 'Wheelbarrow', '🛒', ['garden'], 1.02, 0.77, 10, () => {
    const parts = [
      ...G([P(flat(cyl(0.5, 0.36, 0.34, 4)), C.tomato, { r: [0, 45, 0] })], { p: [0, 0.5, 0], s: [1.35, 1, 0.9] }),
      P(flat(ico(0.42, 1)), 0x7f5539, { p: [0, 0.665, 0], s: [1.05, 0.22, 0.7] }),
      P(cyl(0.17, 0.17, 0.08, 10), C.dark, { p: [0.72, 0.17, 0], r: [90, 0, 0] }),
      P(cyl(0.06, 0.06, 0.09, 6), C.sun, { p: [0.72, 0.17, 0], r: [90, 0, 0] }),
    ];
    for (const s of [-1, 1]) {
      parts.push(rod([0.42, 0.38, s * 0.1], [0.72, 0.17, s * 0.05], 0.02, C.grey2, 5));
      parts.push(rod([-0.3, 0.55, s * 0.22], [-0.95, 0.48, s * 0.26], 0.03, C.wood2, 6));
      parts.push(P(cyl(0.035, 0.035, 0.14, 6), C.dark, { p: [-0.99, 0.476, s * 0.262], r: [0, 0, 84] }));
      parts.push(rod([-0.25, 0.37, s * 0.2], [-0.3, 0, s * 0.22], 0.022, C.grey2, 5));
    }
    return parts;
  });

  def('birdhouse', 'Birdhouse', '🏠', ['garden'], 0.29, 0.9, 3, () => {
    const ang = Math.atan2(0.13, 0.15), L = 0.25;
    const parts = [
      P(box(0.22, 0.04, 0.22), C.leaf2, { p: [0, 0.02, 0] }),
      P(cyl(0.035, 0.04, 0.4, 6), 0x9c6644, { p: [0, 0.22, 0] }),
      P(box(0.3, 0.3, 0.28), C.yellow, { p: [0, 0.57, 0] }),
      P(extZ(poly([[-0.15, 0], [0.15, 0], [0, 0.13]]), 0.28), C.yellow, { p: [0, 0.72, 0] }),
      P(cyl(0.05, 0.05, 0.02, 10), C.dark, { p: [0, 0.62, 0.141], r: [90, 0, 0] }),
      rod([0, 0.53, 0.14], [0, 0.53, 0.22], 0.012, 0x9c6644, 5),
    ];
    for (const s of [-1, 1]) {
      parts.push(P(box(L, 0.03, 0.38), C.red2, { p: [s * (0.075 + Math.sin(ang) * 0.015), 0.72 + 0.065 + Math.cos(ang) * 0.015, 0], r: [0, 0, -s * ang / D2R] }));
    }
    return parts;
  });

  // ================================================================ beach
  def('seashell', 'Seashell', '🐚', ['beach'], 0.15, 0.07, 1, () => {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const a = -60 + i * 20, ar = a * D2R, mid = 1 - Math.abs(i - 3) / 3;
      parts.push(P(sph(1, 6, 4), i % 2 ? 0xff9e8a : 0xffc4a8, { p: [Math.sin(ar) * 0.09, 0.03 + mid * 0.008, -0.07 + Math.cos(ar) * 0.09], r: [0, a, 0], s: [0.042, 0.03 + mid * 0.008, 0.1] }));
    }
    parts.push(P(box(0.08, 0.03, 0.04), 0xff9e8a, { p: [0, 0.018, -0.075] }));
    return G(parts, { s: 0.85 });
  });

  def('starfish', 'Starfish', '⭐', ['beach'], 0.24, 0.1, 1, () => {
    const parts = [P(ext(star(5, 0.19, 0.08), 0.035, 0.018, 2), C.coral)];
    for (let i = 0; i < 5; i++) {
      const a = (90 + i * 72) * D2R;
      parts.push(P(sph(0.017, 5, 3), 0xffd6a5, { p: [Math.cos(a) * 0.1, 0.071, -Math.sin(a) * 0.1] }));
    }
    parts.push(P(sph(0.022, 5, 3), 0xffd6a5, { p: [0, 0.071, 0] }));
    return parts;
  });

  def('crab', 'Crab', '🦀', ['beach'], 0.36, 0.25, 2, () => {
    const red = 0xf94144, parts = [P(sph(0.13, 8, 6), red, { p: [0, 0.1, 0], s: [1.3, 0.55, 1] })];
    for (const s of [-1, 1]) {
      parts.push(rod([s * 0.05, 0.12, 0.08], [s * 0.06, 0.2, 0.1], 0.012, red, 4));
      parts.push(P(sph(0.03, 6, 4), C.white, { p: [s * 0.06, 0.21, 0.1] }));
      parts.push(P(sph(0.015, 4, 3), C.black, { p: [s * 0.06, 0.218, 0.124] }));
      parts.push(rod([s * 0.14, 0.1, 0.05], [s * 0.23, 0.1, 0.14], 0.025, red, 5));
      parts.push(P(sph(0.065, 6, 4), red, { p: [s * 0.25, 0.1, 0.19], r: [0, s * 20, 0], s: [1, 0.7, 1.25] }));
      parts.push(P(cone(0.03, 0.08, 5), red, { p: [s * 0.265, 0.1, 0.28], r: [90, 0, 0] }));
      for (const z of [-0.08, -0.02, 0.04]) parts.push(rod([s * 0.13, 0.08, z], [s * 0.27, 0.012, z - 0.04], 0.018, red, 4));
    }
    return parts;
  });

  def('sandcastle', 'Sandcastle', '🏰', ['beach'], 0.54, 1.09, 7, () => {
    const s1 = 0xe9c46a, s2 = 0xf2cc8f;
    const parts = [
      P(box(0.72, 0.22, 0.72), s1, { p: [0, 0.11, 0] }),
      P(cyl(0.16, 0.17, 0.52, 10), s2, { p: [0, 0.48, 0] }),
      P(cone(0.19, 0.2, 10), 0xe76f51, { p: [0, 0.84, 0] }),
      rod([0, 0.93, 0], [0, 1.08, 0], 0.01, C.dkbrown, 4),
      P(extZ(poly([[0, 0], [0.12, -0.035], [0, -0.07]]), 0.01), C.red, { p: [0, 1.08, 0] }),
      P(box(0.12, 0.15, 0.02), 0x7f5539, { p: [0, 0.075, 0.36] }),
      P(box(0.06, 0.09, 0.02), 0x7f5539, { p: [0, 0.55, 0.16] }),
    ];
    for (const x of [-0.29, 0.29]) for (const z of [-0.29, 0.29]) {
      parts.push(P(cyl(0.11, 0.12, 0.4, 8), s2, { p: [x, 0.2, z] }));
      for (let i = 0; i < 4; i++) {
        const a = (45 + i * 90) * D2R;
        parts.push(P(box(0.06, 0.06, 0.06), s2, { p: [x + Math.cos(a) * 0.075, 0.43, z + Math.sin(a) * 0.075], r: [0, -(45 + i * 90), 0] }));
      }
    }
    return parts;
  });

  def('sand_bucket', 'Bucket & Spade', '🪣', ['beach'], 0.18, 0.5, 1, () => {
    const prof = [0, 0, 0.12, 0, 0.15, 0.24, 0.165, 0.25, 0.165, 0.27, 0.148, 0.27, 0.12, 0.04, 0, 0.04];
    const a = [0, 0.25, 0], b = [0.09, 0.48, 0.05];
    const d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    return [
      P(lathe(prof, 12), 0xff4d6d),
      P(sph(0.145, 10, 4), C.sand, { p: [0, 0.225, 0], s: [1, 0.3, 1] }),
      P(tor(0.16, 0.01, 3, 10, Math.PI), C.sun, { p: [0, 0.26, 0], r: [-60, 0, 0] }),
      P(box(0.09, 0.1, 0.012), C.blue, { p: [a[0] + d.x * 0.02, a[1] + d.y * 0.02, a[2] + d.z * 0.02], up: [d.x, d.y, d.z] }),
      rod(a, b, 0.014, C.sun, 5),
      P(cyl(0.014, 0.014, 0.08, 5), C.sun, { p: b, r: [0, 0, 90] }),
    ];
  });

  def('beach_ball', 'Beach Ball', '🏐', ['beach'], 0.23, 0.46, 2, () => {
    const cols = [C.red, C.white, C.blue, C.sun, C.white, 0x2dc653];
    const parts = cols.map((c, i) => P(new T.SphereGeometry(0.22, 3, 8, (i * 60) * D2R, 60 * D2R), c, { p: [0, 0.22, 0] }));
    parts.push(P(sph(0.05, 6, 3), C.white, { p: [0, 0.438, 0], s: [1, 0.35, 1] }));
    return parts;
  });

  def('surfboard', 'Surfboard', '🏄', ['beach'], 0.88, 0.08, 4, () => {
    const L = 0.85, W = 0.24, N = 16, up = [], lo = [];
    for (let i = 0; i <= N; i++) {
      const t = -1 + (2 * i) / N, w = W * Math.pow(Math.max(0, 1 - t * t), 0.5) * (t > 0 ? 1 - 0.35 * t : 1);
      up.push([t * L, w]); lo.unshift([t * L, -w]);
    }
    const top = 0.035 + 0.036;
    return [
      P(ext(poly(up.concat(lo.slice(1, -1))), 0.035, 0.018, 1), 0x00b4d8),
      P(box(1.3, 0.006, 0.045), C.white, { p: [0.03, top + 0.003, 0] }),
      P(box(0.06, 0.006, 0.36), C.orange, { p: [-0.45, top + 0.003, 0] }),
      P(box(0.04, 0.006, 0.24), C.orange, { p: [0.45, top + 0.003, 0] }),
    ];
  });

  def('ice_cream', 'Ice Cream', '🍦', ['beach'], 0.12, 0.61, 1, () => [
    P(flat(cone(0.09, 0.3, 10)), C.tan, { p: [0, 0.15, 0], r: [180, 0, 0] }),
    P(sph(0.1, 10, 7), 0xff8fab, { p: [0, 0.33, 0] }),
    P(tor(0.085, 0.025, 5, 10), 0xff8fab, { p: [0, 0.295, 0], r: [90, 0, 0] }),
    P(sph(0.088, 10, 7), 0xfff1c1, { p: [0, 0.46, 0] }),
    P(sph(0.03, 6, 4), 0xe5383b, { p: [0, 0.555, 0] }),
    rod([0, 0.575, 0], [0.015, 0.6, 0], 0.005, C.dkgreen, 4),
  ]);

  def('umbrella', 'Beach Umbrella', '⛱️', ['beach'], 1.21, 2.19, 12, () => {
    const parts = [
      P(cyl(0.035, 0.035, 0.6, 6), C.red, { p: [0, 0.3, 0] }),
      P(cyl(0.035, 0.035, 0.6, 6), C.white, { p: [0, 0.9, 0] }),
      P(cyl(0.035, 0.035, 0.55, 6), C.red, { p: [0, 1.475, 0] }),
      P(sph(0.05, 6, 4), C.white, { p: [0, 2.13, 0] }),
    ];
    for (let i = 0; i < 8; i++) {
      const g = new T.ConeGeometry(1.2, 0.42, 2, 1, true, i * 45 * D2R, 45 * D2R);
      const c = i % 2 ? C.sun : C.red;
      parts.push(P(g, c, { p: [0, 1.91, 0] }));
      parts.push(P(flip(g), c, { p: [0, 1.9, 0] }));
    }
    return parts;
  });

  def('deck_chair', 'Deck Chair', '🪑', ['beach'], 0.91, 1.41, 9, () => {
    const wood = 0xd4a373, parts = [];
    for (const z of [-0.28, 0.28]) {
      parts.push(rod([0.5, 0, z], [-0.42, 0.92, z], 0.028, wood, 6));
      parts.push(rod([-0.55, 0, z], [0.4, 0.44, z], 0.028, wood, 6));
    }
    for (const [x, y] of [[-0.42, 0.92], [0.4, 0.44], [0.5, 0.03], [-0.55, 0.03]]) parts.push(rod([x, y, -0.3], [x, y, 0.3], 0.025, wood, 6));
    const a = [-0.4, 0.88], b = [0.38, 0.4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (let i = 0; i < 5; i++) {
      parts.push(P(box(len, 0.012, 0.104), i % 2 ? C.white : C.blue, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.02, -0.208 + i * 0.104], r: [0, 0, ang / D2R] }));
    }
    return G(parts, { s: 1.45 });
  });

  def('beach_hut', 'Beach Hut', '🛖', ['beach'], 1.75, 2.88, 44, () => {
    const zc = -0.25, ang = Math.atan2(0.75, 1.12), sl = Math.hypot(1.12, 0.75);
    const parts = [P(box(2.4, 0.18, 2.3), 0xc9a27e, { p: [0, 0.09, 0] })];
    for (let k = 0; k < 6; k++) parts.push(P(box(0.36, 1.8, 1.7), k % 2 ? C.white : 0x4895ef, { p: [-0.9 + k * 0.36, 1.08, zc] }));
    parts.push(P(extZ(poly([[-1.1, 0], [1.1, 0], [0, 0.74]]), 1.72), C.white, { p: [0, 1.98, zc] }));
    for (const s of [-1, 1]) {
      parts.push(P(box(sl + 0.2, 0.1, 2.0), C.tomato, { p: [s * (0.56 + Math.sin(ang) * 0.05), 1.98 + 0.375 + Math.cos(ang) * 0.05, zc], r: [0, 0, -s * ang / D2R] }));
    }
    parts.push(
      P(rbox(0.6, 1.2, 0.06, 0.04), C.yellow, { p: [0, 0.8, zc + 0.86] }),
      P(sph(0.04, 6, 4), C.dark, { p: [0.2, 0.8, zc + 0.9] }),
      P(cyl(0.17, 0.17, 0.04, 12), 0x4895ef, { p: [0, 2.25, zc + 0.87], r: [90, 0, 0] }),
      P(box(0.9, 0.06, 0.4), 0xb08968, { p: [0, 0.21, 0.83] }),
    );
    return parts;
  });

  // ================================================================ city
  def('traffic_cone', 'Traffic Cone', '🚧', ['city'], 0.25, 0.51, 2, () => {
    const rAtY = (y) => 0.135 - (0.1 * (y - 0.045)) / 0.46;
    return [
      P(box(0.34, 0.045, 0.34), 0xf77f00, { p: [0, 0.0225, 0] }),
      P(cyl(0.035, 0.135, 0.46, 12), 0xff7b00, { p: [0, 0.275, 0] }),
      P(cyl(rAtY(0.24) + 0.004, rAtY(0.17) + 0.004, 0.07, 12), C.white, { p: [0, 0.205, 0] }),
      P(cyl(rAtY(0.36) + 0.004, rAtY(0.31) + 0.004, 0.05, 12), C.white, { p: [0, 0.335, 0] }),
    ];
  });

  def('hydrant', 'Fire Hydrant', '🧯', ['city'], 0.18, 0.53, 1, () => [
    P(lathe([0, 0, 0.14, 0, 0.14, 0.04, 0.1, 0.06, 0.1, 0.34, 0.125, 0.35, 0.125, 0.38, 0.1, 0.39, 0.085, 0.44, 0.04, 0.48, 0, 0.49], 12), C.tomato),
    P(cyl(0.03, 0.03, 0.04, 6), C.grey, { p: [0, 0.5, 0] }),
    P(cyl(0.04, 0.04, 0.3, 8), C.tomato, { p: [0, 0.25, 0], r: [0, 0, 90] }),
    P(cyl(0.045, 0.045, 0.03, 8), C.grey, { p: [0.15, 0.25, 0], r: [0, 0, 90] }),
    P(cyl(0.045, 0.045, 0.03, 8), C.grey, { p: [-0.15, 0.25, 0], r: [0, 0, 90] }),
    P(cyl(0.055, 0.055, 0.08, 8), C.tomato, { p: [0, 0.22, 0.1], r: [90, 0, 0] }),
    P(cyl(0.06, 0.06, 0.03, 8), C.grey, { p: [0, 0.22, 0.14], r: [90, 0, 0] }),
  ]);

  def('trash_can', 'Trash Can', '🗑️', ['city'], 0.26, 0.68, 2, () => [
    P(flat(cyl(0.23, 0.2, 0.52, 12)), 0x2a9d8f, { p: [0, 0.26, 0] }),
    P(cyl(0.21, 0.21, 0.035, 12), C.grey2, { p: [0, 0.1, 0] }),
    P(cyl(0.232, 0.232, 0.035, 12), C.grey2, { p: [0, 0.45, 0] }),
    P(lathe([0, 0.52, 0.25, 0.52, 0.25, 0.55, 0.2, 0.6, 0, 0.62], 12), C.grey2),
    P(box(0.12, 0.03, 0.035), C.dark, { p: [0, 0.63, 0] }),
    P(flat(ico(0.05, 0)), C.white, { p: [0.1, 0.63, 0.06] }),
  ]);

  def('bicycle', 'Bicycle', '🚲', ['city'], 0.82, 0.84, 7, () => {
    const fr = 0x00b4d8, dk = C.dark;
    const Ra = [-0.48, 0.33, 0], BB = [-0.05, 0.3, 0], S = [-0.15, 0.72, 0], S2 = [-0.13, 0.66, 0], H = [0.33, 0.72, 0], Hb = [0.36, 0.6, 0], Fa = [0.48, 0.33, 0];
    const parts = [];
    for (const x of [-0.48, 0.48]) {
      parts.push(P(tor(0.3, 0.028, 4, 16), dk, { p: [x, 0.33, 0] }));
      parts.push(P(cyl(0.04, 0.04, 0.06, 6), C.grey, { p: [x, 0.33, 0], r: [90, 0, 0] }));
      parts.push(P(box(0.56, 0.012, 0.012), C.grey, { p: [x, 0.33, 0], r: [0, 0, 45] }));
      parts.push(P(box(0.56, 0.012, 0.012), C.grey, { p: [x, 0.33, 0], r: [0, 0, -45] }));
    }
    parts.push(
      rod(BB, S, 0.025, fr, 5), rod(S2, H, 0.025, fr, 5), rod(BB, Hb, 0.028, fr, 5),
      rod(Ra, BB, 0.02, fr, 5), rod(Ra, S2, 0.02, fr, 5), rod(Hb, Fa, 0.022, fr, 5), rod(Hb, [0.32, 0.82, 0], 0.022, fr, 5),
      rod([0.32, 0.82, -0.25], [0.32, 0.82, 0.25], 0.02, dk, 5),
      P(box(0.2, 0.05, 0.1), dk, { p: [-0.17, 0.76, 0] }),
      P(cyl(0.05, 0.05, 0.1, 8), C.grey2, { p: BB, r: [90, 0, 0] }),
    );
    return parts;
  });

  def('mailbox', 'Post Box', '📮', ['city'], 0.21, 0.81, 2, () => [
    P(cyl(0.19, 0.2, 0.06, 12), C.dark, { p: [0, 0.03, 0] }),
    P(cyl(0.16, 0.16, 0.6, 12), 0xd90429, { p: [0, 0.36, 0] }),
    P(cyl(0.18, 0.18, 0.04, 12), 0xb5001f, { p: [0, 0.67, 0] }),
    P(hemi(0.17, 12, 4), 0xd90429, { p: [0, 0.69, 0], s: [1, 0.55, 1] }),
    P(box(0.15, 0.025, 0.02), C.black, { p: [0, 0.56, 0.158] }),
    P(box(0.1, 0.07, 0.012), C.white, { p: [0, 0.44, 0.162] }),
    P(sph(0.025, 6, 4), C.gold, { p: [0, 0.78, 0] }),
  ]);

  def('street_lamp', 'Street Lamp', '💡', ['city'], 0.21, 3.31, 4, () => {
    const pole = 0x3d5a80;
    return [
      P(lathe([0, 0, 0.2, 0, 0.2, 0.08, 0.12, 0.14, 0.07, 0.3, 0, 0.3], 8), C.dark),
      P(cyl(0.05, 0.06, 2.4, 8), pole, { p: [0, 1.5, 0] }),
      rod([-0.16, 2.5, 0], [0.16, 2.5, 0], 0.02, pole, 5),
      P(cyl(0.14, 0.1, 0.06, 8), C.dark, { p: [0, 2.73, 0] }),
      P(flat(cyl(0.13, 0.1, 0.3, 6)), 0xfff3b0, { p: [0, 2.91, 0] }),
      P(flat(cone(0.2, 0.18, 6)), C.dark, { p: [0, 3.15, 0] }),
      P(sph(0.04, 6, 4), C.gold, { p: [0, 3.26, 0] }),
    ];
  });

  def('traffic_light', 'Traffic Light', '🚦', ['city'], 0.2, 2.35, 4, () => [
    P(cyl(0.14, 0.16, 0.08, 10), C.dark, { p: [0, 0.04, 0] }),
    P(cyl(0.045, 0.045, 1.6, 8), C.grey2, { p: [0, 0.88, 0] }),
    P(rbox(0.26, 0.66, 0.22, 0.05), 0xffc300, { p: [0, 2.01, 0] }),
    ...[[2.21, 0xff2d2d], [2.01, 0xffb703], [1.81, 0x2dc653]].flatMap(([y, c]) => [
      P(cyl(0.065, 0.065, 0.03, 12), c, { p: [0, y, 0.11], r: [90, 0, 0] }),
      P(box(0.16, 0.02, 0.07), C.dark, { p: [0, y + 0.08, 0.145] }),
    ]),
  ]);

  def('car', 'Car', '🚗', ['city'], 1.66, 1.42, 28, () => {
    const parts = [
      P(rbox(2.9, 0.62, 1.4, 0.22), C.red, { p: [0, 0.51, 0] }),
      P(rbox(1.6, 0.58, 1.25, 0.2), C.ice, { p: [-0.15, 1.06, 0] }),
      P(box(1.45, 0.1, 1.2), C.red, { p: [-0.15, 1.36, 0] }),
      P(box(0.1, 0.5, 1.27), C.red, { p: [-0.15, 1.07, 0] }),
    ];
    for (const z of [-0.45, 0.45]) {
      parts.push(P(box(0.04, 0.12, 0.25), C.sun, { p: [1.45, 0.62, z] }));
      parts.push(P(box(0.04, 0.12, 0.25), C.red2, { p: [-1.45, 0.62, z] }));
    }
    parts.push(P(box(0.1, 0.12, 1.3), C.grey, { p: [1.47, 0.3, 0] }), P(box(0.1, 0.12, 1.3), C.grey, { p: [-1.47, 0.3, 0] }));
    for (const x of [-0.95, 0.95]) for (const z of [-0.6, 0.6]) {
      parts.push(P(cyl(0.3, 0.3, 0.24, 9), C.dark, { p: [x, 0.3, z], r: [90, 0, 0] }));
      parts.push(P(cyl(0.15, 0.15, 0.25, 5), 0xdee2e6, { p: [x, 0.3, z], r: [90, 0, 0] }));
    }
    return parts;
  });

  def('bus', 'Bus', '🚌', ['city'], 2.52, 1.91, 53, () => {
    const yel = 0xffc300, parts = [
      P(rbox(4.6, 1.55, 1.6, 0.2), yel, { p: [0, 1.125, 0] }),
      P(box(4.0, 0.5, 1.62), C.ice, { p: [-0.15, 1.45, 0] }),
      P(box(4.62, 0.06, 1.62), C.dark, { p: [0, 0.95, 0] }),
      P(box(0.03, 0.6, 1.3), C.ice, { p: [2.3, 1.4, 0] }),
      P(box(0.5, 1.0, 0.02), 0x5e7c8a, { p: [1.6, 0.95, 0.81] }),
      P(box(0.12, 0.18, 1.62), C.dark, { p: [2.32, 0.42, 0] }),
      P(box(0.12, 0.18, 1.62), C.dark, { p: [-2.32, 0.42, 0] }),
    ];
    for (let k = 0; k < 6; k++) parts.push(P(box(0.08, 0.5, 1.64), yel, { p: [-1.9 + k * 0.62, 1.45, 0] }));
    for (const z of [-0.55, 0.55]) {
      parts.push(P(box(0.03, 0.14, 0.24), 0xfff3b0, { p: [2.31, 0.65, z] }));
      parts.push(P(box(0.03, 0.14, 0.24), C.red2, { p: [-2.31, 0.65, z] }));
    }
    for (const x of [-1.5, 1.5]) for (const z of [-0.68, 0.68]) {
      parts.push(P(cyl(0.38, 0.38, 0.3, 10), C.dark, { p: [x, 0.38, z], r: [90, 0, 0] }));
      parts.push(P(cyl(0.18, 0.18, 0.31, 6), C.grey, { p: [x, 0.38, z], r: [90, 0, 0] }));
    }
    return parts;
  });

  def('kiosk', 'Kiosk', '🏪', ['city'], 1.44, 2.08, 32, () => {
    const parts = [
      P(box(1.8, 1.6, 1.4), C.cream, { p: [0, 0.8, 0] }),
      P(box(1.84, 0.25, 1.44), 0x2a9d8f, { p: [0, 0.125, 0] }),
      P(box(1.3, 0.6, 0.02), 0x264653, { p: [0, 1.05, 0.71] }),
      P(box(1.5, 0.06, 0.25), 0xdda15e, { p: [0, 0.75, 0.8] }),
      P(box(2.0, 0.12, 1.6), 0x2a9d8f, { p: [0, 1.66, 0] }),
      P(rbox(1.2, 0.35, 0.08, 0.04), C.tomato, { p: [0, 1.9, 0.5] }),
      P(extZ(star(5, 0.12, 0.05), 0.02), C.yellow, { p: [0, 1.9, 0.55] }),
    ];
    const goods = [[-0.55, 0x3a86ff], [-0.2, C.sun], [0.15, C.pink], [0.5, C.green]];
    for (const [x, c] of goods) parts.push(P(box(0.18, 0.14, 0.12), c, { p: [x, 0.85, 0.8], r: [0, x * 30, 0] }));
    for (let k = 0; k < 6; k++) {
      parts.push(P(box(0.3, 0.04, 0.6), k % 2 ? C.white : C.tomato, { p: [-0.75 + k * 0.3, 1.55 - 0.3 * Math.sin(25 * D2R), 0.7 + 0.3 * Math.cos(25 * D2R)], r: [25, 0, 0] }));
    }
    return parts;
  });

  // ---------------------------------------------------------------- theme index
  const THEMES = ['picnic', 'kitchen', 'toys', 'garden', 'beach', 'city'];
  const themes = {};
  for (const th of THEMES) themes[th] = [];
  for (const id of Object.keys(kinds)) {
    const k = kinds[id];
    for (const th of THEMES) if (k.themes.includes(th) || k.themes.includes('all')) themes[th].push(id);
  }

  window.HH_MODELS = { kinds, mergeParts, themes };
})();
