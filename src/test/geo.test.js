import { describe, it, expect } from 'vitest';
import { projectOnPolyline, haversineM, destPoint } from '@/lib/geo';

// destPoint возвращает {lat, lng} — приводим к формату геометрии [lat, lng]
const off = (p, meters, bearingDeg) => {
  const d = destPoint(p[0], p[1], meters, bearingDeg);
  return [d.lat, d.lng];
};

// Прямоугольный «коридор» ~500 м × 100 м: ранняя ветка A→B, поздняя C→D параллельна ей.
const A = [38.560000, 69.200000];
const B = off(A, 500, 90);   // 500 м на восток
const C = off(B, 100, 0);    // 100 м на север
const D = off(C, 500, 270);  // 500 м на запад
const CORRIDOR = [A, B, C, D];
// ≈ длина коридора в метрах: 500 + 100 + 500

const isFiniteResult = (r) =>
  Object.values(r).every((v) => (typeof v === 'number' ? Number.isFinite(v) : true));

describe('projectOnPolyline — базовое поведение (без opts сохраняется прежний алгоритм)', () => {
  it('точка на полилинии: progress≈доля дуги, snapped=точка, dist≈0', () => {
    const p = off(A, 200, 90); // 200 м вдоль ранней ветки
    const r = projectOnPolyline(p[0], p[1], CORRIDOR);
    expect(isFiniteResult(r)).toBe(true);
    expect(r.progress).toBeGreaterThan(0.15);
    expect(r.progress).toBeLessThan(0.23); // 200/1100
    expect(r.distToRoute).toBeLessThan(1);
    expect(haversineM(r.snappedLat, r.snappedLng, p[0], p[1])).toBeLessThan(1);
  });

  it('прогресс ограничен 0..1: точка за концом и за началом', () => {
    const after = off(D, 500, 270);
    const before = off(A, 500, 270);
    expect(projectOnPolyline(after[0], after[1], CORRIDOR).progress).toBeLessThanOrEqual(1);
    expect(projectOnPolyline(before[0], before[1], CORRIDOR).progress).toBeGreaterThanOrEqual(0);
  });

  it('пустая геометрия и одна точка — явная деградация, нет NaN/Infinity', () => {
    const empty = projectOnPolyline(38.5, 69.2, []);
    expect(empty).toEqual({ progress: 0, snappedLat: 38.5, snappedLng: 69.2, segIndex: 0, distToRoute: 0 });
    const single = projectOnPolyline(38.5, 69.2, [[38.5, 69.2]]);
    expect(isFiniteResult(single)).toBe(true);
    expect(single.distToRoute).toBe(0);
  });

  it('нулевой сегмент (две одинаковые точки) — нет NaN/Infinity', () => {
    const geom = [A, [A[0], A[1]], B];
    const p = off(A, 10, 0); // 10 м севернее старта
    const r = projectOnPolyline(p[0], p[1], geom);
    expect(isFiniteResult(r)).toBe(true);
    expect(Number.isFinite(r.progress)).toBe(true);
    expect(Number.isFinite(r.distToRoute)).toBe(true);
  });

  it('невалидные координаты в геометрии отбрасываются — нет NaN в результате', () => {
    const geom = [A, [NaN, 0], [38.5, NaN], B];
    const r = projectOnPolyline(A[0], A[1], geom);
    expect(isFiniteResult(r)).toBe(true);
  });

  it('битые входные координаты пользователя — деградация без исключений', () => {
    const r = projectOnPolyline(NaN, 69.2, CORRIDOR);
    expect(isFiniteResult(r)).toBe(true);
  });
});

describe('projectOnPolyline — устойчивость к петлям при известном предыдущем прогрессе', () => {
  const onLate = off(C, 300, 270);   // пользователь на поздней ветке
  const prevM = 500 + 100 + 300;     // ≈900 м от старта
  const early = off(A, 200, 90);     // GPS-выброс на ранней ветке (200 м от старта)

  it('без prev — глобально ближайший сегмент откатывает прогресс (задокументированное поведение)', () => {
    const r = projectOnPolyline(early[0], early[1], CORRIDOR);
    expect(r.progress).toBeLessThan(0.25); // откат к ранней ветке
  });

  it('с prev — выброс на параллельной ранней ветке НЕ откатывает прогресс назад', () => {
    const r = projectOnPolyline(early[0], early[1], CORRIDOR, { prevProgressM: prevM });
    expect(isFiniteResult(r)).toBe(true);
    expect(r.progress).toBeGreaterThan(0.6); // остаётся на поздней ветке (≈800/1100)
  });

  it('с prev=0 (первый фикс) результат совпадает с глобальным', () => {
    const withPrev = projectOnPolyline(early[0], early[1], CORRIDOR, { prevProgressM: 0 });
    const global = projectOnPolyline(early[0], early[1], CORRIDOR);
    expect(withPrev.progress).toBeCloseTo(global.progress, 5);
  });

  it('небольшой шаг назад в пределах допуска отслеживается корректно', () => {
    const back = off(onLate, 100, 90); // 100 м назад (на восток) вдоль CD
    const r = projectOnPolyline(back[0], back[1], CORRIDOR, { prevProgressM: prevM });
    expect(r.progress).toBeGreaterThan(0.70);
    expect(r.progress).toBeLessThan(0.76); // ≈800/1100
  });

  it('distToRoute остаётся честной дистанцией до маршрута (off-route детектится)', () => {
    const r = projectOnPolyline(early[0], early[1], CORRIDOR, { prevProgressM: prevM });
    expect(r.distToRoute).toBeGreaterThan(50);  // ≈100 м до поздней ветки
    expect(r.distToRoute).toBeLessThan(150);
  });
});
