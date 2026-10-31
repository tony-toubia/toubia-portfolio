import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioReactivity,analyzeAudioFrame,packAudioTexture} from '../../public/visualizer/audio-reactivity.mjs';

const size=2048;
// Independent DFT of generated PCM produces the same byte/dB scale as the live
// AnalyserNode. Tests exercise real frequency placement at different sample rates.
function tone(hz,sampleRate=48000,amplitude=.35){
  const n=sampleRate>60000?4096:size,wave=new Float32Array(n),frequency=new Uint8Array(n/2);
  for(let i=0;i<n;i++)wave[i]=Math.sin(2*Math.PI*hz*i/sampleRate)*amplitude;
  for(let bin=0;bin<n/2;bin++){
    let real=0,imag=0;
    for(let i=0;i<n;i++){
      const sample=wave[i]*(.5-.5*Math.cos(2*Math.PI*i/(n-1))),phase=2*Math.PI*bin*i/n;
      real+=sample*Math.cos(phase);imag-=sample*Math.sin(phase);
    }
    const db=20*Math.log10(Math.hypot(real,imag)/(n*.25)+1e-12);
    frequency[bin]=Math.max(0,Math.min(255,Math.round((db+85)/70*255)));
  }
  return {wave,frequency,sampleRate,fftSize:n};
}
function frame(input,tracker,now=1,dt=1/60){return analyzeAudioFrame(input.frequency,input.wave,{sampleRate:input.sampleRate,fftSize:input.fftSize||size,dt,now},tracker);}
const silence={wave:new Float32Array(size),frequency:new Uint8Array(size/2),sampleRate:48000};

test('silence cannot become a signal even if stale FFT bins contain energy',()=>{
  const tracker=createAudioReactivity(),frequency=new Uint8Array(size/2).fill(255);
  const result=frame({...silence,frequency},tracker);
  assert.equal(result.hasSignal,false);assert.equal(result.rms,0);assert.equal(result.level,0);
  for(const key of ['subBass','bass','vocal','mid','high','beatPulse'])assert.equal(result[key],0);
  const texture=packAudioTexture(frequency,silence.wave,{hasSignal:false},new Uint8Array(1024));
  assert.ok(texture.subarray(0,512).every(value=>value===0));
  assert.ok(texture.subarray(512).every(value=>value===128));
});

test('generated PCM tones excite the matching frequency range at 44.1, 48 and 96 kHz',()=>{
  for(const sampleRate of [44100,48000,96000])for(const [hz,expected] of [[70,'subBass'],[900,'vocal'],[8000,'high']]){
    const tracker=createAudioReactivity(),input=tone(hz,sampleRate);
    for(let i=0;i<12;i++)frame(input,tracker,1+i/60);
    assert.ok(tracker.hasSignal&&tracker.level>.4,`${hz}Hz at ${sampleRate}Hz is detected`);
    assert.ok(tracker[expected]>.3,`${expected} responds to ${hz}Hz at ${sampleRate}Hz`);
    for(const other of ['subBass','bass','vocal','mid','high'].filter(name=>name!==expected)){
      assert.ok(tracker[expected]>tracker[other]*1.5,`${expected} dominates ${other}`);
    }
  }
});

test('changing pitch changes the visual bands; log texture retains both bass and upper treble',()=>{
  const low=tone(70),high=tone(8000),tracker=createAudioReactivity();
  for(let i=0;i<30;i++)frame(low,tracker,1+i/60);
  assert.ok(tracker.subBass>tracker.high+.3);
  for(let i=0;i<60;i++)frame(high,tracker,2+i/60);
  assert.ok(tracker.high>tracker.subBass+.3);
  const lowTexture=packAudioTexture(low.frequency,low.wave,{hasSignal:true,sampleRate:48000,fftSize:size},new Uint8Array(1024));
  const highTexture=packAudioTexture(high.frequency,high.wave,{hasSignal:true,sampleRate:48000,fftSize:size},new Uint8Array(1024));
  const peak=texture=>Array.from(texture.subarray(0,512)).indexOf(Math.max(...texture.subarray(0,512)));
  assert.ok(peak(lowTexture)<120,'sub bass occupies the low log-frequency region');
  assert.ok(peak(highTexture)>400,'upper treble is retained instead of truncated at bin512');
  for(let i=0;i<90;i++)frame(silence,tracker,3+i/60);
  assert.ok(tracker.subBass<.001&&tracker.high<.001&&tracker.level<.001,'silence releases to rest');
});

test('a held bass note does not generate metronomic beats; real repeated onsets estimate tempo',()=>{
  const input=tone(70),tracker=createAudioReactivity();
  for(let i=0;i<240;i++)frame(input,tracker,1+i/60);
  assert.equal(tracker.beatPhase,.82,'only the initial bass onset triggers a beat');
  assert.equal(tracker.bpmEstimate,0,'tempo is not invented from a sustained note');
  const pulses=createAudioReactivity();
  for(let i=0;i<300;i++)frame(i%30<5?input:silence,pulses,1+i/60);
  assert.equal(pulses.bpmEstimate,120,'half-second audio pulses establish the tempo');
  assert.ok(pulses.beatPhase>5);
});
