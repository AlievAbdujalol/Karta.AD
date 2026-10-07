/**
 * api/orders.js — фасад создания заказов (спецификация §10: POST /api/orders).
 * Единственный вход для новых заказов — RPC create_store_order:
 * сервер сам считает цены из products, доставку из website_settings,
 * проверяет stock/минимальную сумму и rate-limit. Клиенту нельзя доверять total.
 */
import { supabase } from '@/api/supabase';
import { storeOrderErrorMessage } from '@/lib/orderErrors';

export { STORE_ORDER_ERRORS, storeOrderErrorMessage, STORE_ORDER_FALLBACK } from '@/lib/orderErrors';

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
