// Starwing 64: 3D WebGL Renderer, Dual-Kawase Bloom & Shockwave Post-Processing, Sector Environments & VFX.
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
                '  float knee = smoothstep(0.62, 1.15, lum);',
                '  gl_FragColor = vec4(c * knee * 1.15, 1.0);',
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
                '  vec2 d = uTexel * 1.45;',
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
                '  uv = clamp(uv + warp, 0.001, 0.999);',
                '  vec2 cDist = uv - 0.5;',
                '  float ca = dot(cDist, cDist) * (0.0045 + uBoost * 0.012) + length(warp) * 0.35;',
                '  vec3 c;',
                '  c.r = texture2D(tScene, clamp(uv + cDist * ca, 0.001, 0.999)).r;',
                '  c.g = texture2D(tScene, uv).g;',
                '  c.b = texture2D(tScene, clamp(uv - cDist * ca, 0.001, 0.999)).b;',
                '  vec3 bloom = texture2D(tBloom, uv).rgb;',
                '  c += bloom * 0.42;',
                '  c = clamp(c, 0.0, 1.0);',
                '  vec3 sc = c * c * (3.0 - 2.0 * c);',
                '  c = mix(c, sc, 0.22);',
                '  float l = dot(c, vec3(0.299, 0.587, 0.114));',
                '  c = clamp(mix(vec3(l), c, 1.15), 0.0, 1.0);',
                '  float r2 = dot(cDist, cDist);',
                '  c *= 1.0 - smoothstep(0.18, 0.72, r2) * (0.24 + uBoost * 0.12);',
                '  gl_FragColor = vec4(c, 1.0);',
                '}',
            ].join('\n'),
            depthTest: false, depthWrite: false,
        });

        const quad = new THREE.Mesh(quadGeo, mat);
        quad.frustumCulled = false;
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
                mat.uniforms.uAspect.value = nw / Math.max(1, nh);
            },
            setRipples(list, boostK) {
                const arr = mat.uniforms.uRipple.value;
                for (let i = 0; i < 4; i++) {
                    const r = list && list[i];
                    if (r) arr[i].set(r[0], r[1], r[2], r[3]);
                    else arr[i].set(0, 0, 0, 0);
                }
                mat.uniforms.uBoost.value = boostK || 0;
            },
            render(mainScene, mainCam) {
                const prev = renderer.getRenderTarget();
                const prevAuto = renderer.autoClear;
                renderer.setRenderTarget(rt);
                renderer.clear();
                renderer.render(mainScene, mainCam);

                renderer.autoClear = true;
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
        const t = new THREE.CanvasTexture(c);
        return t;
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
            gl.toneMappingExposure = 1.08;
            gl.shadowMap.enabled = true;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;

            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x070d1c);
            this.scene.fog = new THREE.FogExp2(0x070d1c, 0.0048);

            this.camera = new THREE.PerspectiveCamera(56, 1.6, 0.3, 420);
            this.hemi = new THREE.HemisphereLight(0xd6ebff, 0x263248, 0.85);
            this.scene.add(this.hemi);

            const sun = this.sun = new THREE.DirectionalLight(0xfff4df, 1.35);
            sun.position.set(40, 85, 50);
            sun.castShadow = true;
            sun.shadow.mapSize.set(1536, 1536);
            sun.shadow.bias = -0.0005;
            const sc = sun.shadow.camera;
            sc.near = 10; sc.far = 220;
            sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45;
            this.scene.add(sun);
            this.scene.add(sun.target);

            this.worldGroup = new THREE.Group();
            this.fxGroup = new THREE.Group();
            this.scene.add(this.worldGroup, this.fxGroup);

            this.glowTex = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
            this.shadowTex = radialTex('rgba(0,0,0,0.65)', 'rgba(0,0,0,0)');

            // Instanced 3D faceted shatter debris
            const dGeo = new THREE.OctahedronGeometry(0.28, 0);
            dGeo.scale(1.3, 0.55, 0.95);
            this.debrisMesh = new THREE.InstancedMesh(dGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.35, flatShading: true }), 240);
            this.debrisMesh.count = 0;
            this.debrisMesh.frustumCulled = false;
            this.debrisMesh.setColorAt(0, new THREE.Color(1, 1, 1));
            this.fxGroup.add(this.debrisMesh);
            this.debrisList = [];

            // Instanced Spark / Explosion / Wake / Trail billboards
            const pGeo = new THREE.SphereGeometry(0.32, 6, 5);
            this.sparkMesh = new THREE.InstancedMesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 320);
            this.sparkMesh.count = 0;
            this.sparkMesh.frustumCulled = false;
            this.sparkMesh.setColorAt(0, new THREE.Color(1, 1, 1));
            this.fxGroup.add(this.sparkMesh);
            this.sparks = [];

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
            this.starField = null;
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

        setupSectorEnv(sector) {
            this.sector = sector;
            if (this.envGroup) {
                this.scene.remove(this.envGroup);
            }
            this.envGroup = new THREE.Group();
            this.scene.add(this.envGroup);
            this.groundPlane = null;
            this.starPoints = null;

            if (sector === 'corneria') {
                this.scene.background.setHex(0x4ea6e8);
                this.scene.fog = new THREE.FogExp2(0x7ac5f5, 0.0042);
                this.hemi.color.setHex(0xdff4ff);
                this.hemi.groundColor.setHex(0x285a48);
                this.sun.color.setHex(0xfff6e0);

                // Procedural Ocean + Island Grid Texture & Normal Map
                const tc = document.createElement('canvas'); tc.width = tc.height = 256;
                const tg = tc.getContext('2d');
                tg.fillStyle = '#1b6ca8';
                tg.fillRect(0, 0, 256, 256);
                tg.strokeStyle = 'rgba(130, 225, 255, 0.25)';
                tg.lineWidth = 2;
                for (let i = 0; i < 256; i += 32) {
                    tg.beginPath(); tg.moveTo(0, i); tg.lineTo(256, i); tg.stroke();
                    tg.beginPath(); tg.moveTo(i, 0); tg.lineTo(i, 256); tg.stroke();
                }
                for (let i = 0; i < 90; i++) {
                    tg.fillStyle = i % 2 ? 'rgba(255,255,255,0.14)' : 'rgba(12,48,84,0.22)';
                    tg.fillRect(Math.random() * 256, Math.random() * 256, 18, 4);
                }
                const tex = new THREE.CanvasTexture(tc);
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(90, 90);

                const gGeo = new THREE.PlaneGeometry(2400, 2400);
                gGeo.rotateX(-Math.PI / 2);
                const gMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.32, metalness: 0.18 });
                this.groundPlane = new THREE.Mesh(gGeo, gMat);
                this.groundPlane.position.y = -6.0;
                this.groundPlane.receiveShadow = true;
                this.envGroup.add(this.groundPlane);
                this.groundTex = tex;
            } else if (sector === 'meteo') {
                this.scene.background.setHex(0x050814);
                this.scene.fog = new THREE.FogExp2(0x080d22, 0.0036);
                this.hemi.color.setHex(0x9ec4ff);
                this.hemi.groundColor.setHex(0x1c142e);
                this.sun.color.setHex(0xe0ecff);

                const starGeo = new THREE.BufferGeometry();
                const count = 1400;
                const pos = new Float32Array(count * 3);
                const col = new Float32Array(count * 3);
                for (let i = 0; i < count; i++) {
                    pos[i * 3]     = (Math.random() - 0.5) * 600;
                    pos[i * 3 + 1] = (Math.random() - 0.5) * 360;
                    pos[i * 3 + 2] = (Math.random() - 0.5) * 600;
                    const c = Math.random() < 0.3 ? [0.6, 0.85, 1.0] : Math.random() < 0.5 ? [1.0, 0.85, 0.65] : [1, 1, 1];
                    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
                }
                starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
                this.starPoints = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.4, vertexColors: true, transparent: true, opacity: 0.9, toneMapped: false }));
                this.envGroup.add(this.starPoints);
            } else {
                // Venom Trench / Core
                this.scene.background.setHex(0x16071c);
                this.scene.fog = new THREE.FogExp2(0x220a29, 0.0046);
                this.hemi.color.setHex(0xff9ec4);
                this.hemi.groundColor.setHex(0x22092e);
                this.sun.color.setHex(0xffd0e0);

                const tc = document.createElement('canvas'); tc.width = tc.height = 256;
                const tg = tc.getContext('2d');
                tg.fillStyle = '#1b0d26';
                tg.fillRect(0, 0, 256, 256);
                tg.strokeStyle = 'rgba(255, 58, 120, 0.42)';
                tg.lineWidth = 3;
                for (let i = 0; i < 256; i += 32) {
                    tg.beginPath(); tg.moveTo(0, i); tg.lineTo(256, i); tg.stroke();
                    tg.beginPath(); tg.moveTo(i, 0); tg.lineTo(i, 256); tg.stroke();
                }
                const tex = new THREE.CanvasTexture(tc);
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(90, 90);

                const gGeo = new THREE.PlaneGeometry(2400, 2400);
                gGeo.rotateX(-Math.PI / 2);
                const gMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.35 });
                this.groundPlane = new THREE.Mesh(gGeo, gMat);
                this.groundPlane.position.y = -6.0;
                this.groundPlane.receiveShadow = true;
                this.envGroup.add(this.groundPlane);
                this.groundTex = tex;
            }
        }

        emitSpark(x, y, z, vx, vy, vz, life, s0, s1, hex, gravity) {
            if (this.sparks.length >= 320) this.sparks.shift();
            this.sparks.push({ x, y, z, vx, vy, vz, t: 0, life: life || 0.45, s0: s0 || 0.45, s1: s1 || 0.05, hex: hex || 0xffb84d, g: gravity || 0 });
        }

        debrisBurst(x, y, z, count, speed, hex1, hex2) {
            for (let i = 0; i < count; i++) {
                if (this.debrisList.length >= 240) this.debrisList.shift();
                const a = Math.random() * TAU, el = (Math.random() - 0.3) * Math.PI;
                const sp = (0.4 + Math.random() * 0.8) * (speed || 12);
                const col = (i % 3 === 0) ? (hex1 || 0x708096) : (i % 3 === 1) ? (hex2 || 0xff7a28) : 0x2b323d;
                this.debrisList.push({
                    x, y, z,
                    vx: Math.cos(a) * Math.cos(el) * sp,
                    vy: Math.sin(el) * sp + 3,
                    vz: Math.sin(a) * Math.cos(el) * sp,
                    rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
                    spin: (Math.random() - 0.5) * 16,
                    t: 0, life: 0.9 + Math.random() * 0.8,
                    s: 0.65 + Math.random() * 1.35,
                    col,
                });
            }
        }

        explosion(x, y, z, scale, colorHex, ripple) {
            const s = scale || 1;
            const c1 = colorHex || 0xff9a38;
            for (let i = 0; i < Math.round(18 * s); i++) {
                const a = Math.random() * TAU, el = (Math.random() - 0.5) * Math.PI;
                const sp = (4 + Math.random() * 14) * s;
                this.emitSpark(
                    x, y, z,
                    Math.cos(a) * Math.cos(el) * sp,
                    Math.sin(el) * sp,
                    Math.sin(a) * Math.cos(el) * sp,
                    0.32 + Math.random() * 0.35,
                    0.75 * s, 0.08,
                    i % 3 === 0 ? 0xffffff : c1,
                    2.0
                );
            }
            this.debrisBurst(x, y, z, Math.round(10 * s), 11 * s, 0x8a99ad, c1);
            if (ripple) {
                this.addRipple(x, y, z, 8 * s, 0.022 * Math.min(2, s), 0.52);
            }
        }

        addRipple(x, y, z, radius, strength, dur) {
            if (this.ripples.length >= 4) this.ripples.shift();
            this.ripples.push({ x, y, z, radius: radius || 8, strength: strength || 0.02, dur: dur || 0.5, t: 0 });
        }

        updateVfx(dt, anchorPos) {
            this.time += dt;
            if (this.groundPlane && anchorPos) {
                this.groundPlane.position.x = anchorPos.x;
                this.groundPlane.position.z = anchorPos.z;
                if (this.groundTex) {
                    this.groundTex.offset.x = anchorPos.x / (2400 / 90);
                    this.groundTex.offset.y = -anchorPos.z / (2400 / 90);
                }
            }
            if (this.starPoints && anchorPos) {
                this.starPoints.position.copy(anchorPos);
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

            // Update 3D debris
            for (let i = this.debrisList.length - 1; i >= 0; i--) {
                const d = this.debrisList[i];
                d.t += dt;
                if (d.t >= d.life) { this.debrisList.splice(i, 1); continue; }
                d.vy -= 14 * dt;
                d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
                if (this.groundPlane && d.y < -5.8) { d.y = -5.8; d.vy *= -0.45; }
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
