import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveLastLocation, getCachedLastLocation } from '@/lib/locationCache';
import { cachedReverseGeocode } from '@/lib/geo';

// jsdom даёт localStorage; хранилище чистим между тестами.
beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('кэш последней GPS-позиции (locationCache)', () => {
  it('save → get: свежий фикс возвращается как есть', () => {
    expect(saveLastLocation({ lat: 42.87, lng: 74.59, accuracy: 12 })).toBe(true);
    const c = getCachedLastLocation();
    expect(c).toMatchObject({ lat: 42.87, lng: 74.59, accuracy: 12 });
    expect(Number.isFinite(c.ts)).toBe(true);
  });

  it('старый фикс (за пределами maxAge) → null', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    saveLastLocation({ lat: 42.87, lng: 74.59 });
    vi.setSystemTime(new Date('2026-10-16T12:00:01Z')); // +1 с
    expect(getCachedLastLocation(500)).toBeNull(); // возраст 1 с > 500 мс
    expect(getCachedLastLocation(2000)).not.toBeNull();
  });

  it('невалидные координаты не пишутся; битый JSON → null', () => {
    expect(saveLastLocation({ lat: NaN, lng: 74.59 })).toBe(false);
    expect(saveLastLocation({})).toBe(false);
    expect(getCachedLastLocation()).toBeNull();
    localStorage.setItem('karta_last_location_v1', '{oops');
    expect(getCachedLastLocation()).toBeNull();
  });
});

describe('cachedReverseGeocode — кэш Nominatim', () => {
  const nomResponse = (display_name) => ({
    ok: true,
    json: async () => ({ display_name, address: { city: 'Бишкек' } }),
  });

  it('промах → один fetch; повтор того же района → из кэша (fetch не зовётся)', async () => {
    const fetchMock = vi.fn(async () => nomResponse('Бишкек, улица Киевская'));
    vi.stubGlobal('fetch', fetchMock);

    const first = await cachedReverseGeocode(42.874, 74.594);
    expect(first?.display_name).toBe('Бишкек, улица Киевская');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await cachedReverseGeocode(42.874, 74.594);
    expect(second?.display_name).toBe('Бишкек, улица Киевская');
    expect(fetchMock).toHaveBeenCalledTimes(1); // кэш-хит
  });

  it('дрожание GPS в пределах ячейки (~110 м) попадает в тот же кэш', async () => {
    const fetchMock = vi.fn(async () => nomResponse('Бишкек'));
    vi.stubGlobal('fetch', fetchMock);

    await cachedReverseGeocode(42.874, 74.594);
    await cachedReverseGeocode(42.8743, 74.5942); // +~35 м — та же ячейка 3 знака
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ошибка сети/!ok → null и НЕ кэшируется (следующий вызов снова fetch)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 504, json: async () => ({}) })
      .mockResolvedValueOnce(nomResponse('Бишкек'));
    vi.stubGlobal('fetch', fetchMock);

    expect(await cachedReverseGeocode(42.87, 74.59)).toBeNull();
    const retry = await cachedReverseGeocode(42.87, 74.59);
    expect(retry?.display_name).toBe('Бишкек');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('параллельные запросы к одной ячейке складываются в один fetch', async () => {
    const fetchMock = vi.fn(
      () => new Promise((resolve) => setTimeout(() => resolve(nomResponse('Бишкек')), 10)),
    );
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([
      cachedReverseGeocode(42.88, 74.6),
      cachedReverseGeocode(42.88, 74.6),
    ]);
    expect(a?.display_name).toBe('Бишкек');
    expect(b?.display_name).toBe('Бишкек');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('просроченный кэш (TTL 7 дней) обновляется через fetch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(nomResponse('старый адрес'))
      .mockResolvedValueOnce(nomResponse('новый адрес'));
    vi.stubGlobal('fetch', fetchMock);

    expect((await cachedReverseGeocode(42.87, 74.59))?.display_name).toBe('старый адрес');
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z')); // +9 дней > TTL
    expect((await cachedReverseGeocode(42.87, 74.59))?.display_name).toBe('новый адрес');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('невалидные координаты → null без fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await cachedReverseGeocode('abc', 74.59)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
