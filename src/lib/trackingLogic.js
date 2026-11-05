/**
 * trackingLogic.js
 *
 * Чистая логика отслеживания транспорта для пассажира и водителя:
 *   - свежесть GPS и статус транспорта (движется/стоит/рейс завершён/устарело);
 *   - форматирование расстояния (метры/километры, без NaN);
 *   - ETA из реальных данных с честным «неизвестно» вместо выдумки;
 *   - пороговые уведомления с антидублями и проверкой свежести;
 *   - прогресс рейса по цепочке остановок (остаток ВДОЛЬ маршрута);
 *   - состояния остановки: предстоит → прибытие → стоянка → отправление.
 *
 * Ни одна функция не читает текущее время сама: `now` передаётся аргументом,
 * поведение воспроизводимо в тестах. Ничего здесь не рисует «для красоты»:
 * нет данных — возвращаем null, а UI показывает «Время прибытия неизвестно».
 */
import { haversineM, bearing } from '@/lib/geo';

// ── Пороги (конфигурируемые, обоснованы в тестах) ────────────────────
export const GPS_FRESH_SEC = 60;            // ≤1 мин — свежие координаты
export const GPS_STALE_SEC = 180;           // >3 мин — данные устарели
export const MOVING_MIN_SPEED_KMH = 3;      // выше — транспорт движется
export const ETA_MIN_SPEED_KMH = 3;         // ниже — ETA недостоверно
export const ETA_MAX_MIN = 180;             // дальше 3 ч — прогноз не выдаём
export const APPROACH_THRESHOLDS_M = [1000, 500, 200]; // 1 км, 500 м, «приближается»
export const ARRIVE_RADIUS_M = 60;          // «прибыл» на остановку пассажира
export const NOTIFY_HYSTERESIS_M = 150;     // перезарядка порога после отъезда
export const ETA_NOTIFY_MIN = 5;            // «прибудет примерно через 5 минут»
export const ETA_NOTIFY_REARM_MIN = 8;      // сброс ETA-уведомления дальше 8 мин
export const STOP_ARRIVE_RADIUS_M = 80;     // подтверждение прибытия к остановке рейса
export const STOP_ROLLBACK_RADIUS_M = 250;  // GPS-выброс — откат ложного прибытия
export const STOP_DWELL_RADIUS_M = 150;     // стоянка только рядом с остановкой
export const STOP_DEPART_RADIUS_M = 200;    // отправление: уехал или разогнался
export const STOP_CONFIRM_FIXES = 2;        // замеров подряд для прибытия
export const ROUTE_END_EPS_M = 30;          // «на конечной» — в пределах 30 м

const COMPASS_KEYS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

function isValidDate(value) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === 'string' || typeof value === 'number') {
    return !Number.isNaN(new Date(value).getTime());
  }
  return false;
}

function toTime(value) {
  if (!isValidDate(value)) return null;
  return new Date(value).getTime();
}

function validPoint(p) {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
  return !(p.lat === 0 && p.lng === 0); // нулевые координаты — «не вышел на линию»
}

// ── Расстояние ───────────────────────────────────────────────────────

/**
 * «850 м» / «2,4 км» (ru, tg) или «850 m» / «2.4 km» (en).
 * Некорректное значение → «—», никогда NaN.
 */
export function formatDistanceM(m, lang = 'ru') {
  if (!Number.isFinite(m) || m < 0) return '—';
  const isEn = lang === 'en';
  // округляем доравных единиц ДО выбора единицы: 999.6 м → «1,0 км», а не «1000 м»
  const rounded = Math.round(m);
  if (rounded < 1000) return `${rounded} ${isEn ? 'm' : 'м'}`;
  const km = (rounded / 1000).toFixed(1);
  const text = isEn ? km : km.replace('.', ',');
  return `${text} ${isEn ? 'km' : 'км'}`;
}

// ── Свежесть и статус ────────────────────────────────────────────────

/** Возраст координат в секундах; null — времени нет или оно битое. */
export function gpsAgeSec(lastUpdated, now = Date.now()) {
  const t = toTime(lastUpdated);
  if (t === null) return null;
  // битый now (NaN и т.п.) не должен давать NaN-возраст → берём текущее время
  const base = toTime(now) ?? Date.now();
  return Math.max(0, (base - t) / 1000);
}

/** 'fresh' ≤60 с | 'aging' ≤180 с | 'stale' >180 с | 'unknown' нет данных. */
export function gpsFreshness(lastUpdated, now = Date.now()) {
  const age = gpsAgeSec(lastUpdated, now);
  if (age === null) return 'unknown';
  if (age <= GPS_FRESH_SEC) return 'fresh';
  if (age <= GPS_STALE_SEC) return 'aging';
  return 'stale';
}

/**
 * Статус транспорта для карточки пассажира:
 * 'ended' — рейс завершён; 'stale' — GPS давно не обновлялся;
 * 'unknown' — времени нет; 'moving'/'stopped' — по скорости.
 */
export function vehicleStatus(vehicle, now = Date.now()) {
  if (!vehicle) return 'unknown';
  if (vehicle.is_active === false) return 'ended';
  const freshness = gpsFreshness(vehicle.last_updated, now);
  if (freshness === 'unknown') return 'unknown';
  if (freshness === 'stale') return 'stale';
  const speed = Number(vehicle.speed);
  if (Number.isFinite(speed) && speed >= MOVING_MIN_SPEED_KMH) return 'moving';
  return 'stopped';
}

/**
 * Показывать ли транспорт как активный: рейс идёт, координаты валидны
 * и не старше GPS_STALE_SEC. Устаревший след НЕ считается активным (п. 8 ТЗ).
 */
export function isVehicleLive(vehicle, now = Date.now()) {
  if (!vehicle || vehicle.is_active !== true) return false;
  if (!validPoint(vehicle)) return false;
  const freshness = gpsFreshness(vehicle.last_updated, now);
  return freshness === 'fresh' || freshness === 'aging';
}

// ── ETA ──────────────────────────────────────────────────────────────

/**
 * Минут до прибытия из реальных данных или null — «Время прибытия неизвестно».
 * Правила: свежий GPS; скорость ≥ ETA_MIN_SPEED_KMH либо явный фолбэк
 * (например, из расписания); неотрицательность; кап ETA_MAX_MIN.
 */
export function estimateArrivalMinutes({
  distanceM, speedKmh, lastUpdated, now = Date.now(), fallbackSpeedKmh,
} = {}) {
  // свежесть раньше дистанции: устаревший GPS не даёт «0 минут» на нулевом
  // расстоянии — без данных всегда null
  const freshness = gpsFreshness(lastUpdated, now);
  if (freshness !== 'fresh' && freshness !== 'aging') return null;
  if (!Number.isFinite(distanceM) || distanceM < 0) return null;
  if (distanceM === 0) return 0;

  let speed = Number(speedKmh);
  if (!Number.isFinite(speed) || speed < ETA_MIN_SPEED_KMH) {
    speed = Number(fallbackSpeedKmh);
    if (!Number.isFinite(speed) || speed < ETA_MIN_SPEED_KMH) return null;
  }
  const metersPerSec = speed / 3.6;
  const minutes = Math.ceil((distanceM / metersPerSec) / 60);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  if (minutes > ETA_MAX_MIN) return null;
  return minutes;
}

/** Момент прибытия (Date) или null — для строки «Ожидаемое прибытие в 08:35». */
export function estimateArrivalClock(args = {}) {
  const minutes = estimateArrivalMinutes(args);
  if (minutes === null) return null;
  const nowMs = toTime(args.now) ?? Date.now();
  return new Date(nowMs + minutes * 60_000);
}

/** Пеленг (0..360°, 0 — север) → ключ компаса 'n'|'ne'|…; NaN → null. */
export function compassKey(deg) {
  if (!Number.isFinite(deg)) return null;
  const norm = ((deg % 360) + 360) % 360;
  const idx = Math.round(norm / 45) % 8;
  return COMPASS_KEYS[idx];
}

/** Направление движения из двух позиций (реальный пеленг, не выдумка). */
export function directionKey(from, to) {
  if (!validPoint(from) || !validPoint(to)) return null;
  if (from.lat === to.lat && from.lng === to.lng) return null;
  return compassKey(bearing(from.lat, from.lng, to.lat, to.lng));
}

// ── Уведомления: пороги + антидубли + свежесть ───────────────────────

function initialNotifyState() {
  return { thresholds: {}, arrived: false, etaFired: false, lastDistM: null };
}

/**
 * Шаг машины уведомлений. Событие генерируется ТОЛЬКО на пересечении порога
 * сверху вниз; повтор внутри порога не шлётся; перезарядка — после отъезда
 * на NOTIFY_HYSTERESIS_M. Устаревший GPS или завершённый рейс не уведомляют.
 * @returns {{state: object, events: Array<{type:string, thresholdM?:number, minutes?:number}>}}
 */
export function notificationStep(prevState, input = {}) {
  const state = prevState && typeof prevState === 'object'
    ? prevState
    : initialNotifyState();
  const events = [];
  const { distM, fresh = true, active = true, etaMinutes } = input;
  // input.now принятие и игнорируется: машине состояний время не нужно,
  // а вызывающий код передаёт его для единообразия и тестов.

  if (!Number.isFinite(distM) || !fresh || active === false) {
    return { state, events };
  }

  const next = {
    ...state,
    thresholds: { ...(state.thresholds || {}) },
    lastDistM: distM,
  };
  const last = Number.isFinite(state.lastDistM) ? state.lastDistM : distM;
  let arrivedNow = false;

  for (const threshold of APPROACH_THRESHOLDS_M) {
    const fired = next.thresholds[threshold] === true;
    if (!fired && last > threshold && distM <= threshold) {
      next.thresholds[threshold] = true;
      events.push({ type: 'approach', thresholdM: threshold });
    } else if (fired && distM > threshold + NOTIFY_HYSTERESIS_M) {
      delete next.thresholds[threshold];
    }
  }

  // Прыжок координат пересёк несколько порогов за один GPS-фикс — шлём только
  // самый срочный (ближайший к остановке), остальные уже помечены сработавшими.
  const approaches = events.filter((e) => e.type === 'approach');
  if (approaches.length > 1) {
    const urgent = approaches[approaches.length - 1];
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'approach' && events[i] !== urgent) events.splice(i, 1);
    }
  }

  if (next.arrived && distM > ARRIVE_RADIUS_M + NOTIFY_HYSTERESIS_M) {
    next.arrived = false;
  }
  if (!next.arrived && distM <= ARRIVE_RADIUS_M) {
    next.arrived = true;
    arrivedNow = true;
    events.push({ type: 'arrived' });
  }

  // ETA-уведомление: «примерно через 5 минут», один раз на подход.
  if (Number.isFinite(etaMinutes)) {
    if (!next.etaFired && etaMinutes <= ETA_NOTIFY_MIN) {
      next.etaFired = true;
      events.push({ type: 'eta', minutes: etaMinutes });
    } else if (next.etaFired && etaMinutes > ETA_NOTIFY_REARM_MIN) {
      next.etaFired = false;
    }
  }

  // «Прибыл» подавляет попутные пороги в этом же шаге — один GPS-фикс,
  // одно уведомление, без лавины.
  if (arrivedNow) {
    for (const e of events) {
      if (e.type === 'approach') next.thresholds[e.thresholdM] = true;
    }
    return { state: next, events: events.filter((e) => e.type !== 'approach') };
  }

  return { state: next, events };
}

// ── Прогресс рейса по цепочке остановок ──────────────────────────────

/** Проекция на равнопромежуточном отрезке: t вдоль a→b и дистанция, м. */
function projectOnSegment(p, a, b) {
  const kx = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const px = p.lng * kx;
  const py = p.lat;
  const ax = a.lng * kx;
  const ay = a.lat;
  const bx = b.lng * kx;
  const by = b.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const dLatM = py - (ay + t * dy);
  const dLngM = px - (ax + t * dx);
  return { t, dist: Math.hypot(dLatM * 111320, dLngM * 111320 * Math.cos((ay * Math.PI) / 180)) };
}

/**
 * Прогресс рейса вдоль цепочки остановок (не по прямой!):
 * остаток — сумма длин перегонов от проекции до конечной.
 * @returns {{
 *   nextStopIndex: number|null, nextStop: object|null, distToNextM: number,
 *   remainingM: number, traveledM: number, totalM: number,
 *   passedCount: number, progress: number, offRouteM: number
 * }|null}
 */
export function routeProgressByStops(stops, pos) {
  if (!Array.isArray(stops) || !validPoint(pos)) return null;
  const list = stops.filter(validPoint);
  if (list.length === 0) return null;

  if (list.length === 1) {
    const dist = haversineM(pos.lat, pos.lng, list[0].lat, list[0].lng);
    const done = dist <= ROUTE_END_EPS_M;
    return {
      nextStopIndex: done ? null : 0,
      nextStop: done ? null : list[0],
      distToNextM: dist,
      remainingM: dist,
      traveledM: 0,
      totalM: dist,
      passedCount: done ? 1 : 0,
      progress: done ? 1 : 0,
      offRouteM: dist,
    };
  }

  const segLen = [];
  let totalM = 0;
  for (let i = 0; i < list.length - 1; i++) {
    const len = haversineM(list[i].lat, list[i].lng, list[i + 1].lat, list[i + 1].lng);
    segLen.push(len);
    totalM += len;
  }
  if (!(totalM > 0)) return null;

  let best = { i: 0, t: 0, dist: Infinity };
  for (let i = 0; i < list.length - 1; i++) {
    const p = projectOnSegment(pos, list[i], list[i + 1]);
    if (p.dist < best.dist) best = { i, t: p.t, dist: p.dist };
  }

  let traveledM = 0;
  for (let i = 0; i < best.i; i++) traveledM += segLen[i];
  traveledM += best.t * segLen[best.i];
  traveledM = Math.min(totalM, Math.max(0, traveledM));

  const remainingM = Math.max(0, totalM - traveledM);
  const atEnd = remainingM <= ROUTE_END_EPS_M;
  const nextStopIndex = atEnd ? null : best.i + 1;

  // Пройдено = остановок позади проекции. В самом начале (traveled = 0)
  // стартовая остановка ещё не «пройдена» — с неё только уходят.
  const arcs = [0];
  for (let i = 0; i < segLen.length; i++) arcs.push(arcs[i] + segLen[i]);
  const passedCount = atEnd
    ? list.length
    : arcs.filter((arc) => arc < traveledM).length;

  return {
    nextStopIndex,
    nextStop: nextStopIndex === null ? null : list[nextStopIndex],
    distToNextM: nextStopIndex === null
      ? remainingM
      : Math.max(0, segLen[best.i] * (1 - best.t)),
    remainingM,
    traveledM,
    totalM,
    passedCount,
    progress: totalM > 0 ? traveledM / totalM : 0,
    offRouteM: best.dist,
  };
}

// ── Состояния остановки рейса (водитель) ────────────────────────────

function initialStopState(stopIndex) {
  return {
    phase: 'pending', // pending | arriving | dwelling | departed
    fixes: 0,
    stopIndex,
    arrivedAt: null,
    dwellStart: null,
    dwellMs: null,
  };
}

/**
 * Машина состояний остановки: предстоит → прибытие обнаружено → стоит →
 * отправился. Прибытие требует STOP_CONFIRM_FIXES подряд замеров — один
 * GPS-выброс не подтверждает. Смена stopIndex сбрасывает состояние.
 * @returns {{state: object, event: string|null}}
 */
export function nextStopStateMachine(prevState, input = {}) {
  const { distToNextM, speedKmh, now = Date.now(), stopIndex } = input;

  let state = prevState && typeof prevState === 'object' ? prevState : null;
  if (!state || (stopIndex !== undefined && state.stopIndex !== stopIndex)) {
    state = initialStopState(stopIndex);
  }
  const base = { ...state, stopIndex: stopIndex ?? state.stopIndex };

  if (!Number.isFinite(distToNextM)) {
    return { state: { ...base, fixes: 0 }, event: null };
  }

  const speed = Number.isFinite(speedKmh) ? speedKmh : 0;
  const event = null;

  switch (base.phase) {
    case 'pending': {
      if (distToNextM <= STOP_ARRIVE_RADIUS_M) {
        const fixes = base.fixes + 1;
        if (fixes >= STOP_CONFIRM_FIXES) {
          return {
            state: { ...base, phase: 'arriving', fixes, arrivedAt: now },
            event: 'arriving',
          };
        }
        return { state: { ...base, fixes }, event };
      }
      return { state: { ...base, fixes: 0 }, event };
    }

    case 'arriving': {
      if (distToNextM > STOP_ROLLBACK_RADIUS_M) {
        // GPS-выброс вдали от остановки: ложное прибытие откатывается.
        return { state: { ...base, phase: 'pending', fixes: 0, arrivedAt: null }, event };
      }
      if (speed < MOVING_MIN_SPEED_KMH && distToNextM <= STOP_DWELL_RADIUS_M) {
        return { state: { ...base, phase: 'dwelling', dwellStart: now, dwellMs: null }, event: 'dwelling' };
      }
      return { state: base, event };
    }

    case 'dwelling': {
      const movingAway = speed >= MOVING_MIN_SPEED_KMH || distToNextM > STOP_DEPART_RADIUS_M;
      if (movingAway) {
        const dwellMs = base.dwellStart != null ? Math.max(0, now - base.dwellStart) : null;
        return { state: { ...base, phase: 'departed', dwellMs }, event: 'departed' };
      }
      return { state: base, event };
    }

    case 'departed':
    default:
      return { state: base, event };
  }
}
