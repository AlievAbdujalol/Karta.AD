/**
 * Haversine distance between two lat/lng points in km
 */
export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Проекция точки на отрезок (в равнопромежуточной аппроксимации, хватает для города).
 * Возвращает { t (0..1 вдоль a→b), dist (метры до отрезка) }.
 */
function projectOnSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
  const kx = Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
  const px = pLng * kx, py = pLat;
  const ax = aLng * kx, ay = aLat;
  const bx = bLng * kx, by = bLat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const dLatM = (py - (ay + t * dy)) * 111320;
  const dLngM = (px - (ax + t * dx)) * 111320;
  return { t, dist: Math.hypot(dLatM, dLngM) };
}

/**
 * Find the next stop ahead of the vehicle along a route's stop list.
 * Проецируем машину на каждый перегон и берём конец ближайшего —
 * это остановка ВПЕРЕДИ по ходу движения, а не просто «ближайшая + 1»
 * (старая логика пропускала приближающуюся остановку и ломалась на кольцах).
 * Returns { stop, distanceKm, etaMinutes } or null.
 */
export function getNextStopEta(vehicle, route) {
  if (!route?.stops?.length || !vehicle?.lat || !vehicle?.lng) return null;

  const stops = route.stops.filter(s => s.lat && s.lng);
  if (!stops.length) return null;
  if (stops.length === 1) {
    const only = stops[0];
    const dist = distanceKm(vehicle.lat, vehicle.lng, only.lat, only.lng);
    const speedKmh = vehicle.speed > 2 ? vehicle.speed : 20;
    return { stop: only, distanceKm: dist, etaMinutes: Math.max(1, Math.round((dist / speedKmh) * 60)) };
  }

  // Ближайший перегон — следующая остановка это его конец
  let bestEnd = 1, bestDist = Infinity, bestT = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    const p = projectOnSegment(vehicle.lat, vehicle.lng, a.lat, a.lng, b.lat, b.lng);
    if (p.dist < bestDist) { bestDist = p.dist; bestEnd = i + 1; bestT = p.t; }
  }

  // Машина уже почти на конечной перегона (стоит на остановке) — смотрим следующую
  let nextIdx = bestEnd;
  if (bestT > 0.97 && nextIdx + 1 < stops.length) nextIdx += 1;
  const nextStop = stops[nextIdx];

  const dist = distanceKm(vehicle.lat, vehicle.lng, nextStop.lat, nextStop.lng);
  const speedKmh = vehicle.speed > 2 ? vehicle.speed : 20; // fallback 20 km/h
  const etaMinutes = Math.round((dist / speedKmh) * 60);

  return {
    stop: nextStop,
    distanceKm: dist,
    etaMinutes: etaMinutes < 1 ? 1 : etaMinutes,
  };
}