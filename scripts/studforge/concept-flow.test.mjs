import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd(), require = createRequire(import.meta.url);
const sketch = { base: { w: 10, d: 8, color: 'LIGHT_GREY' }, ops: [
    { op: 'box', x0: 3, x1: 6, z0: 2, z1: 5, color: 'RED', y0: 1, y1: 6 },
    { op: 'box', x0: 3, x1: 6, z0: 2, z1: 5, color: 'WHITE', y0: 7, y1: 12 },
    { op: 'box', x0: 1, x1: 2, z0: 4, z1: 5, color: 'WHITE', y0: 7, y1: 9 },
] };
const concept = { id: 'concept-1', name: 'Hawks display', description: 'White hawk in its red H shirt.', features: ['White head', 'Red H shirt', 'Left-facing beak'], sketch };
const prompt = 'Highlands Hawks mascot for Highlands Elementary in Fairway KS';

function moduleFrom(file, fetcher, modules = {}) {
    const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(source, { module, exports: module.exports, require: id => modules[id] || require(id), process: { cwd: () => root, env: { ANTHROPIC_API_KEY: 'fixture-secret', NODE_ENV: 'test' } }, fetch: fetcher, Buffer, URL, AbortSignal, AbortController, setTimeout, clearTimeout, console });
    return module.exports;
}
function endpoint(answers) {
    const calls = [];
    const fetcher = async (url, options) => {
        if (url.includes('resources.finalsite.net')) return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="226" height="50"><rect x="10" y="5" width="24" height="40" fill="red"/></svg>');
        assert.equal(url, 'https://api.anthropic.com/v1/messages');
        calls.push(JSON.parse(options.body));
        const answer = answers.shift();
        assert.ok(answer, 'unexpected extra AI request');
        if (answer.response) return Response.json(answer.response);
        return Response.json({ content: [{ type: 'text', text: JSON.stringify(answer.raw || answer) }, ...(answer.sources ? [{ type: 'web_search_tool_result', content: answer.sources.map(s => ({ ...s, type: 'web_search_result' })) }] : [])] });
    };
    const support = moduleFrom('src/lib/studforge/concepts.ts', fetcher);
    const route = moduleFrom('src/app/api/studforge/idea/route.ts', fetcher, { '@/lib/studforge/concepts': support, '@/lib/studforge/gate': { AI_COOKIE: 'test', tokenValid: () => true }, '@/lib/studforge/omr-examples': { exampleFor: () => null, blueprintUserMessage: p => p, withCredit: p => p } });
    const post = async body => {
        const req = new Request('http://localhost/api/studforge/idea', { method: 'POST', body: JSON.stringify(body) });
        req.cookies = { get: () => ({ value: 'test' }) };
        const response = await route.POST(req);
        return { status: response.status, data: await response.json() };
    };
    return { post, calls, support };
}
const vocab = { colors: ['LIGHT_GREY', 'RED', 'WHITE'], modules: [{ id: 'example', params: [] }], parts: [{ id: '3001', name: 'Brick', w: 2, l: 4, hp: 3 }] };

test('official named mascot is imaged; approved sketch is bound into the subsequent design request', async () => {
    const e = endpoint([{ identity: 'Generic eagle', referenceStatus: 'imagined', concepts: [concept] }, { name: concept.name, description: concept.description, ...sketch }]);
    const planned = await e.post({ mode: 'concepts', prompt, ...vocab });
    assert.equal(planned.data.referenceStatus, 'image');
    assert.match(planned.data.identity, /Highlands Hawks/);
    assert.ok(planned.data.sources.every(s => s.url.startsWith('https://highlands.smsd.org/')));
    assert.equal(e.calls.length, 1, 'planning must not request the full build yet');
    assert.equal(e.calls[0].messages[0].content[0].source.media_type, 'image/png');
    const format = e.calls[0].output_config.format;
    assert.equal(format.type, 'json_schema');
    assert.deepEqual(format.schema.properties.concepts.items.properties.sketch.properties.ops.items.anyOf.map(s => s.properties.op.const), ['box', 'slab']);
    assert.deepEqual(format.schema.properties.concepts.items.properties.sketch.properties.base.properties.color.enum, vocab.colors);
    assert.equal(format.schema.additionalProperties, false);
    assert.equal(e.calls[0].thinking.type, 'between_tools');
    assert.match(e.calls[0].messages[0].content[1].text, /red shirt with white H/);
    const built = await e.post({ mode: 'blueprint', prompt, ...vocab, selection: planned.data.concepts[0].selection });
    assert.equal(built.data.source, 'claude');
    assert.match(e.calls[1].messages[0].content[1].text, /APPROVED CONCEPT/);
    assert.deepEqual(built.data.blueprint.ops, sketch.ops);
});

test('named subject never quietly substitutes a generic model; fabricated sources are dropped', async () => {
    const e = endpoint([{ raw: { requiresReference: true, identity: 'Generic bird', sources: [{ title: 'Fake school', url: 'https://madeup.example/logo' }], concepts: [concept] } }]);
    const result = await e.post({ mode: 'concepts', prompt: 'Westchester School mascot in Ohio', ...vocab });
    assert.equal(result.data.referenceStatus, 'unresolved');
    assert.deepEqual(result.data.concepts, []);
    assert.ok(e.calls[0].tools.some(t => t.name === 'web_search'));
    assert.equal(e.calls[0].output_config.format, undefined, 'web search citations must not conflict with strict JSON output');
});

test('concept drift and forged/reused approvals are rejected', async () => {
    const changed = { ...sketch, base: { ...sketch.base, w: 14 } };
    const e = endpoint([{ concepts: [concept] }, { name: 'Changed design', ...changed }]);
    const plan = await e.post({ mode: 'concepts', prompt: 'a friendly robot', ...vocab });
    const drift = await e.post({ mode: 'blueprint', prompt: 'a friendly robot', ...vocab, selection: plan.data.concepts[0].selection });
    assert.equal(drift.data.reason, 'concept-drift');
    const reused = await e.post({ mode: 'blueprint', prompt: 'a dinosaur', ...vocab, selection: plan.data.concepts[0].selection });
    assert.equal(reused.status, 400);
    assert.equal(e.support.readSelection(plan.data.concepts[0].selection + 'x', 'a friendly robot', undefined, 'fixture-secret'), null);
    assert.equal(e.support.followsSelection({ ...sketch, ops: [...sketch.ops, { op: 'box', x0: 0, x1: 9, z0: 0, z1: 7, color: 'RED', y0: 1, y1: 12 }] }, concept), false, 'giant later fills must not repaint or surround the approved structure');
    assert.equal(e.support.followsSelection({ ...sketch, ops: [...sketch.ops, { op: 'box', x0: 4, x1: 4, z0: 5, z1: 5, color: 'RED', y0: 9, y1: 9 }] }, concept), true, 'small facial/marking details remain allowed');
});

test('source-only references are honest and user images are bound to approval', async () => {
    const source = { title: 'Official school', url: 'https://school.example/mascot' };
    const e = endpoint([{ raw: { requiresReference: true, sources: [source], concepts: [concept] }, sources: [source] }, { concepts: [concept] }]);
    const sourced = await e.post({ mode: 'concepts', prompt: 'Westchester School mascot', ...vocab });
    assert.equal(sourced.data.referenceStatus, 'sources');
    assert.match(sourced.data.message, /unconfirmed/);
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    const imaged = await e.post({ mode: 'concepts', prompt: 'Westchester School mascot', referenceImage: image, ...vocab });
    assert.equal(imaged.data.referenceStatus, 'image');
    assert.equal(e.support.readSelection(imaged.data.concepts[0].selection, 'Westchester School mascot', undefined, 'fixture-secret'), null);
});

test('actual search results remain source references even when AI omits JSON source list', async () => {
    const source = { title: 'Official school', url: 'https://school.example/mascot' };
    const e = endpoint([{ raw: { requiresReference: true, concepts: [concept] }, sources: [source] }]);
    const result = await e.post({ mode: 'concepts', prompt: 'Westchester School mascot', ...vocab });
    assert.equal(result.data.referenceStatus, 'sources');
    assert.deepEqual(result.data.sources, [source]);
});

test('user-uploaded mascot image takes priority without claiming it is the official school logo', async () => {
    const e = endpoint([{ concepts: [concept] }]);
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    const result = await e.post({ mode: 'concepts', prompt, referenceImage: image, ...vocab });
    const content = e.calls[0].messages[0].content;
    assert.equal(content[0].source.data, image.split(',')[1]);
    assert.match(content[1].text, /user-selected real visual reference/);
    assert.doesNotMatch(content[1].text, /attached image is rasterized/);
    assert.doesNotMatch(content[1].text, /red shirt with white H/);
    assert.equal(result.data.referenceImage, null);
});

test('malformed, truncated, refused and invalid concept answers produce distinct safe errors', async () => {
    const responses = [
        { response: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'This is not JSON.' }] } },
        { response: { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"concepts":[' }] } },
        { response: { stop_reason: 'refusal', content: [{ type: 'text', text: 'No.' }] } },
        { concepts: [{ ...concept, sketch: { ...sketch, ops: sketch.ops.map(o => ({ ...o, color: 'UNKNOWN_COLOR' })) } }] },
    ];
    const total = responses.length, e = endpoint(responses);
    const reasons = [];
    for (let i = 0; i < total; i++) reasons.push((await e.post({ mode: 'concepts', prompt, ...vocab })).data.reason);
    assert.deepEqual(reasons, ['concept-malformed', 'concept-truncated', 'concept-refused', 'concept-invalid']);
});

test('documented enum case deviations normalize while 32-op practical cap leaves detail budget', async () => {
    const lower = { ...concept, sketch: { base: { ...sketch.base, color: 'light_grey' }, ops: sketch.ops.map(o => ({ ...o, op: 'Box', color: o.color.toLowerCase() })) } };
    const thirtyTwo = { ...concept, sketch: { ...sketch, ops: Array.from({ length: 32 }, (_, i) => sketch.ops[i % 3]) } };
    const tooMany = { ...concept, sketch: { ...sketch, ops: [...thirtyTwo.sketch.ops, sketch.ops[0]] } };
    const e = endpoint([{ concepts: [lower] }, { concepts: [thirtyTwo] }, { concepts: [tooMany] }]);
    const first = await e.post({ mode: 'concepts', prompt, ...vocab });
    assert.deepEqual(first.data.concepts[0].sketch, sketch);
    const valid = await e.post({ mode: 'concepts', prompt, ...vocab }); assert.equal(valid.data.concepts[0].sketch.ops.length, 32);
    const invalid = await e.post({ mode: 'concepts', prompt, ...vocab }); assert.equal(invalid.data.reason, 'concept-invalid');
});

test('approved structure equality ignores object property order but preserves values and operation order', () => {
    const support = moduleFrom('src/lib/studforge/concepts.ts', async () => { throw new Error('no network expected'); });
    const reordered = { base: { color: sketch.base.color, d: sketch.base.d, w: sketch.base.w }, ops: sketch.ops.map(op => Object.fromEntries(Object.entries(op).reverse())) };
    assert.equal(support.followsSelection(reordered, concept), true);
    assert.equal(support.followsSelection({ ...reordered, ops: [{ ...reordered.ops[0], x0: 4 }, ...reordered.ops.slice(1)] }, concept), false);
    assert.equal(support.followsSelection({ ...reordered, ops: [{ ...reordered.ops[0], color: 'WHITE' }, ...reordered.ops.slice(1)] }, concept), false);
    assert.equal(support.followsSelection({ ...reordered, ops: [...reordered.ops].reverse() }, concept), false);
});

test('flat mosaic refinement preserves every exposed approved color, including raised H details', () => {
    const support = moduleFrom('src/lib/studforge/concepts.ts', async () => { throw new Error('no network expected'); });
    const rect = (x0,x1,z0,z1,color,y=1) => ({op:'box',x0,x1,z0,z1,y0:y,y1:y,color});
    const mosaic = { id:'mosaic', name:'Hawks shirt H', description:'White H on a red shirt', features:['Red shirt','White H'], sketch:{base:{w:10,d:10,color:'BLACK'},ops:[rect(0,9,0,9,'WHITE'),rect(2,7,2,8,'RED'),rect(3,3,3,7,'WHITE'),rect(6,6,3,7,'WHITE'),rect(3,6,5,5,'WHITE')]} };
    const original = JSON.stringify(mosaic);
    assert.equal(support.followsSelection(mosaic.sketch,mosaic),true,'untouched mosaic remains approved');
    assert.equal(support.followsSelection({...mosaic.sketch,ops:[...mosaic.sketch.ops,rect(2,2,2,2,'RED',2),rect(3,3,3,4,'WHITE',2)]},mosaic),true,'raised red shirt and white H details keep their original top colors');
    assert.equal(support.followsSelection({...mosaic.sketch,ops:[...mosaic.sketch.ops,rect(2,4,3,6,'WHITE',2)]},mosaic),false,'a raised white rectangle must not cover red cells even if it meets old volume allowance');
    assert.equal(JSON.stringify(mosaic),original,'color checking never mutates the approved mosaic');
    assert.equal(support.followsSelection({...sketch,ops:[...sketch.ops,rect(4,4,5,5,'RED',9)]},concept),true,'upright models retain their small marking allowance');
});

function client(mode, answers, faults = [], draftFaults = []) {
    class Element {
        constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.value = ''; this.open = false; this.classList = { add() {}, remove() {} }; }
        setAttribute(k, v) { this.attributes[k] = v; }
        addEventListener(k, cb) { this.listeners[k] = cb; }
        appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
        insertBefore(c, before) { c.parentNode = this; const index = this.children.indexOf(before); if (index < 0) this.children.push(c); else this.children.splice(index, 0, c); return c; }
        replaceChildren() { this.children = []; }
        querySelector(s) { this.selectors ||= {}; if (!this.selectors[s]) { this.selectors[s] = new Element(s); this.appendChild(this.selectors[s]); } return this.selectors[s]; }
        querySelectorAll(s) { return s === 'button' ? this.children.filter(c => c.tag === 'button') : []; }
        get childElementCount() { return this.children.length; }
        showModal() { this.open = true; }
        close() { this.open = false; }
        focus() {}
        remove() {}
    }
    const body = new Element('body'), head = new Element('head'), btn = new Element('button'), input = new Element('input'), events = {}, requests = [], forged = [];
    input.value = prompt;
    const sf = { engine: 'quick', state: { prompt: 'existing kit', variant: 0 }, promptInput: input, model: {}, generator: { generateFromPrompt: (_prompt, _variant, opts) => ({ kind: 'blueprint', bricks: Array(80).fill({}), anchor: (opts.previewConcept ? draftFaults.shift() : faults.shift()) || {}, warnings: [] }) }, forge: (...args) => { forged.push(args); return {}; }, setPrompt: p => input.value = p, setEngine(id) { this.engine = id; }, registerEngine: () => ({ setLocked() {} }), on() {}, toast() {} };
    const document = { head, body, createElement: tag => new Element(tag), createTextNode: s => s, getElementById: id => id === 'btn-generate' ? btn : id === 'model-desc' ? null : new Element(id), addEventListener: (name, cb) => events[name] = cb };
    const context = { document, console, setTimeout, clearTimeout, AbortController, localStorage: { getItem: () => mode, setItem() {} }, fetch: async (url, options) => { requests.push(JSON.parse(options.body)); return { ok: true, status: 200, json: async () => answers.shift() }; }, window: { studForge: sf, LEGO_COLORS: { RED: { hex: '#ff0000' }, WHITE: { hex: '#ffffff' }, LIGHT_GREY: { hex: '#aabbcc' } }, FORGE: { blueprint: { validate: bp => ({ ok: true, bp }), vocab: () => vocab } } } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'public/studforge/js/concept-core.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(root, 'public/studforge/js/idea-ai.js'), 'utf8'), context);
    return { dialog: body.children[0], requests, forged, events, input, sf, button: btn };
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
function clickGenerate(c) { let stopped = false; c.events.click({ target: { closest: () => true }, stopImmediatePropagation() { stopped = true; }, preventDefault() {} }); return stopped; }
const planAnswer = { source: 'claude', identity: 'Highlands Hawks', referenceStatus: 'image', concepts: [{ ...concept, selection: 'signed-fixture' }], sources: [] };
const buildAnswer = { source: 'claude', blueprint: { name: concept.name, ...sketch } };

test('client waits for concept selection, then builds exactly that choice; Quick remains accessible', async () => {
    const c = client('design', [planAnswer, buildAnswer]);
    assert.equal(clickGenerate(c), true); await settle();
    assert.equal(c.forged.length, 0);
    const cards = c.dialog.querySelector('.sfconcept-cards'), build = c.dialog.querySelector('.sfconcept-build');
    assert.equal(build.disabled, true);
    cards.children[0].listeners.click(); assert.equal(build.disabled, false);
    await build.listeners.click();
    assert.equal(c.forged.length, 1);
    assert.equal(c.requests[1].selection, 'signed-fixture');
    assert.equal(c.forged[0][2].concept.identity, 'Highlands Hawks');
    assert.equal(c.dialog.open, false);
    const quick = client('off', []); assert.equal(clickGenerate(quick), false); assert.equal(quick.requests.length, 0);
    assert.equal(quick.button.textContent, 'QUICK BUILD');
});

test('client keeps current kit on AI failure and attempts one measured assembly repair', async () => {
    const unavailable = client('design', [{ source: 'local', reason: 'upstream' }]); clickGenerate(unavailable); await settle();
    assert.equal(unavailable.forged.length, 0);
    assert.match(unavailable.dialog.querySelector('.sfconcept-status').textContent, /current kit/);
    const repair = client('design', [planAnswer, buildAnswer, buildAnswer], [{ struts: 8, maxStrut: 16 }, {}]); clickGenerate(repair); await settle();
    repair.dialog.querySelector('.sfconcept-cards').children[0].listeners.click(); await repair.dialog.querySelector('.sfconcept-build').listeners.click();
    assert.equal(repair.forged.length, 1);
    assert.equal(repair.requests.length, 3);
    assert.match(repair.requests[2].correction, /8 rescue supports/);
    assert.ok(repair.requests[2].previousBlueprint);
});

test('closing a pending chooser or revising prompt cannot build a stale concept', async () => {
    const c = client('design', [planAnswer, buildAnswer]); clickGenerate(c); await settle();
    c.dialog.querySelector('.sfconcept-cards').children[0].listeners.click();
    c.dialog.querySelector('textarea').value = 'a different idea'; c.dialog.querySelector('textarea').listeners.input();
    assert.equal(c.dialog.querySelector('.sfconcept-build').disabled, true);
    await c.dialog.querySelector('.sfconcept-build').listeners.click(); assert.equal(c.forged.length, 0);
    c.dialog.querySelector('.sfconcept-close').listeners.click(); assert.equal(c.dialog.open, false);
});

test('floating structural sketches cannot become enabled choices and get one preflight repair', async () => {
    const c = client('design', [planAnswer, planAnswer], [], [{ struts: 3 }, { struts: 2 }]);
    clickGenerate(c); await settle();
    assert.equal(c.requests.length, 2);
    assert.match(c.requests[1].correction, /3 rescue supports/);
    assert.equal(c.dialog.querySelector('.sfconcept-cards').childElementCount, 0);
    assert.equal(c.dialog.querySelector('.sfconcept-build').disabled, true);
    assert.equal(c.forged.length, 0);
    assert.match(c.dialog.querySelector('.sfconcept-status').textContent, /still need refinement/);
    const details = c.dialog.children.find(child => child.className === 'sfconcept-checks');
    assert.equal(details.hidden, false);
    assert.match(details.children[1].children[0].textContent, /Option 1: 2 extra supports needed/);
    assert.match(c.requests[1].correction, /missingFromY/);
    assert.match(c.requests[1].correction, /VERTICAL backing panel does not support/);
});
