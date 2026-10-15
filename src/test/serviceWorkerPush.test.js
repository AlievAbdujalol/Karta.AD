/**
 * public/sw.js — Web Push обработчики (push / notificationclick).
 * Подавляем OS-уведомление, когда приложение на переднем плане (in-app тост
 * уже показывает событие); иначе показываем. Клик — фокус существующей вкладки
 * с переходом на целевую страницу, либо открытие новой.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

class FakeResponse {
  constructor(body = null, init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
  }
  clone() { return this; }
}

async function loadSwForPush({ windows = [] } = {}) {
  vi.resetModules();
  const listeners = {};
  const showNotification = vi.fn(async () => {});
  const openWindow = vi.fn(async () => {});
  vi.stubGlobal('Response', globalThis.Response || FakeResponse);
  vi.stubGlobal('caches', {
    open: vi.fn(async () => ({ addAll: vi.fn(), put: vi.fn(), match: vi.fn() })),
    match: vi.fn(),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  });
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('self', {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    location: new URL('https://app.test/sw.js'),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => windows), openWindow },
    registration: { showNotification },
  });
  await import('../../public/sw.js');
  return { listeners, showNotification, openWindow };
}

function firePush(listeners, data) {
  let waited = null;
  listeners.push({
    waitUntil: (p) => { waited = Promise.resolve(p); },
    data: data != null ? { json: () => data } : null,
  });
  return waited;
}

function fireNotificationClick(listeners, { data = {}, close = vi.fn() } = {}) {
  let waited = null;
  listeners.notificationclick({
    waitUntil: (p) => { waited = Promise.resolve(p); },
    notification: { data, close },
  });
  return waited;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sw.js: push', () => {
  it('показывает уведомление, когда приложение не на переднем плане', async () => {
    const { listeners, showNotification } = await loadSwForPush({ windows: [] });
    await firePush(listeners, { title: 'Новый заказ', body: 'Аэропорт', tag: 'taxi-order-1', url: '/taxi/driver' });

    expect(showNotification).toHaveBeenCalledWith(
      'Новый заказ',
      expect.objectContaining({ body: 'Аэропорт', tag: 'taxi-order-1', icon: '/logo.png', badge: '/icon-192.png' }),
    );
  });

  it('показывает уведомление при скрытой (не в фокусе) вкладке', async () => {
    const { listeners, showNotification } = await loadSwForPush({
      windows: [{ visibilityState: 'hidden', focused: false }],
    });
    await firePush(listeners, { title: 'Статус', body: 'Водитель в пути' });

    expect(showNotification).toHaveBeenCalled();
  });

  it('подавляет уведомление при видимой вкладке в фокусе', async () => {
    const { listeners, showNotification } = await loadSwForPush({
      windows: [{ visibilityState: 'visible', focused: true }],
    });
    await firePush(listeners, { title: 'Дубль', body: 'не показывать' });

    expect(showNotification).not.toHaveBeenCalled();
  });

  it('не падает на битом payload (не-JSON)', async () => {
    const { listeners, showNotification } = await loadSwForPush({ windows: [] });
    await firePush(listeners, { title: 'Karta-AD' });
    expect(showNotification).toHaveBeenCalled();
  });
});

describe('sw.js: notificationclick', () => {
  it('фокусирует открытую вкладку и переходит к целевой странице', async () => {
    const focus = vi.fn(async () => {});
    const navigate = vi.fn(async () => {});
    const close = vi.fn();
    const { listeners } = await loadSwForPush({ windows: [{ focus, navigate }] });

    await fireNotificationClick(listeners, { data: { url: '/taxi' }, close });

    expect(close).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/taxi');
  });

  it('открывает новую вкладку, если открытых нет', async () => {
    const { listeners, openWindow } = await loadSwForPush({ windows: [] });
    await fireNotificationClick(listeners, { data: { url: '/profile' } });

    expect(openWindow).toHaveBeenCalledWith('/profile');
  });

  it('по умолчанию открывает корень', async () => {
    const { listeners, openWindow } = await loadSwForPush({ windows: [] });
    await fireNotificationClick(listeners, { data: {} });

    expect(openWindow).toHaveBeenCalledWith('/');
  });
});
