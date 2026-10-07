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

// Точка на расстоянии meters и азимуте bearingDeg от (lat, lng).
// Нужна навигации: проверить, что «вперёд по курсу» на карте действительно сверху.
export function destPoint(lat, lng, meters, bearingDeg) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const delta = meters / 6371008.8;
  const theta = toRad(bearingDeg || 0);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lng);
  const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.min(1, Math.max(-1, sinPhi2)));
  const lambda2 = lambda1 + Math.atan2(
    Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
    Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
  );
  return { lat: toDeg(phi2), lng: ((toDeg(lambda2) + 540) % 360) - 180 };
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

// ─── Обратное геокодирование (пин на карте → текст адреса) ──────────

/** URL обратного геокодирования Nominatim; null, если координаты не числа. */
export function reverseGeocodeUrl(lat, lng) {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return null;
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${la.toFixed(6)}&lon=${lo.toFixed(6)}&zoom=18&accept-language=ru`;
}

/** Адрес из ответа Nominatim; пустой ответ → введённый вручную текст. */
export function pickAddressText(result, fallback = '') {
  const name = typeof result?.display_name === 'string' ? result.display_name.trim() : '';
  return name || (fallback || '');
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

/**
 * Найти ближайшую точку на полилинии и вернуть progress (0..1) и snapped координаты.
 * @param {number} lat - текущая широта
 * @param {number} lng - текущая долгота
 * @param {Array<[number,number]>} geometry - [[lat,lng], ...]
 * @returns {{ progress: number, snappedLat: number, snappedLng: number, segIndex: number, distToRoute: number }}
 */
export function projectOnPolyline(lat, lng, geometry) {
  if (!geometry || geometry.length < 2) {
    return { progress: 0, snappedLat: lat, snappedLng: lng, segIndex: 0, distToRoute: 0 };
  }

  let bestDist = Infinity;
  let bestProgress = 0;
  let bestLat = geometry[0][0];
  let bestLng = geometry[0][1];
  let bestSeg = 0;
  let totalDist = 0;
  let accumulated = 0;

  for (let i = 0; i < geometry.length - 1; i++) {
    const [aLat, aLng] = geometry[i];
    const [bLat, bLng] = geometry[i + 1];
    const segLen = haversineM(aLat, aLng, bLat, bLng);

    if (segLen < 0.01) {
      accumulated += segLen;
      continue;
    }

    const cosLat = Math.cos((lat * Math.PI) / 180);
    const px = lng * cosLat, py = lat;
    const p1x = aLng * cosLat, p1y = aLat;
    const p2x = bLng * cosLat, p2y = bLat;
    const dx = p2x - p1x, dy = p2y - p1y;
    const t = Math.max(0, Math.min(1, ((px - p1x) * dx + (py - p1y) * dy) / (dx * dx + dy * dy)));
    const projLat = aLat + t * (bLat - aLat);
    const projLng = aLng + t * (bLng - aLng);
    const d = haversineM(lat, lng, projLat, projLng);

    if (d < bestDist) {
      bestDist = d;
      bestLat = projLat;
      bestLng = projLng;
      bestSeg = i;
      bestProgress = (accumulated + t * segLen);
    }
    accumulated += segLen;
    totalDist = accumulated;
  }

  if (totalDist < 1) totalDist = 1;

  return {
    progress: bestProgress / totalDist,
    snappedLat: bestLat,
    snappedLng: bestLng,
    segIndex: bestSeg,
    distToRoute: bestDist,
  };
}

/**
 * Разбить полилинию на пройденную и оставшуюся части по progress (0..1).
 * @returns {{ traveled: Array, remaining: Array }}
 */
export function splitRouteByProgress(geometry, progress) {
  if (!geometry || geometry.length < 2) return { traveled: [], remaining: geometry || [] };
  const p = Math.max(0, Math.min(1, progress));

  let totalLen = 0;
  const segLens = [];
  for (let i = 0; i < geometry.length - 1; i++) {
    const sl = haversineM(geometry[i][0], geometry[i][1], geometry[i + 1][0], geometry[i + 1][1]);
    segLens.push(sl);
    totalLen += sl;
  }
  if (totalLen < 1) return { traveled: [], remaining: geometry };

  const targetDist = p * totalLen;
  let accum = 0;

  for (let i = 0; i < segLens.length; i++) {
    if (accum + segLens[i] >= targetDist) {
      const frac = segLens[i] > 0 ? (targetDist - accum) / segLens[i] : 0;
      const splitLat = geometry[i][0] + frac * (geometry[i + 1][0] - geometry[i][0]);
      const splitLng = geometry[i][1] + frac * (geometry[i + 1][1] - geometry[i][1]);
      const traveled = geometry.slice(0, i + 1);
      if (i + 1 < geometry.length) traveled.push([splitLat, splitLng]);
      const remaining = [[splitLat, splitLng], ...geometry.slice(i + 1)];
      return { traveled, remaining };
    }
    accum += segLens[i];
  }

  return { traveled: geometry, remaining: [] };
}
