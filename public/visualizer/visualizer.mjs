// SONIC PRISM — Modern WebGL Audio-Reactive Visualizer (WMP Alchemy / MilkDrop / Firestorm tribute)

const $ = id => document.getElementById(id);
const canvas = $('gl-canvas');
const audioEl = $('audio-el');

// --- State & Customization Parameters ---
const state = {
  mode: 0,          // 0: Alchemy Plasma, 1: Firestorm Waves, 2: Ferro-Orb 3D, 3: Hyper-Tunnel
  palette: 0,       // 0..4 color palettes
  gain: 1.3,
  decay: 0.94,
  warp: 1.2,
  symmetry: 1,
  sourceType: 'idle', // 'idle' | 'system' | 'file' | 'synth' | 'mic'
  pointerX: 0.5,
  pointerY: 0.5,
  pointerVx: 0,
  pointerVy: 0,
  pointerDown: false,
  // Audio telemetry
  subBass: 0,
  bass: 0,
  mid: 0,
  high: 0,
  beatPulse: 0,
  beatPhase: 0,
  bpmEstimate: 124,
  lastBeatTime: 0,
  energyHistory: new Float32Array(45),
  energyIdx: 0,
};

let toastTimer = null;
function notify(msg, duration = 3400) {
  const el = $('toast');
  if (!el) return;
  clearTimeout(toastTimer);
  el.textContent = msg;
  el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; }, duration);
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

// --- WebAudio Context & Multi-Source Graph ---
let audioCtx = null;
let analyser = null;
let freqData = new Uint8Array(1024);
let waveData = new Uint8Array(1024);
let audioTexData = new Uint8Array(512 * 2); // 512x2 LUMINANCE texture (Row 0: FFT, Row 1: Waveform)

let activeStream = null;
let streamSourceNode = null;
let mediaElementSourceNode = null;
let synthMasterGain = null;
let synthTimer = null;
let synthStep = 0;
let synthGroove = 0;
let synthPlaying = false;
let dropIntensity = 0;

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.76;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    waveData = new Uint8Array(analyser.frequencyBinCount);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function stopCurrentSources() {
  // Stop active MediaStream (system audio or mic)
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop());
    activeStream = null;
  }
  if (streamSourceNode) {
    try { streamSourceNode.disconnect(); } catch {}
    streamSourceNode = null;
  }
  // Pause file playback
  if (!audioEl.paused) {
    audioEl.pause();
  }
  // Stop procedural synth
  stopSynth();
  document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
}

function setActiveSourceUI(type, badgeText) {
  state.sourceType = type;
  $('source-badge').textContent = badgeText;
  document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
  if (type === 'system') $('btn-system').classList.add('active');
  if (type === 'file') document.querySelector('label[for="file-input"]')?.classList.add('active');
  if (type === 'synth') $('btn-synth').classList.add('active');
  if (type === 'mic') $('btn-mic').classList.add('active');

  const showTransport = type === 'file' || type === 'synth';
  $('transport-bar').hidden = !showTransport;
  $('synth-grooves').hidden = type !== 'synth';
  $('seek-bar').hidden = type === 'synth';
  $('track-time').hidden = type === 'synth';
}

// 1. Desktop System / Tab Audio Capture (Zero-Mic Digital Loopback)
async function startSystemAudio() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    notify('System/Tab audio capture requires a desktop browser (Chrome, Edge, Brave). On mobile, use Play Audio File or Live Synth Deck!');
    return;
  }
  try {
    notify('Select a Browser Tab (Spotify, YouTube) or Entire Screen and check "Also share audio" 🔊', 5000);
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        suppressLocalAudioPlayback: false,
      },
      systemAudio: 'include',
    });

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      stream.getTracks().forEach(t => t.stop());
      notify('⚠️ No audio track was shared! Make sure "Also share tab/system audio" is toggled ON in the picker.', 5200);
      return;
    }

    stopCurrentSources();
    ensureAudioContext();
    activeStream = stream;
    const audioOnlyStream = new MediaStream(audioTracks);
    streamSourceNode = audioCtx.createMediaStreamSource(audioOnlyStream);
    // Connect ONLY to analyser, NOT to destination, so system audio doesn't double-echo!
    streamSourceNode.connect(analyser);

    const label = audioTracks[0].label || 'System / Tab Loopback';
    setActiveSourceUI('system', `LIVE SYSTEM AUDIO · ${label.toUpperCase().slice(0, 28)}`);
    notify(`Connected to ${label}! Reacting to live digital audio 🌈`);

    stream.getTracks().forEach(track => {
      track.addEventListener('ended', () => {
        if (state.sourceType === 'system') {
          stopCurrentSources();
          setActiveSourceUI('idle', 'SYSTEM SHARE ENDED · SELECT SOURCE');
        }
      });
    });
  } catch (err) {
    if (err?.name !== 'NotAllowedError') {
      notify('Could not capture system audio. Try sharing a Chrome/Edge tab with "Share audio" enabled.');
    }
  }
}

// 2. Local Audio File Playback (Desktop & Mobile)
function loadAudioFile(file) {
  if (!file) return;
  stopCurrentSources();
  ensureAudioContext();

  const url = URL.createObjectURL(file);
  audioEl.src = url;
  audioEl.load();

  if (!mediaElementSourceNode) {
    mediaElementSourceNode = audioCtx.createMediaElementSource(audioEl);
    mediaElementSourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
  }

  const cleanName = file.name.replace(/\.[^/.]+$/, '');
  $('track-title').textContent = cleanName;
  setActiveSourceUI('file', `PLAYING FILE · ${cleanName.toUpperCase().slice(0, 28)}`);

  audioEl.play().then(() => {
    $('btn-play-pause').textContent = '⏸';
    notify(`Playing "${cleanName}" 🎵`);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: cleanName, artist: 'Sonic Prism Visualizer' });
      navigator.mediaSession.setActionHandler('play', () => audioEl.play());
      navigator.mediaSession.setActionHandler('pause', () => audioEl.pause());
    }
  }).catch(() => {
    $('btn-play-pause').textContent = '▶';
  });
}

// 3. Built-In Multi-Genre Procedural Synthesizer (Works instantly on Phone & Desktop!)
const GROOVES = [
  { name: 'Cyberpunk 124 BPM', bpm: 124, root: 55, scale: [0, 3, 5, 7, 10, 12, 15] },
  { name: 'Liquid DnB 170 BPM', bpm: 170, root: 65.41, scale: [0, 2, 3, 7, 8, 10, 12] },
  { name: 'Synthwave Odyssey 102 BPM', bpm: 102, root: 49, scale: [0, 3, 7, 10, 12, 14, 15] },
];

function triggerKick(time, punch = 1) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(135 * punch, time);
  osc.frequency.exponentialRampToValueAtTime(34, time + 0.14);
  osc.frequency.exponentialRampToValueAtTime(24, time + 0.34);
  gain.gain.setValueAtTime(0.65 * punch, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.36);
  osc.connect(gain);
  gain.connect(synthMasterGain);
  osc.start(time);
  osc.stop(time + 0.37);
}

function triggerSnare(time, level = 0.28) {
  // Crisp noise + body tone snare
  const bufSize = Math.floor(audioCtx.sampleRate * 0.16);
  const buffer = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.28));
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(520, time);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(level, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(synthMasterGain);
  noise.start(time);
}

function triggerHat(time, open = false) {
  const dur = open ? 0.18 : 0.045;
  const bufSize = Math.floor(audioCtx.sampleRate * dur);
  const buffer = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.35));
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;

  const hp = audioCtx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(6500, time);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(open ? 0.14 : 0.09, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

  src.connect(hp);
  hp.connect(gain);
  gain.connect(synthMasterGain);
  src.start(time);
}

function triggerBassAndArp(time, step, groove) {
  const semi = groove.scale[step % groove.scale.length];
  const bassFreq = groove.root * Math.pow(2, (step % 8 === 7 ? 3 : (step % 4 === 0 ? 0 : semi % 5)) / 12);

  // Sub-bass saw + lowpass filter
  const bassOsc = audioCtx.createOscillator();
  const subOsc = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  bassOsc.type = 'sawtooth';
  subOsc.type = 'sine';
  bassOsc.frequency.setValueAtTime(bassFreq, time);
  subOsc.frequency.setValueAtTime(bassFreq * 0.5, time);

  filter.type = 'lowpass';
  const cutoff = 260 + (Math.sin(step * 0.35) * 0.5 + 0.5) * 950 + dropIntensity * 1800;
  filter.frequency.setValueAtTime(cutoff, time);
  filter.Q.setValueAtTime(4.5, time);

  gain.gain.setValueAtTime(0.28 + dropIntensity * 0.18, time);
  gain.gain.exponentialRampToValueAtTime(0.008, time + 0.19);

  bassOsc.connect(filter);
  subOsc.connect(filter);
  filter.connect(gain);
  gain.connect(synthMasterGain);
  bassOsc.start(time);
  subOsc.start(time);
  bassOsc.stop(time + 0.2);
  subOsc.stop(time + 0.2);

  // Shimmering high-mid melodic arpeggio
  if (step % 2 === 0 || dropIntensity > 0.2) {
    const arpOsc = audioCtx.createOscillator();
    const arpGain = audioCtx.createGain();
    arpOsc.type = 'triangle';
    const arpNote = groove.root * 4 * Math.pow(2, groove.scale[(step * 2) % groove.scale.length] / 12);
    arpOsc.frequency.setValueAtTime(arpNote, time);
    arpGain.gain.setValueAtTime(0.11, time);
    arpGain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    arpOsc.connect(arpGain);
    arpGain.connect(synthMasterGain);
    arpOsc.start(time);
    arpOsc.stop(time + 0.15);
  }
}

function scheduleSynthStep() {
  if (!synthPlaying || !audioCtx) return;
  const groove = GROOVES[synthGroove] || GROOVES[0];
  state.bpmEstimate = groove.bpm;
  const stepDur = (60 / groove.bpm) / 4; // 16th note
  const now = audioCtx.currentTime + 0.02;
  const s = synthStep % 16;

  if (synthGroove === 1) {
    // Liquid DnB breakbeat pattern
    if (s === 0 || s === 10) triggerKick(now, 1.15);
    if (s === 4 || s === 12) triggerSnare(now, 0.32);
    triggerHat(now, s % 4 === 2);
  } else {
    // Four-on-the-floor Cyberpunk / Synthwave
    if (s % 4 === 0 || (dropIntensity > 0.3 && s % 2 === 0)) triggerKick(now, 1.1 + dropIntensity * 0.35);
    if (s % 8 === 4) triggerSnare(now, 0.3);
    if (s % 2 === 1) triggerHat(now, s === 15);
  }
  triggerBassAndArp(now, synthStep, groove);

  dropIntensity = Math.max(0, dropIntensity - 0.04);
  synthStep++;
  synthTimer = setTimeout(scheduleSynthStep, stepDur * 1000);
}

function startSynth() {
  stopCurrentSources();
  ensureAudioContext();
  if (!synthMasterGain) {
    synthMasterGain = audioCtx.createGain();
    synthMasterGain.gain.value = 0.85;
    synthMasterGain.connect(analyser);
    analyser.connect(audioCtx.destination);
  }
  synthPlaying = true;
  synthStep = 0;
  const groove = GROOVES[synthGroove];
  $('track-title').textContent = `LIVE SYNTH · ${groove.name}`;
  $('btn-play-pause').textContent = '⏸';
  setActiveSourceUI('synth', `LIVE SYNTHESIZER · ${groove.name.toUpperCase()}`);
  scheduleSynthStep();
  notify(`Live Synth Deck active: ${groove.name} 🎹`);
}

function stopSynth() {
  synthPlaying = false;
  clearTimeout(synthTimer);
}

// 4. Optional Line-In / Microphone Input
async function startMicAudio() {
  if (!navigator.mediaDevices?.getUserMedia) {
    notify('Audio input is not supported in this browser.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    stopCurrentSources();
    ensureAudioContext();
    activeStream = stream;
    streamSourceNode = audioCtx.createMediaStreamSource(stream);
    // Connect only to analyser (never destination, avoiding feedback loop)
    streamSourceNode.connect(analyser);
    setActiveSourceUI('mic', 'LIVE LINE-IN / AMBIENT AUDIO');
    notify('Listening to Line-In / Ambient Audio 🎙️');
  } catch {
    notify('Microphone / Line-In permission was declined.');
  }
}

// --- Real-Time Audio Analysis & Beat Detection ---
function updateAudioAnalysis(timeSec, dt) {
  const hasRealAudio = state.sourceType !== 'idle' && analyser &&
    !(state.sourceType === 'file' && audioEl.paused) &&
    !(state.sourceType === 'synth' && !synthPlaying);

  if (hasRealAudio) {
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(waveData);
  } else {
    // Gentle harmonic demo signal when idle so the visualizer breathes and responds to touch
    for (let i = 0; i < 512; i++) {
      const f = i / 512;
      const pulse = Math.pow(Math.sin(timeSec * 2.1) * 0.5 + 0.5, 3);
      const val = Math.max(0, (1 - f * 1.1) * (65 + pulse * 95 * Math.exp(-f * 4)) + Math.sin(f * 28 - timeSec * 4) * 18);
      freqData[i] = Math.min(255, val);
      const wave = 128 + Math.sin(f * Math.PI * 6 + timeSec * 5) * (28 + pulse * 36) +
                   Math.cos(f * Math.PI * 14 - timeSec * 8) * 14;
      waveData[i] = Math.max(0, Math.min(255, wave));
    }
  }

  const g = state.gain;
  let subSum = 0, bassSum = 0, midSum = 0, highSum = 0;
  for (let i = 1; i <= 5; i++) subSum += freqData[i];
  for (let i = 6; i <= 22; i++) bassSum += freqData[i];
  for (let i = 23; i <= 110; i++) midSum += freqData[i];
  for (let i = 111; i <= 360; i++) highSum += freqData[i];

  const rawSub = Math.min(1.8, (subSum / (5 * 255)) * g);
  const rawBass = Math.min(1.8, (bassSum / (17 * 255)) * g);
  const rawMid = Math.min(1.8, (midSum / (88 * 255)) * g);
  const rawHigh = Math.min(1.8, (highSum / (250 * 255)) * g * 1.35);

  const smooth = 1 - Math.exp(-dt * 18);
  state.subBass += (rawSub - state.subBass) * smooth;
  state.bass += (rawBass - state.bass) * smooth;
  state.mid += (rawMid - state.mid) * smooth;
  state.high += (rawHigh - state.high) * smooth;

  // Adaptive Kick / Transient Beat Detection
  const lowEnergy = rawSub * 0.65 + rawBass * 0.35;
  let avgEnergy = 0;
  for (let i = 0; i < state.energyHistory.length; i++) avgEnergy += state.energyHistory[i];
  avgEnergy /= state.energyHistory.length;
  state.energyHistory[state.energyIdx] = lowEnergy;
  state.energyIdx = (state.energyIdx + 1) % state.energyHistory.length;

  const nowMs = performance.now();
  if (lowEnergy > Math.max(0.22, avgEnergy * 1.32) && nowMs - state.lastBeatTime > 210) {
    const interval = nowMs - state.lastBeatTime;
    if (interval > 260 && interval < 1200) {
      const instantBpm = Math.round(60000 / interval);
      state.bpmEstimate = Math.round(state.bpmEstimate * 0.8 + instantBpm * 0.2);
    }
    state.lastBeatTime = nowMs;
    state.beatPulse = Math.min(1.5, 0.85 + lowEnergy * 0.5);
    state.beatPhase += 0.78;
  } else {
    state.beatPulse *= Math.exp(-dt * 7.5);
  }

  // Pack 512x2 GPU texture (Row 0: Spectrum, Row 1: Oscilloscope Waveform)
  for (let i = 0; i < 512; i++) {
    audioTexData[i] = Math.min(255, freqData[i] * g);
    audioTexData[512 + i] = waveData[i];
  }
}

// --- WebGL Ping-Pong Feedback + Multi-Mode Shader Pipeline ---
const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false });

const VERT_SRC = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// Pass 1: Fluid Feedback Advection + Oscilloscope / Spectrum Injection (WMP Alchemy / MilkDrop core)
const FEEDBACK_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPrevTex;
uniform sampler2D uAudioTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uBeat;
uniform float uPhase;
uniform float uDecay;
uniform float uWarp;
uniform float uSymmetry;
uniform int uMode;
uniform int uPalette;
uniform vec2 uPointer;
uniform vec2 uPointerVel;
uniform float uPointerDown;

vec3 palette(float t, int pal) {
  if (pal == 1) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
  } else if (pal == 2) {
    return 0.5 + 0.5 * cos(6.28318 * (t * 0.8 + vec3(0.0, 0.15, 0.42)));
  } else if (pal == 3) {
    return 0.5 + 0.5 * cos(6.28318 * (t * 0.9 + vec3(0.25, 0.05, 0.55)));
  } else if (pal == 4) {
    float v = 0.5 + 0.5 * sin(t * 6.28318);
    return vec3(v * 0.85, v * 0.92, v);
  }
  // Default 0: WMP Alchemy Emerald / Cyan / Magenta / Gold
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.08, 0.28, 0.58)));
}

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 aspect = vec2(uRes.x / max(1.0, uRes.y), 1.0);
  vec2 p = (vUv - 0.5) * aspect;

  // Optional Kaleidoscope symmetry folding
  if (uSymmetry > 1.5) {
    float r = length(p);
    float a = atan(p.y, p.x);
    float seg = 6.2831853 / uSymmetry;
    a = mod(a, seg);
    a = abs(a - seg * 0.5);
    p = vec2(cos(a), sin(a)) * r;
  }

  // Interactive pointer gravity & ripple warp
  vec2 ptr = (uPointer - 0.5) * aspect;
  vec2 toPtr = p - ptr;
  float ptrDist = length(toPtr) + 0.001;
  float ptrForce = exp(-ptrDist * 4.5) * (0.018 + 0.035 * uPointerDown + length(uPointerVel) * 0.25);

  // MilkDrop / Alchemy curl-like zoom & rotation warp driven by Bass & Mid
  float zoom = 1.0 - (0.009 + uBass * 0.022 + uBeat * 0.018) * uWarp;
  float angle = (0.004 + (uMid - 0.3) * 0.016) * uWarp * sin(uTime * 0.45 + length(p) * 3.2);
  vec2 warped = (vUv - 0.5) * rot(angle) * zoom;

  // Fluid wave displacement
  vec2 swirl = vec2(
    sin(p.y * 5.5 + uTime * 1.6 + uBass * 3.0),
    cos(p.x * 5.5 - uTime * 1.4 + uMid * 3.0)
  ) * 0.0038 * uWarp;

  vec2 sampleUv = clamp(0.5 + warped + swirl - normalize(toPtr) * ptrForce + uPointerVel * exp(-ptrDist * 3.5) * 0.04, 0.002, 0.998);
  vec3 prev = texture2D(uPrevTex, sampleUv).rgb;

  // Slight hue shift inside feedback loop
  prev = mix(prev, prev.gbr, 0.014 + uHigh * 0.02);

  // Sample live Time-Domain Waveform (row y = 0.75) & FFT Spectrum (row y = 0.25)
  float waveX = clamp(vUv.x, 0.01, 0.99);
  float waveSample = (texture2D(uAudioTex, vec2(waveX, 0.75)).r - 0.5) * 2.0;
  float waveSample2 = (texture2D(uAudioTex, vec2(1.0 - waveX, 0.75)).r - 0.5) * 2.0;

  float rad = length(p);
  float ang = atan(p.y, p.x);
  float fftU = clamp(abs(ang) / 3.14159265, 0.01, 0.99);
  float fftVal = texture2D(uAudioTex, vec2(fftU * 0.65, 0.25)).r;

  vec3 seed = vec3(0.0);

  if (uMode == 0) {
    // MODE 0: ALCHEMY PLASMA — Twin intertwined oscilloscope ribbons + radial bass pulse
    float y1 = waveSample * (0.28 + uBass * 0.22) + sin(vUv.x * 6.28 + uTime * 2.0) * 0.06;
    float y2 = -waveSample2 * (0.24 + uMid * 0.2) + cos(vUv.x * 6.28 - uTime * 1.7) * 0.06;
    float d1 = abs(p.y - y1);
    float d2 = abs(p.y - y2);
    float glow1 = 0.0045 / (d1 + 0.0035);
    float glow2 = 0.004 / (d2 + 0.0035);

    // Radial harmonic ring
    float ringR = 0.24 + uBass * 0.14 + fftVal * 0.16 + (waveSample * 0.06);
    float dRing = abs(rad - ringR);
    float ringGlow = (0.0035 + uBeat * 0.004) / (dRing + 0.004);

    vec3 c1 = palette(vUv.x + uTime * 0.12 + uPhase * 0.1, uPalette);
    vec3 c2 = palette(vUv.x + 0.45 - uTime * 0.1, uPalette);
    seed += c1 * glow1 * (0.65 + uBass * 0.6);
    seed += c2 * glow2 * (0.55 + uMid * 0.6);
    seed += palette(fftU + uTime * 0.2, uPalette) * ringGlow * (0.5 + fftVal);
  } else if (uMode == 1) {
    // MODE 1: FIRESTORM WAVES — WMP Bars & Waves horizon injection
    float barFft = texture2D(uAudioTex, vec2(clamp(vUv.x * 0.75, 0.01, 0.99), 0.25)).r;
    float waveLine = -0.12 + barFft * 0.48 + waveSample * 0.08;
    float dWave = abs(p.y - waveLine);
    float crest = 0.005 / (dWave + 0.004);
    vec3 col = palette(vUv.x * 0.6 + barFft * 0.5 + uTime * 0.08, uPalette);
    seed += col * crest * (0.6 + barFft * 0.9);
  } else if (uMode == 2) {
    // MODE 2: FERRO-ORB 3D — Energy corona around central ferrofluid sphere
    float coronaR = 0.28 + fftVal * 0.18 + uBass * 0.1;
    float dCorona = abs(rad - coronaR);
    seed += palette(ang * 0.159 + uTime * 0.15, uPalette) * (0.004 / (dCorona + 0.005)) * (0.6 + uBass);
  } else {
    // MODE 3: HYPER-TUNNEL — Concentric geometric stargate rings
    vec2 boxP = abs(p * rot(uTime * 0.3 + rad * 2.0));
    float polyR = max(boxP.x, boxP.y) + length(p) * 0.35;
    float ringPattern = abs(fract(polyR * 4.5 - uTime * (1.2 + uBass * 1.5)) - 0.5);
    float gateGlow = 0.012 / (ringPattern + 0.012) * smoothstep(0.04, 0.25, rad);
    seed += palette(polyR + uTime * 0.15 + uBeat * 0.2, uPalette) * gateGlow * (0.45 + fftVal * 0.9);
  }

  // Interactive pointer spark injection
  float ptrGlow = (0.003 + 0.006 * uPointerDown) / (ptrDist + 0.008);
  seed += palette(uTime * 0.3, uPalette) * ptrGlow * 0.45;

  vec3 outCol = prev * uDecay + seed * 0.34;
  gl_FragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
}
`;

// Pass 2: Crisp Foreground Waveforms, 3D Ferrofluid / Firestorm Bars & ACES Tonemapping
const COMPOSITE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uFeedbackTex;
uniform sampler2D uAudioTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uBeat;
uniform float uPhase;
uniform float uSymmetry;
uniform int uMode;
uniform int uPalette;
uniform vec2 uPointer;

vec3 palette(float t, int pal) {
  if (pal == 1) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
  } else if (pal == 2) {
    return 0.5 + 0.5 * cos(6.28318 * (t * 0.8 + vec3(0.0, 0.15, 0.42)));
  } else if (pal == 3) {
    return 0.5 + 0.5 * cos(6.28318 * (t * 0.9 + vec3(0.25, 0.05, 0.55)));
  } else if (pal == 4) {
    float v = 0.5 + 0.5 * sin(t * 6.28318);
    return vec3(v * 0.85, v * 0.92, v);
  }
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.08, 0.28, 0.58)));
}

void main() {
  vec2 aspect = vec2(uRes.x / max(1.0, uRes.y), 1.0);
  vec2 p = (vUv - 0.5) * aspect;

  // Beat-reactive chromatic aberration on feedback texture
  vec2 caOffset = (vUv - 0.5) * (0.002 + uBeat * 0.006 + uBass * 0.004);
  vec3 fb;
  fb.r = texture2D(uFeedbackTex, vUv + caOffset).r;
  fb.g = texture2D(uFeedbackTex, vUv).g;
  fb.b = texture2D(uFeedbackTex, vUv - caOffset).b;

  vec3 col = fb;

  // Crisp foreground overlays per mode
  float waveSample = (texture2D(uAudioTex, vec2(clamp(vUv.x, 0.01, 0.99), 0.75)).r - 0.5) * 2.0;

  if (uMode == 0) {
    // Crisp high-definition oscilloscope core ribbon
    float yCore = waveSample * (0.28 + uBass * 0.22) + sin(vUv.x * 6.28 + uTime * 2.0) * 0.06;
    float coreLine = smoothstep(0.008, 0.001, abs(p.y - yCore));
    col += vec3(0.9, 0.98, 1.0) * coreLine * 0.85;
  } else if (uMode == 1) {
    // WMP Firestorm / Ocean Mist: 96 discrete quantized spectrum bars + mirrored water reflection
    float bands = 96.0;
    float bandIdx = floor(vUv.x * bands) / bands;
    float cellX = fract(vUv.x * bands);
    float barMask = smoothstep(0.0, 0.12, cellX) * smoothstep(1.0, 0.82, cellX);
    float h = texture2D(uAudioTex, vec2(clamp(bandIdx * 0.72 + 0.02, 0.01, 0.99), 0.25)).r * 0.56;
    float baseline = -0.18;
    float yRel = p.y - baseline;

    vec3 barCol = palette(bandIdx + h * 0.6 + uTime * 0.05, uPalette);
    if (yRel >= 0.0 && yRel <= h) {
      float vGrad = yRel / max(0.001, h);
      col += barCol * barMask * (0.45 + 0.75 * pow(vGrad, 1.5));
    }
    // Glowing peak cap
    float capDist = abs(yRel - h);
    col += vec3(1.0, 0.96, 0.85) * barMask * smoothstep(0.009, 0.001, capDist);

    // Mirrored rippled water reflection below baseline
    if (yRel < 0.0 && yRel > -h * 0.75) {
      float ripple = sin(p.x * 40.0 + yRel * 65.0 - uTime * 6.0) * 0.5 + 0.5;
      float reflAlpha = (1.0 - abs(yRel) / max(0.001, h * 0.75)) * 0.42;
      col += barCol * barMask * reflAlpha * (0.6 + 0.4 * ripple);
    }
  } else if (uMode == 2) {
    // 3D Ferrofluid Metallic Sphere displaced by live audio harmonics
    float r = length(p);
    float ang = atan(p.y, p.x);
    float fftVal = texture2D(uAudioTex, vec2(clamp(abs(ang) / 3.14159, 0.01, 0.99) * 0.6, 0.25)).r;
    float spikes = sin(ang * 12.0 + uTime * 3.0) * cos(ang * 7.0 - uTime * 2.2) * (0.025 + uBass * 0.065 + fftVal * 0.055);
    float orbRadius = 0.25 + uBass * 0.07 + spikes;

    if (r < orbRadius) {
      vec2 n2 = p / orbRadius;
      float z = sqrt(max(0.001, 1.0 - dot(n2, n2)));
      vec3 normal = normalize(vec3(n2 + sin(n2.yx * 18.0 + uTime * 4.0) * (0.12 + fftVal * 0.28), z));
      vec3 lightDir = normalize(vec3(uPointer.x - 0.5, uPointer.y - 0.5, 0.85));
      float diff = max(0.0, dot(normal, lightDir));
      float rim = pow(1.0 - max(0.0, normal.z), 3.0);
      float spec = pow(max(0.0, dot(reflect(-lightDir, normal), vec3(0.0, 0.0, 1.0))), 24.0);
      vec3 metalCol = palette(diff * 0.5 + fftVal * 0.4 + uTime * 0.08, uPalette);
      col = mix(col * 0.25, metalCol * (0.25 + diff * 0.85) + vec3(1.0) * spec * 0.9 + palette(uTime * 0.2, uPalette) * rim * 1.2, 0.95);
    }
  } else {
    // MODE 3: HYPER-TUNNEL — Central stargate horizon + radial waveform spokes
    float r = length(p);
    float ang = atan(p.y, p.x);
    float spokeWave = (texture2D(uAudioTex, vec2(clamp((ang + 3.14159) / 6.28318, 0.01, 0.99), 0.75)).r - 0.5) * 2.0;
    float spokeDist = abs(r - (0.18 + uBass * 0.12 + spokeWave * 0.07));
    col += vec3(0.95, 0.98, 1.0) * (0.0025 / (spokeDist + 0.003));
  }

  // Subtle vignette & filmic contrast
  float vig = 1.0 - dot(vUv - 0.5, vUv - 0.5) * 0.55;
  col *= vig;
  col = col / (1.0 + col * 0.22); // Soft highlight roll-off
  gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.92)), 1.0);
}
`;

function compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
  }
  return s;
}

function createProgram(vs, fs) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  return prog;
}

const feedbackProg = createProgram(VERT_SRC, FEEDBACK_FRAG);
const compositeProg = createProgram(VERT_SRC, COMPOSITE_FRAG);

// Fullscreen quad buffer
const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

// Audio DataTexture (512x2 LUMINANCE)
const audioTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, audioTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 512, 2, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, audioTexData);

// Ping-Pong Framebuffers
let fboWidth = 0, fboHeight = 0;
const fbos = [null, null];
const fboTexs = [null, null];
let pingIndex = 0;

function createFbo(w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex };
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const w = Math.max(1, Math.floor(window.innerWidth * dpr));
  const h = Math.max(1, Math.floor(window.innerHeight * dpr));
  if (canvas.width === w && canvas.height === h) return;
  canvas.width = w;
  canvas.height = h;
  fboWidth = w;
  fboHeight = h;

  for (let i = 0; i < 2; i++) {
    if (fboTexs[i]) gl.deleteTexture(fboTexs[i]);
    if (fbos[i]) gl.deleteFramebuffer(fbos[i]);
    const created = createFbo(w, h);
    fbos[i] = created.fbo;
    fboTexs[i] = created.tex;
  }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- UI Event Listeners & Interactive Controls ---
$('btn-system').addEventListener('click', startSystemAudio);
$('file-input').addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (file) loadAudioFile(file);
});
$('btn-synth').addEventListener('click', () => {
  if (state.sourceType === 'synth' && synthPlaying) {
    stopSynth();
    $('btn-play-pause').textContent = '▶';
    $('source-badge').textContent = 'SYNTH PAUSED';
  } else {
    startSynth();
  }
});
$('btn-mic').addEventListener('click', startMicAudio);

// Drag & Drop audio files anywhere on window
window.addEventListener('dragover', e => {
  e.preventDefault();
  document.body.classList.add('dragging-file');
});
window.addEventListener('dragleave', e => {
  if (e.relatedTarget === null) document.body.classList.remove('dragging-file');
});
window.addEventListener('drop', e => {
  e.preventDefault();
  document.body.classList.remove('dragging-file');
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type.startsWith('audio/')) {
    loadAudioFile(file);
  } else if (file) {
    loadAudioFile(file);
  }
});

// Transport bar controls
$('btn-play-pause').addEventListener('click', () => {
  if (state.sourceType === 'file') {
    if (audioEl.paused) {
      ensureAudioContext();
      audioEl.play();
      $('btn-play-pause').textContent = '⏸';
    } else {
      audioEl.pause();
      $('btn-play-pause').textContent = '▶';
    }
  } else if (state.sourceType === 'synth') {
    if (synthPlaying) {
      stopSynth();
      $('btn-play-pause').textContent = '▶';
    } else {
      startSynth();
    }
  }
});

$('seek-bar').addEventListener('input', e => {
  if (state.sourceType === 'file' && Number.isFinite(audioEl.duration)) {
    audioEl.currentTime = (Number(e.target.value) / 100) * audioEl.duration;
  }
});

audioEl.addEventListener('timeupdate', () => {
  if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
    $('seek-bar').value = String((audioEl.currentTime / audioEl.duration) * 100);
    $('track-time').textContent = `${formatTime(audioEl.currentTime)} / ${formatTime(audioEl.duration)}`;
  }
});
audioEl.addEventListener('ended', () => {
  $('btn-play-pause').textContent = '▶';
});

// Synth groove selector & Bass Drop button
document.querySelectorAll('.groove-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.groove-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    synthGroove = Number(btn.dataset.groove) || 0;
    if (state.sourceType === 'synth') startSynth();
  });
});

$('btn-drop').addEventListener('click', () => {
  if (state.sourceType !== 'synth' || !synthPlaying) startSynth();
  dropIntensity = 1.0;
  state.beatPulse = 1.45;
  state.beatPhase += 1.5;
  triggerKick(audioCtx.currentTime, 1.6);
  notify('⚡ SUB-BASS DROP TRIGGERED!');
});

// Visual Mode Tabs
document.querySelectorAll('.mode-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-pill').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    state.mode = Number(btn.dataset.mode) || 0;
  });
});

// Customization Drawer Controls
const drawer = $('custom-drawer');
$('toggle-drawer').addEventListener('click', () => {
  drawer.hidden = !drawer.hidden;
  $('toggle-drawer').setAttribute('aria-expanded', String(!drawer.hidden));
});
$('close-drawer').addEventListener('click', () => {
  drawer.hidden = true;
  $('toggle-drawer').setAttribute('aria-expanded', 'false');
});

$('ctrl-gain').addEventListener('input', e => {
  state.gain = Number(e.target.value);
  $('val-gain').textContent = `${state.gain.toFixed(2)}×`;
});
$('ctrl-decay').addEventListener('input', e => {
  state.decay = Number(e.target.value);
  $('val-decay').textContent = `${Math.round(state.decay * 100)}%`;
});
$('ctrl-warp').addEventListener('input', e => {
  state.warp = Number(e.target.value);
  $('val-warp').textContent = `${state.warp.toFixed(2)}×`;
});
$('ctrl-sym').addEventListener('input', e => {
  state.symmetry = Number(e.target.value);
  $('val-sym').textContent = state.symmetry === 1 ? 'OFF (1×)' : `${state.symmetry}× KALEIDOSCOPE`;
});

document.querySelectorAll('.palette-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.palette = Number(btn.dataset.palette) || 0;
  });
});

// Zen Mode & Fullscreen
function setZenMode(on) {
  document.body.classList.toggle('zen-mode', on);
  $('exit-zen').hidden = !on;
}
$('zen-btn').addEventListener('click', () => setZenMode(true));
$('exit-zen').addEventListener('click', () => setZenMode(false));

$('fullscreen-btn').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});

window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('zen-mode')) {
    setZenMode(false);
  } else if (e.key === ' ' && !['INPUT', 'BUTTON'].includes(document.activeElement?.tagName)) {
    e.preventDefault();
    $('btn-play-pause').click();
  }
});

// Interactive Pointer Physics on Canvas
function updatePointer(clientX, clientY) {
  const nx = clientX / Math.max(1, window.innerWidth);
  const ny = 1.0 - clientY / Math.max(1, window.innerHeight);
  state.pointerVx = (nx - state.pointerX) * 0.65;
  state.pointerVy = (ny - state.pointerY) * 0.65;
  state.pointerX = nx;
  state.pointerY = ny;
}

canvas.addEventListener('pointerdown', e => {
  state.pointerDown = true;
  updatePointer(e.clientX, e.clientY);
  state.beatPulse = Math.max(state.beatPulse, 0.9);
});
window.addEventListener('pointermove', e => {
  updatePointer(e.clientX, e.clientY);
});
window.addEventListener('pointerup', () => {
  state.pointerDown = false;
});

// --- Main Render Loop ---
let lastTime = performance.now();
let frames = 0;
let fpsClock = performance.now();

function renderLoop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const timeSec = now * 0.001;
  frames++;

  if (now - fpsClock >= 500) {
    const fps = Math.round((frames * 1000) / (now - fpsClock));
    $('fps-readout').textContent = `${fps} FPS`;
    frames = 0;
    fpsClock = now;
  }

  updateAudioAnalysis(timeSec, dt);

  // Decay pointer velocity smoothly
  state.pointerVx *= Math.exp(-dt * 10);
  state.pointerVy *= Math.exp(-dt * 10);

  // Update Telemetry DOM meters
  $('meter-bass').style.width = `${Math.min(100, Math.round((state.subBass * 0.5 + state.bass * 0.5) * 85))}%`;
  $('meter-mid').style.width = `${Math.min(100, Math.round(state.mid * 85))}%`;
  $('meter-high').style.width = `${Math.min(100, Math.round(state.high * 90))}%`;
  $('bpm-readout').textContent = state.sourceType === 'idle' ? 'INTERACTIVE DEMO · TOUCH CANVAS' : `~${state.bpmEstimate} BPM · LIVE DSP`;

  const orbScale = 1 + state.beatPulse * 0.55;
  $('beat-indicator').style.transform = `scale(${orbScale.toFixed(2)})`;

  // Upload 512x2 Audio Texture
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, audioTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 512, 2, gl.LUMINANCE, gl.UNSIGNED_BYTE, audioTexData);

  const readIdx = pingIndex;
  const writeIdx = 1 - pingIndex;

  // PASS 1: Render into writeIdx FBO (Feedback Warp + Wave Injection)
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[writeIdx]);
  gl.viewport(0, 0, fboWidth, fboHeight);
  gl.useProgram(feedbackProg);

  const posLoc1 = gl.getAttribLocation(feedbackProg, 'aPos');
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(posLoc1);
  gl.vertexAttribPointer(posLoc1, 2, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fboTexs[readIdx]);
  gl.uniform1i(gl.getUniformLocation(feedbackProg, 'uPrevTex'), 0);
  gl.uniform1i(gl.getUniformLocation(feedbackProg, 'uAudioTex'), 1);
  gl.uniform2f(gl.getUniformLocation(feedbackProg, 'uRes'), fboWidth, fboHeight);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uTime'), timeSec);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uBass'), state.bass);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uMid'), state.mid);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uHigh'), state.high);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uBeat'), state.beatPulse);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uPhase'), state.beatPhase);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uDecay'), state.decay);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uWarp'), state.warp);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uSymmetry'), state.symmetry);
  gl.uniform1i(gl.getUniformLocation(feedbackProg, 'uMode'), state.mode);
  gl.uniform1i(gl.getUniformLocation(feedbackProg, 'uPalette'), state.palette);
  gl.uniform2f(gl.getUniformLocation(feedbackProg, 'uPointer'), state.pointerX, state.pointerY);
  gl.uniform2f(gl.getUniformLocation(feedbackProg, 'uPointerVel'), state.pointerVx, state.pointerVy);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uPointerDown'), state.pointerDown ? 1.0 : 0.0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // PASS 2: Render Composite + Foreground Waves to Screen
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(compositeProg);

  const posLoc2 = gl.getAttribLocation(compositeProg, 'aPos');
  gl.enableVertexAttribArray(posLoc2);
  gl.vertexAttribPointer(posLoc2, 2, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fboTexs[writeIdx]);
  gl.uniform1i(gl.getUniformLocation(compositeProg, 'uFeedbackTex'), 0);
  gl.uniform1i(gl.getUniformLocation(compositeProg, 'uAudioTex'), 1);
  gl.uniform2f(gl.getUniformLocation(compositeProg, 'uRes'), canvas.width, canvas.height);
  gl.uniform1f(gl.getUniformLocation(compositeProg, 'uTime'), timeSec);
  gl.uniform1f(gl.getUniformLocation(compositeProg, 'uBass'), state.bass);
  gl.uniform1f(gl.getUniformLocation(compositeProg, 'uMid'), state.mid);
  gl.uniform1f(gl.getUniformLocation(compositeProg, 'uHigh'), state.high);
  gl.uniform1f(gl.getUniformLocation(compositeProg, 'uBeat'), state.beatPulse);
  gl.uniform1f(gl.getUniformLocation(compositeProg, 'uPhase'), state.beatPhase);
  gl.uniform1f(gl.getUniformLocation(compositeProg, 'uSymmetry'), state.symmetry);
  gl.uniform1i(gl.getUniformLocation(compositeProg, 'uMode'), state.mode);
  gl.uniform1i(gl.getUniformLocation(compositeProg, 'uPalette'), state.palette);
  gl.uniform2f(gl.getUniformLocation(compositeProg, 'uPointer'), state.pointerX, state.pointerY);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  pingIndex = writeIdx;
  requestAnimationFrame(renderLoop);
}

requestAnimationFrame(renderLoop);
