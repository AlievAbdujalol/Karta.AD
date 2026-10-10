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

describe('createWidget: трекинг после заказа', () => {
  const TRACK = {
    found: true,
    order_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    public_id: 'a1b2c3d4',
    status: 'confirmed',
    delivery_type: 'delivery',
    total: 90,
    currency: 'TJS',
    pickup_address: 'пр. Рудаки 1',
    pickup_lat: 38.55,
    pickup_lng: 68.77,
    dropoff_address: 'ул. Ленина 5',
    dropoff_lat: 38.56,
    dropoff_lng: 68.78,
    distance_km: 2.4,
    eta_min: 17,
    items: [{ name: 'Пицца', qty: 2, price: 45 }],
    courier: null,
  };

  const fillInput = (root, field, value) => {
    const el = root.querySelector(`[data-field="${field}"]`);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const submitOrder = async (host) => {
    host.shadowRoot.querySelector('[data-action="add"]').click();
    host.shadowRoot.querySelector('[data-action="toform"]').click();
    fillInput(host.shadowRoot, 'name', 'Тест');
    fillInput(host.shadowRoot, 'phone', '+992900000000');
    fillInput(host.shadowRoot, 'address', 'ул. Ленина 5');
    host.shadowRoot.querySelector('[data-action="submit"]').click();
    await vi.waitFor(() => {
      expect(host.shadowRoot.textContent).toContain('Заказ принят');
    });
  };

  it('после заказа показывает живой статус, ETA и ссылку на карту', async () => {
    const api = makeApi({
      createStoreOrder: vi.fn(async () => ({ order_id: TRACK.order_id, total: 90, delivery_cost: 0 })),
      getStoreOrderTracking: vi.fn(async () => ({ ...TRACK })),
    });
    const w = createWidget({
      doc: document,
      cfg: { ...cfg, appOrigin: 'https://karta-ad.test' },
      api,
    });
    await w.ready;
    const host = document.getElementById('karta-widget-root');

    await submitOrder(host);

    expect(api.getStoreOrderTracking).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: cfg.businessId }),
      TRACK.order_id,
    );
    const text = host.shadowRoot.textContent;
    expect(text).toContain('Подтверждён'); // статус confirmed
    expect(text).toContain('17'); // ETA из серверных данных
    const link = host.shadowRoot.querySelector('a[href*="/track/"]');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe(`https://karta-ad.test/track/${TRACK.order_id}`);
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('ошибка трекинга не ломает экран успеха — заказ уже создан', async () => {
    const api = makeApi({
      createStoreOrder: vi.fn(async () => ({ order_id: TRACK.order_id, total: 90, delivery_cost: 0 })),
      getStoreOrderTracking: vi.fn(async () => { throw new Error('net'); }),
    });
    const w = createWidget({ doc: document, cfg, api });
    await w.ready;
    const host = document.getElementById('karta-widget-root');

    await submitOrder(host);

    const text = host.shadowRoot.textContent;
    expect(text).toContain('Заказ принят');
    expect(text).toContain('Не удалось получить статус');
    // кнопка «Каталог» остаётся — пользователь не в тупике
    expect(host.shadowRoot.querySelector('[data-action="again"]')).toBeTruthy();
  });

  it('без getStoreOrderTracking (старый api) успех показывается без трекинга', async () => {
    const api = makeApi({
      createStoreOrder: vi.fn(async () => ({ order_id: TRACK.order_id, total: 90, delivery_cost: 0 })),
    });
    delete api.getStoreOrderTracking;
    const w = createWidget({ doc: document, cfg, api });
    await w.ready;
    const host = document.getElementById('karta-widget-root');

    await submitOrder(host);

    expect(host.shadowRoot.textContent).toContain('Заказ принят');
    expect(host.shadowRoot.querySelector('a[href*="/track/"]')).toBeNull();
  });
});

describe('createWidget: панель — скролл и оформление', () => {
  const panel = (host) => host.shadowRoot.querySelector('.kw-panel');

  const openPanel = async (api = makeApi()) => {
    const w = createWidget({ doc: document, cfg, api });
    await w.ready;
    const host = document.getElementById('karta-widget-root');
    host.shadowRoot.querySelector('[data-action="toggle"]').click();
    return host;
  };

  it('повторное открытие показывает панель сверху', async () => {
    const host = await openPanel();
    expect(panel(host).style.display).not.toBe('none');
    panel(host).scrollTop = 150; // пользователь доскроллил до формы
    host.shadowRoot.querySelector('[data-action="toggle"]').click(); // закрыть
    host.shadowRoot.querySelector('[data-action="toggle"]').click(); // открыть снова
    expect(panel(host).scrollTop).toBe(0);
  });

  it('перерисовка (клик «Самовывоз») не сбрасывает позицию скролла', async () => {
    const host = await openPanel();
    panel(host).scrollTop = 150;
    const pickup = [...panel(host).querySelectorAll('.kw-seg button')]
      .find((b) => b.textContent.includes('Самовывоз'));
    pickup.click();
    expect(panel(host).scrollTop).toBe(150);
  });

  it('«Оформить заказ» скроллит к форме, а не оставляет старую позицию', async () => {
    const host = await openPanel();
    host.shadowRoot.querySelector('[data-action="add"]').click();
    panel(host).scrollTop = 150;
    host.shadowRoot.querySelector('[data-action="toform"]').click();
    // в jsdom offsetTop формы = 0; главное — позиция НЕ осталась 150
    expect(panel(host).scrollTop).toBe(0);
  });

  it('«Указать на карте» подскролливает к карте, а не оставляет старую позицию', async () => {
    const w = createWidget({ doc: document, cfg: { ...cfg, mapEnabled: true }, api: makeApi() });
    await w.ready;
    const host = document.getElementById('karta-widget-root');
    host.shadowRoot.querySelector('[data-action="toggle"]').click();
    host.shadowRoot.querySelector('.kw-panel').scrollTop = 120;
    host.shadowRoot.querySelector('[data-action="openmap"]').click();
    // в jsdom layout нулевой (ожидаемое значение ≈ 8) — важно, что позиция НЕ осталась 120
    expect(host.shadowRoot.querySelector('.kw-panel').scrollTop).toBeLessThan(120);
  });

  it('оплата — вертикальные строки: наличные активны, карта помечена «скоро»', async () => {
    const host = await openPanel();
    const pay = panel(host).querySelector('.kw-seg.pay');
    expect(pay).toBeTruthy();
    const [cash, card] = pay.querySelectorAll('button');
    expect(cash.getAttribute('aria-pressed')).toBe('true');
    expect(cash.textContent).toContain('При получении');
    expect(card.disabled).toBe(true);
    expect(card.textContent).toContain('скоро');
    expect(card.getAttribute('title')).toBe('Оплата картой подключается');
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
