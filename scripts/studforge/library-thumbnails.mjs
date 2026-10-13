// Render library previews with the same part builder used by the viewer.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../../public/studforge/vendor/three.module.js';
import {renderThumbnail} from './thumbnail.mjs';
import {publishFile} from './publish-file.mjs';
const root='public/studforge',context=vm.createContext({console,THREE,setTimeout});context.window=context;
context.fetch=async url=>{try{const text=await fs.readFile(root+'/'+url,'utf8');return {ok:true,json:async()=>JSON.parse(text)};}catch(e){if(e.code!=='ENOENT')throw e;return {ok:false};}};
for(const file of ['colors','ldraw-palette','parts-catalog','brick-builder','forge-grid','forge-modules','blueprint','forge-builders','forge-builders-2','forge-builders-3','models-db','generator','omr'])vm.runInContext(await fs.readFile(root+'/js/'+file+'.js','utf8'),context);
const builder=new context.BrickBuilder({quality:'high'}),generator=new context.BrickGenerator();
const index=JSON.parse(await fs.readFile(root+'/data/omr/index.json','utf8'));
const repaired=JSON.parse(await fs.readFile('docs/studforge-frame-repair.json','utf8')).kits.map(k=>k.id);
async function render(model,id){
 if(model.bricks.some(b=>b.baked))await context.BrickBuilder.preload(model.bricks.map(b=>b.geometryId||b.partId));
 const group=new THREE.Group();
 for(const b of model.bricks){
  const mesh=builder.createBrickMesh(b.partId,b.color,{position:new THREE.Vector3(b.x,b.y,b.z),layer:b.layer,matrix:b.matrix,rotX:b.rotX,rotZ:b.rotZ,fp:b.fp,baked:b.baked,geometryId:b.geometryId,baseplate:b.baseplate});
  if(!b.baked&&b.rotY)mesh.rotation.y=b.rotY;
  group.add(mesh);
 }
 await renderThumbnail(group,id,0,root);
}
let generated=0;
for(const row of index.models){
 row.thumbnail ||= 'thumbnails/'+row.id+'.png';
 let missing=false;try{await fs.access(root+'/'+row.thumbnail);}catch(e){if(e.code!=='ENOENT')throw e;missing=true;}
 if(missing||repaired.includes(row.id)){
  await render(context.FORGE.omr.expand(JSON.parse(await fs.readFile(root+'/data/omr/'+row.file,'utf8'))),row.id);generated++;
 }
}
for(const idea of context.INSPIRATION_MODELS){
 try{await fs.access(root+'/thumbnails/'+idea.id+'.png');}catch(e){if(e.code!=='ENOENT')throw e;await render(generator.generateFromPrompt(idea.prompt,0),idea.id);generated++;}
}
await publishFile(root+'/data/omr/index.json',JSON.stringify(index));
console.log(`All ${index.models.length} kits and ${context.INSPIRATION_MODELS.length} starter ideas have previews; rendered ${generated} images.`);
