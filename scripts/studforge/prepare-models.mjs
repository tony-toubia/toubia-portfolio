// Validate every bundled model and render thumbnails from its actual geometry.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import sharp from 'sharp';
import * as THREE from '../../public/studforge/vendor/three.module.js';
import {loadPackedModel} from '../../public/studforge/js/ldraw-model.js';
const root = 'public/studforge';
const catalog = JSON.parse(await fs.readFile(`${root}/models/catalog.json`,'utf8'));
const config = await fs.readFile(`${root}/models/LDConfig.ldr`,'utf8');
globalThis.ProgressEvent ||= class { constructor(type, values) { this.type=type; Object.assign(this,values); } };
await fs.mkdir(`${root}/thumbnails`,{recursive:true});
const normalize = name=>name.trim().replaceAll('\\','/').toLowerCase();
function validatePacked(text) {
    const embedded = new Set([...text.matchAll(/^0 FILE (.+)$/gm)].map(m=>normalize(m[1])));
    const refs = [...text.matchAll(/^1\s+\S+(?:\s+[-+\d.eE]+){12}\s+(.+)$/gm)].map(m=>normalize(m[1]));
    const missing = [...new Set(refs.filter(ref=>!embedded.has(ref)))];
    if (missing.length) throw new Error(`Unbundled dependencies: ${missing.join(', ')}`);
    if (!text.includes('!LICENSE')) throw new Error('Missing model license');
}
function collectParts(object, pieces=[]) {
    if (['Part','Unofficial_Part'].includes(object.userData.type)) pieces.push(object);
    else object.children.forEach(child=>collectParts(child,pieces));
    return pieces;
}
async function renderThumbnail(object,id,frontAngle=0) {
    object.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(object), center=box.getCenter(new THREE.Vector3());
    const direction=new THREE.Vector3(5,3.5,7).applyAxisAngle(new THREE.Vector3(0,1,0),frontAngle).normalize();
    const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
    const up=new THREE.Vector3().crossVectors(direction,right).normalize();
    const triangles=[];
    const light=new THREE.Vector3(-0.3,0.8,0.7).normalize();
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();
    object.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const geometry=mesh.geometry, positions=geometry.attributes.position;
        const indices=geometry.index, count=indices?indices.count:positions.count;
        const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        const groups=geometry.groups.length?geometry.groups:[{start:0,count,materialIndex:0}];
        for(const group of groups){
            const material=materials[group.materialIndex||0]||materials[0];
            const end=Math.min(count,group.start+group.count);
            for(let i=group.start;i<end;i+=3){
                const get=(vector,index)=>vector.fromBufferAttribute(positions,indices?indices.getX(index):index).applyMatrix4(mesh.matrixWorld).sub(center);
                get(a,i);get(b,i+1);get(c,i+2);
                normal.crossVectors(ab.subVectors(b,a),ac.subVectors(c,a)).normalize();
                if(normal.dot(direction)<0.001)continue;
                const shade=0.48+0.52*Math.max(0,normal.dot(light));
                const base=material.color?.clone()||new THREE.Color('#aaaaaa');
                base.multiplyScalar(shade);
                triangles.push({points:[a,b,c].map(v=>[v.dot(right),-v.dot(up)]),depth:(a.dot(direction)+b.dot(direction)+c.dot(direction))/3,color:`#${base.getHexString()}`});
            }
        }
    });
    if(!triangles.length)throw new Error(`No triangles in ${id}`);
    const points=triangles.flatMap(t=>t.points);
    const minX=points.reduce((v,p)=>Math.min(v,p[0]),Infinity), maxX=points.reduce((v,p)=>Math.max(v,p[0]),-Infinity);
    const minY=points.reduce((v,p)=>Math.min(v,p[1]),Infinity), maxY=points.reduce((v,p)=>Math.max(v,p[1]),-Infinity);
    const scale=Math.min(270/(maxX-minX),210/(maxY-minY));
    const xOffset=160-(minX+maxX)*scale/2,yOffset=123-(minY+maxY)*scale/2;
    const paths=triangles.sort((a,b)=>a.depth-b.depth).map(t=>`<path d="M${t.points.map(p=>`${(p[0]*scale+xOffset).toFixed(1)},${(p[1]*scale+yOffset).toFixed(1)}`).join('L')}Z" fill="${t.color}"/>`).join('');
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="250"><ellipse cx="160" cy="230" rx="90" ry="10" fill="#000" opacity=".2"/>${paths}</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(`${root}/thumbnails/${id}.png`);
}
for(const model of catalog){
    console.log('Preparing', model.name);
    const text=await fs.readFile(`${root}/${model.modelUrl}`,'utf8');validatePacked(text);
    const {source:group}=await loadPackedModel(text,config);
    console.log('Loaded geometry', model.name);
    const pieces=collectParts(group);
    if(!pieces.length)throw new Error(`No physical parts: ${model.name}`);
    model.pieceCount=pieces.length;model.sourceStepCount=group.userData.numBuildingSteps;
    group.rotation.x=Math.PI;group.scale.setScalar(1/20);
    await renderThumbnail(group,model.setNumber,model.frontAngle);
    console.log(model.name,model.pieceCount,'pieces',model.sourceStepCount,'source steps');
}
await fs.writeFile(`${root}/models/catalog.json`,JSON.stringify(catalog,null,2)+'\n');
const credits = `# StudForge model credits\n\nThese are community LDraw recreations of existing sets, sourced from the [LDraw Official Model Repository](https://library.ldraw.org/omr). They are not official LEGO digital models. Character names and trademarks belong to their respective owners.\n\nModifications: embedded file names were normalized to lowercase with forward slashes, and required LDraw parts were bundled into each MPD. Geometry, colors, placements, patterns, author notices, and source STEP records are preserved. Thumbnails are rendered from these models. Piece counts describe model geometry and exclude spares. Model steps follow the contributor's file; models without STEP records offer layer inspection instead.\n\n| Set | Community model | Author | Model license |\n|---|---|---|---|\n${catalog.map(model=>`| ${model.setNumber} | [${model.name}](${model.sourceUrl}) · [original MPD](${model.originalUrl}) | ${model.author} | ${model.license.replace(' : see CAreadme.txt','')} |`).join('\n')}\n\nIndividual model and part files retain their !LICENSE and author headers. Official part definitions may use CC BY 2.0 or CC BY 4.0; the applicable license is identified in each embedded file. Full notices: [LDraw CAreadme](CAreadme.txt), [CC BY 2.0](CAlicense.txt), [CC BY 4.0](CAlicense4.txt). Attribution metadata for parts is also available in parts.json.\n\nThree.js 0.169.0 and its LDrawLoader are bundled under the MIT license; see [THREE-LICENSE](../vendor/THREE-LICENSE.txt). The loader's module import path was changed to resolve the local Three.js copy.\n\nIndependent fan project. LEGO is a trademark of the LEGO Group, which does not sponsor, authorize or endorse StudForge.\n`;
await fs.writeFile(`${root}/models/ATTRIBUTION.md`,credits);
const context=vm.createContext({window:{},THREE});
for(const file of ['colors','parts-catalog','brick-builder','models-db'])vm.runInContext(await fs.readFile(`${root}/js/${file}.js`,'utf8'),context);
const builder=new context.window.BrickBuilder();
for(const model of context.window.INSPIRATION_MODELS){
    const group=new THREE.Group();
    for(const brick of model.bricks){const mesh=builder.createBrickMesh(brick.partId,brick.color);mesh.position.set(brick.x,brick.y,brick.z);mesh.rotation.y=brick.rotY||0;group.add(mesh);}
    await renderThumbnail(group,model.id);
}
console.log(`Verified ${catalog.length} complete model dependency graphs; rendered ${catalog.length+context.window.INSPIRATION_MODELS.length} thumbnails.`);
