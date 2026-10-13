// Reusable connector rules, in baked StudForge part coordinates (stud units).
// This deliberately handles a small, verified vocabulary, not arbitrary physics.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {connectorReader} from './connector-reader.mjs';
const context = vm.createContext({});
vm.runInContext(await fs.readFile(new URL('../../public/studforge/js/articulation-core.js', import.meta.url), 'utf8'), context);
const {fingerprint} = context.StudForgeArticulation;
export const rules = [
    {base: '3680', tops: ['3679'], pivot: [0, 0, 0], axis: [0, 1, 0], label: 'Turntable', min: -180, max: 180},
    {base: '3937', tops: ['3938', '6134'], pivot: [0, -.5, 0], axis: [1, 0, 0], label: 'Hinge', min: -15, max: 15},
    {base: '2429', tops: ['2430'], pivot: [0, 0, 0], axis: [0, 1, 0], label: 'Plate hinge', min: -15, max: 15},
    {base: '3831', tops: ['3830'], pivot: [0, 0, 0], axis: [0, 1, 0], label: 'Brick hinge', min: -15, max: 15},
];
const mul = (m, v) => [0, 1, 2].map(i => m[i*3]*v[0]+m[i*3+1]*v[1]+m[i*3+2]*v[2]);
const add = (a,b) => a.map((v,i)=>v+b[i]);
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
const normalize = v => v.map(x=>x/Math.hypot(...v));
const near = (a,b) => distance(a,b)<.035;
const parallel = (a,b) => Math.abs(dot(a,b))>.999;
const coaxial = (a,b) => parallel(a.axis,b.axis) && distance(a.pivot.map((v,i)=>v+a.axis[i]*dot(b.pivot.map((p,k)=>p-a.pivot[k]),a.axis)),b.pivot)<.035;
const mechanical = new Set(rules.flatMap(r=>[r.base,...r.tops]));
const round = v => Math.round(v*1e5)/1e5;
const inversePoint = (part,point) => mul([part.matrix[0],part.matrix[3],part.matrix[6],part.matrix[1],part.matrix[4],part.matrix[7],part.matrix[2],part.matrix[5],part.matrix[8]],point.map((v,i)=>v-part.position[i]));

// Read baked bounds/studs once across a batch. New bakes get their studs from the
// packed LDraw primitives, so no model geometry needs to be rebuilt for detection.
export function geometryReader(roots, manifest = {}, packed = '') {
    const sections = new Map(); let section;
    for (const line of packed.split(/\r?\n/)) {
        const file = line.match(/^0 FILE (.+)$/i);
        if(file) {section=[];sections.set(file[1].toLowerCase().replaceAll('\\','/'),section);}
        else if(section) section.push(line);
    }
    const cache = new Map(), portCache = new Map(),readConnectors=connectorReader(sections);
    async function studsFor(file, visiting = new Set()) {
        if(portCache.has(file))return portCache.get(file);
        if(visiting.has(file)||visiting.size>20)return [];
        const next = new Set([...visiting,file]);
        let lines=sections.get(file);
        if(!lines)for(const folder of ['parts','p'])try{lines=(await fs.readFile(path.join('scripts/studforge/.cache/ldraw',folder,file),'utf8')).split(/\r?\n/);break;}catch(e){if(e.code!=='ENOENT')throw e;}
        const result=[];
        for(const line of lines||[]) {
            const tokens=line.trim().split(/\s+/);
            if(tokens[0]!=='1'||tokens.length<15)continue;
            const numbers=tokens.slice(2,14).map(Number),ref=tokens.slice(14).join(' ').toLowerCase().replaceAll('\\','/');
            if(!numbers.every(Number.isFinite))continue;
            const pos=numbers.slice(0,3),matrix=numbers.slice(3);
            if(['stud.dat','stud2.dat'].includes(ref))result.push([...pos,...normalize(mul(matrix,[0,-1,0]))]);
            else if(!/^(?:48\/|8\/)?(?:\d+-\d+|box|rect|tri|stud3|stud4)/.test(ref)) {
                for(const s of await studsFor(ref,next))result.push([...add(pos,mul(matrix,s.slice(0,3))),...normalize(mul(matrix,s.slice(3,6)))]);
            }
        }
        portCache.set(file,result);return result;
    }
    const reader = async (id, partId, name) => {
        if(cache.has(id))return cache.get(id);
        const pending=(async()=>{
        let g;
        for(const root of roots)try{g=JSON.parse(await fs.readFile(path.join(root,id+'.json'),'utf8'));break;}catch(e){if(e.code!=='ENOENT')throw e;}
        if(!g)return {studs:[],sockets:[],bbox:null};
        const bbox=g.bbox||[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
        if(!g.bbox)for(let i=0;i<g.v.length;i+=3)for(let k=0;k<3;k++){bbox[k]=Math.min(bbox[k],g.v[i+k]);bbox[k+3]=Math.max(bbox[k+3],g.v[i+k]);}
        const studs=g.studs || (await studsFor(partId+'.dat')).map(s=>[s[0]/20,-s[1]/20,-s[2]/20,s[3],-s[4],-s[5]]);
        name=String(name||manifest[id]?.name||'').replace(/^[=~_]+\s*/, '');
        // Only plain rectangular undersides; sloped, clipped and Technic receivers
        // need their own connector rules. Bounds alone never create a connection.
        const plain=name.match(/^(Brick|Plate|Tile)\s+(\d+)\s+x\s+(\d+)(?:\s+with .+ Pattern)?$/i);
        const sockets=[];
        const dimensions=plain?[Number(plain[2]),Number(plain[3])].sort((a,b)=>a-b):[];
        const bounds=[bbox[3]-bbox[0],bbox[5]-bbox[2]].sort((a,b)=>a-b);
        if(plain && dimensions.every((v,i)=>Math.abs(v-bounds[i])<.02)) {
            for(let x=bbox[0]+.5;x<bbox[3];x++)for(let z=bbox[2]+.5;z<bbox[5];z++)sockets.push([x,bbox[1],z,0,1,0]);
        } else if(['3937','3680'].includes(partId)) {
            for(const x of [-.5,.5])for(const z of partId==='3680'?[-.5,.5]:[0])sockets.push([x,partId==='3937'?-1.2:-.4,z,0,1,0]);
        } else if(partId==='4150') {
            for(const x of [-.5,.5])for(const z of [-.5,.5])sockets.push([x,-.4,z,0,1,0]);
        }
        if(/^(Hinge (?:Plate|Brick)|Technic Brick)/.test(name))for(const s of studs){
            const socket=[s[0],s[1]-(/Plate/.test(name)?.4:1.2),s[2],0,1,0];
            if(s[4]>.999 && !sockets.some(p=>near(p.slice(0,3),socket.slice(0,3))))sockets.push(socket);
        }
        const connectors=/Technic|Hinge|Peghole/.test(name)?await readConnectors(partId+'.dat'):[];
        // These brick bores are drawn with surface primitives, rather than a
        // connector macro. Their official hole grid is shared by every kit.
        const brickLengths={'6541':1,'3700':2,'3701':4,'3894':6,'3702':8,'2730':10,'32018':14,'3703':16};
        const addPort=port=>{if(!connectors.some(p=>p.kind===port.kind&&near(p.point,port.point)&&parallel(p.axis,port.axis)))connectors.push(port);};
        if(brickLengths[partId]){
            const length=brickLengths[partId],xs=length===1?[0]:Array.from({length:length-1},(_,i)=>i+1-length/2);
            for(const x of xs)addPort({kind:'round',point:[x,-.5,0],axis:[0,0,1]});
        }
        if(partId==='32000')for(const x of [-.5,.5])addPort({kind:'round',point:[x,-.5,0],axis:[0,0,1]});
        if(['59443','6538a','6538b','6538c','6538'].includes(partId))addPort({kind:'keyed',point:[0,0,0],axis:[0,0,1]});
        // Pure shafts have one longitudinal axis. Mixed axle/pins and bent or
        // flexible shafts need segment-specific rules and remain unsupported.
        let shaft;
        const pureShaft=/^Technic Axle\s+\d+(?!.*(?:Pin|Bent|Flexible))/.test(name)||['2780','3673','6558','32002','4274','32054'].includes(partId);
        let unknownShaft;
        if(pureShaft || /^Technic (?:Axle Pin|Pin .*Hole)/.test(name)){
            const spans=[0,1,2].map(i=>bbox[i+3]-bbox[i]),dimension=spans.indexOf(Math.max(...spans));
            if(spans[dimension]>=1 && spans.filter((_,i)=>i!==dimension).every(v=>v<1)){
                const point=[0,0,0],axis=[0,0,0];axis[dimension]=1;
                const rod={kind:/^Technic Axle/.test(name)?'axle':'pin',point,axis,min:bbox[dimension],max:bbox[dimension+3],dimension};
                if(pureShaft){shaft=rod;connectors.length=0;}else unknownShaft=rod;
            }
        }
        return {studs,sockets,bbox,connectors,shaft,unknownShaft,name,gear:/^(?:Technic )?Gear/.test(name)};
        })();
        cache.set(id,pending);return pending;
    };
    return Object.assign(reader,{names:Object.fromEntries(Object.entries(manifest).map(([id,p])=>[id,p.name||'']))});
}

export async function detectMotion(model, readGeometry) {
    const present=new Set(model.bricks.map(b=>model.parts[b[0]][0]));
    if(!rules.some(r=>present.has(r.base)&&r.tops.some(id=>present.has(id))) && !model.parts.some(p=>/Technic|Hinge|Peghole/.test(p[4]?p[2]||'':readGeometry.names?.[p[0]]||'')))return {motion:null,candidates:0,skipped:[]};
    const parts=await Promise.all(model.bricks.map(async(b,index)=>{
        const row=model.parts[b[0]],partId=row[0],geometry=await readGeometry(row[4]||partId,partId,row[4]?row[2]:undefined);
        const matrix=b.slice(5,14),position=b.slice(2,5),world=s=>({point:add(position,mul(matrix,s.slice(0,3))),normal:normalize(mul(matrix,s.slice(3,6)))});
        return {index,partId,matrix,position,sub:model.submodels?.[b[15]]||'main',geometry,studs:geometry.studs.map(world),sockets:geometry.sockets.map(world),ports:(geometry.connectors||[]).map(p=>({...p,point:add(position,mul(matrix,p.point)),axis:normalize(mul(matrix,p.axis))}))};
    }));
    const candidates=[],constraints=[];
    for(const rule of rules)for(const base of parts.filter(p=>p.partId===rule.base)) {
        const pivot=add(base.position,mul(base.matrix,rule.pivot)),axis=normalize(mul(base.matrix,rule.axis));
        const tops=parts.filter(p=>rule.tops.includes(p.partId)&&near(add(p.position,mul(p.matrix,rule.pivot)),pivot)&&parallel(normalize(mul(p.matrix,rule.axis)),axis));
        if(tops.length===1)candidates.push({rule,base,top:tops[0],pivot,axis});
        // Older community models sometimes approximate engaged brick-hinge
        // positions. A nearby half can constrain a leaf without being accurate
        // enough to expose as a joint. Never loosen the playable joint match.
        if(rule.base==='3831')for(const top of parts.filter(p=>rule.tops.includes(p.partId))){
            const point=add(top.position,mul(top.matrix,rule.pivot));
            if(distance(point,pivot)<.35&&parallel(normalize(mul(top.matrix,rule.axis)),axis))constraints.push({base,top,pivot,axis});
        }
    }
    const portRules=[['finger-dual','finger-single','Finger hinge'],['click-dual','click-single','Click hinge']];
    for(const [a,b,label] of portRules)for(const base of parts)for(const port of base.ports.filter(p=>p.kind===a)){
        const matches=parts.filter(top=>top!==base&&top.ports.some(p=>p.kind===b&&near(p.point,port.point)&&parallel(p.axis,port.axis)));
        if(matches.length===1)candidates.push({rule:{label,min:-15,max:15},base,top:matches[0],pivot:port.point,axis:port.axis});
    }
    const shaftMatches=[];
    const uncertainMatches=[];
    for(const shaft of parts.filter(p=>p.geometry.unknownShaft)){
        const s=shaft.geometry.unknownShaft,axis=normalize(mul(shaft.matrix,s.axis));
        for(const bearing of parts)if(bearing!==shaft)for(const hole of bearing.ports.filter(p=>p.kind==='round'||p.kind==='keyed')){
            const along=dot(hole.point.map((v,i)=>v-shaft.position[i]),axis),onAxis=shaft.position.map((v,i)=>v+axis[i]*along);
            if(parallel(axis,hole.axis)&&distance(hole.point,onAxis)<.035&&along>s.min+.04&&along<s.max-.04)uncertainMatches.push({shaft:shaft.index,bearing:bearing.index});
        }
    }
    for(const shaft of parts.filter(p=>p.geometry.shaft)){
        const s=shaft.geometry.shaft,origin=add(shaft.position,mul(shaft.matrix,s.point)),axis=normalize(mul(shaft.matrix,s.axis));
        for(const bearing of parts)if(bearing!==shaft)for(const hole of bearing.ports.filter(p=>p.kind==='round'||p.kind==='keyed')){
            if(!parallel(axis,hole.axis))continue;
            const along=dot(hole.point.map((v,i)=>v-origin[i]),axis),onAxis=origin.map((v,i)=>v+axis[i]*along);
            if(distance(hole.point,onAxis)>.035||along<s.min+.04||along>s.max-.04)continue;
            if(hole.kind==='keyed'&&s.kind!=='axle')continue;
            shaftMatches.push({shaft,bearing,hole,axis});
            if(hole.kind==='round')for(const [base,top] of [[shaft,bearing],[bearing,shaft]])candidates.push({rule:{label:s.kind==='axle'?'Axle pivot':'Pin pivot',min:-15,max:15,single:true,mechanical:true},base,top,pivot:hole.point,axis});
        }
    }
    if(!candidates.length)return {motion:null,candidates:0,skipped:[]};
    const edges=parts.map(()=>new Set()),buckets=new Map();
    // Cross-shaped holes lock to the shaft; circular bearings permit rotation.
    for(const {shaft,bearing,hole} of shaftMatches)if(hole.kind==='keyed'){edges[shaft.index].add(bearing.index);edges[bearing.index].add(shaft.index);}
    const key=p=>p.map(v=>Math.floor(v/.08)).join(',');
    for(const p of parts)for(const socket of p.sockets){const k=key(socket.point);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push({p,socket});}
    for(const p of parts)for(const stud of p.studs){
        const cell=stud.point.map(v=>Math.floor(v/.08));
        for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const {p:q,socket} of buckets.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','))||[]) {
            if(p!==q&&near(stud.point,socket.point)&&dot(stud.normal,socket.normal)>.999){edges[p.index].add(q.index);edges[q.index].add(p.index);}
        }
    }
    const proposals=[],skipped=[];
    for(const candidate of candidates) {
        const {rule,base,top,pivot,axis}=candidate,members=new Set([top.index]),queue=[top.index];
        // A distinct source subassembly supplies parts whose connector type is not
        // yet covered (e.g. a robot's clipped head details). Never absorb its base.
        if(top.sub!=='main' && top.sub!==base.sub && !base.sub.startsWith(top.sub+' - '))for(const p of parts)if(p.sub===top.sub||p.sub.startsWith(top.sub+' - ')){members.add(p.index);queue.push(p.index);}
        for(let k=0;k<queue.length;k++)for(const index of edges[queue[k]])if(!members.has(index)){members.add(index);queue.push(index);}
        let reason;
        if(members.has(base.index))reason='Assembly is locked by another stud connection';
        else if(members.size<2 || (rule.mechanical && [...members].every(i=>parts[i].geometry.shaft)))reason='No attached assembly found';
        else if(members.size>parts.length*.6)reason='Moving side is ambiguous';
        // Multiple bearings may support one rigid leaf only when coaxial. Nested
        // mechanisms need a hierarchy of joints, which the current poser lacks.
        else if([...candidates,...constraints].some(c=>c!==candidate && members.has(c.top.index)!==members.has(c.base.index) && !coaxial(c,candidate)))reason='Multiple axes constrain the same assembly';
        else if(rule.mechanical && [...members].some(i=>parts[i].geometry.gear))reason='Geared assemblies need linked gear-motion support';
        else if(rule.mechanical && uncertainMatches.some(c=>members.has(c.shaft)!==members.has(c.bearing)))reason='A mixed axle/pin connection crosses the moving boundary';
        // Do not silently leave an unknown receiver attached to a moving stud.
        if(!reason)for(const index of members){const p=parts[index];for(const stud of p.studs){for(const q of parts){
            if(members.has(q.index)||q.index===base.index||mechanical.has(q.partId)||q.ports.length||q.geometry.sockets.length||!q.geometry.bbox)continue;
            const local=inversePoint(q,stud.point),box=q.geometry.bbox;
            if(Math.abs(local[1]-box[1])<.035 && local[0]>box[0]+.1 && local[0]<box[3]-.1 && local[2]>box[2]+.1 && local[2]<box[5]-.1 && dot(stud.normal,normalize(mul(q.matrix,[0,1,0])))>.999){reason='Attached receiver uses an unsupported connector';break;}
        }if(reason)break;}if(reason)break;}
        if(reason){skipped.push({base:base.index,top:top.index,reason});continue;}
        proposals.push({rule,base:base.index,top:top.index,pivot:pivot.map(round),axis:axis.map(round),factor:1,members:[...members].sort((a,b)=>a-b)});
    }
    const unique=proposals.filter((p,i)=>!proposals.slice(0,i).some(q=>coaxial(p,q)&&p.members.length===q.members.length&&p.members.every((m,k)=>m===q.members[k])));
    const independent=unique.filter((p,i)=>!unique.some((q,j)=>i!==j&&p.members.some(m=>q.members.includes(m))));
    const oriented=independent.filter(p=>!independent.some(q=>p!==q && p.members.includes(q.base) && q.members.includes(p.base) && q.members.length<=p.members.length));
    const safe=oriented.filter(p=>!oriented.some(q=>p!==q&&q.members.includes(p.base)));
    for(const p of unique)if(!safe.includes(p))skipped.push({base:p.base,top:p.top,reason:'Moving groups overlap; a joint hierarchy is required'});
    const controls=safe.map((p,i)=>({id:'joint-'+(i+1),label:p.rule.label+' '+(i+1),min:p.rule.min,max:p.rule.max,joints:[{pivot:p.pivot,axis:p.axis,factor:p.factor,members:p.members}],connectors:{base:p.base,top:p.top}}));
    const bricks=model.bricks.map(b=>({partId:model.parts[b[0]][0],x:b[2],y:b[3],z:b[4],matrix:b.slice(5,14),layer:b[14],geometryId:model.parts[b[0]][4]}));
    return {motion:controls.length?{detector:'connectors-v2',fingerprint:fingerprint(bricks),lift:0,controls}:null,candidates:candidates.length,skipped};
}
