import { describe, it, expect } from 'vitest';
import {
  toMinutes,
  departureTimes,
  summarizeShift,
  upcomingStops,
  splitDuration,
} from '@/lib/scheduleLogic';

// 2026-11-03 — вторник, локальное время (как считает страница).
const at = (h, m) => new Date(2026, 10, 3, h, m, 0, 0);

const schedule = {
  stops_schedule: [
    { stop_index: 0, stop_name: 'Канешни 66', times: ['06:00', '05:00'] },
    { stop_index: 1, stop_name: 'Терминал', times: ['05:10', '06:10'] },
    { stop_index: 2, stop_name: 'Бозор', times: [] },
    { stop_index: 3, stop_name: 'Атуш', times: ['05:40'] },
  ],
};

describe('toMinutes', () => {
  it('разбирает время в минуты от полуночи', () => {
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('05:07')).toBe(307);
    expect(toMinutes('23:59')).toBe(1439);
    expect(toMinutes('5:07')).toBe(307);
  });

  it('мусор и невалидное время даёт null, а не NaN', () => {
    expect(toMinutes('')).toBeNull();
    expect(toMinutes(null)).toBeNull();
    expect(toMinutes('24:00')).toBeNull();
    expect(toMinutes('05:60')).toBeNull();
    expect(toMinutes('abc')).toBeNull();
    expect(toMinutes('05')).toBeNull();
  });
});

describe('departureTimes', () => {
  it('рейсы берутся только с первой остановки', () => {
    expect(departureTimes(schedule)).toEqual(['05:00', '06:00']);
  });

  it('время на промежуточных остановках не раздувает число рейсов', () => {
    // Было: flatMap по всем остановкам → 5 «рейсов» вместо 2.
    expect(departureTimes(schedule)).toHaveLength(2);
  });

  it('дубли и мусор отбрасываются, время сортируется', () => {
    const messy = { stops_schedule: [{ stop_index: 0, times: ['06:00', '06:00', 'bad', '05:30'] }] };
    expect(departureTimes(messy)).toEqual(['05:30', '06:00']);
  });

  it('если у нулевой остановки времени нет — берётся первая со временем', () => {
    const noOrigin = {
      stops_schedule: [
        { stop_index: 0, times: [] },
        { stop_index: 1, times: ['07:00'] },
      ],
    };
    expect(departureTimes(noOrigin)).toEqual(['07:00']);
  });

  it('пустое расписание не падает', () => {
    expect(departureTimes(null)).toEqual([]);
    expect(departureTimes({})).toEqual([]);
    expect(departureTimes({ stops_schedule: [] })).toEqual([]);
  });
});

describe('summarizeShift', () => {
  it('до первого рейса: 0 пройдено, следующий — первый', () => {
    const s = summarizeShift(schedule, at(4, 30));
    expect(s.totalTrips).toBe(2);
    expect(s.passedTrips).toBe(0);
    expect(s.nextTime).toBe('05:00');
    expect(s.minutesToNext).toBe(30);
    expect(s.progress).toBe(0);
    expect(s.shiftStart).toBe('05:00');
    expect(s.shiftEnd).toBe('06:00');
  });

  it('посередине смены: один рейс прошёл, следующий через полчаса', () => {
    const s = summarizeShift(schedule, at(5, 30));
    expect(s.passedTrips).toBe(1);
    expect(s.nextTime).toBe('06:00');
    expect(s.minutesToNext).toBe(30);
    expect(s.progress).toBe(50);
  });

  it('ровно в момент отправления рейс ещё не считается прошедшим', () => {
    const s = summarizeShift(schedule, at(6, 0));
    expect(s.passedTrips).toBe(1);
    expect(s.nextTime).toBe('06:00');
    expect(s.minutesToNext).toBe(0);
  });

  it('после последнего рейса: 100%, следующего нет', () => {
    const s = summarizeShift(schedule, at(23, 0));
    expect(s.passedTrips).toBe(2);
    expect(s.nextTime).toBeNull();
    expect(s.minutesToNext).toBeNull();
    expect(s.progress).toBe(100);
  });

  it('без расписания возвращает нули, а не деление на ноль', () => {
    const s = summarizeShift(null, at(12, 0));
    expect(s.totalTrips).toBe(0);
    expect(s.passedTrips).toBe(0);
    expect(s.progress).toBe(0);
    expect(s.nextTime).toBeNull();
    expect(s.shiftStart).toBeNull();
    expect(s.shiftEnd).toBeNull();
  });

  it('не мутирует исходное расписание', () => {
    const copy = JSON.parse(JSON.stringify(schedule));
    summarizeShift(schedule, at(5, 30));
    expect(schedule).toEqual(copy);
  });
});

describe('upcomingStops', () => {
  it('отдаёт только будущие остановки, по времени', () => {
    const stops = upcomingStops(schedule, at(5, 30));
    // 05:40 — «Атуш», 06:00 — следующее отправление с первой остановки,
    // 06:10 — «Терминал». Прошедшие 05:00/05:10 не попадают.
    expect(stops.map((s) => s.time)).toEqual(['05:40', '06:00', '06:10']);
    expect(stops.map((s) => s.name)).toEqual(['Атуш', 'Канешни 66', 'Терминал']);
  });

  it('остановка без времени сегодня не показывается', () => {
    const stops = upcomingStops(schedule, at(5, 30));
    expect(stops.some((s) => s.name === 'Бозор')).toBe(false);
  });

  it('ровно текущее время попадает в список', () => {
    const stops = upcomingStops(schedule, at(5, 40));
    expect(stops[0]).toMatchObject({ name: 'Атуш', time: '05:40' });
  });

  it('уважает лимит и порядок', () => {
    const many = {
      stops_schedule: Array.from({ length: 20 }, (_, i) => ({
        stop_index: i,
        stop_name: `Стоп ${i}`,
        times: [`0${5 + (i % 2)}:${String(i).padStart(2, '0')}`],
      })),
    };
    const stops = upcomingStops(many, at(4, 0), 3);
    expect(stops).toHaveLength(3);
    const mins = stops.map((s) => s.minutes);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });

  it('после последней остановки список пуст', () => {
    expect(upcomingStops(schedule, at(23, 0))).toEqual([]);
  });
});

describe('splitDuration', () => {
  it('разбивает минуты на часы и остаток', () => {
    expect(splitDuration(0)).toEqual({ hours: 0, minutes: 0 });
    expect(splitDuration(59)).toEqual({ hours: 0, minutes: 59 });
    expect(splitDuration(60)).toEqual({ hours: 1, minutes: 0 });
    expect(splitDuration(125)).toEqual({ hours: 2, minutes: 5 });
  });

  it('отрицательное и NaN не ломают вывод', () => {
    expect(splitDuration(-5)).toEqual({ hours: 0, minutes: 0 });
    expect(splitDuration(NaN)).toEqual({ hours: 0, minutes: 0 });
  });
});
