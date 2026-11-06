// التحقق من صحة مؤشراتنا بمقارنتها بمكتبة technicalindicators (MIT) المشهورة
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as I from '../js/indicators.js';
const TI = createRequire(import.meta.url)('technicalindicators');

let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const c = []; let px = 100;
for (let i = 0; i < 500; i++) { const o = px; px *= 1 + (rnd() - 0.49) * 0.01; const cl = px; c.push({ t: i, o, h: Math.max(o, cl) * (1 + rnd() * 0.004), l: Math.min(o, cl) * (1 - rnd() * 0.004), c: cl, v: 100 + Math.round(rnd() * 900) }); }
const h = c.map((k) => k.h), l = c.map((k) => k.l), cl = c.map((k) => k.c), v = c.map((k) => k.v);
const close = (ours, theirs, tol, name) => {
  const A = ours.slice(-200), B = theirs.slice(-200);
  A.forEach((x, i) => assert.ok(Math.abs(x - B[i]) <= tol, `${name}[${i}] ${x} vs ${B[i]}`));
};

test('core indicators match the technicalindicators library', () => {
  close(I.sma(cl, 20), TI.SMA.calculate({ period: 20, values: cl }), 1e-9, 'SMA');
  close(I.ema(cl, 50), TI.EMA.calculate({ period: 50, values: cl }), 1e-9, 'EMA');
  close(I.wma(cl, 20), TI.WMA.calculate({ period: 20, values: cl }), 1e-9, 'WMA');
  close(I.rsi(c, 14), TI.RSI.calculate({ period: 14, values: cl }), 0.01, 'RSI');
  const m = I.macd(c), tm = TI.MACD.calculate({ values: cl, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
  close(m.line, tm.map((x) => x.MACD), 1e-9, 'MACD'); close(m.signal, tm.map((x) => x.signal), 1e-9, 'MACD signal');
  const bb = I.bollinger(c), tb = TI.BollingerBands.calculate({ period: 20, stdDev: 2, values: cl });
  close(bb.upper, tb.map((x) => x.upper), 1e-9, 'BB upper');
  close(I.atr(c, 14), TI.ATR.calculate({ period: 14, high: h, low: l, close: cl }), 1e-9, 'ATR');
  close(I.adx(c).adx, TI.ADX.calculate({ period: 14, high: h, low: l, close: cl }).map((x) => x.adx), 1e-6, 'ADX');
  close(I.cci(c, 20), TI.CCI.calculate({ period: 20, high: h, low: l, close: cl }), 1e-6, 'CCI');
  close(I.williamsR(c, 14), TI.WilliamsR.calculate({ period: 14, high: h, low: l, close: cl }), 1e-9, 'Williams');
  close(I.obv(c), TI.OBV.calculate({ close: cl, volume: v }), 1e-9, 'OBV');
  close(I.awesome(c), TI.AwesomeOscillator.calculate({ high: h, low: l, fastPeriod: 5, slowPeriod: 34 }), 1e-9, 'AO');
  close(I.roc(c, 10), TI.ROC.calculate({ period: 10, values: cl }), 1e-9, 'ROC');
});

test('new indicators: Keltner, Donchian, Aroon, TRIX, Heikin-Ashi, CMF, squeeze behave correctly', () => {
  const kc = I.keltner(c);
  assert.ok(kc.upper.at(-1) > kc.mid.at(-1) && kc.mid.at(-1) > kc.lower.at(-1));
  const dc = I.donchian(c, 20);
  assert.equal(dc.upper.at(-1), Math.max(...h.slice(-20)));
  assert.equal(dc.lower.at(-1), Math.min(...l.slice(-20)));
  const up = Array.from({ length: 60 }, (_, i) => ({ t: i, o: i, h: i + 1, l: i - 1, c: i + 0.5, v: 1 }));
  assert.equal(I.aroon(up, 25).up.at(-1), 100);
  assert.equal(I.aroon(up, 25).down.at(-1), 0);
  assert.ok(I.trix(up, 15).at(-1) > 0);
  const ha = I.heikinAshi(c);
  ha.forEach((k) => assert.ok(k.h >= Math.max(k.o, k.c) && k.l <= Math.min(k.o, k.c)));
  const cmf = I.chaikinMF(up, 20).at(-1);
  assert.ok(cmf > 0 && cmf <= 1);
  assert.ok(I.squeeze(c).slice(-50).every((x) => typeof x === 'boolean'));
});
