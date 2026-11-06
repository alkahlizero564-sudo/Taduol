// كل أزواج USDT على Binance مرتبة حسب حجم التداول
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];
let cache = null;
export async function loadBinanceSymbols() {
  if (cache) return cache;
  let err;
  for (const h of HOSTS) {
    try {
      const r = await fetch(h + '/api/v3/ticker/24hr');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      cache = j
        .filter((x) => x.symbol.endsWith('USDT') && !/(UP|DOWN|BULL|BEAR)USDT$/.test(x.symbol))
        .sort((a, b) => +b.quoteVolume - +a.quoteVolume)
        .map((x) => x.symbol);
      return cache;
    } catch (e) { err = e; }
  }
  throw err;
}
