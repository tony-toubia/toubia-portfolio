/**
 * Primal Hunt - player settings, kept on the device ('ph.settings').
 *
 *   quality       'auto' (measure and adapt), 'high' (never lower) or 'low'
 *   reduceMotion  less screen shake, no camera push-ins or zoom punches
 *   cbSafe        attack warnings in a colour-blind-safe palette: yellow for
 *                 what can hurt you, blue for what is yours
 *   bigHud        larger HUD text and bars
 */
window.PH = window.PH || {};

(() => {
  const KEY = 'ph.settings';
  const DEFAULTS = { quality: 'auto', reduceMotion: false, cbSafe: false, bigHud: false };
  let v = { ...DEFAULTS };
  try { v = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { /* private mode */ }
  // Respect the system's reduced-motion preference the first time.
  try { if (localStorage.getItem(KEY) === null && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) v.reduceMotion = true; } catch { /* old browsers */ }
  const listeners = [];

  PH.Settings = {
    get v() { return v; },
    set(k, val) {
      v = { ...v, [k]: val };
      try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ }
      for (const fn of listeners) fn(k, val);
    },
    on(fn) { listeners.push(fn); },
  };
})();
