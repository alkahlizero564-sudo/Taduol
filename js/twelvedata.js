// =====================================================================
//  Twelve Data — حتى 4 مفاتيح مع منظِّم طلبات ذكي
//  • يعدّ الرصيد المستهلك لكل مفتاح في آخر 60 ثانية (الخطة المجانية 8/دقيقة)
//  • يختار المفتاح الأكثر رصيداً، ويقسّم طلبات الأسعار المتعددة بين المفاتيح
//  • ينتظر تلقائياً بدل إظهار خطأ عند امتلاء كل المفاتيح
//  • ينتقل للمفتاح التالي عند 429 أو مفتاح غير صالح
//  • ذاكرة مؤقتة: نفس الطلب خلال 55 ثانية لا يستهلك رصيداً
// =====================================================================

const STORE_V2 = 'taduol.twelvedata.keys.v2';
const STORE_V1 = 'taduol.twelvedata.v1';
export const TD_SLOT_COUNT = 4;
export const TD_BASE = 'https://api.twelvedata.com';

// ---------------- تخزين المفاتيح ----------------
export function getTwelveKeys() {
  try {
    const ls = globalThis.localStorage;
    const raw = ls?.getItem(STORE_V2);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map((k) => String(k || '').trim()).filter(Boolean).slice(0, TD_SLOT_COUNT);
    }
    const old = (ls?.getItem(STORE_V1) || '').trim(); // ترحيل المفتاح القديم
    return old ? [old] : [];
  } catch { return []; }
}

export function setTwelveKeys(keys) {
  const clean = [...new Set((keys || []).map((k) => String(k || '').trim()).filter(Boolean))].slice(0, TD_SLOT_COUNT);
  try {
    globalThis.localStorage?.setItem(STORE_V2, JSON.stringify(clean));
    globalThis.localStorage?.removeItem?.(STORE_V1);
    pool.sync(clean);
    return true;
  } catch { pool.sync(clean); return false; }
}

export const getTwelveKey = () => getTwelveKeys()[0] || '';
export const setTwelveKey = (k) => setTwelveKeys(k ? [k] : []);

// ---------------- أخطاء ----------------
export class TDError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

export function classifyTDError(j, httpStatus) {
  const code = j?.code || httpStatus;
  const msg = String(j?.message || '');
  if (code === 401 || code === 403 || /api ?key/i.test(msg)) return new TDError('مفتاح Twelve Data غير صالح', 'invalid');
  if (code === 429 || /credits|limit/i.test(msg)) {
    return /day|daily/i.test(msg)
      ? new TDError('انتهى رصيد اليوم لهذا المفتاح (800 طلب)', 'daily')
      : new TDError('تجاوزت حد الدقيقة لهذا المفتاح', 'minute');
  }
  if (code === 404 || code === 400 || /symbol/i.test(msg)) return new TDError('الرمز غير موجود في Twelve Data — جرب صيغة مثل EUR/USD أو XAU/USD', 'symbol');
  return new TDError('Twelve Data: ' + (msg || `HTTP ${code}`), 'other');
}

// ---------------- المنظِّم ----------------
export class TDPool {
  constructor({ perMinute = 8, windowMs = 60000, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), fetchFn } = {}) {
    this.perMinute = perMinute; this.windowMs = windowMs;
    this.now = now; this.sleep = sleep; this.fetchFn = fetchFn;
    this.keys = []; // { key, used: [timestamps], blockedUntil, invalid }
    this.cache = new Map();
    this.cacheTtl = 55000;
    this.maxWaitMs = 70000;
  }

  sync(keys) {
    const old = new Map(this.keys.map((k) => [k.key, k]));
    this.keys = keys.map((key) => old.get(key) || { key, used: [], blockedUntil: 0, invalid: false });
  }

  _prune(k) { const t = this.now() - this.windowMs; k.used = k.used.filter((x) => x > t); }
  free(k) {
    this._prune(k);
    if (k.invalid || k.blockedUntil > this.now()) return 0;
    return Math.max(0, this.perMinute - k.used.length);
  }
  usable() { return this.keys.filter((k) => !k.invalid); }

  /** حالة كل مفتاح للعرض في الواجهة */
  status() {
    return this.keys.map((k, i) => {
      this._prune(k);
      const blocked = k.blockedUntil > this.now();
      return {
        slot: i + 1, used: k.used.length, perMinute: this.perMinute, free: this.free(k),
        state: k.invalid ? 'invalid' : blocked ? (k.blockedUntil - this.now() > this.windowMs * 2 ? 'daily' : 'minute') : 'ok',
        waitMs: blocked ? k.blockedUntil - this.now() : 0,
      };
    });
  }

  /** كم ننتظر حتى يتوفر رصيد `need` في أي مفتاح */
  _waitFor(need) {
    let best = Infinity;
    for (const k of this.usable()) {
      if (k.blockedUntil > this.now()) { best = Math.min(best, k.blockedUntil - this.now() + 50); continue; }
      this._prune(k);
      const over = k.used.length + need - this.perMinute;
      if (over <= 0) return 0;
      const sorted = [...k.used].sort((a, b) => a - b);
      best = Math.min(best, sorted[over - 1] + this.windowMs - this.now() + 50);
    }
    return best;
  }

  async _acquire(need, onWait) {
    if (need > this.perMinute) throw new TDError(`الطلب يحتاج ${need} رصيد وحد المفتاح ${this.perMinute} في الدقيقة`, 'other');
    for (;;) {
      if (!this.usable().length) {
        throw new TDError(this.keys.length ? 'كل مفاتيح Twelve Data غير صالحة' : 'هذا الرمز يحتاج مفتاح Twelve Data — أضفه في صفحة "المفاتيح"', 'nokey');
      }
      const cand = this.usable().map((k) => ({ k, f: this.free(k) })).filter((x) => x.f >= need).sort((a, b) => b.f - a.f)[0];
      if (cand) { for (let i = 0; i < need; i++) cand.k.used.push(this.now()); return cand.k; }
      const wait = this._waitFor(need);
      if (!isFinite(wait) || wait > this.maxWaitMs) {
        throw new TDError('انتهى رصيد كل مفاتيح Twelve Data لليوم — أضف مفتاحاً آخر أو انتظر للغد', 'daily');
      }
      onWait?.(Math.ceil(wait / 1000));
      await this.sleep(wait);
    }
  }

  _penalize(k, err) {
    if (err.kind === 'invalid') k.invalid = true;
    else if (err.kind === 'minute') k.blockedUntil = this.now() + this.windowMs;
    else if (err.kind === 'daily') {
      const d = new Date(this.now());
      k.blockedUntil = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    }
  }

  async _http(path, params, key) {
    const qs = new URLSearchParams({ ...params, apikey: key });
    const f = this.fetchFn || globalThis.fetch;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await f(`${TD_BASE}${path}?${qs}`, { signal: ctl.signal });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.status === 'error') throw classifyTDError(j, r.status);
      return j;
    } finally { clearTimeout(t); }
  }

  /**
   * طلب واحد بتكلفة `cost` مع إعادة المحاولة بمفتاح آخر عند الحاجة
   * @param {{cost?:number, cacheKey?:string, onWait?:(sec:number)=>void, key?:string}} o
   */
  async request(path, params, o = {}) {
    const cost = o.cost || 1;
    if (o.cacheKey) {
      const hit = this.cache.get(o.cacheKey);
      if (hit && this.now() - hit.t < this.cacheTtl) return hit.data;
    }
    // مفتاح محدد (لزر الاختبار) — بدون منظِّم
    if (o.key) return this._http(path, params, o.key);

    let lastErr;
    for (let attempt = 0; attempt < this.keys.length + 2; attempt++) {
      const k = await this._acquire(cost, o.onWait);
      try {
        const data = await this._http(path, params, k.key);
        if (o.cacheKey) this.cache.set(o.cacheKey, { t: this.now(), data });
        return data;
      } catch (e) {
        lastErr = e;
        if (!(e instanceof TDError) || !['invalid', 'minute', 'daily'].includes(e.kind)) throw e;
        this._penalize(k, e); // جرّب المفتاح التالي
      }
    }
    throw lastErr;
  }

  /** طلب أسعار عدة رموز مع تقسيمها على المفاتيح حسب الرصيد المتاح */
  async quotes(symbols, o = {}) {
    const cacheKey = 'q|' + symbols.join(',');
    const hit = this.cache.get(cacheKey);
    if (hit && this.now() - hit.t < this.cacheTtl) return hit.data;
    const out = {};
    let rest = [...symbols];
    while (rest.length) {
      const avail = Math.max(0, ...this.usable().map((k) => this.free(k)));
      const n = Math.max(1, Math.min(rest.length, avail || Math.min(rest.length, this.perMinute)));
      const chunk = rest.slice(0, n);
      const j = await this.request('/quote', { symbol: chunk.join(',') }, { cost: chunk.length, onWait: o.onWait });
      if (chunk.length === 1) out[chunk[0]] = j; else Object.assign(out, j);
      rest = rest.slice(n);
    }
    this.cache.set(cacheKey, { t: this.now(), data: out });
    return out;
  }
}

export const pool = new TDPool();
pool.sync(getTwelveKeys());
