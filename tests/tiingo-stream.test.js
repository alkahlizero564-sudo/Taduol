import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const T = await import('../js/tiingo.js');
const S = await import('../js/stream.js');
const M = await import('../js/market.js');

beforeEach(() => { mem.clear(); T._setHttp(null); });

// ---------------- Tiingo REST ----------------
test('parseTiingoPrices + toWeekly + startDateFor', () => {
  const rows = [
    { date: '2026-11-03T19:00:00.000Z', open: 1.1, high: 1.2, low: 1.0, close: 1.15 },
    { date: '2026-11-03T18:00:00.000Z', open: 1.0, high: 1.1, low: 0.9, close: 1.1 },
  ];
  const c = T.parseTiingoPrices(rows);
  assert.deepEqual(c.map((k) => k.c), [1.1, 1.15], 'sorted oldest first');
  // الاثنين 2026-11-02 والثلاثاء 03 في نفس الأسبوع، الاثنين 09 أسبوع جديد
  const d = (s, o, h, l, cl) => ({ t: Date.parse(s), o, h, l, c: cl, v: 0 });
  const w = T.toWeekly([d('2026-11-02T00:00:00Z', 1, 2, 0.5, 1.5), d('2026-11-03T00:00:00Z', 1.5, 3, 1, 2), d('2026-11-09T00:00:00Z', 2, 2.5, 1.8, 2.2)]);
  assert.equal(w.length, 2);
  assert.deepEqual([w[0].o, w[0].h, w[0].l, w[0].c], [1, 3, 0.5, 2]);
  assert.equal(new Date(w[1].t).toISOString().slice(0, 10), '2026-11-09');
  assert.equal(T.startDateFor('1h', 300, Date.UTC(2026, 10, 5)), '2026-10-15');
});

test('tiingoCandles: URL, Token header, cache, weekly from daily', async () => {
  T.setTiingoKey('tk-123');
  const calls = [];
  T._setHttp(async (url, headers) => {
    calls.push({ url: new URL(url), auth: headers.Authorization });
    const n = 10, start = Date.UTC(2026, 9, 1);
    const data = Array.from({ length: n }, (_, i) => ({ date: new Date(start + i * 86400000).toISOString(), open: 1 + i, high: 2 + i, low: i, close: 1.5 + i }));
    return { status: 200, data };
  });
  const c = await T.tiingoCandles('EUR/USD', '4h', 5);
  assert.equal(c.length, 5);
  assert.equal(calls[0].url.pathname, '/tiingo/fx/eurusd/prices');
  assert.equal(calls[0].url.searchParams.get('resampleFreq'), '4hour');
  assert.equal(calls[0].url.searchParams.get('token'), null, 'token not in URL');
  assert.equal(calls[0].auth, 'Token tk-123');
  await T.tiingoCandles('EUR/USD', '4h', 5);
  assert.equal(calls.length, 1, 'second call served from cache');
  const wk = await T.tiingoCandles('XAU/USD', '1w', 3);
  assert.equal(calls[1].url.searchParams.get('resampleFreq'), '1day');
  assert.ok(wk.length <= 3 && wk.length >= 2);
  assert.equal(T.tiingoUsage().hour, 2);
});

test('Tiingo: hourly limit is enforced locally, invalid key and CORS errors', async () => {
  T.setTiingoKey('k');
  let n = 0;
  T._setHttp(async () => ({ status: 200, data: [{ date: new Date(Date.UTC(2026, 0, 1) + n++ * 3600e3).toISOString(), open: 1, high: 1, low: 1, close: 1 }] }));
  for (let i = 0; i < 50; i++) await T.tiingoCandles('EUR/USD', '1h', 1, { cacheMs: 0 });
  await assert.rejects(() => T.tiingoCandles('EUR/USD', '1h', 1, { cacheMs: 0 }), /50 طلب في الساعة/);
  mem.clear(); T.setTiingoKey('bad');
  T._setHttp(async () => ({ status: 403, data: { detail: 'Invalid token' } }));
  await assert.rejects(() => T.tiingoCandles('GBP/USD', '1h', 1), (e) => e.kind === 'invalid');
  T._setHttp(async () => { throw new T.TiingoError('cors', 'cors'); });
  await assert.rejects(() => T.tiingoCandles('AUD/USD', '1h', 1), (e) => e.kind === 'cors');
});

test('market: forex uses Tiingo first and falls back to Twelve Data when the browser blocks Tiingo', async () => {
  T.setTiingoKey('k');
  T._setHttp(async () => ({ status: 200, data: [{ date: '2026-11-05T10:00:00Z', open: 1, high: 2, low: 0.5, close: 1.5 }] }));
  const c = await M.getCandles('EURUSD', '1h', 300);
  assert.equal(c.source, 'Tiingo');
  // المتصفح يمنع Tiingo → Twelve Data
  M.setTwelveKeys(['td']);
  T._setHttp(async () => { throw new T.TiingoError('المتصفح يمنع', 'cors'); });
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok', values: [{ datetime: '2026-11-05 10:00:00', open: '1', high: '2', low: '0.5', close: '1.2' }] }) });
  const c2 = await M.getCandles('GBP/USD', '1h', 300);
  assert.equal(c2.source, 'Twelve Data');
  assert.match(c2.note, /المتصفح يمنع/);
  M.setTwelveKeys([]);
});

// ---------------- البث ----------------
test('parseQuote: documented array order, object form, and sanity checks', () => {
  const arr = { messageType: 'A', service: 'fx', data: ['Q', 'eurusd', '2026-11-05T18:36:35.736000+00:00', 1e6, 1.12328, 1.123285, 1e6, 1.12329] };
  const q = T.parseQuote(arr);
  assert.equal(q.ticker, 'eurusd'); assert.equal(q.price, 1.123285); assert.equal(q.bid, 1.12328);
  assert.equal(q.t, Date.parse('2026-11-05T18:36:35.736Z'));
  const obj = T.parseQuote({ messageType: 'A', data: { ticker: 'xauusd', bidPrice: 4101.69, askPrice: 4101.79, midPrice: 4101.74 } });
  assert.equal(obj.price, 4101.74);
  // ترتيب مختلف (الحجم مكان السعر) يُرفض بدلاً من رسم قيمة خاطئة
  assert.equal(T.parseQuote({ messageType: 'A', data: ['Q', 'eurusd', '2026-11-05T00:00:00Z', 1.1, 1e6, 1.2, 1.3, 1e6] }), null);
  assert.equal(T.parseQuote(arr, () => 2.0), null, 'more than 5% away from the last price');
  assert.equal(T.parseQuote({ messageType: 'H' }), null);
});

test('applyTick updates the live candle, opens new candles, ignores stale ticks', () => {
  const H = 3600e3, t0 = Date.UTC(2026, 10, 5, 10);
  let c = [{ t: t0, o: 1, h: 1.2, l: 0.9, c: 1.1, v: 0 }];
  c = S.applyTick(c, 1.25, t0 + 10 * 60e3, '1h');
  assert.deepEqual([c.length, c[0].h, c[0].c], [1, 1.25, 1.25]);
  c = S.applyTick(c, 1.3, t0 + H + 5000, '1h');
  assert.equal(c.length, 2);
  assert.deepEqual([c[1].t, c[1].o, c[1].c], [t0 + H, 1.25, 1.3]);
  assert.equal(S.applyTick(c, 9, t0 - 1, '1h'), c, 'stale tick ignored');
  assert.equal(new Date(S.bucketStart(Date.UTC(2026, 10, 5, 13), '1w')).toISOString().slice(0, 10), '2026-11-02');
  assert.equal(S.bucketStart(Date.UTC(2026, 10, 5, 13, 7), '4h'), Date.UTC(2026, 10, 5, 12));
});

class FakeWS {
  static last;
  constructor(url) { this.url = url; this.sent = []; FakeWS.last = this; setTimeout(() => this.onopen?.(), 0); }
  send(m) { this.sent.push(JSON.parse(m)); }
  close() { this.closed = true; }
  emit(o) { this.onmessage?.({ data: JSON.stringify(o) }); }
}

test('openStream (Binance): correct URL and kline updates', async () => {
  const klines = [], states = [];
  const st = S.openStream({ symbol: 'BTCUSDT', interval: '15m', source: 'binance', WS: FakeWS, onKline: (k) => klines.push(k), onStatus: (s) => states.push(s) });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(FakeWS.last.url, 'wss://data-stream.binance.vision/ws/btcusdt@kline_15m');
  FakeWS.last.emit({ e: 'kline', k: { t: 1000, o: '1', h: '2', l: '0.5', c: '1.5', v: '10' } });
  assert.deepEqual(klines[0], { t: 1000, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 });
  assert.ok(states.includes('live'));
  st.stop();
  assert.ok(FakeWS.last.closed);
});

test('openStream (Tiingo): subscribes with the key, filters ticker, stops on auth error', async () => {
  const ticks = [], states = [];
  const st = S.openStream({ symbol: 'XAU/USD', interval: '1h', source: 'tiingo', key: 'tk', WS: FakeWS, refPrice: () => 4100, onTick: (q) => ticks.push(q), onStatus: (s) => states.push(s) });
  await new Promise((r) => setTimeout(r, 5));
  const ws = FakeWS.last;
  assert.equal(ws.url, 'wss://api.tiingo.com/fx');
  assert.deepEqual(ws.sent[0], { eventName: 'subscribe', authorization: 'tk', eventData: { thresholdLevel: 5, tickers: ['xauusd'] } });
  ws.emit({ messageType: 'A', service: 'fx', data: ['Q', 'eurusd', '2026-11-05T18:00:00Z', 1e6, 1.1, 1.1, 1e6, 1.1] });
  ws.emit({ messageType: 'A', service: 'fx', data: ['Q', 'xauusd', '2026-11-05T18:00:00Z', 1e6, 4101.6, 4101.7, 1e6, 4101.8] });
  assert.equal(ticks.length, 1); assert.equal(ticks[0].price, 4101.7);
  ws.emit({ messageType: 'E', response: { code: 401, message: 'Unauthorized' } });
  assert.equal(states.at(-1), 'down');
  st.stop();
});

test('testTiingoKey resolves on data and rejects on error', async () => {
  const p1 = T.testTiingoKey('good', FakeWS, 1000);
  await new Promise((r) => setTimeout(r, 5));
  FakeWS.last.emit({ messageType: 'I', response: { code: 200, message: 'Success' }, data: { subscriptionId: 1 } });
  assert.match(await p1, /يعمل/);
  const p2 = T.testTiingoKey('bad', FakeWS, 1000);
  await new Promise((r) => setTimeout(r, 5));
  FakeWS.last.emit({ messageType: 'E', response: { code: 401, message: 'Invalid' } });
  await assert.rejects(p2, /غير صالح/);
});

test('inside the Android app, Tiingo requests go through Capacitor native HTTP (no CORS)', async () => {
  T.setTiingoKey('native-key');
  const calls = [];
  globalThis.Capacitor = {
    isNativePlatform: () => true,
    nativePromise: async (plugin, method, o) => {
      calls.push({ plugin, method, o });
      return { status: 200, headers: { 'Content-Type': 'application/json' }, data: [{ date: '2026-11-05T10:00:00Z', open: 1, high: 2, low: 0.5, close: 1.5 }] };
    },
  };
  try {
    const c = await T.tiingoCandles('USD/CHF', '30m', 10);
    assert.equal(c.length, 1);
    assert.equal(calls[0].plugin, 'CapacitorHttp');
    assert.equal(calls[0].method, 'request');
    assert.equal(calls[0].o.method, 'GET');
    assert.equal(calls[0].o.headers.Authorization, 'Token native-key');
    assert.match(calls[0].o.url, /\/tiingo\/fx\/usdchf\/prices\?resampleFreq=30min/);
  } finally { delete globalThis.Capacitor; }
});
