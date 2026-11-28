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
      const S = { name: 'document', bytes: null, pdf: null, pdfjs: null, PL: null, metrics: null, ents: new Map(), order: [], cur: 0, z: 1, tool: 'edit', sel: null, undo: [], redo: [], assets: {}, gran: 'block', reflow: true, showAll: false, dirty: false, nid: 1, sty: { fam: 'Helvetica', size: 12, bold: false, italic: false, underline: false, color: '#000000', align: 'left', stroke: '#d62828', sw: 2, fill: '', hl: '#ffeb3b', wo: '#ffffff' } };
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
          if (!it.str || !it.str.trim() || !it.transform) continue; const m = S.pdfjs.Util.transform(vp.transform, it.transform), fs = Math.hypot(m[0], m[1]); if (!(fs > 0.5) || Math.abs(m[1]) > 0.2 * fs || Math.abs(m[2]) > 0.5 * fs || m[0] <= 0) continue;
          const st = tc.styles[it.fontName] || {}; if (!(it.fontName in cls)) { let info = {}, name = st.fontFamily || ''; try { if (page.commonObjs.has(it.fontName)) { const f = page.commonObjs.get(it.fontName); info = f || {}; name = (f && f.name) || name; } } catch (_) { } cls[it.fontName] = Core.classifyFont(name, Object.assign({ isSerifFont: /serif$/.test(st.fontFamily || '') && !/sans/.test(st.fontFamily || ''), isMonospace: /mono/.test(st.fontFamily || '') }, info)); }
          items.push({ str: it.str, x: m[4], y: m[5], w: it.width * (vp.scale || 1), fs, asc: st.ascent ?? 0.9, desc: st.descent ?? -0.2, font: it.fontName });
        }
        const lines = Core.groupLines(items), blocks = Core.groupBlocks(lines); e.text = { lines, blocks, cls };
        try { e.imgs = await detectImages(page, vp); } catch (err) { console.warn('image scan failed', err); e.imgs = []; }
      }
      function sample(e, b) { // estimate ink from text pixels and page colour from the surrounding margin
        const c = e.canvas; if (!c) return { color: '#000000', bg: '#ffffff' };
        const k = e.csc || 1, x = Math.max(1, Math.floor((b.x0 - 1) * k)), y = Math.max(1, Math.floor(b.top * k));
        const w = Math.min(c.width - x - 1, Math.ceil((b.x1 - b.x0 + 2) * k)), hh = Math.min(c.height - y - 1, Math.ceil((b.bottom - b.top) * k));
        if (w < 1 || hh < 1) return { color: '#000000', bg: '#ffffff' };
        const ctx = c.getContext('2d'); let inkData, edge = [];
        try {
          inkData = ctx.getImageData(x, y, w, hh).data;
          const add = (ix, iy, iw, ih) => { if (iw > 0 && ih > 0) { const d = ctx.getImageData(ix, iy, iw, ih).data; for (let j = 0; j < d.length; j += 4) edge.push([d[j], d[j + 1], d[j + 2]]); } };
          const band = Math.max(1, Math.min(4, Math.round(k * 1.5)));
          add(x, Math.max(0, y - band), w, Math.min(band, y));
          add(x, Math.min(c.height - band, y + hh), w, band);
          add(Math.max(0, x - band), y, Math.min(band, x), hh);
          add(Math.min(c.width - band, x + w), y, band, hh);
        } catch (_) { return { color: '#000000', bg: '#ffffff' }; }
        if (!edge.length) return { color: '#000000', bg: '#ffffff' };
        // page colour = the most common colour around AND inside the text box (so white text on a blue bar still reads as "blue background")
        const bins = new Map(), q = v => v >> 3, put = (r, g, b2) => { const key = (q(r) << 10) | (q(g) << 5) | q(b2), c = bins.get(key); if (c) { c.n++; c.r += r; c.g += g; c.b += b2; } else bins.set(key, { n: 1, r, g, b: b2 }); };
        edge.forEach(v => put(v[0], v[1], v[2])); for (let i = 0; i < inkData.length; i += 4) put(inkData[i], inkData[i + 1], inkData[i + 2]);
        let top = null; bins.forEach(c => { if (!top || c.n > top.n) top = c; }); const avg = [top.r / top.n, top.g / top.n, top.b / top.n];
        const hx = a2 => '#' + a2.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
        // text colour = the pixels that differ most from the page colour (ignore faint anti-aliasing: use the strongest 3% as the core of the strokes)
        const dist = []; for (let i = 0; i < inkData.length; i += 4) { const d = Math.abs(inkData[i] - avg[0]) + Math.abs(inkData[i + 1] - avg[1]) + Math.abs(inkData[i + 2] - avg[2]); if (d > 90) dist.push([d, inkData[i], inkData[i + 1], inkData[i + 2]]); }
        const near = edge.filter(v => Math.abs(v[0] - avg[0]) + Math.abs(v[1] - avg[1]) + Math.abs(v[2] - avg[2]) < 36).length, uniform = near / edge.length >= 0.88; // flat colour around the text → a matching patch is invisible
        if (!dist.length) return { color: (avg[0] + avg[1] + avg[2]) / 3 > 140 ? '#111111' : '#ffffff', bg: hx(avg), uniform };
        dist.sort((p2, q2) => q2[0] - p2[0]); const core = dist.slice(0, Math.max(1, Math.ceil(dist.length * 0.12))); const col = [1, 2, 3].map(ix => core.reduce((sm, v) => sm + v[ix], 0) / core.length);
        return { color: hx(col), bg: hx(avg), uniform };
      }

      /* ───────── objects ───────── */
      function relayout(o, e) {
        if (!TEXTY(o)) return; const ww = o.maxW || Math.max(40, e.w - o.x0 - 6);
        o.lines = Core.layoutText(o.text, { fam: o.fam, bold: o.bold, italic: o.italic, size: o.size, hs: o.hs || 1, maxW: ww }, S.metrics);
        const wOf = s => { const x = S.metrics.width(s, o.fam, o.bold, o.italic, o.size); return (isNaN(x) ? s.length * o.size * 0.55 : x) * (o.hs || 1); };
        if (o.type === 'text' || o.type === 'edit') { o.w = Math.max(o.maxW || 0, ...o.lines.map(wOf), 12); o.h = (o.lines.length - 1) * o.lineH + o.size * 1.25; o.x = o.x0; o.y = o.base0 - o.size * 0.95; }
      }
      function newText(e, x, y) {
        const st = S.sty, o = { id: uid(), type: 'text', fam: st.fam, size: st.size, bold: st.bold, italic: st.italic, underline: st.underline, color: st.color, align: st.align, text: '', hs: 1, lineH: st.size * 1.2, x0: x, base0: y + st.size * 0.95, maxW: 0, x, y, w: 20, h: st.size * 1.25, fresh: true };
        relayout(o, e); useFont(o, e); return o;
      }
      // Work out how the original text is aligned (left / centre / right) so the edited text keeps it.
      function detectAlign(e, blk) {
        const W = e.w, tol = Math.max(1.5, 0.012 * W), ls = blk.lines;
        if (ls.length === 1) { const l = ls[0].x0, r = W - ls[0].x1, wid = ls[0].x1 - ls[0].x0; if (wid > 0.86 * W) return 'left'; if (Math.abs(l - r) <= tol * 1.6 && l > 0.06 * W) return 'center'; if (r < 0.5 * l && l > 0.4 * W && r < 0.14 * W) return 'right'; return 'left'; }
        const c = ls.map(x => (x.x0 + x.x1) / 2), x0s = ls.map(x => x.x0), x1s = ls.map(x => x.x1), span = a => Math.max(...a) - Math.min(...a);
        if (span(c) <= tol && span(x0s) > tol * 1.5) return 'center'; if (span(x1s) <= tol && span(x0s) > tol * 1.5) return 'right'; return 'left';
      }
      function editFromBlock(e, blk, key) {
        const cl = e.text.cls[blk.font] || { fam: 'Helvetica', bold: false, italic: false }, sm = sample(e, blk), origW = blk.x1 - blk.x0, align = detectAlign(e, blk), multi = blk.lines.length > 1;
        let x0 = blk.x0, maxW = multi ? origW * 1.03 : 0; const M = 18; // keep centred/right text inside the page margins
        if (align === 'center') { const cx = (blk.x0 + blk.x1) / 2; maxW = multi ? origW * 1.03 : Math.max(origW, 2 * Math.min(cx, e.w - cx) - 2 * M); x0 = cx - maxW / 2; }
        else if (align === 'right') { maxW = multi ? origW * 1.03 : Math.max(origW, blk.x1 - M); x0 = blk.x1 - maxW; }
        const o = { id: uid(), type: 'edit', key, x: blk.x0, y: blk.top, w: origW, h: blk.bottom - blk.top, bg: sm.bg, forceCover: !!sm.uniform, fam: cl.fam, bold: cl.bold, italic: cl.italic, size: Math.round(blk.fs * 10) / 10, color: sm.color, align, hs: 1, lineH: blk.pitch, base0: blk.lines[0].y, x0, maxW, text: blk.text, orig: blk.text, origSize: blk.fs, origTop: blk.top, origBottom: blk.bottom, ox0: blk.x0, ox1: blk.x1, origLines: blk.lines.length, shift: 0, fresh: true, items: blk.lines.flatMap(l => l.items.map(i => ({ x: i.x, y: i.y, w: i.w, str: i.str, fs: i.fs }))) };
        relayout(o, e); useFont(o, e); return o;
      }
      /* ───────── pictures already inside the PDF ───────── */
      async function detectImages(page, vp) {
        const ops = await page.getOperatorList(), O = S.pdfjs.OPS, U = S.pdfjs.Util, out = []; let ctm = [1, 0, 0, 1, 0, 0], k = 0; const stack = [];
        const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
        for (let i = 0; i < ops.fnArray.length; i++) {
          const fn = ops.fnArray[i], a = ops.argsArray[i];
          if (fn === O.save) stack.push(ctm.slice()); else if (fn === O.restore) { if (stack.length) ctm = stack.pop(); }
          else if (fn === O.transform) ctm = mul(a, ctm);
          else if (fn === O.paintFormXObjectBegin) { stack.push(ctm.slice()); if (a && a[0]) ctm = mul(a[0], ctm); }
          else if (fn === O.paintFormXObjectEnd) { if (stack.length) ctm = stack.pop(); }
          else if (fn === O.paintImageXObject || fn === O.paintImageMaskXObject) {
            const ap = (p, m) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]], pts = [[0, 0], [1, 0], [1, 1], [0, 1]].map(p => ap(ap(p, ctm), vp.transform)), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
            const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, hh = Math.max(...ys) - y; if (w >= 6 && hh >= 6 && w * hh < 0.85 * vp.width * vp.height) out.push({ k, x, y, w, h: hh }); k++;
          }
        }
        return out;
      }
      async function imgAsset(e, im) { // the picture of the PDF as an image asset (rendered once, then reused)
        if (im.aid && S.assets[im.aid]) return im.aid;
        const page = await S.pdf.getPage(e.src + 1), sc = Math.max(1.5, Math.min(4, 1800 / Math.max(im.w, im.h))), vp = page.getViewport({ scale: sc, rotation: e.rot }), full = h('canvas');
        full.width = Math.ceil(vp.width); full.height = Math.ceil(vp.height); await page.render({ canvasContext: full.getContext('2d'), viewport: vp }).promise;
        const c = h('canvas'); c.width = Math.max(1, Math.round(im.w * sc)); c.height = Math.max(1, Math.round(im.h * sc)); c.getContext('2d').drawImage(full, im.x * sc, im.y * sc, im.w * sc, im.h * sc, 0, 0, c.width, c.height);
        const data = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer()), id = 'a' + (S.nid++); S.assets[id] = { mime: 'image/png', data, url: URL.createObjectURL(new Blob([data], { type: 'image/png' })) }; full.width = 1; full.height = 1; im.aid = id; return id;
      }
      async function liftImage(e, k) { // turn a picture of the PDF into a movable / resizable / replaceable object
        const im = (e.imgs || []).find(v => v.k === k); if (!im) return; status.textContent = 'Preparing the picture…';
        try {
          const id = await imgAsset(e, im);
          pushUndo(); const o = { id: uid(), type: 'image', asset: id, x: im.x, y: im.y, w: im.w, h: im.h }; e.objs.push({ id: uid(), type: 'hideimg', idx: k, rect: { x: im.x, y: im.y, w: im.w, h: im.h } }, o); S.sel = { oid: o.id }; refreshLayer(e.id); renderOpts(); status.textContent = 'Picture selected: drag to move, pull the corner to resize, 🔄 to replace it, 🗑 to delete it.';
        } catch (err) { console.error(err); ui.toast('Could not open that picture'); }
      }
      function replaceImage(o) {
        const inp = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: { display: 'none' } }); document.body.append(inp);
        inp.onchange = async () => { const f = inp.files[0]; inp.remove(); if (!f) return; try {
          const bm = await createImageBitmap(f); let data, mime; if (/^image\/(png|jpeg)$/.test(f.type)) { data = new Uint8Array(await f.arrayBuffer()); mime = f.type; } else { const c = h('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0); data = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer()); mime = 'image/png'; }
          const id = 'a' + (S.nid++); S.assets[id] = { mime, data, url: URL.createObjectURL(new Blob([data], { type: mime })) }; const ff = find(o.id); if (!ff) return; pushUndo(); own(ff.o, ff.e); ff.o.asset = id; ff.o.h = ff.o.w * bm.height / bm.width; refreshLayer(ff.e.id); renderOpts();
        } catch (_) { ui.toast('Could not read that image'); } };
        inp.click();
      }
      /* Word-like flow: when an edit adds or removes lines, the text below moves with it and, at the end of a page, continues on the next page */
      let flowBusy = false, flowAgain = false;
      async function reflowAll() {
        if (!S.reflow) return; if (flowBusy) { flowAgain = true; return; } flowBusy = true;
        try { do { flowAgain = false; await reflowRun(); } while (flowAgain); } catch (err) { console.error('reflow failed', err); } finally { flowBusy = false; }
        refreshAll(); buildSide();
      }
      async function reflowRun() {
        // 0. forget everything the flow made earlier
        const gone = S.order.filter(id => E(id) && E(id).auto); if (gone.length) { S.order = S.order.filter(id => !gone.includes(id)); }
        for (const e of live()) { if (!e) continue; e.objs = e.objs.filter(x => !(x.flowed || x.followImg || (x.type === 'edit' && x.followOf && x.text === x.orig))); e.objs.forEach(x => { if (x.type === 'edit') delete x.flowK; }); }
        const lhOf = x => x.lineH || x.size * 1.2; let carry = [], carryStyle = null, structural = gone.length > 0, lastLimit = null, lastTop = null, lastPi = -1, toast = false;
        S.order.forEach((id, i) => { const e = E(id); if (e && !e.deleted && e.objs.some(x => x.type === 'edit' && x.origBottom != null)) lastPi = i; });
        for (let pi = 0; pi < S.order.length; pi++) {
          const e = E(S.order[pi]); if (!e || e.deleted) continue; const users0 = e.objs.filter(x => x.type === 'edit' && x.origBottom != null);
          if (!users0.length && !carry.length) continue; if (pi > lastPi && !carry.length) break;
          if (e.src != null) await loadText(e); if (!e.text) e.text = { lines: [], blocks: [], cls: {} };
          const H = e.h, body = e.text.blocks.filter(b => b.top > H * 0.07 && b.bottom < H * 0.93);
          const topM = body.length ? Math.min(...body.map(b => b.top)) : (lastTop ?? 56), limit = Math.max(H - Math.max(topM, 40), ...body.map(b => b.bottom), ...users0.map(u => u.origBottom)); lastLimit = limit; lastTop = topM;
          // a. text carried over from the previous page goes to the top of this one
          let cy = topM, prevBottom = null, carryH = 0; const placed = [];
          for (const c of carry) { if (c.kind === 'image') { const gap = prevBottom == null ? 0 : Math.min(30, Math.max(0, c.gap)), o = { id: uid(), type: 'image', asset: c.aid, x: c.x, y: cy + gap, w: c.w, h: c.h, flowed: true }; cy = o.y + o.h; prevBottom = cy; e.objs.push(o); placed.push(o); continue; } const o = Object.assign({}, c.proto, { id: uid(), type: 'text', flowed: true, text: c.text, fresh: false, items: undefined, orig: undefined, origBottom: undefined, flowK: undefined }); const gap = prevBottom == null ? 0 : Math.min(30, Math.max(0, c.gap)); relayout(o, e); o.base0 = cy + gap + o.size * 0.95; relayout(o, e); cy = o.y + o.h; prevBottom = cy; e.objs.push(o); placed.push(o); }
          carryH = placed.length ? cy - topM + 14 : 0; carry = [];
          // b. edits on this page push the text below them (and the carried text pushes everything)
          const users = e.objs.filter(x => x.type === 'edit' && x.origBottom != null && !(x.origTop > H * 0.93)), virt = carryH ? [{ origBottom: topM - 1, ox0: 0, ox1: e.w, __g: carryH }] : [];
          const g = new Map(users.map(x => [x, ((x.lines ? x.lines.length : 1) - (x.origLines || 1)) * lhOf(x)])); virt.forEach(v => g.set(v, v.__g));
          const srcs = [...users, ...virt], hits = (top, x0, x1, u) => top >= u.origBottom - 2 && Math.min(x1, u.ox1) - Math.max(x0, u.ox0) > 0.25 * Math.min(x1 - x0, u.ox1 - u.ox0);
          for (const u of users) { let sh = 0; for (const j of srcs) if (j !== u && g.get(j) && hits(u.origTop, u.ox0, u.ox1, j)) sh += g.get(j); const d = sh - (u.shift || 0); if (d) { u.base0 += d; u.shift = sh; relayout(u, e); } }
          const added = []; body.forEach((b, i) => { if (covered(e, b)) return; let sh = 0; for (const j of srcs) if (g.get(j) && hits(b.top, b.x0, b.x1, j)) sh += g.get(j); if (!sh) return; const f = editFromBlock(e, b, 'fol:' + i); f.followOf = 1; f.fresh = false; f.base0 += sh; f.shift = sh; relayout(f, e); added.push(f); });
          e.objs.push(...added);
          for (const im of e.imgs || []) { if (e.objs.some(o => o.type === 'hideimg' && o.idx === im.k && !o.followImg)) continue; let sh = 0; for (const j of srcs) if (g.get(j) && hits(im.y, im.x, im.x + im.w, j)) sh += g.get(j); if (!sh) continue; const aid = await imgAsset(e, im), io = { id: uid(), type: 'image', asset: aid, x: im.x, y: im.y + sh, w: im.w, h: im.h, followImg: true, hk: im.k }; e.objs.push({ id: uid(), type: 'hideimg', idx: im.k, rect: { x: im.x, y: im.y, w: im.w, h: im.h }, followImg: true }, io); added.push(io); }
          // c. whatever no longer fits at the bottom of the page continues on the next page
          const gy = x => x.type === 'image' ? x.y : x.base0 - x.size * 0.95, gh = x => x.type === 'image' ? x.h : (x.lines.length - 1) * lhOf(x) + x.size * 1.25, items = [...users, ...added, ...placed].filter(x => x.type === 'image' || (x.lines && x.lines.length)).sort((p, q) => gy(p) - gy(q)); let spill = false, lastB = null;
          for (const x of items) {
            if (x.type === 'image') { if (spill || gy(x) + gh(x) > limit + 2) { spill = true; carry.push({ kind: 'image', aid: x.asset, w: x.w, h: x.h, x: x.x, gap: lastB == null ? 0 : gy(x) - lastB }); e.objs = e.objs.filter(q => q !== x); } else lastB = gy(x) + gh(x); continue; }
            const lh = lhOf(x), n = x.lines.length; let k = n;
            if (spill) k = 0; else if (gy(x) + gh(x) > limit + 2) { k = 0; for (let i = 0; i < n; i++) if (x.base0 + i * lh + x.size * 0.3 <= limit + 2) k = i + 1; spill = true; }
            if (k < n) { x.flowK = k; const rest = x.lines.slice(k).join('\n'); if (rest.trim()) { const gap = lastB == null ? 0 : gy(x) - lastB; carry.push({ text: rest, gap: k === 0 ? gap : 0, proto: { fam: x.fam, bold: x.bold, italic: x.italic, underline: x.underline, size: x.size, color: x.color, align: x.align, hs: x.hs || 1, lineH: x.lineH, x0: x.x0, maxW: x.maxW || 0 } }); } }
            lastB = gy(x) + gh(x);
          }
          if (carry.length) { // make sure there is a next page
            let ni = pi + 1; while (ni < S.order.length && (!E(S.order[ni]) || E(S.order[ni]).deleted)) ni++;
            if (ni >= S.order.length) { const id = 'f' + (S.nid++); S.ents.set(id, { id, src: null, auto: true, w: e.w, h: e.h, view: [0, 0, e.w, e.h], baseRot: 0, rot: 0, deleted: false, objs: [], text: null }); S.order.push(id); structural = true; }
            else if (E(S.order[ni]).auto === undefined && E(S.order[ni]).src == null && false) { /* unreachable */ }
            if (carry.length) toast = true;
          }
        }
        if (structural) { buildPages(); }
        if (toast) status.textContent = 'Text flowed onto the next page, like in Word. Undo (↶) restores it.';
      }
      function blocksOf(e) { if (!e.text) return []; return S.gran === 'line' ? e.text.lines.map(Core.lineAsBlock) : e.text.blocks; }
      function covered(e, blk) { return e.objs.some(o => o.type === 'edit' && blk.lines.some(l => o.items.some(it => Math.abs(it.y - l.y) < 1 && it.x >= l.x0 - 1 && it.x <= l.x1 + 1))); }

      /* paints over the old text using the page's own background (row by row), instead of a flat white box */
      const patchRect = o => o.origBottom != null ? { x: o.ox0, y: o.origTop, w: o.ox1 - o.ox0, h: o.origBottom - o.origTop } : { x: o.x, y: o.y, w: o.w, h: o.h };
      function patchCanvas(e, o) {
        const c = e.canvas; if (!c || !o.items) return null; const po = patchRect(o), k = e.csc || 1, x0 = Math.max(4, Math.floor((po.x - 1) * k)), y0 = Math.max(0, Math.floor((po.y - 1) * k)), w = Math.min(c.width - x0 - 4, Math.ceil((po.w + 2) * k)), hh = Math.min(c.height - y0, Math.ceil((po.h + 2) * k)); if (w < 2 || hh < 2) return null;
        let L, R, T, B; try { const g = c.getContext('2d'); L = g.getImageData(x0 - 4, y0, 3, hh).data; R = g.getImageData(Math.min(c.width - 3, x0 + w + 2), y0, 3, hh).data; T = g.getImageData(x0, Math.max(0, y0 - 2), w, 2).data; B = g.getImageData(x0, Math.min(c.height - 2, y0 + hh), w, 2).data; } catch (_) { return null; }
        const out = h('canvas'); out.width = w; out.height = hh; const g2 = out.getContext('2d'); const dist = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
        // the page colour around the block = the most common colour of the ring just outside it; border lines, neighbouring text or other columns never become a gradient
        const bins = new Map(), put = (d, i) => { const r = d[i], g = d[i + 1], b2 = d[i + 2], key = (r >> 3) << 10 | (g >> 3) << 5 | (b2 >> 3), c2 = bins.get(key); if (c2) { c2.n++; c2.r += r; c2.g += g; c2.b += b2; } else bins.set(key, { n: 1, r, g, b: b2 }); };
        for (const d of [L, R, T, B]) for (let i = 0; i < d.length; i += 4) put(d, i); let best = null; bins.forEach(v => { if (!best || v.n > best.n) best = v; }); const bg = best ? [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)] : [255, 255, 255];
        const side = (d, r) => { // modal colour of the 3-pixel band beside this row, ignored when it is ink rather than background
          let m = null, cnt = 0; const cs = [0, 1, 2].map(j => [d[(r * 3 + j) * 4], d[(r * 3 + j) * 4 + 1], d[(r * 3 + j) * 4 + 2]]); for (const c1 of cs) { const n = cs.filter(c2 => dist(c1, c2) < 24).length; if (n > cnt) { cnt = n; m = c1; } } return dist(m, bg) <= 60 ? m : bg; };
        const image = g2.createImageData(w, hh), px = image.data;
        for (let r = 0; r < hh; r++) {
          const a = side(L, r), b = side(R, r), flat = dist(a, b) > 40; // different colours on the two sides: do not blend across them
          for (let x = 0; x < w; x++) {
            const t = w > 1 ? x / (w - 1) : 0.5, q = (r * w + x) * 4;
            px[q] = flat ? bg[0] : Math.round(a[0] * (1 - t) + b[0] * t);
            px[q + 1] = flat ? bg[1] : Math.round(a[1] * (1 - t) + b[1] * t);
            px[q + 2] = flat ? bg[2] : Math.round(a[2] * (1 - t) + b[2] * t); px[q + 3] = 255;
          }
        }
        g2.putImageData(image, 0, 0);
        return out;
      }
      async function coverImage(o, e) {
        // Re-render the source page at print-like resolution for the cover patch. The on-screen
        // preview may be low-DPI; reusing it made edited lines look visibly pixelated in exports.
        let source = e, tempCanvas = null;
        try {
          if (e.src != null && S.pdf) {
            const page = await S.pdf.getPage(e.src + 1), scale = Math.min(4, 5000 / Math.max(e.w, e.h));
            const vp = page.getViewport({ scale, rotation: e.rot }), c = h('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
            await page.render({ canvas: c, viewport: vp }).promise; tempCanvas = c; source = Object.assign({}, e, { canvas: c, csc: c.width / e.w });
          }
        } catch (_) { source = e; }
        const pc = patchCanvas(source, o); if (!pc) return null; const blob = await new Promise(r => pc.toBlob(r, 'image/png')); const k = source.csc || 1;
        const result = { png: new Uint8Array(await blob.arrayBuffer()), x: Math.max(4, Math.floor((o.x - 1) * k)) / k, y: Math.max(0, Math.floor((o.y - 1) * k)) / k, w: pc.width / k, h: pc.height / k };
        if (tempCanvas) { tempCanvas.width = 1; tempCanvas.height = 1; }
        return result;
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
            if (o.type === 'text') el.style.minWidth = '12px';
            const lines = o.flowK != null ? (o.lines || []).slice(0, o.flowK) : (o.lines || []), boxW = o.maxW || Math.max(...lines.map(s => (S.metrics.width(s, o.fam, o.bold, o.italic, o.size) || 0) * (o.hs || 1)), 0);
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
        if ((S.tool === 'edit' || S.tool === 'select') && e.imgs) e.imgs.forEach(im => { if (e.objs.some(o => o.type === 'hideimg' && o.idx === im.k)) return; pe.layer.append(h('div', { class: 'tb-box imgbox', 'data-ii': im.k, title: 'Picture: tap to move, resize, replace or delete', style: { left: im.x * z + 'px', top: im.y * z + 'px', width: im.w * z + 'px', height: im.h * z + 'px' } })); });
        e.objs.forEach(o => { if (o.type !== 'hideimg') return; const r = o.rect || (e.imgs || []).find(v => v.k === o.idx); if (!r) return; const pc = patchCanvas(e, { items: [1], ox0: r.x, ox1: r.x + r.w, origTop: r.y, origBottom: r.y + r.h, x: r.x, y: r.y, w: r.w, h: r.h, origBottom0: 1 }); if (pc) { pc.style.cssText = 'position:absolute;pointer-events:none;left:' + (r.x - 1) * z + 'px;top:' + (r.y - 1) * z + 'px;width:' + (r.w + 2) * z + 'px;height:' + (r.h + 2) * z + 'px'; pe.layer.append(pc); } });
        // every cover patch (old text) sits underneath ALL objects, so a patch never hides text that was moved or pushed into its place
        e.objs.forEach(o => { if (o.type !== 'edit') return; const po = patchRect(o), pc = patchCanvas(e, o), st = 'position:absolute;pointer-events:none;left:' + (po.x - 1) * z + 'px;top:' + (po.y - 1) * z + 'px;width:' + (po.w + 2) * z + 'px;height:' + (po.h + 2) * z + 'px'; if (pc) { pc.style.cssText = st; pe.layer.append(pc); } else if (o.bg) pe.layer.append(h('div', { style: { cssText: st, background: o.bg } })); });
        e.objs.forEach(o => { if (o.type !== 'hideimg') pe.layer.append(objEl(o, e)); });
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
        if (k === 'color' && TEXTY(o)) o.colorUser = true;
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
          if (!o && S.tool === 'edit') kids.push(h('span', { class: 'sep', style: { width: '1px', alignSelf: 'stretch', background: 'var(--line)' } }), lbl('Edit by'), h('select', { onchange: ev => { S.gran = ev.target.value; refreshAll(); } }, [['block', 'Paragraph'], ['line', 'Single line']].map(([v, n]) => h('option', { value: v, selected: S.gran === v }, n))), ui.check('Show all text', S.showAll, ev => { S.showAll = ev.target.checked; setTool(S.tool); }), ui.check('Push text below', S.reflow, ev => { S.reflow = ev.target.checked; }));
        } else if (['rect', 'ellipse', 'line', 'arrow', 'draw', 'underline', 'strike'].includes(t)) {
          kids.push(lbl('Colour'), colorIn(o ? (o.stroke || o.color) : st.stroke, v => setStyle('stroke', v), 'Colour'), lbl('Width'), numIn(o ? (o.sw ?? 2) : st.sw, v => setStyle('sw', v), 0.5, 30, 0.5));
          if (t === 'rect' || t === 'ellipse') kids.push(lbl('Fill'), h('select', { onchange: ev => setStyle('fill', ev.target.value) }, [['', 'None'], ['#ffffff', 'White'], ['#fff3a3', 'Yellow'], ['#c8f7c5', 'Green'], ['#ffd1dc', 'Pink'], ['#cfe3ff', 'Blue'], ['#000000', 'Black']].map(([v, n]) => h('option', { value: v, selected: (o ? o.fill || '' : st.fill) === v }, n))));
        } else if (t === 'highlight') kids.push(lbl('Colour'), ...['#ffeb3b', '#8bf28b', '#ff9ecb', '#7fd1ff', '#ffb347'].map(c => h('button', { class: 'tbtn', type: 'button', style: { minWidth: '34px', height: '34px', background: c, borderColor: (o ? o.color : st.hl) === c ? 'var(--accent)' : 'var(--line)' }, onclick: () => setStyle('hl', c), 'aria-label': 'Highlight colour' })));
        else if (t === 'whiteout') kids.push(lbl('Colour'), colorIn(o ? o.color : st.wo, v => setStyle('wo', v), 'Cover colour'), h('span', { class: 'muted' }, 'Tip: tap 🎨 not needed — pick the page colour if it is not white.'));
        else if (t === 'redact') kids.push(h('span', { class: 'muted' }, 'Redaction removes the text underneath for real (not just hidden). Check the result.'));
        else if (t === 'link') kids.push(h('span', { class: 'muted' }, 'After you drag, you will be asked for a web address or a page number.'));
        else kids.push(h('span', { class: 'muted' }, 'Choose a tool above. Tap 👆 Select to move or resize things.'));
        if (o && o.type === 'image') kids.push(ui.btn('🔄 Replace image', () => replaceImage(o), 'sm'));
        if (o) kids.push(h('span', { class: 'sep', style: { width: '1px', alignSelf: 'stretch', background: 'var(--line)' } }), ui.btn('Duplicate', () => dupObj(o), 'sm'), ui.btn('🗑 Delete', () => delObj(o.id), 'sm'));
        opts.replaceChildren(...kids);
      }
      function dupObj(o) { const f = find(o.id); if (!f) return; pushUndo(); const c = JSON.parse(JSON.stringify(o)); c.id = uid(); const d = 14; if (c.x != null) c.x += d; if (c.y != null) c.y += d; if (c.x0 != null) c.x0 += d; if (c.base0 != null) c.base0 += d; if (c.x1 != null) { c.x1 += d; c.x2 += d; c.y1 += d; c.y2 += d; } if (c.pts) c.pts = c.pts.map(p => [p[0] + d, p[1] + d]); if (c.type === 'edit') { c.type = 'text'; delete c.items; delete c.key; c.bg = null; } f.e.objs.push(c); S.sel = { oid: c.id }; refreshLayer(f.e.id); renderOpts(); useFont(c, f.e); }
      function own(o, e) { if (!o || !o.followImg) return; delete o.followImg; e.objs.forEach(q => { if (q.type === 'hideimg' && q.idx === o.hk) delete q.followImg; }); } // a picture the user touches is theirs, the automatic flow leaves it alone
      function delObj(oid) { const f = find(oid); if (!f) return; pushUndo(); own(f.o, f.e); f.e.objs = f.e.objs.filter(x => x.id !== oid); S.sel = null; refreshLayer(f.e.id); renderOpts(); reflowAll(); }

      /* ───────── pointer handling ───────── */
      function pt(ev, layer) { const r = layer.getBoundingClientRect(); return [(ev.clientX - r.left) / S.z, (ev.clientY - r.top) / S.z]; }
      function pageDown(ev, e, layer) {
        if (ev.button > 0 || (editing && ev.target.closest('.ped-editor'))) return;
        const tEl = ev.target.closest('.obj'), isBox = ev.target.closest('.tb-box');
        if (editing) closeEditor();
        if (tEl && ev.target.dataset.del) { delObj(tEl.dataset.oid); ev.preventDefault(); return; }
        if (tEl && (S.tool === 'select' || S.tool === 'edit' || S.tool === 'text' || ev.target.dataset.rh || (S.sel && S.sel.oid === tEl.dataset.oid))) { objDown(ev, e, layer, tEl); return; }
        if (isBox && isBox.classList.contains('imgbox') && (S.tool === 'edit' || S.tool === 'select')) { ev.preventDefault(); liftImage(e, +isBox.dataset.ii); return; }
        if (S.tool === 'edit' && isBox) { const blk = blocksOf(e)[+isBox.dataset.bi]; if (blk) { ev.preventDefault(); const key = S.gran + ':' + isBox.dataset.bi; pushUndo(); const o = editFromBlock(e, blk, key); e.objs.push(o); S.sel = { oid: o.id }; refreshLayer(e.id); renderOpts(); openEditor(e, o); } return; }
        if (S.tool === 'text') { ev.preventDefault(); const [x, y] = pt(ev, layer); pushUndo(); const o = newText(e, x, y - S.sty.size * 0.6); e.objs.push(o); S.sel = { oid: o.id }; refreshLayer(e.id); renderOpts(); openEditor(e, o); return; }
        if (S.tool === 'select' || S.tool === 'edit') { if (S.sel) { S.sel = null; refreshAll(); renderOpts(); } return; }
        if (DRAG.has(S.tool)) { ev.preventDefault(); startDraw(ev, e, layer); return; }
        if (S.tool === 'image' || S.tool === 'sign') { if (S.pending) { ev.preventDefault(); const [x, y] = pt(ev, layer), p = S.pending; S.pending = null; pushUndo(); const w = p.w, hh = p.h; const o = { id: uid(), type: p.type, asset: p.asset, x: Math.max(0, x - w / 2), y: Math.max(0, y - hh / 2), w, h: hh }; e.objs.push(o); S.sel = { oid: o.id }; S.tool = 'select'; syncBtns(); refreshLayer(e.id); renderOpts(); status.textContent = 'Placed. Drag to move, pull the corner to resize.'; } }
      }
      /* snapping: while you drag, the object clicks onto the left / centre / right (and top / middle / bottom) of other objects, text blocks and the page, with a guide line and a small vibration on phones */
      function snapFor(o, e) {
        const b = bbox(o), thr = 5 / S.z, T = [{ x: 0, y: 0, w: e.w, h: e.h }, { x: e.w * 0.07, y: e.h * 0.07, w: e.w * 0.86, h: e.h * 0.86 }];
        e.objs.forEach(q => { if (q !== o && q.type !== 'hideimg' && q.type !== 'whiteout') { try { const t = bbox(q); if (isFinite(t.x + t.y + t.w + t.h)) T.push(t); } catch (_) { } } });
        if (e.text) blocksOf(e).forEach(bk => { if (!covered(e, bk)) T.push({ x: bk.x0, y: bk.top, w: bk.x1 - bk.x0, h: bk.bottom - bk.top }); });
        (e.imgs || []).forEach(im => T.push(im));
        const pick = (vals, tv) => { let best = null; for (const v of vals) for (const t of tv) { const d = t - v; if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: t }; } return best; };
        const bx = [b.x, b.x + b.w / 2, b.x + b.w], by = [b.y, b.y + b.h / 2, b.y + b.h], tx = [], ty = []; T.forEach(t => { tx.push(t.x, t.x + t.w / 2, t.x + t.w); ty.push(t.y, t.y + t.h / 2, t.y + t.h); });
        const sx = pick(bx, tx), sy = pick(by, ty); return { dx: sx ? sx.d : 0, dy: sy ? sy.d : 0, gx: sx ? [sx.at] : [], gy: sy ? [sy.at] : [] };
      }
      function objDown(ev, e, layer, el) {
        ev.preventDefault(); ev.stopPropagation(); const f = find(el.dataset.oid); if (!f) return; const o = f.o; own(o, e); const wasSel = S.sel && S.sel.oid === o.id; S.sel = { oid: o.id }; renderOpts();
        layer.querySelectorAll('.obj.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel');
        const resize = !!ev.target.dataset.rh, [sx, sy] = pt(ev, layer), orig = JSON.parse(JSON.stringify(o)); let moved = false, undone = false, lastSnap = '';
        const mv = m => {
          const [px, py] = pt(m, layer), dx = px - sx, dy = py - sy; if (!moved && Math.hypot(dx, dy) * S.z < 4) return; moved = true; if (!undone) { undone = true; const keep = JSON.stringify(o); Object.assign(o, orig); pushUndo(); o.fresh = false; Object.assign(o, JSON.parse(keep)); }
          if (resize) { if (TEXTY(o)) { o.maxW = Math.max(30, orig.w + dx); o.w = o.maxW; } else { o.w = Math.max(6, orig.w + dx); o.h = o.type === 'image' || o.type === 'sign' ? Math.max(6, o.w * orig.h / orig.w) : Math.max(6, orig.h + dy); } }
          else if (o.x1 != null) { o.x1 = orig.x1 + dx; o.x2 = orig.x2 + dx; o.y1 = orig.y1 + dy; o.y2 = orig.y2 + dy; }
          else if (o.pts) o.pts = orig.pts.map(p => [p[0] + dx, p[1] + dy]);
          else { o.x = orig.x + dx; o.y = orig.y + dy; if (o.x0 != null) { o.x0 = orig.x0 + dx; o.base0 = orig.base0 + dy; } }
          layer.querySelectorAll('.snapg').forEach(n => n.remove());
          if (!resize && !ev.altKey) { relayout(o, e); const sn = snapFor(o, e); if (sn.dx || sn.dy) { const ddx = dx + sn.dx, ddy = dy + sn.dy; if (o.x1 != null) { o.x1 = orig.x1 + ddx; o.x2 = orig.x2 + ddx; o.y1 = orig.y1 + ddy; o.y2 = orig.y2 + ddy; } else if (o.pts) o.pts = orig.pts.map(p => [p[0] + ddx, p[1] + ddy]); else { o.x = orig.x + ddx; o.y = orig.y + ddy; if (o.x0 != null) { o.x0 = orig.x0 + ddx; o.base0 = orig.base0 + ddy; } } }
            const key = sn.gx.join() + '|' + sn.gy.join(); if (key !== lastSnap) { lastSnap = key; if ((sn.gx.length || sn.gy.length) && navigator.vibrate) { try { navigator.vibrate(12); } catch (_) { } } }
            sn.gx.forEach(x => layer.append(h('div', { class: 'snapg', style: { left: x * S.z + 'px', top: 0, width: '1px', height: '100%' } }))); sn.gy.forEach(y => layer.append(h('div', { class: 'snapg', style: { top: y * S.z + 'px', left: 0, height: '1px', width: '100%' } }))); }
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
        closeEditor(); const pe = pageEls.get(e.id); if (!pe) return; const z = S.z, fit1 = o.type === 'edit' && (o.origLines || 1) === 1 && !o.maxW0, boxW = o.maxW || o.w, ww = o.maxW || Math.max(120, o.w, e.w - o.x0 - 6);
        const sty = Core.resolveStyle(o.fam, o.bold, o.italic), ta = h('textarea', { class: 'ped-editor', spellcheck: 'true', wrap: fit1 ? 'off' : 'soft', rows: 1, style: { top: (o.base0 - o.size * CSS_BASE) * z + 'px', fontFamily: Core.CSSFONT[o.fam], fontSize: o.size * z + 'px', lineHeight: o.lineH * z + 'px', fontWeight: sty.includes('b') ? 700 : 400, fontStyle: sty.includes('i') ? 'italic' : 'normal', '--ped-ink': o.color || '#111111', textAlign: o.align, resize: 'none', overflow: 'hidden', whiteSpace: fit1 ? 'pre' : 'pre-wrap' } });
        ta.value = o.text;
        // the box hugs the text and stays anchored the way the text is aligned (left / centre / right), like typing straight on the page
        const ax = o.align === 'center' ? o.x0 + boxW / 2 : o.align === 'right' ? o.x0 + boxW : o.x0;
        const fit = () => { ta.style.height = 'auto'; if (fit1 || o.type === 'text') { ta.style.width = '1px'; const w = Math.max(ta.scrollWidth + 6, 24), wp = w / z, left = o.align === 'center' ? ax - wp / 2 : o.align === 'right' ? ax - wp : o.x0; ta.style.width = w + 'px'; ta.style.left = left * z + 'px'; } else { ta.style.width = ww * z + 'px'; ta.style.left = o.x0 * z + 'px'; } ta.style.height = ta.scrollHeight + 'px'; };
        ta.addEventListener('input', fit);
        ta.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); closeEditor(true); } else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); closeEditor(); } });
        ta.addEventListener('blur', () => setTimeout(() => { if (editing && editing.ta === ta) closeEditor(); }, 120));
        pe.layer.append(ta); editing = { e, o, ta }; const old = pe.layer.querySelector('[data-oid="' + o.id + '"]'); if (old) old.querySelectorAll('.ln').forEach(n => n.style.opacity = 0);
        fit(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); status.textContent = 'Typing in place… tap outside to finish (Ctrl+Enter also finishes).';
      }
      function closeEditor(cancel) {
        if (!editing) return; const { e, o, ta } = editing; editing = null; const txt = ta.value; ta.remove();
        if (cancel) { if (o.fresh) { e.objs = e.objs.filter(x => x !== o); S.undo.pop(); syncBtns(); S.sel = null; } refreshLayer(e.id); renderOpts(); return; }
        if (txt !== o.text) { if (!o.fresh) pushUndo(); o.text = txt; o.fresh = false; }
        if (o.type === 'text' && !txt.trim()) { e.objs = e.objs.filter(x => x !== o); S.sel = null; if (o.fresh) { S.undo.pop(); syncBtns(); } }
        else if (o.fresh && txt === o.text && o.type === 'edit') { e.objs = e.objs.filter(x => x !== o); S.undo.pop(); syncBtns(); S.sel = null; }
        else if (o.type === 'text' && o.fresh) o.fresh = false;
        relayout(o, e); refreshLayer(e.id); renderOpts(); status.textContent = 'Edited. Keep going, or tap ⬇ Download when you are done.'; reflowAll();
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
        if (!S.pdf) { ui.toast('Open a PDF first'); return; } closeEditor(); dl.disabled = true; fab.disabled = true; const old = dl.textContent; dl.textContent = 'Saving…'; status.textContent = 'Building your PDF…';
        try {
          await Promise.all(live().flatMap(e => e.objs.filter(TEXTY).map(o => ensureFont(o.fam, o.bold, o.italic))));
          const entries = live().map(e => ({ src: e.src, w: e.w, h: e.h, view: e.view, rot: e.rot, baseRot: e.baseRot, deleted: false, objs: e.objs.map(o => { const c = Object.assign({}, o); if (TEXTY(c)) { c.lines = o.lines; } return c; }) }));
          const out = await Core.exportDoc(S.PL, S.bytes, entries, S.assets, { metrics: S.metrics, textImage, coverImage, ensureFont: (f, b, i) => ensureFont(f, b, i), fontBytes: async (f, b, i) => fontBytes.get(f + '|' + Core.resolveStyle(f, b, i)), removeText: Core.removeTextFactory(S.metrics) });
          const blob = new Blob([out], { type: 'application/pdf' }); ui.download(blob, S.name + '-edited.pdf'); S.dirty = false; const r = out.report || {};
          const parts = []; if (r.removed) parts.push(r.removed + ' text edit' + (r.removed > 1 ? 's' : '') + ' removed the old text from the file'); if (r.covered) parts.push(r.covered + ' edit' + (r.covered > 1 ? 's' : '') + ' covered the old text with a patch (it may still be selectable)'); if (r.imageText) parts.push(r.imageText + ' block' + (r.imageText > 1 ? 's' : '') + ' in Malayalam, Hindi, Arabic or similar script drawn exactly as typed, with a selectable text layer on top');
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
