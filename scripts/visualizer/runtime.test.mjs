import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

// Execute the application rather than a copy of its state machine. Browser APIs are
// adapters here: this checks routing, signal state and uniforms, not WebGL pixels.
async function createApp({ captureSupported = true, contextState = 'running', resumeReject = false } = {}) {
  const html = await fs.readFile('public/visualizer/index.html', 'utf8');
  const source = await fs.readFile('public/visualizer/visualizer.mjs', 'utf8');
  const uiSource = await fs.readFile('public/visualizer/visualizer-ui.mjs', 'utf8');
  const nodes = new Map(), elements = [], windowEvents = new Map();
  const connections = [], uniformValues = new Map(), captures = [];
  let now = 0, frame = { frequency: 0, amplitude: 0 }, nextCapture, lastContext;

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
    body: new Element('body'), documentElement: new Element('html'), activeElement: null,
    getElementById(id) { assert.ok(nodes.has(id), `application references missing #${id}`); return nodes.get(id); },
    querySelectorAll: selector => elements.filter(el => matches(el, selector)),
    createElement: tag => new Element(tag), addEventListener() {},
  };
  const gl = new Proxy({
    getShaderParameter: () => true, getProgramParameter: () => true,
    getUniformLocation: (_program, name) => name,
    uniform1f: (name, value) => uniformValues.set(name, value),
    uniform1i: (name, value) => uniformValues.set(name, value),
    getAttribLocation: () => 0,
  }, { get(target, name) { if (name in target) return target[name]; if (/^[A-Z_\d]+$/.test(name)) return 1; return () => ({}); } });

  const audioNode = label => ({ label, connect(target) { connections.push([label, target.label]); }, disconnect() { connections.push([label, 'disconnected']); } });
  class AudioContext {
    constructor() { this.state = contextState; this.sampleRate = 48000; this.destination = audioNode('speakers'); lastContext = this; }
    resume() { if(resumeReject)return Promise.reject(new Error('Audio context is blocked')); this.state = 'running'; return Promise.resolve(); }
    createAnalyser() {
      return { ...audioNode('analyser'), fftSize: 2048, frequencyBinCount: 1024,
        getByteFrequencyData(out) { out.fill(0); if (frame.amplitude) out[Math.round(frame.frequency * 2048 / 48000)] = Math.round(frame.amplitude * 800); },
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
  const window = { location, AudioContext, isSecureContext: true, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, matchMedia: () => ({ matches: false }),
    addEventListener: (name, fn) => { if (!windowEvents.has(name)) windowEvents.set(name, []); windowEvents.get(name).push(fn); },
  };
  window.top = window;
  class TestURL extends URL { static createObjectURL() { return 'blob:test-track'; } static revokeObjectURL() {} }
  const stores = new Map();
  const audioModule = await import('../../public/visualizer/audio-reactivity.mjs');
  const navigator = { userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0', mediaDevices: captureSupported ? { async getDisplayMedia(options) { captures.push(options); if (nextCapture instanceof Error) throw nextCapture; return nextCapture || new MediaStream([makeTrack('audio'), makeTrack('video')]); } } : {} };
  const context = vm.createContext({ ...audioModule, window, document, navigator,
    URL: TestURL, URLSearchParams, MediaStream, Uint8Array, Float32Array, Float64Array, TextEncoder, console,
    performance: { now: () => now }, requestAnimationFrame() {}, setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    matchMedia: window.matchMedia, localStorage: { getItem: key => stores.get(key) || '', setItem: (key, value) => stores.set(key, value), removeItem: key => stores.delete(key) },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
  });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '') + `\n;globalThis.testApp = { state, spotifyState, startSystemAudio, loadLocalFiles, playSpotifyTrack, stopCurrentSources, setActiveSourceUI, renderLoop, get texture() { return audioTexData; } };`, context);
  vm.runInContext(uiSource,context);
  const app = context.testApp;
  const tick = (seconds = 1 / 60) => { const steps = Math.ceil(seconds * 60); for (let i = 0; i < steps; i++) { now += 1000 / 60; app.renderLoop(now); } };
  await Promise.resolve();
  return { app, nodes, elements, windowEvents, uniformValues, captures, connections, tick, makeTrack, MediaStream,
    signal(frequency, amplitude) { frame = { frequency, amplitude }; },
    capture(value) { nextCapture = value; }, get audioContext() { return lastContext; },
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
  assert.equal(h.elements.filter(el => el.classList.contains('mode-pill')).length, 5);
});

test('keyboard world navigation wraps through the five choices and invalid retired ids cannot select a shader',async()=>{
  const h=await createApp(),tabs=h.elements.filter(el=>el.classList.contains('mode-pill'));
  await tabs[0].emit('keydown',{key:'End'});h.tick();
  assert.equal(h.app.state.mode,4);assert.equal(h.uniformValues.get('uMode'),4);
  await tabs[4].emit('keydown',{key:'ArrowRight'});h.tick();
  assert.equal(h.app.state.mode,0,'right wraps to the first choice');
  await tabs[0].emit('keydown',{key:'ArrowLeft'});h.tick();
  assert.equal(h.app.state.mode,4,'left wraps to the last remaining choice');
  await tabs[4].emit('keydown',{key:'Home'});h.tick();assert.equal(h.app.state.mode,0);
  for(const invalid of ['5','6','-1','NaN','3.5']){
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
