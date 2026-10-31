import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

// Execute the application rather than a copy of its state machine. Browser APIs are
// adapters here: this checks routing, signal state and uniforms, not WebGL pixels.
async function createApp() {
  const html = await fs.readFile('public/visualizer/index.html', 'utf8');
  const source = await fs.readFile('public/visualizer/visualizer.mjs', 'utf8');
  const nodes = new Map(), elements = [], windowEvents = new Map();
  const connections = [], uniformValues = new Map(), captures = [];
  let now = 0, frame = { frequency: 0, amplitude: 0 }, nextCapture, lastContext;

  class Element {
    constructor(tagName = 'div', attrs = '') {
      this.tagName = tagName.toUpperCase(); this.attrs = {}; this.dataset = {}; this.events = new Map();
      this.style = { setProperty(key, value) { this[key] = value; } }; this.children = [];
      this.textContent = ''; this.value = ''; this.hidden = /\bhidden(?:\s|$|>)/.test(attrs);
      this.paused = true; this.duration = 180; this.currentTime = 0; this.width = 0; this.height = 0;
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
    click() { return this.emit('click'); }
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
    constructor() { this.state = 'running'; this.sampleRate = 48000; this.destination = audioNode('speakers'); lastContext = this; }
    resume() { this.state = 'running'; return Promise.resolve(); }
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
  const window = { location, AudioContext, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, matchMedia: () => ({ matches: false }),
    addEventListener: (name, fn) => { if (!windowEvents.has(name)) windowEvents.set(name, []); windowEvents.get(name).push(fn); },
  };
  window.top = window;
  class TestURL extends URL { static createObjectURL() { return 'blob:test-track'; } static revokeObjectURL() {} }
  const stores = new Map();
  const audioModule = await import('../../public/visualizer/audio-reactivity.mjs');
  const context = vm.createContext({ ...audioModule, window, document, navigator: { mediaDevices: { async getDisplayMedia(options) { captures.push(options); if (nextCapture instanceof Error) throw nextCapture; return nextCapture || new MediaStream([makeTrack('audio'), makeTrack('video')]); } } },
    URL: TestURL, URLSearchParams, MediaStream, Uint8Array, Float32Array, Float64Array, TextEncoder, console,
    performance: { now: () => now }, requestAnimationFrame() {}, setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    matchMedia: window.matchMedia, localStorage: { getItem: key => stores.get(key) || '', setItem: (key, value) => stores.set(key, value), removeItem: key => stores.delete(key) },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
  });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '') + `\n;globalThis.testApp = { state, spotifyState, startSystemAudio, loadLocalFiles, playSpotifyTrack, stopCurrentSources, setActiveSourceUI, renderLoop, get texture() { return audioTexData; } };`, context);
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
  assert.equal(h.elements.filter(el => el.classList.contains('mode-pill')).length, 7);
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
