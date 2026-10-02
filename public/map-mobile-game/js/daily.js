/**
 * Primal Hunt - the daily challenge.
 *
 * One Survival run a day, the same for everyone: the seed comes from the UTC
 * date, so the swarm, the monsters and every level-up offer arrive the same
 * way for all players, and the day picks the hunter. Play it as often as you
 * like; your best score goes on the global board (see the API in
 * src/app/api/primal-hunt/daily). Without a connection the challenge still
 * works and your best is kept on the device.
 */
window.PH = window.PH || {};

(() => {
  const API = '/api/primal-hunt/daily';
  const CLASSES = ['assault', 'trapper', 'medic', 'support'];
  const FIRST = Date.UTC(2026, 9, 2) / 86400000;     // Daily #1

  const store = {
    get(k, d) { try { const v = localStorage.getItem('ph.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ph.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

  const Daily = {
    /** Today's challenge: its date (UTC), number, seed and hunter. */
    today() {
      const day = new Date().toISOString().slice(0, 10);
      const n = Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000);
      return { day, number: n - FIRST + 1, seed: fnv('primal-hunt:' + day), classId: CLASSES[((n % 4) + 4) % 4] };
    },

    /** A random id for this device, so its best score replaces itself. */
    deviceId() {
      let id = store.get('device', null);
      if (!id) {
        id = (crypto.randomUUID && crypto.randomUUID()) ||
          'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });
        store.set('device', id);
      }
      return id;
    },

    initials() { return store.get('initials', ''); },
    setInitials(v) { store.set('initials', v); },

    /** This device's best for a day: { score, submitted, name }. */
    best(day) { const b = store.get('daily', null); return b && b.day === day ? b : null; },
    setBest(day, data) { store.set('daily', { day, ...(this.best(day) || {}), ...data }); },

    async board(day) {
      try {
        const r = await fetch(`${API}?day=${day}&device=${this.deviceId()}`, { cache: 'no-store' });
        if (r.status === 503) return { offline: true };
        const j = await r.json();
        return r.ok ? j : { error: j.error || 'unavailable' };
      } catch { return { offline: true }; }
    },

    async submit(entry) {
      try {
        const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...entry, deviceId: this.deviceId() }) });
        if (r.status === 503) return { offline: true };
        const j = await r.json();
        return r.ok ? j : { error: j.error || 'unavailable' };
      } catch { return { offline: true }; }
    },
  };

  PH.Daily = Daily;
})();
