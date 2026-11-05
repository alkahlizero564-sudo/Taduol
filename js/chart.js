// =====================================================================
//  الشارت التفاعلي — Canvas
//  شموع + متوسطات + بولينجر + حجم + RSI + مناطق دعم/مقاومة + أداة الصفقة (ربح/خسارة)
//  تكبير بإصبعين/العجلة، سحب للماضي، تقاطع (Crosshair) يعرض بيانات الشمعة، نقر مزدوج لإعادة الضبط
// =====================================================================
import { fmt } from './analysis.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function timeLabel(t, interval) {
  const d = new Date(t);
  const p = (x) => String(x).padStart(2, '0');
  if (['1d', '1w'].includes(interval)) return `${p(d.getDate())}/${p(d.getMonth() + 1)}`;
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * ينشئ شارت تفاعلي على canvas
 * @returns {{setData:(candles,res,patterns,interval)=>void, render:()=>void, reset:()=>void, options:Object, destroy:()=>void}}
 */
export function createChart(canvas, options = {}) {
  const st = {
    candles: [], res: null, patterns: [], interval: '1h',
    count: options.count || 0, end: 0, // count: عدد الشموع الظاهرة، end: كم شمعة مخفية من اليمين
    cross: null, // {x, y}
    opts: { volume: true, rsi: !!options.rsi, levels: true, trade: true, ...options },
  };
  let raf = 0;
  const render = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => draw(canvas, st)); };
  const defaultCount = () => Math.round(clamp(canvas.clientWidth / 9, 30, 160));

  // ---------------- التفاعل ----------------
  const pointers = new Map();
  let pinch0 = null, drag0 = null, lastTap = 0, moved = false;
  const cw = () => (canvas.clientWidth - 64) / (st.count || defaultCount());
  canvas.style.touchAction = options.fullscreen ? 'none' : 'pan-y';
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const onDown = (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, pos(e));
    moved = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch0 = { dist: Math.hypot(a.x - b.x, a.y - b.y), count: st.count || defaultCount() };
      drag0 = null;
    } else {
      drag0 = { x: pos(e).x, end: st.end };
    }
  };
  const onMove = (e) => {
    const p = pos(e);
    if (!pointers.has(e.pointerId)) { // فأرة بدون ضغط: تقاطع
      if (e.pointerType === 'mouse') { st.cross = p; render(); }
      return;
    }
    pointers.set(e.pointerId, p);
    if (pinch0 && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      st.count = Math.round(clamp(pinch0.count * (pinch0.dist / Math.max(20, d)), 15, Math.max(20, st.candles.length)));
      moved = true; render();
    } else if (drag0) {
      const dx = p.x - drag0.x;
      if (Math.abs(dx) > 4) moved = true;
      if (moved) {
        st.end = Math.round(clamp(drag0.end + dx / cw(), 0, Math.max(0, st.candles.length - 15)));
        if (e.pointerType !== 'mouse') st.cross = null;
        render();
      }
    }
  };
  const onUp = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = null;
    if (!moved && e.type === 'pointerup') {
      const now = Date.now();
      if (now - lastTap < 300) { api.reset(); lastTap = 0; return; }
      lastTap = now;
      const p = pos(e);
      st.cross = st.cross && e.pointerType !== 'mouse' && Math.abs(st.cross.x - p.x) < 6 ? null : p; // نقرة تُظهر/تخفي التقاطع
      render();
    }
    if (pointers.size === 0) drag0 = null;
  };
  const onWheel = (e) => {
    e.preventDefault();
    const c = st.count || defaultCount();
    st.count = Math.round(clamp(c * (e.deltaY > 0 ? 1.12 : 0.89), 15, Math.max(20, st.candles.length)));
    render();
  };
  const onLeave = (e) => { if (e.pointerType === 'mouse') { st.cross = null; render(); } };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(render) : null;
  ro?.observe(canvas);

  const api = {
    options: st.opts,
    setData(candles, res, patterns, interval) {
      const grew = st.candles.length && candles.length && candles[candles.length - 1].t !== st.candles[st.candles.length - 1]?.t;
      st.candles = candles || []; st.res = res; st.patterns = patterns || []; if (interval) st.interval = interval;
      if (grew && st.end > 0) st.end = Math.min(st.end + 1, Math.max(0, st.candles.length - 15)); // نحافظ على موضع المستخدم إذا كان يتصفح الماضي
      render();
    },
    render,
    reset() { st.count = 0; st.end = 0; st.cross = null; render(); },
    zoom(f) { st.count = Math.round(clamp((st.count || defaultCount()) * f, 15, Math.max(20, st.candles.length))); render(); },
    destroy() {
      ro?.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('wheel', onWheel);
    },
    get state() { return st; },
  };
  return api;
}

// ---------------- الرسم ----------------
function draw(canvas, st) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const C = {
    bg: css('--chart-bg'), grid: css('--chart-grid'), text: css('--muted'), fg: css('--text'),
    up: css('--up'), down: css('--down'), accent: css('--accent'), ema20: '#f5a623', ema50: '#4aa3ff', ema200: '#c77dff',
  };
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  const candles = st.candles;
  if (!candles.length) return;
  const res = st.res, ind = res?.ind;

  // التخطيط
  const padR = 64, padL = 4, top = 22, timeH = 18;
  const rsiH = st.opts.rsi ? Math.round((H - top - timeH) * 0.22) : 0;
  const mainH = H - top - timeH - (rsiH ? rsiH + 6 : 0);
  const plotW = W - padR - padL;
  const n = candles.length;
  const count = Math.round(clamp(st.count || plotW / 9, 15, n));
  const lastIdx = n - 1 - st.end;
  const firstIdx = Math.max(0, lastIdx - count + 1);
  const rightSpace = st.end === 0 ? Math.min(8, Math.round(count * 0.12)) : 0; // مساحة لأداة الصفقة
  const slots = count + rightSpace;
  const cw = plotW / slots;
  const x = (i) => padL + (i - firstIdx) * cw + cw / 2;

  // نطاق السعر
  let hi = -Infinity, lo = Infinity;
  for (let i = firstIdx; i <= lastIdx; i++) { hi = Math.max(hi, candles[i].h); lo = Math.min(lo, candles[i].l); }
  const showTrade = st.opts.trade && res && st.end === 0;
  if (showTrade) [res.stopLoss, res.targets?.[0], res.entry].forEach((p) => { if (isFinite(p)) { hi = Math.max(hi, p); lo = Math.min(lo, p); } });
  const pad = (hi - lo) * 0.06 || hi * 0.001; hi += pad; lo -= pad;
  const y = (p) => top + ((hi - p) / (hi - lo)) * mainH;
  const yInv = (py) => hi - ((py - top) / mainH) * (hi - lo);

  // الشبكة ومحور الأسعار
  g.font = '11px system-ui, sans-serif'; g.textBaseline = 'middle';
  const steps = Math.max(3, Math.round(mainH / 60));
  for (let s = 0; s <= steps; s++) {
    const p = lo + ((hi - lo) * s) / steps;
    g.strokeStyle = C.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(padL, y(p)); g.lineTo(W - padR, y(p)); g.stroke();
    g.fillStyle = C.text; g.textAlign = 'left'; g.fillText(fmt(p), W - padR + 5, y(p));
  }
  // محور الوقت
  g.textAlign = 'center'; g.textBaseline = 'top';
  const every = Math.max(1, Math.round(90 / cw));
  for (let i = firstIdx; i <= lastIdx; i++) {
    if ((n - 1 - i) % every !== 0) continue;
    g.strokeStyle = C.grid; g.beginPath(); g.moveTo(x(i), top); g.lineTo(x(i), top + mainH); g.stroke();
    g.fillStyle = C.text; g.fillText(timeLabel(candles[i].t, st.interval), x(i), H - timeH + 3);
  }

  g.save(); g.beginPath(); g.rect(padL, top, plotW, mainH); g.clip();

  // مناطق الدعم والمقاومة
  if (st.opts.levels && res?.levels) {
    const band = (res.atr || (hi - lo) * 0.01) * 0.15;
    for (const l of res.levels) {
      if (l.price < lo || l.price > hi) continue;
      const isRes = l.price > candles[n - 1].c;
      g.fillStyle = isRes ? 'rgba(255,84,104,.10)' : 'rgba(31,199,135,.10)';
      g.fillRect(padL, y(l.price + band), plotW, Math.max(2, y(l.price - band) - y(l.price + band)));
    }
  }

  // بولينجر
  if (ind?.bb) {
    g.fillStyle = 'rgba(140,140,170,.08)'; g.beginPath();
    let st0 = false;
    for (let i = firstIdx; i <= lastIdx; i++) if (ind.bb.upper[i] != null) { st0 ? g.lineTo(x(i), y(ind.bb.upper[i])) : (g.moveTo(x(i), y(ind.bb.upper[i])), st0 = true); }
    for (let i = lastIdx; i >= firstIdx; i--) if (ind.bb.lower[i] != null) g.lineTo(x(i), y(ind.bb.lower[i]));
    g.closePath(); g.fill();
  }

  // الحجم (أسفل منطقة السعر)
  if (st.opts.volume && candles.some((k) => k.v)) {
    let vmax = 0; for (let i = firstIdx; i <= lastIdx; i++) vmax = Math.max(vmax, candles[i].v || 0);
    const vh = mainH * 0.18;
    for (let i = firstIdx; i <= lastIdx; i++) {
      const k = candles[i]; const h = vmax ? ((k.v || 0) / vmax) * vh : 0;
      g.fillStyle = k.c >= k.o ? 'rgba(31,199,135,.22)' : 'rgba(255,84,104,.22)';
      g.fillRect(x(i) - Math.max(1, cw * 0.35), top + mainH - h, Math.max(1, cw * 0.7), h);
    }
  }

  // الشموع
  for (let i = firstIdx; i <= lastIdx; i++) {
    const k = candles[i]; const col = k.c >= k.o ? C.up : C.down;
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x(i), y(k.h)); g.lineTo(x(i), y(k.l)); g.stroke();
    const bw = Math.max(1, cw * 0.68);
    g.fillRect(x(i) - bw / 2, y(Math.max(k.o, k.c)), bw, Math.max(1, Math.abs(y(k.o) - y(k.c))));
  }

  // المتوسطات
  const line = (arr, color, w = 1.4) => {
    if (!arr) return; g.strokeStyle = color; g.lineWidth = w; g.beginPath(); let s0 = false;
    for (let i = firstIdx; i <= lastIdx; i++) { if (arr[i] == null) continue; s0 ? g.lineTo(x(i), y(arr[i])) : (g.moveTo(x(i), y(arr[i])), s0 = true); }
    g.stroke();
  };
  if (ind) { line(ind.ema20, C.ema20); line(ind.ema50, C.ema50); line(ind.ema200, C.ema200, 1.6); }

  // علامات أنماط الشموع
  if (st.patterns?.length) {
    const byIdx = {};
    st.patterns.forEach((p) => { if (p.index >= firstIdx && p.index <= lastIdx) (byIdx[p.index] ||= []).push(p); });
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.font = `bold ${clamp(cw, 9, 13)}px system-ui`;
    for (const [idx, ps] of Object.entries(byIdx)) {
      const i = +idx, k = candles[i];
      const b = ps.filter((p) => p.type === 'bullish').length, s = ps.filter((p) => p.type === 'bearish').length;
      if (b >= s && b) { g.fillStyle = C.up; g.fillText('▲', x(i), y(k.l) + 14); }
      else if (s) { g.fillStyle = C.down; g.fillText('▼', x(i), y(k.h) - 4); }
    }
  }

  // أداة الصفقة: منطقة الربح (خضراء) ومنطقة الخسارة (حمراء)
  const labels = [];
  if (showTrade && isFinite(res.entry)) {
    const isWait = res.direction === 'WAIT';
    const x0 = x(lastIdx) - cw * 2, x1 = W - padR;
    const tp1 = res.targets?.[0], tpLast = res.targets?.[2];
    g.globalAlpha = isWait ? 0.45 : 1;
    g.fillStyle = 'rgba(31,199,135,.20)'; g.fillRect(x0, Math.min(y(res.entry), y(tp1)), x1 - x0, Math.abs(y(tp1) - y(res.entry)));
    if (isFinite(tpLast)) { g.fillStyle = 'rgba(31,199,135,.07)'; g.fillRect(x0, Math.min(y(tp1), y(tpLast)), x1 - x0, Math.abs(y(tpLast) - y(tp1))); }
    g.fillStyle = 'rgba(255,84,104,.20)'; g.fillRect(x0, Math.min(y(res.entry), y(res.stopLoss)), x1 - x0, Math.abs(y(res.stopLoss) - y(res.entry)));
    g.globalAlpha = 1;
    const hl = (p, color, dash, tag) => {
      if (!isFinite(p) || p < lo || p > hi) return;
      g.setLineDash(dash); g.strokeStyle = color; g.lineWidth = 1.3; g.beginPath(); g.moveTo(padL, y(p)); g.lineTo(x1, y(p)); g.stroke(); g.setLineDash([]);
      // اسم الخط كوسم صغير فوقه داخل الشارت (المحور يعرض السعر فقط)
      g.font = 'bold 10px system-ui'; g.textAlign = 'right'; g.textBaseline = 'bottom';
      const tw = g.measureText(tag).width + 8;
      g.fillStyle = color; g.globalAlpha = 0.9; g.fillRect(x1 - tw - 2, y(p) - 15, tw, 13); g.globalAlpha = 1;
      g.fillStyle = '#fff'; g.fillText(tag, x1 - 6, y(p) - 3);
    };
    hl(res.entry, C.accent, [], res.entryType === 'limit' ? 'دخول معلّق' : 'دخول');
    hl(res.stopLoss, C.down, [6, 4], 'وقف الخسارة');
    (res.targets || []).forEach((t, i) => hl(t, C.up, [6, 4], `هدف ${i + 1}`));
    labels.push([res.entry, C.accent, fmt(res.entry)]);
    labels.push([res.stopLoss, C.down, fmt(res.stopLoss)]);
    (res.targets || []).forEach((t) => labels.push([t, C.up, fmt(t)]));
    // نسبة العائد على الصندوق
    g.fillStyle = C.fg; g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`1:${res.riskReward}${isWait ? ' (سيناريو)' : ''}`, (x0 + x1) / 2, (y(res.entry) + y(tp1)) / 2);
  }
  g.restore();

  // خط السعر الحالي
  const last = candles[n - 1];
  if (st.end === 0) {
    g.setLineDash([2, 3]); g.strokeStyle = last.c >= last.o ? C.up : C.down; g.lineWidth = 1;
    g.beginPath(); g.moveTo(padL, y(last.c)); g.lineTo(W - padR, y(last.c)); g.stroke(); g.setLineDash([]);
  }
  labels.push([last.c, last.c >= last.o ? C.up : C.down, fmt(last.c)]);

  // تسميات المحور (مع تجنب التداخل)
  g.font = 'bold 10px system-ui'; g.textAlign = 'left'; g.textBaseline = 'middle';
  const placed = [];
  labels.filter(([p]) => isFinite(p) && p >= lo && p <= hi).sort((a, b) => y(a[0]) - y(b[0])).forEach(([p, color, txt]) => {
    let yy = y(p);
    for (const q of placed) if (Math.abs(q - yy) < 15) yy = q + 15;
    placed.push(yy);
    g.fillStyle = color; g.fillRect(W - padR, yy - 7, padR, 14);
    g.fillStyle = '#fff'; g.fillText(txt, W - padR + 3, yy);
  });

  // RSI
  if (rsiH && ind?.rsi) {
    const r0 = top + mainH + 6;
    const yr = (v) => r0 + ((100 - v) / 100) * rsiH;
    g.fillStyle = 'rgba(140,140,170,.08)'; g.fillRect(padL, yr(70), plotW, yr(30) - yr(70));
    g.strokeStyle = C.grid; g.beginPath(); g.moveTo(padL, r0); g.lineTo(W - padR, r0); g.stroke();
    g.strokeStyle = '#b388ff'; g.lineWidth = 1.3; g.beginPath(); let s0 = false;
    for (let i = firstIdx; i <= lastIdx; i++) { const v = ind.rsi[i]; if (v == null) continue; s0 ? g.lineTo(x(i), yr(v)) : (g.moveTo(x(i), yr(v)), s0 = true); }
    g.stroke();
    g.fillStyle = C.text; g.font = '10px system-ui'; g.textAlign = 'left';
    [70, 30].forEach((v) => g.fillText(String(v), W - padR + 5, yr(v)));
    const rv = ind.rsi[lastIdx];
    if (rv != null) { g.fillStyle = '#b388ff'; g.fillText('RSI ' + rv.toFixed(1), padL + 4, r0 + 9); }
  }

  // التقاطع + بيانات الشمعة
  let info = null;
  if (st.cross && st.cross.x < W - padR) {
    const i = clamp(Math.round(firstIdx + (st.cross.x - padL - cw / 2) / cw), firstIdx, lastIdx);
    const k = candles[i];
    g.setLineDash([4, 4]); g.strokeStyle = C.text; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x(i), top); g.lineTo(x(i), H - timeH); g.stroke();
    if (st.cross.y >= top && st.cross.y <= top + mainH) {
      g.beginPath(); g.moveTo(padL, st.cross.y); g.lineTo(W - padR, st.cross.y); g.stroke();
      g.setLineDash([]); g.fillStyle = C.fg; g.fillRect(W - padR, st.cross.y - 8, padR, 16);
      g.fillStyle = C.bg; g.font = 'bold 10px system-ui'; g.textAlign = 'left'; g.fillText(fmt(yInv(st.cross.y)), W - padR + 3, st.cross.y);
    }
    g.setLineDash([]);
    info = k;
  }
  const k = info || last;
  const chg = ((k.c - k.o) / k.o) * 100;
  g.font = '11px system-ui'; g.textAlign = 'left'; g.textBaseline = 'middle';
  const parts = [[`${info ? timeLabel(k.t, '1h') + ' ' : ''}O ${fmt(k.o)}`, C.text], [`H ${fmt(k.h)}`, C.text], [`L ${fmt(k.l)}`, C.text], [`C ${fmt(k.c)}`, k.c >= k.o ? C.up : C.down], [`${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`, chg >= 0 ? C.up : C.down]];
  let px = padL + 4;
  for (const [t, c] of parts) { g.fillStyle = c; g.fillText(t, px, 11); px += g.measureText(t).width + 8; }
  // مفتاح المتوسطات (يمين الأعلى) — فقط إذا توجد مساحة كافية
  g.textAlign = 'right';
  const legend = [['EMA200', C.ema200], ['EMA50', C.ema50], ['EMA20', C.ema20]];
  const legendW = legend.reduce((w, [t]) => w + g.measureText(t).width + 10, 0);
  if (W - padR - 4 - legendW > px + 6) {
    let rx = W - padR - 4;
    legend.forEach(([t, c]) => { g.fillStyle = c; g.fillText(t, rx, 11); rx -= g.measureText(t).width + 10; });
  }
}

/** للتوافق: رسم ثابت على canvas (يستخدمه تحليل الذكاء الاصطناعي) */
export function drawChart(canvas, candles, res, opts = {}) {
  draw(canvas, { candles, res, patterns: opts.patterns || [], interval: opts.interval || '1h', count: opts.visible || 0, end: 0, cross: null,
    opts: { volume: true, rsi: false, levels: true, trade: true } });
}

// رسم شمعة/نمط مصغر لمكتبة الشموع
export function drawMini(canvas, candles) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 120, H = canvas.clientHeight || 70;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  let hi = -Infinity, lo = Infinity; candles.forEach((k) => { hi = Math.max(hi, k.h); lo = Math.min(lo, k.l); });
  const y = (p) => 6 + ((hi - p) / (hi - lo || 1)) * (H - 12);
  const cw = W / (candles.length + 1);
  candles.forEach((k, i) => {
    const xx = cw * (i + 1);
    const col = k.c >= k.o ? css('--up') : css('--down');
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(xx, y(k.h)); g.lineTo(xx, y(k.l)); g.stroke();
    const bw = Math.min(14, cw * 0.55); const h = Math.max(1.5, Math.abs(y(k.o) - y(k.c)));
    g.fillRect(xx - bw / 2, y(Math.max(k.o, k.c)), bw, h);
  });
}
