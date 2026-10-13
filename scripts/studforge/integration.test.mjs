import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../public/studforge/', import.meta.url);
const json = path => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));
const catalog = json('models/catalog.json');
const index = json('data/omr/index.json');
const manifest = json('data/ldraw/manifest.json');
const context = { window: {} }; vm.createContext(context);
for (const file of ['colors.js', 'ldraw-palette.js', 'omr.js']) vm.runInContext(fs.readFileSync(new URL(`js/${file}`, root), 'utf8'), context);
test('all character sets expand with complete geometry and valid source inventory', () => {
    assert.equal(index.models.length, 116);
    assert.equal(new Set(index.models.map(m => m.id)).size, 116);
    for (const entry of catalog) {
        const row = index.models.find(m => m.id === entry.setNumber);
        assert.ok(row, entry.name);
        const data = json(`data/omr/${row.file}`), model = context.window.FORGE.omr.expand(data);
        assert.equal(model.bricks.length, entry.pieceCount);
        assert.equal(data.stats.droppedRefs, 0);
        assert.ok(['steps', 'layers'].includes(model.stepKind));
        for (const brick of model.bricks) {
            assert.ok(context.window.LEGO_COLORS[brick.color]);
            assert.ok([brick.x, brick.y, brick.z, ...brick.matrix].every(Number.isFinite));
            assert.ok(brick.layer >= 0 && brick.layer < data.steps);
            assert.ok(manifest.parts[brick.geometryId]);
            const part = json(`data/ldraw/parts/${brick.geometryId}.json`);
            assert.equal(part.i.length, part.tris * 3);
            assert.equal(part.c.length, part.tris);
            assert.ok(part.v.every(Number.isFinite));
            assert.ok(part.i.every(i => Number.isInteger(i) && i >= 0 && i < part.v.length / 3));
            assert.ok(part.c.every(c => c === 16 || context.window.LEGO_COLORS[c]), `Unknown printed color in ${part.id}`);
        }
    }
});
