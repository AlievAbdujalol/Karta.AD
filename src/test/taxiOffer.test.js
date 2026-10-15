import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendOfferToDriver, releaseOffer, withdrawOffer } from '@/lib/taxiOffer';

const db = vi.hoisted(() => {
  const state = {
    orderCalls: [],
    orderResult: { data: null, error: null },
    notifPayloads: [],
    notifResult: { error: null },
    rpcCalls: [],
    rpcResult: { data: true, error: null },
    reset() {
      state.orderCalls = [];
      state.orderResult = { data: null, error: null };
      state.notifPayloads = [];
      state.notifResult = { error: null };
      state.rpcCalls = [];
      state.rpcResult = { data: true, error: null };
    },
  };
  return state;
});

vi.mock('@/api/supabase', () => ({
  supabase: {
    from(table) {
      if (table === 'taxi_orders') {
        const call = { payload: null, conds: [] };
        db.orderCalls.push(call);
        const q = {
          update: (payload) => { call.payload = payload; return q; },
          eq: (col, val) => { call.conds.push({ col, val }); return q; },
          select: () => q,
          maybeSingle: async () => db.orderResult,
        };
        return q;
      }
      if (table === 'notifications') {
        return {
          insert: (payload) => {
            db.notifPayloads.push(payload);
            return Promise.resolve(db.notifResult);
          },
        };
      }
      throw new Error(`неожиданная таблица: ${table}`);
    },
    rpc: async (name, args) => {
      db.rpcCalls.push({ name, args });
      return db.rpcResult;
    },
  },
}));

beforeEach(() => db.reset());

describe('sendOfferToDriver: направленное предложение заказа', () => {
  it('назначает driver_id и кладёт водителю уведомление (push)', async () => {
    db.orderResult = { data: { id: 'o1' }, error: null };
    const res = await sendOfferToDriver({
      orderId: 'o1', driverId: 'd1', price: 50, pickup: 'Рудаки 1', dropoff: 'Сомони 2',
    });

    expect(res).toEqual({ ok: true, notified: true });

    const call = db.orderCalls[0];
    expect(call.payload).toEqual({ driver_id: 'd1' });
    expect(call.conds).toEqual(expect.arrayContaining([
      { col: 'id', val: 'o1' },
      { col: 'status', val: 'searching' },
    ]));

    expect(db.notifPayloads).toHaveLength(1);
    const n = db.notifPayloads[0];
    expect(n.user_id).toBe('d1');
    expect(n.type).toBe('taxi_new_order');
    expect(n.title).toContain('50');
    expect(n.body).toBe('Рудаки 1 → Сомони 2');
    expect(n.data).toMatchObject({ order_id: 'o1', url: '/taxi/driver' });
  });

  it('без цели — ни одного запроса к БД', async () => {
    const res = await sendOfferToDriver({ orderId: null, driverId: 'd1' });
    expect(res).toEqual({ ok: false, error: 'no_target' });
    expect(db.orderCalls).toHaveLength(0);
    expect(db.notifPayloads).toHaveLength(0);
  });

  it('заказ уже принят (не searching) — ложное уведомление не отправляется', async () => {
    db.orderResult = { data: null, error: null };
    const res = await sendOfferToDriver({ orderId: 'o1', driverId: 'd1', price: 50 });
    expect(res).toEqual({ ok: false, error: 'not_searching' });
    expect(db.notifPayloads).toHaveLength(0);
  });

  it('ошибка обновления заказа возвращается вызывающему', async () => {
    db.orderResult = { data: null, error: { message: 'boom' } };
    const res = await sendOfferToDriver({ orderId: 'o1', driverId: 'd1' });
    expect(res).toEqual({ ok: false, error: 'boom' });
    expect(db.notifPayloads).toHaveLength(0);
  });

  it('уведомление не вставилось — предложение всё равно отправлено', async () => {
    db.orderResult = { data: { id: 'o1' }, error: null };
    db.notifResult = { error: { message: 'rls' } };
    const res = await sendOfferToDriver({ orderId: 'o1', driverId: 'd1' });
    expect(res).toEqual({ ok: true, notified: false });
  });
});

describe('releaseOffer: водитель отклонил предложение', () => {
  it('вызывает SECURITY DEFINER RPC taxi_release_offer', async () => {
    db.rpcResult = { data: true, error: null };
    const res = await releaseOffer('o1');
    expect(res).toEqual({ ok: true });
    expect(db.rpcCalls).toEqual([{ name: 'taxi_release_offer', args: { p_order_id: 'o1' } }]);
  });

  it('RPC вернул false — заказ не освобождён', async () => {
    db.rpcResult = { data: false, error: null };
    const res = await releaseOffer('o1');
    expect(res).toEqual({ ok: false });
  });

  it('ошибка RPC возвращается без исключения', async () => {
    db.rpcResult = { data: null, error: { message: 'missing function' } };
    const res = await releaseOffer('o1');
    expect(res).toEqual({ ok: false, error: 'missing function' });
  });

  it('без orderId — RPC не вызывается', async () => {
    const res = await releaseOffer(null);
    expect(res).toEqual({ ok: false, error: 'no_order' });
    expect(db.rpcCalls).toHaveLength(0);
  });
});

describe('withdrawOffer: пассажир снимает своё предложение', () => {
  it('обнуляет driver_id только у своего searching-заказа', async () => {
    db.orderResult = { data: { id: 'o1' }, error: null };
    const res = await withdrawOffer({ orderId: 'o1', driverId: 'd1' });
    expect(res).toEqual({ ok: true, error: null });

    const call = db.orderCalls[0];
    expect(call.payload).toEqual({ driver_id: null });
    expect(call.conds).toEqual(expect.arrayContaining([
      { col: 'id', val: 'o1' },
      { col: 'driver_id', val: 'd1' },
      { col: 'status', val: 'searching' },
    ]));
  });

  it('строка не найдена — сообщаем об этом', async () => {
    db.orderResult = { data: null, error: null };
    const res = await withdrawOffer({ orderId: 'o1', driverId: 'd1' });
    expect(res).toEqual({ ok: false, error: 'not_found' });
  });
});
