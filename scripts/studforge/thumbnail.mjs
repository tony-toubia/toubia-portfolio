import sharp from 'sharp';
import * as THREE from '../../public/studforge/vendor/three.module.js';

// A fixed-resolution depth buffer bounds memory even for detailed models.
export async function renderThumbnail(object, id, frontAngle = 0, outputRoot = 'public/studforge', {linearColors=false} = {}) {
    const width=640, height=500;
    const pixels=new Uint8Array(width*height*4), depths=new Float32Array(width*height).fill(-Infinity);
    object.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(object), center=box.getCenter(new THREE.Vector3());
    const direction=new THREE.Vector3(5,3.5,7).applyAxisAngle(new THREE.Vector3(0,1,0),frontAngle).normalize();
    const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
    const up=new THREE.Vector3().crossVectors(direction,right).normalize();
    const light=new THREE.Vector3(-.3,.8,.7).normalize();
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
        const p=new THREE.Vector3(x,y,z).sub(center),px=p.dot(right),py=-p.dot(up);
        minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
    }
    const scale=Math.min(540/(maxX-minX),420/(maxY-minY));
    if(!Number.isFinite(scale)||scale<=0)throw new Error('Invalid thumbnail bounds: '+id);
    const ox=320-(minX+maxX)*scale/2,oy=246-(minY+maxY)*scale/2;
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
    const ab=new THREE.Vector3(),ac=new THREE.Vector3(),shadeColor=new THREE.Color();let visible=0;
    object.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const g=mesh.geometry,pos=g.attributes.position,idx=g.index,count=idx?idx.count:pos.count;
        const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        for(const group of g.groups.length?g.groups:[{start:0,count,materialIndex:0}]){
            const material=materials[group.materialIndex||0]||materials[0];
            for(let i=group.start;i<Math.min(count,group.start+group.count);i+=3){
                const get=(v,index)=>v.fromBufferAttribute(pos,idx?idx.getX(index):index).applyMatrix4(mesh.matrixWorld).sub(center);
                get(a,i);get(b,i+1);get(c,i+2);normal.crossVectors(ab.subVectors(b,a),ac.subVectors(c,a)).normalize();
                if(normal.dot(direction)<.001)continue;
                const ax=a.dot(right)*scale+ox,ay=-a.dot(up)*scale+oy,az=a.dot(direction);
                const bx=b.dot(right)*scale+ox,by=-b.dot(up)*scale+oy,bz=b.dot(direction);
                const cx=c.dot(right)*scale+ox,cy=-c.dot(up)*scale+oy,cz=c.dot(direction);
                const denominator=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
                if(Math.abs(denominator)<1e-8)continue;
                shadeColor.copy(material.color).multiplyScalar(.48+.52*Math.max(0,normal.dot(light)));
                if(linearColors)shadeColor.convertLinearToSRGB();
                const hex=shadeColor.getHex();
                const x0=Math.max(0,Math.floor(Math.min(ax,bx,cx))),x1=Math.min(width-1,Math.ceil(Math.max(ax,bx,cx)));
                const y0=Math.max(0,Math.floor(Math.min(ay,by,cy))),y1=Math.min(height-1,Math.ceil(Math.max(ay,by,cy)));
                for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
                    const u=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/denominator;
                    const v=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/denominator;
                    if(u<0||v<0||u+v>1)continue;
                    const pixel=y*width+x,depth=u*az+v*bz+(1-u-v)*cz;
                    if(depth<=depths[pixel])continue;
                    depths[pixel]=depth;const o=pixel*4;
                    pixels[o]=hex>>16;pixels[o+1]=(hex>>8)&255;pixels[o+2]=hex&255;pixels[o+3]=255;visible++;
                }
            }
        }
    });
    if(!visible)throw new Error('Empty thumbnail: '+id);
    await sharp(pixels,{raw:{width,height,channels:4}}).resize(320,250).png().toFile(outputRoot+'/thumbnails/'+id+'.png');
}
