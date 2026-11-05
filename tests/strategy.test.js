import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketStructure, rsiDivergence, buildPlan, backtest } from '../js/strategy.js';
import { analyze } from '../js/analysis.js';
import { rsi } from '../js/indicators.js';

const mk = (closes) => closes.map((c, i) => ({ t: i, o: c - 0.2, h: c + 0.6, l: c - 0.6, c, v: 10 }));
// موجات صاعدة: قمم وقيعان أعلى
const upWaves = (n) => mk(Array.from({ length: n }, (_, i) => 100 + i * 0.15 + 3 * Math.sin(i / 4)));
const dnWaves = (n) => mk(Array.from({ length: n }, (_, i) => 200 - i * 0.15 + 3 * Math.sin(i / 4)));

test('marketStructure detects HH/HL and LH/LL', () => {
  assert.equal(marketStructure(upWaves(200)).trend, 'up');
  assert.equal(marketStructure(dnWaves(200)).trend, 'down');
});

test('rsiDivergence finds a bullish divergence (lower price low, higher RSI low)', () => {
  // هبوط حاد ثم قاع أول، ارتداد، ثم قاع ثانٍ أدنى قليلاً لكن بزخم أضعف
  const p = [];
  for (let i = 0; i < 40; i++) p.push(120 - i * 0.8);
  for (let i = 0; i < 8; i++) p.push(88 + i * 1.5);
  for (let i = 0; i < 10; i++) p.push(100 - i * 1.3);
  for (let i = 0; i < 6; i++) p.push(87.2 + i * 0.6);
  const c = mk(p);
  const d = rsiDivergence(c, rsi(c, 14));
  assert.ok(d && d.type === 'bullish', 'expected bullish divergence, got ' + JSON.stringify(d));
});

test('plan geometry: stop behind structure, targets beyond entry, R:R ≥ 1.5, A-grade only trades', () => {
  for (const [c, side] of [[upWaves(300), 'BUY'], [dnWaves(300), 'SELL']]) {
    const r = analyze(c);
    assert.equal(r.side, side);
    const s = side === 'BUY' ? 1 : -1;
    assert.ok((r.entry - r.stopLoss) * s > 0, 'stop on the losing side');
    assert.ok(r.targets.every((t) => (t - r.entry) * s > 0), 'targets on the winning side');
    assert.ok(Math.abs(r.targets[1] - r.entry) > Math.abs(r.targets[0] - r.entry));
    assert.ok(r.riskReward >= 1.5 - 1e-9, 'RR ' + r.riskReward);
    assert.ok(r.risk >= 0.9 * r.atr - 1e-9 && r.risk <= 3 * r.atr + 1e-9, 'risk within 0.9–3 ATR');
    assert.ok(['A', 'B', 'C'].includes(r.grade));
    if (r.direction !== 'WAIT') assert.equal(r.grade, 'A');
    assert.ok(r.factors.length >= 5 && r.factors.every((f) => typeof f.text === 'string'));
  }
});

test('higher-timeframe filter blocks trades against the bigger trend', () => {
  const c = upWaves(300);
  const r = analyze(c, { htf: -0.6 });
  assert.equal(r.direction, 'WAIT');
  assert.ok(r.factors.some((f) => /الفريم الأكبر عكس/.test(f.text) && f.ok === false));
});

test('patterns are read from closed candles only by default', () => {
  const c = upWaves(200);
  // الشمعة الأخيرة (قيد التكوّن) ابتلاعية هابطة ضخمة — لا يجب أن تؤثر
  const lastC = c[c.length - 1], prev = c[c.length - 2];
  c[c.length - 1] = { ...lastC, o: prev.c + 2, h: prev.c + 2.2, l: prev.o - 3, c: prev.o - 2.8 };
  const r = analyze(c);
  assert.ok(r.patterns.every((p) => p.index <= c.length - 2));
  const r2 = analyze(c, { closedOnly: false });
  assert.ok(r2.patterns.some((p) => p.index === c.length - 1));
});

test('backtest returns consistent stats', () => {
  const c = upWaves(420);
  const bt = backtest(c, (s) => analyze(s), { start: 300, step: 3, minGrade: 'B' });
  assert.equal(bt.trades, bt.wins + bt.losses);
  assert.ok(bt.winRate >= 0 && bt.winRate <= 100);
  bt.list.forEach((t) => assert.ok(['win', 'loss'].includes(t.outcome)));
});
