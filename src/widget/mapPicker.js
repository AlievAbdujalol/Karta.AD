/**
 * mapPicker — карта выбора адреса доставки внутри Shadow DOM.
 * Leaflet подгружается с unpkg (на чужом хостинге своего бандла нет),
 * тайлы — общий конвиг Karta-AD (lib/tiles: CARTO с ключом → OSM).
 * При любой ошибке — фолбэк на ручной ввод адреса.
 */
import { reverseGeocodeUrl, pickAddressText } from '@/lib/geo';
import { cartoRaster, CARTO_ATTRIBUTION } from '@/lib/tiles';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let leafletPromise = null;

/** Ленивая загрузка Leaflet (скрипт — в document, CSS — в shadow root вызывающего). */
export function loadLeaflet(doc) {
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  if (!win) return Promise.reject(new Error('no window'));
  if (win.L) return Promise.resolve(win.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = LEAFLET_JS;
    s.async = true;
    s.onload = () => (win.L ? resolve(win.L) : reject(new Error('leaflet missing')));
    s.onerror = () => reject(new Error('leaflet load failed'));
    (doc.head || doc.documentElement).appendChild(s);
  }).catch((e) => {
    leafletPromise = null;
    throw e;
  });
  return leafletPromise;
}

function ensureCss(shadow) {
  if (shadow.querySelector('link[data-kw-leaflet]')) return;
  const link = shadow.ownerDocument.createElement('link');
  link.rel = 'stylesheet';
  link.href = LEAFLET_CSS;
  link.setAttribute('data-kw-leaflet', '1');
  shadow.appendChild(link);
}

/**
 * Рисует карту в container (внутри shadow root).
 * Клик/перетаскивание пина → onPick({lat, lng, address}) — address best-effort.
 * Ошибка загрузки → onFail() (контейнер заменяется текстом-фолбэком).
 */
export async function mountMap({ shadow, container, center, doc, onPick, onFail = () => {} }) {
  try {
    ensureCss(shadow);
    const L = await loadLeaflet(doc);
    if (!container.isConnected) return; // пользователь закрыл форму, пока грузилась карта

    const map = L.map(container, { zoomControl: false, attributionControl: false, scrollWheelZoom: true });
    map.setView(center, 14);
    L.tileLayer(cartoRaster('rastertiles/voyager'), {
      maxZoom: 19,
      attribution: CARTO_ATTRIBUTION,
    }).addTo(map);

    let marker = null;
    const emit = async (latlng) => {
      const lat = Math.round(latlng.lat * 1e6) / 1e6;
      const lng = Math.round(latlng.lng * 1e6) / 1e6;
      if (marker) marker.setLatLng(latlng);
      else {
        marker = L.marker(latlng, { draggable: true }).addTo(map);
        marker.on('dragend', (e) => emit(e.target.getLatLng()));
      }

      let address = '';
      try {
        const url = reverseGeocodeUrl(lat, lng);
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (res.ok) address = pickAddressText(await res.json(), '');
      } catch {
        // Nominatim недоступен — остаёмся на ручном вводе адреса
      }
      onPick({ lat, lng, address });
    };

    map.on('click', (e) => emit(e.latlng));
    doc.defaultView?.setTimeout?.(() => map.invalidateSize(), 60);
  } catch {
    onFail();
  }
}
