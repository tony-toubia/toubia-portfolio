// Course construction is separate from gameplay. New worlds use the same racing rules.
export function createWorld({THREE,track,box,addMesh,roundedBox,material,textTexture,makeStar}) {
  const group=new THREE.Group();group.name='course:'+track.id;
  const curve=new THREE.CatmullRomCurve3(track.points.map(p=>new THREE.Vector3(...p)),true,'catmullrom',.4),pickups=[],boostPads=[],night=track.theme==='forest';
  const frame=u=>{const t=((u%1)+1)%1,point=curve.getPointAt(t),tangent=curve.getTangentAt(t).normalize(),right=new THREE.Vector3(-tangent.z,0,tangent.x).normalize();return {point,tangent,right};};
  function place(object,u,offset=0,height=0){const f=frame(u);object.position.copy(f.point).addScaledVector(f.right,offset);object.position.y+=height;object.rotation.y=Math.atan2(f.tangent.x,f.tangent.z);return f;}
  function strip(offset,width,color,height=.03){
    const positions=[],indices=[],segments=420;
    for(let i=0;i<=segments;i++){const {point,right}=frame(i/segments);for(const edge of [-.5,.5]){const p=point.clone().addScaledVector(right,offset+width*edge);positions.push(p.x,p.y+height,p.z);}}
    for(let i=0;i<segments;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material(color,{side:THREE.DoubleSide}));mesh.receiveShadow=true;group.add(mesh);
  }
  function instances(geometry,mat,placements){
    const batch=new THREE.InstancedMesh(geometry,mat,placements.length),object=new THREE.Object3D();
    placements.forEach((p,i)=>{object.position.set(...p.position);object.scale.set(...(p.scale||[1,1,1]));object.rotation.set(...(p.rotation||[0,0,0]));object.updateMatrix();batch.setMatrixAt(i,object.matrix);if(p.color)batch.setColorAt(i,new THREE.Color(p.color));});
    batch.castShadow=true;batch.receiveShadow=true;group.add(batch);return batch;
  }
  function arch(u,start=false){
    const root=new THREE.Group();for(const x of [-7.5,7.5])box(root,.72,7.5,.72,track.edge,x,3.75,0);box(root,16,.8,1.1,'#e9f4a2',0,7.2,0);
    const sign=addMesh(root,new THREE.PlaneGeometry(11.5,1.8),new THREE.MeshBasicMaterial({map:textTexture(start?track.name.toUpperCase():'GOOD VIBES AHEAD'),side:THREE.DoubleSide}),0,6.9,.6);sign.castShadow=false;place(root,u);group.add(root);
    if(start)for(let row=0;row<2;row++)for(let col=0;col<12;col++){const tile=new THREE.Mesh(new THREE.BoxGeometry(1.05,.045,1.05),material((row+col)%2?'#fff8df':'#635b81'));tile.position.set((col-5.5)*1.05,.09,row*1.05-1);root.add(tile);}
  }
  addMesh(group,new THREE.CylinderGeometry(112,93,8,80),material(track.base),0,-4.5,0);
  addMesh(group,new THREE.CylinderGeometry(112.3,112.3,1,80),material(track.ground),0,-.7,0);
  if(track.theme==='beach'){
    addMesh(group,new THREE.CylinderGeometry(220,220,.6,80),material('#71cfc8',{roughness:.25}),0,-7,0);
    for(const r of [119,132,154])addMesh(group,new THREE.TorusGeometry(r,.5,6,100),material('#b1e9df'),0,-6.5,0).rotation.x=Math.PI/2;
  }
  strip(0,15.6,track.edge,-.05);strip(0,13.6,track.road);strip(-6.4,.42,'#ffedca',.05);strip(6.4,.42,'#ffedca',.05);
  const placement=new THREE.Object3D(),dashes=new THREE.InstancedMesh(new THREE.BoxGeometry(.17,.025,1.5),material('#fff1ce'),115);
  for(let i=0;i<115;i++){place(placement,i/115,0,.06);placement.updateMatrix();dashes.setMatrixAt(i,placement.matrix);}dashes.receiveShadow=true;group.add(dashes);
  for(const parity of [0,1]){
    const rails=new THREE.InstancedMesh(roundedBox(.42,.8,3.5),material(track.rails[parity]),parity?94:96);let index=0;
    for(const side of [-1,1])for(let i=parity;i<95;i+=2){place(placement,i/95,side*7.35,.4);placement.updateMatrix();rails.setMatrixAt(index++,placement.matrix);}rails.castShadow=true;rails.receiveShadow=true;group.add(rails);
  }
  arch(0,true);arch(.51);
  for(const u of [.17,.48,.77]){
    const pad=new THREE.Group();box(pad,5.6,.07,5.4,'#dfff88',0,.1,0);
    for(let i=0;i<3;i++)for(const side of [-1,1]){const bar=box(pad,1.9,.035,.3,'#7972bd',side*.7,.17,i*1.3-1.3);bar.rotation.y=side*Math.PI/5;}
    place(pad,u);group.add(pad);boostPads.push({u});
  }
  const starGeometry=makeStar(),starMat=material('#ffdc73',{metalness:.15,roughness:.3,emissive:night?'#8c6b20':'#000000',emissiveIntensity:.6});
  const bubbleGeometry=new THREE.SphereGeometry(.8,12,10),magnetGeometry=new THREE.TorusGeometry(.65,.23,8,16,Math.PI*1.55);
  for(let i=0;i<33;i++){
    const u=(i+.7)/33,lateral=[-3.6,0,3.6][i%3],kind=i%11===7?'shield':i%11===3?'magnet':'star';
    const mesh=new THREE.Mesh(kind==='star'?starGeometry:kind==='shield'?bubbleGeometry:magnetGeometry,kind==='star'?starMat:material(kind==='shield'?'#bcecff':'#e8a8dc',{metalness:.15,roughness:.3,emissive:night?'#553d77':'#000000',emissiveIntensity:.6}));place(mesh,u,lateral,1.75);group.add(mesh);pickups.push({mesh,u,lane:lateral,kind});
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
  return {group,curve,pickups,boostPads,length:curve.getLength()};
}

export function disposeWorld(group){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  group.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)for(const mat of Array.isArray(object.material)?object.material:[object.material]){materials.add(mat);if(mat.map)textures.add(mat.map);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
}
