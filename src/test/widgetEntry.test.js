import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWidget } from '@/widget/app';

const BIZ = {
  id: '3c565078-140c-4d95-b9d3-bf478a108404',
  name: 'Магазин-AD',
  phone: '926064200',
  city: 'Худжанд',
  address: 'пр. Рудаки 1',
  products: [
    { id: 'p1', name: 'Пицца', price: 45, image_url: null },
    { id: 'p2', name: '<img src=x onerror="window.__xss=1">', price: 10, image_url: null },
  ],
};

const makeApi = (overrides = {}) => ({
  fetchBusiness: vi.fn(async () => ({ ...BIZ })),
  createStoreOrder: vi.fn(async () => ({ order_id: 'ord-1', total: 90, delivery_cost: 0 })),
  reverseGeocode: vi.fn(async () => null),
  ...overrides,
});

const cfg = { businessId: BIZ.id, supabaseUrl: 'https://x.supabase.co', anonKey: 'k', lang: 'ru', mapEnabled: false };

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.__xss;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createWidget: плавающий режим (без якорей)', () => {
  it('создаёт кнопку и загружает каталог', async () => {
    const api = makeApi();
    const w = createWidget({ doc: document, cfg, api });
    await w.ready;
    expect(api.fetchBusiness).toHaveBeenCalledTimes(1);
    const host = document.getElementById('karta-widget-root');
    expect(host).toBeTruthy();
    const text = host.shadowRoot.textContent;
    expect(text).toContain('Магазин-AD');
    expect(text).toContain('Пицца');
  });

  it('данные с сервера рендерятся текстом — XSS не исполняется', async () => {
    const api = makeApi();
    const w = createWidget({ doc: document, cfg, api });
    await w.ready;
    const host = document.getElementById('karta-widget-root');
    expect(host.shadowRoot.querySelector('img')).toBeNull();
    expect(host.shadowRoot.textContent).toContain('<img src=x');
    expect(window.__xss).toBeUndefined();
  });

  it('ошибка загрузки показывается в виджете, а не роняет страницу', async () => {
    const api = makeApi({ fetchBusiness: vi.fn(async () => { throw new Error('net'); }) });
    const w = createWidget({ doc: document, cfg, api });
    await w.ready;
    const host = document.getElementById('karta-widget-root');
    expect(host.shadowRoot.textContent).toContain('Не удалось загрузить');
  });
});

describe('createWidget: якорный режим', () => {
  it('каталог уходит в [data-karta=catalog], корзина — в [data-karta=cart]', async () => {
    document.body.innerHTML = '<div data-karta="catalog"></div><div data-karta="cart"></div>';
    const api = makeApi();
    const w = createWidget({ doc: document, cfg, api });
    await w.ready;
    const catalog = document.querySelector('[data-karta="catalog"]');
    const cart = document.querySelector('[data-karta="cart"]');
    expect(catalog.shadowRoot.textContent).toContain('Пицца');
    expect(cart.shadowRoot).toBeTruthy();
    expect(document.getElementById('karta-widget-root')).toBeNull(); // плавающая кнопка не нужна
  });

  it('добавление в корзину обновляет счётчик', async () => {
    document.body.innerHTML = '<div data-karta="catalog"></div><div data-karta="cart"></div>';
    const api = makeApi();
    const w = createWidget({ doc: document, cfg, api });
    await w.ready;
    const catalog = document.querySelector('[data-karta="catalog"]');
    const plus = catalog.shadowRoot.querySelector('[data-action="add"]');
    expect(plus).toBeTruthy();
    plus.click();
    const cart = document.querySelector('[data-karta="cart"]');
    expect(cart.shadowRoot.textContent).toMatch(/[1-9]/);
  });
});

describe('createWidget: защита', () => {
  it('без конфига ничего не монтируется', () => {
    createWidget({ doc: document, cfg: null, api: makeApi() });
    expect(document.getElementById('karta-widget-root')).toBeNull();
  });

  it('повторный запуск не создаёт второй виджет', async () => {
    const api = makeApi();
    createWidget({ doc: document, cfg, api });
    createWidget({ doc: document, cfg, api });
    expect(document.querySelectorAll('#karta-widget-root')).toHaveLength(1);
  });
});
