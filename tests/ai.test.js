import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectProvider, extractJSON, mergeResults } from '../js/ai.js';

test('detectProvider', () => {
  assert.equal(detectProvider('sk-ant-api03-xxx'), 'claude');
  assert.equal(detectProvider('AIzaSyXXXX'), 'gemini');
  assert.equal(detectProvider('foo'), null);
});

test('extractJSON handles fences and prose', () => {
  assert.deepEqual(extractJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJSON('Here: {"a":{"b":2}} done'), { a: { b: 2 } });
  assert.throws(() => extractJSON('no json'));
});

test('mergeResults majority vote and median prices', () => {
  const m = mergeResults([
    { decision: 'BUY', confidence: 80, entry: 100, stop_loss: 95, take_profits: [110, 120], _model: 'a' },
    { decision: 'BUY', confidence: 70, entry: 102, stop_loss: 97, take_profits: [112, 122], _model: 'b' },
    { decision: 'SELL', confidence: 60, entry: 101, stop_loss: 106, take_profits: [90], _model: 'c' },
  ]);
  assert.equal(m.decision, 'BUY');
  assert.equal(m.entry, 101);
  assert.equal(m.stop_loss, 96);
  assert.deepEqual(m.take_profits, [111, 121]);
  assert.equal(m._agreement, 67);
});
