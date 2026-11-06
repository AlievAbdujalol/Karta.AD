/**
 * Слои карты: вместо циклического переключения — удобный список.
 *
 * Жалоба пользователя (06.11.2026): кнопка слоёв (бейдж «2» на правой рейке)
 * переключала слой по одному за клик — выбрать нужный из девяти приходилось
 * нажимать многократно. Ожидаемое поведение: клик открывает список всех слоёв
 * с названиями, текущий помечен, выбор — один тап.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import MapControls, { TILE_LAYERS } from '@/components/MapControls';

// react-leaflet без настоящей карты — useMap только выдаёт объект с flyTo.
vi.mock('react-leaflet', () => ({
  useMap: () => ({ flyTo: vi.fn() }),
}));

// i18n без инициализации — t возвращает ключ (названия слоёв = labelKey).
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

function renderControls(props = {}) {
  const {
    tileIndex = 0, setTileIndex = vi.fn(),
    finderActive = false, onFinderToggle = vi.fn(),
    onShareTrip = vi.fn(), rightOffset = 0, isNavigating = false,
    autoCenter = false, onToggleAutoCenter = vi.fn(),
    overviewActive = false, onToggleOverview = vi.fn(),
    showTraffic = false, onToggleTraffic = vi.fn(),
    showTransport = false, onToggleTransport = vi.fn(),
  } = props;
  return render(
    <MapControls
      tileIndex={tileIndex} setTileIndex={setTileIndex}
      finderActive={finderActive} onFinderToggle={onFinderToggle}
      onShareTrip={onShareTrip} rightOffset={rightOffset}
      isNavigating={isNavigating}
      autoCenter={autoCenter} onToggleAutoCenter={onToggleAutoCenter}
      overviewActive={overviewActive} onToggleOverview={onToggleOverview}
      showTraffic={showTraffic} onToggleTraffic={onToggleTraffic}
      showTransport={showTransport} onToggleTransport={onToggleTransport}
    />,
  );
}

// Десктопная и мобильная рейки обе в DOM (различаются только CSS-классом) —
// работаем с первой (десктопной) копией, как делают существующие тесты.
const layerBtn = (container) =>
  Array.from(container.querySelectorAll('button'))
    .find((b) => (b.getAttribute('title') || '').startsWith('mapControls.layerLabel'));

const layerRoot = (container) => layerBtn(container)?.closest('[data-layer-menu-root]');

const menuItems = (container) =>
  Array.from(layerRoot(container)?.querySelectorAll('[data-layer-menu] [aria-pressed]') || []);

const menuOpen = (container) =>
  Boolean(layerRoot(container)?.querySelector('[data-layer-menu]'));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('MapControls — список слоёв вместо циклического переключения', () => {
  it('клик по кнопке слоёв открывает список из всех 9 названий', () => {
    const { container } = renderControls();
    expect(menuOpen(container)).toBe(false);

    fireEvent.click(layerBtn(container));

    const items = menuItems(container);
    expect(items).toHaveLength(TILE_LAYERS.length);
    expect(items).toHaveLength(9);
    // Названия — это labelKey каждого слоя (t в тесте = идентичность)
    const texts = items.map((el) => el.textContent);
    for (const layer of TILE_LAYERS) {
      expect(texts.some((tx) => tx.includes(layer.labelKey))).toBe(true);
    }
  });

  it('открытие списка НЕ переключает слой — setTileIndex не вызывается', () => {
    const setTileIndex = vi.fn();
    const { container } = renderControls({ setTileIndex });
    fireEvent.click(layerBtn(container));
    expect(setTileIndex).not.toHaveBeenCalled();
  });

  it('текущий слой помечен выбранным (aria-pressed), остальные — нет', () => {
    const { container } = renderControls({ tileIndex: 4 });
    fireEvent.click(layerBtn(container));
    const items = menuItems(container);
    expect(items[4].getAttribute('aria-pressed')).toBe('true');
    expect(items.filter((el) => el.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(items[0].getAttribute('aria-pressed')).toBe('false');
    expect(items[8].getAttribute('aria-pressed')).toBe('false');
  });

  it('тап по слою выбирает его (setTileIndex с индексом) и закрывает список', () => {
    const setTileIndex = vi.fn();
    const { container } = renderControls({ setTileIndex });
    fireEvent.click(layerBtn(container));
    fireEvent.click(menuItems(container)[7]);
    expect(setTileIndex).toHaveBeenCalledTimes(1);
    expect(setTileIndex).toHaveBeenCalledWith(7);
    expect(menuOpen(container)).toBe(false);
  });

  it('повторный клик по кнопке слоёв закрывает список', () => {
    const { container } = renderControls();
    const b = layerBtn(container);
    fireEvent.click(b);
    expect(menuOpen(container)).toBe(true);
    fireEvent.click(b);
    expect(menuOpen(container)).toBe(false);
  });

  it('клик вне списка (по карте/документу) закрывает его', () => {
    const { container } = renderControls();
    fireEvent.click(layerBtn(container));
    expect(menuOpen(container)).toBe(true);
    fireEvent.mouseDown(document.body);
    expect(menuOpen(container)).toBe(false);
  });

  it('Escape закрывает список', () => {
    const { container } = renderControls();
    fireEvent.click(layerBtn(container));
    expect(menuOpen(container)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menuOpen(container)).toBe(false);
  });

  it('кнопка имеет aria-expanded, отражающий состояние списка', () => {
    const { container } = renderControls();
    const b = layerBtn(container);
    expect(b.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(b);
    expect(b.getAttribute('aria-expanded')).toBe('true');
  });
});
