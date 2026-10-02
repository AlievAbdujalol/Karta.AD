// Karta-AD service worker: офлайн-каркас приложения (app shell).
// Кешируем только same-origin статику. API (Supabase/OSRM/Nominatim)
// и чужие тайлы идут только через сеть — иначе протухнут данные и realtime.

const CACHE = 'karta-ad-v1';
const TILE_CACHE = 'karta-ad-tiles-v1';
const CORE = ['/', '/index.html', '/logo.png', '/manifest.webmanifest'];

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
    e.respondWith(
      caches.match(request).then((hit) => {
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(TILE_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Навигация: сначала сеть, при офлайне — закешированный index.html
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Статика (хешированные js/css, картинки): stale-while-revalidate
  e.respondWith(
    caches.match(request).then((hit) => {
      const net = fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
