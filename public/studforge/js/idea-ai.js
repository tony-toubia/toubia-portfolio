// StudForge feature: "Claude in the loop".
// With the chip ON, a new idea is first sent to /api/studforge/idea, which asks Claude for a
// design brief (subject, style, colours, scale, name, description) that the local engine then
// builds. Anything that goes wrong (no key, no route, rate limit, timeout) falls back to the
// plain local forge, silently. Exposes studForge.ai = { enabled, ask(prompt) } for other features.
(() => {
    const KEY = 'studforge.ai.v1', ROUTE = '/api/studforge/idea';
    const readPref = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
    const savePref = (on) => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ } };

    const css = `
/* ── idea-ai ── */
.sfai-chip.busy { opacity: 0.6; pointer-events: none; }
.sfai-take { font-size: 12px; margin-top: 4px; color: var(--lego-yellow, #ffd500); text-shadow: 0 1px 4px rgba(0,0,0,0.8); font-weight: 600; max-width: 520px; }
.sfai-take.local { color: var(--text-muted, #7a8599); font-weight: 600; font-size: 10px; letter-spacing: 1px; }
.sfai-take:empty { display: none; }
#btn-generate.sfai-asking { opacity: 0.85; }
#btn-generate.sfai-asking .sfai-spark { display: inline-block; animation: sfai-pulse 0.9s ease-in-out infinite; }
@keyframes sfai-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.35); opacity: 0.55; } }
@media (max-width: 600px) { .sfai-take { font-size: 10px; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } }
@media (max-height: 640px) { .sfai-take { display: none; } }
`;

    function init() {
        const sf = window.studForge;
        if (!sf || !sf.forge) return;
        const style = document.createElement('style'); style.id = 'sfai-style'; style.textContent = css; document.head.appendChild(style);

        let enabled = readPref(), offline = false, busy = false;
        let cache = { prompt: null, brief: null }; // the last brief we asked for, so RE-FORGE never re-asks

        /* ── dock chip ── */
        const chip = document.createElement('button');
        chip.className = 'tool-chip sfai-chip'; chip.type = 'button';
        chip.title = 'Let Claude turn your idea into a design brief before the forge builds it';
        const paint = () => { chip.classList.toggle('on', enabled); chip.innerHTML = `<span>✨</span> CLAUDE: ${enabled ? 'ON' : 'OFF'}`; };
        chip.addEventListener('click', () => { enabled = !enabled; savePref(enabled); paint(); paintTake(sf.model); });
        paint(); sf.dock(chip);

        /* ── the engine's vocabulary, so Claude maps onto what exists ── */
        const vocab = () => ({
            builders: ((window.FORGE && window.FORGE.builders) || []).map((b) => ({ kind: b.kind, keys: (b.keys || []).slice(0, 8) })),
            colors: Object.keys(window.LEGO_COLORS || {}),
            styles: Object.keys((sf.generator && sf.generator.styles) || {}),
        });

        /** Ask the route for a brief. Resolves to the brief, or null for "forge locally". */
        async function ask(prompt) {
            prompt = String(prompt || '').trim().slice(0, 200);
            if (!prompt || offline) return null;
            try {
                const res = await fetch(ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, ...vocab() }) });
                // 404/405/501...: no such route on this server (static hosting); stop asking for the session.
                if (!res.ok && res.status !== 429 && res.status < 500 || res.status === 501) { offline = true; console.info('StudForge: idea route not available here, forging locally.'); return null; }
                const data = await res.json().catch(() => null);
                if (!data || data.source !== 'claude' || !data.brief) {
                    if (data && data.reason === 'no-key') { offline = true; console.info('StudForge: Claude not configured on this server, forging locally.'); }
                    return null;
                }
                return data.brief;
            } catch {
                if (!offline) console.info('StudForge: idea route unreachable, forging locally.');
                return null;
            }
        }

        /* ── intercept the FORGE button and Enter: ask first, then forge with the brief ── */
        const btn = document.getElementById('btn-generate'), input = sf.promptInput;
        const restore = () => { btn.disabled = false; btn.classList.remove('sfai-asking'); sf.setPrompt(input.value); };
        async function forgeWithClaude(prompt) {
            busy = true;
            btn.disabled = true; btn.classList.add('sfai-asking'); btn.innerHTML = `<span class="sfai-spark">✨</span> ASKING CLAUDE…`;
            let brief = null;
            try { brief = await ask(prompt); } catch { brief = null; }
            cache = { prompt, brief };
            try {
                // The user's words stay the prompt (so RE-FORGE and the manifest keep them); the engine parses brief.subject.
                sf.forge(prompt, 0, brief ? { brief } : {});
            } catch (e) { console.error('StudForge ai forge', e); }
            finally { busy = false; restore(); }
        }
        function intercept(e) {
            const prompt = input.value.trim();
            if (!enabled || !prompt || busy) return;
            if (prompt === sf.state.prompt) return; // RE-FORGE: the core keeps state.opts (with the brief) across variants
            if (prompt === cache.prompt) {
                if (!cache.brief) return; // we asked before and got nothing: let the core forge locally
                e.stopImmediatePropagation(); e.preventDefault();
                sf.forge(prompt, 0, { brief: cache.brief }); sf.setPrompt(prompt);
                return;
            }
            if (offline) return;
            e.stopImmediatePropagation(); e.preventDefault();
            forgeWithClaude(prompt);
        }
        document.addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('#btn-generate')) intercept(e); }, true);
        document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === input) intercept(e); }, true);

        /* ── "Claude's take" under the model description ── */
        const desc = document.getElementById('model-desc');
        const take = document.createElement('p'); take.className = 'sfai-take';
        if (desc && desc.parentNode) desc.parentNode.insertBefore(take, desc.nextSibling);
        function paintTake(model) {
            const brief = model && model.brief;
            if (brief) { take.classList.remove('local'); take.textContent = `✨ Claude's take: ${brief.tagline || brief.description || brief.subject}`; }
            else if (enabled && !offline) { take.classList.add('local'); take.textContent = 'LOCAL FORGE'; }
            else take.textContent = '';
        }
        sf.on('model', paintTake);
        paintTake(sf.model);

        sf.ai = { get enabled() { return enabled; }, set enabled(v) { enabled = !!v; savePref(enabled); paint(); }, ask, get offline() { return offline; } };
    }

    if (window.studForge) init();
    else document.addEventListener('studforge:ready', init, { once: true });
})();
