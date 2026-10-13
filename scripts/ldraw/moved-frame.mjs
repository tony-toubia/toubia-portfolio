// A moved-to part may rotate or translate its replacement. Changing just the ID
// loses that frame, notably for 3139 -> 3139b (the sideways Jet Airliner tyres).
export const multiply3 = (a,b) => Array.from({length:9},(_,i)=>{
 const r=Math.floor(i/3),c=i%3;return a[r*3]*b[c]+a[r*3+1]*b[c+3]+a[r*3+2]*b[c+6];
});
export const transform3 = (m,p) => [0,1,2].map(i=>m[i*3]*p[0]+m[i*3+1]*p[1]+m[i*3+2]*p[2]);
export function movedFrame(original,target,readText) {
 let id=original,matrix=[1,0,0,0,1,0,0,0,1],position=[0,0,0];const seen=new Set();
 while(id!==target){
  if(seen.has(id))return null;seen.add(id);
  const text=readText(id);if(!text)return null;
  const moved=text.match(/^0\s+~Moved to\s+(\S+)/im),refs=text.split(/\r?\n/).filter(l=>/^1\s/.test(l));
  if(!moved||refs.length!==1||/^[34]\s/m.test(text))return null;
  const tokens=refs[0].trim().split(/\s+/),values=tokens.slice(2,14).map(Number);
  const next=tokens.slice(14).join(' ').toLowerCase().replace(/\.dat$/,'');
  if(next!==moved[1].toLowerCase().replace(/\.dat$/,'')||!values.every(Number.isFinite))return null;
  const shift=transform3(matrix,values.slice(0,3));position=position.map((v,i)=>v+shift[i]);
  matrix=multiply3(matrix,values.slice(3));id=next;
 }
 return {matrix,position};
}
export const studFrame = f => ({matrix:[f.matrix[0],-f.matrix[1],-f.matrix[2],-f.matrix[3],f.matrix[4],f.matrix[5],-f.matrix[6],f.matrix[7],f.matrix[8]],position:[f.position[0]/20,-f.position[1]/20,-f.position[2]/20]});
