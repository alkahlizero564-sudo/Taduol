// =====================================================================
//  Tiingo — الفوركس والذهب والفضة
//  • الشموع التاريخية عبر REST (الحد المجاني: 50 طلب/ساعة و1000/يوم)
//    Tiingo لا يرسل ترويسات CORS، لذلك في تطبيق Android نستخدم طلبات Capacitor الأصلية؛
//    في المتصفح العادي سيرفض المتصفح الطلب ونرجع إلى Twelve Data.
//  • الأسعار اللحظية عبر WebSocket (لا يستهلك طلبات ولا يتأثر بـ CORS)
// =====================================================================

import { SmartWebSocket } from './nativews.js';

const KEY_STORE = 'taduol.tiingo.v1';
const USAGE_STORE = 'taduol.tiingo.usage.v1';
export const TIINGO_LIMITS = { perHour: 50, perDay: 1000 };
const API = 'https://api.tiingo.com';
export const TIINGO_WS = 'wss://api.tiingo.com/fx';

export function getTiingoKey() { try { return (globalThis.localStorage?.getItem(KEY_STORE) || '').trim(); } catch { return ''; } }
export function setTiingoKey(k) { try { globalThis.localStorage?.setItem(KEY_STORE, String(k || '').trim()); return true; } catch { return false; } }

/** EUR/USD → eurusd */
export const toTiingoTicker = (symbol) => String(symbol || '').toLowerCase().replace(/[^a-z]/g, '');

const FREQ = { '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1hour', '4h': '4hour', '1d': '1day', '1w': '1day' };
const MINUTES = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080 };

/** تاريخ البداية الذي يكفي لـ n شمعة (السوق يعمل 5 أيام من 7) */
export function startDateFor(interval, n, now = Date.now()) {
  const tradingMinPerDay = (1440 * 5) / 7;
  const days = Math.ceil((n * MINUTES[interval]) / tradingMinPerDay) + 3;
  return new Date(now - days * 86400000).toISOString().slice(0, 10);
}

// ---------------- عداد الطلبات (حدود الخطة المجانية) ----------------
function loadUsage() {
  try { const u = JSON.parse(globalThis.localStorage?.getItem(USAGE_STORE) || 'null'); if (u && Array.isArray(u.hour)) return u; } catch { /* ignore */ }
  return { hour: [], day: '', dayCount: 0 };
}
function saveUsage(u) { try { globalThis.localStorage?.setItem(USAGE_STORE, JSON.stringify(u)); } catch { /* ignore */ } }

export function tiingoUsage(now = Date.now()) {
  const u = loadUsage();
  const hour = u.hour.filter((t) => t > now - 3600000);
  const today = new Date(now).toISOString().slice(0, 10);
  return { hour: hour.length, day: u.day === today ? u.dayCount : 0, ...TIINGO_LIMITS };
}
function countRequest(now = Date.now()) {
  const u = loadUsage();
  const today = new Date(now).toISOString().slice(0, 10);
  u.hour = u.hour.filter((t) => t > now - 3600000);
  if (u.day !== today) { u.day = today; u.dayCount = 0; }
  if (u.hour.length >= TIINGO_LIMITS.perHour) throw new TiingoError(`وصلت لحد Tiingo (${TIINGO_LIMITS.perHour} طلب في الساعة)`, 'limit');
  if (u.dayCount >= TIINGO_LIMITS.perDay) throw new TiingoError(`وصلت لحد Tiingo اليومي (${TIINGO_LIMITS.perDay} طلب)`, 'limit');
  u.hour.push(now); u.dayCount++;
  saveUsage(u);
}

export class TiingoError extends Error { constructor(m, kind) { super(m); this.kind = kind; } }

// ---------------- HTTP: أصلي في التطبيق، fetch في المتصفح ----------------
/** طلب HTTP أصلي داخل تطبيق Android (نفس الطريقة التي يستخدمها جسر Capacitor داخلياً) */
function nativeHttp() {
  const C = globalThis.Capacitor;
  if (!C?.isNativePlatform?.()) return null;
  if (typeof C.nativePromise === 'function') return { request: (o) => C.nativePromise('CapacitorHttp', 'request', o) };
  return C.Plugins?.CapacitorHttp || null;
}

/** للاختبارات: استبدال دالة الطلب */
let httpOverride = null;
export function _setHttp(fn) { httpOverride = fn; }

async function httpGet(url, key) {
  const headers = { Authorization: `Token ${key}`, 'Content-Type': 'application/json' };
  if (httpOverride) return httpOverride(url, headers);
  const native = nativeHttp();
  if (native) {
    let r;
    try { r = await native.request({ url, method: 'GET', headers, connectTimeout: 15000, readTimeout: 20000 }); }
    catch (e) { throw new TiingoError('تعذر الاتصال بـ Tiingo: ' + (e?.message || e), 'other'); }
    let data = r.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { /* keep */ } }
    return { status: r.status, data };
  }
  let r;
  try { r = await fetch(url, { headers }); } catch {
    throw new TiingoError('المتصفح يمنع طلبات Tiingo (CORS) — الشموع التاريخية من Tiingo تعمل داخل تطبيق Android', 'cors');
  }
  const text = await r.text().catch(() => '');
  let data = text;
  try { data = JSON.parse(text); } catch { /* صفحة HTML مثل صفحة حجب Cloudflare */ }
  return { status: r.status, data };
}

const cache = new Map();
const CACHE_MS = 4 * 60 * 1000; // نفس الشارت خلال 4 دقائق لا يستهلك طلباً

async function get(path, params, key = getTiingoKey(), { cacheMs = CACHE_MS } = {}) {
  if (!key) throw new TiingoError('أضف مفتاح Tiingo في صفحة "المفاتيح"', 'nokey');
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < cacheMs) return hit.data;
  countRequest();
  const { status, data } = await httpGet(url, key);
  if (status === 403 && /cloudflare|access denied|error 10(09|20)|banned|country/i.test(typeof data === 'string' ? data : '')) {
    throw new TiingoError(`Tiingo يحجب الاتصال من شبكتك/بلدك (HTTP 403 — حجب Cloudflare)`, 'blocked');
  }
  if (status === 401 || status === 403) {
    const why = typeof data === 'object' && data?.detail ? data.detail : typeof data === 'string' ? data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    throw new TiingoError(`Tiingo رفض الطلب (HTTP ${status}${why ? ': ' + why : ''}) — المفتاح غير صالح أو الوصول محجوب من شبكتك`, 'invalid');
  }
  if (status === 429) throw new TiingoError('تجاوزت حد Tiingo — انتظر قليلاً', 'limit');
  if (status >= 400 || !data) {
    const body = typeof data === 'string' ? data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) : '';
    const blocked = status === 403 && /cloudflare|access denied|1020|1009|banned|country/i.test(String(data));
    throw new TiingoError(blocked ? `Tiingo يحجب الاتصال من شبكتك/بلدك (HTTP ${status})` : 'Tiingo: ' + (data?.detail || `HTTP ${status}${body ? ' — ' + body : ''}`), status === 404 ? 'symbol' : blocked ? 'blocked' : 'other');
  }
  if (!Array.isArray(data) && data.detail) throw new TiingoError('Tiingo: ' + data.detail, 'other');
  cache.set(url, { t: Date.now(), data });
  return data;
}

/** تحويل رد Tiingo إلى شموع */
export function parseTiingoPrices(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({ t: Date.parse(r.date), o: +r.open, h: +r.high, l: +r.low, c: +r.close, v: 0 }))
    .filter((k) => isFinite(k.t) && isFinite(k.c)).sort((a, b) => a.t - b.t);
}

/** تجميع شموع يومية إلى أسبوعية (الأسبوع يبدأ الاثنين UTC) */
export function toWeekly(daily) {
  const out = [];
  for (const k of daily) {
    const d = new Date(k.t);
    const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * 86400000;
    const w = out[out.length - 1];
    if (w && w.t === monday) { w.h = Math.max(w.h, k.h); w.l = Math.min(w.l, k.l); w.c = k.c; }
    else out.push({ t: monday, o: k.o, h: k.h, l: k.l, c: k.c, v: 0 });
  }
  return out;
}

export async function tiingoCandles(symbol, interval = '1h', n = 300, opts = {}) {
  const freq = FREQ[interval];
  if (!freq) throw new TiingoError('فريم غير مدعوم: ' + interval, 'other');
  const count = interval === '1w' ? n * 5 : n;
  const rows = await get(`/tiingo/fx/${toTiingoTicker(symbol)}/prices`, { resampleFreq: freq, startDate: startDateFor(interval === '1w' ? '1d' : interval, count) }, opts.key, opts);
  let c = parseTiingoPrices(rows);
  if (interval === '1w') c = toWeekly(c);
  if (!c.length) throw new TiingoError('لا توجد بيانات Tiingo لهذا الرمز', 'symbol');
  return c.slice(-n);
}

/** أسعار لحظية لعدة أزواج في طلب واحد */
export async function tiingoTop(symbols, opts = {}) {
  const rows = await get('/tiingo/fx/top', { tickers: symbols.map(toTiingoTicker).join(',') }, opts.key, { cacheMs: opts.cacheMs ?? 30000 });
  return (rows || []).map((r) => ({ ticker: r.ticker, mid: +r.midPrice, bid: +r.bidPrice, ask: +r.askPrice, t: Date.parse(r.quoteTimestamp) }));
}

// ---------------- WebSocket ----------------
export function subscribeMessage(key, tickers) {
  return { eventName: 'subscribe', authorization: key, eventData: { thresholdLevel: 5, tickers: tickers.map(toTiingoTicker) } };
}

/**
 * قراءة رسالة سعر من البث. الترتيب الموثّق في مكتبات Tiingo:
 * ["Q", ticker, timestamp, bidSize, bidPrice, midPrice, askSize, askPrice]
 * نتحقق من معقولية السعر مقارنة بآخر سعر معروف حتى لا نرسم قيمة خاطئة لو اختلف الترتيب.
 * @param {Object} msg
 * @param {(ticker:string)=>number|undefined} refPrice آخر سعر معروف للزوج
 */
export function parseQuote(msg, refPrice = () => undefined) {
  if (!msg || msg.messageType !== 'A') return null;
  const d = msg.data;
  let ticker, ts, bid, mid, ask;
  if (Array.isArray(d)) {
    ticker = d.find((x) => typeof x === 'string' && /^[a-z]{6}$/.test(x));
    ts = d.find((x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(x));
    [bid, mid, ask] = [d[4], d[5], d[7]].map(Number);
  } else if (d && typeof d === 'object') {
    ticker = d.ticker; ts = d.timestamp || d.quoteTimestamp; bid = +d.bidPrice; mid = +d.midPrice; ask = +d.askPrice;
  }
  if (!ticker) return null;
  if (!isFinite(mid) && isFinite(bid) && isFinite(ask)) mid = (bid + ask) / 2;
  if (!isFinite(mid) || mid <= 0) return null;
  if (isFinite(bid) && isFinite(ask) && !(bid <= mid && mid <= ask)) return null;
  const ref = refPrice(ticker);
  if (ref && Math.abs(mid - ref) / ref > 0.05) return null; // قيمة غير منطقية (أكثر من 5% عن آخر سعر)
  return { ticker, price: mid, bid, ask, t: ts ? Date.parse(ts) : Date.now() };
}

/** اختبار المفتاح عبر البث (يعمل في المتصفح والتطبيق) */
/**
 * فحص اتصال WebSocket عام: هل فُتح؟ هل وصلت رسالة؟ وما كود الإغلاق؟
 * @returns {Promise<{ok:boolean, opened:boolean, ms:number, code?:number, first?:string, detail:string}>}
 */
export function probeWebSocket(url, { send, timeoutMs = 10000, WS = SmartWebSocket } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let opened = false, done = false, ws;
    const end = (ok, extra) => {
      if (done) return; done = true; clearTimeout(timer);
      try { ws?.close(); } catch { /* ignore */ }
      resolve({ ok, opened, ms: Date.now() - t0, ...extra });
    };
    const timer = setTimeout(() => end(false, { detail: opened ? 'اتصل لكن لم تصل أي بيانات خلال ' + timeoutMs / 1000 + ' ثوانٍ' : 'لم يكتمل الاتصال (انتهت المهلة)' }), timeoutMs);
    try { ws = new WS(url); } catch (e) { return end(false, { detail: 'تعذر إنشاء الاتصال: ' + (e?.message || e) }); }
    ws.onopen = () => { opened = true; if (send) ws.send(JSON.stringify(send)); };
    ws.onmessage = (ev) => end(true, { first: String(ev.data).slice(0, 160), detail: 'وصلت بيانات' });
    ws.onclose = (ev) => end(false, { code: ev?.code, detail: opened ? `فُتح الاتصال ثم أُغلق (كود ${ev?.code})` : `رُفض الاتصال قبل أن يُفتح (كود ${ev?.code ?? '؟'}) — غالباً حجب من الشبكة أو الدولة` });
  });
}

export function testTiingoKey(key, WS = SmartWebSocket, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    if (!key) return reject(new Error('اكتب مفتاح Tiingo أولاً'));
    let done = false, opened = false;
    const ws = new WS(TIINGO_WS);
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch { /* ignore */ } fn(v); };
    const timer = setTimeout(() => finish(reject, new Error(opened ? 'اتصل ببث Tiingo لكن لم يرد على الاشتراك' : 'لم يكتمل الاتصال ببث Tiingo (انتهت المهلة)')), timeoutMs);
    ws.onopen = () => { opened = true; ws.send(JSON.stringify(subscribeMessage(key, ['eurusd']))); };
    ws.onerror = () => { /* التفاصيل في onclose */ };
    ws.onclose = (ev) => finish(reject, new Error(opened
      ? `بث Tiingo أغلق الاتصال بعد الاشتراك (كود ${ev?.code ?? '؟'}) — قد يكون المفتاح غير صالح`
      : `تعذر الاتصال ببث Tiingo (كود ${ev?.code ?? '؟'}) — جرّب "🩺 تشخيص الاتصال"`));
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      const code = m?.response?.code;
      if (m.messageType === 'E' || (code && code >= 400)) return finish(reject, new Error('مفتاح Tiingo غير صالح' + (m?.response?.message ? ': ' + m.response.message : '')));
      if (m.messageType === 'A') {
        const q = parseQuote(m);
        return finish(resolve, q ? `✓ يعمل — EUR/USD = ${q.price}` : '✓ يعمل');
      }
      if (m.messageType === 'I' && (!code || code < 300)) return finish(resolve, '✓ المفتاح يعمل (تم الاشتراك في البث)');
    };
  });
}
