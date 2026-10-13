import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const blueprint = { name: 'Approved hawk', description: 'White hawk in a red H shirt', base: { w: 12, d: 10, color: 'LIGHT_GREY' }, ops: [
    { op: 'box', x0: 4, x1: 7, z0: 4, z1: 6, y0: 1, y1: 6, color: 'RED' },
    { op: 'box', x0: 4, x1: 7, z0: 4, z1: 6, y0: 7, y1: 12, color: 'WHITE' },
] };
const concept = { id: 'concept-1', name: 'Approved hawk', identity: 'Highlands Hawks', referenceStatus: 'image', sources: [{ title: 'Official school', url: 'https://highlands.smsd.org/' }], sketch: { base: blueprint.base, ops: blueprint.ops }, selection: 'must-not-persist', referenceImage: 'data:image/png;base64,must-not-persist' };
class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.classList = { add() {}, remove() {}, toggle() {} }; }
    appendChild(n) { this.children.push(n); return n; }
    addEventListener(name, cb) { this.listeners[name] = cb; }
    setAttribute() {}
    remove() {}
}
function gallery(storage = new Map(), search = '') {
    const events = {}, notices = [], historyWrites = [], clipboard = [];
    const context = { console, URL, URLSearchParams, setTimeout, clearTimeout, btoa: x => Buffer.from(x).toString('base64'), atob: x => Buffer.from(x, 'base64').toString(), unescape, escape, encodeURIComponent, decodeURIComponent,
        location: { origin: 'https://www.tonytoubia.com', pathname: '/studforge/index.html', search, hash: '' }, history: { state: {}, replaceState: (...args) => historyWrites.push(args[2]) },
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        document: { head: new Node('head'), body: new Node('body'), createElement: tag => new Node(tag), addEventListener() {} }, navigator: { clipboard: { writeText: async s => clipboard.push(s) } } };
    context.window = context; vm.createContext(context);
    for (const file of ['colors','parts-catalog','forge-grid','forge-modules','blueprint','forge-builders','forge-builders-2','forge-builders-3','models-db','generator','library-core','concept-core']) vm.runInContext(fs.readFileSync(path.join(root, 'public/studforge/js', `${file}.js`), 'utf8'), context);
    vm.runInContext('window.testGenerator = new BrickGenerator()', context);
    const sf = { state: { prompt: '', variant: 0, opts: {} }, model: null, viewer: {}, on: (key, fn) => (events[key] ||= []).push(fn), emit: key => (events[key] || []).forEach(fn => fn()), toast: msg => notices.push(msg), headerAction() {}, shareItem() {}, setPrompt: p => sf.state.prompt = p, closeMake() {},
        forge(prompt, variant, opts) { sf.state = { prompt, variant, opts }; sf.model = context.testGenerator.generateFromPrompt(prompt, variant, opts); sf.emit('model'); return sf.model; } };
    context.studForge = sf;
    vm.runInContext(fs.readFileSync(path.join(root, 'public/studforge/js/gallery.js'), 'utf8'), context);
    return { sf, storage, notices, historyWrites, clipboard, context };
}

test('approved blueprint saves and reopens with identical pieces and safe concept metadata', () => {
    const app = gallery(), original = app.sf.forge('Highlands Hawks mascot', 2, { blueprint, concept });
    assert.equal(original.anchor.struts, 0, 'the actual structural sketch is supported without rescue columns');
    assert.equal(original.anchor.dropped, 0, 'the actual structural sketch preserves its designed pose');
    assert.equal(original.anchor.stuck, 0);
    app.sf.gallery.save();
    const entry = app.sf.gallery.list()[0];
    assert.ok(entry.opts.blueprint);
    assert.equal(entry.opts.concept.identity, 'Highlands Hawks');
    assert.equal(entry.opts.concept.selection, undefined);
    assert.equal(entry.opts.concept.referenceImage, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(entry.opts.blueprint)), blueprint);
    app.sf.forge('blue car', 0, {}); app.sf.gallery.open(entry);
    assert.equal(app.sf.model.kind, 'blueprint');
    assert.equal(app.sf.model.concept.identity, 'Highlands Hawks');
    assert.deepEqual(JSON.parse(JSON.stringify(app.sf.model.bricks)), JSON.parse(JSON.stringify(original.bricks)));
    assert.equal(app.sf.gallery.shareLink(), null);
});

test('recent designs resume on reload and misleading custom links are not copied', async () => {
    const app = gallery(), original = app.sf.forge('Highlands Hawks mascot', 0, { blueprint, concept });
    const recent = app.sf.gallery.recent()[0]; assert.ok(recent.opts.blueprint);
    const address = app.historyWrites.at(-1); assert.match(address, /\?build=/); assert.doesNotMatch(address, /idea=/);
    const reloaded = gallery(app.storage, address.slice(address.indexOf('?')));
    assert.equal(reloaded.sf.model.kind, 'blueprint');
    assert.deepEqual(JSON.parse(JSON.stringify(reloaded.sf.model.bricks)), JSON.parse(JSON.stringify(original.bricks)));
    await reloaded.sf.gallery.copyLink(); assert.equal(reloaded.clipboard.length, 0); assert.match(reloaded.notices.at(-1), /Download card/);
    app.sf.forge('blue car', 0, {}); assert.match(app.sf.gallery.shareLink(), /idea=blue%20car/);
});

test('distinct layouts with the same generated name/id retain distinct local resume addresses', () => {
    const app = gallery(), first = app.sf.forge('Highlands Hawks mascot', 0, { blueprint, concept }), address = app.historyWrites.at(-1);
    const revised = { ...blueprint, ops: blueprint.ops.map(op => ({ ...op, x0: op.x0 + 1, x1: op.x1 + 1 })) };
    const second = app.sf.forge('Highlands Hawks mascot', 0, { blueprint: revised, concept });
    assert.equal(first.id, second.id);
    assert.notEqual(address, app.historyWrites.at(-1));
    const reopened = gallery(app.storage, address.slice(address.indexOf('?')));
    assert.deepEqual(JSON.parse(JSON.stringify(reopened.sf.model.bricks)), JSON.parse(JSON.stringify(first.bricks)));
});

test('horizontal mascot mosaic is supported and diagram preserves the final overwritten shirt/H colors', () => {
    const app = gallery(), rect = (x0,x1,z0,z1,color) => ({ op:'box',x0,x1,z0,z1,y0:1,y1:1,color });
    const mosaic = { name: 'Hawk mosaic', base: { w:16,d:24,color:'BLACK' }, ops:[rect(0,15,0,23,'WHITE'),rect(3,12,2,21,'BLACK'),rect(4,11,3,10,'WHITE'),rect(1,4,7,9,'WHITE'),rect(4,11,11,18,'RED'),rect(6,6,12,17,'WHITE'),rect(9,9,12,17,'WHITE'),rect(6,9,14,14,'WHITE'),rect(5,6,19,21,'WHITE'),rect(9,10,19,21,'WHITE'),rect(8,8,5,5,'BLACK'),rect(2,3,9,10,'BLACK')] };
    const model = app.context.testGenerator.generateFromPrompt('a school hawk mosaic', 0, { blueprint:mosaic,concept:{id:'approved'} });
    assert.deepEqual(JSON.parse(JSON.stringify(app.context.StudForgeConcept.quality(model))), []);
    assert.equal(model.anchor.struts,0); assert.equal(model.anchor.dropped,0);
    const top = new Map();
    for (const brick of model.bricks) { const f = brick.fp; if (!f || brick.ghost) continue; for (let x=f.x0;x<f.x0+f.w;x++) for (let z=f.z0;z<f.z0+f.l;z++) { const k=`${x},${z}`, y=f.y0+f.hp-1; if (!top.has(k) || top.get(k).y<y) top.set(k,{y,color:brick.color}); } }
    const expected = {}; for (const cell of top.values()) expected[cell.color]=(expected[cell.color]||0)+1;
    const svg = app.context.StudForgeConcept.diagram({name:mosaic.name,sketch:mosaic},app.context.LEGO_COLORS), actual = {};
    for (const match of svg.matchAll(/data-face="top" data-color="([A-Z_]+)"/g)) actual[match[1]]=(actual[match[1]]||0)+1;
    assert.deepEqual(actual,expected);
    assert.ok(actual.RED>0 && actual.WHITE>0 && actual.BLACK>0);
    assert.equal(Object.values(actual).reduce((a,b)=>a+b,0),16*24);
});

test('3D diagram exposes real outer surfaces while hiding buried tops and interior faces', () => {
    const app=gallery(), shape={name:'Stacked statue',sketch:{base:{w:2,d:2,color:'BLACK'},ops:[{op:'box',x0:0,x1:1,z0:0,z1:1,y0:1,y1:2,color:'RED'},{op:'box',x0:0,x1:1,z0:0,z1:1,y0:3,y1:3,color:'WHITE'}]}};
    const svg=app.context.StudForgeConcept.diagram(shape,app.context.LEGO_COLORS);
    assert.equal([...svg.matchAll(/data-face="top"/g)].length,4);
    assert.equal([...svg.matchAll(/data-face="top" data-color="WHITE"/g)].length,4);
    assert.equal([...svg.matchAll(/data-face="front"/g)].length,8);
    assert.equal([...svg.matchAll(/data-face="side"/g)].length,8);
    assert.doesNotMatch(svg,/NaN|Infinity/);
});
