import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {detectMotion,geometryReader} from './detect-motion.mjs';
import {movedFrame,studFrame,transform3} from '../ldraw/moved-frame.mjs';
const manifest=JSON.parse(await fs.readFile('public/studforge/data/ldraw/manifest.json','utf8')).parts;
const read=geometryReader(['public/studforge/data/ldraw/parts'],manifest);
const identity=[1,0,0,0,1,0,0,0,1],turn=[0,0,1,0,1,0,-1,0,0];
const brick=(part,x,y,z,matrix=identity)=>[part,0,x,y,z,...matrix,0,0,null];
const mechanism=()=>({id:'fixture',submodels:['main'],parts:[['3700'],['3705'],['32064a'],['3023'],['3020'],['3004']],bricks:[
 brick(0,0,1.2,.5),brick(1,0,.7,.5,turn),brick(2,0,1.2,1.5),brick(3,0,1.6,1.5),
 brick(4,0,0,0),brick(0,0,1.2,-.5),brick(3,0,1.6,-.5),brick(5,0,2.8,-.5),
]});
test('Technic axle detection carries the keyed block and stud-connected cap through two coaxial circular bearings',async()=>{
 const model=mechanism(),original=JSON.stringify(model),result=await detectMotion(model,read);
 assert.ok(result.motion,JSON.stringify(result));assert.equal(result.motion.controls.length,1);
 assert.deepEqual(result.motion.controls[0].joints[0].members,[1,2,3]);
 assert.match(result.motion.controls[0].label,/Axle pivot/);
 assert.equal(JSON.stringify(model),original);
});
test('an axle locked by a stud connection and a bare shaft never become moving assemblies',async()=>{
 const locked=mechanism();locked.parts[4]=['3036']; // larger foundation catches both bearings and the keyed block
 assert.equal((await detectMotion(locked,read)).motion,null);
 const bare=mechanism();bare.bricks=bare.bricks.filter((_,i)=>i!==2&&i!==3);
 assert.equal((await detectMotion(bare,read)).motion,null);
});
test('common finger and click hinges use their actual primitive bearing locations',async()=>{
 for(const [id,point,kind] of [['4275b',[1.5,-.2,0],'finger-single'],['4276b',[1.5,-.2,0],'finger-dual'],['44301a',[1.5,-.1,0],'click-single'],['44302a',[1.5,-.1,0],'click-dual']]){
  const g=await read(id,id,manifest[id]?.name),port=g.connectors.find(p=>p.kind===kind);
  assert.ok(port,id);port.point.forEach((v,i)=>assert.ok(Math.abs(v-point[i])<1e-8,id));
  assert.ok(Math.abs(port.axis[2])>.999,id);
 }
});
test('all six Jet Airliner tyres share their rim centres and axes after the moved-to frame repair',async()=>{
 const model=JSON.parse(await fs.readFile('public/studforge/data/omr/6368-1.json','utf8'));
 const tyres=model.bricks.filter(b=>model.parts[b[0]][0]==='3139b');assert.equal(tyres.length,6);
 for(const tyre of tyres){
  const rim=model.bricks.find(b=>model.parts[b[0]][0]==='4624'&&Math.hypot(...b.slice(2,5).map((v,i)=>v-tyre[2+i]))<.001);
  assert.ok(rim);const a=transform3(tyre.slice(5,14),[0,0,1]),b=transform3(rim.slice(5,14),[0,0,1]);
  assert.ok(Math.abs(a.reduce((s,v,i)=>s+v*b[i],0))>.999);
 }
});
test('moved-to redirect chains carry rotations and translations rather than only replacement IDs',()=>{
 const files={old:'0 ~Moved to middle\n1 16 20 0 0 0 0 -1 0 1 0 1 0 0 middle.dat',middle:'0 ~Moved to final\n1 16 0 0 20 1 0 0 0 1 0 0 0 1 final.dat'};
 const frame=studFrame(movedFrame('old','final',id=>files[id]));
 assert.deepEqual(frame.position,[0,-0,-0]);assert.deepEqual(transform3(frame.matrix,[0,0,1]),[1,0,0]);
 assert.equal(movedFrame('old','unrelated',id=>files[id]),null);
});
