// Validate every bundled model and render thumbnails from its actual geometry.
import fs from 'node:fs/promises';
import {renderThumbnail} from './thumbnail.mjs';
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

for(const model of process.argv.includes('--credits-only') ? [] : catalog){
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
const credits = `# StudForge model credits\n\nThese are community LDraw recreations of existing sets, sourced from the [LDraw Official Model Repository](https://library.ldraw.org/omr). They are not official LEGO digital models. Character names and trademarks belong to their respective owners.\n\nModifications: embedded file names were normalized to lowercase with forward slashes, and required LDraw parts were bundled into each MPD. Bundled MPDs preserve source geometry, colors, placements, patterns, author notices, and STEP records. Detailed interactive models use official lower-resolution LDraw primitive equivalents; curved surfaces and studs may have fewer facets. Thumbnails are rendered from the interactive geometry. Piece counts exclude spares and render-only strings, generated hose segments, and custom scenery; identified physical LEGO parts remain in inventory. Model steps follow the contributor's file; models without STEP records offer layer inspection instead.\n\n| Set | Community model | Author | Model license |\n|---|---|---|---|\n${catalog.map(model=>`| ${model.setNumber} | [${model.name}](${model.sourceUrl}) · [original MPD](${model.originalUrl}) | ${model.author} | ${model.license.replace(' : see CAreadme.txt','')} |`).join('\n')}\n\nIndividual model and part files retain their !LICENSE and author headers. Official part definitions may use CC BY 2.0 or CC BY 4.0; the applicable license is identified in each embedded file. Full notices: [LDraw CAreadme](CAreadme.txt), [CC BY 2.0](CAlicense.txt), [CC BY 4.0](CAlicense4.txt). Attribution metadata for parts is also available in parts.json.\n\nThree.js 0.169.0 and its LDrawLoader are bundled under the MIT license; see [THREE-LICENSE](../vendor/THREE-LICENSE.txt). The loader's module import path was changed to resolve the local Three.js copy.\n\nIndependent fan project. LEGO is a trademark of the LEGO Group, which does not sponsor, authorize or endorse StudForge.\n`;
await fs.writeFile(`${root}/models/ATTRIBUTION.md`,credits);
console.log(process.argv.includes('--credits-only') ? `Updated credits for ${catalog.length} models.` : `Verified ${catalog.length} complete model dependency graphs and thumbnails.`);
