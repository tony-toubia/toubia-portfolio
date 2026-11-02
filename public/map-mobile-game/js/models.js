/**
 * Primal Hunt - animated character models (all CC0).
 *
 * Each hunter class is one of Kenney's Mini Characters holding a Blaster Kit
 * gun. The monsters are custom-built for the game (creatures.js); a monster
 * can also be a GLB file, which is how the first versions worked. The swarm
 * still uses the original procedural models.
 *
 * Loading is asynchronous and optional: the game starts with the procedural
 * model and swaps in the real one when it arrives. If a file fails to load,
 * the procedural model simply stays.
 */
window.PH = window.PH || {};

(() => {
  const BASE = '/map-mobile-game/models/';

  // Which hunters have a real model, what they hold, and how long the gun is
  // in the model's own units (the characters are about 0.8 tall).
  const HUNTERS = {
    assault: { file: 'kenney/characters/character-male-c.glb', gun: 'kenney/blasters/blaster-n.glb', gunLen: 0.51 },   // officer, rifle
    trapper: { file: 'kenney/characters/character-male-b.glb', gun: 'kenney/blasters/blaster-g.glb', gunLen: 0.56 },   // bearded trapper, harpoon launcher
    medic:   { file: 'kenney/characters/character-female-e.glb', gun: 'kenney/blasters/blaster-q.glb', gunLen: 0.42 }, // doctor, dart sprayer
    support: { file: 'kenney/characters/character-female-a.glb', gun: 'kenney/blasters/blaster-l.glb', gunLen: 0.48 }, // engineer, heavy blaster
    ranger:  { file: 'kenney/characters/character-female-c.glb', gun: 'kenney/blasters/blaster-e.glb', gunLen: 0.7, portrait: 'ranger-standard' }, // marksman, long rifle
    potato:  { custom: 'potato', portrait: 'potato-standard' }, // supreme tuber
  };
  const HEIGHT = 1.65;         // in-game height of every hunter

  const cache = new Map();     // file -> loaded gltf
  const pending = new Map();   // file -> promise, for skins loaded on demand
  let loading = null;

  /** Split a clip into the arm tracks and everything else. */
  const split = (clip, arms) => {
    const keep = clip.tracks.filter((t) => /arm-/.test(t.name) === arms);
    return new THREE.AnimationClip(clip.name + (arms ? ':arms' : ':body'), clip.duration, keep);
  };

  // Outlines that bend with the skeleton: back faces pushed out along their
  // skinned normals, then back from the camera a little, so the shell only
  // shows at the silhouette and not through a beard, a cap or a pair of eyes.
  // Lambert only for its normals; it is drawn flat black. `thick` is in the
  // model's own units, `push` in world units.
  const outlines = new Map();
  const skinnedOutline = (thick, push) => {
    const key = thick.toFixed(3) + ':' + push.toFixed(3);
    if (outlines.has(key)) return outlines.get(key);
    const m = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: 0x0b0c14, side: THREE.BackSide, skinning: true });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n  transformed += normalize( objectNormal ) * ${thick.toFixed(4)};`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n  mvPosition.z -= ${push.toFixed(4)};\n  gl_Position = projectionMatrix * mvPosition;`);
    };
    m.customProgramCacheKey = () => 'ph-skin-outline-' + key;
    PH.Look.registerOutline(m);    // weak devices drop outlines first; these go with the rest
    outlines.set(key, m);
    return m;
  };

  /** Toon shading plus skinned outline shells on every skinned mesh of a model. */
  const styleSkinned = (model, thick, push) => {
    const skinned = [];
    model.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
    PH.Look.stylize(model, 0.04, 6);
    const outline = skinnedOutline(thick, push);
    for (const o of skinned) {
      o.material.skinning = true;            // r128 needs this flag on skinned materials
      o.material.needsUpdate = true;
      const shell = new THREE.SkinnedMesh(o.geometry, outline);
      shell.bind(o.skeleton, o.bindMatrix);
      shell.position.copy(o.position); shell.quaternion.copy(o.quaternion); shell.scale.copy(o.scale);
      shell.userData.outline = true;
      shell.frustumCulled = false;
      o.frustumCulled = false;
      o.parent.add(shell);
    }
    return skinned;
  };

  // The monsters, all custom-built in creatures.js (a `file` entry would load
  // a GLB instead). `fit` is the procedural model's footprint width and height
  // per evolution stage: the hitboxes come from those numbers, so the new
  // model is sized to them and gameplay does not change. `glow` is the
  // emissive colour the stages build up.
  const MONSTERS = {
    goliath:  { custom: 'goliath',  glow: 0xff4400, fit: [[5.7, 5.28], [7.69, 7.13], [9.68, 8.98]] },
    kraken:   { custom: 'kraken',   glow: 0x9966ff, fit: [[7.54, 5.74], [10.18, 7.74], [12.83, 9.75]] },
    wraith:   { custom: 'wraith',   glow: 0xcc66ff, fit: [[4.08, 4.75], [5.5, 6.41], [6.93, 8.07]] },
    behemoth: { custom: 'behemoth', glow: 0xff8800, fit: [[5.9, 3.65], [7.97, 4.77], [10.04, 6.34]] },
    wyvern:   { custom: 'wyvern',   glow: 0xffaa33, fit: [[4.6, 4.4], [6.2, 5.8], [7.8, 7.2]] },
  };
  // For GLB monsters: gentler than the old models' glow, since textures are
  // light and the same intensity washed them out to the glow colour.
  const STAGE_GLOW = [0.03, 0.07, 0.12];

  const Models = {
    HUNTERS, HEIGHT, MONSTERS,
    /** Whether a hunter can be built now; `file` is a skin's character model. */
    has(cls, file) { const h = HUNTERS[cls]; return !!h && (h.custom ? (!file || cache.has(file)) : cache.has(file || h.file) && (!h.gun || cache.has(h.gun))); },
    hasFile(file) { return cache.has(file); },

    /** Load one more model (a skin), on demand. Resolves true once it is ready. */
    loadFile(file) {
      if (cache.has(file)) return Promise.resolve(true);
      if (pending.has(file)) return pending.get(file);
      if (!THREE.GLTFLoader) return Promise.resolve(false);
      const p = new Promise((res) => {
        new THREE.GLTFLoader().load(BASE + file, (g) => { cache.set(file, g); res(true); }, undefined,
          (e) => { console.warn('model failed', file, e); pending.delete(file); res(false); });
      });
      pending.set(file, p);
      return p;
    },
    hasMonster(type) {
      const m = MONSTERS[type];
      if (!m) return false;
      return m.custom ? !!(PH.Creatures && PH.Creatures[m.custom]) : cache.has(m.file);
    },

    load() {
      if (loading) return loading;
      if (!THREE.GLTFLoader) return (loading = Promise.resolve(false));
      const loader = new THREE.GLTFLoader();
      const files = new Set();
      for (const h of Object.values(HUNTERS)) { if (h.file) files.add(h.file); if (h.gun) files.add(h.gun); }
      for (const m of Object.values(MONSTERS)) if (m.file) files.add(m.file);
      loading = Promise.all([...files].map((f) => new Promise((res) => {
        loader.load(BASE + f, (g) => { cache.set(f, g); res(true); }, undefined, (e) => { console.warn('model failed', f, e); res(false); });
      }))).then((ok) => ok.every(Boolean));
      return loading;
    },

    /**
     * A ready-to-place hunter: a group whose feet sit at y = 0 facing +z,
     * with its own animation mixer. Call `update(dt, state)` each frame.
     * `file` swaps in a skin: another Mini Character on the same skeleton.
     */
    createHunter(cls, file) {
      const def = HUNTERS[cls];
      if (def && def.custom === 'potato' && !file) return this.createPotato();
      const src = cache.get(file && cache.has(file) ? file : def.file);
      const model = THREE.SkeletonUtils.clone(src.scene);
      // Scale to the game's hunter height.
      const box = new THREE.Box3().setFromObject(model);
      const k = HEIGHT / Math.max(0.01, box.max.y - box.min.y);
      model.scale.setScalar(k);
      model.position.y = -box.min.y * k;

      // The gun goes in the right hand. The holder was fitted in the aiming
      // pose (grip in the fist, barrel along +z); each gun is centred in it
      // and scaled to its length, so any blaster sits the same way.
      if (def.gun && cache.has(def.gun)) {
        const gun = cache.get(def.gun).scene.clone(true);
        let hand = null;
        model.traverse((o) => { if (o.isBone && o.name === 'arm-right') hand = o; });
        if (hand) {
          const gb = new THREE.Box3().setFromObject(gun);
          const size = gb.getSize(new THREE.Vector3()), mid = gb.getCenter(new THREE.Vector3());
          const g = def.gunLen / Math.max(0.01, size.z);
          gun.scale.setScalar(g);
          gun.position.copy(mid).multiplyScalar(-g);
          const holder = new THREE.Group();
          holder.position.set(-0.303, -0.048, 0.096);
          holder.quaternion.set(-0.104, 0.857, 0.1158, 0.4912).normalize();
          holder.add(gun);
          hand.add(holder);
        }
      }

      // Toon shading and outlines, the same style as everything else.
      styleSkinned(model, 0.035, 0.12);

      // Animation: legs and body from walk/run/idle, arms from the gun poses,
      // so the hunter keeps aiming while it runs.
      const mixer = new THREE.AnimationMixer(model);
      const clips = {};
      for (const c of src.animations) clips[c.name] = c;
      const act = (clip) => { const a = mixer.clipAction(clip); a.enabled = true; return a; };
      const body = {
        idle: act(split(clips.idle, false)),
        walk: act(split(clips.walk, false)),
        sprint: act(split(clips.sprint, false)),
      };
      const arms = {
        hold: act(split(clips['holding-both'], true)),
        shoot: act(split(clips['holding-both-shoot'], true)),
      };
      const die = act(clips.die);
      die.setLoop(THREE.LoopOnce, 1);
      die.clampWhenFinished = true;
      body.idle.play(); arms.hold.play();
      let curBody = 'idle', curArms = 'hold', dead = false;

      const fade = (from, to, t = 0.15) => { if (from === to) return; to.reset().play(); from.crossFadeTo(to, t, false); };

      return {
        root: model, mixer,
        /** state: { moving, fast, shooting, down, dead } */
        update(dt, s) {
          if (s.dead || s.down) {
            if (!dead) {
              dead = true;
              for (const a of [...Object.values(body), ...Object.values(arms)]) a.fadeOut(0.1);
              die.reset().fadeIn(0.1).play();
            }
          } else {
            if (dead) {
              dead = false;
              die.fadeOut(0.15);
              body[curBody].reset().fadeIn(0.15).play();
              arms[curArms].reset().fadeIn(0.15).play();
            }
            const nb = s.moving ? (s.fast ? 'sprint' : 'walk') : 'idle';
            if (nb !== curBody) { fade(body[curBody], body[nb]); curBody = nb; }
            const na = s.shooting ? 'shoot' : 'hold';
            if (na !== curArms) { fade(arms[curArms], arms[na], 0.08); curArms = na; }
            body.walk.timeScale = 1.35;
          }
          mixer.update(dt);
        },
      };
    },

    /**
     * Custom 3D Potato hunter: a chunky, lumpy golden-russet potato with
     * dark potato-eye dimples, leafy green top sprout, golden crown,
     * tactical shades, stubby limbs, and a rotary golden blaster.
     */
    createPotato() {
      const root = new THREE.Group();
      const tilt = new THREE.Group();
      root.add(tilt);

      const skinMat = new THREE.MeshStandardMaterial({ color: 0xc89248, roughness: 0.82, metalness: 0.05 });
      const bumpMat = new THREE.MeshStandardMaterial({ color: 0xb88038, roughness: 0.85, metalness: 0.05 });
      const eyeSpotMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1b, roughness: 0.9, metalness: 0.0 });
      const budMat = new THREE.MeshStandardMaterial({ color: 0xe8d595, roughness: 0.6, metalness: 0.0 });
      const bootMat = new THREE.MeshStandardMaterial({ color: 0x3d2410, roughness: 0.65, metalness: 0.15 });
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x44bd32, roughness: 0.55, metalness: 0.05 });
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd32a, roughness: 0.28, metalness: 0.7, emissive: 0xff9f1a, emissiveIntensity: 0.22 });
      const shadeMat = new THREE.MeshStandardMaterial({ color: 0x161920, roughness: 0.2, metalness: 0.8 });
      const gunMetal = new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.35, metalness: 0.8 });
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });

      // Body group that bobs & waddles
      const bodyGrp = new THREE.Group();
      bodyGrp.position.y = 0.82;
      tilt.add(bodyGrp);

      // Main oblong lumpy potato tuber
      const coreGeo = new THREE.SphereGeometry(0.47, 16, 14);
      const core = new THREE.Mesh(coreGeo, skinMat);
      core.scale.set(1.04, 1.34, 0.94);
      bodyGrp.add(core);

      // Organic asymmetric potato lobes so silhouette reads unmistakably as a potato
      const lobes = [
        [0.06, 0.27, -0.03, 0.37, 1.05, 0.92, 0.94, skinMat],
        [-0.05, -0.21, 0.04, 0.41, 1.08, 0.88, 0.96, bumpMat],
        [0.22, 0.05, -0.06, 0.25, 1.0, 1.1, 0.9, bumpMat],
        [-0.21, 0.12, -0.04, 0.23, 0.95, 1.05, 0.9, skinMat],
        [0.0, -0.04, -0.22, 0.30, 1.05, 1.1, 0.85, bumpMat],
      ];
      for (const [x, y, z, r, sx, sy, sz, mat] of lobes) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
        m.position.set(x, y, z);
        m.scale.set(sx, sy, sz);
        bodyGrp.add(m);
      }

      // Potato "eyes" (dark dimples + tiny sprout buds scattered on the tuber)
      const dimpleGeo = new THREE.SphereGeometry(0.052, 8, 6);
      const budGeo = new THREE.ConeGeometry(0.022, 0.05, 5);
      const spots = [
        [-0.36, 0.22, 0.22], [0.38, -0.10, 0.20], [-0.32, -0.24, 0.24],
        [0.34, 0.26, -0.22], [-0.35, 0.04, -0.26], [0.14, 0.35, -0.32],
        [-0.16, -0.28, -0.34], [0.26, -0.26, -0.24],
      ];
      for (const [x, y, z] of spots) {
        const d = new THREE.Mesh(dimpleGeo, eyeSpotMat);
        d.position.set(x, y, z);
        d.scale.set(1.2, 0.75, 0.6);
        d.lookAt(x * 2, y, z * 2);
        bodyGrp.add(d);
        const b = new THREE.Mesh(budGeo, budMat);
        b.position.set(x * 1.04, y + 0.01, z * 1.04);
        b.rotation.z = -x * 1.2;
        bodyGrp.add(b);
      }

      // Cool wrap-around tactical sunglasses + golden visor glint on the front (+z)
      const visorBridge = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.13, 0.14), shadeMat);
      visorBridge.position.set(0, 0.16, 0.40);
      bodyGrp.add(visorBridge);

      const lensGeo = new THREE.BoxGeometry(0.24, 0.10, 0.04);
      const leftLens = new THREE.Mesh(lensGeo, goldMat);
      leftLens.position.set(-0.15, 0.16, 0.46);
      leftLens.rotation.z = -0.08;
      const rightLens = new THREE.Mesh(lensGeo, goldMat);
      rightLens.position.set(0.15, 0.16, 0.46);
      rightLens.rotation.z = 0.08;
      bodyGrp.add(leftLens, rightLens);

      // Determined potato brow & grin
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.10), bumpMat);
      brow.position.set(0, 0.24, 0.42);
      bodyGrp.add(brow);
      const grin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.06), eyeSpotMat);
      grin.position.set(0, -0.02, 0.44);
      bodyGrp.add(grin);

      // Golden Crown + Leafy Potato Sprout on top of the head
      const sproutGrp = new THREE.Group();
      sproutGrp.position.set(0, 0.58, 0);
      bodyGrp.add(sproutGrp);

      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.11, 8), goldMat);
      crown.position.y = 0.04;
      sproutGrp.add(crown);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.20, 6), leafMat);
      stem.position.y = 0.14;
      sproutGrp.add(stem);

      const leafGeo = new THREE.SphereGeometry(0.09, 8, 6);
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3 + 0.3;
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.scale.set(1.5, 0.35, 0.85);
        leaf.position.set(Math.cos(a) * 0.10, 0.22, Math.sin(a) * 0.10);
        leaf.rotation.y = -a;
        leaf.rotation.z = -0.35;
        sproutGrp.add(leaf);
      }

      // Stubby arms
      const leftArm = new THREE.Group();
      leftArm.position.set(-0.48, 0.0, 0.05);
      const lArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.28, 8), bumpMat);
      lArmMesh.rotation.z = 0.45;
      const lGlove = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 8), bootMat);
      lGlove.position.set(-0.08, -0.14, 0.06);
      leftArm.add(lArmMesh, lGlove);
      bodyGrp.add(leftArm);

      const rightArm = new THREE.Group();
      rightArm.position.set(0.48, 0.0, 0.10);
      const rArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.28, 8), bumpMat);
      rArmMesh.rotation.z = -0.35;
      rArmMesh.rotation.x = 0.4;
      const rGlove = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 8), bootMat);
      rGlove.position.set(0.06, -0.08, 0.14);
      rightArm.add(rArmMesh, rGlove);

      // Multi-barrel Golden Tuber Minigun mounted in the right hand
      const gunGrp = new THREE.Group();
      gunGrp.position.set(0.10, -0.06, 0.32);
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.34), gunMetal);
      const goldBand = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.08, 10), goldMat);
      goldBand.rotation.x = Math.PI / 2;
      goldBand.position.z = 0.14;
      const barrels = new THREE.Group();
      barrels.position.z = 0.28;
      const bGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.34, 6);
      bGeo.rotateX(Math.PI / 2);
      for (let i = 0; i < 3; i++) {
        const ba = (i * Math.PI * 2) / 3;
        const bm = new THREE.Mesh(bGeo, gunMetal);
        bm.position.set(Math.cos(ba) * 0.048, Math.sin(ba) * 0.048, 0);
        barrels.add(bm);
      }
      const coreGlow = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), glowMat);
      coreGlow.position.z = 0.44;
      gunGrp.add(receiver, goldBand, barrels, coreGlow);
      rightArm.add(gunGrp);
      bodyGrp.add(rightArm);

      // Stubby legs & boots sitting at y = 0
      const makeLeg = (x) => {
        const g = new THREE.Group();
        g.position.set(x, 0.28, 0);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.22, 8), bumpMat);
        leg.position.y = -0.08;
        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.26), bootMat);
        boot.position.set(0, -0.21, 0.04);
        g.add(leg, boot);
        tilt.add(g);
        return g;
      };
      const leftLeg = makeLeg(-0.20);
      const rightLeg = makeLeg(0.20);

      if (PH.Look && PH.Look.stylize) PH.Look.stylize(root, 0.04, 8);

      let phase = 0;
      return {
        root,
        update(dt, s) {
          if (s.dead || s.down) {
            tilt.rotation.x += (-1.35 - tilt.rotation.x) * Math.min(1, dt * 10);
            tilt.position.y = 0.28;
            return;
          }
          tilt.rotation.x += (0 - tilt.rotation.x) * Math.min(1, dt * 10);
          tilt.position.y = 0;
          const speed = s.moving ? (s.fast ? 16 : 11) : 2.6;
          phase += dt * speed;
          if (s.moving) {
            const stride = s.fast ? 0.65 : 0.48;
            bodyGrp.position.y = 0.82 + Math.abs(Math.sin(phase)) * 0.09;
            bodyGrp.rotation.z = Math.cos(phase) * 0.11;
            bodyGrp.rotation.x = s.fast ? 0.12 : 0.06;
            leftLeg.rotation.x = Math.sin(phase) * stride;
            rightLeg.rotation.x = -Math.sin(phase) * stride;
            leftArm.rotation.x = -Math.sin(phase) * 0.45;
            sproutGrp.rotation.z = -Math.cos(phase) * 0.18;
          } else {
            bodyGrp.position.y = 0.82 + Math.sin(phase) * 0.025;
            bodyGrp.rotation.z *= 0.85;
            bodyGrp.rotation.x *= 0.85;
            leftLeg.rotation.x *= 0.82;
            rightLeg.rotation.x *= 0.82;
            leftArm.rotation.x = Math.sin(phase) * 0.08;
            sproutGrp.rotation.z = Math.sin(phase * 0.8) * 0.06;
          }
          if (s.shooting) {
            barrels.rotation.z += dt * 28;
            gunGrp.position.z = 0.28 + Math.sin(phase * 6) * 0.035;
          } else {
            gunGrp.position.z += (0.32 - gunGrp.position.z) * Math.min(1, dt * 12);
          }
        },
      };
    },

    /**
     * A monster at an evolution stage, sized to the procedural model's
     * footprint. Returns the group (feet at y = 0, facing +z), the material
     * whose emissive carries the stage glow and hit flashes, and an animator.
     * `update(dt, s)` takes { moving, fast, windup, attack, leap, evolving, dead }:
     * `attack` is a count that goes up by one per bite. `variant` is a
     * colourway for the custom monsters (see PH.Progress.COLORS).
     */
    createMonster(type, stage, variant) {
      const def = MONSTERS[type];
      if (def.custom) return PH.Creatures[def.custom](stage, def, def.fit[Math.max(0, Math.min(2, stage - 1))], { skinnedOutline, variant });
      const src = cache.get(def.file);
      const [w, h] = def.fit[Math.max(0, Math.min(2, stage - 1))];
      const model = THREE.SkeletonUtils.clone(src.scene);
      const box = new THREE.Box3().setFromObject(model);
      // These are round creatures: the body's depth (wings and horns stick
      // out sideways) is sized to most of the old model's footprint.
      const depth = Math.max(0.01, box.max.z - box.min.z);
      const body = 0.8 * (w + h) / 2;
      const k = body / depth;
      const inner = new THREE.Group();
      inner.add(model);
      inner.scale.setScalar(k);
      inner.position.y = -box.min.y * k + (def.hover || 0) * body;
      const tilt = new THREE.Group();      // for the fall when there is no death clip
      tilt.add(inner);
      const root = new THREE.Group();
      root.add(tilt);

      // Outline thickness is in the skinned geometry's own units (the FBX
      // armature carries a scale, so they are not the model's), and the
      // camera push scales with the body so eyes and teeth do not pick up lines.
      let geoR = 1;
      model.traverse((o) => { if (o.isSkinnedMesh && geoR === 1) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); geoR = o.geometry.boundingSphere.radius; } });
      const skinned = styleSkinned(model, geoR * 0.035, body * 0.035);
      // Own material per monster, so its glow and flashes are its own.
      const mat = skinned[0].material.clone();
      mat.skinning = true;
      mat.emissive = new THREE.Color(def.glow);
      mat.emissiveIntensity = STAGE_GLOW[stage - 1] || 0.1;
      for (const o of skinned) o.material = mat;

      const mixer = new THREE.AnimationMixer(model);
      const clips = {};
      for (const c of src.animations) clips[c.name] = c;
      const fly = clips.Flying;
      const pick = (...names) => { for (const n of names) if (clips[n]) return clips[n]; return fly || src.animations[0]; };
      const loop = {
        idle: mixer.clipAction(pick('Idle')),
        walk: mixer.clipAction(pick('Walk')),
        windup: mixer.clipAction(pick('Bite_InPlace')),
      };
      const once = (clip) => { if (!clip) return null; const a = mixer.clipAction(clip); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; return a; };
      const bite = once(clips.Bite_Front);
      const jump = once(clips.Jump);
      const death = once(clips.Death);
      loop.idle.play();
      let cur = 'idle', lastAttack = 0, dead = false, oneShot = null, sink = 0;

      const fade = (from, to, t = 0.18) => { if (from === to) return; to.reset().play(); from.crossFadeTo(to, t, false); };
      const playOnce = (a, t = 0.08) => {
        if (!a) return;
        if (oneShot && oneShot !== a) oneShot.fadeOut(t);
        loop[cur].fadeOut(t);
        a.reset().setEffectiveWeight(1).fadeIn(t).play();
        oneShot = a;
      };

      return {
        root, material: mat, height: h, radius: w * 0.38,
        update(dt, s) {
          if (s.dead) {
            if (!dead) {
              dead = true;
              if (death) playOnce(death, 0.1);
            }
            // No death clip (Cthulhu): sink and tip over instead.
            if (!death) { sink = Math.min(1, sink + dt * 1.5); tilt.rotation.x = -sink * 1.2; tilt.position.y = -sink * h * 0.3; }
            mixer.update(dt);
            return;
          }
          if (dead) { dead = false; sink = 0; tilt.rotation.x = 0; tilt.position.y = 0; if (death) death.fadeOut(0.15); loop[cur].reset().fadeIn(0.15).play(); }

          if (s.attack !== undefined && s.attack !== lastAttack) { lastAttack = s.attack; if (bite) playOnce(bite); }
          if (s.leap && jump && oneShot !== jump) playOnce(jump);
          // A one-shot that has finished hands back to the loop.
          if (oneShot && (!oneShot.isRunning() || oneShot.time >= oneShot.getClip().duration - 0.02) && !(s.leap && oneShot === jump)) {
            oneShot.fadeOut(0.15);
            loop[cur].reset().fadeIn(0.15).play();
            oneShot = null;
          }
          const next = s.windup || s.evolving ? 'windup' : s.moving ? 'walk' : 'idle';
          if (next !== cur) { if (!oneShot) fade(loop[cur], loop[next]); else loop[next].reset(); cur = next; }
          loop.walk.timeScale = s.fast ? 2.2 : 1.1;
          loop.windup.timeScale = s.evolving ? 0.8 : 1.3;
          mixer.update(dt);
        },
      };
    },
  };

  PH.Models = Models;
})();
