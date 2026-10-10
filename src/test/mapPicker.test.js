import { describe, it, expect, vi, afterEach } from 'vitest';
import { mountMap } from '@/widget/mapPicker';

/** Фейковый Leaflet: фиксирует, как создаётся маркер, отдаёт обработчик клика. */
function makeL() {
  const calls = { marker: [] };
  const handlers = {};
  const markerObj = { addTo: () => markerObj, on: vi.fn(), setLatLng: vi.fn() };
  const mapObj = {
    setView: vi.fn(),
    on: (ev, fn) => { handlers[ev] = fn; },
    invalidateSize: vi.fn(),
  };
  return {
    divIcon: (opts) => ({ ...opts }),
    marker: (latlng, opts) => { calls.marker.push({ latlng, opts }); return markerObj; },
    map: () => mapObj,
    tileLayer: () => ({ addTo: vi.fn() }),
    calls,
    handlers,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mountMap: маркер пина', () => {
  it('использует divIcon с инлайн-SVG — без картинок с unpkg', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); })); // реверс-геокодинг вне теста
    const L = makeL();
    const container = document.createElement('div');
    document.body.append(container);
    const shadow = document.createElement('div'); // нужен только ownerDocument для CSS-линка

    await mountMap({
      shadow,
      container,
      center: [38.5581, 68.7738],
      doc: document,
      onPick: vi.fn(),
      leaflet: L,
    });

    // пин создаётся при первом клике по карте
    expect(L.handlers.click).toBeTypeOf('function');
    L.handlers.click({ latlng: { lat: 38.56, lng: 68.78 } });

    expect(L.calls.marker).toHaveLength(1);
    const { opts } = L.calls.marker[0];
    expect(opts.draggable).toBe(true);
    expect(opts.icon).toBeTruthy();
    expect(opts.icon.className).toBe('kw-pin');
    expect(opts.icon.html).toContain('<svg');
    expect(opts.icon.html).not.toContain('http'); // никаких внешних изображений
  });
});
