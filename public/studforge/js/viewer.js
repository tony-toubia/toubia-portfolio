// 3D WebGL Studio Viewer for StudForge with Exploded View & Layer Stepper
class StudForgeViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.brickBuilder = new BrickBuilder();
        this.activeModel = null;
        this.brickMeshes = [];
        this.modelGroup = new THREE.Group();

        // View options
        this.explodeProgress = 0; // 0 to 1
        this.maxLayer = 0;
        this.currentStep = 0;
        this.isStepMode = false;

        // Camera Orbit Controls State
        this.isDragging = false;
        this.previousMousePosition = { x: 0, y: 0 };
        this.spherical = { radius: 18, theta: Math.PI / 4, phi: Math.PI / 3 };
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

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0e121a);

        this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 500);
        this.updateCameraPosition();

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.container.appendChild(this.renderer.domElement);

        this.scene.add(this.modelGroup);
    }

    initLighting() {
        // Ambient fill
        const ambient = new THREE.AmbientLight(0xffffff, 0.75);
        this.scene.add(ambient);

        // Key Light (Soft Studio Keylight)
        const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.25);
        keyLight.position.set(15, 25, 20);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.camera.near = 5;
        keyLight.shadow.camera.far = 80;
        keyLight.shadow.camera.left = -15;
        keyLight.shadow.camera.right = 15;
        keyLight.shadow.camera.top = 15;
        keyLight.shadow.camera.bottom = -15;
        keyLight.shadow.bias = -0.0005;
        this.scene.add(keyLight);

        // Fill Light (Cool tint from opposite side)
        const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.6);
        fillLight.position.set(-20, 15, -15);
        this.scene.add(fillLight);

        // Rim Light (Accentuates brick beveled edges)
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
        rimLight.position.set(0, -10, -25);
        this.scene.add(rimLight);
    }

    initWorkbenchFloor() {
        // Circular Maker Pedestal with Grid
        const pedestalGeom = new THREE.CylinderGeometry(14, 14.5, 0.4, 64);
        const pedestalMat = new THREE.MeshStandardMaterial({
            color: 0x161b26,
            roughness: 0.8,
            metalness: 0.2
        });
        const pedestal = new THREE.Mesh(pedestalGeom, pedestalMat);
        pedestal.position.y = -0.21;
        pedestal.receiveShadow = true;
        this.scene.add(pedestal);

        // Subtle Stud Grid Pattern Ring
        const gridHelper = new THREE.GridHelper(24, 24, 0x00f3ff, 0x242d3d);
        gridHelper.position.y = 0.005;
        this.scene.add(gridHelper);
    }

    loadModel(modelData) {
        this.activeModel = modelData;
        this.clearModel();

        this.maxLayer = 0;
        this.brickMeshes = [];

        // Determine bounding center
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        modelData.bricks.forEach(b => {
            const mesh = this.brickBuilder.createBrickMesh(b.partId, b.color, {
                layer: b.layer || 0,
                position: new THREE.Vector3(b.x || 0, b.y || 0, b.z || 0)
            });

            mesh.position.set(b.x || 0, b.y || 0, b.z || 0);
            if (b.rotY) mesh.rotation.y = b.rotY;

            this.modelGroup.add(mesh);
            this.brickMeshes.push(mesh);

            if ((b.layer || 0) > this.maxLayer) {
                this.maxLayer = b.layer || 0;
            }

            minX = Math.min(minX, b.x || 0);
            maxX = Math.max(maxX, b.x || 0);
            minY = Math.min(minY, b.y || 0);
            maxY = Math.max(maxY, (b.y || 0) + (mesh.userData.height || 1.2));
            minZ = Math.min(minZ, b.z || 0);
            maxZ = Math.max(maxZ, b.z || 0);
        });

        // Center model over origin
        const centerX = (minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;
        const centerY = (minY + maxY) / 2;

        this.modelGroup.position.set(-centerX, 0, -centerZ);
        this.target.set(0, centerY, 0);

        this.currentStep = this.maxLayer;
        this.isStepMode = false;
        this.setExplode(0);

        window.studForgeAudio.playBlueprintChime();
    }

    clearModel() {
        while (this.modelGroup.children.length > 0) {
            const child = this.modelGroup.children[0];
            this.modelGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
        }
        this.brickMeshes = [];
    }

    setExplode(value) {
        this.explodeProgress = Math.max(0, Math.min(1, value));

        this.brickMeshes.forEach(mesh => {
            const origPos = mesh.userData.originalPosition;
            const layer = mesh.userData.layer || 0;
            // Lift each layer progressively along Y
            mesh.position.y = origPos.y + (layer * this.explodeProgress * 2.2);
        });
    }

    setStep(stepIndex) {
        this.currentStep = Math.max(0, Math.min(this.maxLayer, stepIndex));
        this.isStepMode = true;

        this.brickMeshes.forEach(mesh => {
            const layer = mesh.userData.layer || 0;
            if (layer <= this.currentStep) {
                mesh.visible = true;
                // If just placed, ensure at original Y
                mesh.position.y = mesh.userData.originalPosition.y;
            } else {
                mesh.visible = false;
            }
        });

        window.studForgeAudio.playBrickSnap();
    }

    resetView() {
        this.spherical.theta = Math.PI / 4;
        this.spherical.phi = Math.PI / 3;
        this.spherical.radius = 18;
        this.updateCameraPosition();
    }

    setPresetView(view) {
        if (view === 'top') {
            this.spherical.theta = 0;
            this.spherical.phi = 0.05;
        } else if (view === 'front') {
            this.spherical.theta = 0;
            this.spherical.phi = Math.PI / 2.2;
        } else if (view === 'side') {
            this.spherical.theta = Math.PI / 2;
            this.spherical.phi = Math.PI / 2.2;
        } else if (view === 'iso') {
            this.spherical.theta = Math.PI / 4;
            this.spherical.phi = Math.PI / 3;
        }
        this.updateCameraPosition();
    }

    updateCameraPosition() {
        const phi = Math.max(0.05, Math.min(Math.PI / 2.05, this.spherical.phi));
        const theta = this.spherical.theta;
        const r = this.spherical.radius;

        this.camera.position.x = this.target.x + r * Math.sin(phi) * Math.sin(theta);
        this.camera.position.y = this.target.y + r * Math.cos(phi);
        this.camera.position.z = this.target.z + r * Math.sin(phi) * Math.cos(theta);
        this.camera.lookAt(this.target);
    }

    initInputListeners() {
        const dom = this.renderer.domElement;

        // Mouse Drag Orbit
        dom.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.isDragging = true;
                this.previousMousePosition = { x: e.clientX, y: e.clientY };
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            const deltaX = e.clientX - this.previousMousePosition.x;
            const deltaY = e.clientY - this.previousMousePosition.y;

            this.spherical.theta -= deltaX * 0.008;
            this.spherical.phi -= deltaY * 0.008;
            this.updateCameraPosition();

            this.previousMousePosition = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        // Wheel Zoom
        dom.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.spherical.radius = Math.max(6, Math.min(45, this.spherical.radius + e.deltaY * 0.025));
            this.updateCameraPosition();
        }, { passive: false });

        // Touch Orbit & Pinch-to-Zoom
        let initialPinchDist = 0;
        let initialRadius = 18;

        dom.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.isDragging = true;
                this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else if (e.touches.length === 2) {
                this.isDragging = false;
                initialPinchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                initialRadius = this.spherical.radius;
            }
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && this.isDragging) {
                if (e.cancelable) e.preventDefault();
                const deltaX = e.touches[0].clientX - this.previousMousePosition.x;
                const deltaY = e.touches[0].clientY - this.previousMousePosition.y;

                this.spherical.theta -= deltaX * 0.008;
                this.spherical.phi -= deltaY * 0.008;
                this.updateCameraPosition();

                this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else if (e.touches.length === 2) {
                if (e.cancelable) e.preventDefault();
                const currentDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const factor = initialPinchDist / Math.max(currentDist, 1);
                this.spherical.radius = Math.max(6, Math.min(45, initialRadius * factor));
                this.updateCameraPosition();
            }
        }, { passive: false });

        window.addEventListener('touchend', () => {
            this.isDragging = false;
        });

        // Window resize
        window.addEventListener('resize', () => {
            const w = this.container.clientWidth || window.innerWidth;
            const h = this.container.clientHeight || window.innerHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        });
    }

    animate() {
        requestAnimationFrame(this.animate);

        // Gentle turntable rotation when idle
        if (!this.isDragging && this.explodeProgress === 0 && !this.isStepMode) {
            this.spherical.theta += 0.0018;
            this.updateCameraPosition();
        }

        this.renderer.render(this.scene, this.camera);
    }
}

window.StudForgeViewer = StudForgeViewer;
