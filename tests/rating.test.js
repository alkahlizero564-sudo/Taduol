import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAll, wma, hma, awesome, momentum, stochRsi, ultimate } from '../js/indicators.js';
import { technicalRating, ratingLabel } from '../js/rating.js';
import { mergeCandles } from '../js/market.js';
import { TDPool } from '../js/twelvedata.js';

const series = (n, f) => Array.from({ length: n }, (_, i) => { const c = f(i); return { t: i * 60000, o: c - 0.4, h: c + 1, l: c - 1.4, c, v: 100 + (i % 7) }; });

test('new indicators: WMA, Hull, AO, Momentum, Stoch RSI, UO', () => {
  assert.deepEqual(wma([1, 2, 3], 3).slice(-1), [(1 + 4 + 9) / 6]);
  const up = series(120, (i) => 100 + i);
  assert.ok(Math.abs(hma(up.map((k) => k.c), 9).at(-1) - up.at(-1).c) < 1.5, 'Hull MA hugs price');
  assert.ok(awesome(up).at(-1) > 0);
  assert.equal(momentum(up).at(-1), 10);
  const sr = stochRsi(series(120, (i) => 100 + 5 * Math.sin(i / 5)));
  assert.ok(sr.k.at(-1) >= 0 && sr.k.at(-1) <= 100);
  const uo = ultimate(up).at(-1);
  assert.ok(uo > 50 && uo <= 100);
});

test('rating uses 15 moving averages and 11 oscillators', () => {
  const c = series(300, (i) => 100 + i * 0.3);
  const r = technicalRating(c, computeAll(c));
  assert.equal(r.ma.items.length, 15);
  assert.equal(r.osc.items.length, 11);
  assert.ok(r.ma.items.every((x) => x.vote !== null), 'all MAs computable with 300 candles');
});

test('rating: strong uptrend → buy, strong downtrend → sell', () => {
  const up = series(300, (i) => 100 + i * 0.5 + Math.sin(i / 3));
  const ru = technicalRating(up, computeAll(up));
  assert.ok(['BUY', 'STRONG_BUY'].includes(ru.label), ru.label);
  assert.equal(ru.ma.label, 'STRONG_BUY');
  const dn = series(300, (i) => 400 - i * 0.5 + Math.sin(i / 3));
  const rd = technicalRating(dn, computeAll(dn));
  assert.ok(['SELL', 'STRONG_SELL'].includes(rd.label), rd.label);
  assert.equal(rd.ma.label, 'STRONG_SELL');
});

test('ratingLabel thresholds', () => {
  assert.equal(ratingLabel(0.6), 'STRONG_BUY');
  assert.equal(ratingLabel(0.2), 'BUY');
  assert.equal(ratingLabel(0), 'NEUTRAL');
  assert.equal(ratingLabel(-0.2), 'SELL');
  assert.equal(ratingLabel(-0.6), 'STRONG_SELL');
});

test('mergeCandles updates the live candle and appends new ones', () => {
  const old = [{ t: 1, c: 1 }, { t: 2, c: 2 }, { t: 3, c: 3 }];
  const m = mergeCandles(old, [{ t: 2, c: 2.5 }, { t: 3, c: 3.3 }, { t: 4, c: 4 }], 3);
  assert.deepEqual(m.map((k) => [k.t, k.c]), [[2, 2.5], [3, 3.3], [4, 4]]);
  assert.equal(old[2].c, 3, 'original array untouched');
});

test('Twelve Data daily counter counts credits per key and resets each day', async () => {
  const clock = { t: Date.UTC(2026, 10, 5, 10) };
  const pool = new TDPool({ now: () => clock.t, sleep: async (ms) => { clock.t += ms; }, fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }) });
  pool.daily = { day: '', counts: {} };
  pool.sync(['a', 'b']);
  for (let i = 0; i < 5; i++) await pool.request('/price', { symbol: 'EUR/USD' });
  assert.equal(pool.usedToday('a') + pool.usedToday('b'), 5);
  assert.equal(pool.remainingToday(), 1600 - 5);
  clock.t += 24 * 3600 * 1000;
  assert.equal(pool.usedToday('a'), 0);
  assert.equal(pool.remainingToday(), 1600);
});
