// =====================================================================
//  المؤشرات الفنية — Technical Indicators
//  كل الدوال تعمل على مصفوفة شموع {o,h,l,c,v} وتعيد مصفوفات بنفس الطول (null قبل اكتمال الفترة)
// =====================================================================

const closes = (c) => c.map((k) => k.c);

export function sma(values, p) {
  const out = new Array(values.length).fill(null);
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i];
    if (i >= p) s -= values[i - p];
    if (i >= p - 1) out[i] = s / p;
  }
  return out;
}

export function ema(values, p) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (p + 1);
  let prev = null, s = 0, cnt = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) {
      // البذرة: متوسط بسيط لأول p قيمة صالحة
      s += v; cnt++;
      if (cnt === p) { prev = s / p; out[i] = prev; }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// تمهيد وايلدر (لـ RSI و ATR و ADX)
function wilder(values, p) {
  const out = new Array(values.length).fill(null);
  let prev = null, s = 0, cnt = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) {
      s += v; cnt++;
      if (cnt === p) { prev = s / p; out[i] = prev; }
      continue;
    }
    prev = (prev * (p - 1) + v) / p;
    out[i] = prev;
  }
  return out;
}

export function rsi(c, p = 14) {
  const cl = closes(c);
  const gains = cl.map((v, i) => (i === 0 ? null : Math.max(v - cl[i - 1], 0)));
  const losses = cl.map((v, i) => (i === 0 ? null : Math.max(cl[i - 1] - v, 0)));
  const ag = wilder(gains, p), al = wilder(losses, p);
  return cl.map((_, i) => {
    if (ag[i] == null || al[i] == null) return null;
    if (al[i] === 0) return 100;
    return 100 - 100 / (1 + ag[i] / al[i]);
  });
}

export function macd(c, fast = 12, slow = 26, signal = 9) {
  const cl = closes(c);
  const ef = ema(cl, fast), es = ema(cl, slow);
  const line = cl.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
  const sig = ema(line, signal);
  const hist = line.map((v, i) => (v != null && sig[i] != null ? v - sig[i] : null));
  return { line, signal: sig, hist };
}

export function bollinger(c, p = 20, mult = 2) {
  const cl = closes(c);
  const mid = sma(cl, p);
  const upper = [], lower = [];
  for (let i = 0; i < cl.length; i++) {
    if (mid[i] == null) { upper.push(null); lower.push(null); continue; }
    let v = 0;
    for (let j = i - p + 1; j <= i; j++) v += (cl[j] - mid[i]) ** 2;
    const sd = Math.sqrt(v / p);
    upper.push(mid[i] + mult * sd); lower.push(mid[i] - mult * sd);
  }
  return { mid, upper, lower };
}

export function trueRange(c) {
  return c.map((k, i) => (i === 0 ? k.h - k.l : Math.max(k.h - k.l, Math.abs(k.h - c[i - 1].c), Math.abs(k.l - c[i - 1].c))));
}

export function atr(c, p = 14) { return wilder(trueRange(c), p); }

export function stochastic(c, kp = 14, dp = 3, smooth = 3) {
  const raw = c.map((k, i) => {
    if (i < kp - 1) return null;
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kp + 1; j <= i; j++) { hh = Math.max(hh, c[j].h); ll = Math.min(ll, c[j].l); }
    return hh === ll ? 50 : ((k.c - ll) / (hh - ll)) * 100;
  });
  const k = smaNullable(raw, smooth);
  const d = smaNullable(k, dp);
  return { k, d };
}
function smaNullable(arr, p) {
  const out = new Array(arr.length).fill(null);
  for (let i = 0; i < arr.length; i++) {
    let s = 0, ok = true;
    for (let j = i - p + 1; j <= i; j++) { if (j < 0 || arr[j] == null) { ok = false; break; } s += arr[j]; }
    if (ok) out[i] = s / p;
  }
  return out;
}

export function adx(c, p = 14) {
  const plusDM = [null], minusDM = [null];
  for (let i = 1; i < c.length; i++) {
    const up = c[i].h - c[i - 1].h, dn = c[i - 1].l - c[i].l;
    plusDM.push(up > dn && up > 0 ? up : 0);
    minusDM.push(dn > up && dn > 0 ? dn : 0);
  }
  const tr = trueRange(c).map((v, i) => (i === 0 ? null : v));
  const str = wilder(tr, p), sp = wilder(plusDM, p), sm = wilder(minusDM, p);
  const pdi = c.map((_, i) => (str[i] ? (100 * sp[i]) / str[i] : null));
  const mdi = c.map((_, i) => (str[i] ? (100 * sm[i]) / str[i] : null));
  const dx = c.map((_, i) => (pdi[i] != null && mdi[i] != null && pdi[i] + mdi[i] > 0 ? (100 * Math.abs(pdi[i] - mdi[i])) / (pdi[i] + mdi[i]) : null));
  return { adx: wilder(dx, p), pdi, mdi };
}

export function cci(c, p = 20) {
  const tp = c.map((k) => (k.h + k.l + k.c) / 3);
  const m = sma(tp, p);
  return tp.map((v, i) => {
    if (m[i] == null) return null;
    let md = 0;
    for (let j = i - p + 1; j <= i; j++) md += Math.abs(tp[j] - m[i]);
    md /= p;
    return md === 0 ? 0 : (v - m[i]) / (0.015 * md);
  });
}

export function williamsR(c, p = 14) {
  return c.map((k, i) => {
    if (i < p - 1) return null;
    let hh = -Infinity, ll = Infinity;
    for (let j = i - p + 1; j <= i; j++) { hh = Math.max(hh, c[j].h); ll = Math.min(ll, c[j].l); }
    return hh === ll ? -50 : ((hh - k.c) / (hh - ll)) * -100;
  });
}

export function obv(c) {
  const out = [0];
  for (let i = 1; i < c.length; i++) {
    const v = c[i].v || 0;
    out.push(out[i - 1] + (c[i].c > c[i - 1].c ? v : c[i].c < c[i - 1].c ? -v : 0));
  }
  return out;
}

export function mfi(c, p = 14) {
  const tp = c.map((k) => (k.h + k.l + k.c) / 3);
  return c.map((_, i) => {
    if (i < p) return null;
    let pos = 0, neg = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const mf = tp[j] * (c[j].v || 0);
      if (tp[j] > tp[j - 1]) pos += mf; else if (tp[j] < tp[j - 1]) neg += mf;
    }
    if (neg === 0) return 100;
    return 100 - 100 / (1 + pos / neg);
  });
}

// Parabolic SAR
export function psar(c, step = 0.02, maxStep = 0.2) {
  const out = new Array(c.length).fill(null);
  if (c.length < 2) return out;
  let up = c[1].c >= c[0].c;
  let sar = up ? c[0].l : c[0].h;
  let ep = up ? c[0].h : c[0].l;
  let af = step;
  for (let i = 1; i < c.length; i++) {
    sar = sar + af * (ep - sar);
    if (up) {
      sar = Math.min(sar, c[i - 1].l, i > 1 ? c[i - 2].l : c[i - 1].l);
      if (c[i].l < sar) { up = false; sar = ep; ep = c[i].l; af = step; }
      else if (c[i].h > ep) { ep = c[i].h; af = Math.min(af + step, maxStep); }
    } else {
      sar = Math.max(sar, c[i - 1].h, i > 1 ? c[i - 2].h : c[i - 1].h);
      if (c[i].h > sar) { up = true; sar = ep; ep = c[i].h; af = step; }
      else if (c[i].l < ep) { ep = c[i].l; af = Math.min(af + step, maxStep); }
    }
    out[i] = { value: sar, up };
  }
  return out;
}

// Supertrend
export function supertrend(c, p = 10, mult = 3) {
  const a = atr(c, p);
  const out = new Array(c.length).fill(null);
  let fu = null, fl = null, dir = 1;
  for (let i = 0; i < c.length; i++) {
    if (a[i] == null) continue;
    const hl2 = (c[i].h + c[i].l) / 2;
    const bu = hl2 + mult * a[i], bl = hl2 - mult * a[i];
    const pc = i > 0 ? c[i - 1].c : c[i].c;
    fu = fu == null || bu < fu || pc > fu ? bu : fu;
    fl = fl == null || bl > fl || pc < fl ? bl : fl;
    if (dir === 1 && c[i].c < fl) dir = -1;
    else if (dir === -1 && c[i].c > fu) dir = 1;
    out[i] = { value: dir === 1 ? fl : fu, up: dir === 1 };
  }
  return out;
}

// Ichimoku Kinko Hyo (السحابة اليابانية)
export function ichimoku(c, t = 9, k = 26, s = 52) {
  const mid = (p, i) => {
    if (i < p - 1) return null;
    let hh = -Infinity, ll = Infinity;
    for (let j = i - p + 1; j <= i; j++) { hh = Math.max(hh, c[j].h); ll = Math.min(ll, c[j].l); }
    return (hh + ll) / 2;
  };
  const tenkan = c.map((_, i) => mid(t, i));
  const kijun = c.map((_, i) => mid(k, i));
  // قيم السحابة الحالية (المزاحة 26 شمعة للأمام) => نقرأ القيم المحسوبة قبل 26 شمعة
  const spanA = c.map((_, i) => {
    const j = i - k; if (j < 0 || tenkan[j] == null || kijun[j] == null) return null;
    return (tenkan[j] + kijun[j]) / 2;
  });
  const spanB = c.map((_, i) => { const j = i - k; return j < 0 ? null : mid(s, j); });
  return { tenkan, kijun, spanA, spanB };
}

export function vwap(c) {
  let pv = 0, vv = 0;
  return c.map((k) => { const tp = (k.h + k.l + k.c) / 3; pv += tp * (k.v || 0); vv += k.v || 0; return vv ? pv / vv : tp; });
}

// قمم وقيعان متأرجحة (Swing points) لتحديد الدعم والمقاومة
export function swings(c, left = 3, right = 3) {
  const highs = [], lows = [];
  for (let i = left; i < c.length - right; i++) {
    let isH = true, isL = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (c[j].h >= c[i].h) isH = false;
      if (c[j].l <= c[i].l) isL = false;
    }
    if (isH) highs.push({ i, price: c[i].h });
    if (isL) lows.push({ i, price: c[i].l });
  }
  return { highs, lows };
}

// تجميع المستويات المتقاربة إلى مناطق دعم/مقاومة
export function supportResistance(c, maxLevels = 6) {
  const { highs, lows } = swings(c, 3, 3);
  const pts = [...highs.map((h) => h.price), ...lows.map((l) => l.price)].sort((a, b) => a - b);
  const a = atr(c, 14).filter((x) => x != null);
  const tol = (a.length ? a[a.length - 1] : (c[c.length - 1].c * 0.005)) * 0.6;
  const clusters = [];
  for (const p of pts) {
    const last = clusters[clusters.length - 1];
    if (last && p - last.max <= tol) { last.sum += p; last.n++; last.max = p; }
    else clusters.push({ sum: p, n: 1, max: p });
  }
  return clusters.map((cl) => ({ price: cl.sum / cl.n, touches: cl.n }))
    .sort((x, y) => y.touches - x.touches).slice(0, maxLevels).sort((x, y) => x.price - y.price);
}

// مستويات فيبوناتشي من آخر حركة رئيسية
export function fibonacci(c, look = 100) {
  const seg = c.slice(-look);
  let hi = -Infinity, lo = Infinity, hiI = 0, loI = 0;
  seg.forEach((k, i) => { if (k.h > hi) { hi = k.h; hiI = i; } if (k.l < lo) { lo = k.l; loI = i; } });
  const upMove = loI < hiI; // الحركة الأخيرة صاعدة؟
  const d = hi - lo;
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  return {
    high: hi, low: lo, direction: upMove ? 'up' : 'down',
    levels: ratios.map((r) => ({ ratio: r, price: upMove ? hi - d * r : lo + d * r })),
  };
}

// نقاط الارتكاز الكلاسيكية من آخر شمعة مكتملة
export function pivots(k) {
  const p = (k.h + k.l + k.c) / 3;
  return { P: p, R1: 2 * p - k.l, S1: 2 * p - k.h, R2: p + (k.h - k.l), S2: p - (k.h - k.l), R3: k.h + 2 * (p - k.l), S3: k.l - 2 * (k.h - p) };
}

// المتوسط الموزون خطياً
export function wma(values, p) {
  const out = new Array(values.length).fill(null);
  const den = (p * (p + 1)) / 2;
  for (let i = p - 1; i < values.length; i++) {
    let s = 0, ok = true;
    for (let j = 0; j < p; j++) { const v = values[i - p + 1 + j]; if (v == null) { ok = false; break; } s += v * (j + 1); }
    if (ok) out[i] = s / den;
  }
  return out;
}

// متوسط هال (Hull MA) — سريع الاستجابة وقليل التأخير
export function hma(values, p = 9) {
  const half = wma(values, Math.max(1, Math.floor(p / 2))), full = wma(values, p);
  const diff = values.map((_, i) => (half[i] != null && full[i] != null ? 2 * half[i] - full[i] : null));
  return wma(diff, Math.max(1, Math.round(Math.sqrt(p))));
}

// المتوسط المرجح بالحجم
export function vwma(c, p = 20) {
  return c.map((_, i) => {
    if (i < p - 1) return null;
    let pv = 0, v = 0;
    for (let j = i - p + 1; j <= i; j++) { pv += c[j].c * (c[j].v || 0); v += c[j].v || 0; }
    return v ? pv / v : null;
  });
}

// المذبذب الرائع (Awesome Oscillator)
export function awesome(c) {
  const mp = c.map((k) => (k.h + k.l) / 2);
  const f = sma(mp, 5), s = sma(mp, 34);
  return mp.map((_, i) => (f[i] != null && s[i] != null ? f[i] - s[i] : null));
}

// الزخم (Momentum)
export function momentum(c, p = 10) {
  return c.map((k, i) => (i >= p ? k.c - c[i - p].c : null));
}

// Stochastic RSI
export function stochRsi(c, rp = 14, sp = 14, kp = 3, dp = 3) {
  const r = rsi(c, rp);
  const raw = r.map((v, i) => {
    if (v == null || i < sp - 1) return null;
    let hh = -Infinity, ll = Infinity;
    for (let j = i - sp + 1; j <= i; j++) { if (r[j] == null) return null; hh = Math.max(hh, r[j]); ll = Math.min(ll, r[j]); }
    return hh === ll ? 50 : ((v - ll) / (hh - ll)) * 100;
  });
  const k = smaNullable(raw, kp);
  return { k, d: smaNullable(k, dp) };
}

// المذبذب النهائي (Ultimate Oscillator)
export function ultimate(c, a = 7, b = 14, d = 28) {
  const bp = [], tr = [];
  c.forEach((k, i) => {
    const pc = i ? c[i - 1].c : k.o;
    bp.push(k.c - Math.min(k.l, pc));
    tr.push(Math.max(k.h, pc) - Math.min(k.l, pc));
  });
  const avg = (i, p) => { let s1 = 0, s2 = 0; for (let j = i - p + 1; j <= i; j++) { s1 += bp[j]; s2 += tr[j]; } return s2 ? s1 / s2 : 0; };
  return c.map((_, i) => (i < d ? null : (100 * (4 * avg(i, a) + 2 * avg(i, b) + avg(i, d))) / 7));
}

// قوة الثيران والدببة (Elder Bull/Bear Power)
export function bullBear(c, p = 13) {
  const e = ema(closes(c), p);
  return c.map((k, i) => (e[i] == null ? null : (k.h - e[i]) + (k.l - e[i])));
}

// ---------------- مؤشرات إضافية مشهورة ----------------
/** قنوات كيلتنر: EMA(20) ± 2×ATR(10) */
export function keltner(c, p = 20, mult = 2, atrP = 10) {
  const mid = ema(closes(c), p), a = atr(c, atrP);
  return { mid, upper: mid.map((m, i) => (m != null && a[i] != null ? m + mult * a[i] : null)), lower: mid.map((m, i) => (m != null && a[i] != null ? m - mult * a[i] : null)) };
}
/** قنوات دونشيان: أعلى قمة وأدنى قاع لآخر p شمعة */
export function donchian(c, p = 20) {
  const upper = [], lower = [];
  c.forEach((_, i) => {
    if (i < p - 1) { upper.push(null); lower.push(null); return; }
    let hh = -Infinity, ll = Infinity;
    for (let j = i - p + 1; j <= i; j++) { hh = Math.max(hh, c[j].h); ll = Math.min(ll, c[j].l); }
    upper.push(hh); lower.push(ll);
  });
  return { upper, lower, mid: upper.map((u, i) => (u == null ? null : (u + lower[i]) / 2)) };
}
/** أرون: كم مضى منذ أعلى قمة/أدنى قاع خلال p شمعة (100 = الآن) */
export function aroon(c, p = 25) {
  const up = [], down = [];
  c.forEach((_, i) => {
    if (i < p) { up.push(null); down.push(null); return; }
    let hi = i, lo = i;
    for (let j = i - p; j <= i; j++) { if (c[j].h >= c[hi].h) hi = j; if (c[j].l <= c[lo].l) lo = j; }
    up.push(((p - (i - hi)) / p) * 100); down.push(((p - (i - lo)) / p) * 100);
  });
  return { up, down };
}
/** معدل التغير ROC (%) */
export function roc(c, p = 10) { return c.map((k, i) => (i >= p ? ((k.c - c[i - p].c) / c[i - p].c) * 100 : null)); }
/** TRIX: معدل تغير EMA الثلاثي (%) */
export function trix(c, p = 15) {
  const e3 = ema(ema(ema(closes(c), p), p), p);
  return e3.map((v, i) => (i > 0 && v != null && e3[i - 1] != null ? ((v - e3[i - 1]) / e3[i - 1]) * 100 : null));
}
/** شموع هايكن آشي (تنعيم الترند) */
export function heikinAshi(c) {
  const out = [];
  c.forEach((k, i) => {
    const hc = (k.o + k.h + k.l + k.c) / 4;
    const ho = i === 0 ? (k.o + k.c) / 2 : (out[i - 1].o + out[i - 1].c) / 2;
    out.push({ t: k.t, o: ho, c: hc, h: Math.max(k.h, ho, hc), l: Math.min(k.l, ho, hc) });
  });
  return out;
}
/** تدفق أموال تشايكن CMF (يحتاج حجماً) */
export function chaikinMF(c, p = 20) {
  const mfv = c.map((k) => { const r = k.h - k.l; return r ? (((k.c - k.l) - (k.h - k.c)) / r) * (k.v || 0) : 0; });
  return c.map((_, i) => {
    if (i < p - 1) return null;
    let a = 0, b = 0;
    for (let j = i - p + 1; j <= i; j++) { a += mfv[j]; b += c[j].v || 0; }
    return b ? a / b : null;
  });
}
/** انضغاط TTM: بولينجر داخل كيلتنر = هدوء يسبق حركة قوية */
export function squeeze(c) {
  const bb = bollinger(c, 20, 2), kc = keltner(c, 20, 1.5, 20);
  return c.map((_, i) => (bb.upper[i] == null || kc.upper[i] == null ? null : bb.upper[i] < kc.upper[i] && bb.lower[i] > kc.lower[i]));
}

// حساب كل المؤشرات دفعة واحدة
export function computeAll(c) {
  const cl = closes(c);
  return {
    ema9: ema(cl, 9), ema20: ema(cl, 20), ema50: ema(cl, 50), ema200: ema(cl, 200),
    sma20: sma(cl, 20), sma50: sma(cl, 50),
    ma: {
      ema10: ema(cl, 10), sma10: sma(cl, 10), ema20: ema(cl, 20), sma20: sma(cl, 20), ema30: ema(cl, 30), sma30: sma(cl, 30),
      ema50: ema(cl, 50), sma50: sma(cl, 50), ema100: ema(cl, 100), sma100: sma(cl, 100), ema200: ema(cl, 200), sma200: sma(cl, 200),
      hma9: hma(cl, 9), vwma20: vwma(c, 20),
    },
    ao: awesome(c), mom: momentum(c), stochRsi: stochRsi(c), uo: ultimate(c), bbp: bullBear(c),
    kc: keltner(c), dc: donchian(c, 20), aroon: aroon(c, 25), roc: roc(c, 10), trix: trix(c, 15), ha: heikinAshi(c), sq: squeeze(c), cmf: chaikinMF(c, 20),
    rsi: rsi(c, 14), macd: macd(c), bb: bollinger(c), atr: atr(c, 14),
    stoch: stochastic(c), adx: adx(c), cci: cci(c), willr: williamsR(c), obv: obv(c), mfi: mfi(c),
    psar: psar(c), supertrend: supertrend(c), ichimoku: ichimoku(c), vwap: vwap(c),
  };
}

export const last = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; return null; };
export const prevOf = (arr, back = 1) => { let seen = 0; for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) { if (seen === back) return arr[i]; seen++; } return null; };
