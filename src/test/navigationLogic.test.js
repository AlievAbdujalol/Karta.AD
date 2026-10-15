import { describe, it, expect } from 'vitest';
import {
  ARRIVAL_THRESHOLD_M,
  ARRIVAL_CONFIRM_FIXES,
  OFF_ROUTE_THRESHOLD_M,
  initialArrivalState,
  nextArrivalState,
  computeRemainingM,
  computeEtaSec,
  computeStepsArcM,
  pickNextStep,
} from '@/lib/navigationLogic';

// Измерение «рядом с целью» на маршруте, по умолчанию — все не-accuracy гейты пройдены
const mNear = (over = {}) => ({
  toDestM: 20,
  offRouteM: 5,
  snappedToDestM: 20,
  progress: 0.99,
  accuracyM: 10,
  routeValid: true,
  ...over,
});

describe('прибытие — пороги, подтверждение несколькими замерами', () => {
  it('500 м и 100 м от цели — прибытие не объявляется', () => {
    let s = initialArrivalState();
    s = nextArrivalState(s, mNear({ toDestM: 500, snappedToDestM: 500 }));
    expect(s.confirmed).toBe(false);
    s = nextArrivalState(s, mNear({ toDestM: 100, snappedToDestM: 100 }));
    expect(s.confirmed).toBe(false);
  });

  it('одиночный точный замер у цели — прибытие НЕ подтверждается', () => {
    const s = nextArrivalState(initialArrivalState(), mNear());
    expect(s.confirmed).toBe(false);
    expect(s.streak).toBe(1);
  });

  it('несколько согласованных замеров подтверждают прибытие', () => {
    let s = initialArrivalState();
    for (let i = 0; i < ARRIVAL_CONFIRM_FIXES; i++) s = nextArrivalState(s, mNear());
    expect(s.confirmed).toBe(true);
  });

  it('подтверждённое прибытие «липкое» — дальнейшие замеры не отменяют его', () => {
    let s = initialArrivalState();
    for (let i = 0; i < ARRIVAL_CONFIRM_FIXES; i++) s = nextArrivalState(s, mNear());
    s = nextArrivalState(s, mNear({ toDestM: 80, offRouteM: 0, snappedToDestM: 80 }));
    expect(s.confirmed).toBe(true);
  });

  it('низкая точность GPS: замеры с accuracy выше порога не засчитываются', () => {
    let s = initialArrivalState();
    for (let i = 0; i < 5; i++) s = nextArrivalState(s, mNear({ accuracyM: 150 }));
    expect(s.confirmed).toBe(false);
  });

  it('прерывистые замеры (у цели → далеко → у цели) не накапливают streak', () => {
    let s = initialArrivalState();
    s = nextArrivalState(s, mNear());
    s = nextArrivalState(s, mNear({ toDestM: 200, snappedToDestM: 200 }));
    expect(s.streak).toBe(0);
    s = nextArrivalState(s, mNear());
    expect(s.confirmed).toBe(false); // снова только 1 подряд
  });

  it('проезд мимо цели (60 м) не подтверждает прибытие', () => {
    let s = initialArrivalState();
    for (let i = 0; i < 3; i++) s = nextArrivalState(s, mNear({ toDestM: 60, snappedToDestM: 60 }));
    expect(s.confirmed).toBe(false);
  });

  it('параллельная дорога рядом с целью: off-route замер не подтверждает прибытие', () => {
    let s = initialArrivalState();
    for (let i = 0; i < 3; i++) {
      s = nextArrivalState(s, mNear({ toDestM: 25, offRouteM: OFF_ROUTE_THRESHOLD_M + 10, snappedToDestM: 25 }));
    }
    expect(s.confirmed).toBe(false);
  });

  it('петля: ранний проход мимо цели (малый progress) не подтверждает прибытие', () => {
    let s = initialArrivalState();
    for (let i = 0; i < 3; i++) s = nextArrivalState(s, mNear({ progress: 0.05, snappedToDestM: 25 }));
    expect(s.confirmed).toBe(false);
  });

  it('проекция не на финальном участке (snappedToDestM большой) не подтверждает прибытие', () => {
    let s = initialArrivalState();
    for (let i = 0; i < 3; i++) s = nextArrivalState(s, mNear({ snappedToDestM: 300 }));
    expect(s.confirmed).toBe(false);
  });

  it('невалидный маршрут (routeValid=false) не подтверждает прибытие', () => {
    let s = initialArrivalState();
    for (let i = 0; i < 3; i++) s = nextArrivalState(s, mNear({ routeValid: false }));
    expect(s.confirmed).toBe(false);
  });

  it('NaN в измерении не подтверждает прибытие и не ломает счётчик', () => {
    let s = initialArrivalState();
    s = nextArrivalState(s, mNear({ toDestM: NaN }));
    expect(s.confirmed).toBe(false);
    expect(s.streak).toBe(0);
  });

  it('порог: ровно ARRIVAL_THRESHOLD_M засчитывается, больше — нет', () => {
    let s = nextArrivalState(initialArrivalState(), mNear({ toDestM: ARRIVAL_THRESHOLD_M }));
    expect(s.streak).toBe(1);
    s = nextArrivalState(initialArrivalState(), mNear({ toDestM: ARRIVAL_THRESHOLD_M + 1 }));
    expect(s.streak).toBe(0);
  });

  it('после смены маршрута (новый initialArrivalState) старое прибытие не сохраняется', () => {
    let s = initialArrivalState();
    for (let i = 0; i < ARRIVAL_CONFIRM_FIXES; i++) s = nextArrivalState(s, mNear());
    expect(s.confirmed).toBe(true);
    // смена цели/маршрута = новый трекер
    expect(initialArrivalState().confirmed).toBe(false);
  });
});

describe('остаток маршрута и ETA — единая геометрическая модель', () => {
  it('остаток = длина маршрута × (1 − прогресс), без повторного пройденного', () => {
    expect(computeRemainingM(1000, 0.4)).toBeCloseTo(600, 5);
    expect(computeRemainingM(1000, 1)).toBe(0);
    expect(computeRemainingM(1000, 0)).toBe(1000);
  });

  it('остаток ограничен [0, длина] и не даёт NaN', () => {
    expect(computeRemainingM(1000, 1.5)).toBe(0);
    expect(computeRemainingM(1000, -0.5)).toBe(1000);
    expect(computeRemainingM(0, 0.5)).toBe(0);
    expect(computeRemainingM(NaN, 0.5)).toBe(0);
  });

  it('ETA по средней скорости, когда она достоверна', () => {
    const eta = computeEtaSec({ remainingM: 300, routeLenM: 1000, durationSec: 600, avgSpeedMps: 10 });
    expect(eta).toBeCloseTo(30, 5);
  });

  it('ETA по прогрессу маршрута, когда скорости нет', () => {
    const eta = computeEtaSec({ remainingM: 300, routeLenM: 1000, durationSec: 600, avgSpeedMps: 0 });
    expect(eta).toBeCloseTo(180, 5); // 600 × 0.3
  });

  it('без шагов и без данных — нейтральное состояние (null), не ложное «0 мин»', () => {
    expect(computeEtaSec({ remainingM: 300, routeLenM: 1000, durationSec: 0, avgSpeedMps: 0 })).toBeNull();
    expect(computeEtaSec({ remainingM: 0, routeLenM: 0, durationSec: 0, avgSpeedMps: 0 })).toBe(0);
  });

  it('недостоверная скорость (< 1.2 м/с) не используется для ETA', () => {
    const eta = computeEtaSec({ remainingM: 300, routeLenM: 1000, durationSec: 600, avgSpeedMps: 0.5 });
    expect(eta).toBeCloseTo(180, 5);
  });
});

describe('шаги маршрута — позиции манёвров вдоль геометрии', () => {
  // Геометрия из 4 точек: углы прямоугольника; шаги начинаются в точках 0, 1, 3
  const geom = [
    [38.5600, 69.2000],
    [38.5600, 69.2045],
    [38.5609, 69.2045],
    [38.5609, 69.2000],
  ];
  const steps = [
    { instruction: 'depart', start: geom[0], distance: 500 },
    { instruction: 'turn', start: geom[1], distance: 100 },
    { instruction: 'arrive', start: geom[3], distance: 0 },
  ];

  it('computeStepsArcM даёт дуговые позиции стартов шагов', () => {
    const arc = computeStepsArcM(geom, steps);
    const total = haversineLen(geom[0], geom[1]) + haversineLen(geom[1], geom[2]) + haversineLen(geom[2], geom[3]);
    expect(arc).toHaveLength(3);
    expect(arc[0]).toBeCloseTo(0, 1);
    expect(arc[1]).toBeGreaterThan(350); // первая нога ~391 м (0.0045° долготы на 38.56° с.ш.)
    expect(arc[1]).toBeLessThan(450);
    expect(arc[2]).toBeCloseTo(total, 0); // arrive-манёвр — в конце маршрута
  });

  it('мусорные старты не дают NaN', () => {
    const arc = computeStepsArcM(geom, [{ start: [NaN, NaN] }, { start: null }, { start: geom[0] }]);
    expect(arc.every(Number.isFinite)).toBe(true);
  });

  it('пустые шаги/геометрия — пустой результат', () => {
    expect(computeStepsArcM(geom, [])).toEqual([]);
    expect(computeStepsArcM([], steps)).toHaveLength(3);
  });

  it('pickNextStep: в начале показывается depart', () => {
    const arc = computeStepsArcM(geom, steps);
    const r = pickNextStep(arc, 0);
    expect(r.idx).toBe(0);
    expect(r.distToNextM).toBe(0);
  });

  it('pickNextStep: в середине шага главным становится СЛЕДУЮЩИЙ манёвр, дистанция — до него', () => {
    const arc = computeStepsArcM(geom, steps);
    const r = pickNextStep(arc, arc[0] + (arc[1] - arc[0]) * 0.5); // середина первого шага
    expect(r.idx).toBe(1);
    expect(r.distToNextM).toBeGreaterThan(0);
    expect(r.distToNextM).toBeLessThanOrEqual(arc[1] - arc[0]);
  });

  it('pickNextStep: за последним манёвром — arrive, дистанция не отрицательна', () => {
    const arc = computeStepsArcM(geom, steps);
    const r = pickNextStep(arc, arc[2] + 50);
    expect(r.idx).toBe(2);
    expect(r.distToNextM).toBe(0);
  });

  it('pickNextStep: пустой массив шагов — null (ветка «без пошаговки»)', () => {
    expect(pickNextStep([], 100)).toBeNull();
    expect(pickNextStep(null, 100)).toBeNull();
  });
});

// локальная длина сегмента для проверки арки
function haversineLen(p1, p2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(p2[0] - p1[0]);
  const dLng = toRad(p2[1] - p1[1]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(p1[0])) * Math.cos(toRad(p2[0])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
