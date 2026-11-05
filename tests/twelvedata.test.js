import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TDPool, classifyTDError } from '../js/twelvedata.js';

// ساعة وهمية: sleep يقدّم الوقت فوراً
function makePool(handler, keys = ['k1', 'k2']) {
  const clock = { t: 1_000_000, slept: [] };
  const calls = [];
  const pool = new TDPool({
    now: () => clock.t,
    sleep: async (ms) => { clock.slept.push(ms); clock.t += ms; },
    fetchFn: async (url) => {
      const u = new URL(url);
      calls.push({ key: u.searchParams.get('apikey'), symbol: u.searchParams.get('symbol'), path: u.pathname, t: clock.t });
      const { status = 200, body } = handler(u);
      return { ok: status < 300, status, json: async () => body };
    },
  });
  pool.sync(keys);
  return { pool, clock, calls };
}
const ok = () => ({ body: { status: 'ok', values: [] } });

test('spreads requests across keys before waiting', async () => {
  const { pool, clock, calls } = makePool(ok);
  for (let i = 0; i < 16; i++) await pool.request('/time_series', { symbol: 'S' + i });
  assert.equal(calls.filter((c) => c.key === 'k1').length, 8);
  assert.equal(calls.filter((c) => c.key === 'k2').length, 8);
  assert.equal(clock.slept.length, 0, 'should not wait while credits remain');
});

test('waits automatically when every key is full, then continues', async () => {
  const { pool, clock, calls } = makePool(ok, ['only']);
  const waits = [];
  for (let i = 0; i < 9; i++) await pool.request('/time_series', { symbol: 'S' + i }, { onWait: (s) => waits.push(s) });
  assert.equal(calls.length, 9);
  assert.equal(clock.slept.length, 1);
  assert.ok(clock.slept[0] > 59000 && clock.slept[0] <= 60100, 'waits about one minute: ' + clock.slept[0]);
  assert.equal(waits.length, 1);
  assert.ok(calls[8].t - calls[0].t >= 60000);
});

test('fails over to the next key on 429 and on an invalid key', async () => {
  const { pool, calls } = makePool((u) => {
    const k = u.searchParams.get('apikey');
    if (k === 'k1') return { status: 429, body: { status: 'error', code: 429, message: 'You have run out of API credits for the current minute' } };
    if (k === 'k2') return { status: 401, body: { status: 'error', code: 401, message: 'apikey is invalid' } };
    return ok();
  }, ['k1', 'k2', 'k3']);
  await pool.request('/time_series', { symbol: 'EUR/USD' });
  assert.deepEqual(calls.map((c) => c.key).sort(), ['k1', 'k2', 'k3']);
  const st = pool.status();
  assert.equal(st[0].state, 'minute');
  assert.equal(st[1].state, 'invalid');
  assert.equal(st[2].state, 'ok');
});

test('daily exhaustion blocks the key until tomorrow and errors when no key is left', async () => {
  const { pool } = makePool(() => ({ status: 429, body: { status: 'error', code: 429, message: 'You have run out of API credits for the day' } }), ['k1']);
  await assert.rejects(() => pool.request('/quote', { symbol: 'EUR/USD' }), /يوم/);
  assert.equal(pool.status()[0].state, 'daily');
});

test('cache: the same request within 55s costs nothing', async () => {
  const { pool, clock, calls } = makePool(ok, ['k1']);
  await pool.request('/time_series', { symbol: 'X' }, { cacheKey: 'x' });
  clock.t += 30000;
  await pool.request('/time_series', { symbol: 'X' }, { cacheKey: 'x' });
  assert.equal(calls.length, 1);
  clock.t += 30000;
  await pool.request('/time_series', { symbol: 'X' }, { cacheKey: 'x' });
  assert.equal(calls.length, 2);
});

test('quotes split a 12-symbol watchlist across two keys without waiting', async () => {
  const { pool, clock, calls } = makePool((u) => {
    const syms = u.searchParams.get('symbol').split(',');
    const q = (s) => ({ symbol: s, close: '1', percent_change: '0' });
    return { body: syms.length === 1 ? q(syms[0]) : Object.fromEntries(syms.map((s) => [s, q(s)])) };
  });
  const syms = Array.from({ length: 12 }, (_, i) => 'S' + i);
  const map = await pool.quotes(syms);
  assert.equal(Object.keys(map).length, 12);
  assert.equal(calls.length, 2);
  assert.equal(clock.slept.length, 0);
  const used = pool.status().map((s) => s.used).sort();
  assert.deepEqual(used, [4, 8]);
});

test('classifyTDError', () => {
  assert.equal(classifyTDError({ code: 401, message: 'x' }).kind, 'invalid');
  assert.equal(classifyTDError({ code: 429, message: 'run out of API credits for the current minute' }).kind, 'minute');
  assert.equal(classifyTDError({ code: 429, message: 'run out of API credits for the day' }).kind, 'daily');
  assert.equal(classifyTDError({ code: 404, message: 'symbol not found' }).kind, 'symbol');
});
