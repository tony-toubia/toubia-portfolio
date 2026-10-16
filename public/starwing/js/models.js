// Starwing 64: Low-poly 3D models with custom Fresnel rim/specular shaders and baked Vertex Ambient Occlusion.
(function () {
    'use strict';
    const SW = window.SW = window.SW || {};

    function lin(hex) {
        const c = new THREE.Color(hex);
        if (c.convertSRGBToLinear) c.convertSRGBToLinear();
        return c;
    }

    const MAT_BODY = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.46,
        metalness: 0.28,
        flatShading: true,
        vertexColors: true,
    });
    MAT_BODY.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNorm;')
            .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvWorldNorm = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNorm;')
            .replace('#include <dithering_fragment>', [
                'vec3 viewDir = normalize(cameraPosition - vWorldPos);',
                'vec3 wNorm = normalize(vWorldNorm);',
                'float ndv = clamp(dot(wNorm, viewDir), 0.0, 1.0);',
                'vec3 sunDir = normalize(vec3(0.45, 0.78, 0.42));',
                'float sunFace = smoothstep(-0.2, 0.65, dot(wNorm, sunDir));',
                'float rim = pow(1.0 - ndv, 3.0) * (0.35 + 0.65 * sunFace);',
                'vec3 H = normalize(sunDir + viewDir);',
                'float spec = smoothstep(0.86, 0.94, max(0.0, dot(wNorm, H))) * 0.22;',
                'gl_FragColor.rgb += vec3(0.55, 0.78, 1.0) * rim * 0.28 + vec3(1.0, 0.97, 0.9) * spec;',
                '#include <dithering_fragment>',
            ].join('\n'));
    };

    const MAT_GLOW = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        toneMapped: false,
    });
    MAT_GLOW.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNorm;')
            .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvWorldNorm = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNorm;')
            .replace('#include <dithering_fragment>', [
                'vec3 viewDir = normalize(cameraPosition - vWorldPos);',
                'float core = pow(clamp(dot(normalize(vWorldNorm), viewDir), 0.0, 1.0), 1.4);',
                'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 1.0, 1.0), core * 0.42) * 1.25;',
                '#include <dithering_fragment>',
            ].join('\n'));
    };

    const MAT_SHIELD = new THREE.MeshBasicMaterial({
        color: 0x62e8ff,
        transparent: true,
        opacity: 0.34,
        wireframe: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });

    function bakePartGeo(geo, hex, isGlow) {
        const g = geo.index ? geo.toNonIndexed() : geo.clone();
        g.computeVertexNormals();
        const pos = g.attributes.position;
        const nrm = g.attributes.normal;
        const n = pos.count;
        let minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < n; i++) {
            const y = pos.getY(i);
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        const spanY = Math.max(0.05, maxY - minY);
        const base = lin(hex);
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const y = pos.getY(i), ny = nrm ? nrm.getY(i) : 0.5;
            const yf = (y - minY) / spanY;
            let shade;
            if (isGlow) {
                shade = 0.88 + 0.25 * yf + Math.max(0, ny) * 0.14;
            } else {
                const top = 0.82 + 0.22 * clamp(ny * 0.5 + 0.5, 0, 1);
                const bounce = 0.86 + 0.18 * yf;
                shade = top * bounce;
            }
            col[i * 3]     = Math.min(1.5, base.r * shade);
            col[i * 3 + 1] = Math.min(1.5, base.g * shade);
            col[i * 3 + 2] = Math.min(1.5, base.b * shade);
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const m = new THREE.Mesh(g, isGlow ? MAT_GLOW : MAT_BODY);
        m.castShadow = !isGlow;
        m.receiveShadow = false;
        return m;
    }

    function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

    function box(w, h, d, hex, glow) {
        return bakePartGeo(new THREE.BoxGeometry(w, h, d), hex, glow);
    }
    function cone(r, h, segs, hex, glow) {
        return bakePartGeo(new THREE.ConeGeometry(r, h, segs || 5), hex, glow);
    }
    function cyl(rt, rb, h, segs, hex, glow) {
        return bakePartGeo(new THREE.CylinderGeometry(rt, rb, h, segs || 6), hex, glow);
    }
    function oct(r, detail, hex, glow) {
        return bakePartGeo(new THREE.OctahedronGeometry(r, detail || 0), hex, glow);
    }
    function ico(r, detail, hex, glow) {
        return bakePartGeo(new THREE.IcosahedronGeometry(r, detail || 0), hex, glow);
    }

    // ------------------------------------------------------------------ 1. Arwing (Player & Wingmen)
    function arwing(trimHex) {
        const trim = trimHex || 0x2668e8; // Classic G-Diffuser royal blue
        const hull = 0xe8edf5;
        const dark = 0x2a3242;
        const root = new THREE.Group();

        // Central nose cone pointing along -Z
        const nose = cone(0.42, 2.3, 4, hull);
        nose.rotation.x = -Math.PI / 2;
        nose.rotation.z = Math.PI / 4;
        nose.position.set(0, -0.02, -1.15);
        root.add(nose);

        // Rear fuselage body
        const rear = box(0.82, 0.44, 1.35, hull);
        rear.position.set(0, 0.02, 0.25);
        root.add(rear);

        // Dark Armored Cockpit Canopy
        const canopy = cone(0.32, 1.15, 4, 0x18263a);
        canopy.rotation.x = -Math.PI / 2;
        canopy.rotation.z = Math.PI / 4;
        canopy.scale.set(0.85, 1, 0.62);
        canopy.position.set(0, 0.24, -0.35);
        root.add(canopy);

        const visor = box(0.36, 0.12, 0.48, 0x45e6ff, true);
        visor.position.set(0, 0.24, -0.58);
        visor.rotation.x = 0.22;
        root.add(visor);

        // Dorsal Fin
        const dorsal = cone(0.18, 0.85, 4, trim);
        dorsal.rotation.x = -Math.PI * 0.35;
        dorsal.scale.set(0.45, 1, 1);
        dorsal.position.set(0, 0.42, 0.55);
        root.add(dorsal);

        // Left & Right G-Diffuser Pylons (always stay attached)
        for (const s of [-1, 1]) {
            const gBlock = box(0.38, 0.34, 1.35, trim);
            gBlock.position.set(s * 0.62, -0.02, 0.15);
            root.add(gBlock);

            const intake = box(0.28, 0.18, 0.25, 0x3ef2ff, true);
            intake.position.set(s * 0.62, -0.02, -0.52);
            root.add(intake);

            const fin = cone(0.2, 0.95, 4, trim);
            fin.rotation.x = -Math.PI * 0.42;
            fin.scale.set(0.38, 1, 1);
            fin.position.set(s * 0.62, 0.28, 0.42);
            root.add(fin);
        }

        // Left & Right Breakable Swept Wings
        const makeWing = (s) => {
            const wg = new THREE.Group();
            wg.position.set(s * 0.78, -0.04, 0.18);
            const blade = cone(0.48, 1.85, 4, hull);
            blade.rotation.z = -s * Math.PI * 0.46;
            blade.rotation.y = -s * 0.25;
            blade.scale.set(0.22, 1, 0.85);
            blade.position.set(s * 0.75, -0.04, 0.12);
            wg.add(blade);

            const tip = cone(0.14, 0.9, 4, trim);
            tip.rotation.x = -Math.PI / 2;
            tip.position.set(s * 1.52, -0.08, -0.05);
            wg.add(tip);

            const gun = cyl(0.045, 0.055, 0.65, 5, dark);
            gun.rotation.x = Math.PI / 2;
            gun.position.set(s * 0.45, -0.1, -0.55);
            wg.add(gun);
            return wg;
        };
        const wingL = makeWing(-1); wingL.name = 'wingL';
        const wingR = makeWing(1);  wingR.name = 'wingR';
        root.add(wingL, wingR);

        // Plasma Thruster Nozzle & Inner Flame Core
        const nozzle = cyl(0.22, 0.32, 0.35, 6, dark);
        nozzle.rotation.x = Math.PI / 2;
        nozzle.position.set(0, 0.02, 0.98);
        root.add(nozzle);

        const thruster = new THREE.Group();
        thruster.name = 'thruster';
        thruster.position.set(0, 0.02, 1.15);
        const outerFlame = cone(0.28, 1.1, 6, 0xff7a28, true);
        outerFlame.rotation.x = Math.PI / 2;
        outerFlame.position.z = 0.45;
        const innerFlame = cone(0.16, 0.75, 6, 0xffffff, true);
        innerFlame.rotation.x = Math.PI / 2;
        innerFlame.position.z = 0.32;
        thruster.add(outerFlame, innerFlame);
        root.add(thruster);

        // Barrel Roll Deflector Cylinder (visible during barrel roll)
        const shieldGeo = new THREE.CylinderGeometry(1.95, 1.95, 3.2, 8, 1, true);
        shieldGeo.rotateX(Math.PI / 2);
        const barrelShield = new THREE.Mesh(shieldGeo, MAT_SHIELD);
        barrelShield.name = 'barrelShield';
        barrelShield.visible = false;
        root.add(barrelShield);

        root.userData = { wingL, wingR, thruster, barrelShield };
        return root;
    }

    // ------------------------------------------------------------------ 2. Star Wolf Rival Fighter
    function wolfFighter() {
        const root = new THREE.Group();
        const nose = cone(0.45, 2.2, 4, 0x323846);
        nose.rotation.x = -Math.PI / 2;
        nose.rotation.z = Math.PI / 4;
        nose.position.set(0, 0, -0.9);
        root.add(nose);

        const canopy = box(0.42, 0.25, 0.75, 0xff2e4c, true);
        canopy.position.set(0, 0.2, -0.2);
        root.add(canopy);

        // 4 X-Wing style claw wings
        for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
                const w = box(1.35, 0.09, 0.55, sx * sy > 0 ? 0x9a1c2b : 0x454d5e);
                w.position.set(sx * 0.75, sy * 0.32, 0.2);
                w.rotation.z = sx * sy * 0.42;
                root.add(w);
            }
        }
        const thr = cone(0.28, 0.9, 6, 0xff3860, true);
        thr.rotation.x = Math.PI / 2;
        thr.position.set(0, 0, 1.1);
        root.add(thr);
        return root;
    }

    // ------------------------------------------------------------------ 3. Granga Enemy Interceptor
    function enemyFighter(variant) {
        const root = new THREE.Group();
        const hullCol = variant === 'gold' ? 0xf5b82e : variant === 'ace' ? 0xd92b4b : 0x586274;
        const glowCol = variant === 'gold' ? 0xfff078 : 0xff4528;

        const body = oct(0.65, 0, hullCol);
        body.scale.set(1.1, 0.65, 1.8);
        root.add(body);

        const cockpit = oct(0.32, 0, glowCol, true);
        cockpit.position.set(0, 0.18, -0.25);
        root.add(cockpit);

        for (const s of [-1, 1]) {
            const wing = cone(0.45, 1.4, 4, hullCol);
            wing.rotation.z = -s * Math.PI * 0.45;
            wing.scale.set(0.25, 1, 0.9);
            wing.position.set(s * 0.85, -0.05, 0.1);
            root.add(wing);

            const pod = box(0.2, 0.22, 0.85, 0x262b34);
            pod.position.set(s * 1.35, -0.08, 0.05);
            root.add(pod);
        }

        const engine = cone(0.24, 0.7, 5, glowCol, true);
        engine.rotation.x = Math.PI / 2;
        engine.position.set(0, 0, 0.95);
        root.add(engine);
        return root;
    }

    // ------------------------------------------------------------------ 4. Stealth Striker
    function stealthFighter() {
        const root = new THREE.Group();
        const center = cone(0.55, 2.0, 3, 0x3b2854);
        center.rotation.x = -Math.PI / 2;
        root.add(center);

        for (const s of [-1, 1]) {
            const boom = box(0.24, 0.28, 2.1, 0x563a7a);
            boom.position.set(s * 0.85, 0, 0.1);
            root.add(boom);

            const blade = box(0.75, 0.08, 0.65, 0x2a1b40);
            blade.position.set(s * 0.45, 0, 0.15);
            root.add(blade);

            const eye = box(0.18, 0.12, 0.22, 0x45f2ff, true);
            eye.position.set(s * 0.85, 0.05, -0.92);
            root.add(eye);
        }
        return root;
    }

    // ------------------------------------------------------------------ 5. Goliath Ground Mech Walker
    function mechWalker() {
        const root = new THREE.Group();
        const head = box(1.8, 1.25, 1.9, 0x626c7c);
        head.position.y = 2.4;
        root.add(head);

        const visor = box(1.35, 0.36, 0.2, 0xff3b28, true);
        visor.position.set(0, 2.5, 0.92);
        root.add(visor);

        const cannonL = cyl(0.16, 0.16, 1.2, 6, 0x2c323d);
        cannonL.rotation.x = Math.PI / 2;
        cannonL.position.set(-0.95, 2.35, 0.65);
        const cannonR = cannonL.clone();
        cannonR.position.x = 0.95;
        root.add(cannonL, cannonR);

        const makeLeg = (s) => {
            const lg = new THREE.Group();
            lg.position.set(s * 0.72, 1.85, 0);
            const thigh = box(0.38, 1.1, 0.45, 0x454d59);
            thigh.position.y = -0.45;
            const shin = box(0.34, 1.05, 0.4, 0x7b8596);
            shin.position.set(0, -1.3, 0.12);
            const foot = box(0.58, 0.25, 0.85, 0x2c323d);
            foot.position.set(0, -1.75, 0.22);
            lg.add(thigh, shin, foot);
            return lg;
        };
        const legL = makeLeg(-1); legL.name = 'legL';
        const legR = makeLeg(1);  legR.name = 'legR';
        root.add(legL, legR);
        root.userData = { legL, legR };
        return root;
    }

    // ------------------------------------------------------------------ 6. Surface Plasma Turret
    function turret() {
        const root = new THREE.Group();
        const base = cyl(0.9, 1.3, 0.8, 6, 0x464e5c);
        base.position.y = 0.4;
        root.add(base);

        const head = new THREE.Group();
        head.name = 'head';
        head.position.y = 1.0;
        const dome = oct(0.75, 0, 0x6f7b8e);
        dome.scale.set(1, 0.75, 1.1);
        const core = box(0.45, 0.32, 0.3, 0xff5a28, true);
        core.position.set(0, 0.05, 0.62);
        const barrelL = cyl(0.1, 0.12, 1.1, 5, 0x252a34);
        barrelL.rotation.x = Math.PI / 2;
        barrelL.position.set(-0.35, 0.05, 0.75);
        const barrelR = barrelL.clone();
        barrelR.position.x = 0.35;
        head.add(dome, core, barrelL, barrelR);
        root.add(head);
        root.userData = { head };
        return root;
    }

    // ------------------------------------------------------------------ 7. Craggy Asteroid
    function asteroid(radius, seed) {
        const r = radius || 2.2;
        const geo = new THREE.IcosahedronGeometry(r, 1);
        const pos = geo.attributes.position;
        let s = (seed || 101) | 0;
        const rand = () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) / 4294967296); };
        const verts = new Map();
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
            const key = vx.toFixed(2) + ',' + vy.toFixed(2) + ',' + vz.toFixed(2);
            let k = verts.get(key);
            if (k == null) {
                k = 0.74 + rand() * 0.46;
                verts.set(key, k);
            }
            pos.setXYZ(i, vx * k, vy * k * 0.88, vz * k);
        }
        return bakePartGeo(geo, (seed & 1) ? 0x685a50 : 0x545d6a, false);
    }

    // ------------------------------------------------------------------ 8. Corneria Stone Arch / Bridge / Trench Gate
    function archway(theme) {
        const root = new THREE.Group();
        const col = theme === 'venom' ? 0x3b2e4a : 0x8d99a8;
        const trim = theme === 'venom' ? 0xff3b6b : 0x38d6ff;
        const w = 13.0, h = 7.5;
        const pillarL = box(2.2, h, 2.4, col);
        pillarL.position.set(-w / 2, h / 2, 0);
        const pillarR = box(2.2, h, 2.4, col);
        pillarR.position.set(w / 2, h / 2, 0);
        const lintel = box(w + 3.2, 2.0, 2.8, col);
        lintel.position.set(0, h + 0.8, 0);
        const strip = box(w - 1.5, 0.32, 2.9, trim, true);
        strip.position.set(0, h - 0.1, 0);
        root.add(pillarL, pillarR, lintel, strip);
        return root;
    }

    // ------------------------------------------------------------------ 9. Supply / Gold / Warp Ring & Pickups
    function ring(kind) {
        const root = new THREE.Group();
        const col = kind === 'gold' ? 0xffd238 : kind === 'warp' ? 0x45f2ff : 0xc8d8ec;
        const segs = 8, R = kind === 'warp' ? 3.2 : 2.35;
        for (let i = 0; i < segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            const seg = box(0.38, R * 0.72, 0.42, col, kind === 'gold' || kind === 'warp');
            seg.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
            seg.rotation.z = a;
            root.add(seg);
        }
        return root;
    }

    function pickup(kind) {
        const root = new THREE.Group();
        const col = kind === 'laser' ? 0x38d6ff : kind === 'bomb' ? 0xff4538 : 0x52ff8a;
        const core = oct(0.85, 0, col, true);
        const frame = oct(1.15, 0, 0xe8f0fa, false);
        frame.scale.set(1, 0.45, 1);
        root.add(core, frame);
        return root;
    }

    // ------------------------------------------------------------------ 10. Boss 1: Attack Carrier GORGON (Corneria)
    function bossGorgon() {
        const root = new THREE.Group();
        // Massive flying cruiser hull
        const hull = box(11.5, 2.8, 7.5, 0x4a5568);
        root.add(hull);

        const deck = box(7.5, 1.6, 5.2, 0x64728a);
        deck.position.set(0, 1.9, -0.4);
        root.add(deck);

        // Swept armored prows
        for (const s of [-1, 1]) {
            const wing = box(5.5, 1.4, 5.5, 0x384152);
            wing.position.set(s * 7.2, -0.2, 0.5);
            wing.rotation.y = s * 0.22;
            root.add(wing);

            const bay = box(2.4, 1.5, 1.2, 0xff7a28, true);
            bay.position.set(s * 4.2, -0.3, 3.4);
            bay.name = s < 0 ? 'bayL' : 'bayR';
            root.add(bay);
        }

        // Central weak-point Plasma Core (opens when bays are damaged or during attack cycle)
        const core = oct(1.85, 1, 0x3ef2ff, true);
        core.position.set(0, 0.1, 3.6);
        core.name = 'core';
        root.add(core);

        root.userData = { core };
        return root;
    }

    // ------------------------------------------------------------------ 11. Boss 2: Asteroid Crusher METORA (Meteo)
    function bossMetora() {
        const root = new THREE.Group();
        const body = cyl(3.8, 3.8, 6.5, 8, 0x4e425e);
        body.rotation.x = Math.PI / 2;
        root.add(body);

        const ringOuter = new THREE.Group();
        ringOuter.name = 'ringOuter';
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const blade = box(1.6, 2.8, 1.2, 0x8a75a6);
            blade.position.set(Math.cos(a) * 5.6, Math.sin(a) * 5.6, 0);
            blade.rotation.z = a;
            ringOuter.add(blade);
        }
        root.add(ringOuter);

        const core = oct(2.1, 1, 0xff3b8d, true);
        core.position.set(0, 0, 3.4);
        core.name = 'core';
        root.add(core);

        root.userData = { core, ringOuter };
        return root;
    }

    // ------------------------------------------------------------------ 12. Boss 3: Bio-Brain ANDRON (Venom)
    function bossAndron() {
        const root = new THREE.Group();
        // Giant polygonal face mask
        const head = new THREE.Group();
        head.name = 'head';
        const cranium = ico(4.2, 0, 0x8c96a8);
        cranium.scale.set(0.95, 1.22, 0.85);
        head.add(cranium);

        for (const s of [-1, 1]) {
            const eye = oct(0.85, 0, 0xff2845, true);
            eye.scale.set(1.4, 0.7, 0.6);
            eye.position.set(s * 1.55, 0.65, 3.15);
            head.add(eye);
        }

        const jaw = box(3.4, 1.4, 2.6, 0x6c7688);
        jaw.position.set(0, -2.4, 1.6);
        jaw.name = 'jaw';
        head.add(jaw);

        const brainCore = oct(1.75, 1, 0x52ffcb, true);
        brainCore.position.set(0, 0.4, 2.6);
        brainCore.name = 'core';
        head.add(brainCore);
        root.add(head);

        // Left & Right Floating Cybernetic Hands
        const makeHand = (s) => {
            const hg = new THREE.Group();
            hg.position.set(s * 7.5, -1.2, 2.5);
            const palm = box(2.4, 2.6, 0.9, 0x9aa4b8);
            const palmCore = oct(0.75, 0, 0xff9a28, true);
            palmCore.position.z = 0.55;
            hg.add(palm, palmCore);
            for (let f = -1.5; f <= 1.5; f += 1) {
                const finger = box(0.42, 1.35, 0.45, 0x747e92);
                finger.position.set(f * 0.55, 1.85, 0.15);
                hg.add(finger);
            }
            return hg;
        };
        const handL = makeHand(-1); handL.name = 'handL';
        const handR = makeHand(1);  handR.name = 'handR';
        root.add(handL, handR);

        root.userData = { head, jaw, core: brainCore, handL, handR };
        return root;
    }

    SW.Models = {
        arwing,
        wolfFighter,
        enemyFighter,
        stealthFighter,
        mechWalker,
        turret,
        asteroid,
        archway,
        ring,
        pickup,
        bossGorgon,
        bossMetora,
        bossAndron,
        MAT_BODY,
        MAT_GLOW,
    };
})();
