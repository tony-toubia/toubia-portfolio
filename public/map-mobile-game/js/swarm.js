/**
 * Primal Hunt - the swarm, custom-built.
 *
 * Hundreds of these are alive at once, so each creature type stays one baked
 * geometry drawn with InstancedMesh (plus one instanced outline). What is new
 * is that they move: every leg, wing, tail and sac is baked with a pivot and
 * a motion (swing, flap, wag or pulse), and the vertex shader plays it with a
 * per-instance phase - so a horde scuttles out of step at no CPU cost.
 * Parts flagged as glowing are drawn unlit and bright, so eyes and markings
 * glow like the monsters' do.
 *
 * Same look as the monsters (creatures.js): faceted, dark, with glowing
 * markings in each creature's eye colour. Prey animals stay natural.
 */
window.PH = window.PH || {};

(() => {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const BONE = 0xe6d9b8;
  // Motions, as baked into aAnim.x.
  const SWING = 1, FLAP = 2, WAG = 3, PULSE = 4;

  /** Parts merged into one geometry, each with its own colour, glow and motion. */
  class Kit {
    constructor(seed = 1) { this.parts = []; this.seed = seed; }
    rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

    /**
     * o: { color, glow, at, rot, scale, jitter, anim: [motion, amplitude, phase, speed], pivot }
     * The pivot is in the creature's space (where a leg meets the body).
     */
    add(geo, o = {}) { this.parts.push({ geo, ...o }); return this; }

    /** A leg from the hip at (x, h, z) to the ground, swinging fore and aft. */
    leg(x, h, z, r, color, phase, amp, speed, splay = 0) {
      const g = new THREE.CylinderGeometry(r, r * 0.7, h, 5);
      return this.add(g, { color, at: V(x + Math.sin(splay) * h * 0.5, h / 2, z), rot: new THREE.Euler(0, 0, splay),
        anim: [SWING, amp, phase, speed], pivot: V(x, h, z) });
    }

    /**
     * Merge, sized so its length matches `len` (the old model's length; legs,
     * wings and claws stick out sideways) and the feet stand at y = 0.
     */
    bake(len) {
      const pos = [], nor = [], col = [], glow = [], anim = [], piv = [];
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), lin = new THREE.Color();
      for (const p of this.parts) {
        const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
        q.setFromEuler(p.rot || new THREE.Euler());
        m.compose(p.at || V(0, 0, 0), q, p.scale || V(1, 1, 1));
        g.applyMatrix4(m);
        g.computeVertexNormals();
        const P = g.attributes.position, N = g.attributes.normal;
        const a = p.anim || [0, 0, 0, 0], pv = p.pivot || V(0, 0, 0);
        for (let i = 0; i < P.count; i++) {
          if (i % 3 === 0) {
            const j = p.jitter === undefined ? (p.glow ? 0 : 0.1) : p.jitter;
            // Halfway between the colour as authored and its linear value (which
            // the monsters use): lighter than the monsters, so a horde reads
            // against the grass from up high, without washing out to pastel.
            c.set(p.color === undefined ? 0xffffff : p.color);
            c.lerp(lin.copy(c).convertSRGBToLinear(), 0.5).multiplyScalar(1 + (this.rnd() - 0.5) * 2 * j);
          }
          pos.push(P.getX(i), P.getY(i), P.getZ(i));
          nor.push(N.getX(i), N.getY(i), N.getZ(i));
          col.push(c.r, c.g, c.b);
          glow.push(p.glow ? 1 : 0);
          anim.push(a[0], a[1], a[2], a[3]);
          piv.push(pv.x, pv.y, pv.z);
        }
      }
      // Size to the old model's footprint, feet on the ground.
      let minY = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
        minY = Math.min(minY, pos[i + 1]);
        minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2]);
      }
      const k = len / (maxZ - minZ);
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] *= k; pos[i + 1] = (pos[i + 1] - minY) * k; pos[i + 2] *= k;
        piv[i] *= k; piv[i + 1] = (piv[i + 1] - minY) * k; piv[i + 2] *= k;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow, 1));
      geo.setAttribute('aAnim', new THREE.Float32BufferAttribute(anim, 4));
      geo.setAttribute('aPivot', new THREE.Float32BufferAttribute(piv, 3));
      const line = new Float32Array(pos.length / 3).fill(len * 0.045);   // outline thickness, in these units
      geo.setAttribute('aLine', new THREE.BufferAttribute(line, 1));
      geo.computeBoundingSphere();
      return geo;
    }
  }

  const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  const cone = (r, h, n = 5) => new THREE.ConeGeometry(r, h, n);

  /* ── The brood ────────────────────────────────────────────── */
  const DESIGNS = {
    // A skittering beetle: six legs in a tripod gait, a glowing seam down its
    // shell, twitching antennae and mandibles.
    critter: (K, c) => {
      K.add(ico(0.5, 1), { color: c.primary, at: V(0, 0.42, 0), scale: V(0.9, 0.55, 1.15) });
      K.add(ico(0.5, 1), { color: c.secondary, at: V(0, 0.36, -0.05), scale: V(0.95, 0.42, 1.2) });
      K.add(box(0.06, 0.04, 0.9), { glow: true, color: c.eye, at: V(0, 0.7, -0.02) });
      K.add(ico(0.26, 0), { color: c.secondary, at: V(0, 0.4, 0.62) });
      for (const s of [-1, 1]) {
        K.add(ico(0.07, 0), { glow: true, color: c.eye, at: V(s * 0.12, 0.48, 0.8) });
        K.add(cone(0.035, 0.22, 4), { color: BONE, at: V(s * 0.09, 0.3, 0.88), rot: new THREE.Euler(1.5, 0, s * 0.3),
          anim: [WAG, 0.25 * s, 0, 14], pivot: V(s * 0.09, 0.3, 0.78) });
        K.add(box(0.025, 0.025, 0.4), { color: c.secondary, at: V(s * 0.16, 0.62, 0.92), rot: new THREE.Euler(-0.6, s * 0.35, 0),
          anim: [WAG, 0.35, s, 7], pivot: V(s * 0.1, 0.5, 0.75) });
        [0.4, 0, -0.4].forEach((z, i) => {
          const ph = (i % 2 === 0) === (s > 0) ? 0 : Math.PI;   // tripod: L1 R2 L3 together
          K.leg(s * 0.42, 0.42, z, 0.04, c.secondary, ph, 0.55, 18, s * 0.7);
        });
      }
    },

    // A buzzing mite: a round body hovering on four blurred wings, one big
    // glowing eye and a glowing stinger.
    swarmling: (K, c) => {
      K.add(ico(0.38, 1), { color: c.primary, at: V(0, 0.75, 0), scale: V(1, 0.9, 1.1) });
      K.add(ico(0.3, 0), { color: c.secondary, at: V(0, 0.68, -0.35), scale: V(0.9, 0.8, 1.2) });
      K.add(ico(0.16, 1), { glow: true, color: c.eye, at: V(0, 0.8, 0.34) });
      K.add(cone(0.08, 0.32, 4), { color: c.secondary, at: V(0, 0.62, -0.7), rot: new THREE.Euler(-Math.PI / 2, 0, 0) });
      K.add(cone(0.035, 0.14, 4), { glow: true, color: c.eye, at: V(0, 0.62, -0.88), rot: new THREE.Euler(-Math.PI / 2, 0, 0) });
      for (const s of [-1, 1]) {
        for (const [z, len, ph] of [[0.1, 0.62, 0], [-0.15, 0.48, 0.8]]) {
          K.add(box(len, 0.02, 0.26), { color: c.eye, jitter: 0.05, at: V(s * (0.25 + len / 2), 1.05, z), rot: new THREE.Euler(0, 0, s * 0.25),
            anim: [FLAP, 0.7 * s, ph, 45], pivot: V(s * 0.25, 1.0, z) });
        }
        K.add(box(0.03, 0.32, 0.03), { color: c.secondary, at: V(s * 0.12, 0.28, 0.05), anim: [SWING, 0.3, s, 6], pivot: V(s * 0.12, 0.44, 0.05) });
      }
    },

    // A charging tusker: hunched, with glowing tusk tips and a ridge of glowing spines.
    boar: (K, c) => {
      K.add(ico(0.5, 1), { color: c.primary, at: V(0, 0.62, -0.05), scale: V(0.95, 0.85, 1.35) });
      K.add(ico(0.42, 0), { color: c.secondary, at: V(0, 0.78, 0.25), scale: V(1, 0.8, 0.9) });
      K.add(box(0.42, 0.36, 0.42), { color: c.secondary, at: V(0, 0.55, 0.72), rot: new THREE.Euler(0.25, 0, 0) });
      K.add(box(0.26, 0.2, 0.2), { color: c.primary, at: V(0, 0.46, 0.98) });
      for (const s of [-1, 1]) {
        K.add(cone(0.05, 0.36, 4), { color: BONE, at: V(s * 0.15, 0.52, 1.02), rot: new THREE.Euler(-0.9, 0, -s * 0.4) });
        K.add(cone(0.02, 0.1, 3), { glow: true, color: c.eye, at: V(s * 0.25, 0.68, 1.14), rot: new THREE.Euler(-0.9, 0, -s * 0.4) });
        K.add(ico(0.05, 0), { glow: true, color: c.eye, at: V(s * 0.15, 0.68, 0.9) });
        K.add(cone(0.08, 0.2, 3), { color: c.secondary, at: V(s * 0.18, 0.82, 0.62), rot: new THREE.Euler(-0.4, 0, -s * 0.5) });
      }
      for (let i = 0; i < 4; i++) K.add(cone(0.05, 0.22 - i * 0.03, 4), { glow: true, color: c.eye, at: V(0, 1.08 - i * 0.06, 0.25 - i * 0.22), rot: new THREE.Euler(-0.4, 0, 0) });
      [[0.28, 0.42, 0], [-0.28, 0.42, Math.PI], [0.28, -0.45, Math.PI], [-0.28, -0.45, 0]].forEach(([x, z, ph]) => K.leg(x, 0.4, z, 0.09, c.secondary, ph, 0.6, 13));
      K.add(cone(0.04, 0.25, 4), { color: c.secondary, at: V(0, 0.7, -0.78), rot: new THREE.Euler(-2.2, 0, 0), anim: [WAG, 0.6, 0, 9], pivot: V(0, 0.75, -0.7) });
    },

    // A bloated spitter: a squat toad with a glowing throat sac that swells
    // and a back of glowing pustules.
    spitter: (K, c) => {
      K.add(ico(0.5, 1), { color: c.primary, at: V(0, 0.42, -0.05), scale: V(1.15, 0.75, 1.15) });
      K.add(ico(0.42, 1), { color: c.secondary, at: V(0, 0.36, -0.1), scale: V(1.2, 0.6, 1.1) });
      K.add(ico(0.26, 1), { glow: true, color: c.eye, at: V(0, 0.3, 0.42), scale: V(1, 0.85, 0.9), anim: [PULSE, 0.18, 0, 5], pivot: V(0, 0.3, 0.42) });
      K.add(cone(0.1, 0.3, 5), { color: c.secondary, at: V(0, 0.62, 0.48), rot: new THREE.Euler(1.0, 0, 0) });
      for (const s of [-1, 1]) {
        K.add(ico(0.12, 0), { color: c.primary, at: V(s * 0.24, 0.74, 0.25) });
        K.add(ico(0.06, 0), { glow: true, color: c.eye, at: V(s * 0.26, 0.8, 0.33) });
      }
      for (const [x, z, r] of [[0.2, -0.2, 0.09], [-0.25, -0.05, 0.07], [0.05, -0.38, 0.08], [-0.1, 0.1, 0.06]]) {
        K.add(ico(r, 0), { glow: true, color: c.eye, at: V(x, 0.78 - Math.abs(z) * 0.3, z), anim: [PULSE, 0.25, x * 9, 4], pivot: V(x, 0.78, z) });
      }
      [[0.42, 0.28, 0], [-0.42, 0.28, Math.PI], [0.45, -0.38, Math.PI], [-0.45, -0.38, 0]].forEach(([x, z, ph]) => K.leg(x, 0.22, z, 0.08, c.secondary, ph, 0.45, 8, Math.sign(x) * 0.5));
    },

    // A carapace crusher: a domed, spiked shell with glowing seams, two
    // snapping pincers and six heavy legs.
    brute: (K, c) => {
      K.add(ico(0.6, 1), { color: c.primary, at: V(0, 0.72, -0.05), scale: V(1.2, 0.7, 1.3) });
      K.add(ico(0.5, 1), { color: c.secondary, at: V(0, 0.55, 0), scale: V(1.25, 0.45, 1.35) });
      for (const x of [-0.25, 0.25]) K.add(box(0.05, 0.05, 1.1), { glow: true, color: c.eye, at: V(x, 1.07, -0.05), rot: new THREE.Euler(0, x * 0.3, 0) });
      for (let i = 0; i < 5; i++) K.add(cone(0.08, 0.3, 4), { color: BONE, at: V((i % 2 ? 0.4 : -0.4) * (i === 2 ? 0 : 1), 1.08, 0.3 - i * 0.2), rot: new THREE.Euler(-0.3, 0, 0) });
      K.add(box(0.5, 0.3, 0.3), { color: c.secondary, at: V(0, 0.62, 0.78) });
      for (const x of [-0.14, -0.05, 0.05, 0.14]) K.add(ico(0.045, 0), { glow: true, color: c.eye, at: V(x, 0.72 + Math.abs(x) * 0.3, 0.94) });
      for (const s of [-1, 1]) {
        const piv = V(s * 0.4, 0.6, 0.7);
        K.add(box(0.16, 0.16, 0.5), { color: c.primary, at: V(s * 0.52, 0.55, 0.95), rot: new THREE.Euler(0, -s * 0.3, 0), anim: [WAG, 0.25 * s, s, 4], pivot: piv });
        K.add(cone(0.12, 0.45, 4), { color: c.secondary, at: V(s * 0.66, 0.62, 1.32), rot: new THREE.Euler(1.5, 0, s * 0.25), anim: [WAG, 0.25 * s, s, 4], pivot: piv });
        K.add(cone(0.09, 0.36, 4), { color: c.secondary, at: V(s * 0.52, 0.48, 1.3), rot: new THREE.Euler(1.7, 0, -s * 0.25), anim: [WAG, -0.35 * s, s, 4], pivot: V(s * 0.55, 0.5, 1.15) });
        [0.35, -0.05, -0.45].forEach((z, i) => {
          const ph = (i % 2 === 0) === (s > 0) ? 0 : Math.PI;
          K.leg(s * 0.62, 0.5, z, 0.08, c.secondary, ph, 0.4, 8, s * 0.6);
        });
      }
    },

    // Prey: a deer, natural colours, long legs in a bounding gait.
    deer: (K, c) => {
      K.add(ico(0.5, 1), { color: c.primary, at: V(0, 0.95, 0), scale: V(0.6, 0.55, 1.15) });
      K.add(box(0.18, 0.5, 0.2), { color: c.primary, at: V(0, 1.2, 0.5), rot: new THREE.Euler(0.5, 0, 0) });
      K.add(box(0.22, 0.2, 0.36), { color: c.primary, at: V(0, 1.45, 0.72) });
      K.add(box(0.12, 0.1, 0.14), { color: c.secondary, at: V(0, 1.41, 0.92) });
      for (const s of [-1, 1]) {
        K.add(ico(0.035, 0), { color: c.eye, jitter: 0, at: V(s * 0.11, 1.5, 0.82) });
        K.add(cone(0.06, 0.18, 3), { color: c.secondary, at: V(s * 0.14, 1.6, 0.62), rot: new THREE.Euler(0, 0, -s * 0.8) });
        K.add(box(0.03, 0.34, 0.03), { color: BONE, at: V(s * 0.1, 1.72, 0.66), rot: new THREE.Euler(-0.2, 0, -s * 0.35) });
        K.add(box(0.025, 0.16, 0.025), { color: BONE, at: V(s * 0.16, 1.78, 0.74), rot: new THREE.Euler(0.6, 0, -s * 0.6) });
      }
      K.add(box(0.1, 0.12, 0.06), { color: 0xf2efe6, at: V(0, 1.1, -0.58), anim: [SWING, 0.5, 0, 12], pivot: V(0, 1.12, -0.55) });
      [[0.18, 0.4, 0], [-0.18, 0.4, 0.4], [0.18, -0.4, Math.PI], [-0.18, -0.4, Math.PI + 0.4]].forEach(([x, z, ph]) => K.leg(x, 0.78, z, 0.05, c.secondary, ph, 0.75, 11));
    },

    // Prey: a stout hog.
    hog: (K, c) => {
      K.add(ico(0.5, 1), { color: c.primary, at: V(0, 0.6, 0), scale: V(0.95, 0.8, 1.25) });
      K.add(box(0.4, 0.38, 0.36), { color: c.primary, at: V(0, 0.62, 0.66) });
      K.add(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 7), { color: c.secondary, at: V(0, 0.56, 0.86), rot: new THREE.Euler(Math.PI / 2, 0, 0) });
      for (const s of [-1, 1]) {
        K.add(ico(0.035, 0), { color: c.eye, jitter: 0, at: V(s * 0.12, 0.72, 0.84) });
        K.add(cone(0.08, 0.16, 3), { color: c.secondary, at: V(s * 0.15, 0.86, 0.58), rot: new THREE.Euler(0.3, 0, -s * 0.4), anim: [WAG, 0.2 * s, s, 5], pivot: V(s * 0.12, 0.8, 0.58) });
      }
      K.add(new THREE.TorusGeometry(0.06, 0.02, 3, 8, Math.PI * 1.5), { color: c.secondary, at: V(0, 0.75, -0.62), anim: [WAG, 0.7, 0, 9], pivot: V(0, 0.72, -0.58) });
      [[0.26, 0.38, 0], [-0.26, 0.38, Math.PI], [0.26, -0.38, Math.PI], [-0.26, -0.38, 0]].forEach(([x, z, ph]) => K.leg(x, 0.35, z, 0.08, c.secondary, ph, 0.55, 12));
    },

    // A megabeast: a huge horned grazer with a frill, glowing eyes - it fights back.
    megabeast: (K, c) => {
      K.add(ico(0.62, 1), { color: c.primary, at: V(0, 0.95, -0.1), scale: V(1.05, 0.85, 1.35) });
      K.add(ico(0.5, 0), { color: c.secondary, at: V(0, 1.25, 0.2), scale: V(1.1, 0.7, 0.9) });
      K.add(box(0.5, 0.45, 0.5), { color: c.secondary, at: V(0, 0.82, 0.9) });
      K.add(new THREE.CylinderGeometry(0.52, 0.42, 0.08, 9), { color: c.primary, at: V(0, 1.08, 0.72), rot: new THREE.Euler(1.2, 0, 0) });
      K.add(cone(0.08, 0.38, 4), { color: BONE, at: V(0, 0.98, 1.2), rot: new THREE.Euler(1.0, 0, 0) });
      for (const s of [-1, 1]) {
        K.add(cone(0.08, 0.55, 4), { color: BONE, at: V(s * 0.2, 1.16, 1.05), rot: new THREE.Euler(1.2, 0, -s * 0.3) });
        K.add(ico(0.05, 0), { glow: true, color: c.eye, at: V(s * 0.17, 0.95, 1.14) });
      }
      [[0.38, 0.5, 0], [-0.38, 0.5, Math.PI], [0.38, -0.55, Math.PI], [-0.38, -0.55, 0]].forEach(([x, z, ph]) => K.leg(x, 0.62, z, 0.14, c.secondary, ph, 0.4, 7));
      K.add(cone(0.08, 0.5, 4), { color: c.secondary, at: V(0, 0.95, -1.05), rot: new THREE.Euler(-2.0, 0, 0), anim: [WAG, 0.4, 0, 4], pivot: V(0, 1.0, -0.9) });
    },
  };

  // The old models' lengths, so the hitboxes and def.scale still fit.
  const LENGTH = { small: 0.37, medium: 0.56, large: 0.98 };

  /* ── Shaders ──────────────────────────────────────────────── */
  const uniforms = { uTime: { value: 0 }, uGlowK: { value: 2.6 } };
  const HEAD = `
attribute vec4 aAnim;
attribute vec3 aPivot;
attribute float aGlow;
attribute float aLine;
attribute float aPhase;
uniform float uTime;
varying float vGlow;
void swarmAnim( out mat3 R, out float S ) {
  float a = aAnim.y * sin( uTime * aAnim.w + aPhase + aAnim.z );
  float c = cos( a ), s = sin( a );
  R = mat3( 1.0 ); S = 1.0;
  if ( aAnim.x > 3.5 ) S = 1.0 + a;
  else if ( aAnim.x > 2.5 ) R = mat3( c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c );
  else if ( aAnim.x > 1.5 ) R = mat3( c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0 );
  else if ( aAnim.x > 0.5 ) R = mat3( 1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c );
}
`;

  let material = null, outlineMaterial = null;
  const getMaterial = () => {
    if (material) return material;
    material = PH.Look.toonMaterial({ vertexColors: true });
    const rim = material.onBeforeCompile;
    material.onBeforeCompile = (sh) => {
      rim(sh);
      sh.uniforms.uTime = uniforms.uTime;
      sh.uniforms.uGlowK = uniforms.uGlowK;
      sh.vertexShader = HEAD + sh.vertexShader
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  mat3 swR; float swS; swarmAnim( swR, swS );\n  objectNormal = swR * objectNormal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = swR * ( ( transformed - aPivot ) * swS ) + aPivot;\n  vGlow = aGlow;');
      sh.fragmentShader = 'varying float vGlow;\nuniform float uGlowK;\n' + sh.fragmentShader.replace(
        'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
        'outgoingLight = mix( outgoingLight, vColor * uGlowK, vGlow );\n  gl_FragColor = vec4( outgoingLight, diffuseColor.a );');
    };
    material.customProgramCacheKey = () => 'ph-rim-swarm';
    return material;
  };
  const getOutline = () => {
    if (outlineMaterial) return outlineMaterial;
    outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x0b0c14, side: THREE.BackSide });
    outlineMaterial.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.vertexShader = HEAD + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  mat3 swR; float swS; swarmAnim( swR, swS );\n  transformed = swR * ( ( transformed - aPivot ) * swS ) + aPivot + normalize( swR * normal ) * aLine;');
    };
    outlineMaterial.customProgramCacheKey = () => 'ph-swarm-outline';
    PH.Look.registerOutline(outlineMaterial);
    return outlineMaterial;
  };

  PH.Swarm = {
    uniforms,
    has: (type) => !!DESIGNS[type],
    /** The baked, animated geometry for a creature type. */
    geometry(type, def) {
      const K = new Kit(type.length * 7 + 3);
      DESIGNS[type](K, def.colors);
      return K.bake(LENGTH[def.geo] || 0.5);
    },
    get material() { return getMaterial(); },
    get outlineMaterial() { return getOutline(); },
  };
})();
