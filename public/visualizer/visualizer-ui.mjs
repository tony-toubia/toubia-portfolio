// Small interaction helpers for the studio chrome; audio and rendering stay in visualizer.mjs.
const tabs=[...document.querySelectorAll('.mode-pill')];
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
for(const tab of tabs){
  tab.addEventListener('click',()=>{
    for(const other of tabs)other.tabIndex=other===tab?0:-1;
    tab.scrollIntoView({block:'nearest',inline:'nearest',behavior:reducedMotion?'instant':'smooth'});
  });
  tab.addEventListener('keydown',event=>{
    const index=tabs.indexOf(tab);
    const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
    if(next===null)return;
    event.preventDefault();tabs[next].focus();tabs[next].click();
  });
}
document.getElementById('open-audio')?.addEventListener('click',()=>document.getElementById('file-input')?.click());
document.getElementById('capture-audio')?.addEventListener('click',()=>document.getElementById('btn-system')?.click());
document.getElementById('btn-file-label')?.addEventListener('keydown',event=>{
  if(event.key==='Enter'||event.key===' '){event.preventDefault();document.getElementById('file-input')?.click();}
});
for(const [close,trigger] of [['close-drawer','toggle-drawer'],['close-spotify','btn-spotify']]){
  document.getElementById(close)?.addEventListener('click',()=>document.getElementById(trigger)?.focus());
}
