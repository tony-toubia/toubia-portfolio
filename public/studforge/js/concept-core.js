// Shared concept diagrams and assembly checks; no AI-authored markup is executed.
(() => {
    const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const tint = (hex, k) => '#' + hex.replace('#', '').match(/../g).map(v => Math.max(0, Math.min(255, Math.round(parseInt(v, 16) * k))).toString(16).padStart(2, '0')).join('');
    function diagram(concept, colors) {
        const base = concept.sketch.base;
        const cells = new Map(), key = (x, y, z) => `${x},${y},${z}`;
        const paint = (x0, x1, z0, z1, y0, y1, color) => { for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) cells.set(key(x,y,z), { x,y,z,color }); };
        paint(0, base.w - 1, 0, base.d - 1, 0, 0, base.color);
        // Same ordered paint semantics as ForgeGrid: later markings replace earlier colors.
        for (const op of concept.sketch.ops) paint(op.x0, op.x1, op.z0, op.z1, op.op === 'slab' ? op.y : op.y0, op.op === 'slab' ? op.y + 1 : op.y1, op.color);
        const faces = [];
        for (const { x,y,z,color } of cells.values()) {
            const add = (face, points, light) => { const center = points.reduce((a,p) => a.map((v,i) => v + p[i]/4), [0,0,0]); faces.push({ face,points,color,light,depth: center[0]*5 + center[1]*.4*3.5 + center[2]*7 }); };
            if (!cells.has(key(x,y+1,z))) add('top', [[x,y+1,z],[x+1,y+1,z],[x+1,y+1,z+1],[x,y+1,z+1]],1.15);
            if (!cells.has(key(x,y,z+1))) add('front', [[x,y,z+1],[x+1,y,z+1],[x+1,y+1,z+1],[x,y+1,z+1]],1);
            if (!cells.has(key(x+1,y,z))) add('side', [[x+1,y,z],[x+1,y,z+1],[x+1,y+1,z+1],[x+1,y+1,z]],.72);
        }
        // Orthographic camera [5,3.5,7], with the actual .4-stud height of a plate.
        const project = (x, y, z) => [.813*x - .581*z, .204*x - .947*y*.4 + .286*z];
        const corners = faces.flatMap(face => face.points.map(point => project(...point)));
        const bounds = corners.reduce((b,p) => ({ minX: Math.min(b.minX,p[0]), maxX: Math.max(b.maxX,p[0]), minY: Math.min(b.minY,p[1]), maxY: Math.max(b.maxY,p[1]) }), { minX: Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity });
        const { minX,maxX,minY,maxY } = bounds;
        const scale = Math.min(280 / (maxX - minX || 1), 190 / (maxY - minY || 1));
        const p = (x, y, z) => { const [a, b] = project(x, y, z); return `${(20 + (a - minX) * scale).toFixed(1)},${(20 + (b - minY) * scale).toFixed(1)}`; };
        let shapes = '';
        faces.sort((a,b) => a.depth - b.depth).forEach(face => {
            const raw = colors[face.color] && colors[face.color].hex, hex = /^#[\da-f]{6}$/i.test(raw || '') ? raw : '#b4b8bd';
            shapes += `<polygon data-face="${face.face}" data-color="${esc(face.color)}" points="${face.points.map(point => p(...point)).join(' ')}" fill="${tint(hex,face.light)}"/>`;
        });
        return `<svg viewBox="0 0 320 240" role="img" aria-label="${esc(concept.name)}: structural layout sketch" xmlns="http://www.w3.org/2000/svg"><g stroke="#17243a" stroke-width="${faces.length > 1000 ? '.35' : '.7'}" stroke-linejoin="round">${shapes}</g><text x="20" y="232" fill="#718096" font-size="10">LAYOUT SKETCH · ${base.w} × ${base.d} STUD BASE</text></svg>`;
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
