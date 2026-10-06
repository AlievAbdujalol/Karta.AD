/**
 * roles.js — тарифы и правила платных ролей.
 * Источник истины по ценам для UI; фактическое списание делает
 * серверная функция request_role_change (см. supabase/migrations).
 */

export const BUSINESS_ROLE = 'business';
export const BUSINESS_MONTHLY_FEE = 1000; // TJS в месяц

const ROLE_FEES = {
  passenger: 0,
  driver: 20,
  taxi_driver: 25,
  [BUSINESS_ROLE]: BUSINESS_MONTHLY_FEE,
};

const ADMIN_FEE_FIRST = 100;
const ADMIN_FEE_RENEW = 25;

/** Стоимость входа в роль (0 — бесплатно). */
export function roleFee(role, { adminActivated = false } = {}) {
  if (role === 'admin') return adminActivated ? ADMIN_FEE_RENEW : ADMIN_FEE_FIRST;
  return ROLE_FEES[role] ?? 0;
}

/** Стоимость продления подписки текущей роли. */
export function renewalFee(role) {
  return roleFee(role, { adminActivated: true });
}

/**
 * Стоимость смены роли с учётом текущей подписки.
 * «Бизнес» тарифицируется ВСЕГДА (1000 TJS): иначе активная подписка другой роли
 * дарила бы бизнес бесплатно — так же считает серверная request_role_change.
 */
export function roleChangeFee(role, { hasActiveSub = false, adminActivated = false } = {}) {
  if (role === BUSINESS_ROLE) return BUSINESS_MONTHLY_FEE;
  if (hasActiveSub) return 0;
  return roleFee(role, { adminActivated });
}

/**
 * Роль «Бизнес» активна: роль принята и подписка не истекла.
 * Без этого создание бизнеса и платные бизнес-функции недоступны.
 */
export function isBusinessRoleActive(user) {
  if (!user || user.role !== BUSINESS_ROLE) return false;
  if (user.subscription_status !== 'active') return false;
  return new Date(user.subscription_paid_until || 0) > new Date();
}
