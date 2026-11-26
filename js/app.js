/* ToolNest core: registry, router, UI helpers, lazy libraries, AI client */
(function () {
  'use strict';
  const TN = window.TN = { tools: [], byId: {}, ui: {}, libs: {}, ai: {} };
  const SITE = 'ToolNest';

  TN.cats = [
    { id: 'ai', name: 'AI Studio', icon: '✨', tint: '#e3e0fb', blurb: 'Free AI helpers' },
    { id: 'pdf', name: 'PDF', icon: '📄', tint: '#fbdad3', blurb: 'Edit text, merge, split, compress, sign' },
    { id: 'image', name: 'Image', icon: '🖼️', tint: '#d9e8fb', blurb: 'Compress, resize, convert, QR, cleanup' },
    { id: 'calc', name: 'Calculators', icon: '🧮', tint: '#fbeccb', blurb: 'Money, health, dates, math' },
    { id: 'convert', name: 'Converters', icon: '🔁', tint: '#dcf1d8', blurb: 'Units, bases, time zones, numbers' },
    { id: 'electronics', name: 'Electronics', icon: '🔌', tint: '#e5dcf7', blurb: 'Resistors, Ohm, logic, subnets' },
    { id: 'text', name: 'Text', icon: '✍️', tint: '#f9dcea', blurb: 'Count, case, diff, markdown' },
    { id: 'dev', name: 'Developer', icon: '💻', tint: '#d6eef0', blurb: 'JSON, regex, encode, timestamps' },
    { id: 'security', name: 'Security', icon: '🛡️', tint: '#f7e0d0', blurb: 'Passwords, hashes, 2FA, phishing' }
  ];
  TN.catById = Object.fromEntries(TN.cats.map(c => [c.id, c]));

  TN.register = function (def) {
    if (TN.byId[def.id]) throw new Error('Duplicate tool id ' + def.id);
    def.tags = (def.tags || '').toLowerCase(); TN.tools.push(def); TN.byId[def.id] = def;
  };

  /* ── storage (never throws) ── */
  TN.store = {
    get(k, d) { try { const v = localStorage.getItem('tn:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tn:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del(k) { try { localStorage.removeItem('tn:' + k); } catch (e) {} }
  };

  /* ── tiny DOM helper ── */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    for (const k in (attrs || {})) {
      const v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'for') el.htmlFor = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled' || k === 'indeterminate') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    (function add(list) { for (const c of list) { if (c == null || c === false) continue; if (Array.isArray(c)) add(c); else el.append(c.nodeType ? c : document.createTextNode(String(c))); } })(kids);
    return el;
  }
  TN.h = h;
  const $ = (s, r = document) => r.querySelector(s);
  TN.$ = $;

  /* ── UI kit ── */
  const ui = TN.ui;
  ui.fmtBytes = function (n) { if (n < 1024) return n + ' B'; const u = ['KB', 'MB', 'GB']; let i = -1; do { n /= 1024; i++; } while (n >= 1024 && i < 2); return n.toFixed(n < 10 ? 2 : 1) + ' ' + u[i]; };
  ui.field = (label, ctrl, hint) => h('div', { class: 'field' }, label ? h('label', {}, label) : null, ctrl, hint ? h('div', { class: 'hint' }, hint) : null);
  ui.text = (o = {}) => h('input', { type: o.type || 'text', value: o.value ?? '', placeholder: o.placeholder || '', class: o.mono ? 'mono' : '', inputmode: o.inputmode, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: o.maxlength, oninput: o.oninput, onchange: o.onchange });
  ui.num = (o = {}) => h('input', { type: 'number', value: o.value ?? '', placeholder: o.placeholder || '', min: o.min, max: o.max, step: o.step || 'any', inputmode: 'decimal', oninput: o.oninput, onchange: o.onchange });
  ui.area = (o = {}) => h('textarea', { value: o.value ?? '', placeholder: o.placeholder || '', rows: o.rows || 5, class: o.mono ? 'mono' : '', spellcheck: o.spell ? 'true' : 'false', oninput: o.oninput, readonly: o.readonly });
  ui.select = function (options, value, onchange) {
    const s = h('select', { onchange }, options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(v) === String(value) }, l); }));
    s.value = value; return s;
  };
  ui.check = (label, checked, onchange) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!checked, onchange }), label);
  ui.btn = (label, onclick, cls = '') => h('button', { class: 'btn ' + cls, type: 'button', onclick }, label);
  ui.row = (...k) => h('div', { class: 'row' }, k);
  ui.btns = (...k) => h('div', { class: 'btns' }, k);
  ui.panel = (title, ...k) => h('section', { class: 'panel' }, title ? h('h3', {}, title) : null, k);
  ui.cols = (n, ...k) => h('div', { class: 'cols ' + (n === 3 ? 'three' : 'two') }, k);
  ui.note = (t, type = '') => h('div', { class: 'note ' + type }, t);
  ui.stat = (label, value, big) => h('div', { class: 'stat' + (big ? ' big' : '') }, h('b', {}, value), h('span', {}, label));
  ui.stats = (list) => h('div', { class: 'stats' }, list.filter(Boolean).map(s => ui.stat(...s)));
  ui.table = (heads, rows) => h('div', { class: 'scroll-x' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, heads.map(x => h('th', {}, x)))), h('tbody', {}, rows.map(r => h('tr', {}, r.map(c => h('td', {}, c)))))));
  ui.toast = function (msg) {
    let t = $('#toast'); if (!t) { t = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200);
  };
  ui.copyText = async function (text) {
    try { await navigator.clipboard.writeText(text); ui.toast('Copied'); }
    catch (e) { const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }, text); document.body.append(ta); ta.select(); try { document.execCommand('copy'); ui.toast('Copied'); } catch (_) { ui.toast('Copy failed — select and copy manually'); } ta.remove(); }
  };
  ui.copy = (get, label = 'Copy') => h('button', { class: 'btn secondary sm copy', type: 'button', onclick: () => ui.copyText(typeof get === 'function' ? get() : get) }, label);
  ui.out = function (content, o = {}) {
    const box = h('div', { class: 'out' + (o.prose ? ' prose' : '') });
    const set = c => { box.replaceChildren(); if (c == null || c === '') { box.append(h('span', { style: { color: 'var(--ink-3)' } }, o.empty || '—')); return; } box.append(c.nodeType ? c : document.createTextNode(String(c))); if (o.copy !== false) box.append(ui.copy(() => box._text ?? box.textContent.replace(/Copy$/, ''))); };
    box.set = (c, rawText) => { box._text = rawText; set(c); }; box.set(content); return box;
  };
  ui.download = function (data, filename, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob); const a = h('a', { href: url, download: filename, style: { display: 'none' } }); document.body.append(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
  };
  ui.progress = function () { const bar = h('i'); const el = h('div', { class: 'progress', style: { display: 'none' } }, bar); return { el, set(p) { el.style.display = p == null ? 'none' : ''; bar.style.width = Math.round((p || 0) * 100) + '%'; } }; };
  ui.tabs = function (defs, active) {
    const body = h('div'), bar = h('div', { class: 'tabs', role: 'tablist' }); let cur = active || defs[0].id;
    const draw = () => { bar.replaceChildren(...defs.map(d => h('button', { class: 'tab', role: 'tab', 'aria-selected': String(d.id === cur), onclick: () => { cur = d.id; draw(); } }, d.label))); body.replaceChildren(defs.find(d => d.id === cur).render()); };
    draw(); return h('div', {}, bar, body);
  };
  ui.drop = function (o = {}) {
    const input = h('input', { type: 'file', accept: o.accept || '', multiple: !!o.multiple, style: { display: 'none' }, onchange: () => { if (input.files.length) o.onFiles([...input.files]); input.value = ''; } });
    const box = h('div', { class: 'drop', tabindex: 0, role: 'button', 'aria-label': o.label || 'Choose files', onclick: () => input.click(), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } } },
      h('b', {}, o.label || 'Tap to choose a file'), h('span', {}, o.sub || 'or drag and drop here — nothing is uploaded'), input);
    ['dragenter', 'dragover'].forEach(ev => box.addEventListener(ev, e => { e.preventDefault(); box.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => box.addEventListener(ev, e => { e.preventDefault(); box.classList.remove('over'); }));
    box.addEventListener('drop', e => { const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) o.onFiles(o.multiple ? fs : [fs[0]]); });
    return box;
  };
  ui.fileList = function (files, { onRemove, onMove } = {}) {
    return h('ul', { class: 'filelist' }, files.map((f, i) => h('li', {}, h('span', { class: 'nm', title: f.name }, (i + 1) + '. ' + f.name), h('span', { class: 'sz' }, ui.fmtBytes(f.size)),
      onMove ? [h('button', { class: 'btn secondary sm', 'aria-label': 'Move up', onclick: () => onMove(i, -1), disabled: i === 0 }, '↑'), h('button', { class: 'btn secondary sm', 'aria-label': 'Move down', onclick: () => onMove(i, 1), disabled: i === files.length - 1 }, '↓')] : null,
      onRemove ? h('button', { class: 'btn danger sm', 'aria-label': 'Remove', onclick: () => onRemove(i) }, '✕') : null)));
  };
  // run fn when any control changes (and once now)
  ui.live = function (controls, fn) { controls.forEach(c => { c.addEventListener('input', fn); c.addEventListener('change', fn); }); fn(); };
  ui.num2 = (v, d = 2) => (isFinite(v) ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: d }) : '—');
  ui.money = (v) => isFinite(v) ? '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 }) : '—';
  ui.val = el => { const v = el.value.trim(); return v === '' ? NaN : Number(v); };
  ui.baseName = n => n.replace(/\.[^.]+$/, '');
  ui.sleep = ms => new Promise(r => setTimeout(r, ms));
  ui.busy = async function (btn, fn) { const old = btn.textContent; btn.disabled = true; btn.textContent = 'Working…'; try { return await fn(); } catch (e) { console.error(e); ui.toast('Error: ' + (e.message || e)); } finally { btn.disabled = false; btn.textContent = old; } };

  /* ── file helpers ── */
  TN.file = {
    buf: f => f.arrayBuffer(), text: f => f.text(),
    img: f => new Promise((res, rej) => { const u = URL.createObjectURL(f), im = new Image(); im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(u), 10000); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Could not read image: ' + f.name)); }; im.src = u; }),
    canvasBlob: (c, type = 'image/png', q) => new Promise(r => c.toBlob(r, type, q))
  };

  /* ── lazy libraries ── */
  const base = () => new URL('./', location.href.split('#')[0]).href;
  const scripts = {};
  TN.loadScript = src => scripts[src] || (scripts[src] = new Promise((res, rej) => { const s = h('script', { src: base() + src, onload: res, onerror: () => { delete scripts[src]; rej(new Error('Could not load ' + src)); } }); document.head.append(s); }));
  TN.libs.pdfLib = async () => { await TN.loadScript('js/lib/pdf-lib.min.js'); return window.PDFLib; };
  TN.libs.jszip = async () => { await TN.loadScript('js/lib/jszip.min.js'); return window.JSZip; };
  TN.libs.marked = async () => { await TN.loadScript('js/lib/marked.min.js'); return window.marked; };
  let pdfjsP;
  TN.libs.pdfjs = () => pdfjsP || (pdfjsP = import(base() + 'js/lib/pdfjs/pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = base() + 'js/lib/pdfjs/pdf.worker.min.mjs'; return m; }).catch(e => { pdfjsP = null; throw e; }));
  TN.libs.openPdf = async function (data, password) {
    const pdfjs = await TN.libs.pdfjs(); const b = base() + 'js/lib/pdfjs/';
    const task = pdfjs.getDocument({ data: data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice ? data.slice(0) : data), cMapUrl: b + 'cmaps/', cMapPacked: true, standardFontDataUrl: b + 'standard_fonts/', wasmUrl: b + 'wasm/', password, isEvalSupported: false, fontExtraProperties: true });
    return task.promise;
  };

  /* ── AI client (server function by default, or the visitor's own free key) ── */
  const AI_DEFAULT = { mode: 'server', key: '', model: '', gemini: 'gemini-flash-latest', groq: 'openai/gpt-oss-20b' };
  TN.ai.cfg = () => Object.assign({}, AI_DEFAULT, TN.store.get('ai', {}));
  TN.ai.mode = () => { const c = TN.ai.cfg(); return c.mode !== 'server' && c.key ? c.mode : 'server'; };
  TN.ai.ask = async function ({ system = '', messages, prompt, maxTokens = 1500, temperature = 0.4, fast = false }) {
    messages = messages || [{ role: 'user', content: prompt }];
    const c = TN.ai.cfg(); let res, data;
    if (c.mode === 'gemini' && c.key) {
      const model = c.model || c.gemini;
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': c.key },
        body: JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined, contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: maxTokens, temperature } })
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(aiErr(res.status, data?.error?.message));
      return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim() || (() => { throw new Error('The AI returned an empty answer (it may have been filtered). Try rephrasing.'); })();
    }
    if (c.mode === 'groq' && c.key) {
      const model = c.model || c.groq;
      res = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + c.key },
        body: JSON.stringify({ model, messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages], max_tokens: maxTokens, temperature }) });
      data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(aiErr(res.status, data?.error?.message));
      return (data.choices?.[0]?.message?.content || '').trim();
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 11500);
    try {
      res = await fetch(window.TN_AI_URL || '/.netlify/functions/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system, messages: messages.slice(-8).map(m => ({ role: m.role, content: String(m.content || '').slice(-12000) })), maxTokens: Math.min(maxTokens, 1100), temperature, fast }), signal: controller.signal });
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('AI request took too long. Please try a shorter question or try again shortly.');
      throw new Error('Could not reach the AI service. Check your internet connection.');
    } finally { clearTimeout(timer); }
    data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404 || res.status === 405) throw new Error('The AI helper is not set up on this site yet. You can add your own free key in Settings (⚙).');
      throw new Error(data.error || aiErr(res.status));
    }
    return (data.text || '').trim();
  };
  function aiErr(status, msg) {
    if (status === 429) return 'Free-tier limit reached. Wait a minute and try again.';
    if (status === 401 || status === 403) return 'The AI key was rejected. Check it in Settings (⚙).';
    return 'AI error (' + status + ')' + (msg ? ': ' + String(msg).slice(0, 160) : '');
  }
  TN.ai.json = function (text) { // tolerant JSON extraction from model output
    let t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return JSON.parse(t); } catch (e) { const m = t.match(/[\[{][\s\S]*[\]}]/); if (m) return JSON.parse(m[0]); throw new Error('The AI did not return valid data. Try again.'); }
  };

  /* ── theme ── */
  function applyTheme() { const t = TN.store.get('theme', 'auto'); if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t; }
  applyTheme();

  /* ── views ── */
  const app = () => $('#app');
  let cleanup = null, deferredInstall = null;
  const recents = () => TN.store.get('recent', []);
  const favs = () => TN.store.get('favs', []);
  const isNew = t => !!t.isNew;

  function toolCard(t) {
    const cat = TN.catById[t.cat];
    return h('a', { class: 'tcard', href: '#/t/' + t.id },
      h('div', { class: 'ticon', style: { '--tint': cat.tint } }, t.icon || cat.icon),
      h('div', {}, h('h3', {}, t.name, isNew(t) ? h('span', { class: 'tag-new' }, 'NEW') : null), h('p', {}, t.desc)),
      favs().includes(t.id) ? h('span', { class: 'fav', title: 'Favourite' }, '★') : null);
  }
  function score(t, q) {
    const n = t.name.toLowerCase(), d = t.desc.toLowerCase(); let s = 0;
    for (const w of q) {
      let ws = 0; if (n.startsWith(w)) ws = 6; else if (n.includes(w)) ws = 4; else if (t.tags.includes(w)) ws = 3; else if (d.includes(w)) ws = 1; else if (TN.catById[t.cat].name.toLowerCase().includes(w)) ws = 1;
      if (!ws) return 0; s += ws;
    }
    return s;
  }
  function askForm() {
    const inp = h('input', { type: 'text', placeholder: 'Ask AI anything…', 'aria-label': 'Ask AI', autocomplete: 'off', maxlength: 2000 });
    return h('form', { class: 'askbox', onsubmit: e => { e.preventDefault(); const v = inp.value.trim(); if (v) TN.store.set('askq', v); location.hash = '#/t/ai-chat'; } }, inp, h('button', { type: 'submit' }, 'Ask AI ✨'));
  }
  function showHome(catId) {
    document.body.classList.remove('editor-mode'); document.title = SITE + ' — free tools that run in your browser';
    const results = h('div'), chips = h('div', { class: 'chips', role: 'navigation', 'aria-label': 'Categories' });
    const search = h('input', { type: 'search', placeholder: 'Search 90+ tools — e.g. "edit pdf", "emi", "qr", "resistor"', 'aria-label': 'Search tools', autocomplete: 'off', value: TN.store.get('q', '') });
    function draw() {
      const q = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean); results.replaceChildren();
      chips.replaceChildren(h('a', { class: 'chip', href: '#/', 'aria-current': String(!catId) }, 'All'), ...TN.cats.map(c => h('a', { class: 'chip', href: '#/c/' + c.id, 'aria-current': String(catId === c.id) }, c.icon + ' ' + c.name)));
      if (q.length) {
        const found = TN.tools.map(t => [t, score(t, q)]).filter(x => x[1] > 0 && (!catId || x[0].cat === catId)).sort((a, b) => b[1] - a[1]).map(x => x[0]);
        results.append(h('div', { class: 'section-h' }, h('h2', {}, found.length + ' result' + (found.length === 1 ? '' : 's')), h('span', {}, 'for “' + search.value.trim() + '”')),
          found.length ? h('div', { class: 'grid' }, found.map(toolCard)) : h('div', { class: 'empty' }, 'Nothing matches. Try a simpler word like “pdf”, “image”, “loan” or “hash”.'));
        return;
      }
      if (!catId) {
        const aiT = TN.tools.filter(x => x.cat === 'ai').sort((x, y) => (y.id === 'ai-chat') - (x.id === 'ai-chat'));
        if (aiT.length) results.append(h('div', { class: 'section-h' }, h('h2', {}, '✨ AI Studio'), h('span', {}, aiT.length + ' free AI tools')), h('div', { class: 'aigrid' }, aiT.map((x, i) => { const c = toolCard(x); c.classList.add('ai'); if (i === 0) c.classList.add('first'); return c; })));
        results.append(h('section', { class: 'pdfspot' },
          h('div', {}, h('span', { class: 'eyebrow', style: { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'transparent' } }, '📄 Flagship tool'), h('h2', { style: { margin: '10px 0 0' } }, 'Edit the text inside any PDF'),
            h('p', {}, 'Click a line, retype it, and download. The original text is truly removed, with no white patches, and the font is matched automatically from 20+ families.'),
            h('ul', {}, ['Auto font matching', 'Add text, images, signatures', 'Private: runs on your phone'].map(s => h('li', {}, s))),
            h('a', { class: 'cta', href: '#/t/pdf-editor' }, 'Open PDF Editor →')),
          h('div', { class: 'mock', 'aria-hidden': 'true' }, h('div', { class: 'bar' }, h('i'), h('i'), h('i')), h('div', { class: 'pg' }, h('b', {}, 'Invoice #1042'), 'Total due: ', h('s', {}, '₹ 4,500'), ' ', h('ins', {}, '₹ 5,250')), h('span', { class: 'pill' }, '⬇ Download PDF'))));
        const pop = ['pdf-merge', 'pdf-split', 'img-compress', 'emi', 'qr', 'password-strength'].map(id => TN.byId[id]).filter(Boolean);
        if (pop.length) results.append(h('div', { class: 'section-h' }, h('h2', {}, '🔥 Popular')), h('div', { class: 'grid' }, pop.map(toolCard)));
        const rec = recents().map(id => TN.byId[id]).filter(Boolean).slice(0, 6), fv = favs().map(id => TN.byId[id]).filter(Boolean);
        if (fv.length) results.append(h('div', { class: 'section-h' }, h('h2', {}, '★ Your favourites')), h('div', { class: 'grid' }, fv.map(toolCard)));
        if (rec.length) results.append(h('div', { class: 'section-h' }, h('h2', {}, 'Recently used')), h('div', { class: 'grid' }, rec.map(toolCard)));
      }
      (catId ? TN.cats.filter(c => c.id === catId) : TN.cats.filter(c => c.id !== 'ai')).forEach(c => {
        const list = TN.tools.filter(t => t.cat === c.id); if (!list.length) return;
        results.append(h('div', { class: 'section-h' }, h('h2', {}, c.icon + ' ' + c.name), h('span', {}, list.length + ' tools · ' + c.blurb)), h('div', { class: 'grid' }, list.map(toolCard)));
      });
    }
    search.addEventListener('input', () => { TN.store.set('q', search.value); draw(); });
    const aiMode = TN.ai.mode();
    app().replaceChildren(h('div', { class: 'wrap' },
      h('section', { class: 'hero2' },
        h('span', { class: 'eyebrow' }, '✨ Free AI + 90 tools'),
        h('h1', {}, 'Ask AI. Edit PDFs. Get it done.'),
        h('p', {}, 'Free AI helpers and 90+ everyday tools in one place. No sign-up, and your files stay on your device.'),
        askForm(),
        h('div', { class: 'asksugg' }, [['Summarize', 'ai-summarize'], ['Translate', 'ai-translate'], ['Chat with PDF', 'ai-pdf-chat'], ['Write email', 'ai-email'], ['Quiz maker', 'ai-quiz']].map(([n, id]) => h('a', { href: '#/t/' + id }, n))),
        h('div', { class: 'badges' }, h('span', { class: 'badge' }, '🔒 Files never uploaded'), h('span', { class: 'badge' }, '∞ No daily limits'))),
      h('div', { class: 'searchbox' }, h('span', { class: 'mag', 'aria-hidden': 'true' }, '🔍'), search), chips, results));
    draw();
  }

  function showTool(id) {
    const t = TN.byId[id]; if (!t) { app().replaceChildren(h('div', { class: 'wrap empty' }, h('h2', {}, 'Tool not found'), h('p', {}, h('a', { href: '#/' }, '← Back to all tools')))); return; }
    const cat = TN.catById[t.cat]; document.title = t.name + ' — ' + SITE;
    TN.store.set('recent', [id, ...recents().filter(x => x !== id)].slice(0, 12));
    const root = h('div', { class: 'tool-root' });
    const isFav = () => favs().includes(id);
    const favBtn = h('button', { class: 'icon-btn', 'aria-label': 'Favourite', title: 'Favourite', onclick: () => { TN.store.set('favs', isFav() ? favs().filter(x => x !== id) : [...favs(), id]); favBtn.textContent = isFav() ? '★' : '☆'; } }, isFav() ? '★' : '☆');
    const shareBtn = h('button', { class: 'icon-btn', 'aria-label': 'Share link', title: 'Share link', onclick: async () => { const url = location.href; if (navigator.share) { try { await navigator.share({ title: t.name, url }); } catch (e) {} } else ui.copyText(url); } }, '↗');
    const privacy = t.ai ? h('span', { class: 'badge warn' }, '✨ Sends your text to a free AI service') : h('span', { class: 'badge' }, '🔒 Runs in your browser — nothing is uploaded');
    if (t.full) { document.body.classList.add('editor-mode'); app().replaceChildren(root); }
    else {
      document.body.classList.remove('editor-mode');
      app().replaceChildren(h('div', { class: 'wrap' },
        h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/' }, 'All tools'), '›', h('a', { href: '#/c/' + cat.id }, cat.name)),
        h('div', { class: 'thead' }, h('div', { class: 'ticon', style: { '--tint': cat.tint } }, t.icon || cat.icon), h('div', { style: { flex: 1, minWidth: 0 } }, h('h1', {}, t.name), h('p', {}, t.desc)), h('div', { style: { display: 'flex', gap: '8px' } }, favBtn, shareBtn)),
        h('div', { class: 'privacy' }, privacy, t.note ? h('span', { class: 'badge neutral' }, t.note) : null), root,
        related(t)));
    }
    try { const r = t.render(root); if (typeof r === 'function') cleanup = r; }
    catch (e) { console.error(e); root.append(ui.panel('Something went wrong', h('p', {}, String(e.message || e)), ui.note('Try reloading the page. If it keeps happening, tell the site owner which tool and what you did.', 'bad'))); }
  }
  function related(t) {
    const rel = TN.tools.filter(x => x.cat === t.cat && x.id !== t.id).slice(0, 4); if (!rel.length) return null;
    return h('div', {}, h('div', { class: 'section-h' }, h('h2', {}, 'More ' + TN.catById[t.cat].name + ' tools')), h('div', { class: 'grid' }, rel.map(toolCard)));
  }

  function showSettings() {
    document.body.classList.remove('editor-mode'); document.title = 'Settings — ' + SITE;
    const c = TN.ai.cfg(), th = TN.store.get('theme', 'auto');
    const mode = ui.select([['server', 'Site default (free, no key needed if the owner set it up)'], ['gemini', 'My own Google Gemini key'], ['groq', 'My own Groq key']], c.mode);
    const key = ui.text({ type: 'password', value: c.key, placeholder: 'Paste API key (stays in this browser only)', mono: true });
    const model = ui.text({ value: c.model, placeholder: 'Optional model name override', mono: true });
    const status = h('div', { class: 'hint' });
    const save = () => { TN.store.set('ai', { mode: mode.value, key: key.value.trim(), model: model.value.trim() }); ui.toast('Saved'); };
    app().replaceChildren(h('div', { class: 'wrap' }, h('nav', { class: 'crumbs' }, h('a', { href: '#/' }, 'All tools'), '›', 'Settings'),
      h('div', { class: 'thead' }, h('div', { class: 'ticon' }, '⚙️'), h('div', {}, h('h1', {}, 'Settings'))),
      ui.panel('Appearance', ui.field('Theme', ui.select([['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']], th, e => { TN.store.set('theme', e.target.value); applyTheme(); }))),
      ui.panel('AI tools', ui.note('AI tools are optional. Everything else on this site works without them and never sends your data anywhere. When you use an AI tool, the text you type goes to the AI provider you choose here.'),
        ui.field('Where should AI requests go?', mode), ui.field('API key', key, 'Free keys: Google AI Studio (Gemini) or console.groq.com (Groq). The key is saved only in this browser (localStorage), and sent only to that provider.'), ui.field('Model', model, 'Leave blank to use the default (Gemini: ' + c.gemini + ', Groq: ' + c.groq + ').'),
        ui.btns(ui.btn('Save', save), ui.btn('Test AI', async e => { save(); status.textContent = 'Testing…'; try { const r = await TN.ai.ask({ prompt: 'Reply with exactly: OK', maxTokens: 20 }); status.textContent = '✅ Working: ' + r.slice(0, 60); } catch (er) { status.textContent = '❌ ' + er.message; } }, 'secondary')), status),
      ui.panel('Your data', h('p', {}, 'Favourites, recent tools and settings are stored only in this browser. No account, no analytics, no cookies set by this site.'), ui.btns(ui.btn('Clear saved data', () => { try { Object.keys(localStorage).filter(k => k.startsWith('tn:')).forEach(k => localStorage.removeItem(k)); } catch (e) {} ui.toast('Cleared'); showSettings(); }, 'danger')))));
  }

  function showAbout() {
    document.body.classList.remove('editor-mode'); document.title = 'About — ' + SITE;
    app().replaceChildren(h('div', { class: 'wrap' }, h('nav', { class: 'crumbs' }, h('a', { href: '#/' }, 'All tools'), '›', 'About'), h('div', { class: 'thead' }, h('div', { class: 'ticon' }, 'ℹ️'), h('div', {}, h('h1', {}, 'About ToolNest'))),
      ui.panel('', h('p', {}, 'ToolNest is a free toolbox that runs in your browser. PDF, image, text, calculator and developer tools process your files on your own device — nothing is uploaded to a server.'),
        h('p', {}, 'AI tools are the one exception: they send the text you type to a free AI provider so it can answer. They are labelled with ✨ and are optional.'),
        h('h3', { style: { marginTop: '14px' } }, 'Open-source parts'),
        h('p', {}, 'PDF editing uses pdf-lib (MIT) and PDF.js (Apache-2.0). ZIP files use JSZip (MIT). Markdown preview uses marked (MIT). The QR code encoder is written from the QR specification and tested against a decoder.'))));
  }

  function route() {
    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    const parts = (location.hash.slice(1) || '/').split('/'); const kind = parts[1], arg = decodeURIComponent(parts[2] || '');
    if (kind === 't') showTool(arg); else if (kind === 'c' && TN.catById[arg]) showHome(arg); else if (kind === 'settings') showSettings(); else if (kind === 'about') showAbout(); else showHome();
    window.scrollTo(0, 0);
  }

  function chrome() {
    const themeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Toggle theme', title: 'Light / dark', onclick: () => { const dark = getComputedStyle(document.documentElement).colorScheme === 'dark'; TN.store.set('theme', dark ? 'light' : 'dark'); applyTheme(); } }, '🌓');
    const install = h('button', { class: 'icon-btn', style: { display: 'none' }, title: 'Install app', onclick: async () => { if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; install.style.display = 'none'; } } }, '⬇ Install');
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; install.style.display = ''; });
    $('#topbar').replaceChildren(h('div', { class: 'wrap' }, h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark' }, '⌂'), SITE), h('span', { class: 'spacer' }), install, h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings', title: 'Settings' }, '⚙'), themeBtn));
    $('#footer').replaceChildren(h('div', { class: 'wrap' }, h('span', {}, '© ' + new Date().getFullYear() + ' ' + SITE + ' · Free tools, no sign-up'), h('span', {}, h('a', { href: '#/about' }, 'About & privacy'), ' · ', h('a', { href: '#/settings' }, 'Settings'))));
    document.addEventListener('keydown', e => { if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { const s = $('.searchbox input'); if (s) { e.preventDefault(); s.focus(); } } });
  }

  TN.start = function () {
    chrome(); window.addEventListener('hashchange', route); route();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  };
})();
