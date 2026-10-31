/**
 * tripStartHandoff.js — передача выбранной стартовой остановки на карту.
 *
 * Сценарий: водитель в «Расписании» жмёт «Старт» на нужной остановке —
 * автоматический рейс прерывается, а выбор должен доехать до карты: карта
 * «уходит» к этой остановке и помечает рейс неплановым (жёлтым).
 *
 * Ключ одноразовый: takePendingStart() читает и сразу удаляет, чтобы карта
 * не возвращалась к старому выбору при следующих заходах.
 */

export const PENDING_START_KEY = 'karta_route_start';

/** Координаты есть и не нулевые (админ мог сохранить остановку без гео). */
function hasCoords(s) {
  return !!s && Number.isFinite(s.lat) && Number.isFinite(s.lng) && (s.lat !== 0 || s.lng !== 0);
}

/** Одинаковая остановка с допуском ~40 м (как в stopVisibility). */
const SAME_STOP_EPS = 0.00035;

/**
 * Сохраняет выбор водителя в localStorage.
 * @param {{routeId?: string|null, stopIndex?: number, stop?: {lat?:number,lng?:number,name?:string}}} payload
 */
export function savePendingStart({ routeId = null, stopIndex = 0, stop = null } = {}) {
  const payload = {
    routeId: routeId ?? null,
    stopIndex: Number.isInteger(stopIndex) && stopIndex >= 0 ? stopIndex : 0,
    stop: stop && hasCoords(stop)
      ? { lat: stop.lat, lng: stop.lng, name: stop.name || null }
      : null,
    at: Date.now(),
  };
  try { localStorage.setItem(PENDING_START_KEY, JSON.stringify(payload)); } catch { /* private mode */ }
  return payload;
}

/** Читает и удаляет ключ. Одноразовый. */
export function takePendingStart() {
  try {
    const raw = localStorage.getItem(PENDING_START_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_START_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Сопоставляет сохранённый выбор с загруженными маршрутами.
 * Порядок: сначала по координатам остановки, затем по индексу в своём маршруте.
 * @param {{routeId?:string|null, stopIndex?:number, stop?:{lat:number,lng:number}|null}} pending
 * @param {Array<{id:string, stops?:Array<{lat?:number,lng?:number}>}>} routes
 * @returns {{route: object, stop: object, index: number}|null}
 */
export function resolvePendingStart(pending, routes) {
  if (!pending || typeof pending !== 'object') return null;
  if (!Array.isArray(routes) || !routes.length) return null;

  const routeId = pending.routeId ?? null;
  const stopIndex = Number.isInteger(pending.stopIndex) && pending.stopIndex >= 0 ? pending.stopIndex : 0;
  const own = routeId ? routes.find((r) => r && r.id === routeId) : null;
  const candidates = own ? [own] : routes;

  if (hasCoords(pending.stop)) {
    for (const r of candidates) {
      const stops = Array.isArray(r?.stops) ? r.stops : [];
      const idx = stops.findIndex(
        (s) => hasCoords(s)
          && Math.abs(s.lat - pending.stop.lat) < SAME_STOP_EPS
          && Math.abs(s.lng - pending.stop.lng) < SAME_STOP_EPS,
      );
      if (idx >= 0) return { route: r, stop: stops[idx], index: idx };
    }
  }

  if (own) {
    const stops = Array.isArray(own.stops) ? own.stops : [];
    const stop = stops[stopIndex];
    if (stop && typeof stop === 'object') return { route: own, stop, index: stopIndex };
  }

  return null;
}

/**
 * Что должна сделать карта с сохранённым выбором стартовой остановки.
 * @returns {{routeId:string, index:number, stop:object, unscheduled:boolean, focus:[number,number]}|null}
 *   null — карта не может ничего показать (нет маршрута/координат);
 *   unscheduled=true — старт не с первой остановки, нужна жёлтая маркировка.
 */
export function pendingStartAction(pending, routes) {
  const resolved = resolvePendingStart(pending, routes);
  if (!resolved) return null;
  const s = resolved.stop;
  if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lng) || (s.lat === 0 && s.lng === 0)) {
    return null; // остановка сохранена без гео — лететь некуда, маркер не поставить
  }
  return {
    routeId: resolved.route.id,
    index: resolved.index,
    stop: s,
    unscheduled: resolved.index > 0,
    focus: [s.lat, s.lng],
  };
}
