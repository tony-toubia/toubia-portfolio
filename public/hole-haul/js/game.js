// Hole Haul: the 3D board, the hole, and the swallowing physics.
//
//   const game = new HH_Game(container, hooks)
//   game.load(levelDef, { startLevel, speedMul })   build a level's board (HH_LEVELS.def)
//   game.start() / game.pause(bool) / game.attract(levelDef)   play it / pause / a slow orbit behind the map screen
//   game.setInput(x, y)                             steering at full speed, each in -1..1 (y is "up the screen"): keys, bots
//   game.drag(dx, dy)                               steering by finger: screen pixels moved since the last call; the hole
//                                                   moves as far across the field as the finger did, at once (capped)
//   game.useBooster('freeze' | 'magnet' | 'compass' | 'grow')   true when it took effect
//   game.addTime(seconds), game.project(x, y, z)   continue after time runs out / world → screen pixels
//   hooks: onTarget(kind, got, need), onAllTargets(), onXP(level, frac, grew), onTime(seconds, frozen),
//          onEat({ kind, x, z, target, coin }), onFail(), onBooster(name, seconds) — all optional
//
// The floor has a real hole in it: its shader discards fragments inside the hole's circle, and a dark pit below shows
// through. Items are rigid bodies (cannon-es, window.CANNON): the ground is a plane whose contacts inside the hole's
// circle are dropped, so an item loses support exactly where it overhangs the hole and tips over the rim; one wider
// than the hole bridges it until the hole grows. Items sleep until the hole comes near. The camera is locked to the
// hole: the hole stays in the middle of the screen and the field moves under it.
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

        /** Box half-extents and centre from the item's geometry (balls get a sphere), mass from its volume. */
        bodyFit(kind, geo) {
            if (!this.fitCache) this.fitCache = new Map();
            if (!this.fitCache.has(kind)) {
                if (!geo.boundingBox) geo.computeBoundingBox();
                const b = geo.boundingBox, C = window.CANNON;
                const hx = Math.max(0.03, (b.max.x - b.min.x) / 2 * 0.94), hy = Math.max(0.025, (b.max.y - b.min.y) / 2), hz = Math.max(0.03, (b.max.z - b.min.z) / 2 * 0.94);
                const ball = /ball/.test(kind) && Math.abs(hx - hy) < hy * 0.25;
                const shape = ball ? new C.Sphere(hy) : new C.Box(new C.Vec3(hx, hy, hz));
                this.fitCache.set(kind, { shape, hx, hy, hz, cx: (b.max.x + b.min.x) / 2, cy: (b.max.y + b.min.y) / 2, cz: (b.max.z + b.min.z) / 2, mass: Math.max(0.05, hx * hy * hz * 8 * (ball ? 0.35 : 0.7)) });
            }
            return this.fitCache.get(kind);
        }

        /**
         * The hole in the physics: after the narrowphase, drop every ground contact whose point lies inside the hole's
         * circle (with its friction), so an item is held up only by the part of it still over the floor.
         */
        filterHoleContacts(phys, ground) {
            const nar = phys.narrowphase, orig = nar.getContacts.bind(nar), gid = ground.id, game = this;
            const keep = (eq) => {
                const gi = eq.bi.id === gid, gj = eq.bj.id === gid;
                if (!gi && !gj) return true;
                const b = gi ? eq.bj : eq.bi, r = gi ? eq.rj : eq.ri;
                if (b.hhFalling) return false;   // committed to the hole: nothing on the floor holds it up any more
                const dx = b.position.x + r.x - game.hole.x, dz = b.position.z + r.z - game.hole.z, R = game.holeR;
                return dx * dx + dz * dz > R * R;
            };
            nar.getContacts = function (p1, p2, world, result, oldcontacts, fric, fricPool) {
                orig(p1, p2, world, result, oldcontacts, fric, fricPool);
                let w = 0;
                for (const eq of result) { if (keep(eq)) result[w++] = eq; else nar.contactPointPool.push(eq); }
                result.length = w; w = 0;
                for (const eq of fric) { if (keep(eq)) fric[w++] = eq; else fricPool.push(eq); }
                fric.length = w;
            };
        }

        /** Mesh pose from its body: the mesh's origin is the item's bottom centre, the body sits at its box centre. */
        syncMesh(it) {
            const b = it.body, q = b.quaternion, o = q.vmult(it.off);
            it.mesh.position.set(b.position.x - o.x, b.position.y - o.y, b.position.z - o.z);
            it.mesh.quaternion.set(q.x, q.y, q.z, q.w);
            it.x = it.mesh.position.x; it.z = it.mesh.position.z;
        }

        drag(dx, dy) {
            // Screen pixels → field units at the hole: the visible height of the ground over the screen's height.
            const c = this.cam; if (!c) return;
            const dist = Math.hypot(c.h, c.h * 0.78), el = this.renderer.domElement;
            const upp = 2 * dist * Math.tan(T.MathUtils.degToRad(this.camera.fov / 2)) / (el.clientHeight || 1);
            this.dragAcc.x += dx * upp * 1.15; this.dragAcc.z += dy * upp * 1.15 * 1.25;   // depth is foreshortened on screen
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
            this.world = null; this.phys = null;
        }

        load(def, { startLevel = 1, speedMul = 1 } = {}) {
            this.clearWorld();
            const theme = window.HH_LEVELS.themes[def.theme];
            const group = new T.Group();
            this.scene.background = new T.Color(theme.sky).convertSRGBToLinear();
            this.scene.fog = new T.Fog(new T.Color(theme.fog).convertSRGBToLinear(), 30, 90);

            // The floor, with the hole cut out by its shader.
            const ft = floorTexture(theme);
            const tex = ft.tex.clone(); tex.needsUpdate = true; tex.repeat.set(def.w / ft.tile, def.d / ft.tile);
            const floorMat = new T.MeshStandardMaterial({ map: tex, roughness: 0.92 });
            this.cutHole(floorMat);
            const floor = new T.Mesh(new T.PlaneGeometry(def.w, def.d, 1, 1), floorMat);
            floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.own = true;
            group.add(floor);
            // The ground around the board and a low rim.
            // Past the board's edge (the locked camera shows it near the rim): a darker shade of the board's own colour.
            const groundMat = this.cutHole(new T.MeshStandardMaterial({ color: new T.Color(theme.a).convertSRGBToLinear().multiplyScalar(0.55), roughness: 1 }));
            const ground = new T.Mesh(new T.PlaneGeometry(400, 400), groundMat);
            ground.rotation.x = -Math.PI / 2; ground.position.y = -0.45; ground.receiveShadow = true; ground.userData.own = true; group.add(ground);
            const rimMat = new T.MeshStandardMaterial({ color: new T.Color(theme.rim).convertSRGBToLinear(), roughness: 0.7 });
            const t = 0.5, hgt = 0.9;
            for (const [w, d, x, z] of [[def.w + t * 2, t, 0, -def.d / 2 - t / 2], [def.w + t * 2, t, 0, def.d / 2 + t / 2], [t, def.d, -def.w / 2 - t / 2, 0], [t, def.d, def.w / 2 + t / 2, 0]]) {
                const m = new T.Mesh(new T.BoxGeometry(w, hgt, d), rimMat); m.position.set(x, hgt / 2 - 0.45, z); m.castShadow = m.receiveShadow = true; m.userData.own = true; group.add(m);
            }

            // Physics: a ground plane with the hole filtered out of its contacts, and walls along the rim.
            const C = window.CANNON;
            const phys = this.phys = new C.World({ gravity: new C.Vec3(0, -24, 0), allowSleep: true });
            phys.broadphase = new C.SAPBroadphase(phys);
            phys.solver.iterations = lite ? 6 : 8;
            phys.defaultContactMaterial.friction = 0.45; phys.defaultContactMaterial.restitution = 0.04;
            const floorBody = new C.Body({ type: C.Body.STATIC, shape: new C.Plane() });
            floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); phys.addBody(floorBody);
            for (const [w, d, x, z] of [[def.w + 2, 1, 0, -def.d / 2 - 0.5], [def.w + 2, 1, 0, def.d / 2 + 0.5], [1, def.d, -def.w / 2 - 0.5, 0], [1, def.d, def.w / 2 + 0.5, 0]]) {
                const wall = new C.Body({ type: C.Body.STATIC, shape: new C.Box(new C.Vec3(w / 2, 2, d / 2)) }); wall.position.set(x, 2, z); phys.addBody(wall);
            }
            this.filterHoleContacts(phys, floorBody);

            // Items: a mesh each, and a box body fitted to its geometry (a sphere for balls).
            const items = [];
            const K = window.HH_MODELS.kinds;
            for (const it of def.items) {
                const k = K[it.kind]; if (!k) continue;
                const geo = this.geometryFor(it.kind);
                const mesh = new T.Mesh(geo, it.kind === 'coin' ? this.coinMat : this.itemMat);
                mesh.castShadow = !lite || k.r > 0.3; mesh.receiveShadow = true;
                group.add(mesh);
                const fit = this.bodyFit(it.kind, geo);
                const body = new C.Body({ mass: fit.mass, shape: fit.shape, allowSleep: true, sleepSpeedLimit: 0.12, sleepTimeLimit: 0.35, linearDamping: 0.05, angularDamping: 0.12 });
                body.quaternion.setFromEuler(0, it.rot, 0);
                const off = new C.Vec3(fit.cx, fit.cy, fit.cz), wo = body.quaternion.vmult(off);
                body.position.set(it.x + wo.x, wo.y + 0.002, it.z + wo.z);
                phys.addBody(body); body.sleep();
                const item = { mesh, body, off, kind: it.kind, r: k.r, h: k.h, xp: k.xp || 1, x: it.x, z: it.z, rot: it.rot, alive: true, coin: it.kind === 'coin', reach: Math.hypot(fit.hx, fit.hz) };
                this.syncMesh(item);
                items.push(item);
            }
            this.scene.add(group);

            const need = {}, got = {};
            for (const t2 of def.targets) { need[t2.kind] = t2.count; got[t2.kind] = 0; }
            this.world = { def, group, items, need, got, w: def.w, d: def.d };
            this.level = startLevel; this.xp = 0;
            this.holeR = radiusFor(startLevel); this.holeTargetR = this.holeR;
            this.hole = { x: 0, z: def.d * 0.22, vx: 0, vz: 0 };
            this.dragAcc = { x: 0, z: 0 };
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
                if (!it.alive || !(it.kind in this.world.need) || this.world.got[it.kind] >= this.world.need[it.kind]) continue;
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
            if ((playing || this.mode === 'won') && this.phys) this.physics(dt);
            // The hole eases to its new size after growing.
            if (Math.abs(this.holeTargetR - this.holeR) > 0.001) this.holeR += (this.holeTargetR - this.holeR) * Math.min(1, dt * 5);
            this.syncHole();
            this.updateCamera(dt);
            if (this.compass > 0) {
                const t = performance.now() / 1000;
                for (const m of this.markers) { const it = m.userData.item; m.visible = it.alive; m.position.set(it.x, it.h + 0.5 + Math.sin(t * 5 + m.userData.phase) * 0.15, it.z); }
            }
            this.renderer.render(this.scene, this.camera);
        }

        attractFrame(dt) {
            this.cam.orbit += dt * 0.12;
            this.hole.x = Math.sin(this.cam.orbit) * this.world.w * 0.25; this.hole.z = Math.cos(this.cam.orbit * 0.7) * this.world.d * 0.25;
        }

        moveHole(dt) {
            // No easing: keys and bots move the hole at full speed straight away; a finger drag moves it as far as the
            // finger went across the field, capped at a top speed, and anything past the cap is dropped (never queued),
            // so the hole never lags behind or overshoots the finger.
            const sp = (2.6 + this.holeR * 0.8) * this.speedMul;
            const h = this.hole;
            h.x += this.input.x * sp * dt; h.z += -this.input.y * sp * dt;
            const a = this.dragAcc, len = Math.hypot(a.x, a.z);
            if (len > 0) { const cap = sp * 3 * dt, k = Math.min(1, cap / len); h.x += a.x * k; h.z += a.z * k; a.x = 0; a.z = 0; }
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
            const magnet = this.magnet > 0;
            for (const it of W.items) {
                if (!it.alive) continue;
                const b = it.body;
                const dx = b.position.x - hx, dz = b.position.z - hz, d = Math.hypot(dx, dz) || 1e-4;
                // Wake whatever the hole reaches (and wanted items for the magnet).
                const wanted = magnet && it.kind in W.need && W.got[it.kind] < W.need[it.kind] && it.r < R * 0.96;
                if (b.sleepState === 2 && (d < R + it.reach + 0.25 || (wanted && d < R + 5))) b.wakeUp();
                if (b.sleepState === 2) continue;
                if (wanted && d < R + 5 && b.position.y > -0.2) { const s = Math.min(4.5, d * 3); b.velocity.x = -dx / d * s; b.velocity.z = -dz / d * s; }
                // An item whose footprint fits commits to the hole once its middle is over it: the floor stops holding it
                // (so a tall, thin lamp post drops in instead of toppling across the hole) and it is drawn down the middle.
                // Items that only overhang keep the real tipping; items too big for the hole bridge it.
                if (!b.hhFalling && it.r < R * 0.96 && d < R - it.r * 0.25) b.hhFalling = true;
                if (b.hhFalling || (b.position.y < it.off.y * 0.6 && d < R + it.reach)) {
                    const k = Math.min(1, dt * (b.hhFalling ? 8 : 4));
                    b.velocity.x += (-dx * 6 - b.velocity.x) * k; b.velocity.z += (-dz * 6 - b.velocity.z) * k;
                    if (b.hhFalling && b.velocity.y > -2) b.velocity.y -= 30 * dt;
                }
            }
            this.phys.step(1 / 60, dt, 4);
            for (const it of W.items) {
                if (!it.alive || it.body.sleepState === 2) continue;
                this.syncMesh(it);
                if (it.body.position.y < -(it.h + 0.8 + R * 0.4)) this.eat(it);
            }
        }

        eat(it) {
            const W = this.world;
            it.alive = false; it.mesh.visible = false; W.group.remove(it.mesh); this.phys.removeBody(it.body);
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
            // Locked to the hole while playing: it stays in the middle of the screen and the field moves under it.
            if (this.mode === 'attract') { c.x += (h.x - c.x) * k; c.z += (h.z - c.z) * k; } else { c.x = h.x; c.z = h.z; }
            const back = c.h * 0.78;
            this.camera.position.set(c.x, c.h, c.z + back);
            this.camera.lookAt(c.x, 0, c.z);
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
