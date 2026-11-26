/* ToolNest logic library — pure functions, no DOM. Works in browser (window.TNLogic) and Node (module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TNLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const L = {};
  const round = (x, d = 2) => { const m = Math.pow(10, d); return Math.round((x + Number.EPSILON) * m) / m; };
  L.round = round;

  /* ───────────── FINANCE ───────────── */
  L.emi = function (principal, annualPct, months) {
    const r = annualPct / 12 / 100;
    if (months <= 0) return NaN;
    if (r === 0) return principal / months;
    const p = Math.pow(1 + r, months);
    return principal * r * p / (p - 1);
  };
  L.amortization = function (principal, annualPct, months) {
    const r = annualPct / 12 / 100, emi = L.emi(principal, annualPct, months);
    let bal = principal; const rows = [];
    for (let m = 1; m <= months; m++) {
      const interest = bal * r; let princ = emi - interest;
      if (m === months) princ = bal;
      bal = Math.max(0, bal - princ);
      rows.push({ month: m, emi, interest, principal: princ, balance: bal });
    }
    return rows;
  };
  // SIP future value, payments at the START of each month (common calculator convention)
  L.sip = function (monthly, annualPct, years) {
    const r = annualPct / 12 / 100, n = Math.round(years * 12);
    const invested = monthly * n;
    const fv = r === 0 ? invested : monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
    return { invested, fv, gain: fv - invested };
  };
  L.compound = function (principal, annualPct, years, perYear = 1) {
    const fv = principal * Math.pow(1 + annualPct / 100 / perYear, perYear * years);
    return { fv, interest: fv - principal };
  };
  L.simpleInterest = (p, rate, years) => ({ interest: p * rate * years / 100, total: p + p * rate * years / 100 });
  L.gst = function (amount, ratePct, inclusive) {
    let base, gst;
    if (inclusive) { base = amount * 100 / (100 + ratePct); gst = amount - base; }
    else { base = amount; gst = amount * ratePct / 100; }
    return { base, gst, cgst: gst / 2, sgst: gst / 2, total: base + gst };
  };
  L.percentOf = (pct, of) => pct / 100 * of;
  L.whatPercent = (part, whole) => part / whole * 100;
  L.percentChange = (from, to) => (to - from) / Math.abs(from) * 100;
  L.discount = function (price, offPct, extraPct = 0) {
    const a = price * (1 - offPct / 100), b = a * (1 - extraPct / 100);
    return { afterFirst: a, final: b, saved: price - b, effectivePct: (price - b) / price * 100 };
  };
  L.splitBill = function (total, people, tipPct = 0) {
    const tip = total * tipPct / 100, grand = total + tip;
    return { tip, grand, each: grand / people };
  };
  L.rule72 = (ratePct) => 72 / ratePct;

  /* ───────────── HEALTH / DATES ───────────── */
  L.bmi = function (kg, cm) {
    const m = cm / 100, v = kg / (m * m);
    let cat = v < 18.5 ? 'Underweight' : v < 25 ? 'Healthy range' : v < 30 ? 'Overweight' : 'Obese range';
    return { bmi: v, category: cat, healthyKg: [18.5 * m * m, 24.9 * m * m] };
  };
  L.bmr = function (sex, kg, cm, age) {
    const base = 10 * kg + 6.25 * cm - 5 * age;
    const bmr = sex === 'male' ? base + 5 : base - 161;
    const f = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, athlete: 1.9 };
    const tdee = {}; for (const k in f) tdee[k] = bmr * f[k];
    return { bmr, tdee };
  };
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  L.dateDiff = function (a, b) { // y/m/d difference, a<=b
    a = startOfDay(a); b = startOfDay(b);
    if (a > b) [a, b] = [b, a];
    let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate();
    if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
    if (m < 0) { y--; m += 12; }
    const days = Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
    return { years: y, months: m, days: d, totalDays: days, totalWeeks: Math.floor(days / 7), totalMonths: y * 12 + m };
  };
  L.nextBirthday = function (dob, today) {
    today = startOfDay(today);
    let n = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    if (n < today) n = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
    return { date: n, inDays: Math.round((n - today) / 86400000), weekday: n.getDay() };
  };
  L.addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x; };
  L.workingDays = function (a, b) {
    a = startOfDay(a); b = startOfDay(b); if (a > b) [a, b] = [b, a];
    let c = 0; for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) { const w = d.getDay(); if (w !== 0 && w !== 6) c++; }
    return c;
  };
  // Attendance: how many more classes must be attended / can be skipped
  L.attendance = function (attended, total, targetPct) {
    const cur = total ? attended / total * 100 : 0, t = targetPct / 100;
    let need = 0, canSkip = 0;
    if (cur < targetPct) need = Math.max(0, Math.ceil((t * total - attended) / (1 - t)));
    else canSkip = Math.max(0, Math.floor(attended / t - total));
    return { current: cur, need, canSkip };
  };
  L.gpa = function (rows) { // [{credits, points}]
    let c = 0, p = 0; rows.forEach(r => { c += r.credits; p += r.credits * r.points; });
    return c ? p / c : 0;
  };

  /* ───────────── MATH ───────────── */
  L.gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
  L.lcm = (a, b) => (a && b) ? Math.abs(a * b) / L.gcd(a, b) : 0;
  L.isPrime = function (n) {
    if (!Number.isInteger(n) || n < 2) return false; if (n < 4) return true; if (n % 2 === 0 || n % 3 === 0) return false;
    for (let i = 5; i * i <= n; i += 6) if (n % i === 0 || n % (i + 2) === 0) return false; return true;
  };
  L.factorize = function (n) {
    const f = []; if (n < 2) return f;
    for (let p = 2; p * p <= n; p++) while (n % p === 0) { f.push(p); n /= p; }
    if (n > 1) f.push(n); return f;
  };
  L.quadratic = function (a, b, c) {
    if (a === 0) return b === 0 ? { type: 'none' } : { type: 'linear', roots: [-c / b] };
    const D = b * b - 4 * a * c;
    if (D > 0) return { type: 'real', D, roots: [(-b + Math.sqrt(D)) / (2 * a), (-b - Math.sqrt(D)) / (2 * a)] };
    if (D === 0) return { type: 'double', D, roots: [-b / (2 * a)] };
    return { type: 'complex', D, re: -b / (2 * a), im: Math.sqrt(-D) / (2 * a) };
  };
  L.stats = function (xs) {
    const n = xs.length; if (!n) return null;
    const s = [...xs].sort((a, b) => a - b), sum = xs.reduce((a, b) => a + b, 0), mean = sum / n;
    const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    const cnt = new Map(); xs.forEach(x => cnt.set(x, (cnt.get(x) || 0) + 1));
    const mx = Math.max(...cnt.values()); const mode = mx > 1 ? [...cnt].filter(e => e[1] === mx).map(e => e[0]) : [];
    const varP = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / n;
    const varS = n > 1 ? xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1) : NaN;
    return { n, sum, mean, median, mode, min: s[0], max: s[n - 1], range: s[n - 1] - s[0], varP, sdP: Math.sqrt(varP), varS, sdS: Math.sqrt(varS) };
  };
  L.toRoman = function (n) {
    if (!Number.isInteger(n) || n < 1 || n > 3999) return null;
    const m = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = ''; for (const [v, r] of m) while (n >= v) { s += r; n -= v; } return s;
  };
  L.fromRoman = function (s) {
    s = s.toUpperCase().trim(); if (!/^[MDCLXVI]+$/.test(s)) return null;
    const v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }; let t = 0;
    for (let i = 0; i < s.length; i++) { const a = v[s[i]], b = v[s[i + 1]] || 0; t += a < b ? -a : a; }
    return L.toRoman(t) === s ? t : null;
  };
  // Safe expression evaluator (shunting-yard) — no eval()
  L.evalExpr = function (src, opts = {}) {
    const deg = !!opts.degrees;
    const toks = []; const re = /\s*(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|[a-zA-Z_]+|\*\*|[-+*/^%!(),×÷√π])/gy; let m, pos = 0;
    src = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi').replace(/√/g, 'sqrt');
    re.lastIndex = 0;
    while (pos < src.length) {
      re.lastIndex = pos; m = re.exec(src);
      if (!m) { if (/^\s*$/.test(src.slice(pos))) break; throw new Error('Unexpected character: ' + src.slice(pos).trim()[0]); }
      pos = re.lastIndex; toks.push(m[1]);
    }
    const consts = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };
    const r = x => deg ? x * Math.PI / 180 : x, ri = x => deg ? x * 180 / Math.PI : x;
    const fns = {
      sin: x => Math.sin(r(x)), cos: x => Math.cos(r(x)), tan: x => Math.tan(r(x)),
      asin: x => ri(Math.asin(x)), acos: x => ri(Math.acos(x)), atan: x => ri(Math.atan(x)),
      sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sqrt: Math.sqrt, cbrt: Math.cbrt,
      ln: Math.log, log: Math.log10, log2: Math.log2, exp: Math.exp, abs: Math.abs,
      floor: Math.floor, ceil: Math.ceil, round: Math.round, fact: x => L.factorial(x)
    };
    let i = 0;
    const peek = () => toks[i], next = () => toks[i++];
    function parseExpr() { let v = parseTerm(); while (peek() === '+' || peek() === '-') { const o = next(); const t = parseTerm(); v = o === '+' ? v + t : v - t; } return v; }
    function parseTerm() {
      let v = parseUnary();
      for (;;) {
        const t = peek();
        if (t === '*' || t === '/' || t === '%') { next(); const x = parseUnary(); v = t === '*' ? v * x : t === '/' ? v / x : v % x; }
        else if (t && (t === '(' || /^[a-zA-Z_]/.test(t) || /^[\d.]/.test(t))) { v = v * parseUnary(); } // implicit multiplication: 2(3), 2pi
        else break;
      }
      return v;
    }
    function parseUnary() { if (peek() === '-') { next(); return -parseUnary(); } if (peek() === '+') { next(); return parseUnary(); } return parsePow(); }
    function parsePow() { let b = parsePostfix(); if (peek() === '^' || peek() === '**') { next(); const e = parseUnary(); return Math.pow(b, e); } return b; }
    function parsePostfix() { let v = parseAtom(); while (peek() === '!') { next(); v = L.factorial(v); } return v; }
    function parseAtom() {
      const t = next();
      if (t === undefined) throw new Error('Incomplete expression');
      if (t === '(') { const v = parseExpr(); if (next() !== ')') throw new Error('Missing )'); return v; }
      if (/^[\d.]/.test(t)) return parseFloat(t);
      if (/^[a-zA-Z_]/.test(t)) {
        const k = t.toLowerCase();
        if (k in consts) return consts[k];
        if (k in fns) {
          if (peek() === '(') { next(); const a = parseExpr(); if (next() !== ')') throw new Error('Missing )'); return fns[k](a); }
          return fns[k](parseUnary());
        }
        if (k === 'ans' && opts.ans !== undefined) return opts.ans;
        throw new Error('Unknown name: ' + t);
      }
      throw new Error('Unexpected ' + t);
    }
    const v = parseExpr();
    if (i < toks.length) throw new Error('Unexpected ' + toks[i]);
    return v;
  };
  L.factorial = function (n) { if (!Number.isInteger(n) || n < 0 || n > 170) return NaN; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };

  /* ───────────── NUMBER → WORDS (Indian + International) ───────────── */
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const below1000 = n => { let s = ''; if (n >= 100) { s += ones[Math.floor(n / 100)] + ' Hundred'; n %= 100; if (n) s += ' '; } if (n >= 20) { s += tens[Math.floor(n / 10)]; if (n % 10) s += '-' + ones[n % 10]; } else if (n) s += ones[n]; return s; };
  L.intToWords = function (n, system = 'indian') {
    n = Math.floor(Math.abs(n)); if (n === 0) return 'Zero';
    if (n > 999999999999999) return null;
    const parts = [];
    if (system === 'indian') {
      const units = [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']];
      for (const [v, name] of units) { if (n >= v) { const q = Math.floor(n / v); parts.push((q >= 100 && v === 10000000 ? L.intToWords(q, 'indian') : below1000(q)) + ' ' + name); n %= v; } }
      if (n) parts.push(below1000(n));
    } else {
      const units = [[1e12, 'Trillion'], [1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
      for (const [v, name] of units) { if (n >= v) { parts.push(below1000(Math.floor(n / v)) + ' ' + name); n %= v; } }
      if (n) parts.push(below1000(n));
    }
    return parts.join(' ');
  };
  L.amountWords = function (amount, system = 'indian', cur = { main: 'Rupees', sub: 'Paise' }) {
    const neg = amount < 0; amount = Math.abs(amount);
    const whole = Math.floor(amount), frac = Math.round((amount - whole) * 100);
    let s = (neg ? 'Minus ' : '') + cur.main + ' ' + L.intToWords(whole, system);
    if (frac) s += ' and ' + L.intToWords(frac, system) + ' ' + cur.sub;
    return s + ' Only';
  };

  /* ───────────── UNIT CONVERSION ───────────── */
  L.UNITS = {
    Length: { m: ['Metre', 1], km: ['Kilometre', 1000], cm: ['Centimetre', 0.01], mm: ['Millimetre', 0.001], um: ['Micrometre', 1e-6], nm: ['Nanometre', 1e-9], mi: ['Mile', 1609.344], yd: ['Yard', 0.9144], ft: ['Foot', 0.3048], in: ['Inch', 0.0254], nmi: ['Nautical mile', 1852] },
    Mass: { kg: ['Kilogram', 1], g: ['Gram', 0.001], mg: ['Milligram', 1e-6], t: ['Tonne', 1000], q: ['Quintal', 100], lb: ['Pound', 0.45359237], oz: ['Ounce', 0.028349523125], st: ['Stone', 6.35029318], tola: ['Tola', 0.01166375] },
    Area: { m2: ['Square metre', 1], km2: ['Square km', 1e6], ha: ['Hectare', 1e4], ac: ['Acre', 4046.8564224], cent: ['Cent (435.6 sq ft)', 40.4685642240], ft2: ['Square foot', 0.09290304], in2: ['Square inch', 0.00064516], yd2: ['Square yard', 0.83612736], cm2: ['Square cm', 1e-4], mi2: ['Square mile', 2589988.110336] },
    Volume: { l: ['Litre', 1], ml: ['Millilitre', 0.001], m3: ['Cubic metre', 1000], galus: ['Gallon (US)', 3.785411784], galuk: ['Gallon (UK)', 4.54609], qt: ['Quart (US)', 0.946352946], pt: ['Pint (US)', 0.473176473], cup: ['Cup (US)', 0.2365882365], floz: ['Fluid oz (US)', 0.0295735295625], tbsp: ['Tablespoon (US)', 0.01478676478125], tsp: ['Teaspoon (US)', 0.00492892159375], ft3: ['Cubic foot', 28.316846592], in3: ['Cubic inch', 0.016387064] },
    Speed: { ms: ['Metre/second', 1], kmh: ['Km/hour', 1 / 3.6], mph: ['Miles/hour', 0.44704], kn: ['Knot', 1852 / 3600], fts: ['Feet/second', 0.3048], mach: ['Mach (sea level)', 340.29] },
    Time: { s: ['Second', 1], ms: ['Millisecond', 0.001], us: ['Microsecond', 1e-6], min: ['Minute', 60], h: ['Hour', 3600], d: ['Day', 86400], wk: ['Week', 604800], mo: ['Month (avg)', 2629800], yr: ['Year (365.25 d)', 31557600] },
    Data: { B: ['Byte', 1], KB: ['Kilobyte (1000)', 1e3], MB: ['Megabyte', 1e6], GB: ['Gigabyte', 1e9], TB: ['Terabyte', 1e12], KiB: ['Kibibyte (1024)', 1024], MiB: ['Mebibyte', 1048576], GiB: ['Gibibyte', 1073741824], TiB: ['Tebibyte', 1099511627776], bit: ['Bit', 0.125], Kb: ['Kilobit', 125], Mb: ['Megabit', 125000], Gb: ['Gigabit', 125000000] },
    Energy: { J: ['Joule', 1], kJ: ['Kilojoule', 1000], cal: ['Calorie', 4.184], kcal: ['Kilocalorie', 4184], Wh: ['Watt-hour', 3600], kWh: ['Kilowatt-hour', 3.6e6], eV: ['Electronvolt', 1.602176634e-19], BTU: ['BTU', 1055.05585262] },
    Pressure: { Pa: ['Pascal', 1], kPa: ['Kilopascal', 1000], bar: ['Bar', 1e5], atm: ['Atmosphere', 101325], psi: ['PSI', 6894.757293168], mmHg: ['mmHg', 133.322387415] },
    Power: { W: ['Watt', 1], kW: ['Kilowatt', 1000], MW: ['Megawatt', 1e6], hp: ['Horsepower (mech.)', 745.69987158227], mW: ['Milliwatt', 0.001] },
    Frequency: { Hz: ['Hertz', 1], kHz: ['Kilohertz', 1e3], MHz: ['Megahertz', 1e6], GHz: ['Gigahertz', 1e9], rpm: ['RPM', 1 / 60] },
    Angle: { deg: ['Degree', 1], rad: ['Radian', 180 / Math.PI], grad: ['Gradian', 0.9], turn: ['Turn', 360] },
    Temperature: { C: ['Celsius', 0], F: ['Fahrenheit', 0], K: ['Kelvin', 0] }
  };
  L.convertUnit = function (cat, from, to, v) {
    if (cat === 'Temperature') {
      let c = from === 'C' ? v : from === 'F' ? (v - 32) * 5 / 9 : v - 273.15;
      return to === 'C' ? c : to === 'F' ? c * 9 / 5 + 32 : c + 273.15;
    }
    const U = L.UNITS[cat]; return v * U[from][1] / U[to][1];
  };
  L.fmtNum = function (x, maxSig = 10) {
    if (!isFinite(x)) return String(x); if (x === 0) return '0';
    const a = Math.abs(x);
    if (a >= 1e15 || a < 1e-6) return x.toExponential(6).replace(/\.?0+e/, 'e');
    return String(parseFloat(x.toPrecision(maxSig)));
  };
  L.toBase = function (str, from, to) {
    str = String(str).trim().toLowerCase().replace(/^0[xbo]/, '').replace(/[\s_]/g, '');
    const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
    if (!str) return null; let n = 0n; const B = BigInt(from);
    for (const ch of str) { const d = digits.indexOf(ch); if (d < 0 || d >= from) return null; n = n * B + BigInt(d); }
    return n.toString(to).toUpperCase();
  };

  /* ───────────── ELECTRONICS ───────────── */
  L.COLORS = [
    { n: 'Black', hex: '#111111', d: 0, m: 1, tol: null },
    { n: 'Brown', hex: '#7b3f00', d: 1, m: 10, tol: 1, tc: 100 },
    { n: 'Red', hex: '#d62828', d: 2, m: 100, tol: 2, tc: 50 },
    { n: 'Orange', hex: '#f77f00', d: 3, m: 1e3, tol: null, tc: 15 },
    { n: 'Yellow', hex: '#fcd12a', d: 4, m: 1e4, tol: null, tc: 25 },
    { n: 'Green', hex: '#2a9d4b', d: 5, m: 1e5, tol: 0.5 },
    { n: 'Blue', hex: '#1d4ed8', d: 6, m: 1e6, tol: 0.25, tc: 10 },
    { n: 'Violet', hex: '#7e22ce', d: 7, m: 1e7, tol: 0.1, tc: 5 },
    { n: 'Grey', hex: '#8d99ae', d: 8, m: 1e8, tol: 0.05 },
    { n: 'White', hex: '#f8f9fa', d: 9, m: 1e9, tol: null },
    { n: 'Gold', hex: '#c9a227', d: null, m: 0.1, tol: 5 },
    { n: 'Silver', hex: '#b8bcc4', d: null, m: 0.01, tol: 10 }
  ];
  // bands: array of color names; 4-band: d d m tol; 5-band: d d d m tol; 6-band adds tempco
  L.bandsToOhms = function (names) {
    const C = n => L.COLORS.find(c => c.n === n);
    const n = names.length; if (n < 3 || n > 6) return null;
    const nd = n >= 5 ? 3 : 2; let val = 0;
    for (let i = 0; i < nd; i++) { const c = C(names[i]); if (!c || c.d === null) return null; val = val * 10 + c.d; }
    const mc = C(names[nd]); if (!mc) return null;
    const ohms = val * mc.m;
    let tol = 20; if (n >= 4) { const tc = C(names[nd + 1]); if (!tc || tc.tol === null) return null; tol = tc.tol; }
    let tempco = null; if (n === 6) { const t = C(names[5]); tempco = t && t.tc ? t.tc : null; }
    return { ohms, tol, tempco };
  };
  L.ohmsToBands = function (ohms, nBands = 4) {
    if (!(ohms > 0)) return null;
    const nd = nBands >= 5 ? 3 : 2;
    let e = Math.floor(Math.log10(ohms)) - (nd - 1); let sig = Math.round(ohms / Math.pow(10, e));
    if (sig >= Math.pow(10, nd)) { sig = Math.round(sig / 10); e++; }
    if (e < -2 || e > 9) return null;
    const digs = String(sig).padStart(nd, '0').split('').map(Number);
    const col = d => L.COLORS.find(c => c.d === d).n;
    const mult = L.COLORS.find(c => Math.abs(c.m - Math.pow(10, e)) < Math.pow(10, e) * 1e-9);
    if (!mult) return null;
    return { digits: digs.map(col), multiplier: mult.n, sig, exp: e };
  };
  L.SERIES = {
    E12: [100, 120, 150, 180, 220, 270, 330, 390, 470, 560, 680, 820],
    E24: [100, 110, 120, 130, 150, 160, 180, 200, 220, 240, 270, 300, 330, 360, 390, 430, 470, 510, 560, 620, 680, 750, 820, 910],
    E96: [100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130, 133, 137, 140, 143, 147, 150, 154, 158, 162, 165, 169, 174, 178, 182, 187, 191, 196, 200, 205, 210, 215, 221, 226, 232, 237, 243, 249, 255, 261, 267, 274, 280, 287, 294, 301, 309, 316, 324, 332, 340, 348, 357, 365, 374, 383, 392, 402, 412, 422, 432, 442, 453, 464, 475, 487, 499, 511, 523, 536, 549, 562, 576, 590, 604, 619, 634, 649, 665, 681, 698, 715, 732, 750, 768, 787, 806, 825, 845, 866, 887, 909, 931, 953, 976]
  };
  L.nearestStandard = function (ohms, series = 'E24', dir = 'nearest') {
    if (!(ohms > 0)) return null;
    const S = L.SERIES[series], dec = Math.floor(Math.log10(ohms)), cands = [];
    for (let d = dec - 1; d <= dec + 1; d++) S.forEach(v => cands.push(v / 100 * Math.pow(10, d)));
    cands.sort((a, b) => a - b);
    if (dir === 'up') return cands.find(c => c >= ohms * (1 - 1e-9));
    if (dir === 'down') return [...cands].reverse().find(c => c <= ohms * (1 + 1e-9));
    return cands.reduce((b, c) => Math.abs(c - ohms) < Math.abs(b - ohms) ? c : b);
  };
  L.fmtOhms = function (o) { const a = Math.abs(o); if (a >= 1e9) return round(o / 1e9, 3) + ' GΩ'; if (a >= 1e6) return round(o / 1e6, 3) + ' MΩ'; if (a >= 1e3) return round(o / 1e3, 3) + ' kΩ'; return round(o, 3) + ' Ω'; };
  L.eng = function (x, unit = '') {
    if (x === 0 || !isFinite(x)) return '0 ' + unit;
    const p = [['T', 1e12], ['G', 1e9], ['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['µ', 1e-6], ['n', 1e-9], ['p', 1e-12]];
    const a = Math.abs(x); for (const [s, v] of p) if (a >= v * 0.9999999) return parseFloat((x / v).toPrecision(4)) + ' ' + s + unit;
    return parseFloat(x.toPrecision(4)) + ' ' + unit;
  };
  // Ohm's law: pass any two of {V,I,R,P}
  L.ohm = function ({ V, I, R, P }) {
    const has = k => k !== undefined && k !== null && !isNaN(k);
    const n = [V, I, R, P].filter(has).length; if (n < 2) return null;
    if (has(V) && has(I)) { R = V / I; P = V * I; }
    else if (has(V) && has(R)) { I = V / R; P = V * V / R; }
    else if (has(V) && has(P)) { I = P / V; R = V * V / P; }
    else if (has(I) && has(R)) { V = I * R; P = I * I * R; }
    else if (has(I) && has(P)) { V = P / I; R = P / (I * I); }
    else if (has(R) && has(P)) { V = Math.sqrt(P * R); I = Math.sqrt(P / R); }
    return { V, I, R, P };
  };
  L.series = a => a.reduce((x, y) => x + y, 0);
  L.parallel = a => 1 / a.reduce((x, y) => x + 1 / y, 0);
  L.divider = (vin, r1, r2) => ({ vout: vin * r2 / (r1 + r2), current: vin / (r1 + r2) });
  L.ledResistor = function (vs, vf, mA) { const I = mA / 1000, R = (vs - vf) / I; return { R, power: I * I * R, nearestUp: L.nearestStandard(R, 'E24', 'up') }; };
  L.rc = (R, C) => ({ tau: R * C, t63: R * C, t95: 3 * R * C, t99: 4.6 * R * C, fc: 1 / (2 * Math.PI * R * C) });
  L.timer555 = function (r1, r2, c) {
    const th = 0.693 * (r1 + r2) * c, tl = 0.693 * r2 * c; return { high: th, low: tl, period: th + tl, freq: 1 / (th + tl), duty: th / (th + tl) * 100 };
  };
  L.capCode = function (code) {
    code = String(code).trim(); if (!/^\d{3}$/.test(code)) return null;
    const pf = (parseInt(code.slice(0, 2), 10)) * Math.pow(10, parseInt(code[2], 10)); return { pF: pf, nF: pf / 1000, uF: pf / 1e6 };
  };
  L.adc = (bits, vref, vin) => { const steps = Math.pow(2, bits), lsb = vref / steps; return { steps, lsb, code: Math.min(steps - 1, Math.floor(vin / lsb)) }; };
  // IPv4 subnet
  L.ipToInt = s => { const p = s.trim().split('.'); if (p.length !== 4) return null; let n = 0; for (const x of p) { if (!/^\d{1,3}$/.test(x) || +x > 255) return null; n = n * 256 + +x; } return n >>> 0; };
  L.intToIp = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  L.subnet = function (ip, cidr) {
    const a = L.ipToInt(ip); if (a === null || !(cidr >= 0 && cidr <= 32)) return null;
    const mask = cidr === 0 ? 0 : (0xFFFFFFFF << (32 - cidr)) >>> 0, net = (a & mask) >>> 0, bc = (net | (~mask >>> 0)) >>> 0;
    const total = Math.pow(2, 32 - cidr), hosts = cidr >= 31 ? (cidr === 32 ? 1 : 2) : total - 2;
    return { network: L.intToIp(net), broadcast: L.intToIp(bc), mask: L.intToIp(mask), wildcard: L.intToIp(~mask >>> 0), first: cidr >= 31 ? L.intToIp(net) : L.intToIp(net + 1), last: cidr >= 31 ? L.intToIp(bc) : L.intToIp(bc - 1), hosts, total, cidr };
  };
  L.float32 = function (x) {
    const dv = new DataView(new ArrayBuffer(4)); dv.setFloat32(0, x);
    const u = dv.getUint32(0), bits = u.toString(2).padStart(32, '0');
    return { bits, sign: bits[0], exp: bits.slice(1, 9), frac: bits.slice(9), hex: u.toString(16).padStart(8, '0').toUpperCase(), stored: dv.getFloat32(0) };
  };
  L.float64 = function (x) {
    const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, x);
    const hi = dv.getUint32(0), lo = dv.getUint32(4), bits = hi.toString(2).padStart(32, '0') + lo.toString(2).padStart(32, '0');
    return { bits, sign: bits[0], exp: bits.slice(1, 12), frac: bits.slice(12), hex: hi.toString(16).padStart(8, '0').toUpperCase() + lo.toString(16).padStart(8, '0').toUpperCase() };
  };
  L.twosComplement = function (n, bits) {
    const min = -(2 ** (bits - 1)), max = 2 ** (bits - 1) - 1; if (n < min || n > max) return null;
    const u = n < 0 ? (BigInt(1) << BigInt(bits)) + BigInt(n) : BigInt(n); return u.toString(2).padStart(bits, '0');
  };

  /* ───────────── BOOLEAN ALGEBRA (truth table + Quine–McCluskey) ───────────── */
  L.parseBool = function (src) {
    src = src.replace(/\s+/g, ' ').trim(); if (!src) throw new Error('Empty expression');
    const toks = []; let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === ' ') { i++; continue; }
      if ('()'.includes(c)) { toks.push(c); i++; continue; }
      if (c === "'" ) { toks.push("'"); i++; continue; }
      if ('!~¬'.includes(c)) { toks.push('NOT'); i++; continue; }
      if ('&*·∧.'.includes(c)) { toks.push('AND'); i++; continue; }
      if ('+|∨'.includes(c)) { toks.push('OR'); i++; continue; }
      if ('^⊕'.includes(c)) { toks.push('XOR'); i++; continue; }
      if (c === '0' || c === '1') { toks.push({ c: +c }); i++; continue; }
      if (/[A-Za-z_]/.test(c)) {
        let j = i; while (j < src.length && /[A-Za-z_0-9]/.test(src[j])) j++;
        const w = src.slice(i, j), u = w.toUpperCase();
        if (['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR', 'XNOR'].includes(u)) toks.push(u);
        else if (/^[A-Za-z]+$/.test(w)) { for (const ch of w) toks.push({ v: ch }); } // letters side by side = AND (AB = A·B)
        else toks.push({ v: w }); // names with digits/underscore stay whole (in_1, x2)
        i = j; continue;
      }
      throw new Error('Unexpected "' + c + '"');
    }
    // single-letter juxtaposition (AB = A AND B) when letters are adjacent: expand
    const exp = []; for (let k = 0; k < toks.length; k++) {
      const t = toks[k], p = exp[exp.length - 1];
      const isOperandStart = t === '(' || t === 'NOT' || (typeof t === 'object');
      const prevIsOperandEnd = p === ')' || p === "'" || (typeof p === 'object');
      if (p !== undefined && isOperandStart && prevIsOperandEnd) exp.push('AND');
      exp.push(t);
    }
    let pos = 0; const vars = new Set();
    const peek = () => exp[pos], eat = () => exp[pos++];
    function pOr() { let a = pXor(); while (peek() === 'OR' || peek() === 'NOR') { const o = eat(); const b = pXor(); a = o === 'OR' ? { op: 'OR', a, b } : { op: 'NOT', a: { op: 'OR', a, b } }; } return a; }
    function pXor() { let a = pAnd(); while (peek() === 'XOR' || peek() === 'XNOR') { const o = eat(); const b = pAnd(); a = o === 'XOR' ? { op: 'XOR', a, b } : { op: 'NOT', a: { op: 'XOR', a, b } }; } return a; }
    function pAnd() { let a = pNot(); while (peek() === 'AND' || peek() === 'NAND') { const o = eat(); const b = pNot(); a = o === 'AND' ? { op: 'AND', a, b } : { op: 'NOT', a: { op: 'AND', a, b } }; } return a; }
    function pNot() { if (peek() === 'NOT') { eat(); return { op: 'NOT', a: pNot() }; } let a = pAtom(); while (peek() === "'") { eat(); a = { op: 'NOT', a }; } return a; }
    function pAtom() {
      const t = eat(); if (t === undefined) throw new Error('Incomplete expression');
      if (t === '(') { const e = pOr(); if (eat() !== ')') throw new Error('Missing )'); return e; }
      if (typeof t === 'object') { if ('v' in t) { vars.add(t.v); return { op: 'VAR', name: t.v }; } return { op: 'CONST', v: t.c }; }
      throw new Error('Unexpected ' + t);
    }
    const tree = pOr(); if (pos < exp.length) throw new Error('Unexpected ' + (typeof exp[pos] === 'object' ? (exp[pos].v || exp[pos].c) : exp[pos]));
    return { tree, vars: [...vars].sort() };
  };
  L.evalBool = function (t, env) {
    switch (t.op) { case 'VAR': return env[t.name] ? 1 : 0; case 'CONST': return t.v; case 'NOT': return L.evalBool(t.a, env) ? 0 : 1;
      case 'AND': return L.evalBool(t.a, env) & L.evalBool(t.b, env); case 'OR': return L.evalBool(t.a, env) | L.evalBool(t.b, env); case 'XOR': return L.evalBool(t.a, env) ^ L.evalBool(t.b, env); }
  };
  L.truthTable = function (src) {
    const { tree, vars } = L.parseBool(src); if (vars.length > 8) throw new Error('Maximum 8 variables');
    const rows = [], n = vars.length;
    for (let i = 0; i < (1 << n); i++) { const env = {}; vars.forEach((v, k) => env[v] = (i >> (n - 1 - k)) & 1); rows.push({ inputs: vars.map(v => env[v]), out: L.evalBool(tree, env) }); }
    return { vars, rows, minterms: rows.map((r, i) => r.out ? i : -1).filter(i => i >= 0) };
  };
  L.qmc = function (minterms, nVars) {
    if (!minterms.length) return { implicants: [], sop: '0' };
    if (minterms.length === (1 << nVars)) return { implicants: [], sop: '1' };
    let groups = minterms.map(m => ({ bits: m.toString(2).padStart(nVars, '0'), covers: [m], used: false }));
    const primes = [];
    for (;;) {
      const next = new Map(); let any = false;
      for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i].bits, b = groups[j].bits; let diff = -1, ok = true;
        for (let k = 0; k < nVars; k++) if (a[k] !== b[k]) { if (a[k] === '-' || b[k] === '-' || diff >= 0) { ok = false; break; } diff = k; }
        if (ok && diff >= 0) { const bits = a.slice(0, diff) + '-' + a.slice(diff + 1); groups[i].used = groups[j].used = true; any = true;
          if (!next.has(bits)) next.set(bits, { bits, covers: [...new Set([...groups[i].covers, ...groups[j].covers])], used: false }); }
      }
      groups.forEach(g => { if (!g.used && !primes.find(p => p.bits === g.bits)) primes.push(g); });
      if (!any) break; groups = [...next.values()];
    }
    // cover selection: essential primes then greedy
    const left = new Set(minterms), chosen = [];
    minterms.forEach(m => { const c = primes.filter(p => p.covers.includes(m)); if (c.length === 1 && !chosen.includes(c[0])) chosen.push(c[0]); });
    chosen.forEach(p => p.covers.forEach(m => left.delete(m)));
    while (left.size) { let best = null, bc = -1; primes.forEach(p => { const c = p.covers.filter(m => left.has(m)).length; if (c > bc) { bc = c; best = p; } }); chosen.push(best); best.covers.forEach(m => left.delete(m)); }
    return { implicants: chosen.map(c => c.bits) };
  };
  L.simplifyBool = function (src) {
    const tt = L.truthTable(src), n = tt.vars.length;
    if (!tt.minterms.length) return { ...tt, sop: '0' };
    if (tt.minterms.length === (1 << n)) return { ...tt, sop: '1' };
    const q = L.qmc(tt.minterms, n);
    const sop = q.implicants.map(b => { let s = ''; for (let k = 0; k < n; k++) { if (b[k] === '1') s += tt.vars[k]; else if (b[k] === '0') s += tt.vars[k] + "'"; } return s; }).join(' + ');
    return { ...tt, implicants: q.implicants, sop };
  };

  /* ───────────── COLOR ───────────── */
  L.hexToRgb = function (h) { h = h.replace('#', '').trim(); if (h.length === 3) h = h.split('').map(c => c + c).join(''); if (!/^[0-9a-f]{6}$/i.test(h)) return null; return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  L.rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  L.rgbToHsl = function (r, g, b) {
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
  };
  L.hslToRgb = function (h, s, l) {
    s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  };
  L.luminance = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  L.contrast = (a, b) => { const x = L.luminance(a), y = L.luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  /* ───────────── TEXT ───────────── */
  L.textStats = function (t) {
    const words = (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []);
    const sentences = (t.match(/[^.!?\n]+[.!?]+|[^.!?\n]+$/g) || []).filter(s => s.trim()).length;
    const paragraphs = t.split(/\n\s*\n/).filter(s => s.trim()).length;
    const freq = new Map(); const stop = new Set('the a an and or but of to in on at for with is are was were be been it this that as by from not you i we they he she his her their our your my me us them its if so do does did have has had will would can could'.split(' '));
    words.forEach(w => { const k = w.toLowerCase(); if (k.length > 2 && !stop.has(k)) freq.set(k, (freq.get(k) || 0) + 1); });
    return { chars: t.length, charsNoSpace: t.replace(/\s/g, '').length, words: words.length, sentences, paragraphs: t.trim() ? Math.max(paragraphs, 1) : 0, lines: t ? t.split('\n').length : 0,
      readMin: words.length / 200, speakMin: words.length / 130, top: [...freq].sort((a, b) => b[1] - a[1]).slice(0, 10) };
  };
  const wordsOf = s => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-./]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  L.cases = {
    upper: s => s.toUpperCase(), lower: s => s.toLowerCase(),
    title: s => s.toLowerCase().replace(/(^|[\s(\-"'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()),
    sentence: s => s.toLowerCase().replace(/(^\s*|[.!?]\s+|\n\s*)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()),
    camel: s => { const w = wordsOf(s).map(x => x.toLowerCase()); return w.map((x, i) => i ? x[0].toUpperCase() + x.slice(1) : x).join(''); },
    pascal: s => wordsOf(s).map(x => x[0].toUpperCase() + x.slice(1).toLowerCase()).join(''),
    snake: s => wordsOf(s).map(x => x.toLowerCase()).join('_'), kebab: s => wordsOf(s).map(x => x.toLowerCase()).join('-'),
    constant: s => wordsOf(s).map(x => x.toUpperCase()).join('_'),
    alternating: s => [...s].map((c, i) => i % 2 ? c.toLowerCase() : c.toUpperCase()).join(''),
    inverse: s => [...s].map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('')
  };
  L.slugify = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  L.dedupeLines = (t, ci) => { const seen = new Set(); return t.split('\n').filter(l => { const k = ci ? l.toLowerCase() : l; if (seen.has(k)) return false; seen.add(k); return true; }).join('\n'); };
  L.sortLines = (t, mode) => { const a = t.split('\n'); const f = { az: (x, y) => x.localeCompare(y), za: (x, y) => y.localeCompare(x), len: (x, y) => x.length - y.length, num: (x, y) => parseFloat(x) - parseFloat(y), rev: null };
    if (mode === 'rev') return a.reverse().join('\n'); if (mode === 'shuffle') { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.join('\n'); } return a.sort(f[mode]).join('\n'); };
  const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');
  L.lorem = function (paras, sentencesPer = 5) {
    const out = []; let k = 0;
    for (let p = 0; p < paras; p++) { const ss = []; for (let s = 0; s < sentencesPer; s++) { const n = 8 + ((k * 7 + s * 3) % 9); const w = []; for (let i = 0; i < n; i++) w.push(LOREM[(k++ * 5 + i * 3) % LOREM.length]); let t = w.join(' '); t = t[0].toUpperCase() + t.slice(1) + '.'; ss.push(t); } out.push(ss.join(' ')); }
    if (out.length) out[0] = 'Lorem ipsum dolor sit amet, ' + out[0].slice(0).replace(/^Lorem ipsum dolor sit amet,?\s*/i, ''); return out.join('\n\n');
  };
  const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '@': '.--.-.' };
  L.toMorse = t => t.toUpperCase().split('').map(c => c === ' ' ? '/' : (MORSE[c] || '')).filter(x => x !== '').join(' ');
  L.fromMorse = t => { const r = {}; for (const k in MORSE) r[MORSE[k]] = k; return t.trim().split(/\s*\/\s*|\s{3,}/).map(w => w.trim().split(/\s+/).map(c => r[c] || '?').join('')).join(' '); };
  L.b64encode = function (str) { const b = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  L.b64decode = function (b64) { b64 = b64.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, ''); while (b64.length % 4) b64 += '='; const s = atob(b64); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return new TextDecoder('utf-8', { fatal: false }).decode(b); };
  L.jwtDecode = function (t) {
    const p = t.trim().split('.'); if (p.length < 2) throw new Error('A JWT has 3 parts separated by dots');
    const header = JSON.parse(L.b64decode(p[0])), payload = JSON.parse(L.b64decode(p[1]));
    const info = []; const now = Math.floor(Date.now() / 1000);
    for (const k of ['iat', 'nbf', 'exp']) if (typeof payload[k] === 'number') info.push({ k, date: new Date(payload[k] * 1000), delta: payload[k] - now });
    return { header, payload, signature: p[2] || '', info };
  };
  L.csvParse = function (text, delim = ',') {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === delim) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; rows.push(row); row = []; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => !(r.length === 1 && r[0] === ''));
  };
  L.csvStringify = (rows, delim = ',') => rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /["\n\r]/.test(v) || v.includes(delim) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(delim)).join('\n');
  L.lineDiff = function (a, b) {
    const A = a.split('\n'), B = b.split('\n'), n = A.length, m = B.length;
    if (n * m > 4e6) throw new Error('Texts too long to compare (max ~2000 lines each)');
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) { if (A[i] === B[j]) { out.push({ t: '=', s: A[i] }); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: '-', s: A[i++] }); else out.push({ t: '+', s: B[j++] }); }
    while (i < n) out.push({ t: '-', s: A[i++] }); while (j < m) out.push({ t: '+', s: B[j++] });
    return out;
  };

  /* ───────────── HASHING / SECURITY ───────────── */
  L.md5 = function (input) { // input: Uint8Array or string → hex
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    const K = new Uint32Array(64), S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
    const len = bytes.length, padLen = ((len + 8) >> 6 << 6) + 64, buf = new Uint8Array(padLen); buf.set(bytes); buf[len] = 0x80;
    const dv = new DataView(buf.buffer); dv.setUint32(padLen - 8, (len << 3) >>> 0, true); dv.setUint32(padLen - 4, Math.floor(len / 0x20000000), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476; const M = new Uint32Array(16);
    for (let o = 0; o < padLen; o += 64) {
      for (let i = 0; i < 16; i++) M[i] = dv.getUint32(o + i * 4, true);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + M[g]) >>> 0; A = D; D = C; C = B; B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const out = new Uint8Array(16), odv = new DataView(out.buffer); [a0, b0, c0, d0].forEach((v, i) => odv.setUint32(i * 4, v, true));
    return [...out].map(b => b.toString(16).padStart(2, '0')).join('');
  };
  L.crc32 = function (bytes) { let c, crc = 0xFFFFFFFF; if (!L._crcT) { L._crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; L._crcT[n] = c >>> 0; } } for (let i = 0; i < bytes.length; i++) crc = L._crcT[(crc ^ bytes[i]) & 255] ^ (crc >>> 8); return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0'); };
  L.shaHex = async function (algo, bytes) { const d = await crypto.subtle.digest(algo, bytes); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); };
  L.base32decode = function (s) {
    s = s.replace(/[\s=-]/g, '').toUpperCase(); const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '';
    for (const c of s) { const v = A.indexOf(c); if (v < 0) throw new Error('Invalid Base32 character: ' + c); bits += v.toString(2).padStart(5, '0'); }
    const out = new Uint8Array(Math.floor(bits.length / 8)); for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2); return out;
  };
  L.hotp = async function (keyBytes, counter, digits = 6, algo = 'SHA-1') {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: algo }, false, ['sign']);
    const msg = new ArrayBuffer(8), dv = new DataView(msg); dv.setUint32(0, Math.floor(counter / 4294967296)); dv.setUint32(4, counter >>> 0);
    const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg)), o = h[h.length - 1] & 15;
    const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
    return String(bin % Math.pow(10, digits)).padStart(digits, '0');
  };
  L.totp = (keyBytes, timeMs = Date.now(), step = 30, digits = 6, algo = 'SHA-1') => L.hotp(keyBytes, Math.floor(timeMs / 1000 / step), digits, algo);
  L.randInt = function (max) { // unbiased random in [0,max)
    const lim = Math.floor(4294967296 / max) * max; const a = new Uint32Array(1);
    do { crypto.getRandomValues(a); } while (a[0] >= lim); return a[0] % max;
  };
  L.genPassword = function (len, sets, avoidAmbiguous) {
    const defs = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.?/~' };
    let pools = sets.map(k => defs[k]).filter(Boolean); if (avoidAmbiguous) pools = pools.map(p => p.replace(/[Il1O0o|]/g, ''));
    if (!pools.length || len < pools.length) return '';
    const all = pools.join(''), out = pools.map(p => p[L.randInt(p.length)]);
    while (out.length < len) out.push(all[L.randInt(all.length)]);
    for (let i = out.length - 1; i > 0; i--) { const j = L.randInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return out.join('');
  };
  const COMMON = new Set('password 123456 12345678 qwerty abc123 monkey 1234567 letmein trustno1 dragon baseball iloveyou master sunshine ashley bailey passw0rd shadow 123123 654321 superman qazwsx michael football welcome jesus ninja mustang password1 admin admin123 login princess qwerty123 solo starwars 000000 111111 121212 123321 1q2w3e4r 1qaz2wsx zaq12wsx password123 hello hello123 freedom whatever qwertyuiop 123456789 1234567890 iloveyou1 abcd1234 qwe123 india123 india@123 pass1234 test1234 welcome1 changeme default secret'.split(' '));
  L.passwordStrength = function (pw) {
    const issues = [], tips = []; let pool = 0;
    if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/\d/.test(pw)) pool += 10; if (/[^A-Za-z0-9]/.test(pw)) pool += 32;
    let bits = pw.length * Math.log2(Math.max(pool, 1));
    const lower = pw.toLowerCase();
    if (COMMON.has(lower)) { issues.push('This is one of the most common passwords'); bits = Math.min(bits, 10); }
    const stripped = lower.replace(/[^a-z]/g, ''); if (stripped.length > 3 && COMMON.has(stripped)) { issues.push('Built on a very common password'); bits -= 18; }
    if (/(.)\1{2,}/.test(pw)) { issues.push('Repeated characters (aaa, 111)'); bits -= 6; }
    if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|wert|erty|asdf|sdfg|zxcv)/i.test(pw)) { issues.push('Keyboard or number sequence'); bits -= 10; }
    if (/(19|20)\d{2}/.test(pw)) { issues.push('Contains a year'); bits -= 4; }
    if (/^[A-Za-z]+\d{1,4}[!@#$]?$/.test(pw)) { issues.push('Word + number pattern is easy to guess'); bits -= 6; }
    if (pw.length < 12) tips.push('Use 12 or more characters'); if (pool < 60 && pw.length) tips.push('Mix upper, lower, digits and symbols, or use 4+ random words');
    bits = Math.max(0, bits);
    const guesses = Math.pow(2, bits) / 2;
    const fmt = s => { if (s < 1) return 'instantly'; const u = [['year', 31557600], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]]; if (s > 31557600 * 1e9) return 'longer than the age of the universe'; if (s >= 31557600 * 1e6) return (s / 31557600 / 1e6).toPrecision(2) + ' million years'; for (const [n, v] of u) if (s >= v) { const x = s / v; return (x >= 100 ? Math.round(x).toLocaleString() : parseFloat(x.toPrecision(2))) + ' ' + n + (x >= 1.5 ? 's' : ''); } return 'instantly'; };
    const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
    return { bits, score, label: ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score], issues, tips, length: pw.length, pool,
      offlineFast: fmt(guesses / 1e10), offlineSlow: fmt(guesses / 1e6), online: fmt(guesses / 100) };
  };
  L.analyzeUrl = function (raw) {
    const flags = []; let u; try { u = new URL(/^[a-z]+:\/\//i.test(raw.trim()) ? raw.trim() : 'http://' + raw.trim()); } catch (e) { return { error: 'Not a valid URL' }; }
    const host = u.hostname.toLowerCase();
    if (u.protocol === 'http:') flags.push(['warn', 'Not encrypted (http, not https)']);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) flags.push(['bad', 'Uses a raw IP address instead of a domain name']);
    if (host.startsWith('xn--') || host.includes('.xn--')) flags.push(['bad', 'Punycode domain — can hide look-alike letters (homograph attack)']);
    if (/[^\x00-\x7f]/.test(u.hostname)) flags.push(['bad', 'Contains non-English look-alike characters']);
    if (u.username || raw.includes('@')) flags.push(['bad', 'Contains "@" or credentials — the real site is whatever comes after the @']);
    const parts = host.split('.'); if (parts.length > 4) flags.push(['warn', 'Many subdomains (' + (parts.length - 2) + ') — check the last two parts: ' + parts.slice(-2).join('.')]);
    if (/\.(zip|mov|top|xyz|click|country|gq|tk|ml|cf|ga|work|support|rest|cam|icu|live)$/.test(host)) flags.push(['warn', 'Top-level domain often abused in scams']);
    if (/(login|verify|secure|account|update|confirm|banking|wallet|signin|password|support|invoice|otp|kyc)/.test(host)) flags.push(['warn', 'Sensitive words inside the domain name']);
    if ((host.match(/-/g) || []).length >= 3) flags.push(['warn', 'Many hyphens in the domain']);
    if (/^(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|cutt\.ly|rb\.gy|shorturl\.at)$/.test(host)) flags.push(['warn', 'URL shortener — the real destination is hidden']);
    if (raw.length > 120) flags.push(['warn', 'Very long URL']);
    const brands = ['paypal', 'google', 'amazon', 'apple', 'microsoft', 'facebook', 'instagram', 'netflix', 'sbi', 'hdfc', 'icici', 'paytm', 'phonepe', 'whatsapp', 'flipkart', 'irctc', 'gov'];
    const reg = parts.slice(-2).join('.'); brands.forEach(b => { if (host.includes(b) && !new RegExp('(^|\\.)' + b + '\\.[a-z.]+$').test(host)) flags.push(['bad', 'Mentions "' + b + '" but the real domain is ' + reg]); });
    return { host, protocol: u.protocol, path: u.pathname + u.search, flags, verdict: flags.some(f => f[0] === 'bad') ? 'high' : flags.length >= 2 ? 'medium' : flags.length ? 'low' : 'none' };
  };

  /* ───────────── TIME ───────────── */
  L.to24 = function (t) { const m = String(t).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i); if (!m) return null; let h = +m[1], mi = +(m[2] || 0); const ap = (m[3] || '').toLowerCase(); if (ap) { if (h < 1 || h > 12) return null; if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; } if (h > 23 || mi > 59) return null; return { h, m: mi }; };

  return L;
});
