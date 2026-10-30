// Зеркала Overpass — единый источник для клиента и серверного прокси:
// api/overpass.js читает тот же overpassMirrors.json, списки не расходятся.
// Только зеркала с полной планетой (замеры 16.10.2026 и 31.10.2026, POST+Origin):
//  1. overpass.openstreetmap.fr — самое быстрое живое (200 за ~0.7 с, CORS `*`);
//  2. overpass-api.de — официальное, но с egress Vercel почти всегда таймаут 5 с,
//     поэтому не первым: раньше он съедал 5 секунд у каждого запроса прокси;
//  3. maps.mail.ru — CORS со звёздочкой, бывает 504 при перегрузке;
//  4-5. kumi/private.coffee — быстрый 500 в тот день (дешёвый фейл);
//  6. openstreetmap.ru — таймаут ~7 с, поэтому строго последним.
// overpass.osm.ch сознательно НЕ в списке: там швейцарская выборка —
// для Бишкека он отдаёт валидный пустой JSON, и «первое живое зеркало»
// замаскировало бы реальные данные нулём.
// В проде клиент ходит ТОЛЬКО на свой /api/overpass (см. overpassEndpoints):
// браузерные запросы к зеркалам падают по CORS (на страницах ошибок 5xx нет
// Access-Control-Allow-Origin) и засоряют консоль ERR_FAILED — перебор зеркал
// делает сервер.
import OVERPASS_MIRRORS from './overpassMirrors.json';

export const OVERPASS_URLS = OVERPASS_MIRRORS;
export const OVERPASS_PROXY_PATH = '/api/overpass';

/**
 * Цепочка эндпоинтов для запросов Overpass.
 * Прод: только свой прокси — один same-origin запрос, перебор зеркал на сервере.
 * Прямые зеркала в проде бесполезны: 5xx-ответы приходят без CORS-заголовков,
 * браузер их не читает и пишет ERR_FAILED в консоль.
 * Dev: Vite-сервер /api-функции не поднимает — только прямые зеркала.
 * @param {boolean} [prod] подменяемый параметр для тестов
 * @returns {string[]}
 */
export function overpassEndpoints(prod = import.meta.env?.PROD) {
  return prod ? [OVERPASS_PROXY_PATH] : OVERPASS_URLS;
}

export async function fetchOverpass(query, opts = {}) {
  const { urls, timeout = 15000, signal } = opts;
  const endpoints = urls || overpassEndpoints();
  let lastErr = null;
  for (const url of endpoints) {
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
