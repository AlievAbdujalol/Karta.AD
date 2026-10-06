/**
 * adminUsers.js — валидация формы «добавить пользователя» и пополнения баланса.
 * Серверные RPC (admin_create_user / admin_topup_balance) проверяют права и суммы
 * повторно — здесь только UX-проверка до отправки запроса.
 */

export const ASSIGNABLE_ROLES = ['user', 'driver', 'taxi_driver', 'business', 'admin'];

export const MAX_TOPUP = 1_000_000;
export const MIN_PASSWORD = 6;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9 ()-]{5,19}$/;

/**
 * @returns {{ok: boolean, errors: Record<string, string>}}
 */
export function validateNewUser({ email, password, fullName, phone, role, balance } = {}) {
  const errors = {};

  if (!EMAIL_RE.test(String(email || '').trim())) errors.email = 'Некорректный e-mail';
  if (String(password || '').length < MIN_PASSWORD) errors.password = `Минимум ${MIN_PASSWORD} символов`;
  if (String(fullName || '').trim().length < 2) errors.fullName = 'Укажите имя (минимум 2 символа)';
  if (phone && !PHONE_RE.test(String(phone).trim())) errors.phone = 'Некорректный телефон';
  if (role && !ASSIGNABLE_ROLES.includes(role)) errors.role = 'Недопустимая роль';

  const bal = Number(balance || 0);
  if (!Number.isFinite(bal) || bal < 0 || bal > MAX_TOPUP) {
    errors.balance = `Сумма от 0 до ${MAX_TOPUP}`;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * @returns {{ok: true, amount: number} | {ok: false, error: string}}
 */
export function validateTopup(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Введите сумму больше нуля' };
  if (n > MAX_TOPUP) return { ok: false, error: `Максимум ${MAX_TOPUP} TJS за раз` };
  return { ok: true, amount: Math.round(n * 100) / 100 };
}

export function formatTJS(n) {
  return `${Number(n || 0).toFixed(2)} TJS`;
}
