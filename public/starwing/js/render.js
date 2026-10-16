// Starwing: Next-Gen 3D WebGL Renderer with Procedural GLSL Displacement Canyon/Mountain Terrain,
// Animated Ocean Water, True 3D Connected Wingtip Ribbon Contrails, Sky Dome & Dual-Kawase Bloom.
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
                '  float knee = smoothstep(0.55, 1.10, lum);',
                '  gl_FragColor = vec4(c * knee * 1.32, 1.0);',
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
                '  vec2 d = uTexel * 1.65;',
                '  vec3 s = texture2D(tTex, vUv).rgb * 0.26;',
                '  s += texture2D(tTex, vUv + vec2(d.x, d.y)).rgb * 0.185;',
                '  s += texture2D(tTex, vUv + vec2(-d.x, d.y)).rgb * 0.185;',
                '  s += texture2D(tTex, vUv + vec2(d.x, -d.y)).rgb * 0.185;',
                '  s += texture2D(tTex, vUv + vec2(-d.x, -d.y)).rgb * 0.185;',
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
                '  float ca = length(warp) * 0.55 + r2 * (0.0025 + uBoost * 0.014);',
                '  vec2 caDir = normalize(edge + vec2(1e-5)) * ca;',
                '  vec3 col;',
                '  col.r = texture2D(tScene, clamp(cUv + caDir, vec2(0.001), vec2(0.999))).r;',
                '  col.g = texture2D(tScene, cUv).g;',
                '  col.b = texture2D(tScene, clamp(cUv - caDir, vec2(0.001), vec2(0.999))).b;',
                '  vec3 bloom = texture2D(tBloom, cUv).rgb;',
                '  // Anamorphic horizontal flare sampling from bloom',
                '  vec3 anamorphic = (texture2D(tBloom, clamp(cUv + vec2(0.028, 0.0), vec2(0.001), vec2(0.999))).rgb +',
                '                     texture2D(tBloom, clamp(cUv - vec2(0.028, 0.0), vec2(0.001), vec2(0.999))).rgb) * vec3(0.35, 0.68, 1.0) * 0.25;',
                '  col += bloom * 0.82 + anamorphic;',
                '  col *= 1.06;',
                '  float vig = smoothstep(0.98, 0.22, r2);',
                '  col *= mix(0.78, 1.04, vig);',
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

    // Continuous 3D Triangle-Strip Wingtip Ribbon Mesh
    class WingRibbon {
        constructor(maxPts) {
            this.maxPts = maxPts || 28;
            this.pts = [];
            const geo = new THREE.BufferGeometry();
            this.posArr = new Float32Array(this.maxPts * 2 * 3);
            this.colArr = new Float32Array(this.maxPts * 2 * 3);
            const indices = [];
            for (let i = 0; i < this.maxPts - 1; i++) {
                const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
                indices.push(a, b, c, b, d, c);
            }
            geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
            geo.setAttribute('color', new THREE.BufferAttribute(this.colArr, 3));
            geo.setIndex(indices);
            this.mat = new THREE.MeshBasicMaterial({
                vertexColors: true,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.72,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                toneMapped: false,
            });
            this.mesh = new THREE.Mesh(geo, this.mat);
            this.mesh.frustumCulled = false;
        }

        clear() {
            this.pts.length = 0;
            this.posArr.fill(0);
            this.mesh.geometry.attributes.position.needsUpdate = true;
        }

        push(x, y, z, width, hex, scrollDz) {
            for (let i = 0; i < this.pts.length; i++) {
                this.pts[i].z += scrollDz;
            }
            this.pts.unshift({ x, y, z, w: width || 0.22, hex: hex || 0x88ebff });
            if (this.pts.length > this.maxPts) this.pts.pop();

            const n = this.pts.length;
            if (n < 2) return;
            const c = new THREE.Color();
            for (let i = 0; i < this.maxPts; i++) {
                const p = this.pts[Math.min(i, n - 1)];
                const fade = Math.max(0, 1 - i / (this.maxPts - 1));
                const hw = p.w * fade;
                const o = i * 6;
                this.posArr[o]     = p.x - hw;
                this.posArr[o + 1] = p.y;
                this.posArr[o + 2] = p.z;
                this.posArr[o + 3] = p.x + hw;
                this.posArr[o + 4] = p.y;
                this.posArr[o + 5] = p.z;

                c.setHex(p.hex).multiplyScalar(fade * fade);
                this.colArr[o]     = c.r; this.colArr[o + 1] = c.g; this.colArr[o + 2] = c.b;
                this.colArr[o + 3] = c.r; this.colArr[o + 4] = c.g; this.colArr[o + 5] = c.b;
            }
            this.mesh.geometry.attributes.position.needsUpdate = true;
            this.mesh.geometry.attributes.color.needsUpdate = true;
        }
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
            gl.toneMappingExposure = 1.14;
            gl.shadowMap.enabled = true;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;

            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x0b162c);
            if (SW.Models && SW.Models.ENV_MAP) {
                this.scene.environment = SW.Models.ENV_MAP;
            }
            this.scene.fog = new THREE.FogExp2(0x5ab2e6, 0.0026);

            this.camera = new THREE.PerspectiveCamera(58, 1.6, 0.3, 550);
            this.hemi = new THREE.HemisphereLight(0xe4f5ff, 0x263e4e, 0.95);
            this.scene.add(this.hemi);

            const sun = this.sun = new THREE.DirectionalLight(0xfff6e5, 1.55);
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

            // True 3D Connected Wingtip Contrail Ribbons
            this.ribbonL = new WingRibbon(28);
            this.ribbonR = new WingRibbon(28);
            this.fxGroup.add(this.ribbonL.mesh, this.ribbonR.mesh);

            this.glowTex = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
            this.shadowTex = radialTex('rgba(0,0,0,0.68)', 'rgba(0,0,0,0)');

            // Instanced 3D faceted shatter debris
            const dGeo = new THREE.OctahedronGeometry(0.32, 0);
            dGeo.scale(1.35, 0.52, 0.95);
            this.debrisMesh = new THREE.InstancedMesh(dGeo, new THREE.MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0.3,
                metalness: 0.65,
                envMap: SW.Models ? SW.Models.ENV_MAP : null,
                flatShading: true,
            }), 260);
            this.debrisMesh.count = 0;
            this.debrisMesh.frustumCulled = false;
            this.debrisMesh.setColorAt(0, new THREE.Color(1, 1, 1));
            this.fxGroup.add(this.debrisMesh);
            this.debrisList = [];

            // Instanced Spark / Explosion / Wake Spheres
            const pGeo = new THREE.SphereGeometry(0.34, 8, 6);
            this.sparkMesh = new THREE.InstancedMesh(pGeo, new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.92,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                toneMapped: false,
            }), 420);
            this.sparkMesh.count = 0;
            this.sparkMesh.frustumCulled = false;
            this.sparkMesh.setColorAt(0, new THREE.Color(1, 1, 1));
            this.fxGroup.add(this.sparkMesh);
            this.sparks = [];

            // 3D Expanding Plasma Shockwave Rings on explosions
            const ringGeo = new THREE.RingGeometry(0.68, 1.0, 28);
            this.shockRingMesh = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({
                color: 0xffffff,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.88,
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
            this.valleyMat = null;
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

        updateWingRibbons(lx, ly, lz, rx, ry, rz, showL, showR, boosting, dt) {
            const dz = 54 * (1 + this.boostK * 0.65) * dt;
            const col = boosting ? 0x48f6ff : 0xdcf4ff;
            const w = boosting ? 0.28 : 0.18;
            if (showL) this.ribbonL.push(lx, ly, lz, w, col, dz);
            if (showR) this.ribbonR.push(rx, ry, rz, w, col, dz);
        }

        buildSceneryProp(sector, index) {
            const B = SW.Models.bakePartGeo;
            const g = new THREE.Group();
            const side = (index % 2 === 0) ? -1 : 1;

            if (sector === 'corneria') {
                const kind = index % 3;
                if (kind === 0) {
                    // Sleek Futuristic Corneria Coastal Spire Tower with Illuminated Glass Bands
                    const h = 16 + (index % 4) * 5.5;
                    const r = 2.1 + (index % 3) * 0.55;
                    const tower = B(new THREE.CylinderGeometry(r * 0.68, r, h, 16), 0xe2ecf8, false, false);
                    tower.position.y = h * 0.5 - 5.5;
                    const ring1 = B(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.5, 16), 0x3ef2ff, true, false);
                    ring1.position.y = h * 0.65 - 5.5;
                    const ring2 = B(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.45, 16), 0x3ef2ff, true, false);
                    ring2.position.y = h * 0.82 - 5.5;
                    const spire = B(new THREE.ConeGeometry(r * 0.68, 4.5, 16), 0x1e5ce6, false, false);
                    spire.position.y = h + 2.2 - 5.5;
                    g.add(tower, ring1, ring2, spire);
                    g.userData = { baseX: side * (21 + (index % 3) * 6), baseY: 0 };
                } else if (kind === 1) {
                    // Smooth Volumetric Cloud Bank high above the valley
                    for (let c = 0; c < 4; c++) {
                        const puff = B(new THREE.SphereGeometry(3.4 - c * 0.5, 16, 12), 0xf6fbff, false, false);
                        puff.scale.set(1.85, 0.48, 1.15);
                        puff.position.set((c - 1.5) * 3.1, (c % 2) * 0.45, (c % 2) * 1.4);
                        g.add(puff);
                    }
                    g.userData = { baseX: side * (12 + (index % 4) * 8), baseY: 12 + (index % 3) * 3.5 };
                } else {
                    // Coastal Defense Pylon / Wind Turbine Generator on the water's edge
                    const mast = B(new THREE.CylinderGeometry(0.45, 0.85, 11, 14), 0xd8e4f2, false, false);
                    mast.position.y = -0.5;
                    const hub = B(new THREE.SphereGeometry(0.95, 14, 10), 0x3ef2ff, true, false);
                    hub.position.y = 5.2;
                    g.add(mast, hub);
                    g.userData = { baseX: side * (16 + (index % 2) * 4), baseY: 0 };
                }
            } else if (sector === 'meteo') {
                if (index % 5 === 0) {
                    const R = 24;
                    const arc = B(new THREE.TorusGeometry(R, 1.1, 12, 32, Math.PI * 0.55), 0x4e5c78, false, false);
                    arc.rotation.z = side > 0 ? -Math.PI * 0.28 : Math.PI * 0.72;
                    const glowArc = B(new THREE.TorusGeometry(R - 1.3, 0.35, 8, 24, Math.PI * 0.5), 0x3ef2ff, true, false);
                    glowArc.rotation.z = arc.rotation.z;
                    g.add(arc, glowArc);
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
                // Venom: Towering Cybernetic Reactor Towers & Searchlights
                const h = 24 + (index % 3) * 6;
                const col = B(new THREE.CylinderGeometry(2.8, 3.6, h, 16), 0x2c1d3d, false, false);
                col.position.y = h * 0.5 - 6.2;
                const coreRing = B(new THREE.CylinderGeometry(3.2, 3.2, 1.4, 16), (index % 2 === 0) ? 0xff2e6b : 0x3ef2ff, true, false);
                coreRing.position.y = h * 0.55 - 6.2;
                g.add(col, coreRing);
                g.userData = { baseX: side * (22 + (index % 2) * 5), baseY: 0 };
            }

            return g;
        }

        setupSectorEnv(sector) {
            this.sector = sector;
            this.ribbonL.clear();
            this.ribbonR.clear();
            if (this.envGroup) {
                this.scene.remove(this.envGroup);
            }
            this.envGroup = new THREE.Group();
            this.scene.add(this.envGroup);
            this.groundPlane = null;
            this.waterMat = null;
            this.valleyMat = null;
            this.starPoints = null;
            this.sceneryItems = [];

            // 1. Custom Atmospheric / Cosmic Sky Dome Shader
            const skyGeo = new THREE.SphereGeometry(440, 36, 24);
            const modeVal = sector === 'corneria' ? 0.0 : sector === 'meteo' ? 1.0 : 2.0;
            this.skyMat = new THREE.ShaderMaterial({
                side: THREE.BackSide,
                depthWrite: false,
                uniforms: {
                    uTime: { value: 0 },
                    uMode: { value: modeVal },
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
                    '    vec3 zenith = vec3(0.04, 0.18, 0.48);',
                    '    vec3 mid = vec3(0.18, 0.56, 0.88);',
                    '    vec3 horiz = vec3(0.82, 0.94, 1.0);',
                    '    col = mix(horiz, mid, smoothstep(-0.04, 0.26, y));',
                    '    col = mix(col, zenith, smoothstep(0.22, 0.85, y));',
                    '    vec3 sunDir = normalize(vec3(0.28, 0.22, -0.93));',
                    '    float sunDot = max(0.0, dot(d, sunDir));',
                    '    col += vec3(1.0, 0.84, 0.52) * pow(sunDot, 12.0) * 0.65;',
                    '    col += vec3(1.0, 0.98, 0.92) * smoothstep(0.993, 0.9985, sunDot) * 2.5;',
                    '  } else if (uMode < 1.5) {',
                    '    vec3 bg = vec3(0.012, 0.02, 0.06);',
                    '    float n1 = sin(d.x * 4.5 + d.y * 3.0 + uTime * 0.05) * cos(d.z * 3.5 - d.y * 4.0);',
                    '    float neb = smoothstep(0.0, 0.75, n1) * (1.0 - abs(y) * 0.65);',
                    '    col = bg + vec3(0.08, 0.36, 0.65) * neb + vec3(0.48, 0.10, 0.52) * pow(neb, 2.0);',
                    '  } else {',
                    '    vec3 zenith = vec3(0.05, 0.015, 0.10);',
                    '    vec3 mid = vec3(0.22, 0.04, 0.20);',
                    '    vec3 horiz = vec3(0.88, 0.18, 0.38);',
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

            if (sector === 'corneria' || sector === 'venom') {
                const isVenom = sector === 'venom';
                this.scene.fog = new THREE.FogExp2(isVenom ? 0x280b30 : 0x6cbce8, 0.0028);
                this.hemi.color.setHex(isVenom ? 0xffa8cc : 0xe6f6ff);
                this.hemi.groundColor.setHex(isVenom ? 0x260934 : 0x245c48);
                this.sun.color.setHex(isVenom ? 0xffd6e6 : 0xfff6e0);

                // 2A. Continuous 3D Scrolling Displacement Valley / Canyon Terrain Mesh
                const vGeo = new THREE.PlaneGeometry(340, 300, 110, 96);
                vGeo.rotateX(-Math.PI / 2);
                this.valleyMat = new THREE.ShaderMaterial({
                    uniforms: {
                        uTime: { value: 0 },
                        uScrollZ: { value: 0 },
                        uMode: { value: isVenom ? 1.0 : 0.0 },
                    },
                    vertexShader: [
                        'varying vec3 vWorldPos;',
                        'varying float vElev;',
                        'varying vec3 vNorm;',
                        'uniform float uScrollZ;',
                        'uniform float uMode;',
                        'float heightAt(vec2 xz) {',
                        '  float ax = abs(xz.x);',
                        '  // Carve flat river/ocean channel in center (|x| < 17), rise into mountains on banks',
                        '  float bank = smoothstep(15.5, 44.0, ax);',
                        '  float n1 = sin(xz.x * 0.075 + xz.y * 0.045) * cos(xz.y * 0.062 - xz.x * 0.05);',
                        '  float n2 = sin(xz.x * 0.18 - xz.y * 0.14) * 0.45;',
                        '  float n3 = cos(xz.x * 0.35 + xz.y * 0.28) * 0.22;',
                        '  float ridge = abs(n1 + n2) * 26.0 + n3 * 6.0;',
                        '  if (uMode > 0.5) {',
                        '    // Terraced cyber-canyon steps on Venom',
                        '    ridge = floor(ridge * 0.35) * 3.2;',
                        '  }',
                        '  return -7.2 + bank * (4.5 + ridge);',
                        '}',
                        'void main() {',
                        '  vec3 p = position;',
                        '  vec2 sampleXZ = vec2(p.x, p.z + uScrollZ);',
                        '  float h = heightAt(sampleXZ);',
                        '  float hx = heightAt(sampleXZ + vec2(1.2, 0.0));',
                        '  float hz = heightAt(sampleXZ + vec2(0.0, 1.2));',
                        '  vNorm = normalize(vec3(h - hx, 1.2, h - hz));',
                        '  p.y = h;',
                        '  vElev = h;',
                        '  vec4 wp = modelMatrix * vec4(p, 1.0);',
                        '  vWorldPos = wp.xyz;',
                        '  gl_Position = projectionMatrix * viewMatrix * wp;',
                        '}',
                    ].join('\n'),
                    fragmentShader: [
                        'precision highp float;',
                        'varying vec3 vWorldPos;',
                        'varying float vElev;',
                        'varying vec3 vNorm;',
                        'uniform float uTime;',
                        'uniform float uScrollZ;',
                        'uniform float uMode;',
                        'void main() {',
                        '  if (vElev < -5.85) discard;',
                        '  vec3 N = normalize(vNorm);',
                        '  vec3 L = normalize(vec3(0.42, 0.82, 0.38));',
                        '  float diff = clamp(dot(N, L), 0.0, 1.0);',
                        '  float dist = length(vWorldPos.xz);',
                        '  float fade = exp(-dist * 0.0048);',
                        '  vec3 col;',
                        '  if (uMode < 0.5) {',
                        '    // Corneria Biomes: Sandy beach -> Emerald forest -> Alpine granite -> Snow peaks',
                        '    vec3 sand = vec3(0.86, 0.78, 0.56);',
                        '    vec3 forest = vec3(0.14, 0.48, 0.32);',
                        '    vec3 rock = vec3(0.36, 0.42, 0.50);',
                        '    vec3 snow = vec3(0.94, 0.97, 1.0);',
                        '    col = mix(sand, forest, smoothstep(-5.8, -2.5, vElev));',
                        '    col = mix(col, rock, smoothstep(1.5, 9.5, vElev) + (1.0 - N.y) * 0.45);',
                        '    col = mix(col, snow, smoothstep(11.0, 18.0, vElev) * smoothstep(0.45, 0.85, N.y));',
                        '    vec3 lightCol = vec3(0.35, 0.48, 0.62) + vec3(0.95, 0.90, 0.78) * diff;',
                        '    col *= lightCol;',
                        '    vec3 fogCol = vec3(0.62, 0.86, 0.98);',
                        '    col = mix(fogCol, col, fade);',
                        '  } else {',
                        '    // Venom Armored Trench Walls + Glowing Energy Conduits',
                        '    vec3 metal = vec3(0.16, 0.09, 0.24) * (0.4 + 0.75 * diff);',
                        '    float stripe = smoothstep(0.92, 0.98, abs(sin((vWorldPos.z + uScrollZ) * 0.18)));',
                        '    float tierGlow = smoothstep(0.88, 0.96, abs(sin(vElev * 1.4)));',
                        '    col = metal + vec3(1.0, 0.18, 0.46) * tierGlow * 0.65 + vec3(0.25, 0.92, 1.0) * stripe * 0.45;',
                        '    vec3 fogCol = vec3(0.22, 0.06, 0.25);',
                        '    col = mix(fogCol, col, fade);',
                        '  }',
                        '  gl_FragColor = vec4(col, 1.0);',
                        '}',
                    ].join('\n'),
                });
                const valleyMesh = new THREE.Mesh(vGeo, this.valleyMat);
                valleyMesh.position.set(0, 0, -95);
                this.envGroup.add(valleyMesh);

                // 2B. Photorealistic Animated Ocean Water / Plasma Trench Floor Shader
                const gGeo = new THREE.PlaneGeometry(1200, 1200, 1, 1);
                gGeo.rotateX(-Math.PI / 2);
                this.waterMat = new THREE.ShaderMaterial({
                    uniforms: {
                        uTime: { value: 0 },
                        uScrollZ: { value: 0 },
                        uMode: { value: isVenom ? 1.0 : 0.0 },
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
                        '  vec2 p = vec2(vWorldPos.x, vWorldPos.z + uScrollZ);',
                        '  float dist = length(vWorldPos.xz);',
                        '  float fade = exp(-dist * 0.0042);',
                        '  if (uMode < 0.5) {',
                        '    float w1 = sin(p.x * 0.42 + p.y * 0.26 + uTime * 2.6);',
                        '    float w2 = cos(p.x * 0.75 - p.y * 0.52 + uTime * 3.4);',
                        '    float w3 = sin((p.x - p.y) * 1.35 - uTime * 4.5);',
                        '    float wave = (w1 + w2 * 0.65 + w3 * 0.35) / 2.0;',
                        '    vec3 deep = vec3(0.03, 0.22, 0.48);',
                        '    vec3 shallow = vec3(0.08, 0.52, 0.82);',
                        '    vec3 col = mix(deep, shallow, wave * 0.5 + 0.5);',
                        '    // Shoreline surf foam where water meets canyon banks (|x| ~ 15.5)',
                        '    float bankDist = abs( abs(vWorldPos.x) - 15.8 + w1 * 0.8 );',
                        '    float shoreFoam = exp(-bankDist * 1.15);',
                        '    float crestFoam = smoothstep(0.56, 0.86, wave);',
                        '    col = mix(col, vec3(0.86, 0.97, 1.0), clamp(crestFoam * 0.38 + shoreFoam * 0.75, 0.0, 1.0));',
                        '    // Sparkling sun specular path',
                        '    float sunPath = exp(-pow((vWorldPos.x - 6.0) * 0.08, 2.0));',
                        '    float glint = smoothstep(0.28, 0.82, wave) * sunPath;',
                        '    col += vec3(1.0, 0.94, 0.76) * glint * 0.85;',
                        '    vec3 fogCol = vec3(0.62, 0.86, 0.98);',
                        '    col = mix(fogCol, col, fade);',
                        '    gl_FragColor = vec4(col, 1.0);',
                        '  } else {',
                        '    vec2 g = abs(fract(p * 0.075) - 0.5);',
                        '    float line = 1.0 - smoothstep(0.0, 0.045, min(g.x, g.y));',
                        '    float pulse = 0.65 + 0.35 * sin(p.y * 0.12 + uTime * 4.0);',
                        '    vec3 base = vec3(0.08, 0.03, 0.13);',
                        '    vec3 neon = mix(vec3(1.0, 0.15, 0.42), vec3(0.25, 0.92, 1.0), smoothstep(-14.0, 14.0, vWorldPos.x));',
                        '    vec3 col = base + neon * line * 0.62 * pulse * fade;',
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
            } else {
                // Meteo Deep Space
                this.scene.fog = new THREE.FogExp2(0x090e24, 0.0024);
                this.hemi.color.setHex(0xa8ccff);
                this.hemi.groundColor.setHex(0x221638);
                this.sun.color.setHex(0xe8f2ff);

                const planetGroup = new THREE.Group();
                planetGroup.position.set(-65, 38, -260);
                const planet = SW.Models.bakePartGeo(new THREE.SphereGeometry(36, 32, 24), 0x2d62e0, false, false);
                const ringGeo = new THREE.RingGeometry(48, 74, 48);
                ringGeo.rotateX(Math.PI * 0.38);
                ringGeo.rotateY(0.25);
                const pRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
                    color: 0x62e8ff,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.42,
                }));
                planetGroup.add(planet, pRing);
                this.envGroup.add(planetGroup);

                const starGeo = new THREE.BufferGeometry();
                const count = 2000;
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
            }

            // 3. Populate 30 Scrolling 3D Architectural / Cloud / Asteroid Props
            const totalProps = 30;
            const spanZ = 240;
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
                const col = (i % 3 === 0) ? (hex1 || 0x8ea0b8) : (i % 3 === 1) ? (hex2 || 0xff7a28) : 0x2b3442;
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
            this.emitSpark(x, y, z, 0, 0, 0, 0.24, 2.6 * s, 0.2, 0xffffff, 0);
            this.emitShockRing(x, y, z, 5.8 * s, c1, 0.46);
            if (s > 1.3) {
                this.emitShockRing(x, y, z, 9.5 * s, 0x52f2ff, 0.64);
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
            const scrollSpeed = 54 * (1 + this.boostK * 0.65);
            const scrollZ = anchorPos ? -anchorPos.z : this.time * 48;

            if (this.skyMat) {
                this.skyMat.uniforms.uTime.value = this.time;
            }
            if (this.valleyMat) {
                this.valleyMat.uniforms.uTime.value = this.time;
                this.valleyMat.uniforms.uScrollZ.value = scrollZ;
            }
            if (this.waterMat) {
                this.waterMat.uniforms.uTime.value = this.time;
                this.waterMat.uniforms.uScrollZ.value = scrollZ;
            }

            for (let i = 0; i < this.sceneryItems.length; i++) {
                const item = this.sceneryItems[i];
                item.position.z += scrollSpeed * dt;
                if (item.userData && item.userData.spin) {
                    item.rotation.x += item.userData.spin * dt;
                    item.rotation.y += item.userData.spin * 0.7 * dt;
                }
                if (item.position.z > 22) {
                    item.position.z -= 240;
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

            // Update sparks
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
