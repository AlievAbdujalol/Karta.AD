import { describe, it, expect } from 'vitest';
import {
  PRESET_AMOUNTS, MIN_TOPUP, MAX_TOPUP, validateTopupAmount, paymentStatusLabel, buildTopupRequest,
} from '../lib/topup';

describe('PRESET_AMOUNTS', () => {
  it('подобраны под тарифы ролей', () => {
    expect(PRESET_AMOUNTS).toContain(1000); // роль «Бизнес»
    expect(PRESET_AMOUNTS).toContain(20);
    expect(PRESET_AMOUNTS.every((v) => v > 0)).toBe(true);
  });
});

describe('validateTopupAmount', () => {
  it('принимает суммы от 10 до 1 000 000', () => {
    expect(validateTopupAmount(1000)).toEqual({ ok: true, amount: 1000 });
    expect(validateTopupAmount('250.5')).toEqual({ ok: true, amount: 250.5 });
    expect(validateTopupAmount(MIN_TOPUP)).toEqual({ ok: true, amount: MIN_TOPUP });
  });

  it('отклоняет слишком маленькую сумму', () => {
    const res = validateTopupAmount(5);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('10');
  });

  it('отклоняет слишком большую и некорректные значения', () => {
    expect(validateTopupAmount(MAX_TOPUP + 1).ok).toBe(false);
    expect(validateTopupAmount('abc').ok).toBe(false);
    expect(validateTopupAmount('').ok).toBe(false);
    expect(validateTopupAmount(-100).ok).toBe(false);
  });

  it('округляет до копеек', () => {
    expect(validateTopupAmount(10.129).amount).toBe(10.13);
  });
});

describe('paymentStatusLabel', () => {
  it('переводит статусы заявки', () => {
    expect(paymentStatusLabel('pending', 'ru')).toBe('Ожидает');
    expect(paymentStatusLabel('paid', 'ru')).toBe('Зачислено');
    expect(paymentStatusLabel('cancelled', 'ru')).toBe('Отменена');
    expect(paymentStatusLabel('rejected', 'ru')).toBe('Отклонена');
  });

  it('на английском и для неизвестного статуса', () => {
    expect(paymentStatusLabel('pending', 'en')).toBe('Pending');
    expect(paymentStatusLabel('что-то', 'ru')).toBe('что-то');
  });
});

describe('buildTopupRequest', () => {
  it('собирает параметры RPC только из валидной суммы', () => {
    expect(buildTopupRequest('1000')).toEqual({ p_amount: 1000, p_method: 'manual' });
    expect(buildTopupRequest(250.5)).toEqual({ p_amount: 250.5, p_method: 'manual' });
  });

  it('на выбранном методе', () => {
    expect(buildTopupRequest(500, 'card')).toEqual({ p_amount: 500, p_method: 'card' });
  });

  it('на невалидной сумме не строит запрос', () => {
    expect(buildTopupRequest(0)).toBeNull();
    expect(buildTopupRequest('abc')).toBeNull();
  });
});
