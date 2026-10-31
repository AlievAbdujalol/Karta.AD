/**
 * fareInput.js — свободная сумма проезда в попапе транспорта.
 *
 * Пассажир может изменить сумму кнопками ±FARE_STEP или ввести её вручную.
 * Тариф по умолчанию (3.00 маршрутка / 2.50 автобус) — только стартовое
 * значение: серверный RPC pay_bus_fare списывает ровно переданную сумму,
 * границы FARE_MIN…FARE_MAX согласованы с валидацией в БД (0.50 … 10000 TJS).
 */

export const FARE_STEP = 0.5;
export const FARE_MIN = 0.5;
export const FARE_MAX = 10000;

/** Тариф по умолчанию: маршрутка 3.00, всё остальное 2.50 (как прежний хардкод). */
export function defaultFare(type) {
  return type === 'minibus' ? 3 : 2.5;
}

/**
 * Разбирает введённое значение («3.5», «3,5», 3.5 → 3.5).
 * @returns {number|null} null — ввод пустой или не число
 */
export function parseFare(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(',', '.');
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Округляет до копеек и зажимает в границы сервера. */
export function normalizeFare(value) {
  const n = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(n)) return FARE_MIN;
  return Math.min(FARE_MAX, Math.max(FARE_MIN, n));
}

/**
 * Кнопка ±: сдвигает текущую сумму на шаг, не выходя за границы.
 * @param {number|null} current текущее значение (некорректное → FARE_MIN)
 * @param {1|-1} dir +1 вверх, −1 вниз
 */
export function stepFare(current, dir) {
  const base = Number.isFinite(Number(current)) ? normalizeFare(current) : FARE_MIN;
  return normalizeFare(base + Math.sign(dir || 1) * FARE_STEP);
}
