import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// localStorage وهمي لبيئة Node
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const m = await import('../js/market.js');

let calls = [];
function mockFetch(handler) {
  calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const { status = 200, body } = handler(String(url));
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}
beforeEach(() => { mem.clear(); m.setTwelveKeys([]); m.tdPool.cache.clear(); });

test('symbol routing: crypto → Binance, everything else → Twelve Data', () => {
  assert.equal(m.isBinanceSymbol('BTCUSDT'), true);
  assert.equal(m.isBinanceSymbol('ethbtc'), true);
  assert.equal(m.isBinanceSymbol('EUR/USD'), false);
  assert.equal(m.isBinanceSymbol('EURUSD'), false);
  assert.equal(m.isBinanceSymbol('XAUUSD'), false);
  assert.equal(m.isBinanceSymbol('AAPL'), false);
});

test('normalizeTDSymbol', () => {
  assert.equal(m.normalizeTDSymbol('eurusd'), 'EUR/USD');
  assert.equal(m.normalizeTDSymbol('XAUUSD'), 'XAU/USD');
  assert.equal(m.normalizeTDSymbol('gbp/jpy'), 'GBP/JPY');
  assert.equal(m.normalizeTDSymbol('AAPL'), 'AAPL');
});

test('parseTDSeries returns chronological candles and handles missing volume', () => {
  const c = m.parseTDSeries({ values: [
    { datetime: '2026-11-04 14:00:00', open: '1.1', high: '1.2', low: '1.0', close: '1.15' },
    { datetime: '2026-11-04 13:00:00', open: '1.0', high: '1.1', low: '0.9', close: '1.1', volume: '5' },
  ] });
  assert.equal(c.length, 2);
  assert.ok(c[0].t < c[1].t);
  assert.equal(c[0].c, 1.1); assert.equal(c[0].v, 5);
  assert.equal(c[1].v, 0);
  assert.equal(m.parseTDSeries({ values: [{ datetime: '2026-11-04', open: '1', high: '1', low: '1', close: '1' }] })[0].t, Date.UTC(2026, 10, 4));
});

test('getCandles uses Twelve Data for forex with mapped interval and stored key', async () => {
  m.setTwelveKey('td-test-key');
  mockFetch(() => ({ body: { status: 'ok', values: [{ datetime: '2026-11-04 13:00:00', open: '1', high: '2', low: '0.5', close: '1.5' }] } }));
  const c = await m.getCandles('EURUSD', '4h', 300);
  assert.equal(c.length, 1);
  const u = new URL(calls[0]);
  assert.equal(u.host, 'api.twelvedata.com');
  assert.equal(u.pathname, '/time_series');
  assert.equal(u.searchParams.get('symbol'), 'EUR/USD');
  assert.equal(u.searchParams.get('interval'), '4h');
  assert.equal(u.searchParams.get('apikey'), 'td-test-key');
  await m.getCandles('XAU/USD', '1d');
  assert.equal(new URL(calls[1]).searchParams.get('interval'), '1day');
});

test('Twelve Data without a key gives a clear Arabic error', async () => {
  mockFetch(() => ({ body: {} }));
  await assert.rejects(() => m.getCandles('EUR/USD', '1h'), /Twelve Data/);
  assert.equal(calls.length, 0);
});

test('Twelve Data errors are translated (invalid key, rate limit)', async () => {
  m.setTwelveKey('bad');
  mockFetch(() => ({ body: { status: 'error', code: 401, message: '**apikey** parameter is incorrect' } }));
  await assert.rejects(() => m.tdCandles('EUR/USD', '1h'), /غير صالح/);
  m.setTwelveKey('limited');
  m.tdPool.maxWaitMs = 0; // لا ننتظر في الاختبار
  mockFetch(() => ({ status: 429, body: { status: 'error', code: 429, message: 'You have run out of API credits' } }));
  await assert.rejects(() => m.tdCandles('EUR/USD', '1h'), /انتهى رصيد/);
  m.tdPool.maxWaitMs = 70000;
});

test('tdQuotes parses single and batch responses', async () => {
  m.setTwelveKey('k');
  mockFetch(() => ({ body: { symbol: 'EUR/USD', name: 'Euro / US Dollar', close: '1.0850', percent_change: '0.25', high: '1.09', low: '1.08', is_market_open: true } }));
  const one = await m.tdQuotes(['EUR/USD']);
  assert.equal(one[0].price, 1.085); assert.equal(one[0].change, 0.25);
  mockFetch(() => ({ body: {
    'EUR/USD': { symbol: 'EUR/USD', close: '1.08', percent_change: '-0.1' },
    'XAU/USD': { symbol: 'XAU/USD', close: '2650.5', percent_change: '1.2', is_market_open: false },
    'BAD/SYM': { status: 'error', code: 404, message: 'not found' },
  } }));
  const many = await m.tdQuotes(['EUR/USD', 'XAU/USD', 'BAD/SYM']);
  assert.deepEqual(many.map((q) => q.symbol), ['EUR/USD', 'XAU/USD']);
  assert.equal(many[1].closed, true);
  assert.equal(new URL(calls[0]).searchParams.get('symbol'), 'EUR/USD,XAU/USD,BAD/SYM');
});

test('forex table falls back to currency-api (jsDelivr) when Frankfurter is blocked, incl. SDG', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (/frankfurter/.test(url)) throw new TypeError('Failed to fetch');
    const day = String(url).includes('@latest') ? '2026-11-05' : String(url).match(/@(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!day) throw new TypeError('Failed to fetch');
    const k = day === '2026-11-05' ? 1 : 1.01; // اليوم: الدولار أضعف بـ 1% → العملات ارتفعت
    return { ok: true, status: 200, json: async () => ({ date: day, usd: { eur: 0.888 * k, gbp: 0.741 * k, sdg: 600 * k, egp: 54.6 * k } }) };
  };
  const fx = await m.getForex();
  assert.match(fx.source, /currency-api/);
  assert.equal(fx.date, '2026-11-05');
  const sdg = fx.rows.find((r) => r.code === 'SDG');
  assert.equal(sdg.name, 'الجنيه السوداني');
  assert.ok(Math.abs(sdg.change - 1) < 0.01, 'SDG rose ~1% vs USD: ' + sdg.change);
  assert.ok(urls.some((u) => u.includes('@2026-11-04')), 'compared with the previous day');
});
