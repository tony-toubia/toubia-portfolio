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
        this.loadVersion = 0;
        this.fitRadius = 18;
        this.autoRotate = true;

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

    async loadModel(modelData) {
        const version = ++this.loadVersion;
        const group = new THREE.Group();
        let bricks = modelData.bricks;
        let stepKind = 'layers';
        if (modelData.format === 'ldraw') {
            const responses = await Promise.all([fetch(modelData.modelUrl), fetch('models/LDConfig.ldr')]);
            if (responses.some(response => !response.ok)) throw new Error('Model assets unavailable.');
            const [text, colors] = await Promise.all(responses.map(response => response.text()));
            const {loader, source} = await window.loadPackedModel(text, colors);
            source.rotation.x = Math.PI;
            source.scale.setScalar(1 / 20); // LDraw units → studs, with Y pointing up.
            source.updateMatrixWorld(true);
            const pieces = [];
            const visit = object => {
                if (object.userData.type === 'Part' || object.userData.type === 'Unofficial_Part') pieces.push(object);
                else object.children.forEach(visit);
            };
            visit(source);
            if (!pieces.length) throw new Error('This model contains no readable pieces.');
            stepKind = source.userData.numBuildingSteps > 1 ? 'steps' : 'layers';
            const matrices = pieces.map(piece => piece.matrixWorld.clone());
            const inventoryColors = pieces.map(piece => {
                let parent = piece;
                while (parent && (parent.userData.colorCode == null || String(parent.userData.colorCode) === '16')) parent = parent.parent;
                return String(parent?.userData.colorCode ?? '16');
            });
            pieces.forEach((piece, index) => {
                piece.removeFromParent();
                matrices[index].decompose(piece.position, piece.quaternion, piece.scale);
                piece.userData.inventoryColor = inventoryColors[index];
                group.add(piece);
            });
            const heights = [...new Set(pieces.map(piece => Math.round(piece.position.y / 0.4)))].sort((a,b) => a-b);
            // Files without STEP records expose inspection layers, not invented instructions.
            const sourceSteps = [...new Set(pieces.map(piece => piece.userData.buildingStep))].sort((a,b)=>a-b);
            bricks = pieces.map(piece => {
                const filename = piece.userData.fileName.toLowerCase().replaceAll('\\','/');
                const color = piece.userData.inventoryColor;
                const material = loader.getMaterial(color);
                const partName = (window.LDRAW_PARTS[filename]?.name || filename.replace(/\.dat$/, '')).replace(/\s+/g, ' ');
                const layer = stepKind === 'steps' ? sourceSteps.indexOf(piece.userData.buildingStep) : heights.indexOf(Math.round(piece.position.y / 0.4));
                Object.assign(piece.userData, {layer, originalPosition: piece.position.clone()});
                return {partId:filename.replace(/\.dat$/, ''),partName,color,colorName:material?.name?.replaceAll('_',' ').trim() || `LDraw ${color}`,colorHex:material ? `#${material.color.getHexString()}` : '#cccccc',layer};
            });
        } else {
            bricks.forEach(brick => {
                const mesh = this.brickBuilder.createBrickMesh(brick.partId, brick.color, {
                    layer: brick.layer || 0,
                    position: new THREE.Vector3(brick.x || 0, brick.y || 0, brick.z || 0)
                });
                mesh.position.copy(mesh.userData.originalPosition);
                mesh.rotation.set(brick.rotX || 0, brick.rotY || 0, brick.rotZ || 0);
                group.add(mesh);
            });
        }
        // Each piece owns its materials so ghosting one cannot change another.
        group.children.forEach(piece => piece.traverse(object => {
            if (!object.material) return;
            const clone = material => {
                const result = material.clone();
                result.userData.baseOpacity = material.opacity;
                result.userData.baseTransparent = material.transparent;
                return result;
            };
            object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
            if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
        }));
        if (version !== this.loadVersion) { this.disposeGroup(group); return null; }
        this.clearModel();
        this.scene.remove(this.modelGroup);
        this.modelGroup = group;
        this.scene.add(group);
        this.brickMeshes = [...group.children];
        this.maxLayer = Math.max(...bricks.map(brick => brick.layer || 0));
        this.activeModel = {...modelData, bricks, stepKind};
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        group.position.set(-center.x, -box.min.y, -center.z);
        this.target.set(0, (box.max.y - box.min.y) / 2, 0);
        const size = box.getSize(new THREE.Vector3());
        this.fitRadius = Math.max(8, size.length() * 1.1);
        this.resetView();
        this.autoRotate = true;
        this.currentStep = this.maxLayer;
        this.isStepMode = false;
        this.setExplode(0);
        window.studForgeAudio.playBlueprintChime();
        return this.activeModel;
    }

    disposeGroup(group) {
        const geometries = new Set(), materials = new Set();
        group.traverse(object => {
            if (object.geometry) geometries.add(object.geometry);
            if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
        });
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(material => material.dispose());
        group.clear();
    }

    clearModel() {
        this.disposeGroup(this.modelGroup);
        this.brickMeshes = [];
    }

    updatePieceAppearance() {
        this.brickMeshes.forEach(piece => {
            const layer = piece.userData.layer || 0;
            piece.visible = !this.isStepMode || layer <= this.currentStep;
            piece.position.y = piece.userData.originalPosition.y + layer * this.explodeProgress * (8 / Math.max(1,this.maxLayer));
            piece.traverse(object => {
                if (!object.material) return;
                const previous = this.isStepMode && layer < this.currentStep;
                const fresh = this.isStepMode && layer === this.currentStep;
                (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => {
                    const transparent = previous || material.userData.baseTransparent;
                    if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
                    material.opacity = previous ? 0.22 : material.userData.baseOpacity;
                    material.depthWrite = !previous;
                    if (material.emissive) material.emissive.setHex(fresh ? 0x332800 : 0x000000);
                });
            });
        });
    }

    setExplode(value) {
        this.explodeProgress = Math.max(0, Math.min(1, value));

        this.updatePieceAppearance();
    }

    setStep(stepIndex) {
        this.currentStep = Math.max(0, Math.min(this.maxLayer, stepIndex));
        this.isStepMode = true;

        this.updatePieceAppearance();

        window.studForgeAudio.playBrickSnap();
    }

    resetView() {
        this.autoRotate = false;
        this.spherical.theta = (this.activeModel?.frontAngle || 0) + Math.PI / 4;
        this.spherical.phi = Math.PI / 3;
        this.spherical.radius = this.fitRadius;
        this.updateCameraPosition();
    }

    setPresetView(view) {
        this.autoRotate = false;
        if (view === 'top') {
            this.spherical.theta = 0;
            this.spherical.phi = 0.05;
        } else if (view === 'front') {
            this.spherical.theta = this.activeModel?.frontAngle || 0;
            this.spherical.phi = Math.PI / 2.2;
        } else if (view === 'side') {
            this.spherical.theta = Math.PI / 2;
            this.spherical.phi = Math.PI / 2.2;
        } else if (view === 'iso') {
            this.spherical.theta = (this.activeModel?.frontAngle || 0) + Math.PI / 4;
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
                this.autoRotate = false;
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
                this.autoRotate = false;
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

        // Observe the viewport itself: opening the library also changes its width.
        this.resizeObserver = new ResizeObserver(() => {
            const w = this.container.clientWidth || window.innerWidth;
            const h = this.container.clientHeight || window.innerHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        });
        this.resizeObserver.observe(this.container);
    }

    animate() {
        requestAnimationFrame(this.animate);

        // Gentle turntable rotation when idle
        if (this.autoRotate && !this.isDragging && this.explodeProgress === 0 && !this.isStepMode) {
            this.spherical.theta += 0.0018;
            this.updateCameraPosition();
        }

        this.renderer.render(this.scene, this.camera);
    }
}

window.StudForgeViewer = StudForgeViewer;
