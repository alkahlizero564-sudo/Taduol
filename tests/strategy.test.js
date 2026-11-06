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


test('aggregate + makeHtfLookup use only completed higher-timeframe candles', async () => {
  const { aggregate, makeHtfLookup } = await import('../js/strategy.js');
  const H = 36e5, t0 = Date.UTC(2026, 0, 5); // الاثنين
  const c = Array.from({ length: 24 * 40 }, (_, i) => ({ t: t0 + i * H, o: i, h: i + 1, l: i - 1, c: i + 0.5, v: 1 }));
  const h4 = aggregate(c, '4h');
  assert.equal(h4.length, 240);
  assert.deepEqual([h4[0].o, h4[0].h, h4[0].l, h4[0].c, h4[0].v], [0, 4, -1, 3.5, 4]);
  const seen = [];
  const look = makeHtfLookup(c, '1h', (big) => { seen.push(big[big.length - 1].t); return big.length; });
  const t = c[24 * 20 + 2].t; // داخل شمعة 4 ساعات لم تكتمل
  look(t);
  assert.ok(seen[0] < Math.floor(t / (4 * H)) * 4 * H, 'last HTF candle used must be completed before t');
  assert.equal(look(t + H), look(t), 'cached within the same HTF candle');
  assert.equal(makeHtfLookup(c, '1w', () => 1)(t), null);
});

test('reviewExpertPlan: accepts sane plans, fixes tight stops / low R:R, rejects nonsense', async () => {
  const { reviewExpertPlan } = await import('../js/strategy.js');
  const ctx = { price: 100, atr: 1 };
  const ok = reviewExpertPlan({ decision: 'BUY', entry: 100, entry_type: 'فوري', stop_loss: 98.5, take_profits: [102.5, 104, 106] }, ctx);
  assert.equal(ok.status, 'ok'); assert.equal(ok.riskReward, 1.67); assert.equal(ok.entryType, 'market');
  const tight = reviewExpertPlan({ decision: 'SELL', entry: '100', stop_loss: '100.2', take_profits: ['99', '98'] }, ctx);
  assert.equal(tight.status, 'fixed'); assert.ok(Math.abs(tight.stopLoss - 100.8) < 1e-9); assert.ok(tight.riskReward >= 1.5);
  const lowRR = reviewExpertPlan({ decision: 'BUY', entry: 100, stop_loss: 98, take_profits: [100.5] }, ctx);
  assert.equal(lowRR.status, 'fixed'); assert.equal(lowRR.targets[0], 103); assert.equal(lowRR.targets.length, 3);
  assert.equal(reviewExpertPlan({ decision: 'BUY', entry: 100, stop_loss: 101, take_profits: [103] }, ctx).status, 'rejected');
  assert.equal(reviewExpertPlan({ decision: 'BUY', entry: 104, stop_loss: 103, take_profits: [106] }, ctx).status, 'rejected');
  assert.equal(reviewExpertPlan({ decision: 'BUY', entry: 100, stop_loss: 94, take_profits: [110] }, ctx).status, 'rejected');
  assert.equal(reviewExpertPlan({ decision: 'WAIT' }, ctx).status, 'wait');
  assert.equal(reviewExpertPlan({ decision: 'BUY', entry: 98, entry_type: 'أمر معلّق', stop_loss: 96.5, take_profits: [101] }, ctx).entryType, 'limit');
});

test('committeeVerdict: confirmed only when AI and engine agree on an A setup; news and conflicts force a wait', async () => {
  const { reviewExpertPlan, committeeVerdict } = await import('../js/strategy.js');
  const ctx = { price: 100, atr: 1 };
  const ai = { decision: 'BUY', entry: 100, stop_loss: 98.5, take_profits: [102.5], news: { high_impact_soon: false } };
  const rv = reviewExpertPlan(ai, ctx);
  assert.equal(committeeVerdict(ai, rv, { side: 'BUY', grade: 'A' }).level, 'strong');
  assert.equal(committeeVerdict(ai, rv, { side: 'BUY', grade: 'B' }).level, 'weak');
  assert.equal(committeeVerdict(ai, rv, { side: 'SELL', grade: 'A' }).level, 'wait');
  const news = { ...ai, news: { high_impact_soon: true, upcoming_events: [{ event: 'قرار الفائدة الأمريكية', time_utc: '18:00', impact: 'عالي' }] } };
  const v = committeeVerdict(news, rv, { side: 'BUY', grade: 'A' });
  assert.equal(v.level, 'wait'); assert.match(v.reasons[0], /قرار الفائدة/);
  assert.equal(committeeVerdict({ decision: 'WAIT' }, reviewExpertPlan({ decision: 'WAIT' }, ctx), { side: 'BUY', grade: 'A' }).level, 'wait');
});

test('reviewExpertPlan never returns R:R below 1.5 (even after widening a tight stop)', async () => {
  const { reviewExpertPlan } = await import('../js/strategy.js');
  // نفس حالة الذهب: وقف 7.5$ مع ATR 21.5 → يتوسع إلى 17.2، والهدف الأول 21.5 فقط (1.25R)
  const r = reviewExpertPlan({ decision: 'BUY', entry: 4103.5, stop_loss: 4096, take_profits: [4125, 4155, 4190] }, { price: 4103.72, atr: 21.5 });
  assert.equal(r.status, 'fixed');
  assert.ok(r.riskReward >= 1.5, 'RR ' + r.riskReward);
  assert.equal(r.targets[0], 4155, 'uses the next real target (≈3R) instead of the too-close one');
  assert.ok(r.targets.every((t, i, a) => i === 0 || t > a[i - 1]));
});
