import { describe, it, expect } from 'vitest';
import { addToCart, setQty, cartCount, cartTotal, toOrderRows } from '../lib/widgetCart';

const items = [
  { id: 'p1', name: 'Пицца', price: 45 },
  { id: 'p2', name: 'Бургер', price: 30.5 },
];

describe('addToCart', () => {
  it('добавляет позицию, не мутируя исходную корзину', () => {
    const cart = {};
    const next = addToCart(cart, 'p1');
    expect(next).toEqual({ p1: 1 });
    expect(cart).toEqual({});
  });

  it('накапливает количество', () => {
    expect(addToCart(addToCart({}, 'p1'), 'p1')).toEqual({ p1: 2 });
  });

  it('ограничение 99 штук на позицию', () => {
    expect(addToCart({ p1: 99 }, 'p1')).toEqual({ p1: 99 });
  });

  it('добавление с явным количеством', () => {
    expect(addToCart({}, 'p1', 5)).toEqual({ p1: 5 });
  });
});

describe('setQty', () => {
  it('устанавливает количество', () => {
    expect(setQty({ p1: 2 }, 'p1', 7)).toEqual({ p1: 7 });
  });

  it('ноль и меньше удаляет позицию', () => {
    expect(setQty({ p1: 2, p2: 1 }, 'p1', 0)).toEqual({ p2: 1 });
    expect(setQty({ p1: 2 }, 'p1', -3)).toEqual({});
  });
});

describe('cartCount / cartTotal', () => {
  it('считает штуки и сумму с дробными ценами', () => {
    const cart = { p1: 2, p2: 3 };
    expect(cartCount(cart)).toBe(5);
    expect(cartTotal(cart, items)).toBeCloseTo(45 * 2 + 30.5 * 3, 6);
  });

  it('неизвестный товар игнорируется в сумме', () => {
    expect(cartTotal({ unknown: 5 }, items)).toBe(0);
    expect(cartCount({})).toBe(0);
  });
});

describe('toOrderRows', () => {
  it('строит строки заказа для order_items', () => {
    const rows = toOrderRows({ p1: 2, p2: 1 }, items);
    expect(rows).toEqual([
      { product_id: 'p1', product_name: 'Пицца', quantity: 2, price: 45, total: 90 },
      { product_id: 'p2', product_name: 'Бургер', quantity: 1, price: 30.5, total: 30.5 },
    ]);
  });

  it('пустая корзина → пустой массив', () => {
    expect(toOrderRows({}, items)).toEqual([]);
  });

  it('товара нет в каталоге → строка без product_id (ручной заказ)', () => {
    const rows = toOrderRows({ gone: 1 }, items);
    expect(rows).toEqual([
      { product_id: null, product_name: 'gone', quantity: 1, price: 0, total: 0 },
    ]);
  });
});
