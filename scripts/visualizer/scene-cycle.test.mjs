import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneCycle, setSceneAuto, selectScene, advanceScene, sceneBlendOpacity } from '../../public/visualizer/scene-cycle.mjs';

function advanceFor(cycle, seconds, options = { live: true, visible: true }) {
  const changes = [];
  for (let remaining = seconds; remaining > 1e-8; remaining -= 1 / 60) {
    const change = advanceScene(cycle, Math.min(remaining, 1 / 60), options);
    if (change) changes.push(change);
  }
  return changes;
}

test('Auto waits for twenty seconds of live audio, cycles all worlds and crossfades smoothly', () => {
  const cycle = createSceneCycle();
  selectScene(cycle, 5);
  advanceFor(cycle, 30);
  assert.equal(cycle.mode, 5, 'manual mode does not cycle');
  setSceneAuto(cycle, true);
  assert.deepEqual(advanceFor(cycle, 19.9), []);
  const changes = advanceFor(cycle, .2);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].from, 5);
  assert.equal(changes[0].to, 6);
  assert.equal(cycle.mode, 6);
  assert.ok(sceneBlendOpacity(cycle) > .95, 'the old scene initially remains almost opaque');
  advanceFor(cycle, .8);
  assert.ok(sceneBlendOpacity(cycle) > .4 && sceneBlendOpacity(cycle) < .6, 'the midpoint is a real blend');
  advanceFor(cycle, 1);
  assert.equal(sceneBlendOpacity(cycle), 0, 'the fade releases the previous scene');
  advanceFor(cycle, 18.2);
  assert.equal(cycle.mode, 0, 'the final world wraps to the first');
});

test('silence and hidden pages pause both the cycle timer and an in-progress fade', () => {
  const cycle = createSceneCycle();
  setSceneAuto(cycle, true);
  advanceFor(cycle, 19);
  advanceFor(cycle, 60, { live: false, visible: true });
  advanceFor(cycle, 60, { live: true, visible: false });
  assert.equal(cycle.mode, 0);
  assert.ok(cycle.elapsed >= 18.99 && cycle.elapsed <= 19.01);
  advanceFor(cycle, 1.2);
  assert.equal(cycle.mode, 1);
  const opacity = sceneBlendOpacity(cycle);
  advanceFor(cycle, 20, { live: false, visible: true });
  advanceFor(cycle, 20, { live: true, visible: false });
  assert.equal(sceneBlendOpacity(cycle), opacity);
  advanceFor(cycle, 2);
  assert.equal(sceneBlendOpacity(cycle), 0);
});

test('manual selection cancels Auto and any active fade, including selecting the current world', () => {
  const cycle = createSceneCycle();
  setSceneAuto(cycle, true);
  advanceFor(cycle, 20.2);
  assert.ok(sceneBlendOpacity(cycle) > 0);
  selectScene(cycle, 4);
  assert.equal(cycle.enabled, false);
  assert.equal(cycle.mode, 4);
  assert.equal(sceneBlendOpacity(cycle), 0);
  advanceFor(cycle, 50);
  assert.equal(cycle.mode, 4);
  setSceneAuto(cycle, true);
  selectScene(cycle, 4);
  assert.equal(cycle.enabled, false, 'reselecting the current tab also stops Auto');
});

test('invalid choices cannot change the current world or disable Auto', () => {
  const cycle = createSceneCycle();
  setSceneAuto(cycle, true);
  for (const mode of [-1, 7, 8, NaN, 3.5]) {
    selectScene(cycle, mode);
    assert.equal(cycle.mode, 0);
    assert.equal(cycle.enabled, true);
  }
});

test('reduced motion cycles with a clean cut and delayed frames never fast-forward the timer', () => {
  const cycle = createSceneCycle({ reducedMotion: true });
  setSceneAuto(cycle, true);
  advanceFor(cycle, 19.8);
  advanceScene(cycle, 300, { live: true, visible: true });
  assert.equal(cycle.mode, 0, 'a background-sized frame advances by at most a tenth of a second');
  advanceFor(cycle, .2);
  assert.equal(cycle.mode, 1);
  assert.equal(sceneBlendOpacity(cycle), 0, 'reduced motion never retains a fading image');
});
