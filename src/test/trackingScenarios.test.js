/**
 * trackingScenarios — 15 сценариев ТЗ «отслеживание транспорта» на уровне
 * чистой логики и статической проверки обвязки (компоненты карты/домашней
 * страницы в jsdom не рендерим — Leaflet, но их wiring проверяем чтением
 * исходников, как это уже принято в securityHeaders.test.js).
 *
 * Сценарии, требующие реального устройства/экрана (8, 9 частично, 13),
 * покрыты здесь тем, что можно: поведением логики на устаревших данных +
 * наличием документа BACKGROUND_GPS.md с чек-листом ручных проверок.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import {
  formatDistanceM,
  gpsFreshness,
  vehicleStatus,
  isVehicleLive,
  estimateArrivalMinutes,
  notificationStep,
  routeProgressByStops,
  nextStopStateMachine,
  GPS_STALE_SEC,
  ARRIVE_RADIUS_M,
} from '@/lib/trackingLogic';
import { useStopNotifier } from '@/hooks/useStopNotifier';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const now = new Date('2026-11-05T12:00:00Z').getTime();
const iso = (secAgo) => new Date(now - secAgo * 1000).toISOString();

const STOPS = [
  { name: 'А', lat: 40.1000, lng: 69.2000 },
  { name: 'Б', lat: 40.1090, lng: 69.2000 },
  { name: 'В', lat: 40.1180, lng: 69.2000 },
];

// ── 1. Пользователь видит автобус на карте ───────────────────────────

describe('Сценарий 1 — автобус виден на карте', () => {
  it('свежий активный транспорт проходит фильтр Home.jsx', () => {
    const v = { is_active: true, lat: 40.1, lng: 69.2, last_updated: iso(5) };
    expect(isVehicleLive(v, now)).toBe(true);
    const home = fs.readFileSync(path.join(ROOT, 'src/pages/Home.jsx'), 'utf8');
    expect(home).toContain('isVehicleLive'); // устаревшие не показываются
    expect(home).toContain('karta_vehicles_refresh'); // Realtime-подписка
  });
});

// ── 2. Расстояние в метрах и километрах ──────────────────────────────

describe('Сценарий 2 — расстояние в м и км', () => {
  it('850 м и 2,4 км, без NaN', () => {
    expect(formatDistanceM(850, 'en')).toBe('850 m');
    expect(formatDistanceM(2400, 'en')).toBe('2.4 km');
    expect(formatDistanceM(849.6)).toBe('850 м');
    expect(formatDistanceM(NaN)).toBe('—');
  });
});

// ── 3. ETA меняется после новых координат ─────────────────────────────

describe('Сценарий 3 — ETA пересчитывается по новым координатам', () => {
  it('ближе → меньше минут; старый GPS → неизвестно', () => {
    const a = estimateArrivalMinutes({ distanceM: 4000, speedKmh: 40, lastUpdated: iso(5), now });
    const b = estimateArrivalMinutes({ distanceM: 2000, speedKmh: 40, lastUpdated: iso(5), now });
    expect(b).toBeLessThan(a);
    expect(estimateArrivalMinutes({
      distanceM: 2000, speedKmh: 40, lastUpdated: iso(GPS_STALE_SEC + 10), now,
    })).toBeNull();
  });
});

// ── 4. Транспорт движется по заданному маршруту ───────────────────────

describe('Сценарий 4 — движение вдоль маршрута', () => {
  it('пройденное растёт, остаток падает, инвариант сохраняется', () => {
    const p1 = routeProgressByStops(STOPS, { lat: 40.1010, lng: 69.2000 });
    const p2 = routeProgressByStops(STOPS, { lat: 40.1100, lng: 69.2000 });
    expect(p2.traveledM).toBeGreaterThan(p1.traveledM);
    expect(p2.remainingM).toBeLessThan(p1.remainingM);
    expect(p2.traveledM + p2.remainingM).toBeCloseTo(p2.totalM, 0);
  });
});

// ── 5. Транспорт стоит на остановке ───────────────────────────────────

describe('Сценарий 5 — стоянка на остановке', () => {
  it('два замера рядом + низкая скорость → dwelling со временем стоянки', () => {
    let s = nextStopStateMachine(null, { distToNextM: 40, speedKmh: 10, now, stopIndex: 1 }).state;
    s = nextStopStateMachine(s, { distToNextM: 45, speedKmh: 1, now: now + 5000, stopIndex: 1 }).state;
    s = nextStopStateMachine(s, { distToNextM: 45, speedKmh: 0, now: now + 9000, stopIndex: 1 }).state;
    expect(s.phase).toBe('dwelling');
    expect(s.dwellStart).toBe(now + 9000);
  });
});

// ── 6. GPS временно недоступен ────────────────────────────────────────

describe('Сценарий 6 — GPS недоступен', () => {
  it('нет координат → unknown-статус, ETA неизвестно, уведомлений нет', () => {
    expect(gpsFreshness(null, now)).toBe('unknown');
    expect(vehicleStatus({ is_active: true, speed: 30 }, now)).toBe('unknown');
    expect(estimateArrivalMinutes({ distanceM: 500, speedKmh: 30, lastUpdated: null, now })).toBeNull();
    const res = notificationStep(null, { distM: 900, fresh: false, now });
    expect(res.events).toEqual([]);
  });
});

// ── 7. Координаты устарели ────────────────────────────────────────────

describe('Сценарий 7 — устаревшие координаты', () => {
  it('транспорт не активен, статус stale, уведомления подавлены', () => {
    const stale = { is_active: true, lat: 40.1, lng: 69.2, speed: 40, last_updated: iso(GPS_STALE_SEC + 60) };
    expect(isVehicleLive(stale, now)).toBe(false);
    expect(vehicleStatus(stale, now)).toBe('stale');
    const res = notificationStep(null, { distM: 900, fresh: false, now });
    expect(res.events).toEqual([]);
  });
});

// ── 8. Экран заблокирован (поведение логики + документ) ───────────────

describe('Сценарий 8 — экран заблокирован', () => {
  it('после паузы без фиксов: stale, ложных «прибыл» и ETA нет', () => {
    // 5 минут блокировки: последний фикс стареет, «прибыл» не срабатывает
    const locked = { is_active: true, speed: 20, last_updated: iso(300) };
    expect(vehicleStatus(locked, now)).toBe('stale');
    expect(estimateArrivalMinutes({ distanceM: 100, speedKmh: 20, lastUpdated: locked.last_updated, now })).toBeNull();
    const res = notificationStep({ thresholds: {}, arrived: false, etaFired: false, lastDistM: 90 }, {
      distM: ARRIVE_RADIUS_M - 10, fresh: false, now,
    });
    expect(res.events).toEqual([]);
  });

  it('BACKGROUND_GPS.md документирует ограничение и чек-лист устройства', () => {
    const doc = fs.readFileSync(path.join(ROOT, 'BACKGROUND_GPS.md'), 'utf8');
    expect(doc).toMatch(/заблокированн\S* экран/);
    expect(doc).toMatch(/foreground service/i);
    expect(doc).toMatch(/Чек-лист|чек-лист/);
    expect(doc).toMatch(/нативн/);
  });
});

// ── 9. Водитель переключился в другое приложение ─────────────────────

describe('Сценарий 9 — водитель ушёл в другое приложение', () => {
  it('после паузы этапы не пропускаются: прибытие только после 2 замеров', () => {
    // До переключения: один замер рядом — arriving не наступает
    let s = nextStopStateMachine(null, { distToNextM: 40, speedKmh: 15, now, stopIndex: 1 }).state;
    expect(s.phase).toBe('pending');
    // Возврат в приложение: следующий замер рядом → прибытие
    const r = nextStopStateMachine(s, { distToNextM: 42, speedKmh: 12, now: now + 120_000, stopIndex: 1 });
    expect(r.event).toBe('arriving');
    expect(r.state.phase).toBe('arriving');
    // Отправление невозможно без стоянки
    const jumped = nextStopStateMachine(r.state, { distToNextM: 400, speedKmh: 40, now: now + 130_000, stopIndex: 1 });
    expect(jumped.state.phase).toBe('pending'); // GPS-выброс откатил
  });
});

// ── 10–11. Сеть пропала / восстановилась ──────────────────────────────

describe('Сценарии 10–11 — офлайн и восстановление', () => {
  it('Home.jsx слушает online и немедленно опрашивает после возврата сети', () => {
    const home = fs.readFileSync(path.join(ROOT, 'src/pages/Home.jsx'), 'utf8');
    expect(home).toContain("addEventListener('online'");
    expect(home).toContain('goOnline'); // обработчик возвращает опрос
    expect(home).toContain('setIsOffline(true)'); // офлайн-индикатор
  });

  it('устаревшие за офлайн координаты не выдаются за живые', () => {
    expect(isVehicleLive({ is_active: true, lat: 40, lng: 69, last_updated: iso(600) }, now)).toBe(false);
  });
});

// ── 12. Рейс завершён, передача GPS прекращена ────────────────────────

describe('Сценарий 12 — завершение рейса', () => {
  it('endTrip останавливает watch и деактивирует транспорт', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/lib/TripContext.jsx'), 'utf8');
    const start = src.indexOf('const endTrip');
    const body = src.slice(start, src.indexOf('return (', start));
    expect(body).toContain('stopGpsWatch()');
    expect(body).toContain('is_active: false');
    expect(body).toContain('removeItem'); // длительность рейса сброшена
    // логика: завершённый рейс не активен и не уведомляет
    expect(isVehicleLive({ is_active: false, lat: 40, lng: 69, last_updated: iso(5) }, now)).toBe(false);
    expect(vehicleStatus({ is_active: false, last_updated: iso(5) }, now)).toBe('ended');
  });
});

// ── 13. Пользователь не дал разрешение на геолокацию ──────────────────

describe('Сценарий 13 — нет разрешения на геолокацию', () => {
  it('без позиции расстояние не показывается, а не выдумывается', () => {
    expect(formatDistanceM(null)).toBe('—');
    expect(estimateArrivalMinutes({ distanceM: null, speedKmh: 30, lastUpdated: iso(5), now })).toBeNull();
    const bus = fs.readFileSync(path.join(ROOT, 'src/components/BusMap.jsx'), 'utf8');
    // карточка скрывает строку «От вас», пока позиции нет
    expect(bus).toContain('distFromUserM !== null');
    expect(bus).toContain('getCachedLastLocation');
  });
});

// ── 14. Несколько автобусов на одном маршруте ─────────────────────────

describe('Сценарий 14 — несколько транспортов на маршруте', () => {
  it('прогресс каждого считается независимо', () => {
    const a = routeProgressByStops(STOPS, { lat: 40.1020, lng: 69.2000 });
    const b = routeProgressByStops(STOPS, { lat: 40.1150, lng: 69.2000 });
    expect(a.nextStopIndex).toBe(1);
    expect(b.nextStopIndex).toBe(2);
    expect(b.traveledM).toBeGreaterThan(a.traveledM);
  });
});

// ── 15. Пассажир выбрал остановку, к ней движется транспорт ──────────

describe('Сценарий 15 — подписка на остановку (useStopNotifier)', () => {
  afterEach(() => cleanup());

  const stop = { name: 'Центральный рынок', lat: 40.1000, lng: 69.2000 };
  // Хук считает свежесть по реальному Date.now() — метки делаем от него же,
  // иначе «свежий» GPS из фиксированного now выглядит часовой давности.
  const isoReal = (secAgo) => new Date(Date.now() - secAgo * 1000).toISOString();
  // ~3000 м к северу от остановки: ETA > 5 мин, пороги ещё не пересечены
  const far = { lat: 40.1000 + 3000 / 111320, lng: 69.2000 };
  // ~900 м — пересекает порог 1 км
  const near = { lat: 40.1000 + 900 / 111320, lng: 69.2000 };

  // Скорость 8 км/ч: на 900 м ETA ≈ 7 мин (> ETA_NOTIFY_MIN), чтобы тест
  // проверял именно пороговые события, а не ETA-уведомление.
  const vehicleAt = (pos) => ({
    id: 'v1',
    route_id: 'r1',
    route_number: '5',
    is_active: true,
    speed: 8,
    last_updated: isoReal(5),
    ...pos,
  });

  const baseProps = (vehicles, onNotification) => ({
    vehicles,
    watchedStop: stop,
    route: { id: 'r1', number: '5' },
    onNotification,
  });

  it('событие approach ровно один раз на пересечении порога', () => {
    const onNotification = vi.fn();
    const { rerender } = renderHook((props) => useStopNotifier(props), {
      initialProps: baseProps([vehicleAt(far)], onNotification),
    });
    expect(onNotification).not.toHaveBeenCalled();

    rerender(baseProps([vehicleAt(near)], onNotification));
    expect(onNotification).toHaveBeenCalledTimes(1);
    expect(onNotification.mock.calls[0][0].type).toBe('approach');

    // повторные фиксы внутри порога — без дублей
    rerender(baseProps([vehicleAt({ lat: near.lat - 0.0002, lng: near.lng })], onNotification));
    expect(onNotification).toHaveBeenCalledTimes(1);
  });

  it('устаревший транспорт не шлёт пороговых уведомлений', () => {
    const onNotification = vi.fn();
    const staleVehicle = vehicleAt(near);
    staleVehicle.last_updated = isoReal(GPS_STALE_SEC + 120);
    renderHook((props) => useStopNotifier(props), {
      initialProps: baseProps([staleVehicle], onNotification),
    });
    const types = onNotification.mock.calls.map((c) => c[0].type);
    expect(types).not.toContain('approach');
    expect(types).not.toContain('arrived');
    expect(types).not.toContain('eta');
  });

  it('без Notification API (нет разрешения) хук не падает', () => {
    const onNotification = vi.fn();
    expect(() => renderHook((props) => useStopNotifier(props), {
      initialProps: baseProps([vehicleAt(far)], onNotification),
    })).not.toThrow();
  });
});
