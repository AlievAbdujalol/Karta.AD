import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/api/supabase', () => ({ supabase: { rpc: (...a) => rpc(...a) } }));

import { createStoreOrder, storeOrderErrorMessage, STORE_ORDER_ERRORS } from '../lib/api/orders';

beforeEach(() => rpc.mockReset());

describe('createStoreOrder', () => {
  it('вызывает create_store_order с типизированными аргументами', async () => {
    rpc.mockResolvedValue({ data: { order_id: 'o1', total: 100, delivery_cost: 0 }, error: null });
    const res = await createStoreOrder({
      businessId: 'b1',
      items: [{ product_id: 'p1', quantity: 2 }],
      customer: { name: 'Али', phone: '+992900000000', notes: 'позвонить' },
      delivery: { type: 'delivery', address: 'пр. Рудаки 1', lat: 38.5, lng: 68.7 },
      paymentMethod: 'cash',
    });
    expect(rpc).toHaveBeenCalledWith('create_store_order', {
      p_business_id: 'b1',
      p_items: [{ product_id: 'p1', quantity: 2 }],
      p_customer: { name: 'Али', phone: '+992900000000', notes: 'позвонить' },
      p_delivery: { type: 'delivery', address: 'пр. Рудаки 1', lat: 38.5, lng: 68.7 },
      p_payment_method: 'cash',
    });
    expect(res).toEqual({ order_id: 'o1', total: 100, delivery_cost: 0 });
  });

  it('нормализует paymentMethod и type доставки к допустимым значениям', async () => {
    rpc.mockResolvedValue({ data: { order_id: 'o2', total: 0, delivery_cost: 0 }, error: null });
    await createStoreOrder({
      businessId: 'b1',
      items: [{ product_id: 'p1', quantity: 1 }],
      customer: { name: 'X', phone: '+992900000001' },
      delivery: { type: 'weird' },
      paymentMethod: 'bitcoin',
    });
    const args = rpc.mock.calls[0][1];
    expect(args.p_delivery.type).toBe('delivery');
    expect(args.p_payment_method).toBe('cash');
    expect(args.p_delivery).toEqual({ type: 'delivery', address: '', lat: null, lng: null });
  });

  it('ошибка RPC → человекочитаемое сообщение, а не код', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'duplicate key / out_of_stock' } });
    await expect(createStoreOrder({
      businessId: 'b',
      items: [{ product_id: 'p', quantity: 1 }],
      customer: { name: 'n', phone: '+992900000002' },
    })).rejects.toThrow('Товар закончился');
  });

  it('неизвестная ошибка → общее сообщение без утечки деталей SQL', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied for table orders' } });
    await expect(createStoreOrder({
      businessId: 'b',
      items: [{ product_id: 'p', quantity: 1 }],
      customer: { name: 'n', phone: '+992900000003' },
    })).rejects.toThrow('Не удалось создать заказ');
  });
});

describe('storeOrderErrorMessage', () => {
  it('покрывает все серверные коды ошибок', () => {
    expect(Object.keys(STORE_ORDER_ERRORS).length).toBeGreaterThanOrEqual(9);
    for (const code of Object.keys(STORE_ORDER_ERRORS)) {
      expect(storeOrderErrorMessage(new Error(`raise ${code}`))).toBe(STORE_ORDER_ERRORS[code]);
    }
  });

  it('пустая ошибка не падает', () => {
    expect(storeOrderErrorMessage(null)).toContain('Не удалось создать заказ');
    expect(storeOrderErrorMessage('')).toContain('Не удалось создать заказ');
  });
});
