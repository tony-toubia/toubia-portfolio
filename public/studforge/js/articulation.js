// Pose mode: constrained assembly motion; source model and inventory stay pristine.
(() => {
    function init() {
        const sf = window.studForge, core = window.StudForgeArticulation;
        if (!sf || !core || sf.articulation) return;
        const viewer = sf.viewer, canvas = viewer.renderer.domElement;
        const panel = sf.registerPanel({ id: 'pose', title: 'MOVE THIS KIT', group: 'build', order: 3 });
        const button = document.createElement('button'); button.type = 'button'; button.className = 'cam-btn'; button.id = 'btn-pose';
        button.innerHTML = '<span class="vc-ico">↻</span><span class="vc-label">POSE</span>';
        button.title = 'Grab movable pieces and rotate them on their joints'; button.setAttribute('aria-label', 'Pose movable pieces'); button.setAttribute('aria-pressed', 'false');
        sf.widget(button);
        const style = document.createElement('style');
        style.textContent = '.sfpose-controls label{display:block;margin:12px 0;font-size:14px}.sfpose-controls label>span{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px}.sfpose-controls input{width:100%;accent-color:var(--lego-yellow)}.sfpose-controls output{color:var(--lego-yellow);font-family:var(--font-mono)}.sfpose-axis{position:absolute;bottom:64px;left:14px;max-width:calc(100% - 28px);padding:8px 12px;border:1px solid var(--lego-yellow);border-radius:8px;background:#151b27ed;color:var(--lego-yellow);font-size:13px;pointer-events:none;z-index:5}.sfpose-tip{font-size:13px;color:var(--text-secondary);line-height:1.5}';
        document.head.appendChild(style);
        const hint = document.createElement('div'); hint.className = 'sfpose-axis'; hint.hidden = true; hint.setAttribute('role', 'status');
        (canvas.closest('.viewport-card') || viewer.container).appendChild(hint);
        let rig = null, rest = [], values = {}, active = false, drag = null, baseY = 0, highlights = [];
        const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();

        function clearHighlights() {
            for (const helper of highlights) { viewer.modelGroup.remove(helper); helper.geometry.dispose(); helper.material.dispose(); }
            highlights = [];
        }
        function showHighlights() {
            let group = 0;
            const partBox = new THREE.Box3();
            for (const control of rig.controls) for (const joint of control.joints) {
                let helper = highlights[group++];
                if (!helper) {
                    helper = new THREE.Box3Helper(new THREE.Box3(), 0xf2cd37);
                    helper.material.transparent = true; helper.material.opacity = .45;
                    helper.material.depthWrite = false; viewer.modelGroup.add(helper); highlights.push(helper);
                }
                const box = helper.box.makeEmpty();
                for (const index of joint.members) {
                    const mesh = viewer.brickMeshes[index]; mesh.updateMatrix();
                    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                    box.union(partBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrix));
                }
            }
        }
        function apply() {
            if (!active || !rig) return;
            for (const control of rig.controls) for (const joint of control.joints) {
                const degrees = values[control.id] * joint.factor;
                const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...joint.axis).normalize(), degrees * Math.PI / 180);
                for (const index of joint.members) {
                    const mesh = viewer.brickMeshes[index], home = rest[index];
                    mesh.position.fromArray(core.rotatePoint(home.position, joint.pivot, joint.axis, degrees));
                    mesh.quaternion.copy(home.quaternion).premultiply(q); mesh.updateMatrix();
                }
            }
            showHighlights();
        }
        function updateControls() {
            for (const control of rig?.controls || []) {
                panel.body.querySelector(`[data-angle="${control.id}"]`).value = values[control.id];
                panel.body.querySelector(`[data-value="${control.id}"]`).textContent = `${Math.round(values[control.id])}°`;
            }
            const toggle = panel.body.querySelector('[data-toggle]');
            if (toggle) { toggle.textContent = active ? '✓ POSE MODE ON' : '↻ TRY MOVING PIECES'; toggle.setAttribute('aria-pressed', String(active)); }
            button.classList.toggle('on', active); button.setAttribute('aria-pressed', String(active)); hint.hidden = !active;
            if (active && !drag) hint.textContent = 'Drag a highlighted assembly · drag other pieces to orbit';
        }
        function endDrag() {
            if (drag && canvas.hasPointerCapture(drag.pointerId)) canvas.releasePointerCapture(drag.pointerId);
            drag = null; viewer.motionDragging = false; canvas.style.cursor = active ? 'grab' : '';
            if (active) updateControls();
        }
        function setActive(on) {
            if (on && (!rig || sf.studio?.recording)) return;
            if (on === active) return;
            endDrag();
            if (on) {
                // Returning from a parts tray has an animation. Let it finish before
                // capturing rest transforms, so posing cannot race that animation.
                if (sf.studio?.trayOn) { sf.toast('Close the parts tray before posing'); return; }
                if (sf.studio?.transitioning) { sf.toast('Wait for the pieces to return to the kit'); return; }
                sf.studio?.setSpin(false); sf.studio?.closeInspector();
                sf.setExplode(0); sf.goStep(viewer.maxLayer);
                rest = viewer.brickMeshes.map(mesh => ({ position: mesh.position.toArray(), quaternion: mesh.quaternion.clone() }));
                baseY = viewer.modelGroup.position.y;
                viewer.modelGroup.position.y += rig.lift; viewer.target.y += rig.lift; viewer.updateCameraPosition();
                active = true; viewer.poseActive = true;
                apply();
            } else {
                active = false; viewer.poseActive = false;
                for (let i = 0; i < rest.length; i++) {
                    const mesh = viewer.brickMeshes[i]; if (!mesh) continue;
                    mesh.position.fromArray(rest[i].position); mesh.quaternion.copy(rest[i].quaternion); mesh.updateMatrix();
                }
                viewer.modelGroup.position.y = baseY; viewer.target.y -= rig?.lift || 0; viewer.updateCameraPosition();
                values = Object.fromEntries((rig?.controls || []).map(c => [c.id, 0]));
                clearHighlights();
            }
            canvas.style.cursor = active ? 'grab' : ''; updateControls();
        }
        function setAngle(control, value) {
            if (sf.studio?.recording) { sf.toast('Finish the recording before changing the pose'); return; }
            if (!active) setActive(true);
            if (!active) { updateControls(); return; }
            values[control.id] = core.clamp(value, control); apply(); updateControls();
        }
        function install(model) {
            rig = core.resolve(model); rest = []; values = Object.fromEntries((rig?.controls || []).map(c => [c.id, 0]));
            button.hidden = !rig; panel.section.hidden = !rig;
            if (!rig) { panel.body.innerHTML = ''; return; }
            panel.body.innerHTML = '<p class="sfpose-tip">Grab the highlighted neck or wings to move the whole assembly on its joint. You can also use the angle control below.</p>'
                + '<button type="button" class="action-btn secondary" data-toggle aria-pressed="false">↻ TRY MOVING PIECES</button><div class="sfpose-controls">'
                + rig.controls.map(c => `<label><span>${c.label}<output data-value="${c.id}">0°</output></span><input type="range" min="${c.min}" max="${c.max}" step="1" value="0" data-angle="${c.id}" aria-label="${c.label}"></label>`).join('')
                + '</div><button type="button" class="action-btn tertiary" data-reset>RESET POSE</button><p class="sfpose-tip">Demonstration poses. Building steps and parts lists use the original assembly.</p>';
        }
        button.addEventListener('click', () => setActive(!active));
        panel.body.addEventListener('click', e => {
            if (e.target.closest('[data-toggle]')) setActive(!active);
            if (e.target.closest('[data-reset]')) { endDrag(); values = Object.fromEntries(rig.controls.map(c => [c.id, 0])); apply(); updateControls(); }
        });
        panel.body.addEventListener('input', e => {
            const control = rig?.controls.find(c => c.id === e.target.dataset.angle);
            if (control) setAngle(control, Number(e.target.value));
        });

        canvas.addEventListener('pointerdown', e => {
            if (!active || sf.studio?.recording || (e.pointerType === 'mouse' && (e.button !== 0 || e.shiftKey))) return;
            // A second finger hands control back to the camera for pan/pinch.
            if (drag) { endDrag(); return; }
            const rect = canvas.getBoundingClientRect();
            pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
            viewer.scene.updateMatrixWorld(true); raycaster.setFromCamera(pointer, viewer.camera);
            const hit = raycaster.intersectObjects(viewer.brickMeshes.filter(mesh => mesh.visible), false)[0];
            if (!hit) return;
            const index = viewer.brickMeshes.indexOf(hit.object);
            let control, joint;
            for (const c of rig.controls) for (const j of c.joints) if (j.members.includes(index)) { control = c; joint = j; }
            if (!joint) return;
            sf.studio?.setSpin(false);
            const point = viewer.modelGroup.worldToLocal(hit.point.clone());
            const project = p => {
                const v = viewer.modelGroup.localToWorld(new THREE.Vector3(...p)).project(viewer.camera);
                return { x: (v.x + 1) * rect.width / 2, y: (1 - v.y) * rect.height / 2 };
            };
            const p0 = project(point.toArray()), p1 = project(core.rotatePoint(point.toArray(), joint.pivot, joint.axis, joint.factor));
            let dx = p1.x - p0.x, dy = p1.y - p0.y, length = Math.hypot(dx, dy);
            // If looking along an edge-on tangent, use a predictable horizontal drag.
            if (length < .2) { dx = joint.factor; dy = 0; length = 1; }
            drag = { control, pointerId: e.pointerId, x: e.clientX, y: e.clientY, angle: values[control.id], dx: dx / length, dy: dy / length, pixelsPerDegree: Math.max(1.5, length) };
            viewer.motionDragging = true; viewer.isDragging = false; viewer.isPanning = false;
            canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing';
            e.preventDefault(); e.stopImmediatePropagation();
        }, { capture: true });
        canvas.addEventListener('pointermove', e => {
            if (!drag || e.pointerId !== drag.pointerId) return;
            const delta = ((e.clientX - drag.x) * drag.dx + (e.clientY - drag.y) * drag.dy) / drag.pixelsPerDegree;
            setAngle(drag.control, drag.angle + delta); hint.textContent = `${drag.control.label}: ${Math.round(values[drag.control.id])}°`;
            e.preventDefault(); e.stopImmediatePropagation();
        }, { capture: true });
        for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, endDrag);
        window.addEventListener('blur', endDrag);
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && active) setActive(false); });
        // Restore the original pose before any feature that owns mesh transforms.
        const loadModel = viewer.loadModel.bind(viewer); viewer.loadModel = model => { setActive(false); return loadModel(model); };
        const explode = viewer.setExplode.bind(viewer); viewer.setExplode = value => { if (active) setActive(false); return explode(value); };
        const step = viewer.setStep.bind(viewer); viewer.setStep = value => { if (active) setActive(false); return step(value); };
        sf.on('studio:tray', on => { if (on) setActive(false); });
        sf.on('model', install);
        sf.articulation = { setActive, get active() { return active; }, get supported() { return !!rig; } };
        install(sf.model);
    }
    if (window.studForge) init(); else document.addEventListener('studforge:ready', init, { once: true });
})();
