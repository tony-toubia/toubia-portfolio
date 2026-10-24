import test from 'node:test';
import assert from 'node:assert/strict';
import { CARS, normalizeProfile, makeQuestion, createRace, advanceClock, rewardQuestion, buyUpgrade, settleRace } from '../../public/tiny-turbo/core.mjs';

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
