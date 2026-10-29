// Видимость точек карты по уровню зума.
// UX-фидбек: с фиксированным по размеру маркером издалека выглядит «огромным»
// и мешает — на дальнем отдалении точки исчезают, а линии становятся тоньше.
// Остановки при выбранном маршруте и наблюдаемая остановка — исключения.

/** Остановки и детали линий (плашки номеров) видны с этого зума. */
export const STOPS_MIN_ZOOM = 11;
/** Машины и точки бизнесов — с этого зума. */
export const POINTS_MIN_ZOOM = 12;

/** Эпсилон совпадения координат остановки (≈13 м). */
const STOP_EPS = 0.00012;

/** Одна и та же остановка? (для подсветки наблюдаемой) */
export function isSameStop(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) < STOP_EPS && Math.abs(a.lng - b.lng) < STOP_EPS;
}

/**
 * Остановки, которые нужно нарисовать на текущем зуме.
 * @param {Array<{lat:number,lng:number}>} allStops остановки выбранного/всех маршрутов
 * @param {{zoom:number, route:object|null, watchedStop:{lat:number,lng:number}|null}} ctx
 * @returns {Array} новый массив (входной не мутируется)
 */
export function visibleStopsAt(allStops, { zoom, route, watchedStop }) {
  if (zoom >= STOPS_MIN_ZOOM || route) return allStops;
  if (!watchedStop) return [];
  return allStops.filter((s) => isSameStop(s, watchedStop));
}

/** Толстые линии маршрутов и плашки номеров: видны с этого зума. */
export function routeDetailsVisible(zoom) {
  return zoom >= STOPS_MIN_ZOOM;
}

/** Машины и точки бизнесов: видны с этого зума. */
export function transitPointsVisible(zoom) {
  return zoom >= POINTS_MIN_ZOOM;
}
