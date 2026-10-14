// Geometry-based spacing for the parts browser, independent of catalog estimates.
(() => {
    function measure(mesh) {
        const box = new THREE.Box3(), scratch = new THREE.Box3();
        function visit(object, frame, root = false) {
            if (!root && !object.visible) return;
            if (object.geometry?.attributes.position?.count) {
                if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
                box.union(scratch.copy(object.geometry.boundingBox).applyMatrix4(frame));
            }
            for (const child of object.children) { child.updateMatrix(); visit(child, frame.clone().multiply(child.matrix)); }
        }
        visit(mesh, new THREE.Matrix4().makeScale(mesh.scale.x, mesh.scale.y, mesh.scale.z), true);
        return box.isEmpty() ? new THREE.Box3(new THREE.Vector3(-.5,0,-.5),new THREE.Vector3(.5,1.2,.5)) : box;
    }
    function layout(groups, aspect = 1.5) {
        const gap = .8, footer = 2;
        const cells = groups.map(group => {
            const size = group.bounds.getSize(new THREE.Vector3());
            return { group, width: Math.max(5.2,size.x + 1.4), depth: Math.max(.5,size.z) + 1.4 + footer, footer };
        }).sort((a,b) => b.depth - a.depth || b.width - a.width);
        const area = cells.reduce((sum,c) => sum + (c.width+gap)*(c.depth+gap),0);
        const widest = cells.reduce((n,c) => Math.max(n,c.width),0);
        const target = Math.max(widest,Math.sqrt(area * Math.max(.5,Math.min(2.5,aspect))));
        let best;
        for (const factor of [.8,1,1.2]) {
            const maxWidth = Math.max(widest,target*factor), placed = []; let x=0,z=0,rowDepth=0,width=0;
            for (const cell of cells) {
                if (x && x+cell.width > maxWidth) { z+=rowDepth+gap;x=0;rowDepth=0; }
                placed.push({...cell,x,z});width=Math.max(width,x+cell.width);x+=cell.width+gap;rowDepth=Math.max(rowDepth,cell.depth);
            }
            const depth=z+rowDepth, score=Math.max(width/Math.max(.5,aspect),depth);
            if (!best || score < best.score) best={cells:placed,width,depth,score};
        }
        for (const cell of best.cells) { cell.x-=best.width/2;cell.z-=best.depth/2; }
        return best;
    }
    function position(cell) {
        const center=cell.group.bounds.getCenter(new THREE.Vector3());
        return new THREE.Vector3(cell.x+cell.width/2-center.x,-cell.group.bounds.min.y,cell.z+(cell.depth-cell.footer)/2-center.z);
    }
    function fitRadius(width, depth, camera, height = 0, viewport) {
        const tangent=Math.tan(camera.fov*Math.PI/360);
        const usable=viewport ? Math.max(viewport.height*.4,viewport.height-viewport.top-viewport.bottom) : 1;
        const verticalScale=viewport ? viewport.height/usable : 1;
        return Math.max(6,Math.max(depth*verticalScale,width/Math.max(.1,camera.aspect))/(2*tangent)*(viewport?1.12:1.4)+height);
    }
    function offsetZ(radius,camera,viewport) {
        return -(viewport.top-viewport.bottom)/viewport.height*radius*Math.tan(camera.fov*Math.PI/360);
    }
    globalThis.StudForgePartsTray={measure,layout,position,fitRadius,offsetZ};
})();
