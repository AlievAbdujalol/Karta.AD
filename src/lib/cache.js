const PREFIX = 'bustrack_cache_';
const LRU_KEY = PREFIX + '__lru__';
const MAX_ENTRIES = 200;

function getLru() {
  try { return JSON.parse(localStorage.getItem(LRU_KEY) || '[]'); } catch { return []; }
}
function setLru(list) {
  try { localStorage.setItem(LRU_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES))); } catch {}
}
function touchLru(key) {
  const lru = getLru().filter((k) => k !== key);
  lru.unshift(key);
  setLru(lru);
}
function evictIfNeeded() {
  const lru = getLru();
  if (lru.length <= MAX_ENTRIES) return;
  const toRemove = lru.slice(MAX_ENTRIES);
  toRemove.forEach((k) => { try { localStorage.removeItem(PREFIX + k); } catch {} });
  setLru(lru.slice(0, MAX_ENTRIES));
}

export function saveCache(key, data, ttlMs = 0) {
  try {
    const payload = { data, ts: Date.now(), ttl: ttlMs };
    localStorage.setItem(PREFIX + key, JSON.stringify(payload));
    touchLru(key); evictIfNeeded();
  } catch {}
}

export function loadCache(key, maxAgeMs = 0) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (maxAgeMs && Date.now() - p.ts > maxAgeMs) return null;
    if (p.ttl && Date.now() - p.ts > p.ttl) { localStorage.removeItem(PREFIX + key); return null; }
    touchLru(key);
    return p.data;
  } catch { return null; }
}

export function hasCache(key, maxAgeMs = 0) {
  return loadCache(key, maxAgeMs) !== null;
}

export function clearCache(key) {
  try { localStorage.removeItem(PREFIX + key); } catch {}
}

export function clearExpired() {
  const lru = getLru();
  let removed = 0;
  lru.forEach((k) => {
    try {
      const raw = localStorage.getItem(PREFIX + k);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.ttl && Date.now() - p.ts > p.ttl) { localStorage.removeItem(PREFIX + k); removed++; }
    } catch {}
  });
  if (removed) setLru(getLru().filter((k) => { try { return localStorage.getItem(PREFIX + k) !== null; } catch { return false; } }));
  return removed;
}
