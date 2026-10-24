import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../public/studforge/vendor/three.module.js';
import { CARS, TRACKS, sampleJoystick, formatTime, normalizeProfile, makeQuestion, createRace, advanceClock, rewardQuestion, buyUpgrade, settleRace } from '../../public/tiny-turbo/core.mjs';

const rng=seed=>()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
test('every grade generates varied, uniquely answerable math and spelling with safe kindergarten ranges',()=>{
  for(let grade=0;grade<=5;grade++)for(const subject of ['math','spelling']){
    const random=rng(19+grade),seen=new Set();
    for(let n=0;n<300;n++){
      const q=makeQuestion(grade,subject,random);assert.equal(q.choices.length,3);assert.equal(new Set(q.choices).size,3);assert.equal(q.choices.filter(c=>c===q.answer).length,1);assert.ok(q.hint&&q.spoken);seen.add(q.key);
      if(subject==='spelling'){assert.ok(q.display.includes('_'));assert.equal(q.answer.length,1);}
      else if(q.display.includes('/')){const [num,den]=q.display.split(' =')[0].split('/').map(Number),[a,b]=q.answer.split('/').map(Number);assert.equal(num*b,den*a);}
      else{const [a,operator,b]=q.display.split(' ');const expected=operator==='+'?Number(a)+Number(b):operator==='−'?Number(a)-Number(b):operator==='×'?Number(a)*Number(b):Number(a)/Number(b);assert.equal(Number(q.answer),expected);if(grade===0)assert.ok(Number(q.answer)>=0&&Number(q.answer)<=5);}
    }
    assert.ok(seen.size>=5,'questions must vary');
  }
});
test('learning overlays freeze the race; skipping never removes rewards or stops the race',()=>{
  const race=createRace();race.mode='racing';for(let n=0;n<121;n++)advanceClock(race,.1,12);assert.equal(race.mode,'challenge');const elapsed=race.elapsed;
  for(let n=0;n<100;n++)advanceClock(race,.1,12);assert.equal(race.elapsed,elapsed);
  assert.equal(rewardQuestion(race,false),false);assert.equal(race.mode,'challenge');assert.equal(race.earned,0);
  rewardQuestion(race,false,true);assert.equal(race.mode,'racing');assert.equal(race.energy,1);assert.equal(race.skipped,1);
  race.mode='challenge';rewardQuestion(race,true);assert.equal(race.earned,4);assert.equal(race.energy,2);assert.equal(race.answered,1);
  assert.equal(rewardQuestion(race,true),false,'a duplicate event cannot award twice');
});
test('finish rewards bank once; car upgrades only spend earned stars and respect the cap',()=>{
  const profile=normalizeProfile(),race=createRace();race.earned=8;assert.equal(buyUpgrade(profile,'comet'),false);
  settleRace(profile,race,1);assert.equal(profile.stars,16);assert.equal(profile.wins,1);assert.equal(settleRace(profile,race,1),0);assert.equal(profile.stars,16);
  assert.equal(buyUpgrade(profile,'comet'),true);assert.equal(profile.stars,4);assert.equal(profile.upgrades.comet,1);assert.equal(buyUpgrade(profile,'no-car'),false);
  profile.stars=100;profile.upgrades.comet=3;assert.equal(buyUpgrade(profile,'comet'),false);assert.equal(profile.stars,100);
  assert.equal(CARS.length,3);assert.equal(new Set(CARS.map(c=>c.id)).size,3);
});
test('invalid or old saved preferences recover without locking out the garage',()=>{
  const profile=normalizeProfile({grade:99,car:'gone',stars:-500,cadence:0,subject:'ads',upgrades:{comet:100}});
  assert.equal(profile.grade,5);assert.equal(profile.car,'comet');assert.equal(profile.stars,0);assert.equal(profile.cadence,18);assert.equal(profile.subject,'mixed');assert.equal(profile.upgrades.comet,3);
});

test('joystick has a dead zone, analog strength and a bounded knob; old saves retain stars while gaining course records',()=>{
  assert.equal(sampleJoystick(1,1).steer,0);assert.equal(sampleJoystick(0,40).steer,0);
  const small=sampleJoystick(10,0),large=sampleJoystick(25,0);assert.ok(small.steer>0&&small.steer<large.steer);assert.ok(sampleJoystick(-25,0).steer<0);
  const extreme=sampleJoystick(1000,1000);assert.ok(Math.hypot(extreme.x,extreme.y)<=44.0001);assert.ok(extreme.steer<=1);
  const profile=normalizeProfile({stars:48,car:'mint-chip',upgrades:{'mint-chip':2},track:'gone'});assert.equal(profile.stars,48);assert.equal(profile.track,'cloudtop');assert.equal(profile.upgrades['mint-chip'],2);assert.equal(Object.keys(profile.records).length,TRACKS.length);
  assert.equal(formatTime(74.2),'1:14');assert.equal(formatTime(null),'—');
});

test('course splines are closed, fit their islands, and leave clearance between separate sections of road',()=>{
  const outlines=new Set();
  for(const track of TRACKS){
    const curve=new THREE.CatmullRomCurve3(track.points.map(p=>new THREE.Vector3(...p)),true,'catmullrom',.4),length=curve.getLength(),points=Array.from({length:300},(_,i)=>curve.getPointAt(i/300));
    assert.ok(curve.getPointAt(0).distanceTo(curve.getPointAt(1))<.001);assert.ok(length>350&&length<600);outlines.add(JSON.stringify(track.points));
    for(let i=0;i<points.length;i++){
      const a=points[i];assert.ok([a.x,a.y,a.z].every(Number.isFinite));assert.ok(Math.hypot(a.x,a.z)+8<112,'road stays on its island');
      for(let j=i+1;j<points.length;j++){
        const arcGap=Math.min(j-i,300-j+i)*length/300;if(arcGap<32)continue;
        assert.ok(Math.hypot(a.x-points[j].x,a.z-points[j].z)>16,'separate sections must not overlap the full road width');
      }
    }
  }
  assert.equal(outlines.size,3);
});
