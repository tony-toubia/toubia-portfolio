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
// User-entered AI ideas now start with 1–3 reference-grounded layout sketches. A selected sketch's
// structure is signed by the server and copied into the full design; assembly faults get one repair.
// Errors keep the current kit open and explain what to do; they never silently substitute a generic model.
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
.sfconcept { color: #e8eef7; background: #101a2c; border: 1px solid #40516d; border-radius: 18px; width: min(1000px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 24px; box-sizing: border-box; }
.sfconcept::backdrop { background: #030917bd; }
.sfconcept h2 { margin: 0 0 8px; font-size: 24px; }
.sfconcept p { font-size: 14px; line-height: 1.5; }
.sfconcept label { display: block; font-size: 13px; margin: 14px 0 6px; }
.sfconcept textarea { width: 100%; min-height: 58px; box-sizing: border-box; border: 1px solid #52627b; border-radius: 8px; padding: 10px; background: #17243a; color: #fff; font: inherit; resize: vertical; }
.sfconcept button { cursor: pointer; border: 1px solid #52627b; border-radius: 9px; padding: 10px 16px; background: #22314b; color: #fff; font: inherit; }
.sfconcept button:disabled { opacity: .5; cursor: default; }
.sfconcept button:focus-visible, .sfconcept input:focus-visible, .sfconcept textarea:focus-visible { outline: 3px solid #ffd500; outline-offset: 3px; }
.sfconcept .sfconcept-close { float: right; }
.sfconcept .sfconcept-cards { display: grid; grid-template-columns: repeat(auto-fit,minmax(230px,1fr)); gap: 14px; margin: 16px 0; }
.sfconcept .sfconcept-card { text-align: left; padding: 12px; background: #17243a; }
.sfconcept-card[aria-pressed="true"] { border: 2px solid #ffd500; background: #24344c; }
.sfconcept-card svg { width: 100%; background: #e6ebf1; border-radius: 8px; }
.sfconcept-card strong { display: block; margin-top: 10px; font-size: 16px; }
.sfconcept-card p { font-size: 12px; margin: 8px 0; }
.sfconcept .sfconcept-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
.sfconcept .sfconcept-build { background: #ffd500; color: #182234; font-weight: 700; border-color: #ffd500; }
.sfconcept .sfconcept-reference { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
.sfconcept-reference img { max-width: 260px; max-height: 150px; padding: 10px; background: #fff; border-radius: 8px; object-fit: contain; }
.sfconcept-reference a { color: #91c8ff; display: block; font-size: 12px; margin: 4px 0; }
.sfconcept .sfconcept-status { min-height: 22px; color: #ffd500; }
.sfconcept-local-go { background: #24314a; color: #e8eef7; border: 1px solid #52627b; }
.sfconcept-preview-go { white-space: nowrap; }
@media (max-width: 600px) { .sfconcept { padding: 16px; } .sfconcept h2 { font-size: 21px; } .sfconcept .sfconcept-cards { grid-template-columns: 1fr; } .sfconcept-preview-go { order: 3; flex: 1; height: 46px; font-size: 13px; } }
`;

    function init() {
        const sf = window.studForge;
        if (!sf || !sf.forge) return;
        const style = document.createElement('style'); style.id = 'sfai-style'; style.textContent = css; document.head.appendChild(style);

        let mode = readPref(), offline = false, busy = false, lastReason = '';
        const enabled = () => mode !== 'off';

        /* ── the engine picker: Quick (the core's) · Claude plans it · Claude designs it ── */
        // Engine ids map onto the modes: quick → off, plan → brief, design → design. Picking a Claude engine on a
        // browser that has not unlocked asks for the password straight away; cancelling goes back to Quick.
        const ENGINE_MODE = { quick: 'off', plan: 'brief', design: 'design' }, MODE_ENGINE = { off: 'quick', brief: 'plan', design: 'design' };
        const plan = sf.registerEngine({ id: 'plan', icon: '✨', label: 'Preview ideas', short: 'Preview ideas', hint: 'Find the reference and choose a sketch before building', tiny: 'Reference → sketch → build', order: 10 });
        const designE = sf.registerEngine({ id: 'design', icon: '✨', label: 'Claude designs it', short: 'Claude: design', hint: 'Choose a reference-based sketch, then build the details', tiny: 'Choose a look first', order: 20 });
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
            lastReason = '';
            const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 70000);
            try {
                const res = await fetch(ROUTE, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
                // 404/405/501...: no such route on this server (static hosting); stop asking for the session.
                const data = await res.json().catch(() => null);
                lastReason = data && (data.reason || data.error) || (!res.ok ? 'unavailable' : '');
                if (res.status === 404 || res.status === 405 || res.status === 501) { offline = true; return null; }
                if (!data || data.source !== 'claude' || !data[field]) {
                    if (data && data.reason === 'no-key') { offline = true; console.info('StudForge: Claude not configured on this server, forging locally.'); }
                    else if (data && data.reason) console.info(`StudForge: no ${field} from Claude (${data.reason}).`);
                    return null;
                }
                return data;
            } catch {
                lastReason = 'unreachable';
                if (!offline) console.info('StudForge: idea route unreachable, forging locally.');
                return null;
            } finally { clearTimeout(timer); }
        }
        /** Ask the route for a brief. Resolves to the brief, or null for "forge locally". */
        async function ask(prompt) {
            prompt = String(prompt || '').trim().slice(0, 200);
            if (!prompt || offline) return null;
            const data = await call({ prompt, ...vocab() }, 'brief');
            return data ? data.brief : null;
        }
        /** Ask the route for a blueprint. Resolves to { blueprint, fixture }, or null (then try a brief, or forge locally). */
        async function design(prompt, variant = 0, approved = {}) {
            prompt = String(prompt || '').trim().slice(0, 200);
            const B = window.FORGE && window.FORGE.blueprint;
            if (!prompt || offline || !B) return null;
            const data = await call({ mode: 'blueprint', prompt, variant, ...B.vocab(), subject: subjectFor(prompt), ...approved }, 'blueprint');
            if (!data) return null;
            const v = B.validate(data.blueprint);
            if (!v.ok) { console.warn('StudForge: Claude\'s blueprint did not validate:', v.errors.join('; ')); return null; }
            return { blueprint: v.bp, fixture: !!data.fixture, example: data.example || null };
        }

        /* ── intercept the FORGE button and Enter: ask first, then forge with the brief or the blueprint ── */
        const btn = document.getElementById('btn-generate'), input = sf.promptInput;
        const previewButton = document.createElement('button'); previewButton.id = 'btn-preview-ideas'; previewButton.type = 'button'; previewButton.className = 'forge-btn sfconcept-preview-go'; previewButton.textContent = 'PREVIEW IDEAS'; previewButton.title = 'Choose the look and real reference before building';
        if (btn.parentNode) btn.parentNode.insertBefore(previewButton, btn);
        const paintGenerate = () => { btn.classList.remove('sfconcept-local-go'); if (mode === 'off') { btn.classList.add('sfconcept-local-go'); btn.textContent = 'QUICK BUILD'; btn.title = 'Build instantly with local shapes; use Preview ideas for reference-based design'; } else { btn.textContent = 'PREVIEW IDEAS'; btn.title = 'Review a sketch before building'; } previewButton.hidden = enabled(); };
        input.addEventListener('input', () => { if (!busy) paintGenerate(); });
        sf.on('engine', () => { if (!busy) paintGenerate(); }); sf.on('model', () => { if (!busy) paintGenerate(); });
        const restore = () => { btn.disabled = false; previewButton.disabled = false; btn.classList.remove('sfai-asking'); sf.setPrompt(input.value); paintGenerate(); };
        const wait = (label) => { busy = true; btn.disabled = true; btn.classList.add('sfai-asking'); btn.innerHTML = `<span class="sfai-spark">✨</span> ${label}`; };
        const dialog = document.createElement('dialog'); dialog.className = 'sfconcept'; dialog.setAttribute('aria-labelledby', 'sfconcept-title');
        dialog.innerHTML = `<button type="button" class="sfconcept-close" aria-label="Close idea previews">✕</button><h2 id="sfconcept-title">Choose the look</h2><p>Review the shape and colors before we build. These layout sketches become the structure of your model.</p><label for="sfconcept-prompt">Your idea</label><textarea id="sfconcept-prompt" maxlength="200"></textarea><label for="sfconcept-image">Use a reference image (optional)</label><input id="sfconcept-image" type="file" accept="image/png,image/jpeg,image/webp"><p class="sfconcept-status" role="status" aria-live="polite"></p><div class="sfconcept-reference"></div><div class="sfconcept-cards"></div><div class="sfconcept-actions"><button type="button" class="sfconcept-revise">Try different looks</button><button type="button" class="sfconcept-build" disabled>Build this idea</button></div>`;
        document.body.appendChild(dialog);
        const edit = dialog.querySelector('textarea'), upload = dialog.querySelector('input'), cards = dialog.querySelector('.sfconcept-cards'), reference = dialog.querySelector('.sfconcept-reference'), status = dialog.querySelector('.sfconcept-status'), build = dialog.querySelector('.sfconcept-build'), revise = dialog.querySelector('.sfconcept-revise');
        let revision = 0, selection = null, referenceImage = '', conceptPrompt = '', conceptVariant = 0;
        const message = () => ({ 'no-key': 'AI design is unavailable here. Your current kit is still open; you can use Quick for a local idea.', locked: 'Unlock the AI engine to plan this idea.', 'rate-limited': 'The designer is busy. Please try again shortly.', 'reference-unavailable': 'The official reference image could not be loaded. Add the actual image or try again.', 'concept-drift': 'The design changed the approved look. Please try this concept again.' }[lastReason] || 'I could not finish this design. Try again or revise the idea; your current kit is still open.');
        function controls(working) { revise.disabled = working; upload.disabled = working; edit.disabled = working; build.disabled = working || !selection; cards.querySelectorAll('button').forEach(b => b.disabled = working); }
        function closeConcepts() { revision++; selection = null; busy = false; controls(false); restore(); if (dialog.open) dialog.close(); }
        dialog.querySelector('.sfconcept-close').addEventListener('click', closeConcepts);
        dialog.addEventListener('cancel', e => { e.preventDefault(); closeConcepts(); });
        edit.addEventListener('input', () => { selection = null; build.disabled = true; status.textContent = 'Idea changed. Choose Try different looks to review new previews.'; });
        function paintReference(data) {
            reference.replaceChildren();
            const url = referenceImage || data.referenceImage;
            if (url) { const image = document.createElement('img'); image.src = url; image.alt = 'Actual visual reference for this idea'; image.addEventListener('error', () => { image.remove(); }); reference.appendChild(image); }
            const text = document.createElement('div');
            const identity = document.createElement('p'); identity.textContent = data.identity || 'Your idea'; text.appendChild(identity);
            for (const source of data.sources || []) {
                if (!/^https:\/\//.test(source.url || '')) continue;
                const a = document.createElement('a'); a.href = source.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = source.title || 'Reference source'; text.appendChild(a);
            }
            const note = document.createElement('p'); note.textContent = data.referenceStatus === 'image' ? 'Based on the actual reference image.' : data.referenceStatus === 'sources' ? 'Source-inspired: exact visual not yet confirmed. Add an image for a closer match.' : data.referenceStatus === 'unresolved' ? 'Exact reference needed.' : 'An original interpretation of your idea.'; text.appendChild(note); reference.appendChild(text);
        }
        async function previewConcepts(prompt, variant = 0) {
            const mine = ++revision; conceptPrompt = prompt; conceptVariant = variant; selection = null; cards.replaceChildren(); reference.replaceChildren();
            controls(true); wait('FINDING THE LOOK…'); status.textContent = 'Finding references and sketching a few directions…';
            try {
                const B = window.FORGE && window.FORGE.blueprint;
                const data = await call({ mode: 'concepts', prompt, variant, colors: Object.keys(window.LEGO_COLORS || {}), referenceImage: referenceImage || undefined }, 'concepts');
                if (mine !== revision || !dialog.open) return;
                if (!data || !B || !window.StudForgeConcept) { status.textContent = message(); return; }
                paintReference(data);
                status.textContent = data.message || 'Choose a sketch to continue.';
                for (const concept of data.concepts.slice(0, 3)) {
                    const checked = B.validate({ ...concept.sketch, name: concept.name });
                    if (!checked.ok || !concept.selection) continue;
                    const card = document.createElement('button'); card.type = 'button'; card.className = 'sfconcept-card'; card.setAttribute('aria-pressed', 'false');
                    card.innerHTML = window.StudForgeConcept.diagram(concept, window.LEGO_COLORS || {});
                    const title = document.createElement('strong'); title.textContent = concept.name; card.appendChild(title);
                    const desc = document.createElement('p'); desc.textContent = concept.description; card.appendChild(desc);
                    const features = document.createElement('p'); features.textContent = (concept.features || []).join(' · '); card.appendChild(features);
                    card.addEventListener('click', () => { selection = { ...concept, identity: data.identity, sources: data.sources, referenceStatus: data.referenceStatus }; cards.querySelectorAll('button').forEach(c => c.setAttribute('aria-pressed', String(c === card))); build.disabled = false; status.textContent = `${concept.name} selected. We’ll keep this shape and add the details.`; });
                    cards.appendChild(card);
                }
                if (!cards.childElementCount && data.concepts.length) status.textContent = 'The sketches could not be displayed. Please try again.';
            } catch { if (mine === revision) status.textContent = message(); }
            finally { if (mine === revision) { busy = false; restore(); controls(false); } }
        }
        revise.addEventListener('click', () => { const prompt = edit.value.trim(); if (!prompt) { edit.focus(); return; } sf.setPrompt(prompt); previewConcepts(prompt, conceptVariant + 1); });
        upload.addEventListener('change', async () => {
            const file = upload.files && upload.files[0]; selection = null; build.disabled = true;
            if (!file) { referenceImage = ''; return; }
            if (file.size > 800000 || !['image/png','image/jpeg','image/webp'].includes(file.type)) { status.textContent = 'Choose a PNG, JPEG or WebP image under 800 KB.'; upload.value = ''; return; }
            const reader = new FileReader();
            reader.onload = () => { referenceImage = String(reader.result); previewConcepts(edit.value.trim(), conceptVariant + 1); };
            reader.onerror = () => { status.textContent = 'The reference could not be read. Please try another image.'; };
            reader.readAsDataURL(file);
        });
        build.addEventListener('click', async () => {
            if (!selection || busy || edit.value.trim() !== conceptPrompt) return;
            const approved = selection, mine = ++revision, prompt = conceptPrompt;
            controls(true); wait('BUILDING YOUR LOOK…'); status.textContent = 'Adding the details and checking how the pieces fit…';
            try {
                let correction = '', previousBlueprint = null;
                for (let attempt = 0; attempt < 2; attempt++) {
                    const d = await design(prompt, conceptVariant, { selection: approved.selection, referenceImage: referenceImage || undefined, correction, previousBlueprint });
                    if (mine !== revision || !dialog.open) return;
                    if (!d) { if (lastReason === 'concept-drift' && !attempt) { correction = 'Your last answer changed the approved structure. Copy the approved structural operations exactly first, including the exact base, and only append details.'; status.textContent = 'Keeping your chosen shape while refining the design…'; continue; } status.textContent = message(); return; }
                    const metadata = { id: approved.id, name: approved.name, identity: approved.identity, sources: approved.sources || [], referenceStatus: approved.referenceStatus, sketch: approved.sketch };
                    const opts = { blueprint: d.blueprint, concept: metadata };
                    const candidate = sf.generator.generateFromPrompt(prompt, conceptVariant, opts), faults = window.StudForgeConcept.quality(candidate);
                    if (faults.length) { previousBlueprint = d.blueprint; correction = `Assembly check rejected the previous design: ${faults.join('; ')}. Correct the detail operations and their support, keeping the approved structure unchanged.`; if (!attempt) { status.textContent = 'Refining the details so the pieces connect cleanly…'; continue; } status.textContent = 'This version still needs refinement. Try another look or revise the idea; your current kit is still open.'; return; }
                    sf.setPrompt(prompt); sf.forge(prompt, conceptVariant, opts); closeConcepts(); return;
                }
            } catch { if (mine === revision) status.textContent = message(); }
            finally { if (mine === revision) { busy = false; restore(); controls(false); } }
        });
        async function chooseConcepts(prompt, variant) {
            // Ask outside the chooser first; the password gate remains the only way to unlock AI.
            if (gate && !unlocked && !offline) {
                busy = true; previewButton.disabled = true; wait('UNLOCKING…');
                const ok = await gate.isUnlocked() || await gate.unlock();
                busy = false; restore();
                if (!ok) { sf.toast('Your current kit is still open. Use Quick build or try Preview ideas again.'); return; }
                unlocked = true; paintLock();
            }
            referenceImage = ''; upload.value = ''; edit.value = prompt;
            if (!dialog.open) dialog.showModal();
            previewConcepts(prompt, variant);
        }
        previewButton.addEventListener('click', async () => {
            const prompt = input.value.trim(); if (busy) return; if (!prompt) { input.focus(); sf.toast('Describe an idea to preview.'); return; }
            if (gate && !unlocked && !offline) { const ok = await gate.isUnlocked() || await gate.unlock(); if (!ok) return; unlocked = true; paintLock(); }
            setMode('design'); chooseConcepts(prompt, prompt === sf.state.prompt ? sf.state.variant + 1 : 0);
        });
        paintGenerate();
        function intercept(e) {
            const prompt = input.value.trim();
            if (!enabled() || !prompt) return;
            e.stopImmediatePropagation(); e.preventDefault();
            if (busy) return;
            const same = prompt === sf.state.prompt;
            chooseConcepts(prompt, same ? sf.state.variant + 1 : 0);
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
