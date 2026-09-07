const R = 6371000;

export function haversineM(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  return haversineM(lat1, lng1, lat2, lng2) / 1000;
}

export function bearing(fromLat, fromLng, toLat, toLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(toLng - fromLng);
  const y = Math.sin(dLng) * Math.cos(toRad(toLat));
  const x = Math.cos(toRad(fromLat)) * Math.sin(toRad(toLat)) - Math.sin(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function distToSegmentM(lat, lng, lat1, lng1, lat2, lng2) {
  const x = lng, y = lat, x1 = lng1, y1 = lat1, x2 = lng2, y2 = lat2;
  const cosLat = Math.cos((y * Math.PI) / 180);
  const px = x * cosLat, py = y, p1x = x1 * cosLat, p1y = y1, p2x = x2 * cosLat, p2y = y2;
  const dx = p2x - p1x, dy = p2y - p1y;
  if (dx === 0 && dy === 0) return haversineM(lat, lng, lat1, lng1);
  const t = Math.max(0, Math.min(1, ((px - p1x) * dx + (py - p1y) * dy) / (dx * dx + dy * dy)));
  const projLat = y1 + t * (y2 - y1);
  const projLng = x1 + t * (x2 - x1);
  return haversineM(lat, lng, projLat, projLng);
}

export function isNearPolyline(lat, lng, positions, radiusM = 55) {
  for (let i = 0; i < positions.length - 1; i++) {
    const [la1, ln1] = positions[i];
    const [la2, ln2] = positions[i + 1];
    if (distToSegmentM(lat, lng, la1, ln1, la2, ln2) <= radiusM) return true;
  }
  return false;
}

export const STOP_EPSILON = 0.00035;
export function stopsMatch(a, b, eps = STOP_EPSILON) {
  return Math.abs(a.lat - b.lat) < eps && Math.abs(a.lng - b.lng) < eps;
}

export function formatDist(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} км`;
  return `${Math.round(m)} м`;
}

export function formatDuration(s) {
  if (s < 60) return '< 1 мин';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

export function smoothPositions(positions, windowSize = 3) {
  if (positions.length < windowSize) return positions;
  const out = [];
  for (let i = 0; i < positions.length; i++) {
    let lat = 0, lng = 0, cnt = 0;
    for (let j = Math.max(0, i - windowSize + 1); j <= i; j++) {
      lat += positions[j][0]; lng += positions[j][1]; cnt++;
    }
    out.push([lat / cnt, lng / cnt]);
  }
  return out;
}
