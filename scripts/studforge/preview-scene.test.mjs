import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../public/studforge/vendor/three.module.js';
import {previewScene} from './preview-scene.mjs';
test('starter previews show the full height of a stacked tower instead of overlapping every brick at the origin',()=>{
 const catalog={'3001':{width:2,length:4,height:1.2}};
 const builder={createBrickMesh:()=>new THREE.Mesh(new THREE.BoxGeometry(2,1.2,4).translate(0,.6,0))};
 const model={bricks:[0,1.2,2.4,3.6].map(y=>({partId:'3001',color:'RED',x:5,y,z:8}))},original=JSON.stringify(model);
 const scene=previewScene(model,builder,catalog),box=new THREE.Box3().setFromObject(scene);
 assert.ok(Math.abs(box.max.y-box.min.y-4.8)<1e-5);
 assert.equal(box.getCenter(new THREE.Vector3()).x,5);assert.equal(box.getCenter(new THREE.Vector3()).z,8);
 assert.equal(JSON.stringify(model),original);
});
