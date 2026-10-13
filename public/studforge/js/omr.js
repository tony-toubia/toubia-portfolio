// StudForge real sets from the LDraw Official Model Repository (OMR): loader and expander.
//
//   FORGE.omr.list()               -> Promise of the index entries ({ id, name, year, theme, subject, pieces, steps, ... })
//   FORGE.omr.forSubject(subject)  -> Promise of the index entries for a knowledge subject ('fireTruck', 'castle', ...)
//   FORGE.omr.load(id)             -> Promise of a model shaped like a generator model, so studForge.load(model) shows it
//   FORGE.omr.expand(data)         -> the same, from an already fetched "studforge-omr-1" file
//
// The converted files (data/omr/<id>.json, built by scripts/ldraw/omr-convert.mjs) keep the real instruction steps,
// so `layer = step` makes the viewer's step slider, the STEPS panel and the booklet follow the real build. Each brick
// carries its LDraw part id (rendered with geometry baked from the LDraw library), our catalog id when there is one,
// its full rotation matrix and, for grid-aligned parts, the stud/plate footprint.
// Models: LDraw OMR authors (named per model), CC BY 2.0/4.0. Part geometry: LDraw.org Parts Library, CC BY 2.0/4.0.
(() => {
    window.FORGE = window.FORGE || { builders: [], helpers: {} };
    // Resolved against the page, so it works wherever StudForge is served from.
    const BASE = 'data/omr/';
    const CATEGORY = {
        fireTruck: 'Vehicles', policeCar: 'Vehicles', ambulance: 'Vehicles', car: 'Vehicles', truck: 'Vehicles', monsterTruck: 'Vehicles',
        garbageTruck: 'Vehicles', bus: 'Vehicles', tractor: 'Vehicles', construction: 'Vehicles', motorcycle: 'Vehicles', train: 'Vehicles',
        plane: 'Vehicles', helicopter: 'Vehicles', boat: 'Vehicles', ship: 'Vehicles', pirateShip: 'Vehicles', submarine: 'Vehicles', tank: 'Vehicles',
        rocket: 'Space & Sci-Fi', spaceship: 'Space & Sci-Fi', rover: 'Space & Sci-Fi', spaceStation: 'Space & Sci-Fi', robot: 'Space & Sci-Fi',
        house: 'Architecture', tower: 'Architecture', lighthouse: 'Architecture', windmill: 'Architecture', bridge: 'Architecture',
        shop: 'Architecture', station: 'Architecture', castle: 'Castle & Fantasy', dragon: 'Castle & Fantasy',
        farm: 'Nature', dinosaur: 'Nature', animal: 'Nature', bird: 'Nature', seaCreature: 'Nature', tree: 'Nature', flower: 'Nature',
    };
    let indexPromise = null;
    const modelCache = new Map();

    const fetchJSON = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); });
    function index() {
        if (!indexPromise) indexPromise = fetchJSON(BASE + 'index.json').catch((e) => { indexPromise = null; throw e; });
        return indexPromise;
    }
    const list = () => index().then((ix) => ix.models.slice());
    const forSubject = (subject) => list().then((models) => models.filter((m) => m.subject === subject));

    // Same thresholds as the generator, so a real set and a forged model read alike.
    function difficultyOf(pieces) { return pieces < 60 ? 'Beginner' : pieces < 140 ? 'Intermediate' : pieces < 260 ? 'Advanced' : 'Master Builder'; }
    const authorsText = (a) => { a = (a || []).map((s) => s.replace(/\s*\[[^\]]*\]\s*$/, '') || s.replace(/[[\]]/g, '')); return a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0] || 'the LDraw community'; };

    function expand(data) {
        const fp = (b) => (b[16] === null || b[16] === undefined ? null : { x0: b[16], z0: b[17], y0: b[18], w: b[19], l: b[20], hp: b[21] });
        const minifig = new Set(data.minifigParts || []);
        const bricks = data.bricks.map((b) => {
            const [ldrawId, catalogId, partName, flag, geometryId] = data.parts[b[0]];
            const brick = {
                partId: ldrawId, catalogId: catalogId || null, color: data.colors[b[1]] || 'LIGHT_GREY',
                x: b[2], y: b[3], z: b[4], matrix: b.slice(5, 14), rotX: 0, rotY: 0, rotZ: 0,
                layer: b[14], sub: data.submodels[b[15]] || 'main', fp: fp(b), baked: true,
                partName, geometryId,
            };
            if (minifig.has(b[0])) brick.minifig = true;
            if (flag === 'segment') brick.segment = true;
            if (flag === 'baseplate') brick.baseplate = true;
            return brick;
        });
        const pieces = data.pieces || bricks.length;
        const mins = Math.max(10, Math.round(pieces * 0.11 / 5) * 5);
        const authors = data.source && data.source.authors || [];
        const subs = (data.submodels || []).length - 1;
        const description = `${data.name}: community recreation of ${data.year ? `${data.year} ` : ''}${data.theme.split(' > ')[0]} set ${data.id.replace(/-[a-z].*$/, '')}, ${pieces} model pieces in ${data.steps} ${data.stepKind === 'layers' ? 'inspection layers' : 'steps'}`
            + (subs > 0 ? ` with ${subs} sub-assembl${subs === 1 ? 'y' : 'ies'}` : '')
            + `, rebuilt from the LDraw OMR file by ${authorsText(authors)}.`
            + (data.dims ? ` ${data.dims.w}×${data.dims.d} studs, ${data.dims.h} bricks tall.` : '')
            // The file's big steps (a whole sub-assembly at once) are split bottom-up by the converter: say so.
            + (data.stats && data.stats.fileSteps && data.stats.fileSteps < data.steps ? ` The file builds some sub-assemblies in one go, so those steps are split into layers (${data.stats.fileSteps} steps in the file).` : '');
        return {
            id: data.id, name: data.name, category: data.category || CATEGORY[data.subject] || 'Custom Creation', icon: '🏷️',
            difficulty: difficultyOf(pieces), estTime: `${mins} mins`, description, kind: 'reference', prompt: '', variant: 0,
            dims: data.dims, steps: data.steps, stepKind: data.stepKind || 'steps', subject: data.subject, submodels: data.submodels,
            reference: { setId: data.id, year: data.year, theme: data.theme, authors, url: data.source && data.source.url,
                file: data.source && data.source.file, licence: data.source && data.source.licence, stats: data.stats,
                instructionsUrl: data.source && data.source.instructionsUrl, missing: data.source && data.source.missing },
            bricks,
        };
    }

    function load(id) {
        if (!modelCache.has(id)) {
            const p = index().then((ix) => {
                const entry = ix.models.find((m) => m.id === id);
                if (!entry) throw new Error(`unknown OMR model ${id}`);
                return fetchJSON(BASE + entry.file);
            }).catch((e) => { modelCache.delete(id); throw e; });
            modelCache.set(id, p);
        }
        // A fresh expansion each time: the viewer and features may annotate the model they are given.
        return modelCache.get(id).then(expand);
    }

    window.FORGE.omr = { list, forSubject, load, expand, index };
})();
