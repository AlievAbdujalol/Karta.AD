/**
 * leafletHeat.js — безопасное подключение плагина тепловой карты.
 *
 * Почему отдельный модуль: `leaflet.heat` распространяется как обычный
 * скрипт (dist/leaflet-heat.js) и обращается к глобальному `L`. ESM-сборка
 * Leaflet глобал не создаёт, поэтому простой `import 'leaflet.heat'`
 * падал с `ReferenceError: L is not defined`, а без импорта получалось
 * `L.heatLayer is not a function` — HeatmapLayer бросал исключение и
 * ErrorBoundary гасил всю карту (прод-инцидент).
 *
 * Здесь: выставляем `window.L`, грузим плагин динамически и никогда не
 * бросаем наружу — вызывающая сторона просто не рисует слой, если плагин
 * недоступен.
 */
import L from 'leaflet';

let defaultLoad = null;

function ensureGlobalLeaflet() {
  if (typeof window === 'undefined') return false;
  if (!window.L) window.L = L;
  return true;
}

/** Зарегистрирован ли L.heatLayer (плагин уже загружен). */
export function heatLayerAvailable() {
  return typeof L.heatLayer === 'function';
}

async function runImport(importer) {
  try {
    await importer();
  } catch {
    return false;
  }
  return heatLayerAvailable();
}

/**
 * Загружает плагин один раз. Возвращает `true`, если `L.heatLayer` доступен.
 * @param {() => Promise<unknown>} [importer] подменяемый импорт для тестов
 * @returns {Promise<boolean>}
 */
export async function loadHeatPlugin(importer) {
  if (heatLayerAvailable()) return true;
  if (!ensureGlobalLeaflet()) return false;
  if (importer) return runImport(importer);
  if (!defaultLoad) defaultLoad = runImport(() => import('leaflet.heat'));
  return defaultLoad;
}
