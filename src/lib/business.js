import { supabase } from '@/api/supabase';

// ─── Статусы заказов ─────────────────────────────────────────
// Допустимые переходы — зеркало серверного set_order_status().
export const ORDER_FLOW = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
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

/** Создать заказ вручную (продавец). items: [{product_id, product_name, quantity, price}]. */
export async function createOrder(businessId, { customerName, customerPhone, deliveryType = 'delivery', deliveryAddress = '', notes = '', items = [] }) {
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
