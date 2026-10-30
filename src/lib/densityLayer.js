/**
 * densityLayer.js — слой плотности транспорта без внешних плагинов.
 *
 * Раньше здесь использовался leaflet.heat: он распространяется как обычный
 * скрипт, читает глобальный `L` и в ESM-сборке не работает — на проде это
 * давало `L.heatLayer is not a function` и валило карту через ErrorBoundary.
 * Теперь плотность рисуется штатными circleMarker: предсказуемо, без
 * глобалов, без динамических импортов и без падений.
 */

/** Минимальный/максимальный радиус пятна плотности (px). */
export const DENSITY_MIN_RADIUS = 16;
export const DENSITY_MAX_RADIUS = 30;

/** Порог, ниже которого точку не рисуем (шум парковок и нулевые скорости). */
export const DENSITY_MIN_WEIGHT = 0.2;

export const DENSITY_COLORS = {
  low: '#22c55e', // свободно
  mid: '#f59e0b', // плотно
  high: '#ef4444', // пробка
};

function clamp01(v) {
  if (!Number.isFinite(v)) return 0.5;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Цвет и прозрачность пятна по весу 0..1 (зелёный → жёлтый → красный). */
export function densityStyle(weight) {
  const w = clamp01(weight);
  if (w >= 0.75) return { color: DENSITY_COLORS.high, opacity: 0.22 };
  if (w >= 0.5) return { color: DENSITY_COLORS.mid, opacity: 0.2 };
  return { color: DENSITY_COLORS.low, opacity: 0.18 };
}

/** Радиус пятна: чем плотнее участок, тем крупнее. */
export function densityRadius(weight) {
  const w = clamp01(weight);
  return Math.round(DENSITY_MIN_RADIUS + (DENSITY_MAX_RADIUS - DENSITY_MIN_RADIUS) * w);
}

/**
 * Готовые параметры кружков для Leaflet.
 * @param {Array<[number, number, number?]>} points [lat, lng, weight]
 * @returns {Array<{lat:number,lng:number,radius:number,color:string,opacity:number}>}
 */
export function densityCircleSpecs(points) {
  if (!Array.isArray(points)) return [];
  const specs = [];
  for (const p of points) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const [lat, lng, rawWeight] = p;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    const weight = rawWeight == null ? 0.5 : clamp01(rawWeight);
    if (weight < DENSITY_MIN_WEIGHT) continue;
    const { color, opacity } = densityStyle(weight);
    specs.push({ lat, lng, radius: densityRadius(weight), color, opacity });
  }
  return specs;
}
