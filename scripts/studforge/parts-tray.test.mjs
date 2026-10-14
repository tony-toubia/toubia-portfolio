import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../../public/studforge/vendor/three.module.js';
const context=vm.createContext({THREE,window:{},requestAnimationFrame(){}});
vm.runInContext(await fs.readFile('public/studforge/js/parts-tray-core.js','utf8'),context);
vm.runInContext(await fs.readFile('public/studforge/js/viewer.js','utf8'),context);
const core=context.StudForgePartsTray;

test('tray measurements include printed child geometry, off-center origins and mirrored scales without changing source transforms',()=>{
    const root=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());root.position.set(100,20,30);root.rotation.set(.5,.6,.7);root.scale.set(-1,1,1);
    const child=new THREE.Mesh(new THREE.BoxGeometry(8,3,12).translate(3,-2,7),new THREE.MeshBasicMaterial());child.position.x=2;root.add(child);
    const position=root.position.toArray(),rotation=root.rotation.toArray(),scale=root.scale.toArray();
    const bounds=core.measure(root);assert.deepEqual(bounds.min.toArray(),[-9,-3.5,1]);assert.deepEqual(bounds.max.toArray(),[-1,-.5,13]);
    assert.deepEqual(root.position.toArray(),position);assert.deepEqual(root.rotation.toArray(),rotation);assert.deepEqual(root.scale.toArray(),scale);
    const plan=core.layout([{bounds}],1.5),cell=plan.cells[0],p=core.position(cell);
    assert.equal(p.y+bounds.min.y,0);assert.ok(p.x+bounds.min.x>cell.x);assert.ok(p.z+bounds.max.z<cell.z+cell.depth-cell.footer);
});

test('the real 2018-piece Slave I inventory fits into 409 nonoverlapping samples with separate label space',async()=>{
    const source=JSON.parse(await fs.readFile('public/studforge/data/omr/75060-1.json','utf8')),original=JSON.stringify(source),groups=new Map();
    for(const b of source.bricks){
        const part=source.parts[b[0]],key=part[0]+'|'+b[1];
        if(groups.has(key)){groups.get(key).count++;continue;}
        const geo=JSON.parse(await fs.readFile('public/studforge/data/ldraw/parts/'+(part[4]||part[1]||part[0])+'.json','utf8'));
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(geo.v,3));
        const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());
        const m=b.slice(5,14);new THREE.Matrix4().set(m[0],m[1],m[2],0,m[3],m[4],m[5],0,m[6],m[7],m[8],0,0,0,0,1).decompose(new THREE.Vector3(),new THREE.Quaternion(),mesh.scale);
        groups.set(key,{bounds:core.measure(mesh),count:1});geometry.dispose();mesh.material.dispose();
    }
    assert.equal(groups.size,409);assert.equal([...groups.values()].reduce((n,g)=>n+g.count,0),2018);
    for(const aspect of [.6,1.8]){
        const plan=core.layout([...groups.values()],aspect);
        for(let i=0;i<plan.cells.length;i++){
            const a=plan.cells[i],p=core.position(a),box=a.group.bounds.clone().translate(p);
            assert.ok(box.min.x>=a.x && box.max.x<=a.x+a.width);
            assert.ok(box.min.z>=a.z && box.max.z<=a.z+a.depth-a.footer);
            assert.ok(Math.abs(box.min.y)<1e-8);
            for(let j=i+1;j<plan.cells.length;j++){const b=plan.cells[j];assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x || a.z+a.depth<=b.z || b.z+b.depth<=a.z,'piece/label cells must not overlap');}
        }
        const camera=new THREE.PerspectiveCamera(45,aspect),radius=core.fitRadius(plan.width,plan.depth,camera,5);
        assert.ok(radius>Math.max(plan.width/aspect,plan.depth)/(2*Math.tan(Math.PI/8)),'fit includes toolbars and tray margins');
        const viewport={height:600,top:116,bottom:72},safeRadius=core.fitRadius(plan.width,plan.depth,camera,5,viewport),offset=core.offsetZ(safeRadius,camera,viewport);
        const pixelsPerStud=viewport.height/(2*safeRadius*Math.tan(Math.PI/8));
        const top=viewport.height/2+(-offset-plan.depth/2)*pixelsPerStud,bottom=viewport.height/2+(-offset+plan.depth/2)*pixelsPerStud;
        // In the overhead camera, negative camera target Z shifts the tray downward.
        assert.ok(viewport.height-bottom>viewport.bottom);
        assert.ok(top>viewport.top);
    }
    assert.equal(JSON.stringify(source),original);
});

test('parts view has no idle rotation and supports zoom/pan beyond the assembled model footprint',()=>{
    const Viewer=context.window.StudForgeViewer;
    let updates=0;const viewer={partsTray:true,partsRadius:200,partsExtent:150,partsInspecting:false,home:{radius:20},spherical:{theta:1,radius:200},explodeProgress:0,isStepMode:false,renderer:{render(){}},updateCameraPosition(){updates++;}};
    for(let i=0;i<20;i++)Viewer.prototype.animate.call(viewer);assert.equal(viewer.spherical.theta,1);assert.equal(updates,0);
    Viewer.prototype.zoomBy.call(viewer,2);assert.equal(viewer.spherical.radius,400,'tray zoom is not capped at the original model radius');
    viewer.target=new THREE.Vector3(60,2,40);viewer.extent=10;viewer.height=8;viewer.camera=new THREE.PerspectiveCamera(45,1);viewer.camera.position.set(0,100,.01);viewer.camera.lookAt(0,0,0);viewer.camera.updateMatrixWorld(true);viewer.container={clientHeight:500};
    Viewer.prototype.panBy.call(viewer,20,20);assert.ok(viewer.target.x>10,'parts panning is not clamped to the small model');assert.equal(viewer.target.y,2);
    viewer.partsTray=false;Viewer.prototype.animate.call(viewer);assert.ok(viewer.spherical.theta>1,'assembled-model behavior remains available');
});
