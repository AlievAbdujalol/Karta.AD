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
 * Find the next stop ahead of the vehicle along a route's stop list.
 * Returns { stop, distanceKm, etaMinutes } or null.
 */
export function getNextStopEta(vehicle, route) {
  if (!route?.stops?.length || !vehicle?.lat || !vehicle?.lng) return null;

  const stops = route.stops.filter(s => s.lat && s.lng);
  if (!stops.length) return null;

  // Find the closest stop as "current" stop
  let closestIdx = 0;
  let minDist = Infinity;
  stops.forEach((s, i) => {
    const d = distanceKm(vehicle.lat, vehicle.lng, s.lat, s.lng);
    if (d < minDist) { minDist = d; closestIdx = i; }
  });

  // Next stop is the one after the closest
  const nextIdx = closestIdx + 1 < stops.length ? closestIdx + 1 : closestIdx;
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