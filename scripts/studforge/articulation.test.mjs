import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const context=vm.createContext({console});
vm.runInContext(await fs.readFile('public/studforge/js/articulation-core.js','utf8'),context);
context.window=context;
vm.runInContext(await fs.readFile('public/studforge/js/omr.js','utf8'),context);
const core=context.StudForgeArticulation;
const load=async id=>context.FORGE.omr.expand(JSON.parse(await fs.readFile(`public/studforge/data/omr/${id}.json`,'utf8')));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('reviewed profiles match actual source placements and cannot silently bind to changed geometry',async()=>{
 for(const id of core.ids){
  const model=await load(id),original=JSON.stringify(model),rig=core.resolve(model);
  assert.ok(rig,`${id} profile must match imported placement`);
  const members=rig.controls.flatMap(c=>c.joints.flatMap(j=>j.members));
  assert.equal(new Set(members).size,members.length);
  assert.ok(members.length>100 && members.length<model.bricks.length);
  assert.equal(JSON.stringify(model),original);
  model.bricks[0].x+=.001;assert.equal(core.resolve(model),null);
 }
 assert.equal(core.resolve({reference:{setId:'unsupported'},bricks:[]}),null);
});
test('hinge rotation preserves axial position, radius, and distances between connected parts',()=>{
 const pivot=[3,4,5],axis=[1,0,0],a=[3,9,8],b=[7,8,6];
 const p=core.rotatePoint(a,pivot,axis,37),q=core.rotatePoint(b,pivot,axis,37);
 near(p[0],a[0]);near(Math.hypot(p[1]-4,p[2]-5),Math.hypot(a[1]-4,a[2]-5));
 near(Math.hypot(...p.map((v,i)=>v-q[i])),Math.hypot(...a.map((v,i)=>v-b[i])));
 const reset=core.rotatePoint(a,pivot,axis,0);reset.forEach((v,i)=>near(v,a[i]));
 const inverse=core.rotatePoint(p,pivot,axis,-37);inverse.forEach((v,i)=>near(v,a[i]));
});
test('WALL-E neck profile moves head and neck together and leaves body and arms untouched',async()=>{
 const model=await load('21303-1'),rig=core.resolve(model),joint=rig.controls[0].joints[0];
 assert.equal(joint.members.length,284);
 for(const index of [181,447,448,461,464])assert.ok(joint.members.includes(index));
 for(const index of [144,145,465,500,540,777])assert.ok(!joint.members.includes(index));
 const original=JSON.stringify(model.bricks);
 for(const index of joint.members){const b=model.bricks[index];core.rotatePoint([b.x,b.y,b.z],joint.pivot,joint.axis,20);}
 assert.equal(JSON.stringify(model.bricks),original,'source placement and inventory stay original');
});
test('linked X-Wing foils include their engines and cannons; paired wings open in opposite directions',async()=>{
 const model=await load('75102-1'),control=core.resolve(model).controls[0];
 const expected=[[368,622,662,680],[427,655,666,681],[495,635,674,679],[554,645,670,678]];
 control.joints.forEach((joint,i)=>{
  for(const index of expected[i])assert.ok(joint.members.includes(index));
  const tip=model.bricks[expected[i][2]],rest=[tip.x,tip.y,tip.z];
  const point=core.rotatePoint(rest,joint.pivot,joint.axis,20*joint.factor);
  assert.ok(i%2===0?point[1]<rest[1]:point[1]>rest[1]);
  assert.ok(point[1]+5>0,'flight lift keeps the cannon above the floor');
 });
 assert.equal(core.clamp(70,control),20);assert.equal(core.clamp(-10,control),0);assert.equal(core.clamp(NaN,control),0);
});
