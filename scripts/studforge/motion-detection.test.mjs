import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {detectMotion,geometryReader} from './detect-motion.mjs';
import {restoreAssemblies} from './assembly-metadata.mjs';
const root='public/studforge',manifest=JSON.parse(await fs.readFile(root+'/data/ldraw/manifest.json','utf8')).parts;
const readGeometry=geometryReader([root+'/data/ldraw/parts'],manifest);
const load=async id=>JSON.parse(await fs.readFile(root+'/data/omr/'+id+'.json','utf8'));
test('automatic turntable detection follows all four angled rotor blades and their cap, leaving the helicopter body fixed',async()=>{
 const model=await load('30181-1'),original=JSON.stringify(model),result=await detectMotion(model,readGeometry);
 assert.ok(result.motion);assert.equal(result.motion.controls.length,1);
 assert.deepEqual(result.motion.controls[0].joints[0].members,[44,45,46,47,48,49]);
 assert.deepEqual(result.motion.controls[0].joints[0].pivot,[2,3.6,9]);
 assert.equal(JSON.stringify(model),original);
});
test('detector rejects a turntable locked across its joint and an unmatched hinge half',async()=>{
 const model=await load('30181-1');
 const rotor=await detectMotion(model,readGeometry);assert.ok(rotor.motion);
 // Join a moving blade to the fixed turntable base with an explicit stud/socket.
 const blocked=await detectMotion(model,async(id,partId,name)=>{
  const g=await readGeometry(id,partId,name);
  return partId==='3680'?{...g,sockets:[...g.sockets,[.086,0,.702,0,1,0]]}:g;
 });
 assert.equal(blocked.motion,null);assert.match(blocked.skipped[0].reason,/locked/);
 const unmatched=structuredClone(model);unmatched.bricks[44][2]+=.1;
 assert.equal((await detectMotion(unmatched,readGeometry)).motion,null);
});
test('source subassemblies preserve attached head details and inferred metadata is guarded by the placement fingerprint',async()=>{
 const model=await load('6889-1'),result=await detectMotion(model,readGeometry);
 assert.ok(result.motion);
 const members=new Set(result.motion.controls[0].joints[0].members);
 for(const [i,b] of model.bricks.entries())if(model.submodels[b[15]]==='robot - head')assert.ok(members.has(i));
 assert.ok(!members.has(106));assert.ok(members.has(107));
});
test('every published automatic rig matches its model, has disjoint members and stays disabled after placement changes',async()=>{
 const context=vm.createContext({});context.window=context;
 vm.runInContext(await fs.readFile(root+'/js/articulation-core.js','utf8'),context);
 vm.runInContext(await fs.readFile(root+'/js/omr.js','utf8'),context);
 const index=JSON.parse(await fs.readFile(root+'/data/omr/index.json','utf8'));
 let total=0;
 for(const row of index.models){
  const data=await load(row.id);assert.equal(row.motionCount||0,data.motion?.controls.length||0);
  if(!data.motion)continue;
  const model=context.FORGE.omr.expand(data),rig=context.StudForgeArticulation.resolve(model);
  assert.ok(rig,row.id);total++;
  const moving=rig.controls.flatMap(c=>c.joints.flatMap(j=>j.members));
  assert.equal(new Set(moving).size,moving.length);
  for(const c of rig.controls){
   assert.ok(c.min<0&&c.max>0);assert.ok(c.joints[0].members.includes(c.connectors.top));
   assert.ok(!moving.includes(c.connectors.base),'base of an exposed joint stays fixed');
  }
  model.bricks[0].matrix[0]+=.001;assert.equal(context.StudForgeArticulation.resolve(model),null);
 }
 assert.ok(total>=20,'the shared detector supports a meaningful library expansion');
});
test('restored assembly metadata distinguishes repeated instances and rejects mismatched physical traversal',()=>{
 const packed='0 FILE main.ldr\n0 !LDRAW_ORG Model\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 leaf.ldr\n1 16 100 0 0 1 0 0 0 1 0 0 0 1 leaf.ldr\n0 FILE leaf.ldr\n0 !LDRAW_ORG Model\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n0 FILE 3001.dat\n0 !LDRAW_ORG Part\n';
 const model={submodels:['main'],parts:[['3001']],bricks:[Array(16).fill(0),Array(16).fill(0)]};
 model.bricks[1][2]=5;
 assert.ok(restoreAssemblies(model,packed));assert.notEqual(model.bricks[0][15],model.bricks[1][15]);assert.equal(model.bricks[1][2],5);
 const mismatch={submodels:['main'],parts:[['3002']],bricks:[Array(16).fill(0),Array(16).fill(0)]},original=JSON.stringify(mismatch);
 assert.equal(restoreAssemblies(mismatch,packed),false);assert.equal(JSON.stringify(mismatch),original);
});
