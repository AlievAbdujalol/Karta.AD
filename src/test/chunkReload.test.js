/**
 * Авто-восстановление после деплоя: устаревшая вкладка запрашивает чанк из
 * прошлой сборки → Vercel/SW отдаёт HTML → React.lazy падает
 * «Failed to fetch dynamically imported module». Один раз перезагружаем
 * страницу (с cooldown, чтобы не было цикла), дальше показываем фолбэк.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  isChunkLoadError,
  tryAutoReloadChunkError,
} from '@/lib/chunkReload';

/** sessionStorage-двойник с обычным API */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

describe('isChunkLoadError', () => {
  it('узнаёт ошибки загрузки динамического модуля', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://karta-ad.vercel.app/assets/AdminPanel-x.js'))).toBe(true);
    expect(isChunkLoadError({ message: 'error loading dynamically imported module' })).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".'))).toBe(true);
    // HTML вместо JS исполняется и падает SyntaxError'ом
    expect(isChunkLoadError(new Error("Unexpected token '<'"))).toBe(true);
  });

  it('обычные ошибки приложения — не чанковые', () => {
    expect(isChunkLoadError(new Error('network timeout'))).toBe(false);
    expect(isChunkLoadError(new Error('Баланс меньше нуля'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError('строка')).toBe(false);
  });
});

describe('tryAutoReloadChunkError', () => {
  let storage;
  let reloaded;
  let now;

  beforeEach(() => {
    storage = fakeStorage();
    reloaded = 0;
    now = 1_000_000;
  });

  const call = (error, extra = {}) =>
    tryAutoReloadChunkError(error, {
      now: () => now,
      storage,
      reload: () => { reloaded += 1; },
      ...extra,
    });

  it('чанковая ошибка — перезагружаем один раз и ставим метку', () => {
    const ok = call(new Error('Failed to fetch dynamically imported module: https://x/assets/a.js'));
    expect(ok).toBe(true);
    expect(reloaded).toBe(1);
    expect(storage.getItem('karta_chunk_reload_at')).toBe(String(now));
  });

  it('повтор в пределах cooldown — не перезагружаем (нет цикла)', () => {
    call(new Error('Failed to fetch dynamically imported module: https://x/assets/a.js'));
    now += 5_000; // прошло 5 с < 30 с
    const ok = call(new Error('Failed to fetch dynamically imported module: https://x/assets/b.js'));
    expect(ok).toBe(false);
    expect(reloaded).toBe(1); // только первая
  });

  it('после cooldown можно снова', () => {
    call(new Error('Failed to fetch dynamically imported module: https://x/assets/a.js'));
    now += 31_000;
    const ok = call(new Error('Failed to fetch dynamically imported module: https://x/assets/b.js'));
    expect(ok).toBe(true);
    expect(reloaded).toBe(2);
  });

  it('не-чанковая ошибка — без перезагрузки и без записи метки', () => {
    const ok = call(new Error('server rejected the request'));
    expect(ok).toBe(false);
    expect(reloaded).toBe(0);
    expect(storage.getItem('karta_chunk_reload_at')).toBeNull();
  });

  it('storage недоступен (приватный режим) — безопасно отказываемся', () => {
    const broken = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    const ok = call(new Error('Failed to fetch dynamically imported module: https://x/assets/a.js'), { storage: broken });
    expect(ok).toBe(false);
    expect(reloaded).toBe(0);
  });
});
