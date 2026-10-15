// Shardfall: the render layer. Camera, terrain, fog of war, shard fields, entities (interpolated + animated),
// effects (projectiles, explosions, smoke, debris, scorch marks), selection rings, health bars, placement ghost,
// order markers and rally flags. Reads the simulation (read-only) and SF_MODELS; never changes game state.
(function () {
    'use strict';
    const SF = window.SF = window.SF || {};
    const C = window.SF_CONFIG;
    const DEG = Math.PI / 180;
    const TAU = Math.PI * 2;
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
    function lin(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
    function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
    const AX_X = new THREE.Vector3(1, 0, 0), AX_Y = new THREE.Vector3(0, 1, 0);

    function radialTexture(inner, outer) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, inner); gr.addColorStop(0.35, inner); gr.addColorStop(1, outer);
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        const t = new THREE.CanvasTexture(c); return t;
    }

    // ---------------------------------------------------------------- particles (one draw call per blend mode)
    class Particles {
        constructor(n, additive) {
            this.n = n; this.next = 0;
            const geo = new THREE.BufferGeometry();
            this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
            geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
            geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
            geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
            this.geo = geo;
            this.vel = new Float32Array(n * 3); this.age = new Float32Array(n); this.life = new Float32Array(n);
            this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.c0 = new Float32Array(n * 4); this.c1 = new Float32Array(n * 4);
            this.drag = new Float32Array(n); this.grav = new Float32Array(n);
            this.mat = new THREE.ShaderMaterial({
                uniforms: { uScale: { value: 400 } },
                vertexShader: 'attribute float aSize; attribute vec4 aColor; varying vec4 vColor; uniform float uScale;\n' +
                    'void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
                fragmentShader: 'varying vec4 vColor; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d); if (vColor.a * a < 0.004) discard; gl_FragColor = vec4(vColor.rgb, vColor.a * a); }',
                transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
            });
            this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 6 : 5;
            this.active = 0;
        }
        // c0/c1 are [r,g,b,a] in display space (0..1)
        emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, drag, grav) {
            const i = this.next; this.next = (this.next + 1) % this.n;
            this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
            this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
            this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1;
            for (let k = 0; k < 4; k++) { this.c0[i * 4 + k] = c0[k]; this.c1[i * 4 + k] = c1[k]; }
            this.drag[i] = drag || 0; this.grav[i] = grav || 0;
            this.dirty = true;
        }
        update(dt) {
            const n = this.n; let any = false;
            for (let i = 0; i < n; i++) {
                if (this.life[i] <= 0) continue;
                this.age[i] += dt;
                const t = this.age[i] / this.life[i];
                if (t >= 1) { this.life[i] = 0; this.size[i] = 0; this.col[i * 4 + 3] = 0; any = true; continue; }
                any = true;
                const dr = Math.max(0, 1 - this.drag[i] * dt);
                this.vel[i * 3] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt; this.vel[i * 3 + 2] *= dr;
                this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
                if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; }
                this.size[i] = lerp(this.s0[i], this.s1[i], t);
                for (let k = 0; k < 4; k++) this.col[i * 4 + k] = lerp(this.c0[i * 4 + k], this.c1[i * 4 + k], t);
            }
            if (any || this.dirty) {
                this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aColor.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true;
                this.dirty = false;
            }
        }
        clear() { this.life.fill(0); this.size.fill(0); this.dirty = true; }
    }

    // ---------------------------------------------------------------- helpers to turn a model group into instanced meshes
    function collectMeshes(group) {
        group.updateMatrixWorld(true);
        const out = [];
        group.traverse((o) => { if (o.isMesh) out.push({ geometry: o.geometry, material: o.material, local: o.matrixWorld.clone() }); });
        return out;
    }
    function instancedFrom(group, count, shadows) {
        const parts = collectMeshes(group);
        return parts.map((p) => {
            const im = new THREE.InstancedMesh(p.geometry, p.material, Math.max(1, count));
            im.userData.local = p.local; im.frustumCulled = false; im.castShadow = !!shadows; im.receiveShadow = !!shadows;
            im.count = count;
            return im;
        });
    }
    function setInstance(ims, i, m) { for (const im of ims) { tmpM.multiplyMatrices(m, im.userData.local); im.setMatrixAt(i, tmpM); } }
    function flagInstances(ims) { for (const im of ims) im.instanceMatrix.needsUpdate = true; }

    function findNamed(root, name) {
        let hit = null;
        root.traverse((o) => { if (!hit && o.name === name) hit = o; });
        return hit;
    }
    function isDescendant(root, o) { while (o) { if (o === root) return true; o = o.parent; } return false; }

    // ---------------------------------------------------------------- the renderer
    class Renderer {
        constructor(container, opts) {
            opts = opts || {};
            this.container = container;
            const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
            this.quality = opts.quality || (coarse ? 'low' : 'high');
            this.high = this.quality === 'high';
            const gl = this.gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
            gl.outputEncoding = THREE.sRGBEncoding;
            gl.toneMapping = THREE.NoToneMapping;
            gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.high ? 2 : 1.75));
            gl.shadowMap.enabled = this.high; gl.shadowMap.type = THREE.PCFSoftShadowMap;
            gl.setClearColor(0x05080d, 1);
            gl.domElement.className = 'sf-canvas';
            container.appendChild(gl.domElement);
            this.canvas = gl.domElement;
            // 2D overlay for health bars (crisp at any zoom, cheap)
            this.hud = document.createElement('canvas'); this.hud.className = 'sf-hudcanvas'; container.appendChild(this.hud);
            this.hctx = this.hud.getContext('2d');

            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
            this.pitch = 56 * DEG;
            this.cam = { x: 32, z: 32, dist: 24, minDist: 9, maxDist: 44, shake: 0, anim: null };
            this.raycaster = new THREE.Raycaster();

            const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x3a3226, 0.65); this.scene.add(hemi);
            const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 1.35);
            sun.position.set(-14, 30, 10); this.scene.add(sun); this.scene.add(sun.target);
            if (this.high) {
                sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
                const sc = sun.shadow.camera; sc.near = 1; sc.far = 90;
            }
            const fill = new THREE.DirectionalLight(0x6f8fc8, 0.35); fill.position.set(20, 12, -18); this.scene.add(fill);

            this.root = new THREE.Group(); this.scene.add(this.root);        // per-map content
            this.fx = new THREE.Group(); this.scene.add(this.fx);            // effects (persist across maps; cleared)
            this.sparks = new Particles(this.high ? 2400 : 1400, true);
            this.smoke = new Particles(this.high ? 1400 : 800, false);
            this.fx.add(this.sparks.points, this.smoke.points);
            this.flashTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
            this.scorchTex = radialTexture('rgba(10,8,6,0.85)', 'rgba(10,8,6,0)');
            this.initPools();
            this.initFog();

            this.views = new Map(); this.frameNo = 0; this.spireRings = [];
            this.selection = new Set();
            this.hover = null;
            this.time = 0;
            this.attract = false;
            this.thumbs = new Map();
            this.listeners = {};
            this.resize();
        }

        // ------------------------------------------------------------ map / world construction
        setSim(sim, team) {
            this.sim = sim; this.team = team || 0;
            this.clearWorld();
            const map = sim.map; this.W = map.w; this.H = map.h;
            this.buildGround(map);
            this.buildRocks(map);
            this.buildDecor(map);
            this.buildShards(map);
            this.buildBuildZone();
            this.fogInit(map);
            const s = map.starts[this.team] || { tx: this.W / 2, tz: this.H / 2 };
            this.centerOn(s.tx + 1.5, s.tz + 2.5, true);
        }
        clearWorld() {
            for (const v of this.views.values()) this.disposeView(v);
            this.views.clear(); this.selection.clear(); this.hover = null; this.spireRings = [];
            while (this.root.children.length) {
                const o = this.root.children.pop();
                o.traverse((c) => { if (c.userData && c.userData.own) { if (c.geometry) c.geometry.dispose(); if (c.material && c.material.map) c.material.map.dispose(); if (c.material) c.material.dispose(); } });
            }
            this.sparks.clear(); this.smoke.clear();
            for (const pool of Object.values(this.pools)) for (const it of pool.items) { it.active = false; if (it.obj) it.obj.visible = false; }
            this.debris.count = 0; this.debrisList.length = 0;
            this.ghost = null;
        }
        buildGround(map) {
            const W = map.w, H = map.h, px = W <= 64 ? 16 : 8;
            this.groundPx = px;
            const big = document.createElement('canvas'); big.width = W * px; big.height = H * px;
            const low = document.createElement('canvas'); low.width = W; low.height = H;
            // detail layer: speckles + soft blotches, painted once
            const det = document.createElement('canvas'); det.width = W * px; det.height = H * px;
            const dg = det.getContext('2d'), r = rnd(9001);
            for (let i = 0; i < W * H * 1.2; i++) {
                const x = r() * det.width, y = r() * det.height, s = 2 + r() * 10;
                dg.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,240,210,0.05)';
                dg.beginPath(); dg.ellipse(x, y, s * 2, s, r() * 3, 0, TAU); dg.fill();
            }
            for (let i = 0; i < W * H * 6; i++) {
                const x = r() * det.width, y = r() * det.height;
                dg.fillStyle = r() < 0.55 ? 'rgba(0,0,0,0.22)' : 'rgba(255,245,225,0.16)';
                dg.fillRect(x, y, 1 + (r() * 2 | 0), 1 + (r() * 2 | 0));
            }
            dg.strokeStyle = 'rgba(0,0,0,0.12)'; dg.lineWidth = 1.2;
            for (let i = 0; i < W * 0.8; i++) {
                let x = r() * det.width, y = r() * det.height; dg.beginPath(); dg.moveTo(x, y);
                for (let k = 0; k < 6; k++) { x += (r() - 0.5) * px * 2; y += (r() - 0.5) * px * 2; dg.lineTo(x, y); }
                dg.stroke();
            }
            this.groundCanvas = { big, low, det, r: rnd(77) };
            this.tileNoise = new Float32Array(W * H); const rn = rnd(1234);
            for (let i = 0; i < W * H; i++) this.tileNoise[i] = rn();
            this.paintGround(map);
            const tex = this.groundTex = new THREE.CanvasTexture(big);
            tex.encoding = THREE.sRGBEncoding; tex.anisotropy = Math.min(8, this.gl.capabilities.getMaxAnisotropy());
            const mat = this.high ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96, metalness: 0 }) : new THREE.MeshLambertMaterial({ map: tex });
            const geo = new THREE.PlaneGeometry(W, H);
            const ground = new THREE.Mesh(geo, mat); ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, 0, H / 2);
            ground.receiveShadow = this.high; ground.userData.own = true; this.root.add(ground);
            const outer = new THREE.Mesh(new THREE.PlaneGeometry(W + 400, H + 400), new THREE.MeshBasicMaterial({ color: 0x07090d }));
            outer.rotation.x = -Math.PI / 2; outer.position.set(W / 2, -0.03, H / 2); outer.userData.own = true; this.root.add(outer);
            this.shardSeen = new Uint8Array(W * H);
            for (let i = 0; i < W * H; i++) this.shardSeen[i] = map.tiles[i] === 2 && map.shards[i] > 0 ? 1 : 0;
            this.groundTimer = 0;
        }
        paintGround(map) {
            const W = map.w, H = map.h, { big, low, det } = this.groundCanvas;
            const lg = low.getContext('2d'), img = lg.createImageData(W, H), d = img.data;
            for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
                const i = z * W + x, n = this.tileNoise[i], t = map.tiles[i], sh = map.shards[i] > 0 && t === 2;
                let rr, gg, bb;
                const wave = Math.sin(x * 0.21 + z * 0.13) * 0.5 + Math.sin(x * 0.07 - z * 0.19) * 0.5;
                if (t === 1) { rr = 62 + n * 10; gg = 58 + n * 9; bb = 54 + n * 8; }
                else if (sh) { const a = Math.min(1, map.shards[i] / C.ECONOMY.shardPerTile); rr = 74 - 30 * a; gg = 96 + 22 * a; bb = 84 + 14 * a; }
                else { rr = 104 + n * 14 + wave * 10; gg = 96 + n * 12 + wave * 8; bb = 76 + n * 8 + wave * 4; }
                d[i * 4] = rr; d[i * 4 + 1] = gg; d[i * 4 + 2] = bb; d[i * 4 + 3] = 255;
            }
            lg.putImageData(img, 0, 0);
            const g = big.getContext('2d');
            g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
            g.drawImage(low, 0, 0, big.width, big.height);
            g.drawImage(det, 0, 0);
            // shard ground: crystalline glints
            const px = this.groundPx, r = rnd(4242);
            for (let i = 0; i < W * H; i++) {
                if (map.tiles[i] !== 2 || map.shards[i] <= 0) continue;
                const x = (i % W) * px, z = ((i / W) | 0) * px;
                for (let k = 0; k < 5; k++) {
                    g.fillStyle = k < 2 ? 'rgba(170,255,230,0.55)' : 'rgba(40,200,165,0.35)';
                    g.fillRect(x + r() * px, z + r() * px, 1.5, 1.5);
                }
            }
            // rock tiles: darker edge shading
            g.fillStyle = 'rgba(20,18,16,0.18)';
            for (let i = 0; i < W * H; i++) if (map.tiles[i] === 1) { const x = (i % W) * px, z = ((i / W) | 0) * px; g.fillRect(x - 2, z - 2, px + 4, px + 4); }
            if (this.groundTex) this.groundTex.needsUpdate = true;
        }
        buildRocks(map) {
            const W = map.w, H = map.h, list = [];
            for (let i = 0; i < W * H; i++) if (map.tiles[i] === 1) list.push(i);
            const spireSet = new Set(map.spires.map((s) => s.tz * W + s.tx));
            const rocks = list.filter((i) => !spireSet.has(i));
            if (!rocks.length) return;
            const r = rnd(555);
            const mat = new THREE.MeshStandardMaterial({ color: lin(0x6e665c), roughness: 0.95, metalness: 0.02, flatShading: true });
            mat.userData = {};
            const variants = [0, 1].map((k) => {
                const g = new THREE.IcosahedronGeometry(0.62, 0);
                const p = g.attributes.position, rr = rnd(31 + k);
                // jitter the shared vertices consistently (non-indexed geometry: hash positions)
                const map2 = new Map();
                for (let i = 0; i < p.count; i++) {
                    const key = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3);
                    if (!map2.has(key)) map2.set(key, 0.78 + rr() * 0.42);
                    const s = map2.get(key); p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
                }
                g.computeVertexNormals(); return g;
            });
            const per = [[], []];
            for (const i of rocks) per[(this.tileNoise[i] * 2) | 0].push(i);
            per.forEach((arr, k) => {
                if (!arr.length) return;
                const n = arr.length * 2;
                const im = new THREE.InstancedMesh(variants[k], mat, n); im.frustumCulled = false; im.castShadow = this.high; im.receiveShadow = this.high;
                im.userData.own = true;
                let c = 0; const col = new THREE.Color();
                for (const i of arr) {
                    const tx = i % W, tz = (i / W) | 0;
                    for (let j = 0; j < 2; j++) {
                        const sx = 0.8 + r() * 0.5, sy = j ? 0.5 + r() * 0.5 : 0.75 + r() * 0.9;
                        tmpQ.setFromAxisAngle(AX_Y, r() * TAU);
                        tmpS.set(sx * (j ? 0.6 : 1), sy * (j ? 0.6 : 1), sx * (j ? 0.6 : 1) * (0.85 + r() * 0.3));
                        tmpV.set(tx + 0.5 + (r() - 0.5) * (j ? 0.7 : 0.25), sy * 0.18, tz + 0.5 + (r() - 0.5) * (j ? 0.7 : 0.25));
                        tmpM.compose(tmpV, tmpQ, tmpS); im.setMatrixAt(c, tmpM);
                        const v = 0.8 + r() * 0.35; col.setRGB(v, v * 0.97, v * 0.93); im.setColorAt(c, col);
                        c++;
                    }
                }
                im.count = c; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
                this.root.add(im);
            });
        }
        buildDecor(map) {
            const M = window.SF_MODELS; if (!M || !map.decor) return;
            const byType = {};
            for (const d of map.decor) (byType[d.type] = byType[d.type] || []).push(d);
            for (const type of Object.keys(byType)) {
                let model; try { model = M.decor(type); } catch (e) { continue; }
                if (!model) continue;
                const arr = byType[type], ims = instancedFrom(model, arr.length, this.high);
                arr.forEach((d, i) => {
                    tmpQ.setFromAxisAngle(AX_Y, d.rot || 0); tmpS.setScalar(d.s || 1); tmpV.set(d.x, 0, d.z);
                    tmpM.compose(tmpV, tmpQ, tmpS); setInstance(ims, i, tmpM);
                });
                flagInstances(ims); for (const im of ims) this.root.add(im);
            }
            // spires
            for (const s of map.spires) {
                let sp; try { sp = M.spire(); } catch (e) { sp = null; }
                if (!sp) continue;
                sp.position.set(s.tx + 0.5, 0, s.tz + 0.5);
                const ring = findNamed(sp, 'ring'); if (ring) this.spireRings.push(ring);
                sp.traverse((o) => { if (o.isMesh) o.castShadow = this.high; });
                this.root.add(sp);
                const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, color: 0x40f0c8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
                glow.position.set(s.tx + 0.5, 0.9, s.tz + 0.5); glow.scale.set(3.2, 3.2, 1); glow.userData.own = true; glow.userData.spireGlow = true;
                this.root.add(glow);
            }
        }
        buildShards(map) {
            const M = window.SF_MODELS, W = map.w, H = map.h;
            const cand = new Set();
            for (let i = 0; i < W * H; i++) if (map.tiles[i] === 2 || map.shards[i] > 0) cand.add(i);
            for (const s of map.spires) for (let z = s.tz - 3; z <= s.tz + 3; z++) for (let x = s.tx - 3; x <= s.tx + 3; x++) {
                if (x < 0 || z < 0 || x >= W || z >= H) continue; const i = z * W + x; if (map.tiles[i] !== 1) cand.add(i);
            }
            this.shardTiles = Array.from(cand);
            this.shardScale = new Float32Array(this.shardTiles.length).fill(-1);
            const r = rnd(808);
            this.shardJit = this.shardTiles.map(() => ({ dx: (r() - 0.5) * 0.25, dz: (r() - 0.5) * 0.25, rot: r() * TAU, s: 0.85 + r() * 0.3 }));
            let model = null; try { model = M && M.shardCluster(); } catch (e) { model = null; }
            if (!model || !this.shardTiles.length) { this.shardIms = null; return; }
            this.shardIms = instancedFrom(model, this.shardTiles.length, false);
            for (const im of this.shardIms) this.root.add(im);
            this.updateShards(true);
        }
        updateShards(force) {
            if (!this.shardIms || !this.sim) return;
            const map = this.sim.map, max = C.ECONOMY.shardPerTile; let changed = false;
            for (let k = 0; k < this.shardTiles.length; k++) {
                const i = this.shardTiles[k], a = map.shards[i];
                const s = a > 1 ? Math.round((0.35 + 0.75 * Math.sqrt(Math.min(1, a / max))) * 20) / 20 : 0;
                if (!force && s === this.shardScale[k]) continue;
                this.shardScale[k] = s; changed = true;
                const j = this.shardJit[k];
                tmpQ.setFromAxisAngle(AX_Y, j.rot); tmpS.set(s * j.s, s * j.s * (s ? 1 : 0), s * j.s);
                tmpV.set((i % map.w) + 0.5 + j.dx, 0, ((i / map.w) | 0) + 0.5 + j.dz);
                tmpM.compose(tmpV, tmpQ, tmpS); setInstance(this.shardIms, k, tmpM);
            }
            if (changed) flagInstances(this.shardIms);
        }
        buildBuildZone() {
            const W = this.W, H = this.H;
            this.zoneData = new Uint8Array(W * H * 4);
            const tex = this.zoneTex = new THREE.DataTexture(this.zoneData, W, H, THREE.RGBAFormat);
            tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
            const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 1 }));
            m.rotation.x = -Math.PI / 2; m.position.set(W / 2, 0.025, H / 2); m.visible = false; m.renderOrder = 2; m.userData.own = true;
            tex.flipY = false;
            // PlaneGeometry v runs +z→-z after rotation; flip the texture rows with repeat
            tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, -1); tex.offset.set(0, 1);
            this.zone = m; this.root.add(m);
        }
        refreshBuildZone() {
            const sim = this.sim, W = this.W, H = this.H, R = C.ECONOMY.buildRadius, d = this.zoneData;
            d.fill(0);
            for (const e of sim.entities.values()) {
                if (e.kind !== 'building' || e.team !== this.team || e.dead) continue;
                const b = C.BUILDINGS[e.type];
                for (let z = Math.max(0, e.tz - R); z < Math.min(H, e.tz + b.d + R); z++) for (let x = Math.max(0, e.tx - R); x < Math.min(W, e.tx + b.w + R); x++) {
                    const i = (z * W + x) * 4; d[i] = 70; d[i + 1] = 150; d[i + 2] = 255; d[i + 3] = 34;
                }
            }
            this.zoneTex.needsUpdate = true;
        }

        // ------------------------------------------------------------ fog of war (screen-space pass over everything)
        initFog() {
            const mat = new THREE.ShaderMaterial({
                uniforms: { uInv: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() }, uFog: { value: null }, uSize: { value: new THREE.Vector2(64, 64) }, uTime: { value: 0 } },
                vertexShader: 'varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }',
                fragmentShader: [
                    'uniform mat4 uInv; uniform vec3 uCam; uniform sampler2D uFog; uniform vec2 uSize; uniform float uTime; varying vec2 vNdc;',
                    'void main(){',
                    '  vec4 p = uInv * vec4(vNdc, 1.0, 1.0); p.xyz /= p.w;',
                    '  vec3 dir = normalize(p.xyz - uCam);',
                    '  float f = 1.0;',
                    '  if (dir.y < -0.0001) {',
                    '    vec3 g = uCam + dir * (-uCam.y / dir.y);',
                    '    vec2 uv = g.xz / uSize;',
                    '    if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) f = texture2D(uFog, uv).r;',
                    '    else { vec2 o = max(vec2(0.0), max(-uv, uv - 1.0)) * uSize; f = max(texture2D(uFog, clamp(uv, 0.001, 0.999)).r, smoothstep(0.0, 3.0, max(o.x, o.y))); }',
                    '  }',
                    '  gl_FragColor = vec4(0.012, 0.022, 0.04, f);',
                    '}'].join('\n'),
                transparent: true, depthTest: false, depthWrite: false,
            });
            const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; q.renderOrder = 1000;
            this.fogQuad = q; this.fogMat = mat; this.scene.add(q);
        }
        fogInit(map) {
            const W = map.w * 2, H = map.h * 2;
            this.fogW = W; this.fogH = H;
            this.fogData = new Uint8Array(W * H * 4);
            this.fogCur = new Float32Array(W * H).fill(255);
            this.fogTarget = new Float32Array(W * H);
            if (this.fogTex) this.fogTex.dispose();
            const tex = this.fogTex = new THREE.DataTexture(this.fogData, W, H, THREE.RGBAFormat);
            tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.flipY = false;
            this.fogMat.uniforms.uFog.value = tex;
            this.fogMat.uniforms.uSize.value.set(map.w, map.h);
            this.fogFirst = true; this.fogPrev = null; this.fogSettled = false;
            this.updateFog(1);
        }
        updateFog(dt) {
            const sim = this.sim; if (!sim) return;
            const T = sim.teams[this.team]; const vis = T && T.vis; if (!vis) return;
            const w = sim.map.w, h = sim.map.h, W = this.fogW, H = this.fogH, tgt = this.fogTarget;
            // skip the upsample + blur when the visibility grid has not changed and the fade has settled
            const prev = this.fogPrev && this.fogPrev.length === vis.length ? this.fogPrev : (this.fogPrev = new Uint8Array(vis.length).fill(255));
            let same = true; for (let i = 0; i < vis.length; i++) if (prev[i] !== vis[i]) { same = false; break; }
            if (same && this.fogSettled && !this.fogFirst) return;
            if (!same) prev.set(vis);
            const level = (v) => (v === 2 ? 0 : v === 1 ? 150 : 255);
            // 2× upsample with a tent blur so the fog edge is round rather than blocky
            for (let z = 0; z < H; z++) {
                const tz = (z - 0.5) / 2, z0 = Math.max(0, Math.floor(tz)), z1 = Math.min(h - 1, z0 + 1), fz = clamp(tz - z0, 0, 1);
                for (let x = 0; x < W; x++) {
                    const tx = (x - 0.5) / 2, x0 = Math.max(0, Math.floor(tx)), x1 = Math.min(w - 1, x0 + 1), fx = clamp(tx - x0, 0, 1);
                    const a = level(vis[z0 * w + x0]), b = level(vis[z0 * w + x1]), c = level(vis[z1 * w + x0]), d = level(vis[z1 * w + x1]);
                    tgt[z * W + x] = (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
                }
            }
            // separable 5-tap blur (≈1 tile) so the shroud edge is soft and round
            const tmp = this.fogTmp || (this.fogTmp = new Float32Array(W * H));
            for (let pass = 0; pass < 2; pass++) {
            for (let z = 0; z < H; z++) { const o = z * W; for (let x = 0; x < W; x++) { const a = x > 1 ? x - 2 : 0, b = x > 0 ? x - 1 : 0, c = x < W - 1 ? x + 1 : W - 1, d = x < W - 2 ? x + 2 : W - 1; tmp[o + x] = (tgt[o + a] + tgt[o + b] * 2 + tgt[o + x] * 2 + tgt[o + c] * 2 + tgt[o + d]) * 0.125; } }
            for (let z = 0; z < H; z++) { const a = (z > 1 ? z - 2 : 0) * W, b = (z > 0 ? z - 1 : 0) * W, c = (z < H - 1 ? z + 1 : H - 1) * W, d = (z < H - 2 ? z + 2 : H - 1) * W, o = z * W; for (let x = 0; x < W; x++) tgt[o + x] = (tmp[a + x] + tmp[b + x] * 2 + tmp[o + x] * 2 + tmp[c + x] * 2 + tmp[d + x]) * 0.125; }
            }
            const cur = this.fogCur, data = this.fogData, k = this.fogFirst ? 1 : 1 - Math.exp(-dt * 6);
            let changed = false;
            for (let i = 0; i < W * H; i++) {
                const t = tgt[i]; let c = cur[i];
                if (c !== t) { c += (t - c) * k; if (Math.abs(c - t) < 1) c = t; cur[i] = c; const v = c | 0; if (data[i * 4] !== v) { data[i * 4] = v; changed = true; } }
            }
            this.fogFirst = false;
            this.fogSettled = !changed;
            if (changed) this.fogTex.needsUpdate = true;
        }

        // ------------------------------------------------------------ pools for effects / markers
        initPools() {
            this.pools = {};
            const mkPool = (name, n, make) => { const items = []; for (let i = 0; i < n; i++) { const it = make(i); it.active = false; if (it.obj) { it.obj.visible = false; this.fx.add(it.obj); } items.push(it); } this.pools[name] = { items, next: 0 }; };
            const add = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
            const unitBox = new THREE.BoxGeometry(1, 1, 1); unitBox.translate(0.5, 0, 0);
            this.tracerMat = add(0xffd98a);
            mkPool('tracer', 48, () => ({ obj: new THREE.Mesh(unitBox, this.tracerMat) }));
            this.boltMat = add(0xffb35a);
            mkPool('bolt', 32, () => ({ obj: new THREE.Mesh(unitBox, this.boltMat) }));
            const rocketGeo = new THREE.ConeGeometry(0.05, 0.28, 5); rocketGeo.rotateZ(-Math.PI / 2);
            const rocketMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false });
            mkPool('rocket', 24, () => ({ obj: new THREE.Mesh(rocketGeo, rocketMat) }));
            const arcGeo = new THREE.SphereGeometry(0.11, 8, 6), arcMat = add(0xffc06a);
            mkPool('arc', 16, () => ({ obj: new THREE.Mesh(arcGeo, arcMat) }));
            mkPool('flash', 40, () => ({ obj: new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })) }));
            const ringGeo = new THREE.RingGeometry(0.82, 1, 40); ringGeo.rotateX(-Math.PI / 2);
            mkPool('shock', 12, () => ({ obj: new THREE.Mesh(ringGeo, add(0xffc890)) }));
            const scorchGeo = new THREE.PlaneGeometry(1, 1); scorchGeo.rotateX(-Math.PI / 2);
            mkPool('scorch', 40, () => { const m = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ map: this.scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); m.renderOrder = 1; return { obj: m }; });
            // order markers: a ring that contracts + four chevrons
            const markRing = new THREE.RingGeometry(0.62, 0.78, 32); markRing.rotateX(-Math.PI / 2);
            mkPool('marker', 10, () => { const m = new THREE.Mesh(markRing, new THREE.MeshBasicMaterial({ color: 0x5cff8a, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })); m.renderOrder = 20; return { obj: m }; });
            // selection rings and building brackets
            const selGeo = new THREE.RingGeometry(0.86, 1, 40); selGeo.rotateX(-Math.PI / 2);
            this.selGeo = selGeo;
            this.bracketGeo = this.makeBracketGeo();
            this.selMatOwn = new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
            this.selMatEnemy = new THREE.MeshBasicMaterial({ color: 0xff6a55, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
            this.selMatHover = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false });
            mkPool('ring', 80, () => { const m = new THREE.Mesh(selGeo, this.selMatOwn); m.renderOrder = 3; return { obj: m }; });
            mkPool('bracket', 12, () => { const m = new THREE.Mesh(this.bracketGeo, this.selMatOwn); m.renderOrder = 3; return { obj: m }; });
            // debris (one instanced mesh)
            const dGeo = new THREE.BoxGeometry(0.14, 0.1, 0.12);
            this.debris = new THREE.InstancedMesh(dGeo, new THREE.MeshStandardMaterial({ color: lin(0x3a3d42), roughness: 0.8, flatShading: true }), 90);
            this.debris.count = 0; this.debris.frustumCulled = false; this.debris.castShadow = false; this.fx.add(this.debris);
            this.debrisList = [];
            // explosion lights (fixed count so shaders never recompile)
            this.lights = [];
            if (this.high) for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffa860, 0, 7, 2); this.fx.add(l); this.lights.push({ l, t: 0, life: 0, power: 0 }); }
            // rally flags
            this.rallyObjs = [];
            for (let i = 0; i < 2; i++) {
                const g = new THREE.Group();
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5), new THREE.MeshBasicMaterial({ color: 0xd8e6f5 })); pole.position.y = 0.5; g.add(pole);
                const clothGeo = new THREE.BufferGeometry();
                clothGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.98, 0, 0.42, 0.86, 0, 0, 0.7, 0], 3));
                const cloth = new THREE.Mesh(clothGeo, new THREE.MeshBasicMaterial({ color: 0x3aa0ff, side: THREE.DoubleSide, toneMapped: false })); g.add(cloth);
                const base = new THREE.Mesh(markRing, new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false })); base.scale.setScalar(0.45); g.add(base);
                const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.05, 0, 1, 0.05, 1], 3));
                const line = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: 0x7fc4ff, dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.85 }));
                line.frustumCulled = false;
                g.visible = false; line.visible = false; this.fx.add(g); this.fx.add(line);
                this.rallyObjs.push({ g, line, cloth });
            }
        }
        makeBracketGeo() {
            // four corner L shapes of a unit square (-0.5..0.5), flat on the ground
            const pos = [], L = 0.22, T = 0.05;
            const quad = (x0, z0, x1, z1) => { pos.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z0, x1, 0, z1, x0, 0, z1); };
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                const cx = 0.5 * sx, cz = 0.5 * sz;
                quad(Math.min(cx, cx - sx * L), Math.min(cz, cz - sz * T), Math.max(cx, cx - sx * L), Math.max(cz, cz - sz * T));
                quad(Math.min(cx, cx - sx * T), Math.min(cz, cz - sz * L), Math.max(cx, cx - sx * T), Math.max(cz, cz - sz * L));
            }
            const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            // make both windings visible
            return g;
        }
        take(name) {
            const p = this.pools[name]; const n = p.items.length;
            for (let k = 0; k < n; k++) { const it = p.items[(p.next + k) % n]; if (!it.active) { p.next = (p.next + k + 1) % n; it.active = true; it.obj.visible = true; return it; } }
            const it = p.items[p.next]; p.next = (p.next + 1) % n; it.active = true; it.obj.visible = true; return it; // steal the oldest
        }
        release(it) { it.active = false; it.obj.visible = false; }

        // ------------------------------------------------------------ entity views
        teamColor(t) { return (C.TEAMS[t] || C.TEAMS[0]).color; }
        createView(e) {
            const M = window.SF_MODELS;
            let model = null;
            try { model = e.kind === 'unit' ? M.unit(e.type, this.teamColor(e.team)) : M.building(e.type, this.teamColor(e.team)); } catch (err) { model = null; }
            if (!model) { model = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: this.teamColor(e.team) })); model.position.y = 0.25; }
            if (model.parent) model = model.clone();
            const obj = new THREE.Group(); obj.add(model);
            const def = e.kind === 'unit' ? C.UNITS[e.type] : C.BUILDINGS[e.type];
            let height = model.userData && model.userData.height;
            if (!height) { const box = new THREE.Box3().setFromObject(model); height = Math.max(0.3, box.max.y); }
            const wheelsSrc = (model.userData && model.userData.wheels) || (findNamed(model, 'wheels') && findNamed(model, 'wheels').userData.wheels) || [];
            const wheels = wheelsSrc.filter((w) => isDescendant(model, w));
            const parts = { turret: findNamed(model, 'turret'), barrel: findNamed(model, 'barrel'), muzzle: findNamed(model, 'muzzle'), arm: findNamed(model, 'arm'), rotor: findNamed(model, 'rotor'), flag: findNamed(model, 'flag'), crane: findNamed(model, 'crane'), cargo: findNamed(model, 'cargo'), wheels, wheelR: (model.userData && model.userData.wheelRadius) || 0.15 };
            if (parts.barrel) parts.barrelX = parts.barrel.position.x;
            if (parts.arm) parts.armRot = parts.arm.rotation.z;
            model.traverse((o) => { if (o.isMesh) { o.castShadow = this.high; o.receiveShadow = false; } });
            const v = { id: e.id, ent: e, team: e.team, kind: e.kind, type: e.type, obj, model, parts, height, def,
                radius: e.kind === 'unit' ? def.radius : Math.max(def.w, def.d) / 2,
                ang: e.angle || 0, tur: e.turret != null ? e.turret : (e.angle || 0), x: e.x, z: e.z, lastHp: e.hp, dmgT: -99, recoil: 0, phase: Math.random() * 6,
                smokeAcc: 0, remembered: false, shown: false, frame: 0 };
            obj.position.set(e.x, 0, e.z);
            this.root.add(obj);
            this.views.set(e.id, v);
            return v;
        }
        disposeView(v) { if (v.obj.parent) v.obj.parent.remove(v.obj); }
        tileVisible(x, z) {
            if (this.reveal) return true;
            const sim = this.sim, tx = Math.floor(x), tz = Math.floor(z);
            if (tx < 0 || tz < 0 || tx >= this.W || tz >= this.H) return false;
            return sim.teams[this.team].vis[tz * this.W + tx] === 2;
        }
        buildingSeen(e) {
            const b = C.BUILDINGS[e.type]; if (!b) return this.tileVisible(e.x, e.z);
            for (let z = e.tz; z < e.tz + b.d; z++) for (let x = e.tx; x < e.tx + b.w; x++) if (this.tileVisible(x + 0.5, z + 0.5)) return true;
            return false;
        }
        syncEntities(dt) {
            const sim = this.sim, alpha = clamp(sim.alpha || 0, 0, 1), frame = ++this.frameNo;
            const lowPower = sim.teams[this.team] && sim.teams[this.team].lowPower;
            for (const e of sim.entities.values()) {
                let v = this.views.get(e.id);
                if (!v) v = this.createView(e);
                v.ent = e; v.frame = frame;
                const px = e.prevX != null ? e.prevX : e.x, pz = e.prevZ != null ? e.prevZ : e.z;
                const x = px + (e.x - px) * alpha, z = pz + (e.z - pz) * alpha;
                let show;
                if (e.dead) show = false;
                else if (e.team === this.team || this.reveal) show = true;
                else if (e.kind === 'building') { const seen = this.buildingSeen(e); if (seen) { v.remembered = true; v.ghostHp = e.hp; } show = seen || v.remembered; v.stale = !seen; }
                else show = this.tileVisible(x, z);
                v.obj.visible = show; v.shown = show;
                if (!show) { v.x = x; v.z = z; continue; }
                const moved = Math.hypot(x - v.x, z - v.z);
                v.x = x; v.z = z;
                if (e.hp < v.lastHp - 0.01) v.dmgT = this.time;
                v.lastHp = e.hp;
                const k = 1 - Math.exp(-dt * 14);
                if (e.kind === 'unit') {
                    v.ang += angDiff(v.ang, e.angle || 0) * k;
                    v.obj.position.set(x, 0, z);
                    v.obj.rotation.y = -v.ang;
                    if (v.def.from === 'infantry') {
                        v.phase += moved * 9;
                        v.model.position.y = moved > 0.0005 ? Math.abs(Math.sin(v.phase)) * 0.045 : v.model.position.y * 0.8;
                    }
                    for (const w of v.parts.wheels) w.rotation.z -= moved / v.parts.wheelR;
                    if (v.parts.arm) {
                        const mining = e.state === 'harvest' && moved < 0.002;
                        const want = mining ? -0.22 + Math.sin(this.time * 5 + v.phase) * 0.13 : 0;
                        v.parts.arm.rotation.z += (want - v.parts.arm.rotation.z) * Math.min(1, dt * 10);
                        if (mining && Math.random() < dt * 6) this.harvestSpark(x + Math.cos(v.ang) * 0.7, z + Math.sin(v.ang) * 0.7);
                    }
                    if (v.parts.cargo) { const cap = C.UNITS[e.type] && C.UNITS[e.type].capacity || 500; v.parts.cargo.scale.y = Math.max(0.001, clamp((e.carry || 0) / cap, 0, 1)); }
                } else {
                    v.obj.position.set(x, 0, z);
                    const built = e.built == null ? 1 : clamp(e.built, 0, 1);
                    const eased = 1 - Math.pow(1 - built, 3);
                    v.model.position.y = -(1 - eased) * v.height * 1.02;
                    if (built < 1 && Math.random() < dt * 12) {
                        const b = v.def;
                        this.sparks.emit(e.tx + Math.random() * b.w, eased * v.height + 0.05, e.tz + Math.random() * b.d, (Math.random() - 0.5) * 1.5, 1.5 + Math.random(), (Math.random() - 0.5) * 1.5,
                            0.5, 0.12, 0.02, [1, 0.85, 0.5, 1], [1, 0.4, 0.1, 0], 1, 6);
                    }
                    if (v.parts.rotor && built >= 1 && !(e.team === this.team ? lowPower : sim.teams[e.team].lowPower)) v.parts.rotor.rotation.y += dt * 1.6;
                    if (v.parts.flag) v.parts.flag.rotation.y = Math.sin(this.time * 1.7 + v.phase) * 0.25;
                    if (v.parts.crane) v.parts.crane.rotation.y = Math.sin(this.time * 0.23 + v.phase) * 0.9;
                }
                if (v.parts.turret && e.turret != null) {
                    v.tur += angDiff(v.tur, e.turret) * (1 - Math.exp(-dt * 10));
                    v.parts.turret.rotation.y = -(v.tur - (e.kind === 'unit' ? v.ang : 0));
                }
                if (v.parts.barrel) { v.recoil = Math.max(0, v.recoil - dt * 6); v.parts.barrel.position.x = v.parts.barrelX - v.recoil * 0.1; }
                // damage smoke / fire
                const hpf = e.hp / (e.maxHp || 1);
                if (hpf < 0.55 && (e.kind === 'building' ? (e.built == null || e.built >= 1) : true)) {
                    v.smokeAcc += dt * (hpf < 0.25 ? 9 : 4) * (e.kind === 'building' ? 1.6 : 1);
                    while (v.smokeAcc > 1) {
                        v.smokeAcc -= 1;
                        const sx = x + (Math.random() - 0.5) * v.radius, sz = z + (Math.random() - 0.5) * v.radius, sy = v.height * 0.8;
                        this.smoke.emit(sx, sy, sz, 0.15 + Math.random() * 0.2, 0.7 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2, 2.2, 0.25, 1.2, [0.16, 0.16, 0.17, 0.55], [0.3, 0.3, 0.32, 0], 0.3, -0.1);
                        if (hpf < 0.25) this.sparks.emit(sx, sy * 0.9, sz, 0, 0.8, 0, 0.45, 0.35, 0.1, [1, 0.6, 0.2, 0.9], [0.9, 0.2, 0.05, 0], 0.5, -0.5);
                    }
                }
            }
            for (const [id, v] of this.views) {
                if (v.frame === frame) continue;
                // gone from the sim: an enemy building that died out of sight stays as a remembered ghost until scouted
                if (v.kind === 'building' && v.team !== this.team && v.remembered && !v.diedSeen && !this.buildingSeen(v.ent)) { v.obj.visible = true; v.stale = true; v.shown = true; continue; }
                this.disposeView(v); this.views.delete(id); this.selection.delete(id);
            }
        }

        // ------------------------------------------------------------ events → effects
        onEvents(events) {
            if (!this.sim) return;
            for (const ev of events) {
                switch (ev.type) {
                    case 'shot': this.fxShot(ev); break;
                    case 'impact': this.fxImpact(ev); break;
                    case 'death': this.fxDeath(ev); break;
                    case 'placed': { const v = this.views.get(ev.id), e = this.sim.entities.get(ev.id); if (e && e.team !== this.team) this.zoneDirty = true; if (e) this.dust(e.x, e.z, C.BUILDINGS[e.type] ? C.BUILDINGS[e.type].w : 2); if (v) v.placedT = this.time; this.zoneDirty = true; break; }
                    case 'spawn': { const e = this.sim.entities.get(ev.id); if (e && e.team === this.team) this.spawnGlow(e.x, e.z); break; }
                    case 'harvest': { const e = this.sim.entities.get(ev.id); if (e && this.tileVisible(e.x, e.z)) for (let i = 0; i < 6; i++) this.harvestSpark(e.x, e.z); break; }
                }
            }
        }
        seenAt(x, z) { return this.tileVisible(x, z); }
        muzzlePos(v, out) {
            if (v && v.shown && v.parts.muzzle) { v.obj.updateMatrixWorld(true); v.parts.muzzle.getWorldPosition(out); return out; }
            if (v) return out.set(v.x, v.height * 0.6, v.z);
            return null;
        }
        fxShot(ev) {
            const sx = ev.x, sz = ev.z, tx = ev.tx, tz = ev.tz;
            if (!this.seenAt(sx, sz) && !this.seenAt(tx, tz)) return;
            const v = this.views.get(ev.from);
            const w = C.WEAPONS[ev.weapon] || { projectile: 'bullet', speed: 0 };
            const start = this.muzzlePos(v, new THREE.Vector3()) || new THREE.Vector3(sx, 0.4, sz);
            if (v) v.recoil = 1;
            const tv = this.findTargetHeight(tx, tz);
            const end = new THREE.Vector3(tx, tv, tz);
            const dist = start.distanceTo(end);
            // muzzle flash
            if (this.seenAt(sx, sz)) {
                const big = w.projectile === 'shell' || w.projectile === 'arc';
                this.flash(start.x, start.y, start.z, big ? 0.9 : w.projectile === 'rocket' ? 0.6 : 0.38, big ? 0.12 : 0.07, big ? 0xffc070 : 0xffe2a8);
                if (big) for (let i = 0; i < 4; i++) this.smoke.emit(start.x, start.y, start.z, (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6, 1.0, 0.2, 0.7, [0.5, 0.48, 0.45, 0.5], [0.4, 0.4, 0.4, 0], 2, -0.2);
            }
            const kind = w.projectile;
            if (kind === 'bullet') {
                const it = this.take('tracer'); it.kind = 'tracer'; it.s = start; it.e = end; it.t = 0; it.dur = Math.max(0.05, dist / 60); it.len = Math.min(0.9, dist * 0.5);
            } else if (kind === 'rocket') {
                const it = this.take('rocket'); it.kind = 'rocket'; it.s = start; it.e = end; it.t = 0; it.dur = ev.dur > 0 ? ev.dur : Math.max(0.08, dist / (w.speed || 12)); it.arc = 0.25 + dist * 0.04; it.acc = 0;
            } else if (kind === 'shell') {
                const it = this.take('bolt'); it.kind = 'bolt'; it.s = start; it.e = end; it.t = 0; it.dur = ev.dur > 0 ? ev.dur : Math.max(0.06, dist / (w.speed || 18)); it.len = 0.45;
            } else if (kind === 'arc') {
                const it = this.take('arc'); it.kind = 'arc'; it.s = start; it.e = end; it.t = 0; it.dur = ev.dur > 0 ? ev.dur : Math.max(0.3, dist / (w.speed || 9)); it.arc = 1.2 + dist * 0.32; it.acc = 0;
            }
        }
        findTargetHeight(x, z) {
            let best = 0.35, bd = 1.2;
            for (const v of this.views.values()) {
                if (!v.shown) continue;
                const d = Math.abs(v.x - x) + Math.abs(v.z - z);
                if (d < bd) { bd = d; best = Math.min(v.height * 0.55, 1.2); }
            }
            return best;
        }
        fxImpact(ev) {
            if (!this.seenAt(ev.x, ev.z)) return;
            const w = C.WEAPONS[ev.weapon] || {}; const p = w.projectile;
            const y = this.findTargetHeight(ev.x, ev.z) * 0.6;
            if (p === 'bullet') {
                for (let i = 0; i < 3; i++) this.sparks.emit(ev.x, y, ev.z, (Math.random() - 0.5) * 2.5, Math.random() * 2, (Math.random() - 0.5) * 2.5, 0.18, 0.12, 0.02, [1, 0.9, 0.6, 1], [1, 0.5, 0.1, 0], 2, 8);
                this.smoke.emit(ev.x, 0.1, ev.z, 0, 0.3, 0, 0.5, 0.15, 0.4, [0.55, 0.5, 0.42, 0.35], [0.55, 0.5, 0.42, 0], 1, 0);
            } else {
                const s = p === 'arc' ? 1.6 : p === 'rocket' ? 0.8 : 0.9;
                this.explosion(ev.x, y, ev.z, s, p === 'arc');
                if (p === 'arc' || (ev.splash || 0) >= 0.5) this.scorch(ev.x, ev.z, s * 1.2);
            }
        }
        fxDeath(ev) {
            const v = this.views.get(ev.id);
            if (v) v.diedSeen = this.seenAt(ev.x, ev.z) || (v.kind === 'building' && this.buildingSeen(v.ent));
            const seen = this.seenAt(ev.x, ev.z) || (v && v.diedSeen);
            if (!seen) return;
            if (ev.sold) { this.dust(ev.x, ev.z, 2); return; }
            if (ev.kind === 'building') {
                const b = C.BUILDINGS[ev.what] || (v && v.def) || { w: 2, d: 2 };
                const n = 3 + b.w * b.d / 2;
                for (let i = 0; i < n; i++) {
                    const dx = (Math.random() - 0.5) * b.w * 0.8, dz = (Math.random() - 0.5) * b.d * 0.8;
                    this.later(i * 0.09, () => this.explosion(ev.x + dx, 0.4 + Math.random() * 0.8, ev.z + dz, 1.1 + Math.random() * 0.6, i === 0));
                }
                this.debrisBurst(ev.x, 0.6, ev.z, 18, 4);
                this.scorch(ev.x, ev.z, Math.max(b.w, b.d) * 1.4);
                for (let i = 0; i < 16; i++) this.smoke.emit(ev.x + (Math.random() - 0.5) * b.w, 0.4, ev.z + (Math.random() - 0.5) * b.d, (Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4, 3.5, 0.6, 2.4, [0.1, 0.1, 0.1, 0.7], [0.25, 0.25, 0.27, 0], 0.3, -0.05);
                this.shake(0.5);
            } else if (C.UNITS[ev.what || (v && v.type)] && C.UNITS[ev.what || (v && v.type)].from === 'infantry') {
                for (let i = 0; i < 6; i++) this.smoke.emit(ev.x, 0.15, ev.z, (Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 1.2, 0.8, 0.15, 0.5, [0.45, 0.42, 0.36, 0.6], [0.4, 0.38, 0.33, 0], 2, 0);
                this.flash(ev.x, 0.3, ev.z, 0.5, 0.1, 0xffc890);
            } else {
                this.explosion(ev.x, 0.35, ev.z, 1.3, true);
                this.debrisBurst(ev.x, 0.4, ev.z, 8, 3);
                this.scorch(ev.x, ev.z, 1.4);
                this.shake(0.2);
            }
        }
        later(t, fn) { (this.timers = this.timers || []).push({ t: this.time + t, fn }); }
        flash(x, y, z, size, life, color) {
            const it = this.take('flash'); it.obj.position.set(x, y, z); it.size = size; it.t = 0; it.life = life; it.obj.material.color.setHex(color || 0xffd9a0); it.obj.material.opacity = 1; it.obj.scale.set(size, size, 1); it.obj.renderOrder = 7;
        }
        explosion(x, y, z, s, big) {
            this.flash(x, y + 0.2, z, 2.2 * s, 0.16, 0xffb060);
            for (let i = 0; i < 14 * s; i++) {
                const a = Math.random() * TAU, sp = (1 + Math.random() * 2.2) * s;
                this.sparks.emit(x, y, z, Math.cos(a) * sp, 0.6 + Math.random() * 2.2 * s, Math.sin(a) * sp, 0.35 + Math.random() * 0.3, 0.55 * s, 0.15, [1, 0.85, 0.45, 1], [0.9, 0.25, 0.05, 0], 3, 2);
            }
            for (let i = 0; i < 8 * s; i++) {
                const a = Math.random() * TAU, sp = 0.4 + Math.random() * 0.8;
                this.smoke.emit(x + Math.cos(a) * 0.2, y + 0.1, z + Math.sin(a) * 0.2, Math.cos(a) * sp, 0.5 + Math.random() * 0.7, Math.sin(a) * sp, 1.6 + Math.random(), 0.5 * s, 1.7 * s, [0.12, 0.11, 0.1, 0.75], [0.32, 0.31, 0.3, 0], 1.2, -0.08);
            }
            if (big) {
                const sh = this.take('shock'); sh.obj.position.set(x, 0.06, z); sh.t = 0; sh.life = 0.45; sh.size = 1.8 * s; sh.obj.scale.setScalar(0.2);
                for (const L of this.lights) if (L.t >= L.life) { L.l.position.set(x, 1.2, z); L.t = 0; L.life = 0.35; L.power = 3.5 * s; break; }
            }
            this.emit('boom', { x, z, s });
        }
        debrisBurst(x, y, z, n, sp) {
            for (let i = 0; i < n; i++) {
                if (this.debrisList.length >= 90) this.debrisList.shift();
                const a = Math.random() * TAU, v = (0.5 + Math.random()) * sp * 0.6;
                this.debrisList.push({ x, y, z, vx: Math.cos(a) * v, vy: 2 + Math.random() * sp, vz: Math.sin(a) * v, rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 14, t: 0, life: 2.2 + Math.random(), s: 0.6 + Math.random() * 1.2 });
            }
        }
        scorch(x, z, s) { const it = this.take('scorch'); it.obj.position.set(x, 0.015, z); it.obj.scale.set(s * 1.6, 1, s * 1.6); it.obj.rotation.y = Math.random() * TAU; it.t = 0; it.life = 30; it.obj.material.opacity = 0.9; }
        dust(x, z, s) { for (let i = 0; i < 14 * s; i++) { const a = Math.random() * TAU, r = s * 0.6; this.smoke.emit(x + Math.cos(a) * r, 0.1, z + Math.sin(a) * r, Math.cos(a) * 0.9, 0.15 + Math.random() * 0.3, Math.sin(a) * 0.9, 1.2, 0.3, 1.0, [0.6, 0.55, 0.45, 0.55], [0.55, 0.5, 0.42, 0], 2, 0); } }
        spawnGlow(x, z) { for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; this.sparks.emit(x + Math.cos(a) * 0.4, 0.1, z + Math.sin(a) * 0.4, 0, 0.9, 0, 0.6, 0.18, 0.05, [0.45, 0.8, 1, 0.9], [0.2, 0.5, 1, 0], 0, 0); } }
        harvestSpark(x, z) { this.sparks.emit(x + (Math.random() - 0.5) * 0.5, 0.2, z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.8, 0.8 + Math.random(), (Math.random() - 0.5) * 0.8, 0.6, 0.14, 0.03, [0.6, 1, 0.9, 1], [0.15, 0.85, 0.7, 0], 1, 2.5); }
        shake(a) { this.cam.shake = Math.min(1, this.cam.shake + a); }

        updateFx(dt) {
            if (this.timers && this.timers.length) {
                const due = this.timers.filter((t) => t.t <= this.time); this.timers = this.timers.filter((t) => t.t > this.time);
                for (const t of due) t.fn();
            }
            // projectiles
            for (const name of ['tracer', 'bolt', 'rocket', 'arc']) {
                for (const it of this.pools[name].items) {
                    if (!it.active) continue;
                    it.t += dt / it.dur;
                    if (it.t >= 1) { this.release(it); continue; }
                    const s = it.s, e = it.e, t = it.t;
                    if (name === 'tracer' || name === 'bolt') {
                        tmpV.subVectors(e, s); const d = tmpV.length(); tmpV.normalize();
                        const head = Math.min(d, d * t + it.len * 0.5), tail = Math.max(0, head - it.len);
                        it.obj.position.copy(s).addScaledVector(tmpV, tail);
                        it.obj.quaternion.setFromUnitVectors(AX_X, tmpV);
                        const thick = name === 'bolt' ? 0.075 : 0.032;
                        it.obj.scale.set(Math.max(0.01, head - tail), thick, thick);
                    } else {
                        const y = lerp(s.y, e.y, t) + 4 * it.arc * t * (1 - t);
                        const x = lerp(s.x, e.x, t), z = lerp(s.z, e.z, t);
                        const ny = lerp(s.y, e.y, t + 0.02) + 4 * it.arc * (t + 0.02) * (1 - t - 0.02);
                        tmpV.set(lerp(s.x, e.x, t + 0.02) - x, ny - y, lerp(s.z, e.z, t + 0.02) - z).normalize();
                        it.obj.position.set(x, y, z); it.obj.quaternion.setFromUnitVectors(AX_X, tmpV);
                        it.acc += dt;
                        while (it.acc > 0.016) {
                            it.acc -= 0.016;
                            this.smoke.emit(x, y, z, (Math.random() - 0.5) * 0.1, 0.1, (Math.random() - 0.5) * 0.1, name === 'arc' ? 0.6 : 0.7, 0.1, 0.42, [0.75, 0.72, 0.68, 0.5], [0.6, 0.6, 0.6, 0], 1, -0.1);
                            this.sparks.emit(x, y, z, 0, 0, 0, 0.12, name === 'arc' ? 0.35 : 0.26, 0.05, [1, 0.8, 0.4, 1], [1, 0.3, 0.05, 0], 0, 0);
                        }
                    }
                }
            }
            for (const it of this.pools.flash.items) {
                if (!it.active) continue;
                it.t += dt; const k = it.t / it.life;
                if (k >= 1) { this.release(it); continue; }
                const s = it.size * (1 + k * 0.6); it.obj.scale.set(s, s, 1); it.obj.material.opacity = 1 - k;
            }
            for (const it of this.pools.shock.items) {
                if (!it.active) continue;
                it.t += dt; const k = it.t / it.life;
                if (k >= 1) { this.release(it); continue; }
                it.obj.scale.setScalar(0.2 + it.size * Math.sqrt(k)); it.obj.material.opacity = (1 - k) * 0.8;
            }
            for (const it of this.pools.scorch.items) {
                if (!it.active) continue;
                it.t += dt; if (it.t >= it.life) { this.release(it); continue; }
                it.obj.material.opacity = 0.9 * Math.min(1, (it.life - it.t) / 6);
            }
            for (const it of this.pools.marker.items) {
                if (!it.active) continue;
                it.t += dt; const k = it.t / 0.7;
                if (k >= 1) { this.release(it); continue; }
                it.obj.scale.setScalar(lerp(1.5, 0.45, 1 - Math.pow(1 - k, 3)) * it.s); it.obj.material.opacity = k < 0.7 ? 1 : (1 - k) / 0.3;
            }
            for (const L of this.lights) { if (L.t < L.life) { L.t += dt; L.l.intensity = L.power * Math.max(0, 1 - L.t / L.life); } else L.l.intensity = 0; }
            // debris
            const dl = this.debrisList;
            for (let i = dl.length - 1; i >= 0; i--) {
                const d = dl[i]; d.t += dt;
                if (d.t > d.life) { dl.splice(i, 1); continue; }
                d.vy -= 9.8 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.spin * dt; d.ry += d.spin * 0.7 * dt;
                if (d.y < 0.05) { d.y = 0.05; d.vy *= -0.35; d.vx *= 0.6; d.vz *= 0.6; d.spin *= 0.6; }
                if (d.y > 0.3 && Math.random() < dt * 20) this.smoke.emit(d.x, d.y, d.z, 0, 0.2, 0, 0.5, 0.1, 0.3, [0.2, 0.2, 0.2, 0.5], [0.3, 0.3, 0.3, 0], 1, 0);
            }
            this.debris.count = dl.length;
            for (let i = 0; i < dl.length; i++) {
                const d = dl[i]; const s = d.s * Math.min(1, (d.life - d.t) * 2);
                tmpQ.setFromEuler(new THREE.Euler(d.rx, d.ry, 0)); tmpS.setScalar(s); tmpV.set(d.x, d.y, d.z);
                tmpM.compose(tmpV, tmpQ, tmpS); this.debris.setMatrixAt(i, tmpM);
            }
            this.debris.instanceMatrix.needsUpdate = true;
            this.sparks.update(dt); this.smoke.update(dt);
        }

        // ------------------------------------------------------------ selection rings, ghost, rally, markers
        setSelection(ids) { this.selection = new Set(ids); }
        setHover(id) { this.hover = id; }
        marker(x, z, kind) {
            const colors = { move: 0x5cff8a, attack: 0xff4d3d, attackMove: 0xffa63a, harvest: 0x40f0c8, rally: 0x5aaeff, place: 0x5aaeff };
            const it = this.take('marker'); it.obj.position.set(x, 0.05, z); it.obj.material.color.setHex(colors[kind] || colors.move); it.t = 0; it.s = kind === 'attack' ? 1.2 : 1;
        }
        // rallies: [{ x, z, fromX, fromZ }] (up to two)
        setRallies(list) { this.rallies = list || []; }
        setGhost(type, tx, tz, ok) {
            if (!type) { if (this.ghost) this.ghost.group.visible = false; this.zone.visible = false; this.ghostType = null; return; }
            if (!this.ghost || this.ghost.type !== type) {
                if (this.ghost) this.root.remove(this.ghost.group);
                const b = C.BUILDINGS[type]; const group = new THREE.Group();
                const tileGeo = new THREE.PlaneGeometry(0.92, 0.92); tileGeo.rotateX(-Math.PI / 2);
                const tiles = new THREE.InstancedMesh(tileGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }), b.w * b.d);
                tiles.frustumCulled = false; tiles.renderOrder = 4;
                const col = new THREE.Color(1, 1, 1);
                for (let i = 0; i < b.w * b.d; i++) { tmpM.makeTranslation((i % b.w) + 0.5, 0.04, Math.floor(i / b.w) + 0.5); tiles.setMatrixAt(i, tmpM); tiles.setColorAt(i, col); }
                group.add(tiles);
                let model = null;
                try { model = window.SF_MODELS.building(type, this.teamColor(this.team)); if (model.parent) model = model.clone(); } catch (e) { model = null; }
                const gm = this.ghostMat = this.ghostMat || new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false });
                if (model) { model.traverse((o) => { if (o.isMesh) { o.material = gm; o.castShadow = false; } }); model.position.set(b.w / 2, 0, b.d / 2); group.add(model); }
                group.traverse((o) => { o.renderOrder = 4; });
                this.root.add(group);
                this.ghost = { type, group, tiles, b };
                this.zoneDirty = true;
            }
            const g = this.ghost; g.group.visible = true; this.zone.visible = true; this.ghostType = type;
            g.group.position.set(tx, 0, tz);
            const col = new THREE.Color();
            for (let i = 0; i < g.b.w * g.b.d; i++) {
                const x = tx + (i % g.b.w), z = tz + Math.floor(i / g.b.w);
                const tileOk = ok && this.sim.passable(x, z);
                const bad = !this.sim.passable(x, z) || (this.sim.map.tiles[z * this.W + x] === 2);
                col.setHex(bad ? 0xff3b30 : ok ? 0x39ff7a : 0xffb020);
                g.tiles.setColorAt(i, col);
            }
            if (g.tiles.instanceColor) g.tiles.instanceColor.needsUpdate = true;
            this.ghostMat.color.setHex(ok ? 0x8fd0ff : 0xff6a5a);
        }
        updateOverlays(dt) {
            const ringPool = this.pools.ring.items, brPool = this.pools.bracket.items;
            let ri = 0, bi = 0;
            const want = new Set(this.selection); if (this.hover != null) want.add(this.hover);
            for (const id of want) {
                const v = this.views.get(id); if (!v || !v.shown) continue;
                const mat = id === this.hover && !this.selection.has(id) ? this.selMatHover : (v.team === this.team ? this.selMatOwn : this.selMatEnemy);
                if (v.kind === 'unit') {
                    if (ri >= ringPool.length) continue;
                    const it = ringPool[ri++]; it.obj.visible = true; it.obj.material = mat;
                    it.obj.position.set(v.x, 0.04, v.z); it.obj.scale.setScalar(Math.max(0.32, v.radius * 1.35));
                } else {
                    if (bi >= brPool.length) continue;
                    const it = brPool[bi++]; it.obj.visible = true; it.obj.material = mat;
                    const b = v.def, pulse = 1 + Math.sin(this.time * 4) * 0.015;
                    it.obj.position.set(v.x, 0.05, v.z); it.obj.scale.set((b.w + 0.25) * pulse, 1, (b.d + 0.25) * pulse);
                }
            }
            for (; ri < ringPool.length; ri++) ringPool[ri].obj.visible = false;
            for (; bi < brPool.length; bi++) brPool[bi].obj.visible = false;
            // rally flags
            const rl = this.rallies || [];
            this.rallyObjs.forEach((r, i) => {
                const it = rl[i];
                if (!it) { r.g.visible = false; r.line.visible = false; return; }
                r.g.visible = true; r.line.visible = true; r.g.position.set(it.x, 0, it.z);
                r.cloth.rotation.y = Math.sin(this.time * 2.2 + i) * 0.3;
                const p = r.line.geometry.attributes.position; p.setXYZ(0, it.fromX, 0.06, it.fromZ); p.setXYZ(1, it.x, 0.06, it.z); p.needsUpdate = true;
                r.line.computeLineDistances();
            });
            if (this.zoneDirty && this.zone.visible) { this.refreshBuildZone(); this.zoneDirty = false; }
            if (this.zone.visible) this.zone.material.opacity = 0.75 + Math.sin(this.time * 3) * 0.25;
        }

        // ------------------------------------------------------------ health bars (2D overlay)
        drawBars() {
            const g = this.hctx, pr = this.hudPr; const w = this.width, h = this.height;
            g.setTransform(pr, 0, 0, pr, 0, 0);
            g.clearRect(0, 0, w, h);
            if (!this.sim || this.attract) return;
            const scale = this.pxPerUnit();
            for (const v of this.views.values()) {
                if (!v.shown) continue;
                const e = v.ent, sel = this.selection.has(v.id), hov = this.hover === v.id;
                const hpf = clamp((v.stale && v.ghostHp != null ? v.ghostHp : e.hp) / (e.maxHp || 1), 0, 1);
                const recent = this.time - v.dmgT < 3;
                const show = sel || hov || recent || (v.kind === 'building' && hpf < 0.5 && e.team === this.team);
                if (!show) continue;
                tmpV.set(v.x, v.height + 0.22, v.z).project(this.camera);
                if (tmpV.z > 1 || tmpV.x < -1.1 || tmpV.x > 1.1 || tmpV.y < -1.1 || tmpV.y > 1.1) continue;
                const sx = (tmpV.x + 1) / 2 * w, sy = (1 - tmpV.y) / 2 * h;
                const bw = Math.round(clamp((v.kind === 'unit' ? v.radius * 2.6 : v.def.w * 0.9) * scale, 22, 96));
                const bh = v.kind === 'unit' ? 4 : 5;
                const x = Math.round(sx - bw / 2), y = Math.round(sy - bh);
                g.globalAlpha = sel || hov ? 1 : 0.85;
                g.fillStyle = 'rgba(4,8,14,0.85)'; g.fillRect(x - 1, y - 1, bw + 2, bh + 2);
                g.fillStyle = hpf > 0.6 ? '#3fe07a' : hpf > 0.3 ? '#ffc13b' : '#ff4b3a';
                if (e.team !== this.team && hpf > 0.6) g.fillStyle = '#ff7a52';
                g.fillRect(x, y, Math.max(1, Math.round(bw * hpf)), bh);
                // segment ticks
                g.fillStyle = 'rgba(4,8,14,0.55)';
                const seg = v.kind === 'unit' ? 4 : 6;
                for (let s = 1; s < seg; s++) g.fillRect(x + Math.round(bw * s / seg), y, 1, bh);
                if (e.carry != null && v.type === 'harvester' && e.team === this.team && (sel || hov)) {
                    const cap = (C.UNITS.harvester.capacity || 500), cf = clamp(e.carry / cap, 0, 1);
                    g.fillStyle = 'rgba(4,8,14,0.85)'; g.fillRect(x - 1, y + bh + 1, bw + 2, 4);
                    g.fillStyle = '#5fe8ff'; g.fillRect(x, y + bh + 2, Math.round(bw * cf), 2);
                }
                g.globalAlpha = 1;
            }
        }
        pxPerUnit(depth) {
            const d = depth || this.cam.dist;
            return this.height / (2 * Math.tan(this.camera.fov * DEG / 2) * d);
        }

        // ------------------------------------------------------------ camera
        resize() {
            const r = this.container.getBoundingClientRect();
            const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
            this.width = w; this.height = h;
            this.gl.setSize(w, h, false);
            this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
            this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
            this.hudPr = Math.min(window.devicePixelRatio || 1, 2);
            this.hud.width = Math.round(w * this.hudPr); this.hud.height = Math.round(h * this.hudPr);
            this.hud.style.width = w + 'px'; this.hud.style.height = h + 'px';
            this.sparks.mat.uniforms.uScale.value = this.smoke.mat.uniforms.uScale.value = h * this.gl.getPixelRatio() / (2 * Math.tan(this.camera.fov * DEG / 2));
            this.placeCamera();
        }
        // visible ground width at the screen centre for a camera distance
        viewWidthAt(dist) { const vf = this.camera.fov * DEG; return 2 * dist * Math.tan(vf / 2) * this.camera.aspect; }
        fitWidth(tiles) { const vf = this.camera.fov * DEG; this.cam.dist = clamp(tiles / (2 * Math.tan(vf / 2) * this.camera.aspect), this.cam.minDist, this.cam.maxDist); this.placeCamera(); }
        setZoomLimits(min, max) { this.cam.minDist = min; this.cam.maxDist = max; this.cam.dist = clamp(this.cam.dist, min, max); this.placeCamera(); }
        clampCam() {
            const W = this.W || 64, H = this.H || 64, c = this.cam;
            c.x = clamp(c.x, -1, W + 1); c.z = clamp(c.z, -1, H + 2);
            c.dist = clamp(c.dist, c.minDist, c.maxDist);
        }
        placeCamera() {
            this.clampCam();
            const c = this.cam, p = this.pitch;
            let sx = 0, sz = 0;
            if (c.shake > 0.01) { sx = (Math.random() - 0.5) * c.shake * 0.35; sz = (Math.random() - 0.5) * c.shake * 0.35; }
            this.camera.position.set(c.x + sx, c.dist * Math.sin(p), c.z + c.dist * Math.cos(p) + sz);
            this.camera.lookAt(c.x + sx, 0, c.z + sz);
            this.camera.updateMatrixWorld();
            if (this.high) {
                const sc = this.sun.shadow.camera, r = Math.max(14, c.dist * 0.95);
                sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.updateProjectionMatrix();
                const snap = (2 * r) / 2048; const tx = Math.round(c.x / snap) * snap, tz = Math.round((c.z - 2) / snap) * snap;
                this.sun.position.set(tx - 14, 30, tz + 10); this.sun.target.position.set(tx, 0, tz); this.sun.target.updateMatrixWorld();
            }
        }
        centerOn(x, z, instant) {
            if (instant) { this.cam.anim = null; this.cam.x = x; this.cam.z = z; this.placeCamera(); return; }
            this.cam.anim = { fx: this.cam.x, fz: this.cam.z, tx: x, tz: z, t: 0 };
        }
        panScreen(dx, dy) {
            // drag the ground under the pointer: exact world delta between two screen points near the centre
            const cx = this.width / 2, cy = this.height / 2;
            const a = this.screenToGround(cx, cy), b = this.screenToGround(cx + dx, cy + dy);
            if (!a || !b) return;
            this.cam.anim = null;
            this.cam.x -= b.x - a.x; this.cam.z -= b.z - a.z; this.placeCamera();
        }
        panWorld(dx, dz) { this.cam.anim = null; this.cam.x += dx; this.cam.z += dz; this.placeCamera(); }
        zoomAt(factor, sx, sy) {
            const before = sx != null ? this.screenToGround(sx, sy) : null;
            this.cam.dist = clamp(this.cam.dist * factor, this.cam.minDist, this.cam.maxDist);
            this.placeCamera();
            if (before) { const after = this.screenToGround(sx, sy); if (after) { this.cam.x += before.x - after.x; this.cam.z += before.z - after.z; this.placeCamera(); } }
        }
        rayAt(sx, sy) {
            tmpV2.set((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1);
            this.raycaster.setFromCamera(tmpV2, this.camera);
            return this.raycaster.ray;
        }
        screenToGround(sx, sy) {
            const ray = this.rayAt(sx, sy);
            if (ray.direction.y > -1e-4) return null;
            const t = -ray.origin.y / ray.direction.y;
            return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
        }
        worldToScreen(x, y, z) {
            tmpV.set(x, y, z).project(this.camera);
            return { x: (tmpV.x + 1) / 2 * this.width, y: (1 - tmpV.y) / 2 * this.height, behind: tmpV.z > 1 };
        }
        viewCorners() {
            const w = this.width, h = this.height;
            return [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => this.screenToGround(x, y) || { x: this.cam.x, z: this.cam.z });
        }

        // ------------------------------------------------------------ picking
        pick(sx, sy, touch) {
            let best = null, bestScore = Infinity;
            const scale = this.pxPerUnit();
            const minPx = touch ? 26 : 14;
            for (const v of this.views.values()) {
                if (!v.shown || v.kind !== 'unit') continue;
                const p = this.worldToScreen(v.x, v.height * 0.45, v.z);
                const d = Math.hypot(p.x - sx, p.y - sy);
                const r = Math.max(minPx, v.radius * 1.5 * scale);
                if (d < r && d / r < bestScore) { bestScore = d / r; best = v; }
            }
            if (best) return best.id;
            const ray = this.rayAt(sx, sy), box = new THREE.Box3(); let bt = Infinity;
            for (const v of this.views.values()) {
                if (!v.shown || v.kind !== 'building') continue;
                const b = v.def, e = v.ent, pad = touch ? 0.25 : 0.05;
                const tx = e.tx != null ? e.tx : v.x - b.w / 2, tz = e.tz != null ? e.tz : v.z - b.d / 2;
                box.min.set(tx - pad, 0, tz - pad); box.max.set(tx + b.w + pad, v.height * (e.built == null ? 1 : Math.max(0.2, e.built)), tz + b.d + pad);
                const hit = ray.intersectBox(box, tmpV);
                if (hit) { const t = hit.distanceTo(ray.origin); if (t < bt) { bt = t; best = v; } }
            }
            return best ? best.id : null;
        }
        unitsInRect(x0, y0, x1, y1, team) {
            const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1), out = [];
            for (const v of this.views.values()) {
                if (!v.shown || v.kind !== 'unit' || v.team !== team || v.ent.dead) continue;
                const p = this.worldToScreen(v.x, v.height * 0.4, v.z);
                if (p.x >= ax && p.x <= bx && p.y >= ay && p.y <= by) out.push(v.id);
            }
            return out;
        }
        onScreen(pred) {
            const out = [];
            for (const v of this.views.values()) {
                if (!v.shown || v.ent.dead) continue;
                const p = this.worldToScreen(v.x, 0.3, v.z);
                if (p.behind || p.x < 0 || p.y < 0 || p.x > this.width || p.y > this.height) continue;
                if (!pred || pred(v.ent)) out.push(v.id);
            }
            return out;
        }
        isShown(id) { const v = this.views.get(id); return !!(v && v.shown); }

        // ------------------------------------------------------------ thumbnails for the build sidebar
        thumbnail(kind, type, team) {
            const key = kind + ':' + type + ':' + (team || 0);
            if (this.thumbs.has(key)) return this.thumbs.get(key);
            let url = null;
            try {
                const M = window.SF_MODELS; const color = this.teamColor(team || 0);
                let model = kind === 'unit' ? M.unit(type, color) : M.building(type, color);
                if (model.parent) model = model.clone();
                const S = 160;
                if (!this.thumbScene) {
                    const s = new THREE.Scene();
                    s.add(new THREE.HemisphereLight(0xcfe0ff, 0x30281e, 1.0));
                    const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(-3, 6, 4); s.add(d);
                    const d2 = new THREE.DirectionalLight(0x7fa8ff, 0.6); d2.position.set(4, 2, -3); s.add(d2);
                    this.thumbScene = s; this.thumbCam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
                    this.thumbRT = new THREE.WebGLRenderTarget(S, S, { format: THREE.RGBAFormat });
                    this.thumbRT.texture.encoding = THREE.sRGBEncoding;
                }
                const holder = new THREE.Group(); holder.add(model); holder.rotation.y = kind === 'unit' ? -0.7 : -0.5;
                this.thumbScene.add(holder);
                const box = new THREE.Box3().setFromObject(holder), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
                const rad = Math.max(size.x, size.y, size.z) * 0.62 + 0.01;
                const cam = this.thumbCam, dist = rad / Math.sin(15 * DEG);
                cam.position.set(ctr.x + dist * 0.55, ctr.y + dist * 0.62, ctr.z + dist * 0.56); cam.lookAt(ctr); cam.updateMatrixWorld();
                const prevRT = this.gl.getRenderTarget(), prevClear = this.gl.getClearAlpha(), prevColor = this.gl.getClearColor(new THREE.Color());
                this.gl.setRenderTarget(this.thumbRT); this.gl.setClearColor(0x000000, 0); this.gl.clear();
                this.gl.render(this.thumbScene, cam);
                const px = new Uint8Array(S * S * 4); this.gl.readRenderTargetPixels(this.thumbRT, 0, 0, S, S, px);
                this.gl.setRenderTarget(prevRT); this.gl.setClearColor(prevColor, prevClear);
                this.thumbScene.remove(holder);
                const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const img = g.createImageData(S, S);
                for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
                g.putImageData(img, 0, 0);
                url = c.toDataURL('image/png');
            } catch (e) { url = null; }
            this.thumbs.set(key, url);
            return url;
        }

        // ------------------------------------------------------------ frame
        on(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); }
        emit(name, data) { const l = this.listeners[name]; if (l) for (const fn of l) fn(data); }
        update(dt) {
            this.time += dt;
            const c = this.cam;
            if (c.anim) {
                c.anim.t = Math.min(1, c.anim.t + dt / 0.35); const k = 1 - Math.pow(1 - c.anim.t, 3);
                c.x = lerp(c.anim.fx, c.anim.tx, k); c.z = lerp(c.anim.fz, c.anim.tz, k);
                if (c.anim.t >= 1) c.anim = null;
            }
            if (this.attract && this.W) { c.x = this.W * 0.5 + Math.sin(this.time * 0.05) * this.W * 0.3; c.z = this.H * 0.5 + Math.cos(this.time * 0.037) * this.H * 0.28; }
            c.shake = Math.max(0, c.shake - dt * 2.5);
            this.placeCamera();
            if (this.sim) {
                this.syncEntities(dt);
                this.updateFog(dt);
                this.groundTimer += dt;
                if (this.groundTimer > 0.5) {
                    this.groundTimer = 0; this.updateShards(false);
                    const map = this.sim.map; let diff = false;
                    for (let i = 0; i < map.w * map.h; i++) { const s = map.tiles[i] === 2 && map.shards[i] > 0 ? 1 : 0; if (s !== this.shardSeen[i]) { this.shardSeen[i] = s; diff = true; } }
                    if (diff) { this.groundDirtyAt = this.groundDirtyAt || this.time; }
                    if (this.groundDirtyAt && this.time - this.groundDirtyAt > 2) { this.paintGround(map); this.groundDirtyAt = 0; }
                }
                for (const r of this.spireRings) r.rotation.y += dt * 0.6;
                for (const o of this.root.children) if (o.userData.spireGlow) o.material.opacity = 0.28 + Math.sin(this.time * 2 + o.position.x) * 0.08;
            }
            this.updateFx(dt);
            this.updateOverlays(dt);
            const m = this.fogMat.uniforms;
            m.uInv.value.multiplyMatrices(this.camera.matrixWorld, this.camera.projectionMatrixInverse);
            m.uCam.value.copy(this.camera.position); m.uTime.value = this.time;
            this.fogQuad.visible = !!this.sim && !this.reveal;
            this.gl.render(this.scene, this.camera);
            this.drawBars();
        }
    }
    SF.Renderer = Renderer;
})();
