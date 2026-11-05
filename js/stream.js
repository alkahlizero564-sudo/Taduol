// =====================================================================
//  البث المباشر (WebSocket) — الشمعة تتحرك لحظة بلحظة بدون استهلاك طلبات
//  • Binance: بث الشموع kline لكل العملات الرقمية (مجاني بلا حدود)
//  • Tiingo: بث أسعار الفوركس والذهب (يحتاج مفتاح Tiingo)
//  يعيد الاتصال تلقائياً، ويبلغ عن حالته حتى يرجع التطبيق للتحديث الدوري عند انقطاعه
// =====================================================================
import { SmartWebSocket } from './nativews.js';
import { subscribeMessage, parseQuote, TIINGO_WS, toTiingoTicker } from './tiingo.js';

export const INTERVAL_MS = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3, '1h': 3600e3, '4h': 14400e3, '1d': 86400e3, '1w': 604800e3 };

/** بداية الشمعة التي يقع فيها الوقت t */
export function bucketStart(t, interval) {
  if (interval === '1w') {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * 86400000;
  }
  const ms = INTERVAL_MS[interval];
  return Math.floor(t / ms) * ms;
}

/** تطبيق سعر لحظي على الشموع: تحديث الشمعة الحالية أو فتح شمعة جديدة */
export function applyTick(candles, price, t, interval, max = 300) {
  if (!candles.length || !isFinite(price)) return candles;
  const start = bucketStart(t, interval);
  const last = candles[candles.length - 1];
  if (start < last.t) return candles; // سعر قديم
  if (start === last.t) {
    const k = { ...last, c: price, h: Math.max(last.h, price), l: Math.min(last.l, price) };
    return [...candles.slice(0, -1), k];
  }
  const out = [...candles, { t: start, o: last.c, h: Math.max(last.c, price), l: Math.min(last.c, price), c: price, v: 0 }];
  return out.slice(-max);
}

/** دمج شمعة من بث Binance */
export function applyKline(candles, k, max = 300) {
  if (!candles.length) return candles;
  const last = candles[candles.length - 1];
  if (k.t === last.t) return [...candles.slice(0, -1), k];
  if (k.t > last.t) return [...candles, k].slice(-max);
  return candles;
}

// بث مدمج: كل صفقة منفذة (aggTrade — عشرات التحديثات في الثانية) + الشمعة الرسمية (kline — الحجم والتصحيح)
const BINANCE_WS = ['wss://data-stream.binance.vision', 'wss://stream.binance.com:9443'];
export const binanceStreamUrl = (base, symbol, interval) => {
  const s = symbol.toLowerCase();
  return `${base}/stream?streams=${s}@aggTrade/${s}@kline_${interval}`;
};

/**
 * @param {{symbol, interval, source:'binance'|'tiingo', key?, refPrice?:()=>number,
 *          onKline?, onTick?, onStatus?:(s:'connecting'|'live'|'retry'|'down')=>void, WS?}} o
 * @returns {{stop:()=>void}}
 */
export function openStream(o) {
  const WS = o.WS || SmartWebSocket;
  let ws = null, stopped = false, attempt = 0, hostIdx = 0, beat = null, retryT = null;
  const status = (s) => o.onStatus?.(s);

  const watchdog = () => { // إذا لم تصل رسائل لمدة 45 ثانية نعيد الاتصال
    clearTimeout(beat);
    beat = setTimeout(() => { try { ws?.close(); } catch { /* ignore */ } }, 45000);
  };

  const connect = () => {
    if (stopped) return;
    status(attempt ? 'retry' : 'connecting');
    const url = o.source === 'binance'
      ? binanceStreamUrl(BINANCE_WS[hostIdx % BINANCE_WS.length], o.symbol, o.interval)
      : TIINGO_WS;
    try { ws = new WS(url); } catch { return scheduleRetry(); }
    ws.onopen = () => {
      if (o.source === 'tiingo') ws.send(JSON.stringify(subscribeMessage(o.key, [o.symbol])));
      watchdog();
    };
    ws.onmessage = (ev) => {
      watchdog();
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (o.source === 'binance') {
        const d = m.data || m; // البث المدمج يغلّف الرسالة في data
        if (d.e === 'aggTrade') {
          const price = +d.p;
          if (isFinite(price)) { attempt = 0; status('live'); o.onTick?.({ price, t: d.T || d.E || Date.now() }); }
          return;
        }
        const k = d.k; if (!k) return;
        attempt = 0; status('live');
        o.onKline?.({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v });
      } else {
        if (m.messageType === 'E' || (m.response?.code >= 400)) { stopped = true; status('down'); try { ws.close(); } catch { /* ignore */ } return; }
        const q = parseQuote(m, () => o.refPrice?.());
        if (q && q.ticker === toTiingoTicker(o.symbol)) { attempt = 0; status('live'); o.onTick?.(q); }
      }
    };
    ws.onerror = () => { /* onclose يتولى إعادة المحاولة */ };
    ws.onclose = () => { clearTimeout(beat); if (!stopped) scheduleRetry(); };
  };

  const scheduleRetry = () => {
    attempt++; hostIdx++;
    if (attempt > 6) { status('down'); attempt = 3; }
    else status('retry');
    clearTimeout(retryT);
    retryT = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt));
  };

  connect();
  return {
    stop() { stopped = true; clearTimeout(beat); clearTimeout(retryT); try { ws?.close(); } catch { /* ignore */ } },
  };
}
