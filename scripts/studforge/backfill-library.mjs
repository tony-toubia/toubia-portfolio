// One command discovers, validates, renders and publishes community models. Failures stay out of the library.
import fs from 'node:fs/promises';
import path from 'node:path';
import {publishFile} from './publish-file.mjs';
import {spawn,spawnSync} from 'node:child_process';
import {parseRanking,parseSetPage,plain,selectQueuedSets} from './pipeline-core.mjs';
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(`--${name}`);return i<0?fallback:args[i+1];};
const cache=path.resolve('scripts/studforge/.cache'), root=path.resolve('public/studforge');
const limit=Number(arg('limit',100)), only=arg('only','').split(',').filter(Boolean), refresh=args.includes('--refresh');
if(!Number.isInteger(limit)||limit<1||limit>200)throw new Error('--limit must be 1–200');
const rankingUrl='https://brickranker.com/hall-of-fame/sets/top';
const readJSON=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const queueFile=arg('queue','');
const queue=queueFile ? await readJSON(queueFile) : null;
if(queue){
    only.splice(0,only.length,...selectQueuedSets(queue.pending,only));
    if(!only.length){console.log('Import queue is empty.');process.exit(0);}
}
await fs.mkdir(`${cache}/batch`,{recursive:true});
let lastFetch=0;
async function cachedFetch(url,file) {
    if(!refresh)try{const stat=await fs.stat(file);if(Date.now()-stat.mtimeMs<7*86400000)return await fs.readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
    const parsed=new URL(url);
    if(!['library.ldraw.org','brickranker.com'].includes(parsed.hostname)||parsed.protocol!=='https:')throw new Error('Unexpected download host');
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,lastFetch+650-Date.now())));lastFetch=Date.now();
    const response=await fetch(url,{headers:{'User-Agent':'StudForge-library/2.0 (community model importer; cached sequential requests)'},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}: ${url}`);
    const text=await response.text();if(text.length>20000000)throw new Error('Model file exceeds download budget');
    await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,text);return text;
}
const ranking=parseRanking(await cachedFetch(rankingUrl,`${cache}/top100.html`));
let sets=[];
for(let page=1;page<200;page++) {
    const html=await cachedFetch(`https://library.ldraw.org/omr/sets?page=${page}`,`${cache}/omr/html/sets-p${page}.html`);
    const rows=html.split(/<tr\s+wire:key="[^"]*\.table\.records\./).slice(1);
    for(const row of rows){const col=name=>{const m=row.match(new RegExp(`column\\.${name}"[\\s\\S]*?<div class="fi-ta-text[^"]*">([\\s\\S]*?)</div>`));return m?plain(m[1]):'';};sets.push({omrId:Number(row.match(/^(\d+)/)[1]),number:col('number'),name:col('name'),theme:col('theme.name'),year:Number(col('year'))});}
    const range=html.match(/Showing\s+([\d,]+)\s+to\s+([\d,]+)\s+of\s+([\d,]+)/);
    if(!range)throw new Error('Community catalog pagination changed; review required');
    if(range[2]===range[3])break;
    if(page===199)throw new Error('Community catalog exceeds pagination budget');
}
console.log(`Matched ${ranking.length} ranked targets against ${sets.length} community sets.`);
const index=await readJSON(`${root}/data/omr/index.json`),catalog=await readJSON(`${root}/models/catalog.json`),manifest=await readJSON(`${root}/data/ldraw/manifest.json`),metadata=await readJSON(`${root}/models/parts.json`);
const existing=new Set(index.models.map(m=>m.id)), ranks=new Map(ranking.map(r=>[r.setNumber,r]));
const exact=ranking.map(r=>sets.find(s=>s.number===r.setNumber)).filter(Boolean);
const themed=sets.filter(s=>/^(Star Wars|Harry Potter|Super Heroes|The Hobbit and Lord of the Rings|Indiana Jones|Minecraft|LEGO Ideas|Speed Champions)/i.test(s.theme)&&!/^Technic/.test(s.theme));
const supplement=themed.filter(s=>!ranks.has(s.number)).sort((a,b)=>Number(/Mini|polybag|microfighter/i.test(a.name))-Number(/Mini|polybag|microfighter/i.test(b.name))||b.year-a.year);
const unknown=only.filter(number=>!sets.some(s=>s.number===number));
if(unknown.length)throw new Error(`No community model found for: ${unknown.join(', ')}`);
const candidates=(only.length ? only.map(number=>sets.find(s=>s.number===number)) : [...exact,...supplement]).filter((s,i,all)=>all.findIndex(x=>x.number===s.number)===i&&(!existing.has(s.number)||args.includes('--rebuild'))).slice(0,limit);
if(args.includes('--dry-run')){console.log(JSON.stringify({candidates:candidates.map(s=>({setNumber:s.number,name:s.name,theme:s.theme})),alreadyLoaded:only.filter(number=>existing.has(number)&&!args.includes('--rebuild'))},null,2));process.exit(0);}
const report={checkedAt:new Date().toISOString(),rankingSource:rankingUrl,method:'Exact set-number matches first; other licensed/theme community models are supplemental picks, never substitutes for exact ranked versions.',targets:ranking.map(r=>({...r,omrId:sets.find(s=>s.number===r.setNumber)?.omrId||null,status:existing.has(r.setNumber)?'already in library':sets.some(s=>s.number===r.setNumber)?'available community file':'no community model found'})),attempts:[]};
let previousReport=null;
try{previousReport=await readJSON('docs/studforge-backfill-report.json');}catch(error){if(error.code!=='ENOENT')throw error;}
report.attempts=(previousReport?.attempts || []).filter(row=>!candidates.some(s=>s.number===row.setNumber));
for(const target of report.targets){const old=report.attempts.find(row=>row.setNumber===target.setNumber);if(old&&!existing.has(target.setNumber))Object.assign(target,{status:old.status,reason:old.reason});}
let palette={};
try{const text=await fs.readFile(`${root}/js/ldraw-palette.js`,'utf8');palette=JSON.parse(text.slice(text.indexOf(',')+1,text.lastIndexOf(')')));}catch{throw new Error('Existing LDraw palette is invalid');}
const categoryOf=s=>/^Star Wars/.test(s.theme)?'Star Wars':/^Harry Potter/.test(s.theme)?'Harry Potter':/Super Heroes DC/.test(s.theme)?'DC':/Super Heroes Marvel/.test(s.theme)?'Marvel':/Hobbit|Lord of the Rings/.test(s.theme)?'Lord of the Rings':s.theme.split(' > ')[0];
const subjectOf=s=>/Pirates/.test(s.theme)&&/Barracuda|Schooner|ship/i.test(s.name)?'pirateShip':/X-wing|TIE|Falcon|Shuttle|Ghost|fighter|starship|Slave|Destroyer|wing|space/i.test(s.name)?'spaceship':/AT-|walker|droid|robot/i.test(s.name)?'robot':/Batmobile|Tumbler|McLaren|Porsche|Ferrari|car/i.test(s.name)?'car':/Hogwarts|Tower|Fortress|castle/i.test(s.name)?'castle':/Hotel|Station|House|Hall|Shop/i.test(s.name)?'house':'character';
async function checkpoint(){
    await publishFile(root+'/data/ldraw/manifest.json',JSON.stringify(manifest));
    await publishFile(root+'/models/parts.json',JSON.stringify(metadata));
    await publishFile(root+'/js/ldraw-palette.js','Object.assign(window.LEGO_COLORS,'+JSON.stringify(palette)+');\n');
    await publishFile(root+'/models/catalog.json',JSON.stringify(catalog,null,2)+'\n');
    await publishFile(root+'/data/omr/index.json',JSON.stringify(index));
    await fs.mkdir('docs',{recursive:true});
    await publishFile('docs/studforge-backfill-report.json',JSON.stringify(report,null,2)+'\n');
}
for(const [position,set] of candidates.entries()) {
    const startedAt=Date.now();
    const attempt={setNumber:set.number,name:set.name,theme:set.theme,rank:ranks.get(set.number)?.rank,sourceUrl:`https://library.ldraw.org/omr/sets/${set.omrId}`};const prior=previousReport?.attempts.find(row=>row.setNumber===set.number);
    if(prior)attempt.history=[...(prior.history||[]),Object.fromEntries(Object.entries(prior).filter(([key])=>key!=='history'))];
    report.attempts.push(attempt);
    console.log(`[${position+1}/${candidates.length}] ${set.number} ${set.name}`);
    try {
        const models=parseSetPage(await cachedFetch(attempt.sourceUrl,`${cache}/omr/html/set-${set.omrId}.html`));
        const match=models.find(m=>decodeURIComponent(new URL(m.url).pathname).endsWith(`/${set.number}.mpd`))||models[0];
        if(!match)throw new Error('No downloadable main model');
        if(match.missing.includes('Parts') && args.includes('--complete-only'))throw new Error('Community author reports omitted parts');
        const original=`${cache}/batch/${set.number}.source`;
        await cachedFetch(match.url,original);
        const previous=catalog.find(e=>e.setNumber===set.number);
        const entry={...previous,id:`set-${set.number}`,setNumber:set.number,name:set.name,category:previous?.category || categoryOf(set),theme:set.theme,subject:index.models.find(row=>row.id===set.number)?.subject || subjectOf(set),year:set.year,format:'ldraw',modelUrl:`models/${set.number}.mpd`,thumbnail:`thumbnails/${set.number}.png`,sourceUrl:attempt.sourceUrl,originalUrl:match.url,author:match.author,missing:match.missing,instructionsUrl:`https://www.lego.com/en-us/service/building-instructions/${set.number.split('-')[0]}`,collections:['popular-picks'],rank:attempt.rank};
        const output=`${cache}/batch/${set.number}`,result=`${cache}/batch/${set.number}.result.json`,taskFile=`${cache}/batch/${set.number}.task.json`;
        await fs.mkdir(output,{recursive:true});await fs.rm(result,{force:true});
        await fs.writeFile(taskFile,JSON.stringify({entry,original,output,result,library:`${cache}/ldraw`}));
        const exit=await new Promise(resolve=>{const child=spawn(process.execPath,['--max-old-space-size=3072','scripts/studforge/import-worker.mjs',taskFile],{stdio:['ignore','inherit','inherit'],windowsHide:true});let timeout=false;const timer=setTimeout(()=>{timeout=true;child.kill();},300000);child.on('error',error=>{clearTimeout(timer);resolve({error:error.message});});child.on('close',code=>{clearTimeout(timer);resolve({code,timeout});});});
        if(exit.timeout)throw new Error('Conversion exceeded the 300-second model budget');
        if(exit.error)throw new Error(exit.error);
        const converted=await readJSON(result);
        if(exit.code||converted.status!=='imported'){
            Object.assign(attempt,{sourceTriangles:converted.sourceTriangles,triangles:converted.renderTriangles,primitiveReplacements:converted.primitiveReplacements});
            throw new Error(converted.reason||'Model conversion failed');
        }
        for(const id of Object.keys(converted.manifest))await fs.copyFile(`${output}/parts/${id}.json`,`${root}/data/ldraw/parts/${id}.json`);
        await fs.copyFile(`${output}/model.json`,`${root}/data/omr/${set.number}.json`);await fs.copyFile(`${output}/packed.mpd`,`${root}/models/${set.number}.mpd`);await fs.copyFile(`${output}/thumbnails/${set.number}.png`,`${root}/thumbnails/${set.number}.png`);
        index.models=index.models.filter(e=>e.id!==set.number);index.models.push(converted.row);
        const oldEntry=catalog.findIndex(e=>e.setNumber===set.number);if(oldEntry>=0)catalog[oldEntry]=converted.entry;else catalog.push(converted.entry);
        Object.assign(manifest.parts,converted.manifest);Object.assign(metadata,converted.metadata);Object.assign(palette,converted.palette);
        Object.assign(attempt,{status:'imported',pieces:converted.pieceCount,triangles:converted.model.stats.triangles,sourceTriangles:converted.model.stats.sourceTriangles,primitiveReplacements:converted.model.stats.primitiveReplacements,visualComponents:converted.model.stats.visualComponents,missing:entry.missing});
        console.log(`  imported ${attempt.pieces} pieces; ${converted.model.steps} ${converted.model.stepKind}`);
    }catch(error){Object.assign(attempt,{status:'skipped',reason:error.message});console.log(`  skipped: ${error.message}`);}
    attempt.durationSeconds=Math.round((Date.now()-startedAt)/1000);
    console.log(`  finished in ${attempt.durationSeconds}s`);
    const target=report.targets.find(r=>r.setNumber===set.number);if(target)Object.assign(target,{status:attempt.status,reason:attempt.reason});
    // Keep provenance and counts in intermediate checkpoints if a process is interrupted.
    report.summary={...previousReport?.summary,status:'selected batch in progress',attempted:report.attempts.length,imported:report.attempts.filter(a=>a.status==='imported').length,skipped:report.attempts.filter(a=>a.status==='skipped').length,totalNewSets:index.models.length-116,totalLibrary:index.models.length,remainingInInitialBatch:queue?.pending.length??previousReport?.summary?.remainingInInitialBatch};
    await checkpoint();
    if(queue){queue.pending=queue.pending.filter(row=>(typeof row==='string'?row:row.setNumber)!==set.number&&!existing.has(typeof row==='string'?row:row.setNumber));queue.completed=[...(queue.completed||[]),attempt];queue.updatedAt=new Date().toISOString();await publishFile(queueFile,JSON.stringify(queue,null,2)+'\n');}
}
const selectedAttempts=report.attempts.filter(a=>candidates.some(s=>s.number===a.setNumber));
report.summary={status:'selected batch complete',rankedTargets:100,exactCommunityMatches:exact.length,attempted:report.attempts.length,imported:report.attempts.filter(a=>a.status==='imported').length,skipped:report.attempts.filter(a=>a.status==='skipped').length,initialTrialImports:previousReport?.summary?.initialTrialImports||0,totalNewSets:index.models.length-116,totalLibrary:index.models.length,remainingInInitialBatch:queue?.pending.length??previousReport?.summary?.remainingInInitialBatch};
report.latestBatch={completedAt:new Date().toISOString(),selected:candidates.map(s=>s.number),imported:selectedAttempts.filter(a=>a.status==='imported').length,skipped:selectedAttempts.filter(a=>a.status==='skipped').length,durationSeconds:selectedAttempts.reduce((total,a)=>total+a.durationSeconds,0)};
await checkpoint();
const credits=spawnSync(process.execPath,['scripts/studforge/prepare-models.mjs','--credits-only'],{stdio:'inherit',windowsHide:true});
if(credits.error)throw credits.error;
if(credits.status)throw new Error('Model credits could not be regenerated');
console.log(JSON.stringify(report.summary));
