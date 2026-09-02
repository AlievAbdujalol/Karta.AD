/**
 * transitRouter.js
 * Умный подбор общественного транспорта:
 *   - прямые маршруты (от ближайшей остановки до нужной)
 *   - маршруты с одной пересадкой
 *   - возвращает сегменты: пешком → автобус/маршрутка → пешком
 */

const OSRM = {
  driving: 'https://router.project-osrm.org/route/v1/driving',
  walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike',
};

/** Тариф по типу маршрута (сомони) */
function fareForRoute(route) {
  if (!route) return 0;
  const t = (route.type || '').toLowerCase();
  if (t === 'minibus' || t === 'marshrutka') return 5;
  return 2.5; // bus / trolleybus default
}

/** Расстояние в метрах между двумя точками (Haversine) */
export function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Запрос OSRM — возвращает { distance, duration, geometry } или null */
async function fetchOsrm(profile, points, signal) {
  const endpoint = OSRM[profile] || OSRM.driving;
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  try {
    const resp = await fetch(
      `${endpoint}/${coords}?overview=full&geometries=geojson&steps=true`,
      { signal: signal || AbortSignal.timeout(8000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.routes?.length) return null;
    const r = data.routes[0];
    const geometry = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const steps = [];
    let cursor = 0;
    (r.legs || []).forEach((leg) => {
      (leg.steps || []).forEach((step) => {
        steps.push({
          instruction: step.maneuver?.type || '',
          modifier: step.maneuver?.modifier || '',
          name: step.name || '',
          distance: step.distance || 0,
          duration: step.duration || 0,
          start: geometry[cursor] || geometry[0] || [0, 0],
        });
        cursor = Math.min(cursor + 1, geometry.length - 1);
      });
    });
    return { distance: r.distance, duration: r.duration, geometry, steps };
  } catch {
    return null;
  }
}

/**
 * Находит N ближайших остановок маршрута к точке (lat, lng).
 * Возвращает массив { stop, index, dist }.
 */
function nearestStops(route, lat, lng, maxDist = 1500, topN = 3) {
  const results = [];
  (route.stops || []).forEach((s, i) => {
    if (!s.lat || !s.lng) return;
    const d = distanceM(lat, lng, s.lat, s.lng);
    if (d <= maxDist) results.push({ stop: s, index: i, dist: d });
  });
  results.sort((a, b) => a.dist - b.dist);
  return results.slice(0, topN);
}

/**
 * Строит один прямой транзитный вариант:
 *   пешком(from → boardStop) + автобус(boardStop → alightStop) + пешком(alightStop → to)
 *
 * Возвращает объект варианта или null.
 */
async function buildTransitOption(from, to, route, boardIdx, alightIdx, signal) {
  const boardStop = route.stops[boardIdx];
  const alightStop = route.stops[alightIdx];

  // Пешком до посадки
  const walkTo = await fetchOsrm(
    'walking',
    [from, { lat: boardStop.lat, lng: boardStop.lng }],
    signal
  );
  // Пешком после выхода
  const walkFrom = await fetchOsrm(
    'walking',
    [{ lat: alightStop.lat, lng: alightStop.lng }, to],
    signal
  );

  if (!walkTo || !walkFrom) return null;

  // Геометрия автобусного участка — OSRM driving через все остановки маршрута
  const busStops = route.stops.slice(
    Math.min(boardIdx, alightIdx),
    Math.max(boardIdx, alightIdx) + 1
  );
  const orderedStops = boardIdx <= alightIdx ? busStops : [...busStops].reverse();
  const validBusStops = orderedStops.filter((s) => s.lat && s.lng);

  // Строим маршрут через OSRM по дорогам
  let busGeom = validBusStops.map((s) => [s.lat, s.lng]); // fallback — прямые
  let busDistance = distanceM(boardStop.lat, boardStop.lng, alightStop.lat, alightStop.lng) * 1.35;
  let busDuration = Math.abs(alightIdx - boardIdx) * 120;

  if (validBusStops.length >= 2) {
    try {
      const busOsrm = await fetchOsrm('driving', validBusStops, signal);
      if (busOsrm) {
        busGeom = busOsrm.geometry;
        busDistance = busOsrm.distance;
        busDuration = busOsrm.duration;
      }
    } catch { /* оставляем fallback */ }
  }

  const stopCount = Math.abs(alightIdx - boardIdx);

  const totalDistance = walkTo.distance + busDistance + walkFrom.distance;
  const totalDuration = walkTo.duration + busDuration + walkFrom.duration;

  return {
    type: 'transit',
    route,
    boardStop,
    alightStop,
    boardIdx,
    alightIdx,
    stopCount,
    totalDistance,
    totalDuration,
    totalPrice: fareForRoute(route),
    walkToBoardDistance: walkTo.distance,
    walkToBoardDuration: walkTo.duration,
    walkFromAlightDistance: walkFrom.distance,
    walkFromAlightDuration: walkFrom.duration,
    busDuration,
    busDistance,
    segments: [
      {
        type: 'walking',
        geometry: walkTo.geometry,
        distance: walkTo.distance,
        duration: walkTo.duration,
        from,
        to: { lat: boardStop.lat, lng: boardStop.lng, name: boardStop.name },
        label: `Пешком до ост. «${boardStop.name || 'Остановка'}»`,
      },
      {
        type: route.type || 'bus',
        geometry: busGeom,
        distance: busDistance,
        duration: busDuration,
        from: { lat: boardStop.lat, lng: boardStop.lng, name: boardStop.name },
        to: { lat: alightStop.lat, lng: alightStop.lng, name: alightStop.name },
        routeNumber: route.number,
        routeName: route.name,
        routeColor: route.color || '#1565C0',
        stopCount,
        label: `Маршрут #${route.number} (${stopCount} ост.)`,
      },
      {
        type: 'walking',
        geometry: walkFrom.geometry,
        distance: walkFrom.distance,
        duration: walkFrom.duration,
        from: { lat: alightStop.lat, lng: alightStop.lng, name: alightStop.name },
        to,
        label: `Пешком до цели`,
      },
    ],
  };
}

/**
 * Вариант с пересадкой:
 *   пешком(from→board1) + route1(board1→alight1) + пешком(alight1→board2) + route2(board2→alight2) + пешком(alight2→to)
 */
async function buildTransferOption(from, to, opt1, opt2, signal) {
  // opt1.alightStop → opt2.boardStop (пересадочная ходьба)
  const transfer = await fetchOsrm(
    'walking',
    [
      { lat: opt1.alightStop.lat, lng: opt1.alightStop.lng },
      { lat: opt2.boardStop.lat, lng: opt2.boardStop.lng },
    ],
    signal
  );
  if (!transfer) return null;

  // Отклоняем пересадку если идти >800м
  if (transfer.distance > 800) return null;

  const totalDistance =
    opt1.walkToBoardDistance +
    opt1.busDistance +
    transfer.distance +
    opt2.busDistance +
    opt2.walkFromAlightDistance;

  const totalDuration =
    opt1.walkToBoardDuration +
    opt1.busDuration +
    transfer.duration +
    opt2.busDuration +
    opt2.walkFromAlightDuration;

  return {
    type: 'transfer',
    routes: [opt1.route, opt2.route],
    totalDistance,
    totalDuration,
    totalPrice: fareForRoute(opt1.route) + fareForRoute(opt2.route),
    segments: [
      ...opt1.segments.slice(0, 2),
      {
        type: 'walking',
        geometry: transfer.geometry,
        distance: transfer.distance,
        duration: transfer.duration,
        from: {
          lat: opt1.alightStop.lat,
          lng: opt1.alightStop.lng,
          name: opt1.alightStop.name,
        },
        to: {
          lat: opt2.boardStop.lat,
          lng: opt2.boardStop.lng,
          name: opt2.boardStop.name,
        },
        label: `Пересадка: пешком до ост. «${opt2.boardStop.name || 'Остановка'}»`,
      },
      ...opt2.segments.slice(1),
    ],
  };
}

/**
 * Главная функция — находит все варианты маршрута на общественном транспорте.
 *
 * @param {object} from  { lat, lng }
 * @param {object} to    { lat, lng }
 * @param {array}  routes — все маршруты из БД (массив объектов с полем stops[])
 * @param {string} typeFilter — 'bus' | 'minibus' | null (все)
 * @returns Promise<{ direct: [], transfer: [], best: object|null }>
 */
export async function findTransitRoutes(from, to, routes, typeFilter = null) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 20000);

  try {
    const filtered = routes.filter((r) => {
      if (!r.stops?.length) return false;
      if (typeFilter && r.type !== typeFilter) return false;
      return true;
    });

    // --- Прямые маршруты ---
    const directCandidates = [];

    for (const route of filtered) {
      const boardCandidates = nearestStops(route, from.lat, from.lng, 1500, 2);
      const alightCandidates = nearestStops(route, to.lat, to.lng, 1500, 2);

      for (const board of boardCandidates) {
        for (const alight of alightCandidates) {
          if (board.index === alight.index) continue;
          // Проверяем, что посадка раньше высадки по направлению маршрута
          // (допускаем оба направления — некоторые маршруты двусторонние)
          const opt = await buildTransitOption(
            from,
            to,
            route,
            board.index,
            alight.index,
            ctrl.signal
          );
          if (opt) directCandidates.push(opt);
        }
      }
    }

    // Убираем дубли по routeId + boardIdx + alightIdx
    const seen = new Set();
    const direct = directCandidates.filter((o) => {
      const key = `${o.route.id}-${o.boardIdx}-${o.alightIdx}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Сортируем: меньше остановок + меньше ходьбы
    direct.sort(
      (a, b) =>
        a.totalDuration - b.totalDuration ||
        a.walkToBoardDistance - b.walkToBoardDistance
    );

    // --- Пересадки (только если нет хороших прямых) ---
    const transfers = [];

    if (direct.length === 0 && filtered.length >= 2) {
      // Ищем пары маршрутов где высадка одного близко к посадке другого
      const topDirect1 = [];
      const topDirect2 = [];

      for (const route of filtered) {
        const boardCandidates = nearestStops(route, from.lat, from.lng, 2000, 1);
        if (boardCandidates.length === 0) continue;

        // Перебираем все остановки как возможные точки пересадки
        for (let alightIdx = 0; alightIdx < route.stops.length; alightIdx++) {
          const s = route.stops[alightIdx];
          if (!s.lat || !s.lng) continue;
          const board = boardCandidates[0];
          if (board.index === alightIdx) continue;

          // Ищем маршруты, которые проходят рядом с этой остановкой и ведут к to
          for (const route2 of filtered) {
            if (route2.id === route.id) continue;
            const board2 = nearestStops(route2, s.lat, s.lng, 600, 1)[0];
            if (!board2) continue;
            const alight2 = nearestStops(route2, to.lat, to.lng, 1500, 1)[0];
            if (!alight2 || board2.index === alight2.index) continue;

            const [opt1, opt2] = await Promise.all([
              buildTransitOption(from, to, route, board.index, alightIdx, ctrl.signal),
              buildTransitOption(from, to, route2, board2.index, alight2.index, ctrl.signal),
            ]);

            if (opt1 && opt2) {
              // Пересобираем opt1 с правильным to (точкой пересадки)
              const opt1fixed = { ...opt1, alightStop: route.stops[alightIdx] };
              const transfer = await buildTransferOption(
                from,
                to,
                opt1fixed,
                opt2,
                ctrl.signal
              );
              if (transfer) transfers.push(transfer);
            }
          }
        }
      }

      transfers.sort((a, b) => a.totalDuration - b.totalDuration);
    }

    const best = direct[0] || transfers[0] || null;

    return { direct: direct.slice(0, 3), transfers: transfers.slice(0, 2), best };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Строит полную геометрию маршрута из сегментов для отображения на карте.
 * Возвращает массив { color, weight, opacity, positions, dashed } для каждого сегмента.
 */
export function buildSegmentPolylines(option) {
  if (!option) return [];
  return option.segments.map((seg) => ({
    positions: seg.geometry || [],
    color:
      seg.type === 'walking'
        ? '#7C3AED'
        : seg.routeColor || '#1565C0',
    weight: seg.type === 'walking' ? 3 : 5,
    opacity: seg.type === 'walking' ? 0.7 : 1,
    dashed: seg.type === 'walking',
    dashArray: seg.type === 'walking' ? '6 8' : null,
    type: seg.type,
    label: seg.label,
  }));
}

/** Форматирование расстояния */
export function fmtDist(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} км`;
  return `${Math.round(m)} м`;
}

/** Форматирование времени */
export function fmtDur(s) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h} ч ${m} мин`;
  if (m === 0) return '< 1 мин';
  return `${m} мин`;
}
