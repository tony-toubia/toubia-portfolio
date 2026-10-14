// Pose mode: constrained assembly motion; source model and inventory stay pristine.
(() => {
    function init() {
        const sf = window.studForge, core = window.StudForgeArticulation;
        if (!sf || !core || sf.articulation) return;
        const viewer = sf.viewer, canvas = viewer.renderer.domElement;
        const panel = sf.registerPanel({ id: 'pose', title: 'MOVABLE ASSEMBLIES', group: 'build', order: 3 });
        const button = document.createElement('button'); button.type = 'button'; button.className = 'cam-btn'; button.id = 'btn-pose';
        button.innerHTML = '<span class="vc-ico">↻</span><span class="vc-label">JOINTS</span>';
        button.title = 'Move hinged assemblies; fixed bricks stay attached'; button.setAttribute('aria-label', 'Move hinged assemblies'); button.setAttribute('aria-pressed', 'false');
        sf.widget(button);
        const style = document.createElement('style');
        style.textContent = '.sfpose-controls label{display:block;margin:12px 0;font-size:14px}.sfpose-controls label>span{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px}.sfpose-controls input{width:100%;accent-color:var(--lego-yellow)}.sfpose-controls output{color:var(--lego-yellow);font-family:var(--font-mono)}.sfpose-axis{position:absolute;bottom:64px;left:14px;max-width:calc(100% - 28px);padding:8px 12px;border:1px solid var(--lego-yellow);border-radius:8px;background:#151b27ed;color:var(--lego-yellow);font-size:13px;pointer-events:none;z-index:5}.sfpose-tip{font-size:13px;color:var(--text-secondary);line-height:1.5}';
        document.head.appendChild(style);
        style.textContent += '.sfpose-controls label{padding:8px;border:1px solid transparent;border-radius:8px;cursor:pointer}.sfpose-controls label.on{border-color:var(--lego-yellow);background:#f2cd3712}.sfpose-controls small{display:block;color:var(--text-secondary);font-size:12px;margin-bottom:6px}';
        const hint = document.createElement('div'); hint.className = 'sfpose-axis'; hint.hidden = true; hint.setAttribute('role', 'status');
        (canvas.closest('.viewport-card') || viewer.container).appendChild(hint);
        let rig = null, rest = [], values = {}, active = false, drag = null, baseY = 0, highlights = [], selected = null, highlighted = null, hovered = null, hoverFrame = 0, hoverEvent = null;
        const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();

        function clearHighlights() {
            for (const item of highlights) { item.mesh.material = item.original; item.material.dispose(); }
            highlights = []; highlighted = null;
        }
        function showHighlights() {
            const id = hovered || (active ? selected : null);
            if (highlighted === id) return;
            clearHighlights();
            const control = rig?.controls.find(c => c.id === id);
            for (const joint of control?.joints || []) for (const index of joint.members) viewer.brickMeshes[index].traverse(mesh => {
                if (!mesh.isMesh || !mesh.material?.clone) return;
                const original = mesh.material, material = original.clone();
                material.color.lerp(new THREE.Color(0xf2cd37), .6);
                if (material.emissive) { material.emissive.setHex(0xf2cd37); material.emissiveIntensity = .35; }
                mesh.material = material; highlights.push({ mesh, original, material });
            });
            highlighted = id;
        }
        function canPreview() {
            return !!rig && !sf.studio?.recording && !sf.studio?.spinning && !sf.studio?.trayOn && !sf.studio?.transitioning && !sf.studio?.inspecting
                && !viewer.explodeProgress && viewer.currentStep === viewer.maxLayer;
        }
        function pickJoint(e) {
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return null;
            pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
            viewer.scene.updateMatrixWorld(true); raycaster.setFromCamera(pointer, viewer.camera);
            // Pick the nearest visible surface, including fixed pieces that can occlude a joint.
            const hit = raycaster.intersectObjects(viewer.brickMeshes.filter(mesh => mesh.visible), true)[0];
            if (!hit) return null;
            const index = core.memberIndex(hit.object, viewer.brickMeshes);
            for (const control of rig?.controls || []) for (const joint of control.joints) if (joint.members.includes(index)) return { hit, control, joint, rect };
            return null;
        }
        function resetHover() {
            if (hoverFrame) cancelAnimationFrame(hoverFrame);
            hoverFrame = 0; hoverEvent = null; hovered = null; viewer.motionHover = false;
            showHighlights(); updateControls();
            if (!drag) canvas.style.cursor = '';
        }
        function previewHover(e) {
            if (!canPreview() || viewer.isDragging || viewer.isPanning || e.buttons || e.pointerType === 'touch') { resetHover(); return; }
            hovered = pickJoint(e)?.control.id || null;
            viewer.motionHover = !!hovered;
            showHighlights(); updateControls(); canvas.style.cursor = hovered ? 'grab' : '';
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
            if (toggle) { toggle.textContent = active ? '✓ JOINT MOVEMENT ON' : '↻ SHOW MOVABLE ASSEMBLIES'; toggle.setAttribute('aria-pressed', String(active)); }
            button.classList.toggle('on', active); button.setAttribute('aria-pressed', String(active)); hint.hidden = !active && !hovered;
            if (!drag && (active || hovered)) hint.textContent = `${rig.controls.find(c => c.id === (hovered || selected))?.label} · drag its gold pieces · fixed pieces orbit`;
            for (const control of rig?.controls || []) panel.body.querySelector(`[data-select="${control.id}"]`).classList.toggle('on', control.id === (hovered || (active ? selected : null)));
        }
        function endDrag() {
            if (drag && canvas.hasPointerCapture(drag.pointerId)) canvas.releasePointerCapture(drag.pointerId);
            drag = null; viewer.motionDragging = false; canvas.style.cursor = active ? 'grab' : '';
            if (active) updateControls();
        }
        function setActive(on) {
            if (on && (!rig || sf.studio?.recording)) return;
            resetHover();
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
                // Only the ship takes the flight lift. Its figures and ground
                // accessories keep their original world positions on the floor.
                for (const [first, last] of rig.groundedRanges || []) for (let i = first; i <= last; i++) {
                    viewer.brickMeshes[i].position.y -= rig.lift;
                    viewer.brickMeshes[i].updateMatrix();
                }
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
            if (hovered || hoverFrame) resetHover();
            if (!active) setActive(true);
            if (!active) { updateControls(); return; }
            hovered = null; selected = control.id; values[control.id] = core.clamp(value, control); apply(); updateControls();
        }
        function install(model) {
            rig = core.resolve(model); rest = []; values = Object.fromEntries((rig?.controls || []).map(c => [c.id, 0]));
            selected = rig?.controls[0]?.id || null;
            button.hidden = !rig; panel.section.hidden = !rig;
            if (!rig) { panel.body.innerHTML = ''; return; }
            panel.body.innerHTML = '<p class="sfpose-tip">Hover over a movable assembly to see its connected pieces in gold, then drag to rotate its joint. You can also choose an angle slider, or tap Joints on a touch screen. Fixed bricks stay attached; drag them to rotate the view.</p>'
                + '<button type="button" class="action-btn secondary" data-toggle aria-pressed="false">↻ SHOW MOVABLE ASSEMBLIES</button><div class="sfpose-controls">'
                + rig.controls.map(c => `<label data-select="${c.id}"><span>${c.label}<output data-value="${c.id}">0°</output></span><small>${c.joints.reduce((n, j) => n + j.members.length, 0)} connected pieces</small><input type="range" min="${c.min}" max="${c.max}" step="1" value="0" data-angle="${c.id}" aria-label="${c.label}"></label>`).join('')
                + '</div><button type="button" class="action-btn tertiary" data-reset>RESET POSE</button><p class="sfpose-tip">Demonstration poses. Building steps and parts lists use the original assembly.</p>';
        }
        button.addEventListener('click', () => setActive(!active));
        panel.body.addEventListener('click', e => {
            const choice = rig?.controls.find(c => c.id === e.target.closest('[data-select]')?.dataset.select);
            if (choice) { selected = choice.id; setActive(true); if (active) { showHighlights(); updateControls(); } }
            if (e.target.closest('[data-toggle]')) setActive(!active);
            if (e.target.closest('[data-reset]')) { endDrag(); values = Object.fromEntries(rig.controls.map(c => [c.id, 0])); apply(); updateControls(); }
        });
        panel.body.addEventListener('input', e => {
            const control = rig?.controls.find(c => c.id === e.target.dataset.angle);
            if (control) setAngle(control, Number(e.target.value));
        });
        panel.body.addEventListener('focusin', e => {
            const control = rig?.controls.find(c => c.id === e.target.dataset.angle);
            if (control && active) { resetHover(); selected = control.id; showHighlights(); updateControls(); }
        });

        canvas.addEventListener('pointerdown', e => {
            if (sf.studio?.recording || (e.pointerType === 'mouse' && (e.button !== 0 || e.shiftKey))) { resetHover(); return; }
            // A second finger hands control back to the camera for pan/pinch.
            if (drag) { endDrag(); return; }
            if (!active && (!canPreview() || e.pointerType === 'touch')) { resetHover(); return; }
            const picked = pickJoint(e);
            if (!picked) { resetHover(); return; }
            const { hit, control, joint, rect } = picked;
            const point = viewer.modelGroup.worldToLocal(hit.point.clone());
            if (!active) setActive(true);
            if (!active) return;
            resetHover();
            selected = control.id; showHighlights(); updateControls();
            sf.studio?.setSpin(false);
            viewer.scene.updateMatrixWorld(true);
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
            if (!drag) {
                hoverEvent = { clientX: e.clientX, clientY: e.clientY, pointerType: e.pointerType, buttons: e.buttons };
                if (!hoverFrame) hoverFrame = requestAnimationFrame(() => { hoverFrame = 0; const event = hoverEvent; hoverEvent = null; if (event) previewHover(event); });
                return;
            }
            if (e.pointerId !== drag.pointerId) return;
            const delta = ((e.clientX - drag.x) * drag.dx + (e.clientY - drag.y) * drag.dy) / drag.pixelsPerDegree;
            setAngle(drag.control, drag.angle + delta); hint.textContent = `${drag.control.label}: ${Math.round(values[drag.control.id])}°`;
            e.preventDefault(); e.stopImmediatePropagation();
        }, { capture: true });
        for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, endDrag);
        canvas.addEventListener('pointerleave', () => { if (!drag) resetHover(); });
        window.addEventListener('blur', () => { resetHover(); endDrag(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && active) setActive(false); });
        // Restore the original pose before any feature that owns mesh transforms.
        const loadModel = viewer.loadModel.bind(viewer); viewer.loadModel = model => { setActive(false); return loadModel(model); };
        const explode = viewer.setExplode.bind(viewer); viewer.setExplode = value => { setActive(false); return explode(value); };
        const step = viewer.setStep.bind(viewer); viewer.setStep = value => { setActive(false); return step(value); };
        sf.on('forging', resetHover);
        sf.on('studio:tray', on => { if (on) setActive(false); });
        sf.on('model', install);
        sf.articulation = { setActive, get active() { return active; }, get supported() { return !!rig; } };
        install(sf.model);
    }
    if (window.studForge) init(); else document.addEventListener('studforge:ready', init, { once: true });
})();
