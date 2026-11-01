/**
 * Смена статуса поездки такси — один из самых частых кликов водителя.
 *
 * Проблемы, которые здесь закрываются (прод-наблюдение):
 *   • 4 последовательных запроса = 1.5–2 с на клик (Violation «click handler
 *     took 1528ms»): независимые записи идут параллельно;
 *   • supabase-js НЕ бросает исключения — ошибка приходит в { error },
 *     поэтому try/catch в компоненте её не ловил и UI показывал «В поездке»,
 *     хотя в БД статус не изменился (пассажир не видел старта поездки).
 *     Теперь ошибка возвращается наружу, и вызывающий код откатывает UI.
 */
import { describe, it, expect, vi } from 'vitest';
import { applyRideStatus, RIDE_DRIVER_STATUS } from '@/lib/taxiRide';

/** Двойник supabase: пишет вызовы, отдаёт заранее заданные ошибки по таблице. */
function makeClient({ failOn = {} } = {}) {
  const calls = [];
  const client = {
    from(table) {
      const op = {
        table,
        update: vi.fn((patch) => {
          calls.push({ table, action: 'update', patch });
          const q = { eq: () => Promise.resolve({ error: failOn[`${table}:update`] || null }) };
          return q;
        }),
        insert: vi.fn((row) => {
          calls.push({ table, action: 'insert', row });
          return Promise.resolve({ error: failOn[`${table}:insert`] || null });
        }),
      };
      return op;
    },
  };
  return { client, calls };
}

describe('applyRideStatus', () => {
  it('пишет статус заказа и сопутствующие записи', async () => {
    const { client, calls } = makeClient();
    const res = await applyRideStatus(client, {
      orderId: 'o1',
      driverId: 'd1',
      status: 'riding',
      now: () => '2026-11-01T00:00:00.000Z',
    });

    expect(res).toEqual({ ok: true });
    const order = calls.find((c) => c.table === 'taxi_orders');
    expect(order.patch).toMatchObject({ status: 'riding', updated_at: '2026-11-01T00:00:00.000Z' });

    // событие рейса пишется всегда
    expect(calls.find((c) => c.table === 'taxi_ride_events').row).toEqual({
      order_id: 'o1',
      status: 'riding',
    });
    // водитель и его локация получают тот же статус
    expect(calls.find((c) => c.table === 'taxi_drivers').patch).toEqual({ status: 'riding' });
    expect(calls.find((c) => c.table === 'taxi_driver_locations').patch).toEqual({ status: 'riding' });
  });

  it('завершение поездки: completed_at и статус водителя free', async () => {
    const { client, calls } = makeClient();
    const res = await applyRideStatus(client, {
      orderId: 'o1',
      driverId: 'd1',
      status: 'completed',
      now: () => '2026-11-01T00:00:00.000Z',
    });

    expect(res).toEqual({ ok: true });
    expect(calls.find((c) => c.table === 'taxi_orders').patch).toMatchObject({
      status: 'completed',
      completed_at: '2026-11-01T00:00:00.000Z',
    });
    expect(calls.find((c) => c.table === 'taxi_drivers').patch).toEqual({ status: 'free' });
    expect(calls.find((c) => c.table === 'taxi_driver_locations').patch).toEqual({ status: 'free' });
  });

  it('ошибка обновления заказа НЕ теряется — возвращается наружу', async () => {
    const { client } = makeClient({
      failOn: { 'taxi_orders:update': { message: 'new row violates row-level security policy' } },
    });
    const res = await applyRideStatus(client, { orderId: 'o1', driverId: 'd1', status: 'riding' });

    expect(res.ok).toBe(false);
    expect(res.error).toBe('new row violates row-level security policy');
    expect(res.stage).toBe('order');
  });

  it('ошибка второстепенной записи тоже видна (не молчим)', async () => {
    const { client } = makeClient({ failOn: { 'taxi_ride_events:insert': { message: 'insert failed' } } });
    const res = await applyRideStatus(client, { orderId: 'o1', driverId: 'd1', status: 'arrived' });

    expect(res.ok).toBe(false);
    expect(res.error).toBe('insert failed');
    expect(res.stage).toBe('side');
  });

  it('неизвестный статус — отказ без запросов', async () => {
    const { client, calls } = makeClient();
    const res = await applyRideStatus(client, { orderId: 'o1', driverId: 'd1', status: 'teleport' });

    expect(res.ok).toBe(false);
    expect(res.stage).toBe('validate');
    expect(calls).toHaveLength(0);
  });

  it('маппинг статусов водителя', () => {
    expect(RIDE_DRIVER_STATUS).toEqual({ arrived: 'arrived', riding: 'riding', completed: 'free' });
  });
});
