// Frequency ranges, not isolated musical stems. Every value comes from captured PCM.
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
export function createAudioReactivity(){
  return {subBass:0,bass:0,vocal:0,vocalPitch:.5,mid:0,high:0,trebleSpark:0,beatPulse:0,kickImpulse:0,beatPhase:0,bpmEstimate:0,baseline:0,previousLow:0,previousHigh:0,lastBeat:0,beatIntervals:[],level:0,rms:0,hasSignal:false};
}
function band(frequency,low,high,hzPerBin){
  const first=Math.max(1,Math.ceil(low/hzPerBin)),last=Math.min(frequency.length-1,Math.floor(high/hzPerBin));
  let square=0,peak=0,weighted=0,total=0;
  for(let i=first;i<=last;i++){
    const value=frequency[i]/255;square+=value*value;peak=Math.max(peak,value);total+=value;weighted+=value*(i*hzPerBin-low)/Math.max(1,high-low);
  }
  return {strength:last>=first?Math.sqrt(square/(last-first+1))*.65+peak*.35:0,pitch:total?weighted/total:.5};
}
export function analyzeAudioFrame(frequency,waveform,options,tracker){
  const {sampleRate=48000,fftSize=2048,dt=1/60,now=0,gain=1,bassBoost=1,vocalBoost=1,trebleBoost=1}=options;
  let sum=0;
  const bytes=waveform instanceof Uint8Array;
  for(const sample of waveform){const value=bytes?(sample-128)/128:sample;sum+=value*value;}
  tracker.rms=Math.sqrt(sum/Math.max(1,waveform.length));
  // A quiet input remains quiet. No synthetic beat, preview loop, or automatic gain floor.
  tracker.hasSignal=tracker.rms>.002;
  const hzPerBin=sampleRate/fftSize;
  const ranges=[[20,110],[110,320],[320,2800],[2800,6000],[6000,Math.min(16000,sampleRate*.5)]];
  const values=ranges.map(([low,high])=>band(frequency,low,high,hzPerBin));
  const multipliers=[bassBoost,bassBoost,vocalBoost,1,trebleBoost];
  const targets=values.map((value,i)=>tracker.hasSignal?clamp(value.strength*gain*multipliers[i]*1.35,0,2.2):0);
  const names=['subBass','bass','vocal','mid','high'];
  names.forEach((name,i)=>{const rate=targets[i]>tracker[name]?30:9;tracker[name]+=(targets[i]-tracker[name])*(1-Math.exp(-dt*rate));});
  tracker.vocalPitch+=(values[2].pitch-tracker.vocalPitch)*(1-Math.exp(-dt*10));
  tracker.level+=(clamp(Math.pow(tracker.rms,.55)*1.65)-tracker.level)*(1-Math.exp(-dt*(tracker.hasSignal?28:10)));
  const highDelta=targets[4]-tracker.previousHigh;tracker.previousHigh=targets[4];
  tracker.trebleSpark=highDelta>.09?clamp(tracker.trebleSpark+highDelta*2.6,0,1.6):tracker.trebleSpark*Math.exp(-dt*10);
  const low=targets[0]*.7+targets[1]*.3,previousBaseline=tracker.baseline;
  tracker.baseline+=(low-tracker.baseline)*(1-Math.exp(-dt*1.5));
  // Require an onset as well as energy: a held bass note cannot become a fake metronome.
  if(tracker.hasSignal&&low>Math.max(.16,previousBaseline*1.3)&&low-tracker.previousLow>.075&&now-tracker.lastBeat>.22){
    const interval=now-tracker.lastBeat;
    if(tracker.lastBeat>0&&interval>.28&&interval<1.2){
      tracker.beatIntervals.push(interval);if(tracker.beatIntervals.length>8)tracker.beatIntervals.shift();
      if(tracker.beatIntervals.length>=3){const sorted=[...tracker.beatIntervals].sort((a,b)=>a-b);tracker.bpmEstimate=Math.round(60/sorted[Math.floor(sorted.length/2)]);}
    }
    tracker.lastBeat=now;tracker.beatPulse=clamp(.65+low*.5,0,1.6);tracker.kickImpulse=.02;tracker.beatPhase+=.82;
  }else tracker.beatPulse*=Math.exp(-dt*8);
  tracker.previousLow=low;
  if(now-tracker.lastBeat>4)tracker.bpmEstimate=0;
  if(tracker.kickImpulse>0){tracker.kickImpulse+=dt*(1.35+tracker.subBass*.65);if(tracker.kickImpulse>=1.2)tracker.kickImpulse=0;}
  return tracker;
}
export function packAudioTexture(frequency,waveform,{sampleRate=48000,fftSize=2048,gain=1,bassBoost=1,vocalBoost=1,trebleBoost=1,hasSignal=false},out){
  const top=Math.min(16000,sampleRate*.5),hzPerBin=sampleRate/fftSize,bytes=waveform instanceof Uint8Array;
  for(let i=0;i<512;i++){
    const hz=30*Math.pow(top/30,i/511),bin=clamp(hz/hzPerBin,0,frequency.length-1),left=Math.floor(bin),fraction=bin-left;
    const value=frequency[left]*(1-fraction)+frequency[Math.min(left+1,frequency.length-1)]*fraction;
    const boost=hz<320?bassBoost:hz<2800?vocalBoost:hz>=6000?trebleBoost:1;
    out[i]=hasSignal?clamp(Math.round(value*gain*boost),0,255):0;
    const sample=waveform[Math.min(waveform.length-1,Math.floor(i*waveform.length/512))]||0;
    out[512+i]=hasSignal?(bytes?sample:clamp(Math.round(128+sample*127),0,255)):128;
  }
  return out;
}
