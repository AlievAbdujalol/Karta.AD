import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseOsmTransit, bboxAround, mergeTransitRoutes, fetchOsmTransitRoutes,
} from '../lib/osmTransit';
import { fetchOverpass } from '../lib/overpass';

vi.mock('../lib/overpass', () => ({ fetchOverpass: vi.fn() }));

// --- фикстуры Overpass -------------------------------------------------------

const relations = [
  {
    type: 'relation',
    id: 101,
    tags: { type: 'route', route: 'bus', ref: '5', name: 'Вокзал — Университет', colour: '1565C0' },
    members: [
      { type: 'way', ref: 11, role: 'forward' },
      { type: 'node', ref: 21, role: 'stop' },
      { type: 'way', ref: 12, role: 'forward' },
      { type: 'node', ref: 22, role: 'platform' },
      { type: 'way', ref: 13, role: 'forward' },
      { type: 'node', ref: 23, role: 'stop' },
    ],
  },
  {
    // маршрутка без цвета → дефолтный красный
    type: 'relation',
    id: 102,
    tags: { type: 'route', route: 'minibus', ref: '12' },
    members: [
      { type: 'node', ref: 31, role: 'stop' },
      { type: 'node', ref: 32, role: 'stop' },
    ],
  },
  {
    // слишком мало остановок → пропускаем
    type: 'relation',
    id: 103,
    tags: { type: 'route', route: 'bus', ref: '99' },
    members: [{ type: 'node', ref: 21, role: 'stop' }],
  },
  {
    // роли пустые — берём все узлы-члены как остановки
    type: 'relation',
    id: 104,
    tags: { type: 'route', route: 'bus', ref: '7', colour: '#0F0' },
    members: [
      { type: 'node', ref: 41, role: '' },
      { type: 'node', ref: 42, role: '' },
    ],
  },
  {
    // stop + platform одной остановки (≈20 м) → одна остановка, берём именованную
    type: 'relation',
    id: 105,
    tags: { type: 'route', route: 'bus', ref: '8' },
    members: [
      { type: 'node', ref: 51, role: 'stop' },
      { type: 'node', ref: 52, role: 'platform' },
      { type: 'node', ref: 53, role: 'stop' },
    ],
  },
];

const nodes = [
  { type: 'node', id: 21, lat: 54.78, lon: 32.04, tags: { name: 'Вокзал' } },
  { type: 'node', id: 22, lat: 54.782, lon: 32.05 },
  { type: 'node', id: 23, lat: 54.784, lon: 32.06, tags: { name: 'Университет' } },
  { type: 'node', id: 31, lat: 54.79, lon: 32.07, tags: { name: 'Рынок' } },
  { type: 'node', id: 32, lat: 54.795, lon: 32.08 },
  { type: 'node', id: 41, lat: 54.8, lon: 32.09 },
  { type: 'node', id: 42, lat: 54.805, lon: 32.1 },
  { type: 'node', id: 51, lat: 54.81, lon: 32.1 },
  { type: 'node', id: 52, lat: 54.81002, lon: 32.10002, tags: { name: 'Рынок' } },
  { type: 'node', id: 53, lat: 54.82, lon: 32.11, tags: { name: 'Кольцо' } },
];

describe('parseOsmTransit', () => {
  const routes = parseOsmTransit(relations, nodes);

  it('строит линии из relation: номер, тип, цвет', () => {
    const bus = routes.find((r) => r.number === '5');
    expect(bus).toBeTruthy();
    expect(bus.type).toBe('bus');
    expect(bus.color).toBe('#1565C0'); // без # добавляется
    expect(bus.source).toBe('osm');
    expect(bus.stops).toHaveLength(3);
  });

  it('остановки идут в порядке relation и берут имена узлов', () => {
    const bus = routes.find((r) => r.number === '5');
    expect(bus.stops.map((s) => s.name)).toEqual(['Вокзал', null, 'Университет']);
    expect(bus.stops[0]).toMatchObject({ lat: 54.78, lng: 32.04 });
  });

  it('geometry отсутствует — линии рисуются через остановки, способы не грузим', () => {
    const bus = routes.find((r) => r.number === '5');
    expect(bus.geometry).toBeUndefined();
  });

  it('minibus получает тип minibus и дефолтный цвет', () => {
    const mb = routes.find((r) => r.number === '12');
    expect(mb.type).toBe('minibus');
    expect(mb.color).toBe('#DC2626');
    expect(mb.stops).toHaveLength(2);
    expect(mb.geometry).toBeUndefined();
  });

  it('линии с <2 остановками пропускаются', () => {
    expect(routes.find((r) => r.number === '99')).toBeUndefined();
  });

  it('пустые роли остановок — берём все узлы-члены, короткий hex → длинный', () => {
    const r7 = routes.find((r) => r.number === '7');
    expect(r7).toBeTruthy();
    expect(r7.stops).toHaveLength(2);
    expect(r7.color).toBe('#00FF00');
  });

  it('нечисловые данные не роняют парсер', () => {
    expect(() => parseOsmTransit(null, null)).not.toThrow();
    expect(parseOsmTransit(null, null)).toEqual([]);
  });

  it('пары stop+platform одной остановки не задваиваются — остаётся именованная', () => {
    const r8 = routes.find((r) => r.number === '8');
    expect(r8).toBeTruthy();
    expect(r8.stops).toHaveLength(2);
    expect(r8.stops[0].name).toBe('Рынок'); // предпочли платформу с именем
    expect(r8.stops[1].name).toBe('Кольцо');
  });
});

describe('bboxAround', () => {
  it('даёт bbox вокруг точек с запасом', () => {
    const [s, w, n, e] = bboxAround([{ lat: 54.78, lng: 32.04 }, { lat: 54.84, lng: 32.14 }], 0.1);
    expect(s).toBeCloseTo(54.68);
    expect(n).toBeCloseTo(54.94);
    expect(w).toBeCloseTo(31.94);
    expect(e).toBeCloseTo(32.24);
  });
});

describe('mergeTransitRoutes', () => {
  it('дополняет пустой список БД линиями OSM', () => {
    const merged = mergeTransitRoutes([], [{ number: '5', type: 'bus' }]);
    expect(merged).toHaveLength(1);
  });

  it('не дублирует линию, уже есть в БД (один номер + тип)', () => {
    const merged = mergeTransitRoutes(
      [{ number: '5', type: 'bus' }],
      [{ number: '5', type: 'bus' }, { number: '7', type: 'bus' }]
    );
    expect(merged).toHaveLength(2);
    expect(merged[1].number).toBe('7');
  });

  it('совпадение номера у маршрутки и автобуса — не дубль', () => {
    const merged = mergeTransitRoutes(
      [{ number: '5', type: 'bus' }],
      [{ number: '5', type: 'minibus' }]
    );
    expect(merged).toHaveLength(2);
  });
});

describe('fetchOsmTransitRoutes', () => {
  const BBOX = [54.7, 32.0, 54.9, 32.2];
  const rel = {
    type: 'relation',
    id: 1,
    tags: { type: 'route', route: 'bus', ref: '1' },
    members: [
      { type: 'node', ref: 10, role: 'stop' },
      { type: 'way', ref: 99, role: '' },
      { type: 'node', ref: 11, role: 'stop' },
    ],
  };
  const nodesData = [
    { type: 'node', id: 10, lat: 54.75, lon: 32.05, tags: { name: 'А' } },
    { type: 'node', id: 11, lat: 54.8, lon: 32.1, tags: { name: 'Б' } },
  ];

  beforeEach(() => {
    localStorage.clear();
    fetchOverpass.mockReset();
  });

  it('успех: две стадии запроса, результат уходит в кэш и повторно не грузится', async () => {
    fetchOverpass
      .mockResolvedValueOnce({ elements: [rel] })
      .mockResolvedValueOnce({ elements: nodesData });

    const first = await fetchOsmTransitRoutes(BBOX);
    expect(first).toHaveLength(1);
    expect(first[0].stops).toHaveLength(2);
    expect(fetchOverpass).toHaveBeenCalledTimes(2);

    const second = await fetchOsmTransitRoutes(BBOX);
    expect(second).toEqual(first);
    expect(fetchOverpass).toHaveBeenCalledTimes(2); // кэш, без сети
  });

  it('провал Overpass: [] и негативный кэш — повторно не долбим зеркала', async () => {
    fetchOverpass.mockRejectedValue(new Error('overpass_504'));

    const first = await fetchOsmTransitRoutes(BBOX);
    expect(first).toEqual([]);
    expect(fetchOverpass).toHaveBeenCalledTimes(1);

    const second = await fetchOsmTransitRoutes(BBOX);
    expect(second).toEqual([]);
    expect(fetchOverpass).toHaveBeenCalledTimes(1); // недавний провал — без повтора
  });
});
