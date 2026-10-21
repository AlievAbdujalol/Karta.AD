import { describe, it, expect } from 'vitest';
import { TILE_LAYERS } from '@/components/MapControls';
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

  it('слои «Стандартная» и «Тёмная»: CARTO при ключе, иначе keyless Esri Canvas', () => {
    // Локально в .env.local ключ есть, в CI/prod его может не быть —
    // в обоих случаях URL обязан быть рабочим (проверено в test №1).
    if (CARTO_KEY) {
      expect(TILE_LAYERS[0].url).toContain('cartocdn.com');
      expect(TILE_LAYERS[1].url).toContain('cartocdn.com');
    } else {
      expect(TILE_LAYERS[0].url).toContain('World_Light_Gray_Base');
      expect(TILE_LAYERS[1].url).toContain('World_Dark_Gray_Base');
    }
  });
});
