import * as THREE from '../../public/studforge/vendor/three.module.js';
// Same part placement conventions as the viewer: generated meshes need their
// position applied explicitly; baked meshes already carry their source matrix.
export function previewScene(model,builder,catalog){
 const group=new THREE.Group();
 for(const b of model.bricks){
  const part=catalog[b.partId]||catalog['3001'],lying=!!(b.rotX||b.rotZ);
  const y=(b.y||0)+(!b.baked&&lying?part.width*.5*.96:0);
  const position=new THREE.Vector3(b.x||0,y,b.z||0);
  const mesh=builder.createBrickMesh(b.partId,b.color,{position,layer:b.layer,matrix:b.matrix,rotX:b.rotX,rotZ:b.rotZ,fp:b.fp,baked:b.baked,geometryId:b.geometryId,baseplate:b.baseplate});
  if(!b.baked){mesh.position.copy(position);if(b.rotX)mesh.rotation.x=b.rotX;if(b.rotY)mesh.rotation.y=b.rotY;if(b.rotZ)mesh.rotation.z=b.rotZ;}
  group.add(mesh);
 }
 return group;
}
