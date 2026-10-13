// StudForge: the password gate in front of Claude.
//
// Calls to /api/studforge/idea spend real API credit, so the server keeps them locked until this
// browser has unlocked with the shared password (a 30-day HttpOnly cookie; see /api/studforge/auth).
// This module wraps fetch: when the idea route answers 401 { reason: 'locked' } it asks for the
// password in a small dialog, and on success repeats the original request. The Claude client
// (idea-ai.js) never needs to know; a cancelled dialog hands back the 401 and it forges locally.
(() => {
    const ROUTE = /\/api\/studforge\/idea(\?|$)/, AUTH = '/api/studforge/auth';
    const origFetch = window.fetch.bind(window);
    let pending = null;   // one dialog at a time; concurrent requests share its answer

    const css = `
.sfg-overlay { position: fixed; inset: 0; z-index: 10050; display: flex; align-items: center; justify-content: center; background: rgba(8, 11, 18, 0.72); backdrop-filter: blur(3px); padding: 16px; width: 100vw; height: 100dvh; max-width: none; max-height: none; margin: 0; border: 0; box-sizing: border-box; }
.sfg-overlay:not([open]) { display: none; }
.sfg-card { width: min(380px, 100%); background: var(--bg-card, #151a26); border: 1px solid var(--lego-yellow, #ffd500); border-radius: 12px; padding: 18px 18px 16px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6); font-family: var(--font-body, sans-serif); color: var(--text-secondary, #cfd6e4); }
.sfg-card h3 { margin: 0 0 6px; font-family: var(--font-heading, sans-serif); font-size: 13px; letter-spacing: 1.2px; color: var(--lego-yellow, #ffd500); }
.sfg-card p { margin: 0 0 12px; font-size: 13px; line-height: 1.45; }
.sfg-row { display: flex; gap: 8px; }
.sfg-row input { flex: 1; min-width: 0; padding: 9px 11px; border-radius: 8px; border: 1px solid var(--border-main, #2a3244); background: rgba(0, 0, 0, 0.35); color: #fff; font-size: 14px; font-family: var(--font-mono, monospace); }
.sfg-row input:focus { outline: none; border-color: var(--lego-yellow, #ffd500); }
.sfg-btn { padding: 9px 14px; border-radius: 8px; border: 1px solid var(--lego-yellow, #ffd500); background: var(--lego-yellow, #ffd500); color: #111; font-family: var(--font-heading, sans-serif); font-size: 11px; font-weight: 800; letter-spacing: 0.8px; cursor: pointer; white-space: nowrap; }
.sfg-btn[disabled] { opacity: 0.6; cursor: wait; }
.sfg-cancel { margin-top: 10px; background: none; border: none; color: var(--text-muted, #7c879c); font-family: var(--font-heading, sans-serif); font-size: 10px; letter-spacing: 0.8px; cursor: pointer; padding: 4px 0; }
.sfg-msg { min-height: 16px; margin-top: 8px; font-size: 12px; color: #ff6b6b; }
.sfg-msg.ok { color: #7ee787; }
.sfg-note { margin-top: 6px; font-size: 11px; color: var(--text-muted, #7c879c); }
.sfg-shake { animation: sfg-shake 0.35s; }
@keyframes sfg-shake { 25% { transform: translateX(-6px); } 50% { transform: translateX(6px); } 75% { transform: translateX(-3px); } }
`;

    /** Ask for the password; resolves true once the server has set the cookie, false on cancel. */
    function unlock() {
        if (pending) return pending;
        pending = new Promise((resolve) => {
            if (!document.getElementById('sfg-style')) { const s = document.createElement('style'); s.id = 'sfg-style'; s.textContent = css; document.head.appendChild(s); }
            // Stay visible above an already-open idea preview dialog. A body div
            // is inert underneath the browser's modal top layer regardless of z-index.
            const overlay = document.createElement('dialog'); overlay.className = 'sfg-overlay'; overlay.id = 'sfg-gate';
            overlay.innerHTML = `<form class="sfg-card" autocomplete="off">
                <h3>🔒 CLAUDE IS PASSWORD-PROTECTED</h3>
                <p>Designs from Claude cost real API credit, so they need the StudForge password.</p>
                <div class="sfg-row"><input type="password" name="password" placeholder="password" autocomplete="current-password" aria-label="StudForge password"><button type="submit" class="sfg-btn">UNLOCK</button></div>
                <div class="sfg-msg" aria-live="polite"></div>
                <div class="sfg-note">Remembered on this browser for 30 days.</div>
                <button type="button" class="sfg-cancel">NO THANKS, FORGE LOCALLY</button>
            </form>`;
            const form = overlay.querySelector('form'), input = overlay.querySelector('input'), btn = overlay.querySelector('.sfg-btn'), msg = overlay.querySelector('.sfg-msg');
            const done = (ok) => { overlay.remove(); pending = null; resolve(ok); };
            overlay.querySelector('.sfg-cancel').addEventListener('click', () => done(false));
            overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } });
            overlay.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const password = input.value;
                if (!password) { input.focus(); return; }
                btn.disabled = true; msg.className = 'sfg-msg'; msg.textContent = 'Checking…';
                try {
                    const res = await origFetch(AUTH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
                    if (res.ok) { msg.className = 'sfg-msg ok'; msg.textContent = 'Unlocked. Asking Claude…'; setTimeout(() => done(true), 350); return; }
                    msg.textContent = res.status === 429 ? 'Too many tries. Wait 15 minutes and try again.' : res.status === 503 ? 'Claude is not set up on this server yet.' : 'That is not the password.';
                    form.classList.remove('sfg-shake'); void form.offsetWidth; form.classList.add('sfg-shake');
                    input.select();
                } catch { msg.textContent = 'Could not reach the server. Try again.'; }
                finally { btn.disabled = false; }
            });
            document.body.appendChild(overlay);
            overlay.showModal();
            setTimeout(() => input.focus(), 50);
        });
        return pending;
    }

    window.fetch = async function (input, init) {
        const res = await origFetch(input, init);
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (!ROUTE.test(url) || res.status !== 401) return res;
        const data = await res.clone().json().catch(() => null);
        if (!data || data.reason !== 'locked') return res;
        const ok = await unlock();
        return ok ? origFetch(input, init) : res;
    };

    window.studForgeGate = { unlock, isUnlocked: async () => { try { const r = await origFetch(AUTH); const d = await r.json(); return !!d.unlocked; } catch { return false; } } };
})();
