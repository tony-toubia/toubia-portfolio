// StudForge studio: tap a brick to inspect it, a parts tray that sorts the
// model by element type, baseplates, lighting moods, a live spin and a turntable video.
//
// Where it lives in the workbench shell:
//   canvas view cluster   🧩 BY TYPE (the parts tray) and ⟳ SPIN (auto-rotate; shows the recording ring)
//   Style tab             SCENE: baseplate and lighting (section id 'studio')
//   header Share menu     Snapshot (a PNG) and Record turntable video (a webm of one orbit)
//
// Everything hooks into the viewer from outside: the render loop is wrapped so
// tweens and pulses run before each frame, `setExplode` is wrapped so the
// explode slider sleeps while the parts tray is out, and `model` events resize
// the baseplate and re-aim the lights whenever a new idea is forged.
(() => {
    'use strict';
    const STORE_KEY = 'studforge.studio.v1';
    const GLOW = 0xffe14d;   // the highlight pulse colour (the app's yellow, a touch warmer)

    const CSS = `
/* canvas widgets (BY TYPE, SPIN) take the view cluster's .cam-btn look; recording shows on SPIN */
.sfs-ring { width: 13px; height: 13px; border-radius: 50%; display: none; flex: none; background: conic-gradient(#ff6b6b calc(var(--p, 0) * 1%), rgba(255, 255, 255, 0.18) 0); box-shadow: 0 0 0 2px rgba(255, 107, 107, 0.25); }
.cam-btn.rec { color: #ff8a8a; border-color: rgba(255, 107, 107, 0.7); cursor: default; }
.cam-btn.rec .sfs-ring { display: block; }
.cam-btn.rec .vc-ico { display: none; }
.cam-btn.rec .vc-label { display: inline !important; font-family: var(--font-mono); letter-spacing: 0; }
.sfs-inspect { position: absolute; z-index: 8; width: 236px; max-width: calc(100% - 16px); background: rgba(13, 17, 25, 0.94); border: 1px solid rgba(242, 205, 55, 0.5); border-radius: 10px; padding: 10px 12px 11px; box-shadow: 0 10px 34px rgba(0, 0, 0, 0.6); backdrop-filter: blur(8px); font-family: var(--font-body); color: var(--text-primary); animation: sfs-pop 0.16s ease-out; }
.sfs-inspect[hidden] { display: none; }
@keyframes sfs-pop { from { opacity: 0; transform: translateY(6px) scale(0.97); } to { opacity: 1; transform: none; } }
.sfs-close { position: absolute; top: 3px; right: 5px; background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer; line-height: 1; padding: 2px 5px; }
.sfs-close:hover { color: #fff; }
.sfs-kicker { font-family: var(--font-heading); font-size: 9px; letter-spacing: 1px; color: var(--text-muted); }
.sfs-name { font-family: var(--font-heading); font-size: 12px; font-weight: 800; color: #fff; margin: 3px 16px 7px 0; line-height: 1.25; }
.sfs-row { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin: 3px 0; letter-spacing: 0.3px; }
.sfs-dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.3); flex-shrink: 0; }
.sfs-mono { font-family: var(--font-mono); font-size: 11px; color: var(--lego-yellow); }
.sfs-actions { display: flex; gap: 6px; margin-top: 9px; }
.sfs-btn { flex: 1; background: rgba(255, 255, 255, 0.08); border: 1px solid var(--border-main); color: #fff; font-family: var(--font-heading); font-size: 9px; font-weight: 800; letter-spacing: 0.4px; padding: 7px 4px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
.sfs-btn:hover { border-color: var(--lego-yellow); }
.sfs-btn.on { background: rgba(242, 205, 55, 0.18); border-color: var(--lego-yellow); color: var(--lego-yellow); }
.sfs-btn.primary { background: linear-gradient(135deg, var(--lego-yellow) 0%, #d4a017 100%); color: #0c0f17; border-color: transparent; }
/* the SCENE section in the Style tab */
.sfs-group + .sfs-group { margin-top: 14px; }
.sfs-sub { font-family: var(--font-heading); font-size: 9px; font-weight: 700; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 7px; }
/* one row of equal tiles per setting, the tool-chip look stretched to fit */
.sfs-chips { display: grid; grid-template-columns: repeat(var(--n, 3), minmax(0, 1fr)); gap: 6px; }
.sfs-chips .tool-chip { flex-direction: column; justify-content: center; gap: 4px; min-height: 50px; padding: 6px 2px 5px; border-radius: 9px; font-size: 13px; line-height: 1.1; background: rgba(9, 12, 19, 0.5); min-width: 0; }
.sfs-chips .tool-chip > span:last-child { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sfs-chips .tool-chip.on { background: rgba(242, 205, 55, 0.12); color: var(--lego-yellow); border-color: rgba(242, 205, 55, 0.6); }
.sfs-chips .tool-chip:focus-visible { outline: 2px solid var(--lego-yellow); outline-offset: 1px; }
.sfs-sw { width: 18px; height: 18px; border-radius: 5px; border: 1px solid rgba(255, 255, 255, 0.28); flex: none; box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.2); }
.sfs-sw.none { background: repeating-linear-gradient(135deg, transparent 0 3px, rgba(255, 255, 255, 0.25) 3px 4px); }
.sfs-chip-ico { font-size: 17px; line-height: 18px; height: 18px; }
.sfs-tip { font-size: 13px; color: var(--text-muted); line-height: 1.4; margin-top: 7px; }
.sfs-explode-off { opacity: 0.45; }
.sfs-explode-off .tech-slider { cursor: not-allowed; }
`;

    function init() {
        const sf = window.studForge, THREE = window.THREE;
        if (!sf || !THREE || !sf.viewer || !sf.viewer.renderer) return;
        const viewer = sf.viewer, scene = viewer.scene, canvas = viewer.renderer.domElement;
        const viewportCard = viewer.container.closest('.viewport-card') || viewer.container.parentElement;
        const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

        const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const colorOf = (key) => window.LEGO_COLORS[key] || { name: key, hex: '#cccccc' };
        const partOf = (id) => window.LEGO_PARTS[id] || (window.BrickBuilder && window.BrickBuilder.partInfo(id)) || { id, name: `Element ${id}`, category: 'Misc', width: 1, length: 1, height: 1.2 };
        const trayCore = window.StudForgePartsTray;
        const isTrans = (key) => { const c = window.LEGO_COLORS[key]; return !!(c && (c.trans || c.category === 'Transparent')) || /^TRANS_/.test(String(key)); };
        const modelId = () => String((sf.model && sf.model.id) || 'model').replace(/[^a-z0-9_-]+/gi, '-');

        /* ── per-frame hooks: run before the viewer renders ─────────── */
        const frameTasks = new Set();
        const origAnimate = viewer.animate;   // bound; it re-reads `this.animate` for the next frame, so the wrapper takes over
        viewer.animate = function () {
            const now = performance.now();
            for (const t of frameTasks) { try { t(now); } catch (e) { frameTasks.delete(t); console.error('studio frame task', e); } }
            origAnimate();
        };

        /* ── tween: positions + rotations with an ease-in-out, staggered ── */
        const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        let activeTween = null;
        function tween(items, duration, onDone) {
            if (activeTween) { frameTasks.delete(activeTween); activeTween = null; }
            const t0 = performance.now();
            const task = (now) => {
                let live = false;
                for (const it of items) {
                    const k = Math.max(0, Math.min(1, (now - t0 - it.delay) / duration));
                    if (k < 1) live = true;
                    const e = ease(k);
                    it.mesh.position.lerpVectors(it.p0, it.p1, e);
                    it.mesh.rotation.set(it.r0.x + (it.r1.x - it.r0.x) * e, it.r0.y + (it.r1.y - it.r0.y) * e, it.r0.z + (it.r1.z - it.r0.z) * e);
                }
                if (!live) { frameTasks.delete(task); activeTween = null; if (onDone) onDone(); }
            };
            activeTween = task;
            frameTasks.add(task);
        }

        /* ══════════════════════════════════════════════════════════════
           1. Tap a brick to inspect it
           ══════════════════════════════════════════════════════════════ */
        const card = document.createElement('div');
        card.className = 'sfs-inspect'; card.hidden = true;
        viewportCard.appendChild(card);

        const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
        function pick(clientX, clientY) {
            const r = canvas.getBoundingClientRect();
            if (!r.width || !r.height) return null;
            ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
            raycaster.setFromCamera(ndc, viewer.camera);
            viewer.scene.updateMatrixWorld(true);
            const hits = raycaster.intersectObjects(viewer.brickMeshes.filter((m) => m.visible && !m.userData.segment), true);
            if (!hits.length) return null;
            let mesh = hits[0].object;
            while (mesh && !viewer.brickMeshes.includes(mesh)) mesh = mesh.parent;
            return mesh;
        }

        // Materials are shared per colour, so highlighted bricks get a private clone to tint.
        let lit = [];
        const clearHighlight = () => { for (const { mesh, orig } of lit) { if (mesh.material !== orig) { mesh.material.dispose(); mesh.material = orig; } } lit = []; };
        const setHighlight = (meshes) => { clearHighlight(); for (const root of meshes) root.traverse(m => { if (!m.isMesh || !m.material?.clone) return; lit.push({ mesh: m, orig: m.material }); m.material = m.material.clone(); }); };
        frameTasks.add((now) => {
            if (!lit.length) return;
            const k = 0.3 + 0.3 * Math.sin(now / 150);
            for (const { mesh } of lit) { mesh.material.emissive.setHex(GLOW); mesh.material.emissiveIntensity = k; }
        });

        let inspection = null;
        function closeCard(restoreView = true) {
            card.hidden = true; card.innerHTML = ''; clearHighlight();
            if (inspection) {
                inspection.mesh.position.copy(inspection.position); inspection.mesh.updateMatrix();
                if (restoreView) restoreCamera(inspection.camera);
                inspection = null; viewer.partsInspecting = false;
                if (trayLabels) trayLabels.visible = true;
                trayTools.hidden=!trayOn;
                if (navigationHint) navigationHint.textContent='Drag to pan · scroll or pinch to zoom · click a piece to lift and inspect it';
            }
        }
        function openCard(mesh, clientX, clientY) {
            if (activeTween) return;
            closeCard();
            const ud = mesh.userData, part = { ...partOf(ud.partId), name: ud.partName || partOf(ud.partId).name }, col = colorOf(ud.colorKey);
            const step = (ud.layer || 0) + 1;
            const same = viewer.brickMeshes.filter((m) => m.userData.partId === ud.partId && m.userData.colorKey === ud.colorKey);
            if (trayOn) {
                const bounds = trayCore.measure(mesh), size = bounds.getSize(new THREE.Vector3());
                inspection = { mesh, position: mesh.position.clone(), camera: captureCamera() };
                mesh.position.y += Math.max(2,size.y*.5+1); mesh.updateMatrix();
                viewer.partsInspecting = true; trayLabels.visible = false;
                trayTools.hidden=true;
                if (navigationHint) navigationHint.textContent='Drag to orbit this piece · scroll or pinch to zoom · Back to Parts returns to the tray';
                viewer.modelGroup.updateMatrixWorld(true);
                viewer.target.copy(viewer.modelGroup.localToWorld(bounds.getCenter(new THREE.Vector3()).add(mesh.position)));
                viewer.spherical.theta = Math.PI/4; viewer.spherical.phi = Math.PI/3;
                glideRadius(Math.max(4,Math.max(size.x,size.z,size.y)*2.3/Math.min(1,viewer.camera.aspect)),300);
            }
            card.innerHTML = `<button class="sfs-close" aria-label="Close">×</button>
<div class="sfs-kicker">${trayOn ? 'PIECE INSPECTOR · DRAG TO ORBIT' : 'BRICK INSPECTOR'}</div>
<div class="sfs-name">${esc(part.name)}</div>
<div class="sfs-row"><span class="sfs-dot" style="background:${esc(col.hex)}"></span>${esc(col.name)}</div>
<div class="sfs-row">DESIGN ID <span class="sfs-mono">#${esc(ud.partId)}</span></div>
<div class="sfs-row">ADDED IN <span class="sfs-mono">STEP ${step}</span> · <span class="sfs-mono">×${same.length}</span> IN MODEL</div>
<div class="sfs-actions">${trayOn ? '<button class="sfs-btn primary" data-act="tray">BACK TO PARTS</button>' : `<button class="sfs-btn primary" data-act="step">GO TO STEP ${step}</button><button class="sfs-btn" data-act="all">HIGHLIGHT ALL ×${same.length}</button>`}</div>`;
            card.hidden = false;
            card.classList.toggle('sfs-parts-inspect',trayOn);
            // Anchor beside the pointer, flipped and clamped so it never leaves the viewport card.
            const r = viewportCard.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight;
            let x = clientX - r.left + 14, y = clientY - r.top + 14;
            if (x + w > r.width - 8) x = clientX - r.left - w - 14;
            if (y + h > r.height - 8) y = clientY - r.top - h - 14;
            card.style.left = trayOn ? '' : `${Math.max(8, Math.min(r.width - w - 8, x))}px`;
            card.style.right = trayOn ? '12px' : '';
            card.style.top = trayOn ? '60px' : `${Math.max(8, Math.min(r.height - h - 8, y))}px`;
            setHighlight([mesh]);
            card.querySelector('.sfs-close').addEventListener('click', closeCard);
            if (trayOn) { card.querySelector('[data-act="tray"]').addEventListener('click', () => closeCard()); return; }
            card.querySelector('[data-act="step"]').addEventListener('click', () => sf.goStep(step - 1));
            const all = card.querySelector('[data-act="all"]');
            all.addEventListener('click', () => { const on = all.classList.toggle('on'); setHighlight(on ? same : [mesh]); });
        }

        // A tap is a short press that barely moves; anything else is an orbit drag.
        let press = null;
        canvas.addEventListener('pointerdown', (e) => { if (viewer.poseActive || (e.pointerType === 'mouse' && e.button !== 0)) return; press = { x: e.clientX, y: e.clientY, t: performance.now() }; });
        canvas.addEventListener('pointerup', (e) => {
            if (viewer.poseActive) { press = null; return; }
            if (!press) return;
            const p = press; press = null;
            if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6 || performance.now() - p.t > 300) return;
            const mesh = pick(e.clientX, e.clientY);
            if (mesh) openCard(mesh, e.clientX, e.clientY); else closeCard();
        });
        canvas.addEventListener('pointercancel', () => { press = null; });
        document.addEventListener('pointerdown', (e) => { if (!card.hidden && !card.contains(e.target) && e.target !== canvas) closeCard(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !card.hidden) closeCard(); });

        /* ══════════════════════════════════════════════════════════════
           2. Parts tray: every brick sorted out by type and colour
           ══════════════════════════════════════════════════════════════ */
        const explodeSlider = document.getElementById('slider-explode');
        const explodeGroup = explodeSlider && (explodeSlider.closest('.explode-pop') || explodeSlider.parentElement);
        let trayOn = false, trayExtent = 0, trayLabels = null, trayGroups = [], trayCamera = null, trayLayout = null, samples = new Set();
        const trayTools = document.createElement('div'); trayTools.className = 'sfs-tray-tools'; trayTools.hidden = true;
        trayTools.innerHTML = '<span data-tray-count></span><button type="button" data-tray-fit>FIT ALL PIECES</button><span>One sample per type & color · quantities include every piece</span>';
        viewportCard.appendChild(trayTools);
        const navigationHint = viewportCard.querySelector('.viewport-hint'), originalHint = navigationHint?.textContent;
        trayTools.querySelector('[data-tray-fit]').addEventListener('click', () => { closeCard(); fitTray(); });
        style.textContent += '.sfs-tray-tools{position:absolute;top:60px;left:12px;right:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;color:#e2e8f0;background:#111827eb;border:1px solid var(--border-main);border-radius:8px;padding:6px 8px;pointer-events:none;z-index:6}.sfs-tray-tools[hidden]{display:none}.sfs-tray-tools button{pointer-events:auto;background:var(--bg-main);border:1px solid var(--border-main);color:var(--lego-yellow);padding:6px 10px;border-radius:6px;cursor:pointer}';
        style.textContent += '@media(max-width:767px){.sfs-tray-tools{top:12px;right:58px;gap:6px;font-size:11px}.sfs-parts-inspect{top:12px!important;left:12px!important;right:58px!important;width:auto}}';
        const origSetExplode = viewer.setExplode.bind(viewer);
        viewer.setExplode = function (v) {
            if (trayOn) { this.explodeProgress = Math.max(0, Math.min(1, v)); return; }   // the tray owns the positions for now
            return origSetExplode(v);
        };
        const origSetStep = viewer.setStep.bind(viewer);
        viewer.setStep = function (v) { const result=origSetStep(v);if(trayOn)for(const mesh of this.brickMeshes)mesh.visible=samples.has(mesh);return result; };

        const homeOf = (m) => { if (!m.userData.sfsHome) m.userData.sfsHome = { rot: { x: m.rotation.x, y: m.rotation.y, z: m.rotation.z } }; return m.userData.sfsHome; };

        function labelSprite(name, qty, size) {
            const c = document.createElement('canvas'); c.width = 256; c.height = 128;
            const g = c.getContext('2d');
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 8;
            g.fillStyle = '#f2cd37'; g.font = '800 46px Rajdhani, sans-serif'; g.fillText(`×${qty}`, 128, 40);
            g.fillStyle = '#e2e8f0'; g.font = '700 21px Rajdhani, sans-serif'; g.fillText(name, 128, 96, 245);
            const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
            s.scale.set(3.2 * size, 1.6 * size, 1);
            return s;
        }
        const shortName = (part) => part.name.replace(/ x /g, '×').replace(/ with .*$/i, '').replace(/\(.*\)/, '').trim().toUpperCase().slice(0, 18);

        function disposeLabels() {
            if (!trayLabels) return;
            for (const s of trayLabels.children) { s.material.map.dispose(); s.material.dispose(); }
            if (trayLabels.parent) trayLabels.parent.remove(trayLabels);
            trayLabels = null;
        }

        /** One measured sample per type/color; quantities still include every source piece. */
        function layoutTray() {
            closeCard(false); disposeLabels(); samples = new Set();
            const groups = new Map();
            for (const mesh of viewer.brickMeshes) {
                homeOf(mesh); mesh.visible = false;
                if (mesh.userData.segment) continue;
                const key = `${mesh.userData.partId}|${mesh.userData.colorKey}`;
                if (!groups.has(key)) groups.set(key, { partId: mesh.userData.partId, part: { ...partOf(mesh.userData.partId), name: mesh.userData.partName || partOf(mesh.userData.partId).name }, meshes: [], bounds: trayCore.measure(mesh) });
                groups.get(key).meshes.push(mesh);
            }
            trayGroups = [...groups.values()];
            trayLayout = trayCore.layout(trayGroups,viewer.camera.aspect);
            trayExtent = Math.max(trayLayout.width,trayLayout.depth)+4;
            const cx = viewer.centre.x, cz = viewer.centre.z, items = [];
            trayLabels = new THREE.Group();
            for (const cell of trayLayout.cells) {
                const g=cell.group, mesh=g.meshes[0], pos=trayCore.position(cell).add(new THREE.Vector3(cx,0,cz));
                mesh.visible = true; samples.add(mesh);
                items.push({mesh,p0:mesh.position.clone(),p1:pos,r0:{x:mesh.rotation.x,y:mesh.rotation.y,z:mesh.rotation.z},r1:{x:0,y:0,z:0},delay:0});
                const width=Math.min(8,cell.width-.6), label=labelSprite(g.partId+' · '+shortName(g.part),g.meshes.length,width/3.2);
                label.scale.y=1.6;
                label.position.set(cell.x+cell.width/2+cx,.15,cell.z+cell.depth-cell.footer/2+cz);
                trayLabels.add(label);
            }
            viewer.modelGroup.add(trayLabels);
            trayTools.querySelector('[data-tray-count]').textContent = `${trayGroups.length} types/colors · ${[...groups.values()].reduce((n,g)=>n+g.meshes.length,0)} pieces`;
            tween(items,550);
        }

        function gatherTray() {
            const meshes = viewer.brickMeshes;
            for (const m of meshes) m.visible = (m.userData.layer || 0) <= viewer.currentStep;
            disposeLabels();
            // Where the bricks belong now (home, or exploded) is whatever the viewer's own explode puts them at.
            const cur = meshes.map((m) => m.position.clone());
            origSetExplode(viewer.explodeProgress);
            const items = meshes.map((m, i) => { const home = homeOf(m); const it = { mesh: m, p0: cur[i], p1: m.position.clone(), r0: { x: m.rotation.x, y: m.rotation.y, z: m.rotation.z }, r1: home.rot, delay: Math.min(350, i * 3) }; m.position.copy(cur[i]); return it; });
            tween(items, 850);
        }

        // Glide the camera out to take in the whole tray, and back to where it was.
        let zoomTask = null;
        function captureCamera() { return { theta:viewer.spherical.theta,phi:viewer.spherical.phi,radius:viewer.spherical.radius,target:viewer.target.clone() }; }
        function restoreCamera(camera) {
            if (zoomTask) frameTasks.delete(zoomTask); zoomTask = null;
            Object.assign(viewer.spherical,{theta:camera.theta,phi:camera.phi,radius:camera.radius});viewer.target.copy(camera.target);viewer.updateCameraPosition();
        }
        function fitTray() {
            if (!trayLayout) return;
            const height=trayGroups.reduce((n,g)=>Math.max(n,g.bounds.max.y-g.bounds.min.y),0);
            const padding={height:viewer.container.clientHeight,top:trayTools.offsetTop+trayTools.offsetHeight+12,bottom:72};
            const radius=trayCore.fitRadius(trayLayout.width+2,trayLayout.depth+3,viewer.camera,height,padding);
            viewer.partsRadius = radius; viewer.partsExtent = trayExtent;
            viewer.partsHeight = height+viewer.modelGroup.position.y;viewer.partsWidth=trayLayout.width+2;viewer.partsDepth=trayLayout.depth+3;
            viewer.partsViewPadding=padding;viewer.partsOffsetZ=trayCore.offsetZ(radius,viewer.camera,padding);
            viewer.target.set(0,viewer.modelGroup.position.y,viewer.partsOffsetZ);viewer.spherical.theta=0;viewer.spherical.phi=.05;
            viewer.camera.far=Math.max(500,radius*4);viewer.camera.updateProjectionMatrix();
            scene.fog.near=Math.max(60,radius*2);scene.fog.far=scene.fog.near+80;
            glideRadius(radius,450);
        }
        function glideRadius(to, ms) {
            if (zoomTask) frameTasks.delete(zoomTask);
            const from = viewer.spherical.radius, t0 = performance.now();
            zoomTask = (now) => {
                const k = Math.min(1, (now - t0) / ms);
                viewer.spherical.radius = from + (to - from) * ease(k); viewer.updateCameraPosition();
                if (k >= 1) { frameTasks.delete(zoomTask); zoomTask = null; }
            };
            frameTasks.add(zoomTask);
        }

        function setTray(on) {
            if (on === trayOn) return;
            sf.emit('studio:tray', on);
            closeCard();
            trayOn = on; viewer.partsTray = on; viewer.partsInspecting = false;
            trayTools.hidden=!on;
            if (on) {
                setSpin(false); trayCamera=captureCamera();
                layoutTray();
                fitTray();
            } else {
                gatherTray(); trayExtent = 0;
                const radius=viewer.framingRadius();
                if (trayCamera) trayCamera.radius*=radius/viewer.home.radius;
                viewer.home.radius=radius;
                if (trayCamera) restoreCamera(trayCamera);
                trayCamera = null; viewer.partsRadius = null; viewer.partsExtent = null; viewer.partsHeight = null;
                scene.fog.near=viewer.hasBakedModel?Math.max(60,viewer.home.radius*1.3):60;scene.fog.far=scene.fog.near+80;
            }
            trayTools.hidden=!on;
            spinBtn.disabled=on;spinBtn.title=on?'Automatic spin is off in parts view':'Spin the model round';
            if (navigationHint) navigationHint.textContent=on?'Drag to pan · scroll or pinch to zoom · click a piece to lift and inspect it':originalHint;
            if (explodeSlider) explodeSlider.disabled = on;
            if (explodeGroup) explodeGroup.classList.toggle('sfs-explode-off', on);
            trayBtn.classList.toggle('on', on);
            trayBtn.setAttribute('aria-pressed', String(on));
            applyFloor();
            if (window.studForgeAudio && window.studForgeAudio.playRatchetClick) window.studForgeAudio.playRatchetClick();
        }

        /* ══════════════════════════════════════════════════════════════
           3. Baseplates: a studded plate on the pedestal, sized to the model
           ══════════════════════════════════════════════════════════════ */
        const PLATES = {
            none: { label: 'None' },
            grass: { label: 'Grass', color: 0x3f9a34, stud: 0x4db040, rough: 0.95 },
            water: { label: 'Water', color: 0x2f8de0, stud: 0x5ab0f5, rough: 0.12, metal: 0.1, trans: true, opacity: 0.72, shimmer: 0x0b3f7a },
            snow: { label: 'Snow', color: 0xf4f6f8, stud: 0xffffff, rough: 1 },
            city: { label: 'City', color: 0x363b43, stud: 0x40454e, rough: 0.85, road: true },
        };
        const plate = { kind: 'none', group: null, mats: [] };
        const evenCeil = (n) => Math.ceil(n / 2) * 2;

        function disposePlate() {
            if (!plate.group) return;
            scene.remove(plate.group);
            plate.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
            for (const m of plate.mats) m.dispose();
            plate.group = null; plate.mats = [];
        }

        function buildPlate(N) {
            disposePlate();
            const spec = PLATES[plate.kind];
            if (!spec || !spec.color) return;
            const g = new THREE.Group(); g.name = 'sfs-baseplate';
            // Hexes are sRGB; the viewer renders with sRGB output, so they go to linear like the brick colours.
            const mat = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), roughness: spec.rough, metalness: spec.metal || 0.02, transparent: !!spec.trans, opacity: spec.trans ? spec.opacity : 1, envMapIntensity: 0.5, ...extra }); plate.mats.push(m); return m; };
            const base = new THREE.Mesh(new THREE.BoxGeometry(N, 0.32, N), mat(spec.color));
            base.position.y = -0.16; base.receiveShadow = true;
            g.add(base);

            // A road along the far edge (behind the model in the home view), with a dashed centre line.
            let roadZ0 = Infinity, roadZ1 = -Infinity;
            if (spec.road) {
                const roadW = 5, zc = -(N / 2 - roadW / 2 - 1.5);
                roadZ0 = zc - roadW / 2; roadZ1 = zc + roadW / 2;
                const road = new THREE.Mesh(new THREE.BoxGeometry(N, 0.04, roadW), mat(0x1c1f25, { roughness: 0.95 }));
                road.position.set(0, 0.02, zc); road.receiveShadow = true; g.add(road);
                const dashMat = mat(0xf2cd37, { roughness: 0.6 });
                for (let x = -N / 2 + 1.5; x < N / 2 - 1; x += 3) { const d = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 0.3), dashMat); d.position.set(x, 0.05, zc); g.add(d); }
            }

            // Studs line up with the model's brick cells (modelGroup is shifted by -centre).
            const c = viewer.centre || { x: 0, z: 0 };
            const ax = ((0.5 - c.x) % 1 + 1) % 1, az = ((0.5 - c.z) % 1 + 1) % 1;
            const pts = [];
            for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
                const x = i - N / 2 + ax, z = j - N / 2 + az;
                if (Math.abs(x) > N / 2 - 0.4 || Math.abs(z) > N / 2 - 0.4) continue;
                if (z > roadZ0 - 0.3 && z < roadZ1 + 0.3) continue;
                pts.push(x, z);
            }
            const studGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12); studGeo.translate(0, 0.09, 0);
            const studs = new THREE.InstancedMesh(studGeo, mat(spec.stud), pts.length / 2);
            const m4 = new THREE.Matrix4();
            for (let k = 0; k < pts.length; k += 2) studs.setMatrixAt(k / 2, m4.makeTranslation(pts[k], 0, pts[k + 1]));
            studs.instanceMatrix.needsUpdate = true;
            studs.castShadow = true; studs.receiveShadow = true;
            g.add(studs);
            scene.add(g);
            plate.group = g;
        }

        // Water glints: a slow breathing emissive on the plate.
        frameTasks.add((now) => {
            const spec = PLATES[plate.kind];
            if (!spec || !spec.shimmer || !plate.mats.length) return;
            const k = 0.14 + 0.1 * Math.sin(now / 420);
            for (const m of plate.mats) { m.emissive.setHex(spec.shimmer); m.emissiveIntensity = k; }
        });

        /** Pedestal, grid and plate follow the model's size, or the tray's when it is out. */
        function applyFloor() {
            const f = Math.max(viewer.extent || 10, trayOn ? trayExtent : 0);
            const spec = PLATES[plate.kind], hasPlate = !!(spec && spec.color);
            const N = evenCeil(Math.max(20, spec && spec.road ? f + 10 : f * 1.15));
            const s = Math.max(1, f / 22, hasPlate ? (N * 0.7072 + 0.5) / 14 : 0);
            viewer.pedestal.scale.set(s, 1, s);
            viewer.grid.scale.set(s, 1, s);
            viewer.grid.visible = !hasPlate;
            if (hasPlate) buildPlate(N); else disposePlate();
        }

        function setPlate(kind, persist = true) {
            if (!PLATES[kind]) kind = 'none';
            plate.kind = kind;
            applyFloor();
            for (const b of plateChips.children) { const on = b.dataset.kind === kind; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
            if (persist) save();
        }

        /* ══════════════════════════════════════════════════════════════
           4. Lighting moods
           ══════════════════════════════════════════════════════════════ */
        // The viewer's ambient is a hemisphere light (older builds used an AmbientLight); its ground colour follows the sky.
        const ambient = scene.children.find((o) => o.isAmbientLight || o.isHemisphereLight);
        const dirs = scene.children.filter((o) => o.isDirectionalLight && o !== viewer.keyLight);
        const fill = viewer.fillLight || dirs.find((d) => d.position.x < 0), rim = viewer.rimLight || dirs.find((d) => d.position.y < 0);
        const snap = (l) => (l ? { color: l.color.clone(), intensity: l.intensity, ground: l.groundColor ? l.groundColor.clone() : null } : null);
        const original = { bg: scene.background, fog: scene.fog ? scene.fog.color.clone() : null, ambient: snap(ambient), key: snap(viewer.keyLight), fill: snap(fill), rim: snap(rim), exposure: viewer.renderer.toneMappingExposure };
        const MOODS = {
            studio: { label: 'Studio', icon: '💡', keyPos: [1.1, 1.8, 1.4] },
            sunset: { label: 'Sunset', icon: '🌅', bg: ['#2a1540', '#b8405a', '#f7a35c'], fog: '#f7a35c', ambient: ['#ffd9b8', 0.6], key: ['#ffb36b', 1.5], fill: ['#ff6f9c', 0.45], rim: ['#ffd27a', 0.9], keyPos: [1.7, 0.6, 1.1], exposure: 1.1, env: 0.7 },
            night: { label: 'Night', icon: '🌙', bg: ['#03050c', '#070d1f', '#0d1a3a'], fog: '#0a1226', ambient: ['#2e4a9a', 0.42], key: ['#9fb4ff', 0.55], fill: ['#1b2f66', 0.35], rim: ['#4f6fd8', 0.6], keyPos: [1.1, 1.8, 1.4], exposure: 1.0, env: 0.3, glow: true },
        };
        let mood = 'studio';
        const bgCache = {};
        function gradientTexture(stops) {
            const c = document.createElement('canvas'); c.width = 4; c.height = 256;
            const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256);
            grad.addColorStop(0, stops[0]); grad.addColorStop(0.62, stops[1]); grad.addColorStop(1, stops[2]);
            g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
            const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
            t.encoding = THREE.sRGBEncoding;   // the renderer outputs sRGB, so the gradient's own colours must be declared sRGB to come out unchanged
            return t;
        }
        const underLight = new THREE.PointLight(0xffc27a, 1.3, 30, 2);
        underLight.position.set(0, 0.4, 0);

        // Lit transparent pieces glow at night; the shared materials are tinted so every trans brick follows.
        function applyGlow() {
            const on = !!MOODS[mood].glow, cache = viewer.brickBuilder && viewer.brickBuilder.materialsCache;
            if (!cache) return;
            for (const [key, m] of cache) {
                if (!isTrans(key)) continue;
                if (on) { m.emissive.set(colorOf(m.userData.colorKey || key).hex); m.emissiveIntensity = 0.85; }
                else { m.emissive.setHex(0); m.emissiveIntensity = 1; }
                // Glass is mostly see-through; a lit piece goes more solid so the glow has a body to show on.
                if (m.userData.transmission != null) m.transmission = on ? m.userData.transmission * 0.35 : m.userData.transmission;
            }
        }

        function applyMood(kind, persist = true) {
            const spec = MOODS[kind] || MOODS.studio; mood = MOODS[kind] ? kind : 'studio';
            const light = (l, o, v) => {
                if (!l || !o) return;
                if (v) { l.color.set(v[0]); l.intensity = v[1]; if (l.groundColor) l.groundColor.copy(l.color).multiplyScalar(0.35); }
                else { l.color.copy(o.color); l.intensity = o.intensity; if (l.groundColor && o.ground) l.groundColor.copy(o.ground); }
            };
            if (spec.bg) { if (!bgCache[mood]) bgCache[mood] = gradientTexture(spec.bg); scene.background = bgCache[mood]; }
            else scene.background = original.bg;
            if (scene.fog && original.fog) { if (spec.fog) scene.fog.color.set(spec.fog).convertSRGBToLinear(); else scene.fog.color.copy(original.fog); }
            light(ambient, original.ambient, spec.ambient); light(viewer.keyLight, original.key, spec.key); light(fill, original.fill, spec.fill); light(rim, original.rim, spec.rim);
            viewer.renderer.toneMappingExposure = spec.exposure || original.exposure;
            if (viewer.setEnvIntensity) viewer.setEnvIntensity(spec.env != null ? spec.env : 1);
            const r = Math.max(14, (viewer.extent || 10) * 0.9), kp = spec.keyPos || MOODS.studio.keyPos;
            viewer.keyLight.position.set(r * kp[0], r * kp[1], r * kp[2]);
            if (spec.glow) { underLight.distance = (viewer.extent || 10) * 3; if (!underLight.parent) scene.add(underLight); }
            else if (underLight.parent) scene.remove(underLight);
            applyGlow();
            for (const b of moodChips.children) { const on = b.dataset.kind === mood; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
            if (persist) save();
        }

        /* ══════════════════════════════════════════════════════════════
           5. Spin: a live turntable of the camera, stopped by a drag
           ══════════════════════════════════════════════════════════════ */
        const SPIN_RATE = (Math.PI * 2) / 14000;   // one turn every 14 s (radians per ms)
        let spinning = false, spinLast = 0, recording = null;
        const spinTask = (now) => {
            const dt = spinLast ? Math.min(250, now - spinLast) : 0; spinLast = now;
            if (recording || viewer.isDragging || document.body.classList.contains('sfi-booklet-open')) return;
            viewer.spherical.theta += dt * SPIN_RATE; viewer.updateCameraPosition();
        };
        function setSpin(on) {
            on = !!on && !trayOn;
            if (on === spinning) return;
            spinning = on; spinLast = 0;
            if (on) frameTasks.add(spinTask); else frameTasks.delete(spinTask);
            spinBtn.classList.toggle('on', on);
            spinBtn.setAttribute('aria-pressed', String(on));
            spinBtn.title = on ? 'Stop spinning' : 'Spin the model round';
        }
        // Grabbing the model to orbit it takes over from the spin.
        canvas.addEventListener('pointermove', (e) => { if (spinning && press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) setSpin(false); });

        /* ══════════════════════════════════════════════════════════════
           6. Snapshot and turntable video (or a PNG where recording is unavailable)
           ══════════════════════════════════════════════════════════════ */
        const download = (href, name) => { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
        const say = (t, ms) => { if (sf.toast) sf.toast(t, ms); };
        function snapshotPNG(note) {
            viewer.renderer.render(scene, viewer.camera);   // the drawing buffer is not preserved, so render right before reading it
            download(canvas.toDataURL('image/png'), `StudForge-${modelId()}-view.png`);
            say(typeof note === 'string' ? note : 'Saved a PNG of this view', 3200);
        }
        const NO_VIDEO = 'Video capture is not available in this browser, so this saved a PNG of the view instead';
        function startTurntable() {
            if (trayOn) { say('Return to the model before recording a turntable.'); return; }
            if (recording) return;
            let stream = null;
            try { stream = canvas.captureStream ? canvas.captureStream(30) : null; } catch (e) { stream = null; }
            if (!stream || !window.MediaRecorder) return snapshotPNG(NO_VIDEO);
            const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
            let rec;
            try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined); } catch (e) { return snapshotPNG(NO_VIDEO); }
            const chunks = [], theta0 = viewer.spherical.theta, DUR = 6000, t0 = performance.now();
            // The recording shows on the SPIN button: a red progress ring and the percentage.
            const label = spinBtn.querySelector('.vc-label'), ring = spinBtn.querySelector('.sfs-ring');
            const finish = () => {
                frameTasks.delete(task);
                viewer.spherical.theta = theta0; viewer.updateCameraPosition();
                spinBtn.classList.remove('rec'); label.textContent = 'SPIN'; ring.style.setProperty('--p', 0);
                spinBtn.removeAttribute('aria-busy');
                for (const t of stream.getTracks()) t.stop();
                recording = null;
            };
            rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
            rec.onstop = () => {
                const blob = new Blob(chunks, { type: mime || 'video/webm' }), url = URL.createObjectURL(blob);
                download(url, `StudForge-${modelId()}-turntable.webm`);
                setTimeout(() => URL.revokeObjectURL(url), 10000);
                say(`Saved the turntable video (${(blob.size / 1048576).toFixed(1)} MB)`, 3200);
                finish();
            };
            rec.onerror = () => { finish(); snapshotPNG('Recording failed, so this saved a PNG of the view instead'); };
            // One full orbit at the current pitch; the viewer's idle drift is reset every frame, so it cannot accumulate.
            const task = (now) => {
                const k = Math.min(1, (now - t0) / DUR);
                viewer.spherical.theta = theta0 + k * Math.PI * 2; viewer.updateCameraPosition();
                ring.style.setProperty('--p', Math.round(k * 100)); label.textContent = `REC ${Math.round(k * 100)}%`;
                if (k >= 1) { frameTasks.delete(task); setTimeout(() => { try { if (rec.state !== 'inactive') rec.stop(); } catch (e) { finish(); } }, 150); }
            };
            recording = { rec, task };
            spinBtn.classList.add('rec'); spinBtn.setAttribute('aria-busy', 'true');
            closeCard();
            say('Recording a 360° spin (6 s). The video downloads when it ends.', 4200);
            frameTasks.add(task);
            rec.start(250);
        }

        /* ══════════════════════════════════════════════════════════════
           7. Settings, the canvas widgets, the Share items and the SCENE section
           ══════════════════════════════════════════════════════════════ */
        const load = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } };
        const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ baseplate: plate.kind, lighting: mood })); } catch (e) { /* private mode */ } };

        const camBtn = (ico, label, title) => {
            const b = document.createElement('button'); b.className = 'cam-btn'; b.type = 'button'; b.title = title;
            b.innerHTML = `<span class="sfs-ring" aria-hidden="true"></span><span class="vc-ico">${ico}</span><span class="vc-label">${label}</span>`;
            b.setAttribute('aria-pressed', 'false');
            return sf.widget(b);
        };
        const trayBtn = camBtn('🧩', 'BY TYPE', 'Sort every brick into a parts tray by type');
        trayBtn.addEventListener('click', () => setTray(!trayOn));
        const spinBtn = camBtn('⟳', 'SPIN', 'Spin the model round');
        spinBtn.addEventListener('click', () => { if (!recording) setSpin(!spinning); });

        if (sf.shareItem) {
            sf.shareItem({ id: 'snapshot', icon: '📸', label: 'Snapshot', hint: 'A PNG of this view', order: 60, onClick: () => snapshotPNG() });
            sf.shareItem({ id: 'turntable', icon: '🎥', label: 'Record turntable video', hint: 'A 360° spin', order: 61, onClick: startTurntable });
        }

        const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
        const chipRow = (kinds, onPick, lead) => {
            const row = document.createElement('div'); row.className = 'sfs-chips'; row.setAttribute('role', 'group'); row.style.setProperty('--n', Object.keys(kinds).length);
            for (const [kind, spec] of Object.entries(kinds)) {
                const b = document.createElement('button'); b.className = 'tool-chip'; b.type = 'button'; b.dataset.kind = kind; b.setAttribute('aria-pressed', 'false');
                b.innerHTML = `${lead(kind, spec)}<span>${esc(spec.label)}</span>`;
                b.addEventListener('click', () => onPick(kind)); row.appendChild(b);
            }
            return row;
        };
        const plateChips = chipRow(PLATES, (k) => setPlate(k), (k, s) => (s.color ? `<span class="sfs-sw" style="background:${hex(s.color)}"></span>` : '<span class="sfs-sw none"></span>'));
        const moodChips = chipRow(MOODS, (k) => applyMood(k), (k, s) => `<span class="sfs-chip-ico">${s.icon || ''}</span>`);
        plateChips.setAttribute('aria-label', 'Baseplate'); moodChips.setAttribute('aria-label', 'Lighting');

        sf.registerPanel({
            id: 'studio', title: 'SCENE', group: 'style', order: 40,
            render(body) {
                const group = (title, ...els) => { const g = document.createElement('div'); g.className = 'sfs-group'; const h = document.createElement('div'); h.className = 'sfs-sub'; h.textContent = title; g.appendChild(h); for (const e of els) g.appendChild(e); body.appendChild(g); };
                const tip = (t) => { const d = document.createElement('p'); d.className = 'sfs-tip'; d.textContent = t; return d; };
                group('BASEPLATE', plateChips);
                group('LIGHTING', moodChips, tip('Night makes see-through pieces glow like lit bricks.'));
            },
        });

        /* ── keep up with new models ───────────────────────────────── */
        sf.on('forging', () => closeCard());
        sf.on('step', () => {
            if (trayOn) for (const mesh of viewer.brickMeshes) if (mesh.userData.segment) mesh.visible = false;
        });
        sf.on('model', () => {
            if (!trayOn) { closeCard(); trayExtent = 0; }
            applyFloor();
            applyMood(mood, false);
        });
        const originalLoad = viewer.loadModel.bind(viewer);
        viewer.loadModel = model => {
            closeCard(false);
            if (activeTween) frameTasks.delete(activeTween);activeTween=null;
            if (zoomTask) frameTasks.delete(zoomTask);zoomTask=null;
            disposeLabels();
            if (trayOn && trayCamera) { viewer.spherical.theta=trayCamera.theta;viewer.spherical.phi=trayCamera.phi; }
            const result=originalLoad(model);
            if (trayOn) { trayCamera=captureCamera();layoutTray();fitTray();applyFloor(); }
            return result;
        };

        const saved = load();
        setPlate(saved.baseplate || 'none', false);
        applyMood(saved.lighting || 'studio', false);
        sf.studio = { setTray, fitTray: () => { closeCard();fitTray(); }, setPlate, closeInspector: closeCard, setMood: applyMood, setSpin, turntable: startTurntable, snapshot: () => snapshotPNG(), get trayOn() { return trayOn; }, get transitioning() { return !!activeTween; }, get spinning() { return spinning; }, get recording() { return !!recording; }, get inspecting() { return !card.hidden; }, get mood() { return mood; }, get baseplate() { return plate.kind; } };
    }

    if (window.studForge) init(); else document.addEventListener('studforge:ready', init, { once: true });
})();
