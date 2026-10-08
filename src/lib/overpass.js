// Единый список зеркал Overpass для всех потребителей (карта, остановки,
// ИИ-поиск). Каждый запрос идёт сверху вниз, пока зеркало не ответит.
// Порядок по замерам из браузера на localhost (08.10.2026):
//  1. overpass-api.de — единственный живой: 200 за ~800 мс;
//  2. maps.mail.ru — отвечает с CORS (бывает 504 при перегрузке);
//  3-4. kumi/private.coffee — сейчас отдают 500/CORS-отказ, но быстро;
//  5. openstreetmap.ru — таймаут ~7 с, поэтому строго последним.
// Пока первое зеркало отвечает, консоль браузера чистая — ошибки сети
// логируются браузером на каждом упавшем запросе, выкинуть их нельзя.
export const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

export async function fetchOverpass(query, opts = {}) {
  const { urls = OVERPASS_URLS, timeout = 15000, signal } = opts;
  let lastErr = null;
  for (const url of urls) {
    try {
      const ctrl = signal ? null : new AbortController();
      const sig = signal || (ctrl ? AbortSignal.timeout(timeout) : undefined);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: sig,
      });
      if (resp.status === 429 || resp.status === 406) throw new Error('rate_limited');
      if (!resp.ok) throw new Error('overpass_' + resp.status);
      const data = await resp.json();
      return data;
    } catch (e) {
      lastErr = e;
      if (e.message === 'rate_limited') await new Promise((r) => setTimeout(r, 1200));
      continue;
    }
  }
  throw lastErr || new Error('overpass_failed');
}

export function buildBboxQuery(s, w, n, e, selectors, maxResults = 100, timeoutSec = 12) {
  const subs = selectors.map((sel) => `node${sel}(${s},${w},${n},${e});way${sel}(${s},${w},${n},${e});`).join('');
  return `[out:json][timeout:${timeoutSec}];(${subs});out center ${maxResults ? `tags(${maxResults});` : ';'}`;
}
