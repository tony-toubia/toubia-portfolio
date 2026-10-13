import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(await fs.readFile('public/studforge/js/library-core.js','utf8'),context);
const core=context.StudForgeLibrary;
const plain=value=>JSON.parse(JSON.stringify(value));
test('search combines theme, set number, words and favorites',()=>{
 const models=[{id:'a',name:'Iron Man',category:'Marvel',setNumber:'41590-1'},{id:'b',name:'Rey',category:'Star Wars',setNumber:'41602-1'}];
 assert.deepEqual(plain(core.filterModels(models,'IRON Marvel','Marvel',true,['a'])),[models[0]]);
 assert.equal(core.filterModels(models,'41602','',false,[])[0].id,'b');
 assert.equal(core.filterModels(models,'iron','Star Wars',false,[]).length,0);
});
test('inventory keeps colors and printed parts distinct and counts quantities',()=>{
 const parts=core.inventory([{partId:'tile',color:'0'},{partId:'tile',color:'0'},{partId:'tile',color:'4'},{partId:'printed-tile',color:'0'}]);
 assert.equal(parts.length,3);assert.equal(parts[0].quantity,2);
 assert.equal(parts.reduce((sum,part)=>sum+part.quantity,0),4);
});
test('saved progress and favorites survive reload; corrupt or blocked storage is safe',()=>{
 let data='';const storage={getItem:()=>data,setItem:(_,value)=>data=value};
 const state={favorites:['a'],progress:{a:{step:12,checks:['12|tile|0'],inspecting:true}},lastModel:'a'};
 assert.equal(core.saveState(storage,state),true);assert.deepEqual(plain(core.readState(storage)),state);
 data='{broken';assert.equal(core.readState(storage).favorites.length,0);
 assert.equal(core.saveState(null,state),false);assert.equal(core.readState(null).lastModel,null);
 data=JSON.stringify({favorites:['a',3],progress:[],lastModel:4});assert.deepEqual(plain(core.readState(storage)),{favorites:['a'],progress:{},lastModel:null});
});
test('resume clamps stale steps and rejects malformed values',()=>{
 assert.equal(core.resumeStep(200,10),10);assert.equal(core.resumeStep(-1,10),0);
 for(const invalid of [null,'2',1.5,NaN])assert.equal(core.resumeStep(invalid,10),null);
});
