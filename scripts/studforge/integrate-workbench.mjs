// Adapt the curated packed models to the current workbench without changing existing sets.
import fs from 'node:fs/promises';
import * as THREE from '../../public/studforge/vendor/three.module.js';
import {loadPackedModel} from '../../public/studforge/js/ldraw-model.js';
globalThis.ProgressEvent ||= class { constructor(type,values){this.type=type;Object.assign(this,values);} };
const root='public/studforge';
const catalog=JSON.parse(await fs.readFile(`${root}/models/catalog.json`,'utf8'));
const config=await fs.readFile(`${root}/models/LDConfig.ldr`,'utf8');
const index=JSON.parse(await fs.readFile(`${root}/data/omr/index.json`,'utf8'));
const manifest=JSON.parse(await fs.readFile(`${root}/data/ldraw/manifest.json`,'utf8'));
const metadata=JSON.parse(await fs.readFile(`${root}/models/parts.json`,'utf8'));
const palette={};
for(const line of config.split(/\r?\n/)) {
 const match=line.match(/^0 !COLOUR\s+(\S+)\s+CODE\s+(\d+)\s+VALUE\s+(#[\da-fA-F]{6})/);
 if(!match)continue;
 const [,,code,hex]=match, alpha=Number(line.match(/\bALPHA (\d+)/)?.[1]||255);
 palette[`LDRAW_${code}`]={name:match[1].replaceAll('_',' '),hex,category:alpha<255?'Transparent':/METAL|CHROME|PEARLESCENT/.test(line)?'Metallic':'Solid',opacity:alpha/255,ldrawCode:code};
}
await fs.writeFile(`${root}/js/ldraw-palette.js`,`Object.assign(window.LEGO_COLORS,${JSON.stringify(palette)});\n`);
const axes=new THREE.Matrix4().makeScale(.05,-.05,-.05), axesInverse=axes.clone().invert();
const rounded=v=>Math.round(v*1e5)/1e5;
const known=new Set();
function physical(object,result=[]) {
 if(['Part','Unofficial_Part'].includes(object.userData.type))result.push(object);
 else object.children.forEach(child=>physical(child,result));
 return result;
}
function colorOf(piece) {
 let item=piece;
 while(item&&(item.userData.colorCode==null||String(item.userData.colorCode)==='16'))item=item.parent;
 return String(item?.userData.colorCode??'16');
}
async function bake(piece,filename,color) {
 const id=`licensed-${filename.replace(/[^a-z0-9_.-]/g,'_')}-${color}`;
 if(known.has(id))return id;
 known.add(id);
 const v=[],i=[],c=[],byVertex=new Map();
 const inverse=piece.matrixWorld.clone().invert(), point=new THREE.Vector3();
 piece.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const g=mesh.geometry,attr=g.attributes.position,idx=g.index,count=idx?idx.count:attr.count;
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const matrix=axes.clone().multiply(inverse).multiply(mesh.matrixWorld);
  for(const group of g.groups.length?g.groups:[{start:0,count,materialIndex:0}]) {
   const material=materials[group.materialIndex||0]||materials[0];
   const code=String(material.userData.code);
   for(let p=group.start;p<Math.min(count,group.start+group.count);p+=3) {
    c.push(code===color?16:`LDRAW_${code}`);
    for(let k=0;k<3;k++) {
     point.fromBufferAttribute(attr,idx?idx.getX(p+k):p+k).applyMatrix4(matrix);
     const xyz=point.toArray().map(rounded), key=xyz.join(',');
     if(!byVertex.has(key)){byVertex.set(key,v.length/3);v.push(...xyz);}
     i.push(byVertex.get(key));
    }
   }
  }
 });
 if(!i.length||v.some(value=>!Number.isFinite(value)))throw new Error(`Invalid geometry ${filename}`);
 const doc={id,name:metadata[filename]?.name||filename,v,i,c,tris:i.length/3,licence:'See models/ATTRIBUTION.md and retained MPD !LICENSE headers'};
 const json=JSON.stringify(doc);
 await fs.writeFile(`${root}/data/ldraw/parts/${id}.json`,json);
 manifest.parts[id]={name:doc.name,tris:doc.tris,bytes:Buffer.byteLength(json),licence:doc.licence};
 return id;
}
for(const entry of catalog) {
 const {source}=await loadPackedModel(await fs.readFile(`${root}/${entry.modelUrl}`,'utf8'),config);
 source.rotation.set(Math.PI,entry.frontAngle||0,0);source.scale.setScalar(.05);source.updateMatrixWorld(true);
 const pieces=physical(source),colors=[],parts=[],bricks=[];
 const box=new THREE.Box3().setFromObject(source),shift=new THREE.Vector3(-box.min.x,-box.min.y,-box.min.z);
 const layers=[...new Set(pieces.map(piece=>source.userData.numBuildingSteps>1?piece.userData.buildingStep:Math.round(piece.matrixWorld.elements[13]/.4)))].sort((a,b)=>a-b);
 const partsMap=new Map();
 for(const piece of pieces) {
  const filename=piece.userData.fileName.toLowerCase().replaceAll('\\','/'),color=colorOf(piece),geometryId=await bake(piece,filename,color);
  const colorKey=`LDRAW_${color}`;
  if(!palette[colorKey])throw new Error(`Unknown color ${color}`);
  if(!colors.includes(colorKey))colors.push(colorKey);
  if(!partsMap.has(geometryId)){partsMap.set(geometryId,parts.length);parts.push([filename.replace(/\.dat$/,''),null,metadata[filename]?.name||filename,null,geometryId]);}
  const transform=piece.matrixWorld.clone().multiply(axesInverse),m=transform.elements;
  const position=new THREE.Vector3().setFromMatrixPosition(piece.matrixWorld).add(shift);
  const step=source.userData.numBuildingSteps>1?piece.userData.buildingStep:Math.round(piece.matrixWorld.elements[13]/.4);
  bricks.push([partsMap.get(geometryId),colors.indexOf(colorKey),...position.toArray().map(rounded),...[m[0],m[4],m[8],m[1],m[5],m[9],m[2],m[6],m[10]].map(rounded),layers.indexOf(step),0,null]);
 }
 if(pieces.length!==entry.pieceCount)throw new Error(`Piece count changed for ${entry.name}`);
 const size=box.getSize(new THREE.Vector3()), id=entry.setNumber;
 const model={format:'studforge-omr-1',id,name:entry.name,theme:`${entry.category} > BrickHeadz`,subject:'character',category:entry.category,pieces:pieces.length,steps:layers.length,stepKind:source.userData.numBuildingSteps>1?'steps':'layers',dims:{w:Math.ceil(size.x),d:Math.ceil(size.z),h:Math.ceil(size.y/1.2)},submodels:['main'],parts,colors,bricks,source:{url:entry.sourceUrl,download:entry.originalUrl,file:entry.modelUrl,authors:[entry.author],licence:entry.license.includes('4.0')?'CC BY 4.0':'CC BY 2.0',instructionsUrl:entry.instructionsUrl,missing:entry.missing},stats:{droppedRefs:0,fileSteps:source.userData.numBuildingSteps,patternPreserved:true}};
 await fs.writeFile(`${root}/data/omr/${id}.json`,JSON.stringify(model));
 const row={id,name:model.name,theme:model.theme,subject:model.subject,pieces:model.pieces,steps:model.steps,stepKind:model.stepKind,file:`${id}.json`,authors:model.source.authors,licence:model.source.licence,url:entry.sourceUrl,dims:model.dims,thumbnail:entry.thumbnail,category:entry.category};
 index.models=index.models.filter(item=>item.id!==id);index.models.push(row);
 console.log(entry.name,pieces.length,'pieces,',layers.length,model.stepKind);
}
await fs.writeFile(`${root}/data/omr/index.json`,JSON.stringify(index));
await fs.writeFile(`${root}/data/ldraw/manifest.json`,JSON.stringify(manifest));
console.log(`Integrated ${catalog.length} character sets; retained ${index.models.length-catalog.length} existing sets.`);
