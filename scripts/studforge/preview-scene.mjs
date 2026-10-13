import * as THREE from '../../public/studforge/vendor/three.module.js';
// BrickBuilder supplies part-local geometry. Apply the viewer's placement for
// both generated bricks and baked parts, including mirrored source transforms.
export function previewScene(model,builder,catalog){
 const group=new THREE.Group();
 for(const b of model.bricks){
  const part=catalog[b.partId]||catalog['3001'],lying=!!(b.rotX||b.rotZ);
  const y=(b.y||0)+(!b.baked&&lying?part.width*.5*.96:0);
  const position=new THREE.Vector3(b.x||0,y,b.z||0);
  const mesh=builder.createBrickMesh(b.partId,b.color,{position,layer:b.layer,matrix:b.matrix,rotX:b.rotX,rotZ:b.rotZ,fp:b.fp,baked:b.baked,geometryId:b.geometryId,baseplate:b.baseplate});
  mesh.position.copy(position);
  const m=b.matrix;
  if(b.baked&&Array.isArray(m)&&m.length===9){
   new THREE.Matrix4().set(m[0],m[1],m[2],0,m[3],m[4],m[5],0,m[6],m[7],m[8],0,0,0,0,1).decompose(new THREE.Vector3(),mesh.quaternion,mesh.scale);
  }else mesh.rotation.set(b.rotX||0,b.rotY||0,b.rotZ||0);
  group.add(mesh);
 }
 return group;
}
