/* Developer tools */
(function () {
  'use strict';
  const { h, ui } = TN, L = TNLogic;

  TN.register({ id: 'json', cat: 'dev', icon: '{ }', name: 'JSON Formatter & Validator', desc: 'Pretty-print, minify and validate JSON with error location.', tags: 'format beautify minify lint parse api', render(root) {
    const ta = ui.area({ rows: 12, mono: true, value: '{"name":"ToolNest","tools":[1,2,3],"free":true}' }), out = ui.out(''), msg = h('div', { class: 'hint' }), indent = ui.select([[2, '2 spaces'], [4, '4 spaces'], ['\t', 'Tab']], 2);
    const act = (fn) => { try { const o = JSON.parse(ta.value); const r = fn(o); out.set(r); msg.textContent = '✅ Valid JSON'; } catch (e) { const m = /position (\d+)/.exec(e.message); let w = e.message; if (m) { const p = +m[1], before = ta.value.slice(0, p); w += ` (line ${before.split('\n').length}, column ${p - before.lastIndexOf('\n')})`; } msg.textContent = '❌ ' + w; out.set(''); } };
    const sortKeys = o => Array.isArray(o) ? o.map(sortKeys) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sortKeys(o[k])])) : o;
    const ind = () => indent.value === '\t' ? '\t' : +indent.value;
    root.append(ui.panel('Input', ta, ui.row(ui.field('Indent', indent)), ui.btns(ui.btn('Format', () => act(o => JSON.stringify(o, null, ind()))), ui.btn('Minify', () => act(o => JSON.stringify(o)), 'secondary'), ui.btn('Sort keys', () => act(o => JSON.stringify(sortKeys(o), null, ind())), 'secondary'), ui.btn('JSON → CSV', () => act(o => { const a = Array.isArray(o) ? o : [o]; const keys = [...new Set(a.flatMap(x => Object.keys(x)))]; return L.csvStringify([keys, ...a.map(x => keys.map(k => typeof x[k] === 'object' ? JSON.stringify(x[k]) : x[k]))]); }), 'secondary')), msg), ui.panel('Output', out)); act(o => JSON.stringify(o, null, 2));
  } });

  TN.register({ id: 'csv-json', cat: 'dev', icon: '🗂️', name: 'CSV ↔ JSON Converter', desc: 'Turn spreadsheet CSV into JSON and back. Handles quotes and commas.', tags: 'csv json excel convert table data', render(root) {
    const ta = ui.area({ rows: 8, mono: true, value: 'name,score\n"Smith, Ann",91\nRavi,88' }), delim = ui.select([[',', 'Comma ,'], [';', 'Semicolon ;'], ['\t', 'Tab'], ['|', 'Pipe |']], ','), out = ui.out(''), msg = h('div', { class: 'hint' });
    root.append(ui.panel('Input', ta, ui.row(ui.field('Delimiter', delim)), ui.btns(
      ui.btn('CSV → JSON', () => { const r = L.csvParse(ta.value, delim.value); if (!r.length) { out.set(''); return; } const [hd, ...rows] = r; out.set(JSON.stringify(rows.map(x => Object.fromEntries(hd.map((k, i) => [k, x[i] ?? '']))), null, 2)); msg.textContent = rows.length + ' rows'; }),
      ui.btn('JSON → CSV', () => { try { let o = JSON.parse(ta.value); if (!Array.isArray(o)) o = [o]; const k = [...new Set(o.flatMap(x => Object.keys(x)))]; out.set(L.csvStringify([k, ...o.map(x => k.map(c => typeof x[c] === 'object' ? JSON.stringify(x[c]) : x[c]))], delim.value)); msg.textContent = o.length + ' rows'; } catch (e) { msg.textContent = '❌ ' + e.message; } }, 'secondary')), msg), ui.panel('Output', out, ui.btns(ui.btn('Download', () => { const t = out.textContent.replace(/Copy$/, ''); ui.download(t, t.trim().startsWith('[') ? 'data.json' : 'data.csv'); }, 'secondary'))));
  } });

  TN.register({ id: 'base64', cat: 'dev', icon: '🔐', name: 'Base64 Encode / Decode', desc: 'UTF-8 safe Base64 for text; also files to Base64 data URLs.', tags: 'encode decode base64 data uri', render(root) {
    const ta = ui.area({ rows: 5, value: 'Hello, नमस्ते 👋' }), out = ui.out(''), msg = h('div', { class: 'hint' }), fo = ui.out('');
    root.append(ui.panel('Text', ta, ui.btns(ui.btn('Encode', () => { out.set(L.b64encode(ta.value)); msg.textContent = ''; }), ui.btn('Decode', () => { try { out.set(L.b64decode(ta.value)); msg.textContent = ''; } catch (e) { msg.textContent = '❌ Not valid Base64'; } }, 'secondary'), ui.btn('URL-safe encode', () => out.set(L.b64encode(ta.value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')), 'secondary')), msg), ui.panel('Output', out),
      ui.panel('File → Base64 (data URL)', ui.drop({ label: 'Choose a file', sub: 'Images, PDFs, anything up to ~10 MB', onFiles: async ([f]) => { if (f.size > 12e6) { ui.toast('File too large for this tool'); return; } const r = new FileReader(); r.onload = () => fo.set(r.result); r.readAsDataURL(f); } })  , fo));
  } });

  TN.register({ id: 'url-encode', cat: 'dev', icon: '🌐', name: 'URL Encode / Decode & Parser', desc: 'Percent-encode text and break a URL into its parts.', tags: 'urlencode query string percent parameters', render(root) {
    const ta = ui.area({ rows: 3, value: 'https://example.com/search?q=hello world&lang=en#top' }), out = ui.out(''), parts = h('div');
    const parse = () => { try { const u = new URL(ta.value.trim()); parts.replaceChildren(ui.table(['Part', 'Value'], [['Protocol', u.protocol], ['Host', u.host], ['Path', u.pathname], ['Hash', u.hash || '—'], ...[...u.searchParams].map(([k, v]) => ['? ' + k, v])])); } catch (e) { parts.replaceChildren(ui.note('Not a full URL (needs https://…)')); } };
    ta.addEventListener('input', parse); parse();
    root.append(ui.panel('Input', ta, ui.btns(ui.btn('encodeURIComponent', () => out.set(encodeURIComponent(ta.value))), ui.btn('encodeURI', () => out.set(encodeURI(ta.value)), 'secondary'), ui.btn('Decode', () => { try { out.set(decodeURIComponent(ta.value)); } catch (e) { out.set('Invalid encoding'); } }, 'secondary'))), ui.panel('Output', out), ui.panel('URL parts', parts));
  } });

  TN.register({ id: 'jwt', cat: 'dev', icon: '🎫', name: 'JWT Decoder', desc: 'Inspect JSON Web Token header, payload and expiry — locally.', tags: 'token auth bearer jsonwebtoken claims', render(root) {
    const ta = ui.area({ rows: 5, mono: true, value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' }), out = h('div');
    ui.live([ta], () => { try { const j = L.jwtDecode(ta.value); out.replaceChildren(ui.panel('Header', ui.out(JSON.stringify(j.header, null, 2))), ui.panel('Payload', ui.out(JSON.stringify(j.payload, null, 2))), j.info.length ? ui.table(['Claim', 'Date', 'When'], j.info.map(i => [i.k, i.date.toLocaleString(), i.delta < 0 ? Math.round(-i.delta / 60) + ' min ago' + (i.k === 'exp' ? ' — EXPIRED' : '') : 'in ' + Math.round(i.delta / 60) + ' min'])) : null, ui.note('This tool only decodes. It does NOT verify the signature, so never trust a token because it decodes.')); } catch (e) { out.replaceChildren(ui.note(e.message, 'bad')); } });
    root.append(ui.panel('Token', ta, ui.note('Decoding happens in your browser. Still, avoid pasting live production tokens anywhere you do not trust.')), out);
  } });

  TN.register({ id: 'regex', cat: 'dev', icon: '🧩', name: 'Regex Tester', desc: 'Test regular expressions with live highlighted matches and groups.', tags: 'regular expression match groups pattern', render(root) {
    const re = ui.text({ value: '(\\w+)@(\\w+\\.\\w+)', mono: true }), fl = ui.text({ value: 'g', mono: true, maxlength: 6 }), ta = ui.area({ rows: 6, value: 'Contact: ann@example.com, bob@test.org' }), out = h('div'), hl = h('div', { class: 'out prose' });
    ui.live([re, fl, ta], () => { out.replaceChildren(); hl.replaceChildren(); try { const flags = fl.value.includes('g') ? fl.value : fl.value + 'g', r = new RegExp(re.value, flags), s = ta.value, ms = [...s.matchAll(r)].slice(0, 500); let last = 0; const frag = [];
        ms.forEach(m => { frag.push(s.slice(last, m.index), h('mark', { style: { background: 'var(--accent-soft)', color: 'inherit', borderRadius: '3px' } }, m[0])); last = m.index + m[0].length; if (!m[0].length) last++; }); frag.push(s.slice(last)); hl.replaceChildren(...frag);
        out.replaceChildren(h('div', { class: 'lbl' }, ms.length + ' match' + (ms.length === 1 ? '' : 'es')), ms.length ? ui.table(['#', 'Match', 'Index', 'Groups'], ms.slice(0, 50).map((m, i) => [i + 1, h('span', { class: 'mono' }, m[0]), m.index, m.slice(1).map((g, k) => '$' + (k + 1) + '=' + g).join('  ')])) : null); } catch (e) { out.replaceChildren(ui.note(e.message, 'bad')); } });
    root.append(ui.panel('Pattern', ui.row(ui.field('Regular expression', re), ui.field('Flags', fl, 'g i m s u'))), ui.panel('Test text', ta), ui.panel('Matches highlighted', hl), ui.panel('Details', out));
  } });

  TN.register({ id: 'timestamp', cat: 'dev', icon: '🕰️', name: 'Unix Timestamp Converter', desc: 'Epoch seconds/milliseconds to date and back, plus the live clock.', tags: 'epoch unix time date convert utc', render(root) {
    const ts = ui.text({ value: String(Math.floor(Date.now() / 1000)), mono: true }), out = h('div'), dt = h('input', { type: 'datetime-local' }), out2 = h('div'), live = h('div', { class: 'out' }); const pad = n => String(n).padStart(2, '0');
    ui.live([ts], () => { let n = Number(ts.value.trim()); if (!isFinite(n) || ts.value.trim() === '') { out.replaceChildren(ui.note('Enter a Unix timestamp.')); return; } const ms = Math.abs(n) > 1e11 ? n : n * 1000, d = new Date(ms); out.replaceChildren(ui.stats([['Local', d.toLocaleString(), 1], ['UTC', d.toUTCString()], ['ISO 8601', d.toISOString()], ['Interpreted as', Math.abs(n) > 1e11 ? 'milliseconds' : 'seconds']])); });
    ui.live([dt], () => { if (!dt.value) { out2.replaceChildren(); return; } const d = new Date(dt.value); out2.replaceChildren(ui.stats([['Seconds', Math.floor(d.getTime() / 1000), 1], ['Milliseconds', d.getTime()]])); });
    const tick = () => { live.textContent = 'Now: ' + Math.floor(Date.now() / 1000) + ' s  |  ' + new Date().toISOString(); }; tick(); const iv = setInterval(tick, 1000);
    root.append(ui.panel('Live', live), ui.cols(2, ui.panel('Timestamp → date', ui.field('Unix time', ts), out), ui.panel('Date → timestamp', ui.field('Date & time (your time zone)', dt), out2))); return () => clearInterval(iv);
  } });

  TN.register({ id: 'uuid', cat: 'dev', icon: '🆔', name: 'UUID & Random Generator', desc: 'UUID v4, random numbers, dice, coin flip and list picker — cryptographically random.', tags: 'guid random number dice coin pick draw', render(root) {
    const out = ui.out(''), n = ui.num({ value: 5, min: 1 }), lo = ui.num({ value: 1 }), hi = ui.num({ value: 100 }), rn = ui.out(''), list = ui.area({ rows: 4, value: 'Alice\nBob\nCarol\nDave' }), pick = ui.out('');
    const uuid = () => crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
    root.append(ui.panel('UUID v4', ui.row(ui.field('How many', n)), ui.btns(ui.btn('Generate', () => out.set(Array.from({ length: Math.min(100, Math.max(1, ui.val(n) || 1)) }, uuid).join('\n')))), out),
      ui.cols(2, ui.panel('Random number', ui.row(ui.field('From', lo), ui.field('To', hi)), ui.btns(ui.btn('Roll', () => { const a = Math.ceil(ui.val(lo)), b = Math.floor(ui.val(hi)); if (!(b >= a)) { rn.set('Check range'); return; } rn.set(String(a + L.randInt(b - a + 1))); }), ui.btn('🎲 d6', () => rn.set(String(1 + L.randInt(6))), 'secondary'), ui.btn('🪙 Coin', () => rn.set(L.randInt(2) ? 'Heads' : 'Tails'), 'secondary')), rn),
        ui.panel('Pick from a list', list, ui.btns(ui.btn('Pick one', () => { const a = list.value.split('\n').map(s => s.trim()).filter(Boolean); pick.set(a.length ? a[L.randInt(a.length)] : 'Add some items'); }), ui.btn('Shuffle all', () => { const a = list.value.split('\n').map(s => s.trim()).filter(Boolean); for (let i = a.length - 1; i > 0; i--) { const j = L.randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } pick.set(a.join('\n')); }, 'secondary')), pick)));
  } });

  TN.register({ id: 'html-entities', cat: 'dev', icon: '&;', name: 'HTML Entities & Minifier', desc: 'Escape/unescape HTML, strip tags, and minify CSS/JS-free HTML.', tags: 'escape unescape html minify strip tags ampersand', render(root) {
    const ta = ui.area({ rows: 6, mono: true, value: '<p class="x">Tom & "Jerry" © 2026</p>' }), out = ui.out('');
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'), unesc = s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
    root.append(ui.panel('Input', ta, ui.btns(ui.btn('Escape', () => out.set(esc(ta.value))), ui.btn('Unescape', () => out.set(unesc(ta.value)), 'secondary'), ui.btn('Strip tags', () => out.set(unesc(ta.value.replace(/<[^>]*>/g, ''))), 'secondary'), ui.btn('Minify HTML', () => out.set(ta.value.replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim()), 'secondary'))), ui.panel('Output', out));
  } });
})();
