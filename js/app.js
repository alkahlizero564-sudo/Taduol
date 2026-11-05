// =====================================================================
//  واجهة التطبيق — ربط كل الأجزاء
// =====================================================================
import { PATTERNS, PATTERN_MAP, detectPatterns } from './patterns.js';
import { analyze, summaryForAI, fmt } from './analysis.js';
import { getCandles, getTickers, getForex, getNews, SYMBOLS, INTERVALS } from './market.js';
import {
  loadSlots, saveSlots, resolveSlot, activeSlots, detectProvider, testSlot, SLOT_COUNT,
  CLAUDE_MODELS, GEMINI_MODELS, analyzeChartImage, fileToBase64, aiMarketNews,
} from './ai.js';
import { drawChart, drawMini } from './chart.js';
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
    if (name === 'markets' && !markets.loaded) loadMarkets();
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
  $('#symbolList').innerHTML = SYMBOLS.map((s) => `<option value="${s.s}">${esc(s.n)}</option>`).join('');
}

function updateKeysBadge() {
  const n = activeSlots().length;
  const b = $('#keysBadge');
  b.textContent = n ? `${n} مفتاح نشط` : 'لا توجد مفاتيح';
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
        const candles = await getCandles(sym, iv, 300);
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
const live = { candles: null, res: null, timer: null, symbol: '', interval: '' };

function initLive() {
  $('#liveBtn').onclick = () => loadLive();
  $('#liveSymbol').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadLive(); });
  $('#liveInterval').onchange = () => live.candles && loadLive();
  $('#autoRefresh').onchange = (e) => {
    clearInterval(live.timer);
    if (e.target.checked) live.timer = setInterval(() => loadLive(true), 60000);
  };
  $('#liveAiBtn').onclick = runLiveAI;
  window.addEventListener('resize', () => { if (live.candles && $('#tab-live').classList.contains('active')) renderChart(); });
}

async function loadLive(silent = false) {
  const sym = $('#liveSymbol').value.trim().toUpperCase();
  const iv = $('#liveInterval').value;
  const st = $('#liveStatus');
  if (!silent) st.innerHTML = '<span class="spinner"></span> جاري جلب البيانات...';
  try {
    const candles = await getCandles(sym, iv, 300);
    live.candles = candles; live.symbol = sym; live.interval = iv;
    live.res = analyze(candles);
    live.recentPatterns = detectPatterns(candles, { lookback: 30 });
    renderChart(); renderPlan(); renderSignals(); renderPatterns(); renderLevels();
    st.textContent = `${sym} · ${iv} · آخر تحديث ${new Date().toLocaleTimeString('ar-EG')} · ${candles.length} شمعة`;
  } catch (e) {
    st.innerHTML = `<span class="down">❌ ${esc(e.message)}</span> — تأكد أن الرمز صحيح على Binance (مثل BTCUSDT).`;
  }
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
}

async function loadMarkets() {
  markets.loaded = true;
  $('#tickers').innerHTML = '<span class="spinner"></span>';
  $('#forex').innerHTML = '<span class="spinner"></span>';
  $('#news').innerHTML = '<span class="spinner"></span>';
  getTickers().then((rows) => {
    const names = Object.fromEntries(SYMBOLS.map((s) => [s.s, s.n]));
    $('#tickers').innerHTML = rows.map((t) => `
      <div class="ticker" data-sym="${esc(t.symbol)}" title="اضغط للتحليل">
        <div class="sym">${esc(t.symbol)}</div><div class="name">${esc(names[t.symbol] || '')}</div>
        <div class="price">${fmt(t.price)}</div>
        <div class="${t.change >= 0 ? 'up' : 'down'}">${t.change >= 0 ? '▲ ارتفع' : '▼ انخفض'} ${Math.abs(t.change).toFixed(2)}%</div>
      </div>`).join('') || '<p class="muted">لا توجد بيانات</p>';
    $$('.ticker').forEach((el) => (el.onclick = () => { $('#liveSymbol').value = el.dataset.sym; $$('.tab').find((t) => t.dataset.tab === 'live').click(); loadLive(); }));
  }).catch((e) => { $('#tickers').innerHTML = `<p class="down">❌ ${esc(e.message)}</p>`; });

  getForex().then((fx) => {
    $('#forex').innerHTML = `<table><thead><tr><th>العملة</th><th>مقابل 1$</th><th>التغير</th></tr></thead><tbody>${
      fx.rows.map((r) => `<tr><td><b>${r.code}</b> ${esc(r.name)}</td><td class="num">${r.perUsd.toFixed(4)}</td><td class="${r.change > 0 ? 'up' : r.change < 0 ? 'down' : 'flat'}">${r.change > 0 ? '▲ ارتفعت' : r.change < 0 ? '▼ انخفضت' : '● ثابتة'} ${Math.abs(r.change).toFixed(2)}%</td></tr>`).join('')
    }</tbody></table><p class="small muted">تاريخ آخر تحديث: ${esc(fx.date)}</p>`;
  }).catch((e) => { $('#forex').innerHTML = `<p class="down">❌ ${esc(e.message)}</p>`; });

  getNews().then((items) => {
    $('#news').innerHTML = items.map((n) => `
      <div class="news-item"><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>
      <div class="small muted">${esc(n.source)} · ${n.time ? new Date(n.time).toLocaleString('ar-EG') : ''}</div></div>`).join('');
  }).catch((e) => { $('#news').innerHTML = `<p class="muted">${esc(e.message)}</p>`; });
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
  const modelOptions = (prov, cur) => {
    const list = prov === 'claude' ? CLAUDE_MODELS : prov === 'gemini' ? GEMINI_MODELS : [...CLAUDE_MODELS, ...GEMINI_MODELS];
    const known = list.some((m) => m.id === cur);
    return `<option value="">تلقائي (الافتراضي)</option>${list.map((m) => `<option value="${m.id}" ${m.id === cur ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}${cur && !known ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : ''}<option value="__custom">✏️ اسم موديل مخصص...</option>`;
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
      <div class="key-row"><button class="btn s-test" type="button">🧪 اختبار</button><div class="status muted"></div></div>
    </div>`).join('');

  $$('.slot').forEach((el) => {
    const refreshModels = () => {
      const prov = $('.s-provider', el).value;
      const p = prov === 'auto' ? detectProvider($('.s-key', el).value) : prov;
      $('.s-model', el).innerHTML = modelOptions(p, $('.s-model', el).value);
      const st = $('.status', el);
      if ($('.s-key', el).value.trim() && prov === 'auto') st.textContent = p ? `تم التعرف: ${p === 'claude' ? 'Claude' : 'Gemini'}` : 'نوع غير معروف — اختر المزود';
    };
    $('.s-provider', el).onchange = refreshModels;
    $('.s-key', el).oninput = refreshModels;
    $('.s-model', el).onchange = (e) => {
      if (e.target.value === '__custom') {
        const v = prompt('اكتب اسم الموديل بالضبط (مثل gemini-2.5-pro أو claude-opus-5-5):');
        e.target.innerHTML = modelOptions($('.s-provider', el).value === 'auto' ? detectProvider($('.s-key', el).value) : $('.s-provider', el).value, (v || '').trim());
      }
    };
    $('.s-show', el).onclick = () => { const k = $('.s-key', el); k.type = k.type === 'password' ? 'text' : 'password'; };
    $('.s-test', el).onclick = async () => {
      const st = $('.status', el);
      st.innerHTML = '<span class="spinner"></span>';
      try { st.innerHTML = `<span class="up">${esc(await testSlot(readSlot(el)))}</span>`; }
      catch (e) { st.innerHTML = `<span class="down">${esc(e.message)}</span>`; }
    };
  });

  $('#saveKeys').onclick = () => {
    const all = $$('.slot').map(readSlot);
    const ok = saveSlots(all);
    $('#keysMsg').textContent = ok ? `✓ تم الحفظ — ${all.filter((s) => s.key && s.enabled).length} مفتاح نشط` : '❌ المتصفح يمنع الحفظ (وضع التصفح الخاص؟) — ستعمل المفاتيح حتى إغلاق الصفحة';
    updateKeysBadge();
  };
  $('#clearKeys').onclick = () => {
    if (!confirm('مسح كل المفاتيح؟')) return;
    saveSlots(Array.from({ length: SLOT_COUNT }, () => ({ key: '', provider: 'auto', model: '', enabled: true })));
    initKeys(); updateKeysBadge();
  };
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
