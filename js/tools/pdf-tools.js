/* PDF tools (everything runs locally with pdf-lib + PDF.js) */
(function () {
  'use strict';
  const { h, ui } = TN, v = ui.val;
  const P = TN.pdf = {};

  /* ── shared helpers ── */
  P.parseRanges = function (s, n) { // "1-3, 5, 8-" -> sorted unique 0-based indices
    const out = []; s = String(s || '').trim(); if (!s) return null;
    for (const part of s.split(/[,;\s]+/).filter(Boolean)) {
      const m = part.match(/^(\d*)-(\d*)$/) || part.match(/^(\d+)$/); if (!m) return null;
      let a, b; if (m.length === 2) { a = b = +m[1]; } else { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; }
      if (!(a >= 1 && b >= a && b <= n)) return null; for (let i = a; i <= b; i++) out.push(i - 1);
    }
    return out;
  };
  P.readPdf = async function (file, { needPdfLib = true } = {}) {
    const bytes = new Uint8Array(await file.arrayBuffer()); let pdf = null;
    try { pdf = await TN.libs.openPdf(bytes); } catch (e) { if (e && e.name === 'PasswordException') throw new Error('“' + file.name + '” is password-protected. Remove the password first (open it in your PDF viewer and save/print a copy without a password).'); throw new Error('Could not open “' + file.name + '”. It may be damaged or not a PDF.'); }
    return { name: file.name, bytes, pdf, pages: pdf.numPages, size: file.size };
  };
  P.loadLib = async function (bytes) { const { PDFDocument } = await TN.libs.pdfLib(); try { return await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false }); } catch (e) { if (/encrypt/i.test(e.message)) throw new Error('This PDF is encrypted, so it cannot be changed here.'); throw e; } };
  P.renderPage = async function (pdf, n, scale, canvas) { const page = await pdf.getPage(n), vp = page.getViewport({ scale }); canvas = canvas || document.createElement('canvas'); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height); await page.render({ canvas, viewport: vp }).promise; page.cleanup(); return canvas; };
  P.thumb = async function (pdf, n, w = 160) { const page = await pdf.getPage(n), base = page.getViewport({ scale: 1 }); const c = document.createElement('canvas'); const s = w / base.width, vp = page.getViewport({ scale: s * (window.devicePixelRatio > 1 ? 1.5 : 1) }); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); c.style.aspectRatio = base.width + '/' + base.height; await page.render({ canvas: c, viewport: vp }).promise; page.cleanup(); return c; };
  P.save = async (doc, opts) => new Blob([await doc.save(Object.assign({ useObjectStreams: true }, opts))], { type: 'application/pdf' });
  P.pickOne = function (onPdf, label) { return ui.drop({ accept: 'application/pdf,.pdf', label: label || 'Choose a PDF', sub: 'or drag and drop — the file stays on your device', onFiles: async ([f]) => { try { onPdf(await P.readPdf(f)); } catch (e) { ui.toast(e.message); } } }); };
  async function thumbsInto(box, pdf, count, onEach, w = 130) { for (let i = 1; i <= count; i++) { try { const c = await P.thumb(pdf, i, w); onEach(i, c); } catch (e) { onEach(i, h('div', {}, '?')); } if (i % 6 === 0) await ui.sleep(0); } }
  const stripExt = ui.baseName;
  const fileInfo = f => h('div', { class: 'note ok' }, '📄 ', h('b', {}, f.name), ' · ' + f.pages + ' page' + (f.pages === 1 ? '' : 's') + ' · ' + ui.fmtBytes(f.size));

  /* ── Merge ── */
  TN.register({ id: 'pdf-merge', cat: 'pdf', icon: '🧩', name: 'Merge PDF', desc: 'Combine PDFs and images into one file. Drag order with arrows.', tags: 'combine join append pdf images together', render(root) {
    let items = []; const list = h('div'), out = h('div'), prog = ui.progress(); const go = ui.btn('Merge into one PDF', null);
    const draw = () => { list.replaceChildren(items.length ? ui.fileList(items.map(i => ({ name: i.name + (i.pages ? ' (' + i.pages + ' p)' : ''), size: i.size })), { onRemove: i => { items.splice(i, 1); draw(); }, onMove: (i, d) => { [items[i], items[i + d]] = [items[i + d], items[i]]; draw(); } }) : null); go.disabled = items.length < 1; };
    const add = async files => { for (const f of files) { if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) { try { const r = await P.readPdf(f); items.push({ name: f.name, size: f.size, kind: 'pdf', bytes: r.bytes, pages: r.pages }); try { r.pdf.destroy && r.pdf.destroy(); } catch (_) { } } catch (e) { ui.toast(e.message); } } else if (f.type.startsWith('image/')) items.push({ name: f.name, size: f.size, kind: 'img', file: f }); } draw(); };
    go.onclick = async () => { await ui.busy(go, async () => { const { PDFDocument } = await TN.libs.pdfLib(), out2 = await PDFDocument.create(); let i = 0; for (const it of items) { prog.set(i++ / items.length);
        if (it.kind === 'pdf') { const src = await P.loadLib(it.bytes), pages = await out2.copyPages(src, src.getPageIndices()); pages.forEach(p => out2.addPage(p)); }
        else { const bm = await createImageBitmap(it.file), c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bm, 0, 0); const jpg = await TN.file.canvasBlob(c, 'image/jpeg', 0.92), im = await out2.embedJpg(new Uint8Array(await jpg.arrayBuffer())), pg = out2.addPage([im.width, im.height]); pg.drawImage(im, { x: 0, y: 0, width: im.width, height: im.height }); } }
      prog.set(1); const blob = await P.save(out2); setTimeout(() => prog.set(null), 500); out.replaceChildren(ui.note('✅ Merged ' + items.length + ' file(s) → ' + out2.getPageCount() + ' pages · ' + ui.fmtBytes(blob.size), 'ok'), ui.btns(ui.btn('⬇ Download merged.pdf', () => ui.download(blob, 'merged.pdf'))));
    }); };
    root.append(ui.panel('', ui.drop({ accept: 'application/pdf,image/*', multiple: true, label: 'Add PDFs or images', onFiles: add }), list), ui.panel('', ui.btns(go), prog.el, out)); draw();
  } });

  /* ── Split / extract ── */
  TN.register({ id: 'pdf-split', cat: 'pdf', icon: '✂️', name: 'Split & Extract Pages', desc: 'Pull out pages or ranges, split every N pages, or one file per page.', tags: 'extract separate pages divide cut', render(root) {
    const body = h('div');
    root.append(P.pickOne(f => start(f)), body);
    function start(f) {
      const mode = ui.select([['range', 'Extract pages / ranges into one PDF'], ['every', 'Split every N pages'], ['each', 'Every page as its own PDF (ZIP)'], ['ranges', 'Separate PDF for each range (ZIP)']], 'range'), rng = ui.text({ value: '1-' + Math.min(2, f.pages), placeholder: 'e.g. 1-3, 5, 8-', mono: true }), n = ui.num({ value: 1, min: 1 }), res = h('div'), thumbs = h('div', { class: 'thumbs' }), sel = new Set();
      thumbsInto(thumbs, f.pdf, Math.min(f.pages, 120), (i, c) => { const t = h('div', { class: 'thumb', onclick: () => { sel.has(i) ? sel.delete(i) : sel.add(i); t.classList.toggle('sel'); rng.value = [...sel].sort((a, b) => a - b).join(','); mode.value = 'range'; } }, c, 'Page ' + i); thumbs.append(t); });
      const go = ui.btn('Split', async () => ui.busy(go, async () => { const src = await P.loadLib(f.bytes), { PDFDocument } = await TN.libs.pdfLib(); const mk = async idx => { const d = await PDFDocument.create(), ps = await d.copyPages(src, idx); ps.forEach(p => d.addPage(p)); return P.save(d); }, base = stripExt(f.name); const files = [];
        if (mode.value === 'range') { const idx = P.parseRanges(rng.value, f.pages); if (!idx) throw new Error('Check the page numbers (1 to ' + f.pages + ')'); files.push([base + '-pages.pdf', await mk(idx)]); }
        else if (mode.value === 'every') { const k = Math.max(1, Math.round(v(n)) || 1); for (let s = 0; s < f.pages; s += k) files.push([base + '-' + (s + 1) + '-' + Math.min(f.pages, s + k) + '.pdf', await mk(Array.from({ length: Math.min(k, f.pages - s) }, (_, j) => s + j))]); }
        else if (mode.value === 'each') { for (let i = 0; i < f.pages; i++) files.push([base + '-page-' + String(i + 1).padStart(String(f.pages).length, '0') + '.pdf', await mk([i])]); }
        else { for (const part of rng.value.split(/[;,]\s*/).filter(Boolean)) { const idx = P.parseRanges(part, f.pages); if (!idx) throw new Error('Check range “' + part + '”'); files.push([base + '-' + part.replace(/\s/g, '') + '.pdf', await mk(idx)]); } }
        if (!files.length) throw new Error('Nothing to save'); if (files.length === 1) { res.replaceChildren(ui.note('✅ Done · ' + ui.fmtBytes(files[0][1].size), 'ok'), ui.btns(ui.btn('⬇ Download', () => ui.download(files[0][1], files[0][0])))); }
        else { const Z = await TN.libs.jszip(), z = new Z(); files.forEach(([n2, b]) => z.file(n2, b)); const zb = await z.generateAsync({ type: 'blob' }); res.replaceChildren(ui.note('✅ Created ' + files.length + ' PDFs', 'ok'), ui.btns(ui.btn('⬇ Download ZIP', () => ui.download(zb, base + '-split.zip')))); } }));
      body.replaceChildren(fileInfo(f), ui.panel('Options', ui.field('What do you want?', mode), ui.field('Pages / ranges', rng, 'Tap thumbnails below to pick pages, or type: 1-3, 5, 8-'), ui.field('N (for “every N pages”)', n), ui.btns(go), res), ui.panel('Pages (tap to select)', thumbs));
    }
  } });

  /* ── Organize ── */
  TN.register({ id: 'pdf-organize', cat: 'pdf', icon: '🗂️', name: 'Organize, Rotate & Delete Pages', desc: 'Reorder, rotate, delete, duplicate pages and add blank pages.', tags: 'rearrange reorder rotate delete remove pages sort blank', render(root) {
    const body = h('div');
    root.append(P.pickOne(f => start(f)), body);
    function start(f) {
      let ents = Array.from({ length: f.pages }, (_, i) => ({ src: i, rot: 0, del: false, thumb: null })); const grid = h('div', { class: 'thumbs' }), res = h('div');
      const draw = () => { grid.replaceChildren(...ents.map((e, i) => { const tb = (t, fn, title) => h('button', { title, 'aria-label': title, onclick: fn }, t); const c = e.thumb || h('div', { style: { height: '90px' } }, e.blank ? '(blank)' : '…'); const wrap = h('div', { style: { transform: 'rotate(' + e.rot + 'deg)', transition: 'transform .15s', margin: Math.abs(e.rot % 180) ? '14px 0' : '0' } }, c);
        return h('div', { class: 'thumb' + (e.del ? ' del' : '') }, wrap, h('div', {}, (i + 1) + (e.blank ? ' blank' : '')), h('div', { class: 'tb' }, tb('◀', () => { if (i) { [ents[i], ents[i - 1]] = [ents[i - 1], ents[i]]; draw(); } }, 'Move earlier'), tb('↺', () => { e.rot = (e.rot + 270) % 360; draw(); }, 'Rotate left'), tb('↻', () => { e.rot = (e.rot + 90) % 360; draw(); }, 'Rotate right'), tb('▶', () => { if (i < ents.length - 1) { [ents[i], ents[i + 1]] = [ents[i + 1], ents[i]]; draw(); } }, 'Move later')), h('div', { class: 'tb' }, tb(e.del ? '↩' : '🗑', () => { e.del = !e.del; draw(); }, e.del ? 'Restore' : 'Delete'), tb('⧉', () => { ents.splice(i + 1, 0, { ...e, del: false }); draw(); }, 'Duplicate'), tb('＋', () => { ents.splice(i + 1, 0, { blank: true, rot: 0, del: false }); draw(); }, 'Insert blank page after'))); })); };
      draw(); thumbsInto(grid, f.pdf, Math.min(f.pages, 200), (i, c) => { ents.filter(e => e.src === i - 1).forEach(e => e.thumb = c.cloneNode ? (() => { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; d.style.aspectRatio = c.style.aspectRatio; d.getContext('2d').drawImage(c, 0, 0); return d; })() : c); if (i % 4 === 0 || i === f.pages) draw(); });
      const go = ui.btn('Save new PDF', async () => ui.busy(go, async () => { const src = await P.loadLib(f.bytes), { PDFDocument, degrees } = await TN.libs.pdfLib(), d = await PDFDocument.create(); const keep = ents.filter(e => !e.del); if (!keep.length) throw new Error('All pages are deleted'); for (const e of keep) { if (e.blank) { const ref = d.getPageCount() ? d.getPage(d.getPageCount() - 1) : null; d.addPage(ref ? ref.getSize() ? [ref.getWidth(), ref.getHeight()] : [595, 842] : [595, 842]); continue; } const [p] = await d.copyPages(src, [e.src]); if (e.rot) p.setRotation(degrees((p.getRotation().angle + e.rot) % 360)); d.addPage(p); } const b = await P.save(d); res.replaceChildren(ui.note('✅ Saved ' + keep.length + ' pages · ' + ui.fmtBytes(b.size), 'ok'), ui.btns(ui.btn('⬇ Download', () => ui.download(b, stripExt(f.name) + '-organized.pdf')))); }));
      body.replaceChildren(fileInfo(f), ui.panel('', ui.btns(go, ui.btn('Rotate all ↻', () => { ents.forEach(e => e.rot = (e.rot + 90) % 360); draw(); }, 'secondary'), ui.btn('Reverse order', () => { ents.reverse(); draw(); }, 'secondary')), res), ui.panel('Pages', grid, f.pages > 200 ? ui.note('Showing previews for the first 200 pages; all pages are still included.') : null));
    }
  } });

  /* ── Compress ── */
  TN.register({ id: 'pdf-compress', cat: 'pdf', icon: '🗜️', name: 'Compress PDF', desc: 'Reduce PDF size: light (keeps text) or strong (re-renders pages as images).', tags: 'reduce size smaller shrink email upload scan', render(root) {
    const body = h('div'); root.append(P.pickOne(f => start(f)), body);
    function start(f) {
      const level = ui.select([['light', 'Light — keeps text and quality (small savings)'], ['medium', 'Strong — pages become images, ~150 DPI'], ['high', 'Maximum — pages become images, ~100 DPI']], 'medium'), res = h('div'), prog = ui.progress();
      const go = ui.btn('Compress', async () => ui.busy(go, async () => { const { PDFDocument } = await TN.libs.pdfLib(); let blob;
        if (level.value === 'light') { const d = await P.loadLib(f.bytes); ['Title', 'Author', 'Subject', 'Keywords', 'Producer', 'Creator'].forEach(k => { try { d['set' + k](k === 'Keywords' ? [] : '') } catch (e) {} }); blob = await P.save(d); }
        else { const dpi = level.value === 'medium' ? 150 : 100, q = level.value === 'medium' ? 0.6 : 0.45, out = await PDFDocument.create(); for (let i = 1; i <= f.pages; i++) { prog.set((i - 1) / f.pages); const page = await f.pdf.getPage(i), base = page.getViewport({ scale: 1 }), c = await P.renderPage(f.pdf, i, dpi / 72); const jb = await TN.file.canvasBlob(c, 'image/jpeg', q), im = await out.embedJpg(new Uint8Array(await jb.arrayBuffer())), pg = out.addPage([base.width, base.height]); pg.drawImage(im, { x: 0, y: 0, width: base.width, height: base.height }); c.width = c.height = 0; await ui.sleep(0); } blob = await P.save(out); }
        prog.set(1); setTimeout(() => prog.set(null), 500); const saved = 1 - blob.size / f.size;
        res.replaceChildren(ui.stats([['Before', ui.fmtBytes(f.size)], ['After', ui.fmtBytes(blob.size), 1], ['Change', saved > 0 ? Math.round(saved * 100) + '% smaller' : 'Not smaller']]), saved <= 0.02 ? ui.note('This file is already well optimised. Try a stronger level, or keep the original.') : level.value !== 'light' ? ui.note('Strong levels turn each page into a picture: text can no longer be selected or searched. Keep the original if you need that.') : null, ui.btns(ui.btn('⬇ Download', () => ui.download(blob, stripExt(f.name) + '-compressed.pdf'), saved > 0 ? '' : 'secondary'))); }));
      body.replaceChildren(fileInfo(f), ui.panel('', ui.field('Compression level', level), ui.btns(go), prog.el, res));
    }
  } });

  /* ── PDF → images ── */
  TN.register({ id: 'pdf-to-images', cat: 'pdf', icon: '🖼️', name: 'PDF to Images', desc: 'Turn PDF pages into PNG or JPG pictures (ZIP for many pages).', tags: 'convert jpg png export pages picture screenshot', render(root) {
    const body = h('div'); root.append(P.pickOne(f => start(f)), body);
    function start(f) {
      const fmt = ui.select([['image/png', 'PNG (sharp)'], ['image/jpeg', 'JPG (smaller)']], 'image/png'), dpi = ui.select([[72, '72 DPI (screen)'], [150, '150 DPI (good)'], [200, '200 DPI'], [300, '300 DPI (print)']], 150), rng = ui.text({ value: '', placeholder: 'All pages (or e.g. 1-3, 5)', mono: true }), res = h('div'), prog = ui.progress();
      const go = ui.btn('Convert', async () => ui.busy(go, async () => { const idx = rng.value.trim() ? P.parseRanges(rng.value, f.pages) : Array.from({ length: f.pages }, (_, i) => i); if (!idx) throw new Error('Check the page numbers'); const ext = fmt.value === 'image/png' ? 'png' : 'jpg', blobs = []; for (let k = 0; k < idx.length; k++) { prog.set(k / idx.length); const c = await P.renderPage(f.pdf, idx[k] + 1, +dpi.value / 72); if (fmt.value === 'image/jpeg') { const c2 = document.createElement('canvas'); c2.width = c.width; c2.height = c.height; const x = c2.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(c, 0, 0); blobs.push([stripExt(f.name) + '-p' + (idx[k] + 1) + '.' + ext, await TN.file.canvasBlob(c2, fmt.value, 0.92)]); } else blobs.push([stripExt(f.name) + '-p' + (idx[k] + 1) + '.' + ext, await TN.file.canvasBlob(c, fmt.value)]); c.width = c.height = 0; await ui.sleep(0); } prog.set(1); setTimeout(() => prog.set(null), 500);
        if (blobs.length === 1) { res.replaceChildren(ui.btns(ui.btn('⬇ Download image', () => ui.download(blobs[0][1], blobs[0][0])))); } else { const Z = await TN.libs.jszip(), z = new Z(); blobs.forEach(([n, b]) => z.file(n, b)); const zb = await z.generateAsync({ type: 'blob' }); res.replaceChildren(ui.note('✅ ' + blobs.length + ' images ready', 'ok'), ui.btns(ui.btn('⬇ Download ZIP', () => ui.download(zb, stripExt(f.name) + '-images.zip')))); } }));
      body.replaceChildren(fileInfo(f), ui.panel('', ui.row(ui.field('Format', fmt), ui.field('Quality', dpi)), ui.field('Pages', rng), ui.btns(go), prog.el, res));
    }
  } });

  /* ── Images → PDF ── */
  TN.register({ id: 'images-to-pdf', cat: 'pdf', icon: '📸', name: 'Images to PDF', desc: 'Turn photos or scans into a PDF. A4, Letter or fit to image.', tags: 'jpg png photo scan convert document create', render(root) {
    let files = []; const list = h('div'), res = h('div'), size = ui.select([['fit', 'Same as image'], ['a4', 'A4'], ['letter', 'US Letter']], 'a4'), orient = ui.select([['auto', 'Auto'], ['p', 'Portrait'], ['l', 'Landscape']], 'auto'), margin = ui.num({ value: 10, min: 0 }), quality = ui.select([[0.95, 'High'], [0.8, 'Medium (smaller)'], [0.6, 'Low (smallest)']], 0.8);
    const draw = () => { list.replaceChildren(files.length ? ui.fileList(files, { onRemove: i => { files.splice(i, 1); draw(); }, onMove: (i, d) => { [files[i], files[i + d]] = [files[i + d], files[i]]; draw(); } }) : null); go.disabled = !files.length; };
    const go = ui.btn('Create PDF', async () => ui.busy(go, async () => { const { PDFDocument } = await TN.libs.pdfLib(), d = await PDFDocument.create(), mg = (v(margin) || 0) * 72 / 25.4; for (const f of files) { const bm = await createImageBitmap(f, { imageOrientation: 'from-image' }), c = document.createElement('canvas'), k = Math.min(1, 3000 / Math.max(bm.width, bm.height)); c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bm, 0, 0, c.width, c.height); const jb = await TN.file.canvasBlob(c, 'image/jpeg', +quality.value), im = await d.embedJpg(new Uint8Array(await jb.arrayBuffer()));
        let pw, ph; if (size.value === 'fit') { pw = im.width; ph = im.height; } else { [pw, ph] = size.value === 'a4' ? [595.28, 841.89] : [612, 792]; const land = orient.value === 'l' || (orient.value === 'auto' && im.width > im.height); if (land) [pw, ph] = [ph, pw]; }
        const pg = d.addPage([pw, ph]); if (size.value === 'fit') pg.drawImage(im, { x: 0, y: 0, width: pw, height: ph }); else { const aw = pw - 2 * mg, ah = ph - 2 * mg, s = Math.min(aw / im.width, ah / im.height); pg.drawImage(im, { x: (pw - im.width * s) / 2, y: (ph - im.height * s) / 2, width: im.width * s, height: im.height * s }); } }
      const b = await P.save(d); res.replaceChildren(ui.note('✅ ' + files.length + ' page PDF · ' + ui.fmtBytes(b.size), 'ok'), ui.btns(ui.btn('⬇ Download PDF', () => ui.download(b, 'images.pdf')))); }));
    root.append(ui.panel('', ui.drop({ accept: 'image/*', multiple: true, label: 'Add images', onFiles: fs => { files.push(...fs.filter(f => f.type.startsWith('image/'))); draw(); } }), list), ui.panel('Page setup', ui.row(ui.field('Page size', size), ui.field('Orientation', orient), ui.field('Margin (mm)', margin), ui.field('Image quality', quality)), ui.btns(go), res)); draw();
  } });

  /* ── PDF → text ── */
  TN.register({ id: 'pdf-to-text', cat: 'pdf', icon: '📝', name: 'PDF to Text', desc: 'Extract all the text from a PDF to copy or download.', tags: 'extract copy text words convert txt', render(root) {
    const body = h('div'); root.append(P.pickOne(f => start(f)), body);
    async function start(f) {
      const out = ui.out('Extracting…'), prog = ui.progress(); body.replaceChildren(fileInfo(f), prog.el, ui.panel('Text', out)); let all = [];
      for (let i = 1; i <= f.pages; i++) { prog.set((i - 1) / f.pages); const pg = await f.pdf.getPage(i), tc = await pg.getTextContent(); let line = '', lastY = null, rows = []; for (const it of tc.items) { if (!('str' in it)) continue; const y = Math.round(it.transform[5]); if (lastY !== null && Math.abs(y - lastY) > 2) { rows.push(line); line = ''; } line += it.str + (it.hasEOL ? '' : ''); lastY = y; } rows.push(line); all.push('--- Page ' + i + ' ---\n' + rows.join('\n').trim()); pg.cleanup(); if (i % 5 === 0) await ui.sleep(0); }
      prog.set(null); const text = all.join('\n\n'); out.set(text.replace(/--- Page \d+ ---\n?/g, '').trim() ? text : '', text); if (!text.replace(/--- Page \d+ ---\n?/g, '').trim()) out.set('No text found. This looks like a scanned PDF (pictures of pages).');
      body.append(ui.btns(ui.btn('Download .txt', () => ui.download(text, stripExt(f.name) + '.txt', 'text/plain'), 'secondary')));
    }
  } });

  /* ── Page numbers ── */
  TN.register({ id: 'pdf-page-numbers', cat: 'pdf', icon: '🔢', name: 'Add Page Numbers', desc: 'Stamp page numbers on every page — choose position, format and start.', tags: 'number pages footer header numbering', render(root) {
    const body = h('div'); root.append(P.pickOne(f => start(f)), body);
    function start(f) {
      const pos = ui.select([['bc', 'Bottom centre'], ['br', 'Bottom right'], ['bl', 'Bottom left'], ['tc', 'Top centre'], ['tr', 'Top right'], ['tl', 'Top left']], 'bc'), fmt = ui.select([['n', '1'], ['pn', 'Page 1'], ['nN', '1 / N'], ['pnN', 'Page 1 of N'], ['dn', '- 1 -']], 'nN'), start0 = ui.num({ value: 1 }), size = ui.num({ value: 11, min: 6 }), skip = ui.check('Skip the first page (cover)', false), res = h('div');
      const go = ui.btn('Add numbers', async () => ui.busy(go, async () => { const d = await P.loadLib(f.bytes), { StandardFonts, rgb } = await TN.libs.pdfLib(), font = await d.embedFont(StandardFonts.Helvetica), N = d.getPageCount(), s0 = Math.round(v(start0)) || 1, fs = v(size) || 11; d.getPages().forEach((p, i) => { if (i === 0 && skip.querySelector('input').checked) return; const n = s0 + i - (skip.querySelector('input').checked ? 1 : 0), tot = s0 + N - 1 - (skip.querySelector('input').checked ? 1 : 0), t = { n: '' + n, pn: 'Page ' + n, nN: n + ' / ' + tot, pnN: 'Page ' + n + ' of ' + tot, dn: '- ' + n + ' -' }[fmt.value], w = font.widthOfTextAtSize(t, fs), { width: W, height: H } = p.getSize(), m = 28; const x = pos.value[1] === 'c' ? (W - w) / 2 : pos.value[1] === 'r' ? W - m - w : m, y = pos.value[0] === 'b' ? m - 4 : H - m - fs + 4; p.drawText(t, { x, y, size: fs, font, color: rgb(0.2, 0.2, 0.2) }); }); const b = await P.save(d); res.replaceChildren(ui.note('✅ Numbers added', 'ok'), ui.btns(ui.btn('⬇ Download', () => ui.download(b, stripExt(f.name) + '-numbered.pdf')))); }));
      body.replaceChildren(fileInfo(f), ui.panel('', ui.row(ui.field('Position', pos), ui.field('Format', fmt)), ui.row(ui.field('Start at', start0), ui.field('Font size', size)), skip, ui.btns(go), res));
    }
  } });

  /* ── Watermark ── */
  TN.register({ id: 'pdf-watermark', cat: 'pdf', icon: '💧', name: 'Watermark PDF', desc: 'Add a diagonal text watermark such as CONFIDENTIAL or DRAFT.', tags: 'stamp confidential draft copy text overlay', render(root) {
    const body = h('div'); root.append(P.pickOne(f => start(f)), body);
    function start(f) {
      const txt = ui.text({ value: 'CONFIDENTIAL' }), size = ui.num({ value: 64, min: 8 }), op = h('input', { type: 'range', min: 5, max: 80, value: 20 }), col = h('input', { type: 'color', value: '#c0392b' }), ang = ui.select([[45, 'Diagonal 45°'], [0, 'Horizontal'], [90, 'Vertical']], 45), res = h('div');
      const go = ui.btn('Apply watermark', async () => ui.busy(go, async () => { const d = await P.loadLib(f.bytes), { StandardFonts, rgb, degrees } = await TN.libs.pdfLib(), font = await d.embedFont(StandardFonts.HelveticaBold), t = txt.value.trim(); if (!t) throw new Error('Type the watermark text'); if (/[^ -~ -ÿ]/.test(t)) throw new Error('Watermark text supports Latin letters, numbers and common symbols only.'); const c = L2(col.value), fs = v(size) || 64, a = +ang.value; d.getPages().forEach(p => { const { width: W, height: H } = p.getSize(), w = font.widthOfTextAtSize(t, fs), r = a * Math.PI / 180, x = W / 2 - (w / 2) * Math.cos(r) + (fs * 0.35) * Math.sin(r), y = H / 2 - (w / 2) * Math.sin(r) - (fs * 0.35) * Math.cos(r); p.drawText(t, { x, y, size: fs, font, color: rgb(...c), opacity: op.value / 100, rotate: degrees(a) }); }); const b = await P.save(d); res.replaceChildren(ui.note('✅ Watermark added to ' + d.getPageCount() + ' pages', 'ok'), ui.btns(ui.btn('⬇ Download', () => ui.download(b, stripExt(f.name) + '-watermarked.pdf')))); }));
      body.replaceChildren(fileInfo(f), ui.panel('', ui.field('Watermark text', txt), ui.row(ui.field('Font size', size), ui.field('Angle', ang), ui.field('Color', col)), ui.field('Opacity', op), ui.btns(go), res));
    }
    function L2(hex) { const x = TNLogic.hexToRgb(hex) || [192, 57, 43]; return x.map(n => n / 255); }
  } });

  /* ── Metadata ── */
  TN.register({ id: 'pdf-metadata', cat: 'pdf', icon: '🏷️', name: 'PDF Properties & Privacy', desc: 'View and edit title, author, keywords — or wipe them before sharing.', tags: 'metadata author title properties privacy remove', render(root) {
    const body = h('div'); root.append(P.pickOne(f => start(f)), body);
    async function start(f) {
      const d = await P.loadLib(f.bytes), F = { Title: d.getTitle(), Author: d.getAuthor(), Subject: d.getSubject(), Keywords: String(d.getKeywords() || ''), Creator: d.getCreator(), Producer: d.getProducer() }, ins = {}, res = h('div');
      const fields = Object.keys(F).map(k => (ins[k] = ui.text({ value: F[k] || '' }), ui.field(k, ins[k])));
      const save = async (wipe) => { const d2 = await P.loadLib(f.bytes); Object.keys(F).forEach(k => { const v = wipe ? '' : ins[k].value; if (k === 'Keywords') d2.setKeywords(v ? v.split(/[,;]\s*/).map(x => x.trim()).filter(Boolean) : []); else d2['set' + k](v); }); if (wipe) { d2.setCreationDate(new Date(0)); d2.setModificationDate(new Date(0)); } else d2.setModificationDate(new Date()); const b = await P.save(d2); res.replaceChildren(ui.note('✅ Saved', 'ok'), ui.btns(ui.btn('⬇ Download', () => ui.download(b, stripExt(f.name) + (wipe ? '-clean' : '-edited') + '.pdf')))); };
      body.replaceChildren(fileInfo(f), ui.panel('Document properties', ...fields, ui.btns(ui.btn('Save changes', e => ui.busy(e.target, () => save(false))), ui.btn('Wipe all properties', e => ui.busy(e.target, () => save(true)), 'danger')), res), ui.note('This changes the standard document properties. Text inside the pages (for example a name written on page 1) is not affected.'));
    }
  } });

  /* ── Fill forms ── */
  TN.register({ id: 'pdf-form', cat: 'pdf', icon: '📋', name: 'Fill PDF Forms', desc: 'Fill interactive form fields and optionally flatten the result.', tags: 'form fill acroform fields checkbox application', render(root) {
    const body = h('div'); root.append(P.pickOne(f => start(f)), body);
    async function start(f) {
      const lib = await TN.libs.pdfLib(), d = await P.loadLib(f.bytes), form = d.getForm(), fields = form.getFields();
      if (!fields.length) { body.replaceChildren(fileInfo(f), ui.note('This PDF has no fillable form fields. Use the PDF Editor to type text anywhere on the page instead.'), ui.btns(h('a', { class: 'btn', href: '#/t/pdf-editor' }, 'Open PDF Editor'))); return; }
      const ctrls = [], res = h('div'), flat = ui.check('Flatten (make fields part of the page, no longer editable)', false);
      const rows = fields.map(fl => { const n = fl.getName(); let c, kind;
        if (fl instanceof lib.PDFTextField) { kind = 'text'; c = ui.text({ value: fl.getText() || '' }); } else if (fl instanceof lib.PDFCheckBox) { kind = 'check'; c = h('input', { type: 'checkbox', checked: fl.isChecked() }); } else if (fl instanceof lib.PDFRadioGroup) { kind = 'radio'; c = ui.select([['', '(none)'], ...fl.getOptions().map(o => [o, o])], fl.getSelected() || ''); } else if (fl instanceof lib.PDFDropdown) { kind = 'drop'; c = ui.select([['', '(none)'], ...fl.getOptions().map(o => [o, o])], (fl.getSelected() || [])[0] || ''); } else return null;
        ctrls.push({ fl, c, kind }); return ui.field(n, c); }).filter(Boolean);
      const go = ui.btn('Save filled PDF', async () => ui.busy(go, async () => { const d2 = await P.loadLib(f.bytes), form2 = d2.getForm(); ctrls.forEach(({ fl, c, kind }) => { const f2 = form2.getField(fl.getName()); try { if (kind === 'text') f2.setText(c.value); else if (kind === 'check') c.checked ? f2.check() : f2.uncheck(); else if (c.value) f2.select(c.value); } catch (e) { console.warn(e); } }); if (flat.querySelector('input').checked) form2.flatten(); const b = await P.save(d2); res.replaceChildren(ui.note('✅ Saved', 'ok'), ui.btns(ui.btn('⬇ Download', () => ui.download(b, stripExt(f.name) + '-filled.pdf')))); }));
      body.replaceChildren(fileInfo(f), ui.panel(rows.length + ' fields', ...rows, flat, ui.btns(go), res));
    }
  } });
})();
