/**
 * chunkReload.js — авто-восстановление после деплоя.
 *
 * Ситуация: вкладка открыта до деплоя, ленивая страница (например /admin)
 * запрашивает чанк из прошлой сборки — его уже нет, сервер отдаёт HTML →
 * React.lazy падает «Failed to fetch dynamically imported module».
 *
 * Один автоматический reload (не чаще раза в RELOAD_COOLDOWN, метка в
 * sessionStorage) подтягивает свежий HTML со всеми актуальными чанками;
 * если reload не помог — показывается штатный фолбэк ErrorBoundary с кнопкой.
 */

export const CHUNK_RELOAD_KEY = 'karta_chunk_reload_at';
export const RELOAD_COOLDOWN_MS = 30_000;

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to load module script|Unexpected token ['"]</i;

/** Ошибка загрузки чанка (устаревший HTML после деплоя), а не ошибка приложения. */
export function isChunkLoadError(error) {
  if (!error || typeof error !== 'object') return false;
  const msg = String(error.message || '');
  return CHUNK_ERROR_RE.test(msg);
}

/**
 * Чанковая ошибка → один авто-reload с cooldown.
 * @param {unknown} error пойманное исключение
 * @param {{now?: () => number, storage?: Storage, reload?: () => void}} [deps]
 * @returns {boolean} true — перезагрузка запущена
 */
export function tryAutoReloadChunkError(error, deps = {}) {
  if (!isChunkLoadError(error)) return false;
  const now = deps.now || Date.now;
  const storage = deps.storage || (typeof window !== 'undefined' ? window.sessionStorage : null);
  const reload = deps.reload || (typeof window !== 'undefined' ? () => window.location.reload() : null);
  if (!storage || !reload) return false;

  try {
    const last = Number(storage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Number.isFinite(last) && last > 0 && now() - last < RELOAD_COOLDOWN_MS) return false;
    storage.setItem(CHUNK_RELOAD_KEY, String(now()));
  } catch {
    return false; // приватный режим / quota — не рискуем циклом
  }
  reload();
  return true;
}
