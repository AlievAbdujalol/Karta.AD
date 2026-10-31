/**
 * hol.js — «Хол»: бонусная валюта-приз.
 *
 * Свойства (согласовано с владельцем):
 *   • курс 1 Хол = 1 TJS при отображении;
 *   • получение — только выдача из админки (RPC admin_grant_hol, аудит);
 *   • трата — только оплата подписки (RPC renew_subscription с p_method='hol');
 *   • реальный баланс кошелька (profiles.balance) Хол не трогает.
 *
 * Здесь — чистая логика выбора способа оплаты; списание всегда на сервере.
 */

/** Безопасный дефолт RPC: неизвестный способ → деньги. */
export const DEFAULT_PAY_METHOD = 'money';

/**
 * Хватает ли «Хол» на тариф подписки.
 * @param {number|string|null} holBalance баланс Хол (из БД может прийти строкой)
 * @param {number|string} fee тариф подписки в TJS
 */
export function canPayWithHol(holBalance, fee) {
  const f = Number(fee);
  // тариф неизвестен или бесплатен — платить нечем и не нужно
  if (!Number.isFinite(f) || f <= 0) return false;
  const hol = Number(holBalance);
  return Number.isFinite(hol) && hol >= f;
}

/** Допустимый ли способ оплаты подписки (валидация до RPC). */
export function isSubscriptionMethod(method) {
  return method === 'money' || method === 'hol';
}

/**
 * Аргументы для supabase.rpc('renew_subscription', …).
 * Некорректный способ деградирует в «деньги» — сервер получит валидное значение.
 */
export function renewParams(method) {
  return { p_method: isSubscriptionMethod(method) ? method : DEFAULT_PAY_METHOD };
}

/**
 * Варианты для окна «Чем оплатить подписку?».
 * Порядок стабилен: деньги, затем Хол.
 * @returns {Array<{method: 'money'|'hol', available: boolean}>}
 */
export function payMethodOptions({ balance, hol, fee } = {}) {
  const f = Number(fee);
  const validFee = Number.isFinite(f) && f > 0;
  const bal = Number(balance);
  return [
    {
      method: 'money',
      available: validFee && Number.isFinite(bal) && bal >= f,
    },
    {
      method: 'hol',
      available: canPayWithHol(hol, f),
    },
  ];
}
