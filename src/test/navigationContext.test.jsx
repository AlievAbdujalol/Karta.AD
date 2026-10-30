import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { NavigationProvider, useNavigation } from '@/lib/NavigationContext';

// Тосты не влияют на логику — убираем из дерева.
vi.mock('sonner', () => {
  const t = () => {};
  t.error = () => {};
  t.success = () => {};
  t.info = () => {};
  t.warning = () => {};
  return { toast: t };
});

// indexedDB в jsdom нет — кэш маршрутов отключаем (как в osrmSteps.test.js).
vi.mock('@/lib/indexedDbCache', () => ({
  saveRouteCache: vi.fn(async () => {}),
  loadRouteCache: vi.fn(async () => null),
}));

const ARRIVED_RU = 'Вы прибыли в пункт назначения';
const ORIGIN = { lat: 38.56, lng: 69.2 };

// ── Фикстуры маршрутов (внутри проекта, без сети и настоящего GPS) ──────

/** Линия на восток: count сегментов по totalM/count метров. */
function eastLine(totalM, count, start = ORIGIN) {
  const mLng = 111320 * Math.cos((start.lat * Math.PI) / 180);
  const dLng = totalM / count / mLng;
  return Array.from({ length: count + 1 }, (_, i) => [start.lat, start.lng + i * dLng]);
}

/** Точка ровно на восточной линии, m метров от её старта. */
function atM(m, start = ORIGIN) {
  const mLng = 111320 * Math.cos((start.lat * Math.PI) / 180);
  return [start.lat, start.lng + m / mLng];
}

/** Маршрут со структурой, identical UI-полей и шагами: depart(0) · turn(400 м) · arrive(конец). */
function makeRoute({ totalM = 1000, duration = 600, steps = true, start = ORIGIN, geometry } = {}) {
  const geom = geometry || eastLine(totalM, 20, start);
  const to = geom[geom.length - 1];
  return {
    geometry: geom,
    distance: totalM,
    duration,
    mode: 'driving',
    steps: steps
      ? [
          { instruction: 'depart', modifier: '', name: 'Улица 1', distance: Math.round(totalM * 0.4), duration: Math.round(duration * 0.4), start: geom[0] },
          { instruction: 'turn', modifier: 'left', name: 'Улица 2', distance: Math.round(totalM * 0.6), duration: Math.round(duration * 0.6), start: geom[8] },
          { instruction: 'arrive', modifier: '', name: '', distance: 0, duration: 0, start: geom[geom.length - 1] },
        ]
      : [],
    from: { lat: start.lat, lng: start.lng, name: 'Отправление', shortName: 'От' },
    to: { lat: to[0], lng: to[1], name: 'Назначение', shortName: 'До' },
  };
}

/** Ответ OSRM той же формы, что парсит parseOsrmRoute (координаты [lng, lat]). */
function osrmRoutePayload({ geometry, distance, duration }) {
  const coordinates = geometry.map(([lat, lng]) => [lng, lat]);
  const last = coordinates[coordinates.length - 1];
  return {
    distance,
    duration,
    geometry: { coordinates },
    legs: [
      {
        steps: [
          { maneuver: { type: 'depart', location: coordinates[0] }, name: 'Улица', distance: distance / 2, duration: duration / 2, geometry: { coordinates: coordinates.slice(0, 2) } },
          { maneuver: { type: 'arrive', location: last }, name: '', distance: distance / 2, duration: duration / 2, geometry: { coordinates: [last, last] } },
        ],
      },
    ],
  };
}

// ── Харнесс ─────────────────────────────────────────────────────────────

let nav = null;
function Probe() {
  nav = useNavigation();
  return null;
}

let spoken = [];
let fetchMock = null;
let geoWatchers = [];
let geoCleared = [];
let nextWatchId = 1;

function mountNav() {
  return render(
    <NavigationProvider>
      <Probe />
    </NavigationProvider>
  );
}

function feedRaw(latitude, longitude, accuracy = 20) {
  act(() => {
    const watcher = geoWatchers[geoWatchers.length - 1];
    watcher.success({ coords: { latitude, longitude, heading: 90, speed: 3, accuracy } });
  });
}

/** GPS-фикс в точке, m метров восточнее start (первая точка маршрута). */
function feedFix(m, { start = ORIGIN, accuracy = 20 } = {}) {
  const [lat, lng] = atM(m, start);
  feedRaw(lat, lng, accuracy);
}

function arrivedCount() {
  return spoken.filter((t) => t === ARRIVED_RU).length;
}

beforeEach(() => {
  spoken = [];
  geoWatchers = [];
  geoCleared = [];
  nextWatchId = 1;
  localStorage.clear();

  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition(success, error, options) {
        const id = nextWatchId++;
        geoWatchers.push({ id, success, error, options });
        return id;
      },
      clearWatch(id) { geoCleared.push(id); },
      getCurrentPosition() {},
    },
  });

  window.speechSynthesis = {
    speak(u) { spoken.push(String(u?.text ?? '')); },
    cancel() {},
    getVoices() { return []; },
  };
  window.SpeechSynthesisUtterance = class SpeechSynthesisUtterance {
    constructor(text) { this.text = text; }
  };

  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  nav = null;
});

// ── Тесты ───────────────────────────────────────────────────────────────

describe('NavigationContext — прибытие', () => {
  it('первый GPS-фикс выбирает первый манёвр, а не «прибыли» (регрессия D1)', () => {
    mountNav();
    act(() => { nav.startNavigation(makeRoute()); });
    feedFix(0);

    expect(nav.nextInstruction.instruction).toBe('depart');
    expect(nav.nextInstruction.text).toBe('Начните движение');
    expect(nav.hasArrived).toBe(false);
    // До поездки не озвучено НИЧЕГО с «прибыли» — старый баг выбирал шаг arrive сразу.
    expect(spoken.some((t) => t.includes('прибыли'))).toBe(false);
  });

  it('прибытие не подтверждается за 500 м до цели', () => {
    mountNav();
    act(() => { nav.startNavigation(makeRoute()); });
    feedFix(500);
    feedFix(500);

    expect(nav.hasArrived).toBe(false);
    expect(arrivedCount()).toBe(0);
    expect(nav.remainingDistance).toBeGreaterThan(480);
    expect(nav.remainingDistance).toBeLessThan(520);
  });

  it('прибытие не подтверждается за 100 м до цели', () => {
    mountNav();
    act(() => { nav.startNavigation(makeRoute()); });
    feedFix(900); // 100 м до цели
    feedFix(900);

    expect(nav.hasArrived).toBe(false);
    expect(arrivedCount()).toBe(0);
    expect(nav.remainingDistance).toBeGreaterThan(80);
    expect(nav.remainingDistance).toBeLessThan(120);
  });

  it('недостоверный одиночный GPS-фикс не подтверждает прибытие; нужно 2 подряд валидных', () => {
    mountNav();
    act(() => { nav.startNavigation(makeRoute()); });

    feedFix(1000, { accuracy: 500 }); // точность 500 м — не засчитывается
    expect(nav.hasArrived).toBe(false);

    feedFix(1000, { accuracy: 20 });  // первый валидный — подтверждения ещё нет
    expect(nav.hasArrived).toBe(false);
    expect(arrivedCount()).toBe(0);

    feedFix(1000, { accuracy: 20 });  // второй валидный подряд — подтверждено
    expect(nav.hasArrived).toBe(true);
    expect(arrivedCount()).toBe(1);
  });

  it('состояние прибытия меняется ровно один раз: остаток/ETA обнуляются, повторных объявлений нет', () => {
    mountNav();
    act(() => { nav.startNavigation(makeRoute()); });
    feedFix(1000);
    feedFix(1000);
    expect(nav.hasArrived).toBe(true);

    // ещё несколько согласованных замеров на месте — состояние не «моргает»
    feedFix(1000);
    feedFix(1000);
    feedFix(1000);

    expect(arrivedCount()).toBe(1);
    expect(nav.remainingDistance).toBe(0);
    expect(nav.remainingDuration).toBe(0);
    expect(nav.eta).toBeInstanceOf(Date);
    expect(nav.nextInstruction.instruction).toBe('arrive');
    expect(nav.nextInstruction.text).toBe(ARRIVED_RU);
    expect(nav.nextInstruction.distance).toBe(0);
  });

  it('смена цели сбрасывает прибытие; на новом маршруте прибытие объявляется заново (D2)', () => {
    mountNav();
    const route1 = makeRoute();
    act(() => { nav.startNavigation(route1); });
    feedFix(1000);
    feedFix(1000);
    expect(nav.hasArrived).toBe(true);
    expect(arrivedCount()).toBe(1);

    // новая цель — флаг «прибыли» не должен «залипнуть» со старого маршрута
    const start2 = { lat: 38.57, lng: 69.25 };
    const route2 = makeRoute({ start: start2 });
    act(() => { nav.startNavigation(route2); });
    expect(nav.hasArrived).toBe(false);
    expect(nav.routeData).toBe(route2);
    expect(nav.remainingDistance).toBeGreaterThan(0);

    feedFix(1000, { start: start2 });
    feedFix(1000, { start: start2 });
    expect(nav.hasArrived).toBe(true);
    expect(arrivedCount()).toBe(2); // объявлено именно на новой цели, один раз
  });

  it('на паузе прибытие не подтверждается', () => {
    mountNav();
    act(() => { nav.startNavigation(makeRoute()); });

    act(() => { nav.togglePause(); });
    expect(nav.isPaused).toBe(true);
    feedFix(1000);
    feedFix(1000);
    feedFix(1000);
    expect(nav.hasArrived).toBe(false);
    expect(arrivedCount()).toBe(0);

    act(() => { nav.togglePause(); });
    expect(nav.isPaused).toBe(false);
    feedFix(1000);
    feedFix(1000);
    expect(nav.hasArrived).toBe(true);
    expect(arrivedCount()).toBe(1);
  });
});

describe('NavigationContext — манёвры, остаток, ETA', () => {
  it('манёвр arrive в пути: подсказка «Через X — пункт назначения», а не «Вы прибыли» (D6)', () => {
    mountNav();
    act(() => { nav.startNavigation(makeRoute()); });
    feedFix(960);

    expect(nav.nextInstruction.instruction).toBe('arrive');
    expect(nav.nextInstruction.text).toMatch(/^Через \d+ м пункт назначения$/);
    expect(nav.nextInstruction.distance).toBeGreaterThan(35);
    expect(nav.nextInstruction.distance).toBeLessThan(45);
    expect(nav.hasArrived).toBe(false);
    expect(arrivedCount()).toBe(0);
    // голосовая подсказка тоже нейтральная
    expect(spoken.some((t) => /^Через \d+ м пункт назначения$/.test(t))).toBe(true);
    expect(spoken.some((t) => t === ARRIVED_RU)).toBe(false);
  });

  it('остаток до цели и расстояние до манёвра — разные величины; ETA по единой модели (D5)', () => {
    mountNav();
    const route = makeRoute({ duration: 600 });
    act(() => { nav.startNavigation(route); });
    expect(nav.remainingDistance).toBeGreaterThan(0); // стартовое значение HUD — полный маршрут

    feedFix(300);

    expect(nav.routeProgress).toBeGreaterThan(0.25);
    expect(nav.routeProgress).toBeLessThan(0.35);
    // остаток до цели ≈ 700 м (геометрия), а до манёвра (поворот на 400 м) ≈ 100 м
    expect(nav.remainingDistance).toBeGreaterThan(690);
    expect(nav.remainingDistance).toBeLessThan(710);
    expect(nav.nextInstruction.instruction).toBe('turn');
    expect(nav.nextInstruction.distance).toBeGreaterThan(95);
    expect(nav.nextInstruction.distance).toBeLessThan(105);
    // ETA масштабирует время маршрута тем же прогрессом: 600 с × 0.7 ≈ 420 с
    expect(nav.remainingDuration).toBeGreaterThanOrEqual(415);
    expect(nav.remainingDuration).toBeLessThanOrEqual(425);
    expect(nav.eta).toBeInstanceOf(Date);
    const etaGapSec = (nav.eta.getTime() - Date.now()) / 1000;
    expect(etaGapSec).toBeGreaterThan(400);
    expect(etaGapSec).toBeLessThan(440);
  });

  it('маршрут без пошаговки (steps: []) — остаток и ETA считаются, HUD не ломается', () => {
    mountNav();
    act(() => { nav.startNavigation(makeRoute({ steps: false, duration: 600 })); });
    feedFix(400);

    expect(nav.nextInstruction.instruction).toBe('continue');
    expect(nav.nextInstruction.distance).toBeGreaterThan(590);
    expect(nav.nextInstruction.distance).toBeLessThan(610);
    expect(nav.followingStep).toBeNull();
    expect(nav.remainingDuration).toBeGreaterThanOrEqual(355);
    expect(nav.remainingDuration).toBeLessThanOrEqual(365);
    expect(nav.eta).toBeInstanceOf(Date);
  });

  it('вырожденная и пустая геометрия — без NaN, падений и ложного прибытия', () => {
    mountNav();
    const point = atM(0);
    act(() => {
      nav.startNavigation({ geometry: [point, point], distance: 500, duration: 120, steps: [], mode: 'driving' });
    });
    feedRaw(point[0], point[1]);

    expect(Number.isFinite(nav.remainingDistance)).toBe(true);
    expect(nav.remainingDistance).toBe(0); // длина 0 → остаток 0, а не NaN
    expect(nav.hasArrived).toBe(false);    // нулевой маршрут не может подтвердить прибытие

    cleanup();
    nav = null;
    mountNav();
    act(() => { nav.startNavigation({ geometry: [], distance: 0, duration: 0, steps: [] }); });
    feedRaw(ORIGIN.lat, ORIGIN.lng);
    expect(nav.isActive).toBe(true);
    expect(nav.hasArrived).toBe(false);
  });
});

describe('NavigationContext — жизненный цикл маршрута', () => {
  it('ошибка геолокации при старте навигации — gpsError в контексте; живой фикс снимает её', () => {
    mountNav();
    act(() => { nav.startNavigation(makeRoute()); });
    expect(nav.gpsError).toBeNull();
    expect(geoWatchers.length).toBe(1);

    act(() => { geoWatchers[0].error({ code: 1 }); });
    expect(nav.gpsError).toContain('геолокации');

    act(() => {
      geoWatchers[0].success({ coords: { latitude: ORIGIN.lat, longitude: ORIGIN.lng, heading: 90, speed: 3, accuracy: 20 } });
    });
    expect(nav.gpsError).toBeNull();
    expect(nav.userPosition).toEqual([ORIGIN.lat, ORIGIN.lng]);
  });

  it('восстановление маршрута из localStorage; GPS-наблюдение снимается при размонтировании', () => {
    const errSpy = vi.spyOn(console, 'error');
    const route = makeRoute();
    localStorage.setItem('karta_nav_active', JSON.stringify(route));

    const { unmount } = mountNav();

    expect(nav.isActive).toBe(true);
    expect(nav.routeData).toBeTruthy();
    expect(nav.routeData.geometry.length).toBe(route.geometry.length);
    expect(nav.remainingDistance).toBeGreaterThan(0); // HUD стартует с полного маршрута
    expect(geoWatchers.length).toBe(1);              // наблюдение за GPS одно

    unmount();
    expect(geoCleared).toContain(1);                 // без утечки наблюдателя
    expect(errSpy).not.toHaveBeenCalled();           // без ошибок в консоли
  });

  it('поздний ответ reroute не затирает новый маршрут (D8)', async () => {
    mountNav();
    const route1 = makeRoute();
    act(() => { nav.startNavigation(route1); });

    let release;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ ok: true, json: async () => ({ routes: [osrmRoutePayload(route1)] }) });
    }));

    let pending;
    act(() => { pending = nav.reroute(route1.from, route1.to, 'driving'); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // пока ждём ответ — пользователь сменил маршрут/цель
    const route2 = makeRoute({ duration: 900 });
    act(() => { nav.startNavigation(route2); });
    expect(nav.routeData).toBe(route2);

    let result;
    await act(async () => {
      release();
      result = await pending;
    });

    expect(result).toBeNull();                 // поздний ответ отвергнут
    expect(nav.routeData).toBe(route2);        // новый маршрут не перезаписан
    expect(nav.routeData.duration).toBe(900);
  });

  it('неудачный reroute сохраняет текущий маршрут и подтверждённое прибытие', async () => {
    mountNav();
    const route1 = makeRoute();
    act(() => { nav.startNavigation(route1); });
    feedFix(1000);
    feedFix(1000);
    expect(nav.hasArrived).toBe(true);

    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    let result;
    await act(async () => { result = await nav.reroute(route1.from, route1.to); });

    expect(result).toBeNull();
    expect(nav.routeData).toBe(route1); // маршрут не потерян
    expect(nav.hasArrived).toBe(true);  // состояние не сброшено неудачным перестроением
    expect(arrivedCount()).toBe(1);     // и не объявлено повторно
  });

  it('альтернатива: показывается по таймеру и переключается со сбросом прогресса', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    mountNav();
    const route1 = makeRoute({ duration: 600 });
    act(() => { nav.startNavigation(route1); });
    feedFix(300);
    expect(nav.routeProgress).toBeGreaterThan(0.2);

    const altGeometry = eastLine(900, 20, { lat: 38.57, lng: 69.21 });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [
          osrmRoutePayload({ geometry: route1.geometry, distance: 1000, duration: 600 }),
          osrmRoutePayload({ geometry: altGeometry, distance: 900, duration: 100 }),
        ],
      }),
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(8200); });

    expect(nav.alternativeRoute).toBeTruthy();
    expect(nav.alternativeRoute.route.duration).toBe(100);
    expect(nav.alternativeRoute.deltaSec).toBeGreaterThanOrEqual(45);

    const prevRoute = nav.routeData;
    act(() => { nav.useAlternative(); });
    expect(nav.routeData).not.toBe(prevRoute);
    expect(nav.routeData.duration).toBe(100);
    expect(nav.alternativeRoute).toBeNull();
    expect(nav.routeProgress).toBe(0);     // прогресс старого маршрута недействителен
    expect(nav.hasArrived).toBe(false);
  });
});
