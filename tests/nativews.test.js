import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SmartWebSocket, NativeWebSocket, nativeSocketsAvailable } from '../js/nativews.js';

function fakeBridge() {
  const calls = []; let listener = null;
  globalThis.Capacitor = {
    isNativePlatform: () => true,
    addListener: (plugin, event, cb) => { assert.equal(plugin, 'NativeSocket'); assert.equal(event, 'socket'); listener = cb; return { remove() {} }; },
    nativePromise: async (plugin, method, o) => { calls.push({ plugin, method, o }); },
  };
  return { calls, emit: (ev) => listener(ev) };
}

test('SmartWebSocket uses the native plugin for Tiingo inside the app, browser WebSocket otherwise', async () => {
  class BrowserWS { constructor(u) { this.url = u; this.browser = true; } }
  globalThis.WebSocket = BrowserWS;
  delete globalThis.Capacitor;
  assert.equal(nativeSocketsAvailable(), false);
  assert.ok(new SmartWebSocket('wss://api.tiingo.com/fx').browser, 'browser outside the app');
  const br = fakeBridge();
  assert.ok(new SmartWebSocket('wss://data-stream.binance.vision/ws/x').browser, 'Binance stays on browser WS');
  const ws = new SmartWebSocket('wss://api.tiingo.com/fx');
  assert.ok(ws instanceof NativeWebSocket);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(br.calls[0], { plugin: 'NativeSocket', method: 'open', o: { id: ws.id, url: 'wss://api.tiingo.com/fx' } });

  const got = [];
  ws.onopen = () => { got.push('open'); ws.send('{"eventName":"subscribe"}'); };
  ws.onmessage = (e) => got.push('msg:' + e.data);
  ws.onclose = (e) => got.push('close:' + e.code);
  br.emit({ id: 'other', type: 'open' }); // حدث لاتصال آخر يُتجاهل
  br.emit({ id: ws.id, type: 'open' });
  br.emit({ id: ws.id, type: 'message', data: '{"messageType":"H"}' });
  br.emit({ id: ws.id, type: 'close', code: 1006, reason: 'x' });
  br.emit({ id: ws.id, type: 'close', code: 1000 }); // مكرر يُتجاهل
  assert.deepEqual(got, ['open', 'msg:{"messageType":"H"}', 'close:1006']);
  assert.deepEqual(br.calls[1], { plugin: 'NativeSocket', method: 'send', o: { id: ws.id, data: '{"eventName":"subscribe"}' } });
  delete globalThis.Capacitor;
});

test('NativeWebSocket reports a close when the native plugin is missing (old app build)', async () => {
  globalThis.Capacitor = { isNativePlatform: () => true, addListener: () => ({}), nativePromise: async () => { throw new Error('plugin not implemented'); } };
  const ws = new NativeWebSocket('wss://api.tiingo.com/fx');
  const got = [];
  ws.onerror = (e) => got.push('error:' + e.message);
  ws.onclose = (e) => got.push('close:' + e.code);
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(got, ['error:plugin not implemented', 'close:1006']);
  delete globalThis.Capacitor;
});
