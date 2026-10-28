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
