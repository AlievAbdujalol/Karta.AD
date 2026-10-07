import { describe, it, expect } from 'vitest';
import {
  ADMIN_FLOW,
  ADMIN_STATUS_LABEL,
  adminNextStatuses,
  adminStatusLabel,
  ORDER_FLOW,
} from '../lib/business';

describe('админ-конвейер заказов (4 статуса)', () => {
  it('новый заказ: подтвердить или отменить', () => {
    expect(adminNextStatuses('pending')).toEqual(['confirmed', 'cancelled']);
  });

  it('подтверждённый: в доставку или отменить', () => {
    expect(adminNextStatuses('confirmed')).toContain('in_transit');
    expect(adminNextStatuses('confirmed')).toContain('cancelled');
  });

  it('в доставке: доставлен или отменить', () => {
    expect(adminNextStatuses('in_transit')).toEqual(['delivered', 'cancelled']);
  });

  it('терминальные статусы не имеют переходов', () => {
    expect(adminNextStatuses('delivered')).toEqual([]);
    expect(adminNextStatuses('cancelled')).toEqual([]);
    expect(adminNextStatuses('completed')).toEqual([]);
  });

  it('неизвестный статус не ломает UI', () => {
    expect(adminNextStatuses('something_else')).toEqual([]);
  });

  it('полный путь pending → confirmed → in_transit → delivered проходит по цепочке', () => {
    let status = 'pending';
    const path = ['confirmed', 'in_transit', 'delivered'];
    for (const next of path) {
      expect(adminNextStatuses(status)).toContain(next);
      status = next;
    }
    expect(adminNextStatuses(status)).toEqual([]);
  });

  it('все переходы конвейера есть в зеркале ORDER_FLOW (RPC не отклонит)', () => {
    for (const [from, tos] of Object.entries(ADMIN_FLOW)) {
      for (const to of tos) {
        expect(ORDER_FLOW_contains(from, to)).toBe(true);
      }
    }
  });

  it('labels покрывают каждый статус конвейера', () => {
    for (const status of Object.keys(ADMIN_FLOW)) {
      expect(adminStatusLabel(status)).toBeTruthy();
    }
    expect(ADMIN_STATUS_LABEL.pending).toBe('Новый');
  });

  it('конвейер не выходит за пределы известных статусов CHECK-ограничения', () => {
    const CHECKED = new Set([
      'pending', 'confirmed', 'payment_pending', 'paid', 'preparing', 'ready',
      'delivery_created', 'courier_assigned', 'picked_up', 'in_transit',
      'delivered', 'completed', 'cancelled', 'refunded',
    ]);
    for (const status of Object.keys(ADMIN_FLOW)) expect(CHECKED.has(status)).toBe(true);
    for (const tos of Object.values(ADMIN_FLOW)) {
      for (const to of tos) expect(CHECKED.has(to)).toBe(true);
    }
  });
});

function ORDER_FLOW_contains(from, to) {
  return (ORDER_FLOW[from] || []).includes(to);
}
