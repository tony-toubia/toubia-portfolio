/**
 * Primal Hunt - rendering.
 *
 * The game logic never touches three.js directly; it calls the methods here
 * (or the same-named no-ops on PH.NullRender, which is what makes a headless
 * balance simulation possible).
 *
 * Draw-call budget is the whole design. A swarm game lives on hundreds of
 * creatures, and the original engine built every creature as a group of
 * fifteen to eighty separate meshes - fine for one hunter and one monster,
 * fatal for three hundred. So:
 *   - the player and the bosses use the original Characters3D models as-is;
 *   - the swarm uses the original *wildlife* models, baked once into a single
 *     geometry per creature type and drawn with InstancedMesh - one draw call
 *     per type however many are alive;
 *   - projectiles, gems, drones, traps and shadows are instanced the same way;
 *   - particles are one pooled Points buffer, so a kill never allocates;
 *   - Effects3D, also reused, handles the rare set pieces (boss arrival, slam,
 *     death), which is what it was built for and can afford to allocate.
 */
window.PH = window.PH || {};

(() => {
  const V3 = () => new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _c = new THREE.Color();
  const _up = new THREE.Vector3(0, 1, 0);
  const _fwd = new THREE.Vector3(0, 0, 1);
  const _dir = new THREE.Vector3();

  /** An InstancedMesh that is refilled from scratch every frame. */
  class Batch {
    constructor(scene, geometry, material, max, colors = false) {
      this.mesh = new THREE.InstancedMesh(geometry, material, max);
      this.mesh.frustumCulled = false;   // the base geometry's bounds say nothing about instances
      this.max = max;
      this.n = 0;
      this.colors = colors;
      if (colors) {
        // instanceColor must exist before first render, or the shader is
        // compiled without it. And it must be created while count is still
        // `max`: r128 sizes the buffer from the *current* count on first use,
        // so creating it after count = 0 gives a zero-length buffer and every
        // instance renders black.
        _c.setRGB(1, 1, 1);
        for (let i = 0; i < max; i++) this.mesh.setColorAt(i, _c);
      }
      this.mesh.count = 0;
      scene.add(this.mesh);
    }
    begin() { this.n = 0; }
    add(x, y, z, rotY, sx, sy, sz, r = 1, g = 1, b = 1) {
      if (this.n >= this.max) return;
      _p.set(x, y, z);
      _q.setFromAxisAngle(_up, rotY);
      _s.set(sx, sy, sz);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(this.n, _m);
      if (this.colors) { _c.setRGB(r, g, b); this.mesh.setColorAt(this.n, _c); }
      this.n++;
    }
    /** A unit box stretched between two points - lightning, dash lines. */
    addSegment(ax, ay, az, bx, by, bz, thick, r = 1, g = 1, b = 1) {
      if (this.n >= this.max) return;
      _dir.set(bx - ax, by - ay, bz - az);
      const len = _dir.length() || 0.0001;
      _dir.multiplyScalar(1 / len);
      _q.setFromUnitVectors(_fwd, _dir);
      _p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      _s.set(thick, thick, len);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(this.n, _m);
      if (this.colors) { _c.setRGB(r, g, b); this.mesh.setColorAt(this.n, _c); }
      this.n++;
    }
    end() {
      this.mesh.count = this.n;
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.colors && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Cheap deterministic 2D value noise, so the ground looks the same every time you return. */
  function hash2(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  function canvasTexture(size, draw) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    draw(cv.getContext('2d'), size);
    const t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /*
   * The world darkens as the monster evolves: green day, then dusk, then a
   * blood-red night for the final fight, so every run has a visible arc.
   * r128 treats these as linear colours, so they are darker than they look.
   */
  const BIOMES = [
    { bg: 0x14182a, amb: 0x404060, ambI: 0.40, sky: 0x87ceeb, gnd: 0x2d5016, hemiI: 0.30, sun: 0xfff5e0, sunI: 1.00, tint: [1, 1, 1],       tuft: 0x1c4417, mote: 0xd8ff6a },
    { bg: 0x22132e, amb: 0x4a3560, ambI: 0.40, sky: 0xc07aa0, gnd: 0x2a2016, hemiI: 0.30, sun: 0xffa070, sunI: 0.72, tint: [1.12, 0.7, 1.3],  tuft: 0x2a2a26, mote: 0xffb35c },
    { bg: 0x12050a, amb: 0x3a1a2a, ambI: 0.42, sky: 0x9a2a3a, gnd: 0x200808, hemiI: 0.30, sun: 0xff5040, sunI: 0.52, tint: [1.08, 0.55, 0.62], tuft: 0x341216, mote: 0xff4a2a },
  ];
  const _ca = new THREE.Color(), _cb = new THREE.Color();
  const mixHex = (out, a, b, k) => out.copy(_ca.setHex(a)).lerp(_cb.setHex(b), k);
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);

  class Render {
    constructor(canvas) {
      this.canvas = canvas;
      this.time = 0;
      this.shake = 0;
      this.maxDpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = this.maxDpr;

      const r = this.renderer = new THREE.WebGLRenderer({
        canvas, antialias: this.dpr < 2, powerPreference: 'high-performance',
      });
      r.setPixelRatio(this.dpr);
      // Matches the original renderer so the reused models look as they were tuned.
      r.outputEncoding = THREE.sRGBEncoding;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.2;

      const scene = this.scene = new THREE.Scene();
      scene.background = new THREE.Color(0x14182a);
      scene.fog = new THREE.Fog(0x14182a, 30, 62);

      this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 200);
      this.pitch = 55 * Math.PI / 180;
      this.camTarget = V3();
      this.camDist = 20;

      // The original renderer's rig and levels, so the reused models read as tuned.
      this.ambient = new THREE.AmbientLight(0x404060, 0.4);
      this.hemi = new THREE.HemisphereLight(0x87ceeb, 0x2d5016, 0.3);
      scene.add(this.ambient, this.hemi);
      this.biome = 0;
      this.zoom = 0;            // 0 = normal framing; boss arrivals push in briefly
      const sun = new THREE.DirectionalLight(0xfff5e0, 1.0);
      sun.position.set(-6, 14, 8);
      scene.add(sun);
      scene.add(sun.target);
      this.sun = sun;

      // The two reused modules only ever ask the renderer for these.
      this.shim = {
        addToScene: (o) => scene.add(o),
        removeFromScene: (o) => scene.remove(o),
        requestDynamicLight: () => null,   // nothing reads the handle back
      };
      this.chars = new Characters3D(this.shim);
      this.fx = new Effects3D(this.shim);

      this.buildGround();
      this.buildSwarm();
      this.buildBatches();
      this.buildParticles();
      this.buildTelegraphs();
      this.buildEffects();
      this.emojiCache = new Map();
      this.sprites = [];

      this.player = null;
      this.hunterVis = new Map();
      this.viewScale = 1;
      this.buildMonsterMode();
      this.bosses = new Map();
      this.lightning = [];

      // Adaptive resolution: if frames are slow for a couple of seconds, drop
      // the pixel ratio a notch. Cheaper than shipping a settings menu.
      this.frameTimes = [];
      this.lastQualityCheck = 0;
      this.qualityLevel = 0;      // the game reads this to lower the enemy cap
    }

    /* ── Scene construction ─────────────────────────────────── */

    buildGround() {
      const tex = canvasTexture(256, (g, s) => {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, s, s);
        for (let i = 0; i < 1400; i++) {
          const x = Math.random() * s, y = Math.random() * s;
          const v = 200 + Math.random() * 55;
          g.fillStyle = `rgba(${v * 0.85},${v},${v * 0.8},${0.25 + Math.random() * 0.35})`;
          g.fillRect(x, y, 1 + Math.random() * 2, 2 + Math.random() * 4);
        }
      });
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      this.groundSize = 96;
      this.groundSnap = 24;           // a multiple of the 8-unit texture tile, so snapping is seamless
      tex.repeat.set(this.groundSize / 8, this.groundSize / 8);
      const geo = new THREE.PlaneGeometry(this.groundSize, this.groundSize, 48, 48);
      geo.rotateX(-Math.PI / 2);
      geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
      const mat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
      this.ground = new THREE.Mesh(geo, mat);
      this.scene.add(this.ground);

      // Decor: tufts and rocks, placed from a hash of world cells so the
      // world is stable as you walk, and only rebuilt when the ground snaps.
      const tuft = new THREE.ConeGeometry(0.09, 0.42, 4);
      tuft.translate(0, 0.21, 0);
      this.tufts = new THREE.InstancedMesh(tuft, new THREE.MeshLambertMaterial({ color: 0x1c4417 }), 700);
      this.tuftMat = this.tufts.material;
      const rock = new THREE.DodecahedronGeometry(0.5, 0);
      this.rocks = new THREE.InstancedMesh(rock, new THREE.MeshStandardMaterial({ color: 0x3a3e48, flatShading: true, roughness: 1 }), 80);
      for (const m of [this.tufts, this.rocks]) { m.frustumCulled = false; this.scene.add(m); }
      this.groundKey = null;
    }

    snapGround(px, pz) {
      const S = this.groundSnap;
      const cx = Math.round(px / S) * S, cz = Math.round(pz / S) * S;
      const key = cx + ',' + cz;
      if (key === this.groundKey) return;
      this.groundKey = key;
      this.ground.position.set(cx, 0, cz);

      // World-space colour variation, so the pattern does not move with the plane.
      const pos = this.ground.geometry.attributes.position;
      const col = this.ground.geometry.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const wx = pos.getX(i) + cx, wz = pos.getZ(i) + cz;
        const n = noise2(wx * 0.06, wz * 0.06) * 0.6 + noise2(wx * 0.19, wz * 0.19) * 0.4;
        const dry = noise2(wx * 0.025 + 40, wz * 0.025 - 13);
        // r128 treats colours as linear and sRGB-encodes them on output, so these
        // read far brighter on screen than they look here.
        const r = 0.018 + n * 0.022 + dry * 0.03, g = 0.05 + n * 0.045 + dry * 0.015, b = 0.016 + n * 0.012;
        col.setXYZ(i, r, g, b);
      }
      col.needsUpdate = true;

      let nt = 0, nr = 0;
      const half = this.groundSize / 2, cell = 2.5;
      for (let gx = cx - half; gx < cx + half; gx += cell) {
        for (let gz = cz - half; gz < cz + half; gz += cell) {
          const h = hash2(gx * 0.37, gz * 0.53);
          const ox = gx + hash2(gx, gz + 7) * cell, oz = gz + hash2(gx + 3, gz) * cell;
          if (h < 0.035 && nr < this.rocks.count) {
            const s = 0.5 + hash2(gx + 11, gz) * 0.9;
            _p.set(ox, s * 0.25, oz); _q.setFromAxisAngle(_up, h * 40); _s.set(s, s * 0.7, s);
            _m.compose(_p, _q, _s); this.rocks.setMatrixAt(nr++, _m);
          } else if (h > 0.45 && nt < this.tufts.count) {
            for (let k = 0; k < 3 && nt < this.tufts.count; k++) {
              const s = 0.7 + hash2(gx + k, gz - k) * 0.8;
              _p.set(ox + (k - 1) * 0.12, 0, oz + hash2(k, gx) * 0.2);
              _q.setFromAxisAngle(_up, k + h * 9); _s.set(s, s, s);
              _m.compose(_p, _q, _s); this.tufts.setMatrixAt(nt++, _m);
            }
          }
        }
      }
      this.tufts.count = nt; this.rocks.count = nr;
      this.tufts.instanceMatrix.needsUpdate = true;
      this.rocks.instanceMatrix.needsUpdate = true;
    }

    /** Bake one of the original wildlife models into a single coloured geometry. */
    bakeWildlife(geoName, colors) {
      const group = new THREE.Group();
      const prim = new THREE.MeshStandardMaterial({ color: colors.primary });
      const sec = new THREE.MeshStandardMaterial({ color: colors.secondary });
      const eye = new THREE.MeshBasicMaterial({ color: colors.eye });
      const build = { small: 'buildSmallWildlife', medium: 'buildMediumWildlife', large: 'buildLargeWildlife' }[geoName];
      this.chars[build](group, prim, sec, eye);
      group.updateMatrixWorld(true);

      const positions = [], normals = [], colorsArr = [];
      group.traverse((o) => {
        if (!o.isMesh) return;
        const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
        g.applyMatrix4(o.matrixWorld);
        const p = g.attributes.position, n = g.attributes.normal;
        const c = o.material.color;
        // Eyes are unlit in the original; brighten them so they still read as glowing.
        const boost = o.material.isMeshBasicMaterial ? 2.2 : 1;
        for (let i = 0; i < p.count; i++) {
          positions.push(p.getX(i), p.getY(i), p.getZ(i));
          normals.push(n.getX(i), n.getY(i), n.getZ(i));
          colorsArr.push(c.r * boost, c.g * boost, c.b * boost);
        }
        g.dispose();
      });
      prim.dispose(); sec.dispose(); eye.dispose();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colorsArr, 3));
      return geo;
    }

    buildSwarm() {
      this.swarm = {};
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      for (const [type, def] of Object.entries(PH.ENEMIES)) {
        this.swarm[type] = new Batch(this.scene, this.bakeWildlife(def.geo, def.colors), mat, PH.CONFIG.maxEnemies, true);
      }
    }

    buildBatches() {
      const S = this.scene;
      const glow = (color) => {
        const m = new THREE.MeshBasicMaterial({ color });
        m.toneMapped = false;   // keep projectiles punchy rather than tone-mapped to mud
        return m;
      };
      const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
      const shadowGeo = new THREE.CircleGeometry(1, 16); shadowGeo.rotateX(-Math.PI / 2);
      this.shadows = new Batch(S, shadowGeo, shadowMat, PH.CONFIG.maxEnemies + 16);
      this.shadows.mesh.renderOrder = -1;

      // Elites get a gold ring: tinting the model cannot turn a blue creature gold.
      const eliteGeo = new THREE.RingGeometry(0.8, 1, 28); eliteGeo.rotateX(-Math.PI / 2);
      const eliteMat = new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.85, depthWrite: false });
      eliteMat.toneMapped = false;
      this.eliteRings = new Batch(S, eliteGeo, eliteMat, 16);

      const boltGeo = new THREE.BoxGeometry(0.09, 0.09, 0.6);
      this.bolts = new Batch(S, boltGeo, glow(0xffffff), 400, true);
      const pelletGeo = new THREE.SphereGeometry(0.1, 6, 4);
      this.pellets = new Batch(S, pelletGeo, glow(0xffffff), 300, true);
      const harpoonGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.3, 5); harpoonGeo.rotateX(Math.PI / 2);
      this.harpoons = new Batch(S, harpoonGeo, glow(0x7ff5ea), 60);
      const orbGeo = new THREE.SphereGeometry(0.24, 10, 8);
      this.orbs = new Batch(S, orbGeo, glow(0xffffff), 200, true);
      const nadeGeo = new THREE.SphereGeometry(0.17, 8, 6);
      this.nades = new Batch(S, nadeGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f2a }), 40);

      const gemGeo = new THREE.OctahedronGeometry(0.2, 0);
      this.gems = new Batch(S, gemGeo, glow(0xffffff), PH.CONFIG.maxGems + 20, true);

      // Spheres, not diamonds: the XP gems are diamonds, and a weapon that looks
      // like a pickup reads as clutter rather than as something you own.
      const droneGeo = new THREE.SphereGeometry(0.24, 12, 8);
      this.drones = new Batch(S, droneGeo, glow(0xbfe3ff), 16);

      const trapGeo = new THREE.CylinderGeometry(0.42, 0.48, 0.1, 10);
      this.traps = new Batch(S, trapGeo, new THREE.MeshLambertMaterial({ color: 0x8a8f99 }), 24);
      const lightGeo = new THREE.SphereGeometry(0.08, 6, 4);
      this.trapLights = new Batch(S, lightGeo, glow(0xffffff), 24, true);

      const segGeo = new THREE.BoxGeometry(1, 1, 1);
      const segMat = glow(0xffffff);
      segMat.transparent = true; segMat.blending = THREE.AdditiveBlending; segMat.depthWrite = false;
      this.segments = new Batch(S, segGeo, segMat, 160, true);

      // Bio Field: a soft additive disc that follows the player.
      const fieldTex = canvasTexture(128, (g, s) => {
        const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        grd.addColorStop(0, 'rgba(120,255,160,0.05)');
        grd.addColorStop(0.75, 'rgba(90,255,140,0.22)');
        grd.addColorStop(0.95, 'rgba(160,255,190,0.65)');
        grd.addColorStop(1, 'rgba(160,255,190,0)');
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
      });
      const fieldGeo = new THREE.CircleGeometry(1, 48); fieldGeo.rotateX(-Math.PI / 2);
      this.field = new THREE.Mesh(fieldGeo, new THREE.MeshBasicMaterial({
        map: fieldTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      this.field.position.y = 0.03;
      this.field.visible = false;
      S.add(this.field);

      // Magnet / pickup radius hint, shown briefly when it grows.
      this.ringGeo = new THREE.RingGeometry(0.96, 1, 48); this.ringGeo.rotateX(-Math.PI / 2);
    }

    /**
     * Glow without post-processing. A bloom pass costs a phone several
     * full-screen blurs a frame; a soft additive halo behind each bright
     * thing gives most of the look for a few hundred tiny quads.
     */
    buildEffects() {
      const S = this.scene;
      const radial = (stops) => canvasTexture(64, (g, s) => {
        const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        for (const [k, c] of stops) grd.addColorStop(k, c);
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
      });
      const haloTex = radial([[0, 'rgba(255,255,255,1)'], [0.22, 'rgba(255,255,255,0.5)'], [0.55, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
      const haloGeo = new THREE.PlaneGeometry(1, 1);
      haloGeo.rotateX(-this.pitch);              // the camera never turns, so this faces it
      // Through the constructor, not Object.assign: assigning `color: 0x...`
      // replaces the material's Color object with a bare number.
      const additive = (extra) => new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, ...extra,
      });
      this.halos = new Batch(S, haloGeo, additive({ map: haloTex }), 900, true);
      this.halos.mesh.renderOrder = 2;

      // Shockwave rings for abilities, slams, elite and boss kills.
      const waveGeo = new THREE.RingGeometry(0.72, 1, 56); waveGeo.rotateX(-Math.PI / 2);
      this.waves = [];
      for (let i = 0; i < 12; i++) {
        // Normal blending: additive turned every ring tan against the green ground.
        const m = new THREE.Mesh(waveGeo, additive({ color: 0xffffff, opacity: 0, blending: THREE.NormalBlending }));
        m.visible = false; m.position.y = 0.06; m.renderOrder = 1;
        S.add(m);
        this.waves.push({ mesh: m, t: 0, dur: 1, r: 1, on: false });
      }

      // Snare webs: a drawn web on the ground.
      const webTex = canvasTexture(256, (g, s) => {
        const c = s / 2;
        g.strokeStyle = 'rgba(190,255,250,0.9)'; g.lineWidth = 3;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * c * 0.98, c + Math.sin(a) * c * 0.98); g.stroke();
        }
        g.lineWidth = 2;
        for (let r = 0.18; r < 1; r += 0.16) {
          g.beginPath();
          for (let i = 0; i <= 12; i++) {
            const a = (i / 12) * Math.PI * 2, rr = c * r * (i % 2 ? 0.94 : 1);
            if (i === 0) g.moveTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr); else g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
          }
          g.stroke();
        }
      });
      const discGeo = new THREE.CircleGeometry(1, 40); discGeo.rotateX(-Math.PI / 2);
      this.webs = [];
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(discGeo, additive({ map: webTex, color: 0x4ecdc4, opacity: 0.8 }));
        m.visible = false; m.position.y = 0.05; S.add(m);
        this.webs.push(m);
      }

      // Shield dome: a soft shell plus a low-poly wire frame.
      const shell = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
      const wire = new THREE.SphereGeometry(1.01, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      this.dome = new THREE.Group();
      this.dome.add(new THREE.Mesh(shell, additive({ color: 0x3f8fd6, opacity: 0.16, side: THREE.DoubleSide })));
      this.dome.add(new THREE.Mesh(wire, additive({ color: 0x9fdcff, opacity: 0.35, wireframe: true })));
      this.dome.visible = false;
      S.add(this.dome);

      this.pops = [];           // creatures in their death frames
      this.moteAcc = 0;
    }

    /* ── Monster mode ───────────────────────────────────────── */

    buildMonsterMode() {
      const S = this.scene;
      // Footprints the hunters follow - and so can you.
      const trackGeo = new THREE.CircleGeometry(0.22, 10); trackGeo.rotateX(-Math.PI / 2); trackGeo.scale(1, 1, 1.5);
      this.trackBatch = new Batch(S, trackGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }), 170);
      // Birds: a flat V, so they read as birds from above.
      const bird = new THREE.BufferGeometry();
      bird.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, -0.32, 0.06, -0.08, 0, 0, -0.05, 0, 0, 0.12, 0, 0, -0.05, 0.32, 0.06, -0.08], 3));
      bird.computeVertexNormals();
      this.birdBatch = new Batch(S, bird, new THREE.MeshBasicMaterial({ color: 0x15131a, side: THREE.DoubleSide }), 96);
      this.flocks = [];
      this.grassMesh = null;
      this.wallMesh = null;
      this.monsterMode = false;
    }

    setMonsterMode(on, grass = [], arena = 34) {
      this.monsterMode = on;
      if (this.grassMesh) { this.scene.remove(this.grassMesh); this.grassMesh.geometry.dispose(); this.grassMesh = null; }
      for (const v of this.hunterVis.values()) this.scene.remove(v.root);
      this.hunterVis.clear();
      this.flocks.length = 0;
      if (!on) { if (this.wallMesh) this.wallMesh.visible = false; this.setViewScale(1); return; }

      // Tall grass: open three-sided blades, one instanced draw call.
      const D = PH.MONSTER_MODE.grass.density;
      let total = 0;
      for (const g of grass) total += Math.round(Math.PI * g.r * g.r * D);
      const blade = new THREE.ConeGeometry(0.1, 1.3, 3, 1, true); blade.translate(0, 0.65, 0);
      if (!this.grassMat) this.grassMat = new THREE.MeshLambertMaterial({ color: 0x2a5c1f, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(blade, this.grassMat, Math.max(1, total));
      let n = 0;
      for (const g of grass) {
        const count = Math.round(Math.PI * g.r * g.r * D);
        for (let i = 0; i < count; i++) {
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * g.r;
          const s = 0.75 + Math.random() * 0.55, lean = (Math.random() - 0.5) * 0.35;
          _p.set(g.x + Math.cos(a) * d, 0, g.z + Math.sin(a) * d);
          _q.setFromEuler(new THREE.Euler(lean, Math.random() * 6.3, lean * 0.6));
          _s.set(s, s * (0.8 + Math.random() * 0.5), s);
          _m.compose(_p, _q, _s);
          mesh.setMatrixAt(n, _m);
          const v = 0.75 + Math.random() * 0.5;
          _c.setRGB(v, v * (0.9 + Math.random() * 0.2), v);
          mesh.setColorAt(n, _c);
          n++;
        }
      }
      mesh.count = n;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.grassMesh = mesh;

      // A ring of boulders marks the edge of the hunting ground.
      if (!this.wallMesh) {
        const N = 120;
        this.wallMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0),
          new THREE.MeshStandardMaterial({ color: 0x3a3e48, flatShading: true, roughness: 1 }), N);
        this.wallMesh.frustumCulled = false;
        this.scene.add(this.wallMesh);
      }
      const N = this.wallMesh.count;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2, r = arena + 0.8 + hash2(i, 3) * 1.6, sc = 1.1 + hash2(i, 9) * 1.5;
        _p.set(Math.cos(a) * r, sc * 0.35, Math.sin(a) * r);
        _q.setFromAxisAngle(_up, hash2(i, 5) * 6); _s.set(sc, sc * (0.8 + hash2(i, 1) * 0.6), sc);
        _m.compose(_p, _q, _s); this.wallMesh.setMatrixAt(i, _m);
      }
      this.wallMesh.instanceMatrix.needsUpdate = true;
      this.wallMesh.visible = true;
    }

    setViewScale(k) {
      if (this.viewScale === k) return;
      this.viewScale = k;
      if (this.w) this.resize(this.w, this.h);
    }

    /** The player as one of the original monsters, at an evolution stage. */
    setPlayerMonster(type, stage) {
      if (this.player) this.scene.remove(this.player.root);
      const key = `${type}:${stage}`;
      let mesh = this.monsterCache && this.monsterCache.get(key);
      if (mesh) this.monsterCache.delete(key);
      else mesh = this.chars.createMonsterMesh({ monsterType: type, evolutionStage: stage });
      mesh.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      const box = this.bodyBox(mesh);
      const root = new THREE.Group();
      root.add(mesh);
      mesh.position.y = -box.min.y;
      this.scene.add(root);
      const pm = mesh.userData.primaryMaterial;
      this.player = { root, mesh, isMonster: true, facing: this.player ? this.player.facing : 0, flash: 0,
        baseGlow: pm ? pm.emissiveIntensity : 0, height: box.max.y - box.min.y };
      // Build the later stages now, so evolving does not hitch.
      if (stage === 1) {
        this.prepareBosses([{ type, stage: 2 }, { type, stage: 3 }]);
        this.monsterCache = this.preparedBosses;
        this.preparedBosses = new Map();
      }
      const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      return { radius: width * 0.38, height: this.player.height };
    }

    flashPlayer() { if (this.player) this.player.flash = 1; }

    setHunters(list) {
      for (const v of this.hunterVis.values()) this.scene.remove(v.root);
      this.hunterVis.clear();
      for (const h of list) {
        const mesh = this.chars.createHunterMesh({ hunterClass: h.cls });
        mesh.traverse((o) => { if (o.isMesh) o.castShadow = false; });
        const box = this.bodyBox(mesh);
        const tilt = new THREE.Group();
        tilt.add(mesh);
        mesh.position.y = -box.min.y;
        const root = new THREE.Group();
        root.add(tilt);
        root.visible = false;
        this.scene.add(root);
        this.hunterVis.set(h.id, { root, tilt, mesh, height: box.max.y - box.min.y });
      }
    }

    birds(x, z) {
      const flock = { t: 0, list: [] };
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 2.5;
        flock.list.push({ x: x + (Math.random() - 0.5) * 2, y: 0.8 + Math.random(), z: z + (Math.random() - 0.5) * 2,
          vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 2.5 + Math.random() * 1.5, ph: Math.random() * 6 });
      }
      if (this.flocks.length > 8) this.flocks.shift();
      this.flocks.push(flock);
    }

    drawMonsterMode(game, dt, t) {
      // Hunters
      for (const h of game.hunters) {
        const v = this.hunterVis.get(h.id);
        if (!v) continue;
        const on = h.state === 'up' || h.state === 'down';
        v.root.visible = on;
        if (!on) continue;
        v.root.position.set(h.x, 0, h.z);
        v.root.rotation.y = h.facing;
        // Downed hunters lie on their backs.
        const lie = h.state === 'down' ? -1.35 : 0;
        v.tilt.rotation.x += (lie - v.tilt.rotation.x) * Math.min(1, dt * 10);
        v.tilt.position.y = h.state === 'down' ? 0.25 : 0;
        if (h.state === 'up') this.chars.animateHunter(v.mesh, t + h.id, h.moving);
        this.shadows.add(h.x, 0.02, h.z, 0, 0.5, 1, 0.5);
        if (h.shieldT > 0) this.halos.add(h.x, 1, h.z, 0, 2.4, 2.4, 2.4, 0.15, 0.4, 0.9);
        if (h.flash > 0) this.halos.add(h.x, 1, h.z, 0, 1.6, 1.6, 1.6, 0.8, 0.15, 0.1);
        if (h.state === 'down') {
          const blink = Math.floor(t * 4) % 2 ? 0.8 : 0.3;
          this.halos.add(h.x, 0.4, h.z, 0, 1.8, 1.8, 1.8, blink, 0.05, 0.05);
        }
      }
      // Footprints, fading as they age.
      this.trackBatch.begin();
      const life = PH.MONSTER_MODE.trackLife;
      for (const k of game.tracks) {
        const a = 1 - (game.time - k.t) / life;
        if (a <= 0) continue;
        const side = (Math.floor(k.t * 7) % 2 ? 0.25 : -0.25);
        const s = (0.6 + game.stage * 0.25) * (0.4 + a * 0.6);
        this.trackBatch.add(k.x + Math.cos(k.angle) * side, 0.025, k.z - Math.sin(k.angle) * side, k.angle, s, 1, s);
      }
      this.trackBatch.end();
      // Birds
      this.birdBatch.begin();
      for (let i = this.flocks.length - 1; i >= 0; i--) {
        const f = this.flocks[i];
        f.t += dt;
        if (f.t > 3) { this.flocks.splice(i, 1); continue; }
        for (const b of f.list) {
          b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
          const flap = 0.5 + Math.abs(Math.sin(t * 18 + b.ph)) * 0.8;
          this.birdBatch.add(b.x, b.y, b.z, Math.atan2(b.vx, b.vz), 1.4, flap, 1.4);
        }
      }
      this.birdBatch.end();
    }

    buildParticles() {
      const N = this.pMax = 1400;
      this.p = {
        x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N),
        vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N),
        life: new Float32Array(N), max: new Float32Array(N), size: new Float32Array(N),
        r: new Float32Array(N), g: new Float32Array(N), b: new Float32Array(N), grav: new Float32Array(N),
        n: 0,
      };
      const geo = new THREE.BufferGeometry();
      this.pPos = new Float32Array(N * 3); this.pCol = new Float32Array(N * 3);
      this.pSize = new Float32Array(N); this.pAlpha = new Float32Array(N);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('alpha', new THREE.BufferAttribute(this.pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setDrawRange(0, 0);
      this.pMat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 400 } },
        vertexShader: `
          attribute float size; attribute float alpha; attribute vec3 color;
          varying vec3 vColor; varying float vAlpha; uniform float uScale;
          void main() {
            vColor = color; vAlpha = alpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * uScale / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          varying vec3 vColor; varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            gl_FragColor = vec4(vColor, smoothstep(0.5, 0.05, d) * vAlpha);
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.points = new THREE.Points(geo, this.pMat);
      this.points.frustumCulled = false;
      this.scene.add(this.points);
    }

    buildTelegraphs() {
      // A warning on the ground with a fill that grows to show exactly when it lands.
      this.teleCircleGeo = new THREE.CircleGeometry(1, 40); this.teleCircleGeo.rotateX(-Math.PI / 2);
      this.teleRingGeo = new THREE.RingGeometry(0.93, 1, 40); this.teleRingGeo.rotateX(-Math.PI / 2);
      this.teleRectGeo = new THREE.PlaneGeometry(1, 1); this.teleRectGeo.rotateX(-Math.PI / 2); this.teleRectGeo.translate(0, 0, 0.5);
      const mk = (o) => { const m = new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, depthWrite: false, toneMapped: false, opacity: o }); return m; };
      this.telePool = [];
      for (let i = 0; i < 14; i++) {
        const fill = new THREE.Mesh(this.teleCircleGeo, mk(0.28));
        const edge = new THREE.Mesh(this.teleRingGeo, mk(0.85));
        const rect = new THREE.Mesh(this.teleRectGeo, mk(0.22));
        const rectFill = new THREE.Mesh(this.teleRectGeo, mk(0.35));
        for (const m of [fill, edge, rect, rectFill]) { m.visible = false; m.position.y = 0.04; this.scene.add(m); }
        this.telePool.push({ fill, edge, rect, rectFill });
      }
    }

    /* ── Camera ─────────────────────────────────────────────── */

    resize(w, h) {
      this.w = w; this.h = h;
      this.renderer.setSize(w, h, false);
      const aspect = w / h;
      this.camera.aspect = aspect;
      const t = Math.tan(this.camera.fov * Math.PI / 360);
      // Keep the same amount of world on the shorter screen axis in either
      // orientation, so a phone held either way plays the same game.
      const portraitR = 6.6 * this.viewScale, landscapeR = PH.CONFIG.viewHalf * this.viewScale;
      this.camDist = aspect < 1 ? portraitR / (t * aspect) : landscapeR * Math.sin(this.pitch) / t;
      this.camera.far = this.camDist + 60;
      this.camera.updateProjectionMatrix();
      this.pMat.uniforms.uScale.value = (h * this.dpr) / (2 * t);
      this.scene.fog.near = this.camDist + 4;
      this.scene.fog.far = this.camDist + 34;
      this.computeViewBounds();
    }

    /** The patch of ground actually on screen, found by casting the screen corners onto it. */
    computeViewBounds() {
      this.placeCamera(0, 0, true);
      const ray = new THREE.Raycaster();
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ray.setFromCamera({ x: nx, y: ny }, this.camera);
        const hit = new THREE.Vector3();
        if (ray.ray.intersectPlane(plane, hit)) {
          minX = Math.min(minX, hit.x); maxX = Math.max(maxX, hit.x);
          minZ = Math.min(minZ, hit.z); maxZ = Math.max(maxZ, hit.z);
        }
      }
      this.view = { minX, maxX, minZ, maxZ };
    }

    placeCamera(x, z, immediate) {
      const k = immediate ? 1 : 1;
      this.camTarget.set(x, 0, z);
      const back = Math.cos(this.pitch) * this.camDist, up = Math.sin(this.pitch) * this.camDist;
      let sx = 0, sz = 0;
      if (this.shake > 0.001 && !immediate) {
        sx = (Math.random() - 0.5) * this.shake; sz = (Math.random() - 0.5) * this.shake;
      }
      const zk = immediate ? 1 : 1 - this.zoom;
      this.camera.position.set(x + sx, up * zk, z + back * zk + sz);
      this.camera.lookAt(x + sx * 0.5, 0, z + sz * 0.5);
      this.camera.updateMatrixWorld();
      return k;
    }

    project(x, y, z, out) {
      _p.set(x, y, z).project(this.camera);
      out.x = (_p.x * 0.5 + 0.5) * this.w;
      out.y = (-_p.y * 0.5 + 0.5) * this.h;
      out.on = _p.z < 1;
      return out;
    }

    addShake(a) { this.shake = Math.min(1.2, this.shake + a); }

    /* ── Characters (reused models) ─────────────────────────── */

    /** Bounding box of the visible body, ignoring the monsters' huge translucent auras. */
    bodyBox(group) {
      const box = new THREE.Box3();
      const skip = new Set([group.userData.aura, group.userData.innerAura]);
      group.updateMatrixWorld(true);
      group.traverse((o) => {
        if (o.isMesh && !skip.has(o) && !(o.material && o.material.transparent && o.material.opacity < 0.5)) box.expandByObject(o);
      });
      return box;
    }

    setPlayer(hunterClass) {
      // Remove the wrapper that was added to the scene, not the mesh inside it -
      // removing the inner mesh left the menu's hunter standing in every run.
      if (this.player) this.scene.remove(this.player.root);
      const mesh = this.chars.createHunterMesh({ hunterClass });
      mesh.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      const box = this.bodyBox(mesh);
      const inner = new THREE.Group();
      inner.add(mesh);
      mesh.position.y = -box.min.y;
      this.scene.add(inner);
      this.player = { root: inner, mesh, height: box.max.y - box.min.y, facing: 0 };
    }

    /**
     * Build the run's boss models up front and compile their shaders. A stage
     * 2 or 3 monster is dozens of meshes; creating it on arrival cost ~18ms
     * on a desktop CPU, which is a visible hitch on a phone right at the
     * moment the fight is meant to land.
     */
    prepareBosses(list) {
      this.preparedBosses = new Map();
      const tmp = new THREE.Scene();
      tmp.add(new THREE.AmbientLight(0xffffff, 0.5));
      for (const { type, stage } of list) {
        const mesh = this.chars.createMonsterMesh({ monsterType: type, evolutionStage: stage });
        this.preparedBosses.set(`${type}:${stage}`, mesh);
        tmp.add(mesh);
      }
      try { this.renderer.compile(tmp, this.camera); } catch { /* compile is an optimisation only */ }
      for (const m of [...tmp.children]) tmp.remove(m);
    }

    addBoss(id, monsterType, stage) {
      const key = `${monsterType}:${stage}`;
      const prepared = this.preparedBosses && this.preparedBosses.get(key);
      if (prepared) this.preparedBosses.delete(key);
      const mesh = prepared || this.chars.createMonsterMesh({ monsterType, evolutionStage: stage });
      mesh.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      const box = this.bodyBox(mesh);
      const root = new THREE.Group();
      root.add(mesh);
      mesh.position.y = -box.min.y;
      this.scene.add(root);
      const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      const pm = mesh.userData.primaryMaterial;
      const b = { root, mesh, flash: 0, height: box.max.y - box.min.y, radius: width * 0.38,
        baseGlow: pm ? pm.emissiveIntensity : 0 };   // the model's own per-stage glow
      this.bosses.set(id, b);
      return { radius: b.radius, height: b.height };
    }

    removeBoss(id) {
      const b = this.bosses.get(id);
      if (!b) return;
      this.scene.remove(b.root);
      this.bosses.delete(id);
    }

    flashBoss(id) { const b = this.bosses.get(id); if (b) b.flash = 1; }

    /* ── Particles & one-off effects ────────────────────────── */

    burst(x, y, z, count, color, speed = 4, size = 0.25, life = 0.5, grav = 6, up = 0.5) {
      const P = this.p;
      const cr = ((color >> 16) & 255) / 255, cg = ((color >> 8) & 255) / 255, cb = (color & 255) / 255;
      for (let i = 0; i < count; i++) {
        if (P.n >= this.pMax) return;
        const k = P.n++;
        const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.65);
        P.x[k] = x; P.y[k] = y; P.z[k] = z;
        P.vx[k] = Math.cos(a) * s; P.vz[k] = Math.sin(a) * s; P.vy[k] = up * speed * (0.4 + Math.random());
        P.max[k] = P.life[k] = life * (0.6 + Math.random() * 0.6);
        P.size[k] = size * (0.6 + Math.random() * 0.8);
        P.r[k] = cr; P.g[k] = cg; P.b[k] = cb; P.grav[k] = grav;
      }
    }

    ring(x, z, radius, count, color, size = 0.3, life = 0.5) {
      const P = this.p;
      const cr = ((color >> 16) & 255) / 255, cg = ((color >> 8) & 255) / 255, cb = (color & 255) / 255;
      for (let i = 0; i < count; i++) {
        if (P.n >= this.pMax) return;
        const k = P.n++, a = (i / count) * Math.PI * 2;
        P.x[k] = x + Math.cos(a) * radius * 0.2; P.y[k] = 0.3; P.z[k] = z + Math.sin(a) * radius * 0.2;
        P.vx[k] = Math.cos(a) * radius * 2; P.vz[k] = Math.sin(a) * radius * 2; P.vy[k] = 0.4;
        P.max[k] = P.life[k] = life; P.size[k] = size;
        P.r[k] = cr; P.g[k] = cg; P.b[k] = cb; P.grav[k] = 0;
      }
    }

    explosion(x, z, radius, color = 0xff8a3d) {
      this.burst(x, 0.4, z, Math.min(40, 14 + radius * 8), color, radius * 3.2, 0.42, 0.5, 4, 0.6);
      this.burst(x, 0.4, z, 10, 0xfff2b3, radius * 1.6, 0.6, 0.25, 0, 0.3);
      this.ring(x, z, radius, 22, color, 0.32, 0.35);
    }

    shockwave(x, z, r, color = 0xffffff, dur = 0.45) {
      let w = this.waves.find((q) => !q.on);
      if (!w) w = this.waves.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
      w.on = true; w.t = 0; w.dur = dur; w.r = r;
      w.mesh.visible = true;
      w.mesh.position.x = x; w.mesh.position.z = z;
      // Authored as on-screen colours; r128 would otherwise read them as linear and wash them out.
      w.mesh.material.color.setHex(color).convertSRGBToLinear();
    }

    /** A creature's last frames: a white flash as it squashes into the ground. */
    enemyDeath(e) {
      if (this.pops.length >= 60) this.pops.shift();
      this.pops.push({ type: e.type, x: e.x, z: e.z, facing: e.facing, s: PH.ENEMIES[e.type].scale * e.scale, t: 0 });
    }

    zoomPunch(a) { this.zoom = Math.max(this.zoom, a); }

    dashTrail(x, z, dx, dz, dist) {
      for (let i = 0; i <= 6; i++) {
        const f = i / 6;
        this.burst(x + dx * dist * f, 0.6, z + dz * dist * f, 3, 0xbfe3ff, 1.2, 0.3, 0.3, 0, 0.2);
      }
      this.shockwave(x, z, 1.2, 0xbfe3ff, 0.25);
    }

    lightningChain(points, color = 0x9be7ff) {
      this.lightning.push({ points, life: 0.16, max: 0.16, color, seed: Math.random() * 100 });
    }

    // Effects3D set pieces. It maps game coords with (v - 1000) * 0.05.
    fxCoords(x, z) { return [x * 20 + 1000, z * 20 + 1000]; }
    bossArrival(x, z, stage, type) { const [a, b] = this.fxCoords(x, z); this.fx.createEvolutionEffect(a, b, stage, type); }
    bossSlam(x, z, r) { const [a, b] = this.fxCoords(x, z); this.fx.createGroundSlam(a, b, r * 20); }
    bossDeath(x, z, r, color) {
      const [a, b] = this.fxCoords(x, z);
      this.fx.createExplosion(a, b, { radius: r * 20, color });
      this.explosion(x, z, r * 1.5, color);
      this.burst(x, 1, z, 60, 0xffd700, 9, 0.5, 1.1, 5, 1);
    }

    emojiTexture(ch) {
      if (this.emojiCache.has(ch)) return this.emojiCache.get(ch);
      const t = canvasTexture(128, (g, s) => {
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `${s * 0.78}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        g.fillText(ch, s / 2, s / 2 + s * 0.05);
      });
      this.emojiCache.set(ch, t);
      return t;
    }

    /* ── Per-frame sync ─────────────────────────────────────── */

    frame(game, dt) {
      this.time += dt;
      const t = this.time;
      this.trackFrameTime(dt);

      const pl = game.player;
      // Camera: a short lag reads as weight; a long one reads as lag.
      const k = 1 - Math.exp(-dt * 9);
      const cx = this.camTarget.x + (pl.x - this.camTarget.x) * k;
      const cz = this.camTarget.z + (pl.z - this.camTarget.z) * k;
      this.shake *= Math.exp(-dt * 7);
      this.zoom *= Math.exp(-dt * 1.6);
      this.placeCamera(cx, cz, false);
      this.updateBiome(game, dt);
      this.sun.position.set(cx - 6, 14, cz + 8);
      this.sun.target.position.set(cx, 0, cz);
      this.snapGround(cx, cz);

      this.shadows.begin();
      this.halos.begin();
      const glowAll = this.qualityLevel === 0;    // weak devices skip the small halos

      // Player
      if (this.player) {
        const P = this.player;
        P.root.position.set(pl.x, 0, pl.z);
        const want = pl.facing;
        let d = want - P.facing;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        P.facing += d * Math.min(1, dt * 14);
        P.root.rotation.y = P.facing;
        if (P.isMonster) {
          P.root.position.y = pl.lift || 0;
          P.root.visible = true;
          this.chars.animateMonster(P.mesh, t, pl.moving || pl.evolveT > 0);
          const pm = P.mesh.userData.primaryMaterial;
          if (pm) {
            P.flash = Math.max(0, P.flash - dt * 12);
            const evo = pl.evolveT > 0 ? 0.6 + Math.sin(t * 20) * 0.4 : 0;
            pm.emissiveIntensity = P.baseGlow + P.flash * 0.35 + evo;
          }
          const sr = pl.radius * 1.15;
          this.shadows.add(pl.x, 0.02, pl.z, 0, sr, 1, sr);
          if (pl.evolveT > 0) this.halos.add(pl.x, 1.2, pl.z, 0, 6, 6, 6, 0.6, 0.45, 0.05);
        } else {
          // Hunter mode: you can be downed (lie flat) or dead (gone until redeployed).
          const down = pl.state === 'down';
          P.root.rotation.x += ((down ? -1.35 : 0) - P.root.rotation.x) * Math.min(1, dt * 10);
          P.root.position.y = down ? 0.25 : 0;
          P.root.visible = pl.state !== 'dead' && pl.state !== 'waiting' && !(pl.iframes > 0 && !down && Math.floor(t * 18) % 2 === 0);
          if (!down) this.chars.animateHunter(P.mesh, t, pl.moving);
          this.shadows.add(pl.x, 0.02, pl.z, 0, 0.55, 1, 0.55);
          if (pl.shieldT > 0) this.halos.add(pl.x, 1, pl.z, 0, 2.4, 2.4, 2.4, 0.15, 0.4, 0.9);
          if (down) this.halos.add(pl.x, 0.4, pl.z, 0, 1.8, 1.8, 1.8, Math.floor(t * 4) % 2 ? 0.8 : 0.3, 0.05, 0.05);
        }
        if (game.overdrive > 0) {
          const k = 0.75 + Math.sin(t * 22) * 0.25;
          this.halos.add(pl.x, 1.0, pl.z, 0, 3.2 * k, 3.2 * k, 3.2 * k, 0.9, 0.38, 0.08);
          if (dt > 0) this.burst(pl.x, 0.4, pl.z, 2, 0xff8a3d, 1.6, 0.22, 0.35, -3, 0.6);
        }
        if (pl.dashT > 0) this.halos.add(pl.x, 0.9, pl.z, 0, 2.4, 2.4, 2.4, 0.35, 0.55, 0.8);
      }

      // Swarm
      for (const type in this.swarm) this.swarm[type].begin();
      this.eliteRings.begin();
      const E = game.enemies;
      for (let i = 0; i < E.length; i++) {
        const e = E[i];
        if (!e.alive) continue;
        const def = PH.ENEMIES[e.type];
        const s = def.scale * e.scale;
        const bob = Math.abs(Math.sin(t * 9 + e.phase)) * 0.12 * s;
        const squash = 1 + Math.sin(t * 18 + e.phase) * 0.06;
        let r = 1, g = 1, b = 1;
        if (e.elite) {
          r = 1.25; g = 1.15; b = 0.9;
          const ring = def.radius * e.scale * (1.5 + Math.sin(t * 6) * 0.08);
          this.eliteRings.add(e.x, 0.05, e.z, t, ring, 1, ring);
        }
        if (e.flash > 0) { r = g = b = 4; }
        this.swarm[e.type].add(e.x, bob, e.z, e.facing, s, s * squash, s, r, g, b);
        this.shadows.add(e.x, 0.02, e.z, 0, def.radius * e.scale * 1.15, 1, def.radius * e.scale * 1.15);
      }
      // Death pops: a flash and a squash, drawn in the same instanced batches.
      for (let i = this.pops.length - 1; i >= 0; i--) {
        const d = this.pops[i];
        d.t += dt;
        const k = d.t / 0.14;
        if (k >= 1) { this.pops.splice(i, 1); continue; }
        const w = d.s * (1 + k * 0.45), f = 3.2 - k * 2.2;
        this.swarm[d.type].add(d.x, 0, d.z, d.facing, w, d.s * (1 - k * 0.85), w, f, f, f);
      }
      for (const type in this.swarm) this.swarm[type].end();
      this.eliteRings.end();

      // Bosses
      for (const bs of game.bosses) {
        const vb = this.bosses.get(bs.id);
        if (!vb) continue;
        // Hunter mode: the monster is only drawn while someone can see it.
        vb.root.visible = !bs.hidden;
        if (bs.hidden) continue;
        vb.root.position.set(bs.x, bs.lift || 0, bs.z);
        vb.root.rotation.y = bs.facing;
        this.chars.animateMonster(vb.mesh, t, bs.moving);
        const mats = vb.mesh.userData;
        if (mats.primaryMaterial) {
          // Weapons hit a boss nearly every frame, so a strong flash never
          // settles and the model washes out to white. Keep it a modest pulse
          // on top of the stage glow the model was built with.
          vb.flash = Math.max(0, vb.flash - dt * 14);
          mats.primaryMaterial.emissiveIntensity = vb.baseGlow + vb.flash * 0.45;
        }
        this.shadows.add(bs.x, 0.02, bs.z, 0, bs.radius * 1.2, 1, bs.radius * 1.2);
      }

      // Projectiles
      this.bolts.begin(); this.pellets.begin(); this.harpoons.begin(); this.orbs.begin(); this.nades.begin();
      for (const p of game.projectiles) {
        if (!p.alive) continue;
        const yaw = Math.atan2(p.vx, p.vz);
        if (p.vis === 'bolt') { this.bolts.add(p.x, 0.75, p.z, yaw, 1, 1, 1, 1.6, 1.35, 0.5); this.halos.add(p.x, 0.75, p.z, 0, 0.9, 0.9, 0.9, 0.55, 0.4, 0.12); }
        else if (p.vis === 'pellet') { this.pellets.add(p.x, 0.7, p.z, 0, 1, 1, 1, 1.6, 0.9, 0.35); if (glowAll) this.halos.add(p.x, 0.7, p.z, 0, 0.7, 0.7, 0.7, 0.55, 0.25, 0.06); }
        else if (p.vis === 'harpoon') { this.harpoons.add(p.x, 0.8, p.z, yaw, 1, 1, 1); this.halos.add(p.x, 0.8, p.z, 0, 1.3, 1.3, 1.3, 0.15, 0.5, 0.5); }
        else if (p.vis === 'orb') { this.orbs.add(p.x, 0.7, p.z, 0, 1, 1, 1, p.r, p.g, p.b); this.halos.add(p.x, 0.7, p.z, 0, 1.5, 1.5, 1.5, p.r * 0.6, p.g * 0.6, p.b * 0.6); }
      }
      for (const n of game.lobs) {
        const k2 = n.t / n.dur, y = 0.6 + Math.sin(k2 * Math.PI) * (2.2 + n.dist * 0.15);
        this.nades.add(n.sx + (n.tx - n.sx) * k2, y, n.sz + (n.tz - n.sz) * k2, t * 8, 1, 1, 1);
      }
      this.bolts.end(); this.pellets.end(); this.harpoons.end(); this.orbs.end(); this.nades.end();

      // Gems
      this.gems.begin();
      for (const gm of game.gems) {
        if (!gm.alive) continue;
        const tier = gm.value >= 25 ? [2.2, 0.6, 2.0] : gm.value >= 10 ? [2.4, 1.9, 0.4] : gm.value >= 3 ? [0.6, 2.2, 0.8] : [0.4, 1.7, 2.2];
        const s = gm.value >= 10 ? 1.5 : gm.value >= 3 ? 1.2 : 1;
        const gy = 0.35 + Math.sin(t * 4 + gm.x) * 0.08;
        this.gems.add(gm.x, gy, gm.z, t * 2.5 + gm.z, s, s * 1.3, s, tier[0], tier[1], tier[2]);
        if (glowAll) this.halos.add(gm.x, gy, gm.z, 0, 0.75 * s, 0.75 * s, 0.75 * s, tier[0] * 0.14, tier[1] * 0.14, tier[2] * 0.14);
      }
      this.gems.end();

      // Weapons that live in the world
      this.drones.begin();
      for (const d of game.droneHits) {
        this.drones.add(d.x, 0.9, d.z, 0, 1, 1, 1);
        this.halos.add(d.x, 0.9, d.z, 0, 1.4, 1.4, 1.4, 0.2, 0.42, 0.75);
        if (dt > 0 && Math.random() < 0.5) this.burst(d.x, 0.9, d.z, 1, 0x5aa9ff, 0.3, 0.32, 0.22, 0, 0);
      }
      this.drones.end();

      this.traps.begin(); this.trapLights.begin();
      for (const m of game.mines) {
        const blink = Math.sin(t * 10 + m.x) > 0 ? 2.5 : 0.6;
        this.traps.add(m.x, 0.05, m.z, 0, 1, 1, 1);
        this.trapLights.add(m.x, 0.16, m.z, 0, 1, 1, 1, blink, 0.2, 0.15);
        if (blink > 1) this.halos.add(m.x, 0.2, m.z, 0, 0.8, 0.8, 0.8, 0.6, 0.06, 0.04);
      }
      this.traps.end(); this.trapLights.end();

      const fieldR = game.fieldRadius();
      this.field.visible = fieldR > 0;
      if (fieldR > 0) {
        const pulse = 1 + Math.sin(t * 5) * 0.03;
        this.field.position.set(pl.x, 0.03, pl.z);
        this.field.scale.set(fieldR * pulse, 1, fieldR * pulse);
      }

      // Telegraphs
      let ti = 0;
      for (const tg of game.telegraphs) {
        if (ti >= this.telePool.length) break;
        const T = this.telePool[ti++];
        const prog = Math.min(1, tg.t / tg.dur);
        const blink = prog > 0.75 ? (Math.floor(t * 20) % 2 ? 1 : 0.55) : 1;
        if (tg.shape === 'circle') {
          T.rect.visible = T.rectFill.visible = false;
          T.edge.visible = T.fill.visible = true;
          T.edge.position.set(tg.x, 0.05, tg.z); T.edge.scale.set(tg.r, 1, tg.r);
          T.fill.position.set(tg.x, 0.04, tg.z); T.fill.scale.set(tg.r * prog, 1, tg.r * prog);
          T.edge.material.opacity = 0.85 * blink;
          T.edge.material.color.setHex(tg.color || 0xff3344); T.fill.material.color.setHex(tg.color || 0xff3344);
        } else {
          T.edge.visible = T.fill.visible = false;
          T.rect.visible = T.rectFill.visible = true;
          for (const m of [T.rect, T.rectFill]) { m.position.set(tg.x, 0.04, tg.z); m.rotation.y = tg.angle; }
          T.rect.scale.set(tg.w, 1, tg.len);
          T.rectFill.scale.set(tg.w, 1, tg.len * prog);
          T.rect.material.opacity = 0.22 * blink;
        }
      }
      for (; ti < this.telePool.length; ti++) {
        const T = this.telePool[ti];
        T.fill.visible = T.edge.visible = T.rect.visible = T.rectFill.visible = false;
      }

      // Lightning: jagged segments regenerated every frame so they flicker.
      this.segments.begin();
      for (let i = this.lightning.length - 1; i >= 0; i--) {
        const L = this.lightning[i];
        L.life -= dt;
        if (L.life <= 0) { this.lightning.splice(i, 1); continue; }
        const a = L.life / L.max;
        const cr = ((L.color >> 16) & 255) / 255 * 2.2 * a, cg = ((L.color >> 8) & 255) / 255 * 2.2 * a, cb = (L.color & 255) / 255 * 2.2 * a;
        for (let j = 0; j < L.points.length - 1; j++) {
          const A = L.points[j], B = L.points[j + 1];
          let px = A.x, pz = A.z, py = 0.9;
          const steps = 4;
          for (let s = 1; s <= steps; s++) {
            const f = s / steps;
            const jx = s === steps ? 0 : (Math.random() - 0.5) * 0.6, jz = s === steps ? 0 : (Math.random() - 0.5) * 0.6;
            const nx = A.x + (B.x - A.x) * f + jx, nz = A.z + (B.z - A.z) * f + jz, ny = 0.9 + (s === steps ? 0 : (Math.random() - 0.5) * 0.4);
            this.segments.addSegment(px, py, pz, nx, ny, nz, 0.09, cr, cg, cb);
            px = nx; py = ny; pz = nz;
          }
        }
      }
      // Medic healing beams.
      if (game.beams) {
        for (const b of game.beams) {
          const w = 0.06 + Math.abs(Math.sin(t * 14)) * 0.05;
          this.segments.addSegment(b.ax, 1.1, b.az, b.bx, 1.1, b.bz, w, 0.25, 1.4, 0.55);
        }
      }
      this.segments.end();

      // Pickups as emoji sprites: few on screen, and they read instantly.
      let si = 0;
      for (const pk of game.pickups) {
        if (!pk.alive) continue;
        let spr = this.sprites[si];
        if (!spr) { spr = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false })); this.scene.add(spr); this.sprites.push(spr); }
        if (spr.material.map !== this.emojiTexture(pk.icon)) { spr.material.map = this.emojiTexture(pk.icon); spr.material.needsUpdate = true; }
        spr.visible = true;
        const s = pk.kind === 'chest' ? 1.3 : 0.9;
        spr.scale.set(s, s, 1);
        spr.position.set(pk.x, 0.7 + Math.sin(t * 3 + pk.x) * 0.12, pk.z);
        this.shadows.add(pk.x, 0.02, pk.z, 0, 0.35, 1, 0.35);
        si++;
      }
      for (; si < this.sprites.length; si++) this.sprites[si].visible = false;

      if (this.monsterMode && game.hunters) this.drawMonsterMode(game, dt, t);
      this.drawZones(game, dt);
      this.drawWaves(dt);
      this.ambientMotes(game, dt);

      this.shadows.end();
      this.halos.end();
      this.updateParticles(dt);
      this.fx.update(dt);
      this.renderer.render(this.scene, this.camera);
    }

    /** Ease the light, sky and ground toward the current evolution stage. */
    updateBiome(game, dt) {
      const target = game.state === 'menu' ? 0 : Math.min(2, game.bossKills || 0);
      this.biome += (target - this.biome) * Math.min(1, dt * 0.6);
      const i = Math.min(1, Math.floor(this.biome)), k = this.biome - i;
      const A = BIOMES[i], B = BIOMES[i + 1];
      mixHex(this.scene.background, A.bg, B.bg, k);
      this.scene.fog.color.copy(this.scene.background);
      mixHex(this.ambient.color, A.amb, B.amb, k); this.ambient.intensity = A.ambI + (B.ambI - A.ambI) * k;
      mixHex(this.hemi.color, A.sky, B.sky, k); mixHex(this.hemi.groundColor, A.gnd, B.gnd, k);
      this.hemi.intensity = A.hemiI + (B.hemiI - A.hemiI) * k;
      mixHex(this.sun.color, A.sun, B.sun, k); this.sun.intensity = A.sunI + (B.sunI - A.sunI) * k;
      this.ground.material.color.setRGB(
        A.tint[0] + (B.tint[0] - A.tint[0]) * k, A.tint[1] + (B.tint[1] - A.tint[1]) * k, A.tint[2] + (B.tint[2] - A.tint[2]) * k);
      mixHex(this.tuftMat.color, A.tuft, B.tuft, k);
      if (this.grassMat) this.grassMat.color.copy(this.tuftMat.color).multiplyScalar(1.5);
      this.moteColor = k < 0.5 ? A.mote : B.mote;
    }

    /** Fireflies by day, drifting dust at dusk, embers in the final night. */
    ambientMotes(game, dt) {
      if (dt <= 0 || this.qualityLevel > 0) return;
      this.moteAcc += dt * 14;
      const v = this.view, P = this.p, ember = this.biome > 1.5;
      const cr = ((this.moteColor >> 16) & 255) / 255, cg = ((this.moteColor >> 8) & 255) / 255, cb = (this.moteColor & 255) / 255;
      while (this.moteAcc >= 1 && P.n < this.pMax) {
        this.moteAcc -= 1;
        const k = P.n++;
        P.x[k] = this.camTarget.x + v.minX + Math.random() * (v.maxX - v.minX);
        P.z[k] = this.camTarget.z + v.minZ + Math.random() * (v.maxZ - v.minZ);
        P.y[k] = 0.3 + Math.random() * 1.6;
        P.vx[k] = (Math.random() - 0.5) * 0.5; P.vz[k] = (Math.random() - 0.5) * 0.5;
        P.vy[k] = ember ? 0.9 + Math.random() * 0.8 : 0.1 + Math.random() * 0.25;
        P.max[k] = P.life[k] = 2 + Math.random() * 1.5;
        P.size[k] = 0.09 + Math.random() * 0.08;
        P.r[k] = cr; P.g[k] = cg; P.b[k] = cb; P.grav[k] = 0;
      }
    }

    drawZones(game, dt) {
      let wi = 0;
      this.dome.visible = false;
      for (const z of game.zones || []) {
        const left = z.dur - z.t, fade = Math.min(1, left / 0.4) * Math.min(1, z.t / 0.12);
        if (z.kind === 'snare' && wi < this.webs.length) {
          const m = this.webs[wi++];
          m.visible = true;
          m.position.x = z.x; m.position.z = z.z;
          m.scale.set(z.r, 1, z.r);
          m.rotation.y = z.t * 0.4;
          m.material.opacity = 0.75 * fade;
        } else if (z.kind === 'dome' || z.kind === 'arena') {
          const d = this.dome, pulse = 1 + Math.sin(this.time * 6) * 0.015, arena = z.kind === 'arena';
          d.children[0].material.color.setHex(arena ? 0xd6801f : 0x3f8fd6);
          d.children[1].material.color.setHex(arena ? 0xffc37a : 0x9fdcff);
          d.visible = true;
          d.position.set(z.x, 0, z.z);
          d.scale.set(z.r * pulse, z.r * 0.8 * pulse, z.r * pulse);
          d.rotation.y = this.time * 0.5;
          d.children[0].material.opacity = 0.16 * fade;
          d.children[1].material.opacity = 0.35 * fade * (left < 1 && Math.floor(this.time * 10) % 2 ? 0.3 : 1);
        }
      }
      for (; wi < this.webs.length; wi++) this.webs[wi].visible = false;
    }

    drawWaves(dt) {
      for (const w of this.waves) {
        if (!w.on) continue;
        w.t += dt;
        const k = w.t / w.dur;
        if (k >= 1) { w.on = false; w.mesh.visible = false; continue; }
        const r = Math.max(0.05, w.r * easeOut(k));
        w.mesh.scale.set(r, 1, r);
        w.mesh.material.opacity = (1 - k) * 0.75;
      }
    }

    updateParticles(dt) {
      const P = this.p;
      let w = 0;
      for (let i = 0; i < P.n; i++) {
        P.life[i] -= dt;
        if (P.life[i] <= 0) continue;
        P.vy[i] -= P.grav[i] * dt;
        const drag = Math.exp(-dt * 2.5);
        P.vx[i] *= drag; P.vz[i] *= drag;
        P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
        if (P.y[i] < 0.05) { P.y[i] = 0.05; P.vy[i] *= -0.3; }
        if (w !== i) {
          for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'max', 'size', 'r', 'g', 'b', 'grav']) P[key][w] = P[key][i];
        }
        const a = P.life[w] / P.max[w];
        this.pPos[w * 3] = P.x[w]; this.pPos[w * 3 + 1] = P.y[w]; this.pPos[w * 3 + 2] = P.z[w];
        this.pCol[w * 3] = P.r[w]; this.pCol[w * 3 + 1] = P.g[w]; this.pCol[w * 3 + 2] = P.b[w];
        this.pSize[w] = P.size[w] * (0.5 + a * 0.5);
        this.pAlpha[w] = a;
        w++;
      }
      P.n = w;
      const g = this.points.geometry;
      g.setDrawRange(0, w);
      for (const k of ['position', 'color', 'size', 'alpha']) g.attributes[k].needsUpdate = true;
    }

    trackFrameTime(dt) {
      const ft = this.frameTimes;
      ft.push(dt);
      if (ft.length > 120) ft.shift();
      if (this.time - this.lastQualityCheck < 2.5 || ft.length < 90) return;
      this.lastQualityCheck = this.time;
      const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
      if (avg > 1 / 42) {
        if (this.dpr > 1) {
          this.dpr = Math.max(1, this.dpr - 0.25);
          this.renderer.setPixelRatio(this.dpr);
          this.resize(this.w, this.h);
          ft.length = 0;
        } else if (this.qualityLevel === 0) {
          this.qualityLevel = 1;          // game lowers the enemy cap
        }
      }
    }

    clearRun() {
      for (const id of [...this.bosses.keys()]) this.removeBoss(id);
      this.lightning.length = 0;
      this.p.n = 0;
      this.pops.length = 0;
      for (const w of this.waves) { w.on = false; w.mesh.visible = false; }
      this.flocks.length = 0;
      this.trackBatch.begin(); this.trackBatch.end();
      this.birdBatch.begin(); this.birdBatch.end();
      this.fx.clear();
    }
  }

  /** The same surface with no output - used for headless balance runs. */
  class NullRender {
    constructor() { this.view = { minX: -8, maxX: 8, minZ: -14, maxZ: 6 }; this.qualityLevel = 0; }
    burst() {} ring() {} explosion() {} lightningChain() {} addShake() {}
    shockwave() {} enemyDeath() {} zoomPunch() {} dashTrail() {}
    setMonsterMode() {} setHunters() {} setViewScale() {} flashPlayer() {} birds() {}
    setPlayerMonster(type, stage) { return { radius: 1.1 + stage * 0.25, height: 3 }; }
    bossArrival() {} bossSlam() {} bossDeath() {} flashBoss() {} removeBoss() {} clearRun() {} setPlayer() {} prepareBosses() {}
    addBoss() { return { radius: 1.4, height: 3 }; }
  }

  PH.Render = Render;
  PH.NullRender = NullRender;
})();
