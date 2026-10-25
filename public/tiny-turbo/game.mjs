import * as THREE from '/studforge/vendor/three.module.js';
import { createWorld, disposeWorld } from './world.mjs?v=4';
import { CARS, TRACKS, GRADES, ITEMS, UPGRADE_COST, MAX_UPGRADES, normalizeProfile, makeQuestion, createRace, advanceClock, rewardQuestion, buyUpgrade, settleRace, sampleJoystick, formatTime, rollItem, computeDriftTier } from './core.mjs?v=4';

const $ = id => document.getElementById(id), STORAGE = 'tiny-turbo.club.v1';
let profile;
try { profile=normalizeProfile(JSON.parse(localStorage.getItem(STORAGE)||'{}')); } catch { profile=normalizeProfile(); }
const save=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(profile));}catch{notify('Playing without saved progress on this device.');}};
let race=createRace(), question=null, lastQuestion='', lane=0, speed=0, countdownTime=0, countdownNumber='', leftHeld=false, rightHeld=false, driftHeld=false, toastTimer, flashTimer, resumeMode='racing', returnFocus=null;
let renderer, scene, camera, curve, trackLength, courseGroup, sun, ambient, player, hero, heroPlatform, rivals=[], pickups=[], boostPads=[], itemBoxes=[], ramps=[], hazards=[], particles=[], fxGroup, clock=new THREE.Clock(), frameCount=0;
const currentTrack=()=>TRACKS.find(t=>t.id===profile.track);
const stick={pointer:null,x:0,y:0,steer:0};
const container=$('world'), reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let audioContext;
function sound(frequency=500,duration=.12,type='sine') {
  if(!profile.sound)return;
  try {
    audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==='suspended')audioContext.resume();
    const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,audioContext.currentTime);osc.frequency.exponentialRampToValueAtTime(frequency*1.4,audioContext.currentTime+duration);
    gain.gain.setValueAtTime(.055,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration);
  }catch{/* Sound is optional; racing never depends on an audio device. */}
}
function fanfare(notes=[523,659,784,1046],step=.065){
  if(!profile.sound)return;
  notes.forEach((f,i)=>setTimeout(()=>sound(f,.11,'triangle'),i*step*1000));
}
function notify(message) { clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2600); }
function triggerFlash(){
  const el=$('fx-flash');if(!el)return;
  clearTimeout(flashTimer);el.hidden=false;flashTimer=setTimeout(()=>{el.hidden=true;},380);
}
function speak(text) {
  if(!profile.sound||!('speechSynthesis'in window))return;
  try {speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=.82;speechSynthesis.speak(utterance);}catch{/* A missing device voice must never stop a race. */}
}
function carDrawing(car) {
  const van=car.shape==='van',buggy=car.shape==='buggy';
  return `<svg class="car-drawing" viewBox="0 0 140 75" aria-hidden="true"><ellipse cx="70" cy="64" rx="49" ry="5" fill="#282344" opacity=".12"/><path d="M17 48 Q17 38 28 37 L42 ${van?'15':'27'} Q46 ${van?'12':'23'} 53 ${van?'12':'23'} H85 Q92 23 98 34 L116 39 Q125 41 125 50 V56 H17Z" fill="${car.color}" stroke="#282344" stroke-width="2.3"/><path d="M48 ${van?'18':'28'}H79L92 36H42Z" fill="#474563"/><circle cx="66" cy="${van?'23':'26'}" r="7.5" fill="${car.helmet||'#fff8e7'}" stroke="#282344" stroke-width="1.8"/><path d="M62 ${van?'22':'25'}H72" stroke="#282344" stroke-width="2.2" stroke-linecap="round"/><path d="M20 45H123" stroke="${car.accent}" stroke-width="4"/><rect x="109" y="42" width="13" height="6" rx="2" fill="#fff6cc"/><circle cx="40" cy="55" r="${buggy?15:12}" fill="#282344"/><circle cx="40" cy="55" r="6" fill="#fcf7ed"/><circle cx="102" cy="55" r="${buggy?15:12}" fill="#282344"/><circle cx="102" cy="55" r="6" fill="#fcf7ed"/><text x="67" y="49" font-family="Arial" font-size="9" font-weight="900" fill="#282344">${car.badge}</text>${car.shape==='racer'?`<path d="M19 35H35V39H19Z" fill="${car.accent}" stroke="#282344" stroke-width="1.5"/>`:''}</svg>`;
}
function renderGarage() {
  $('wallet').textContent=profile.stars;
  $('car-list').innerHTML=CARS.map(car=>`<button class="car-card" data-color="${car.id}" data-car="${car.id}" aria-pressed="${profile.car===car.id}" aria-label="Choose ${car.name}"><span class="check">✓</span>${carDrawing(car)}<div><strong>${car.name}</strong><p>${car.nickname}</p><div class="car-stats"><span class="car-stat">SPD ${'★'.repeat(car.speed||4)}</span><span class="car-stat">ACC ${'★'.repeat(car.accel||4)}</span><span class="car-stat">DRF ${'★'.repeat(car.drift||4)}</span></div><small>${profile.upgrades[car.id]?'TURBO LEVEL '+profile.upgrades[car.id]:'DRIVER: '+(car.driver||'RACER').toUpperCase()}</small></div></button>`).join('');
  $('car-list').querySelectorAll('[data-car]').forEach(button=>button.addEventListener('click',()=>selectCar(button.dataset.car)));
  const car=CARS.find(c=>c.id===profile.car),level=profile.upgrades[car.id];
  $('upgrade').textContent=level>=MAX_UPGRADES?`${car.name.toUpperCase()} · FULLY UPGRADED ✓`:`UPGRADE ${car.name.toUpperCase()} · ★ ${UPGRADE_COST}`;
  $('upgrade').disabled=level>=MAX_UPGRADES;
  $('grade-open').textContent=`${GRADES[profile.grade].toUpperCase()} · ${profile.subject==='mixed'?'MIXED LEARNING':profile.subject.toUpperCase()} ↗`;
  $('sound').textContent=profile.sound?'♫':'♪';$('sound').setAttribute('aria-label',profile.sound?'Turn sound off':'Turn sound on');
  renderCourses();
}
function courseDrawing(track) {
  const path=new THREE.CatmullRomCurve3(track.points.map(p=>new THREE.Vector3(...p)),true,'catmullrom',.4);
  const d=Array.from({length:81},(_,i)=>{const p=path.getPointAt(i/80);return `${i?'L':'M'}${(90+p.x*.75).toFixed(1)},${(57+p.z*.55).toFixed(1)}`;}).join(' ');
  return `<svg viewBox="0 0 180 115" class="track-drawing" aria-hidden="true"><path d="${d}" fill="none" stroke="${track.edge}" stroke-width="15" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${track.road}" stroke-width="10"/><path d="${d}" fill="none" stroke="#fff6e0" stroke-width="1.3" stroke-dasharray="3 4"/><text x="88" y="67" text-anchor="middle" font-size="28" fill="${track.ink}">${track.icon}</text></svg>`;
}
function renderCourses(){
  $('track-list').innerHTML=TRACKS.map(track=>`<button class="track-card ${track.theme}" data-track="${track.id}" aria-label="Choose ${track.name}" aria-pressed="${profile.track===track.id}"><span class="track-number">${track.number}</span><span class="track-check">✓</span>${courseDrawing(track)}<strong>${track.name}</strong><small>${profile.records[track.id].best?'BEST '+formatTime(profile.records[track.id].best):track.character}</small></button>`).join('');
  $('track-list').querySelectorAll('[data-track]').forEach(button=>button.addEventListener('click',()=>selectTrack(button.dataset.track)));
  const track=currentTrack();$('course-name').textContent=track.name;$('course-tag').textContent=track.tag;$('course-icon').textContent=track.icon;$('course-number').textContent=track.number;$('race-course').textContent=track.name.toUpperCase();
  $('start-course').textContent=`${track.name} · 2 laps`;
  document.body.dataset.course=track.id;
}
function selectTrack(id){
  if(race.mode!=='home'||!TRACKS.some(t=>t.id===id)||profile.track===id)return;
  profile.track=id;save();buildCourse();renderCourses();$('track-list').querySelector(`[data-track="${id}"]`)?.focus();sound(620);
}
function selectCar(id,withSound=true) {
  profile.car=id;save();renderGarage();if(withSound)sound(650);
  if(hero){scene.remove(hero);disposeCar(hero);}
  hero=makeCar(CARS.find(c=>c.id===id));hero.scale.setScalar(3.5);hero.position.set(0,6.53,0);hero.rotation.y=-.35;scene.add(hero);if(withSound)$('car-list').querySelector(`[data-car="${id}"]`)?.focus();
}
function disposeCar(group){group.traverse(object=>{if(object.geometry)object.geometry.dispose();if(object.material){const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials){material.map?.dispose();material.dispose();}}});}
function openModal(id) {
  returnFocus=document.activeElement;
  if(race.mode==='racing'||race.mode==='countdown'){resumeMode=race.mode;race.mode='paused';}
  $(id).hidden=false;$(id).querySelector('button,input,select')?.focus();
}
function closeModal(id) { $(id).hidden=true;if(race.mode==='paused'&&$('pause-panel').hidden)race.mode=resumeMode;returnFocus?.focus?.(); }
function openSettings() {$('grade').value=profile.grade;$('subject').value=profile.subject;$('cadence').value=profile.cadence;$('assist').checked=profile.steerAssist;openModal('settings');}
$('settings-open').addEventListener('click',openSettings);$('grade-open').addEventListener('click',openSettings);
$('settings-form').addEventListener('submit',event=>{event.preventDefault();profile.grade=Number($('grade').value);profile.subject=$('subject').value;profile.cadence=Number($('cadence').value);profile.steerAssist=$('assist').checked;save();renderGarage();closeModal('settings');sound(700);});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>closeModal(button.closest('.modal-backdrop').id)));
$('help-open').addEventListener('click',()=>openModal('help'));
$('sound').addEventListener('click',()=>{profile.sound=!profile.sound;if(!profile.sound&&'speechSynthesis'in window)speechSynthesis.cancel();save();renderGarage();sound(600);});
$('upgrade').addEventListener('click',()=>{if(buyUpgrade(profile,profile.car)){save();renderGarage();notify('A little faster! Turbo upgrade fitted.');sound(900,.2);}else notify(`Collect ${UPGRADE_COST} garage stars to upgrade. Finish a race to bank them!`);});
$('start').addEventListener('click',startRace);$('again').addEventListener('click',startRace);$('garage').addEventListener('click',home);
$('pause').addEventListener('click',pauseRace);$('resume').addEventListener('click',()=>{$('pause-panel').hidden=true;race.mode=resumeMode;$('pause').focus();});$('quit').addEventListener('click',home);
$('boost').addEventListener('click',useBoost);
$('item-slot').addEventListener('click',useItem);

// Dedicated Hop + Drift Button
const driftBtn=$('drift');
function startDriftHold(event){
  event?.preventDefault?.();
  if(race.mode==='countdown'){race.rocketCharge=Math.min(1,race.rocketCharge+.45);return;}
  if(race.mode!=='racing')return;
  if(!driftHeld){driftHeld=true;race.hopTimer=.22;sound(460,.08,'triangle');}
  driftBtn.classList.add('active');
}
function stopDriftHold(){
  driftHeld=false;driftBtn.classList.remove('active');
}
driftBtn.addEventListener('pointerdown',startDriftHold);
for(const ev of ['pointerup','pointercancel','pointerleave'])driftBtn.addEventListener(ev,stopDriftHold);
driftBtn.addEventListener('click',()=>{
  if(race.mode==='racing'&&race.driftTier>0)releaseDrift();
  else if(race.mode==='racing'){race.hopTimer=.22;sound(460,.08,'triangle');}
});

$('read-question').addEventListener('click',()=>{if(!profile.sound){profile.sound=true;save();renderGarage();}speak(question?.spoken||'');});
if(!('speechSynthesis'in window)){$('read-question').disabled=true;$('read-question').textContent='Read aloud is unavailable in this browser';}
$('skip-question').addEventListener('click',()=>{if(rewardQuestion(race,false,true)){closeQuestion();notify('Back to the fun. Another boost is on the way!');}});

function resetStick(){
  const pointer=stick.pointer;stick.pointer=null;stick.steer=0;
  $('joystick').classList.remove('active');$('joystick').style.left='';$('joystick').style.top='';$('joystick-knob').style.transform='translate(0px,0px)';$('steer-zone').setAttribute('aria-valuenow','0');
  if(pointer!==null&&$('steer-zone').hasPointerCapture?.(pointer))$('steer-zone').releasePointerCapture(pointer);
}
function clearInput(){leftHeld=false;rightHeld=false;stopDriftHold();resetStick();}
const steerZone=$('steer-zone');
function moveStick(event){
  let dx=event.clientX-stick.x,dy=event.clientY-stick.y;const distance=Math.hypot(dx,dy),radius=44;
  if(distance>radius){stick.x+=dx*(1-radius/distance);stick.y+=dy*(1-radius/distance);dx=event.clientX-stick.x;dy=event.clientY-stick.y;}
  const sample=sampleJoystick(dx,dy,radius),bounds=steerZone.getBoundingClientRect();stick.steer=sample.steer;
  $('joystick').style.left=`${stick.x-bounds.left}px`;$('joystick').style.top=`${stick.y-bounds.top}px`;
  $('joystick-knob').style.transform=`translate(${sample.x}px,${sample.y}px)`;steerZone.setAttribute('aria-valuenow',String(Math.round(stick.steer*100)));
}
steerZone.addEventListener('pointerdown',event=>{
  if(!['racing','countdown'].includes(race.mode)||stick.pointer!==null||(event.pointerType==='mouse'&&event.button!==0))return;
  event.preventDefault();stick.pointer=event.pointerId;stick.x=event.clientX;stick.y=event.clientY;steerZone.setPointerCapture(event.pointerId);moveStick(event);$('joystick').classList.add('active');
});
steerZone.addEventListener('pointermove',event=>{if(event.pointerId===stick.pointer)moveStick(event);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])steerZone.addEventListener(name,event=>{if(event.pointerId===stick.pointer)resetStick();});
steerZone.addEventListener('contextmenu',event=>event.preventDefault());
window.addEventListener('keydown',event=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;
  if(event.key==='Escape'){
    if(!$('settings').hidden)closeModal('settings');else if(!$('help').hidden)closeModal('help');else if(race.mode==='racing'||race.mode==='countdown')pauseRace();
  }
  if(race.mode==='countdown'&&[' ','Shift','w','W','ArrowUp'].includes(event.key)){
    event.preventDefault();
    if(countdownTime>=1.65&&countdownTime<=2.95)race.rocketCharge=Math.min(1,race.rocketCharge+.4);
    return;
  }
  if(race.mode!=='racing')return;
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Shift','a','A','d','D','s','S','w','W','e','E','Enter'].includes(event.key))event.preventDefault();
  if(['ArrowLeft','a','A'].includes(event.key))leftHeld=true;
  if(['ArrowRight','d','D'].includes(event.key))rightHeld=true;
  if(['Shift','s','S','ArrowDown'].includes(event.key)&&!driftHeld){driftHeld=true;race.hopTimer=.22;driftBtn.classList.add('active');sound(460,.08,'triangle');}
  if(event.key===' '&&!event.repeat)useBoost();
  if(['e','E','Enter','w','W','ArrowUp'].includes(event.key)&&!event.repeat)useItem();
});
window.addEventListener('keyup',event=>{
  if(['ArrowLeft','a','A'].includes(event.key))leftHeld=false;
  if(['ArrowRight','d','D'].includes(event.key))rightHeld=false;
  if(['Shift','s','S','ArrowDown'].includes(event.key))stopDriftHold();
});
window.addEventListener('blur',()=>{clearInput();pauseRace();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pauseRace();}});
document.addEventListener('keydown',event=>{
  const modal=[...document.querySelectorAll('.modal-backdrop')].find(el=>!el.hidden);
  if(event.key!=='Tab'||!modal)return;
  const controls=[...modal.querySelectorAll('button:not(:disabled),select,input')].filter(el=>el.offsetParent!==null),first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
});

function roundedBox(w,h,d) {
  const r=Math.min(w,h)*.23,shape=new THREE.Shape(),x=-w/2,y=-h/2;
  shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:d-.1,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.05,bevelThickness:.05,curveSegments:4});geometry.translate(0,0,-(d-.1)/2);geometry.computeVertexNormals();return geometry;
}
function material(color,options={}) {return new THREE.MeshStandardMaterial({color,roughness:.36,metalness:.08,...options});}
function addMesh(parent,geometry,mat,x=0,y=0,z=0){const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function box(parent,w,h,d,color,x,y,z){return addMesh(parent,roundedBox(w,h,d),material(color),x,y,z);}

function createEnvMap(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
  const ctx=canvas.getContext('2d');
  const grad=ctx.createLinearGradient?.(0,0,0,128);
  if(grad){
    grad.addColorStop(0,'#ffffff');grad.addColorStop(.45,'#d9eeff');grad.addColorStop(.52,'#fff3db');grad.addColorStop(1,'#8f7ab8');
    ctx.fillStyle=grad;ctx.fillRect(0,0,256,128);
  }else{
    ctx.fillStyle='#d9eeff';ctx.fillRect(0,0,256,64);ctx.fillStyle='#8f7ab8';ctx.fillRect(0,64,256,64);
  }
  const tex=new THREE.CanvasTexture(canvas);
  tex.mapping=THREE.EquirectangularReflectionMapping;
  tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
}

function makeCar(car) {
  const group=new THREE.Group(),wheels=[],frontWheels=[],flames=[],sparks=[];
  group.userData={wheels,frontWheels,flames,sparks,baseColor:car.color};
  const bodyMesh=box(group,1.88,.48,3.48,car.color,0,.68,0);
  group.userData.bodyMesh=bodyMesh;
  box(group,1.82,.19,3.15,car.accent,0,.43,0);
  // Front bumper & side pods (Mario Kart silhouette)
  box(group,1.65,.18,.42,'#2f2947',0,.48,1.72);
  for(const side of [-1,1])box(group,.26,.28,1.55,car.accent,side*.98,.54,-.05);

  const glass=material('#323759',{roughness:.12,metalness:.28});
  if(car.shape==='van'){
    box(group,1.77,1.25,2.65,car.color,0,1.38,-.22);
    addMesh(group,roundedBox(1.48,.64,.06),glass,0,1.56,1.14);
    addMesh(group,roundedBox(.05,.62,1.65),glass,-.91,1.56,-.25);addMesh(group,roundedBox(.05,.62,1.65),glass,.91,1.56,-.25);
    box(group,1.55,.08,2.5,car.accent,0,2.03,-.2);
  }else if(car.shape==='buggy'){
    box(group,1.27,.55,1.15,'#41415c',0,1.01,-.3);
    box(group,1.55,.15,1.55,car.accent,0,1.63,-.3);
    for(const x of [-.66,.66])for(const z of [-.85,.35])box(group,.12,.75,.12,car.color,x,1.25,z);
    box(group,1.3,.27,.8,car.color,0,.99,1.1);
  }else{
    addMesh(group,roundedBox(1.35,.52,.95),glass,0,1.06,.22);
    box(group,.28,.08,1.2,car.accent,0,.95,1.05);
    box(group,2.15,.16,.58,car.accent,0,1.22,-1.58);
    box(group,.15,.48,.15,car.color,-.55,.95,-1.58);box(group,.15,.48,.15,car.color,.55,.95,-1.58);
  }

  // Expressive seated Driver Character with Helmet, Visor & Scarf!
  const driver=new THREE.Group();
  const driverY=car.shape==='van'?1.55:1.18;
  driver.position.set(0,driverY,-.18);
  addMesh(driver,new THREE.SphereGeometry(.38,16,14),material(car.helmet||'#fff8e7',{roughness:.2,metalness:.1}),0,.22,0);
  addMesh(driver,roundedBox(.52,.18,.26),material('#231e38',{roughness:.08,metalness:.4}),0,.22,.24);
  addMesh(driver,roundedBox(.12,.08,.62),material(car.accent),0,.49,0);
  // Fluttering scarf tail
  const scarf=addMesh(driver,roundedBox(.22,.09,.55),material(car.accent,{emissive:car.accent,emissiveIntensity:.2}),.18,.04,-.38);
  scarf.rotation.x=-.22;
  group.add(driver);group.userData.driver=driver;

  // Twin Chrome Exhaust Pipes + 3D Boost Flame Plumes
  const chromeMat=material('#e8ecf7',{metalness:.65,roughness:.18});
  const flameGeo=new THREE.ConeGeometry(.24,.95,10);flameGeo.rotateX(-Math.PI/2);
  for(const side of [-1,1]){
    const pipe=addMesh(group,new THREE.CylinderGeometry(.13,.16,.58,10),chromeMat,side*.46,.62,-1.78);
    pipe.rotation.x=Math.PI/2.3;
    const flame=new THREE.Mesh(flameGeo,new THREE.MeshBasicMaterial({color:'#ff9f1c',transparent:true,opacity:.9}));
    flame.position.set(side*.46,.64,-2.28);flame.visible=false;
    group.add(flame);flames.push(flame);
  }

  // Rear Tire Drift Spark Emitters (Blue -> Orange -> Pink)
  const sparkGeo=new THREE.OctahedronGeometry(.28,0);
  for(const side of [-1,1]){
    const spark=new THREE.Mesh(sparkGeo,new THREE.MeshBasicMaterial({color:'#3ec6ff',transparent:true,opacity:.92}));
    spark.position.set(side*1.08,.35,-1.18);spark.visible=false;
    group.add(spark);sparks.push(spark);
  }

  for(const x of [-.61,.61]){box(group,.39,.18,.12,'#fff5bc',x,.78,1.76);box(group,.3,.12,.12,'#ff5e78',x,.74,-1.77);}
  const radius=car.shape==='buggy'?.57:.47;
  for(const x of [-.99,.99])for(const z of [-1.08,1.08]){
    const pivot=new THREE.Group();pivot.position.set(x,radius,z);
    const wheel=new THREE.Group();
    const tire=addMesh(wheel,new THREE.CylinderGeometry(radius,radius,.39,18),material('#29263b',{roughness:.88}));tire.rotation.z=Math.PI/2;
    const hub=addMesh(wheel,new THREE.CylinderGeometry(radius*.54,radius*.54,.41,14),material('#fffbec',{metalness:.25,roughness:.25}));hub.rotation.z=Math.PI/2;
    const dot=addMesh(wheel,new THREE.CylinderGeometry(radius*.2,radius*.2,.43,10),material(car.color));dot.rotation.z=Math.PI/2;
    pivot.add(wheel);group.add(pivot);wheels.push(wheel);
    if(z>0)frontWheels.push(pivot);
  }
  const bubble=addMesh(group,new THREE.SphereGeometry(2.35,20,14),new THREE.MeshStandardMaterial({color:'#a2eaff',transparent:true,opacity:.22,roughness:.08,metalness:.1,depthWrite:false}),0,1,0);bubble.visible=false;group.userData.bubble=bubble;
  return group;
}

const frameAt=u=>{const t=((u%1)+1)%1,point=curve.getPointAt(t),tangent=curve.getTangentAt(t).normalize(),right=new THREE.Vector3(-tangent.z,0,tangent.x).normalize();return {point,tangent,right};};
function placeOnTrack(object,u,offset=0,height=0){const frame=frameAt(u);object.position.copy(frame.point).addScaledVector(frame.right,offset);object.position.y+=height;object.rotation.y=Math.atan2(frame.tangent.x,frame.tangent.z);return frame;}
function textTexture(text,bg='#fff8e6',color='#44345e',width=512,height=128) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${height*.46}px Trebuchet MS,Arial`;ctx.fillText(text,width/2,height/2,width*.93);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function makeStar(){const shape=new THREE.Shape();for(let i=0;i<10;i++){const r=i%2?.42:.9,a=Math.PI/2+i*Math.PI/5,x=Math.cos(a)*r,y=Math.sin(a)*r;if(!i)shape.moveTo(x,y);else shape.lineTo(x,y);}shape.closePath();return new THREE.ExtrudeGeometry(shape,{depth:.2,bevelEnabled:true,bevelThickness:.06,bevelSize:.06,bevelSegments:1,steps:1});}

function spawnBurst(pos,color='#ffcf40',count=8){
  if(!fxGroup||reducedMotion)return;
  for(let i=0;i<count;i++){
    const a=(i/count)*Math.PI*2+Math.random()*.4,spd=2.5+Math.random()*4.5;
    const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.22,0),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95}));
    mesh.position.copy(pos).add(new THREE.Vector3((Math.random()-.5)*.8,.5+Math.random()*.6,(Math.random()-.5)*.8));
    fxGroup.add(mesh);
    particles.push({mesh,vx:Math.cos(a)*spd,vy:2.2+Math.random()*3.2,vz:Math.sin(a)*spd,life:.48});
  }
}

function clearHazardsAndFx(){
  if(!fxGroup)return;
  for(const h of hazards){fxGroup.remove(h.mesh);disposeCar(h.mesh);}hazards=[];
  for(const p of particles){fxGroup.remove(p.mesh);disposeCar(p.mesh);}particles=[];
}

function initWorld() {
  renderer=new THREE.WebGLRenderer({antialias:devicePixelRatio<2,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.appendChild(renderer.domElement);
  scene=new THREE.Scene();scene.background=new THREE.Color('#c7e1f5');scene.environment=createEnvMap();
  camera=new THREE.PerspectiveCamera(49,innerWidth/innerHeight,.1,420);camera.position.set(56,44,70);
  ambient=new THREE.HemisphereLight('#fffbee','#a0afbd',2.4);scene.add(ambient);sun=new THREE.DirectionalLight('#fff4df',3.5);sun.position.set(25,75,35);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-110,right:110,top:110,bottom:-110,near:.5,far:190});sun.shadow.normalBias=.06;scene.add(sun);
  const fill=new THREE.DirectionalLight('#d2c7ff',1.15);fill.position.set(-45,18,-45);scene.add(fill);
  fxGroup=new THREE.Group();scene.add(fxGroup);
  heroPlatform=new THREE.Group();addMesh(heroPlatform,new THREE.CylinderGeometry(8.5,8.5,1.7,64),material('#cab8ed'),0,5.3,0);addMesh(heroPlatform,new THREE.CylinderGeometry(8.2,8.2,.3,64),material('#fff5df'),0,6.35,0);addMesh(heroPlatform,new THREE.TorusGeometry(8.4,.18,8,64),material('#fff2ff'),0,5.8,0).rotation.x=Math.PI/2;scene.add(heroPlatform);
  buildCourse();selectCar(profile.car,false);
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();pauseRace();$('load-error').hidden=false;});
  window.addEventListener('resize',()=>{clearInput();resize();});resize();
}
function buildCourse(){
  if(courseGroup){scene.remove(courseGroup);disposeWorld(courseGroup);}
  clearHazardsAndFx();
  const track=currentTrack(),world=createWorld({THREE,track,box,addMesh,roundedBox,material,textTexture,makeStar}),night=track.theme==='forest';
  courseGroup=world.group;curve=world.curve;trackLength=world.length;pickups=world.pickups;boostPads=world.boostPads;itemBoxes=world.itemBoxes||[];ramps=world.ramps||[];scene.add(courseGroup);
  scene.background.set(track.sky);scene.fog=new THREE.Fog(track.sky,115,300);ambient.color.set(night?'#e0d7ff':'#fffbee');ambient.groundColor.set(night?'#66718c':'#a0afbd');ambient.intensity=night?1.7:2.4;sun.color.set(night?'#bfcfff':'#fff4df');sun.intensity=night?2.1:3.5;
  heroPlatform.children[0].material.color.set(track.edge);heroPlatform.children[1].material.color.set(night?'#a5a3c3':'#fff5df');
}
function resize(){if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
function home(){
  for(const id of ['pause-panel','finish','challenge','countdown','race-ui'])$(id).hidden=true;
  race.mode='home';clearInput();clearHazardsAndFx();$('home').hidden=false;document.body.classList.remove('racing');
  player&&(player.visible=false);rivals.forEach(r=>r.mesh.visible=false);hero.visible=true;heroPlatform.visible=true;
  pickups.forEach(p=>p.mesh.visible=true);itemBoxes.forEach(b=>{b.cooldown=0;b.mesh.visible=true;});
  renderGarage();$('start').focus();
}
function startRace(){
  if(!renderer){$('load-error').hidden=false;return;}
  ['home','finish','pause-panel','challenge'].forEach(id=>$(id).hidden=true);$('race-ui').hidden=false;document.body.classList.add('racing');
  race=createRace();speed=0;lane=0;clearInput();clearHazardsAndFx();countdownTime=0;countdownNumber='';hero.visible=false;heroPlatform.visible=false;
  if(player){scene.remove(player);disposeCar(player);}player=makeCar(CARS.find(c=>c.id===profile.car));scene.add(player);
  rivals.forEach(r=>{scene.remove(r.mesh);disposeCar(r.mesh);});rivals=[];
  for(let i=0;i<3;i++){const mesh=makeCar(CARS[(i+1)%CARS.length]);scene.add(mesh);rivals.push({mesh,distance:4+i*3.5,lane:[-3.3,0,3.3][i],speed:13.7+i*.22,finished:false,spinTimer:0,shrinkTimer:0});}
  const frame=placeOnTrack(player,0,0,.15);camera.position.copy(frame.point).addScaledVector(frame.tangent,-13).add(new THREE.Vector3(0,7.4,0));camera.lookAt(frame.point.clone().addScaledVector(frame.tangent,12).add(new THREE.Vector3(0,1.7,0)));
  rivals.forEach(r=>placeOnTrack(r.mesh,r.distance/trackLength,r.lane,.15));
  pickups.forEach(p=>p.mesh.visible=true);itemBoxes.forEach(b=>{b.cooldown=0;b.mesh.visible=true;});
  $('countdown').hidden=false;$('power-status').textContent='';$('drift-badge').hidden=true;updateHud();sound(420);speak('Ready, set, zoom!');$('pause').focus();
}
function pauseRace(){if(!['racing','countdown'].includes(race.mode))return;clearInput();resumeMode=race.mode;race.mode='paused';$('pause-panel').hidden=false;$('resume').focus();}
function useBoost(){
  if(race.mode==='countdown'){
    if(countdownTime>=1.65&&countdownTime<=2.95)race.rocketCharge=Math.min(1,race.rocketCharge+.45);
    return;
  }
  if(race.mode!=='racing'||race.energy<=0)return;
  race.energy--;race.boost=Math.max(race.boost,2.8);
  if(player)spawnBurst(player.position,'#ffeb3b',10);
  sound(800,.25,'triangle');notify('Rainbow boost! 🌈');updateHud();
}

function makeHazardMesh(kind){
  const g=new THREE.Group();
  if(kind==='shell'){
    addMesh(g,new THREE.SphereGeometry(.72,14,10),material('#2ec4b6',{roughness:.2,metalness:.2}),0,.55,0).scale.set(1,.72,1);
    addMesh(g,new THREE.TorusGeometry(.64,.12,8,16),material('#fff8e6'),0,.38,0).rotation.x=Math.PI/2;
  }else{
    const peel=addMesh(g,new THREE.ConeGeometry(.55,1.15,8),material('#ffe64d',{roughness:.25,emissive:'#cca000',emissiveIntensity:.25}),0,.58,0);
    peel.rotation.z=.18;
  }
  return g;
}

function useItem(){
  if(race.mode!=='racing'||!race.item||race.rouletteTimer>0)return;
  const current=race.item;
  if(current==='mushroom'||current==='triple-shroom'){
    race.boost=Math.max(race.boost,2.35);
    if(player)spawnBurst(player.position,'#ff5e78',10);
    sound(860,.22,'triangle');
    notify(current==='triple-shroom'?`Dash Shroom burst! (${race.itemCharges-1} left) 🍄`:'Dash Shroom turbo! 🍄');
  }else if(current==='shell'){
    const mesh=makeHazardMesh('shell');
    fxGroup.add(mesh);
    hazards.push({kind:'shell',mesh,distance:race.distance+2.5,lane,speed:speed+22,life:5.5});
    sound(720,.18,'square');notify('Green Shell launched! 🐢');
  }else if(current==='star-power'){
    race.starPower=6.5;race.boost=Math.max(race.boost,3.2);race.shield=Math.max(race.shield,6.5);
    if(player)spawnBurst(player.position,'#ffe66d',14);
    fanfare([587,740,880,1175],.055);notify('SUPER STAR POWER! Invincible turbo! 🌟');
  }else if(current==='lightning'){
    race.lightningTimer=6.0;
    rivals.forEach(r=>{r.shrinkTimer=6.0;r.spinTimer=1.35;spawnBurst(r.mesh.position,'#ffe600',8);});
    triggerFlash();fanfare([980,620,420,880],.05);notify('LIGHTNING STRIKE! Rivals shrunk! ⚡');
  }else if(current==='banana'){
    const mesh=makeHazardMesh('banana');
    placeOnTrack(mesh,Math.max(0,race.distance-2.4)/trackLength,lane,.05);
    fxGroup.add(mesh);
    hazards.push({kind:'banana',mesh,distance:Math.max(0,race.distance-2.4),lane,speed:0,life:18});
    sound(510,.14,'sine');notify('Banana peel dropped! 🍌');
  }
  race.itemCharges--;
  if(race.itemCharges<=0){race.item=null;race.itemCharges=0;}
  updateHud();
}

function releaseDrift(){
  if(race.driftTier>0){
    const durations=[0,1.15,1.9,2.75],labels=['','MINI-TURBO! ⚡','SUPER MINI-TURBO! 🔥','ULTRA MINI-TURBO! 🌈'],colors=['','#3ec6ff','#ff9233','#ff49b8'];
    race.boost=Math.max(race.boost,durations[race.driftTier]);
    race.miniTurbos++;
    if(player)spawnBurst(player.position,colors[race.driftTier],8+race.driftTier*3);
    fanfare([560+race.driftTier*90,740+race.driftTier*110,980+race.driftTier*130],.045);
    notify(labels[race.driftTier]);
  }
  race.drifting=false;race.driftDir=0;race.driftCharge=0;race.driftTier=0;
  driftBtn.dataset.tier='0';$('drift-tier').textContent='HOP & SLIDE';$('drift-badge').hidden=true;
}

function showQuestion(){
  clearInput();
  for(let i=0;i<6;i++){question=makeQuestion(profile.grade,profile.subject);if(question.key!==lastQuestion)break;}lastQuestion=question.key;
  $('question-emoji').textContent=question.emoji;$('challenge-title').textContent=question.prompt;$('question-display').textContent=question.display;$('answer-feedback').textContent=question.kind==='spelling'?`${question.hint}. Every racer is waiting.`:'Take your time. Every racer is waiting.';
  $('answers').replaceChildren();
  for(const answer of question.choices){const button=document.createElement('button');button.className='answer';button.textContent=answer;button.addEventListener('click',()=>{
    if(answer!==question.answer){sound(270);button.disabled=true;button.classList.add('wrong');$('answer-feedback').textContent=`Good try! ${question.hint} Try another, or keep racing.`;$('answers').querySelector('button:not(:disabled)')?.focus();return;}
    if(rewardQuestion(race,true)){closeQuestion();sound(880,.2);notify('Brilliant! +4 stars & a rainbow boost ✦');}
  });$('answers').appendChild(button);}
  $('challenge').hidden=false;$('answers').querySelector('button').focus();sound(640,.17);speak(question.spoken);
}
function closeQuestion(){$('challenge').hidden=true;if('speechSynthesis'in window)speechSynthesis.cancel();$('boost').focus();updateHud();}
function updateHud(){
  const position=1+rivals.filter(r=>r.distance>race.distance).length,ordinal=['','ST','ND','RD','TH'][position];
  $('place').innerHTML=`${position}<small>${ordinal}</small>`;$('lap').innerHTML=`LAP ${Math.min(2,Math.floor(race.distance/trackLength)+1)} <span>/ 2</span>`;$('progress').style.width=`${Math.min(100,race.distance/(trackLength*2)*100)}%`;
  $('race-stars').textContent=race.earned;$('next-challenge').textContent=`${Math.max(0,Math.ceil(profile.cadence-(race.elapsed-race.challengeAt)))}s`;$('speed').textContent=Math.round(speed*4.7);
  $('race-time').textContent=race.elapsed>0?formatTime(race.elapsed):'0:00';
  $('boost-count').textContent=race.energy?`${race.energy} ready`:'Collect a brain boost';$('boost').disabled=race.energy<1||race.mode!=='racing';
  $('boost').style.setProperty('--charge',`${race.energy/3}turn`);$('boost').setAttribute('aria-label',`Rainbow boost, ${race.energy} ready`);
  $('power-status').textContent=race.starPower>0?'🌟 SUPER STAR INVINCIBLE':race.lightningTimer>0?'⚡ RIVALS SHRUNK':race.boost>0?'🌈 TURBO SPEED':race.shield>0?'🫧 BUBBLE CRUISE':race.magnet>0?'🧲 STAR MAGNET':'';

  // Update Mario Kart Item Roulette Box UI
  const slot=$('item-slot'),icon=$('item-icon'),name=$('item-name'),hint=$('item-hint');
  if(race.rouletteTimer>0){
    const spinItem=ITEMS[Math.floor(performance.now()/85)%ITEMS.length];
    slot.disabled=true;slot.classList.add('spinning');
    icon.textContent=spinItem.icon;name.textContent='ROULETTE...';hint.textContent='SPINNING';
  }else if(race.item){
    const def=ITEMS.find(it=>it.id===race.item)||ITEMS[0];
    slot.disabled=race.mode!=='racing';slot.classList.remove('spinning');
    icon.textContent=def.icon;name.textContent=def.name;
    hint.textContent=race.itemCharges>1?`TAP / E · ×${race.itemCharges}`:'TAP OR PRESS E';
  }else{
    slot.disabled=true;slot.classList.remove('spinning');
    icon.textContent='?';name.textContent='ITEM BOX';hint.textContent='DRIVE THRU ? BOX';
  }
}
function checkPickups(before,after,position){
  const lap=Math.floor(before/trackLength);
  for(const item of pickups){
    const at=lap*trackLength+item.u*trackLength,key=`${lap}:${item.u}`;
    if(before<=at&&after>=at&&!race.collected.has(key)&&Math.abs(lane-item.lane)<(race.magnet>0?12:2.2)){
      race.collected.add(key);item.mesh.visible=false;
      if(item.kind==='star'){race.earned++;sound(900,.06);}else if(item.kind==='shield'){race.shield=7;notify('Bubble cruise! Keep your speed on the grass. 🫧');sound(570,.17);}else{race.magnet=9;notify('Star magnet! Nearby stars come to you. 🧲');sound(730,.17);}
    }
  }
  for(const pad of boostPads){
    const at=lap*trackLength+pad.u*trackLength;
    if(before<=at&&after>=at&&Math.abs(lane)<3.7){
      race.boost=Math.max(race.boost,1.8);
      if(player)spawnBurst(player.position,'#dfff88',8);
      sound(670,.15,'triangle');
    }
  }
  // Check Rainbow `?` Item Boxes
  for(const boxItem of itemBoxes){
    if(boxItem.cooldown>0)continue;
    const at=lap*trackLength+boxItem.u*trackLength;
    if(before<=at&&after>=at&&Math.abs(lane-boxItem.lane)<2.35){
      boxItem.cooldown=4.5;boxItem.mesh.visible=false;
      if(player)spawnBurst(player.position,'#ff6ec7',10);
      if(!race.item&&race.rouletteTimer<=0){
        const rolled=rollItem(position);
        race.item=rolled;
        race.itemCharges=rolled==='triple-shroom'?3:1;
        race.rouletteTimer=1.15;
        fanfare([520,660,780,920],.05);
      }else{
        race.earned++;sound(840,.09);
      }
      updateHud();
    }
  }
  // Check Trick Jump Ramps!
  for(const ramp of ramps){
    const at=lap*trackLength+ramp.u*trackLength;
    if(before<=at&&after>=at&&Math.abs(lane-ramp.lane)<ramp.width&&race.airY<=.05){
      race.airVy=10.8;race.trickTimer=.68;race.tricks++;
      race.boost=Math.max(race.boost,1.75);
      if(player)spawnBurst(player.position,'#00f5d4',12);
      fanfare([640,820,1080],.05);notify('TRICK JUMP BOOST! 360° Flip! 🤸');
    }
  }
  if(Math.floor(after/trackLength)>lap){pickups.forEach(p=>p.mesh.visible=true);notify('FINAL LAP! Let’s go! 🏁');fanfare([587,740,880,1175],.06);}
}
function finishRace(){
  const position=1+rivals.filter(r=>r.distance>=trackLength*2).length;settleRace(profile,race,position);save();clearInput();
  $('finish-title').textContent=position===1?'Grand Prix Champion! 🏆':'What a happy race!';
  const flair=(race.miniTurbos||race.tricks)?` (${race.miniTurbos} mini-turbos, ${race.tricks} trick jumps!)`:'';
  $('finish-description').textContent=`${currentTrack().name} in ${formatTime(race.elapsed)}${flair}. ${race.skipped?'You kept racing your way.':'Your garage has a little more sparkle.'}`;
  $('finish-place').textContent=['','1st','2nd','3rd','4th'][position];$('finish-stars').textContent=`+${race.earned}`;$('finish-brains').textContent=race.answered;$('finish').hidden=false;$('again').focus();
  fanfare([523,659,784,1046,1318],.07);
}
function updateRace(dt){
  if(race.mode==='countdown'){
    countdownTime+=dt;const label=countdownTime<3?String(3-Math.floor(countdownTime)):'GO!';
    if(driftHeld&&countdownTime>=1.65&&countdownTime<=2.95)race.rocketCharge=Math.min(1,race.rocketCharge+dt*.9);
    if(label!==countdownNumber){
      countdownNumber=label;$('countdown').textContent=label;sound(label==='GO!'?900:450,.13);
      if(label==='GO!'&&race.rocketCharge>=.25&&!race.rocketTriggered){
        race.rocketTriggered=true;race.boost=Math.max(race.boost,1.95);
        if(player)spawnBurst(player.position,'#ff9f1c',14);
        notify('ROCKET START! 🚀');fanfare([660,880,1175],.05);
      }
    }
    if(countdownTime>=3.6){race.mode='racing';$('countdown').hidden=true;updateHud();}return;
  }
  if(race.mode!=='racing')return;
  if(advanceClock(race,dt,profile.cadence)){showQuestion();updateHud();return;}

  // Item Roulette countdown
  if(race.rouletteTimer>0){
    race.rouletteTimer=Math.max(0,race.rouletteTimer-dt);
    if(race.rouletteTimer===0){
      const def=ITEMS.find(it=>it.id===race.item);
      if(def){sound(940,.14,'triangle');notify(`Got ${def.name}! ${def.icon}`);}
      updateHud();
    }
  }

  const steer=leftHeld||rightHeld?(rightHeld?1:0)-(leftHeld?1:0):stick.steer;
  // Hop & Power-Slide Drift + 3-Tier Mini-Turbo logic
  const wantsDrift=(driftHeld&&Math.abs(steer)>.18)||Math.abs(steer)>.68;
  if(wantsDrift&&speed>9){
    if(!race.drifting){race.drifting=true;race.driftDir=Math.sign(steer)||1;if(race.hopTimer<=0)race.hopTimer=.18;}
    race.driftCharge+=dt*(driftHeld?1.35:1)*(Math.abs(steer)>.5?1.15:.85);
    const nextTier=computeDriftTier(race.driftCharge);
    if(nextTier>race.driftTier){
      race.driftTier=nextTier;
      sound(540+nextTier*140,.09,'triangle');
      driftBtn.dataset.tier=String(nextTier);
      $('drift-tier').textContent=['HOP & SLIDE','BLUE SPARKS','ORANGE SPARKS','PINK ULTRA!'][nextTier];
      const badge=$('drift-badge');badge.hidden=false;badge.dataset.tier=String(nextTier);
      badge.textContent=['','⚡ MINI-TURBO READY','🔥 SUPER TURBO READY','🌈 ULTRA TURBO READY'][nextTier];
    }
  }else if(race.drifting){
    releaseDrift();
  }

  const steerRate=race.drifting?7.6:6.8;
  lane=THREE.MathUtils.clamp(lane+steer*dt*steerRate,-8.1,8.1);
  if(!steer&&profile.steerAssist&&!race.drifting)lane*=Math.exp(-dt*.3);

  // Coin/Star speed scaling (up to +10% top speed for 10 stars) + Star Power + Boost
  const starBonus=1+Math.min(10,race.earned)*.01;
  const onGrass=Math.abs(lane)>5.8&&race.shield<=0&&race.starPower<=0;
  const boostAdd=(race.starPower>0?9.8:0)+(race.boost>0?8.5:0);
  const target=(14.6+profile.upgrades[profile.car]*.6+boostAdd)*starBonus*(onGrass?.62:1);
  speed=THREE.MathUtils.lerp(speed,target,1-Math.exp(-dt*2.4));
  const before=race.distance;race.distance+=speed*dt;
  const currentPos=1+rivals.filter(r=>r.distance>race.distance).length;
  checkPickups(before,race.distance,currentPos);

  // Timers & Physics (Jump arc + Hop)
  race.boost=Math.max(0,race.boost-dt);race.shield=Math.max(0,race.shield-dt);race.magnet=Math.max(0,race.magnet-dt);
  race.starPower=Math.max(0,race.starPower-dt);race.lightningTimer=Math.max(0,race.lightningTimer-dt);
  race.hopTimer=Math.max(0,race.hopTimer-dt);race.trickTimer=Math.max(0,race.trickTimer-dt);
  if(race.airY>0||race.airVy!==0){
    race.airY+=race.airVy*dt;race.airVy-=28*dt;
    if(race.airY<=0){race.airY=0;race.airVy=0;}
  }
  const hopOffset=race.hopTimer>0?Math.sin((race.hopTimer/.22)*Math.PI)*.42:0;
  const frame=placeOnTrack(player,race.distance/trackLength,lane,.15+race.airY+hopOffset);
  // Drift yaw angle + Trick 360° flip + steering lean
  player.rotation.y+=race.drifting?-race.driftDir*.26:-steer*.06;
  player.rotation.z=-steer*(race.drifting?.16:.09);
  player.rotation.x=race.trickTimer>0?(1-race.trickTimer/.68)*Math.PI*2:0;
  player.userData.bubble.visible=race.shield>0||race.starPower>0;

  // Rainbow Star Power shader tint
  if(player.userData.bodyMesh){
    if(race.starPower>0)player.userData.bodyMesh.material.color.setHSL((performance.now()*.0015)%1,.9,.62);
    else player.userData.bodyMesh.material.color.set(player.userData.baseColor);
  }
  // Driver head lean & front wheel steering pivot
  if(player.userData.driver)player.userData.driver.rotation.z=-steer*.32;
  player.userData.frontWheels?.forEach(fw=>{fw.rotation.y=-steer*.38;});
  player.userData.wheels.forEach(w=>w.rotation.x+=speed*dt*1.8);

  // Exhaust Boost Flames & Rear Tire Drift Sparks
  const flameColor=race.starPower>0?'#ff66d8':race.driftTier===3?'#ff49b8':race.driftTier===2?'#ff9233':'#3ec6ff';
  player.userData.flames?.forEach(f=>{
    f.visible=race.boost>0||race.starPower>0;
    if(f.visible){
      f.material.color.set(race.starPower>0?'#ffe66d':'#ff8c2b');
      f.scale.setScalar(.85+Math.sin(performance.now()*.03)*.25);
    }
  });
  const sparkColors=['#3ec6ff','#3ec6ff','#ff9233','#ff49b8'];
  player.userData.sparks?.forEach(s=>{
    s.visible=race.drifting&&race.driftTier>0;
    if(s.visible){
      s.material.color.set(sparkColors[race.driftTier]);
      s.rotation.y+=dt*12;s.scale.setScalar(.8+race.driftTier*.22+Math.sin(performance.now()*.04)*.2);
    }
  });

  // Slipstream / Drafting check behind rivals
  let draftingNow=false;
  for(let i=0;i<rivals.length;i++){
    const r=rivals[i];
    r.spinTimer=Math.max(0,(r.spinTimer||0)-dt);
    r.shrinkTimer=Math.max(0,(r.shrinkTimer||0)-dt);
    const gap=r.distance-race.distance;
    const shrinkFactor=r.shrinkTimer>0?.68:1;
    const spinFactor=r.spinTimer>0?.32:1;
    const pace=(r.speed+Math.sin(race.elapsed*.6+i)*.45+(gap<-45?.8:gap>35?-.9:0))*shrinkFactor*spinFactor;
    r.distance=Math.min(trackLength*2,r.distance+pace*dt);
    const rLane=r.lane+Math.sin(race.elapsed*.5+i)*.5;
    placeOnTrack(r.mesh,r.distance/trackLength,rLane,.15);
    r.mesh.scale.setScalar(r.shrinkTimer>0?.56:1);
    if(r.spinTimer>0)r.mesh.rotation.y+=r.spinTimer*10;
    r.mesh.userData.wheels.forEach(w=>w.rotation.x+=pace*dt*1.8);

    // Star Power collision spins out rivals on contact!
    if(race.starPower>0&&Math.abs(gap)<2.4&&Math.abs(rLane-lane)<1.8&&r.spinTimer<=0){
      r.spinTimer=1.5;spawnBurst(r.mesh.position,'#ffe66d',10);sound(760,.14,'triangle');notify('Star bump! Rival spun out! 🌟');
    }
    // Check slipstream zone behind rival
    if(gap>1.8&&gap<9.5&&Math.abs(rLane-lane)<1.65)draftingNow=true;
  }
  if(draftingNow&&race.boost<=0){
    race.draftTimer+=dt;
    if(race.draftTimer>=1.0){
      race.draftTimer=0;race.boost=Math.max(race.boost,1.55);
      if(player)spawnBurst(player.position,'#ffffff',8);
      sound(780,.18,'triangle');notify('SLIPSTREAM DRAFT BOOST! 💨');
    }
  }else{
    race.draftTimer=Math.max(0,race.draftTimer-dt*1.5);
  }

  // Update active 3D Shells & Bananas on track
  for(let i=hazards.length-1;i>=0;i--){
    const h=hazards[i];h.life-=dt;
    if(h.kind==='shell'){
      h.distance+=h.speed*dt;
      // Gently home toward nearest rival ahead
      const ahead=rivals.find(r=>r.distance>h.distance-1&&r.distance<h.distance+28);
      if(ahead){
        const targetLane=ahead.lane+Math.sin(race.elapsed*.5+rivals.indexOf(ahead))*.5;
        h.lane=THREE.MathUtils.lerp(h.lane,targetLane,1-Math.exp(-dt*5));
      }
      placeOnTrack(h.mesh,h.distance/trackLength,h.lane,.12);
      h.mesh.rotation.y+=dt*14;
    }
    // Check collision with rivals
    for(let j=0;j<rivals.length;j++){
      const r=rivals[j],rLane=r.lane+Math.sin(race.elapsed*.5+j)*.5;
      if(Math.abs(r.distance-h.distance)<2.3&&Math.abs(rLane-h.lane)<1.85&&r.spinTimer<=0){
        r.spinTimer=1.6;h.life=0;
        spawnBurst(r.mesh.position,h.kind==='shell'?'#2ec4b6':'#ffe64d',12);
        sound(820,.18,'square');
        notify(h.kind==='shell'?'DIRECT SHELL HIT! Rival spun out! 🐢':'Rival slipped on your Banana! 🍌');
        break;
      }
    }
    if(h.life<=0){fxGroup.remove(h.mesh);disposeCar(h.mesh);hazards.splice(i,1);}
  }

  // Dynamic Chase Camera + FOV Speed Kick
  const targetFov=(race.boost>0||race.starPower>0)&&!reducedMotion?57:49;
  if(Math.abs(camera.fov-targetFov)>.05){camera.fov=THREE.MathUtils.lerp(camera.fov,targetFov,1-Math.exp(-dt*6));camera.updateProjectionMatrix();}
  const distance=innerWidth<700?14.5:12.5,height=innerWidth<700?8.5:6.5;
  const goal=frame.point.clone().addScaledVector(frame.right,lane*.6).addScaledVector(frame.tangent,-distance).add(new THREE.Vector3(0,height+(race.boost>0&&!reducedMotion?.3:0),0));
  camera.position.lerp(goal,1-Math.exp(-dt*5));const look=frameAt(race.distance/trackLength+.022).point.addScaledVector(frame.right,lane*.3);look.y+=1.3;camera.lookAt(look);
  if(race.distance>=trackLength*2)finishRace();
}
const mapContext=$('minimap').getContext('2d');
function drawMap(){
  const ctx=mapContext,w=210,h=150;ctx.clearRect(0,0,w,h);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
  const plot=point=>[w/2+point.x*.98,h/2+point.z*.79];
  for(let i=0;i<=100;i++){const [x,y]=plot(curve.getPointAt(i/100));if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.strokeStyle=currentTrack().edge;ctx.lineWidth=10;ctx.stroke();ctx.strokeStyle=currentTrack().road;ctx.lineWidth=5;ctx.stroke();
  for(const rival of rivals){const [x,y]=plot(curve.getPointAt((rival.distance/trackLength)%1));ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#ed9c77';ctx.fill();}
  const [x,y]=plot(curve.getPointAt((race.distance/trackLength)%1));ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fillStyle='#6751b1';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
}
function loop(){
  const dt=Math.min(.05,clock.getDelta());frameCount++;
  if(race.mode==='home'){
    const portrait=innerWidth<1000&&innerHeight>innerWidth;
    const target=portrait?(innerWidth<700?new THREE.Vector3(-7,-3,2):new THREE.Vector3(-13,-13,2)):new THREE.Vector3(-22,5,8);
    const cam=portrait?new THREE.Vector3(39,34,55):new THREE.Vector3(56,44,70);
    camera.position.lerp(cam,.04);camera.lookAt(target);
    if(!reducedMotion){hero.rotation.y+=dt*.15;hero.position.y=6.53+Math.sin(performance.now()*.001)*.035;}
  }else updateRace(dt);
  if(race.mode==='home'||race.mode==='racing'){
    for(const pickup of pickups)pickup.mesh.rotation.y+=dt*1.5;
    for(const boxItem of itemBoxes){
      if(boxItem.cooldown>0){boxItem.cooldown=Math.max(0,boxItem.cooldown-dt);if(boxItem.cooldown===0)boxItem.mesh.visible=true;}
      if(boxItem.outer){boxItem.outer.rotation.y+=dt*1.9;boxItem.outer.rotation.x+=dt*1.1;}
      if(boxItem.core)boxItem.core.rotation.y-=dt*2.6;
    }
  }
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];p.life-=dt;
    p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;
    p.vy-=12*dt;p.mesh.scale.setScalar(Math.max(.01,p.life*2));
    if(p.life<=0){fxGroup.remove(p.mesh);disposeCar(p.mesh);particles.splice(i,1);}
  }
  if(frameCount%6===0&&race.mode!=='home'){updateHud();drawMap();}
  renderer.render(scene,camera);requestAnimationFrame(loop);
}
renderGarage();
try{initWorld();race.mode='home';requestAnimationFrame(loop);}catch(error){console.error('Tiny Turbo could not open the track',error);$('load-error').hidden=false;}
