/* Calculators + converters */
(function () {
  'use strict';
  const { h, ui } = TN, L = TNLogic, R = { register: TN.register };
  const v = ui.val;

  /* helper: form of numeric inputs -> live results */
  function form(spec, compute, opts = {}) {
    const ctrls = {}, out = h('div');
    const fields = spec.map(s => {
      const c = s.type === 'select' ? ui.select(s.options, s.value, null) : s.type === 'date' ? h('input', { type: 'date', value: s.value || '' }) : ui.num({ value: s.value, min: s.min, step: s.step, placeholder: s.placeholder });
      ctrls[s.id] = c; return ui.field(s.label, c, s.hint);
    });
    const run = () => { try { const vals = {}; for (const s of spec) vals[s.id] = s.type === 'select' ? ctrls[s.id].value : s.type === 'date' ? (ctrls[s.id].value ? new Date(ctrls[s.id].value + 'T00:00:00') : null) : v(ctrls[s.id]); out.replaceChildren(compute(vals) || ui.note('Enter the values above.')); } catch (e) { out.replaceChildren(ui.note(e.message, 'bad')); } };
    ui.live(Object.values(ctrls), run);
    return ui.cols(2, ui.panel(opts.title || 'Inputs', ...fields), ui.panel('Result', out));
  }
  const ok = (...a) => a.every(x => typeof x === 'number' ? isFinite(x) : !!x);

  /* ───── FINANCE ───── */
  R.register({ id: 'emi', cat: 'calc', icon: '🏦', name: 'EMI / Loan Calculator', desc: 'Monthly EMI, total interest and full repayment schedule.', tags: 'loan home car personal interest amortization schedule', render(root) {
    const sched = h('div');
    root.append(form([
      { id: 'p', label: 'Loan amount (₹)', value: 1000000 }, { id: 'r', label: 'Interest rate (% per year)', value: 8.5, step: 0.05 },
      { id: 'n', label: 'Tenure', value: 20 }, { id: 'u', label: 'Tenure unit', type: 'select', options: [['y', 'Years'], ['m', 'Months']], value: 'y' }],
      d => {
        if (!ok(d.p, d.r, d.n) || d.p <= 0 || d.n <= 0) return null;
        const months = Math.round(d.u === 'y' ? d.n * 12 : d.n), emi = L.emi(d.p, d.r, months), total = emi * months;
        const rows = L.amortization(d.p, d.r, months);
        sched.replaceChildren(ui.panel('Repayment schedule' + (months > 360 ? ' (first 360 months)' : ''), h('div', { class: 'scroll-y' }, ui.table(['Month', 'EMI', 'Principal', 'Interest', 'Balance'], rows.slice(0, 360).map(r => [r.month, ui.money(r.emi), ui.money(r.principal), ui.money(r.interest), ui.money(r.balance)]))), ui.btns(ui.btn('Download CSV', () => ui.download(L.csvStringify([['Month', 'EMI', 'Principal', 'Interest', 'Balance'], ...rows.map(r => [r.month, r.emi.toFixed(2), r.principal.toFixed(2), r.interest.toFixed(2), r.balance.toFixed(2)])]), 'emi-schedule.csv', 'text/csv'), 'secondary'))));
        return h('div', {}, ui.stats([['Monthly EMI', ui.money(emi), 1], ['Total interest', ui.money(total - d.p)], ['Total payment', ui.money(total)], ['Interest share', (((total - d.p) / total) * 100).toFixed(1) + '%']]));
      }), sched);
  } });

  R.register({ id: 'sip', cat: 'calc', icon: '📈', name: 'SIP / Investment Calculator', desc: 'Future value of monthly SIP or one-time investment.', tags: 'mutual fund returns lumpsum compound invest', render(root) {
    root.append(ui.tabs([
      { id: 'sip', label: 'Monthly SIP', render: () => form([{ id: 'm', label: 'Monthly investment (₹)', value: 5000 }, { id: 'r', label: 'Expected return (% per year)', value: 12 }, { id: 'y', label: 'Years', value: 10 }],
        d => { if (!ok(d.m, d.r, d.y)) return null; const s = L.sip(d.m, d.r, d.y); return h('div', {}, ui.stats([['Future value', ui.money(s.fv), 1], ['Invested', ui.money(s.invested)], ['Estimated gain', ui.money(s.gain)]]), ui.note('Assumes the SIP is paid at the start of each month and a steady return. Real returns vary and are never guaranteed.')); }) },
      { id: 'lump', label: 'Lump sum', render: () => form([{ id: 'p', label: 'Amount (₹)', value: 100000 }, { id: 'r', label: 'Return (% per year)', value: 8 }, { id: 'y', label: 'Years', value: 5 }, { id: 'f', label: 'Compounding', type: 'select', value: 1, options: [[1, 'Yearly'], [2, 'Half-yearly'], [4, 'Quarterly'], [12, 'Monthly']] }],
        d => { if (!ok(d.p, d.r, d.y)) return null; const c = L.compound(d.p, d.r, d.y, +d.f); return h('div', {}, ui.stats([['Maturity value', ui.money(c.fv), 1], ['Interest earned', ui.money(c.interest)], ['Doubling time (rule of 72)', d.r > 0 ? L.round(L.rule72(d.r), 1) + ' yrs' : '—']])); }) }]));
  } });

  R.register({ id: 'gst', cat: 'calc', icon: '🧾', name: 'GST Calculator', desc: 'Add or remove GST with CGST/SGST split.', tags: 'tax vat india invoice', render(root) {
    root.append(form([{ id: 'a', label: 'Amount (₹)', value: 1000 }, { id: 'r', label: 'GST rate', type: 'select', value: 18, options: [[0, '0%'], [3, '3%'], [5, '5%'], [12, '12%'], [18, '18%'], [28, '28%']] }, { id: 'm', label: 'Amount is', type: 'select', value: 'ex', options: [['ex', 'Excluding GST (add tax)'], ['in', 'Including GST (remove tax)']] }],
      d => { if (!ok(d.a, d.r)) return null; const g = L.gst(d.a, +d.r, d.m === 'in'); return ui.stats([['Total', ui.money(g.total), 1], ['Price before GST', ui.money(g.base)], ['GST', ui.money(g.gst)], ['CGST', ui.money(g.cgst)], ['SGST / UTGST', ui.money(g.sgst)]]); }));
    root.append(ui.note('GST slabs change by notification. Pick the rate shown on your invoice or the official schedule.'));
  } });

  R.register({ id: 'percent', cat: 'calc', icon: '％', name: 'Percentage Calculator', desc: 'X% of Y, what percent, percent change, discount.', tags: 'percent ratio increase decrease discount sale', render(root) {
    root.append(ui.cols(2,
      ui.panel('What is X% of Y?', form1([['X (%)', 15], ['Y', 2000]], ([x, y]) => L.fmtNum(L.percentOf(x, y)))),
      ui.panel('X is what % of Y?', form1([['X', 45], ['Y', 180]], ([x, y]) => L.fmtNum(L.whatPercent(x, y)) + ' %')),
      ui.panel('% change from A to B', form1([['From', 80], ['To', 100]], ([a, b]) => { const c = L.percentChange(a, b); return (c >= 0 ? '▲ ' : '▼ ') + L.fmtNum(Math.abs(c)) + ' %'; })),
      ui.panel('Discount (with optional extra)', form1([['Price', 2999], ['Discount %', 30], ['Extra %', 10]], ([p, d, e]) => { const r = L.discount(p, d, e || 0); return 'Pay ' + ui.money(r.final) + ' — you save ' + ui.money(r.saved) + ' (' + L.fmtNum(r.effectivePct) + '%)'; }))));
  } });
  function form1(defs, fn) {
    const ins = defs.map(([l, val]) => ui.num({ value: val })), out = ui.out('', { copy: false });
    const run = () => { const vals = ins.map(i => v(i)); out.set(vals.slice(0, 2).every(isFinite) ? fn(vals) : '—'); };
    ui.live(ins, run); return h('div', {}, ui.row(...ins.map((i, k) => ui.field(defs[k][0], i))), out);
  }

  R.register({ id: 'split-bill', cat: 'calc', icon: '🍽️', name: 'Bill Splitter & Tip', desc: 'Split a bill between friends, with optional tip.', tags: 'tip restaurant share friends', render(root) {
    root.append(form([{ id: 't', label: 'Bill total (₹)', value: 2400 }, { id: 'n', label: 'People', value: 4, min: 1 }, { id: 'p', label: 'Tip (%)', value: 5 }], d => { if (!ok(d.t, d.n) || d.n < 1) return null; const s = L.splitBill(d.t, Math.round(d.n), d.p || 0); return ui.stats([['Each person pays', ui.money(s.each), 1], ['Tip', ui.money(s.tip)], ['Grand total', ui.money(s.grand)]]); }));
  } });

  /* ───── HEALTH / DATES ───── */
  R.register({ id: 'bmi', cat: 'calc', icon: '⚖️', name: 'BMI & Calorie Calculator', desc: 'BMI, healthy weight range and daily calorie needs.', tags: 'health weight height bmr tdee fitness', render(root) {
    root.append(form([{ id: 'w', label: 'Weight (kg)', value: 70 }, { id: 'h', label: 'Height (cm)', value: 172 }, { id: 'a', label: 'Age', value: 25 }, { id: 's', label: 'Sex (for calorie formula)', type: 'select', value: 'male', options: [['male', 'Male'], ['female', 'Female']] }],
      d => { if (!ok(d.w, d.h) || d.w <= 0 || d.h <= 0) return null; const b = L.bmi(d.w, d.h); const items = [['BMI', L.round(b.bmi, 1), 1], ['Category', b.category], ['Healthy weight for your height', L.round(b.healthyKg[0], 1) + '–' + L.round(b.healthyKg[1], 1) + ' kg']];
        if (ok(d.a) && d.a > 0) { const m = L.bmr(d.s, d.w, d.h, d.a); items.push(['Basal metabolic rate', Math.round(m.bmr) + ' kcal/day'], ['Light activity', Math.round(m.tdee.light) + ' kcal'], ['Moderate activity', Math.round(m.tdee.moderate) + ' kcal'], ['Very active', Math.round(m.tdee.active) + ' kcal']); }
        return h('div', {}, ui.stats(items), ui.note('BMI is a rough screening number. It ignores muscle, age and body type. For health decisions, talk to a doctor or dietitian.')); }));
  } });

  R.register({ id: 'age', cat: 'calc', icon: '🎂', name: 'Age Calculator', desc: 'Exact age in years, months, days and next birthday.', tags: 'birthday date of birth dob', render(root) {
    const today = new Date().toISOString().slice(0, 10);
    root.append(form([{ id: 'd', label: 'Date of birth', type: 'date', value: '2005-01-01' }, { id: 't', label: 'Age on date', type: 'date', value: today }], d => {
      if (!d.d) return null; const t = d.t || new Date(); if (d.d > t) return ui.note('Date of birth is after the chosen date.', 'bad'); const a = L.dateDiff(d.d, t), nb = L.nextBirthday(d.d, t);
      return ui.stats([['Age', a.years + ' y ' + a.months + ' m ' + a.days + ' d', 1], ['Total months', a.totalMonths.toLocaleString()], ['Total weeks', a.totalWeeks.toLocaleString()], ['Total days', a.totalDays.toLocaleString()], ['Next birthday', nb.inDays === 0 ? 'Today! 🎉' : nb.inDays + ' days (' + nb.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) + ')']]); }));
  } });

  R.register({ id: 'date-calc', cat: 'calc', icon: '📅', name: 'Date Calculator', desc: 'Days between dates, add/subtract days, working days.', tags: 'days between weekday working business duration', render(root) {
    const t = new Date().toISOString().slice(0, 10);
    root.append(ui.tabs([
      { id: 'diff', label: 'Between two dates', render: () => form([{ id: 'a', label: 'From', type: 'date', value: t }, { id: 'b', label: 'To', type: 'date', value: t }], d => { if (!d.a || !d.b) return null; const r = L.dateDiff(d.a, d.b); return ui.stats([['Difference', r.years + ' y ' + r.months + ' m ' + r.days + ' d', 1], ['Total days', r.totalDays.toLocaleString()], ['Weeks', r.totalWeeks], ['Working days (Mon–Fri)', L.workingDays(d.a, d.b)]]); }) },
      { id: 'add', label: 'Add / subtract', render: () => form([{ id: 'a', label: 'Start date', type: 'date', value: t }, { id: 'n', label: 'Days (negative to subtract)', value: 90 }], d => { if (!d.a || !ok(d.n)) return null; const r = L.addDays(d.a, Math.round(d.n)); return ui.stats([['Result', r.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), 1]]); }) }]));
  } });

  R.register({ id: 'attendance', cat: 'calc', icon: '🎓', name: 'Attendance Calculator', desc: 'How many classes you can skip, or must attend, to hit your target.', tags: 'college student percentage bunk 75', render(root) {
    root.append(form([{ id: 'a', label: 'Classes attended', value: 60 }, { id: 't', label: 'Total classes held so far', value: 80 }, { id: 'p', label: 'Required attendance (%)', value: 75 }], d => {
      if (!ok(d.a, d.t, d.p) || d.t <= 0 || d.a > d.t || d.p >= 100) return ui.note('Check the numbers: attended cannot exceed total, and the target must be under 100%.', 'bad'); const r = L.attendance(d.a, d.t, d.p);
      return h('div', {}, ui.stats([['Current attendance', r.current.toFixed(2) + '%', 1], r.need ? ['Attend next', r.need + ' classes in a row'] : ['You can still skip', r.canSkip + ' classes']]), ui.note(r.need ? 'Attend every class: after ' + r.need + ' more you will be at ' + ((d.a + r.need) / (d.t + r.need) * 100).toFixed(1) + '%.' : 'Skipping ' + r.canSkip + ' keeps you at or above ' + d.p + '%.', r.need ? '' : 'ok')); }));
  } });

  R.register({ id: 'gpa', cat: 'calc', icon: '🏅', name: 'GPA / CGPA Calculator', desc: 'Weighted GPA from credits and grade points.', tags: 'sgpa cgpa grade university marks', render(root) {
    let rows = [{ c: 4, g: 9 }, { c: 3, g: 8 }, { c: 3, g: 10 }]; const box = h('div'), out = h('div');
    const draw = () => { box.replaceChildren(...rows.map((r, i) => ui.row(ui.field(i ? '' : 'Credits', ui.num({ value: r.c, oninput: e => { r.c = v(e.target); calc(); } })), ui.field(i ? '' : 'Grade points', ui.num({ value: r.g, oninput: e => { r.g = v(e.target); calc(); } })), h('div', { class: 'field', style: { flex: '0 0 auto' } }, h('button', { class: 'btn danger sm', onclick: () => { rows.splice(i, 1); draw(); calc(); } }, '✕'))))); };
    const calc = () => { const ok2 = rows.filter(r => isFinite(r.c) && isFinite(r.g) && r.c > 0); out.replaceChildren(ui.stats([['GPA', ok2.length ? L.round(L.gpa(ok2.map(r => ({ credits: r.c, points: r.g }))), 3) : '—', 1], ['Total credits', ok2.reduce((a, r) => a + r.c, 0)]])); };
    draw(); calc();
    root.append(ui.cols(2, ui.panel('Subjects', box, ui.btns(ui.btn('+ Add subject', () => { rows.push({ c: 3, g: 8 }); draw(); calc(); }, 'secondary'))), ui.panel('Result', out)));
  } });

  /* ───── MATH ───── */
  R.register({ id: 'scientific', cat: 'calc', icon: '🔬', name: 'Scientific Calculator', desc: 'Type expressions: sin, cos, log, ln, sqrt, ^, !, pi.', tags: 'math calculator trig expression', render(root) {
    let deg = true, ans, hist = [];
    const input = h('input', { type: 'text', class: 'mono', placeholder: 'e.g. sin(30) + 2^8 / (3+4)', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', inputmode: 'text', style: { fontSize: '20px', minHeight: '54px' } });
    const out = h('div', { class: 'out', style: { fontSize: '24px', minHeight: '58px' } }, ' '), log = h('div', { class: 'out', style: { maxHeight: '180px', overflow: 'auto', marginTop: '10px' } }, 'History appears here');
    const run = () => { const s = input.value.trim(); if (!s) { out.textContent = ' '; return; } try { const r = L.evalExpr(s, { degrees: deg, ans }); out.textContent = '= ' + L.fmtNum(r, 12); out._r = r; } catch (e) { out.textContent = '…' + e.message; out._r = undefined; } };
    input.addEventListener('input', run);
    const eq = () => { run(); if (out._r !== undefined) { ans = out._r; hist.unshift(input.value + ' = ' + L.fmtNum(ans, 12)); log.textContent = hist.slice(0, 30).join('\n'); } };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') eq(); });
    const keys = ['7', '8', '9', '/', '(', ')', '4', '5', '6', '*', 'sin(', 'cos(', '1', '2', '3', '-', 'tan(', 'ln(', '0', '.', '^', '+', 'sqrt(', 'log(', 'pi', 'e', '!', '%', 'abs(', 'ans'];
    const pad = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '6px', marginTop: '12px' } }, keys.map(k => h('button', { class: 'btn secondary', style: { padding: 0 }, onclick: () => { input.setRangeText(k, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end'); input.focus(); run(); } }, k)));
    const degBtn = ui.btn('Degrees', () => { deg = !deg; degBtn.textContent = deg ? 'Degrees' : 'Radians'; run(); }, 'secondary');
    root.append(ui.panel('', input, out, pad, ui.btns(ui.btn('=', eq), degBtn, ui.btn('Clear', () => { input.value = ''; run(); }, 'secondary'), ui.btn('⌫', () => { input.value = input.value.slice(0, -1); run(); }, 'secondary')), log));
  } });

  R.register({ id: 'quadratic', cat: 'calc', icon: '📐', name: 'Quadratic Equation Solver', desc: 'Roots of ax² + bx + c = 0 including complex roots.', tags: 'algebra equation roots discriminant', render(root) {
    root.append(form([{ id: 'a', label: 'a', value: 1 }, { id: 'b', label: 'b', value: -3 }, { id: 'c', label: 'c', value: 2 }], d => { if (!ok(d.a, d.b, d.c)) return null; const q = L.quadratic(d.a, d.b, d.c), f = x => L.fmtNum(x, 8);
      if (q.type === 'none') return ui.note('No equation: a and b are both 0.', 'bad'); if (q.type === 'linear') return ui.stats([['Linear root x', f(q.roots[0]), 1]]);
      if (q.type === 'complex') return ui.stats([['x₁', f(q.re) + ' + ' + f(q.im) + 'i', 1], ['x₂', f(q.re) + ' − ' + f(q.im) + 'i', 1], ['Discriminant', f(q.D)]]);
      return ui.stats([['x₁', f(q.roots[0]), 1], ['x₂', f(q.roots[q.roots.length - 1]), 1], ['Discriminant', f(q.D)]]); }));
  } });

  R.register({ id: 'statistics', cat: 'calc', icon: '📊', name: 'Statistics Calculator', desc: 'Mean, median, mode, standard deviation of a list.', tags: 'average variance sd data numbers', render(root) {
    const ta = ui.area({ value: '12, 15, 15, 18, 22, 22, 22, 30', rows: 4 }), out = h('div');
    const run = () => { const xs = ta.value.split(/[\s,;]+/).filter(Boolean).map(Number); if (!xs.length || xs.some(isNaN)) { out.replaceChildren(ui.note('Enter numbers separated by commas, spaces or new lines.')); return; } const s = L.stats(xs), f = x => L.fmtNum(x, 8);
      out.replaceChildren(ui.stats([['Mean', f(s.mean), 1], ['Median', f(s.median)], ['Mode', s.mode.length ? s.mode.join(', ') : 'none'], ['Count', s.n], ['Sum', f(s.sum)], ['Min / Max', f(s.min) + ' / ' + f(s.max)], ['Range', f(s.range)], ['Std dev (population)', f(s.sdP)], ['Std dev (sample)', isNaN(s.sdS) ? '—' : f(s.sdS)], ['Variance (population)', f(s.varP)]])); };
    ui.live([ta], run); root.append(ui.panel('Numbers', ta), ui.panel('Result', out));
  } });

  R.register({ id: 'primes', cat: 'calc', icon: '🔢', name: 'Prime, GCD & LCM', desc: 'Prime check, factorisation, GCD and LCM of numbers.', tags: 'factors hcf prime number divisor', render(root) {
    const a = ui.num({ value: 360 }), b = ui.num({ value: 84 }), out = h('div');
    ui.live([a, b], () => { const x = v(a), y = v(b); const items = []; if (Number.isInteger(x) && x > 0 && x <= 9e15) { items.push([x + ' is', L.isPrime(x) ? 'Prime ✓' : 'Not prime'], ['Prime factors', x < 2 ? '—' : (() => { const f = L.factorize(x), m = {}; f.forEach(p => m[p] = (m[p] || 0) + 1); return Object.entries(m).map(([p, e]) => e > 1 ? p + '^' + e : p).join(' × '); })()]); } if (Number.isInteger(x) && Number.isInteger(y) && x > 0 && y > 0) items.push(['GCD / HCF', L.gcd(x, y), 1], ['LCM', L.lcm(x, y), 1]); out.replaceChildren(items.length ? ui.stats(items) : ui.note('Enter whole numbers.')); });
    root.append(ui.cols(2, ui.panel('Numbers', ui.field('First number', a), ui.field('Second number (for GCD/LCM)', b)), ui.panel('Result', out)));
  } });

  /* ───── CONVERTERS ───── */
  R.register({ id: 'units', cat: 'convert', icon: '📏', name: 'Unit Converter', desc: 'Length, mass, area, volume, speed, temperature, data and more.', tags: 'metric imperial kg lb km mile celsius fahrenheit acre cent inch', render(root) {
    const cats = Object.keys(L.UNITS); let cat = TN.store.get('unitcat', 'Length');
    const catSel = ui.select(cats, cat), val = ui.num({ value: 1 }), from = h('select'), to = h('select'), out = h('div'), all = h('div');
    const fill = () => { cat = catSel.value; TN.store.set('unitcat', cat); const U = Object.entries(L.UNITS[cat]); [from, to].forEach(s => s.replaceChildren(...U.map(([k, [n]]) => h('option', { value: k }, n + ' (' + k + ')')))); from.value = U[0][0]; to.value = U[1] ? U[1][0] : U[0][0]; run(); };
    const run = () => { const x = v(val); if (!isFinite(x)) { out.replaceChildren(); all.replaceChildren(); return; } const r = L.convertUnit(cat, from.value, to.value, x);
      out.replaceChildren(ui.stats([[x + ' ' + from.value + ' =', L.fmtNum(r), 1]])); all.replaceChildren(ui.table(['Unit', 'Value'], Object.entries(L.UNITS[cat]).map(([k, [n]]) => [n + ' (' + k + ')', L.fmtNum(L.convertUnit(cat, from.value, k, x))]))); };
    [val, from, to].forEach(e => { e.addEventListener('input', run); e.addEventListener('change', run); }); catSel.addEventListener('change', fill);
    root.append(ui.cols(2, ui.panel('Convert', ui.field('Type', catSel), ui.field('Value', val), ui.row(ui.field('From', from), ui.field('To', to), h('div', { class: 'field', style: { flex: '0 0 auto' } }, h('button', { class: 'btn secondary', title: 'Swap', onclick: () => { const t = from.value; from.value = to.value; to.value = t; run(); } }, '⇄'))), out), ui.panel('In every unit', h('div', { class: 'scroll-y' }, all)))); fill();
  } });

  R.register({ id: 'number-base', cat: 'convert', icon: '🔟', name: 'Number Base Converter', desc: 'Binary, octal, decimal, hex and any base 2–36.', tags: 'binary hex octal decimal radix bits', render(root) {
    const inp = ui.text({ value: '255', mono: true }), from = ui.select([[2, 'Binary (2)'], [8, 'Octal (8)'], [10, 'Decimal (10)'], [16, 'Hex (16)'], [36, 'Base 36']], 10), out = h('div');
    ui.live([inp, from], () => { const f = +from.value, r = [[2, 'Binary'], [8, 'Octal'], [10, 'Decimal'], [16, 'Hexadecimal'], [32, 'Base 32'], [36, 'Base 36']].map(([b, n]) => [n, L.toBase(inp.value, f, b)]); out.replaceChildren(r[0][1] === null ? ui.note('Not a valid number in that base.', 'bad') : ui.table(['Base', 'Value'], r.map(([n, x]) => [n, h('span', { class: 'mono' }, x)]))); });
    root.append(ui.cols(2, ui.panel('Input', ui.field('Number', inp), ui.field('Input base', from), ui.note('Works with very large numbers (uses BigInt).')), ui.panel('Result', out)));
  } });

  R.register({ id: 'number-words', cat: 'convert', icon: '🔤', name: 'Number to Words', desc: 'Write amounts in words — Indian (lakh/crore) or international.', tags: 'cheque amount rupees words lakh crore million', render(root) {
    const n = ui.num({ value: 1234567.5 }), sys = ui.select([['indian', 'Indian (lakh, crore)'], ['intl', 'International (million, billion)']], 'indian'), cur = ui.select([['inr', 'Rupees & Paise'], ['usd', 'Dollars & Cents'], ['none', 'Plain number']], 'inr'), out = ui.out('', { prose: true });
    ui.live([n, sys, cur], () => { const x = v(n); if (!isFinite(x) || Math.abs(x) > 999999999999999) { out.set('Enter a number up to 999 trillion.'); return; } const c = cur.value; out.set(c === 'none' ? (x < 0 ? 'Minus ' : '') + L.intToWords(x, sys.value) : L.amountWords(x, sys.value, c === 'inr' ? { main: 'Rupees', sub: 'Paise' } : { main: 'Dollars', sub: 'Cents' })); });
    root.append(ui.panel('', ui.row(ui.field('Amount', n), ui.field('System', sys), ui.field('Format', cur)), out));
  } });

  R.register({ id: 'roman', cat: 'convert', icon: 'Ⅻ', name: 'Roman Numerals', desc: 'Convert numbers to Roman numerals and back.', tags: 'roman numeral xiv', render(root) {
    const n = ui.num({ value: 2026 }), r = ui.text({ value: 'MMXXVI', mono: true }), o1 = ui.out(''), o2 = ui.out('');
    ui.live([n], () => o1.set(L.toRoman(v(n)) || 'Use a whole number from 1 to 3999')); ui.live([r], () => { const x = L.fromRoman(r.value); o2.set(x === null ? 'Not a valid Roman numeral' : String(x)); });
    root.append(ui.cols(2, ui.panel('Number → Roman', ui.field('Number', n), o1), ui.panel('Roman → Number', ui.field('Roman numeral', r), o2)));
  } });

  R.register({ id: 'timezone', cat: 'convert', icon: '🌍', name: 'Time Zone Converter', desc: 'Convert a time between cities and time zones worldwide.', tags: 'world clock utc ist est pst meeting', render(root) {
    const zones = (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/London', 'Asia/Tokyo']);
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone, now = new Date(), pad = n => String(n).padStart(2, '0');
    const dt = h('input', { type: 'datetime-local', value: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}` });
    let list = TN.store.get('zones', ['UTC', 'America/New_York', 'Europe/London', 'Asia/Dubai', 'Asia/Tokyo', 'Australia/Sydney']); const src = ui.select(zones, mine), out = h('div'), add = ui.select(zones, 'Europe/Paris');
    function offsetMs(tz, d) { const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(d).reduce((a, x) => (a[x.type] = +x.value, a), {}); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000; }
    const run = () => { if (!dt.value) return; const [D, T] = dt.value.split('T'), [y, mo, d] = D.split('-').map(Number), [hh, mm] = T.split(':').map(Number); let guess = Date.UTC(y, mo - 1, d, hh, mm); let inst = new Date(guess - offsetMs(src.value, new Date(guess))); inst = new Date(guess - offsetMs(src.value, inst));
      const rows = [src.value, ...list.filter(z => z !== src.value)].map(z => [z.replace(/_/g, ' '), new Intl.DateTimeFormat(undefined, { timeZone: z, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }).format(inst), h('button', { class: 'btn danger sm', onclick: () => { TN.store.set('zones', list = list.filter(x => x !== z)); run(); } }, '✕')]); out.replaceChildren(ui.table(['Zone', 'Local time', ''], rows)); };
    dt.addEventListener('input', run); src.addEventListener('change', run);
    root.append(ui.cols(2, ui.panel('Source', ui.field('Date & time', dt), ui.field('In time zone', src), ui.row(ui.field('Add a zone', add), h('div', { class: 'field', style: { flex: '0 0 auto' } }, ui.btn('Add', () => { if (!list.includes(add.value)) { list.push(add.value); TN.store.set('zones', list); } run(); }, 'secondary')))), ui.panel('Converted', out))); run();
  } });

  R.register({ id: 'military-time', cat: 'convert', icon: '🕐', name: '12h ↔ 24h Time Converter', desc: 'Convert AM/PM time to military (24-hour) time and back.', tags: 'military clock am pm', render(root) {
    const a = ui.text({ value: '2:30 pm', mono: true }), b = ui.text({ value: '1845', mono: true }), o1 = ui.out(''), o2 = ui.out('');
    const p2 = n => String(n).padStart(2, '0');
    ui.live([a], () => { const t = L.to24(a.value); o1.set(t ? p2(t.h) + ':' + p2(t.m) + ' (' + p2(t.h) + p2(t.m) + ' hours)' : 'Try 2:30 pm or 11 am'); });
    ui.live([b], () => { const s = b.value.replace(':', ''); const m = s.match(/^(\d{1,2})(\d{2})$/); const hh = m ? +m[1] : NaN, mi = m ? +m[2] : NaN; o2.set(m && hh < 24 && mi < 60 ? ((hh % 12) || 12) + ':' + p2(mi) + ' ' + (hh < 12 ? 'AM' : 'PM') : 'Try 1845 or 07:05'); });
    root.append(ui.cols(2, ui.panel('12-hour → 24-hour', ui.field('Time', a), o1), ui.panel('24-hour → 12-hour', ui.field('Time', b), o2)));
  } });

  R.register({ id: 'color', cat: 'convert', icon: '🎨', name: 'Color Converter & Contrast', desc: 'HEX, RGB, HSL converter, palette and WCAG contrast checker.', tags: 'hex rgb hsl picker palette accessibility wcag', render(root) {
    const pick = h('input', { type: 'color', value: '#0b7a66' }), hex = ui.text({ value: '#0b7a66', mono: true }), rgb = ui.text({ value: '', mono: true }), hsl = ui.text({ value: '', mono: true }), sw = h('div', { class: 'swatch' }), pal = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '6px' } });
    const bg = h('input', { type: 'color', value: '#ffffff' }), cr = h('div');
    function setFrom(rgbA) { const x = L.rgbToHex(...rgbA); hex.value = x; pick.value = x; rgb.value = `rgb(${rgbA.join(', ')})`; hsl.value = 'hsl(' + L.rgbToHsl(...rgbA).map((n, i) => i ? n + '%' : n).join(', ') + ')'; sw.style.background = x; const [hh, ss, ll] = L.rgbToHsl(...rgbA); pal.replaceChildren(...[-30, -15, 0, 15, 30].map(d => { const c = L.rgbToHex(...L.hslToRgb(hh, ss, Math.max(5, Math.min(95, ll + d)))); return h('button', { class: 'btn secondary sm', style: { background: c, color: L.luminance(L.hexToRgb(c)) > .45 ? '#000' : '#fff' }, onclick: () => ui.copyText(c) }, c); }));
      const c = L.contrast(rgbA, L.hexToRgb(bg.value)); cr.replaceChildren(ui.stats([['Contrast vs background', c.toFixed(2) + ' : 1', 1], ['Normal text', c >= 7 ? 'AAA ✓' : c >= 4.5 ? 'AA ✓' : 'Fail ✗'], ['Large text', c >= 4.5 ? 'AAA ✓' : c >= 3 ? 'AA ✓' : 'Fail ✗']])); }
    pick.addEventListener('input', () => setFrom(L.hexToRgb(pick.value))); bg.addEventListener('input', () => setFrom(L.hexToRgb(hex.value) || [0, 0, 0]));
    hex.addEventListener('input', () => { const r = L.hexToRgb(hex.value); if (r) setFrom(r); });
    rgb.addEventListener('input', () => { const m = rgb.value.match(/(\d+)\D+(\d+)\D+(\d+)/); if (m) setFrom([+m[1], +m[2], +m[3]].map(x => Math.min(255, x))); });
    hsl.addEventListener('input', () => { const m = hsl.value.match(/(\d+)\D+(\d+)\D+(\d+)/); if (m) setFrom(L.hslToRgb(+m[1], Math.min(100, +m[2]), Math.min(100, +m[3]))); });
    root.append(ui.cols(2, ui.panel('Color', sw, ui.row(ui.field('Picker', pick)), ui.field('HEX', hex), ui.field('RGB', rgb), ui.field('HSL', hsl), ui.field('Shades', pal)), ui.panel('Accessibility contrast', ui.field('Background color', bg), cr))); setFrom(L.hexToRgb('#0b7a66'));
  } });
})();
