// Course construction is separate from gameplay. New worlds use the same racing rules.
export function createWorld({THREE,track,box,addMesh,roundedBox,material,textTexture,makeStar}) {
  const group=new THREE.Group();group.name='course:'+track.id;
  const curve=new THREE.CatmullRomCurve3(track.points.map(p=>new THREE.Vector3(...p)),true,'catmullrom',.4),pickups=[],boostPads=[],itemBoxes=[],ramps=[],night=track.theme==='forest';
  const frame=u=>{const t=((u%1)+1)%1,point=curve.getPointAt(t),tangent=curve.getTangentAt(t).normalize(),right=new THREE.Vector3(-tangent.z,0,tangent.x).normalize();return {point,tangent,right};};
  function place(object,u,offset=0,height=0){const f=frame(u);object.position.copy(f.point).addScaledVector(f.right,offset);object.position.y+=height;object.rotation.y=Math.atan2(f.tangent.x,f.tangent.z);return f;}
  function strip(offset,width,color,height=.03,matOpts={}){
    const positions=[],indices=[],segments=420;
    for(let i=0;i<=segments;i++){const {point,right}=frame(i/segments);for(const edge of [-.5,.5]){const p=point.clone().addScaledVector(right,offset+width*edge);positions.push(p.x,p.y+height,p.z);}}
    for(let i=0;i<segments;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material(color,{side:THREE.DoubleSide,...matOpts}));mesh.receiveShadow=true;group.add(mesh);
  }
  function instances(geometry,mat,placements){
    const batch=new THREE.InstancedMesh(geometry,mat,placements.length),object=new THREE.Object3D();
    placements.forEach((p,i)=>{object.position.set(...p.position);object.scale.set(...(p.scale||[1,1,1]));object.rotation.set(...(p.rotation||[0,0,0]));object.updateMatrix();batch.setMatrixAt(i,object.matrix);if(p.color)batch.setColorAt(i,new THREE.Color(p.color));});
    batch.castShadow=true;batch.receiveShadow=true;group.add(batch);return batch;
  }
  function arch(u,start=false){
    const root=new THREE.Group();
    for(const x of [-7.7,7.7]){
      box(root,.88,7.8,.88,track.edge,x,3.9,0);
      box(root,1.15,.55,1.15,'#fff8e6',x,.28,0);
      box(root,1.05,.45,1.05,track.rails[0],x,7.6,0);
    }
    box(root,16.6,1.05,1.25,start?'#2d2546':'#e9f4a2',0,7.3,0);
    const sign=addMesh(root,new THREE.PlaneGeometry(12.2,1.95),new THREE.MeshBasicMaterial({map:textTexture(start?`🏁 ${track.name.toUpperCase()} 🏁`:'✦ TURBO SECTOR ✦',start?'#fff8e6':'#2d2546',start?'#2d2546':'#f5ff9e'),side:THREE.DoubleSide}),0,7.3,.66);sign.castShadow=false;
    if(start){
      // Lakitu-style overhead starting light rig
      for(let i=-1;i<=1;i++){
        box(root,.95,.95,.65,'#2a243d',i*1.5,6.15,.4);
        const bulb=addMesh(root,new THREE.SphereGeometry(.3,12,10),material('#ff6b6b',{emissive:'#ff5252',emissiveIntensity:.75}),i*1.5,6.15,.72);
        bulb.castShadow=false;
      }
      for(let row=0;row<3;row++)for(let col=0;col<13;col++){
        const tile=new THREE.Mesh(new THREE.BoxGeometry(1.02,.048,1.02),material((row+col)%2?'#fffdf5':'#2c2542',{roughness:.35}));
        tile.position.set((col-6)*1.02,.085,row*1.02-1.02);root.add(tile);
      }
    }
    place(root,u);group.add(root);
  }
  addMesh(group,new THREE.CylinderGeometry(112,93,8,80),material(track.base),0,-4.5,0);
  addMesh(group,new THREE.CylinderGeometry(112.3,112.3,1,80),material(track.ground),0,-.7,0);
  if(track.theme==='beach'){
    addMesh(group,new THREE.CylinderGeometry(220,220,.6,80),material('#54cfc8',{roughness:.18,metalness:.08}),0,-7,0);
    for(const r of [119,132,154])addMesh(group,new THREE.TorusGeometry(r,.5,6,100),material('#b9f3ea'),0,-6.5,0).rotation.x=Math.PI/2;
  }
  // Roadbed, asphalt, and crisp racing lines
  strip(0,15.8,track.edge,-.05,{roughness:.65});
  strip(0,13.8,track.road,.03,{roughness:.42,metalness:.06});
  strip(-6.45,.46,'#fff4d4',.055,{roughness:.3});
  strip(6.45,.46,'#fff4d4',.055,{roughness:.3});

  // Alternating Mario Kart red/white/theme apex rumble curbs
  const placement=new THREE.Object3D();
  for(const parity of [0,1]){
    const curbColor=parity?'#fff9ec':(track.theme==='beach'?'#ff6e59':track.theme==='forest'?'#a87cff':'#ff5e7e');
    const curbs=new THREE.InstancedMesh(new THREE.BoxGeometry(.72,.08,1.65),material(curbColor,{roughness:.35}),140);
    let idx=0;
    for(const side of [-1,1])for(let i=parity;i<140;i+=2){
      place(placement,i/140,side*6.95,.06);placement.updateMatrix();curbs.setMatrixAt(idx++,placement.matrix);
    }
    curbs.receiveShadow=true;group.add(curbs);
  }

  const dashes=new THREE.InstancedMesh(new THREE.BoxGeometry(.19,.028,1.55),material('#fff4d6'),115);
  for(let i=0;i<115;i++){place(placement,i/115,0,.062);placement.updateMatrix();dashes.setMatrixAt(i,placement.matrix);}dashes.receiveShadow=true;group.add(dashes);
  for(const parity of [0,1]){
    const rails=new THREE.InstancedMesh(roundedBox(.44,.82,3.5),material(track.rails[parity],{roughness:.35}),parity?94:96);let index=0;
    for(const side of [-1,1])for(let i=parity;i<95;i+=2){place(placement,i/95,side*7.45,.41);placement.updateMatrix();rails.setMatrixAt(index++,placement.matrix);}rails.castShadow=true;rails.receiveShadow=true;group.add(rails);
  }
  arch(0,true);arch(.51);

  // Glowing Chevron Boost Pads
  for(const u of [.17,.48,.77]){
    const pad=new THREE.Group();
    addMesh(pad,roundedBox(5.8,.08,5.6),material('#e2ff78',{emissive:'#9eff3b',emissiveIntensity:.45,roughness:.2}),0,.1,0);
    for(let i=0;i<3;i++)for(const side of [-1,1]){
      const bar=addMesh(pad,roundedBox(2.0,.04,.34),material('#ff4f9a',{emissive:'#ff4f9a',emissiveIntensity:.55}),side*.74,.17,i*1.3-1.3);
      bar.rotation.y=side*Math.PI/5;
    }
    place(pad,u);group.add(pad);boostPads.push({u});
  }

  // Mario Kart Trick Jump Ramps! (Hit to launch Airborne + 360° Trick Flip Boost)
  for(const [idx,u] of [.28,.64,.89].entries()){
    const lateral=[0,-2.1,2.1][idx%3];
    const ramp=new THREE.Group();
    const wedge=addMesh(ramp,roundedBox(4.8,.42,4.4),material('#ff9f43',{roughness:.28,metalness:.12}),0,.36,0);
    wedge.rotation.x=-.19;
    const stripMat=material('#00f5d4',{emissive:'#00f5d4',emissiveIntensity:.75,roughness:.15});
    for(let i=-1;i<=1;i++){
      const chevron=addMesh(ramp,new THREE.BoxGeometry(3.8,.06,.32),stripMat,0,.44+i*.14,i*1.05);
      chevron.rotation.x=-.19;
    }
    place(ramp,u,lateral,0);group.add(ramp);
    ramps.push({u,lane:lateral,width:2.9});
  }

  // Mario Kart Iridescent `?` Item Box Rows!
  const itemOuterGeo=roundedBox(1.45,1.45,1.45);
  const itemInnerGeo=new THREE.OctahedronGeometry(.58,0);
  const itemRingGeo=new THREE.RingGeometry(.45,.92,20);
  const itemColors=['#ff6ec7','#5ee7ff','#ffe66d','#a688fa'];
  for(const [rowIdx,u] of [.11,.36,.58,.82].entries()){
    for(const [colIdx,lateral] of [-3.6,0,3.6].entries()){
      const holder=new THREE.Group();
      const tint=itemColors[(rowIdx+colIdx)%itemColors.length];
      const outer=new THREE.Mesh(itemOuterGeo,material(tint,{transparent:true,opacity:.68,roughness:.08,metalness:.25,emissive:tint,emissiveIntensity:.38}));
      const core=new THREE.Mesh(itemInnerGeo,material('#fff6a9',{emissive:'#ffd147',emissiveIntensity:.8,roughness:.15}));
      const shadowRing=new THREE.Mesh(itemRingGeo,material(tint,{side:THREE.DoubleSide,transparent:true,opacity:.45,emissive:tint,emissiveIntensity:.35}));
      shadowRing.rotation.x=Math.PI/2;shadowRing.position.y=-1.6;
      holder.add(outer,core,shadowRing);
      place(holder,u,lateral,1.85);
      group.add(holder);
      itemBoxes.push({mesh:holder,outer,core,u,lane:lateral,cooldown:0,phase:(rowIdx*3+colIdx)*.7});
    }
  }

  // Stars, Shield Bubbles & Star Magnets
  const starGeometry=makeStar(),starMat=material('#ffdc73',{metalness:.22,roughness:.22,emissive:night?'#9e7922':'#573d00',emissiveIntensity:.55});
  const bubbleGeometry=new THREE.SphereGeometry(.82,16,12),magnetGeometry=new THREE.TorusGeometry(.65,.23,10,20,Math.PI*1.55);
  for(let i=0;i<33;i++){
    const u=(i+.7)/33,lateral=[-3.6,0,3.6][i%3],kind=i%11===7?'shield':i%11===3?'magnet':'star';
    const mesh=new THREE.Mesh(kind==='star'?starGeometry:kind==='shield'?bubbleGeometry:magnetGeometry,kind==='star'?starMat:material(kind==='shield'?'#8be9ff':'#f29ce3',{metalness:.18,roughness:.22,emissive:kind==='shield'?'#1f6d8c':'#7c2973',emissiveIntensity:.45}));
    place(mesh,u,lateral,1.75);group.add(mesh);pickups.push({mesh,u,lane:lateral,kind});
  }

  const trunks=[],foliage=[];
  for(let i=0;i<90;i++){
    const a=i*2.39996,r=30+((i*13)%70),x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(Math.hypot(x,z)<19)continue;
    let nearRoad=false;for(let j=0;j<100;j++){const p=curve.getPointAt(j/100);if(Math.hypot(p.x-x,p.z-z)<13){nearRoad=true;break;}}if(nearRoad)continue;
    const h=2+(i%5)*.7;trunks.push({position:[x,h*.5,z],scale:[1,h,1]});
    if(track.theme==='beach')for(let j=0;j<5;j++){const a=j*Math.PI*2/5;foliage.push({position:[x+Math.sin(a)*1.2,h+.5,z+Math.cos(a)*1.2],scale:[.7,.2,2.8],rotation:[.14,a,0]});}
    else if(night)for(let j=0;j<3;j++)foliage.push({position:[x,h*(.9+j*.52),z],scale:[2.8-j*.65,h*1.3,2.8-j*.65],color:['#66978c','#709b9b','#83a7a7'][j]});
    else foliage.push({position:[x,h+1,z],scale:[h*.7,h*.8,h*.7],color:['#89cbb6','#edafbc','#b6a0df','#f4d09c'][i%4]});
  }
  instances(new THREE.CylinderGeometry(.22,.3,1,8),material('#b59b87'),trunks);
  instances(night?new THREE.ConeGeometry(1,1,12):new THREE.SphereGeometry(1,12,8),material(track.theme==='beach'?'#61ac8c':'#ffffff'),foliage);
  for(let i=0;i<(night?6:14);i++){
    const a=i*.65,r=118+(i%4)*13,cloud=new THREE.Group();
    for(let j=0;j<3;j++){const puff=addMesh(cloud,new THREE.SphereGeometry(4+j%2*1.6,12,8),material(night?'#6b7190':'#f9f7ff',{roughness:1}),j*4,Math.sin(j)*1.4,0);puff.castShadow=false;}
    cloud.position.set(Math.cos(a)*r,8+(i%4)*9,Math.sin(a)*r);group.add(cloud);
  }
  if(track.theme==='clouds')for(const [x,z,c] of [[-32,-14,'#bb92e4'],[44,26,'#efad8e'],[10,-45,'#b4d0ed']]){
    const balloon=new THREE.Group();addMesh(balloon,new THREE.SphereGeometry(3.8,16,12),material(c),0,17,0);addMesh(balloon,new THREE.CylinderGeometry(.04,.04,10,5),material('#ded6be'),0,9,0);box(balloon,2,1.3,1.8,'#ac8b76',0,3.8,0);balloon.position.set(x,0,z);group.add(balloon);
  }
  if(track.theme==='beach')for(let i=0;i<10;i++){
    const umbrella=new THREE.Group();addMesh(umbrella,new THREE.CylinderGeometry(.08,.08,3.2,8),material('#c6a17d'),0,1.6,0);addMesh(umbrella,new THREE.ConeGeometry(2.6,1,12),material(i%2?'#ac9be6':'#f49787'),0,3.2,0);
    box(umbrella,1.7,.3,3.3,i%2?'#fff8e5':'#9bdfcd',0,.25,2.5);place(umbrella,(i+.4)/10,(i%2?-1:1)*15);umbrella.position.y=0;group.add(umbrella);
  }
  if(night){
    for(let i=0;i<18;i++){
      const mushroom=new THREE.Group();addMesh(mushroom,new THREE.CylinderGeometry(.18,.25,1.2,8),material('#ebd7e8'),0,.6,0);addMesh(mushroom,new THREE.SphereGeometry(1.05,12,8,0,Math.PI*2,0,Math.PI/2),material(i%2?'#f0afce':'#aadfd5',{emissive:i%2?'#b66f9a':'#71b5a8',emissiveIntensity:.8}),0,1.2,0);
      place(mushroom,(i+.4)/18,(i%2?-1:1)*12);mushroom.position.y=0;group.add(mushroom);
    }
    const stars=[];for(let i=0;i<180;i++){const a=i*2.39996,r=125+i%5*9;stars.push(Math.cos(a)*r,18+i%13*4,Math.sin(a)*r);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));group.add(new THREE.Points(geometry,new THREE.PointsMaterial({color:'#fff1c3',size:.7,transparent:true,opacity:.8})));
    const moon=addMesh(group,new THREE.SphereGeometry(7,24,16),new THREE.MeshBasicMaterial({color:'#fff1cf'}),-95,59,-100);moon.castShadow=false;
  }
  return {group,curve,pickups,boostPads,itemBoxes,ramps,length:curve.getLength()};
}

export function disposeWorld(group){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  group.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)for(const mat of Array.isArray(object.material)?object.material:[object.material]){materials.add(mat);if(mat.map)textures.add(mat.map);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
}
