import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, detectPatterns } from '../js/patterns.js';
import { EXAMPLES, exampleSeries } from '../js/examples.js';

test('library has unique ids and complete metadata', () => {
  const ids = new Set();
  for (const p of PATTERNS) {
    assert.ok(!ids.has(p.id), 'duplicate ' + p.id);
    ids.add(p.id);
    for (const f of ['en', 'ar', 'desc', 'type', 'kind']) assert.ok(p[f], `${p.id} missing ${f}`);
    assert.ok([1, 2, 3].includes(p.reliability));
    assert.equal(typeof p.detect, 'function');
  }
  assert.ok(PATTERNS.length >= 70, 'expected 70+ patterns, got ' + PATTERNS.length);
});

for (const id of Object.keys(EXAMPLES)) {
  test(`detects example: ${id}`, () => {
    const c = exampleSeries(id);
    const found = detectPatterns(c, { lookback: 1 }).map((p) => p.id);
    assert.ok(found.includes(id), `${id} not detected; found: ${found.join(', ')}`);
  });
}

test('bullish reversal patterns do not fire in an uptrend', () => {
  const c = exampleSeries('hammer').slice(10);
  const up = [...exampleSeries('shooting_star').slice(0, 10), ...c];
  const found = detectPatterns(up, { lookback: 1 }).map((p) => p.id);
  assert.ok(!found.includes('hammer'));
  assert.ok(found.includes('hanging_man'));
});
