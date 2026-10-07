/**
 * widgetCheckout — валидация формы и сборка payload заказа для PostgREST.
 * Чистые функции, покрыты тестами (widgetCheckout.test.js).
 */
import { toOrderRows, cartCount } from '@/lib/widgetCart';

const PHONE_RE = /^\+?[0-9() -]{7,20}$/;
const round2 = (x) => Math.round(Number(x) * 100) / 100;

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
 * Собирает { order, rows } для POST /rest/v1/orders + /rest/v1/order_items.
 * gatewayEnabled=false (шлюз не подключён) — карта не проходит, всегда cash:
 * покупатель не может заявить карту, не оплатив её.
 */
export function buildOrderPayload({ businessId, form = {}, cart = {}, items = [], gatewayEnabled = false }) {
  const rows = toOrderRows(cart, items);
  const total = round2(rows.reduce((s, r) => s + r.total, 0));
  const needsAddress = form.deliveryType !== 'pickup';
  const hasGeo = hasCoord(form.lat) && hasCoord(form.lng);

  const order = {
    business_id: businessId,
    customer_name: String(form.name || '').trim() || null,
    customer_phone: String(form.phone || '').trim() || null,
    delivery_type: form.deliveryType || 'delivery',
    delivery_address: needsAddress && String(form.address || '').trim()
      ? String(form.address).trim()
      : null,
    delivery_lat: needsAddress && hasGeo ? Number(form.lat) : null,
    delivery_lng: needsAddress && hasGeo ? Number(form.lng) : null,
    payment_method: gatewayEnabled && form.paymentMethod === 'card' ? 'card' : 'cash',
    total,
    status: 'pending',
  };
  return { order, rows };
}
