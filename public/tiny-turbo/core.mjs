export const CARS = [
  { id: 'comet', name: 'Comet', nickname: 'The little speedster', driver: 'Pip', color: '#9b83ff', accent: '#e8ff7d', helmet: '#fff5dc', shape: 'racer', badge: '01', speed: 5, accel: 4, drift: 4, stats: { speed: 92, accel: 86, drift: 90 } },
  { id: 'clementine', name: 'Clementine', nickname: 'Big wheels. Bigger smiles.', driver: 'Sunny', color: '#ff9f66', accent: '#fff4be', helmet: '#ffe4ef', shape: 'buggy', badge: '02', speed: 4, accel: 5, drift: 4, stats: { speed: 86, accel: 94, drift: 88 } },
  { id: 'mint-chip', name: 'Mint Chip', nickname: 'A very speedy little van', driver: 'Mochi', color: '#69d9b2', accent: '#fff5dc', helmet: '#e8ddff', shape: 'van', badge: '03', speed: 4, accel: 4, drift: 5, stats: { speed: 88, accel: 90, drift: 95 } },
];
export const TRACKS = [
  { id:'cloudtop',name:'Cloudtop Circuit',number:'01',icon:'☁',theme:'clouds',tag:'FLOAT ON AIR',description:'Fluffy clouds & happy little hills',character:'Easy-going curves',sky:'#c7e1f5',ground:'#e3ebce',base:'#c9d9c6',road:'#f1af7a',edge:'#9879c8',rails:['#aa8cdc','#e7d8fc'],accent:'#9b83ff',ink:'#282344',points:[[-65,0,0],[-47,2,-52],[14,4,-69],[65,1,-43],[73,0,8],[44,4,50],[-20,1,60],[-67,0,36]] },
  { id:'peachy-palms',name:'Peachy Palms',number:'02',icon:'☀',theme:'beach',tag:'SUNSHINE, ON REPEAT',description:'Salty air & the scenic route',character:'Breezy beach bends',sky:'#bce6ed',ground:'#fff0cf',base:'#e4bc8d',road:'#f5b199',edge:'#e98872',rails:['#ffb69a','#fff4d9'],accent:'#ff996e',ink:'#553b40',points:[[-78,0,6],[-66,.5,-46],[-18,1,-63],[38,.7,-57],[75,0,-18],[70,1,37],[25,1.5,57],[-8,.5,20],[-54,0,54]] },
  { id:'twilight-trail',name:'Twilight Trail',number:'03',icon:'☾',theme:'forest',tag:'CHASE A LITTLE MAGIC',description:'Glow mushrooms & moonlit woods',character:'Sweeping woodland turns',sky:'#222b4b',ground:'#48596b',base:'#303d58',road:'#8585ad',edge:'#b7a0e5',rails:['#d3b5f4','#686b99'],accent:'#b8a2ef',ink:'#f7edff',points:[[-64,0,0],[-72,2,-44],[-28,4,-66],[9,1,-35],[51,3,-64],[78,5,-16],[52,3,25],[63,1,58],[4,2,70],[-42,4,43]] },
];

export const ITEMS = [
  { id: 'mushroom', name: 'Turbo Shroom', icon: '🍄', color: '#ff6b6b', desc: 'Instant speed burst!' },
  { id: 'triple-shroom', name: 'Triple Shrooms', icon: '🍄×3', color: '#ff8e53', desc: 'Three rapid turbo bursts!' },
  { id: 'shell', name: 'Homing Shell', icon: '🐢', color: '#51cf66', desc: 'Chases the rival ahead!' },
  { id: 'star-power', name: 'Super Star', icon: '🌟', color: '#ffd43b', desc: 'Rainbow invincibility & top speed!' },
  { id: 'lightning', name: 'Mini Zap', icon: '⚡', color: '#4dabf7', desc: 'Shrinks & slows all rivals!' },
  { id: 'banana', name: 'Giggle Peel', icon: '🍌', color: '#fcc419', desc: 'Drops a slip hazard behind you!' },
];

export function rollItem(place = 2, rng = Math.random) {
  // Position-based Mario Kart rubber-banding: trailing racers get stronger comeback items!
  const pool = place >= 3
    ? ['mushroom', 'triple-shroom', 'shell', 'star-power', 'lightning']
    : place === 2
      ? ['mushroom', 'triple-shroom', 'shell', 'star-power', 'banana']
      : ['banana', 'mushroom', 'shell', 'mushroom'];
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

export function computeDriftTier(charge = 0) {
  if (charge >= 2.2) return 3; // Ultra Mini-Turbo (Purple/Pink sparks)
  if (charge >= 1.25) return 2; // Super Mini-Turbo (Orange sparks)
  if (charge >= 0.5) return 1;  // Standard Mini-Turbo (Blue sparks)
  return 0;
}

export function sampleJoystick(dx,dy,radius=44) {
  const length=Math.hypot(dx,dy),limit=Math.min(1,radius/Math.max(length,.001));
  const strength=Math.max(0,Math.min(1,(length/radius-.1)/.5));
  return {x:dx*limit,y:dy*limit,steer:length?dx/length*strength:0};
}
export function formatTime(seconds) {
  if(!Number.isFinite(seconds)||seconds<=0)return '—';
  return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
}
export const GRADES = ['Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'];
export const UPGRADE_COST = 12;
export const MAX_UPGRADES = 3;
export const CHALLENGE_REWARD = 4;
export function normalizeProfile(value = {}) {
  const integer = (v, min, max, fallback = min) => Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    grade: integer(value.grade, 0, 5),
    cadence: [12, 18, 26].includes(value.cadence) ? value.cadence : 18,
    subject: ['mixed', 'math', 'spelling'].includes(value.subject) ? value.subject : 'mixed',
    sound: value.sound !== false,
    steerAssist: value.steerAssist !== false,
    stars: integer(value.stars, 0, 999999),
    wins: integer(value.wins, 0, 999999),
    car: CARS.some(c => c.id === value.car) ? value.car : 'comet',
    track: TRACKS.some(t => t.id === value.track) ? value.track : 'cloudtop',
    records: Object.fromEntries(TRACKS.map(t=>[t.id,{races:integer(value.records?.[t.id]?.races,0,99999),best:Number.isFinite(value.records?.[t.id]?.best)&&value.records[t.id].best>0?value.records[t.id].best:null}])),
    upgrades: Object.fromEntries(CARS.map(c => [c.id, integer(value.upgrades?.[c.id], 0, MAX_UPGRADES)])),
  };
}
const pick = (list, rng) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
const between = (min, max, rng) => min + Math.min(max - min, Math.floor(rng() * (max - min + 1)));
function shuffle(values, rng) {
  const list = [...values];
  for (let i = list.length - 1; i > 0; i--) { const j = between(0, i, rng); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}
const WORDS = [
  [['cat','🐱','A pet that says meow'],['dog','🐶','A pet that barks'],['sun','☀️','It shines in the sky'],['bus','🚌','It takes children to school'],['hat','🎩','You wear it on your head']],
  [['fish','🐟','It swims in water'],['duck','🦆','It says quack'],['ship','⛵','It sails on the sea'],['frog','🐸','It hops and says ribbit'],['cake','🎂','A birthday treat']],
  [['rocket','🚀','It travels into space'],['planet','🪐','Earth is one'],['rabbit','🐰','It has long ears'],['garden','🌷','A place to grow flowers'],['yellow','💛','The color of a lemon']],
  [['rainbow','🌈','Colors across the sky'],['dolphin','🐬','A clever ocean animal'],['chicken','🐔','It lays eggs'],['bicycle','🚲','A ride with two wheels'],['feather','🪶','A bird has many']],
  [['adventure','🧭','An exciting new journey'],['telescope','🔭','Use it to see distant stars'],['mountain','⛰️','A very tall landform'],['elephant','🐘','An animal with a trunk'],['treasure','💎','Something precious to find']],
  [['curiosity','🔎','Wanting to learn and discover'],['electric','⚡','Powered by electricity'],['beautiful','🦋','Lovely to look at'],['discovery','🧭','Finding something new'],['magnetic','🧲','Able to attract iron']],
];
export function makeQuestion(grade = 0, subject = 'mixed', rng = Math.random) {
  grade = Math.max(0, Math.min(5, Number(grade) || 0));
  const kind = subject === 'mixed' ? (rng() < .58 ? 'math' : 'spelling') : subject;
  if (kind === 'spelling') {
    const [word, emoji, clue] = pick(WORDS[grade], rng);
    const index = between(grade < 2 ? 1 : 0, word.length - 2, rng), answer = word[index];
    const others = shuffle([...new Set('aeioubcdfglmnrst'.split('').filter(c => c !== answer))], rng).slice(0, 2);
    return { kind, prompt: 'Find the missing letter', display: word.slice(0,index)+'_'+word.slice(index+1), emoji, answer, choices: shuffle([answer,...others],rng), hint: clue, spoken: `Find the missing letter in ${word}. ${clue}.`, key: word+index };
  }
  let a, b, answer, display, hint, spoken;
  if (grade === 5 && rng() < .5) {
    const denominator = pick([2,3,4,5],rng), numerator = between(1,denominator-1,rng);
    answer = `${numerator*2}/${denominator*2}`;
    return { kind:'math', prompt:'Find the matching fraction', display:`${numerator}/${denominator} = ?`, emoji:'🍕', answer, choices:shuffle([answer,`${numerator*2+1}/${denominator*2}`,`${numerator}/${denominator*2}`],rng), hint:'Multiply the top and bottom by the same number.', spoken:`Which fraction is equal to ${numerator} over ${denominator}?`, key:`fraction${numerator}/${denominator}` };
  }
  if (grade >= 3) {
    a = between(2,grade >= 4 ? 12 : 9,rng); b = between(2,grade === 5 ? 15 : 9,rng);
    const division = rng() < .35;
    answer = division ? a : a*b; display = division ? `${a*b} ÷ ${b} = ?` : `${a} × ${b} = ?`;
    hint = division ? `How many groups of ${b} make ${a*b}?` : `Add ${a} together ${b} times.`;
    spoken = division ? `What is ${a*b} divided by ${b}?` : `What is ${a} times ${b}?`;
  } else {
    const limit = [5,20,100][grade], subtract = rng() < .4;
    a = between(1,limit,rng); b = between(0,subtract ? a : limit-a,rng);
    answer = subtract ? a-b : a+b; display = `${a} ${subtract?'−':'+'} ${b} = ?`;
    hint = grade === 0 ? 'Try counting on your fingers.' : subtract ? `Start at ${a} and count back ${b}.` : `Start at ${a} and count on ${b}.`;
    spoken = `What is ${a} ${subtract?'minus':'plus'} ${b}?`;
  }
  const alternatives = shuffle([...new Set([answer+1,answer+2,answer-1,answer-2,answer+5,answer-5].filter(n=>n>=0 && n!==answer))],rng).slice(0,2);
  return {kind:'math',prompt:'A little brain boost',display,emoji:'✨',answer:String(answer),choices:shuffle([String(answer),...alternatives.map(String)],rng),hint,spoken,key:display};
}

// Learning overlays and pauses never advance race time, pickups, or opponents.
export function createRace() {
  return {
    mode: 'countdown',
    elapsed: 0,
    challengeAt: 0,
    answered: 0,
    skipped: 0,
    earned: 0,
    settled: false,
    distance: 0,
    boost: 0,
    shield: 0,
    magnet: 0,
    energy: 1,
    collected: new Set(),
    // Mario Kart Gameplay State
    drifting: false,
    driftDir: 0,
    driftCharge: 0,
    driftTier: 0,
    hopTimer: 0,
    airY: 0,
    airVy: 0,
    trickTimer: 0,
    draftTimer: 0,
    starPower: 0,
    lightningTimer: 0,
    item: null,
    itemCharges: 0,
    rouletteTimer: 0,
    rocketCharge: 0,
    rocketTriggered: false,
    miniTurbos: 0,
    tricks: 0,
  };
}
export function advanceClock(race, delta, cadence) {
  if (race.mode !== 'racing') return false;
  race.elapsed += Math.max(0,Math.min(.1,delta));
  if (race.elapsed-race.challengeAt >= cadence) { race.mode='challenge';race.challengeAt=race.elapsed;return true; }
  return false;
}
export function rewardQuestion(race, correct, skipped=false) {
  if (race.mode !== 'challenge') return false;
  if (skipped) { race.skipped++; race.mode='racing';return true; }
  if (!correct) return false;
  race.answered++;race.earned+=CHALLENGE_REWARD;race.energy=Math.min(3,race.energy+1);race.mode='racing';return true;
}
export function buyUpgrade(profile, carId) {
  if (!CARS.some(c=>c.id===carId) || profile.stars < UPGRADE_COST || profile.upgrades[carId]>=MAX_UPGRADES) return false;
  profile.stars-=UPGRADE_COST;profile.upgrades[carId]++;return true;
}
export function settleRace(profile, race, place) {
  if (race.settled) return 0;
  const finishBonus = place===1?8:5;
  race.earned+=finishBonus;profile.stars+=race.earned;if(place===1)profile.wins++;
  if(profile.records?.[profile.track]&&race.elapsed>0){const record=profile.records[profile.track];record.races++;record.best=record.best===null?race.elapsed:Math.min(record.best,race.elapsed);}
  race.settled=true;race.mode='finished';return finishBonus;
}
