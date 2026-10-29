import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { toast } from 'sonner';
import MapControls from '@/components/MapControls';

// react-leaflet без настоящей карты — useMap только выдаёт объект карты с flyTo.
vi.mock('react-leaflet', () => ({
  useMap: () => ({ flyTo: vi.fn() }),
}));

// i18n без инициализации — t вернёт ключ, ищем элементы по title (ключу).
vi.mock('@/lib/useLanguage', () => ({
  useLanguage: () => ({ t: (k) => k, lang: 'ru', setLang: vi.fn() }),
  LANG_KEY: 'karta_lang',
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
    loading: vi.fn(), dismiss: vi.fn(),
  },
}));

const geo = {
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
  getCurrentPosition: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal('navigator', { ...navigator, geolocation: geo });
  Object.values(geo).forEach((m) => m.mockClear());
  Object.values(toast).forEach((m) => { if (typeof m === 'function' && m.mockClear) m.mockClear(); });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderControls(props = {}) {
  const {
    tileIndex = 0, setTileIndex = vi.fn(), finderActive = false,
    onFinderToggle = vi.fn(), onShareTrip = vi.fn(), rightOffset = 0,
    isNavigating = false, onLocate = undefined,
    autoCenter = false, onToggleAutoCenter = vi.fn(),
    overviewActive = false, onToggleOverview = vi.fn(),
    showTraffic = false, onToggleTraffic = vi.fn(),
    showTransport = false, onToggleTransport = vi.fn(),
    locating = false,
  } = props;
  return render(
    <MapControls
      tileIndex={tileIndex} setTileIndex={setTileIndex}
      finderActive={finderActive} onFinderToggle={onFinderToggle}
      onShareTrip={onShareTrip} rightOffset={rightOffset}
      isNavigating={isNavigating} onLocate={onLocate}
      autoCenter={autoCenter} onToggleAutoCenter={onToggleAutoCenter}
      overviewActive={overviewActive} onToggleOverview={onToggleOverview}
      showTraffic={showTraffic} onToggleTraffic={onToggleTraffic}
      showTransport={showTransport} onToggleTransport={onToggleTransport}
      locating={locating}
    />,
  );
}

const btn = (container, title) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.getAttribute('title') === title);

const errToast = vi.mocked(toast.error);

describe('MapControls — кнопка местоположения (Crosshair)', () => {
  it('по умолчанию не находится в «активном» состоянии (одноразовое действие)', () => {
    const { container } = renderControls();
    const b = btn(container, 'mapControls.myLocation');
    expect(b).not.toBeNull();
    expect(b).not.toHaveClass('from-emerald-600');
    expect(b).toHaveAttribute('aria-pressed', 'false');
  });

  it('нажатие вызывает onLocate, но не включает автоцентр', () => {
    const onLocate = vi.fn();
    const onToggleAutoCenter = vi.fn();
    const { container } = renderControls({ onLocate, onToggleAutoCenter });
    const b = btn(container, 'mapControls.myLocation');
    expect(b).not.toBeUndefined();
    fireEvent.click(b);
    expect(onLocate).toHaveBeenCalledTimes(1);
    expect(onToggleAutoCenter).not.toHaveBeenCalled();
  });

  it('во время определения кнопка отображает состояние загрузки (спиннер + aria-pressed)', () => {
    geo.getCurrentPosition.mockImplementation(() => {}); // запрос «висит»
    const { container } = renderControls();
    fireEvent.click(btn(container, 'mapControls.myLocation'));
    const b = btn(container, 'mapControls.myLocation');
    expect(b).toHaveAttribute('aria-pressed', 'true');
    expect(b.querySelector('svg')).toHaveClass('animate-spin');
    geo.getCurrentPosition.mock.calls[0][1]({ code: 1 }); // сброс блокировки
  });

  it('повторные нажатия во время ожидания не запускают повторный getCurrentPosition', () => {
    geo.getCurrentPosition.mockImplementation(() => {});
    const { container } = renderControls();
    const b = btn(container, 'mapControls.myLocation');
    fireEvent.click(b);
    fireEvent.click(b);
    fireEvent.click(b);
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    geo.getCurrentPosition.mock.calls[0][1]({ code: 1 });
    // повторное нажатие после сброса блокировки — новый запрос разрешен
    fireEvent.click(b);
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('отказ в разрешении (код 1) — понятная ошибка', () => {
    geo.getCurrentPosition.mockImplementation((_s, err) => err({ code: 1 }));
    const { container } = renderControls();
    fireEvent.click(btn(container, 'mapControls.myLocation'));
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(errToast.mock.calls.some((args) => String(args[0]).includes('геолокации'))).toBe(true);
    geo.getCurrentPosition.mock.calls[0][1]({ code: 1 });
  });

  it('тайм-аут GPS (код 3) — отдельное понятное сообщение', () => {
    geo.getCurrentPosition.mockImplementation((_s, err) => err({ code: 3 }));
    const { container } = renderControls();
    fireEvent.click(btn(container, 'mapControls.myLocation'));
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(errToast.mock.calls[0][0]).toContain('время ожидания ГПС');
  });
});

describe('MapControls — переключатели (autoCenter и др.)', () => {
  it('автоцентр включается/выключается через onToggleAutoCenter, aria-pressed следует за состоянием', () => {
    const onToggleAutoCenter = vi.fn();
    const { container, rerender } = renderControls({ autoCenter: false, onToggleAutoCenter });

    fireEvent.click(btn(container, 'Ещё — трафик, транспорт, авто-центр'));
    const acBtn = btn(container, 'Авто-центр');
    expect(acBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(acBtn);
    expect(onToggleAutoCenter).toHaveBeenCalledTimes(1);

    rerender(
      <MapControls
        tileIndex={0} setTileIndex={vi.fn()} finderActive={false} onFinderToggle={vi.fn()}
        onShareTrip={vi.fn()} rightOffset={0} isNavigating={false} onLocate={vi.fn()}
        autoCenter={true} onToggleAutoCenter={onToggleAutoCenter}
        overviewActive={false} onToggleOverview={vi.fn()}
        showTraffic={false} onToggleTraffic={vi.fn()}
        showTransport={false} onToggleTransport={vi.fn()}
      />,
    );
    expect(btn(container, 'Авто-центр')).toHaveAttribute('aria-pressed', 'true');
    expect(btn(container, 'Авто-центр')).toHaveClass('!bg-emerald-600');
  });

  it('кнопка «Ещё» подсвечивается, если включен автоцентр (и меню закрыто)', () => {
    const { container } = renderControls({ autoCenter: true });
    const more = btn(container, 'Ещё — трафик, транспорт, авто-центр');
    expect(more).toHaveClass('!bg-slate-700');
    expect(more).toHaveAttribute('aria-pressed', 'true');
  });

  it('закрытие меню «Ещё» не сбрасывает autoCenter (нет второй копии состояния)', () => {
    const onToggleAutoCenter = vi.fn();
    const { container, rerender } = renderControls({ autoCenter: true, onToggleAutoCenter });
    const more = btn(container, 'Ещё — трафик, транспорт, авто-центр');
    fireEvent.click(more);
    fireEvent.click(more);
    rerender(
      <MapControls
        tileIndex={0} setTileIndex={vi.fn()} finderActive={false} onFinderToggle={vi.fn()}
        onShareTrip={vi.fn()} rightOffset={0} isNavigating={false} onLocate={vi.fn()}
        autoCenter={true} onToggleAutoCenter={onToggleAutoCenter}
        overviewActive={false} onToggleOverview={vi.fn()}
        showTraffic={false} onToggleTraffic={vi.fn()}
        showTransport={false} onToggleTransport={vi.fn()}
      />,
    );
    expect(onToggleAutoCenter).not.toHaveBeenCalled();
    fireEvent.click(btn(container, 'Ещё — трафик, транспорт, авто-центр'));
    expect(btn(container, 'Авто-центр')).toHaveAttribute('aria-pressed', 'true');
  });

  it('все переключатели имеют aria-pressed', () => {
    const { container } = renderControls({
      finderActive: true, showTraffic: true, showTransport: true, autoCenter: true,
    });
    expect(btn(container, 'routeFinder.button')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(btn(container, 'Ещё — трафик, транспорт, авто-центр'));
    expect(btn(container, 'Трафик')).toHaveAttribute('aria-pressed', 'true');
    expect(btn(container, 'Транспорт')).toHaveAttribute('aria-pressed', 'true');
    expect(btn(container, 'Авто-центр')).toHaveAttribute('aria-pressed', 'true');
    expect(btn(container, 'Ещё — трафик, транспорт, авто-центр')).toHaveAttribute('aria-pressed', 'true');
  });
});
