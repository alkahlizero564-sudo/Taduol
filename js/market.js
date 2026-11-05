// =====================================================================
//  الاتصال بالأسواق العالمية — بيانات حية مجانية بدون مفتاح
//  • Binance: شموع وأسعار العملات الرقمية + الذهب (PAXG) + بعض أزواج الفوركس مقابل USDT
//  • Frankfurter (البنك المركزي الأوروبي): أسعار صرف العملات العالمية وتغيرها اليومي
//  • CryptoCompare: آخر أخبار الأسواق
// =====================================================================

const BINANCE_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api1.binance.com'];

async function fetchJSON(url, timeout = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function binance(path) {
  let lastErr;
  for (const h of BINANCE_HOSTS) {
    try { return await fetchJSON(h + path); } catch (e) { lastErr = e; }
  }
  throw new Error('تعذر الاتصال بـ Binance: ' + (lastErr?.message || ''));
}

export const INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

export const SYMBOLS = [
  { s: 'BTCUSDT', n: 'بيتكوين' }, { s: 'ETHUSDT', n: 'إيثريوم' }, { s: 'BNBUSDT', n: 'BNB' },
  { s: 'SOLUSDT', n: 'سولانا' }, { s: 'XRPUSDT', n: 'ريبل' }, { s: 'DOGEUSDT', n: 'دوجكوين' },
  { s: 'ADAUSDT', n: 'كاردانو' }, { s: 'AVAXUSDT', n: 'أفالانش' }, { s: 'LINKUSDT', n: 'تشين لينك' },
  { s: 'PAXGUSDT', n: 'الذهب (PAXG)' }, { s: 'EURUSDT', n: 'اليورو/دولار' },
  { s: 'TONUSDT', n: 'تون' }, { s: 'LTCUSDT', n: 'لايتكوين' }, { s: 'DOTUSDT', n: 'بولكادوت' },
];

// رموز Twelve Data (فوركس، معادن، أسهم) — تحتاج مفتاح Twelve Data
export const TD_SYMBOLS = [
  { s: 'EUR/USD', n: 'يورو/دولار' }, { s: 'GBP/USD', n: 'باوند/دولار' }, { s: 'USD/JPY', n: 'دولار/ين' },
  { s: 'USD/CHF', n: 'دولار/فرنك' }, { s: 'AUD/USD', n: 'أسترالي/دولار' }, { s: 'USD/CAD', n: 'دولار/كندي' },
  { s: 'NZD/USD', n: 'نيوزيلندي/دولار' }, { s: 'EUR/GBP', n: 'يورو/باوند' }, { s: 'GBP/JPY', n: 'باوند/ين' },
  { s: 'XAU/USD', n: 'الذهب' }, { s: 'XAG/USD', n: 'الفضة' },
  { s: 'AAPL', n: 'أبل' }, { s: 'TSLA', n: 'تسلا' }, { s: 'NVDA', n: 'إنفيديا' },
];
// قائمة المراقبة في صفحة الأسواق — 6 رموز فقط لأن الخطة المجانية 8 طلبات في الدقيقة
export const TD_WATCHLIST = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'AUD/USD', 'USD/CAD'];

/** هل الرمز عملة رقمية على Binance؟ (مثل BTCUSDT) وإلا يذهب إلى Twelve Data */
export function isBinanceSymbol(symbol) {
  const s = String(symbol || '').trim().toUpperCase();
  return !s.includes('/') && /^[A-Z0-9]{2,}(USDT|USDC|FDUSD|BTC|ETH|BNB)$/.test(s);
}

/** توحيد كتابة الرمز لـ Twelve Data: EURUSD → EUR/USD ، xauusd → XAU/USD */
export function normalizeTDSymbol(symbol) {
  const s = String(symbol || '').trim().toUpperCase().replace(/\s+/g, '');
  if (s.includes('/')) return s;
  if (/^(EUR|GBP|USD|JPY|CHF|AUD|CAD|NZD|XAU|XAG|CNY|TRY|SEK|NOK)[A-Z]{3}$/.test(s)) return s.slice(0, 3) + '/' + s.slice(3);
  return s;
}

// ----------------- Twelve Data (حتى 4 مفاتيح عبر المنظِّم) -----------------
import { pool, getTwelveKeys, setTwelveKeys, getTwelveKey, setTwelveKey } from './twelvedata.js';
import { tiingoCandles, getTiingoKey, TiingoError } from './tiingo.js';
export { pool as tdPool, getTwelveKeys, setTwelveKeys, getTwelveKey, setTwelveKey };

const TD_INTERVALS = { '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week' };
// رموز إضافية تظهر في قائمة المراقبة عند وجود مفتاحين أو أكثر
export const TD_WATCHLIST_EXTRA = ['XAG/USD', 'USD/CHF', 'NZD/USD', 'EUR/GBP', 'GBP/JPY', 'EUR/JPY'];
export function tdWatchlist(keyCount = getTwelveKeys().length) {
  return keyCount >= 2 ? [...TD_WATCHLIST, ...TD_WATCHLIST_EXTRA] : TD_WATCHLIST;
}

/** تحويل رد time_series إلى شموع مرتبة من الأقدم للأحدث */
export function parseTDSeries(j) {
  const vals = Array.isArray(j?.values) ? j.values : [];
  return vals.map((v) => ({
    t: Date.parse(v.datetime.replace(' ', 'T') + (v.datetime.length > 10 ? 'Z' : 'T00:00:00Z')),
    o: +v.open, h: +v.high, l: +v.low, c: +v.close, v: v.volume != null ? +v.volume : 0,
  })).filter((k) => isFinite(k.o) && isFinite(k.c)).reverse();
}

/**
 * @param {{onWait?:(sec:number)=>void}} opts  يُستدعى عندما ينتظر المنظِّم توفر رصيد
 */
export async function tdCandles(symbol, interval = '1h', limit = 300, opts = {}) {
  const iv = TD_INTERVALS[interval];
  if (!iv) throw new Error('فريم غير مدعوم: ' + interval);
  const sym = normalizeTDSymbol(symbol);
  const size = String(Math.min(limit, 5000));
  const j = await pool.request('/time_series', { symbol: sym, interval: iv, outputsize: size, timezone: 'UTC' },
    { cost: 1, cacheKey: `ts|${sym}|${iv}|${size}`, onWait: opts.onWait, ttl: opts.ttl });
  const candles = parseTDSeries(j);
  if (!candles.length) throw new Error('لا توجد بيانات لهذا الرمز/الفريم');
  return candles;
}

const mapQuote = (q) => ({
  symbol: q.symbol, name: q.name, price: +q.close, change: +q.percent_change, high: +q.high, low: +q.low, closed: q.is_market_open === false,
});
const okQuote = (q) => q && q.status !== 'error' && q.close != null;

/** أسعار لحظية لعدة رموز (كل رمز = طلب واحد من الرصيد، موزعة على المفاتيح) */
export async function tdQuotes(symbols = tdWatchlist(), opts = {}) {
  const map = await pool.quotes(symbols, opts);
  return symbols.map((s) => map[s]).filter(okQuote).map(mapQuote);
}

/** اختبار مفتاح محدد مباشرة (لا يمر بالمنظِّم) */
export async function testTwelveKey(key) {
  if (!key) throw new Error('اكتب المفتاح أولاً');
  const q = await pool.request('/quote', { symbol: 'EUR/USD' }, { key });
  if (!okQuote(q)) throw new Error('رد غير متوقع من Twelve Data');
  return `✓ يعمل — EUR/USD = ${q.close}`;
}

/**
 * تحديث خفيف: آخر بضع شموع فقط (يُستخدم للتحديث كل 10 ثوانٍ)
 * Binance: وزن صغير جداً — Twelve Data: طلب واحد من الرصيد
 */
export async function getLatestCandles(symbol, interval = '1h', n = 3, opts = {}) {
  return getCandles(symbol, interval, n, { ...opts, ttl: opts.ttl ?? 8000 });
}

/** دمج الشموع الجديدة مع القديمة: تحديث الشمعة الحالية وإضافة الجديدة */
export function mergeCandles(old, fresh, max = 300) {
  if (!old?.length) return fresh.slice(-max);
  const out = old.slice();
  for (const k of fresh) {
    const lastT = out[out.length - 1].t;
    if (k.t === lastT) out[out.length - 1] = k;
    else if (k.t > lastT) out.push(k);
    else {
      const i = out.findIndex((x) => x.t === k.t);
      if (i >= 0) out[i] = k;
    }
  }
  return out.slice(-max);
}

/** شموع: Binance للعملات الرقمية، و Tiingo ثم Twelve Data للفوركس والذهب والأسهم */
export async function getCandles(symbol = 'BTCUSDT', interval = '1h', limit = 300, opts = {}) {
  if (!isBinanceSymbol(symbol)) return forexCandles(symbol, interval, limit, opts);
  const data = await binance(`/api/v3/klines?symbol=${encodeURIComponent(symbol.toUpperCase())}&interval=${interval}&limit=${limit}`);
  const c = data.map((r) => ({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
  c.source = 'Binance';
  return c;
}

// ----------------- الفوركس والذهب: Tiingo أولاً ثم Twelve Data -----------------
let tiingoRestBlocked = false; // المتصفح يمنع REST من Tiingo (CORS) — لا نكرر المحاولة

/** أزواج العملات والمعادن فقط (مثل EUR/USD و XAU/USD) — Tiingo لا يغطي الأسهم هنا */
export const isTiingoSymbol = (symbol) => /^[A-Z]{3}\/[A-Z]{3}$/.test(normalizeTDSymbol(symbol));

async function forexCandles(symbol, interval, limit, opts) {
  const errors = [];
  if (getTiingoKey() && isTiingoSymbol(symbol) && !tiingoRestBlocked) {
    try {
      const c = await tiingoCandles(normalizeTDSymbol(symbol), interval, limit, opts.ttl != null ? { cacheMs: opts.ttl } : {});
      c.source = 'Tiingo';
      return c;
    } catch (e) {
      if (e instanceof TiingoError && e.kind === 'cors') tiingoRestBlocked = true;
      errors.push(e.message);
    }
  }
  if (getTwelveKeys().length) {
    const c = await tdCandles(symbol, interval, limit, opts);
    c.source = 'Twelve Data';
    if (errors.length) c.note = errors[0];
    return c;
  }
  if (errors.length) throw new Error(errors[0]);
  throw new Error('هذا الرمز يحتاج مفتاح Tiingo أو Twelve Data — أضفه في صفحة "المفاتيح"');
}

/** أسعار وتغير 24 ساعة لعدة رموز */
export async function getTickers(symbols = SYMBOLS.map((x) => x.s)) {
  const q = encodeURIComponent(JSON.stringify(symbols));
  try {
    const data = await binance(`/api/v3/ticker/24hr?symbols=${q}`);
    return data.map((d) => ({ symbol: d.symbol, price: +d.lastPrice, change: +d.priceChangePercent, high: +d.highPrice, low: +d.lowPrice, volume: +d.quoteVolume }));
  } catch {
    // بعض الرموز قد لا تكون متاحة — نجلبها فردياً
    const out = [];
    for (const s of symbols) {
      try {
        const d = await binance(`/api/v3/ticker/24hr?symbol=${s}`);
        out.push({ symbol: d.symbol, price: +d.lastPrice, change: +d.priceChangePercent, high: +d.highPrice, low: +d.lowPrice, volume: +d.quoteVolume });
      } catch { /* تجاهل */ }
    }
    return out;
  }
}

// ----------------- الفوركس (العملات العالمية) -----------------
const FX_HOSTS = ['https://api.frankfurter.app', 'https://api.frankfurter.dev/v1'];
export const FX_CURRENCIES = ['EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'CNY', 'TRY', 'SEK', 'NOK', 'INR'];
export const FX_NAMES = {
  EUR: 'اليورو', GBP: 'الجنيه الإسترليني', JPY: 'الين الياباني', CHF: 'الفرنك السويسري', AUD: 'الدولار الأسترالي',
  CAD: 'الدولار الكندي', NZD: 'الدولار النيوزيلندي', CNY: 'اليوان الصيني', TRY: 'الليرة التركية', SEK: 'الكرونة السويدية',
  NOK: 'الكرونة النرويجية', INR: 'الروبية الهندية',
};

/**
 * أسعار العملات مقابل الدولار وتغيرها (آخر يومين تداول)
 * change > 0 يعني أن العملة ارتفعت أمام الدولار
 */
export async function getForex() {
  const end = new Date();
  const start = new Date(end.getTime() - 10 * 86400000);
  const d = (x) => x.toISOString().slice(0, 10);
  let data, lastErr;
  for (const h of FX_HOSTS) {
    try { data = await fetchJSON(`${h}/${d(start)}..${d(end)}?from=USD&to=${FX_CURRENCIES.join(',')}`); break; } catch (e) { lastErr = e; }
  }
  if (!data) throw new Error('تعذر جلب أسعار الفوركس: ' + (lastErr?.message || ''));
  const days = Object.keys(data.rates).sort();
  const today = data.rates[days[days.length - 1]], prev = data.rates[days[days.length - 2]] || today;
  return {
    date: days[days.length - 1],
    rows: FX_CURRENCIES.filter((c) => today[c]).map((c) => {
      // السعر مقابل الدولار: كم دولار تساوي وحدة واحدة من العملة
      const now = 1 / today[c], before = 1 / prev[c];
      return { code: c, name: FX_NAMES[c], usdPerUnit: now, perUsd: today[c], change: ((now - before) / before) * 100 };
    }),
  };
}

// ----------------- الأخبار -----------------
export async function getNews(limit = 20) {
  const urls = [
    'https://min-api.cryptocompare.com/data/v2/news/?lang=EN',
    'https://data-api.cryptocompare.com/news/v1/article/list?lang=EN&limit=' + limit,
  ];
  for (const u of urls) {
    try {
      const j = await fetchJSON(u);
      const arr = j.Data || j.data || [];
      if (Array.isArray(arr) && arr.length) {
        return arr.slice(0, limit).map((n) => ({
          title: n.title || n.TITLE, url: n.url || n.URL, source: n.source || n.SOURCE_DATA?.NAME || n.source_info?.name || '',
          time: (n.published_on || n.PUBLISHED_ON) * 1000, body: (n.body || n.BODY || '').slice(0, 220),
          categories: n.categories || n.CATEGORY_DATA?.map((c) => c.CATEGORY).join('|') || '',
        }));
      }
    } catch { /* جرّب المصدر التالي */ }
  }
  throw new Error('مصدر الأخبار غير متاح حالياً — استخدم "أخبار بالذكاء الاصطناعي"');
}
