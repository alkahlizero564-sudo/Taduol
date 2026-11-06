// =====================================================================
//  محرك التوصيات — خطة صفقة مبنية على التوافق (Confluence)
//  • هيكل السوق (قمم/قيعان) • انفراج RSI • فلتر الفريم الأكبر
//  • شموع يابانية مكتملة قرب مناطق الدعم/المقاومة • موقع الدخول (عدم مطاردة السعر)
//  • وقف خلف آخر قاع/قمة حقيقية • أهداف عند المستويات التالية • درجة A/B/C
//  • اختبار تاريخي (Backtest) لنفس الاستراتيجية على نفس الرمز والفريم
// =====================================================================
import { last, swings } from './indicators.js';
import { supertrend, bollinger, volumeSpike } from './extra.js';

/** هيكل السوق من آخر قمتين وآخر قاعين */
export function marketStructure(candles, look = 120) {
  const off = Math.max(0, candles.length - look);
  const { highs, lows } = swings(candles.slice(off), 3, 3);
  const H = highs.slice(-2), L = lows.slice(-2);
  if (H.length < 2 || L.length < 2) return { trend: 'range', text: 'لا توجد قمم وقيعان كافية' };
  const hh = H[1].price > H[0].price, hl = L[1].price > L[0].price;
  if (hh && hl) return { trend: 'up', text: 'قمم أعلى وقيعان أعلى (HH/HL)' };
  if (!hh && !hl) return { trend: 'down', text: 'قمم أدنى وقيعان أدنى (LH/LL)' };
  return { trend: 'range', text: hh ? 'قمم أعلى لكن قيعان أدنى — توسع/تذبذب' : 'قيعان أعلى لكن قمم أدنى — انضغاط' };
}

/** انفراج RSI العادي بين آخر قاعين (صاعد) أو آخر قمتين (هابط) */
export function rsiDivergence(candles, rsiArr, look = 60, recent = 15) {
  const n = candles.length, off = Math.max(0, n - look);
  const { highs, lows } = swings(candles.slice(off), 3, 2);
  const at = (p) => ({ i: p.i + off, price: p.price, rsi: rsiArr[p.i + off] });
  const L = lows.slice(-2).map(at), H = highs.slice(-2).map(at);
  if (L.length === 2 && L[1].rsi != null && L[0].rsi != null && n - 1 - L[1].i <= recent &&
      L[1].price < L[0].price && L[1].rsi > L[0].rsi + 2) return { type: 'bullish', text: 'انفراج إيجابي: قاع سعري أدنى مع RSI أعلى' };
  if (H.length === 2 && H[1].rsi != null && H[0].rsi != null && n - 1 - H[1].i <= recent &&
      H[1].price > H[0].price && H[1].rsi < H[0].rsi - 2) return { type: 'bearish', text: 'انفراج سلبي: قمة سعرية أعلى مع RSI أدنى' };
  return null;
}

/**
 * بناء خطة الصفقة
 * @param {Array} candles
 * @param {Object} ctx { ind, score, rating, patterns (من الشموع المكتملة), levels, atr, adx, htf? (تقييم الفريم الأكبر -1..1) }
 */
export function buildPlan(candles, ctx) {
  const { ind, score, rating, patterns = [], levels = [], htf = null } = ctx;
  const n = candles.length;
  const price = candles[n - 1].c;
  const atr = ctx.atr || price * 0.01;
  const side = score > 0.08 ? 1 : score < -0.08 ? -1 : (rating?.overall >= 0 ? 1 : -1);
  const S = side === 1 ? 'BUY' : 'SELL';
  const e20 = last(ind.ema20), e50 = last(ind.ema50), e200 = last(ind.ema200);
  const rsi = last(ind.rsi), hist = last(ind.macd.hist), adx = last(ind.adx.adx);
  const structure = marketStructure(candles);
  const div = rsiDivergence(candles, ind.rsi);
  const factors = [];
  const f = (ok, text, weight = 1) => factors.push({ ok, text, weight });

  // 1) الاتجاه العام
  if (e50 && e200) f(side === 1 ? e50 > e200 && price > e200 : e50 < e200 && price < e200,
    side === 1 ? 'الترند العام صاعد (EMA50 فوق EMA200 والسعر فوقه)' : 'الترند العام هابط (EMA50 تحت EMA200 والسعر تحته)', 1.5);
  // 2) هيكل السوق
  f(structure.trend === (side === 1 ? 'up' : 'down') ? true : structure.trend === 'range' ? null : false, 'هيكل السوق: ' + structure.text, 1.5);
  // 3) التقييم الفني الشامل
  if (rating) f(rating.overall * side > 0.1, `التقييم الفني (26 مؤشراً) يؤيد ${side === 1 ? 'الشراء' : 'البيع'}`, 1);
  // 4) الفريم الأكبر
  // اختُبر على بيانات حقيقية: اشتراط موافقة قوية (> 0.3) حسّن النتائج في فترة التعلم وفترة الاختبار معاً
  const htfKnown = htf != null && isFinite(htf);
  if (htfKnown) f(htf * side > 0.3 ? true : htf * side < -0.1 ? false : null,
    `الفريم الأكبر ${htf * side > 0.3 ? 'متوافق بقوة' : htf * side > 0.1 ? 'متوافق بضعف' : htf * side < -0.1 ? 'عكس الاتجاه' : 'محايد'}`, 1.5);
  else f(null, 'الفريم الأكبر غير متاح بعد', 0);
  // 5) الزخم دون تشبع
  if (rsi != null && hist != null) {
    const okMom = side === 1 ? hist > 0 && rsi > 45 && rsi < 72 : hist < 0 && rsi < 55 && rsi > 28;
    f(okMom, side === 1 ? `زخم إيجابي دون تشبع (RSI ${rsi.toFixed(0)}، MACD موجب)` : `زخم سلبي دون تشبع (RSI ${rsi.toFixed(0)}، MACD سالب)`, 1);
  }
  // 6) قوة الترند
  if (adx != null) f(adx > 20 ? true : null, `قوة الترند ADX ${adx.toFixed(0)}${adx > 20 ? '' : ' (ضعيف — سوق عرضي)'}`, 0.5);
  // 7) نمط شموع مؤكد قرب مستوى
  const nearLevel = (p) => levels.some((l) => Math.abs(l.price - p) <= atr * 0.6);
  const recentPat = patterns.filter((p) => p.index >= n - 4 && (p.type === (side === 1 ? 'bullish' : 'bearish')));
  if (recentPat.length) {
    const best = recentPat.sort((a, b) => b.reliability - a.reliability)[0];
    const k = candles[best.index];
    const atZone = nearLevel(side === 1 ? k.l : k.h);
    f(true, `نمط ${best.ar} (${'★'.repeat(best.reliability)})${atZone ? ' عند منطقة دعم/مقاومة' : ''}`, 0.6 * best.reliability + (atZone ? 0.8 : 0));
  } else {
    const against = patterns.filter((p) => p.index >= n - 3 && p.type === (side === 1 ? 'bearish' : 'bullish') && p.reliability >= 2);
    if (against.length) f(false, `نمط معاكس حديث: ${against[0].ar}`, 1);
  }
  // 8) الانفراج
  if (div) f(div.type === (side === 1 ? 'bullish' : 'bearish'), div.text, 1.2);

  // 9) مؤشرات إضافية: Supertrend + بولينجر + حجم التداول
  const st = supertrend(candles);
  if (st) f(st.dir === side, `Supertrend ${st.dir === 1 ? 'صاعد' : 'هابط'}`, 1.2);
  const bb = bollinger(candles);
  if (bb) f(side === 1 ? bb.pos > 0 && bb.pos < 0.95 : bb.pos < 0 && bb.pos > -0.95, 'موقع السعر في بولينجر مناسب للاتجاه', 0.6);
  const vs = volumeSpike(candles);
  if (vs) f(true, 'حجم التداول أعلى من المتوسط (تأكيد)', 0.5);

  // ---------------- الدخول ----------------
  const ext = e20 ? (price - e20) * side / atr : 0; // ابتعاد السعر عن EMA20 بوحدات ATR
  let entryType = 'market', entry = price;
  if (ext > 1.2 && e20) {
    // السعر ممتد — لا نطارده: أمر معلّق عند الارتداد إلى EMA20 أو أقرب مستوى بينهما
    const between = levels.map((l) => l.price).filter((p) => (p - e20) * side > 0 && (price - p) * side > 0.3 * atr);
    entry = between.length ? (side === 1 ? Math.max(...between) : Math.min(...between)) : e20 + side * 0.2 * atr;
    entryType = 'limit';
  }
  f(entryType === 'market' ? true : null, entryType === 'market' ? 'موقع دخول جيد (السعر قريب من متوسطه)' : `السعر ممتد ${ext.toFixed(1)}×ATR — الأفضل انتظار الارتداد`, 0.8);

  // ---------------- وقف الخسارة: خلف آخر قاع/قمة ----------------
  const { highs, lows } = swings(candles.slice(-60), 2, 2);
  let structural = null;
  if (side === 1) {
    const below = lows.map((x) => x.price).filter((p) => p < entry - 0.3 * atr);
    if (below.length) structural = below[below.length - 1] - 0.3 * atr;
  } else {
    const above = highs.map((x) => x.price).filter((p) => p > entry + 0.3 * atr);
    if (above.length) structural = above[above.length - 1] + 0.3 * atr;
  }
  let risk = structural != null ? Math.abs(entry - structural) : 1.5 * atr;
  risk = Math.min(Math.max(risk, 0.9 * atr), 3 * atr);
  const stopLoss = entry - side * risk;

  // ---------------- الأهداف: المستويات التالية ----------------
  const opp = levels.map((l) => l.price).filter((p) => (p - entry) * side > 0.5 * risk).sort((a, b) => (a - b) * side);
  const R = (m) => entry + side * risk * m;
  const blocker = opp.find((p) => Math.abs(p - entry) < 1.5 * risk);
  const beyond = opp.filter((p) => Math.abs(p - entry) >= 1.5 * risk);
  const tp1 = beyond[0] && Math.abs(beyond[0] - entry) <= 3 * risk ? beyond[0] - side * 0.1 * atr : R(1.5);
  const tp2 = beyond[1] && Math.abs(beyond[1] - entry) > Math.abs(tp1 - entry) ? beyond[1] - side * 0.1 * atr : R(Math.max(2.5, Math.abs(tp1 - entry) / risk + 1));
  const tp3 = R(Math.max(4, Math.abs(tp2 - entry) / risk + 1.5));
  const targets = [tp1, tp2, tp3];
  f(!blocker, blocker ? `مستوى ${side === 1 ? 'مقاومة' : 'دعم'} قريب عند ${blocker.toPrecision(6)} قد يعيق الهدف الأول` : 'المسار نحو الهدف الأول خالٍ من مستويات معيقة', 1);
  const riskReward = Math.abs(tp1 - entry) / risk;

  // ---------------- الدرجة والقرار ----------------
  const counted = factors.filter((x) => x.ok !== null);
  const wTot = counted.reduce((s, x) => s + x.weight, 0) || 1;
  const wOk = counted.filter((x) => x.ok).reduce((s, x) => s + x.weight, 0);
  const confluence = wOk / wTot;
  const htfAgainst = htf != null && htf * side < -0.1;
  // قواعد الدرجة (اختُبرت على بيانات حقيقية: الشرط الأساسي توافق الترند العام مع هيكل السوق)
  const ok = (re) => factors.find((x) => re.test(x.text))?.ok;
  const trendOk = ok(/الترند العام/) === true, structOk = ok(/^هيكل السوق/) === true;
  const noBlock = ok(/قد يعيق|خالٍ من/) === true;
  let grade = 'C';
  if (trendOk && structOk) grade = (entryType === 'limit' || confluence >= 0.75) && noBlock ? 'A' : 'B';
  if (grade === 'A' && htfKnown && !(htf * side > 0.3)) grade = 'B'; // A يتطلب موافقة قوية من الفريم الأكبر
  if (grade === 'A' && st && st.dir !== side) grade = 'B'; // A يتطلب موافقة Supertrend
  // الإشارة الفعلية لدرجة A فقط (أفضل نتيجة في الاختبار التاريخي خارج العينة)؛ B للاطلاع فقط
  const direction = grade === 'A' && !htfAgainst ? S : 'WAIT';
  const confidence = Math.round(Math.min(92, 100 * (0.6 * confluence + 0.4 * Math.min(1, Math.abs(score) * 1.8))));

  return {
    side: S, direction, grade, confidence, confluence: +confluence.toFixed(2),
    entry, entryType, entryZone: [entry - 0.25 * atr, entry + 0.25 * atr].sort((a, b) => a - b),
    stopLoss, targets, risk, riskReward: +riskReward.toFixed(2),
    factors, structure, divergence: div,
  };
}

/**
 * اختبار تاريخي: نطبّق نفس المحرك على الشموع السابقة ونقيس هل وصل الهدف الأول قبل الوقف.
 * الصفقة التي لا تصل لأيهما خلال maxHold شمعة تُغلق على آخر سعر (تُحسب بقيمتها الفعلية).
 * @param {(slice:Array)=>Object} analyzeFn دالة التحليل (تُمرَّر لتجنب الاستيراد الدائري)
 * @param {{minGrade?:'A'|'B'}} o  A = الإشارات الفعلية فقط، B = تشمل إعدادات B (للاطلاع)
 */
function* backtestSteps(candles, analyzeFn, { start = 150, step = 2, maxHold = 30, minGrade = 'A', window = 300 } = {}) {
  const list = [];
  let i = Math.max(start, 60);
  while (i < candles.length - 2) {
    yield i;
    let r;
    try { r = analyzeFn(candles.slice(Math.max(0, i + 1 - window), i + 1)); } catch { i += step; continue; }
    // minGrade: 'A' الإشارات القوية فقط، 'B' تشمل المتوسطة، 'C' كل التوصيات (لقياس نجاح كل درجة)
    const dir = r.direction !== 'WAIT' ? r.direction : (minGrade === 'C' || (minGrade === 'B' && r.grade === 'B')) ? r.side : null;
    if (!dir) { i += step; continue; }
    const side = dir === 'BUY' ? 1 : -1;
    // الأوامر المعلقة: يجب أن يصل السعر للدخول خلال 5 شموع
    let j = i + 1, filled = r.entryType === 'market', entry = r.entryType === 'market' ? candles[i].c : r.entry;
    if (!filled) {
      for (; j < Math.min(candles.length, i + 6); j++) {
        if ((side === 1 && candles[j].l <= r.entry) || (side === -1 && candles[j].h >= r.entry)) { filled = true; break; }
      }
      if (!filled) { i += step; continue; }
    }
    const risk = Math.abs(entry - r.stopLoss);
    let R = null, end = j;
    const stop = Math.min(candles.length, j + maxHold);
    for (let k = j; k < stop; k++) {
      const c = candles[k];
      end = k;
      if (side === 1 ? c.l <= r.stopLoss : c.h >= r.stopLoss) { R = -1; break; } // إذا تحقق الاثنان في نفس الشمعة نحسبها خسارة (تحفّظاً)
      if (side === 1 ? c.h >= r.targets[0] : c.l <= r.targets[0]) { R = Math.abs(r.targets[0] - entry) / risk; break; }
    }
    if (R === null && stop - j >= maxHold) R = ((candles[stop - 1].c - entry) * side) / risk; // انتهاء المدة
    if (R !== null) list.push({ at: i, side: dir, grade: r.grade, R: +R.toFixed(2), outcome: R > 0 ? 'win' : 'loss' });
    i = Math.max(end + 1, i + step);
  }
  return list;
}

function statsOf(list) {
  const wins = list.filter((t) => t.R > 0).length;
  const avgR = list.length ? list.reduce((s, t) => s + t.R, 0) / list.length : 0;
  return { trades: list.length, wins, losses: list.length - wins, winRate: list.length ? Math.round((wins / list.length) * 100) : 0, avgR: +avgR.toFixed(2) };
}
function summarizeTrades(list) {
  // إحصاءات لكل درجة على حدة حتى تُعرف جودة كل توصية
  const byGrade = Object.fromEntries(['A', 'B', 'C'].map((g) => [g, statsOf(list.filter((t) => t.grade === g))]));
  return { ...statsOf(list), byGrade, list };
}

export function backtest(candles, analyzeFn, opts = {}) {
  const it = backtestSteps(candles, analyzeFn, opts);
  let r = it.next();
  while (!r.done) r = it.next();
  return summarizeTrades(r.value);
}

/** نفس الاختبار لكن على دفعات حتى لا تتجمد الواجهة على الهاتف */
export async function backtestAsync(candles, analyzeFn, opts = {}, onProgress) {
  const it = backtestSteps(candles, analyzeFn, opts);
  let r = it.next(), t0 = Date.now();
  while (!r.done) {
    if (Date.now() - t0 > 30) { onProgress?.(r.value / candles.length); await new Promise((res) => setTimeout(res, 0)); t0 = Date.now(); }
    r = it.next();
  }
  return summarizeTrades(r.value);
}

// =====================================================================
//  الفريم الأكبر داخل الاختبار التاريخي
//  نبني شموع الفريم الأكبر من شموع الفريم الحالي (المكتملة فقط — بدون النظر للمستقبل)
// =====================================================================
const TF_MS = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 };
export const HIGHER_TF = { '1m': '15m', '5m': '1h', '15m': '1h', '30m': '4h', '1h': '4h', '4h': '1d', '1d': '1w' };

function tfBucket(t, tf) {
  if (tf === '1w') { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * 864e5; }
  return Math.floor(t / TF_MS[tf]) * TF_MS[tf];
}

/** تجميع شموع إلى فريم أكبر */
export function aggregate(candles, tf) {
  const out = [];
  for (const k of candles) {
    const b = tfBucket(k.t, tf), l = out[out.length - 1];
    if (l && l.t === b) { l.h = Math.max(l.h, k.h); l.l = Math.min(l.l, k.l); l.c = k.c; l.v += k.v || 0; }
    else out.push({ t: b, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v || 0 });
  }
  return out;
}

/**
 * يُرجع دالة (t) => تقييم الفريم الأكبر عند الوقت t، من الشموع الكبيرة المكتملة قبله فقط
 * @param {(candles:Array)=>number} ratingFn
 */
export function makeHtfLookup(candles, ltf, ratingFn) {
  const htf = HIGHER_TF[ltf];
  if (!htf) return () => null;
  const big = aggregate(candles, htf);
  const cache = new Map();
  return (t) => {
    const cur = tfBucket(t, htf);
    let hi = big.length; // أول شمعة كبيرة تبدأ عند/بعد الشمعة الحالية (غير مكتملة)
    let lo = 0;
    while (lo < hi) { const m = (lo + hi) >> 1; if (big[m].t < cur) lo = m + 1; else hi = m; }
    if (lo < 60) return null;
    if (!cache.has(lo)) { try { cache.set(lo, ratingFn(big.slice(Math.max(0, lo - 300), lo))); } catch { cache.set(lo, null); } }
    return cache.get(lo);
  };
}

// =====================================================================
//  🏆 لجنة الخبراء: مراجعة أرقام خبير الذكاء الاصطناعي + القرار النهائي
// =====================================================================
const num = (v) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^\d.\-]/g, '')));

/**
 * مراجع الأمان: يتحقق من منطق الدخول/الوقف/الأهداف ويصلح ما يمكن إصلاحه
 * @returns {{status:'ok'|'fixed'|'rejected'|'wait', side, entry, entryType, stopLoss, targets, risk, riskReward, notes:string[]}}
 */
export function reviewExpertPlan(ai, { price, atr }) {
  const notes = [];
  const dec = String(ai?.decision || '').toUpperCase();
  if (dec !== 'BUY' && dec !== 'SELL') return { status: 'wait', notes: ['الخبير يرى الانتظار'] };
  const s = dec === 'BUY' ? 1 : -1;
  let status = 'ok';
  let entry = num(ai.entry);
  const limit = /معل|limit/i.test(String(ai.entry_type || ''));
  if (!isFinite(entry)) { entry = price; notes.push('لم يحدد الخبير سعر دخول — استخدمنا السعر الحالي'); status = 'fixed'; }
  const dist = Math.abs(entry - price) / atr;
  if (dist > (limit ? 3 : 1.5)) return { status: 'rejected', notes: [`سعر الدخول بعيد جداً عن السعر الحالي (${dist.toFixed(1)}×ATR)`] };
  let sl = num(ai.stop_loss);
  if (!isFinite(sl) || (entry - sl) * s <= 0) return { status: 'rejected', notes: ['وقف الخسارة في الاتجاه الخاطئ أو غير محدد'] };
  let risk = Math.abs(entry - sl);
  if (risk < 0.6 * atr) { risk = 0.8 * atr; sl = entry - s * risk; notes.push('الوقف كان ضيقاً جداً (يُضرب بسهولة بالتذبذب العادي) — وسّعناه إلى 0.8×ATR'); status = 'fixed'; }
  if (risk > 4 * atr) return { status: 'rejected', notes: [`الوقف بعيد جداً (${(risk / atr).toFixed(1)}×ATR) — مخاطرة كبيرة`] };
  let targets = (Array.isArray(ai.take_profits) ? ai.take_profits : []).map(num).filter((t) => isFinite(t) && (t - entry) * s > 0).sort((a, b) => (a - b) * s);
  if (!targets.length) { targets = [entry + s * 1.5 * risk]; notes.push('لا توجد أهداف صالحة — أضفنا هدفاً عند 1.5R'); status = 'fixed'; }
  let rr = Math.abs(targets[0] - entry) / risk;
  if (rr < 1.5 - 1e-9) {
    // الحد الأدنى للعائد/المخاطرة 1.5 (نفس شرط المحرك والتعليمات المعطاة للخبير)
    const far = targets.filter((t) => Math.abs(t - entry) / risk >= 1.5);
    if (far.length && Math.abs(far[0] - entry) / risk <= 3) { targets = far; notes.push('الهدف الأول قريب جداً بالنسبة للوقف — اعتمدنا الهدف التالي كهدف أول'); }
    else { targets = [entry + s * 1.5 * risk, ...far]; notes.push(`العائد/المخاطرة كان ${rr.toFixed(2)} فقط — رفعنا الهدف الأول إلى 1.5R`); }
    status = 'fixed';
    rr = Math.abs(targets[0] - entry) / risk;
  }
  // إكمال الأهداف إلى ثلاثة: كل هدف إضافي أبعد من السابق بـ 1.5R على الأقل
  while (targets.length < 3) {
    const lastR = Math.abs(targets[targets.length - 1] - entry) / risk;
    targets.push(entry + s * risk * Math.max(lastR + 1.5, targets.length === 1 ? 2.5 : 4));
  }
  return { status, side: dec, entry, entryType: limit ? 'limit' : 'market', stopLoss: sl, targets: targets.slice(0, 3), risk, riskReward: +rr.toFixed(2), notes };
}

/**
 * القرار النهائي للجنة: خبير الذكاء الاصطناعي + المحرك الفني (+ الفريم الأكبر داخله) + الأخبار
 * @returns {{level:'strong'|'weak'|'wait', title:string, reasons:string[], plan:Object|null}}
 */
export function committeeVerdict(ai, review, engine) {
  const reasons = [];
  if (ai?.news?.high_impact_soon === true) {
    const ev = (ai.news.upcoming_events || []).find((e) => /عالي|high/i.test(String(e.impact)));
    return { level: 'wait', title: '⛔ انتظر — خبر قوي قريب', reasons: [`حدث عالي التأثير قريب${ev ? ': ' + ev.event + (ev.time_utc ? ' (' + ev.time_utc + ' UTC)' : '') : ''} — قد يضرب أي وقف خسارة`], plan: null };
  }
  if (review.status === 'wait') return { level: 'wait', title: '⏸ انتظار', reasons: ['خبير الذكاء الاصطناعي لا يرى صفقة جيدة الآن'], plan: null };
  if (review.status === 'rejected') return { level: 'wait', title: '⛔ رفض مراجع الأمان التوصية', reasons: review.notes, plan: null };
  const agreeSide = engine?.side === review.side;
  if (!agreeSide) {
    return { level: 'wait', title: '⚠️ تعارض بين الخبراء — الأفضل الانتظار', reasons: [`الذكاء الاصطناعي يرى ${review.side === 'BUY' ? 'شراء' : 'بيع'} بينما المحرك الفني يميل لل${engine?.side === 'BUY' ? 'شراء' : 'بيع'}`], plan: review };
  }
  reasons.push(`الذكاء الاصطناعي والمحرك الفني متفقان على ${review.side === 'BUY' ? 'الشراء ⬆' : 'البيع ⬇'}`);
  if (engine.grade === 'A') {
    reasons.push('المحرك الفني: إعداد درجة A (الترند + هيكل السوق + الفريم الأكبر)');
    return { level: 'strong', title: `✅ توصية مؤكدة: ${review.side === 'BUY' ? 'شراء' : 'بيع'}`, reasons, plan: review };
  }
  reasons.push(`المحرك الفني: إعداد درجة ${engine.grade} فقط — ليست كل الشروط متوفرة`);
  return { level: 'weak', title: `⚠️ توصية ضعيفة: ${review.side === 'BUY' ? 'شراء' : 'بيع'} — بحجم صغير أو انتظر`, reasons, plan: review };
}
 
