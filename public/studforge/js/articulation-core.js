// Reviewed motion profiles in the model's uncentred StudForge coordinates.
// Fingerprints cover every placement: a changed import disables a stale profile.
(() => {
    const profiles = {
        '21303-1': {
            fingerprint: '4156fcf7', lift: 0,
            controls: [{ id: 'neck', label: 'Neck bend', min: -15, max: 20, joints: [
                // The source's Axrot-Da neck centre, converted from LDU and shifted
                // with the import. Cou + all nested head/eye assemblies travel together.
                { pivot: [10.69594, 10.52742, 7.5], axis: [1, 0, 0], factor: 1, ranges: [[181, 464]] },
            ] }],
        },
        '75102-1': {
            fingerprint: 'dfd69abc', lift: 5, groundedRanges: [[682, 733]],
            controls: [{ id: 'wings', label: 'Wing opening', min: 0, max: 20, joints: [
                // Four reviewed S-foil assemblies, plus their engines, cannons and tips.
                // Pivot through the root Technic axle holes; signs open them together.
                { pivot: [23.5, 3.7, 12.55], axis: [0, 0, 1], factor: -1, ranges: [[368, 426], [622, 631], [662, 665], [680, 680]] },
                { pivot: [23.5, 7.7, 12.55], axis: [0, 0, 1], factor: 1, ranges: [[427, 492], [652, 661], [666, 669], [681, 681]] },
                { pivot: [16.5, 3.7, 12.55], axis: [0, 0, 1], factor: 1, ranges: [[495, 553], [632, 641], [674, 677], [679, 679]] },
                { pivot: [16.5, 7.7, 12.55], axis: [0, 0, 1], factor: -1, ranges: [[554, 619], [642, 651], [670, 673], [678, 678]] },
            ] }],
        },
    };
    function fingerprint(bricks) {
        const text = JSON.stringify(bricks.map(b => [b.partId, b.x, b.y, b.z, ...b.matrix, b.layer, b.geometryId]));
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
        return (hash >>> 0).toString(16);
    }
    function resolve(model) {
        const profile = profiles[model?.reference?.setId] || model?.motion;
        if (!profile || !Array.isArray(model.bricks) || model.bricks.some(b => !Array.isArray(b.matrix) || b.matrix.length !== 9)
            || fingerprint(model.bricks) !== profile.fingerprint) return null;
        const used = new Set();
        const controls = profile.controls.map(control => ({ ...control, joints: control.joints.map(joint => {
            const members = joint.members || joint.ranges.flatMap(([first, last]) => Array.from({ length: last - first + 1 }, (_, i) => first + i));
            return { ...joint, members };
        }) }));
        for (const control of controls) for (const joint of control.joints) {
            if (!joint.pivot.every(Number.isFinite) || !joint.axis.every(Number.isFinite) || Math.hypot(...joint.axis) < 0.99) return null;
            for (const member of joint.members) {
                if (!Number.isInteger(member) || member < 0 || member >= model.bricks.length || used.has(member)) return null;
                used.add(member);
            }
        }
        return { ...profile, controls };
    }
    const clamp = (value, control) => Number.isFinite(value) ? Math.max(control.min, Math.min(control.max, value)) : 0;
    // Rodrigues rotation, also used in the viewer. Always start from the rest point.
    function rotatePoint(point, pivot, axis, degrees) {
        const length = Math.hypot(...axis), [x, y, z] = axis.map(v => v / length);
        const [a, b, c] = point.map((v, i) => v - pivot[i]), angle = degrees * Math.PI / 180;
        const co = Math.cos(angle), si = Math.sin(angle), dot = a * x + b * y + c * z;
        return [a * co + (y * c - z * b) * si + x * dot * (1 - co) + pivot[0],
            b * co + (z * a - x * c) * si + y * dot * (1 - co) + pivot[1],
            c * co + (x * b - y * a) * si + z * dot * (1 - co) + pivot[2]];
    }
    // A printed face or fixed-color submesh belongs to its enclosing brick.
    function memberIndex(object, meshes) {
        while (object) { const index = meshes.indexOf(object); if (index >= 0) return index; object = object.parent; }
        return -1;
    }
    globalThis.StudForgeArticulation = { resolve, fingerprint, clamp, rotatePoint, memberIndex, hasProfile: id => !!profiles[id], ids: Object.keys(profiles) };
})();
