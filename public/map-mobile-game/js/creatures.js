/**
 * Primal Hunt - custom-built creatures.
 *
 * Models designed for this game rather than taken from a pack. Each one is
 * built from low-poly primitives and rigidly skinned into a single mesh: every
 * part follows one bone exactly, so the whole creature is one draw call (plus
 * one for its glowing parts) and one outline shell, and it is animated by
 * moving bones in code.
 *
 * The look they share: dark, matte rock and hide with glowing markings in the
 * monster's colour, drawn bright enough for the bloom to pick up. Evolution
 * changes the silhouette, not just the size.
 *
 * A builder returns the same thing as PH.Models.createMonster:
 * { root, material, height, radius, update(dt, state) }.
 */
window.PH = window.PH || {};

(() => {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /**
   * A rig under construction: bones, and parts that each follow one bone.
   * `add(geometry, bone, { color, glow, at, rot, scale, jitter })` places the
   * part in its bone's space; `build()` merges everything into one skinned mesh.
   */
  class Rig {
    constructor() {
      this.bones = [];
      this.parts = [];
      this.byName = {};
    }

    bone(name, parent, pos) {
      const b = new THREE.Bone();
      b.name = name;
      if (pos) b.position.copy(pos);
      if (parent) this.byName[parent].add(b);
      this.bones.push(b);
      this.byName[name] = b;
      b.userData.rest = { p: b.position.clone(), r: b.rotation.clone(), s: b.scale.clone() };
      return b;
    }

    add(geo, bone, o = {}) {
      this.parts.push({ geo, bone, ...o });
    }

    /** `mats`: [body, glow, ...]; a part picks one with `mat` (or `glow: true` for 1). */
    build(mats) {
      const root = this.bones[0];
      root.updateMatrixWorld(true);
      const pos = [], nor = [], col = [], si = [], sw = [];
      const groups = mats.map(() => []);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
      for (const p of this.parts) groups[p.mat !== undefined ? p.mat : p.glow ? 1 : 0].push(p);
      const ranges = [];
      let vcount = 0;
      groups.forEach((list, gi) => {
        const start = vcount;
        for (const p of list) {
          let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
          q.setFromEuler(p.rot || new THREE.Euler());
          m.compose(p.at || V(0, 0, 0), q, p.scale || V(1, 1, 1));
          g.applyMatrix4(m);
          g.applyMatrix4(this.byName[p.bone].matrixWorld);
          g.computeVertexNormals();
          const P = g.attributes.position, N = g.attributes.normal;
          const bi = this.bones.indexOf(this.byName[p.bone]);
          c.set(p.color || 0xffffff);
          for (let i = 0; i < P.count; i++) {
            // Faceted rock: each triangle a slightly different shade.
            if (i % 3 === 0) {
              const j = p.jitter === undefined ? 0.12 : p.jitter;
              const k = 1 + (Math.random() - 0.5) * 2 * j;
              // Colours are picked as sRGB hex; the shading works in linear.
              c.set(p.color || 0xffffff).convertSRGBToLinear().multiplyScalar(k);
            }
            pos.push(P.getX(i), P.getY(i), P.getZ(i));
            nor.push(N.getX(i), N.getY(i), N.getZ(i));
            col.push(c.r, c.g, c.b);
            si.push(bi, 0, 0, 0);
            sw.push(1, 0, 0, 0);
          }
          vcount += P.count;
        }
        ranges.push([start, vcount - start, gi]);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      for (const [s, n, gi] of ranges) if (n > 0) geo.addGroup(s, n, gi);
      geo.computeBoundingSphere();
      const mesh = new THREE.SkinnedMesh(geo, mats);
      mesh.add(root);
      mesh.updateMatrixWorld(true);
      mesh.bind(new THREE.Skeleton(this.bones));
      mesh.frustumCulled = false;
      return mesh;
    }
  }

  /** Taper a box toward +z (a snout) by scaling x and y at the front. */
  const taper = (geo, front = 0.7) => {
    const P = geo.attributes.position;
    geo.computeBoundingBox();
    const { min, max } = geo.boundingBox;
    for (let i = 0; i < P.count; i++) {
      const t = (P.getZ(i) - min.z) / Math.max(1e-6, max.z - min.z);
      const k = 1 + (front - 1) * t;
      P.setX(i, P.getX(i) * k);
      P.setY(i, P.getY(i) * k);
    }
    P.needsUpdate = true;
    return geo;
  };

  /** Push vertices in or out at random, so primitives read as rock. */
  const rough = (geo, amount, seed = 1) => {
    const g = geo.index ? geo : geo;   // keep shared vertices together, or the surface cracks
    const P = g.attributes.position;
    const seen = new Map();
    let s = seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < P.count; i++) {
      const key = `${P.getX(i).toFixed(3)},${P.getY(i).toFixed(3)},${P.getZ(i).toFixed(3)}`;
      if (!seen.has(key)) seen.set(key, 1 + (rnd() - 0.5) * 2 * amount);
      const k = seen.get(key);
      P.setXYZ(i, P.getX(i) * k, P.getY(i) * k, P.getZ(i) * k);
    }
    P.needsUpdate = true;
    return g;
  };

  const ease = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, dt * rate);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ── Behemoth ────────────────────────────────────────────────
     An armoured armadillo-rhino. Its shell is a set of banded plates, each
     one a slice of a sphere around the body's long axis; standing, they
     shingle over the back, and for Rolling Charge they swing round to close
     into a boulder while the head, legs and tail tuck inside. Glowing seams
     run between the plates. Stage 2 adds brow horns and a tail club; stage 3
     grows crystal spines down the ridge and spikes the club. */
  const ROCK = 0x4d4540, ROCK_DARK = 0x3d3631, HIDE = 0x5e4b3e, BELLY = 0x8a7360, BONE = 0xd8c9a8;

  const behemoth = (stage, def, fit, helpers) => {
    const S = Math.max(1, Math.min(3, stage));
    const N = 4 + S;                       // plates: 5, 6, 7
    const R = 1;                           // shell radius (design units)
    const C = 0.95;                        // shell centre height
    const SPAN = (Math.PI * 2) / N * 1.1;  // each plate's slice, with overlap so the ball closes
    const REST = THREE.MathUtils.degToRad(78);
    const SHELL = V(1, 0.82, 1.32);        // standing shell proportions (a ball when rolled)
    const TRIM = 0.55;                     // plates stop short of the flanks, where a rock boss sits
    const rig = new Rig();

    rig.bone('root', null, V(0, 0, 0));
    rig.bone('body', 'root', V(0, C, 0));
    rig.bone('shell', 'body', V(0, 0, 0));
    rig.byName.shell.scale.copy(SHELL);
    rig.byName.shell.userData.rest.s = SHELL.clone();

    // Plates, tail to head; the ones toward the head sit slightly outside.
    const plateAngles = { rest: [], ball: [] };
    for (let i = 0; i < N; i++) {
      const b = rig.bone('plate' + i, 'shell', V(0, 0, 0));
      plateAngles.rest.push(lerp(-REST, REST, i / (N - 1)));
      plateAngles.ball.push(-Math.PI + (i + 0.5) * (Math.PI * 2) / N);
      b.rotation.x = plateAngles.rest[i];
      b.userData.rest.r = b.rotation.clone();
      const r = R * (1 + i * 0.018);
      // A slice of a sphere around the x axis, centred straight up.
      const plate = new THREE.SphereGeometry(r, 7, 3, -SPAN / 2, SPAN, TRIM, Math.PI - TRIM * 2).toNonIndexed();
      plate.rotateZ(Math.PI / 2);              // its axis from y to x (the slice now faces -y)
      plate.rotateX(Math.PI);                  // turned over to face +y
      rig.add(plate, 'plate' + i, { color: i % 2 ? ROCK : ROCK_DARK, jitter: 0.16 });
      // The inside of the plate, a little smaller, so the open edges look solid.
      const inner = plate.clone();
      inner.scale(0.93, 0.93, 0.93);
      // Flip the inner faces to point inward.
      const P = inner.attributes.position;
      for (let v = 0; v < P.count; v += 3) {
        const x = P.getX(v + 1), y = P.getY(v + 1), z = P.getZ(v + 1);
        P.setXYZ(v + 1, P.getX(v + 2), P.getY(v + 2), P.getZ(v + 2));
        P.setXYZ(v + 2, x, y, z);
      }
      rig.add(inner, 'plate' + i, { color: HIDE, jitter: 0.05 });
      // Glowing seam along the plate's trailing edge (the edge that shows).
      const seam = new THREE.TorusGeometry(r * 1.005, 0.028, 3, 12, Math.PI - TRIM * 2);
      seam.rotateZ(TRIM);
      seam.rotateX(-SPAN / 2);
      rig.add(seam, 'plate' + i, { glow: true, jitter: 0 });
      // Ridge knobs along the top of every plate; crystal spines at stage 3.
      if (S === 3) {
        const spine = new THREE.ConeGeometry(0.11, 0.42, 5);
        rig.add(spine, 'plate' + i, { glow: true, jitter: 0, at: V(0, r + 0.16, 0) });
        for (const side of [-1, 1]) {
          rig.add(new THREE.ConeGeometry(0.07, 0.24, 4), 'plate' + i, { glow: true, jitter: 0,
            at: V(side * Math.sin(0.75) * (r + 0.08), Math.cos(0.75) * (r + 0.08), 0), rot: new THREE.Euler(0, 0, -side * 0.75) });
        }
      } else {
        rig.add(new THREE.DodecahedronGeometry(0.09, 0), 'plate' + i, { color: ROCK_DARK, at: V(0, r + 0.02, 0) });
      }
    }

    // Flank bosses: a rock cap on each side where the plates meet. They stay
    // put while the plates swing round, and become the ends of the ball.
    for (const side of [-1, 1]) {
      const cap = new THREE.SphereGeometry(R * 1.03, 8, 2, 0, Math.PI * 2, 0, TRIM + 0.08).toNonIndexed();
      cap.rotateZ(-side * Math.PI / 2);      // its pole from +y to the flank
      rig.add(rough(cap, 0.05, 11 + side), 'shell', { color: ROCK, jitter: 0.14 });
      rig.add(new THREE.TorusGeometry(R * Math.sin(TRIM + 0.08) * 1.03, 0.03, 3, 16), 'shell', { glow: true, jitter: 0,
        at: V(side * R * Math.cos(TRIM + 0.08) * 1.03, 0, 0), rot: new THREE.Euler(0, Math.PI / 2, 0) });
      rig.add(rough(new THREE.DodecahedronGeometry(0.2, 0), 0.1, 13 + side), 'shell', { color: ROCK_DARK, at: V(side * R * 1.02, 0, 0), scale: V(0.6, 1, 1) });
    }

    // Belly: the hide under the shell, which shrinks inside when it rolls.
    rig.bone('belly', 'body', V(0, -0.15, 0));
    rig.add(rough(new THREE.IcosahedronGeometry(1, 1), 0.06, 3), 'belly', { color: BELLY, scale: V(0.78, 0.5, 1.15), jitter: 0.08 });

    // Head: a heavy, low snout with a nose horn, armoured brow and glowing eyes.
    rig.bone('neck', 'body', V(0, -0.12, 1.15));
    rig.bone('head', 'neck', V(0, 0, 0.18));
    rig.byName.head.scale.setScalar(1.3);
    rig.byName.head.userData.rest.s = rig.byName.head.scale.clone();
    const snout = taper(new THREE.BoxGeometry(0.62, 0.48, 0.82, 1, 1, 2), 0.62);
    rig.add(snout, 'head', { color: HIDE, at: V(0, -0.04, 0.32) });
    rig.add(rough(new THREE.DodecahedronGeometry(0.36, 0), 0.08, 5), 'head', { color: ROCK, at: V(0, 0.18, 0.12), scale: V(1.05, 0.55, 1.1) });
    const hornLen = [0.42, 0.62, 0.82][S - 1];
    rig.add(new THREE.ConeGeometry(0.14 + S * 0.02, hornLen, 5), 'head', { color: BONE, jitter: 0.06,
      at: V(0, 0.2 + hornLen * 0.35, 0.62), rot: new THREE.Euler(0.55, 0, 0) });
    rig.add(new THREE.ConeGeometry(0.035, hornLen * 0.35, 4), 'head', { glow: true, jitter: 0,
      at: V(0, 0.2 + hornLen * 0.72, 0.62 + hornLen * 0.32), rot: new THREE.Euler(0.55, 0, 0) });
    if (S >= 2) {
      for (const side of [-1, 1]) {
        rig.add(new THREE.ConeGeometry(0.08, 0.32 + (S - 2) * 0.12, 4), 'head', { color: BONE, jitter: 0.06,
          at: V(side * 0.26, 0.34, 0.08), rot: new THREE.Euler(-0.3, 0, -side * 0.7) });
      }
    }
    for (const side of [-1, 1]) {
      rig.add(new THREE.IcosahedronGeometry(0.07, 0), 'head', { glow: true, jitter: 0, at: V(side * 0.24, 0.06, 0.42) });
    }

    // Legs: short, thick pillars with pale claws.
    const legY = -0.22, legLen = C + legY;
    for (const [name, x, z] of [['legFL', 0.55, 0.72], ['legFR', -0.55, 0.72], ['legBL', 0.55, -0.72], ['legBR', -0.55, -0.72]]) {
      rig.bone(name, 'body', V(x, legY, z));
      rig.add(new THREE.CylinderGeometry(0.2, 0.25, legLen, 6), name, { color: HIDE, at: V(0, -legLen / 2, 0) });
      rig.add(rough(new THREE.DodecahedronGeometry(0.2, 0), 0.08, 7), name, { color: ROCK_DARK, at: V(0, -0.1, 0), scale: V(1.1, 0.8, 1.1) });
      for (const cx of [-0.1, 0, 0.1]) {
        rig.add(new THREE.ConeGeometry(0.045, 0.13, 4), name, { color: BONE, jitter: 0.04,
          at: V(cx, -legLen + 0.04, 0.2), rot: new THREE.Euler(1.35, 0, 0) });
      }
    }

    // Tail: a tapering spike; a club from stage 2, spiked at stage 3.
    rig.bone('tail', 'body', V(0, -0.2, -1.2));
    rig.add(new THREE.ConeGeometry(0.2, 0.75, 6), 'tail', { color: HIDE, at: V(0, 0, -0.3), rot: new THREE.Euler(-Math.PI / 2, 0, 0) });
    if (S >= 2) {
      rig.add(rough(new THREE.DodecahedronGeometry(0.22 + (S - 2) * 0.05, 0), 0.1, 9), 'tail', { color: ROCK, at: V(0, 0, -0.66) });
      if (S === 3) {
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          rig.add(new THREE.ConeGeometry(0.05, 0.22, 4), 'tail', { glow: true, jitter: 0,
            at: V(Math.cos(a) * 0.26, Math.sin(a) * 0.26, -0.66), rot: new THREE.Euler(0, 0, a - Math.PI / 2) });
        }
      }
    }

    // Materials: toon for rock and hide, unlit and brighter than white for
    // the glow so the bloom picks it up.
    const glowCol = new THREE.Color(1.0, 0.36, 0.06);   // saturated, so the bright glow stays orange
    const bodyMat = PH.Look.toonMaterial({ color: 0xffffff, vertexColors: true, flatShading: true,
      emissive: new THREE.Color(def.glow), emissiveIntensity: 0.0 });
    bodyMat.skinning = true;
    const glowMat = new THREE.MeshBasicMaterial({ color: glowCol.clone(), skinning: true });
    glowMat.toneMapped = false;

    const mesh = rig.build([bodyMat, glowMat]);
    mesh.castShadow = true; mesh.receiveShadow = false;

    // Size: the old model's footprint at this stage.
    const [w, h] = fit;
    const box = new THREE.Box3().setFromObject(mesh);
    const foot = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    const k = (w * 0.95) / foot;

    // Outline in design units; pushed back from the camera in world units.
    const shell = new THREE.SkinnedMesh(mesh.geometry, helpers.skinnedOutline(0.045, 0.1 * k));
    shell.bind(mesh.skeleton, mesh.bindMatrix);
    shell.userData.outline = true;
    shell.frustumCulled = false;
    mesh.add(shell);
    const inner = new THREE.Group();
    inner.add(mesh);
    inner.scale.setScalar(k);
    const tilt = new THREE.Group();
    tilt.add(inner);
    const root = new THREE.Group();
    root.add(tilt);

    // ── Animation ──
    const B = rig.byName;
    const legs = [B.legFL, B.legFR, B.legBL, B.legBR];
    const legPhase = [0, Math.PI, Math.PI, 0];   // diagonal pairs move together
    const glowBase = [1.3, 1.7, 2.3][S - 1];
    let t = Math.random() * 10, walk = 0, curl = 0, spin = 0, wind = 0, jab = 0, lastAttack = 0, dead = 0, move = 0;
    const restOf = (b) => b.userData.rest;

    const pose = (dt, s) => {
      t += dt;
      move = ease(move, s.moving && !s.dead ? 1 : 0, 6, dt);
      walk += dt * (s.fast ? 0 : 7.5) * move;
      curl = ease(curl, s.fast && !s.dead ? 1 : 0, 9, dt);
      wind = ease(wind, s.windup && !s.dead ? 1 : 0, 8, dt);
      dead = ease(dead, s.dead ? 1 : 0, 4, dt);
      if (s.attack !== undefined && s.attack !== lastAttack) { lastAttack = s.attack; jab = 1; }
      jab = Math.max(0, jab - dt * 3.2);
      if (curl > 0.5) spin += dt * 14 * curl;
      else spin = ease(spin, Math.round(spin / (Math.PI * 2)) * Math.PI * 2, 6, dt);
      const shake = s.evolving ? Math.sin(t * 60) * 0.03 : 0;

      // Body: bob with the gait, rock back for the wind-up, sink into the ball.
      const bob = Math.abs(Math.sin(walk)) * 0.05 * (1 - curl);
      B.body.position.set(shake, C + bob - wind * 0.08 + curl * 0.04, -wind * 0.18);
      B.body.rotation.set(-wind * 0.12 + Math.sin(walk * 2) * 0.02 * move, 0, Math.sin(walk) * 0.04 * move * (1 - curl));

      // Shell: breathe; flare in the wind-up; close into a ball and spin.
      const breathe = 1 + Math.sin(t * 2.2) * 0.015;
      const rs = restOf(B.shell).s;
      B.shell.scale.set(lerp(rs.x, 1, curl) * breathe, lerp(rs.y, 1, curl) * breathe, lerp(rs.z, 1, curl));
      B.shell.rotation.x = spin;
      for (let i = 0; i < N; i++) {
        const flare = 1 + wind * 0.06;
        B['plate' + i].rotation.x = lerp(plateAngles.rest[i] * flare, plateAngles.ball[i], curl);
      }
      B.belly.scale.setScalar(lerp(1, 0.55, curl));

      // Head: sway when idle, lower for the wind-up, jab on a bite, tuck in to roll.
      const hr = restOf(B.neck).p;
      B.neck.position.set(hr.x, lerp(hr.y, 0.05, curl), lerp(hr.z, 0.25, curl) + jab * 0.3 * (1 - curl));
      B.neck.scale.setScalar(lerp(1, 0.35, curl));
      B.head.rotation.set(wind * 0.35 - jab * 0.45 + Math.sin(walk * 2) * 0.05 * move + curl * 0.8,
        Math.sin(t * 0.7) * 0.18 * (1 - move) * (1 - wind), 0);

      // Legs: trot, paw the ground in the wind-up, fold away to roll.
      legs.forEach((L, i) => {
        const r = restOf(L).p;
        let swing = Math.sin(walk + legPhase[i]) * 0.55 * move;
        if (i === 0) swing += wind * Math.sin(t * 14) * 0.35;
        L.rotation.set(swing * (1 - curl) + curl * (i < 2 ? -1.2 : 1.2), 0, 0);
        L.position.set(r.x * lerp(1, 0.6, curl), lerp(r.y, 0.15, curl), r.z * lerp(1, 0.4, curl));
        L.scale.setScalar(lerp(1, 0.3, curl));
      });

      // Tail: wag, lift in the wind-up, curl under.
      B.tail.rotation.set(-0.15 + wind * 0.5 + curl * 1.2, Math.sin(t * 1.6 + walk) * 0.35 * (1 - curl), 0);
      B.tail.scale.setScalar(lerp(1, 0.4, curl));

      // Falls on its side when it dies.
      tilt.rotation.z = dead * 1.45;
      tilt.position.y = dead * 0.2 * k;

      // Glow: pulse, flare for the wind-up and the charge, fade out on death.
      const g = glowBase * (1 + Math.sin(t * 3) * 0.12) * (1 + wind * 0.9 + curl * 0.5 + jab * 0.6 + (s.evolving ? 0.8 : 0)) * (1 - dead * 0.85);
      glowMat.color.copy(glowCol).multiplyScalar(g);
    };

    return {
      root, material: bodyMat, height: h, radius: w * 0.38,
      update: pose,
    };
  };


  /** A copy of a surface, a little smaller and facing inward, so open shells look solid. */
  const inside = (geo, k = 0.94) => {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    g.scale(k, k, k);
    const P = g.attributes.position;
    for (let v = 0; v < P.count; v += 3) {
      const x = P.getX(v + 1), y = P.getY(v + 1), z = P.getZ(v + 1);
      P.setXYZ(v + 1, P.getX(v + 2), P.getY(v + 2), P.getZ(v + 2));
      P.setXYZ(v + 2, x, y, z);
    }
    return g;
  };

  /** A soft round dot for smoke and wisps. */
  let puffTex = null;
  const puff = () => {
    if (puffTex) return puffTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    puffTex = new THREE.CanvasTexture(c);
    return puffTex;
  };

  /* ── Wraith ──────────────────────────────────────────────────
     A hooded, tattered cloak with nothing inside but two eyes, and spectral
     claws floating where its hands would be. Torn strips hang from the hem
     and flutter as it glides; violet smoke trails off them. It warps by
     collapsing to smoke and re-forming. Stage 2 tears the cloak longer and
     adds a rune band and bone shoulder spikes; stage 3 is ragged to the
     ground, crowned with spectral horns, with an orbiting ring of rune
     crystals and bigger claws. */
  const CLOAK = 0x3b2e58, CLOAK_DARK = 0x2a2042, VOID = 0x07050c, GHOST_BONE = 0xd9d0ea;

  const wraith = (stage, def, fit, helpers) => {
    const S = Math.max(1, Math.min(3, stage));
    const HOVER = 0.35;                         // the hem floats this high
    const LEN = [1.25, 1.45, 1.7][S - 1];       // cloak length below the shoulders
    const SH = HOVER + LEN;                     // shoulder height
    const STRIPS = [7, 9, 11][S - 1];
    const CLAWS = S === 3 ? 4 : 3;
    const rig = new Rig();
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    rig.bone('root', null, V(0, 0, 0));
    rig.bone('body', 'root', V(0, SH, 0));

    // The cloak: a bell turned on a lathe, its hem cut ragged.
    const prof = [];
    const R0 = 0.2, R1 = 0.72 + S * 0.04;
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      prof.push(new THREE.Vector2(R0 + (R1 - R0) * Math.pow(t, 0.8), 0.15 - t * LEN));
    }
    prof.reverse();                              // bottom to top, so the faces point out
    const bell = new THREE.LatheGeometry(prof, 12).toNonIndexed();
    {
      const P = bell.attributes.position, cut = new Map();
      for (let i = 0; i < P.count; i++) {
        if (P.getY(i) > 0.15 - LEN + 0.01) continue;
        const a = Math.atan2(P.getZ(i), P.getX(i)).toFixed(2);
        if (!cut.has(a)) cut.set(a, rnd() * 0.35 * S);
        P.setY(i, P.getY(i) + cut.get(a));
      }
    }
    rig.add(bell, 'body', { color: CLOAK, jitter: 0.1 });
    rig.add(inside(bell, 0.96), 'body', { color: VOID, jitter: 0.02 });

    // Hood: open at the front, a dark void inside, two glowing eyes.
    rig.bone('hood', 'body', V(0, 0.18, 0.02));
    const hoodGeo = new THREE.SphereGeometry(0.42, 10, 6, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.68).toNonIndexed();
    rig.add(hoodGeo, 'hood', { color: CLOAK_DARK, jitter: 0.08, at: V(0, 0.22, 0) });
    rig.add(inside(hoodGeo, 0.95), 'hood', { color: VOID, jitter: 0.02, at: V(0, 0.22, 0) });
    rig.add(new THREE.ConeGeometry(0.2, 0.42, 6), 'hood', { color: CLOAK_DARK, at: V(0, 0.62, -0.18), rot: new THREE.Euler(-0.75, 0, 0) });
    rig.add(new THREE.SphereGeometry(0.3, 8, 6), 'hood', { color: VOID, jitter: 0, at: V(0, 0.2, -0.02) });
    for (const side of [-1, 1]) {
      rig.add(new THREE.IcosahedronGeometry(0.06, 0), 'hood', { glow: true, at: V(side * 0.12, 0.24, 0.26), scale: V(1.5, 0.7, 0.6),
        rot: new THREE.Euler(0, 0, side * 0.35) });
    }
    if (S === 3) {
      for (const side of [-1, 1]) {
        rig.add(new THREE.ConeGeometry(0.06, 0.55, 5), 'hood', { color: GHOST_BONE, jitter: 0.04, at: V(side * 0.26, 0.6, -0.02), rot: new THREE.Euler(-0.35, 0, -side * 0.55) });
        rig.add(new THREE.ConeGeometry(0.025, 0.2, 4), 'hood', { glow: true, at: V(side * 0.4, 0.84, -0.12), rot: new THREE.Euler(-0.35, 0, -side * 0.55) });
      }
    }
    // Shoulder spikes and a rune band from stage 2.
    if (S >= 2) {
      for (const side of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          rig.add(new THREE.ConeGeometry(0.05, 0.28 + k * 0.05, 4), 'body', { color: GHOST_BONE, jitter: 0.05,
            at: V(side * (0.28 + k * 0.07), 0.02 - k * 0.07, -0.05), rot: new THREE.Euler(0, 0, -side * (0.6 + k * 0.25)) });
        }
      }
      const yRune = -LEN * 0.32, rRune = R0 + (R1 - R0) * Math.pow(0.32, 0.8) + 0.015;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        rig.add(new THREE.BoxGeometry(0.16, 0.05, 0.03), 'body', { glow: true,
          at: V(Math.sin(a) * rRune, yRune + (k % 2) * 0.05, Math.cos(a) * rRune), rot: new THREE.Euler(0, a, (k % 2 ? 0.4 : -0.4)) });
      }
    }

    // Torn strips hanging from the hem, two segments each so they flutter.
    const strips = [];
    const hemY = 0.15 - LEN, hemR = R1 * 0.92;
    for (let i = 0; i < STRIPS; i++) {
      const a = (i / STRIPS) * Math.PI * 2 + rnd() * 0.2;
      const len = (0.3 + rnd() * 0.35) * (0.7 + S * 0.25);
      const w = 0.3 + rnd() * 0.12;
      const b0 = rig.bone('strip' + i, 'body', V(Math.sin(a) * hemR, hemY + 0.12, Math.cos(a) * hemR));
      b0.rotation.y = a;
      b0.userData.rest.r = b0.rotation.clone();
      const b1 = rig.bone('strip' + i + 'b', 'strip' + i, V(0, -len * 0.5, 0));
      const seg = (top, bot, h) => {
        const g = new THREE.BoxGeometry(1, h, 0.03, 1, 1, 1).toNonIndexed();
        const P = g.attributes.position;
        for (let v = 0; v < P.count; v++) P.setX(v, P.getX(v) * (P.getY(v) > 0 ? top : bot));
        return g;
      };
      rig.add(seg(w, w * 0.7, len * 0.55), 'strip' + i, { color: i % 2 ? CLOAK : CLOAK_DARK, at: V(0, -len * 0.25, 0) });
      rig.add(seg(w * 0.7, 0.02, len * 0.55), 'strip' + i + 'b', { color: CLOAK_DARK, at: V(0, -len * 0.25, 0) });
      strips.push({ b0, b1, a, ph: rnd() * 6 });
    }

    // Claws: no arms, just hands floating at its sides.
    for (const [name, side] of [['handL', 1], ['handR', -1]]) {
      rig.bone(name, 'body', V(side * (R1 + 0.02), -0.3, 0.3));
      rig.byName[name].scale.setScalar(1.6);
      rig.byName[name].userData.rest.s = rig.byName[name].scale.clone();
      rig.add(rough(new THREE.DodecahedronGeometry(0.1, 0), 0.1, 3 + side), name, { color: CLOAK_DARK, scale: V(1, 0.7, 1.2) });
      const cl = S === 3 ? 0.58 : 0.42;
      for (let k = 0; k < CLAWS; k++) {
        const f = CLAWS === 1 ? 0 : k / (CLAWS - 1) - 0.5;
        rig.add(new THREE.ConeGeometry(0.035, cl, 4), name, { color: GHOST_BONE, jitter: 0.04,
          at: V(f * 0.16, -0.05, 0.08 + cl * 0.42), rot: new THREE.Euler(1.25, f * 0.5 * side, 0) });
        rig.add(new THREE.ConeGeometry(0.014, cl * 0.3, 3), name, { glow: true,
          at: V(f * 0.16 + f * 0.04, -0.05 - cl * 0.2, 0.08 + cl * 0.85), rot: new THREE.Euler(1.25, f * 0.5 * side, 0) });
      }
    }

    // A ring of rune crystals orbiting the body at stage 3.
    if (S === 3) {
      rig.bone('halo', 'body', V(0, -LEN * 0.55, 0));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        rig.add(new THREE.OctahedronGeometry(0.14, 0), 'halo', { glow: true, at: V(Math.sin(a) * (R1 + 0.45), 0, Math.cos(a) * (R1 + 0.45)), scale: V(0.6, 1.4, 0.6) });
      }
    }

    // Materials.
    const glowCol = new THREE.Color(0.62, 0.22, 1.0);
    const bodyMat = PH.Look.toonMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, emissive: new THREE.Color(def.glow), emissiveIntensity: 0 });
    bodyMat.skinning = true;
    const glowMat = new THREE.MeshBasicMaterial({ color: glowCol.clone(), skinning: true });
    glowMat.toneMapped = false;
    const mesh = rig.build([bodyMat, glowMat]);
    mesh.castShadow = true;

    const [w, h] = fit;
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(V(0, 0, 0));
    const k = Math.min((w * 0.95) / Math.max(size.x, size.z), (h * 0.95) / size.y);
    const shellMesh = new THREE.SkinnedMesh(mesh.geometry, helpers.skinnedOutline(0.035, 0.1 * k));
    shellMesh.bind(mesh.skeleton, mesh.bindMatrix);
    shellMesh.userData.outline = true;
    shellMesh.frustumCulled = false;
    mesh.add(shellMesh);

    // Smoke: one draw of soft additive dots drifting off the hem.
    const NP = 18 + S * 6;
    const sp = new Float32Array(NP * 3), sc = new Float32Array(NP * 3);
    const smoke = new THREE.BufferGeometry();
    smoke.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    smoke.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const smokeMat = new THREE.PointsMaterial({ size: 0.75 * k, map: puff(), vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const points = new THREE.Points(smoke, smokeMat);
    points.frustumCulled = false;
    const P = [];
    for (let i = 0; i < NP; i++) P.push({ x: 0, y: HOVER + 0.5, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1 });

    const inner = new THREE.Group();
    inner.add(mesh, points);
    inner.scale.setScalar(k);
    const tilt = new THREE.Group();
    tilt.add(inner);
    const root = new THREE.Group();
    root.add(tilt);

    // ── Animation ──
    const B = rig.byName;
    const glowBase = [1.4, 1.8, 2.4][S - 1];
    let t = rnd() * 10, move = 0, wind = 0, fast = 0, dead = 0, swipe = 0, lastAttack = 0, form = 1, wasBlink = false, emit = 0;

    const spawn = (n, burst) => {
      for (let j = 0; j < n; j++) {
        const p = P.find((q) => q.life <= 0);
        if (!p) return;
        const a = rnd() * Math.PI * 2, r = hemR * (burst ? rnd() : 0.7 + rnd() * 0.4);
        p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = burst ? HOVER + rnd() * LEN : HOVER + rnd() * 0.3;
        const sp2 = burst ? 1.6 : 0.25;
        p.vx = Math.sin(a) * sp2 * rnd(); p.vz = Math.cos(a) * sp2 * rnd() - move * 0.6; p.vy = burst ? 0.4 + rnd() : 0.15 + rnd() * 0.25;
        p.max = p.life = burst ? 0.6 + rnd() * 0.4 : 0.9 + rnd() * 0.8;
      }
    };

    const pose = (dt, s) => {
      t += dt;
      move = ease(move, s.moving && !s.dead ? 1 : 0, 5, dt);
      wind = ease(wind, (s.windup || s.evolving) && !s.dead ? 1 : 0, 7, dt);
      fast = ease(fast, s.fast && !s.dead ? 1 : 0, 8, dt);
      dead = ease(dead, s.dead ? 1 : 0, 3, dt);
      if (s.attack !== undefined && s.attack !== lastAttack) { lastAttack = s.attack; swipe = 1; }
      swipe = Math.max(0, swipe - dt * 3.5);
      // A warp: collapse to smoke and re-form where it lands.
      if (s.blink && !wasBlink) { form = 0; spawn(16, true); }
      wasBlink = !!s.blink;
      form = Math.min(1, form + dt * 3);

      const bob = Math.sin(t * 2.1) * 0.08 * (1 - dead);
      const lean = move * 0.22 + fast * 0.35 - wind * 0.15;
      B.body.position.set(0, SH + bob + wind * 0.25 - dead * (SH - 0.4), 0);
      B.body.rotation.set(lean, Math.sin(t * 0.8) * 0.06, Math.sin(t * 1.3) * 0.04);
      const f = 0.15 + form * 0.85;
      B.body.scale.set(lerp(1, 1.25, 1 - form) * lerp(1, 1.3, dead), f * lerp(1, 0.35, dead), lerp(1, 1.25, 1 - form) * lerp(1, 1.3, dead));
      B.hood.rotation.set(-wind * 0.25 + swipe * 0.2, Math.sin(t * 0.6) * 0.2 * (1 - move), 0);

      // Strips: flutter, trail behind when it moves, flare out in the wind-up.
      for (const st of strips) {
        const back = Math.cos(st.a);     // +1 at the front, -1 at the back
        const flut = Math.sin(t * (3 + move * 5 + fast * 6) + st.ph);
        st.b0.rotation.set(-0.3 + flut * 0.2 + (move + fast) * back * 0.55 - wind * 0.6, st.a, 0, 'YXZ');   // + swings in, - out
        st.b1.rotation.set(Math.sin(t * (4 + move * 6) + st.ph + 1) * 0.4 + (move + fast) * 0.3 - wind * 0.3, 0, 0);
      }

      // Claws: drift, spread wide and high in the wind-up, sweep in on a swipe.
      for (const [hb, side] of [[B.handL, 1], [B.handR, -1]]) {
        const r = hb.userData.rest.p;
        const sw = Math.sin(Math.min(1, (1 - swipe) * 1.6) * Math.PI) * (swipe > 0 ? 1 : 0);
        hb.position.set(r.x * (1 + wind * 0.22) - side * sw * 0.5, r.y + Math.sin(t * 2.3 + side) * 0.06 + wind * 0.32, r.z + sw * 0.45 - fast * 0.4);
        hb.rotation.set(-wind * 0.9 + sw * 0.6 + fast * 0.8, side * (wind * 0.5 - sw * 0.8), side * wind * 0.4);
      }
      if (B.halo) B.halo.rotation.y = t * 1.2;

      tilt.rotation.x = dead * 0.3;

      // Smoke: a steady trail, more when moving, a burst on a warp.
      emit += dt * (6 + move * 10 + fast * 20) * (1 - dead * 0.5);
      while (emit > 1) { spawn(1, false); emit -= 1; }
      for (let i = 0; i < NP; i++) {
        const p = P[i];
        if (p.life > 0) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
        const a = Math.max(0, p.life / p.max);
        // Spent ones wait, invisible, inside the cloak.
        sp[i * 3] = p.x; sp[i * 3 + 1] = p.life > 0 ? p.y : HOVER + 0.5; sp[i * 3 + 2] = p.z;
        const g2 = a * a * 0.9;
        sc[i * 3] = glowCol.r * g2; sc[i * 3 + 1] = glowCol.g * g2; sc[i * 3 + 2] = glowCol.b * g2;
      }
      smoke.attributes.position.needsUpdate = true;
      smoke.attributes.color.needsUpdate = true;

      const g = glowBase * (1 + Math.sin(t * 4) * 0.15) * (1 + wind * 1.0 + swipe * 0.6 + (1 - form) * 1.5) * (1 - dead * 0.9);
      glowMat.color.copy(glowCol).multiplyScalar(g);
    };

    return { root, material: bodyMat, height: h, radius: w * 0.38, update: pose };
  };


  /* ── Kraken ──────────────────────────────────────────────────
     A floating jellyfish-squid. A pulsing bell speckled with glowing spots,
     big squid eyes at its rim, and a skirt of tentacles that multiplies with
     each stage. When it casts, it rises, splays its tentacles and lightning
     flickers along them. Stage 2 adds two long feeder arms with glowing
     clubs; stage 3 a crown of crystal spires. */
  const BELL = 0x46348a, BELL_DARK = 0x2a1f55, TENT = 0x3a2b70, DEEP = 0x0a0716;

  const kraken = (stage, def, fit, helpers) => {
    const S = Math.max(1, Math.min(3, stage));
    const BASE = 1.55;                         // bell rim height
    const NT = [6, 8, 10][S - 1];
    const SEG = 4, SEGL = 0.36;
    const rig = new Rig();
    let seed = 21;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    rig.bone('root', null, V(0, 0, 0));
    rig.bone('body', 'root', V(0, BASE, 0));
    rig.bone('bell', 'body', V(0, 0, 0));

    // The bell: a dome on a lathe, scalloped at the rim, dark inside.
    const prof = [[0.86, 0], [0.9, 0.12], [0.84, 0.36], [0.68, 0.62], [0.42, 0.82], [0.0, 0.9]].map(([x, y]) => new THREE.Vector2(x, y));
    const bell = new THREE.LatheGeometry(prof, 14).toNonIndexed();
    {
      const P = bell.attributes.position;
      for (let i = 0; i < P.count; i++) if (P.getY(i) < 0.01) {
        const a = Math.atan2(P.getZ(i), P.getX(i));
        P.setY(i, P.getY(i) - 0.07 - Math.cos(a * 7) * 0.05);
      }
    }
    rig.add(bell, 'bell', { color: BELL, jitter: 0.1 });
    rig.add(inside(bell, 0.95), 'bell', { color: DEEP, jitter: 0.02 });
    // Glowing rim, spots in rings over the dome.
    rig.add(new THREE.TorusGeometry(0.88, 0.032, 3, 28), 'bell', { glow: true, at: V(0, 0.02, 0), rot: new THREE.Euler(Math.PI / 2, 0, 0) });
    const rows = S === 1 ? [[0.25, 7], [0.55, 5]] : [[0.22, 9], [0.48, 7], [0.7, 4]];
    for (const [hgt, n] of rows) {
      const y = 0.9 * hgt + 0.08, r = 0.86 * Math.cos(hgt * 1.35) + 0.02;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + hgt * 3;
        rig.add(new THREE.IcosahedronGeometry(0.045 + rnd() * 0.02, 0), 'bell', { glow: true, at: V(Math.sin(a) * r, y, Math.cos(a) * r) });
      }
    }
    // Eyes: two big glowing eyes low on the front of the bell, slit pupils.
    for (const side of [-1, 1]) {
      const at = V(side * 0.38, 0.2, 0.75);
      rig.add(new THREE.IcosahedronGeometry(0.15, 1), 'bell', { glow: true, at, scale: V(1, 0.8, 0.6) });
      rig.add(new THREE.BoxGeometry(0.05, 0.2, 0.05), 'bell', { color: DEEP, jitter: 0, at: V(side * 0.38, 0.2, 0.84) });
      rig.add(new THREE.TorusGeometry(0.16, 0.03, 3, 10), 'bell', { color: BELL_DARK, at: V(side * 0.38, 0.2, 0.76), rot: new THREE.Euler(0, side * 0.45, 0) });
      // A heavy brow plate, low on the inside: it glares.
      rig.add(new THREE.BoxGeometry(0.34, 0.08, 0.16), 'bell', { color: BELL_DARK, at: V(side * 0.36, 0.37, 0.74), rot: new THREE.Euler(0.2, side * 0.45, side * 0.38) });
    }
    // Squid fins swept back off the top of the bell: its shape from above.
    for (const side of [-1, 1]) {
      const fin = new THREE.ConeGeometry(0.34 + S * 0.06, 0.95 + S * 0.15, 4).toNonIndexed();
      fin.scale(1, 1, 0.18);
      rig.add(fin, 'bell', { color: BELL_DARK, jitter: 0.1, at: V(side * 0.62, 0.62, -0.28), rot: new THREE.Euler(-1.1, side * 0.5, side * 1.05) });
      rig.add(new THREE.BoxGeometry(0.02, 0.8 + S * 0.12, 0.02), 'bell', { glow: true, at: V(side * 0.64, 0.64, -0.3), rot: new THREE.Euler(-1.1, side * 0.5, side * 1.05) });
    }
    if (S === 3) {
      rig.add(new THREE.ConeGeometry(0.1, 0.6, 5), 'bell', { glow: true, at: V(0, 1.15, -0.05) });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        rig.add(new THREE.ConeGeometry(0.07, 0.38, 4), 'bell', { glow: true, at: V(Math.sin(a) * 0.32, 0.95, Math.cos(a) * 0.32), rot: new THREE.Euler(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4) });
      }
    }
    // A frilled skirt under the rim.
    const frill = new THREE.CylinderGeometry(0.78, 0.66, 0.22, 14, 1, true).toNonIndexed();
    {
      const P = frill.attributes.position;
      for (let i = 0; i < P.count; i++) if (P.getY(i) < 0) {
        const a = Math.atan2(P.getZ(i), P.getX(i));
        P.setY(i, P.getY(i) - Math.abs(Math.sin(a * 5)) * 0.1);
      }
    }
    rig.add(frill, 'body', { color: BELL_DARK, at: V(0, -0.14, 0), jitter: 0.08 });
    rig.add(inside(frill, 0.97), 'body', { color: DEEP, at: V(0, -0.14, 0), jitter: 0.02 });

    // Tentacles: chains of tapering segments, splayed in a skirt; lightning
    // veins (material 2) run down each one, dark until it casts.
    const tents = [];
    const tentacle = (name, a, segs, len, r0, tip) => {
      const chain = [];
      let parent = 'body';
      for (let j = 0; j < segs; j++) {
        const bn = `${name}_${j}`;
        const b = rig.bone(bn, parent, j === 0 ? V(Math.sin(a) * 0.58, -0.12, Math.cos(a) * 0.58) : V(0, -len, 0));
        const ra = r0 * (1 - j / segs * 0.75), rb = r0 * (1 - (j + 1) / segs * 0.75);
        rig.add(new THREE.CylinderGeometry(ra, rb, len * 1.08, 5), bn, { color: j % 2 ? TENT : BELL_DARK, at: V(0, -len / 2, 0), jitter: 0.08 });
        rig.add(new THREE.BoxGeometry(0.018, len * 0.95, 0.018), bn, { mat: 2, at: V(0, -len / 2, ra * 0.85) });
        chain.push(b);
        parent = bn;
      }
      if (tip === 'club') rig.add(new THREE.IcosahedronGeometry(0.13, 0), `${name}_${segs - 1}`, { glow: true, at: V(0, -len, 0), scale: V(0.8, 1.4, 0.8) });
      else rig.add(new THREE.ConeGeometry(r0 * 0.3, 0.16, 4), `${name}_${segs - 1}`, { glow: true, at: V(0, -len - 0.05, 0), rot: new THREE.Euler(Math.PI, 0, 0) });
      return chain;
    };
    for (let i = 0; i < NT; i++) {
      const a = (i / NT) * Math.PI * 2 + Math.PI / NT;
      tents.push({ chain: tentacle('t' + i, a, SEG, SEGL * (0.9 + rnd() * 0.25), 0.12, 'tip'), a, ph: rnd() * 6, feeder: false });
    }
    if (S >= 2) {
      for (const side of [-1, 1]) {
        const a = side * 0.32;
        tents.push({ chain: tentacle('f' + side, a, 6, 0.34, 0.075, 'club'), a, ph: rnd() * 6, feeder: true, side });
      }
    }

    // Materials: body, glow, and the lightning veins.
    const glowCol = new THREE.Color(0.42, 0.32, 1.0);
    const arcCol = new THREE.Color(0.55, 0.85, 1.0);
    const bodyMat = PH.Look.toonMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, emissive: new THREE.Color(def.glow), emissiveIntensity: 0 });
    bodyMat.skinning = true;
    const glowMat = new THREE.MeshBasicMaterial({ color: glowCol.clone(), skinning: true });
    glowMat.toneMapped = false;
    const arcMat = new THREE.MeshBasicMaterial({ color: arcCol.clone(), skinning: true });
    arcMat.toneMapped = false;

    // The rest pose before measuring: tentacles splayed out, curving down.
    const rest = (b, x, y) => { b.rotation.set(x, y || 0, 0, 'YXZ'); b.userData.rest.r = b.rotation.clone(); };
    for (const T of tents) T.chain.forEach((b, j) => rest(b, j === 0 ? (T.feeder ? -0.3 : -0.85) : 0.24, j === 0 ? T.a : 0));

    const mesh = rig.build([bodyMat, glowMat, arcMat]);
    mesh.castShadow = true;
    const [w, h] = fit;
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const b of rig.bones) box.expandByPoint(new THREE.Vector3().setFromMatrixPosition(b.matrixWorld));
    box.expandByPoint(V(0, BASE + 1.0, 0)); box.expandByPoint(V(0, 0, 0));
    const size = box.getSize(V(0, 0, 0));
    const k = Math.min((w * 0.92) / Math.max(size.x, size.z), (h * 0.95) / size.y);
    const outline = new THREE.SkinnedMesh(mesh.geometry, helpers.skinnedOutline(0.03, 0.1 * k));
    outline.bind(mesh.skeleton, mesh.bindMatrix);
    outline.userData.outline = true;
    outline.frustumCulled = false;
    mesh.add(outline);

    const inner = new THREE.Group();
    inner.add(mesh);
    inner.scale.setScalar(k);
    const tilt = new THREE.Group();
    tilt.add(inner);
    const root = new THREE.Group();
    root.add(tilt);

    // ── Animation ──
    const B = rig.byName;
    const glowBase = [1.3, 1.7, 2.2][S - 1];
    let t = rnd() * 10, move = 0, wind = 0, fast = 0, dead = 0, lash = 0, lastAttack = 0, pulseT = 0;

    const pose = (dt, s) => {
      t += dt;
      move = ease(move, s.moving && !s.dead ? 1 : 0, 4, dt);
      wind = ease(wind, (s.windup || s.cast || s.evolving) && !s.dead ? 1 : 0, 7, dt);
      fast = ease(fast, s.fast && !s.dead ? 1 : 0, 8, dt);
      dead = ease(dead, s.dead ? 1 : 0, 2.5, dt);
      if (s.attack !== undefined && s.attack !== lastAttack) { lastAttack = s.attack; lash = 1; }
      lash = Math.max(0, lash - dt * 3);
      pulseT += dt * (2.2 + move * 2.5 + fast * 3);
      const pulse = Math.sin(pulseT);

      // Bell: contract and relax like a jellyfish; float and bob; rise to cast.
      B.bell.scale.set(1 - pulse * 0.05, 1 + pulse * 0.07, 1 - pulse * 0.05);
      B.body.position.set(0, BASE + Math.sin(t * 1.2) * 0.1 + pulse * 0.04 + wind * 0.35 - dead * (BASE - 0.55), 0);
      B.body.rotation.set(move * 0.22 + fast * 0.3 - wind * 0.1, Math.sin(t * 0.4) * 0.15, dead * 0.5);

      const sw = lash > 0 ? Math.sin((1 - lash) * Math.PI) : 0;
      for (const T of tents) {
        const back = Math.cos(T.a);   // +1 at the front
        T.chain.forEach((b, j) => {
          const r = b.userData.rest.r;
          const wave = Math.sin(t * 2.4 + T.ph - j * 0.8 + pulseT * 0.3) * (0.14 + j * 0.03) * (1 + move * 0.6);
          let x = r.x + wave;
          if (j === 0) {
            x += (move + fast) * back * 0.45 - wind * 0.55 - pulse * 0.08;
            if (back > 0.55) x -= sw * 1.3;               // the front ones whip forward
            if (T.feeder) x -= wind * 1.2 + sw * 0.6;      // feeders reach up to cast
          } else {
            x += wind * (T.feeder ? -0.12 : -0.3) + (move + fast) * 0.12;
          }
          x = lerp(x, 0.05 + (j === 0 ? -0.9 : 0.25), dead * 0.8);   // limp when dead
          b.rotation.set(x, r.y, 0, 'YXZ');
        });
      }

      tilt.position.y = 0;
      // Glow pulses with the bell; lightning crackles while it casts.
      const g = glowBase * (1 + pulse * 0.12) * (1 + wind * 0.8 + sw * 0.5) * (1 - dead * 0.85);
      glowMat.color.copy(glowCol).multiplyScalar(g);
      const crackle = wind > 0.05 ? wind * (Math.random() > 0.35 ? 3.2 : 0.5) : 0;
      arcMat.color.copy(arcCol).multiplyScalar((0.12 + crackle + sw * 1.5) * (1 - dead));
    };

    return { root, material: bodyMat, height: h, radius: w * 0.38, update: pose };
  };


  /* ── Goliath ─────────────────────────────────────────────────
     A hulking ape that walks on its knuckles: huge shoulders and forearms,
     short legs, a low head under a heavy brow. Dark, faceted hide split by
     molten cracks on its chest and forearms. It rears up and roars to wind
     up, punches when it attacks, tucks and raises both fists for Leap Smash,
     and beats its chest while it evolves. Stage 2 adds bone knuckle plates,
     shoulder plates and a heavier brow; stage 3 glowing crystal spines down
     its back and a molten core in its chest. */
  const HIDE_G = 0x34302f, HIDE_G2 = 0x2a2626, SKIN_G = 0x4c3f3b, BONE_G = 0xd6c6a4;

  const goliath = (stage, def, fit, helpers) => {
    const S = Math.max(1, Math.min(3, stage));
    const rig = new Rig();
    let seed = 33;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const HIPY = 0.78, HUNCH = 0.55;

    rig.bone('root', null, V(0, 0, 0));
    rig.bone('hips', 'root', V(0, HIPY, -0.2));
    rig.bone('chest', 'hips', V(0, 0.3, 0.1));
    rig.byName.chest.rotation.x = HUNCH;
    rig.byName.chest.userData.rest.r = rig.byName.chest.rotation.clone();
    rig.bone('head', 'chest', V(0, 0.6, 0.58));
    rig.byName.head.scale.setScalar(1.3);
    rig.byName.head.userData.rest.s = rig.byName.head.scale.clone();
    rig.byName.head.rotation.x = -HUNCH * 0.8;   // keep looking forward
    rig.byName.head.userData.rest.r = rig.byName.head.rotation.clone();
    rig.bone('jaw', 'head', V(0, -0.08, 0.1));

    // Torso: a big rough chest and back hump over a smaller belly.
    rig.add(rough(new THREE.IcosahedronGeometry(0.42, 1), 0.07, 2), 'hips', { color: HIDE_G2, scale: V(1.15, 0.85, 1.0), jitter: 0.12 });
    rig.add(rough(new THREE.DodecahedronGeometry(0.62, 1), 0.06, 4), 'chest', { color: HIDE_G, at: V(0, 0.3, -0.02), scale: V(1.35, 1.0, 0.95), jitter: 0.12 });
    rig.add(rough(new THREE.DodecahedronGeometry(0.42, 0), 0.08, 5), 'chest', { color: HIDE_G2, at: V(0, 0.55, -0.28), scale: V(1.3, 0.8, 0.9) });
    rig.add(rough(new THREE.IcosahedronGeometry(0.36, 0), 0.06, 6), 'chest', { color: SKIN_G, at: V(0, 0.22, 0.32), scale: V(1.3, 1.1, 0.5) });
    // Molten cracks across the chest.
    const crack = (bone, at, len, rz, ry = 0, rx = 0) => rig.add(new THREE.BoxGeometry(0.05, len, 0.05), bone, { glow: true, at, rot: new THREE.Euler(rx, ry, rz) });
    crack('chest', V(-0.2, 0.2, 0.6), 0.38, 0.5); crack('chest', V(0.2, 0.2, 0.6), 0.38, -0.5);
    crack('chest', V(0, 0.0, 0.58), 0.24, 0);
    // On the back too, where the camera sees it.
    crack('chest', V(-0.22, 0.72, -0.3), 0.42, 0.35, 0, -1.0); crack('chest', V(0.22, 0.72, -0.3), 0.42, -0.35, 0, -1.0);
    if (S >= 2) { crack('chest', V(-0.4, 0.42, 0.48), 0.3, -0.9, -0.5); crack('chest', V(0.4, 0.42, 0.48), 0.3, 0.9, 0.5);
      crack('chest', V(0, 0.82, -0.12), 0.36, 0, 0, -1.2); }
    if (S === 3) {
      rig.add(new THREE.OctahedronGeometry(0.13, 0), 'chest', { glow: true, at: V(0, 0.32, 0.6), scale: V(1, 1.3, 0.6) });
      for (let k = 0; k < 5; k++) {
        rig.add(new THREE.ConeGeometry(0.08 + (k === 2 ? 0.03 : 0), 0.4 + (2 - Math.abs(k - 2)) * 0.12, 4), 'chest', { glow: true,
          at: V(0, 0.75 - k * 0.12, -0.32 - k * 0.1), rot: new THREE.Euler(-0.5 - k * 0.15, 0, 0) });
      }
    }

    // Head: a low skull under a heavy brow, glowing eyes, a jaw that drops to roar.
    rig.add(rough(new THREE.BoxGeometry(0.44, 0.36, 0.4, 1, 1, 1), 0.06, 8), 'head', { color: HIDE_G, at: V(0, 0.06, 0) });
    rig.add(new THREE.BoxGeometry(0.5, 0.1 + (S >= 2 ? 0.05 : 0), 0.16), 'head', { color: S >= 2 ? BONE_G : HIDE_G2, at: V(0, 0.2, 0.17), rot: new THREE.Euler(0.15, 0, 0) });
    rig.add(new THREE.BoxGeometry(0.32, 0.16, 0.2), 'head', { color: SKIN_G, at: V(0, -0.02, 0.22) });
    for (const side of [-1, 1]) rig.add(new THREE.BoxGeometry(0.08, 0.035, 0.03), 'head', { glow: true, at: V(side * 0.12, 0.11, 0.24), rot: new THREE.Euler(0, 0, side * 0.25) });
    rig.add(new THREE.BoxGeometry(0.34, 0.1, 0.24), 'jaw', { color: SKIN_G, at: V(0, -0.06, 0.12) });
    for (const side of [-1, 1]) rig.add(new THREE.ConeGeometry(0.025, 0.09, 3), 'jaw', { color: BONE_G, jitter: 0, at: V(side * 0.1, 0.02, 0.22) });

    // A knuckle-walker's fist (in the hand bone's space, the arm running down
    // -y): the back of the hand widening to the knuckles, four curled fingers
    // whose middle joints carry its weight on pale pads, a thumb tucked on the
    // inside, a molten crack across the back. Stage 2 caps each knuckle in
    // bone; stage 3 grows a glowing spike from each cap.
    const fist = (bone, side) => {
      const back = new THREE.BoxGeometry(0.3, 0.19, 0.24, 1, 2, 1).toNonIndexed();
      {
        const P = back.attributes.position;
        for (let i = 0; i < P.count; i++) if (P.getY(i) < 0) P.setX(i, P.getX(i) * 1.18);   // wider at the knuckles
      }
      rig.add(rough(back, 0.04, 14 + side), bone, { color: HIDE_G2, at: V(0, -0.08, 0) });
      rig.add(new THREE.BoxGeometry(0.035, 0.15, 0.035), bone, { glow: true, at: V(side * 0.03, -0.08, 0.125), rot: new THREE.Euler(0, 0, side * 0.35) });
      [-0.12, -0.04, 0.04, 0.12].forEach((x, i) => {
        const y = -0.25 + Math.abs(x) * 0.12, w = i === 0 || i === 3 ? 0.072 : 0.082;
        // The curled finger: a chunky, leathery knuckle segment, and the tip
        // folded back under the palm.
        rig.add(rough(new THREE.BoxGeometry(w, 0.14, 0.16), 0.05, 20 + i), bone, { color: SKIN_G, at: V(x, y, 0.035) });
        rig.add(new THREE.BoxGeometry(w * 0.9, 0.09, 0.11), bone, { color: HIDE_G, at: V(x, y + 0.02, -0.085), rot: new THREE.Euler(0.4, 0, 0) });
        rig.add(new THREE.IcosahedronGeometry(w * 0.55, 0), bone, { color: 0x6a5650, at: V(x, y - 0.07, 0.035), scale: V(1, 0.45, 1.2) });
        if (S >= 2) {
          rig.add(new THREE.BoxGeometry(w * 1.08, 0.055, 0.12), bone, { color: BONE_G, jitter: 0.05, at: V(x, y + 0.015, 0.11), rot: new THREE.Euler(-0.35, 0, 0) });
          if (S === 3) rig.add(new THREE.ConeGeometry(0.028, 0.13, 4), bone, { glow: true, at: V(x, y + 0.035, 0.21), rot: new THREE.Euler(Math.PI / 2 - 0.35, 0, 0) });
        }
      });
      // Thumb, on the inside of the fist.
      rig.add(rough(new THREE.BoxGeometry(0.08, 0.15, 0.09), 0.05, 30 + side), bone, { color: HIDE_G, at: V(-side * 0.17, -0.16, 0.06), rot: new THREE.Euler(0.3, 0, side * 0.45) });
      // A shaggy cuff where the hand meets the forearm.
      rig.add(rough(new THREE.CylinderGeometry(0.2, 0.19, 0.1, 7), 0.08, 40 + side), bone, { color: HIDE_G, at: V(0, 0.02, 0) });
    };

    // Arms: long, with forearms thicker than the upper arms, and big fists.
    const arms = [];
    for (const [nm, side] of [['L', 1], ['R', -1]]) {
      const a = rig.bone('arm' + nm, 'chest', V(side * 0.72, 0.36, 0.0));
      const f = rig.bone('fore' + nm, 'arm' + nm, V(0, -0.56, 0));
      const hnd = rig.bone('hand' + nm, 'fore' + nm, V(0, -0.62, 0));
      rig.add(new THREE.CylinderGeometry(0.19, 0.15, 0.6, 6), 'arm' + nm, { color: HIDE_G, at: V(0, -0.28, 0) });
      rig.add(rough(new THREE.DodecahedronGeometry(0.26, 0), 0.08, 10 + side), 'arm' + nm, { color: S >= 2 ? BONE_G : HIDE_G2, at: V(side * 0.04, 0.04, 0), scale: V(1, 0.8, 1) });
      rig.add(new THREE.CylinderGeometry(0.17, 0.24, 0.66, 6), 'fore' + nm, { color: HIDE_G2, at: V(0, -0.31, 0) });
      crack('fore' + nm, V(side * 0.1, -0.3, 0.17), 0.4, side * 0.15);
      if (S >= 2) crack('fore' + nm, V(-side * 0.08, -0.36, 0.18), 0.3, -side * 0.2);
      fist('hand' + nm, side);
      arms.push({ a, f, hnd, side });
    }
    // Legs: short and bowed.
    const legs = [];
    for (const [nm, side] of [['L', 1], ['R', -1]]) {
      const th = rig.bone('thigh' + nm, 'hips', V(side * 0.28, -0.08, 0));
      const sh = rig.bone('shin' + nm, 'thigh' + nm, V(0, -0.36, 0));
      rig.add(new THREE.CylinderGeometry(0.17, 0.14, 0.4, 6), 'thigh' + nm, { color: HIDE_G, at: V(0, -0.18, 0) });
      rig.add(new THREE.CylinderGeometry(0.14, 0.15, 0.36, 6), 'shin' + nm, { color: HIDE_G2, at: V(0, -0.17, 0) });
      rig.add(new THREE.BoxGeometry(0.22, 0.1, 0.32), 'shin' + nm, { color: SKIN_G, at: V(0, -0.33, 0.06) });
      legs.push({ th, sh, side });
    }

    // Rest pose: arms forward and down to the knuckles, slightly out.
    const restR = (b, x, z) => { b.rotation.set(x, 0, z || 0); b.userData.rest.r = b.rotation.clone(); };
    for (const A of arms) { restR(A.a, -HUNCH - 0.35, A.side * 0.12); restR(A.f, -0.25); restR(A.hnd, 0.6); }
    for (const L of legs) { restR(L.th, -0.25, L.side * 0.08); restR(L.sh, 0.3); }

    const glowCol = new THREE.Color(1.0, 0.32, 0.06);
    const bodyMat = PH.Look.toonMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, emissive: new THREE.Color(def.glow), emissiveIntensity: 0 });
    bodyMat.skinning = true;
    const glowMat = new THREE.MeshBasicMaterial({ color: glowCol.clone(), skinning: true });
    glowMat.toneMapped = false;
    const mesh = rig.build([bodyMat, glowMat]);
    mesh.castShadow = true;

    const [w, h] = fit;
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(V(0, 0, 0));
    const k = Math.min((w * 0.9) / Math.max(size.x, size.z), (h * 0.95) / size.y);
    const outline = new THREE.SkinnedMesh(mesh.geometry, helpers.skinnedOutline(0.035, 0.1 * k));
    outline.bind(mesh.skeleton, mesh.bindMatrix);
    outline.userData.outline = true;
    outline.frustumCulled = false;
    mesh.add(outline);
    const inner = new THREE.Group();
    inner.add(mesh);
    inner.scale.setScalar(k);
    inner.position.y = -box.min.y * k;
    const tilt = new THREE.Group();
    tilt.add(inner);
    const root = new THREE.Group();
    root.add(tilt);

    // ── Animation ──
    const B = rig.byName;
    const glowBase = [1.3, 1.7, 2.3][S - 1];
    let t = rnd() * 10, walk = 0, move = 0, wind = 0, fast = 0, leap = 0, dead = 0, beat = 0, punch = 0, punchSide = 0, lastAttack = 0;
    const R = (b) => b.userData.rest.r;

    const pose = (dt, s) => {
      t += dt;
      move = ease(move, s.moving && !s.dead ? 1 : 0, 6, dt);
      fast = ease(fast, s.fast && !s.dead ? 1 : 0, 6, dt);
      wind = ease(wind, (s.windup || s.cast) && !s.dead ? 1 : 0, 7, dt);
      leap = ease(leap, s.leap && !s.dead ? 1 : 0, 10, dt);
      dead = ease(dead, s.dead ? 1 : 0, 3, dt);
      beat = ease(beat, s.evolving && !s.dead ? 1 : 0, 6, dt);
      if (s.attack !== undefined && s.attack !== lastAttack) { lastAttack = s.attack; punch = 1; punchSide = 1 - punchSide; }
      punch = Math.max(0, punch - dt * 3.5);
      walk += dt * (6.5 + fast * 5) * move;
      const up = Math.max(wind, leap * 0.6, beat * 0.7);   // how upright it stands

      // Body: bob with the knuckle-walk, rear up for the wind-up and the roar.
      const bob = Math.abs(Math.sin(walk)) * 0.06 * move;
      B.hips.position.set(0, HIPY + bob + up * 0.12 - leap * 0.1, -0.2);
      B.hips.rotation.set(-up * 0.25 + fast * 0.15, Math.sin(walk) * 0.08 * move, Math.sin(walk) * 0.05 * move);
      const breathe = 1 + Math.sin(t * 2) * 0.02;
      B.chest.scale.set(breathe, breathe, breathe);
      B.chest.rotation.set(R(B.chest).x - up * 0.75 + fast * 0.15 + punch * 0.15, Math.sin(walk) * 0.06 * move - (punch > 0 ? (punchSide ? 0.25 : -0.25) * Math.sin(punch * Math.PI) : 0), 0);
      B.head.rotation.set(R(B.head).x + up * 0.55 - wind * 0.25, Math.sin(t * 0.5) * 0.35 * (1 - move) * (1 - up), 0);
      B.jaw.rotation.x = Math.max(wind, beat * 0.6) * (0.55 + Math.sin(t * 25) * 0.05) + punch * 0.2;

      // Arms: knuckle-walk; overhead for the wind-up and the leap; punch; beat the chest.
      arms.forEach((A, i) => {
        const ph = walk + (i ? Math.PI : 0);
        let ax = R(A.a).x + Math.sin(ph) * 0.5 * move;
        let az = R(A.a).z;
        let fx = R(A.f).x - Math.max(0, Math.cos(ph)) * 0.3 * move;
        // Overhead: both fists high, ready to slam.
        ax = lerp(ax, -2.9, Math.max(wind, leap));
        fx = lerp(fx, -0.5, Math.max(wind, leap));
        // Chest-beat: alternate fists to the chest.
        const hit = Math.sin(t * 11 + i * Math.PI);
        ax = lerp(ax, -1.45 - Math.max(0, hit) * 0.25, beat);
        az = lerp(az, -A.side * 0.9, beat);
        fx = lerp(fx, -1.9, beat);
        // A punch: the next arm in turn swings forward.
        if (punch > 0 && i === punchSide) { const p = Math.sin(punch * Math.PI); ax = lerp(ax, -1.9, p); fx = lerp(fx, 0, p); }
        A.a.rotation.set(ax, 0, az);
        A.f.rotation.set(fx, 0, 0);
        A.hnd.rotation.set(lerp(R(A.hnd).x, 0, Math.max(wind, leap, beat)), 0, 0);
      });
      legs.forEach((L, i) => {
        const ph = walk + (i ? 0 : Math.PI);
        L.th.rotation.set(R(L.th).x + Math.sin(ph) * 0.45 * move - leap * 0.7, 0, R(L.th).z);
        L.sh.rotation.set(R(L.sh).x + Math.max(0, -Math.sin(ph)) * 0.5 * move + leap * 1.0, 0, 0);
      });

      // Falls onto its back.
      tilt.rotation.x = -dead * 1.4;
      tilt.position.y = dead * 0.3 * k;
      tilt.position.z = -dead * 0.6 * k;

      const g = glowBase * (1 + Math.sin(t * 2.6) * 0.12) * (1 + wind * 0.9 + leap * 0.6 + beat * 0.8 + punch * 0.4) * (1 - dead * 0.9);
      glowMat.color.copy(glowCol).multiplyScalar(g);
    };

    return { root, material: bodyMat, height: h, radius: w * 0.38, update: pose };
  };

  PH.Creatures = { behemoth, wraith, kraken, goliath };
})();
