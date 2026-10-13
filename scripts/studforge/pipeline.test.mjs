import test from 'node:test';
import assert from 'node:assert/strict';
import {packModel,validateBundle,countBundleTriangles,parseSetPage,parseRanking} from './pipeline-core.mjs';
const placement = ref => `1 4 0 0 0 1 0 0 0 1 0 0 0 1 ${ref}`;
const licensed = body => `0 Test\n0 !LICENSE Redistributable under CCAL version 2.0 : see CAreadme.txt\n${body}`;
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
