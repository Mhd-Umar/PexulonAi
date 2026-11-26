/* Text & writing tools */
(function () {
  'use strict';
  const { h, ui } = TN, L = TNLogic;

  TN.register({ id: 'word-counter', cat: 'text', icon: '🔠', name: 'Word & Character Counter', desc: 'Words, characters, sentences, reading time and top keywords.', tags: 'count length essay limit characters reading time', render(root) {
    const ta = ui.area({ rows: 9, placeholder: 'Type or paste your text here…', spell: true }), out = h('div');
    ui.live([ta], () => { const s = L.textStats(ta.value); out.replaceChildren(ui.stats([['Words', s.words.toLocaleString(), 1], ['Characters', s.chars.toLocaleString()], ['Without spaces', s.charsNoSpace.toLocaleString()], ['Sentences', s.sentences], ['Paragraphs', s.paragraphs], ['Lines', s.lines], ['Reading time', s.words ? Math.max(1, Math.round(s.readMin)) + ' min' : '—'], ['Speaking time', s.words ? Math.max(1, Math.round(s.speakMin)) + ' min' : '—']]), s.top.length ? h('div', { style: { marginTop: '12px' } }, h('div', { class: 'lbl' }, 'Most used words'), h('div', { class: 'chips', style: { flexWrap: 'wrap', margin: 0, padding: 0, overflow: 'visible' } }, s.top.map(([w, c]) => h('span', { class: 'chip' }, w + ' ×' + c)))) : null); });
    root.append(ui.panel('', ta, ui.btns(ui.btn('Clear', () => { ta.value = ''; ta.dispatchEvent(new Event('input')); }, 'secondary'))), ui.panel('Statistics', out));
  } });

  TN.register({ id: 'case-converter', cat: 'text', icon: 'Aa', name: 'Case Converter', desc: 'UPPER, lower, Title, Sentence, camelCase, snake_case, kebab-case.', tags: 'uppercase lowercase title camel snake kebab capitalize', render(root) {
    const ta = ui.area({ rows: 5, value: 'the quick brown fox jumps over the lazy dog', spell: true }), out = h('div', { class: 'grid' });
    const names = { upper: 'UPPER CASE', lower: 'lower case', title: 'Title Case', sentence: 'Sentence case', camel: 'camelCase', pascal: 'PascalCase', snake: 'snake_case', kebab: 'kebab-case', constant: 'CONSTANT_CASE', alternating: 'aLtErNaTiNg', inverse: 'iNVERSE' };
    ui.live([ta], () => out.replaceChildren(...Object.keys(names).map(k => { const r = L.cases[k](ta.value); return h('div', { class: 'panel' }, h('div', { class: 'lbl' }, names[k]), h('div', { class: 'out', style: { marginTop: '6px', minHeight: '40px' } }, r.length > 300 ? r.slice(0, 300) + '…' : r, ui.copy(() => r))); })));
    root.append(ui.panel('', ta), out);
  } });

  TN.register({ id: 'text-diff', cat: 'text', icon: '🔀', name: 'Text Diff Checker', desc: 'Compare two texts line by line and see what changed.', tags: 'compare difference changes version', render(root) {
    const a = ui.area({ rows: 8, value: 'apple\nbanana\ncherry', mono: true }), b = ui.area({ rows: 8, value: 'apple\nblueberry\ncherry\ndate', mono: true }), out = h('div', { class: 'out', style: { padding: 0, overflow: 'hidden' } });
    ui.live([a, b], () => { try { const d = L.lineDiff(a.value, b.value); const add = d.filter(x => x.t === '+').length, del = d.filter(x => x.t === '-').length; out.replaceChildren(h('div', { style: { padding: '8px 10px', borderBottom: '1px solid var(--line)' } }, `+${add} added, −${del} removed`), ...d.map(x => h('span', { class: 'diffline ' + (x.t === '+' ? 'diff-add' : x.t === '-' ? 'diff-del' : '') }, (x.t === '=' ? '  ' : x.t + ' ') + x.s))); } catch (e) { out.replaceChildren(ui.note(e.message, 'bad')); } });
    root.append(ui.cols(2, ui.panel('Original', a), ui.panel('Changed', b)), ui.panel('Differences', out));
  } });

  TN.register({ id: 'find-replace', cat: 'text', icon: '🔎', name: 'Find & Replace (Regex)', desc: 'Bulk find and replace with optional regular expressions.', tags: 'regex replace substitute clean bulk', render(root) {
    const ta = ui.area({ rows: 7, value: 'Order #123 shipped on 2026-11-24.\nOrder #456 pending.' }), f = ui.text({ value: '#(\\d+)', mono: true }), r = ui.text({ value: 'No.$1', mono: true }), isRe = ui.check('Regular expression', true), ci = ui.check('Ignore case', false), out = ui.out(''), info = h('div', { class: 'hint' });
    const run = () => { try { const re = new RegExp(isRe.querySelector('input').checked ? f.value : f.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g' + (ci.querySelector('input').checked ? 'i' : '')); const n = (ta.value.match(re) || []).length; out.set(ta.value.replace(re, r.value)); info.textContent = n + ' match' + (n === 1 ? '' : 'es') + '  ($1, $2 … insert captured groups)'; } catch (e) { info.textContent = '⚠ ' + e.message; } };
    [ta, f, r, isRe, ci].forEach(x => { x.addEventListener('input', run); x.addEventListener('change', run); });
    root.append(ui.panel('Text', ta), ui.panel('Rules', ui.row(ui.field('Find', f), ui.field('Replace with', r)), ui.row(isRe, ci), info), ui.panel('Result', out)); run();
  } });

  TN.register({ id: 'line-tools', cat: 'text', icon: '☰', name: 'Line Tools', desc: 'Sort, dedupe, reverse, shuffle, trim and number lines.', tags: 'sort lines unique duplicates remove blank alphabetical list', render(root) {
    const ta = ui.area({ rows: 9, value: 'pear\napple\nbanana\napple\n\ncherry', mono: true }), out = ui.out('');
    const apply = fn => { out.set(fn(ta.value)); };
    root.append(ui.panel('Lines', ta, ui.btns(
      ui.btn('Sort A→Z', () => apply(t => L.sortLines(t, 'az')), 'secondary'), ui.btn('Sort Z→A', () => apply(t => L.sortLines(t, 'za')), 'secondary'), ui.btn('By length', () => apply(t => L.sortLines(t, 'len')), 'secondary'), ui.btn('Numeric', () => apply(t => L.sortLines(t, 'num')), 'secondary'),
      ui.btn('Reverse', () => apply(t => L.sortLines(t, 'rev')), 'secondary'), ui.btn('Shuffle', () => apply(t => L.sortLines(t, 'shuffle')), 'secondary'), ui.btn('Remove duplicates', () => apply(t => L.dedupeLines(t, false)), 'secondary'),
      ui.btn('Remove blank lines', () => apply(t => t.split('\n').filter(l => l.trim()).join('\n')), 'secondary'), ui.btn('Trim spaces', () => apply(t => t.split('\n').map(l => l.trim()).join('\n')), 'secondary'), ui.btn('Number lines', () => apply(t => t.split('\n').map((l, i) => (i + 1) + '. ' + l).join('\n')), 'secondary'))), ui.panel('Result', out)); out.set(ta.value);
  } });

  TN.register({ id: 'lorem', cat: 'text', icon: '📃', name: 'Lorem Ipsum Generator', desc: 'Placeholder text for designs and mockups.', tags: 'dummy placeholder filler paragraphs', render(root) {
    const n = ui.num({ value: 3, min: 1 }), s = ui.num({ value: 5, min: 1 }), out = ui.out('', { prose: true });
    ui.live([n, s], () => out.set(L.lorem(Math.min(30, Math.max(1, Math.round(v(n)) || 1)), Math.min(12, Math.max(1, Math.round(v(s)) || 5)))));
    function v(e) { return ui.val(e); } root.append(ui.panel('', ui.row(ui.field('Paragraphs', n), ui.field('Sentences each', s)), out));
  } });

  TN.register({ id: 'markdown', cat: 'text', icon: 'Ⓜ️', name: 'Markdown Editor & Preview', desc: 'Write Markdown, see it live, copy the HTML or print to PDF.', tags: 'md readme preview html notes editor', render(root) {
    const key = 'md-note', ta = ui.area({ rows: 14, mono: true, value: TN.store.get(key, '# Hello\n\nWrite **Markdown** here.\n\n- Lists\n- *Italic* and `code`\n\n> Quotes work too\n\n| A | B |\n|---|---|\n| 1 | 2 |') }), prev = h('div', { class: 'mdprev' }); let html = '';
    TN.libs.marked().then(m => { const run = () => { TN.store.set(key, ta.value); html = m.parse(ta.value, { gfm: true, breaks: false }); const safe = new DOMParser().parseFromString(html, 'text/html'); safe.querySelectorAll('script,iframe,object,embed,style,link,meta').forEach(n => n.remove()); safe.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => { if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name); })); prev.replaceChildren(...safe.body.childNodes); }; ta.addEventListener('input', run); run(); });
    root.append(ui.cols(2, ui.panel('Markdown', ta, ui.btns(ui.btn('Copy HTML', () => ui.copyText(html), 'secondary'), ui.btn('Download .md', () => ui.download(ta.value, 'note.md', 'text/markdown'), 'secondary'), ui.btn('Print / Save PDF', () => window.print(), 'secondary'))), ui.panel('Preview', prev)));
  } });

  TN.register({ id: 'text-encode', cat: 'text', icon: '🔣', name: 'Text ↔ Binary / Hex / Morse', desc: 'Convert text to binary, hex, octal, ASCII codes or Morse and back.', tags: 'binary hex ascii morse code unicode encode decode', render(root) {
    const ta = ui.area({ rows: 4, value: 'Hello', spell: false }), tabs = ['Binary', 'Hex', 'Decimal (UTF-8 bytes)', 'Morse'], out = h('div');
    const enc = t => { const b = [...new TextEncoder().encode(t)]; return { Binary: b.map(x => x.toString(2).padStart(8, '0')).join(' '), Hex: b.map(x => x.toString(16).padStart(2, '0')).join(' '), 'Decimal (UTF-8 bytes)': b.join(' '), Morse: L.toMorse(t) }; };
    const dec = (kind, s) => { try { s = s.trim(); if (kind === 'Morse') return L.fromMorse(s); const parts = s.split(/[\s,]+/).filter(Boolean); const nums = parts.map(p => kind === 'Binary' ? parseInt(p, 2) : kind === 'Hex' ? parseInt(p, 16) : parseInt(p, 10)); if (nums.some(n => isNaN(n) || n < 0 || n > 255)) return null; return new TextDecoder().decode(new Uint8Array(nums)); } catch (e) { return null; } };
    ui.live([ta], () => { const e = enc(ta.value); out.replaceChildren(...tabs.map(k => h('div', { class: 'panel' }, h('div', { class: 'lbl' }, 'Text → ' + k), ui.out(e[k], {}), h('div', { class: 'lbl', style: { marginTop: '8px' } }, 'Decoded back'), (() => { const d = dec(k, e[k]); return h('div', { class: 'out' }, d === null ? '(cannot decode)' : d); })()))); });
    const rev = ui.area({ rows: 3, placeholder: 'Paste binary, hex, decimal bytes or Morse to decode…', mono: true }), kind = ui.select(tabs, 'Binary'), ro = ui.out('');
    ui.live([rev, kind], () => { if (!rev.value.trim()) { ro.set(''); return; } const d = dec(kind.value, rev.value); ro.set(d === null ? 'Could not decode that input.' : d); });
    root.append(ui.panel('Text', ta), ui.panel('Decode', ui.row(ui.field('Format', kind)), rev, ro), out);
  } });

  TN.register({ id: 'slug', cat: 'text', icon: '🔗', name: 'Slug & Text Cleaner', desc: 'URL slugs, remove extra spaces/line breaks, strip accents and emoji.', tags: 'slugify url clean whitespace normalize accents', render(root) {
    const ta = ui.area({ rows: 5, value: '  Héllo   Wörld —  my first   post!!  \n\n\nNew paragraph  ', spell: false }), out = h('div');
    ui.live([ta], () => { const t = ta.value; const items = [['URL slug', L.slugify(t)], ['Collapse spaces', t.replace(/[ \t]+/g, ' ').replace(/^ +| +$/gm, '')], ['Remove line breaks', t.replace(/\s*\n+\s*/g, ' ').trim()], ['Remove accents', t.normalize('NFD').replace(/[̀-ͯ]/g, '')], ['Remove emoji & symbols', t.replace(/[\p{Extended_Pictographic}‍️]/gu, '')], ['Straight quotes', t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')], ['Reverse text', [...t].reverse().join('')]]; out.replaceChildren(...items.map(([n, r]) => h('div', { class: 'panel' }, h('div', { class: 'lbl' }, n), ui.out(r || '—')))); });
    root.append(ui.panel('', ta), out);
  } });
})();
