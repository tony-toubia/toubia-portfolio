import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {validateBundle} from './pipeline-core.mjs';
const root = new URL('../../public/studforge/', import.meta.url);
const json = path => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));
const catalog = json('models/catalog.json');
const index = json('data/omr/index.json');
const manifest = json('data/ldraw/manifest.json');
const context = { window: {} }; vm.createContext(context);
for (const file of ['colors.js', 'ldraw-palette.js', 'omr.js']) vm.runInContext(fs.readFileSync(new URL(`js/${file}`, root), 'utf8'), context);
test('every library kit and starter tile points to a nonempty rendered preview',()=>{
    for(const row of index.models){
        assert.ok(row.thumbnail,`Missing library thumbnail link: ${row.id}`);
        const bytes=fs.readFileSync(new URL(row.thumbnail,root));
        assert.ok(bytes.length>1000,row.id);assert.equal(bytes.subarray(1,4).toString(),'PNG',row.id);
    }
    vm.runInContext(fs.readFileSync(new URL('js/models-db.js',root),'utf8'),context);
    for(const idea of context.window.INSPIRATION_MODELS){
        const bytes=fs.readFileSync(new URL(`thumbnails/${idea.id}.png`,root));
        assert.ok(bytes.length>1000,idea.id);assert.equal(bytes.subarray(1,4).toString(),'PNG',idea.id);
    }
});
test('all bundled sets expand with complete geometry, thumbnails and valid source inventory', () => {
    assert.ok(index.models.length >= 116);
    const baseline = JSON.parse(fs.readFileSync(new URL('./baseline-sets.json', import.meta.url), 'utf8'));
    for (const id of baseline) assert.ok(index.models.some(row => row.id === id), `Existing set removed: ${id}`);
    assert.equal(new Set(index.models.map(m => m.id)).size, index.models.length);
    for (const entry of catalog) {
        const row = index.models.find(m => m.id === entry.setNumber);
        assert.ok(row, entry.name);
        validateBundle(fs.readFileSync(new URL(entry.modelUrl, root), 'utf8'));
        assert.ok(fs.statSync(new URL(entry.thumbnail, root)).size > 1000);
        const data = json(`data/omr/${row.file}`), model = context.window.FORGE.omr.expand(data);
        assert.equal(model.bricks.filter(brick=>!brick.segment).length, entry.pieceCount);
        assert.deepEqual(data.source.missing, entry.missing);
        assert.equal(data.stats.droppedRefs, 0);
        assert.ok(['steps', 'layers'].includes(model.stepKind));
        const checked = new Set();
        for (const brick of model.bricks) {
            assert.ok(context.window.LEGO_COLORS[brick.color]);
            assert.ok([brick.x, brick.y, brick.z, ...brick.matrix].every(Number.isFinite));
            assert.ok(brick.layer >= 0 && brick.layer < data.steps);
            assert.ok(manifest.parts[brick.geometryId]);
            if (checked.has(brick.geometryId)) continue;
            checked.add(brick.geometryId);
            const part = json(`data/ldraw/parts/${brick.geometryId}.json`);
            assert.equal(part.i.length, part.tris * 3);
            assert.equal(part.c.length, part.tris);
            assert.ok(part.v.every(Number.isFinite));
            assert.ok(part.i.every(i => Number.isInteger(i) && i >= 0 && i < part.v.length / 3));
            assert.ok(part.c.every(c => c === 16 || context.window.LEGO_COLORS[c]), `Unknown printed color in ${part.id}`);
        }
    }
});
