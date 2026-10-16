// Starwing 64: High-Detail Faceted 3D Spacecraft, Mechs, Architecture & Boss Models
// with Custom Fresnel Rim/Specular Shaders, Panel Edge Highlights & Baked Vertex AO.
(function () {
    'use strict';
    const SW = window.SW = window.SW || {};
    const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

    function lin(hex) {
        const c = new THREE.Color(hex);
        if (c.convertSRGBToLinear) c.convertSRGBToLinear();
        return c;
    }

    // Primary metallic/ceramic hull shader with Fresnel rim, key-sun specular, and panel contrast
    const MAT_BODY = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.34,
        metalness: 0.42,
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
                'vec3 sunDir = normalize(vec3(0.42, 0.78, 0.46));',
                'float sunFace = smoothstep(-0.25, 0.7, dot(wNorm, sunDir));',
                'float rim = pow(1.0 - ndv, 2.6) * (0.4 + 0.6 * sunFace);',
                'vec3 H = normalize(sunDir + viewDir);',
                'float spec = smoothstep(0.82, 0.95, max(0.0, dot(wNorm, H))) * 0.38;',
                'gl_FragColor.rgb += vec3(0.45, 0.78, 1.0) * rim * 0.36 + vec3(1.0, 0.98, 0.92) * spec;',
                '#include <dithering_fragment>',
            ].join('\n'));
    };

    // High-gloss cockpit canopy glass material
    const MAT_GLASS = new THREE.MeshStandardMaterial({
        color: 0x102845,
        emissive: 0x07182e,
        roughness: 0.08,
        metalness: 0.85,
        flatShading: true,
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
                'float fres = pow(1.0 - clamp(dot(wNorm, viewDir), 0.0, 1.0), 2.2);',
                'vec3 H = normalize(normalize(vec3(0.4, 0.85, 0.4)) + viewDir);',
                'float glare = smoothstep(0.88, 0.97, max(0.0, dot(wNorm, H)));',
                'gl_FragColor.rgb += vec3(0.28, 0.85, 1.0) * fres * 0.65 + vec3(1.0) * glare * 0.85;',
                '#include <dithering_fragment>',
            ].join('\n'));
    };

    // Unlit HDR glow material with white-hot inner plasma core
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
                'float core = pow(clamp(dot(normalize(vWorldNorm), viewDir), 0.0, 1.0), 1.3);',
                'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 1.0, 1.0), core * 0.52) * 1.35;',
                '#include <dithering_fragment>',
            ].join('\n'));
    };

    const MAT_SHIELD = new THREE.MeshBasicMaterial({
        color: 0x52f2ff,
        transparent: true,
        opacity: 0.42,
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
            const nx = nrm ? nrm.getX(i) : 0;
            const ny = nrm ? nrm.getY(i) : 0.5;
            const nz = nrm ? nrm.getZ(i) : 0;
            const yf = (y - minY) / spanY;
            let shade;
            if (isGlow) {
                shade = 0.92 + 0.28 * yf + Math.max(0, ny) * 0.16;
            } else {
                // Facet directional contrast + vertical AO gradient
                const skyTerm = 0.76 + 0.28 * clamp(ny * 0.55 + 0.45, 0, 1);
                const sideBevel = 1.0 + 0.08 * Math.abs(nx) - 0.06 * Math.max(0, -nz);
                const ao = 0.82 + 0.22 * yf + 0.06 * clamp(Math.hypot(x, z) / maxR, 0, 1);
                shade = skyTerm * sideBevel * ao;
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

    // Helper to build custom faceted BufferGeometry from triangles
    function customMesh(verts, tris, hex, glow, matOverride) {
        const pos = new Float32Array(tris.length * 9);
        for (let i = 0; i < tris.length; i++) {
            const [a, b, c] = tris[i];
            const va = verts[a], vb = verts[b], vc = verts[c];
            const o = i * 9;
            pos[o]     = va[0]; pos[o + 1] = va[1]; pos[o + 2] = va[2];
            pos[o + 3] = vb[0]; pos[o + 4] = vb[1]; pos[o + 5] = vb[2];
            pos[o + 6] = vc[0]; pos[o + 7] = vc[1]; pos[o + 8] = vc[2];
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        if (matOverride) {
            geo.computeVertexNormals();
            return new THREE.Mesh(geo, matOverride);
        }
        return bakePartGeo(geo, hex, glow);
    }

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

    // ------------------------------------------------------------------ 1. Sculpted Arwing (Player & Wingmen)
    function arwing(trimHex) {
        const trim = trimHex || 0x1e5ce6; // Classic G-Diffuser Royal Blue
        const hull = 0xf0f5fc;            // Crisp ceramic white-silver hull
        const noseSilver = 0xdce6f5;
        const dark = 0x242c3d;
        const root = new THREE.Group();

        // 1) Custom sculpted chiseled delta fuselage (-Z forward, +Z aft)
        const hullVerts = [
            [0.0,  0.00, -2.55], // 0: Razor needle nose tip
            [0.0,  0.26, -1.15], // 1: Forward dorsal ridge
            [0.0,  0.34,  0.15], // 2: Aft dorsal spine peak
            [0.0,  0.22,  1.05], // 3: Tail upper lip
            [-0.44, 0.04, -1.05], // 4: Left chine forward
            [ 0.44, 0.04, -1.05], // 5: Right chine forward
            [-0.56, 0.06,  0.35], // 6: Left chine aft
            [ 0.56, 0.06,  0.35], // 7: Right chine aft
            [-0.36, 0.04,  1.08], // 8: Left tail corner
            [ 0.36, 0.04,  1.08], // 9: Right tail corner
            [0.0, -0.20, -1.00], // 10: Forward ventral keel
            [0.0, -0.24,  0.45], // 11: Aft ventral keel
            [0.0, -0.14,  1.08], // 12: Tail lower lip
        ];
        const hullTris = [
            // Top nose facets
            [0, 4, 1], [0, 1, 5],
            // Mid dorsal facets
            [1, 4, 6], [1, 6, 2],
            [1, 2, 7], [1, 7, 5],
            // Aft dorsal facets
            [2, 6, 8], [2, 8, 3],
            [2, 3, 9], [2, 9, 7],
            // Bottom nose facets
            [0, 10, 4], [0, 5, 10],
            // Bottom belly facets
            [10, 11, 6], [10, 6, 4],
            [10, 5, 7], [10, 7, 11],
            [11, 8, 6], [11, 12, 8],
            [11, 7, 9], [11, 9, 12],
            // Rear transom
            [3, 8, 12], [3, 12, 9],
        ];
        root.add(customMesh(hullVerts, hullTris, hull, false));

        // Red/Orange Star Fox nose emblem chevron
        const noseTrimVerts = [
            [0.0,  0.02, -2.56],
            [-0.20, 0.12, -1.65],
            [ 0.20, 0.12, -1.65],
            [0.0,  0.22, -1.35],
        ];
        root.add(customMesh(noseTrimVerts, [[0, 1, 3], [0, 3, 2]], 0xe63228, false));

        // 2) Faceted Armored Glass Cockpit Canopy + Internal Pilot
        const canopyVerts = [
            [0.0,  0.25, -1.22], // 0: Front windshield tip
            [0.0,  0.54, -0.32], // 1: Canopy apex
            [0.0,  0.34,  0.48], // 2: Canopy rear point
            [-0.30, 0.24, -0.45], // 3: Left frame front
            [ 0.30, 0.24, -0.45], // 4: Right frame front
            [-0.28, 0.26,  0.22], // 5: Left frame rear
            [ 0.28, 0.26,  0.22], // 6: Right frame rear
        ];
        const canopyTris = [
            [0, 3, 1], [0, 1, 4],
            [1, 3, 5], [1, 5, 2],
            [1, 2, 6], [1, 6, 4],
        ];
        root.add(customMesh(canopyVerts, canopyTris, 0x102845, false, MAT_GLASS));

        // Internal Pilot Helmet & Glowing HUD Visor inside canopy
        const helmet = oct(0.16, 0, 0xebf2fa, false);
        helmet.position.set(0, 0.34, -0.32);
        const hudGlow = box(0.24, 0.08, 0.14, 0x3ef2ff, true);
        hudGlow.position.set(0, 0.32, -0.58);
        root.add(helmet, hudGlow);

        // Center Dorsal Stabilizer Fin
        const cFinVerts = [
            [0.0, 0.30,  0.05],
            [0.0, 0.72,  0.68],
            [0.0, 0.24,  0.98],
            [-0.06, 0.28, 0.52],
            [ 0.06, 0.28, 0.52],
        ];
        root.add(customMesh(cFinVerts, [
            [0, 3, 1], [1, 3, 2],
            [0, 1, 4], [1, 2, 4],
            [0, 4, 3], [1, 3, 4],
        ], noseSilver, false));

        // 3) Iconic Twin Royal-Blue G-Diffuser Nacelle Blocks (Left & Right)
        for (const s of [-1, 1]) {
            const gx = s * 0.68;
            // Sculpted hexagonal G-Diffuser housing
            const gBody = box(0.42, 0.36, 1.58, trim, false);
            gBody.position.set(gx, -0.02, 0.08);
            gBody.rotation.z = -s * 0.08;
            root.add(gBody);

            // Forward beveled intake cowling
            const cowl = cone(0.28, 0.55, 4, trim, false);
            cowl.rotation.x = -Math.PI / 2;
            cowl.rotation.z = Math.PI / 4;
            cowl.position.set(gx, -0.02, -0.82);
            root.add(cowl);

            // Glowing Cyan G-Diffuser Plasma Intake Core
            const intake = box(0.28, 0.20, 0.18, 0x38f6ff, true);
            intake.position.set(gx, -0.02, -0.68);
            root.add(intake);

            // Aft G-Diffuser Auxiliary Vent Glow
            const aftVent = box(0.26, 0.18, 0.16, 0x38f6ff, true);
            aftVent.position.set(gx, -0.02, 0.86);
            root.add(aftVent);

            // Tall Angled Twin Dorsal Fins on top of G-Diffusers (signature Arwing silhouette)
            const finVerts = [
                [gx,          0.14, -0.35],
                [gx + s*0.14, 0.82,  0.55],
                [gx,          0.14,  0.82],
                [gx - s*0.07, 0.18,  0.25],
                [gx + s*0.07, 0.18,  0.25],
            ];
            const finTris = s > 0
                ? [[0, 3, 1], [1, 3, 2], [0, 1, 4], [1, 2, 4]]
                : [[0, 1, 3], [1, 2, 3], [0, 4, 1], [1, 4, 2]];
            root.add(customMesh(finVerts, finTris, trim, false));
        }

        // 4) Breakable Swept W-Wings (wingL & wingR) with Forward Laser Cannons & Wingtip Beacons
        const makeWing = (s) => {
            const wg = new THREE.Group();
            wg.position.set(s * 0.82, -0.04, 0.08);

            // Custom sculpted swept-back main airfoil blade
            const wVerts = [
                [0.0,       0.06, -0.52], // 0: Root leading edge
                [0.0,       0.04,  0.62], // 1: Root trailing edge
                [0.0,      -0.08,  0.05], // 2: Root bottom thickness
                [s * 1.15, -0.10, -0.10], // 3: Mid-wing kink leading
                [s * 1.15, -0.10,  0.58], // 4: Mid-wing kink trailing
                [s * 2.15, -0.02,  0.55], // 5: Outer wingtip leading
                [s * 2.28, -0.02,  0.98], // 6: Outer wingtip trailing point
            ];
            const wTris = s > 0 ? [
                [0, 1, 3], [1, 4, 3],
                [3, 4, 5], [4, 6, 5],
                [0, 3, 2], [2, 3, 4], [2, 4, 1],
                [3, 5, 4], [4, 5, 6],
            ] : [
                [0, 3, 1], [1, 3, 4],
                [3, 5, 4], [4, 5, 6],
                [0, 2, 3], [2, 4, 3], [2, 1, 4],
                [3, 4, 5], [4, 6, 5],
            ];
            wg.add(customMesh(wVerts, wTris, hull, false));

            // Blue wingtip stabilizer spear
            const tipPod = box(0.16, 0.12, 0.85, trim, false);
            tipPod.position.set(s * 2.12, -0.02, 0.62);
            tipPod.rotation.y = -s * 0.18;
            wg.add(tipPod);

            // Glowing wingtip strobe beacon
            const beacon = oct(0.09, 0, s < 0 ? 0xff3b52 : 0x38ff9c, true);
            beacon.position.set(s * 2.22, -0.02, 0.95);
            wg.add(beacon);

            // Under-wing Heavy Laser Cannon Barrel
            const cannonHousing = box(0.18, 0.16, 0.72, dark, false);
            cannonHousing.position.set(s * 0.42, -0.12, -0.35);
            const barrel = cyl(0.045, 0.055, 0.85, 6, 0x8a9bb5, false);
            barrel.rotation.x = Math.PI / 2;
            barrel.position.set(s * 0.42, -0.12, -0.88);
            const muzzle = oct(0.065, 0, 0x45ff88, true);
            muzzle.position.set(s * 0.42, -0.12, -1.32);
            wg.add(cannonHousing, barrel, muzzle);

            return wg;
        };
        const wingL = makeWing(-1); wingL.name = 'wingL';
        const wingR = makeWing(1);  wingR.name = 'wingR';
        root.add(wingL, wingR);

        // 5) Vector Thruster Nozzle & Multi-Stage Plasma Afterburner Plume
        const nozzleOuter = cyl(0.28, 0.38, 0.38, 8, dark, false);
        nozzleOuter.rotation.x = Math.PI / 2;
        nozzleOuter.position.set(0, 0.02, 1.15);
        const nozzleInner = cyl(0.22, 0.22, 0.40, 8, 0xffaa38, true);
        nozzleInner.rotation.x = Math.PI / 2;
        nozzleInner.position.set(0, 0.02, 1.18);
        root.add(nozzleOuter, nozzleInner);

        const thruster = new THREE.Group();
        thruster.name = 'thruster';
        thruster.position.set(0, 0.02, 1.32);

        const outerPlume = cone(0.34, 1.45, 8, 0xff6218, true);
        outerPlume.rotation.x = Math.PI / 2;
        outerPlume.position.z = 0.65;

        const midPlume = cone(0.24, 1.05, 8, 0x3ef2ff, true);
        midPlume.rotation.x = Math.PI / 2;
        midPlume.position.z = 0.48;

        const innerCore = cone(0.14, 0.72, 6, 0xffffff, true);
        innerCore.rotation.x = Math.PI / 2;
        innerCore.position.z = 0.30;

        // Shock diamond ring around thruster
        const shockRing = cyl(0.32, 0.32, 0.08, 8, 0x62f6ff, true);
        shockRing.rotation.x = Math.PI / 2;
        shockRing.position.z = 0.28;

        thruster.add(outerPlume, midPlume, innerCore, shockRing);
        root.add(thruster);

        // Dynamic engine point light so the Arwing illuminates itself & nearby objects
        const engineLight = new THREE.PointLight(0x45d8ff, 1.2, 14);
        engineLight.position.set(0, 0.1, 2.1);
        root.add(engineLight);

        // 6) Barrel Roll Deflector Cylinder (visible during barrel roll)
        const shieldGeo = new THREE.CylinderGeometry(2.35, 2.35, 3.6, 10, 1, true);
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
        const darkHull = 0x262d3d;
        const crimson = 0xc81e38;

        // Forward Twin-Fang Predator Nose
        const nose = cone(0.52, 2.5, 4, darkHull, false);
        nose.rotation.x = -Math.PI / 2;
        nose.rotation.z = Math.PI / 4;
        nose.position.set(0, 0, -0.95);
        root.add(nose);

        const canopy = oct(0.38, 0, 0xff2848, true);
        canopy.scale.set(0.9, 0.65, 1.8);
        canopy.position.set(0, 0.22, -0.22);
        root.add(canopy);

        // 4 Forward-Swept X-Claw Wings with Crimson Blades
        for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
                const wg = new THREE.Group();
                wg.position.set(sx * 0.45, sy * 0.18, 0.15);
                wg.rotation.z = sx * sy * 0.48;

                const mainWing = box(1.65, 0.10, 0.68, crimson, false);
                mainWing.position.set(sx * 0.75, 0, -0.15);
                mainWing.rotation.y = sx * 0.28; // Forward-swept!
                wg.add(mainWing);

                const clawTip = cone(0.14, 0.95, 4, 0xd8e2f0, false);
                clawTip.rotation.x = -Math.PI / 2;
                clawTip.position.set(sx * 1.52, 0, -0.58);
                wg.add(clawTip);

                root.add(wg);
            }
        }

        const thr = cone(0.34, 1.15, 6, 0xff2e55, true);
        thr.rotation.x = Math.PI / 2;
        thr.position.set(0, 0, 1.15);
        root.add(thr);
        return root;
    }

    // ------------------------------------------------------------------ 3. Venom Interceptor Squadron Fighter
    function enemyFighter(variant) {
        const root = new THREE.Group();
        const hullCol = variant === 'gold' ? 0xf5b82e : variant === 'ace' ? 0xd92b4b : 0x5c6b82;
        const trimCol = variant === 'gold' ? 0xffe680 : variant === 'ace' ? 0xff6240 : 0x354052;
        const glowCol = variant === 'gold' ? 0xfff078 : 0xff4528;

        // Sharp hexagonal fuselage pointing toward player (+Z)
        const nose = cone(0.55, 1.85, 5, hullCol, false);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0, 0.65);
        root.add(nose);

        const aft = box(0.95, 0.48, 1.1, trimCol, false);
        aft.position.set(0, 0, -0.25);
        root.add(aft);

        const cockpit = oct(0.36, 0, glowCol, true);
        cockpit.scale.set(1.1, 0.7, 1.5);
        cockpit.position.set(0, 0.22, 0.25);
        root.add(cockpit);

        for (const s of [-1, 1]) {
            const wing = box(1.55, 0.10, 0.75, hullCol, false);
            wing.position.set(s * 1.05, -0.02, -0.05);
            wing.rotation.y = -s * 0.28;
            wing.rotation.z = -s * 0.16;
            root.add(wing);

            const pod = cyl(0.14, 0.18, 1.15, 6, trimCol, false);
            pod.rotation.x = Math.PI / 2;
            pod.position.set(s * 1.65, -0.12, 0.12);
            root.add(pod);

            const tipGlow = oct(0.14, 0, glowCol, true);
            tipGlow.position.set(s * 1.65, -0.12, 0.72);
            root.add(tipGlow);
        }

        const engine = cone(0.28, 0.85, 6, glowCol, true);
        engine.rotation.x = -Math.PI / 2;
        engine.position.set(0, 0, -0.95);
        root.add(engine);
        return root;
    }

    // ------------------------------------------------------------------ 4. Stealth Twin-Boom Striker
    function stealthFighter() {
        const root = new THREE.Group();
        const center = cone(0.62, 2.2, 4, 0x3b2858, false);
        center.rotation.x = Math.PI / 2;
        center.rotation.z = Math.PI / 4;
        root.add(center);

        const visor = box(0.55, 0.16, 0.45, 0x45f2ff, true);
        visor.position.set(0, 0.18, 0.55);
        root.add(visor);

        for (const s of [-1, 1]) {
            const boom = box(0.28, 0.34, 2.35, 0x5c3e85, false);
            boom.position.set(s * 0.95, 0, 0.05);
            root.add(boom);

            const blade = box(1.15, 0.09, 0.82, 0x2a1b42, false);
            blade.position.set(s * 0.55, 0, 0.10);
            blade.rotation.y = s * 0.22;
            root.add(blade);

            const fin = box(0.10, 0.68, 0.65, 0x7652a8, false);
            fin.position.set(s * 0.95, 0.38, -0.45);
            root.add(fin);

            const eye = oct(0.18, 0, 0x45f2ff, true);
            eye.position.set(s * 0.95, 0.04, 1.25);
            root.add(eye);
        }
        return root;
    }

    // ------------------------------------------------------------------ 5. Goliath Bipedal Ground Mech Walker
    function mechWalker() {
        const root = new THREE.Group();
        const armor = 0x68758a;
        const dark = 0x2c3442;

        // Armored Cockpit Torso
        const torso = box(2.0, 1.35, 2.1, armor, false);
        torso.position.y = 2.55;
        const topHood = cone(1.35, 0.75, 4, 0x8291a8, false);
        topHood.rotation.y = Math.PI / 4;
        topHood.position.set(0, 3.55, -0.05);
        root.add(torso, topHood);

        // Glowing Cylon-style Combat Visor
        const visor = box(1.52, 0.38, 0.24, 0xff3b28, true);
        visor.position.set(0, 2.65, 1.02);
        root.add(visor);

        // Shoulder Missile Pods & Twin Autocannons
        for (const s of [-1, 1]) {
            const pod = box(0.62, 0.75, 1.15, 0x4b5668, false);
            pod.position.set(s * 1.28, 2.95, 0.05);
            const podGlow = box(0.42, 0.48, 0.16, 0xff8a28, true);
            podGlow.position.set(s * 1.28, 2.95, 0.62);
            const cannon = cyl(0.16, 0.18, 1.45, 6, dark, false);
            cannon.rotation.x = Math.PI / 2;
            cannon.position.set(s * 1.15, 2.25, 0.85);
            root.add(pod, podGlow, cannon);
        }

        const makeLeg = (s) => {
            const lg = new THREE.Group();
            lg.position.set(s * 0.78, 1.90, 0);
            const hip = oct(0.36, 0, dark, false);
            const thigh = box(0.44, 1.15, 0.52, 0x4a5362, false);
            thigh.position.set(0, -0.52, -0.12);
            thigh.rotation.x = -0.22;
            const knee = oct(0.32, 0, 0xff7a28, true);
            knee.position.set(0, -1.02, -0.24);
            const shin = box(0.38, 1.15, 0.46, armor, false);
            shin.position.set(0, -1.42, 0.08);
            shin.rotation.x = 0.18;
            const foot = box(0.68, 0.28, 1.05, dark, false);
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
        const base = cyl(1.05, 1.55, 0.9, 8, 0x465062, false);
        base.position.y = 0.45;
        const collar = cyl(0.85, 0.95, 0.35, 8, 0x2b3240, false);
        collar.position.y = 0.95;
        root.add(base, collar);

        const head = new THREE.Group();
        head.name = 'head';
        head.position.y = 1.25;
        const dome = oct(0.88, 1, 0x738299, false);
        dome.scale.set(1.05, 0.78, 1.15);
        const core = box(0.55, 0.36, 0.35, 0xff5a28, true);
        core.position.set(0, 0.08, 0.72);
        for (const s of [-1, 1]) {
            const barrel = cyl(0.11, 0.14, 1.35, 6, 0x252b36, false);
            barrel.rotation.x = Math.PI / 2;
            barrel.position.set(s * 0.42, 0.06, 0.92);
            const tip = oct(0.14, 0, 0xff8a28, true);
            tip.position.set(s * 0.42, 0.06, 1.58);
            head.add(barrel, tip);
        }
        head.add(dome, core);
        root.add(head);
        root.userData = { head };
        return root;
    }

    // ------------------------------------------------------------------ 7. Craggy Asteroid (with Optional Glowing Crystal Veins)
    function asteroid(radius, seed) {
        const r = radius || 2.4;
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
                k = 0.70 + rand() * 0.52;
                verts.set(key, k);
            }
            pos.setXYZ(i, vx * k, vy * k * 0.88, vz * k);
        }
        const rock = bakePartGeo(geo, (seed & 1) ? 0x6e5b4f : 0x546070, false);
        const group = new THREE.Group();
        group.add(rock);
        if ((seed % 3) === 0) {
            const crystal = oct(r * 0.38, 0, (seed & 2) ? 0x3ef2ff : 0xff45a8, true);
            crystal.scale.set(0.6, 1.6, 0.6);
            crystal.position.set(r * 0.55, r * 0.35, 0);
            crystal.rotation.z = -0.6;
            group.add(crystal);
        }
        return group;
    }

    // ------------------------------------------------------------------ 8. Corneria Highway Arch Bridge / Fortress Gate
    function archway(theme) {
        const root = new THREE.Group();
        const col = theme === 'venom' ? 0x3d2c52 : 0x94a3b8;
        const dark = theme === 'venom' ? 0x241834 : 0x475569;
        const trim = theme === 'venom' ? 0xff3b6b : 0x38e8ff;
        const w = 13.6, h = 7.8;

        for (const s of [-1, 1]) {
            const pillar = box(2.4, h + 4, 2.8, col, false);
            pillar.position.set(s * (w / 2), h / 2 - 1.5, 0);
            const buttress = box(1.2, h, 3.6, dark, false);
            buttress.position.set(s * (w / 2 + 1.1), h / 2 - 1.5, 0);
            const beacon = oct(0.45, 0, trim, true);
            beacon.position.set(s * (w / 2), h + 1.6, 0);
            root.add(pillar, buttress, beacon);
        }

        const lintel = box(w + 4.2, 2.1, 3.2, col, false);
        lintel.position.set(0, h + 0.85, 0);
        const upperDeck = box(w + 4.6, 0.55, 3.6, dark, false);
        upperDeck.position.set(0, h + 2.05, 0);
        const strip = box(w - 1.2, 0.36, 3.3, trim, true);
        strip.position.set(0, h - 0.12, 0);
        root.add(lintel, upperDeck, strip);
        return root;
    }

    // ------------------------------------------------------------------ 9. Supply / Gold / Warp Ring & Pickups
    function ring(kind) {
        const root = new THREE.Group();
        const col = kind === 'gold' ? 0xffd238 : kind === 'warp' ? 0x45f2ff : 0xd8e6f8;
        const segs = 10, R = kind === 'warp' ? 3.3 : 2.45;
        for (let i = 0; i < segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            const seg = box(0.42, R * 0.64, 0.46, col, kind === 'gold' || kind === 'warp');
            seg.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
            seg.rotation.z = a;
            root.add(seg);
        }
        return root;
    }

    function pickup(kind) {
        const root = new THREE.Group();
        const col = kind === 'laser' ? 0x38e8ff : kind === 'bomb' ? 0xff4538 : 0x52ff8a;
        const core = oct(0.88, 0, col, true);
        const wingL = cone(0.35, 1.2, 4, 0xe8f2ff, false);
        wingL.rotation.z = Math.PI / 2;
        wingL.position.x = -0.95;
        const wingR = cone(0.35, 1.2, 4, 0xe8f2ff, false);
        wingR.rotation.z = -Math.PI / 2;
        wingR.position.x = 0.95;
        root.add(core, wingL, wingR);
        return root;
    }

    // ------------------------------------------------------------------ 10. Boss 1: Attack Carrier GORGON (Corneria)
    function bossGorgon() {
        const root = new THREE.Group();
        const hull = box(12.5, 3.0, 8.0, 0x4e5b70, false);
        const lowerHull = box(9.5, 1.6, 6.2, 0x323b4a, false);
        lowerHull.position.y = -2.0;
        const deck = box(7.8, 1.8, 5.4, 0x6a7a94, false);
        deck.position.set(0, 2.2, -0.4);
        const bridge = box(3.6, 1.5, 2.8, 0x8496b2, false);
        bridge.position.set(0, 3.6, -0.8);
        const bridgeWindow = box(2.8, 0.45, 0.3, 0x38f2ff, true);
        bridgeWindow.position.set(0, 3.7, 0.55);
        root.add(hull, lowerHull, deck, bridge, bridgeWindow);

        for (const s of [-1, 1]) {
            const wing = box(6.2, 1.6, 6.0, 0x3c4759, false);
            wing.position.set(s * 7.8, -0.1, 0.6);
            wing.rotation.y = s * 0.24;
            const cannon = cyl(0.28, 0.35, 3.2, 6, 0x242b38, false);
            cannon.rotation.x = Math.PI / 2;
            cannon.position.set(s * 8.6, 0.4, 3.6);
            const bay = box(2.6, 1.6, 1.3, 0xff7a28, true);
            bay.position.set(s * 4.4, -0.2, 3.8);
            bay.name = s < 0 ? 'bayL' : 'bayR';
            root.add(wing, cannon, bay);
        }

        const core = oct(2.05, 1, 0x3ef2ff, true);
        core.position.set(0, 0.1, 4.1);
        core.name = 'core';
        root.add(core);

        root.userData = { core };
        return root;
    }

    // ------------------------------------------------------------------ 11. Boss 2: Asteroid Crusher METORA (Meteo)
    function bossMetora() {
        const root = new THREE.Group();
        const body = cyl(4.0, 4.0, 7.0, 8, 0x4e4260, false);
        body.rotation.x = Math.PI / 2;
        root.add(body);

        const ringOuter = new THREE.Group();
        ringOuter.name = 'ringOuter';
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const blade = box(1.7, 3.1, 1.3, 0x8e78ad, false);
            blade.position.set(Math.cos(a) * 5.9, Math.sin(a) * 5.9, 0);
            blade.rotation.z = a;
            const emitter = oct(0.65, 0, 0x3ef2ff, true);
            emitter.position.set(Math.cos(a) * 4.5, Math.sin(a) * 4.5, 1.2);
            ringOuter.add(blade, emitter);
        }
        root.add(ringOuter);

        const core = oct(2.25, 1, 0xff3b8d, true);
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
        const cranium = ico(4.4, 1, 0x8c98ad, false);
        cranium.scale.set(0.96, 1.25, 0.88);
        head.add(cranium);

        const crown = cone(3.2, 2.4, 5, 0x5c667a, false);
        crown.position.set(0, 4.2, -0.2);
        head.add(crown);

        for (const s of [-1, 1]) {
            const brow = box(2.1, 0.55, 1.2, 0x464f61, false);
            brow.position.set(s * 1.6, 1.35, 3.1);
            brow.rotation.z = -s * 0.24;
            const eye = oct(0.92, 0, 0xff2845, true);
            eye.scale.set(1.45, 0.72, 0.65);
            eye.position.set(s * 1.58, 0.68, 3.32);
            head.add(brow, eye);
        }

        const jaw = box(3.6, 1.55, 2.8, 0x6c788c, false);
        jaw.position.set(0, -2.5, 1.7);
        jaw.name = 'jaw';
        head.add(jaw);

        const brainCore = oct(1.9, 1, 0x52ffcb, true);
        brainCore.position.set(0, 0.4, 2.8);
        brainCore.name = 'core';
        head.add(brainCore);
        root.add(head);

        const makeHand = (s) => {
            const hg = new THREE.Group();
            hg.position.set(s * 7.8, -1.2, 2.6);
            const palm = box(2.5, 2.7, 0.95, 0x9aa6ba, false);
            const palmCore = oct(0.82, 0, 0xff9a28, true);
            palmCore.position.z = 0.58;
            hg.add(palm, palmCore);
            for (let f = -1.5; f <= 1.5; f += 1) {
                const finger = box(0.45, 1.45, 0.48, 0x748096, false);
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
        bakePartGeo,
    };
})();
