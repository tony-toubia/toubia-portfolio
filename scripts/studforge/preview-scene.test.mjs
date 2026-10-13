import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../public/studforge/vendor/three.module.js';
import {previewScene} from './preview-scene.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import vm from 'node:vm';
import {renderThumbnail} from './thumbnail.mjs';
test('starter previews show the full height of a stacked tower instead of overlapping every brick at the origin',()=>{
 const catalog={'3001':{width:2,length:4,height:1.2}};
 const builder={createBrickMesh:()=>new THREE.Mesh(new THREE.BoxGeometry(2,1.2,4).translate(0,.6,0))};
 const model={bricks:[0,1.2,2.4,3.6].map(y=>({partId:'3001',color:'RED',x:5,y,z:8}))},original=JSON.stringify(model);
 const scene=previewScene(model,builder,catalog),box=new THREE.Box3().setFromObject(scene);
 assert.ok(Math.abs(box.max.y-box.min.y-4.8)<1e-5);
 assert.equal(box.getCenter(new THREE.Vector3()).x,5);assert.equal(box.getCenter(new THREE.Vector3()).z,8);
 assert.equal(JSON.stringify(model),original);
});

test('collapsed crane rope faces do not participate in normal smoothing or change visible geometry',async()=>{
 const context=vm.createContext({THREE});context.window=context;
 vm.runInContext(await fs.readFile('public/studforge/js/brick-builder.js','utf8'),context);
 const model=JSON.parse(await fs.readFile('public/studforge/data/omr/42108-1.json','utf8'));
 const part=model.parts.find(p=>p[2]?.includes('ropelq-1.ldr'));
 const source=JSON.parse(await fs.readFile('public/studforge/data/ldraw/parts/'+part[4]+'.json','utf8'));
 const original=JSON.stringify(source),started=performance.now();
 const geometry=context.BrickBuilder.creaseGeometry(source.v,source.i,Array.from({length:source.i.length/3},(_,i)=>i));
 assert.ok(performance.now()-started<5000,'collapsed endpoints must not cause quadratic smoothing');
 assert.equal(geometry.attributes.position.count,source.i.length);
 for(let i=0;i<source.i.length;i++)for(let k=0;k<3;k++)assert.equal(geometry.attributes.position.array[i*3+k],Math.fround(source.v[source.i[i]*3+k]));
 assert.ok(geometry.attributes.normal.array.every(Number.isFinite));assert.equal(JSON.stringify(source),original);
});

test('real kit previews apply translation, source rotation and mirroring to part-local geometry',()=>{
 const catalog={'3001':{width:2}},builder={createBrickMesh:()=>new THREE.Mesh(new THREE.BoxGeometry(2,1,4))};
 const model={bricks:[{partId:'3001',baked:true,x:20,y:7,z:30,matrix:[0,0,1,0,1,0,1,0,0]}]},original=JSON.stringify(model);
 const scene=previewScene(model,builder,catalog),box=new THREE.Box3().setFromObject(scene);
 assert.deepEqual(box.min.toArray(),[18,6.5,29]);assert.deepEqual(box.max.toArray(),[22,7.5,31]);
 assert.ok(scene.children[0].matrixWorld.determinant()<0);assert.equal(JSON.stringify(model),original);
});

test('preview rasterizer renders mirrored double-sided parts and glass, and ignores hidden groups',async()=>{
 const root=await fs.mkdtemp(path.resolve('.cache/studforge-preview-'));
 try {
  await fs.mkdir(path.join(root,'thumbnails'));
  const scene=new THREE.Group(),glass=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial({color:0x00aaff,side:THREE.DoubleSide,transparent:true,opacity:.25}));
  glass.scale.x=-1;scene.add(glass);
  const hidden=new THREE.Group();hidden.visible=false;hidden.add(new THREE.Mesh(new THREE.BoxGeometry(1000,1000,1000),new THREE.MeshBasicMaterial({color:0xff0000})));scene.add(hidden);
  await renderThumbnail(scene,'glass',0,root);
  const {data,info}=await sharp(path.join(root,'thumbnails/glass.png')).raw().toBuffer({resolveWithObject:true});
  const alphas=Array.from(data).filter((_,i)=>i%4===3),visible=alphas.filter(a=>a>0);
  assert.equal(info.width,320);assert.ok(visible.length>10000,'hidden geometry must not shrink the model');
  assert.ok(Math.max(...alphas)<255,'glass stays translucent');
  assert.equal(data.filter((_,i)=>i%4===0).some(r=>r>0),false,'hidden red geometry is excluded');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
