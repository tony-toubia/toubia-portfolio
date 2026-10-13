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
    root.StudForgeLibrary = { readState, saveState, filterModels, inventory, resumeStep };
})(typeof window !== 'undefined' ? window : globalThis);
