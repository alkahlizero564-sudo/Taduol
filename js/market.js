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

/** شموع من Binance */
export async function getCandles(symbol = 'BTCUSDT', interval = '1h', limit = 300) {
  const data = await binance(`/api/v3/klines?symbol=${encodeURIComponent(symbol.toUpperCase())}&interval=${interval}&limit=${limit}`);
  return data.map((r) => ({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
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
