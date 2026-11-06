import { haversineM } from '@/lib/geo';
import { isVehicleLive, estimateArrivalMinutes } from '@/lib/trackingLogic';

// ── Накопление пройденных км по GPS-фиксам ───────────────────────────

/** Прыжок дальше порога за один фикс — типичный GPS-выброс, не путь. */
export const MAX_FIX_JUMP_M = 250;
/** Правдоподобная скорость между фиксами: выше — фикс отбрасывается. */
export const MAX_FIX_SPEED_KMH = 120;

/** Пустой накопитель пути: якорная точка + накопленные метры. */
export function emptyDistanceAcc() {
  return { lat: null, lng: null, ts: null, meters: 0 };
}

/**
 * Добавить один GPS-фикс в накопитель пути.
 * Невалидные координаты, прыжки дальше MAX_FIX_JUMP_M и фиксы с
 * неправдоподобной скоростью не накапливаются и не сдвигают якорь —
 * статистика «км в пути» не считает выбросы (иммутабельно).
 */
export function appendFix(acc, fix) {
  const base = acc && Number.isFinite(acc.meters) ? acc : emptyDistanceAcc();
  const lat = Number(fix?.lat);
  const lng = Number(fix?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return base;

  const ts = Number(fix?.ts);
  const fixTs = Number.isFinite(ts) ? ts : null;

  if (!Number.isFinite(base.lat) || !Number.isFinite(base.lng)) {
    return { lat, lng, ts: fixTs, meters: base.meters };
  }

  const distM = haversineM(base.lat, base.lng, lat, lng);
  if (distM > MAX_FIX_JUMP_M) return base;

  if (fixTs !== null && base.ts !== null) {
    // откат часов (fixTs ≤ якоря) — фиксу доверять нельзя, включая проверку скорости
    if (fixTs <= base.ts) return base;
    const speedKmh = (distM / ((fixTs - base.ts) / 1000)) * 3.6;
    if (speedKmh > MAX_FIX_SPEED_KMH) return base;
  }

  return { lat, lng, ts: fixTs, meters: base.meters + distM };
}

/**
 * Снимок статистики рейса: км в пути, длительность, остановки, скорость.
 * Время — из времени старта рейса, км — из накопителя GPS-фиксов
 * (не из traveledM вдоль маршрута: проезд мимо не накручивает путь).
 */
export function tripStatsSnapshot({
  acc,
  tripStartedAt,
  now = Date.now(),
  stopsTotal = 0,
  passedCount = 0,
  speedKmh = 0,
} = {}) {
  const meters = Number(acc?.meters);
  const started = Number(tripStartedAt);
  const durationSec = Number.isFinite(started) && started > 0 && now > started
    ? Math.floor((now - started) / 1000)
    : 0;
  const speed = Number(speedKmh);

  return {
    km: (Number.isFinite(meters) ? meters : 0) / 1000,
    durationSec,
    stopsPassed: Number.isFinite(passedCount) ? passedCount : 0,
    stopsTotal: Number.isFinite(stopsTotal) ? stopsTotal : 0,
    speedKmh: Number.isFinite(speed) && speed > 0 ? speed : 0,
  };
}

// ── Персист км в пути (localStorage) ─────────────────────────────────

export const TRIP_DIST_KEY = 'karta_trip_distance';

/**
 * Сохранить накопитель пути для рейса `tripStartedAt`.
 * Привязка к времени старта: км прошлого рейса не «прилипают» к новому.
 */
export function saveDistanceAcc(acc, tripStartedAt) {
  if (!acc || !Number.isFinite(tripStartedAt) || tripStartedAt <= 0) return;
  try {
    localStorage.setItem(TRIP_DIST_KEY, JSON.stringify({
      tripStartedAt,
      lat: acc.lat ?? null,
      lng: acc.lng ?? null,
      ts: acc.ts ?? null,
      meters: Number.isFinite(acc.meters) ? acc.meters : 0,
    }));
  } catch { /* private mode */ }
}

/** Восстановить накопитель пути рейса; чужой/битый рейс → пустой. */
export function loadDistanceAcc(tripStartedAt) {
  const empty = emptyDistanceAcc();
  if (!Number.isFinite(tripStartedAt) || tripStartedAt <= 0) return empty;
  try {
    const raw = localStorage.getItem(TRIP_DIST_KEY);
    if (!raw) return empty;
    const stored = JSON.parse(raw);
    if (stored?.tripStartedAt !== tripStartedAt) return empty;
    return {
      lat: Number.isFinite(stored.lat) ? stored.lat : null,
      lng: Number.isFinite(stored.lng) ? stored.lng : null,
      ts: Number.isFinite(stored.ts) ? stored.ts : null,
      meters: Number.isFinite(stored.meters) ? stored.meters : 0,
    };
  } catch {
    return empty;
  }
}

// ── Ближайшие машины на маршруте ────────────────────────────────────

/**
 * Другие машины ТОГО ЖЕ маршрута с живым GPS, отсортированные от ближних.
 * Свою машину (driver_id / vehicle_number) исключаем. Устаревший или
 * неактивный GPS в список не попадает — без реальных данных показываем
 * пустой список, а не выдуманные числа.
 * @returns {Array<{id, vehicleNumber, driverName, distanceM, etaMinutes}>}
 */
export function nearestBusesOnRoute({
  vehicles,
  routeId,
  selfDriverId,
  selfVehicleNumber,
  origin,
  now = Date.now(),
  fallbackSpeedKmh = 20,
  limit = 5,
} = {}) {
  if (!Array.isArray(vehicles) || !routeId) return [];
  const originLat = Number(origin?.lat);
  const originLng = Number(origin?.lng);
  if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) return [];

  const result = [];
  for (const vehicle of vehicles) {
    if (!vehicle || vehicle.route_id !== routeId) continue;
    if (selfDriverId && vehicle.driver_id === selfDriverId) continue;
    if (selfVehicleNumber && vehicle.vehicle_number === selfVehicleNumber) continue;
    if (!isVehicleLive(vehicle, now)) continue;

    const distanceM = haversineM(originLat, originLng, vehicle.lat, vehicle.lng);
    const etaMinutes = estimateArrivalMinutes({
      distanceM,
      speedKmh: vehicle.speed,
      lastUpdated: vehicle.last_updated,
      now,
      fallbackSpeedKmh,
    });

    result.push({
      id: vehicle.id,
      vehicleNumber: vehicle.vehicle_number || '—',
      driverName: vehicle.driver_name || null,
      lat: vehicle.lat,
      lng: vehicle.lng,
      distanceM,
      etaMinutes,
    });
  }

  result.sort((a, b) => a.distanceM - b.distanceM);
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5;
  return result.slice(0, max);
}
