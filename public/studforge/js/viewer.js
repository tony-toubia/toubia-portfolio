// 3D WebGL Studio Viewer for StudForge: orbit camera, exploded view, build steps.
class StudForgeViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.brickBuilder = new BrickBuilder();
        this.activeModel = null;
        this.brickMeshes = [];
        this.modelGroup = new THREE.Group();

        this.explodeProgress = 0;   // 0..1
        this.maxLayer = 0;          // the last build step index
        this.currentStep = 0;
        this.isStepMode = false;
        this.extent = 10;           // the model's size, for the camera and the explode distances

        this.isDragging = false;
        this.previousMousePosition = { x: 0, y: 0 };
        this.spherical = { radius: 18, theta: Math.PI / 4, phi: Math.PI / 3 };
        this.home = { radius: 18, theta: Math.PI / 4, phi: Math.PI / 3 };
        this.target = new THREE.Vector3(0, 2.5, 0);

        this.initThree();
        this.initLighting();
        this.initWorkbenchFloor();
        this.initInputListeners();

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    initThree() {
        const w = this.container.clientWidth || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;
        this.small = Math.min(window.innerWidth, window.innerHeight) < 700;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0e121a);
        this.scene.fog = new THREE.Fog(0x0e121a, 60, 140);

        this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 500);
        this.updateCameraPosition();

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.small ? 1.5 : 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.container.appendChild(this.renderer.domElement);
        this.scene.add(this.modelGroup);
    }

    initLighting() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const key = new THREE.DirectionalLight(0xfff7ed, 1.25);
        key.position.set(15, 25, 20);
        key.castShadow = true;
        key.shadow.mapSize.width = key.shadow.mapSize.height = this.small ? 1024 : 2048;
        key.shadow.camera.near = 5; key.shadow.camera.far = 120;
        key.shadow.bias = -0.0005;
        this.scene.add(key);
        this.keyLight = key;
        this.fitShadow(14);
        const fill = new THREE.DirectionalLight(0x93c5fd, 0.55); fill.position.set(-20, 15, -15); this.scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffffff, 0.7); rim.position.set(0, -10, -25); this.scene.add(rim);
    }

    /** The shadow camera covers the model, so big builds keep crisp shadows. */
    fitShadow(r) {
        const c = this.keyLight.shadow.camera;
        c.left = -r; c.right = r; c.top = r; c.bottom = -r;
        c.updateProjectionMatrix();
        this.keyLight.position.set(r * 1.1, r * 1.8, r * 1.4);
    }

    initWorkbenchFloor() {
        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(14, 14.5, 0.4, 64), new THREE.MeshStandardMaterial({ color: 0x161b26, roughness: 0.8, metalness: 0.2 }));
        pedestal.position.y = -0.21;
        pedestal.receiveShadow = true;
        this.scene.add(pedestal);
        this.pedestal = pedestal;
        const grid = new THREE.GridHelper(24, 24, 0x00f3ff, 0x242d3d);
        grid.position.y = 0.005;
        grid.material.transparent = true; grid.material.opacity = 0.6;
        this.scene.add(grid);
        this.grid = grid;
    }

    loadModel(modelData) {
        this.activeModel = modelData;
        this.clearModel();

        // Build steps are the distinct plate heights, bottom to top.
        const layers = [...new Set(modelData.bricks.map((b) => b.layer || 0))].sort((a, b) => a - b);
        const stepOf = new Map(layers.map((l, i) => [l, i]));
        this.maxLayer = layers.length - 1;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const b of modelData.bricks) {
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
        if (!this.brickMeshes.length) { minX = maxX = minY = maxY = minZ = maxZ = 0; }

        // Centre the model on the pedestal; each brick remembers its offset from the centre for the explode.
        const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, cy = (minY + maxY) / 2;
        this.modelGroup.position.set(-cx, 0, -cz);
        this.centre = { x: cx, z: cz };
        this.height = maxY - minY;
        this.extent = Math.max(maxX - minX, maxZ - minZ, (maxY - minY) * 1.1, 8);
        this.target.set(0, Math.min(cy, this.height * 0.45), 0);
        this.fitShadow(Math.max(14, this.extent * 0.9));
        const s = Math.max(1, this.extent / 22);
        this.pedestal.scale.set(s, 1, s); this.grid.scale.set(s, 1, s);

        this.home.radius = Math.max(14, this.extent * 1.55);
        this.spherical.radius = this.home.radius;
        this.updateCameraPosition();

        this.currentStep = this.maxLayer;
        this.isStepMode = false;
        this.setExplode(0);
        window.studForgeAudio.playBlueprintChime();
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
    stepCount(step) { let n = 0; for (const m of this.brickMeshes) if ((m.userData.layer || 0) === step) n++; return n; }

    resetView() {
        this.spherical.theta = this.home.theta; this.spherical.phi = this.home.phi; this.spherical.radius = this.home.radius;
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

    resize() {
        const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
        if (!w || !h) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    initInputListeners() {
        const dom = this.renderer.domElement;
        dom.addEventListener('mousedown', (e) => { if (e.button === 0) { this.isDragging = true; this.previousMousePosition = { x: e.clientX, y: e.clientY }; } });
        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            this.spherical.theta -= (e.clientX - this.previousMousePosition.x) * 0.008;
            this.spherical.phi -= (e.clientY - this.previousMousePosition.y) * 0.008;
            this.updateCameraPosition();
            this.previousMousePosition = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('mouseup', () => { this.isDragging = false; });
        dom.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomBy(1 + e.deltaY * 0.0012); }, { passive: false });

        let initialPinchDist = 0, initialRadius = 18;
        dom.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) { this.isDragging = true; this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
            else if (e.touches.length === 2) { this.isDragging = false; initialPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); initialRadius = this.spherical.radius; }
        }, { passive: true });
        dom.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && this.isDragging) {
                if (e.cancelable) e.preventDefault();
                this.spherical.theta -= (e.touches[0].clientX - this.previousMousePosition.x) * 0.008;
                this.spherical.phi -= (e.touches[0].clientY - this.previousMousePosition.y) * 0.008;
                this.updateCameraPosition();
                this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else if (e.touches.length === 2) {
                if (e.cancelable) e.preventDefault();
                const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                this.spherical.radius = Math.max(6, Math.min(this.home.radius * 3, initialRadius * (initialPinchDist / Math.max(d, 1))));
                this.updateCameraPosition();
            }
        }, { passive: false });
        window.addEventListener('touchend', () => { this.isDragging = false; });

        // The viewport lives inside a resizable window on the portfolio desktop, so watch the container, not just the window.
        window.addEventListener('resize', () => this.resize());
        if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(this.container);
    }

    animate() {
        requestAnimationFrame(this.animate);
        if (!this.isDragging && this.explodeProgress === 0 && !this.isStepMode) { this.spherical.theta += 0.0018; this.updateCameraPosition(); }
        this.renderer.render(this.scene, this.camera);
    }
}

window.StudForgeViewer = StudForgeViewer;
