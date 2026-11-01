/**
 * businessAccess.js — кто получает доступ к разделу /business.
 *
 * Раньше страница решала это по наличию бизнеса: аккаунт с ролью «Пассажир»,
 * когда-то создавший бизнес, видел полный дашборд. Роль — единственный
 * источник истины: платная подписка «Бизнес» (см. isBusinessRoleActive).
 *
 * Решение вынесено из компонента, чтобы его можно было тестировать
 * без React и переиспользовать в навигации.
 */
import { BUSINESS_ROLE, isBusinessRoleActive } from '@/lib/roles';

export const BUSINESS_ACCESS = {
  /** Активная подписка «Бизнес» — полный доступ. */
  active: 'active',
  /** Админ: поддержка и модерация, подписка не нужна. */
  admin: 'admin',
  /** Роль не «Бизнес» — её нужно активировать в профиле. */
  needs_role: 'needs_role',
  /** Роль «Бизнес» есть, но подписка истекла/не оплачена — продлить. */
  expired: 'expired',
};

/**
 * Состояние доступа к бизнес-разделу.
 * @param {object|null|undefined} user профиль (role, subscription_status, subscription_paid_until)
 * @returns {'active'|'admin'|'needs_role'|'expired'}
 */
export function businessAccessState(user) {
  if (!user) return BUSINESS_ACCESS.needs_role;
  if (user.role === 'admin') return BUSINESS_ACCESS.admin;
  if (isBusinessRoleActive(user)) return BUSINESS_ACCESS.active;
  if (user.role === BUSINESS_ROLE) return BUSINESS_ACCESS.expired;
  return BUSINESS_ACCESS.needs_role;
}

/** Доступ разрешён: активная бизнес-подписка или админ. */
export function canAccessBusiness(user) {
  const state = businessAccessState(user);
  return state === BUSINESS_ACCESS.active || state === BUSINESS_ACCESS.admin;
}

/**
 * Показывать ли вкладку «Бизнес» в нижней навигации.
 *
 * Требование: без роли «Бизнес» раздела не должно быть видно вообще.
 * Вкладку оставляем при роли «Бизнес» даже с истёкшей подпиской — иначе
 * продлить её можно только по прямому URL, а пейволл объясняет, что делать.
 * Админ — исключение (поддержка).
 */
export function showBusinessTab(user) {
  if (!user) return false;
  return user.role === BUSINESS_ROLE || user.role === 'admin';
}
