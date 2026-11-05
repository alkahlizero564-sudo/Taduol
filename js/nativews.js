// =====================================================================
//  WebSocket ذكي: داخل تطبيق Android يفتح اتصالات Tiingo من الكود الأصلي
//  (المتصفح الداخلي يرسل ترويسة Origin ويرفضها بث Tiingo)، وفي غير ذلك WebSocket العادي.
//  الواجهة مطابقة لـ WebSocket: onopen / onmessage({data}) / onclose({code,reason}) / onerror / send / close
// =====================================================================

const NATIVE_HOSTS = /^wss:\/\/api\.tiingo\.com\//;

const cap = () => globalThis.Capacitor;
export const nativeSocketsAvailable = () => !!(cap()?.isNativePlatform?.() && typeof cap()?.nativePromise === 'function' && typeof cap()?.addListener === 'function');

const sockets = new Map();
let listening = false;
let seq = 0;

function ensureListener() {
  if (listening) return;
  listening = true;
  cap().addListener('NativeSocket', 'socket', (ev) => {
    const s = sockets.get(ev?.id);
    if (s) s._event(ev);
  });
}

export class NativeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.id = `ns${Date.now().toString(36)}${(seq++).toString(36)}`;
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    ensureListener();
    sockets.set(this.id, this);
    cap().nativePromise('NativeSocket', 'open', { id: this.id, url }).catch((e) => {
      // الإضافة الأصلية غير موجودة (نسخة قديمة) أو رفضت الطلب
      this._event({ id: this.id, type: 'error', data: String(e?.message || e) });
      this._event({ id: this.id, type: 'close', code: 1006, reason: 'native socket unavailable' });
    });
  }

  _event(ev) {
    switch (ev.type) {
      case 'open': this.readyState = 1; this.onopen?.({}); break;
      case 'message': this.onmessage?.({ data: ev.data }); break;
      case 'error': this.onerror?.({ message: ev.data }); break;
      case 'close':
        if (this.readyState === 3) return;
        this.readyState = 3; sockets.delete(this.id);
        this.onclose?.({ code: ev.code ?? 1006, reason: ev.reason || '' });
        break;
      default: break;
    }
  }

  send(data) {
    if (this.readyState !== 1) throw new Error('WebSocket is not open');
    cap().nativePromise('NativeSocket', 'send', { id: this.id, data: String(data) }).catch(() => {});
  }

  close() {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    cap().nativePromise('NativeSocket', 'close', { id: this.id }).catch(() => {});
    this._event({ id: this.id, type: 'close', code: 1000, reason: 'client closed' });
  }
}

/**
 * يُستخدم مثل WebSocket تماماً: new SmartWebSocket(url)
 * يختار الاتصال الأصلي لعناوين Tiingo داخل التطبيق، و WebSocket العادي في غير ذلك.
 */
export function SmartWebSocket(url) {
  if (NATIVE_HOSTS.test(url) && nativeSocketsAvailable()) return new NativeWebSocket(url);
  return new globalThis.WebSocket(url);
}
