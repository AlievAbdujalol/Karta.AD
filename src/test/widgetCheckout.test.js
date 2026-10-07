import { describe, it, expect } from 'vitest';
import { validateCheckout, buildStoreOrderArgs } from '../lib/widgetCheckout';

const items = [{ id: 'p1', name: 'Пицца', price: 45 }];
const cart = { p1: 2 };
const baseForm = {
  name: 'Али',
  phone: '+992 90 000 00 00',
  deliveryType: 'delivery',
  address: 'пр. Рудаки 1',
  paymentMethod: 'cash',
};

describe('validateCheckout', () => {
  it('корректная форма → ok', () => {
    const res = validateCheckout(baseForm, cart);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('пустая корзина → ошибка', () => {
    const res = validateCheckout(baseForm, {});
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toContain('корзин');
  });

  it('нет имени → ошибка', () => {
    const res = validateCheckout({ ...baseForm, name: '  ' }, cart);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toContain('Имя');
  });

  it('некорректный телефон → ошибка', () => {
    for (const phone of ['', 'abc', '12', '+992 СИМКАРТА']) {
      const res = validateCheckout({ ...baseForm, phone }, cart);
      expect(res.ok).toBe(false);
    }
  });

  it('для доставки обязателен адрес, для самовывоза — нет', () => {
    expect(validateCheckout({ ...baseForm, address: '' }, cart).ok).toBe(false);
    expect(validateCheckout({ ...baseForm, address: '', deliveryType: 'pickup' }, cart).ok).toBe(true);
  });

  it('все ошибки собираются сразу', () => {
    const res = validateCheckout({ name: '', phone: 'x', deliveryType: 'delivery', address: '' }, {});
    expect(res.errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe('buildStoreOrderArgs (RPC create_store_order)', () => {
  it('собирает аргументы с координатами и списком позиций', () => {
    const args = buildStoreOrderArgs({
      businessId: 'b1',
      form: { ...baseForm, lat: 38.56, lng: 68.78 },
      cart,
      items,
    });
    expect(args).toEqual({
      p_business_id: 'b1',
      p_items: [{ product_id: 'p1', quantity: 2 }],
      p_customer: { name: 'Али', phone: '+992 90 000 00 00', notes: '' },
      p_delivery: { type: 'delivery', address: 'пр. Рудаки 1', lat: 38.56, lng: 68.78 },
      p_payment_method: 'cash',
    });
  });

  it('цены, total и status не передаются — их считает сервер', () => {
    const args = buildStoreOrderArgs({ businessId: 'b1', form: baseForm, cart, items });
    const flat = JSON.stringify(args);
    expect(flat).not.toContain('total');
    expect(flat).not.toContain('price');
    expect(flat).not.toContain('status');
    expect(flat).not.toContain('product_name');
  });

  it('без координат — null, а не undefined (не ломает числовой cast)', () => {
    const args = buildStoreOrderArgs({ businessId: 'b1', form: baseForm, cart, items });
    expect(args.p_delivery.lat).toBeNull();
    expect(args.p_delivery.lng).toBeNull();
  });

  it('самовывоз без адреса — тип pickup, адрес и координаты пустые', () => {
    const args = buildStoreOrderArgs({
      businessId: 'b1',
      form: { ...baseForm, deliveryType: 'pickup', address: '', lat: '', lng: '' },
      cart,
      items,
    });
    expect(args.p_delivery.type).toBe('pickup');
    expect(args.p_delivery.address).toBe('');
    expect(args.p_delivery.lat).toBeNull();
  });

  it('карта: пока шлюза нет, для покупателя всегда cash', () => {
    const args = buildStoreOrderArgs({
      businessId: 'b1',
      form: { ...baseForm, paymentMethod: 'card' },
      cart,
      items,
    });
    expect(args.p_payment_method).toBe('cash');
  });

  it('с включённым шлюзом карта проходит (шов под будущий gateway)', () => {
    const args = buildStoreOrderArgs({
      businessId: 'b1',
      form: { ...baseForm, paymentMethod: 'card' },
      cart,
      items,
      gatewayEnabled: true,
    });
    expect(args.p_payment_method).toBe('card');
  });

  it('товары не из каталога отфильтровываются, количество сохраняется', () => {
    const args = buildStoreOrderArgs({
      businessId: 'b1',
      form: baseForm,
      cart: { p1: 3, ghost: 5 },
      items,
    });
    expect(args.p_items).toEqual([{ product_id: 'p1', quantity: 3 }]);
  });

  it('мусор в количестве приводится к числу (сервер валидирует 1–99)', () => {
    const args = buildStoreOrderArgs({
      businessId: 'b1', form: baseForm, cart: { p1: '7' }, items,
    });
    expect(args.p_items[0].quantity).toBe(7);
  });
});
