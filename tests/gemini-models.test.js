import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listGeminiModels } from '../js/ai.js';

const m = (id, methods = ['generateContent', 'countTokens'], extra = {}) => ({
  name: 'models/' + id, displayName: id.toUpperCase(), description: 'desc ' + id,
  inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: methods, ...extra,
});

function mockFetch(pages) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url: new URL(url), key: opts?.headers?.['x-goog-api-key'] });
    const token = new URL(url).searchParams.get('pageToken') || '';
    const body = pages[token];
    return { ok: !!body, status: body ? 200 : 400, json: async () => body || { error: { message: 'API key not valid' } } };
  };
  return { fn, calls };
}

test('fetches all pages, keeps only content models, sorts newest/pro first', async () => {
  const { fn, calls } = mockFetch({
    '': { models: [m('gemini-2.0-flash'), m('text-embedding-004', ['embedContent']), m('gemini-2.5-flash-lite')], nextPageToken: 'p2' },
    p2: { models: [m('gemini-2.5-pro', undefined, { thinking: true }), m('gemini-2.5-flash-preview-tts'), m('gemini-2.5-flash'), m('gemma-3-27b-it'), m('imagen-4.0-generate-001', ['predict'])] },
  });
  const list = await listGeminiModels(' AIzaTEST ', fn);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].key, 'AIzaTEST', 'key sent in header, trimmed');
  assert.equal(calls[0].url.searchParams.get('key'), null, 'key not leaked in the URL');
  assert.equal(calls[1].url.searchParams.get('pageToken'), 'p2');
  assert.deepEqual(list.map((x) => x.id), ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemma-3-27b-it']);
  assert.equal(list[0].thinking, true);
  assert.equal(list[0].label, 'GEMINI-2.5-PRO');
  assert.equal(list[0].input, 1048576);
});

test('invalid key gives an Arabic error', async () => {
  const { fn } = mockFetch({});
  await assert.rejects(() => listGeminiModels('bad', fn), /غير صالح/);
  await assert.rejects(() => listGeminiModels('  ', fn), /اكتب مفتاح/);
});
