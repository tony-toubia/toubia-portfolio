// StudForge design knowledge: what real sets of a given subject are built from.
//
// Loads `data/knowledge.json` (mined from open Rebrickable inventories by
// scripts/studforge-mine-knowledge.mjs, schema documented there) into
// `window.STUDFORGE_KNOWLEDGE` and exposes `window.FORGE.knowledge`:
//   subjectFor(prompt) → the best matching subject entry ({ id, keys, parts, wanted, palette, pieces, ... }) or null
//   palette(subject)   → [[colorId, share], ...] or null      (subject: an id string or an entry)
//   parts(subject)     → [[partId, setShare, medianQty], ...] or null
//   wanted(subject), pieces(subject), pairings(), wheelTyre(), onReady(fn)
// Everything is null until the file has loaded; `document` gets a `studforge:knowledge`
// event when it has. If the file is missing nothing breaks: every query returns null.
(function () {
    window.STUDFORGE_KNOWLEDGE = null;
    window.FORGE = window.FORGE || { builders: [], helpers: {} };

    const data = () => window.STUDFORGE_KNOWLEDGE;
    const entry = (subject) => {
        const d = data(); if (!d || !subject) return null;
        if (typeof subject === 'object') return subject;
        const e = d.subjects[subject]; return e ? Object.assign({ id: subject }, e) : null;
    };

    // Same reading of a prompt as the generator: lowercase words plus naive singulars, and the
    // subject is whatever comes before the first preposition ("fire truck with a ladder").
    const singular = (w) => (w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 3 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
    function subjectFor(prompt) {
        const d = data(); if (!d || !prompt) return null;
        const text = String(prompt).toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!text) return null;
        const words = text.split(' '), sing = words.map(singular);
        const padded = ' ' + text + ' ' + sing.join(' ') + ' ';
        const m = text.match(/^(.*?)\s(with|on|in|near|at|by|under|over|beside|next to|from|eating|holding|carrying|riding|wearing|behind|above|inside)\s/);
        const head = ' ' + (m ? m[1] : text) + ' ';
        const last = sing[sing.length - 1];
        let best = null, bestScore = -Infinity;
        for (const [id, e] of Object.entries(d.subjects)) {
            for (const k of e.keys) {
                if (!padded.includes(' ' + k + ' ')) continue;
                // Longer and multi-word keys win ("fire truck" over "truck"), keys in the head of the
                // prompt win over ones in a trailing clause, the head noun wins, whole themes lose ties.
                let score = k.length + (k.includes(' ') ? 4 : 0) + (head.includes(' ' + k + ' ') || head.includes(' ' + k + 's ') ? 6 : 0) + (last === k || k.endsWith(' ' + last) ? 5 : 0) - (id.startsWith('theme') ? 2 : 0) - padded.indexOf(' ' + k + ' ') / 100;
                if (score > bestScore) { bestScore = score; best = Object.assign({ id, key: k }, e); }
            }
        }
        return best;
    }

    window.FORGE.knowledge = {
        get ready() { return !!data(); },
        get data() { return data(); },
        subjectFor,
        palette: (s) => { const e = entry(s); return e ? e.palette : null; },
        parts: (s) => { const e = entry(s); return e ? e.parts : null; },
        wanted: (s) => { const e = entry(s); return e ? e.wanted : null; },
        pieces: (s) => { const e = entry(s); return e ? e.pieces : null; },
        pairings: () => (data() ? data().pairings : null),
        wheelTyre: () => (data() ? data().wheelTyre : null),
        onReady(fn) { if (data()) fn(data()); else document.addEventListener('studforge:knowledge', () => fn(data()), { once: true }); },
    };

    if (typeof fetch !== 'function' || typeof document === 'undefined') return;
    // Relative to the page, so it works wherever index.html is served from.
    fetch('data/knowledge.json', { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
            if (!j || typeof j !== 'object' || !j.subjects) return;
            window.STUDFORGE_KNOWLEDGE = j;
            document.dispatchEvent(new CustomEvent('studforge:knowledge', { detail: j }));
        })
        .catch(() => { /* no knowledge file: the generator keeps its built-in defaults */ });
})();
