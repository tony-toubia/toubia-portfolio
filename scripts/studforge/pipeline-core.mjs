// Public community files are data: parse their references, never execute their contents.
export const normalize = value => value.trim().replaceAll('\\', '/').toLowerCase();
export const references = text => [...text.matchAll(/^1\s+\S+(?:\s+[-+\d.eE]+){12}\s+(.+)$/gm)].map(m => normalize(m[1]));
export const decode = value => value.replace(/&(?:amp|quot|lt|gt);|&#0?39;/g, entity => ({'&amp;':'&','&quot;':'"','&lt;':'<','&gt;':'>','&#39;':"'",'&#039;':"'"}[entity]));
export const plain = html => decode(html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
export function selectQueuedSets(pending, requested=[]) {
    if(!Array.isArray(pending))throw new Error('Queue must contain a pending array');
    const numbers=pending.map(row=>typeof row==='string'?row:row?.setNumber);
    if(numbers.some(number=>!/^\d+-\d+$/.test(number)))throw new Error('Invalid queued set number');
    const unknown=requested.filter(number=>!numbers.includes(number));
    if(unknown.length)throw new Error(`Selected sets are not pending in the queue: ${unknown.join(', ')}`);
    return [...new Set(requested.length ? requested : numbers)];
}
export function parseSetPage(html) {
    const result = []; let last = 0;
    for (const match of html.matchAll(/href="(https:\/\/library\.ldraw\.org\/library\/omr\/[^"?#]+\.(?:mpd|ldr))"/gi)) {
        const text = plain(html.slice(last, match.index)); last = match.index + match[0].length;
        const flags = text.match(/Author:\s*(.*?)\s*Missing Parts\s*(Yes|No)\s*Missing Patterns\s*(Yes|No)\s*Missing Stickers\s*(Yes|No)/i);
        if (!flags) throw new Error('Community completeness flags could not be read');
        if (!result.some(item => item.url === decode(match[1]))) result.push({url:decode(match[1]),author:flags[1],missing:['Parts','Patterns','Stickers'].filter((_,i) => flags[i+2] === 'Yes')});
    }
    return result;
}
export function validateBundle(text) {
    if (references(text).length !== [...text.matchAll(/^1\s/gm)].length) throw new Error('Malformed part placement record');
    const files = new Set([...text.matchAll(/^0 FILE (.+)$/gm)].map(m => normalize(m[1])));
    const missing = [...new Set(references(text).filter(ref => !files.has(ref)))];
    if (missing.length) throw new Error(`Unresolved files: ${missing.join(', ')}`);
    if (!/^0 !LICENSE .+/m.test(text)) throw new Error('No redistribution license');
    return files.size;
}
export function countBundleTriangles(text) {
    const files=new Map([...text.matchAll(/^0 FILE (.+)\r?\n([\s\S]*?)(?=^0 FILE |$(?![\s\S]))/gm)].map(match=>[normalize(match[1]),match[2]]));
    const memo=new Map(),active=new Set();
    function count(name){
        if(memo.has(name))return memo.get(name);
        if(active.has(name))throw new Error(`Cyclic model reference: ${name}`);
        const body=files.get(name);if(body==null)throw new Error(`Unresolved file: ${name}`);
        active.add(name);
        let triangles=[...body.matchAll(/^3\s/gm)].length+2*[...body.matchAll(/^4\s/gm)].length;
        for(const ref of references(body))triangles+=count(ref);
        active.delete(name);memo.set(name,triangles);return triangles;
    }
    return count(files.keys().next().value);
}
export const isVisualSegment = name => /^~.*\b(segment|section)\b|^~?lsynth/i.test(name || '');
// A generated cable endpoint can collapse to a line or point. It has no surface
// area, but Three's matrix decomposition would produce NaNs for its zero axes.
// Keep the full archived source and remove only these invisible visual references.
export function prepareVisualReferences(text, metadata) {
    let degenerateVisualSegments=0;
    const prepared=text.replace(/^1\s+\S+(?:\s+[-+\d.eE]+){12}\s+(.+)$/gm,(line,ref)=>{
        if(!isVisualSegment(metadata[normalize(ref)]?.name))return line;
        const n=line.trim().split(/\s+/).slice(5,14).map(Number);
        if(n.length!==9||n.some(value=>!Number.isFinite(value)))return line;
        const columns=[[n[0],n[3],n[6]],[n[1],n[4],n[7]],[n[2],n[5],n[8]]];
        const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
        if([[0,1],[0,2],[1,2]].every(([a,b])=>cross(columns[a],columns[b]).every(value=>value===0))) {
            degenerateVisualSegments++;
            return '0 // Zero-area generated visual segment retained in archived source';
        }
        return line;
    });
    return {text:prepared,degenerateVisualSegments};
}
// Obsolete blended colors use the original ldraw.exe palette, as specified by LDraw.
// Official/current definitions always take precedence over the legacy number range.
export function completeLegacyColors(config, text) {
    const defined=new Set([...`${config}\n${text}`.matchAll(/^0\s+!COLOUR\s+.*?\bCODE\s+(\d+)\b/gm)].map(match=>Number(match[1])));
    const original=[[51,51,51],[0,51,178],[0,127,51],[0,181,166],[204,0,0],[255,51,153],[102,51,0],[153,153,153],[102,102,88],[0,128,255],[51,255,102],[171,253,249],[255,0,0],[255,176,204],[255,229,0],[255,255,255]];
    const used=new Set([...text.matchAll(/^[134]\s+(\d+)\s/gm)].map(match=>Number(match[1])));
    const additions=[];
    for(const code of used)if(code>=256&&code<=511&&!defined.has(code)) {
        const a=Math.floor((code-256)/16),b=(code-256)%16;
        const hex=original[a].map((value,i)=>Math.round((value+original[b][i])/2).toString(16).padStart(2,'0')).join('').toUpperCase();
        additions.push(`0 !COLOUR Legacy_Blend_${a}_${b} CODE ${code} VALUE #${hex} EDGE #333333`);
    }
    return {config:config+'\n'+additions.join('\n')+'\n',legacyColors:additions.length};
}
// Use official lower-resolution equivalents only for primitives, never replace a part.
// The archived packed model remains the full source; this bundle is for interactive baking.
export async function optimizeBundle(bundle, readPart) {
    let replacements=0;
    const sections=[];
    for(const match of bundle.packed.matchAll(/^0 FILE (.+)\r?\n([\s\S]*?)(?=^0 FILE |$(?![\s\S]))/gm)) {
        const name=normalize(match[1]);let body=match[2];
        if(/!LDRAW_ORG (?:48_)?Primitive\b/.test(body)) {
            const base=name.replace(/^48\//,'');
            for(const candidate of [...new Set([`8/${base}`,base])]) {
                if(candidate===name)continue;
                try {
                    const data=await readPart(candidate);
                    if(!/!LDRAW_ORG (?:8_)?Primitive\b/.test(data))continue;
                    body=`0 // Interactive geometry uses official ${candidate}\n${data}`;replacements++;break;
                } catch(error) { if(error.code!=='ENOENT')throw error; }
            }
        }
        sections.push(`0 FILE ${name}\n${body.trim()}`);
    }
    const optimized=await packModel(sections.join('\n')+'\n','interactive.ldr',readPart);
    return {...optimized,replacements};
}
export async function packModel(original, mainName, readPart) {
    const license = original.match(/^0 !LICENSE (.+)$/m)?.[1]?.trim();
    if (!license || !/CCAL version (?:2\.0|4\.0)|CC BY (?:2\.0|4\.0)/i.test(license)) throw new Error('Unsupported or missing redistribution license');
    if (!/^0 FILE /m.test(original)) original = `0 FILE ${mainName}\n${original}`;
    const embedded = new Set([...original.matchAll(/^0 FILE (.+)$/gm)].map(m => normalize(m[1])));
    const dependencies = new Map(), metadata = {};
    async function collect(text) {
        for (const ref of new Set(references(text))) {
            if (embedded.has(ref) || dependencies.has(ref)) continue;
            if (!/^[a-z0-9_ .\-/]+\.dat$/i.test(ref) || ref.split('/').includes('..') || ref.startsWith('/')) throw new Error(`Unsafe part reference: ${ref}`);
            dependencies.set(ref, null);
            const data = await readPart(ref);
            if (!/^0 !LICENSE .*?(?:CCAL version (?:2\.0|4\.0)|CC BY (?:2\.0|4\.0))/m.test(data)) throw new Error(`Part redistribution license missing or unsupported: ${ref}`);
            dependencies.set(ref, data); await collect(data);
        }
    }
    await collect(original);
    const packed = `${original.replace(/^0 FILE (.+)$/gm, (_,name) => `0 FILE ${normalize(name)}`).trim()}\n${[...dependencies].map(([ref,data]) => `0 FILE ${ref}\n${data.trim()}`).join('\n')}\n`.replace(/[ \t]+(?=\r?$)/gm,'');
    validateBundle(packed);
    for (const match of packed.matchAll(/^0 FILE (.+)\r?\n([\s\S]*?)(?=^0 FILE |$(?![\s\S]))/gm)) {
        if (/!LDRAW_ORG (?:Unofficial_)?Part\b/.test(match[2]) || /^(?:3|4)\s/m.test(match[2]) && /!LDRAW_ORG (?:Unofficial_)?Model\b/.test(match[2])) metadata[normalize(match[1])] = {name:match[2].split(/\r?\n/)[0].slice(2).trim(),license:match[2].match(/^0 !LICENSE (.+)$/m)?.[1]?.trim() || license};
    }
    for (const value of Object.values(metadata)) {
        const alias = value.name.match(/^~Moved to (\S+)/)?.[1];
        if (alias && metadata[`${alias.toLowerCase()}.dat`]) value.name = metadata[`${alias.toLowerCase()}.dat`].name;
    }
    return {packed, metadata, license, author:original.match(/^0 Author: (.+)$/m)?.[1]?.trim()};
}
export function parseRanking(html) {
    const match = html.match(/const hofSets = (\[.*?\]);/s);
    if (!match) throw new Error('Ranking format changed; review required');
    const rows = JSON.parse(match[1]);
    if (rows.length !== 100 || rows.some(row => !/^[\w-]+$/.test(row.set_num) || !row.set_name)) throw new Error('Expected 100 identified sets');
    return rows.map((row,i) => ({rank:i+1,setNumber:row.set_num,name:row.set_name,theme:row.theme_name,year:Number(row.year),rating:Number(row.average_rating),votes:Number(row.total_votes),sourceUrl:row.url}));
}
