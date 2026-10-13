import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {publishFile} from './publish-file.mjs';
import {packModel,optimizeBundle,validateBundle,countBundleTriangles,parseSetPage,parseRanking,selectQueuedSets} from './pipeline-core.mjs';
const placement = ref => `1 4 0 0 0 1 0 0 0 1 0 0 0 1 ${ref}`;
const licensed = body => `0 Test\n0 !LICENSE Redistributable under CCAL version 2.0 : see CAreadme.txt\n${body}`;

test('personal queue selections preserve requested order and never import unselected entries',()=>{
    const pending=[{setNumber:'75969-1'},{setNumber:'21319-1'},{setNumber:'40433-1'}];
    assert.deepEqual(selectQueuedSets(pending,['40433-1','21319-1']),['40433-1','21319-1']);
    assert.deepEqual(selectQueuedSets(pending),['75969-1','21319-1','40433-1']);
    assert.throws(()=>selectQueuedSets(pending,['99999-1']),/not pending/);
    assert.throws(()=>selectQueuedSets([{setNumber:'invalid'}]),/Invalid/);
});
test('bundling resolves nested references, preserves licenses, and deduplicates files', async () => {
    const reads=[];
    const result=await packModel(licensed(`${placement('3001.dat')}\n${placement('3001.dat')}`),'test.ldr',async ref=>{
        reads.push(ref);return licensed(ref==='3001.dat'?`0 !LDRAW_ORG Part\n${placement('s/detail.dat')}`:'0 !LDRAW_ORG Subpart\n3 16 0 0 0 1 0 0 0 1 0');
    });
    assert.deepEqual(reads,['3001.dat','s/detail.dat']);
    assert.equal(validateBundle(result.packed),3);
    assert.ok(result.metadata['3001.dat']);
});
test('unsafe paths, missing files, malformed placements and unlicensed models fail closed', async () => {
    await assert.rejects(packModel(licensed(placement('../private.dat')),'test.ldr',()=>assert.fail('must not read')),/Unsafe/);
    await assert.rejects(packModel(licensed(placement('missing.dat')),'test.ldr',()=>{throw new Error('missing dependency');}),/missing dependency/);
    await assert.rejects(packModel('0 Unlicensed model','test.ldr',()=>{}),/license/);
    assert.throws(()=>validateBundle(licensed('0 FILE test.ldr\n1 4 NaN 0 0 1 0 0 0 1 0 0 0 1 3001.dat')),/Malformed/);
});
test('community omissions attach to their own download, rather than leaking across models', () => {
    const html='Author: Alice Missing Parts No Missing Patterns Yes Missing Stickers No <a href="https://library.ldraw.org/library/omr/a.mpd">Download</a> Author: Bob Missing Parts Yes Missing Patterns No Missing Stickers Yes <a href="https://library.ldraw.org/library/omr/b.ldr">Download</a>';
    const models=parseSetPage(html);
    assert.deepEqual(models.map(m=>m.missing),[['Patterns'],['Parts','Stickers']]);
    assert.equal(models[1].author,'Bob');
    assert.throws(()=>parseSetPage('<a href="https://library.ldraw.org/library/omr/a.mpd">Download</a>'),/flags/);
});
test('ranking imports exactly identified targets and rejects source format drift', () => {
    const rows=Array.from({length:100},(_,i)=>({set_num:`${10000+i}-1`,set_name:`Set ${i}`,average_rating:'8',total_votes:'20'}));
    assert.equal(parseRanking(`const hofSets = ${JSON.stringify(rows)};`)[99].rank,100);
    assert.throws(()=>parseRanking('changed page'),/format changed/);
    assert.throws(()=>parseRanking('const hofSets = [];'),/100/);
});

test('preflight counts repeated nested geometry and rejects cyclic models before loading',()=>{
    const text=`0 FILE main.ldr\n${placement('part.dat')}\n${placement('part.dat')}\n0 FILE part.dat\n3 16 0 0 0 1 0 0 0 1 0\n4 16 0 0 0 1 0 0 1 1 0 0 1 0`;
    assert.equal(countBundleTriangles(text),6);
    assert.throws(()=>countBundleTriangles(`0 FILE cycle.ldr\n${placement('cycle.ldr')}`),/Cyclic/);
});

test('interactive optimization substitutes licensed primitives while retaining physical parts and full source',async()=>{
    const face='3 16 0 0 0 1 0 0 0 1 0\n';
    const files={'part.dat':licensed('0 !LDRAW_ORG Part\n'+placement('curve.dat')),'curve.dat':licensed('0 !LDRAW_ORG Primitive\n'+face.repeat(8)),'8/curve.dat':licensed('0 !LDRAW_ORG 8_Primitive\n'+face.repeat(4))};
    const read=async ref=>{if(!files[ref])throw Object.assign(new Error('missing'),{code:'ENOENT'});return files[ref];};
    const full=await packModel(licensed(placement('part.dat')),'main.ldr',read);
    const reduced=await optimizeBundle(full,read);
    assert.equal(countBundleTriangles(full.packed),8);
    assert.equal(countBundleTriangles(reduced.packed),4);
    assert.equal(reduced.replacements,1);
    assert.ok(reduced.metadata['part.dat']);
    assert.ok(reduced.packed.includes('CCAL version 2.0'));
    assert.equal(validateBundle(reduced.packed),3);
});

test('catalog publication keeps complete JSON visible to concurrent readers',async()=>{
    const cache=path.resolve('scripts/studforge/.cache');await fs.mkdir(cache,{recursive:true});
    const directory=await fs.mkdtemp(path.join(cache,'publication-test-')),file=path.join(directory,'index.json');
    try {
        await publishFile(file,JSON.stringify({revision:0,payload:'x'.repeat(50000)}));
        await Promise.all([
            (async()=>{for(let revision=1;revision<=12;revision++)await publishFile(file,JSON.stringify({revision,payload:'x'.repeat(50000)}));})(),
            (async()=>{for(let read=0;read<40;read++){const value=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(value.payload.length,50000);assert.ok(Number.isInteger(value.revision));}})(),
        ]);
        assert.equal(JSON.parse(await fs.readFile(file,'utf8')).revision,12);
        assert.deepEqual(await fs.readdir(directory),['index.json']);
    } finally {assert.ok(directory.startsWith(cache+path.sep));await fs.rm(directory,{recursive:true,force:true});}
});
