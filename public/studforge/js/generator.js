// Natural language prompt -> LEGO blueprint.
//
// The prompt is read for its subject (which picks a builder), colours, a
// style, a scale and any extra wishes. The builder paints a stud grid, the
// grid is tiled into real bricks and plates (forge-grid.js), and the result
// is named and described from what was actually built. The same prompt always
// forges the same model; a different `variant` re-rolls the random choices.
// With the real-set knowledge loaded (knowledge.js) a subject with no colour
// words takes the palette real sets of it use, and a model with no size word is
// forged once more at a nudged scale when its piece count is far from theirs.
class BrickGenerator {
    constructor() {
        // Only unambiguous colour words: "forest", "rose" or "stone" are subjects, not colours.
        this.colorWords = {
            red: 'RED', crimson: 'DARK_RED', scarlet: 'RED', maroon: 'DARK_RED', burgundy: 'DARK_RED',
            blue: 'BLUE', azure: 'BLUE', navy: 'DARK_BLUE', cobalt: 'DARK_BLUE', teal: 'BLUE', cyan: 'TRANS_BLUE', turquoise: 'BLUE',
            yellow: 'YELLOW', gold: 'GOLD', golden: 'GOLD', lemon: 'YELLOW', mustard: 'YELLOW',
            green: 'GREEN', lime: 'LIME', olive: 'GREEN', mint: 'LIME',
            orange: 'ORANGE', amber: 'ORANGE', peach: 'ORANGE',
            white: 'WHITE', ivory: 'WHITE', cream: 'TAN',
            black: 'BLACK', charcoal: 'DARK_GREY', ebony: 'BLACK',
            grey: 'LIGHT_GREY', gray: 'LIGHT_GREY', silver: 'LIGHT_GREY', chrome: 'LIGHT_GREY', slate: 'DARK_GREY',
            brown: 'BROWN', wooden: 'BROWN', chocolate: 'BROWN', copper: 'BROWN', bronze: 'BROWN',
            tan: 'TAN', beige: 'TAN', khaki: 'TAN',
            purple: 'PURPLE', violet: 'PURPLE', lavender: 'PURPLE', magenta: 'PINK', pink: 'PINK',
        };
        this.shortColor = { RED: 'Red', DARK_RED: 'Dark Red', BLUE: 'Blue', DARK_BLUE: 'Navy', YELLOW: 'Yellow', GOLD: 'Gold', GREEN: 'Green', LIME: 'Lime', ORANGE: 'Orange', WHITE: 'White', BLACK: 'Black', LIGHT_GREY: 'Grey', DARK_GREY: 'Dark Grey', BROWN: 'Brown', TAN: 'Tan', PURPLE: 'Purple', PINK: 'Pink', TRANS_BLUE: 'Neon Blue', TRANS_ORANGE: 'Amber', TRANS_RED: 'Ruby', TRANS_CLEAR: 'Crystal' };
        // Words that name a whole family; a more specific key in the same prompt wins over them.
        this.generic = new Set(['tree', 'house', 'car', 'boat', 'ship', 'plane', 'bird', 'fish', 'tower', 'figure', 'robot', 'space', 'truck', 'bike', 'flower', 'bug', 'vehicle', 'monster', 'person', 'man', 'woman', 'character', 'hero']);
        this.styles = {
            cyberpunk: { words: ['cyberpunk', 'cyber', 'neon', 'futuristic', 'sci-fi', 'scifi', 'hi-tech', 'high-tech', 'synthwave'], P: { primary: 'BLACK', secondary: 'DARK_GREY', accent: 'TRANS_BLUE', trim: 'PURPLE', glass: 'TRANS_BLUE', ground: 'DARK_GREY', roof: 'DARK_GREY', light: 'TRANS_BLUE' }, word: 'Cyber' },
            medieval: { words: ['medieval', 'stone', 'castle', 'gothic', 'ancient', 'old', 'fantasy', 'kingdom', 'dungeon'], P: { primary: 'LIGHT_GREY', secondary: 'DARK_GREY', accent: 'DARK_RED', trim: 'BROWN', roof: 'DARK_RED' }, word: 'Medieval' },
            steampunk: { words: ['steampunk', 'victorian', 'brass', 'clockwork'], P: { primary: 'BROWN', secondary: 'GOLD', accent: 'DARK_RED', trim: 'GOLD', metal: 'GOLD', roof: 'DARK_GREY' }, word: 'Steampunk' },
            cozy: { words: ['cozy', 'cosy', 'rustic', 'alpine', 'country', 'quaint', 'charming', 'cottagecore', 'timber'], P: { primary: 'WHITE', secondary: 'BROWN', accent: 'RED', trim: 'BROWN', roof: 'DARK_RED' }, word: 'Cozy' },
            modern: { words: ['modern', 'minimal', 'minimalist', 'sleek', 'contemporary', 'luxury', 'glass'], P: { primary: 'WHITE', secondary: 'LIGHT_GREY', accent: 'BLACK', trim: 'DARK_GREY', glass: 'TRANS_CLEAR', roof: 'DARK_GREY' }, word: 'Modern' },
            haunted: { words: ['haunted', 'spooky', 'halloween', 'creepy', 'scary', 'ghostly', 'cursed', 'vampire'], P: { primary: 'BLACK', secondary: 'DARK_GREY', accent: 'PURPLE', trim: 'PURPLE', glass: 'TRANS_ORANGE', ground: 'DARK_GREY', roof: 'BLACK', leaf: 'DARK_GREY' }, word: 'Haunted' },
            tropical: { words: ['tropical', 'beach', 'island', 'hawaiian', 'caribbean', 'seaside', 'coastal'], P: { primary: 'TAN', secondary: 'BLUE', accent: 'ORANGE', ground: 'TAN', water: 'TRANS_BLUE' }, word: 'Tropical' },
            winter: { words: ['winter', 'snow', 'snowy', 'arctic', 'ice', 'icy', 'frozen', 'christmas', 'festive'], P: { primary: 'WHITE', secondary: 'BLUE', accent: 'RED', ground: 'WHITE', roof: 'WHITE', glass: 'TRANS_CLEAR' }, word: 'Winter' },
            desert: { words: ['desert', 'egyptian', 'egypt', 'sahara', 'western', 'wild west'], P: { primary: 'TAN', secondary: 'BROWN', accent: 'GOLD', ground: 'TAN', roof: 'TAN' }, word: 'Desert' },
            military: { words: ['military', 'army', 'camo', 'combat', 'battle', 'war'], P: { primary: 'GREEN', secondary: 'DARK_GREY', accent: 'TAN', ground: 'TAN' }, word: 'Military' },
            racing: { words: ['racing', 'race', 'turbo', 'sport', 'sports', 'fast', 'speed'], P: { primary: 'RED', secondary: 'WHITE', accent: 'BLACK' }, word: 'Turbo' },
            pastel: { words: ['pastel', 'candy', 'cute', 'kawaii', 'sweet', 'kids', 'cartoon'], P: { primary: 'PINK', secondary: 'LIME', accent: 'YELLOW', roof: 'PINK' }, word: 'Candy' },
            fire: { words: ['fiery', 'lava', 'volcanic', 'flaming', 'inferno', 'hellish'], P: { primary: 'RED', secondary: 'ORANGE', accent: 'TRANS_ORANGE', ground: 'DARK_GREY', roof: 'BLACK' }, word: 'Inferno' },
            ocean: { words: ['ocean', 'sea', 'underwater', 'nautical', 'marine', 'deep sea', 'aquatic'], P: { primary: 'BLUE', secondary: 'WHITE', accent: 'TRANS_BLUE', ground: 'TAN', water: 'TRANS_BLUE' }, word: 'Nautical' },
            space: { words: ['galactic', 'orbital', 'martian', 'interstellar', 'cosmic'], P: { primary: 'WHITE', secondary: 'DARK_GREY', accent: 'TRANS_BLUE', ground: 'LIGHT_GREY' }, word: 'Galactic' },
            royal: { words: ['royal', 'regal', 'imperial', 'golden', 'majestic'], P: { primary: 'PURPLE', secondary: 'GOLD', accent: 'DARK_RED', trim: 'GOLD', roof: 'DARK_BLUE' }, word: 'Royal' },
        };
        this.scaleWords = { micro: 0.7, tiny: 0.7, mini: 0.75, small: 0.8, little: 0.8, pocket: 0.7, big: 1.3, large: 1.3, tall: 1.25, huge: 1.5, giant: 1.6, massive: 1.6, mega: 1.6, epic: 1.5, enormous: 1.6, colossal: 1.6, jumbo: 1.5 };
        this.epithets = ['Harbour', 'Summit', 'Ember', 'Nova', 'Falcon', 'Meadow', 'Thunder', 'Willow', 'Atlas', 'Comet', 'Juniper', 'Ridge', 'Lantern', 'Raven', 'Maple', 'Coral', 'Onyx', 'Pioneer', 'Zephyr', 'Sable'];
    }

    /* ── seeded randomness ───────────────────────────────────── */

    // Resolve a colour id or word ("LIME", "lime", "dark red", "trans-blue") to a catalog id, or null.
    colorId(v) {
        if (!v || typeof v !== 'string') return null;
        const up = v.trim().toUpperCase().replace(/[\s-]+/g, '_');
        if (window.LEGO_COLORS[up]) return up;
        const w = v.trim().toLowerCase().split(/[\s-]+/);
        const joined = w.join(' ');
        const map = { 'dark red': 'DARK_RED', 'dark blue': 'DARK_BLUE', 'dark green': 'DARK_GREEN', 'dark grey': 'DARK_GREY', 'dark gray': 'DARK_GREY', 'light grey': 'LIGHT_GREY', 'light gray': 'LIGHT_GREY', 'trans blue': 'TRANS_BLUE', 'trans clear': 'TRANS_CLEAR', 'trans orange': 'TRANS_ORANGE', 'trans red': 'TRANS_RED', 'trans green': 'TRANS_GREEN', 'trans yellow': 'TRANS_YELLOW' };
        if (map[joined] && window.LEGO_COLORS[map[joined]]) return map[joined];
        for (const x of w) if (this.colorWords[x]) return this.colorWords[x];
        return null;
    }

    hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    rng(seed) { let s = seed || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; }; }

    /* ── reading the prompt ──────────────────────────────────── */

    parse(prompt) {
        const text = (prompt || '').toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
        const words = text.split(' ').filter(Boolean);
        const singular = (w) => (w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 3 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
        const forms = new Set(words.concat(words.map(singular)));
        const padded = ' ' + text + ' ' + words.map(singular).join(' ') + ' ';
        const has = (...keys) => keys.some((k) => (k.includes(' ') || k.includes('-') ? padded.includes(' ' + k + ' ') : forms.has(k)));
        const colors = [];
        for (const w of words) { const c = this.colorWords[w]; if (c && !colors.includes(c)) colors.push(c); }
        let style = null;
        for (const [id, s] of Object.entries(this.styles)) if (s.words.some((w) => has(w))) { style = id; break; }
        let scale = 1.25, scaleWord = null;   // a little chunkier than minimum by default
        for (const w of words) if (this.scaleWords[w]) { scale = this.scaleWords[w]; scaleWord = w; }
        // No size word: the real-set calibration (see calibrate) may be re-forging at a nudged scale.
        if (!scaleWord && this._scaleNudge && this._scaleNudge !== 1) scale = Math.max(0.6, Math.min(1.8, scale * this._scaleNudge));
        // "bakery with a garden" is a bakery: the subject comes before the first preposition.
        const m = text.match(/^(.*?)\s(with|on|in|near|at|by|under|over|beside|next to|from|eating|holding|carrying|riding|wearing|behind|above|inside)\s/);
        const subject = m ? m[1] : text;
        // "minifig scale house", "cafe for minifigs": buildings sized for figures (see forgeOne).
        const minifig = has('minifig', 'minifigure', 'minifig scale', 'for minifigs', 'for minifigures');
        // What real sets of this subject are made of (null without the knowledge file or a match).
        const knowledge = this.knowledgeFor(text);
        return { text, words, has, colors, style, scale, scaleWord, subject, minifig, knowledge };
    }

    /**
     * Pick the builder whose key best matches. Longer and multi-word keys win
     * ("fire truck" over "fire" and "truck"), the last word of a compound is
     * the head noun ("table lamp" is a lamp, "tree frog" a frog), and family
     * words like "tree" lose to anything more specific.
     */
    pickBuilder(parsed) {
        let best = null, bestScore = -Infinity, bestKey = null;
        const subjWords = parsed.subject.split(' '), last = subjWords[subjWords.length - 1] || '';
        const inSubject = (k) => (' ' + parsed.subject + ' ').includes(' ' + k + ' ') || (' ' + parsed.subject + ' ').includes(' ' + k + 's ');
        const mini = !!parsed.minifig;
        for (const b of window.FORGE.builders) {
            // A minifig-scale builder ("minifig house", "minifig cafe") matches on the subject alone once
            // the prompt says minifig, and gets a boost so it beats the ordinary house builder.
            const miniB = mini && b.keys.some((x) => x.startsWith('minifig '));
            for (const k of b.keys) {
                const kk = miniB && k.startsWith('minifig ') ? k.slice(8) : k;
                if (!parsed.has(kk)) continue;
                let score = k.length + (k.includes(' ') ? 4 : 0) - (this.generic.has(kk) ? 3 : 0) + (inSubject(kk) ? 6 : 0) + (last === kk || last === kk + 's' || kk.endsWith(' ' + last) ? 2 : 0) - parsed.text.indexOf(kk) / 100;
                if (mini) score += miniB ? 8 : (kk === 'minifig' || kk === 'minifigure' ? -10 : 0);   // "minifig castle" is a castle, "a minifig" a figure
                score += b.priority || 0;   // a later builder family may claim a key an earlier one also lists
                if (score > bestScore) { best = b; bestScore = score; bestKey = k; }
            }
        }
        return { builder: best, key: bestKey, score: bestScore };
    }

    palette(parsed) {
        const P = { primary: 'RED', secondary: 'WHITE', accent: 'YELLOW', trim: 'LIGHT_GREY', glass: 'TRANS_BLUE', dark: 'DARK_GREY', metal: 'LIGHT_GREY', wood: 'BROWN', ground: 'GREEN', light: 'TRANS_ORANGE', roof: 'DARK_RED', water: 'TRANS_BLUE', leaf: 'GREEN', explicit: false };
        // Layers, each one winning over the last: generic defaults, what real sets of the subject are
        // coloured like, a style word ("haunted"), then the colours the prompt names outright.
        if (parsed.knowledge && !parsed.colors.length) Object.assign(P, this.knowledgePalette(parsed.knowledge) || {});
        if (parsed.style) Object.assign(P, this.styles[parsed.style].P);
        if (parsed.colors.length) { P.explicit = true; P.primary = parsed.colors[0]; if (parsed.colors[1]) P.secondary = parsed.colors[1]; if (parsed.colors[2]) P.accent = parsed.colors[2]; if (parsed.colors[0] === 'GREEN' || parsed.colors[0] === 'LIME') P.ground = 'TAN'; }
        return P;
    }

    /* ── real-set knowledge ──────────────────────────────────── */

    /** The knowledge entry (knowledge.js) for a prompt, or null when the file is missing or nothing matches. */
    knowledgeFor(text) {
        const K = window.FORGE && window.FORGE.knowledge;
        if (!K || !K.ready) return null;
        try { return K.subjectFor(text) || null; } catch (e) { return null; }
    }

    /**
     * Palette roles from a subject's real-set palette ([[colorId, share], ...], best first).
     * Deterministic. Black and dark grey are structural (tyres, chassis, baseplates) and only
     * become the body colour when they truly dominate; a light neutral (white, light grey, tan)
     * is the body when no real colour reaches 55% of its share, which is how castles come out
     * light grey, rockets white and fire trucks red. Returns null when there is nothing usable.
     */
    knowledgePalette(entry) {
        const pal = (entry && entry.palette || []).filter(([c, s]) => window.LEGO_COLORS[c] && s > 0);
        if (!pal.length) return null;
        const share = (c) => { const e = pal.find((x) => x[0] === c); return e ? e[1] : 0; };
        const DARKS = ['BLACK', 'DARK_GREY'], LIGHTS = ['WHITE', 'LIGHT_GREY', 'TAN'];
        const isTrans = (c) => c.startsWith('TRANS_');
        const isNeutral = (c) => DARKS.includes(c) || LIGHTS.includes(c);
        const chroma = pal.map(([c]) => c).filter((c) => !isNeutral(c) && !isTrans(c) && c !== 'BROWN');   // brown is the wood role, not an accent
        const topChroma = chroma[0] || (pal.some(([c]) => c === 'BROWN') ? 'BROWN' : null);
        const topLight = LIGHTS.map((c) => [c, share(c)]).sort((a, b) => b[1] - a[1])[0];
        const topDark = DARKS.map((c) => [c, share(c)]).sort((a, b) => b[1] - a[1])[0];
        let primary = topChroma;
        if (topDark[1] > 0.4) primary = topDark[0];
        else if (topLight[1] > 0.4 || !topChroma || share(topChroma) < 0.55 * topLight[1]) primary = topLight[1] > 0 ? topLight[0] : topChroma;
        if (!primary) return null;
        const P = { primary };
        // Secondary: the next real or light colour by share (darks are the `dark` role, not a second body colour).
        const secondary = pal.map(([c]) => c).find((c) => c !== primary && !isTrans(c) && !DARKS.includes(c));
        if (secondary) P.secondary = secondary;
        // Accent: the brightest remaining colour, or any remaining real colour.
        const rest = chroma.filter((c) => c !== primary && c !== secondary);
        const BRIGHT = ['YELLOW', 'ORANGE', 'RED', 'LIME', 'PINK', 'GOLD'];
        const accent = rest.find((c) => BRIGHT.includes(c)) || rest[0];
        if (accent) P.accent = accent;
        // Greys: dark, trim and metal, by how much real sets use them.
        const greys = pal.map(([c]) => c).filter((c) => isNeutral(c) && c !== primary && c !== secondary);
        const dark = greys.find((c) => c === 'BLACK') || greys.find((c) => c === 'DARK_GREY') || greys[0];
        if (dark) P.dark = dark;
        const trim = greys.find((c) => c !== dark);
        if (trim) P.trim = trim;
        if (share('LIGHT_GREY')) P.metal = 'LIGHT_GREY'; else if (share('DARK_GREY')) P.metal = 'DARK_GREY';
        if (share('BROWN')) P.wood = 'BROWN';
        // Transparent parts: clear or blue glass, orange lights.
        const trans = pal.map(([c]) => c).filter(isTrans);
        P.glass = trans.find((c) => c === 'TRANS_CLEAR') || trans.find((c) => c === 'TRANS_BLUE') || trans[0] || 'TRANS_BLUE';
        if (trans.includes('TRANS_ORANGE')) P.light = 'TRANS_ORANGE';
        if (primary === 'GREEN' || primary === 'LIME') P.ground = 'TAN';   // a green body on green grass would vanish
        return P;
    }

    /** What a builder may read as ctx.knowledge: the subject id, its piece-count percentiles, palette and top parts. */
    knowledgeCtx(entry) {
        if (!entry) return null;
        return { subject: entry.id, key: entry.key || null, n: entry.n, pieces: entry.pieces || null, palette: entry.palette || [], parts: entry.parts || [] };
    }

    /**
     * Size calibration against real sets. `forge` is the plain forge: run it once and, when the
     * prompt gives no size (no size word, no opts.scale, no brief scale, not minifig scale), compare
     * the piece count with the subject's real sets: far under the median (< p50/2) re-forges once at
     * scale x1.25, far over the upper quartile (> 2*p75) once at x0.8. One retry at most, same seed,
     * so a prompt still forges the same model every time. Scenes keep their size (two subjects add up).
     * Every model gets `model.knowledge` ({ subject, key, n, pieces, palette, wanted, calibration }) or null.
     */
    calibrate(forge, promptText, variant, opts) {
        const nudged = (k) => { this._scaleNudge = k; try { return forge.call(this, promptText, variant, opts); } finally { this._scaleNudge = 1; } };
        let model = nudged(1);
        const brief = opts.brief || null;
        const parsed = this.parse(brief && brief.subject ? brief.subject : promptText);
        const K = parsed.knowledge, pcs = K && K.pieces;
        let calibration = null;
        const minifig = parsed.minifig || !!(opts.features && opts.features.minifig) || !!(brief && brief.features && brief.features.minifig);
        const sized = parsed.scaleWord || typeof opts.scale === 'number' || (brief && typeof brief.scale === 'number') || minifig || !!opts.blueprint;
        if (pcs && !sized && model && model.bricks && model.kind !== 'scene' && model.kind !== 'monogram') {
            const n = model.bricks.length, s = parsed.scale;
            const k = n < 0.5 * pcs.p50 && s < 1.5 ? 1.25 : n > 2 * pcs.p75 && s > 0.8 ? 0.8 : 0;
            if (k) {
                // Builders with fixed footprints may not grow at all; then the first forge stands (smaller scale, same model).
                const again = nudged(k), to = again.bricks.length;
                const kept = k > 1 ? to > n : to < n;
                calibration = { from: n, to, scale: [s, Math.max(0.6, Math.min(1.8, s * k))], kept };
                if (kept) model = again;
            }
        }
        if (model && typeof model === 'object') model.knowledge = K ? { subject: K.id, key: K.key || null, n: K.n, pieces: K.pieces || null, palette: K.palette || [], wanted: (K.wanted || []).slice(0, 5), calibration } : null;
        return model;
    }

    /* ── forging ─────────────────────────────────────────────── */

    /**
     * `opts` lets the UI (and an AI brief) steer a forge without changing the prompt:
     *   colors   { primary, secondary, accent, roof, ... }  palette roles to override
     *   scale    a number (0.7 micro ... 1.6 giant)
     *   features { name: value }  answers to the options a builder declares with ctx.declare()
     *   brief    { subject, style, colors: [...], scale, features, name, description }  from the idea service
     * The model reports the options the builder declared in `model.options`.
     */
    generateFromPrompt(promptText, variant = 0, opts = {}) {
        // A blueprint (a design Claude wrote, see blueprint.js) is assembled as it is; an invalid one falls through
        // to the ordinary paths, so the caller always gets a model.
        if (opts.blueprint && window.FORGE.blueprint) { const designed = this.forgeBlueprint(promptText, variant, opts); if (designed) return designed; }
        const brief = opts.brief || null;
        // "lighthouse next to a pirate ship": two or three ideas, each built by its own builder, on one plate.
        if (!(brief && brief.subject)) { const scene = this.combine(promptText, variant, opts); if (scene) return scene; }
        const parsed = this.parse(brief && brief.subject ? brief.subject : promptText);
        if (brief) {
            if (brief.style && this.styles[brief.style]) parsed.style = brief.style;
            if (Array.isArray(brief.colors) && brief.colors.length) parsed.colors = brief.colors.filter((c) => window.LEGO_COLORS[c]);
            if (typeof brief.scale === 'number') parsed.scale = Math.max(0.6, Math.min(1.8, brief.scale));
        }
        if (typeof opts.scale === 'number') { parsed.scale = Math.max(0.6, Math.min(1.8, opts.scale)); parsed.scaleWord = parsed.scale <= 0.8 ? 'micro' : parsed.scale >= 1.45 ? 'giant' : parsed.scale > 1.3 ? 'big' : null; }
        const features = Object.assign({}, brief && brief.features, opts.features);
        const options = [];
        const one = this.forgeOne(parsed, promptText, variant, opts, features, options);
        if (one.builder) window.FORGE.helpers.dress(one.ctx);
        const name = brief && brief.name ? String(brief.name).slice(0, 60) : this.name(parsed, one.result.title, variant);
        return this.assemble(one.g, {
            id: `forge-${one.seed.toString(36)}`, name, category: one.category, icon: one.icon, kind: one.kind, prompt: promptText, variant, seed: one.seed,
            title: one.result.title, features: one.result.features, lead: brief && brief.description ? String(brief.description).slice(0, 220) + ' ' : null,
            options, palette: one.P, opts: { colors: opts.colors || {}, scale: opts.scale || null, features }, brief, matchKey: one.key,
        });
    }

    /**
     * Build a model from a blueprint (`opts.blueprint`, the format in blueprint.js) instead of a builder: the
     * ops run on a fresh grid through the same helpers and modules the builders use, then the usual assemble
     * (tiling + anchoring) makes it a model of kind 'blueprint' carrying the design as `model.blueprint`.
     * Returns null when the blueprint does not validate.
     */
    forgeBlueprint(promptText, variant, opts) {
        const B = window.FORGE.blueprint, H = window.FORGE.helpers;
        const v = B.validate(opts.blueprint);
        if (!v.ok) { console.warn('StudForge: blueprint rejected:', v.errors.join('; ')); return null; }
        const bp = v.bp, parsed = this.parse(promptText);
        const seed = (this.hash(parsed.text + '|' + bp.name) + variant * 7919) >>> 0;
        const rnd = this.rng(seed || 1);
        // The design's own colours become the palette roles the modules fall back to.
        const P = this.palette(parsed), used = [];
        for (const op of bp.ops) { const c = op.color || (op.params && op.params.color); if (c && !used.includes(c)) used.push(c); }
        if (used[0]) P.primary = used[0]; if (used[1]) P.secondary = used[1]; if (used[2]) P.accent = used[2];
        P.ground = bp.base.color;
        const ctx = {
            P, rnd, pick: (a) => a[Math.floor(rnd() * a.length)], chance: (p) => rnd() < p,
            S: 1, sc: (n) => Math.max(1, Math.round(n)), style: parsed.style, has: parsed.has, words: parsed.words,
            match: 'blueprint', prompt: promptText, explicitColors: parsed.colors, minifig: false,
            declare: (o) => o.default, opt: (id, dflt) => dflt,
        };
        const built = B.build(bp, ctx);
        if (built.warnings.length) console.warn('StudForge: blueprint ops skipped:', built.warnings.join('; '));
        H.dress({ g: built.g, P, rnd, chance: ctx.chance, pick: ctx.pick });
        const model = this.assemble(built.g, {
            id: `forge-${seed.toString(36)}`, name: bp.name, category: bp.category || 'Custom Creation', icon: '✨', kind: 'blueprint', prompt: promptText, variant, seed,
            title: bp.name, features: built.feats, lead: bp.description ? bp.description + ' ' : null,
            options: [], palette: P, opts: { colors: opts.colors || {}, scale: opts.scale || null, features: opts.features || {} }, brief: opts.brief || null, matchKey: 'blueprint',
        });
        model.blueprint = bp;
        model.warnings = built.warnings;
        return model;
    }

    /**
     * Paint one subject into a fresh grid with the builder that matches `parsed`
     * (or the monogram fallback). Shared by a plain forge and by a combined scene.
     * `features`/`options` are shared so a scene's parts declare into one list.
     */
    forgeOne(parsed, promptText, variant, opts, features, options) {
        const seed = (this.hash(parsed.text) + variant * 7919) >>> 0;
        const rnd = this.rng(seed || 1);
        let { builder, key } = this.pickBuilder(parsed);
        // An AI brief may name the builder kind outright; it wins over keyword scoring (with a key the builder understands).
        const brief = opts.brief || null;
        if (brief && brief.kind && (!builder || builder.kind !== brief.kind)) {
            const forced = window.FORGE.builders.find((b) => b.kind === brief.kind);
            if (forced) { builder = forced; key = forced.keys.find((k) => parsed.has(k)) || forced.keys[0]; }
        }
        const g = new window.ForgeGrid();
        const P = this.palette(parsed);
        if (opts.colors) {
            // Accept colour ids ("DARK_RED") as well as plain words ("crimson", "dark red").
            for (const [k, v] of Object.entries(opts.colors)) { const id = this.colorId(v); if (id) P[k] = id; }
            if (this.colorId(opts.colors.primary)) P.explicit = true;
        }
        const declare = (o) => { if (!options.some((x) => x.id === o.id)) options.push(o); return features[o.id] !== undefined ? features[o.id] : o.default; };
        // Minifig scale: buildings offer it as an option; builders flagged `minifig` are already sized for figures,
        // the others are forged 1.6x so a figure fits through the door.
        const building = !!builder && (builder.category === 'Architecture' || builder.kind === 'castle' || !!builder.minifig);
        let minifig = !!parsed.minifig;
        if (building && !builder.minifig) minifig = !!declare({ id: 'minifig', label: 'Minifig scale', type: 'bool', default: !!parsed.minifig });
        let scale = parsed.scale;
        if (minifig && building && !builder.minifig && typeof opts.scale !== 'number') scale = Math.max(scale, 1.6);
        const ctx = {
            g, P, rnd, pick: (a) => a[Math.floor(rnd() * a.length)], chance: (p) => rnd() < p,
            S: scale, sc: (n) => Math.max(1, Math.round(n * scale)), style: parsed.style, has: parsed.has, words: parsed.words,
            match: key, prompt: promptText, explicitColors: parsed.colors, minifig,
            // What real sets of this subject are made of ({ subject, key, n, pieces, palette, parts }), or null.
            knowledge: this.knowledgeCtx(parsed.knowledge),
            // A builder declares the choices it offers ({ id, label, type: 'bool'|'choice', default, choices }) and reads the answer with opt().
            declare, opt: (id, dflt) => (features[id] !== undefined ? features[id] : dflt),
        };
        let result, kind, category, icon;
        if (builder) { result = builder.build(ctx); kind = builder.kind; category = builder.category; icon = builder.icon; }
        else {
            const letters = window.FORGE.helpers.monogram(ctx, promptText);
            result = { title: `"${letters}" Monogram`, features: ['the idea\'s initials as a pixel wall', 'a tiled plinth'] };
            kind = 'monogram'; category = 'Custom Creation'; icon = '✨';
        }
        return { g, ctx, P, seed, builder, key, result, kind, category, icon };
    }

    /**
     * Tile a painted grid into bricks and wrap it as a model. `meta` carries the
     * naming (`title`, `features`, `lead`, `name`) and identity fields; features
     * (mosaic mode, for one) use this to put their own grids through the pipeline.
     */
    assemble(g, meta) {
        const anchored = this.anchor(g.tile());
        const bricks = anchored.bricks;
        const b = g.bounds();
        const steps = new Set(bricks.map((p) => p.layer)).size;
        const pieces = bricks.length;
        const difficulty = pieces < 60 ? 'Beginner' : pieces < 140 ? 'Intermediate' : pieces < 260 ? 'Advanced' : 'Master Builder';
        const mins = Math.max(10, Math.round(pieces * 0.11 / 5) * 5);
        const w = b.x1 - b.x0 + 1, d = b.z1 - b.z0 + 1, h = b.y1 - b.y0 + 1;
        const feats = (meta.features || []).slice(0, 5);
        const list = feats.length > 1 ? feats.slice(0, -1).join(', ') + ' and ' + feats[feats.length - 1] : feats[0] || '';
        const description = (meta.lead || `A ${pieces}-piece ${(meta.title || meta.name).toLowerCase()} with ${list}. `) + `${w}×${d} studs, ${Math.round(h / 3)} bricks tall, built in ${steps} steps.`;
        return { id: meta.id, name: meta.name, category: meta.category, icon: meta.icon, difficulty, estTime: `${mins} mins`, description, bricks, kind: meta.kind, prompt: meta.prompt, variant: meta.variant || 0, seed: meta.seed || 0, dims: { w, d, h: Math.round(h / 3) }, steps,
            options: meta.options || [], palette: { ...(meta.palette || {}) }, opts: meta.opts || { colors: {}, scale: null, features: {} }, brief: meta.brief || null, matchKey: meta.matchKey || null, anchor: anchored.stats };
    }

    /* ── anchoring: nothing floats ───────────────────────────── */

    /**
     * Guarantee that every assembly is stud-connected down to the ground.
     * Parts connect only through their tops and bottoms (studs into tubes), so
     * a component is "grounded" when a chain of such contacts reaches the
     * lowest plate. For each loose component, first try gravity (drop it up
     * to three plates onto something grounded), otherwise raise a strut of
     * 1x1 bricks and plates from the nearest grounded piece (or the ground)
     * up to the component. Builders should place things properly; this is the
     * safety net that makes the rule hold for every forge.
     */
    anchor(bricks) {
        const PLATE = window.FORGE_PLATE || 0.4;
        const stats = { dropped: 0, struts: 0, strutPieces: 0, maxStrut: 0, stuck: 0 };
        if (!bricks.length) return { bricks, stats };
        const key = (x, y, z) => `${x},${y},${z}`;
        const occ = new Map();   // cell -> brick index
        const cellsOf = (f) => { const out = []; for (let y = f.y0; y < f.y0 + f.hp; y++) for (let x = f.x0; x < f.x0 + f.w; x++) for (let z = f.z0; z < f.z0 + f.l; z++) out.push([x, y, z]); return out; };
        const solid = (i) => !bricks[i].ghost;
        const put = (i) => { if (solid(i)) for (const [x, y, z] of cellsOf(bricks[i].fp)) occ.set(key(x, y, z), i); };
        const lift = (i) => { if (solid(i)) for (const [x, y, z] of cellsOf(bricks[i].fp)) occ.delete(key(x, y, z)); };
        bricks.forEach((_, i) => put(i));
        const minY = Math.min(...bricks.filter((b) => !b.ghost).map((b) => b.fp.y0));
        for (let round = 0; round < 60; round++) {
            // Components by vertical contact.
            const parent = bricks.map((_, i) => i);
            const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
            const union = (a, b) => { parent[find(a)] = find(b); };
            bricks.forEach((b, i) => { if (b.ghost) return; const f = b.fp; for (let x = f.x0; x < f.x0 + f.w; x++) for (let z = f.z0; z < f.z0 + f.l; z++) { const d = occ.get(key(x, f.y0 - 1, z)); if (d !== undefined) union(i, d); const u = occ.get(key(x, f.y0 + f.hp, z)); if (u !== undefined) union(i, u); } });
            // Explicit fastenings: a wheel on its axle pin, a clip on a bar, a hinge top on its base.
            bricks.forEach((b, i) => { if (b.ghost || !b.links) return; for (const [x, y, z] of b.links) { const o = occ.get(key(x, y, z)); if (o !== undefined) union(i, o); } });
            const comp = new Map();
            bricks.forEach((b, i) => { if (b.ghost) return; const r = find(i); if (!comp.has(r)) comp.set(r, []); comp.get(r).push(i); });
            const grounded = new Set();
            for (const [r, ids] of comp) if (ids.some((i) => bricks[i].fp.y0 === minY)) grounded.add(r);
            const loose = [...comp.entries()].filter(([r]) => !grounded.has(r)).map(([, ids]) => ids);
            if (!loose.length) break;
            // Lowest-hanging component first, so stacks of loose parts resolve bottom-up.
            loose.sort((a, b) => Math.min(...a.map((i) => bricks[i].fp.y0)) - Math.min(...b.map((i) => bricks[i].fp.y0)));
            const ids = loose[0], mine = new Set(ids);
            const isGroundedCell = (x, y, z) => { const o = occ.get(key(x, y, z)); return o !== undefined && !mine.has(o) && grounded.has(find(o)); };
            // 1. Gravity: drop up to three plates onto something grounded (or the ground) without hitting anything.
            let done = false;
            for (let d = 1; d <= 3 && !done; d++) {
                let clear = true, lands = false;
                for (const i of ids) { for (const [x, y, z] of cellsOf(bricks[i].fp)) { const o = occ.get(key(x, y - d, z)); if (o !== undefined && !mine.has(o)) { clear = false; break; } } if (!clear) break; }
                if (!clear) break;
                for (const i of ids) { const f = bricks[i].fp; for (let x = f.x0; x < f.x0 + f.w && !lands; x++) for (let z = f.z0; z < f.z0 + f.l; z++) { if (f.y0 - d === minY || isGroundedCell(x, f.y0 - d - 1, z)) { lands = true; break; } } if (lands) break; }
                if (lands) {
                    // Lift the whole component before any piece moves, or a piece could land in a neighbour's old cells.
                    for (const i of ids) lift(i);
                    for (const i of ids) { const b = bricks[i]; b.fp.y0 -= d; b.layer = b.fp.y0; b.y = b.fp.y0 * PLATE; put(i); }
                    stats.dropped++; done = true;
                }
            }
            if (done) continue;
            // 2. Strut: the shortest column from the component down (or up) to a grounded cell or the ground.
            let best = null;
            const columns = new Map();
            for (const i of ids) for (const [x, y, z] of cellsOf(bricks[i].fp)) { const k = `${x},${z}`; const c = columns.get(k) || { x, z, lo: Infinity, hi: -Infinity, loBrick: i }; if (y < c.lo) { c.lo = y; c.loBrick = i; } c.hi = Math.max(c.hi, y); columns.set(k, c); }
            for (const c of columns.values()) {
                // Downward.
                let y = c.lo - 1, blocked = false;
                while (y >= minY) { const o = occ.get(key(c.x, y, c.z)); if (o !== undefined) { if (!mine.has(o) && grounded.has(find(o))) break; blocked = true; break; } y--; }
                if (!blocked) { const h = c.lo - 1 - y; const to = y + 1; if (h > 0 && (!best || h < best.h)) best = { h, x: c.x, z: c.z, y0: to, color: bricks[c.loBrick].color }; }
                // Upward (something grounded hangs above, e.g. a roof): a column up from the component's top.
                let yu = c.hi + 1, hit = -1, lim = c.hi + 40;
                while (yu < lim) { const o = occ.get(key(c.x, yu, c.z)); if (o !== undefined) { if (!mine.has(o) && grounded.has(find(o))) hit = yu; break; } yu++; }
                if (hit > 0) { const h = hit - c.hi - 1; if (h > 0 && (!best || h < best.h)) best = { h, x: c.x, z: c.z, y0: c.hi + 1, color: bricks[c.loBrick].color }; }
            }
            if (!best) { stats.stuck++; break; }
            let y = best.y0, left = best.h;
            while (left > 0) {
                const hp = left >= 3 ? 3 : 1, partId = hp === 3 ? '3005' : '3024';
                bricks.push({ partId, color: best.color, x: best.x, y: y * PLATE, z: best.z, rotY: 0, rotX: 0, rotZ: 0, layer: y, strut: true, fp: { x0: best.x, z0: best.z, y0: y, w: 1, l: 1, hp } });
                put(bricks.length - 1); stats.strutPieces++; y += hp; left -= hp;
            }
            stats.struts++; stats.maxStrut = Math.max(stats.maxStrut, best.h);
        }
        return { bricks, stats };
    }

    /* ── combining ideas ─────────────────────────────────────── */

    /**
     * "castle with a dragon", "cat on a sofa", "house and a tree": split the
     * prompt at a combinator, forge each side with its own builder and lay them
     * out on one plate ("on" stacks the first onto the second). Returns null when
     * a side matches nothing (so "lighthouse on a rocky shore" stays a lighthouse),
     * or when a "with" names something the main builder handles itself (gardens,
     * props, towers), so "house with a garden" is still the house builder.
     */
    combine(promptText, variant, opts) {
        const H = window.FORGE.helpers;
        if (!H.sideBySide || !H.stackOn) return null;
        const full = this.parse(promptText);
        const re = /\s(next to|beside|on top of|in front of|behind|and|with an?|on an?)\s/;
        const texts = [], rels = [];
        let rest = full.text;
        while (texts.length < 2) {
            const m = rest.match(re);
            if (!m) break;
            texts.push(rest.slice(0, m.index)); rels.push(m[1].split(' ')[0]);   // 'next', 'beside', 'on', 'in', 'behind', 'and', 'with'
            rest = rest.slice(m.index + m[0].length);
        }
        if (!rels.length) return null;
        texts.push(rest);
        const parts = [];
        for (let i = 0; i < texts.length; i++) {
            const p = this.parse(texts[i]);
            if (!p.words.length) return null;
            if (!p.style) p.style = full.style;
            if (typeof opts.scale === 'number') p.scale = Math.max(0.6, Math.min(1.8, opts.scale));
            const pb = this.pickBuilder(p);
            if (!pb.builder) return null;
            // A weak "with": only a clearly named creature, vehicle, building or figure counts as a second subject.
            if (i > 0 && rels[i - 1] === 'with' && (pb.score < 12 || ['nature', 'object', 'standee', 'monogram'].includes(pb.builder.kind))) return null;
            parts.push({ parsed: p, pick: pb });
        }
        const features = Object.assign({}, opts.features), options = [];
        const built = parts.map((pt) => this.forgeOne(pt.parsed, promptText, variant, opts, features, options));
        const ground = built[0].P.ground;
        const short = (t) => t.replace(/ (on|with|in|&) .*$/, '');   // "Lighthouse on a Rocky Shore" -> "Lighthouse"
        let g = built[0].g, title = short(built[0].result.title);
        const phrases = { next: 'next to', beside: 'beside', on: 'on top of', in: 'in front of', behind: 'behind', and: 'next to', with: 'with' };
        let lead = `A scene: a ${title.toLowerCase()} with ${built[0].result.features.slice(0, 2).join(' and ')}`;
        for (let i = 1; i < built.length; i++) {
            const rel = rels[i - 1], nxt = built[i], t = short(nxt.result.title);
            if (rel === 'on') { g = H.stackOn(g, nxt.g); title = `${title} on ${/^[aeiou]/i.test(t) ? 'an' : 'a'} ${t}`; }
            else if (rel === 'in') { g = H.sideBySide(nxt.g, g, 'z', 2, ground); title = `${title} & ${t}`; }
            else if (rel === 'behind') { g = H.sideBySide(g, nxt.g, 'z', 2, ground); title = `${title} & ${t}`; }
            else { g = H.sideBySide(g, nxt.g, 'x', 3, ground); title = `${title} & ${t}`; }
            if (!g) return null;
            lead += `, ${phrases[rel]} a ${t.toLowerCase()} with ${nxt.result.features.slice(0, 2).join(' and ')}`;
        }
        const first = built[0];
        H.dress({ g, P: first.P, rnd: first.ctx.rnd, chance: first.ctx.chance, pick: first.ctx.pick });
        const seed = (this.hash(full.text) + variant * 7919) >>> 0;
        return this.assemble(g, {
            id: `forge-${seed.toString(36)}`, name: this.name(full, title, variant), category: 'Scene', icon: first.icon, kind: 'scene', prompt: promptText, variant, seed,
            title, features: built.flatMap((x) => x.result.features.slice(0, 2)), lead: lead + '. ',
            options, palette: first.P, opts: { colors: opts.colors || {}, scale: opts.scale || null, features }, brief: null, matchKey: built.map((x) => x.key).join('+'),
        });
    }

    /** "Micro Cozy Blue Cottage", "Giant Red Dragon", "Harbour Lighthouse on a Rocky Shore"... */
    name(parsed, title, variant) {
        const parts = [];
        if (parsed.scaleWord) parts.push(parsed.scale <= 0.8 ? 'Micro' : parsed.scale >= 1.5 ? 'Giant' : 'Grand');
        if (parsed.style && !title.toLowerCase().includes(this.styles[parsed.style].word.toLowerCase())) parts.push(this.styles[parsed.style].word);
        const cw = parsed.colors.length ? this.shortColor[parsed.colors[0]] : null;
        if (cw && !title.toLowerCase().includes(cw.toLowerCase())) parts.push(cw);
        if (!parts.length) parts.push(this.epithets[(this.hash(parsed.text) + variant) % this.epithets.length]);
        return parts.join(' ') + ' ' + title;
    }
}

// Real-set calibration wraps the plain forge (see calibrate): forge, compare the piece count with
// real sets of the subject, re-forge once at a nudged scale when it is far off, and attach
// `model.knowledge`. Kept outside generateFromPrompt so the builder dispatch stays untouched.
{
    const forgePlain = BrickGenerator.prototype.generateFromPrompt;
    BrickGenerator.prototype.generateFromPrompt = function (promptText, variant = 0, opts = {}) {
        return this.calibrate(forgePlain, promptText, variant, opts || {});
    };
}

window.BrickGenerator = BrickGenerator;
