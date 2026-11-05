// =====================================================================
//  الذكاء الاصطناعي — 4 خانات لمفاتيح Gemini أو Claude
//  • تحليل صورة الشارت → نقطة الدخول / وقف الخسارة / الأهداف
//  • تبديل تلقائي للمفتاح التالي عند الفشل، أو "تحليل جماعي" بكل المفاتيح
//  • أخبار الأسواق عبر البحث على الويب (Google Search / Claude web search)
// =====================================================================
import { patternCatalogText } from './patterns.js';

const STORE_KEY = 'taduol.apiKeys.v1';
export const SLOT_COUNT = 4;

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (الأقوى — افتراضي)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (سريع ومتوازن)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (الأسرع والأرخص)' },
];
export const GEMINI_MODELS = [
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (الأدق)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (سريع — افتراضي)' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (الأرخص)' },
];

// موديلات Claude التي تدعم الرجوع التلقائي على الخادم عند الرفض
const CLAUDE_FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-opus-5']);
// موديلات Claude التي تدعم نسخة البحث الأحدث
const CLAUDE_WEB_SEARCH_NEW = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-opus-5', 'claude-sonnet-5']);

// ---------------- إدارة المفاتيح ----------------
export function detectProvider(key) {
  const k = (key || '').trim();
  if (k.startsWith('sk-ant-')) return 'claude';
  if (k.startsWith('AIza')) return 'gemini';
  return null;
}

const emptySlot = () => ({ key: '', provider: 'auto', model: '', enabled: true, label: '' });

export function loadSlots() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.from({ length: SLOT_COUNT }, (_, i) => ({ ...emptySlot(), ...(arr[i] || {}) }));
  } catch {
    return Array.from({ length: SLOT_COUNT }, emptySlot);
  }
}

export function saveSlots(slots) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(slots)); return true; } catch { return false; }
}

export function resolveSlot(slot) {
  const provider = slot.provider === 'auto' ? detectProvider(slot.key) : slot.provider;
  const model = slot.model || (provider === 'claude' ? 'claude-opus-5-5' : 'gemini-2.5-flash');
  return { ...slot, provider, model };
}

export function activeSlots() {
  return loadSlots().map((s, i) => ({ ...resolveSlot(s), index: i }))
    .filter((s) => s.enabled && s.key.trim() && s.provider);
}

// ---------------- البرومبت ----------------
const SYSTEM_PROMPT = `أنت محلل فني محترف وخبير في الشموع اليابانية والتحليل الفني للأسواق المالية (فوركس، عملات رقمية، ذهب، أسهم، مؤشرات).
تعرف جميع أنماط الشموع اليابانية التالية وتتعرف عليها بدقة من الصور:
${patternCatalogText()}

وتعرف أيضاً النماذج السعرية الكلاسيكية: الرأس والكتفين (والمقلوب)، القمة/القاع المزدوج والثلاثي، المثلثات (الصاعد/الهابط/المتماثل)، الأعلام والرايات، الأوتاد، القنوات، الكوب والعروة، المستطيلات.
وتقرأ المؤشرات الظاهرة على الشارت: المتوسطات المتحركة (EMA/SMA)، RSI، MACD، بولينجر، ستوكاستيك، ADX، إيشيموكو، فيبوناتشي، السوبرترند، البارابوليك سار، الحجم، مستويات الدعم والمقاومة، خطوط الترند.

قواعدك:
1. اقرأ محور الأسعار في الصورة بدقة واستخرج أرقاماً حقيقية من المقياس. لا تخترع أرقاماً خارج نطاق الشارت.
2. حدد اتجاه السوق والقرار: BUY أو SELL أو WAIT (إذا كانت الإشارات متضاربة).
3. ضع وقف الخسارة خلف آخر قاع/قمة مهمة (Swing) وليس قريباً جداً من الدخول.
4. الأهداف عند مستويات المقاومة/الدعم التالية، بنسبة عائد/مخاطرة لا تقل عن 1:1.5 للهدف الأول.
5. كن صادقاً في نسبة الثقة. إذا كانت الصورة غير واضحة قل ذلك في التحذيرات.
6. اكتب كل النصوص التوضيحية باللغة العربية.
7. أعد JSON فقط بدون أي نص قبله أو بعده.`;

const JSON_SHAPE = `{
  "asset": "اسم الأصل إن ظهر في الصورة أو null",
  "timeframe": "الفريم الزمني إن ظهر أو null",
  "current_price": رقم,
  "trend": { "direction": "صاعد|هابط|عرضي", "strength": "قوي|متوسط|ضعيف", "description": "شرح قصير" },
  "will_rise": "نعم|لا|غير مؤكد",
  "decision": "BUY|SELL|WAIT",
  "confidence": رقم من 0 إلى 100,
  "entry": رقم,
  "entry_zone": [أدنى, أعلى],
  "entry_type": "فوري|أمر معلق عند الارتداد|انتظار كسر",
  "stop_loss": رقم,
  "take_profits": [هدف1, هدف2, هدف3],
  "risk_reward": رقم,
  "candlestick_patterns": [ { "name_ar": "", "name_en": "", "location": "أين في الشارت", "signal": "صاعد|هابط|محايد", "reliability": "عالية|متوسطة|منخفضة" } ],
  "chart_patterns": [ { "name": "", "signal": "صاعد|هابط", "note": "" } ],
  "indicators": [ { "name": "", "reading": "", "signal": "صاعد|هابط|محايد" } ],
  "support_levels": [أرقام],
  "resistance_levels": [أرقام],
  "summary": "ملخص التحليل بالعربية في 3-5 جمل",
  "invalidation": "متى يُلغى السيناريو",
  "warnings": ["تحذيرات"]
}`;

function buildUserPrompt(extra) {
  let p = `حلل صورة الشارت المرفقة تحليلاً فنياً كاملاً بالشموع اليابانية والمؤشرات، وحدد هل سيصعد السوق أم لا، ونقطة الدخول ووقف الخسارة والأهداف.\nأعد النتيجة بهذا الشكل بالضبط (JSON صالح):\n${JSON_SHAPE}`;
  if (extra?.note) p += `\n\nملاحظة من المستخدم: ${extra.note}`;
  if (extra?.liveContext) p += `\n\nبيانات حية من السوق ومحرك التحليل المحلي (استخدمها للتأكيد، الصورة هي الأساس):\n${extra.liveContext}`;
  return p;
}

// ---------------- أدوات ----------------
export function extractJSON(text) {
  if (!text) throw new Error('رد فارغ من الذكاء الاصطناعي');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fenced ? fenced[1] : text;
  const start = src.indexOf('{');
  const end = src.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('لم أجد JSON في الرد');
  return JSON.parse(src.slice(start, end + 1));
}

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); res({ data: s.slice(s.indexOf(',') + 1), mime: file.type || 'image/png' }); };
    r.onerror = () => rej(new Error('تعذر قراءة الصورة'));
    r.readAsDataURL(file);
  });
}

// ---------------- Claude (عبر Anthropic SDK الرسمي) ----------------
let _AnthropicCtor = null;
async function getAnthropic() {
  if (_AnthropicCtor) return _AnthropicCtor;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.0.0/+esm');
    _AnthropicCtor = mod.default || mod.Anthropic;
    return _AnthropicCtor;
  } catch (e) {
    throw new Error('تعذر تحميل مكتبة Anthropic SDK — تأكد من اتصال الإنترنت');
  }
}

function claudeErrorMessage(e) {
  const s = e?.status;
  if (s === 401) return 'مفتاح Claude غير صالح (401)';
  if (s === 403) return 'المفتاح لا يملك صلاحية (403)';
  if (s === 429) return 'تم تجاوز حد الاستخدام (429) — جرب لاحقاً أو مفتاحاً آخر';
  if (s === 529 || s >= 500) return 'خوادم Claude مشغولة حالياً';
  if (s === 400) return 'طلب غير صالح: ' + (e?.error?.error?.message || e?.message || '');
  return e?.message || String(e);
}

async function claudeCall(slot, { system, content, tools, effort = 'high', maxTokens = 16000 }) {
  const Anthropic = await getAnthropic();
  const client = new Anthropic({ apiKey: slot.key.trim(), dangerouslyAllowBrowser: true });
  const useFallback = CLAUDE_FALLBACK_MODELS.has(slot.model);
  const messages = [{ role: 'user', content }];
  let resp;
  try {
    for (let turn = 0; turn < 4; turn++) {
      const params = {
        model: slot.model,
        max_tokens: maxTokens,
        thinking: { type: 'adaptive' },
        output_config: { effort },
        system,
        messages,
      };
      if (tools) params.tools = tools;
      if (useFallback) {
        // رجوع تلقائي لموديل آخر على الخادم إذا رفض الموديل الطلب
        params.betas = ['server-side-fallback-2026-07-01'];
        params.fallbacks = 'default';
        resp = await client.beta.messages.create(params);
      } else {
        resp = await client.messages.create(params);
      }
      // البحث على الويب قد يتوقف مؤقتاً (pause_turn) — نكمل الدور
      if (resp.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: resp.content }); continue; }
      break;
    }
  } catch (e) {
    throw new Error(claudeErrorMessage(e));
  }
  if (resp.stop_reason === 'refusal') {
    throw new Error('رفض Claude الطلب' + (resp.stop_details?.explanation ? ': ' + resp.stop_details.explanation : ''));
  }
  const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  if (resp.stop_reason === 'max_tokens' && !text) throw new Error('انقطع الرد (max_tokens)');
  return text;
}

// ---------------- Gemini (REST) ----------------
async function geminiCall(slot, { system, parts, json = true, search = false }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(slot.model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
  };
  if (json && !search) body.generationConfig.responseMimeType = 'application/json';
  if (search) body.tools = [{ google_search: {} }];
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': slot.key.trim() },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || `HTTP ${r.status}`;
    if (r.status === 400 && /API key/i.test(msg)) throw new Error('مفتاح Gemini غير صالح');
    if (r.status === 429) throw new Error('تم تجاوز حد Gemini (429) — جرب لاحقاً أو مفتاحاً آخر');
    if (r.status === 404) throw new Error(`الموديل ${slot.model} غير متاح — اختر موديلاً آخر`);
    throw new Error('Gemini: ' + msg);
  }
  const cand = j.candidates?.[0];
  if (!cand) throw new Error('Gemini لم يرجع رداً' + (j.promptFeedback?.blockReason ? ` (${j.promptFeedback.blockReason})` : ''));
  return (cand.content?.parts || []).map((p) => p.text || '').join('\n');
}

// ---------------- تحليل صورة الشارت ----------------
async function analyzeWithSlot(slot, img, extra) {
  const prompt = buildUserPrompt(extra);
  let text;
  if (slot.provider === 'claude') {
    text = await claudeCall(slot, {
      system: SYSTEM_PROMPT,
      content: [
        { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data } },
        { type: 'text', text: prompt },
      ],
    });
  } else {
    text = await geminiCall(slot, {
      system: SYSTEM_PROMPT,
      parts: [{ inline_data: { mime_type: img.mime, data: img.data } }, { text: prompt }],
    });
  }
  const json = extractJSON(text);
  return { ...json, _provider: slot.provider, _model: slot.model, _slot: slot.index + 1 };
}

/**
 * @param {{data,mime}} img
 * @param {{mode:'failover'|'consensus', note?, liveContext?, onProgress?}} opts
 */
export async function analyzeChartImage(img, opts = {}) {
  const slots = activeSlots();
  if (!slots.length) throw new Error('أضف مفتاح API واحداً على الأقل في صفحة "المفاتيح"');
  const log = opts.onProgress || (() => {});
  const errors = [];

  if (opts.mode === 'consensus' && slots.length > 1) {
    log(`تحليل جماعي باستخدام ${slots.length} مفاتيح...`);
    const results = await Promise.allSettled(slots.map((s) => analyzeWithSlot(s, img, opts)));
    const ok = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') ok.push(r.value);
      else errors.push(`خانة ${slots[i].index + 1}: ${r.reason?.message}`);
    });
    if (!ok.length) throw new Error('فشلت كل المفاتيح:\n' + errors.join('\n'));
    return { result: mergeResults(ok), individual: ok, errors };
  }

  for (const s of slots) {
    try {
      log(`جاري التحليل بخانة ${s.index + 1} (${s.provider === 'claude' ? 'Claude' : 'Gemini'} — ${s.model})...`);
      const r = await analyzeWithSlot(s, img, opts);
      return { result: r, individual: [r], errors };
    } catch (e) {
      errors.push(`خانة ${s.index + 1}: ${e.message}`);
      log(`فشلت خانة ${s.index + 1}: ${e.message} — تجربة المفتاح التالي...`);
    }
  }
  throw new Error('فشلت كل المفاتيح:\n' + errors.join('\n'));
}

const median = (arr) => {
  const a = arr.filter((x) => typeof x === 'number' && isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** دمج نتائج عدة نماذج (تصويت الأغلبية + الوسيط للأسعار) */
export function mergeResults(list) {
  if (list.length === 1) return list[0];
  const votes = { BUY: 0, SELL: 0, WAIT: 0 };
  list.forEach((r) => { votes[r.decision in votes ? r.decision : 'WAIT'] += (r.confidence || 50) / 100; });
  const decision = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  const agree = list.filter((r) => r.decision === decision);
  const src = agree.length ? agree : list;
  const tps = [0, 1, 2].map((i) => median(src.map((r) => r.take_profits?.[i])));
  const agreement = Math.round((agree.length / list.length) * 100);
  const base = src[0];
  return {
    ...base,
    decision,
    confidence: Math.round((median(src.map((r) => r.confidence)) || 50) * (agreement / 100)),
    entry: median(src.map((r) => r.entry)),
    stop_loss: median(src.map((r) => r.stop_loss)),
    take_profits: tps.filter((x) => x != null),
    current_price: median(list.map((r) => r.current_price)),
    candlestick_patterns: dedupe(list.flatMap((r) => r.candlestick_patterns || []), (p) => p.name_en || p.name_ar),
    chart_patterns: dedupe(list.flatMap((r) => r.chart_patterns || []), (p) => p.name),
    warnings: [...new Set(list.flatMap((r) => r.warnings || []))],
    summary: `اتفاق ${agree.length} من ${list.length} نماذج على ${decision}. ` + (base.summary || ''),
    _provider: 'consensus', _model: list.map((r) => r._model).join(' + '), _agreement: agreement,
  };
}
const dedupe = (arr, key) => { const m = new Map(); arr.forEach((x) => { const k = key(x); if (k && !m.has(k)) m.set(k, x); }); return [...m.values()]; };

// ---------------- الأخبار بالذكاء الاصطناعي ----------------
export async function aiMarketNews(topic = 'العملات الرقمية والفوركس والذهب') {
  const slots = activeSlots();
  if (!slots.length) throw new Error('أضف مفتاح API أولاً');
  const system = 'أنت محلل أخبار أسواق مالية. ابحث في الويب عن أحدث الأخبار (آخر 24 ساعة) وأجب بالعربية. أعد JSON فقط.';
  const prompt = `ابحث عن أحدث أخبار ${topic} اليوم. حدد لكل أصل رئيسي هل ارتفع أم انخفض ولماذا، وأهم الأحداث الاقتصادية القادمة (الفائدة، التضخم، الوظائف).
أعد JSON بهذا الشكل:
{"date":"", "market_mood":"إيجابي|سلبي|محايد", "summary":"", "assets":[{"name":"","direction":"ارتفع|انخفض|مستقر","change":"","reason":""}], "headlines":[{"title":"","impact":"إيجابي|سلبي|محايد","source":"","url":""}], "upcoming_events":[{"event":"","time":"","expected_impact":""}]}`;
  const errors = [];
  for (const s of slots) {
    try {
      let text;
      if (s.provider === 'claude') {
        const type = CLAUDE_WEB_SEARCH_NEW.has(s.model) ? 'web_search_20260209' : 'web_search_20250305';
        text = await claudeCall(s, { system, content: [{ type: 'text', text: prompt }], tools: [{ type, name: 'web_search', max_uses: 6 }], effort: 'medium' });
      } else {
        text = await geminiCall(s, { system, parts: [{ text: prompt }], search: true });
      }
      return { ...extractJSON(text), _provider: s.provider, _model: s.model };
    } catch (e) { errors.push(`خانة ${s.index + 1}: ${e.message}`); }
  }
  throw new Error('فشل جلب الأخبار:\n' + errors.join('\n'));
}

/** اختبار سريع لمفتاح */
export async function testSlot(slot) {
  const s = resolveSlot(slot);
  if (!s.provider) throw new Error('لم أتعرف على نوع المفتاح — اختر المزود يدوياً');
  const system = 'Reply with exactly: OK';
  if (s.provider === 'claude') {
    await claudeCall(s, { system, content: [{ type: 'text', text: 'ping' }], effort: 'low', maxTokens: 2000 });
  } else {
    await geminiCall(s, { system, parts: [{ text: 'ping' }], json: false });
  }
  return `${s.provider === 'claude' ? 'Claude' : 'Gemini'} — ${s.model} ✓`;
}
