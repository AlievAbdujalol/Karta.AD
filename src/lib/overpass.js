// Зеркала Overpass — единый источник для клиента и серверного прокси:
// api/overpass.js подключает тот же overpassMirrors.json (require), так что
// списки не расходятся. Порядок — живые замеры 16.10.2026 (POST+Origin):
//  1. overpass-api.de — официальное (тест на позицию); в тот день отдавало
//     502 на нашей сети, как и в инциденте с картой — за его ошибки теперь
//     отвечает прокси, браузер их не видит;
//  2. overpass.osm.ch — 200 за ~0.6 с, CORS `*`;
//  3. overpass.openstreetmap.fr — 200 за ~1 с, CORS `*`;
//  4. maps.mail.ru — CORS со звёздочкой, бывает 504 при перегрузке;
//  5-6. kumi/private.coffee — быстрый 500 в тот день (дешёвый фейл);
//  7. openstreetmap.ru — таймаут ~7 с, поэтому строго последним.
// В проде первым эндпоинтом идёт свой /api/overpass (см. overpassEndpoints):
// один same-origin запрос вместо серии кросс-доменных падений в консоли.
import OVERPASS_MIRRORS from './overpassMirrors.json';

export const OVERPASS_URLS = OVERPASS_MIRRORS;
export const OVERPASS_PROXY_PATH = '/api/overpass';

/**
 * Цепочка эндпоинтов для запросов Overpass.
 * Прод: первым — свой прокси (нет CORS, перебор зеркал делает сервер),
 * прямые зеркала остаются запасным путём, если прокси упал.
 * Dev: Vite-сервер /api-функции не поднимает — только прямые зеркала.
 * @param {boolean} [prod] подменяемый параметр для тестов
 * @returns {string[]}
 */
export function overpassEndpoints(prod = import.meta.env?.PROD) {
  return prod ? [OVERPASS_PROXY_PATH, ...OVERPASS_URLS] : OVERPASS_URLS;
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
