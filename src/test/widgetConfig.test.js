import { describe, it, expect, vi } from 'vitest';
import { readWidgetConfig, findAnchors } from '../lib/widgetConfig';

const scriptWith = (attrs) => {
  const el = document.createElement('script');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
};

describe('readWidgetConfig', () => {
  it('читает data-business, lang и map из script-тега', () => {
    const el = scriptWith({
      'data-business': '3c565078-140c-4d95-b9d3-bf478a108404',
      'data-lang': 'tg',
      'data-map': 'off',
    });
    const cfg = readWidgetConfig(el);
    expect(cfg.businessId).toBe('3c565078-140c-4d95-b9d3-bf478a108404');
    expect(cfg.lang).toBe('tg');
    expect(cfg.mapEnabled).toBe(false);
    expect(cfg.supabaseUrl).toBeTruthy();
    expect(cfg.anonKey).toBeTruthy();
    el.remove();
  });

  it('дефолты: lang=ru, map включена', () => {
    const el = scriptWith({ 'data-business': '3c565078-140c-4d95-b9d3-bf478a108404' });
    const cfg = readWidgetConfig(el);
    expect(cfg.lang).toBe('ru');
    expect(cfg.mapEnabled).toBe(true);
    el.remove();
  });

  it('нет data-business → null и предупреждение', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = scriptWith({ 'data-lang': 'ru' });
    expect(readWidgetConfig(el)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    el.remove();
  });

  it('невалидный UUID → null', () => {
    const el = scriptWith({ 'data-business': '<img onerror=alert(1)>' });
    expect(readWidgetConfig(el)).toBeNull();
    el.remove();
  });

  it('null вместо script-тега → null без падения', () => {
    expect(readWidgetConfig(null)).toBeNull();
  });
});

describe('findAnchors', () => {
  it('находит якоря по data-karta', () => {
    document.body.innerHTML = `
      <div data-karta="catalog" id="a1"></div>
      <div data-karta="cart" id="a2"></div>
      <div data-karta="checkout" id="a3"></div>`;
    const anchors = findAnchors(document);
    expect(anchors.catalog?.id).toBe('a1');
    expect(anchors.cart?.id).toBe('a2');
    expect(anchors.checkout?.id).toBe('a3');
  });

  it('неизвестный data-karta игнорируется', () => {
    document.body.innerHTML = `<div data-karta="weather" id="x"></div><div data-karta="catalog" id="c"></div>`;
    const anchors = findAnchors(document);
    expect(anchors.catalog?.id).toBe('c');
    expect(Object.keys(anchors).sort()).toEqual(['cart', 'catalog', 'checkout']);
  });

  it('нет якорей → все null', () => {
    document.body.innerHTML = `<p>просто страница</p>`;
    const anchors = findAnchors(document);
    expect(anchors.catalog).toBeNull();
    expect(anchors.cart).toBeNull();
    expect(anchors.checkout).toBeNull();
  });
});
