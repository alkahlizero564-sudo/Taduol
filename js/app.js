// =====================================================================
//  واجهة التطبيق — ربط كل الأجزاء
// =====================================================================
import { PATTERNS, PATTERN_MAP, detectPatterns } from './patterns.js';
import { analyze, summaryForAI, fmt } from './analysis.js';
import { computeAll } from './indicators.js';
import { technicalRating, RATING_LABELS } from './rating.js';
import { getForexFallback, getCandles, getLatestCandles, mergeCandles, isTiingoSymbol, getTickers, getForex, getNews, SYMBOLS, INTERVALS, TD_SYMBOLS, tdWatchlist, tdQuotes, getTwelveKeys, setTwelveKeys, testTwelveKey, tdPool, isBinanceSymbol, normalizeTDSymbol } from './market.js';
import {
  loadSlots, saveSlots, resolveSlot, activeSlots, detectProvider, testSlot, SLOT_COUNT,
  CLAUDE_MODELS, GEMINI_MODELS, listGeminiModels, saveGeminiModelList, loadGeminiModelList, analyzeChartImage, fileToBase64, aiMarketNews,
} from './ai.js';
import { drawChart, drawMini } from './chart.js';
import { SmartWebSocket, NativeWebSocket, nativeSocketsAvailable } from './nativews.js';
import { openStream, applyTick, applyKline } from './stream.js';
import { getTiingoKey, setTiingoKey, testTiingoKey, tiingoUsage, tiingoTop, toTiingoTicker, parseQuote, probeWebSocket, subscribeMessage, TIINGO_WS } from './tiingo.js';
import { exampleSeries } from './examples.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const num = (v) => (typeof v === 'number' && isFinite(v) ? fmt(v) : esc(v ?? '—'));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const DIR_AR = { BUY: 'شراء', SELL: 'بيع', WAIT: 'انتظار' };
const TYPE_AR = { bullish: 'صاعد', bearish: 'هابط', neutral: 'محايد' };

// ---------------- المظهر والتبويبات ----------------
function initTheme() {
  const t = store.get('taduol.theme', '');
  if (t) document.documentElement.dataset.theme = t;
  $('#themeBtn').onclick = () => {
    const isDark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('taduol.theme', next);
    if (live.candles) renderChart();
    renderLibrary();
  };
}

function initTabs() {
  const open = (name) => {
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
    store.set('taduol.tab', name);
    if (name !== 'markets') stopFxWatch();
    if (name === 'markets' && !markets.loaded) loadMarkets();
    else if (name === 'markets' && getTiingoKey() && !fxWatch.ws) loadTiingoTickers();
    if (name === 'library') renderLibrary();
    if (name === 'live' && live.candles) renderChart();
  };
  $$('.tab').forEach((b) => (b.onclick = () => open(b.dataset.tab)));
  open(store.get('taduol.tab', 'image'));
  return open;
}

function fillSelectors() {
  for (const id of ['#imgInterval', '#liveInterval']) {
    $(id).innerHTML = INTERVALS.map((i) => `<option ${i === '1h' ? 'selected' : ''}>${i}</option>`).join('');
  }
  $('#symbolList').innerHTML = [...SYMBOLS, ...TD_SYMBOLS].map((s) => `<option value="${s.s}">${esc(s.n)}</option>`).join('');
}

function updateKeysBadge() {
  const n = activeSlots().length;
  const b = $('#keysBadge');
  b.textContent = (n ? `${n} مفتاح AI` : 'لا توجد مفاتيح') + (getTiingoKey() ? ' · Tiingo ⚡' : '') + (getTwelveKeys().length ? ` · Twelve Data ×${getTwelveKeys().length}` : '');
  b.classList.toggle('ok', n > 0);
}

// =====================================================================
//  تحليل الصورة
// =====================================================================
const img = { file: null };

function initImage() {
  const dz = $('#dropZone'), input = $('#imageInput');
  const setFile = (f) => {
    if (!f || !f.type.startsWith('image/')) return;
    img.file = f;
    const url = URL.createObjectURL(f);
    $('#preview').src = url; $('#preview').hidden = false; $('#dropHint').hidden = true;
    $('#analyzeImageBtn').disabled = false;
  };
  input.onchange = () => setFile(input.files[0]);
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); setFile(e.dataTransfer.files[0]); });
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
  document.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) { setFile(item.getAsFile()); $$('.tab').find((t) => t.dataset.tab === 'image').click(); }
  });
  $('#analyzeImageBtn').onclick = runImageAnalysis;
}

async function runImageAnalysis() {
  const btn = $('#analyzeImageBtn'), prog = $('#imgProgress');
  if (!img.file) return;
  btn.disabled = true; prog.hidden = false; prog.classList.remove('error');
  const say = (m) => { prog.innerHTML = `<span class="spinner"></span> ${esc(m)}`; };
  try {
    const data = await fileToBase64(img.file);
    let liveContext = '';
    const sym = $('#imgSymbol').value.trim().toUpperCase();
    if (sym) {
      say('جلب بيانات السوق الحية لـ ' + sym + '...');
      try {
        const iv = $('#imgInterval').value;
        const candles = await getCandles(sym, iv, 300, { onWait: (sec) => say(`انتظار ${sec} ثانية لتوفر رصيد Twelve Data...`) });
        const res = analyze(candles);
        liveContext = summaryForAI(res, sym, iv) + '\nأنماط الشموع الأخيرة: ' + res.patterns.map((p) => p.en).join(', ');
      } catch (e) { say('تعذر جلب البيانات الحية (' + e.message + ') — سنحلل الصورة فقط'); }
    }
    say('جاري تحليل الصورة بالذكاء الاصطناعي...');
    const mode = $('input[name="mode"]:checked').value;
    const out = await analyzeChartImage(data, { mode, note: $('#imgNote').value.trim(), liveContext, onProgress: say });
    renderAIResult($('#imgResult'), out);
    prog.hidden = true;
  } catch (e) {
    prog.classList.add('error'); prog.textContent = '❌ ' + e.message;
  } finally { btn.disabled = false; }
}

function renderAIResult(el, { result: r, individual, errors }) {
  el.classList.remove('empty');
  const dec = ['BUY', 'SELL', 'WAIT'].includes(r.decision) ? r.decision : 'WAIT';
  const conf = Math.max(0, Math.min(100, Number(r.confidence) || 0));
  const tps = Array.isArray(r.take_profits) ? r.take_profits : [];
  const rise = r.will_rise || (dec === 'BUY' ? 'نعم' : dec === 'SELL' ? 'لا' : 'غير مؤكد');
  const provider = r._provider === 'consensus' ? `تحليل جماعي (اتفاق ${r._agreement}%)` : `${r._provider === 'claude' ? 'Claude' : 'Gemini'} — ${esc(r._model)}`;
  el.innerHTML = `
    <div class="decision ${dec}">
      <div><div class="word">${DIR_AR[dec]} ${dec === 'BUY' ? '▲' : dec === 'SELL' ? '▼' : '⏸'}</div>
        <div class="small">هل سيصعد السوق؟ <b>${esc(rise)}</b></div></div>
      <div class="meter"><div class="small">الثقة ${conf}%</div><div class="bar"><div class="fill" style="width:${conf}%"></div></div></div>
      <div class="small muted">${esc(r.asset || '')} ${r.timeframe ? '· ' + esc(r.timeframe) : ''}<br>${provider}</div>
    </div>
    <div class="levels">
      <div class="level"><span>نقطة الدخول ${r.entry_type ? '(' + esc(r.entry_type) + ')' : ''}</span><b>${num(r.entry)}</b>
        ${Array.isArray(r.entry_zone) && r.entry_zone.length === 2 ? `<span>منطقة: ${num(r.entry_zone[0])} – ${num(r.entry_zone[1])}</span>` : ''}</div>
      <div class="level sl"><span>وقف الخسارة</span><b>${num(r.stop_loss)}</b></div>
      ${tps.map((t, i) => `<div class="level tp"><span>الهدف ${i + 1}</span><b>${num(t)}</b></div>`).join('')}
      <div class="level"><span>العائد/المخاطرة</span><b>${r.risk_reward ? '1 : ' + num(r.risk_reward) : '—'}</b></div>
    </div>
    ${r.trend ? `<p><b>الاتجاه:</b> <span class="chip ${esc(r.trend.direction)}">${esc(r.trend.direction)}</span> قوة ${esc(r.trend.strength || '')} — ${esc(r.trend.description || '')}</p>` : ''}
    <p>${esc(r.summary || '')}</p>
    ${listChips('🕯️ أنماط الشموع', (r.candlestick_patterns || []).map((p) => ({ t: `${p.name_ar || ''} ${p.name_en ? '(' + p.name_en + ')' : ''}${p.location ? ' — ' + p.location : ''}`, c: p.signal })))}
    ${listChips('📐 النماذج السعرية', (r.chart_patterns || []).map((p) => ({ t: `${p.name}${p.note ? ' — ' + p.note : ''}`, c: p.signal })))}
    ${(r.indicators || []).length ? `<h3>📊 المؤشرات</h3><div class="table-wrap"><table><tbody>${r.indicators.map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.reading)}</td><td class="${i.signal === 'صاعد' ? 'up' : i.signal === 'هابط' ? 'down' : 'flat'}">${esc(i.signal)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <p><b>الدعوم:</b> <span class="up">${(r.support_levels || []).map(num).join(' · ') || '—'}</span><br>
       <b>المقاومات:</b> <span class="down">${(r.resistance_levels || []).map(num).join(' · ') || '—'}</span></p>
    ${r.invalidation ? `<p><b>إلغاء السيناريو:</b> ${esc(r.invalidation)}</p>` : ''}
    ${(r.warnings || []).length ? `<p class="muted small">⚠️ ${r.warnings.map(esc).join('<br>⚠️ ')}</p>` : ''}
    ${individual && individual.length > 1 ? `<details><summary>نتائج كل نموذج (${individual.length})</summary><table><tbody>${individual.map((x) => `<tr><td>خانة ${x._slot} · ${esc(x._model)}</td><td>${DIR_AR[x.decision] || esc(x.decision)}</td><td class="num">${num(x.entry)} / SL ${num(x.stop_loss)}</td><td>${esc(x.confidence)}%</td></tr>`).join('')}</tbody></table></details>` : ''}
    ${errors?.length ? `<p class="muted small">ملاحظات: ${errors.map(esc).join(' | ')}</p>` : ''}`;
}

function listChips(title, items) {
  if (!items.length) return '';
  const cls = (s) => (s === 'صاعد' ? 'bullish' : s === 'هابط' ? 'bearish' : '');
  return `<h3>${title}</h3><div class="chips">${items.map((i) => `<span class="chip ${cls(i.c)}">${esc(i.t)}</span>`).join('')}</div>`;
}

// =====================================================================
//  السوق المباشر
// =====================================================================
const live = { candles: null, res: null, timer: null, symbol: '', interval: '', busy: false, ticks: 0, nextAt: 0, lastPrice: null, mtf: {},
  source: '', stream: null, streamState: '', dirty: false, lastPoll: 0 };
const MTF_FRAMES = ['15m', '1h', '4h', '1d'];
const STREAM_LABEL = { connecting: '🟡 جاري الاتصال بالبث...', live: '🟢 بث مباشر', retry: '🟡 إعادة الاتصال بالبث...', down: '🔴 البث متوقف — تحديث دوري' };

function initLive() {
  $('#liveBtn').onclick = () => loadLive();
  $('#liveSymbol').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadLive(); });
  $('#liveInterval').onchange = () => live.candles && loadLive();
  const sel = $('#refreshEvery');
  sel.value = store.get('taduol.refreshEvery', '10');
  sel.onchange = () => { store.set('taduol.refreshEvery', sel.value); scheduleRefresh(); startStream(); };
  $('#liveAiBtn').onclick = runLiveAI;
  window.addEventListener('resize', () => { if (live.candles && $('#tab-live').classList.contains('active')) renderChart(); });
  // عداد التحديث القادم + رسم حركة البث كل ثانية (خفيف: الشارت والسعر فقط)
  setInterval(() => {
    const el = $('#nextTick');
    if (live.dirty && live.candles && !document.hidden) { live.dirty = false; renderChart(); renderPriceLine(); }
    if (!live.timer || !live.nextAt) { el.textContent = ''; return; }
    const s = Math.max(0, Math.ceil((live.nextAt - Date.now()) / 1000));
    el.textContent = document.hidden ? '⏸ متوقف أثناء إخفاء الصفحة' : `🔄 إعادة التحليل بعد ${s}ث`;
  }, 1000);
}

const refreshSeconds = () => +($('#refreshEvery').value || 0);

function scheduleRefresh() {
  clearInterval(live.timer); live.timer = null; live.nextAt = 0;
  const sec = refreshSeconds();
  if (!sec || !live.candles) { renderBudget(); return; }
  live.nextAt = Date.now() + sec * 1000;
  live.timer = setInterval(() => { live.nextAt = Date.now() + sec * 1000; tickLive(); }, sec * 1000);
  renderBudget();
}

/** مصدر البث المناسب للرمز الحالي */
function streamSourceFor(sym) {
  if (isBinanceSymbol(sym)) return 'binance';
  if (getTiingoKey() && isTiingoSymbol(sym)) return 'tiingo';
  return null;
}

function startStream() {
  live.stream?.stop(); live.stream = null; live.streamState = '';
  const src = live.symbol && refreshSeconds() ? streamSourceFor(live.symbol) : null;
  if (!src) { renderPriceLine(); return; }
  const sym = live.symbol, iv = live.interval;
  live.stream = openStream({
    symbol: sym, interval: iv, source: src, key: getTiingoKey(),
    refPrice: () => live.candles?.[live.candles.length - 1]?.c,
    onStatus: (s) => { live.streamState = s; renderPriceLine(); renderBudget(); },
    onKline: (k) => { if (live.symbol === sym && live.interval === iv) { live.candles = applyKline(live.candles, k); live.dirty = true; } },
    onTick: (q) => { if (live.symbol === sym && live.interval === iv) { live.candles = applyTick(live.candles, q.price, q.t, iv); live.dirty = true; } },
  });
}

/** تحميل كامل: 300 شمعة + تحليل + الفريمات المتعددة */
async function loadLive() {
  const raw = $('#liveSymbol').value.trim().toUpperCase();
  const sym = isBinanceSymbol(raw) ? raw : normalizeTDSymbol(raw);
  const iv = $('#liveInterval').value;
  const st = $('#liveStatus');
  st.innerHTML = '<span class="spinner"></span> جاري جلب البيانات...';
  live.busy = true;
  try {
    const candles = await getCandles(sym, iv, 300, { onWait: (sec) => { st.innerHTML = `<span class="spinner"></span> تم استهلاك رصيد الدقيقة — انتظار ${sec} ثانية ثم المتابعة تلقائياً...`; } });
    const changed = sym !== live.symbol;
    live.candles = candles; live.symbol = sym; live.interval = iv; live.lastPrice = null; live.ticks = 0;
    live.source = candles.source || ''; live.sourceNote = candles.note || ''; live.lastPoll = Date.now();
    if (changed) live.mtf = {};
    renderAll();
    scheduleRefresh();
    startStream();
    // الفريمات المتعددة: تلقائياً لـ Binance، وبالزر فقط للفوركس (لتوفير الرصيد)
    if (isBinanceSymbol(sym)) loadMTF(false); else renderMTF();
  } catch (e) {
    st.innerHTML = `<span class="down">❌ ${esc(e.message)}</span> — ${isBinanceSymbol(sym) ? 'تأكد أن الرمز صحيح على Binance (مثل BTCUSDT).' : 'للفوركس والذهب استخدم صيغة مثل EUR/USD أو XAU/USD.'}`;
  } finally { live.busy = false; }
}

/** كل 10 ثوانٍ: إعادة التحليل. مع البث المباشر لا نحتاج أي طلب؛ بدونه نجلب آخر 3 شموع */
async function tickLive() {
  if (live.busy || !live.candles || document.hidden) return;
  live.busy = true;
  try {
    const streaming = live.stream && live.streamState === 'live';
    if (!streaming) {
      // Tiingo حده 50 طلب/ساعة: بدون بث نحدّث من Twelve Data إن وُجد، وإلا من Tiingo كل 90 ثانية
      const viaTD = live.source === 'Tiingo' && getTwelveKeys().length > 0;
      const minGap = live.source === 'Tiingo' && !viaTD ? 90000 : 0;
      if (Date.now() - live.lastPoll >= minGap) {
        const fresh = await getLatestCandles(live.symbol, live.interval, 3, viaTD ? { provider: 'td' } : {});
        live.candles = mergeCandles(live.candles, fresh, 300);
        live.lastPoll = Date.now();
      }
    }
    live.ticks++;
    renderAll(true);
    if (isBinanceSymbol(live.symbol) && live.ticks % Math.max(1, Math.round(60 / refreshSeconds())) === 0) loadMTF(false);
  } catch (e) {
    $('#liveStatus').innerHTML = `<span class="down">⚠️ تعذر التحديث: ${esc(e.message)}</span> — سنحاول مرة أخرى`;
  } finally { live.busy = false; }
}

function renderAll(isTick = false) {
  const candles = live.candles;
  live.res = analyze(candles);
  live.recentPatterns = detectPatterns(candles, { lookback: 30 });
  if (live.mtf) live.mtf[live.interval] = { rating: live.res.rating, at: Date.now() };
  renderChart(); renderPlan(); renderRating(); renderSignals(); renderPatterns(); renderLevels(); renderMTF();
  live.lastRenderAt = Date.now(); live.isTick = isTick;
  renderPriceLine();
  renderBudget();
}

/** سطر السعر والمصدر وحالة البث */
function renderPriceLine() {
  if (!live.candles) return;
  const price = live.candles[live.candles.length - 1].c;
  const dir = live.lastPrice == null ? '' : price > live.lastPrice ? 'up' : price < live.lastPrice ? 'down' : '';
  if (price !== live.lastPrice) live.lastDir = dir || live.lastDir;
  live.lastPrice = price;
  const d = live.lastDir || '';
  const src = streamSourceFor(live.symbol);
  const streamTxt = live.stream ? ` · ${STREAM_LABEL[live.streamState] || ''}${src === 'tiingo' && live.source !== 'Tiingo' ? ' (Tiingo)' : ''}` : '';
  $('#liveStatus').innerHTML = `<b class="price-tick ${d}">${esc(live.symbol)} ${fmt(price)} ${d === 'up' ? '▲' : d === 'down' ? '▼' : ''}</b> · ${esc(live.interval)} · الشموع من: ${esc(live.source || '—')}${streamTxt} · آخر تحليل ${new Date(live.lastRenderAt || Date.now()).toLocaleTimeString('ar-EG')}${live.sourceNote ? ` <span class="muted">(${esc(live.sourceNote)})</span>` : ''}`;
}

/** شرح تكلفة التحديث حسب المصدر */
function renderBudget() {
  const box = $('#refreshNote');
  const sec = refreshSeconds();
  if (!live.symbol || !sec) { box.textContent = ''; return; }
  const src = streamSourceFor(live.symbol);
  if (src && live.streamState === 'live') {
    box.innerHTML = `البث المباشر يعمل: الشمعة تتحرك لحظياً، والتحليل يُعاد كل ${sec} ثوانٍ — <b>بدون استهلاك أي طلبات</b>.`;
    return;
  }
  if (isBinanceSymbol(live.symbol)) { box.textContent = `Binance: التحديث كل ${sec} ثوانٍ مجاني وبلا حد يومي.`; return; }
  if (live.source === 'Tiingo') {
    const u = tiingoUsage();
    box.innerHTML = `Tiingo: بدون البث نحدّث كل 90 ثانية لحماية الحد (${u.hour}/${u.perHour} هذه الساعة · ${u.day}/${u.perDay} اليوم).`;
    return;
  }
  const left = tdPool.remainingToday();
  const perHour = Math.round(3600 / sec);
  const hours = perHour ? left / perHour : 0;
  box.innerHTML = `Twelve Data: كل تحديث = طلب واحد (${perHour} طلب/ساعة). المتبقي اليوم لكل مفاتيحك: <b>${left}</b> طلب ≈ <b>${hours >= 1 ? hours.toFixed(1) + ' ساعة' : Math.round(hours * 60) + ' دقيقة'}</b> بهذا المعدل.${hours < 1 ? ' <span class="down">اختر 30 أو 60 ثانية لتوفير الرصيد.</span>' : ''}${getTiingoKey() ? '' : ' 💡 أضف مفتاح Tiingo للبث المباشر المجاني.'}`;
}

/** التقييم على عدة فريمات */
async function loadMTF(manual) {
  const sym = live.symbol;
  const frames = MTF_FRAMES.filter((f) => f !== live.interval);
  if (!isBinanceSymbol(sym) && manual) $('#mtfBox').insertAdjacentHTML('beforeend', '<p class="muted small" id="mtfWait"><span class="spinner"></span> جاري حساب الفريمات (طلب لكل فريم)...</p>');
  await Promise.all(frames.map(async (f) => {
    try {
      const c = await getCandles(sym, f, 300, { ttl: 55000 });
      if (sym !== live.symbol) return;
      live.mtf[f] = { rating: technicalRating(c, computeAll(c)), at: Date.now() };
    } catch (e) { live.mtf[f] = { error: e.message, at: Date.now() }; }
  }));
  if (sym === live.symbol) renderMTF();
}

function gaugeHTML(score, label, size = 'big') {
  const pct = Math.round(((Math.max(-1, Math.min(1, score)) + 1) / 2) * 100);
  const L = RATING_LABELS[label];
  return `<div class="gauge ${size}">
    <div class="gauge-word ${L.cls}">${L.ar}</div>
    <div class="gauge-track"><i style="inset-inline-start:${pct}%"></i></div>
    <div class="gauge-scale"><span>بيع قوي</span><span>بيع</span><span>محايد</span><span>شراء</span><span>شراء قوي</span></div>
  </div>`;
}

function renderRating() {
  const r = live.res.rating;
  const cnt = (s) => `<span class="down">بيع ${s.sell}</span> · <span class="flat">محايد ${s.neutral}</span> · <span class="up">شراء ${s.buy}</span>`;
  const row = (x) => `<tr><td>${esc(x.name)}</td><td class="num">${x.value == null ? '—' : fmt(x.value)}</td><td class="${x.vote > 0 ? 'up' : x.vote < 0 ? 'down' : 'flat'}">${x.vote == null ? '—' : x.vote > 0 ? 'شراء' : x.vote < 0 ? 'بيع' : 'محايد'}</td></tr>`;
  $('#ratingBox').innerHTML = `
    <div class="rating-grid">
      <div class="rating-main">
        <h3>📊 قراءة السوق — ${esc(live.symbol)} · ${esc(live.interval)}</h3>
        ${gaugeHTML(r.overall, r.label)}
        <p class="small">${r.counts.buy + r.counts.sell + r.counts.neutral} مؤشراً: ${cnt(r.counts)}</p>
        <p class="small">${live.res.direction === 'BUY' ? '📈 السوق يميل للصعود' : live.res.direction === 'SELL' ? '📉 السوق يميل للهبوط' : '↔️ السوق متذبذب بلا اتجاه واضح'} — قوة الترند (ADX): ${esc(live.res.trendStrength)}</p>
      </div>
      <div class="rating-part"><h4>المتوسطات المتحركة (${r.ma.items.length})</h4>${gaugeHTML(r.ma.score, r.ma.label, 'small')}<p class="small">${cnt(r.ma)}</p></div>
      <div class="rating-part"><h4>المذبذبات (${r.osc.items.length})</h4>${gaugeHTML(r.osc.score, r.osc.label, 'small')}<p class="small">${cnt(r.osc)}</p></div>
    </div>
    <details><summary>تفاصيل كل المؤشرات</summary>
      <div class="grid-2 tight">
        <div class="table-wrap"><table><thead><tr><th>المتوسط</th><th>القيمة</th><th>الإشارة</th></tr></thead><tbody>${r.ma.items.map(row).join('')}</tbody></table></div>
        <div class="table-wrap"><table><thead><tr><th>المذبذب</th><th>القيمة</th><th>الإشارة</th></tr></thead><tbody>${r.osc.items.map(row).join('')}</tbody></table></div>
      </div>
    </details>`;
}

function renderMTF() {
  const box = $('#mtfBox');
  if (!live.symbol) { box.innerHTML = ''; return; }
  const frames = [...new Set([...MTF_FRAMES, live.interval])].sort((a, b) => INTERVALS.indexOf(a) - INTERVALS.indexOf(b));
  const cells = frames.map((f) => {
    const m = live.mtf[f];
    const cur = f === live.interval ? ' current' : '';
    if (!m) return `<div class="mtf${cur}"><b>${f}</b><span class="muted small">${isBinanceSymbol(live.symbol) ? '<span class="spinner"></span>' : '—'}</span></div>`;
    if (m.error) return `<div class="mtf${cur}"><b>${f}</b><span class="down small">خطأ</span></div>`;
    const L = RATING_LABELS[m.rating.label];
    return `<div class="mtf${cur}"><b>${f}</b><span class="${L.cls}">${L.ar}</span><span class="muted small">${m.rating.counts.buy}↑ ${m.rating.counts.sell}↓</span></div>`;
  }).join('');
  const ratings = frames.map((f) => live.mtf[f]?.rating?.overall).filter((x) => x != null);
  const agree = ratings.length > 1 && (ratings.every((x) => x > 0.1) || ratings.every((x) => x < -0.1));
  box.innerHTML = `<h4>الاتجاه على عدة فريمات</h4><div class="mtf-row">${cells}</div>
    <p class="small ${agree ? (ratings[0] > 0 ? 'up' : 'down') : 'muted'}">${agree ? '✅ كل الفريمات متفقة — إشارة أقوى' : ratings.length > 1 ? '⚠️ الفريمات غير متفقة — كن حذراً' : ''}</p>
    ${!isBinanceSymbol(live.symbol) ? '<button class="btn small-btn" id="mtfBtn2">حساب الفريمات (يستهلك ' + (frames.length - 1) + ' طلبات)</button>' : ''}`;
  const b2 = $('#mtfBtn2'); if (b2) b2.onclick = () => loadMTF(true);
}

function renderChart() {
  drawChart($('#chart'), live.candles, live.res, { visible: window.innerWidth < 600 ? 60 : 110, patterns: live.recentPatterns });
}

function renderPlan() {
  const r = live.res;
  const conf = r.confidence;
  $('#tradePlan').innerHTML = `
    <h3>خطة التداول — ${esc(live.symbol)}</h3>
    <div class="decision ${r.direction}">
      <div><div class="word">${DIR_AR[r.direction]}</div><div class="small">الميل: ${r.bias} · الترند: ${r.trendStrength}</div></div>
      <div class="meter"><div class="small">الثقة ${conf}%</div><div class="bar"><div class="fill" style="width:${conf}%"></div></div></div>
    </div>
    <p class="small">هل سيصعد السوق؟ <b>${r.direction === 'BUY' ? 'نعم — الأرجح صعود' : r.direction === 'SELL' ? 'لا — الأرجح هبوط' : 'غير واضح — الأفضل الانتظار'}</b></p>
    <div class="levels">
      <div class="level"><span>الدخول</span><b>${fmt(r.entry)}</b></div>
      <div class="level sl"><span>وقف الخسارة</span><b>${fmt(r.stopLoss)}</b></div>
      ${r.targets.map((t, i) => `<div class="level tp"><span>الهدف ${i + 1}</span><b>${fmt(t)}</b></div>`).join('')}
      <div class="level"><span>العائد/المخاطرة (هدف1)</span><b>1 : ${r.riskReward}</b></div>
    </div>
    ${r.direction === 'WAIT' ? '<p class="small muted">المستويات أعلاه للسيناريو الصاعد كمرجع فقط. الإشارات متضاربة — انتظر تأكيداً.</p>' : ''}
    <p class="small muted">ATR: ${fmt(r.atr)} · النتيجة الموزونة: ${r.score}</p>`;
}

function renderSignals() {
  $('#signalsTable').innerHTML = `<table><thead><tr><th>المؤشر</th><th>القيمة</th><th>الإشارة</th></tr></thead><tbody>${
    live.res.signals.map((s) => `<tr><td>${esc(s.name)}</td><td class="num">${esc(s.value)}</td><td class="${s.raw > 0 ? 'up' : s.raw < 0 ? 'down' : 'flat'}">${s.raw > 0 ? '▲' : s.raw < 0 ? '▼' : '●'} ${esc(s.note)}</td></tr>`).join('')
  }</tbody></table>`;
}

function renderPatterns() {
  const list = live.recentPatterns.slice().reverse();
  const n = live.candles.length;
  $('#patternsList').innerHTML = list.length
    ? `<div class="table-wrap"><table><tbody>${list.map((p) => `<tr><td>${n - 1 - p.index === 0 ? 'الشمعة الحالية' : 'قبل ' + (n - 1 - p.index) + ' شمعة'}</td><td><b>${esc(p.ar)}</b><br><span class="muted small">${esc(p.en)}</span></td><td class="${p.type === 'bullish' ? 'up' : p.type === 'bearish' ? 'down' : 'flat'}">${TYPE_AR[p.type]}</td><td>${'★'.repeat(p.reliability)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">لا توجد أنماط واضحة في آخر 30 شمعة.</p>';
}

function renderLevels() {
  const r = live.res, price = r.price;
  $('#levelsBox').innerHTML = `
    <div class="chips">${r.levels.map((l) => `<span class="chip ${l.price > price ? 'bearish' : 'bullish'}">${l.price > price ? 'مقاومة' : 'دعم'} ${fmt(l.price)} (${l.touches}×)</span>`).join('')}</div>
    <div class="table-wrap"><table><thead><tr><th>فيبوناتشي (${r.fib.direction === 'up' ? 'حركة صاعدة' : 'حركة هابطة'})</th><th>السعر</th></tr></thead><tbody>
      ${r.fib.levels.map((l) => `<tr><td>${(l.ratio * 100).toFixed(1)}%</td><td class="num">${fmt(l.price)}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted">نقاط الارتكاز: ${Object.entries(r.pivots).map(([k, v]) => `${k} ${fmt(v)}`).join(' · ')}</p>`;
}

async function runLiveAI() {
  if (!live.candles) { await loadLive(); if (!live.candles) return; }
  const card = $('#liveAiCard'), box = $('#liveAi');
  card.hidden = false; box.innerHTML = '<div class="progress"><span class="spinner"></span> جاري إرسال الشارت والمؤشرات للذكاء الاصطناعي...</div>';
  try {
    const canvas = $('#chart');
    const url = canvas.toDataURL('image/png');
    const data = { data: url.slice(url.indexOf(',') + 1), mime: 'image/png' };
    const ctx = summaryForAI(live.res, live.symbol, live.interval) +
      '\nأنماط الشموع (آخر 30 شمعة): ' + live.recentPatterns.map((p) => `${p.en}@-${live.candles.length - 1 - p.index}`).join(', ') +
      '\nآخر 30 شمعة (o,h,l,c): ' + live.candles.slice(-30).map((k) => `${fmt(k.o)},${fmt(k.h)},${fmt(k.l)},${fmt(k.c)}`).join(' | ');
    const mode = activeSlots().length > 1 ? $('input[name="mode"]:checked').value : 'failover';
    const out = await analyzeChartImage(data, { mode, liveContext: ctx, note: `الأصل ${live.symbol} على فريم ${live.interval}. الأسعار المرسومة على يمين الشارت حقيقية.`, onProgress: (m) => { box.innerHTML = `<div class="progress"><span class="spinner"></span> ${esc(m)}</div>`; } });
    renderAIResult(box, out);
  } catch (e) {
    box.innerHTML = `<div class="progress error">❌ ${esc(e.message)}</div>`;
  }
}

// =====================================================================
//  الأسواق والأخبار
// =====================================================================
const markets = { loaded: false };

function initMarkets() {
  $('#refreshMarkets').onclick = loadMarkets;
  $('#aiNewsBtn').onclick = runAINews;
  // أسعار العملات الرقمية تتحدث كل 10 ثوانٍ أثناء فتح صفحة الأسواق (Binance مجاني)
  setInterval(() => {
    if (markets.loaded && !document.hidden && $('#tab-markets').classList.contains('active')) loadCryptoTickers(true);
  }, 10000);
}

async function loadMarkets() {
  markets.loaded = true;
  $('#forex').innerHTML = '<span class="spinner"></span>';
  $('#news').innerHTML = '<span class="spinner"></span>';
  loadCryptoTickers(false);
  loadTDTickers();
  loadForexAndNews();
}

function loadCryptoTickers(silent) {
  if (!silent) $('#tickers').innerHTML = '<span class="spinner"></span>';
  return getTickers().then((rows) => {
    const names = Object.fromEntries(SYMBOLS.map((s) => [s.s, s.n]));
    $('#tickers').innerHTML = rows.map((t) => `
      <div class="ticker" data-sym="${esc(t.symbol)}" title="اضغط للتحليل">
        <div class="sym">${esc(t.symbol)}</div><div class="name">${esc(names[t.symbol] || '')}</div>
        <div class="price">${fmt(t.price)}</div>
        <div class="${t.change >= 0 ? 'up' : 'down'}">${t.change >= 0 ? '▲ ارتفع' : '▼ انخفض'} ${Math.abs(t.change).toFixed(2)}%</div>
      </div>`).join('') || '<p class="muted">لا توجد بيانات</p>';
    $$('.ticker').forEach((el) => (el.onclick = () => { $('#liveSymbol').value = el.dataset.sym; $$('.tab').find((t) => t.dataset.tab === 'live').click(); loadLive(); }));
  }).catch((e) => { if (!silent) $('#tickers').innerHTML = `<p class="down">❌ ${esc(e.message)}</p>`; });
}

function loadForexAndNews() {
  getForex().then((fx) => {
    $('#forex').innerHTML = `<table><thead><tr><th>العملة</th><th>مقابل 1$</th><th>التغير</th></tr></thead><tbody>${
      fx.rows.map((r) => `<tr><td><b>${r.code}</b> ${esc(r.name)}</td><td class="num">${r.perUsd.toFixed(4)}</td><td class="${r.change > 0 ? 'up' : r.change < 0 ? 'down' : 'flat'}">${r.change > 0 ? '▲ ارتفعت' : r.change < 0 ? '▼ انخفضت' : '● ثابتة'} ${Math.abs(r.change).toFixed(2)}%</td></tr>`).join('')
    }</tbody></table><p class="small muted">تاريخ آخر تحديث: ${esc(fx.date)} · المصدر: ${esc(fx.source || '')}</p>`;
  }).catch((e) => { $('#forex').innerHTML = `<p class="down">❌ ${esc(e.message)}</p>`; });

  getNews().then((items) => {
    $('#news').innerHTML = items.map((n) => `
      <div class="news-item"><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>
      <div class="small muted">${esc(n.source)} · ${n.time ? new Date(n.time).toLocaleString('ar-EG') : ''}</div></div>`).join('');
  }).catch((e) => { $('#news').innerHTML = `<p class="muted">${esc(e.message)}</p>`; });
}

// ---- قائمة الفوركس عبر بث Tiingo المباشر ----
const fxWatch = { ws: null, base: {}, last: {} };
function stopFxWatch() { try { fxWatch.ws?.close(); } catch { /* ignore */ } fxWatch.ws = null; }

function loadTiingoTickers() {
  const box = $('#tdTickers');
  const syms = tdWatchlist(2);
  const names = Object.fromEntries(TD_SYMBOLS.map((x) => [x.s, x.n]));
  const byTicker = Object.fromEntries(syms.map((s) => [toTiingoTicker(s), s]));
  box.innerHTML = syms.map((s) => `
    <div class="ticker" data-sym="${esc(s)}" data-tk="${toTiingoTicker(s)}" title="اضغط للتحليل">
      <div class="sym">${esc(s)}</div><div class="name">${esc(names[s] || '')}</div>
      <div class="price">—</div><div class="chg muted small">في انتظار البث...</div>
    </div>`).join('') + '<p class="muted small" style="grid-column:1/-1">⚡ بث Tiingo المباشر — التغير محسوب منذ فتح الصفحة.</p>';
  $$('.ticker', box).forEach((el) => (el.onclick = () => { $('#liveSymbol').value = el.dataset.sym; $$('.tab').find((t) => t.dataset.tab === 'live').click(); loadLive(); }));
  const show = (tk, price) => {
    const el = $(`.ticker[data-tk="${tk}"]`, box); if (!el) return;
    if (fxWatch.base[tk] == null) fxWatch.base[tk] = price;
    const prev = fxWatch.last[tk]; fxWatch.last[tk] = price;
    const ch = ((price - fxWatch.base[tk]) / fxWatch.base[tk]) * 100;
    $('.price', el).textContent = fmt(price);
    $('.price', el).className = 'price ' + (prev == null ? '' : price > prev ? 'up' : price < prev ? 'down' : '');
    $('.chg', el).className = 'chg small ' + (ch > 0 ? 'up' : ch < 0 ? 'down' : 'flat');
    $('.chg', el).textContent = `${ch > 0 ? '▲' : ch < 0 ? '▼' : '●'} ${Math.abs(ch).toFixed(3)}%`;
  };
  // سعر أولي بطلب واحد (يعمل داخل تطبيق Android؛ في المتصفح ننتظر البث)
  tiingoTop(syms).then((rows) => rows.forEach((r) => show(r.ticker, r.mid))).catch(() => {});
  stopFxWatch();
  try {
    const ws = new SmartWebSocket('wss://api.tiingo.com/fx');
    fxWatch.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ eventName: 'subscribe', authorization: getTiingoKey(), eventData: { thresholdLevel: 5, tickers: Object.keys(byTicker) } }));
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.messageType === 'E' || m.response?.code >= 400) { box.insertAdjacentHTML('beforeend', '<p class="down small" style="grid-column:1/-1">مفتاح Tiingo مرفوض — تحقق منه في صفحة المفاتيح</p>'); stopFxWatch(); return; }
      const q = parseQuote(m, (tk) => fxWatch.last[tk]);
      if (q && byTicker[q.ticker]) show(q.ticker, q.price);
    };
  } catch { /* لا يوجد WebSocket */ }
}

function loadTDTickers() {
  const box = $('#tdTickers');
  if (getTiingoKey()) return loadTiingoTickers();
  if (!getTwelveKeys().length) { box.innerHTML = '<p class="muted small">أضف مفتاح Twelve Data في صفحة "المفاتيح" لعرض أسعار الفوركس والذهب لحظياً.</p>'; return; }
  box.innerHTML = '<span class="spinner"></span>';
  const names = Object.fromEntries(TD_SYMBOLS.map((x) => [x.s, x.n]));
  tdQuotes(tdWatchlist(), { onWait: (sec) => { box.innerHTML = `<p class="muted small"><span class="spinner"></span> انتظار ${sec} ثانية لتوفر الرصيد...</p>`; } }).then((rows) => {
    box.innerHTML = rows.map((t) => `
      <div class="ticker" data-sym="${esc(t.symbol)}" title="اضغط للتحليل">
        <div class="sym">${esc(t.symbol)}</div><div class="name">${esc(names[t.symbol] || t.name || '')}${t.closed ? ' · السوق مغلق' : ''}</div>
        <div class="price">${fmt(t.price)}</div>
        <div class="${t.change >= 0 ? 'up' : 'down'}">${t.change >= 0 ? '▲ ارتفع' : '▼ انخفض'} ${Math.abs(t.change).toFixed(2)}%</div>
      </div>`).join('') || '<p class="muted">لا توجد بيانات</p>';
    $$('.ticker', box).forEach((el) => (el.onclick = () => { $('#liveSymbol').value = el.dataset.sym; $$('.tab').find((t) => t.dataset.tab === 'live').click(); loadLive(); }));
  }).catch((e) => { box.innerHTML = `<p class="down">❌ ${esc(e.message)}</p>`; });
}

async function runAINews() {
  const box = $('#aiNews');
  box.innerHTML = '<div class="progress"><span class="spinner"></span> الذكاء الاصطناعي يبحث في الأخبار الآن...</div>';
  try {
    const n = await aiMarketNews();
    const mood = n.market_mood === 'إيجابي' ? 'up' : n.market_mood === 'سلبي' ? 'down' : 'flat';
    box.innerHTML = `
      <div class="news-item"><b>مزاج السوق: <span class="${mood}">${esc(n.market_mood)}</span></b> <span class="muted small">${esc(n.date || '')}</span><p>${esc(n.summary)}</p></div>
      ${(n.assets || []).length ? `<table><tbody>${n.assets.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td class="${a.direction === 'ارتفع' ? 'up' : a.direction === 'انخفض' ? 'down' : 'flat'}">${esc(a.direction)} ${esc(a.change || '')}</td><td class="small">${esc(a.reason)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${(n.upcoming_events || []).length ? `<h3>أحداث قادمة</h3><ul>${n.upcoming_events.map((e) => `<li><b>${esc(e.event)}</b> ${esc(e.time || '')} — ${esc(e.expected_impact || '')}</li>`).join('')}</ul>` : ''}
      ${(n.headlines || []).length ? `<h3>عناوين</h3><ul>${n.headlines.map((h) => `<li class="${h.impact === 'إيجابي' ? 'up' : h.impact === 'سلبي' ? 'down' : ''}">${/^https?:\/\//.test(h.url || '') ? `<a href="${esc(h.url)}" target="_blank" rel="noopener noreferrer">${esc(h.title)}</a>` : esc(h.title)} <span class="muted small">${esc(h.source || '')}</span></li>`).join('')}</ul>` : ''}
      <p class="small muted">بواسطة ${n._provider === 'claude' ? 'Claude' : 'Gemini'} — ${esc(n._model)}</p>`;
  } catch (e) {
    box.innerHTML = `<div class="progress error">❌ ${esc(e.message)}</div>`;
  }
}

// =====================================================================
//  مكتبة الشموع
// =====================================================================
function initLibrary() {
  ['#libSearch', '#libType', '#libCandles'].forEach((s) => $(s).addEventListener('input', renderLibrary));
  $('#libCount').textContent = `${PATTERNS.length} نمط`;
}

function renderLibrary() {
  if (!$('#tab-library').classList.contains('active')) return;
  const q = $('#libSearch').value.trim().toLowerCase();
  const t = $('#libType').value, n = $('#libCandles').value;
  const list = PATTERNS.filter((p) =>
    (!q || p.ar.includes(q) || p.en.toLowerCase().includes(q) || p.desc.includes(q)) &&
    (!t || p.type === t) && (!n || (n === '4' ? p.candles >= 4 : p.candles === +n)));
  $('#library').innerHTML = list.map((p) => `
    <div class="lib-card">
      ${exampleSeries(p.id) ? `<canvas data-ex="${p.id}"></canvas>` : ''}
      <b>${esc(p.ar)}</b>
      <div class="en">${esc(p.en)}</div>
      <div class="chips"><span class="chip ${p.type}">${TYPE_AR[p.type]}</span>
        <span class="chip">${p.kind === 'reversal' ? 'انعكاسي' : p.kind === 'continuation' ? 'استمراري' : 'تردد'}</span>
        <span class="chip">${p.candles} ${p.candles === 1 ? 'شمعة' : 'شموع'}</span>
        <span class="chip stars">${'★'.repeat(p.reliability)}${'☆'.repeat(3 - p.reliability)}</span></div>
      <p>${esc(p.desc)}</p>
    </div>`).join('') || '<p class="muted">لا توجد نتائج</p>';
  $$('canvas[data-ex]').forEach((cv) => {
    const series = exampleSeries(cv.dataset.ex);
    const pc = PATTERN_MAP[cv.dataset.ex].candles;
    drawMini(cv, series.slice(-(pc + 4)));
  });
}

// =====================================================================
//  المفاتيح
// =====================================================================
function initKeys() {
  const slots = loadSlots();
  // قائمة Gemini: المجلوبة من Google إن وُجدت، وإلا القائمة الافتراضية
  const geminiList = () => {
    const fetched = loadGeminiModelList();
    if (!fetched) return GEMINI_MODELS;
    return fetched.models.map((m) => ({ ...m, label: `${m.label} — ${m.id}${m.thinking ? ' 🧠' : ''}` }));
  };
  const modelOptions = (prov, cur) => {
    const list = prov === 'claude' ? CLAUDE_MODELS : prov === 'gemini' ? geminiList() : [...CLAUDE_MODELS, ...geminiList()];
    const known = list.some((m) => m.id === cur);
    return `<option value="">تلقائي (الافتراضي)</option>${list.map((m) => `<option value="${esc(m.id)}" ${m.id === cur ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}${cur && !known ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : ''}<option value="__custom">✏️ اسم موديل مخصص...</option>`;
  };
  const provOf = (el) => ($('.s-provider', el).value === 'auto' ? detectProvider($('.s-key', el).value) : $('.s-provider', el).value);
  // وصف النموذج المختار (من القائمة المجلوبة)
  const modelInfo = (el) => {
    const box = $('.s-model-info', el);
    const m = provOf(el) === 'gemini' && (loadGeminiModelList()?.models || []).find((x) => x.id === $('.s-model', el).value);
    box.textContent = m ? [m.description, m.input ? `مدخلات حتى ${m.input.toLocaleString('en')} توكن` : '', m.output ? `مخرجات حتى ${m.output.toLocaleString('en')}` : ''].filter(Boolean).join(' · ') : '';
  };
  $('#slots').innerHTML = slots.map((s, i) => `
    <div class="slot" data-i="${i}">
      <h4>الخانة ${i + 1} <label class="check"><input type="checkbox" class="s-enabled" ${s.enabled ? 'checked' : ''}/> مفعّل</label></h4>
      <label>المزود
        <select class="s-provider">
          <option value="auto" ${s.provider === 'auto' ? 'selected' : ''}>تلقائي من شكل المفتاح</option>
          <option value="gemini" ${s.provider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
          <option value="claude" ${s.provider === 'claude' ? 'selected' : ''}>Anthropic Claude</option>
        </select></label>
      <label>مفتاح API
        <div class="key-row"><input class="s-key" type="password" autocomplete="off" spellcheck="false" dir="ltr" value="${esc(s.key)}" placeholder="AIza... أو sk-ant-..." />
        <button class="btn s-show" type="button" title="إظهار/إخفاء">👁</button></div></label>
      <label>الموديل <select class="s-model">${modelOptions(s.provider === 'auto' ? detectProvider(s.key) : s.provider, s.model)}</select></label>
      <div class="s-model-info small muted"></div>
      <div class="key-row"><button class="btn s-test" type="button">🧪 اختبار</button>
        <button class="btn s-fetch" type="button" hidden>📋 جلب كل نماذج Gemini</button></div>
      <div class="status muted"></div>
    </div>`).join('');

  $$('.slot[data-i]').forEach((el) => {
    const refreshModels = () => {
      const prov = $('.s-provider', el).value;
      const p = prov === 'auto' ? detectProvider($('.s-key', el).value) : prov;
      $('.s-model', el).innerHTML = modelOptions(p, $('.s-model', el).value);
      $('.s-fetch', el).hidden = p !== 'gemini';
      modelInfo(el);
      const st = $('.status', el);
      if ($('.s-key', el).value.trim() && prov === 'auto') st.textContent = p ? `تم التعرف: ${p === 'claude' ? 'Claude' : 'Gemini'}` : 'نوع غير معروف — اختر المزود';
    };
    $('.s-provider', el).onchange = refreshModels;
    $('.s-key', el).oninput = refreshModels;
    $('.s-model', el).onchange = (e) => {
      if (e.target.value === '__custom') {
        const v = prompt('اكتب اسم الموديل بالضبط (مثل gemini-2.5-pro أو claude-opus-5-5):');
        e.target.innerHTML = modelOptions(provOf(el), (v || '').trim());
      }
      modelInfo(el);
    };
    $('.s-fetch', el).hidden = provOf(el) !== 'gemini';
    modelInfo(el);
    $('.s-fetch', el).onclick = async () => {
      const st = $('.status', el), btn = $('.s-fetch', el);
      btn.disabled = true;
      st.innerHTML = '<span class="spinner"></span> جاري جلب النماذج من Google...';
      try {
        const models = await listGeminiModels($('.s-key', el).value);
        if (!models.length) throw new Error('لم يُرجع Google أي نموذج يدعم توليد المحتوى لهذا المفتاح');
        saveGeminiModelList(models);
        // تحديث قوائم كل خانات Gemini مع الحفاظ على اختيار كل خانة
        $$('.slot[data-i]').forEach((x) => {
          if (provOf(x) === 'gemini') { $('.s-model', x).innerHTML = modelOptions('gemini', $('.s-model', x).value); modelInfo(x); }
        });
        st.innerHTML = `<span class="up">✓ تم جلب ${models.length} نموذج — اختر من قائمة "الموديل" ثم احفظ</span>`;
        $('.s-model', el).focus();
      } catch (e) {
        st.innerHTML = `<span class="down">${esc(e.message)}</span>`;
      } finally { btn.disabled = false; }
    };
    $('.s-show', el).onclick = () => { const k = $('.s-key', el); k.type = k.type === 'password' ? 'text' : 'password'; };
    $('.s-test', el).onclick = async () => {
      const st = $('.status', el);
      st.innerHTML = '<span class="spinner"></span>';
      try { st.innerHTML = `<span class="up">${esc(await testSlot(readSlot(el)))}</span>`; }
      catch (e) { st.innerHTML = `<span class="down">${esc(e.message)}</span>`; }
    };
  });

  $('#diagBtn').onclick = runDiagnostics;
  $('#diagCopy').onclick = () => {
    const txt = diagText();
    (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => { $('#diagCopy').textContent = '✓ تم النسخ'; }).catch(() => prompt('انسخ النتيجة:', txt));
  };

  // ---- Tiingo ----
  $('#tiingoKey').value = getTiingoKey();
  $('#tiingoShow').onclick = () => { const k = $('#tiingoKey'); k.type = k.type === 'password' ? 'text' : 'password'; };
  $('#tiingoTest').onclick = async () => {
    const st = $('#tiingoStatus');
    st.innerHTML = '<span class="spinner"></span> الاتصال ببث Tiingo...';
    try { st.innerHTML = `<span class="up">${esc(await testTiingoKey($('#tiingoKey').value.trim()))}</span>`; }
    catch (e) { st.innerHTML = `<span class="down">${esc(e.message)}</span>`; }
  };

  const tdKeys = getTwelveKeys();
  $('#tdSlots').innerHTML = Array.from({ length: 4 }, (_, i) => `
    <div class="td-key" data-td="${i}">
      <label>مفتاح Twelve Data ${i + 1}
        <div class="key-row"><input class="td-input" type="password" autocomplete="off" spellcheck="false" dir="ltr" value="${esc(tdKeys[i] || '')}" placeholder="${i ? 'اختياري' : 'المفتاح الأساسي'}" />
        <button class="btn td-show" type="button" title="إظهار/إخفاء">👁</button>
        <button class="btn td-test" type="button" title="اختبار">🧪</button></div></label>
      <div class="status small td-status"></div>
    </div>`).join('');
  $$('.td-key').forEach((el) => {
    $('.td-show', el).onclick = () => { const k = $('.td-input', el); k.type = k.type === 'password' ? 'text' : 'password'; };
    $('.td-test', el).onclick = async () => {
      const st = $('.td-status', el);
      st.innerHTML = '<span class="spinner"></span>';
      try { st.innerHTML = `<span class="up">${esc(await testTwelveKey($('.td-input', el).value.trim()))}</span>`; }
      catch (e) { st.innerHTML = `<span class="down">${esc(e.message)}</span>`; }
    };
  });

  $('#saveKeys').onclick = () => {
    const all = $$('.slot[data-i]').map(readSlot);
    const ok = saveSlots(all) && setTwelveKeys($$('.td-input').map((x) => x.value)) && setTiingoKey($('#tiingoKey').value);
    $('#keysMsg').textContent = ok ? `✓ تم الحفظ — ${all.filter((s) => s.key && s.enabled).length} مفتاح AI${getTiingoKey() ? ' + Tiingo' : ''} + ${getTwelveKeys().length} مفتاح Twelve Data` : '❌ المتصفح يمنع الحفظ (وضع التصفح الخاص؟) — ستعمل المفاتيح حتى إغلاق الصفحة';
    updateKeysBadge();
  };
  $('#clearKeys').onclick = () => {
    if (!confirm('مسح كل المفاتيح؟')) return;
    saveSlots(Array.from({ length: SLOT_COUNT }, () => ({ key: '', provider: 'auto', model: '', enabled: true })));
    setTwelveKeys([]);
    setTiingoKey('');
    initKeys(); updateKeysBadge();
  };
}

// عرض استهلاك رصيد كل مفتاح Twelve Data (يتحدث كل ثانيتين في صفحة المفاتيح)
function renderTDUsage() {
  const tu = $('#tiingoUsage');
  if (tu && $('#tab-keys').classList.contains('active')) {
    const u = tiingoUsage();
    tu.textContent = getTiingoKey() ? `طلبات Tiingo (الشموع التاريخية): ${u.hour}/${u.perHour} هذه الساعة · ${u.day}/${u.perDay} اليوم — البث المباشر لا يُحسب` : '';
  }
  const box = $('#tdUsage');
  if (!box || !$('#tab-keys').classList.contains('active')) return;
  const st = tdPool.status();
  if (!st.length) { box.textContent = ''; return; }
  box.innerHTML = 'استهلاك هذه الدقيقة: ' + st.map((s) => {
    const pct = Math.round((s.used / s.perMinute) * 100);
    const label = s.state === 'invalid' ? '<span class="down">غير صالح</span>'
      : s.state === 'daily' ? '<span class="down">انتهى رصيد اليوم</span>'
      : s.state === 'minute' ? `<span class="down">متوقف ${Math.ceil(s.waitMs / 1000)}ث</span>`
      : `${s.used}/${s.perMinute} · اليوم ${s.today}/${s.perDay}`;
    return `مفتاح ${s.slot} <span class="usage-bar"><i class="${pct >= 100 ? 'full' : pct >= 60 ? 'hot' : ''}" style="width:${Math.min(100, pct)}%"></i></span>${label}`;
  }).join(' &nbsp;·&nbsp; ');
}
setInterval(renderTDUsage, 2000);

// =====================================================================
//  تشخيص الاتصال — يختبر كل مصدر على حدة
// =====================================================================
let diagResults = [];
function diagText() {
  return `تشخيص تداول — ${new Date().toISOString()}\n${navigator.userAgent}\nتطبيق Android: ${globalThis.Capacitor?.isNativePlatform?.() ? 'نعم' : 'لا'}\n` +
    diagResults.map((r) => `${r.ok ? '✅' : r.ok === null ? '⏭' : '❌'} ${r.name}: ${r.detail}`).join('\n');
}
async function runDiagnostics() {
  const out = $('#diagOut'), btn = $('#diagBtn');
  btn.disabled = true; diagResults = [];
  const tiKey = $('#tiingoKey').value.trim() || getTiingoKey();
  const tdKey = ($$('.td-input').map((x) => x.value.trim()).find(Boolean)) || getTwelveKeys()[0];
  const render = (running) => {
    out.innerHTML = `<div class="table-wrap"><table><tbody>${diagResults.map((r) => `<tr><td>${r.ok ? '✅' : r.ok === null ? '⏭' : '❌'}</td><td><b>${esc(r.name)}</b><div class="detail">${esc(r.detail)}</div></td></tr>`).join('')}${running ? `<tr><td><span class="spinner"></span></td><td>${esc(running)}...</td></tr>` : ''}</tbody></table></div>`;
  };
  const step = async (name, fn) => {
    render(name);
    try { const d = await fn(); diagResults.push({ name, ok: d.ok !== false && d.skip !== true ? true : d.skip ? null : false, detail: d.detail }); }
    catch (e) { diagResults.push({ name, ok: false, detail: e?.message || String(e) }); }
    render();
  };
  const ws = (r) => ({ ok: r.ok, detail: `${r.detail} · ${r.ms}ms${r.first ? ' · ' + r.first : ''}` });

  await step('Binance — الأسعار', async () => { const c = await getCandles('BTCUSDT', '1h', 2); return { detail: 'BTC = ' + fmt(c[c.length - 1].c) }; });
  await step('Binance — البث المباشر', async () => {
    const a = await probeWebSocket('wss://data-stream.binance.vision/ws/btcusdt@trade', { timeoutMs: 8000 });
    if (a.ok) return ws(a);
    const b = await probeWebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade', { timeoutMs: 8000 });
    return { ok: b.ok, detail: `vision: ${a.detail} | binance.com: ${b.detail}` };
  });
  if (tiKey) {
    if (nativeSocketsAvailable()) {
      await step('Tiingo — البث المباشر (اتصال أصلي)', async () => ws(await probeWebSocket(TIINGO_WS, { send: subscribeMessage(tiKey, ['eurusd']), timeoutMs: 12000, WS: NativeWebSocket })));
    }
    await step('Tiingo — البث المباشر (المتصفح)', async () => ws(await probeWebSocket(TIINGO_WS, { send: subscribeMessage(tiKey, ['eurusd']), timeoutMs: 12000, WS: globalThis.WebSocket })));
    await step('Tiingo — الشموع (طلب واحد)', async () => {
      const q = await tiingoTop(['EUR/USD'], { key: tiKey, cacheMs: 0 });
      return { detail: q.length ? `EUR/USD = ${q[0].mid}` : 'رد فارغ' };
    });
  } else diagResults.push({ name: 'Tiingo', ok: null, detail: 'لا يوجد مفتاح' });
  if (tdKey) await step('Twelve Data (طلب واحد)', async () => ({ detail: await testTwelveKey(tdKey) }));
  else diagResults.push({ name: 'Twelve Data', ok: null, detail: 'لا يوجد مفتاح' });
  await step('جدول العملات — Frankfurter', async () => { const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR'); return { ok: r.ok, detail: 'HTTP ' + r.status }; });
  await step('جدول العملات — المصدر الاحتياطي', async () => { const f = await getForexFallback(); return { detail: `${f.rows.length} عملة · ${f.date}` }; });
  render();
  // خلاصة مفهومة
  const fail = (n) => diagResults.find((r) => r.name.startsWith(n) && r.ok === false);
  const pass = (n) => diagResults.find((r) => r.name.startsWith(n) && r.ok === true);
  const hints = [];
  if (!diagResults.some((r) => r.ok === true)) hints.push('لا يوجد اتصال بالإنترنت أو أن الشبكة تحجب كل المصادر.');
  else {
    hints.push(pass('Binance — البث') ? '✅ العملات الرقمية: بث مباشر لحظي.' : pass('Binance — الأسعار') ? '⚠️ العملات الرقمية: البث محجوب، التحديث كل 10 ثوانٍ بالطلبات.' : '❌ Binance لا يعمل من شبكتك.');
    if (pass('Tiingo — البث المباشر (اتصال أصلي)')) hints.push('✅ الفوركس والذهب: بث Tiingo المباشر يعمل (عبر الاتصال الأصلي للتطبيق).');
    else if (pass('Tiingo — البث')) hints.push('✅ الفوركس والذهب: بث Tiingo المباشر يعمل.');
    else if (pass('Tiingo — الشموع')) hints.push(`⚠️ شموع Tiingo تعمل لكن بثه المباشر لا يتصل من جهازك — الفوركس والذهب يتحدثان بالطلبات${pass('Twelve Data') ? ' (Twelve Data كل 10 ثوانٍ)' : ''}.`);
    else if (pass('Twelve Data')) hints.push(`⚠️ Tiingo ${fail('Tiingo') ? 'لا يعمل من شبكتك (غالباً حجب — جرّب VPN)' : 'غير مضاف'} — الفوركس والذهب يعملان من Twelve Data.`);
    else hints.push('❌ لا يوجد مصدر يعمل للفوركس والذهب — أضف مفتاح Twelve Data.');
    hints.push(pass('جدول العملات — Frankfurter') ? '✅ جدول العملات العالمية يعمل.' : pass('جدول العملات — المصدر الاحتياطي') ? '✅ جدول العملات العالمية يعمل من المصدر الاحتياطي.' : '❌ جدول العملات العالمية لا يعمل.');
  }
  out.insertAdjacentHTML('beforeend', `<p class="small"><b>الخلاصة:</b><br>${hints.map(esc).join('<br>')}</p>`);
  $('#diagCopy').hidden = false; $('#diagCopy').textContent = '📋 نسخ النتيجة';
  btn.disabled = false;
}

function readSlot(el) {
  const model = $('.s-model', el).value;
  return {
    key: $('.s-key', el).value.trim(), provider: $('.s-provider', el).value,
    model: model === '__custom' ? '' : model, enabled: $('.s-enabled', el).checked,
  };
}

// =====================================================================
fillSelectors();
initTheme();
initImage();
initLive();
initMarkets();
initLibrary();
initKeys();
updateKeysBadge();
initTabs();
if (!activeSlots().length) $('#keysBadge').title = 'أضف مفتاحاً من تبويب المفاتيح';
