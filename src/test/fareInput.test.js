/**
 * Свободная сумма проезда: пассажир меняет её кнопками ±0.50 TJS
 * или вводит вручную. Тариф по умолчанию — 3.00 (маршрутка) / 2.50 (автобус);
 * границы согласованы с серверным RPC pay_bus_fare (0.50 … 10000 TJS).
 */
import { describe, it, expect } from 'vitest';
import {
  FARE_STEP,
  FARE_MIN,
  FARE_MAX,
  defaultFare,
  parseFare,
  normalizeFare,
  stepFare,
} from '@/lib/fareInput';

describe('defaultFare', () => {
  it('маршрутка 3.00, автобус 2.50', () => {
    expect(defaultFare('minibus')).toBe(3);
    expect(defaultFare('bus')).toBe(2.5);
    // неизвестный тип трактуем как автобус (как старый хардкод)
    expect(defaultFare('trolleybus')).toBe(2.5);
    expect(defaultFare(undefined)).toBe(2.5);
  });
});

describe('parseFare', () => {
  it('разбирает числа и строки', () => {
    expect(parseFare(3.5)).toBe(3.5);
    expect(parseFare('3.5')).toBe(3.5);
    expect(parseFare('4')).toBe(4);
    expect(parseFare('3,5')).toBe(3.5); // запятая как десятичный разделитель
  });

  it('некорректный ввод — null', () => {
    expect(parseFare('')).toBeNull();
    expect(parseFare('   ')).toBeNull();
    expect(parseFare('abc')).toBeNull();
    expect(parseFare('12px')).toBeNull();
    expect(parseFare(null)).toBeNull();
    expect(parseFare(undefined)).toBeNull();
    expect(parseFare(NaN)).toBeNull();
  });
});

describe('normalizeFare', () => {
  it('округляет до копеек', () => {
    expect(normalizeFare(3.005)).toBe(3.01);
    expect(normalizeFare(3.333)).toBe(3.33);
  });

  it('держит границы сервера', () => {
    expect(normalizeFare(0)).toBe(FARE_MIN);
    expect(normalizeFare(-5)).toBe(FARE_MIN);
    expect(normalizeFare(999999)).toBe(FARE_MAX);
    expect(normalizeFare(FARE_MIN)).toBe(0.5);
    expect(normalizeFare(10000)).toBe(10000);
  });
});

describe('stepFare', () => {
  it('шаг ±0.50', () => {
    expect(FARE_STEP).toBe(0.5);
    expect(stepFare(3, 1)).toBe(3.5);
    expect(stepFare(3, -1)).toBe(2.5);
    expect(stepFare(2.5, 1)).toBe(3);
  });

  it('не опускается ниже минимума и не выше максимума', () => {
    expect(stepFare(0.5, -1)).toBe(FARE_MIN);
    expect(stepFare(1, -1)).toBe(0.5);
    expect(stepFare(FARE_MAX, 1)).toBe(FARE_MAX);
    expect(stepFare(9999.75, 1)).toBe(FARE_MAX);
  });

  it('некорректное текущее значение — стартует с дефолтного минимума', () => {
    expect(stepFare(NaN, 1)).toBe(FARE_MIN + FARE_STEP);
    expect(stepFare(null, -1)).toBe(FARE_MIN);
  });
});
