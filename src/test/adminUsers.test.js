import { describe, it, expect } from 'vitest';
import {
  ASSIGNABLE_ROLES, validateNewUser, validateTopup, formatTJS,
} from '../lib/adminUsers';

describe('validateNewUser', () => {
  const good = {
    email: 'client@example.com',
    password: 'secret123',
    fullName: 'Алиев Абдучалол',
    phone: '+992 90 123 45 67',
    role: 'user',
    balance: 0,
  };

  it('корректные данные проходят', () => {
    expect(validateNewUser(good)).toEqual({ ok: true, errors: {} });
  });

  it('некорректный или пустой e-mail отклоняется', () => {
    expect(validateNewUser({ ...good, email: 'не-почта' }).errors.email).toBeTruthy();
    expect(validateNewUser({ ...good, email: '' }).errors.email).toBeTruthy();
    expect(validateNewUser({ ...good, email: 'a@b' }).errors.email).toBeTruthy();
  });

  it('короткий пароль отклоняется (минимум 6 символов)', () => {
    expect(validateNewUser({ ...good, password: '12345' }).errors.password).toBeTruthy();
    expect(validateNewUser({ ...good, password: '' }).errors.password).toBeTruthy();
    expect(validateNewUser({ ...good, password: '123456' }).ok).toBe(true);
  });

  it('имя короче 2 символов отклоняется', () => {
    expect(validateNewUser({ ...good, fullName: 'A' }).errors.fullName).toBeTruthy();
  });

  it('телефон не обязателен, но проверяется', () => {
    expect(validateNewUser({ ...good, phone: '' }).ok).toBe(true);
    expect(validateNewUser({ ...good, phone: 'не телефон' }).errors.phone).toBeTruthy();
    expect(validateNewUser({ ...good, phone: '+992901234567' }).ok).toBe(true);
  });

  it('роль ограничена списком допустимых', () => {
    expect(validateNewUser({ ...good, role: 'hacker' }).errors.role).toBeTruthy();
    expect(validateNewUser({ ...good, role: 'business' }).ok).toBe(true);
    expect(ASSIGNABLE_ROLES).toContain('business');
  });

  it('стартовый баланс: неотрицательный и в разумных пределах', () => {
    expect(validateNewUser({ ...good, balance: -5 }).errors.balance).toBeTruthy();
    expect(validateNewUser({ ...good, balance: 'abc' }).errors.balance).toBeTruthy();
    expect(validateNewUser({ ...good, balance: 2000000 }).errors.balance).toBeTruthy();
    expect(validateNewUser({ ...good, balance: 1500 }).ok).toBe(true);
  });

  it('собирает все ошибки сразу', () => {
    const res = validateNewUser({ email: '', password: '', fullName: '' });
    expect(res.ok).toBe(false);
    expect(Object.keys(res.errors).length).toBeGreaterThanOrEqual(3);
  });
});

describe('validateTopup', () => {
  it('положительная сумма округляется до копеек', () => {
    expect(validateTopup('1000')).toEqual({ ok: true, amount: 1000 });
    expect(validateTopup(12.345)).toEqual({ ok: true, amount: 12.35 });
  });

  it('ноль, отрицательные и мусор отклоняются', () => {
    expect(validateTopup(0).ok).toBe(false);
    expect(validateTopup(-10).ok).toBe(false);
    expect(validateTopup('abc').ok).toBe(false);
    expect(validateTopup('').ok).toBe(false);
  });

  it('слишком большая сумма отклоняется', () => {
    expect(validateTopup(2000000).ok).toBe(false);
  });
});

describe('formatTJS', () => {
  it('всегда два знака после запятой', () => {
    expect(formatTJS(1000)).toBe('1000.00 TJS');
    expect(formatTJS(12.5)).toBe('12.50 TJS');
    expect(formatTJS(null)).toBe('0.00 TJS');
  });
});
