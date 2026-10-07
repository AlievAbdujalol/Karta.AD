/**
 * widgetCheckout — валидация формы и сборка аргументов RPC заказа.
 * Чистые функции, покрыты тестами (widgetCheckout.test.js).
 */
import { toOrderRows, cartCount } from '@/lib/widgetCart';

const PHONE_RE = /^\+?[0-9() -]{7,20}$/;

export function validateCheckout(form = {}, cart = {}) {
  const errors = [];
  if (!String(form.name || '').trim()) errors.push('Имя покупателя обязательно');
  if (!PHONE_RE.test(String(form.phone || '').trim())) errors.push('Проверьте номер телефона');
  if (form.deliveryType !== 'pickup' && !String(form.address || '').trim()) {
    errors.push('Укажите адрес доставки');
  }
  if (cartCount(cart) <= 0) errors.push('Товары в корзине не выбраны');
  return { ok: errors.length === 0, errors };
}

const hasCoord = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));

/**
 * Аргументы RPC create_store_order (POST /rest/v1/rpc/create_store_order).
 * Цены и total клиент НЕ передаёт: сервер берёт их из каталога, сам считает
 * доставку, проверяет остатки, минимальную сумму и rate-limit.
 * gatewayEnabled=false (шлюз не подключён) — карта не проходит, всегда cash:
 * покупатель не может заявить карту, не оплатив её.
 */
export function buildStoreOrderArgs({ businessId, form = {}, cart = {}, items = [], gatewayEnabled = false }) {
  const rows = toOrderRows(cart, items);
  const needsAddress = form.deliveryType !== 'pickup';
  const hasGeo = hasCoord(form.lat) && hasCoord(form.lng);

  return {
    p_business_id: businessId,
    // Товары, исчезнувшие из каталога (product_id null), не блокируют заказ
    p_items: rows.filter((r) => r.product_id).map((r) => ({ product_id: r.product_id, quantity: r.quantity })),
    p_customer: {
      name: String(form.name || '').trim(),
      phone: String(form.phone || '').trim(),
      notes: String(form.notes || '').trim(),
    },
    p_delivery: {
      type: form.deliveryType === 'pickup' ? 'pickup' : 'delivery',
      address: needsAddress && String(form.address || '').trim()
        ? String(form.address).trim()
        : '',
      lat: needsAddress && hasGeo ? Number(form.lat) : null,
      lng: needsAddress && hasGeo ? Number(form.lng) : null,
    },
    p_payment_method: gatewayEnabled && form.paymentMethod === 'card' ? 'card' : 'cash',
  };
}
