import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/api/supabase';
import { buildOsrmRoute } from '@/lib/osrmClient';
import { cartoRaster, CARTO_ATTRIBUTION } from '@/lib/tiles';
import {
  Clock, CheckCircle, Search, Truck, Navigation, MapPin, Package,
  XCircle, AlertTriangle, RefreshCw, Loader2, Star, ArrowLeft,
} from 'lucide-react';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const STATUS_MAP = {
  pending: { label: 'Ожидает', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  confirmed: { label: 'Подтверждён', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400', icon: CheckCircle },
  searching_courier: { label: 'Поиск курьера', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Search },
  courier_assigned: { label: 'Курьер назначен', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', icon: Truck },
  courier_to_pickup: { label: 'Едет за грузом', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400', icon: Navigation },
  arrived_pickup: { label: 'Прибыл за грузом', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400', icon: MapPin },
  picked_up: { label: 'Груз забран', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: Package },
  courier_to_customer: { label: 'Везёт клиенту', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', icon: Navigation },
  arrived_customer: { label: 'Прибыл клиенту', color: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400', icon: MapPin },
  delivered: { label: 'Доставлен', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
  cancelled: { label: 'Отменён', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
  failed: { label: 'Ошибка', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400', icon: AlertTriangle },
};

const pickupIcon = L.divIcon({
  html: '<div style="width:16px;height:16px;background:#15803d;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.35);"></div>',
  className: '',
  iconAnchor: [8, 8],
});
const dropoffIcon = L.divIcon({
  html: '<div style="width:16px;height:16px;background:#b91c1c;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.35);"></div>',
  className: '',
  iconAnchor: [8, 8],
});
const courierIcon = L.divIcon({
  html: '<div style="background:#1565C0;color:#fff;padding:4px 8px;border-radius:8px;font-weight:700;font-size:12px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid #fff;">Курьер</div>',
  className: '',
  iconAnchor: [24, 12],
});

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) {
      map.fitBounds(points, { padding: [48, 48] });
    } else if (points.length === 1) {
      map.setView(points[0], 14);
    }
  }, [map, points]);
  return null;
}

export default function DeliveryTracking() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [routePath, setRoutePath] = useState([]);
  const pollRef = useRef(null);

  const fetchTracking = useCallback(async () => {
    if (!token) return;
    const { data: result, error } = await supabase.rpc('get_delivery_tracking', {
      p_token: token,
    });
    if (error) {
      setLoading(false);
      return;
    }
    if (!result || result.found === false) {
      setNotFound(true);
      setData(null);
      setLoading(false);
      return;
    }
    setNotFound(false);
    setData(result);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchTracking();
    pollRef.current = setInterval(fetchTracking, 15000);
    return () => clearInterval(pollRef.current);
  }, [fetchTracking]);

  useEffect(() => {
    if (!data?.pickup_lat || !data?.dropoff_lat) return;
    let cancelled = false;
    (async () => {
      const route = await buildOsrmRoute(
        { lat: data.pickup_lat, lng: data.pickup_lng },
        { lat: data.dropoff_lat, lng: data.dropoff_lng },
      );
      if (!cancelled && route?.geometry) setRoutePath(route.geometry);
    })();
    return () => { cancelled = true; };
  }, [data?.pickup_lat, data?.pickup_lng, data?.dropoff_lat, data?.dropoff_lng]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-sm w-full bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
            <XCircle className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Ссылка недействительна
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Срок действия отслеживания истёк или ссылка была отозвана.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            <ArrowLeft className="w-4 h-4" />
            На главную
          </Link>
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[data.status] || STATUS_MAP.pending;
  const StatusIcon = statusInfo.icon;
  const courier = data.courier;
  const showCourierMarker =
    courier && typeof courier.lat === 'number' && typeof courier.lng === 'number';

  const boundsPoints = [];
  if (typeof data.pickup_lat === 'number' && typeof data.pickup_lng === 'number') {
    boundsPoints.push([data.pickup_lat, data.pickup_lng]);
  }
  if (typeof data.dropoff_lat === 'number' && typeof data.dropoff_lng === 'number') {
    boundsPoints.push([data.dropoff_lat, data.dropoff_lng]);
  }
  if (showCourierMarker) {
    boundsPoints.push([courier.lat, courier.lng]);
  }

  const mapCenter =
    boundsPoints[0] || [38.5581, 68.7738];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
        <Link
          to="/"
          className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            Доставка {data.order_number ? `#${data.order_number}` : ''}
          </h1>
          {data.public_id && (
            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono truncate">
              {data.public_id}
            </p>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}
        >
          <StatusIcon className="w-3.5 h-3.5" />
          {statusInfo.label}
        </span>
      </header>

      <main className="flex-1 flex flex-col">
        <div className="h-[45vh] min-h-[260px] relative z-0">
          <MapContainer
            center={mapCenter}
            zoom={13}
            className="h-full w-full"
            zoomControl={true}
          >
            <TileLayer
              attribution={CARTO_ATTRIBUTION}
              url={cartoRaster('rastertiles/voyager')}
            />
            <FitBounds points={boundsPoints} />
            {typeof data.pickup_lat === 'number' && (
              <Marker
                position={[data.pickup_lat, data.pickup_lng]}
                icon={pickupIcon}
              >
                <Popup>Забор</Popup>
              </Marker>
            )}
            {typeof data.dropoff_lat === 'number' && (
              <Marker
                position={[data.dropoff_lat, data.dropoff_lng]}
                icon={dropoffIcon}
              >
                <Popup>Доставка</Popup>
              </Marker>
            )}
            {showCourierMarker && (
              <Marker position={[courier.lat, courier.lng]} icon={courierIcon}>
                <Popup>{courier.first_name || 'Курьер'}</Popup>
              </Marker>
            )}
            {routePath.length > 1 && (
              <Polyline
                positions={routePath}
                pathOptions={{ color: '#1565C0', weight: 5, opacity: 0.8 }}
              />
            )}
          </MapContainer>
        </div>

        <div className="flex-1 px-4 py-4 space-y-3 max-w-lg w-full mx-auto">
          {(data.eta_min != null || data.distance_km != null) && (
            <div className="grid grid-cols-2 gap-3">
              {data.eta_min != null && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                    ETA
                  </p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">
                    ~{data.eta_min} мин
                  </p>
                </div>
              )}
              {data.distance_km != null && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                    Расстояние
                  </p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">
                    {Number(data.distance_km).toFixed(1)} км
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            <div className="flex items-start gap-3 p-3">
              <span className="mt-0.5 w-3 h-3 rounded-full bg-green-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">Забор</p>
                <p className="text-sm text-slate-900 dark:text-white">
                  {data.pickup_address || '—'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3">
              <span className="mt-0.5 w-3 h-3 rounded-full bg-red-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Доставка
                </p>
                <p className="text-sm text-slate-900 dark:text-white">
                  {data.dropoff_address || '—'}
                </p>
              </div>
            </div>
          </div>

          {courier && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {courier.first_name || 'Курьер'}
                </p>
                {courier.rating != null && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    {Number(courier.rating).toFixed(1)}
                  </p>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={fetchTracking}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Обновить
          </button>

          <p className="text-center text-xs text-slate-400 dark:text-slate-600 pb-2">
            Обновляется автоматически каждые 15 секунд
          </p>
        </div>
      </main>
    </div>
  );
}
