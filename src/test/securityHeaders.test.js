/**
 * Регресс: прод-конфиг Vercel должен отдавать защитные заголовки и кэшировать
 * хэшированные ассеты.
 *
 * Прод-проверка 02.11.2026 (https://karta-ad.vercel.app):
 *   - HSTS есть (Vercel по умолчанию), а X-Content-Type-Options,
 *     X-Frame-Options, Referrer-Policy, Permissions-Policy отсутствовали;
 *   - /assets/index-*.js отдавался с `public, max-age=0, must-revalidate`,
 *     то есть браузер перепроверял каждый ассет на каждом заходе.
 *
 * Тест статический: читает vercel.json, а не прод — CI не ходит в интернет.
 * Значения выбраны под реальные зависимости приложения: геолокация нужна
 * карте и такси, камера — загрузке фото в поддержку, микрофон не используется.
 * COOP — `same-origin-allow-popups`, потому что шаринг открывает окна через
 * window.open. CSP намеренно не задаётся здесь: Leaflet, тайлы CARTO, OSRM,
 * Overpass и Nominatim требуют отдельного согласованного списка источников
 * (см. KNOWN_ISSUES.md, KI-10).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

/** Все заголовки из блока source: "/(.*)" (глобальные). */
function globalHeaders() {
  const block = (config.headers || []).find((h) => h.source === '/(.*)');
  if (!block) return {};
  return Object.fromEntries(block.headers.map((h) => [h.key.toLowerCase(), h.value]));
}

describe('Vercel: защитные заголовки', () => {
  const headers = globalHeaders();

  it.each([
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'SAMEORIGIN'],
    ['referrer-policy', 'strict-origin-when-cross-origin'],
    ['cross-origin-opener-policy', 'same-origin-allow-popups'],
  ])('%s = %s', (key, value) => {
    expect(headers[key]).toBe(value);
  });

  it('Permissions-Policy разрешает геолокацию и камеру, но не микрофон', () => {
    const policy = headers['permissions-policy'] || '';
    expect(policy).toContain('geolocation=(self)');
    expect(policy).toContain('camera=(self)');
    expect(policy).toContain('microphone=()');
  });

  it('глобальные заголовки не перекрывают кэш ассетов', () => {
    expect(headers['cache-control']).toBeUndefined();
  });
});

describe('Vercel: кэш хэшированных ассетов', () => {
  it('/assets/* кэшируется на год как immutable', () => {
    const block = (config.headers || []).find((h) => h.source === '/assets/(.*)');
    expect(block, 'нет правила кэша для /assets/*').toBeTruthy();
    const cache = block.headers.find((h) => h.key.toLowerCase() === 'cache-control');
    expect(cache?.value).toBe('public, max-age=31536000, immutable');
  });
});

describe('Vercel: SPA-rewrite не сломан', () => {
  it('не-файловые пути уходят в index.html', () => {
    expect(config.rewrites?.[0]).toEqual({
      source: '/((?!.*\\..*).*)',
      destination: '/index.html',
    });
  });
});
