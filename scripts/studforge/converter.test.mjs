import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {convertModel} from './convert-model.mjs';

test('normal parts and community-modeled flexible components both survive conversion', async()=>{
    const cache=path.resolve('scripts/studforge/.cache');
    await fs.mkdir(cache,{recursive:true});
    const output=await fs.mkdtemp(path.join(cache,'converter-test-'));
    const license='Redistributable under CCAL version 2.0 : see CAreadme.txt';
    const header=(file,type)=>`0 FILE ${file}\n0 ${file}\n0 !LDRAW_ORG ${type}\n0 !LICENSE ${license}\n0 BFC CERTIFY CCW\n`;
    const faces='3 16 0 0 0 10 0 0 0 10 0\n3 16 0 0 0 0 0 10 10 0 0\n3 16 0 0 0 0 10 0 0 0 10\n3 16 10 0 0 0 0 10 0 10 0\n';
    const text=header('main.ldr','Model')+faces+'1 4 0 0 0 1 0 0 0 1 0 0 0 1 part.dat\n1 0 20 0 0 1 0 0 0 1 0 0 0 1 flexible.ldr\n'+header('part.dat','Part')+faces+header('flexible.ldr','Model')+faces;
    try{
        const result=await convertModel({entry:{setNumber:'fixture-1',name:'Fixture',category:'Test',license,missing:[]},text,config:await fs.readFile('public/studforge/models/LDConfig.ldr','utf8'),metadata:{},outputRoot:output});
        assert.equal(result.pieceCount,1);
        assert.equal(result.model.stats.triangles,12);
        assert.equal(result.model.bricks.length,3);
        assert.equal(result.model.stats.visualComponents,2);
        assert.ok(result.model.parts.some(row=>row[0]==='flexible.ldr'));
        assert.equal(result.model.parts.find(row=>row[0]==='flexible.ldr')[3],'segment');
        assert.ok((await fs.stat(path.join(output,'thumbnails/fixture-1.png'))).size>100);
    }finally{
        assert.ok(path.resolve(output).startsWith(cache+path.sep));
        await fs.rm(output,{recursive:true,force:true});
    }
});
