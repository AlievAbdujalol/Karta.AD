/**
 * Регресс прод-инцидента: `L.heatLayer is not a function` валил карту.
 * Слой плотности теперь считается чистой функцией на штатных circleMarker,
 * поэтому тесты фиксируют только правила отбора/стилизации точек.
 */
import { describe, it, expect } from 'vitest';
import {
  densityCircleSpecs,
  densityStyle,
  densityRadius,
  DENSITY_COLORS,
  DENSITY_MIN_RADIUS,
  DENSITY_MAX_RADIUS,
  DENSITY_MIN_WEIGHT,
} from '@/lib/densityLayer';

describe('densityStyle', () => {
  it('зелёный для свободного участка', () => {
    expect(densityStyle(0.3)).toEqual({ color: DENSITY_COLORS.low, opacity: 0.18 });
  });

  it('жёлтый для плотного', () => {
    expect(densityStyle(0.6).color).toBe(DENSITY_COLORS.mid);
  });

  it('красный для пробки', () => {
    expect(densityStyle(0.9).color).toBe(DENSITY_COLORS.high);
  });

  it('не падает на мусорных значениях', () => {
    expect(densityStyle(NaN).color).toBe(DENSITY_COLORS.mid);
    expect(densityStyle(-5).color).toBe(DENSITY_COLORS.low);
    expect(densityStyle(42).color).toBe(DENSITY_COLORS.high);
  });
});

describe('densityRadius', () => {
  it('растёт с весом в заданных границах', () => {
    expect(densityRadius(0)).toBe(DENSITY_MIN_RADIUS);
    expect(densityRadius(1)).toBe(DENSITY_MAX_RADIUS);
    expect(densityRadius(0.5)).toBeGreaterThan(DENSITY_MIN_RADIUS);
    expect(densityRadius(0.5)).toBeLessThan(DENSITY_MAX_RADIUS);
  });
});

describe('densityCircleSpecs', () => {
  it('отбрасывает невалидные координаты и мусор', () => {
    const specs = densityCircleSpecs([
      [42.87, 74.59, 0.8],
      [NaN, 74.59, 0.8],
      [200, 74.59, 0.8],
      'nope',
      [42.87],
      null,
    ]);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ lat: 42.87, lng: 74.59, color: DENSITY_COLORS.high });
  });

  it('без веса берёт середину шкалы', () => {
    const [spec] = densityCircleSpecs([[42.87, 74.59]]);
    expect(spec.color).toBe(DENSITY_COLORS.mid);
    expect(spec.radius).toBeGreaterThan(DENSITY_MIN_RADIUS);
  });

  it('слишком лёгкие точки не рисуем', () => {
    expect(densityCircleSpecs([[42.87, 74.59, DENSITY_MIN_WEIGHT / 2]])).toHaveLength(0);
  });

  it('пустой/некорректный вход — пустой массив, без исключений', () => {
    expect(densityCircleSpecs(undefined)).toEqual([]);
    expect(densityCircleSpecs(null)).toEqual([]);
    expect(densityCircleSpecs([])).toEqual([]);
  });
});
