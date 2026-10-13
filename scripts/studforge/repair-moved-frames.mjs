import fs from 'node:fs';
import {movedFrame,multiply3,transform3,studFrame} from '../ldraw/moved-frame.mjs';
import {publishFile} from './publish-file.mjs';
const root='public/studforge',index=JSON.parse(fs.readFileSync(root+'/data/omr/index.json','utf8'));
const readText=id=>{try{return fs.readFileSync('scripts/studforge/.cache/ldraw/parts/'+id+'.dat','utf8');}catch(e){if(e.code!=='ENOENT')throw e;return null;}};
const report={kits:[],repaired:0};
for(const row of index.models){
 const file=root+'/data/omr/'+row.file,model=JSON.parse(fs.readFileSync(file,'utf8'));
 if(model.stats?.movedFramesRepaired)continue;
 const frames=model.parts.map(p=>!p[4]&&p[2]?movedFrame(p[2],p[0],readText):null).map(f=>f&&studFrame(f));
 const fixed=[];
 for(const [i,b] of model.bricks.entries()){
  const f=frames[b[0]];if(!f||JSON.stringify(f)===JSON.stringify({matrix:[1,0,0,0,1,0,0,0,1],position:[0,0,0]}))continue;
  const original=b.slice(5,14),offset=transform3(original,f.position),rotation=multiply3(original,f.matrix);
  for(let k=0;k<3;k++)b[2+k]=Math.round((b[2+k]+offset[k])*1e5)/1e5;
  for(let k=0;k<9;k++)b[5+k]=Math.round(rotation[k]*1e5)/1e5;
  fixed.push({index:i,original:model.parts[b[0]][2],replacement:model.parts[b[0]][0]});
 }
 if(!fixed.length)continue;
 model.stats.movedFramesRepaired=true;
 report.kits.push({id:model.id,name:model.name,parts:fixed});report.repaired+=fixed.length;
 if(!process.argv.includes('--dry-run'))await publishFile(file,JSON.stringify(model));
}
if(!process.argv.includes('--dry-run')&&report.kits.length)await publishFile('docs/studforge-frame-repair.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
