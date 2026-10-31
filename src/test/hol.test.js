/**
 * Хол — бонусная валюта-приз: только выдача из админки, тратится только на
 * подписку. Курс 1 Хол = 1 TJS (согласовано). Здесь — чистая логика выбора
 * способа оплаты подписки, которую использует профиль.
 */
import { describe, it, expect } from 'vitest';
import {
  canPayWithHol,
  isSubscriptionMethod,
  renewParams,
  payMethodOptions,
} from '@/lib/hol';

describe('canPayWithHol', () => {
  it('достаточно или ровно хватает', () => {
    expect(canPayWithHol(30, 20)).toBe(true);
    expect(canPayWithHol(20, 20)).toBe(true);
  });

  it('не хватает — false', () => {
    expect(canPayWithHol(19.99, 20)).toBe(false);
    expect(canPayWithHol(0, 20)).toBe(false);
    expect(canPayWithHol(null, 20)).toBe(false);
    expect(canPayWithHol(undefined, 20)).toBe(false);
    expect(canPayWithHol('abc', 20)).toBe(false);
  });

  it('строковый баланс из БД принимается', () => {
    expect(canPayWithHol('50', 20)).toBe(true);
  });
});

describe('isSubscriptionMethod', () => {
  it('допустимы только money и hol', () => {
    expect(isSubscriptionMethod('money')).toBe(true);
    expect(isSubscriptionMethod('hol')).toBe(true);
    expect(isSubscriptionMethod('cash')).toBe(false);
    expect(isSubscriptionMethod('')).toBe(false);
    expect(isSubscriptionMethod(null)).toBe(false);
    expect(isSubscriptionMethod(undefined)).toBe(false);
  });
});

describe('renewParams — аргумент RPC renew_subscription', () => {
  it('передаёт способ оплаты', () => {
    expect(renewParams('hol')).toEqual({ p_method: 'hol' });
    expect(renewParams('money')).toEqual({ p_method: 'money' });
  });

  it('некорректный способ — безопасный дефолт «деньги»', () => {
    expect(renewParams('btc')).toEqual({ p_method: 'money' });
    expect(renewParams(null)).toEqual({ p_method: 'money' });
    expect(renewParams(undefined)).toEqual({ p_method: 'money' });
  });
});

describe('payMethodOptions — что показать в окне оплаты подписки', () => {
  it('деньги доступны при балансе ≥ тарифа, Хол — при своём ≥ тарифа', () => {
    const opts = payMethodOptions({ balance: 15, hol: 30, fee: 20 });
    expect(opts).toEqual([
      { method: 'money', available: false },
      { method: 'hol', available: true },
    ]);
  });

  it('оба доступны, когда хватает и того и другого', () => {
    const opts = payMethodOptions({ balance: 100, hol: 100, fee: 20 });
    expect(opts.every((o) => o.available)).toBe(true);
  });

  it('ни одного, когда не хватает нигде', () => {
    const opts = payMethodOptions({ balance: 5, hol: 5, fee: 20 });
    expect(opts.some((o) => o.available)).toBe(false);
  });

  it('порядок стабилен: деньги, затем Хол', () => {
    const opts = payMethodOptions({ balance: 0, hol: 0, fee: 20 });
    expect(opts.map((o) => o.method)).toEqual(['money', 'hol']);
  });

  it('битые входы не роняют окно', () => {
    const opts = payMethodOptions({});
    expect(opts).toHaveLength(2);
    expect(opts.every((o) => o.available === false)).toBe(true);
  });
});
