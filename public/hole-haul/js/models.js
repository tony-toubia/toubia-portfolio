// TEMPORARY stand-in for the real object library (replaced before commit).
(() => {
  const T = THREE;
  const mergeParts = (parts) => {
    const pos = [], nor = [], col = [];
    for (const p of parts) {
      let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      if (p.matrix) g.applyMatrix4(p.matrix);
      g.computeVertexNormals();
      const c = new T.Color(p.color).convertSRGBToLinear();
      const a = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < a.count; i++) { pos.push(a.getX(i), a.getY(i), a.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c.r, c.g, c.b); }
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return out;
  };
  const M = (x, y, z) => new T.Matrix4().makeTranslation(x, y, z);
  const ball = (r, color) => () => mergeParts([{ geo: new T.SphereGeometry(r, 12, 8), color, matrix: M(0, r, 0) }]);
  const box = (w, h, d, color) => () => mergeParts([{ geo: new T.BoxGeometry(w, h, d), color, matrix: M(0, h / 2, 0) }]);
  const cyl = (r, h, color) => () => mergeParts([{ geo: new T.CylinderGeometry(r, r, h, 16), color, matrix: M(0, h / 2, 0) }]);
  const kinds = {};
  const add = (id, name, emoji, themes, r, h, xp, build) => { kinds[id] = { name, emoji, themes, r, h, xp, build }; };
  const themes = ['picnic', 'kitchen', 'toys', 'garden', 'beach', 'city'];
  const em = ['🍎', '🍩', '🦆', '🌷', '🐚', '🚦'];
  themes.forEach((t, i) => {
    add(t + '_a', 'Small A', em[i], [t], 0.2, 0.4, 1, ball(0.2, 0xff4444));
    add(t + '_b', 'Small B', '🍊', [t], 0.28, 0.3, 2, cyl(0.28, 0.3, 0x44aaff));
    add(t + '_c', 'Small C', '🍪', [t], 0.33, 0.25, 2, box(0.4, 0.25, 0.4, 0xffcc33));
    add(t + '_d', 'Small D', '🧁', [t], 0.3, 0.35, 2, ball(0.25, 0xaa66ff));
    add(t + '_m1', 'Medium 1', '🧸', [t], 0.6, 0.8, 6, box(0.8, 0.8, 0.8, 0x66cc66));
    add(t + '_m2', 'Medium 2', '🥁', [t], 0.75, 0.6, 9, cyl(0.7, 0.6, 0xff8844));
    add(t + '_l', 'Large', '🧺', [t], 1.3, 1.2, 25, box(1.6, 1.2, 1.6, 0x8866aa));
    add(t + '_h', 'Huge', '🌳', [t], 2.2, 3, 60, cyl(2.0, 3, 0x337744));
  });
  add('coin', 'Coin', '🪙', ['all'], 0.14, 0.05, 1, cyl(0.14, 0.05, 0xffd23f));
  window.HH_MODELS = { kinds, mergeParts };
})();
