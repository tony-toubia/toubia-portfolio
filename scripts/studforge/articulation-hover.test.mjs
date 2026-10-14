import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../../public/studforge/vendor/three.module.js';

class Element {
    constructor() { this.events = new Map(); this.attrs = new Map(); this.children = []; this.style = {}; this.hidden = false; const classes = new Set(); this.classList = { toggle: (c,on) => on ? classes.add(c) : classes.delete(c), contains: c => classes.has(c) }; }
    addEventListener(type, callback) { if (!this.events.has(type)) this.events.set(type, []); this.events.get(type).push(callback); }
    fire(type, event = {}) { for (const callback of this.events.get(type) || []) callback(event); }
    setAttribute(k,v) { this.attrs.set(k,v); }
    appendChild(child) { this.children.push(child); }
    querySelector(selector) { if (!this.nodes) this.nodes = new Map(); if (!this.nodes.has(selector)) this.nodes.set(selector,new Element()); return this.nodes.get(selector); }
    getBoundingClientRect() { return { left:0,top:0,width:640,height:480 }; }
    closest() { return this; }
    hasPointerCapture(id) { return this.captured === id; }
    setPointerCapture(id) { this.captured = id; }
    releasePointerCapture() { this.captured = null; }
}
async function harness() {
    const canvas = new Element(), body = new Element(), head = new Element(), widgets = [], frames = new Map(), listeners = new Map(); let nextFrame = 1;
    const blue = new THREE.MeshStandardMaterial({color:0x0055bf}), gray = new THREE.MeshStandardMaterial({color:0x888888});
    const part = x => { const root = new THREE.Mesh(new THREE.BufferGeometry(),blue); root.position.x = x; root.add(new THREE.Mesh(new THREE.BoxGeometry(2,2,2),blue)); return root; };
    const meshes = [part(-2),part(2),new THREE.Mesh(new THREE.BoxGeometry(2,2,2),gray)]; meshes[2].position.y = -3;
    const group = new THREE.Group(), scene = new THREE.Scene(); meshes.forEach(m => group.add(m)); scene.add(group);
    const camera = new THREE.PerspectiveCamera(50,640/480,.1,100); camera.position.set(0,0,10); camera.lookAt(0,0,0); camera.updateMatrixWorld(true);
    const viewer = { renderer:{domElement:canvas},container:canvas,scene,camera,modelGroup:group,brickMeshes:meshes,target:new THREE.Vector3(),maxLayer:0,currentStep:0,explodeProgress:0,updateCameraPosition(){},loadModel(){},setExplode(v){this.explodeProgress=v;},setStep(v){this.currentStep=v;} };
    const sf = {viewer,model:{},studio:{recording:false,trayOn:false,transitioning:false,inspecting:false,setSpin(){},closeInspector(){}},registerPanel:()=>({body,section:new Element()}),widget:b=>widgets.push(b),on:(name,fn)=>listeners.set(name,fn),toast(){},setExplode:v=>viewer.setExplode(v),goStep:v=>viewer.setStep(v)};
    const win = {studForge:sf,addEventListener(){}};
    const context = vm.createContext({THREE,window:win,document:{head,createElement:()=>new Element(),addEventListener(){}},requestAnimationFrame:fn=>{const id=nextFrame++;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
    vm.runInContext(await fs.readFile('public/studforge/js/articulation-core.js','utf8'),context);
    const core = context.StudForgeArticulation; win.StudForgeArticulation = {...core,resolve:()=>({lift:0,controls:['left','right'].map((id,i)=>({id,label:id,min:-90,max:90,joints:[{members:[i],pivot:[i?2:-2,0,0],axis:[0,1,0],factor:1}]}))})};
    vm.runInContext(await fs.readFile('public/studforge/js/articulation.js','utf8'),context);
    const flush = () => { const tasks=[...frames.values()];frames.clear();tasks.forEach(fn=>fn()); };
    const event = (index,extras={}) => { const p=meshes[index].position.clone().project(camera);return {clientX:(p.x+1)*320,clientY:(1-p.y)*240,pointerType:'mouse',pointerId:1,buttons:0,button:0,preventDefault(){},stopImmediatePropagation(){},...extras}; };
    return {canvas,body,widgets,meshes,blue,gray,viewer,sf,frames,flush,event,listeners};
}

test('hover discovers a joint before activation, restores exact materials on leave, and coalesces pointer events',async()=>{
    const h=await harness(),positions=h.meshes.map(m=>m.position.toArray());
    for(let i=0;i<10;i++)h.canvas.fire('pointermove',h.event(0));
    assert.equal(h.frames.size,1);h.flush();
    assert.equal(h.sf.articulation.active,false);assert.equal(h.canvas.style.cursor,'grab');assert.equal(h.viewer.motionHover,true,'idle camera drift pauses under a hovered assembly');
    assert.notEqual(h.meshes[0].children[0].material,h.blue,'the visible child face and whole movable brick are highlighted');
    assert.equal(h.meshes[1].material,h.blue);assert.deepEqual(h.meshes.map(m=>m.position.toArray()),positions);
    h.canvas.fire('pointermove',h.event(1));h.canvas.fire('pointerleave');h.flush();
    assert.equal(h.meshes[0].material,h.blue);assert.equal(h.meshes[0].children[0].material,h.blue);assert.equal(h.meshes[1].material,h.blue);assert.equal(h.frames.size,0);assert.equal(h.viewer.motionHover,false);
});

test('hover previews another joint without changing angles; direct grab activates that joint, and leaving restores the selected highlight',async()=>{
    const h=await harness();h.canvas.fire('pointermove',h.event(1));h.flush();
    h.canvas.fire('pointerdown',h.event(1,{buttons:1}));assert.equal(h.sf.articulation.active,true);assert.equal(h.viewer.motionDragging,true);
    h.canvas.fire('pointermove',h.event(1,{buttons:1,clientX:h.event(1).clientX+45}));h.canvas.fire('pointerup');
    const rightAngle=h.body.querySelector('[data-angle="right"]').value;assert.notEqual(rightAngle,0);assert.equal(h.body.querySelector('[data-angle="left"]').value,0);
    h.canvas.fire('pointermove',h.event(0));h.flush();assert.notEqual(h.meshes[0].material,h.blue);assert.equal(h.meshes[1].material,h.blue);
    assert.equal(h.body.querySelector('[data-angle="right"]').value,rightAngle);
    h.canvas.fire('pointerleave');assert.equal(h.meshes[0].material,h.blue);assert.notEqual(h.meshes[1].material,h.blue);
    h.sf.articulation.setActive(false);h.meshes.slice(0,2).forEach(m=>{assert.equal(m.material,h.blue);assert.equal(m.children[0].material,h.blue);});
});

test('fixed foreground pieces occlude joints and hover stays off during camera drags, tray, inspector, recording, explode and partial builds',async()=>{
    const h=await harness();h.meshes[2].position.set(-2,0,3);h.canvas.fire('pointermove',h.event(0));h.flush();assert.equal(h.meshes[0].material,h.blue);
    h.meshes[2].position.set(0,-3,0);
    for(const [object,key,value] of [[h.sf.studio,'trayOn',true],[h.sf.studio,'transitioning',true],[h.sf.studio,'recording',true],[h.sf.studio,'spinning',true],[h.sf.studio,'inspecting',true],[h.viewer,'isDragging',true],[h.viewer,'explodeProgress',.5],[h.viewer,'currentStep',-1]]){
        const prior=object[key];object[key]=value;h.canvas.fire('pointermove',h.event(0));h.flush();assert.equal(h.meshes[0].material,h.blue,key);object[key]=prior;
    }
    h.canvas.fire('pointermove',h.event(0,{pointerType:'touch'}));h.flush();assert.equal(h.meshes[0].material,h.blue);
    h.canvas.fire('pointermove',h.event(0));h.flush();assert.notEqual(h.meshes[0].material,h.blue);
    h.viewer.loadModel({});assert.equal(h.meshes[0].material,h.blue,'loading another model clears inactive hover material clones');
});
