import fs from 'node:fs/promises';
import {detectMotion,geometryReader} from './detect-motion.mjs';
import {restoreAssemblies} from './assembly-metadata.mjs';
import {publishFile} from './publish-file.mjs';
const root='public/studforge',index=JSON.parse(await fs.readFile(root+'/data/omr/index.json','utf8'));
const manifest=JSON.parse(await fs.readFile(root+'/data/ldraw/manifest.json','utf8')).parts;
const readGeometry=geometryReader([root+'/data/ldraw/parts'],manifest);
const report={detector:'connectors-v1',kits:[],supported:0,joints:0};
for(const row of index.models){
    const file=root+'/data/omr/'+row.file,original=await fs.readFile(file,'utf8'),model=JSON.parse(original);
    let assembliesRestored=false;
    if(model.submodels?.length===1)try{assembliesRestored=restoreAssemblies(model,await fs.readFile(root+'/models/'+row.id+'.mpd','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    const result=await detectMotion(model,readGeometry);
    delete model.motion;delete row.motionCount;
    // Reviewed complex rigs take precedence; their graphs are not modeled yet.
    if(result.motion&&!['21303-1','75102-1'].includes(model.id)){model.motion=result.motion;row.motionCount=result.motion.controls.length;report.supported++;report.joints+=row.motionCount;}
    if(result.candidates)report.kits.push({id:model.id,name:model.name,joints:row.motionCount||0,candidates:result.candidates,assembliesRestored,skipped:result.skipped});
    const serialized=JSON.stringify(model);
    if(!process.argv.includes('--dry-run')&&serialized!==original.trim())await publishFile(file,serialized);
}
if(!process.argv.includes('--dry-run')){
    await publishFile(root+'/data/omr/index.json',JSON.stringify(index));
    await publishFile('docs/studforge-motion-report.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
