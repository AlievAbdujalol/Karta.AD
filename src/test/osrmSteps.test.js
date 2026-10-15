import { describe, it, expect, vi, beforeEach } from 'vitest';

// Кэш маршрутов вне браузера недоступен — отключаем (иначе jsdom без indexedDB падает)
vi.mock('@/lib/indexedDbCache', () => ({
  saveRouteCache: vi.fn(async () => {}),
  loadRouteCache: vi.fn(async () => null),
}));

import { buildOsrmRoute } from '@/lib/osrmClient';

// Миниатюрный, но структурно точный ответ OSRM:
// геометрия — 100 вершин (~11 м между ними), шагов всего 3 (манёвры в вершинах 0, 50, 99).
// Приблизительно как в реальном ответе: вершин геометрии КРАТНО больше, чем шагов.
function makeOsrmFixture() {
  const coords = [];
  for (let i = 0; i < 100; i++) coords.push([69.2000 + i * 0.0001, 38.5600]); // [lng, lat]
  const steps = [
    {
      maneuver: { type: 'depart', location: coords[0] },
      geometry: { coordinates: coords.slice(0, 2) },
      name: 'Улица А', distance: 550, duration: 55,
    },
    {
      maneuver: { type: 'turn', modifier: 'left', location: coords[50] },
      geometry: { coordinates: coords.slice(50, 52) },
      name: 'Улица Б', distance: 539, duration: 54,
    },
    {
      maneuver: { type: 'arrive', location: coords[99] },
      geometry: { coordinates: [coords[99], coords[99]] },
      name: '', distance: 0, duration: 0,
    },
  ];
  return {
    code: 'Ok',
    routes: [{
      distance: 1089, duration: 109,
      geometry: { coordinates: coords },
      legs: [{ steps }],
    }],
  };
}

describe('parseOsrmRoute (через buildOsrmRoute) — старты шагов', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => makeOsrmFixture(),
    })));
  });

  it('start шага — точка ЕГО манёвра, а не geometry[i] по индексу шага', async () => {
    const route = await buildOsrmRoute({ lat: 38.56, lng: 69.2 }, { lat: 38.56, lng: 69.2099 }, 'driving');
    expect(route).toBeTruthy();
    expect(route.steps).toHaveLength(3);

    // Старый баг: start = geometry[0..2] (все в начале маршрута).
    // Правильно: манёвры в вершинах 0, 50 и 99 геометрии. Формат — [lat, lng].
    expect(route.steps[0].start[0]).toBeCloseTo(38.56, 6);
    expect(route.steps[0].start[1]).toBeCloseTo(69.2, 6);                    // lng вершины 0
    expect(route.steps[1].start[0]).toBeCloseTo(38.56, 6);                   // lat
    expect(route.steps[1].start[1]).toBeCloseTo(69.2 + 50 * 0.0001, 6);      // lng вершины 50
    expect(route.steps[2].start[0]).toBeCloseTo(38.56, 6);                   // lat
    expect(route.steps[2].start[1]).toBeCloseTo(69.2 + 99 * 0.0001, 6);      // lng вершины 99 (цель)
  });

  it('шаги сохраняют манёвр, имя и дистанции', async () => {
    const route = await buildOsrmRoute({ lat: 38.56, lng: 69.2 }, { lat: 38.56, lng: 69.2099 }, 'driving');
    expect(route.steps.map((s) => s.instruction)).toEqual(['depart', 'turn', 'arrive']);
    expect(route.steps[1].modifier).toBe('left');
    expect(route.steps[0].name).toBe('Улица А');
    expect(route.steps[0].distance).toBe(550);
  });

  it('старты шагов монотонно продвигаются вдоль маршрута (не сбиваются в кучу)', async () => {
    const route = await buildOsrmRoute({ lat: 38.56, lng: 69.2 }, { lat: 38.56, lng: 69.2099 }, 'driving');
    const lngs = route.steps.map((s) => s.start[1]);
    expect(lngs[1]).toBeGreaterThan(lngs[0]);
    expect(lngs[2]).toBeGreaterThan(lngs[1]);
  });
});
