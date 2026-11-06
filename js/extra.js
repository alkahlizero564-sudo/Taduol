export function supertrend(c, period = 10, mult = 3) {
  const n = c.length; if (n < period + 3) return null;
  const tr = c.map((k, i) => i ? Math.max(k.h - k.l, Math.abs(k.h - c[i - 1].c), Math.abs(k.l - c[i - 1].c)) : k.h - k.l);
  let atr = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  let fu = 0, fl = 0, dir = 1;
  for (let i = period + 1; i < n; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    const hl2 = (c[i].h + c[i].l) / 2, bu = hl2 + mult * atr, bl = hl2 - mult * atr, pc = c[i - 1].c;
    if (i === period + 1) { fu = bu; fl = bl; dir = pc >= hl2 ? 1 : -1; continue; }
    const pfu = fu, pfl = fl;
    fu = bu < pfu || pc > pfu ? bu : pfu;
    fl = bl > pfl || pc < pfl ? bl : pfl;
    if (dir === 1 && c[i].c < pfl) dir = -1;
    else if (dir === -1 && c[i].c > pfu) dir = 1;
  }
  return { dir, line: dir === 1 ? fl : fu };
}
export function bollinger(c, p = 20) {
  if (c.length < p) return null;
  const s = c.slice(-p).map((k) => k.c), m = s.reduce((a, b) => a + b, 0) / p;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / p);
  return sd ? { pos: (c[c.length - 1].c - m) / (2 * sd) } : null;
}
export function volumeSpike(c, p = 20) {
  if (c.length < p + 2) return null;
  const v = c[c.length - 2].v, avg = c.slice(-p - 2, -2).reduce((a, k) => a + (k.v || 0), 0) / p;
  return v > 0 && avg > 0 ? v > avg * 1.2 : null;
}
