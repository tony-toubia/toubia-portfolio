// Shared catalog, inventory, and browser-storage rules. No DOM dependencies.
(function (root) {
    const key = 'studforge-library-v1';
    function readState(storage) {
        try {
            const value = JSON.parse(storage.getItem(key) || '{}');
            return {
                favorites: Array.isArray(value?.favorites) ? value.favorites.filter(id => typeof id === 'string') : [],
                progress: value?.progress && typeof value.progress === 'object' && !Array.isArray(value.progress) ? value.progress : {},
                lastModel: typeof value?.lastModel === 'string' ? value.lastModel : null,
            };
        } catch { return { favorites: [], progress: {}, lastModel: null }; }
    }
    function saveState(storage, state) {
        try { storage.setItem(key, JSON.stringify(state)); return true; } catch { return false; }
    }
    function filterModels(models, query, theme, favoritesOnly, favorites) {
        const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
        return models.filter(model => (!theme || model.category === theme)
            && (!favoritesOnly || favorites.includes(model.id))
            && words.every(word => `${model.name} ${model.category} ${model.setNumber || ''}`.toLowerCase().includes(word)));
    }
    function inventory(bricks) {
        const parts = new Map();
        bricks.forEach(brick => {
            if (brick.segment) return;
            const key = `${brick.partId}|${brick.color}`;
            if (!parts.has(key)) parts.set(key, { ...brick, quantity: 0 });
            parts.get(key).quantity++;
        });
        return [...parts.values()].sort((a, b) => b.quantity - a.quantity || a.partId.localeCompare(b.partId));
    }
    function resumeStep(value, maxLayer) {
        return Number.isInteger(value) ? Math.max(0, Math.min(maxLayer, value)) : null;
    }
    // Catalog references and local saves address the same kit. Generated builds
    // keep variant/options in their identity so a recolored save remains distinct.
    function buildKey(entry) {
        if (entry.ref) return entry.ref.replace(/^set-/, '');
        const opts = entry.opts || {};
        const stable = value => value && typeof value === 'object' && !Array.isArray(value)
            ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]))
            : Array.isArray(value) ? value.map(stable) : value;
        return `idea:${JSON.stringify([entry.prompt, entry.variant | 0, stable(opts)])}`;
    }
    function combineEntries(catalog, templates, saved, recent, favorites = []) {
        const entries = new Map();
        const favorite = key => favorites.includes(key) || favorites.includes(`set-${key}`);
        for (const set of catalog) {
            const entry = { ...set, key: set.id, ref: set.id, source: 'real', tags: ['Real set'] };
            if (set.collections?.includes('popular-picks')) entry.tags.push('Popular picks');
            if (favorite(entry.key)) entry.tags.push('Favorites');
            entries.set(entry.key, entry);
        }
        const add = (build, tag) => {
            if (!build || (!build.ref && !build.prompt)) return;
            const key = buildKey(build), existing = entries.get(key);
            const entry = existing || { ...build, id: build.ref || build.id, key, source: build.ref ? 'real' : 'generated', tags: [build.ref ? 'Real set' : 'Generated'] };
            if (entry.source === 'generated') for (const field of ['pieces', 'category', 'thumb', 'dims']) if (build[field] != null && entry[field] == null) entry[field] = build[field];
            if (!entry.tags.includes(tag)) entry.tags.push(tag);
            if (tag === 'Saved') { entry.savedEntry = build; entry.thumb = build.thumb || entry.thumb; }
            if (tag === 'Recent' && !existing) entry.recentEntry = build;
            if (favorite(key) && !entry.tags.includes('Favorites')) entry.tags.push('Favorites');
            entries.set(key, entry);
        };
        templates.forEach(build => add(build, 'Starter idea'));
        saved.forEach(build => add(build, 'Saved'));
        recent.forEach(build => add(build, 'Recent'));
        return [...entries.values()].sort((a, b) => Number(b.tags.includes('Saved')) - Number(a.tags.includes('Saved'))
            || Number(b.tags.includes('Popular picks')) - Number(a.tags.includes('Popular picks'))
            || Number(b.tags.includes('Recent')) - Number(a.tags.includes('Recent'))
            || String(a.name || a.prompt).localeCompare(String(b.name || b.prompt)));
    }
    function searchEntries(entries, query, tags = []) {
        const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
        return entries.filter(entry => tags.every(tag => entry.tags.includes(tag))
            && words.every(word => [entry.name, entry.prompt, entry.ref, entry.theme, entry.category, entry.year, entry.subject, ...entry.tags].join(' ').toLowerCase().includes(word)));
    }
    function shouldBrowseOnStart(search, seen, lastModel) {
        const params = new URLSearchParams(search);
        return !seen && !lastModel && !['ref', 'idea', 'mosaic'].some(key => params.has(key));
    }
    root.StudForgeLibrary = { readState, saveState, filterModels, inventory, resumeStep, buildKey, combineEntries, searchEntries, shouldBrowseOnStart };
})(typeof window !== 'undefined' ? window : globalThis);
