// =====================================================================
//  رسم الشارت على Canvas — شموع + متوسطات + بولينجر + علامات الأنماط
//  + خطوط الدخول ووقف الخسارة والأهداف
// =====================================================================
import { fmt } from './analysis.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function drawChart(canvas, candles, res, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = {
    bg: css('--chart-bg'), grid: css('--chart-grid'), text: css('--muted'),
    up: css('--up'), down: css('--down'), ema20: '#f5a623', ema50: '#4aa3ff', ema200: '#c77dff', bb: 'rgba(150,150,170,.55)',
    entry: '#4aa3ff', sl: css('--down'), tp: css('--up'),
  };
  g.fillStyle = colors.bg; g.fillRect(0, 0, W, H);

  const show = Math.min(opts.visible || 100, candles.length);
  const from = candles.length - show;
  const data = candles.slice(from);
  const padR = 70, padT = 14, padB = 22, padL = 8;
  const cw = (W - padR - padL) / show;

  // نطاق الأسعار
  let hi = -Infinity, lo = Infinity;
  data.forEach((k) => { hi = Math.max(hi, k.h); lo = Math.min(lo, k.l); });
  if (res) {
    [res.stopLoss, ...(res.targets || [])].forEach((p) => { if (p != null && isFinite(p)) { hi = Math.max(hi, p); lo = Math.min(lo, p); } });
  }
  const pad = (hi - lo) * 0.06; hi += pad; lo -= pad;
  const y = (p) => padT + ((hi - p) / (hi - lo)) * (H - padT - padB);
  const x = (i) => padL + (i - from) * cw + cw / 2;

  // الشبكة ومحور الأسعار
  g.font = '11px system-ui, sans-serif'; g.textAlign = 'left';
  for (let s = 0; s <= 6; s++) {
    const p = lo + ((hi - lo) * s) / 6;
    g.strokeStyle = colors.grid; g.lineWidth = 1;
    g.beginPath(); g.moveTo(padL, y(p)); g.lineTo(W - padR, y(p)); g.stroke();
    g.fillStyle = colors.text; g.fillText(fmt(p), W - padR + 6, y(p) + 4);
  }

  // بولينجر
  if (res?.ind?.bb) {
    const { upper, lower } = res.ind.bb;
    g.fillStyle = 'rgba(140,140,170,.08)';
    g.beginPath();
    let started = false;
    for (let i = from; i < candles.length; i++) if (upper[i] != null) { started ? g.lineTo(x(i), y(upper[i])) : (g.moveTo(x(i), y(upper[i])), started = true); }
    for (let i = candles.length - 1; i >= from; i--) if (lower[i] != null) g.lineTo(x(i), y(lower[i]));
    g.closePath(); g.fill();
  }

  // الشموع
  for (let i = from; i < candles.length; i++) {
    const k = candles[i];
    const col = k.c >= k.o ? colors.up : colors.down;
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x(i), y(k.h)); g.lineTo(x(i), y(k.l)); g.stroke();
    const bw = Math.max(1, cw * 0.7);
    const top = y(Math.max(k.o, k.c)), bh = Math.max(1, Math.abs(y(k.o) - y(k.c)));
    g.fillRect(x(i) - bw / 2, top, bw, bh);
  }

  // المتوسطات
  const line = (arr, color, w = 1.4) => {
    if (!arr) return;
    g.strokeStyle = color; g.lineWidth = w; g.beginPath();
    let started = false;
    for (let i = from; i < candles.length; i++) {
      if (arr[i] == null) continue;
      started ? g.lineTo(x(i), y(arr[i])) : (g.moveTo(x(i), y(arr[i])), started = true);
    }
    g.stroke();
  };
  if (res?.ind) { line(res.ind.ema20, colors.ema20); line(res.ind.ema50, colors.ema50); line(res.ind.ema200, colors.ema200); }

  // Supertrend كنقاط
  if (res?.ind?.supertrend) {
    for (let i = from; i < candles.length; i++) {
      const s = res.ind.supertrend[i]; if (!s) continue;
      g.fillStyle = s.up ? colors.up : colors.down;
      g.globalAlpha = 0.5; g.fillRect(x(i) - 1, y(s.value) - 1, 2, 2); g.globalAlpha = 1;
    }
  }

  // علامات الأنماط
  if (opts.patterns) {
    const byIdx = {};
    opts.patterns.forEach((p) => { if (p.index >= from) (byIdx[p.index] ||= []).push(p); });
    g.textAlign = 'center'; g.font = 'bold 10px system-ui';
    for (const [idx, ps] of Object.entries(byIdx)) {
      const i = +idx, k = candles[i];
      const bullN = ps.filter((p) => p.type === 'bullish').length, bearN = ps.filter((p) => p.type === 'bearish').length;
      if (bullN >= bearN && bullN > 0) { g.fillStyle = colors.up; g.fillText('▲', x(i), y(k.l) + 13); }
      else if (bearN > 0) { g.fillStyle = colors.down; g.fillText('▼', x(i), y(k.h) - 5); }
      else { g.fillStyle = colors.text; g.fillText('◆', x(i), y(k.h) - 5); }
    }
  }

  // خطوط الصفقة
  if (res && res.direction !== 'WAIT') {
    const hl = (p, color, label, dash = [6, 4]) => {
      if (p == null || !isFinite(p)) return;
      g.setLineDash(dash); g.strokeStyle = color; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(padL, y(p)); g.lineTo(W - padR, y(p)); g.stroke(); g.setLineDash([]);
      g.fillStyle = color; g.fillRect(W - padR, y(p) - 8, padR, 16);
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = 'bold 10px system-ui';
      g.fillText(label, W - padR + 3, y(p) + 4);
    };
    hl(res.entry, colors.entry, 'دخول ' + fmt(res.entry), []);
    hl(res.stopLoss, colors.sl, 'وقف ' + fmt(res.stopLoss));
    (res.targets || []).forEach((t, i) => hl(t, colors.tp, `هدف${i + 1} ${fmt(t)}`));
  } else if (res) {
    const p = candles[candles.length - 1].c;
    g.fillStyle = colors.entry; g.fillRect(W - padR, y(p) - 8, padR, 16);
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = 'bold 10px system-ui'; g.fillText(fmt(p), W - padR + 3, y(p) + 4);
  }

  // مفتاح الألوان
  g.textAlign = 'left'; g.font = '11px system-ui';
  [['EMA20', colors.ema20], ['EMA50', colors.ema50], ['EMA200', colors.ema200]].forEach(([n, c], i) => {
    g.fillStyle = c; g.fillRect(padL + 6 + i * 70, padT + 2, 10, 3); g.fillStyle = colors.text; g.fillText(n, padL + 20 + i * 70, padT + 7);
  });
}

// رسم شمعة/نمط مصغر لمكتبة الشموع
export function drawMini(canvas, candles, type) {
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
