// Karta-AD service worker: офлайн-каркас приложения (app shell).
// Кешируем только same-origin статику. API (Supabase/OSRM/Nominatim)
// и чужие тайлы идут только через сеть — иначе протухнут данные и realtime.
// Контракт: КАЖДАЯ ветка respondWith отдаёт Response. undefined/отклонённый
// промис = TypeError «Failed to convert value to 'Response'» и network error
// у навигации (регресс-тест src/test/serviceWorker.test.js).

const CACHE = 'karta-ad-v1';
const TILE_CACHE = 'karta-ad-tiles-v1';
const CORE = ['/', '/index.html', '/logo.png', '/manifest.webmanifest'];

const OFFLINE_HTML =
  '<!doctype html><html lang="ru"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Karta-AD — нет сети</title>' +
  '<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0;text-align:center">' +
  '<p>Нет подключения к сети.<br>Страница откроется снова, как только появится интернет.</p></body></html>';

const offlineShell = () =>
  caches.match('/index.html').then(
    (hit) => hit || new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
  );
const offlineEmpty = () => new Response('', { status: 504, statusText: 'Offline' });

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![CACHE, TILE_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// stale-while-revalidate для тайлов и статики: кеш сразу, фоном — сеть.
// При падении сети отдаём кеш, а при пустом кеше — 504, но не undefined.
function staleWhileRevalidate(request, cacheName) {
  return caches.match(request).then((hit) => {
    const net = fetch(request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(cacheName).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => hit || offlineEmpty());
    return hit || net;
  });
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  let url;
  try { url = new URL(request.url); } catch { return; }

  const isTileRequest =
    url.hostname.includes('basemaps.cartocdn.com') ||
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('mt0.google.com');

  if (isTileRequest) {
    e.respondWith(staleWhileRevalidate(request, TILE_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Навигация: сначала сеть, при офлайне — закешированный index.html.
  // Кешируем только ok-ответы — иначе в кеш попадает страница ошибки.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => offlineShell()),
    );
    return;
  }

  e.respondWith(staleWhileRevalidate(request, CACHE));
});
