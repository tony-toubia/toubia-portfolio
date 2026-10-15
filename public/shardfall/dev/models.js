// DEV STAND-IN ONLY (loaded with ?dev=1). A throwaway SF_MODELS that draws coloured boxes and cylinders with the
// named children from the models contract, so the renderer can be built and tested before the real js/models.js lands.
window.SF_MODELS = (() => {
    const mats = new Map();
    function mat(color, emissive) {
        const key = color + ':' + (emissive || 0);
        if (!mats.has(key)) {
            const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), roughness: 0.7, metalness: 0.15, flatShading: true });
            if (emissive) { m.emissive = new THREE.Color(emissive).convertSRGBToLinear(); m.emissiveIntensity = 1.2; }
            mats.set(key, m);
        }
        return mats.get(key);
    }
    const box = (w, h, d, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.y = h / 2; return o; };
    const cyl = (r, h, m, seg) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg || 8), m); o.position.y = h / 2; return o; };
    const GREY = 0x6b7380, DARK = 0x2b3038;

    function unit(type, color) {
        const g = new THREE.Group();
        const team = mat(color), grey = mat(GREY), dark = mat(DARK), glow = mat(0xffffff, 0x9fe8ff);
        let height = 0.5;
        if (type === 'rifleman' || type === 'rocketeer') {
            const body = cyl(0.11, 0.32, team, 6); g.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), grey); head.position.y = 0.4; g.add(head);
            const gun = box(type === 'rocketeer' ? 0.34 : 0.26, type === 'rocketeer' ? 0.07 : 0.04, 0.04, dark);
            gun.position.set(0.12, 0.26, 0.08); g.add(gun);
            const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0.3, 0.28, 0.08); g.add(muzzle);
            height = 0.48;
        } else if (type === 'harvester') {
            g.add(box(1.0, 0.5, 0.8, team));
            const cab = box(0.35, 0.35, 0.7, grey); cab.position.set(0.32, 0.6, 0); g.add(cab);
            const arm = new THREE.Group(); arm.name = 'arm'; arm.position.set(0.55, 0.3, 0);
            const scoop = box(0.3, 0.12, 0.6, dark); scoop.position.set(0.15, -0.1, 0); arm.add(scoop); g.add(arm);
            height = 0.85;
        } else {
            const L = type === 'buggy' ? 0.8 : 1.0, W = type === 'buggy' ? 0.55 : 0.75;
            g.add(box(L, 0.3, W, team));
            const wheels = [];
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                const w = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8), dark);
                w.rotation.x = Math.PI / 2; w.position.set(sx * L * 0.33, 0.15, sz * W * 0.52);
                const holder = new THREE.Group(); holder.add(w); holder.position.copy(w.position); w.position.set(0, 0, 0);
                g.add(holder); wheels.push(holder);
            }
            g.userData.wheels = wheels;
            const turret = new THREE.Group(); turret.name = 'turret'; turret.position.y = 0.3;
            const tb = box(0.4, 0.2, 0.4, type === 'buggy' ? grey : team); turret.add(tb);
            const barrel = new THREE.Mesh(new THREE.BoxGeometry(type === 'artillery' ? 0.9 : 0.5, 0.07, 0.07), dark);
            barrel.name = 'barrel'; barrel.position.set(type === 'artillery' ? 0.5 : 0.35, 0.12, 0);
            if (type === 'artillery') barrel.rotation.z = 0.35;
            turret.add(barrel);
            const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle';
            muzzle.position.set(type === 'artillery' ? 0.95 : 0.62, type === 'artillery' ? 0.3 : 0.12, 0); turret.add(muzzle);
            const light = box(0.06, 0.06, 0.06, glow); light.position.set(-0.15, 0.2, 0.12); turret.add(light);
            g.add(turret);
            height = type === 'artillery' ? 0.75 : 0.6;
        }
        g.userData.height = height;
        return g;
    }

    const BH = { core: 1.6, reactor: 1.2, refinery: 1.1, barracks: 0.9, factory: 1.3, radar: 1.0, turret: 0.7, techlab: 1.2 };
    function building(type, color) {
        const b = SF_CONFIG.BUILDINGS[type];
        const g = new THREE.Group();
        const team = mat(color), grey = mat(GREY), dark = mat(DARK), glow = mat(0xffffff, 0x7fd8ff);
        const h = BH[type] || 1;
        if (type === 'turret') {
            g.add(cyl(0.42, 0.35, grey, 8));
            const turret = new THREE.Group(); turret.name = 'turret'; turret.position.y = 0.35;
            turret.add(box(0.45, 0.25, 0.45, team));
            const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 0.09), dark); barrel.name = 'barrel';
            barrel.position.set(0.4, 0.14, 0); turret.add(barrel);
            const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0.7, 0.14, 0); turret.add(muzzle);
            g.add(turret);
        } else {
            const base = box(b.w * 0.92, 0.15, b.d * 0.92, dark); g.add(base);
            const main = box(b.w * 0.8, h, b.d * 0.7, grey); main.position.z = -b.d * 0.08; main.position.y += 0.15; g.add(main);
            const stripe = box(b.w * 0.82, h * 0.22, b.d * 0.72, team); stripe.position.set(0, 0.15 + h * 0.7, -b.d * 0.08); g.add(stripe);
            const lamp = box(0.12, 0.12, 0.12, glow); lamp.position.set(b.w * 0.3, h + 0.2, -b.d * 0.2); g.add(lamp);
            if (type === 'radar') {
                const rotor = new THREE.Group(); rotor.name = 'rotor'; rotor.position.y = h + 0.2;
                const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.1, 0.15, 10), team); dish.rotation.z = 1.1; rotor.add(dish);
                g.add(rotor);
            }
            if (type === 'core') {
                const flag = new THREE.Group(); flag.name = 'flag'; flag.position.set(-1, h + 0.2, -0.8);
                flag.add(cyl(0.03, 0.8, dark, 4)); const cloth = box(0.4, 0.25, 0.02, team); cloth.position.set(0.2, 0.65, 0); flag.add(cloth);
                g.add(flag);
            }
            if (type === 'reactor') { const c = cyl(0.35, h + 0.3, glow, 8); c.position.set(0.3, 0.15, 0.2); g.add(c); }
            if (type === 'refinery') { const dock = new THREE.Object3D(); dock.name = 'dock'; dock.position.set(0, 0, b.d / 2 - 0.4); g.add(dock); }
            if (type === 'factory') { const exit = new THREE.Object3D(); exit.name = 'exit'; exit.position.set(0, 0, b.d / 2); g.add(exit); }
        }
        g.userData.height = h + 0.3;
        return g;
    }

    function decor(type) {
        const g = new THREE.Group();
        if (type === 'tree') { g.add(cyl(0.06, 0.4, mat(0x4a3a2a), 5)); const c = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 6), mat(0x3d5a3a)); c.position.y = 0.7; g.add(c); }
        else if (type === 'crystal') { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), mat(0x5fd0e0, 0x1a6a80)); c.position.y = 0.25; g.add(c); }
        else { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(type === 'boulder' ? 0.4 : 0.3), mat(0x6a645a)); r.position.y = 0.15; g.add(r); }
        return g;
    }
    function shardCluster() {
        const g = new THREE.Group(); const m = mat(0x6ff0ff, 0x1ab8d8);
        for (let i = 0; i < 4; i++) {
            const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), m);
            c.scale.y = 2; c.position.set(Math.cos(i * 1.7) * 0.22, 0.2, Math.sin(i * 1.7) * 0.22); g.add(c);
        }
        return g;
    }
    function spire() {
        const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.8, 6), mat(0x8ff6ff, 0x30d0f0)); c.position.y = 0.9; g.add(c);
        g.userData.height = 1.8; return g;
    }
    return { unit, building, decor, shardCluster, spire };
})();
