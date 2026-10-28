// SONIC PRISM — Modern WebGL Audio-Reactive Visualizer (WMP Alchemy / MilkDrop / Firestorm tribute)

const $ = id => document.getElementById(id);
const canvas = $('gl-canvas');
const audioEl = $('audio-el');

// --- State & Customization Parameters ---
const state = {
  mode: 0,          // 0..6 visual worlds
  palette: 0,       // 0..4 color palettes
  gain: 1.35,
  bassBoost: 1.35,
  vocalBoost: 1.45,
  trebleBoost: 1.35,
  decay: 0.94,
  warp: 1.2,
  symmetry: 1,
  sourceType: 'idle', // 'idle' | 'system' | 'file' | 'spotify' | 'spotify-embed'
  pointerX: 0.5,
  pointerY: 0.5,
  pointerVx: 0,
  pointerVy: 0,
  pointerDown: false,
  // 5-Stem Multi-Dimensional Audio Telemetry
  subBass: 0,       // 20-110 Hz (808 sub & kick body)
  bass: 0,          // 110-320 Hz (bassline & warm groove)
  vocal: 0,         // 320-2800 Hz (lead vocals, lyrics, solo melody)
  vocalPitch: 0.5,  // 0..1 spectral centroid within the vocal formant band
  mid: 0,           // 2800-6000 Hz (harmonics, synths, guitars, snare snap)
  high: 0,          // 6000-16000 Hz (hi-hats, cymbals, air, shimmer)
  kickImpulse: 0,   // Instantaneous sub/kick shockwave ring radius (0..1)
  trebleSpark: 0,   // High-frequency transient burst intensity
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
let silentTrackSourceNode = null; // Feeds decoded track buffer ONLY to analyser (NEVER to destination!)
let silentTrackBuffer = null;
let localFilesQueue = [];
let localFileIndex = 0;

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    waveData = new Uint8Array(analyser.frequencyBinCount);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function stopSilentTrackAnalyser() {
  if (silentTrackSourceNode) {
    try { silentTrackSourceNode.stop(); } catch {}
    try { silentTrackSourceNode.disconnect(); } catch {}
    silentTrackSourceNode = null;
  }
}

function startSilentTrackAnalyser(buffer) {
  stopSilentTrackAnalyser();
  if (!buffer) return;
  const ctx = ensureAudioContext();
  try {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    // CRITICAL: Connect ONLY to analyser (NEVER to audioCtx.destination!)
    // Gives real 60 FPS hardware 2048-bin FFT & phase-accurate waveforms with ZERO speaker output!
    src.connect(analyser);
    const offset = ((spotifyState.embedPositionMs || 0) * 0.001) % Math.max(1, buffer.duration);
    src.start(0, offset);
    silentTrackSourceNode = src;
  } catch {}
}

function stopCurrentSources(keepSpotify = false) {
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
  audioEl.removeAttribute('src');
  try { audioEl.load(); } catch {}

  if (!keepSpotify) {
    stopSilentTrackAnalyser();
    silentTrackBuffer = null;
    if (spotifyState.embedController && spotifyState.embedPlaying) {
      try { spotifyState.embedController.pause(); } catch {}
    }
    if (spotifyState.sdkPlayer && spotifyState.sdkPlaying) {
      try { spotifyState.sdkPlayer.pause(); } catch {}
    }
    spotifyState.embedPlaying = false;
    spotifyState.sdkPlaying = false;
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
  const showScrubber =
    type === 'file' ||
    (isSpotify && (spotifyState.activePlayer === 'sdk' || spotifyState.embedDurationMs > 0));
  $('seek-bar').hidden = !showScrubber;
  $('track-time').hidden = !showScrubber;

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
    notify('Select a Browser Tab (Pandora, YouTube, Apple Music) or Screen and check "Also share audio" 🔊', 5000);
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

    // Keep Spotify playing if the user is sharing the visualizer tab itself;
    // analyser is NEVER connected to audioCtx.destination so it will never double-play or echo!
    const keepSpotifyRunning = spotifyState.embedPlaying || spotifyState.sdkPlaying;
    stopCurrentSources(keepSpotifyRunning);
    ensureAudioContext();
    activeStream = stream;
    const audioOnlyStream = new MediaStream(audioTracks);
    streamSourceNode = audioCtx.createMediaStreamSource(audioOnlyStream);
    // Connect ONLY to analyser (silent FFT sink — never connected to destination/speakers!)
    streamSourceNode.connect(analyser);

    const label = audioTracks[0].label || 'Tab / Window Audio';
    setActiveSourceUI('system', `LIVE AUDIO · ${label.toUpperCase().slice(0, 32)}`);
    notify(`Connected to ${label}! Visualizing live audio 🌈`);

    stream.getTracks().forEach(track => {
      track.addEventListener('ended', () => {
        if (state.sourceType === 'system') {
          stopCurrentSources(true);
          if (spotifyState.embedPlaying || spotifyState.sdkPlaying) {
            const title = spotifyState.currentTrack?.title || 'Spotify Player';
            setActiveSourceUI('spotify-embed', `SPOTIFY · ${title.toUpperCase().slice(0, 28)}`);
          } else {
            setActiveSourceUI('idle', 'AUDIO SHARE ENDED · SELECT SOURCE');
          }
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

  stopCurrentSources(false);
  if ($('spotify-embed-dock')) $('spotify-embed-dock').hidden = true;
  ensureAudioContext();

  const url = URL.createObjectURL(file);
  audioEl.src = url;
  audioEl.load();

  if (!mediaElementSourceNode) {
    mediaElementSourceNode = audioCtx.createMediaElementSource(audioEl);
    // Connect mediaElementSourceNode to analyser AND separately to destination.
    // Never connect analyser to destination so shared tab streams never output to speakers!
    mediaElementSourceNode.connect(analyser);
    mediaElementSourceNode.connect(audioCtx.destination);
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

// 3. Full-Track In-App Spotify Player (Web Playback SDK + Official Embed + Silent Spectral Fingerprint)
const bootQueryParams = new URLSearchParams(window.location.search);
const bootEnvClientId = (bootQueryParams.get('envClientId') || '').trim();
const bootEnvRedirectUri = (bootQueryParams.get('envRedirectUri') || '').trim();

const spotifyState = {
  activePlayer: 'embed', // 'sdk' (Web Playback SDK Full Track) | 'embed' (Official Spotify Full-Track Embed)
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
  sdkPlaying: false,
  embedPositionMs: 0,
  embedDurationMs: 0,
  trackSeed: 1.0,
  trackSignature: null, // Decoded silent spectral envelope { bassCurve, midCurve, highCurve, energy, bpm }
  envClientId: bootEnvClientId,
  envRedirectUri: bootEnvRedirectUri,
  clientId: bootEnvClientId || localStorage.getItem('sp_client_id') || '',
  redirectUri: bootEnvRedirectUri || localStorage.getItem('sp_redirect_uri') || '',
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
        // Ignore embed updates if the Web Playback SDK is currently the active player
        if (spotifyState.activePlayer === 'sdk' && spotifyState.sdkPlaying) {
          if (!data.isPaused) {
            try { controller.pause(); } catch {}
          }
          return;
        }
        const wasPlaying = spotifyState.embedPlaying;
        spotifyState.embedPlaying = !data.isPaused;
        spotifyState.embedPositionMs = Number(data.position || 0);
        spotifyState.embedDurationMs = Number(data.duration || 0);

        if (spotifyState.embedDurationMs > 0) {
          $('seek-bar').hidden = false;
          $('track-time').hidden = false;
          $('seek-bar').value = String(
            Math.min(100, (spotifyState.embedPositionMs / spotifyState.embedDurationMs) * 100)
          );
          $('track-time').textContent = `${formatTime(spotifyState.embedPositionMs * 0.001)} / ${formatTime(
            spotifyState.embedDurationMs * 0.001
          )}`;
        }

        if (spotifyState.embedPlaying && !wasPlaying) {
          spotifyState.activePlayer = 'embed';
          if (spotifyState.sdkPlayer && spotifyState.sdkPlaying) {
            try { spotifyState.sdkPlayer.pause(); } catch {}
            spotifyState.sdkPlaying = false;
          }
          if (state.sourceType !== 'system') {
            stopCurrentSources(true);
            const title = spotifyState.currentTrack?.title || 'Spotify Player';
            setActiveSourceUI('spotify-embed', `SPOTIFY · ${title.toUpperCase().slice(0, 28)}`);
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
  return 112 + (hash % 28);
}

// Fast in-place 1024-point Radix-2 FFT to extract real 512-bin frequency spectra from decoded PCM audio in memory
const FFT_N = 1024;
const fftRe = new Float32Array(FFT_N);
const fftIm = new Float32Array(FFT_N);
const fftWin = new Float32Array(FFT_N);
for (let i = 0; i < FFT_N; i++) {
  fftWin[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_N - 1)));
}

function computePcmFftFrame(channelData, startIdx, outFreq512, outWave512) {
  const maxLen = channelData.length;
  for (let i = 0; i < FFT_N; i++) {
    const s = startIdx + i < maxLen ? channelData[startIdx + i] : 0;
    fftRe[i] = s * fftWin[i];
    fftIm[i] = 0;
    if (i < 512) {
      outWave512[i] = Math.max(0, Math.min(255, Math.round(128 + s * 120)));
    }
  }

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < FFT_N; i++) {
    if (i < j) {
      const tr = fftRe[i];
      fftRe[i] = fftRe[j];
      fftRe[j] = tr;
    }
    let m = FFT_N >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  // Cooley-Tukey butterflies
  for (let len = 2; len <= FFT_N; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wCos = Math.cos(ang);
    const wSin = Math.sin(ang);
    for (let i = 0; i < FFT_N; i += len) {
      let uRe = 1;
      let uIm = 0;
      for (let k = 0; k < half; k++) {
        const evenIdx = i + k;
        const oddIdx = evenIdx + half;
        const tRe = uRe * fftRe[oddIdx] - uIm * fftIm[oddIdx];
        const tIm = uRe * fftIm[oddIdx] + uIm * fftRe[oddIdx];
        fftRe[oddIdx] = fftRe[evenIdx] - tRe;
        fftIm[oddIdx] = fftIm[evenIdx] - tIm;
        fftRe[evenIdx] += tRe;
        fftIm[evenIdx] += tIm;
        const nextURe = uRe * wCos - uIm * wSin;
        uIm = uRe * wSin + uIm * wCos;
        uRe = nextURe;
      }
    }
  }

  // Convert magnitudes to dB-scaled 0..255 byte bins matching WebAudio AnalyserNode
  for (let i = 0; i < 512; i++) {
    const mag = Math.hypot(fftRe[i], fftIm[i]) / (FFT_N * 0.25);
    const db = 20 * Math.log10(mag + 1e-6);
    const norm = Math.max(0, Math.min(1, (db + 68) / 58));
    outFreq512[i] = Math.round(norm * 255);
  }
}

// Silently analyzes the track's real PCM audio in memory (NEVER connected to speakers!)
// so the visualizer renders real 512-bin FFT spectra and real waveforms during full-track Spotify playback.
async function analyzeTrackSignatureInBackground(track) {
  if (!track) return;
  spotifyState.trackSignature = null;

  // 1. If logged in to Spotify OAuth, check audio-features for exact BPM & energy
  if (track.spotifyId && isSpotifyTokenValid()) {
    fetchSpotifyWebApi(`/audio-features/${track.spotifyId}`)
      .then(feat => {
        if (feat?.tempo) {
          state.bpmEstimate = Math.round(feat.tempo);
        }
        if (feat && spotifyState.currentTrack?.id === track.id) {
          spotifyState.trackSignature = {
            ...(spotifyState.trackSignature || {}),
            energy: Number(feat.energy || 0.78),
            danceability: Number(feat.danceability || 0.72),
            valence: Number(feat.valence || 0.6),
          };
        }
      })
      .catch(() => {});
  }

  // 2. Decode sample buffer silently in memory (no AudioNode / no speaker output) to extract real 512-bin FFT & waveform frames
  try {
    let streamUrl = track.streamProxyUrl;
    if (!streamUrl && track.title) {
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
        streamUrl = data.track.streamProxyUrl;
        track.streamProxyUrl = streamUrl;
        if (!track.artwork && data.track.artwork) {
          track.artwork = data.track.artwork;
          updateTransportMetadata(track);
        }
      }
    }
    if (!streamUrl || spotifyState.currentTrack?.id !== track.id) return;

    const audioRes = await fetch(streamUrl);
    if (!audioRes.ok) return;
    const arrayBuf = await audioRes.arrayBuffer();
    const ctx = ensureAudioContext();
    const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
    if (spotifyState.currentTrack?.id !== track.id) return;

    const ch = decoded.getChannelData(0);
    const slices = 240;
    const step = Math.max(1, Math.floor(Math.max(1, ch.length - FFT_N) / slices));
    const fftFrames = new Uint8Array(slices * 512);
    const waveFrames = new Uint8Array(slices * 512);
    const tempFreq = new Uint8Array(512);
    const tempWave = new Uint8Array(512);

    let peakOnsets = 0;
    let prevLow = 0;
    for (let s = 0; s < slices; s++) {
      computePcmFftFrame(ch, s * step, tempFreq, tempWave);
      fftFrames.set(tempFreq, s * 512);
      waveFrames.set(tempWave, s * 512);

      let lowSum = 0;
      for (let b = 1; b <= 16; b++) lowSum += tempFreq[b];
      const normLow = lowSum / (16 * 255);
      if (normLow > prevLow * 1.22 && normLow > 0.35) peakOnsets++;
      prevLow = normLow;
    }

    const durSec = Math.max(10, decoded.duration);
    const estimatedBpm = Math.max(88, Math.min(168, Math.round((peakOnsets / durSec) * 60 * 1.6)));
    if (!spotifyState.trackSignature?.energy) {
      state.bpmEstimate = estimatedBpm;
    }

    silentTrackBuffer = decoded;
    const hasLiveStream = Boolean(
      activeStream && activeStream.getAudioTracks().some(t => t.readyState === 'live')
    );
    if (
      !hasLiveStream &&
      state.sourceType !== 'file' &&
      (spotifyState.embedPlaying || spotifyState.sdkPlaying)
    ) {
      startSilentTrackAnalyser(decoded);
    }

    spotifyState.trackSignature = {
      ...(spotifyState.trackSignature || {}),
      fftFrames,
      waveFrames,
      slices,
      sampleDurationSec: durSec,
    };
  } catch {}
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

  // Analyze track spectral signature silently in the background (zero audio output)
  analyzeTrackSignatureInBackground(track);

  // If track was from a text search without a Spotify URI yet, resolve its Spotify ID/URI first
  if (!track.spotifyUri && !track.spotifyId && track.title) {
    try {
      const q = new URLSearchParams({
        resolveTrack: '1',
        title: track.title,
        artist: track.artist || '',
      });
      const res = await fetch(`/api/visualizer/spotify?${q.toString()}`);
      const data = await res.json();
      if (data?.track?.spotifyId) {
        track.spotifyId = data.track.spotifyId;
        track.spotifyUri = `spotify:track:${data.track.spotifyId}`;
      }
    } catch {}
  }

  const uri = track.spotifyUri || (track.spotifyId ? `spotify:track:${track.spotifyId}` : '');

  // 1. Primary Full-Track Playback: Spotify Web Playback SDK (when logged in & SDK device ready)
  if (uri && isSpotifyTokenValid() && spotifyState.sdkDeviceId) {
    try {
      // Ensure Embed widget & local audio are stopped so only the SDK plays
      if (spotifyState.embedController && spotifyState.embedPlaying) {
        try { spotifyState.embedController.pause(); } catch {}
      }
      if ($('spotify-embed-dock')) $('spotify-embed-dock').hidden = true;
      if (!audioEl.paused) audioEl.pause();

      const queueUris = spotifyState.currentQueue
        .map(t => t.spotifyUri || (t.spotifyId ? `spotify:track:${t.spotifyId}` : ''))
        .filter(u => u.startsWith('spotify:track:'));

      const playBody =
        queueUris.length > 1 && queueUris.includes(uri)
          ? { uris: queueUris.slice(0, 60), offset: { uri } }
          : { uris: [uri] };

      const sdkRes = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(spotifyState.sdkDeviceId)}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${spotifyState.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(playBody),
        }
      );

      if (sdkRes.ok || sdkRes.status === 204 || sdkRes.status === 202) {
        spotifyState.activePlayer = 'sdk';
        spotifyState.sdkPlaying = true;
        spotifyState.embedPlaying = true;
        spotifyState.embedPositionMs = 0;
        spotifyState.embedDurationMs = track.durationMs || 210000;
        if (state.sourceType !== 'system') {
          setActiveSourceUI('spotify-embed', `SPOTIFY · ${track.title.toUpperCase().slice(0, 28)}`);
        }
        if (autoCloseDrawer) toggleSpotifyDrawer(false);
        $('btn-play-pause').textContent = '⏸';
        notify(`Playing full track "${track.title}" — ${track.artist} 🟢`);
        return;
      }
    } catch {}
  }

  // 2. Fallback Full-Track Playback: Official Spotify Embed Player
  if (uri) {
    if (spotifyState.sdkPlayer && spotifyState.sdkPlaying) {
      try { spotifyState.sdkPlayer.pause(); } catch {}
      spotifyState.sdkPlaying = false;
    }
    if (!audioEl.paused) audioEl.pause();

    spotifyState.activePlayer = 'embed';
    $('spotify-embed-dock').hidden = false;
    if (state.sourceType !== 'system') {
      setActiveSourceUI('spotify-embed', `SPOTIFY PLAYER · ${track.title.toUpperCase().slice(0, 28)}`);
    }
    if (autoCloseDrawer) toggleSpotifyDrawer(false);
    if (spotifyState.embedController) {
      spotifyState.embedController.loadUri(uri);
      spotifyState.embedController.play();
      spotifyState.embedPlaying = true;
      spotifyState.embedPositionMs = 0;
      spotifyState.embedDurationMs = track.durationMs || 210000;
      $('btn-play-pause').textContent = '⏸';
      notify(`Playing "${track.title}" in Spotify Player 🎧`);
    } else {
      notify('Spotify Player ready below — press Play in the widget!');
    }
    return;
  }

  notify('Select a Spotify playlist or log in with Spotify to play full tracks!');
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

// --- Real-Time 5-Dimension Audio Stem Analysis & Beat Detection ---
let prevHighRaw = 0;

function updateAudioAnalysis(timeSec, dt) {
  const hasLiveStream = Boolean(
    activeStream && activeStream.getAudioTracks().some(t => t.readyState === 'live')
  );
  const isSpotifyActive =
    (state.sourceType === 'spotify-embed' || state.sourceType === 'spotify') &&
    (spotifyState.embedPlaying || spotifyState.sdkPlaying);

  // Manage silent hardware AudioBufferSourceNode for Spotify when no live tab stream is active
  if (isSpotifyActive && !hasLiveStream && silentTrackBuffer && !silentTrackSourceNode) {
    startSilentTrackAnalyser(silentTrackBuffer);
  } else if ((!isSpotifyActive || hasLiveStream || state.sourceType === 'file') && silentTrackSourceNode) {
    stopSilentTrackAnalyser();
  }

  const hasDirectAudio =
    analyser &&
    (hasLiveStream ||
      (state.sourceType === 'file' && !audioEl.paused) ||
      Boolean(isSpotifyActive && silentTrackSourceNode));

  if (isSpotifyActive) {
    // Advance Spotify timeline scrubber smoothly between SDK / Embed updates
    spotifyState.embedPositionMs += dt * 1000;
    if (spotifyState.embedDurationMs > 0) {
      const pct = Math.min(100, (spotifyState.embedPositionMs / spotifyState.embedDurationMs) * 100);
      if ($('seek-bar') && document.activeElement !== $('seek-bar')) {
        $('seek-bar').value = String(pct);
      }
      if ($('track-time')) {
        $('track-time').textContent = `${formatTime(spotifyState.embedPositionMs * 0.001)} / ${formatTime(
          spotifyState.embedDurationMs * 0.001
        )}`;
      }
    }
  }

  if (hasDirectAudio) {
    // Real 60 FPS 2048-bin hardware FFT + phase-coherent time-domain waveform
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(waveData);
  } else if (isSpotifyActive) {
    // Dynamic multi-stem synthesis while track audio buffer is still decoding
    const bpm = state.bpmEstimate || 122;
    const posSec = (spotifyState.embedPositionMs || timeSec * 1000) * 0.001;
    const beatPos = posSec * (bpm / 60);
    const beatFrac = beatPos - Math.floor(beatPos);
    const kickEnv = Math.pow(Math.max(0, 1.0 - beatFrac * 2.5), 2.1);
    const snareEnv = Math.floor(beatPos) % 2 === 1 ? Math.pow(Math.max(0, 1.0 - beatFrac * 2.9), 1.8) : 0;
    const vocalEnv = 0.55 + 0.45 * Math.sin(posSec * 2.4) * Math.cos(posSec * 1.1);
    const vocalCenter = 0.14 + 0.08 * Math.sin(posSec * 1.7);
    const hatEnv = Math.pow(Math.max(0, 1.0 - ((beatPos * 2) % 1) * 3.0), 1.9);

    for (let i = 0; i < 512; i++) {
      const f = i / 512;
      const sub = Math.exp(-f * 16.0) * kickEnv * 245;
      const bass = Math.exp(-Math.pow((f - 0.05) * 22.0, 2.0)) * (120 + kickEnv * 110);
      const vocal =
        Math.exp(-Math.pow((f - vocalCenter) * 11.0, 2.0)) * (95 * vocalEnv + snareEnv * 125);
      const highs = Math.pow(f, 0.65) * (hatEnv * 145 + snareEnv * 65);
      freqData[i] = Math.max(0, Math.min(255, Math.round(sub + bass + vocal + highs)));

      const w =
        128 +
        Math.sin(i * 0.045 + timeSec * 18.0) * (kickEnv * 68 + 18) +
        Math.sin(i * 0.19 - timeSec * 29.0) * (vocalEnv * 38 + snareEnv * 32) +
        Math.cos(i * 0.65 + timeSec * 47.0) * (hatEnv * 24);
      waveData[i] = Math.max(0, Math.min(255, Math.round(w)));
    }
  } else {
    // Calm decay to rest when no music is playing
    for (let i = 0; i < 512; i++) {
      freqData[i] = Math.floor(freqData[i] * 0.86);
      waveData[i] = Math.round(128 + (waveData[i] - 128) * 0.84);
    }
  }

  const g = state.gain;
  // 5-Stem Frequency Decomposition (48kHz / 2048 FFT -> ~23.4 Hz per bin):
  // 1. Sub-Bass & Kick: bins 1..5 (~23-117 Hz)
  // 2. Bass Groove: bins 6..15 (~140-350 Hz)
  // 3. Lead Vocals / Formant: bins 16..115 (~375-2,700 Hz) + Vocal Pitch Centroid
  // 4. Synth / Upper Mids: bins 116..240 (~2,700-5,600 Hz)
  // 5. Treble / Air / Sparkle: bins 241..440 (~5,600-10,300+ Hz)
  let subSum = 0;
  let bassSum = 0;
  let vocalSum = 0;
  let vocalWeightedSum = 0;
  let midSum = 0;
  let highSum = 0;

  for (let i = 1; i <= 5; i++) subSum += freqData[i];
  for (let i = 6; i <= 15; i++) bassSum += freqData[i];
  for (let i = 16; i <= 115; i++) {
    const val = freqData[i];
    vocalSum += val;
    vocalWeightedSum += val * ((i - 16) / 99);
  }
  for (let i = 116; i <= 240; i++) midSum += freqData[i];
  for (let i = 241; i <= 440; i++) highSum += freqData[i];

  const rawSub = Math.min(2.2, (subSum / (5 * 255)) * g * state.bassBoost);
  const rawBass = Math.min(2.2, (bassSum / (10 * 255)) * g * state.bassBoost);
  const rawVocal = Math.min(2.2, (vocalSum / (100 * 255)) * g * state.vocalBoost * 1.18);
  const rawVocalPitch = vocalSum > 200 ? vocalWeightedSum / vocalSum : 0.45;
  const rawMid = Math.min(2.2, (midSum / (125 * 255)) * g * 1.25);
  const rawHigh = Math.min(2.2, (highSum / (200 * 255)) * g * state.trebleBoost * 1.55);

  const fastAttack = 1 - Math.exp(-dt * 26);
  const smoothRelease = 1 - Math.exp(-dt * 14);
  state.subBass += (rawSub - state.subBass) * (rawSub > state.subBass ? fastAttack : smoothRelease);
  state.bass += (rawBass - state.bass) * (rawBass > state.bass ? fastAttack : smoothRelease);
  state.vocal += (rawVocal - state.vocal) * (rawVocal > state.vocal ? fastAttack : smoothRelease);
  state.vocalPitch += (rawVocalPitch - state.vocalPitch) * (1 - Math.exp(-dt * 10));
  state.mid += (rawMid - state.mid) * (rawMid > state.mid ? fastAttack : smoothRelease);
  state.high += (rawHigh - state.high) * (rawHigh > state.high ? fastAttack : smoothRelease);

  // Treble transient spark detection (hi-hats, cymbals, vocal sibilance)
  const highDelta = Math.max(0, rawHigh - prevHighRaw);
  prevHighRaw = rawHigh;
  if (highDelta > 0.12) {
    state.trebleSpark = Math.min(1.6, state.trebleSpark + highDelta * 2.8);
  } else {
    state.trebleSpark *= Math.exp(-dt * 9.5);
  }

  // Adaptive Kick / Transient Beat Detection & Expanding Shockwave Ring
  const lowEnergy = rawSub * 0.68 + rawBass * 0.32;
  let avgEnergy = 0;
  for (let i = 0; i < state.energyHistory.length; i++) avgEnergy += state.energyHistory[i];
  avgEnergy /= state.energyHistory.length;
  state.energyHistory[state.energyIdx] = lowEnergy;
  state.energyIdx = (state.energyIdx + 1) % state.energyHistory.length;

  const nowMs = performance.now();
  if (lowEnergy > Math.max(0.20, avgEnergy * 1.26) && nowMs - state.lastBeatTime > 195) {
    const interval = nowMs - state.lastBeatTime;
    if (interval > 250 && interval < 1200) {
      const instantBpm = Math.round(60000 / interval);
      state.bpmEstimate = Math.round(state.bpmEstimate * 0.8 + instantBpm * 0.2);
    }
    state.lastBeatTime = nowMs;
    state.beatPulse = Math.min(1.6, 0.9 + lowEnergy * 0.55);
    state.kickImpulse = 0.02; // Launch a new radial sub-kick shockwave from center!
    state.beatPhase += 0.82;
  } else {
    state.beatPulse *= Math.exp(-dt * 7.5);
  }

  if (state.kickImpulse > 0.001 && state.kickImpulse < 1.2) {
    state.kickImpulse += dt * (1.35 + state.subBass * 0.65);
    if (state.kickImpulse >= 1.2) state.kickImpulse = 0;
  }

  // Pack 512x2 GPU texture (Row 0: Spectrum with stem boost, Row 1: Oscilloscope Waveform)
  for (let i = 0; i < 512; i++) {
    let binBoost = g;
    if (i <= 15) binBoost *= state.bassBoost;
    else if (i <= 115) binBoost *= state.vocalBoost;
    else if (i >= 200) binBoost *= state.trebleBoost;
    audioTexData[i] = Math.min(255, Math.round(freqData[i] * binBoost));
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

// Pass 1: Fluid Feedback Advection + Multi-Stem Injection (Sub/Kick, Bass, Vocal Formant, Synth Mids, Treble Sparkle)
const FEEDBACK_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPrevTex;
uniform sampler2D uAudioTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uSubBass;
uniform float uBass;
uniform float uVocal;
uniform float uVocalPitch;
uniform float uMid;
uniform float uHigh;
uniform float uKick;
uniform float uTrebleSpark;
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

  float rad = length(p);
  float ang = atan(p.y, p.x);

  // Interactive pointer gravity & ripple warp
  vec2 ptr = (uPointer - 0.5) * aspect;
  vec2 toPtr = p - ptr;
  float ptrDist = length(toPtr) + 0.001;
  float ptrForce = exp(-ptrDist * 4.5) * (0.018 + 0.035 * uPointerDown + length(uPointerVel) * 0.25);

  // Sub-Bass Kick Shockwave radial lens refraction
  float shockDist = abs(rad - uKick * 0.85);
  float shockWave = (uKick > 0.01 && uKick < 1.15) ? exp(-shockDist * 28.0) * (1.0 - uKick * 0.8) * uSubBass * 0.024 : 0.0;
  vec2 shockDir = normalize(p + 1e-5) * shockWave;

  // MilkDrop / Alchemy curl-like zoom & rotation warp driven by SubBass, Bass & Vocal
  float zoom = 1.0 - (0.008 + uBass * 0.025 + uSubBass * 0.018 + uBeat * 0.018) * uWarp;
  float angle = (0.004 + (uMid - 0.25) * 0.018 + uVocal * 0.012) * uWarp * sin(uTime * 0.45 + rad * 3.2);
  vec2 warped = (vUv - 0.5) * rot(angle) * zoom;

  // Fluid wave displacement
  vec2 swirl = vec2(
    sin(p.y * 5.5 + uTime * 1.6 + uBass * 3.2),
    cos(p.x * 5.5 - uTime * 1.4 + uVocal * 3.0)
  ) * 0.0042 * uWarp;

  vec2 sampleUv = clamp(0.5 + warped + swirl - shockDir - normalize(toPtr) * ptrForce + uPointerVel * exp(-ptrDist * 3.5) * 0.04, 0.002, 0.998);
  vec3 prev = texture2D(uPrevTex, sampleUv).rgb;

  // Slight hue shift inside feedback loop driven by Treble & Vocals
  prev = mix(prev, prev.gbr, 0.012 + uHigh * 0.025 + uVocal * 0.012);

  // Sample live Time-Domain Waveform (row y = 0.75) & FFT Spectrum (row y = 0.25)
  float waveX = clamp(vUv.x, 0.01, 0.99);
  float waveSample = (texture2D(uAudioTex, vec2(waveX, 0.75)).r - 0.5) * 2.0;
  float waveSample2 = (texture2D(uAudioTex, vec2(1.0 - waveX, 0.75)).r - 0.5) * 2.0;

  float fftU = clamp(abs(ang) / 3.14159265, 0.01, 0.99);
  float fftVal = texture2D(uAudioTex, vec2(fftU * 0.65, 0.25)).r;
  // Dedicated Vocal Formant sample from bins 16..115 (u ~ 0.03..0.22)
  float vocalFft = texture2D(uAudioTex, vec2(clamp(0.03 + waveX * 0.19, 0.03, 0.22), 0.25)).r;

  vec3 seed = vec3(0.0);

  if (uMode == 0) {
    // MODE 0: ALCHEMY PLASMA —
    // Layer 1 (Bass & Waveform): Twin intertwined stereo oscilloscope ribbons
    // Layer 2 (Vocals): Singing Formant Ribbon tracking uVocalPitch in magenta/gold
    // Layer 3 (Sub-Bass Kick): Expanding radial shockwave ring
    // Layer 4 (Treble): Outer electric starlight sparks
    float energyGate = clamp((uSubBass + uBass + uVocal + uHigh) * 1.25, 0.0, 1.0);
    float y1 = waveSample * (0.36 + uBass * 0.28);
    float y2 = -waveSample2 * (0.30 + uMid * 0.24);
    float glow1 = (0.0048 / (abs(p.y - y1) + 0.0038)) * energyGate;
    float glow2 = (0.0042 / (abs(p.y - y2) + 0.0038)) * energyGate;

    // Vocal Formant Singing Wave (shifts vertically with singer's pitch centroid uVocalPitch!)
    float vocalPitchOffset = (uVocalPitch - 0.45) * 0.38;
    float yVocal = vocalPitchOffset + (vocalFft - 0.35) * 0.28 * sin(waveX * 9.42 + uTime * 3.2);
    float vocalGlow = (0.0045 / (abs(p.y - yVocal) + 0.0045)) * smoothstep(0.10, 0.45, uVocal);

    // Expanding Sub-Kick Shockwave Ring (only visible when a kick transient fires!)
    float kickRingGlow = (uKick > 0.01 && uKick < 1.1)
      ? (0.0045 / (shockDist + 0.005)) * (1.0 - uKick * 0.82) * (0.5 + uSubBass)
      : 0.0;

    vec3 c1 = palette(vUv.x + uTime * 0.12 + uPhase * 0.1, uPalette);
    vec3 c2 = palette(vUv.x + 0.45 - uTime * 0.1, uPalette);
    vec3 cVocal = palette(0.32 + uVocalPitch * 0.4 + uTime * 0.08, uPalette);

    seed += c1 * glow1 * (0.65 + uBass * 0.85);
    seed += c2 * glow2 * (0.55 + uMid * 0.75);
    seed += cVocal * vocalGlow * (0.75 + uVocal * 0.95);
    seed += palette(0.05 + uPhase * 0.15, uPalette) * kickRingGlow * 1.25;
    seed += palette(fftU + uTime * 0.18, uPalette) * fftVal * exp(-rad * 2.8) * (0.4 + uBeat * 0.65);
  } else if (uMode == 1) {
    // MODE 1: FIRESTORM BARS — Upward ember smoke + Vocal Formant aura plumes
    prev = texture2D(uPrevTex, clamp(vUv - vec2(0.0, (0.0045 + uVocal * 0.003) * uWarp), 0.002, 0.998)).rgb * 0.78;
    float barFft = texture2D(uAudioTex, vec2(clamp(vUv.x * 0.75, 0.01, 0.99), 0.25)).r;
    float waveLine = -0.18 + barFft * 0.56;
    float dWave = abs(p.y - waveLine);
    seed += palette(vUv.x * 0.6 + barFft * 0.5, uPalette) * (0.0035 / (dWave + 0.005)) * barFft;
  } else if (uMode == 2) {
    // MODE 2: FERRO-ORB 3D — Solar flare corona + Vocal harmonic halo + Sub shockwave
    float coronaR = 0.27 + fftVal * 0.17 + uBass * 0.10;
    float dCorona = abs(rad - coronaR);
    seed += palette(ang * 0.159 + uTime * 0.15, uPalette) * (0.0045 / (dCorona + 0.005)) * (0.6 + uBass + uVocal * 0.5);
  } else if (uMode == 3) {
    // MODE 3: STARFIELD TUNNEL — Radial warp streaks + Vocal Nebula clouds
    vec2 dir = normalize(p + 1e-5);
    prev = texture2D(uPrevTex, clamp(vUv - dir * (0.012 + uBass * 0.028 + uSubBass * 0.015) * uWarp, 0.002, 0.998)).rgb * 0.88;
    vec2 boxP = abs(p * rot(uTime * 0.35 + rad * 2.5));
    float polyR = max(boxP.x, boxP.y);
    float ringPattern = abs(fract(polyR * 5.0 - uTime * (1.4 + uBass * 1.9)) - 0.5);
    float gateGlow = 0.009 / (ringPattern + 0.012) * smoothstep(0.03, 0.22, rad);
    seed += palette(polyR + uTime * 0.15 + uBeat * 0.2, uPalette) * gateGlow * (0.25 + fftVal * 0.95);
    // Vocal Nebula Aurora cloud inside the tunnel
    float vocalNebula = sin(ang * 3.0 + uTime * 1.8) * cos(rad * 8.0 - uVocalPitch * 4.0);
    seed += palette(0.38 + uVocalPitch * 0.3, uPalette) * max(0.0, vocalNebula) * uVocal * exp(-rad * 2.2) * 0.38;
  } else {
    // Modes 4, 5, 6 use crisp procedural geometry in Pass 2 with minimal background trail
    prev *= 0.65;
  }

  // Interactive pointer spark injection ONLY when pointer is actively moving or pressed
  float ptrActive = clamp(uPointerDown + length(uPointerVel) * 18.0, 0.0, 1.0);
  float ptrGlow = (0.005 * ptrActive) / (ptrDist + 0.008);
  seed += palette(uTime * 0.3, uPalette) * ptrGlow * 0.45;

  vec3 outCol = prev * uDecay + seed * 0.36;
  gl_FragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
}
`;

// Pass 2: 7 Distinct Visual Worlds with 5-Stem Multi-Dimensional Highlights (Sub/Kick, Bass, Vocals, Mids, Treble)
const COMPOSITE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uFeedbackTex;
uniform sampler2D uAudioTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uSubBass;
uniform float uBass;
uniform float uVocal;
uniform float uVocalPitch;
uniform float uMid;
uniform float uHigh;
uniform float uKick;
uniform float uTrebleSpark;
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

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  vec3 a = fract(p.xyx * vec3(123.34, 234.34, 345.65));
  a += dot(a, a + 34.45);
  return fract(vec2(a.x * a.y, a.y * a.z));
}

void main() {
  vec2 aspect = vec2(uRes.x / max(1.0, uRes.y), 1.0);
  vec2 p = (vUv - 0.5) * aspect;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // Beat & Sub-Kick reactive chromatic dispersion on feedback texture
  vec2 caOffset = (vUv - 0.5) * (0.0018 + uBeat * 0.0065 + uSubBass * 0.005);
  vec3 fb;
  fb.r = texture2D(uFeedbackTex, vUv + caOffset).r;
  fb.g = texture2D(uFeedbackTex, vUv).g;
  fb.b = texture2D(uFeedbackTex, vUv - caOffset).b;

  vec3 col = fb;
  float waveSample = (texture2D(uAudioTex, vec2(clamp(vUv.x, 0.01, 0.99), 0.75)).r - 0.5) * 2.0;
  float vocalFft = texture2D(uAudioTex, vec2(clamp(0.03 + vUv.x * 0.19, 0.03, 0.22), 0.25)).r;

  if (uMode == 0) {
    // MODE 0: ALCHEMY PLASMA —
    // 1. Crisp white-hot waveform core ribbon (Bass + Waveform)
    float yCore = waveSample * (0.36 + uBass * 0.28);
    float coreLine = smoothstep(0.0075, 0.001, abs(p.y - yCore)) * clamp(abs(waveSample) * 3.8 + uBass * 0.75, 0.0, 1.0);
    col += vec3(0.92, 0.98, 1.0) * coreLine * 0.85;

    // 2. Vocal Presence Formant Aura & Singing Ribbon (tracks vocal pitch centroid)
    float vocalY = (uVocalPitch - 0.45) * 0.38 + (vocalFft - 0.35) * 0.26 * sin(vUv.x * 9.42 + uTime * 3.2);
    float vocalRibbon = smoothstep(0.010, 0.0012, abs(p.y - vocalY)) * smoothstep(0.12, 0.50, uVocal);
    col += palette(0.35 + uVocalPitch * 0.35, uPalette) * vocalRibbon * (0.75 + uVocal * 0.7);

    // 3. Treble Sparkle micro-stars on hi-hat / cymbal transients
    if (uTrebleSpark > 0.08) {
      vec2 spId = floor(p * 34.0 + vec2(floor(uTime * 10.0), 0.0));
      float spRnd = hash21(spId);
      if (spRnd > 0.965) {
        vec2 gv = fract(p * 34.0) - 0.5;
        float spark = (0.006 / (length(gv) + 0.01)) * uTrebleSpark;
        col += vec3(0.9, 0.98, 1.0) * spark;
      }
    }

  } else if (uMode == 1) {
    // MODE 1: FIRESTORM BARS — 96-band Stem-Coded Skyline (Sub/Bass -> Vocal Formant Crown -> Treble Sparks) + Water Lake
    col = fb * 0.35 + vec3(0.02, 0.03, 0.07);
    float bands = 96.0;
    float bandIdx = floor(vUv.x * bands) / bands;
    float cellX = fract(vUv.x * bands);
    float barMask = smoothstep(0.0, 0.14, cellX) * smoothstep(1.0, 0.80, cellX);
    float h = texture2D(uAudioTex, vec2(clamp(bandIdx * 0.72 + 0.02, 0.01, 0.99), 0.25)).r * (0.58 + uSubBass * 0.12);
    float baseline = -0.14;
    float yRel = p.y - baseline;

    // Highlight the Vocal Formant zone (bandIdx 0.12..0.48) and Treble zone (0.55..1.0)
    float isVocalZone = smoothstep(0.08, 0.18, bandIdx) * smoothstep(0.55, 0.42, bandIdx);
    vec3 barCol = palette(bandIdx + h * 0.65 + uTime * 0.04 + isVocalZone * uVocal * 0.22, uPalette);
    if (yRel >= 0.0 && yRel <= h) {
      float segMask = smoothstep(0.0, 0.18, fract(yRel * 48.0));
      float vGrad = yRel / max(0.001, h);
      col += barCol * barMask * segMask * (0.58 + 0.92 * pow(vGrad, 1.35));
    }
    // Peak hold cap + Treble spark flare on high bars
    float capDist = abs(yRel - h);
    col += vec3(1.0, 0.97, 0.88) * barMask * smoothstep(0.010, 0.0015, capDist) * (1.0 + uTrebleSpark * 0.5);

    // Vocal Formant Harmonic Wave floating above the vocal skyline
    float vocalSkyY = 0.26 + (uVocalPitch - 0.45) * 0.18 + waveSample * 0.09 * uVocal;
    float vocalArc = (0.0028 / (abs(p.y - vocalSkyY) + 0.004)) * isVocalZone * smoothstep(0.14, 0.45, uVocal);
    col += palette(0.36 + uVocalPitch * 0.3, uPalette) * vocalArc * 1.1;

    // Sub-Bass horizon pulse line
    col += palette(uTime * 0.1, uPalette) * smoothstep(0.0045 + uSubBass * 0.004, 0.0005, abs(yRel)) * (0.65 + uSubBass * 0.6);

    // Mirrored rippled water reflection below baseline
    if (yRel < 0.0) {
      float waterWave = sin(p.x * 42.0 / max(0.04, abs(yRel)) + uTime * 7.0) * (0.012 + uBass * 0.012) * abs(yRel);
      float sampleX = clamp(bandIdx + waterWave, 0.01, 0.99);
      float reflH = texture2D(uAudioTex, vec2(sampleX * 0.72, 0.25)).r * 0.46;
      if (abs(yRel) <= reflH) {
        float ripple = 0.65 + 0.35 * sin(yRel * 110.0 - uTime * 9.0 + p.x * 20.0);
        float fade = (1.0 - abs(yRel) / max(0.001, reflH)) * 0.55;
        col += barCol * barMask * fade * ripple;
      }
    }

  } else if (uMode == 2) {
    // MODE 2: FERRO-ORB 3D —
    // Bass: Liquid ferrofluid spikes | Vocals: Dual Tilted Pitch-Reactive Gyro Rings | Treble: Electric Corona Arcs
    float fftVal = texture2D(uAudioTex, vec2(clamp(abs(ang) / 3.14159, 0.01, 0.99) * 0.6, 0.25)).r;
    float spikes = sin(ang * 12.0 + uTime * 3.0) * cos(ang * 7.0 - uTime * 2.2) * (0.025 + uBass * 0.085 + uSubBass * 0.05 + fftVal * 0.065);
    float orbRadius = 0.23 + uBass * 0.075 + uSubBass * 0.04 + spikes;

    // Outer Bass / Mid Saturn ring
    vec2 ringP = vec2(p.x, p.y * 2.8 + sin(p.x * 4.0 + uTime) * 0.05);
    float ringDist = abs(length(ringP) - (0.39 + uMid * 0.06));
    float ringGlow = (0.0042 / (ringDist + 0.004)) * (0.5 + fftVal);

    // Inner Vocal Formant Gyro Ring (tilts dynamically with singer's vocal pitch uVocalPitch!)
    float tiltAng = (uVocalPitch - 0.5) * 1.35 + sin(uTime * 0.9) * 0.25;
    float ca = cos(tiltAng), sa = sin(tiltAng);
    vec2 vRot = vec2(ca * p.x - sa * p.y, (sa * p.x + ca * p.y) * 2.5);
    float vocalRingDist = abs(length(vRot) - (0.32 + uVocal * 0.07));
    float vocalRingGlow = (0.0038 / (vocalRingDist + 0.004)) * smoothstep(0.10, 0.42, uVocal) * (0.7 + uVocal);

    // Treble Electric Lightning Filament around outer rim
    float arcNoise = sin(ang * 28.0 - uTime * 19.0) * cos(ang * 19.0 + uTime * 23.0) * 0.028;
    float trebleArcDist = abs(r - (orbRadius + 0.04 + arcNoise));
    float trebleArcGlow = (0.0022 / (trebleArcDist + 0.003)) * clamp(uHigh * 0.7 + uTrebleSpark, 0.0, 1.5);

    if (r < orbRadius) {
      vec2 n2 = p / orbRadius;
      float z = sqrt(max(0.001, 1.0 - dot(n2, n2)));
      vec3 normal = normalize(vec3(n2 + sin(n2.yx * (16.0 + uVocal * 10.0) + uTime * 4.0) * (0.14 + fftVal * 0.32 + uVocal * 0.18), z));
      vec3 lightDir = normalize(vec3(uPointer.x - 0.5, uPointer.y - 0.5, 0.85));
      float diff = max(0.0, dot(normal, lightDir));
      float rim = pow(1.0 - max(0.0, normal.z), 3.0);
      float spec = pow(max(0.0, dot(reflect(-lightDir, normal), vec3(0.0, 0.0, 1.0))), 26.0);
      vec3 metalCol = palette(diff * 0.5 + fftVal * 0.4 + uVocalPitch * 0.25 + uTime * 0.08, uPalette);
      col = mix(col * 0.2, metalCol * (0.25 + diff * 0.85) + vec3(1.0) * spec * 0.95 + palette(uTime * 0.2, uPalette) * rim * 1.3, 0.96);
    }
    if (p.y < 0.0 || r >= orbRadius) {
      col += palette(ang * 0.16 + 0.3, uPalette) * ringGlow;
      col += palette(0.38 + uVocalPitch * 0.35, uPalette) * vocalRingGlow;
    }
    col += vec3(0.85, 0.97, 1.0) * trebleArcGlow;

  } else if (uMode == 3) {
    // MODE 3: 3D STARFIELD & HYPER-TUNNEL —
    // Bass: Warp Speed & Stargate | Vocals: Volumetric Singing Nebula | Treble: High-Density Starlight Sparks
    col = fb * 0.68;
    for (int layer = 1; layer <= 3; layer++) {
      float fl = float(layer);
      float z = fract(fl * 0.33 - uTime * (0.35 + uBass * 0.42 + uSubBass * 0.2));
      float scale = mix(18.0, 1.5, z);
      vec2 starUv = p * scale + vec2(fl * 17.3, fl * 9.1);
      vec2 id = floor(starUv);
      vec2 gv = fract(starUv) - 0.5;
      vec2 rnd = hash22(id) - 0.5;
      float d = length(gv - rnd * 0.7);
      float spark = (0.018 / (d + 0.008)) * smoothstep(0.0, 0.2, z) * (1.0 - z);
      col += palette(hash21(id) + uTime * 0.1, uPalette) * spark * (0.55 + uHigh * 1.1 + uTrebleSpark * 0.8);
    }
    // Sub-kick shockwave ring flying down the tunnel
    if (uKick > 0.01 && uKick < 1.1) {
      float kDist = abs(r - uKick * 0.75);
      col += palette(0.1 + uPhase * 0.2, uPalette) * (0.005 / (kDist + 0.005)) * (1.0 - uKick * 0.8) * uSubBass;
    }

  } else if (uMode == 4) {
    // MODE 4: SYNTHWAVE SUN & 3D OUTRUN GRID —
    // Bass: 3D Grid & Mountains | Vocals: Dancing Northern-Lights Sky Aurora & Sun Corona | Treble: Twinkling Sky Stars
    float horizon = -0.02 + (uPointer.y - 0.5) * 0.12;
    vec3 skyTop = vec3(0.03, 0.01, 0.10);
    vec3 skyHorizon = palette(0.18 + uBass * 0.1, uPalette) * 0.65 + vec3(0.28, 0.04, 0.26);
    col = mix(skyHorizon, skyTop, clamp((p.y - horizon) * 2.2, 0.0, 1.0));

    // Vocal Northern-Lights Aurora Ribbon in upper sky (waves with vocal formant & pitch!)
    if (p.y > horizon + 0.02) {
      float auroraY = horizon + 0.22 + (uVocalPitch - 0.45) * 0.16 + sin(p.x * 5.5 + uTime * 2.2) * 0.045 + waveSample * 0.05 * uVocal;
      float auroraBand = exp(-abs(p.y - auroraY) * 18.0) * smoothstep(0.08, 0.38, uVocal);
      float curtains = 0.5 + 0.5 * sin(p.x * 28.0 + uTime * 3.5 + vocalFft * 6.0);
      col += palette(0.35 + p.x * 0.3 + uVocalPitch * 0.3, uPalette) * auroraBand * (0.45 + 0.75 * curtains) * uVocal * 1.25;
    }

    // Treble Twinkling Stars in upper sky
    if (p.y > horizon + 0.05) {
      vec2 sId = floor(p * 44.0);
      float sRnd = hash21(sId);
      if (sRnd > 0.91 - clamp(uHigh * 0.04, 0.0, 0.035)) {
        float twinkle = 0.5 + 0.5 * sin(uTime * 7.0 + sRnd * 60.0);
        col += vec3(0.9, 0.96, 1.0) * twinkle * (0.35 + uHigh * 1.25 + uTrebleSpark * 0.8) * smoothstep(horizon + 0.05, horizon + 0.35, p.y);
      }
    }

    // Giant Segmented Vaporwave Sun
    vec2 sunCenter = vec2((uPointer.x - 0.5) * 0.25, horizon + 0.17);
    float sunR = 0.22 + uBass * 0.045 + uSubBass * 0.03 + uBeat * 0.025;
    float dSun = length(p - sunCenter);
    if (dSun < sunR && p.y > horizon) {
      float sunY = (p.y - (sunCenter.y - sunR)) / (2.0 * sunR);
      float stripeFreq = 16.0;
      float stripeCut = step(0.12 + (1.0 - sunY) * 0.38, fract(sunY * stripeFreq - uTime * (0.8 + uVocal * 0.8)));
      vec3 sunCol = mix(vec3(1.0, 0.12, 0.55), vec3(1.0, 0.92, 0.25), sunY);
      if (uPalette != 0) sunCol = palette(sunY * 0.5 + 0.1, uPalette) * 1.3;
      col = mix(col, sunCol, (sunY > 0.55 ? 1.0 : stripeCut));
    }
    col += palette(0.12 + uVocalPitch * 0.2, uPalette) * exp(-dSun * 4.8) * (0.35 + uBass * 0.4 + uVocal * 0.35);

    // Audio-Reactive Jagged Mountain Silhouette along the horizon
    float mtnX = abs(p.x) * 0.65;
    float mtnFft = texture2D(uAudioTex, vec2(clamp(mtnX, 0.02, 0.95), 0.25)).r;
    float mtnNoise = abs(sin(p.x * 9.0) * 0.04 + cos(p.x * 23.0) * 0.02);
    float mtnHeight = horizon + (mtnFft * 0.24 + mtnNoise) * smoothstep(0.05, 0.32, abs(p.x));
    if (p.y >= horizon && p.y < mtnHeight) {
      col = vec3(0.04, 0.02, 0.09);
      float rim = smoothstep(0.012, 0.0, abs(p.y - mtnHeight));
      col += palette(mtnX + uTime * 0.1, uPalette) * rim * (1.35 + uVocal * 0.6);
    }

    // 3D Perspective Outrun Wireframe Grid below horizon (driven by Sub-Bass & Bass Groove)
    if (p.y < horizon) {
      float depth = max(0.004, horizon - p.y);
      float z3d = 0.28 / depth;
      float x3d = (p.x - (uPointer.x - 0.5) * 0.3) * z3d;

      float gridWave = (texture2D(uAudioTex, vec2(clamp(abs(x3d) * 0.12, 0.01, 0.99), 0.75)).r - 0.5) * (uBass + uSubBass * 0.8) * 0.65;
      float gx = abs(fract(x3d * 0.55 + gridWave) - 0.5);
      float gz = abs(fract(z3d * 0.45 - uTime * (2.6 + uBass * 2.5)) - 0.5);

      float lineX = smoothstep(0.045, 0.008, gx);
      float lineZ = smoothstep(0.06, 0.01, gz);
      float gridMask = max(lineX, lineZ) * exp(-depth * 1.6);

      vec3 gridCol = palette(depth * 1.5 + uTime * 0.15, uPalette);
      col = vec3(0.02, 0.01, 0.06) + gridCol * gridMask * (0.9 + uBass * 0.95 + uSubBass * 0.5);
      col += vec3(0.85, 0.98, 1.0) * exp(-depth * 75.0) * (1.1 + uBeat * 0.9);
    }

  } else if (uMode == 5) {
    // MODE 5: CYBER MATRIX & 3D AUDIO METROPOLIS —
    // Treble: Digital Matrix Rain | Vocals: Sweeping Concert Searchlight Beams & Sky Wave | Bass: 3D Skyscraper Towers
    col = vec3(0.01, 0.02, 0.04);

    // Background cascading digital Matrix rain columns (accelerated by Treble & Sparkle)
    float rainCols = 64.0;
    float colIdx = floor(vUv.x * rainCols);
    float colSpeed = 0.6 + hash21(vec2(colIdx, 1.0)) * 1.4;
    float colFft = texture2D(uAudioTex, vec2(clamp(colIdx / rainCols, 0.01, 0.99), 0.25)).r;
    float rainY = fract(vUv.y * 0.8 + uTime * colSpeed * (0.55 + uHigh * 1.05 + uTrebleSpark * 0.4) + hash21(vec2(colIdx, 2.0)));
    float charCell = step(0.35, hash21(vec2(colIdx, floor(vUv.y * 42.0 - uTime * 8.0))));
    float rainTrail = pow(1.0 - rainY, 3.5) * charCell;
    float rainHead = smoothstep(0.04, 0.0, rainY) * charCell;
    vec3 rainCol = palette(colIdx / rainCols + uTime * 0.05, uPalette);
    col += rainCol * rainTrail * (0.26 + colFft * 0.72) + vec3(0.9, 1.0, 0.95) * rainHead * (0.5 + uHigh + uTrebleSpark * 0.6);

    // Vocal Concert Searchlight Lasers sweeping the sky above the city
    if (uVocal > 0.08) {
      float beam1Angle = sin(uTime * 1.7 + uVocalPitch * 2.5) * 0.55;
      float beam2Angle = cos(uTime * 1.3 - uVocalPitch * 2.5) * 0.55;
      vec2 bOrigin1 = vec2(-0.42, -0.35);
      vec2 bOrigin2 = vec2(0.42, -0.35);
      vec2 d1 = p - bOrigin1;
      vec2 d2 = p - bOrigin2;
      float cone1 = exp(-abs( d1.x - d1.y * beam1Angle ) * 16.0) * step(0.0, d1.y);
      float cone2 = exp(-abs( d2.x - d2.y * beam2Angle ) * 16.0) * step(0.0, d2.y);
      col += palette(0.32 + uVocalPitch * 0.35, uPalette) * (cone1 + cone2) * uVocal * 0.48;
    }

    // Foreground 3D Perspective Equalizer Skyscraper City (28 towers across)
    float numTowers = 28.0;
    for (int row = 0; row < 3; row++) {
      float rF = float(row);
      float rowScale = 1.0 - rF * 0.22;
      float rowBaseY = -0.46 + rF * 0.11;
      float tx = (p.x * rowScale + 0.85) / 1.7;
      if (tx > 0.0 && tx < 1.0) {
        float tIdx = floor(tx * numTowers);
        float tLocalX = fract(tx * numTowers);
        float binU = clamp(abs(tIdx / numTowers - 0.5) * 1.6 + rF * 0.12, 0.02, 0.96);
        float towerFft = texture2D(uAudioTex, vec2(binU, 0.25)).r;
        float towerH = (0.08 + pow(towerFft, 1.2) * (0.54 + uBass * 0.26 + uSubBass * 0.14)) * (1.0 - rF * 0.18);
        float topY = rowBaseY + towerH;

        if (p.y >= rowBaseY && p.y <= topY && tLocalX > 0.12 && tLocalX < 0.88) {
          vec3 bldgCol = palette(binU + rF * 0.2 + uTime * 0.06, uPalette);
          float sideShade = tLocalX < 0.62 ? 0.85 : 0.45;
          float winX = step(0.3, fract(tLocalX * 5.0));
          float winY = step(0.35, fract((p.y - rowBaseY) * 55.0));
          float roofGlow = smoothstep(0.016, 0.0, abs(p.y - topY));
          col = bldgCol * sideShade * (0.22 + 0.68 * winX * winY * (0.4 + towerFft + uVocal * 0.35)) + vec3(0.95, 0.98, 1.0) * roofGlow * 0.95;
        }
      }
    }

  } else {
    // MODE 6: VORONOI BIO-CELLS / ELECTRIC STAINED GLASS —
    // Bass: Cell Chamber Scale | Vocals: Bioluminescent Singing Cell Nuclei | Treble: Electric Plasma Membrane Arcs
    float scale = 5.2 - (uBass * 0.95 + uSubBass * 0.45);
    vec2 st = p * scale;
    vec2 i_st = floor(st);
    vec2 f_st = fract(st);

    float minDist1 = 8.0;
    float minDist2 = 8.0;
    vec2 bestId = vec2(0.0);

    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 cellId = i_st + neighbor;
        vec2 rnd = hash22(cellId);
        vec2 point = 0.5 + 0.42 * sin(uTime * (1.1 + uMid * 0.8 + uVocal * 0.5) + 6.2831 * rnd + uPhase * 0.35);
        vec2 diff = neighbor + point - f_st;
        float d = length(diff);
        if (d < minDist1) {
          minDist2 = minDist1;
          minDist1 = d;
          bestId = cellId;
        } else if (d < minDist2) {
          minDist2 = d;
        }
      }
    }

    float edgeDist = minDist2 - minDist1;
    float cellHash = hash21(bestId);
    float cellFft = texture2D(uAudioTex, vec2(clamp(cellHash * 0.85 + 0.02, 0.01, 0.99), 0.25)).r;

    vec3 cellColor = palette(cellHash + cellFft * 0.45 + uVocalPitch * 0.2 + uTime * 0.06, uPalette);
    float corePulse = exp(-minDist1 * (3.1 - cellFft * 1.8)) * (0.35 + cellFft * 1.15);
    // Vocal Formant concentric ripples inside each cell
    float vocalRings = (0.5 + 0.5 * sin(minDist1 * (22.0 + uVocalPitch * 18.0) - uTime * 6.0)) * uVocal * 0.28;
    col = cellColor * (corePulse + vocalRings);

    // Vocal + Beat Nucleus spark
    col += vec3(1.0, 0.96, 0.92) * (0.0085 / (minDist1 + 0.012)) * (0.4 + cellFft * 0.85 + uVocal * 0.65 + uBeat * 0.5);

    // Treble Electric plasma membrane borders
    float borderThickness = 0.034 + abs(waveSample) * 0.042 + uBeat * 0.02 + uTrebleSpark * 0.025;
    float borderGlow = smoothstep(borderThickness, 0.0035, edgeDist);
    col += mix(cellColor * 1.4, vec3(0.92, 0.98, 1.0), 0.65) * borderGlow * (0.85 + uHigh * 0.8 + uTrebleSpark * 0.6);
  }

  // Subtle vignette & filmic contrast
  float vig = 1.0 - dot(vUv - 0.5, vUv - 0.5) * 0.5;
  col *= vig;
  col = col / (1.0 + col * 0.22);
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
  if (state.sourceType === 'spotify-embed' && !spotifyState.sdkPlaying) {
    setActiveSourceUI('idle', 'READY · CHOOSE SPOTIFY, LOCAL MUSIC, OR TAB AUDIO');
  }
});

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
    if (data?.clientId) {
      spotifyState.envClientId = data.clientId;
      if (!spotifyState.clientId) {
        spotifyState.clientId = data.clientId;
      }
      if ($('sp-client-id-input') && !$('sp-client-id-input').value) {
        $('sp-client-id-input').value = spotifyState.clientId;
      }
      if ($('sp-env-badge')) $('sp-env-badge').hidden = false;
    }
    if (data?.redirectUri) {
      spotifyState.envRedirectUri = data.redirectUri;
      if (!localStorage.getItem('sp_redirect_uri')) {
        setSpotifyRedirectUri(data.redirectUri, false);
      }
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
  if (col?.tracks?.length) {
    playSpotifyTrack(col.tracks[0], 0, col.tracks, true);
    return;
  }
  if (!col?.spotifyUri) return;
  if (spotifyState.sdkPlayer && spotifyState.sdkPlaying) {
    try { spotifyState.sdkPlayer.pause(); } catch {}
    spotifyState.sdkPlaying = false;
  }
  spotifyState.activePlayer = 'embed';
  $('spotify-embed-dock').hidden = false;
  toggleSpotifyDrawer(false);
  if (spotifyState.embedController) {
    spotifyState.embedController.loadUri(col.spotifyUri);
    spotifyState.embedController.play();
    notify(`Playing ${col.title} in Official Spotify Player 🎧`);
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

// --- Spotify OAuth 2.0 PKCE Popup Login, Account Dashboard & Web Playback SDK ---
spotifyState.libView = 'playlists'; // 'playlists' | 'liked' | 'top' | 'recent'
spotifyState.userLikedTracks = [];
spotifyState.userTopTracks = [];
spotifyState.userRecentTracks = [];
spotifyState.refreshToken = localStorage.getItem('sp_refresh_token') || '';
spotifyState.sdkPlayer = null;
spotifyState.sdkDeviceId = null;

const spBroadcast =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('sonic_prism_spotify_auth') : null;

function getDefaultSpotifyRedirectUri() {
  if (spotifyState.envRedirectUri) return spotifyState.envRedirectUri;
  return `${window.location.origin}/visualizer`;
}

function getSpotifyRedirectUri() {
  const inputVal = $('sp-redirect-uri-input')?.value?.trim();
  if (inputVal) return inputVal;
  const saved = spotifyState.redirectUri || localStorage.getItem('sp_redirect_uri') || '';
  if (saved) return saved;
  return getDefaultSpotifyRedirectUri();
}

function getRedirectUriPresets() {
  const origin = window.location.origin;
  const candidates = [
    { uri: `${origin}/visualizer`, label: `${origin}/visualizer (Recommended)` },
    { uri: `${origin}/visualizer/index.html`, label: `${origin}/visualizer/index.html` },
    { uri: 'https://www.toubia.co/visualizer', label: 'https://www.toubia.co/visualizer' },
    { uri: 'https://www.tonytoubia.com/visualizer', label: 'https://www.tonytoubia.com/visualizer' },
    { uri: 'https://bottoyou.com/visualizer', label: 'https://bottoyou.com/visualizer' },
  ];
  const seen = new Set();
  return candidates.filter(item => {
    if (seen.has(item.uri)) return false;
    seen.add(item.uri);
    return true;
  });
}

function setSpotifyRedirectUri(uri, persist = true) {
  const clean = (uri || '').trim() || getDefaultSpotifyRedirectUri();
  spotifyState.redirectUri = clean;
  if (persist) {
    localStorage.setItem('sp_redirect_uri', clean);
  }
  if ($('sp-redirect-uri-code')) {
    $('sp-redirect-uri-code').textContent = clean;
  }
  if ($('sp-redirect-uri-input') && $('sp-redirect-uri-input').value !== clean) {
    $('sp-redirect-uri-input').value = clean;
  }
  document.querySelectorAll('.sp-preset-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.uri === clean);
  });
}

function renderRedirectUriPresets() {
  const container = $('sp-redirect-presets');
  if (!container) return;
  container.innerHTML = '';
  const current = getSpotifyRedirectUri();
  getRedirectUriPresets().forEach(preset => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `sp-preset-chip${preset.uri === current ? ' active' : ''}`;
    chip.dataset.uri = preset.uri;
    chip.textContent = preset.label;
    chip.addEventListener('click', () => {
      setSpotifyRedirectUri(preset.uri, true);
      notify(`Active Redirect URI set to ${preset.uri}`);
    });
    container.appendChild(chip);
  });
}

// Migrate any stale default '/visualizer/index.html' if user never completed OAuth with it
if (
  !localStorage.getItem('sp_oauth_verified') &&
  spotifyState.redirectUri.endsWith('/visualizer/index.html')
) {
  spotifyState.redirectUri = getDefaultSpotifyRedirectUri();
  localStorage.removeItem('sp_redirect_uri');
}

setSpotifyRedirectUri(spotifyState.redirectUri || getDefaultSpotifyRedirectUri(), false);
renderRedirectUriPresets();

$('sp-redirect-uri-input')?.addEventListener('input', e => {
  const val = e.target.value.trim();
  if (val) {
    setSpotifyRedirectUri(val, true);
  }
});

if ($('sp-client-id-input') && spotifyState.clientId) {
  $('sp-client-id-input').value = spotifyState.clientId;
}
if ($('sp-env-badge') && spotifyState.envClientId) {
  $('sp-env-badge').hidden = false;
}

function openSpotifyAuthModal() {
  if (!authModal) return;
  setSpotifyRedirectUri(getSpotifyRedirectUri(), false);
  renderRedirectUriPresets();
  if ($('sp-client-id-input') && spotifyState.clientId && !$('sp-client-id-input').value) {
    $('sp-client-id-input').value = spotifyState.clientId;
  }
  if ($('sp-env-badge')) {
    $('sp-env-badge').hidden = !spotifyState.envClientId;
  }
  if ($('btn-disconnect-spotify')) {
    $('btn-disconnect-spotify').hidden = !isSpotifyTokenValid();
  }
  authModal.hidden = false;
}

$('btn-copy-redirect')?.addEventListener('click', () => {
  const uri = getSpotifyRedirectUri();
  navigator.clipboard?.writeText(uri);
  notify(`Copied "${uri}" to clipboard! Paste in Spotify Dashboard → Redirect URIs 📋`, 4500);
});

$('btn-spotify-settings')?.addEventListener('click', e => {
  e.stopPropagation();
  openSpotifyAuthModal();
});

$('btn-spotify-connect')?.addEventListener('click', e => {
  e.stopPropagation();
  if (isSpotifyTokenValid()) {
    toggleSpotifyDrawer(true);
    selectSpotifyTab('library');
    renderUserSpotifyLibraryTab();
    return;
  }
  const hasVerifiedSetup =
    Boolean(spotifyState.envClientId) || localStorage.getItem('sp_oauth_verified') === '1';
  if (spotifyState.clientId && hasVerifiedSetup) {
    startSpotifyOAuth(true);
  } else {
    openSpotifyAuthModal();
  }
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

async function startSpotifyOAuth(usePopup = true) {
  const inputId = $('sp-client-id-input')?.value?.trim() || spotifyState.clientId;
  if (!inputId) {
    openSpotifyAuthModal();
    notify('Please enter your Spotify App Client ID first.');
    return;
  }
  const redirectUri = getSpotifyRedirectUri();
  spotifyState.clientId = inputId;
  localStorage.setItem('sp_client_id', inputId);
  setSpotifyRedirectUri(redirectUri, true);
  localStorage.setItem('sp_oauth_pending_redirect_uri', redirectUri);
  if (authModal) authModal.hidden = true;

  const { verifier, challenge } = await generatePkcePair();
  localStorage.setItem('sp_pkce_verifier', verifier);

  const scopes = [
    'user-read-private',
    'user-read-email',
    'user-library-read',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-top-read',
    'user-read-recently-played',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'streaming',
  ].join(' ');

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', inputId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('scope', scopes);

  if (usePopup) {
    const w = 520;
    const h = 720;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
    const popup = window.open(
      authUrl.toString(),
      'SpotifyAuthPopup',
      `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
    if (!popup) {
      window.location.href = authUrl.toString();
    } else {
      notify('Complete Spotify login in the popup window 🟢', 4500);
    }
  } else {
    window.location.href = authUrl.toString();
  }
}

$('btn-start-oauth')?.addEventListener('click', () => startSpotifyOAuth(true));

function disconnectSpotifyAccount() {
  spotifyState.accessToken = '';
  spotifyState.refreshToken = '';
  spotifyState.tokenExpiry = 0;
  spotifyState.userProfile = null;
  spotifyState.userPlaylists = [];
  spotifyState.userLikedTracks = [];
  spotifyState.userTopTracks = [];
  spotifyState.userRecentTracks = [];
  localStorage.removeItem('sp_access_token');
  localStorage.removeItem('sp_refresh_token');
  localStorage.removeItem('sp_token_expiry');
  updateSpotifyAuthBadge();
  if (authModal) authModal.hidden = true;
  if (spotifyState.tab === 'library') renderUserSpotifyLibraryTab();
  notify('Logged out of Spotify account.');
}

$('btn-disconnect-spotify')?.addEventListener('click', disconnectSpotifyAccount);
$('btn-sp-logout')?.addEventListener('click', disconnectSpotifyAccount);

async function onSpotifyAuthCompleted(accessTokenFromEvent) {
  spotifyState.accessToken =
    localStorage.getItem('sp_access_token') || accessTokenFromEvent || spotifyState.accessToken || '';
  spotifyState.refreshToken = localStorage.getItem('sp_refresh_token') || spotifyState.refreshToken || '';
  spotifyState.tokenExpiry = Number(localStorage.getItem('sp_token_expiry') || spotifyState.tokenExpiry || 0);
  if (!spotifyState.accessToken) return;
  if (authModal) authModal.hidden = true;
  toggleSpotifyDrawer(true);
  selectSpotifyTab('library');
  await fetchSpotifyProfileAndLibrary();
  initSpotifyWebPlaybackSDK();
  notify('Logged in to Spotify! Your playlists & liked songs are ready 🟢');
}

// Listen for popup completion via BroadcastChannel, postMessage, or localStorage event
spBroadcast?.addEventListener('message', e => {
  if (e.data?.type === 'SPOTIFY_AUTH_SUCCESS') {
    onSpotifyAuthCompleted(e.data.accessToken);
  }
});

window.addEventListener('message', e => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.type === 'SPOTIFY_AUTH_SUCCESS') {
    onSpotifyAuthCompleted(e.data.accessToken);
  }
});

window.addEventListener('storage', e => {
  if (e.key === 'sp_access_token' && e.newValue) {
    onSpotifyAuthCompleted(e.newValue);
  }
});

async function refreshSpotifyAccessToken() {
  const refresh = spotifyState.refreshToken || localStorage.getItem('sp_refresh_token');
  const clientId = spotifyState.clientId || localStorage.getItem('sp_client_id');
  if (!refresh || !clientId) return false;
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: clientId,
    });
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json();
    if (data?.access_token) {
      spotifyState.accessToken = data.access_token;
      spotifyState.tokenExpiry = Date.now() + Number(data.expires_in || 3600) * 1000;
      localStorage.setItem('sp_access_token', spotifyState.accessToken);
      localStorage.setItem('sp_token_expiry', String(spotifyState.tokenExpiry));
      if (data.refresh_token) {
        spotifyState.refreshToken = data.refresh_token;
        localStorage.setItem('sp_refresh_token', data.refresh_token);
      }
      return true;
    }
  } catch {}
  return false;
}

async function handleSpotifyOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const oauthError = params.get('error');

  if (oauthError) {
    window.history.replaceState({}, document.title, window.location.pathname);
    openSpotifyAuthModal();
    notify(`Spotify login error: ${oauthError}. Verify Redirect URI in settings.`, 5000);
    return;
  }

  if (!code) {
    // Also fetch server config in background if clientId is not set yet
    if (!spotifyState.clientId) {
      fetch('/api/visualizer/spotify')
        .then(r => r.json())
        .then(data => {
          if (data?.clientId) {
            spotifyState.envClientId = data.clientId;
            if (!spotifyState.clientId) spotifyState.clientId = data.clientId;
            if ($('sp-client-id-input') && !$('sp-client-id-input').value) {
              $('sp-client-id-input').value = spotifyState.clientId;
            }
            if ($('sp-env-badge')) $('sp-env-badge').hidden = false;
          }
          if (data?.redirectUri) {
            spotifyState.envRedirectUri = data.redirectUri;
            if (!localStorage.getItem('sp_redirect_uri')) {
              setSpotifyRedirectUri(data.redirectUri, false);
            }
          }
        })
        .catch(() => {});
    }

    if (isSpotifyTokenValid()) {
      await fetchSpotifyProfileAndLibrary();
      initSpotifyWebPlaybackSDK();
    } else if (spotifyState.refreshToken) {
      const ok = await refreshSpotifyAccessToken();
      if (ok) {
        await fetchSpotifyProfileAndLibrary();
        initSpotifyWebPlaybackSDK();
      }
    }
    return;
  }

  const verifier = localStorage.getItem('sp_pkce_verifier');
  const clientId = spotifyState.clientId || localStorage.getItem('sp_client_id');
  const usedRedirectUri =
    localStorage.getItem('sp_oauth_pending_redirect_uri') || getSpotifyRedirectUri();
  window.history.replaceState({}, document.title, window.location.pathname);

  if (!verifier || !clientId) return;

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: usedRedirectUri,
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
      localStorage.setItem('sp_oauth_verified', '1');
      localStorage.setItem('sp_access_token', spotifyState.accessToken);
      localStorage.setItem('sp_token_expiry', String(spotifyState.tokenExpiry));
      if (tokenData.refresh_token) {
        spotifyState.refreshToken = tokenData.refresh_token;
        localStorage.setItem('sp_refresh_token', tokenData.refresh_token);
      }

      // Broadcast success to main visualizer window across BroadcastChannel, postMessage, and localStorage
      try {
        spBroadcast?.postMessage({
          type: 'SPOTIFY_AUTH_SUCCESS',
          accessToken: spotifyState.accessToken,
        });
      } catch {}

      const isPopup =
        window.name === 'SpotifyAuthPopup' ||
        (window.top && window.top.name === 'SpotifyAuthPopup') ||
        Boolean(window.opener && window.opener !== window) ||
        Boolean(window.top && window.top.opener && window.top.opener !== window.top);

      if (isPopup) {
        try {
          const openerWin = (window.top && window.top.opener) || window.opener;
          openerWin?.postMessage(
            { type: 'SPOTIFY_AUTH_SUCCESS', accessToken: spotifyState.accessToken },
            window.location.origin
          );
        } catch {}
        try {
          window.top?.close();
        } catch {}
        try {
          window.close();
        } catch {}
        return;
      }

      await onSpotifyAuthCompleted(spotifyState.accessToken);
    } else {
      openSpotifyAuthModal();
      notify('Spotify authorization failed — verify Client ID & Redirect URI in settings.');
    }
  } catch {
    openSpotifyAuthModal();
    notify('Could not complete Spotify token exchange.');
  }
}

function updateSpotifyAuthBadge() {
  const btn = $('btn-spotify-connect');
  const status = $('sp-connection-status');
  const accountBar = $('sp-account-bar');
  if (!btn) return;

  if (isSpotifyTokenValid() && spotifyState.userProfile) {
    const name = spotifyState.userProfile.display_name || spotifyState.userProfile.id || 'Spotify User';
    const isPremium = spotifyState.userProfile.product === 'premium';
    const avatarUrl = spotifyState.userProfile.images?.[0]?.url || '';

    btn.textContent = `✓ ${name}`;
    btn.classList.add('connected');
    if (status) {
      status.textContent = `LOGGED IN AS ${name.toUpperCase()} · ${isPremium ? 'SPOTIFY PREMIUM' : 'SPOTIFY ACCOUNT'}`;
    }
    if (accountBar) {
      accountBar.hidden = false;
      if ($('sp-user-name')) $('sp-user-name').textContent = name;
      if ($('sp-user-tier')) {
        $('sp-user-tier').textContent = isPremium
          ? 'SPOTIFY PREMIUM · FULL LIBRARY & SDK READY'
          : 'SPOTIFY ACCOUNT CONNECTED';
      }
      const av = $('sp-user-avatar');
      if (av) {
        if (avatarUrl) {
          av.src = avatarUrl;
          av.hidden = false;
        } else {
          av.hidden = true;
        }
      }
    }
  } else {
    btn.textContent = '🟢 Log in with Spotify';
    btn.classList.remove('connected');
    if (status) status.textContent = 'SEARCH SONGS, PLAYLISTS, OR LOG IN TO YOUR ACCOUNT';
    if (accountBar) accountBar.hidden = true;
  }
}

// Sub-tabs inside Connected Spotify Account Bar (Playlists, Liked Songs, Top Tracks, Recent)
document.querySelectorAll('.sp-subtab').forEach(subBtn => {
  subBtn.addEventListener('click', () => {
    document.querySelectorAll('.sp-subtab').forEach(b => b.classList.remove('active'));
    subBtn.classList.add('active');
    spotifyState.libView = subBtn.dataset.libView || 'playlists';
    $('spotify-collection-banner').hidden = true;
    selectSpotifyTab('library');
    renderUserSpotifyLibraryTab();
  });
});

async function fetchSpotifyWebApi(endpoint) {
  if (!isSpotifyTokenValid()) {
    const refreshed = await refreshSpotifyAccessToken();
    if (!refreshed) return null;
  }
  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${spotifyState.accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

function mapSpotifyApiTrack(t) {
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
}

async function fetchSpotifyProfileAndLibrary() {
  const [profile, saved, top, recent, playlists] = await Promise.all([
    fetchSpotifyWebApi('/me'),
    fetchSpotifyWebApi('/me/tracks?limit=40'),
    fetchSpotifyWebApi('/me/top/tracks?limit=30&time_range=short_term'),
    fetchSpotifyWebApi('/me/player/recently-played?limit=30'),
    fetchSpotifyWebApi('/me/playlists?limit=40'),
  ]);

  if (profile) {
    spotifyState.userProfile = profile;
    updateSpotifyAuthBadge();
  }

  spotifyState.userLikedTracks = (saved?.items || []).map(item => mapSpotifyApiTrack(item.track)).filter(Boolean);
  spotifyState.userTopTracks = (top?.items || []).map(mapSpotifyApiTrack).filter(Boolean);
  spotifyState.userRecentTracks = (recent?.items || []).map(item => mapSpotifyApiTrack(item.track)).filter(Boolean);

  spotifyState.userPlaylists = (playlists?.items || []).map(pl => ({
    id: pl.id,
    title: pl.name,
    subtitle: `${pl.tracks?.total || 0} tracks · ${pl.owner?.display_name || 'Your Playlist'}`,
    artwork: pl.images?.[0]?.url || '',
    isOAuthPlaylist: true,
    spotifyUri: pl.uri,
  }));

  if (spotifyState.tab === 'library') {
    renderUserSpotifyLibraryTab();
  }
}

function initSpotifyWebPlaybackSDK() {
  if (!window.Spotify || spotifyState.sdkPlayer || !isSpotifyTokenValid()) return;
  try {
    const player = new window.Spotify.Player({
      name: 'SONIC PRISM Web Visualizer',
      getOAuthToken: async cb => {
        if (!isSpotifyTokenValid()) {
          await refreshSpotifyAccessToken();
        }
        cb(spotifyState.accessToken);
      },
      volume: 0.9,
    });
    player.addListener('ready', ({ device_id }) => {
      spotifyState.sdkDeviceId = device_id;
    });
    player.addListener('player_state_changed', st => {
      if (!st) return;
      spotifyState.activePlayer = 'sdk';
      spotifyState.sdkPlaying = !st.paused;
      spotifyState.embedPlaying = !st.paused;
      spotifyState.embedPositionMs = st.position || 0;
      spotifyState.embedDurationMs = st.duration || 0;

      if (!st.paused && spotifyState.embedController) {
        try { spotifyState.embedController.pause(); } catch {}
        if ($('spotify-embed-dock')) $('spotify-embed-dock').hidden = true;
      }

      const cur = st.track_window?.current_track;
      if (cur?.id && spotifyState.currentTrack?.spotifyId !== cur.id) {
        const mapped = {
          id: `spotify-${cur.id}`,
          spotifyId: cur.id,
          spotifyUri: cur.uri,
          title: cur.name || 'Track',
          artist: Array.isArray(cur.artists) ? cur.artists.map(a => a.name).join(', ') : '',
          artwork: cur.album?.images?.[0]?.url || '',
          durationMs: st.duration || 210000,
        };
        spotifyState.currentTrack = mapped;
        updateTransportMetadata(mapped);
        highlightActiveTrackCard();
        analyzeTrackSignatureInBackground(mapped);
        if (state.sourceType !== 'system') {
          setActiveSourceUI('spotify-embed', `SPOTIFY · ${mapped.title.toUpperCase().slice(0, 28)}`);
        }
      }

      if ($('btn-play-pause')) {
        $('btn-play-pause').textContent = st.paused ? '▶' : '⏸';
      }
      if (st.duration > 0) {
        $('seek-bar').hidden = false;
        $('track-time').hidden = false;
        $('seek-bar').value = String(Math.min(100, (st.position / st.duration) * 100));
        $('track-time').textContent = `${formatTime(st.position * 0.001)} / ${formatTime(st.duration * 0.001)}`;
      }
    });
    player.connect();
    spotifyState.sdkPlayer = player;
  } catch {}
}

window.onSpotifyWebPlaybackSDKReady = () => {
  if (isSpotifyTokenValid()) initSpotifyWebPlaybackSDK();
};

async function loadUserOAuthPlaylistTracks(playlistId, title) {
  const container = $('spotify-results');
  if (container) container.innerHTML = `<div class="sp-loading">Loading "${title}"...</div>`;
  const data = await fetchSpotifyWebApi(`/playlists/${playlistId}/tracks?limit=40`);
  const tracks = (data?.items || [])
    .map(item => mapSpotifyApiTrack(item?.track))
    .filter(Boolean);

  spotifyState.activeCollection = {
    title,
    spotifyUri: `spotify:playlist:${playlistId}`,
    tracks,
  };
  $('spotify-collection-banner').hidden = false;
  $('sp-collection-title').textContent = title;
  $('sp-collection-sub').textContent = `${tracks.length} Tracks in Your Playlist`;
  renderSpotifyTracks(tracks, 'No tracks found in this playlist.');
}

function renderUserSpotifyLibraryTab() {
  const container = $('spotify-results');
  if (!container) return;
  if (!isSpotifyTokenValid()) {
    container.innerHTML = `
      <div class="sp-loading">
        <p style="margin-bottom:12px;">Log in with your Spotify account to view your personal <b>Profile</b>, <b>Playlists</b>, <b>Liked Songs</b>, <b>Top Tracks</b>, and <b>Recently Played</b> right inside the visualizer:</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button type="button" id="sp-inline-connect" class="sp-oauth-go-btn" style="max-width:250px;">🟢 Log in with Spotify</button>
          <button type="button" id="sp-inline-config" class="sp-back-btn">⚙ Client ID &amp; Redirect URI</button>
        </div>
      </div>
    `;
    $('sp-inline-connect')?.addEventListener('click', () => {
      const hasVerifiedSetup =
        Boolean(spotifyState.envClientId) || localStorage.getItem('sp_oauth_verified') === '1';
      if (spotifyState.clientId && hasVerifiedSetup) {
        startSpotifyOAuth(true);
      } else {
        openSpotifyAuthModal();
      }
    });
    $('sp-inline-config')?.addEventListener('click', () => {
      openSpotifyAuthModal();
    });
    return;
  }

  const view = spotifyState.libView || 'playlists';
  if (view === 'playlists') {
    if (spotifyState.userPlaylists.length) {
      renderSpotifyPlaylists(spotifyState.userPlaylists);
    } else {
      container.innerHTML = '<div class="sp-loading">Loading your Spotify Playlists...</div>';
      fetchSpotifyProfileAndLibrary();
    }
  } else if (view === 'liked') {
    renderSpotifyTracks(spotifyState.userLikedTracks, 'No Liked Songs found in your Spotify library.');
  } else if (view === 'top') {
    renderSpotifyTracks(spotifyState.userTopTracks, 'No Top Tracks found yet.');
  } else if (view === 'recent') {
    renderSpotifyTracks(spotifyState.userRecentTracks, 'No Recently Played tracks found.');
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
  if (state.sourceType === 'file') {
    if (audioEl.paused) {
      ensureAudioContext();
      audioEl.play();
      $('btn-play-pause').textContent = '⏸';
    } else {
      audioEl.pause();
      $('btn-play-pause').textContent = '▶';
    }
  } else if (state.sourceType === 'spotify-embed' || state.sourceType === 'spotify') {
    if (spotifyState.activePlayer === 'sdk' && spotifyState.sdkPlayer) {
      spotifyState.sdkPlayer.togglePlay();
    } else if (spotifyState.embedController) {
      spotifyState.embedController.togglePlay();
    }
  }
});

$('seek-bar')?.addEventListener('input', e => {
  const pct = Number(e.target.value) / 100;
  if (state.sourceType === 'file' && Number.isFinite(audioEl.duration)) {
    audioEl.currentTime = pct * audioEl.duration;
  } else if (
    (state.sourceType === 'spotify-embed' || state.sourceType === 'spotify') &&
    spotifyState.embedDurationMs > 0
  ) {
    const targetMs = Math.round(pct * spotifyState.embedDurationMs);
    spotifyState.embedPositionMs = targetMs;
    if (spotifyState.activePlayer === 'sdk' && spotifyState.sdkPlayer) {
      spotifyState.sdkPlayer.seek(targetMs);
    } else if (spotifyState.embedController?.seek) {
      spotifyState.embedController.seek(Math.round(targetMs / 1000));
    }
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
$('ctrl-bass-boost')?.addEventListener('input', e => {
  state.bassBoost = Number(e.target.value);
  $('val-bass-boost').textContent = `${state.bassBoost.toFixed(2)}×`;
});
$('ctrl-vocal-boost')?.addEventListener('input', e => {
  state.vocalBoost = Number(e.target.value);
  $('val-vocal-boost').textContent = `${state.vocalBoost.toFixed(2)}×`;
});
$('ctrl-treble-boost')?.addEventListener('input', e => {
  state.trebleBoost = Number(e.target.value);
  $('val-treble-boost').textContent = `${state.trebleBoost.toFixed(2)}×`;
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

  if ($('meter-sub')) {
    $('meter-sub').style.width = `${Math.min(100, Math.round(state.subBass * 88))}%`;
  }
  $('meter-bass').style.width = `${Math.min(100, Math.round(state.bass * 85))}%`;
  if ($('meter-vocal')) {
    $('meter-vocal').style.width = `${Math.min(100, Math.round(state.vocal * 88))}%`;
  }
  $('meter-mid').style.width = `${Math.min(100, Math.round(state.mid * 85))}%`;
  $('meter-high').style.width = `${Math.min(100, Math.round((state.high * 0.75 + state.trebleSpark * 0.35) * 90))}%`;
  $('bpm-readout').textContent =
    state.sourceType === 'idle' ? 'WAITING FOR AUDIO' : `~${state.bpmEstimate} BPM · 5-STEM DSP`;

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
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uSubBass'), state.subBass);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uBass'), state.bass);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uVocal'), state.vocal);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uVocalPitch'), state.vocalPitch);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uMid'), state.mid);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uHigh'), state.high);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uKick'), state.kickImpulse);
  gl.uniform1f(gl.getUniformLocation(feedbackProg, 'uTrebleSpark'), state.trebleSpark);
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
  gl.uniform1f(gl.getUniformLocation(compositeProg, 'uSubBass'), state.subBass);
  gl.uniform1f(gl.getUniformLocation(compositeProg, 'uBass'), state.bass);
  gl.uniform1f(gl.getUniformLocation(compositeProg, 'uVocal'), state.vocal);
  gl.uniform1f(gl.getUniformLocation(compositeProg, 'uVocalPitch'), state.vocalPitch);
  gl.uniform1f(gl.getUniformLocation(compositeProg, 'uMid'), state.mid);
  gl.uniform1f(gl.getUniformLocation(compositeProg, 'uHigh'), state.high);
  gl.uniform1f(gl.getUniformLocation(compositeProg, 'uKick'), state.kickImpulse);
  gl.uniform1f(gl.getUniformLocation(compositeProg, 'uTrebleSpark'), state.trebleSpark);
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
