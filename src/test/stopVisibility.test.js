import { describe, it, expect } from 'vitest';
import {
  STOPS_MIN_ZOOM,
  POINTS_MIN_ZOOM,
  visibleStopsAt,
  routeDetailsVisible,
  transitPointsVisible,
} from '@/lib/stopVisibility';

// Пороги видимости точек карты (UX-фидбек: «если остановки не нужны — пусть
// исчезают, чтобы не мешать», «маршрут не должен быть виден так далеко»).
describe('visibleStopsAt — остановки по зуму/маршруту', () => {
  const stops = [
    { lat: 40.28, lng: 69.61, name: 'A' },
    { lat: 40.29, lng: 69.62, name: 'B' },
  ];
  const watched = { lat: 40.28, lng: 69.61 };

  it('на зуме города (z13) показывает все остановки', () => {
    expect(visibleStopsAt(stops, { zoom: 13, route: null, watchedStop: null })).toEqual(stops);
  });

  it('граница: z11 (= STOPS_MIN_ZOOM) показывает все остановки', () => {
    expect(STOPS_MIN_ZOOM).toBe(11);
    expect(visibleStopsAt(stops, { zoom: STOPS_MIN_ZOOM, route: null, watchedStop: null })).toEqual(stops);
  });

  it('при сильном отдалении (z10) без маршрута скрывает все остановки', () => {
    expect(visibleStopsAt(stops, { zoom: 10, route: null, watchedStop: null })).toEqual([]);
  });

  it('при отдалении оставляет только наблюдаемую остановку', () => {
    const out = visibleStopsAt(stops, { zoom: 9, route: null, watchedStop: watched });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('A');
  });

  it('при выбранном маршруте показывает его остановки на любом зуме', () => {
    expect(visibleStopsAt(stops, { zoom: 8, route: { id: 'r1' }, watchedStop: null })).toEqual(stops);
  });

  it('не мутирует входной массив', () => {
    const before = [...stops];
    visibleStopsAt(stops, { zoom: 9, route: null, watchedStop: watched });
    expect(stops).toEqual(before);
  });
});

describe('routeDetailsVisible — линии толстые и плашки номеров', () => {
  it('видимы с z11 и ближе', () => {
    expect(routeDetailsVisible(11)).toBe(true);
    expect(routeDetailsVisible(13)).toBe(true);
  });

  it('скрыты при сильном отдалении (< z11)', () => {
    expect(routeDetailsVisible(10)).toBe(false);
    expect(routeDetailsVisible(0)).toBe(false);
  });
});

describe('transitPointsVisible — машины и точки бизнесов', () => {
  it('порог — z12', () => {
    expect(POINTS_MIN_ZOOM).toBe(12);
    expect(transitPointsVisible(12)).toBe(true);
    expect(transitPointsVisible(11)).toBe(false);
  });
});
