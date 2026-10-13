import fs from 'node:fs/promises';
import {transform3} from '../ldraw/moved-frame.mjs';
// Connector coordinates come from the official LDraw primitives. Stop at the
// connector macro: descending into its surface cylinders would invent joints.
export const connectorPrimitives = {
 'h1.dat':{kind:'finger-dual',point:[0,10,0],axis:[0,0,1]},
 'h2.dat':{kind:'finger-single',point:[0,10,0],axis:[0,0,1]},
 'clh4.dat':{kind:'click-dual',point:[0,0,4],axis:[1,0,0]},
 'clh5.dat':{kind:'click-dual',point:[0,0,10],axis:[1,0,0]},
 'clh6.dat':{kind:'click-single',point:[0,0,-10],axis:[1,0,0]},
 'clh2.dat':{kind:'click-single',point:[0,0,-7],axis:[1,0,0]},
 'connhole.dat':{kind:'round',point:[0,0,0],axis:[0,1,0]},
 'axlehol5.dat':{kind:'keyed',point:[0,.5,0],axis:[0,1,0]},
 'axlehol4.dat':{kind:'keyed',point:[0,.5,0],axis:[0,1,0]},
 'axlehol2.dat':{kind:'keyed',point:[0,0,0],axis:[0,1,0]},
};
const normalize=v=>v.map(x=>x/Math.hypot(...v));
export function connectorReader(sections=new Map()){
 const cache=new Map();
 async function read(file,ancestors=[]){
  if(ancestors.includes(file)||ancestors.length>20)return [];
  if(cache.has(file))return cache.get(file);
  const pending=(async()=>{
   let lines=sections.get(file);
   if(!lines)for(const folder of ['parts','p'])try{lines=(await fs.readFile(`scripts/studforge/.cache/ldraw/${folder}/${file}`,'utf8')).split(/\r?\n/);break;}catch(e){if(e.code!=='ENOENT')throw e;}
   const ports=[];
   for(const line of lines||[]){
    const t=line.trim().split(/\s+/);if(t[0]!=='1'||t.length<15)continue;
    const numbers=t.slice(2,14).map(Number),ref=t.slice(14).join(' ').toLowerCase().replaceAll('\\','/');
    if(!numbers.every(Number.isFinite))continue;
    const matrix=numbers.slice(3),position=numbers.slice(0,3),primitive=connectorPrimitives[ref];
    const children=primitive?[primitive]:/^(?:48\/|8\/)?(?:\d+-\d+|box|rect|tri|stud|axleend|axlehol|confric|connect)/.test(ref)?[]:await read(ref,[...ancestors,file]);
    for(const port of children){
     const point=transform3(matrix,port.point).map((v,i)=>v+position[i]),axis=normalize(transform3(matrix,port.axis));
     if(!ports.some(p=>p.kind===port.kind&&Math.hypot(...p.point.map((v,i)=>v-point[i]))<.01&&Math.abs(p.axis.reduce((s,v,i)=>s+v*axis[i],0))>.999))ports.push({...port,point,axis});
    }
   }
   return ports;
  })();cache.set(file,pending);return pending;
 }
 return async file=>(await read(file)).map(p=>({...p,point:[p.point[0]/20,-p.point[1]/20,-p.point[2]/20],axis:[p.axis[0],-p.axis[1],-p.axis[2]]}));
}
