import * as THREE from '/studforge/vendor/three.module.js';
import { createWorld, disposeWorld } from './world.mjs?v=1';
import { CARS, TRACKS, GRADES, UPGRADE_COST, MAX_UPGRADES, normalizeProfile, makeQuestion, createRace, advanceClock, rewardQuestion, buyUpgrade, settleRace, sampleJoystick, formatTime } from './core.mjs?v=2';

const $ = id => document.getElementById(id), STORAGE = 'tiny-turbo.club.v1';
let profile;
try { profile=normalizeProfile(JSON.parse(localStorage.getItem(STORAGE)||'{}')); } catch { profile=normalizeProfile(); }
const save=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(profile));}catch{notify('Playing without saved progress on this device.');}};
let race=createRace(), question=null, lastQuestion='', lane=0, speed=0, countdownTime=0, countdownNumber='', leftHeld=false, rightHeld=false, toastTimer, resumeMode='racing', returnFocus=null;
let renderer, scene, camera, curve, trackLength, courseGroup, sun, ambient, player, hero, heroPlatform, rivals=[], pickups=[], boostPads=[], clock=new THREE.Clock(), frameCount=0;
const currentTrack=()=>TRACKS.find(t=>t.id===profile.track);
const stick={pointer:null,x:0,y:0,steer:0};
const container=$('world'), reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let audioContext;
function sound(frequency=500,duration=.12) {
  if(!profile.sound)return;
  try {
    audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==='suspended')audioContext.resume();
    const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.setValueAtTime(frequency,audioContext.currentTime);osc.frequency.exponentialRampToValueAtTime(frequency*1.4,audioContext.currentTime+duration);
    gain.gain.setValueAtTime(.055,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration);
  }catch{/* Sound is optional; racing never depends on an audio device. */}
}
function notify(message) { clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2600); }
function speak(text) {
  if(!profile.sound||!('speechSynthesis'in window))return;
  try {speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=.82;speechSynthesis.speak(utterance);}catch{/* A missing device voice must never stop a race. */}
}
function carDrawing(car) {
  const van=car.shape==='van',buggy=car.shape==='buggy';
  return `<svg class="car-drawing" viewBox="0 0 140 75" aria-hidden="true"><ellipse cx="70" cy="64" rx="49" ry="5" fill="#282344" opacity=".1"/><path d="M17 48 Q17 38 28 37 L42 ${van?'15':'27'} Q46 ${van?'12':'23'} 53 ${van?'12':'23'} H85 Q92 23 98 34 L116 39 Q125 41 125 50 V56 H17Z" fill="${car.color}" stroke="#282344" stroke-width="2.3"/><path d="M48 ${van?'18':'28'}H79L92 36H42Z" fill="#474563"/><path d="M65 ${van?'18':'28'}V35" stroke="${car.accent}" stroke-width="3"/><path d="M20 45H123" stroke="${car.accent}" stroke-width="4"/><rect x="109" y="42" width="13" height="6" rx="2" fill="#fff6cc"/><circle cx="40" cy="55" r="${buggy?15:12}" fill="#282344"/><circle cx="40" cy="55" r="6" fill="#fcf7ed"/><circle cx="102" cy="55" r="${buggy?15:12}" fill="#282344"/><circle cx="102" cy="55" r="6" fill="#fcf7ed"/><text x="67" y="49" font-family="Arial" font-size="9" font-weight="900" fill="#282344">${car.badge}</text>${car.shape==='racer'?`<path d="M19 35H35V39H19Z" fill="${car.accent}" stroke="#282344" stroke-width="1.5"/>`:''}</svg>`;
}
function renderGarage() {
  $('wallet').textContent=profile.stars;
  $('car-list').innerHTML=CARS.map(car=>`<button class="car-card" data-color="${car.id}" data-car="${car.id}" aria-pressed="${profile.car===car.id}" aria-label="Choose ${car.name}"><span class="check">✓</span>${carDrawing(car)}<div><strong>${car.name}</strong><p>${car.nickname}</p><small>${profile.upgrades[car.id]?'TURBO LEVEL '+profile.upgrades[car.id]:'READY FOR ADVENTURE'}</small></div></button>`).join('');
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
$('read-question').addEventListener('click',()=>{if(!profile.sound){profile.sound=true;save();renderGarage();}speak(question?.spoken||'');});
if(!('speechSynthesis'in window)){$('read-question').disabled=true;$('read-question').textContent='Read aloud is unavailable in this browser';}
$('skip-question').addEventListener('click',()=>{if(rewardQuestion(race,false,true)){closeQuestion();notify('Back to the fun. Another boost is on the way!');}});

function resetStick(){
  const pointer=stick.pointer;stick.pointer=null;stick.steer=0;
  $('joystick').classList.remove('active');$('joystick').style.left='';$('joystick').style.top='';$('joystick-knob').style.transform='translate(0px,0px)';$('steer-zone').setAttribute('aria-valuenow','0');
  if(pointer!==null&&$('steer-zone').hasPointerCapture?.(pointer))$('steer-zone').releasePointerCapture(pointer);
}
function clearInput(){leftHeld=false;rightHeld=false;resetStick();}
const steerZone=$('steer-zone');
function moveStick(event){
  let dx=event.clientX-stick.x,dy=event.clientY-stick.y;const distance=Math.hypot(dx,dy),radius=44;
  // Let the base follow an overextended thumb, matching the map game's quick reversal.
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
  if(race.mode!=='racing')return;
  if(['ArrowLeft','ArrowRight',' ','a','A','d','D'].includes(event.key))event.preventDefault();
  if(['ArrowLeft','a','A'].includes(event.key))leftHeld=true;
  if(['ArrowRight','d','D'].includes(event.key))rightHeld=true;
  if(event.key===' '&&!event.repeat)useBoost();
});
window.addEventListener('keyup',event=>{if(['ArrowLeft','a','A'].includes(event.key))leftHeld=false;if(['ArrowRight','d','D'].includes(event.key))rightHeld=false;});
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
function material(color,options={}) {return new THREE.MeshStandardMaterial({color,roughness:.5,metalness:.05,...options});}
function addMesh(parent,geometry,mat,x=0,y=0,z=0){const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function box(parent,w,h,d,color,x,y,z){return addMesh(parent,roundedBox(w,h,d),material(color),x,y,z);}
function makeCar(car) {
  const group=new THREE.Group(),wheels=[];group.userData.wheels=wheels;
  box(group,1.85,.47,3.45,car.color,0,.68,0);
  box(group,1.8,.18,3.1,car.accent,0,.43,0);
  const glass=material('#393e62',{roughness:.17,metalness:.15});
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
    addMesh(group,roundedBox(1.35,.64,1.5),glass,0,1.12,-.35);
    box(group,1.13,.12,1.12,car.color,0,1.47,-.43);
    box(group,.25,.07,1.1,car.accent,0,.96,1.05);
    box(group,2.13,.16,.56,car.accent,0,1.2,-1.58);
    box(group,.15,.47,.15,car.color,-.55,.95,-1.58);box(group,.15,.47,.15,car.color,.55,.95,-1.58);
  }
  for(const x of [-.61,.61]){box(group,.39,.18,.12,'#fff5bc',x,.78,1.76);box(group,.3,.12,.12,'#ff8394',x,.74,-1.77);}
  const radius=car.shape==='buggy'?.57:.47;
  for(const x of [-.99,.99])for(const z of [-1.08,1.08]){
    const wheel=new THREE.Group();wheel.position.set(x,radius,z);
    const tire=addMesh(wheel,new THREE.CylinderGeometry(radius,radius,.37,16),material('#302d43',{roughness:.96}));tire.rotation.z=Math.PI/2;
    const hub=addMesh(wheel,new THREE.CylinderGeometry(radius*.52,radius*.52,.39,12),material('#fffbec',{metalness:.15}));hub.rotation.z=Math.PI/2;
    const dot=addMesh(wheel,new THREE.CylinderGeometry(radius*.18,radius*.18,.41,8),material(car.color));dot.rotation.z=Math.PI/2;group.add(wheel);wheels.push(wheel);
  }
  const bubble=addMesh(group,new THREE.SphereGeometry(2.35,20,14),new THREE.MeshStandardMaterial({color:'#a2eaff',transparent:true,opacity:.2,roughness:.1,metalness:.08,depthWrite:false}),0,1,0);bubble.visible=false;group.userData.bubble=bubble;
  return group;
}

const frameAt=u=>{const t=((u%1)+1)%1,point=curve.getPointAt(t),tangent=curve.getTangentAt(t).normalize(),right=new THREE.Vector3(-tangent.z,0,tangent.x).normalize();return {point,tangent,right};};
function placeOnTrack(object,u,offset=0,height=0){const frame=frameAt(u);object.position.copy(frame.point).addScaledVector(frame.right,offset);object.position.y+=height;object.rotation.y=Math.atan2(frame.tangent.x,frame.tangent.z);return frame;}
function textTexture(text,bg='#fff8e6',color='#44345e',width=512,height=128) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${height*.46}px Trebuchet MS,Arial`;ctx.fillText(text,width/2,height/2,width*.93);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function makeStar(){const shape=new THREE.Shape();for(let i=0;i<10;i++){const r=i%2?.42:.9,a=Math.PI/2+i*Math.PI/5,x=Math.cos(a)*r,y=Math.sin(a)*r;if(!i)shape.moveTo(x,y);else shape.lineTo(x,y);}shape.closePath();return new THREE.ExtrudeGeometry(shape,{depth:.2,bevelEnabled:true,bevelThickness:.06,bevelSize:.06,bevelSegments:1,steps:1});}
function initWorld() {
  renderer=new THREE.WebGLRenderer({antialias:devicePixelRatio<2,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.appendChild(renderer.domElement);
  scene=new THREE.Scene();scene.background=new THREE.Color('#c7e1f5');
  camera=new THREE.PerspectiveCamera(49,innerWidth/innerHeight,.1,420);camera.position.set(56,44,70);
  ambient=new THREE.HemisphereLight('#fffbee','#a0afbd',2.4);scene.add(ambient);sun=new THREE.DirectionalLight('#fff4df',3.5);sun.position.set(25,75,35);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-110,right:110,top:110,bottom:-110,near:.5,far:190});sun.shadow.normalBias=.06;scene.add(sun);
  const fill=new THREE.DirectionalLight('#d2c7ff',1);fill.position.set(-45,18,-45);scene.add(fill);
  heroPlatform=new THREE.Group();addMesh(heroPlatform,new THREE.CylinderGeometry(8.5,8.5,1.7,64),material('#cab8ed'),0,5.3,0);addMesh(heroPlatform,new THREE.CylinderGeometry(8.2,8.2,.3,64),material('#fff5df'),0,6.35,0);addMesh(heroPlatform,new THREE.TorusGeometry(8.4,.18,8,64),material('#fff2ff'),0,5.8,0).rotation.x=Math.PI/2;scene.add(heroPlatform);
  buildCourse();selectCar(profile.car,false);
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();pauseRace();$('load-error').hidden=false;});
  window.addEventListener('resize',()=>{clearInput();resize();});resize();
}
function buildCourse(){
  if(courseGroup){scene.remove(courseGroup);disposeWorld(courseGroup);}
  const track=currentTrack(),world=createWorld({THREE,track,box,addMesh,roundedBox,material,textTexture,makeStar}),night=track.theme==='forest';
  courseGroup=world.group;curve=world.curve;trackLength=world.length;pickups=world.pickups;boostPads=world.boostPads;scene.add(courseGroup);
  scene.background.set(track.sky);scene.fog=new THREE.Fog(track.sky,115,300);ambient.color.set(night?'#e0d7ff':'#fffbee');ambient.groundColor.set(night?'#66718c':'#a0afbd');ambient.intensity=night?1.7:2.4;sun.color.set(night?'#bfcfff':'#fff4df');sun.intensity=night?2.1:3.5;
  heroPlatform.children[0].material.color.set(track.edge);heroPlatform.children[1].material.color.set(night?'#a5a3c3':'#fff5df');
}
function resize(){if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
function home(){
  for(const id of ['pause-panel','finish','challenge','countdown','race-ui'])$(id).hidden=true;
  race.mode='home';clearInput();$('home').hidden=false;document.body.classList.remove('racing');
  player&&(player.visible=false);rivals.forEach(r=>r.mesh.visible=false);hero.visible=true;heroPlatform.visible=true;pickups.forEach(p=>p.mesh.visible=true);renderGarage();$('start').focus();
}
function startRace(){
  if(!renderer){$('load-error').hidden=false;return;}
  ['home','finish','pause-panel','challenge'].forEach(id=>$(id).hidden=true);$('race-ui').hidden=false;document.body.classList.add('racing');
  race=createRace();speed=0;lane=0;clearInput();countdownTime=0;countdownNumber='';hero.visible=false;heroPlatform.visible=false;
  if(player){scene.remove(player);disposeCar(player);}player=makeCar(CARS.find(c=>c.id===profile.car));scene.add(player);
  rivals.forEach(r=>{scene.remove(r.mesh);disposeCar(r.mesh);});rivals=[];
  for(let i=0;i<3;i++){const mesh=makeCar(CARS[(i+1)%CARS.length]);scene.add(mesh);rivals.push({mesh,distance:4+i*3.5,lane:[-3.3,0,3.3][i],speed:13.7+i*.22,finished:false});}
  const frame=placeOnTrack(player,0,0,.15);camera.position.copy(frame.point).addScaledVector(frame.tangent,-13).add(new THREE.Vector3(0,7.4,0));camera.lookAt(frame.point.clone().addScaledVector(frame.tangent,12).add(new THREE.Vector3(0,1.7,0)));
  rivals.forEach(r=>placeOnTrack(r.mesh,r.distance/trackLength,r.lane,.15));pickups.forEach(p=>p.mesh.visible=true);$('countdown').hidden=false;$('power-status').textContent='';updateHud();sound(420);speak('Ready, set, zoom!');$('pause').focus();
}
function pauseRace(){if(!['racing','countdown'].includes(race.mode))return;clearInput();resumeMode=race.mode;race.mode='paused';$('pause-panel').hidden=false;$('resume').focus();}
function useBoost(){if(race.mode!=='racing'||race.energy<=0)return;race.energy--;race.boost=Math.max(race.boost,2.8);sound(800,.25);notify('Rainbow boost! 🌈');updateHud();}
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
  $('power-status').textContent=race.boost>0?'🌈 RAINBOW SPEED':race.shield>0?'🫧 BUBBLE CRUISE':race.magnet>0?'🧲 STAR MAGNET':'';
}
function checkPickups(before,after){
  const lap=Math.floor(before/trackLength);
  for(const item of pickups){
    const at=lap*trackLength+item.u*trackLength,key=`${lap}:${item.u}`;
    if(before<=at&&after>=at&&!race.collected.has(key)&&Math.abs(lane-item.lane)<(race.magnet>0?12:2.2)){
      race.collected.add(key);item.mesh.visible=false;
      if(item.kind==='star'){race.earned++;sound(900,.06);}else if(item.kind==='shield'){race.shield=7;notify('Bubble cruise! Keep your speed on the grass. 🫧');sound(570,.17);}else{race.magnet=9;notify('Star magnet! Nearby stars come to you. 🧲');sound(730,.17);}
    }
  }
  for(const pad of boostPads){const at=lap*trackLength+pad.u*trackLength;if(before<=at&&after>=at&&Math.abs(lane)<3.7){race.boost=Math.max(race.boost,1.8);sound(670,.15);}}
  if(Math.floor(after/trackLength)>lap){pickups.forEach(p=>p.mesh.visible=true);notify('One more happy lap! ☁');sound(1000,.2);}
}
function finishRace(){
  const position=1+rivals.filter(r=>r.distance>=trackLength*2).length;settleRace(profile,race,position);save();clearInput();
  $('finish-title').textContent=position===1?'Look at you, superstar!':'What a happy race!';$('finish-description').textContent=`${currentTrack().name} in ${formatTime(race.elapsed)}. ${race.skipped?'You kept racing your way.':'Your garage has a little more sparkle.'}`;
  $('finish-place').textContent=['','1st','2nd','3rd','4th'][position];$('finish-stars').textContent=`+${race.earned}`;$('finish-brains').textContent=race.answered;$('finish').hidden=false;$('again').focus();sound(880,.35);
}
function updateRace(dt){
  if(race.mode==='countdown'){
    countdownTime+=dt;const label=countdownTime<3?String(3-Math.floor(countdownTime)):'GO!';
    if(label!==countdownNumber){countdownNumber=label;$('countdown').textContent=label;sound(label==='GO!'?900:450,.13);}
    if(countdownTime>=3.6){race.mode='racing';$('countdown').hidden=true;updateHud();}return;
  }
  if(race.mode!=='racing')return;
  if(advanceClock(race,dt,profile.cadence)){showQuestion();updateHud();return;}
  const steer=leftHeld||rightHeld?(rightHeld?1:0)-(leftHeld?1:0):stick.steer;lane=THREE.MathUtils.clamp(lane+steer*dt*6.8,-8.1,8.1);
  if(!steer&&profile.steerAssist)lane*=Math.exp(-dt*.3);
  const onGrass=Math.abs(lane)>5.8&&race.shield<=0,target=(14.6+profile.upgrades[profile.car]*.6+(race.boost>0?8.5:0))*(onGrass?.62:1);
  speed=THREE.MathUtils.lerp(speed,target,1-Math.exp(-dt*2.2));const before=race.distance;race.distance+=speed*dt;
  checkPickups(before,race.distance);
  race.boost=Math.max(0,race.boost-dt);race.shield=Math.max(0,race.shield-dt);race.magnet=Math.max(0,race.magnet-dt);
  const frame=placeOnTrack(player,race.distance/trackLength,lane,.15);player.rotation.z=-steer*.09;player.userData.bubble.visible=race.shield>0;
  player.userData.wheels.forEach(w=>w.rotation.x+=speed*dt*1.8);
  for(let i=0;i<rivals.length;i++){
    const r=rivals[i],gap=r.distance-race.distance,pace=r.speed+Math.sin(race.elapsed*.6+i)*.45+(gap<-45?.8:gap>35?-.9:0);
    r.distance=Math.min(trackLength*2,r.distance+pace*dt);placeOnTrack(r.mesh,r.distance/trackLength,r.lane+Math.sin(race.elapsed*.5+i)*.5,.15);r.mesh.userData.wheels.forEach(w=>w.rotation.x+=pace*dt*1.8);
  }
  const distance=innerWidth<700?14.5:12.5,height=innerWidth<700?8.5:6.5;
  const goal=frame.point.clone().addScaledVector(frame.right,lane*.6).addScaledVector(frame.tangent,-distance).add(new THREE.Vector3(0,height+(race.boost>0 && !reducedMotion ? .3 : 0),0));
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
  if(race.mode==='home'||race.mode==='racing')for(const pickup of pickups){pickup.mesh.rotation.y+=dt*1.5;}
  if(frameCount%6===0&&race.mode!=='home'){updateHud();drawMap();}
  renderer.render(scene,camera);requestAnimationFrame(loop);
}
renderGarage();
try{initWorld();race.mode='home';requestAnimationFrame(loop);}catch(error){console.error('Tiny Turbo could not open the track',error);$('load-error').hidden=false;}
