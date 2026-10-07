import { supabase } from '@/api/supabase';

// ─── Статусы заказов ─────────────────────────────────────────
// Допустимые переходы — зеркало серверного set_order_status().
export const ORDER_FLOW = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'in_transit', 'cancelled'],
  paid: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['picked_up', 'completed', 'cancelled'],
  picked_up: ['in_transit', 'cancelled'],
  in_transit: ['delivered', 'cancelled'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
  refunded: [],
};

export const NEXT_STATUS_LABEL = {
  confirmed: 'Подтвердить',
  preparing: 'Готовить',
  ready: 'Готов',
  picked_up: 'Забран',
  in_transit: 'В пути',
  delivered: 'Доставлен',
  completed: 'Завершить',
  cancelled: 'Отменить',
};

/** Следующие допустимые статусы для заказа. */
export function nextStatuses(status) {
  return ORDER_FLOW[status] || [];
}

// ─── Админ-конвейер: 4 понятных этапа поверх полного ORDER_FLOW ──
// pending → confirmed → in_transit («в доставке») → delivered (+ cancelled)
export const ADMIN_FLOW = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['in_transit', 'preparing', 'cancelled'],
  in_transit: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export const ADMIN_STATUS_LABEL = {
  pending: 'Новый',
  confirmed: 'Подтверждён',
  in_transit: 'В доставке',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
};

const ADMIN_ACTION_LABEL = {
  confirmed: 'Подтвердить',
  in_transit: 'В доставку',
  preparing: 'Готовить',
  delivered: 'Доставлен',
  cancelled: 'Отменить',
};

/** Какие кнопки показывать админу для текущего статуса заказа. */
export function adminNextStatuses(status) {
  return ADMIN_FLOW[status] || [];
}

/** Короткая подпись статуса для бейджа. */
export function adminStatusLabel(status) {
  return ADMIN_STATUS_LABEL[status] || status;
}

/** Подпись кнопки действия в админ-конвейере. */
export function adminActionLabel(status) {
  return ADMIN_ACTION_LABEL[status] || status;
}

/**
 * Смена статуса через серверный RPC (проверяет роль и переходы).
 * Возвращает true если применено, false если переход запрещён/нет доступа.
 */
export async function setOrderStatus(orderId, status) {
  const { data, error } = await supabase.rpc('set_order_status', {
    p_order_id: orderId,
    p_status: status,
  });
  if (error) throw error;
  return !!data;
}

/**
 * Редактирование заказа (владелец/менеджер — проверка на сервере).
 * patch: { customerName, customerPhone, deliveryAddress, deliveryLat,
 *          deliveryLng, notes, paymentMethod, total } — передаются только заданные.
 */
const ORDER_PATCH_MAP = {
  customerName: 'p_customer_name',
  customerPhone: 'p_customer_phone',
  deliveryAddress: 'p_delivery_address',
  deliveryLat: 'p_delivery_lat',
  deliveryLng: 'p_delivery_lng',
  notes: 'p_notes',
  paymentMethod: 'p_payment_method',
  total: 'p_total',
};

export async function updateOrder(orderId, patch = {}) {
  const args = { p_order_id: orderId };
  for (const [key, col] of Object.entries(ORDER_PATCH_MAP)) {
    if (patch[key] !== undefined) args[col] = patch[key];
  }
  const { data, error } = await supabase.rpc('update_business_order', args);
  if (error) throw error;
  return !!data;
}

/** Удалить заказ (только владелец; order_items уходят каскадом). */
export async function deleteOrder(orderId) {
  const { data, error } = await supabase.rpc('delete_business_order', {
    p_order_id: orderId,
  });
  if (error) throw error;
  return !!data;
}

/** Создать заказ вручную (продавец). items: [{product_id, product_name, quantity, price}]. */
export async function createOrder(businessId, { customerName, customerPhone, deliveryType = 'delivery', deliveryAddress = '', notes = '', paymentMethod = 'cash', items = [] }) {
  const total = items.reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 1), 0);
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      business_id: businessId,
      customer_name: customerName?.trim() || null,
      customer_phone: customerPhone?.trim() || null,
      delivery_type: deliveryType,
      delivery_address: deliveryAddress?.trim() || null,
      notes: notes?.trim() || null,
      payment_method: paymentMethod === 'card' ? 'card' : 'cash',
      total,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  if (items.length) {
    const rows = items.map((it) => ({
      order_id: order.id,
      product_id: it.product_id || null,
      product_name: it.product_name,
      quantity: Number(it.quantity || 1),
      price: Number(it.price || 0),
      total: Number(it.price || 0) * Number(it.quantity || 1),
    }));
    const { error: itemsError } = await supabase.from('order_items').insert(rows);
    if (itemsError) throw itemsError;
  }
  return order;
}

// ─── Форматирование ──────────────────────────────────────────

export function formatCurrency(n) {
  if (n === null || n === undefined || n === '') return '0 сом';
  return `${new Intl.NumberFormat('ru-RU').format(Number(n))} сом`;
}

export function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'только что';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** Динамика выручки неделя-к-неделе: { pct } или null если данных мало. */
export function revenueTrend(orders) {
  const now = Date.now();
  const week = 7 * 86400000;
  const inRange = (t0, t1, o) => {
    const t = new Date(o.created_at).getTime();
    return t >= t0 && t < t1 && (o.status === 'delivered' || o.status === 'completed');
  };
  const cur = orders.filter((o) => inRange(now - week, now, o)).reduce((s, o) => s + Number(o.total || 0), 0);
  const prev = orders.filter((o) => inRange(now - 2 * week, now - week, o)).reduce((s, o) => s + Number(o.total || 0), 0);
  if (prev <= 0) return null;
  return { pct: Math.round(((cur - prev) / prev) * 100) };
}
