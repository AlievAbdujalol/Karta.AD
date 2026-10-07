// Central tile-layer helpers.
//
// CARTO с конца августа 2026 требует API key для растровых тайлов:
// без ключа отдаёт тайлы с водяным знаком "API KEY REQUIRED"
// (https://carto.com/basemaps/apikey/ — бесплатно, без аккаунта).
// Ключ хранится в VITE_CARTO_API_KEY (.env.local, не коммитить).

export const CARTO_KEY = (import.meta.env?.VITE_CARTO_API_KEY || '').trim();

export function withCartoKey(url) {
  if (!CARTO_KEY) return url;
  return url + '?key=' + encodeURIComponent(CARTO_KEY);
}

/** CARTO raster tile URL, e.g. cartoRaster('rastertiles/voyager'). */
export function cartoRaster(style) {
  // Без ключа CARTO отдаёт тайлы с водяным знаком — откатываемся на keyless OSM.
  if (!CARTO_KEY) return OSM_URL;
  return withCartoKey(`https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`);
}

// keyless-подписи: Esri reference-слой (без ключа и без водяного знака)
const ESRI_REFERENCE_LABELS_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

/**
 * Labels-only overlay для карты: CARTO-подписи, когда есть ключ,
 * иначе — Esri reference, чтобы не рисовать «API KEY REQUIRED».
 */
export function cartoLabels() {
  if (!CARTO_KEY) return ESRI_REFERENCE_LABELS_URL;
  return withCartoKey('https://{s}.basemaps.cartocdn.com/rastertiles/light_only_labels/{z}/{x}/{y}{r}.png');
}

export const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// Google Maps Platform key (уже есть в .env.local как VITE_GOOGLE_MAPS_KEY).
// Прямые растровые тайлы mt.google.com ключ не требуют, но если он задан —
// подставляем его в URL, а слой Google улиц делаем основным без CARTO-ключа.
export const GOOGLE_KEY = (import.meta.env?.VITE_GOOGLE_MAPS_KEY || '').trim();

function withGoogleKey(url) {
  if (!GOOGLE_KEY) return url;
  return url + '&key=' + encodeURIComponent(GOOGLE_KEY);
}

/** Google raster tile URL for Leaflet, e.g. googleTiles('m') улицы, 's' спутник, 'y' гибрид. */
export function googleTiles(lyrs) {
  return withGoogleKey(`https://mt0.google.com/vt/lyrs=${lyrs}&hl=ru&x={x}&y={y}&z={z}`);
}

export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
