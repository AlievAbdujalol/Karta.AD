import { describe, it, expect, vi } from 'vitest';

vi.mock('@/api/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import {
  isDeliveryOrderVisible,
  DELIVERY_VISIBLE_STATUSES,
  DELIVERY_ACTIVE_STATUSES,
} from '../lib/business';

// Регресс «Почему нет заказов?»: белый список из 4 статусов прятал заказы
// в confirmed/preparing, а таб «Доставлен» не совпадал ни с одним заказом.
describe('экран «Доставка» — фильтр заказов', () => {
  it('вкладки экрана всегда совпадают с видимыми статусами', () => {
    // табы UI: Создан(pending) · Готов(ready) · Забран(picked_up) · В пути(in_transit) · Доставлен(delivered)
    for (const s of ['pending', 'ready', 'picked_up', 'in_transit', 'delivered']) {
      expect(DELIVERY_VISIBLE_STATUSES).toContain(s);
    }
  });

  it('заказы в промежуточных статусах не исчезают с экрана', () => {
    const order = (status) => ({ status, delivery_type: 'delivery', delivery_address: 'пр. Рудаки' });
    for (const s of ['confirmed', 'payment_pending', 'paid', 'preparing']) {
      expect(isDeliveryOrderVisible(order(s))).toBe(true);
    }
  });

  it('завершённый заказ виден в списке, отменённый — нет', () => {
    expect(isDeliveryOrderVisible({ status: 'delivered', delivery_type: 'delivery' })).toBe(true);
    expect(isDeliveryOrderVisible({ status: 'completed', delivery_type: 'delivery' })).toBe(true);
    expect(isDeliveryOrderVisible({ status: 'cancelled', delivery_type: 'delivery' })).toBe(false);
    expect(isDeliveryOrderVisible({ status: 'refunded', delivery_type: 'delivery' })).toBe(false);
  });

  it('самовывоз не показывается; без delivery_type адрес означает доставку', () => {
    expect(isDeliveryOrderVisible({ status: 'pending', delivery_type: 'pickup' })).toBe(false);
    expect(isDeliveryOrderVisible({ status: 'pending', delivery_type: null, delivery_address: 'адрес' })).toBe(true);
    expect(isDeliveryOrderVisible({ status: 'pending', delivery_type: null, delivery_address: null })).toBe(false);
    expect(isDeliveryOrderVisible(null)).toBe(false);
  });

  it('счётчик «активных» не считает завершённые; активные ⊂ видимые', () => {
    expect(DELIVERY_ACTIVE_STATUSES).toContain('confirmed');
    expect(DELIVERY_ACTIVE_STATUSES).toContain('preparing');
    expect(DELIVERY_ACTIVE_STATUSES).toContain('in_transit');
    expect(DELIVERY_ACTIVE_STATUSES).not.toContain('delivered');
    expect(DELIVERY_ACTIVE_STATUSES).not.toContain('completed');
    expect(DELIVERY_ACTIVE_STATUSES).not.toContain('cancelled');
    for (const s of DELIVERY_ACTIVE_STATUSES) expect(DELIVERY_VISIBLE_STATUSES).toContain(s);
  });
});
