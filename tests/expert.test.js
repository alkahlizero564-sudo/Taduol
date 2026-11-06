import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const ai = await import('../js/ai.js');

test('expertRecommendation (Gemini): sends the chart image + context, enables Google Search, parses the plan', async () => {
  ai.saveSlots([{ key: 'AIzaTEST', provider: 'auto', model: 'gemini-2.5-pro', enabled: true }]);
  let body, url;
  globalThis.fetch = async (u, o) => {
    url = String(u); body = JSON.parse(o.body);
    const reply = 'بحثت في الأخبار.\n```json\n' + JSON.stringify({
      decision: 'SELL', confidence: 62, entry: 1.1228, entry_type: 'فوري', stop_loss: 1.1255, take_profits: [1.1185, 1.115, 1.11],
      news: { sentiment: 'سلبي', summary: 'الدولار قوي بعد بيانات الوظائف', high_impact_soon: false, upcoming_events: [] }, reasons: ['ابتلاعية بيعية عند مقاومة'],
    }) + '\n```';
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: reply }] } }] }) };
  };
  const out = await ai.expertRecommendation({ data: 'iVBORw0', mime: 'image/png' }, { context: 'الرمز: EUR/USD | السعر 1.1228' });
  assert.match(url, /gemini-2\.5-pro:generateContent/);
  assert.deepEqual(body.tools, [{ google_search: {} }], 'web search enabled');
  assert.equal(body.contents[0].parts[0].inline_data.data, 'iVBORw0', 'chart image attached');
  assert.match(body.contents[0].parts[1].text, /EUR\/USD/);
  assert.match(body.systemInstruction.parts[0].text, /ابحث في الويب/);
  assert.equal(out.result.decision, 'SELL');
  assert.equal(out.result.stop_loss, 1.1255);
  assert.equal(out.result._provider, 'gemini');
});
