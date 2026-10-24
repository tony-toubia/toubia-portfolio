import * as THREE from '/studforge/vendor/three.module.js';
import { CARS, GRADES, UPGRADE_COST, MAX_UPGRADES, normalizeProfile, makeQuestion, createRace, advanceClock, rewardQuestion, buyUpgrade, settleRace } from './core.mjs';

const $ = id => document.getElementById(id), STORAGE = 'tiny-turbo.club.v1';
let profile;
try { profile=normalizeProfile(JSON.parse(localStorage.getItem(STORAGE)||'{}')); } catch { profile=normalizeProfile(); }
const save=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(profile));}catch{notify('Playing without saved progress on this device.');}};
let race=createRace(), question=null, lastQuestion='', lane=0, speed=0, countdownTime=0, countdownNumber='', leftHeld=false, rightHeld=false, toastTimer, resumeMode='racing', returnFocus=null;
let renderer, scene, camera, curve, trackLength, player, hero, heroPlatform, rivals=[], pickups=[], boostPads=[], clock=new THREE.Clock(), frameCount=0;
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
}
function selectCar(id,withSound=true) {
  profile.car=id;save();renderGarage();if(withSound)sound(650);
  if(hero){scene.remove(hero);disposeCar(hero);}
  hero=makeCar(CARS.find(c=>c.id===id));hero.scale.setScalar(3.5);hero.position.set(0,6.53,0);hero.rotation.y=-.35;scene.add(hero);
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

function clearInput(){leftHeld=false;rightHeld=false;$('left').classList.remove('held');$('right').classList.remove('held');}
for(const [id,dir] of [['left',-1],['right',1]]) {
  const button=$(id);
  const set=value=>{if(dir<0)leftHeld=value;else rightHeld=value;button.classList.toggle('held',value);};
  button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);set(true);});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,()=>set(false));
}
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
function strip(offset,width,color,height=.03,segments=420) {
  const positions=[],indices=[];
  for(let i=0;i<=segments;i++){const {point,right}=frameAt(i/segments);for(const edge of [-.5,.5]){const p=point.clone().addScaledVector(right,offset+width*edge);positions.push(p.x,p.y+height,p.z);}}
  for(let i=0;i<segments;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material(color,{side:THREE.DoubleSide}));mesh.receiveShadow=true;scene.add(mesh);return mesh;
}
function textTexture(text,bg='#fff8e6',color='#44345e',width=512,height=128) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${height*.46}px Trebuchet MS,Arial`;ctx.fillText(text,width/2,height/2,width*.93);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function makeArch(u,start=false) {
  const group=new THREE.Group();for(const x of [-7.5,7.5])box(group,.72,7.5,.72,'#a28ce2',x,3.75,0);
  box(group,16,.8,1.1,'#e9f4a2',0,7.2,0);
  const sign=addMesh(group,new THREE.PlaneGeometry(11.5,1.8),new THREE.MeshBasicMaterial({map:textTexture(start?'CLOUDTOP  ✦  CLUB':'GOOD VIBES AHEAD'),side:THREE.DoubleSide}),0,6.9,.6);
  sign.castShadow=false;placeOnTrack(group,u);scene.add(group);
  if(start)for(let row=0;row<2;row++)for(let col=0;col<12;col++){const tile=new THREE.Mesh(new THREE.BoxGeometry(1.05,.045,1.05),material((row+col)%2?'#fff8df':'#635b81'));tile.position.set((col-5.5)*1.05,.09,row*1.05-1);group.add(tile);}
}
function makeStar(){const shape=new THREE.Shape();for(let i=0;i<10;i++){const r=i%2?.42:.9,a=Math.PI/2+i*Math.PI/5,x=Math.cos(a)*r,y=Math.sin(a)*r;if(!i)shape.moveTo(x,y);else shape.lineTo(x,y);}shape.closePath();return new THREE.ExtrudeGeometry(shape,{depth:.2,bevelEnabled:true,bevelThickness:.06,bevelSize:.06,bevelSegments:1,steps:1});}
function initWorld() {
  renderer=new THREE.WebGLRenderer({antialias:devicePixelRatio<2,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.appendChild(renderer.domElement);
  scene=new THREE.Scene();scene.background=new THREE.Color('#c7e1f5');scene.fog=new THREE.Fog('#c7e1f5',110,290);
  camera=new THREE.PerspectiveCamera(49,innerWidth/innerHeight,.1,420);camera.position.set(56,44,70);
  scene.add(new THREE.HemisphereLight('#fffbee','#a0afbd',2.4));const sun=new THREE.DirectionalLight('#fff4df',3.5);sun.position.set(25,75,35);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-110,right:110,top:110,bottom:-110,near:.5,far:190});sun.shadow.normalBias=.06;scene.add(sun);const fill=new THREE.DirectionalLight('#d2c7ff',1);fill.position.set(-45,18,-45);scene.add(fill);
  curve=new THREE.CatmullRomCurve3([[-65,0,0],[-47,2,-52],[14,4,-69],[65,1,-43],[73,0,8],[44,4,50],[-20,1,60],[-67,0,36]].map(p=>new THREE.Vector3(...p)),true,'catmullrom',.4);trackLength=curve.getLength();
  const island=addMesh(scene,new THREE.CylinderGeometry(112,93,8,80),material('#c9d9c6'),0,-4.5,0);island.receiveShadow=true;
  addMesh(scene,new THREE.CylinderGeometry(112.3,112.3,1,80),material('#e3ebce'),0,-.7,0);
  strip(0,15.6,'#9879c8',-.05);strip(0,13.6,'#f1af7a');strip(-6.4,.42,'#ffedca',.05);strip(6.4,.42,'#ffedca',.05);
  const dashedLine=new THREE.InstancedMesh(new THREE.BoxGeometry(.17,.025,1.5),material('#fff1ce'),115),placement=new THREE.Object3D();
  for(let i=0;i<115;i++){placeOnTrack(placement,i/115,0,.06);placement.updateMatrix();dashedLine.setMatrixAt(i,placement.matrix);}dashedLine.receiveShadow=true;scene.add(dashedLine);
  for(const parity of [0,1]){
    const count=parity?94:96,rails=new THREE.InstancedMesh(roundedBox(.42,.8,3.5),material(parity?'#e7d8fc':'#aa8cdc'),count);let index=0;
    for(const side of [-1,1])for(let i=parity;i<95;i+=2){placeOnTrack(placement,i/95,side*7.35,.4);placement.updateMatrix();rails.setMatrixAt(index++,placement.matrix);}rails.castShadow=true;rails.receiveShadow=true;scene.add(rails);
  }
  makeArch(0,true);makeArch(.51);
  for(const u of [.17,.48,.77]) {
    const group=new THREE.Group();box(group,5.6,.07,5.4,'#dfff88',0,.1,0);
    for(let i=0;i<3;i++)for(const side of [-1,1]){const bar=box(group,1.9,.035,.3,'#7972bd',side*.7,.17,i*1.3-1.3);bar.rotation.y=side*Math.PI/5;}
    placeOnTrack(group,u);scene.add(group);boostPads.push({u});
  }
  const starGeometry=makeStar();
  for(let i=0;i<33;i++){
    const u=(i+.7)/33,lateral=[-3.6,0,3.6][i%3],kind=i%11===7?'shield':i%11===3?'magnet':'star';
    const geometry=kind==='star'?starGeometry:kind==='shield'?new THREE.SphereGeometry(.8,12,10):new THREE.TorusGeometry(.65,.23,8,16,Math.PI*1.55);
    const mesh=new THREE.Mesh(geometry,material(kind==='star'?'#ffdc73':kind==='shield'?'#bcecff':'#e8a8dc',{metalness:.15,roughness:.3}));placeOnTrack(mesh,u,lateral,1.75);scene.add(mesh);pickups.push({mesh,u,lane:lateral,kind});
  }
  // Lightweight, original toy scenery: no downloaded models or remote textures.
  for(let i=0;i<90;i++){
    const a=i*2.39996,r=30+((i*13)%70),x=Math.cos(a)*r,z=Math.sin(a)*r;
    let nearRoad=false;for(let j=0;j<90;j++){const p=curve.getPointAt(j/90);if(Math.hypot(p.x-x,p.z-z)<12){nearRoad=true;break;}}
    if(nearRoad||Math.hypot(x,z)<19)continue;
    const tree=new THREE.Group(),h=2+(i%5)*.7;box(tree,.45,h,.45,'#b59b87',0,h*.5,0);
    addMesh(tree,new THREE.SphereGeometry(h*.7,10,8),material(['#89cbb6','#edafbc','#b6a0df','#f4d09c'][i%4]),0,h+1,0);tree.position.set(x,0,z);scene.add(tree);
  }
  for(let i=0;i<14;i++){
    const a=i*.65,r=118+(i%4)*13,cloud=new THREE.Group();
    for(let j=0;j<3;j++){const puff=addMesh(cloud,new THREE.SphereGeometry(4+j%2*1.6,12,8),material('#f9f7ff',{roughness:1}),j*4,Math.sin(j)*1.4,0);puff.castShadow=false;}
    cloud.position.set(Math.cos(a)*r,8+(i%4)*9,Math.sin(a)*r);scene.add(cloud);
  }
  for(const [x,z,c] of [[-32,-14,'#bb92e4'],[44,26,'#efad8e'],[10,-45,'#b4d0ed']]){
    const balloon=new THREE.Group();addMesh(balloon,new THREE.SphereGeometry(3.8,16,12),material(c),0,17,0);addMesh(balloon,new THREE.CylinderGeometry(.04,.04,10,5),material('#ded6be'),0,9,0);box(balloon,2,1.3,1.8,'#ac8b76',0,3.8,0);balloon.position.set(x,0,z);scene.add(balloon);
  }
  heroPlatform=new THREE.Group();addMesh(heroPlatform,new THREE.CylinderGeometry(8.5,8.5,1.7,64),material('#cab8ed'),0,5.3,0);addMesh(heroPlatform,new THREE.CylinderGeometry(8.2,8.2,.3,64),material('#fff5df'),0,6.35,0);addMesh(heroPlatform,new THREE.TorusGeometry(8.4,.18,8,64),material('#fff2ff'),0,5.8,0).rotation.x=Math.PI/2;scene.add(heroPlatform);
  selectCar(profile.car,false);
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();pauseRace();$('load-error').hidden=false;});
  window.addEventListener('resize',resize);resize();
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
  $('boost-count').textContent=race.energy?`${race.energy} ready`:'Collect a brain boost';$('boost').disabled=race.energy<1||race.mode!=='racing';
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
  $('finish-title').textContent=position===1?'Look at you, superstar!':'What a happy race!';$('finish-description').textContent=`Two laps of cloudtop joy. ${race.skipped?'You kept racing your way.':'Your garage has a little more sparkle.'}`;
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
  const steer=(rightHeld?1:0)-(leftHeld?1:0);lane=THREE.MathUtils.clamp(lane+steer*dt*6.8,-8.1,8.1);
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
  for(let i=0;i<=100;i++){const [x,y]=plot(curve.getPointAt(i/100));if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.strokeStyle='#d5b7ea';ctx.lineWidth=10;ctx.stroke();ctx.strokeStyle='#fff5df';ctx.lineWidth=5;ctx.stroke();
  for(const rival of rivals){const [x,y]=plot(curve.getPointAt((rival.distance/trackLength)%1));ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#ed9c77';ctx.fill();}
  const [x,y]=plot(curve.getPointAt((race.distance/trackLength)%1));ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fillStyle='#6751b1';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
}
function loop(){
  const dt=Math.min(.05,clock.getDelta());frameCount++;
  if(race.mode==='home'){
    const portrait=innerWidth<700;
    const target=portrait?new THREE.Vector3(-7,5,2):new THREE.Vector3(-22,5,8);
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
