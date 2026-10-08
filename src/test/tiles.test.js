import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * tiles.js — единый конвиг тайлов Karta-AD.
 * Все карты (приложение, виджет, генерируемые сайты) обязаны брать URL отсюда,
 * а не дублировать хардкод tile.openstreetmap.org (блокируется по usage rules).
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('tiles.js', () => {
  it('с VITE_CARTO_API_KEY — тайлы CARTO с ключом и полной атрибуцией', async () => {
    vi.stubEnv('VITE_CARTO_API_KEY', 'test-carto-key');
    vi.resetModules();
    const t = await import('../lib/tiles');
    const url = t.cartoRaster('rastertiles/voyager');
    expect(url).toContain('basemaps.cartocdn.com/rastertiles/voyager');
    expect(url).toContain('key=test-carto-key');
    expect(t.CARTO_ATTRIBUTION).toContain('openstreetmap.org');
    expect(t.CARTO_ATTRIBUTION).toContain('carto.com');
  });

  it('без ключа — детерминированный fallback на OSM (без водяного знака CARTO)', async () => {
    vi.stubEnv('VITE_CARTO_API_KEY', '');
    vi.resetModules();
    const t = await import('../lib/tiles');
    expect(t.cartoRaster('rastertiles/voyager')).toBe(t.OSM_URL);
  });

  it('Google-тайлы подставляют ключ, когда он задан', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_KEY', 'g-key');
    vi.resetModules();
    const t = await import('../lib/tiles');
    expect(t.googleTiles('m')).toContain('lyrs=m');
    expect(t.googleTiles('m')).toContain('key=g-key');
  });
});
