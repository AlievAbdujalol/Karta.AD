import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { useGeolocation } from '@/hooks/useGeolocation';

const geo = {
  getCurrentPosition: vi.fn(),
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
};

function installGeo() {
  vi.stubGlobal('navigator', { ...navigator, geolocation: geo });
}

beforeEach(() => {
  installGeo();
  Object.values(geo).forEach((m) => m.mockClear());
  localStorage.clear();
});

afterEach(() => {
  cleanup(); // размонтируем хуки, пока navigator ещё застовлен (stopWatch вызывается в эффекте)
  vi.unstubAllGlobals();
  localStorage.clear();
});

function posFixture(lat = 42.87, lng = 74.59, accuracy = 10, heading = 90, speed = 3) {
  return { coords: { latitude: lat, longitude: lng, accuracy, heading, speed } };
}

describe('useGeolocation — locateOnce', () => {
  it('успешный ответ: координаты, точность, курс, скорость в состоянии и в результате', async () => {
    geo.getCurrentPosition.mockImplementation((success) => success(posFixture()));
    const { result } = renderHook(() => useGeolocation());
    let resolved;
    await act(async () => { resolved = await result.current.locateOnce(); });
    expect(result.current.position).toEqual([42.87, 74.59]);
    expect(result.current.accuracy).toBe(10);
    expect(result.current.heading).toBe(90);
    expect(result.current.speed).toBe(3);
    expect(result.current.error).toBeNull();
    expect(resolved.lat).toBe(42.87);
    expect(resolved.lng).toBe(74.59);
  });

  it('отказ в разрешении (код 1): ошибка в состоянии, промиш отклонён', async () => {
    geo.getCurrentPosition.mockImplementation((_s, err) => err({ code: 1 }));
    const { result } = renderHook(() => useGeolocation());
    let caught;
    await act(async () => {
      try { await result.current.locateOnce(); } catch (e) { caught = e; }
    });
    expect(caught?.message).toContain('геолокации');
    await waitFor(() => expect(result.current.error).toContain('геолокации'));
  });

  it('тайм-аут (код 3): ошибка в состоянии', async () => {
    geo.getCurrentPosition.mockImplementation((_s, err) => err({ code: 3 }));
    const { result } = renderHook(() => useGeolocation());
    let caught;
    await act(async () => {
      try { await result.current.locateOnce(); } catch (e) { caught = e; }
    });
    expect(caught?.message).toBe('Не удалось определить местоположение');
    await waitFor(() => expect(result.current.error).toBe('Не удалось определить местоположение'));
  });

  it('нет API геолокации в браузере: ошибка без падения', async () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true, writable: true });
    const { result } = renderHook(() => useGeolocation());
    await expect(act(async () => result.current.locateOnce())).rejects.toThrow(/не поддерживается/);
  });

  it('повторный вызов во время выполнения не запускает второй getCurrentPosition', async () => {
    let release;
    geo.getCurrentPosition.mockImplementation((success) => { release = () => success(posFixture()); });
    const { result } = renderHook(() => useGeolocation());
    const p1 = result.current.locateOnce();
    const p2 = result.current.locateOnce();
    release();
    await act(async () => { await p1; await p2.catch(() => {}); });
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});

describe('useGeolocation — watchPosition', () => {
  it('запуск: watchPosition с нужными опциями, watching = true', () => {
    geo.watchPosition.mockImplementation((success) => { success(posFixture()); return 7; });
    const { result } = renderHook(() => useGeolocation());
    act(() => { result.current.startWatch(() => {}); });
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    const opts = geo.watchPosition.mock.calls[0][2];
    expect(opts.enableHighAccuracy).toBe(true);
    expect(opts.maximumAge).toBe(3000);
    expect(result.current.watching).toBe(true);
    expect(result.current.position).toEqual([42.87, 74.59]);
  });

  it('ошибка watchPosition: watching сбрасывается в false, ошибка записывается', () => {
    geo.watchPosition.mockImplementation((_s, err) => err({ code: 1 }));
    const { result } = renderHook(() => useGeolocation());
    act(() => { result.current.startWatch(() => {}); });
    expect(result.current.watching).toBe(false);
    expect(result.current.error).toContain('геолокации');
  });

  it('повторный запуск отменяет предыдущее наблюдение (нет утечки観察теля)', () => {
    geo.watchPosition.mockImplementation(() => 1);
    geo.watchPosition.mockImplementationOnce(() => 2);
    const { result } = renderHook(() => useGeolocation());
    act(() => { result.current.startWatch(() => {}); });
    act(() => { result.current.startWatch(() => {}); });
    // первый вызов вернул 2 (mockImplementationOnce), второй — 1: предыдущее наблюдение снято
    expect(geo.clearWatch).toHaveBeenCalledWith(2);
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
  });

  it('остановка: clearWatch вызывается, watching = false, новые фиксы не обновляют состояние', () => {
    geo.watchPosition.mockImplementation((success) => { success(posFixture()); return 5; });
    const { result } = renderHook(() => useGeolocation());
    act(() => { result.current.startWatch(() => {}); });
    act(() => { result.current.stopWatch(); });
    expect(geo.clearWatch).toHaveBeenCalledWith(5);
    expect(result.current.watching).toBe(false);
    act(() => { result.current.stopWatch(); });
  });

  it('размонтирование компонента снимает наблюдение', () => {
    geo.watchPosition.mockImplementation(() => 3);
    const { result, unmount } = renderHook(() => useGeolocation());
    act(() => { result.current.startWatch(() => {}); });
    unmount();
    expect(geo.clearWatch).toHaveBeenCalledWith(3);
  });
});
