// =====================================================================
//  قراءة السوق — التقييم الفني الشامل بأشهر المؤشرات
//  على نمط "التقييم الفني" المعروف في منصات التداول:
//   • المتوسطات المتحركة (15): EMA/SMA 10,20,30,50,100,200 + Ichimoku + VWMA + Hull
//   • المذبذبات (11): RSI, Stochastic, CCI, ADX, AO, Momentum, MACD, Stoch RSI, Williams %R, Bull/Bear Power, UO
//  كل مؤشر يصوّت: شراء (+1) أو بيع (-1) أو محايد (0)
// =====================================================================
import { last, prevOf } from './indicators.js';

export const RATING_LABELS = {
  'STRONG_BUY': { ar: 'شراء قوي', cls: 'up' },
  'BUY': { ar: 'شراء', cls: 'up' },
  'NEUTRAL': { ar: 'محايد', cls: 'flat' },
  'SELL': { ar: 'بيع', cls: 'down' },
  'STRONG_SELL': { ar: 'بيع قوي', cls: 'down' },
};

export function ratingLabel(v) {
  if (v == null || isNaN(v)) return 'NEUTRAL';
  if (v > 0.5) return 'STRONG_BUY';
  if (v > 0.1) return 'BUY';
  if (v < -0.5) return 'STRONG_SELL';
  if (v < -0.1) return 'SELL';
  return 'NEUTRAL';
}

const summarize = (items) => {
  const valid = items.filter((x) => x.vote !== null);
  const buy = valid.filter((x) => x.vote > 0).length, sell = valid.filter((x) => x.vote < 0).length;
  const score = valid.length ? valid.reduce((s, x) => s + x.vote, 0) / valid.length : 0;
  return { items, buy, sell, neutral: valid.length - buy - sell, score: +score.toFixed(3), label: ratingLabel(score) };
};

/**
 * @param {Array} candles
 * @param {Object} ind ناتج computeAll
 */
export function technicalRating(candles, ind) {
  const price = candles[candles.length - 1].c;

  // ---------- المتوسطات المتحركة ----------
  const maNames = [
    ['EMA 10', 'ema10'], ['SMA 10', 'sma10'], ['EMA 20', 'ema20'], ['SMA 20', 'sma20'], ['EMA 30', 'ema30'], ['SMA 30', 'sma30'],
    ['EMA 50', 'ema50'], ['SMA 50', 'sma50'], ['EMA 100', 'ema100'], ['SMA 100', 'sma100'], ['EMA 200', 'ema200'], ['SMA 200', 'sma200'],
    ['VWMA 20', 'vwma20'], ['Hull MA 9', 'hma9'],
  ];
  const ma = maNames.map(([name, k]) => {
    const v = last(ind.ma[k]);
    if (v == null) return { name, value: null, vote: null };
    return { name, value: v, vote: v < price ? 1 : v > price ? -1 : 0 };
  });
  // Ichimoku Base Line: شراء إذا كان الكيجون تحت السعر والتنكان فوق الكيجون والسعر فوق السحابة
  {
    const kj = last(ind.ichimoku.kijun), tk = last(ind.ichimoku.tenkan), a = last(ind.ichimoku.spanA), b = last(ind.ichimoku.spanB);
    let vote = null;
    if (kj != null && tk != null && a != null && b != null) {
      const top = Math.max(a, b), bot = Math.min(a, b);
      vote = kj < price && tk > kj && price > top ? 1 : kj > price && tk < kj && price < bot ? -1 : 0;
    }
    ma.push({ name: 'Ichimoku Base (26)', value: kj, vote });
  }

  // ---------- المذبذبات ----------
  const osc = [];
  const push = (name, value, vote) => osc.push({ name, value, vote: value == null ? null : vote });

  const r = last(ind.rsi), rp = prevOf(ind.rsi);
  push('RSI (14)', r, r < 30 && r > rp ? 1 : r > 70 && r < rp ? -1 : 0);

  const sk = last(ind.stoch.k), sd = last(ind.stoch.d);
  push('Stochastic %K (14,3,3)', sk, sk < 20 && sk > sd ? 1 : sk > 80 && sk < sd ? -1 : 0);

  const cc = last(ind.cci), ccp = prevOf(ind.cci);
  push('CCI (20)', cc, cc < -100 && cc > ccp ? 1 : cc > 100 && cc < ccp ? -1 : 0);

  const ad = last(ind.adx.adx), adp = prevOf(ind.adx.adx), pdi = last(ind.adx.pdi), mdi = last(ind.adx.mdi);
  push('ADX (14)', ad, ad > 20 && ad > adp ? (pdi > mdi ? 1 : -1) : 0);

  const ao = last(ind.ao), aop = prevOf(ind.ao), aop2 = prevOf(ind.ao, 2);
  // صحن (saucer) أو عبور الصفر
  push('Awesome Oscillator', ao,
    (ao > 0 && aop < 0) || (ao > 0 && aop > 0 && aop < aop2 && ao > aop) ? 1
      : (ao < 0 && aop > 0) || (ao < 0 && aop < 0 && aop > aop2 && ao < aop) ? -1 : 0);

  const mo = last(ind.mom), mop = prevOf(ind.mom);
  push('Momentum (10)', mo, mo > mop ? 1 : mo < mop ? -1 : 0);

  const ml = last(ind.macd.line), ms = last(ind.macd.signal);
  push('MACD (12,26)', ml, ml > ms ? 1 : ml < ms ? -1 : 0);

  const srk = last(ind.stochRsi.k), srd = last(ind.stochRsi.d);
  const e50 = last(ind.ma.ema50);
  const up = e50 != null ? price > e50 : true;
  push('Stoch RSI (3,3,14,14)', srk, !up && srk < 20 && srk > srd ? 1 : up && srk > 80 && srk < srd ? -1 : (srk < 20 && srk > srd ? 1 : srk > 80 && srk < srd ? -1 : 0));

  const wr = last(ind.willr), wrp = prevOf(ind.willr);
  push('Williams %R (14)', wr, wr < -80 && wr > wrp ? 1 : wr > -20 && wr < wrp ? -1 : 0);

  const bb = last(ind.bbp), bbpv = prevOf(ind.bbp);
  push('Bull Bear Power', bb, up && bb < 0 && bb > bbpv ? 1 : !up && bb > 0 && bb < bbpv ? -1 : (bb > 0 && bb > bbpv ? 1 : bb < 0 && bb < bbpv ? -1 : 0));

  const uo = last(ind.uo);
  push('Ultimate Oscillator', uo, uo > 70 ? 1 : uo < 30 ? -1 : 0);

  const maSum = summarize(ma), oscSum = summarize(osc);
  const overall = (maSum.score + oscSum.score) / 2;
  return {
    overall: +overall.toFixed(3), label: ratingLabel(overall),
    ma: maSum, osc: oscSum,
    counts: { buy: maSum.buy + oscSum.buy, sell: maSum.sell + oscSum.sell, neutral: maSum.neutral + oscSum.neutral },
  };
}
