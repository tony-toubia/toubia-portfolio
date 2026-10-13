// Hole Haul: the 3D board, the hole, and the swallowing physics.
//
//   const game = new HH_Game(container, hooks)
//   game.load(levelDef, { startLevel, speedMul })   build a level's board (HH_LEVELS.def)
//   game.start() / game.pause(bool) / game.attract(levelDef)   play it / pause / a slow orbit behind the map screen
//   game.setInput(x, y)                             steering, each in -1..1 (y is "up the screen")
//   game.useBooster('freeze' | 'magnet' | 'compass' | 'grow')   true when it took effect
//   game.addTime(seconds), game.project(x, y, z)   continue after time runs out / world → screen pixels
//   hooks: onTarget(kind, got, need), onAllTargets(), onXP(level, frac, grew), onTime(seconds, frozen),
//          onEat({ kind, x, z, target, coin }), onFail(), onBooster(name, seconds) — all optional
//
// The floor has a real hole in it: its shader discards fragments inside the hole's circle, and a dark pit below shows
// through. Physics is hand-rolled and cheap: anything that fits and sits over the hole falls in; anything that fits and
// only overhangs the lip tips towards the hole and slides in; anything too big rocks on the lip until the hole grows.
(() => {
    const T = window.THREE;
    const START_R = 0.6;
    const radiusFor = (lvl) => START_R * (1 + 0.32 * (lvl - 1));
    const xpFor = (lvl) => Math.round(5 * Math.pow(lvl, 1.6));   // xp to go from lvl to lvl + 1
    const lite = (navigator.hardwareConcurrency || 4) <= 4 || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

    /* ── floor textures, drawn once per theme ─────────────────── */
    const texCache = new Map();
    function floorTexture(theme) {
        if (texCache.has(theme.floor + theme.a)) return texCache.get(theme.floor + theme.a);
        const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
        const g = c.getContext('2d');
        const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
        g.fillStyle = theme.a; g.fillRect(0, 0, S, S);
        let tile = 4;   // world units one texture covers
        if (theme.floor === 'grass' || theme.floor === 'soil') {
            if (theme.floor === 'soil') { for (let i = 0; i < 2; i++) { g.fillStyle = i ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'; g.fillRect(i * S / 2, 0, S / 2, S); } }
            for (let i = 0; i < 2600; i++) {
                const x = rnd() * S, y = rnd() * S, l = 5 + rnd() * 9;
                g.strokeStyle = rnd() < 0.5 ? theme.b : 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
                g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 4, y - l); g.stroke();
            }
            tile = 5;
        } else if (theme.floor === 'tiles') {
            const n = 4, s = S / n;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? theme.a : theme.b; g.fillRect(i * s, j * s, s, s); }
            g.strokeStyle = 'rgba(120,130,140,0.35)'; g.lineWidth = 4;
            for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, S); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(S, i * s); g.stroke(); }
            tile = 4;
        } else if (theme.floor === 'wood') {
            const n = 5, s = S / n;
            for (let i = 0; i < n; i++) {
                g.fillStyle = i % 2 ? theme.a : theme.b; g.fillRect(i * s, 0, s, S);
                for (let k = 0; k < 30; k++) { g.strokeStyle = 'rgba(110,70,30,0.12)'; g.lineWidth = 1 + rnd() * 2; const x = i * s + rnd() * s; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, S * 0.3, x - 6, S * 0.6, x + 3, S); g.stroke(); }
                g.fillStyle = 'rgba(80,45,15,0.35)'; g.fillRect(i * s, 0, 3, S);
                const cut = rnd() * S; g.fillRect(i * s, cut, s, 3);
            }
            tile = 5;
        } else if (theme.floor === 'sand') {
            for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < 0.5 ? theme.b : 'rgba(255,255,255,0.45)'; g.fillRect(rnd() * S, rnd() * S, 2, 2); }
            for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(200,160,90,0.25)'; g.lineWidth = 3; const y = rnd() * S; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(S * 0.3, y - 20, S * 0.6, y + 20, S, y); g.stroke(); }
            tile = 6;
        } else if (theme.floor === 'asphalt') {
            for (let i = 0; i < 7000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.08)'; g.fillRect(rnd() * S, rnd() * S, 2, 2); }
            g.fillStyle = theme.b; for (let y = 0; y < S; y += S / 4) g.fillRect(S / 2 - 6, y + 20, 12, S / 8);
            g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(0, 0, 10, S); g.fillRect(S - 10, 0, 10, S);
            tile = 6;
        }
        const tex = new T.CanvasTexture(c);
        tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.encoding = T.sRGBEncoding; tex.anisotropy = 4;
        const out = { tex, tile };
        texCache.set(theme.floor + theme.a, out);
        return out;
    }

    class HH_Game {
        constructor(container, hooks = {}) {
            this.hooks = hooks;
            this.container = container;
            const r = this.renderer = new T.WebGLRenderer({ antialias: !lite, powerPreference: 'high-performance' });
            r.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2));
            r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
            r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
            container.appendChild(r.domElement);
            this.scene = new T.Scene();
            this.camera = new T.PerspectiveCamera(48, 1, 0.1, 400);
            this.hemi = new T.HemisphereLight(0xffffff, 0x8a7a66, 0.75); this.scene.add(this.hemi);
            const sun = this.sun = new T.DirectionalLight(0xffffff, 1.05);
            sun.castShadow = true; sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
            this.scene.add(sun); this.scene.add(sun.target);

            this.holeU = { value: new T.Vector3(0, 0, START_R) };
            this.itemMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.02 });
            this.coinMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.65, emissive: 0x332200, emissiveIntensity: 0.4 });
            // Anything below the floor (falling into the pit) darkens with depth.
            for (const m of [this.itemMat, this.coinMat]) m.onBeforeCompile = (sh) => {
                sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vHHY;')
                    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHHY = (modelMatrix * vec4(transformed, 1.0)).y;');
                sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHHY;')
                    .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb *= clamp(1.0 + vHHY * 0.55, 0.08, 1.0);');
            };
            this.geoCache = new Map();
            this.world = null;
            this.input = { x: 0, y: 0 };
            this.paused = true; this.mode = 'idle';
            this.clock = new T.Clock();
            this.resize(); window.addEventListener('resize', () => this.resize());
            if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(container);
            document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') this.pause(true); });
            this.buildHole();
            this.markers = [];
            const loop = () => { requestAnimationFrame(loop); this.frame(Math.min(0.05, this.clock.getDelta())); };
            loop();
        }

        resize() {
            const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
            this.renderer.setSize(w, h, false); this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
            this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
        }

        /* ── the hole: a pit under the floor's cut-out, and a soft lip ── */
        buildHole() {
            const g = this.holeGroup = new T.Group();
            const cyl = new T.CylinderGeometry(1, 1, 1, 48, 6, true); cyl.translate(0, -0.5, 0);
            const cols = [], p = cyl.attributes.position;
            for (let i = 0; i < p.count; i++) { const y = -p.getY(i); const c = Math.max(0, 0.16 - y * 0.2); cols.push(c * 0.7, c * 0.62, c * 1.0); }
            cyl.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
            g.add(new T.Mesh(cyl, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
            const bottom = new T.Mesh(new T.CircleGeometry(1, 48), new T.MeshBasicMaterial({ color: 0x000000 }));
            bottom.rotation.x = -Math.PI / 2; bottom.position.y = -1; g.add(bottom);
            this.pitDepth = 6;
            const lip = new T.Mesh(new T.RingGeometry(1, 1.07, 64), new T.MeshBasicMaterial({ color: 0x1b1530, transparent: true, opacity: 0.55, depthWrite: false }));
            lip.rotation.x = -Math.PI / 2; lip.position.y = 0.012; this.lip = lip;
            this.scene.add(g); this.scene.add(lip);
        }

        /** The hole through a surface: its shader discards fragments inside the hole's circle (so the pit shows through). */
        cutHole(mat) {
            const holeU = this.holeU;
            mat.onBeforeCompile = (sh) => {
                sh.uniforms.uHole = holeU;
                sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHHWorld;')
                    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHHWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
                sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uHole;\nvarying vec3 vHHWorld;')
                    .replace('void main() {', 'void main() {\n  if (distance(vHHWorld.xz, uHole.xy) < uHole.z) discard;');
            };
            return mat;
        }

        geometryFor(kind) {
            if (!this.geoCache.has(kind)) {
                const k = window.HH_MODELS.kinds[kind];
                const geo = k.build(); if (!geo.boundingSphere) geo.computeBoundingSphere();
                this.geoCache.set(kind, geo);
            }
            return this.geoCache.get(kind);
        }

        clearWorld() {
            if (!this.world) return;
            this.scene.remove(this.world.group);
            this.world.group.traverse((o) => { if (o.isMesh && o.userData.own) { o.geometry.dispose(); if (o.material.map) o.material.map = null; o.material.dispose(); } });
            for (const m of this.markers) this.scene.remove(m);
            this.markers = [];
            this.world = null;
        }

        load(def, { startLevel = 1, speedMul = 1 } = {}) {
            this.clearWorld();
            const theme = window.HH_LEVELS.themes[def.theme];
            const group = new T.Group();
            this.scene.background = new T.Color(theme.sky);
            this.scene.fog = new T.Fog(theme.fog, 30, 90);

            // The floor, with the hole cut out by its shader.
            const ft = floorTexture(theme);
            const tex = ft.tex.clone(); tex.needsUpdate = true; tex.repeat.set(def.w / ft.tile, def.d / ft.tile);
            const floorMat = new T.MeshStandardMaterial({ map: tex, roughness: 0.92 });
            this.cutHole(floorMat);
            const floor = new T.Mesh(new T.PlaneGeometry(def.w, def.d, 1, 1), floorMat);
            floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.own = true;
            group.add(floor);
            // The ground around the board and a low rim.
            const groundMat = this.cutHole(new T.MeshStandardMaterial({ color: new T.Color(theme.fog).multiplyScalar(0.9), roughness: 1 }));
            const ground = new T.Mesh(new T.PlaneGeometry(400, 400), groundMat);
            ground.rotation.x = -Math.PI / 2; ground.position.y = -0.45; ground.receiveShadow = true; ground.userData.own = true; group.add(ground);
            const rimMat = new T.MeshStandardMaterial({ color: theme.rim, roughness: 0.7 });
            const t = 0.5, hgt = 0.9;
            for (const [w, d, x, z] of [[def.w + t * 2, t, 0, -def.d / 2 - t / 2], [def.w + t * 2, t, 0, def.d / 2 + t / 2], [t, def.d, -def.w / 2 - t / 2, 0], [t, def.d, def.w / 2 + t / 2, 0]]) {
                const m = new T.Mesh(new T.BoxGeometry(w, hgt, d), rimMat); m.position.set(x, hgt / 2 - 0.45, z); m.castShadow = m.receiveShadow = true; m.userData.own = true; group.add(m);
            }

            // Items.
            const items = [];
            const K = window.HH_MODELS.kinds;
            for (const it of def.items) {
                const k = K[it.kind]; if (!k) continue;
                const mesh = new T.Mesh(this.geometryFor(it.kind), it.kind === 'coin' ? this.coinMat : this.itemMat);
                mesh.position.set(it.x, 0, it.z); mesh.rotation.y = it.rot;
                mesh.castShadow = !lite || k.r > 0.3; mesh.receiveShadow = true;
                group.add(mesh);
                items.push({ mesh, kind: it.kind, r: k.r, h: k.h, xp: k.xp || 1, x: it.x, z: it.z, y: 0, vy: 0, tilt: 0, ux: 0, uz: 0, rot: it.rot, state: 0, alive: true, coin: it.kind === 'coin' });
            }
            this.scene.add(group);

            const need = {}, got = {};
            for (const t2 of def.targets) { need[t2.kind] = t2.count; got[t2.kind] = 0; }
            this.world = { def, group, items, need, got, w: def.w, d: def.d };
            this.level = startLevel; this.xp = 0;
            this.holeR = radiusFor(startLevel); this.holeTargetR = this.holeR;
            this.hole = { x: 0, z: def.d * 0.22, vx: 0, vz: 0 };
            this.speedMul = speedMul;
            this.timeLeft = def.time; this.frozen = 0; this.magnet = 0; this.compass = 0;
            this.lastTick = Math.ceil(this.timeLeft);
            this.cam = { x: this.hole.x, z: this.hole.z, h: this.camHeight(), orbit: 0 };
            this.mode = 'ready'; this.paused = true;
            this.emitXP(false);
            this.syncHole();
        }

        start() { this.mode = 'play'; this.paused = false; this.clock.getDelta(); }
        pause(p) { if (this.mode !== 'play' && this.mode !== 'paused') return; this.paused = !!p; this.mode = p ? 'paused' : 'play'; if (!p) this.clock.getDelta(); }
        attract(def) { this.load(def); this.mode = 'attract'; this.paused = false; }
        setInput(x, y) { this.input.x = x; this.input.y = y; }
        addTime(s) { this.timeLeft += s; this.lastTick = Math.ceil(this.timeLeft); this.mode = 'play'; this.paused = false; this.clock.getDelta(); }

        camHeight() {
            const a = this.camera.aspect || 1;
            return (6 + this.holeR * 7.5) * (a < 1 ? 1 + (1 - a) * 0.7 : 1);
        }

        syncHole() {
            const { x, z } = this.hole, r = this.holeR;
            this.holeU.value.set(x, z, r);
            this.holeGroup.position.set(x, 0, z); this.holeGroup.scale.set(r, this.pitDepth, r);
            this.lip.position.set(x, 0.012, z); this.lip.scale.set(r, r, 1);
        }

        emitXP(grew) { if (this.hooks.onXP) this.hooks.onXP(this.level, Math.min(1, this.xp / xpFor(this.level)), grew); }
        gainXP(n) {
            this.xp += n; let grew = false;
            while (this.xp >= xpFor(this.level)) { this.xp -= xpFor(this.level); this.level++; grew = true; }
            if (grew) { this.holeTargetR = radiusFor(this.level); window.HH_AUDIO.play('grow'); }
            this.emitXP(grew);
        }

        useBooster(name) {
            if (this.mode !== 'play') return false;
            if (name === 'freeze') { this.frozen = 10; }
            else if (name === 'magnet') { this.magnet = 8; }
            else if (name === 'compass') { this.compass = 10; this.placeMarkers(); }
            else if (name === 'grow') { this.gainXP(xpFor(this.level) - this.xp); }
            else return false;
            window.HH_AUDIO.play('booster');
            if (this.hooks.onBooster) this.hooks.onBooster(name, name === 'grow' ? 0 : name === 'freeze' ? 10 : name === 'magnet' ? 8 : 10);
            return true;
        }

        // Compass: a bouncing arrow over every target item still on the board.
        placeMarkers() {
            for (const m of this.markers) this.scene.remove(m);
            this.markers = [];
            const geo = new T.ConeGeometry(0.22, 0.45, 12); geo.rotateX(Math.PI);
            const mat = new T.MeshBasicMaterial({ color: 0xffd23f });
            for (const it of this.world.items) {
                if (!it.alive || it.state || !(it.kind in this.world.need) || this.world.got[it.kind] >= this.world.need[it.kind]) continue;
                const m = new T.Mesh(geo, mat); m.userData.item = it; m.userData.phase = Math.random() * 6; this.scene.add(m); this.markers.push(m);
            }
        }

        project(x, y, z) {
            const v = new T.Vector3(x, y, z).project(this.camera), el = this.renderer.domElement;
            return { x: (v.x + 1) / 2 * el.clientWidth, y: (1 - v.y) / 2 * el.clientHeight };
        }

        /* ── per frame ───────────────────────────────────────────── */
        frame(dt) {
            const W = this.world;
            if (!W) { this.renderer.render(this.scene, this.camera); return; }
            const playing = this.mode === 'play' && !this.paused;
            if (this.mode === 'attract') this.attractFrame(dt);
            if (playing) {
                this.moveHole(dt);
                this.tickTime(dt);
            }
            if (playing || this.mode === 'won') this.physics(dt);
            // The hole eases to its new size after growing.
            if (Math.abs(this.holeTargetR - this.holeR) > 0.001) this.holeR += (this.holeTargetR - this.holeR) * Math.min(1, dt * 5);
            this.syncHole();
            this.updateCamera(dt);
            if (this.compass > 0) {
                const t = performance.now() / 1000;
                for (const m of this.markers) { const it = m.userData.item; m.visible = it.alive && !it.state; m.position.set(it.x, it.h + 0.5 + Math.sin(t * 5 + m.userData.phase) * 0.15, it.z); }
            }
            this.renderer.render(this.scene, this.camera);
        }

        attractFrame(dt) {
            this.cam.orbit += dt * 0.12;
            this.hole.x = Math.sin(this.cam.orbit) * this.world.w * 0.25; this.hole.z = Math.cos(this.cam.orbit * 0.7) * this.world.d * 0.25;
        }

        moveHole(dt) {
            const sp = (3.4 + this.holeR * 1.1) * this.speedMul;
            const tx = this.input.x * sp, tz = -this.input.y * sp, k = Math.min(1, dt * 10);
            const h = this.hole;
            h.vx += (tx - h.vx) * k; h.vz += (tz - h.vz) * k;
            h.x += h.vx * dt; h.z += h.vz * dt;
            const mx = this.world.w / 2 - this.holeR * 0.75, mz = this.world.d / 2 - this.holeR * 0.75;
            h.x = Math.max(-mx, Math.min(mx, h.x)); h.z = Math.max(-mz, Math.min(mz, h.z));
        }

        tickTime(dt) {
            if (this.frozen > 0) this.frozen -= dt;
            else this.timeLeft -= dt;
            if (this.magnet > 0) this.magnet -= dt;
            if (this.compass > 0) { this.compass -= dt; if (this.compass <= 0) { for (const m of this.markers) this.scene.remove(m); this.markers = []; } }
            const sec = Math.ceil(this.timeLeft);
            if (sec !== this.lastTick) { this.lastTick = sec; if (sec <= 10 && sec > 0) window.HH_AUDIO.play('tick'); }
            if (this.hooks.onTime) this.hooks.onTime(Math.max(0, this.timeLeft), this.frozen > 0);
            if (this.timeLeft <= 0) { this.timeLeft = 0; this.mode = 'failed'; this.paused = true; window.HH_AUDIO.play('fail'); if (this.hooks.onFail) this.hooks.onFail(); }
        }

        physics(dt) {
            const W = this.world, hx = this.hole.x, hz = this.hole.z, R = this.holeR;
            const up = new T.Vector3(0, 1, 0), axis = new T.Vector3(), qT = new T.Quaternion(), qY = new T.Quaternion();
            for (const it of W.items) {
                if (!it.alive) continue;
                let dx = it.x - hx, dz = it.z - hz;
                const d = Math.hypot(dx, dz) || 1e-4;
                if (it.state === 0) {
                    const fits = it.r < R * 0.96;
                    // Magnet: wanted items within reach glide towards the hole.
                    if (this.magnet > 0 && fits && d < R + 5 && it.kind in W.need && W.got[it.kind] < W.need[it.kind]) {
                        const s = Math.min(d, dt * 4.5); it.x -= dx / d * s; it.z -= dz / d * s; dx = it.x - hx; dz = it.z - hz;
                    }
                    const dd = Math.hypot(dx, dz) || 1e-4, reach = R + it.r;
                    let tilt = 0;
                    if (dd < reach) {
                        if (fits) {
                            if (dd < R - it.r * 0.2) { it.state = 1; it.vy = 0; it.ux = -dx / dd; it.uz = -dz / dd; }
                            else {
                                // On the lip: lean towards the hole and slide off the edge.
                                const over = Math.min(1, (reach - dd) / (2 * it.r));
                                const s = dt * (1.2 + over * 4) * (0.6 + 0.4 / Math.max(0.3, it.r));
                                it.x -= dx / dd * s; it.z -= dz / dd * s;
                                tilt = over * 0.85;
                            }
                        } else {
                            tilt = Math.min(0.16, (reach - dd) / reach * 0.5);   // too big: it rocks on the lip
                        }
                    }
                    it.tilt += (tilt - it.tilt) * Math.min(1, dt * 12);
                    if (it.state === 0) { it.ux = -dx / dd; it.uz = -dz / dd; }
                } else {
                    // Falling: drawn towards the middle of the hole while it drops into the pit.
                    const k = Math.min(1, dt * 7);
                    it.x += (hx - it.x) * k * 0.6; it.z += (hz - it.z) * k * 0.6;
                    it.vy -= 26 * dt; it.y += it.vy * dt;
                    it.tilt += (1.35 - it.tilt) * Math.min(1, dt * 4);
                    if (it.y < -(it.h + 0.6 + R * 0.6)) { this.eat(it); continue; }
                }
                // Pose: yaw, then a lean about the axis perpendicular to the hole direction (the top leans towards it).
                it.mesh.position.set(it.x, it.y, it.z);
                if (it.tilt > 0.002) {
                    axis.set(it.uz, 0, -it.ux).normalize();
                    qT.setFromAxisAngle(axis, it.tilt); qY.setFromAxisAngle(up, it.rot);
                    it.mesh.quaternion.copy(qT).multiply(qY);
                } else if (it.mesh.rotation.x || it.mesh.rotation.z) { it.mesh.quaternion.setFromAxisAngle(up, it.rot); }
            }
        }

        eat(it) {
            const W = this.world;
            it.alive = false; it.mesh.visible = false; W.group.remove(it.mesh);
            let target = false;
            if (it.kind in W.need && W.got[it.kind] < W.need[it.kind]) {
                W.got[it.kind]++; target = true;
                window.HH_AUDIO.play(W.got[it.kind] === W.need[it.kind] ? 'done' : 'target');
                if (this.hooks.onTarget) this.hooks.onTarget(it.kind, W.got[it.kind], W.need[it.kind]);
            } else if (it.coin) window.HH_AUDIO.play('coin');
            else window.HH_AUDIO.play('gulp', it.r);
            this.gainXP(it.coin ? 1 : it.xp);
            if (this.hooks.onEat) this.hooks.onEat({ kind: it.kind, x: this.hole.x, z: this.hole.z, target, coin: it.coin });
            if (this.mode === 'play' && Object.keys(W.need).every((k) => W.got[k] >= W.need[k])) {
                this.mode = 'won'; this.paused = true;
                window.HH_AUDIO.play('win');
                if (this.hooks.onAllTargets) this.hooks.onAllTargets({ timeLeft: this.timeLeft, time: W.def.time });
            }
        }

        updateCamera(dt) {
            const c = this.cam, h = this.hole, k = Math.min(1, dt * (this.mode === 'attract' ? 1 : 6));
            const H = this.mode === 'attract' ? Math.max(this.world.w, this.world.d) * 0.9 : this.camHeight();
            c.h += (H - c.h) * Math.min(1, dt * 2.5);
            // Follow the hole, but keep the view over the board: near an edge the hole moves off-centre instead of the
            // camera showing empty ground (the view reaches about 0.45·h past its target towards the bottom of the screen).
            let tx = h.x, tz = h.z;
            if (this.mode !== 'attract') {
                const a = this.camera.aspect || 1, mz = Math.max(0, this.world.d / 2 - c.h * 0.42), mx = Math.max(0, this.world.w / 2 - c.h * 0.42 * Math.min(1.6, a));
                tz = Math.max(-mz, Math.min(mz + c.h * 0.08, tz)); tx = Math.max(-mx, Math.min(mx, tx));
            }
            c.x += (tx - c.x) * k; c.z += (tz - c.z) * k;
            const back = c.h * 0.78;
            this.camera.position.set(c.x, c.h, c.z + back);
            this.camera.lookAt(c.x, 0, c.z - 0.4);
            // The sun follows the view so its shadow map always covers what is on screen.
            const s = this.sun, span = c.h * 1.3;
            s.position.set(c.x + 6, 18, c.z + 8); s.target.position.set(c.x, 0, c.z);
            const sc = s.shadow.camera;
            if (Math.abs(sc.right - span) > 0.5) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 1; sc.far = 60; sc.updateProjectionMatrix(); }
        }
    }

    HH_Game.radiusFor = radiusFor; HH_Game.xpFor = xpFor; HH_Game.lite = lite;
    window.HH_Game = HH_Game;
})();
