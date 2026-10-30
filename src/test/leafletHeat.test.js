/**
 * Прод-инцидент: `L.heatLayer is not a function` валил всю карту — плагин
 * leaflet.heat не был подключён. Тесты фиксируют безопасные контракты:
 * загрузчик никогда не бросает, отдаёт false, если плагин не зарегистрировался.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import L from 'leaflet';

// «Плагин», который ничего не регистрирует — имитируем неудачное подключение
vi.mock('leaflet.heat', () => ({}));

afterEach(() => {
  delete L.heatLayer;
  vi.resetModules();
});

describe('loadHeatPlugin', () => {
  it('heatLayerAvailable() = false, пока плагин не зарегистрирован', async () => {
    const { heatLayerAvailable } = await import('@/lib/leafletHeat');
    expect(heatLayerAvailable()).toBe(false);
  });

  it('false без исключения, если плагин не создал L.heatLayer', async () => {
    const { loadHeatPlugin } = await import('@/lib/leafletHeat');
    await expect(loadHeatPlugin()).resolves.toBe(false);
  });

  it('ошибка импорта плагина не всплывает наружу', async () => {
    const { loadHeatPlugin } = await import('@/lib/leafletHeat');
    await expect(
      loadHeatPlugin(async () => { throw new Error('chunk load failed'); }),
    ).resolves.toBe(false);
  });

  it('true, когда плагин уже зарегистрировал L.heatLayer', async () => {
    L.heatLayer = () => ({ addTo: () => {} });
    const { loadHeatPlugin, heatLayerAvailable } = await import('@/lib/leafletHeat');
    expect(heatLayerAvailable()).toBe(true);
    await expect(loadHeatPlugin()).resolves.toBe(true);
  });

  it('выставляет window.L перед загрузкой плагина (он читает глобал)', async () => {
    delete window.L;
    const { loadHeatPlugin } = await import('@/lib/leafletHeat');
    await loadHeatPlugin(async () => {});
    expect(window.L).toBe(L);
  });
});
