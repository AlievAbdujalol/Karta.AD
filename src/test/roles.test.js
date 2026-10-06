import { describe, it, expect } from 'vitest';
import {
  BUSINESS_ROLE, BUSINESS_MONTHLY_FEE, roleFee, renewalFee, isBusinessRoleActive, roleChangeFee,
} from '../lib/roles';

const inDay = () => new Date(Date.now() + 86400000).toISOString();
const dayAgo = () => new Date(Date.now() - 86400000).toISOString();

describe('roleFee', () => {
  it('бизнес — 1000 TJS в месяц', () => {
    expect(BUSINESS_MONTHLY_FEE).toBe(1000);
    expect(roleFee('business')).toBe(1000);
    expect(roleFee(BUSINESS_ROLE)).toBe(1000);
  });

  it('пассажир бесплатен, водитель 20, такси-водитель 25', () => {
    expect(roleFee('passenger')).toBe(0);
    expect(roleFee('driver')).toBe(20);
    expect(roleFee('taxi_driver')).toBe(25);
  });

  it('админ: 100 при первой активации, 25 при продлении', () => {
    expect(roleFee('admin', { adminActivated: false })).toBe(100);
    expect(roleFee('admin', { adminActivated: true })).toBe(25);
    expect(renewalFee('admin')).toBe(25);
  });

  it('неизвестная роль не тарифицируется', () => {
    expect(roleFee('hacker')).toBe(0);
    expect(renewalFee('hacker')).toBe(0);
  });
});

describe('renewalFee', () => {
  it('продление бизнеса — те же 1000 TJS', () => {
    expect(renewalFee('business')).toBe(1000);
    expect(renewalFee('driver')).toBe(20);
    expect(renewalFee('taxi_driver')).toBe(25);
  });
});

describe('roleChangeFee', () => {
  it('бизнес — 1000 TJS даже при активной подписке другой роли', () => {
    expect(roleChangeFee('business', { hasActiveSub: true })).toBe(1000);
    expect(roleChangeFee(BUSINESS_ROLE, { hasActiveSub: false })).toBe(1000);
  });

  it('остальные роли при активной подписке бесплатны', () => {
    expect(roleChangeFee('driver', { hasActiveSub: true })).toBe(0);
    expect(roleChangeFee('taxi_driver', { hasActiveSub: true })).toBe(0);
  });

  it('без активной подписки берётся обычный тариф роли', () => {
    expect(roleChangeFee('driver', { hasActiveSub: false })).toBe(20);
    expect(roleChangeFee('taxi_driver', { hasActiveSub: false })).toBe(25);
    expect(roleChangeFee('admin', { hasActiveSub: false, adminActivated: false })).toBe(100);
    expect(roleChangeFee('passenger', { hasActiveSub: false })).toBe(0);
  });
});

describe('isBusinessRoleActive', () => {
  it('активна только при role=business и не истёкшей подписке', () => {
    expect(isBusinessRoleActive({ role: 'business', subscription_status: 'active', subscription_paid_until: inDay() })).toBe(true);
    expect(isBusinessRoleActive({ role: 'business', subscription_status: 'expired', subscription_paid_until: inDay() })).toBe(false);
    expect(isBusinessRoleActive({ role: 'business', subscription_status: 'active', subscription_paid_until: dayAgo() })).toBe(false);
  });

  it('другие роли и отсутствие профиля — не активна', () => {
    expect(isBusinessRoleActive({ role: 'user', subscription_status: 'active', subscription_paid_until: inDay() })).toBe(false);
    expect(isBusinessRoleActive({ role: 'admin', subscription_status: 'active', subscription_paid_until: inDay() })).toBe(false);
    expect(isBusinessRoleActive(null)).toBe(false);
    expect(isBusinessRoleActive({})).toBe(false);
  });
});
