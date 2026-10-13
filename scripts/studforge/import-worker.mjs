// Each model runs in its own process: a malformed or oversized file cannot stop the batch.
import fs from 'node:fs/promises';
import path from 'node:path';
import {packModel,optimizeBundle,countBundleTriangles} from './pipeline-core.mjs';
import {convertModel} from './convert-model.mjs';
const task = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
let geometryStats={};
try {
    const original = await fs.readFile(task.original, 'utf8');
    const partCache = new Map();
    async function readPart(ref) {
        if (partCache.has(ref)) return partCache.get(ref);
        const folders = ref.startsWith('s/') ? ['parts'] : /^(48|8)\//.test(ref) ? ['p'] : ['parts','p'];
        for (const folder of folders) {
            try { const text = await fs.readFile(path.join(task.library,folder,ref), 'utf8'); partCache.set(ref,text); return text; }
            catch (e) { if (e.code !== 'ENOENT') throw e; }
        }
        const error=new Error(`Official library dependency unavailable: ${ref}`);error.code='ENOENT';throw error;
    }
    const bundle = await packModel(original, `${task.entry.setNumber}.ldr`, readPart);
    const entry = {...task.entry,author:bundle.author || task.entry.author,license:bundle.license};
    const config = await fs.readFile('public/studforge/models/LDConfig.ldr','utf8');
    const sourceTriangles=countBundleTriangles(bundle.packed);
    const renderBundle=sourceTriangles>1000000 ? await optimizeBundle(bundle,readPart) : bundle;
    const renderTriangles=countBundleTriangles(renderBundle.packed);
    geometryStats={sourceTriangles,renderTriangles,primitiveReplacements:renderBundle.replacements||0};
    if(renderTriangles>2000000)throw new Error(`Optimized geometry has ${renderTriangles.toLocaleString('en-US')} triangles (source ${sourceTriangles.toLocaleString('en-US')}); interactive limit is 2,000,000`);
    const converted = await convertModel({entry,text:renderBundle.packed,config,metadata:bundle.metadata,outputRoot:task.output});
    Object.assign(converted.model.stats,{sourceTriangles,primitiveReplacements:renderBundle.replacements||0});
    await fs.writeFile(`${task.output}/model.json`,JSON.stringify(converted.model));
    await fs.writeFile(`${task.output}/packed.mpd`,bundle.packed);
    await fs.writeFile(task.result,JSON.stringify({status:'imported',...converted,entry:{...entry,pieceCount:converted.pieceCount,sourceStepCount:converted.sourceStepCount},metadata:bundle.metadata}));
} catch (error) {
    await fs.writeFile(task.result,JSON.stringify({status:'skipped',reason:error.message,...geometryStats}));
    console.error(error.message); process.exitCode=1;
}
