/**
 * taxiRide.js — смена статуса поездки такси на сервере.
 *
 * Почему отдельный модуль:
 *   1) Supabase-js НЕ бросает исключения: ошибка всегда в `{ error }`. В
 *      компоненте это пряталось за try/catch, поэтому неудачный UPDATE
 *      выглядел как успешный — водитель видел «В поездке», а в БД статус
 *      оставался прежним (пассажир не получал старт поездки).
 *   2) Четыре последовательных запроса давали 1.5–2 с на клик. Заказ —
 *      единственная запись, от которой зависит UI; событие рейса, статус
 *      водителя и его локация независимы и пишутся параллельно.
 */

/** Статус поездки → статус водителя/локации (free после завершения). */
export const RIDE_DRIVER_STATUS = {
  arrived: 'arrived',
  riding: 'riding',
  completed: 'free',
};

/** Разрешённые переходы, которые умеет писать этот модуль. */
export const RIDE_STATUSES = Object.keys(RIDE_DRIVER_STATUS);

const nowIso = () => new Date().toISOString();

/**
 * Записать новый статус поездки.
 *
 * @param {object} supabase клиент Supabase (или двойник в тестах)
 * @param {{orderId: string, driverId: string, status: string, now?: () => string}} args
 * @returns {Promise<{ok: true} | {ok: false, stage: 'validate'|'order'|'side', error: string}>}
 */
export async function applyRideStatus(supabase, { orderId, driverId, status, now = nowIso } = {}) {
  if (!orderId || !driverId || !RIDE_STATUSES.includes(status)) {
    return { ok: false, stage: 'validate', error: 'Некорректный статус поездки' };
  }

  const at = now();
  const orderPatch = { status, updated_at: at };
  if (status === 'completed') orderPatch.completed_at = at;

  const { error: orderError } = await supabase
    .from('taxi_orders')
    .update(orderPatch)
    .eq('id', orderId);

  if (orderError) {
    return { ok: false, stage: 'order', error: orderError.message || 'Не удалось обновить заказ' };
  }

  const driverStatus = RIDE_DRIVER_STATUS[status];

  // Независимые записи — параллельно: один round-trip вместо трёх.
  const [eventRes, driverRes, locationRes] = await Promise.all([
    supabase.from('taxi_ride_events').insert({ order_id: orderId, status }),
    supabase.from('taxi_drivers').update({ status: driverStatus }).eq('user_id', driverId),
    supabase.from('taxi_driver_locations').update({ status: driverStatus }).eq('driver_id', driverId),
  ]);

  const sideError = eventRes?.error || driverRes?.error || locationRes?.error;
  if (sideError) {
    return { ok: false, stage: 'side', error: sideError.message || 'Не удалось сохранить статус поездки' };
  }

  return { ok: true };
}
