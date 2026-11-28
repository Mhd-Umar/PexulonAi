/* Pexulon AI PDF editing core — no DOM. Works in the browser (window.PedCore) and in Node (module.exports).
   Contains: font matching, text layout, line/paragraph grouping, coordinate mapping, export engine. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PedCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const C = {};

  /* ───────── fonts ─────────
     3 standard PDF families (no embedding needed) + a library of bundled TrueType families (js/fonts/<file>-<style>.ttf),
     embedded into the PDF by our own small TrueType embedder (no fontkit needed).                                */
  C.FONTS = {
    Helvetica: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'],
    Times: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'],
    Courier: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique']
  };
  const ALL = ['r', 'b', 'i', 'bi'];
  C.FAMS = [
    { id: 'Helvetica', label: 'Arial / Helvetica', cat: 'Sans-serif', std: true, css: 'Helvetica, Arial, "Liberation Sans", Roboto, sans-serif' },
    { id: 'carlito', label: 'Calibri (Carlito)', cat: 'Sans-serif', styles: ALL }, { id: 'opensans', label: 'Open Sans / Segoe UI', cat: 'Sans-serif', styles: ALL },
    { id: 'roboto', label: 'Roboto', cat: 'Sans-serif', styles: ALL }, { id: 'sourcesans', label: 'Source Sans', cat: 'Sans-serif', styles: ALL },
    { id: 'firasans', label: 'Fira Sans', cat: 'Sans-serif', styles: ALL }, { id: 'poppins', label: 'Poppins', cat: 'Sans-serif', styles: ALL },
    { id: 'montserrat', label: 'Montserrat', cat: 'Sans-serif', styles: ALL }, { id: 'dejavusans', label: 'Verdana / DejaVu Sans', cat: 'Sans-serif', styles: ALL },
    { id: 'Times', label: 'Times New Roman', cat: 'Serif', std: true, css: '"Times New Roman", Times, "Liberation Serif", serif' },
    { id: 'caladea', label: 'Cambria (Caladea)', cat: 'Serif', styles: ALL }, { id: 'gelasio', label: 'Georgia (Gelasio)', cat: 'Serif', styles: ALL },
    { id: 'crimson', label: 'Garamond / Crimson', cat: 'Serif', styles: ALL }, { id: 'lora', label: 'Lora', cat: 'Serif', styles: ALL },
    { id: 'bitter', label: 'Bitter (slab serif)', cat: 'Serif', styles: ALL }, { id: 'dejavuserif', label: 'DejaVu Serif / Century', cat: 'Serif', styles: ALL },
    { id: 'Courier', label: 'Courier', cat: 'Monospace', std: true, css: '"Courier New", Courier, "Liberation Mono", monospace' },
    { id: 'liberationmono', label: 'Courier New', cat: 'Monospace', styles: ALL }, { id: 'dejavumono', label: 'Consolas / DejaVu Mono', cat: 'Monospace', styles: ALL },
    { id: 'comicrelief', label: 'Comic Sans style', cat: 'Display', styles: ['r', 'b'] }, { id: 'anton', label: 'Impact style (Anton)', cat: 'Display', styles: ['r'] }, { id: 'archivoblack', label: 'Arial Black style', cat: 'Display', styles: ['r'] }
  ];
  C.FAMS.forEach(f => { f.file = f.file || f.id; if (!f.std) f.css = '"Ped' + f.id + '", ' + (f.cat === 'Serif' ? 'serif' : f.cat === 'Monospace' ? 'monospace' : 'sans-serif'); });
  const FAM = {}; C.FAMS.forEach(f => FAM[f.id] = f);
  C.CSSFONT = {}; C.FAMS.forEach(f => C.CSSFONT[f.id] = f.css);
  C.famInfo = id => FAM[id] || FAM.Helvetica;
  // which style file really exists for the requested bold/italic (e.g. Anton has regular only)
  C.resolveStyle = (fam, b, i) => { const f = FAM[fam]; if (!f || f.std) return (b ? 'b' : '') + (i ? 'i' : '') || 'r'; const want = (b ? 'b' : '') + (i ? 'i' : '') || 'r'; if (f.styles.includes(want)) return want; if (i && f.styles.includes('i')) return 'i'; if (b && f.styles.includes('b')) return 'b'; return 'r'; };
  C.fontUrl = (fam, b, i) => 'js/fonts/' + FAM[fam].file + '-' + C.resolveStyle(fam, b, i) + '.ttf';
  C.fontKey = (fam, b, i) => fam + (b ? 'B' : '') + (i ? 'I' : '');
  C.stdName = (fam, b, i) => C.FONTS[fam][(b ? 1 : 0) + (i ? 2 : 0)];

  // pick the bundled font that looks most like the PDF's font
  const RULES = [
    [/arial ?black|archivo ?black|heavy ?black/, 'archivoblack'], [/impact|anton|oswald|bebas/, 'anton'], [/comic|chalk|marker|handwrit/, 'comicrelief'],
    [/courier|nimbus ?mon|cour\b/, 'Courier'], [/liberation ?mono|couriernew/, 'liberationmono'], [/consolas|menlo|monaco|lucida ?console|inconsolata|source ?code|dejavu ?sans ?mono|andale|mono|typewriter|fixed/, 'dejavumono'],
    [/calibri|carlito|candara|corbel|gill ?sans|lato|myriad|frutiger/, 'carlito'], [/cambria|caladea|constantia/, 'caladea'], [/georgia|gelasio/, 'gelasio'],
    [/verdana|tahoma|dejavu ?sans|bitstream ?vera|geneva/, 'dejavusans'], [/roboto|helvetica ?neue|sf ?pro|san ?francisco/, 'roboto'], [/source ?sans/, 'sourcesans'], [/fira/, 'firasans'], [/poppins/, 'poppins'],
    [/montserrat|gotham|proxima|futura|avenir|century ?gothic|nunito|raleway|josefin/, 'montserrat'], [/open ?sans|segoe|noto ?sans|trebuchet|ubuntu|droid ?sans|lucida ?sans/, 'opensans'],
    [/lora/, 'lora'], [/bitter|rockwell|clarendon|slab|courier ?prime|museo/, 'bitter'], [/garamond|crimson|palatino|palladio|book ?antiqua|minion|sabon|goudy|caslon|baskerville|didot|bodoni|playfair|merriweather/, 'crimson'],
    [/century|bookman|dejavu ?serif|charter|schoolbook/, 'dejavuserif'],
    [/arial|helvet|liberation ?sans|nimbus ?sans|swiss|sans|gothic|univers|akzidenz|calibri/, 'Helvetica'], [/times|liberation ?serif|nimbus ?roman|tinos|termes|roman|serif|mincho|song|libertin/, 'Times']
  ];
  C.classifyFont = function (name, info) {
    info = info || {}; const n = String(name || '').replace(/^[A-Z]{6}\+/, '').toLowerCase().replace(/[_\-,]+/g, ' ');
    const bold = !!info.bold || !!info.black || /bold|black|heavy|semibold|demi|extrabold|\bbd\b/.test(n);
    const italic = !!info.italic || /italic|oblique|\bit\b|ital\b|\bobl\b/.test(n);
    let fam = null; for (const [re, id] of RULES) if (re.test(n)) { fam = id; break; }
    if (!fam) fam = info.isMonospace ? 'Courier' : info.isSerifFont ? 'Times' : 'Helvetica';
    if (fam === 'Courier' && !/courier/.test(n) && !info.isMonospace) fam = 'dejavumono';
    return { fam, bold, italic };
  };

  /* minimal TrueType reader: unitsPerEm, glyph lookup (cmap fmt 4/12), advance widths, bounding box */
  C.parseTTF = function (bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), u16 = o => dv.getUint16(o), i16 = o => dv.getInt16(o), u32 = o => dv.getUint32(o), T = {};
    const n = u16(4); for (let k = 0; k < n; k++) { const o = 12 + k * 16, tag = String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]); T[tag] = { off: u32(o + 8), len: u32(o + 12) }; }
    if (!T.head || !T.cmap || !T.hmtx || !T.hhea || !T.maxp) throw new Error('Unsupported font file');
    const upem = u16(T.head.off + 18), bbox = [i16(T.head.off + 36), i16(T.head.off + 38), i16(T.head.off + 40), i16(T.head.off + 42)], asc = i16(T.hhea.off + 4), desc = i16(T.hhea.off + 6), nh = u16(T.hhea.off + 34), ng = u16(T.maxp.off + 4);
    let italicAngle = 0; if (T.post) { italicAngle = dv.getInt32(T.post.off + 4) / 65536; }
    let cap = asc * 0.7; if (T.OS2 || T['OS/2']) { const t = T['OS/2'] || T.OS2; if (t.len >= 90 && u16(t.off) >= 2) cap = i16(t.off + 88) || cap; }
    // cmap
    const co = T.cmap.off, nt = u16(co + 2); let best = null;
    for (let k = 0; k < nt; k++) { const pid = u16(co + 4 + k * 8), eid = u16(co + 6 + k * 8), off = co + u32(co + 8 + k * 8), fmt = u16(off); if ((pid === 3 && (eid === 1 || eid === 10)) || pid === 0) { if (fmt === 4 || fmt === 12) { if (!best || (fmt === 12 && best.fmt === 4)) best = { off, fmt }; } } }
    if (!best) throw new Error('Font has no Unicode map');
    const cache = new Map();
    const gid = cp => {
      if (cache.has(cp)) return cache.get(cp); let g = 0; const o = best.off;
      if (best.fmt === 4) { const sc = u16(o + 6) / 2, endO = o + 14, startO = endO + sc * 2 + 2, deltaO = startO + sc * 2, rangeO = deltaO + sc * 2;
        for (let k = 0; k < sc; k++) { if (cp <= u16(endO + k * 2)) { const st = u16(startO + k * 2); if (cp >= st) { const ro = u16(rangeO + k * 2), dl = i16(deltaO + k * 2); if (ro === 0) g = (cp + dl) & 0xffff; else { const ga = u16(rangeO + k * 2 + ro + (cp - st) * 2); g = ga ? (ga + dl) & 0xffff : 0; } } break; } } }
      else { const ng2 = u32(o + 12); for (let k = 0; k < ng2; k++) { const e = o + 16 + k * 12, s0 = u32(e), e0 = u32(e + 4); if (cp >= s0 && cp <= e0) { g = u32(e + 8) + (cp - s0); break; } } }
      cache.set(cp, g); return g;
    };
    const adv = g => { const k = g < nh ? g : nh - 1; return u16(T.hmtx.off + k * 4); };
    return { upem, bbox, asc, desc, italicAngle, cap, gid, adv, numGlyphs: ng };
  };
  // embed a whole (pre-subset) TrueType file as a Type0 / CIDFontType2 / Identity-H font. Call finish() before saving.
  C.embedTTF = function (PL, doc, parsed, bytes, psName, flagsItalic, ghost) {
    const ctx = doc.context, sc = 1000 / parsed.upem, used = new Map(), gmap = new Map(); let gn = 0; // ghost: invisible text layer; codes are synthetic and ToUnicode gives the real characters
    const ffRef = ctx.register(ctx.flateStream(bytes, { Length1: bytes.length }));
    const descRef = ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: psName, Flags: 32 | (flagsItalic ? 64 : 0), FontBBox: parsed.bbox.map(v => Math.round(v * sc)), ItalicAngle: Math.round(parsed.italicAngle), Ascent: Math.round(parsed.asc * sc), Descent: Math.round(parsed.desc * sc), CapHeight: Math.round(parsed.cap * sc), StemV: 80, FontFile2: ffRef }));
    const cid = ctx.obj({ Type: 'Font', Subtype: 'CIDFontType2', BaseFont: psName, CIDSystemInfo: { Registry: PL.PDFString.of('Adobe'), Ordering: PL.PDFString.of('Identity'), Supplement: 0 }, FontDescriptor: descRef, DW: 1000, CIDToGIDMap: 'Identity' }), cidRef = ctx.register(cid);
    const t0 = ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: psName, Encoding: 'Identity-H', DescendantFonts: [cidRef] }), ref = ctx.register(t0);
    const hex4 = n => n.toString(16).padStart(4, '0');
    return {
      name: psName, ref,
      encodeText(text) { let h = ''; for (const ch of String(text)) { const cp = ch.codePointAt(0); let g; if (ghost) { g = gmap.get(cp); if (!g) { g = gn < parsed.numGlyphs - 1 ? ++gn : 1; gmap.set(cp, g); } } else g = parsed.gid(cp); h += hex4(g); if (g) used.set(g, cp); } return PL.PDFHexString.of(h); },
      finish() {
        if (!used.size) return; const gs = [...used.keys()].sort((a, b) => a - b), W = []; gs.forEach(g => { W.push(g, [Math.round(parsed.adv(g) * sc)]); }); cid.set(PL.PDFName.of('W'), ctx.obj(W));
        let cm = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n';
        for (let k = 0; k < gs.length; k += 100) { const part = gs.slice(k, k + 100); cm += part.length + ' beginbfchar\n'; part.forEach(g => { const cp = used.get(g); let u; if (cp > 0xffff) { const c = cp - 0x10000; u = hex4(0xd800 + (c >> 10)) + hex4(0xdc00 + (c & 1023)); } else u = hex4(cp); cm += '<' + hex4(g) + '> <' + u + '>\n'; }); cm += 'endbfchar\n'; }
        cm += 'endcmap CMapName currentdict /CMap defineresource pop end end'; t0.set(PL.PDFName.of('ToUnicode'), ctx.register(ctx.flateStream(cm)));
      }
    };
  };

  // metrics: standard fonts via a scratch pdf-lib doc; bundled fonts via parsed TTFs registered with setCustom()
  C.makeMetrics = async function (PL) {
    const doc = await PL.PDFDocument.create(), M = {}, custom = new Map();
    for (const fam of Object.keys(C.FONTS)) for (const b of [0, 1]) for (const i of [0, 1]) M[C.fontKey(fam, b, i)] = await doc.embedFont(PL.StandardFonts[C.stdName(fam, b, i)]);
    const ck = (fam, b, i) => fam + '|' + C.resolveStyle(fam, b, i);
    const isStd = fam => !!(FAM[fam] && FAM[fam].std) || !FAM[fam];
    const width = (t, fam, b, i, size) => {
      if (!isStd(fam)) { const p = custom.get(ck(fam, b, i)); if (!p) return NaN; let w = 0; for (const ch of t) { const g = p.gid(ch.codePointAt(0)); if (!g) return NaN; w += p.adv(g); } return w / p.upem * size; }
      try { return M[C.fontKey(fam, b, i)].widthOfTextAtSize(t, size); } catch (e) { return NaN; }
    };
    const canEncode = (t, fam, b, i) => {
      t = String(t).replace(/\n/g, ' ');
      if (fam && !isStd(fam)) { const p = custom.get(ck(fam, b, i)); if (!p) return false; for (const ch of t) { if (!p.gid(ch.codePointAt(0))) return false; } return true; }
      try { M.Helvetica.widthOfTextAtSize(t, 10); return true; } catch (e) { return false; }
    };
    return { width, canEncode, setCustom(fam, b, i, parsed) { custom.set(ck(fam, b, i), parsed); }, hasCustom: (fam, b, i) => custom.has(ck(fam, b, i)) };
  };
  // wrap text. style: {fam,bold,italic,size,hs,maxW}. returns array of strings
  C.layoutText = function (text, st, metrics) {
    const out = [];
    for (const para of String(text).split('\n')) {
      if (!st.maxW) { out.push(para); continue; }
      const words = para.split(/( +)/); let cur = '';
      const w = s => { const x = metrics.width(s, st.fam, st.bold, st.italic, st.size); return (isNaN(x) ? s.length * st.size * 0.55 : x) * (st.hs || 1); };
      for (const tok of words) { const trial = cur + tok; if (cur && w(trial.replace(/ +$/, '')) > st.maxW && tok.trim()) { out.push(cur.replace(/ +$/, '')); cur = tok; } else cur = trial; }
      out.push(cur);
    }
    return out;
  };

  /* ───────── geometry ───────── */
  C.vpToPdf = function (view, rot) {
    const [x0, y0, x1, y1] = view;
    switch (((rot % 360) + 360) % 360) {
      case 90: return (vx, vy) => [x0 + vy, y0 + vx];
      case 180: return (vx, vy) => [x1 - vx, y0 + vy];
      case 270: return (vx, vy) => [x1 - vy, y1 - vx];
      default: return (vx, vy) => [x0 + vx, y1 - vy];
    }
  };
  C.hex = function (hex, fallback) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return fallback || [0, 0, 0]; const n = parseInt(m[1], 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

  /* ───────── text grouping (input: items in viewport space) ─────────
     item: {str, x, y (baseline), w, fs, asc, desc, font}   */
  C.groupLines = function (items) {
    items = items.filter(it => it.str !== '' && it.w >= 0).slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const lines = [];
    for (const it of items) {
      let target = null;
      for (let k = lines.length - 1; k >= 0 && k >= lines.length - 40; k--) {
        const l = lines[k], tol = 0.4 * Math.min(l.fs, it.fs);
        if (l.y < it.y - tol - 60) break;
        if (Math.abs(l.y - it.y) <= tol && Math.abs(l.fs - it.fs) <= 0.3 * l.fs && it.x >= l.x0 - it.fs && it.x - l.x1 < 1.3 * it.fs) { target = l; break; }
      }
      if (target) { target.items.push(it); target.x1 = Math.max(target.x1, it.x + it.w); target.x0 = Math.min(target.x0, it.x); }
      else lines.push({ items: [it], x0: it.x, x1: it.x + it.w, y: it.y, fs: it.fs, asc: it.asc, desc: it.desc });
    }
    for (const l of lines) {
      l.items.sort((a, b) => a.x - b.x); let t = '', prev = null;
      for (const it of l.items) { if (prev) { const gap = it.x - (prev.x + prev.w); if (!/\s$/.test(t) && !/^\s/.test(it.str) && gap > 0.17 * l.fs) t += ' '; } t += it.str; prev = it; }
      l.text = t.replace(/\s+$/, ''); l.fs = Math.max(...l.items.map(i => i.fs)); l.y = l.items[0].y;
      const chars = {}; l.items.forEach(i => { chars[i.font] = (chars[i.font] || 0) + i.str.length; }); l.font = Object.keys(chars).sort((a, b) => chars[b] - chars[a])[0];
      l.top = l.y - l.asc * l.fs; l.bottom = l.y + (-l.desc) * l.fs;
    }
    return lines.filter(l => l.text.trim()).sort((a, b) => (a.y - b.y) || (a.x0 - b.x0));
  };
  C.groupBlocks = function (lines) {
    const used = new Set(), blocks = [];
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue; const b = [lines[i]]; used.add(i); let last = lines[i], pitch = null;
      for (;;) {
        let nxt = -1;
        for (let j = i + 1; j < lines.length; j++) {
          if (used.has(j)) continue; const c = lines[j], dy = c.y - last.y;
          if (dy > 2.4 * last.fs) break; if (dy < 0.7 * last.fs) continue;
          const same = Math.abs(c.fs - last.fs) <= 0.08 * last.fs, aligned = Math.abs(c.x0 - last.x0) <= 0.9 * last.fs || (b.length === 1 && c.x0 < last.x0 && last.x0 - c.x0 <= 3 * last.fs) || (b.length === 1 && c.x0 > last.x0 && c.x0 - last.x0 <= 3 * last.fs && Math.abs(c.x0 - last.x0) > 0.6 * last.fs);
          const gapOk = pitch == null ? dy <= 1.9 * last.fs : Math.abs(dy - pitch) <= 0.3 * pitch;
          const lastFull = last.x1 - last.x0; const bw = Math.max(...b.map(l => l.x1 - l.x0));
          if (same && aligned && gapOk && !(lastFull < 0.55 * bw && b.length > 1)) { nxt = j; break; }
        }
        if (nxt < 0) break; const c = lines[nxt]; pitch = c.y - last.y; b.push(c); used.add(nxt); last = c;
      }
      blocks.push(b);
    }
    return blocks.map(ls => ({ lines: ls, x0: Math.min(...ls.map(l => l.x0)), x1: Math.max(...ls.map(l => l.x1)), top: Math.min(...ls.map(l => l.top)), bottom: Math.max(...ls.map(l => l.bottom)), fs: ls[0].fs, font: ls[0].font, text: ls.map(l => l.text).join('\n'), pitch: ls.length > 1 ? (ls[ls.length - 1].y - ls[0].y) / (ls.length - 1) : ls[0].fs * 1.2 }));
  };
  C.lineAsBlock = l => ({ lines: [l], x0: l.x0, x1: l.x1, top: l.top, bottom: l.bottom, fs: l.fs, font: l.font, text: l.text, pitch: l.fs * 1.2 });

  /* ───────── export engine ─────────
     entries: [{src|null, w, h, view, rot, deleted, objs:[...]}]  assets: {id: {mime, data(Uint8Array)}}
     env: {metrics, textImage(lines, style)->Promise<{png:Uint8Array,w,h}>|null, removeText(PL,doc,page,rects)->{...}|null}   */
  C.exportDoc = async function (PL, bytes, entries, assets, env) {
    env = env || {}; const doc = await PL.PDFDocument.load(bytes, { updateMetadata: false }); const pages = doc.getPages(); const metrics = env.metrics || await C.makeMetrics(PL); const report = { removed: 0, covered: 0, imageText: 0 };
    const fontCache = new Map(), customFonts = []; const getFont = async (fam, b, i) => { const k = fam + '|' + C.resolveStyle(fam, b, i); if (!fontCache.has(k)) { if (C.famInfo(fam).std) fontCache.set(k, await doc.embedFont(PL.StandardFonts[C.stdName(fam, b, i)])); else { const bytes2 = await env.fontBytes(fam, b, i), parsed = C.parseTTF(bytes2), f2 = C.embedTTF(PL, doc, parsed, bytes2, 'Ped-' + fam + '-' + C.resolveStyle(fam, b, i), /i/.test(C.resolveStyle(fam, b, i))); customFonts.push(f2); fontCache.set(k, f2); } } return fontCache.get(k); };
    const imgCache = new Map(); const getImg = async id => { if (imgCache.has(id)) return imgCache.get(id); const a = assets[id]; if (!a) return null; const im = /png/i.test(a.mime) ? await doc.embedPng(a.data) : await doc.embedJpg(a.data); imgCache.set(id, im); return im; };

    async function applyObjs(page, e) {
      const map = C.vpToPdf(e.view, e.rot), rot = ((e.rot % 360) + 360) % 360, rect = (x, y, w, h) => { const a = map(x, y), b = map(x + w, y + h); return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) }; };
      const rgbc = hx => PL.rgb(...C.hex(hx));
      // pass 0: original images the user moved, replaced or deleted are taken out of the page first
      { const hide = new Set(e.objs.filter(o => o.type === 'hideimg').map(o => o.idx)); if (hide.size && env.removeText) { try { env.removeText(PL, doc, page, [], { rot, hideImages: hide }); } catch (_) { } } }
      // pass 1: text edits (remove original, then draw)
      const later = []; // every cover is painted first, then the new text, so a cover never hides text pushed into its area
      for (let o of e.objs.filter(o => o.type === 'edit')) {
        let coveredNeeded = true; const ro = o.origBottom != null ? { x: o.ox0, y: o.origTop, w: o.ox1 - o.ox0, h: o.origBottom - o.origTop } : { x: o.x, y: o.y, w: o.w, h: o.h }; // the cover always sits where the ORIGINAL text was, even if the edited text was moved or pushed down
        if (env.removeText && o.items && o.items.length) {
          const targets = o.items.map(it => { const a = map(it.x, it.y); return { str: it.str, x: a[0], y: a[1], w: it.w, fs: it.fs, rot }; });
          try { const r = env.removeText(PL, doc, page, targets, { rot }); if (r && r.color && !o.colorUser) o = Object.assign({}, o, { color: r.color }); /* the exact colour the PDF used */ if (r && r.removed === targets.length && !(r.invisible > 0)) { coveredNeeded = false; report.removed++; } else report.covered++; } catch (err) { report.covered++; }
        } else report.covered++;
        if (coveredNeeded && env.coverImage && o.items && o.items.length) { const ci = await env.coverImage(Object.assign({}, o, ro), e); if (ci) { const emb = await doc.embedPng(ci.png), bl = map(ci.x, ci.y + ci.h); page.drawImage(emb, { x: bl[0], y: bl[1], width: ci.w, height: ci.h, rotate: PL.degrees(rot) }); } else if (o.bg) { const r = rect(ro.x - 1, ro.y - 1, ro.w + 2, ro.h + 2); page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: rgbc(o.bg), borderWidth: 0 }); } }
        else if (coveredNeeded && o.bg) { const r = rect(ro.x - 1, ro.y - 1, ro.w + 2, ro.h + 2); page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: rgbc(o.bg), borderWidth: 0 }); }
        else if (o.bg && o.forceCover) { const r = rect(ro.x - 1, ro.y - 1, ro.w + 2, ro.h + 2); page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: rgbc(o.bg), borderWidth: 0 }); }
        later.push(o);
      }
      for (const o of later) await drawTextBlock(page, e, o, map, rot, true);
      for (const o of e.objs) {
        switch (o.type) {
          case 'edit': break;
          case 'text': await drawTextBlock(page, e, o, map, rot, false); break;
          case 'whiteout': { const r = rect(o.x, o.y, o.w, o.h); page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: rgbc(o.color || '#ffffff'), borderWidth: 0 }); break; }
          case 'redact': {
            if (env.removeText) { const a = map(o.x, o.y), b = map(o.x + o.w, o.y + o.h); try { env.removeText(PL, doc, page, [], { rot, redactRect: { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) } }); } catch (err) { /* covered below */ } }
            const r = rect(o.x, o.y, o.w, o.h); page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: PL.rgb(0, 0, 0), borderWidth: 0 }); break; }
          case 'highlight': { const r = rect(o.x, o.y, o.w, o.h); page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: rgbc(o.color || '#ffeb3b'), opacity: o.opacity ?? 0.45, blendMode: PL.BlendMode.Multiply, borderWidth: 0 }); break; }
          case 'underline': case 'strike': { const a = map(o.x, o.y), b = map(o.x + o.w, o.y); page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: o.sw || 1, color: rgbc(o.color || '#d62828') }); break; }
          case 'rect': { const r = rect(o.x, o.y, o.w, o.h); page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, borderColor: rgbc(o.stroke || '#d62828'), borderWidth: o.sw ?? 2, color: o.fill ? rgbc(o.fill) : undefined, opacity: o.fill ? (o.fillOpacity ?? 1) : undefined, borderOpacity: 1 }); break; }
          case 'ellipse': { const r = rect(o.x, o.y, o.w, o.h); page.drawEllipse({ x: r.x + r.w / 2, y: r.y + r.h / 2, xScale: r.w / 2, yScale: r.h / 2, borderColor: rgbc(o.stroke || '#d62828'), borderWidth: o.sw ?? 2, color: o.fill ? rgbc(o.fill) : undefined, opacity: o.fill ? (o.fillOpacity ?? 1) : undefined }); break; }
          case 'line': case 'arrow': {
            const a = map(o.x1, o.y1), b = map(o.x2, o.y2), col = rgbc(o.stroke || '#d62828'), th = o.sw ?? 2; page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: th, color: col, lineCap: PL.LineCapStyle.Round });
            if (o.type === 'arrow') { const ang = Math.atan2(a[1] - b[1], a[0] - b[0]), L = Math.max(8, th * 4); for (const s of [-0.45, 0.45]) page.drawLine({ start: { x: b[0], y: b[1] }, end: { x: b[0] + L * Math.cos(ang + s), y: b[1] + L * Math.sin(ang + s) }, thickness: th, color: col, lineCap: PL.LineCapStyle.Round }); } break; }
          case 'draw': { const col = rgbc(o.stroke || '#1d4ed8'); const P2 = o.pts.map(p => map(p[0], p[1])); for (let k = 1; k < P2.length; k++) page.drawLine({ start: { x: P2[k - 1][0], y: P2[k - 1][1] }, end: { x: P2[k][0], y: P2[k][1] }, thickness: o.sw ?? 2, color: col, lineCap: PL.LineCapStyle.Round }); if (P2.length === 1) page.drawCircle({ x: P2[0][0], y: P2[0][1], size: (o.sw ?? 2) / 2, color: col }); break; }
          case 'image': case 'sign': { const im = await getImg(o.asset); if (!im) break; const bl = map(o.x, o.y + o.h); page.drawImage(im, { x: bl[0], y: bl[1], width: o.w, height: o.h, rotate: PL.degrees(rot), opacity: o.opacity ?? 1 }); break; }
          case 'link': { const r = rect(o.x, o.y, o.w, o.h), ctx = doc.context; const dict = { Type: 'Annot', Subtype: 'Link', Rect: [r.x, r.y, r.x + r.w, r.y + r.h], Border: [0, 0, 0], F: 4 }; if (o.page != null && /^\d+$/.test(String(o.page))) { dict.Dest = [pages[+o.page - 1] ? pages[+o.page - 1].ref : pages[0].ref, 'Fit']; } else dict.A = { Type: 'Action', S: 'URI', URI: PL.PDFString.of(o.url || '') };
            const ref = ctx.register(ctx.obj(dict)); let ann = page.node.Annots(); if (!ann) { page.node.set(PL.PDFName.of('Annots'), ctx.obj([])); ann = page.node.Annots(); } ann.push(ref); break; }
        }
      }
    }
    async function drawTextBlock(page, e, o, map, rot, isEdit) {
      const linesAll = o.lines || C.layoutText(o.text, { fam: o.fam, bold: o.bold, italic: o.italic, size: o.size, hs: o.hs || 1, maxW: o.maxW || 0 }, metrics), lines = o.flowK != null ? linesAll.slice(0, o.flowK) : linesAll; // flowK: only the lines that still fit on this page
      if (!lines.length || !lines.join('').trim()) return;
      let fam = o.fam, encodable = lines.every(l => metrics.canEncode(l, fam, o.bold, o.italic));
      if (!encodable && env.ensureFont) { // the chosen font lacks a glyph (₹, ✓, arrows…): switch to a bundled font that has it, keeping real text
        const sans = ['dejavusans', 'dejavuserif', 'dejavumono'], order = /serif|Times|caladea|gelasio|crimson|lora|bitter/i.test(fam) ? ['dejavuserif', 'dejavusans', 'dejavumono'] : /mono|Courier/i.test(fam) ? ['dejavumono', 'dejavusans', 'dejavuserif'] : sans;
        for (const cand of order) { try { await env.ensureFont(cand, o.bold, o.italic); } catch (_) { continue; } if (lines.every(l => metrics.canEncode(l, cand, o.bold, o.italic))) { fam = cand; encodable = true; break; } }
      }
      const lh = o.lineH || o.size * 1.2, hs = o.hs || 1, wOf = s => { const x = metrics.width(s, fam, o.bold, o.italic, o.size); return (isNaN(x) ? s.length * o.size * 0.55 : x) * hs; };
      if (!encodable) {
        if (!env.textImage) throw new Error('This text contains characters the standard PDF fonts cannot draw.');
        const img = await env.textImage(lines, { fam: o.fam, bold: o.bold, italic: o.italic, size: o.size, color: o.color, lineH: lh, align: o.align, width: Math.max(o.maxW || 0, ...lines.map(l => wOf(l))), hs }); report.imageText++;
        const embedded = await doc.embedPng(img.png), x0 = o.x0 ?? o.x, top = (o.base0 ?? (o.y + o.size)) - o.size * 0.95; const bl = map(x0, top + img.h / img.scale); page.drawImage(embedded, { x: bl[0], y: bl[1], width: img.w / img.scale, height: img.h / img.scale, rotate: PL.degrees(rot) });
        // invisible real-text layer on top of the picture: selectable, searchable and copyable as the correct Unicode text
        try { if (env.fontBytes && PL.setTextRenderingMode && PL.TextRenderingMode) {
          if (!fontCache.has('ghost')) { if (env.ensureFont) await env.ensureFont('dejavusans', false, false); const gb = await env.fontBytes('dejavusans', false, false), gp = C.parseTTF(gb), gf = C.embedTTF(PL, doc, gp, gb, 'Ped-text-layer', false, true); customFonts.push(gf); fontCache.set('ghost', gf); }
          const gf = fontCache.get('ghost'), gkey = page.node.newFontDictionary(gf.name, gf.ref), rad2 = rot * Math.PI / 180, gboxW = o.maxW || Math.max(...lines.map(wOf)), gleft = x0;
          lines.forEach((ln, i) => { if (!ln) return; const w2 = wOf(ln); let gx = gleft; if (o.align === 'center') gx = gleft + (gboxW - w2) / 2; else if (o.align === 'right') gx = gleft + gboxW - w2; const gp2 = map(gx, (o.base0 ?? (o.y + o.size)) + i * lh), cs2 = page.getContentStream();
            cs2.push(PL.pushGraphicsState(), PL.beginText(), PL.setTextRenderingMode(PL.TextRenderingMode.Invisible), PL.setFontAndSize(gkey, o.size), PL.rotateAndSkewTextRadiansAndTranslate(rad2, 0, 0, gp2[0], gp2[1]), PL.showText(gf.encodeText(ln)), PL.endText(), PL.popGraphicsState()); });
        } } catch (err) { if (typeof console !== 'undefined') console.warn('text layer skipped', err); }
        return;
      }
      const font = await getFont(fam, o.bold, o.italic), key = page.node.newFontDictionary(font.name, font.ref), col = PL.rgb(...C.hex(o.color, [0, 0, 0])), rad = rot * Math.PI / 180;
      const boxW = o.maxW || Math.max(...lines.map(wOf)), left = o.x0 ?? o.x;
      lines.forEach((ln, i) => {
        if (!ln) return; const w = wOf(ln); let x = left; if (o.align === 'center') x = left + (boxW - w) / 2; else if (o.align === 'right') x = left + boxW - w;
        const p = map(x, (o.base0 ?? (o.y + o.size)) + i * lh), cs = page.getContentStream();
        const ops = [PL.pushGraphicsState(), PL.beginText(), PL.setFillingColor(col), PL.setFontAndSize(key, o.size)]; if (Math.abs(hs - 1) > 0.002) ops.push(PL.setCharacterSqueeze(hs * 100));
        ops.push(PL.rotateAndSkewTextRadiansAndTranslate(rad, 0, 0, p[0], p[1]), PL.showText(font.encodeText(ln)), PL.endText(), PL.popGraphicsState()); cs.push(...ops);
        if (o.underline) { const q = map(x + w, (o.base0 ?? (o.y + o.size)) + i * lh + o.size * 0.12); page.drawLine({ start: { x: map(x, (o.base0 ?? (o.y + o.size)) + i * lh + o.size * 0.12)[0], y: map(x, (o.base0 ?? (o.y + o.size)) + i * lh + o.size * 0.12)[1] }, end: { x: q[0], y: q[1] }, thickness: Math.max(0.6, o.size / 18), color: col }); }
      });
    }

    // Isolate the page's own drawing state: whatever the original content leaves behind (clip, colour, text mode,
    // transparency, unbalanced q) must not affect what we add afterwards.
    const isolated = new Set(); const isolate = page => {
      if (isolated.has(page)) return; isolated.add(page); try {
        const ctx = doc.context; if (!page.node.get(PL.PDFName.of('Contents'))) return; page.node.normalize(); const arr = page.node.Contents(); if (!arr || !arr.insert) return;
        let depth = 0; for (const o of tokenize(syncStreamBytes(PL, doc, page))) { if (o.op === 'q') depth++; else if (o.op === 'Q') depth = Math.max(0, depth - 1); }
        arr.insert(0, ctx.register(ctx.flateStream(new TextEncoder().encode('q\n')))); arr.push(ctx.register(ctx.flateStream(new TextEncoder().encode('Q\n'.repeat(depth + 1)))));
        page.contentStream = undefined; page.contentStreamRef = undefined;
      } catch (err) { /* keep the page as it is */ } };
    for (let k = 0; k < entries.length; k++) { const e = entries[k]; if (e.deleted || e.src == null) continue; if (e.objs.length) { isolate(pages[e.src]); await applyObjs(pages[e.src], e); } if (e.baseRot != null && e.rot !== e.baseRot) pages[e.src].setRotation(PL.degrees(((e.rot % 360) + 360) % 360)); }
    const live = entries.filter(e => !e.deleted), orderChanged = live.length !== pages.length || live.some((e, i) => e.src !== i);
    if (orderChanged) {
      const keep = [];
      for (const e of live) { if (e.src != null) keep.push(pages[e.src]); else keep.push(e); }
      for (let i = doc.getPageCount() - 1; i >= 0; i--) doc.removePage(i);
      for (const k of keep) { if (k.node || k.ref) doc.addPage(k); else { const np = doc.addPage([k.w, k.h]); if (k.objs.length) await applyObjs(np, { view: [0, 0, k.w, k.h], rot: 0, objs: k.objs }); } }
    }
    customFonts.forEach(f => f.finish());
    const out = await doc.save({ useObjectStreams: true });
    out.report = report; return out;
  };


  /* ───────── true text removal from page content streams ─────────
     Tokenises the content stream, tracks the text matrix / CTM and font widths, and deletes the show-text
     operators that belong to the edited/redacted text. Advance is preserved with a TJ adjustment so later
     text on the same line does not move.                                                                   */
  const WS = new Set([0, 9, 10, 12, 13, 32]), DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);
  function tokenize(b) {
    const ops = []; let i = 0, args = [], argStart = -1; const n = b.length;
    const isNumStr = t => /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t);
    function parseObj() { // returns operand token or {kw}
      const c = b[i];
      if (c === 47) { let j = i + 1; while (j < n && !WS.has(b[j]) && !DELIM.has(b[j])) j++; const nm = String.fromCharCode(...b.subarray(i + 1, j)).replace(/#([0-9a-fA-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))); i = j; return { t: 'name', v: nm }; }
      if (c === 40) { let depth = 1, j = i + 1; const out = []; while (j < n && depth) { let ch = b[j]; if (ch === 92) { j++; ch = b[j]; if (ch === 110) out.push(10); else if (ch === 114) out.push(13); else if (ch === 116) out.push(9); else if (ch === 98) out.push(8); else if (ch === 102) out.push(12); else if (ch >= 48 && ch <= 55) { let v = ch - 48, k = 1; while (k < 3 && b[j + 1] >= 48 && b[j + 1] <= 55) { v = v * 8 + b[j + 1] - 48; j++; k++; } out.push(v & 255); } else if (ch === 13) { if (b[j + 1] === 10) j++; } else if (ch === 10) { /* continuation */ } else out.push(ch); j++; continue; } if (ch === 40) depth++; else if (ch === 41) { depth--; if (!depth) { j++; break; } } out.push(ch); j++; } i = j; return { t: 'str', v: Uint8Array.from(out) }; }
      if (c === 60 && b[i + 1] === 60) { let depth = 1, j = i + 2; while (j < n && depth) { if (b[j] === 60 && b[j + 1] === 60) { depth++; j += 2; } else if (b[j] === 62 && b[j + 1] === 62) { depth--; j += 2; } else if (b[j] === 40) { let d = 1; j++; while (j < n && d) { if (b[j] === 92) j++; else if (b[j] === 40) d++; else if (b[j] === 41) d--; j++; } } else j++; } i = j; return { t: 'dict' }; }
      if (c === 60) { let j = i + 1; let hex = ''; while (j < n && b[j] !== 62) { if (!WS.has(b[j])) hex += String.fromCharCode(b[j]); j++; } i = j + 1; if (hex.length % 2) hex += '0'; const out = new Uint8Array(hex.length / 2); for (let k = 0; k < out.length; k++) out[k] = parseInt(hex.substr(k * 2, 2), 16) || 0; return { t: 'str', v: out }; }
      if (c === 91) { i++; const arr = []; while (i < n && b[i] !== 93) { if (WS.has(b[i])) { i++; continue; } if (b[i] === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue; } const o = parseObj(); if (o) arr.push(o); else i++; } i++; return { t: 'array', v: arr }; }
      let j = i; while (j < n && !WS.has(b[j]) && !DELIM.has(b[j])) j++; if (j === i) { i++; return null; } const w = String.fromCharCode(...b.subarray(i, j)); i = j;
      if (isNumStr(w)) return { t: 'num', v: parseFloat(w) }; if (w === 'true' || w === 'false' || w === 'null') return { t: 'kw', v: w }; return { t: 'op', v: w };
    }
    while (i < n) {
      const c = b[i]; if (WS.has(c)) { i++; continue; } if (c === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue; }
      const start = i; const o = parseObj(); if (!o) continue;
      if (o.t === 'op') {
        const rec = { op: o.v, args, start: argStart >= 0 ? argStart : start, end: i }; ops.push(rec); args = []; argStart = -1;
        if (o.v === 'BI') { // skip inline image
          let j = i; const m = /ID[ \t\r\n]/; while (j < n - 2 && !(b[j] === 73 && b[j + 1] === 68 && WS.has(b[j + 2]))) j++; j += 3; while (j < n - 1) { if (b[j] === 69 && b[j + 1] === 73 && WS.has(b[j - 1] ?? 32) && (j + 2 >= n || WS.has(b[j + 2]))) break; j++; } i = Math.min(n, j + 2); ops[ops.length - 1].end = i; }
      } else { if (argStart < 0) argStart = start; args.push(o); }
    }
    return ops;
  }
  const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
  const fmt = x => (Math.abs(x) < 1e-9 ? '0' : String(parseFloat(x.toFixed(4))));

  async function streamBytes(PL, doc, page) {
    const ctx = doc.context, node = page.node; let c = node.get(PL.PDFName.of('Contents')); c = ctx.lookup(c); const parts = [];
    const dec = s => { if (s instanceof PL.PDFRawStream) return PL.decodePDFRawStream(s).decode(); if (s.getUnencodedContents) return s.getUnencodedContents(); return s.getContents(); };
    if (c instanceof PL.PDFArray) { for (let k = 0; k < c.size(); k++) parts.push(dec(ctx.lookup(c.get(k)))); } else if (c) parts.push(dec(c));
    let len = 0; parts.forEach(p => len += p.length + 1); const out = new Uint8Array(len); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; out[o++] = 10; }); return out;
  }
  function getResFonts(PL, doc, page) {
    const ctx = doc.context; let res = page.node.Resources && page.node.Resources(); if (!res && page.node.getInheritableAttribute) res = page.node.getInheritableAttribute(PL.PDFName.of('Resources')); res = ctx.lookup(res);
    const fonts = res && ctx.lookup(res.get(PL.PDFName.of('Font'))); return fonts;
  }
  function fontInfo(PL, doc, fontsDict, name, metrics, cache) {
    if (cache.has(name)) return cache.get(name); const ctx = doc.context; let info = { unknown: true };
    try {
      const fd = ctx.lookup(fontsDict.get(PL.PDFName.of(name))), sub = fd.get(PL.PDFName.of('Subtype')).toString(), num = o => { o = ctx.lookup(o); return o && o.asNumber ? o.asNumber() : undefined; };
      const base = (fd.get(PL.PDFName.of('BaseFont')) || { toString: () => '' }).toString().replace(/^\//, '');
      if (sub === '/Type0') {
        const enc = ctx.lookup(fd.get(PL.PDFName.of('Encoding'))), encName = enc && enc.toString ? enc.toString() : '', desc = ctx.lookup(ctx.lookup(fd.get(PL.PDFName.of('DescendantFonts'))).get(0));
        if (/^\/Identity-[HV]$/.test(encName) || /^\/(Uni|GB|B5|KSC|90)/.test(encName)) { const dw = num(desc.get(PL.PDFName.of('DW'))) ?? 1000, W = ctx.lookup(desc.get(PL.PDFName.of('W'))), map = new Map();
          if (W) { for (let k = 0; k < W.size();) { const a = num(W.get(k)), nx = ctx.lookup(W.get(k + 1)); if (nx instanceof PL.PDFArray) { for (let m = 0; m < nx.size(); m++) map.set(a + m, num(nx.get(m))); k += 2; } else { const b2 = num(nx), w = num(W.get(k + 2)); for (let m = a; m <= b2 && m - a < 70000; m++) map.set(m, w); k += 3; } } }
          info = { bytes: 2, w: code => map.has(code) ? map.get(code) : dw }; }
      } else if (sub !== '/Type3') {
        const first = num(fd.get(PL.PDFName.of('FirstChar'))) ?? 0, W = ctx.lookup(fd.get(PL.PDFName.of('Widths'))), desc = ctx.lookup(fd.get(PL.PDFName.of('FontDescriptor'))), miss = desc ? (num(desc.get(PL.PDFName.of('MissingWidth'))) ?? 0) : 0;
        if (W) info = { bytes: 1, w: code => { const k = code - first; if (k >= 0 && k < W.size()) return num(W.get(k)) ?? miss; return miss; } };
        else { const cl = C.classifyFont(base, {}); info = { bytes: 1, w: code => { const x = metrics.width(String.fromCharCode(code), cl.fam, cl.bold, cl.italic, 1000); return isNaN(x) ? 500 : x; } }; }
      }
    } catch (e) { info = { unknown: true }; }
    cache.set(name, info); return info;
  }

  C.removeTextFactory = function (metrics) {
    return function removeText(PL, doc, page, targets, opts) {
      opts = opts || {}; const r = (((opts.rot || 0) % 360 + 360) % 360) * Math.PI / 180;
      return removeSync(PL, doc, page, targets, opts, Math.cos(r), Math.sin(r), metrics);
    };
  };
  // synchronous because stream decoding in pdf-lib is synchronous
  const decodeStream = (PL, s) => (s instanceof PL.PDFRawStream) ? PL.decodePDFRawStream(s).decode() : (s.getUnencodedContents ? s.getUnencodedContents() : s.getContents());
  const applyEdits = (bytes, edits) => { edits.sort((p, q) => p.start - q.start); const chunks = [], enc = new TextEncoder(); let last = 0, len = 0; for (const e of edits) { chunks.push(bytes.subarray(last, e.start)); chunks.push(enc.encode(e.repl)); last = e.end; } chunks.push(bytes.subarray(last)); chunks.forEach(c => len += c.length); const out = new Uint8Array(len); let p = 0; chunks.forEach(c => { out.set(c, p); p += c.length; }); return out; };
  function removeSync(PL, doc, page, targets, opts, dirx, diry, metrics) {
    const ctx = doc.context, rr = opts.redactRect || null, done = new Array(targets.length).fill(0), N = n => PL.PDFName.of(n);
    const st = { invisible: 0, hits: 0, formsPatched: 0 }; const formsSeen = new Set();
    // process one content stream; `fonts` = its font dict, `res` = its resource dict, `ctm0` = starting matrix
    const hexOf = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
    const hits = [], hideSet = opts.hideImages || null; let imgN = 0; // k-th image XObject drawn on the page (same order as the editor's image list)
    function run(bytes, fonts, res, ctm0, depth, fill0) {
      const ops = tokenize(bytes), cache = new Map(), edits = [], stack = [];
      let ctm = ctm0.slice(), Tm = [1, 0, 0, 1, 0, 0], Tlm = [1, 0, 0, 1, 0, 0], Tc = 0, Tw = 0, Th = 1, TL = 0, Ts = 0, fsz = 0, font = null, Tr = 0, exact = true, fill = fill0 || '#000000', fcs = 'DeviceGray';
      const origin = () => { const m = mul(mul([1, 0, 0, 1, 0, Ts], Tm), ctm); return { x: m[4], y: m[5], sc: Math.hypot(m[0], m[1]) || 1, m }; };
      function advanceOf(op, args) {
        if (!font || font.unknown) return { adv: 0, known: false };
        const strs = op === 'TJ' ? args[0].v : [args[args.length - 1]]; let adv = 0;
        for (const it of strs) { if (it.t === 'num') { adv -= it.v / 1000 * fsz * Th; continue; } if (it.t !== 'str') continue; const bs = it.v;
          if (font.bytes === 2) { for (let k = 0; k + 1 < bs.length; k += 2) { const code = (bs[k] << 8) | bs[k + 1]; adv += (font.w(code) / 1000 * fsz + Tc) * Th; } }
          else for (let k = 0; k < bs.length; k++) { adv += (font.w(bs[k]) / 1000 * fsz + Tc + (bs[k] === 32 ? Tw : 0)) * Th; } }
        return { adv, known: true };
      }
      for (const o of ops) {
        const a = o.args, nums = a.filter(x => x.t === 'num').map(x => x.v);
        switch (o.op) {
          case 'q': stack.push([ctm.slice(), Tc, Tw, Th, TL, Ts, fsz, font, Tr, fill, fcs]); break;
          case 'Q': { const s2 = stack.pop(); if (s2) { [ctm, Tc, Tw, Th, TL, Ts, fsz, font, Tr, fill, fcs] = s2; } break; }
          case 'g': fill = nums.length === 1 ? hexOf(nums[0], nums[0], nums[0]) : fill; fcs = 'DeviceGray'; break;
          case 'rg': fill = nums.length === 3 ? hexOf(nums[0], nums[1], nums[2]) : fill; fcs = 'DeviceRGB'; break;
          case 'k': if (nums.length === 4) { const [c, m, y, k] = nums; fill = hexOf((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)); } fcs = 'DeviceCMYK'; break;
          case 'cs': { const nm = a.find(x => x.t === 'name'); fcs = nm ? nm.v : ''; if (/^(DeviceGray|CalGray|G)$/.test(fcs)) fill = '#000000'; else if (/^(DeviceRGB|CalRGB|RGB)$/.test(fcs)) fill = '#000000'; else if (/^(DeviceCMYK|CMYK)$/.test(fcs)) fill = '#000000'; else fill = null; break; }
          case 'sc': case 'scn': { if (a.some(x => x.t === 'name')) { fill = null; break; } if (nums.length === 3) fill = hexOf(nums[0], nums[1], nums[2]); else if (nums.length === 4) { const [c, m, y, k] = nums; fill = hexOf((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)); } else if (nums.length === 1 && /^(DeviceGray|CalGray|G)$/.test(fcs)) fill = hexOf(nums[0], nums[0], nums[0]); else fill = null; break; }
          case 'cm': if (nums.length === 6) ctm = mul(nums, ctm); break;
          case 'BT': Tm = [1, 0, 0, 1, 0, 0]; Tlm = Tm.slice(); exact = true; break;
          case 'Tc': Tc = nums[0] || 0; break; case 'Tw': Tw = nums[0] || 0; break; case 'Tz': Th = (nums[0] ?? 100) / 100; break; case 'TL': TL = nums[0] || 0; break; case 'Ts': Ts = nums[0] || 0; break; case 'Tr': Tr = nums[0] || 0; break;
          case 'Tf': { const nm = a.find(x => x.t === 'name'); fsz = nums[0] || 0; font = nm && fonts ? fontInfo(PL, doc, fonts, nm.v, metrics, cache) : { unknown: true }; break; }
          case 'Td': Tlm = mul([1, 0, 0, 1, nums[0] || 0, nums[1] || 0], Tlm); Tm = Tlm.slice(); exact = true; break;
          case 'TD': TL = -(nums[1] || 0); Tlm = mul([1, 0, 0, 1, nums[0] || 0, nums[1] || 0], Tlm); Tm = Tlm.slice(); exact = true; break;
          case 'Tm': if (nums.length === 6) { Tm = nums.slice(); Tlm = nums.slice(); exact = true; } break;
          case 'T*': Tlm = mul([1, 0, 0, 1, 0, -TL], Tlm); Tm = Tlm.slice(); exact = true; break;
          case 'Do': { // text inside a Form XObject
            if (depth >= 4) break; const nm = a.find(x => x.t === 'name'); if (!nm || !res) break;
            try {
              const xd = ctx.lookup(res.get(N('XObject'))); const ref = xd && xd.get(N(nm.v)); const fo = ref && ctx.lookup(ref);
              if (fo && fo.dict && /Image/.test(String(fo.dict.get(N('Subtype'))))) { if (hideSet && hideSet.has(imgN)) edits.push({ start: o.start, end: o.end, repl: '' }); imgN++; break; }
              if (!fo || !fo.dict || !/Form/.test(String(fo.dict.get(N('Subtype')))) || formsSeen.has(ref)) break; formsSeen.add(ref);
              const mArr = ctx.lookup(fo.dict.get(N('Matrix'))), m = mArr && mArr.size && mArr.size() === 6 ? [0, 1, 2, 3, 4, 5].map(k => { const v = ctx.lookup(mArr.get(k)); return v && v.asNumber ? v.asNumber() : 0; }) : [1, 0, 0, 1, 0, 0];
              const fres = ctx.lookup(fo.dict.get(N('Resources'))) || res, ffonts = fres && ctx.lookup(fres.get(N('Font'))) || fonts;
              const fb = decodeStream(PL, fo), r2 = run(fb, ffonts, fres, mul(m, ctm), depth + 1, fill);
              if (r2.edits.length) { const dict = {}; fo.dict.entries().forEach(([k, v]) => { const key = k.toString().slice(1); if (!/^(Length|Filter|DecodeParms|DL)$/.test(key)) dict[key] = v; }); ctx.assign(ref, ctx.flateStream(applyEdits(fb, r2.edits), dict)); st.formsPatched++; }
            } catch (e) { /* leave the form untouched */ }
            break; }
          case 'Tj': case 'TJ': case "'": case '"': {
            let pre = ''; if (o.op === "'" || o.op === '"') { if (o.op === '"') { Tw = nums[0] || 0; Tc = nums[1] || 0; pre = fmt(Tw) + ' Tw ' + fmt(Tc) + ' Tc '; } Tlm = mul([1, 0, 0, 1, 0, -TL], Tlm); Tm = Tlm.slice(); exact = true; pre += 'T* '; }
            const pos = origin(), { adv, known } = advanceOf(o.op, a), sc = pos.sc;
            const ux = pos.m[0], uy = pos.m[1]; const len = Math.hypot(ux, uy) || 1; const dx = ux / len, dy = uy / len;
            // glyph-level removal: only the glyphs lying inside a target are dropped; neighbours stay in place
            let hit = false;
            if (exact && known && font && fsz && Th) {
              const strs = o.op === 'TJ' ? a[0].v : [a[a.length - 1]], items = []; let cum = 0, any = false;
              for (const it of strs) {
                if (it.t === 'num') { items.push({ n: it.v }); cum -= it.v / 1000 * fsz * Th; continue; } if (it.t !== 'str') continue; const bs = it.v, step = font.bytes === 2 ? 2 : 1;
                for (let k = 0; k + step - 1 < bs.length; k += step) {
                  const code = step === 2 ? ((bs[k] << 8) | bs[k + 1]) : bs[k], g = (font.w(code) / 1000 * fsz + Tc + (step === 1 && code === 32 ? Tw : 0)) * Th, s0 = cum, mid = cum + g / 2; cum += g;
                  const gx = pos.x + dx * mid * sc, gy = pos.y + dy * mid * sc; let gh = false;
                  if (rr) { const cy = gy + fsz * sc * 0.3; gh = gx >= rr.x0 && gx <= rr.x1 && cy >= rr.y0 && cy <= rr.y1; }
                  else for (let t = 0; t < targets.length; t++) { const T = targets[t], ddx = gx - T.x, ddy = gy - T.y, along = ddx * dirx + ddy * diry, across = -ddx * diry + ddy * dirx, tol = 0.45 * (T.fs || 10);
                    if (Math.abs(across) <= tol && along >= -0.5 && along <= T.w + 0.5) { gh = true; done[t] += Math.abs(g * sc); if (!hits[t] && Tr !== 3) hits[t] = fill; break; } }
                  if (gh) any = true; items.push({ b: Array.from(bs.slice ? bs.slice(k, k + step) : Array.prototype.slice.call(bs, k, k + step)), g, gh });
                }
              }
              if (any) {
                hit = true; st.hits++; if (Tr === 3) st.invisible++;
                let out = '', buf = '', pend = 0; const flushNum = () => { if (pend) { out += fmt(pend) + ' '; pend = 0; } }, flushStr = () => { if (buf) { out += '<' + buf + '>'; buf = ''; } };
                for (const it of items) {
                  if (it.n !== undefined) { if (buf) flushStr(); pend += it.n; }
                  else if (it.gh) { if (buf) flushStr(); pend += -it.g / (fsz * Th) * 1000; }
                  else { if (!buf) flushNum(); buf += it.b.map(v => v.toString(16).padStart(2, '0')).join(''); }
                }
                flushStr(); flushNum();
                edits.push({ start: o.start, end: o.end, repl: pre + '[' + out.trim() + '] TJ' });
              }
            }
            if (known) { Tm = mul([1, 0, 0, 1, adv, 0], Tm); } else exact = false;
            break; }
          default: break;
        }
      }
      return { edits };
    }
    const bytes = syncStreamBytes(PL, doc, page); let res = page.node.Resources && page.node.Resources(); if (!res && page.node.getInheritableAttribute) res = page.node.getInheritableAttribute(N('Resources')); res = ctx.lookup(res);
    const fonts = res && ctx.lookup(res.get(N('Font')));
    const { edits } = run(bytes, fonts, res, [1, 0, 0, 1, 0, 0], 0, '#000000');
    if (edits.length) { const stream = ctx.flateStream(applyEdits(bytes, edits)); page.node.set(N('Contents'), ctx.obj([ctx.register(stream)]));
      page.contentStream = undefined; page.contentStreamRef = undefined; } // pdf-lib caches its append-stream; it is no longer part of Contents, so later drawing would be lost
    if (!edits.length && !st.formsPatched) return { removed: 0, total: targets.length };
    let removed = 0; targets.forEach((T, t) => { if (T.w <= 0 || done[t] >= 0.9 * T.w) removed++; }); // counts as removed when >= 90% of its width was deleted
    return { removed, total: targets.length, ops: edits.length, invisible: st.invisible, hits: st.hits, forms: st.formsPatched, colors: hits.slice(), color: hits.find(c => c) || null };
  }
  function syncStreamBytes(PL, doc, page) {
    const ctx = doc.context; let c = ctx.lookup(page.node.get(PL.PDFName.of('Contents'))); const parts = [];
    if (c instanceof PL.PDFArray) { for (let k = 0; k < c.size(); k++) parts.push(decodeStream(PL, ctx.lookup(c.get(k)))); } else if (c) parts.push(decodeStream(PL, c));
    let len = 0; parts.forEach(q => len += q.length + 1); const out = new Uint8Array(len); let o = 0; parts.forEach(q => { out.set(q, o); o += q.length; out[o++] = 10; }); return out;
  }
  C._tokenize = tokenize;

  return C;
});
