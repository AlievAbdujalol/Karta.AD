import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/api/supabase', () => ({ supabase: { rpc: (...a) => rpc(...a) } }));

import {
  PAYMENT_PROVIDER_REGISTRY, getPaymentProvider, MockPaymentProvider,
  PaymentNotConfiguredError,
} from '../lib/paymentProviders';

beforeEach(() => rpc.mockReset());

describe('реестр платёжных провайдеров', () => {
  it('содержит mock + три реальных провайдера', () => {
    expect(PAYMENT_PROVIDER_REGISTRY.map((p) => p.id).sort())
      .toEqual(['alif', 'dushanbe_city', 'eskhata', 'mock']);
  });

  it('доступен только mock (реальные ещё не подключены)', () => {
    expect(getPaymentProvider('mock').available).toBe(true);
    for (const id of ['alif', 'eskhata', 'dushanbe_city']) {
      expect(getPaymentProvider(id).available).toBe(false);
    }
  });

  it('неизвестный id → null', () => {
    expect(getPaymentProvider('paypal')).toBeNull();
    expect(getPaymentProvider(undefined)).toBeNull();
  });
});

describe('нерабочие провайдеры', () => {
  it('createPayment бросает PaymentNotConfiguredError с id провайдера', async () => {
    const p = getPaymentProvider('alif');
    await expect(p.createPayment({ orderId: 'o1' })).rejects.toBeInstanceOf(PaymentNotConfiguredError);
    try {
      await p.createPayment({ orderId: 'o1' });
    } catch (e) {
      expect(e.providerId).toBe('alif');
      expect(e.message).toContain('Alif Pay');
    }
  });
});

describe('MockPaymentProvider', () => {
  it('createPayment → RPC create_store_payment, возвращает серверный результат', async () => {
    rpc.mockResolvedValue({ data: { payment_id: 'pay1', status: 'succeeded', amount: 100, currency: 'TJS' }, error: null });
    const res = await MockPaymentProvider.createPayment({ orderId: 'ord1' });
    expect(rpc).toHaveBeenCalledWith('create_store_payment', { p_order_id: 'ord1', p_provider: 'mock' });
    expect(res).toEqual({ paymentId: 'pay1', status: 'succeeded', amount: 100, currency: 'TJS' });
  });

  it('без orderId — ошибка, RPC не вызывается', async () => {
    await expect(MockPaymentProvider.createPayment({})).rejects.toThrow('orderId');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('ошибка RPC пробрасывается с именем функции', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'order not found' } });
    await expect(MockPaymentProvider.createPayment({ orderId: 'x' }))
      .rejects.toThrow('create_store_payment');
  });

  it('refund не поддерживается тестовым шлюзом', async () => {
    await expect(MockPaymentProvider.refundPayment('pay1')).rejects.toThrow('Возврат');
  });
});
