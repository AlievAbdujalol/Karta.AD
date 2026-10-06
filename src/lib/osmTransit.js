/**
 * osmTransit.js — маршруты общественного транспорта из OpenStreetMap (Overpass).
 *
 * В Supabase таблица routes почти пустая, а OSM содержит линии bus/minibus
 * (Бишкек — 33, Смоленск — 10). Загружаем линии по bbox и превращаем в формат,
 * совместимый с таблицей routes, чтобы findTransitRoutes строил маршрут
 * «пешком → автобус через остановки → пешком».
 */
import { fetchOverpass } from './overpass';

const CACHE_KEY = 'karta_osm_transit_v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // линии меняются редко
const FAIL_TTL_MS = 5 * 60 * 1000; // после провала Overpass не долбим 5 минут
const CACHE_MAX = 6; // не раздуваем localStorage

const STOP_ROLES = /stop|platform|entry|exit/i;

/** bbox [s,w,n,e] вокруг точек с запасом (deg) */
export function bboxAround(points, pad = 0.08) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return [
    Math.min(...lats) - pad,
    Math.min(...lngs) - pad,
    Math.max(...lats) + pad,
    Math.max(...lngs) + pad,
  ];
}

/** Ключ кэша: округляем каждую сторону bbox до ~0.25° — поиск в одном городе попадает в кэш */
function cacheKey(bbox) {
  const q = (v) => Math.round(v * 4) / 4;
  return `${q(bbox[0])}_${q(bbox[1])}_${q(bbox[2])}_${q(bbox[3])}`;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** '1565C0' / '#F00' / 'F00' → '#1565C0' / '#FF0000'; иначе null */
function normColor(c) {
  if (!c) return null;
  const v = String(c).trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`;
  if (/^[0-9a-fA-F]{3}$/.test(v)) return `#${v.split('').map((ch) => ch + ch).join('')}`;
  return null;
}

/**
 * Чистый парсер: relations (out body), nodes (out body) → routes[].
 * Геометрия линии не строится: линии на карте рисуются через остановки,
 * а запрос всех способов relation стоил бы десятки запросов к Overpass.
 * Экспортируется для тестов.
 */
export function parseOsmTransit(relations, nodes) {
  if (!Array.isArray(relations)) return [];
  const nodeById = new Map((Array.isArray(nodes) ? nodes : []).map((n) => [n.id, n]));
  const routes = [];

  for (const rel of relations) {
    if (!rel || rel.type !== 'relation') continue;
    const tags = rel.tags || {};
    if (tags.route && tags.route !== 'bus' && tags.route !== 'minibus') continue;
    const type = tags.route === 'minibus' ? 'minibus' : 'bus';
    const members = rel.members || [];

    // Остановки: узлы с ролями stop/platform; если ролей нет — все узлы-члены.
    let stopMembers = members.filter((m) => m.type === 'node' && STOP_ROLES.test(m.role || ''));
    if (!stopMembers.length) stopMembers = members.filter((m) => m.type === 'node');
    const rawStops = stopMembers
      .map((m) => nodeById.get(m.ref))
      .filter(Boolean)
      .map((n) => ({ lat: n.lat, lng: n.lon, name: n.tags?.name || null }));
    // OSM описывает одну остановку двумя узлами: stop + платформа (~20 м).
    // Схлопываем соседние (<~40 м), предпочитая узел с именем.
    const stops = [];
    for (const s of rawStops) {
      const prev = stops[stops.length - 1];
      if (prev && Math.abs(prev.lat - s.lat) < 0.0004 && Math.abs(prev.lng - s.lng) < 0.0006) {
        if (!prev.name && s.name) stops[stops.length - 1] = s;
        continue;
      }
      stops.push(s);
    }
    if (stops.length < 2) continue;

    routes.push({
      id: `osm-${rel.id}`,
      number: tags.ref || tags.name || 'Линия',
      name: tags.name || tags.ref || '',
      type,
      color: normColor(tags.colour) || (type === 'minibus' ? '#DC2626' : '#1565C0'),
      stops,
      source: 'osm',
      is_active: true,
      city_id: null,
      city_name: null,
    });
  }
  return routes;
}

/** Объединение маршрутов БД и OSM без дублей по (тип + номер/название) */
export function mergeTransitRoutes(dbRoutes, osmRoutes) {
  const db = Array.isArray(dbRoutes) ? dbRoutes : [];
  const osm = Array.isArray(osmRoutes) ? osmRoutes : [];
  const key = (r) => `${r.type || ''}|${String(r.number || r.name || '').trim().toLowerCase()}`;
  const seen = new Set(db.map(key));
  return [...db, ...osm.filter((r) => !seen.has(key(r)))];
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveCache(key, routes, failed = false) {
  try {
    const cache = readCache();
    cache[key] = { ts: Date.now(), routes: failed ? null : routes, failed };
    const keys = Object.keys(cache);
    // вытесняем самое старое при переполнении
    if (keys.length > CACHE_MAX) {
      keys
        .sort((a, b) => (cache[a]?.ts || 0) - (cache[b]?.ts || 0))
        .slice(0, keys.length - CACHE_MAX)
        .forEach((k) => delete cache[k]);
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* приватный режим и т.п. — кэш не критичен */
  }
}

/**
 * Загружает линии ОТ (bus/minibus) в bbox [s,w,n,e] с кэшем в localStorage.
 * Никогда не бросает: при ошибке возвращает [] и кэширует провал на 5 минут
 * (маршрутизация просто без OSM-линий, без повторных ударов по упавшим зеркалам).
 */
export async function fetchOsmTransitRoutes(bbox, { force = false } = {}) {
  const key = cacheKey(bbox);
  if (!force) {
    const hit = readCache()[key];
    if (hit && Date.now() - hit.ts < (hit.failed ? FAIL_TTL_MS : CACHE_TTL_MS)) {
      return hit.routes || []; // свежий провал Overpass — молча без сети
    }
  }

  try {
    const [s, w, n, e] = bbox;
    const relQ =
      `[out:json][timeout:25];(relation["type"="route"]["route"="bus"](${s},${w},${n},${e});` +
      `relation["type"="route"]["route"="minibus"](${s},${w},${n},${e}););out body;`;
    const relData = await fetchOverpass(relQ);
    const relations = (relData.elements || []).filter((el) => el.type === 'relation');
    if (!relations.length) {
      saveCache(key, []);
      return [];
    }

    const nodeIds = [];
    for (const rel of relations) {
      for (const m of rel.members || []) {
        if (m.type === 'node') nodeIds.push(m.ref);
      }
    }

    const nodes = [];
    for (const ids of chunk([...new Set(nodeIds)], 400)) {
      const d = await fetchOverpass(`[out:json][timeout:25];node(id:${ids.join(',')});out body;`);
      nodes.push(...(d.elements || []));
    }

    const routes = parseOsmTransit(relations, nodes);
    saveCache(key, routes);
    return routes;
  } catch {
    saveCache(key, [], true); // зеркала упали (504/таймаут) — пауза, не долбим на каждый поиск
    return [];
  }
}
