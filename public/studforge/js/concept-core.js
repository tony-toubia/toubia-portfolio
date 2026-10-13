// Shared concept diagrams and assembly checks; no AI-authored markup is executed.
(() => {
    const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const tint = (hex, k) => '#' + hex.replace('#', '').match(/../g).map(v => Math.max(0, Math.min(255, Math.round(parseInt(v, 16) * k))).toString(16).padStart(2, '0')).join('');
    function diagram(concept, colors) {
        const base = concept.sketch.base;
        const boxes = [{ x0: 0, x1: base.w - 1, z0: 0, z1: base.d - 1, y0: 0, y1: 0, color: base.color }, ...concept.sketch.ops.map(o => ({ ...o, y0: o.op === 'slab' ? o.y : o.y0, y1: o.op === 'slab' ? o.y + 1 : o.y1 }))];
        const project = (x, y, z) => [x - z * .58, -y * .4 - z * .3];
        const corners = boxes.flatMap(b => [project(b.x0, b.y0, b.z0), project(b.x1 + 1, b.y1 + 1, b.z1 + 1), project(b.x0, b.y1 + 1, b.z1 + 1), project(b.x1 + 1, b.y0, b.z0)]);
        const minX = Math.min(...corners.map(p => p[0])), maxX = Math.max(...corners.map(p => p[0])), minY = Math.min(...corners.map(p => p[1])), maxY = Math.max(...corners.map(p => p[1]));
        const scale = Math.min(280 / (maxX - minX || 1), 190 / (maxY - minY || 1));
        const p = (x, y, z) => { const [a, b] = project(x, y, z); return `${(20 + (a - minX) * scale).toFixed(1)},${(20 + (b - minY) * scale).toFixed(1)}`; };
        let shapes = '';
        boxes.sort((a, b) => a.y0 - b.y0 || a.z0 - b.z0 || a.x0 - b.x0).forEach(b => {
            const raw = colors[b.color] && colors[b.color].hex, hex = /^#[\da-f]{6}$/i.test(raw || '') ? raw : '#b4b8bd';
            const x = b.x0, X = b.x1 + 1, y = b.y0, Y = b.y1 + 1, z = b.z0, Z = b.z1 + 1;
            shapes += `<polygon points="${p(x,Y,z)} ${p(X,Y,z)} ${p(X,Y,Z)} ${p(x,Y,Z)}" fill="${tint(hex,1.15)}"/><polygon points="${p(x,y,Z)} ${p(X,y,Z)} ${p(X,Y,Z)} ${p(x,Y,Z)}" fill="${hex}"/><polygon points="${p(X,y,z)} ${p(X,y,Z)} ${p(X,Y,Z)} ${p(X,Y,z)}" fill="${tint(hex,.72)}"/>`;
        });
        return `<svg viewBox="0 0 320 240" role="img" aria-label="${esc(concept.name)}: structural layout sketch" xmlns="http://www.w3.org/2000/svg"><g stroke="#17243a" stroke-width=".7" stroke-linejoin="round">${shapes}</g><text x="20" y="232" fill="#718096" font-size="10">LAYOUT SKETCH · ${base.w} × ${base.d} STUD BASE</text></svg>`;
    }
    function quality(model) {
        if (!model || model.kind !== 'blueprint') return ['The design could not be assembled.'];
        const a = model.anchor || {}, faults = [];
        if (model.warnings && model.warnings.length) faults.push(`Skipped operations: ${model.warnings.slice(0, 6).join('; ')}`);
        if (a.stuck) faults.push(`${a.stuck} unsupported assemblies`);
        if (a.struts) faults.push(`${a.struts} rescue supports; longest ${a.maxStrut} plates`);
        if (a.dropped) faults.push(`${a.dropped} assemblies moved by gravity, changing the silhouette`);
        if (!model.bricks || model.bricks.length < 15) faults.push('Too few pieces for a recognizable finished design');
        return faults;
    }
    window.StudForgeConcept = { diagram, quality };
})();
