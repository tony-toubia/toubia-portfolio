import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'public/visualizer/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/visualizer/style.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/visualizer/visualizer.mjs'), 'utf8');

test('CSS enforces [hidden] { display: none !important } so modals and drawers actually hide', () => {
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
});

test('Removed synth demo, seed tracks, bass drop, and mic clutter from HTML and JS', () => {
  for (const removedId of ['btn-synth', 'btn-mic', 'btn-drop', 'synth-grooves', 'synth-label']) {
    assert.ok(!html.includes(`id="${removedId}"`), `HTML should not contain #${removedId}`);
    assert.ok(!js.includes(`'${removedId}'`), `JS should not reference #${removedId}`);
  }
  assert.ok(!js.includes('triggerKick'), 'JS should not contain procedural synth code');
});

test('All DOM IDs referenced via $(...) in visualizer.mjs exist in index.html or dynamic template', () => {
  const idMatches = [...js.matchAll(/\$\(\s*'([^']+)'\s*\)/g)].map(m => m[1]);
  const uniqueIds = [...new Set(idMatches)];
  assert.ok(uniqueIds.length >= 25, 'Should find all interactive DOM IDs');

  for (const id of uniqueIds) {
    assert.ok(
      html.includes(`id="${id}"`) || js.includes(`id="${id}"`),
      `Expected id="${id}" to exist in HTML or dynamic template`
    );
  }
});

test('All modals and drawers start with the hidden attribute in index.html', () => {
  for (const modalId of [
    'spotify-drawer',
    'spotify-auth-modal',
    'custom-drawer',
    'spotify-embed-dock',
    'transport-bar',
    'spotify-collection-banner',
    'sp-account-bar',
  ]) {
    const tagRegex = new RegExp(`<[^>]+id="${modalId}"[^>]*>`, 'i');
    const match = html.match(tagRegex);
    assert.ok(match, `Should find element #${modalId}`);
    assert.match(match[0], /\bhidden\b/, `#${modalId} must start hidden`);
  }
});

test('All 7 distinct visual modes (0..6) are wired in HTML and WebGL shader', () => {
  for (let m = 0; m <= 6; m++) {
    assert.ok(html.includes(`data-mode="${m}"`), `HTML should have mode pill ${m}`);
  }
  assert.ok(js.includes('uMode == 4'), 'Shader should implement Mode 4 (Synthwave Sun & 3D Grid)');
  assert.ok(js.includes('uMode == 5'), 'Shader should implement Mode 5 (Cyber Matrix & 3D City)');
  assert.ok(js.includes('MODE 6: VORONOI'), 'Shader should implement Mode 6 (Voronoi Bio-Cells)');
});

test('Every close button (x) has an explicit click listener in visualizer.mjs', () => {
  for (const closeBtnId of ['close-spotify', 'close-drawer', 'close-sp-modal', 'close-embed-dock']) {
    assert.ok(html.includes(`id="${closeBtnId}"`), `HTML has #${closeBtnId}`);
    assert.ok(js.includes(`$('${closeBtnId}')`), `JS binds listener to #${closeBtnId}`);
  }
});

test('Spotify OAuth Redirect URI defaults to canonical /visualizer and supports presets + env vars', () => {
  assert.ok(js.includes('return `${window.location.origin}/visualizer`;'), 'Default redirect URI is <origin>/visualizer');
  assert.ok(html.includes('id="sp-redirect-uri-input"'), 'HTML includes editable Redirect URI input');
  assert.ok(html.includes('id="btn-spotify-settings"'), 'HTML includes Spotify settings gear button');
  assert.ok(js.includes('sp_oauth_pending_redirect_uri'), 'Token exchange uses exact redirect_uri from authorize step');
});

test('AnalyserNode is never connected to audioCtx.destination (prevents double-play / feedback chaos on tab audio share) and 30s clip toggle is removed', () => {
  assert.ok(!js.includes('analyser.connect(audioCtx.destination)'), 'analyser must never connect to audioCtx.destination');
  assert.ok(js.includes('mediaElementSourceNode.connect(audioCtx.destination)'), 'local file media element connects directly to destination');
  for (const removed of ['sp-engine-direct', 'sp-engine-embed', 'btn-spotify-tab-sync']) {
    assert.ok(!html.includes(`id="${removed}"`), `HTML should not contain #${removed}`);
    assert.ok(!js.includes(`'${removed}'`), `JS should not reference #${removed}`);
  }
});

test('5-Stem Audio Decomposition (Sub/Kick, Bass, Vocal Formants/Pitch, Mid, Treble Spark) and 60 FPS Silent Hardware Analyser', () => {
  assert.ok(js.includes('function startSilentTrackAnalyser(buffer)'), 'Uses native 60 FPS AudioBufferSourceNode connected only to analyser');
  assert.ok(js.includes('src.connect(analyser)'), 'Silent track source connects to analyser without speaker output');
  for (const meterId of ['meter-sub', 'meter-bass', 'meter-vocal', 'meter-mid', 'meter-high']) {
    assert.ok(html.includes(`id="${meterId}"`), `HTML includes #${meterId}`);
  }
  for (const boostId of ['ctrl-bass-boost', 'ctrl-vocal-boost', 'ctrl-treble-boost']) {
    assert.ok(html.includes(`id="${boostId}"`), `HTML includes #${boostId}`);
    assert.ok(js.includes(`$('${boostId}')`), `JS binds #${boostId}`);
  }
  for (const uniformName of ['uSubBass', 'uBass', 'uVocal', 'uVocalPitch', 'uMid', 'uHigh', 'uKick', 'uTrebleSpark']) {
    assert.ok(js.includes(`'${uniformName}'`), `Passes uniform ${uniformName} to WebGL shaders`);
  }
});



