import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/api/supabase', () => ({ supabase: { rpc: (...a) => rpc(...a) } }));

import {
  DELIVERY_PROVIDER_REGISTRY, getDeliveryProvider, calcDeliveryPrice,
  haversineKm, KartaOrderDeliveryProvider,
} from '../lib/deliveryProviders';

beforeEach(() => rpc.mockReset());

describe('реестр курьерских провайдеров', () => {
  it('karta доступен, внешние — нет (интерфейс готов к подключению)', () => {
    expect(DELIVERY_PROVIDER_REGISTRY.map((p) => p.id)).toEqual(['karta', 'yandex', 'glovo']);
    expect(getDeliveryProvider('karta').available).toBe(true);
    expect(getDeliveryProvider('yandex')).toBeNull(); // пока не реализован
    expect(getDeliveryProvider('unknown')).toBeNull();
  });
});

describe('calcDeliveryPrice (зеркало серверных правил)', () => {
  it('доставка выключена → 0', () => {
    expect(calcDeliveryPrice({ enabled: false, price: 15 }, 200)).toBe(0);
  });

  it('режим free → 0', () => {
    expect(calcDeliveryPrice({ enabled: true, mode: 'free' }, 100)).toBe(0);
  });

  it('фиксированная цена → она же', () => {
    expect(calcDeliveryPrice({ enabled: true, mode: 'fixed', price: 15 }, 100)).toBe(15);
    expect(calcDeliveryPrice({ enabled: true, mode: 'fixed', price: 0 }, 100)).toBe(0);
    expect(calcDeliveryPrice({ enabled: true, mode: 'fixed' }, 100)).toBe(0);
  });

  it('free_from: сумма от порога → бесплатно', () => {
    const s = { enabled: true, mode: 'fixed', price: 15, free_from: 300 };
    expect(calcDeliveryPrice(s, 299)).toBe(15);
    expect(calcDeliveryPrice(s, 300)).toBe(0);
    expect(calcDeliveryPrice(s, 1000)).toBe(0);
  });

  it('режим distance без координат → 0 (считает транспорт)', () => {
    expect(calcDeliveryPrice({ enabled: true, mode: 'distance' }, 100)).toBe(0);
  });

  it('битые настройки не роняют расчёт', () => {
    expect(calcDeliveryPrice(null, 100)).toBe(0);
    expect(calcDeliveryPrice({}, 100)).toBe(0);
    expect(calcDeliveryPrice({ mode: 'fixed', price: 'abc' }, 100)).toBe(0);
  });
});

describe('haversineKm', () => {
  it('нулевое расстояние для одной точки', () => {
    expect(haversineKm({ lat: 38.56, lng: 68.78 }, { lat: 38.56, lng: 68.78 })).toBeCloseTo(0, 5);
  });

  it('Душанбе → Худжанд ≈ 200–230 км', () => {
    const km = haversineKm({ lat: 38.56, lng: 68.78 }, { lat: 40.28, lng: 69.63 });
    expect(km).toBeGreaterThan(190);
    expect(km).toBeLessThan(240);
  });
});

describe('KartaOrderDeliveryProvider', () => {
  it('calculatePrice: fixed → локальный расчёт', async () => {
    const res = await KartaOrderDeliveryProvider.calculatePrice({
      settings: { enabled: true, mode: 'fixed', price: 20 }, subtotal: 500,
    });
    expect(res).toEqual({ price: 20, currency: 'TJS' });
  });

  it('calculatePrice: distance + координаты → серверный calculate_delivery_price', async () => {
    rpc.mockResolvedValue({ data: 35.5, error: null });
    const res = await KartaOrderDeliveryProvider.calculatePrice({
      settings: { mode: 'distance' },
      pickup: { lat: 38.56, lng: 68.78 },
      dropoff: { lat: 38.6, lng: 68.8 },
    });
    expect(rpc).toHaveBeenCalledWith('calculate_delivery_price', {
      p_pickup_lat: 38.56, p_pickup_lng: 68.78,
      p_dropoff_lat: 38.6, p_dropoff_lng: 68.8,
      p_weight_kg: 0,
    });
    expect(res).toEqual({ price: 35.5, currency: 'TJS' });
  });

  it('calculatePrice: ошибка RPC пробрасывается', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(KartaOrderDeliveryProvider.calculatePrice({
      settings: { mode: 'distance' },
      pickup: { lat: 1, lng: 1 }, dropoff: { lat: 2, lng: 2 },
    })).rejects.toThrow('calculate_delivery_price');
  });

  it('createDelivery: заявка = заказ (без новых таблиц)', async () => {
    expect(await KartaOrderDeliveryProvider.createDelivery({ orderId: 'ord-1' }))
      .toEqual({ deliveryId: 'ord-1', status: 'pending', provider: 'karta' });
    await expect(KartaOrderDeliveryProvider.createDelivery({})).rejects.toThrow('orderId');
  });

  it('getStatus/cancelDelivery отсылают к конвейеру заказа', async () => {
    await expect(KartaOrderDeliveryProvider.getStatus('x')).rejects.toThrow('orders.status');
    await expect(KartaOrderDeliveryProvider.cancelDelivery('x')).rejects.toThrow('set_order_status');
  });
});
