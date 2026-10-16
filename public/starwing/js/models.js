// Starwing: Modern High-Detail 3D Spacecraft, Mechs, Architecture & Boss Models
// with Procedural Equirectangular Environment Reflections, Hull Panel Bump Maps & PBR Materials.
(function () {
    'use strict';
    const SW = window.SW = window.SW || {};
    const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

    function lin(hex) {
        const c = new THREE.Color(hex);
        if (c.convertSRGBToLinear) c.convertSRGBToLinear();
        return c;
    }

    // 1. Procedural Equirectangular Sky/Ground Reflection Map so metallic hulls gleam realistically
    function createEnvMap() {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 128;
        const g = c.getContext('2d');
        const grd = g.createLinearGradient(0, 0, 0, 128);
        grd.addColorStop(0.0, '#0a2458');
        grd.addColorStop(0.38, '#3888e2');
        grd.addColorStop(0.49, '#d8f4ff');
        grd.addColorStop(0.52, '#ffffff');
        grd.addColorStop(0.56, '#1c4d78');
        grd.addColorStop(1.0, '#09182b');
        g.fillStyle = grd;
        g.fillRect(0, 0, 256, 128);

        // Bright sun specular hotspot in reflection map
        const sun = g.createRadialGradient(190, 52, 2, 190, 52, 36);
        sun.addColorStop(0, 'rgba(255, 255, 240, 1.0)');
        sun.addColorStop(0.3, 'rgba(255, 230, 170, 0.7)');
        sun.addColorStop(1, 'rgba(255, 200, 120, 0.0)');
        g.fillStyle = sun;
        g.fillRect(0, 0, 256, 128);

        const tex = new THREE.CanvasTexture(c);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        return tex;
    }

    // 2. Procedural Sci-Fi Hull Panel-Line & Micro-Detail Bump Texture
    function createPanelBumpMap() {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const g = c.getContext('2d');
        g.fillStyle = '#808080';
        g.fillRect(0, 0, 256, 256);

        // Subtle panel plates
        const plates = [
            [8, 8, 112, 72], [128, 8, 120, 72],
            [8, 88, 76, 80], [92, 88, 156, 80],
            [8, 176, 140, 72], [156, 176, 92, 72],
        ];
        for (const [x, y, w, h] of plates) {
            g.fillStyle = '#8a8a8a';
            g.fillRect(x, y, w, h);
            g.strokeStyle = '#383838';
            g.lineWidth = 2;
            g.strokeRect(x, y, w, h);
            g.strokeStyle = '#a8a8a8';
            g.lineWidth = 1;
            g.strokeRect(x + 2, y + 2, w - 4, h - 4);
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 2);
        return tex;
    }

    const ENV_MAP = createEnvMap();
    const PANEL_BUMP = createPanelBumpMap();

    // Smooth-shaded modern PBR aero-hull material with panel bump, reflections, and Fresnel rim
    const MAT_BODY = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.24,
        metalness: 0.58,
        envMap: ENV_MAP,
        envMapIntensity: 1.25,
        bumpMap: PANEL_BUMP,
        bumpScale: 0.015,
        flatShading: false,
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
                'vec3 sunDir = normalize(vec3(0.42, 0.80, 0.44));',
                'float sunFace = smoothstep(-0.2, 0.75, dot(wNorm, sunDir));',
                'float rim = pow(1.0 - ndv, 3.0) * (0.35 + 0.65 * sunFace);',
                'vec3 H = normalize(sunDir + viewDir);',
                'float spec = pow(max(0.0, dot(wNorm, H)), 48.0) * 0.65;',
                'gl_FragColor.rgb += vec3(0.48, 0.82, 1.0) * rim * 0.42 + vec3(1.0, 0.98, 0.92) * spec;',
                '#include <dithering_fragment>',
            ].join('\n'));
    };

    // High-gloss curved cockpit glass canopy
    const MAT_GLASS = new THREE.MeshStandardMaterial({
        color: 0x091c36,
        emissive: 0x061932,
        roughness: 0.04,
        metalness: 0.92,
        envMap: ENV_MAP,
        envMapIntensity: 1.8,
        transparent: true,
        opacity: 0.86,
        flatShading: false,
    });
    MAT_GLASS.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNorm;')
            .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvWorldNorm = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNorm;')
            .replace('#include <dithering_fragment>', [
                'vec3 viewDir = normalize(cameraPosition - vWorldPos);',
                'vec3 wNorm = normalize(vWorldNorm);',
                'float fres = pow(1.0 - clamp(dot(wNorm, viewDir), 0.0, 1.0), 2.4);',
                'vec3 H = normalize(normalize(vec3(0.4, 0.85, 0.4)) + viewDir);',
                'float glare = smoothstep(0.92, 0.99, max(0.0, dot(wNorm, H)));',
                'gl_FragColor.rgb += vec3(0.32, 0.88, 1.0) * fres * 0.75 + vec3(1.0) * glare * 1.1;',
                '#include <dithering_fragment>',
            ].join('\n'));
    };

    // Unlit HDR plasma glow material with white-hot core
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
                'float core = pow(clamp(dot(normalize(vWorldNorm), viewDir), 0.0, 1.0), 1.25);',
                'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 1.0, 1.0), core * 0.58) * 1.45;',
                '#include <dithering_fragment>',
            ].join('\n'));
    };

    const MAT_SHIELD = new THREE.MeshBasicMaterial({
        color: 0x52f2ff,
        transparent: true,
        opacity: 0.36,
        wireframe: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });

    function bakePartGeo(geo, hex, isGlow, flat) {
        const g = flat ? (geo.index ? geo.toNonIndexed() : geo.clone()) : geo.clone();
        g.computeVertexNormals();
        const pos = g.attributes.position;
        const nrm = g.attributes.normal;
        const n = pos.count;
        let minY = Infinity, maxY = -Infinity, maxR = 0.01;
        for (let i = 0; i < n; i++) {
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            const r = Math.hypot(x, z);
            if (r > maxR) maxR = r;
        }
        const spanY = Math.max(0.05, maxY - minY);
        const base = lin(hex);
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            const ny = nrm ? nrm.getY(i) : 0.5;
            const yf = (y - minY) / spanY;
            let shade;
            if (isGlow) {
                shade = 0.94 + 0.28 * yf + Math.max(0, ny) * 0.16;
            } else {
                const skyTerm = 0.80 + 0.24 * clamp(ny * 0.5 + 0.5, 0, 1);
                const ao = 0.84 + 0.18 * yf + 0.05 * clamp(Math.hypot(x, z) / maxR, 0, 1);
                shade = skyTerm * ao;
            }
            col[i * 3]     = Math.min(1.6, base.r * shade);
            col[i * 3 + 1] = Math.min(1.6, base.g * shade);
            col[i * 3 + 2] = Math.min(1.6, base.b * shade);
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const m = new THREE.Mesh(g, isGlow ? MAT_GLOW : MAT_BODY);
        m.castShadow = !isGlow;
        m.receiveShadow = false;
        return m;
    }

    // Build smooth extruded 3D airfoil wing / fin from 2D polygon points
    function extrudeAirfoil(pts2D, depth, bevelSize, hex, isGlow) {
        const shape = new THREE.Shape();
        shape.moveTo(pts2D[0][0], pts2D[0][1]);
        for (let i = 1; i < pts2D.length; i++) {
            shape.lineTo(pts2D[i][0], pts2D[i][1]);
        }
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: depth,
            bevelEnabled: true,
            bevelSegments: 3,
            steps: 1,
            bevelSize: bevelSize || 0.04,
            bevelThickness: bevelSize || 0.04,
        });
        geo.center();
        return bakePartGeo(geo, hex, isGlow, false);
    }

    function box(w, h, d, hex, glow) {
        return bakePartGeo(new THREE.BoxGeometry(w, h, d), hex, glow, false);
    }
    function cone(r, h, segs, hex, glow) {
        return bakePartGeo(new THREE.ConeGeometry(r, h, segs || 16), hex, glow, false);
    }
    function cyl(rt, rb, h, segs, hex, glow) {
        return bakePartGeo(new THREE.CylinderGeometry(rt, rb, h, segs || 18), hex, glow, false);
    }
    function sphere(r, ws, hs, hex, glow) {
        return bakePartGeo(new THREE.SphereGeometry(r, ws || 20, hs || 14), hex, glow, false);
    }
    function oct(r, detail, hex, glow) {
        return bakePartGeo(new THREE.OctahedronGeometry(r, detail || 0), hex, glow, true);
    }
    function ico(r, detail, hex, glow) {
        return bakePartGeo(new THREE.IcosahedronGeometry(r, detail || 1), hex, glow, false);
    }

    // ------------------------------------------------------------------ 1. Next-Gen Sculpted Arwing (Player & Wingmen)
    function arwing(trimHex) {
        const trim = trimHex || 0x1658e8;     // Anodized Cobalt Blue G-Diffuser armor
        const hull = 0xf2f6fc;                // Sleek Titanium-Ceramic White fuselage
        const silver = 0xc5d4e8;              // Brushed Alloy trim
        const dark = 0x1e2636;                // Carbon gunmetal mechanical frame
        const root = new THREE.Group();

        // 1) Sleek Aerodynamic Lathe/Sculpted Fuselage Spine (-Z forward, +Z aft)
        const fuseProfile = [
            new THREE.Vector2(0.001, -2.75),  // Needle nose tip
            new THREE.Vector2(0.16,  -2.10),
            new THREE.Vector2(0.34,  -1.25),
            new THREE.Vector2(0.48,  -0.30),
            new THREE.Vector2(0.46,   0.65),
            new THREE.Vector2(0.36,   1.18),
            new THREE.Vector2(0.01,   1.22),
        ];
        const fuseGeo = new THREE.LatheGeometry(fuseProfile, 20);
        fuseGeo.rotateX(Math.PI / 2);
        fuseGeo.scale(1.22, 0.68, 1.0);
        root.add(bakePartGeo(fuseGeo, hull, false, false));

        // Upper dorsal spine fairing & crimson Star Fox nose stripe
        const spine = extrudeAirfoil([
            [-2.45, 0.0], [-0.95, 0.22], [0.85, 0.26], [1.12, 0.08], [-1.2, -0.04],
        ], 0.18, 0.04, silver, false);
        spine.rotation.y = Math.PI / 2;
        spine.position.set(0, 0.16, -0.45);
        root.add(spine);

        const redChevron = extrudeAirfoil([
            [-2.62, 0.0], [-1.45, 0.12], [-1.30, 0.02], [-2.25, -0.03],
        ], 0.26, 0.02, 0xe62e25, false);
        redChevron.rotation.y = Math.PI / 2;
        redChevron.position.set(0, 0.12, -1.95);
        root.add(redChevron);

        // 2) Curved Teardrop Tinted Glass Canopy + Detailed Cockpit Interior
        const canopyGeo = new THREE.SphereGeometry(0.38, 22, 16);
        canopyGeo.scale(0.86, 0.68, 2.35);
        const canopy = new THREE.Mesh(canopyGeo, MAT_GLASS);
        canopy.position.set(0, 0.28, -0.32);
        root.add(canopy);

        // Canopy metallic arch frame
        const arch = cyl(0.31, 0.34, 0.06, 16, silver, false);
        arch.rotation.z = Math.PI / 2;
        arch.scale.set(1.0, 1.0, 0.75);
        arch.position.set(0, 0.28, -0.52);
        root.add(arch);

        // Pilot Helmet & Holographic HUD inside cockpit
        const helmet = sphere(0.14, 14, 12, 0xf5f8ff, false);
        helmet.position.set(0, 0.32, -0.25);
        const visor = sphere(0.12, 12, 10, 0x152538, false);
        visor.position.set(0, 0.33, -0.32);
        const holoHud = box(0.26, 0.10, 0.04, 0x3ef2ff, true);
        holoHud.position.set(0, 0.34, -0.62);
        holoHud.rotation.x = -0.35;
        root.add(helmet, visor, holoHud);

        // 3) Twin Sculpted Cobalt-Blue G-Diffuser Nacelles & Tall Angled Stabilizer Fins
        for (const s of [-1, 1]) {
            const gx = s * 0.72;
            const nacGroup = new THREE.Group();
            nacGroup.position.set(gx, -0.02, 0.08);

            // Smooth beveled G-Diffuser turbine housing
            const podGeo = new THREE.CylinderGeometry(0.24, 0.28, 1.85, 16);
            podGeo.rotateX(Math.PI / 2);
            podGeo.scale(1.05, 0.85, 1.0);
            nacGroup.add(bakePartGeo(podGeo, trim, false, false));

            // Forward intake shroud + glowing cyan G-Diffuser plasma turbine
            const intakeLip = cyl(0.25, 0.22, 0.22, 16, silver, false);
            intakeLip.rotation.x = Math.PI / 2;
            intakeLip.position.z = -0.92;
            const intakeGlow = cyl(0.20, 0.20, 0.16, 16, 0x3ef6ff, true);
            intakeGlow.rotation.x = Math.PI / 2;
            intakeGlow.position.z = -0.96;
            const aftGlow = cyl(0.18, 0.22, 0.18, 16, 0x3ef6ff, true);
            aftGlow.rotation.x = Math.PI / 2;
            aftGlow.position.z = 0.94;
            nacGroup.add(intakeLip, intakeGlow, aftGlow);

            // Tall Swept Dorsal Fin atop each G-Diffuser
            const fin = extrudeAirfoil([
                [-0.65, 0.0], [0.45, 0.0], [0.88, 0.82], [0.42, 0.82],
            ], 0.06, 0.025, trim, false);
            fin.rotation.y = Math.PI / 2;
            fin.rotation.z = -s * 0.18;
            fin.position.set(s * 0.04, 0.42, 0.22);
            nacGroup.add(fin);

            // Ventral stabilizer strake
            const vFin = extrudeAirfoil([
                [-0.35, 0.0], [0.45, 0.0], [0.65, -0.36], [0.20, -0.36],
            ], 0.04, 0.015, trim, false);
            vFin.rotation.y = Math.PI / 2;
            vFin.rotation.z = s * 0.22;
            vFin.position.set(0, -0.24, 0.25);
            nacGroup.add(vFin);

            root.add(nacGroup);
        }

        // 4) Breakable Swept W-Wings (wingL & wingR) with Beveled Airfoils & Twin Laser Cannons
        const makeWing = (s) => {
            const wg = new THREE.Group();
            wg.position.set(s * 0.88, -0.04, 0.05);

            // Inner Gull-Wing Section (swept slightly forward/down)
            const innerWing = extrudeAirfoil([
                [0.0, -0.58],
                [s * 1.15, -0.22],
                [s * 1.15,  0.52],
                [0.0,  0.65],
            ], 0.07, 0.035, hull, false);
            innerWing.rotation.x = Math.PI / 2;
            innerWing.rotation.y = -s * 0.08;
            wg.add(innerWing);

            // Outer High-Speed Swept Blade Section
            const outerWing = extrudeAirfoil([
                [s * 1.05, -0.22],
                [s * 2.38,  0.52],
                [s * 2.48,  1.05],
                [s * 1.05,  0.52],
            ], 0.05, 0.025, hull, false);
            outerWing.rotation.x = Math.PI / 2;
            outerWing.rotation.y = s * 0.05;
            wg.add(outerWing);

            // Cobalt Blue Leading-Edge Accent Strip & Wingtip Spear Pod
            const tipPod = cyl(0.05, 0.09, 1.05, 12, trim, false);
            tipPod.rotation.x = Math.PI / 2;
            tipPod.position.set(s * 2.38, 0.0, 0.68);
            const strobe = sphere(0.075, 10, 8, s < 0 ? 0xff3b58 : 0x3eff9e, true);
            strobe.position.set(s * 2.40, 0.0, 1.18);
            wg.add(tipPod, strobe);

            // Under-Wing Heavy Plasma Cannon Assembly
            const mount = box(0.18, 0.16, 0.82, dark, false);
            mount.position.set(s * 0.42, -0.14, -0.35);
            const barrelOuter = cyl(0.065, 0.075, 0.75, 12, silver, false);
            barrelOuter.rotation.x = Math.PI / 2;
            barrelOuter.position.set(s * 0.42, -0.14, -0.82);
            const barrelInner = cyl(0.04, 0.045, 1.15, 12, dark, false);
            barrelInner.rotation.x = Math.PI / 2;
            barrelInner.position.set(s * 0.42, -0.14, -1.05);
            const muzzle = sphere(0.06, 10, 8, 0x48ff92, true);
            muzzle.position.set(s * 0.42, -0.14, -1.62);
            wg.add(mount, barrelOuter, barrelInner, muzzle);

            return wg;
        };
        const wingL = makeWing(-1); wingL.name = 'wingL';
        const wingR = makeWing(1);  wingR.name = 'wingR';
        root.add(wingL, wingR);

        // 5) Multi-Petal Vector Thruster Nozzle & Volumetric Shock-Diamond Afterburner
        const nozzleBase = cyl(0.34, 0.42, 0.36, 20, dark, false);
        nozzleBase.rotation.x = Math.PI / 2;
        nozzleBase.position.set(0, 0.02, 1.15);
        const nozzleRim = cyl(0.28, 0.34, 0.18, 20, silver, false);
        nozzleRim.rotation.x = Math.PI / 2;
        nozzleRim.position.set(0, 0.02, 1.32);
        const nozzleCore = cyl(0.25, 0.25, 0.22, 18, 0xffaa38, true);
        nozzleCore.rotation.x = Math.PI / 2;
        nozzleCore.position.set(0, 0.02, 1.34);
        root.add(nozzleBase, nozzleRim, nozzleCore);

        const thruster = new THREE.Group();
        thruster.name = 'thruster';
        thruster.position.set(0, 0.02, 1.40);

        const outerPlume = cone(0.36, 1.65, 18, 0xff6218, true);
        outerPlume.rotation.x = Math.PI / 2;
        outerPlume.position.z = 0.72;

        const midPlume = cone(0.25, 1.20, 18, 0x3ef2ff, true);
        midPlume.rotation.x = Math.PI / 2;
        midPlume.position.z = 0.52;

        const innerCore = cone(0.15, 0.82, 14, 0xffffff, true);
        innerCore.rotation.x = Math.PI / 2;
        innerCore.position.z = 0.32;

        const shockRing1 = cyl(0.32, 0.32, 0.07, 18, 0x68f8ff, true);
        shockRing1.rotation.x = Math.PI / 2;
        shockRing1.position.z = 0.28;

        const shockRing2 = cyl(0.22, 0.22, 0.06, 18, 0xffffff, true);
        shockRing2.rotation.x = Math.PI / 2;
        shockRing2.position.z = 0.62;

        thruster.add(outerPlume, midPlume, innerCore, shockRing1, shockRing2);
        root.add(thruster);

        // Dynamic engine point light
        const engineLight = new THREE.PointLight(0x45d8ff, 1.5, 16);
        engineLight.position.set(0, 0.1, 2.2);
        root.add(engineLight);

        // 6) Barrel Roll Electromagnetic Deflector Field
        const shieldGeo = new THREE.CylinderGeometry(2.45, 2.45, 3.8, 16, 1, true);
        shieldGeo.rotateX(Math.PI / 2);
        const barrelShield = new THREE.Mesh(shieldGeo, MAT_SHIELD);
        barrelShield.name = 'barrelShield';
        barrelShield.visible = false;
        root.add(barrelShield);

        root.userData = { wingL, wingR, thruster, barrelShield, engineLight };
        return root;
    }

    // ------------------------------------------------------------------ 2. Star Wolf Rival Wolfen Fighter
    function wolfFighter() {
        const root = new THREE.Group();
        const darkHull = 0x222938;
        const crimson = 0xd61e3c;
        const silver = 0x9aa8bd;

        const fuseGeo = new THREE.ConeGeometry(0.55, 3.2, 16);
        fuseGeo.rotateX(-Math.PI / 2);
        fuseGeo.scale(1.15, 0.72, 1.0);
        root.add(bakePartGeo(fuseGeo, darkHull, false, false));

        const canopyGeo = new THREE.SphereGeometry(0.36, 16, 12);
        canopyGeo.scale(0.85, 0.65, 2.1);
        const canopy = bakePartGeo(canopyGeo, 0xff2848, true, false);
        canopy.position.set(0, 0.24, -0.2);
        root.add(canopy);

        // 4 Forward-Swept X-Claw Airfoils
        for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
                const wg = new THREE.Group();
                wg.position.set(sx * 0.42, sy * 0.16, 0.2);
                wg.rotation.z = sx * sy * 0.46;

                const wing = extrudeAirfoil([
                    [0, -0.35],
                    [sx * 1.85, -0.78],
                    [sx * 1.95, -0.15],
                    [0,  0.42],
                ], 0.06, 0.03, crimson, false);
                wing.rotation.x = Math.PI / 2;
                wg.add(wing);

                const cannon = cyl(0.06, 0.08, 1.35, 12, silver, false);
                cannon.rotation.x = Math.PI / 2;
                cannon.position.set(sx * 1.75, 0, -0.65);
                wg.add(cannon);
                root.add(wg);
            }
        }

        const thr = cone(0.36, 1.3, 16, 0xff2e55, true);
        thr.rotation.x = Math.PI / 2;
        thr.position.set(0, 0, 1.25);
        root.add(thr);
        return root;
    }

    // ------------------------------------------------------------------ 3. Venom Interceptor Squadron Fighter
    function enemyFighter(variant) {
        const root = new THREE.Group();
        const hullCol = variant === 'gold' ? 0xf5b82e : variant === 'ace' ? 0xd92b4b : 0x5c6d85;
        const trimCol = variant === 'gold' ? 0xffe680 : variant === 'ace' ? 0xff6240 : 0x2c3646;
        const glowCol = variant === 'gold' ? 0xfff078 : 0xff4528;

        // Sleek needle fuselage pointing toward player (+Z)
        const nose = cone(0.56, 2.35, 16, hullCol, false);
        nose.rotation.x = Math.PI / 2;
        nose.scale.set(1.15, 0.68, 1.0);
        nose.position.set(0, 0, 0.55);
        root.add(nose);

        const aft = cyl(0.45, 0.52, 1.15, 16, trimCol, false);
        aft.rotation.x = Math.PI / 2;
        aft.scale.set(1.15, 0.72, 1.0);
        aft.position.set(0, 0, -0.35);
        root.add(aft);

        const cockpit = sphere(0.32, 14, 10, glowCol, true);
        cockpit.scale.set(0.95, 0.65, 1.65);
        cockpit.position.set(0, 0.22, 0.28);
        root.add(cockpit);

        for (const s of [-1, 1]) {
            const wing = extrudeAirfoil([
                [0, -0.45],
                [s * 1.75, 0.15],
                [s * 1.85, 0.72],
                [0,  0.42],
            ], 0.05, 0.025, hullCol, false);
            wing.rotation.x = Math.PI / 2;
            wing.rotation.z = -s * 0.14;
            wing.position.set(s * 0.35, 0, -0.05);
            root.add(wing);

            const pod = cyl(0.13, 0.16, 1.25, 12, trimCol, false);
            pod.rotation.x = Math.PI / 2;
            pod.position.set(s * 1.72, -0.10, 0.18);
            const tipGlow = sphere(0.13, 10, 8, glowCol, true);
            tipGlow.position.set(s * 1.72, -0.10, 0.82);
            root.add(pod, tipGlow);
        }

        const engine = cone(0.30, 0.95, 14, glowCol, true);
        engine.rotation.x = -Math.PI / 2;
        engine.position.set(0, 0, -1.05);
        root.add(engine);
        return root;
    }

    // ------------------------------------------------------------------ 4. Stealth Twin-Boom Striker
    function stealthFighter() {
        const root = new THREE.Group();
        const center = cone(0.65, 2.45, 16, 0x3b2858, false);
        center.rotation.x = Math.PI / 2;
        center.scale.set(1.25, 0.55, 1.0);
        root.add(center);

        const visor = sphere(0.32, 14, 10, 0x45f2ff, true);
        visor.scale.set(1.2, 0.45, 1.4);
        visor.position.set(0, 0.18, 0.55);
        root.add(visor);

        for (const s of [-1, 1]) {
            const boom = cyl(0.16, 0.22, 2.55, 14, 0x5c3e85, false);
            boom.rotation.x = Math.PI / 2;
            boom.position.set(s * 0.98, 0, 0.08);
            root.add(boom);

            const blade = extrudeAirfoil([
                [0, -0.55], [s * 1.35, 0.05], [s * 1.35, 0.55], [0, 0.45],
            ], 0.05, 0.02, 0x2a1b42, false);
            blade.rotation.x = Math.PI / 2;
            blade.position.set(s * 0.35, 0, 0.10);
            root.add(blade);

            const eye = sphere(0.16, 10, 8, 0x45f2ff, true);
            eye.position.set(s * 0.98, 0.04, 1.35);
            root.add(eye);
        }
        return root;
    }

    // ------------------------------------------------------------------ 5. Goliath Bipedal Ground Mech Walker
    function mechWalker() {
        const root = new THREE.Group();
        const armor = 0x6a788f;
        const dark = 0x28303e;

        const torso = box(2.05, 1.4, 2.15, armor, false);
        torso.position.y = 2.55;
        const dome = sphere(1.15, 18, 12, 0x8494ad, false);
        dome.scale.set(1.0, 0.55, 1.05);
        dome.position.set(0, 3.25, -0.05);
        root.add(torso, dome);

        const visor = box(1.58, 0.38, 0.26, 0xff3b28, true);
        visor.position.set(0, 2.68, 1.04);
        root.add(visor);

        for (const s of [-1, 1]) {
            const pod = box(0.65, 0.78, 1.2, 0x4b5668, false);
            pod.position.set(s * 1.32, 2.98, 0.05);
            const podGlow = box(0.45, 0.50, 0.16, 0xff8a28, true);
            podGlow.position.set(s * 1.32, 2.98, 0.65);
            const cannon = cyl(0.16, 0.18, 1.55, 14, dark, false);
            cannon.rotation.x = Math.PI / 2;
            cannon.position.set(s * 1.18, 2.25, 0.88);
            root.add(pod, podGlow, cannon);
        }

        const makeLeg = (s) => {
            const lg = new THREE.Group();
            lg.position.set(s * 0.78, 1.90, 0);
            const hip = sphere(0.32, 12, 10, dark, false);
            const thigh = cyl(0.24, 0.20, 1.15, 12, 0x4a5362, false);
            thigh.position.set(0, -0.52, -0.12);
            thigh.rotation.x = -0.22;
            const knee = sphere(0.26, 12, 10, 0xff7a28, true);
            knee.position.set(0, -1.02, -0.24);
            const shin = cyl(0.22, 0.26, 1.15, 12, armor, false);
            shin.position.set(0, -1.42, 0.08);
            shin.rotation.x = 0.18;
            const foot = box(0.72, 0.28, 1.10, dark, false);
            foot.position.set(0, -1.82, 0.28);
            lg.add(hip, thigh, knee, shin, foot);
            return lg;
        };
        const legL = makeLeg(-1); legL.name = 'legL';
        const legR = makeLeg(1);  legR.name = 'legR';
        root.add(legL, legR);
        root.userData = { legL, legR };
        return root;
    }

    // ------------------------------------------------------------------ 6. Surface Plasma Defense Turret
    function turret() {
        const root = new THREE.Group();
        const base = cyl(1.1, 1.6, 0.9, 18, 0x465062, false);
        base.position.y = 0.45;
        const collar = cyl(0.88, 0.98, 0.35, 18, 0x2b3240, false);
        collar.position.y = 0.95;
        root.add(base, collar);

        const head = new THREE.Group();
        head.name = 'head';
        head.position.y = 1.28;
        const dome = sphere(0.92, 18, 14, 0x738299, false);
        dome.scale.set(1.05, 0.78, 1.15);
        const core = sphere(0.32, 12, 10, 0xff5a28, true);
        core.position.set(0, 0.08, 0.82);
        for (const s of [-1, 1]) {
            const barrel = cyl(0.11, 0.14, 1.45, 12, 0x252b36, false);
            barrel.rotation.x = Math.PI / 2;
            barrel.position.set(s * 0.44, 0.06, 0.95);
            const tip = sphere(0.12, 10, 8, 0xff8a28, true);
            tip.position.set(s * 0.44, 0.06, 1.65);
            head.add(barrel, tip);
        }
        head.add(dome, core);
        root.add(head);
        root.userData = { head };
        return root;
    }

    // ------------------------------------------------------------------ 7. Sculpted Asteroid (with Glowing Crystal Clusters)
    function asteroid(radius, seed) {
        const r = radius || 2.4;
        const geo = new THREE.IcosahedronGeometry(r, 2);
        const pos = geo.attributes.position;
        let s = (seed || 101) | 0;
        const rand = () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) / 4294967296); };
        const verts = new Map();
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
            const key = vx.toFixed(2) + ',' + vy.toFixed(2) + ',' + vz.toFixed(2);
            let k = verts.get(key);
            if (k == null) {
                k = 0.72 + rand() * 0.48;
                verts.set(key, k);
            }
            pos.setXYZ(i, vx * k, vy * k * 0.88, vz * k);
        }
        const rock = bakePartGeo(geo, (seed & 1) ? 0x6e5b4f : 0x546070, false, true);
        const group = new THREE.Group();
        group.add(rock);
        if ((seed % 3) === 0) {
            const crystal = oct(r * 0.38, 0, (seed & 2) ? 0x3ef2ff : 0xff45a8, true);
            crystal.scale.set(0.55, 1.7, 0.55);
            crystal.position.set(r * 0.55, r * 0.35, 0);
            crystal.rotation.z = -0.6;
            group.add(crystal);
        }
        return group;
    }

    // ------------------------------------------------------------------ 8. Corneria Suspension Arch Bridge / Fortress Gate
    function archway(theme) {
        const root = new THREE.Group();
        const col = theme === 'venom' ? 0x3d2c52 : 0xc8d6e8;
        const dark = theme === 'venom' ? 0x241834 : 0x475569;
        const trim = theme === 'venom' ? 0xff3b6b : 0x38e8ff;
        const w = 13.8, h = 7.8;

        for (const s of [-1, 1]) {
            const pillar = cyl(1.2, 1.5, h + 4, 16, col, false);
            pillar.position.set(s * (w / 2), h / 2 - 1.5, 0);
            const buttress = box(1.2, h, 3.6, dark, false);
            buttress.position.set(s * (w / 2 + 1.1), h / 2 - 1.5, 0);
            const beacon = sphere(0.42, 14, 10, trim, true);
            beacon.position.set(s * (w / 2), h + 1.8, 0);
            root.add(pillar, buttress, beacon);
        }

        const lintel = box(w + 4.4, 2.0, 3.2, col, false);
        lintel.position.set(0, h + 0.85, 0);
        const upperDeck = box(w + 4.8, 0.55, 3.8, dark, false);
        upperDeck.position.set(0, h + 2.05, 0);
        const strip = box(w - 1.2, 0.36, 3.35, trim, true);
        strip.position.set(0, h - 0.12, 0);
        root.add(lintel, upperDeck, strip);
        return root;
    }

    // ------------------------------------------------------------------ 9. Supply / Gold / Warp Ring & Pickups
    function ring(kind) {
        const root = new THREE.Group();
        const col = kind === 'gold' ? 0xffd238 : kind === 'warp' ? 0x45f2ff : 0xd8e8fa;
        const R = kind === 'warp' ? 3.3 : 2.45;
        const torusGeo = new THREE.TorusGeometry(R, 0.26, 14, 32);
        const torus = bakePartGeo(torusGeo, col, kind === 'gold' || kind === 'warp', false);
        root.add(torus);
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            const node = sphere(0.36, 12, 10, 0xffffff, true);
            node.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
            root.add(node);
        }
        return root;
    }

    function pickup(kind) {
        const root = new THREE.Group();
        const col = kind === 'laser' ? 0x38e8ff : kind === 'bomb' ? 0xff4538 : 0x52ff8a;
        const core = sphere(0.75, 16, 12, col, true);
        const haloGeo = new THREE.TorusGeometry(1.05, 0.12, 12, 24);
        haloGeo.rotateX(Math.PI / 3);
        const halo = bakePartGeo(haloGeo, 0xe8f2ff, false, false);
        root.add(core, halo);
        return root;
    }

    // ------------------------------------------------------------------ 10. Boss 1: Attack Carrier GORGON (Corneria)
    function bossGorgon() {
        const root = new THREE.Group();
        const hull = box(12.5, 3.0, 8.0, 0x4e5b70, false);
        const lowerHull = cyl(3.2, 4.8, 6.5, 18, 0x323b4a, false);
        lowerHull.rotation.z = Math.PI / 2;
        lowerHull.position.y = -1.6;
        const deck = box(7.8, 1.8, 5.4, 0x6a7a94, false);
        deck.position.set(0, 2.2, -0.4);
        const bridge = cyl(1.6, 2.2, 1.8, 16, 0x8496b2, false);
        bridge.position.set(0, 3.6, -0.8);
        const bridgeWindow = box(2.6, 0.45, 0.35, 0x38f2ff, true);
        bridgeWindow.position.set(0, 3.7, 0.65);
        root.add(hull, lowerHull, deck, bridge, bridgeWindow);

        for (const s of [-1, 1]) {
            const wing = box(6.2, 1.6, 6.0, 0x3c4759, false);
            wing.position.set(s * 7.8, -0.1, 0.6);
            wing.rotation.y = s * 0.24;
            const cannon = cyl(0.28, 0.35, 3.4, 16, 0x242b38, false);
            cannon.rotation.x = Math.PI / 2;
            cannon.position.set(s * 8.6, 0.4, 3.6);
            const bay = box(2.6, 1.6, 1.3, 0xff7a28, true);
            bay.position.set(s * 4.4, -0.2, 3.8);
            bay.name = s < 0 ? 'bayL' : 'bayR';
            root.add(wing, cannon, bay);
        }

        const core = sphere(1.95, 22, 16, 0x3ef2ff, true);
        core.position.set(0, 0.1, 4.1);
        core.name = 'core';
        root.add(core);

        root.userData = { core };
        return root;
    }

    // ------------------------------------------------------------------ 11. Boss 2: Asteroid Crusher METORA (Meteo)
    function bossMetora() {
        const root = new THREE.Group();
        const body = cyl(4.0, 4.0, 7.0, 24, 0x4e4260, false);
        body.rotation.x = Math.PI / 2;
        root.add(body);

        const ringOuter = new THREE.Group();
        ringOuter.name = 'ringOuter';
        const torus = bakePartGeo(new THREE.TorusGeometry(5.8, 0.55, 14, 32), 0x6c5888, false, false);
        ringOuter.add(torus);
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const blade = box(1.7, 3.1, 1.3, 0x8e78ad, false);
            blade.position.set(Math.cos(a) * 5.9, Math.sin(a) * 5.9, 0);
            blade.rotation.z = a;
            const emitter = sphere(0.58, 14, 10, 0x3ef2ff, true);
            emitter.position.set(Math.cos(a) * 4.5, Math.sin(a) * 4.5, 1.2);
            ringOuter.add(blade, emitter);
        }
        root.add(ringOuter);

        const core = sphere(2.15, 22, 16, 0xff3b8d, true);
        core.position.set(0, 0, 3.7);
        core.name = 'core';
        root.add(core);

        root.userData = { core, ringOuter };
        return root;
    }

    // ------------------------------------------------------------------ 12. Boss 3: Bio-Brain ANDRON (Venom)
    function bossAndron() {
        const root = new THREE.Group();
        const head = new THREE.Group();
        head.name = 'head';
        const cranium = ico(4.4, 2, 0x92a0b8, false);
        cranium.scale.set(0.96, 1.25, 0.88);
        head.add(cranium);

        const crown = cone(3.2, 2.4, 16, 0x5c667a, false);
        crown.position.set(0, 4.2, -0.2);
        head.add(crown);

        for (const s of [-1, 1]) {
            const brow = box(2.1, 0.55, 1.2, 0x464f61, false);
            brow.position.set(s * 1.6, 1.35, 3.1);
            brow.rotation.z = -s * 0.24;
            const eye = sphere(0.85, 16, 12, 0xff2845, true);
            eye.scale.set(1.45, 0.72, 0.65);
            eye.position.set(s * 1.58, 0.68, 3.32);
            head.add(brow, eye);
        }

        const jaw = box(3.6, 1.55, 2.8, 0x6c788c, false);
        jaw.position.set(0, -2.5, 1.7);
        jaw.name = 'jaw';
        head.add(jaw);

        const brainCore = sphere(1.85, 20, 14, 0x52ffcb, true);
        brainCore.position.set(0, 0.4, 2.8);
        brainCore.name = 'core';
        head.add(brainCore);
        root.add(head);

        const makeHand = (s) => {
            const hg = new THREE.Group();
            hg.position.set(s * 7.8, -1.2, 2.6);
            const palm = box(2.5, 2.7, 0.95, 0x9aa6ba, false);
            const palmCore = sphere(0.75, 14, 10, 0xff9a28, true);
            palmCore.position.z = 0.58;
            hg.add(palm, palmCore);
            for (let f = -1.5; f <= 1.5; f += 1) {
                const finger = cyl(0.22, 0.26, 1.5, 12, 0x748096, false);
                finger.position.set(f * 0.58, 1.95, 0.18);
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
        MAT_GLASS,
        ENV_MAP,
        bakePartGeo,
    };
})();
