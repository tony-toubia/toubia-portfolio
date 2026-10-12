// StudForge feature: "Claude in the loop".
// The engine picker in the create bar has three choices (the mode is persisted in localStorage):
//   OFF     "Quick": the local forge only.
//   BRIEF   "Claude plans it": a new idea is first sent to /api/studforge/idea, which asks Claude for a design brief (subject, style,
//           colours, scale, name, description) that the local engine then builds with one of its builders.
//   DESIGN  "Claude designs it": the idea is sent with { mode: 'blueprint' } and the engine's vocabulary (modules, parts, colours, the
//           knowledge base's subject data); Claude answers with a BLUEPRINT (blueprint.js) that the engine
//           assembles from primitives and modules: Claude designs the model, not just picks a builder. RE-FORGE
//           asks Claude for a different design (the variant number goes with the request). The subject's id goes
//           with it too: when the server has a real set of that subject compressed into a blueprint
//           (data/omr-blueprints/), Claude is shown it as an example of real construction and the design's
//           description credits the set ("Inspired by how real fire trucks are built (set ...)"). When the route has no
//           design (validation failed, rate limit) the idea falls back to BRIEF behaviour.
// Anything that goes wrong (no key, no route, timeout) falls back to the plain local forge, silently.
// Exposes studForge.ai = { mode, enabled, ask(prompt), design(prompt, variant), offline } for other features.
(() => {
    const KEY = 'studforge.ai.v1', ROUTE = '/api/studforge/idea';
    const MODES = ['off', 'brief', 'design'];
    // 'on' is what the older two-state chip saved: it means BRIEF.
    const readPref = () => { try { const v = localStorage.getItem(KEY); return v === 'on' || v === 'brief' ? 'brief' : v === 'design' ? 'design' : 'off'; } catch { return 'off'; } };
    const savePref = (mode) => { try { localStorage.setItem(KEY, mode === 'brief' ? 'on' : mode); } catch { /* private mode */ } };

    const css = `
/* ── idea-ai ── */
.sfai-chip.busy { opacity: 0.6; pointer-events: none; }
.sfai-chip.design { border-color: var(--lego-yellow, #ffd500); }
.sfai-take { font-size: 12px; margin-top: 4px; color: var(--lego-yellow, #ffd500); text-shadow: 0 1px 4px rgba(0,0,0,0.8); font-weight: 600; max-width: 520px; }
.sfai-take.local { color: var(--text-muted, #7a8599); font-weight: 600; font-size: 10px; letter-spacing: 1px; }
.sfai-take.designed strong { letter-spacing: 1px; font-size: 10px; display: block; opacity: 0.9; }
.sfai-take:empty { display: none; }
#btn-generate.sfai-asking { opacity: 0.85; }
#btn-generate.sfai-asking .sfai-spark { display: inline-block; animation: sfai-pulse 0.9s ease-in-out infinite; }
@keyframes sfai-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.35); opacity: 0.55; } }
@media (max-width: 600px) { .sfai-take { font-size: 10px; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .sfai-take.designed strong { display: inline; margin-right: 4px; } }
@media (max-height: 640px) { .sfai-take { display: none; } }
`;

    function init() {
        const sf = window.studForge;
        if (!sf || !sf.forge) return;
        const style = document.createElement('style'); style.id = 'sfai-style'; style.textContent = css; document.head.appendChild(style);

        let mode = readPref(), offline = false, busy = false;
        let cache = { prompt: null, brief: null }; // the last brief we asked for, so RE-FORGE in BRIEF mode never re-asks
        const enabled = () => mode !== 'off';

        /* ── the engine picker: Quick (the core's) · Claude plans it · Claude designs it ── */
        // Engine ids map onto the modes: quick → off, plan → brief, design → design. Picking a Claude engine on a
        // browser that has not unlocked asks for the password straight away; cancelling goes back to Quick.
        const ENGINE_MODE = { quick: 'off', plan: 'brief', design: 'design' }, MODE_ENGINE = { off: 'quick', brief: 'plan', design: 'design' };
        const plan = sf.registerEngine({ id: 'plan', icon: '✨', label: 'Claude plans it', short: 'Claude: plan', hint: 'Claude writes the brief, the engine builds it · about 5 s', order: 10 });
        const designE = sf.registerEngine({ id: 'design', icon: '✨', label: 'Claude designs it', short: 'Claude: design', hint: 'Claude lays out every section from real-set examples · slower', order: 20 });
        let unlocked = false;
        const paintLock = () => { plan.setLocked(!unlocked && !offline); designE.setLocked(!unlocked && !offline); };
        const gate = window.studForgeGate;
        if (gate) gate.isUnlocked().then((u) => { unlocked = u; paintLock(); });
        paintLock();
        const setMode = (m) => { mode = MODES.includes(m) ? m : 'brief'; savePref(mode); if (sf.engine !== MODE_ENGINE[mode]) sf.setEngine(MODE_ENGINE[mode]); paintTake(sf.model); };
        // The saved mode wins on load (older chips saved it); keep the picker in step. No password prompt on load.
        if (sf.engine !== MODE_ENGINE[mode]) sf.setEngine(MODE_ENGINE[mode]);
        sf.on('engine', async (id) => {
            mode = ENGINE_MODE[id] || 'off'; savePref(mode); paintTake(sf.model);
            if (mode === 'off' || unlocked || offline || !gate) return;
            const ok = await gate.unlock();
            if (ok) { unlocked = true; paintLock(); sf.toast('Claude unlocked on this browser'); }
            else if (sf.engine === id) sf.setEngine('quick');
        });

        /* ── the engine's vocabulary, so Claude maps onto what exists ── */
        const vocab = () => ({
            builders: ((window.FORGE && window.FORGE.builders) || []).map((b) => ({ kind: b.kind, keys: (b.keys || []).slice(0, 8) })),
            colors: Object.keys(window.LEGO_COLORS || {}),
            styles: Object.keys((sf.generator && sf.generator.styles) || {}),
        });
        /** What the knowledge base knows about the prompt's subject (real palette, piece budget, top parts), or null. */
        const subjectFor = (prompt) => {
            const K = window.FORGE && window.FORGE.knowledge, s = K && K.subjectFor ? K.subjectFor(prompt) : null;
            if (!s) return null;
            return { id: s.id, n: s.n, palette: (s.palette || []).slice(0, 8), pieces: s.pieces || null, parts: (s.parts || []).slice(0, 12).map((p) => [p[0], p[1]]) };
        };

        /** The route's answer, or null for "forge locally"; marks the session offline when the route cannot help at all. */
        async function call(payload, field) {
            try {
                const res = await fetch(ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
                // 404/405/501...: no such route on this server (static hosting); stop asking for the session.
                if (!res.ok && res.status !== 429 && res.status < 500 || res.status === 501) { offline = true; console.info('StudForge: idea route not available here, forging locally.'); return null; }
                const data = await res.json().catch(() => null);
                if (!data || data.source !== 'claude' || !data[field]) {
                    if (data && data.reason === 'no-key') { offline = true; console.info('StudForge: Claude not configured on this server, forging locally.'); }
                    else if (data && data.reason) console.info(`StudForge: no ${field} from Claude (${data.reason}).`);
                    return null;
                }
                return data;
            } catch {
                if (!offline) console.info('StudForge: idea route unreachable, forging locally.');
                return null;
            }
        }
        /** Ask the route for a brief. Resolves to the brief, or null for "forge locally". */
        async function ask(prompt) {
            prompt = String(prompt || '').trim().slice(0, 200);
            if (!prompt || offline) return null;
            const data = await call({ prompt, ...vocab() }, 'brief');
            return data ? data.brief : null;
        }
        /** Ask the route for a blueprint. Resolves to { blueprint, fixture }, or null (then try a brief, or forge locally). */
        async function design(prompt, variant = 0) {
            prompt = String(prompt || '').trim().slice(0, 200);
            const B = window.FORGE && window.FORGE.blueprint;
            if (!prompt || offline || !B) return null;
            const data = await call({ mode: 'blueprint', prompt, variant, ...B.vocab(), subject: subjectFor(prompt) }, 'blueprint');
            if (!data) return null;
            const v = B.validate(data.blueprint);
            if (!v.ok) { console.warn('StudForge: Claude\'s blueprint did not validate:', v.errors.join('; ')); return null; }
            return { blueprint: v.bp, fixture: !!data.fixture, example: data.example || null };
        }

        /* ── intercept the FORGE button and Enter: ask first, then forge with the brief or the blueprint ── */
        const btn = document.getElementById('btn-generate'), input = sf.promptInput;
        const restore = () => { btn.disabled = false; btn.classList.remove('sfai-asking'); sf.setPrompt(input.value); };
        const wait = (label) => { busy = true; btn.disabled = true; btn.classList.add('sfai-asking'); btn.innerHTML = `<span class="sfai-spark">✨</span> ${label}`; };
        async function forgeWithClaude(prompt) {
            wait('ASKING CLAUDE…');
            let brief = null;
            try { brief = await ask(prompt); } catch { brief = null; }
            cache = { prompt, brief };
            try {
                // The user's words stay the prompt (so RE-FORGE and the manifest keep them); the engine parses brief.subject.
                sf.forge(prompt, 0, brief ? { brief } : {});
            } catch (e) { console.error('StudForge ai forge', e); }
            finally { busy = false; restore(); }
        }
        /** DESIGN: a blueprint from Claude (a new one per variant), else the BRIEF path, else the local forge. */
        async function forgeWithDesign(prompt, variant) {
            wait(variant ? 'CLAUDE REDESIGNING…' : 'CLAUDE DESIGNING…');
            let built = false;
            try {
                const d = await design(prompt, variant);
                if (d) {
                    const model = sf.forge(prompt, variant, { blueprint: d.blueprint });
                    built = model && model.kind === 'blueprint';
                    if (built) console.info(`StudForge: Claude designed "${model.name}"${d.fixture ? ' (fixture)' : ''}: ${d.blueprint.ops.length} ops, ${model.bricks.length} pieces, struts: ${(model.anchor && model.anchor.struts) || 0}${d.example ? `, learning from real set ${d.example.setId} ${d.example.name} (LDraw model by ${(d.example.authors || []).join(', ') || 'unknown'}, ${d.example.licence})` : ''}`);
                }
                if (!built && !offline) {
                    // No design: the brief path (one brief per prompt, reused across variants like BRIEF mode).
                    if (prompt !== cache.prompt) cache = { prompt, brief: await ask(prompt) };
                    sf.forge(prompt, variant, cache.brief ? { brief: cache.brief } : {});
                    built = true;
                }
                if (!built) sf.forge(prompt, variant, {});
            } catch (e) { console.error('StudForge ai design', e); try { sf.forge(prompt, variant, {}); } catch { /* the core's own error path */ } }
            finally { busy = false; restore(); }
        }
        function intercept(e) {
            const prompt = input.value.trim();
            if (!enabled() || !prompt || busy || offline) return;
            const same = prompt === sf.state.prompt;
            if (mode === 'design') {
                // RE-FORGE asks Claude again for a different design, so every variant is a fresh idea.
                e.stopImmediatePropagation(); e.preventDefault();
                forgeWithDesign(prompt, same ? sf.state.variant + 1 : 0);
                return;
            }
            if (same) return; // RE-FORGE: the core keeps state.opts (with the brief) across variants
            if (prompt === cache.prompt) {
                if (!cache.brief) return; // we asked before and got nothing: let the core forge locally
                e.stopImmediatePropagation(); e.preventDefault();
                sf.forge(prompt, 0, { brief: cache.brief }); sf.setPrompt(prompt);
                return;
            }
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
            const bp = model && model.blueprint, brief = model && model.brief;
            take.classList.remove('local', 'designed'); take.textContent = '';
            if (bp) {
                take.classList.add('designed');
                const head = document.createElement('strong'); head.textContent = '✨ CLAUDE DESIGNED THIS';
                take.appendChild(head); take.appendChild(document.createTextNode(bp.tagline || bp.description || bp.name));
            }
            else if (brief) take.textContent = `✨ Claude's take: ${brief.tagline || brief.description || brief.subject}`;
            else if (enabled() && !offline) { take.classList.add('local'); take.textContent = 'LOCAL FORGE'; }
        }
        sf.on('model', paintTake);
        paintTake(sf.model);

        sf.ai = {
            get mode() { return mode; }, set mode(m) { setMode(m); },
            get enabled() { return enabled(); }, set enabled(v) { setMode(v ? 'brief' : 'off'); },
            ask, design, get offline() { return offline; },
        };
    }

    if (window.studForge) init();
    else document.addEventListener('studforge:ready', init, { once: true });
})();
