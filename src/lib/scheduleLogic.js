/**
 * Чистая логика экрана «Расписание» водителя.
 *
 * Данные: `schedules.stops_schedule` — массив остановок, у каждой свой список
 * времён. Времена первой остановки — это отправления рейсов; времена
 * промежуточных остановок — прохождение этих же рейсов, а не новые рейсы.
 * Поэтому рейсы считаются только по первой остановке: старый `flatMap` по всем
 * остановкам раздувал «0 / 1 рейсов» до «0 / 25», если времена проставлены
 * везде.
 *
 * Всё здесь — чистые функции без React и без обращения к текущему времени:
 * `now` передаётся аргументом, чтобы поведение было воспроизводимым в тестах.
 */

const DAY_MINUTES = 24 * 60;

/** 'HH:MM' (или 'H:MM') → минуты от полуночи; невалидное → null. */
export function toMinutes(value) {
  if (typeof value !== 'string') return null;
  const parts = value.trim().split(':');
  if (parts.length !== 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Минуты от полуночи → 'HH:MM'. */
function toLabel(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function nowMinutes(now) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getHours() * 60 + date.getMinutes();
}

function stopsOf(schedule) {
  const stops = schedule?.stops_schedule;
  return Array.isArray(stops) ? stops.filter((s) => s && typeof s === 'object') : [];
}

/** Времена отправления рейсов: только стартовая остановка. */
export function departureTimes(schedule) {
  const stopsWithTimes = stopsOf(schedule).filter((stop) => {
    const times = Array.isArray(stop.times) ? stop.times : [];
    return times.some((time) => toMinutes(time) !== null);
  });
  const origin = stopsWithTimes.find((stop) => Number(stop.stop_index) === 0)
    || stopsWithTimes[0]
    || null;
  if (!origin) return [];

  const seen = new Set();
  const minutes = [];
  for (const time of origin.times) {
    const value = toMinutes(time);
    if (value !== null && !seen.has(value)) {
      seen.add(value);
      minutes.push(value);
    }
  }
  return minutes.sort((a, b) => a - b).map(toLabel);
}

/**
 * Сводка смены: сколько рейсов всего, сколько уже отправлено по расписанию,
 * какой следующий и через сколько минут.
 */
export function summarizeShift(schedule, now = new Date()) {
  const times = departureTimes(schedule);
  const current = nowMinutes(now);
  const parsed = times.map(toMinutes);
  const passedTrips = parsed.filter((m) => m < current).length;
  const nextIndex = parsed.findIndex((m) => m >= current);
  const nextTime = nextIndex >= 0 ? times[nextIndex] : null;

  return {
    times,
    totalTrips: times.length,
    passedTrips,
    nextTime,
    minutesToNext: nextTime ? parsed[nextIndex] - current : null,
    progress: times.length ? Math.round((passedTrips / times.length) * 100) : 0,
    shiftStart: times[0] || null,
    shiftEnd: times[times.length - 1] || null,
    departureStopName: schedule?.stops_schedule?.[0]?.stop_name || null,
  };
}

/**
 * Ближайшие остановки сегодня: для каждой — ближайшее время не раньше `now`.
 * Остановки без времени и уже пройденные не попадают.
 */
export function upcomingStops(schedule, now = new Date(), limit = 10) {
  if (limit <= 0) return [];
  const current = nowMinutes(now);

  const result = [];
  stopsOf(schedule).forEach((stop, arrayIndex) => {
    const times = Array.isArray(stop.times) ? stop.times : [];
    const upcoming = times
      .map(toMinutes)
      .filter((m) => m !== null && m >= current);
    if (!upcoming.length) return;
    const minutes = Math.min(...upcoming);
    result.push({
      index: Number.isInteger(stop.stop_index) ? stop.stop_index : arrayIndex,
      name: stop.stop_name || null,
      time: toLabel(minutes),
      minutes,
    });
  });

  return result
    .sort((a, b) => a.minutes - b.minutes || a.index - b.index)
    .slice(0, limit);
}

/** Минуты → { hours, minutes } для локализованного «через 4 ч 20 мин». */
export function splitDuration(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return { hours: 0, minutes: 0 };
  }
  const safe = Math.min(Math.floor(totalMinutes), DAY_MINUTES);
  return { hours: Math.floor(safe / 60), minutes: safe % 60 };
}
