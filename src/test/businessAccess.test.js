/**
 * Доступ к разделу /business.
 *
 * Прод-наблюдение: аккаунт с ролью «Пассажир», который когда-то создал бизнес
 * «Магазин-AD», видел полный бизнес-дашборд — потому что страница проверяла
 * только «есть ли бизнесы», а не активную роль. Теперь доступ решает роль:
 *   • роль «Бизнес» + активная оплаченная подписка → доступ;
 *   • роль «Бизнес», но подписка истекла/не оплачена → пейволл «продлите»;
 *   • любая другая роль (пассажир, водитель, таксист) → пейволл «нужна роль»;
 *   • админ → доступ (поддержка и модерация), даже без подписки.
 */
import { describe, it, expect } from 'vitest';
import { businessAccessState, canAccessBusiness, BUSINESS_ACCESS } from '@/lib/businessAccess';

const DAY = 24 * 60 * 60 * 1000;
const future = new Date(Date.now() + 30 * DAY).toISOString();
const past = new Date(Date.now() - DAY).toISOString();

const businessUser = (over = {}) => ({
  id: 'u1',
  role: 'business',
  subscription_status: 'active',
  subscription_paid_until: future,
  ...over,
});

describe('businessAccessState', () => {
  it('роль «Бизнес» с активной подпиской — доступ', () => {
    expect(businessAccessState(businessUser())).toBe(BUSINESS_ACCESS.active);
    expect(canAccessBusiness(businessUser())).toBe(true);
  });

  it('пассажир без бизнес-роли — нужна роль, даже если владеет бизнесом', () => {
    const passenger = { id: 'u2', role: 'passenger', subscription_status: 'active', subscription_paid_until: future };
    expect(businessAccessState(passenger)).toBe(BUSINESS_ACCESS.needs_role);
    expect(canAccessBusiness(passenger)).toBe(false);
  });

  it('водитель и таксист — тоже нужна роль', () => {
    for (const role of ['driver', 'taxi_driver']) {
      expect(canAccessBusiness({ id: 'u', role, subscription_status: 'active', subscription_paid_until: future })).toBe(false);
    }
  });

  it('роль «Бизнес», но подписка истекла — отдельное состояние «продлите»', () => {
    const expired = businessUser({ subscription_paid_until: past });
    expect(businessAccessState(expired)).toBe(BUSINESS_ACCESS.expired);
    expect(canAccessBusiness(expired)).toBe(false);
  });

  it('роль «Бизнес», но подписка не оплачена/null — доступа нет', () => {
    expect(canAccessBusiness(businessUser({ subscription_status: 'pending' }))).toBe(false);
    expect(canAccessBusiness(businessUser({ subscription_paid_until: null }))).toBe(false);
    expect(canAccessBusiness(businessUser({ subscription_status: null }))).toBe(false);
  });

  it('админ проходит без бизнес-подписки', () => {
    const admin = { id: 'a1', role: 'admin', subscription_status: null, subscription_paid_until: null };
    expect(businessAccessState(admin)).toBe(BUSINESS_ACCESS.admin);
    expect(canAccessBusiness(admin)).toBe(true);
  });

  it('незагруженный пользователь не получает доступ (fail-closed)', () => {
    expect(canAccessBusiness(null)).toBe(false);
    expect(canAccessBusiness(undefined)).toBe(false);
    expect(canAccessBusiness({})).toBe(false);
  });
});
