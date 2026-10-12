// Natural language prompt -> LEGO blueprint.
//
// The prompt is read for its subject (which picks a builder), colours, a
// style, a scale and any extra wishes. The builder paints a stud grid, the
// grid is tiled into real bricks and plates (forge-grid.js), and the result
// is named and described from what was actually built. The same prompt always
// forges the same model; a different `variant` re-rolls the random choices.
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
        // "bakery with a garden" is a bakery: the subject comes before the first preposition.
        const m = text.match(/^(.*?)\s(with|on|in|near|at|by|under|over|beside|next to|from|eating|holding|carrying|riding|wearing|behind|above|inside)\s/);
        const subject = m ? m[1] : text;
        // "minifig scale house", "cafe for minifigs": buildings sized for figures (see forgeOne).
        const minifig = has('minifig', 'minifigure', 'minifig scale', 'for minifigs', 'for minifigures');
        return { text, words, has, colors, style, scale, scaleWord, subject, minifig };
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
        if (parsed.style) Object.assign(P, this.styles[parsed.style].P);
        if (parsed.colors.length) { P.explicit = true; P.primary = parsed.colors[0]; if (parsed.colors[1]) P.secondary = parsed.colors[1]; if (parsed.colors[2]) P.accent = parsed.colors[2]; if (parsed.colors[0] === 'GREEN' || parsed.colors[0] === 'LIME') P.ground = 'TAN'; }
        return P;
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
     * Paint one subject into a fresh grid with the builder that matches `parsed`
     * (or the monogram fallback). Shared by a plain forge and by a combined scene.
     * `features`/`options` are shared so a scene's parts declare into one list.
     */
    forgeOne(parsed, promptText, variant, opts, features, options) {
        const seed = (this.hash(parsed.text) + variant * 7919) >>> 0;
        const rnd = this.rng(seed || 1);
        const { builder, key } = this.pickBuilder(parsed);
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
        const bricks = g.tile();
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
            options: meta.options || [], palette: { ...(meta.palette || {}) }, opts: meta.opts || { colors: {}, scale: null, features: {} }, brief: meta.brief || null, matchKey: meta.matchKey || null };
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

window.BrickGenerator = BrickGenerator;
