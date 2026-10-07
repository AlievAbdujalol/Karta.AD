import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBusiness, createStoreOrder, restHeaders } from '../lib/widgetApi';

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

describe('createStoreOrder (RPC create_store_order)', () => {
  const args = {
    p_business_id: 'b1',
    p_items: [{ product_id: 'p1', quantity: 2 }],
    p_customer: { name: 'Али', phone: '+992900000000', notes: '' },
    p_delivery: { type: 'delivery', address: 'адрес', lat: 38.5, lng: 68.7 },
    p_payment_method: 'cash',
  };

  it('одним запросом создаёт заказ на сервере (цены считает сервер)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ order_id: 'ord-1', total: 90, delivery_cost: 0 }),
    });

    const res = await createStoreOrder(cfg, args);
    expect(res).toEqual({ order_id: 'ord-1', total: 90, delivery_cost: 0 });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co/rest/v1/rpc/create_store_order');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual(args);
    expect(opts.headers.apikey).toBe('sb_publishable_test');
    // ответ сервера, а не репрезентация строки
    expect(opts.headers.Prefer).toBeUndefined();
    // клиент не отправляет цен и total
    expect(opts.body).not.toContain('total');
    expect(opts.body).not.toContain('price');
  });

  it('серверный код ошибки → понятное русское сообщение', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ code: 'P0001', message: 'out_of_stock' }),
    });
    await expect(createStoreOrder(cfg, args)).rejects.toThrow('Товар закончился');
  });

  it('неизвестная ошибка → общее сообщение + статус (без утечки SQL)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ message: 'permission denied for table orders' }),
    });
    await expect(createStoreOrder(cfg, args))
      .rejects.toThrow('Не удалось создать заказ. Попробуйте ещё раз (HTTP 403)');
  });

  it('сетевая ошибка → исключение с именем функции', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(createStoreOrder(cfg, args)).rejects.toThrow('create_store_order: offline');
  });
});
