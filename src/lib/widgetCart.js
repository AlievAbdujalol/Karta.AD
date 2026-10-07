/**
 * widgetCart — чистая логика корзины виджета.
 * cart: { [productId]: qty }. Мутиров нельзя — только новые объекты.
 */

const MAX_QTY = 99;

const round2 = (x) => Math.round(Number(x) * 100) / 100;

export function addToCart(cart, id, qty = 1) {
  const next = { ...cart };
  next[id] = Math.min(MAX_QTY, (next[id] || 0) + Math.max(1, Number(qty) || 1));
  return next;
}

export function setQty(cart, id, qty) {
  const next = { ...cart };
  const q = Number(qty);
  if (!q || q <= 0) delete next[id];
  else next[id] = Math.min(MAX_QTY, q);
  return next;
}

export function cartCount(cart) {
  return Object.values(cart || {}).reduce((s, q) => s + Number(q || 0), 0);
}

export function toOrderRows(cart, items = []) {
  return Object.entries(cart || {}).map(([id, quantity]) => {
    const p = items.find((x) => x.id === id);
    const price = round2(p ? Number(p.price || 0) : 0);
    return {
      product_id: p ? p.id : null,
      product_name: p ? p.name : id,
      quantity: Number(quantity) || 1,
      price,
      total: round2(price * (Number(quantity) || 1)),
    };
  });
}

export function cartTotal(cart, items = []) {
  return toOrderRows(cart, items).reduce((s, r) => s + r.total, 0);
}
