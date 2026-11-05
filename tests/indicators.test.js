import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, rsi, macd, atr, bollinger, adx, stochastic, supertrend, psar, ichimoku, supportResistance, fibonacci } from '../js/indicators.js';
import { analyze } from '../js/analysis.js';

const series = (n, f) => Array.from({ length: n }, (_, i) => { const c = f(i); return { o: c - 0.5, h: c + 1, l: c - 1.5, c, v: 100 + i }; });
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('sma / ema basics', () => {
  const v = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(sma(v, 3), [null, null, 2, 3, 4, 5]);
  const e = ema(v, 3);
  assert.equal(e[1], null); assert.equal(e[2], 2); assert.ok(close(e[3], 3)); assert.ok(close(e[5], 5));
});

test('rsi is 100 on monotonic rise and ~0 on monotonic fall', () => {
  const up = series(40, (i) => 100 + i), dn = series(40, (i) => 200 - i);
  assert.equal(rsi(up).at(-1), 100);
  assert.ok(rsi(dn).at(-1) < 1);
});

test('macd positive in uptrend; atr positive; bollinger ordered', () => {
  const up = series(80, (i) => 100 + i * 0.8);
  assert.ok(macd(up).line.at(-1) > 0);
  assert.ok(atr(up).at(-1) > 0);
  const b = bollinger(up);
  assert.ok(b.upper.at(-1) > b.mid.at(-1) && b.mid.at(-1) > b.lower.at(-1));
  const a = adx(up);
  assert.ok(a.pdi.at(-1) > a.mdi.at(-1));
  assert.ok(stochastic(up).k.at(-1) > 50);
  assert.equal(supertrend(up).at(-1).up, true);
  assert.equal(psar(up).at(-1).up, true);
  assert.ok(ichimoku(up).spanB.at(-1) != null);
});

test('analyze gives BUY in a strong uptrend with SL below and TPs above entry', () => {
  const up = series(220, (i) => 100 + i * 0.5 + Math.sin(i / 3));
  const r = analyze(up);
  assert.equal(r.side, 'BUY');
  assert.ok(['BUY', 'WAIT'].includes(r.direction));
  assert.ok(r.stopLoss < r.entry);
  assert.ok(r.targets.every((t) => t > r.entry));
  assert.ok(r.riskReward >= 1.4);
});

test('analyze gives SELL in a strong downtrend', () => {
  const dn = series(220, (i) => 300 - i * 0.5 + Math.sin(i / 3));
  const r = analyze(dn);
  assert.equal(r.side, 'SELL');
  assert.ok(['SELL', 'WAIT'].includes(r.direction));
  assert.ok(r.stopLoss > r.entry);
  assert.ok(r.targets.every((t) => t < r.entry));
});

test('support/resistance and fibonacci', () => {
  const s = series(200, (i) => 100 + 10 * Math.sin(i / 8));
  assert.ok(supportResistance(s).length > 0);
  const f = fibonacci(s);
  assert.equal(f.levels.length, 7);
});
