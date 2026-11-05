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

// حساب كل المؤشرات دفعة واحدة
export function computeAll(c) {
  const cl = closes(c);
  return {
    ema9: ema(cl, 9), ema20: ema(cl, 20), ema50: ema(cl, 50), ema200: ema(cl, 200),
    sma20: sma(cl, 20), sma50: sma(cl, 50),
    rsi: rsi(c, 14), macd: macd(c), bb: bollinger(c), atr: atr(c, 14),
    stoch: stochastic(c), adx: adx(c), cci: cci(c), willr: williamsR(c), obv: obv(c), mfi: mfi(c),
    psar: psar(c), supertrend: supertrend(c), ichimoku: ichimoku(c), vwap: vwap(c),
  };
}

export const last = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; return null; };
export const prevOf = (arr, back = 1) => { let seen = 0; for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) { if (seen === back) return arr[i]; seen++; } return null; };
