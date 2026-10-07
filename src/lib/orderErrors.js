/**
 * orderErrors — серверные коды ошибок RPC create_store_order →
 * человекочитаемые сообщения. Чистый модуль без зависимостей:
 * используется SPA-фасадом (lib/api/orders) и виджетом (lib/widgetApi),
 * чтобы бандл виджета не тянул supabase-js.
 */
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

export const STORE_ORDER_FALLBACK = 'Не удалось создать заказ. Попробуйте ещё раз';

/** Преобразовать ошибку RPC (Error, {message} или сырой текст) в понятный текст. */
export function storeOrderErrorMessage(err) {
  const msg = String(err?.message || err || '');
  for (const [code, text] of Object.entries(STORE_ORDER_ERRORS)) {
    if (msg.includes(code)) return text;
  }
  return STORE_ORDER_FALLBACK;
}
