// Starwing 64: 3D WebGL Renderer, Custom Sky Dome & Ocean Water Shaders,
// Scrolling 3D World Scenery (Mountains, City Skyline, Trench Walls, Nebula Planet),
// Dual-Kawase Bloom & Shockwave Post-Processing, 3D Shock Rings & Shatter Debris.
(function () {
    'use strict';
    const SW = window.SW = window.SW || {};
    const TAU = Math.PI * 2;
    const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

    function createGrade(renderer) {
        const isWebGL2 = renderer.capabilities && renderer.capabilities.isWebGL2;
        const floatType = (isWebGL2 || renderer.extensions.get('OES_texture_half_float')) ? THREE.HalfFloatType : THREE.UnsignedByteType;
        const rtOpts = { type: floatType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false };
        const bloomOpts = { type: floatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false };
        const size = new THREE.Vector2();
        renderer.getSize(size);
        const pr = renderer.getPixelRatio();
        const w = Math.max(1, Math.round(size.x * pr));
        const h = Math.max(1, Math.round(size.y * pr));
        const rt = new THREE.WebGLRenderTarget(w, h, rtOpts);
        const bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
        const b2w = Math.max(1, w >> 2), b2h = Math.max(1, h >> 2);
        const rtBright = new THREE.WebGLRenderTarget(bw, bh, bloomOpts);
        const rtDown = new THREE.WebGLRenderTarget(b2w, b2h, bloomOpts);
        const rtBlur = new THREE.WebGLRenderTarget(bw, bh, bloomOpts);
        const scene = new THREE.Scene();
        const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const quadGeo = new THREE.PlaneGeometry(2, 2);

        const brightMat = new THREE.ShaderMaterial({
            uniforms: { tScene: { value: rt.texture }, uTexel: { value: new THREE.Vector2(1 / w, 1 / h) } },
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
            fragmentShader: [
                'precision highp float;',
                'varying vec2 vUv;',
                'uniform sampler2D tScene;',
                'uniform vec2 uTexel;',
                'void main(){',
                '  vec3 c = texture2D(tScene, vUv).rgb * 0.25;',
                '  c += texture2D(tScene, vUv + vec2(uTexel.x, uTexel.y)).rgb * 0.1875;',
                '  c += texture2D(tScene, vUv + vec2(-uTexel.x, uTexel.y)).rgb * 0.1875;',
                '  c += texture2D(tScene, vUv + vec2(uTexel.x, -uTexel.y)).rgb * 0.1875;',
                '  c += texture2D(tScene, vUv + vec2(-uTexel.x, -uTexel.y)).rgb * 0.1875;',
                '  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));',
                '  float knee = smoothstep(0.58, 1.12, lum);',
                '  gl_FragColor = vec4(c * knee * 1.25, 1.0);',
                '}',
            ].join('\n'),
            depthTest: false, depthWrite: false,
        });

        const blurMat = new THREE.ShaderMaterial({
            uniforms: { tTex: { value: null }, uTexel: { value: new THREE.Vector2(1 / bw, 1 / bh) } },
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
            fragmentShader: [
                'precision highp float;',
                'varying vec2 vUv;',
                'uniform sampler2D tTex;',
                'uniform vec2 uTexel;',
                'void main(){',
                '  vec2 d = uTexel * 1.55;',
                '  vec3 s = texture2D(tTex, vUv).rgb * 0.28;',
                '  s += texture2D(tTex, vUv + vec2(d.x, d.y)).rgb * 0.18;',
                '  s += texture2D(tTex, vUv + vec2(-d.x, d.y)).rgb * 0.18;',
                '  s += texture2D(tTex, vUv + vec2(d.x, -d.y)).rgb * 0.18;',
                '  s += texture2D(tTex, vUv + vec2(-d.x, -d.y)).rgb * 0.18;',
                '  gl_FragColor = vec4(s, 1.0);',
                '}',
            ].join('\n'),
            depthTest: false, depthWrite: false,
        });

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                tScene: { value: rt.texture },
                tBloom: { value: rtBlur.texture },
                uRipple: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] },
                uAspect: { value: w / Math.max(1, h) },
                uBoost: { value: 0 },
            },
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
            fragmentShader: [
                'precision highp float;',
                'varying vec2 vUv;',
                'uniform sampler2D tScene;',
                'uniform sampler2D tBloom;',
                'uniform vec4 uRipple[4];',
                'uniform float uAspect;',
                'uniform float uBoost;',
                'void main(){',
                '  vec2 uv = vUv;',
                '  vec2 warp = vec2(0.0);',
                '  for (int i = 0; i < 4; i++) {',
                '    vec4 rp = uRipple[i];',
                '    if (rp.w > 0.0001) {',
                '      vec2 d = uv - rp.xy;',
                '      d.x *= uAspect;',
                '      float dist = length(d);',
                '      float band = exp(-pow((dist - rp.z) / max(0.018, rp.z * 0.32), 2.0));',
                '      vec2 dir = dist > 0.0001 ? normalize(d) : vec2(0.0);',
                '      warp += dir * band * rp.w;',
                '    }',
                '  }',
                '  vec2 cUv = clamp(uv + warp, vec2(0.001), vec2(0.999));',
                '  vec2 edge = uv - 0.5;',
                '  float r2 = dot(edge, edge);',
                '  float ca = length(warp) * 0.55 + r2 * (0.003 + uBoost * 0.012);',
                '  vec2 caDir = normalize(edge + vec2(1e-5)) * ca;',
                '  vec3 col;',
                '  col.r = texture2D(tScene, clamp(cUv + caDir, vec2(0.001), vec2(0.999))).r;',
                '  col.g = texture2D(tScene, cUv).g;',
                '  col.b = texture2D(tScene, clamp(cUv - caDir, vec2(0.001), vec2(0.999))).b;',
                '  vec3 bloom = texture2D(tBloom, cUv).rgb;',
                '  col += bloom * 0.78;',
                '  col *= 1.05;',
                '  float vig = smoothstep(0.95, 0.24, r2);',
                '  col *= mix(0.76, 1.04, vig);',
                '  col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));',
                '  gl_FragColor = vec4(col, 1.0);',
                '}',
            ].join('\n'),
            depthTest: false, depthWrite: false,
        });

        const quad = new THREE.Mesh(quadGeo, mat);
        scene.add(quad);

        return {
            setSize() {
                renderer.getSize(size);
                const p = renderer.getPixelRatio();
                const nw = Math.max(1, Math.round(size.x * p));
                const nh = Math.max(1, Math.round(size.y * p));
                rt.setSize(nw, nh);
                const nbw = Math.max(1, nw >> 1), nbh = Math.max(1, nh >> 1);
                const nb2w = Math.max(1, nw >> 2), nb2h = Math.max(1, nh >> 2);
                rtBright.setSize(nbw, nbh);
                rtDown.setSize(nb2w, nb2h);
                rtBlur.setSize(nbw, nbh);
                brightMat.uniforms.uTexel.value.set(1 / nw, 1 / nh);
                blurMat.uniforms.uTexel.value.set(1 / nbw, 1 / nbh);
                mat.uniforms.uAspect.value = nw / Math.max(1, nh);
            },
            setRipples(list, boost) {
                const arr = mat.uniforms.uRipple.value;
                for (let i = 0; i < 4; i++) {
                    const src = list && list[i];
                    if (src) arr[i].set(src[0], src[1], src[2], src[3]);
                    else arr[i].set(0, 0, 0, 0);
                }
                mat.uniforms.uBoost.value = boost || 0;
            },
            render(mainScene, mainCam) {
                const prev = renderer.getRenderTarget();
                const prevAuto = renderer.autoClear;
                renderer.autoClear = true;
                renderer.setRenderTarget(rt);
                renderer.clear(true, true, false);
                renderer.render(mainScene, mainCam);

                quad.material = brightMat;
                renderer.setRenderTarget(rtBright);
                renderer.render(scene, cam);

                quad.material = blurMat;
                blurMat.uniforms.tTex.value = rtBright.texture;
                blurMat.uniforms.uTexel.value.set(1 / Math.max(1, rtBright.width), 1 / Math.max(1, rtBright.height));
                renderer.setRenderTarget(rtDown);
                renderer.render(scene, cam);

                blurMat.uniforms.tTex.value = rtDown.texture;
                blurMat.uniforms.uTexel.value.set(1 / Math.max(1, rtDown.width), 1 / Math.max(1, rtDown.height));
                renderer.setRenderTarget(rtBlur);
                renderer.render(scene, cam);

                quad.material = mat;
                renderer.setRenderTarget(prev);
                renderer.render(scene, cam);
                renderer.autoClear = prevAuto;
            },
        };
    }

    function radialTex(inner, outer) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d');
        const grd = g.createRadialGradient(32, 32, 1, 32, 32, 32);
        grd.addColorStop(0, inner);
        grd.addColorStop(1, outer);
        g.fillStyle = grd;
        g.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
    }

    class Renderer {
        constructor(container, canvas, hud) {
            this.container = container;
            this.canvas = canvas;
            this.hud = hud;
            this.hctx = hud.getContext('2d');

            const gl = this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
            gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            gl.outputEncoding = THREE.sRGBEncoding;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.12;
            gl.shadowMap.enabled = true;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;

            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x0b162c);
            this.scene.fog = new THREE.FogExp2(0x4ea8de, 0.0028);

            this.camera = new THREE.PerspectiveCamera(58, 1.6, 0.3, 550);
            this.hemi = new THREE.HemisphereLight(0xdff4ff, 0x243b4a, 0.92);
            this.scene.add(this.hemi);

            const sun = this.sun = new THREE.DirectionalLight(0xfff5e0, 1.45);
            sun.position.set(45, 95, 55);
            sun.castShadow = true;
            sun.shadow.mapSize.set(1536, 1536);
            sun.shadow.bias = -0.0005;
            const sc = sun.shadow.camera;
            sc.near = 10; sc.far = 240;
            sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50;
            this.scene.add(sun);
            this.scene.add(sun.target);

            this.worldGroup = new THREE.Group();
            this.fxGroup = new THREE.Group();
            this.scene.add(this.worldGroup, this.fxGroup);

            this.glowTex = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
            this.shadowTex = radialTex('rgba(0,0,0,0.68)', 'rgba(0,0,0,0)');

            // Instanced 3D faceted shatter debris
            const dGeo = new THREE.OctahedronGeometry(0.32, 0);
            dGeo.scale(1.35, 0.52, 0.95);
            this.debrisMesh = new THREE.InstancedMesh(dGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.45, flatShading: true }), 260);
            this.debrisMesh.count = 0;
            this.debrisMesh.frustumCulled = false;
            this.debrisMesh.setColorAt(0, new THREE.Color(1, 1, 1));
            this.fxGroup.add(this.debrisMesh);
            this.debrisList = [];

            // Instanced Spark / Explosion / Wake / Wingtip Contrail Spheres
            const pGeo = new THREE.SphereGeometry(0.34, 6, 5);
            this.sparkMesh = new THREE.InstancedMesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 420);
            this.sparkMesh.count = 0;
            this.sparkMesh.frustumCulled = false;
            this.sparkMesh.setColorAt(0, new THREE.Color(1, 1, 1));
            this.fxGroup.add(this.sparkMesh);
            this.sparks = [];

            // 3D Expanding Plasma Shockwave Rings on explosions
            const ringGeo = new THREE.RingGeometry(0.65, 1.0, 24);
            this.shockRingMesh = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({
                color: 0xffffff,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.85,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                toneMapped: false,
            }), 32);
            this.shockRingMesh.count = 0;
            this.shockRingMesh.frustumCulled = false;
            this.shockRingMesh.setColorAt(0, new THREE.Color(1, 1, 1));
            this.fxGroup.add(this.shockRingMesh);
            this.shockRings = [];

            // Contact shadows on Corneria / Venom floor
            const shGeo = new THREE.PlaneGeometry(1, 1); shGeo.rotateX(-Math.PI / 2);
            this.shadowMesh = new THREE.InstancedMesh(shGeo, new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, opacity: 0.65, depthWrite: false }), 80);
            this.shadowMesh.count = 0;
            this.shadowMesh.frustumCulled = false;
            this.fxGroup.add(this.shadowMesh);

            this.ripples = [];
            try { this.grade = createGrade(gl); } catch (e) { this.grade = null; }

            this.time = 0;
            this.boostK = 0;
            this.sector = 'corneria';
            this.groundPlane = null;
            this.waterMat = null;
            this.skyDome = null;
            this.starPoints = null;
            this.sceneryItems = [];
            this.resize();
        }

        resize() {
            const r = this.container.getBoundingClientRect();
            const w = Math.max(1, Math.round(r.width || window.innerWidth));
            const h = Math.max(1, Math.round(r.height || window.innerHeight));
            this.width = w;
            this.height = h;
            this.gl.setSize(w, h, false);
            if (this.grade) this.grade.setSize();
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.hudPr = Math.min(window.devicePixelRatio || 1, 2);
            this.hud.width = Math.round(w * this.hudPr);
            this.hud.height = Math.round(h * this.hudPr);
            this.hud.style.width = w + 'px';
            this.hud.style.height = h + 'px';
        }

        // Build procedural 3D scenery prop for scrolling corridor
        buildSceneryProp(sector, index) {
            const B = SW.Models.bakePartGeo;
            const g = new THREE.Group();
            const side = (index % 2 === 0) ? -1 : 1;

            if (sector === 'corneria') {
                const kind = index % 4;
                if (kind === 0) {
                    // Emerald Low-Poly Coastal Mountain Peak + Snow Cap
                    const h = 18 + (index % 5) * 6;
                    const r = 11 + (index % 4) * 3.5;
                    const mtn = B(new THREE.ConeGeometry(r, h, 6), 0x2d7a58, false);
                    mtn.position.y = h * 0.5 - 6.2;
                    const cap = B(new THREE.ConeGeometry(r * 0.42, h * 0.36, 6), 0xebf5ff, false);
                    cap.position.y = h * 0.82 - 6.2;
                    const sub = B(new THREE.ConeGeometry(r * 0.7, h * 0.6, 5), 0x388e66, false);
                    sub.position.set(-side * r * 0.45, h * 0.3 - 6.2, 4);
                    g.add(mtn, cap, sub);
                    g.userData = { baseX: side * (24 + (index % 3) * 10), baseY: 0 };
                } else if (kind === 1) {
                    // Corneria Futuristic Monolith City Skyscraper + Glowing Spire
                    const h = 16 + (index % 4) * 5;
                    const w = 4.2 + (index % 3) * 1.2;
                    const tower = B(new THREE.BoxGeometry(w, h, w), 0xd8e4f2, false);
                    tower.position.y = h * 0.5 - 6.0;
                    const crown = B(new THREE.BoxGeometry(w * 0.72, 3.2, w * 0.72), 0x2668e8, false);
                    crown.position.y = h - 4.5;
                    const strip = B(new THREE.BoxGeometry(w * 1.04, 0.55, w * 1.04), 0x3ef2ff, true);
                    strip.position.y = h - 5.8;
                    const beacon = B(new THREE.OctahedronGeometry(0.55, 0), 0x3ef2ff, true);
                    beacon.position.y = h - 2.2;
                    g.add(tower, crown, strip, beacon);
                    g.userData = { baseX: side * (18 + (index % 3) * 6), baseY: 0 };
                } else if (kind === 2) {
                    // Volumetric Low-Poly Cloud Cluster high in the sky
                    for (let c = 0; c < 3; c++) {
                        const puff = B(new THREE.IcosahedronGeometry(3.2 - c * 0.6, 1), 0xf4faff, false);
                        puff.scale.set(1.7, 0.52, 1.1);
                        puff.position.set((c - 1) * 3.4, c * 0.4, (c % 2) * 1.5);
                        g.add(puff);
                    }
                    g.userData = { baseX: side * (10 + (index % 4) * 8), baseY: 11 + (index % 3) * 3.5 };
                } else {
                    // Coastal Island Mesa + Radar Dish
                    const isle = B(new THREE.CylinderGeometry(6.5, 9.5, 2.6, 7), 0x3d9468, false);
                    isle.position.y = -4.9;
                    const sand = B(new THREE.CylinderGeometry(9.6, 11.2, 0.6, 7), 0xe6d296, false);
                    sand.position.y = -5.8;
                    const dish = B(new THREE.ConeGeometry(2.2, 1.5, 6), 0xe8f0fa, false);
                    dish.rotation.x = -0.6;
                    dish.position.y = -2.6;
                    g.add(sand, isle, dish);
                    g.userData = { baseX: side * (16 + (index % 3) * 7), baseY: 0 };
                }
            } else if (sector === 'meteo') {
                // Deep Space Giant Asteroids, Crystal Clusters & Space Station Ribs
                if (index % 5 === 0) {
                    const R = 24;
                    const seg = B(new THREE.BoxGeometry(2.2, 14, 2.6), 0x4a566e, false);
                    seg.position.set(side * R, 2, 0);
                    seg.rotation.z = side * 0.35;
                    const light = B(new THREE.BoxGeometry(0.6, 10, 0.8), 0x3ef2ff, true);
                    light.position.set(side * (R - 1.1), 2, 0);
                    light.rotation.z = side * 0.35;
                    g.add(seg, light);
                    g.userData = { baseX: 0, baseY: 0, spin: 0 };
                } else {
                    const r = 3.5 + (index % 4) * 2.2;
                    const rock = SW.Models.asteroid(r, index * 37 + 11);
                    g.add(rock);
                    g.userData = {
                        baseX: side * (15 + (index % 5) * 7),
                        baseY: ((index % 7) - 3) * 4.2,
                        spin: (index % 2 === 0 ? 1 : -1) * 0.45,
                    };
                }
            } else {
                // Venom: Armored Canyon Trench Buttresses, Plasma Conduits & Searchlight Towers
                const h = 24 + (index % 3) * 6;
                const wall = B(new THREE.BoxGeometry(8, h, 10), 0x2c1d3d, false);
                wall.position.y = h * 0.5 - 6.2;
                const rib = B(new THREE.BoxGeometry(9.2, h * 0.85, 2.4), 0x422b5c, false);
                rib.position.y = h * 0.42 - 6.2;
                const conduit = B(new THREE.BoxGeometry(0.45, h * 0.72, 1.2), (index % 3 === 0) ? 0x3ef2ff : 0xff2e6b, true);
                conduit.position.set(-side * 4.15, h * 0.42 - 6.2, 0);
                g.add(wall, rib, conduit);
                g.userData = { baseX: side * (20 + (index % 2) * 3.5), baseY: 0 };
            }

            return g;
        }

        setupSectorEnv(sector) {
            this.sector = sector;
            if (this.envGroup) {
                this.scene.remove(this.envGroup);
            }
            this.envGroup = new THREE.Group();
            this.scene.add(this.envGroup);
            this.groundPlane = null;
            this.waterMat = null;
            this.starPoints = null;
            this.sceneryItems = [];

            // 1. Custom Procedural Atmospheric / Space Sky Dome Shader
            const skyGeo = new THREE.SphereGeometry(420, 32, 20);
            const isCorneria = sector === 'corneria' ? 1.0 : 0.0;
            const isMeteo = sector === 'meteo' ? 1.0 : 0.0;
            this.skyMat = new THREE.ShaderMaterial({
                side: THREE.BackSide,
                depthWrite: false,
                uniforms: {
                    uTime: { value: 0 },
                    uMode: { value: isCorneria > 0.5 ? 0.0 : isMeteo > 0.5 ? 1.0 : 2.0 },
                },
                vertexShader: [
                    'varying vec3 vDir;',
                    'void main() {',
                    '  vDir = normalize(position);',
                    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                    '}',
                ].join('\n'),
                fragmentShader: [
                    'precision highp float;',
                    'varying vec3 vDir;',
                    'uniform float uTime;',
                    'uniform float uMode;',
                    'void main() {',
                    '  vec3 d = normalize(vDir);',
                    '  float y = clamp(d.y, -1.0, 1.0);',
                    '  vec3 col;',
                    '  if (uMode < 0.5) {',
                    '    // Corneria: Deep azure zenith -> cyan mid-sky -> warm golden-peach horizon + blazing sun disc',
                    '    vec3 zenith = vec3(0.06, 0.24, 0.58);',
                    '    vec3 mid = vec3(0.24, 0.62, 0.92);',
                    '    vec3 horiz = vec3(0.78, 0.92, 1.0);',
                    '    col = mix(horiz, mid, smoothstep(-0.05, 0.28, y));',
                    '    col = mix(col, zenith, smoothstep(0.22, 0.85, y));',
                    '    vec3 sunDir = normalize(vec3(0.32, 0.24, -0.92));',
                    '    float sunDot = max(0.0, dot(d, sunDir));',
                    '    col += vec3(1.0, 0.82, 0.48) * pow(sunDot, 14.0) * 0.55;',
                    '    col += vec3(1.0, 0.98, 0.9) * smoothstep(0.994, 0.9985, sunDot) * 2.2;',
                    '  } else if (uMode < 1.5) {',
                    '    // Meteo: Deep cosmos with glowing cyan/magenta nebula bands',
                    '    vec3 bg = vec3(0.015, 0.025, 0.07);',
                    '    float n1 = sin(d.x * 4.5 + d.y * 3.0 + uTime * 0.05) * cos(d.z * 3.5 - d.y * 4.0);',
                    '    float neb = smoothstep(0.0, 0.75, n1) * (1.0 - abs(y) * 0.65);',
                    '    col = bg + vec3(0.08, 0.32, 0.58) * neb + vec3(0.42, 0.08, 0.45) * pow(neb, 2.0);',
                    '  } else {',
                    '    // Venom: Stormy crimson-violet toxic atmosphere with horizon plasma glow',
                    '    vec3 zenith = vec3(0.06, 0.02, 0.11);',
                    '    vec3 mid = vec3(0.24, 0.05, 0.22);',
                    '    vec3 horiz = vec3(0.85, 0.18, 0.35);',
                    '    col = mix(horiz, mid, smoothstep(-0.06, 0.32, y));',
                    '    col = mix(col, zenith, smoothstep(0.25, 0.85, y));',
                    '    float pulse = 0.5 + 0.5 * sin(uTime * 2.5 + d.x * 6.0);',
                    '    col += vec3(0.95, 0.25, 0.45) * exp(-abs(y) * 9.0) * (0.25 + 0.15 * pulse);',
                    '  }',
                    '  gl_FragColor = vec4(col, 1.0);',
                    '}',
                ].join('\n'),
            });
            this.skyDome = new THREE.Mesh(skyGeo, this.skyMat);
            this.envGroup.add(this.skyDome);

            if (sector === 'corneria') {
                this.scene.fog = new THREE.FogExp2(0x68b8eb, 0.0032);
                this.hemi.color.setHex(0xe2f5ff);
                this.hemi.groundColor.setHex(0x28624b);
                this.sun.color.setHex(0xfff6e0);

                // Custom Animated GLSL Ocean Water Shader with Sun Specular Glint, Waves & Tactical Grid
                const gGeo = new THREE.PlaneGeometry(1200, 1200, 1, 1);
                gGeo.rotateX(-Math.PI / 2);
                this.waterMat = new THREE.ShaderMaterial({
                    uniforms: {
                        uTime: { value: 0 },
                        uScrollZ: { value: 0 },
                        uMode: { value: 0.0 },
                    },
                    vertexShader: [
                        'varying vec3 vWorldPos;',
                        'void main() {',
                        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
                        '  vWorldPos = wp.xyz;',
                        '  gl_Position = projectionMatrix * viewMatrix * wp;',
                        '}',
                    ].join('\n'),
                    fragmentShader: [
                        'precision highp float;',
                        'varying vec3 vWorldPos;',
                        'uniform float uTime;',
                        'uniform float uScrollZ;',
                        'uniform float uMode;',
                        'void main() {',
                        '  vec2 p = vec2(vWorldPos.x, vWorldPos.z - uScrollZ);',
                        '  float dist = length(vWorldPos.xz);',
                        '  float fade = exp(-dist * 0.0042);',
                        '  if (uMode < 0.5) {',
                        '    // Corneria Ocean Waves + Sun Glint + Foam + Horizon Fog',
                        '    float w1 = sin(p.x * 0.35 + p.y * 0.22 + uTime * 2.4);',
                        '    float w2 = cos(p.x * 0.62 - p.y * 0.48 + uTime * 3.1);',
                        '    float w3 = sin((p.x + p.y) * 1.15 - uTime * 4.2);',
                        '    float wave = (w1 + w2 * 0.6 + w3 * 0.35) / 1.95;',
                        '    vec3 deep = vec3(0.04, 0.25, 0.52);',
                        '    vec3 shallow = vec3(0.10, 0.48, 0.78);',
                        '    vec3 col = mix(deep, shallow, wave * 0.5 + 0.5);',
                        '    float foam = smoothstep(0.58, 0.88, wave);',
                        '    col = mix(col, vec3(0.78, 0.95, 1.0), foam * 0.42);',
                        '    // Sun reflection path along the water',
                        '    float sunPath = exp(-pow((vWorldPos.x - 18.0) * 0.045, 2.0));',
                        '    float glint = smoothstep(0.35, 0.85, wave) * sunPath;',
                        '    col += vec3(1.0, 0.92, 0.72) * glint * 0.68;',
                        '    // Subtle holographic horizon grid lines',
                        '    vec2 g = abs(fract(p * 0.08) - 0.5);',
                        '    float line = 1.0 - smoothstep(0.0, 0.035, min(g.x, g.y));',
                        '    col += vec3(0.25, 0.82, 1.0) * line * 0.14 * fade;',
                        '    vec3 fogCol = vec3(0.58, 0.84, 0.98);',
                        '    col = mix(fogCol, col, fade);',
                        '    gl_FragColor = vec4(col, 1.0);',
                        '  } else {',
                        '    // Venom Fortress Floor + Molten Plasma Channels',
                        '    vec2 g = abs(fract(p * 0.075) - 0.5);',
                        '    float line = 1.0 - smoothstep(0.0, 0.045, min(g.x, g.y));',
                        '    float pulse = 0.65 + 0.35 * sin(p.y * 0.12 + uTime * 4.0);',
                        '    vec3 base = vec3(0.09, 0.04, 0.14);',
                        '    vec3 neon = mix(vec3(1.0, 0.15, 0.42), vec3(0.25, 0.92, 1.0), smoothstep(-14.0, 14.0, vWorldPos.x));',
                        '    vec3 col = base + neon * line * 0.55 * pulse * fade;',
                        '    vec3 fogCol = vec3(0.22, 0.06, 0.25);',
                        '    col = mix(fogCol, col, fade);',
                        '    gl_FragColor = vec4(col, 1.0);',
                        '  }',
                        '}',
                    ].join('\n'),
                });
                this.groundPlane = new THREE.Mesh(gGeo, this.waterMat);
                this.groundPlane.position.y = -6.0;
                this.envGroup.add(this.groundPlane);
            } else if (sector === 'meteo') {
                this.scene.fog = new THREE.FogExp2(0x090e24, 0.0026);
                this.hemi.color.setHex(0xa8ccff);
                this.hemi.groundColor.setHex(0x221638);
                this.sun.color.setHex(0xe8f2ff);

                // Giant Distant Ringed Planet in Meteo Sky
                const planetGroup = new THREE.Group();
                planetGroup.position.set(-65, 38, -260);
                const planet = SW.Models.bakePartGeo(new THREE.IcosahedronGeometry(36, 2), 0x3b6ee8, false);
                const ringGeo = new THREE.RingGeometry(48, 72, 32);
                ringGeo.rotateX(Math.PI * 0.38);
                ringGeo.rotateY(0.25);
                const pRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
                    color: 0x62e8ff,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.38,
                }));
                planetGroup.add(planet, pRing);
                this.envGroup.add(planetGroup);

                // Rich Multi-Color Starfield
                const starGeo = new THREE.BufferGeometry();
                const count = 1800;
                const pos = new Float32Array(count * 3);
                const col = new Float32Array(count * 3);
                for (let i = 0; i < count; i++) {
                    pos[i * 3]     = (Math.random() - 0.5) * 520;
                    pos[i * 3 + 1] = (Math.random() - 0.5) * 320;
                    pos[i * 3 + 2] = (Math.random() - 0.5) * 520;
                    const c = Math.random() < 0.35 ? [0.55, 0.88, 1.0] : Math.random() < 0.6 ? [1.0, 0.82, 0.62] : [1, 1, 1];
                    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
                }
                starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
                this.starPoints = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, transparent: true, opacity: 0.95, toneMapped: false }));
                this.envGroup.add(this.starPoints);
            } else {
                // Venom Trench / Core
                this.scene.fog = new THREE.FogExp2(0x280b30, 0.0034);
                this.hemi.color.setHex(0xffa8cc);
                this.hemi.groundColor.setHex(0x260934);
                this.sun.color.setHex(0xffd6e6);

                const gGeo = new THREE.PlaneGeometry(1200, 1200, 1, 1);
                gGeo.rotateX(-Math.PI / 2);
                this.waterMat = new THREE.ShaderMaterial({
                    uniforms: {
                        uTime: { value: 0 },
                        uScrollZ: { value: 0 },
                        uMode: { value: 1.0 },
                    },
                    vertexShader: [
                        'varying vec3 vWorldPos;',
                        'void main() {',
                        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
                        '  vWorldPos = wp.xyz;',
                        '  gl_Position = projectionMatrix * viewMatrix * wp;',
                        '}',
                    ].join('\n'),
                    fragmentShader: [
                        'precision highp float;',
                        'varying vec3 vWorldPos;',
                        'uniform float uTime;',
                        'uniform float uScrollZ;',
                        'void main() {',
                        '  vec2 p = vec2(vWorldPos.x, vWorldPos.z - uScrollZ);',
                        '  float dist = length(vWorldPos.xz);',
                        '  float fade = exp(-dist * 0.0042);',
                        '  vec2 g = abs(fract(p * 0.075) - 0.5);',
                        '  float line = 1.0 - smoothstep(0.0, 0.045, min(g.x, g.y));',
                        '  float pulse = 0.65 + 0.35 * sin(p.y * 0.12 + uTime * 4.0);',
                        '  vec3 base = vec3(0.09, 0.04, 0.14);',
                        '  vec3 neon = mix(vec3(1.0, 0.15, 0.42), vec3(0.25, 0.92, 1.0), smoothstep(-14.0, 14.0, vWorldPos.x));',
                        '  vec3 col = base + neon * line * 0.58 * pulse * fade;',
                        '  vec3 fogCol = vec3(0.18, 0.05, 0.22);',
                        '  col = mix(fogCol, col, fade);',
                        '  gl_FragColor = vec4(col, 1.0);',
                        '}',
                    ].join('\n'),
                });
                this.groundPlane = new THREE.Mesh(gGeo, this.waterMat);
                this.groundPlane.position.y = -6.0;
                this.envGroup.add(this.groundPlane);
            }

            // 3. Populate 36 Scrolling 3D Corridor Scenery Objects (Mountains, Towers, Clouds, Asteroids, Trench Walls)
            const totalProps = 36;
            const spanZ = 250;
            for (let i = 0; i < totalProps; i++) {
                const prop = this.buildSceneryProp(sector, i);
                const z = 15 - (i / totalProps) * spanZ;
                prop.position.set(prop.userData.baseX || 0, prop.userData.baseY || 0, z);
                this.envGroup.add(prop);
                this.sceneryItems.push(prop);
            }
        }

        emitSpark(x, y, z, vx, vy, vz, life, s0, s1, hex, gravity) {
            if (this.sparks.length >= 420) this.sparks.shift();
            this.sparks.push({ x, y, z, vx, vy, vz, t: 0, life: life || 0.45, s0: s0 || 0.45, s1: s1 || 0.05, hex: hex || 0xffb84d, g: gravity || 0 });
        }

        emitShockRing(x, y, z, maxScale, hex, dur) {
            if (this.shockRings.length >= 32) this.shockRings.shift();
            this.shockRings.push({
                x, y, z,
                maxScale: maxScale || 6.5,
                hex: hex || 0x52f2ff,
                dur: dur || 0.48,
                t: 0,
                rx: (Math.random() - 0.5) * 0.6,
                ry: (Math.random() - 0.5) * 0.6,
            });
        }

        debrisBurst(x, y, z, count, speed, hex1, hex2) {
            for (let i = 0; i < count; i++) {
                if (this.debrisList.length >= 260) this.debrisList.shift();
                const a = Math.random() * TAU, el = (Math.random() - 0.3) * Math.PI;
                const sp = (0.4 + Math.random() * 0.85) * (speed || 13);
                const col = (i % 3 === 0) ? (hex1 || 0x7a8ca6) : (i % 3 === 1) ? (hex2 || 0xff7a28) : 0x2b3442;
                this.debrisList.push({
                    x, y, z,
                    vx: Math.cos(a) * Math.cos(el) * sp,
                    vy: Math.sin(el) * sp + 3.5,
                    vz: Math.sin(a) * Math.cos(el) * sp,
                    rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
                    spin: (Math.random() - 0.5) * 18,
                    t: 0, life: 0.95 + Math.random() * 0.85,
                    s: 0.7 + Math.random() * 1.4,
                    col,
                });
            }
        }

        explosion(x, y, z, scale, colorHex, ripple) {
            const s = scale || 1;
            const c1 = colorHex || 0xff9a38;
            // Core white flash + radial plasma fireball particles
            this.emitSpark(x, y, z, 0, 0, 0, 0.22, 2.4 * s, 0.2, 0xffffff, 0);
            this.emitShockRing(x, y, z, 5.5 * s, c1, 0.45);
            if (s > 1.3) {
                this.emitShockRing(x, y, z, 9.0 * s, 0x52f2ff, 0.62);
            }
            for (let i = 0; i < Math.round(22 * s); i++) {
                const a = Math.random() * TAU, el = (Math.random() - 0.5) * Math.PI;
                const sp = (4 + Math.random() * 16) * s;
                this.emitSpark(
                    x, y, z,
                    Math.cos(a) * Math.cos(el) * sp,
                    Math.sin(el) * sp,
                    Math.sin(a) * Math.cos(el) * sp,
                    0.34 + Math.random() * 0.38,
                    0.85 * s, 0.08,
                    i % 3 === 0 ? 0xffffff : i % 2 === 0 ? c1 : 0xff4518,
                    2.0
                );
            }
            this.debrisBurst(x, y, z, Math.round(12 * s), 12 * s, 0x94a6bd, c1);
            if (ripple) {
                this.addRipple(x, y, z, 8 * s, 0.024 * Math.min(2, s), 0.55);
            }
        }

        addRipple(x, y, z, radius, strength, dur) {
            if (this.ripples.length >= 4) this.ripples.shift();
            this.ripples.push({ x, y, z, radius: radius || 8, strength: strength || 0.02, dur: dur || 0.5, t: 0 });
        }

        updateVfx(dt, anchorPos) {
            this.time += dt;
            const scrollSpeed = 52 * (1 + this.boostK * 0.65);

            if (this.skyMat) {
                this.skyMat.uniforms.uTime.value = this.time;
            }
            if (this.waterMat) {
                this.waterMat.uniforms.uTime.value = this.time;
                this.waterMat.uniforms.uScrollZ.value = anchorPos ? anchorPos.z : -this.time * 42;
            }

            // Scroll 3D corridor scenery props past camera for high-speed depth perception
            for (let i = 0; i < this.sceneryItems.length; i++) {
                const item = this.sceneryItems[i];
                item.position.z += scrollSpeed * dt;
                if (item.userData && item.userData.spin) {
                    item.rotation.x += item.userData.spin * dt;
                    item.rotation.y += item.userData.spin * 0.7 * dt;
                }
                if (item.position.z > 22) {
                    item.position.z -= 250;
                }
            }

            if (this.starPoints) {
                this.starPoints.rotation.z += dt * 0.02;
            }

            const tmpM = new THREE.Matrix4();
            const tmpV = new THREE.Vector3();
            const tmpQ = new THREE.Quaternion();
            const tmpS = new THREE.Vector3();
            const tmpC = new THREE.Color();

            // Update sparks & contrails
            for (let i = this.sparks.length - 1; i >= 0; i--) {
                const p = this.sparks[i];
                p.t += dt;
                if (p.t >= p.life) { this.sparks.splice(i, 1); continue; }
                p.vy -= p.g * dt;
                p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
            }
            this.sparkMesh.count = this.sparks.length;
            for (let i = 0; i < this.sparks.length; i++) {
                const p = this.sparks[i];
                const k = p.t / p.life;
                const sc = p.s0 + (p.s1 - p.s0) * k;
                tmpV.set(p.x, p.y, p.z); tmpQ.identity(); tmpS.setScalar(Math.max(0.02, sc));
                tmpM.compose(tmpV, tmpQ, tmpS);
                this.sparkMesh.setMatrixAt(i, tmpM);
                tmpC.setHex(p.hex).multiplyScalar(1 - k * 0.65);
                this.sparkMesh.setColorAt(i, tmpC);
            }
            this.sparkMesh.instanceMatrix.needsUpdate = true;
            if (this.sparkMesh.instanceColor && this.sparks.length > 0) this.sparkMesh.instanceColor.needsUpdate = true;

            // Update 3D Expanding Shockwave Rings
            for (let i = this.shockRings.length - 1; i >= 0; i--) {
                const r = this.shockRings[i];
                r.t += dt;
                if (r.t >= r.dur) { this.shockRings.splice(i, 1); continue; }
            }
            this.shockRingMesh.count = this.shockRings.length;
            for (let i = 0; i < this.shockRings.length; i++) {
                const r = this.shockRings[i];
                const k = r.t / r.dur;
                const sc = 0.4 + r.maxScale * (1 - Math.pow(1 - k, 2.2));
                tmpV.set(r.x, r.y, r.z);
                tmpQ.setFromEuler(new THREE.Euler(r.rx, r.ry, r.t * 4));
                tmpS.setScalar(sc);
                tmpM.compose(tmpV, tmpQ, tmpS);
                this.shockRingMesh.setMatrixAt(i, tmpM);
                tmpC.setHex(r.hex).multiplyScalar(1 - k);
                this.shockRingMesh.setColorAt(i, tmpC);
            }
            this.shockRingMesh.instanceMatrix.needsUpdate = true;
            if (this.shockRingMesh.instanceColor && this.shockRings.length > 0) this.shockRingMesh.instanceColor.needsUpdate = true;

            // Update 3D debris
            for (let i = this.debrisList.length - 1; i >= 0; i--) {
                const d = this.debrisList[i];
                d.t += dt;
                if (d.t >= d.life) { this.debrisList.splice(i, 1); continue; }
                d.vy -= 14 * dt;
                d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
                if (this.groundPlane && d.y < -5.8) { d.y = -5.8; d.vy *= -0.48; }
                d.rx += d.spin * dt; d.ry += d.spin * 0.7 * dt; d.rz += d.spin * 0.45 * dt;
            }
            this.debrisMesh.count = this.debrisList.length;
            for (let i = 0; i < this.debrisList.length; i++) {
                const d = this.debrisList[i];
                const sc = d.s * Math.min(1, (d.life - d.t) * 2.5);
                tmpV.set(d.x, d.y, d.z);
                tmpQ.setFromEuler(new THREE.Euler(d.rx, d.ry, d.rz));
                tmpS.setScalar(Math.max(0.02, sc));
                tmpM.compose(tmpV, tmpQ, tmpS);
                this.debrisMesh.setMatrixAt(i, tmpM);
                tmpC.setHex(d.col);
                this.debrisMesh.setColorAt(i, tmpC);
            }
            this.debrisMesh.instanceMatrix.needsUpdate = true;
            if (this.debrisMesh.instanceColor && this.debrisList.length > 0) this.debrisMesh.instanceColor.needsUpdate = true;
        }

        renderFrame(dt) {
            if (this.grade) {
                const rOut = [];
                const tmpV = new THREE.Vector3();
                for (let i = this.ripples.length - 1; i >= 0; i--) {
                    const rp = this.ripples[i];
                    rp.t += dt;
                    if (rp.t >= rp.dur) { this.ripples.splice(i, 1); continue; }
                    const k = rp.t / rp.dur;
                    tmpV.set(rp.x, rp.y, rp.z).project(this.camera);
                    if (tmpV.z > 1) continue;
                    const u = (tmpV.x + 1) * 0.5, v = (tmpV.y + 1) * 0.5;
                    const rad = clamp(0.03 + k * 0.34, 0.02, 0.5);
                    const str = rp.strength * (1 - k) * Math.sin(k * Math.PI);
                    rOut.push([u, v, rad, str]);
                }
                this.grade.setRipples(rOut, this.boostK);
                this.grade.render(this.scene, this.camera);
            } else {
                this.gl.render(this.scene, this.camera);
            }
        }
    }

    SW.Renderer = Renderer;
})();
