const PREFIX = 'bustrack_cache_';

export function saveCache(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export function loadCache(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw).data;
  } catch {
    return null;
  }
}