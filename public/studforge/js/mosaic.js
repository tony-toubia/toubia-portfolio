// StudForge mosaic mode: an emoji or a photo becomes a flat mosaic of 1x1
// plates on a baseplate, 32x32 or 48x48 studs, in real LEGO colours.
//
// The source is rendered to a small canvas, box-filtered down to one sample
// per stud, and each stud takes the nearest opaque colour in the catalog.
// The grid goes through the generator's own assemble() so the parts list,
// exports and every other feature see an ordinary model.
(() => {
    const SIZES = [32, 48], SAMPLE = 240;
    const BASES = [['LIGHT_GREY', 'Grey'], ['WHITE', 'White'], ['BLACK', 'Black'], ['TAN', 'Tan'], ['DARK_BLUE', 'Navy'], ['GREEN', 'Green']];
    const QUICK = ['🦊', '🐸', '🐼', '🍕', '🚀', '❤️', '🌈', '👾', '🍄', '🌻', '🦖', '⚡'];

    const css = `
.sfm-wrap { display: flex; flex-direction: column; gap: 10px; }
.sfm-intro { font-size: 12px; color: var(--text-secondary); line-height: 1.4; }
.sfm-seg { display: inline-flex; border: 1px solid var(--border-main); border-radius: 8px; overflow: hidden; }
.sfm-seg button { background: transparent; border: none; color: var(--text-secondary); font-family: var(--font-heading); font-size: 10px; font-weight: 700; letter-spacing: 0.6px; padding: 7px 12px; cursor: pointer; }
.sfm-seg button + button { border-left: 1px solid var(--border-main); }
.sfm-seg button.on { background: rgba(242, 205, 55, 0.14); color: var(--lego-yellow); }
.sfm-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sfm-label { font-family: var(--font-heading); font-size: 9px; letter-spacing: 1px; color: var(--text-muted); min-width: 36px; }
.sfm-emoji-row { display: flex; align-items: center; gap: 10px; }
.sfm-emoji-input { flex: 1; min-width: 0; background: var(--bg-main); border: 1px solid var(--border-main); border-radius: 8px; color: #fff; font-size: 22px; padding: 6px 10px; text-align: center; outline: none; user-select: text; -webkit-user-select: text; }
.sfm-emoji-input:focus { border-color: var(--border-active); }
.sfm-quick { display: flex; flex-wrap: wrap; gap: 4px; }
.sfm-quick button { background: var(--bg-card); border: 1px solid var(--border-main); border-radius: 8px; font-size: 18px; padding: 3px 6px; cursor: pointer; line-height: 1; }
.sfm-quick button:hover { border-color: var(--lego-yellow); }
.sfm-drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 72px; border: 1px dashed rgba(255, 255, 255, 0.25); border-radius: 10px; padding: 10px; cursor: pointer; text-align: center; font-family: var(--font-heading); font-size: 10px; letter-spacing: 0.6px; color: var(--text-secondary); }
.sfm-drop.over, .sfm-drop:hover { border-color: var(--lego-yellow); color: #fff; }
.sfm-drop small { font-family: var(--font-body); font-size: 11px; letter-spacing: 0; color: var(--text-muted); }
.sfm-drop input { display: none; }
.sfm-preview-wrap { display: flex; align-items: center; gap: 12px; }
.sfm-preview { width: 128px; height: 128px; image-rendering: pixelated; border-radius: 6px; border: 1px solid var(--border-main); background: var(--bg-main); flex-shrink: 0; }
.sfm-stats { font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); line-height: 1.6; }
.sfm-stats b { color: var(--lego-yellow); font-weight: 600; }
.sfm-select { background: var(--bg-main); border: 1px solid var(--border-main); border-radius: 8px; color: #fff; font-family: var(--font-body); font-size: 13px; padding: 5px 8px; }
.sfm-forge:disabled { opacity: 0.5; cursor: default; }
.sfm-check { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-heading); font-size: 9px; letter-spacing: 0.8px; color: var(--text-secondary); cursor: pointer; }
.sfm-check input { accent-color: var(--lego-yellow); }
.sfm-tip { font-size: 11px; color: var(--text-muted); }
@media (max-width: 600px) {
  .sfm-preview { width: 96px; height: 96px; }
}
`;

    const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    /** Every opaque catalog colour as { id, rgb }. */
    const palette = () => Object.entries(window.LEGO_COLORS || {}).filter(([id, c]) => !c.trans && c.category !== 'Transparent' && !id.startsWith('TRANS')).map(([id, c]) => ({ id, rgb: hex2rgb(c.hex) }));
    /** "Redmean" weighted RGB distance: close enough to perceptual for plastic bricks. */
    const dist = (a, b) => { const rm = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]; return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db; };

    const init = () => {
        const sf = window.studForge;
        if (!sf || !sf.registerPanel || !window.ForgeGrid) return;
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

        /* ── the panel ────────────────────────────────────────── */

        const panel = sf.registerPanel({ id: 'mosaic', title: '🎨 MOSAIC' });
        const body = panel.body;
        body.innerHTML = `
<div class="sfm-wrap">
  <div class="sfm-intro">Turn an emoji or a photo into a flat mosaic of 1×1 plates on a baseplate.</div>
  <div class="sfm-row"><span class="sfm-label">FROM</span><div class="sfm-seg sfm-src-seg"><button data-src="emoji" class="on">EMOJI</button><button data-src="photo">PHOTO</button></div></div>
  <div class="sfm-src-emoji">
    <div class="sfm-emoji-row"><input class="sfm-emoji-input" maxlength="12" value="🦊" aria-label="Emoji or short text" spellcheck="false"></div>
    <div class="sfm-quick"></div>
  </div>
  <div class="sfm-src-photo" hidden>
    <label class="sfm-drop">📷 PICK A PHOTO<small>or drop one here · it is cropped square and never leaves your browser</small><input type="file" accept="image/*"></label>
  </div>
  <div class="sfm-row"><span class="sfm-label">SIZE</span><div class="sfm-seg sfm-size-seg">${SIZES.map((s, i) => `<button data-size="${s}" class="${i === 0 ? 'on' : ''}">${s}×${s}</button>`).join('')}</div></div>
  <div class="sfm-row"><span class="sfm-label">BASE</span><select class="sfm-select sfm-base">${BASES.map(([id, n]) => `<option value="${id}">${n}</option>`).join('')}</select>
    <label class="sfm-check"><input type="checkbox" class="sfm-fill" checked> FILL BACKGROUND</label></div>
  <div class="sfm-preview-wrap"><canvas class="sfm-preview" width="32" height="32"></canvas><div class="sfm-stats">…</div></div>
  <button class="action-btn primary sfm-forge">🎨 FORGE MOSAIC</button>
  <div class="sfm-tip">Tip: the step slider builds the picture row by row. Bold, simple emoji read best.</div>
</div>`;
        const $ = (s) => body.querySelector(s);
        const preview = $('.sfm-preview'), stats = $('.sfm-stats'), forgeBtn = $('.sfm-forge'), emojiInput = $('.sfm-emoji-input'), drop = $('.sfm-drop'), file = drop.querySelector('input');
        for (const e of QUICK) { const b = document.createElement('button'); b.type = 'button'; b.textContent = e; b.title = e; b.addEventListener('click', () => { state.emoji = e; emojiInput.value = e; refresh(); }); $('.sfm-quick').appendChild(b); }

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
                stats.innerHTML = cells ? `<b>${count.toLocaleString()}</b> plates<br>${used} colours<br>${N}×${N} studs · 9 steps` : state.source === 'photo' ? 'Pick a photo to preview it.' : 'Type an emoji.';
                forgeBtn.disabled = !cells || !count;
            }, 60);
        };
        const setSource = (src) => {
            state.source = src;
            for (const b of body.querySelectorAll('.sfm-src-seg button')) b.classList.toggle('on', b.dataset.src === src);
            $('.sfm-src-emoji').hidden = src !== 'emoji'; $('.sfm-src-photo').hidden = src !== 'photo';
            refresh();
        };
        body.querySelector('.sfm-src-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setSource(b.dataset.src); });
        body.querySelector('.sfm-size-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.size = Math.min(48, parseInt(b.dataset.size, 10) || 32); for (const x of body.querySelectorAll('.sfm-size-seg button')) x.classList.toggle('on', x === b); refresh(); });
        $('.sfm-base').addEventListener('change', (e) => { state.base = e.target.value; refresh(); });
        $('.sfm-fill').addEventListener('change', (e) => { state.fill = e.target.checked; refresh(); });
        emojiInput.addEventListener('input', () => { state.emoji = emojiInput.value.trim() || '🦊'; refresh(); });
        emojiInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') forgeBtn.click(); });
        const loadPhoto = (f) => {
            if (!f || !f.type.startsWith('image/')) return;
            const url = URL.createObjectURL(f), img = new Image();
            img.onload = () => { state.photo = img; drop.firstChild.textContent = `📷 ${f.name.length > 22 ? f.name.slice(0, 20) + '…' : f.name}`; URL.revokeObjectURL(url); setSource('photo'); };
            img.onerror = () => { URL.revokeObjectURL(url); };
            img.src = url;
        };
        file.addEventListener('change', () => loadPhoto(file.files && file.files[0]));
        for (const evt of ['dragenter', 'dragover']) drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.add('over'); });
        for (const evt of ['dragleave', 'drop']) drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.remove('over'); });
        drop.addEventListener('drop', (e) => loadPhoto(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));
        // Pasting an image anywhere while the panel is open also works.
        document.addEventListener('paste', (e) => { if (!body.closest('.side-panel.on')) return; const it = [...(e.clipboardData && e.clipboardData.items || [])].find((i) => i.type.startsWith('image/')); if (it) loadPhoto(it.getAsFile()); });

        forgeBtn.addEventListener('click', () => {
            if (!state.cells) return;
            const orig = forgeBtn.innerHTML;
            forgeBtn.disabled = true; forgeBtn.innerHTML = '<span class="spin-icon">⚙️</span> FORGING…';
            setTimeout(() => {
                try {
                    const model = build(state.cells, state.size);
                    document.querySelectorAll('.inspo-pill').forEach((p) => p.classList.remove('active'));
                    sf.emit('forging', { prompt: model.prompt, variant: 0, opts: {}, mosaic: true });
                    (sf.load || ((m) => sf.viewer.loadModel(m)))(model);
                } catch (e) { console.error('mosaic forge', e); }
                finally { forgeBtn.innerHTML = orig; forgeBtn.disabled = false; }
            }, 30);
        });

        // The dock chip opens the panel (and unfolds the sidebar on phones).
        const chip = document.createElement('button');
        chip.className = 'tool-chip sfm-chip'; chip.type = 'button'; chip.innerHTML = '🎨 MOSAIC'; chip.title = 'Mosaic mode: an emoji or photo as 1x1 plates';
        chip.addEventListener('click', () => {
            const card = document.getElementById('bom-card'), toggle = document.getElementById('btn-bom-toggle');
            if (card && getComputedStyle(card).display === 'none') { card.classList.add('open'); if (toggle) toggle.classList.add('on'); }
            panel.show();
            const layout = document.querySelector('.app-layout');
            if (window.innerWidth <= 600 && card && layout) layout.scrollTo({ top: layout.scrollTop + card.getBoundingClientRect().top - layout.getBoundingClientRect().top - 8, behavior: 'smooth' });
        });
        sf.dock(chip);
        sf.on('panel', (id) => chip.classList.toggle('on', id === 'mosaic'));
        refresh();
    };

    if (window.studForge) init(); else document.addEventListener('studforge:ready', init, { once: true });
})();
