// Scene timing uses visible, live-audio seconds, never wall-clock timers.
export function createSceneCycle({ modeCount = 7, duration = 20, fadeDuration = 1.8, reducedMotion = false } = {}) {
  return { mode: 0, enabled: false, elapsed: 0, transition: null, modeCount, duration, fadeDuration, reducedMotion };
}

export function setSceneAuto(cycle, enabled) {
  cycle.enabled = Boolean(enabled);
  cycle.elapsed = 0;
}

export function selectScene(cycle, mode, { automatic = false } = {}) {
  if (!Number.isInteger(mode) || mode < 0 || mode >= cycle.modeCount) return false;
  if (!automatic) {
    setSceneAuto(cycle, false);
    cycle.transition = null;
  }
  if (mode === cycle.mode) return false;
  const from = cycle.mode;
  cycle.mode = mode;
  cycle.elapsed = 0;
  cycle.transition = automatic && !cycle.reducedMotion && cycle.fadeDuration > 0
    ? { from, to: mode, elapsed: 0 } : null;
  return true;
}

export function advanceScene(cycle, dt, { live = false, visible = true } = {}) {
  if (!live || !visible || !Number.isFinite(dt) || dt <= 0) return null;
  // Returning from a background tab must not skip several worlds at once.
  const step = Math.min(dt, 0.1);
  if (cycle.transition) {
    cycle.transition.elapsed += step;
    if (cycle.transition.elapsed >= cycle.fadeDuration) cycle.transition = null;
  }
  if (!cycle.enabled) return null;
  cycle.elapsed += step;
  if (cycle.elapsed + 1e-8 < cycle.duration || cycle.transition) return null;
  const from = cycle.mode;
  const to = (from + 1) % cycle.modeCount;
  if (!selectScene(cycle, to, { automatic: true })) return null;
  return { from, to };
}

export function sceneBlendOpacity(cycle) {
  if (!cycle.transition) return 0;
  const t = Math.min(1, Math.max(0, cycle.transition.elapsed / cycle.fadeDuration));
  return 1 - t * t * (3 - 2 * t);
}
