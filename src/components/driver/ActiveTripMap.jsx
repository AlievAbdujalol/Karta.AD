import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { cartoRaster, CARTO_ATTRIBUTION } from '@/lib/tiles';
import { formatDistanceM } from '@/lib/trackingLogic';

/** Кэш дорожной геометрии маршрутов (module-level — переживает ререндеры). */
const geomCache = new Map();
/** Таймаут запроса дорожной линии к OSRM — иначе висит до размонтирования. */
const OSRM_TIMEOUT_MS = 8_000;

const isValidLatLng = (lat, lng) =>
  Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
  && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180
  && !(Number(lat) === 0 && Number(lng) === 0);

function dotIcon(bg, size = 12, ring = '#fff') {
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid ${ring};box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const busIcon = L.divIcon({
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const ownIcon = L.divIcon({
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#16a34a;border:3px solid #fff;box-shadow:0 0 0 4px rgba(22,163,74,0.25);"></div>`,
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

/** Вписывает все точки (маршрут + позиции машин) в видимую область. */
function FitAll({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    try {
      if (points.length === 1) map.setView(points[0], 15, { animate: false });
      else map.fitBounds(L.latLngBounds(points), { padding: [24, 24], animate: false });
    } catch { /* карта ещё не готова */ }
    // points собирается каждый ререндер — ключуем по строке координат
  }, [points.map((p) => p.join(',')).join('|'), map]);
  return null;
}

/**
 * Карта активного рейса водителя: линия маршрута (OSRM с фолбэком на
 * прямые линии между остановками), текущая позиция водителя и живые
 * машины того же маршрута. Без слоёв поиска/навигации — только рейс.
 */
export default function ActiveTripMap({ route, position, buses = [], lang = 'ru' }) {
  const stops = useMemo(
    () => (Array.isArray(route?.stops)
      ? route.stops.filter((s) => isValidLatLng(s?.lat, s?.lng))
      : []),
    [route],
  );

  const [geometry, setGeometry] = useState(null);

  const stopKey = useMemo(
    () => stops.map((s) => `${Number(s.lat).toFixed(5)},${Number(s.lng).toFixed(5)}`).join('|'),
    [stops],
  );

  // Дорожная линия из OSRM; при недоступности — фолбэк на точки остановок
  useEffect(() => {
    if (stops.length < 2) {
      setGeometry(null);
      return undefined;
    }
    const cached = geomCache.get(stopKey);
    if (cached) {
      setGeometry(cached);
      return undefined;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), OSRM_TIMEOUT_MS);
    (async () => {
      try {
        const coords = stops
          .map((s) => `${Number(s.lng).toFixed(6)},${Number(s.lat).toFixed(6)}`)
          .join(';');
        const resp = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
          { signal: ctrl.signal },
        );
        if (!resp.ok) return;
        const data = await resp.json();
        const raw = data.routes?.[0]?.geometry?.coordinates;
        if (!Array.isArray(raw) || raw.length < 2) return;
        const positions = raw
          .map(([lng, lat]) => (isValidLatLng(lat, lng) ? [Number(lat), Number(lng)] : null))
          .filter(Boolean);
        if (positions.length < 2 || cancelled) return;
        geomCache.set(stopKey, positions);
        setGeometry(positions);
      } catch (e) {
        if (e?.name !== 'AbortError') {
          console.warn('[ActiveTripMap] OSRM недоступен, рисуем линию по остановкам', e?.message);
        }
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(timeoutId);
    };
  }, [stopKey, stops]);

  // Камера вписывает маршрут один раз при смене остановок: позиция GPS и
  // машины обновляются каждые секунды — fitBounds на каждый фикс дёргал
  // бы карту и делал панорамирование невозможным. Если остановок нет —
  // фитим по первой зафиксированной позиции.
  const firstPosRef = useRef(null);
  const fitPoints = useMemo(() => {
    if (stops.length) return stops.map((s) => [s.lat, s.lng]);
    if (!firstPosRef.current && isValidLatLng(position?.lat, position?.lng)) {
      firstPosRef.current = [position.lat, position.lng];
    }
    return firstPosRef.current ? [firstPosRef.current] : [];
    // stopKey покрывает смену набора остановок
  }, [stopKey, position?.lat, position?.lng]);

  if (!stops.length && !position) return null;

  // Фолбэк-линия: прямые сегменты между остановками
  const line = geometry || (stops.length >= 2 ? stops.map((s) => [s.lat, s.lng]) : null);

  const center = isValidLatLng(position?.lat, position?.lng)
    ? [position.lat, position.lng]
    : stops.length
      ? [stops[0].lat, stops[0].lng]
      : [40.28, 69.62];

  return (
    <div className="w-full h-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-200">
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url={cartoRaster('rastertiles/voyager')} attribution={CARTO_ATTRIBUTION} />
        <FitAll points={fitPoints} />
        {line && (
          <Polyline
            positions={line}
            pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.85 }}
          />
        )}
        {stops.length > 0 && (
          <>
            <Marker
              position={[stops[0].lat, stops[0].lng]}
              icon={dotIcon('#22c55e', 14)}
              interactive={false}
              keyboard={false}
            />
            <Marker
              position={[stops[stops.length - 1].lat, stops[stops.length - 1].lng]}
              icon={dotIcon('#ef4444', 14)}
              interactive={false}
              keyboard={false}
            />
          </>
        )}
        {buses.map((bus) => (
          <Marker key={bus.id} position={[bus.lat, bus.lng]} icon={busIcon}>
            <Popup>
              <div className="text-xs font-bold space-y-0.5">
                <div>{bus.vehicleNumber || '—'}</div>
                {Number.isFinite(bus.distanceM) && (
                  <div className="font-medium text-slate-500">
                    {formatDistanceM(bus.distanceM, lang)}
                    {Number.isFinite(bus.etaMinutes) ? ` · ≈${bus.etaMinutes} мин` : ''}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
        {isValidLatLng(position?.lat, position?.lng) && (
          <Marker
            position={[position.lat, position.lng]}
            icon={ownIcon}
            interactive={false}
            keyboard={false}
          />
        )}
      </MapContainer>
    </div>
  );
}
