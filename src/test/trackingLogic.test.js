import { describe, it, expect } from 'vitest';
import {
  GPS_FRESH_SEC,
  GPS_STALE_SEC,
  MOVING_MIN_SPEED_KMH,
  APPROACH_THRESHOLDS_M,
  ARRIVE_RADIUS_M,
  formatDistanceM,
  gpsAgeSec,
  gpsFreshness,
  vehicleStatus,
  isVehicleLive,
  estimateArrivalMinutes,
  estimateArrivalClock,
  compassKey,
  notificationStep,
  routeProgressByStops,
  nextStopStateMachine,
} from '@/lib/trackingLogic';

const now = new Date('2026-11-05T12:00:00Z').getTime();
const iso = (secAgo) => new Date(now - secAgo * 1000).toISOString();

// ── Форматирование расстояния (сценарий 2) ──────────────────────────

describe('formatDistanceM', () => {
  it('метры без дробной части: 850 м → «850 м»', () => {
    expect(formatDistanceM(850)).toBe('850 м');
    expect(formatDistanceM(0)).toBe('0 м');
    expect(formatDistanceM(999)).toBe('999 м');
  });

  it('километры с одной цифрой после запятой: 2400 м → «2,4 км» (ru)', () => {
    expect(formatDistanceM(2400)).toBe('2,4 км');
    expect(formatDistanceM(1000)).toBe('1,0 км');
  });

  it('для en разделитель — точка', () => {
    expect(formatDistanceM(2400, 'en')).toBe('2.4 km');
    expect(formatDistanceM(850, 'en')).toBe('850 m');
  });

  it('некорректное значение → «—», а не NaN', () => {
    expect(formatDistanceM(NaN)).toBe('—');
    expect(formatDistanceM(null)).toBe('—');
    expect(formatDistanceM(-5)).toBe('—');
    expect(formatDistanceM(Infinity)).toBe('—');
  });
});

// ── Свежесть GPS (сценарии 6, 7) ────────────────────────────────────

describe('gpsAgeSec / gpsFreshness', () => {
  it('свежий координатный след', () => {
    expect(gpsAgeSec(iso(10), now)).toBeCloseTo(10, 3);
    expect(gpsFreshness(iso(10), now)).toBe('fresh');
  });

  it('между порогами — устаревающие данные', () => {
    expect(gpsFreshness(iso(GPS_FRESH_SEC + 30), now)).toBe('aging');
  });

  it('старше порога — устаревшие', () => {
    expect(gpsFreshness(iso(GPS_STALE_SEC + 1), now)).toBe('stale');
  });

  it('без времени или с мусором — unknown', () => {
    expect(gpsFreshness(null, now)).toBe('unknown');
    expect(gpsFreshness('not-a-date', now)).toBe('unknown');
    expect(gpsAgeSec('not-a-date', now)).toBeNull();
  });
});

describe('vehicleStatus', () => {
  it('движется: свежий GPS и скорость выше порога', () => {
    expect(vehicleStatus({ is_active: true, speed: 30, last_updated: iso(5) }, now)).toBe('moving');
  });

  it('стоит: скорость ниже порога MOVING_MIN_SPEED_KMH', () => {
    expect(vehicleStatus({ is_active: true, speed: 1, last_updated: iso(5) }, now)).toBe('stopped');
    expect(vehicleStatus({ is_active: true, speed: 0, last_updated: iso(5) }, now)).toBe('stopped');
    expect(MOVING_MIN_SPEED_KMH).toBeGreaterThan(1);
  });

  it('рейс завершён: is_active = false, даже с новыми координатами', () => {
    expect(vehicleStatus({ is_active: false, speed: 40, last_updated: iso(1) }, now)).toBe('ended');
  });

  it('данные устарели: старый GPS при активном рейсе', () => {
    expect(vehicleStatus({ is_active: true, speed: 40, last_updated: iso(GPS_STALE_SEC + 60) }, now)).toBe('stale');
  });

  it('нет координат и времени — unknown, а не «движется»', () => {
    expect(vehicleStatus({ is_active: true, speed: 40 }, now)).toBe('unknown');
    expect(vehicleStatus({ is_active: true, speed: 40, last_updated: null }, now)).toBe('unknown');
  });
});

describe('isVehicleLive — устаревший транспорт не считается активным', () => {
  it('свежий активный транспорт показывается', () => {
    expect(isVehicleLive({ is_active: true, lat: 40.1, lng: 69.2, last_updated: iso(5) }, now)).toBe(true);
  });

  it('старые координаты отбрасываются (сценарий 7)', () => {
    expect(isVehicleLive({ is_active: true, lat: 40.1, lng: 69.2, last_updated: iso(900) }, now)).toBe(false);
  });

  it('без времени отбрасывается — иначе «мёртвая» машина висит вечно', () => {
    expect(isVehicleLive({ is_active: true, lat: 40.1, lng: 69.2 }, now)).toBe(false);
  });

  it('завершённый рейс отбрасывается', () => {
    expect(isVehicleLive({ is_active: false, lat: 40.1, lng: 69.2, last_updated: iso(5) }, now)).toBe(false);
  });

  it('нулевые координаты (созданный, но не вышедший транспорт) отбрасываются', () => {
    expect(isVehicleLive({ is_active: true, lat: 0, lng: 0, last_updated: iso(5) }, now)).toBe(false);
  });
});

// ── ETA (сценарии 3, 6, 7) ──────────────────────────────────────────

describe('estimateArrivalMinutes', () => {
  it('считает по актуальной скорости', () => {
    // 3000 м при 36 км/ч (10 м/с) = 300 с → 5 мин
    expect(estimateArrivalMinutes({ distanceM: 3000, speedKmh: 36, lastUpdated: iso(5), now })).toBe(5);
  });

  it('обновляется при новых координатах (сценарий 3)', () => {
    const a = estimateArrivalMinutes({ distanceM: 3000, speedKmh: 36, lastUpdated: iso(5), now });
    const b = estimateArrivalMinutes({ distanceM: 1500, speedKmh: 36, lastUpdated: iso(5), now });
    expect(b).toBeLessThan(a);
  });

  it('устаревший GPS → null («Время прибытия неизвестно»), а не старое время', () => {
    expect(estimateArrivalMinutes({
      distanceM: 500, speedKmh: 40, lastUpdated: iso(GPS_STALE_SEC + 60), now,
    })).toBeNull();
  });

  it('нет времени обновления → null', () => {
    expect(estimateArrivalMinutes({ distanceM: 500, speedKmh: 40, lastUpdated: null, now })).toBeNull();
  });

  it('остановленная машина без данных о рейсе → null, а не фиктивные 20 км/ч', () => {
    expect(estimateArrivalMinutes({ distanceM: 2000, speedKmh: 0, lastUpdated: iso(5), now })).toBeNull();
  });

  it('явно заданный фолбэк (расписание) разрешает прогноз', () => {
    expect(estimateArrivalMinutes({
      distanceM: 2000, speedKmh: 0, lastUpdated: iso(5), now, fallbackSpeedKmh: 20,
    })).toBe(6);
  });

  it('отрицательного времени не бывает', () => {
    expect(estimateArrivalMinutes({ distanceM: 0, speedKmh: 40, lastUpdated: iso(5), now })).toBe(0);
    // отрицательная дистанция — битые данные: не «прибыл сейчас», а «неизвестно»
    expect(estimateArrivalMinutes({ distanceM: -10, speedKmh: 40, lastUpdated: iso(5), now })).toBeNull();
  });

  it('нечисловые входы → null, а не NaN', () => {
    expect(estimateArrivalMinutes({ distanceM: NaN, speedKmh: 40, lastUpdated: iso(5), now })).toBeNull();
    expect(estimateArrivalMinutes({ distanceM: 1000, speedKmh: NaN, lastUpdated: iso(5), now })).toBeNull();
  });

  it('кап: слишком долгий прогноз не выдаётся', () => {
    expect(estimateArrivalMinutes({
      distanceM: 100000, speedKmh: 3.1, lastUpdated: iso(5), now,
    })).toBeNull();
  });
});

describe('estimateArrivalClock — «Ожидаемое прибытие в 08:35»', () => {
  it('возвращает момент в будущем, округлённый до минуты', () => {
    // 3600 м при 36 км/ч = 360 с → прибытие через 6 минут
    const clock = estimateArrivalClock({ distanceM: 3600, speedKmh: 36, lastUpdated: iso(5), now });
    expect(clock).toBeInstanceOf(Date);
    expect(clock.getTime()).toBeGreaterThan(now);
    expect(clock.getTime() - now).toBeCloseTo(360_000, -4);
  });

  it('без данных → null (не рисуем выдуманное время)', () => {
    expect(estimateArrivalClock({ distanceM: 500, speedKmh: 0, lastUpdated: iso(5), now })).toBeNull();
  });
});

describe('compassKey', () => {
  it('делит компас на 8 секторов', () => {
    expect(compassKey(0)).toBe('n');
    expect(compassKey(45)).toBe('ne');
    expect(compassKey(90)).toBe('e');
    expect(compassKey(180)).toBe('s');
    expect(compassKey(270)).toBe('w');
    expect(compassKey(359)).toBe('n');
    expect(compassKey(-90)).toBe('w');
    expect(compassKey(NaN)).toBeNull();
  });
});

// ── Уведомления: пороги, антидубли, свежесть (сценарий 15) ──────────

const freshInput = (distM, over = {}) => ({ distM, now, fresh: true, ...over });

describe('notificationStep', () => {
  it('проходит все пороги сверху вниз и не повторяет их', () => {
    let state = notificationStep(null, freshInput(3000)).state;
    let res = notificationStep(state, freshInput(900));
    expect(res.events.map((e) => e.type)).toEqual(['approach']);
    expect(res.events[0].thresholdM).toBe(1000);
    state = res.state;

    // каждое следующее GPS-обновление внутри порога — без дублей
    res = notificationStep(state, freshInput(800));
    expect(res.events).toEqual([]);
    state = res.state;
    res = notificationStep(state, freshInput(450));
    expect(res.events.map((e) => e.thresholdM)).toEqual([500]);
    state = res.state;
    res = notificationStep(state, freshInput(400));
    expect(res.events).toEqual([]);
  });

  it('уведомление «прибыл» ровно один раз', () => {
    let state = notificationStep(null, freshInput(900)).state;
    state = notificationStep(state, freshInput(500)).state;
    let res = notificationStep(state, freshInput(ARRIVE_RADIUS_M - 10));
    expect(res.events.map((e) => e.type)).toEqual(['arrived']);
    state = res.state;
    res = notificationStep(state, freshInput(ARRIVE_RADIUS_M - 20));
    expect(res.events).toEqual([]);
  });

  it('после реального отъезда порог можно пройти заново (перезарядка)', () => {
    let state = notificationStep(null, freshInput(900)).state;
    state = notificationStep(state, freshInput(500)).state;
    // отъехал далеко за порог + гистерезис
    state = notificationStep(state, freshInput(500 + 150 + 50)).state;
    const res = notificationStep(state, freshInput(480));
    expect(res.events.map((e) => e.thresholdM)).toContain(500);
  });

  it('дрожь на пороге не плодит события (гистерезис)', () => {
    let state = notificationStep(null, freshInput(520)).state;
    let res = notificationStep(state, freshInput(490)); // чуть пересёк
    expect(res.events).toHaveLength(1);
    state = res.state;
    res = notificationStep(state, freshInput(505)); // дрожь обратно
    expect(res.events).toEqual([]);
    state = res.state;
    res = notificationStep(state, freshInput(495)); // снова внутри — без повтора
    expect(res.events).toEqual([]);
  });

  it('устаревший GPS не порождает уведомлений', () => {
    const state = notificationStep(null, freshInput(900)).state;
    const res = notificationStep(state, freshInput(100, { fresh: false }));
    expect(res.events).toEqual([]);
    expect(res.state).toEqual(state);
  });

  it('рейс завершён — уведомлений нет', () => {
    const state = notificationStep(null, freshInput(900)).state;
    const res = notificationStep(state, freshInput(100, { active: false }));
    expect(res.events).toEqual([]);
  });

  it('ETA-порог «примерно 5 минут» срабатывает один раз', () => {
    let state = notificationStep(null, freshInput(5000)).state;
    let res = notificationStep(state, freshInput(5000, { etaMinutes: 6 }));
    expect(res.events).toEqual([]);
    state = res.state;
    res = notificationStep(state, freshInput(4900, { etaMinutes: 5 }));
    expect(res.events.map((e) => e.type)).toEqual(['eta']);
    state = res.state;
    res = notificationStep(state, freshInput(4800, { etaMinutes: 4 }));
    expect(res.events).toEqual([]);
  });

  it('без дистанции события не генерируются', () => {
    const res = notificationStep(null, freshInput(NaN));
    expect(res.events).toEqual([]);
  });

  it('пороги заданы константой и отсортированы по убыванию', () => {
    expect(APPROACH_THRESHOLDS_M[0]).toBe(1000);
    const sorted = [...APPROACH_THRESHOLDS_M].sort((a, b) => b - a);
    expect(APPROACH_THRESHOLDS_M).toEqual(sorted);
  });
});

// ── Прогресс рейса по остановкам (сценарии 4, 14, 15) ──────────────

const stops = [
  { name: 'А', lat: 40.1000, lng: 69.2000 },
  { name: 'Б', lat: 40.1090, lng: 69.2000 }, // ~1000 м к северу
  { name: 'В', lat: 40.1180, lng: 69.2000 }, // ещё ~1000 м
];

describe('routeProgressByStops', () => {
  it('в начале маршрута: следующая — первая остановка, остаток = всей длине', () => {
    const p = routeProgressByStops(stops, { lat: 40.1000, lng: 69.2000 });
    expect(p.nextStopIndex).toBe(1);
    expect(p.passedCount).toBe(0);
    expect(p.remainingM).toBeGreaterThan(1900);
    expect(p.remainingM).toBeLessThan(2100);
    expect(p.distToNextM).toBeGreaterThan(900);
    expect(p.distToNextM).toBeLessThan(1100);
  });

  it('между остановками: пройдено 1, следующая — вторая, остаток уменьшился', () => {
    const p = routeProgressByStops(stops, { lat: 40.1045, lng: 69.2000 });
    expect(p.nextStopIndex).toBe(1);
    expect(p.passedCount).toBe(1);
    expect(p.distToNextM).toBeLessThan(600);
    expect(p.remainingM).toBeLessThan(1600);
    expect(p.totalM).toBeGreaterThan(1900);
  });

  it('на последней остановке: остаток 0, пройдено всё', () => {
    const p = routeProgressByStops(stops, { lat: 40.1180, lng: 69.2000 });
    expect(p.remainingM).toBeLessThan(30);
    expect(p.passedCount).toBe(stops.length);
    expect(p.nextStopIndex).toBeNull();
  });

  it('остаток + пройденное = длина маршрута (инвариант)', () => {
    const p = routeProgressByStops(stops, { lat: 40.1045, lng: 69.2000 });
    expect(p.traveledM + p.remainingM).toBeCloseTo(p.totalM, 0);
  });

  it('два транспорта на одном маршруте дают независимый прогресс (сценарий 14)', () => {
    const a = routeProgressByStops(stops, { lat: 40.1020, lng: 69.2000 });
    const b = routeProgressByStops(stops, { lat: 40.1150, lng: 69.2000 });
    expect(a.nextStopIndex).toBe(1);
    expect(b.nextStopIndex).toBe(2);
    expect(b.traveledM).toBeGreaterThan(a.traveledM);
  });

  it('мусор в остановках не роняет расчёт', () => {
    expect(routeProgressByStops([], { lat: 1, lng: 1 })).toBeNull();
    expect(routeProgressByStops([{ name: 'x' }], { lat: 1, lng: 1 })).toBeNull();
    expect(routeProgressByStops(stops, null)).toBeNull();
  });

  it('одна остановка — до неё идём напрямую по цепочке', () => {
    const p = routeProgressByStops([stops[0]], { lat: 40.1000, lng: 69.2000 });
    expect(p.nextStopIndex).toBeNull();
    expect(p.remainingM).toBeLessThan(30);
  });
});

// ── Состояния остановки: прибытие/стоянка/отправление (сценарий 5) ──

describe('nextStopStateMachine', () => {
  it('одиночный замер рядом с остановкой не подтверждает прибытие', () => {
    let s = nextStopStateMachine(null, { distToNextM: 40, speedKmh: 20, now }).state;
    expect(s.phase).toBe('pending');
    s = nextStopStateMachine(s, { distToNextM: 400, speedKmh: 20, now: now + 5000 }).state;
    expect(s.phase).toBe('pending');
  });

  it('два подряд замера рядом → прибытие обнаружено', () => {
    let s = nextStopStateMachine(null, { distToNextM: 40, speedKmh: 15, now }).state;
    s = nextStopStateMachine(s, { distToNextM: 45, speedKmh: 8, now: now + 5000 }).state;
    expect(s.phase).toBe('arriving');
    expect(s.arrivedAt).toBe(now + 5000);
  });

  it('после прибытия остановка → стоянка, фиксируется время', () => {
    let s = nextStopStateMachine(null, { distToNextM: 40, speedKmh: 15, now }).state;
    s = nextStopStateMachine(s, { distToNextM: 45, speedKmh: 2, now: now + 5000 }).state;
    // первый замер «рядом» + медленно: arriving, но dwelling ждёт подтверждения
    s = nextStopStateMachine(s, { distToNextM: 45, speedKmh: 1, now: now + 10_000 }).state;
    expect(s.phase).toBe('dwelling');
    expect(s.dwellStart).toBeDefined();
  });

  it('после стоянки отправление фиксируется, стоянка посчитана', () => {
    let s = nextStopStateMachine(null, { distToNextM: 40, speedKmh: 15, now }).state;
    s = nextStopStateMachine(s, { distToNextM: 45, speedKmh: 2, now: now + 5000 }).state;
    s = nextStopStateMachine(s, { distToNextM: 45, speedKmh: 1, now: now + 10_000 }).state;
    s = nextStopStateMachine(s, { distToNextM: 45, speedKmh: 1, now: now + 15_000 }).state;
    expect(s.phase).toBe('dwelling');
    const res = nextStopStateMachine(s, { distToNextM: 300, speedKmh: 25, now: now + 45_000 });
    expect(res.state.phase).toBe('departed');
    expect(res.event).toBe('departed');
    expect(res.state.dwellMs).toBe(35_000);
  });

  it('повторные события не дублируются: событие только на переходе', () => {
    let s = nextStopStateMachine(null, { distToNextM: 40, speedKmh: 15, now }).state;
    const r1 = nextStopStateMachine(s, { distToNextM: 45, speedKmh: 15, now: now + 5000 });
    expect(r1.event).toBe('arriving');
    const r2 = nextStopStateMachine(r1.state, { distToNextM: 45, speedKmh: 15, now: now + 10_000 });
    expect(r2.event).toBeNull();
    expect(r2.state.phase).toBe('arriving');
  });

  it('GPS-выброс вдали от остановки откатывает ложное прибытие', () => {
    let s = nextStopStateMachine(null, { distToNextM: 40, speedKmh: 15, now }).state;
    s = nextStopStateMachine(s, { distToNextM: 45, speedKmh: 15, now: now + 5000 }).state;
    expect(s.phase).toBe('arriving');
    s = nextStopStateMachine(s, { distToNextM: 400, speedKmh: 60, now: now + 10_000 }).state;
    expect(s.phase).toBe('pending');
    expect(s.fixes).toBe(0);
  });

  it('смена остановки сбрасывает состояние через initialStopState', () => {
    let s = nextStopStateMachine(null, { distToNextM: 40, speedKmh: 15, now }).state;
    s = nextStopStateMachine(s, { distToNextM: 45, speedKmh: 15, now: now + 5000 }).state;
    expect(s.stopIndex).toBeUndefined();
    const fresh = nextStopStateMachine({ ...s, stopIndex: 0 }, { distToNextM: 400, speedKmh: 20, now: now + 20_000, stopIndex: 1 });
    expect(fresh.event).toBeNull();
    expect(fresh.state.phase).toBe('pending');
    expect(fresh.state.stopIndex).toBe(1);
    expect(fresh.state.fixes).toBe(0);
  });

  it('битые входы не роняют машину состояний', () => {
    const r = nextStopStateMachine(null, { distToNextM: NaN, speedKmh: NaN, now });
    expect(r.state.phase).toBe('pending');
    expect(r.event).toBeNull();
  });
});

// ── Регрессии после код-ревью ────────────────────────────────────────

describe('правки по ревью', () => {
  it('formatDistanceM: 999.6 м → «1,0 км», а не «1000 м»', () => {
    expect(formatDistanceM(999.6)).toBe('1,0 км');
    expect(formatDistanceM(999.6, 'en')).toBe('1.0 km');
    expect(formatDistanceM(999.4)).toBe('999 м');
  });

  it('битый now не даёт NaN-возраст координат', () => {
    const age = gpsAgeSec(iso(30), NaN);
    expect(Number.isFinite(age)).toBe(true);
    expect(age).toBeGreaterThanOrEqual(0);
  });

  it('устаревший GPS с нулевой дистанцией → ETA неизвестно, а не «0 минут»', () => {
    expect(estimateArrivalMinutes({
      distanceM: 0,
      speedKmh: 30,
      lastUpdated: iso(GPS_STALE_SEC + 60),
      now,
    })).toBeNull();
    expect(estimateArrivalMinutes({
      distanceM: -100,
      speedKmh: 30,
      lastUpdated: iso(5),
      now,
    })).toBeNull();
  });

  it('прыжок 3000→300 м за один GPS-фикс → одно approach (самый срочный порог)', () => {
    const r1 = notificationStep(null, { distM: 3000, fresh: true });
    const r2 = notificationStep(r1.state, { distM: 300, fresh: true });
    const approaches = r2.events.filter((e) => e.type === 'approach');
    expect(approaches).toHaveLength(1);
    expect(approaches[0].thresholdM).toBe(500);
    // помечены оба пересечённых порога — повторный фикс дублей не даст
    expect(r2.state.thresholds[1000]).toBe(true);
    expect(r2.state.thresholds[500]).toBe(true);
  });
});
