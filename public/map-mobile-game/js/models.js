/**
 * Primal Hunt - animated character models (CC0, by Kenney).
 *
 * Each hunter class is one of Kenney's Mini Characters holding a Blaster Kit
 * gun. The monsters and the swarm still use the original procedural models
 * until they get the same treatment.
 *
 * Loading is asynchronous and optional: the game starts with the procedural
 * model and swaps in the real one when it arrives. If a file fails to load,
 * the procedural model simply stays.
 */
window.PH = window.PH || {};

(() => {
  const BASE = '/map-mobile-game/models/kenney/';

  // Which hunters have a real model, what they hold, and how long the gun is
  // in the model's own units (the characters are about 0.8 tall).
  const HUNTERS = {
    assault: { file: 'characters/character-male-c.glb', gun: 'blasters/blaster-n.glb', gunLen: 0.51 },   // officer, rifle
    trapper: { file: 'characters/character-male-b.glb', gun: 'blasters/blaster-g.glb', gunLen: 0.56 },   // bearded trapper, harpoon launcher
    medic:   { file: 'characters/character-female-e.glb', gun: 'blasters/blaster-q.glb', gunLen: 0.42 }, // doctor, dart sprayer
    support: { file: 'characters/character-female-a.glb', gun: 'blasters/blaster-l.glb', gunLen: 0.48 }, // engineer, heavy blaster
  };
  const HEIGHT = 1.65;         // in-game height of every hunter

  const cache = new Map();     // file -> loaded gltf
  let loading = null;

  /** Split a clip into the arm tracks and everything else. */
  const split = (clip, arms) => {
    const keep = clip.tracks.filter((t) => /arm-/.test(t.name) === arms);
    return new THREE.AnimationClip(clip.name + (arms ? ':arms' : ':body'), clip.duration, keep);
  };

  // Outlines that bend with the skeleton: back faces pushed out along their
  // skinned normals. Lambert only for its normals; it is drawn flat black.
  const skinnedOutline = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: 0x0b0c14, side: THREE.BackSide, skinning: true });
  skinnedOutline.onBeforeCompile = (sh) => {
    // Pushed out along the normals, then back from the camera a little, so the
    // shell only shows at the silhouette and not through a beard or a cap.
    sh.vertexShader = sh.vertexShader
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  transformed += normalize( objectNormal ) * 0.035;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  mvPosition.z -= 0.12;\n  gl_Position = projectionMatrix * mvPosition;');
  };
  skinnedOutline.customProgramCacheKey = () => 'ph-skin-outline';

  const Models = {
    HUNTERS, HEIGHT,
    has(cls) { const h = HUNTERS[cls]; return !!h && cache.has(h.file) && (!h.gun || cache.has(h.gun)); },

    load() {
      if (loading) return loading;
      if (!THREE.GLTFLoader) return (loading = Promise.resolve(false));
      const loader = new THREE.GLTFLoader();
      const files = new Set();
      for (const h of Object.values(HUNTERS)) { files.add(h.file); if (h.gun) files.add(h.gun); }
      loading = Promise.all([...files].map((f) => new Promise((res) => {
        loader.load(BASE + f, (g) => { cache.set(f, g); res(true); }, undefined, (e) => { console.warn('model failed', f, e); res(false); });
      }))).then((ok) => ok.every(Boolean));
      return loading;
    },

    /**
     * A ready-to-place hunter: a group whose feet sit at y = 0 facing +z,
     * with its own animation mixer. Call `update(dt, state)` each frame.
     */
    createHunter(cls) {
      const def = HUNTERS[cls];
      const src = cache.get(def.file);
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
      const skinned = [];
      model.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
      PH.Look.stylize(model, 0.04, 6);
      for (const o of skinned) {
        o.material.skinning = true;            // r128 needs this flag on skinned materials
        o.material.needsUpdate = true;
        const shell = new THREE.SkinnedMesh(o.geometry, skinnedOutline);
        shell.bind(o.skeleton, o.bindMatrix);
        shell.position.copy(o.position); shell.quaternion.copy(o.quaternion); shell.scale.copy(o.scale);
        shell.userData.outline = true;
        shell.frustumCulled = false;
        o.frustumCulled = false;
        o.parent.add(shell);
      }

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
  };

  PH.Models = Models;
})();
