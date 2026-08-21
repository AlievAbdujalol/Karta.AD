// Привязка координат к ближайшей дороге через OSRM /nearest.
// Кэш по округлённой координате + дедупликация параллельных запросов,
// чтобы не перегружать публичный сервер повторными вызовами.

const cache = new Map();
const inflight = new Map();

function keyOf(lat, lng) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/**
 * Возвращает [lat, lng], привязанные к ближайшей дороге.
 * При ошибке/таймауте возвращает исходные координаты.
 */
export async function snapToRoad(lat, lng) {
  if (lat == null || lng == null) return [lat, lng];
  const key = keyOf(lat, lng);
  if (cache.has(key)) return cache.get(key);
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const resp = await fetch(
        `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}?number=1`,
        { signal: AbortSignal.timeout(3500) }
      );
      if (resp.ok) {
        const data = await resp.json();
        const loc = data.waypoints?.[0]?.location;
        if (loc) {
          const snapped = [loc[1], loc[0]];
          cache.set(key, snapped);
          return snapped;
        }
      }
    } catch {}
    return [lat, lng];
  })();

  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

/**
 * Снапает список [lat, lng] с ограничением параллельности (по умолчанию 4).
 * Возвращает массив такой же длины.
 */
export async function snapPositions(list, parallelLimit = 4) {
  const out = new Array(list.length);
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const idx = i++;
      out[idx] = await snapToRoad(list[idx][0], list[idx][1]);
    }
  }
  const workers = Array.from({ length: Math.min(parallelLimit, Math.max(list.length, 1)) }, worker);
  await Promise.all(workers);
  return out;
}
