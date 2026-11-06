// =====================================================================
//  محرك الإشارات — يدمج الشموع اليابانية + المؤشرات لتحديد الاتجاه
//  ونقطة الدخول ووقف الخسارة والأهداف
// =====================================================================
import { detectPatterns } from './patterns.js';
import { computeAll, last, prevOf, supportResistance, fibonacci, pivots, swings } from './indicators.js';
import { technicalRating } from './rating.js';
import { buildPlan } from './strategy.js';

/**
 * تحليل فني كامل لسلسلة شموع
 * @returns {{
 *   direction:'BUY'|'SELL'|'WAIT', bias:'صاعد'|'هابط'|'عرضي', confidence:number, score:number,
 *   entry:number, stopLoss:number, targets:number[], riskReward:number,
 *   signals:Array<{name,value,vote,note}>, patterns:Array, levels:Array, fib:Object, pivots:Object, ind:Object
 * }}
 */
/**
 * @param {Array} candles
 * @param {{closedOnly?:boolean, htf?:number|null}} opts
 *   closedOnly: أنماط الشموع تُقرأ من الشموع المكتملة فقط (الشمعة الأخيرة قيد التكوّن قد تنقلب)
 *   htf: تقييم الفريم الأكبر (-1..1) لاستخدامه كفلتر
 */
export function analyze(candles, opts = {}) {
  const closedOnly = opts.closedOnly !== false;
  if (!candles || candles.length < 60) throw new Error('نحتاج 60 شمعة على الأقل للتحليل');
  const ind = computeAll(candles);
  const k = candles[candles.length - 1];
  const price = k.c;
  const signals = [];
  const vote = (name, value, v, note, w = 1) => signals.push({ name, value, vote: v * w, raw: v, weight: w, note });

  // ---- المتوسطات المتحركة ----
  const e20 = last(ind.ema20), e50 = last(ind.ema50), e200 = last(ind.ema200), e9 = last(ind.ema9);
  if (e20 && e50) vote('EMA 20/50', `${fmt(e20)} / ${fmt(e50)}`, e20 > e50 ? 1 : -1, e20 > e50 ? 'تقاطع إيجابي — المتوسط القصير فوق الطويل' : 'تقاطع سلبي — المتوسط القصير تحت الطويل', 1.5);
  if (e200) vote('EMA 200', fmt(e200), price > e200 ? 1 : -1, price > e200 ? 'السعر فوق متوسط 200 — ترند عام صاعد' : 'السعر تحت متوسط 200 — ترند عام هابط', 1.5);
  if (e9) vote('EMA 9', fmt(e9), price > e9 ? 1 : -1, price > e9 ? 'زخم قصير المدى إيجابي' : 'زخم قصير المدى سلبي', 0.5);

  // ---- RSI ----
  const r = last(ind.rsi), rPrev = prevOf(ind.rsi);
  if (r != null) {
    let v = 0, note = 'محايد';
    if (r < 30) { v = 1; note = 'تشبع بيعي — احتمال ارتداد صاعد'; }
    else if (r > 70) { v = -1; note = 'تشبع شرائي — احتمال تصحيح هابط'; }
    else if (r > 50 && r > rPrev) { v = 0.5; note = 'فوق 50 ويرتفع — زخم إيجابي'; }
    else if (r < 50 && r < rPrev) { v = -0.5; note = 'تحت 50 وينخفض — زخم سلبي'; }
    vote('RSI 14', r.toFixed(1), v, note, 1.2);
  }

  // ---- MACD ----
  const ml = last(ind.macd.line), ms = last(ind.macd.signal), mh = last(ind.macd.hist), mhp = prevOf(ind.macd.hist);
  if (ml != null && ms != null) {
    let v = ml > ms ? 1 : -1;
    let note = ml > ms ? 'خط MACD فوق الإشارة' : 'خط MACD تحت الإشارة';
    if (mh > 0 && mhp <= 0) note = 'تقاطع صاعد جديد! إشارة شراء';
    if (mh < 0 && mhp >= 0) note = 'تقاطع هابط جديد! إشارة بيع';
    if (Math.abs(mh) < Math.abs(mhp)) { v *= 0.6; note += ' (الزخم يضعف)'; }
    vote('MACD', `${fmt(ml)} | hist ${fmt(mh)}`, v, note, 1.3);
  }

  // ---- ADX ----
  const a = last(ind.adx.adx), pdi = last(ind.adx.pdi), mdi = last(ind.adx.mdi);
  let trendStrength = 'ضعيف';
  if (a != null) {
    trendStrength = a > 40 ? 'قوي جداً' : a > 25 ? 'قوي' : a > 20 ? 'متوسط' : 'ضعيف/عرضي';
    vote('ADX / DMI', `${a.toFixed(1)} (+DI ${pdi.toFixed(1)} / -DI ${mdi.toFixed(1)})`, a > 20 ? (pdi > mdi ? 1 : -1) : 0, `قوة الترند: ${trendStrength} — ${pdi > mdi ? 'المشترون مسيطرون' : 'البائعون مسيطرون'}`, 1.2);
  }

  // ---- Stochastic ----
  const sk = last(ind.stoch.k), sd = last(ind.stoch.d);
  if (sk != null && sd != null) {
    let v = 0, note = 'محايد';
    if (sk < 20 && sk > sd) { v = 1; note = 'تقاطع صاعد في منطقة التشبع البيعي'; }
    else if (sk > 80 && sk < sd) { v = -1; note = 'تقاطع هابط في منطقة التشبع الشرائي'; }
    else if (sk < 20) { v = 0.5; note = 'تشبع بيعي'; }
    else if (sk > 80) { v = -0.5; note = 'تشبع شرائي'; }
    else { v = sk > sd ? 0.3 : -0.3; note = sk > sd ? '%K فوق %D' : '%K تحت %D'; }
    vote('Stochastic', `${sk.toFixed(1)} / ${sd.toFixed(1)}`, v, note);
  }

  // ---- Bollinger ----
  const bu = last(ind.bb.upper), bl = last(ind.bb.lower), bm = last(ind.bb.mid);
  if (bu != null) {
    let v = 0, note = 'داخل النطاق';
    if (price <= bl) { v = 0.7; note = 'السعر عند/تحت الحد السفلي — احتمال ارتداد'; }
    else if (price >= bu) { v = -0.7; note = 'السعر عند/فوق الحد العلوي — احتمال تصحيح'; }
    else { v = price > bm ? 0.3 : -0.3; note = price > bm ? 'فوق الخط الأوسط' : 'تحت الخط الأوسط'; }
    const width = ((bu - bl) / bm) * 100;
    vote('Bollinger Bands', `عرض ${width.toFixed(2)}%`, v, note);
  }

  // ---- Supertrend ----
  const st = last(ind.supertrend);
  if (st) vote('Supertrend', fmt(st.value), st.up ? 1 : -1, st.up ? 'الاتجاه صاعد' : 'الاتجاه هابط', 1.5);

  // ---- Parabolic SAR ----
  const ps = last(ind.psar);
  if (ps) vote('Parabolic SAR', fmt(ps.value), ps.up ? 1 : -1, ps.up ? 'النقاط تحت السعر — صاعد' : 'النقاط فوق السعر — هابط', 0.8);

  // ---- Ichimoku ----
  const sa = last(ind.ichimoku.spanA), sb = last(ind.ichimoku.spanB), tk = last(ind.ichimoku.tenkan), kj = last(ind.ichimoku.kijun);
  if (sa != null && sb != null) {
    const cloudTop = Math.max(sa, sb), cloudBot = Math.min(sa, sb);
    let v = price > cloudTop ? 1 : price < cloudBot ? -1 : 0;
    if (tk != null && kj != null) v += tk > kj ? 0.3 : -0.3;
    vote('Ichimoku', `سحابة ${fmt(cloudBot)}–${fmt(cloudTop)}`, Math.max(-1, Math.min(1, v)), price > cloudTop ? 'السعر فوق السحابة — صاعد' : price < cloudBot ? 'السعر تحت السحابة — هابط' : 'السعر داخل السحابة — عرضي', 1.3);
  }

  // ---- CCI / Williams / MFI ----
  const cc = last(ind.cci);
  if (cc != null) vote('CCI 20', cc.toFixed(0), cc < -100 ? 0.6 : cc > 100 ? -0.6 : cc > 0 ? 0.2 : -0.2, cc < -100 ? 'تشبع بيعي' : cc > 100 ? 'تشبع شرائي' : 'محايد', 0.6);
  const wr = last(ind.willr);
  if (wr != null) vote('Williams %R', wr.toFixed(0), wr < -80 ? 0.5 : wr > -20 ? -0.5 : 0, wr < -80 ? 'تشبع بيعي' : wr > -20 ? 'تشبع شرائي' : 'محايد', 0.5);
  const mf = last(ind.mfi);
  if (mf != null && candles.some((x) => x.v)) vote('MFI 14', mf.toFixed(0), mf < 20 ? 0.6 : mf > 80 ? -0.6 : 0, mf < 20 ? 'تدفق نقدي ضعيف جداً — قاع محتمل' : mf > 80 ? 'تدفق نقدي مفرط — قمة محتملة' : 'محايد', 0.6);

  // ---- OBV (الحجم) ----
  if (candles.some((x) => x.v)) {
    const o = ind.obv, n = o.length;
    const slope = o[n - 1] - o[Math.max(0, n - 10)];
    vote('OBV (الحجم)', slope > 0 ? 'يرتفع' : 'ينخفض', slope > 0 ? 0.5 : -0.5, slope > 0 ? 'الحجم يدعم الصعود' : 'الحجم يدعم الهبوط', 0.7);
  }

  // ---- مؤشرات للاطلاع (وزن 0: اختُبرت على بيانات حقيقية ولم تحسّن النتائج خارج العينة، فلا تدخل في القرار) ----
  const info = (name, value, v, note) => vote(name, value, v, note + ' (للاطلاع)', 0);
  const kcU = last(ind.kc?.upper), kcL = last(ind.kc?.lower);
  if (kcU != null) info('Keltner Channels', `${fmt(kcL)} – ${fmt(kcU)}`, price > kcU ? 1 : price < kcL ? -1 : 0, price > kcU ? 'السعر فوق القناة — زخم قوي/ممتد' : price < kcL ? 'السعر تحت القناة — زخم هابط/ممتد' : 'داخل القناة');
  const dcU = last(ind.dc?.upper), dcL = last(ind.dc?.lower), dcM = last(ind.dc?.mid);
  if (dcU != null) info('Donchian (20)', `${fmt(dcL)} – ${fmt(dcU)}`, price >= dcU ? 1 : price <= dcL ? -1 : price > dcM ? 0.3 : -0.3, price >= dcU ? 'اختراق أعلى 20 شمعة' : price <= dcL ? 'كسر أدنى 20 شمعة' : price > dcM ? 'فوق منتصف القناة' : 'تحت منتصف القناة');
  const au = last(ind.aroon?.up), ad = last(ind.aroon?.down);
  if (au != null) info('Aroon (25)', `↑${au.toFixed(0)} ↓${ad.toFixed(0)}`, au > 70 && au > ad ? 1 : ad > 70 && ad > au ? -1 : 0, au > 70 && au > ad ? 'قمم حديثة — ترند صاعد' : ad > 70 && ad > au ? 'قيعان حديثة — ترند هابط' : 'لا ترند واضح');
  const rc = last(ind.roc);
  if (rc != null) info('ROC (10)', rc.toFixed(2) + '%', rc > 0 ? 0.5 : -0.5, rc > 0 ? 'معدل التغير موجب' : 'معدل التغير سالب');
  const tx = last(ind.trix);
  if (tx != null) info('TRIX (15)', tx.toFixed(4), tx > 0 ? 0.5 : -0.5, tx > 0 ? 'زخم ثلاثي التنعيم صاعد' : 'زخم ثلاثي التنعيم هابط');
  const ha = ind.ha?.slice(-3) || [];
  if (ha.length === 3) { const g = ha.filter((k) => k.c > k.o).length; info('Heikin-Ashi', `${g}/3 خضراء`, g === 3 ? 1 : g === 0 ? -1 : 0, g === 3 ? '3 شموع صاعدة متتالية' : g === 0 ? '3 شموع هابطة متتالية' : 'متذبذب'); }
  const sq = last(ind.sq);
  if (sq != null) info('Squeeze (TTM)', sq ? 'انضغاط' : 'منطلق', 0, sq ? 'هدوء — غالباً تتبعه حركة قوية' : 'لا انضغاط');
  const cm = last(ind.cmf);
  if (cm != null && candles.some((x) => x.v)) info('Chaikin MF (20)', cm.toFixed(3), cm > 0.05 ? 0.5 : cm < -0.05 ? -0.5 : 0, cm > 0.05 ? 'تدفق أموال داخل' : cm < -0.05 ? 'تدفق أموال خارج' : 'محايد');

  // ---- الشموع اليابانية (آخر 5 شموع) ----
  const patternSrc = closedOnly && candles.length > 61 ? candles.slice(0, -1) : candles;
  const patterns = detectPatterns(patternSrc, { lookback: 5 });
  const lastIdx = patternSrc.length - 1;
  for (const p of patterns) {
    const recency = 1 - (lastIdx - p.index) * 0.18; // الأحدث أهم
    const v = p.type === 'bullish' ? 1 : p.type === 'bearish' ? -1 : 0;
    if (v !== 0) vote(`🕯️ ${p.ar}`, p.en, v, `${p.kind === 'reversal' ? 'انعكاسي' : 'استمراري'} — قوة ${'★'.repeat(p.reliability)}`, 0.6 * p.reliability * recency);
  }

  // ---- النتيجة ----
  const totalW = signals.reduce((s, x) => s + x.weight, 0);
  const engineScore = signals.reduce((s, x) => s + x.vote, 0) / (totalW || 1); // من -1 إلى 1
  // دمج محرك الشموع/المؤشرات الموزون مع التقييم الفني الشامل (26 مؤشراً)
  const rating = technicalRating(candles, ind);
  const score = 0.6 * engineScore + 0.4 * rating.overall;
  const bias = score > 0.08 ? 'صاعد' : score < -0.08 ? 'هابط' : 'عرضي';

  // ---- خطة الصفقة (الدخول / الوقف / الأهداف / الدرجة) ----
  const atrV = last(ind.atr) || price * 0.01;
  const levels = supportResistance(candles);
  const plan = buildPlan(candles, { ind, score, rating, patterns, levels, atr: atrV, htf: opts.htf ?? null });

  return {
    direction: plan.direction, side: plan.side, grade: plan.grade, bias, confidence: plan.confidence, score: +score.toFixed(3), trendStrength,
    price, entry: plan.entry, entryType: plan.entryType, entryZone: plan.entryZone, stopLoss: plan.stopLoss, targets: plan.targets,
    riskReward: plan.riskReward, risk: plan.risk, factors: plan.factors, confluence: plan.confluence, structure: plan.structure, divergence: plan.divergence,
    atr: atrV, signals, rating, patterns, levels, fib: fibonacci(candles), pivots: pivots(candles[candles.length - 2] || k),
    swings: swings(candles.slice(-60), 2, 2), ind,
  };
}

// ملخص نصي يُرسل للذكاء الاصطناعي كسياق إضافي
export function summaryForAI(res, symbol, interval) {
  const lines = [
    `الرمز: ${symbol} | الفريم: ${interval} | السعر الحالي: ${fmt(res.price)}`,
    `نتيجة المحرك الفني: ${res.direction} (الاتجاه المقترح ${res.side}، درجة ${res.grade}) | الميل: ${res.bias} | الثقة: ${res.confidence}% | قوة الترند: ${res.trendStrength}`,
    `خطة المحرك: دخول ${fmt(res.entry)} (${res.entryType === 'limit' ? 'أمر معلّق' : 'فوري'}) | وقف ${fmt(res.stopLoss)} | أهداف ${res.targets.map(fmt).join(' / ')} | عائد/مخاطرة ${res.riskReward}`,
    'عوامل التوافق: ' + (res.factors || []).map((x) => `${x.ok === true ? '✓' : x.ok === false ? '✗' : '•'} ${x.text}`).join(' | '),
    `ATR: ${fmt(res.atr)}`,
    ...(res.rating ? [`التقييم الفني الشامل (26 مؤشراً): ${res.rating.label} (${res.rating.overall}) — المتوسطات: ${res.rating.ma.label} [شراء ${res.rating.ma.buy}/بيع ${res.rating.ma.sell}] — المذبذبات: ${res.rating.osc.label} [شراء ${res.rating.osc.buy}/بيع ${res.rating.osc.sell}]`] : []),
    'المؤشرات:',
    ...res.signals.map((s) => `- ${s.name}: ${s.value} → ${s.note}`),
    'الدعوم والمقاومات: ' + res.levels.map((l) => `${fmt(l.price)}(${l.touches})`).join(', '),
    'فيبوناتشي: ' + res.fib.levels.map((l) => `${l.ratio}=${fmt(l.price)}`).join(', '),
  ];
  return lines.join('\n');
}

export function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  const a = Math.abs(n);
  const d = a >= 1000 ? 2 : a >= 10 ? 3 : a >= 1 ? 4 : a >= 0.01 ? 5 : 8;
  return Number(n).toFixed(d);
}
