/**
 * topup.js — пополнение внутреннего баланса.
 *
 * Сейчас платёжный шлюз не подключён, поэтому работает «ручной» сценарий:
 * пользователь оставляет заявку, админ зачисляет деньги после оплаты
 * (на карту/в офисе) через complete_topup_request. Когда появится шлюз,
 * вебхук провайдера будет вызывать ту же функцию — код клиента не меняется.
 */

export const MIN_TOPUP = 10;
export const MAX_TOPUP = 1_000_000;

// Под тарифы ролей: 20 водитель, 25 такси, 1000 бизнес
export const PRESET_AMOUNTS = [20, 100, 500, 1000, 2500, 5000];

const STATUS_LABELS = {
  ru: {
    pending: 'Ожидает',
    paid: 'Зачислено',
    cancelled: 'Отменена',
    rejected: 'Отклонена',
  },
  en: {
    pending: 'Pending',
    paid: 'Credited',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
  },
  tg: {
    pending: 'Дар интизор',
    paid: 'Заряд шуд',
    cancelled: 'Бекор шуд',
    rejected: 'Рад шуд',
  },
};

/**
 * @returns {{ok: true, amount: number} | {ok: false, error: string}}
 */
export function validateTopupAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return { ok: false, error: 'Введите корректную сумму' };
  if (n < MIN_TOPUP) return { ok: false, error: `Минимальная сумма — ${MIN_TOPUP} TJS` };
  if (n > MAX_TOPUP) return { ok: false, error: `Максимум ${MAX_TOPUP} TJS за раз` };
  return { ok: true, amount: Math.round(n * 100) / 100 };
}

export function paymentStatusLabel(status, lang = 'ru') {
  return STATUS_LABELS[lang]?.[status] ?? status;
}

/** Параметры для RPC create_topup_request либо null, если сумма невалидна. */
export function buildTopupRequest(value, method = 'manual') {
  const res = validateTopupAmount(value);
  if (!res.ok) return null;
  return { p_amount: res.amount, p_method: method };
}
