import { saveRouteCache, loadRouteCache } from './indexedDbCache';

export const OSRM_ENDPOINTS = {
  driving: 'https://router.project-osrm.org/route/v1/driving',
  walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike',
  truck: 'https://router.project-osrm.org/route/v1/driving',
  scooter: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike',
};

export function getEndpoint(profile) {
  return OSRM_ENDPOINTS[profile] || OSRM_ENDPOINTS.driving;
}

// Полный разбор одного маршрута OSRM: геометрия + шаги для навигации.
// Раньше шаги строились только для routes[0], поэтому альтернативы
// запускались без инструкций.
function parseOsrmRoute(r) {
  const geometry = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const steps = [];
  let cursor = 0;
  (r.legs || []).forEach((leg) => {
    (leg.steps || []).forEach((step) => {
      steps.push({
        instruction: step.maneuver?.type || '',
        modifier: step.maneuver?.modifier || '',
        name: step.name || '',
        distance: step.distance || 0,
        duration: step.duration || 0,
        start: geometry[cursor] || [0, 0],
      });
      cursor = Math.min(cursor + 1, geometry.length - 1);
    });
  });
  return { distance: r.distance, duration: r.duration, geometry, steps, legs: r.legs };
}

export async function buildOsrmRoute(from, to, profile = 'driving', opts = {}) {
  const { waypoints = [], alternatives = false, exclude = null } = opts;
  // ключ кэша обязан зависеть от alternatives/exclude: иначе закэшированный
  // одиночный маршрут «съест» запрос с вариантами (и наоборот)
  const cacheKey = `${profile}-${from.lat}-${from.lng}-${to.lat}-${to.lng}-${JSON.stringify(waypoints)}-${exclude || 'none'}${alternatives ? '-alt' : ''}`;
  
  const cached = await loadRouteCache(cacheKey);
  if (cached) return cached;

  const endpoint = getEndpoint(profile);
  const coords = [from, ...waypoints.filter(Boolean), to].map((p) => `${p.lng},${p.lat}`).join(';');
  let url = `${endpoint}/${coords}?overview=full&geometries=geojson&steps=true`;
  if (alternatives) url += '&alternatives=3';
  if (exclude) url += `&exclude=${exclude}`;
  if (profile === 'truck' && opts.truckParams) {
    const tp = opts.truckParams;
    if (tp.weight) url += `&weight=${tp.weight}`;
    if (tp.height) url += `&height=${tp.height}`;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) {
        if (resp.status === 429 && attempt === 0) { await new Promise((r) => setTimeout(r, 800)); continue; }
        return null;
      }
      const data = await resp.json();
      if (!data.routes?.length) return null;
      const parsed = data.routes.map(parseOsrmRoute);
      const result = parsed[0];
      if (alternatives && parsed.length > 1) result.alternatives = parsed.slice(1);
      await saveRouteCache(cacheKey, result);
      return result;
    } catch {
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 500)); continue; }
      return null;
    }
  }
  return null;
}

export function estimateCost(distM, mode) {
  const km = distM / 1000;
  if (mode === 'driving') return Math.round(km * 1.8 + 8);
  if (mode === 'taxi') return Math.round(km * 5 + 25);
  if (mode === 'truck') return Math.round(km * 3 + 30);
  if (mode === 'scooter') return Math.round(km * 0.8 + 5);
  return 0;
}
