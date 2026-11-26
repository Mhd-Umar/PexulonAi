/* Electronics, hardware & networking tools (built for Computer Hardware Engineering students) */
(function () {
  'use strict';
  const { h, ui } = TN, L = TNLogic, v = ui.val;
  const SI = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, '': 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
  // parse "4.7k", "100n", "2.2M", "10" -> number
  const pv = s => { const m = String(s).trim().match(/^(-?\d*\.?\d+(?:e[+-]?\d+)?)\s*([pnuµmkKMG]?)(?:[ΩΩFHVAWhz]*)$/i); if (!m) return NaN; const suf = m[2] === 'M' || m[2] === 'm' ? m[2] : m[2].toLowerCase() === 'k' ? 'k' : m[2].toLowerCase(); return parseFloat(m[1]) * (SI[suf] ?? 1); };
  const sit = (label, ph, val) => ui.field(label, ui.text({ value: val, placeholder: ph, mono: true }), 'You can type 4.7k, 100n, 2.2M, 10u …');
  const inp = f => f.querySelector('input');

  TN.register({ id: 'resistor', cat: 'electronics', icon: '🎚️', name: 'Resistor Color Code', desc: '4, 5 and 6-band resistor value from colors — and value to colors.', tags: 'resistor bands ohm colour color code tolerance', isNew: true, render(root) {
    let nb = 4, bands = ['Yellow', 'Violet', 'Red', 'Gold']; const colors = L.COLORS.map(c => c.n);
    const view = h('div', { class: 'res-bands' }), result = h('div'), selects = h('div', { class: 'row' }), nbSel = ui.select([[4, '4 bands'], [5, '5 bands'], [6, '6 bands']], 4);
    const roles = n => n === 4 ? ['1st digit', '2nd digit', 'Multiplier', 'Tolerance'] : n === 5 ? ['1st digit', '2nd digit', '3rd digit', 'Multiplier', 'Tolerance'] : ['1st digit', '2nd digit', '3rd digit', 'Multiplier', 'Tolerance', 'Temp. coeff.'];
    const allowed = (n, i) => { const r = roles(n)[i]; return r === 'Multiplier' ? colors : r === 'Tolerance' ? colors.filter(c => L.COLORS.find(x => x.n === c).tol !== null) : r === 'Temp. coeff.' ? colors.filter(c => L.COLORS.find(x => x.n === c).tc) : colors.filter(c => L.COLORS.find(x => x.n === c).d !== null); };
    function draw() {
      selects.replaceChildren(...bands.map((b, i) => { const s = ui.select(allowed(nb, i), b, e => { bands[i] = e.target.value; draw(); }); return ui.field(roles(nb)[i], s); }));
      const hex = n => L.COLORS.find(c => c.n === n).hex, tolIdx = nb >= 4 ? (nb === 4 ? 3 : 4) : -1;
      view.replaceChildren(h('div', { class: 'resistor' }, h('div', { class: 'lead' }), h('div', { class: 'body' }, ...bands.flatMap((b, i) => [i === tolIdx ? h('div', { class: 'band gap' }) : null, h('div', { class: 'band', style: { background: hex(b) } })])), h('div', { class: 'lead' })));
      const r = L.bandsToOhms(bands); if (!r) { result.replaceChildren(ui.note('That combination is not valid.', 'bad')); return; }
      const lo = r.ohms * (1 - r.tol / 100), hi = r.ohms * (1 + r.tol / 100);
      result.replaceChildren(ui.stats([['Resistance', L.fmtOhms(r.ohms), 1], ['Tolerance', '± ' + r.tol + ' %'], ['Actual range', L.fmtOhms(lo) + ' – ' + L.fmtOhms(hi)], r.tempco ? ['Temp. coefficient', r.tempco + ' ppm/°C'] : null, ['Nearest E24', L.fmtOhms(L.nearestStandard(r.ohms, 'E24'))]]));
    }
    nbSel.addEventListener('change', () => { nb = +nbSel.value; bands = nb === 4 ? ['Yellow', 'Violet', 'Red', 'Gold'] : nb === 5 ? ['Yellow', 'Violet', 'Black', 'Brown', 'Brown'] : ['Yellow', 'Violet', 'Black', 'Brown', 'Brown', 'Red']; draw(); });
    const rev = sit('Value to colors', '4.7k', '4.7k'), revOut = h('div'), revN = ui.select([[4, '4-band'], [5, '5-band']], 4);
    const doRev = () => { const o = pv(inp(rev).value), b = L.ohmsToBands(o, +revN.value); revOut.replaceChildren(b ? h('div', { class: 'out' }, [...b.digits, b.multiplier].join(' · ') + '  ·  then a tolerance band (gold = ±5%, brown = ±1%)') : ui.note('Enter a value between 0.01 Ω and 99 GΩ', 'bad')); };
    inp(rev).addEventListener('input', doRev); revN.addEventListener('change', doRev); doRev();
    root.append(ui.cols(2, ui.panel('Colors → value', ui.field('Number of bands', nbSel), view, selects, result), ui.panel('Value → colors', rev, ui.field('Bands', revN), revOut, ui.note('Tip: hold the resistor with the tolerance band (gold/silver) on the right and read from the left.'))));
    draw();
  } });

  TN.register({ id: 'ohms-law', cat: 'electronics', icon: '⚡', name: "Ohm's Law & Power", desc: 'Enter any two of V, I, R, P — get the other two.', tags: 'voltage current resistance watt power', render(root) {
    const f = { V: sit('Voltage V', 'volts', '12'), I: sit('Current I', 'amps', ''), R: sit('Resistance R', 'ohms', '4'), P: sit('Power P', 'watts', '') }, out = h('div');
    const run = () => { const o = {}; for (const k in f) { const x = pv(inp(f[k]).value); if (isFinite(x) && inp(f[k]).value.trim() !== '') o[k] = x; } if (Object.keys(o).length < 2) { out.replaceChildren(ui.note('Fill in any two values.')); return; } const used = Object.keys(o).slice(0, 4); const r = L.ohm(o); if (!r) { out.replaceChildren(ui.note('Fill in any two values.')); return; }
      out.replaceChildren(ui.stats([['Voltage', L.eng(r.V, 'V'), 1], ['Current', L.eng(r.I, 'A'), 1], ['Resistance', L.eng(r.R, 'Ω'), 1], ['Power', L.eng(r.P, 'W'), 1]]), Object.keys(o).length > 2 ? ui.note('You entered more than two values; the first two in the order V, I, R, P were used.') : null); };
    Object.values(f).forEach(x => inp(x).addEventListener('input', run));
    root.append(ui.cols(2, ui.panel('Known values', ...Object.values(f)), ui.panel('Result', out)));
    root.append(ui.panel('Formulas', h('p', { class: 'mono' }, 'V = I × R\nP = V × I = I²R = V²/R')));
    run();
  } });

  TN.register({ id: 'res-combo', cat: 'electronics', icon: '🪛', name: 'Series & Parallel Resistors', desc: 'Total resistance (also works for inductors; use inverse for capacitors).', tags: 'parallel series equivalent resistance', render(root) {
    const ta = ui.area({ value: '100\n220\n470', rows: 5, mono: true }), out = h('div');
    ui.live([ta], () => { const xs = ta.value.split(/[\s,;]+/).filter(Boolean).map(pv); if (xs.length < 2 || xs.some(x => !(x > 0))) { out.replaceChildren(ui.note('Enter at least two positive values, one per line (e.g. 4.7k).')); return; }
      out.replaceChildren(ui.stats([['In series', L.eng(L.series(xs), 'Ω'), 1], ['In parallel', L.eng(L.parallel(xs), 'Ω'), 1], ['Capacitors in series ≈', L.eng(L.parallel(xs), 'F')], ['Capacitors in parallel ≈', L.eng(L.series(xs), 'F')]]), ui.note('For capacitors the formulas swap: series capacitance uses the parallel formula. Last two rows read the same numbers as farads.')); });
    root.append(ui.cols(2, ui.panel('Values (one per line)', ta), ui.panel('Result', out)));
  } });

  TN.register({ id: 'divider', cat: 'electronics', icon: '➗', name: 'Voltage Divider', desc: 'Output voltage of a two-resistor divider; find R2 for a target.', tags: 'vout resistor divider adc sensor level shifter', render(root) {
    const vin = sit('Vin', 'volts', '5'), r1 = sit('R1 (top)', 'ohms', '10k'), r2 = sit('R2 (bottom)', 'ohms', '20k'), out = h('div');
    const tv = sit('Want Vout =', 'volts', '3.3'), tr1 = sit('With R1 =', 'ohms', '10k'), out2 = h('div');
    const run = () => { const a = pv(inp(vin).value), b = pv(inp(r1).value), c = pv(inp(r2).value); out.replaceChildren(a >= 0 && b > 0 && c > 0 ? ui.stats([['Vout', L.eng(L.divider(a, b, c).vout, 'V'), 1], ['Current', L.eng(L.divider(a, b, c).current, 'A')], ['Ratio', (c / (b + c)).toFixed(4)]]) : ui.note('Enter positive values.'));
      const t = pv(inp(tv).value), a2 = pv(inp(vin).value), rr1 = pv(inp(tr1).value); if (t > 0 && a2 > t && rr1 > 0) { const R2 = rr1 * t / (a2 - t); out2.replaceChildren(ui.stats([['Needed R2', L.fmtOhms(R2), 1], ['Nearest E24', L.fmtOhms(L.nearestStandard(R2, 'E24'))], ['Vout with E24', L.eng(L.divider(a2, rr1, L.nearestStandard(R2, 'E24')).vout, 'V')]])); } else out2.replaceChildren(ui.note('Need 0 < Vout < Vin.')); };
    [vin, r1, r2, tv, tr1].forEach(x => inp(x).addEventListener('input', run));
    root.append(ui.cols(2, ui.panel('Forward: Vout = Vin × R2 / (R1+R2)', vin, r1, r2, out), ui.panel('Reverse: pick R2 for a target Vout', tv, tr1, out2, ui.note('Uses Vin from the left panel. A divider is only accurate when the load draws much less current than the divider.'))));
    run();
  } });

  TN.register({ id: 'led-resistor', cat: 'electronics', icon: '💡', name: 'LED Resistor Calculator', desc: 'Series resistor for an LED, with power rating and nearest standard value.', tags: 'led current limiting arduino forward voltage', render(root) {
    const vs = sit('Supply voltage', 'V', '5'), vf = ui.select([[1.8, 'Red ≈ 1.8 V'], [2.0, 'Yellow / Orange ≈ 2.0 V'], [2.1, 'Green ≈ 2.1 V'], [3.0, 'Blue / White ≈ 3.0 V'], [3.3, 'Blue/White (high) ≈ 3.3 V']], 2.0), cur = ui.num({ value: 15 }), out = h('div');
    const run = () => { const a = pv(inp(vs).value), f = +vf.value, i = v(cur); if (!(a > f) || !(i > 0)) { out.replaceChildren(ui.note('Supply voltage must be higher than the LED forward voltage.', 'bad')); return; } const r = L.ledResistor(a, f, i), real = (a - f) / r.nearestUp * 1000;
      out.replaceChildren(ui.stats([['Exact resistor', L.fmtOhms(r.R), 1], ['Use (E24 ≥)', L.fmtOhms(r.nearestUp), 1], ['Actual current', real.toFixed(1) + ' mA'], ['Resistor dissipates', L.eng(((real / 1000) ** 2) * r.nearestUp, 'W')]]), ui.note('Typical indicator LED: 10–20 mA. Common Arduino/ESP pins should stay under their per-pin limit (often 20 mA).')); };
    [inp(vs), vf, cur].forEach(x => { x.addEventListener('input', run); x.addEventListener('change', run); });
    root.append(ui.cols(2, ui.panel('LED & supply', vs, ui.field('LED color (forward voltage)', vf), ui.field('Desired current (mA)', cur)), ui.panel('Result', out))); run();
  } });

  TN.register({ id: 'rc-filter', cat: 'electronics', icon: '〰️', name: 'RC Time Constant & Filter', desc: 'τ = RC, charge times and low-pass cutoff frequency.', tags: 'capacitor charge discharge cutoff filter debounce', render(root) {
    const r = sit('Resistance R', 'ohms', '10k'), c = sit('Capacitance C', 'farads', '100n'), out = h('div');
    const run = () => { const R = pv(inp(r).value), C = pv(inp(c).value); if (!(R > 0 && C > 0)) { out.replaceChildren(ui.note('Enter positive values.')); return; } const x = L.rc(R, C); out.replaceChildren(ui.stats([['Time constant τ', L.eng(x.tau, 's'), 1], ['Cutoff frequency fc', L.eng(x.fc, 'Hz'), 1], ['63% charged (1τ)', L.eng(x.t63, 's')], ['95% charged (3τ)', L.eng(x.t95, 's')], ['99% charged (4.6τ)', L.eng(x.t99, 's')]])); };
    [inp(r), inp(c)].forEach(x => x.addEventListener('input', run)); root.append(ui.cols(2, ui.panel('Components', r, c), ui.panel('Result', out))); run();
  } });

  TN.register({ id: 'timer555', cat: 'electronics', icon: '⏱️', name: '555 Timer (Astable)', desc: 'Frequency and duty cycle from R1, R2 and C.', tags: 'ne555 oscillator blink pwm astable', render(root) {
    const r1 = sit('R1', 'ohms', '1k'), r2 = sit('R2', 'ohms', '10k'), c = sit('C', 'farads', '10u'), out = h('div');
    const run = () => { const a = pv(inp(r1).value), b = pv(inp(r2).value), cc = pv(inp(c).value); if (!(a > 0 && b > 0 && cc > 0)) { out.replaceChildren(ui.note('Enter positive values.')); return; } const t = L.timer555(a, b, cc); out.replaceChildren(ui.stats([['Frequency', L.eng(t.freq, 'Hz'), 1], ['Duty cycle', t.duty.toFixed(1) + ' %'], ['High time', L.eng(t.high, 's')], ['Low time', L.eng(t.low, 's')], ['Period', L.eng(t.period, 's')]])); };
    [inp(r1), inp(r2), inp(c)].forEach(x => x.addEventListener('input', run)); root.append(ui.cols(2, ui.panel('Components', r1, r2, c, ui.note('f ≈ 1.44 / ((R1 + 2·R2) · C). Duty cycle is always above 50% in the basic astable circuit.')), ui.panel('Result', out))); run();
  } });

  TN.register({ id: 'cap-code', cat: 'electronics', icon: '🔋', name: 'Capacitor Code Decoder', desc: 'Decode 3-digit codes like 104 or 473 into pF, nF and µF.', tags: 'ceramic capacitor marking 104 473 smd', render(root) {
    const c = ui.text({ value: '104', mono: true, maxlength: 3, inputmode: 'numeric' }), out = h('div');
    ui.live([c], () => { const r = L.capCode(c.value); out.replaceChildren(r ? ui.stats([['Capacitance', L.eng(r.pF * 1e-12, 'F'), 1], ['In pF', L.round(r.pF, 3)], ['In nF', L.round(r.nF, 6)], ['In µF', L.round(r.uF, 8)]]) : ui.note('Type a 3-digit code, e.g. 104')); });
    root.append(ui.cols(2, ui.panel('Code', ui.field('3-digit code', c), ui.note('First two digits × 10^(third digit) picofarads. 104 → 10 × 10⁴ pF = 100 nF.')), ui.panel('Result', out)));
  } });

  TN.register({ id: 'adc-pwm', cat: 'electronics', icon: '📟', name: 'ADC & PWM Calculator', desc: 'ADC resolution/voltage steps, PWM average voltage for Arduino, ESP32, STM32.', tags: 'microcontroller analog digital bits resolution lsb duty arduino esp32 stm32', render(root) {
    const bits = ui.select([8, 10, 12, 14, 16].map(b => [b, b + '-bit']), 10), vref = sit('Vref', 'volts', '5'), vin = sit('Input voltage', 'volts', '2.5'), out = h('div'), code = ui.num({ value: 512 }), out2 = h('div');
    const duty = ui.num({ value: 50, min: 0 }), vcc = sit('Logic level', 'volts', '3.3'), out3 = h('div');
    const run = () => { const b = +bits.value, vr = pv(inp(vref).value), vi = pv(inp(vin).value); if (vr > 0 && vi >= 0) { const a = L.adc(b, vr, vi); out.replaceChildren(ui.stats([['ADC reading', a.code + ' of ' + (a.steps - 1), 1], ['Step size (1 LSB)', L.eng(a.lsb, 'V')], ['Levels', a.steps.toLocaleString()]])); } const cd = v(code); if (vr > 0 && cd >= 0) out2.replaceChildren(ui.stats([['Voltage for code ' + cd, L.eng(cd * vr / (2 ** b), 'V')]]));
      const dd = v(duty), vc = pv(inp(vcc).value); out3.replaceChildren(dd >= 0 && dd <= 100 && vc > 0 ? ui.stats([['Average output', L.eng(vc * dd / 100, 'V'), 1], ['8-bit PWM value', Math.round(dd / 100 * 255) + ' / 255'], ['10-bit PWM value', Math.round(dd / 100 * 1023) + ' / 1023']]) : ui.note('Duty cycle: 0–100 %.')); };
    [bits, inp(vref), inp(vin), code, duty, inp(vcc)].forEach(x => { x.addEventListener('input', run); x.addEventListener('change', run); });
    root.append(ui.cols(2, ui.panel('ADC: voltage → reading', ui.field('Resolution', bits), vref, vin, out, ui.field('…or code → voltage', code), out2), ui.panel('PWM → average voltage', ui.field('Duty cycle (%)', duty), vcc, out3, ui.note('Average voltage is what a simple RC filter or an LED/motor “sees”.')))); run();
  } });

  /* Logic / Boolean algebra */
  TN.register({ id: 'logic', cat: 'electronics', icon: '🧠', name: 'Boolean Algebra & Truth Table', desc: 'Truth table, minimal SOP form (Quine–McCluskey) and minterms.', tags: 'logic gate karnaugh kmap simplify and or not xor nand nor digital', isNew: true, render(root) {
    const ex = ["A + A'B", "(A+B)(A+C)", 'A XOR B', "AB + A'C + BC", "!(A & B) | C"], ta = ui.text({ value: "AB + A'B + AB'", mono: true }), out = h('div');
    const run = () => { out.replaceChildren(); try { const r = L.simplifyBool(ta.value), n = r.vars.length;
        out.append(ui.stats([['Minimal expression', r.sop, 1], ['Variables', r.vars.join(', ')], ['Minterms Σm', '(' + r.minterms.join(', ') + ')'], ['Maxterms ΠM', '(' + r.rows.map((x, i) => x.out ? -1 : i).filter(i => i >= 0).join(', ') + ')']]),
          h('div', { class: 'scroll-y', style: { marginTop: '12px' } }, ui.table([...r.vars, 'Out'], r.rows.map(x => [...x.inputs.map(String), h('b', {}, String(x.out))]))));
        if (n === 2 || n === 3 || n === 4) out.append(kmap(r)); } catch (e) { out.append(ui.note(e.message, 'bad')); } };
    function kmap(r) { const n = r.vars.length, rowsV = n === 2 ? 1 : n === 3 ? 1 : 2, colsV = n - rowsV, gray = k => k === 1 ? ['0', '1'] : ['00', '01', '11', '10'];
      const rl = gray(rowsV), cl = gray(colsV), cell = (rb, cb) => { const idx = parseInt(rb + cb, 2); return r.rows[idx].out; };
      return h('div', { style: { marginTop: '14px' } }, h('div', { class: 'lbl' }, 'Karnaugh map'), h('div', { class: 'scroll-x' }, h('table', { class: 't', style: { textAlign: 'center', width: 'auto' } }, h('thead', {}, h('tr', {}, h('th', {}, r.vars.slice(0, rowsV).join('') + '\\' + r.vars.slice(rowsV).join('')), ...cl.map(c => h('th', { style: { textAlign: 'center' } }, c)))), h('tbody', {}, ...rl.map(rb => h('tr', {}, h('th', {}, rb), ...cl.map(cb => h('td', { style: { textAlign: 'center', fontWeight: 700, background: cell(rb, cb) ? 'var(--accent-soft)' : '' } }, String(cell(rb, cb))))))))));
    }
    ta.addEventListener('input', run);
    root.append(ui.panel('Expression', ui.field('Boolean expression', ta, 'Letters side by side mean AND (AB = A·B). Use + for OR, \' or ! or ~ for NOT, ^ or XOR for XOR, and words AND OR NOT NAND NOR XNOR. Up to 8 variables.'), h('div', { class: 'chips', style: { margin: 0, padding: 0 } }, ex.map(e => h('button', { class: 'chip', onclick: () => { ta.value = e; run(); } }, e)))), ui.panel('Result', out)); run();
  } });

  TN.register({ id: 'logic-gates', cat: 'electronics', icon: '🔀', name: 'Logic Gate Simulator', desc: 'Toggle inputs and see AND, OR, NAND, NOR, XOR, XNOR, NOT — plus half & full adder.', tags: 'gates digital adder half full led simulator', render(root) {
    const st = { A: 0, B: 0, C: 0 }, box = h('div');
    const gates = { AND: (a, b) => a & b, OR: (a, b) => a | b, NAND: (a, b) => +!(a & b), NOR: (a, b) => +!(a | b), XOR: (a, b) => a ^ b, XNOR: (a, b) => +!(a ^ b) };
    const led = on => h('span', { class: 'led' + (on ? ' on' : '') });
    const tg = k => h('button', { class: 'btn ' + (st[k] ? '' : 'secondary'), style: { minWidth: '88px' }, onclick: () => { st[k] ^= 1; draw(); } }, k + ' = ' + st[k]);
    function draw() {
      const { A, B, C } = st; const sum = A ^ B ^ C, carry = (A & B) | (C & (A ^ B)), hs = A ^ B, hc = A & B;
      box.replaceChildren(ui.panel('Inputs (tap to toggle)', ui.btns(tg('A'), tg('B'), tg('C'))),
        ui.cols(2, ui.panel('Two-input gates (A, B)', ui.table(['Gate', 'Output', ''], [...Object.entries(gates).map(([n, f]) => [n, String(f(A, B)), led(f(A, B))]), ['NOT A', String(+!A), led(!A)]])),
          ui.panel('Adders', ui.table(['Circuit', 'Sum', 'Carry'], [['Half adder (A+B)', hs + ' ', hc + ' '], ['Full adder (A+B+Cin=C)', sum + ' ', carry + ' ']]), ui.note('Half adder: Sum = A XOR B, Carry = A AND B.\nFull adder: Sum = A ⊕ B ⊕ Cin, Cout = AB + Cin(A ⊕ B).'))));
    }
    draw(); root.append(box);
  } });

  TN.register({ id: 'float-bits', cat: 'electronics', icon: '🧬', name: 'IEEE-754 Float Visualizer', desc: 'See sign, exponent and mantissa bits of 32-bit and 64-bit floats.', tags: 'floating point binary single double hex bits twos complement', render(root) {
    const n = ui.text({ value: '0.1', mono: true }), out = h('div'), tc = ui.num({ value: -5 }), tcb = ui.select([8, 16, 32].map(b => [b, b + '-bit']), 8), out2 = h('div');
    const colorBits = f => h('div', { class: 'out' }, h('span', { style: { color: '#d62828' } }, f.sign), ' ', h('span', { style: { color: '#1d4ed8' } }, f.exp), ' ', h('span', { style: { color: '#2a9d4b' } }, f.frac));
    ui.live([n], () => { const x = n.value.trim().toLowerCase() === 'nan' ? NaN : parseFloat(n.value); if (isNaN(x) && n.value.trim().toLowerCase() !== 'nan') { out.replaceChildren(ui.note('Type a number like 0.1, -2.5, 1e10')); return; } const a = L.float32(x), b = L.float64(x);
      out.replaceChildren(h('div', { class: 'lbl' }, 'Float32  (1 sign · 8 exponent · 23 mantissa)'), colorBits(a), ui.stats([['Hex', '0x' + a.hex], ['Stored value', String(a.stored)]]), h('div', { class: 'lbl', style: { marginTop: '10px' } }, 'Float64  (1 · 11 · 52)'), colorBits(b), ui.stats([['Hex', '0x' + b.hex]]), ui.note('Red = sign, blue = exponent, green = mantissa. 0.1 cannot be stored exactly in binary — that is why 0.1 + 0.2 ≠ 0.3 in most languages.')); });
    ui.live([tc, tcb], () => { const r = L.twosComplement(v(tc), +tcb.value); out2.replaceChildren(r ? ui.stats([['Binary', r, 1], ['Hex', parseInt(r.length > 30 ? '0' : r, 2).toString(16).toUpperCase() && BigInt('0b' + r).toString(16).toUpperCase()]]) : ui.note('Out of range for that width.')); });
    root.append(ui.cols(2, ui.panel('Floating point', ui.field('Number', n), out), ui.panel("Two's complement integer", ui.field('Decimal value', tc), ui.field('Width', tcb), out2)));
  } });

  TN.register({ id: 'subnet', cat: 'electronics', icon: '🌐', name: 'IPv4 Subnet Calculator', desc: 'Network, broadcast, mask, host range and host count from IP/CIDR.', tags: 'cidr network ip address mask wildcard hosts networking', render(root) {
    const ip = ui.text({ value: '192.168.1.130', mono: true, inputmode: 'decimal' }), cidr = ui.num({ value: 26, min: 0 }), out = h('div');
    ui.live([ip, cidr], () => { const r = L.subnet(ip.value, Math.round(v(cidr))); if (!r) { out.replaceChildren(ui.note('Enter a valid IPv4 address and a prefix from 0 to 32.', 'bad')); return; }
      const bin = L.ipToInt(r.mask).toString(2).padStart(32, '0').replace(/(.{8})(?!$)/g, '$1.');
      out.replaceChildren(ui.stats([['Network', r.network + '/' + r.cidr, 1], ['Broadcast', r.broadcast], ['Subnet mask', r.mask], ['Wildcard', r.wildcard], ['First host', r.first], ['Last host', r.last], ['Usable hosts', r.hosts.toLocaleString()], ['Total addresses', r.total.toLocaleString()]]), h('div', { class: 'out', style: { marginTop: '10px' } }, 'Mask bits: ' + bin)); });
    root.append(ui.cols(2, ui.panel('Address', ui.field('IPv4 address', ip), ui.field('Prefix length (/n)', cidr)), ui.panel('Result', out)));
  } });
})();
