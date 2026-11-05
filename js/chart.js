// =====================================================================
//  رسم صور مصغرة لأنماط الشموع (مكتبة الشموع)
//  الشارت الرئيسي أصبح في lwchart.js (TradingView Lightweight Charts)
// =====================================================================
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

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
