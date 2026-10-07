/**
 * paymentProviders.js — абстракция платёжного провайдера (спецификация §12).
 *
 * Интерфейс PaymentProvider:
 *   id, label — идентификатор и подпись для UI;
 *   createPayment({ orderId, amount, currency }) → { paymentId, status, redirectUrl? };
 *   refundPayment?(paymentId) → { status }.
 *
 * Первый рабочий провайдер — MockPaymentProvider (тестовый шлюз):
 * вызывает RPC create_store_payment, сумма берётся на сервере из
 * orders.total, помечает succeeded сразу. Реальные Alif/Эсхата/
 * Dushanbe City подключаются как новый объект того же интерфейса —
 * без переписывания визарда и чекаута.
 */
import { supabase } from '@/api/supabase';

/** Провайдеры, доступные для выбора в визарде. */
export const PAYMENT_PROVIDER_REGISTRY = [
  { id: 'mock', label: 'Тестовый платёж', available: true },
  { id: 'alif', label: 'Alif Pay', available: false },
  { id: 'eskhata', label: 'Эсхата Pay', available: false },
  { id: 'dushanbe_city', label: 'Dushanbe City', available: false },
];

export class PaymentNotConfiguredError extends Error {
  constructor(providerId) {
    const entry = PAYMENT_PROVIDER_REGISTRY.find((p) => p.id === providerId);
    super(`Платёжный провайдер «${entry?.label || providerId}» ещё не подключён`);
    this.name = 'PaymentNotConfiguredError';
    this.providerId = providerId;
  }
}

/** Тестовый шлюз: одна RPC-транзакция, сумма валидируется сервером. */
export const MockPaymentProvider = {
  id: 'mock',
  label: 'Тестовый платёж',
  available: true,

  async createPayment({ orderId, provider = 'mock' }) {
    if (!orderId) throw new Error('createPayment: нужен orderId');
    const { data, error } = await supabase.rpc('create_store_payment', {
      p_order_id: orderId,
      p_provider: provider,
    });
    if (error) throw new Error(`create_store_payment: ${error.message}`);
    return {
      paymentId: data.payment_id,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
    };
  },

  async refundPayment() {
    throw new Error('Возврат средств для тестового шлюза не поддерживается');
  },
};

/**
 * Получить провайдер по id. Неподключённый реальный провайдер →
 * объект с available=false, createPayment бросает PaymentNotConfiguredError
 * (кнопка в UI блокируется по available, ошибка — второй рубеж).
 */
export function getPaymentProvider(id) {
  const entry = PAYMENT_PROVIDER_REGISTRY.find((p) => p.id === id);
  if (!entry) return null;
  if (entry.id === MockPaymentProvider.id) return MockPaymentProvider;
  return {
    id: entry.id,
    label: entry.label,
    available: false,
    createPayment: async () => { throw new PaymentNotConfiguredError(entry.id); },
    refundPayment: async () => { throw new PaymentNotConfiguredError(entry.id); },
  };
}
