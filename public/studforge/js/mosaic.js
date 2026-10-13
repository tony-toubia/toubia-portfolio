// StudForge mosaic mode: an emoji or a photo becomes a flat mosaic of 1x1
// plates on a baseplate, 32x32 or 48x48 studs, in real LEGO colours.
//
// The source is rendered to a small canvas, box-filtered down to one sample
// per stud, and each stud takes the nearest opaque colour in the catalog.
// The grid goes through the generator's own assemble() so the parts list,
// exports and every other feature see an ordinary model.
//
// It is a "start from" source in Make (🎨 A mosaic): pick an emoji or a photo, a size and a
// baseplate, then FORGE MOSAIC loads the model and closes Make. showPanel('mosaic') opens it.
(() => {
    const SIZES = [32, 48], SAMPLE = 240;
    const BASES = [['LIGHT_GREY', 'Grey'], ['WHITE', 'White'], ['BLACK', 'Black'], ['TAN', 'Tan'], ['DARK_BLUE', 'Navy'], ['GREEN', 'Green']];
    const QUICK = ['🦊', '🐸', '🐼', '🍕', '🚀', '❤️', '🌈', '👾', '🍄', '🌻', '🦖', '⚡'];

    const css = `
.sfm-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 232px; gap: 14px 22px; align-items: start; }
.sfm-controls { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.sfm-intro { margin: 0; font-size: 14px; color: var(--text-secondary); line-height: 1.4; }
.sfm-field { display: flex; flex-direction: column; gap: 6px; }
.sfm-label { font-family: var(--font-heading); font-size: 9px; font-weight: 700; letter-spacing: 1.2px; color: var(--text-muted); }
.sfm-inline { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sfm-seg { display: inline-flex; border: 1px solid var(--border-main); border-radius: 9px; overflow: hidden; background: var(--bg-main); align-self: flex-start; }
.sfm-seg button { background: transparent; border: none; color: var(--text-secondary); font-family: var(--font-body); font-size: 14px; font-weight: 700; padding: 0 14px; min-height: 34px; cursor: pointer; white-space: nowrap; }
.sfm-seg button + button { border-left: 1px solid var(--border-main); }
.sfm-seg button:hover { color: #fff; }
.sfm-seg button.on { background: rgba(242, 205, 55, 0.12); color: var(--lego-yellow); box-shadow: inset 0 0 0 1px var(--lego-yellow); }
.sfm-src-emoji { display: flex; flex-direction: column; gap: 8px; }
.sfm-src-emoji[hidden], .sfm-src-photo[hidden] { display: none; }
.sfm-emoji-input { width: 100%; box-sizing: border-box; background: var(--bg-main); border: 1px solid var(--border-main); border-radius: 9px; color: #fff; font-size: 24px; height: 46px; padding: 0 12px; text-align: center; outline: none; user-select: text; -webkit-user-select: text; }
.sfm-emoji-input:focus { border-color: var(--border-active); }
.sfm-quick { display: grid; grid-template-columns: repeat(auto-fill, minmax(38px, 1fr)); gap: 6px; }
.sfm-quick button { background: var(--bg-main); border: 1px solid var(--border-main); border-radius: 8px; font-size: 20px; height: 38px; padding: 0; cursor: pointer; line-height: 1; }
.sfm-quick button:hover, .sfm-quick button.on { border-color: var(--lego-yellow); }
.sfm-quick button.on { background: rgba(242, 205, 55, 0.1); }
.sfm-drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 96px; border: 1px dashed rgba(255, 255, 255, 0.25); border-radius: 10px; background: var(--bg-main); padding: 12px; cursor: pointer; text-align: center; font-family: var(--font-body); font-size: 15px; font-weight: 700; color: #fff; }
.sfm-drop.over, .sfm-drop:hover { border-color: var(--lego-yellow); }
.sfm-drop small { font-size: 12px; font-weight: 500; color: var(--text-muted); line-height: 1.35; }
.sfm-drop input { display: none; }
.sfm-select { background: var(--bg-main); border: 1px solid var(--border-main); border-radius: 9px; color: #fff; font-family: var(--font-body); font-size: 14px; font-weight: 600; height: 34px; padding: 0 8px; }
.sfm-check { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: var(--text-secondary); cursor: pointer; min-height: 34px; }
.sfm-check input { accent-color: var(--lego-yellow); width: 16px; height: 16px; }
.sfm-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.sfm-preview-wrap { display: flex; flex-direction: column; gap: 8px; }
.sfm-preview { width: 100%; aspect-ratio: 1; height: auto; image-rendering: pixelated; border-radius: 8px; border: 1px solid var(--border-main); background: var(--bg-main); display: block; }
.sfm-stats { font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); line-height: 1.6; }
.sfm-stats b { color: var(--lego-yellow); font-weight: 600; }
.sfm-forge { padding: 12px 6px; font-size: 11px; }
.sfm-forge:disabled { opacity: 0.5; cursor: default; }
.sfm-tip { font-size: 12px; color: var(--text-muted); line-height: 1.35; }
@media (max-width: 640px) {
  .sfm-wrap { grid-template-columns: 1fr; }
  .sfm-preview-wrap { flex-direction: row; align-items: center; gap: 12px; }
  .sfm-preview { width: 112px; flex-shrink: 0; }
  .sfm-quick { grid-template-columns: repeat(6, 1fr); }
  .sfm-forge { min-height: 46px; font-size: 12px; }
}
`;

    const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    /** Every opaque catalog colour as { id, rgb }. */
    const palette = () => Object.entries(window.LEGO_COLORS || {}).filter(([id, c]) => !c.trans && c.category !== 'Transparent' && !id.startsWith('TRANS')).map(([id, c]) => ({ id, rgb: hex2rgb(c.hex) }));
    /** "Redmean" weighted RGB distance: close enough to perceptual for plastic bricks. */
    const dist = (a, b) => { const rm = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]; return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db; };

    const init = () => {
        const sf = window.studForge;
        if (!sf || !sf.addSource || !window.ForgeGrid) return;
        const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
        const colours = palette();
        const state = { source: 'emoji', emoji: '🦊', size: 32, base: 'LIGHT_GREY', fill: true, photo: null, cells: null };

        /* ── sampling ─────────────────────────────────────────── */

        // The source drawn SAMPLE px square, then averaged into one RGBA sample per stud.
        const sample = (N) => {
            const c = document.createElement('canvas'); c.width = c.height = SAMPLE;
            const x = c.getContext('2d');
            if (state.source === 'photo') {
                if (!state.photo) return null;
                const img = state.photo, s = Math.min(img.width, img.height);
                x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, SAMPLE, SAMPLE);
            } else {
                x.font = `${Math.round(SAMPLE * 0.92)}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", "Twemoji Mozilla", sans-serif`;
                x.textAlign = 'center'; x.textBaseline = 'middle';
                x.fillStyle = '#fff';
                x.fillText(state.emoji || '🦊', SAMPLE / 2, SAMPLE / 2 + SAMPLE * 0.05);
            }
            const data = x.getImageData(0, 0, SAMPLE, SAMPLE).data, out = new Array(N * N);
            const step = SAMPLE / N;
            for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) {
                let R = 0, G = 0, B = 0, A = 0, n = 0;
                const y0 = Math.floor(r * step), y1 = Math.floor((r + 1) * step), x0 = Math.floor(q * step), x1 = Math.floor((q + 1) * step);
                for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * SAMPLE + xx) * 4, a = data[i + 3] / 255; R += data[i] * a; G += data[i + 1] * a; B += data[i + 2] * a; A += a; n++; }
                out[r * N + q] = A > 0 ? [R / A, G / A, B / A, A / n] : [0, 0, 0, 0];
            }
            return out;
        };
        /** Quantise the samples: null for an empty stud, else a colour id. Translucent edges are blended over the base. */
        const quantise = (samples, N) => {
            const base = hex2rgb(window.LEGO_COLORS[state.base].hex);
            return samples.map((s) => {
                if (s[3] < 0.35) return state.fill ? state.base : null;
                const rgb = s[3] >= 0.97 ? s : [0, 1, 2].map((i) => s[i] * s[3] + base[i] * (1 - s[3]));
                let best = null, bd = Infinity;
                for (const c of colours) { const d = dist(rgb, c.rgb); if (d < bd) { bd = d; best = c.id; } }
                return best;
            });
        };

        /* ── the model ────────────────────────────────────────── */

        const build = (cells, N) => {
            const g = new window.ForgeGrid();
            g.box(0, N + 1, 0, N + 1, 0, 0, state.base, { noBrick: true });
            let count = 0; const used = new Set();
            for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) { const c = cells[r * N + q]; if (!c) continue; g.part('3024', c, q + 1, r + 1, 1); count++; used.add(c); }
            const label = state.source === 'photo' ? 'Photo' : 'Emoji', subject = state.source === 'photo' ? `${N}×${N}` : state.emoji;
            let h = 2166136261; for (const c of cells) { for (const ch of String(c)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } }
            const model = sf.generator.assemble(g, {
                id: `mosaic-${(h >>> 0).toString(36)}`, name: `${label} Mosaic ${subject}`, category: 'Mosaic', icon: '🎨', kind: 'mosaic', prompt: state.source === 'photo' ? `photo mosaic ${N}x${N}` : `${state.emoji} mosaic`, variant: 0, seed: h >>> 0,
                title: `${label.toLowerCase()} mosaic`, features: [`${N}×${N} studs`, `${count} one-by-one plates in ${used.size} colours`, `a ${window.LEGO_COLORS[state.base].name.toLowerCase()} baseplate${state.fill ? ' tiled edge to edge' : ' showing through'}`],
                options: [], palette: { primary: state.base }, opts: { colors: {}, scale: null, features: {} }, brief: null, matchKey: 'mosaic',
            });
            // The plates all share one height; build them in eight bands of rows so the step slider walks down the picture.
            const bands = 8;
            for (const b of model.bricks) if (b.layer === 1 && b.partId === '3024') b.layer = 1 + Math.min(bands - 1, Math.floor((b.fp.z0 - 1) / N * bands)) / 10;
            model.steps = new Set(model.bricks.map((b) => b.layer)).size;
            model.description = model.description.replace(/built in \d+ steps/, `built in ${model.steps} steps`);
            return model;
        };

        /* ── the source panel (Make → "A mosaic") ───────────── */

        let open = false;   // the mosaic source is showing in Make
        const src = sf.addSource({ id: 'mosaic', icon: '🎨', label: 'A mosaic', hint: 'An emoji or a photo', order: 30 });
        const body = src.body;
        body.innerHTML = `
<div class="sfm-wrap">
  <div class="sfm-controls">
    <p class="sfm-intro">Turn an emoji or a photo into a flat picture of 1×1 plates on a baseplate, in real LEGO colours.</p>
    <div class="sfm-field"><span class="sfm-label">MAKE IT FROM</span><div class="sfm-seg sfm-src-seg" role="group" aria-label="Make it from"><button type="button" data-src="emoji" class="on">😀 An emoji</button><button type="button" data-src="photo">📷 A photo</button></div></div>
    <div class="sfm-src-emoji">
      <input class="sfm-emoji-input" maxlength="12" value="🦊" aria-label="Type or paste an emoji" spellcheck="false" enterkeyhint="go">
      <div class="sfm-quick" role="group" aria-label="Pick an emoji"></div>
    </div>
    <div class="sfm-src-photo" hidden>
      <label class="sfm-drop"><span class="sfm-drop-label">📷 Pick a photo</span><small>or drop or paste one here. It is cropped square and never leaves your browser.</small><input type="file" accept="image/*"></label>
    </div>
    <div class="sfm-field"><span class="sfm-label">SIZE</span><div class="sfm-seg sfm-size-seg" role="group" aria-label="Size">${SIZES.map((s, i) => `<button type="button" data-size="${s}" class="${i === 0 ? 'on' : ''}">${s}×${s} studs</button>`).join('')}</div></div>
    <div class="sfm-field"><span class="sfm-label">BASEPLATE</span><div class="sfm-inline"><select class="sfm-select sfm-base" aria-label="Baseplate colour">${BASES.map(([id, n]) => `<option value="${id}">${n}</option>`).join('')}</select>
      <label class="sfm-check"><input type="checkbox" class="sfm-fill" checked> Fill the background</label></div></div>
  </div>
  <div class="sfm-side">
    <div class="sfm-preview-wrap"><canvas class="sfm-preview" width="32" height="32" aria-label="Mosaic preview"></canvas><div class="sfm-stats">…</div></div>
    <button type="button" class="action-btn primary sfm-forge">🎨 FORGE MOSAIC</button>
    <div class="sfm-tip">The step slider builds the picture row by row. Bold, simple emoji read best.</div>
  </div>
</div>`;
        const $ = (s) => body.querySelector(s);
        const preview = $('.sfm-preview'), stats = $('.sfm-stats'), forgeBtn = $('.sfm-forge'), emojiInput = $('.sfm-emoji-input'), drop = $('.sfm-drop'), dropLabel = $('.sfm-drop-label'), file = drop.querySelector('input');
        const paintQuick = () => { for (const b of body.querySelectorAll('.sfm-quick button')) b.classList.toggle('on', b.textContent === state.emoji); };
        for (const e of QUICK) { const b = document.createElement('button'); b.type = 'button'; b.textContent = e; b.title = e; b.addEventListener('click', () => { state.emoji = e; emojiInput.value = e; paintQuick(); refresh(); }); $('.sfm-quick').appendChild(b); }
        paintQuick();

        let timer = null;
        const refresh = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const N = state.size;
                let cells = null;
                try { const s = sample(N); cells = s ? quantise(s, N) : null; } catch (e) { console.error('mosaic sample', e); cells = null; }
                state.cells = cells;
                preview.width = preview.height = N;
                const px = preview.getContext('2d');
                px.fillStyle = window.LEGO_COLORS[state.base].hex; px.fillRect(0, 0, N, N);
                if (cells) for (let i = 0; i < cells.length; i++) if (cells[i]) { px.fillStyle = window.LEGO_COLORS[cells[i]].hex; px.fillRect(i % N, Math.floor(i / N), 1, 1); }
                const count = cells ? cells.filter(Boolean).length : 0, used = cells ? new Set(cells.filter(Boolean)).size : 0;
                stats.innerHTML = cells ? `<b>${count.toLocaleString()}</b> plates · ${used} colours<br>${N}×${N} studs · 9 steps` : state.source === 'photo' ? 'Pick a photo to preview it.' : 'Type an emoji.';
                forgeBtn.disabled = !cells || !count;
            }, 60);
        };
        const setSource = (from) => {
            state.source = from;
            for (const b of body.querySelectorAll('.sfm-src-seg button')) b.classList.toggle('on', b.dataset.src === from);
            $('.sfm-src-emoji').hidden = from !== 'emoji'; $('.sfm-src-photo').hidden = from !== 'photo';
            refresh();
        };
        body.querySelector('.sfm-src-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setSource(b.dataset.src); });
        body.querySelector('.sfm-size-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.size = Math.min(48, parseInt(b.dataset.size, 10) || 32); for (const x of body.querySelectorAll('.sfm-size-seg button')) x.classList.toggle('on', x === b); refresh(); });
        $('.sfm-base').addEventListener('change', (e) => { state.base = e.target.value; refresh(); });
        $('.sfm-fill').addEventListener('change', (e) => { state.fill = e.target.checked; refresh(); });
        emojiInput.addEventListener('input', () => { state.emoji = emojiInput.value.trim() || '🦊'; paintQuick(); refresh(); });
        emojiInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') forgeBtn.click(); });
        const loadPhoto = (f) => {
            if (!f || !f.type.startsWith('image/')) return;
            const url = URL.createObjectURL(f), img = new Image();
            img.onload = () => { state.photo = img; dropLabel.textContent = `📷 ${f.name.length > 22 ? f.name.slice(0, 20) + '…' : f.name}`; URL.revokeObjectURL(url); setSource('photo'); };
            img.onerror = () => { URL.revokeObjectURL(url); sf.toast && sf.toast('That image could not be read'); };
            img.src = url;
        };
        file.addEventListener('change', () => loadPhoto(file.files && file.files[0]));
        for (const evt of ['dragenter', 'dragover']) drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.add('over'); });
        for (const evt of ['dragleave', 'drop']) drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.remove('over'); });
        drop.addEventListener('drop', (e) => loadPhoto(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));
        // Pasting an image anywhere while the mosaic source is open also works.
        sf.on('source', (id) => { open = id === 'mosaic'; });
        document.addEventListener('paste', (e) => {
            if (!open) return;
            const it = [...(e.clipboardData && e.clipboardData.items || [])].find((i) => i.type.startsWith('image/'));
            if (it) { e.preventDefault(); loadPhoto(it.getAsFile()); }
        });

        forgeBtn.addEventListener('click', () => {
            if (!state.cells) return;
            const orig = forgeBtn.innerHTML;
            forgeBtn.disabled = true; forgeBtn.innerHTML = '<span class="spin-icon">⚙️</span> FORGING…';
            setTimeout(() => {
                try {
                    const model = build(state.cells, state.size);
                    document.querySelectorAll('.inspo-pill').forEach((p) => p.classList.remove('active'));
                    sf.emit('forging', { prompt: model.prompt, variant: 0, opts: {}, mosaic: true });
                    sf.load(model);   // closes Make
                } catch (e) { console.error('mosaic forge', e); }
                finally { forgeBtn.innerHTML = orig; forgeBtn.disabled = false; }
            }, 30);
        });
        refresh();
    };

    if (window.studForge) init(); else document.addEventListener('studforge:ready', init, { once: true });
})();
