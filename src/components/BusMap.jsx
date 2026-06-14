import 'leaflet/dist/leaflet.css';
import { getNextStopEta } from '@/utils/eta';
import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import MapControls, { TILE_LAYERS } from './MapControls';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { supabase } from '@/api/supabase';
import { toast } from 'sonner';

// Inject CSS to hide leaflet attribution
const style = document.createElement('style');
style.textContent = '.leaflet-control-attribution { display: none !important; } .leaflet-control-zoom { display: none !important; }';
document.head.appendChild(style);

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapController({ center }) {
  const map = useMap();
  const lat = center?.[0];
  const lng = center?.[1];
  useEffect(() => {
    if (lat && lng) map.setView([lat, lng], 13);
  }, [lat, lng]);
  return null;
}

function createBusIcon(routeNumber, type) {
  const color = type === 'minibus' ? '#2e7d32' : '#1565c0';
  const glow = type === 'minibus' ? 'rgba(46,125,50,0.3)' : 'rgba(21,101,192,0.3)';

  return L.divIcon({
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
      <div style="
        background:${color};
        border-radius:14px;
        width:46px;
        height:36px;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        box-shadow:0 4px 16px ${glow}, 0 1px 4px rgba(0,0,0,0.2);
        border:2.5px solid rgba(255,255,255,0.9);
        position:relative;
        z-index:1;
        gap:1px;
      ">
        <span style="color:#fff;font-size:11px;font-weight:800;line-height:1;letter-spacing:-0.5px;">#${routeNumber}</span>
        <span style="color:rgba(255,255,255,0.75);font-size:8px;font-weight:500;">${type === 'minibus' ? 'Маршр.' : 'Автобус'}</span>
      </div>
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${color};margin-top:-1px;"></div>
    </div>`,
    className: '',
    iconSize: [46, 50],
    iconAnchor: [23, 50],
  });
}

function AnimatedVehicleMarker({ vehicle, route, getEtaLabel }) {
  const { user, refetch } = useCurrentUser();
  const [pos, setPos] = useState([vehicle.lat, vehicle.lng]);
  const [paying, setPaying] = useState(false);
  const targetRef = useRef([vehicle.lat, vehicle.lng]);
  const currentRef = useRef([vehicle.lat, vehicle.lng]);
  const rafRef = useRef(null);
  const DURATION = 4000;

  useEffect(() => {
    const newTarget = [vehicle.lat, vehicle.lng];
    if (newTarget[0] === targetRef.current[0] && newTarget[1] === targetRef.current[1]) return;

    const startPos = [...currentRef.current];
    const endPos = newTarget;
    targetRef.current = newTarget;

    const start = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const animate = (now) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / DURATION, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const lat = startPos[0] + (endPos[0] - startPos[0]) * ease;
      const lng = startPos[1] + (endPos[1] - startPos[1]) * ease;
      currentRef.current = [lat, lng];
      setPos([lat, lng]);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [vehicle.lat, vehicle.lng]);

  const handlePay = async () => {
    if (!user) {
      toast.error('Войдите в аккаунт, чтобы оплатить проезд');
      return;
    }
    if (!user.phone) {
      toast.error('Пожалуйста, добавьте номер телефона в профиле перед оплатой.');
      return;
    }

    const fare = vehicle.type === 'minibus' ? 3.00 : 2.50;
    const userBalance = Number(user.balance || 0);

    if (userBalance < fare) {
      toast.error(`Недостаточно средств. Стоимость: ${fare} TJS. Ваш баланс: ${userBalance.toFixed(2)} TJS.`);
      return;
    }

    if (window.confirm(`Оплатить проезд на маршруте #${vehicle.route_number} стоимостью ${fare} TJS?`)) {
      setPaying(true);
      try {
        const { data, error } = await supabase.rpc('create_payment', {
          driver_id: vehicle.driver_id,
          amount: fare
        });
        if (error) throw new Error(error.message);
        toast.success('Запрос на оплату отправлен водителю! Ожидайте подтверждения.');
        refetch(); // Обновляем баланс в кэше/стейтах
      } catch (err) {
        toast.error(err.message || 'Ошибка отправки оплаты');
      } finally {
        setPaying(false);
      }
    }
  };

  const icon = createBusIcon(vehicle.route_number || '?', vehicle.type);
  const eta = getEtaLabel(vehicle);

  return (
    <Marker position={pos} icon={icon}>
      <Popup className="custom-popup">
        <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 160 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ background: vehicle.type === 'minibus' ? '#e8f5e9' : '#e3f2fd', borderRadius: 8, padding: '4px 10px' }}>
              <span style={{ color: vehicle.type === 'minibus' ? '#2e7d32' : '#1565c0', fontWeight: 800, fontSize: 15 }}>
                #{vehicle.route_number}
              </span>
            </div>
            <span style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>{vehicle.type === 'minibus' ? 'Маршрутка' : 'Автобус'}</span>
          </div>
          {vehicle.driver_name && <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>👤 {vehicle.driver_name}</div>}
          {vehicle.vehicle_number && <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>🚌 № {vehicle.vehicle_number}</div>}
          {vehicle.speed > 0 && <div style={{ fontSize: 12, color: '#999' }}>⚡ {Math.round(vehicle.speed)} км/ч</div>}
          {eta && (
            <div style={{ marginTop: 8, background: '#e3f2fd', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: '#1565c0', fontWeight: 600 }}>
              ⏱ {eta.stop?.name ? `${eta.stop.name}: ` : ''}{eta.etaMinutes} мин
            </div>
          )}

          {user && vehicle.driver_id && user.id !== vehicle.driver_id && (
            <button
              disabled={paying}
              onClick={handlePay}
              style={{
                width: '100%',
                marginTop: 10,
                background: '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                padding: '8px 12px',
                fontSize: 12,
                fontWeight: 750,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                boxShadow: '0 2px 6px rgba(22,163,74,0.3)',
                transition: 'all 0.2s',
              }}
              className="hover:bg-green-700 active:scale-95 disabled:opacity-50"
            >
              {paying ? 'Отправка...' : `Оплатить ${vehicle.type === 'minibus' ? '3.00' : '2.50'} TJS`}
            </button>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

export default function BusMap({ vehicles = [], route = null, center = [38.559, 68.773], watchedStop = null }) {
  const [tileIndex, setTileIndex] = useState(0);
  const getEtaLabel = (vehicle) => getNextStopEta(vehicle, route) || null;
  const polyline = route?.stops?.length > 1 ? route.stops.map(s => [s.lat, s.lng]) : null;

  return (
    <div className="w-full h-full dark:bg-gray-800">
    <MapContainer
      center={center}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        attribution=""
        url={TILE_LAYERS[tileIndex].url}
      />
      <MapController center={center} />
      <MapControls tileIndex={tileIndex} setTileIndex={setTileIndex} />

      {polyline && (
        <Polyline
          positions={polyline}
          color={route.color || '#1565C0'}
          weight={5}
          opacity={0.85}
          dashArray={null}
        />
      )}

      {route?.stops?.map((stop, index) => {
        if (!stop.lat || !stop.lng) return null;
        const total = route.stops.length;
        const remaining = total - 1 - index;
        const isFirst = index === 0;
        const isLast = index === total - 1;
        const isWatched = watchedStop &&
          Math.abs(stop.lat - watchedStop.lat) < 0.0001 &&
          Math.abs(stop.lng - watchedStop.lng) < 0.0001;

        const dotColor = isWatched ? '#FF6D00' : isFirst ? '#2e7d32' : isLast ? '#c62828' : '#1565C0';
        const dotSize = isWatched ? 20 : (isFirst || isLast) ? 16 : 11;

        const icon = L.divIcon({
          html: `<div style="
            width:${dotSize}px;height:${dotSize}px;border-radius:50%;
            background:${dotColor};
            border:2.5px solid #fff;
            box-shadow:0 2px 8px rgba(0,0,0,0.25);
            ${isWatched ? 'outline: 3px solid rgba(255,109,0,0.35);' : ''}
          "></div>`,
          className: '',
          iconSize: [dotSize, dotSize],
          iconAnchor: [dotSize / 2, dotSize / 2],
        });

        return (
          <Marker key={`stop-${index}`} position={[stop.lat, stop.lng]} icon={icon}>
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 140 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{stop.name || `Остановка ${index + 1}`}</div>
                <div style={{ fontSize: 11, color: '#888' }}>Остановка {index + 1} из {total}</div>
                <div style={{ marginTop: 6, fontSize: 11, padding: '3px 8px', borderRadius: 6, display: 'inline-block',
                  background: remaining > 0 ? '#e3f2fd' : '#e8f5e9',
                  color: remaining > 0 ? '#1565c0' : '#2e7d32',
                  fontWeight: 600,
                }}>
                  {remaining > 0 ? `До конца: ${remaining} ост.` : 'Конечная остановка'}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {vehicles.filter(v => v.lat && v.lng).map(v => (
        <AnimatedVehicleMarker key={v.id} vehicle={v} route={route} getEtaLabel={getEtaLabel} />
      ))}
    </MapContainer>
    </div>
  );
}