/**
 * Передача выбранной стартовой остановки из «Расписания» (водитель жмёт
 * «Старт», автоматический рейс прерывается) на карту — карта уходит к этой
 * остановке и помечает рейс неплановым.
 *
 * Ключ одноразовый: takePendingStart() читает и удаляет, чтобы карта не
 * возвращалась к старому выбору при следующих заходах.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PENDING_START_KEY,
  savePendingStart,
  takePendingStart,
  resolvePendingStart,
  pendingStartAction,
} from '@/lib/tripStartHandoff';

const ROUTES = [
  {
    id: 'r1',
    number: 113,
    stops: [
      { name: 'Остановка 1', lat: 40.28, lng: 69.62 },
      { name: 'Остановка 2', lat: 40.29, lng: 69.63 },
      { name: 'Остановка 3', lat: 40.30, lng: 69.64 },
    ],
  },
  { id: 'r2', number: 7, stops: [{ name: 'Другая', lat: 42.87, lng: 74.59 }] },
];

beforeEach(() => localStorage.removeItem(PENDING_START_KEY));
afterEach(() => localStorage.removeItem(PENDING_START_KEY));

describe('savePendingStart / takePendingStart', () => {
  it('сохраняет выбор и отдаёт его один раз', () => {
    savePendingStart({ routeId: 'r1', stopIndex: 2, stop: ROUTES[0].stops[2] });
    const pending = takePendingStart();
    expect(pending.routeId).toBe('r1');
    expect(pending.stopIndex).toBe(2);
    expect(pending.stop.name).toBe('Остановка 3');
    // ключ одноразовый
    expect(takePendingStart()).toBeNull();
  });

  it('битые данные не роняют карту', () => {
    localStorage.setItem(PENDING_START_KEY, 'не json');
    expect(takePendingStart()).toBeNull();
    expect(savePendingStart({ stopIndex: 1 })).toMatchObject({ routeId: null, stopIndex: 1 });
    expect(takePendingStart()).toMatchObject({ stopIndex: 1 });
  });

  it('отсутствие ключа — null', () => {
    expect(takePendingStart()).toBeNull();
  });
});

describe('resolvePendingStart', () => {
  it('находит остановку по координатам в своём маршруте', () => {
    const res = resolvePendingStart(
      { routeId: 'r1', stopIndex: 1, stop: ROUTES[0].stops[1] },
      ROUTES,
    );
    expect(res.route.id).toBe('r1');
    expect(res.index).toBe(1);
    expect(res.stop.name).toBe('Остановка 2');
  });

  it('выбранный маршрут ищется в списке первым (свой город)', () => {
    const res = resolvePendingStart({ routeId: 'r2', stopIndex: 0 }, ROUTES);
    expect(res.route.id).toBe('r2');
    expect(res.stop.name).toBe('Другая');
  });

  it('fallback по индексу, если координат нет', () => {
    const res = resolvePendingStart({ routeId: 'r1', stopIndex: 2 }, ROUTES);
    expect(res.index).toBe(2);
    expect(res.stop.name).toBe('Остановка 3');
  });

  it('маршрут не найден — null, без исключений', () => {
    expect(resolvePendingStart({ routeId: 'нет', stopIndex: 1 }, ROUTES)).toBeNull();
    expect(resolvePendingStart({ stopIndex: 1 }, ROUTES)).toBeNull();
    expect(resolvePendingStart(null, ROUTES)).toBeNull();
    expect(resolvePendingStart({ routeId: 'r1', stopIndex: 1 }, [])).toBeNull();
    expect(resolvePendingStart({ routeId: 'r1', stopIndex: 1 }, null)).toBeNull();
  });

  it('индекс вне границ маршрута — null', () => {
    expect(resolvePendingStart({ routeId: 'r1', stopIndex: 99 }, ROUTES)).toBeNull();
  });
});

describe('pendingStartAction — решение карты', () => {
  it('старт с первой остановки: летим к точке, но без жёлтой маркировки', () => {
    const a = pendingStartAction({ routeId: 'r1', stopIndex: 0, stop: ROUTES[0].stops[0] }, ROUTES);
    expect(a).toMatchObject({ routeId: 'r1', index: 0, unscheduled: false });
    expect(a.focus).toEqual([40.28, 69.62]);
  });

  it('старт не с первой: рейс неплановый — жёлтая маркировка', () => {
    const a = pendingStartAction({ routeId: 'r1', stopIndex: 2, stop: ROUTES[0].stops[2] }, ROUTES);
    expect(a).toMatchObject({ index: 2, unscheduled: true });
    expect(a.stop.name).toBe('Остановка 3');
    expect(a.focus).toEqual([40.3, 69.64]);
  });

  it('остановка без координат — null (лететь некуда и маркер не поставить)', () => {
    const routes = [{ id: 'r9', stops: [{ name: 'Без гео' }, { name: 'Тоже без гео' }] }];
    expect(pendingStartAction({ routeId: 'r9', stopIndex: 1 }, routes)).toBeNull();
    expect(pendingStartAction({ routeId: 'r9', stopIndex: 1, stop: { lat: 0, lng: 0 } }, routes)).toBeNull();
  });

  it('маршрут не загружен — null, без исключений', () => {
    expect(pendingStartAction({ routeId: 'r1', stopIndex: 1 }, [])).toBeNull();
    expect(pendingStartAction(null, ROUTES)).toBeNull();
  });
});
