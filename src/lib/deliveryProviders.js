/**
 * deliveryProviders.js — абстракция курьерской службы (спецификация §11).
 *
 * Интерфейс DeliveryProvider:
 *   calculatePrice(ctx)      → Promise<{ price, currency, etaMinutes? }>
 *   createDelivery(order)    → Promise<{ deliveryId, status }>
 *   getStatus(deliveryId)    → Promise<{ status }>
 *   cancelDelivery(id, why)  → Promise<{ status }>
 *
 * Первый провайдер — KartaOrderDeliveryProvider: доставка в Karta-AD
 * живёт внутри заказа (orders.delivery_*), курьер подключается существующим
 * конвейером бизнеса (confirmed → in_transit → delivered), отдельных таблиц
 * не создаётся. Провайдеру можно подменить транспорт (дистанционный расчёт
 * по координатам / реальный API курьерской службы), не трогая чекаут.
 */
import { supabase } from '@/api/supabase';

export const DELIVERY_PROVIDER_REGISTRY = [
  { id: 'karta', label: 'Karta-AD Доставка', available: true },
  { id: 'yandex', label: 'Яндекс Доставка', available: false },
  { id: 'glovo', label: 'Glovo', available: false },
];

/**
 * Локальный расчёт стоимости по настройкам сайта (зеркалит серверную
 * логику create_store_order для отображения в корзине; авторитетна серверная).
 * free_from (бесплатно от суммы) — опционально.
 */
export function calcDeliveryPrice(settings, subtotal = 0) {
  const s = settings || {};
  if (s.enabled === false) return 0;
  const sub = Number(subtotal) || 0;
  const freeFrom = Number(s.free_from);
  if (Number.isFinite(freeFrom) && freeFrom > 0 && sub >= freeFrom) return 0;
  if (s.mode === 'free') return 0;
  if (s.mode === 'distance') return 0; // требует координаты — считает транспорт
  const price = Number(s.price);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

/** Расстояние по координатам (км, гaversine) — для режима «по расстоянию». */
export function haversineKm(a, b) {
  const toRad = (x) => (Number(x) * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Karta-AD: «по расстоянию» считает серверный calculate_delivery_price
 * (anon-доступен), остальные режимы — локально по настройкам.
 */
export const KartaOrderDeliveryProvider = {
  id: 'karta',
  label: 'Karta-AD Доставка',
  available: true,

  async calculatePrice({ settings, subtotal = 0, pickup = null, dropoff = null } = {}) {
    const s = settings || {};
    if (s.mode === 'distance' && pickup && dropoff) {
      const { data, error } = await supabase.rpc('calculate_delivery_price', {
        p_pickup_lat: Number(pickup.lat),
        p_pickup_lng: Number(pickup.lng),
        p_dropoff_lat: Number(dropoff.lat),
        p_dropoff_lng: Number(dropoff.lng),
        p_weight_kg: 0,
      });
      if (error) throw new Error(`calculate_delivery_price: ${error.message}`);
      return { price: Number(data) || 0, currency: 'TJS' };
    }
    return { price: calcDeliveryPrice(s, subtotal), currency: 'TJS' };
  },

  /**
   * Заявка на доставку = сам заказ с delivery_type='delivery'.
   * Никаких новых таблиц: курьер назначается конвейером подтверждения
   * заказа (set_order_status), статус живёт в orders.status.
   */
  async createDelivery({ orderId, status = 'pending' } = {}) {
    if (!orderId) throw new Error('createDelivery: нужен orderId');
    return { deliveryId: orderId, status, provider: 'karta' };
  },

  getStatus: async () => {
    throw new Error('Статус курьерской заявки доступен через статус заказа (orders.status)');
  },

  cancelDelivery: async () => {
    throw new Error('Отмена доставки = отмена заказа владельцем (set_order_status)');
  },
};

export function getDeliveryProvider(id) {
  return DELIVERY_PROVIDER_REGISTRY.find((p) => p.id === id)
    ? (id === KartaOrderDeliveryProvider.id ? KartaOrderDeliveryProvider : null)
    : null;
}
