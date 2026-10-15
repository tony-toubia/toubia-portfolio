import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const context=vm.createContext({URLSearchParams});
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
 const parts=core.inventory([{partId:'tile',color:'0'},{partId:'tile',color:'0'},{partId:'tile',color:'4'},{partId:'printed-tile',color:'0'},{partId:'rope.ldr',color:'0',segment:true}]);
 assert.equal(parts.length,3);assert.equal(parts[0].quantity,2);
 assert.equal(parts.reduce((sum,part)=>sum+part.quantity,0),4);
});
test('saved progress and favorites survive reload; corrupt or blocked storage is safe',()=>{
 let data='';const storage={getItem:()=>data,setItem:(_,value)=>data=value};
 const state={favorites:['a'],progress:{a:{step:12,checks:['12|tile|0'],inspecting:true}},lastModel:'a'};
 assert.equal(core.saveState(storage,state),true);assert.deepEqual(plain(core.readState(storage)),state);
 data='{broken';assert.equal(core.readState(storage).favorites.length,0);
 assert.equal(core.saveState(null,state),false);assert.equal(core.readState(null).lastModel,null);
 const blocked={getItem:()=>{throw new Error('Storage blocked');},setItem:()=>{throw new Error('Storage blocked');}};
 assert.equal(core.readState(blocked).lastModel,null);assert.equal(core.saveState(blocked,state),false);
 data=JSON.stringify({favorites:['a',3],progress:[],lastModel:4});assert.deepEqual(plain(core.readState(storage)),{favorites:['a'],progress:{},lastModel:null});
});
test('resume clamps stale steps and rejects malformed values',()=>{
 assert.equal(core.resumeStep(200,10),10);assert.equal(core.resumeStep(-1,10),0);
 for(const invalid of [null,'2',1.5,NaN])assert.equal(core.resumeStep(invalid,10),null);
});
test('one library combines catalog, starter ideas, saved builds and recent without duplicates',()=>{
 const catalog=[{id:'6285-1',name:'Barracuda',theme:'Pirates',pieces:876,missing:['Stickers'],collections:['popular-picks']}];
 const template={id:'castle',prompt:'a castle',name:'Castle'};
 const saved=[{ref:'6285-1',prompt:'ref:6285-1',name:'Ship save'}, {...template,variant:0,opts:{},pieces:200}];
 const recent=[{...template,variant:0,opts:{},at:123}, {...template,variant:1,opts:{},at:122}];
 const entries=core.combineEntries(catalog,[template],saved,recent,['set-6285-1']);
 assert.equal(entries.length,3);
 const ship=entries.find(e=>e.ref==='6285-1');
 assert.equal(ship.name,'Barracuda');assert.equal(ship.savedEntry.name,'Ship save');
 assert.deepEqual(plain(ship.missing),['Stickers']);assert.ok(ship.tags.includes('Saved'));assert.ok(ship.tags.includes('Favorites'));
 const castle=entries.find(e=>e.prompt==='a castle' && !e.variant);
 for(const tag of ['Generated','Saved','Recent','Starter idea'])assert.ok(castle.tags.includes(tag));
 assert.equal(castle.pieces,200);
 // Composition never mutates the catalog or the persisted save.
 assert.equal(catalog[0].tags,undefined);assert.equal(saved[1].tags,undefined);
});
test('generated identities preserve options and variants; local favorites use the same key',()=>{
 const first={prompt:'car',variant:0,opts:{features:{roof:true},colors:{body:'RED'}}};
 const reordered={...first,opts:{colors:{body:'RED'},features:{roof:true}}};
 const blue={...first,opts:{features:{roof:true},colors:{body:'BLUE'}}};
 assert.equal(core.buildKey(first),core.buildKey(reordered));assert.notEqual(core.buildKey(first),core.buildKey(blue));
 assert.notEqual(core.buildKey(first),core.buildKey({...first,variant:1}));
 const entries=core.combineEntries([],[],[first],[reordered,blue],[core.buildKey(blue)]);
 assert.equal(entries.length,2);assert.equal(core.searchEntries(entries,'',['Generated','Favorites'])[0].opts.colors.body,'BLUE');
});
test('mixed search intersects labels and finds source, theme, number and prompt words',()=>{
 const entries=core.combineEntries([{id:'75181-1',name:'Y-Wing',theme:'Star Wars',year:2018}],[],[{prompt:'yellow race car',name:'My racer'}],[],[]);
 entries.find(e=>e.ref).tags.push('Star Wars');
 assert.equal(core.searchEntries(entries,'2018 wing',['Real set','Star Wars']).length,1);
 assert.equal(core.searchEntries(entries,'75181',['Real set']).length,1);
 assert.equal(core.searchEntries(entries,'yellow generated',['Saved']).length,1);
 assert.equal(core.searchEntries(entries,'',['Real set','Generated']).length,0);
 assert.equal(core.searchEntries(entries,'',['Saved','Generated']).length,1);
});
test('the library is the home screen on every visit unless a share link names a model',()=>{
 for(const search of ['','?standalone=1','?t=1&quality=lite'])assert.equal(core.shouldBrowseOnStart(search),true);
 for(const search of ['?ref=6285-1','?idea=car&v=1','?mosaic=example','?build=abc','?standalone=1&ref=6285-1'])assert.equal(core.shouldBrowseOnStart(search),false);
 // Earlier visits and a saved last kit no longer skip the library; the last kit is offered there instead.
 assert.equal(core.shouldBrowseOnStart('', '1','6285-1'),true);
});
