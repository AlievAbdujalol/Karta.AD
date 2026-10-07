/**
 * api/orders.js — фасад создания заказов (спецификация §10: POST /api/orders).
 * Единственный вход для новых заказов — RPC create_store_order:
 * сервер сам считает цены из products, доставку из website_settings,
 * проверяет stock/минимальную сумму и rate-limit. Клиенту нельзя доверять total.
 */
import { supabase } from '@/api/supabase';

/** Человекочитаемые сообщения серверных кодов ошибок RPC. */
export const STORE_ORDER_ERRORS = {
  bad_items: 'Корзина пуста или содержит слишком много позиций',
  bad_phone: 'Проверьте номер телефона',
  bad_quantity: 'Количество товара — от 1 до 99',
  bad_payment_method: 'Способ оплаты не поддерживается',
  business_unavailable: 'Магазин временно не принимает заказы',
  unknown_product: 'Один из товаров больше не продаётся',
  out_of_stock: 'Товар закончился',
  min_order_not_met: 'Не достигнута минимальная сумма заказа',
  too_many_orders: 'Слишком много заказов. Попробуйте чуть позже',
};

/** Преобразовать ошибку RPC в понятный текст для пользователя. */
export function storeOrderErrorMessage(err) {
  const msg = String(err?.message || err || '');
  for (const [code, text] of Object.entries(STORE_ORDER_ERRORS)) {
    if (msg.includes(code)) return text;
  }
  return 'Не удалось создать заказ. Попробуйте ещё раз';
}

/**
 * Создать заказ.
 * @param {{businessId, items:[{product_id, quantity}], customer:{name, phone, notes?},
 *          delivery?:{type, address, lat, lng}, paymentMethod?:'cash'|'card'}} payload
 * @returns {Promise<{order_id, total, delivery_cost}>}
 */
export async function createStoreOrder({
  businessId, items = [], customer = {}, delivery = {}, paymentMethod = 'cash',
}) {
  const { data, error } = await supabase.rpc('create_store_order', {
    p_business_id: businessId,
    p_items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    p_customer: { name: customer.name, phone: customer.phone, notes: customer.notes || '' },
    p_delivery: {
      type: delivery.type === 'pickup' ? 'pickup' : 'delivery',
      address: delivery.address || '',
      lat: delivery.lat ?? null,
      lng: delivery.lng ?? null,
    },
    p_payment_method: paymentMethod === 'card' ? 'card' : 'cash',
  });
  if (error) throw new Error(storeOrderErrorMessage(error));
  return data;
}
