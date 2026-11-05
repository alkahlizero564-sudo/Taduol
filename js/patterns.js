// =====================================================================
//  مكتبة الشموع اليابانية الكاملة
//  Complete Japanese Candlestick Pattern Library
//  كل نمط: اسم عربي/إنجليزي، النوع، القوة، عدد الشموع، الشرح، ودالة الاكتشاف
// =====================================================================

// ---------- أدوات مساعدة ----------
export const body = (k) => Math.abs(k.c - k.o);
export const range = (k) => Math.max(k.h - k.l, 1e-12);
export const upper = (k) => k.h - Math.max(k.o, k.c);
export const lower = (k) => Math.min(k.o, k.c) - k.l;
export const bull = (k) => k.c > k.o;
export const bear = (k) => k.c < k.o;
export const top = (k) => Math.max(k.o, k.c);
export const bot = (k) => Math.min(k.o, k.c);
export const mid = (k) => (k.o + k.c) / 2;

const isDoji = (k) => body(k) <= range(k) * 0.1;
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// متوسط حجم الجسم للشموع السابقة (لتحديد طويل/قصير)
export function avgBody(c, i, n = 10) {
  let s = 0, cnt = 0;
  for (let j = Math.max(0, i - n); j < i; j++) { s += body(c[j]); cnt++; }
  return cnt ? s / cnt : body(c[i]) || 1e-9;
}
export function avgRange(c, i, n = 10) {
  let s = 0, cnt = 0;
  for (let j = Math.max(0, i - n); j < i; j++) { s += range(c[j]); cnt++; }
  return cnt ? s / cnt : range(c[i]);
}

// اتجاه السوق قبل النمط (يعتمد على ميل الإغلاقات + المتوسط)
export function trendBefore(c, endIdx, n = 8) {
  const start = endIdx - n;
  if (start < 0) return 'side';
  let sma = 0;
  for (let j = start; j <= endIdx; j++) sma += c[j].c;
  sma /= (n + 1);
  const change = (c[endIdx].c - c[start].c) / c[start].c;
  const ar = avgRange(c, endIdx, n) / c[endIdx].c;
  const thr = Math.max(ar * 1.0, 0.002);
  if (change > thr && c[endIdx].c >= sma) return 'up';
  if (change < -thr && c[endIdx].c <= sma) return 'down';
  return 'side';
}

const long = (k, ab) => body(k) >= ab * 1.2;
const small = (k, ab) => body(k) <= ab * 0.6;
const gapUp = (a, b) => bot(b) > top(a);           // فجوة صاعدة بين الأجسام
const gapDown = (a, b) => top(b) < bot(a);         // فجوة هابطة بين الأجسام
const shadowGapUp = (a, b) => b.l > a.h;
const shadowGapDown = (a, b) => b.h < a.l;

// ---------- تعريف الأنماط ----------
// type: bullish | bearish | neutral ; kind: reversal | continuation | indecision
// reliability: 1 (ضعيف) .. 3 (قوي)
// detect(c, i, x) => boolean ، حيث i فهرس آخر شمعة في النمط
// x = { ab: متوسط الجسم, t: الاتجاه قبل النمط, tol: سماحية التساوي }

export const PATTERNS = [
  // ===================== شمعة واحدة =====================
  {
    id: 'doji', en: 'Doji', ar: 'دوجي', candles: 1, type: 'neutral', kind: 'indecision', reliability: 1,
    desc: 'الافتتاح يساوي الإغلاق تقريباً — تردد وتوازن بين البائعين والمشترين، إشارة لاحتمال الانعكاس عند القمم والقيعان.',
    detect: (c, i) => isDoji(c[i]) && upper(c[i]) > range(c[i]) * 0.1 && lower(c[i]) > range(c[i]) * 0.1 &&
      !(upper(c[i]) > range(c[i]) * 0.35 && lower(c[i]) > range(c[i]) * 0.35),
  },
  {
    id: 'long_legged_doji', en: 'Long-Legged Doji', ar: 'دوجي طويل الأرجل', candles: 1, type: 'neutral', kind: 'indecision', reliability: 2,
    desc: 'دوجي بظلال طويلة جداً من الجهتين — تذبذب عنيف وتردد شديد في السوق.',
    detect: (c, i, x) => isDoji(c[i]) && upper(c[i]) > range(c[i]) * 0.35 && lower(c[i]) > range(c[i]) * 0.35 && range(c[i]) > x.ar * 1.2,
  },
  {
    id: 'dragonfly_doji', en: 'Dragonfly Doji', ar: 'دوجي اليعسوب', candles: 1, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'دوجي بظل سفلي طويل وبدون ظل علوي — رفض للأسعار المنخفضة، إشارة صعود بعد ترند هابط.',
    detect: (c, i, x) => isDoji(c[i]) && upper(c[i]) <= range(c[i]) * 0.1 && lower(c[i]) >= range(c[i]) * 0.65 && x.t !== 'up',
  },
  {
    id: 'gravestone_doji', en: 'Gravestone Doji', ar: 'دوجي شاهد القبر', candles: 1, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'دوجي بظل علوي طويل وبدون ظل سفلي — رفض للأسعار المرتفعة، إشارة هبوط بعد ترند صاعد.',
    detect: (c, i, x) => isDoji(c[i]) && lower(c[i]) <= range(c[i]) * 0.1 && upper(c[i]) >= range(c[i]) * 0.65 && x.t !== 'down',
  },
  {
    id: 'four_price_doji', en: 'Four Price Doji', ar: 'دوجي الأسعار الأربعة', candles: 1, type: 'neutral', kind: 'indecision', reliability: 1,
    desc: 'الافتتاح والإغلاق والأعلى والأدنى متساوية تقريباً — سيولة ضعيفة جداً وتوقف تام للحركة.',
    detect: (c, i, x) => range(c[i]) <= x.ar * 0.1,
  },
  {
    id: 'hammer', en: 'Hammer', ar: 'المطرقة', candles: 1, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'جسم صغير في أعلى الشمعة وظل سفلي ضعف الجسم على الأقل بعد ترند هابط — المشترون رفضوا الهبوط.',
    detect: (c, i, x) => {
      const k = c[i];
      return x.t === 'down' && !isDoji(k) && lower(k) >= body(k) * 2 && upper(k) <= body(k) * 0.5 && body(k) <= range(k) * 0.35;
    },
  },
  {
    id: 'inverted_hammer', en: 'Inverted Hammer', ar: 'المطرقة المقلوبة', candles: 1, type: 'bullish', kind: 'reversal', reliability: 1,
    desc: 'جسم صغير في أسفل الشمعة وظل علوي طويل بعد ترند هابط — بداية محاولة صعود تحتاج تأكيد.',
    detect: (c, i, x) => {
      const k = c[i];
      return x.t === 'down' && !isDoji(k) && upper(k) >= body(k) * 2 && lower(k) <= body(k) * 0.5 && body(k) <= range(k) * 0.35;
    },
  },
  {
    id: 'hanging_man', en: 'Hanging Man', ar: 'الرجل المشنوق', candles: 1, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'شكل المطرقة لكن بعد ترند صاعد — ضغط بيعي ظهر داخل الشمعة، تحذير من انعكاس هابط.',
    detect: (c, i, x) => {
      const k = c[i];
      return x.t === 'up' && !isDoji(k) && lower(k) >= body(k) * 2 && upper(k) <= body(k) * 0.5 && body(k) <= range(k) * 0.35;
    },
  },
  {
    id: 'shooting_star', en: 'Shooting Star', ar: 'النجم الساقط (الشهاب)', candles: 1, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'جسم صغير في الأسفل وظل علوي طويل بعد ترند صاعد — البائعون رفضوا الارتفاع.',
    detect: (c, i, x) => {
      const k = c[i];
      return x.t === 'up' && !isDoji(k) && upper(k) >= body(k) * 2 && lower(k) <= body(k) * 0.5 && body(k) <= range(k) * 0.35;
    },
  },
  {
    id: 'spinning_top', en: 'Spinning Top', ar: 'القمة الدوارة (الخذروف)', candles: 1, type: 'neutral', kind: 'indecision', reliability: 1,
    desc: 'جسم صغير وظلال متقاربة من الجهتين — تردد وضعف في الاتجاه الحالي.',
    detect: (c, i, x) => {
      const k = c[i];
      return !isDoji(k) && body(k) <= range(k) * 0.3 && upper(k) > body(k) && lower(k) > body(k) &&
        Math.min(upper(k), lower(k)) / Math.max(upper(k), lower(k)) > 0.5;
    },
  },
  {
    id: 'high_wave', en: 'High Wave', ar: 'الموجة العالية', candles: 1, type: 'neutral', kind: 'indecision', reliability: 1,
    desc: 'جسم صغير جداً وظلال طويلة جداً — فقدان السيطرة على السوق.',
    detect: (c, i, x) => {
      const k = c[i];
      return !isDoji(k) && body(k) <= range(k) * 0.2 && upper(k) >= body(k) * 3 && lower(k) >= body(k) * 3 && range(k) > x.ar * 1.3;
    },
  },
  {
    id: 'bullish_marubozu', en: 'Bullish Marubozu', ar: 'ماروبوزو صاعد', candles: 1, type: 'bullish', kind: 'continuation', reliability: 2,
    desc: 'شمعة خضراء طويلة بدون ظلال تقريباً — سيطرة كاملة للمشترين.',
    detect: (c, i, x) => bull(c[i]) && long(c[i], x.ab) && upper(c[i]) <= range(c[i]) * 0.03 && lower(c[i]) <= range(c[i]) * 0.03,
  },
  {
    id: 'bearish_marubozu', en: 'Bearish Marubozu', ar: 'ماروبوزو هابط', candles: 1, type: 'bearish', kind: 'continuation', reliability: 2,
    desc: 'شمعة حمراء طويلة بدون ظلال تقريباً — سيطرة كاملة للبائعين.',
    detect: (c, i, x) => bear(c[i]) && long(c[i], x.ab) && upper(c[i]) <= range(c[i]) * 0.03 && lower(c[i]) <= range(c[i]) * 0.03,
  },
  {
    id: 'bullish_belt_hold', en: 'Bullish Belt Hold', ar: 'الحزام الصاعد', candles: 1, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'تفتح عند أدنى سعر (بدون ظل سفلي) وتغلق قرب القمة بعد هبوط — انعكاس صاعد.',
    detect: (c, i, x) => x.t === 'down' && bull(c[i]) && long(c[i], x.ab) && lower(c[i]) <= range(c[i]) * 0.02 && upper(c[i]) > range(c[i]) * 0.03 && upper(c[i]) <= range(c[i]) * 0.2,
  },
  {
    id: 'bearish_belt_hold', en: 'Bearish Belt Hold', ar: 'الحزام الهابط', candles: 1, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'تفتح عند أعلى سعر (بدون ظل علوي) وتغلق قرب القاع بعد صعود — انعكاس هابط.',
    detect: (c, i, x) => x.t === 'up' && bear(c[i]) && long(c[i], x.ab) && upper(c[i]) <= range(c[i]) * 0.02 && lower(c[i]) > range(c[i]) * 0.03 && lower(c[i]) <= range(c[i]) * 0.2,
  },
  {
    id: 'long_bull_candle', en: 'Long Bullish Candle', ar: 'شمعة صاعدة طويلة', candles: 1, type: 'bullish', kind: 'continuation', reliability: 1,
    desc: 'جسم أخضر طويل جداً مقارنة بما سبقه — زخم شرائي قوي.',
    detect: (c, i, x) => bull(c[i]) && body(c[i]) >= x.ab * 2 && body(c[i]) >= range(c[i]) * 0.6,
  },
  {
    id: 'long_bear_candle', en: 'Long Bearish Candle', ar: 'شمعة هابطة طويلة', candles: 1, type: 'bearish', kind: 'continuation', reliability: 1,
    desc: 'جسم أحمر طويل جداً مقارنة بما سبقه — زخم بيعي قوي.',
    detect: (c, i, x) => bear(c[i]) && body(c[i]) >= x.ab * 2 && body(c[i]) >= range(c[i]) * 0.6,
  },
  {
    id: 'takuri', en: 'Takuri Line', ar: 'خط تاكوري', candles: 1, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'مطرقة بظل سفلي طويل جداً (3 أضعاف الجسم) — رفض قوي للأسعار المنخفضة.',
    detect: (c, i, x) => x.t === 'down' && lower(c[i]) >= body(c[i]) * 3 && upper(c[i]) <= range(c[i]) * 0.05 && body(c[i]) > range(c[i]) * 0.03,
  },

  // ===================== شمعتان =====================
  {
    id: 'bullish_engulfing', en: 'Bullish Engulfing', ar: 'الابتلاعية الشرائية', candles: 2, type: 'bullish', kind: 'reversal', reliability: 3,
    desc: 'شمعة خضراء تبتلع جسم الحمراء السابقة بالكامل بعد هبوط — من أقوى إشارات الانعكاس الصاعد.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'down' && bear(a) && bull(b) && b.o <= a.c && b.c >= a.o && body(b) > body(a);
    },
  },
  {
    id: 'bearish_engulfing', en: 'Bearish Engulfing', ar: 'الابتلاعية البيعية', candles: 2, type: 'bearish', kind: 'reversal', reliability: 3,
    desc: 'شمعة حمراء تبتلع جسم الخضراء السابقة بالكامل بعد صعود — من أقوى إشارات الانعكاس الهابط.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'up' && bull(a) && bear(b) && b.o >= a.c && b.c <= a.o && body(b) > body(a);
    },
  },
  {
    id: 'bullish_harami', en: 'Bullish Harami', ar: 'الهارامي الصاعد (الحامل)', candles: 2, type: 'bullish', kind: 'reversal', reliability: 1,
    desc: 'شمعة حمراء كبيرة تليها شمعة صغيرة داخل جسمها بعد هبوط — تباطؤ البيع.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'down' && bear(a) && long(a, x.ab) && bull(b) && !isDoji(b) && top(b) < a.o && bot(b) > a.c && body(b) < body(a) * 0.6;
    },
  },
  {
    id: 'bearish_harami', en: 'Bearish Harami', ar: 'الهارامي الهابط (الحامل)', candles: 2, type: 'bearish', kind: 'reversal', reliability: 1,
    desc: 'شمعة خضراء كبيرة تليها شمعة صغيرة داخل جسمها بعد صعود — تباطؤ الشراء.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'up' && bull(a) && long(a, x.ab) && bear(b) && !isDoji(b) && top(b) < a.c && bot(b) > a.o && body(b) < body(a) * 0.6;
    },
  },
  {
    id: 'bullish_harami_cross', en: 'Bullish Harami Cross', ar: 'صليب الهارامي الصاعد', candles: 2, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'هارامي صاعد لكن الشمعة الثانية دوجي — إشارة أقوى من الهارامي العادي.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'down' && bear(a) && long(a, x.ab) && isDoji(b) && b.h < a.o && b.l > a.c;
    },
  },
  {
    id: 'bearish_harami_cross', en: 'Bearish Harami Cross', ar: 'صليب الهارامي الهابط', candles: 2, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'هارامي هابط لكن الشمعة الثانية دوجي — إشارة أقوى من الهارامي العادي.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'up' && bull(a) && long(a, x.ab) && isDoji(b) && b.h < a.c && b.l > a.o;
    },
  },
  {
    id: 'piercing_line', en: 'Piercing Line', ar: 'الخط الثاقب', candles: 2, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'حمراء طويلة ثم خضراء تفتح أسفل إغلاقها وتغلق فوق منتصف جسمها — انعكاس صاعد.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'down' && bear(a) && long(a, x.ab) && bull(b) && b.o < a.c && b.c > mid(a) && b.c < a.o;
    },
  },
  {
    id: 'dark_cloud_cover', en: 'Dark Cloud Cover', ar: 'الغطاء السحابي الداكن', candles: 2, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'خضراء طويلة ثم حمراء تفتح فوق إغلاقها وتغلق تحت منتصف جسمها — انعكاس هابط.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'up' && bull(a) && long(a, x.ab) && bear(b) && b.o > a.c && b.c < mid(a) && b.c > a.o;
    },
  },
  {
    id: 'tweezer_bottom', en: 'Tweezer Bottom', ar: 'قاع الملقاط', candles: 2, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'شمعتان بنفس القاع تقريباً بعد هبوط — دعم قوي ورفض لكسر المستوى.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'down' && bear(a) && bull(b) && near(a.l, b.l, x.tol);
    },
  },
  {
    id: 'tweezer_top', en: 'Tweezer Top', ar: 'قمة الملقاط', candles: 2, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'شمعتان بنفس القمة تقريباً بعد صعود — مقاومة قوية ورفض لاختراق المستوى.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'up' && bull(a) && bear(b) && near(a.h, b.h, x.tol);
    },
  },
  {
    id: 'bullish_kicker', en: 'Bullish Kicker', ar: 'الركلة الصاعدة', candles: 2, type: 'bullish', kind: 'reversal', reliability: 3,
    desc: 'ماروبوزو أحمر ثم ماروبوزو أخضر يفتح بفجوة فوق افتتاح الأولى — انعكاس عنيف جداً.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return bear(a) && bull(b) && b.o > a.o && long(a, x.ab * 0.8) && long(b, x.ab * 0.8) && b.l >= a.o - x.tol;
    },
  },
  {
    id: 'bearish_kicker', en: 'Bearish Kicker', ar: 'الركلة الهابطة', candles: 2, type: 'bearish', kind: 'reversal', reliability: 3,
    desc: 'ماروبوزو أخضر ثم ماروبوزو أحمر يفتح بفجوة تحت افتتاح الأولى — انعكاس عنيف جداً.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return bull(a) && bear(b) && b.o < a.o && long(a, x.ab * 0.8) && long(b, x.ab * 0.8) && b.h <= a.o + x.tol;
    },
  },
  {
    id: 'on_neck', en: 'On Neck', ar: 'على الرقبة', candles: 2, type: 'bearish', kind: 'continuation', reliability: 1,
    desc: 'حمراء طويلة ثم خضراء صغيرة تفتح أسفلها وتغلق عند قاعها — استمرار الهبوط.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'down' && bear(a) && long(a, x.ab) && bull(b) && b.o < a.l && near(b.c, a.l, x.tol);
    },
  },
  {
    id: 'in_neck', en: 'In Neck', ar: 'في الرقبة', candles: 2, type: 'bearish', kind: 'continuation', reliability: 1,
    desc: 'حمراء طويلة ثم خضراء تفتح أسفلها وتغلق داخل جسمها بقليل — استمرار الهبوط.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'down' && bear(a) && long(a, x.ab) && bull(b) && b.o < a.l && b.c > a.c && b.c < a.c + body(a) * 0.15;
    },
  },
  {
    id: 'thrusting', en: 'Thrusting Line', ar: 'خط الدفع', candles: 2, type: 'bearish', kind: 'continuation', reliability: 1,
    desc: 'حمراء طويلة ثم خضراء تغلق داخل جسمها لكن تحت المنتصف — استمرار الهبوط غالباً.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'down' && bear(a) && long(a, x.ab) && bull(b) && b.o < a.l && b.c >= a.c + body(a) * 0.15 && b.c < mid(a);
    },
  },
  {
    id: 'matching_low', en: 'Matching Low', ar: 'القاع المتطابق', candles: 2, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'شمعتان حمراوان بنفس سعر الإغلاق بعد هبوط — دعم قوي.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'down' && bear(a) && bear(b) && long(a, x.ab) && near(a.c, b.c, x.tol);
    },
  },
  {
    id: 'matching_high', en: 'Matching High', ar: 'القمة المتطابقة', candles: 2, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'شمعتان خضراوان بنفس سعر الإغلاق بعد صعود — مقاومة قوية.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'up' && bull(a) && bull(b) && long(a, x.ab) && near(a.c, b.c, x.tol);
    },
  },
  {
    id: 'homing_pigeon', en: 'Homing Pigeon', ar: 'الحمامة الزاجلة', candles: 2, type: 'bullish', kind: 'reversal', reliability: 1,
    desc: 'حمراء طويلة ثم حمراء صغيرة داخل جسمها بعد هبوط — ضعف البائعين.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'down' && bear(a) && bear(b) && long(a, x.ab) && b.o < a.o && b.c > a.c && body(b) < body(a) * 0.6;
    },
  },
  {
    id: 'descending_hawk', en: 'Descending Hawk', ar: 'الصقر الهابط', candles: 2, type: 'bearish', kind: 'reversal', reliability: 1,
    desc: 'خضراء طويلة ثم خضراء صغيرة داخل جسمها بعد صعود — ضعف المشترين.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'up' && bull(a) && bull(b) && long(a, x.ab) && b.o > a.o && b.c < a.c && body(b) < body(a) * 0.6;
    },
  },
  {
    id: 'bullish_counterattack', en: 'Bullish Counterattack (Meeting Lines)', ar: 'الهجوم المضاد الصاعد (خطوط الالتقاء)', candles: 2, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'حمراء طويلة ثم خضراء تفتح بفجوة هابطة وتغلق عند نفس إغلاق الحمراء.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'down' && bear(a) && bull(b) && long(a, x.ab) && long(b, x.ab * 0.8) && b.o < a.c && near(a.c, b.c, x.tol);
    },
  },
  {
    id: 'bearish_counterattack', en: 'Bearish Counterattack (Meeting Lines)', ar: 'الهجوم المضاد الهابط (خطوط الالتقاء)', candles: 2, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'خضراء طويلة ثم حمراء تفتح بفجوة صاعدة وتغلق عند نفس إغلاق الخضراء.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'up' && bull(a) && bear(b) && long(a, x.ab) && long(b, x.ab * 0.8) && b.o > a.c && near(a.c, b.c, x.tol);
    },
  },
  {
    id: 'bullish_separating_lines', en: 'Bullish Separating Lines', ar: 'خطوط الانفصال الصاعدة', candles: 2, type: 'bullish', kind: 'continuation', reliability: 2,
    desc: 'في ترند صاعد: حمراء ثم خضراء طويلة تفتح عند نفس افتتاح الحمراء — استمرار الصعود.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'up' && bear(a) && bull(b) && near(a.o, b.o, x.tol) && long(b, x.ab);
    },
  },
  {
    id: 'bearish_separating_lines', en: 'Bearish Separating Lines', ar: 'خطوط الانفصال الهابطة', candles: 2, type: 'bearish', kind: 'continuation', reliability: 2,
    desc: 'في ترند هابط: خضراء ثم حمراء طويلة تفتح عند نفس افتتاح الخضراء — استمرار الهبوط.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'down' && bull(a) && bear(b) && near(a.o, b.o, x.tol) && long(b, x.ab);
    },
  },
  {
    id: 'bullish_doji_star', en: 'Bullish Doji Star', ar: 'نجمة الدوجي الصاعدة', candles: 2, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'حمراء طويلة ثم دوجي بفجوة هابطة — تردد عند القاع وانتظار تأكيد الصعود.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'down' && bear(a) && long(a, x.ab) && isDoji(b) && top(b) < a.c;
    },
  },
  {
    id: 'bearish_doji_star', en: 'Bearish Doji Star', ar: 'نجمة الدوجي الهابطة', candles: 2, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'خضراء طويلة ثم دوجي بفجوة صاعدة — تردد عند القمة وانتظار تأكيد الهبوط.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'up' && bull(a) && long(a, x.ab) && isDoji(b) && bot(b) > a.c;
    },
  },
  {
    id: 'last_engulfing_bottom', en: 'Last Engulfing Bottom', ar: 'الابتلاع الأخير عند القاع', candles: 2, type: 'bullish', kind: 'reversal', reliability: 1,
    desc: 'في ترند هابط: خضراء ثم حمراء تبتلعها — قد تكون آخر موجة بيع قبل الانعكاس.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'down' && bull(a) && bear(b) && b.o >= a.c && b.c <= a.o && body(b) > body(a);
    },
  },
  {
    id: 'last_engulfing_top', en: 'Last Engulfing Top', ar: 'الابتلاع الأخير عند القمة', candles: 2, type: 'bearish', kind: 'reversal', reliability: 1,
    desc: 'في ترند صاعد: حمراء ثم خضراء تبتلعها — قد تكون آخر موجة شراء قبل الانعكاس.',
    detect: (c, i, x) => {
      const a = c[i - 1], b = c[i];
      return x.t === 'up' && bear(a) && bull(b) && b.o <= a.c && b.c >= a.o && body(b) > body(a);
    },
  },
  {
    id: 'bullish_inside_bar', en: 'Inside Bar (Bullish context)', ar: 'الشمعة الداخلية (سياق صاعد)', candles: 2, type: 'neutral', kind: 'continuation', reliability: 1,
    desc: 'الشمعة الثانية بالكامل (أعلى وأدنى) داخل الأولى — انضغاط سعري يسبق الانفجار في اتجاه الترند.',
    detect: (c, i) => c[i].h < c[i - 1].h && c[i].l > c[i - 1].l,
  },
  {
    id: 'outside_bar', en: 'Outside Bar', ar: 'الشمعة الخارجية', candles: 2, type: 'neutral', kind: 'indecision', reliability: 1,
    desc: 'الشمعة الثانية تغطي أعلى وأدنى الأولى بالكامل — تقلب عالٍ، اتجاه الإغلاق يحدد الطرف المسيطر.',
    detect: (c, i) => c[i].h > c[i - 1].h && c[i].l < c[i - 1].l,
  },

  // ===================== ثلاث شموع =====================
  {
    id: 'morning_star', en: 'Morning Star', ar: 'نجمة الصباح', candles: 3, type: 'bullish', kind: 'reversal', reliability: 3,
    desc: 'حمراء طويلة، ثم شمعة صغيرة بفجوة هابطة، ثم خضراء تغلق فوق منتصف الأولى — انعكاس صاعد قوي.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t === 'down' && bear(a) && long(a, x.ab) && small(b, x.ab) && !isDoji(b) && top(b) <= a.c + x.tol && bull(d) && d.c > mid(a);
    },
  },
  {
    id: 'evening_star', en: 'Evening Star', ar: 'نجمة المساء', candles: 3, type: 'bearish', kind: 'reversal', reliability: 3,
    desc: 'خضراء طويلة، ثم شمعة صغيرة بفجوة صاعدة، ثم حمراء تغلق تحت منتصف الأولى — انعكاس هابط قوي.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t === 'up' && bull(a) && long(a, x.ab) && small(b, x.ab) && !isDoji(b) && bot(b) >= a.c - x.tol && bear(d) && d.c < mid(a);
    },
  },
  {
    id: 'morning_doji_star', en: 'Morning Doji Star', ar: 'نجمة الصباح الدوجي', candles: 3, type: 'bullish', kind: 'reversal', reliability: 3,
    desc: 'نجمة صباح لكن الشمعة الوسطى دوجي — انعكاس صاعد أقوى.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t === 'down' && bear(a) && long(a, x.ab) && isDoji(b) && top(b) <= a.c + x.tol && bull(d) && d.c > mid(a);
    },
  },
  {
    id: 'evening_doji_star', en: 'Evening Doji Star', ar: 'نجمة المساء الدوجي', candles: 3, type: 'bearish', kind: 'reversal', reliability: 3,
    desc: 'نجمة مساء لكن الشمعة الوسطى دوجي — انعكاس هابط أقوى.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t === 'up' && bull(a) && long(a, x.ab) && isDoji(b) && bot(b) >= a.c - x.tol && bear(d) && d.c < mid(a);
    },
  },
  {
    id: 'bullish_abandoned_baby', en: 'Bullish Abandoned Baby', ar: 'الطفل المهجور الصاعد', candles: 3, type: 'bullish', kind: 'reversal', reliability: 3,
    desc: 'حمراء، ثم دوجي بفجوة كاملة (حتى الظلال) للأسفل، ثم خضراء بفجوة للأعلى — انعكاس نادر وقوي جداً.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t === 'down' && bear(a) && isDoji(b) && shadowGapDown(a, b) && bull(d) && shadowGapUp(b, d);
    },
  },
  {
    id: 'bearish_abandoned_baby', en: 'Bearish Abandoned Baby', ar: 'الطفل المهجور الهابط', candles: 3, type: 'bearish', kind: 'reversal', reliability: 3,
    desc: 'خضراء، ثم دوجي بفجوة كاملة للأعلى، ثم حمراء بفجوة للأسفل — انعكاس نادر وقوي جداً.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t === 'up' && bull(a) && isDoji(b) && shadowGapUp(a, b) && bear(d) && shadowGapDown(b, d);
    },
  },
  {
    id: 'three_white_soldiers', en: 'Three White Soldiers', ar: 'الجنود الثلاثة البيض', candles: 3, type: 'bullish', kind: 'reversal', reliability: 3,
    desc: 'ثلاث شموع خضراء طويلة متتالية كل منها تفتح داخل جسم السابقة وتغلق أعلى منها — صعود قوي.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return bull(a) && bull(b) && bull(d) && long(a, x.ab * 0.8) && long(b, x.ab * 0.8) && long(d, x.ab * 0.8) &&
        b.o > a.o && b.o <= a.c && d.o > b.o && d.o <= b.c && b.c > a.c && d.c > b.c &&
        upper(d) <= body(d) * 0.4 && upper(b) <= body(b) * 0.4;
    },
  },
  {
    id: 'three_black_crows', en: 'Three Black Crows', ar: 'الغربان الثلاثة السود', candles: 3, type: 'bearish', kind: 'reversal', reliability: 3,
    desc: 'ثلاث شموع حمراء طويلة متتالية كل منها تفتح داخل جسم السابقة وتغلق أدنى منها — هبوط قوي.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return bear(a) && bear(b) && bear(d) && long(a, x.ab * 0.8) && long(b, x.ab * 0.8) && long(d, x.ab * 0.8) &&
        b.o < a.o && b.o >= a.c && d.o < b.o && d.o >= b.c && b.c < a.c && d.c < b.c &&
        lower(d) <= body(d) * 0.4 && lower(b) <= body(b) * 0.4;
    },
  },
  {
    id: 'identical_three_crows', en: 'Identical Three Crows', ar: 'الغربان الثلاثة المتطابقة', candles: 3, type: 'bearish', kind: 'reversal', reliability: 3,
    desc: 'ثلاث حمراء كل منها تفتح عند إغلاق السابقة تماماً — ذعر بيعي.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t === 'up' && bear(a) && bear(b) && bear(d) && near(b.o, a.c, x.tol) && near(d.o, b.c, x.tol) && d.c < b.c && b.c < a.c;
    },
  },
  {
    id: 'three_inside_up', en: 'Three Inside Up', ar: 'الثلاثة الداخلية الصاعدة', candles: 3, type: 'bullish', kind: 'reversal', reliability: 3,
    desc: 'هارامي صاعد تؤكده شمعة ثالثة تغلق فوق افتتاح الأولى.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'down' && bear(a) && long(a, x.ab) && bull(b) && top(b) <= a.o && bot(b) >= a.c && bull(d) && d.c > a.o;
    },
  },
  {
    id: 'three_inside_down', en: 'Three Inside Down', ar: 'الثلاثة الداخلية الهابطة', candles: 3, type: 'bearish', kind: 'reversal', reliability: 3,
    desc: 'هارامي هابط تؤكده شمعة ثالثة تغلق تحت افتتاح الأولى.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'up' && bull(a) && long(a, x.ab) && bear(b) && top(b) <= a.c && bot(b) >= a.o && bear(d) && d.c < a.o;
    },
  },
  {
    id: 'three_outside_up', en: 'Three Outside Up', ar: 'الثلاثة الخارجية الصاعدة', candles: 3, type: 'bullish', kind: 'reversal', reliability: 3,
    desc: 'ابتلاعية شرائية تؤكدها شمعة ثالثة خضراء تغلق أعلى.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'down' && bear(a) && bull(b) && b.o <= a.c && b.c >= a.o && body(b) > body(a) && bull(d) && d.c > b.c;
    },
  },
  {
    id: 'three_outside_down', en: 'Three Outside Down', ar: 'الثلاثة الخارجية الهابطة', candles: 3, type: 'bearish', kind: 'reversal', reliability: 3,
    desc: 'ابتلاعية بيعية تؤكدها شمعة ثالثة حمراء تغلق أدنى.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'up' && bull(a) && bear(b) && b.o >= a.c && b.c <= a.o && body(b) > body(a) && bear(d) && d.c < b.c;
    },
  },
  {
    id: 'three_stars_south', en: 'Three Stars in the South', ar: 'النجوم الثلاثة في الجنوب', candles: 3, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'ثلاث حمراء متناقصة الحجم بقيعان أعلى تدريجياً — نفاد قوة البيع.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'down' && bear(a) && bear(b) && bear(d) && long(a, x.ab) && lower(a) > body(a) * 0.3 &&
        body(b) < body(a) && b.l > a.l && small(d, x.ab) && d.h <= b.h && d.l >= b.l;
    },
  },
  {
    id: 'advance_block', en: 'Advance Block', ar: 'الكتلة المتقدمة', candles: 3, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'ثلاث خضراء لكن أجسامها تتناقص وظلالها العلوية تكبر — ضعف الصعود.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'up' && bull(a) && bull(b) && bull(d) && b.c > a.c && d.c > b.c && b.o > a.o && b.o <= a.c && d.o > b.o && d.o <= b.c &&
        body(b) < body(a) && body(d) < body(b) && upper(d) > upper(a) && upper(d) > body(d) * 0.4;
    },
  },
  {
    id: 'deliberation', en: 'Deliberation (Stalled Pattern)', ar: 'التروي (النمط المتوقف)', candles: 3, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'خضراوان طويلتان ثم خضراء صغيرة عند القمة — توقف زخم الصعود.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'up' && bull(a) && bull(b) && long(a, x.ab) && long(b, x.ab) && bull(d) && small(d, x.ab) && d.o >= b.c - body(d) * 0.5 && b.c > a.c;
    },
  },
  {
    id: 'two_crows', en: 'Two Crows', ar: 'الغرابان', candles: 3, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'خضراء طويلة ثم حمراء بفجوة صاعدة ثم حمراء تغلق داخل جسم الأولى — انعكاس هابط.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'up' && bull(a) && long(a, x.ab) && bear(b) && gapUp(a, b) && bear(d) && d.o > b.c && d.o < b.o && d.c < a.c && d.c > a.o;
    },
  },
  {
    id: 'upside_gap_two_crows', en: 'Upside Gap Two Crows', ar: 'الغرابان بفجوة صاعدة', candles: 3, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'خضراء طويلة، حمراء صغيرة بفجوة صاعدة، ثم حمراء تبتلعها لكن تبقى فوق إغلاق الأولى.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'up' && bull(a) && long(a, x.ab) && bear(b) && gapUp(a, b) && bear(d) && d.o > b.o && d.c < b.c && d.c > a.c;
    },
  },
  {
    id: 'unique_three_river', en: 'Unique Three River Bottom', ar: 'قاع الأنهار الثلاثة الفريد', candles: 3, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'حمراء طويلة، ثم حمراء هارامي بقاع جديد، ثم خضراء صغيرة تحت إغلاق الثانية — انعكاس صاعد.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'down' && bear(a) && long(a, x.ab) && bear(b) && b.o < a.o && b.c > a.c && b.l < a.l && bull(d) && small(d, x.ab) && d.c < b.c && d.l > b.l;
    },
  },
  {
    id: 'bullish_tri_star', en: 'Bullish Tri-Star', ar: 'النجمة الثلاثية الصاعدة', candles: 3, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'ثلاث شموع دوجي متتالية والوسطى أدنى — انعكاس صاعد نادر.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'down' && isDoji(a) && isDoji(b) && isDoji(d) && top(b) < bot(a) && top(b) < bot(d);
    },
  },
  {
    id: 'bearish_tri_star', en: 'Bearish Tri-Star', ar: 'النجمة الثلاثية الهابطة', candles: 3, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'ثلاث شموع دوجي متتالية والوسطى أعلى — انعكاس هابط نادر.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'up' && isDoji(a) && isDoji(b) && isDoji(d) && bot(b) > top(a) && bot(b) > top(d);
    },
  },
  {
    id: 'upside_tasuki_gap', en: 'Upside Tasuki Gap', ar: 'فجوة تاسوكي الصاعدة', candles: 3, type: 'bullish', kind: 'continuation', reliability: 2,
    desc: 'خضراء، ثم خضراء بفجوة صاعدة، ثم حمراء تغلق داخل الفجوة دون إغلاقها — استمرار الصعود.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'up' && bull(a) && bull(b) && gapUp(a, b) && bear(d) && d.o < b.c && d.o > b.o && d.c < b.o && d.c > a.c;
    },
  },
  {
    id: 'downside_tasuki_gap', en: 'Downside Tasuki Gap', ar: 'فجوة تاسوكي الهابطة', candles: 3, type: 'bearish', kind: 'continuation', reliability: 2,
    desc: 'حمراء، ثم حمراء بفجوة هابطة، ثم خضراء تغلق داخل الفجوة دون إغلاقها — استمرار الهبوط.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'down' && bear(a) && bear(b) && gapDown(a, b) && bull(d) && d.o > b.c && d.o < b.o && d.c > b.o && d.c < a.c;
    },
  },
  {
    id: 'upside_gap_three_methods', en: 'Upside Gap Three Methods', ar: 'الطرق الثلاث بفجوة صاعدة', candles: 3, type: 'bullish', kind: 'continuation', reliability: 2,
    desc: 'خضراوان بينهما فجوة صاعدة ثم حمراء تغلق الفجوة — استمرار الصعود غالباً.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'up' && bull(a) && bull(b) && gapUp(a, b) && bear(d) && d.o > b.o && d.o < b.c && d.c < a.c && d.c > a.o;
    },
  },
  {
    id: 'downside_gap_three_methods', en: 'Downside Gap Three Methods', ar: 'الطرق الثلاث بفجوة هابطة', candles: 3, type: 'bearish', kind: 'continuation', reliability: 2,
    desc: 'حمراوان بينهما فجوة هابطة ثم خضراء تغلق الفجوة — استمرار الهبوط غالباً.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'down' && bear(a) && bear(b) && gapDown(a, b) && bull(d) && d.o < b.o && d.o > b.c && d.c > a.c && d.c < a.o;
    },
  },
  {
    id: 'stick_sandwich', en: 'Stick Sandwich', ar: 'الساندويتش', candles: 3, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'حمراء، خضراء، ثم حمراء تغلق عند نفس إغلاق الأولى — دعم قوي عند هذا المستوى.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'down' && bear(a) && bull(b) && bear(d) && b.c > a.o && near(a.c, d.c, x.tol);
    },
  },
  {
    id: 'bearish_stick_sandwich', en: 'Bearish Stick Sandwich', ar: 'الساندويتش الهابط', candles: 3, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'خضراء، حمراء، ثم خضراء تغلق عند نفس إغلاق الأولى — مقاومة قوية عند هذا المستوى.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'up' && bull(a) && bear(b) && bull(d) && b.c < a.o && near(a.c, d.c, x.tol);
    },
  },
  {
    id: 'bullish_side_by_side_white', en: 'Side-by-Side White Lines (Bullish)', ar: 'الخطوط البيضاء المتجاورة الصاعدة', candles: 3, type: 'bullish', kind: 'continuation', reliability: 2,
    desc: 'خضراء ثم خضراوان متشابهتان بفجوة صاعدة وبنفس الافتتاح — استمرار الصعود.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'up' && bull(a) && bull(b) && bull(d) && gapUp(a, b) && near(b.o, d.o, x.tol) && Math.abs(body(b) - body(d)) <= body(b) * 0.3;
    },
  },
  {
    id: 'bearish_side_by_side_white', en: 'Side-by-Side White Lines (Bearish)', ar: 'الخطوط البيضاء المتجاورة الهابطة', candles: 3, type: 'bearish', kind: 'continuation', reliability: 2,
    desc: 'حمراء ثم خضراوان متشابهتان بفجوة هابطة وبنفس الافتتاح — استمرار الهبوط.',
    detect: (c, i, x) => {
      const a = c[i - 2], b = c[i - 1], d = c[i];
      return x.t3 === 'down' && bear(a) && bull(b) && bull(d) && gapDown(a, b) && near(b.o, d.o, x.tol) && Math.abs(body(b) - body(d)) <= body(b) * 0.3;
    },
  },

  // ===================== أربع شموع وأكثر =====================
  {
    id: 'bullish_three_line_strike', en: 'Bullish Three-Line Strike', ar: 'الضربة الثلاثية الصاعدة', candles: 4, type: 'bullish', kind: 'continuation', reliability: 2,
    desc: 'ثلاث خضراء صاعدة ثم حمراء طويلة تبتلعها كلها — غالباً استمرار للصعود بعد جني الأرباح.',
    detect: (c, i) => {
      const [a, b, d, e] = [c[i - 3], c[i - 2], c[i - 1], c[i]];
      return bull(a) && bull(b) && bull(d) && b.c > a.c && d.c > b.c && bear(e) && e.o >= d.c && e.c <= a.o;
    },
  },
  {
    id: 'bearish_three_line_strike', en: 'Bearish Three-Line Strike', ar: 'الضربة الثلاثية الهابطة', candles: 4, type: 'bearish', kind: 'continuation', reliability: 2,
    desc: 'ثلاث حمراء هابطة ثم خضراء طويلة تبتلعها كلها — غالباً استمرار للهبوط بعد تصحيح.',
    detect: (c, i) => {
      const [a, b, d, e] = [c[i - 3], c[i - 2], c[i - 1], c[i]];
      return bear(a) && bear(b) && bear(d) && b.c < a.c && d.c < b.c && bull(e) && e.o <= d.c && e.c >= a.o;
    },
  },
  {
    id: 'concealing_baby_swallow', en: 'Concealing Baby Swallow', ar: 'ابتلاع السنونو الصغير', candles: 4, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'ماروبوزو حمراوان، ثم حمراء بظل علوي داخل الثانية، ثم حمراء تبتلعها — نفاد البيع.',
    detect: (c, i, x) => {
      const [a, b, d, e] = [c[i - 3], c[i - 2], c[i - 1], c[i]];
      return bear(a) && bear(b) && bear(d) && bear(e) && upper(a) <= range(a) * 0.05 && upper(b) <= range(b) * 0.05 &&
        gapDown(b, d) && d.h > b.c && e.o > d.h && e.c < d.l;
    },
  },
  {
    id: 'rising_three_methods', en: 'Rising Three Methods', ar: 'الطرق الثلاث الصاعدة', candles: 5, type: 'bullish', kind: 'continuation', reliability: 3,
    desc: 'خضراء طويلة، ثم 3 شموع صغيرة هابطة داخل نطاقها، ثم خضراء طويلة تغلق فوقها — استمرار الصعود.',
    detect: (c, i, x) => {
      const a = c[i - 4], m = [c[i - 3], c[i - 2], c[i - 1]], e = c[i];
      return bull(a) && long(a, x.ab) && m.every((k) => small(k, body(a)) && k.h <= a.h && k.l >= a.l) &&
        m.filter(bear).length >= 2 && bull(e) && long(e, x.ab) && e.c > a.c;
    },
  },
  {
    id: 'falling_three_methods', en: 'Falling Three Methods', ar: 'الطرق الثلاث الهابطة', candles: 5, type: 'bearish', kind: 'continuation', reliability: 3,
    desc: 'حمراء طويلة، ثم 3 شموع صغيرة صاعدة داخل نطاقها، ثم حمراء طويلة تغلق تحتها — استمرار الهبوط.',
    detect: (c, i, x) => {
      const a = c[i - 4], m = [c[i - 3], c[i - 2], c[i - 1]], e = c[i];
      return bear(a) && long(a, x.ab) && m.every((k) => small(k, body(a)) && k.h <= a.h && k.l >= a.l) &&
        m.filter(bull).length >= 2 && bear(e) && long(e, x.ab) && e.c < a.c;
    },
  },
  {
    id: 'mat_hold', en: 'Mat Hold', ar: 'التمسك بالحصيرة', candles: 5, type: 'bullish', kind: 'continuation', reliability: 3,
    desc: 'خضراء طويلة، فجوة صاعدة ثم 3 شموع صغيرة تصحح دون كسر الأولى، ثم خضراء قوية لقمة جديدة.',
    detect: (c, i, x) => {
      const a = c[i - 4], b = c[i - 3], d = c[i - 2], f = c[i - 1], e = c[i];
      return x.t5 === 'up' && bull(a) && long(a, x.ab) && gapUp(a, b) && [b, d, f].every((k) => small(k, body(a)) && k.l > a.o) &&
        bull(e) && e.c > Math.max(b.h, d.h, f.h);
    },
  },
  {
    id: 'bullish_breakaway', en: 'Bullish Breakaway', ar: 'الانفصال الصاعد', candles: 5, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'حمراء طويلة، فجوة هابطة وثلاث شموع تكمل الهبوط ببطء، ثم خضراء طويلة تغلق داخل الفجوة.',
    detect: (c, i, x) => {
      const a = c[i - 4], b = c[i - 3], d = c[i - 2], f = c[i - 1], e = c[i];
      return x.t5 === 'down' && bear(a) && long(a, x.ab) && bear(b) && gapDown(a, b) && f.c < b.c && bull(e) && e.c > b.o && e.c < a.c;
    },
  },
  {
    id: 'bearish_breakaway', en: 'Bearish Breakaway', ar: 'الانفصال الهابط', candles: 5, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'خضراء طويلة، فجوة صاعدة وثلاث شموع تكمل الصعود ببطء، ثم حمراء طويلة تغلق داخل الفجوة.',
    detect: (c, i, x) => {
      const a = c[i - 4], b = c[i - 3], d = c[i - 2], f = c[i - 1], e = c[i];
      return x.t5 === 'up' && bull(a) && long(a, x.ab) && bull(b) && gapUp(a, b) && f.c > b.c && bear(e) && e.c < b.o && e.c > a.c;
    },
  },
  {
    id: 'ladder_bottom', en: 'Ladder Bottom', ar: 'قاع السلم', candles: 5, type: 'bullish', kind: 'reversal', reliability: 2,
    desc: 'أربع حمراء متتالية بإغلاقات أدنى (الرابعة بظل علوي)، ثم خضراء تفتح بفجوة صاعدة — انعكاس صاعد.',
    detect: (c, i, x) => {
      const [a, b, d, f, e] = [c[i - 4], c[i - 3], c[i - 2], c[i - 1], c[i]];
      return bear(a) && bear(b) && bear(d) && bear(f) && b.c < a.c && d.c < b.c && f.c < d.c && upper(f) > body(f) * 0.5 && bull(e) && e.o > f.o;
    },
  },
  {
    id: 'ladder_top', en: 'Ladder Top', ar: 'قمة السلم', candles: 5, type: 'bearish', kind: 'reversal', reliability: 2,
    desc: 'أربع خضراء متتالية بإغلاقات أعلى (الرابعة بظل سفلي)، ثم حمراء تفتح بفجوة هابطة — انعكاس هابط.',
    detect: (c, i, x) => {
      const [a, b, d, f, e] = [c[i - 4], c[i - 3], c[i - 2], c[i - 1], c[i]];
      return bull(a) && bull(b) && bull(d) && bull(f) && b.c > a.c && d.c > b.c && f.c > d.c && lower(f) > body(f) * 0.5 && bear(e) && e.o < f.o;
    },
  },
];

// خريطة سريعة بالمعرّف
export const PATTERN_MAP = Object.fromEntries(PATTERNS.map((p) => [p.id, p]));

/**
 * اكتشاف جميع الأنماط في سلسلة شموع
 * @param {Array<{o,h,l,c,t?}>} candles
 * @param {{lookback?:number}} opts  عدد الشموع الأخيرة التي نفحصها (افتراضي: الكل)
 * @returns {Array<{index, id, en, ar, type, kind, reliability, candles}>}
 */
export function detectPatterns(candles, opts = {}) {
  const out = [];
  const n = candles.length;
  const from = opts.lookback ? Math.max(0, n - opts.lookback) : 0;
  for (let i = from; i < n; i++) {
    const ab = avgBody(candles, i, 10);
    const ar = avgRange(candles, i, 10);
    const tol = Math.max(ar * 0.05, candles[i].c * 0.0002);
    const ctxByLen = {};
    for (const p of PATTERNS) {
      const start = i - p.candles + 1;
      if (start < 0) continue;
      if (!ctxByLen[p.candles]) {
        const pre = start - 1;
        const t = pre >= 0 ? trendBefore(candles, pre) : 'side';
        ctxByLen[p.candles] = { ab: avgBody(candles, start, 10) || ab, ar, tol, t, t3: t, t5: t };
      }
      let hit = false;
      try { hit = !!p.detect(candles, i, ctxByLen[p.candles]); } catch { hit = false; }
      if (hit) {
        out.push({ index: i, start, id: p.id, en: p.en, ar: p.ar, type: p.type, kind: p.kind, reliability: p.reliability, candles: p.candles });
      }
    }
  }
  return out;
}

// قائمة نصية مختصرة بكل الأنماط لاستخدامها في برومبت الذكاء الاصطناعي
export function patternCatalogText() {
  return PATTERNS.map((p) => `- ${p.en} (${p.ar}) [${p.candles} شموع، ${p.type}]`).join('\n');
}
