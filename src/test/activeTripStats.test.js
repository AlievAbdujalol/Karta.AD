import { describe, it, expect, beforeEach } from 'vitest';
import {
  emptyDistanceAcc,
  appendFix,
  tripStatsSnapshot,
  nearestBusesOnRoute,
  loadDistanceAcc,
  saveDistanceAcc,
  TRIP_DIST_KEY,
  MAX_FIX_JUMP_M,
} from '@/lib/activeTripStats';

beforeEach(() => {
  localStorage.removeItem(TRIP_DIST_KEY);
});

// ~0.001° широты ≈ 111 м
const M_PER_DEG = 111_320;

describe('appendFix — накопление км с фильтром выбросов', () => {
  it('первый фикс только запоминает позицию, метры не накапливает', () => {
    const acc = emptyDistanceAcc();
    const next = appendFix(acc, { lat: 40.28, lng: 69.62, ts: 1000 });
    expect(next.meters).toBe(0);
    expect(next.lat).toBe(40.28);
    expect(next.lng).toBe(69.62);
  });

  it('накапливает расстояние между последовательными фиксами', () => {
    let acc = emptyDistanceAcc();
    acc = appendFix(acc, { lat: 40.28, lng: 69.62, ts: 0 });
    // 0.001° широты ≈ 111 м
    acc = appendFix(acc, { lat: 40.281, lng: 69.62, ts: 10_000 });
    expect(acc.meters).toBeGreaterThan(100);
    expect(acc.meters).toBeLessThan(120);
  });

  it('невалидный фикс (нет координат) отбрасывается, накопленное сохраняется', () => {
    let acc = emptyDistanceAcc();
    acc = appendFix(acc, { lat: 40.28, lng: 69.62, ts: 0 });
    acc = appendFix(acc, { lat: 40.281, lng: 69.62, ts: 10_000 });
    const before = acc.meters;
    const next = appendFix(acc, { lat: null, lng: NaN, ts: 20_000 });
    expect(next.meters).toBe(before);
    expect(next.lat).toBe(40.281);
  });

  it('GPS-выброс (прыжок дальше MAX_FIX_JUMP_M) не накапливается и не сдвигает якорь', () => {
    let acc = emptyDistanceAcc();
    acc = appendFix(acc, { lat: 40.28, lng: 69.62, ts: 0 });
    const before = acc.meters;
    const jumpLat = 40.28 + (MAX_FIX_JUMP_M * 3) / M_PER_DEG; // ~3× порога
    const next = appendFix(acc, { lat: jumpLat, lng: 69.62, ts: 5000 });
    expect(next.meters).toBe(before);
    expect(next.lat).toBe(40.28); // якорь остался на старой точке
  });

  it('правдоподобная скорость между фиксами выше порога отбрасывается', () => {
    let acc = emptyDistanceAcc();
    acc = appendFix(acc, { lat: 40.28, lng: 69.62, ts: 0 });
    const before = acc.meters;
    // 0.001° ≈ 111 м за 2 с ≈ 200 км/ч — при валидном прыжке (< MAX_FIX_JUMP_M)
    // отсекает только проверка правдоподобной скорости
    const next = appendFix(acc, { lat: 40.281, lng: 69.62, ts: 2000 });
    expect(next.meters).toBe(before);
  });

  it('откат часов (fixTs раньше якоря) отбрасывается без накопления', () => {
    let acc = emptyDistanceAcc();
    acc = appendFix(acc, { lat: 40.28, lng: 69.62, ts: 10_000 });
    const before = acc.meters;
    // координаты правдоподобны, но время «ушло назад» — фикс не доверяем
    const next = appendFix(acc, { lat: 40.2805, lng: 69.62, ts: 5_000 });
    expect(next.meters).toBe(before);
    expect(next.ts).toBe(10_000);
  });
});

describe('tripStatsSnapshot — статистика рейса', () => {
  it('километры, длительность, остановки и скорость', () => {
    const snap = tripStatsSnapshot({
      acc: { meters: 2400 },
      tripStartedAt: 1_000_000,
      now: 1_000_000 + 360_000, // 6 мин
      stopsTotal: 25,
      passedCount: 3,
      speedKmh: 26,
    });
    expect(snap.km).toBeCloseTo(2.4, 2);
    expect(snap.durationSec).toBe(360);
    expect(snap.stopsPassed).toBe(3);
    expect(snap.stopsTotal).toBe(25);
    expect(snap.speedKmh).toBe(26);
  });

  it('без старта рейса длительность 0, км — из накопленного', () => {
    const snap = tripStatsSnapshot({ acc: { meters: 500 }, tripStartedAt: null, now: 999 });
    expect(snap.km).toBeCloseTo(0.5, 2);
    expect(snap.durationSec).toBe(0);
    expect(snap.stopsPassed).toBe(0);
    expect(snap.stopsTotal).toBe(0);
    expect(snap.speedKmh).toBe(0);
  });

  it('длительность не уходит в минус при «путешествии во времени»', () => {
    const snap = tripStatsSnapshot({
      acc: { meters: 0 },
      tripStartedAt: 5000,
      now: 1000,
    });
    expect(snap.durationSec).toBe(0);
  });
});

describe('nearestBusesOnRoute — только реальный GPS других машин', () => {
  const now = 1_000_000;
  const fresh = (over) => ({
    is_active: true,
    last_updated: new Date(now - 5_000).toISOString(),
    route_id: 'r1',
    lat: 40.30,
    lng: 69.64,
    speed: 20,
    vehicle_number: '114',
    driver_id: 'd2',
    ...over,
  });

  it('оставляет только живые машины своего маршрута, исключая себя', () => {
    const vehicles = [
      fresh({ id: 'v2' }),
      fresh({ id: 'v3', route_id: 'other' }),           // чужой маршрут
      fresh({ id: 'v4', is_active: false }),            // не в рейсе
      fresh({ id: 'v5', last_updated: new Date(now - 600_000).toISOString() }), // устаревший GPS
      fresh({ id: 'v1', driver_id: 'd1', vehicle_number: '113' }), // свой driver_id
      fresh({ id: 'v6', vehicle_number: '113' }),       // свой номер (другой driver_id)
    ];
    const list = nearestBusesOnRoute({
      vehicles,
      routeId: 'r1',
      selfDriverId: 'd1',
      selfVehicleNumber: '113',
      origin: { lat: 40.28, lng: 69.62 },
      now,
    });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('v2');
  });

  it('расстояние и ETA динамические: ближе — меньше метров и минут', () => {
    const near = fresh({ id: 'near', lat: 40.281, lng: 69.62 });
    const far = fresh({ id: 'far', lat: 40.30, lng: 69.64 });
    const list = nearestBusesOnRoute({
      vehicles: [far, near],
      routeId: 'r1',
      origin: { lat: 40.28, lng: 69.62 },
      now,
    });
    expect(list.map((b) => b.id)).toEqual(['near', 'far']);
    expect(list[0].distanceM).toBeLessThan(list[1].distanceM);
    expect(list[0].etaMinutes).not.toBeNull();
    expect(list[0].etaMinutes).toBeLessThanOrEqual(list[1].etaMinutes);
  });

  it('без живых GPS — пустой список (без выдуманных чисел)', () => {
    const list = nearestBusesOnRoute({
      vehicles: [
        { id: 'x', is_active: false, route_id: 'r1', lat: 40.3, lng: 69.64 },
        { id: 'y', is_active: true, route_id: 'r1', lat: null, lng: null },
      ],
      routeId: 'r1',
      origin: { lat: 40.28, lng: 69.62 },
      now,
    });
    expect(list).toEqual([]);
  });

  it('ETA null, если у машины неизвестна скорость и нет фолбэка — но машина остаётся в списке', () => {
    const noSpeed = fresh({ id: 'v', speed: 0, lat: 40.29, lng: 69.63 });
    const list = nearestBusesOnRoute({
      vehicles: [noSpeed],
      routeId: 'r1',
      origin: { lat: 40.28, lng: 69.62 },
      now,
      fallbackSpeedKmh: null,
    });
    expect(list).toHaveLength(1);
    expect(list[0].distanceM).toBeGreaterThan(0);
    expect(list[0].etaMinutes).toBeNull();
  });

  it('лимит выдачи соблюдается после сортировки', () => {
    const vehicles = Array.from({ length: 8 }, (_, i) =>
      fresh({ id: `v${i}`, lat: 40.28 + i * 0.002, lng: 69.62 }),
    );
    const list = nearestBusesOnRoute({
      vehicles,
      routeId: 'r1',
      origin: { lat: 40.28, lng: 69.62 },
      now,
      limit: 3,
    });
    expect(list).toHaveLength(3);
    expect(list[0].id).toBe('v0');
  });
});

describe('персист км в пути (localStorage)', () => {
  it('сохраняет и восстанавливает накопитель для того же рейса', () => {
    const acc = { lat: 40.28, lng: 69.62, ts: 1000, meters: 1234 };
    saveDistanceAcc(acc, 777);
    const restored = loadDistanceAcc(777);
    expect(restored).toMatchObject({ lat: 40.28, lng: 69.62, meters: 1234 });
  });

  it('для другого рейса (другой tripStartedAt) — пустой накопитель', () => {
    saveDistanceAcc({ lat: 40.28, lng: 69.62, ts: 1000, meters: 1234 }, 777);
    const restored = loadDistanceAcc(888);
    expect(restored.meters).toBe(0);
    expect(restored.lat).toBeNull();
  });

  it('без сохранённых данных или при битых данных — пустой накопитель', () => {
    expect(loadDistanceAcc(777).meters).toBe(0);
    localStorage.setItem(TRIP_DIST_KEY, 'не json');
    expect(loadDistanceAcc(777).meters).toBe(0);
  });

  it('без tripStartedAt — персист игнорируется', () => {
    saveDistanceAcc({ lat: 1, lng: 1, ts: 1, meters: 500 }, 777);
    expect(loadDistanceAcc(null).meters).toBe(0);
    expect(loadDistanceAcc(undefined).meters).toBe(0);
  });
});
