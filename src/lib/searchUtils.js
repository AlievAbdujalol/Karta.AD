import { supabase } from '@/api/supabase';
import { isGeminiConfigured, parseSearchIntent } from '@/lib/gemini';

const HISTORY_KEY = 'karta_search_history';
const MAX_HISTORY = 20;

export function getSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch { return []; }
}

export function addToHistory(query) {
  const q = query.trim().toLowerCase();
  if (!q) return;
  const history = getSearchHistory().filter(h => h.toLowerCase() !== q);
  history.unshift(query.trim());
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

function score(text, query) {
  const t = String(text || '').toLowerCase();
  const q = query.toLowerCase().trim();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(' ' + q)) return 60;
  if (t.includes(q)) return 40;
  return 0;
}

function fuzzyMatch(text, query) {
  const t = String(text || '').toLowerCase();
  const q = query.toLowerCase().trim();
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export async function searchAll(query, options = {}) {
  const { cityId, limit = 8 } = options;
  const q = query.trim();
  if (!q || q.length < 1) return { routes: [], stops: [], vehicles: [], addresses: [], pois: [] };

  const results = { routes: [], stops: [], vehicles: [], addresses: [], pois: [] };

  const promises = [];

  // Search routes
  promises.push((async () => {
    let rq = supabase.from('routes').select('*');
    if (cityId) rq = rq.eq('city_id', cityId);
    const { data } = await rq.order('number').limit(20);
    if (data) {
      results.routes = data
        .filter(r => score(r.number, q) > 0 || score(r.name, q) > 0 || fuzzyMatch(r.number, q) || fuzzyMatch(r.name, q))
        .map(r => ({ ...r, _type: 'route', _score: Math.max(score(r.number, q), score(r.name, q)) }))
        .sort((a, b) => b._score - a._score)
        .slice(0, limit);
    }
  })());

  // Search stops
  promises.push((async () => {
    let sq = supabase.from('stops').select('*');
    if (cityId) {
      const { data: cityRoutes } = await supabase.from('routes').select('id').or(`city_id.is.null,city_id.eq.${cityId}`);
      if (cityRoutes?.length) {
        sq = sq.in('route_id', cityRoutes.map(r => r.id));
      }
    }
    const { data } = await sq.limit(50);
    if (data) {
      const seen = new Set();
      results.stops = data
        .filter(s => {
          const key = `${s.lat?.toFixed(5)}_${s.lng?.toFixed(5)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return score(s.name, q) > 0 || fuzzyMatch(s.name, q);
        })
        .map(s => ({ ...s, _type: 'stop', _score: score(s.name, q) }))
        .sort((a, b) => b._score - a._score)
        .slice(0, limit);
    }
  })());

  // Search vehicles (active)
  promises.push((async () => {
    let vq = supabase.from('vehicles').select('*').eq('is_active', true);
    if (cityId) {
      const { data: cityRoutes } = await supabase.from('routes').select('id').or(`city_id.is.null,city_id.eq.${cityId}`);
      if (cityRoutes?.length) {
        vq = vq.in('route_id', cityRoutes.map(r => r.id));
      }
    }
    const { data } = await vq.limit(30);
    if (data) {
      results.vehicles = data
        .filter(v => score(v.route_number, q) > 0 || score(v.driver_name, q) > 0 || score(v.vehicle_number, q) > 0 || fuzzyMatch(v.route_number, q) || fuzzyMatch(v.driver_name, q))
        .map(v => ({ ...v, _type: 'vehicle', _score: Math.max(score(v.route_number, q), score(v.driver_name, q)) }))
        .sort((a, b) => b._score - a._score)
        .slice(0, limit);
    }
  })());

  // Search addresses via Nominatim
  if (q.length >= 3) {
    promises.push((async () => {
      try {
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), 3000);
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=${limit}&addressdetails=1&accept-language=ru`,
          { signal: ctl.signal, headers: { 'User-Agent': 'Karta.AD/1.0' } }
        );
        clearTimeout(to);
        if (resp.ok) {
          const data = await resp.json();
          results.addresses = (data || [])
            .filter(a => a.lat && a.lon)
            .map(a => ({
              _type: 'address',
              _score: 50,
              name: a.display_name?.split(',')[0] || a.display_name,
              fullAddress: a.display_name,
              lat: parseFloat(a.lat),
              lng: parseFloat(a.lon),
              category: a.type,
              osm_type: a.osm_type,
            }))
            .slice(0, limit);
        }
      } catch {}
    })());
  }

  await Promise.allSettled(promises);
  return results;
}

const NATURAL_RE = /[?]|как|где|куда|откуда|найди|найти|покажи|показать|доехать|добраться|остановк|маршрут|автобус|рядом|near|where|how/i;

/** Похоже ли на фразу на естественном языке, а не на короткое название/номер */
export function looksNaturalLanguage(query) {
  const q = (query || '').trim();
  if (!q) return false;
  if (NATURAL_RE.test(q)) return true;
  return q.split(/\s+/).length >= 4;
}

function mergeBuckets(list) {
  const seen = new Set();
  const out = [];
  for (const bucket of list) {
    for (const item of bucket) {
      const key = item._type === 'route' ? `r:${item.id}`
        : item._type === 'vehicle' ? `v:${item.id}`
        : `${item._type}:${item.lat?.toFixed?.(5)}_${item.lng?.toFixed?.(5)}_${(item.name || '').slice(0, 24)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function mergeResults(all, limit) {
  const merged = { routes: [], stops: [], vehicles: [], addresses: [], pois: [] };
  for (const k of Object.keys(merged)) {
    merged[k] = mergeBuckets(all.map(r => r[k] || []), limit)
      .sort((a, b) => (b._score || 0) - (a._score || 0))
      .slice(0, limit);
  }
  return merged;
}

/**
 * Умный поиск: фразу на естественном языке разбирает Gemini на ключевые
 * термины и ищет по каждому, результаты сливает. Без ключа/при ошибке —
 * обычный поиск. Возвращает результаты + _aiIntent (что понял).
 */
export async function smartSearch(query, options = {}) {
  const limit = options.limit || 8;
  const q = (query || '').trim();
  if (!q) return { routes: [], stops: [], vehicles: [], addresses: [], pois: [], _aiIntent: null };
  if (!looksNaturalLanguage(q) || !isGeminiConfigured()) {
    return { ...(await searchAll(q, options)), _aiIntent: null };
  }
  try {
    const intent = await parseSearchIntent(q);
    if (!intent) return { ...(await searchAll(q, options)), _aiIntent: null };
    const extraTerms = [intent.routeNumber, intent.stopName, intent.place, intent.from, intent.to]
      .filter(Boolean)
      .filter(t => !intent.terms.includes(t));
    const terms = [...intent.terms, ...extraTerms].slice(0, 5);
    const parts = await Promise.all(terms.map(t => searchAll(t, options).catch(() => null)));
    const valid = parts.filter(Boolean);
    if (!valid.length) return { ...(await searchAll(q, options)), _aiIntent: intent };
    return { ...mergeResults(valid, limit), _aiIntent: intent };
  } catch {
    return { ...(await searchAll(q, options)), _aiIntent: null };
  }
}

export function flattenResults(results) {
  const all = [];
  results.routes.forEach(r => all.push(r));
  results.stops.forEach(s => all.push(s));
  results.vehicles.forEach(v => all.push(v));
  results.addresses.forEach(a => all.push(a));
  results.pois?.forEach(p => all.push(p));
  return all;
}
