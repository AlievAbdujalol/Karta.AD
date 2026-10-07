import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const fromChain = { insert: vi.fn(), select: vi.fn(), single: vi.fn() };

vi.mock('@/api/supabase', () => ({
  supabase: {
    rpc: (...args) => rpc(...args),
    from: () => fromChain,
  },
}));

import { updateOrder, deleteOrder, createOrder } from '../lib/business';

beforeEach(() => {
  rpc.mockReset();
  fromChain.insert.mockReset();
  fromChain.select.mockReset();
  fromChain.single.mockReset();
});

describe('updateOrder', () => {
  it('вызывает update_business_order с snake_case-полями', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const ok = await updateOrder('ord-1', {
      customerName: 'Али',
      customerPhone: '+992900',
      deliveryAddress: 'пр. Рудаки 1',
      deliveryLat: 38.56,
      deliveryLng: 68.78,
      notes: 'позвонить',
      paymentMethod: 'cash',
      total: 150,
    });
    expect(ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('update_business_order', {
      p_order_id: 'ord-1',
      p_customer_name: 'Али',
      p_customer_phone: '+992900',
      p_delivery_address: 'пр. Рудаки 1',
      p_delivery_lat: 38.56,
      p_delivery_lng: 68.78,
      p_notes: 'позвонить',
      p_payment_method: 'cash',
      p_total: 150,
    });
  });

  it('отправляет только переданные поля (patch поверх старых значений не требуется)', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await updateOrder('ord-1', { deliveryAddress: 'новый адрес' });
    const [, args] = rpc.mock.calls[0];
    expect(args.p_delivery_address).toBe('новый адрес');
    expect(args).not.toHaveProperty('p_total');
    expect(args).not.toHaveProperty('p_customer_name');
  });

  it('ошибка RPC пробрасывается', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('denied') });
    await expect(updateOrder('ord-1', { total: 1 })).rejects.toThrow('denied');
  });

  it('false при запрете перехода/нет доступа (data=false)', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(updateOrder('ord-1', { total: 1 })).resolves.toBe(false);
  });
});

describe('deleteOrder', () => {
  it('вызывает delete_business_order c id заказа', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(deleteOrder('ord-9')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('delete_business_order', { p_order_id: 'ord-9' });
  });

  it('ошибка RPC пробрасывается', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(deleteOrder('ord-9')).rejects.toThrow('boom');
  });

  it('false если не владелец', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(deleteOrder('ord-9')).resolves.toBe(false);
  });
});

describe('createOrder с способом оплаты', () => {
  it('вставляет payment_method в заказ', async () => {
    fromChain.insert.mockReturnValue(fromChain);
    fromChain.select.mockReturnValue(fromChain);
    fromChain.single.mockResolvedValue({ data: { id: 'o1' }, error: null });

    await createOrder('b1', {
      customerName: 'Али',
      items: [{ product_name: 'Пицца', price: 45, quantity: 2 }],
      paymentMethod: 'cash',
    });

    const payload = fromChain.insert.mock.calls[0][0];
    expect(payload.payment_method).toBe('cash');
    expect(payload.total).toBe(90);
  });

  it('по умолчанию cash', async () => {
    fromChain.insert.mockReturnValue(fromChain);
    fromChain.select.mockReturnValue(fromChain);
    fromChain.single.mockResolvedValue({ data: { id: 'o1' }, error: null });

    await createOrder('b1', { items: [] });
    expect(fromChain.insert.mock.calls[0][0].payment_method).toBe('cash');
  });
});
