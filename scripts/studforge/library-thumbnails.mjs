// Render library previews with the same part builder used by the viewer.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../../public/studforge/vendor/three.module.js';
import {renderThumbnail} from './thumbnail.mjs';
import {publishFile} from './publish-file.mjs';
import {previewScene} from './preview-scene.mjs';
const root='public/studforge',context=vm.createContext({console,THREE,setTimeout});context.window=context;
context.fetch=async url=>{try{const text=await fs.readFile(root+'/'+url,'utf8');return {ok:true,json:async()=>JSON.parse(text)};}catch(e){if(e.code!=='ENOENT')throw e;return {ok:false};}};
for(const file of ['colors','ldraw-palette','parts-catalog','brick-builder','forge-grid','forge-modules','blueprint','forge-builders','forge-builders-2','forge-builders-3','models-db','generator','omr'])vm.runInContext(await fs.readFile(root+'/js/'+file+'.js','utf8'),context);
const builder=new context.BrickBuilder({quality:'high'}),generator=new context.BrickGenerator();
const index=JSON.parse(await fs.readFile(root+'/data/omr/index.json','utf8'));
const repaired=JSON.parse(await fs.readFile('docs/studforge-frame-repair.json','utf8')).kits.map(k=>k.id);
const selection=process.argv.indexOf('--only'),selected=selection<0?null:new Set((process.argv[selection+1]||'').split(',').filter(Boolean));
const all=process.argv.includes('--all');
if(selected&&!selected.size)throw new Error('--only needs comma-separated kit or starter IDs');
const reportPath='docs/studforge-thumbnail-report.json';
let report={renderer:'viewer-parts-with-source-placement',kits:{}};
try{report=JSON.parse(await fs.readFile(reportPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
async function render(model,id){
 if(model.bricks.some(b=>b.baked))await context.BrickBuilder.preload(model.bricks.map(b=>b.geometryId||b.partId));
 const missing=model.bricks.filter(b=>b.baked&&!context.BrickBuilder.isBaseplate(b)&&!context.BrickBuilder.bakedCache.get(context.BrickBuilder.bakedId(b.geometryId||b.partId)));
 const failed=missing.filter(b=>context.BrickBuilder.manifest?.parts[b.geometryId||b.partId]);
 if(failed.length)throw new Error('Preview geometry failed to load for '+id+': '+[...new Set(failed.map(b=>b.geometryId||b.partId))].join(', '));
 // Existing community omissions have no geometry to render. Keep their source
 // inventory intact, but do not bake the viewer's temporary boxes into a card.
 const omitted=new Set(missing);
 const group=previewScene({...model,bricks:model.bricks.filter(b=>!omitted.has(b))},builder,context.LEGO_PARTS);
 await renderThumbnail(group,id,0,root,{linearColors:true});
 report.kits[id]={parts:model.bricks.length,rendered:model.bricks.length-missing.length,unavailableGeometry:[...new Set(missing.map(b=>b.geometryId||b.partId))]};
 if(missing.length)console.log('Omitted unavailable preview geometry for '+id+': '+report.kits[id].unavailableGeometry.join(', '));
 await publishFile(reportPath,JSON.stringify(report,null,2)+'\n');
}
let generated=0;
for(const row of index.models){
 row.thumbnail ||= 'thumbnails/'+row.id+'.png';
 let missing=false;try{await fs.access(root+'/'+row.thumbnail);}catch(e){if(e.code!=='ENOENT')throw e;missing=true;}
 if(all||missing||repaired.includes(row.id)||selected?.has(row.id)){
  await render(context.FORGE.omr.expand(JSON.parse(await fs.readFile(root+'/data/omr/'+row.file,'utf8'))),row.id);generated++;
  console.log('Rendered '+row.id+' ('+generated+')');
 }
}
for(const idea of context.INSPIRATION_MODELS){
 let missing=false;try{await fs.access(root+'/thumbnails/'+idea.id+'.png');}catch(e){if(e.code!=='ENOENT')throw e;missing=true;}
 if(all||missing||selected?.has(idea.id)){await render(generator.generateFromPrompt(idea.prompt,0),idea.id);generated++;}
}
await publishFile(root+'/data/omr/index.json',JSON.stringify(index));
await publishFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(`All ${index.models.length} kits and ${context.INSPIRATION_MODELS.length} starter ideas have previews; rendered ${generated} images.`);
