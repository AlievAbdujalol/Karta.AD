/**
 * public/sw.js — офлайн-ветки обязаны ВСЕГДА отдавать Response.
 * Регресс из прод-консоли: TypeError «Failed to convert value to 'Response'»
 * и «The FetchEvent … resulted in a network error response: the promise
 * was rejected», когда сеть упала, а кеш пуст.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

/** jsdom не реализует Response — детерминированный двойник. */
class FakeResponse {
  constructor(body = null, init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.statusText = init.statusText || '';
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = { get: (k) => (init.headers && init.headers[k]) || null };
  }
  clone() { return this; }
}

async function loadSw({ fetchMock, matchMock }) {
  vi.resetModules();
  const listeners = {};
  const cache = {
    addAll: vi.fn(async () => {}),
    put: vi.fn(async () => {}),
    match: matchMock,
  };
  vi.stubGlobal('Response', globalThis.Response || FakeResponse);
  vi.stubGlobal('caches', {
    open: vi.fn(async () => cache),
    match: matchMock,
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('self', {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    location: new URL('https://app.test/sw.js'),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  });
  await import('../../public/sw.js');
  return { listeners, cache };
}

/** Диспатч fetch-события: возвращает промис из respondWith (или null). */
function fireFetch(listeners, request) {
  let responded = null;
  listeners.fetch({
    request,
    respondWith: (p) => { responded = Promise.resolve(p); },
  });
  return responded;
}

const NAV = { method: 'GET', mode: 'navigate', url: 'https://app.test/business/ai' };
const TILE = { method: 'GET', mode: 'no-cors', url: 'https://basemaps.cartocdn.com/rastertiles/voyager/2/2/1.png' };
const ASSET = { method: 'GET', mode: 'no-cors', url: 'https://app.test/assets/index-abc123.js' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('public/sw.js: respondWith всегда отдаёт Response', () => {
  it('навигация: сеть упала, кеш пуст — офлайн-страница, а не undefined', async () => {
    const { listeners } = await loadSw({
      fetchMock: vi.fn(() => Promise.reject(new Error('offline'))),
      matchMock: vi.fn(() => Promise.resolve(undefined)),
    });
    const res = await fireFetch(listeners, NAV);
    expect(res).toBeInstanceOf(Response);
    expect(res.ok).toBe(true);
    const body = typeof res.text === 'function' ? await res.text() : String(res.body);
    expect(body).toContain('<!doctype html>');
  });

  it('навигация: не-ok ответ сервера не кешируется как app shell', async () => {
    const serverRes = { ok: false, status: 500, clone: () => ({ bad: true }) };
    const { listeners, cache } = await loadSw({
      fetchMock: vi.fn(() => Promise.resolve(serverRes)),
      matchMock: vi.fn(() => Promise.resolve(undefined)),
    });
    const res = await fireFetch(listeners, NAV);
    expect(res).toBe(serverRes); // статус ошибки доходит до браузера как есть
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('навигация: успех — отдаёт ответ сервера и кладёт app shell в кеш', async () => {
    const serverRes = { ok: true, status: 200, clone: () => ({ copied: true }) };
    const { listeners, cache } = await loadSw({
      fetchMock: vi.fn(() => Promise.resolve(serverRes)),
      matchMock: vi.fn(() => Promise.resolve(undefined)),
    });
    const res = await fireFetch(listeners, NAV);
    expect(res).toBe(serverRes);
    expect(cache.put).toHaveBeenCalledWith('/index.html', { copied: true });
  });

  it('тайл: сеть упала, кеш пуст — 504 вместо TypeError', async () => {
    const { listeners } = await loadSw({
      fetchMock: vi.fn(() => Promise.reject(new Error('offline'))),
      matchMock: vi.fn(() => Promise.resolve(undefined)),
    });
    const res = await fireFetch(listeners, TILE);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(504);
  });

  it('статика: сеть упала, кеш пуст — 504 вместо TypeError', async () => {
    const { listeners } = await loadSw({
      fetchMock: vi.fn(() => Promise.reject(new Error('offline'))),
      matchMock: vi.fn(() => Promise.resolve(undefined)),
    });
    const res = await fireFetch(listeners, ASSET);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(504);
  });

  it('статика: сеть упала, но есть кеш — отдаём кеш', async () => {
    const cached = new FakeResponse('cached-js');
    const { listeners } = await loadSw({
      fetchMock: vi.fn(() => Promise.reject(new Error('offline'))),
      matchMock: vi.fn(() => Promise.resolve(cached)),
    });
    const res = await fireFetch(listeners, ASSET);
    expect(res).toBe(cached);
  });

  it('статика: ok-ответ text/html (SPA-fallback на битый чанк) НЕ кешируется', async () => {
    // Регресс из прод-консоли: deploy удалил старый чанк, Vercel-rewrite отдал
    // index.html (200, text/html), SW закешировал его под именем .js — и чанк
    // «отравлен» в кеше до сброса версии CACHE.
    const htmlRes = {
      ok: true,
      status: 200,
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
      clone: () => ({ html: true }),
    };
    const { listeners, cache } = await loadSw({
      fetchMock: vi.fn(() => Promise.resolve(htmlRes)),
      matchMock: vi.fn(() => Promise.resolve(undefined)),
    });
    const res = await fireFetch(listeners, ASSET);
    expect(res).toBe(htmlRes); // ответ доходит до страницы как есть
    expect(cache.put).not.toHaveBeenCalled(); // но в кеш не попадает
  });

  it('статика: ok-ответ с типом JS кешируется, как раньше', async () => {
    const jsRes = {
      ok: true,
      status: 200,
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/javascript' : null) },
      clone: () => ({ js: true }),
    };
    const { listeners, cache } = await loadSw({
      fetchMock: vi.fn(() => Promise.resolve(jsRes)),
      matchMock: vi.fn(() => Promise.resolve(undefined)),
    });
    const res = await fireFetch(listeners, ASSET);
    expect(res).toBe(jsRes);
    expect(cache.put).toHaveBeenCalled();
  });
});
