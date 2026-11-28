/* Pexulon AI QR encoder — byte mode, versions 1-10, ECC L/M/Q/H. Works in browser (window.TNQR) and Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TNQR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ECC = { L: { f: 1, i: 0 }, M: { f: 0, i: 1 }, Q: { f: 3, i: 2 }, H: { f: 2, i: 3 } };
  const ECC_PER_BLOCK = [
    [7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
    [10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
    [13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
    [17, 28, 22, 16, 22, 28, 26, 26, 24, 28]];
  const NUM_BLOCKS = [
    [1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
    [1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
    [1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
    [1, 1, 2, 4, 4, 4, 5, 6, 8, 8]];
  const MAXV = 10;

  function rawModules(v) {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) { const na = Math.floor(v / 7) + 2; r -= (25 * na - 10) * na - 55; if (v >= 7) r -= 36; }
    return r;
  }
  function dataCodewords(v, e) { return Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[e][v - 1] * NUM_BLOCKS[e][v - 1]; }
  function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; }
  function rsDivisor(deg) {
    const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
    for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gfMul(root, 2); }
    return r;
  }
  function rsRemainder(data, div) {
    const res = new Array(div.length).fill(0);
    for (const b of data) { const f = b ^ res.shift(); res.push(0); div.forEach((c, i) => { res[i] ^= gfMul(c, f); }); }
    return res;
  }
  function alignPositions(v) {
    if (v === 1) return [];
    const n = Math.floor(v / 7) + 2, size = v * 4 + 17;
    const step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
    const r = [6]; for (let p = size - 7; r.length < n; p -= step) r.splice(1, 0, p); return r;
  }
  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  function encode(text, eccName) {
    const e = ECC[eccName || 'M'] || ECC.M, ei = e.i;
    const bytes = new TextEncoder().encode(text);
    let ver = 0;
    for (let v = 1; v <= MAXV; v++) {
      const cc = v < 10 ? 8 : 16, need = 4 + cc + bytes.length * 8;
      if (bytes.length < (1 << cc) && need <= dataCodewords(v, ei) * 8) { ver = v; break; }
    }
    if (!ver) throw new Error('Text too long for this QR generator (max ~270 characters at low error correction). Try shorter text or lower error correction.');
    const size = ver * 4 + 17;
    // bit stream
    const bits = []; const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    const cap = dataCodewords(ver, ei) * 8;
    put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let k = 0; k < 8; k++) b = (b << 1) | bits[i + k]; data.push(b); }
    // blocks + ECC + interleave
    const nb = NUM_BLOCKS[ei][ver - 1], eccLen = ECC_PER_BLOCK[ei][ver - 1], raw = Math.floor(rawModules(ver) / 8);
    const nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(eccLen);
    const blocks = []; let k = 0;
    for (let i = 0; i < nb; i++) {
      const dl = shortLen - eccLen + (i < nShort ? 0 : 1), d = data.slice(k, k + dl); k += dl;
      const ec = rsRemainder(d, div); if (i < nShort) d.push(0); blocks.push(d.concat(ec));
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) all.push(b[i]); });
    // matrix
    const mod = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const setF = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const ap = alignPositions(ver);
    ap.forEach((ax, i) => ap.forEach((ay, j) => { if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
    const formatBits = (mask) => {
      const d = (e.f << 3) | mask; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setF(8, i, bit(b, i)); setF(8, 7, bit(b, 6)); setF(8, 8, bit(b, 7)); setF(7, 8, bit(b, 8)); for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(b, i)); for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(b, i)); setF(8, size - 8, true);
    };
    formatBits(0);
    if (ver >= 7) { let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25); const b = (ver << 12) | rem; for (let i = 0; i < 18; i++) { const c = bit(b, i), a = size - 11 + i % 3, bb = Math.floor(i / 3); setF(a, bb, c); setF(bb, a, c); } }
    // place codewords
    let bi = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && bi < all.length * 8) { mod[y][x] = bit(all[bi >>> 3], 7 - (bi & 7)); bi++; }
      }
    }
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
    const penalty = () => {
      let p = 0; const lines = [];
      for (let y = 0; y < size; y++) lines.push(mod[y].map(b => b ? '1' : '0').join(''));
      for (let x = 0; x < size; x++) { let s = ''; for (let y = 0; y < size; y++) s += mod[y][x] ? '1' : '0'; lines.push(s); }
      lines.forEach(s => { const runs = s.match(/0+|1+/g); runs.forEach(r => { if (r.length >= 5) p += 3 + r.length - 5; }); for (const pat of ['10111010000', '00001011101']) { let i = -1; while ((i = s.indexOf(pat, i + 1)) >= 0) p += 40; } });
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
      let dark = 0; mod.forEach(r => r.forEach(b => { if (b) dark++; })); const tot = size * size; p += (Math.ceil(Math.abs(dark * 20 - tot * 10) / tot) - 1) * 10;
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) { applyMask(m); formatBits(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } applyMask(m); }
    applyMask(best); formatBits(best);
    return { size, version: ver, mask: best, modules: mod };
  }
  function toSvg(qr, opts = {}) {
    const q = opts.quiet == null ? 4 : opts.quiet, fg = opts.fg || '#000', bg = opts.bg || '#fff', n = qr.size + q * 2; let d = '';
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) d += `M${x + q},${y + q}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
  }
  function toCanvas(qr, canvas, px, opts = {}) {
    const q = opts.quiet == null ? 4 : opts.quiet, n = qr.size + q * 2, scale = Math.max(1, Math.floor(px / n)); canvas.width = canvas.height = n * scale;
    const c = canvas.getContext('2d'); c.fillStyle = opts.bg || '#fff'; c.fillRect(0, 0, canvas.width, canvas.height); c.fillStyle = opts.fg || '#000';
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) c.fillRect((x + q) * scale, (y + q) * scale, scale, scale);
    return canvas;
  }
  return { encode, toSvg, toCanvas };
});
