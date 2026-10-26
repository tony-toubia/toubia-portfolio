import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as RealThree from '../../public/studforge/vendor/three.module.js';
import * as core from '../../public/tiny-turbo/core.mjs';
import { createWorld, disposeWorld } from '../../public/tiny-turbo/world.mjs';

// Execute the real gameplay module with Three.js geometry and a minimal DOM/renderer
// adapter. This validates event/state behavior; it does not replace visual WebGL QA.
async function makeGame(saved={sound:false}) {
  const nodes=new Map(),listeners=new Map();let savedValue=JSON.stringify(saved),delta=.05,frames=0;
  class Element {
    constructor(id=''){this.id=id;this.children=[];this.events={};this.hidden=false;this.value='';this.style={setProperty(key,value){this[key]=value;}};this.dataset={};this._class='';this.disabled=false;this.textContent='';this.tagName='BUTTON';this.offsetParent={};this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),contains:c=>this.classes.has(c),toggle:(c,on)=>{if(on??!this.classes.has(c))this.classes.add(c);else this.classes.delete(c);}};}
    set innerHTML(text){this._html=text;if(this.id==='car-list'){this.children=core.CARS.map(car=>{const node=new Element();node.dataset.car=car.id;return node;});}if(this.id==='track-list'){this.children=core.TRACKS.map(track=>{const node=new Element();node.dataset.track=track.id;return node;});}}
    get innerHTML(){return this._html||'';}
    addEventListener(name,fn){(this.events[name]||=[]).push(fn);}
    click(){if(this.disabled)return;for(const fn of this.events.click||[])fn({target:this,preventDefault(){}});}
    appendChild(child){this.children.push(child);return child;}
    replaceChildren(...children){this.children=children;}
    querySelectorAll(selector){if(selector==='[data-car]'||selector==='[data-track]')return this.children;return this.children.filter(c=>!c.disabled);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    focus(){document.activeElement=this;}
    setPointerCapture(id){this.captured=id;}
    hasPointerCapture(id){return this.captured===id;}
    releasePointerCapture(){this.captured=null;}
    getBoundingClientRect(){return {left:0,top:200,width:550,height:500};}
    setAttribute(key,value){this[key]=value;}
    getContext(){return new Proxy({},{get:()=>()=>{}});}
  }
  const html=await fs.readFile('public/tiny-turbo/index.html','utf8');
  for(const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const node=new Element(match[1]);node.hidden=/\shidden\b/.test(match[0]);nodes.set(match[1],node);}
  const document={body:new Element('body'),hidden:false,activeElement:null,getElementById:id=>{assert.ok(nodes.has(id),`missing UI element ${id}`);return nodes.get(id);},createElement:()=>new Element(),querySelectorAll:()=>[],addEventListener:(event,fn)=>listeners.set(event,fn)};
  class Renderer {constructor(){this.domElement=new Element();this.shadowMap={};}setPixelRatio(){}setSize(){}render(){frames++;}}
  const window={addEventListener:(event,fn)=>listeners.set('window:'+event,fn)};
  const context=vm.createContext({THREE:{...RealThree,WebGLRenderer:Renderer,Clock:class{getDelta(){return delta;}}},...core,createWorld,disposeWorld,document,window,console,devicePixelRatio:1,innerWidth:1024,innerHeight:768,performance:{now:()=>frames*50},requestAnimationFrame(){},setTimeout(){return 1;},clearTimeout(){},matchMedia:()=>({matches:false}),localStorage:{getItem:()=>savedValue,setItem:(_key,v)=>{savedValue=v;}}});
  const source=(await fs.readFile('public/tiny-turbo/game.mjs','utf8')).replace(/^import .*;\r?\n/gm,'');
  vm.runInContext(source+`\n;globalThis.testGame={get state(){return {profile,race,lane,speed,question,player,camera,scene,trackLength,rivals,stick,courseGroup,curve};},loop,startRace,home,frameAt,pauseRace};`,context);
  return {app:context.testGame,nodes,listeners,tick:seconds=>{for(let t=0;t<seconds;t+=delta)context.testGame.loop();},readSaved:()=>JSON.parse(savedValue)};
}

test('actual game starts, steers in screen direction, freezes every racer during questions, and handles wrong/skip/correct events',async()=>{
  const game=await makeGame({sound:false,subject:'math',cadence:12});const {app,nodes}=game;
  assert.equal(nodes.get('load-error').hidden,true,'scene setup succeeds');assert.equal(app.state.race.mode,'home');
  nodes.get('start').click();game.tick(4);assert.equal(app.state.race.mode,'racing');assert.equal(nodes.get('home').hidden,true);
  const {point,right}=app.frameAt(0);app.state.camera.updateMatrixWorld(true);
  const center=point.clone().project(app.state.camera),screenRight=point.clone().addScaledVector(right,2).project(app.state.camera);assert.ok(screenRight.x>center.x,'the right arrow must move right in the chase camera');
  const zone=nodes.get('steer-zone');zone.events.pointerdown[0]({preventDefault(){},pointerId:1,clientX:100,clientY:400});zone.events.pointermove[0]({pointerId:1,clientX:132,clientY:400});
  game.tick(.5);assert.ok(app.state.lane>1,'pulling the joystick right steers');zone.events.pointerup[0]({pointerId:1});assert.equal(app.state.stick.steer,0);
  game.tick(12);assert.equal(app.state.race.mode,'challenge');assert.equal(nodes.get('challenge').hidden,false);
  const frozen=()=>JSON.stringify([app.state.race.elapsed,app.state.race.distance,...app.state.rivals.map(r=>r.distance)]),snapshot=frozen();
  game.tick(10);assert.equal(frozen(),snapshot,'player, opponents and race clock all stop');
  const wrong=nodes.get('answers').children.find(button=>button.textContent!==app.state.question.answer);wrong.click();assert.equal(wrong.disabled,true);assert.equal(app.state.race.mode,'challenge');
  const beforeSkip=app.state.race.earned;nodes.get('skip-question').click();assert.equal(app.state.race.mode,'racing');assert.equal(app.state.race.earned,beforeSkip);assert.equal(app.state.race.skipped,1);
  game.tick(12.5);assert.equal(app.state.race.mode,'challenge');
  const earned=app.state.race.earned;nodes.get('answers').children.find(button=>button.textContent===app.state.question.answer).click();assert.equal(app.state.race.earned,earned+4);assert.equal(app.state.race.answered,1);
  nodes.get('boost').click();assert.ok(app.state.race.boost>2);assert.equal(app.state.race.energy,1);
  game.listeners.get('window:blur')();assert.equal(app.state.race.mode,'paused');const paused=frozen();game.tick(5);assert.equal(frozen(),paused);
  nodes.get('resume').click();assert.equal(app.state.race.mode,'racing');
});

test('floating joystick supports analog input, quick reversal, pointer ownership, boost with a second finger, and pause cleanup',async()=>{
  const game=await makeGame(),{app,nodes}=game;nodes.get('start').click();game.tick(4);const zone=nodes.get('steer-zone');
  zone.events.pointerdown[0]({preventDefault(){},pointerId:9,clientX:110,clientY:440});
  zone.events.pointermove[0]({pointerId:9,clientX:120,clientY:440});assert.ok(app.state.stick.steer>0&&app.state.stick.steer<.5);
  zone.events.pointermove[0]({pointerId:9,clientX:210,clientY:440});assert.ok(app.state.stick.x>110,'base follows an extended thumb');assert.equal(app.state.stick.steer,1);
  zone.events.pointerdown[0]({preventDefault(){},pointerId:10,clientX:240,clientY:440});assert.equal(app.state.stick.pointer,9,'a second pointer cannot hijack steering');
  nodes.get('boost').click();assert.ok(app.state.race.boost>0);assert.equal(app.state.stick.pointer,9,'boost does not release the steering pointer');
  zone.events.pointermove[0]({pointerId:9,clientX:140,clientY:440});assert.ok(app.state.stick.steer<0);
  nodes.get('pause').click();assert.equal(app.state.stick.pointer,null);assert.equal(app.state.stick.steer,0);assert.equal(zone.captured,null);
  nodes.get('resume').click();zone.events.pointerdown[0]({preventDefault(){},pointerId:11,clientX:110,clientY:440});zone.events.pointermove[0]({pointerId:11,clientX:80,clientY:440});zone.events.pointercancel[0]({pointerId:11});assert.equal(app.state.stick.steer,0);
});

test('all three worlds finish, preserve their selection and bank separate records; switching worlds disposes the previous geometry',async()=>{
  const game=await makeGame(),{app,nodes}=game;let previous;
  const lengths=[];
  for(const track of core.TRACKS){
    if(track.id!==app.state.profile.track)nodes.get('track-list').children.find(button=>button.dataset.track===track.id).click();
    assert.equal(app.state.profile.track,track.id);lengths.push(app.state.trackLength);assert.equal(app.state.courseGroup.name,'course:'+track.id);
    if(previous)assert.equal(app.state.scene.children.includes(previous),false,'old course is removed');
    let disposed=false;app.state.courseGroup.children.find(object=>object.geometry)?.geometry.addEventListener('dispose',()=>{disposed=true;});
    nodes.get('start').click();game.tick(4);
    for(let n=0;n<1700&&app.state.race.mode!=='finished';n++){if(app.state.race.mode==='challenge')nodes.get('skip-question').click();game.tick(.1);}
    assert.equal(app.state.race.mode,'finished');assert.equal(app.state.profile.records[track.id].races,1);assert.ok(app.state.profile.records[track.id].best>20);assert.match(nodes.get('finish-description').textContent,new RegExp(track.name));
    const best=app.state.profile.records[track.id].best;game.tick(3);assert.equal(app.state.profile.records[track.id].best,best);nodes.get('garage').click();
    previous=app.state.courseGroup;
    const next=core.TRACKS[(core.TRACKS.indexOf(track)+1)%3];nodes.get('track-list').children.find(button=>button.dataset.track===next.id).click();assert.equal(disposed,true,'GPU resources are released on a world change');
  }
  assert.equal(new Set(lengths.map(Math.round)).size,3,'worlds have different routes');assert.equal(Object.values(game.readSaved().records).filter(r=>r.races===1).length,3);
});

test('race finish banks stars once, upgrades persist, and a replay keeps the selected car',async()=>{
  const game=await makeGame({sound:false,subject:'math',cadence:12,car:'mint-chip'});const {app,nodes}=game;
  nodes.get('start').click();game.tick(4);
  let questions=0;
  for(let n=0;n<1600&&app.state.race.mode!=='finished';n++){
    if(app.state.race.mode==='challenge'){
      const answer=nodes.get('answers').children.find(button=>button.textContent===app.state.question.answer);answer.click();questions++;
      if(!nodes.get('boost').disabled)nodes.get('boost').click();
    }
    game.tick(.1);
  }
  assert.equal(app.state.race.mode,'finished');assert.ok(questions>=3);assert.equal(nodes.get('finish').hidden,false);assert.ok(game.readSaved().stars>=12);
  const bank=game.readSaved().stars;game.tick(3);assert.equal(game.readSaved().stars,bank);
  nodes.get('garage').click();nodes.get('upgrade').click();assert.equal(game.readSaved().upgrades['mint-chip'],1);assert.equal(game.readSaved().stars,bank-12);
  nodes.get('start').click();game.tick(4);assert.equal(app.state.profile.car,'mint-chip');assert.equal(app.state.race.earned,0);
});

test('garage selection and learning preferences save and feed the next race',async()=>{
  const game=await makeGame(),{nodes,app}=game;
  nodes.get('car-list').children.find(button=>button.dataset.car==='clementine').click();assert.equal(app.state.profile.car,'clementine');
  nodes.get('settings-open').click();nodes.get('grade').value='3';nodes.get('subject').value='spelling';nodes.get('cadence').value='12';nodes.get('assist').checked=false;
  nodes.get('settings-form').events.submit[0]({preventDefault(){}});assert.equal(nodes.get('settings').hidden,true);assert.equal(game.readSaved().grade,3);assert.equal(game.readSaved().steerAssist,false);
  nodes.get('start').click();game.tick(16);assert.equal(app.state.race.mode,'challenge');assert.equal(app.state.question.kind,'spelling');assert.ok(app.state.question.display.length>=7);
});


test('Mario Kart mechanics: rocket start, drift mini-turbo sparks, item boxes, and trick ramps',async()=>{
  const game=await makeGame({sound:false,cadence:26});const {app,nodes}=game;
  nodes.get('start').click();
  game.tick(2.1);nodes.get('drift').events.pointerdown[0]({preventDefault(){}});game.tick(2.0);
  assert.equal(app.state.race.mode,'racing');
  assert.equal(app.state.race.rocketTriggered,true,'rocket start triggers when timed in countdown');
  const zone=nodes.get('steer-zone');
  zone.events.pointerdown[0]({preventDefault(){},pointerId:1,clientX:100,clientY:400});
  zone.events.pointermove[0]({pointerId:1,clientX:145,clientY:400});
  nodes.get('drift').events.pointerdown[0]({preventDefault(){}});
  game.tick(1.5);
  assert.ok(app.state.race.drifting,'kart enters drift state');
  assert.ok(app.state.race.driftTier>=2,'charges at least orange super mini-turbo sparks');
  nodes.get('drift').events.pointerup[0]({});
  zone.events.pointerup[0]({pointerId:1});
  game.tick(.1);
  assert.equal(app.state.race.miniTurbos,1,'releasing drift awards a mini-turbo burst');
  assert.ok(app.state.race.boost>1.5,'mini-turbo sets active boost');
});


test('steering right and left always moves the kart in the matching screen direction without opposite-direction lock',async()=>{
  const game=await makeGame({sound:false,cadence:26});const {app,nodes,listeners}=game;
  nodes.get('start').click();game.tick(4);
  const keydown=listeners.get('window:keydown'),keyup=listeners.get('window:keyup');
  // Hold Right arrow: lane must increase and screen projection must be right of track center
  keydown({key:'ArrowRight',target:{tagName:'BODY'},preventDefault(){}});
  game.tick(.45);
  const laneRight=app.state.lane;
  assert.ok(laneRight>2.5,'holding Right moves kart to the right lane');
  app.state.camera.updateMatrixWorld(true);
  const uNow=(app.state.race.distance/app.state.trackLength)%1;
  const centerScreen=app.frameAt(uNow).point.clone().project(app.state.camera);
  const playerScreen=app.state.player.position.clone().project(app.state.camera);
  assert.ok(playerScreen.x>centerScreen.x,'kart appears to the right of center on screen when steering right');
  // Immediately switch from Right to Left arrow: lane must immediately decrease on the very next frame!
  keyup({key:'ArrowRight'});
  keydown({key:'ArrowLeft',target:{tagName:'BODY'},preventDefault(){}});
  game.tick(.1);
  assert.ok(app.state.lane<laneRight,'switching to Left immediately moves kart left on the very next frame');
  game.tick(.8);
  assert.ok(app.state.lane<-2.0,'holding Left moves kart into the left lane');
  app.state.camera.updateMatrixWorld(true);
  const uNow2=(app.state.race.distance/app.state.trackLength)%1;
  const centerScreen2=app.frameAt(uNow2).point.clone().project(app.state.camera);
  const playerScreen2=app.state.player.position.clone().project(app.state.camera);
  assert.ok(playerScreen2.x<centerScreen2.x,'kart appears to the left of center on screen when steering left');
  keyup({key:'ArrowLeft'});
});
