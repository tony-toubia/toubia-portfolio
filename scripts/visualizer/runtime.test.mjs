import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

// Execute the application rather than a copy of its state machine. Browser APIs are
// adapters here: this checks routing, signal state and uniforms, not WebGL pixels.
async function createApp({ captureSupported = true, microphoneSupported = true, secureContext = true,
  userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0',
  reducedMotion = false, contextState = 'running', resumeReject = false } = {}) {
  const html = await fs.readFile('public/visualizer/index.html', 'utf8');
  const source = await fs.readFile('public/visualizer/visualizer.mjs', 'utf8');
  const uiSource = await fs.readFile('public/visualizer/visualizer-ui.mjs', 'utf8');
  const nodes = new Map(), elements = [], windowEvents = new Map(), documentEvents = new Map();
  const connections = [], uniformValues = new Map(), captures = [], microphones = [], glCalls = [];
  let now = 0, frame = { frequency: 0, amplitude: 0 }, nextCapture, nextMicrophone, lastContext;
  let framebufferId = 0, boundFramebuffer = null;

  class Element {
    constructor(tagName = 'div', attrs = '') {
      this.tagName = tagName.toUpperCase(); this.attrs = {}; this.dataset = {}; this.events = new Map();
      this.style = { setProperty(key, value) { this[key] = value; } }; this.children = [];
      this.textContent = ''; this.value = ''; this.hidden = /\bhidden(?:\s|$|>)/.test(attrs);
      this.paused = true; this.duration = 180; this.currentTime = 0; this.width = 0; this.height = 0;
      this.disabled = /\bdisabled(?:\s|$|>)/.test(attrs);
      for (const m of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
        this.attrs[m[1]] = m[2];
        if (m[1].startsWith('data-')) this.dataset[m[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = m[2];
      }
      this.id = this.attrs.id || ''; this.value = this.attrs.value || '';
      const classes = new Set((this.attrs.class || '').split(/\s+/).filter(Boolean));
      this.classList = { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle(c, on) { const value = on ?? !classes.has(c); if (value) classes.add(c); else classes.delete(c); return value; } };
      this.className = this.attrs.class || '';
    }
    addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, []); this.events.get(name).push(fn); }
    async emit(name, extra = {}) { for (const fn of this.events.get(name) || []) await fn({ target: this, preventDefault() {}, stopPropagation() {}, ...extra }); }
    click() { return this.disabled ? Promise.resolve() : this.emit('click'); }
    focus() { document.activeElement = this; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return this.attrs[name] ?? null; }
    removeAttribute(name) { delete this.attrs[name]; if (name === 'src') this.src = ''; }
    appendChild(child) { this.children.push(child); elements.push(child); return child; }
    querySelectorAll(selector) { return this.children.filter(el => matches(el, selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    set innerHTML(value) { this._html = value; this.children = []; }
    get innerHTML() { return this._html || ''; }
    load() { this.paused = true; }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    getContext(type) { assert.equal(type, 'webgl'); return gl; }
    scrollIntoView() {}
  }
  const matches = (el, selector) => selector.startsWith('.') && el.classList.contains(selector.slice(1));
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
    const node = new Element(match[1], match[2]); elements.push(node); if (node.id) nodes.set(node.id, node);
  }
  const document = {
    body: new Element('body'), documentElement: new Element('html'), activeElement: null, hidden: false,
    getElementById(id) { assert.ok(nodes.has(id), `application references missing #${id}`); return nodes.get(id); },
    querySelectorAll: selector => elements.filter(el => matches(el, selector)),
    createElement: tag => new Element(tag),
    addEventListener(name, fn) { if (!documentEvents.has(name)) documentEvents.set(name, []); documentEvents.get(name).push(fn); },
  };
  const gl = new Proxy({
    getShaderParameter: () => true, getProgramParameter: () => true,
    getUniformLocation: (_program, name) => name,
    uniform1f: (name, value) => uniformValues.set(name, value),
    uniform1i: (name, value) => uniformValues.set(name, value),
    getAttribLocation: () => 0,
    createFramebuffer() { const fbo = { testFbo: ++framebufferId }; glCalls.push(['createFramebuffer', fbo]); return fbo; },
    bindFramebuffer(target, fbo) { boundFramebuffer = fbo; glCalls.push(['bindFramebuffer', target, fbo]); },
    copyTexSubImage2D: (...args) => glCalls.push(['copyTexSubImage2D', ...args]),
    drawArrays: (...args) => glCalls.push(['drawArrays', boundFramebuffer, ...args]),
    enable: (...args) => glCalls.push(['enable', ...args]),
    disable: (...args) => glCalls.push(['disable', ...args]),
  }, { get(target, name) { if (name in target) return target[name]; if (/^[A-Z_\d]+$/.test(name)) return 1; return () => ({}); } });

  const audioNode = label => ({ label, connect(target) { connections.push([label, target.label]); }, disconnect() { connections.push([label, 'disconnected']); } });
  class AudioContext {
    constructor() { this.state = contextState; this.sampleRate = 48000; this.destination = audioNode('speakers'); lastContext = this; }
    resume() { if(resumeReject)return Promise.reject(new Error('Audio context is blocked')); this.state = 'running'; return Promise.resolve(); }
    createAnalyser() {
      return { ...audioNode('analyser'), fftSize: 2048, frequencyBinCount: 1024,
        getByteFrequencyData(out) {
          out.fill(0);
          if (!frame.amplitude) return;
          // Model the adjacent bins from the AnalyserNode's windowed FFT. A
          // one-bin impulse is unrealistic and can fall between log samples.
          const center = Math.round(frame.frequency * 2048 / 48000);
          for (const [offset, weight] of [[-2, .1], [-1, .6], [0, 1], [1, .6], [2, .1]]) {
            const bin = center + offset;
            if (bin >= 0 && bin < out.length) out[bin] = Math.min(255, Math.round(frame.amplitude * 800 * weight));
          }
        },
        getFloatTimeDomainData(out) { for (let i = 0; i < out.length; i++) out[i] = frame.amplitude * Math.sin(2 * Math.PI * frame.frequency * i / 48000); },
        getByteTimeDomainData(out) { for (let i = 0; i < out.length; i++) out[i] = Math.round(128 + frame.amplitude * 127 * Math.sin(2 * Math.PI * frame.frequency * i / 48000)); },
      };
    }
    createMediaElementSource() { return audioNode('local-file'); }
    createMediaStreamSource() { return audioNode('captured-stream'); }
    createGain() { return { ...audioNode('silent-sink'), gain: { value: 1 } }; }
    createBufferSource() { throw new Error('A Spotify preview must never be looped as purported live input'); }
  }
  class MediaStream { constructor(tracks) { this.tracks = tracks; } getTracks() { return this.tracks; } getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); } }
  const makeTrack = kind => ({ kind, readyState: 'live', label: 'Test tab audio', muted: false, handlers: new Map(), addEventListener(name, fn) { this.handlers.set(name, fn); }, stop() { this.readyState = 'ended'; }, end() { this.readyState = 'ended'; this.handlers.get('ended')?.(); } });
  const location = new URL('https://example.test/visualizer/index.html');
  const window = { location, AudioContext, isSecureContext: secureContext, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, matchMedia: () => ({ matches: reducedMotion }),
    addEventListener: (name, fn) => { if (!windowEvents.has(name)) windowEvents.set(name, []); windowEvents.get(name).push(fn); },
  };
  window.top = window;
  class TestURL extends URL { static createObjectURL() { return 'blob:test-track'; } static revokeObjectURL() {} }
  const stores = new Map();
  const audioModule = await import('../../public/visualizer/audio-reactivity.mjs');
  const sceneModule = await import('../../public/visualizer/scene-cycle.mjs');
  const navigator = { userAgent, mediaDevices: {
    ...(captureSupported ? { async getDisplayMedia(options) { captures.push(options); if (nextCapture instanceof Error) throw nextCapture; return nextCapture || new MediaStream([makeTrack('audio'), makeTrack('video')]); } } : {}),
    ...(microphoneSupported ? { async getUserMedia(options) { microphones.push(options); if (nextMicrophone instanceof Error) throw nextMicrophone; return nextMicrophone || new MediaStream([makeTrack('audio')]); } } : {}),
  } };
  const context = vm.createContext({ ...audioModule, ...sceneModule, window, document, navigator,
    URL: TestURL, URLSearchParams, MediaStream, Uint8Array, Float32Array, Float64Array, TextEncoder, console,
    performance: { now: () => now }, requestAnimationFrame() {}, setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    matchMedia: window.matchMedia, localStorage: { getItem: key => stores.get(key) || '', setItem: (key, value) => stores.set(key, value), removeItem: key => stores.delete(key) },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
  });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '') + `\n;globalThis.testApp = { state, spotifyState, startSystemAudio, startMicrophone, loadLocalFiles, playSpotifyTrack, stopCurrentSources, setActiveSourceUI, renderLoop, get texture() { return audioTexData; } };`, context);
  vm.runInContext(`(() => { ${uiSource}\n})();`,context);
  const app = context.testApp;
  const tick = (seconds = 1 / 60) => { const steps = Math.ceil(seconds * 60); for (let i = 0; i < steps; i++) { now += 1000 / 60; app.renderLoop(now); } };
  await Promise.resolve();
  return { app, nodes, elements, windowEvents, uniformValues, captures, microphones, connections, glCalls, tick, makeTrack, MediaStream,
    signal(frequency, amplitude) { frame = { frequency, amplitude }; },
    capture(value) { nextCapture = value; }, get audioContext() { return lastContext; },
    microphone(value) { nextMicrophone = value; },
    async setHidden(value) { document.hidden = value; for (const fn of documentEvents.get('visibilitychange') || []) await fn(); },
  };
}

test('application boots with no invented audio and every visual mode is selectable', async () => {
  const h = await createApp(); h.tick(1);
  assert.equal(h.app.state.audioStatus, 'idle');
  assert.equal(h.app.state.audioLevel, 0);
  assert.ok(h.app.texture.slice(0, 512).every(v => v === 0));
  for (const button of h.elements.filter(el => el.classList.contains('mode-pill'))) {
    await button.click(); h.tick();
    assert.equal(h.app.state.mode, Number(button.dataset.mode));
    assert.equal(h.uniformValues.get('uMode'), Number(button.dataset.mode));
    assert.equal(button.getAttribute('aria-selected'), 'true');
  }
  assert.equal(h.elements.filter(el => el.classList.contains('mode-pill')).length, 7);
});

test('keyboard world navigation wraps through seven choices and invalid ids cannot select a shader',async()=>{
  const h=await createApp(),tabs=h.elements.filter(el=>el.classList.contains('mode-pill'));
  await tabs[0].emit('keydown',{key:'End'});h.tick();
  assert.equal(h.app.state.mode,6);assert.equal(h.uniformValues.get('uMode'),6);
  await tabs[6].emit('keydown',{key:'ArrowRight'});h.tick();
  assert.equal(h.app.state.mode,0,'right wraps to the first choice');
  await tabs[0].emit('keydown',{key:'ArrowLeft'});h.tick();
  assert.equal(h.app.state.mode,6,'left wraps to the last choice');
  await tabs[6].emit('keydown',{key:'Home'});h.tick();assert.equal(h.app.state.mode,0);
  for(const invalid of ['7','8','-1','NaN','3.5']){
    tabs[3].dataset.mode=invalid;await tabs[3].click();h.tick();
    assert.equal(h.app.state.mode,0,`invalid mode ${invalid} is ignored`);
    assert.equal(h.uniformValues.get('uMode'),0);
    assert.equal(tabs[0].getAttribute('aria-selected'),'true');
    assert.equal(tabs[3].getAttribute('aria-selected'),'false');
  }
});

test('Vortex receives measured audio uniforms and returns to zero signal during silence',async()=>{
  const h=await createApp(),vortex=h.elements.find(el=>el.dataset.mode==='3'&&el.classList.contains('mode-pill'));
  await vortex.click();h.app.loadLocalFiles([{name:'vortex-tone.wav',type:'audio/wav'}]);await Promise.resolve();
  h.signal(80,.24);h.tick(.6);
  assert.equal(h.uniformValues.get('uMode'),3);assert.equal(h.app.state.audioStatus,'live');
  assert.ok(h.uniformValues.get('uSubBass')>.05,'real low frequencies reach the Vortex pass');
  assert.ok(h.uniformValues.get('uTime')>0,'measured audio advances its flow');
  h.signal(80,0);h.tick(2);
  assert.equal(h.app.state.audioStatus,'silent');assert.ok(h.uniformValues.get('uSubBass')<.01);
  assert.ok(h.app.texture.slice(0,512).every(value=>value===0),'a silent source does not synthesize Vortex activity');
});

for (const [mode, name] of [[5, 'Aurora'], [6, 'Silk']]) {
  test(`${name} receives real bass, mids and treble, and freezes during silence and pause`, async () => {
    const h = await createApp();
    const tab = h.elements.find(el => el.dataset.mode === String(mode) && el.classList.contains('mode-pill'));
    assert.ok(tab, `${name} is available in the picker`);
    await tab.click();
    h.app.loadLocalFiles([{ name: `${name.toLowerCase()}-tones.wav`, type: 'audio/wav' }]);
    await Promise.resolve();

    for (const [frequency, uniform] of [[180, 'uBass'], [3500, 'uMid'], [8500, 'uHigh']]) {
      const before = h.uniformValues.get('uTime') || 0;
      h.signal(frequency, .2); h.tick(.6);
      assert.equal(h.app.state.audioStatus, 'live');
      assert.equal(h.uniformValues.get('uMode'), mode);
      assert.ok(h.uniformValues.get(uniform) > .01, `${frequency} Hz reaches ${uniform}`);
      assert.ok(h.uniformValues.get('uTime') > before, 'real audio advances the flow');
      assert.ok(h.app.texture.slice(0, 512).some(value => value > 0), 'the real spectrum reaches the shader texture');
      assert.ok(h.app.texture.slice(512).some(value => value !== 128), 'the real waveform reaches the shader texture');

      h.signal(frequency, 0); h.tick(2);
      assert.equal(h.app.state.audioStatus, 'silent');
      assert.ok(h.app.texture.slice(0, 512).every(value => value === 0), 'silence clears the spectrum');
      assert.ok(h.app.texture.slice(512).every(value => value === 128), 'silence centers the waveform');
      const silentTime = h.uniformValues.get('uTime'); h.tick(.5);
      assert.equal(h.uniformValues.get('uTime'), silentTime, 'silent input freezes motion');
    }

    h.signal(900, .2); h.tick(.5);
    await h.nodes.get('btn-play-pause').click(); h.tick(.6);
    assert.equal(h.app.state.audioStatus, 'paused');
    const pausedTime = h.uniformValues.get('uTime'); h.tick(.5);
    assert.equal(h.uniformValues.get('uTime'), pausedTime, 'paused playback freezes motion');
    assert.ok(h.app.texture.slice(0, 512).every(value => value === 0), 'paused playback has no stale spectrum');
  });
}

test('a local file drives actual uniforms, silence closes the gate, and pause stops signal', async () => {
  const h = await createApp();
  h.app.loadLocalFiles([{ name: 'test-tone.wav', type: 'audio/wav' }]); await Promise.resolve();
  h.signal(80, .24); h.tick(.6);
  assert.equal(h.app.state.audioStatus, 'live');
  assert.ok(h.uniformValues.get('uTime') > 0, 'measured audio advances visual motion');
  assert.ok(h.app.state.audioLevel > 0);
  assert.ok(h.uniformValues.get('uSubBass') > .05);
  assert.ok(h.app.texture.slice(0, 512).some(v => v > 0));
  assert.ok(h.connections.some(([from, to]) => from === 'local-file' && to === 'speakers'));
  assert.equal(h.connections.some(([from, to]) => from === 'analyser' && to === 'speakers'), false);
  h.signal(80, 0); h.tick(2);
  assert.equal(h.app.state.audioStatus, 'silent');
  assert.ok(h.uniformValues.get('uSubBass') < .01);
  assert.ok(h.app.texture.slice(0,512).every(v=>v===0),'silence clears the entire spectrum texture');
  assert.ok(h.app.texture.slice(512).every(v=>v===128),'silence gives shaders a centered flat waveform');
  h.signal(80, .24); h.tick(.3); assert.equal(h.app.state.audioStatus, 'live');
  await h.nodes.get('btn-play-pause').click(); h.tick(.6);
  assert.equal(h.app.state.audioStatus, 'paused');
  assert.ok(h.app.texture.slice(0, 512).every(v => v === 0), 'paused playback cannot keep a live spectrum');
  const pausedTime = h.uniformValues.get('uTime'); h.tick(1);
  assert.equal(h.uniformValues.get('uTime'), pausedTime, 'shader time freezes while file playback is paused');
  h.nodes.get('audio-el').error={code:4};h.tick(.5);
  assert.equal(h.app.state.audioStatus,'blocked','an unsupported file is not misreported as a live or merely paused source');
  assert.equal(h.nodes.get('signal-status').textContent,'This file could not play');
});

test('Spotify playback without capture stays waiting with zero FFT, never a fake preview loop', async () => {
  const h = await createApp();
  h.app.spotifyState.embedPlaying = true;
  h.app.setActiveSourceUI('spotify-embed', 'Spotify test');
  h.tick(3);
  assert.equal(h.app.state.audioStatus, 'waiting');
  assert.equal(h.app.state.audioLevel, 0);
  assert.ok(h.app.texture.slice(0, 512).every(v => v === 0));
  assert.equal(h.uniformValues.get('uBass'), 0);
  assert.equal(h.uniformValues.get('uHigh'), 0);
  assert.equal(h.app.state.bpmEstimate, 0, 'there is no song-title-based tempo guess');
  const waitingTime = h.uniformValues.get('uTime'); h.tick(1);
  assert.equal(h.uniformValues.get('uTime'), waitingTime, 'uncaptured playback cannot produce clock-driven fake motion');
});

test('capture analyzes real audio without speaker feedback and ending sharing releases its source', async () => {
  const h = await createApp(), audio = h.makeTrack('audio'), video = h.makeTrack('video');
  h.capture(new h.MediaStream([audio, video]));
  await h.app.startSystemAudio(); h.signal(1100, .2); h.tick(.5);
  assert.equal(h.captures[0].selfBrowserSurface,'include','the visualizer tab is available in the capture picker');
  assert.equal(h.captures[0].preferCurrentTab,false);
  assert.equal(h.app.state.audioStatus, 'live');
  assert.ok(h.uniformValues.get('uVocal') > 0);
  assert.equal(h.connections.some(([from, to]) => from === 'captured-stream' && to === 'speakers'), false);
  audio.end(); h.tick(1);
  assert.notEqual(h.app.state.audioStatus, 'live');
  assert.equal(video.readyState, 'ended');
  assert.ok(h.connections.some(([from, to]) => from === 'captured-stream' && to === 'disconnected'));
});

test('capture errors and video-only shares are honest about having no audio', async () => {
  const h = await createApp(), denial = new Error('Permission denied'); denial.name = 'NotAllowedError';
  h.capture(denial); await h.app.startSystemAudio(); h.tick(.5);
  assert.notEqual(h.app.state.audioStatus, 'live');
  assert.equal(h.app.state.audioLevel, 0);
  const video = h.makeTrack('video'); h.capture(new h.MediaStream([video]));
  await h.app.startSystemAudio(); h.tick(.5);
  assert.notEqual(h.app.state.audioStatus, 'live'); assert.equal(video.readyState, 'ended');
});

test('capturing Spotify audio keeps its player and transport active; ending returns to waiting', async () => {
  const h = await createApp(); let pauses = 0;
  h.app.spotifyState.embedPlaying = true;
  h.app.spotifyState.embedController = { pause() { pauses++; } };
  h.app.setActiveSourceUI('spotify-embed', 'Spotify test');
  const audio = h.makeTrack('audio'); h.capture(new h.MediaStream([audio, h.makeTrack('video')]));
  await h.app.startSystemAudio(); h.signal(200, .15); h.tick(.5);
  assert.equal(h.captures[0].selfBrowserSurface,'include');
  assert.equal(h.captures[0].preferCurrentTab,true,'Spotify playback makes this tab the preferred audio capture surface');
  assert.equal(pauses, 0, 'connecting live analysis does not pause the song');
  assert.equal(h.nodes.get('transport-bar').hidden, false);
  assert.equal(h.app.state.audioStatus, 'live');
  audio.end(); h.tick(.5);
  assert.equal(h.app.state.audioStatus, 'waiting');
  assert.equal(h.app.spotifyState.embedPlaying, true);
  assert.equal(pauses, 0);
});

test('a late ended event from a previous capture cannot stop the replacement stream', async () => {
  const h = await createApp(), oldAudio = h.makeTrack('audio'), newAudio = h.makeTrack('audio');
  h.capture(new h.MediaStream([oldAudio, h.makeTrack('video')])); await h.app.startSystemAudio();
  h.capture(new h.MediaStream([newAudio, h.makeTrack('video')])); await h.app.startSystemAudio();
  oldAudio.end(); h.signal(1800, .18); h.tick(.5);
  assert.equal(newAudio.readyState, 'live');
  assert.equal(h.app.state.audioStatus, 'live');
});

test('starting Spotify after capture keeps live input and reveals its transport controls', async () => {
  const h = await createApp(); let plays = 0;
  h.capture(new h.MediaStream([h.makeTrack('audio'), h.makeTrack('video')]));
  await h.app.startSystemAudio();
  h.app.spotifyState.embedController = { loadUri() {}, play() { plays++; }, pause() {} };
  await h.app.playSpotifyTrack({title:'Test track',artist:'Test artist',spotifyId:'abcdefghijklmnopqrstuv'},0,[],false);
  h.signal(440,.2); h.tick(.5);
  assert.equal(plays,1);
  assert.equal(h.app.state.sourceType,'system','real captured input remains connected');
  assert.equal(h.app.state.audioStatus,'live');
  assert.equal(h.app.spotifyState.captureWithSpotify,true);
  assert.equal(h.nodes.get('transport-bar').hidden,false,'Spotify controls remain visible in either connection order');
});

test('Stop sharing releases audio/video tracks and returns to idle or uncaptured Spotify', async () => {
  for(const spotifyPlaying of [false,true]) {
    const h=await createApp(),audio=h.makeTrack('audio'),video=h.makeTrack('video');
    let pauses=0;
    h.app.spotifyState.embedPlaying=spotifyPlaying;
    h.app.spotifyState.embedController={pause(){pauses++;}};
    h.capture(new h.MediaStream([audio,video]));await h.app.startSystemAudio();
    h.signal(220,.18);h.tick(.5);
    assert.equal(h.nodes.get('stop-capture').hidden,false);
    await h.nodes.get('stop-capture').click();h.tick(1);
    assert.equal(audio.readyState,'ended');assert.equal(video.readyState,'ended');
    assert.equal(h.nodes.get('stop-capture').hidden,true);
    assert.equal(h.app.state.audioStatus,spotifyPlaying?'waiting':'idle');
    assert.equal(h.nodes.get('transport-bar').hidden,!spotifyPlaying);
    assert.equal(h.app.spotifyState.captureWithSpotify,false);
    assert.equal(pauses,0,'stopping analysis never pauses Spotify playback');
    assert.ok(h.app.texture.slice(0,512).every(v=>v===0),'stopped capture has no stale spectrum');
    assert.ok(h.connections.some(([from,to])=>from==='captured-stream'&&to==='disconnected'));
    assert.equal(h.connections.some(([from,to])=>from==='captured-stream'&&to==='speakers'),false);
  }
});

test('settings and Spotify stay secondary, mutually exclusive drawers; focus mode is reversible', async () => {
  const h = await createApp();
  await h.nodes.get('toggle-drawer').click();
  assert.equal(h.nodes.get('custom-drawer').hidden, false);
  assert.equal(h.nodes.get('toggle-drawer').getAttribute('aria-expanded'), 'true');
  await h.nodes.get('top-spotify-btn').click();
  assert.equal(h.nodes.get('custom-drawer').hidden, true);
  assert.equal(h.nodes.get('spotify-drawer').hidden, false);
  await h.nodes.get('close-spotify').click();
  assert.equal(h.nodes.get('spotify-drawer').hidden, true);
  await h.nodes.get('zen-btn').click(); assert.equal(h.nodes.get('exit-zen').hidden, false);
  await h.nodes.get('exit-zen').click(); assert.equal(h.nodes.get('exit-zen').hidden, true);
});

test('Spotify playback presents a direct connect action without opening permission prompts automatically', async () => {
  const h=await createApp();let plays=0,pauses=0;
  h.app.spotifyState.embedController={loadUri(){},play(){plays++;},pause(){pauses++;}};
  await h.app.playSpotifyTrack({title:'Test song',artist:'Test artist',spotifyId:'abcdefghijklmnopqrstuv'},0,[],false);
  h.tick(.5);
  assert.equal(plays,1);assert.equal(pauses,0);
  assert.equal(h.captures.length,0,'async playback events must not request capture permissions');
  assert.equal(h.nodes.get('spotify-audio-guide').hidden,false,'missing audio connection is actionable beside the player');
  const button=h.nodes.get('connect-spotify-audio');
  assert.ok(button&&!button.hidden&&!button.disabled,'a playing Spotify song offers a visible connect button');
  await button.click();
  assert.equal(h.captures.length,1,'a deliberate user click opens the capture picker once');
  assert.equal(h.captures[0].selfBrowserSurface,'include');assert.equal(h.captures[0].preferCurrentTab,true);
  assert.equal(h.captures[0].audio.restrictOwnAudio,false,'the capture request does not exclude audio from this application');
  h.signal(440,.18);h.tick(.5);
  assert.equal(h.app.state.audioStatus,'live');assert.equal(h.nodes.get('spotify-audio-guide').hidden,true);
  assert.equal(h.nodes.get('transport-bar').hidden,false);assert.equal(pauses,0,'connecting visuals never stops Spotify');
});

test('cancelled Spotify audio connection preserves playback and provides a retry instead of pretending it is live',async()=>{
  const h=await createApp();let pauses=0;
  h.app.spotifyState.embedPlaying=true;h.app.spotifyState.embedController={pause(){pauses++;}};
  h.app.setActiveSourceUI('spotify-embed','Spotify test');h.tick(.1);
  const denied=new Error('The picker was cancelled');denied.name='NotAllowedError';h.capture(denied);
  await h.nodes.get('connect-spotify-audio').click();h.tick(1);
  assert.equal(h.app.state.audioStatus,'waiting');assert.equal(h.app.spotifyState.embedPlaying,true);
  assert.equal(h.nodes.get('transport-bar').hidden,false);assert.equal(h.nodes.get('spotify-audio-guide').hidden,false);
  assert.match(h.nodes.get('spotify-audio-help').textContent,/cancel|connect|share|permission/i);
  assert.equal(h.captures.length,1);assert.equal(pauses,0);
  h.tick(4);assert.equal(h.captures.length,1,'cancellation must not trigger a permission loop');
  h.capture(new h.MediaStream([h.makeTrack('audio'),h.makeTrack('video')]));
  await h.nodes.get('connect-spotify-audio').click();h.signal(900,.12);h.tick(.6);
  assert.equal(h.captures.length,2);assert.equal(h.app.state.audioStatus,'live');
});

test('unsupported browsers and video-only shares explain why Spotify cannot reach the analyzer',async()=>{
  const unsupported=await createApp({captureSupported:false});
  unsupported.app.spotifyState.embedPlaying=true;unsupported.app.setActiveSourceUI('spotify-embed','Spotify test');unsupported.tick(.5);
  assert.equal(unsupported.nodes.get('spotify-audio-guide').hidden,false);
  const copy=unsupported.nodes.get('spotify-audio-instructions').textContent+' '+unsupported.nodes.get('spotify-audio-help').textContent;
  assert.match(copy,/support|desktop|chrome|edge|file/i);
  await unsupported.app.startSystemAudio();unsupported.tick(.5);
  assert.equal(unsupported.app.state.audioStatus,'waiting');assert.equal(unsupported.captures.length,0);
  assert.equal(unsupported.app.spotifyState.embedPlaying,true);
  const h=await createApp();h.app.spotifyState.embedPlaying=true;h.app.setActiveSourceUI('spotify-embed','Spotify test');
  const video=h.makeTrack('video');h.capture(new h.MediaStream([video]));
  await h.nodes.get('connect-spotify-audio').click();h.tick(.5);
  assert.equal(video.readyState,'ended');assert.equal(h.app.spotifyState.embedPlaying,true);
  assert.equal(h.nodes.get('spotify-audio-guide').hidden,false);
  assert.match(h.nodes.get('spotify-audio-help').textContent,/audio|sound/i);
  assert.ok(h.app.texture.slice(0,512).every(v=>v===0));
});

test('a muted shared audio track and blocked context remain non-live and keep connection guidance available',async()=>{
  const h=await createApp();h.app.spotifyState.embedPlaying=true;h.app.setActiveSourceUI('spotify-embed','Spotify test');
  const audio=h.makeTrack('audio');audio.muted=true;h.capture(new h.MediaStream([audio,h.makeTrack('video')]));
  await h.nodes.get('connect-spotify-audio').click();h.signal(1000,.2);h.tick(4);
  assert.equal(h.app.state.audioStatus,'silent');assert.equal(h.app.state.audioLevel,0);
  assert.ok(h.app.texture.slice(0,512).every(v=>v===0),'muted track metadata gates any stale analyzer frame');
  assert.equal(h.nodes.get('spotify-audio-guide').hidden,false);
  assert.match(h.nodes.get('spotify-audio-help').textContent+' '+h.nodes.get('spotify-audio-instructions').textContent,/audio|sound|muted|share/i);
  const blocked=await createApp({contextState:'suspended',resumeReject:true});
  blocked.app.spotifyState.embedPlaying=true;blocked.app.setActiveSourceUI('spotify-embed','Spotify test');
  await blocked.nodes.get('connect-spotify-audio').click();blocked.signal(900,.2);blocked.tick(4);
  assert.equal(blocked.app.state.audioStatus,'blocked');assert.ok(blocked.app.texture.slice(0,512).every(v=>v===0));
  assert.equal(blocked.nodes.get('spotify-audio-guide').hidden,false);
});

test('Spotify reconnection guidance follows sustained silence and hides again when real captured audio returns',async()=>{
  const h=await createApp();
  h.app.spotifyState.embedPlaying=true;
  h.app.setActiveSourceUI('spotify-embed','Spotify test');
  await h.nodes.get('connect-spotify-audio').click();
  h.signal(900,.16);h.tick(1);
  assert.equal(h.app.state.audioStatus,'live');assert.equal(h.nodes.get('spotify-audio-guide').hidden,true);
  h.signal(900,0);h.tick(4);
  assert.equal(h.app.state.audioStatus,'silent');assert.equal(h.nodes.get('spotify-audio-guide').hidden,false);
  assert.match(h.nodes.get('connect-spotify-audio').textContent,/reconnect/i);
  assert.match(h.nodes.get('spotify-audio-instructions').textContent,/this Sonic Prism tab/i);
  assert.match(h.nodes.get('spotify-audio-instructions').textContent,/Share tab audio/i);
  assert.equal(h.captures.length,1,'quiet audio only offers guidance; it does not reopen permissions');
  h.signal(900,.16);h.tick(.8);
  assert.equal(h.app.state.audioStatus,'live');assert.equal(h.nodes.get('spotify-audio-guide').hidden,true);
  assert.equal(h.app.spotifyState.embedPlaying,true);assert.equal(h.captures.length,1);
});

const androidUserAgent = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/142.0.0.0 Mobile Safari/537.36';

test('Android presents microphone and local files instead of an unavailable tab-capture path', async () => {
  const h = await createApp({ captureSupported: false, userAgent: androidUserAgent });
  h.tick(.5);
  assert.equal(h.nodes.get('btn-system').hidden, true);
  assert.equal(h.nodes.get('capture-audio').hidden, true);
  assert.equal(h.nodes.get('btn-listen').hidden, false);
  assert.equal(h.nodes.get('listen-audio').hidden, false);
  assert.equal(h.microphones.length, 0, 'boot never opens a microphone permission prompt');
  assert.match(h.nodes.get('audio-source-help').textContent, /file|speaker|microphone/i);
  h.app.loadLocalFiles([{ name: 'phone-track.mp3', type: 'audio/mpeg' }]);
  await Promise.resolve(); h.signal(180, .2); h.tick(.6);
  assert.equal(h.app.state.sourceType, 'file');
  assert.equal(h.app.state.audioStatus, 'live');
  assert.equal(h.microphones.length, 0, 'local playback needs no microphone permission');
  assert.ok(h.connections.some(([from, to]) => from === 'local-file' && to === 'speakers'));
});

test('microphone is explicitly requested, analyzes real input and never monitors sound to the speakers', async () => {
  const h = await createApp({ captureSupported: false, userAgent: androidUserAgent });
  const track = h.makeTrack('audio'); h.microphone(new h.MediaStream([track]));
  await h.nodes.get('btn-listen').click(); h.signal(900, .2); h.tick(.6);
  assert.equal(h.microphones.length, 1);
  assert.equal(h.microphones[0].video, false, 'the microphone path never requests a camera');
  assert.ok(h.microphones[0].audio);
  assert.equal(h.app.state.sourceType, 'microphone');
  assert.equal(h.app.state.audioStatus, 'live');
  assert.match(h.nodes.get('signal-detail').textContent, /microphone/i);
  assert.equal(h.nodes.get('stop-capture').hidden, false);
  assert.match(h.nodes.get('stop-capture').textContent, /microphone/i);
  assert.ok(h.app.texture.slice(0, 512).some(value => value > 0));
  assert.equal(h.connections.some(([from, to]) => from === 'captured-stream' && to === 'speakers'), false);
  assert.equal(h.connections.some(([from, to]) => from === 'analyser' && to === 'speakers'), false);

  h.signal(900, 0); h.tick(2);
  assert.equal(h.app.state.audioStatus, 'silent');
  assert.ok(h.app.texture.slice(0, 512).every(value => value === 0));
  h.signal(900, .2); track.muted = true; h.tick(1);
  assert.notEqual(h.app.state.audioStatus, 'live', 'a muted microphone gates stale analyzer output');
  track.muted = false; h.tick(.6); assert.equal(h.app.state.audioStatus, 'live');
  await h.nodes.get('stop-capture').click(); h.tick(.6);
  assert.equal(track.readyState, 'ended');
  assert.equal(h.app.state.audioStatus, 'idle');
  assert.equal(h.nodes.get('stop-capture').hidden, true);
  assert.ok(h.connections.some(([from, to]) => from === 'captured-stream' && to === 'disconnected'));
});

test('microphone permission denial preserves the current file or Spotify playback', async () => {
  for (const previous of ['file', 'spotify-embed']) {
    const h = await createApp({ captureSupported: false, userAgent: androidUserAgent });
    let pauses = 0;
    if (previous === 'file') {
      h.app.loadLocalFiles([{ name: 'keep-playing.mp3', type: 'audio/mpeg' }]);
      await Promise.resolve();
    } else {
      h.app.spotifyState.embedPlaying = true;
      h.app.spotifyState.embedController = { pause() { pauses++; } };
      h.app.setActiveSourceUI('spotify-embed', 'Spotify test');
    }
    const denial = new Error('Microphone permission denied'); denial.name = 'NotAllowedError';
    h.microphone(denial); await h.app.startMicrophone(); h.tick(.6);
    assert.equal(h.app.state.sourceType, previous);
    assert.equal(h.nodes.get('audio-el').paused, previous !== 'file');
    assert.equal(pauses, 0);
    assert.equal(h.app.spotifyState.embedPlaying, previous === 'spotify-embed');
    assert.match(h.nodes.get('toast').textContent, /microphone|permission|allow/i);
  }
});

test('late microphone permission grants cannot replace a newer file or a stopped request', async () => {
  for (const cancelBy of ['file', 'stop']) {
    const h = await createApp({ captureSupported: false, userAgent: androidUserAgent });
    let resolveMicrophone;
    h.microphone(new Promise(resolve => { resolveMicrophone = resolve; }));
    const pending = h.app.startMicrophone();
    await Promise.resolve();
    assert.equal(h.microphones.length, 1);
    if (cancelBy === 'file') {
      h.app.loadLocalFiles([{ name: 'newer.mp3', type: 'audio/mpeg' }]);
      await Promise.resolve();
    } else h.app.stopCurrentSources();
    const late = h.makeTrack('audio'); resolveMicrophone(new h.MediaStream([late]));
    await pending; h.tick(.6);
    assert.equal(late.readyState, 'ended', 'an abandoned grant immediately releases its track');
    assert.equal(h.app.state.sourceType, cancelBy === 'file' ? 'file' : 'idle');
    assert.equal(h.nodes.get('btn-listen').disabled, false, 'an abandoned request cannot leave the control stuck');
  }
});

test('a microphone ended event releases input while unavailable microphones stay out of the interface', async () => {
  const h = await createApp({ captureSupported: false });
  const track = h.makeTrack('audio'); h.microphone(new h.MediaStream([track]));
  await h.app.startMicrophone(); h.signal(440, .2); h.tick(.5);
  track.end(); h.tick(.5);
  assert.equal(h.app.state.audioStatus, 'idle');
  assert.ok(h.app.texture.slice(0, 512).every(value => value === 0));
  for (const options of [{ microphoneSupported: false }, { secureContext: false }]) {
    const unsupported = await createApp({ captureSupported: false, ...options });
    assert.equal(unsupported.nodes.get('btn-listen').hidden, true);
    assert.equal(unsupported.nodes.get('listen-audio').hidden, true);
    await unsupported.app.startMicrophone();
    assert.equal(unsupported.microphones.length, 0);
  }
});

test('unsupported Spotify capture offers an explicit nearby-speaker microphone action', async () => {
  const h = await createApp({ captureSupported: false, userAgent: androidUserAgent });
  h.app.spotifyState.embedPlaying = true;
  h.app.setActiveSourceUI('spotify-embed', 'Spotify test'); h.tick(.5);
  assert.equal(h.microphones.length, 0);
  assert.equal(h.nodes.get('connect-spotify-audio').disabled, false);
  assert.match(h.nodes.get('connect-spotify-audio').textContent, /microphone|listen/i);
  assert.match(h.nodes.get('spotify-audio-instructions').textContent, /speaker|headphone/i);
  await h.nodes.get('connect-spotify-audio').click();
  assert.equal(h.microphones.length, 1);
  assert.equal(h.captures.length, 0);
});

test('mobile Spotify activation happens synchronously on the play gesture, before track resolution awaits', async () => {
  const h = await createApp({ captureSupported: false, userAgent: androidUserAgent });
  const calls = [];
  h.app.spotifyState.sdkPlayer = {
    activateElement() { calls.push('activate'); return Promise.resolve(); },
    togglePlay() { calls.push('toggle'); },
  };
  // A title without a Spotify ID takes the asynchronous resolution branch.
  const pending = h.app.playSpotifyTrack({ title: 'Unresolved track', artist: 'Test artist' }, 0, [], false);
  assert.deepEqual(calls, ['activate'], 'the browser activation call retains the original user gesture');
  await pending;
  h.app.spotifyState.activePlayer = 'sdk';
  h.app.setActiveSourceUI('spotify', 'Spotify ready');
  await h.nodes.get('btn-play-pause').click();
  assert.deepEqual(calls, ['activate', 'activate', 'toggle'], 'transport activates before starting the SDK player');
  assert.equal(h.microphones.length, 0);
  assert.equal(h.captures.length, 0);
});

test('Auto cycles only with live visible audio, blends once, and manual selection takes over', async () => {
  const h = await createApp();
  assert.equal(h.nodes.get('auto-mode').getAttribute('aria-pressed'), 'false');
  await h.nodes.get('auto-mode').click(); h.tick(25);
  assert.equal(h.app.state.autoMode, true);
  assert.equal(h.app.state.mode, 0, 'idle preview does not start a fake music-driven cycle');
  h.app.loadLocalFiles([{ name: 'auto.mp3', type: 'audio/mpeg' }]); await Promise.resolve();
  h.signal(180, .2); h.tick(19);
  await h.setHidden(true); h.tick(20);
  assert.equal(h.app.state.mode, 0, 'a hidden page does not jump ahead');
  await h.setHidden(false); h.tick(1.2);
  assert.equal(h.app.state.mode, 1);
  assert.equal(h.nodes.get('auto-mode').getAttribute('aria-pressed'), 'true');
  assert.ok(h.uniformValues.get('uOpacity') > .9, 'the old scene remains visible at the start of the fade');
  assert.equal(h.glCalls.filter(([name]) => name === 'createFramebuffer').length, 3, 'only one snapshot target is added to the feedback pair');
  assert.equal(h.glCalls.filter(([name, target]) => name === 'drawArrays' && target?.testFbo === 3).length, 1, 'the old scene is rendered into its snapshot exactly once');
  h.tick(.8);
  assert.ok(h.uniformValues.get('uOpacity') > .3 && h.uniformValues.get('uOpacity') < .7, 'the presentation pass fades the snapshot');
  const manual = h.elements.find(el => el.dataset.mode === '4' && el.classList.contains('mode-pill'));
  await manual.click(); h.tick(40);
  assert.equal(h.app.state.autoMode, false);
  assert.equal(h.nodes.get('auto-mode').getAttribute('aria-pressed'), 'false');
  assert.equal(h.app.state.mode, 4);
  assert.equal(h.glCalls.filter(([name, target]) => name === 'drawArrays' && target?.testFbo === 3).length, 1, 'manual selection cancels the active transition');
});

test('Auto waits during paused playback and reduced motion uses a clean cut', async () => {
  for (const reducedMotion of [false, true]) {
    const h = await createApp({ reducedMotion });
    h.app.loadLocalFiles([{ name: 'auto.mp3', type: 'audio/mpeg' }]); await Promise.resolve();
    h.signal(900, .2); h.tick(.6);
    await h.nodes.get('auto-mode').click(); h.tick(19);
    await h.nodes.get('btn-play-pause').click(); h.tick(30);
    assert.equal(h.app.state.mode, 0);
    await h.nodes.get('btn-play-pause').click(); h.tick(1.3);
    assert.equal(h.app.state.mode, 1);
    assert.equal(h.glCalls.filter(([name, target]) => name === 'drawArrays' && target?.testFbo === 3).length, reducedMotion ? 0 : 1);
  }
});
