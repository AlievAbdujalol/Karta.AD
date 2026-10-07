import { describe, it, expect } from 'vitest';
import { validateCheckout, buildOrderPayload } from '../lib/widgetCheckout';

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

describe('buildOrderPayload', () => {
  it('собирает заказ с координатами и строками товаров', () => {
    const { order, rows } = buildOrderPayload({
      businessId: 'b1',
      form: { ...baseForm, lat: 38.56, lng: 68.78 },
      cart,
      items,
    });
    expect(order).toMatchObject({
      business_id: 'b1',
      customer_name: 'Али',
      customer_phone: '+992 90 000 00 00',
      delivery_type: 'delivery',
      delivery_address: 'пр. Рудаки 1',
      delivery_lat: 38.56,
      delivery_lng: 68.78,
      payment_method: 'cash',
      status: 'pending',
      total: 90,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].product_id).toBe('p1');
  });

  it('без координат — null, а не undefined (колонка numeric)', () => {
    const { order } = buildOrderPayload({ businessId: 'b1', form: baseForm, cart, items });
    expect(order.delivery_lat).toBeNull();
    expect(order.delivery_lng).toBeNull();
  });

  it('самовывоз без адреса — адрес и координаты null', () => {
    const { order } = buildOrderPayload({
      businessId: 'b1',
      form: { ...baseForm, deliveryType: 'pickup', address: '', lat: '', lng: '' },
      cart,
      items,
    });
    expect(order.delivery_type).toBe('pickup');
    expect(order.delivery_address).toBeNull();
    expect(order.delivery_lat).toBeNull();
  });

  it('карта: пока шлюза нет, для покупателя всегда cash', () => {
    const { order } = buildOrderPayload({
      businessId: 'b1',
      form: { ...baseForm, paymentMethod: 'card' },
      cart,
      items,
    });
    expect(order.payment_method).toBe('cash');
  });

  it('с включённым шлюзом карта проходит (шов под будущий gateway)', () => {
    const { order } = buildOrderPayload({
      businessId: 'b1',
      form: { ...baseForm, paymentMethod: 'card' },
      cart,
      items,
      gatewayEnabled: true,
    });
    expect(order.payment_method).toBe('card');
  });

  it('итог согласован со стоимостью строк (цена округляется до 2 знаков)', () => {
    const { order, rows } = buildOrderPayload({
      businessId: 'b1',
      form: baseForm,
      cart: { p1: 3 },
      items: [{ id: 'p1', name: 'Пицца', price: 30.333 }],
    });
    expect(rows[0].price).toBe(30.33);
    expect(rows[0].total).toBe(90.99);
    expect(order.total).toBe(90.99);
  });
});
