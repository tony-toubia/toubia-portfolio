// Reproducible, opt-in import of community LDraw models; no credentials needed.
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('public/studforge');
const cacheRoot = path.resolve('scripts/studforge/.cache');
if (process.argv.includes('--download-parts')) {
  await fs.mkdir(cacheRoot, {recursive:true});
  const response = await fetch('https://library.ldraw.org/library/updates/complete.zip');
  if (!response.ok) throw new Error(`Part library download: ${response.status}`);
  await fs.writeFile(`${cacheRoot}/complete.zip`, Buffer.from(await response.arrayBuffer()));
  console.log('Downloaded official parts archive. Extract it into scripts/studforge/.cache before importing.');
  process.exit(0);
}
await fs.mkdir(`${root}/vendor`, {recursive:true});
await fs.mkdir(`${root}/models`, {recursive:true});
const downloads = [
  ['https://unpkg.com/three@0.169.0/build/three.module.js', 'vendor/three.module.js'],
  ['https://raw.githubusercontent.com/mrdoob/three.js/r169/examples/jsm/loaders/LDrawLoader.js','vendor/LDrawLoader.js'],
  ['https://raw.githubusercontent.com/mrdoob/three.js/r169/LICENSE','vendor/THREE-LICENSE.txt'],
  ['https://library.ldraw.org/library/official/LDConfig.ldr','models/LDConfig.ldr'],
];
for (const [url, destination] of downloads) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  let text = await response.text();
  if (destination.endsWith('LDrawLoader.js')) text = text.replace("from 'three'", "from './three.module.js'");
  await fs.writeFile(`${root}/${destination}`, text);
  console.log(destination, text.length);
}
const selection = [
  [510,'Marvel','Iron Man',Math.PI],[509,'Marvel','Captain America',Math.PI],[511,'Marvel','Black Widow',Math.PI],
  [512,'Marvel','The Hulk',Math.PI],[1262,'Marvel','Thanos'],[1263,'Marvel','Star-Lord'],
  [1284,'Star Wars','The Mandalorian & The Child'],[1259,'Star Wars','Rey'],
  [1260,'Star Wars','Kylo Ren'],[1266,'Star Wars','Chewbacca'],[1275,'Star Wars','Stormtrooper'],
  [949,'Star Wars','Boba Fett & Han Solo in Carbonite',Math.PI],[477,'DC','Batman',Math.PI],
  [1256,'DC','Wonder Woman'],[1271,'Harry Potter','Harry Potter & Hedwig'],[1277,'Disney','Mickey Mouse'],
];
const decode = text => text.replaceAll('&amp;', '&').replaceAll('&#039;', "'").replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const normalize = name => name.trim().replaceAll('\\', '/').toLowerCase();
const refs = text => [...text.matchAll(/^1\s+\S+(?:\s+[-+\d.eE]+){12}\s+(.+)$/gm)].map(m=>normalize(m[1]));
const cache = new Map();
async function getPart(name) {
  if (!/^[a-z0-9_ .\-/]+\.dat$/i.test(name) || name.includes('..')) throw new Error(`Invalid part path: ${name}`);
  if (cache.has(name)) return cache.get(name);
  const promise = (async () => {
    const folders = name.startsWith('s/') ? ['parts'] : name.startsWith('48/') || name.startsWith('8/') ? ['p'] : ['parts','p'];
    for (const folder of folders) {
      const url = `https://library.ldraw.org/library/official/${folder}/${name}`;
      let data;
      try { data = await fs.readFile(`${cacheRoot}/ldraw/${folder}/${name}`, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (data) {
        if (!data.startsWith('0 ') || !/!LICENSE/.test(data)) throw new Error(`Missing license: ${url}`);
        return data;
      }
    }
    throw new Error(`Part unavailable in official library: ${name}`);
  })();
  cache.set(name, promise);
  return promise;
}
const catalog = [];
const partInfo = {};
for (const [omrId, category, name, frontAngle = 0] of selection) {
  const sourceUrl = `https://library.ldraw.org/omr/sets/${omrId}`;
  const detail = await (await fetch(sourceUrl)).text();
  const modelUrl = [...detail.matchAll(/href="([^"]+\/library\/omr\/[^"?#]+\.mpd)"/g)][0]?.[1];
  if (!modelUrl) throw new Error(`No downloadable file: ${sourceUrl}`);
  const original = await (await fetch(modelUrl)).text();
  const sourceName = original.match(/^0 FILE .+\r?\n0 (.+)$/m)?.[1]?.trim();
  if (sourceName.toLowerCase().replaceAll(' and ', ' & ') !== name.toLowerCase()) throw new Error(`Catalog/model mismatch: expected ${name}, downloaded ${sourceName} at ${sourceUrl}`);
  const setNumber = modelUrl.match(/(\d+-\d+)\.mpd$/)[1];
  const localFiles = new Set([...original.matchAll(/^0 FILE (.+)$/gm)].map(m=>normalize(m[1])));
  const dependencies = new Map();
  async function collect(text) {
    await Promise.all([...new Set(refs(text))].map(async ref => {
      if (localFiles.has(ref) || dependencies.has(ref)) return;
      dependencies.set(ref, null);
      const data = await getPart(ref);
      dependencies.set(ref, data);
      await collect(data);
    }));
  }
  await collect(original);
  const normalizedOriginal = original.replace(/^0 FILE (.+)$/gm, (_, ref) => `0 FILE ${normalize(ref)}`);
  const packed = `${normalizedOriginal.trim()}\n${[...dependencies].map(([ref,data])=>`0 FILE ${ref}\n${data.trim()}`).join('\n')}\n`;
  await fs.writeFile(`${root}/models/${setNumber}.mpd`, packed);
  for (const [ref,data] of dependencies) partInfo[ref] = {name:data.split(/\r?\n/)[0].slice(2).trim(), license:data.match(/^0 !LICENSE (.+)$/m)?.[1]?.trim()};
  for (const match of original.matchAll(/^0 FILE (.+)\r?\n([\s\S]*?)(?=^0 FILE |$(?![\s\S]))/gm)) {
    if (/!LDRAW_ORG (?:Unofficial_)?Part\b/.test(match[2])) partInfo[normalize(match[1])] = {name:match[2].split(/\r?\n/)[0].slice(2).trim(), license:match[2].match(/^0 !LICENSE (.+)$/m)?.[1]?.trim()};
  }
  const plain = decode(detail.replace(/<[^>]+>/g, ' ').replace(/\s+/g,' '));
  const missing = ['Parts','Patterns','Stickers'].filter(kind=>new RegExp(`Missing ${kind} Yes`).test(plain));
  catalog.push({id:`set-${setNumber}`,setNumber,name,category,frontAngle,icon:category==='Star Wars'?'🌌':category==='Marvel'?'🦸':'🧱',
    format:'ldraw',modelUrl:`models/${setNumber}.mpd`,thumbnail:`thumbnails/${setNumber}.png`,
    description:`${category} BrickHeadz • Community recreation of set ${setNumber.split('-')[0]}.`,
    sourceUrl,originalUrl:modelUrl,author:original.match(/^0 Author: (.+)$/m)?.[1]?.trim(),
    license:original.match(/^0 !LICENSE (.+)$/m)?.[1]?.trim(),missing,
    instructionsUrl:`https://www.lego.com/en-us/service/building-instructions/${setNumber.split('-')[0]}`});
  console.log(setNumber, name, dependencies.size, 'dependency files', Math.round(packed.length/1024), 'KB');
}
await fs.writeFile(`${root}/models/catalog.json`, JSON.stringify(catalog,null,2)+'\n');
for (const part of Object.values(partInfo)) {
  const alias = part.name.match(/^~Moved to (\S+)/)?.[1];
  if (alias && partInfo[`${alias.toLowerCase()}.dat`]) part.name = partInfo[`${alias.toLowerCase()}.dat`].name;
}
await fs.writeFile(`${root}/models/parts.json`, JSON.stringify(partInfo)+'\n');
for (const name of ['CAreadme.txt','CAlicense.txt','CAlicense4.txt']) await fs.copyFile(`${cacheRoot}/ldraw/${name}`, `${root}/models/${name}`);
console.log(`Imported ${catalog.length} models; ${cache.size} shared part definitions.`);
