// 3D WebGL Studio Viewer for StudForge: orbit/pan camera, exploded view, build steps.
//
// Rendering is set up for plastic: sRGB output with ACES tone mapping, a procedural studio
// environment map (soft sky + softboxes through PMREMGenerator) for the reflections and
// highlights, a warm shadow-casting key light with a cool fill, a rim and a hemisphere ambient,
// plus a soft contact shadow under the model. `quality` is 'high' or 'lite' (small or low-core
// devices): lite uses a 1024 shadow map and simpler brick materials (see BrickBuilder).
// Other modules read `keyLight`, `fillLight`, `rimLight`, `hemiLight`, `pedestal`, `grid`,
// `brickBuilder.materialsCache` and `renderer`; keep those names.
class StudForgeViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.quality = StudForgeViewer.detectQuality();
        this.brickBuilder = new BrickBuilder({ quality: this.quality });
        this.activeModel = null;
        this.brickMeshes = [];
        this.modelGroup = new THREE.Group();

        this.explodeProgress = 0;   // 0..1
        this.maxLayer = 0;          // the last build step index
        this.currentStep = 0;
        this.isStepMode = false;
        this.extent = 10;           // the model's size, for the camera and the explode distances
        this.height = 4;

        this.isDragging = false;
        this.isPanning = false;
        this.previousMousePosition = { x: 0, y: 0 };
        this.spherical = { radius: 18, theta: Math.PI / 4, phi: Math.PI / 3 };
        this.home = { radius: 18, theta: Math.PI / 4, phi: Math.PI / 3 };
        this.target = new THREE.Vector3(0, 2.5, 0);
        this.homeTarget = this.target.clone();

        this.initThree();
        this.initEnvironment();
        this.initLighting();
        this.initWorkbenchFloor();
        this.initInputListeners();

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    /** 'lite' on phones and low-core machines; `?quality=` or localStorage 'studforge.quality' overrides. */
    static detectQuality() {
        let forced = null;
        try { forced = new URLSearchParams(location.search).get('quality') || localStorage.getItem('studforge.quality'); } catch (e) { /* no storage */ }
        if (forced === 'high' || forced === 'lite') return forced;
        const cores = navigator.hardwareConcurrency || 8;
        const small = Math.min(window.innerWidth, window.innerHeight) < 700;
        return (cores <= 4 || small) ? 'lite' : 'high';
    }

    initThree() {
        const w = this.container.clientWidth || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;
        this.small = Math.min(window.innerWidth, window.innerHeight) < 700;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0e121a);   // the clear colour is written as-is, so no conversion
        this.scene.fog = new THREE.Fog(new THREE.Color(0x0e121a).convertSRGBToLinear(), 60, 140);

        this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 500);
        this.updateCameraPosition();

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.small ? 1.5 : 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.8;
        this.container.appendChild(this.renderer.domElement);
        this.scene.add(this.modelGroup);
    }

    /**
     * A procedural photo-studio environment: a soft grey gradient sky with three big bright
     * softboxes (key above-left-front, fill right, a strip behind), prefiltered by PMREMGenerator.
     * Every brick reflects it, which is where the plastic sheen and the edge highlights come from.
     */
    initEnvironment() {
        const env = new THREE.Scene();
        const sky = new THREE.SphereGeometry(40, 24, 12);
        const colors = [], p = sky.attributes.position;
        const bottom = new THREE.Color(0x0b0d12), horizon = new THREE.Color(0x3a3f4a), top = new THREE.Color(0x7d8696);
        for (let i = 0; i < p.count; i++) {
            const t = p.getY(i) / 40;   // -1..1
            const c = t < 0 ? bottom.clone().lerp(horizon, t + 1) : horizon.clone().lerp(top, t);
            colors.push(c.r, c.g, c.b);
        }
        sky.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        env.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
        // Softboxes: emissive planes brighter than white, aimed at the origin.
        const box = (w, h, x, y, z, brightness, tint = 0xffffff) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(brightness), side: THREE.DoubleSide }));
            m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
        };
        box(16, 12, -14, 18, 12, 3.5, 0xfff4e6);    // key: big, warm, high and to the front-left
        box(12, 10, 20, 8, -4, 1.6, 0xe8f0ff);      // fill: cooler, lower, to the right
        box(14, 3, 0, 26, -14, 1.6);                // a strip high behind: rim glints on the bevels, not a glare across the top faces
        box(24, 24, 0, -30, 0, 0.25, 0x6a6258);     // a faint warm floor bounce
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        pmrem.compileCubemapShader();
        this.environment = pmrem.fromScene(env, 0.03).texture;
        pmrem.dispose();
        this.scene.environment = this.environment;
        env.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }

    /** Scale the environment's contribution on every brick material (lighting moods dim it at night). */
    setEnvIntensity(k) {
        this.envIntensity = k;
        for (const m of this.brickBuilder.materialsCache.values()) m.envMapIntensity = (m.userData.envBase != null ? m.userData.envBase : 1) * k;
        if (this.pedestal) this.pedestal.material.envMapIntensity = 0.6 * k;
    }

    initLighting() {
        // Hemisphere ambient: a cool sky over a warm floor bounce (studio.js treats it as "the ambient").
        const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x4a4036, 0.38);
        hemi.position.set(0, 30, 0);
        this.scene.add(hemi);
        this.hemiLight = hemi;

        const key = new THREE.DirectionalLight(0xfff1dc, 1.35);
        key.position.set(15, 25, 20);
        key.castShadow = true;
        key.shadow.mapSize.width = key.shadow.mapSize.height = this.quality === 'lite' ? 1024 : 2048;
        key.shadow.camera.near = 5; key.shadow.camera.far = 120;
        key.shadow.bias = -0.00015;
        key.shadow.normalBias = 0.035;   // lifts the sample off the surface: no acne on the studs, no peter-panning
        this.scene.add(key);
        this.keyLight = key;
        this.fitShadow(14);

        // Fill from the opposite side (position.x < 0 is how studio.js tells it apart), rim from behind and above.
        const fill = new THREE.DirectionalLight(0x9ec1ff, 0.3); fill.position.set(-22, 6, -10); this.scene.add(fill);
        this.fillLight = fill;
        const rim = new THREE.DirectionalLight(0xffffff, 0.55); rim.position.set(-6, -8, -30); this.scene.add(rim);
        this.rimLight = rim;
    }

    /** The shadow camera covers the model, so big builds keep crisp shadows. */
    fitShadow(r) {
        const c = this.keyLight.shadow.camera;
        c.left = -r; c.right = r; c.top = r; c.bottom = -r;
        c.far = Math.max(120, r * 3.5);   // the light sits ~2.5 r away: a big real set must not fall past the far plane
        c.updateProjectionMatrix();
        this.keyLight.position.set(r * 1.1, r * 1.8, r * 1.4);
    }

    initWorkbenchFloor() {
        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(14, 14.5, 0.4, 64), new THREE.MeshStandardMaterial({ color: new THREE.Color(0x161b26).convertSRGBToLinear(), roughness: 0.75, metalness: 0.15, envMapIntensity: 0.6 }));
        pedestal.position.y = -0.21;
        pedestal.receiveShadow = true;
        this.scene.add(pedestal);
        this.pedestal = pedestal;
        const grid = new THREE.GridHelper(24, 24, 0x00f3ff, 0x242d3d);
        grid.position.y = 0.005;
        grid.material.transparent = true; grid.material.opacity = 0.6;
        this.scene.add(grid);
        this.grid = grid;
        this.initContactShadow();
    }

    /** A soft radial darkening under the model (ambient occlusion on the cheap); sized to the model in loadModel. */
    initContactShadow() {
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(0.55, 'rgba(0,0,0,0.3)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
        const tex = new THREE.CanvasTexture(c);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.003;
        mesh.renderOrder = -1;
        this.scene.add(mesh);
        this.contactShadow = mesh;
    }

    loadModel(modelData) {
        this.brickBuilder.heavyLeft = window.BrickBuilder.HEAVY_BUDGET;   // each model gets the lite tier's full heavy-part budget
        this.activeModel = modelData;
        this.clearModel();

        // Build steps are the distinct plate heights, bottom to top.
        const layers = [...new Set(modelData.bricks.map((b) => b.layer || 0))].sort((a, b) => a - b);
        const stepOf = new Map(layers.map((l, i) => [l, i]));
        this.maxLayer = layers.length - 1;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        const bakedBox = new THREE.Box3(), partBox = new THREE.Box3();
        for (const b of modelData.bricks) {
            if (BrickBuilder.isBaked(b.partId, b.baked)) {
                // A real-set part: positioned at its LDraw origin, rotated by its 3×3 matrix, measured from its geometry.
                const mesh = this.addBakedBrick(b, stepOf.get(b.layer || 0));
                if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                bakedBox.union(partBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrix));
                continue;
            }
            const part = window.LEGO_PARTS[b.partId] || window.LEGO_PARTS['3001'];
            const lying = !!(b.rotX || b.rotZ);
            const y = (b.y || 0) + (lying ? part.width * 0.5 * 0.96 : 0);
            const pos = new THREE.Vector3(b.x || 0, y, b.z || 0);
            const mesh = this.brickBuilder.createBrickMesh(b.partId, b.color, { layer: stepOf.get(b.layer || 0), position: pos, rotX: b.rotX, rotZ: b.rotZ });
            mesh.position.copy(pos);
            if (b.rotY) mesh.rotation.y = b.rotY;
            if (b.rotX) mesh.rotation.x = b.rotX;
            if (b.rotZ) mesh.rotation.z = b.rotZ;
            this.modelGroup.add(mesh);
            this.brickMeshes.push(mesh);
            const hw = Math.max(part.width, part.length) / 2;
            minX = Math.min(minX, pos.x - hw); maxX = Math.max(maxX, pos.x + hw);
            minZ = Math.min(minZ, pos.z - hw); maxZ = Math.max(maxZ, pos.z + hw);
            minY = Math.min(minY, b.y || 0); maxY = Math.max(maxY, (b.y || 0) + (lying ? part.width : part.height));
        }
        if (!bakedBox.isEmpty()) {
            minX = Math.min(minX, bakedBox.min.x); maxX = Math.max(maxX, bakedBox.max.x);
            minY = Math.min(minY, bakedBox.min.y); maxY = Math.max(maxY, bakedBox.max.y);
            minZ = Math.min(minZ, bakedBox.min.z); maxZ = Math.max(maxZ, bakedBox.max.z);
        }
        if (!this.brickMeshes.length) { minX = maxX = minY = maxY = minZ = maxZ = 0; }
        if (this.envIntensity != null) this.setEnvIntensity(this.envIntensity);   // new colours pick up the current mood

        // Centre the model on the pedestal; each brick remembers its offset from the centre for the explode.
        const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, cy = (minY + maxY) / 2;
        // A real set whose lowest part dips below the floor (a tyre under the bottom plate) is lifted onto it.
        const lift = !bakedBox.isEmpty() && minY < -0.01 ? -minY : 0;
        this.modelGroup.position.set(-cx, lift, -cz);
        this.centre = { x: cx, z: cz };
        this.height = maxY - minY;
        this.extent = Math.max(maxX - minX, maxZ - minZ, (maxY - minY) * 1.1, 8);
        this.target.set(0, Math.min(cy + lift, this.height * 0.45), 0);
        this.homeTarget.copy(this.target);
        this.fitShadow(Math.max(14, this.extent * 0.9));
        const s = Math.max(1, this.extent / 22);
        this.pedestal.scale.set(s, 1, s); this.grid.scale.set(s, 1, s);
        if (this.contactShadow) this.contactShadow.scale.set((maxX - minX) + 3, (maxZ - minZ) + 3, 1);

        this.hasBakedModel = !bakedBox.isEmpty();
        this.home.radius = this.framingRadius();
        this.spherical.radius = this.home.radius;
        this.camera.far = Math.max(500, this.home.radius * 4);
        this.camera.updateProjectionMatrix();
        // The studio fog starts at 60; a big real set (a 77-stud ship) is viewed from further than that, so its fog
        // moves out with the camera. Generator models keep the original fog.
        const fogNear = bakedBox.isEmpty() ? 60 : Math.max(60, this.home.radius * 1.3);
        this.scene.fog.near = fogNear; this.scene.fog.far = fogNear + 80;
        this.updateCameraPosition();

        this.currentStep = this.maxLayer;
        this.isStepMode = false;
        this.setExplode(0);
        window.studForgeAudio.playBlueprintChime();
    }

    /**
     * One real-set brick: the mesh pivots at the part's LDraw origin, so the brick's `matrix`
     * (row-major 3×3, StudForge axes) is its rotation and (x, y, z) its position. decompose()
     * keeps a mirrored part (determinant −1) as a negative scale instead of a broken rotation.
     */
    addBakedBrick(b, layer) {
        const pos = new THREE.Vector3(b.x || 0, b.y || 0, b.z || 0);
        const m = Array.isArray(b.matrix) && b.matrix.length === 9 ? b.matrix : null;
        const mesh = this.brickBuilder.createBrickMesh(b.partId, b.color, { layer, position: pos, matrix: m, fp: b.fp, baked: true, geometryId: b.geometryId, baseplate: BrickBuilder.isBaseplate(b) });
        mesh.userData.geometryId = b.geometryId;
        mesh.userData.segment = !!b.segment;
        if (m) {
            const m4 = new THREE.Matrix4().set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
            m4.decompose(new THREE.Vector3(), mesh.quaternion, mesh.scale);
        } else {
            mesh.rotation.set(b.rotX || 0, b.rotY || 0, b.rotZ || 0);
        }
        mesh.position.copy(pos);
        mesh.updateMatrix();
        this.modelGroup.add(mesh);
        this.brickMeshes.push(mesh);
        return mesh;
    }

    /** Switch between 'high' and 'lite' at runtime: materials and the shadow map are rebuilt, the model reloaded. */
    setQuality(q) {
        if (q !== 'high' && q !== 'lite' || q === this.quality) return;
        this.quality = q;
        this.brickBuilder.quality = q;
        for (const m of this.brickBuilder.materialsCache.values()) m.dispose();
        this.brickBuilder.materialsCache.clear();
        this.brickBuilder.geometryCache.clear();
        const sh = this.keyLight.shadow;
        sh.mapSize.width = sh.mapSize.height = q === 'lite' ? 1024 : 2048;
        if (sh.map) { sh.map.dispose(); sh.map = null; }
        try { localStorage.setItem('studforge.quality', q); } catch (e) { /* private mode */ }
        if (this.activeModel) this.loadModel(this.activeModel);
    }

    clearModel() {
        while (this.modelGroup.children.length > 0) this.modelGroup.remove(this.modelGroup.children[0]);
        this.brickMeshes = [];
    }

    /**
     * Exploded view: every brick rises with its build step AND moves outward
     * from the model's centre, so you can see how layers sit side by side as
     * well as on top of each other. Far-off pieces spread more than central ones.
     */
    setExplode(value) {
        this.explodeProgress = Math.max(0, Math.min(1, value));
        const p = this.explodeProgress, steps = Math.max(1, this.maxLayer);
        const lift = (this.height * 1.4 + 6) * p, spread = 0.75 * p;
        for (const mesh of this.brickMeshes) {
            const o = mesh.userData.originalPosition, t = (mesh.userData.layer || 0) / steps;
            const dx = o.x - this.centre.x, dz = o.z - this.centre.z;
            mesh.position.set(o.x + dx * spread, o.y + t * lift, o.z + dz * spread);
        }
    }

    setStep(stepIndex) {
        this.currentStep = Math.max(0, Math.min(this.maxLayer, stepIndex));
        this.isStepMode = true;
        for (const mesh of this.brickMeshes) mesh.visible = (mesh.userData.layer || 0) <= this.currentStep;
        window.studForgeAudio.playBrickSnap();
    }

    /** How many bricks the current step adds, for the HUD. */
    stepCount(step) { let n = 0; for (const m of this.brickMeshes) if (!m.userData.segment && (m.userData.layer || 0) === step) n++; return n; }

    resetView() {
        this.spherical.theta = this.home.theta; this.spherical.phi = this.home.phi; this.spherical.radius = this.home.radius;
        this.target.copy(this.homeTarget);
        this.updateCameraPosition();
    }

    setPresetView(view) {
        if (view === 'top') { this.spherical.theta = 0; this.spherical.phi = 0.05; }
        else if (view === 'front') { this.spherical.theta = 0; this.spherical.phi = Math.PI / 2.2; }
        else if (view === 'side') { this.spherical.theta = Math.PI / 2; this.spherical.phi = Math.PI / 2.2; }
        else { this.spherical.theta = Math.PI / 4; this.spherical.phi = Math.PI / 3; }
        this.updateCameraPosition();
    }

    updateCameraPosition() {
        const phi = Math.max(0.05, Math.min(Math.PI / 2.05, this.spherical.phi));
        const theta = this.spherical.theta, r = this.spherical.radius;
        this.camera.position.x = this.target.x + r * Math.sin(phi) * Math.sin(theta);
        this.camera.position.y = this.target.y + r * Math.cos(phi);
        this.camera.position.z = this.target.z + r * Math.sin(phi) * Math.cos(theta);
        this.camera.lookAt(this.target);
    }

    zoomBy(k) { this.spherical.radius = Math.max(6, Math.min(this.home.radius * 3, this.spherical.radius * k)); this.updateCameraPosition(); }

    /**
     * Pan: move the focal point by a screen-space delta (pixels) along the camera's right and up
     * vectors, scaled so a pixel moves the same fraction of the view at any zoom. The target is
     * clamped to the model's bounds plus a margin so nobody loses the model.
     */
    panBy(dxPx, dyPx) {
        const h = this.container.clientHeight || this.renderer.domElement.clientHeight || 1;
        const perPx = 2 * Math.tan((this.camera.fov * Math.PI / 180) / 2) * this.spherical.radius / h;
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
        this.target.addScaledVector(right, -dxPx * perPx).addScaledVector(up, dyPx * perPx);
        const lim = Math.max(4, this.extent * 0.75);
        this.target.x = Math.max(-lim, Math.min(lim, this.target.x));
        this.target.z = Math.max(-lim, Math.min(lim, this.target.z));
        this.target.y = Math.max(0, Math.min(Math.max(this.height, 1), this.target.y));
        this.updateCameraPosition();
    }

    resize() {
        const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
        if (!w || !h) return;
        this.camera.aspect = w / h;
        if (this.activeModel) {
            const radius = this.framingRadius();
            this.spherical.radius *= radius / this.home.radius;
            this.home.radius = radius;
            if (this.hasBakedModel) {
                this.scene.fog.near = Math.max(60, radius * 1.3);
                this.scene.fog.far = this.scene.fog.near + 80;
            }
            this.updateCameraPosition();
        }
        this.camera.far = Math.max(500, this.home.radius * 4);
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    framingRadius() {
        // Narrow screens have a smaller horizontal field of view. Preserve the user's zoom ratio on resize.
        return Math.max(14, this.extent * 1.55) * Math.max(1, 1 / this.camera.aspect);
    }

    initInputListeners() {
        const dom = this.renderer.domElement;
        // Left drag orbits; right, middle or shift+left drag pans.
        dom.addEventListener('mousedown', (e) => {
            if (this.motionDragging) return;
            if (e.button === 0 || e.button === 1 || e.button === 2) {
                this.isDragging = true;
                this.isPanning = e.button !== 0 || e.shiftKey;
                this.previousMousePosition = { x: e.clientX, y: e.clientY };
                if (e.button === 1) e.preventDefault();   // no autoscroll cursor
            }
        });
        dom.addEventListener('contextmenu', (e) => e.preventDefault());
        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            const dx = e.clientX - this.previousMousePosition.x, dy = e.clientY - this.previousMousePosition.y;
            if (this.isPanning) this.panBy(dx, dy);
            else { this.spherical.theta -= dx * 0.008; this.spherical.phi -= dy * 0.008; this.updateCameraPosition(); }
            this.previousMousePosition = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('mouseup', () => { this.isDragging = false; this.isPanning = false; });
        dom.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomBy(1 + e.deltaY * 0.0012); }, { passive: false });

        // Touch: one finger orbits; two fingers pan with their midpoint and zoom with their spread.
        let pinch = null;   // { dist, radius, mid }
        const two = (t) => ({ dist: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY), mid: { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 } });
        dom.addEventListener('touchstart', (e) => {
            if (this.motionDragging) return;
            if (e.touches.length === 1) { this.isDragging = true; this.isPanning = false; this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
            else if (e.touches.length === 2) { this.isDragging = true; this.isPanning = true; const t = two(e.touches); pinch = { dist: t.dist, radius: this.spherical.radius, mid: t.mid }; }
        }, { passive: true });
        dom.addEventListener('touchmove', (e) => {
            if (this.motionDragging) { if (e.cancelable) e.preventDefault(); return; }
            if (e.touches.length === 1 && this.isDragging && !this.isPanning) {
                if (e.cancelable) e.preventDefault();
                this.spherical.theta -= (e.touches[0].clientX - this.previousMousePosition.x) * 0.008;
                this.spherical.phi -= (e.touches[0].clientY - this.previousMousePosition.y) * 0.008;
                this.updateCameraPosition();
                this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else if (e.touches.length === 2 && pinch) {
                if (e.cancelable) e.preventDefault();
                const t = two(e.touches);
                // Fingers moving together pan (the midpoint moves); fingers moving apart or together zoom (the spread changes).
                this.panBy(t.mid.x - pinch.mid.x, t.mid.y - pinch.mid.y);
                this.spherical.radius = Math.max(6, Math.min(this.home.radius * 3, pinch.radius * (pinch.dist / Math.max(t.dist, 1))));
                this.updateCameraPosition();
                pinch.mid = t.mid;
            }
        }, { passive: false });
        window.addEventListener('touchend', (e) => {
            if (e.touches && e.touches.length === 1) { this.isPanning = false; pinch = null; this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
            else if (!e.touches || e.touches.length === 0) { this.isDragging = false; this.isPanning = false; pinch = null; }
        });

        // The viewport lives inside a resizable window on the portfolio desktop, so watch the container, not just the window.
        window.addEventListener('resize', () => this.resize());
        if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(this.container);
    }

    animate() {
        requestAnimationFrame(this.animate);
        if (!this.poseActive && !this.motionHover && !this.isDragging && this.explodeProgress === 0 && !this.isStepMode) { this.spherical.theta += 0.0018; this.updateCameraPosition(); }
        this.renderer.render(this.scene, this.camera);
    }
}

window.StudForgeViewer = StudForgeViewer;
