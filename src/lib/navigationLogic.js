/**
 * navigationLogic.js
 *
 * Чистая (без React/DOM) логика навигации — единый источник правды для
 * NavigationContext и тестов:
 *   - подтверждение прибытия несколькими достоверными GPS-замерами;
 *   - остаток маршрута и ETA в единой геометрической модели;
 *   - дуговые позиции манёвров (шагов OSRM) вдоль геометрии.
 *
 * Модель остатка/ETA задокументирована здесь: остаток = длина геометрии ×
 * (1 − прогресс проекции). Прогресс и остаток считаются по ОДНОЙ геометрии,
 * поэтому «пройдено + остаток = длина маршрута» инвариантно. ETA масштабирует
 * OSRM-время тем же прогрессом (либо делит остаток по средней скорости, если
 * она достоверна) — числа не могут противоречить друг другу.
 */
import { haversineM, projectOnPolyline } from '@/lib/geo';

// ── Пороги (конфигурируемые, обоснованы в тестах) ────────────────────
export const ARRIVAL_THRESHOLD_M = 30;      // дальность ГПС до конечной точки
export const ARRIVAL_SNAPPED_MAX_M = 50;    // snapped-точка — только финальный участок
export const ARRIVAL_MAX_ACCURACY_M = 100;  // замеры точнее засчитываются
export const ARRIVAL_CONFIRM_FIXES = 2;     // подряд идущих замеров для подтверждения
export const ARRIVAL_MIN_PROGRESS = 0.95;   // хвост маршрута (защита от петель)
export const OFF_ROUTE_THRESHOLD_M = 35;    // порог «отклонились от маршрута»
export const ETA_MIN_SPEED_MPS = 1.2;       // ниже — скорость недостоверна
export const ETA_MAX_SEC = 43200;           // 12 ч — дальше прогноз недостоверен
export const NEXT_STEP_EPS_M = 2;           // допуск при выборе следующего манёвра

// ── Прибытие ─────────────────────────────────────────────────────────

/** Свежее состояние трекера прибытия — сбрасывается при любой смене маршрута/цели. */
export function initialArrivalState() {
  return { confirmed: false, streak: 0 };
}

/**
 * Одиночный GPS-замер подтверждает ли критерий прибытия.
 * Никогда не опирается только на progress: требуются согласованность с
 * конечным участком маршрута, нахождение на маршруте и достоверность GPS.
 */
export function isArrivalMeasurement(m) {
  if (!m || m.routeValid !== true) return false;
  const { toDestM, offRouteM, snappedToDestM, progress, accuracyM } = m;
  if (!Number.isFinite(toDestM) || !Number.isFinite(offRouteM) || !Number.isFinite(snappedToDestM)) return false;
  if (toDestM > ARRIVAL_THRESHOLD_M) return false;          // расстояние до цели
  if (offRouteM > OFF_ROUTE_THRESHOLD_M) return false;      // пользователь на маршруте
  if (snappedToDestM > ARRIVAL_SNAPPED_MAX_M) return false; // проекция на финальном участке
  if (!Number.isFinite(progress) || progress < ARRIVAL_MIN_PROGRESS) return false;
  if (Number.isFinite(accuracyM) && accuracyM > ARRIVAL_MAX_ACCURACY_M) return false; // достоверность GPS
  return true;
}

/**
 * Трекер прибытия: подтверждение требует ARRIVAL_CONFIRM_FIXES подряд идущих
 * валидных замеров — одиночный GPS-выброс не завершает навигацию.
 * Подтверждение «липкое»: сбрасывается только сменой маршрута (initialArrivalState).
 * @param {{confirmed:boolean,streak:number}|null} state
 * @param {object} measurement
 * @returns {{confirmed:boolean, streak:number}}
 */
export function nextArrivalState(state, measurement) {
  const prev = state || initialArrivalState();
  if (prev.confirmed) return { confirmed: true, streak: prev.streak };
  const streak = isArrivalMeasurement(measurement) ? prev.streak + 1 : 0;
  return { confirmed: streak >= ARRIVAL_CONFIRM_FIXES, streak };
}

// ── Остаток маршрута и ETA ───────────────────────────────────────────

/** Остаток по маршруту: длина × (1 − прогресс), ограничен [0, длина]. */
export function computeRemainingM(routeLenM, progress) {
  if (!Number.isFinite(routeLenM) || routeLenM <= 0) return 0;
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return Math.max(0, routeLenM * (1 - p));
}

/**
 * ETA в секундах. null — достоверного прогноза нет (показываем нейтральное
 * состояние, а не заведомо неверное время).
 */
export function computeEtaSec({ remainingM, routeLenM, durationSec, avgSpeedMps }) {
  const remaining = Number.isFinite(remainingM) ? Math.max(0, remainingM) : 0;
  if (remaining <= 0) return 0;
  if (Number.isFinite(avgSpeedMps) && avgSpeedMps >= ETA_MIN_SPEED_MPS) {
    const bySpeed = remaining / avgSpeedMps;
    if (bySpeed <= ETA_MAX_SEC) return bySpeed;
  }
  if (Number.isFinite(durationSec) && durationSec > 0 && Number.isFinite(routeLenM) && routeLenM > 0) {
    const ratio = Math.min(1, remaining / routeLenM); // доля остатка = 1 − прогресс
    const byRoute = durationSec * ratio;
    if (byRoute <= ETA_MAX_SEC) return byRoute;
  }
  return null;
}

// ── Шаги (манёвры) ───────────────────────────────────────────────────

/** Длина маршрута по геометрии (м). Невалидные точки пропускаются. */
export function routeLengthM(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 2) return 0;
  let len = 0;
  for (let i = 0; i < geometry.length - 1; i++) {
    const a = geometry[i];
    const b = geometry[i + 1];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    if (![a[0], a[1], b[0], b[1]].every(Number.isFinite)) continue;
    len += haversineM(a[0], a[1], b[0], b[1]);
  }
  return len;
}

/**
 * Дуговые позиции (метры от старта) манёвров шагов вдоль геометрии.
 * Старт шага проецируется на полилинию — позиция не зависит от того, в каком
 * месте геометрии лежит вершина (в отличие от старого бага «start = geometry[i]»).
 */
export function computeStepsArcM(geometry, steps) {
  if (!Array.isArray(steps) || steps.length === 0) return [];
  if (!Array.isArray(geometry) || geometry.length < 2) return steps.map(() => 0);
  const total = routeLengthM(geometry);
  return steps.map((s) => {
    const p = s?.start;
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return 0;
    return projectOnPolyline(p[0], p[1], geometry).progress * total;
  });
}

/**
 * Манёвр, который предстоит выполнить: первый шаг, чей старт ещё впереди
 * (с допуском eps на GPS-шум). Дистанция — вдоль маршрута до этого манёвра,
 * т.е. она НЕ включает уже пройденную часть текущего шага.
 * @returns {{idx:number, distToNextM:number}|null}
 */
export function pickNextStep(stepsArc, progressM, eps = NEXT_STEP_EPS_M) {
  if (!Array.isArray(stepsArc) || stepsArc.length === 0) return null;
  const p = Number.isFinite(progressM) ? progressM : 0;
  let idx = stepsArc.length - 1;
  for (let i = 0; i < stepsArc.length; i++) {
    const arc = Number.isFinite(stepsArc[i]) ? stepsArc[i] : 0;
    if (arc >= p - eps) { idx = i; break; }
  }
  const arc = Number.isFinite(stepsArc[idx]) ? stepsArc[idx] : 0;
  return { idx, distToNextM: Math.max(0, arc - p) };
}
