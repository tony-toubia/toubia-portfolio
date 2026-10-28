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
let localFilesQueue = [];
let localFileIndex = 0;

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

function stopCurrentSources(keepSpotifyEmbed = false) {
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop());
    activeStream = null;
  }
  if (streamSourceNode) {
    try { streamSourceNode.disconnect(); } catch {}
    streamSourceNode = null;
  }
  if (!audioEl.paused) {
    audioEl.pause();
  }
  if (!keepSpotifyEmbed && spotifyState.embedController && spotifyState.embedPlaying) {
    try { spotifyState.embedController.pause(); } catch {}
    spotifyState.embedPlaying = false;
  }
  document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
}

function setActiveSourceUI(type, badgeText) {
  state.sourceType = type;
  $('source-badge').textContent = badgeText;
  document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
  if (type === 'spotify' || type === 'spotify-embed') $('btn-spotify')?.classList.add('active');
  if (type === 'system') $('btn-system')?.classList.add('active');
  if (type === 'file') $('btn-file-label')?.classList.add('active');

  const isSpotify = type === 'spotify' || type === 'spotify-embed';
  const showTransport = type === 'file' || isSpotify;
  $('transport-bar').hidden = !showTransport;
  $('seek-bar').hidden = type === 'spotify-embed';
  $('track-time').hidden = type === 'spotify-embed';

  const hasQueue =
    (isSpotify && spotifyState.currentQueue.length > 1) ||
    (type === 'file' && localFilesQueue.length > 1);
  if ($('btn-prev-track')) $('btn-prev-track').hidden = !hasQueue;
  if ($('btn-next-track')) $('btn-next-track').hidden = !hasQueue;

  if (!isSpotify) {
    if ($('transport-art')) $('transport-art').hidden = true;
    if ($('track-artist')) $('track-artist').textContent = '';
    if ($('transport-spotify-link')) $('transport-spotify-link').hidden = true;
  }
}

// 1. Share Tab / Window Audio (Pandora, YouTube, Spotify Desktop, Apple Music)
async function startSystemAudio() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    notify('Sharing Tab/Window audio requires a desktop browser (Chrome, Edge, Brave). On mobile, use Spotify or Local Music!');
    return;
  }
  try {
    notify('Select a Browser Tab (Pandora, Spotify, YouTube) or Screen and check "Also share audio" 🔊', 5000);
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
    // Connect ONLY to analyser, NOT to destination, so shared audio doesn't double-echo!
    streamSourceNode.connect(analyser);

    const label = audioTracks[0].label || 'Tab / Window Audio';
    setActiveSourceUI('system', `LIVE AUDIO · ${label.toUpperCase().slice(0, 32)}`);
    notify(`Connected to ${label}! Visualizing live audio 🌈`);

    stream.getTracks().forEach(track => {
      track.addEventListener('ended', () => {
        if (state.sourceType === 'system') {
          stopCurrentSources();
          setActiveSourceUI('idle', 'AUDIO SHARE ENDED · SELECT SOURCE');
        }
      });
    });
  } catch (err) {
    if (err?.name !== 'NotAllowedError') {
      notify('Could not capture tab/window audio. Make sure "Share audio" is enabled.');
    }
  }
}

// 2. Local Music Files Playback (Single or Multiple Files on Desktop & Phone)
function loadLocalFiles(fileList) {
  const files = Array.from(fileList || []).filter(
    f => f && (f.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg|aac|opus)$/i.test(f.name))
  );
  if (!files.length) {
    notify('Please select a valid audio file (MP3, WAV, FLAC, M4A, OGG).');
    return;
  }
  localFilesQueue = files;
  playLocalFileAt(0);
}

function playLocalFileAt(index) {
  if (!localFilesQueue.length) return;
  localFileIndex = (index + localFilesQueue.length) % localFilesQueue.length;
  const file = localFilesQueue[localFileIndex];
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
  if ($('track-artist')) {
    $('track-artist').textContent =
      localFilesQueue.length > 1 ? `· File ${localFileIndex + 1} of ${localFilesQueue.length}` : '· Local Music';
  }
  setActiveSourceUI('file', `LOCAL MUSIC · ${cleanName.toUpperCase().slice(0, 30)}`);

  audioEl
    .play()
    .then(() => {
      $('btn-play-pause').textContent = '⏸';
      notify(`Playing "${cleanName}" 🎵`);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: cleanName,
          artist: 'Local Music · Sonic Prism',
        });
        navigator.mediaSession.setActionHandler('play', () => audioEl.play());
        navigator.mediaSession.setActionHandler('pause', () => audioEl.pause());
        navigator.mediaSession.setActionHandler('previoustrack', () => playLocalFileAt(localFileIndex - 1));
        navigator.mediaSession.setActionHandler('nexttrack', () => playLocalFileAt(localFileIndex + 1));
      }
    })
    .catch(() => {
      $('btn-play-pause').textContent = '▶';
    });
}

// 3. Direct In-App Spotify Player & Search Engine
const spotifyState = {
  engine: 'direct', // 'direct' (CORS WebAudio 2048-FFT) | 'embed' (Official Spotify Player)
  tab: 'playlists', // 'playlists' | 'search' | 'library'
  officialPlaylists: [],
  searchResults: [],
  currentQueue: [],
  currentIndex: -1,
  currentTrack: null,
  activeCollection: null,
  embedController: null,
  embedReady: false,
  embedPlaying: false,
  embedPositionMs: 0,
  embedDurationMs: 0,
  trackSeed: 1.0,
  clientId: localStorage.getItem('sp_client_id') || '',
  accessToken: localStorage.getItem('sp_access_token') || '',
  tokenExpiry: Number(localStorage.getItem('sp_token_expiry') || 0),
  userProfile: null,
  userLibraryTracks: [],
  userPlaylists: [],
};

window.onSpotifyIframeApiReady = IFrameAPI => {
  const target = $('spotify-embed-target');
  if (!target) return;
  IFrameAPI.createController(
    target,
    {
      uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M',
      width: '100%',
      height: 152,
    },
    controller => {
      spotifyState.embedController = controller;
      spotifyState.embedReady = true;
      controller.addListener('playback_update', e => {
        const data = e?.data;
        if (!data) return;
        const wasPlaying = spotifyState.embedPlaying;
        spotifyState.embedPlaying = !data.isPaused;
        spotifyState.embedPositionMs = Number(data.position || 0);
        spotifyState.embedDurationMs = Number(data.duration || 0);

        if (spotifyState.embedPlaying && !wasPlaying) {
          if (state.sourceType !== 'system') {
            stopCurrentSources(true);
            const title = spotifyState.currentTrack?.title || 'Spotify Player';
            setActiveSourceUI('spotify-embed', `SPOTIFY PLAYER · ${title.toUpperCase().slice(0, 28)}`);
          }
          $('btn-play-pause').textContent = '⏸';
        } else if (!spotifyState.embedPlaying && wasPlaying && state.sourceType === 'spotify-embed') {
          $('btn-play-pause').textContent = '▶';
        }
      });
    }
  );
};

function estimateBpmFromTrack(title = '', artist = '') {
  const str = `${title} ${artist}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  spotifyState.trackSeed = (hash % 1000) / 1000 + 0.5;
  return 108 + (hash % 32);
}

function updateTransportMetadata(track) {
  if (!track) return;
  $('track-title').textContent = track.title || 'Spotify Track';
  if ($('track-artist')) {
    $('track-artist').textContent = track.artist ? `· ${track.artist}` : '';
  }
  const artEl = $('transport-art');
  if (artEl) {
    if (track.artwork) {
      artEl.src = track.artwork;
      artEl.hidden = false;
    } else {
      artEl.hidden = true;
    }
  }
  const linkEl = $('transport-spotify-link');
  if (linkEl) {
    const url = track.externalUrl || (track.spotifyId ? `https://open.spotify.com/track/${track.spotifyId}` : '');
    if (url) {
      linkEl.href = url;
      linkEl.hidden = false;
    } else {
      linkEl.hidden = true;
    }
  }
}

async function playSpotifyTrack(track, index = 0, queue = spotifyState.currentQueue, autoCloseDrawer = true) {
  if (!track) return;
  spotifyState.currentTrack = track;
  spotifyState.currentIndex = index;
  if (Array.isArray(queue) && queue.length) {
    spotifyState.currentQueue = queue;
  }
  state.bpmEstimate = estimateBpmFromTrack(track.title, track.artist);
  updateTransportMetadata(track);
  highlightActiveTrackCard();

  // Official Spotify Embed Player Mode
  if (spotifyState.engine === 'embed' && (track.spotifyUri || track.spotifyId)) {
    const uri = track.spotifyUri || `spotify:track:${track.spotifyId}`;
    $('spotify-embed-dock').hidden = false;
    stopCurrentSources(true);
    setActiveSourceUI('spotify-embed', `SPOTIFY PLAYER · ${track.title.toUpperCase().slice(0, 28)}`);
    if (autoCloseDrawer) toggleSpotifyDrawer(false);
    if (spotifyState.embedController) {
      spotifyState.embedController.loadUri(uri);
      spotifyState.embedController.play();
      spotifyState.embedPlaying = true;
      $('btn-play-pause').textContent = '⏸';
      notify(`Loaded "${track.title}" in Official Spotify Player 🎧`);
    } else {
      notify('Spotify Player ready below — press Play in the widget!');
    }
    return;
  }

  // Direct WebAudio FFT Visualizer Stream
  if (!track.streamProxyUrl && track.title) {
    try {
      notify(`Loading "${track.title}"...`, 2000);
      const q = new URLSearchParams({
        resolveTrack: '1',
        title: track.title,
        artist: track.artist || '',
        spotifyId: track.spotifyId || '',
        artwork: track.artwork || '',
      });
      const res = await fetch(`/api/visualizer/spotify?${q.toString()}`);
      const data = await res.json();
      if (data?.track?.streamProxyUrl) {
        track.streamProxyUrl = data.track.streamProxyUrl;
        track.previewUrl = data.track.previewUrl;
        if (!track.artwork && data.track.artwork) track.artwork = data.track.artwork;
        updateTransportMetadata(track);
      }
    } catch {}
  }

  if (!track.streamProxyUrl) {
    if (track.spotifyUri || track.spotifyId) {
      setSpotifyEngine('embed');
      return playSpotifyTrack(track, index, queue, autoCloseDrawer);
    }
    notify('Could not load audio stream for this track — try another song!');
    return;
  }

  stopCurrentSources(false);
  ensureAudioContext();

  if (!mediaElementSourceNode) {
    mediaElementSourceNode = audioCtx.createMediaElementSource(audioEl);
    mediaElementSourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
  }

  audioEl.crossOrigin = 'anonymous';
  audioEl.src = track.streamProxyUrl;
  audioEl.load();

  setActiveSourceUI('spotify', `SPOTIFY · ${track.title.toUpperCase().slice(0, 30)}`);
  if (autoCloseDrawer) toggleSpotifyDrawer(false);

  try {
    await audioEl.play();
    $('btn-play-pause').textContent = '⏸';
    notify(`Playing "${track.title}" — ${track.artist} 🟢`);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist || 'Spotify Visualizer',
        artwork: track.artwork ? [{ src: track.artwork, sizes: '512x512', type: 'image/jpeg' }] : [],
      });
      navigator.mediaSession.setActionHandler('play', () => audioEl.play());
      navigator.mediaSession.setActionHandler('pause', () => audioEl.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => stepSpotifyQueue(-1));
      navigator.mediaSession.setActionHandler('nexttrack', () => stepSpotifyQueue(1));
    }
  } catch {
    $('btn-play-pause').textContent = '▶';
    notify('Tap Play (▶) in the bottom bar to start audio!');
  }
}

function stepSpotifyQueue(delta) {
  if (state.sourceType === 'file') {
    playLocalFileAt(localFileIndex + delta);
    return;
  }
  const q = spotifyState.currentQueue;
  if (!Array.isArray(q) || !q.length) return;
  const nextIdx = (spotifyState.currentIndex + delta + q.length) % q.length;
  playSpotifyTrack(q[nextIdx], nextIdx, q, false);
}

async function startCurrentTabSpotifyAudio() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    notify('Tab audio sync requires a desktop browser (Chrome/Edge).');
    return;
  }
  try {
    notify('Allow sharing this tab with "Share tab audio" checked for raw 2048-bin FFT! 🔊', 4500);
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        suppressLocalAudioPlayback: false,
      },
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      systemAudio: 'include',
    });
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      stream.getTracks().forEach(t => t.stop());
      notify('⚠️ Make sure "Share tab audio" is toggled ON in the popup!');
      return;
    }
    ensureAudioContext();
    if (activeStream) activeStream.getTracks().forEach(t => t.stop());
    activeStream = stream;
    const audioOnly = new MediaStream(audioTracks);
    streamSourceNode = audioCtx.createMediaStreamSource(audioOnly);
    streamSourceNode.connect(analyser);
    $('sp-embed-hint').textContent = '✓ Live 2048-bin Tab Audio FFT connected!';
    notify('Connected raw 2048-bin FFT to Spotify Player! 🌈');
  } catch {}
}

// --- Real-Time Audio Analysis & Beat Detection ---
function updateAudioAnalysis(timeSec, dt) {
  const hasDirectAudio =
    analyser &&
    ((state.sourceType === 'file' && !audioEl.paused) ||
      (state.sourceType === 'spotify' && !audioEl.paused) ||
      state.sourceType === 'system' ||
      (state.sourceType === 'spotify-embed' && activeStream));

  if (hasDirectAudio) {
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(waveData);
  } else if (state.sourceType === 'spotify-embed' && spotifyState.embedPlaying) {
    // Beat-locked harmonic telemetry synchronized to live Spotify Embed playback position & BPM
    const bpm = state.bpmEstimate || 122;
    const posSec = (spotifyState.embedPositionMs || timeSec * 1000) * 0.001;
    const beatPos = posSec * (bpm / 60);
    const beatFrac = beatPos - Math.floor(beatPos);
    const kickEnv = Math.pow(Math.max(0, 1.0 - beatFrac * 2.6), 2.2);
    const snareEnv = Math.floor(beatPos) % 2 === 1 ? Math.pow(Math.max(0, 1.0 - beatFrac * 3.0), 1.8) : 0;
    const hatEnv = Math.pow(Math.max(0, 1.0 - ((beatPos * 2) % 1) * 3.2), 2.0);
    const seed = spotifyState.trackSeed || 1.1;

    for (let i = 0; i < 512; i++) {
      const f = i / 512;
      const subKick = Math.exp(-f * 14.0) * kickEnv * 235;
      const bassGroove = Math.exp(-Math.pow((f - 0.07) * 18.0, 2.0)) * (110 + 95 * Math.sin(beatPos * Math.PI * 0.5 * seed));
      const vocalMids =
        Math.exp(-Math.pow((f - 0.24) * 7.5, 2.0)) *
        (85 + snareEnv * 110 + 55 * Math.sin(f * 32.0 - timeSec * 6.5 * seed));
      const hiAir = Math.pow(f, 0.7) * hatEnv * 125 + Math.sin(f * 70.0 + timeSec * 11.0) * 22;
      freqData[i] = Math.max(0, Math.min(255, subKick + bassGroove + vocalMids + hiAir));

      const wave =
        128 +
        Math.sin(f * Math.PI * 4.0 + timeSec * 9.0) * (35 + kickEnv * 58) +
        Math.sin(f * Math.PI * 18.0 - timeSec * 15.0 * seed) * (18 + snareEnv * 34) +
        Math.cos(f * Math.PI * 42.0 + timeSec * 23.0) * (hatEnv * 22);
      waveData[i] = Math.max(0, Math.min(255, wave));
    }
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

// --- Spotify Hub UI, Search, Playlist Loader & OAuth 2.0 PKCE ---
const spotifyDrawer = $('spotify-drawer');
const customDrawer = $('custom-drawer');
const authModal = $('spotify-auth-modal');

function toggleSpotifyDrawer(forceOpen) {
  if (!spotifyDrawer) return;
  const open = typeof forceOpen === 'boolean' ? forceOpen : spotifyDrawer.hidden;
  spotifyDrawer.hidden = !open;
  $('top-spotify-btn')?.classList.toggle('active', open);
  if (open) {
    if (customDrawer) {
      customDrawer.hidden = true;
      $('toggle-drawer')?.setAttribute('aria-expanded', 'false');
    }
    if (!spotifyState.officialPlaylists.length) {
      loadOfficialSpotifyPlaylists();
    }
    setTimeout(() => $('spotify-search-input')?.focus(), 40);
  }
}

function toggleCustomDrawer(forceOpen) {
  if (!customDrawer) return;
  const open = typeof forceOpen === 'boolean' ? forceOpen : customDrawer.hidden;
  customDrawer.hidden = !open;
  $('toggle-drawer')?.setAttribute('aria-expanded', String(open));
  if (open && spotifyDrawer) {
    spotifyDrawer.hidden = true;
    $('top-spotify-btn')?.classList.remove('active');
  }
}

$('btn-spotify')?.addEventListener('click', e => {
  e.stopPropagation();
  toggleSpotifyDrawer();
});
$('top-spotify-btn')?.addEventListener('click', e => {
  e.stopPropagation();
  toggleSpotifyDrawer();
});
$('close-spotify')?.addEventListener('click', e => {
  e.stopPropagation();
  toggleSpotifyDrawer(false);
});

$('toggle-drawer')?.addEventListener('click', e => {
  e.stopPropagation();
  toggleCustomDrawer();
});
$('close-drawer')?.addEventListener('click', e => {
  e.stopPropagation();
  toggleCustomDrawer(false);
});

$('close-embed-dock')?.addEventListener('click', e => {
  e.stopPropagation();
  if ($('spotify-embed-dock')) $('spotify-embed-dock').hidden = true;
  if (spotifyState.embedController && spotifyState.embedPlaying) {
    try { spotifyState.embedController.pause(); } catch {}
    spotifyState.embedPlaying = false;
  }
  if (state.sourceType === 'spotify-embed') {
    setActiveSourceUI('idle', 'READY · CHOOSE SPOTIFY, LOCAL MUSIC, OR TAB AUDIO');
  }
});

function setSpotifyEngine(engine) {
  spotifyState.engine = engine;
  $('sp-engine-direct')?.classList.toggle('active', engine === 'direct');
  $('sp-engine-embed')?.classList.toggle('active', engine === 'embed');
  if ($('spotify-embed-dock')) {
    $('spotify-embed-dock').hidden = engine !== 'embed';
  }
  if (spotifyState.currentTrack) {
    playSpotifyTrack(spotifyState.currentTrack, spotifyState.currentIndex, spotifyState.currentQueue, false);
  }
}

$('sp-engine-direct')?.addEventListener('click', () => setSpotifyEngine('direct'));
$('sp-engine-embed')?.addEventListener('click', () => setSpotifyEngine('embed'));
$('btn-spotify-tab-sync')?.addEventListener('click', startCurrentTabSpotifyAudio);

function selectSpotifyTab(tab) {
  spotifyState.tab = tab;
  document.querySelectorAll('.sp-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.spTab === tab);
  });
}

function highlightActiveTrackCard() {
  const activeId = spotifyState.currentTrack?.id;
  document.querySelectorAll('.sp-track-card[data-track-id]').forEach(card => {
    const isPlaying = Boolean(activeId && card.dataset.trackId === activeId);
    card.classList.toggle('playing', isPlaying);
    const badge = card.querySelector('.sp-track-play-badge');
    if (badge) badge.textContent = isPlaying ? '❚❚' : '▶';
  });
}

function renderSpotifyTracks(tracks, emptyMessage = 'No tracks found.') {
  const container = $('spotify-results');
  if (!container) return;
  if (!Array.isArray(tracks) || !tracks.length) {
    container.innerHTML = `<div class="sp-loading">${emptyMessage}</div>`;
    return;
  }

  spotifyState.currentQueue = tracks;
  container.innerHTML = '';

  tracks.forEach((track, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sp-track-card';
    btn.dataset.trackId = track.id || `idx-${idx}`;
    if (spotifyState.currentTrack?.id && spotifyState.currentTrack.id === track.id) {
      btn.classList.add('playing');
    }

    const art = document.createElement('img');
    art.className = 'sp-track-art';
    art.src =
      track.artwork ||
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="%23121a2e"/><circle cx="40" cy="40" r="18" fill="%231ed760"/></svg>';
    art.alt = '';
    art.loading = 'lazy';

    const meta = document.createElement('div');
    meta.className = 'sp-track-meta';
    const titleEl = document.createElement('strong');
    titleEl.textContent = track.title || 'Unknown Track';
    const subEl = document.createElement('small');
    subEl.textContent = track.artist || 'Spotify Artist';
    meta.appendChild(titleEl);
    meta.appendChild(subEl);

    const badge = document.createElement('span');
    badge.className = 'sp-track-play-badge';
    badge.textContent =
      spotifyState.currentTrack?.id && spotifyState.currentTrack.id === track.id ? '❚❚' : '▶';

    btn.appendChild(art);
    btn.appendChild(meta);
    btn.appendChild(badge);

    btn.addEventListener('click', () => {
      playSpotifyTrack(track, idx, tracks, true);
    });

    container.appendChild(btn);
  });
}

function renderSpotifyPlaylists(playlists) {
  const container = $('spotify-results');
  if (!container) return;
  $('spotify-collection-banner').hidden = true;

  if (!Array.isArray(playlists) || !playlists.length) {
    container.innerHTML = '<div class="sp-loading">No playlists available.</div>';
    return;
  }

  container.innerHTML = '';
  playlists.forEach(pl => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sp-track-card';

    const art = document.createElement('img');
    art.className = 'sp-track-art';
    art.src =
      pl.artwork ||
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="%230f291e"/><circle cx="40" cy="40" r="20" fill="%231ed760"/></svg>';
    art.alt = '';

    const meta = document.createElement('div');
    meta.className = 'sp-track-meta';
    const titleEl = document.createElement('strong');
    titleEl.textContent = pl.title || pl.name || 'Spotify Playlist';
    const subEl = document.createElement('small');
    subEl.textContent = pl.subtitle || 'Open Tracklist';
    meta.appendChild(titleEl);
    meta.appendChild(subEl);

    const badge = document.createElement('span');
    badge.className = 'sp-track-play-badge';
    badge.textContent = '💿';

    btn.appendChild(art);
    btn.appendChild(meta);
    btn.appendChild(badge);

    btn.addEventListener('click', () => {
      if (pl.isOAuthPlaylist && pl.id) {
        loadUserOAuthPlaylistTracks(pl.id, pl.title || pl.name);
      } else {
        loadSpotifyUrlOrSearch(pl.spotifyUrl || `spotify:playlist:${pl.id}`, false);
      }
    });

    container.appendChild(btn);
  });
}

async function loadOfficialSpotifyPlaylists() {
  const container = $('spotify-results');
  if (container && !spotifyState.officialPlaylists.length) {
    container.innerHTML = '<div class="sp-loading">Loading Spotify Playlists...</div>';
  }
  try {
    const res = await fetch('/api/visualizer/spotify');
    const data = await res.json();
    if (data?.clientId && !spotifyState.clientId) {
      spotifyState.clientId = data.clientId;
      if ($('sp-client-id-input')) $('sp-client-id-input').value = data.clientId;
    }
    spotifyState.officialPlaylists = Array.isArray(data?.playlists) ? data.playlists : [];
    if (spotifyState.tab === 'playlists') {
      renderSpotifyPlaylists(spotifyState.officialPlaylists);
    }
  } catch {
    if (container) {
      container.innerHTML = '<div class="sp-loading">Search any song, artist, or paste a Spotify URL above!</div>';
    }
  }
}

async function loadSpotifyUrlOrSearch(rawInput, autoPlayFirst = false) {
  const input = (rawInput || '').trim();
  if (!input) return;
  const container = $('spotify-results');
  if (container) {
    container.innerHTML = `<div class="sp-loading">Searching Spotify for "${input.slice(0, 40)}"...</div>`;
  }

  try {
    const isSpotifyLink =
      input.includes('spotify.com/') || /^spotify:(track|playlist|album|artist):/i.test(input);
    const param = isSpotifyLink
      ? `spotifyUrl=${encodeURIComponent(input)}`
      : `q=${encodeURIComponent(input)}`;

    const res = await fetch(`/api/visualizer/spotify?${param}`);
    const data = await res.json();

    if (data?.error) {
      renderSpotifyTracks([], data.error);
      return;
    }

    if (data.kind === 'playlist' || data.kind === 'album' || data.kind === 'artist') {
      spotifyState.activeCollection = data;
      $('spotify-collection-banner').hidden = false;
      $('sp-collection-title').textContent = data.title || 'Spotify Collection';
      $('sp-collection-sub').textContent = `${data.tracks?.length || 0} Tracks · Click any song to play`;
      renderSpotifyTracks(data.tracks || []);
      return;
    }

    $('spotify-collection-banner').hidden = true;
    selectSpotifyTab('search');
    const tracks = data.tracks || [];
    spotifyState.searchResults = tracks;
    renderSpotifyTracks(tracks, 'No matching tracks found. Try another artist or song title!');
    if ((data.kind === 'track' || autoPlayFirst) && tracks[0]) {
      playSpotifyTrack(tracks[0], 0, tracks, true);
    }
  } catch {
    renderSpotifyTracks([], 'Could not reach music service. Try again in a moment.');
  }
}

$('spotify-search-form')?.addEventListener('submit', e => {
  e.preventDefault();
  const q = $('spotify-search-input')?.value?.trim();
  if (q) loadSpotifyUrlOrSearch(q, false);
});

$('sp-back-btn')?.addEventListener('click', () => {
  $('spotify-collection-banner').hidden = true;
  if (spotifyState.tab === 'library' && spotifyState.userPlaylists.length) {
    renderSpotifyPlaylists(spotifyState.userPlaylists);
  } else {
    selectSpotifyTab('playlists');
    renderSpotifyPlaylists(spotifyState.officialPlaylists);
  }
});

$('sp-play-collection-embed')?.addEventListener('click', () => {
  const col = spotifyState.activeCollection;
  if (!col?.spotifyUri) return;
  setSpotifyEngine('embed');
  $('spotify-embed-dock').hidden = false;
  toggleSpotifyDrawer(false);
  if (spotifyState.embedController) {
    spotifyState.embedController.loadUri(col.spotifyUri);
    spotifyState.embedController.play();
    notify(`Loaded ${col.title} in Official Spotify Player below 🎧`);
  }
});

// Category Tabs in Spotify Drawer
document.querySelectorAll('.sp-tab').forEach(tabBtn => {
  tabBtn.addEventListener('click', () => {
    const tab = tabBtn.dataset.spTab || 'playlists';
    selectSpotifyTab(tab);
    $('spotify-collection-banner').hidden = true;

    if (tab === 'playlists') {
      if (spotifyState.officialPlaylists.length) {
        renderSpotifyPlaylists(spotifyState.officialPlaylists);
      } else {
        loadOfficialSpotifyPlaylists();
      }
    } else if (tab === 'search') {
      if (spotifyState.searchResults.length) {
        renderSpotifyTracks(spotifyState.searchResults);
      } else {
        renderSpotifyTracks([], 'Type any artist, song title, or Spotify URL in the search bar above.');
      }
    } else if (tab === 'library') {
      renderUserSpotifyLibraryTab();
    }
  });
});

// --- Spotify OAuth 2.0 PKCE Authentication & Personal Library ---
function getSpotifyRedirectUri() {
  return `${window.location.origin}/visualizer/index.html`;
}

if ($('sp-redirect-uri-code')) {
  $('sp-redirect-uri-code').textContent = getSpotifyRedirectUri();
}
if ($('sp-client-id-input') && spotifyState.clientId) {
  $('sp-client-id-input').value = spotifyState.clientId;
}

$('btn-copy-redirect')?.addEventListener('click', () => {
  navigator.clipboard?.writeText(getSpotifyRedirectUri());
  notify('Copied Redirect URI to clipboard! 📋');
});

$('btn-spotify-connect')?.addEventListener('click', e => {
  e.stopPropagation();
  if (authModal) authModal.hidden = false;
  if ($('btn-disconnect-spotify')) $('btn-disconnect-spotify').hidden = !isSpotifyTokenValid();
});

$('close-sp-modal')?.addEventListener('click', e => {
  e.stopPropagation();
  if (authModal) authModal.hidden = true;
});

authModal?.addEventListener('click', e => {
  if (e.target === authModal) {
    authModal.hidden = true;
  }
});

function isSpotifyTokenValid() {
  return Boolean(spotifyState.accessToken && Date.now() < spotifyState.tokenExpiry - 30000);
}

async function generatePkcePair() {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { verifier, challenge };
}

async function startSpotifyOAuth() {
  const inputId = $('sp-client-id-input')?.value?.trim() || spotifyState.clientId;
  if (!inputId) {
    notify('Please enter your Spotify Developer Client ID first.');
    return;
  }
  spotifyState.clientId = inputId;
  localStorage.setItem('sp_client_id', inputId);

  const { verifier, challenge } = await generatePkcePair();
  localStorage.setItem('sp_pkce_verifier', verifier);

  const scopes = [
    'user-read-private',
    'user-read-email',
    'user-library-read',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-top-read',
    'user-read-playback-state',
    'user-read-currently-playing',
    'streaming',
  ].join(' ');

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', inputId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', getSpotifyRedirectUri());
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('scope', scopes);

  window.location.href = authUrl.toString();
}

$('btn-start-oauth')?.addEventListener('click', startSpotifyOAuth);

$('btn-disconnect-spotify')?.addEventListener('click', () => {
  spotifyState.accessToken = '';
  spotifyState.tokenExpiry = 0;
  spotifyState.userProfile = null;
  localStorage.removeItem('sp_access_token');
  localStorage.removeItem('sp_token_expiry');
  updateSpotifyAuthBadge();
  if (authModal) authModal.hidden = true;
  notify('Disconnected Spotify account.');
});

async function handleSpotifyOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) {
    if (isSpotifyTokenValid()) {
      fetchSpotifyProfileAndLibrary();
    }
    return;
  }

  const verifier = localStorage.getItem('sp_pkce_verifier');
  const clientId = spotifyState.clientId || localStorage.getItem('sp_client_id');
  window.history.replaceState({}, document.title, window.location.pathname);

  if (!verifier || !clientId) return;

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: getSpotifyRedirectUri(),
      code_verifier: verifier,
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const tokenData = await res.json();
    if (tokenData?.access_token) {
      spotifyState.accessToken = tokenData.access_token;
      spotifyState.tokenExpiry = Date.now() + Number(tokenData.expires_in || 3600) * 1000;
      localStorage.setItem('sp_access_token', spotifyState.accessToken);
      localStorage.setItem('sp_token_expiry', String(spotifyState.tokenExpiry));
      toggleSpotifyDrawer(true);
      selectSpotifyTab('library');
      await fetchSpotifyProfileAndLibrary();
      notify('Spotify Account Connected! 🟢');
    } else {
      notify('Spotify authorization failed — check Client ID & Redirect URI.');
    }
  } catch {
    notify('Could not complete Spotify token exchange.');
  }
}

function updateSpotifyAuthBadge() {
  const btn = $('btn-spotify-connect');
  const status = $('sp-connection-status');
  if (!btn) return;
  if (isSpotifyTokenValid() && spotifyState.userProfile) {
    btn.textContent = `✓ ${spotifyState.userProfile.display_name || 'Connected'}`;
    btn.classList.add('connected');
    if (status) status.textContent = `CONNECTED AS ${String(spotifyState.userProfile.display_name || 'SPOTIFY USER').toUpperCase()}`;
  } else {
    btn.textContent = '🔐 Connect Account';
    btn.classList.remove('connected');
    if (status) status.textContent = 'SEARCH SONGS, PLAYLISTS, OR PASTE SPOTIFY LINK';
  }
}

async function fetchSpotifyWebApi(endpoint) {
  if (!isSpotifyTokenValid()) return null;
  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${spotifyState.accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchSpotifyProfileAndLibrary() {
  const [profile, saved, top, playlists] = await Promise.all([
    fetchSpotifyWebApi('/me'),
    fetchSpotifyWebApi('/me/tracks?limit=20'),
    fetchSpotifyWebApi('/me/top/tracks?limit=15'),
    fetchSpotifyWebApi('/me/playlists?limit=15'),
  ]);

  if (profile) {
    spotifyState.userProfile = profile;
    updateSpotifyAuthBadge();
  }

  const mapApiTrack = t => {
    if (!t?.id) return null;
    return {
      id: `spotify-${t.id}`,
      spotifyId: t.id,
      spotifyUri: t.uri || `spotify:track:${t.id}`,
      title: t.name || 'Track',
      artist: Array.isArray(t.artists) ? t.artists.map(a => a.name).join(', ') : '',
      album: t.album?.name || '',
      artwork: t.album?.images?.[0]?.url || '',
      durationMs: Number(t.duration_ms || 30000),
      previewUrl: t.preview_url || null,
      streamProxyUrl: t.preview_url ? `/api/visualizer/stream?url=${encodeURIComponent(t.preview_url)}` : null,
      externalUrl: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
    };
  };

  const likedTracks = (saved?.items || []).map(item => mapApiTrack(item.track)).filter(Boolean);
  const topTracks = (top?.items || []).map(mapApiTrack).filter(Boolean);
  spotifyState.userLibraryTracks = likedTracks.length ? likedTracks : topTracks;

  spotifyState.userPlaylists = (playlists?.items || []).map(pl => ({
    id: pl.id,
    title: pl.name,
    subtitle: `${pl.tracks?.total || 0} tracks · Personal Playlist`,
    artwork: pl.images?.[0]?.url || '',
    isOAuthPlaylist: true,
    spotifyUri: pl.uri,
  }));

  if (spotifyState.tab === 'library') {
    renderUserSpotifyLibraryTab();
  }
}

async function loadUserOAuthPlaylistTracks(playlistId, title) {
  const container = $('spotify-results');
  if (container) container.innerHTML = `<div class="sp-loading">Loading "${title}"...</div>`;
  const data = await fetchSpotifyWebApi(`/playlists/${playlistId}/tracks?limit=25`);
  const tracks = (data?.items || [])
    .map(item => {
      const t = item?.track;
      if (!t?.id) return null;
      return {
        id: `spotify-${t.id}`,
        spotifyId: t.id,
        spotifyUri: t.uri || `spotify:track:${t.id}`,
        title: t.name,
        artist: Array.isArray(t.artists) ? t.artists.map(a => a.name).join(', ') : '',
        album: t.album?.name || '',
        artwork: t.album?.images?.[0]?.url || '',
        durationMs: Number(t.duration_ms || 30000),
        previewUrl: t.preview_url || null,
        streamProxyUrl: t.preview_url ? `/api/visualizer/stream?url=${encodeURIComponent(t.preview_url)}` : null,
        externalUrl: `https://open.spotify.com/track/${t.id}`,
      };
    })
    .filter(Boolean);

  spotifyState.activeCollection = {
    title,
    spotifyUri: `spotify:playlist:${playlistId}`,
    tracks,
  };
  $('spotify-collection-banner').hidden = false;
  $('sp-collection-title').textContent = title;
  $('sp-collection-sub').textContent = `${tracks.length} Tracks`;
  renderSpotifyTracks(tracks, 'No tracks found in this playlist.');
}

function renderUserSpotifyLibraryTab() {
  const container = $('spotify-results');
  if (!container) return;
  if (!isSpotifyTokenValid()) {
    container.innerHTML = `
      <div class="sp-loading">
        <p style="margin-bottom:10px;">Connect your Spotify Account to browse your personal <b>Liked Songs</b> and <b>Playlists</b>—or search any song / paste any Spotify playlist link above!</p>
        <button type="button" id="sp-inline-connect" class="sp-oauth-go-btn" style="max-width:240px;">🔐 Connect Spotify Account</button>
      </div>
    `;
    $('sp-inline-connect')?.addEventListener('click', () => {
      if (authModal) authModal.hidden = false;
    });
    return;
  }

  if (spotifyState.userPlaylists.length) {
    renderSpotifyPlaylists(spotifyState.userPlaylists);
  } else if (spotifyState.userLibraryTracks.length) {
    renderSpotifyTracks(spotifyState.userLibraryTracks);
  } else {
    container.innerHTML = '<div class="sp-loading">Loading your Spotify Library...</div>';
    fetchSpotifyProfileAndLibrary();
  }
}

handleSpotifyOAuthCallback();

// --- UI Event Listeners & Interactive Controls ---
$('btn-system')?.addEventListener('click', startSystemAudio);
$('file-input')?.addEventListener('change', e => {
  if (e.target.files?.length) {
    loadLocalFiles(e.target.files);
  }
});

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
  if (e.dataTransfer?.files?.length) {
    loadLocalFiles(e.dataTransfer.files);
  }
});

// Transport bar controls
$('btn-prev-track')?.addEventListener('click', () => stepSpotifyQueue(-1));
$('btn-next-track')?.addEventListener('click', () => stepSpotifyQueue(1));

$('btn-play-pause')?.addEventListener('click', () => {
  if (state.sourceType === 'file' || state.sourceType === 'spotify') {
    if (audioEl.paused) {
      ensureAudioContext();
      audioEl.play();
      $('btn-play-pause').textContent = '⏸';
    } else {
      audioEl.pause();
      $('btn-play-pause').textContent = '▶';
    }
  } else if (state.sourceType === 'spotify-embed' && spotifyState.embedController) {
    spotifyState.embedController.togglePlay();
  }
});

$('seek-bar')?.addEventListener('input', e => {
  if ((state.sourceType === 'file' || state.sourceType === 'spotify') && Number.isFinite(audioEl.duration)) {
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
  if (state.sourceType === 'spotify' && spotifyState.currentQueue.length > 1) {
    stepSpotifyQueue(1);
  } else if (state.sourceType === 'file' && localFilesQueue.length > 1) {
    playLocalFileAt(localFileIndex + 1);
  } else {
    $('btn-play-pause').textContent = '▶';
  }
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

// Customization Sliders & Palettes
$('ctrl-gain')?.addEventListener('input', e => {
  state.gain = Number(e.target.value);
  $('val-gain').textContent = `${state.gain.toFixed(2)}×`;
});
$('ctrl-decay')?.addEventListener('input', e => {
  state.decay = Number(e.target.value);
  $('val-decay').textContent = `${Math.round(state.decay * 100)}%`;
});
$('ctrl-warp')?.addEventListener('input', e => {
  state.warp = Number(e.target.value);
  $('val-warp').textContent = `${state.warp.toFixed(2)}×`;
});
$('ctrl-sym')?.addEventListener('input', e => {
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
$('zen-btn')?.addEventListener('click', () => setZenMode(true));
$('exit-zen')?.addEventListener('click', () => setZenMode(false));

$('fullscreen-btn')?.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (authModal && !authModal.hidden) {
      authModal.hidden = true;
    } else if (spotifyDrawer && !spotifyDrawer.hidden) {
      toggleSpotifyDrawer(false);
    } else if (customDrawer && !customDrawer.hidden) {
      toggleCustomDrawer(false);
    } else if (document.body.classList.contains('zen-mode')) {
      setZenMode(false);
    }
  } else if (e.key === ' ' && !['INPUT', 'BUTTON', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    if (!$('transport-bar')?.hidden) {
      e.preventDefault();
      $('btn-play-pause')?.click();
    }
  }
});

// Interactive Pointer Physics on Canvas (also dismisses open drawers on background click)
function updatePointer(clientX, clientY) {
  const nx = clientX / Math.max(1, window.innerWidth);
  const ny = 1.0 - clientY / Math.max(1, window.innerHeight);
  state.pointerVx = (nx - state.pointerX) * 0.65;
  state.pointerVy = (ny - state.pointerY) * 0.65;
  state.pointerX = nx;
  state.pointerY = ny;
}

canvas.addEventListener('pointerdown', e => {
  if (spotifyDrawer && !spotifyDrawer.hidden) toggleSpotifyDrawer(false);
  if (customDrawer && !customDrawer.hidden) toggleCustomDrawer(false);
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

  state.pointerVx *= Math.exp(-dt * 10);
  state.pointerVy *= Math.exp(-dt * 10);

  $('meter-bass').style.width = `${Math.min(100, Math.round((state.subBass * 0.5 + state.bass * 0.5) * 85))}%`;
  $('meter-mid').style.width = `${Math.min(100, Math.round(state.mid * 85))}%`;
  $('meter-high').style.width = `${Math.min(100, Math.round(state.high * 90))}%`;
  $('bpm-readout').textContent =
    state.sourceType === 'idle' ? 'WAITING FOR AUDIO' : `~${state.bpmEstimate} BPM · LIVE DSP`;

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
