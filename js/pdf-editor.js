/* PDF Editor — edit the text that is already inside a PDF, plus annotate, redact, sign, organise pages.
   Everything runs in the browser. Uses PedCore (js/pdf-edit-core.js), pdf.js (render + text) and pdf-lib (save). */
(function () {
  'use strict';
  const { h, ui } = TN, Core = window.PedCore;
    const TOOLS = [
    ['edit', '✏️', 'Edit text'], ['text', '🅣', 'Add text'], ['whiteout', '⬜', 'Whiteout'], ['redact', '⬛', 'Redact'], ['highlight', '🖍️', 'Highlight'],
    ['underline', 'U̲', 'Underline'], ['strike', 'S̶', 'Strike'], ['draw', '✍️', 'Draw'], ['rect', '▭', 'Box'], ['ellipse', '◯', 'Circle'],
    ['line', '╱', 'Line'], ['arrow', '➜', 'Arrow'], ['image', '🖼️', 'Image'], ['sign', '🖊️', 'Sign'], ['link', '🔗', 'Link'], ['select', '👆', 'Select']];
  const DRAG = new Set(['whiteout', 'redact', 'highlight', 'underline', 'strike', 'draw', 'rect', 'ellipse', 'line', 'arrow', 'link']);
  const TEXTY = o => o && (o.type === 'edit' || o.type === 'text');
  const CSS_BASE = 0.84; // baseline position inside a line-height:1 box

  TN.register({
    id: 'pdf-editor', cat: 'pdf', icon: '✏️', name: 'PDF Editor — edit existing text', isNew: true, full: true,
    desc: 'Change the real text inside a PDF, add text, whiteout, redact, highlight, draw, sign and organise pages. Runs on your device.',
    tags: 'edit pdf text change modify sejda annotate sign redact whiteout highlight erase replace fill', render(root) {
      const S = { name: 'document', bytes: null, pdf: null, pdfjs: null, PL: null, metrics: null, ents: new Map(), order: [], cur: 0, z: 1, tool: 'edit', sel: null, undo: [], redo: [], assets: {}, gran: 'block', showAll: false, dirty: false, nid: 1, sty: { fam: 'Helvetica', size: 12, bold: false, italic: false, underline: false, color: '#000000', align: 'left', stroke: '#d62828', sw: 2, fill: '', hl: '#ffeb3b', wo: '#ffffff' } };
      const uid = () => 'o' + (S.nid++);
      const E = id => S.ents.get(id);
      const live = () => S.order.map(E);
      let pageEls = new Map(), io = null, renderQ = Promise.resolve(), editing = null, alive = true;
      const fontBytes = new Map(), fontLoading = new Map();
      /* fonts: load the bundled TTF (for exact widths + PDF embedding) and register it for the on-screen preview */
      function ensureFont(fam, b, i) {
        if (Core.famInfo(fam).std) return Promise.resolve(); const rs = Core.resolveStyle(fam, b, i), key = fam + '|' + rs;
        if (S.metrics.hasCustom(fam, b, i)) return Promise.resolve(); if (fontLoading.has(key)) return fontLoading.get(key);
        const pr = (async () => {
          const url = new URL(Core.fontUrl(fam, b, i), document.baseURI).href, res = await fetch(url); if (!res.ok) throw new Error('font ' + res.status);
          const bytes = new Uint8Array(await res.arrayBuffer()); S.metrics.setCustom(fam, b, i, Core.parseTTF(bytes)); fontBytes.set(key, bytes);
          try { const ff = new FontFace('Ped' + fam, bytes.slice().buffer, { weight: rs.includes('b') ? '700' : '400', style: rs.includes('i') ? 'italic' : 'normal' }); await ff.load(); document.fonts.add(ff); } catch (_) { }
        })().catch(err => { console.warn('font load failed', fam, err); }).finally(() => fontLoading.delete(key));
        fontLoading.set(key, pr); return pr;
      }
      function useFont(o, e) { if (!TEXTY(o) || Core.famInfo(o.fam).std || S.metrics.hasCustom(o.fam, o.bold, o.italic)) return; ensureFont(o.fam, o.bold, o.italic).then(() => { if (!alive) return; relayout(o, e); refreshLayer(e.id); }); }
      const fontOptions = cur => ['Sans-serif', 'Serif', 'Monospace', 'Display'].map(cat => h('optgroup', { label: cat }, Core.FAMS.filter(f => f.cat === cat).map(f => h('option', { value: f.id, selected: cur === f.id }, f.label))));

      /* ───────── UI skeleton ───────── */
      const bar = h('div', { class: 'ped-bar' }), opts = h('div', { class: 'ped-opts' }), side = h('div', { class: 'ped-side' }), scroll = h('div', { class: 'ped-scroll' }), status = h('div', { class: 'ped-status' }, 'Open a PDF to begin.');
      const fileIn = h('input', { type: 'file', accept: 'application/pdf,.pdf', style: { display: 'none' }, onchange: ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) openFile(f); } });
      const imgIn = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) addImage(f); } });
      root.append(h('div', { class: 'ped' }, bar, opts, h('div', { class: 'ped-main', style: { position: 'relative' } }, side, scroll), status, fileIn, imgIn));
      const toolBtns = {};
      const tb = (icon, label, fn, extra) => h('button', Object.assign({ class: 'tbtn', type: 'button', onclick: fn, title: label }, extra || {}), h('span', { class: 'i' }, icon), label);
      const undoBtn = tb('↶', 'Undo', () => undo()), redoBtn = tb('↷', 'Redo', () => redo());
      const zoomLbl = h('span', { class: 'lbl', style: { minWidth: '44px', textAlign: 'center' } }, '100%');
      const dl = h('button', { class: 'btn primary ped-dl', type: 'button', onclick: () => exportPdf() }, '⬇ Download PDF'), fab = h('button', { class: 'ped-fab', type: 'button', hidden: true, onclick: () => exportPdf() }, h('span', {}, '⬇'), 'Download PDF');
      root.firstChild.append(fab);
      bar.append(dl, tb('📂', 'Open', () => fileIn.click()), tb('📑', 'Pages', () => { side.classList.toggle('on'); }), h('span', { class: 'sep' }),
        ...TOOLS.map(([id, ic, lb]) => (toolBtns[id] = tb(ic, lb, () => setTool(id), { 'aria-pressed': String(id === S.tool) }))), h('span', { class: 'sep' }),
        undoBtn, redoBtn, tb('🔍', 'Find', () => findDialog()), h('span', { class: 'sep' }), tb('➖', 'Zoom out', () => zoom(1 / 1.2)), zoomLbl, tb('➕', 'Zoom in', () => zoom(1.2)));

      function showEmpty() {
        scroll.replaceChildren(h('div', { class: 'ped-empty' },
          h('h2', { style: { marginTop: 0 } }, 'Edit text inside any PDF'),
          h('p', {}, 'Open a PDF, tap the text you want to change, type, and download. Your file never leaves this device.'),
          ui.drop({ accept: 'application/pdf,.pdf', label: 'Choose a PDF to edit', sub: 'or drag and drop it here', onFiles: ([f]) => f && openFile(f) }),
          h('ul', { class: 'muted', style: { lineHeight: 1.7 } }, h('li', {}, 'Tap any text → rewrite it. The old text is really removed from the file, not just hidden.'), h('li', {}, 'Add text, images, signature, links; whiteout, redact, highlight, draw.'), h('li', {}, 'Reorder, rotate, delete and add pages from the 📑 Pages panel.'), h('li', {}, 'Find & replace across the whole document.'))));
      }

      /* ───────── loading ───────── */
      async function openFile(f) {
        if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { ui.toast('Please choose a PDF file'); return; }
        status.textContent = 'Opening…';
        try {
          const bytes = new Uint8Array(await f.arrayBuffer()); S.pdfjs = await TN.libs.pdfjs(); S.PL = await TN.libs.pdfLib(); S.metrics = await Core.makeMetrics(S.PL);
          let pdf; try { pdf = await TN.libs.openPdf(bytes); } catch (e) { if (e && e.name === 'PasswordException') throw new Error('This PDF is password-protected. Remove the password first, then open it here.'); throw e; }
          Object.assign(S, { name: ui.baseName(f.name), bytes, pdf, ents: new Map(), order: [], undo: [], redo: [], sel: null, cur: 0, dirty: false, assets: {} });
          for (let i = 1; i <= pdf.numPages; i++) {
            const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 1 }), id = 'p' + i;
            S.ents.set(id, { id, src: i - 1, w: vp.width, h: vp.height, view: pg.view.slice(), baseRot: pg.rotate % 360, rot: pg.rotate % 360, deleted: false, objs: [], text: null });
            S.order.push(id);
          }
          const maxW = Math.max(...live().map(e => e.w)); S.z = Math.max(0.35, Math.min(1.6, (scroll.clientWidth - 20) / maxW)); S.tool = 'edit';
          buildPages(); renderOpts(); syncBtns(); buildSide();
          status.textContent = f.name + ' · ' + pdf.numPages + ' page' + (pdf.numPages > 1 ? 's' : '') + ' · tap any text to edit it';
        } catch (e) { console.error(e); ui.toast(e.message || 'Could not open that PDF'); status.textContent = 'Could not open that PDF.'; if (!S.pdf) showEmpty(); }
      }

      /* ───────── pages ───────── */
      function buildPages() {
        const keep = scroll.scrollTop / Math.max(1, scroll.scrollHeight); if (io) io.disconnect(); pageEls = new Map(); scroll.replaceChildren();
        io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { const id = en.target.dataset.id; const pe = pageEls.get(id); if (pe && !pe.done) renderCanvas(id); const idx = S.order.indexOf(id); if (en.intersectionRatio > 0.35 && idx >= 0) { S.cur = idx; status.dataset.pg = idx + 1; } } }), { root: scroll, rootMargin: '700px 0px', threshold: [0, 0.35] });
        live().forEach((e, i) => {
          const layer = h('div', { class: 'ped-layer' }), page = h('div', { class: 'ped-page', 'data-id': e.id, style: { width: e.w * S.z + 'px', height: e.h * S.z + 'px' } }, layer, h('div', { class: 'ped-pgnum' }, 'Page ' + (i + 1)));
          page.addEventListener('pointerdown', ev => pageDown(ev, e, layer)); layer.addEventListener('dblclick', ev => ev.preventDefault());
          scroll.append(page); pageEls.set(e.id, { page, layer, canvas: null, done: false }); io.observe(page); refreshLayer(e.id);
        });
        scroll.classList.toggle('drawing', DRAG.has(S.tool)); scroll.classList.toggle('ped-mode-edit', S.tool === 'edit'); scroll.className = 'ped-scroll' + (DRAG.has(S.tool) ? ' drawing' : '');
        scroll.scrollTop = keep * scroll.scrollHeight; zoomLbl.textContent = Math.round(S.z * 100) + '%';
      }
      function renderCanvas(id) {
        const e = E(id), pe = pageEls.get(id); if (!pe || e.src == null) { if (pe) pe.done = true; return; } pe.done = true;
        renderQ = renderQ.then(async () => {
          if (!alive || !pageEls.has(id) || pageEls.get(id) !== pe) return;
          try {
            const page = await S.pdf.getPage(e.src + 1), dpr = Math.min(window.devicePixelRatio || 1, 2); let sc = S.z * dpr; const maxPx = 3200 * 3200; if (e.w * e.h * sc * sc > maxPx) sc = Math.sqrt(maxPx / (e.w * e.h));
            const vp = page.getViewport({ scale: sc, rotation: e.rot }), c = h('canvas', { class: 'pdfc' }); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
            await page.render({ canvas: c, viewport: vp }).promise; if (pe.canvas) pe.canvas.remove(); pe.canvas = c; pe.page.insertBefore(c, pe.layer); e.canvas = c; e.csc = c.width / e.w;
            if (S.tool === 'edit' || S.showAll) { await loadText(e); refreshLayer(id); }
          } catch (err) { console.error(err); pe.done = false; }
        });
      }
      function zoom(f) { S.z = Math.max(0.25, Math.min(4, S.z * f)); buildPages(); }

      /* ───────── text extraction ───────── */
      async function loadText(e) {
        if (e.text || e.src == null) return; const page = await S.pdf.getPage(e.src + 1), vp = page.getViewport({ scale: 1, rotation: e.rot }), tc = await page.getTextContent();
        const cls = {}, items = [];
        for (const it of tc.items) {
          if (!it.str || !it.transform) continue; const m = S.pdfjs.Util.transform(vp.transform, it.transform), fs = Math.hypot(m[0], m[1]); if (!(fs > 0.5) || Math.abs(m[1]) > 0.2 * fs || Math.abs(m[2]) > 0.5 * fs || m[0] <= 0) continue;
          const st = tc.styles[it.fontName] || {}; if (!(it.fontName in cls)) { let info = {}, name = st.fontFamily || ''; try { if (page.commonObjs.has(it.fontName)) { const f = page.commonObjs.get(it.fontName); info = f || {}; name = (f && f.name) || name; } } catch (_) { } cls[it.fontName] = Core.classifyFont(name, Object.assign({ isSerifFont: /serif$/.test(st.fontFamily || '') && !/sans/.test(st.fontFamily || ''), isMonospace: /mono/.test(st.fontFamily || '') }, info)); }
          items.push({ str: it.str, x: m[4], y: m[5], w: it.width * (vp.scale || 1), fs, asc: st.ascent ?? 0.9, desc: st.descent ?? -0.2, font: it.fontName });
        }
        const lines = Core.groupLines(items), blocks = Core.groupBlocks(lines); e.text = { lines, blocks, cls };
      }
      function sample(e, b) { // Estimate foreground and background from stable colour clusters.
        const c = e.canvas; if (!c) return { color: '#000000', bg: '#ffffff' };
        const k = e.csc || 1, x = Math.max(0, Math.floor((b.x0 - 1) * k)), y = Math.max(0, Math.floor(b.top * k));
        const w = Math.min(c.width - x, Math.ceil((b.x1 - b.x0 + 2) * k)), hh = Math.min(c.height - y, Math.ceil((b.bottom - b.top) * k));
        if (w < 1 || hh < 1) return { color: '#000000', bg: '#ffffff' };
        let d; try { d = c.getContext('2d').getImageData(x, y, w, hh).data; } catch (_) { return { color: '#000000', bg: '#ffffff' }; }
        const bins = new Map(), pixels = [];
        for (let i = 0; i < d.length; i += 4) {
          const rgb = [d[i], d[i + 1], d[i + 2]], key = ((rgb[0] >> 3) << 10) | ((rgb[1] >> 3) << 5) | (rgb[2] >> 3);
          let v = bins.get(key); if (!v) bins.set(key, v = { n: 0, sum: [0, 0, 0] });
          v.n++; v.sum[0] += rgb[0]; v.sum[1] += rgb[1]; v.sum[2] += rgb[2]; pixels.push(rgb);
        }
        let bgBin = null; bins.forEach(v => { if (!bgBin || v.n > bgBin.n) bgBin = v; });
        const bg = bgBin ? bgBin.sum.map(v => v / bgBin.n) : [255, 255, 255];
        const dist = rgb => Math.abs(rgb[0] - bg[0]) + Math.abs(rgb[1] - bg[1]) + Math.abs(rgb[2] - bg[2]);
        // Use the most saturated/high-contrast core pixels, not a single antialiased edge pixel.
        const fg = pixels.filter(rgb => dist(rgb) >= 75).sort((a, b) => dist(b) - dist(a));
        const take = fg.slice(0, Math.max(1, Math.ceil(fg.length * 0.08)));
        const color = take.length ? [0, 1, 2].map(ch => take.reduce((sum, rgb) => sum + rgb[ch], 0) / take.length) : [0, 0, 0];
        const hx = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
        const snap = a => a.map(v => v >= 244 ? 255 : v <= 10 ? 0 : v);
        return { color: take.length ? hx(color) : '#000000', bg: bgBin && bgBin.n / pixels.length > 0.25 ? hx(snap(bg)) : '#ffffff' };
      }

      /* ───────── objects ───────── */
      function relayout(o, e) {
        if (!TEXTY(o)) return; const ww = o.maxW || Math.max(40, e.w - o.x0 - 6);
        o.lines = Core.layoutText(o.text, { fam: o.fam, bold: o.bold, italic: o.italic, size: o.size, hs: o.hs || 1, maxW: ww }, S.metrics);
        const wOf = s => { const x = S.metrics.width(s, o.fam, o.bold, o.italic, o.size); return (isNaN(x) ? s.length * o.size * 0.55 : x) * (o.hs || 1); };
        if (o.type === 'text') { o.w = Math.max(o.maxW || 0, ...o.lines.map(wOf), 12); o.h = (o.lines.length - 1) * o.lineH + o.size * 1.25; o.x = o.x0; o.y = o.base0 - o.size * 0.95; }
      }
      function newText(e, x, y) {
        const st = S.sty, o = { id: uid(), type: 'text', fam: st.fam, size: st.size, bold: st.bold, italic: st.italic, underline: st.underline, color: st.color, align: st.align, text: '', hs: 1, lineH: st.size * 1.2, x0: x, base0: y + st.size * 0.95, maxW: 0, x, y, w: 20, h: st.size * 1.25, fresh: true };
        relayout(o, e); useFont(o, e); return o;
      }
      function editFromBlock(e, blk, key) {
        const cl = e.text.cls[blk.font] || { fam: 'Helvetica', bold: false, italic: false }, sm = sample(e, blk), origW = blk.x1 - blk.x0;
        // PDF files do not store a semantic alignment property; infer it from
        // the line geometry so multiline centered/right-aligned blocks stay aligned.
        const lines = blk.lines || [], lefts = lines.map(l => l.x0), rights = lines.map(l => l.x1), centers = lines.map(l => (l.x0 + l.x1) / 2);
        const spread = a => a.length > 1 ? Math.max(...a) - Math.min(...a) : Infinity;
        const tol = Math.max(2.5, origW * 0.035);
        let align = 'left';
        if (lines.length > 1) {
          if (spread(lefts) <= tol) align = 'left';
          else if (spread(rights) <= tol) align = 'right';
          else if (spread(centers) <= tol) align = 'center';
        }
        const o = { id: uid(), type: 'edit', key, x: blk.x0, y: blk.top, w: origW, h: blk.bottom - blk.top, bg: sm.bg, fam: cl.fam, bold: cl.bold, italic: cl.italic, size: Math.round(blk.fs * 10) / 10, color: sm.color, align, hs: 1, lineH: blk.pitch, base0: blk.lines[0].y, x0: blk.x0, maxW: lines.length > 1 ? origW * 1.03 : 0, text: blk.text, orig: blk.text, origSize: blk.fs, fresh: true, items: blk.lines.flatMap(l => l.items.filter(i => i.str && i.str.trim()).map(i => ({ x: i.x, y: i.y, w: i.w, str: i.str, fs: i.fs }))) };
        relayout(o, e); useFont(o, e); return o;
      }
      function blocksOf(e) { if (!e.text) return []; return S.gran === 'line' ? e.text.lines.map(Core.lineAsBlock) : e.text.blocks; }
      function covered(e, blk) { return e.objs.some(o => o.type === 'edit' && blk.lines.some(l => o.items.some(it => Math.abs(it.y - l.y) < 1 && it.x >= l.x0 - 1 && it.x <= l.x1 + 1))); }

      /* paints over the old text using the page's own background (row by row), instead of a flat white box */
      function patchCanvas(e, o) {
        const c = e.canvas; if (!c || !o.items) return null; const k = e.csc || 1, x0 = Math.max(4, Math.floor((o.x - 1) * k)), y0 = Math.max(0, Math.floor((o.y - 1) * k)), w = Math.min(c.width - x0 - 4, Math.ceil((o.w + 2) * k)), hh = Math.min(c.height - y0, Math.ceil((o.h + 2) * k)); if (w < 2 || hh < 2) return null;
        let L, R; try { const g = c.getContext('2d'); L = g.getImageData(x0 - 4, y0, 1, hh).data; R = g.getImageData(Math.min(c.width - 1, x0 + w + 3), y0, 1, hh).data; } catch (_) { return null; }
        const out = h('canvas'); out.width = w; out.height = hh; const g2 = out.getContext('2d'); const col = (a, r) => [a[r * 4], a[r * 4 + 1], a[r * 4 + 2]], dist = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
        // Sample a narrow band on both sides (not a fixed white rectangle). Interpolate
        // between edge colours for each scanline so tinted pages, coloured panels and gradients survive.
        const image = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const edge = (x, y) => { const vals = [0, 1, 2].map(dx => { const i = (y * c.width + Math.max(0, Math.min(c.width - 1, x + dx))) * 4; return [image[i], image[i + 1], image[i + 2]]; }); return [0, 1, 2].map(ch => vals.map(v => v[ch]).sort((u, v) => u - v)[1]); };
        for (let r = 0; r < hh; r++) {
          const yy = Math.max(0, Math.min(c.height - 1, y0 + r)), a = edge(x0 - 4, yy), b = edge(Math.min(c.width - 3, x0 + w + 1), yy);
          for (let xx = 0; xx < w; xx++) { const t = w > 1 ? xx / (w - 1) : 0, rgb = a.map((v, ch) => Math.round(v * (1 - t) + b[ch] * t)); g2.fillStyle = 'rgb(' + rgb.join(',') + ')'; g2.fillRect(xx, r, 1, 1); }
        }
        return out;
      }
      async function coverImage(o, e) {
        const pc = patchCanvas(e, o); if (!pc) return null; const blob = await new Promise(r => pc.toBlob(r, 'image/png')); const k = e.csc || 1;
        return { png: new Uint8Array(await blob.arrayBuffer()), x: Math.max(4, Math.floor((o.x - 1) * k)) / k, y: Math.max(0, Math.floor((o.y - 1) * k)) / k, w: pc.width / k, h: pc.height / k };
      }
      function bbox(o) {
        if (o.type === 'line' || o.type === 'arrow') { const x = Math.min(o.x1, o.x2), y = Math.min(o.y1, o.y2); return { x: x - 6, y: y - 6, w: Math.abs(o.x2 - o.x1) + 12, h: Math.abs(o.y2 - o.y1) + 12 }; }
        if (o.type === 'draw') { const xs = o.pts.map(p => p[0]), ys = o.pts.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys); return { x: x - 6, y: y - 6, w: Math.max(...xs) - x + 12, h: Math.max(...ys) - y + 12 }; }
        if (o.type === 'underline' || o.type === 'strike') return { x: o.x, y: o.y - 6, w: o.w, h: 12 };
        return { x: o.x, y: o.y, w: o.w, h: o.h };
      }
      function objEl(o, e) {
        const z = S.z, b = bbox(o), el = h('div', { class: 'obj' + (TEXTY(o) ? ' txt' : ''), 'data-oid': o.id, style: { left: b.x * z + 'px', top: b.y * z + 'px', width: b.w * z + 'px', height: b.h * z + 'px' } });
        const svg = (inner, vb) => h('div', { html: '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="' + vb + '" style="overflow:visible;position:absolute;left:0;top:0" preserveAspectRatio="none">' + inner + '</svg>' });
        switch (o.type) {
          case 'edit': case 'text': {
            if (o.type === 'edit') { const pc = patchCanvas(e, o); if (pc) { pc.style.cssText = 'position:absolute;pointer-events:none;left:' + (-1 * z) + 'px;top:' + (-1 * z) + 'px;width:' + ((o.w + 2) * z) + 'px;height:' + ((o.h + 2) * z) + 'px'; el.append(pc); } else if (o.bg) el.style.background = o.bg; } if (o.type === 'text') el.style.minWidth = '12px';
            const lines = o.lines || [], boxW = o.maxW || Math.max(...lines.map(s => (S.metrics.width(s, o.fam, o.bold, o.italic, o.size) || 0) * (o.hs || 1)), 0);
            lines.forEach((s, i) => { const w = (S.metrics.width(s, o.fam, o.bold, o.italic, o.size) || 0) * (o.hs || 1); let x = o.x0 - o.x; if (o.align === 'center') x += (boxW - w) / 2; else if (o.align === 'right') x += boxW - w;
              el.append(h('div', { class: 'ln', style: { left: x * z + 'px', top: (o.base0 + i * o.lineH - o.size * CSS_BASE - o.y) * z + 'px', fontFamily: Core.CSSFONT[o.fam], fontSize: o.size * z + 'px', fontWeight: Core.resolveStyle(o.fam, o.bold, o.italic).includes('b') ? 700 : 400, fontStyle: Core.resolveStyle(o.fam, o.bold, o.italic).includes('i') ? 'italic' : 'normal', color: o.color, textDecoration: o.underline ? 'underline' : 'none', transform: o.hs && o.hs !== 1 ? 'scaleX(' + o.hs + ')' : '', transformOrigin: 'left top', opacity: editing && editing.o === o ? 0 : 1 } }, s)); });
            break; }
          case 'whiteout': el.style.background = o.color || '#fff'; break;
          case 'redact': el.style.background = '#000'; break;
          case 'highlight': el.style.background = o.color || '#ffeb3b'; el.style.opacity = o.opacity ?? 0.45; el.style.mixBlendMode = 'multiply'; break;
          case 'underline': el.append(h('div', { style: { position: 'absolute', left: 0, right: 0, top: '50%', borderTop: Math.max(1, (o.sw || 1) * z) + 'px solid ' + (o.color || '#d62828') } })); break;
          case 'strike': el.append(h('div', { style: { position: 'absolute', left: 0, right: 0, top: '50%', borderTop: Math.max(1, (o.sw || 1) * z) + 'px solid ' + (o.color || '#d62828') } })); break;
          case 'rect': el.style.border = (o.sw ?? 2) * z + 'px solid ' + (o.stroke || '#d62828'); el.style.boxSizing = 'border-box'; if (o.fill) el.style.background = o.fill; break;
          case 'ellipse': el.style.border = (o.sw ?? 2) * z + 'px solid ' + (o.stroke || '#d62828'); el.style.borderRadius = '50%'; el.style.boxSizing = 'border-box'; if (o.fill) el.style.background = o.fill; break;
          case 'line': case 'arrow': { const col = o.stroke || '#d62828', th = o.sw ?? 2; let inner = '<line x1="' + (o.x1 - b.x) + '" y1="' + (o.y1 - b.y) + '" x2="' + (o.x2 - b.x) + '" y2="' + (o.y2 - b.y) + '" stroke="' + col + '" stroke-width="' + th + '" stroke-linecap="round"/>';
            if (o.type === 'arrow') { const ang = Math.atan2(o.y1 - o.y2, o.x1 - o.x2), L = Math.max(8, th * 4); for (const s of [-0.45, 0.45]) inner += '<line x1="' + (o.x2 - b.x) + '" y1="' + (o.y2 - b.y) + '" x2="' + (o.x2 - b.x + L * Math.cos(ang + s)) + '" y2="' + (o.y2 - b.y + L * Math.sin(ang + s)) + '" stroke="' + col + '" stroke-width="' + th + '" stroke-linecap="round"/>'; }
            el.append(svg(inner, '0 0 ' + b.w + ' ' + b.h)); break; }
          case 'draw': el.append(svg('<polyline fill="none" stroke="' + (o.stroke || '#1d4ed8') + '" stroke-width="' + (o.sw ?? 2) + '" stroke-linecap="round" stroke-linejoin="round" points="' + o.pts.map(p => (p[0] - b.x) + ',' + (p[1] - b.y)).join(' ') + '"/>', '0 0 ' + b.w + ' ' + b.h)); break;
          case 'image': case 'sign': { const a = S.assets[o.asset]; if (a) el.append(h('img', { src: a.url, draggable: 'false', style: { width: '100%', height: '100%', display: 'block', opacity: o.opacity ?? 1, pointerEvents: 'none' } })); break; }
          case 'link': el.style.border = '1.5px dashed #2b7cff'; el.style.background = 'rgba(43,124,255,.12)'; break;
        }
        if (!['line', 'arrow', 'draw', 'underline', 'strike'].includes(o.type)) el.append(h('div', { class: 'rh', 'data-rh': '1' }));
        el.append(h('div', { class: 'del', 'data-del': '1' }, '×'));
        if (S.sel && S.sel.oid === o.id) el.classList.add('sel');
        return el;
      }
      function refreshLayer(id) {
        const e = E(id), pe = pageEls.get(id); if (!pe) return; const z = S.z, keepTa = editing && editing.e.id === id ? editing.ta : null; pe.layer.replaceChildren();
        if ((S.tool === 'edit' || S.showAll) && e.text) blocksOf(e).forEach((b, bi) => { if (covered(e, b)) return; pe.layer.append(h('div', { class: 'tb-box' + (S.showAll ? ' all' : ''), 'data-bi': bi, style: { left: (b.x0 - 2) * z + 'px', top: (b.top - 1) * z + 'px', width: (b.x1 - b.x0 + 4) * z + 'px', height: (b.bottom - b.top + 2) * z + 'px' } })); });
        e.objs.forEach(o => pe.layer.append(objEl(o, e)));
        if (keepTa) pe.layer.append(keepTa);
      }
      const refreshAll = () => live().forEach(e => refreshLayer(e.id));
      function find(oid) { for (const e of live()) { const o = e.objs.find(x => x.id === oid); if (o) return { e, o }; } return null; }

      /* ───────── undo ───────── */
      const snapshot = () => JSON.stringify({ order: S.order, st: [...S.ents.values()].map(e => ({ id: e.id, deleted: e.deleted, rot: e.rot, objs: e.objs })) });
      function pushUndo() { S.undo.push(snapshot()); if (S.undo.length > 80) S.undo.shift(); S.redo = []; S.dirty = true; syncBtns(); }
      function restore(js) { const d = JSON.parse(js), prev = S.order.join(); S.order = d.order; d.st.forEach(s => { const e = E(s.id); if (!e) return; const rotChanged = e.rot !== s.rot; e.deleted = s.deleted; e.rot = s.rot; e.objs = s.objs; if (rotChanged) { const t = e.w; e.w = e.h; e.h = t; e.text = null; } }); S.sel = null; buildPages(); buildSide(); renderOpts(); syncBtns(); live().forEach(e => e.objs.forEach(o => useFont(o, e))); }
      function undo() { if (!S.undo.length) return; S.redo.push(snapshot()); restore(S.undo.pop()); }
      function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); restore(S.redo.pop()); }
      function syncBtns() { undoBtn.disabled = !S.undo.length; redoBtn.disabled = !S.redo.length; for (const k in toolBtns) toolBtns[k].setAttribute('aria-pressed', String(k === S.tool)); dl.disabled = !S.pdf; fab.hidden = !S.pdf; }

      /* ───────── tools & options ───────── */
      function setTool(t) {
        closeEditor(); S.tool = t; if (t !== 'select') S.sel = null; syncBtns(); scroll.className = 'ped-scroll' + (DRAG.has(t) ? ' drawing' : '') + (t === 'edit' ? ' ped-mode-edit' + (S.showAll ? ' showall' : '') : '');
        if (t === 'edit') Promise.all(live().map(async e => { await loadText(e); refreshLayer(e.id); })); else refreshAll();
        renderOpts();
        if (t === 'image') imgIn.click(); if (t === 'sign') signDialog();
        const tips = { edit: 'Tap any text to change it.', text: 'Tap on the page to type new text.', whiteout: 'Drag over what you want to hide (white box).', redact: 'Drag over text to permanently remove it (black box).', highlight: 'Drag over text to highlight it.', underline: 'Drag along text to underline.', strike: 'Drag along text to strike through.', draw: 'Draw with your finger.', rect: 'Drag to draw a box.', ellipse: 'Drag to draw a circle.', line: 'Drag to draw a line.', arrow: 'Drag to draw an arrow.', image: 'Choose an image, then drag it into place.', sign: 'Draw your signature, then place it.', link: 'Drag over the area that should be a link.', select: 'Tap an object to move, resize or delete it.' };
        status.textContent = tips[t] || '';
      }
      const curObj = () => { if (!S.sel) return null; const f = find(S.sel.oid); return f ? f.o : null; };
      const colorIn = (val, fn, title) => h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(val) ? val : '#000000', title, oninput: ev => fn(ev.target.value), style: { width: '40px', height: '36px', padding: '2px' } });
      const numIn = (val, fn, min, max, step) => h('input', { type: 'number', value: val, min, max, step: step || 1, onchange: ev => { const v = parseFloat(ev.target.value); if (v >= min && v <= max) fn(v); } });
      const lbl = t => h('span', { class: 'lbl muted' }, t);
      const tgl = (t, on, fn, title) => h('button', { class: 'tbtn', type: 'button', style: { minWidth: '38px', height: '36px' }, title, 'aria-pressed': String(!!on), onclick: fn }, t);

      function setStyle(k, v) {
        S.sty[k] = v; const o = curObj(), f = o && find(o.id); const map = { fam: 'fam', size: 'size', bold: 'bold', italic: 'italic', underline: 'underline', color: 'color', align: 'align', stroke: 'stroke', sw: 'sw', fill: 'fill', hl: 'color', wo: 'color' };
        if (!o) { renderOpts(); return; } const textKeys = ['fam', 'size', 'bold', 'italic', 'underline', 'color', 'align'];
        const applies = TEXTY(o) ? textKeys.includes(k) : (k === 'hl' && o.type === 'highlight') || (k === 'wo' && o.type === 'whiteout') || (['stroke', 'sw'].includes(k) && !['whiteout', 'redact', 'highlight', 'image', 'sign', 'link', 'edit', 'text'].includes(o.type)) || (k === 'fill' && ['rect', 'ellipse'].includes(o.type));
        if (!applies) { renderOpts(); return; }
        pushUndo(); o.fresh = false;
        if (k === 'size' && TEXTY(o)) { o.lineH = o.lineH * v / o.size; if (o.type === 'text') o.base0 = o.y + v * 0.95; o.size = v; }
        else if (k === 'align' && TEXTY(o)) { o.align = v; if (v !== 'left' && !o.maxW) o.maxW = o.type === 'edit' ? o.w : Math.max(o.w, 120); }
        else o[map[k]] = v;
        if (k === 'fill' && !v) delete o.fill; relayout(o, f.e); refreshLayer(f.e.id); renderOpts(); if (['fam', 'bold', 'italic'].includes(k)) useFont(o, f.e);
      }
      function renderOpts() {
        const st = S.sty, o = curObj(), t = o ? o.type : S.tool, kids = [];
        const textUI = () => kids.push(lbl('Font'), h('select', { class: 'fontsel', onchange: ev => setStyle('fam', ev.target.value) }, fontOptions(o && TEXTY(o) ? o.fam : st.fam)),
          lbl('Size'), numIn(o && TEXTY(o) ? Math.round(o.size * 10) / 10 : st.size, v => setStyle('size', v), 4, 200, 0.5),
          tgl('B', o && TEXTY(o) ? o.bold : st.bold, () => setStyle('bold', !(o && TEXTY(o) ? o.bold : st.bold)), 'Bold'), tgl('I', o && TEXTY(o) ? o.italic : st.italic, () => setStyle('italic', !(o && TEXTY(o) ? o.italic : st.italic)), 'Italic'), tgl('U', o && TEXTY(o) ? o.underline : st.underline, () => setStyle('underline', !(o && TEXTY(o) ? o.underline : st.underline)), 'Underline'),
          colorIn(o && TEXTY(o) ? o.color : st.color, v => setStyle('color', v), 'Text colour'),
          ...['left', 'center', 'right'].map(a => tgl({ left: '⇤', center: '↔', right: '⇥' }[a], (o && TEXTY(o) ? o.align : st.align) === a, () => setStyle('align', a), 'Align ' + a)));
        if (TEXTY(o) || (!o && (S.tool === 'edit' || S.tool === 'text'))) {
          textUI();
          if (!o && S.tool === 'edit') kids.push(h('span', { class: 'sep', style: { width: '1px', alignSelf: 'stretch', background: 'var(--line)' } }), lbl('Edit by'), h('select', { onchange: ev => { S.gran = ev.target.value; refreshAll(); } }, [['block', 'Paragraph'], ['line', 'Single line']].map(([v, n]) => h('option', { value: v, selected: S.gran === v }, n))), ui.check('Show all text', S.showAll, ev => { S.showAll = ev.target.checked; setTool(S.tool); }));
        } else if (['rect', 'ellipse', 'line', 'arrow', 'draw', 'underline', 'strike'].includes(t)) {
          kids.push(lbl('Colour'), colorIn(o ? (o.stroke || o.color) : st.stroke, v => setStyle('stroke', v), 'Colour'), lbl('Width'), numIn(o ? (o.sw ?? 2) : st.sw, v => setStyle('sw', v), 0.5, 30, 0.5));
          if (t === 'rect' || t === 'ellipse') kids.push(lbl('Fill'), h('select', { onchange: ev => setStyle('fill', ev.target.value) }, [['', 'None'], ['#ffffff', 'White'], ['#fff3a3', 'Yellow'], ['#c8f7c5', 'Green'], ['#ffd1dc', 'Pink'], ['#cfe3ff', 'Blue'], ['#000000', 'Black']].map(([v, n]) => h('option', { value: v, selected: (o ? o.fill || '' : st.fill) === v }, n))));
        } else if (t === 'highlight') kids.push(lbl('Colour'), ...['#ffeb3b', '#8bf28b', '#ff9ecb', '#7fd1ff', '#ffb347'].map(c => h('button', { class: 'tbtn', type: 'button', style: { minWidth: '34px', height: '34px', background: c, borderColor: (o ? o.color : st.hl) === c ? 'var(--accent)' : 'var(--line)' }, onclick: () => setStyle('hl', c), 'aria-label': 'Highlight colour' })));
        else if (t === 'whiteout') kids.push(lbl('Colour'), colorIn(o ? o.color : st.wo, v => setStyle('wo', v), 'Cover colour'), h('span', { class: 'muted' }, 'Choose a matching colour for tinted or dark page backgrounds.'));
        else if (t === 'redact') kids.push(h('span', { class: 'muted' }, 'Redaction removes the text underneath for real (not just hidden). Check the result.'));
        else if (t === 'link') kids.push(h('span', { class: 'muted' }, 'After you drag, you will be asked for a web address or a page number.'));
        else kids.push(h('span', { class: 'muted' }, 'Choose a tool above. Tap 👆 Select to move or resize things.'));
        if (o) kids.push(h('span', { class: 'sep', style: { width: '1px', alignSelf: 'stretch', background: 'var(--line)' } }), ui.btn('Duplicate', () => dupObj(o), 'sm'), ui.btn('🗑 Delete', () => delObj(o.id), 'sm'));
        opts.replaceChildren(...kids);
      }
      function dupObj(o) { const f = find(o.id); if (!f) return; pushUndo(); const c = JSON.parse(JSON.stringify(o)); c.id = uid(); const d = 14; if (c.x != null) c.x += d; if (c.y != null) c.y += d; if (c.x0 != null) c.x0 += d; if (c.base0 != null) c.base0 += d; if (c.x1 != null) { c.x1 += d; c.x2 += d; c.y1 += d; c.y2 += d; } if (c.pts) c.pts = c.pts.map(p => [p[0] + d, p[1] + d]); if (c.type === 'edit') { c.type = 'text'; delete c.items; delete c.key; c.bg = null; } f.e.objs.push(c); S.sel = { oid: c.id }; refreshLayer(f.e.id); renderOpts(); useFont(c, f.e); }
      function delObj(oid) { const f = find(oid); if (!f) return; pushUndo(); f.e.objs = f.e.objs.filter(x => x.id !== oid); S.sel = null; refreshLayer(f.e.id); renderOpts(); }

      /* ───────── pointer handling ───────── */
      function pt(ev, layer) { const r = layer.getBoundingClientRect(); return [(ev.clientX - r.left) / S.z, (ev.clientY - r.top) / S.z]; }
      function pageDown(ev, e, layer) {
        if (ev.button > 0 || (editing && ev.target.closest('.ped-editor'))) return;
        const tEl = ev.target.closest('.obj'), isBox = ev.target.closest('.tb-box');
        if (editing) closeEditor();
        if (tEl && ev.target.dataset.del) { delObj(tEl.dataset.oid); ev.preventDefault(); return; }
        if (tEl && (S.tool === 'select' || S.tool === 'edit' || S.tool === 'text' || ev.target.dataset.rh || (S.sel && S.sel.oid === tEl.dataset.oid))) { objDown(ev, e, layer, tEl); return; }
        if (S.tool === 'edit' && isBox) { const blk = blocksOf(e)[+isBox.dataset.bi]; if (blk) { ev.preventDefault(); const key = S.gran + ':' + isBox.dataset.bi; pushUndo(); const o = editFromBlock(e, blk, key); e.objs.push(o); S.sel = { oid: o.id }; refreshLayer(e.id); renderOpts(); openEditor(e, o); } return; }
        if (S.tool === 'text') { ev.preventDefault(); const [x, y] = pt(ev, layer); pushUndo(); const o = newText(e, x, y - S.sty.size * 0.6); e.objs.push(o); S.sel = { oid: o.id }; refreshLayer(e.id); renderOpts(); openEditor(e, o); return; }
        if (S.tool === 'select' || S.tool === 'edit') { if (S.sel) { S.sel = null; refreshAll(); renderOpts(); } return; }
        if (DRAG.has(S.tool)) { ev.preventDefault(); startDraw(ev, e, layer); return; }
        if (S.tool === 'image' || S.tool === 'sign') { if (S.pending) { ev.preventDefault(); const [x, y] = pt(ev, layer), p = S.pending; S.pending = null; pushUndo(); const w = p.w, hh = p.h; const o = { id: uid(), type: p.type, asset: p.asset, x: Math.max(0, x - w / 2), y: Math.max(0, y - hh / 2), w, h: hh }; e.objs.push(o); S.sel = { oid: o.id }; S.tool = 'select'; syncBtns(); refreshLayer(e.id); renderOpts(); status.textContent = 'Placed. Drag to move, pull the corner to resize.'; } }
      }
      function objDown(ev, e, layer, el) {
        ev.preventDefault(); ev.stopPropagation(); const f = find(el.dataset.oid); if (!f) return; const o = f.o; const wasSel = S.sel && S.sel.oid === o.id; S.sel = { oid: o.id }; renderOpts();
        layer.querySelectorAll('.obj.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel');
        const resize = !!ev.target.dataset.rh, [sx, sy] = pt(ev, layer), orig = JSON.parse(JSON.stringify(o)); let moved = false, undone = false;
        const mv = m => {
          const [px, py] = pt(m, layer), dx = px - sx, dy = py - sy; if (!moved && Math.hypot(dx, dy) * S.z < 4) return; moved = true; if (!undone) { undone = true; const keep = JSON.stringify(o); Object.assign(o, orig); pushUndo(); o.fresh = false; Object.assign(o, JSON.parse(keep)); }
          if (resize) { if (TEXTY(o)) { o.maxW = Math.max(30, orig.w + dx); o.w = o.maxW; } else { o.w = Math.max(6, orig.w + dx); o.h = o.type === 'image' || o.type === 'sign' ? Math.max(6, o.w * orig.h / orig.w) : Math.max(6, orig.h + dy); } }
          else if (o.x1 != null) { o.x1 = orig.x1 + dx; o.x2 = orig.x2 + dx; o.y1 = orig.y1 + dy; o.y2 = orig.y2 + dy; }
          else if (o.pts) o.pts = orig.pts.map(p => [p[0] + dx, p[1] + dy]);
          else { o.x = orig.x + dx; o.y = orig.y + dy; if (o.x0 != null) { o.x0 = orig.x0 + dx; o.base0 = orig.base0 + dy; } }
          relayout(o, e); const ne = objEl(o, e); const old = layer.querySelector('[data-oid="' + o.id + '"]'); if (old) old.replaceWith(ne);
        };
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); if (!moved && !resize && TEXTY(o) && (S.tool === 'edit' || S.tool === 'text' || wasSel)) { openEditor(e, o); } else refreshLayer(e.id); };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      }
      function startDraw(ev, e, layer) {
        const t = S.tool, st = S.sty, [sx, sy] = pt(ev, layer); let o;
        const mk = { whiteout: () => ({ type: 'whiteout', color: st.wo }), redact: () => ({ type: 'redact' }), highlight: () => ({ type: 'highlight', color: st.hl, opacity: 0.45 }), underline: () => ({ type: 'underline', color: st.stroke, sw: Math.min(st.sw, 3) }), strike: () => ({ type: 'strike', color: st.stroke, sw: Math.min(st.sw, 3) }), rect: () => ({ type: 'rect', stroke: st.stroke, sw: st.sw, fill: st.fill || undefined }), ellipse: () => ({ type: 'ellipse', stroke: st.stroke, sw: st.sw, fill: st.fill || undefined }), link: () => ({ type: 'link' }), line: () => ({ type: 'line', stroke: st.stroke, sw: st.sw }), arrow: () => ({ type: 'arrow', stroke: st.stroke, sw: st.sw }), draw: () => ({ type: 'draw', stroke: st.stroke, sw: st.sw }) }[t]();
        o = Object.assign({ id: uid(), x: sx, y: sy, w: 0, h: 0 }, mk);
        if (t === 'line' || t === 'arrow') Object.assign(o, { x1: sx, y1: sy, x2: sx, y2: sy }); if (t === 'draw') o.pts = [[sx, sy]];
        const ghost = () => { const old = layer.querySelector('[data-oid="' + o.id + '"]'); const ne = objEl(o, e); ne.style.pointerEvents = 'none'; ne.querySelectorAll('.rh,.del').forEach(n => n.remove()); if (old) old.replaceWith(ne); else layer.append(ne); };
        const mv = m => {
          const [px, py] = pt(m, layer);
          if (t === 'line' || t === 'arrow') { o.x2 = px; o.y2 = py; if (m.shiftKey) o.y2 = o.y1; }
          else if (t === 'draw') { const l = o.pts[o.pts.length - 1]; if (Math.hypot(px - l[0], py - l[1]) > 1.2) o.pts.push([px, py]); }
          else if (t === 'underline' || t === 'strike') { o.x = Math.min(sx, px); o.w = Math.abs(px - sx); o.y = sy; o.h = 0; }
          else { o.x = Math.min(sx, px); o.y = Math.min(sy, py); o.w = Math.abs(px - sx); o.h = Math.abs(py - sy); }
          ghost();
        };
        const up = async () => {
          window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
          const tiny = (t === 'line' || t === 'arrow') ? Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 3 : t === 'draw' ? o.pts.length < 2 : (t === 'underline' || t === 'strike') ? o.w < 4 : (o.w < 4 || o.h < 4);
          if (tiny) { if (t === 'draw' && o.pts.length === 1) { o.pts.push([o.pts[0][0] + 0.1, o.pts[0][1] + 0.1]); } else { refreshLayer(e.id); return; } }
          if (t === 'link') { const v = prompt('Where should this link go?\nType a web address (https://…) or a page number.', 'https://'); if (!v || v === 'https://') { refreshLayer(e.id); return; } if (/^\d+$/.test(v.trim())) o.page = v.trim(); else o.url = /^[a-z]+:/i.test(v.trim()) ? v.trim() : 'https://' + v.trim(); }
          pushUndo(); e.objs.push(o); if (t !== 'draw') { S.sel = { oid: o.id }; } refreshLayer(e.id); renderOpts();
        };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      }

      /* ───────── inline text editor ───────── */
      function openEditor(e, o) {
        closeEditor(); const pe = pageEls.get(e.id); if (!pe) return; const z = S.z, ww = o.maxW || Math.max(120, o.w, e.w - o.x0 - 6);
        const ta = h('textarea', { class: 'ped-editor', spellcheck: 'true', rows: Math.max(1, (o.text.match(/\n/g) || []).length + 1), style: { left: (o.x0 - 3) * z + 'px', top: (o.base0 - o.size * CSS_BASE - 3) * z + 'px', width: Math.max(ww * z + 12, 90) + 'px', fontFamily: Core.CSSFONT[o.fam], fontSize: o.size * z + 'px', lineHeight: o.lineH * z + 'px', fontWeight: Core.resolveStyle(o.fam, o.bold, o.italic).includes('b') ? 700 : 400, fontStyle: Core.resolveStyle(o.fam, o.bold, o.italic).includes('i') ? 'italic' : 'normal', color: o.color, textAlign: o.align, resize: 'none', overflow: 'hidden' } });
        ta.value = o.text; const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }; ta.addEventListener('input', fit);
        ta.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); closeEditor(true); } else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); closeEditor(); } });
        ta.addEventListener('blur', () => setTimeout(() => { if (editing && editing.ta === ta) closeEditor(); }, 120));
        pe.layer.append(ta); editing = { e, o, ta }; const old = pe.layer.querySelector('[data-oid="' + o.id + '"]'); if (old) old.querySelectorAll('.ln').forEach(n => n.style.opacity = 0);
        fit(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); status.textContent = 'Typing… tap outside to finish. Ctrl+Enter also finishes.';
      }
      function closeEditor(cancel) {
        if (!editing) return; const { e, o, ta } = editing; editing = null; const txt = ta.value; ta.remove();
        if (cancel) { if (o.fresh) { e.objs = e.objs.filter(x => x !== o); S.undo.pop(); syncBtns(); S.sel = null; } refreshLayer(e.id); renderOpts(); return; }
        if (txt !== o.text) { if (!o.fresh) pushUndo(); o.text = txt; o.fresh = false; }
        if (o.type === 'text' && !txt.trim()) { e.objs = e.objs.filter(x => x !== o); S.sel = null; if (o.fresh) { S.undo.pop(); syncBtns(); } }
        else if (o.fresh && txt === o.text && o.type === 'edit') { e.objs = e.objs.filter(x => x !== o); S.undo.pop(); syncBtns(); S.sel = null; }
        else if (o.type === 'text' && o.fresh) o.fresh = false;
        relayout(o, e); refreshLayer(e.id); renderOpts(); status.textContent = 'Edited. Keep going, or tap ⬇ Download when you are done.';
      }

      /* ───────── images & signature ───────── */
      async function addImage(file) {
        try {
          let data, mime; const bm = await createImageBitmap(file);
          if (/^image\/(png|jpeg)$/.test(file.type)) { data = new Uint8Array(await file.arrayBuffer()); mime = file.type; }
          else { const c = h('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0); data = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer()); mime = 'image/png'; }
          const id = 'a' + (S.nid++); S.assets[id] = { mime, data, url: URL.createObjectURL(new Blob([data], { type: mime })) };
          const cur = E(S.order[S.cur] || S.order[0]), maxW = cur.w * 0.4, sc = Math.min(1, maxW / bm.width), w = bm.width * sc, hh = bm.height * sc;
          S.pending = { type: 'image', asset: id, w, h: hh }; status.textContent = 'Tap the page where the image should go.';
        } catch (err) { ui.toast('Could not read that image'); }
      }
      function signDialog() {
        const dlg = h('dialog'), cv = h('canvas', { class: 'sigpad' }); let strokes = [], cur = null; const ctx = () => cv.getContext('2d');
        const sizeIt = () => { cv.width = 520; cv.height = 180; const c = ctx(); c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#111'; };
        const draw = () => { const c = ctx(); c.clearRect(0, 0, cv.width, cv.height); strokes.forEach(s => { c.beginPath(); s.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); if (s.length === 1) { c.beginPath(); c.arc(s[0][0], s[0][1], 1.5, 0, 7); c.fill(); } }); };
        const pos = ev => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) * cv.width / r.width, (ev.clientY - r.top) * cv.height / r.height]; };
        cv.addEventListener('pointerdown', ev => { cv.setPointerCapture(ev.pointerId); cur = [pos(ev)]; strokes.push(cur); draw(); }); cv.addEventListener('pointermove', ev => { if (cur) { cur.push(pos(ev)); draw(); } }); cv.addEventListener('pointerup', () => { cur = null; });
        dlg.append(h('h3', { style: { marginTop: 0 } }, 'Draw your signature'), cv, h('div', { class: 'btns', style: { marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          ui.btn('Clear', () => { strokes = []; draw(); }), ui.btn('Cancel', () => { dlg.close(); dlg.remove(); setTool('select'); }),
          ui.btn('Use signature', async () => {
            if (!strokes.length) { ui.toast('Draw something first'); return; } const pts = strokes.flat(), x0 = Math.min(...pts.map(p => p[0])) - 6, y0 = Math.min(...pts.map(p => p[1])) - 6, x1 = Math.max(...pts.map(p => p[0])) + 6, y1 = Math.max(...pts.map(p => p[1])) + 6;
            const out = h('canvas'); out.width = Math.max(10, x1 - x0); out.height = Math.max(10, y1 - y0); out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
            const data = new Uint8Array(await (await new Promise(r => out.toBlob(r, 'image/png'))).arrayBuffer()), id = 'a' + (S.nid++); S.assets[id] = { mime: 'image/png', data, url: URL.createObjectURL(new Blob([data], { type: 'image/png' })) };
            const cur2 = E(S.order[S.cur] || S.order[0]), w = Math.min(cur2.w * 0.3, 160), hh = w * out.height / out.width; S.pending = { type: 'sign', asset: id, w, h: hh }; dlg.close(); dlg.remove(); status.textContent = 'Tap the page where the signature should go.';
          }, 'primary')));
        document.body.append(dlg); dlg.showModal(); sizeIt();
      }

      /* ───────── find & replace ───────── */
      function findDialog() {
        if (!S.pdf) { ui.toast('Open a PDF first'); return; }
        const dlg = h('dialog'), f = h('input', { type: 'text', placeholder: 'Find…', style: { width: '100%' } }), r = h('input', { type: 'text', placeholder: 'Replace with…', style: { width: '100%' } }), cs = h('input', { type: 'checkbox' }), res = h('p', { class: 'muted' }, '');
        const run = async doIt => {
          const q = f.value; if (!q) return; let n = 0, pages = 0; const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs.checked ? 'g' : 'gi'); if (doIt) pushUndo();
          for (const e of live()) { if (e.src == null) continue; await loadText(e); let hit = false;
            for (const ln of e.text.lines) { const m = ln.text.match(re); if (!m) continue; n += m.length; hit = true; if (doIt) { const blk = Core.lineAsBlock(ln); if (covered(e, blk)) continue; if (!e.canvas) { const pe = pageEls.get(e.id); if (pe) await new Promise(res2 => { renderCanvas(e.id); renderQ.then(res2); }); } const o = editFromBlock(e, blk, 'find'); o.text = ln.text.replace(re, r.value); o.fresh = false; relayout(o, e); e.objs.push(o); } }
            if (hit) pages++; if (doIt) refreshLayer(e.id); }
          res.textContent = n ? (doIt ? 'Replaced ' + n + ' match' + (n > 1 ? 'es' : '') + ' on ' + pages + ' page' + (pages > 1 ? 's' : '') + '. Lines are re-typed in one font; check the result.' : 'Found ' + n + ' match' + (n > 1 ? 'es' : '') + ' on ' + pages + ' page' + (pages > 1 ? 's' : '') + '.') : 'No matches found.';
        };
        dlg.append(h('h3', { style: { marginTop: 0 } }, 'Find & replace'), h('div', { style: { display: 'grid', gap: '10px' } }, f, r, h('label', { class: 'check' }, cs, 'Match case'), res, h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, ui.btn('Find', () => run(false)), ui.btn('Replace all', () => run(true), 'primary'), ui.btn('Close', () => { dlg.close(); dlg.remove(); }))));
        document.body.append(dlg); dlg.showModal(); f.focus();
      }

      /* ───────── pages panel ───────── */
      function buildSide() {
        side.replaceChildren(h('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' } }, ui.btn('+ Blank', () => addBlank(), 'sm'), ui.btn('Close', () => side.classList.remove('on'), 'sm')));
        live().forEach((e, i) => {
          const th = h('div', { class: 'pt' + (i === S.cur ? ' cur' : ''), onclick: () => { const pe = pageEls.get(e.id); if (pe) { pe.page.scrollIntoView({ block: 'start' }); S.cur = i; } } }, h('div', { 'data-th': e.id }, ''), h('div', {}, String(i + 1)),
            h('div', { style: { display: 'flex', gap: '2px', justifyContent: 'center', flexWrap: 'wrap' } }, ...[['↑', 'Move up', () => movePage(i, -1)], ['↓', 'Move down', () => movePage(i, 1)], ['⟲', 'Rotate left', () => rotPage(e, -90)], ['⟳', 'Rotate right', () => rotPage(e, 90)], ['🗑', 'Delete page', () => delPage(i)]].map(([t, ti, fn]) => h('button', { class: 'tbtn', type: 'button', title: ti, style: { minWidth: '28px', height: '28px', fontSize: '13px', padding: 0 }, onclick: ev => { ev.stopPropagation(); fn(); } }, t))));
          side.append(th); thumb(e, th.firstChild);
        });
      }
      async function thumb(e, box) {
        try { if (e.src == null) { box.append(h('div', { style: { background: '#fff', aspectRatio: e.w + '/' + e.h, boxShadow: '0 1px 4px rgba(0,0,0,.2)' } })); return; } const page = await S.pdf.getPage(e.src + 1), vp = page.getViewport({ scale: 110 / (e.rot % 180 ? e.h : e.w), rotation: e.rot }), c = h('canvas'); c.width = vp.width; c.height = vp.height; await page.render({ canvas: c, viewport: vp }).promise; box.append(c); } catch (_) { }
      }
      function movePage(i, d) { const j = i + d; if (j < 0 || j >= S.order.length) return; pushUndo(); [S.order[i], S.order[j]] = [S.order[j], S.order[i]]; buildPages(); buildSide(); }
      function delPage(i) { if (S.order.length < 2) { ui.toast('A PDF needs at least one page'); return; } pushUndo(); const id = S.order[i]; E(id).deleted = true; S.order.splice(i, 1); S.cur = Math.min(S.cur, S.order.length - 1); buildPages(); buildSide(); }
      function rotPage(e, d) { if (e.src == null) { ui.toast('Rotate is for original pages'); return; } if (e.objs.length) { ui.toast('Rotate before editing this page (or undo its edits first)'); return; } pushUndo(); e.rot = ((e.rot + d) % 360 + 360) % 360; const t = e.w; e.w = e.h; e.h = t; e.text = null; buildPages(); buildSide(); }
      function addBlank() { pushUndo(); const ref = E(S.order[S.cur] || S.order[0]), id = 'b' + (S.nid++); S.ents.set(id, { id, src: null, w: ref.w, h: ref.h, view: [0, 0, ref.w, ref.h], baseRot: 0, rot: 0, deleted: false, objs: [], text: null }); S.order.splice(S.cur + 1, 0, id); buildPages(); buildSide(); }

      /* ───────── export ───────── */
      async function textImage(lines, st) {
        const sc = 3, c = h('canvas'), pad = 2; c.width = Math.ceil((st.width + pad * 2) * sc); c.height = Math.ceil(((lines.length - 1) * st.lineH + st.size * 1.35 + pad) * sc); const x = c.getContext('2d'); x.scale(sc, sc); x.fillStyle = st.color; x.textBaseline = 'alphabetic';
        x.font = (st.italic ? 'italic ' : '') + (st.bold ? 'bold ' : '') + st.size + 'px ' + Core.CSSFONT[st.fam];
        lines.forEach((ln, i) => { const w = x.measureText(ln).width * (st.hs || 1); let px = pad; if (st.align === 'center') px += (st.width - w) / 2; else if (st.align === 'right') px += st.width - w; x.save(); x.translate(px, st.size * 0.95 + i * st.lineH); x.scale(st.hs || 1, 1); x.fillText(ln, 0, 0); x.restore(); });
        const blob = await new Promise(r => c.toBlob(r, 'image/png')); return { png: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height, scale: sc };
      }
      async function exportPdf() {
        if (!S.pdf) { ui.toast('Open a PDF first'); return; } closeEditor(); dl.disabled = true; fab.disabled = true; const old = dl.textContent; dl.textContent = 'Saving…'; status.textContent = 'Preparing pages and background…';
        try {
          // The editor renders pages lazily. Force-render every page containing a text edit
          // before making its background patch, otherwise an off-screen page can export blank.
          const edited = live().filter(e => e.src != null && e.objs.some(o => o.type === 'edit'));
          for (const e of edited) {
            const pe = pageEls.get(e.id);
            if (pe && !e.canvas) { pe.done = false; renderCanvas(e.id); await renderQ; }
            if (!e.canvas) throw new Error('Could not render page ' + (e.src + 1) + ' for text replacement. Scroll to that page and try again.');
          }
          status.textContent = 'Building your PDF…';
          await Promise.all(live().flatMap(e => e.objs.filter(TEXTY).map(o => ensureFont(o.fam, o.bold, o.italic))));
          const entries = live().map(e => ({ src: e.src, w: e.w, h: e.h, view: e.view, rot: e.rot, baseRot: e.baseRot, deleted: false, objs: e.objs.map(o => { const c = Object.assign({}, o); if (TEXTY(c)) { c.lines = o.lines; } return c; }) }));
          const out = await Core.exportDoc(S.PL, S.bytes, entries, S.assets, { metrics: S.metrics, textImage, coverImage, fontBytes: async (f, b, i) => fontBytes.get(f + '|' + Core.resolveStyle(f, b, i)), removeText: Core.removeTextFactory(S.metrics), rasterEdits: false });
          const pdfBytes = out instanceof Uint8Array ? out.slice() : new Uint8Array(out);
          if (pdfBytes.length < 100 || String.fromCharCode(...pdfBytes.subarray(0, 5)) !== '%PDF-') throw new Error('The generated file is incomplete. No download was started; please try saving again.');
          const blob = new Blob([pdfBytes], { type: 'application/pdf' }); ui.download(blob, S.name + '-edited.pdf'); S.dirty = false; const r = out.report || {};
          const parts = []; if (r.removed) parts.push(r.removed + ' text edit' + (r.removed > 1 ? 's' : '') + ' removed the old text from the file'); if (r.covered) parts.push(r.covered + ' edit' + (r.covered > 1 ? 's' : '') + ' covered the old text with a patch (it may still be selectable)'); if (r.imageText) parts.push(r.imageText + ' block' + (r.imageText > 1 ? 's' : '') + ' with special characters saved as picture text');
          status.textContent = '✅ Saved ' + ui.fmtBytes(blob.size) + (parts.length ? ' · ' + parts.join(' · ') : '');
        } catch (err) { console.error(err); ui.toast('Could not save: ' + (err.message || err)); status.textContent = 'Could not save: ' + (err.message || err); }
        finally { dl.disabled = false; fab.disabled = false; dl.textContent = old; }
      }

      /* ───────── keyboard & lifecycle ───────── */
      const onKey = ev => {
        if (!alive || (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName))) return; const k = ev.key.toLowerCase();
        if ((ev.ctrlKey || ev.metaKey) && k === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); } else if ((ev.ctrlKey || ev.metaKey) && k === 'y') { ev.preventDefault(); redo(); }
        else if ((k === 'delete' || k === 'backspace') && S.sel) { ev.preventDefault(); delObj(S.sel.oid); } else if (k === 'escape') { S.sel = null; refreshAll(); renderOpts(); }
        else if (S.sel && k.startsWith('arrow')) { const o = curObj(), f = o && find(o.id); if (!o) return; ev.preventDefault(); pushUndo(); const d = ev.shiftKey ? 10 : 1, dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0; if (o.x1 != null) { o.x1 += dx; o.x2 += dx; o.y1 += dy; o.y2 += dy; } else if (o.pts) o.pts = o.pts.map(p => [p[0] + dx, p[1] + dy]); else { o.x += dx; o.y += dy; if (o.x0 != null) { o.x0 += dx; o.base0 += dy; } } relayout(o, f.e); refreshLayer(f.e.id); }
      };
      const onUnload = ev => { if (S.dirty) { ev.preventDefault(); ev.returnValue = ''; } };
      window.addEventListener('keydown', onKey); window.addEventListener('beforeunload', onUnload);
      // pinch / ctrl+wheel zoom
      scroll.addEventListener('wheel', ev => { if (ev.ctrlKey) { ev.preventDefault(); zoom(ev.deltaY < 0 ? 1.1 : 1 / 1.1); } }, { passive: false });
      scroll.addEventListener('dragover', ev => ev.preventDefault()); scroll.addEventListener('drop', ev => { ev.preventDefault(); const f = ev.dataTransfer.files[0]; if (f) openFile(f); });
      showEmpty(); renderOpts(); syncBtns();
      window.__ped = { S, openFile, exportPdf }; // handy for tests
      return () => { alive = false; window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload); if (io) io.disconnect(); Object.values(S.assets).forEach(a => URL.revokeObjectURL(a.url)); };
    }
  });
})();
