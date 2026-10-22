import { describe, it, expect, beforeEach } from 'vitest';
import { TILE_LAYERS, TILE_KEY, initialTileIndex } from '@/components/MapControls';
import { CARTO_KEY } from '@/lib/tiles';

/**
 * Регресс: пользователь жаловался, что слои под номерами 1 и 2
 * недостижимы (needsKey-пропуск без VITE_CARTO_API_KEY), «только три».
 * Все девять слоёв обязаны иметь рабочий URL и быть выбираемыми.
 */
describe('TILE_LAYERS — все девять слоёв карты', () => {
  it('ровно 9 слоёв, каждый с непустым URL-шаблоном', () => {
    expect(TILE_LAYERS).toHaveLength(9);
    for (const layer of TILE_LAYERS) {
      expect(typeof layer.url).toBe('string');
      expect(layer.url.length).toBeGreaterThan(10);
      expect(layer.url).toContain('{z}');
    }
  });

  it('без needsKey-флагов — ни один слой не пропускается при переключении', () => {
    for (const layer of TILE_LAYERS) {
      expect(layer.needsKey).toBeUndefined();
    }
  });

  it('слои «Стандартная» и «Тёмная»: CARTO при ключе, иначе OSM / Esri Dark Gray', () => {
    // Локально в .env.local ключ есть, в CI/prod его может не быть —
    // в обоих случаях URL обязан быть рабочим (проверено в test №1).
    // «Стандарт» без ключа = цветная OSM-схема (пользователь жаловался на
    // серый Esri Light Gray — «карта не та»); «Тёмная» = Esri Dark Gray Canvas.
    if (CARTO_KEY) {
      expect(TILE_LAYERS[0].url).toContain('cartocdn.com');
      expect(TILE_LAYERS[1].url).toContain('cartocdn.com');
    } else {
      expect(TILE_LAYERS[0].url).toContain('openstreetmap.org');
      expect(TILE_LAYERS[1].url).toContain('World_Dark_Gray_Base');
    }
  });
});

describe('initialTileIndex — стартовый слой карты', () => {
  beforeEach(() => localStorage.clear());

  it('чистый localStorage → «1 Стандарт» (индекс 0)', () => {
    expect(initialTileIndex()).toBe(0);
  });

  it('сохранённый валидный индекс принимается, включая последний слой (8)', () => {
    localStorage.setItem(TILE_KEY, '8');
    expect(initialTileIndex()).toBe(8);
    localStorage.setItem(TILE_KEY, '2');
    expect(initialTileIndex()).toBe(2);
  });

  it('мусор, пусто и индекс вне диапазона → 0, не фолбэк на другой слой', () => {
    localStorage.setItem(TILE_KEY, '9'); // за пределами 9 слоёв
    expect(initialTileIndex()).toBe(0);
    localStorage.setItem(TILE_KEY, 'abc');
    expect(initialTileIndex()).toBe(0);
    localStorage.setItem(TILE_KEY, '-1');
    expect(initialTileIndex()).toBe(0);
  });
});
