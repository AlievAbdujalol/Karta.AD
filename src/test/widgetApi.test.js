import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBusiness, createOrder, restHeaders } from '../lib/widgetApi';

const cfg = {
  supabaseUrl: 'https://proj.supabase.co',
  anonKey: 'sb_publishable_test',
  businessId: 'b1',
};

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock;
});

describe('restHeaders', () => {
  it('несёт anon-ключ и return=representation', () => {
    const h = restHeaders('key-1');
    expect(h.apikey).toBe('key-1');
    expect(h.Authorization).toBe('Bearer key-1');
    expect(h.Prefer).toBe('return=representation');
  });
});

describe('fetchBusiness', () => {
  it('вызывает RPC get_public_business', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'Магазин', products: [] }),
    });
    const biz = await fetchBusiness(cfg);
    expect(biz.name).toBe('Магазин');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co/rest/v1/rpc/get_public_business');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ p_business_id: 'b1' });
    expect(opts.headers.apikey).toBe('sb_publishable_test');
  });

  it('запрос к неактивному бизнесу (null) → null, без исключения', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => null });
    await expect(fetchBusiness(cfg)).resolves.toBeNull();
  });

  it('http-ошибка → исключение с текстом', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => 'not found' });
    await expect(fetchBusiness(cfg)).rejects.toThrow(/404/);
  });

  it('сетевая ошибка → исключение', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(fetchBusiness(cfg)).rejects.toThrow('offline');
  });
});

describe('createOrder', () => {
  const payload = {
    order: {
      business_id: 'b1', customer_name: 'Али', customer_phone: '+992900000000',
      delivery_type: 'delivery', delivery_address: 'адрес', delivery_lat: 38.5,
      delivery_lng: 68.7, payment_method: 'cash', total: 90, status: 'pending',
    },
    rows: [{ product_id: 'p1', product_name: 'Пицца', quantity: 2, price: 45, total: 90 }],
  };

  it('создаёт заказ, затем позиции', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'ord-1' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    const order = await createOrder(cfg, payload);
    expect(order.id).toBe('ord-1');

    const [u1, o1] = fetchMock.mock.calls[0];
    expect(u1).toBe('https://proj.supabase.co/rest/v1/orders');
    expect(JSON.parse(o1.body)).toMatchObject({ business_id: 'b1', delivery_lat: 38.5 });

    const [u2, o2] = fetchMock.mock.calls[1];
    expect(u2).toBe('https://proj.supabase.co/rest/v1/order_items');
    expect(JSON.parse(o2.body)).toEqual([{
      order_id: 'ord-1', product_id: 'p1', product_name: 'Пицца',
      quantity: 2, price: 45, total: 90,
    }]);
  });

  it('пустые строки → только заказ, без второго запроса', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'ord-2' }] });
    await createOrder(cfg, { ...payload, rows: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ошибка создания заказа → исключение', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' });
    await expect(createOrder(cfg, payload)).rejects.toThrow(/403/);
  });

  it('заказ создан, но позиции упали → исключение (не тихий половинчатый заказ)', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'ord-3' }] })
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'bad' });
    await expect(createOrder(cfg, payload)).rejects.toThrow(/400/);
  });
});
