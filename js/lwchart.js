// =====================================================================
//  شارت احترافي مبني على مكتبة TradingView Lightweight Charts™ (Apache-2.0)
//  محلية داخل التطبيق (js/vendor) — تعمل بدون إنترنت
//  شموع + EMA 20/50/200 + بولينجر + حجم + RSI بلوحة مستقلة + خطوط الدخول/الوقف/الأهداف
//  + مستويات الدعم/المقاومة + علامات أنماط الشموع + شريط بيانات الشمعة عند التحريك
// =====================================================================
import * as LW from './vendor/lightweight-charts.mjs';
import { fmt } from './analysis.js';

const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const TZ = -new Date().getTimezoneOffset() * 60; // عرض الوقت بتوقيت الجهاز
const VOL_UP = 'rgba(31,199,135,.22)', VOL_DN = 'rgba(255,84,104,.22)';
/** عدد الخانات العشرية المناسب للسعر (نفس قاعدة fmt) */
const decimals = (p) => { const a = Math.abs(p); return a >= 1000 ? 2 : a >= 10 ? 3 : a >= 1 ? 4 : a >= 0.01 ? 5 : 8; };
const T = (ms) => Math.floor(ms / 1000) + TZ;

function theme() {
  return {
    bg: css('--chart-bg'), grid: css('--chart-grid'), text: css('--muted'), fg: css('--text'),
    up: css('--up'), down: css('--down'), accent: css('--accent'), warn: css('--warn'),
    ema20: '#f5a623', ema50: '#4aa3ff', ema200: '#c77dff', rsi: '#b388ff',
  };
}

/**
 * @param {HTMLElement} container عنصر div
 * @param {{rsi?:boolean, fullscreen?:boolean}} options
 */
export function createProChart(container, options = {}) {
  container.innerHTML = '';
  container.dir = 'ltr';
  container.style.position = 'relative';
  let C = theme();
  const chart = LW.createChart(container, {
    autoSize: true,
    layout: { background: { type: LW.ColorType.Solid, color: C.bg }, textColor: C.text, fontFamily: 'Cairo, system-ui, sans-serif', fontSize: 11,
      panes: { separatorColor: C.grid, separatorHoverColor: C.accent, enableResize: true } },
    grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
    crosshair: { mode: LW.CrosshairMode.Normal },
    rightPriceScale: { borderColor: C.grid, scaleMargins: { top: 0.08, bottom: 0.12 } },
    timeScale: { borderColor: C.grid, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: options.fullscreen ? 8 : 7 },
    handleScroll: { vertTouchDrag: !!options.fullscreen },
  });

  const lineOpts = (color, width = 1, extra = {}) => ({ color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...extra });
  const candle = chart.addSeries(LW.CandlestickSeries, { upColor: C.up, downColor: C.down, wickUpColor: C.up, wickDownColor: C.down, borderVisible: false });
  const bbU = chart.addSeries(LW.LineSeries, lineOpts('rgba(140,140,170,.55)', 1, { lineStyle: LW.LineStyle.Dotted }));
  const bbL = chart.addSeries(LW.LineSeries, lineOpts('rgba(140,140,170,.55)', 1, { lineStyle: LW.LineStyle.Dotted }));
  const e20 = chart.addSeries(LW.LineSeries, lineOpts(C.ema20, 1));
  const e50 = chart.addSeries(LW.LineSeries, lineOpts(C.ema50, 1));
  const e200 = chart.addSeries(LW.LineSeries, lineOpts(C.ema200, 2));
  const vol = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', priceLineVisible: false, lastValueVisible: false });
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
  let precision = -1;
  const markers = LW.createSeriesMarkers(candle, []);
  let rsiS = null, rsiLines = [];
  let tradeLines = [], levelLines = [];

  // شريط بيانات الشمعة (أعلى اليسار)
  const legend = document.createElement('div');
  legend.className = 'lw-legend';
  container.appendChild(legend);

  const st = { candles: [], res: null, patterns: [], interval: '1h', key: '', opts: { volume: true, rsi: !!options.rsi, levels: true, trade: true, scenario: false, history: true }, tradeMarks: [] };

  function ensureRsi() {
    if (st.opts.rsi && !rsiS) {
      rsiS = chart.addSeries(LW.LineSeries, lineOpts(C.rsi, 1.5, { lastValueVisible: true, priceFormat: { type: 'custom', formatter: (v) => v.toFixed(0), minMove: 1 } }), 1);
      rsiLines = [70, 30].map((v) => rsiS.createPriceLine({ price: v, color: C.text, lineWidth: 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: false }));
      const panes = chart.panes();
      if (panes[1]) { panes[0].setStretchFactor(0.76); panes[1].setStretchFactor(0.24); }
    } else if (!st.opts.rsi && rsiS) {
      chart.removeSeries(rsiS); rsiS = null; rsiLines = [];
    }
  }

  function legendFor(k, idx) {
    if (!k) { legend.innerHTML = ''; return; }
    const ch = ((k.c - k.o) / k.o) * 100, cls = k.c >= k.o ? 'up' : 'down';
    const ind = st.res?.ind;
    const v = (arr) => (ind && arr && arr[idx] != null ? fmt(arr[idx]) : '—');
    legend.innerHTML = `<span>O <b class="${cls}">${fmt(k.o)}</b></span> <span>H <b class="${cls}">${fmt(k.h)}</b></span> <span>L <b class="${cls}">${fmt(k.l)}</b></span> <span>C <b class="${cls}">${fmt(k.c)}</b></span> <b class="${cls}">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</b>`
      + (options.fullscreen ? `<br><span style="color:${C.ema20}">EMA20 ${v(ind?.ema20)}</span> <span style="color:${C.ema50}">EMA50 ${v(ind?.ema50)}</span> <span style="color:${C.ema200}">EMA200 ${v(ind?.ema200)}</span>`
        + (st.opts.rsi && ind?.rsi?.[idx] != null ? ` <span style="color:${C.rsi}">RSI ${ind.rsi[idx].toFixed(1)}</span>` : '') : '');
  }
  chart.subscribeCrosshairMove((p) => {
    if (!p || p.time == null) { const n = st.candles.length; legendFor(st.candles[n - 1], n - 1); return; }
    const idx = st.candles.findIndex((k) => T(k.t) === p.time);
    legendFor(st.candles[idx], idx);
  });

  const lineData = (arr) => {
    const out = [];
    if (!arr) return out;
    for (let i = 0; i < st.candles.length; i++) if (arr[i] != null) out.push({ time: T(st.candles[i].t), value: arr[i] });
    return out;
  };

  function drawOverlays() {
    const res = st.res, ind = res?.ind;
    // المؤشرات (تُحسب كل تحليل — أي كل 10 ثوانٍ)
    if (ind && ind.ema20?.length === st.candles.length) {
      e20.setData(lineData(ind.ema20)); e50.setData(lineData(ind.ema50)); e200.setData(lineData(ind.ema200));
      bbU.setData(lineData(ind.bb?.upper)); bbL.setData(lineData(ind.bb?.lower));
      ensureRsi(); if (rsiS) rsiS.setData(lineData(ind.rsi));
    }
    // علامات أنماط الشموع
    // علامة واحدة لكل شمعة بحسب صافي الأنماط عليها
    const net = new Map();
    (st.patterns || []).forEach((p) => {
      if (!st.candles[p.index] || p.type === 'neutral' || p.reliability < 2) return;
      net.set(p.index, (net.get(p.index) || 0) + (p.type === 'bullish' ? p.reliability : -p.reliability));
    });
    const pat = [...net].filter(([, v]) => v !== 0).map(([i, v]) => ({
      time: T(st.candles[i].t), position: v > 0 ? 'belowBar' : 'aboveBar',
      color: v > 0 ? C.up : C.down, shape: v > 0 ? 'arrowUp' : 'arrowDown', size: 0.9,
    }));
    // صفقات الاستراتيجية السابقة: ✓ ربحت / ✗ خسرت (من الاختبار التاريخي)
    const t0 = st.candles.length ? st.candles[0].t : Infinity;
    const hist = st.opts.history ? (st.tradeMarks || []).filter((m) => m.t >= t0).map((m) => ({
      time: T(m.t), position: m.side === 'BUY' ? 'belowBar' : 'aboveBar', shape: m.side === 'BUY' ? 'arrowUp' : 'arrowDown',
      color: m.R > 0 ? C.up : C.down, text: m.R > 0 ? `✓ +${m.R.toFixed(1)}R` : `✗ ${m.R.toFixed(1)}R`, size: 1.3,
    })) : [];
    const byTime = new Map();
    [...pat, ...hist].forEach((m) => byTime.set(m.time + (m.text ? 0.5 : 0), m)); // علامة الصفقة لها أولوية في العرض
    markers.setMarkers([...byTime.values()].sort((a, b) => a.time - b.time));
    // خطوط الصفقة
    tradeLines.forEach((l) => candle.removePriceLine(l)); tradeLines = [];
    // خطوط الصفقة تظهر فقط عند وجود إشارة فعلية؛ السيناريو عند "انتظار" يظهر فقط إذا طلبه المستخدم
    if (st.opts.trade && res && isFinite(res.entry) && (res.direction !== 'WAIT' || st.opts.scenario)) {
      const wait = res.direction === 'WAIT';
      const add = (price, color, title, style = LW.LineStyle.Dashed, w = 1) => tradeLines.push(candle.createPriceLine({ price, color, lineWidth: w, lineStyle: style, axisLabelVisible: true, title }));
      add(res.entry, C.accent, (res.entryType === 'limit' ? 'دخول معلّق' : 'دخول') + (wait ? ' (سيناريو)' : ''), LW.LineStyle.Solid, 2);
      add(res.stopLoss, C.down, 'وقف الخسارة', LW.LineStyle.Dashed, 2);
      (res.targets || []).forEach((t, i) => add(t, C.up, `هدف ${i + 1}`, LW.LineStyle.Dashed, i === 0 ? 2 : 1));
    }
    // مستويات الدعم والمقاومة
    levelLines.forEach((l) => candle.removePriceLine(l)); levelLines = [];
    if (st.opts.levels && res?.levels && st.candles.length) {
      const px = st.candles[st.candles.length - 1].c;
      res.levels.forEach((l) => levelLines.push(candle.createPriceLine({ price: l.price, color: l.price > px ? 'rgba(255,84,104,.55)' : 'rgba(31,199,135,.55)',
        lineWidth: 1, lineStyle: LW.LineStyle.Dotted, axisLabelVisible: false, title: l.price > px ? 'مقاومة' : 'دعم' })));
    }
  }

  const api = {
    options: st.opts,
    get state() { return st; },
    setData(candles, res, patterns, interval) {
      if (!candles?.length) return;
      const key = `${interval}|${candles[0].t}`;
      const prev = st.candles;
      const incremental = st.key === key && prev.length && candles.length >= prev.length && candles.length - prev.length <= 2 &&
        prev[prev.length - 1].t === candles[prev.length - 1]?.t;
      st.candles = candles; st.res = res; st.patterns = patterns || []; st.interval = interval || st.interval;
      if (incremental) {
        // تحديث خفيف (البث المباشر كل ثانية): آخر شمعة أو شمعتين فقط
        for (let i = Math.max(0, prev.length - 1); i < candles.length; i++) {
          const k = candles[i];
          candle.update({ time: T(k.t), open: k.o, high: k.h, low: k.l, close: k.c });
          vol.update({ time: T(k.t), value: k.v || 0, color: k.c >= k.o ? VOL_UP : VOL_DN });
        }
      } else {
        const d = decimals(candles[candles.length - 1].c);
        if (d !== precision) {
          precision = d;
          const pf = { type: 'price', precision: d, minMove: Math.pow(10, -d) };
          [candle, e20, e50, e200, bbU, bbL].forEach((sr) => sr.applyOptions({ priceFormat: pf }));
        }
        candle.setData(candles.map((k) => ({ time: T(k.t), open: k.o, high: k.h, low: k.l, close: k.c })));
        const hasVol = candles.some((k) => k.v);
        vol.setData(hasVol ? candles.map((k) => ({ time: T(k.t), value: k.v || 0, color: k.c >= k.o ? VOL_UP : VOL_DN })) : []);
        if (st.key !== key) api.reset();
        st.key = key;
      }
      vol.applyOptions({ visible: st.opts.volume });
      if (res !== st.lastRes || !incremental) { st.lastRes = res; drawOverlays(); }
      legendFor(candles[candles.length - 1], candles.length - 1);
    },
    render() { vol.applyOptions({ visible: st.opts.volume }); drawOverlays(); },
    /** صفقات الاختبار التاريخي [{t, side, R}] لعرضها على الشارت */
    setTradeMarks(list) { st.tradeMarks = list || []; drawOverlays(); },
    reset() {
      const n = st.candles.length;
      const show = Math.round(Math.max(40, Math.min(n, container.clientWidth / (options.fullscreen ? 8 : 7))));
      chart.timeScale().setVisibleLogicalRange({ from: n - show, to: n + 6 });
    },
    zoom(f) {
      const r = chart.timeScale().getVisibleLogicalRange();
      if (!r) return;
      const width = (r.to - r.from) * f;
      chart.timeScale().setVisibleLogicalRange({ from: r.to - width, to: r.to });
    },
    applyTheme() {
      C = theme();
      chart.applyOptions({ layout: { background: { type: LW.ColorType.Solid, color: C.bg }, textColor: C.text, panes: { separatorColor: C.grid } },
        grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } }, rightPriceScale: { borderColor: C.grid }, timeScale: { borderColor: C.grid } });
      candle.applyOptions({ upColor: C.up, downColor: C.down, wickUpColor: C.up, wickDownColor: C.down });
      drawOverlays();
    },
    /** صورة الشارت (لإرسالها للذكاء الاصطناعي) */
    screenshot() { return chart.takeScreenshot(); },
    destroy() { chart.remove(); },
  };
  return api;
}
