import { supabase } from '@/api/supabase';
import { formatTJS } from '@/lib/taxi';

// ─── НАПРАВЛЕННОЕ ПРЕДЛОЖЕНИЕ ЗАКАЗА КОНКРЕТНОМУ ВОДИТЕЛЮ ────────────────────
// Пассажир выбирает свободного водителя на карте → searching-заказ закрепляется
// за ним (driver_id). Водитель получает событие realtime по фильтру
// driver_id=eq.<me> (фильтр UPDATE применяется к новой строке) и push-уведомление
// (вставка в notifications → триггер dispatch_push). Остальные водители направленное
// предложение не видят: их INSERT-подписка пропускает строки с driver_id.

// Водитель может получить push, но не открыть приложение — без авто-снятия
// заказ вечно висел бы закреплённым за ним, невидимым для остальных.
export const OFFER_AUTO_WITHDRAW_MS = 90_000;

// Обновление, которое ставит driver_id, разрешено пассажиру RLS
// (taxi_orders_update USING: passenger_id = auth.uid() остаётся верным).
export async function sendOfferToDriver({ orderId, driverId, price, pickup, dropoff }) {
  if (!orderId || !driverId) return { ok: false, error: 'no_target' };

  let res;
  try {
    res = await supabase
      .from('taxi_orders')
      .update({ driver_id: driverId })
      .eq('id', orderId)
      .eq('status', 'searching')
      .select('id')
      .maybeSingle();
  } catch {
    return { ok: false, error: 'network' };
  }
  if (res?.error) return { ok: false, error: res.error.message };
  // Заказ уже принят/отменён — не создаём уведомление, выглядящее как успех.
  if (!res?.data) return { ok: false, error: 'not_searching' };

  const { error } = await supabase.from('notifications').insert({
    user_id: driverId,
    title: price != null ? `Предложение заказа · ${formatTJS(price)} TJS` : 'Предложение заказа',
    body: [pickup, dropoff].filter(Boolean).join(' → ') || 'Новый заказ такси',
    type: 'taxi_new_order',
    data: { order_id: orderId, url: '/taxi/driver', targeted: true },
  });
  // Уведомление — вспомогательное (push закрытому водителю): сбой не отменяет
  // уже отправленное предложение.
  return { ok: true, notified: !error };
}

// Водитель отклонил предложение (или 20-секундный таймер истёк) — вернуть заказ
// в общий поиск. Прямой UPDATE driver_id = null водителем блокирует RLS:
// WITH CHECK применяет USING к новой строке, а new.driver_id = null больше не
// проходит auth.uid() = driver_id. Поэтому SECURITY DEFINER RPC.
export async function releaseOffer(orderId) {
  if (!orderId) return { ok: false, error: 'no_order' };
  try {
    const { data, error } = await supabase.rpc('taxi_release_offer', { p_order_id: orderId });
    if (error) return { ok: false, error: error.message };
    return { ok: !!data };
  } catch {
    return { ok: false, error: 'network' };
  }
}

// Пассажир снимает своё предложение и возвращает заказ в общий поиск.
// Ему прямой UPDATE разрешён (passenger_id = auth.uid() и в новой строке).
export async function withdrawOffer({ orderId, driverId }) {
  if (!orderId || !driverId) return { ok: false, error: 'no_target' };
  try {
    const { data, error } = await supabase
      .from('taxi_orders')
      .update({ driver_id: null })
      .eq('id', orderId)
      .eq('driver_id', driverId)
      .eq('status', 'searching')
      .select('id')
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: !!data, error: data ? null : 'not_found' };
  } catch {
    return { ok: false, error: 'network' };
  }
}
